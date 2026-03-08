"""
Modul Automasi SOP Asrama - Fasa 5
Setiap escalation direkod dalam MongoDB, status real-time, linked to staff profiles.
"""
from datetime import datetime, timezone
from typing import Optional, List, Callable
from bson import ObjectId

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/escalations", tags=["Escalations"])
security = HTTPBearer(auto_error=False)

_get_db_func: Callable = None
_get_current_user_func: Callable = None
_log_audit_func: Callable = None


def init_router(get_db_func, auth_func, audit_func):
    global _get_db_func, _get_current_user_func, _log_audit_func
    _get_db_func = get_db_func
    _get_current_user_func = auth_func
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


def require_warden_admin():
    async def _dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
        user = await get_current_user(credentials)
        if user.get("role") not in ("warden", "admin", "superadmin"):
            raise HTTPException(status_code=403, detail="Akses ditolak")
        return user
    return _dep


# SOP escalation levels (linked to staff roles)
ESCALATION_LEVEL_1 = 1   # Warden
ESCALATION_LEVEL_2 = 2   # HEM / Admin
ESCALATION_LEVEL_3 = 3   # Pentadbir

ESCALATION_STATUS_OPEN = "open"
ESCALATION_STATUS_IN_PROGRESS = "in_progress"
ESCALATION_STATUS_ESCALATED = "escalated"
ESCALATION_STATUS_CLOSED = "closed"

SOURCE_DISCIPLINE = "discipline"
SOURCE_HOSTEL = "hostel"
SOURCE_COMPLAINT = "complaint"
SOURCE_MANUAL = "manual"


class EscalationCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=5, max_length=2000)
    level: int = Field(1, ge=1, le=3)
    source: str = Field(default=SOURCE_MANUAL)
    student_id: Optional[str] = None
    source_ref_id: Optional[str] = None  # e.g. offence_id, hostel_record_id


class EscalationUpdate(BaseModel):
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None


def _serialize_escalation(e: dict, assigned_name: Optional[str] = None, reported_name: Optional[str] = None) -> dict:
    return {
        "id": str(e["_id"]),
        "title": e.get("title", ""),
        "description": e.get("description", ""),
        "level": e.get("level", 1),
        "source": e.get("source", SOURCE_MANUAL),
        "status": e.get("status", ESCALATION_STATUS_OPEN),
        "student_id": str(e["student_id"]) if e.get("student_id") else None,
        "student_name": e.get("student_name"),
        "source_ref_id": e.get("source_ref_id"),
        "reported_by": str(e["reported_by"]) if e.get("reported_by") else None,
        "reported_by_name": reported_name or e.get("reported_by_name"),
        "assigned_to": str(e["assigned_to"]) if e.get("assigned_to") else None,
        "assigned_to_name": assigned_name or e.get("assigned_to_name"),
        "notes": e.get("notes"),
        "created_at": e.get("created_at", ""),
        "updated_at": e.get("updated_at", ""),
        "closed_at": e.get("closed_at"),
    }


@router.get("/staff")
async def list_staff_for_assignment(current_user: dict = Depends(require_warden_admin())):
    """Senarai staff (warden, admin, superadmin) untuk tugasan escalation."""
    db = get_db()
    users = await db.users.find(
        {"role": {"$in": ["warden", "admin", "superadmin"]}, "is_active": {"$ne": False}}
    ).to_list(100)
    return [
        {"id": str(u["_id"]), "full_name": u.get("full_name", ""), "role": u.get("role", "")}
        for u in users
    ]


@router.post("")
async def create_escalation(
    body: EscalationCreate,
    current_user: dict = Depends(require_warden_admin()),
):
    """Cipta rekod escalation SOP. Direkod dalam MongoDB, linked to staff."""
    db = get_db()
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "title": body.title,
        "description": body.description,
        "level": body.level,
        "source": body.source,
        "status": ESCALATION_STATUS_OPEN,
        "reported_by": current_user["_id"],
        "reported_by_name": current_user.get("full_name", ""),
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    if body.student_id:
        doc["student_id"] = ObjectId(body.student_id)
        from services.hostel_data_sync import fetch_live_student
        student = await fetch_live_student(db, body.student_id)
        if student:
            doc["student_name"] = student.get("full_name", student.get("fullName", ""))
    if body.source_ref_id:
        doc["source_ref_id"] = body.source_ref_id
    result = await db.escalation_logs.insert_one(doc)
    await log_audit(current_user, "CREATE_ESCALATION", "escalation", f"Escalation: {body.title}")
    return {"message": "Escalation direkod", "id": str(result.inserted_id)}


