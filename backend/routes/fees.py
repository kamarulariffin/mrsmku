"""
Fee Routes - Fee structure and management
Extracted from server.py for better code organization
Refactored using the proper dependency injection pattern
"""
from datetime import datetime, timezone
from typing import List, Optional, Callable

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from bson import ObjectId
from services.id_normalizer import object_id_or_none

router = APIRouter(prefix="/api/fees", tags=["Fees"])
security = HTTPBearer(auto_error=False)

# ============ INJECTED DEPENDENCIES ============
_get_db_func: Callable = None
_get_current_user_func: Callable = None
_log_audit_func: Callable = None


def init_router(get_db_func, auth_func, log_audit_func):
    """
    Initialize router with dependencies from server.py
    
    Args:
        get_db_func: Function that returns database instance
        auth_func: get_current_user function from server.py
        log_audit_func: log_audit function from server.py
    """
    global _get_db_func, _get_current_user_func, _log_audit_func
    
    _get_db_func = get_db_func
    _get_current_user_func = auth_func
    _log_audit_func = log_audit_func


# ============ LOCAL DEPENDENCY WRAPPERS ============

def get_db():
    """Get database instance"""
    return _get_db_func()


def _as_object_id_if_valid(value):
    if isinstance(value, ObjectId):
        return value
    if isinstance(value, str):
        oid = object_id_or_none(value)
        return oid if oid is not None else value
    return value


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


async def log_audit(user, action, module, details):
    """Wrapper for audit logging"""
    if _log_audit_func and user:
        await _log_audit_func(user, action, module, details)


# ============ PYDANTIC MODELS ============

class FeeResponse(BaseModel):
    id: str
    student_id: str
    student_name: str
    category: str
    amount: float
    paid_amount: float
    description: str
    due_date: str
    status: str
    year: int = 0
    form: int = 0
    created_at: str


class FeeCreate(BaseModel):
    student_id: str
    category: str
    amount: float
    description: str
    due_date: str
    year: int
    form: int


# ============ ROUTES ============

@router.get("/structure")
async def get_fee_structure(year: int = 2026, form: int = None):
    """Get MRSMKU fee structure from set_yuran - public endpoint"""
    db = get_db()
    query = {"tahun": year, "is_active": True}
    if form:
        query["tingkatan"] = form
    
    set_yuran_list = await db.set_yuran.find(query).sort("tingkatan", 1).to_list(10)
    
    if not set_yuran_list:
        return {
            "year": year,
            "note": "Wang Pendaftaran dan Wang Caruman dibayar melalui MARAEPS",
            "packages": [],
            "grand_total": 0,
            "message": "Set Yuran belum dikonfigurasi untuk tahun ini"
        }
    
    result = {
        "year": year,
        "note": "Wang Pendaftaran dan Wang Caruman dibayar melalui MARAEPS",
        "packages": []
    }
    
    for sy in set_yuran_list:
        total = 0
        categories = []
        for cat in sy.get("categories", []):
            cat_total = 0
            for sub in cat.get("sub_categories", []):
                for item in sub.get("items", []):
                    cat_total += item.get("amount", 0)
            total += cat_total
            categories.append({
                "name": cat["name"],
                "total": cat_total,
                "sub_categories": cat.get("sub_categories", [])
            })
        
        result["packages"].append({
            "id": str(sy["_id"]),
            "form": sy.get("tingkatan"),
            "name": sy.get("nama"),
            "total_amount": total,
            "total_islam": sy.get("total_islam", total),
            "total_bukan_islam": sy.get("total_bukan_islam", total),
            "categories": categories
        })

    grand_total = sum(p.get("total_amount", 0) for p in result["packages"])
    result["grand_total"] = grand_total
    return result


@router.get("", response_model=List[FeeResponse])
async def get_fees(current_user: dict = Depends(get_current_user)):
    """Get fees based on role - redirects to student_yuran collection"""
    db = get_db()
    
    if current_user["role"] == "parent":
        students = await db.students.find({"parent_id": current_user["_id"]}).to_list(100)
        student_ids = [s["_id"] for s in students]
        yuran_records = await db.student_yuran.find({"student_id": {"$in": student_ids}}).to_list(1000)
    elif current_user["role"] == "pelajar":
        student = await db.students.find_one({"user_id": current_user["_id"]})
        if not student and current_user.get("matric_number"):
            student = await db.students.find_one({"matric_number": current_user["matric_number"]})
        if student:
            yuran_records = await db.student_yuran.find({"student_id": student["_id"]}).to_list(100)
        else:
            yuran_records = []
    elif current_user["role"] == "guru_kelas":
        students = await db.students.find({"class_name": current_user.get("assigned_class", "")}).to_list(100)
        student_ids = [s["_id"] for s in students]
        yuran_records = await db.student_yuran.find({"student_id": {"$in": student_ids}}).to_list(1000)
    else:
        yuran_records = await db.student_yuran.find().to_list(10000)
    
    # Convert student_yuran to FeeResponse format for backward compatibility
    result = []
    for yuran in yuran_records:
        created_at = yuran.get("created_at", "")
        if hasattr(created_at, 'isoformat'):
            created_at = created_at.isoformat()
        result.append(FeeResponse(
            id=str(yuran["_id"]),
            student_id=str(yuran.get("student_id", "")),
            student_name=yuran.get("student_name", "Unknown"),
            category=yuran.get("set_yuran_nama", "Yuran"),
            amount=yuran.get("total_amount", 0),
            paid_amount=yuran.get("paid_amount", 0),
            description=f"Yuran Tingkatan {yuran.get('tingkatan', '')} Tahun {yuran.get('tahun', '')}",
            due_date=f"{yuran.get('tahun', 2026)}-12-31",
            status=yuran.get("status", "pending"),
            year=yuran.get("tahun", 0),
            form=yuran.get("tingkatan", 0),
            created_at=created_at
        ))
    return result


