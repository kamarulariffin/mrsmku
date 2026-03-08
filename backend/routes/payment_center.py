"""
Payment Center Module - Pusat Bayaran Berpusat
Centralized payment system for all modules (Yuran, Koperasi, Bus, Infaq)
Session-based cart with mock payment gateway
"""
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Callable, Dict, Any
from io import BytesIO
import base64
import uuid
import os
import json

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from bson import ObjectId

try:
    from pywebpush import webpush, WebPushException
except Exception:  # pragma: no cover - optional dependency at runtime
    webpush = None

    class WebPushException(Exception):
        pass

router = APIRouter(prefix="/api/payment-center", tags=["Payment Center"])
security = HTTPBearer(auto_error=False)

# ============ INJECTED DEPENDENCIES ============
_get_db_func: Callable = None
_get_current_user_func: Callable = None
_log_audit_func: Callable = None

# Cart persisted in MongoDB (payment_center_cart) so all modules use one troli
CART_COLLECTION = "payment_center_cart"
REMINDER_COLLECTION = "payment_reminders"
REMINDER_PREFERENCE_COLLECTION = "payment_reminder_preferences"
REMINDER_ALLOWED_SOURCES = {"google_calendar", "ics_download", "manual"}
REMINDER_PREFERENCE_ALLOWED_SOURCES = {"google_calendar", "ics_download"}
DEFAULT_REMINDER_DAYS_BEFORE = 3
DEFAULT_REMINDER_TIME = "09:00"
DEFAULT_REMINDER_SOURCE = "google_calendar"
REMINDER_MAX_RETRY_ATTEMPTS = 3
REMINDER_RETRY_BASE_MINUTES = 10
WEB_PUSH_VAPID_PUBLIC_KEY_ENV = "WEB_PUSH_VAPID_PUBLIC_KEY"
WEB_PUSH_VAPID_PRIVATE_KEY_ENV = "WEB_PUSH_VAPID_PRIVATE_KEY"
WEB_PUSH_VAPID_SUBJECT_ENV = "WEB_PUSH_VAPID_SUBJECT"
DEFAULT_WEB_PUSH_VAPID_SUBJECT = "mailto:admin@mrsmku.local"

# Polisi ansuran yuran: sebelum bulan 10, bilangan maksimum dari tetapan bendahari (default 2)
PAYMENT_POLICY_KEY = "yuran_payment_policy"
DEFAULT_MAX_PAYMENTS = 2
DEADLINE_MONTH_DEFAULT = 9


async def _get_yuran_payment_policy(db):
    """Dapatkan tetapan polisi bayaran yuran (max_payments, deadline_month)."""
    doc = await db.settings.find_one({"key": PAYMENT_POLICY_KEY})
    if not doc:
        return {"max_payments": DEFAULT_MAX_PAYMENTS, "deadline_month": DEADLINE_MONTH_DEFAULT}
    return {
        "max_payments": doc.get("max_payments", DEFAULT_MAX_PAYMENTS),
        "deadline_month": doc.get("deadline_month", DEADLINE_MONTH_DEFAULT)
    }


def init_router(get_db_func, auth_func, log_audit_func):
    """Initialize router with dependencies from server.py"""
    global _get_db_func, _get_current_user_func, _log_audit_func
    _get_db_func = get_db_func
    _get_current_user_func = auth_func
    _log_audit_func = log_audit_func


def get_db():
    return _get_db_func()


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
        # Cache invalidation should not break checkout flow.
        pass


def _safe_parse_due_date(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
        except ValueError:
            try:
                return datetime.strptime(raw[:10], "%Y-%m-%d").date()
            except ValueError:
                return None
    return None


def _build_due_date_meta(value):
    parsed = _safe_parse_due_date(value)
    if not parsed:
        return {"due_date": value or "", "days_to_due": None, "is_overdue": False}
    days_to_due = (parsed - datetime.now(timezone.utc).date()).days
    return {"due_date": parsed.isoformat(), "days_to_due": days_to_due, "is_overdue": days_to_due < 0}


def _is_valid_time_hhmm(value: str) -> bool:
    if not isinstance(value, str):
        return False
    raw = value.strip()
    if len(raw) != 5 or raw[2] != ":":
        return False
    try:
        datetime.strptime(raw, "%H:%M")
        return True
    except ValueError:
        return False


def _normalize_reminder_preferences(doc: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    source_doc = doc or {}
    days_before = int(source_doc.get("default_days_before", DEFAULT_REMINDER_DAYS_BEFORE) or DEFAULT_REMINDER_DAYS_BEFORE)
    if days_before < 0:
        days_before = 0
    if days_before > 30:
        days_before = 30

    reminder_time = str(source_doc.get("default_time", DEFAULT_REMINDER_TIME) or DEFAULT_REMINDER_TIME).strip()
    if not _is_valid_time_hhmm(reminder_time):
        reminder_time = DEFAULT_REMINDER_TIME

    source = str(source_doc.get("default_source", DEFAULT_REMINDER_SOURCE) or DEFAULT_REMINDER_SOURCE).strip().lower()
    if source not in REMINDER_PREFERENCE_ALLOWED_SOURCES:
        source = DEFAULT_REMINDER_SOURCE

    return {
        "default_days_before": days_before,
        "default_time": reminder_time,
        "default_source": source,
        "updated_at": _serialize_datetime(source_doc.get("updated_at")),
        "created_at": _serialize_datetime(source_doc.get("created_at")),
    }


def _compute_retry_backoff_minutes(retry_count: int) -> int:
    safe_retry_count = max(1, int(retry_count or 1))
    # 1st retry: 10 min, 2nd retry: 20 min, 3rd retry: 40 min (cap 2 hours)
    return min(120, REMINDER_RETRY_BASE_MINUTES * (2 ** (safe_retry_count - 1)))


def _get_web_push_config() -> Dict[str, Any]:
    public_key = str(os.environ.get(WEB_PUSH_VAPID_PUBLIC_KEY_ENV, "") or "").strip()
    private_key = str(os.environ.get(WEB_PUSH_VAPID_PRIVATE_KEY_ENV, "") or "").strip()
    subject = str(os.environ.get(WEB_PUSH_VAPID_SUBJECT_ENV, DEFAULT_WEB_PUSH_VAPID_SUBJECT) or "").strip()
    enabled = bool(public_key and private_key and webpush is not None)
    return {
        "enabled": enabled,
        "public_key": public_key,
        "private_key": private_key,
        "subject": subject or DEFAULT_WEB_PUSH_VAPID_SUBJECT,
    }


def _build_user_id_candidates(user_id: Any) -> List[Any]:
    candidates: List[Any] = []
    if user_id is None:
        return candidates
    candidates.append(user_id)
    if isinstance(user_id, ObjectId):
        candidates.append(str(user_id))
    elif isinstance(user_id, str) and ObjectId.is_valid(user_id):
        candidates.append(ObjectId(user_id))
    # Deduplicate without assuming hashability for all types.
    out: List[Any] = []
    for item in candidates:
        if item not in out:
            out.append(item)
    return out


async def _send_web_push_to_user(
    db,
    *,
    user_id: Any,
    title: str,
    body: str,
    url: str,
    priority: str = "normal",
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, int]:
    config = _get_web_push_config()
    user_candidates = _build_user_id_candidates(user_id)
    if not user_candidates:
        return {"sent": 0, "failed": 0, "skipped": 0}

    subscriptions = await db.push_subscriptions.find(
        {"user_id": {"$in": user_candidates}, "is_active": True}
    ).to_list(30)
    if not subscriptions:
        return {"sent": 0, "failed": 0, "skipped": 0}

    sent = 0
    failed = 0
    skipped = 0
    payload = {
        "title": title,
        "body": body,
        "icon": "/logo192.png",
        "badge": "/badge72.png",
        "priority": priority,
        "data": {"url": url, **(metadata or {})},
    }

    for sub in subscriptions:
        if not config["enabled"]:
            skipped += 1
            try:
                await db.push_logs.insert_one(
                    {
                        "subscription_id": sub.get("_id"),
                        "user_id": sub.get("user_id"),
                        "title": title,
                        "body": body,
                        "url": url,
                        "status": "skipped",
                        "reason": "webpush_not_configured",
                        "created_at": datetime.now(timezone.utc),
                    }
                )
            except Exception:
                pass
            continue

        endpoint = str(sub.get("endpoint") or "").strip()
        keys = sub.get("keys") or {}
        p256dh = str(keys.get("p256dh") or "").strip() if isinstance(keys, dict) else ""
        auth = str(keys.get("auth") or "").strip() if isinstance(keys, dict) else ""
        if not endpoint or not p256dh or not auth:
            skipped += 1
            try:
                await db.push_logs.insert_one(
                    {
                        "subscription_id": sub.get("_id"),
                        "user_id": sub.get("user_id"),
                        "title": title,
                        "body": body,
                        "url": url,
                        "status": "skipped",
                        "reason": "invalid_subscription_payload",
                        "created_at": datetime.now(timezone.utc),
                    }
                )
            except Exception:
                pass
            continue

        try:
            webpush(
                subscription_info={
                    "endpoint": endpoint,
                    "keys": {"p256dh": p256dh, "auth": auth},
                },
                data=json.dumps(payload, ensure_ascii=True),
                vapid_private_key=config["private_key"],
                vapid_claims={"sub": config["subject"]},
                ttl=3600,
            )
            sent += 1
            try:
                await db.push_logs.insert_one(
                    {
                        "subscription_id": sub.get("_id"),
                        "user_id": sub.get("user_id"),
                        "title": title,
                        "body": body,
                        "url": url,
                        "status": "sent",
                        "created_at": datetime.now(timezone.utc),
                    }
                )
            except Exception:
                pass
        except WebPushException as exc:
            failed += 1
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            if status_code in (404, 410):
                try:
                    await db.push_subscriptions.update_one(
                        {"_id": sub.get("_id")},
                        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}},
                    )
                except Exception:
                    pass
            try:
                await db.push_logs.insert_one(
                    {
                        "subscription_id": sub.get("_id"),
                        "user_id": sub.get("user_id"),
                        "title": title,
                        "body": body,
                        "url": url,
                        "status": "failed",
                        "status_code": status_code,
                        "error": str(exc),
                        "created_at": datetime.now(timezone.utc),
                    }
                )
            except Exception:
                pass
        except Exception as exc:  # pragma: no cover - unexpected runtime branch
            failed += 1
            try:
                await db.push_logs.insert_one(
                    {
                        "subscription_id": sub.get("_id"),
                        "user_id": sub.get("user_id"),
                        "title": title,
                        "body": body,
                        "url": url,
                        "status": "failed",
                        "error": str(exc),
                        "created_at": datetime.now(timezone.utc),
                    }
                )
            except Exception:
                pass

    return {"sent": sent, "failed": failed, "skipped": skipped}


def _parse_iso_datetime(value) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        try:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _serialize_datetime(value) -> str:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc).isoformat()
        return value.astimezone(timezone.utc).isoformat()
    if value is None:
        return ""
    return str(value)


def _build_payment_reminder_message(reminder: Dict[str, Any]) -> str:
    student_name = reminder.get("student_name") or "anak anda"
    set_name = reminder.get("set_name") or "Yuran"
    amount = float(reminder.get("amount") or 0)
    due_date_raw = reminder.get("due_date")
    due_date = _safe_parse_due_date(due_date_raw)
    due_label = due_date.strftime("%d/%m/%Y") if due_date else (str(due_date_raw or "-"))
    return (
        f"Peringatan bayaran untuk {student_name} ({set_name}) berjumlah RM {amount:.2f}. "
        f"Tarikh akhir: {due_label}."
    )


async def process_due_payment_reminders(db, limit: int = 100, now_utc: Optional[datetime] = None) -> Dict[str, Any]:
    effective_limit = max(1, min(int(limit or 100), 500))
    now = now_utc or datetime.now(timezone.utc)
    now_iso = now.isoformat()
    reminders = await db[REMINDER_COLLECTION].find(
        {
            "$or": [
                {"status": "scheduled", "remind_at": {"$lte": now_iso}},
                {
                    "status": "failed",
                    "retry_count": {"$lt": REMINDER_MAX_RETRY_ATTEMPTS},
                    "$or": [
                        {"next_retry_at": {"$exists": False}},
                        {"next_retry_at": ""},
                        {"next_retry_at": {"$lte": now_iso}},
                    ],
                },
            ]
        }
    ).sort("remind_at", 1).limit(effective_limit).to_list(effective_limit)

    sent_count = 0
    failed_count = 0
    retried_count = 0
    recovered_count = 0
    exhausted_count = 0
    push_sent_count = 0
    push_failed_count = 0
    push_skipped_count = 0

    for reminder in reminders:
        reminder_id = reminder.get("_id")
        user_id = reminder.get("user_id")
        status_before = str(reminder.get("status") or "")
        retry_count_before = int(reminder.get("retry_count") or 0)
        if status_before == "failed":
            retried_count += 1
        if user_id is None:
            failed_count += 1
            continue

        action_url = "/payment-center?bulk=all-yuran" if float(reminder.get("amount") or 0) > 0 else "/payment-center"
        try:
            await db.notifications.insert_one(
                {
                    "user_id": user_id,
                    "title": "Peringatan Bayaran Yuran",
                    "message": _build_payment_reminder_message(reminder),
                    "type": "warning",
                    "category": "fees",
                    "action_url": action_url,
                    "action_label": "Bayar Sekarang",
                    "metadata": {
                        "reminder_id": str(reminder_id),
                        "item_id": reminder.get("item_id"),
                        "student_id": reminder.get("student_id"),
                    },
                    "is_read": False,
                    "created_at": now_iso,
                }
            )
            push_result = await _send_web_push_to_user(
                db,
                user_id=user_id,
                title="Peringatan Bayaran Yuran",
                body=_build_payment_reminder_message(reminder),
                url=action_url,
                priority="high",
                metadata={
                    "reminder_id": str(reminder_id),
                    "item_id": reminder.get("item_id"),
                    "student_id": reminder.get("student_id"),
                },
            )
            push_sent_count += int(push_result.get("sent") or 0)
            push_failed_count += int(push_result.get("failed") or 0)
            push_skipped_count += int(push_result.get("skipped") or 0)
            await db[REMINDER_COLLECTION].update_one(
                {"_id": reminder_id},
                {
                    "$set": {
                        "status": "sent",
                        "sent_at": now_iso,
                        "updated_at": now_iso,
                        "last_error": "",
                        "next_retry_at": "",
                        "retry_exhausted": False,
                    }
                },
            )
            sent_count += 1
            if status_before == "failed":
                recovered_count += 1
        except Exception as exc:
            failed_count += 1
            retry_count_next = retry_count_before + 1
            exhausted = retry_count_next >= REMINDER_MAX_RETRY_ATTEMPTS
            next_retry_at = ""
            if not exhausted:
                backoff_mins = _compute_retry_backoff_minutes(retry_count_next)
                next_retry_at = (now + timedelta(minutes=backoff_mins)).isoformat()
            else:
                exhausted_count += 1
            try:
                await db[REMINDER_COLLECTION].update_one(
                    {"_id": reminder_id},
                    {
                        "$set": {
                            "status": "failed",
                            "last_error": str(exc),
                            "updated_at": now_iso,
                            "retry_count": retry_count_next,
                            "next_retry_at": next_retry_at,
                            "retry_exhausted": exhausted,
                            "max_retries": REMINDER_MAX_RETRY_ATTEMPTS,
                            "final_failed_at": now_iso if exhausted else "",
                        }
                    },
                )
            except Exception:
                pass

    return {
        "checked": len(reminders),
        "sent": sent_count,
        "failed": failed_count,
        "retried": retried_count,
        "recovered": recovered_count,
        "exhausted": exhausted_count,
        "push_sent": push_sent_count,
        "push_failed": push_failed_count,
        "push_skipped": push_skipped_count,
        "now": now_iso,
        "max_retries": REMINDER_MAX_RETRY_ATTEMPTS,
    }


# ============ PYDANTIC MODELS ============

class CartItem(BaseModel):
    item_type: str  # yuran, koperasi, bus, infaq
    item_id: str
    name: str
    description: Optional[str] = None
    amount: float
    quantity: int = 1
    metadata: Optional[Dict[str, Any]] = None  # Extra info (student_name, size, etc.)


class AddToCartRequest(BaseModel):
    item_type: str  # yuran, koperasi, bus, infaq
    item_id: str
    quantity: int = 1
    metadata: Optional[Dict[str, Any]] = None


class AddKoperasiKitRequest(BaseModel):
    kit_id: str
    student_id: str
    size_selections: Optional[List[Dict[str, str]]] = None  # [{"product_id": "...", "size": "M"}]


class CartResponse(BaseModel):
    items: List[Dict[str, Any]]
    total_amount: float
    item_count: int


class CheckoutRequest(BaseModel):
    payment_method: str = "fpx_mock"


class PaymentReceiptResponse(BaseModel):
    receipt_id: str
    receipt_number: str
    total_amount: float
    payment_method: str
    payment_date: str
    status: str
    items: List[Dict[str, Any]]
    payer_name: str
    payer_email: str


class CreatePaymentReminderRequest(BaseModel):
    item_id: str
    student_id: Optional[str] = None
    student_name: Optional[str] = ""
    set_name: Optional[str] = ""
    amount: float = Field(0, ge=0)
    due_date: Optional[str] = ""
    remind_at: str
    days_before: int = Field(0, ge=0, le=30)
    source: str = "manual"


class UpdateReminderPreferencesRequest(BaseModel):
    default_days_before: int = Field(DEFAULT_REMINDER_DAYS_BEFORE, ge=0, le=30)
    default_time: str = DEFAULT_REMINDER_TIME
    default_source: str = DEFAULT_REMINDER_SOURCE


# ============ HELPER FUNCTIONS ============

def _allocate_payment_to_yuran_items(items: list, amount: float, paid_date: str = None) -> list:
    """Peruntukkan jumlah bayaran ke senarai item yuran mengikut keutamaan (untuk laporan detail)."""
    if paid_date is None:
        paid_date = datetime.now(timezone.utc).isoformat()
    remaining = float(amount)
    for it in items:
        if remaining <= 0:
            break
        item_amount = float(it.get("amount", 0))
        item_paid = float(it.get("paid_amount", 0))
        balance = item_amount - item_paid
        if balance <= 0:
            continue
        to_apply = min(remaining, balance)
        it["paid_amount"] = item_paid + to_apply
        if it["paid_amount"] >= item_amount:
            it["paid"] = True
            it["paid_date"] = paid_date
        remaining -= to_apply
    return items


async def get_user_cart(db, user_id: str) -> Dict:
    """Get or create user's cart from MongoDB"""
    doc = await db[CART_COLLECTION].find_one({"user_id": user_id})
    if doc:
        return {"items": doc.get("items", []), "created_at": doc.get("created_at", "")}
    return {"items": [], "created_at": datetime.now(timezone.utc).isoformat()}


