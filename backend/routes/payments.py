"""
Payment Routes - Payment processing
Extracted from server.py for better code organization
Refactored using the proper dependency injection pattern
"""
from datetime import datetime, timezone
from typing import List, Callable, Dict, Any

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from bson import ObjectId
from services.id_normalizer import object_id_or_none
from repositories.core_store import CoreStore
from repositories.payments_pg_repository import create_payment_with_transaction
from services.number_sequence_service import next_sequence_value
from services.tenant_enforcement import (
    assert_tenant_doc_access as enforce_tenant_doc_access,
    stamp_tenant_fields as apply_tenant_fields,
    tenant_scope_query as build_tenant_scope_query,
)

router = APIRouter(prefix="/api/payments", tags=["Payments"])
security = HTTPBearer(auto_error=False)

# ============ INJECTED DEPENDENCIES ============
_get_db_func: Callable = None
_get_current_user_func: Callable = None
_log_audit_func: Callable = None


def init_router(get_db_func, auth_func, log_audit_func):
    """
    Initialize router with dependencies from server.py
    
    Args:
        get_db_func: Function that returns database instance
        auth_func: get_current_user function from server.py
        log_audit_func: log_audit function from server.py
    """
    global _get_db_func, _get_current_user_func, _log_audit_func
    
    _get_db_func = get_db_func
    _get_current_user_func = auth_func
    _log_audit_func = log_audit_func


# ============ LOCAL DEPENDENCY WRAPPERS ============

def get_db():
    """Get database instance"""
    return _get_db_func()


def _as_object_id_if_valid(value):
    if isinstance(value, ObjectId):
        return value
    if isinstance(value, str):
        oid = object_id_or_none(value)
        return oid if oid is not None else value
    return value


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Wrapper for authentication - calls server.py's get_current_user"""
    if not credentials:
        raise HTTPException(status_code=401, detail="Token diperlukan")
    return await _get_current_user_func(credentials)


async def log_audit(user, action, module, details):
    """Wrapper for audit logging"""
    if _log_audit_func and user:
        await _log_audit_func(user, action, module, details)


def _tenant_scope_query(current_user: dict) -> Dict[str, Any]:
    return build_tenant_scope_query(
        current_user,
        detail="Tenant context diperlukan untuk operasi pembayaran.",
    )


def _assert_tenant_doc_access(current_user: dict, doc: dict, resource_name: str) -> None:
    enforce_tenant_doc_access(current_user, doc, resource_name)


def _stamp_tenant_fields(doc: Dict[str, Any], current_user: dict, fallback_doc: dict = None) -> Dict[str, Any]:
    return apply_tenant_fields(doc, current_user, fallback_doc=fallback_doc)


async def generate_payment_receipt_number(db) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"MRSMKU-{year}-"
    sequence_value = await next_sequence_value(
        db,
        sequence_key=f"payments.receipt.{year}",
        start_at=1,
    )
    if sequence_value is not None:
        return f"{prefix}{sequence_value:05d}"
    return f"MRSMKU-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"


# ============ PYDANTIC MODELS ============

class PaymentCreate(BaseModel):
    fee_id: str
    amount: float
    payment_method: str


class PaymentResponse(BaseModel):
    id: str
    fee_id: str
    amount: float
    payment_method: str
    status: str
    receipt_number: str
    created_at: str


def serialize_payment(payment: dict) -> PaymentResponse:
    created_at = payment.get("created_at", "")
    if hasattr(created_at, 'isoformat'):
        created_at = created_at.isoformat()
    return PaymentResponse(
        id=str(payment["_id"]),
        fee_id=str(payment.get("fee_id", "")),
        amount=payment.get("amount", 0),
        payment_method=payment.get("payment_method", ""),
        status=payment.get("status", "pending"),
        receipt_number=payment.get("receipt_number", ""),
        created_at=created_at
    )


# ============ ROUTES ============

