"""
Modul Yuran Komprehensif - MRSMKU Portal
Pengurusan Set Yuran, Pelajar Tingkatan, dan Tunggakan
"""
import asyncio
import re
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from collections import defaultdict
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

from repositories.tabung_relational_store import adapt_tabung_read_db
from repositories.yuran_relational_store import adapt_yuran_read_db
from services.number_sequence_service import next_sequence_value

try:
    from sqlalchemy import select, func
    from models_sql.yuran_tables import YuranPaymentRecord
except Exception:  # pragma: no cover - fallback for environments without SQLAlchemy runtime
    select = None
    func = None
    YuranPaymentRecord = None

router = APIRouter(prefix="/api/yuran", tags=["Yuran"])
security = HTTPBearer(auto_error=False)

# Will be set by server.py
_get_db_func = None
_get_core_db_func = None
_get_current_user_func = None
_log_audit_func = None
_ROLES = None

# Yuran category ID for accounting integration
YURAN_CATEGORY_ID = "69925c67637e5c7fde5e0f44"  # "Yuran Pelajar" category
_RECEIPT_NUMBER_LOCK = asyncio.Lock()
_ACCOUNTING_TRANSACTION_NUMBER_LOCK = asyncio.Lock()


def init_router(get_db_func, auth_func, audit_func, roles, get_core_db_func=None):
    global _get_db_func, _get_core_db_func, _get_current_user_func, _log_audit_func, _ROLES
    _get_db_func = get_db_func
    _get_core_db_func = get_core_db_func
    _get_current_user_func = auth_func
    _log_audit_func = audit_func
    _ROLES = roles


async def generate_accounting_transaction_number(db):
    """Generate unique transaction number: TRX-YYYY-XXXX"""
    year = datetime.now().year
    prefix = f"TRX-{year}-"

    sequence_value = await next_sequence_value(
        db,
        sequence_key=f"yuran.accounting_tx.{year}",
        start_at=1,
    )
    if sequence_value is not None:
        return f"{prefix}{sequence_value:04d}"

    # Guard against duplicate generation inside the same app process.
    async with _ACCOUNTING_TRANSACTION_NUMBER_LOCK:
        latest = await db.accounting_transactions.find_one(
            {"transaction_number": {"$regex": f"^{prefix}"}},
            sort=[("transaction_number", -1)]
        )

        if latest and latest.get("transaction_number"):
            try:
                last_num = int(str(latest["transaction_number"]).split("-")[-1])
                new_num = last_num + 1
            except Exception:
                new_num = 1
        else:
            new_num = 1

        return f"{prefix}{new_num:04d}"


async def generate_receipt_number(db):
    """Generate unique receipt number: RCP-YYYY-XXXX"""
    year = datetime.now().year
    prefix = f"RCP-{year}-"

    sequence_value = await next_sequence_value(
        db,
        sequence_key=f"yuran.receipt.{year}",
        start_at=1,
    )
    if sequence_value is not None:
        return f"{prefix}{sequence_value:04d}"

    # Guard against duplicate generation inside the same app process.
    async with _RECEIPT_NUMBER_LOCK:
        latest_receipt = None
        session_factory = _resolve_session_factory(db)
        if (
            session_factory is not None
            and select is not None
            and func is not None
            and YuranPaymentRecord is not None
        ):
            # Fast-path in PostgreSQL: avoid in-memory scan of all payments.
            async with session_factory() as session:
                latest_receipt = await session.scalar(
                    select(func.max(YuranPaymentRecord.receipt_number)).where(
                        YuranPaymentRecord.receipt_number.like(f"{prefix}%")
                    )
                )
        else:
            latest = await db.yuran_payments.find_one(
                {"receipt_number": {"$regex": f"^{prefix}"}},
                sort=[("receipt_number", -1)]
            )
            if latest:
                latest_receipt = latest.get("receipt_number")

        if latest_receipt:
            try:
                last_num = int(str(latest_receipt).split("-")[-1])
                new_num = last_num + 1
            except Exception:
                new_num = 1
        else:
            new_num = 1

        return f"{prefix}{new_num:04d}"


def allocate_payment_to_yuran_items(items: list, amount: float, paid_date: str = None) -> list:
    """
    Peruntukkan jumlah bayaran kepada senarai item yuran mengikut keutamaan (susunan item).
    Untuk laporan/accounting yang detail per item. Mutates items in place; returns items.
    """
    if paid_date is None:
        paid_date = datetime.now(timezone.utc).isoformat()
    remaining = float(amount)
    for item in items:
        if remaining <= 0:
            break
        item_amount = float(item.get("amount", 0))
        item_paid = float(item.get("paid_amount", 0))
        balance = item_amount - item_paid
        if balance <= 0:
            continue
        to_apply = min(remaining, balance)
        item["paid_amount"] = item_paid + to_apply
        if item["paid_amount"] >= item_amount:
            item["paid"] = True
            item["paid_date"] = paid_date
        remaining -= to_apply
    return items