async def save_user_cart(db, user_id: str, cart: Dict):
    """Persist cart to MongoDB"""
    await db[CART_COLLECTION].update_one(
        {"user_id": user_id},
        {"$set": {"items": cart["items"], "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )


async def clear_user_cart_db(db, user_id: str):
    """Clear user's cart in MongoDB"""
    await db[CART_COLLECTION].delete_one({"user_id": user_id})


def generate_receipt_number():
    """Generate unique receipt number"""
    now = datetime.now(timezone.utc)
    return f"MRSMKU-{now.strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}"


def generate_payment_reference(item_type: str = "PAY", item_id: str = "") -> str:
    """Generate unique reference for each payment entry."""
    now = datetime.now(timezone.utc)
    type_part = str(item_type or "PAY").replace("_", "").upper()[:4] or "PAY"
    item_part = str(item_id or "").replace("-", "").upper()[-4:] or uuid.uuid4().hex[:4].upper()
    return f"PAY-{type_part}-{now.strftime('%Y%m%d%H%M%S')}-{item_part}"


async def _get_or_create_category_by_name(db, name: str, type_income: str = "income"):
    """Find accounting category by name (regex), or create default. Returns category_id."""
    cat = await db.accounting_categories.find_one({"name": {"$regex": name, "$options": "i"}, "type": type_income})
    if cat:
        return cat["_id"]
    res = await db.accounting_categories.insert_one({
        "name": name,
        "type": type_income,
        "description": f"Pendapatan dari {name}",
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
    })
    return res.inserted_id


async def _generate_accounting_tx_number(db):
    prefix = f"TRX-{datetime.now(timezone.utc).year}-"
    latest = await db.accounting_transactions.find_one(
        {"transaction_number": {"$regex": f"^{prefix}"}},
        sort=[("transaction_number", -1)]
    )
    last_num = int(latest["transaction_number"].split("-")[-1]) + 1 if (latest and latest.get("transaction_number")) else 1
    return f"{prefix}{last_num:04d}"


async def _create_accounting_tx_from_payment(db, current_user: dict, item: dict, receipt_number: str, module: str, description: str):
    """Create one accounting transaction per payment item; laporan perakaunan mengikut modul. Yuran = detail."""
    try:
        amount = item.get("amount", 0) * item.get("quantity", 1)
        if amount <= 0:
            return
        if module == "yuran":
            cat = await db.accounting_categories.find_one({"name": {"$regex": "Yuran|yuran", "$options": "i"}, "type": "income"})
            if not cat:
                cat_id = await _get_or_create_category_by_name(db, "Yuran Pelajar")
            else:
                cat_id = cat["_id"]
        elif module == "koperasi":
            cat_id = await _get_or_create_category_by_name(db, "Koperasi")
        elif module == "bus":
            cat_id = await _get_or_create_category_by_name(db, "Pengangkutan Bas")
        elif module == "tabung":
            cat_id = await _get_or_create_category_by_name(db, "Derma & Sumbangan")
        else:
            cat_id = await _get_or_create_category_by_name(db, "Pusat Bayaran")
        tx_number = await _generate_accounting_tx_number(db)
        now = datetime.now(timezone.utc)
        doc = {
            "transaction_number": tx_number,
            "type": "income",
            "category_id": str(cat_id) if cat_id else None,
            "amount": amount,
            "transaction_date": now.strftime("%Y-%m-%d"),
            "description": description,
            "reference_number": receipt_number,
            "source": "system",
            "source_ref": {"module": module, "receipt_from": "payment_center"},
            "status": "verified",
            "notes": f"Auto dari Pusat Bayaran - modul {module}",
            "created_at": now,
            "created_by": current_user.get("_id"),
            "created_by_name": current_user.get("full_name", "Sistem"),
        }
        result = await db.accounting_transactions.insert_one(doc)
        await _invalidate_financial_dashboard_cache_safely(db, scope="accounting")
        tx_id = str(result.inserted_id)
        doc["_id"] = result.inserted_id
        try:
            from services.accounting_journal import create_journal_for_transaction
            await create_journal_for_transaction(db, tx_id, doc)
        except Exception as ej:
            print(f"[payment_center] journal create error: {ej}")
    except Exception as e:
        print(f"[payment_center] accounting sync error: {e}")


# ============ CART ROUTES ============

@router.get("/reminder-preferences")
async def get_payment_reminder_preferences(current_user: dict = Depends(get_current_user)):
    db = get_db()
    doc = await db[REMINDER_PREFERENCE_COLLECTION].find_one({"user_id": current_user.get("_id")})
    return _normalize_reminder_preferences(doc)


@router.put("/reminder-preferences")
async def update_payment_reminder_preferences(
    request: UpdateReminderPreferencesRequest,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    user_id = current_user.get("_id")
    now_iso = datetime.now(timezone.utc).isoformat()

    reminder_time = str(request.default_time or "").strip()
    if not _is_valid_time_hhmm(reminder_time):
        raise HTTPException(status_code=400, detail="Format masa tidak sah. Gunakan HH:MM (24 jam).")

    source = str(request.default_source or DEFAULT_REMINDER_SOURCE).strip().lower()
    if source not in REMINDER_PREFERENCE_ALLOWED_SOURCES:
        raise HTTPException(status_code=400, detail="Sumber reminder tidak sah.")

    payload = {
        "default_days_before": int(request.default_days_before),
        "default_time": reminder_time,
        "default_source": source,
        "updated_at": now_iso,
    }

    existing = await db[REMINDER_PREFERENCE_COLLECTION].find_one({"user_id": user_id})
    if existing:
        await db[REMINDER_PREFERENCE_COLLECTION].update_one(
            {"_id": existing.get("_id")},
            {"$set": payload},
        )
        saved_doc = {**existing, **payload}
    else:
        insert_payload = {
            "user_id": user_id,
            "created_at": now_iso,
            **payload,
        }
        await db[REMINDER_PREFERENCE_COLLECTION].insert_one(insert_payload)
        saved_doc = insert_payload

    await log_audit(
        current_user,
        "UPDATE_PAYMENT_REMINDER_PREFERENCES",
        "payment_center",
        f"Peringatan default: {payload['default_days_before']} hari, {payload['default_time']}, {payload['default_source']}",
    )
    return {
        "message": "Tetapan peringatan dikemaskini.",
        "preferences": _normalize_reminder_preferences(saved_doc),
    }

@router.post("/reminders")
async def create_payment_reminder(
    request: CreatePaymentReminderRequest,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    now = datetime.now(timezone.utc)
    remind_at = _parse_iso_datetime(request.remind_at)
    if remind_at is None:
        raise HTTPException(status_code=400, detail="Tarikh peringatan tidak sah")

    # If user picks an old time accidentally, nudge to near-future so reminder still useful.
    if remind_at < now - timedelta(minutes=1):
        remind_at = now + timedelta(minutes=5)

    source = (request.source or "manual").strip().lower()
    if source not in REMINDER_ALLOWED_SOURCES:
        source = "manual"

    due_date_parsed = _safe_parse_due_date(request.due_date)
    due_date_value = due_date_parsed.isoformat() if due_date_parsed else str(request.due_date or "")
    remind_at_iso = remind_at.astimezone(timezone.utc).isoformat()
    user_id = current_user.get("_id")

    existing = await db[REMINDER_COLLECTION].find_one(
        {
            "user_id": user_id,
            "item_id": request.item_id,
            "remind_at": remind_at_iso,
            "status": {"$in": ["scheduled", "sent"]},
        }
    )
    reminder_payload = {
        "student_id": request.student_id or "",
        "student_name": request.student_name or "",
        "set_name": request.set_name or "",
        "amount": float(request.amount or 0),
        "due_date": due_date_value,
        "days_before": int(request.days_before or 0),
        "source": source,
        "retry_count": 0,
        "next_retry_at": "",
        "retry_exhausted": False,
        "max_retries": REMINDER_MAX_RETRY_ATTEMPTS,
        "final_failed_at": "",
        "last_error": "",
        "updated_at": now.isoformat(),
    }

    if existing:
        await db[REMINDER_COLLECTION].update_one(
            {"_id": existing["_id"]},
            {"$set": reminder_payload},
        )
        return {
            "message": "Peringatan sedia ada dikemaskini.",
            "reminder_id": str(existing["_id"]),
            "status": existing.get("status", "scheduled"),
            "remind_at": remind_at_iso,
        }

    reminder_doc = {
        "user_id": user_id,
        "item_id": request.item_id,
        "status": "scheduled",
        "remind_at": remind_at_iso,
        "created_at": now.isoformat(),
        "sent_at": "",
        **reminder_payload,
    }
    result = await db[REMINDER_COLLECTION].insert_one(reminder_doc)
    await log_audit(
        current_user,
        "CREATE_PAYMENT_REMINDER",
        "payment_center",
        f"Peringatan dijadualkan pada {remind_at_iso}",
    )
    return {
        "message": "Peringatan berjaya dijadualkan.",
        "reminder_id": str(result.inserted_id),
        "status": "scheduled",
        "remind_at": remind_at_iso,
    }


@router.get("/reminders")
async def get_payment_reminders(
    status: Optional[str] = Query(None),
    limit: int = Query(30, ge=1, le=200),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    query = {"user_id": current_user.get("_id")}
    if status:
        query["status"] = status

    reminders = await db[REMINDER_COLLECTION].find(query).sort("remind_at", 1).skip(skip).limit(limit).to_list(limit)
    total = await db[REMINDER_COLLECTION].count_documents(query)

    return {
        "items": [
            {
                "id": str(item.get("_id")),
                "item_id": item.get("item_id", ""),
                "student_id": item.get("student_id", ""),
                "student_name": item.get("student_name", ""),
                "set_name": item.get("set_name", ""),
                "amount": float(item.get("amount") or 0),
                "due_date": str(item.get("due_date") or ""),
                "days_before": int(item.get("days_before") or 0),
                "status": item.get("status", "scheduled"),
                "source": item.get("source", "manual"),
                "retry_count": int(item.get("retry_count") or 0),
                "max_retries": int(item.get("max_retries") or REMINDER_MAX_RETRY_ATTEMPTS),
                "retry_exhausted": bool(item.get("retry_exhausted", False)),
                "next_retry_at": _serialize_datetime(item.get("next_retry_at")),
                "remind_at": _serialize_datetime(item.get("remind_at")),
                "sent_at": _serialize_datetime(item.get("sent_at")),
                "created_at": _serialize_datetime(item.get("created_at")),
                "updated_at": _serialize_datetime(item.get("updated_at")),
            }
            for item in reminders
        ],
        "total": total,
        "limit": limit,
        "skip": skip,
    }


@router.delete("/reminders/{reminder_id}")
async def cancel_payment_reminder(
    reminder_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    candidate_ids = [reminder_id]
    if ObjectId.is_valid(reminder_id):
        candidate_ids.insert(0, ObjectId(reminder_id))

    reminder = None
    for candidate_id in candidate_ids:
        reminder = await db[REMINDER_COLLECTION].find_one({"_id": candidate_id})
        if reminder:
            break
    if not reminder:
        raise HTTPException(status_code=404, detail="Peringatan tidak dijumpai")
    if str(reminder.get("user_id")) != str(current_user.get("_id")):
        raise HTTPException(status_code=403, detail="Akses ditolak")

    now_iso = datetime.now(timezone.utc).isoformat()
    await db[REMINDER_COLLECTION].update_one(
        {"_id": reminder.get("_id")},
        {"$set": {"status": "cancelled", "updated_at": now_iso, "cancelled_at": now_iso}},
    )
    return {"message": "Peringatan dibatalkan."}


@router.post("/reminders/process-due")
async def process_due_payment_reminders_endpoint(
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
):
    allowed_roles = {"superadmin", "admin", "bendahari", "sub_bendahari"}
    if current_user.get("role") not in allowed_roles:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    db = get_db()
    result = await process_due_payment_reminders(db, limit=limit)
    return {"message": "Pemprosesan peringatan selesai.", **result}

@router.get("/cart", response_model=CartResponse)
async def get_cart(current_user: dict = Depends(get_current_user)):
    """Get current user's cart (central troli from DB)"""
    db = get_db()
    user_id = str(current_user["_id"])
    cart = await get_user_cart(db, user_id)
    total = sum(item["amount"] * item.get("quantity", 1) for item in cart["items"])
    return CartResponse(items=cart["items"], total_amount=total, item_count=len(cart["items"]))


@router.post("/cart/add")
async def add_to_cart(request: AddToCartRequest, current_user: dict = Depends(get_current_user)):
    """Add item to cart (central troli)"""
    db = get_db()
    user_id = str(current_user["_id"])
    cart = await get_user_cart(db, user_id)
    
    # Validate and fetch item details based on type
    item_details = None
    
    if request.item_type == "yuran":
        # Fetch from student_yuran
        yuran = await db.student_yuran.find_one({"_id": ObjectId(request.item_id)})
        if not yuran:
            raise HTTPException(status_code=404, detail="Yuran tidak dijumpai")
        
        remaining = yuran.get("total_amount", 0) - yuran.get("paid_amount", 0)
        if remaining <= 0:
            raise HTTPException(status_code=400, detail="Yuran sudah dibayar sepenuhnya")
        
        item_details = {
            "item_type": "yuran",
            "item_id": request.item_id,
            "name": yuran.get("yuran_name", "Yuran Sekolah"),
            "description": f"{yuran.get('student_name', '')} - Tingkatan {yuran.get('tingkatan', '')}",
            "amount": remaining,
            "quantity": 1,
            "metadata": {
                "student_name": yuran.get("student_name", ""),
                "student_id": str(yuran.get("student_id", "")),
                "tingkatan": yuran.get("tingkatan", 0),
                "original_amount": yuran.get("total_amount", 0),
                "paid_amount": yuran.get("paid_amount", 0)
            }
        }
        
    elif request.item_type == "koperasi":
        # Fetch from koperasi products
        product = await db.koperasi_products.find_one({"_id": ObjectId(request.item_id)})
        if not product:
            raise HTTPException(status_code=404, detail="Produk tidak dijumpai")
        
        if product.get("stock", 0) < request.quantity:
            raise HTTPException(status_code=400, detail="Stok tidak mencukupi")
        
        item_details = {
            "item_type": "koperasi",
            "item_id": request.item_id,
            "name": product.get("name", "Produk Koperasi"),
            "description": product.get("description", ""),
            "amount": product.get("price", 0),
            "quantity": request.quantity,
            "metadata": {
                "image_url": product.get("image_url", ""),
                "category": product.get("category", ""),
                "size": request.metadata.get("size") if request.metadata else None
            }
        }
        
    elif request.item_type == "bus":
        # Fetch from bus trips/bookings
        trip = await db.bus_trips.find_one({"_id": ObjectId(request.item_id)})
        if not trip:
            raise HTTPException(status_code=404, detail="Trip tidak dijumpai")
        
        if trip.get("available_seats", 0) < request.quantity:
            raise HTTPException(status_code=400, detail="Tempat duduk tidak mencukupi")
        
        item_details = {
            "item_type": "bus",
            "item_id": request.item_id,
            "name": f"Tiket Bas - {trip.get('route_name', 'Unknown')}",
            "description": f"Tarikh: {trip.get('departure_date', '')}",
            "amount": trip.get("price", 0),
            "quantity": request.quantity,
            "metadata": {
                "route_name": trip.get("route_name", ""),
                "departure_date": trip.get("departure_date", ""),
                "departure_time": trip.get("departure_time", ""),
                "student_id": request.metadata.get("student_id") if request.metadata else None
            }
        }
        
    elif request.item_type == "yuran_partial":
        # Partial yuran payment - selected items only
        yuran = await db.student_yuran.find_one({"_id": ObjectId(request.item_id)})
        if not yuran:
            raise HTTPException(status_code=404, detail="Yuran tidak dijumpai")
        
        selected_items = request.metadata.get("selected_items", []) if request.metadata else []
        if not selected_items:
            raise HTTPException(status_code=400, detail="Sila pilih sekurang-kurangnya satu item")
        
        # Calculate total for selected items
        total_amount = sum(item.get("amount", 0) for item in selected_items)
        
        item_names = [item.get("name", "") for item in selected_items]
        
        item_details = {
            "item_type": "yuran_partial",
            "item_id": request.item_id,
            "name": f"Bayaran Sebahagian Yuran - {yuran.get('set_yuran_nama', 'Yuran')}",
            "description": f"{yuran.get('student_name', '')} - Tingkatan {yuran.get('tingkatan', '')}",
            "amount": total_amount,
            "quantity": 1,
            "metadata": {
                "student_name": yuran.get("student_name", ""),
                "student_id": str(yuran.get("student_id", "")),
                "tingkatan": yuran.get("tingkatan", 0),
                "selected_items": selected_items,
                "item_names": item_names
            }
        }
        
    elif request.item_type == "infaq":
        # Fetch from tabung_campaigns first (Tabung & Sumbangan)
        campaign = await db.tabung_campaigns.find_one({"_id": ObjectId(request.item_id)})
        if not campaign:
            # Try infaq_campaigns
            campaign = await db.infaq_campaigns.find_one({"_id": ObjectId(request.item_id)})
        if not campaign:
            # Try donation_campaigns
            campaign = await db.donation_campaigns.find_one({"_id": ObjectId(request.item_id)})
        
        if not campaign:
            raise HTTPException(status_code=404, detail="Kempen tidak dijumpai")
        
        campaign_type = campaign.get("campaign_type", "amount")
        
        if campaign_type == "slot":
            # Slot-based campaign
            slots = request.metadata.get("slots", 1) if request.metadata else 1
            price_per_slot = campaign.get("price_per_slot", 0)
            amount = slots * price_per_slot
            
            item_details = {
                "item_type": "infaq",
                "item_id": request.item_id,
                "name": f"Infaq Slot - {campaign.get('title', 'Kempen')}",
                "description": f"{slots} slot @ RM{price_per_slot:.2f}",
                "amount": amount,
                "quantity": 1,
                "metadata": {
                    "campaign_title": campaign.get("title", ""),
                    "campaign_type": "slot",
                    "slots": slots,
                    "price_per_slot": price_per_slot,
                    "is_anonymous": request.metadata.get("is_anonymous", False) if request.metadata else False
                }
            }
        else:
            # Amount-based campaign
            amount = request.metadata.get("amount", 10) if request.metadata else 10
            
            item_details = {
                "item_type": "infaq",
                "item_id": request.item_id,
                "name": f"Infaq - {campaign.get('title', campaign.get('name', 'Kempen'))}",
                "description": campaign.get("description", ""),
                "amount": amount,
                "quantity": 1,
                "metadata": {
                    "campaign_title": campaign.get("title", campaign.get("name", "")),
                    "campaign_type": "amount",
                    "category": campaign.get("category", ""),
                    "is_anonymous": request.metadata.get("is_anonymous", False) if request.metadata else False
                }
            }
    else:
        raise HTTPException(status_code=400, detail="Jenis item tidak sah")
    
    # Check if item already in cart (for koperasi, bus - allow update quantity)
    existing_index = None
    for i, item in enumerate(cart["items"]):
        if item["item_id"] == request.item_id and item["item_type"] == request.item_type:
            existing_index = i
            break
    
    if existing_index is not None:
        if request.item_type in ["koperasi", "bus"]:
            cart["items"][existing_index]["quantity"] += request.quantity
        else:
            raise HTTPException(status_code=400, detail="Item sudah ada dalam troli")
    else:
        item_details["cart_item_id"] = str(uuid.uuid4())
        cart["items"].append(item_details)
    
    total = sum(item["amount"] * item.get("quantity", 1) for item in cart["items"])
    await save_user_cart(db, user_id, cart)
    return {
        "message": "Item ditambah ke troli",
        "cart": {"items": cart["items"], "total_amount": total, "item_count": len(cart["items"])}
    }


@router.delete("/cart/remove/{cart_item_id}")
async def remove_from_cart(cart_item_id: str, current_user: dict = Depends(get_current_user)):
    """Remove item from cart"""
    db = get_db()
    user_id = str(current_user["_id"])
    cart = await get_user_cart(db, user_id)
    original_count = len(cart["items"])
    cart["items"] = [item for item in cart["items"] if item.get("cart_item_id") != cart_item_id]
    if len(cart["items"]) == original_count:
        raise HTTPException(status_code=404, detail="Item tidak dijumpai dalam troli")
    total = sum(item["amount"] * item.get("quantity", 1) for item in cart["items"])
    await save_user_cart(db, user_id, cart)
    return {"message": "Item dibuang dari troli", "cart": {"items": cart["items"], "total_amount": total, "item_count": len(cart["items"])}}


@router.delete("/cart/clear")
async def clear_cart(current_user: dict = Depends(get_current_user)):
    """Clear all items from cart"""
    db = get_db()
    user_id = str(current_user["_id"])
    await clear_user_cart_db(db, user_id)
    return {"message": "Troli dikosongkan", "cart": {"items": [], "total_amount": 0, "item_count": 0}}


@router.put("/cart/update/{cart_item_id}")
async def update_cart_item(
    cart_item_id: str,
    quantity: int = Query(..., ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """Update item quantity in cart"""
    db = get_db()
    user_id = str(current_user["_id"])
    cart = await get_user_cart(db, user_id)
    found = False
    for item in cart["items"]:
        if item.get("cart_item_id") == cart_item_id:
            if item["item_type"] not in ["koperasi", "bus"]:
                raise HTTPException(status_code=400, detail="Jenis item ini tidak boleh dikemas kini kuantiti")
            item["quantity"] = quantity
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="Item tidak dijumpai dalam troli")
    total = sum(item["amount"] * item.get("quantity", 1) for item in cart["items"])
    await save_user_cart(db, user_id, cart)
    return {"message": "Kuantiti dikemas kini", "cart": {"items": cart["items"], "total_amount": total, "item_count": len(cart["items"])}}


# ============ CHECKOUT & PAYMENT ROUTES ============

@router.post("/checkout")
async def process_checkout(request: CheckoutRequest, current_user: dict = Depends(get_current_user)):
    """Process checkout - Mock payment gateway"""
    db = get_db()
    user_id = str(current_user["_id"])
    cart = await get_user_cart(db, user_id)
    if not cart["items"]:
        raise HTTPException(status_code=400, detail="Troli kosong")
    
    total_amount = sum(item["amount"] * item.get("quantity", 1) for item in cart["items"])
    receipt_number = generate_receipt_number()
    payment_date = datetime.now(timezone.utc)
    
    # Create payment record
    payment_record = {
        "receipt_number": receipt_number,
        "user_id": current_user["_id"],
        "payer_name": current_user.get("full_name", ""),
        "payer_email": current_user.get("email", ""),
        "total_amount": total_amount,
        "payment_method": request.payment_method,
        "status": "completed",
        "items": cart["items"],
        "created_at": payment_date.isoformat()
    }
    
    result = await db.payment_receipts.insert_one(payment_record)
    receipt_id = str(result.inserted_id)
    
    # Process each item type
    processed_items = []
    
    for item in cart["items"]:
        try:
            if item["item_type"] == "yuran":
                # Bayaran penuh - peruntukkan ke senarai item mengikut keutamaan (laporan detail)
                yuran = await db.student_yuran.find_one({"_id": ObjectId(item["item_id"])})
                if yuran:
                    payment_reference = generate_payment_reference(item.get("item_type"), item.get("item_id"))
                    new_paid = yuran.get("paid_amount", 0) + item["amount"]
                    new_status = "paid" if new_paid >= yuran.get("total_amount", 0) else "partial"
                    items_list = yuran.get("items", [])
                    if items_list:
                        _allocate_payment_to_yuran_items(items_list, item["amount"], payment_date.isoformat())
                    set_fields = {
                        "paid_amount": new_paid,
                        "status": new_status,
                        "updated_at": payment_date.isoformat()
                    }
                    if items_list:
                        set_fields["items"] = items_list
                    await db.student_yuran.update_one(
                        {"_id": ObjectId(item["item_id"])},
                        {
                            "$set": set_fields,
                            "$push": {
                                "payments": {
                                    "amount": item["amount"],
                                    "payment_method": request.payment_method,
                                    "receipt_number": receipt_number,
                                    "reference_number": payment_reference,
                                    "paid_at": payment_date.isoformat(),
                                    "paid_by": user_id,
                                    "paid_by_name": current_user.get("full_name", "")
                                }
                            }
                        }
                    )
                desc = f"Bayaran yuran {yuran.get('student_name', '')} - {yuran.get('set_yuran_nama', yuran.get('yuran_name', 'Yuran'))}"
                await _create_accounting_tx_from_payment(db, current_user, item, receipt_number, "yuran", desc)
            
            elif item["item_type"] == "yuran_partial":
                # Partial payment by selected items
                yuran = await db.student_yuran.find_one({"_id": ObjectId(item["item_id"])})
                if yuran:
                    payment_reference = generate_payment_reference(item.get("item_type"), item.get("item_id"))
                    new_paid = yuran.get("paid_amount", 0) + item["amount"]
                    new_status = "paid" if new_paid >= yuran.get("total_amount", 0) else "partial"
                    
                    # Update individual items
                    items = yuran.get("items", [])
                    item_codes = item.get("metadata", {}).get("item_codes", [])
                    
                    for idx, yuran_item in enumerate(items):
                        if yuran_item.get("code") in item_codes:
                            items[idx]["paid"] = True
                            items[idx]["paid_amount"] = yuran_item.get("amount", 0)
                            items[idx]["paid_date"] = payment_date.isoformat()
                    
                    await db.student_yuran.update_one(
                        {"_id": ObjectId(item["item_id"])},
                        {
                            "$set": {
                                "paid_amount": new_paid,
                                "status": new_status,
                                "items": items,
                                "updated_at": payment_date.isoformat()
                            },
                            "$push": {
                                "payments": {
                                    "amount": item["amount"],
                                    "payment_method": request.payment_method,
                                    "receipt_number": receipt_number,
                                    "reference_number": payment_reference,
                                    "payment_type": "partial",
                                    "item_codes": item_codes,
                                    "paid_at": payment_date.isoformat(),
                                    "paid_by": user_id,
                                    "paid_by_name": current_user.get("full_name", "")
                                }
                            }
                        }
                    )
                yuran = await db.student_yuran.find_one({"_id": ObjectId(item["item_id"])})
                desc = (
                    f"Bayaran Sebahagian Yuran {yuran.get('student_name', '')} - {yuran.get('set_yuran_nama', 'Yuran')}"
                    if yuran
                    else "Bayaran Sebahagian Yuran"
                )
                await _create_accounting_tx_from_payment(db, current_user, item, receipt_number, "yuran", desc)
            
            elif item["item_type"] in ("yuran_installment", "yuran_two_payment"):
                policy_checkout = await _get_yuran_payment_policy(db)
                yuran = await db.student_yuran.find_one({"_id": ObjectId(item["item_id"])})
                if yuran:
                    payment_reference = generate_payment_reference(item.get("item_type"), item.get("item_id"))
                    new_paid = yuran.get("paid_amount", 0) + item["amount"]
                    new_status = "paid" if new_paid >= yuran.get("total_amount", 0) else "partial"
                    two_plan = yuran.get("two_payment_plan") or {}
                    new_payments_made = two_plan.get("payments_made", 0) + 1
                    payment_number = item.get("metadata", {}).get("payment_number", new_payments_made)
                    new_two_plan = {
                        "max_payments": policy_checkout["max_payments"],
                        "payments_made": new_payments_made,
                        "deadline_month": policy_checkout["deadline_month"],
                        "last_payment_at": payment_date.isoformat()
                    }
                    if not two_plan.get("started_at"):
                        new_two_plan["started_at"] = payment_date.isoformat()
                    items_list = yuran.get("items", [])
                    if items_list:
                        _allocate_payment_to_yuran_items(items_list, item["amount"], payment_date.isoformat())
                    set_fields = {
                        "paid_amount": new_paid,
                        "status": new_status,
                        "two_payment_plan": new_two_plan,
                        "updated_at": payment_date.isoformat()
                    }
                    if items_list:
                        set_fields["items"] = items_list
                    await db.student_yuran.update_one(
                        {"_id": ObjectId(item["item_id"])},
                        {
                            "$set": set_fields,
                            "$push": {
                                "payments": {
                                    "amount": item["amount"],
                                    "payment_method": request.payment_method,
                                    "receipt_number": receipt_number,
                                    "reference_number": payment_reference,
                                    "payment_type": "two_payments",
                                    "payment_number": payment_number,
                                    "max_payments": policy_checkout["max_payments"],
                                    "paid_at": payment_date.isoformat(),
                                    "paid_by": user_id,
                                    "paid_by_name": current_user.get("full_name", "")
                                }
                            }
                        }
                    )
                yuran = await db.student_yuran.find_one({"_id": ObjectId(item["item_id"])})
                desc = f"Bayaran ansuran yuran {yuran.get('student_name', '')} - {yuran.get('set_yuran_nama', 'Yuran')}" if yuran else "Bayaran ansuran yuran"
                await _create_accounting_tx_from_payment(db, current_user, item, receipt_number, "yuran", desc)
                    
            elif item["item_type"] == "koperasi":
                # Create koperasi order and update stock
                order_doc = {
                    "user_id": current_user["_id"],
                    "product_id": ObjectId(item["item_id"]),
                    "product_name": item["name"],
                    "quantity": item["quantity"],
                    "price": item["amount"],
                    "total": item["amount"] * item["quantity"],
                    "size": item["metadata"].get("size") if item.get("metadata") else None,
                    "status": "paid",
                    "receipt_number": receipt_number,
                    "created_at": payment_date.isoformat()
                }
                await db.koperasi_orders.insert_one(order_doc)
                
                # Update stock: per-size (sizes_stock) or total
                product = await db.koperasi_products.find_one({"_id": ObjectId(item["item_id"])})
                size = (item.get("metadata") or {}).get("size")
                if product and product.get("has_sizes") and size:
                    await db.koperasi_products.update_one(
                        {"_id": ObjectId(item["item_id"])},
                        {"$inc": {"sizes_stock.$[elem].stock": -item["quantity"]}},
                        array_filters=[{"elem.size": size}]
                    )
                else:
                    inc = {"stock": -item["quantity"]}
                    if product and "total_stock" in product:
                        inc["total_stock"] = -item["quantity"]
                    await db.koperasi_products.update_one(
                        {"_id": ObjectId(item["item_id"])},
                        {"$inc": inc}
                    )
                await _create_accounting_tx_from_payment(db, current_user, item, receipt_number, "koperasi", f"Jualan koperasi - {item.get('name', '')}")
                
            elif item["item_type"] == "bus":
                # Create bus booking
                booking_doc = {
                    "user_id": current_user["_id"],
                    "trip_id": ObjectId(item["item_id"]),
                    "passengers": item["quantity"],
                    "total_price": item["amount"] * item["quantity"],
                    "status": "confirmed",
                    "receipt_number": receipt_number,
                    "student_id": ObjectId(item["metadata"]["student_id"]) if item.get("metadata", {}).get("student_id") else None,
                    "created_at": payment_date.isoformat()
                }
                await db.bus_bookings.insert_one(booking_doc)
                
                # Update available seats
                await db.bus_trips.update_one(
                    {"_id": ObjectId(item["item_id"])},
                    {"$inc": {"available_seats": -item["quantity"]}}
                )
                await _create_accounting_tx_from_payment(db, current_user, item, receipt_number, "bus", f"Tiket bas - {item.get('name', '')}")
                
            elif item["item_type"] == "infaq":
                # Create donation record in tabung_donations (sync with Tabung & Sumbangan)
                campaign = await db.tabung_campaigns.find_one({"_id": ObjectId(item["item_id"])})
                campaign_type = campaign.get("campaign_type", "amount") if campaign else "amount"
                
                donation_doc = {
                    "campaign_id": ObjectId(item["item_id"]),
                    "campaign_title": item.get("name", "Kempen"),
                    "campaign_type": campaign_type,
                    "user_id": str(current_user["_id"]),
                    "donor_name": current_user.get("full_name", "") if not item.get("metadata", {}).get("is_anonymous") else "Anonim",
                    "donor_email": current_user.get("email", ""),
                    "is_anonymous": item.get("metadata", {}).get("is_anonymous", False),
                    "amount": item["amount"],
                    "payment_method": request.payment_method,
                    "payment_status": "completed",
                    "receipt_number": receipt_number,
                    "created_at": payment_date
                }
                
                # Add slots info if slot-based
                if item.get("metadata", {}).get("slots"):
                    donation_doc["slots"] = item["metadata"]["slots"]
                    donation_doc["price_per_slot"] = item["metadata"].get("price_per_slot", 0)
                
                await db.tabung_donations.insert_one(donation_doc)
                
                # Update tabung_campaigns
                if campaign_type == "slot":
                    slots = item.get("metadata", {}).get("slots", 1)
                    await db.tabung_campaigns.update_one(
                        {"_id": ObjectId(item["item_id"])},
                        {
                            "$inc": {"slots_sold": slots, "donor_count": 1},
                            "$set": {"updated_at": payment_date}
                        }
                    )
                else:
                    await db.tabung_campaigns.update_one(
                        {"_id": ObjectId(item["item_id"])},
                        {
                            "$inc": {"collected_amount": item["amount"], "donor_count": 1},
                            "$set": {"updated_at": payment_date}
                        }
                    )
                await _invalidate_financial_dashboard_cache_safely(db, scope="donation")
                await _create_accounting_tx_from_payment(db, current_user, item, receipt_number, "tabung", f"Sumbangan - {item.get('name', 'Kempen')}")
            
            processed_items.append({
                "item_id": item["item_id"],
                "item_type": item["item_type"],
                "status": "success"
            })
            
        except Exception as e:
            processed_items.append({
                "item_id": item["item_id"],
                "item_type": item["item_type"],
                "status": "error",
                "error": str(e)
            })
    
    # Create notification
    await db.notifications.insert_one({
        "user_id": current_user["_id"],
        "title": "Pembayaran Berjaya",
        "message": f"Pembayaran RM{total_amount:.2f} berjaya. No. Resit: {receipt_number}",
        "type": "success",
        "is_read": False,
        "created_at": payment_date.isoformat()
    })
    
    # Clear cart after successful checkout
    await clear_user_cart_db(db, user_id)
    # Log audit
    await log_audit(current_user, "CHECKOUT", "payment_center", f"Pembayaran RM{total_amount:.2f}, Resit: {receipt_number}")
    
    return {
        "success": True,
        "message": "Pembayaran berjaya!",
        "receipt": {
            "receipt_id": receipt_id,
            "receipt_number": receipt_number,
            "total_amount": total_amount,
            "payment_method": request.payment_method,
            "payment_date": payment_date.isoformat(),
            "status": "completed",
            "items": cart["items"],
            "payer_name": current_user.get("full_name", ""),
            "payer_email": current_user.get("email", "")
        },
        "processed_items": processed_items
    }


# ============ RECEIPT ROUTES ============

@router.get("/receipts")
async def get_user_receipts(
    limit: int = Query(20, ge=1, le=100),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user)
):
    """Get user's payment receipts"""
    db = get_db()
    
    query = {"user_id": current_user["_id"]}
    
    receipts = await db.payment_receipts.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.payment_receipts.count_documents(query)
    
    # Serialize receipts
    result = []
    for r in receipts:
        # Include items info for filtering on frontend
        items = r.get("items", [])
        result.append({
            "receipt_id": str(r["_id"]),
            "receipt_number": r.get("receipt_number", ""),
            "total_amount": r.get("total_amount", 0),
            "payment_method": r.get("payment_method", ""),
            "payment_date": r.get("created_at", ""),
            "status": r.get("status", ""),
            "item_count": len(items),
            "items": items  # Include full items for filtering and display
        })
    
    return {
        "receipts": result,
        "total": total,
        "limit": limit,
        "skip": skip
    }


@router.get("/receipts/{receipt_id}")
async def get_receipt_detail(receipt_id: str, current_user: dict = Depends(get_current_user)):
    """Get detailed receipt information"""
    db = get_db()
    
    try:
        receipt = await db.payment_receipts.find_one({"_id": ObjectId(receipt_id)})
    except:
        raise HTTPException(status_code=400, detail="ID resit tidak sah")
    
    if not receipt:
        raise HTTPException(status_code=404, detail="Resit tidak dijumpai")
    
    # Check access - only owner or admin can view
    if str(receipt["user_id"]) != str(current_user["_id"]) and current_user["role"] not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    return {
        "receipt_id": str(receipt["_id"]),
        "receipt_number": receipt.get("receipt_number", ""),
        "total_amount": receipt.get("total_amount", 0),
        "payment_method": receipt.get("payment_method", ""),
        "payment_date": receipt.get("created_at", ""),
        "status": receipt.get("status", ""),
        "items": receipt.get("items", []),
        "payer_name": receipt.get("payer_name", ""),
        "payer_email": receipt.get("payer_email", ""),
        "organization": {
            "name": "MUAFAKAT MRSMKU",
            "address": "MRSM Kubang Pasu, 06000 Jitra, Kedah",
            "phone": "04-917 5000"
        }
    }


@router.get("/receipts/{receipt_id}/pdf")
async def download_receipt_pdf(receipt_id: str, current_user: dict = Depends(get_current_user)):
    """Download receipt as PDF"""
    db = get_db()
    
    try:
        receipt = await db.payment_receipts.find_one({"_id": ObjectId(receipt_id)})
    except:
        raise HTTPException(status_code=400, detail="ID resit tidak sah")
    
    if not receipt:
        raise HTTPException(status_code=404, detail="Resit tidak dijumpai")
    
    # Check access
    if str(receipt["user_id"]) != str(current_user["_id"]) and current_user["role"] not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.units import mm
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_CENTER, TA_RIGHT
        
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=20*mm, rightMargin=20*mm, topMargin=20*mm, bottomMargin=20*mm)
        
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=18, alignment=TA_CENTER, spaceAfter=10)
        subtitle_style = ParagraphStyle('Subtitle', parent=styles['Normal'], fontSize=10, alignment=TA_CENTER, textColor=colors.grey)
        header_style = ParagraphStyle('Header', parent=styles['Heading2'], fontSize=12, spaceAfter=5)
        normal_style = styles['Normal']
        
        elements = []
        
        # Header
        elements.append(Paragraph("MUAFAKAT MRSMKU", title_style))
        elements.append(Paragraph("MRSM Kubang Pasu, 06000 Jitra, Kedah", subtitle_style))
        elements.append(Paragraph("Tel: 04-917 5000", subtitle_style))
        elements.append(Spacer(1, 15*mm))
        
        # Receipt Title
        elements.append(Paragraph("RESIT PEMBAYARAN", ParagraphStyle('ReceiptTitle', parent=styles['Heading1'], fontSize=16, alignment=TA_CENTER, textColor=colors.HexColor('#1e3a5f'))))
        elements.append(Spacer(1, 10*mm))
        
        # Receipt Info
        info_data = [
            ["No. Resit:", receipt.get("receipt_number", "")],
            ["Tarikh:", receipt.get("created_at", "")[:10] if receipt.get("created_at") else ""],
            ["Nama Pembayar:", receipt.get("payer_name", "")],
            ["Email:", receipt.get("payer_email", "")],
            ["Kaedah Bayaran:", receipt.get("payment_method", "").upper()],
        ]
        
        info_table = Table(info_data, colWidths=[40*mm, 120*mm])
        info_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        elements.append(info_table)
        elements.append(Spacer(1, 10*mm))
        
        # Items Table
        elements.append(Paragraph("Butiran Pembayaran:", header_style))
        
        items_header = ["Bil", "Perkara", "Kuantiti", "Jumlah (RM)"]
        items_data = [items_header]
        
        for i, item in enumerate(receipt.get("items", []), 1):
            qty = item.get("quantity", 1)
            amount = item.get("amount", 0) * qty
            items_data.append([
                str(i),
                f"{item.get('name', '')}\n{item.get('description', '')}",
                str(qty),
                f"{amount:.2f}"
            ])
        
        # Add total row
        items_data.append(["", "", "JUMLAH:", f"RM {receipt.get('total_amount', 0):.2f}"])
        
        items_table = Table(items_data, colWidths=[15*mm, 95*mm, 25*mm, 35*mm])
        items_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTNAME', (0, 1), (-1, -2), 'Helvetica'),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ALIGN', (0, 0), (0, -1), 'CENTER'),
            ('ALIGN', (2, 0), (2, -1), 'CENTER'),
            ('ALIGN', (3, 0), (3, -1), 'RIGHT'),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a5f')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#f0f9ff')),
            ('GRID', (0, 0), (-1, -2), 0.5, colors.grey),
            ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#1e3a5f')),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        elements.append(items_table)
        elements.append(Spacer(1, 15*mm))
        
        # Footer
        footer_style = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8, alignment=TA_CENTER, textColor=colors.grey)
        elements.append(Paragraph("Ini adalah resit yang dijana secara automatik.", footer_style))
        elements.append(Paragraph("Sila simpan resit ini untuk rujukan.", footer_style))
        elements.append(Spacer(1, 5*mm))
        elements.append(Paragraph("*** SIMULASI - Pembayaran sebenar tidak diproses ***", ParagraphStyle('SimNote', parent=styles['Normal'], fontSize=9, alignment=TA_CENTER, textColor=colors.HexColor('#dc2626'))))
        
        doc.build(elements)
        buffer.seek(0)
        
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=resit_{receipt.get('receipt_number', 'unknown')}.pdf"
            }
        )
        
    except ImportError:
        raise HTTPException(status_code=500, detail="PDF library not available")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menjana PDF: {str(e)}")