@router.get("")
async def list_escalations(
    status: Optional[str] = None,
    level: Optional[int] = None,
    assigned_to: Optional[str] = None,
    limit: int = Query(50, le=200),
    current_user: dict = Depends(require_warden_admin()),
):
    """Senarai escalation (real-time dari MongoDB). Warden boleh filter ikut assigned."""
    db = get_db()
    query = {}
    if status:
        query["status"] = status
    if level is not None:
        query["level"] = level
    if assigned_to:
        query["assigned_to"] = ObjectId(assigned_to)
    if current_user.get("role") == "warden":
        query["$or"] = [
            {"assigned_to": current_user["_id"]},
            {"reported_by": current_user["_id"]},
            {"assigned_to": None, "status": ESCALATION_STATUS_OPEN},
        ]
    rows = await db.escalation_logs.find(query).sort("created_at", -1).limit(limit).to_list(limit)
    result = []
    for r in rows:
        reported_name = r.get("reported_by_name")
        assigned_name = r.get("assigned_to_name")
        if r.get("assigned_to"):
            staff = await db.users.find_one({"_id": r["assigned_to"]})
            if staff:
                assigned_name = staff.get("full_name", "")
        result.append(_serialize_escalation(r, assigned_name=assigned_name, reported_name=reported_name))
    return result


@router.get("/stats")
async def escalation_stats(current_user: dict = Depends(require_warden_admin())):
    """Statistik escalation (live)."""
    db = get_db()
    query = {}
    if current_user.get("role") == "warden":
        query["$or"] = [
            {"assigned_to": current_user["_id"]},
            {"reported_by": current_user["_id"]},
        ]
    open_count = await db.escalation_logs.count_documents({**query, "status": ESCALATION_STATUS_OPEN})
    in_progress = await db.escalation_logs.count_documents({**query, "status": ESCALATION_STATUS_IN_PROGRESS})
    escalated = await db.escalation_logs.count_documents({**query, "status": ESCALATION_STATUS_ESCALATED})
    closed = await db.escalation_logs.count_documents({**query, "status": ESCALATION_STATUS_CLOSED})
    total = await db.escalation_logs.count_documents(query)
    return {
        "open": open_count,
        "in_progress": in_progress,
        "escalated": escalated,
        "closed": closed,
        "total": total,
    }


@router.patch("/{escalation_id}")
async def update_escalation(
    escalation_id: str,
    body: EscalationUpdate,
    current_user: dict = Depends(require_warden_admin()),
):
    """Kemaskini status / assigned_to. Status real-time dalam DB."""
    db = get_db()
    now_iso = datetime.now(timezone.utc).isoformat()
    updates = {"updated_at": now_iso}
    if body.status is not None:
        updates["status"] = body.status
        if body.status == ESCALATION_STATUS_CLOSED:
            updates["closed_at"] = now_iso
    if body.assigned_to is not None:
        updates["assigned_to"] = ObjectId(body.assigned_to) if body.assigned_to else None
        if body.assigned_to:
            staff = await db.users.find_one({"_id": ObjectId(body.assigned_to)})
            updates["assigned_to_name"] = staff.get("full_name", "") if staff else ""
        else:
            updates["assigned_to_name"] = None
    if body.notes is not None:
        updates["notes"] = body.notes
    result = await db.escalation_logs.update_one(
        {"_id": ObjectId(escalation_id)},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Escalation tidak dijumpai")
    await log_audit(current_user, "UPDATE_ESCALATION", "escalation", f"Kemaskini {escalation_id}")
    return {"message": "Escalation dikemaskini"}


@router.get("/{escalation_id}")
async def get_escalation(
    escalation_id: str,
    current_user: dict = Depends(require_warden_admin()),
):
    """Dapatkan satu rekod escalation."""
    db = get_db()
    e = await db.escalation_logs.find_one({"_id": ObjectId(escalation_id)})
    if not e:
        raise HTTPException(status_code=404, detail="Escalation tidak dijumpai")
    assigned_name = e.get("assigned_to_name")
    if e.get("assigned_to"):
        staff = await db.users.find_one({"_id": e["assigned_to"]})
        if staff:
            assigned_name = staff.get("full_name", "")
    return _serialize_escalation(e, assigned_name=assigned_name, reported_name=e.get("reported_by_name"))
