"""
AR (Accounts Receivable) Journal Service
Double-entry postings for Invoice (Dr AR, Cr Revenue) and Payment (Dr Bank, Cr AR).
Integrates with accounting_journal_entries and accounting_journal_lines.
"""

from datetime import datetime, timezone
from bson import ObjectId

from services.number_sequence_service import next_sequence_value

JOURNAL_ENTRIES_COLLECTION = "accounting_journal_entries"
JOURNAL_LINES_COLLECTION = "accounting_journal_lines"
AR_ACCOUNT_CODE = "1200"
AR_ACCOUNT_NAME = "Accounts Receivable (AR)"


async def get_or_create_ar_account(db):
    """Get or create the single AR asset account. Returns str id."""
    acc = await db.bank_accounts.find_one({"account_code": AR_ACCOUNT_CODE})
    if acc:
        return str(acc["_id"])
    now = datetime.now(timezone.utc)
    doc = {
        "name": AR_ACCOUNT_NAME,
        "account_type": "current",
        "description": "Akaun belum terima - yuran pelajar (sub-ledger per pelajar)",
        "is_active": True,
        "is_system_default": False,
        "is_ar_account": True,
        "account_code": AR_ACCOUNT_CODE,
        "created_at": now,
        "created_by": None,
        "created_by_name": "Sistem",
    }
    result = await db.bank_accounts.insert_one(doc)
    return str(result.inserted_id)


async def generate_ar_journal_entry_number(db):
    """Format: JE-AR-YYYY-XXXX"""
    year = datetime.now().year
    prefix = f"JE-AR-{year}-"

    sequence_value = await next_sequence_value(
        db,
        sequence_key=f"ar.journal_entry.{year}",
        start_at=1,
    )
    if sequence_value is not None:
        return f"{prefix}{sequence_value:04d}"

    latest = await db[JOURNAL_ENTRIES_COLLECTION].find_one(
        {"entry_number": {"$regex": f"^{prefix}"}},
        sort=[("entry_number", -1)]
    )
    if latest and latest.get("entry_number"):
        try:
            last_num = int(latest["entry_number"].split("-")[-1])
            new_num = last_num + 1
        except Exception:
            new_num = 1
    else:
        new_num = 1
    return f"{prefix}{new_num:04d}"


async def post_ar_invoice(
    db,
    student_yuran_id: str,
    amount: float,
    category_id: str,
    description: str,
    reference: str,
    created_by=None,
    created_by_name: str = "",
):
    """
    Post journal for new invoice (student_yuran created).
    Dr Accounts Receivable, Cr Revenue (category).
    Returns journal_entry_id or None.
    """
    if amount <= 0 or not category_id:
        return None
    ar_account_id = await get_or_create_ar_account(db)
    category_id = str(category_id)
    now = datetime.now(timezone.utc)
    entry_number = await generate_ar_journal_entry_number(db)

    entry_doc = {
        "entry_number": entry_number,
        "transaction_id": None,
        "transaction_date": now.strftime("%Y-%m-%d"),
        "description": description[:500] if description else "Invoice yuran",
        "source": "system",
        "source_ref": {
            "module": "ar",
            "student_yuran_id": str(student_yuran_id),
            "type": "invoice",
        },
        "reference_number": reference,
        "status": "verified",
        "created_at": now,
        "created_by": created_by,
        "created_by_name": created_by_name or "Sistem",
    }
    entry_result = await db[JOURNAL_ENTRIES_COLLECTION].insert_one(entry_doc)
    entry_id = entry_result.inserted_id

    await db[JOURNAL_LINES_COLLECTION].insert_many([
        {
            "journal_entry_id": entry_id,
            "account_type": "ar",
            "account_id": ar_account_id,
            "debit": amount,
            "credit": 0.0,
            "memo": "Invoice yuran pelajar",
            "sort_order": 1,
        },
        {
            "journal_entry_id": entry_id,
            "account_type": "category",
            "account_id": category_id,
            "debit": 0.0,
            "credit": amount,
            "memo": description[:200] if description else "Hasil yuran",
            "sort_order": 2,
        },
    ])
    return str(entry_id)


