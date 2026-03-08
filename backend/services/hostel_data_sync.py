"""
Hostel Data Sync Service - e-ASRAMA PINTAR
Synchronize all hostel operations with real MongoDB data.
No mock data, no separate DB. All reads/writes use master collections.

Integration mapping (WAJIB):
- students: db.students (master pelajar, linked to parent_id)
- users: db.users (pelajar role = pelajar asrama, warden, admin, parent)
- hostel_records: db.hostel_records (keluar/masuk/pulang bermalam, student_id -> students/users)
- movement_logs: db.movement_logs (semua pergerakan, student_id link live)
- hostel_blocks: db.hostel_blocks (blok asrama, warden_id -> users)
- notifications: db.notifications (user_id -> users, for parent/warden alerts)
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any
from bson import ObjectId


async def notify_parent(db, parent_id, title: str, message: str, notif_type: str = "info", link: Optional[str] = None):
    """Simpan notifikasi untuk ibu bapa (Fasa 4 - live sync)."""
    if not parent_id:
        return
    await db.notifications.insert_one({
        "user_id": parent_id if isinstance(parent_id, ObjectId) else ObjectId(str(parent_id)),
        "title": title,
        "message": message,
        "type": notif_type,
        "is_read": False,
        "link": link,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


# Collections used by hostel module (real MongoDB only)
INTEGRATION_COLLECTIONS = {
    "students": "Master pelajar; hostel_records.student_id rujuk ke sini atau users",
    "users": "Pelajar (role=pelajar), warden, admin, parent; auth & profil",
    "hostel_records": "Rekod keluar/masuk/pulang bermalam; student_id link ke students/users",
    "movement_logs": "Log pergerakan pelajar (keluar/masuk/outing/QR); student_id link live ke students/users",
    "hostel_blocks": "Blok asrama; warden_id link ke users",
    "notifications": "Notifikasi ibu bapa/warden; user_id link ke users",
}


async def get_parent_id_for_student(db, student_id: str):
    """
    Return parent user ObjectId for a student (for notifikasi ibu bapa).
    Resolve from students collection (parent_id) or via users pelajar.
    """
    try:
        oid = ObjectId(student_id)
    except Exception:
        return None
    student = await db.students.find_one({"_id": oid})
    if student and student.get("parent_id"):
        return student["parent_id"]
    user = await db.users.find_one({"_id": oid, "role": "pelajar"})
    if user:
        student_by_user = await db.students.find_one({"user_id": oid})
        if student_by_user and student_by_user.get("parent_id"):
            return student_by_user["parent_id"]
        student_by_matric = await db.students.find_one({"matric_number": user.get("matric_number")})
        if student_by_matric and student_by_matric.get("parent_id"):
            return student_by_matric["parent_id"]
    return None


async def get_student_id_for_pelajar_user(db, user: dict):
    """
    Return student document _id (from db.students) for a pelajar user.
    Used so pelajar can apply outing/pulang bermalam without passing student_id.
    """
    if user.get("role") != "pelajar":
        return None
    student = await db.students.find_one({"user_id": user["_id"]})
    if student:
        return student["_id"]
    matric = user.get("matric_number")
    if matric:
        student = await db.students.find_one({"matric_number": matric})
        if student:
            return student["_id"]
    return None


async def fetch_live_student(db, student_id: str) -> Optional[Dict[str, Any]]:
    """
    Resolve student from real MongoDB only (no mock).
    Try users (pelajar) then students collection. Used by hostel + movement flows.
    """
    if not student_id:
        return None
    try:
        oid = ObjectId(student_id)
    except Exception:
        return None
    # Pelajar may be in users (role=pelajar) or in students collection
    user = await db.users.find_one({"_id": oid, "role": "pelajar"})
    if user:
        return user
    student = await db.students.find_one({"_id": oid})
    return student


async def get_integration_status(db) -> Dict[str, Any]:
    """
    Real-time integration status from MongoDB (for dashboard/sync verification).
    All counts from live DB.
    """
    total_students = await db.students.count_documents({})
    pelajar_users = await db.users.count_documents({"role": "pelajar"})
    total_hostel_records = await db.hostel_records.count_documents({})
    total_blocks = await db.hostel_blocks.count_documents({"is_active": True})
    # Out (keluar without actual_return)
    pipeline = [
        {"$match": {"check_type": "keluar", "actual_return": {"$exists": False}}},
        {"$group": {"_id": "$student_id"}}
    ]
    cursor = await db.hostel_records.aggregate(pipeline).to_list(10000)
    out_count = len(cursor)
    total_movement_logs = await db.movement_logs.count_documents({})
    late_returns = await db.movement_logs.count_documents({"is_late_return": True})
    return {
        "synced": True,
        "collections": INTEGRATION_COLLECTIONS,
        "counts": {
            "students": total_students,
            "pelajar_users": pelajar_users,
            "hostel_records": total_hostel_records,
            "movement_logs": total_movement_logs,
            "late_returns": late_returns,
            "hostel_blocks": total_blocks,
            "currently_out": out_count,
        },
    }


# Movement types for movement_logs (Fasa 2 - E-Hostel)
MOVEMENT_TYPE_CHECKOUT = "checkout"
MOVEMENT_TYPE_CHECKIN = "checkin"
MOVEMENT_TYPE_PULANG_BERMALAM = "pulang_bermalam"
MOVEMENT_TYPE_OUTING = "outing"
MOVEMENT_TYPE_QR_OUT = "qr_out"
MOVEMENT_TYPE_QR_IN = "qr_in"


async def append_movement_log(
    db,
    student_id: ObjectId,
    student_name: str,
    movement_type: str,
    *,
    recorded_by: str,
    expected_return: Optional[str] = None,
    actual_return: Optional[str] = None,
    is_late_return: bool = False,
    source_record_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Any:
    """
    Tulis satu rekod ke movement_logs. Semua data dari MongoDB, real-time.
    """
    doc = {
        "student_id": student_id,
        "student_name": student_name,
        "movement_type": movement_type,
        "recorded_by": recorded_by,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if expected_return is not None:
        doc["expected_return"] = expected_return
    if actual_return is not None:
        doc["actual_return"] = actual_return
    doc["is_late_return"] = is_late_return
    if source_record_id:
        doc["source_record_id"] = source_record_id
    if metadata:
        doc["metadata"] = metadata
    result = await db.movement_logs.insert_one(doc)
    return result.inserted_id