@router.get("/{fee_id}", response_model=FeeResponse)
async def get_fee(fee_id: str, current_user: dict = Depends(get_current_user)):
    """Get single fee - redirects to student_yuran"""
    db = get_db()
    yuran_lookup_id = _as_object_id_if_valid(fee_id)
    yuran = await db.student_yuran.find_one({"_id": yuran_lookup_id})
    if not yuran:
        raise HTTPException(status_code=404, detail="Yuran tidak dijumpai")
    
    student = await db.students.find_one({"_id": yuran.get("student_id")})
    if current_user["role"] == "parent" and student and str(student.get("parent_id")) != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    created_at = yuran.get("created_at", "")
    if hasattr(created_at, 'isoformat'):
        created_at = created_at.isoformat()
    
    return FeeResponse(
        id=str(yuran["_id"]),
        student_id=str(yuran.get("student_id", "")),
        student_name=yuran.get("student_name", student.get("full_name", "") if student else ""),
        category=yuran.get("set_yuran_nama", "Yuran"),
        amount=yuran.get("total_amount", 0),
        paid_amount=yuran.get("paid_amount", 0),
        description=f"Yuran Tingkatan {yuran.get('tingkatan', '')} Tahun {yuran.get('tahun', '')}",
        due_date=f"{yuran.get('tahun', 2026)}-12-31",
        status=yuran.get("status", "pending"),
        year=yuran.get("tahun", 0),
        form=yuran.get("tingkatan", 0),
        created_at=created_at
    )


@router.post("", response_model=FeeResponse)
async def create_fee(
    fee_data: FeeCreate,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bendahari"))
):
    """Create new fee - deprecated, use /api/yuran/assign instead"""
    db = get_db()

    student_lookup_id = _as_object_id_if_valid(fee_data.student_id)
    student = await db.students.find_one({"_id": student_lookup_id})
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    
    # Create in student_yuran for new system compatibility
    yuran_doc = {
        "student_id": student_lookup_id,
        "student_name": student["full_name"],
        "matric_number": student.get("matric_number", ""),
        "parent_id": student.get("parent_id"),
        "tahun": fee_data.year,
        "tingkatan": fee_data.form,
        "set_yuran_nama": fee_data.category,
        "religion": student.get("religion", "Islam"),
        "items": [{
            "category": fee_data.category,
            "sub_category": "Manual",
            "code": "MAN01",
            "name": fee_data.description,
            "amount": fee_data.amount,
            "mandatory": True,
            "paid": False,
            "paid_amount": 0,
            "paid_date": None
        }],
        "total_amount": fee_data.amount,
        "paid_amount": 0,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "payments": []
    }
    result = await db.student_yuran.insert_one(yuran_doc)
    yuran_doc["_id"] = result.inserted_id
    
    await db.notifications.insert_one({
        "user_id": student["parent_id"],
        "title": "Yuran Baru",
        "message": f"Yuran baru RM{fee_data.amount:.2f} ({fee_data.description}) untuk {student['full_name']}.",
        "type": "info",
        "is_read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    await log_audit(current_user, "CREATE_FEE", "student_yuran", f"Cipta yuran untuk {student['full_name']}: RM{fee_data.amount}")
    
    return FeeResponse(
        id=str(yuran_doc["_id"]),
        student_id=str(yuran_doc.get("student_id", "")),
        student_name=yuran_doc.get("student_name", ""),
        category=yuran_doc.get("set_yuran_nama", ""),
        amount=yuran_doc.get("total_amount", 0),
        paid_amount=0,
        description=fee_data.description,
        due_date=fee_data.due_date,
        status="pending",
        year=fee_data.year,
        form=fee_data.form,
        created_at=yuran_doc.get("created_at", "")
    )
