"""
Accounting Module - Full API Routes
Sistem Perakaunan MRSM Bersepadu dengan Kawalan Audit Dalaman Malaysia
"""

from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import uuid

from models.accounting import (
    TransactionType, TransactionStatus, TransactionSource,
    TransactionCategoryCreate, TransactionCategoryUpdate, TransactionCategoryResponse,
    TransactionCreate, TransactionUpdate, TransactionVerify, TransactionResponse,
    PeriodLockCreate, PeriodLockResponse,
    AccountingAuditLogResponse,
    MonthlyReportResponse, AnnualReportResponse, BalanceSheetResponse,
    TRANSACTION_TYPE_DISPLAY, TRANSACTION_STATUS_DISPLAY, TRANSACTION_SOURCE_DISPLAY,
    AUDIT_ACTION_DISPLAY, DEFAULT_INCOME_CATEGORIES, DEFAULT_EXPENSE_CATEGORIES, MALAY_MONTHS
)
from services.accounting_journal import (
    create_journal_for_transaction,
    update_journal_status_for_transaction,
    get_journal_entry_by_transaction_id,
)

router = APIRouter(prefix="/api/accounting-full", tags=["Accounting Full"])
security = HTTPBearer(auto_error=False)

_get_db_func = None
_get_current_user_func = None
_log_audit_func = None


def init_router(get_db_func, current_user_dep, permission_dep, audit_func):
    global _get_db_func, _get_current_user_func, _log_audit_func
    _get_db_func = get_db_func
    _get_current_user_func = current_user_dep
    _log_audit_func = audit_func


def get_db():
    return _get_db_func()


def _merge_by_status(a: dict, b: dict) -> dict:
    """Merge two by_status dicts (amount and count per status)."""
    out = {}
    for k, v in (a or {}).items():
        out[k] = {"amount": v.get("amount", 0), "count": v.get("count", 0)}
    for k, v in (b or {}).items():
        if k not in out:
            out[k] = {"amount": 0, "count": 0}
        out[k]["amount"] = round(out[k]["amount"] + v.get("amount", 0), 2)
        out[k]["count"] = out[k]["count"] + v.get("count", 0)
    return out


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Token diperlukan")
    return await _get_current_user_func(credentials)


async def log_audit(user, action, module, details):
    if _log_audit_func and user:
        await _log_audit_func(user, action, module, details)


async def _invalidate_financial_dashboard_cache_safely(db, scope: str = "all") -> None:
    try:
        from routes.financial_dashboard import invalidate_financial_dashboard_cache

        await invalidate_financial_dashboard_cache(db, scope=scope)
    except Exception:
        # Cache invalidation is best-effort only.
        pass


# Role checks
BENDAHARI_ROLES = ["superadmin", "admin", "bendahari", "sub_bendahari"]
JURUAUDIT_ROLES = ["superadmin", "juruaudit"]
ALL_ACCOUNTING_ROLES = ["superadmin", "admin", "bendahari", "sub_bendahari", "juruaudit"]


def check_bendahari_access(user):
    if user["role"] not in BENDAHARI_ROLES:
        raise HTTPException(status_code=403, detail="Akses hanya untuk Bendahari")


def check_juruaudit_access(user):
    if user["role"] not in JURUAUDIT_ROLES:
        raise HTTPException(status_code=403, detail="Akses hanya untuk JuruAudit")


def check_accounting_access(user):
    if user["role"] not in ALL_ACCOUNTING_ROLES:
        raise HTTPException(status_code=403, detail="Akses ditolak")


async def log_accounting_audit(db, transaction_id, action, user, old_value=None, new_value=None, notes=None):
    """Log accounting-specific audit trail"""
    transaction = await db.accounting_transactions.find_one({"_id": ObjectId(transaction_id)})
    await db.accounting_audit_logs.insert_one({
        "transaction_id": ObjectId(transaction_id),
        "transaction_number": transaction.get("transaction_number", "-") if transaction else "-",
        "action": action,
        "old_value": old_value,
        "new_value": new_value,
        "performed_by": user["_id"],
        "performed_by_name": user.get("full_name", ""),
        "performed_by_role": user.get("role", ""),
        "performed_at": datetime.now(timezone.utc),
        "notes": notes
    })


async def generate_transaction_number(db):
    """Generate unique transaction number: TRX-YYYY-XXXX"""
    year = datetime.now().year
    prefix = f"TRX-{year}-"
    
    # Find latest transaction number for this year
    latest = await db.accounting_transactions.find_one(
        {"transaction_number": {"$regex": f"^{prefix}"}},
        sort=[("transaction_number", -1)]
    )
    
    if latest and latest.get("transaction_number"):
        try:
            last_num = int(latest["transaction_number"].split("-")[-1])
            new_num = last_num + 1
        except Exception:
            new_num = 1
    else:
        new_num = 1
    
    return f"{prefix}{new_num:04d}"


async def check_period_locked(db, year: int, month: int):
    """Check if a period is locked"""
    lock = await db.accounting_period_locks.find_one({
        "year": year,
        "month": month,
        "is_locked": True
    })
    return lock is not None


# ==================== CATEGORIES ====================

@router.get("/categories", response_model=List[TransactionCategoryResponse])
async def list_categories(
    type: Optional[str] = None,
    include_inactive: bool = False,
    user: dict = Depends(get_current_user)
):
    """List all transaction categories"""
    db = get_db()
    check_accounting_access(user)
    
    query = {}
    if type:
        query["type"] = type
    if not include_inactive:
        query["is_active"] = True
    
    categories = await db.accounting_categories.find(query).sort("name", 1).to_list(200)
    
    result = []
    for cat in categories:
        parent_name = None
        if cat.get("parent_id"):
            parent = await db.accounting_categories.find_one({"_id": ObjectId(cat["parent_id"])})
            parent_name = parent.get("name") if parent else None
        
        created_at = cat.get("created_at")
        if isinstance(created_at, datetime):
            created_at = created_at.isoformat()
        
        result.append(TransactionCategoryResponse(
            id=str(cat["_id"]),
            name=cat["name"],
            type=cat["type"],
            description=cat.get("description"),
            parent_id=cat.get("parent_id"),
            parent_name=parent_name,
            account_code=cat.get("account_code"),
            is_active=cat.get("is_active", True),
            created_at=created_at or "",
            created_by_name=cat.get("created_by_name")
        ))
    
    return result


@router.post("/categories", response_model=TransactionCategoryResponse)
async def create_category(
    data: TransactionCategoryCreate,
    user: dict = Depends(get_current_user)
):
    """Create new transaction category (Bendahari only)"""
    db = get_db()
    check_bendahari_access(user)
    
    # Check duplicate name
    existing = await db.accounting_categories.find_one({
        "name": data.name,
        "type": data.type
    })
    if existing:
        raise HTTPException(status_code=400, detail="Kategori dengan nama ini sudah wujud")
    
    # Validate parent if provided
    parent_name = None
    if data.parent_id:
        parent = await db.accounting_categories.find_one({"_id": ObjectId(data.parent_id)})
        if not parent:
            raise HTTPException(status_code=404, detail="Kategori induk tidak dijumpai")
        if parent["type"] != data.type:
            raise HTTPException(status_code=400, detail="Jenis kategori induk tidak sepadan")
        parent_name = parent["name"]
    
    now = datetime.now(timezone.utc)
    doc = {
        "name": data.name,
        "type": data.type,
        "description": data.description,
        "parent_id": data.parent_id,
        "account_code": data.account_code,
        "is_active": data.is_active,
        "created_at": now,
        "created_by": user["_id"],
        "created_by_name": user.get("full_name", "")
    }
    
    result = await db.accounting_categories.insert_one(doc)
    
    await log_audit(user, "CREATE_CATEGORY", "accounting", f"Cipta kategori: {data.name}")
    
    return TransactionCategoryResponse(
        id=str(result.inserted_id),
        name=data.name,
        type=data.type,
        description=data.description,
        parent_id=data.parent_id,
        parent_name=parent_name,
        account_code=data.account_code,
        is_active=data.is_active,
        created_at=now.isoformat(),
        created_by_name=user.get("full_name", "")
    )


