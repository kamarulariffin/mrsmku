"""
Sickbay Routes - Sick bay management for students
Extracted from server.py for better code organization
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, Callable
from bson import ObjectId

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

router = APIRouter(prefix="/api/sickbay", tags=["Sickbay"])
security = HTTPBearer(auto_error=False)

# Database reference - will be set from server.py
_get_db_func: Callable = None
_get_current_user_func: Callable = None
_log_audit_func: Callable = None


def init_router(get_db_func, auth_func, audit_func):
    """
    Initialize router with dependencies from server.py
    
    Args:
        get_db_func: Function that returns database instance
        auth_func: get_current_user function from server.py
        audit_func: log_audit function from server.py
    """
    global _get_db_func, _get_current_user_func, _log_audit_func
    
    _get_db_func = get_db_func
    _get_current_user_func = auth_func
    _log_audit_func = audit_func


# ============ LOCAL DEPENDENCY WRAPPERS ============

def get_db():
    """Get database instance"""
    return _get_db_func()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Wrapper for authentication - calls server.py's get_current_user"""
    if not credentials:
        raise HTTPException(status_code=401, detail="Token diperlukan")
    return await _get_current_user_func(credentials)


async def log_audit(user, action, module, details):
    """Wrapper for audit logging"""
    if _log_audit_func and user:
        await _log_audit_func(user, action, module, details)


def require_warden_admin():
    """Return dependency for requiring warden/admin roles"""
    async def _require_roles(credentials: HTTPAuthorizationCredentials = Depends(security)):
        user = await get_current_user(credentials)
        allowed_roles = ["warden", "admin", "superadmin"]
        if user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=403, 
                detail=f"Akses ditolak. Hanya {', '.join(allowed_roles)} boleh mengakses."
            )
        return user
    return _require_roles


# ============ PYDANTIC MODELS ============

class SickbayRecord(BaseModel):
    student_id: str
    check_in_time: str
    symptoms: str
    initial_treatment: str
    follow_up: Optional[str] = None
    check_out_time: Optional[str] = None


# ============ ROUTES ============

@router.post("/checkin")
async def sickbay_checkin(
    record: SickbayRecord,
    current_user: dict = Depends(require_warden_admin())
):
    """Record sickbay checkin"""
    db = get_db()
    
    # Try users collection first (pelajar role)
    student = await db.users.find_one({"_id": ObjectId(record.student_id), "role": "pelajar"})
    if not student:
        # Fallback to students collection
        student = await db.students.find_one({"_id": ObjectId(record.student_id)})
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    
    student_name = student.get("fullName", student.get("full_name", "Unknown"))
    
    record_doc = {
        "student_id": ObjectId(record.student_id),
        "student_name": student_name,
        "student_matric": student.get("matric", ""),
        "student_form": student.get("form", 0),
        "student_kelas": student.get("kelas", ""),
        "check_in_time": record.check_in_time or datetime.now(timezone.utc).isoformat(),
        "symptoms": record.symptoms,
        "initial_treatment": record.initial_treatment,
        "follow_up": record.follow_up,
        "recorded_by": str(current_user["_id"]),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.sickbay_records.insert_one(record_doc)
    
    # Notify parent if parent_id exists
    parent_id = student.get("parent_id")
    if parent_id:
        await db.notifications.insert_one({
            "user_id": parent_id,
            "title": "Anak di Bilik Sakit",
            "message": f"{student_name} masuk bilik sakit. Simptom: {record.symptoms}",
            "type": "warning",
            "is_read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    await log_audit(current_user, "SICKBAY_CHECKIN", "sickbay", f"Pelajar masuk bilik sakit: {student_name}")
    
    return {"message": "Rekod bilik sakit disimpan", "id": str(result.inserted_id)}


@router.get("/records")
async def get_sickbay_records(
    current_user: dict = Depends(require_warden_admin())
):
    """Get sickbay records"""
    db = get_db()
    records = await db.sickbay_records.find().sort("created_at", -1).to_list(100)
    return [{"id": str(r["_id"]), **{k: v for k, v in r.items() if k != "_id" and k != "student_id"}, "student_id": str(r["student_id"])} for r in records]


@router.post("/checkout/{record_id}")
async def sickbay_checkout(
    record_id: str,
    remarks: Optional[str] = None,
    current_user: dict = Depends(require_warden_admin())
):
    """Record sickbay checkout"""
    db = get_db()
    record = await db.sickbay_records.find_one({"_id": ObjectId(record_id)})
    if not record:
        raise HTTPException(status_code=404, detail="Rekod tidak dijumpai")
    
    await db.sickbay_records.update_one(
        {"_id": ObjectId(record_id)},
        {"$set": {
            "check_out_time": datetime.now(timezone.utc).isoformat(),
            "checkout_remarks": remarks,
            "checkout_by": str(current_user["_id"])
        }}
    )
    
    await log_audit(current_user, "SICKBAY_CHECKOUT", "sickbay", f"Pelajar keluar bilik sakit: {record['student_name']}")
    
    return {"message": "Pelajar keluar dari bilik sakit"}


@router.get("/stats")
async def get_sickbay_stats(
    current_user: dict = Depends(require_warden_admin())
):
    """Get sickbay statistics"""
    db = get_db()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Currently in sickbay (checked in but not checked out)
    in_sickbay = await db.sickbay_records.count_documents({
        "check_out_time": {"$exists": False}
    })
    
    # Today's visitors
    today_visits = await db.sickbay_records.count_documents({
        "created_at": {"$regex": f"^{today}"}
    })
    
    # Today's discharges
    today_discharges = await db.sickbay_records.count_documents({
        "check_out_time": {"$regex": f"^{today}"}
    })
    
    # Common symptoms (last 30 days)
    pipeline = [
        {"$match": {"created_at": {"$gte": (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()}}},
        {"$group": {"_id": "$symptoms", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5}
    ]
    common_symptoms = await db.sickbay_records.aggregate(pipeline).to_list(5)
    
    return {
        "in_sickbay": in_sickbay,
        "today_visits": today_visits,
        "today_discharges": today_discharges,
        "common_symptoms": [{"symptom": s["_id"], "count": s["count"]} for s in common_symptoms]
    }


@router.get("/students")
async def get_students_for_sickbay(
    search: Optional[str] = None,
    current_user: dict = Depends(require_warden_admin())
):
    """Get students for sickbay selection"""
    db = get_db()
    query = {"role": "pelajar", "status": "approved"}
    if search:
        query["$or"] = [
            {"fullName": {"$regex": search, "$options": "i"}},
            {"full_name": {"$regex": search, "$options": "i"}},
            {"matric": {"$regex": search, "$options": "i"}}
        ]
    
    students = await db.users.find(query).limit(50).to_list(50)
    
    return [{
        "id": str(s["_id"]),
        "fullName": s.get("fullName", s.get("full_name", "")),
        "matric": s.get("matric", ""),
        "form": s.get("form", 0),
        "kelas": s.get("kelas", ""),
        "block": s.get("block", "")
    } for s in students]
