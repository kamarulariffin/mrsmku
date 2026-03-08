"""
Warden Management Routes - Modul Pengurusan Warden
MRSMKU Smart360
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel as PydanticBase
from typing import List, Optional
from datetime import datetime, timezone, timedelta, date
from bson import ObjectId
from bson.errors import InvalidId
import calendar

from models.warden import (
    WardenScheduleCreate, WardenScheduleUpdate, WardenScheduleResponse,
    DutyWardenResponse, WardenCalendarDay, WardenCalendarResponse,
    WARDEN_POSITION_DISPLAY, DAY_OF_WEEK_EN_TO_MY
)

router = APIRouter(prefix="/api/warden", tags=["Warden Management"])
security = HTTPBearer()

# These will be set from server.py
_get_db_func = None
_get_current_user_func = None
_log_audit_func = None


def init_router(get_db_func, current_user_dep, permission_dep, audit_func):
    global _get_db_func, _get_current_user_func, _log_audit_func
    _get_db_func = get_db_func
    _get_current_user_func = current_user_dep
    _log_audit_func = audit_func


def get_db():
    """Get database instance"""
    return _get_db_func()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current user from token"""
    return await _get_current_user_func(credentials)


async def log_audit(user, action, module, details):
    """Log audit entry"""
    if _log_audit_func:
        await _log_audit_func(user, action, module, details)


async def serialize_schedule(schedule: dict) -> dict:
    """Serialize schedule with warden info"""
    warden = await get_db().users.find_one({"_id": ObjectId(schedule["warden_id"])})
    
    # Determine position based on warden's assignment
    jawatan = "warden"
    if warden:
        assigned_block = warden.get("assigned_block", "")
        if "lelaki" in assigned_block.lower() or assigned_block in ["JA", "JB", "JC", "F", "E"]:
            jawatan = "warden_asrama_lelaki"
        elif "perempuan" in assigned_block.lower() or assigned_block in ["I", "H", "G"]:
            jawatan = "warden_asrama_perempuan"
    
    return WardenScheduleResponse(
        id=str(schedule["_id"]),
        warden_id=schedule["warden_id"],
        warden_name=warden.get("full_name", "") if warden else "",
        warden_phone=warden.get("phone", "") if warden else "",
        jawatan=WARDEN_POSITION_DISPLAY.get(jawatan, jawatan),
        tarikh_mula=schedule["tarikh_mula"],
        tarikh_tamat=schedule["tarikh_tamat"],
        waktu_mula=schedule.get("waktu_mula", "18:00"),
        waktu_tamat=schedule.get("waktu_tamat", "07:00"),
        blok_assigned=schedule.get("blok_assigned", []),
        catatan=schedule.get("catatan"),
        is_active=schedule.get("is_active", True),
        created_at=schedule.get("created_at", "")
    ).dict()


async def serialize_duty_warden(schedule: dict, warden: dict) -> dict:
    """Serialize duty warden for display"""
    jawatan = "warden"
    assigned_block = warden.get("assigned_block", "")
    if "lelaki" in assigned_block.lower() or assigned_block in ["JA", "JB", "JC", "F", "E"]:
        jawatan = "warden_asrama_lelaki"
    elif "perempuan" in assigned_block.lower() or assigned_block in ["I", "H", "G"]:
        jawatan = "warden_asrama_perempuan"
    
    return DutyWardenResponse(
        id=str(schedule["_id"]),
        warden_id=str(warden["_id"]),
        warden_name=warden.get("full_name", ""),
        warden_phone=warden.get("phone", ""),
        warden_email=warden.get("email", ""),
        jawatan=jawatan,
        jawatan_display=WARDEN_POSITION_DISPLAY.get(jawatan, jawatan),
        waktu_mula=schedule.get("waktu_mula", "18:00"),
        waktu_tamat=schedule.get("waktu_tamat", "07:00"),
        blok_assigned=schedule.get("blok_assigned", []),
        is_on_duty=True
    ).dict()