# ============ PENDING ITEMS ROUTES ============

@router.get("/pending-items")
async def get_pending_items(current_user: dict = Depends(get_current_user)):
    """Get all pending items that can be paid"""
    db = get_db()
    user_id = str(current_user["_id"])
    
    pending_items = {
        "yuran": [],
        "yuran_detailed": [],  # Detailed breakdown by items
        "two_payments": [],  # Yuran dengan pilihan 2 bayaran (sebelum bulan 10)
        "koperasi": [],
        "bus": [],
        "infaq": []  # From tabung_campaigns
    }
    
    # 1. Get pending yuran for parent's children with DETAILED items
    if current_user["role"] == "parent":
        policy = await _get_yuran_payment_policy(db)
        max_payments = policy["max_payments"]
        deadline_month = policy["deadline_month"]
        
        children = await db.students.find({"parent_id": current_user["_id"]}).to_list(100)
        child_ids = [c["_id"] for c in children]
        child_map = {str(c["_id"]): c for c in children}
        
        yuran_list = await db.student_yuran.find({
            "student_id": {"$in": child_ids}
        }).to_list(1000)
        
        for yuran in yuran_list:
            remaining = yuran.get("total_amount", 0) - yuran.get("paid_amount", 0)
            student_id = str(yuran.get("student_id", ""))
            child = child_map.get(student_id, {})
            due_meta = _build_due_date_meta(yuran.get("due_date"))
            
            student_religion = yuran.get("religion", child.get("religion", "Islam"))
            is_muslim = student_religion == "Islam"
            
            current_month = datetime.now(timezone.utc).month
            two_plan = yuran.get("two_payment_plan") or {}
            payments_made = two_plan.get("payments_made", 0)
            if yuran.get("installment_plan") and payments_made == 0:
                payments_made = min(max_payments, yuran["installment_plan"].get("paid_installments", 0))
            within_deadline = current_month <= deadline_month
            has_two_payment = within_deadline and remaining > 0 and payments_made < max_payments
            
            # Determine status - include fully paid students
            status = yuran.get("status", "pending")
            if remaining <= 0:
                status = "paid"
            
            # Basic yuran info (summary view) - include ALL students
            yuran_entry = {
                "item_id": str(yuran["_id"]),
                "name": yuran.get("set_yuran_nama", yuran.get("yuran_name", "Yuran Sekolah")),
                "description": f"{yuran.get('student_name', '')} - Tingkatan {yuran.get('tingkatan', '')}",
                "amount": max(remaining, 0),  # Balance (0 if fully paid)
                "original_amount": yuran.get("total_amount", 0),
                "paid_amount": yuran.get("paid_amount", 0),
                "student_name": yuran.get("student_name", ""),
                "student_id": student_id,
                "tingkatan": yuran.get("tingkatan", 0),
                "tahun": yuran.get("tahun", 0),
                "status": status,
                "has_two_payment": has_two_payment,
                "student_religion": student_religion,
                "due_date": due_meta["due_date"],
                "days_to_due": due_meta["days_to_due"],
                "is_overdue": due_meta["is_overdue"],
            }
            pending_items["yuran"].append(yuran_entry)
            
            # Only add detailed view for non-fully-paid students
            if remaining > 0:
                
                # Get ALL items from set_yuran (including items not applicable to this student)
                # to show parents the complete fee structure
                set_yuran_id = yuran.get("set_yuran_id")
                all_set_yuran_items = []
                
                if set_yuran_id:
                    set_yuran_doc = await db.set_yuran.find_one({"_id": set_yuran_id})
                    if set_yuran_doc:
                        # Flatten all items from set_yuran with islam_only and bukan_islam_only flags
                        for cat in set_yuran_doc.get("categories", []):
                            for sub in cat.get("sub_categories", []):
                                for item in sub.get("items", []):
                                    all_set_yuran_items.append({
                                        "code": item.get("code", ""),
                                        "name": item.get("name", ""),
                                        "category": cat.get("name", ""),
                                        "sub_category": sub.get("name", ""),
                                        "amount": item.get("amount", 0),
                                        "islam_only": item.get("islam_only", False),
                                        "bukan_islam_only": item.get("bukan_islam_only", False)
                                    })
                
                # Build item map from set_yuran for islam_only lookup
                set_yuran_item_map = {item["code"]: item for item in all_set_yuran_items}
                
                # Detailed breakdown by items (for checkboxes)
                items = yuran.get("items", [])
                all_items = []  # Show ALL items, not just unpaid
                unpaid_items = []
                
                # First, add all items that the student already has (assigned based on their religion)
                assigned_codes = set()
                for item in items:
                    item_paid = item.get("paid", False)
                    item_amount = item.get("amount", 0)
                    item_paid_amount = item.get("paid_amount", 0)
                    item_balance = item_amount - item_paid_amount
                    item_code = item.get("code", "")
                    assigned_codes.add(item_code)
                    
                    # Check if this item is islam_only or bukan_islam_only from set_yuran or item itself
                    set_item = set_yuran_item_map.get(item_code, {})
                    islam_only = item.get("islam_only", set_item.get("islam_only", False))
                    bukan_islam_only = item.get("bukan_islam_only", item.get("non_muslim_only", set_item.get("bukan_islam_only", set_item.get("non_muslim_only", False))))
                    
                    # Determine if this item is applicable based on religion
                    applicable = True
                    status = "paid" if item_balance <= 0 else ("partial" if item_paid_amount > 0 else "pending")
                    
                    # For Muslim student, bukan_islam_only items are not applicable
                    if is_muslim and bukan_islam_only:
                        applicable = False
                        status = "not_applicable"
                    # For non-Muslim student, islam_only items are not applicable
                    elif not is_muslim and islam_only:
                        applicable = False
                        status = "not_applicable"
                    
                    item_data = {
                        "code": item_code,
                        "name": item.get("name", ""),
                        "category": item.get("category", ""),
                        "sub_category": item.get("sub_category", ""),
                        "amount": item_amount,
                        "paid_amount": item_paid_amount if applicable else 0,
                        "balance": max(0, item_balance) if applicable else 0,
                        "paid": (item_paid or item_balance <= 0) if applicable else False,
                        "mandatory": item.get("mandatory", True),
                        "status": status,
                        "islam_only": islam_only,
                        "bukan_islam_only": bukan_islam_only,
                        "non_muslim_only": bukan_islam_only,
                        "applicable": applicable
                    }
                    all_items.append(item_data)
                    
                    if item_balance > 0 and applicable:
                        unpaid_items.append(item_data)
                
                # Now add items that are NOT assigned to this student (not applicable based on religion)
                # These will be shown but disabled
                for set_item in all_set_yuran_items:
                    if set_item["code"] not in assigned_codes:
                        # This item was not assigned - check why (religion mismatch)
                        islam_only = set_item.get("islam_only", False)
                        bukan_islam_only = set_item.get("bukan_islam_only", False)
                        
                        # Determine if this item is applicable based on religion
                        # - islam_only items are only for Muslims
                        # - bukan_islam_only items are only for non-Muslims
                        applicable = False
                        if is_muslim:
                            # Muslim student - islam_only is applicable, bukan_islam_only is NOT
                            if bukan_islam_only:
                                applicable = False
                            elif islam_only:
                                applicable = True  # This should have been assigned but wasn't
                        else:
                            # Non-Muslim student - bukan_islam_only is applicable, islam_only is NOT
                            if islam_only:
                                applicable = False
                            elif bukan_islam_only:
                                applicable = True  # This should have been assigned but wasn't
                        
                        item_data = {
                            "code": set_item["code"],
                            "name": set_item["name"],
                            "category": set_item["category"],
                            "sub_category": set_item["sub_category"],
                            "amount": set_item["amount"],
                            "paid_amount": 0,
                            "balance": 0,  # Not applicable, so no balance
                            "paid": False,
                            "mandatory": True,
                            "status": "not_applicable",  # New status for items not applicable
                            "islam_only": islam_only,
                            "bukan_islam_only": bukan_islam_only,
                            "applicable": False  # This item is NOT applicable to this student
                        }
                        all_items.append(item_data)
                
                # Always add yuran_detailed if there are items (show complete picture)
                if all_items:
                    pending_items["yuran_detailed"].append({
                        "yuran_id": str(yuran["_id"]),
                        "student_name": yuran.get("student_name", ""),
                        "student_id": student_id,
                        "tingkatan": yuran.get("tingkatan", 0),
                        "tahun": yuran.get("tahun", 0),
                        "set_name": yuran.get("set_yuran_nama", ""),
                        "total_amount": yuran.get("total_amount", 0),
                        "paid_amount": yuran.get("paid_amount", 0),
                        "balance": remaining,
                        "items": all_items,  # ALL items including not applicable
                        "unpaid_items": unpaid_items,  # Only unpaid AND applicable for selection
                        "has_two_payment": has_two_payment,
                        "student_religion": student_religion,
                        "due_date": due_meta["due_date"],
                        "days_to_due": due_meta["days_to_due"],
                        "is_overdue": due_meta["is_overdue"],
                    })
                
                if has_two_payment:
                    total_amount_y = yuran.get("total_amount", 0)
                    installment_amt = round(total_amount_y / max_payments, 2) if max_payments else 0
                    next_payment_num = payments_made + 1
                    if next_payment_num < max_payments:
                        next_amount = min(remaining, installment_amt) if installment_amt > 0 else remaining
                    else:
                        next_amount = remaining
                    next_amount = round(max(0, next_amount), 2)
                    
                    pending_items["two_payments"].append({
                        "yuran_id": str(yuran["_id"]),
                        "student_name": yuran.get("student_name", ""),
                        "student_id": student_id,
                        "tingkatan": yuran.get("tingkatan", 0),
                        "tahun": yuran.get("tahun", 0),
                        "set_name": yuran.get("set_yuran_nama", ""),
                        "total_amount": total_amount_y,
                        "paid_amount": yuran.get("paid_amount", 0),
                        "balance": remaining,
                        "due_date": due_meta["due_date"],
                        "days_to_due": due_meta["days_to_due"],
                        "is_overdue": due_meta["is_overdue"],
                        "two_payment_plan": {
                            "max_payments": max_payments,
                            "payments_made": payments_made,
                            "deadline_month": deadline_month,
                            "next_payment_number": next_payment_num,
                            "next_payment_amount": next_amount,
                            "started_at": two_plan.get("started_at", "")
                        }
                    })
    
    # 2. Get active campaigns from tabung_campaigns (Tabung & Sumbangan)
    tabung_campaigns = await db.tabung_campaigns.find({
        "status": "active"
    }).sort("created_at", -1).limit(20).to_list(20)
    
    for campaign in tabung_campaigns:
        campaign_type = campaign.get("campaign_type", "amount")
        
        # Calculate progress based on type
        if campaign_type == "slot":
            total_slots = campaign.get("total_slots", 0)
            slots_sold = campaign.get("slots_sold", 0)
            slots_available = total_slots - slots_sold
            collected_amount = slots_sold * campaign.get("price_per_slot", 0)
            progress_percent = (slots_sold / total_slots * 100) if total_slots > 0 else 0
            
            pending_items["infaq"].append({
                "item_id": str(campaign["_id"]),
                "name": campaign.get("title", "Kempen"),
                "description": campaign.get("description", ""),
                "campaign_type": "slot",
                "total_slots": total_slots,
                "slots_sold": slots_sold,
                "slots_available": slots_available,
                "price_per_slot": campaign.get("price_per_slot", 0),
                "min_slots": campaign.get("min_slots", 1),
                "max_slots": campaign.get("max_slots", 100),
                "collected_amount": collected_amount,
                "progress_percent": progress_percent,
                "is_featured": campaign.get("is_featured", False),
                "image_url": campaign.get("image_url", "")
            })
        else:
            target_amount = campaign.get("target_amount", 0)
            collected_amount = campaign.get("collected_amount", 0)
            progress_percent = (collected_amount / target_amount * 100) if target_amount > 0 else 0
            
            pending_items["infaq"].append({
                "item_id": str(campaign["_id"]),
                "name": campaign.get("title", "Kempen"),
                "description": campaign.get("description", ""),
                "campaign_type": "amount",
                "target_amount": target_amount,
                "collected_amount": collected_amount,
                "progress_percent": progress_percent,
                "min_amount": campaign.get("min_amount", 1),
                "max_amount": campaign.get("max_amount", 10000),
                "suggested_amounts": [10, 20, 50, 100],
                "is_featured": campaign.get("is_featured", False),
                "image_url": campaign.get("image_url", "")
            })
    
    # 3. Get upcoming bus trips
    bus_trips = await db.bus_trips.find({
        "status": "active",
        "available_seats": {"$gt": 0}
    }).sort("departure_date", 1).limit(10).to_list(10)
    
    for trip in bus_trips:
        pending_items["bus"].append({
            "item_id": str(trip["_id"]),
            "name": f"Tiket Bas - {trip.get('route_name', '')}",
            "description": f"Tarikh: {trip.get('departure_date', '')} {trip.get('departure_time', '')}",
            "amount": trip.get("price", 0),
            "available_seats": trip.get("available_seats", 0),
            "departure_date": trip.get("departure_date", ""),
            "departure_time": trip.get("departure_time", "")
        })
    
    # 4. Get koperasi products (optional browsing)
    products = await db.koperasi_products.find({
        "status": "active",
        "stock": {"$gt": 0}
    }).sort("created_at", -1).limit(20).to_list(20)
    
    for product in products:
        pending_items["koperasi"].append({
            "item_id": str(product["_id"]),
            "name": product.get("name", ""),
            "description": product.get("description", ""),
            "amount": product.get("price", 0),
            "stock": product.get("stock", 0),
            "category": product.get("category", ""),
            "image_url": product.get("image_url", "")
        })
    
    return pending_items