@router.put("/categories/{category_id}", response_model=TransactionCategoryResponse)
async def update_category(
    category_id: str,
    data: TransactionCategoryUpdate,
    user: dict = Depends(get_current_user)
):
    """Update transaction category (Bendahari only)"""
    db = get_db()
    check_bendahari_access(user)
    
    category = await db.accounting_categories.find_one({"_id": ObjectId(category_id)})
    if not category:
        raise HTTPException(status_code=404, detail="Kategori tidak dijumpai")
    
    update_data = {}
    if data.name is not None:
        # Check duplicate
        existing = await db.accounting_categories.find_one({
            "name": data.name,
            "type": category["type"],
            "_id": {"$ne": ObjectId(category_id)}
        })
        if existing:
            raise HTTPException(status_code=400, detail="Kategori dengan nama ini sudah wujud")
        update_data["name"] = data.name
    
    if data.description is not None:
        update_data["description"] = data.description
    if data.parent_id is not None:
        update_data["parent_id"] = data.parent_id
    if data.account_code is not None:
        update_data["account_code"] = data.account_code
    if data.is_active is not None:
        update_data["is_active"] = data.is_active

    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc)
        update_data["updated_by"] = user["_id"]
        await db.accounting_categories.update_one(
            {"_id": ObjectId(category_id)},
            {"$set": update_data}
        )

    await log_audit(user, "UPDATE_CATEGORY", "accounting", f"Kemaskini kategori: {category['name']}")
    
    # Fetch updated
    updated = await db.accounting_categories.find_one({"_id": ObjectId(category_id)})
    parent_name = None
    if updated.get("parent_id"):
        parent = await db.accounting_categories.find_one({"_id": ObjectId(updated["parent_id"])})
        parent_name = parent.get("name") if parent else None
    
    created_at = updated.get("created_at")
    if isinstance(created_at, datetime):
        created_at = created_at.isoformat()
    
    return TransactionCategoryResponse(
        id=str(updated["_id"]),
        name=updated["name"],
        type=updated["type"],
        description=updated.get("description"),
        parent_id=updated.get("parent_id"),
        parent_name=parent_name,
        account_code=updated.get("account_code"),
        is_active=updated.get("is_active", True),
        created_at=created_at or "",
        created_by_name=updated.get("created_by_name")
    )


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: str,
    user: dict = Depends(get_current_user)
):
    """Soft delete category (Bendahari only)"""
    db = get_db()
    check_bendahari_access(user)
    
    category = await db.accounting_categories.find_one({"_id": ObjectId(category_id)})
    if not category:
        raise HTTPException(status_code=404, detail="Kategori tidak dijumpai")
    
    # Check if used in transactions
    tx_count = await db.accounting_transactions.count_documents({"category_id": category_id})
    if tx_count > 0:
        # Soft delete only
        await db.accounting_categories.update_one(
            {"_id": ObjectId(category_id)},
            {"$set": {"is_active": False, "deleted_at": datetime.now(timezone.utc)}}
        )
        await log_audit(user, "SOFT_DELETE_CATEGORY", "accounting", f"Nyahaktifkan kategori: {category['name']} ({tx_count} transaksi)")
        return {"message": f"Kategori dinyahaktifkan kerana terdapat {tx_count} transaksi berkaitan"}
    
    # Hard delete if no transactions
    await db.accounting_categories.delete_one({"_id": ObjectId(category_id)})
    await log_audit(user, "DELETE_CATEGORY", "accounting", f"Padam kategori: {category['name']}")
    
    return {"message": "Kategori berjaya dipadam"}


@router.post("/categories/seed-defaults")
async def seed_default_categories(user: dict = Depends(get_current_user)):
    """Seed default categories (Superadmin only)"""
    db = get_db()
    if user["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Hanya Superadmin boleh seed kategori")
    
    now = datetime.now(timezone.utc)
    created = 0
    
    for cat in DEFAULT_INCOME_CATEGORIES:
        existing = await db.accounting_categories.find_one({"name": cat["name"], "type": "income"})
        if not existing:
            await db.accounting_categories.insert_one({
                **cat,
                "type": "income",
                "is_active": True,
                "created_at": now,
                "created_by": user["_id"],
                "created_by_name": "System"
            })
            created += 1
    
    for cat in DEFAULT_EXPENSE_CATEGORIES:
        existing = await db.accounting_categories.find_one({"name": cat["name"], "type": "expense"})
        if not existing:
            await db.accounting_categories.insert_one({
                **cat,
                "type": "expense",
                "is_active": True,
                "created_at": now,
                "created_by": user["_id"],
                "created_by_name": "System"
            })
            created += 1
    
    return {"message": f"{created} kategori default berjaya dicipta"}


# ==================== CHART OF ACCOUNTS (SENARAI AKAUN) ====================