@router.post("", response_model=PaymentResponse)
async def create_payment(payment_data: PaymentCreate, current_user: dict = Depends(get_current_user)):
    """Make payment - uses student_yuran collection"""
    db = get_db()

    if isinstance(db, CoreStore) and db.uses_postgres("payments"):
        payment_doc = await create_payment_with_transaction(
            db,
            fee_id=payment_data.fee_id,
            amount=payment_data.amount,
            payment_method=payment_data.payment_method,
            current_user=current_user,
        )
        return serialize_payment(payment_doc)
    
    fee_lookup_id = _as_object_id_if_valid(payment_data.fee_id)
    yuran = await db.student_yuran.find_one({"_id": fee_lookup_id})
    _assert_tenant_doc_access(current_user, yuran, "rekod yuran")
    if not yuran:
        raise HTTPException(status_code=404, detail="Yuran tidak dijumpai. Sila gunakan /api/yuran/bayar/{student_yuran_id}")
    
    student = await db.students.find_one({"_id": yuran.get("student_id")})
    _assert_tenant_doc_access(current_user, student, "rekod pelajar")
    if current_user["role"] == "parent" and student and str(student.get("parent_id")) != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    remaining = yuran.get("total_amount", 0) - yuran.get("paid_amount", 0)
    if payment_data.amount > remaining:
        raise HTTPException(status_code=400, detail=f"Jumlah melebihi baki (RM{remaining:.2f})")
    
    receipt_number = await generate_payment_receipt_number(db)
    now_iso = datetime.now(timezone.utc).isoformat()
    
    payment_doc = _stamp_tenant_fields({
        "fee_id": fee_lookup_id,
        "user_id": current_user["_id"],
        "amount": payment_data.amount,
        "payment_method": payment_data.payment_method,
        "status": "completed",
        "receipt_number": receipt_number,
        "created_at": now_iso
    }, current_user, fallback_doc=yuran)
    payments_insert_result = await db.payments.insert_one(payment_doc)
    payment_doc["_id"] = payments_insert_result.inserted_id

    # Keep canonical yuran payment ledger aligned with /api/yuran flows.
    yuran_payment_doc = _stamp_tenant_fields({
        "student_yuran_id": yuran.get("_id"),
        "student_id": yuran.get("student_id"),
        "parent_id": student.get("parent_id") if student else None,
        "amount": payment_data.amount,
        "payment_type": "manual",
        "payment_method": payment_data.payment_method,
        "receipt_number": receipt_number,
        "description": "Bayaran melalui /api/payments",
        "status": "completed",
        "created_at": now_iso,
        "created_by": current_user.get("_id"),
    }, current_user, fallback_doc=yuran)
    yuran_payment_insert_result = await db.yuran_payments.insert_one(yuran_payment_doc)
    
    new_paid_amount = yuran.get("paid_amount", 0) + payment_data.amount
    new_status = "paid" if new_paid_amount >= yuran.get("total_amount", 0) else "partial"
    
    # Update student_yuran
    try:
        await db.student_yuran.update_one(
            {"_id": fee_lookup_id},
            {
                "$set": {
                    "paid_amount": new_paid_amount, 
                    "balance": max(0, yuran.get("total_amount", 0) - new_paid_amount),
                    "status": new_status,
                    "updated_at": now_iso
                },
                "$push": {
                    "payments": {
                        "amount": payment_data.amount,
                        "payment_method": payment_data.payment_method,
                        "receipt_number": receipt_number,
                        "paid_at": now_iso,
                        "paid_by": str(current_user["_id"]),
                        "paid_by_name": current_user.get("full_name", "")
                    }
                }
            }
        )
    except Exception:
        # Compensating rollback to avoid orphan payment rows.
        inserted_yuran_payment_id = getattr(yuran_payment_insert_result, "inserted_id", None)
        if inserted_yuran_payment_id is not None:
            try:
                await db.yuran_payments.delete_one({"_id": inserted_yuran_payment_id})
            except Exception:
                pass
        inserted_payment_id = getattr(payments_insert_result, "inserted_id", None)
        if inserted_payment_id is not None:
            try:
                await db.payments.delete_one({"_id": inserted_payment_id})
            except Exception:
                pass
        raise
    
    if student and student.get("parent_id"):
        notification_doc = _stamp_tenant_fields({
            "user_id": student["parent_id"],
            "title": "Pembayaran Berjaya",
            "message": f"Pembayaran RM{payment_data.amount:.2f} untuk {student.get('full_name', yuran.get('student_name', ''))} berjaya. Resit: {receipt_number}",
            "type": "success",
            "is_read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }, current_user, fallback_doc=yuran)
        await db.notifications.insert_one(notification_doc)
    
    await log_audit(current_user, "PAYMENT", "payments", f"Bayar RM{payment_data.amount} untuk {yuran.get('student_name', '')}")
    
    return serialize_payment(payment_doc)


@router.get("", response_model=List[PaymentResponse])
async def get_payments(current_user: dict = Depends(get_current_user)):
    """Get payments"""
    db = get_db()
    tenant_scope = _tenant_scope_query(current_user)
    if current_user["role"] == "parent":
        query = {"user_id": current_user["_id"], **tenant_scope}
        payments = await db.payments.find(query).to_list(1000)
    else:
        query = tenant_scope if tenant_scope else {}
        payments = await db.payments.find(query).to_list(10000)
    return [serialize_payment(p) for p in payments]
