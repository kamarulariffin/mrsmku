from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from models_sql import (
    AnnouncementRecord,
    BusBookingRecord,
    BusCompanyRecord,
    BusLiveLocationRecord,
    BusRouteRecord,
    BusRecord,
    BusTripRecord,
    EmailLogRecord,
    EmailTemplateRecord,
    NotificationRecord,
    PaymentCenterCartRecord,
    PaymentReceiptRecord,
    PaymentReminderPreferenceRecord,
    PaymentReminderRecord,
    PushLogRecord,
    PushSubscriptionRecord,
)
from models_sql.core_documents import CoreDocument
from repositories.core_store import (
    CoreStore,
    DeleteResult,
    InsertOneResult,
    UpdateResult,
    _apply_update_ops,
    _matches_query,
    _normalize_for_storage,
    _to_comparable,
)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _is_object_id_str(value: str) -> bool:
    try:
        ObjectId(value)
        return True
    except Exception:
        return False


def _restore_id(value: Any) -> Any:
    if isinstance(value, str) and _is_object_id_str(value):
        return ObjectId(value)
    return value


def _as_datetime(value: Any, default_now: bool = False) -> Optional[datetime]:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    if isinstance(value, str):
        raw = value.strip()
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(raw)
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=timezone.utc)
            return parsed
        except ValueError:
            return _now_utc() if default_now else None
    if default_now:
        return _now_utc()
    return None


_NOTIFICATION_KNOWN_FIELDS = {
    "_id",
    "user_id",
    "type",
    "title",
    "message",
    "category",
    "priority",
    "is_read",
    "read_at",
    "action_url",
    "action_label",
    "metadata",
    "sender_id",
    "sender_name",
    "sender_role",
    "created_at",
}


