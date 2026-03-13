"""
Admin Sync Routes - Data synchronization between students and users collections
"""
from datetime import datetime, timezone
from bson import ObjectId

from fastapi import APIRouter, HTTPException, Depends, Query
from passlib.context import CryptContext

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter(prefix="/api/admin/sync", tags=["Admin Sync"])

# Database reference - will be set from server.py
db = None
scheduler = None
run_auto_sync_job = None
IntervalTrigger = None
scheduler_logger = None

# Auth dependencies - will be set from server.py
require_roles = None
log_audit = None


def init_sync_routes(
    database, 
    _scheduler, 
    _run_auto_sync_job, 
    _IntervalTrigger,
    _scheduler_logger,
    _require_roles, 
    _log_audit
):
    """Initialize database and dependencies"""
    global db, scheduler, run_auto_sync_job, IntervalTrigger, scheduler_logger, require_roles, log_audit
    db = database
    scheduler = _scheduler
    run_auto_sync_job = _run_auto_sync_job
    IntervalTrigger = _IntervalTrigger
    scheduler_logger = _scheduler_logger
    require_roles = _require_roles
    log_audit = _log_audit


@router.get("/status")
async def get_sync_status(current_user: dict = Depends(lambda: require_roles("superadmin", "admin"))):
    """Get data synchronization status between users and students"""
    total_users = await db.users.count_documents({})
    pelajar_users = await db.users.count_documents({"role": "pelajar"})
    parent_users = await db.users.count_documents({"role": "parent"})
    total_students = await db.students.count_documents({})
    
    students_without_user = await db.students.count_documents({"user_id": {"$exists": False}})
    students_without_religion = await db.students.count_documents({"religion": {"$exists": False}})
    pelajar_without_religion = await db.users.count_documents({"role": "pelajar", "religion": {"$exists": False}})
    orphan_students = await db.students.count_documents({"parent_id": {"$exists": False}})
    
    form_counts = {}
    async for student in db.students.find({"status": "approved"}):
        form_value = student.get("form")
        if form_value is None:
            continue
        form_counts[form_value] = form_counts.get(form_value, 0) + 1
    by_form = sorted(
        [{"_id": form_value, "count": count} for form_value, count in form_counts.items()],
        key=lambda item: item["_id"],
    )[:10]
    students_by_form = {str(item["_id"]): item["count"] for item in by_form}
    
    return {
        "summary": {
            "total_users": total_users,
            "pelajar_users": pelajar_users,
            "parent_users": parent_users,
            "total_students": total_students
        },
        "issues": {
            "students_without_user_account": students_without_user,
            "students_without_religion": students_without_religion,
            "pelajar_users_without_religion": pelajar_without_religion,
            "orphan_students": orphan_students
        },
        "students_by_form": students_by_form,
        "sync_needed": (students_without_user > 0 or students_without_religion > 0 or pelajar_without_religion > 0)
    }


@router.post("/cleanup-orphan-users")
async def cleanup_orphan_pelajar_users(current_user: dict = Depends(lambda: require_roles("superadmin"))):
    """Remove pelajar users that don't have a matching student record"""
    results = {
        "deleted_count": 0,
        "deleted_users": [],
        "errors": []
    }
    
    pelajar_users = await db.users.find({"role": "pelajar"}).to_list(1000)
    students = await db.students.find({}).to_list(1000)
    student_matrics = set(s.get("matric_number") for s in students if s.get("matric_number"))
    student_ics = set(s.get("ic_number") for s in students if s.get("ic_number"))
    
    for user in pelajar_users:
        user_matric = user.get("matric_number", "")
        user_ic = user.get("ic_number", "")
        
        has_matching_student = (
            (user_matric and user_matric in student_matrics) or
            (user_ic and user_ic in student_ics)
        )
        
        if not has_matching_student:
            try:
                await db.users.delete_one({"_id": user["_id"]})
                results["deleted_count"] += 1
                results["deleted_users"].append({
                    "name": user.get("full_name"),
                    "matric": user_matric,
                    "email": user.get("email")
                })
            except Exception as e:
                results["errors"].append(f"Error deleting {user.get('full_name')}: {str(e)}")
    
    await log_audit(
        current_user, "CLEANUP_ORPHAN_USERS", "admin",
        f"Membersihkan {results['deleted_count']} akaun pelajar tanpa rekod student"
    )
    
    return {
        "message": f"Berjaya memadam {results['deleted_count']} akaun pelajar yang tidak mempunyai rekod student",
        "results": results
    }


@router.post("/students")
async def sync_students_data(current_user: dict = Depends(lambda: require_roles("superadmin", "admin"))):
    """Synchronize students data - create user accounts and set religion"""
    results = {
        "users_created": 0,
        "religion_updated": 0,
        "errors": []
    }
    
    students_without_user = await db.students.find({"user_id": {"$exists": False}}).to_list(1000)
    
    for student in students_without_user:
        try:
            existing_user = await db.users.find_one({"matric_number": student.get("matric_number")})
            
            if existing_user:
                await db.students.update_one(
                    {"_id": student["_id"]},
                    {"$set": {"user_id": existing_user["_id"]}}
                )
            else:
                email = f"{student.get('matric_number', '').lower()}@pelajar.mrsm.edu.my"
                password_hash = pwd_context.hash("student123")
                
                user_doc = {
                    "email": email,
                    "password": password_hash,
                    "full_name": student.get("full_name", ""),
                    "phone": student.get("phone", ""),
                    "ic_number": student.get("ic_number", ""),
                    "matric_number": student.get("matric_number", ""),
                    "role": "pelajar",
                    "religion": student.get("religion", "Islam"),
                    "is_active": True,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                
                user_result = await db.users.insert_one(user_doc)
                
                await db.students.update_one(
                    {"_id": student["_id"]},
                    {"$set": {"user_id": user_result.inserted_id}}
                )
                results["users_created"] += 1
                
        except Exception as e:
            results["errors"].append(f"Error for {student.get('matric_number')}: {str(e)}")
    
    students_without_religion = await db.students.find({"religion": {"$exists": False}}).to_list(1000)
    for student in students_without_religion:
        await db.students.update_one(
            {"_id": student["_id"]},
            {"$set": {"religion": "Islam"}}
        )
        results["religion_updated"] += 1
    
    pelajar_without_religion = await db.users.find({"role": "pelajar", "religion": {"$exists": False}}).to_list(1000)
    for user in pelajar_without_religion:
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"religion": "Islam"}}
        )
        results["religion_updated"] += 1
    
    await log_audit(
        current_user, "SYNC_DATA", "admin",
        f"Sinkronisasi data: {results['users_created']} akaun dicipta, {results['religion_updated']} agama dikemaskini"
    )
    
    return {
        "message": "Sinkronisasi berjaya",
        "results": results
    }


@router.post("/full")
async def full_sync_data(current_user: dict = Depends(lambda: require_roles("superadmin"))):
    """
    Complete data synchronization - performs both cleanup and sync operations.
    """
    results = {
        "cleanup": {
            "orphan_users_deleted": 0,
            "deleted_details": []
        },
        "sync": {
            "users_created": 0,
            "religion_updated": 0
        },
        "errors": [],
        "before": {},
        "after": {}
    }
    
    results["before"] = {
        "total_users": await db.users.count_documents({}),
        "pelajar_users": await db.users.count_documents({"role": "pelajar"}),
        "total_students": await db.students.count_documents({})
    }
    
    # Cleanup
    pelajar_users = await db.users.find({"role": "pelajar"}).to_list(1000)
    students = await db.students.find({}).to_list(1000)
    student_matrics = set(s.get("matric_number") for s in students if s.get("matric_number"))
    student_ics = set(s.get("ic_number") for s in students if s.get("ic_number"))
    
    for user in pelajar_users:
        user_matric = user.get("matric_number", "")
        user_ic = user.get("ic_number", "")
        
        has_matching_student = (
            (user_matric and user_matric in student_matrics) or
            (user_ic and user_ic in student_ics)
        )
        
        if not has_matching_student:
            try:
                await db.users.delete_one({"_id": user["_id"]})
                results["cleanup"]["orphan_users_deleted"] += 1
                results["cleanup"]["deleted_details"].append(user.get("full_name", "Unknown"))
            except Exception as e:
                results["errors"].append(f"Cleanup error: {str(e)}")
    
    # Create users
    students_without_user = await db.students.find({"user_id": {"$exists": False}}).to_list(1000)
    
    for student in students_without_user:
        try:
            existing_user = await db.users.find_one({"matric_number": student.get("matric_number")})
            
            if existing_user:
                await db.students.update_one(
                    {"_id": student["_id"]},
                    {"$set": {"user_id": existing_user["_id"]}}
                )
            else:
                email = f"{student.get('matric_number', '').lower()}@pelajar.mrsm.edu.my"
                password_hash = pwd_context.hash("student123")
                
                user_doc = {
                    "email": email,
                    "password": password_hash,
                    "full_name": student.get("full_name", ""),
                    "phone": student.get("phone", ""),
                    "ic_number": student.get("ic_number", ""),
                    "matric_number": student.get("matric_number", ""),
                    "role": "pelajar",
                    "religion": student.get("religion", "Islam"),
                    "is_active": True,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                
                user_result = await db.users.insert_one(user_doc)
                await db.students.update_one(
                    {"_id": student["_id"]},
                    {"$set": {"user_id": user_result.inserted_id}}
                )
                results["sync"]["users_created"] += 1
                
        except Exception as e:
            results["errors"].append(f"Sync error for {student.get('matric_number')}: {str(e)}")
    
    # Update religion
    students_without_religion = await db.students.find({"religion": {"$exists": False}}).to_list(1000)
    for student in students_without_religion:
        await db.students.update_one(
            {"_id": student["_id"]},
            {"$set": {"religion": "Islam"}}
        )
        results["sync"]["religion_updated"] += 1
    
    pelajar_without_religion = await db.users.find({"role": "pelajar", "religion": {"$exists": False}}).to_list(1000)
    for user in pelajar_without_religion:
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"religion": "Islam"}}
        )
        results["sync"]["religion_updated"] += 1
    
    results["after"] = {
        "total_users": await db.users.count_documents({}),
        "pelajar_users": await db.users.count_documents({"role": "pelajar"}),
        "total_students": await db.students.count_documents({})
    }
    
    await log_audit(
        current_user, "FULL_SYNC", "admin",
        f"Sinkronisasi penuh: {results['cleanup']['orphan_users_deleted']} dipadam, {results['sync']['users_created']} dicipta"
    )
    
    return {
        "success": True,
        "message": "Sinkronisasi data berjaya",
        "results": results
    }


@router.get("/auto-settings")
async def get_auto_sync_settings(current_user: dict = Depends(lambda: require_roles("superadmin", "admin"))):
    """Get auto-sync settings and status"""
    settings = await db.settings.find_one({"type": "auto_sync"})
    
    recent_logs = await db.scheduler_logs.find(
        {"type": "auto_sync"}
    ).sort("run_at", -1).limit(5).to_list(5)
    
    for log in recent_logs:
        log["_id"] = str(log["_id"])
    
    return {
        "enabled": settings.get("enabled", False) if settings else False,
        "interval_hours": settings.get("interval_hours", 24) if settings else 24,
        "last_run": settings.get("last_run") if settings else None,
        "last_results": settings.get("last_results") if settings else None,
        "recent_logs": recent_logs
    }


@router.put("/auto-settings")
async def update_auto_sync_settings(
    enabled: bool = Query(..., description="Enable or disable auto-sync"),
    interval_hours: int = Query(24, ge=1, le=168, description="Interval in hours (1-168)"),
    current_user: dict = Depends(lambda: require_roles("superadmin"))
):
    """Update auto-sync settings"""
    now = datetime.now(timezone.utc)
    
    await db.settings.update_one(
        {"type": "auto_sync"},
        {
            "$set": {
                "enabled": enabled,
                "interval_hours": interval_hours,
                "updated_at": now.isoformat(),
                "updated_by": current_user.get("full_name")
            }
        },
        upsert=True
    )
    
    try:
        scheduler.remove_job("auto_sync_data")
        scheduler.add_job(
            run_auto_sync_job,
            trigger=IntervalTrigger(hours=interval_hours),
            id="auto_sync_data",
            name="Auto-sync students and users data",
            replace_existing=True
        )
        scheduler_logger.info(f"Auto-sync job rescheduled: interval={interval_hours}h, enabled={enabled}")
    except Exception as e:
        scheduler_logger.error(f"Failed to reschedule auto-sync job: {e}")
    
    await log_audit(
        current_user, "UPDATE_AUTO_SYNC", "settings",
        f"Auto-sync dikemaskini: enabled={enabled}, interval={interval_hours}jam"
    )
    
    return {
        "success": True,
        "message": f"Tetapan auto-sync dikemaskini. {'Aktif' if enabled else 'Tidak aktif'}, setiap {interval_hours} jam",
        "settings": {
            "enabled": enabled,
            "interval_hours": interval_hours
        }
    }


@router.post("/trigger-now")
async def trigger_auto_sync_now(current_user: dict = Depends(lambda: require_roles("superadmin"))):
    """Manually trigger auto-sync job immediately"""
    try:
        await run_auto_sync_job()
        
        settings = await db.settings.find_one({"type": "auto_sync"})
        
        await log_audit(
            current_user, "TRIGGER_AUTO_SYNC", "admin",
            "Auto-sync dicetuskan secara manual"
        )
        
        return {
            "success": True,
            "message": "Auto-sync berjaya dijalankan",
            "results": settings.get("last_results") if settings else None
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Gagal menjalankan auto-sync: {str(e)}"
        }
