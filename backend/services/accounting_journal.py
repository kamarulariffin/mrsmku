"""
Double-entry journal: create journal entry + lines for each accounting transaction.
Sumber tunggal untuk entri jurnal (debit/kredit).
"""

from datetime import datetime, timezone
from bson import ObjectId

JOURNAL_ENTRIES_COLLECTION = "accounting_journal_entries"
JOURNAL_LINES_COLLECTION = "accounting_journal_lines"
SYSTEM_BANK_NAME = "Tunai/Bank Sistem"


async def get_or_create_system_bank_account(db):
    """Get or create default bank account for system postings (e.g. payment_center). Returns str id."""
    acc = await db.bank_accounts.find_one({"is_system_default": True})
    if acc:
        return str(acc["_id"])
    # Create one
    now = datetime.now(timezone.utc)
    doc = {
        "name": SYSTEM_BANK_NAME,
        "account_type": "current",
        "description": "Akaun default untuk catatan sistem (bayaran dalam talian, dll.)",
        "is_active": True,
        "is_system_default": True,
        "account_code": "1100",
        "created_at": now,
        "created_by": None,
        "created_by_name": "Sistem",
    }
    result = await db.bank_accounts.insert_one(doc)
    return str(result.inserted_id)


async def generate_journal_entry_number(db):
    """Format: JE-YYYY-XXXX"""
    year = datetime.now().year
    prefix = f"JE-{year}-"
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


async def create_journal_for_transaction(db, transaction_id: str, tx_doc: dict):
    """
    Create one journal entry with two lines for the given transaction (double-entry).
    - Income: Debit bank (or system bank), Credit category.
    - Expense: Debit category, Credit bank (or system bank).
    """
    tx_type = tx_doc.get("type", "income")
    amount = float(tx_doc.get("amount", 0))
    category_id = tx_doc.get("category_id")
    bank_account_id = tx_doc.get("bank_account_id")
    transaction_date = tx_doc.get("transaction_date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    description = tx_doc.get("description", "")[:500]

    if not category_id or amount <= 0:
        return None

    if not bank_account_id:
        bank_account_id = await get_or_create_system_bank_account(db)
    bank_account_id = str(bank_account_id)
    category_id = str(category_id)

    now = datetime.now(timezone.utc)
    entry_number = await generate_journal_entry_number(db)
    status = tx_doc.get("status", "pending")

    entry_doc = {
        "transaction_id": ObjectId(transaction_id),
        "entry_number": entry_number,
        "transaction_date": transaction_date,
        "description": description,
        "source": tx_doc.get("source", "manual"),
        "source_ref": tx_doc.get("source_ref"),
        "status": status,
        "created_at": now,
        "created_by": tx_doc.get("created_by"),
        "created_by_name": tx_doc.get("created_by_name", ""),
        "verified_by": tx_doc.get("verified_by"),
        "verified_at": tx_doc.get("verified_at"),
    }
    entry_result = await db[JOURNAL_ENTRIES_COLLECTION].insert_one(entry_doc)
    entry_id = entry_result.inserted_id

    if tx_type == "income":
        # Debit: Bank (asset), Credit: Category (income)
        await db[JOURNAL_LINES_COLLECTION].insert_many([
            {
                "journal_entry_id": entry_id,
                "account_type": "bank",
                "account_id": bank_account_id,
                "debit": amount,
                "credit": 0.0,
                "memo": "Wang masuk",
                "sort_order": 1,
            },
            {
                "journal_entry_id": entry_id,
                "account_type": "category",
                "account_id": category_id,
                "debit": 0.0,
                "credit": amount,
                "memo": description[:200] if description else "Hasil",
                "sort_order": 2,
            },
        ])
    else:
        # Expense: Debit: Category (expense), Credit: Bank
        await db[JOURNAL_LINES_COLLECTION].insert_many([
            {
                "journal_entry_id": entry_id,
                "account_type": "category",
                "account_id": category_id,
                "debit": amount,
                "credit": 0.0,
                "memo": description[:200] if description else "Belanja",
                "sort_order": 1,
            },
            {
                "journal_entry_id": entry_id,
                "account_type": "bank",
                "account_id": bank_account_id,
                "debit": 0.0,
                "credit": amount,
                "memo": "Wang keluar",
                "sort_order": 2,
            },
        ])

    return str(entry_id)


async def update_journal_status_for_transaction(db, transaction_id: str, status: str, verified_by=None, verified_at=None):
    """When transaction is verified/rejected, update linked journal entry status."""
    await db[JOURNAL_ENTRIES_COLLECTION].update_one(
        {"transaction_id": ObjectId(transaction_id)},
        {"$set": {
            "status": status,
            "verified_by": verified_by,
            "verified_at": verified_at or datetime.now(timezone.utc),
        }}
    )


async def get_journal_entry_by_transaction_id(db, transaction_id: str):
    """Get journal entry and its lines for a transaction."""
    entry = await db[JOURNAL_ENTRIES_COLLECTION].find_one({"transaction_id": ObjectId(transaction_id)})
    if not entry:
        return None, []
    lines = await db[JOURNAL_LINES_COLLECTION].find(
        {"journal_entry_id": entry["_id"]}
    ).sort("sort_order", 1).to_list(20)
    return entry, lines