@router.get("/chart-of-accounts")
async def get_chart_of_accounts(
    type_filter: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Senarai Akaun (COA): Aset = akaun bank, Hasil & Belanja = kategori. Untuk rujukan dan imbangan duga."""
    db = get_db()
    check_accounting_access(user)
    result = {"asset": [], "income": [], "expense": []}
    # Aset: bank accounts (kod 1xxx)
    banks = await db.bank_accounts.find({"is_active": True}).sort("account_code", 1).to_list(100)
    for b in banks:
        if type_filter and type_filter != "asset":
            continue
        result["asset"].append({
            "id": str(b["_id"]),
            "account_type": "bank",
            "account_code": b.get("account_code") or "-",
            "name": b.get("name", ""),
            "description": b.get("description"),
        })
    # Hasil: income categories
    inc = await db.accounting_categories.find({"type": "income", "is_active": True}).sort("account_code", 1).to_list(100)
    for c in inc:
        if type_filter and type_filter != "income":
            continue
        result["income"].append({
            "id": str(c["_id"]),
            "account_type": "category",
            "account_code": c.get("account_code") or "-",
            "name": c.get("name", ""),
            "description": c.get("description"),
        })
    # Belanja: expense categories
    exp = await db.accounting_categories.find({"type": "expense", "is_active": True}).sort("account_code", 1).to_list(100)
    for c in exp:
        if type_filter and type_filter != "expense":
            continue
        result["expense"].append({
            "id": str(c["_id"]),
            "account_type": "category",
            "account_code": c.get("account_code") or "-",
            "name": c.get("name", ""),
            "description": c.get("description"),
        })
    return result


@router.post("/migrate-transactions-to-journal")
async def migrate_transactions_to_journal(user: dict = Depends(get_current_user)):
    """Cipta entri jurnal untuk semua transaksi lama yang belum ada jurnal (sekali sahaja). Bendahari/Superadmin."""
    db = get_db()
    if user["role"] not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    from services.accounting_journal import create_journal_for_transaction
    # Find transactions that don't have a journal entry
    tx_cursor = db.accounting_transactions.find({"is_deleted": {"$ne": True}})
    created = 0
    errors = 0
    async for tx in tx_cursor:
        tx_id = str(tx["_id"])
        existing = await db.accounting_journal_entries.find_one({"transaction_id": ObjectId(tx_id)})
        if existing:
            continue
        doc = {**tx, "category_id": str(tx.get("category_id", "")) if tx.get("category_id") else None}
        try:
            await create_journal_for_transaction(db, tx_id, doc)
            created += 1
        except Exception:
            errors += 1
    await log_audit(user, "MIGRATE_TO_JOURNAL", "accounting", f"Cipta {created} entri jurnal, {errors} ralat")
    return {"message": f"Migrasi selesai. {created} entri jurnal dicipta.", "created": created, "errors": errors}


# ==================== TRANSACTIONS ====================

MODULE_DISPLAY = {"yuran": "Yuran", "koperasi": "Koperasi", "bus": "Bas", "tabung": "Tabung", "infaq": "Tabung"}


@router.get("/transactions")
async def list_transactions(
    type: Optional[str] = None,
    status: Optional[str] = None,
    category_id: Optional[str] = None,
    module: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user)
):
    """List transactions with filters and pagination. module = yuran|koperasi|bus|tabung for payment_center source."""
    db = get_db()
    check_accounting_access(user)
    
    query = {}
    if type:
        query["type"] = type
    if status:
        query["status"] = status
    if category_id:
        query["category_id"] = category_id
    if module:
        query["source_ref.module"] = module
    
    if start_date:
        try:
            query["transaction_date"] = {"$gte": start_date}
        except Exception:
            pass
    if end_date:
        try:
            if "transaction_date" in query:
                query["transaction_date"]["$lte"] = end_date
            else:
                query["transaction_date"] = {"$lte": end_date}
        except Exception:
            pass
    
    if search:
        query["$or"] = [
            {"transaction_number": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
            {"reference_number": {"$regex": search, "$options": "i"}}
        ]
    
    total = await db.accounting_transactions.count_documents(query)
    skip = (page - 1) * limit
    
    transactions = await db.accounting_transactions.find(query)\
        .sort("created_at", -1)\
        .skip(skip)\
        .limit(limit)\
        .to_list(limit)
    
    # Fetch category names
    category_ids = list(set([t.get("category_id") for t in transactions if t.get("category_id")]))
    categories = {}
    if category_ids:
        cats = await db.accounting_categories.find({"_id": {"$in": [ObjectId(c) for c in category_ids]}}).to_list(100)
        categories = {str(c["_id"]): c["name"] for c in cats}
    
    result = []
    for tx in transactions:
        created_at = tx.get("created_at")
        verified_at = tx.get("verified_at")
        if isinstance(created_at, datetime):
            created_at = created_at.isoformat()
        if isinstance(verified_at, datetime):
            verified_at = verified_at.isoformat()
        
        src_ref = tx.get("source_ref") or {}
        mod = src_ref.get("module", "")
        result.append({
            "id": str(tx["_id"]),
            "transaction_number": tx.get("transaction_number", "-"),
            "type": tx.get("type", ""),
            "type_display": TRANSACTION_TYPE_DISPLAY.get(tx.get("type"), tx.get("type", "")),
            "category_id": tx.get("category_id", ""),
            "category_name": categories.get(tx.get("category_id"), "Tidak Diketahui"),
            "module": mod,
            "module_display": MODULE_DISPLAY.get(mod, mod or "Lain"),
            "amount": tx.get("amount", 0),
            "transaction_date": tx.get("transaction_date", ""),
            "description": tx.get("description", ""),
            "reference_number": tx.get("reference_number"),
            "source": tx.get("source", "manual"),
            "source_display": TRANSACTION_SOURCE_DISPLAY.get(tx.get("source"), tx.get("source", "")),
            "status": tx.get("status", "pending"),
            "status_display": TRANSACTION_STATUS_DISPLAY.get(tx.get("status"), tx.get("status", "")),
            "notes": tx.get("notes"),
            "document_url": tx.get("document_url"),
            "created_by": str(tx.get("created_by", "")),
            "created_by_name": tx.get("created_by_name", ""),
            "created_at": created_at or "",
            "verified_by": str(tx.get("verified_by", "")) if tx.get("verified_by") else None,
            "verified_by_name": tx.get("verified_by_name"),
            "verified_at": verified_at,
            "verification_notes": tx.get("verification_notes")
        })
    
    return {
        "transactions": result,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": (total + limit - 1) // limit,
            "has_next": page * limit < total,
            "has_prev": page > 1
        }
    }


@router.post("/transactions")
async def create_transaction(
    data: TransactionCreate,
    user: dict = Depends(get_current_user)
):
    """Create new transaction (Bendahari only)"""
    db = get_db()
    check_bendahari_access(user)
    
    # Validate category
    category = await db.accounting_categories.find_one({"_id": ObjectId(data.category_id)})
    if not category:
        raise HTTPException(status_code=404, detail="Kategori tidak dijumpai")
    if category["type"] != data.type:
        raise HTTPException(status_code=400, detail="Jenis transaksi tidak sepadan dengan kategori")
    
    # Validate bank account if provided
    bank_account_name = None
    if data.bank_account_id:
        bank_acc = await db.bank_accounts.find_one({"_id": ObjectId(data.bank_account_id)})
        if not bank_acc:
            raise HTTPException(status_code=404, detail="Akaun bank tidak dijumpai")
        if not bank_acc.get("is_active", True):
            raise HTTPException(status_code=400, detail="Akaun bank tidak aktif")
        bank_account_name = bank_acc.get("name")
    
    # Check period lock
    try:
        tx_date = datetime.strptime(data.transaction_date, "%Y-%m-%d")
        if await check_period_locked(db, tx_date.year, tx_date.month):
            raise HTTPException(status_code=400, detail=f"Tempoh {MALAY_MONTHS.get(tx_date.month)} {tx_date.year} telah dikunci")
    except ValueError:
        raise HTTPException(status_code=400, detail="Format tarikh tidak sah (YYYY-MM-DD)")
    
    # Generate transaction number
    tx_number = await generate_transaction_number(db)
    
    now = datetime.now(timezone.utc)
    doc = {
        "transaction_number": tx_number,
        "type": data.type,
        "category_id": data.category_id,
        "bank_account_id": data.bank_account_id,
        "amount": data.amount,
        "transaction_date": data.transaction_date,
        "description": data.description,
        "reference_number": data.reference_number,
        "source": data.source,
        "notes": data.notes,
        "status": "pending",
        "created_at": now,
        "created_by": user["_id"],
        "created_by_name": user.get("full_name", "")
    }
    
    result = await db.accounting_transactions.insert_one(doc)
    await _invalidate_financial_dashboard_cache_safely(db, scope="accounting")
    tx_id = str(result.inserted_id)
    doc["_id"] = result.inserted_id
    doc["created_by"] = user["_id"]
    doc["created_by_name"] = user.get("full_name", "")

    # Double-entry: create journal entry with debit/credit lines
    try:
        await create_journal_for_transaction(db, tx_id, doc)
    except Exception as e:
        # Log but don't fail the request; transaction is still recorded
        if _log_audit_func and user:
            await _log_audit_func(user, "JOURNAL_CREATE_ERROR", "accounting", str(e))

    # Log audit
    await log_accounting_audit(
        db, tx_id, "created", user,
        new_value={"amount": data.amount, "description": data.description, "bank_account": bank_account_name}
    )
    await log_audit(user, "CREATE_TRANSACTION", "accounting", f"Cipta transaksi {tx_number}: RM{data.amount:.2f}")

    return {
        "id": tx_id,
        "transaction_number": tx_number,
        "message": "Transaksi berjaya dicipta (entri bergu direkodkan)"
    }


@router.get("/transactions/{transaction_id}")
async def get_transaction(
    transaction_id: str,
    user: dict = Depends(get_current_user)
):
    """Get transaction details"""
    db = get_db()
    check_accounting_access(user)
    
    tx = await db.accounting_transactions.find_one({"_id": ObjectId(transaction_id)})
    if not tx:
        raise HTTPException(status_code=404, detail="Transaksi tidak dijumpai")
    
    # Get category
    category = await db.accounting_categories.find_one({"_id": ObjectId(tx.get("category_id"))})
    category_name = category.get("name") if category else "Tidak Diketahui"
    
    # Get audit logs
    audit_logs = await db.accounting_audit_logs.find(
        {"transaction_id": ObjectId(transaction_id)}
    ).sort("performed_at", -1).to_list(50)
    
    audit_log_list = []
    for log in audit_logs:
        performed_at = log.get("performed_at")
        if isinstance(performed_at, datetime):
            performed_at = performed_at.isoformat()
        
        audit_log_list.append({
            "id": str(log["_id"]),
            "action": log.get("action", ""),
            "action_display": AUDIT_ACTION_DISPLAY.get(log.get("action"), log.get("action", "")),
            "performed_by_name": log.get("performed_by_name", ""),
            "performed_by_role": log.get("performed_by_role", ""),
            "performed_at": performed_at or "",
            "notes": log.get("notes")
        })
    
    created_at = tx.get("created_at")
    verified_at = tx.get("verified_at")
    if isinstance(created_at, datetime):
        created_at = created_at.isoformat()
    if isinstance(verified_at, datetime):
        verified_at = verified_at.isoformat()
    
    return {
        "id": str(tx["_id"]),
        "transaction_number": tx.get("transaction_number", "-"),
        "type": tx.get("type", ""),
        "type_display": TRANSACTION_TYPE_DISPLAY.get(tx.get("type"), ""),
        "category_id": tx.get("category_id", ""),
        "category_name": category_name,
        "amount": tx.get("amount", 0),
        "transaction_date": tx.get("transaction_date", ""),
        "description": tx.get("description", ""),
        "reference_number": tx.get("reference_number"),
        "source": tx.get("source", "manual"),
        "source_display": TRANSACTION_SOURCE_DISPLAY.get(tx.get("source"), ""),
        "status": tx.get("status", "pending"),
        "status_display": TRANSACTION_STATUS_DISPLAY.get(tx.get("status"), ""),
        "notes": tx.get("notes"),
        "document_url": tx.get("document_url"),
        "created_by": str(tx.get("created_by", "")),
        "created_by_name": tx.get("created_by_name", ""),
        "created_at": created_at or "",
        "verified_by": str(tx.get("verified_by", "")) if tx.get("verified_by") else None,
        "verified_by_name": tx.get("verified_by_name"),
        "verified_at": verified_at,
        "verification_notes": tx.get("verification_notes"),
        "audit_logs": audit_log_list
    }


@router.get("/transactions/{transaction_id}/journal")
async def get_transaction_journal(
    transaction_id: str,
    user: dict = Depends(get_current_user)
):
    """Get double-entry journal (debit/credit lines) for a transaction. User-friendly for viewing entri bergu."""
    db = get_db()
    check_accounting_access(user)
    entry, lines = await get_journal_entry_by_transaction_id(db, transaction_id)
    if not entry:
        return {"has_journal": False, "entry_number": None, "lines": [], "message": "Tiada entri jurnal untuk transaksi ini (mungkin dicipta sebelum entri bergu diaktifkan)."}
    # Resolve account names and codes
    bank_ids = [l["account_id"] for l in lines if l.get("account_type") == "bank"]
    cat_ids = [l["account_id"] for l in lines if l.get("account_type") == "category"]
    banks = {str(a["_id"]): a for a in await db.bank_accounts.find({"_id": {"$in": [ObjectId(b) for b in bank_ids if b]}}).to_list(20)}
    cats = {str(c["_id"]): c for c in await db.accounting_categories.find({"_id": {"$in": [ObjectId(c) for c in cat_ids if c]}}).to_list(20)}
    line_list = []
    for L in lines:
        atype = L.get("account_type", "")
        aid = str(L.get("account_id", ""))
        if atype == "bank":
            acc = banks.get(aid, {})
            name = acc.get("name", "Akaun Bank")
            code = acc.get("account_code", "")
        else:
            acc = cats.get(aid, {})
            name = acc.get("name", "Kategori")
            code = acc.get("account_code", "")
        line_list.append({
            "account_type": atype,
            "account_code": code,
            "account_name": name,
            "debit": round(L.get("debit", 0), 2),
            "credit": round(L.get("credit", 0), 2),
            "memo": L.get("memo"),
        })
    total_debit = sum(L.get("debit", 0) for L in lines)
    total_credit = sum(L.get("credit", 0) for L in lines)
    created_at = entry.get("created_at")
    if isinstance(created_at, datetime):
        created_at = created_at.isoformat()
    return {
        "has_journal": True,
        "entry_number": entry.get("entry_number"),
        "transaction_date": entry.get("transaction_date"),
        "description": entry.get("description"),
        "status": entry.get("status"),
        "total_debit": round(total_debit, 2),
        "total_credit": round(total_credit, 2),
        "lines": line_list,
        "created_at": created_at or "",
        "created_by_name": entry.get("created_by_name"),
    }


@router.put("/transactions/{transaction_id}")
async def update_transaction(
    transaction_id: str,
    data: TransactionUpdate,
    user: dict = Depends(get_current_user)
):
    """Update transaction (Bendahari only, pending status only)"""
    db = get_db()
    check_bendahari_access(user)
    
    tx = await db.accounting_transactions.find_one({"_id": ObjectId(transaction_id)})
    if not tx:
        raise HTTPException(status_code=404, detail="Transaksi tidak dijumpai")
    
    if tx.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Hanya transaksi berstatus 'Menunggu' boleh dikemaskini")
    
    # Check period lock if date is being changed
    if data.transaction_date:
        try:
            tx_date = datetime.strptime(data.transaction_date, "%Y-%m-%d")
            if await check_period_locked(db, tx_date.year, tx_date.month):
                raise HTTPException(status_code=400, detail=f"Tempoh {MALAY_MONTHS.get(tx_date.month)} {tx_date.year} telah dikunci")
        except ValueError:
            raise HTTPException(status_code=400, detail="Format tarikh tidak sah")
    
    old_value = {
        "amount": tx.get("amount"),
        "description": tx.get("description"),
        "category_id": tx.get("category_id")
    }
    
    update_data = {}
    if data.category_id is not None:
        category = await db.accounting_categories.find_one({"_id": ObjectId(data.category_id)})
        if not category:
            raise HTTPException(status_code=404, detail="Kategori tidak dijumpai")
        update_data["category_id"] = data.category_id
    if data.amount is not None:
        update_data["amount"] = data.amount
    if data.transaction_date is not None:
        update_data["transaction_date"] = data.transaction_date
    if data.description is not None:
        update_data["description"] = data.description
    if data.reference_number is not None:
        update_data["reference_number"] = data.reference_number
    if data.notes is not None:
        update_data["notes"] = data.notes
    
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc)
        update_data["updated_by"] = user["_id"]
        await db.accounting_transactions.update_one(
            {"_id": ObjectId(transaction_id)},
            {"$set": update_data}
        )
        await _invalidate_financial_dashboard_cache_safely(db, scope="accounting")
        
        await log_accounting_audit(
            db, transaction_id, "updated", user,
            old_value=old_value,
            new_value=update_data
        )
        await log_audit(user, "UPDATE_TRANSACTION", "accounting", f"Kemaskini transaksi {tx.get('transaction_number')}")
    
    return {"message": "Transaksi berjaya dikemaskini"}


@router.delete("/transactions/{transaction_id}")
async def delete_transaction(
    transaction_id: str,
    user: dict = Depends(get_current_user)
):
    """Delete transaction (Bendahari only, pending status only)"""
    db = get_db()
    check_bendahari_access(user)
    
    tx = await db.accounting_transactions.find_one({"_id": ObjectId(transaction_id)})
    if not tx:
        raise HTTPException(status_code=404, detail="Transaksi tidak dijumpai")
    
    if tx.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Hanya transaksi berstatus 'Menunggu' boleh dipadam")
    
    # Soft delete
    await db.accounting_transactions.update_one(
        {"_id": ObjectId(transaction_id)},
        {"$set": {
            "is_deleted": True,
            "deleted_at": datetime.now(timezone.utc),
            "deleted_by": user["_id"]
        }}
    )
    await _invalidate_financial_dashboard_cache_safely(db, scope="accounting")
    
    await log_audit(user, "DELETE_TRANSACTION", "accounting", f"Padam transaksi {tx.get('transaction_number')}")
    
    return {"message": "Transaksi berjaya dipadam"}


# ==================== VERIFICATION (JURUAUDIT) ====================

@router.post("/transactions/{transaction_id}/verify")
async def verify_transaction(
    transaction_id: str,
    data: TransactionVerify,
    user: dict = Depends(get_current_user)
):
    """Verify or reject transaction (JuruAudit only)"""
    db = get_db()
    check_juruaudit_access(user)
    
    tx = await db.accounting_transactions.find_one({"_id": ObjectId(transaction_id)})
    if not tx:
        raise HTTPException(status_code=404, detail="Transaksi tidak dijumpai")
    
    if tx.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Hanya transaksi berstatus 'Menunggu' boleh disahkan/ditolak")
    
    if data.status not in ["verified", "rejected"]:
        raise HTTPException(status_code=400, detail="Status tidak sah")
    
    now = datetime.now(timezone.utc)
    await db.accounting_transactions.update_one(
        {"_id": ObjectId(transaction_id)},
        {"$set": {
            "status": data.status,
            "verified_at": now,
            "verified_by": user["_id"],
            "verified_by_name": user.get("full_name", ""),
            "verification_notes": data.verification_notes
        }}
    )
    await _invalidate_financial_dashboard_cache_safely(db, scope="accounting")
    # Sync status to double-entry journal
    try:
        await update_journal_status_for_transaction(
            db, transaction_id, data.status,
            verified_by=user["_id"], verified_at=now
        )
    except Exception:
        pass

    action = "verified" if data.status == "verified" else "rejected"
    await log_accounting_audit(
        db, transaction_id, action, user,
        notes=data.verification_notes
    )
    
    status_text = "disahkan" if data.status == "verified" else "ditolak"
    await log_audit(user, "VERIFY_TRANSACTION", "accounting", f"Transaksi {tx.get('transaction_number')} {status_text}")
    
    # Notify creator
    await db.notifications.insert_one({
        "user_id": tx.get("created_by"),
        "title": f"Transaksi {status_text.title()}",
        "message": f"Transaksi {tx.get('transaction_number')} telah {status_text} oleh JuruAudit.",
        "type": "info" if data.status == "verified" else "warning",
        "is_read": False,
        "created_at": now.isoformat()
    })
    
    return {"message": f"Transaksi berjaya {status_text}"}


@router.get("/pending-verification")
async def get_pending_verification(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user)
):
    """Get transactions pending verification (JuruAudit only)"""
    db = get_db()
    check_juruaudit_access(user)
    
    query = {"status": "pending", "is_deleted": {"$ne": True}}
    total = await db.accounting_transactions.count_documents(query)
    skip = (page - 1) * limit
    
    transactions = await db.accounting_transactions.find(query)\
        .sort("created_at", 1)\
        .skip(skip)\
        .limit(limit)\
        .to_list(limit)
    
    # Fetch category names
    category_ids = list(set([t.get("category_id") for t in transactions if t.get("category_id")]))
    categories = {}
    if category_ids:
        cats = await db.accounting_categories.find({"_id": {"$in": [ObjectId(c) for c in category_ids]}}).to_list(100)
        categories = {str(c["_id"]): c["name"] for c in cats}
    
    result = []
    for tx in transactions:
        created_at = tx.get("created_at")
        if isinstance(created_at, datetime):
            created_at = created_at.isoformat()
        
        result.append({
            "id": str(tx["_id"]),
            "transaction_number": tx.get("transaction_number", "-"),
            "type": tx.get("type", ""),
            "type_display": TRANSACTION_TYPE_DISPLAY.get(tx.get("type"), ""),
            "category_name": categories.get(tx.get("category_id"), "Tidak Diketahui"),
            "amount": tx.get("amount", 0),
            "transaction_date": tx.get("transaction_date", ""),
            "description": tx.get("description", ""),
            "source_display": TRANSACTION_SOURCE_DISPLAY.get(tx.get("source"), ""),
            "created_by_name": tx.get("created_by_name", ""),
            "created_at": created_at or ""
        })
    
    return {
        "transactions": result,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": (total + limit - 1) // limit
        }
    }


# ==================== PERIOD LOCKS ====================

@router.get("/period-locks")
async def list_period_locks(
    year: Optional[int] = None,
    user: dict = Depends(get_current_user)
):
    """List period locks"""
    db = get_db()
    check_juruaudit_access(user)
    
    query = {}
    if year:
        query["year"] = year
    
    locks = await db.accounting_period_locks.find(query).sort([("year", -1), ("month", -1)]).to_list(100)
    
    result = []
    for lock in locks:
        locked_at = lock.get("locked_at")
        if isinstance(locked_at, datetime):
            locked_at = locked_at.isoformat()
        
        result.append(PeriodLockResponse(
            id=str(lock["_id"]),
            year=lock["year"],
            month=lock["month"],
            month_name=MALAY_MONTHS.get(lock["month"], str(lock["month"])),
            is_locked=lock.get("is_locked", False),
            locked_at=locked_at,
            locked_by=str(lock.get("locked_by", "")) if lock.get("locked_by") else None,
            locked_by_name=lock.get("locked_by_name"),
            notes=lock.get("notes")
        ))
    
    return result


@router.post("/period-locks")
async def lock_period(
    data: PeriodLockCreate,
    user: dict = Depends(get_current_user)
):
    """Lock a period (JuruAudit only)"""
    db = get_db()
    check_juruaudit_access(user)
    
    # Check if already locked
    existing = await db.accounting_period_locks.find_one({
        "year": data.year,
        "month": data.month
    })
    
    if existing and existing.get("is_locked"):
        raise HTTPException(status_code=400, detail="Tempoh ini sudah dikunci")
    
    now = datetime.now(timezone.utc)
    
    if existing:
        await db.accounting_period_locks.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "is_locked": True,
                "locked_at": now,
                "locked_by": user["_id"],
                "locked_by_name": user.get("full_name", ""),
                "notes": data.notes
            }}
        )
    else:
        await db.accounting_period_locks.insert_one({
            "year": data.year,
            "month": data.month,
            "is_locked": True,
            "locked_at": now,
            "locked_by": user["_id"],
            "locked_by_name": user.get("full_name", ""),
            "notes": data.notes
        })
    
    # Update all pending transactions in this period to locked
    await db.accounting_transactions.update_many(
        {
            "transaction_date": {"$regex": f"^{data.year}-{data.month:02d}"},
            "status": "pending"
        },
        {"$set": {"status": "locked"}}
    )
    await _invalidate_financial_dashboard_cache_safely(db, scope="accounting")
    
    await log_audit(user, "LOCK_PERIOD", "accounting", f"Kunci tempoh {MALAY_MONTHS.get(data.month)} {data.year}")
    
    return {"message": f"Tempoh {MALAY_MONTHS.get(data.month)} {data.year} berjaya dikunci"}


@router.delete("/period-locks/{year}/{month}")
async def unlock_period(
    year: int,
    month: int,
    user: dict = Depends(get_current_user)
):
    """Unlock a period (Superadmin only)"""
    db = get_db()
    if user["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Hanya Superadmin boleh membuka kunci tempoh")
    
    lock = await db.accounting_period_locks.find_one({"year": year, "month": month})
    if not lock or not lock.get("is_locked"):
        raise HTTPException(status_code=404, detail="Tempoh tidak dikunci")
    
    await db.accounting_period_locks.update_one(
        {"_id": lock["_id"]},
        {"$set": {
            "is_locked": False,
            "unlocked_at": datetime.now(timezone.utc),
            "unlocked_by": user["_id"]
        }}
    )
    
    # Revert locked transactions back to pending
    await db.accounting_transactions.update_many(
        {
            "transaction_date": {"$regex": f"^{year}-{month:02d}"},
            "status": "locked"
        },
        {"$set": {"status": "pending"}}
    )
    await _invalidate_financial_dashboard_cache_safely(db, scope="accounting")
    
    await log_audit(user, "UNLOCK_PERIOD", "accounting", f"Buka kunci tempoh {MALAY_MONTHS.get(month)} {year}")
    
    return {"message": f"Tempoh {MALAY_MONTHS.get(month)} {year} berjaya dibuka kunci"}


# ==================== REPORTS ====================

@router.get("/reports/monthly")
async def get_monthly_report(
    year: int,
    month: int,
    user: dict = Depends(get_current_user)
):
    """Get monthly financial report"""
    db = get_db()
    check_accounting_access(user)
    
    date_prefix = f"{year}-{month:02d}"
    
    # Get verified transactions only
    query = {
        "transaction_date": {"$regex": f"^{date_prefix}"},
        "status": "verified",
        "is_deleted": {"$ne": True}
    }
    
    transactions = await db.accounting_transactions.find(query).to_list(1000)
    
    total_income = 0
    total_expense = 0
    income_by_category = {}
    expense_by_category = {}
    
    for tx in transactions:
        amount = tx.get("amount", 0)
        cat_id = tx.get("category_id", "")
        
        if tx.get("type") == "income":
            total_income += amount
            income_by_category[cat_id] = income_by_category.get(cat_id, 0) + amount
        else:
            total_expense += amount
            expense_by_category[cat_id] = expense_by_category.get(cat_id, 0) + amount
    
    # Get category names
    all_cat_ids = list(set(list(income_by_category.keys()) + list(expense_by_category.keys())))
    categories = {}
    if all_cat_ids:
        cats = await db.accounting_categories.find({"_id": {"$in": [ObjectId(c) for c in all_cat_ids if c]}}).to_list(100)
        categories = {str(c["_id"]): c["name"] for c in cats}
    
    # Format category breakdown
    income_breakdown = [
        {"category_id": k, "category_name": categories.get(k, "Lain-lain"), "amount": round(v, 2)}
        for k, v in income_by_category.items()
    ]
    expense_breakdown = [
        {"category_id": k, "category_name": categories.get(k, "Lain-lain"), "amount": round(v, 2)}
        for k, v in expense_by_category.items()
    ]
    
    # Check lock status
    lock = await db.accounting_period_locks.find_one({"year": year, "month": month})
    is_locked = lock.get("is_locked", False) if lock else False
    
    # Count by status
    total_count = await db.accounting_transactions.count_documents({
        "transaction_date": {"$regex": f"^{date_prefix}"},
        "is_deleted": {"$ne": True}
    })
    verified_count = await db.accounting_transactions.count_documents({
        "transaction_date": {"$regex": f"^{date_prefix}"},
        "status": "verified",
        "is_deleted": {"$ne": True}
    })
    pending_count = await db.accounting_transactions.count_documents({
        "transaction_date": {"$regex": f"^{date_prefix}"},
        "status": "pending",
        "is_deleted": {"$ne": True}
    })
    
    return MonthlyReportResponse(
        year=year,
        month=month,
        month_name=MALAY_MONTHS.get(month, str(month)),
        total_income=round(total_income, 2),
        total_expense=round(total_expense, 2),
        net_balance=round(total_income - total_expense, 2),
        income_by_category=income_breakdown,
        expense_by_category=expense_breakdown,
        transaction_count=total_count,
        verified_count=verified_count,
        pending_count=pending_count,
        is_locked=is_locked
    )


@router.get("/reports/annual")
async def get_annual_report(
    year: int,
    user: dict = Depends(get_current_user)
):
    """Get annual financial report"""
    db = get_db()
    check_accounting_access(user)
    
    date_prefix = f"{year}-"
    
    query = {
        "transaction_date": {"$regex": f"^{date_prefix}"},
        "status": "verified",
        "is_deleted": {"$ne": True}
    }
    
    transactions = await db.accounting_transactions.find(query).to_list(10000)
    
    total_income = 0
    total_expense = 0
    income_by_category = {}
    expense_by_category = {}
    monthly_data = {i: {"income": 0, "expense": 0} for i in range(1, 13)}
    
    for tx in transactions:
        amount = tx.get("amount", 0)
        cat_id = tx.get("category_id", "")
        
        # Extract month from transaction_date
        try:
            tx_month = int(tx.get("transaction_date", "2000-01-01").split("-")[1])
        except Exception:
            tx_month = 1
        
        if tx.get("type") == "income":
            total_income += amount
            income_by_category[cat_id] = income_by_category.get(cat_id, 0) + amount
            monthly_data[tx_month]["income"] += amount
        else:
            total_expense += amount
            expense_by_category[cat_id] = expense_by_category.get(cat_id, 0) + amount
            monthly_data[tx_month]["expense"] += amount
    
    # Get category names
    all_cat_ids = list(set(list(income_by_category.keys()) + list(expense_by_category.keys())))
    categories = {}
    if all_cat_ids:
        cats = await db.accounting_categories.find({"_id": {"$in": [ObjectId(c) for c in all_cat_ids if c]}}).to_list(100)
        categories = {str(c["_id"]): c["name"] for c in cats}
    
    income_breakdown = [
        {"category_id": k, "category_name": categories.get(k, "Lain-lain"), "amount": round(v, 2)}
        for k, v in sorted(income_by_category.items(), key=lambda x: x[1], reverse=True)
    ]
    expense_breakdown = [
        {"category_id": k, "category_name": categories.get(k, "Lain-lain"), "amount": round(v, 2)}
        for k, v in sorted(expense_by_category.items(), key=lambda x: x[1], reverse=True)
    ]
    
    monthly_breakdown = [
        {
            "month": i,
            "month_name": MALAY_MONTHS.get(i, str(i)),
            "income": round(monthly_data[i]["income"], 2),
            "expense": round(monthly_data[i]["expense"], 2),
            "net": round(monthly_data[i]["income"] - monthly_data[i]["expense"], 2)
        }
        for i in range(1, 13)
    ]
    
    return AnnualReportResponse(
        year=year,
        total_income=round(total_income, 2),
        total_expense=round(total_expense, 2),
        net_balance=round(total_income - total_expense, 2),
        monthly_breakdown=monthly_breakdown,
        income_by_category=income_breakdown,
        expense_by_category=expense_breakdown
    )


@router.get("/reports/balance-sheet")
async def get_balance_sheet(
    user: dict = Depends(get_current_user)
):
    """Get current balance sheet"""
    db = get_db()
    check_accounting_access(user)
    
    # Get all verified transactions
    query = {"status": "verified", "is_deleted": {"$ne": True}}
    transactions = await db.accounting_transactions.find(query).to_list(50000)
    
    total_income = 0
    total_expense = 0
    monthly_trend = {}
    
    for tx in transactions:
        amount = tx.get("amount", 0)
        tx_date = tx.get("transaction_date", "2000-01-01")
        month_key = tx_date[:7]  # YYYY-MM
        
        if month_key not in monthly_trend:
            monthly_trend[month_key] = {"income": 0, "expense": 0}
        
        if tx.get("type") == "income":
            total_income += amount
            monthly_trend[month_key]["income"] += amount
        else:
            total_expense += amount
            monthly_trend[month_key]["expense"] += amount
    
    # Format monthly trend
    trend_list = []
    for key in sorted(monthly_trend.keys())[-12:]:  # Last 12 months
        parts = key.split("-")
        year = int(parts[0])
        month = int(parts[1])
        trend_list.append({
            "period": key,
            "month_name": f"{MALAY_MONTHS.get(month, month)} {year}",
            "income": round(monthly_trend[key]["income"], 2),
            "expense": round(monthly_trend[key]["expense"], 2),
            "net": round(monthly_trend[key]["income"] - monthly_trend[key]["expense"], 2)
        })
    
    return BalanceSheetResponse(
        as_of_date=datetime.now(timezone.utc).isoformat(),
        opening_balance=0,  # Could be set from config
        total_income=round(total_income, 2),
        total_expense=round(total_expense, 2),
        closing_balance=round(total_income - total_expense, 2),
        monthly_trend=trend_list
    )


# ==================== DASHBOARD STATS ====================

@router.get("/dashboard/stats")
async def get_dashboard_stats(
    user: dict = Depends(get_current_user)
):
    """Get accounting dashboard statistics"""
    db = get_db()
    check_accounting_access(user)
    
    now = datetime.now(timezone.utc)
    current_month = f"{now.year}-{now.month:02d}"
    
    # Current month stats
    month_query = {
        "transaction_date": {"$regex": f"^{current_month}"},
        "is_deleted": {"$ne": True}
    }
    
    month_income = await db.accounting_transactions.aggregate([
        {"$match": {**month_query, "type": "income", "status": "verified"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    
    month_expense = await db.accounting_transactions.aggregate([
        {"$match": {**month_query, "type": "expense", "status": "verified"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    
    pending_count = await db.accounting_transactions.count_documents({
        "status": "pending",
        "is_deleted": {"$ne": True}
    })
    
    # All time totals
    all_income = await db.accounting_transactions.aggregate([
        {"$match": {"type": "income", "status": "verified", "is_deleted": {"$ne": True}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    
    all_expense = await db.accounting_transactions.aggregate([
        {"$match": {"type": "expense", "status": "verified", "is_deleted": {"$ne": True}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    
    total_transactions = await db.accounting_transactions.count_documents({"is_deleted": {"$ne": True}})
    
    return {
        "current_month": {
            "month": now.month,
            "month_name": MALAY_MONTHS.get(now.month, str(now.month)),
            "year": now.year,
            "income": round(month_income[0]["total"], 2) if month_income else 0,
            "expense": round(month_expense[0]["total"], 2) if month_expense else 0,
            "net": round(
                (month_income[0]["total"] if month_income else 0) -
                (month_expense[0]["total"] if month_expense else 0),
                2
            )
        },
        "all_time": {
            "income": round(all_income[0]["total"], 2) if all_income else 0,
            "expense": round(all_expense[0]["total"], 2) if all_expense else 0,
            "balance": round(
                (all_income[0]["total"] if all_income else 0) -
                (all_expense[0]["total"] if all_expense else 0),
                2
            )
        },
        "pending_verification": pending_count,
        "total_transactions": total_transactions
    }


# ==================== AUDIT LOGS ====================

@router.get("/audit-logs")
async def list_audit_logs(
    transaction_id: Optional[str] = None,
    action: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user)
):
    """List accounting audit logs (JuruAudit only)"""
    db = get_db()
    check_juruaudit_access(user)
    
    query = {}
    if transaction_id:
        query["transaction_id"] = ObjectId(transaction_id)
    if action:
        query["action"] = action
    
    total = await db.accounting_audit_logs.count_documents(query)
    skip = (page - 1) * limit
    
    logs = await db.accounting_audit_logs.find(query)\
        .sort("performed_at", -1)\
        .skip(skip)\
        .limit(limit)\
        .to_list(limit)
    
    result = []
    for log in logs:
        performed_at = log.get("performed_at")
        if isinstance(performed_at, datetime):
            performed_at = performed_at.isoformat()
        
        result.append(AccountingAuditLogResponse(
            id=str(log["_id"]),
            transaction_id=str(log.get("transaction_id", "")),
            transaction_number=log.get("transaction_number", "-"),
            action=log.get("action", ""),
            action_display=AUDIT_ACTION_DISPLAY.get(log.get("action"), log.get("action", "")),
            old_value=log.get("old_value"),
            new_value=log.get("new_value"),
            performed_by=str(log.get("performed_by", "")),
            performed_by_name=log.get("performed_by_name", ""),
            performed_by_role=log.get("performed_by_role", ""),
            performed_at=performed_at or "",
            notes=log.get("notes")
        ))
    
    return {
        "logs": result,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": (total + limit - 1) // limit
        }
    }


# Keep existing summary endpoint for backward compatibility
@router.get("/summary")
async def get_accounting_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """
    Get comprehensive accounting summary for all modules.
    Access: superadmin, admin, bendahari, sub_bendahari, juruaudit
    """
    db = get_db()
    
    allowed_roles = ALL_ACCOUNTING_ROLES
    if user["role"] not in allowed_roles:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Build date query if provided
    date_query = {}
    if start_date:
        try:
            date_query["$gte"] = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        except Exception:
            pass
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            if "$gte" in date_query:
                date_query["$lte"] = end_dt
            else:
                date_query = {"$lte": end_dt}
        except Exception:
            pass

    config = await db.settings.find_one({"type": "module_settings"})
    modules_config = config.get("modules", {}) if config else {}
    koperasi_enabled = modules_config.get("koperasi", {}).get("enabled", True)
    marketplace_enabled = modules_config.get("marketplace", {}).get("enabled", True)
    
    # ============ MUAFAKAT ACCOUNT ============
    muafakat_query = {"commission_type": "muafakat"}
    if date_query:
        muafakat_query["created_at"] = date_query
    
    muafakat_pipeline = [
        {"$match": muafakat_query},
        {"$group": {
            "_id": "$status",
            "total": {"$sum": "$commission_amount"},
            "count": {"$sum": 1}
        }}
    ]
    muafakat_results = await db.commission_records.aggregate(muafakat_pipeline).to_list(10)
    
    muafakat_summary = {"confirmed": 0, "pending": 0, "paid_out": 0, "cancelled": 0}
    muafakat_counts = {"confirmed": 0, "pending": 0, "paid_out": 0, "cancelled": 0}
    for r in muafakat_results:
        if r["_id"] in muafakat_summary:
            muafakat_summary[r["_id"]] = round(r["total"], 2)
            muafakat_counts[r["_id"]] = r["count"]
    
    muafakat_total = muafakat_summary["confirmed"] + muafakat_summary["paid_out"]
    
    # ============ MERCHANDISE ACCOUNT ============
    merch_by_status = {}
    merch_total_sales = 0
    merch_total_orders = 0
    merch_stock_value = 0
    merch_stock_items = 0
    if marketplace_enabled:
        merch_query = {}
        if date_query:
            merch_query["created_at"] = date_query
        merch_pipeline = [
            {"$match": {**merch_query, "status": {"$ne": "cancelled"}}},
            {"$group": {"_id": "$status", "total": {"$sum": "$total_amount"}, "count": {"$sum": 1}}}
        ]
        merch_results = await db.merchandise_orders.aggregate(merch_pipeline).to_list(10)
        for r in merch_results:
            merch_by_status[r["_id"]] = {"amount": round(r["total"], 2), "count": r["count"]}
            if r["_id"] in ["paid", "processing", "ready", "delivered"]:
                merch_total_sales += r["total"]
            merch_total_orders += r["count"]
        merch_inventory_pipeline = [
            {"$match": {"is_active": True}},
            {"$group": {"_id": None, "total_stock_value": {"$sum": {"$multiply": ["$price", "$stock"]}}, "total_items": {"$sum": "$stock"}}}
        ]
        merch_inventory = await db.merchandise_products.aggregate(merch_inventory_pipeline).to_list(1)
        merch_stock_value = merch_inventory[0]["total_stock_value"] if merch_inventory else 0
        merch_stock_items = merch_inventory[0]["total_items"] if merch_inventory else 0
    
    # ============ KOPERASI ACCOUNT (termasuk PUM) ============
    koop_by_status = {}
    koop_total_sales = 0
    koop_total_orders = 0
    koop_commission_earned = 0
    pum_by_status = {}
    pum_total_sales = 0
    pum_total_orders = 0
    pum_commission_earned = 0
    pum_stock_value = 0
    pum_stock_items = 0
    if koperasi_enabled:
        koop_query = {}
        if date_query:
            koop_query["created_at"] = date_query
        koop_pipeline = [
            {"$match": {**koop_query, "status": {"$ne": "cancelled"}}},
            {"$group": {"_id": "$status", "total": {"$sum": "$total_amount"}, "count": {"$sum": 1}}}
        ]
        koop_results = await db.koop_orders.aggregate(koop_pipeline).to_list(10)
        for r in koop_results:
            koop_by_status[r["_id"]] = {"amount": round(r["total"], 2), "count": r["count"]}
            if r["_id"] in ["paid", "processing", "ready", "collected"]:
                koop_total_sales += r["total"]
            koop_total_orders += r["count"]
        koop_commission_query = {"commission_type": "koperasi"}
        if date_query:
            koop_commission_query["created_at"] = date_query
        koop_commission_pipeline = [
            {"$match": {**koop_commission_query, "status": {"$in": ["confirmed", "paid_out"]}}},
            {"$group": {"_id": None, "total": {"$sum": "$commission_amount"}}}
        ]
        koop_commission_result = await db.commission_records.aggregate(koop_commission_pipeline).to_list(1)
        koop_commission_earned = koop_commission_result[0]["total"] if koop_commission_result else 0
        pum_query = {}
        if date_query:
            pum_query["created_at"] = date_query
        pum_pipeline = [
            {"$match": {**pum_query, "status": {"$ne": "cancelled"}}},
            {"$group": {"_id": "$status", "total": {"$sum": "$total_amount"}, "count": {"$sum": 1}}}
        ]
        pum_results = await db.pum_orders.aggregate(pum_pipeline).to_list(10)
        for r in pum_results:
            pum_by_status[r["_id"]] = {"amount": round(r["total"], 2), "count": r["count"]}
            if r["_id"] in ["paid", "processing", "shipped", "delivered"]:
                pum_total_sales += r["total"]
            pum_total_orders += r["count"]
        pum_commission_query = {"commission_type": "pum"}
        if date_query:
            pum_commission_query["created_at"] = date_query
        pum_commission_pipeline = [
            {"$match": {**pum_commission_query, "status": {"$in": ["confirmed", "paid_out"]}}},
            {"$group": {"_id": None, "total": {"$sum": "$commission_amount"}}}
        ]
        pum_commission_result = await db.commission_records.aggregate(pum_commission_pipeline).to_list(1)
        pum_commission_earned = pum_commission_result[0]["total"] if pum_commission_result else 0
        pum_inventory_pipeline = [
            {"$match": {"is_active": True}},
            {"$group": {"_id": None, "total_stock_value": {"$sum": {"$multiply": ["$price", "$stock"]}}, "total_items": {"$sum": "$stock"}}}
        ]
        pum_inventory = await db.pum_products.aggregate(pum_inventory_pipeline).to_list(1)
        pum_stock_value = pum_inventory[0]["total_stock_value"] if pum_inventory else 0
        pum_stock_items = pum_inventory[0]["total_items"] if pum_inventory else 0
    
    # ============ GRAND TOTALS ============
    total_revenue = muafakat_total + koop_commission_earned + pum_commission_earned
    total_sales = merch_total_sales + koop_total_sales + pum_total_sales
    total_inventory_value = merch_stock_value + pum_stock_value
    
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "period": {
            "start_date": start_date,
            "end_date": end_date,
            "description": "Keseluruhan" if not start_date and not end_date else f"{start_date or 'Awal'} hingga {end_date or 'Kini'}"
        },
        "grand_totals": {
            "total_revenue": round(total_revenue, 2),
            "total_sales": round(total_sales, 2),
            "total_inventory_value": round(total_inventory_value, 2),
            "total_orders": merch_total_orders + koop_total_orders + pum_total_orders
        },
        "accounts": {
            "muafakat": {
                "name": "Akaun Muafakat",
                "description": "Pendapatan utama daripada komisyen jualan",
                "total_revenue": round(muafakat_total, 2),
                "confirmed": round(muafakat_summary["confirmed"], 2),
                "paid_out": round(muafakat_summary["paid_out"], 2),
                "pending": round(muafakat_summary["pending"], 2),
                "cancelled": round(muafakat_summary["cancelled"], 2),
                "transaction_counts": muafakat_counts
            },
            "merchandise": {
                "name": "Akaun Merchandise",
                "description": "Jualan barangan Muafakat",
                "total_sales": round(merch_total_sales, 2),
                "total_orders": merch_total_orders,
                "by_status": merch_by_status,
                "inventory": {"stock_value": round(merch_stock_value, 2), "total_items": merch_stock_items}
            },
            "koperasi": {
                "name": "Akaun Koperasi (termasuk PUM)",
                "description": "Jualan kit dan barangan koperasi maktab, termasuk Persatuan Usahawan Muda (PUM)",
                "total_sales": round(koop_total_sales + pum_total_sales, 2),
                "commission_earned": round(koop_commission_earned + pum_commission_earned, 2),
                "total_orders": koop_total_orders + pum_total_orders,
                "by_status": _merge_by_status(koop_by_status, pum_by_status),
                "inventory": {"stock_value": round(pum_stock_value, 2), "total_items": pum_stock_items},
                "sub_accounts": {
                    "koperasi": {
                        "name": "Koperasi",
                        "total_sales": round(koop_total_sales, 2),
                        "commission_earned": round(koop_commission_earned, 2),
                        "total_orders": koop_total_orders,
                        "by_status": koop_by_status
                    },
                    "pum": {
                        "name": "PUM",
                        "total_sales": round(pum_total_sales, 2),
                        "commission_earned": round(pum_commission_earned, 2),
                        "total_orders": pum_total_orders,
                        "by_status": pum_by_status,
                        "inventory": {"stock_value": round(pum_stock_value, 2), "total_items": pum_stock_items}
                    }
                }
            }
        }
    }


@router.get("/monthly-trend")
async def get_monthly_trend(
    months: int = 6,
    user: dict = Depends(get_current_user)
):
    """Get monthly revenue trend for the past N months."""
    db = get_db()
    
    if user["role"] not in ALL_ACCOUNTING_ROLES:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    start_date = datetime.now(timezone.utc) - timedelta(days=months * 30)
    config = await db.settings.find_one({"type": "module_settings"})
    modules_config = config.get("modules", {}) if config else {}
    koperasi_enabled = modules_config.get("koperasi", {}).get("enabled", True)
    
    pipeline = [
        {"$match": {"created_at": {"$gte": start_date}, "status": {"$in": ["confirmed", "paid_out"]}}},
        {"$group": {
            "_id": {"year": {"$year": "$created_at"}, "month": {"$month": "$created_at"}, "type": "$commission_type"},
            "amount": {"$sum": "$commission_amount"}
        }},
        {"$sort": {"_id.year": 1, "_id.month": 1}}
    ]
    
    results = await db.commission_records.aggregate(pipeline).to_list(100)
    
    monthly_data = {}
    for r in results:
        if not koperasi_enabled and r["_id"]["type"] in ("koperasi", "pum"):
            continue
        key = f"{r['_id']['year']}-{r['_id']['month']:02d}"
        if key not in monthly_data:
            monthly_data[key] = {
                "period": key,
                "month_name": f"{MALAY_MONTHS.get(r['_id']['month'], r['_id']['month'])} {r['_id']['year']}",
                "muafakat": 0, "koperasi": 0, "pum": 0, "total": 0
            }
        monthly_data[key][r["_id"]["type"]] = round(r["amount"], 2)
        monthly_data[key]["total"] += r["amount"]
    
    trend_data = sorted(monthly_data.values(), key=lambda x: x["period"])
    for item in trend_data:
        item["total"] = round(item["total"], 2)
    
    return {"months_requested": months, "trend": trend_data}
