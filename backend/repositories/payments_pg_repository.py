from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from bson import ObjectId
from fastapi import HTTPException

from models_sql.core_documents import CoreDocument
from repositories.core_store import CoreStore
from services.number_sequence_service import next_sequence_value
from services.tenant_enforcement import (
    assert_tenant_doc_access as enforce_tenant_doc_access,
    stamp_tenant_fields as apply_tenant_fields,
    tenant_scope_query as build_tenant_scope_query,
)


def _as_object_id_str(value: Any) -> str:
    if isinstance(value, ObjectId):
        return str(value)
    return str(value or "")


def _doc_with_id(row: CoreDocument) -> Dict[str, Any]:
    out = dict(row.document or {})
    out["_id"] = row.document_id
    return out


def _tenant_scope_from_user(current_user: Dict[str, Any]) -> Dict[str, str]:
    return build_tenant_scope_query(
        current_user,
        detail="Tenant context diperlukan untuk operasi pembayaran.",
    )


def _assert_tenant_doc_access(current_user: Dict[str, Any], doc: Optional[Dict[str, Any]], resource_name: str) -> None:
    enforce_tenant_doc_access(current_user, doc, resource_name)


def _stamp_tenant_fields(
    doc: Dict[str, Any],
    current_user: Dict[str, Any],
    *,
    fallback_doc: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return apply_tenant_fields(doc, current_user, fallback_doc=fallback_doc)


async def create_payment_with_transaction(
    core_store: CoreStore,
    *,
    fee_id: str,
    amount: float,
    payment_method: str,
    current_user: Dict[str, Any],
) -> Dict[str, Any]:
    session_factory = core_store.get_session_factory()
    if session_factory is None:
        raise HTTPException(status_code=500, detail="PostgreSQL session not available")

    async with session_factory() as session:
        async with session.begin():
            fee_row = await session.get(
                CoreDocument,
                {"collection_name": "student_yuran", "document_id": fee_id},
            )
            if fee_row is None:
                raise HTTPException(status_code=404, detail="Yuran tidak dijumpai. Sila gunakan /api/yuran/bayar/{student_yuran_id}")

            yuran = _doc_with_id(fee_row)
            _assert_tenant_doc_access(current_user, yuran, "rekod yuran")
            student_id = _as_object_id_str(yuran.get("student_id"))
            student_row: Optional[CoreDocument] = None
            if student_id:
                student_row = await session.get(
                    CoreDocument,
                    {"collection_name": "students", "document_id": student_id},
                )
            student = _doc_with_id(student_row) if student_row else None
            _assert_tenant_doc_access(current_user, student, "rekod pelajar")

            if current_user.get("role") == "parent" and student and str(student.get("parent_id")) != str(current_user.get("_id")):
                raise HTTPException(status_code=403, detail="Akses ditolak")

            total_amount = float(yuran.get("total_amount", 0) or 0)
            paid_amount = float(yuran.get("paid_amount", 0) or 0)
            remaining = total_amount - paid_amount
            if amount > remaining:
                raise HTTPException(status_code=400, detail=f"Jumlah melebihi baki (RM{remaining:.2f})")

            now_dt = datetime.now(timezone.utc)
            current_year = now_dt.year
            sequence_value = await next_sequence_value(
                core_store,
                sequence_key=f"payments.receipt.{current_year}",
                start_at=1,
            )
            if sequence_value is not None:
                receipt_number = f"MRSMKU-{current_year}-{sequence_value:05d}"
            else:
                receipt_number = f"MRSMKU-{now_dt.strftime('%Y%m%d%H%M%S%f')}"
            payment_id = str(ObjectId())
            now_iso = now_dt.isoformat()

            payment_doc = {
                "_id": payment_id,
                "fee_id": fee_id,
                "user_id": _as_object_id_str(current_user.get("_id")),
                "amount": amount,
                "payment_method": payment_method,
                "status": "completed",
                "receipt_number": receipt_number,
                "created_at": now_iso,
            }
            _stamp_tenant_fields(payment_doc, current_user, fallback_doc=yuran)

            session.add(
                CoreDocument(
                    collection_name="payments",
                    document_id=payment_id,
                    document={k: v for k, v in payment_doc.items() if k != "_id"},
                )
            )

            new_paid_amount = paid_amount + amount
            new_status = "paid" if new_paid_amount >= total_amount else "partial"

            yuran_payments = list(yuran.get("payments") or [])
            yuran_payments.append(
                {
                    "amount": amount,
                    "payment_method": payment_method,
                    "receipt_number": receipt_number,
                    "paid_at": now_iso,
                    "paid_by": _as_object_id_str(current_user.get("_id")),
                    "paid_by_name": current_user.get("full_name", ""),
                }
            )
            yuran["paid_amount"] = new_paid_amount
            yuran["status"] = new_status
            yuran["updated_at"] = now_iso
            yuran["payments"] = yuran_payments
            fee_row.document = {k: v for k, v in yuran.items() if k != "_id"}

            if student and student.get("parent_id"):
                notif_id = str(ObjectId())
                notif_doc = {
                    "_id": notif_id,
                    "user_id": _as_object_id_str(student["parent_id"]),
                    "title": "Pembayaran Berjaya",
                    "message": f"Pembayaran RM{amount:.2f} untuk {student.get('full_name', yuran.get('student_name', ''))} berjaya. Resit: {receipt_number}",
                    "type": "success",
                    "is_read": False,
                    "created_at": now_iso,
                }
                _stamp_tenant_fields(notif_doc, current_user, fallback_doc=yuran)
                session.add(
                    CoreDocument(
                        collection_name="notifications",
                        document_id=notif_id,
                        document={k: v for k, v in notif_doc.items() if k != "_id"},
                    )
                )

            audit_id = str(ObjectId())
            audit_doc = {
                "_id": audit_id,
                "user_id": _as_object_id_str(current_user.get("_id")),
                "user_name": current_user.get("full_name", "Unknown"),
                "user_role": current_user.get("role", "unknown"),
                "action": "PAYMENT",
                "module": "payments",
                "details": f"Bayar RM{amount} untuk {yuran.get('student_name', '')}",
                "created_at": now_iso,
            }
            _stamp_tenant_fields(audit_doc, current_user, fallback_doc=yuran)
            session.add(
                CoreDocument(
                    collection_name="audit_logs",
                    document_id=audit_id,
                    document={k: v for k, v in audit_doc.items() if k != "_id"},
                )
            )

    if core_store.is_mirror_mode():
        mongo_db = core_store.get_mongo_db()
        try:
            tenant_scope = _tenant_scope_from_user(current_user)
            await mongo_db.payments.insert_one(
                _stamp_tenant_fields({
                    "_id": ObjectId(payment_id),
                    "fee_id": ObjectId(fee_id) if len(fee_id) == 24 else fee_id,
                    "user_id": current_user.get("_id"),
                    "amount": amount,
                    "payment_method": payment_method,
                    "status": "completed",
                    "receipt_number": receipt_number,
                    "created_at": now_iso,
                }, current_user, fallback_doc=yuran)
            )
            yuran_mirror_filter = {"_id": ObjectId(fee_id) if len(fee_id) == 24 else fee_id, **tenant_scope}
            await mongo_db.student_yuran.update_one(
                yuran_mirror_filter,
                {
                    "$set": {"paid_amount": new_paid_amount, "status": new_status, "updated_at": now_iso},
                    "$push": {
                        "payments": {
                            "amount": amount,
                            "payment_method": payment_method,
                            "receipt_number": receipt_number,
                            "paid_at": now_iso,
                            "paid_by": _as_object_id_str(current_user.get("_id")),
                            "paid_by_name": current_user.get("full_name", ""),
                        }
                    },
                },
            )
            if student and student.get("parent_id"):
                await mongo_db.notifications.insert_one(
                    _stamp_tenant_fields({
                        "_id": ObjectId(notif_id),
                        "user_id": student["parent_id"],
                        "title": "Pembayaran Berjaya",
                        "message": f"Pembayaran RM{amount:.2f} untuk {student.get('full_name', yuran.get('student_name', ''))} berjaya. Resit: {receipt_number}",
                        "type": "success",
                        "is_read": False,
                        "created_at": now_iso,
                    }, current_user, fallback_doc=yuran)
                )
            await mongo_db.audit_logs.insert_one(
                _stamp_tenant_fields({
                    "_id": ObjectId(audit_id),
                    "user_id": current_user.get("_id"),
                    "user_name": current_user.get("full_name", "Unknown"),
                    "user_role": current_user.get("role", "unknown"),
                    "action": "PAYMENT",
                    "module": "payments",
                    "details": f"Bayar RM{amount} untuk {yuran.get('student_name', '')}",
                    "created_at": now_iso,
                }, current_user, fallback_doc=yuran)
            )
        except Exception:
            # Mirror is best-effort during transition.
            pass

    payment_doc["_id"] = ObjectId(payment_doc["_id"])
    return payment_doc