# ============ PUBLIC ENDPOINTS ============

@router.get("/on-duty")
async def get_current_duty_wardens():
    """Get wardens currently on duty - Public for parents"""
    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")
    
    # Find all active schedules for today
    schedules = await get_db().warden_schedules.find({
        "tarikh_mula": {"$lte": today_str},
        "tarikh_tamat": {"$gte": today_str},
        "is_active": True
    }).to_list(100)
    
    duty_wardens = []
    for schedule in schedules:
        warden = await get_db().users.find_one({"_id": ObjectId(schedule["warden_id"])})
        if warden and warden.get("is_active", True):
            duty_wardens.append(await serialize_duty_warden(schedule, warden))
    
    return {
        "date": today_str,
        "day": DAY_OF_WEEK_EN_TO_MY.get(now.strftime("%A"), now.strftime("%A")),
        "wardens": duty_wardens,
        "total": len(duty_wardens)
    }


@router.get("/on-duty/block/{block_code}")
async def get_duty_warden_for_block(block_code: str):
    """Get duty warden for specific block"""
    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")
    
    # Find schedule for this block
    schedule = await get_db().warden_schedules.find_one({
        "tarikh_mula": {"$lte": today_str},
        "tarikh_tamat": {"$gte": today_str},
        "is_active": True,
        "$or": [
            {"blok_assigned": {"$in": [block_code]}},
            {"blok_assigned": {"$size": 0}}  # Assigned to all blocks
        ]
    })
    
    if not schedule:
        return {"warden": None, "message": "Tiada warden bertugas untuk blok ini"}
    
    warden = await get_db().users.find_one({"_id": ObjectId(schedule["warden_id"])})
    if not warden:
        return {"warden": None, "message": "Maklumat warden tidak dijumpai"}
    
    return {
        "warden": await serialize_duty_warden(schedule, warden),
        "block": block_code
    }


# ============ SCHEDULE CRUD ============

@router.get("/schedules", response_model=dict)
async def list_schedules(
    bulan: Optional[int] = None,
    tahun: Optional[int] = None,
    warden_id: Optional[str] = None,
    is_active: Optional[bool] = True,
    current_user: dict = Depends(get_current_user)
):
    """List all warden schedules - Admin, SuperAdmin, Warden"""
    role = current_user.get("role", "")
    if role not in ["admin", "superadmin", "warden"]:
        raise HTTPException(status_code=403, detail="Tiada kebenaran")
    
    query = {}
    
    if is_active is not None:
        query["is_active"] = is_active
    
    if warden_id:
        query["warden_id"] = warden_id
    elif role == "warden":
        # Wardens only see their own schedules
        query["warden_id"] = str(current_user["_id"])
    
    # Filter by month/year if provided
    if bulan and tahun:
        start_date = f"{tahun}-{bulan:02d}-01"
        if bulan == 12:
            end_date = f"{tahun + 1}-01-01"
        else:
            end_date = f"{tahun}-{bulan + 1:02d}-01"
        
        query["$or"] = [
            {"tarikh_mula": {"$gte": start_date, "$lt": end_date}},
            {"tarikh_tamat": {"$gte": start_date, "$lt": end_date}},
            {"tarikh_mula": {"$lt": start_date}, "tarikh_tamat": {"$gte": end_date}}
        ]
    
    schedules = await get_db().warden_schedules.find(query).sort("tarikh_mula", 1).to_list(500)
    
    return {
        "schedules": [await serialize_schedule(s) for s in schedules],
        "total": len(schedules)
    }


