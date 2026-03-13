"""
Students Routes - MRSMKU Portal
Pengurusan Pelajar dengan Pagination
"""
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Callable
from bson import ObjectId
import re

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field, validator

router = APIRouter(prefix="/api/students-paginated", tags=["Students Paginated"])

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


# ============ VALIDATION HELPERS ============

def validate_name(name: str, field_name: str = "Nama") -> str:
    if not name or len(name) < 3:
        raise ValueError(f"{field_name} mesti sekurang-kurangnya 3 aksara")
    if re.search(r'\d', name):
        raise ValueError(f"{field_name} tidak boleh mengandungi nombor")
    return name.strip()


def validate_gender(gender: str) -> str:
    if gender.lower() not in ['male', 'female', 'lelaki', 'perempuan']:
        raise ValueError("Jantina mesti 'male' atau 'female'")
    if gender.lower() in ['lelaki']:
        return 'male'
    if gender.lower() in ['perempuan']:
        return 'female'
    return gender.lower()


def validate_class_name(class_name: str) -> str:
    if not class_name:
        return class_name
    valid_classes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 
                     'Bestari', 'Cemerlang', 'Dinamik', 'Efisien', 'Fokus', 
                     'Gemilang', 'Harmoni', 'Inovatif', 'Jauhari', 'Kreatif']
    if class_name not in valid_classes:
        raise ValueError("Format kelas tidak sah. Gunakan A-F atau nama kelas standard")
    return class_name


def validate_matric_number(matric: str) -> str:
    if not matric or len(matric) < 4:
        raise ValueError("Nombor matrik minimum 4 aksara")
    matric_clean = matric.strip().upper()
    if not re.match(r'^[A-Z0-9/-]+$', matric_clean):
        raise ValueError("Format nombor matrik tidak sah")
    return matric_clean


def validate_ic_number(ic: str) -> str:
    ic_clean = re.sub(r'[-\s]', '', ic)
    if len(ic_clean) != 12:
        raise ValueError("No. IC mesti 12 digit (contoh: 750925016913)")
    if not ic_clean.isdigit():
        raise ValueError("No. IC mesti mengandungi nombor sahaja")
    month = int(ic_clean[2:4])
    day = int(ic_clean[4:6])
    if month < 1 or month > 12:
        raise ValueError("No. IC tidak sah - bulan mesti antara 01-12")
    if day < 1 or day > 31:
        raise ValueError("No. IC tidak sah - hari mesti antara 01-31")
    return ic_clean


# ============ MODELS ============

class StudentCreate(BaseModel):
    full_name: str
    matric_number: str
    ic_number: str
    year: int
    form: int
    class_name: str
    block_name: Optional[str] = ""
    room_number: Optional[str] = ""
    state: str
    religion: str = "Islam"
    bangsa: str = "Melayu"
    gender: Optional[str] = None
    relationship: str = "BAPA"
    address: Optional[str] = None
    postcode: Optional[str] = None
    city: Optional[str] = None
    
    @validator('full_name')
    def validate_student_name(cls, v):
        return validate_name(v, "Nama pelajar")
    
    @validator('matric_number')
    def validate_student_matric(cls, v):
        return validate_matric_number(v)
    
    @validator('ic_number')
    def validate_student_ic(cls, v):
        return validate_ic_number(v) if v else v
    
    @validator('class_name')
    def validate_student_class(cls, v):
        return validate_class_name(v)
    
    @validator('gender')
    def validate_student_gender(cls, v):
        return validate_gender(v) if v else v
    
    @validator('relationship')
    def validate_student_relationship(cls, v):
        if v and v.upper() not in ['IBU', 'BAPA', 'PENJAGA']:
            raise ValueError("Hubungan mestilah IBU, BAPA, atau PENJAGA")
        return v.upper() if v else "BAPA"


class StudentUpdate(BaseModel):
    full_name: Optional[str] = None
    ic_number: Optional[str] = None
    year: Optional[int] = None
    form: Optional[int] = None
    class_name: Optional[str] = None
    block_name: Optional[str] = None
    room_number: Optional[str] = None
    state: Optional[str] = None
    religion: Optional[str] = None
    bangsa: Optional[str] = None
    gender: Optional[str] = None
    relationship: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    postcode: Optional[str] = None
    city: Optional[str] = None
    
    @validator('full_name')
    def validate_student_update_name(cls, v):
        return validate_name(v, "Nama pelajar") if v else v
    
    @validator('ic_number')
    def validate_student_update_ic(cls, v):
        return validate_ic_number(v) if v else v
    
    @validator('class_name')
    def validate_student_update_class(cls, v):
        return validate_class_name(v) if v else v
    
    @validator('gender')
    def validate_student_update_gender(cls, v):
        return validate_gender(v) if v else v
    
    @validator('relationship')
    def validate_student_update_relationship(cls, v):
        if v and v.upper() not in ['IBU', 'BAPA', 'PENJAGA']:
            raise ValueError("Hubungan mestilah IBU, BAPA, atau PENJAGA")
        return v.upper() if v else v
    
    @validator('form')
    def validate_student_update_form(cls, v):
        if v is not None and v not in [1, 2, 3, 4, 5]:
            raise ValueError("Tingkatan mesti 1-5")
        return v


class StudentResponse(BaseModel):
    id: str
    full_name: str
    matric_number: str
    ic_number: str
    year: int
    form: int
    class_name: str
    block_name: str
    room_number: str
    state: str
    status: str
    parent_id: str
    created_at: str
    religion: Optional[str] = "Islam"
    bangsa: Optional[str] = "Melayu"
    gender: Optional[str] = None
    relationship: Optional[str] = "BAPA"
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    postcode: Optional[str] = None
    city: Optional[str] = None
    address_incomplete: bool = False