async def create_yuran_accounting_transaction(db, user, amount, receipt_number, student_name, set_yuran_nama, student_yuran_id):
    """Create accounting transaction for yuran payment"""
    try:
        tx_number = await generate_accounting_transaction_number(db)
        now = datetime.now(timezone.utc)
        
        doc = {
            "transaction_number": tx_number,
            "type": "income",
            "category_id": YURAN_CATEGORY_ID,
            "amount": amount,
            "transaction_date": now.strftime("%Y-%m-%d"),
            "description": f"Bayaran yuran {student_name} - {set_yuran_nama}",
            "reference_number": receipt_number,
            "source": "system",
            "source_ref": {
                "module": "yuran",
                "student_yuran_id": str(student_yuran_id)
            },
            "notes": "Auto-generated from Yuran Module",
            "status": "pending",
            "created_at": now,
            "created_by": str(user.get("_id")) if user.get("_id") is not None else None,
            "created_by_name": user.get("full_name", "")
        }
        
        result = await db.accounting_transactions.insert_one(doc)
        await _invalidate_financial_dashboard_cache_safely(db, scope="accounting")
        
        # Log accounting audit
        await db.accounting_audit_logs.insert_one({
            "transaction_id": result.inserted_id,
            "transaction_number": tx_number,
            "action": "created",
            "old_value": None,
            "new_value": {"amount": amount, "description": doc["description"], "source": "yuran_module"},
            "performed_by": str(user.get("_id")) if user.get("_id") is not None else None,
            "performed_by_name": user.get("full_name", ""),
            "performed_by_role": user.get("role", ""),
            "performed_at": now,
            "notes": "Auto-created from Yuran payment"
        })
        
        return {
            "success": True,
            "transaction_number": tx_number,
            "transaction_id": str(result.inserted_id)
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


def get_db():
    return _get_db_func()


def get_read_db():
    if _get_core_db_func:
        core_db = adapt_yuran_read_db(_get_core_db_func())
        return adapt_tabung_read_db(core_db)
    return _get_db_func()


def _as_object_id_if_valid(value):
    if isinstance(value, ObjectId):
        return value
    if isinstance(value, str):
        try:
            return ObjectId(value)
        except Exception:
            return value
    return value


def _resolve_session_factory(db):
    getter = getattr(db, "get_session_factory", None)
    if callable(getter):
        session_factory = getter()
        if session_factory is not None:
            return session_factory
    raw_getter = getattr(db, "get_raw_db", None)
    if callable(raw_getter):
        try:
            raw_db = raw_getter()
            getter = getattr(raw_db, "get_session_factory", None)
            if callable(getter):
                session_factory = getter()
                if session_factory is not None:
                    return session_factory
        except Exception:
            pass
    return None


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
        # Do not block yuran writes if cache invalidation fails.
        pass


# ============ PYDANTIC MODELS ============

class YuranItemCreate(BaseModel):
    """Item yuran dalam sub-kategori"""
    code: str = Field(..., description="Kod item, cth: M01, D01")
    name: str = Field(..., description="Nama item yuran")
    amount: float = Field(..., ge=0, description="Jumlah dalam RM")
    mandatory: bool = Field(default=True, description="Wajib atau pilihan")
    islam_only: bool = Field(default=False, description="Hanya untuk pelajar Islam (cth: Kelas Al-Quran)")
    bukan_islam_only: bool = Field(default=False, description="Hanya untuk pelajar Bukan Islam (cth: Pendidikan Moral)")
    description: Optional[str] = None


class YuranSubKategoriCreate(BaseModel):
    """Sub-kategori dalam set yuran"""
    name: str = Field(..., description="Nama sub-kategori, cth: Yuran Tetap Muafakat")
    items: List[YuranItemCreate]


class YuranKategoriCreate(BaseModel):
    """Kategori utama dalam set yuran"""
    name: str = Field(..., description="Nama kategori, cth: MUAFAKAT, KOPERASI")
    sub_categories: List[YuranSubKategoriCreate]


class SetYuranCreate(BaseModel):
    """Set Yuran untuk satu tingkatan dan tahun"""
    tahun: int = Field(..., ge=2020, le=2030, description="Tahun akademik")
    tingkatan: int = Field(..., ge=1, le=5, description="Tingkatan 1-5")
    nama: str = Field(..., description="Nama set, cth: Set Yuran Tingkatan 1 2026")
    categories: List[YuranKategoriCreate]
    is_active: bool = True


class SetYuranUpdate(BaseModel):
    """Kemaskini Set Yuran"""
    nama: Optional[str] = None
    categories: Optional[List[YuranKategoriCreate]] = None
    is_active: Optional[bool] = None


class CopySetYuranRequest(BaseModel):
    """Request untuk salin Set Yuran dari tahun sebelumnya"""
    source_year: int = Field(..., description="Tahun sumber untuk disalin")
    target_year: int = Field(..., description="Tahun sasaran")
    tingkatan: Optional[int] = Field(None, ge=1, le=5, description="Tingkatan tertentu atau None untuk semua")


class PromoteStudentsRequest(BaseModel):
    """Request untuk naik tingkatan pelajar"""
    from_year: int = Field(..., description="Tahun semasa")
    to_year: int = Field(..., description="Tahun baru")


class AssignYuranRequest(BaseModel):
    """Assign yuran kepada pelajar"""
    student_ids: List[str] = Field(..., description="Senarai ID pelajar")
    set_yuran_id: str = Field(..., description="ID Set Yuran")
    billing_mode: Optional[str] = Field(
        default="standard",
        description="Mode assignment: standard | prebill_next_year_from_current_students | promotion_auto_assign"
    )
    billing_target_cohort: Optional[Dict[str, int]] = Field(
        default=None,
        description="Cohort target for billing context"
    )
    billing_source_cohort: Optional[Dict[str, int]] = Field(
        default=None,
        description="Cohort source for pre-billing context"
    )


# ============ HELPER FUNCTIONS ============

def calculate_total_amount(categories: List[dict], include_islam_only: bool = True) -> float:
    """Kira jumlah keseluruhan dari semua kategori"""
    total = 0
    for cat in categories:
        for sub in cat.get("sub_categories", []):
            for item in sub.get("items", []):
                # Skip islam_only items if not including them
                if not include_islam_only and item.get("islam_only", False):
                    continue
                total += item.get("amount", 0)
    return total


def calculate_totals_by_religion(categories: List[dict]) -> dict:
    """Kira jumlah untuk Islam dan Bukan Islam"""
    total_islam = 0
    total_bukan_islam = 0
    islam_only_items = []
    bukan_islam_only_items = []
    
    for cat in categories:
        for sub in cat.get("sub_categories", []):
            for item in sub.get("items", []):
                amount = item.get("amount", 0)
                is_islam_only = item.get("islam_only", False)
                is_bukan_islam_only = item.get("bukan_islam_only", False)
                
                if is_islam_only:
                    # Item untuk Islam sahaja
                    total_islam += amount
                    islam_only_items.append({
                        "name": item.get("name"),
                        "amount": amount
                    })
                elif is_bukan_islam_only:
                    # Item untuk Bukan Islam sahaja
                    total_bukan_islam += amount
                    bukan_islam_only_items.append({
                        "name": item.get("name"),
                        "amount": amount
                    })
                else:
                    # Item untuk semua pelajar
                    total_islam += amount
                    total_bukan_islam += amount
    
    return {
        "total_islam": total_islam,
        "total_bukan_islam": total_bukan_islam,
        "difference": total_islam - total_bukan_islam,
        "islam_only_items": islam_only_items,
        "bukan_islam_only_items": bukan_islam_only_items
    }


def serialize_set_yuran(doc: dict) -> dict:
    """Serialize set yuran document"""
    categories = doc.get("categories", [])
    totals = calculate_totals_by_religion(categories)
    
    return {
        "id": str(doc["_id"]),
        "tahun": doc.get("tahun"),
        "tingkatan": doc.get("tingkatan"),
        "nama": doc.get("nama"),
        "categories": categories,
        "total_amount": totals["total_islam"],
        "total_islam": totals["total_islam"],
        "total_bukan_islam": totals["total_bukan_islam"],
        "difference": totals["difference"],
        "islam_only_items": totals["islam_only_items"],
        "bukan_islam_only_items": totals["bukan_islam_only_items"],
        "is_active": doc.get("is_active", True),
        "created_at": doc.get("created_at", ""),
        "created_by": doc.get("created_by"),
        "updated_at": doc.get("updated_at"),
        "student_count": doc.get("student_count", 0)
    }


# Religion options in Malaysia
AGAMA_OPTIONS = [
    "Islam",
    "Buddha", 
    "Hindu",
    "Kristian",
    "Sikh",
    "Taoisme",
    "Konfusianisme",
    "Lain-lain"
]


def get_fee_amount_by_religion(set_yuran: dict, religion: str) -> float:
    """Get the correct fee amount based on student's religion"""
    is_muslim = religion == "Islam"
    if is_muslim:
        return set_yuran.get("total_islam", set_yuran.get("total_amount", 0))
    else:
        return set_yuran.get("total_bukan_islam", set_yuran.get("total_amount", 0))


def filter_items_by_religion(items: list, religion: str) -> list:
    """Filter fee items based on religion
    - Islam: Include islam_only items, exclude bukan_islam_only items
    - Bukan Islam: Exclude islam_only items, include bukan_islam_only items
    """
    is_muslim = religion == "Islam"
    filtered = []
    
    for item in items:
        is_islam_only = item.get("islam_only", False)
        is_bukan_islam_only = item.get("bukan_islam_only", False)
        
        if is_muslim:
            # Pelajar Islam - include islam_only, exclude bukan_islam_only
            if not is_bukan_islam_only:
                filtered.append(item)
        else:
            # Pelajar Bukan Islam - exclude islam_only, include bukan_islam_only
            if not is_islam_only:
                filtered.append(item)
    
    return filtered


def generate_payment_reference(prefix: str = "PAY") -> str:
    """Generate payment reference number."""
    now = datetime.now(timezone.utc)
    return f"{prefix}-{now.strftime('%Y%m%d%H%M%S')}-{now.strftime('%f')[-4:]}"


def _normalize_item_code(value: Any) -> str:
    return str(value or "").strip().upper()


def _build_set_item_key(category: str, sub_category: str, item: dict) -> str:
    code = _normalize_item_code(item.get("code"))
    if code:
        return f"code:{code}"
    name = str(item.get("name") or "").strip().lower()
    category_norm = str(category or "").strip().lower()
    sub_norm = str(sub_category or "").strip().lower()
    return f"name:{category_norm}:{sub_norm}:{name}"


def _flatten_set_categories(categories: List[dict]) -> List[dict]:
    flat_items: List[dict] = []
    for category in categories or []:
        category_name = category.get("name", "")
        for sub_category in category.get("sub_categories", []) or []:
            sub_name = sub_category.get("name", "")
            for item in sub_category.get("items", []) or []:
                amount = float(item.get("amount", 0) or 0)
                if amount <= 0:
                    continue
                flat_items.append({
                    "category": category_name,
                    "sub_category": sub_name,
                    "code": item.get("code"),
                    "name": item.get("name"),
                    "amount": amount,
                    "mandatory": item.get("mandatory", True),
                    "islam_only": item.get("islam_only", False),
                    "bukan_islam_only": item.get("bukan_islam_only", False),
                    "_item_key": _build_set_item_key(category_name, sub_name, item),
                })
    return flat_items


def _compute_set_adjustment_items(old_categories: List[dict], new_categories: List[dict]) -> Dict[str, Any]:
    old_items = _flatten_set_categories(old_categories)
    new_items = _flatten_set_categories(new_categories)
    old_map = {item["_item_key"]: item for item in old_items}
    adjustment_items: List[dict] = []
    decreased_items: List[dict] = []

    for new_item in new_items:
        item_key = new_item["_item_key"]
        old_item = old_map.get(item_key)
        old_amount = float(old_item.get("amount", 0) if old_item else 0)
        new_amount = float(new_item.get("amount", 0))
        delta = round(new_amount - old_amount, 2)

        if old_item is None and new_amount > 0:
            adjustment_items.append({
                **new_item,
                "amount": new_amount,
                "_adjustment_type": "added",
            })
        elif delta > 0:
            adjustment_items.append({
                **new_item,
                "amount": delta,
                "_adjustment_type": "increment",
            })
        elif delta < 0:
            decreased_items.append({
                "code": new_item.get("code"),
                "name": new_item.get("name"),
                "old_amount": old_amount,
                "new_amount": new_amount,
                "delta": delta,
            })

    return {
        "adjustment_items": adjustment_items,
        "decreased_items": decreased_items,
    }


def _is_adjustment_item_applicable_for_religion(item: dict, religion: str) -> bool:
    is_muslim = religion == "Islam"
    if is_muslim and item.get("bukan_islam_only", False):
        return False
    if (not is_muslim) and item.get("islam_only", False):
        return False
    return True


def _find_invoice_item_index(invoice_items: List[dict], adjustment_item: dict) -> int:
    target_key = _build_set_item_key(
        adjustment_item.get("category"),
        adjustment_item.get("sub_category"),
        adjustment_item,
    )
    for idx, invoice_item in enumerate(invoice_items):
        invoice_key = _build_set_item_key(
            invoice_item.get("category"),
            invoice_item.get("sub_category"),
            invoice_item,
        )
        if invoice_key == target_key:
            return idx
    return -1


async def _sync_set_changes_to_existing_invoices(
    db,
    set_yuran_doc: dict,
    adjustment_items: List[dict],
    current_user: dict
) -> Dict[str, Any]:
    summary = {
        "enabled": True,
        "set_yuran_id": str(set_yuran_doc.get("_id")),
        "candidate_invoices": 0,
        "updated_invoices": 0,
        "skipped_paid": 0,
        "skipped_no_applicable": 0,
        "errors": [],
        "total_delta_amount": 0.0,
    }
    if not adjustment_items:
        return summary

    set_id = set_yuran_doc.get("_id")
    invoices = await db.student_yuran.find({"set_yuran_id": set_id}).to_list(10000)
    summary["candidate_invoices"] = len(invoices)
    now_iso = datetime.now(timezone.utc).isoformat()

    for invoice in invoices:
        try:
            invoice_status = invoice.get("status", "pending")
            if invoice_status == "paid":
                summary["skipped_paid"] += 1
                continue

            religion = invoice.get("religion", "Islam")
            applicable_items = [
                item for item in adjustment_items
                if _is_adjustment_item_applicable_for_religion(item, religion)
            ]
            if not applicable_items:
                summary["skipped_no_applicable"] += 1
                continue

            invoice_items = list(invoice.get("items") or [])
            invoice_total_delta = 0.0
            applied_items = []

            for adjustment in applicable_items:
                adjustment_amount = float(adjustment.get("amount", 0) or 0)
                if adjustment_amount <= 0:
                    continue

                found_idx = _find_invoice_item_index(invoice_items, adjustment)
                if found_idx >= 0:
                    existing_item = invoice_items[found_idx]
                    invoice_items[found_idx]["amount"] = round(
                        float(existing_item.get("amount", 0) or 0) + adjustment_amount,
                        2
                    )
                else:
                    invoice_items.append({
                        "category": adjustment.get("category"),
                        "sub_category": adjustment.get("sub_category"),
                        "code": adjustment.get("code"),
                        "name": adjustment.get("name"),
                        "amount": round(adjustment_amount, 2),
                        "mandatory": adjustment.get("mandatory", True),
                        "islam_only": adjustment.get("islam_only", False),
                        "bukan_islam_only": adjustment.get("bukan_islam_only", False),
                        "paid": False,
                        "paid_amount": 0,
                        "paid_date": None,
                    })

                invoice_total_delta += adjustment_amount
                applied_items.append({
                    "code": adjustment.get("code"),
                    "name": adjustment.get("name"),
                    "amount": round(adjustment_amount, 2),
                    "type": adjustment.get("_adjustment_type", "added"),
                })

            if invoice_total_delta <= 0:
                summary["skipped_no_applicable"] += 1
                continue

            old_total = float(invoice.get("total_amount", 0) or 0)
            new_total = round(old_total + invoice_total_delta, 2)
            paid_amount = float(invoice.get("paid_amount", 0) or 0)
            new_status = "paid" if paid_amount >= new_total else ("partial" if paid_amount > 0 else "pending")
            adjustment_reference = generate_payment_reference(prefix="ADJ")

            await db.student_yuran.update_one(
                {"_id": invoice["_id"]},
                {
                    "$set": {
                        "items": invoice_items,
                        "total_amount": new_total,
                        "balance": max(0, round(new_total - paid_amount, 2)),
                        "status": new_status,
                        "updated_at": now_iso,
                    },
                    "$push": {
                        "invoice_adjustments": {
                            "reference_number": adjustment_reference,
                            "set_yuran_id": str(set_yuran_doc.get("_id")),
                            "set_yuran_nama": set_yuran_doc.get("nama"),
                            "adjusted_by": str(current_user.get("_id")),
                            "adjusted_by_name": current_user.get("full_name", ""),
                            "adjusted_at": now_iso,
                            "old_total_amount": old_total,
                            "new_total_amount": new_total,
                            "delta_amount": round(invoice_total_delta, 2),
                            "applied_items": applied_items,
                        }
                    }
                }
            )

            summary["updated_invoices"] += 1
            summary["total_delta_amount"] += invoice_total_delta

            parent_id = invoice.get("parent_id")
            if parent_id:
                await db.notifications.insert_one({
                    "user_id": parent_id,
                    "title": "Pelarasan Invoice Yuran",
                    "message": (
                        f"Invoice {invoice.get('student_name', 'anak anda')} dikemas kini "
                        f"dengan tambahan RM {invoice_total_delta:.2f} "
                        f"untuk {set_yuran_doc.get('nama', 'set yuran')}."
                    ),
                    "type": "warning",
                    "category": "fees",
                    "action_url": "/payments",
                    "action_label": "Lihat Invoice",
                    "metadata": {
                        "student_id": str(invoice.get("student_id")) if invoice.get("student_id") else None,
                        "student_yuran_id": str(invoice.get("_id")),
                        "adjustment_reference": adjustment_reference,
                    },
                    "is_read": False,
                    "created_at": now_iso,
                })

        except Exception as e:
            summary["errors"].append(f"{invoice.get('student_name', 'Pelajar')}: {str(e)}")

    summary["total_delta_amount"] = round(summary["total_delta_amount"], 2)
    return summary


def serialize_student_yuran(doc: dict) -> dict:
    """Serialize yuran pelajar document"""
    return {
        "id": str(doc["_id"]),
        "student_id": str(doc.get("student_id")),
        "student_name": doc.get("student_name", ""),
        "matric_number": doc.get("matric_number", ""),
        "tahun": doc.get("tahun"),
        "tingkatan": doc.get("tingkatan"),
        "set_yuran_id": str(doc.get("set_yuran_id", "")),
        "set_yuran_nama": doc.get("set_yuran_nama", ""),
        "religion": doc.get("religion", "Islam"),
        "items": doc.get("items", []),
        "total_amount": doc.get("total_amount", 0),
        "paid_amount": doc.get("paid_amount", 0),
        "due_date": doc.get("due_date", ""),
        "status": doc.get("status", "pending"),
        "billing_mode": doc.get("billing_mode", "standard"),
        "billing_target_cohort": doc.get("billing_target_cohort"),
        "billing_source_cohort": doc.get("billing_source_cohort"),
        "is_prebill_next_year": doc.get("billing_mode") == "prebill_next_year_from_current_students",
        "created_at": doc.get("created_at", ""),
        "payments": doc.get("payments", [])
    }


def serialize_student_yuran_list_item(doc: dict) -> dict:
    """
    Compact serializer for list view.
    Excludes heavy fields (items/payments) for better performance on large datasets.
    """
    billing_mode = doc.get("billing_mode", "standard")
    balance_value = doc.get("balance")
    if balance_value is None:
        balance_value = max(
            0,
            float(doc.get("total_amount", 0) or 0) - float(doc.get("paid_amount", 0) or 0),
        )

    return {
        "id": str(doc["_id"]),
        "student_id": str(doc.get("student_id")) if doc.get("student_id") else None,
        "student_name": doc.get("student_name", ""),
        "matric_number": doc.get("matric_number", ""),
        "tahun": doc.get("tahun"),
        "tingkatan": doc.get("tingkatan"),
        "set_yuran_id": str(doc.get("set_yuran_id")) if doc.get("set_yuran_id") else "",
        "set_yuran_nama": doc.get("set_yuran_nama", ""),
        "religion": doc.get("religion", "Islam"),
        "total_amount": doc.get("total_amount", 0),
        "paid_amount": doc.get("paid_amount", 0),
        "balance": balance_value,
        "due_date": doc.get("due_date", ""),
        "status": doc.get("status", "pending"),
        "billing_mode": billing_mode,
        "billing_target_cohort": doc.get("billing_target_cohort"),
        "billing_source_cohort": doc.get("billing_source_cohort"),
        "is_prebill_next_year": billing_mode == "prebill_next_year_from_current_students",
        "created_at": doc.get("created_at", ""),
    }


# ============ SET YURAN ENDPOINTS ============

@router.get("/agama-options")
async def get_religion_options():
    """Dapatkan senarai pilihan agama"""
    return {
        "options": AGAMA_OPTIONS,
        "description": "Senarai agama yang diiktiraf di Malaysia"
    }


@router.get("/set-yuran/available-years")
async def get_available_years(
    current_user: dict = Depends(get_current_user)
):
    """Dapatkan senarai tahun yang ada Set Yuran"""
    if current_user.get("role") not in ["superadmin", "admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    db = get_read_db()
    # Get distinct years
    years = await db.set_yuran.distinct("tahun")
    years.sort(reverse=True)
    
    # Get count for each year
    result = []
    for year in years:
        count = await db.set_yuran.count_documents({"tahun": year})
        result.append({
            "tahun": year,
            "set_count": count,
            "complete": count >= 5  # Complete if has all 5 tingkatan
        })
    
    return result


@router.post("/set-yuran/copy")
async def copy_set_yuran_from_year(
    data: CopySetYuranRequest,
    current_user: dict = Depends(get_current_user)
):
    """Salin Set Yuran dari tahun sebelumnya"""
    if current_user.get("role") not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Hanya Bendahari boleh salin Set Yuran")
    db = get_read_db()
    
    # Build query for source
    query = {"tahun": data.source_year}
    if data.tingkatan:
        query["tingkatan"] = data.tingkatan
    
    # Get source sets
    source_sets = await db.set_yuran.find(query).to_list(10)
    if not source_sets:
        raise HTTPException(
            status_code=404, 
            detail=f"Tiada Set Yuran untuk tahun {data.source_year}"
        )
    
    copied_count = 0
    skipped = []
    
    for source in source_sets:
        # Check if target already exists
        existing = await db.set_yuran.find_one({
            "tahun": data.target_year,
            "tingkatan": source["tingkatan"]
        })
        
        if existing:
            skipped.append(f"Tingkatan {source['tingkatan']} sudah wujud")
            continue
        
        # Calculate totals
        categories = source.get("categories", [])
        totals = calculate_totals_by_religion(categories)
        
        # Create new set for target year
        new_set = {
            "tahun": data.target_year,
            "tingkatan": source["tingkatan"],
            "nama": f"Yuran MUAFAKAT Tingkatan {source['tingkatan']} Tahun {data.target_year}",
            "categories": categories,
            "total_amount": totals["total_islam"],
            "total_islam": totals["total_islam"],
            "total_bukan_islam": totals["total_bukan_islam"],
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": str(current_user["_id"]),
            "created_by_name": current_user.get("full_name", ""),
            "copied_from": {
                "year": data.source_year,
                "set_id": str(source["_id"])
            }
        }
        
        await db.set_yuran.insert_one(new_set)
        copied_count += 1

    if copied_count > 0:
        await _invalidate_financial_dashboard_cache_safely(db, scope="yuran")
    
    await log_audit(
        current_user, "COPY_SET_YURAN", "yuran",
        f"Salin {copied_count} Set Yuran dari {data.source_year} ke {data.target_year}"
    )
    
    return {
        "message": f"Berjaya salin {copied_count} Set Yuran ke tahun {data.target_year}",
        "copied_count": copied_count,
        "skipped": skipped,
        "source_year": data.source_year,
        "target_year": data.target_year
    }


@router.get("/set-yuran")
async def get_all_set_yuran(
    tahun: Optional[int] = Query(None, description="Filter by tahun"),
    tingkatan: Optional[int] = Query(None, ge=1, le=5, description="Filter by tingkatan"),
    is_active: Optional[bool] = Query(None, description="Filter by status"),
    current_user: dict = Depends(get_current_user)
):
    """Dapatkan semua Set Yuran - Admin/Bendahari sahaja"""
    if current_user.get("role") not in ["superadmin", "admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")

    db = get_read_db()

    query = {}
    if tahun:
        query["tahun"] = tahun
    if tingkatan:
        query["tingkatan"] = tingkatan
    if is_active is not None:
        query["is_active"] = is_active

    sets = await db.set_yuran.find(query).sort([("tahun", -1), ("tingkatan", 1)]).to_list(100)

    # Get student count for each set
    result = []
    for s in sets:
        count = await db.student_yuran.count_documents({"set_yuran_id": s["_id"]})
        s["student_count"] = count
        result.append(serialize_set_yuran(s))

    return result


@router.get("/set-yuran/{set_id}")
async def get_set_yuran(
    set_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Dapatkan satu Set Yuran"""
    if current_user.get("role") not in ["superadmin", "admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")

    db = get_read_db()
    set_lookup_id = _as_object_id_if_valid(set_id)
    set_yuran = await db.set_yuran.find_one({"_id": set_lookup_id})
    if not set_yuran:
        raise HTTPException(status_code=404, detail="Set Yuran tidak dijumpai")

    count = await db.student_yuran.count_documents({"set_yuran_id": set_yuran["_id"]})
    set_yuran["student_count"] = count

    return serialize_set_yuran(set_yuran)


@router.post("/set-yuran")
async def create_set_yuran(
    data: SetYuranCreate,
    current_user: dict = Depends(get_current_user)
):
    """Cipta Set Yuran baru - Bendahari sahaja"""
    if current_user.get("role") not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Hanya Bendahari boleh cipta Set Yuran")
    db = get_read_db()

    # Check if already exists
    existing = await db.set_yuran.find_one({
        "tahun": data.tahun,
        "tingkatan": data.tingkatan,
        "is_active": True
    })
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Set Yuran untuk Tingkatan {data.tingkatan} tahun {data.tahun} sudah wujud"
        )

    # Convert to dict and calculate totals
    categories_dict = [cat.dict() for cat in data.categories]
    totals = calculate_totals_by_religion(categories_dict)

    doc = {
        "tahun": data.tahun,
        "tingkatan": data.tingkatan,
        "nama": data.nama,
        "categories": categories_dict,
        "total_amount": totals["total_islam"],
        "total_islam": totals["total_islam"],
        "total_bukan_islam": totals["total_bukan_islam"],
        "is_active": data.is_active,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": str(current_user["_id"]),
        "created_by_name": current_user.get("full_name", "")
    }

    result = await db.set_yuran.insert_one(doc)
    doc["_id"] = result.inserted_id
    await _invalidate_financial_dashboard_cache_safely(db, scope="yuran")

    await log_audit(
        current_user, "CREATE_SET_YURAN", "yuran",
        f"Cipta {data.nama} - Tingkatan {data.tingkatan} Tahun {data.tahun}"
    )

    return serialize_set_yuran(doc)


@router.put("/set-yuran/{set_id}")
async def update_set_yuran(
    set_id: str,
    data: SetYuranUpdate,
    sync_existing_invoices: bool = Query(False, description="Sync item tambahan ke invoice pending/partial sedia ada"),
    current_user: dict = Depends(get_current_user)
):
    """Kemaskini Set Yuran - Bendahari sahaja"""
    if current_user.get("role") not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Hanya Bendahari boleh kemaskini Set Yuran")
    db = get_read_db()

    set_lookup_id = _as_object_id_if_valid(set_id)
    set_yuran = await db.set_yuran.find_one({"_id": set_lookup_id})
    if not set_yuran:
        raise HTTPException(status_code=404, detail="Set Yuran tidak dijumpai")

    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    sync_summary = {
        "enabled": sync_existing_invoices,
        "updated_invoices": 0,
        "skipped_paid": 0,
        "candidate_invoices": 0,
        "skipped_no_applicable": 0,
        "errors": [],
        "decreased_items": [],
        "total_delta_amount": 0.0,
    }

    if data.nama is not None:
        update_data["nama"] = data.nama
    if data.categories is not None:
        categories_dict = [cat.dict() for cat in data.categories]
        update_data["categories"] = categories_dict
        totals = calculate_totals_by_religion(categories_dict)
        update_data["total_amount"] = totals["total_islam"]
        update_data["total_islam"] = totals["total_islam"]
        update_data["total_bukan_islam"] = totals["total_bukan_islam"]
        if sync_existing_invoices:
            set_changes = _compute_set_adjustment_items(set_yuran.get("categories", []), categories_dict)
            sync_summary["decreased_items"] = set_changes.get("decreased_items", [])
            sync_summary = {
                **sync_summary,
                **(await _sync_set_changes_to_existing_invoices(
                    db=db,
                    set_yuran_doc=set_yuran,
                    adjustment_items=set_changes.get("adjustment_items", []),
                    current_user=current_user,
                ))
            }
    if data.is_active is not None:
        update_data["is_active"] = data.is_active

    await db.set_yuran.update_one({"_id": set_lookup_id}, {"$set": update_data})
    await _invalidate_financial_dashboard_cache_safely(db, scope="yuran")

    await log_audit(
        current_user, "UPDATE_SET_YURAN", "yuran",
        (
            f"Kemaskini Set Yuran ID {set_id}; "
            f"sync_existing_invoices={sync_existing_invoices}; "
            f"updated_invoices={sync_summary.get('updated_invoices', 0)}; "
            f"skipped_paid={sync_summary.get('skipped_paid', 0)}"
        )
    )

    updated = await db.set_yuran.find_one({"_id": set_lookup_id})
    payload = serialize_set_yuran(updated)
    payload["sync_summary"] = sync_summary
    return payload


@router.delete("/set-yuran/{set_id}")
async def delete_set_yuran(
    set_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Padam/Nyahaktif Set Yuran"""
    if current_user.get("role") not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Hanya Bendahari boleh padam Set Yuran")

    db = get_read_db()

    set_lookup_id = _as_object_id_if_valid(set_id)
    set_yuran = await db.set_yuran.find_one({"_id": set_lookup_id})
    if not set_yuran:
        raise HTTPException(status_code=404, detail="Set Yuran tidak dijumpai")

    # Check if has assigned students
    set_id_value = _as_object_id_if_valid(set_id)
    student_count = await db.student_yuran.count_documents({"set_yuran_id": set_id_value})
    if student_count > 0:
        # Soft delete
        await db.set_yuran.update_one(
            {"_id": set_lookup_id},
            {"$set": {"is_active": False, "deleted_at": datetime.now(timezone.utc).isoformat()}}
        )
    else:
        # Hard delete
        await db.set_yuran.delete_one({"_id": set_lookup_id})
    await _invalidate_financial_dashboard_cache_safely(db, scope="yuran")

    await log_audit(
        current_user, "DELETE_SET_YURAN", "yuran",
        f"Padam Set Yuran {set_yuran.get('nama')}"
    )

    return {"message": "Set Yuran berjaya dipadam"}


# ============ ASSIGN YURAN TO STUDENTS ============

@router.post("/assign")
async def assign_yuran_to_students(
    data: AssignYuranRequest,
    current_user: dict = Depends(get_current_user)
):
    """Assign Set Yuran kepada pelajar - Automatik pilih yuran Islam/Bukan Islam"""
    if current_user.get("role") not in ["superadmin", "admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")

    if not data.student_ids:
        raise HTTPException(status_code=400, detail="Senarai pelajar tidak boleh kosong")

    mongo_db = get_db()
    core_db = get_read_db()
    unique_student_ids = list(dict.fromkeys(str(student_id) for student_id in data.student_ids if str(student_id).strip()))
    if not unique_student_ids:
        raise HTTPException(status_code=400, detail="Senarai pelajar tidak sah")

    # Get set yuran
    set_yuran_lookup_id = _as_object_id_if_valid(data.set_yuran_id)
    set_yuran = await core_db.set_yuran.find_one({"_id": set_yuran_lookup_id})
    if not set_yuran:
        raise HTTPException(status_code=404, detail="Set Yuran tidak dijumpai")

    assigned_count = 0
    errors = []

    for student_id in unique_student_ids:
        try:
            # Get student
            student_lookup_id = _as_object_id_if_valid(student_id)
            student = await core_db.students.find_one({"_id": student_lookup_id})
            if not student:
                errors.append(f"Pelajar {student_id} tidak dijumpai")
                continue

            # Check if already assigned for this year and tingkatan
            existing = await core_db.student_yuran.find_one({
                "student_id": student_lookup_id,
                "tahun": set_yuran["tahun"],
                "tingkatan": set_yuran["tingkatan"]
            })
            if existing:
                errors.append(f"Pelajar {student.get('full_name')} sudah ada yuran untuk tahun ini")
                continue

            # Get student's religion - default to Islam
            student_religion = student.get("religion", "Islam")
            is_muslim = student_religion == "Islam"
            
            # Get correct fee amount based on religion
            total_amount = get_fee_amount_by_religion(set_yuran, student_religion)

            # Flatten items from categories - filter by religion
            items = []
            for cat in set_yuran.get("categories", []):
                for sub in cat.get("sub_categories", []):
                    for item in sub.get("items", []):
                        # Skip Kelas Al-Quran for non-Muslims
                        if not is_muslim and "Al-Quran" in item.get("name", ""):
                            continue
                        items.append({
                            "category": cat.get("name"),
                            "sub_category": sub.get("name"),
                            "code": item.get("code"),
                            "name": item.get("name"),
                            "amount": item.get("amount"),
                            "mandatory": item.get("mandatory", True),
                            "paid": False,
                            "paid_amount": 0,
                            "paid_date": None
                        })

            # Due date: end of year or +90 days
            due = datetime.now(timezone.utc) + timedelta(days=90)
            due_date = due.strftime("%Y-%m-%d")
            if set_yuran.get("tahun"):
                try:
                    due_date = f"{set_yuran['tahun']}-12-31"
                except Exception:
                    pass

            # Create student yuran record (invoice)
            student_yuran_doc = {
                "student_id": student_lookup_id,
                "student_name": student.get("full_name"),
                "matric_number": student.get("matric_number"),
                "parent_id": student.get("parent_id"),
                "tahun": set_yuran["tahun"],
                "tingkatan": set_yuran["tingkatan"],
                "set_yuran_id": set_yuran["_id"],
                "set_yuran_nama": set_yuran.get("nama"),
                "religion": student_religion,
                "items": items,
                "total_amount": total_amount,
                "paid_amount": 0,
                "status": "pending",
                "due_date": due_date,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "payments": [],
                "billing_mode": data.billing_mode or "standard",
                "billing_target_cohort": data.billing_target_cohort,
                "billing_source_cohort": data.billing_source_cohort,
            }

            res = await core_db.student_yuran.insert_one(student_yuran_doc)
            assigned_count += 1
            sy_id = str(res.inserted_id)

            # AR: post journal Dr AR, Cr Revenue (invoice)
            try:
                from services.ar_journal import post_ar_invoice
                await post_ar_invoice(
                    mongo_db,
                    sy_id,
                    total_amount,
                    YURAN_CATEGORY_ID,
                    f"Invoice yuran: {student.get('full_name')} - {set_yuran.get('nama')}",
                    f"INV-{set_yuran['tahun']}-{student.get('matric_number', '')}",
                    created_by=current_user.get("_id"),
                    created_by_name=current_user.get("full_name", ""),
                )
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning("AR invoice journal skip: %s", e)

            # Notify parent - In-app notification
            if student.get("parent_id"):
                fee_type = "Islam" if is_muslim else "Bukan Islam"
                await core_db.notifications.insert_one({
                    "user_id": student.get("parent_id"),
                    "title": "Yuran Baru Dikenakan",
                    "message": f"Yuran untuk {student.get('full_name')} ({set_yuran.get('nama')}) - Kategori {fee_type} berjumlah RM {total_amount:.2f} telah dikenakan.",
                    "type": "info",
                    "category": "fees",
                    "action_url": "/payment-center",
                    "action_label": "Lihat & Bayar",
                    "metadata": {
                        "student_id": str(student.get("_id")) if student.get("_id") else None,
                        "set_yuran_id": str(set_yuran.get("_id")) if set_yuran.get("_id") else None,
                    },
                    "is_read": False,
                    "created_at": datetime.now(timezone.utc).isoformat()
                })
                
                # Send email notification
                try:
                    from services.email_service import send_new_fee_notification, RESEND_ENABLED
                    if RESEND_ENABLED:
                        parent = await core_db.users.find_one({"_id": student.get("parent_id")})
                        if parent and parent.get("email"):
                            await send_new_fee_notification(
                                parent_email=parent.get("email"),
                                parent_name=parent.get("full_name", "Ibu Bapa"),
                                child_name=student.get("full_name"),
                                fee_set_name=set_yuran.get("nama"),
                                total_amount=total_amount,
                                items=items
                            )
                except Exception:
                    # Don't fail the assignment if email fails
                    pass

        except Exception as e:
            errors.append(f"Error untuk {student_id}: {str(e)}")

    if assigned_count > 0:
        await _invalidate_financial_dashboard_cache_safely(core_db, scope="yuran")

    await log_audit(
        current_user, "ASSIGN_YURAN", "yuran",
        f"Assign {set_yuran.get('nama')} kepada {assigned_count} pelajar"
    )

    return {
        "message": f"Berjaya assign kepada {assigned_count} pelajar",
        "assigned_count": assigned_count,
        "errors": errors
    }


@router.post("/assign-by-tingkatan")
async def assign_yuran_by_tingkatan(
    tahun: int = Query(..., description="Tahun akademik"),
    tingkatan: int = Query(..., ge=1, le=5, description="Tingkatan"),
    current_user: dict = Depends(get_current_user)
):
    """Assign Set Yuran kepada SEMUA pelajar dalam tingkatan tertentu"""
    if current_user.get("role") not in ["superadmin", "admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")

    core_db = get_read_db()

    # Get set yuran for this tingkatan
    set_yuran = await core_db.set_yuran.find_one({
        "tahun": tahun,
        "tingkatan": tingkatan,
        "is_active": True
    })
    if not set_yuran:
        raise HTTPException(status_code=404, detail=f"Set Yuran untuk Tingkatan {tingkatan} Tahun {tahun} tidak dijumpai")

    assignment_mode = "direct_target_cohort"
    source_cohort = None

    # Get all students in target cohort (same year + same form)
    students = await core_db.students.find({
        "form": tingkatan,
        "year": tahun,
        "status": "approved"
    }).to_list(1000)

    if not students:
        current_year = datetime.now(timezone.utc).year
        # Future-year pre-billing:
        # assign to current students that will move into target form next year.
        if tahun >= current_year + 1 and tingkatan > 1:
            source_year = tahun - 1
            source_form = tingkatan - 1
            students = await core_db.students.find({
                "form": source_form,
                "year": source_year,
                "status": "approved"
            }).to_list(1000)
            if students:
                assignment_mode = "prebill_next_year_from_current_students"
                source_cohort = {"tahun": source_year, "tingkatan": source_form}

        if not students and tahun >= current_year + 1:
            if tingkatan == 1:
                return {
                    "message": (
                        f"Tingkatan {tingkatan} Tahun {tahun} kebiasaannya melibatkan pelajar baharu. "
                        "Tiada pelajar semasa untuk pre-billing. Invoice akan dijana apabila pelajar Tingkatan 1 didaftarkan."
                    ),
                    "assigned_count": 0,
                    "errors": [],
                    "pending_auto_assign": True,
                    "assignment_mode": "future_year_pending_new_intake",
                }
            return {
                "message": (
                    f"Tiada pelajar semasa untuk cohort asal Tingkatan {tingkatan - 1} Tahun {tahun - 1}. "
                    "Set yuran tahun hadapan akan auto-assign semasa proses naik tingkatan."
                ),
                "assigned_count": 0,
                "errors": [],
                "pending_auto_assign": True,
                "assignment_mode": "future_year_pending_promotion",
            }
        raise HTTPException(status_code=404, detail=f"Tiada pelajar dalam Tingkatan {tingkatan}")

    # Assign to all students
    student_ids = [str(s["_id"]) for s in students]
    assign_result = await assign_yuran_to_students(
        AssignYuranRequest(
            student_ids=student_ids,
            set_yuran_id=str(set_yuran["_id"]),
            billing_mode=assignment_mode if assignment_mode != "direct_target_cohort" else "standard",
            billing_target_cohort={"tahun": tahun, "tingkatan": tingkatan},
            billing_source_cohort=source_cohort,
        ),
        current_user
    )
    assign_result["assignment_mode"] = assignment_mode
    assign_result["target_cohort"] = {"tahun": tahun, "tingkatan": tingkatan}
    if source_cohort:
        assign_result["source_cohort"] = source_cohort
        assign_result["message"] = (
            f"Berjaya pre-billing Tingkatan {tingkatan} Tahun {tahun} kepada "
            f"{assign_result.get('assigned_count', 0)} pelajar semasa "
            f"Tingkatan {source_cohort['tingkatan']} Tahun {source_cohort['tahun']}."
        )
    return assign_result


# ============ STUDENT YURAN ENDPOINTS ============

@router.get("/pelajar")
async def get_student_yuran_list(
    tahun: Optional[int] = Query(None),
    tingkatan: Optional[int] = Query(None, ge=1, le=5),
    status: Optional[str] = Query(None),  # pending, partial, paid
    billing_mode: Optional[str] = Query(
        None,
        description="Mode invoice: semasa | prebill_next_year | prebill_next_year_from_current_students | promotion_auto_assign | standard"
    ),
    compact: bool = Query(
        False,
        description="Jika true, gunakan response compact (tanpa items/payments) untuk prestasi list besar."
    ),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """Dapatkan senarai yuran pelajar - Admin view"""
    if current_user.get("role") not in ["superadmin", "admin", "bendahari", "sub_bendahari", "guru_kelas"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")

    db = get_read_db()
    search_text = str(search or "").strip()
    search_escaped = re.escape(search_text) if search_text else ""

    # Fast SQL path in Postgres mode for high-volume list requests.
    if compact and hasattr(db.student_yuran, "find_admin_page"):
        records, total = await db.student_yuran.find_admin_page(
            tahun=tahun,
            tingkatan=tingkatan,
            status=status,
            billing_mode=billing_mode,
            search=search_text,
            page=page,
            limit=limit,
        )
    else:
        query_filters: List[dict] = []
        if tahun:
            query_filters.append({"tahun": tahun})
        if tingkatan:
            query_filters.append({"tingkatan": tingkatan})
        if status:
            query_filters.append({"status": status})
        if billing_mode:
            billing_mode_normalized = str(billing_mode).strip().lower()
            if billing_mode_normalized in ["prebill_next_year", "prebill", "prebill_next_year_from_current_students"]:
                query_filters.append({"billing_mode": "prebill_next_year_from_current_students"})
            elif billing_mode_normalized in ["semasa", "current", "standard"]:
                query_filters.append({
                    "$or": [
                        {"billing_mode": {"$exists": False}},
                        {"billing_mode": None},
                        {"billing_mode": ""},
                        {"billing_mode": "standard"},
                        {"billing_mode": "promotion_auto_assign"},
                        {"billing_mode": "direct_target_cohort"},
                    ]
                })
            else:
                query_filters.append({"billing_mode": billing_mode})
        if search_escaped:
            query_filters.append({
                "$or": [
                    {"student_name": {"$regex": search_escaped, "$options": "i"}},
                    {"matric_number": {"$regex": search_escaped, "$options": "i"}}
                ]
            })

        if not query_filters:
            query = {}
        elif len(query_filters) == 1:
            query = query_filters[0]
        else:
            query = {"$and": query_filters}

        total = await db.student_yuran.count_documents(query)
        skip = (page - 1) * limit

        if compact:
            projection = {
                "_id": 1,
                "student_id": 1,
                "student_name": 1,
                "matric_number": 1,
                "tahun": 1,
                "tingkatan": 1,
                "set_yuran_id": 1,
                "set_yuran_nama": 1,
                "religion": 1,
                "total_amount": 1,
                "paid_amount": 1,
                "balance": 1,
                "due_date": 1,
                "status": 1,
                "billing_mode": 1,
                "billing_target_cohort": 1,
                "billing_source_cohort": 1,
                "created_at": 1,
            }
            try:
                cursor = db.student_yuran.find(query, projection)
            except TypeError:
                cursor = db.student_yuran.find(query)
        else:
            cursor = db.student_yuran.find(query)

        records = await cursor.sort([
            ("tahun", -1), ("tingkatan", 1), ("student_name", 1)
        ]).skip(skip).limit(limit).to_list(limit)

    return {
        "data": [serialize_student_yuran_list_item(r) for r in records] if compact else [serialize_student_yuran(r) for r in records],
        "pagination": {
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": (total + limit - 1) // limit
        }
    }


@router.get("/pelajar/{student_id}")
async def get_student_yuran_history(
    student_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Dapatkan sejarah yuran seorang pelajar dari Tingkatan 1-5"""
    # Check permission
    db = get_read_db()
    student_lookup_id = _as_object_id_if_valid(student_id)
    user_role = current_user.get("role")
    if user_role == "parent":
        # Check if student belongs to parent
        student = await db.students.find_one({"_id": student_lookup_id})
        if not student or str(student.get("parent_id")) != str(current_user["_id"]):
            raise HTTPException(status_code=403, detail="Akses ditolak")
    elif user_role not in ["superadmin", "admin", "bendahari", "sub_bendahari", "guru_kelas"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")

    # Get student info
    student = await db.students.find_one({"_id": student_lookup_id})
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")

    # Get all yuran records for this student
    records = await db.student_yuran.find({
        "student_id": student_lookup_id
    }).sort([("tahun", 1), ("tingkatan", 1)]).to_list(10)

    # Calculate totals
    total_fees = sum(r.get("total_amount", 0) for r in records)
    total_paid = sum(r.get("paid_amount", 0) for r in records)
    total_outstanding = total_fees - total_paid

    # Group by tingkatan
    by_tingkatan = {}
    for r in records:
        ting = r.get("tingkatan")
        if ting not in by_tingkatan:
            by_tingkatan[ting] = []
        by_tingkatan[ting].append(serialize_student_yuran(r))

    # Outstanding by tingkatan
    outstanding_by_tingkatan = []
    for ting in sorted(by_tingkatan.keys()):
        ting_total = sum(r["total_amount"] for r in by_tingkatan[ting])
        ting_paid = sum(r["paid_amount"] for r in by_tingkatan[ting])
        ting_outstanding = ting_total - ting_paid
        if ting_outstanding > 0:
            outstanding_by_tingkatan.append({
                "tingkatan": ting,
                "total": ting_total,
                "paid": ting_paid,
                "outstanding": ting_outstanding,
                "records": by_tingkatan[ting]
            })

    return {
        "student": {
            "id": str(student["_id"]),
            "name": student.get("full_name"),
            "matric_number": student.get("matric_number"),
            "current_form": student.get("form"),
            "current_year": student.get("year"),
            "class_name": student.get("class_name")
        },
        "summary": {
            "total_fees": total_fees,
            "total_paid": total_paid,
            "total_outstanding": total_outstanding,
            "progress_percent": (total_paid / total_fees * 100) if total_fees > 0 else 0
        },
        "by_tingkatan": by_tingkatan,
        "outstanding_by_tingkatan": outstanding_by_tingkatan,
        "all_records": [serialize_student_yuran(r) for r in records]
    }


@router.get("/anak-saya")
async def get_my_children_yuran(
    current_user: dict = Depends(get_current_user)
):
    """Dapatkan yuran semua anak untuk ibu bapa"""
    if current_user.get("role") != "parent":
        raise HTTPException(status_code=403, detail="Endpoint untuk ibu bapa sahaja")

    db = get_read_db()
    # Get all children
    children = await db.students.find({
        "parent_id": current_user["_id"],
        "status": "approved"
    }).to_list(20)

    result = []
    for child in children:
        # Get yuran for this child
        yuran_records = await db.student_yuran.find({
            "student_id": child["_id"]
        }).sort([("tahun", -1), ("tingkatan", -1)]).to_list(10)

        # Get child's religion
        child_religion = child.get("religion", "Islam")

        total_fees = sum(r.get("total_amount", 0) for r in yuran_records)
        total_paid = sum(r.get("paid_amount", 0) for r in yuran_records)
        total_outstanding = total_fees - total_paid

        # Outstanding by tingkatan
        outstanding_by_ting = []
        for r in yuran_records:
            outstanding = r.get("total_amount", 0) - r.get("paid_amount", 0)
            if outstanding > 0:
                outstanding_by_ting.append({
                    "tingkatan": r.get("tingkatan"),
                    "tahun": r.get("tahun"),
                    "outstanding": outstanding,
                    "items_unpaid": [
                        i for i in r.get("items", []) if not i.get("paid")
                    ]
                })

        result.append({
            "student_id": str(child["_id"]),
            "name": child.get("full_name"),
            "matric_number": child.get("matric_number"),
            "current_form": child.get("form"),
            "current_year": child.get("year"),
            "class_name": child.get("class_name"),
            "religion": child_religion,
            "total_fees": total_fees,
            "total_paid": total_paid,
            "total_outstanding": total_outstanding,
            "progress_percent": (total_paid / total_fees * 100) if total_fees > 0 else 0,
            "outstanding_by_tingkatan": outstanding_by_ting,
            "current_year_yuran": [
                serialize_student_yuran(r) for r in yuran_records
                if r.get("tahun") == child.get("year")
            ],
            "all_yuran": [serialize_student_yuran(r) for r in yuran_records]
        })

    return result


# ============ PAYMENT ENDPOINTS ============

@router.post("/bayar/{student_yuran_id}")
async def make_payment(
    student_yuran_id: str,
    amount: float = Query(..., gt=0),
    payment_method: str = Query(..., description="fpx, card, cash, bank_transfer"),
    item_codes: Optional[List[str]] = Query(None, description="Kod item yang dibayar"),
    current_user: dict = Depends(get_current_user)
):
    """Buat bayaran yuran (MOCKED)"""
    mongo_db = get_db()
    core_db = get_read_db()
    student_yuran_lookup_id = _as_object_id_if_valid(student_yuran_id)

    # Get student yuran record
    student_yuran = await core_db.student_yuran.find_one({"_id": student_yuran_lookup_id})
    if not student_yuran:
        raise HTTPException(status_code=404, detail="Rekod yuran tidak dijumpai")

    # Check permission
    user_role = current_user.get("role")
    if user_role == "parent":
        if str(student_yuran.get("parent_id")) != str(current_user["_id"]):
            raise HTTPException(status_code=403, detail="Akses ditolak")
    elif user_role not in ["superadmin", "admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")

    # Calculate new paid amount
    current_paid = student_yuran.get("paid_amount", 0)
    total_amount = student_yuran.get("total_amount", 0)
    remaining = total_amount - current_paid

    if amount > remaining:
        raise HTTPException(status_code=400, detail=f"Jumlah melebihi baki tertunggak (RM {remaining:.2f})")

    new_paid = current_paid + amount
    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()

    # Update item statuses if specified
    items = student_yuran.get("items", [])
    if item_codes:
        for item in items:
            if item.get("code") in item_codes:
                item["paid"] = True
                item["paid_amount"] = item.get("amount", 0)
                item["paid_date"] = now_iso
    else:
        # Auto-mark items as paid based on amount
        remaining_payment = amount
        for item in items:
            if not item.get("paid") and remaining_payment > 0:
                item_amount = item.get("amount", 0)
                if remaining_payment >= item_amount:
                    item["paid"] = True
                    item["paid_amount"] = item_amount
                    item["paid_date"] = now_iso
                    remaining_payment -= item_amount
                else:
                    item["paid_amount"] = item.get("paid_amount", 0) + remaining_payment
                    remaining_payment = 0

    # Determine status
    new_status = "paid" if new_paid >= total_amount else ("partial" if new_paid > 0 else "pending")

    # Create payment record
    receipt_number = await generate_receipt_number(core_db)
    payment_reference = generate_payment_reference(prefix="PAY")
    payment_record_for_invoice = {
        "amount": amount,
        "payment_method": payment_method,
        "receipt_number": receipt_number,
        "reference_number": payment_reference,
        "paid_at": now_iso,
        "paid_by": str(current_user["_id"]),
        "paid_by_name": current_user.get("full_name")
    }

    # Create accounting transaction (integrated with full accounting system)
    accounting_result = await create_yuran_accounting_transaction(
        db=core_db,
        user=current_user,
        amount=amount,
        receipt_number=receipt_number,
        student_name=student_yuran.get('student_name'),
        set_yuran_nama=student_yuran.get('set_yuran_nama'),
        student_yuran_id=student_yuran_id
    )
    
    # Store accounting reference in payment record if successful.
    if accounting_result.get("success"):
        payment_record_for_invoice["accounting_tx_number"] = accounting_result.get("transaction_number")

    payment_record_doc = {
        "student_yuran_id": student_yuran.get("_id"),
        "student_id": student_yuran.get("student_id"),
        "parent_id": student_yuran.get("parent_id"),
        "amount": amount,
        "payment_type": "manual",
        "payment_method": payment_method,
        "receipt_number": receipt_number,
        "reference_number": payment_reference,
        "description": "Bayaran manual yuran",
        "status": "completed",
        "created_at": now_dt,
        "created_by": current_user.get("_id"),
    }
    if accounting_result.get("success"):
        payment_record_doc["accounting_tx_number"] = accounting_result.get("transaction_number")

    payment_insert_result = await core_db.yuran_payments.insert_one(payment_record_doc)

    # Update student yuran with appended payment record.
    try:
        await core_db.student_yuran.update_one(
            {"_id": student_yuran_lookup_id},
            {
                "$set": {
                    "paid_amount": new_paid,
                    "balance": max(0, round(total_amount - new_paid, 2)),
                    "status": new_status,
                    "items": items,
                    "updated_at": now_iso
                },
                "$push": {
                    "payments": payment_record_for_invoice
                },
            },
        )
    except Exception:
        # Rollback payment ledger insert if invoice update fails.
        inserted_payment_id = getattr(payment_insert_result, "inserted_id", None)
        if inserted_payment_id is not None:
            try:
                await core_db.yuran_payments.delete_one({"_id": inserted_payment_id})
            except Exception:
                pass
        raise
    await _invalidate_financial_dashboard_cache_safely(core_db, scope="yuran")

    # AR: post journal Dr Bank, Cr AR (payment)
    try:
        from services.ar_journal import post_ar_payment
        await post_ar_payment(
            mongo_db,
            amount,
            student_yuran_id,
            receipt_number,
            f"Bayaran yuran {student_yuran.get('student_name')} - {student_yuran.get('set_yuran_nama')}",
            bank_account_id=None,
            created_by=current_user.get("_id"),
            created_by_name=current_user.get("full_name", ""),
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("AR payment journal skip: %s", e)

    # Send payment confirmation email
    try:
        from services.email_service import send_payment_confirmation, RESEND_ENABLED
        if RESEND_ENABLED and student_yuran.get("parent_id"):
            parent = await core_db.users.find_one({"_id": student_yuran.get("parent_id")})
            if parent and parent.get("email"):
                await send_payment_confirmation(
                    parent_email=parent.get("email"),
                    parent_name=parent.get("full_name", "Ibu Bapa"),
                    child_name=student_yuran.get("student_name"),
                    amount=amount,
                    receipt_number=receipt_number,
                    remaining=max(0, round(total_amount - new_paid, 2))
                )
    except Exception:
        # Don't fail the payment if email fails
        pass

    await log_audit(
        current_user, "PAYMENT_YURAN", "yuran",
        f"Bayaran RM {amount:.2f} untuk {student_yuran.get('student_name')}"
    )

    return {
        "message": "Bayaran berjaya direkodkan",
        "receipt_number": receipt_number,
        "amount": amount,
        "new_paid_amount": new_paid,
        "remaining": max(0, round(total_amount - new_paid, 2)),
        "status": new_status,
        "payment_reference": payment_reference,
        "accounting": {
            "integrated": accounting_result.get("success", False),
            "transaction_number": accounting_result.get("transaction_number") if accounting_result.get("success") else None,
            "note": "Transaksi auto-dicipta dalam Sistem Perakaunan" if accounting_result.get("success") else "Gagal mencipta transaksi perakaunan"
        }
    }


# ============ PROMOTE STUDENTS ============

@router.post("/naik-tingkatan")
async def promote_students(
    data: PromoteStudentsRequest,
    current_user: dict = Depends(get_current_user)
):
    """Naik tingkatan semua pelajar dari satu tahun ke tahun seterusnya"""
    if current_user.get("role") not in ["superadmin", "admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Hanya admin/bendahari boleh proses kenaikan tingkatan")

    if data.to_year != data.from_year + 1:
        raise HTTPException(status_code=400, detail="Tahun baru mesti tahun semasa + 1")

    db = get_read_db()

    # Get all students with year = from_year
    students = await db.students.find({
        "year": data.from_year,
        "status": "approved"
    }).to_list(2000)

    promoted = 0
    graduated = 0
    errors = []
    promoted_by_form = defaultdict(list)

    for student in students:
        try:
            current_form = student.get("form", 1)

            if current_form >= 5:
                # Student graduates
                await db.students.update_one(
                    {"_id": student["_id"]},
                    {"$set": {
                        "status": "graduated",
                        "graduated_year": data.from_year,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                graduated += 1
            else:
                # Promote to next form
                new_form = current_form + 1
                await db.students.update_one(
                    {"_id": student["_id"]},
                    {"$set": {
                        "year": data.to_year,
                        "form": new_form,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                promoted += 1
                promoted_by_form[new_form].append(str(student["_id"]))

        except Exception as e:
            errors.append(f"Error untuk {student.get('full_name')}: {str(e)}")

    await log_audit(
        current_user, "PROMOTE_STUDENTS", "yuran",
        f"Kenaikan tingkatan dari {data.from_year} ke {data.to_year}: {promoted} dinaikkan, {graduated} tamat"
    )

    auto_assign_summary = {
        "target_year": data.to_year,
        "promoted_groups": {str(k): len(v) for k, v in promoted_by_form.items()},
        "assigned_total": 0,
        "skipped_existing": 0,
        "missing_set_yuran": [],
        "errors": [],
    }
    for form, student_ids in promoted_by_form.items():
        set_yuran = await db.set_yuran.find_one({
            "tahun": data.to_year,
            "tingkatan": form,
            "is_active": True
        })
        if not set_yuran:
            auto_assign_summary["missing_set_yuran"].append(form)
            continue

        try:
            assign_result = await assign_yuran_to_students(
                AssignYuranRequest(
                    student_ids=student_ids,
                    set_yuran_id=str(set_yuran["_id"]),
                    billing_mode="promotion_auto_assign",
                    billing_target_cohort={"tahun": data.to_year, "tingkatan": form},
                    billing_source_cohort={"tahun": data.from_year, "tingkatan": form - 1},
                ),
                current_user,
            )
            auto_assign_summary["assigned_total"] += assign_result.get("assigned_count", 0)
            if assign_result.get("errors"):
                for err in assign_result.get("errors", []):
                    if "sudah ada yuran" in str(err):
                        auto_assign_summary["skipped_existing"] += 1
                    else:
                        auto_assign_summary["errors"].append(err)
        except Exception as e:
            auto_assign_summary["errors"].append(
                f"Gagal auto-assign Tingkatan {form} Tahun {data.to_year}: {str(e)}"
            )

    return {
        "message": "Proses kenaikan tingkatan selesai",
        "promoted": promoted,
        "graduated": graduated,
        "errors": errors,
        "auto_assign": auto_assign_summary,
    }


# ============ REPORTS ============

@router.get("/laporan/tunggakan")
async def get_outstanding_report(
    tahun: Optional[int] = Query(None),
    tingkatan: Optional[int] = Query(None, ge=1, le=5),
    current_user: dict = Depends(get_current_user)
):
    """Laporan tunggakan yuran"""
    if current_user.get("role") not in ["superadmin", "admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")

    db = get_read_db()
    query = {"status": {"$ne": "paid"}}
    if tahun:
        query["tahun"] = tahun
    if tingkatan:
        query["tingkatan"] = tingkatan

    records = await db.student_yuran.find(query).sort([
        ("tingkatan", 1), ("student_name", 1)
    ]).to_list(1000)

    # Group by tingkatan
    by_tingkatan = {}
    total_outstanding = 0

    for r in records:
        ting = r.get("tingkatan")
        outstanding = r.get("total_amount", 0) - r.get("paid_amount", 0)
        total_outstanding += outstanding

        if ting not in by_tingkatan:
            by_tingkatan[ting] = {
                "tingkatan": ting,
                "student_count": 0,
                "total_outstanding": 0,
                "students": []
            }

        by_tingkatan[ting]["student_count"] += 1
        by_tingkatan[ting]["total_outstanding"] += outstanding
        by_tingkatan[ting]["students"].append({
            "student_name": r.get("student_name"),
            "matric_number": r.get("matric_number"),
            "total": r.get("total_amount", 0),
            "paid": r.get("paid_amount", 0),
            "outstanding": outstanding,
            "status": r.get("status")
        })

    return {
        "total_outstanding": total_outstanding,
        "total_students": len(records),
        "by_tingkatan": list(by_tingkatan.values())
    }


@router.get("/laporan/kutipan")
async def get_collection_report(
    tahun: int = Query(...),
    bulan: Optional[int] = Query(None, ge=1, le=12),
    current_user: dict = Depends(get_current_user)
):
    """Laporan kutipan yuran"""
    if current_user.get("role") not in ["superadmin", "admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")

    db = get_read_db()
    # Get all yuran for the year
    query = {"tahun": tahun}
    records = await db.student_yuran.find(query).to_list(2000)

    # Calculate totals
    total_expected = sum(r.get("total_amount", 0) for r in records)
    total_collected = sum(r.get("paid_amount", 0) for r in records)

    # By tingkatan
    by_tingkatan = {}
    for r in records:
        ting = r.get("tingkatan")
        if ting not in by_tingkatan:
            by_tingkatan[ting] = {
                "tingkatan": ting,
                "student_count": 0,
                "expected": 0,
                "collected": 0,
                "paid_count": 0,
                "partial_count": 0,
                "pending_count": 0
            }

        by_tingkatan[ting]["student_count"] += 1
        by_tingkatan[ting]["expected"] += r.get("total_amount", 0)
        by_tingkatan[ting]["collected"] += r.get("paid_amount", 0)

        status = r.get("status")
        if status == "paid":
            by_tingkatan[ting]["paid_count"] += 1
        elif status == "partial":
            by_tingkatan[ting]["partial_count"] += 1
        else:
            by_tingkatan[ting]["pending_count"] += 1

    # Calculate percentages
    for ting_data in by_tingkatan.values():
        ting_data["collection_rate"] = (
            (ting_data["collected"] / ting_data["expected"] * 100)
            if ting_data["expected"] > 0 else 0
        )

    return {
        "tahun": tahun,
        "total_expected": total_expected,
        "total_collected": total_collected,
        "total_outstanding": total_expected - total_collected,
        "collection_rate": (total_collected / total_expected * 100) if total_expected > 0 else 0,
        "total_students": len(records),
        "by_tingkatan": list(by_tingkatan.values())
    }


# ============ STATISTICS ============

@router.get("/statistik")
async def get_yuran_statistics(
    tahun: int = Query(...),
    current_user: dict = Depends(get_current_user)
):
    """Statistik yuran untuk dashboard"""
    if current_user.get("role") not in ["superadmin", "admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")

    db = get_read_db()
    # Get all yuran for the year
    records = await db.student_yuran.find({"tahun": tahun}).to_list(2000)

    total_expected = sum(r.get("total_amount", 0) for r in records)
    total_collected = sum(r.get("paid_amount", 0) for r in records)
    total_students = len(records)
    paid_students = len([r for r in records if r.get("status") == "paid"])
    partial_students = len([r for r in records if r.get("status") == "partial"])
    pending_students = len([r for r in records if r.get("status") == "pending"])

    # Set Yuran count
    set_yuran_count = await db.set_yuran.count_documents({"tahun": tahun, "is_active": True})

    return {
        "tahun": tahun,
        "total_expected": total_expected,
        "total_collected": total_collected,
        "total_outstanding": total_expected - total_collected,
        "collection_rate": (total_collected / total_expected * 100) if total_expected > 0 else 0,
        "total_students": total_students,
        "paid_students": paid_students,
        "partial_students": partial_students,
        "pending_students": pending_students,
        "set_yuran_count": set_yuran_count
    }



# ============ NOTIFICATION ENDPOINTS ============

@router.post("/send-reminders")
async def send_fee_reminders(
    cron_key: str = Query(None, description="Cron secret key for automated calls"),
    current_user: dict = Depends(get_current_user)
):
    """
    Send fee reminder emails to all parents with outstanding fees.
    Can be called by admin/bendahari manually or by cron job with cron_key.
    """
    import os
    from services.email_service import send_fee_reminder, RESEND_ENABLED
    
    # Check authorization
    cron_secret = os.environ.get("CRON_SECRET_KEY", "")
    is_cron_call = cron_key and cron_key == cron_secret
    
    if not is_cron_call:
        if current_user.get("role") not in ["superadmin", "admin", "bendahari"]:
            raise HTTPException(status_code=403, detail="Akses ditolak")
    
    if not RESEND_ENABLED:
        return {
            "status": "skipped",
            "message": "Email service tidak dikonfigurasi. Sila tetapkan RESEND_API_KEY.",
            "notifications_sent": 0,
            "emails_sent": 0
        }
    
    db = get_read_db()

    # Get all parents with outstanding fees (aggregation done in Python for CoreStore compatibility).
    records = await db.student_yuran.find({"status": {"$ne": "paid"}}).to_list(10000)
    parents_map: Dict[str, Dict[str, Any]] = {}
    for rec in records:
        parent_id = rec.get("parent_id")
        if not parent_id:
            continue
        outstanding = (rec.get("total_amount", 0) or 0) - (rec.get("paid_amount", 0) or 0)
        if outstanding <= 0:
            continue
        parent_key = str(parent_id)
        if parent_key not in parents_map:
            parents_map[parent_key] = {"_id": parent_id, "total_outstanding": 0.0, "records": []}
        parents_map[parent_key]["total_outstanding"] += outstanding
        parents_map[parent_key]["records"].append({
            "student_name": rec.get("student_name"),
            "student_id": rec.get("student_id"),
            "tingkatan": rec.get("tingkatan"),
            "tahun": rec.get("tahun"),
            "total_amount": rec.get("total_amount", 0),
            "paid_amount": rec.get("paid_amount", 0),
            "status": rec.get("status"),
        })
    parents_outstanding = list(parents_map.values())
    
    notifications_sent = 0
    emails_sent = 0
    email_results = []
    
    for parent_data in parents_outstanding:
        parent_id = parent_data["_id"]
        if not parent_id:
            continue
            
        # Get parent info
        parent = await db.users.find_one({"_id": _as_object_id_if_valid(parent_id)})
        if not parent:
            continue
        
        parent_email = parent.get("email")
        parent_name = parent.get("full_name", "Ibu Bapa")
        
        # Build children outstanding data
        children_outstanding = []
        records_by_student = {}
        
        for rec in parent_data["records"]:
            student_id = str(rec.get("student_id"))
            if student_id not in records_by_student:
                records_by_student[student_id] = {
                    "name": rec.get("student_name"),
                    "student_id": student_id,
                    "outstanding": 0,
                    "outstanding_items": []
                }
            
            outstanding = rec.get("total_amount", 0) - rec.get("paid_amount", 0)
            if outstanding > 0:
                records_by_student[student_id]["outstanding"] += outstanding
                records_by_student[student_id]["outstanding_items"].append({
                    "tingkatan": rec.get("tingkatan"),
                    "tahun": rec.get("tahun"),
                    "amount": outstanding
                })
        
        # Get student details
        for student_id, data in records_by_student.items():
            student = await db.students.find_one({"_id": _as_object_id_if_valid(student_id)})
            if student:
                data["form"] = student.get("form")
                data["class_name"] = student.get("class_name", "")
            children_outstanding.append(data)
        
        # Create in-app notification
        await db.notifications.insert_one({
            "user_id": parent_id,
            "title": "Peringatan Tunggakan Yuran",
            "message": f"Anda mempunyai tunggakan yuran berjumlah RM {parent_data['total_outstanding']:.2f}. Sila jelaskan secepat mungkin.",
            "type": "warning",
            "category": "fees",
            "action_url": "/payment-center?bulk=all-yuran",
            "action_label": "Bayar Sekarang",
            "metadata": {
                "total_outstanding": parent_data.get("total_outstanding", 0),
            },
            "is_read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        notifications_sent += 1
        
        # Send email if parent has email
        if parent_email:
            result = await send_fee_reminder(
                parent_email=parent_email,
                parent_name=parent_name,
                children_outstanding=children_outstanding,
                total_outstanding=parent_data["total_outstanding"]
            )
            email_results.append(result)
            if result.get("status") == "success":
                emails_sent += 1
    
    await log_audit(
        None if is_cron_call else current_user,
        "SEND_FEE_REMINDERS",
        "yuran",
        f"Hantar {notifications_sent} notifikasi dan {emails_sent} email peringatan"
    )
    
    return {
        "status": "success",
        "message": f"Berjaya menghantar {notifications_sent} notifikasi dan {emails_sent} email peringatan",
        "notifications_sent": notifications_sent,
        "emails_sent": emails_sent,
        "parents_notified": len(parents_outstanding),
        "email_results": email_results
    }


@router.get("/notifications/parent")
async def get_parent_notifications(
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """Get notifications for the current parent user"""
    if current_user.get("role") != "parent":
        raise HTTPException(status_code=403, detail="Endpoint untuk ibu bapa sahaja")
    
    db = get_read_db()
    notifications = await db.notifications.find({
        "user_id": current_user["_id"]
    }).sort("created_at", -1).limit(limit).to_list(limit)
    
    # Serialize
    result = []
    for n in notifications:
        result.append({
            "id": str(n["_id"]),
            "title": n.get("title"),
            "message": n.get("message"),
            "type": n.get("type", "info"),
            "category": n.get("category", "general"),
            "is_read": n.get("is_read", False),
            "action_url": n.get("action_url") or n.get("link"),
            "action_label": n.get("action_label"),
            "metadata": n.get("metadata", {}),
            "created_at": n.get("created_at")
        })
    
    # Count unread
    unread_count = await db.notifications.count_documents({
        "user_id": current_user["_id"],
        "is_read": False
    })
    
    return {
        "notifications": result,
        "unread_count": unread_count
    }


@router.post("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark a notification as read"""
    db = get_read_db()
    result = await db.notifications.update_one(
        {"_id": _as_object_id_if_valid(notification_id), "user_id": current_user["_id"]},
        {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Notifikasi tidak dijumpai")
    
    return {"message": "Notifikasi ditanda sebagai dibaca"}


@router.post("/notifications/mark-all-read")
async def mark_all_notifications_read(
    current_user: dict = Depends(get_current_user)
):
    """Mark all notifications as read for current user"""
    db = get_read_db()
    unread = await db.notifications.find(
        {"user_id": current_user["_id"], "is_read": False}
    ).to_list(10000)
    updated_count = 0
    now_iso = datetime.now(timezone.utc).isoformat()
    for notif in unread:
        result = await db.notifications.update_one(
            {"_id": notif.get("_id"), "user_id": current_user["_id"]},
            {"$set": {"is_read": True, "read_at": now_iso}},
        )
        updated_count += getattr(result, "modified_count", 0)
    
    return {
        "message": f"Berjaya menanda {updated_count} notifikasi sebagai dibaca",
        "updated_count": updated_count
    }



# ============ POLISI BAYARAN YURAN (ANSURAN DALAM 9 BULAN) ============
# Tetapan bendahari: bilangan maksimum bayaran dalam 9 bulan (sebelum bulan 10). Default 2.

DEADLINE_MONTH_TWO_PAYMENTS = 9   # Sebelum bulan 10 = bulan 1-9
DEFAULT_MAX_PAYMENTS = 2
SETTINGS_KEY_PAYMENT_POLICY = "yuran_payment_policy"
SETTINGS_KEY_INVOICE_TEMPLATE = "yuran_invoice_template_v1"
SETTINGS_KEY_AGM_REPORT_TEMPLATE = "agm_report_template_v1"

DEFAULT_INVOICE_TEMPLATE = {
    "header": {
        "left_logo_url": "",
        "right_logo_url": "",
        "right_title": "Invois",
        "rows": [
            "Portal MRSMKU",
            "Invois Yuran Pelajar",
        ],
    },
    "footer": {
        "rows": [
            "Terima kasih.",
            "Ini adalah cetakan komputer. Tiada tandatangan diperlukan.",
        ],
        "left_box": {
            "image_url": "",
            "title": "",
            "rows": [],
            "upload_rows": [],
        },
        "right_box": {
            "image_url": "",
            "title": "",
            "rows": [],
            "upload_rows": [],
        },
    },
}

DEFAULT_AGM_REPORT_TEMPLATE = {
    "header": {
        "left_logo_url": "",
        "right_logo_url": "",
        "right_title": "Laporan AGM",
        "rows": [
            "LAPORAN PENYATA KEWANGAN",
            "BERAKHIR",
        ],
    },
    "footer": {
        "rows": [
            "Dokumen ini dijana oleh sistem.",
            "Ini adalah cetakan komputer.",
        ],
        "left_boxes": [
            {"image_url": "", "title": "", "rows": [], "upload_rows": []},
            {"image_url": "", "title": "", "rows": [], "upload_rows": []},
        ],
        "right_boxes": [
            {"image_url": "", "title": "", "rows": [], "upload_rows": []},
            {"image_url": "", "title": "", "rows": [], "upload_rows": []},
        ],
    },
}


def _normalize_setting_line(value: Any, *, max_len: int = 240) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    return text[:max_len]


def _normalize_setting_rows(
    raw_rows: Any,
    *,
    max_rows: int = 12,
    max_len_per_row: int = 240,
) -> List[str]:
    if not isinstance(raw_rows, list):
        return []
    rows: List[str] = []
    for raw in raw_rows:
        normalized = _normalize_setting_line(raw, max_len=max_len_per_row)
        if normalized:
            rows.append(normalized)
        if len(rows) >= max_rows:
            break
    return rows


def _normalize_setting_upload_rows(
    raw_rows: Any,
    *,
    max_rows: int = 8,
) -> List[Dict[str, str]]:
    if not isinstance(raw_rows, list):
        return []

    upload_rows: List[Dict[str, str]] = []
    for raw in raw_rows:
        if not isinstance(raw, dict):
            continue
        image_url = _normalize_setting_line(raw.get("image_url"), max_len=500)
        caption = _normalize_setting_line(raw.get("caption"), max_len=180)
        if not image_url and not caption:
            continue
        upload_rows.append({
            "image_url": image_url,
            "caption": caption,
        })
        if len(upload_rows) >= max_rows:
            break
    return upload_rows


def _normalize_template_box(raw_box: Any, default_box: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(raw_box, dict):
        raw_box = {}
    return {
        "image_url": _normalize_setting_line(raw_box.get("image_url", default_box.get("image_url", "")), max_len=500),
        "title": _normalize_setting_line(raw_box.get("title", default_box.get("title", "")), max_len=120),
        "rows": _normalize_setting_rows(raw_box.get("rows"), max_rows=8, max_len_per_row=180),
        "upload_rows": _normalize_setting_upload_rows(raw_box.get("upload_rows"), max_rows=8),
    }


def _normalize_template_box_list(
    raw_boxes: Any,
    default_boxes: List[Dict[str, Any]],
    *,
    expected_count: int = 2,
) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    source_boxes = raw_boxes if isinstance(raw_boxes, list) else []
    for idx in range(expected_count):
        default_box = default_boxes[idx] if idx < len(default_boxes) else {"image_url": "", "title": "", "rows": [], "upload_rows": []}
        raw_box = source_boxes[idx] if idx < len(source_boxes) else {}
        normalized.append(_normalize_template_box(raw_box, default_box))
    return normalized


def normalize_invoice_template(raw_template: Any) -> Dict[str, Any]:
    base = DEFAULT_INVOICE_TEMPLATE
    if not isinstance(raw_template, dict):
        raw_template = {}

    raw_header = raw_template.get("header")
    raw_footer = raw_template.get("footer")
    if not isinstance(raw_header, dict):
        raw_header = {}
    if not isinstance(raw_footer, dict):
        raw_footer = {}

    header_default = base["header"]
    footer_default = base["footer"]

    normalized_header = {
        "left_logo_url": _normalize_setting_line(
            raw_header.get("left_logo_url", header_default["left_logo_url"]),
            max_len=500,
        ),
        "right_logo_url": _normalize_setting_line(
            raw_header.get("right_logo_url", header_default["right_logo_url"]),
            max_len=500,
        ),
        "right_title": _normalize_setting_line(
            raw_header.get("right_title", header_default["right_title"]),
            max_len=80,
        ) or header_default["right_title"],
        "rows": _normalize_setting_rows(
            raw_header.get("rows", header_default["rows"]),
            max_rows=12,
            max_len_per_row=240,
        ),
    }
    if not normalized_header["rows"]:
        normalized_header["rows"] = list(header_default["rows"])

    normalized_footer = {
        "rows": _normalize_setting_rows(
            raw_footer.get("rows", footer_default["rows"]),
            max_rows=12,
            max_len_per_row=240,
        ),
        "left_box": _normalize_template_box(raw_footer.get("left_box"), footer_default["left_box"]),
        "right_box": _normalize_template_box(raw_footer.get("right_box"), footer_default["right_box"]),
    }
    if not normalized_footer["rows"]:
        normalized_footer["rows"] = list(footer_default["rows"])

    return {
        "header": normalized_header,
        "footer": normalized_footer,
    }


def normalize_agm_report_template(raw_template: Any) -> Dict[str, Any]:
    base = DEFAULT_AGM_REPORT_TEMPLATE
    if not isinstance(raw_template, dict):
        raw_template = {}

    raw_header = raw_template.get("header")
    raw_footer = raw_template.get("footer")
    if not isinstance(raw_header, dict):
        raw_header = {}
    if not isinstance(raw_footer, dict):
        raw_footer = {}

    header_default = base["header"]
    footer_default = base["footer"]

    normalized_header = {
        "left_logo_url": _normalize_setting_line(
            raw_header.get("left_logo_url", header_default["left_logo_url"]),
            max_len=500,
        ),
        "right_logo_url": _normalize_setting_line(
            raw_header.get("right_logo_url", header_default["right_logo_url"]),
            max_len=500,
        ),
        "right_title": _normalize_setting_line(
            raw_header.get("right_title", header_default["right_title"]),
            max_len=120,
        ) or header_default["right_title"],
        "rows": _normalize_setting_rows(
            raw_header.get("rows", header_default["rows"]),
            max_rows=12,
            max_len_per_row=240,
        ),
    }
    if not normalized_header["rows"]:
        normalized_header["rows"] = list(header_default["rows"])

    normalized_footer = {
        "rows": _normalize_setting_rows(
            raw_footer.get("rows", footer_default["rows"]),
            max_rows=12,
            max_len_per_row=240,
        ),
        "left_boxes": _normalize_template_box_list(
            raw_footer.get("left_boxes"),
            footer_default.get("left_boxes", []),
            expected_count=2,
        ),
        "right_boxes": _normalize_template_box_list(
            raw_footer.get("right_boxes"),
            footer_default.get("right_boxes", []),
            expected_count=2,
        ),
    }
    if not normalized_footer["rows"]:
        normalized_footer["rows"] = list(footer_default["rows"])

    return {
        "header": normalized_header,
        "footer": normalized_footer,
    }


async def get_payment_policy_settings(db=None):
    """Dapatkan tetapan polisi bayaran (max_payments, deadline_month). Default max_payments=2."""
    db = db or get_read_db()
    doc = await db.settings.find_one({"key": SETTINGS_KEY_PAYMENT_POLICY})
    if not doc:
        return {"max_payments": DEFAULT_MAX_PAYMENTS, "deadline_month": DEADLINE_MONTH_TWO_PAYMENTS}
    return {
        "max_payments": doc.get("max_payments", DEFAULT_MAX_PAYMENTS),
        "deadline_month": doc.get("deadline_month", DEADLINE_MONTH_TWO_PAYMENTS)
    }


@router.get("/settings/payment-policy")
async def get_payment_policy(current_user: dict = Depends(get_current_user)):
    """Get yuran payment policy - bilangan maksimum bayaran dalam 9 bulan (tetapan bendahari)"""
    settings = await get_payment_policy_settings(get_read_db())
    max_p = settings["max_payments"]
    return {
        "max_payments": max_p,
        "deadline_month": settings["deadline_month"],
        "description": f"Ibu bapa boleh bayar yuran sebelum bulan 10 setiap tahun (dalam masa 9 bulan) sebanyak maksimum {max_p} kali bayaran."
    }


class PaymentPolicyUpdate(BaseModel):
    max_payments: int = Field(..., ge=1, le=9, description="Bilangan maksimum bayaran dalam 9 bulan (1-9)")


class TemplateUploadRowUpdate(BaseModel):
    image_url: Optional[str] = ""
    caption: Optional[str] = ""


class InvoiceTemplateBoxUpdate(BaseModel):
    image_url: Optional[str] = ""
    title: Optional[str] = ""
    rows: List[str] = Field(default_factory=list, description="Baris teks untuk box")
    upload_rows: List[TemplateUploadRowUpdate] = Field(default_factory=list, description="Baris tambahan imej untuk box")


class InvoiceTemplateHeaderUpdate(BaseModel):
    left_logo_url: Optional[str] = ""
    right_logo_url: Optional[str] = ""
    right_title: Optional[str] = "Invois"
    rows: List[str] = Field(default_factory=list, description="Baris alamat/maklumat header")


class InvoiceTemplateFooterUpdate(BaseModel):
    rows: List[str] = Field(default_factory=list, description="Baris teks footer utama")
    left_box: InvoiceTemplateBoxUpdate = Field(default_factory=InvoiceTemplateBoxUpdate)
    right_box: InvoiceTemplateBoxUpdate = Field(default_factory=InvoiceTemplateBoxUpdate)


class InvoiceTemplateUpdate(BaseModel):
    header: InvoiceTemplateHeaderUpdate = Field(default_factory=InvoiceTemplateHeaderUpdate)
    footer: InvoiceTemplateFooterUpdate = Field(default_factory=InvoiceTemplateFooterUpdate)


class AgmReportTemplateHeaderUpdate(BaseModel):
    left_logo_url: Optional[str] = ""
    right_logo_url: Optional[str] = ""
    right_title: Optional[str] = "Laporan AGM"
    rows: List[str] = Field(default_factory=list, description="Baris header laporan AGM")


class AgmReportTemplateFooterUpdate(BaseModel):
    rows: List[str] = Field(default_factory=list, description="Baris footer laporan AGM")
    left_boxes: List[InvoiceTemplateBoxUpdate] = Field(default_factory=list, description="2 box di sebelah kiri footer")
    right_boxes: List[InvoiceTemplateBoxUpdate] = Field(default_factory=list, description="2 box di sebelah kanan footer")


class AgmReportTemplateUpdate(BaseModel):
    header: AgmReportTemplateHeaderUpdate = Field(default_factory=AgmReportTemplateHeaderUpdate)
    footer: AgmReportTemplateFooterUpdate = Field(default_factory=AgmReportTemplateFooterUpdate)


async def get_invoice_template_settings(db=None):
    db = db or get_read_db()
    doc = await db.settings.find_one({"key": SETTINGS_KEY_INVOICE_TEMPLATE})
    if not doc:
        return normalize_invoice_template(DEFAULT_INVOICE_TEMPLATE)
    return normalize_invoice_template(doc.get("template"))


async def get_agm_report_template_settings(db=None):
    db = db or get_read_db()
    doc = await db.settings.find_one({"key": SETTINGS_KEY_AGM_REPORT_TEMPLATE})
    if not doc:
        return normalize_agm_report_template(DEFAULT_AGM_REPORT_TEMPLATE)
    return normalize_agm_report_template(doc.get("template"))


@router.put("/settings/payment-policy")
async def update_payment_policy(
    data: PaymentPolicyUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Ketetapan bendahari: set bilangan maksimum ansuran dalam 9 bulan. Default 2."""
    role = current_user.get("role")
    if role not in ("bendahari", "sub_bendahari", "superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Hanya bendahari/admin boleh mengemas kini tetapan ini")
    db = get_read_db()
    now = datetime.now(timezone.utc)
    doc = {
        "key": SETTINGS_KEY_PAYMENT_POLICY,
        "max_payments": data.max_payments,
        "deadline_month": DEADLINE_MONTH_TWO_PAYMENTS,
        "updated_at": now.isoformat(),
        "updated_by": str(current_user["_id"]),
        "updated_by_name": current_user.get("full_name", "")
    }
    await db.settings.update_one(
        {"key": SETTINGS_KEY_PAYMENT_POLICY},
        {"$set": doc},
        upsert=True
    )
    return {
        "max_payments": data.max_payments,
        "deadline_month": DEADLINE_MONTH_TWO_PAYMENTS,
        "description": f"Ibu bapa boleh bayar yuran sebelum bulan 10 setiap tahun (dalam masa 9 bulan) sebanyak maksimum {data.max_payments} kali bayaran."
    }


@router.get("/settings/invoice-template")
async def get_invoice_template(current_user: dict = Depends(get_current_user)):
    db = get_read_db()
    doc = await db.settings.find_one({"key": SETTINGS_KEY_INVOICE_TEMPLATE})
    template = normalize_invoice_template(doc.get("template") if doc else None)
    return {
        "template": template,
        "updated_at": doc.get("updated_at") if doc else None,
        "updated_by": doc.get("updated_by_name") if doc else None,
    }


@router.put("/settings/invoice-template")
async def update_invoice_template(
    data: InvoiceTemplateUpdate,
    current_user: dict = Depends(get_current_user),
):
    role = current_user.get("role")
    if role not in ("superadmin", "admin", "bendahari", "sub_bendahari"):
        raise HTTPException(status_code=403, detail="Hanya superadmin/admin/bendahari boleh mengemas kini template invois")

    template = normalize_invoice_template(data.dict())
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "key": SETTINGS_KEY_INVOICE_TEMPLATE,
        "template": template,
        "updated_at": now_iso,
        "updated_by": str(current_user.get("_id")),
        "updated_by_name": current_user.get("full_name", ""),
    }

    db = get_read_db()
    await db.settings.update_one(
        {"key": SETTINGS_KEY_INVOICE_TEMPLATE},
        {"$set": doc},
        upsert=True,
    )
    await log_audit(
        current_user,
        "UPDATE_INVOICE_TEMPLATE",
        "yuran",
        "Kemaskini tetapan header/footer invois",
    )
    return {
        "template": template,
        "updated_at": now_iso,
        "updated_by": current_user.get("full_name", ""),
    }


@router.get("/settings/agm-report-template")
async def get_agm_report_template(current_user: dict = Depends(get_current_user)):
    db = get_read_db()
    doc = await db.settings.find_one({"key": SETTINGS_KEY_AGM_REPORT_TEMPLATE})
    template = normalize_agm_report_template(doc.get("template") if doc else None)
    return {
        "template": template,
        "updated_at": doc.get("updated_at") if doc else None,
        "updated_by": doc.get("updated_by_name") if doc else None,
    }


@router.put("/settings/agm-report-template")
async def update_agm_report_template(
    data: AgmReportTemplateUpdate,
    current_user: dict = Depends(get_current_user),
):
    role = current_user.get("role")
    if role not in ("superadmin", "admin", "bendahari", "sub_bendahari"):
        raise HTTPException(status_code=403, detail="Hanya superadmin/admin/bendahari boleh mengemas kini template laporan AGM")

    template = normalize_agm_report_template(data.dict())
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "key": SETTINGS_KEY_AGM_REPORT_TEMPLATE,
        "template": template,
        "updated_at": now_iso,
        "updated_by": str(current_user.get("_id")),
        "updated_by_name": current_user.get("full_name", ""),
    }

    db = get_read_db()
    await db.settings.update_one(
        {"key": SETTINGS_KEY_AGM_REPORT_TEMPLATE},
        {"$set": doc},
        upsert=True,
    )
    await log_audit(
        current_user,
        "UPDATE_AGM_REPORT_TEMPLATE",
        "accounting",
        "Kemaskini tetapan header/footer template laporan AGM",
    )
    return {
        "template": template,
        "updated_at": now_iso,
        "updated_by": current_user.get("full_name", ""),
    }


# ============ PARENT PAYMENT (FULL / CATEGORY / TWO PAYMENTS) ============

class InstallmentPaymentRequest(BaseModel):
    payment_type: str = Field(..., description="'full', 'category', or 'two_payments'")
    category_code: Optional[str] = Field(None, description="Category code jika bayar mengikut kategori")
    payment_number: Optional[int] = Field(None, ge=1, le=9, description="Bayaran ke-N (untuk two_payments/ansuran)")
    payment_method: str = Field("fpx", description="Kaedah bayaran")


@router.get("/anak-saya/{yuran_id}/payment-options")
async def get_payment_options(
    yuran_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get available payment options for a yuran record - Parent only"""
    if current_user.get("role") != "parent":
        raise HTTPException(status_code=403, detail="Endpoint untuk ibu bapa sahaja")
    
    read_db = get_read_db()

    # Get yuran record
    yuran = await read_db.student_yuran.find_one({"_id": _as_object_id_if_valid(yuran_id)})
    if not yuran:
        raise HTTPException(status_code=404, detail="Rekod yuran tidak dijumpai")
    
    # Verify this yuran belongs to parent's child
    student = await read_db.students.find_one({"_id": yuran.get("student_id")})
    if not student or str(student.get("parent_id")) != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Get set_yuran for category breakdown
    set_yuran_ref = yuran.get("set_yuran_id")
    set_yuran = await read_db.set_yuran.find_one({"_id": _as_object_id_if_valid(set_yuran_ref)})
    policy_settings = await get_payment_policy_settings(read_db)
    max_payments = policy_settings["max_payments"]
    deadline_month = policy_settings["deadline_month"]
    
    total_amount = yuran.get("total_amount", 0)
    paid_amount = yuran.get("paid_amount", 0)
    outstanding = total_amount - paid_amount
    
    # Polisi ansuran: sebelum bulan 10 (1-9), maksimum N kali (tetapan bendahari)
    current_month = datetime.now(timezone.utc).month
    two_payment_plan = yuran.get("two_payment_plan") or {}
    payments_made = two_payment_plan.get("payments_made", 0)
    old_plan = yuran.get("installment_plan")
    if old_plan and payments_made == 0:
        payments_made = min(max_payments, old_plan.get("paid_installments", 0))
    within_deadline = current_month <= deadline_month
    two_payments_available = within_deadline and outstanding > 0 and payments_made < max_payments
    is_locked_two = payments_made >= 1
    
    # Build category list with payment allocation
    categories = []
    remaining_paid = paid_amount  # Amount to allocate to categories
    
    if set_yuran:
        for cat in set_yuran.get("categories", []):
            for sub_cat in cat.get("sub_categories", []):
                # Calculate category total based on religion
                is_muslim = student.get("religion", "").lower() in ["islam", "muslim"]
                cat_items = []
                cat_total = 0
                
                for item in sub_cat.get("items", []):
                    # Skip islam_only for non-muslims
                    if item.get("islam_only", False) and not is_muslim:
                        continue
                    cat_items.append({
                        "name": item.get("name"),
                        "amount": item.get("amount", 0)
                    })
                    cat_total += item.get("amount", 0)
                
                if cat_total > 0:
                    # Allocate payment to this category
                    allocated = min(remaining_paid, cat_total)
                    remaining_paid -= allocated
                    cat_balance = cat_total - allocated
                    cat_status = "paid" if cat_balance <= 0 else ("partial" if allocated > 0 else "pending")
                    
                    categories.append({
                        "name": sub_cat.get("name"),
                        "code": sub_cat.get("name").replace(" ", "_").lower(),
                        "amount": cat_total,
                        "paid": allocated,
                        "balance": max(0, cat_balance),
                        "status": cat_status,
                        "items": cat_items
                    })
    
    # Pilihan ansuran (dalam 9 bulan, maks N kali - tetapan bendahari)
    installment_amount = round(total_amount / max_payments, 2) if max_payments else 0
    two_payment_options = []
    if two_payments_available:
        if payments_made == 0:
            for n in range(1, max_payments + 1):
                amt = total_amount - (max_payments - 1) * installment_amount if n == max_payments else installment_amount
                two_payment_options.append({
                    "payment_number": n,
                    "amount": round(amt, 2),
                    "label": f"Bayaran {n} - RM {round(amt, 2):.2f}"
                })
        else:
            next_num = payments_made + 1
            two_payment_options = [
                {"payment_number": next_num, "amount": outstanding, "label": f"Bayaran {next_num} (baki) - RM {outstanding:.2f}"}
            ]
    
    can_change_method = not is_locked_two
    
    # Find categories that still have balance
    unpaid_categories = [c for c in categories if c["balance"] > 0]
    
    return {
        "yuran_id": str(yuran["_id"]),
        "student_name": student.get("full_name", student.get("name", "")),
        "tingkatan": yuran.get("tingkatan"),
        "tahun": yuran.get("tahun"),
        "total_amount": total_amount,
        "paid_amount": paid_amount,
        "outstanding": outstanding,
        "status": yuran.get("status"),
        "is_locked": is_locked_two,
        "can_change_method": can_change_method,
        "category_breakdown": categories,
        "unpaid_categories": unpaid_categories,
        "payment_options": {
            "full": {
                "enabled": can_change_method and outstanding > 0,
                "amount": outstanding,
                "description": "Bayar semua baki sekali gus (DISYORKAN)"
            },
            "category": {
                "enabled": len(unpaid_categories) > 0,
                "categories": unpaid_categories,
                "description": "Bayar mengikut kategori yuran"
            },
            "two_payments": {
                "enabled": two_payments_available,
                "max_payments": max_payments,
                "deadline_month": deadline_month,
                "payments_made": payments_made,
                "within_deadline": within_deadline,
                "options": two_payment_options,
                "description": f"Bayar dalam {max_payments} kali (sebelum bulan 10 sahaja)"
            }
        },
        "two_payment_plan": {"payments_made": payments_made, "max_payments": max_payments, "deadline_month": deadline_month},
        "lock_message": "Anda telah mula bayaran 2 kali. Sila selesaikan Bayaran 2 atau bayar mengikut kategori." if is_locked_two else None
    }


@router.post("/anak-saya/{yuran_id}/pay")
async def process_parent_payment(
    yuran_id: str,
    data: InstallmentPaymentRequest,
    current_user: dict = Depends(get_current_user)
):
    """Process payment from parent - supports full, category, or installment payment"""
    if current_user.get("role") != "parent":
        raise HTTPException(status_code=403, detail="Endpoint untuk ibu bapa sahaja")

    core_db = get_read_db()
    yuran_lookup_id = _as_object_id_if_valid(yuran_id)

    # Get yuran record
    yuran = await core_db.student_yuran.find_one({"_id": yuran_lookup_id})
    if not yuran:
        raise HTTPException(status_code=404, detail="Rekod yuran tidak dijumpai")
    
    # Verify this yuran belongs to parent's child
    student = await core_db.students.find_one({"_id": yuran.get("student_id")})
    if not student or str(student.get("parent_id")) != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    total_amount = yuran.get("total_amount", 0)
    paid_amount = yuran.get("paid_amount", 0)
    outstanding = total_amount - paid_amount
    
    if outstanding <= 0:
        raise HTTPException(status_code=400, detail="Yuran sudah dijelaskan sepenuhnya")
    
    policy_settings = await get_payment_policy_settings(core_db)
    max_payments = policy_settings["max_payments"]
    deadline_month = policy_settings["deadline_month"]
    
    two_plan = yuran.get("two_payment_plan") or {}
    payments_made = two_plan.get("payments_made", 0)
    if yuran.get("installment_plan") and payments_made == 0:
        payments_made = min(max_payments, yuran["installment_plan"].get("paid_installments", 0))
    is_locked_two = payments_made >= 1
    
    if is_locked_two and data.payment_type == "full":
        raise HTTPException(status_code=400, detail="Anda telah mula bayaran ansuran. Sila selesaikan baki atau bayar mengikut kategori.")
    
    # Get set_yuran for category calculation
    set_yuran = await core_db.set_yuran.find_one({"_id": _as_object_id_if_valid(yuran.get("set_yuran_id"))})
    is_muslim = student.get("religion", "").lower() in ["islam", "muslim"]
    
    # Calculate payment amount based on type
    payment_amount = 0
    payment_description = ""
    category_paid = None
    excess_to_dana = 0
    
    if data.payment_type == "full":
        payment_amount = outstanding
        payment_description = "Bayaran penuh"
        
    elif data.payment_type == "category":
        if not data.category_code:
            raise HTTPException(status_code=400, detail="Kod kategori diperlukan")
        
        if not set_yuran:
            raise HTTPException(status_code=404, detail="Set yuran tidak dijumpai")
        
        # Build category allocation to find the unpaid portion
        categories = []
        remaining_paid = paid_amount
        
        for cat in set_yuran.get("categories", []):
            for sub_cat in cat.get("sub_categories", []):
                cat_total = 0
                for item in sub_cat.get("items", []):
                    if item.get("islam_only", False) and not is_muslim:
                        continue
                    cat_total += item.get("amount", 0)
                
                if cat_total > 0:
                    allocated = min(remaining_paid, cat_total)
                    remaining_paid -= allocated
                    cat_balance = cat_total - allocated
                    
                    categories.append({
                        "name": sub_cat.get("name"),
                        "code": sub_cat.get("name").replace(" ", "_").lower(),
                        "amount": cat_total,
                        "paid": allocated,
                        "balance": max(0, cat_balance)
                    })
        
        # Find the requested category
        target_category = None
        for cat in categories:
            if cat["code"] == data.category_code:
                target_category = cat
                break
        
        if not target_category:
            raise HTTPException(status_code=400, detail="Kategori tidak dijumpai")
        
        if target_category["balance"] <= 0:
            raise HTTPException(status_code=400, detail=f"Kategori {target_category['name']} sudah lunas")
        
        payment_amount = target_category["balance"]
        payment_description = f"Bayaran kategori: {target_category['name']}"
        category_paid = target_category["name"]
        
    elif data.payment_type == "two_payments":
        current_month = datetime.now(timezone.utc).month
        if current_month > deadline_month:
            raise HTTPException(status_code=400, detail=f"Bayaran ansuran hanya dibenarkan sebelum bulan {deadline_month + 1} (sehingga bulan {deadline_month}). Bulan semasa: {current_month}")
        if payments_made >= max_payments:
            raise HTTPException(status_code=400, detail=f"Anda telah menggunakan {max_payments} kali bayaran untuk yuran ini")
        
        next_payment = payments_made + 1
        if data.payment_number and data.payment_number != next_payment:
            raise HTTPException(status_code=400, detail=f"Seterusnya ialah Bayaran {next_payment}, bukan Bayaran {data.payment_number}")
        
        installment_amt = round(total_amount / max_payments, 2) if max_payments else 0
        if next_payment < max_payments:
            payment_amount = installment_amt
            payment_description = f"Bayaran {next_payment}/{max_payments}"
        else:
            payment_amount = outstanding
            payment_description = f"Bayaran {next_payment}/{max_payments}"
        
        new_two_plan = {
            "max_payments": max_payments,
            "payments_made": next_payment,
            "deadline_month": deadline_month,
            "last_payment_at": datetime.now(timezone.utc).isoformat()
        }
        if not two_plan.get("started_at"):
            new_two_plan["started_at"] = datetime.now(timezone.utc).isoformat()
        
        await core_db.student_yuran.update_one(
            {"_id": yuran_lookup_id},
            {"$set": {"two_payment_plan": new_two_plan}}
        )
    else:
        raise HTTPException(status_code=400, detail="Jenis bayaran tidak sah")
    
    # Check for excess payment (goes to Dana Kecemerlangan)
    new_paid = paid_amount + payment_amount
    if new_paid > total_amount:
        excess_to_dana = new_paid - total_amount
        payment_amount = outstanding  # Only charge what's outstanding
        new_paid = total_amount
    
    # Generate receipt number
    receipt_number = await generate_receipt_number(core_db)
    payment_reference = generate_payment_reference(prefix="PAY")
    
    # Create payment record
    now = datetime.now(timezone.utc)
    payment_record = {
        "student_yuran_id": yuran["_id"],
        "student_id": yuran.get("student_id"),
        "parent_id": current_user["_id"],
        "amount": payment_amount,
        "payment_type": data.payment_type,
        "payment_method": data.payment_method,
        "receipt_number": receipt_number,
        "reference_number": payment_reference,
        "description": payment_description,
        "category_paid": category_paid,
        "status": "completed",
        "created_at": now,
        "created_by": current_user["_id"]
    }
    
    if data.payment_type == "two_payments":
        payment_record["payment_number"] = next_payment
        payment_record["max_payments"] = max_payments
    
    if excess_to_dana > 0:
        payment_record["excess_to_dana_kecemerlangan"] = excess_to_dana
    
    await core_db.yuran_payments.insert_one(payment_record)
    
    # Peruntukkan bayaran ke senarai item mengikut keutamaan (untuk laporan/accounting detail)
    items = yuran.get("items", [])
    if items and data.payment_type in ("full", "two_payments"):
        allocate_payment_to_yuran_items(items, payment_amount, now.isoformat())
    
    # Update yuran record (termasuk items supaya laporan ikut senarai)
    new_status = "paid" if new_paid >= total_amount else "partial"
    update_fields = {
        "paid_amount": new_paid,
        "balance": total_amount - new_paid,
        "status": new_status,
        "last_payment_date": now.isoformat(),
        "updated_at": now
    }
    if items and data.payment_type in ("full", "two_payments"):
        update_fields["items"] = items
    await core_db.student_yuran.update_one(
        {"_id": yuran_lookup_id},
        {
            "$set": update_fields,
            "$push": {
                "payments": {
                    "amount": payment_amount,
                    "payment_method": data.payment_method,
                    "receipt_number": receipt_number,
                    "reference_number": payment_reference,
                    "payment_type": data.payment_type,
                    "description": payment_description,
                    "category_paid": category_paid,
                    "paid_at": now.isoformat(),
                    "paid_by": str(current_user["_id"]),
                    "paid_by_name": current_user.get("full_name", ""),
                }
            }
        }
    )
    await _invalidate_financial_dashboard_cache_safely(core_db, scope="yuran")
    
    # Handle excess to Dana Kecemerlangan
    if excess_to_dana > 0:
        # Route excess contributions through migrated tabung collection path.
        await core_db.tabung_donations.insert_one(
            {
                "campaign_id": None,
                "campaign_title": "Dana Kecemerlangan",
                "campaign_type": "amount",
                "user_id": current_user["_id"],
                "donor_name": current_user.get("full_name", "Ibu Bapa"),
                "donor_email": current_user.get("email"),
                "is_anonymous": False,
                "amount": excess_to_dana,
                "payment_method": data.payment_method,
                "payment_status": "completed",
                "message": f"Lebihan bayaran yuran - {student.get('full_name', '')}",
                "receipt_number": receipt_number,
                "source": "yuran_excess",
                "type": "dana_kecemerlangan",
                "student_id": yuran.get("student_id"),
                "parent_id": current_user["_id"],
                "reference": receipt_number,
                "created_at": now,
            }
        )
    
    # Create accounting transaction
    await create_yuran_accounting_transaction(
        core_db,
        current_user,
        payment_amount,
        receipt_number,
        student.get("full_name", student.get("name", "")),
        yuran.get("set_yuran_nama", "Yuran"),
        yuran["_id"]
    )
    
    await log_audit(
        current_user,
        "PARENT_YURAN_PAYMENT",
        "yuran",
        f"{payment_description} - RM {payment_amount:.2f} untuk {student.get('full_name', student.get('name', ''))}"
    )
    
    response_data = {
        "success": True,
        "message": f"Bayaran RM {payment_amount:.2f} berjaya direkodkan",
        "receipt_number": receipt_number,
        "payment_reference": payment_reference,
        "payment_amount": payment_amount,
        "payment_type": data.payment_type,
        "new_paid_amount": new_paid,
        "new_outstanding": total_amount - new_paid,
        "status": new_status
    }
    
    if excess_to_dana > 0:
        response_data["excess_to_dana_kecemerlangan"] = excess_to_dana
        response_data["message"] += f" (Lebihan RM {excess_to_dana:.2f} dimasukkan ke Dana Kecemerlangan)"
    
    return response_data