class AddItemsRequest(BaseModel):
    yuran_id: str
    item_codes: List[str]


@router.post("/cart/add-items")
async def add_multiple_items_to_cart(
    request: AddItemsRequest,
    current_user: dict = Depends(get_current_user)
):
    """Add specific yuran items to cart (for partial payment by item)"""
    db = get_db()
    user_id = str(current_user["_id"])
    cart = await get_user_cart(db, user_id)
    
    # Get the yuran record
    yuran = await db.student_yuran.find_one({"_id": ObjectId(request.yuran_id)})
    if not yuran:
        raise HTTPException(status_code=404, detail="Yuran tidak dijumpai")
    
    items = yuran.get("items", [])
    total_selected = 0
    selected_items = []
    
    for item in items:
        if item.get("code") in request.item_codes:
            item_balance = item.get("amount", 0) - item.get("paid_amount", 0)
            if item_balance > 0:
                total_selected += item_balance
                selected_items.append({
                    "code": item.get("code"),
                    "name": item.get("name"),
                    "amount": item_balance
                })
    
    if total_selected <= 0:
        raise HTTPException(status_code=400, detail="Tiada item yang perlu dibayar")
    
    # Create a custom cart item for selected yuran items
    item_details = {
        "item_type": "yuran_partial",
        "item_id": request.yuran_id,
        "name": f"{yuran.get('student_name', '')} - Bayaran Sebahagian Yuran",
        "description": "",  # Will be shown as list in frontend
        "amount": total_selected,
        "quantity": 1,
        "cart_item_id": str(uuid.uuid4()),
        "metadata": {
            "student_name": yuran.get("student_name", ""),
            "student_id": str(yuran.get("student_id", "")),
            "tingkatan": yuran.get("tingkatan", 0),
            "set_name": yuran.get("set_yuran_nama", ""),
            "selected_items": selected_items,
            "item_codes": request.item_codes
        }
    }
    
    # Check if already in cart
    existing = next((i for i in cart["items"] if i["item_id"] == request.yuran_id and i["item_type"] == "yuran_partial"), None)
    if existing:
        raise HTTPException(status_code=400, detail="Item Bayaran Sebahagian Yuran sudah ada dalam troli")
    
    cart["items"].append(item_details)
    total = sum(item["amount"] * item.get("quantity", 1) for item in cart["items"])
    await save_user_cart(db, user_id, cart)
    return {"message": f"{len(selected_items)} item yuran ditambah ke troli", "cart": {"items": cart["items"], "total_amount": total, "item_count": len(cart["items"])}}


class AddTwoPaymentRequest(BaseModel):
    yuran_id: str


@router.post("/cart/add-two-payment")
async def add_two_payment_to_cart(
    request: AddTwoPaymentRequest,
    current_user: dict = Depends(get_current_user)
):
    """Tambah bayaran ansuran (sebelum bulan 10) ke troli - bilangan mengikut tetapan bendahari"""
    db = get_db()
    policy = await _get_yuran_payment_policy(db)
    max_payments = policy["max_payments"]
    deadline_month = policy["deadline_month"]
    
    user_id = str(current_user["_id"])
    cart = await get_user_cart(db, user_id)
    yuran = await db.student_yuran.find_one({"_id": ObjectId(request.yuran_id)})
    if not yuran:
        raise HTTPException(status_code=404, detail="Yuran tidak dijumpai")
    
    current_month = datetime.now(timezone.utc).month
    if current_month > deadline_month:
        raise HTTPException(status_code=400, detail=f"Bayaran ansuran hanya dibenarkan sebelum bulan {deadline_month + 1}")
    
    remaining = yuran.get("total_amount", 0) - yuran.get("paid_amount", 0)
    if remaining <= 0:
        raise HTTPException(status_code=400, detail="Yuran ini telah diselesaikan")
    
    two_plan = yuran.get("two_payment_plan") or {}
    payments_made = two_plan.get("payments_made", 0)
    if yuran.get("installment_plan") and payments_made == 0:
        payments_made = min(max_payments, yuran["installment_plan"].get("paid_installments", 0))
    if payments_made >= max_payments:
        raise HTTPException(status_code=400, detail=f"Anda telah menggunakan {max_payments} kali bayaran untuk yuran ini")
    
    next_payment_num = payments_made + 1
    total_amount_y = yuran.get("total_amount", 0)
    installment_amt = round(total_amount_y / max_payments, 2) if max_payments else 0
    if next_payment_num < max_payments:
        next_amount = min(remaining, installment_amt) if installment_amt > 0 else remaining
    else:
        next_amount = remaining
    next_amount = round(max(0, next_amount), 2)
    
    item_details = {
        "item_type": "yuran_two_payment",
        "item_id": request.yuran_id,
        "name": f"Bayaran {next_payment_num}/{max_payments} - {yuran.get('set_yuran_nama', 'Yuran')}",
        "description": f"{yuran.get('student_name', '')} - Tingkatan {yuran.get('tingkatan', '')}",
        "amount": next_amount,
        "quantity": 1,
        "cart_item_id": str(uuid.uuid4()),
        "metadata": {
            "student_name": yuran.get("student_name", ""),
            "student_id": str(yuran.get("student_id", "")),
            "tingkatan": yuran.get("tingkatan", 0),
            "payment_number": next_payment_num,
            "max_payments": max_payments
        }
    }
    
    existing = next((i for i in cart["items"] if i["item_id"] == request.yuran_id and i["item_type"] == "yuran_two_payment"), None)
    if existing:
        raise HTTPException(status_code=400, detail="Bayaran ansuran untuk yuran ini sudah ada dalam troli")
    
    cart["items"].append(item_details)
    total = sum(item["amount"] * item.get("quantity", 1) for item in cart["items"])
    await save_user_cart(db, user_id, cart)
    return {"message": f"Bayaran {next_payment_num}/{max_payments} ditambah ke troli", "cart": {"items": cart["items"], "total_amount": total, "item_count": len(cart["items"])}}


