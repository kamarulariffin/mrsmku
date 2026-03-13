"""
Bank Accounts & Financial Year Management
Pengurusan Akaun Bank dan Tahun Kewangan
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Any, Optional, List
from datetime import datetime, timezone
from bson import ObjectId
from services.id_normalizer import object_id_or_none

from models.accounting import (
    BankAccountType, BankAccountCreate, BankAccountUpdate, BankAccountResponse,
    FinancialYearCreate, FinancialYearUpdate, FinancialYearResponse,
    OpeningBalanceCreate, OpeningBalanceUpdate, OpeningBalanceResponse,
    BANK_ACCOUNT_TYPE_DISPLAY
)
from routes.accounting_financial_year_utils import ensure_current_financial_year

router = APIRouter(prefix="/api/accounting-full", tags=["Bank Accounts"])
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


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Token diperlukan")
    return await _get_current_user_func(credentials)


async def log_audit(user, action, module, details):
    if _log_audit_func and user:
        await _log_audit_func(user, action, module, details)


def _id_value(value: Any) -> Any:
    """Normalize ID-like inputs while supporting non-ObjectId IDs."""
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return value
    text = str(value)
    try:
        if ObjectId.is_valid(text):
            return object_id_or_none(text)
    except Exception:
        pass
    return text


# Role checks
BENDAHARI_ROLES = ["superadmin", "admin", "bendahari", "sub_bendahari"]
ALL_ACCOUNTING_ROLES = ["superadmin", "admin", "bendahari", "sub_bendahari", "juruaudit"]


def check_bendahari_access(user):
    if user["role"] not in BENDAHARI_ROLES:
        raise HTTPException(status_code=403, detail="Akses hanya untuk Bendahari")


def check_accounting_access(user):
    if user["role"] not in ALL_ACCOUNTING_ROLES:
        raise HTTPException(status_code=403, detail="Akses ditolak")


# ==================== BANK ACCOUNTS ====================

@router.get("/bank-accounts", response_model=List[BankAccountResponse])
async def list_bank_accounts(
    include_inactive: bool = False,
    user: dict = Depends(get_current_user)
):
    """List all bank accounts"""
    db = get_db()
    check_accounting_access(user)
    
    query = {}
    if not include_inactive:
        query["is_active"] = True
    
    accounts = await db.bank_accounts.find(query).sort("name", 1).to_list(100)
    
    result = []
    for acc in accounts:
        # Calculate current balance
        balance = await calculate_account_balance(db, str(acc["_id"]))
        
        created_at = acc.get("created_at")
        if isinstance(created_at, datetime):
            created_at = created_at.isoformat()
        
        result.append(BankAccountResponse(
            id=str(acc["_id"]),
            name=acc["name"],
            account_type=acc["account_type"],
            account_type_display=BANK_ACCOUNT_TYPE_DISPLAY.get(acc["account_type"], acc["account_type"]),
            bank_name=acc.get("bank_name"),
            account_number=acc.get("account_number"),
            description=acc.get("description"),
            account_code=acc.get("account_code"),
            is_active=acc.get("is_active", True),
            current_balance=balance,
            created_at=created_at or "",
            created_by_name=acc.get("created_by_name")
        ))
    
    return result


@router.post("/bank-accounts", response_model=BankAccountResponse)
async def create_bank_account(
    data: BankAccountCreate,
    user: dict = Depends(get_current_user)
):
    """Create new bank account (Bendahari only)"""
    db = get_db()
    check_bendahari_access(user)
    
    # Check duplicate name
    existing = await db.bank_accounts.find_one({"name": data.name})
    if existing:
        raise HTTPException(status_code=400, detail="Akaun bank dengan nama ini sudah wujud")
    
    now = datetime.now(timezone.utc)
    doc = {
        "name": data.name,
        "account_type": data.account_type.value,
        "bank_name": data.bank_name,
        "account_number": data.account_number,
        "description": data.description,
        "account_code": data.account_code if hasattr(data, "account_code") else None,
        "is_active": data.is_active,
        "created_at": now,
        "created_by": user["_id"],
        "created_by_name": user.get("full_name", "")
    }
    
    result = await db.bank_accounts.insert_one(doc)
    
    await log_audit(user, "CREATE_BANK_ACCOUNT", "accounting", f"Cipta akaun bank: {data.name}")
    
    return BankAccountResponse(
        id=str(result.inserted_id),
        name=data.name,
        account_type=data.account_type.value,
        account_type_display=BANK_ACCOUNT_TYPE_DISPLAY.get(data.account_type.value, data.account_type.value),
        bank_name=data.bank_name,
        account_number=data.account_number,
        description=data.description,
        account_code=getattr(data, "account_code", None),
        is_active=data.is_active,
        current_balance=0.0,
        created_at=now.isoformat(),
        created_by_name=user.get("full_name", "")
    )


@router.put("/bank-accounts/{account_id}", response_model=BankAccountResponse)
async def update_bank_account(
    account_id: str,
    data: BankAccountUpdate,
    user: dict = Depends(get_current_user)
):
    """Update bank account (Bendahari only)"""
    db = get_db()
    check_bendahari_access(user)
    
    account = await db.bank_accounts.find_one({"_id": _id_value(account_id)})
    if not account:
        raise HTTPException(status_code=404, detail="Akaun bank tidak dijumpai")
    
    update_data = {}
    if data.name is not None:
        existing = await db.bank_accounts.find_one({
            "name": data.name,
            "_id": {"$ne": _id_value(account_id)}
        })
        if existing:
            raise HTTPException(status_code=400, detail="Akaun bank dengan nama ini sudah wujud")
        update_data["name"] = data.name
    
    if data.account_type is not None:
        update_data["account_type"] = data.account_type.value
    if data.bank_name is not None:
        update_data["bank_name"] = data.bank_name
    if data.account_number is not None:
        update_data["account_number"] = data.account_number
    if data.description is not None:
        update_data["description"] = data.description
    if getattr(data, "account_code", None) is not None:
        update_data["account_code"] = data.account_code
    if data.is_active is not None:
        update_data["is_active"] = data.is_active

    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc)
        update_data["updated_by"] = user["_id"]
        await db.bank_accounts.update_one(
            {"_id": _id_value(account_id)},
            {"$set": update_data}
        )
    
    await log_audit(user, "UPDATE_BANK_ACCOUNT", "accounting", f"Kemaskini akaun bank: {account['name']}")
    
    # Fetch updated
    updated = await db.bank_accounts.find_one({"_id": _id_value(account_id)})
    balance = await calculate_account_balance(db, account_id)
    
    created_at = updated.get("created_at")
    if isinstance(created_at, datetime):
        created_at = created_at.isoformat()
    
    return BankAccountResponse(
        id=str(updated["_id"]),
        name=updated["name"],
        account_type=updated["account_type"],
        account_type_display=BANK_ACCOUNT_TYPE_DISPLAY.get(updated["account_type"], updated["account_type"]),
        bank_name=updated.get("bank_name"),
        account_number=updated.get("account_number"),
        description=updated.get("description"),
        account_code=updated.get("account_code"),
        is_active=updated.get("is_active", True),
        current_balance=balance,
        created_at=created_at or "",
        created_by_name=updated.get("created_by_name")
    )


@router.delete("/bank-accounts/{account_id}")
async def delete_bank_account(
    account_id: str,
    user: dict = Depends(get_current_user)
):
    """Soft delete bank account (Bendahari only)"""
    db = get_db()
    check_bendahari_access(user)
    
    account = await db.bank_accounts.find_one({"_id": _id_value(account_id)})
    if not account:
        raise HTTPException(status_code=404, detail="Akaun bank tidak dijumpai")
    
    # Check if has transactions
    tx_count = await db.accounting_transactions.count_documents({"bank_account_id": account_id})
    if tx_count > 0:
        await db.bank_accounts.update_one(
            {"_id": _id_value(account_id)},
            {"$set": {"is_active": False, "deleted_at": datetime.now(timezone.utc)}}
        )
        await log_audit(user, "SOFT_DELETE_BANK_ACCOUNT", "accounting", f"Nyahaktifkan akaun: {account['name']} ({tx_count} transaksi)")
        return {"message": f"Akaun dinyahaktifkan kerana terdapat {tx_count} transaksi berkaitan"}
    
    await db.bank_accounts.delete_one({"_id": _id_value(account_id)})
    await log_audit(user, "DELETE_BANK_ACCOUNT", "accounting", f"Padam akaun bank: {account['name']}")
    
    return {"message": "Akaun bank berjaya dipadam"}


# ==================== FINANCIAL YEARS ====================

@router.get("/financial-years", response_model=List[FinancialYearResponse])
async def list_financial_years(
    user: dict = Depends(get_current_user)
):
    """List all financial years"""
    db = get_db()
    check_accounting_access(user)
    
    years = await db.financial_years.find().sort("start_date", -1).to_list(100)
    
    result = []
    for fy in years:
        created_at = fy.get("created_at")
        if isinstance(created_at, datetime):
            created_at = created_at.isoformat()
        
        result.append(FinancialYearResponse(
            id=str(fy["_id"]),
            name=fy["name"],
            start_date=fy["start_date"],
            end_date=fy["end_date"],
            is_current=fy.get("is_current", False),
            is_closed=fy.get("is_closed", False),
            notes=fy.get("notes"),
            created_at=created_at or "",
            created_by_name=fy.get("created_by_name")
        ))
    
    return result


@router.get("/financial-years/current")
async def get_current_financial_year(
    user: dict = Depends(get_current_user)
):
    """Get current active financial year"""
    db = get_db()
    check_accounting_access(user)

    fy = await ensure_current_financial_year(db, auto_create=True)
    if not fy:
        raise HTTPException(status_code=404, detail="Tiada tahun kewangan aktif. Sila cipta tahun kewangan.")
    
    created_at = fy.get("created_at")
    if isinstance(created_at, datetime):
        created_at = created_at.isoformat()
    
    return FinancialYearResponse(
        id=str(fy["_id"]),
        name=fy["name"],
        start_date=fy["start_date"],
        end_date=fy["end_date"],
        is_current=fy.get("is_current", False),
        is_closed=fy.get("is_closed", False),
        notes=fy.get("notes"),
        created_at=created_at or "",
        created_by_name=fy.get("created_by_name")
    )


@router.post("/financial-years", response_model=FinancialYearResponse)
async def create_financial_year(
    data: FinancialYearCreate,
    user: dict = Depends(get_current_user)
):
    """Create new financial year (Bendahari only)"""
    db = get_db()
    check_bendahari_access(user)
    
    # Validate dates
    try:
        start = datetime.strptime(data.start_date, "%Y-%m-%d")
        end = datetime.strptime(data.end_date, "%Y-%m-%d")
        if end <= start:
            raise HTTPException(status_code=400, detail="Tarikh akhir mesti selepas tarikh mula")
    except ValueError:
        raise HTTPException(status_code=400, detail="Format tarikh tidak sah (YYYY-MM-DD)")
    
    # Check overlap
    existing = await db.financial_years.find_one({
        "$or": [
            {"start_date": {"$lte": data.end_date}, "end_date": {"$gte": data.start_date}},
        ]
    })
    if existing:
        raise HTTPException(status_code=400, detail=f"Bertindih dengan tahun kewangan sedia ada: {existing['name']}")
    
    # If setting as current, unset others
    if data.is_current:
        await db.financial_years.update_many({}, {"$set": {"is_current": False}})
    
    now = datetime.now(timezone.utc)
    doc = {
        "name": data.name,
        "start_date": data.start_date,
        "end_date": data.end_date,
        "is_current": data.is_current,
        "is_closed": False,
        "notes": data.notes,
        "created_at": now,
        "created_by": user["_id"],
        "created_by_name": user.get("full_name", "")
    }
    
    result = await db.financial_years.insert_one(doc)
    
    await log_audit(user, "CREATE_FINANCIAL_YEAR", "accounting", f"Cipta tahun kewangan: {data.name}")
    
    return FinancialYearResponse(
        id=str(result.inserted_id),
        name=data.name,
        start_date=data.start_date,
        end_date=data.end_date,
        is_current=data.is_current,
        is_closed=False,
        notes=data.notes,
        created_at=now.isoformat(),
        created_by_name=user.get("full_name", "")
    )


@router.put("/financial-years/{year_id}", response_model=FinancialYearResponse)
async def update_financial_year(
    year_id: str,
    data: FinancialYearUpdate,
    user: dict = Depends(get_current_user)
):
    """Update financial year (Bendahari only)"""
    db = get_db()
    check_bendahari_access(user)
    
    fy = await db.financial_years.find_one({"_id": _id_value(year_id)})
    if not fy:
        raise HTTPException(status_code=404, detail="Tahun kewangan tidak dijumpai")
    
    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.start_date is not None:
        update_data["start_date"] = data.start_date
    if data.end_date is not None:
        update_data["end_date"] = data.end_date
    if data.notes is not None:
        update_data["notes"] = data.notes
    
    if data.is_current is True:
        await db.financial_years.update_many(
            {"_id": {"$ne": _id_value(year_id)}},
            {"$set": {"is_current": False}}
        )
        update_data["is_current"] = True
    elif data.is_current is False:
        update_data["is_current"] = False
    
    if data.is_closed is not None:
        update_data["is_closed"] = data.is_closed
    
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc)
        update_data["updated_by"] = user["_id"]
        await db.financial_years.update_one(
            {"_id": _id_value(year_id)},
            {"$set": update_data}
        )
    
    await log_audit(user, "UPDATE_FINANCIAL_YEAR", "accounting", f"Kemaskini tahun kewangan: {fy['name']}")
    
    # Fetch updated
    updated = await db.financial_years.find_one({"_id": _id_value(year_id)})
    
    created_at = updated.get("created_at")
    if isinstance(created_at, datetime):
        created_at = created_at.isoformat()
    
    return FinancialYearResponse(
        id=str(updated["_id"]),
        name=updated["name"],
        start_date=updated["start_date"],
        end_date=updated["end_date"],
        is_current=updated.get("is_current", False),
        is_closed=updated.get("is_closed", False),
        notes=updated.get("notes"),
        created_at=created_at or "",
        created_by_name=updated.get("created_by_name")
    )


@router.post("/financial-years/{year_id}/close")
async def close_financial_year(
    year_id: str,
    user: dict = Depends(get_current_user)
):
    """Close a financial year (JuruAudit only)"""
    db = get_db()
    if user["role"] not in ["superadmin", "juruaudit"]:
        raise HTTPException(status_code=403, detail="Hanya JuruAudit boleh tutup tahun kewangan")
    
    fy = await db.financial_years.find_one({"_id": _id_value(year_id)})
    if not fy:
        raise HTTPException(status_code=404, detail="Tahun kewangan tidak dijumpai")
    
    if fy.get("is_closed"):
        raise HTTPException(status_code=400, detail="Tahun kewangan sudah ditutup")
    
    # Check for pending transactions
    pending = await db.accounting_transactions.count_documents({
        "transaction_date": {"$gte": fy["start_date"], "$lte": fy["end_date"]},
        "status": "pending"
    })
    if pending > 0:
        raise HTTPException(status_code=400, detail=f"Terdapat {pending} transaksi yang belum disahkan")
    
    await db.financial_years.update_one(
        {"_id": _id_value(year_id)},
        {"$set": {
            "is_closed": True,
            "is_current": False,
            "closed_at": datetime.now(timezone.utc),
            "closed_by": user["_id"],
            "closed_by_name": user.get("full_name", "")
        }}
    )
    
    await log_audit(user, "CLOSE_FINANCIAL_YEAR", "accounting", f"Tutup tahun kewangan: {fy['name']}")
    
    return {"message": f"Tahun kewangan {fy['name']} berjaya ditutup"}


# ==================== OPENING BALANCES ====================

@router.get("/opening-balances")
async def list_opening_balances(
    financial_year_id: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """List opening balances"""
    db = get_db()
    check_accounting_access(user)
    
    query = {}
    if financial_year_id:
        query["financial_year_id"] = financial_year_id
    
    balances = await db.opening_balances.find(query).sort("created_at", -1).to_list(100)
    
    # Get financial years and bank accounts for display names
    fy_ids = list(set([b.get("financial_year_id") for b in balances if b.get("financial_year_id")]))
    acc_ids = list(set([b.get("bank_account_id") for b in balances if b.get("bank_account_id")]))
    
    fys = {}
    accs = {}
    if fy_ids:
        fy_docs = await db.financial_years.find({"_id": {"$in": [_id_value(f) for f in fy_ids]}}).to_list(100)
        fys = {str(f["_id"]): f["name"] for f in fy_docs}
    if acc_ids:
        acc_docs = await db.bank_accounts.find({"_id": {"$in": [_id_value(a) for a in acc_ids]}}).to_list(100)
        accs = {str(a["_id"]): a["name"] for a in acc_docs}
    
    result = []
    for bal in balances:
        created_at = bal.get("created_at")
        if isinstance(created_at, datetime):
            created_at = created_at.isoformat()
        
        result.append(OpeningBalanceResponse(
            id=str(bal["_id"]),
            financial_year_id=bal.get("financial_year_id", ""),
            financial_year_name=fys.get(bal.get("financial_year_id"), "Tidak Diketahui"),
            bank_account_id=bal.get("bank_account_id", ""),
            bank_account_name=accs.get(bal.get("bank_account_id"), "Tidak Diketahui"),
            amount=bal.get("amount", 0),
            notes=bal.get("notes"),
            created_at=created_at or "",
            created_by_name=bal.get("created_by_name")
        ))
    
    return result


@router.post("/opening-balances", response_model=OpeningBalanceResponse)
async def create_opening_balance(
    data: OpeningBalanceCreate,
    user: dict = Depends(get_current_user)
):
    """Create or update opening balance for a bank account in a financial year"""
    db = get_db()
    check_bendahari_access(user)
    
    # Validate financial year
    fy = await db.financial_years.find_one({"_id": _id_value(data.financial_year_id)})
    if not fy:
        raise HTTPException(status_code=404, detail="Tahun kewangan tidak dijumpai")
    if fy.get("is_closed"):
        raise HTTPException(status_code=400, detail="Tahun kewangan sudah ditutup")
    
    # Validate bank account
    acc = await db.bank_accounts.find_one({"_id": _id_value(data.bank_account_id)})
    if not acc:
        raise HTTPException(status_code=404, detail="Akaun bank tidak dijumpai")
    
    # Check if already exists - update instead
    existing = await db.opening_balances.find_one({
        "financial_year_id": data.financial_year_id,
        "bank_account_id": data.bank_account_id
    })
    
    now = datetime.now(timezone.utc)
    
    if existing:
        old_amount = existing.get("amount", 0)
        await db.opening_balances.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "amount": data.amount,
                "notes": data.notes,
                "updated_at": now,
                "updated_by": user["_id"],
                "updated_by_name": user.get("full_name", "")
            }}
        )
        await log_audit(user, "UPDATE_OPENING_BALANCE", "accounting", 
            f"Kemaskini baki bawa ke hadapan {acc['name']}: RM{old_amount:.2f} → RM{data.amount:.2f}")
        
        return OpeningBalanceResponse(
            id=str(existing["_id"]),
            financial_year_id=data.financial_year_id,
            financial_year_name=fy["name"],
            bank_account_id=data.bank_account_id,
            bank_account_name=acc["name"],
            amount=data.amount,
            notes=data.notes,
            created_at=existing.get("created_at", now).isoformat() if isinstance(existing.get("created_at"), datetime) else str(existing.get("created_at", "")),
            created_by_name=existing.get("created_by_name")
        )
    
    doc = {
        "financial_year_id": data.financial_year_id,
        "bank_account_id": data.bank_account_id,
        "amount": data.amount,
        "notes": data.notes,
        "created_at": now,
        "created_by": user["_id"],
        "created_by_name": user.get("full_name", "")
    }
    
    result = await db.opening_balances.insert_one(doc)
    
    await log_audit(user, "CREATE_OPENING_BALANCE", "accounting", 
        f"Tetapkan baki bawa ke hadapan {acc['name']}: RM{data.amount:.2f}")
    
    return OpeningBalanceResponse(
        id=str(result.inserted_id),
        financial_year_id=data.financial_year_id,
        financial_year_name=fy["name"],
        bank_account_id=data.bank_account_id,
        bank_account_name=acc["name"],
        amount=data.amount,
        notes=data.notes,
        created_at=now.isoformat(),
        created_by_name=user.get("full_name", "")
    )


@router.delete("/opening-balances/{balance_id}")
async def delete_opening_balance(
    balance_id: str,
    user: dict = Depends(get_current_user)
):
    """Delete opening balance"""
    db = get_db()
    check_bendahari_access(user)
    
    balance = await db.opening_balances.find_one({"_id": _id_value(balance_id)})
    if not balance:
        raise HTTPException(status_code=404, detail="Baki tidak dijumpai")
    
    # Check if financial year is closed
    fy = await db.financial_years.find_one({"_id": _id_value(balance.get("financial_year_id"))})
    if fy and fy.get("is_closed"):
        raise HTTPException(status_code=400, detail="Tahun kewangan sudah ditutup")
    
    await db.opening_balances.delete_one({"_id": _id_value(balance_id)})
    await log_audit(user, "DELETE_OPENING_BALANCE", "accounting", "Padam baki bawa ke hadapan")
    
    return {"message": "Baki bawa ke hadapan berjaya dipadam"}


# ==================== HELPER FUNCTIONS ====================

async def calculate_account_balance(db, bank_account_id: str) -> float:
    """Calculate current balance for a bank account"""
    # Get current financial year
    today = datetime.now().strftime("%Y-%m-%d")
    fy = await db.financial_years.find_one({
        "start_date": {"$lte": today},
        "end_date": {"$gte": today}
    })
    
    opening_balance = 0.0
    if fy:
        ob = await db.opening_balances.find_one({
            "financial_year_id": str(fy["_id"]),
            "bank_account_id": bank_account_id
        })
        if ob:
            opening_balance = ob.get("amount", 0)
    
    # Sum all verified transactions for this account without aggregate()
    total_income = 0.0
    async for row in db.accounting_transactions.find({
        "bank_account_id": bank_account_id,
        "type": "income",
        "status": "verified",
        "is_deleted": {"$ne": True},
    }):
        total_income += float(row.get("amount", 0) or 0)

    total_expense = 0.0
    async for row in db.accounting_transactions.find({
        "bank_account_id": bank_account_id,
        "type": "expense",
        "status": "verified",
        "is_deleted": {"$ne": True},
    }):
        total_expense += float(row.get("amount", 0) or 0)
    
    return round(opening_balance + total_income - total_expense, 2)


async def get_total_opening_balance(db, financial_year_id: str) -> float:
    """Get total opening balance for all accounts in a financial year"""
    total = 0.0
    async for row in db.opening_balances.find({"financial_year_id": financial_year_id}):
        total += float(row.get("amount", 0) or 0)
    return total