@router.post("/schedules", response_model=dict)
async def create_schedule(
    schedule_data: WardenScheduleCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create new warden schedule - Admin, SuperAdmin, Warden"""
    role = current_user.get("role", "")
    if role not in ["admin", "superadmin", "warden"]:
        raise HTTPException(status_code=403, detail="Tiada kebenaran untuk mencipta jadual")
    
    # Verify warden exists
    warden = await get_db().users.find_one({"_id": ObjectId(schedule_data.warden_id), "role": "warden"})
    if not warden:
        raise HTTPException(status_code=404, detail="Warden tidak dijumpai")
    
    # Validate dates
    try:
        start = datetime.strptime(schedule_data.tarikh_mula, "%Y-%m-%d")
        end = datetime.strptime(schedule_data.tarikh_tamat, "%Y-%m-%d")
        if end < start:
            raise HTTPException(status_code=400, detail="Tarikh tamat mesti selepas tarikh mula")
    except ValueError:
        raise HTTPException(status_code=400, detail="Format tarikh tidak sah (YYYY-MM-DD)")
    
    # Check for overlapping schedules
    overlap = await get_db().warden_schedules.find_one({
        "warden_id": schedule_data.warden_id,
        "is_active": True,
        "$or": [
            {"tarikh_mula": {"$lte": schedule_data.tarikh_tamat}, "tarikh_tamat": {"$gte": schedule_data.tarikh_mula}}
        ]
    })
    if overlap:
        raise HTTPException(status_code=400, detail="Jadual bertindih dengan jadual sedia ada")
    
    now = datetime.now(timezone.utc).isoformat()
    schedule_doc = {
        "warden_id": schedule_data.warden_id,
        "tarikh_mula": schedule_data.tarikh_mula,
        "tarikh_tamat": schedule_data.tarikh_tamat,
        "waktu_mula": schedule_data.waktu_mula,
        "waktu_tamat": schedule_data.waktu_tamat,
        "blok_assigned": schedule_data.blok_assigned or [],
        "catatan": schedule_data.catatan,
        "is_active": True,
        "created_by": str(current_user["_id"]),
        "created_at": now,
        "updated_at": now
    }
    
    result = await get_db().warden_schedules.insert_one(schedule_doc)
    schedule_doc["_id"] = result.inserted_id
    
    # Notify warden
    await get_db().notifications.insert_one({
        "user_id": ObjectId(schedule_data.warden_id),
        "title": "Jadual Tugas Baru",
        "message": f"Anda dijadualkan bertugas dari {schedule_data.tarikh_mula} hingga {schedule_data.tarikh_tamat}",
        "type": "info",
        "is_read": False,
        "created_at": now
    })
    
    await log_audit(current_user, "CREATE_WARDEN_SCHEDULE", "warden", f"Jadual baru untuk {warden['full_name']}")
    
    return {
        "message": "Jadual berjaya dicipta",
        "schedule": await serialize_schedule(schedule_doc)
    }


def _valid_schedule_id(schedule_id: str):
    """Return ObjectId or raise HTTPException if invalid."""
    try:
        return ObjectId(schedule_id)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail="ID jadual tidak sah")


@router.get("/schedules/{schedule_id}", response_model=dict)
async def get_schedule(
    schedule_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get single warden schedule by ID - for edit form when not in month list."""
    role = current_user.get("role", "")
    if role not in ["admin", "superadmin", "warden"]:
        raise HTTPException(status_code=403, detail="Tiada kebenaran")
    oid = _valid_schedule_id(schedule_id)
    schedule = await get_db().warden_schedules.find_one({"_id": oid, "is_active": True})
    if not schedule:
        schedule = await get_db().warden_schedules.find_one({"_id": oid})
    if not schedule:
        raise HTTPException(status_code=404, detail="Jadual tidak dijumpai")
    if role == "warden" and str(schedule.get("warden_id")) != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Hanya jadual sendiri boleh dilihat")
    return {"schedule": await serialize_schedule(schedule)}


@router.put("/schedules/{schedule_id}", response_model=dict)
async def update_schedule(
    schedule_id: str,
    schedule_data: WardenScheduleUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update warden schedule - Admin, SuperAdmin, Warden"""
    role = current_user.get("role", "")
    if role not in ["admin", "superadmin", "warden"]:
        raise HTTPException(status_code=403, detail="Tiada kebenaran untuk kemaskini jadual")
    oid = _valid_schedule_id(schedule_id)
    schedule = await get_db().warden_schedules.find_one({"_id": oid})
    if not schedule:
        raise HTTPException(status_code=404, detail="Jadual tidak dijumpai")
    if role == "warden" and str(schedule.get("warden_id")) != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Hanya jadual sendiri boleh dikemaskini")
    
    update_data = {k: v for k, v in schedule_data.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await get_db().warden_schedules.update_one(
        {"_id": oid},
        {"$set": update_data}
    )
    
    await log_audit(current_user, "UPDATE_WARDEN_SCHEDULE", "warden", f"Jadual dikemaskini: {schedule_id}")
    
    updated = await get_db().warden_schedules.find_one({"_id": oid})
    return {
        "message": "Jadual berjaya dikemaskini",
        "schedule": await serialize_schedule(updated)
    }


@router.delete("/schedules/{schedule_id}", response_model=dict)
async def delete_schedule(
    schedule_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete warden schedule - Admin, SuperAdmin, Warden"""
    role = current_user.get("role", "")
    if role not in ["admin", "superadmin", "warden"]:
        raise HTTPException(status_code=403, detail="Tiada kebenaran untuk padam jadual")
    oid = _valid_schedule_id(schedule_id)
    schedule = await get_db().warden_schedules.find_one({"_id": oid})
    if not schedule:
        raise HTTPException(status_code=404, detail="Jadual tidak dijumpai")
    if role == "warden" and str(schedule.get("warden_id")) != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Hanya jadual sendiri boleh dipadam")
    
    await get_db().warden_schedules.delete_one({"_id": oid})
    
    await log_audit(current_user, "DELETE_WARDEN_SCHEDULE", "warden", f"Jadual dipadam: {schedule_id}")
    
    return {"message": "Jadual berjaya dipadam"}


# ============ CALENDAR VIEW ============

@router.get("/calendar", response_model=dict)
async def get_calendar_view(
    bulan: int = Query(..., ge=1, le=12),
    tahun: int = Query(..., ge=2020, le=2030),
    current_user: dict = Depends(get_current_user)
):
    """Get calendar view of warden schedules"""
    # Get all days in the month
    num_days = calendar.monthrange(tahun, bulan)[1]
    
    db = get_db()
    days = []
    for day in range(1, num_days + 1):
        date_str = f"{tahun}-{bulan:02d}-{day:02d}"
        date_obj = date(tahun, bulan, day)
        day_name = DAY_OF_WEEK_EN_TO_MY.get(date_obj.strftime("%A"), date_obj.strftime("%A"))
        schedules = await db.warden_schedules.find({
            "tarikh_mula": {"$lte": date_str},
            "tarikh_tamat": {"$gte": date_str},
            "is_active": True
        }).to_list(100)
        wardens = []
        for schedule in schedules:
            warden = await db.users.find_one({"_id": ObjectId(schedule["warden_id"])})
            if warden:
                wardens.append(await serialize_duty_warden(schedule, warden))
        outing_type = await _get_outing_type_for_date(db, date_str)
        ev_cursor = db.warden_calendar_events.find({
            "date_start": {"$lte": date_str},
            "$or": [{"date_end": {"$gte": date_str}}, {"date_end": {"$exists": False}}, {"date_end": None}]
        }).sort("date_start", -1).limit(1)
        ev_list = await ev_cursor.to_list(1)
        ev = ev_list[0] if ev_list else None
        if ev and ev.get("date_end") and ev["date_end"] < date_str:
            ev = None
        event_note = ev.get("note", "") if ev else None
        days.append({
            "tarikh": date_str,
            "hari": day_name,
            "day_number": day,
            "wardens": wardens,
            "outing_type": outing_type,
            "event_note": event_note,
        })
    
    months_my = ["", "Januari", "Februari", "Mac", "April", "Mei", "Jun", 
                 "Julai", "Ogos", "September", "Oktober", "November", "Disember"]
    
    return {
        "calendar": {
            "bulan": bulan,
            "bulan_name": months_my[bulan],
            "tahun": tahun,
            "days": days
        }
    }


# ============ CALENDAR EVENTS (NOTA PERISTIWA) ============

class CalendarEventCreate(PydanticBase):
    date_start: str  # YYYY-MM-DD
    date_end: Optional[str] = None  # YYYY-MM-DD; if None, single day
    note: str


class CalendarEventUpdate(PydanticBase):
    date_start: Optional[str] = None
    date_end: Optional[str] = None
    note: Optional[str] = None


@router.get("/calendar-events", response_model=dict)
async def list_calendar_events(
    bulan: int = Query(..., ge=1, le=12),
    tahun: int = Query(..., ge=2020, le=2030),
    current_user: dict = Depends(get_current_user)
):
    """Senarai peristiwa/nota kalendar untuk bulan tertentu. Warden, Admin."""
    role = current_user.get("role", "")
    if role not in ["admin", "superadmin", "warden"]:
        raise HTTPException(status_code=403, detail="Tiada kebenaran")
    db = get_db()
    start = f"{tahun}-{bulan:02d}-01"
    num_days = calendar.monthrange(tahun, bulan)[1]
    end_inclusive = f"{tahun}-{bulan:02d}-{num_days:02d}"
    events = await db.warden_calendar_events.find({
        "date_start": {"$lte": end_inclusive},
        "$or": [
            {"date_end": {"$exists": False}},
            {"date_end": None},
            {"date_end": {"$gte": start}}
        ]
    }).sort("date_start", 1).to_list(100)
    # Normalize date_end to date_start if missing
    out = []
    for e in events:
        date_end = e.get("date_end") or e.get("date_start")
        out.append({
            "id": str(e["_id"]),
            "date_start": e["date_start"],
            "date_end": date_end,
            "note": e.get("note", ""),
        })
    return {"events": out}


@router.post("/calendar-events", response_model=dict)
async def create_calendar_event(
    body: CalendarEventCreate,
    current_user: dict = Depends(get_current_user)
):
    """Tambah peristiwa/nota kalendar (cth. PBW CNY). Warden, Admin."""
    role = current_user.get("role", "")
    if role not in ["admin", "superadmin", "warden"]:
        raise HTTPException(status_code=403, detail="Tiada kebenaran")
    db = get_db()
    date_end = body.date_end or body.date_start
    now = datetime.now(timezone.utc).isoformat()
    doc = {"date_start": body.date_start, "date_end": date_end, "note": body.note, "created_at": now, "updated_at": now}
    r = await db.warden_calendar_events.insert_one(doc)
    return {"message": "Peristiwa ditambah", "id": str(r.inserted_id)}


@router.put("/calendar-events/{event_id}", response_model=dict)
async def update_calendar_event(
    event_id: str,
    body: CalendarEventUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Kemaskini peristiwa kalendar. Warden, Admin."""
    role = current_user.get("role", "")
    if role not in ["admin", "superadmin", "warden"]:
        raise HTTPException(status_code=403, detail="Tiada kebenaran")
    db = get_db()
    upd = {k: v for k, v in body.dict().items() if v is not None}
    if not upd:
        return {"message": "Tiada perubahan"}
    upd["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.warden_calendar_events.update_one({"_id": ObjectId(event_id)}, {"$set": upd})
    return {"message": "Peristiwa dikemaskini"}


@router.delete("/calendar-events/{event_id}", response_model=dict)
async def delete_calendar_event(
    event_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Padam peristiwa kalendar. Warden, Admin."""
    role = current_user.get("role", "")
    if role not in ["admin", "superadmin", "warden"]:
        raise HTTPException(status_code=403, detail="Tiada kebenaran")
    db = get_db()
    result = await db.warden_calendar_events.delete_one({"_id": ObjectId(event_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Peristiwa tidak dijumpai")
    return {"message": "Peristiwa dipadam"}


async def _get_outing_type_for_date(db, date_str: str) -> Optional[str]:
    """Return 'putera' or 'puteri' if date falls in a weekend rotation; else None."""
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        weekday = dt.strftime("%A")
        if weekday not in ("Saturday", "Sunday"):
            return None
    except Exception:
        return None
    from datetime import timedelta
    # Rotation doc has week_start (one day of that week). Find if date_str falls in any week window.
    rotations = await db.outing_rotation.find({}).sort("week_start", 1).to_list(200)
    for r in rotations:
        ws = r.get("week_start")
        if not ws:
            continue
        try:
            d_start = datetime.strptime(ws, "%Y-%m-%d").date()
            d_end = d_start + timedelta(days=6)
            d_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            if d_start <= d_date <= d_end:
                return r.get("type")
        except Exception:
            continue
    return None


@router.get("/calendar-public", response_model=dict)
async def get_calendar_public(
    bulan: int = Query(..., ge=1, le=12),
    tahun: int = Query(..., ge=2020, le=2030),
):
    """Kalendar jadual bertugas untuk paparan awam (ibu bapa). Tanpa auth."""
    db = get_db()
    num_days = calendar.monthrange(tahun, bulan)[1]
    months_my = ["", "Januari", "Februari", "Mac", "April", "Mei", "Jun",
                 "Julai", "Ogos", "September", "Oktober", "November", "Disember"]
    start = f"{tahun}-{bulan:02d}-01"
    end = f"{tahun}-{bulan:02d}-{num_days:02d}"
    days = []
    for day in range(1, num_days + 1):
        date_str = f"{tahun}-{bulan:02d}-{day:02d}"
        date_obj = date(tahun, bulan, day)
        day_name = DAY_OF_WEEK_EN_TO_MY.get(date_obj.strftime("%A"), date_obj.strftime("%A"))
        schedules = await db.warden_schedules.find({
            "tarikh_mula": {"$lte": date_str},
            "tarikh_tamat": {"$gte": date_str},
            "is_active": True
        }).to_list(100)
        wardens = []
        for s in schedules:
            w = await db.users.find_one({"_id": ObjectId(s["warden_id"])})
            if w:
                wardens.append({
                    "warden_name": w.get("full_name", ""),
                    "warden_phone": w.get("phone", ""),
                    "waktu_mula": s.get("waktu_mula", "18:00"),
                    "waktu_tamat": s.get("waktu_tamat", "07:00"),
                })
        outing_type = await _get_outing_type_for_date(db, date_str)
        # Event note for this date (event overlaps date_str)
        ev_cursor = db.warden_calendar_events.find({
            "date_start": {"$lte": date_str},
            "$or": [
                {"date_end": {"$gte": date_str}},
                {"date_end": {"$exists": False}},
                {"date_end": None}
            ]
        }).sort("date_start", -1).limit(1)
        ev_list = await ev_cursor.to_list(1)
        ev = ev_list[0] if ev_list else None
        if ev and ev.get("date_end") and ev["date_end"] < date_str:
            ev = None
        event_note = ev.get("note", "") if ev else None
        days.append({
            "tarikh": date_str,
            "hari": day_name,
            "day_number": day,
            "wardens": wardens,
            "outing_type": outing_type,
            "event_note": event_note,
        })
    return {
        "calendar": {
            "bulan": bulan,
            "bulan_name": months_my[bulan],
            "tahun": tahun,
            "days": days
        }
    }


# ============ WARDEN LIST ============

@router.get("/list", response_model=dict)
async def list_wardens(
    is_active: Optional[bool] = True,
    current_user: dict = Depends(get_current_user)
):
    """List all wardens - For schedule assignment"""
    role = current_user.get("role", "")
    if role not in ["admin", "superadmin", "warden"]:
        raise HTTPException(status_code=403, detail="Tiada kebenaran")
    
    query = {"role": "warden"}
    if is_active is not None:
        query["is_active"] = is_active
    
    wardens = await get_db().users.find(query).to_list(100)
    
    return {
        "wardens": [
            {
                "id": str(w["_id"]),
                "full_name": w.get("full_name", ""),
                "email": w.get("email", ""),
                "phone": w.get("phone", ""),
                "assigned_block": w.get("assigned_block", ""),
                "is_active": w.get("is_active", True)
            }
            for w in wardens
        ],
        "total": len(wardens)
    }


# ============ GILIRAN OUTING PUTERA / PUTERI (HUJUNG MINGGU) ============

class OutingRotationItem(PydanticBase):
    week_start: str  # YYYY-MM-DD (Sabtu atau Ahad minggu tersebut)
    type: str  # "putera" | "puteri"

@router.get("/outing-rotation", response_model=dict)
async def get_outing_rotation(
    bulan: Optional[int] = None,
    tahun: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    """Senarai giliran outing Putera/Puteri mengikut minggu. Warden, Admin, SuperAdmin."""
    role = current_user.get("role", "")
    if role not in ["admin", "superadmin", "warden"]:
        raise HTTPException(status_code=403, detail="Tiada kebenaran")
    db = get_db()
    query = {}
    if bulan and tahun:
        start = f"{tahun}-{bulan:02d}-01"
        if bulan == 12:
            end = f"{tahun + 1}-01-01"
        else:
            end = f"{tahun}-{bulan + 1:02d}-01"
        query["week_start"] = {"$gte": start, "$lt": end}
    items = await db.outing_rotation.find(query).sort("week_start", 1).to_list(200)
    return {
        "items": [
            {"id": str(r["_id"]), "week_start": r["week_start"], "type": r.get("type", "putera")}
            for r in items
        ],
        "total": len(items)
    }


@router.post("/outing-rotation", response_model=dict)
async def create_outing_rotation(
    body: OutingRotationItem,
    current_user: dict = Depends(get_current_user)
):
    """Tambah giliran outing (minggu = Putera atau Puteri). Admin, SuperAdmin, Warden."""
    role = current_user.get("role", "")
    if role not in ["admin", "superadmin", "warden"]:
        raise HTTPException(status_code=403, detail="Tiada kebenaran")
    if body.type not in ("putera", "puteri"):
        raise HTTPException(status_code=400, detail="type mesti putera atau puteri")
    db = get_db()
    existing = await db.outing_rotation.find_one({"week_start": body.week_start})
    if existing:
        await db.outing_rotation.update_one(
            {"_id": existing["_id"]},
            {"$set": {"type": body.type, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"message": "Giliran dikemaskini", "id": str(existing["_id"])}
    now = datetime.now(timezone.utc).isoformat()
    r = await db.outing_rotation.insert_one({
        "week_start": body.week_start,
        "type": body.type,
        "created_at": now,
        "updated_at": now
    })
    return {"message": "Giliran ditambah", "id": str(r.inserted_id)}


@router.delete("/outing-rotation/{item_id}", response_model=dict)
async def delete_outing_rotation(
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Padam giliran outing. Admin, SuperAdmin, Warden."""
    role = current_user.get("role", "")
    if role not in ["admin", "superadmin", "warden"]:
        raise HTTPException(status_code=403, detail="Tiada kebenaran")
    db = get_db()
    result = await db.outing_rotation.delete_one({"_id": ObjectId(item_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rekod tidak dijumpai")
    return {"message": "Giliran dipadam"}