def _notification_doc_to_row_values(normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
    extra_data = {
        k: v for k, v in normalized_doc.items() if k not in _NOTIFICATION_KNOWN_FIELDS
    }
    raw_id = normalized_doc.get("_id")
    doc_id = str(raw_id) if raw_id is not None else str(ObjectId())

    user_id = normalized_doc.get("user_id")
    sender_id = normalized_doc.get("sender_id")

    return {
        "id": doc_id,
        "user_id": str(user_id) if user_id is not None else None,
        "type": (
            str(normalized_doc.get("type"))
            if normalized_doc.get("type") is not None
            else None
        ),
        "title": str(normalized_doc.get("title") or ""),
        "message": (
            str(normalized_doc.get("message"))
            if normalized_doc.get("message") is not None
            else None
        ),
        "category": (
            str(normalized_doc.get("category"))
            if normalized_doc.get("category") is not None
            else None
        ),
        "priority": (
            str(normalized_doc.get("priority"))
            if normalized_doc.get("priority") is not None
            else None
        ),
        "is_read": bool(normalized_doc.get("is_read", False)),
        "read_at": _as_datetime(normalized_doc.get("read_at")),
        "action_url": (
            str(normalized_doc.get("action_url"))
            if normalized_doc.get("action_url") is not None
            else None
        ),
        "action_label": (
            str(normalized_doc.get("action_label"))
            if normalized_doc.get("action_label") is not None
            else None
        ),
        "metadata_json": normalized_doc.get("metadata") or {},
        "sender_id": str(sender_id) if sender_id is not None else None,
        "sender_name": (
            str(normalized_doc.get("sender_name"))
            if normalized_doc.get("sender_name") is not None
            else None
        ),
        "sender_role": (
            str(normalized_doc.get("sender_role"))
            if normalized_doc.get("sender_role") is not None
            else None
        ),
        "created_at": _as_datetime(normalized_doc.get("created_at"), default_now=True),
        "extra_data": extra_data,
    }


_ANNOUNCEMENT_KNOWN_FIELDS = {
    "_id",
    "title",
    "content",
    "priority",
    "tingkatan",
    "kelas",
    "status",
    "send_push",
    "send_email",
    "sent_count",
    "created_by",
    "created_by_name",
    "created_at",
    "published_at",
}


def _announcement_doc_to_row_values(normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
    extra_data = {
        k: v for k, v in normalized_doc.items() if k not in _ANNOUNCEMENT_KNOWN_FIELDS
    }
    raw_id = normalized_doc.get("_id")
    doc_id = str(raw_id) if raw_id is not None else str(ObjectId())

    created_by = normalized_doc.get("created_by")

    return {
        "id": doc_id,
        "title": str(normalized_doc.get("title") or ""),
        "content": (
            str(normalized_doc.get("content"))
            if normalized_doc.get("content") is not None
            else None
        ),
        "priority": (
            str(normalized_doc.get("priority"))
            if normalized_doc.get("priority") is not None
            else None
        ),
        "tingkatan": (
            str(normalized_doc.get("tingkatan"))
            if normalized_doc.get("tingkatan") is not None
            else None
        ),
        "kelas": (
            str(normalized_doc.get("kelas"))
            if normalized_doc.get("kelas") is not None
            else None
        ),
        "status": (
            str(normalized_doc.get("status"))
            if normalized_doc.get("status") is not None
            else None
        ),
        "send_push": bool(normalized_doc.get("send_push", True)),
        "send_email": bool(normalized_doc.get("send_email", True)),
        "sent_count": int(normalized_doc.get("sent_count") or 0),
        "created_by": str(created_by) if created_by is not None else None,
        "created_by_name": (
            str(normalized_doc.get("created_by_name"))
            if normalized_doc.get("created_by_name") is not None
            else None
        ),
        "created_at": _as_datetime(normalized_doc.get("created_at"), default_now=True),
        "published_at": _as_datetime(normalized_doc.get("published_at")),
        "extra_data": extra_data,
    }


_PUSH_SUBSCRIPTION_KNOWN_FIELDS = {
    "_id",
    "user_id",
    "endpoint",
    "keys",
    "device_info",
    "is_active",
    "created_at",
    "updated_at",
}


def _push_subscription_doc_to_row_values(normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
    extra_data = {
        k: v for k, v in normalized_doc.items() if k not in _PUSH_SUBSCRIPTION_KNOWN_FIELDS
    }
    raw_id = normalized_doc.get("_id")
    doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
    user_id = normalized_doc.get("user_id")
    keys = normalized_doc.get("keys")
    if not isinstance(keys, dict):
        keys = {}

    return {
        "id": doc_id,
        "user_id": str(user_id) if user_id is not None else None,
        "endpoint": str(normalized_doc.get("endpoint") or ""),
        "keys_json": keys,
        "device_info": (
            str(normalized_doc.get("device_info"))
            if normalized_doc.get("device_info") is not None
            else None
        ),
        "is_active": bool(normalized_doc.get("is_active", True)),
        "created_at": _as_datetime(normalized_doc.get("created_at"), default_now=True),
        "updated_at": _as_datetime(normalized_doc.get("updated_at"), default_now=True),
        "extra_data": extra_data,
    }


_PUSH_LOG_KNOWN_FIELDS = {
    "_id",
    "subscription_id",
    "user_id",
    "title",
    "body",
    "url",
    "status",
    "reason",
    "status_code",
    "error",
    "created_at",
}


def _push_log_doc_to_row_values(normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
    extra_data = {
        k: v for k, v in normalized_doc.items() if k not in _PUSH_LOG_KNOWN_FIELDS
    }
    raw_id = normalized_doc.get("_id")
    doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
    subscription_id = normalized_doc.get("subscription_id")
    user_id = normalized_doc.get("user_id")
    status_code = normalized_doc.get("status_code")
    try:
        parsed_status_code = int(status_code) if status_code is not None else None
    except Exception:
        parsed_status_code = None

    return {
        "id": doc_id,
        "subscription_id": str(subscription_id) if subscription_id is not None else None,
        "user_id": str(user_id) if user_id is not None else None,
        "title": (
            str(normalized_doc.get("title"))
            if normalized_doc.get("title") is not None
            else None
        ),
        "body": (
            str(normalized_doc.get("body"))
            if normalized_doc.get("body") is not None
            else None
        ),
        "url": (
            str(normalized_doc.get("url"))
            if normalized_doc.get("url") is not None
            else None
        ),
        "status": (
            str(normalized_doc.get("status"))
            if normalized_doc.get("status") is not None
            else None
        ),
        "reason": (
            str(normalized_doc.get("reason"))
            if normalized_doc.get("reason") is not None
            else None
        ),
        "status_code": parsed_status_code,
        "error": (
            str(normalized_doc.get("error"))
            if normalized_doc.get("error") is not None
            else None
        ),
        "created_at": _as_datetime(normalized_doc.get("created_at"), default_now=True),
        "extra_data": extra_data,
    }


_EMAIL_LOG_KNOWN_FIELDS = {
    "_id",
    "user_id",
    "recipient",
    "email",
    "type",
    "subject",
    "template",
    "status",
    "email_id",
    "sent_by",
    "sent_at",
    "error",
    "metadata",
    "data",
    "created_at",
}


def _email_log_doc_to_row_values(normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
    extra_data = {
        k: v for k, v in normalized_doc.items() if k not in _EMAIL_LOG_KNOWN_FIELDS
    }
    raw_id = normalized_doc.get("_id")
    doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
    user_id = normalized_doc.get("user_id")
    sent_by = normalized_doc.get("sent_by")
    metadata_value = normalized_doc.get("metadata")
    if not isinstance(metadata_value, dict):
        metadata_value = {}
    data_value = normalized_doc.get("data")
    if not isinstance(data_value, dict):
        data_value = {}

    return {
        "id": doc_id,
        "user_id": str(user_id) if user_id is not None else None,
        "recipient": (
            str(normalized_doc.get("recipient"))
            if normalized_doc.get("recipient") is not None
            else None
        ),
        "email": (
            str(normalized_doc.get("email"))
            if normalized_doc.get("email") is not None
            else None
        ),
        "type": (
            str(normalized_doc.get("type"))
            if normalized_doc.get("type") is not None
            else None
        ),
        "subject": (
            str(normalized_doc.get("subject"))
            if normalized_doc.get("subject") is not None
            else None
        ),
        "template": (
            str(normalized_doc.get("template"))
            if normalized_doc.get("template") is not None
            else None
        ),
        "status": (
            str(normalized_doc.get("status"))
            if normalized_doc.get("status") is not None
            else None
        ),
        "email_id": (
            str(normalized_doc.get("email_id"))
            if normalized_doc.get("email_id") is not None
            else None
        ),
        "sent_by": str(sent_by) if sent_by is not None else None,
        "sent_at": _as_datetime(normalized_doc.get("sent_at")),
        "created_at": _as_datetime(normalized_doc.get("created_at"), default_now=True),
        "error": (
            str(normalized_doc.get("error"))
            if normalized_doc.get("error") is not None
            else None
        ),
        "metadata_json": metadata_value,
        "data_json": data_value,
        "extra_data": extra_data,
    }


_EMAIL_TEMPLATE_KNOWN_FIELDS = {
    "_id",
    "template_key",
    "name",
    "description",
    "subject",
    "body_html",
    "body_text",
    "variables",
    "is_active",
    "tingkatan",
    "created_at",
    "updated_at",
    "created_by",
}


def _email_template_doc_to_row_values(normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
    extra_data = {
        k: v for k, v in normalized_doc.items() if k not in _EMAIL_TEMPLATE_KNOWN_FIELDS
    }
    raw_id = normalized_doc.get("_id")
    doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
    created_by = normalized_doc.get("created_by")
    tingkatan_value = normalized_doc.get("tingkatan")
    try:
        parsed_tingkatan = int(tingkatan_value) if tingkatan_value is not None else None
    except Exception:
        parsed_tingkatan = None
    variables = normalized_doc.get("variables")
    if not isinstance(variables, list):
        variables = []

    return {
        "id": doc_id,
        "template_key": str(normalized_doc.get("template_key") or ""),
        "name": str(normalized_doc.get("name") or ""),
        "description": (
            str(normalized_doc.get("description"))
            if normalized_doc.get("description") is not None
            else None
        ),
        "subject": (
            str(normalized_doc.get("subject"))
            if normalized_doc.get("subject") is not None
            else None
        ),
        "body_html": (
            str(normalized_doc.get("body_html"))
            if normalized_doc.get("body_html") is not None
            else None
        ),
        "body_text": (
            str(normalized_doc.get("body_text"))
            if normalized_doc.get("body_text") is not None
            else None
        ),
        "variables_json": variables,
        "is_active": bool(normalized_doc.get("is_active", True)),
        "tingkatan": parsed_tingkatan,
        "created_at": _as_datetime(normalized_doc.get("created_at"), default_now=True),
        "updated_at": _as_datetime(normalized_doc.get("updated_at"), default_now=True),
        "created_by": str(created_by) if created_by is not None else None,
        "extra_data": extra_data,
    }


_PAYMENT_REMINDER_KNOWN_FIELDS = {
    "_id",
    "user_id",
    "item_id",
    "student_id",
    "student_name",
    "set_name",
    "amount",
    "due_date",
    "remind_at",
    "days_before",
    "source",
    "status",
    "sent_at",
    "retry_count",
    "next_retry_at",
    "retry_exhausted",
    "max_retries",
    "final_failed_at",
    "last_error",
    "created_at",
    "updated_at",
    "cancelled_at",
}


def _payment_reminder_doc_to_row_values(normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
    extra_data = {
        k: v for k, v in normalized_doc.items() if k not in _PAYMENT_REMINDER_KNOWN_FIELDS
    }
    raw_id = normalized_doc.get("_id")
    doc_id = str(raw_id) if raw_id is not None else str(ObjectId())

    amount_value = normalized_doc.get("amount")
    try:
        parsed_amount = float(amount_value) if amount_value is not None else 0.0
    except Exception:
        parsed_amount = 0.0

    days_before_value = normalized_doc.get("days_before")
    try:
        parsed_days_before = int(days_before_value) if days_before_value is not None else 0
    except Exception:
        parsed_days_before = 0

    retry_count_value = normalized_doc.get("retry_count")
    try:
        parsed_retry_count = int(retry_count_value) if retry_count_value is not None else 0
    except Exception:
        parsed_retry_count = 0

    max_retries_value = normalized_doc.get("max_retries")
    try:
        parsed_max_retries = int(max_retries_value) if max_retries_value is not None else 3
    except Exception:
        parsed_max_retries = 3

    user_id = normalized_doc.get("user_id")
    student_id = normalized_doc.get("student_id")

    return {
        "id": doc_id,
        "user_id": str(user_id) if user_id is not None else None,
        "item_id": (
            str(normalized_doc.get("item_id"))
            if normalized_doc.get("item_id") is not None
            else None
        ),
        "student_id": str(student_id) if student_id is not None else None,
        "student_name": (
            str(normalized_doc.get("student_name"))
            if normalized_doc.get("student_name") is not None
            else None
        ),
        "set_name": (
            str(normalized_doc.get("set_name"))
            if normalized_doc.get("set_name") is not None
            else None
        ),
        "amount": parsed_amount,
        "due_date": (
            str(normalized_doc.get("due_date"))
            if normalized_doc.get("due_date") is not None
            else None
        ),
        "remind_at": (
            str(normalized_doc.get("remind_at"))
            if normalized_doc.get("remind_at") is not None
            else None
        ),
        "days_before": parsed_days_before,
        "source": (
            str(normalized_doc.get("source"))
            if normalized_doc.get("source") is not None
            else None
        ),
        "status": (
            str(normalized_doc.get("status"))
            if normalized_doc.get("status") is not None
            else None
        ),
        "sent_at": (
            str(normalized_doc.get("sent_at"))
            if normalized_doc.get("sent_at") is not None
            else None
        ),
        "retry_count": parsed_retry_count,
        "next_retry_at": (
            str(normalized_doc.get("next_retry_at"))
            if normalized_doc.get("next_retry_at") is not None
            else None
        ),
        "retry_exhausted": bool(normalized_doc.get("retry_exhausted", False)),
        "max_retries": parsed_max_retries,
        "final_failed_at": (
            str(normalized_doc.get("final_failed_at"))
            if normalized_doc.get("final_failed_at") is not None
            else None
        ),
        "last_error": (
            str(normalized_doc.get("last_error"))
            if normalized_doc.get("last_error") is not None
            else None
        ),
        "created_at": (
            str(normalized_doc.get("created_at"))
            if normalized_doc.get("created_at") is not None
            else None
        ),
        "updated_at": (
            str(normalized_doc.get("updated_at"))
            if normalized_doc.get("updated_at") is not None
            else None
        ),
        "cancelled_at": (
            str(normalized_doc.get("cancelled_at"))
            if normalized_doc.get("cancelled_at") is not None
            else None
        ),
        "extra_data": extra_data,
    }


_PAYMENT_REMINDER_PREFERENCE_KNOWN_FIELDS = {
    "_id",
    "user_id",
    "default_days_before",
    "default_time",
    "default_source",
    "created_at",
    "updated_at",
}


def _payment_reminder_preference_doc_to_row_values(normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
    extra_data = {
        k: v
        for k, v in normalized_doc.items()
        if k not in _PAYMENT_REMINDER_PREFERENCE_KNOWN_FIELDS
    }
    raw_id = normalized_doc.get("_id")
    doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
    user_id = normalized_doc.get("user_id")
    user_id_value = str(user_id) if user_id is not None else ""

    days_before_value = normalized_doc.get("default_days_before")
    try:
        parsed_days_before = int(days_before_value) if days_before_value is not None else 3
    except Exception:
        parsed_days_before = 3

    return {
        "id": doc_id,
        "user_id": user_id_value,
        "default_days_before": parsed_days_before,
        "default_time": str(normalized_doc.get("default_time") or "09:00"),
        "default_source": str(normalized_doc.get("default_source") or "google_calendar"),
        "created_at": (
            str(normalized_doc.get("created_at"))
            if normalized_doc.get("created_at") is not None
            else None
        ),
        "updated_at": (
            str(normalized_doc.get("updated_at"))
            if normalized_doc.get("updated_at") is not None
            else None
        ),
        "extra_data": extra_data,
    }


_PAYMENT_CENTER_CART_KNOWN_FIELDS = {
    "_id",
    "user_id",
    "items",
    "created_at",
    "updated_at",
}


def _payment_center_cart_doc_to_row_values(normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
    extra_data = {
        k: v for k, v in normalized_doc.items() if k not in _PAYMENT_CENTER_CART_KNOWN_FIELDS
    }
    raw_id = normalized_doc.get("_id")
    doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
    user_id = normalized_doc.get("user_id")
    user_id_value = str(user_id) if user_id is not None else ""
    items_value = normalized_doc.get("items")
    if not isinstance(items_value, list):
        items_value = []

    return {
        "id": doc_id,
        "user_id": user_id_value,
        "items_json": items_value,
        "created_at": (
            str(normalized_doc.get("created_at"))
            if normalized_doc.get("created_at") is not None
            else None
        ),
        "updated_at": (
            str(normalized_doc.get("updated_at"))
            if normalized_doc.get("updated_at") is not None
            else None
        ),
        "extra_data": extra_data,
    }


_PAYMENT_RECEIPT_KNOWN_FIELDS = {
    "_id",
    "receipt_number",
    "user_id",
    "payer_name",
    "payer_email",
    "total_amount",
    "payment_method",
    "status",
    "items",
    "created_at",
}


def _payment_receipt_doc_to_row_values(normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
    extra_data = {
        k: v for k, v in normalized_doc.items() if k not in _PAYMENT_RECEIPT_KNOWN_FIELDS
    }
    raw_id = normalized_doc.get("_id")
    doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
    user_id = normalized_doc.get("user_id")
    user_id_value = str(user_id) if user_id is not None else None
    items_value = normalized_doc.get("items")
    if not isinstance(items_value, list):
        items_value = []

    total_amount_value = normalized_doc.get("total_amount")
    try:
        parsed_total_amount = (
            float(total_amount_value) if total_amount_value is not None else 0.0
        )
    except Exception:
        parsed_total_amount = 0.0

    return {
        "id": doc_id,
        "receipt_number": (
            str(normalized_doc.get("receipt_number"))
            if normalized_doc.get("receipt_number") is not None
            else None
        ),
        "user_id": user_id_value,
        "payer_name": (
            str(normalized_doc.get("payer_name"))
            if normalized_doc.get("payer_name") is not None
            else None
        ),
        "payer_email": (
            str(normalized_doc.get("payer_email"))
            if normalized_doc.get("payer_email") is not None
            else None
        ),
        "total_amount": parsed_total_amount,
        "payment_method": (
            str(normalized_doc.get("payment_method"))
            if normalized_doc.get("payment_method") is not None
            else None
        ),
        "status": (
            str(normalized_doc.get("status"))
            if normalized_doc.get("status") is not None
            else None
        ),
        "items_json": items_value,
        "created_at": (
            str(normalized_doc.get("created_at"))
            if normalized_doc.get("created_at") is not None
            else None
        ),
        "extra_data": extra_data,
    }


_BUS_BOOKING_KNOWN_FIELDS = {
    "_id",
    "booking_number",
    "trip_id",
    "student_id",
    "parent_id",
    "user_id",
    "drop_off_point",
    "drop_off_price",
    "seat_preference",
    "assigned_seat",
    "status",
    "payment_status",
    "pulang_bermalam_id",
    "pulang_bermalam_approved",
    "passengers",
    "total_price",
    "receipt_number",
    "created_at",
    "updated_at",
    "cancelled_at",
    "cancellation_reason",
    "notes",
}


def _bus_booking_doc_to_row_values(normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
    extra_data = {k: v for k, v in normalized_doc.items() if k not in _BUS_BOOKING_KNOWN_FIELDS}
    raw_id = normalized_doc.get("_id")
    doc_id = str(raw_id) if raw_id is not None else str(ObjectId())

    def _id_or_none(field_name: str) -> Optional[str]:
        raw_value = normalized_doc.get(field_name)
        return str(raw_value) if raw_value is not None else None

    def _float_or_default(field_name: str, default: float = 0.0) -> float:
        raw_value = normalized_doc.get(field_name)
        try:
            return float(raw_value) if raw_value is not None else float(default)
        except Exception:
            return float(default)

    def _int_or_default(field_name: str, default: int = 0) -> int:
        raw_value = normalized_doc.get(field_name)
        try:
            return int(raw_value) if raw_value is not None else int(default)
        except Exception:
            return int(default)

    return {
        "id": doc_id,
        "booking_number": (
            str(normalized_doc.get("booking_number"))
            if normalized_doc.get("booking_number") is not None
            else None
        ),
        "trip_id": _id_or_none("trip_id"),
        "student_id": _id_or_none("student_id"),
        "parent_id": _id_or_none("parent_id"),
        "user_id": _id_or_none("user_id"),
        "drop_off_point": (
            str(normalized_doc.get("drop_off_point"))
            if normalized_doc.get("drop_off_point") is not None
            else None
        ),
        "drop_off_price": _float_or_default("drop_off_price", 0.0),
        "seat_preference": (
            str(normalized_doc.get("seat_preference"))
            if normalized_doc.get("seat_preference") is not None
            else None
        ),
        "assigned_seat": (
            str(normalized_doc.get("assigned_seat"))
            if normalized_doc.get("assigned_seat") is not None
            else None
        ),
        "status": (
            str(normalized_doc.get("status"))
            if normalized_doc.get("status") is not None
            else None
        ),
        "payment_status": (
            str(normalized_doc.get("payment_status"))
            if normalized_doc.get("payment_status") is not None
            else None
        ),
        "pulang_bermalam_id": _id_or_none("pulang_bermalam_id"),
        "pulang_bermalam_approved": bool(normalized_doc.get("pulang_bermalam_approved", False)),
        "passengers": _int_or_default("passengers", 1),
        "total_price": _float_or_default("total_price", 0.0),
        "receipt_number": (
            str(normalized_doc.get("receipt_number"))
            if normalized_doc.get("receipt_number") is not None
            else None
        ),
        "created_at": (
            str(normalized_doc.get("created_at"))
            if normalized_doc.get("created_at") is not None
            else None
        ),
        "updated_at": (
            str(normalized_doc.get("updated_at"))
            if normalized_doc.get("updated_at") is not None
            else None
        ),
        "cancelled_at": (
            str(normalized_doc.get("cancelled_at"))
            if normalized_doc.get("cancelled_at") is not None
            else None
        ),
        "cancellation_reason": (
            str(normalized_doc.get("cancellation_reason"))
            if normalized_doc.get("cancellation_reason") is not None
            else None
        ),
        "notes": (
            str(normalized_doc.get("notes"))
            if normalized_doc.get("notes") is not None
            else None
        ),
        "extra_data": extra_data,
    }


_BUS_TRIP_KNOWN_FIELDS = {
    "_id",
    "route_id",
    "bus_id",
    "departure_date",
    "departure_time",
    "return_date",
    "return_time",
    "available_seats",
    "status",
    "notes",
    "created_by",
    "created_at",
    "updated_at",
    "cancelled_at",
    "cancellation_reason",
}


def _bus_trip_doc_to_row_values(normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
    extra_data = {k: v for k, v in normalized_doc.items() if k not in _BUS_TRIP_KNOWN_FIELDS}
    raw_id = normalized_doc.get("_id")
    doc_id = str(raw_id) if raw_id is not None else str(ObjectId())

    def _id_or_none(field_name: str) -> Optional[str]:
        raw_value = normalized_doc.get(field_name)
        return str(raw_value) if raw_value is not None else None

    def _int_or_default(field_name: str, default: int = 0) -> int:
        raw_value = normalized_doc.get(field_name)
        try:
            return int(raw_value) if raw_value is not None else int(default)
        except Exception:
            return int(default)

    return {
        "id": doc_id,
        "route_id": _id_or_none("route_id"),
        "bus_id": _id_or_none("bus_id"),
        "departure_date": (
            str(normalized_doc.get("departure_date"))
            if normalized_doc.get("departure_date") is not None
            else None
        ),
        "departure_time": (
            str(normalized_doc.get("departure_time"))
            if normalized_doc.get("departure_time") is not None
            else None
        ),
        "return_date": (
            str(normalized_doc.get("return_date"))
            if normalized_doc.get("return_date") is not None
            else None
        ),
        "return_time": (
            str(normalized_doc.get("return_time"))
            if normalized_doc.get("return_time") is not None
            else None
        ),
        "available_seats": _int_or_default("available_seats", 0),
        "status": (
            str(normalized_doc.get("status"))
            if normalized_doc.get("status") is not None
            else None
        ),
        "notes": (
            str(normalized_doc.get("notes"))
            if normalized_doc.get("notes") is not None
            else None
        ),
        "created_by": (
            str(normalized_doc.get("created_by"))
            if normalized_doc.get("created_by") is not None
            else None
        ),
        "created_at": (
            str(normalized_doc.get("created_at"))
            if normalized_doc.get("created_at") is not None
            else None
        ),
        "updated_at": (
            str(normalized_doc.get("updated_at"))
            if normalized_doc.get("updated_at") is not None
            else None
        ),
        "cancelled_at": (
            str(normalized_doc.get("cancelled_at"))
            if normalized_doc.get("cancelled_at") is not None
            else None
        ),
        "cancellation_reason": (
            str(normalized_doc.get("cancellation_reason"))
            if normalized_doc.get("cancellation_reason") is not None
            else None
        ),
        "extra_data": extra_data,
    }


_BUS_COMPANY_KNOWN_FIELDS = {
    "_id",
    "name",
    "registration_number",
    "entity_type",
    "address",
    "postcode",
    "city",
    "state",
    "director_name",
    "director_ic_passport",
    "phone",
    "email",
    "pic_name",
    "pic_phone",
    "apad_license_no",
    "apad_expiry_date",
    "apad_document_url",
    "license_image_url",
    "permit_image_url",
    "is_active",
    "is_verified",
    "application_status",
    "submitted_at",
    "reviewed_by",
    "approved_at",
    "officer_notes",
    "created_by",
    "created_at",
    "verified_at",
    "verified_by",
    "updated_at",
}


def _bus_company_doc_to_row_values(normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
    extra_data = {
        k: v for k, v in normalized_doc.items() if k not in _BUS_COMPANY_KNOWN_FIELDS
    }
    raw_id = normalized_doc.get("_id")
    doc_id = str(raw_id) if raw_id is not None else str(ObjectId())

    def _text_or_none(field_name: str) -> Optional[str]:
        raw_value = normalized_doc.get(field_name)
        return str(raw_value) if raw_value is not None else None

    return {
        "id": doc_id,
        "name": str(normalized_doc.get("name") or ""),
        "registration_number": str(normalized_doc.get("registration_number") or ""),
        "entity_type": _text_or_none("entity_type"),
        "address": str(normalized_doc.get("address") or ""),
        "postcode": _text_or_none("postcode"),
        "city": _text_or_none("city"),
        "state": _text_or_none("state"),
        "director_name": _text_or_none("director_name"),
        "director_ic_passport": _text_or_none("director_ic_passport"),
        "phone": str(normalized_doc.get("phone") or ""),
        "email": str(normalized_doc.get("email") or ""),
        "pic_name": str(normalized_doc.get("pic_name") or ""),
        "pic_phone": str(normalized_doc.get("pic_phone") or ""),
        "apad_license_no": _text_or_none("apad_license_no"),
        "apad_expiry_date": _text_or_none("apad_expiry_date"),
        "apad_document_url": _text_or_none("apad_document_url"),
        "license_image_url": _text_or_none("license_image_url"),
        "permit_image_url": _text_or_none("permit_image_url"),
        "is_active": bool(normalized_doc.get("is_active", True)),
        "is_verified": bool(normalized_doc.get("is_verified", False)),
        "application_status": _text_or_none("application_status"),
        "submitted_at": _text_or_none("submitted_at"),
        "reviewed_by": _text_or_none("reviewed_by"),
        "approved_at": _text_or_none("approved_at"),
        "officer_notes": _text_or_none("officer_notes"),
        "created_by": _text_or_none("created_by"),
        "created_at": _text_or_none("created_at"),
        "verified_at": _text_or_none("verified_at"),
        "verified_by": _text_or_none("verified_by"),
        "updated_at": _text_or_none("updated_at"),
        "extra_data": extra_data,
    }


_BUS_KNOWN_FIELDS = {
    "_id",
    "company_id",
    "plate_number",
    "bus_type",
    "total_seats",
    "brand",
    "model",
    "year",
    "amenities",
    "chassis_no",
    "engine_no",
    "year_manufactured",
    "bus_category",
    "color",
    "ownership_status",
    "operation_start_date",
    "permit_no",
    "permit_expiry",
    "permit_document_url",
    "puspakom_date",
    "puspakom_result",
    "puspakom_document_url",
    "insurance_company",
    "insurance_expiry",
    "insurance_document_url",
    "geran_document_url",
    "is_active",
    "created_by",
    "created_at",
    "updated_at",
}


def _bus_doc_to_row_values(normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
    extra_data = {k: v for k, v in normalized_doc.items() if k not in _BUS_KNOWN_FIELDS}
    raw_id = normalized_doc.get("_id")
    doc_id = str(raw_id) if raw_id is not None else str(ObjectId())

    def _id_or_none(field_name: str) -> Optional[str]:
        raw_value = normalized_doc.get(field_name)
        return str(raw_value) if raw_value is not None else None

    def _text_or_none(field_name: str) -> Optional[str]:
        raw_value = normalized_doc.get(field_name)
        return str(raw_value) if raw_value is not None else None

    def _int_or_none(field_name: str) -> Optional[int]:
        raw_value = normalized_doc.get(field_name)
        if raw_value is None:
            return None
        try:
            return int(raw_value)
        except Exception:
            return None

    def _int_or_default(field_name: str, default: int = 0) -> int:
        raw_value = normalized_doc.get(field_name)
        try:
            return int(raw_value) if raw_value is not None else int(default)
        except Exception:
            return int(default)

    amenities_value = normalized_doc.get("amenities")
    if not isinstance(amenities_value, list):
        amenities_value = []

    return {
        "id": doc_id,
        "company_id": _id_or_none("company_id"),
        "plate_number": str(normalized_doc.get("plate_number") or ""),
        "bus_type": _text_or_none("bus_type"),
        "total_seats": _int_or_default("total_seats", 0),
        "brand": _text_or_none("brand"),
        "model": _text_or_none("model"),
        "year": _int_or_none("year"),
        "amenities_json": amenities_value,
        "chassis_no": _text_or_none("chassis_no"),
        "engine_no": _text_or_none("engine_no"),
        "year_manufactured": _int_or_none("year_manufactured"),
        "bus_category": _text_or_none("bus_category"),
        "color": _text_or_none("color"),
        "ownership_status": _text_or_none("ownership_status"),
        "operation_start_date": _text_or_none("operation_start_date"),
        "permit_no": _text_or_none("permit_no"),
        "permit_expiry": _text_or_none("permit_expiry"),
        "permit_document_url": _text_or_none("permit_document_url"),
        "puspakom_date": _text_or_none("puspakom_date"),
        "puspakom_result": _text_or_none("puspakom_result"),
        "puspakom_document_url": _text_or_none("puspakom_document_url"),
        "insurance_company": _text_or_none("insurance_company"),
        "insurance_expiry": _text_or_none("insurance_expiry"),
        "insurance_document_url": _text_or_none("insurance_document_url"),
        "geran_document_url": _text_or_none("geran_document_url"),
        "is_active": bool(normalized_doc.get("is_active", True)),
        "created_by": _text_or_none("created_by"),
        "created_at": _text_or_none("created_at"),
        "updated_at": _text_or_none("updated_at"),
        "extra_data": extra_data,
    }


_BUS_LIVE_LOCATION_KNOWN_FIELDS = {
    "_id",
    "trip_id",
    "bus_id",
    "plate_number",
    "lat",
    "lng",
    "updated_at",
}


def _bus_live_location_doc_to_row_values(normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
    extra_data = {
        k: v for k, v in normalized_doc.items() if k not in _BUS_LIVE_LOCATION_KNOWN_FIELDS
    }
    raw_id = normalized_doc.get("_id")
    doc_id = str(raw_id) if raw_id is not None else str(ObjectId())

    def _id_or_none(field_name: str) -> Optional[str]:
        raw_value = normalized_doc.get(field_name)
        return str(raw_value) if raw_value is not None else None

    def _float_or_none(field_name: str) -> Optional[float]:
        raw_value = normalized_doc.get(field_name)
        if raw_value is None:
            return None
        try:
            return float(raw_value)
        except Exception:
            return None

    return {
        "id": doc_id,
        "trip_id": _id_or_none("trip_id"),
        "bus_id": _id_or_none("bus_id"),
        "plate_number": (
            str(normalized_doc.get("plate_number"))
            if normalized_doc.get("plate_number") is not None
            else None
        ),
        "lat": _float_or_none("lat"),
        "lng": _float_or_none("lng"),
        "updated_at": (
            str(normalized_doc.get("updated_at"))
            if normalized_doc.get("updated_at") is not None
            else None
        ),
        "extra_data": extra_data,
    }


_BUS_ROUTE_KNOWN_FIELDS = {
    "_id",
    "company_id",
    "name",
    "origin",
    "destination",
    "pickup_locations",
    "drop_off_points",
    "base_price",
    "estimated_duration",
    "distance_km",
    "trip_type",
    "return_route_id",
    "is_active",
    "created_by",
    "created_at",
    "updated_at",
    "notes",
}


def _bus_route_doc_to_row_values(normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
    extra_data = {k: v for k, v in normalized_doc.items() if k not in _BUS_ROUTE_KNOWN_FIELDS}
    raw_id = normalized_doc.get("_id")
    doc_id = str(raw_id) if raw_id is not None else str(ObjectId())

    def _id_or_none(field_name: str) -> Optional[str]:
        raw_value = normalized_doc.get(field_name)
        return str(raw_value) if raw_value is not None else None

    def _float_or_default(field_name: str, default: float = 0.0) -> float:
        raw_value = normalized_doc.get(field_name)
        try:
            return float(raw_value) if raw_value is not None else float(default)
        except Exception:
            return float(default)

    def _float_or_none(field_name: str) -> Optional[float]:
        raw_value = normalized_doc.get(field_name)
        if raw_value is None:
            return None
        try:
            return float(raw_value)
        except Exception:
            return None

    pickup_locations_value = normalized_doc.get("pickup_locations")
    if not isinstance(pickup_locations_value, list):
        pickup_locations_value = []

    drop_off_points_value = normalized_doc.get("drop_off_points")
    if not isinstance(drop_off_points_value, list):
        drop_off_points_value = []

    return {
        "id": doc_id,
        "company_id": _id_or_none("company_id"),
        "name": str(normalized_doc.get("name") or ""),
        "origin": str(normalized_doc.get("origin") or ""),
        "destination": str(normalized_doc.get("destination") or ""),
        "pickup_locations_json": pickup_locations_value,
        "drop_off_points_json": drop_off_points_value,
        "base_price": _float_or_default("base_price", 0.0),
        "estimated_duration": (
            str(normalized_doc.get("estimated_duration"))
            if normalized_doc.get("estimated_duration") is not None
            else None
        ),
        "distance_km": _float_or_none("distance_km"),
        "trip_type": (
            str(normalized_doc.get("trip_type"))
            if normalized_doc.get("trip_type") is not None
            else None
        ),
        "return_route_id": _id_or_none("return_route_id"),
        "is_active": bool(normalized_doc.get("is_active", True)),
        "created_by": (
            str(normalized_doc.get("created_by"))
            if normalized_doc.get("created_by") is not None
            else None
        ),
        "created_at": (
            str(normalized_doc.get("created_at"))
            if normalized_doc.get("created_at") is not None
            else None
        ),
        "updated_at": (
            str(normalized_doc.get("updated_at"))
            if normalized_doc.get("updated_at") is not None
            else None
        ),
        "notes": (
            str(normalized_doc.get("notes"))
            if normalized_doc.get("notes") is not None
            else None
        ),
        "extra_data": extra_data,
    }


class _SqlCursor:
    def __init__(self, collection: "_BaseSqlCollection", query: Optional[Dict[str, Any]] = None):
        self._collection = collection
        self._query = query or {}
        self._sort_spec: List[Tuple[str, int]] = []
        self._skip = 0
        self._limit: Optional[int] = None
        self._iter_docs: Optional[List[Dict[str, Any]]] = None
        self._iter_index = 0

    def sort(self, field: Any, direction: Optional[int] = None):
        if isinstance(field, list):
            self._sort_spec = [(str(k), int(v)) for k, v in field]
        elif isinstance(field, tuple):
            self._sort_spec = [(str(field[0]), int(field[1]))]
        else:
            self._sort_spec = [(str(field), int(direction or 1))]
        return self

    def skip(self, n: int):
        self._skip = max(0, int(n))
        return self

    def limit(self, n: int):
        self._limit = max(0, int(n))
        return self

    async def to_list(self, n: Optional[int] = None, length: Optional[int] = None):
        docs = await self._collection._find_docs(self._query)
        if self._sort_spec:
            for field, direction in reversed(self._sort_spec):
                docs.sort(
                    key=lambda d: _to_comparable(d.get(field)),
                    reverse=(int(direction) == -1),
                )
        if self._skip:
            docs = docs[self._skip :]
        requested_n: Optional[int] = None
        if length is not None:
            requested_n = max(0, int(length))
        elif n is not None:
            requested_n = max(0, int(n))
        max_n = self._limit if self._limit is not None else requested_n
        if max_n is not None:
            docs = docs[:max_n]
        return docs

    def __aiter__(self):
        self._iter_docs = None
        self._iter_index = 0
        return self

    async def __anext__(self):
        if self._iter_docs is None:
            self._iter_docs = await self.to_list()
        if self._iter_index >= len(self._iter_docs):
            raise StopAsyncIteration
        item = self._iter_docs[self._iter_index]
        self._iter_index += 1
        return item


class _BaseSqlCollection:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]):
        self._session_factory = session_factory

    async def _find_docs(self, query: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        raise NotImplementedError

    def find(self, query: Optional[Dict[str, Any]] = None):
        return _SqlCursor(self, query=query)

    async def find_one(
        self,
        query: Optional[Dict[str, Any]] = None,
        projection: Optional[Dict[str, Any]] = None,
        sort: Optional[List[Tuple[str, int]]] = None,
    ):
        docs = await self._find_docs(query)
        if sort:
            for field, direction in reversed(sort):
                docs.sort(
                    key=lambda d: _to_comparable(d.get(field)),
                    reverse=(int(direction) == -1),
                )
        if not docs:
            return None
        doc = docs[0]
        if projection:
            include_fields = {k for k, v in projection.items() if v}
            if include_fields:
                return {k: v for k, v in doc.items() if k in include_fields or k == "_id"}
        return doc

    async def count_documents(self, query: Optional[Dict[str, Any]] = None) -> int:
        docs = await self._find_docs(query)
        return len(docs)

    async def distinct(self, field: str):
        docs = await self._find_docs({})
        values = []
        seen = set()
        for d in docs:
            v = d.get(field)
            key = _to_comparable(v)
            if key not in seen:
                seen.add(key)
                values.append(v)
        return values


class RelationalNotificationsCollection(_BaseSqlCollection):
    _KNOWN_FIELDS = _NOTIFICATION_KNOWN_FIELDS

    def __init__(self, core_store: CoreStore):
        session_factory = core_store.get_session_factory()
        if session_factory is None:
            raise ValueError("RelationalNotificationsCollection requires PostgreSQL session factory")
        super().__init__(session_factory)
        self._mirror_collection = core_store.notifications

    def _row_to_doc(self, row: NotificationRecord) -> Dict[str, Any]:
        doc: Dict[str, Any] = dict(row.extra_data or {})
        doc["_id"] = _restore_id(row.id)
        doc["user_id"] = _restore_id(row.user_id) if row.user_id else None
        doc["type"] = row.type
        doc["title"] = row.title
        doc["message"] = row.message
        doc["category"] = row.category
        doc["priority"] = row.priority
        doc["is_read"] = row.is_read
        doc["read_at"] = row.read_at
        doc["action_url"] = row.action_url
        doc["action_label"] = row.action_label
        doc["metadata"] = row.metadata_json or {}
        doc["sender_id"] = _restore_id(row.sender_id) if row.sender_id else None
        doc["sender_name"] = row.sender_name
        doc["sender_role"] = row.sender_role
        doc["created_at"] = row.created_at
        return doc

    def _doc_to_row_values(self, normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
        return _notification_doc_to_row_values(normalized_doc)

    async def _find_rows(self) -> List[NotificationRecord]:
        async with self._session_factory() as session:
            rows = await session.scalars(select(NotificationRecord))
            return list(rows.all())

    async def _find_docs(self, query: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows = await self._find_rows()
        docs: List[Dict[str, Any]] = []
        for row in rows:
            doc = self._row_to_doc(row)
            if _matches_query(doc, query):
                docs.append(doc)
        return docs

    async def _mirror_upsert(self, doc: Dict[str, Any]) -> None:
        if self._mirror_collection is None:
            return
        mirror_query = {"_id": _restore_id(str(doc.get("_id")))}
        mirror_payload = dict(doc)
        mirror_payload.pop("_id", None)
        try:
            await self._mirror_collection.update_one(
                mirror_query,
                {"$set": mirror_payload},
                upsert=True,
            )
        except Exception:
            pass

    async def _mirror_delete(self, doc_id: str) -> None:
        if self._mirror_collection is None:
            return
        try:
            await self._mirror_collection.delete_one({"_id": _restore_id(doc_id)})
        except Exception:
            pass

    async def insert_one(self, doc: Dict[str, Any]) -> InsertOneResult:
        raw_doc = dict(doc)
        raw_id = raw_doc.get("_id")
        doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
        raw_doc["_id"] = doc_id
        normalized = _normalize_for_storage(raw_doc)
        row_values = self._doc_to_row_values(normalized)

        async with self._session_factory() as session:
            exists = await session.get(NotificationRecord, doc_id)
            if exists is not None:
                raise ValueError(f"Duplicate key for notifications._id={doc_id}")
            session.add(NotificationRecord(**row_values))
            await session.commit()

        await self._mirror_upsert(normalized)
        return InsertOneResult(inserted_id=_restore_id(doc_id))

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if not upsert:
                return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)
            base_doc = {}
            for key, value in (query or {}).items():
                if not key.startswith("$") and not isinstance(value, dict):
                    base_doc[key] = value
            new_doc = _apply_update_ops(base_doc, update)
            raw_id = new_doc.get("_id")
            doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
            new_doc["_id"] = doc_id
            normalized = _normalize_for_storage(new_doc)
            row_values = self._doc_to_row_values(normalized)
            async with self._session_factory() as session:
                session.add(NotificationRecord(**row_values))
                await session.commit()
            await self._mirror_upsert(normalized)
            return UpdateResult(matched_count=0, modified_count=1, upserted_id=_restore_id(doc_id))

        target_doc = docs[0]
        updated_doc = _apply_update_ops(target_doc, update)
        normalized = _normalize_for_storage(updated_doc)
        row_values = self._doc_to_row_values(normalized)
        doc_id = row_values["id"]

        async with self._session_factory() as session:
            row = await session.get(NotificationRecord, doc_id)
            if row is None:
                session.add(NotificationRecord(**row_values))
            else:
                for key, value in row_values.items():
                    setattr(row, key, value)
            await session.commit()

        await self._mirror_upsert(normalized)
        return UpdateResult(matched_count=1, modified_count=1, upserted_id=None)

    async def update_many(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if upsert:
                return await self.update_one(query, update, upsert=True)
            return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)

        updated_docs: List[Dict[str, Any]] = []
        for doc in docs:
            updated_docs.append(_normalize_for_storage(_apply_update_ops(doc, update)))

        async with self._session_factory() as session:
            for normalized in updated_docs:
                row_values = self._doc_to_row_values(normalized)
                doc_id = row_values["id"]
                row = await session.get(NotificationRecord, doc_id)
                if row is None:
                    session.add(NotificationRecord(**row_values))
                else:
                    for key, value in row_values.items():
                        setattr(row, key, value)
            await session.commit()

        for normalized in updated_docs:
            await self._mirror_upsert(normalized)

        return UpdateResult(
            matched_count=len(docs),
            modified_count=len(docs),
            upserted_id=None,
        )

    async def delete_one(self, query: Dict[str, Any]) -> DeleteResult:
        docs = await self._find_docs(query)
        if not docs:
            return DeleteResult(deleted_count=0)
        target_id = str(docs[0].get("_id"))

        async with self._session_factory() as session:
            await session.execute(delete(NotificationRecord).where(NotificationRecord.id == target_id))
            await session.commit()

        await self._mirror_delete(target_id)
        return DeleteResult(deleted_count=1)


class RelationalAnnouncementsCollection(_BaseSqlCollection):
    _KNOWN_FIELDS = _ANNOUNCEMENT_KNOWN_FIELDS

    def __init__(self, core_store: CoreStore):
        session_factory = core_store.get_session_factory()
        if session_factory is None:
            raise ValueError("RelationalAnnouncementsCollection requires PostgreSQL session factory")
        super().__init__(session_factory)
        self._mirror_collection = core_store.announcements

    def _row_to_doc(self, row: AnnouncementRecord) -> Dict[str, Any]:
        doc: Dict[str, Any] = dict(row.extra_data or {})
        doc["_id"] = _restore_id(row.id)
        doc["title"] = row.title
        doc["content"] = row.content
        doc["priority"] = row.priority
        doc["tingkatan"] = row.tingkatan
        doc["kelas"] = row.kelas
        doc["status"] = row.status
        doc["send_push"] = row.send_push
        doc["send_email"] = row.send_email
        doc["sent_count"] = row.sent_count
        doc["created_by"] = _restore_id(row.created_by) if row.created_by else None
        doc["created_by_name"] = row.created_by_name
        doc["created_at"] = row.created_at
        doc["published_at"] = row.published_at
        return doc

    def _doc_to_row_values(self, normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
        return _announcement_doc_to_row_values(normalized_doc)

    async def _find_rows(self) -> List[AnnouncementRecord]:
        async with self._session_factory() as session:
            rows = await session.scalars(select(AnnouncementRecord))
            return list(rows.all())

    async def _find_docs(self, query: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows = await self._find_rows()
        docs: List[Dict[str, Any]] = []
        for row in rows:
            doc = self._row_to_doc(row)
            if _matches_query(doc, query):
                docs.append(doc)
        return docs

    async def _mirror_upsert(self, doc: Dict[str, Any]) -> None:
        if self._mirror_collection is None:
            return
        mirror_query = {"_id": _restore_id(str(doc.get("_id")))}
        mirror_payload = dict(doc)
        mirror_payload.pop("_id", None)
        try:
            await self._mirror_collection.update_one(
                mirror_query,
                {"$set": mirror_payload},
                upsert=True,
            )
        except Exception:
            pass

    async def _mirror_delete(self, doc_id: str) -> None:
        if self._mirror_collection is None:
            return
        try:
            await self._mirror_collection.delete_one({"_id": _restore_id(doc_id)})
        except Exception:
            pass

    async def insert_one(self, doc: Dict[str, Any]) -> InsertOneResult:
        raw_doc = dict(doc)
        raw_id = raw_doc.get("_id")
        doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
        raw_doc["_id"] = doc_id
        normalized = _normalize_for_storage(raw_doc)
        row_values = self._doc_to_row_values(normalized)

        async with self._session_factory() as session:
            exists = await session.get(AnnouncementRecord, doc_id)
            if exists is not None:
                raise ValueError(f"Duplicate key for announcements._id={doc_id}")
            session.add(AnnouncementRecord(**row_values))
            await session.commit()

        await self._mirror_upsert(normalized)
        return InsertOneResult(inserted_id=_restore_id(doc_id))

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if not upsert:
                return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)
            base_doc = {}
            for key, value in (query or {}).items():
                if not key.startswith("$") and not isinstance(value, dict):
                    base_doc[key] = value
            new_doc = _apply_update_ops(base_doc, update)
            raw_id = new_doc.get("_id")
            doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
            new_doc["_id"] = doc_id
            normalized = _normalize_for_storage(new_doc)
            row_values = self._doc_to_row_values(normalized)
            async with self._session_factory() as session:
                session.add(AnnouncementRecord(**row_values))
                await session.commit()
            await self._mirror_upsert(normalized)
            return UpdateResult(matched_count=0, modified_count=1, upserted_id=_restore_id(doc_id))

        target_doc = docs[0]
        updated_doc = _apply_update_ops(target_doc, update)
        normalized = _normalize_for_storage(updated_doc)
        row_values = self._doc_to_row_values(normalized)
        doc_id = row_values["id"]

        async with self._session_factory() as session:
            row = await session.get(AnnouncementRecord, doc_id)
            if row is None:
                session.add(AnnouncementRecord(**row_values))
            else:
                for key, value in row_values.items():
                    setattr(row, key, value)
            await session.commit()

        await self._mirror_upsert(normalized)
        return UpdateResult(matched_count=1, modified_count=1, upserted_id=None)

    async def update_many(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if upsert:
                return await self.update_one(query, update, upsert=True)
            return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)

        updated_docs: List[Dict[str, Any]] = []
        for doc in docs:
            updated_docs.append(_normalize_for_storage(_apply_update_ops(doc, update)))

        async with self._session_factory() as session:
            for normalized in updated_docs:
                row_values = self._doc_to_row_values(normalized)
                doc_id = row_values["id"]
                row = await session.get(AnnouncementRecord, doc_id)
                if row is None:
                    session.add(AnnouncementRecord(**row_values))
                else:
                    for key, value in row_values.items():
                        setattr(row, key, value)
            await session.commit()

        for normalized in updated_docs:
            await self._mirror_upsert(normalized)

        return UpdateResult(
            matched_count=len(docs),
            modified_count=len(docs),
            upserted_id=None,
        )

    async def delete_one(self, query: Dict[str, Any]) -> DeleteResult:
        docs = await self._find_docs(query)
        if not docs:
            return DeleteResult(deleted_count=0)
        target_id = str(docs[0].get("_id"))

        async with self._session_factory() as session:
            await session.execute(delete(AnnouncementRecord).where(AnnouncementRecord.id == target_id))
            await session.commit()

        await self._mirror_delete(target_id)
        return DeleteResult(deleted_count=1)


class RelationalPushSubscriptionsCollection(_BaseSqlCollection):
    _KNOWN_FIELDS = _PUSH_SUBSCRIPTION_KNOWN_FIELDS

    def __init__(self, core_store: CoreStore):
        session_factory = core_store.get_session_factory()
        if session_factory is None:
            raise ValueError("RelationalPushSubscriptionsCollection requires PostgreSQL session factory")
        super().__init__(session_factory)
        self._mirror_collection = core_store.push_subscriptions

    def _row_to_doc(self, row: PushSubscriptionRecord) -> Dict[str, Any]:
        doc: Dict[str, Any] = dict(row.extra_data or {})
        doc["_id"] = _restore_id(row.id)
        doc["user_id"] = _restore_id(row.user_id) if row.user_id else None
        doc["endpoint"] = row.endpoint
        doc["keys"] = row.keys_json or {}
        doc["device_info"] = row.device_info
        doc["is_active"] = row.is_active
        doc["created_at"] = row.created_at
        doc["updated_at"] = row.updated_at
        return doc

    def _doc_to_row_values(self, normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
        return _push_subscription_doc_to_row_values(normalized_doc)

    async def _find_rows(self) -> List[PushSubscriptionRecord]:
        async with self._session_factory() as session:
            rows = await session.scalars(select(PushSubscriptionRecord))
            return list(rows.all())

    async def _find_docs(self, query: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows = await self._find_rows()
        docs: List[Dict[str, Any]] = []
        for row in rows:
            doc = self._row_to_doc(row)
            if _matches_query(doc, query):
                docs.append(doc)
        return docs

    async def _mirror_upsert(self, doc: Dict[str, Any]) -> None:
        if self._mirror_collection is None:
            return
        mirror_query = {"_id": _restore_id(str(doc.get("_id")))}
        mirror_payload = dict(doc)
        mirror_payload.pop("_id", None)
        try:
            await self._mirror_collection.update_one(
                mirror_query,
                {"$set": mirror_payload},
                upsert=True,
            )
        except Exception:
            pass

    async def _mirror_delete(self, doc_id: str) -> None:
        if self._mirror_collection is None:
            return
        try:
            await self._mirror_collection.delete_one({"_id": _restore_id(doc_id)})
        except Exception:
            pass

    async def insert_one(self, doc: Dict[str, Any]) -> InsertOneResult:
        raw_doc = dict(doc)
        raw_id = raw_doc.get("_id")
        doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
        raw_doc["_id"] = doc_id
        normalized = _normalize_for_storage(raw_doc)
        row_values = self._doc_to_row_values(normalized)

        async with self._session_factory() as session:
            exists = await session.get(PushSubscriptionRecord, doc_id)
            if exists is not None:
                raise ValueError(f"Duplicate key for push_subscriptions._id={doc_id}")
            session.add(PushSubscriptionRecord(**row_values))
            await session.commit()

        await self._mirror_upsert(normalized)
        return InsertOneResult(inserted_id=_restore_id(doc_id))

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if not upsert:
                return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)
            base_doc = {}
            for key, value in (query or {}).items():
                if not key.startswith("$") and not isinstance(value, dict):
                    base_doc[key] = value
            new_doc = _apply_update_ops(base_doc, update)
            raw_id = new_doc.get("_id")
            doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
            new_doc["_id"] = doc_id
            normalized = _normalize_for_storage(new_doc)
            row_values = self._doc_to_row_values(normalized)
            async with self._session_factory() as session:
                session.add(PushSubscriptionRecord(**row_values))
                await session.commit()
            await self._mirror_upsert(normalized)
            return UpdateResult(matched_count=0, modified_count=1, upserted_id=_restore_id(doc_id))

        target_doc = docs[0]
        updated_doc = _apply_update_ops(target_doc, update)
        normalized = _normalize_for_storage(updated_doc)
        row_values = self._doc_to_row_values(normalized)
        doc_id = row_values["id"]

        async with self._session_factory() as session:
            row = await session.get(PushSubscriptionRecord, doc_id)
            if row is None:
                session.add(PushSubscriptionRecord(**row_values))
            else:
                for key, value in row_values.items():
                    setattr(row, key, value)
            await session.commit()

        await self._mirror_upsert(normalized)
        return UpdateResult(matched_count=1, modified_count=1, upserted_id=None)

    async def update_many(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if upsert:
                return await self.update_one(query, update, upsert=True)
            return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)

        updated_docs: List[Dict[str, Any]] = []
        for doc in docs:
            updated_docs.append(_normalize_for_storage(_apply_update_ops(doc, update)))

        async with self._session_factory() as session:
            for normalized in updated_docs:
                row_values = self._doc_to_row_values(normalized)
                doc_id = row_values["id"]
                row = await session.get(PushSubscriptionRecord, doc_id)
                if row is None:
                    session.add(PushSubscriptionRecord(**row_values))
                else:
                    for key, value in row_values.items():
                        setattr(row, key, value)
            await session.commit()

        for normalized in updated_docs:
            await self._mirror_upsert(normalized)

        return UpdateResult(
            matched_count=len(docs),
            modified_count=len(docs),
            upserted_id=None,
        )

    async def delete_one(self, query: Dict[str, Any]) -> DeleteResult:
        docs = await self._find_docs(query)
        if not docs:
            return DeleteResult(deleted_count=0)
        target_id = str(docs[0].get("_id"))

        async with self._session_factory() as session:
            await session.execute(delete(PushSubscriptionRecord).where(PushSubscriptionRecord.id == target_id))
            await session.commit()

        await self._mirror_delete(target_id)
        return DeleteResult(deleted_count=1)


class RelationalPushLogsCollection(_BaseSqlCollection):
    _KNOWN_FIELDS = _PUSH_LOG_KNOWN_FIELDS

    def __init__(self, core_store: CoreStore):
        session_factory = core_store.get_session_factory()
        if session_factory is None:
            raise ValueError("RelationalPushLogsCollection requires PostgreSQL session factory")
        super().__init__(session_factory)
        self._mirror_collection = core_store.push_logs

    def _row_to_doc(self, row: PushLogRecord) -> Dict[str, Any]:
        doc: Dict[str, Any] = dict(row.extra_data or {})
        doc["_id"] = _restore_id(row.id)
        doc["subscription_id"] = _restore_id(row.subscription_id) if row.subscription_id else None
        doc["user_id"] = _restore_id(row.user_id) if row.user_id else None
        doc["title"] = row.title
        doc["body"] = row.body
        doc["url"] = row.url
        doc["status"] = row.status
        doc["reason"] = row.reason
        doc["status_code"] = row.status_code
        doc["error"] = row.error
        doc["created_at"] = row.created_at
        return doc

    def _doc_to_row_values(self, normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
        return _push_log_doc_to_row_values(normalized_doc)

    async def _find_rows(self) -> List[PushLogRecord]:
        async with self._session_factory() as session:
            rows = await session.scalars(select(PushLogRecord))
            return list(rows.all())

    async def _find_docs(self, query: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows = await self._find_rows()
        docs: List[Dict[str, Any]] = []
        for row in rows:
            doc = self._row_to_doc(row)
            if _matches_query(doc, query):
                docs.append(doc)
        return docs

    async def _mirror_upsert(self, doc: Dict[str, Any]) -> None:
        if self._mirror_collection is None:
            return
        mirror_query = {"_id": _restore_id(str(doc.get("_id")))}
        mirror_payload = dict(doc)
        mirror_payload.pop("_id", None)
        try:
            await self._mirror_collection.update_one(
                mirror_query,
                {"$set": mirror_payload},
                upsert=True,
            )
        except Exception:
            pass

    async def _mirror_delete(self, doc_id: str) -> None:
        if self._mirror_collection is None:
            return
        try:
            await self._mirror_collection.delete_one({"_id": _restore_id(doc_id)})
        except Exception:
            pass

    async def insert_one(self, doc: Dict[str, Any]) -> InsertOneResult:
        raw_doc = dict(doc)
        raw_id = raw_doc.get("_id")
        doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
        raw_doc["_id"] = doc_id
        normalized = _normalize_for_storage(raw_doc)
        row_values = self._doc_to_row_values(normalized)

        async with self._session_factory() as session:
            exists = await session.get(PushLogRecord, doc_id)
            if exists is not None:
                raise ValueError(f"Duplicate key for push_logs._id={doc_id}")
            session.add(PushLogRecord(**row_values))
            await session.commit()

        await self._mirror_upsert(normalized)
        return InsertOneResult(inserted_id=_restore_id(doc_id))

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if not upsert:
                return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)
            base_doc = {}
            for key, value in (query or {}).items():
                if not key.startswith("$") and not isinstance(value, dict):
                    base_doc[key] = value
            new_doc = _apply_update_ops(base_doc, update)
            raw_id = new_doc.get("_id")
            doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
            new_doc["_id"] = doc_id
            normalized = _normalize_for_storage(new_doc)
            row_values = self._doc_to_row_values(normalized)
            async with self._session_factory() as session:
                session.add(PushLogRecord(**row_values))
                await session.commit()
            await self._mirror_upsert(normalized)
            return UpdateResult(matched_count=0, modified_count=1, upserted_id=_restore_id(doc_id))

        target_doc = docs[0]
        updated_doc = _apply_update_ops(target_doc, update)
        normalized = _normalize_for_storage(updated_doc)
        row_values = self._doc_to_row_values(normalized)
        doc_id = row_values["id"]

        async with self._session_factory() as session:
            row = await session.get(PushLogRecord, doc_id)
            if row is None:
                session.add(PushLogRecord(**row_values))
            else:
                for key, value in row_values.items():
                    setattr(row, key, value)
            await session.commit()

        await self._mirror_upsert(normalized)
        return UpdateResult(matched_count=1, modified_count=1, upserted_id=None)

    async def update_many(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if upsert:
                return await self.update_one(query, update, upsert=True)
            return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)

        updated_docs: List[Dict[str, Any]] = []
        for doc in docs:
            updated_docs.append(_normalize_for_storage(_apply_update_ops(doc, update)))

        async with self._session_factory() as session:
            for normalized in updated_docs:
                row_values = self._doc_to_row_values(normalized)
                doc_id = row_values["id"]
                row = await session.get(PushLogRecord, doc_id)
                if row is None:
                    session.add(PushLogRecord(**row_values))
                else:
                    for key, value in row_values.items():
                        setattr(row, key, value)
            await session.commit()

        for normalized in updated_docs:
            await self._mirror_upsert(normalized)

        return UpdateResult(
            matched_count=len(docs),
            modified_count=len(docs),
            upserted_id=None,
        )

    async def delete_one(self, query: Dict[str, Any]) -> DeleteResult:
        docs = await self._find_docs(query)
        if not docs:
            return DeleteResult(deleted_count=0)
        target_id = str(docs[0].get("_id"))

        async with self._session_factory() as session:
            await session.execute(delete(PushLogRecord).where(PushLogRecord.id == target_id))
            await session.commit()

        await self._mirror_delete(target_id)
        return DeleteResult(deleted_count=1)


class RelationalEmailLogsCollection(_BaseSqlCollection):
    _KNOWN_FIELDS = _EMAIL_LOG_KNOWN_FIELDS

    def __init__(self, core_store: CoreStore):
        session_factory = core_store.get_session_factory()
        if session_factory is None:
            raise ValueError("RelationalEmailLogsCollection requires PostgreSQL session factory")
        super().__init__(session_factory)
        self._mirror_collection = core_store.email_logs

    def _row_to_doc(self, row: EmailLogRecord) -> Dict[str, Any]:
        doc: Dict[str, Any] = dict(row.extra_data or {})
        doc["_id"] = _restore_id(row.id)
        doc["user_id"] = _restore_id(row.user_id) if row.user_id else None
        doc["recipient"] = row.recipient
        doc["email"] = row.email
        doc["type"] = row.type
        doc["subject"] = row.subject
        doc["template"] = row.template
        doc["status"] = row.status
        doc["email_id"] = row.email_id
        doc["sent_by"] = _restore_id(row.sent_by) if row.sent_by else None
        doc["sent_at"] = row.sent_at
        doc["created_at"] = row.created_at
        doc["error"] = row.error
        doc["metadata"] = row.metadata_json or {}
        doc["data"] = row.data_json or {}
        return doc

    def _doc_to_row_values(self, normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
        return _email_log_doc_to_row_values(normalized_doc)

    async def _find_rows(self) -> List[EmailLogRecord]:
        async with self._session_factory() as session:
            rows = await session.scalars(select(EmailLogRecord))
            return list(rows.all())

    async def _find_docs(self, query: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows = await self._find_rows()
        docs: List[Dict[str, Any]] = []
        for row in rows:
            doc = self._row_to_doc(row)
            if _matches_query(doc, query):
                docs.append(doc)
        return docs

    async def _mirror_upsert(self, doc: Dict[str, Any]) -> None:
        if self._mirror_collection is None:
            return
        mirror_query = {"_id": _restore_id(str(doc.get("_id")))}
        mirror_payload = dict(doc)
        mirror_payload.pop("_id", None)
        try:
            await self._mirror_collection.update_one(
                mirror_query,
                {"$set": mirror_payload},
                upsert=True,
            )
        except Exception:
            pass

    async def _mirror_delete(self, doc_id: str) -> None:
        if self._mirror_collection is None:
            return
        try:
            await self._mirror_collection.delete_one({"_id": _restore_id(doc_id)})
        except Exception:
            pass

    async def insert_one(self, doc: Dict[str, Any]) -> InsertOneResult:
        raw_doc = dict(doc)
        raw_id = raw_doc.get("_id")
        doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
        raw_doc["_id"] = doc_id
        normalized = _normalize_for_storage(raw_doc)
        row_values = self._doc_to_row_values(normalized)

        async with self._session_factory() as session:
            exists = await session.get(EmailLogRecord, doc_id)
            if exists is not None:
                raise ValueError(f"Duplicate key for email_logs._id={doc_id}")
            session.add(EmailLogRecord(**row_values))
            await session.commit()

        await self._mirror_upsert(normalized)
        return InsertOneResult(inserted_id=_restore_id(doc_id))

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if not upsert:
                return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)
            base_doc = {}
            for key, value in (query or {}).items():
                if not key.startswith("$") and not isinstance(value, dict):
                    base_doc[key] = value
            new_doc = _apply_update_ops(base_doc, update)
            raw_id = new_doc.get("_id")
            doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
            new_doc["_id"] = doc_id
            normalized = _normalize_for_storage(new_doc)
            row_values = self._doc_to_row_values(normalized)
            async with self._session_factory() as session:
                session.add(EmailLogRecord(**row_values))
                await session.commit()
            await self._mirror_upsert(normalized)
            return UpdateResult(matched_count=0, modified_count=1, upserted_id=_restore_id(doc_id))

        target_doc = docs[0]
        updated_doc = _apply_update_ops(target_doc, update)
        normalized = _normalize_for_storage(updated_doc)
        row_values = self._doc_to_row_values(normalized)
        doc_id = row_values["id"]

        async with self._session_factory() as session:
            row = await session.get(EmailLogRecord, doc_id)
            if row is None:
                session.add(EmailLogRecord(**row_values))
            else:
                for key, value in row_values.items():
                    setattr(row, key, value)
            await session.commit()

        await self._mirror_upsert(normalized)
        return UpdateResult(matched_count=1, modified_count=1, upserted_id=None)

    async def update_many(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if upsert:
                return await self.update_one(query, update, upsert=True)
            return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)

        updated_docs: List[Dict[str, Any]] = []
        for doc in docs:
            updated_docs.append(_normalize_for_storage(_apply_update_ops(doc, update)))

        async with self._session_factory() as session:
            for normalized in updated_docs:
                row_values = self._doc_to_row_values(normalized)
                doc_id = row_values["id"]
                row = await session.get(EmailLogRecord, doc_id)
                if row is None:
                    session.add(EmailLogRecord(**row_values))
                else:
                    for key, value in row_values.items():
                        setattr(row, key, value)
            await session.commit()

        for normalized in updated_docs:
            await self._mirror_upsert(normalized)

        return UpdateResult(
            matched_count=len(docs),
            modified_count=len(docs),
            upserted_id=None,
        )

    async def delete_one(self, query: Dict[str, Any]) -> DeleteResult:
        docs = await self._find_docs(query)
        if not docs:
            return DeleteResult(deleted_count=0)
        target_id = str(docs[0].get("_id"))

        async with self._session_factory() as session:
            await session.execute(delete(EmailLogRecord).where(EmailLogRecord.id == target_id))
            await session.commit()

        await self._mirror_delete(target_id)
        return DeleteResult(deleted_count=1)


class RelationalEmailTemplatesCollection(_BaseSqlCollection):
    _KNOWN_FIELDS = _EMAIL_TEMPLATE_KNOWN_FIELDS

    def __init__(self, core_store: CoreStore):
        session_factory = core_store.get_session_factory()
        if session_factory is None:
            raise ValueError(
                "RelationalEmailTemplatesCollection requires PostgreSQL session factory"
            )
        super().__init__(session_factory)
        self._mirror_collection = core_store.email_templates

    def _row_to_doc(self, row: EmailTemplateRecord) -> Dict[str, Any]:
        doc: Dict[str, Any] = dict(row.extra_data or {})
        doc["_id"] = _restore_id(row.id)
        doc["template_key"] = row.template_key
        doc["name"] = row.name
        doc["description"] = row.description
        doc["subject"] = row.subject
        doc["body_html"] = row.body_html
        doc["body_text"] = row.body_text
        doc["variables"] = (
            row.variables_json if isinstance(row.variables_json, list) else []
        )
        doc["is_active"] = bool(row.is_active)
        doc["tingkatan"] = row.tingkatan
        doc["created_at"] = row.created_at
        doc["updated_at"] = row.updated_at
        doc["created_by"] = _restore_id(row.created_by) if row.created_by else None
        return doc

    def _doc_to_row_values(self, normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
        return _email_template_doc_to_row_values(normalized_doc)

    async def _find_rows(self) -> List[EmailTemplateRecord]:
        async with self._session_factory() as session:
            rows = await session.scalars(select(EmailTemplateRecord))
            return list(rows.all())

    async def _find_docs(self, query: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows = await self._find_rows()
        docs: List[Dict[str, Any]] = []
        for row in rows:
            doc = self._row_to_doc(row)
            if _matches_query(doc, query):
                docs.append(doc)
        return docs

    async def _mirror_upsert(self, doc: Dict[str, Any]) -> None:
        if self._mirror_collection is None:
            return
        mirror_query = {"_id": _restore_id(str(doc.get("_id")))}
        mirror_payload = dict(doc)
        mirror_payload.pop("_id", None)
        try:
            await self._mirror_collection.update_one(
                mirror_query,
                {"$set": mirror_payload},
                upsert=True,
            )
        except Exception:
            pass

    async def _mirror_delete(self, doc_id: str) -> None:
        if self._mirror_collection is None:
            return
        try:
            await self._mirror_collection.delete_one({"_id": _restore_id(doc_id)})
        except Exception:
            pass

    async def insert_one(self, doc: Dict[str, Any]) -> InsertOneResult:
        raw_doc = dict(doc)
        raw_id = raw_doc.get("_id")
        doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
        raw_doc["_id"] = doc_id
        normalized = _normalize_for_storage(raw_doc)
        row_values = self._doc_to_row_values(normalized)

        async with self._session_factory() as session:
            exists = await session.get(EmailTemplateRecord, doc_id)
            if exists is not None:
                raise ValueError(f"Duplicate key for email_templates._id={doc_id}")
            session.add(EmailTemplateRecord(**row_values))
            await session.commit()

        await self._mirror_upsert(normalized)
        return InsertOneResult(inserted_id=_restore_id(doc_id))

    async def update_one(
        self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False
    ) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if not upsert:
                return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)
            base_doc = {}
            for key, value in (query or {}).items():
                if not key.startswith("$") and not isinstance(value, dict):
                    base_doc[key] = value
            new_doc = _apply_update_ops(base_doc, update)
            raw_id = new_doc.get("_id")
            doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
            new_doc["_id"] = doc_id
            normalized = _normalize_for_storage(new_doc)
            row_values = self._doc_to_row_values(normalized)
            async with self._session_factory() as session:
                session.add(EmailTemplateRecord(**row_values))
                await session.commit()
            await self._mirror_upsert(normalized)
            return UpdateResult(
                matched_count=0, modified_count=1, upserted_id=_restore_id(doc_id)
            )

        target_doc = docs[0]
        updated_doc = _apply_update_ops(target_doc, update)
        normalized = _normalize_for_storage(updated_doc)
        row_values = self._doc_to_row_values(normalized)
        doc_id = row_values["id"]

        async with self._session_factory() as session:
            row = await session.get(EmailTemplateRecord, doc_id)
            if row is None:
                session.add(EmailTemplateRecord(**row_values))
            else:
                for key, value in row_values.items():
                    setattr(row, key, value)
            await session.commit()

        await self._mirror_upsert(normalized)
        return UpdateResult(matched_count=1, modified_count=1, upserted_id=None)

    async def update_many(
        self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False
    ) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if upsert:
                return await self.update_one(query, update, upsert=True)
            return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)

        updated_docs: List[Dict[str, Any]] = []
        for doc in docs:
            updated_docs.append(_normalize_for_storage(_apply_update_ops(doc, update)))

        async with self._session_factory() as session:
            for normalized in updated_docs:
                row_values = self._doc_to_row_values(normalized)
                doc_id = row_values["id"]
                row = await session.get(EmailTemplateRecord, doc_id)
                if row is None:
                    session.add(EmailTemplateRecord(**row_values))
                else:
                    for key, value in row_values.items():
                        setattr(row, key, value)
            await session.commit()

        for normalized in updated_docs:
            await self._mirror_upsert(normalized)

        return UpdateResult(
            matched_count=len(docs),
            modified_count=len(docs),
            upserted_id=None,
        )

    async def delete_one(self, query: Dict[str, Any]) -> DeleteResult:
        docs = await self._find_docs(query)
        if not docs:
            return DeleteResult(deleted_count=0)
        target_id = str(docs[0].get("_id"))

        async with self._session_factory() as session:
            await session.execute(
                delete(EmailTemplateRecord).where(EmailTemplateRecord.id == target_id)
            )
            await session.commit()

        await self._mirror_delete(target_id)
        return DeleteResult(deleted_count=1)


class RelationalPaymentRemindersCollection(_BaseSqlCollection):
    _KNOWN_FIELDS = _PAYMENT_REMINDER_KNOWN_FIELDS

    def __init__(self, core_store: CoreStore):
        session_factory = core_store.get_session_factory()
        if session_factory is None:
            raise ValueError(
                "RelationalPaymentRemindersCollection requires PostgreSQL session factory"
            )
        super().__init__(session_factory)
        self._mirror_collection = core_store.payment_reminders

    def _row_to_doc(self, row: PaymentReminderRecord) -> Dict[str, Any]:
        doc: Dict[str, Any] = dict(row.extra_data or {})
        doc["_id"] = _restore_id(row.id)
        doc["user_id"] = _restore_id(row.user_id) if row.user_id else None
        doc["item_id"] = row.item_id
        doc["student_id"] = _restore_id(row.student_id) if row.student_id else None
        doc["student_name"] = row.student_name
        doc["set_name"] = row.set_name
        doc["amount"] = float(row.amount or 0)
        doc["due_date"] = row.due_date
        doc["remind_at"] = row.remind_at
        doc["days_before"] = int(row.days_before or 0)
        doc["source"] = row.source
        doc["status"] = row.status
        doc["sent_at"] = row.sent_at
        doc["retry_count"] = int(row.retry_count or 0)
        doc["next_retry_at"] = row.next_retry_at
        doc["retry_exhausted"] = bool(row.retry_exhausted)
        doc["max_retries"] = int(row.max_retries or 0)
        doc["final_failed_at"] = row.final_failed_at
        doc["last_error"] = row.last_error
        doc["created_at"] = row.created_at
        doc["updated_at"] = row.updated_at
        doc["cancelled_at"] = row.cancelled_at
        return doc

    def _doc_to_row_values(self, normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
        return _payment_reminder_doc_to_row_values(normalized_doc)

    async def _find_rows(self) -> List[PaymentReminderRecord]:
        async with self._session_factory() as session:
            rows = await session.scalars(select(PaymentReminderRecord))
            return list(rows.all())

    async def _find_docs(self, query: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows = await self._find_rows()
        docs: List[Dict[str, Any]] = []
        for row in rows:
            doc = self._row_to_doc(row)
            if _matches_query(doc, query):
                docs.append(doc)
        return docs

    async def _mirror_upsert(self, doc: Dict[str, Any]) -> None:
        if self._mirror_collection is None:
            return
        mirror_query = {"_id": _restore_id(str(doc.get("_id")))}
        mirror_payload = dict(doc)
        mirror_payload.pop("_id", None)
        try:
            await self._mirror_collection.update_one(
                mirror_query,
                {"$set": mirror_payload},
                upsert=True,
            )
        except Exception:
            pass

    async def _mirror_delete(self, doc_id: str) -> None:
        if self._mirror_collection is None:
            return
        try:
            await self._mirror_collection.delete_one({"_id": _restore_id(doc_id)})
        except Exception:
            pass

    async def insert_one(self, doc: Dict[str, Any]) -> InsertOneResult:
        raw_doc = dict(doc)
        raw_id = raw_doc.get("_id")
        doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
        raw_doc["_id"] = doc_id
        normalized = _normalize_for_storage(raw_doc)
        row_values = self._doc_to_row_values(normalized)

        async with self._session_factory() as session:
            exists = await session.get(PaymentReminderRecord, doc_id)
            if exists is not None:
                raise ValueError(f"Duplicate key for payment_reminders._id={doc_id}")
            session.add(PaymentReminderRecord(**row_values))
            await session.commit()

        await self._mirror_upsert(normalized)
        return InsertOneResult(inserted_id=_restore_id(doc_id))

    async def update_one(
        self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False
    ) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if not upsert:
                return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)
            base_doc = {}
            for key, value in (query or {}).items():
                if not key.startswith("$") and not isinstance(value, dict):
                    base_doc[key] = value
            new_doc = _apply_update_ops(base_doc, update)
            raw_id = new_doc.get("_id")
            doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
            new_doc["_id"] = doc_id
            normalized = _normalize_for_storage(new_doc)
            row_values = self._doc_to_row_values(normalized)
            async with self._session_factory() as session:
                session.add(PaymentReminderRecord(**row_values))
                await session.commit()
            await self._mirror_upsert(normalized)
            return UpdateResult(
                matched_count=0, modified_count=1, upserted_id=_restore_id(doc_id)
            )

        target_doc = docs[0]
        updated_doc = _apply_update_ops(target_doc, update)
        normalized = _normalize_for_storage(updated_doc)
        row_values = self._doc_to_row_values(normalized)
        doc_id = row_values["id"]

        async with self._session_factory() as session:
            row = await session.get(PaymentReminderRecord, doc_id)
            if row is None:
                session.add(PaymentReminderRecord(**row_values))
            else:
                for key, value in row_values.items():
                    setattr(row, key, value)
            await session.commit()

        await self._mirror_upsert(normalized)
        return UpdateResult(matched_count=1, modified_count=1, upserted_id=None)

    async def update_many(
        self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False
    ) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if upsert:
                return await self.update_one(query, update, upsert=True)
            return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)

        updated_docs: List[Dict[str, Any]] = []
        for doc in docs:
            updated_docs.append(_normalize_for_storage(_apply_update_ops(doc, update)))

        async with self._session_factory() as session:
            for normalized in updated_docs:
                row_values = self._doc_to_row_values(normalized)
                doc_id = row_values["id"]
                row = await session.get(PaymentReminderRecord, doc_id)
                if row is None:
                    session.add(PaymentReminderRecord(**row_values))
                else:
                    for key, value in row_values.items():
                        setattr(row, key, value)
            await session.commit()

        for normalized in updated_docs:
            await self._mirror_upsert(normalized)

        return UpdateResult(
            matched_count=len(docs),
            modified_count=len(docs),
            upserted_id=None,
        )

    async def delete_one(self, query: Dict[str, Any]) -> DeleteResult:
        docs = await self._find_docs(query)
        if not docs:
            return DeleteResult(deleted_count=0)
        target_id = str(docs[0].get("_id"))

        async with self._session_factory() as session:
            await session.execute(
                delete(PaymentReminderRecord).where(PaymentReminderRecord.id == target_id)
            )
            await session.commit()

        await self._mirror_delete(target_id)
        return DeleteResult(deleted_count=1)


class RelationalPaymentReminderPreferencesCollection(_BaseSqlCollection):
    _KNOWN_FIELDS = _PAYMENT_REMINDER_PREFERENCE_KNOWN_FIELDS

    def __init__(self, core_store: CoreStore):
        session_factory = core_store.get_session_factory()
        if session_factory is None:
            raise ValueError(
                "RelationalPaymentReminderPreferencesCollection requires PostgreSQL session factory"
            )
        super().__init__(session_factory)
        self._mirror_collection = core_store.payment_reminder_preferences

    def _row_to_doc(self, row: PaymentReminderPreferenceRecord) -> Dict[str, Any]:
        doc: Dict[str, Any] = dict(row.extra_data or {})
        doc["_id"] = _restore_id(row.id)
        doc["user_id"] = _restore_id(row.user_id) if row.user_id else None
        doc["default_days_before"] = int(row.default_days_before or 0)
        doc["default_time"] = row.default_time
        doc["default_source"] = row.default_source
        doc["created_at"] = row.created_at
        doc["updated_at"] = row.updated_at
        return doc

    def _doc_to_row_values(self, normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
        return _payment_reminder_preference_doc_to_row_values(normalized_doc)

    async def _find_rows(self) -> List[PaymentReminderPreferenceRecord]:
        async with self._session_factory() as session:
            rows = await session.scalars(select(PaymentReminderPreferenceRecord))
            return list(rows.all())

    async def _find_docs(self, query: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows = await self._find_rows()
        docs: List[Dict[str, Any]] = []
        for row in rows:
            doc = self._row_to_doc(row)
            if _matches_query(doc, query):
                docs.append(doc)
        return docs

    async def _mirror_upsert(self, doc: Dict[str, Any]) -> None:
        if self._mirror_collection is None:
            return
        mirror_query = {"_id": _restore_id(str(doc.get("_id")))}
        mirror_payload = dict(doc)
        mirror_payload.pop("_id", None)
        try:
            await self._mirror_collection.update_one(
                mirror_query,
                {"$set": mirror_payload},
                upsert=True,
            )
        except Exception:
            pass

    async def _mirror_delete(self, doc_id: str) -> None:
        if self._mirror_collection is None:
            return
        try:
            await self._mirror_collection.delete_one({"_id": _restore_id(doc_id)})
        except Exception:
            pass

    async def insert_one(self, doc: Dict[str, Any]) -> InsertOneResult:
        raw_doc = dict(doc)
        raw_id = raw_doc.get("_id")
        doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
        raw_doc["_id"] = doc_id
        normalized = _normalize_for_storage(raw_doc)
        row_values = self._doc_to_row_values(normalized)

        async with self._session_factory() as session:
            exists = await session.get(PaymentReminderPreferenceRecord, doc_id)
            if exists is not None:
                raise ValueError(
                    f"Duplicate key for payment_reminder_preferences._id={doc_id}"
                )
            session.add(PaymentReminderPreferenceRecord(**row_values))
            await session.commit()

        await self._mirror_upsert(normalized)
        return InsertOneResult(inserted_id=_restore_id(doc_id))

    async def update_one(
        self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False
    ) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if not upsert:
                return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)
            base_doc = {}
            for key, value in (query or {}).items():
                if not key.startswith("$") and not isinstance(value, dict):
                    base_doc[key] = value
            new_doc = _apply_update_ops(base_doc, update)
            raw_id = new_doc.get("_id")
            doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
            new_doc["_id"] = doc_id
            normalized = _normalize_for_storage(new_doc)
            row_values = self._doc_to_row_values(normalized)
            async with self._session_factory() as session:
                session.add(PaymentReminderPreferenceRecord(**row_values))
                await session.commit()
            await self._mirror_upsert(normalized)
            return UpdateResult(
                matched_count=0, modified_count=1, upserted_id=_restore_id(doc_id)
            )

        target_doc = docs[0]
        updated_doc = _apply_update_ops(target_doc, update)
        normalized = _normalize_for_storage(updated_doc)
        row_values = self._doc_to_row_values(normalized)
        doc_id = row_values["id"]

        async with self._session_factory() as session:
            row = await session.get(PaymentReminderPreferenceRecord, doc_id)
            if row is None:
                session.add(PaymentReminderPreferenceRecord(**row_values))
            else:
                for key, value in row_values.items():
                    setattr(row, key, value)
            await session.commit()

        await self._mirror_upsert(normalized)
        return UpdateResult(matched_count=1, modified_count=1, upserted_id=None)

    async def update_many(
        self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False
    ) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if upsert:
                return await self.update_one(query, update, upsert=True)
            return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)

        updated_docs: List[Dict[str, Any]] = []
        for doc in docs:
            updated_docs.append(_normalize_for_storage(_apply_update_ops(doc, update)))

        async with self._session_factory() as session:
            for normalized in updated_docs:
                row_values = self._doc_to_row_values(normalized)
                doc_id = row_values["id"]
                row = await session.get(PaymentReminderPreferenceRecord, doc_id)
                if row is None:
                    session.add(PaymentReminderPreferenceRecord(**row_values))
                else:
                    for key, value in row_values.items():
                        setattr(row, key, value)
            await session.commit()

        for normalized in updated_docs:
            await self._mirror_upsert(normalized)

        return UpdateResult(
            matched_count=len(docs),
            modified_count=len(docs),
            upserted_id=None,
        )

    async def delete_one(self, query: Dict[str, Any]) -> DeleteResult:
        docs = await self._find_docs(query)
        if not docs:
            return DeleteResult(deleted_count=0)
        target_id = str(docs[0].get("_id"))

        async with self._session_factory() as session:
            await session.execute(
                delete(PaymentReminderPreferenceRecord).where(
                    PaymentReminderPreferenceRecord.id == target_id
                )
            )
            await session.commit()

        await self._mirror_delete(target_id)
        return DeleteResult(deleted_count=1)


class RelationalPaymentCenterCartCollection(_BaseSqlCollection):
    _KNOWN_FIELDS = _PAYMENT_CENTER_CART_KNOWN_FIELDS

    def __init__(self, core_store: CoreStore):
        session_factory = core_store.get_session_factory()
        if session_factory is None:
            raise ValueError(
                "RelationalPaymentCenterCartCollection requires PostgreSQL session factory"
            )
        super().__init__(session_factory)
        self._mirror_collection = core_store.payment_center_cart

    def _row_to_doc(self, row: PaymentCenterCartRecord) -> Dict[str, Any]:
        doc: Dict[str, Any] = dict(row.extra_data or {})
        doc["_id"] = _restore_id(row.id)
        doc["user_id"] = _restore_id(row.user_id) if row.user_id else None
        doc["items"] = row.items_json if isinstance(row.items_json, list) else []
        doc["created_at"] = row.created_at
        doc["updated_at"] = row.updated_at
        return doc

    def _doc_to_row_values(self, normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
        return _payment_center_cart_doc_to_row_values(normalized_doc)

    async def _find_rows(self) -> List[PaymentCenterCartRecord]:
        async with self._session_factory() as session:
            rows = await session.scalars(select(PaymentCenterCartRecord))
            return list(rows.all())

    async def _find_docs(self, query: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows = await self._find_rows()
        docs: List[Dict[str, Any]] = []
        for row in rows:
            doc = self._row_to_doc(row)
            if _matches_query(doc, query):
                docs.append(doc)
        return docs

    async def _mirror_upsert(self, doc: Dict[str, Any]) -> None:
        if self._mirror_collection is None:
            return
        mirror_query = {"_id": _restore_id(str(doc.get("_id")))}
        mirror_payload = dict(doc)
        mirror_payload.pop("_id", None)
        try:
            await self._mirror_collection.update_one(
                mirror_query,
                {"$set": mirror_payload},
                upsert=True,
            )
        except Exception:
            pass

    async def _mirror_delete(self, doc_id: str) -> None:
        if self._mirror_collection is None:
            return
        try:
            await self._mirror_collection.delete_one({"_id": _restore_id(doc_id)})
        except Exception:
            pass

    async def insert_one(self, doc: Dict[str, Any]) -> InsertOneResult:
        raw_doc = dict(doc)
        raw_id = raw_doc.get("_id")
        doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
        raw_doc["_id"] = doc_id
        normalized = _normalize_for_storage(raw_doc)
        row_values = self._doc_to_row_values(normalized)

        async with self._session_factory() as session:
            exists = await session.get(PaymentCenterCartRecord, doc_id)
            if exists is not None:
                raise ValueError(f"Duplicate key for payment_center_cart._id={doc_id}")
            session.add(PaymentCenterCartRecord(**row_values))
            await session.commit()

        await self._mirror_upsert(normalized)
        return InsertOneResult(inserted_id=_restore_id(doc_id))

    async def update_one(
        self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False
    ) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if not upsert:
                return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)
            base_doc = {}
            for key, value in (query or {}).items():
                if not key.startswith("$") and not isinstance(value, dict):
                    base_doc[key] = value
            new_doc = _apply_update_ops(base_doc, update)
            raw_id = new_doc.get("_id")
            doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
            new_doc["_id"] = doc_id
            normalized = _normalize_for_storage(new_doc)
            row_values = self._doc_to_row_values(normalized)
            async with self._session_factory() as session:
                session.add(PaymentCenterCartRecord(**row_values))
                await session.commit()
            await self._mirror_upsert(normalized)
            return UpdateResult(
                matched_count=0, modified_count=1, upserted_id=_restore_id(doc_id)
            )

        target_doc = docs[0]
        updated_doc = _apply_update_ops(target_doc, update)
        normalized = _normalize_for_storage(updated_doc)
        row_values = self._doc_to_row_values(normalized)
        doc_id = row_values["id"]

        async with self._session_factory() as session:
            row = await session.get(PaymentCenterCartRecord, doc_id)
            if row is None:
                session.add(PaymentCenterCartRecord(**row_values))
            else:
                for key, value in row_values.items():
                    setattr(row, key, value)
            await session.commit()

        await self._mirror_upsert(normalized)
        return UpdateResult(matched_count=1, modified_count=1, upserted_id=None)

    async def update_many(
        self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False
    ) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if upsert:
                return await self.update_one(query, update, upsert=True)
            return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)

        updated_docs: List[Dict[str, Any]] = []
        for doc in docs:
            updated_docs.append(_normalize_for_storage(_apply_update_ops(doc, update)))

        async with self._session_factory() as session:
            for normalized in updated_docs:
                row_values = self._doc_to_row_values(normalized)
                doc_id = row_values["id"]
                row = await session.get(PaymentCenterCartRecord, doc_id)
                if row is None:
                    session.add(PaymentCenterCartRecord(**row_values))
                else:
                    for key, value in row_values.items():
                        setattr(row, key, value)
            await session.commit()

        for normalized in updated_docs:
            await self._mirror_upsert(normalized)

        return UpdateResult(
            matched_count=len(docs),
            modified_count=len(docs),
            upserted_id=None,
        )

    async def delete_one(self, query: Dict[str, Any]) -> DeleteResult:
        docs = await self._find_docs(query)
        if not docs:
            return DeleteResult(deleted_count=0)
        target_id = str(docs[0].get("_id"))

        async with self._session_factory() as session:
            await session.execute(
                delete(PaymentCenterCartRecord).where(PaymentCenterCartRecord.id == target_id)
            )
            await session.commit()

        await self._mirror_delete(target_id)
        return DeleteResult(deleted_count=1)


class RelationalPaymentReceiptsCollection(_BaseSqlCollection):
    _KNOWN_FIELDS = _PAYMENT_RECEIPT_KNOWN_FIELDS

    def __init__(self, core_store: CoreStore):
        session_factory = core_store.get_session_factory()
        if session_factory is None:
            raise ValueError(
                "RelationalPaymentReceiptsCollection requires PostgreSQL session factory"
            )
        super().__init__(session_factory)
        self._mirror_collection = core_store.payment_receipts

    def _row_to_doc(self, row: PaymentReceiptRecord) -> Dict[str, Any]:
        doc: Dict[str, Any] = dict(row.extra_data or {})
        doc["_id"] = _restore_id(row.id)
        doc["receipt_number"] = row.receipt_number
        doc["user_id"] = _restore_id(row.user_id) if row.user_id else None
        doc["payer_name"] = row.payer_name
        doc["payer_email"] = row.payer_email
        doc["total_amount"] = row.total_amount
        doc["payment_method"] = row.payment_method
        doc["status"] = row.status
        doc["items"] = row.items_json if isinstance(row.items_json, list) else []
        doc["created_at"] = row.created_at
        return doc

    def _doc_to_row_values(self, normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
        return _payment_receipt_doc_to_row_values(normalized_doc)

    async def _find_rows(self) -> List[PaymentReceiptRecord]:
        async with self._session_factory() as session:
            rows = await session.scalars(select(PaymentReceiptRecord))
            return list(rows.all())

    async def _find_docs(self, query: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows = await self._find_rows()
        docs: List[Dict[str, Any]] = []
        for row in rows:
            doc = self._row_to_doc(row)
            if _matches_query(doc, query):
                docs.append(doc)
        return docs

    async def _mirror_upsert(self, doc: Dict[str, Any]) -> None:
        if self._mirror_collection is None:
            return
        mirror_query = {"_id": _restore_id(str(doc.get("_id")))}
        mirror_payload = dict(doc)
        mirror_payload.pop("_id", None)
        try:
            await self._mirror_collection.update_one(
                mirror_query,
                {"$set": mirror_payload},
                upsert=True,
            )
        except Exception:
            pass

    async def _mirror_delete(self, doc_id: str) -> None:
        if self._mirror_collection is None:
            return
        try:
            await self._mirror_collection.delete_one({"_id": _restore_id(doc_id)})
        except Exception:
            pass

    async def insert_one(self, doc: Dict[str, Any]) -> InsertOneResult:
        raw_doc = dict(doc)
        raw_id = raw_doc.get("_id")
        doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
        raw_doc["_id"] = doc_id
        normalized = _normalize_for_storage(raw_doc)
        row_values = self._doc_to_row_values(normalized)

        async with self._session_factory() as session:
            exists = await session.get(PaymentReceiptRecord, doc_id)
            if exists is not None:
                raise ValueError(f"Duplicate key for payment_receipts._id={doc_id}")
            session.add(PaymentReceiptRecord(**row_values))
            await session.commit()

        await self._mirror_upsert(normalized)
        return InsertOneResult(inserted_id=_restore_id(doc_id))

    async def update_one(
        self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False
    ) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if not upsert:
                return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)
            base_doc = {}
            for key, value in (query or {}).items():
                if not key.startswith("$") and not isinstance(value, dict):
                    base_doc[key] = value
            new_doc = _apply_update_ops(base_doc, update)
            raw_id = new_doc.get("_id")
            doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
            new_doc["_id"] = doc_id
            normalized = _normalize_for_storage(new_doc)
            row_values = self._doc_to_row_values(normalized)
            async with self._session_factory() as session:
                session.add(PaymentReceiptRecord(**row_values))
                await session.commit()
            await self._mirror_upsert(normalized)
            return UpdateResult(
                matched_count=0, modified_count=1, upserted_id=_restore_id(doc_id)
            )

        target_doc = docs[0]
        updated_doc = _apply_update_ops(target_doc, update)
        normalized = _normalize_for_storage(updated_doc)
        row_values = self._doc_to_row_values(normalized)
        doc_id = row_values["id"]

        async with self._session_factory() as session:
            row = await session.get(PaymentReceiptRecord, doc_id)
            if row is None:
                session.add(PaymentReceiptRecord(**row_values))
            else:
                for key, value in row_values.items():
                    setattr(row, key, value)
            await session.commit()

        await self._mirror_upsert(normalized)
        return UpdateResult(matched_count=1, modified_count=1, upserted_id=None)

    async def update_many(
        self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False
    ) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if upsert:
                return await self.update_one(query, update, upsert=True)
            return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)

        updated_docs: List[Dict[str, Any]] = []
        for doc in docs:
            updated_docs.append(_normalize_for_storage(_apply_update_ops(doc, update)))

        async with self._session_factory() as session:
            for normalized in updated_docs:
                row_values = self._doc_to_row_values(normalized)
                doc_id = row_values["id"]
                row = await session.get(PaymentReceiptRecord, doc_id)
                if row is None:
                    session.add(PaymentReceiptRecord(**row_values))
                else:
                    for key, value in row_values.items():
                        setattr(row, key, value)
            await session.commit()

        for normalized in updated_docs:
            await self._mirror_upsert(normalized)

        return UpdateResult(
            matched_count=len(docs),
            modified_count=len(docs),
            upserted_id=None,
        )

    async def delete_one(self, query: Dict[str, Any]) -> DeleteResult:
        docs = await self._find_docs(query)
        if not docs:
            return DeleteResult(deleted_count=0)
        target_id = str(docs[0].get("_id"))

        async with self._session_factory() as session:
            await session.execute(
                delete(PaymentReceiptRecord).where(PaymentReceiptRecord.id == target_id)
            )
            await session.commit()

        await self._mirror_delete(target_id)
        return DeleteResult(deleted_count=1)


class RelationalBusBookingsCollection(_BaseSqlCollection):
    _KNOWN_FIELDS = _BUS_BOOKING_KNOWN_FIELDS

    def __init__(self, core_store: CoreStore):
        session_factory = core_store.get_session_factory()
        if session_factory is None:
            raise ValueError("RelationalBusBookingsCollection requires PostgreSQL session factory")
        super().__init__(session_factory)
        self._mirror_collection = core_store.bus_bookings

    def _row_to_doc(self, row: BusBookingRecord) -> Dict[str, Any]:
        doc: Dict[str, Any] = dict(row.extra_data or {})
        doc["_id"] = _restore_id(row.id)
        doc["booking_number"] = row.booking_number
        doc["trip_id"] = _restore_id(row.trip_id) if row.trip_id else None
        doc["student_id"] = _restore_id(row.student_id) if row.student_id else None
        doc["parent_id"] = _restore_id(row.parent_id) if row.parent_id else None
        doc["user_id"] = _restore_id(row.user_id) if row.user_id else None
        doc["drop_off_point"] = row.drop_off_point
        doc["drop_off_price"] = row.drop_off_price
        doc["seat_preference"] = row.seat_preference
        doc["assigned_seat"] = row.assigned_seat
        doc["status"] = row.status
        doc["payment_status"] = row.payment_status
        doc["pulang_bermalam_id"] = (
            _restore_id(row.pulang_bermalam_id) if row.pulang_bermalam_id else None
        )
        doc["pulang_bermalam_approved"] = row.pulang_bermalam_approved
        doc["passengers"] = row.passengers
        doc["total_price"] = row.total_price
        doc["receipt_number"] = row.receipt_number
        doc["created_at"] = row.created_at
        doc["updated_at"] = row.updated_at
        doc["cancelled_at"] = row.cancelled_at
        doc["cancellation_reason"] = row.cancellation_reason
        doc["notes"] = row.notes
        return doc

    def _doc_to_row_values(self, normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
        return _bus_booking_doc_to_row_values(normalized_doc)

    async def _find_rows(self) -> List[BusBookingRecord]:
        async with self._session_factory() as session:
            rows = await session.scalars(select(BusBookingRecord))
            return list(rows.all())

    async def _find_docs(self, query: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows = await self._find_rows()
        docs: List[Dict[str, Any]] = []
        for row in rows:
            doc = self._row_to_doc(row)
            if _matches_query(doc, query):
                docs.append(doc)
        return docs

    async def _mirror_upsert(self, doc: Dict[str, Any]) -> None:
        if self._mirror_collection is None:
            return
        mirror_query = {"_id": _restore_id(str(doc.get("_id")))}
        mirror_payload = dict(doc)
        mirror_payload.pop("_id", None)
        try:
            await self._mirror_collection.update_one(
                mirror_query,
                {"$set": mirror_payload},
                upsert=True,
            )
        except Exception:
            pass

    async def _mirror_delete(self, doc_id: str) -> None:
        if self._mirror_collection is None:
            return
        try:
            await self._mirror_collection.delete_one({"_id": _restore_id(doc_id)})
        except Exception:
            pass

    async def insert_one(self, doc: Dict[str, Any]) -> InsertOneResult:
        raw_doc = dict(doc)
        raw_id = raw_doc.get("_id")
        doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
        raw_doc["_id"] = doc_id
        normalized = _normalize_for_storage(raw_doc)
        row_values = self._doc_to_row_values(normalized)

        async with self._session_factory() as session:
            exists = await session.get(BusBookingRecord, doc_id)
            if exists is not None:
                raise ValueError(f"Duplicate key for bus_bookings._id={doc_id}")
            session.add(BusBookingRecord(**row_values))
            await session.commit()

        await self._mirror_upsert(normalized)
        return InsertOneResult(inserted_id=_restore_id(doc_id))

    async def update_one(
        self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False
    ) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if not upsert:
                return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)
            base_doc = {}
            for key, value in (query or {}).items():
                if not key.startswith("$") and not isinstance(value, dict):
                    base_doc[key] = value
            new_doc = _apply_update_ops(base_doc, update)
            raw_id = new_doc.get("_id")
            doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
            new_doc["_id"] = doc_id
            normalized = _normalize_for_storage(new_doc)
            row_values = self._doc_to_row_values(normalized)
            async with self._session_factory() as session:
                session.add(BusBookingRecord(**row_values))
                await session.commit()
            await self._mirror_upsert(normalized)
            return UpdateResult(
                matched_count=0, modified_count=1, upserted_id=_restore_id(doc_id)
            )

        target_doc = docs[0]
        updated_doc = _apply_update_ops(target_doc, update)
        normalized = _normalize_for_storage(updated_doc)
        row_values = self._doc_to_row_values(normalized)
        doc_id = row_values["id"]

        async with self._session_factory() as session:
            row = await session.get(BusBookingRecord, doc_id)
            if row is None:
                session.add(BusBookingRecord(**row_values))
            else:
                for key, value in row_values.items():
                    setattr(row, key, value)
            await session.commit()

        await self._mirror_upsert(normalized)
        return UpdateResult(matched_count=1, modified_count=1, upserted_id=None)

    async def update_many(
        self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False
    ) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if upsert:
                return await self.update_one(query, update, upsert=True)
            return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)

        updated_docs: List[Dict[str, Any]] = []
        for doc in docs:
            updated_docs.append(_normalize_for_storage(_apply_update_ops(doc, update)))

        async with self._session_factory() as session:
            for normalized in updated_docs:
                row_values = self._doc_to_row_values(normalized)
                doc_id = row_values["id"]
                row = await session.get(BusBookingRecord, doc_id)
                if row is None:
                    session.add(BusBookingRecord(**row_values))
                else:
                    for key, value in row_values.items():
                        setattr(row, key, value)
            await session.commit()

        for normalized in updated_docs:
            await self._mirror_upsert(normalized)

        return UpdateResult(
            matched_count=len(docs),
            modified_count=len(docs),
            upserted_id=None,
        )

    async def delete_one(self, query: Dict[str, Any]) -> DeleteResult:
        docs = await self._find_docs(query)
        if not docs:
            return DeleteResult(deleted_count=0)
        target_id = str(docs[0].get("_id"))

        async with self._session_factory() as session:
            await session.execute(delete(BusBookingRecord).where(BusBookingRecord.id == target_id))
            await session.commit()

        await self._mirror_delete(target_id)
        return DeleteResult(deleted_count=1)


class RelationalBusTripsCollection(_BaseSqlCollection):
    _KNOWN_FIELDS = _BUS_TRIP_KNOWN_FIELDS

    def __init__(self, core_store: CoreStore):
        session_factory = core_store.get_session_factory()
        if session_factory is None:
            raise ValueError("RelationalBusTripsCollection requires PostgreSQL session factory")
        super().__init__(session_factory)
        self._mirror_collection = core_store.bus_trips

    def _row_to_doc(self, row: BusTripRecord) -> Dict[str, Any]:
        doc: Dict[str, Any] = dict(row.extra_data or {})
        doc["_id"] = _restore_id(row.id)
        doc["route_id"] = _restore_id(row.route_id) if row.route_id else None
        doc["bus_id"] = _restore_id(row.bus_id) if row.bus_id else None
        doc["departure_date"] = row.departure_date
        doc["departure_time"] = row.departure_time
        doc["return_date"] = row.return_date
        doc["return_time"] = row.return_time
        doc["available_seats"] = row.available_seats
        doc["status"] = row.status
        doc["notes"] = row.notes
        doc["created_by"] = row.created_by
        doc["created_at"] = row.created_at
        doc["updated_at"] = row.updated_at
        doc["cancelled_at"] = row.cancelled_at
        doc["cancellation_reason"] = row.cancellation_reason
        return doc

    def _doc_to_row_values(self, normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
        return _bus_trip_doc_to_row_values(normalized_doc)

    async def _find_rows(self) -> List[BusTripRecord]:
        async with self._session_factory() as session:
            rows = await session.scalars(select(BusTripRecord))
            return list(rows.all())

    async def _find_docs(self, query: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows = await self._find_rows()
        docs: List[Dict[str, Any]] = []
        for row in rows:
            doc = self._row_to_doc(row)
            if _matches_query(doc, query):
                docs.append(doc)
        return docs

    async def _mirror_upsert(self, doc: Dict[str, Any]) -> None:
        if self._mirror_collection is None:
            return
        mirror_query = {"_id": _restore_id(str(doc.get("_id")))}
        mirror_payload = dict(doc)
        mirror_payload.pop("_id", None)
        try:
            await self._mirror_collection.update_one(
                mirror_query,
                {"$set": mirror_payload},
                upsert=True,
            )
        except Exception:
            pass

    async def _mirror_delete(self, doc_id: str) -> None:
        if self._mirror_collection is None:
            return
        try:
            await self._mirror_collection.delete_one({"_id": _restore_id(doc_id)})
        except Exception:
            pass

    async def insert_one(self, doc: Dict[str, Any]) -> InsertOneResult:
        raw_doc = dict(doc)
        raw_id = raw_doc.get("_id")
        doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
        raw_doc["_id"] = doc_id
        normalized = _normalize_for_storage(raw_doc)
        row_values = self._doc_to_row_values(normalized)

        async with self._session_factory() as session:
            exists = await session.get(BusTripRecord, doc_id)
            if exists is not None:
                raise ValueError(f"Duplicate key for bus_trips._id={doc_id}")
            session.add(BusTripRecord(**row_values))
            await session.commit()

        await self._mirror_upsert(normalized)
        return InsertOneResult(inserted_id=_restore_id(doc_id))

    async def update_one(
        self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False
    ) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if not upsert:
                return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)
            base_doc = {}
            for key, value in (query or {}).items():
                if not key.startswith("$") and not isinstance(value, dict):
                    base_doc[key] = value
            new_doc = _apply_update_ops(base_doc, update)
            raw_id = new_doc.get("_id")
            doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
            new_doc["_id"] = doc_id
            normalized = _normalize_for_storage(new_doc)
            row_values = self._doc_to_row_values(normalized)
            async with self._session_factory() as session:
                session.add(BusTripRecord(**row_values))
                await session.commit()
            await self._mirror_upsert(normalized)
            return UpdateResult(
                matched_count=0, modified_count=1, upserted_id=_restore_id(doc_id)
            )

        target_doc = docs[0]
        updated_doc = _apply_update_ops(target_doc, update)
        normalized = _normalize_for_storage(updated_doc)
        row_values = self._doc_to_row_values(normalized)
        doc_id = row_values["id"]

        async with self._session_factory() as session:
            row = await session.get(BusTripRecord, doc_id)
            if row is None:
                session.add(BusTripRecord(**row_values))
            else:
                for key, value in row_values.items():
                    setattr(row, key, value)
            await session.commit()

        await self._mirror_upsert(normalized)
        return UpdateResult(matched_count=1, modified_count=1, upserted_id=None)

    async def update_many(
        self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False
    ) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if upsert:
                return await self.update_one(query, update, upsert=True)
            return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)

        updated_docs: List[Dict[str, Any]] = []
        for doc in docs:
            updated_docs.append(_normalize_for_storage(_apply_update_ops(doc, update)))

        async with self._session_factory() as session:
            for normalized in updated_docs:
                row_values = self._doc_to_row_values(normalized)
                doc_id = row_values["id"]
                row = await session.get(BusTripRecord, doc_id)
                if row is None:
                    session.add(BusTripRecord(**row_values))
                else:
                    for key, value in row_values.items():
                        setattr(row, key, value)
            await session.commit()

        for normalized in updated_docs:
            await self._mirror_upsert(normalized)

        return UpdateResult(
            matched_count=len(docs),
            modified_count=len(docs),
            upserted_id=None,
        )

    async def delete_one(self, query: Dict[str, Any]) -> DeleteResult:
        docs = await self._find_docs(query)
        if not docs:
            return DeleteResult(deleted_count=0)
        target_id = str(docs[0].get("_id"))

        async with self._session_factory() as session:
            await session.execute(delete(BusTripRecord).where(BusTripRecord.id == target_id))
            await session.commit()

        await self._mirror_delete(target_id)
        return DeleteResult(deleted_count=1)


class RelationalBusRoutesCollection(_BaseSqlCollection):
    _KNOWN_FIELDS = _BUS_ROUTE_KNOWN_FIELDS

    def __init__(self, core_store: CoreStore):
        session_factory = core_store.get_session_factory()
        if session_factory is None:
            raise ValueError("RelationalBusRoutesCollection requires PostgreSQL session factory")
        super().__init__(session_factory)
        self._mirror_collection = core_store.bus_routes

    def _row_to_doc(self, row: BusRouteRecord) -> Dict[str, Any]:
        doc: Dict[str, Any] = dict(row.extra_data or {})
        doc["_id"] = _restore_id(row.id)
        doc["company_id"] = _restore_id(row.company_id) if row.company_id else None
        doc["name"] = row.name
        doc["origin"] = row.origin
        doc["destination"] = row.destination
        doc["pickup_locations"] = (
            row.pickup_locations_json if isinstance(row.pickup_locations_json, list) else []
        )
        doc["drop_off_points"] = (
            row.drop_off_points_json if isinstance(row.drop_off_points_json, list) else []
        )
        doc["base_price"] = row.base_price
        doc["estimated_duration"] = row.estimated_duration
        doc["distance_km"] = row.distance_km
        doc["trip_type"] = row.trip_type
        doc["return_route_id"] = _restore_id(row.return_route_id) if row.return_route_id else None
        doc["is_active"] = row.is_active
        doc["created_by"] = row.created_by
        doc["created_at"] = row.created_at
        doc["updated_at"] = row.updated_at
        doc["notes"] = row.notes
        return doc

    def _doc_to_row_values(self, normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
        return _bus_route_doc_to_row_values(normalized_doc)

    async def _find_rows(self) -> List[BusRouteRecord]:
        async with self._session_factory() as session:
            rows = await session.scalars(select(BusRouteRecord))
            return list(rows.all())

    async def _find_docs(self, query: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows = await self._find_rows()
        docs: List[Dict[str, Any]] = []
        for row in rows:
            doc = self._row_to_doc(row)
            if _matches_query(doc, query):
                docs.append(doc)
        return docs

    async def _mirror_upsert(self, doc: Dict[str, Any]) -> None:
        if self._mirror_collection is None:
            return
        mirror_query = {"_id": _restore_id(str(doc.get("_id")))}
        mirror_payload = dict(doc)
        mirror_payload.pop("_id", None)
        try:
            await self._mirror_collection.update_one(
                mirror_query,
                {"$set": mirror_payload},
                upsert=True,
            )
        except Exception:
            pass

    async def _mirror_delete(self, doc_id: str) -> None:
        if self._mirror_collection is None:
            return
        try:
            await self._mirror_collection.delete_one({"_id": _restore_id(doc_id)})
        except Exception:
            pass

    async def insert_one(self, doc: Dict[str, Any]) -> InsertOneResult:
        raw_doc = dict(doc)
        raw_id = raw_doc.get("_id")
        doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
        raw_doc["_id"] = doc_id
        normalized = _normalize_for_storage(raw_doc)
        row_values = self._doc_to_row_values(normalized)

        async with self._session_factory() as session:
            exists = await session.get(BusRouteRecord, doc_id)
            if exists is not None:
                raise ValueError(f"Duplicate key for bus_routes._id={doc_id}")
            session.add(BusRouteRecord(**row_values))
            await session.commit()

        await self._mirror_upsert(normalized)
        return InsertOneResult(inserted_id=_restore_id(doc_id))

    async def update_one(
        self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False
    ) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if not upsert:
                return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)
            base_doc = {}
            for key, value in (query or {}).items():
                if not key.startswith("$") and not isinstance(value, dict):
                    base_doc[key] = value
            new_doc = _apply_update_ops(base_doc, update)
            raw_id = new_doc.get("_id")
            doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
            new_doc["_id"] = doc_id
            normalized = _normalize_for_storage(new_doc)
            row_values = self._doc_to_row_values(normalized)
            async with self._session_factory() as session:
                session.add(BusRouteRecord(**row_values))
                await session.commit()
            await self._mirror_upsert(normalized)
            return UpdateResult(
                matched_count=0, modified_count=1, upserted_id=_restore_id(doc_id)
            )

        target_doc = docs[0]
        updated_doc = _apply_update_ops(target_doc, update)
        normalized = _normalize_for_storage(updated_doc)
        row_values = self._doc_to_row_values(normalized)
        doc_id = row_values["id"]

        async with self._session_factory() as session:
            row = await session.get(BusRouteRecord, doc_id)
            if row is None:
                session.add(BusRouteRecord(**row_values))
            else:
                for key, value in row_values.items():
                    setattr(row, key, value)
            await session.commit()

        await self._mirror_upsert(normalized)
        return UpdateResult(matched_count=1, modified_count=1, upserted_id=None)

    async def update_many(
        self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False
    ) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if upsert:
                return await self.update_one(query, update, upsert=True)
            return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)

        updated_docs: List[Dict[str, Any]] = []
        for doc in docs:
            updated_docs.append(_normalize_for_storage(_apply_update_ops(doc, update)))

        async with self._session_factory() as session:
            for normalized in updated_docs:
                row_values = self._doc_to_row_values(normalized)
                doc_id = row_values["id"]
                row = await session.get(BusRouteRecord, doc_id)
                if row is None:
                    session.add(BusRouteRecord(**row_values))
                else:
                    for key, value in row_values.items():
                        setattr(row, key, value)
            await session.commit()

        for normalized in updated_docs:
            await self._mirror_upsert(normalized)

        return UpdateResult(
            matched_count=len(docs),
            modified_count=len(docs),
            upserted_id=None,
        )

    async def delete_one(self, query: Dict[str, Any]) -> DeleteResult:
        docs = await self._find_docs(query)
        if not docs:
            return DeleteResult(deleted_count=0)
        target_id = str(docs[0].get("_id"))

        async with self._session_factory() as session:
            await session.execute(delete(BusRouteRecord).where(BusRouteRecord.id == target_id))
            await session.commit()

        await self._mirror_delete(target_id)
        return DeleteResult(deleted_count=1)


class RelationalBusCompaniesCollection(_BaseSqlCollection):
    _KNOWN_FIELDS = _BUS_COMPANY_KNOWN_FIELDS

    def __init__(self, core_store: CoreStore):
        session_factory = core_store.get_session_factory()
        if session_factory is None:
            raise ValueError("RelationalBusCompaniesCollection requires PostgreSQL session factory")
        super().__init__(session_factory)
        self._mirror_collection = core_store.bus_companies

    def _row_to_doc(self, row: BusCompanyRecord) -> Dict[str, Any]:
        doc: Dict[str, Any] = dict(row.extra_data or {})
        doc["_id"] = _restore_id(row.id)
        doc["name"] = row.name
        doc["registration_number"] = row.registration_number
        doc["entity_type"] = row.entity_type
        doc["address"] = row.address
        doc["postcode"] = row.postcode
        doc["city"] = row.city
        doc["state"] = row.state
        doc["director_name"] = row.director_name
        doc["director_ic_passport"] = row.director_ic_passport
        doc["phone"] = row.phone
        doc["email"] = row.email
        doc["pic_name"] = row.pic_name
        doc["pic_phone"] = row.pic_phone
        doc["apad_license_no"] = row.apad_license_no
        doc["apad_expiry_date"] = row.apad_expiry_date
        doc["apad_document_url"] = row.apad_document_url
        doc["license_image_url"] = row.license_image_url
        doc["permit_image_url"] = row.permit_image_url
        doc["is_active"] = row.is_active
        doc["is_verified"] = row.is_verified
        doc["application_status"] = row.application_status
        doc["submitted_at"] = row.submitted_at
        doc["reviewed_by"] = row.reviewed_by
        doc["approved_at"] = row.approved_at
        doc["officer_notes"] = row.officer_notes
        doc["created_by"] = row.created_by
        doc["created_at"] = row.created_at
        doc["verified_at"] = row.verified_at
        doc["verified_by"] = row.verified_by
        doc["updated_at"] = row.updated_at
        return doc

    def _doc_to_row_values(self, normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
        return _bus_company_doc_to_row_values(normalized_doc)

    async def _find_rows(self) -> List[BusCompanyRecord]:
        async with self._session_factory() as session:
            rows = await session.scalars(select(BusCompanyRecord))
            return list(rows.all())

    async def _find_docs(self, query: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows = await self._find_rows()
        docs: List[Dict[str, Any]] = []
        for row in rows:
            doc = self._row_to_doc(row)
            if _matches_query(doc, query):
                docs.append(doc)
        return docs

    async def _mirror_upsert(self, doc: Dict[str, Any]) -> None:
        if self._mirror_collection is None:
            return
        mirror_query = {"_id": _restore_id(str(doc.get("_id")))}
        mirror_payload = dict(doc)
        mirror_payload.pop("_id", None)
        try:
            await self._mirror_collection.update_one(
                mirror_query,
                {"$set": mirror_payload},
                upsert=True,
            )
        except Exception:
            pass

    async def _mirror_delete(self, doc_id: str) -> None:
        if self._mirror_collection is None:
            return
        try:
            await self._mirror_collection.delete_one({"_id": _restore_id(doc_id)})
        except Exception:
            pass

    async def insert_one(self, doc: Dict[str, Any]) -> InsertOneResult:
        raw_doc = dict(doc)
        raw_id = raw_doc.get("_id")
        doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
        raw_doc["_id"] = doc_id
        normalized = _normalize_for_storage(raw_doc)
        row_values = self._doc_to_row_values(normalized)

        async with self._session_factory() as session:
            exists = await session.get(BusCompanyRecord, doc_id)
            if exists is not None:
                raise ValueError(f"Duplicate key for bus_companies._id={doc_id}")
            session.add(BusCompanyRecord(**row_values))
            await session.commit()

        await self._mirror_upsert(normalized)
        return InsertOneResult(inserted_id=_restore_id(doc_id))

    async def update_one(
        self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False
    ) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if not upsert:
                return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)
            base_doc = {}
            for key, value in (query or {}).items():
                if not key.startswith("$") and not isinstance(value, dict):
                    base_doc[key] = value
            new_doc = _apply_update_ops(base_doc, update)
            raw_id = new_doc.get("_id")
            doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
            new_doc["_id"] = doc_id
            normalized = _normalize_for_storage(new_doc)
            row_values = self._doc_to_row_values(normalized)
            async with self._session_factory() as session:
                session.add(BusCompanyRecord(**row_values))
                await session.commit()
            await self._mirror_upsert(normalized)
            return UpdateResult(
                matched_count=0, modified_count=1, upserted_id=_restore_id(doc_id)
            )

        target_doc = docs[0]
        updated_doc = _apply_update_ops(target_doc, update)
        normalized = _normalize_for_storage(updated_doc)
        row_values = self._doc_to_row_values(normalized)
        doc_id = row_values["id"]

        async with self._session_factory() as session:
            row = await session.get(BusCompanyRecord, doc_id)
            if row is None:
                session.add(BusCompanyRecord(**row_values))
            else:
                for key, value in row_values.items():
                    setattr(row, key, value)
            await session.commit()

        await self._mirror_upsert(normalized)
        return UpdateResult(matched_count=1, modified_count=1, upserted_id=None)

    async def update_many(
        self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False
    ) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if upsert:
                return await self.update_one(query, update, upsert=True)
            return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)

        updated_docs: List[Dict[str, Any]] = []
        for doc in docs:
            updated_docs.append(_normalize_for_storage(_apply_update_ops(doc, update)))

        async with self._session_factory() as session:
            for normalized in updated_docs:
                row_values = self._doc_to_row_values(normalized)
                doc_id = row_values["id"]
                row = await session.get(BusCompanyRecord, doc_id)
                if row is None:
                    session.add(BusCompanyRecord(**row_values))
                else:
                    for key, value in row_values.items():
                        setattr(row, key, value)
            await session.commit()

        for normalized in updated_docs:
            await self._mirror_upsert(normalized)

        return UpdateResult(
            matched_count=len(docs),
            modified_count=len(docs),
            upserted_id=None,
        )

    async def delete_one(self, query: Dict[str, Any]) -> DeleteResult:
        docs = await self._find_docs(query)
        if not docs:
            return DeleteResult(deleted_count=0)
        target_id = str(docs[0].get("_id"))

        async with self._session_factory() as session:
            await session.execute(
                delete(BusCompanyRecord).where(BusCompanyRecord.id == target_id)
            )
            await session.commit()

        await self._mirror_delete(target_id)
        return DeleteResult(deleted_count=1)


class RelationalBusesCollection(_BaseSqlCollection):
    _KNOWN_FIELDS = _BUS_KNOWN_FIELDS

    def __init__(self, core_store: CoreStore):
        session_factory = core_store.get_session_factory()
        if session_factory is None:
            raise ValueError("RelationalBusesCollection requires PostgreSQL session factory")
        super().__init__(session_factory)
        self._mirror_collection = core_store.buses

    def _row_to_doc(self, row: BusRecord) -> Dict[str, Any]:
        doc: Dict[str, Any] = dict(row.extra_data or {})
        doc["_id"] = _restore_id(row.id)
        doc["company_id"] = _restore_id(row.company_id) if row.company_id else None
        doc["plate_number"] = row.plate_number
        doc["bus_type"] = row.bus_type
        doc["total_seats"] = row.total_seats
        doc["brand"] = row.brand
        doc["model"] = row.model
        doc["year"] = row.year
        doc["amenities"] = row.amenities_json if isinstance(row.amenities_json, list) else []
        doc["chassis_no"] = row.chassis_no
        doc["engine_no"] = row.engine_no
        doc["year_manufactured"] = row.year_manufactured
        doc["bus_category"] = row.bus_category
        doc["color"] = row.color
        doc["ownership_status"] = row.ownership_status
        doc["operation_start_date"] = row.operation_start_date
        doc["permit_no"] = row.permit_no
        doc["permit_expiry"] = row.permit_expiry
        doc["permit_document_url"] = row.permit_document_url
        doc["puspakom_date"] = row.puspakom_date
        doc["puspakom_result"] = row.puspakom_result
        doc["puspakom_document_url"] = row.puspakom_document_url
        doc["insurance_company"] = row.insurance_company
        doc["insurance_expiry"] = row.insurance_expiry
        doc["insurance_document_url"] = row.insurance_document_url
        doc["geran_document_url"] = row.geran_document_url
        doc["is_active"] = row.is_active
        doc["created_by"] = row.created_by
        doc["created_at"] = row.created_at
        doc["updated_at"] = row.updated_at
        return doc

    def _doc_to_row_values(self, normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
        return _bus_doc_to_row_values(normalized_doc)

    async def _find_rows(self) -> List[BusRecord]:
        async with self._session_factory() as session:
            rows = await session.scalars(select(BusRecord))
            return list(rows.all())

    async def _find_docs(self, query: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows = await self._find_rows()
        docs: List[Dict[str, Any]] = []
        for row in rows:
            doc = self._row_to_doc(row)
            if _matches_query(doc, query):
                docs.append(doc)
        return docs

    async def _mirror_upsert(self, doc: Dict[str, Any]) -> None:
        if self._mirror_collection is None:
            return
        mirror_query = {"_id": _restore_id(str(doc.get("_id")))}
        mirror_payload = dict(doc)
        mirror_payload.pop("_id", None)
        try:
            await self._mirror_collection.update_one(
                mirror_query,
                {"$set": mirror_payload},
                upsert=True,
            )
        except Exception:
            pass

    async def _mirror_delete(self, doc_id: str) -> None:
        if self._mirror_collection is None:
            return
        try:
            await self._mirror_collection.delete_one({"_id": _restore_id(doc_id)})
        except Exception:
            pass

    async def insert_one(self, doc: Dict[str, Any]) -> InsertOneResult:
        raw_doc = dict(doc)
        raw_id = raw_doc.get("_id")
        doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
        raw_doc["_id"] = doc_id
        normalized = _normalize_for_storage(raw_doc)
        row_values = self._doc_to_row_values(normalized)

        async with self._session_factory() as session:
            exists = await session.get(BusRecord, doc_id)
            if exists is not None:
                raise ValueError(f"Duplicate key for buses._id={doc_id}")
            session.add(BusRecord(**row_values))
            await session.commit()

        await self._mirror_upsert(normalized)
        return InsertOneResult(inserted_id=_restore_id(doc_id))

    async def update_one(
        self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False
    ) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if not upsert:
                return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)
            base_doc = {}
            for key, value in (query or {}).items():
                if not key.startswith("$") and not isinstance(value, dict):
                    base_doc[key] = value
            new_doc = _apply_update_ops(base_doc, update)
            raw_id = new_doc.get("_id")
            doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
            new_doc["_id"] = doc_id
            normalized = _normalize_for_storage(new_doc)
            row_values = self._doc_to_row_values(normalized)
            async with self._session_factory() as session:
                session.add(BusRecord(**row_values))
                await session.commit()
            await self._mirror_upsert(normalized)
            return UpdateResult(
                matched_count=0, modified_count=1, upserted_id=_restore_id(doc_id)
            )

        target_doc = docs[0]
        updated_doc = _apply_update_ops(target_doc, update)
        normalized = _normalize_for_storage(updated_doc)
        row_values = self._doc_to_row_values(normalized)
        doc_id = row_values["id"]

        async with self._session_factory() as session:
            row = await session.get(BusRecord, doc_id)
            if row is None:
                session.add(BusRecord(**row_values))
            else:
                for key, value in row_values.items():
                    setattr(row, key, value)
            await session.commit()

        await self._mirror_upsert(normalized)
        return UpdateResult(matched_count=1, modified_count=1, upserted_id=None)

    async def update_many(
        self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False
    ) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if upsert:
                return await self.update_one(query, update, upsert=True)
            return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)

        updated_docs: List[Dict[str, Any]] = []
        for doc in docs:
            updated_docs.append(_normalize_for_storage(_apply_update_ops(doc, update)))

        async with self._session_factory() as session:
            for normalized in updated_docs:
                row_values = self._doc_to_row_values(normalized)
                doc_id = row_values["id"]
                row = await session.get(BusRecord, doc_id)
                if row is None:
                    session.add(BusRecord(**row_values))
                else:
                    for key, value in row_values.items():
                        setattr(row, key, value)
            await session.commit()

        for normalized in updated_docs:
            await self._mirror_upsert(normalized)

        return UpdateResult(
            matched_count=len(docs),
            modified_count=len(docs),
            upserted_id=None,
        )

    async def delete_one(self, query: Dict[str, Any]) -> DeleteResult:
        docs = await self._find_docs(query)
        if not docs:
            return DeleteResult(deleted_count=0)
        target_id = str(docs[0].get("_id"))

        async with self._session_factory() as session:
            await session.execute(delete(BusRecord).where(BusRecord.id == target_id))
            await session.commit()

        await self._mirror_delete(target_id)
        return DeleteResult(deleted_count=1)


class RelationalBusLiveLocationsCollection(_BaseSqlCollection):
    _KNOWN_FIELDS = _BUS_LIVE_LOCATION_KNOWN_FIELDS

    def __init__(self, core_store: CoreStore):
        session_factory = core_store.get_session_factory()
        if session_factory is None:
            raise ValueError(
                "RelationalBusLiveLocationsCollection requires PostgreSQL session factory"
            )
        super().__init__(session_factory)
        self._mirror_collection = core_store.bus_live_locations

    def _row_to_doc(self, row: BusLiveLocationRecord) -> Dict[str, Any]:
        doc: Dict[str, Any] = dict(row.extra_data or {})
        doc["_id"] = _restore_id(row.id)
        doc["trip_id"] = _restore_id(row.trip_id) if row.trip_id else None
        doc["bus_id"] = _restore_id(row.bus_id) if row.bus_id else None
        doc["plate_number"] = row.plate_number
        doc["lat"] = row.lat
        doc["lng"] = row.lng
        doc["updated_at"] = row.updated_at
        return doc

    def _doc_to_row_values(self, normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
        return _bus_live_location_doc_to_row_values(normalized_doc)

    async def _find_rows(self) -> List[BusLiveLocationRecord]:
        async with self._session_factory() as session:
            rows = await session.scalars(select(BusLiveLocationRecord))
            return list(rows.all())

    async def _find_docs(self, query: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows = await self._find_rows()
        docs: List[Dict[str, Any]] = []
        for row in rows:
            doc = self._row_to_doc(row)
            if _matches_query(doc, query):
                docs.append(doc)
        return docs

    async def _mirror_upsert(self, doc: Dict[str, Any]) -> None:
        if self._mirror_collection is None:
            return
        mirror_query = {"_id": _restore_id(str(doc.get("_id")))}
        mirror_payload = dict(doc)
        mirror_payload.pop("_id", None)
        try:
            await self._mirror_collection.update_one(
                mirror_query,
                {"$set": mirror_payload},
                upsert=True,
            )
        except Exception:
            pass

    async def _mirror_delete(self, doc_id: str) -> None:
        if self._mirror_collection is None:
            return
        try:
            await self._mirror_collection.delete_one({"_id": _restore_id(doc_id)})
        except Exception:
            pass

    async def insert_one(self, doc: Dict[str, Any]) -> InsertOneResult:
        raw_doc = dict(doc)
        raw_id = raw_doc.get("_id")
        doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
        raw_doc["_id"] = doc_id
        normalized = _normalize_for_storage(raw_doc)
        row_values = self._doc_to_row_values(normalized)

        async with self._session_factory() as session:
            exists = await session.get(BusLiveLocationRecord, doc_id)
            if exists is not None:
                raise ValueError(f"Duplicate key for bus_live_locations._id={doc_id}")
            session.add(BusLiveLocationRecord(**row_values))
            await session.commit()

        await self._mirror_upsert(normalized)
        return InsertOneResult(inserted_id=_restore_id(doc_id))

    async def update_one(
        self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False
    ) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if not upsert:
                return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)
            base_doc = {}
            for key, value in (query or {}).items():
                if not key.startswith("$") and not isinstance(value, dict):
                    base_doc[key] = value
            new_doc = _apply_update_ops(base_doc, update)
            raw_id = new_doc.get("_id")
            doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
            new_doc["_id"] = doc_id
            normalized = _normalize_for_storage(new_doc)
            row_values = self._doc_to_row_values(normalized)
            async with self._session_factory() as session:
                session.add(BusLiveLocationRecord(**row_values))
                await session.commit()
            await self._mirror_upsert(normalized)
            return UpdateResult(
                matched_count=0, modified_count=1, upserted_id=_restore_id(doc_id)
            )

        target_doc = docs[0]
        updated_doc = _apply_update_ops(target_doc, update)
        normalized = _normalize_for_storage(updated_doc)
        row_values = self._doc_to_row_values(normalized)
        doc_id = row_values["id"]

        async with self._session_factory() as session:
            row = await session.get(BusLiveLocationRecord, doc_id)
            if row is None:
                session.add(BusLiveLocationRecord(**row_values))
            else:
                for key, value in row_values.items():
                    setattr(row, key, value)
            await session.commit()

        await self._mirror_upsert(normalized)
        return UpdateResult(matched_count=1, modified_count=1, upserted_id=None)

    async def update_many(
        self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False
    ) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if upsert:
                return await self.update_one(query, update, upsert=True)
            return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)

        updated_docs: List[Dict[str, Any]] = []
        for doc in docs:
            updated_docs.append(_normalize_for_storage(_apply_update_ops(doc, update)))

        async with self._session_factory() as session:
            for normalized in updated_docs:
                row_values = self._doc_to_row_values(normalized)
                doc_id = row_values["id"]
                row = await session.get(BusLiveLocationRecord, doc_id)
                if row is None:
                    session.add(BusLiveLocationRecord(**row_values))
                else:
                    for key, value in row_values.items():
                        setattr(row, key, value)
            await session.commit()

        for normalized in updated_docs:
            await self._mirror_upsert(normalized)

        return UpdateResult(
            matched_count=len(docs),
            modified_count=len(docs),
            upserted_id=None,
        )

    async def delete_one(self, query: Dict[str, Any]) -> DeleteResult:
        docs = await self._find_docs(query)
        if not docs:
            return DeleteResult(deleted_count=0)
        target_id = str(docs[0].get("_id"))

        async with self._session_factory() as session:
            await session.execute(
                delete(BusLiveLocationRecord).where(BusLiveLocationRecord.id == target_id)
            )
            await session.commit()

        await self._mirror_delete(target_id)
        return DeleteResult(deleted_count=1)


def _extract_core_store(db) -> Optional[CoreStore]:
    if isinstance(db, CoreStore):
        return db
    raw_getter = getattr(db, "get_raw_db", None)
    if callable(raw_getter):
        try:
            raw_db = raw_getter()
            if isinstance(raw_db, CoreStore):
                return raw_db
        except Exception:
            return None
    return None


class NotificationsRelationalDbAdapter:
    """
    Adapter for notification domain collections:
    - notifications -> typed relational table (with compatibility mirror)
    - announcements -> typed relational table (with compatibility mirror)
    - push_subscriptions -> typed relational table (with compatibility mirror)
    - push_logs -> typed relational table (with compatibility mirror)
    - email_logs -> typed relational table (with compatibility mirror)
    - email_templates -> typed relational table (with compatibility mirror)
    - payment_reminders -> typed relational table (with compatibility mirror)
    - payment_reminder_preferences -> typed relational table (with compatibility mirror)
    - payment_center_cart -> typed relational table (with compatibility mirror)
    - payment_receipts -> typed relational table (with compatibility mirror)
    - bus_bookings -> typed relational table (with compatibility mirror)
    - bus_trips -> typed relational table (with compatibility mirror)
    - bus_routes -> typed relational table (with compatibility mirror)
    - bus_companies -> typed relational table (with compatibility mirror)
    - buses -> typed relational table (with compatibility mirror)
    - bus_live_locations -> typed relational table (with compatibility mirror)
    - other collections -> delegated to wrapped db object
    """

    def __init__(self, db):
        self._db = db
        self._core_store = _extract_core_store(db)
        self._notifications_collection = None
        self._announcements_collection = None
        self._push_subscriptions_collection = None
        self._push_logs_collection = None
        self._email_logs_collection = None
        self._email_templates_collection = None
        self._payment_reminders_collection = None
        self._payment_reminder_preferences_collection = None
        self._payment_center_cart_collection = None
        self._payment_receipts_collection = None
        self._bus_bookings_collection = None
        self._bus_trips_collection = None
        self._bus_routes_collection = None
        self._bus_companies_collection = None
        self._buses_collection = None
        self._bus_live_locations_collection = None

        if self._core_store is not None:
            session_factory = self._core_store.get_session_factory()
            notifications_domain_enabled = self._core_store.uses_postgres("notifications")
            if session_factory is not None and notifications_domain_enabled:
                self._notifications_collection = RelationalNotificationsCollection(self._core_store)
                self._announcements_collection = RelationalAnnouncementsCollection(self._core_store)
                self._push_subscriptions_collection = RelationalPushSubscriptionsCollection(self._core_store)
                self._push_logs_collection = RelationalPushLogsCollection(self._core_store)
                self._email_logs_collection = RelationalEmailLogsCollection(self._core_store)
                self._email_templates_collection = RelationalEmailTemplatesCollection(self._core_store)
                self._payment_reminders_collection = RelationalPaymentRemindersCollection(self._core_store)
                self._payment_reminder_preferences_collection = (
                    RelationalPaymentReminderPreferencesCollection(self._core_store)
                )
                self._payment_center_cart_collection = (
                    RelationalPaymentCenterCartCollection(self._core_store)
                )
                self._payment_receipts_collection = (
                    RelationalPaymentReceiptsCollection(self._core_store)
                )
                self._bus_bookings_collection = RelationalBusBookingsCollection(self._core_store)
                self._bus_trips_collection = RelationalBusTripsCollection(self._core_store)
                self._bus_routes_collection = RelationalBusRoutesCollection(self._core_store)
                self._bus_companies_collection = RelationalBusCompaniesCollection(
                    self._core_store
                )
                self._buses_collection = RelationalBusesCollection(self._core_store)
                self._bus_live_locations_collection = RelationalBusLiveLocationsCollection(
                    self._core_store
                )

    def __getattr__(self, name: str):
        if name == "notifications" and self._notifications_collection is not None:
            return self._notifications_collection
        if name == "announcements" and self._announcements_collection is not None:
            return self._announcements_collection
        if name == "push_subscriptions" and self._push_subscriptions_collection is not None:
            return self._push_subscriptions_collection
        if name == "push_logs" and self._push_logs_collection is not None:
            return self._push_logs_collection
        if name == "email_logs" and self._email_logs_collection is not None:
            return self._email_logs_collection
        if name == "email_templates" and self._email_templates_collection is not None:
            return self._email_templates_collection
        if name == "payment_reminders" and self._payment_reminders_collection is not None:
            return self._payment_reminders_collection
        if (
            name == "payment_reminder_preferences"
            and self._payment_reminder_preferences_collection is not None
        ):
            return self._payment_reminder_preferences_collection
        if name == "payment_center_cart" and self._payment_center_cart_collection is not None:
            return self._payment_center_cart_collection
        if name == "payment_receipts" and self._payment_receipts_collection is not None:
            return self._payment_receipts_collection
        if name == "bus_bookings" and self._bus_bookings_collection is not None:
            return self._bus_bookings_collection
        if name == "bus_trips" and self._bus_trips_collection is not None:
            return self._bus_trips_collection
        if name == "bus_routes" and self._bus_routes_collection is not None:
            return self._bus_routes_collection
        if name == "bus_companies" and self._bus_companies_collection is not None:
            return self._bus_companies_collection
        if name == "buses" and self._buses_collection is not None:
            return self._buses_collection
        if name == "bus_live_locations" and self._bus_live_locations_collection is not None:
            return self._bus_live_locations_collection
        return getattr(self._db, name)

    def __getitem__(self, name: str):
        return self.__getattr__(name)

    def get_raw_db(self):
        if self._core_store is not None:
            return self._core_store
        raw_getter = getattr(self._db, "get_raw_db", None)
        if callable(raw_getter):
            try:
                return raw_getter()
            except Exception:
                pass
        return self._db


def adapt_notifications_read_db(db):
    core_store = _extract_core_store(db)
    if core_store is None:
        return db
    session_factory = core_store.get_session_factory()
    if session_factory is None:
        return db
    return NotificationsRelationalDbAdapter(db)


async def bootstrap_relational_notification_tables(
    session_factory: Optional[async_sessionmaker[AsyncSession]],
) -> None:
    """
    One-way bootstrap from core_documents -> typed notification domain tables.
    Safe to run repeatedly: existing IDs are skipped.
    """
    if session_factory is None:
        return

    async with session_factory() as session:
        notif_count = await session.scalar(select(func.count()).select_from(NotificationRecord))
        announcement_count = await session.scalar(select(func.count()).select_from(AnnouncementRecord))
        push_subscription_count = await session.scalar(
            select(func.count()).select_from(PushSubscriptionRecord)
        )
        push_log_count = await session.scalar(select(func.count()).select_from(PushLogRecord))
        email_log_count = await session.scalar(select(func.count()).select_from(EmailLogRecord))
        email_template_count = await session.scalar(
            select(func.count()).select_from(EmailTemplateRecord)
        )
        payment_reminder_count = await session.scalar(
            select(func.count()).select_from(PaymentReminderRecord)
        )
        payment_reminder_preference_count = await session.scalar(
            select(func.count()).select_from(PaymentReminderPreferenceRecord)
        )
        payment_center_cart_count = await session.scalar(
            select(func.count()).select_from(PaymentCenterCartRecord)
        )
        payment_receipt_count = await session.scalar(
            select(func.count()).select_from(PaymentReceiptRecord)
        )
        bus_booking_count = await session.scalar(
            select(func.count()).select_from(BusBookingRecord)
        )
        bus_trip_count = await session.scalar(
            select(func.count()).select_from(BusTripRecord)
        )
        bus_route_count = await session.scalar(
            select(func.count()).select_from(BusRouteRecord)
        )
        bus_company_count = await session.scalar(
            select(func.count()).select_from(BusCompanyRecord)
        )
        bus_count = await session.scalar(
            select(func.count()).select_from(BusRecord)
        )
        bus_live_location_count = await session.scalar(
            select(func.count()).select_from(BusLiveLocationRecord)
        )

        if (notif_count or 0) == 0:
            notif_rows = await session.scalars(
                select(CoreDocument).where(CoreDocument.collection_name == "notifications")
            )
            for row in notif_rows.all():
                doc = dict(row.document or {})
                doc["_id"] = row.document_id
                normalized = _normalize_for_storage(doc)
                row_values = _notification_doc_to_row_values(normalized)
                if await session.get(NotificationRecord, row_values["id"]) is None:
                    session.add(NotificationRecord(**row_values))

        if (announcement_count or 0) == 0:
            announcement_rows = await session.scalars(
                select(CoreDocument).where(CoreDocument.collection_name == "announcements")
            )
            for row in announcement_rows.all():
                doc = dict(row.document or {})
                doc["_id"] = row.document_id
                normalized = _normalize_for_storage(doc)
                row_values = _announcement_doc_to_row_values(normalized)
                if await session.get(AnnouncementRecord, row_values["id"]) is None:
                    session.add(AnnouncementRecord(**row_values))

        if (push_subscription_count or 0) == 0:
            push_subscription_rows = await session.scalars(
                select(CoreDocument).where(CoreDocument.collection_name == "push_subscriptions")
            )
            for row in push_subscription_rows.all():
                doc = dict(row.document or {})
                doc["_id"] = row.document_id
                normalized = _normalize_for_storage(doc)
                row_values = _push_subscription_doc_to_row_values(normalized)
                if await session.get(PushSubscriptionRecord, row_values["id"]) is None:
                    session.add(PushSubscriptionRecord(**row_values))

        if (push_log_count or 0) == 0:
            push_log_rows = await session.scalars(
                select(CoreDocument).where(CoreDocument.collection_name == "push_logs")
            )
            for row in push_log_rows.all():
                doc = dict(row.document or {})
                doc["_id"] = row.document_id
                normalized = _normalize_for_storage(doc)
                row_values = _push_log_doc_to_row_values(normalized)
                if await session.get(PushLogRecord, row_values["id"]) is None:
                    session.add(PushLogRecord(**row_values))

        if (email_log_count or 0) == 0:
            email_log_rows = await session.scalars(
                select(CoreDocument).where(CoreDocument.collection_name == "email_logs")
            )
            for row in email_log_rows.all():
                doc = dict(row.document or {})
                doc["_id"] = row.document_id
                normalized = _normalize_for_storage(doc)
                row_values = _email_log_doc_to_row_values(normalized)
                if await session.get(EmailLogRecord, row_values["id"]) is None:
                    session.add(EmailLogRecord(**row_values))

        if (email_template_count or 0) == 0:
            email_template_rows = await session.scalars(
                select(CoreDocument).where(CoreDocument.collection_name == "email_templates")
            )
            for row in email_template_rows.all():
                doc = dict(row.document or {})
                doc["_id"] = row.document_id
                normalized = _normalize_for_storage(doc)
                row_values = _email_template_doc_to_row_values(normalized)
                if await session.get(EmailTemplateRecord, row_values["id"]) is None:
                    session.add(EmailTemplateRecord(**row_values))

        if (payment_reminder_count or 0) == 0:
            payment_reminder_rows = await session.scalars(
                select(CoreDocument).where(CoreDocument.collection_name == "payment_reminders")
            )
            for row in payment_reminder_rows.all():
                doc = dict(row.document or {})
                doc["_id"] = row.document_id
                normalized = _normalize_for_storage(doc)
                row_values = _payment_reminder_doc_to_row_values(normalized)
                if await session.get(PaymentReminderRecord, row_values["id"]) is None:
                    session.add(PaymentReminderRecord(**row_values))

        if (payment_reminder_preference_count or 0) == 0:
            payment_reminder_preference_rows = await session.scalars(
                select(CoreDocument).where(
                    CoreDocument.collection_name == "payment_reminder_preferences"
                )
            )
            for row in payment_reminder_preference_rows.all():
                doc = dict(row.document or {})
                doc["_id"] = row.document_id
                normalized = _normalize_for_storage(doc)
                row_values = _payment_reminder_preference_doc_to_row_values(normalized)
                if (
                    await session.get(
                        PaymentReminderPreferenceRecord,
                        row_values["id"],
                    )
                    is None
                ):
                    session.add(PaymentReminderPreferenceRecord(**row_values))

        if (payment_center_cart_count or 0) == 0:
            payment_center_cart_rows = await session.scalars(
                select(CoreDocument).where(
                    CoreDocument.collection_name == "payment_center_cart"
                )
            )
            for row in payment_center_cart_rows.all():
                doc = dict(row.document or {})
                doc["_id"] = row.document_id
                normalized = _normalize_for_storage(doc)
                row_values = _payment_center_cart_doc_to_row_values(normalized)
                if await session.get(PaymentCenterCartRecord, row_values["id"]) is None:
                    session.add(PaymentCenterCartRecord(**row_values))

        if (payment_receipt_count or 0) == 0:
            payment_receipt_rows = await session.scalars(
                select(CoreDocument).where(
                    CoreDocument.collection_name == "payment_receipts"
                )
            )
            for row in payment_receipt_rows.all():
                doc = dict(row.document or {})
                doc["_id"] = row.document_id
                normalized = _normalize_for_storage(doc)
                row_values = _payment_receipt_doc_to_row_values(normalized)
                if await session.get(PaymentReceiptRecord, row_values["id"]) is None:
                    session.add(PaymentReceiptRecord(**row_values))

        if (bus_booking_count or 0) == 0:
            bus_booking_rows = await session.scalars(
                select(CoreDocument).where(CoreDocument.collection_name == "bus_bookings")
            )
            for row in bus_booking_rows.all():
                doc = dict(row.document or {})
                doc["_id"] = row.document_id
                normalized = _normalize_for_storage(doc)
                row_values = _bus_booking_doc_to_row_values(normalized)
                if await session.get(BusBookingRecord, row_values["id"]) is None:
                    session.add(BusBookingRecord(**row_values))

        if (bus_trip_count or 0) == 0:
            bus_trip_rows = await session.scalars(
                select(CoreDocument).where(CoreDocument.collection_name == "bus_trips")
            )
            for row in bus_trip_rows.all():
                doc = dict(row.document or {})
                doc["_id"] = row.document_id
                normalized = _normalize_for_storage(doc)
                row_values = _bus_trip_doc_to_row_values(normalized)
                if await session.get(BusTripRecord, row_values["id"]) is None:
                    session.add(BusTripRecord(**row_values))

        if (bus_route_count or 0) == 0:
            bus_route_rows = await session.scalars(
                select(CoreDocument).where(CoreDocument.collection_name == "bus_routes")
            )
            for row in bus_route_rows.all():
                doc = dict(row.document or {})
                doc["_id"] = row.document_id
                normalized = _normalize_for_storage(doc)
                row_values = _bus_route_doc_to_row_values(normalized)
                if await session.get(BusRouteRecord, row_values["id"]) is None:
                    session.add(BusRouteRecord(**row_values))

        if (bus_company_count or 0) == 0:
            bus_company_rows = await session.scalars(
                select(CoreDocument).where(CoreDocument.collection_name == "bus_companies")
            )
            for row in bus_company_rows.all():
                doc = dict(row.document or {})
                doc["_id"] = row.document_id
                normalized = _normalize_for_storage(doc)
                row_values = _bus_company_doc_to_row_values(normalized)
                if await session.get(BusCompanyRecord, row_values["id"]) is None:
                    session.add(BusCompanyRecord(**row_values))

        if (bus_count or 0) == 0:
            bus_rows = await session.scalars(
                select(CoreDocument).where(CoreDocument.collection_name == "buses")
            )
            for row in bus_rows.all():
                doc = dict(row.document or {})
                doc["_id"] = row.document_id
                normalized = _normalize_for_storage(doc)
                row_values = _bus_doc_to_row_values(normalized)
                if await session.get(BusRecord, row_values["id"]) is None:
                    session.add(BusRecord(**row_values))

        if (bus_live_location_count or 0) == 0:
            bus_live_location_rows = await session.scalars(
                select(CoreDocument).where(
                    CoreDocument.collection_name == "bus_live_locations"
                )
            )
            for row in bus_live_location_rows.all():
                doc = dict(row.document or {})
                doc["_id"] = row.document_id
                normalized = _normalize_for_storage(doc)
                row_values = _bus_live_location_doc_to_row_values(normalized)
                if await session.get(BusLiveLocationRecord, row_values["id"]) is None:
                    session.add(BusLiveLocationRecord(**row_values))

        await session.commit()
