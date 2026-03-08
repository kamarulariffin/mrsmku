"""
Dashboard Guru Kelas - MRSMKU Portal
Modul untuk guru melihat status yuran dan pelajar dalam kelas
"""
from datetime import datetime, timezone
from typing import List, Optional, Callable
from bson import ObjectId

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

router = APIRouter(prefix="/api/guru-dashboard", tags=["Guru Dashboard"])

# Database reference - will be set from server.py
_get_db_func: Callable = None
_get_current_user_func: Callable = None
_log_audit_func: Callable = None
_ROLES: dict = None


def init_router(get_db_func, auth_func, audit_func, roles):
    """Initialize database and dependency references"""
    global _get_db_func, _get_current_user_func, _log_audit_func, _ROLES
    _get_db_func = get_db_func
    _get_current_user_func = auth_func
    _log_audit_func = audit_func
    _ROLES = roles


def get_db():
    return _get_db_func()


# ============ HELPER FUNCTIONS ============

def serialize_student_fee_record(student: dict, yuran_records: list) -> dict:
    """Serialize student with yuran summary"""
    total_fees = sum(r.get("total_amount", 0) for r in yuran_records)
    paid_amount = sum(r.get("paid_amount", 0) for r in yuran_records)
    outstanding = total_fees - paid_amount
    
    # Determine fee status
    if total_fees == 0:
        fee_status = "tiada_yuran"
    elif paid_amount >= total_fees:
        fee_status = "selesai"
    elif paid_amount > 0:
        fee_status = "separa"
    else:
        fee_status = "belum_bayar"
    
    return {
        "student_id": str(student["_id"]),
        "full_name": student.get("full_name", ""),
        "matric_number": student.get("matric_number", ""),
        "ic_number": student.get("ic_number", ""),
        "form": student.get("form", 1),
        "class_name": student.get("class_name", ""),
        "gender": student.get("gender", ""),
        "religion": student.get("religion", "Islam"),
        "bangsa": student.get("bangsa", "Melayu"),
        "state": student.get("state", ""),
        "block_name": student.get("block_name", ""),
        "room_number": student.get("room_number", ""),
        "total_fees": total_fees,
        "paid_amount": paid_amount,
        "outstanding": outstanding,
        "fee_status": fee_status,
        "progress_percent": (paid_amount / total_fees * 100) if total_fees > 0 else 0,
        "yuran_records": [
            {
                "id": str(r["_id"]),
                "tahun": r.get("tahun"),
                "tingkatan": r.get("tingkatan"),
                "set_yuran_nama": r.get("set_yuran_nama", ""),
                "total_amount": r.get("total_amount", 0),
                "paid_amount": r.get("paid_amount", 0),
                "status": r.get("status", "pending")
            }
            for r in yuran_records
        ]
    }


# ============ API ENDPOINTS ============

@router.get("/overview")
async def get_guru_dashboard_overview(
    tahun: int = Query(None, description="Filter by year"),
    credentials = None
):
    """
    Dashboard overview untuk Guru Kelas
    Menunjukkan statistik yuran untuk pelajar dalam kelas yang ditugaskan
    """
    from fastapi import Request
    from fastapi.security import HTTPAuthorizationCredentials
    
    # Get current user through dependency injection
    db = get_db()
    
    # This will be called with current_user from the endpoint
    # For now, return 403 as we need auth
    return {"error": "Auth required"}


@router.get("/stats")
async def get_class_fee_stats(
    tahun: int = Query(None, description="Tahun akademik"),
    tingkatan: int = Query(None, ge=1, le=5, description="Tingkatan"),
):
    """
    Statistik ringkas untuk kelas (digunakan oleh endpoint dengan auth)
    """
    pass


@router.get("/students")
async def get_students_with_fees():
    """
    Senarai pelajar dalam kelas dengan status yuran (digunakan oleh endpoint dengan auth)
    """
    pass


# These endpoints will be registered in server.py with proper authentication
