"""
AI Risiko Disiplin - Fasa 6
Semua data dari MongoDB sahaja (offences, olat_cases, movement_logs). Tiada mock.
"""
from datetime import datetime, timezone
from typing import Optional, List, Callable
from bson import ObjectId

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

router = APIRouter(prefix="/api/risk", tags=["Risk"])
security = HTTPBearer(auto_error=False)

_get_db_func: Callable = None
_get_current_user_func: Callable = None


def init_router(get_db_func, auth_func):
    global _get_db_func, _get_current_user_func
    _get_db_func = get_db_func
    _get_current_user_func = auth_func


def get_db():
    return _get_db_func()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Token diperlukan")
    return await _get_current_user_func(credentials)


def require_warden_admin():
    async def _dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
        user = await get_current_user(credentials)
        if user.get("role") not in ("warden", "admin", "superadmin"):
            raise HTTPException(status_code=403, detail="Akses ditolak")
        return user
    return _dep


# Risk bands (rule-based from real data)
BAND_LOW = "low"
BAND_MEDIUM = "medium"
BAND_HIGH = "high"


async def _compute_risk_for_student(db, student_id: ObjectId, student_name: str = ""):
    """
    Kira risiko dari data sebenar MongoDB sahaja.
    Faktor: bilangan kesalahan, kes OLAT terbuka, lewat balik.
    """
    offences_count = await db.offences.count_documents({"student_id": student_id})
    olat_open = await db.olat_cases.count_documents({
        "student_id": student_id,
        "status": {"$in": ["open", "in_progress"]},
    })
    late_returns = await db.movement_logs.count_documents({
        "student_id": student_id,
        "is_late_return": True,
    })
    # Weighted score
    score = offences_count * 2 + olat_open * 5 + late_returns * 1
    if score <= 2:
        band = BAND_LOW
    elif score <= 6:
        band = BAND_MEDIUM
    else:
        band = BAND_HIGH
    return {
        "student_id": str(student_id),
        "student_name": student_name,
        "score": score,
        "band": band,
        "factors": {
            "offences_count": offences_count,
            "olat_open_count": olat_open,
            "late_returns_count": late_returns,
        },
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/profiles")
async def list_risk_profiles(
    band: Optional[str] = None,
    limit: int = Query(100, le=500),
    current_user: dict = Depends(require_warden_admin()),
):
    """
    Senarai profil risiko pelajar. Data 100% dari MongoDB (offences, olat_cases, movement_logs).
    """
    db = get_db()
    # Get all student ids that appear in offences, olat_cases, or movement_logs (to avoid scanning all students)
    off_ids = await db.offences.distinct("student_id")
    olat_ids = await db.olat_cases.distinct("student_id")
    move_ids = await db.movement_logs.distinct("student_id")
    all_ids = list(set(off_ids) | set(olat_ids) | set(move_ids))
    # Include students with total_offences > 0 or last_offence_at
    students_with_offences = await db.students.find(
        {"$or": [{"total_offences": {"$gt": 0}}, {"last_offence_at": {"$exists": True}}]}
    ).to_list(500)
    for s in students_with_offences:
        all_ids.append(s["_id"])
    all_ids = list(set(all_ids))
    # Ensure ObjectId
    try:
        all_ids = [ObjectId(str(x)) for x in all_ids]
    except Exception:
        all_ids = [x for x in all_ids if isinstance(x, ObjectId)]
    results = []
    for sid in all_ids[:limit]:
        student = await db.students.find_one({"_id": sid})
        if not student:
            user = await db.users.find_one({"_id": sid, "role": "pelajar"})
            student_name = (user or {}).get("full_name", (user or {}).get("fullName", "Unknown"))
        else:
            student_name = student.get("full_name", "Unknown")
        profile = await _compute_risk_for_student(db, sid, student_name)
        if band and profile["band"] != band:
            continue
        results.append(profile)
    results.sort(key=lambda x: (-x["score"], x["student_name"]))
    return {"profiles": results, "source": "mongodb_live"}


@router.get("/profiles/student/{student_id}")
async def get_risk_profile_student(
    student_id: str,
    current_user: dict = Depends(require_warden_admin()),
):
    """Profil risiko satu pelajar. Data dari MongoDB sahaja."""
    db = get_db()
    from services.hostel_data_sync import fetch_live_student
    student = await fetch_live_student(db, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    student_name = student.get("full_name", student.get("fullName", "Unknown"))
    profile = await _compute_risk_for_student(db, ObjectId(student_id), student_name)
    return profile


@router.get("/summary")
async def risk_summary(current_user: dict = Depends(require_warden_admin())):
    """Ringkasan bilangan pelajar ikut band risiko (data real)."""
    db = get_db()
    off_ids = await db.offences.distinct("student_id")
    olat_ids = await db.olat_cases.distinct("student_id")
    move_ids = await db.movement_logs.distinct("student_id")
    students_with_offences = await db.students.find(
        {"$or": [{"total_offences": {"$gt": 0}}, {"last_offence_at": {"$exists": True}}]}
    ).to_list(500)
    all_ids = list(set(off_ids) | set(olat_ids) | set(move_ids) | {s["_id"] for s in students_with_offences})
    low = medium = high = 0
    for sid in all_ids:
        profile = await _compute_risk_for_student(db, sid, "")
        if profile["band"] == BAND_LOW:
            low += 1
        elif profile["band"] == BAND_MEDIUM:
            medium += 1
        else:
            high += 1
    return {
        "low": low,
        "medium": medium,
        "high": high,
        "total_tracked": len(all_ids),
    }