class PaginatedStudentsResponse(BaseModel):
    students: List[StudentResponse]
    pagination: dict


# ============ HELPER FUNCTIONS ============

def serialize_student(student: dict) -> StudentResponse:
    created_at = student.get("created_at", "")
    if isinstance(created_at, datetime):
        created_at = created_at.isoformat()
    
    form_val = student.get("form", 1)
    if isinstance(form_val, str):
        match = re.match(r'^(\d+)', form_val)
        form_val = int(match.group(1)) if match else 1
    
    address = student.get("address", "")
    postcode = student.get("postcode", "")
    city = student.get("city", "")
    address_incomplete = not address or not postcode or not city
    
    ic_raw = student.get("ic_number", "")
    ic_number = (ic_raw or "").replace("-", "").replace(" ", "") if ic_raw else ""
    
    return StudentResponse(
        id=str(student["_id"]),
        full_name=student.get("full_name", ""),
        matric_number=student.get("matric_number", ""),
        ic_number=ic_number,
        year=student.get("year", 2024),
        form=form_val,
        class_name=student.get("class_name", ""),
        block_name=student.get("block_name", ""),
        room_number=student.get("room_number", ""),
        state=student.get("state", ""),
        status=student.get("status", "pending"),
        parent_id=str(student.get("parent_id", "")),
        created_at=created_at,
        religion=student.get("religion", "Islam"),
        bangsa=student.get("bangsa", "Melayu"),
        gender=student.get("gender"),
        relationship=student.get("relationship", "BAPA"),
        phone=student.get("phone"),
        email=student.get("email"),
        address=address if address else None,
        postcode=postcode if postcode else None,
        city=city if city else None,
        address_incomplete=address_incomplete
    )


# ============ DEPENDENCY HELPERS ============

async def get_current_user_dep():
    """Wrapper for current user dependency"""
    # This will be resolved at runtime
    pass


async def require_admin_roles(current_user: dict):
    """Check if user has admin roles"""
    if current_user.get("role") not in ["superadmin", "admin", "bendahari", "sub_bendahari", "guru_kelas", "warden"]:
        raise HTTPException(status_code=403, detail="Akses ditolak untuk role ini")
    return current_user


async def require_superadmin_admin(current_user: dict):
    """Check if user has superadmin/admin role"""
    if current_user.get("role") not in ["superadmin", "admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak untuk role ini")
    return current_user


# ============ ROUTES ============

@router.get("/all", response_model=PaginatedStudentsResponse)
async def get_all_students_paginated(
    search: Optional[str] = None,
    status: Optional[str] = None,
    form: Optional[int] = None,
    class_name: Optional[str] = None,
    block_name: Optional[str] = None,
    page: int = Query(1, ge=1, description="Nombor halaman"),
    limit: int = Query(20, ge=1, le=100, description="Bilangan rekod per halaman"),
):
    """
    Get ALL students with mandatory pagination.
    This endpoint is optimized for large datasets and prevents timeout issues.
    """
    # Get current user through the injected function
    from fastapi import Request
    
    db = _get_db_func()
    query = {}
    
    # Apply search filter
    if search:
        search_regex = {"$regex": search, "$options": "i"}
        query["$or"] = [
            {"full_name": search_regex},
            {"matric_number": search_regex},
            {"ic_number": search_regex},
            {"class_name": search_regex},
            {"block_name": search_regex}
        ]
    
    # Apply filters
    if status:
        query["status"] = status
    if form:
        query["form"] = form
    if class_name:
        query["class_name"] = class_name
    if block_name:
        query["block_name"] = block_name
    
    # Get total count
    total = await db.students.count_documents(query)
    
    # Calculate pagination
    skip = (page - 1) * limit
    total_pages = (total + limit - 1) // limit if total > 0 else 1
    
    # Get paginated students
    students = await db.students.find(query).sort("full_name", 1).skip(skip).limit(limit).to_list(limit)
    
    return PaginatedStudentsResponse(
        students=[serialize_student(s) for s in students],
        pagination={
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1
        }
    )


@router.get("/stats/summary")
async def get_students_stats():
    """Get students statistics summary"""
    db = _get_db_func()
    total = await db.students.count_documents({})
    approved = await db.students.count_documents({"status": "approved"})
    pending = await db.students.count_documents({"status": "pending"})
    rejected = await db.students.count_documents({"status": "rejected"})
    
    # Get by form and class
    form_counts = {}
    class_counts = {}
    async for student in db.students.find({"status": "approved"}):
        form_value = student.get("form")
        if form_value is not None:
            form_counts[form_value] = form_counts.get(form_value, 0) + 1
        class_name = student.get("class_name")
        if class_name:
            class_counts[class_name] = class_counts.get(class_name, 0) + 1

    by_form = sorted(
        [{"_id": form_value, "count": count} for form_value, count in form_counts.items()],
        key=lambda item: item["_id"],
    )[:10]
    students_by_form = {str(item["_id"]): item["count"] for item in by_form}

    by_class = sorted(
        [{"_id": class_name, "count": count} for class_name, count in class_counts.items()],
        key=lambda item: item["count"],
        reverse=True,
    )[:20]
    students_by_class = {item["_id"]: item["count"] for item in by_class if item["_id"]}
    
    return {
        "total": total,
        "approved": approved,
        "pending": pending,
        "rejected": rejected,
        "by_form": students_by_form,
        "by_class": students_by_class
    }
