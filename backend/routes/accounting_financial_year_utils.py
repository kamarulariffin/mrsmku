from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple


def _default_school_financial_year_window(reference: Optional[datetime] = None) -> Tuple[str, str, str]:
    """
    Default school financial year window:
    - starts on 1 May
    - ends on 30 April next year
    """
    ref = reference or datetime.now(timezone.utc)
    start_year = ref.year if ref.month >= 5 else ref.year - 1
    end_year = start_year + 1
    return f"{start_year}-05-01", f"{end_year}-04-30", f"{start_year}/{end_year}"


async def _promote_financial_year_as_current(db, year_id: Any, updated_at: Optional[datetime] = None) -> None:
    ts = updated_at or datetime.now(timezone.utc)
    await db.financial_years.update_many({}, {"$set": {"is_current": False}})
    await db.financial_years.update_one(
        {"_id": year_id},
        {"$set": {"is_current": True, "updated_at": ts}},
    )


async def ensure_current_financial_year(db, *, auto_create: bool = True) -> Optional[Dict[str, Any]]:
    """
    Resolve the active financial year with self-healing behavior:
    1) explicit is_current=True
    2) year range covering today's date (not closed)
    3) latest non-closed year
    4) optional auto-create default school financial year
    """
    now_utc = datetime.now(timezone.utc)

    fy = await db.financial_years.find_one({"is_current": True})
    if fy:
        return fy

    today = now_utc.strftime("%Y-%m-%d")
    fy = await db.financial_years.find_one(
        {
            "start_date": {"$lte": today},
            "end_date": {"$gte": today},
            "is_closed": {"$ne": True},
        },
        sort=[("start_date", -1)],
    )
    if fy:
        await _promote_financial_year_as_current(db, fy["_id"], now_utc)
        fy["is_current"] = True
        return fy

    fy = await db.financial_years.find_one(
        {"is_closed": {"$ne": True}},
        sort=[("end_date", -1)],
    )
    if fy:
        await _promote_financial_year_as_current(db, fy["_id"], now_utc)
        fy["is_current"] = True
        return fy

    if not auto_create:
        return None

    start_date, end_date, name = _default_school_financial_year_window(now_utc)
    existing_same_window = await db.financial_years.find_one(
        {
            "start_date": start_date,
            "end_date": end_date,
            "is_closed": {"$ne": True},
        }
    )
    if existing_same_window:
        await _promote_financial_year_as_current(db, existing_same_window["_id"], now_utc)
        existing_same_window["is_current"] = True
        return existing_same_window

    await db.financial_years.update_many({}, {"$set": {"is_current": False}})
    doc = {
        "name": name,
        "start_date": start_date,
        "end_date": end_date,
        "is_current": True,
        "is_closed": False,
        "notes": "Auto-generated default financial year",
        "created_at": now_utc,
        "created_by": "system",
        "created_by_name": "System",
    }
    result = await db.financial_years.insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc
