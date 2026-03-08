"""
Dashboard Routes - All role-based dashboard endpoints
Extracted from server.py for better code organization
Refactored using the users.py pattern with proper dependency injection
"""
from datetime import datetime, timezone
from typing import Optional, Callable

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])
security = HTTPBearer(auto_error=False)

# ============ INJECTED DEPENDENCIES ============
_get_db_func: Callable = None
_get_current_user_func: Callable = None
_serialize_student_func: Callable = None
_ROLES: dict = None


def init_router(get_db_func, auth_func, serialize_student_func, roles):
    """
    Initialize router with dependencies from server.py
    
    Args:
        get_db_func: Function that returns database instance
        auth_func: get_current_user function from server.py
        serialize_student_func: serialize_student function from server.py
        roles: ROLES dictionary
    """
    global _get_db_func, _get_current_user_func, _serialize_student_func, _ROLES
    
    _get_db_func = get_db_func
    _get_current_user_func = auth_func
    _serialize_student_func = serialize_student_func
    _ROLES = roles


# ============ LOCAL DEPENDENCY WRAPPERS ============

def get_db():
    """Get database instance"""
    return _get_db_func()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Wrapper for authentication - calls server.py's get_current_user"""
    if not credentials:
        raise HTTPException(status_code=401, detail="Token diperlukan")
    return await _get_current_user_func(credentials)


def require_roles(*roles):
    """Local require_roles dependency factory"""
    async def role_checker(credentials: HTTPAuthorizationCredentials = Depends(security)):
        if not credentials:
            raise HTTPException(status_code=401, detail="Token diperlukan")
        current_user = await _get_current_user_func(credentials)
        if roles and current_user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Akses ditolak untuk role ini")
        return current_user
    return role_checker


# ============ PARENT DASHBOARD ============

@router.get("/parent")
async def get_parent_dashboard(current_user: dict = Depends(get_current_user)):
    """Parent dashboard"""
    db = get_db()
    students = await db.students.find({"parent_id": current_user["_id"]}).to_list(100)
    student_ids = [s["_id"] for s in students]
    
    yuran_records = await db.student_yuran.find({"student_id": {"$in": student_ids}}).to_list(1000)
    total_fees = sum(r.get("total_amount", 0) for r in yuran_records)
    total_paid = sum(r.get("paid_amount", 0) for r in yuran_records)
    pending_fees = [r for r in yuran_records if r.get("status") in ["pending", "partial"]]
    
    unread_notifications = await db.notifications.count_documents({
        "user_id": current_user["_id"],
        "is_read": False
    })
    
    return {
        "total_children": len(students),
        "approved_children": len([s for s in students if s["status"] == "approved"]),
        "pending_children": len([s for s in students if s["status"] == "pending"]),
        "total_fees": total_fees,
        "total_paid": total_paid,
        "outstanding": total_fees - total_paid,
        "pending_fees_count": len(pending_fees),
        "unread_notifications": unread_notifications
    }


# ============ ADMIN DASHBOARD ============

@router.get("/admin")
async def get_admin_dashboard(current_user: dict = Depends(require_roles("superadmin", "admin", "bendahari"))):
    """Admin/Bendahari dashboard - Using student_yuran collection"""
    db = get_db()
    current_year = datetime.now().year
    
    total_students = await db.students.count_documents({})
    pending_students = await db.students.count_documents({"status": "pending"})
    approved_students = await db.students.count_documents({"status": "approved"})
    
    # Count by role
    role_counts = {}
    for role in _ROLES.keys():
        role_counts[role] = await db.users.count_documents({"role": role})
    
    # Get fees from student_yuran collection (new system)
    yuran_records = await db.student_yuran.find({"tahun": current_year}).to_list(10000)
    total_fees = sum(r.get("total_amount", 0) for r in yuran_records)
    total_collected = sum(r.get("paid_amount", 0) for r in yuran_records)
    
    # Count students with outstanding
    students_with_outstanding = len([r for r in yuran_records if r.get("total_amount", 0) > r.get("paid_amount", 0)])
    students_fully_paid = len([r for r in yuran_records if r.get("paid_amount", 0) >= r.get("total_amount", 0) and r.get("total_amount", 0) > 0])
    
    form_stats = []
    for form in range(1, 6):
        form_students = await db.students.count_documents({"form": form, "status": "approved"})
        form_yuran = [r for r in yuran_records if (r.get("tingkatan") == form or r.get("form") == form)]
        form_total = sum(r.get("total_amount", 0) for r in form_yuran)
        form_collected = sum(r.get("paid_amount", 0) for r in form_yuran)
        form_stats.append({
            "form": form,
            "students": form_students,
            "total_fees": form_total,
            "collected": form_collected,
            "outstanding": form_total - form_collected,
            "collection_rate": (form_collected / form_total * 100) if form_total > 0 else 0,
            "assigned_count": len(form_yuran)
        })
    
    # Get recent students
    recent_students = await db.students.find().sort("created_at", -1).limit(5).to_list(5)
    
    # Get set yuran count for current year
    try:
        set_yuran_count = await db.set_yuran.count_documents({"tahun": current_year, "is_active": True})
    except Exception:
        set_yuran_count = len({
            str(r.get("set_yuran_id"))
            for r in yuran_records
            if r.get("set_yuran_id")
        })
    
    # Get recent payments
    recent_payments = []
    for r in yuran_records:
        for payment in r.get("payments", [])[-5:]:
            recent_payments.append({
                "student_name": r.get("student_name"),
                "amount": payment.get("amount", 0),
                "receipt_number": payment.get("receipt_number"),
                "paid_at": payment.get("paid_at"),
                "payment_method": payment.get("payment_method")
            })
    recent_payments = sorted(recent_payments, key=lambda x: x.get("paid_at", ""), reverse=True)[:5]
    
    return {
        "year": current_year,
        "total_students": total_students,
        "pending_students": pending_students,
        "approved_students": approved_students,
        "role_counts": role_counts,
        "total_fees": total_fees,
        "total_collected": total_collected,
        "total_outstanding": total_fees - total_collected,
        "collection_rate": (total_collected / total_fees * 100) if total_fees > 0 else 0,
        "students_with_outstanding": students_with_outstanding,
        "students_fully_paid": students_fully_paid,
        "set_yuran_count": set_yuran_count,
        "form_stats": form_stats,
        "recent_students": [_serialize_student_func(s) for s in recent_students],
        "recent_payments": recent_payments
    }


# ============ PELAJAR DASHBOARD ============

@router.get("/pelajar")
async def get_pelajar_dashboard(current_user: dict = Depends(require_roles("pelajar"))):
    """Student dashboard for e-Hostel"""
    db = get_db()
    matric = current_user.get("matric_number")
    ic = current_user.get("ic_number")
    
    # Get student record
    student = await db.students.find_one({
        "$or": [
            {"matric_number": matric},
            {"ic_number": ic}
        ]
    })
    
    if not student:
        return {
            "student": None,
            "fees": [],
            "hostel_records": [],
            "message": "Rekod pelajar tidak dijumpai"
        }
    
    # Get yuran records (new system)
    yuran_records = await db.student_yuran.find({"student_id": student["_id"]}).to_list(200)
    total_fees = sum(r.get("total_amount", 0) for r in yuran_records)
    total_paid = sum(r.get("paid_amount", 0) for r in yuran_records)
    
    # Get hostel records
    hostel_records = await db.hostel_records.find({"student_id": student["_id"]}).sort("created_at", -1).limit(10).to_list(10)
    
    # Get sickbay records
    sickbay_records = await db.sickbay_records.find({"student_id": student["_id"]}).sort("created_at", -1).limit(5).to_list(5)
    
    return {
        "student": {
            "id": str(student["_id"]),
            "full_name": student["full_name"],
            "matric_number": student["matric_number"],
            "form": student["form"],
            "class_name": student["class_name"],
            "block_name": student["block_name"],
            "room_number": student["room_number"],
            "state": student["state"]
        },
        "total_fees": total_fees,
        "total_paid": total_paid,
        "outstanding": total_fees - total_paid,
        "hostel_records": [
            {
                "id": str(r["_id"]),
                "check_type": r["check_type"],
                "tarikh_keluar": r.get("tarikh_keluar"),
                "tarikh_pulang": r.get("tarikh_pulang"),
                "kategori": r["kategori"],
                "remarks": r.get("remarks")
            } for r in hostel_records
        ],
        "sickbay_records": [
            {
                "id": str(r["_id"]),
                "check_in_time": r["check_in_time"],
                "symptoms": r["symptoms"],
                "check_out_time": r.get("check_out_time")
            } for r in sickbay_records
        ]
    }


# ============ WARDEN DASHBOARD ============
# Warden ialah role berasingan; hanya pengguna role "warden" boleh akses dashboard ini.

@router.get("/warden")
async def get_warden_dashboard(current_user: dict = Depends(require_roles("warden"))):
    """Dashboard warden – pengurusan outing dan Bilik Sakit (role warden sahaja)."""
    db = get_db()
    block = current_user.get("assigned_block", "")
    
    total_students = await db.students.count_documents({"block_name": block, "status": "approved"})
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out_today = await db.hostel_records.count_documents({
        "check_type": "keluar",
        "tarikh_keluar": {"$regex": f"^{today}"}
    })
    
    sickbay_today = await db.sickbay_records.count_documents({
        "check_in_time": {"$regex": f"^{today}"}
    })
    
    return {
        "block": block,
        "total_students": total_students,
        "out_today": out_today,
        "sickbay_today": sickbay_today
    }


# ============ GUARD DASHBOARD ============

@router.get("/guard")
async def get_guard_dashboard(current_user: dict = Depends(require_roles("guard"))):
    """Guard dashboard"""
    db = get_db()
    total_vehicles = await db.vehicles.count_documents({})
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    scans_today = await db.vehicle_scans.count_documents({
        "scan_time": {"$regex": f"^{today}"}
    })
    
    return {
        "total_vehicles": total_vehicles,
        "scans_today": scans_today
    }


# ============ GURU DASHBOARD ============

@router.get("/guru")
async def get_guru_dashboard(current_user: dict = Depends(require_roles("guru_kelas", "guru_homeroom"))):
    """Teacher dashboard - uses assigned_form and assigned_class"""
    db = get_db()
    assigned_form = current_user.get("assigned_form")
    assigned_class = current_user.get("assigned_class", "")
    
    # Build query for students in this class
    student_query = {"status": "approved"}
    if assigned_form:
        student_query["form"] = assigned_form
    if assigned_class:
        student_query["class_name"] = assigned_class
    
    students = await db.students.find(student_query).to_list(100)
    student_ids = [s["_id"] for s in students]
    
    # Get yuran from student_yuran collection
    current_year = datetime.now().year
    yuran_records = await db.student_yuran.find({
        "student_id": {"$in": student_ids},
        "tahun": current_year
    }).to_list(1000)
    
    total_fees = sum(r.get("total_amount", 0) for r in yuran_records)
    total_collected = sum(r.get("paid_amount", 0) for r in yuran_records)
    outstanding = total_fees - total_collected
    
    return {
        "tingkatan": assigned_form,
        "class_name": assigned_class,
        "full_class": f"T{assigned_form} {assigned_class}" if assigned_form and assigned_class else "-",
        "total_students": len(students),
        "total_fees": total_fees,
        "total_collected": total_collected,
        "outstanding": outstanding,
        "collection_rate": (total_collected / total_fees * 100) if total_fees > 0 else 0
    }
