"""Shared ID normalization helpers for Mongo/ObjectId compatible code paths."""

from typing import Any, Optional

from bson import ObjectId


def object_id_or_none(value: Any) -> Optional[ObjectId]:
    """Return ObjectId when value is valid; otherwise None."""
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return value
    text = str(value).strip()
    try:
        if ObjectId.is_valid(text):
            return ObjectId(text)
    except Exception:
        return None
    return None


def id_value(value: Any) -> Any:
    """Normalize IDs while staying compatible with non-ObjectId values."""
    if value is None:
        return None
    oid = object_id_or_none(value)
    if oid is not None:
        return oid
    return str(value).strip()