class UpdateCartItemRequest(BaseModel):
    quantity: int = Field(..., ge=1, le=100, description="Kuantiti item")


@router.patch("/cart/update/{cart_item_id}")
async def update_cart_item_quantity(
    cart_item_id: str,
    request: UpdateCartItemRequest,
    current_user: dict = Depends(get_current_user)
):
    """Kemaskini kuantiti item dalam troli"""
    db = get_db()
    user_id = str(current_user["_id"])
    cart = await get_user_cart(db, user_id)
    item = next((i for i in cart["items"] if i["cart_item_id"] == cart_item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Item tidak dijumpai dalam troli")
    item["quantity"] = request.quantity
    total = sum(i["amount"] * i.get("quantity", 1) for i in cart["items"])
    await save_user_cart(db, user_id, cart)
    return {"message": "Kuantiti dikemaskini", "cart": {"items": cart["items"], "total_amount": total, "item_count": len(cart["items"])}}


# ---------- Central troli: add koperasi kit (same as koperasi module but into payment_center cart) ----------
@router.post("/cart/add-koperasi-kit")
async def add_koperasi_kit_to_central_cart(
    kit_id: str,
    student_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Add entire koperasi kit to central troli. Returns requires_size_selection if any product needs size."""
    if current_user.get("role") != "parent":
        raise HTTPException(status_code=403, detail="Hanya ibu bapa boleh akses")
    db = get_db()
    user_id = str(current_user["_id"])
    student = await db.students.find_one({
        "_id": ObjectId(student_id),
        "$or": [{"parent_id": current_user["_id"]}, {"parent_id": ObjectId(str(current_user["_id"]))}]
    })
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    kit = await db.koop_kits.find_one({"_id": ObjectId(kit_id), "is_active": True})
    if not kit:
        raise HTTPException(status_code=404, detail="Kit tidak dijumpai")
    products = await db.koop_products.find({"kit_id": str(kit_id), "is_active": True}).to_list(100)
    if not products:
        raise HTTPException(status_code=400, detail="Kit tidak mempunyai produk")
    products_with_sizes = [p for p in products if p.get("has_sizes")]
    if products_with_sizes:
        return {
            "requires_size_selection": True,
            "message": "Sila pilih saiz untuk barangan",
            "products_requiring_sizes": [
                {"id": str(p["_id"]), "name": p.get("name", ""), "size_type": p.get("size_type", "clothing"), "sizes_stock": p.get("sizes_stock", [])}
                for p in products_with_sizes
            ]
        }
    cart = await get_user_cart(db, user_id)
    kit_name = kit.get("name", "Kit")
    for product in products:
        pid = str(product["_id"])
        price = product.get("price", 0)
        existing = next((i for i in cart["items"] if i.get("item_type") == "koperasi" and i.get("item_id") == pid and (i.get("metadata") or {}).get("size") is None), None)
        if existing:
            existing["quantity"] = existing.get("quantity", 1) + 1
        else:
            cart["items"].append({
                "cart_item_id": str(uuid.uuid4()),
                "item_type": "koperasi",
                "item_id": pid,
                "name": product.get("name", "Produk Koperasi"),
                "description": product.get("description", ""),
                "amount": price,
                "quantity": 1,
                "metadata": {
                    "product_id": pid,
                    "size": None,
                    "student_id": student_id,
                    "kit_id": kit_id,
                    "kit_name": kit_name,
                    "image_url": product.get("image_url"),
                    "category": product.get("category", "")
                }
            })
    total = sum(i["amount"] * i.get("quantity", 1) for i in cart["items"])
    await save_user_cart(db, user_id, cart)
    return {"message": f"Kit '{kit_name}' ditambah ke troli", "items_added": len(products), "cart": {"items": cart["items"], "total_amount": total, "item_count": len(cart["items"])}}


@router.post("/cart/add-koperasi-kit-with-sizes")
async def add_koperasi_kit_with_sizes_to_central_cart(
    request: AddKoperasiKitRequest,
    current_user: dict = Depends(get_current_user)
):
    """Add koperasi kit with size selections to central troli."""
    if current_user.get("role") != "parent":
        raise HTTPException(status_code=403, detail="Hanya ibu bapa boleh akses")
    db = get_db()
    user_id = str(current_user["_id"])
    student = await db.students.find_one({
        "_id": ObjectId(request.student_id),
        "$or": [{"parent_id": current_user["_id"]}, {"parent_id": ObjectId(str(current_user["_id"]))}]
    })
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    kit = await db.koop_kits.find_one({"_id": ObjectId(request.kit_id), "is_active": True})
    if not kit:
        raise HTTPException(status_code=404, detail="Kit tidak dijumpai")
    products = await db.koop_products.find({"kit_id": request.kit_id, "is_active": True}).to_list(100)
    if not products:
        raise HTTPException(status_code=400, detail="Kit tidak mempunyai produk")
    size_map = {}
    if request.size_selections:
        for sel in request.size_selections:
            if isinstance(sel, dict) and sel.get("product_id"):
                size_map[sel["product_id"]] = sel.get("size")
    for product in products:
        if product.get("has_sizes"):
            sid = str(product["_id"])
            sz = size_map.get(sid)
            if not sz:
                raise HTTPException(status_code=400, detail=f"Sila pilih saiz untuk '{product.get('name', '')}'")
            st = next((s for s in product.get("sizes_stock", []) if s.get("size") == sz), None)
            if not st or (st.get("stock") or 0) < 1:
                raise HTTPException(status_code=400, detail=f"Stok saiz {sz} tidak mencukupi untuk '{product.get('name', '')}'")
        else:
            if (product.get("total_stock") or 0) < 1:
                raise HTTPException(status_code=400, detail=f"Stok tidak mencukupi untuk '{product.get('name', '')}'")
    cart = await get_user_cart(db, user_id)
    kit_name = kit.get("name", "Kit")
    for product in products:
        pid = str(product["_id"])
        size = size_map.get(pid) if product.get("has_sizes") else None
        price = product.get("price", 0)
        existing = next((i for i in cart["items"] if i.get("item_type") == "koperasi" and i.get("item_id") == pid and (i.get("metadata") or {}).get("size") == size), None)
        if existing:
            existing["quantity"] = existing.get("quantity", 1) + 1
        else:
            cart["items"].append({
                "cart_item_id": str(uuid.uuid4()),
                "item_type": "koperasi",
                "item_id": pid,
                "name": product.get("name", "Produk Koperasi"),
                "description": product.get("description", ""),
                "amount": price,
                "quantity": 1,
                "metadata": {
                    "product_id": pid,
                    "size": size,
                    "student_id": request.student_id,
                    "kit_id": request.kit_id,
                    "kit_name": kit_name,
                    "image_url": product.get("image_url"),
                    "category": product.get("category", "")
                }
            })
    total = sum(i["amount"] * i.get("quantity", 1) for i in cart["items"])
    await save_user_cart(db, user_id, cart)
    return {"message": f"Kit '{kit_name}' ditambah ke troli", "items_added": len(products), "cart": {"items": cart["items"], "total_amount": total, "item_count": len(cart["items"])}}