async def post_ar_payment(
    db,
    amount: float,
    student_yuran_id: str,
    receipt_number: str,
    description: str,
    bank_account_id: str = None,
    created_by=None,
    created_by_name: str = "",
):
    """
    Post journal for payment against AR.
    Dr Bank, Cr Accounts Receivable.
    Returns journal_entry_id or None.
    """
    if amount <= 0:
        return None
    from services.accounting_journal import get_or_create_system_bank_account
    if not bank_account_id:
        bank_account_id = await get_or_create_system_bank_account(db)
    ar_account_id = await get_or_create_ar_account(db)
    bank_account_id = str(bank_account_id)
    now = datetime.now(timezone.utc)
    entry_number = await generate_ar_journal_entry_number(db)

    entry_doc = {
        "entry_number": entry_number,
        "transaction_id": None,
        "transaction_date": now.strftime("%Y-%m-%d"),
        "description": description[:500] if description else "Bayaran yuran",
        "source": "system",
        "source_ref": {
            "module": "ar",
            "student_yuran_id": str(student_yuran_id),
            "type": "payment",
        },
        "reference_number": receipt_number,
        "status": "verified",
        "created_at": now,
        "created_by": created_by,
        "created_by_name": created_by_name or "Sistem",
    }
    entry_result = await db[JOURNAL_ENTRIES_COLLECTION].insert_one(entry_doc)
    entry_id = entry_result.inserted_id

    await db[JOURNAL_LINES_COLLECTION].insert_many([
        {
            "journal_entry_id": entry_id,
            "account_type": "bank",
            "account_id": bank_account_id,
            "debit": amount,
            "credit": 0.0,
            "memo": "Wang masuk - bayaran yuran",
            "sort_order": 1,
        },
        {
            "journal_entry_id": entry_id,
            "account_type": "ar",
            "account_id": ar_account_id,
            "debit": 0.0,
            "credit": amount,
            "memo": "Kurangkan AR",
            "sort_order": 2,
        },
    ])
    return str(entry_id)


async def post_reversal(db, journal_entry_id: str, reason: str, created_by=None, created_by_name: str = ""):
    """
    Create reversal journal entry (opposite debit/credit) for the given AR journal.
    Links to original via source_ref.reverses_entry_id.
    """
    from bson import ObjectId
    entry = await db[JOURNAL_ENTRIES_COLLECTION].find_one({"_id": ObjectId(journal_entry_id)})
    if not entry:
        return None
    lines = await db[JOURNAL_LINES_COLLECTION].find(
        {"journal_entry_id": entry["_id"]}
    ).sort("sort_order", 1).to_list(10)
    if not lines:
        return None
    now = datetime.now(timezone.utc)
    entry_number = await generate_ar_journal_entry_number(db)
    rev_doc = {
        "entry_number": entry_number,
        "transaction_id": None,
        "transaction_date": now.strftime("%Y-%m-%d"),
        "description": f"Pembalikan: {entry.get('description', '')[:200]} - {reason[:200]}",
        "source": "system",
        "source_ref": {
            "module": "ar",
            "type": "reversal",
            "reverses_entry_id": journal_entry_id,
        },
        "reference_number": f"REV-{entry.get('entry_number', '')}",
        "status": "verified",
        "created_at": now,
        "created_by": created_by,
        "created_by_name": created_by_name or "Sistem",
    }
    rev_result = await db[JOURNAL_ENTRIES_COLLECTION].insert_one(rev_doc)
    rev_id = rev_result.inserted_id
    for line in lines:
        await db[JOURNAL_LINES_COLLECTION].insert_one({
            "journal_entry_id": rev_id,
            "account_type": line.get("account_type"),
            "account_id": line.get("account_id"),
            "debit": line.get("credit", 0),
            "credit": line.get("debit", 0),
            "memo": f"Pembalikan: {line.get('memo', '')}",
            "sort_order": line.get("sort_order", 0),
        })
    return str(rev_id)
