"""
User Management Routes - MRSMKU Portal
Pengurusan Pengguna dengan RBAC
Extracted from server.py for better code organization
"""
from datetime import datetime, timezone
from typing import Optional, List, Callable
from bson import ObjectId
import re

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, validator

router = APIRouter(prefix="/api/users", tags=["User Management"])
security = HTTPBearer(auto_error=False)

# Database reference - will be set from server.py
_get_db_func: Callable = None
_get_current_user_func: Callable = None
_log_audit_func: Callable = None
_pwd_context = None
_ROLES: dict = None
_ROLE_PERMISSIONS: dict = None
_serialize_user_func: Callable = None
_generate_user_qr_code_data: Callable = None
_generate_qr_code_image: Callable = None


def init_router(get_db_func, auth_func, audit_func, pwd_context, roles, role_permissions, serialize_user_func, qr_data_func, qr_image_func):
    """
    Initialize router with dependencies from server.py
    
    Args:
        get_db_func: Function that returns database instance
        auth_func: get_current_user function from server.py
        audit_func: log_audit function from server.py
        pwd_context: Password context for hashing
        roles: ROLES dictionary
        role_permissions: ROLE_PERMISSIONS dictionary
        serialize_user_func: serialize_user function from server.py
        qr_data_func: generate_user_qr_code_data function
        qr_image_func: generate_qr_code_image function
    """
    global _get_db_func, _get_current_user_func, _log_audit_func, _pwd_context
    global _ROLES, _ROLE_PERMISSIONS, _serialize_user_func
    global _generate_user_qr_code_data, _generate_qr_code_image
    
    _get_db_func = get_db_func
    _get_current_user_func = auth_func
    _log_audit_func = audit_func
    _pwd_context = pwd_context
    _ROLES = roles
    _ROLE_PERMISSIONS = role_permissions
    _serialize_user_func = serialize_user_func
    _generate_user_qr_code_data = qr_data_func
    _generate_qr_code_image = qr_image_func


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


# ============ VALIDATION HELPERS ============

def validate_name(name: str, field_name: str = "Nama") -> str:
    if not name or not name.strip():
        raise ValueError(f"{field_name} tidak boleh kosong")
    if re.search(r'\d', name):
        raise ValueError(f"{field_name} tidak boleh mengandungi nombor")
    if len(name.strip()) < 3:
        raise ValueError(f"{field_name} terlalu pendek (minimum 3 aksara)")
    if re.search(r'[!@#$%^&*()_+=\[\]{};:"\\|<>?/~`]', name):
        raise ValueError(f"{field_name} mengandungi aksara tidak sah")
    return name.strip()


def validate_ic_number(ic: str) -> str:
    if not ic or not ic.strip():
        raise ValueError("No. Kad Pengenalan tidak boleh kosong")
    ic = ic.strip().replace('-', '').replace(' ', '')
    if len(ic) != 12:
        raise ValueError("No. Kad Pengenalan mestilah 12 digit (contoh: 750925016913)")
    if not ic.isdigit():
        raise ValueError("No. Kad Pengenalan hanya boleh mengandungi nombor")
    month = int(ic[2:4])
    day = int(ic[4:6])
    if month < 1 or month > 12:
        raise ValueError("No. Kad Pengenalan tidak sah - bulan tidak betul")
    if day < 1 or day > 31:
        raise ValueError("No. Kad Pengenalan tidak sah - hari tidak betul")
    return ic


def validate_phone(phone: str) -> str:
    if not phone:
        return phone
    phone = phone.strip().replace('-', '').replace(' ', '')
    if phone.startswith('01') and 10 <= len(phone) <= 12 and phone.replace('+', '').isdigit():
        return phone
    if phone.startswith('+60') and len(phone) >= 12 and phone[1:].isdigit():
        return phone
    if phone.startswith('60') and len(phone) >= 11 and phone.isdigit():
        return phone
    raise ValueError("Format No. Telefon tidak sah (contoh: 0123456789 atau +60123456789)")


def validate_gender(gender: str) -> str:
    if gender and gender.lower() not in ['male', 'female', 'lelaki', 'perempuan']:
        raise ValueError("Jantina mesti 'male' atau 'female'")
    if gender:
        if gender.lower() in ['lelaki', 'male']:
            return 'male'
        elif gender.lower() in ['perempuan', 'female']:
            return 'female'
    return gender


# ============ PYDANTIC MODELS ============

class UserCreateByAdmin(BaseModel):
    """Model for creating user by admin"""
    email: EmailStr
    password: str
    full_name: str
    phone: str
    phone_alt: Optional[str] = None
    ic_number: str
    gender: Optional[str] = None
    role: str
    assigned_class: Optional[str] = None
    assigned_form: Optional[int] = None
    assigned_block: Optional[str] = None
    staff_id: Optional[str] = None
    state: Optional[str] = None
    
    @validator('full_name')
    def validate_admin_user_name(cls, v):
        return validate_name(v, "Nama penuh")
    
    @validator('password')
    def validate_admin_password(cls, v):
        if len(v) < 6:
            raise ValueError("Kata laluan minimum 6 aksara")
        return v
    
    @validator('phone')
    def validate_admin_user_phone(cls, v):
        return validate_phone(v)
    
    @validator('phone_alt')
    def validate_admin_user_phone_alt(cls, v):
        return validate_phone(v) if v else v
    
    @validator('ic_number')
    def validate_admin_user_ic(cls, v):
        return validate_ic_number(v)
    
    @validator('gender')
    def validate_admin_user_gender(cls, v):
        return validate_gender(v) if v else v


class UserUpdate(BaseModel):
    """Model for updating user"""
    full_name: Optional[str] = None
    phone: Optional[str] = None
    phone_alt: Optional[str] = None
    ic_number: Optional[str] = None
    gender: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    assigned_class: Optional[str] = None
    assigned_form: Optional[int] = None
    assigned_block: Optional[str] = None
    assigned_bus_id: Optional[str] = None  # untuk bus_driver: id bas yang ditugaskan
    state: Optional[str] = None
    status: Optional[str] = None
    
    @validator('full_name')
    def validate_update_name(cls, v):
        return validate_name(v, "Nama penuh") if v else v
    
    @validator('phone')
    def validate_update_phone(cls, v):
        return validate_phone(v) if v else v
    
    @validator('phone_alt')
    def validate_update_phone_alt(cls, v):
        return validate_phone(v) if v else v
    
    @validator('gender')
    def validate_update_gender(cls, v):
        return validate_gender(v) if v else v

    @validator('ic_number')
    def validate_update_ic(cls, v):
        return validate_ic_number(v) if v else v


class UserResponse(BaseModel):
    """Model for user response"""
    id: str
    email: str
    full_name: str
    phone: str
    phone_alt: Optional[str] = None
    role: str
    role_name: str
    ic_number: Optional[str] = None
    gender: Optional[str] = None
    is_active: bool
    assigned_class: Optional[str] = None
    assigned_form: Optional[int] = None
    assigned_block: Optional[str] = None
    staff_id: Optional[str] = None
    matric_number: Optional[str] = None
    state: Optional[str] = None
    status: Optional[str] = None
    permissions: List[str] = []


# ============ ROUTES ============

@router.get("")
async def get_all_users(
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    page: Optional[int] = Query(None, ge=1),
    limit: Optional[int] = Query(None, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """Get all users with optional filters and pagination"""
    db = get_db()
    
    # Role check: superadmin/admin full access; bus_admin only bus_driver list
    curr_role = current_user.get("role")
    if curr_role not in ["superadmin", "admin", "bus_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak untuk role ini")
    if curr_role == "bus_admin":
        if role and role != "bus_driver":
            raise HTTPException(status_code=403, detail="Admin Bas hanya boleh lihat senarai Driver Bas")
        query = {"role": "bus_driver"}
    else:
        query = {}
    if role and curr_role != "bus_admin":
        query["role"] = role
    if is_active is not None:
        query["is_active"] = is_active
    
    # Apply search filter
    if search:
        search_regex = {"$regex": search, "$options": "i"}
        query["$or"] = [
            {"full_name": search_regex},
            {"email": search_regex},
            {"phone": search_regex},
            {"ic_number": search_regex}
        ]
    
    # If pagination is requested, return paginated response
    if page is not None and limit is not None:
        total = await db.users.count_documents(query)
        skip = (page - 1) * limit
        total_pages = (total + limit - 1) // limit if total > 0 else 1
        
        users = await db.users.find(query).sort("full_name", 1).skip(skip).limit(limit).to_list(limit)
        
        return {
            "users": [_serialize_user_func(u) for u in users],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1
            }
        }
    
    # For backward compatibility, return list (limited to 500 for safety)
    users = await db.users.find(query).sort("full_name", 1).to_list(500)
    return [_serialize_user_func(u) for u in users]


@router.post("")
async def create_user(
    user_data: UserCreateByAdmin,
    current_user: dict = Depends(get_current_user)
):
    """Create new user. Warden ialah role berasingan; hanya Superadmin dan Admin boleh tambah warden."""
    db = get_db()
    
    # Hanya Superadmin, Admin, Bendahari boleh cipta pengguna
    if current_user.get("role") not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak untuk role ini")
    
    if user_data.role not in _ROLES:
        raise HTTPException(status_code=400, detail="Role tidak sah")
    
    # Hanya Superadmin boleh cipta Admin/Superadmin
    if user_data.role in ["superadmin", "admin"] and current_user["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Hanya SuperAdmin boleh cipta Admin")
    
    # Warden boleh ditambah oleh Superadmin dan Admin sahaja (bukan Bendahari)
    if user_data.role == "warden" and current_user["role"] == "bendahari":
        raise HTTPException(status_code=403, detail="Hanya Superadmin dan Admin boleh tambah Warden")
    
    # Bendahari hanya boleh cipta Ibu Bapa
    if current_user["role"] == "bendahari" and user_data.role != "parent":
        raise HTTPException(status_code=403, detail="Bendahari hanya boleh mendaftar Ibu Bapa")
    
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email sudah didaftarkan")
    
    user_doc = {
        "email": user_data.email,
        "password": _pwd_context.hash(user_data.password),
        "full_name": user_data.full_name,
        "phone": user_data.phone,
        "phone_alt": user_data.phone_alt,
        "ic_number": user_data.ic_number,
        "gender": user_data.gender,
        "role": user_data.role,
        "state": user_data.state,
        "is_active": True,
        "assigned_class": user_data.assigned_class,
        "assigned_form": user_data.assigned_form,
        "assigned_block": user_data.assigned_block,
        "staff_id": user_data.staff_id,
        "created_by": str(current_user["_id"]),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(user_doc)
    user_doc["_id"] = result.inserted_id
    
    # Generate permanent QR code for user
    user_id_str = str(result.inserted_id)
    qr_code = _generate_user_qr_code_data(user_id_str)
    qr_code_image = _generate_qr_code_image(qr_code)
    await db.users.update_one(
        {"_id": result.inserted_id},
        {"$set": {
            "qr_code": qr_code,
            "qr_code_image": qr_code_image,
            "qr_code_generated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    user_doc["qr_code"] = qr_code
    
    await log_audit(current_user, "CREATE_USER", "users", f"Cipta user baru: {user_data.email} ({user_data.role})")
    
    return _serialize_user_func(user_doc)


@router.put("/{user_id}")
async def update_user(
    user_id: str,
    user_data: UserUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update user details"""
    db = get_db()
    
    # Role check: superadmin/admin full; bus_admin only bus_driver and only assigned_bus_id
    curr_role = current_user.get("role")
    if curr_role not in ["superadmin", "admin", "bus_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak untuk role ini")
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="Pengguna tidak dijumpai")
    
    # Only superadmin can edit admin/superadmin
    if user["role"] in ["superadmin", "admin"] and curr_role != "superadmin":
        raise HTTPException(status_code=403, detail="Hanya SuperAdmin boleh edit Admin")
    
    # Bus admin only can edit bus_driver and only assigned_bus_id
    unset_data = {}
    if curr_role == "bus_admin":
        if user.get("role") != "bus_driver":
            raise HTTPException(status_code=403, detail="Admin Bas hanya boleh kemaskini penugasan Driver Bas")
        update_data = {}
        val = getattr(user_data, "assigned_bus_id", None)
        if val == "" or val is None:
            unset_data["assigned_bus_id"] = 1
        else:
            try:
                update_data["assigned_bus_id"] = ObjectId(val)
            except Exception:
                pass
    else:
        update_data = {k: v for k, v in user_data.dict().items() if v is not None}
        if "assigned_bus_id" in update_data:
            val = update_data.pop("assigned_bus_id", None)
            if val == "" or val is None:
                unset_data["assigned_bus_id"] = 1
            else:
                try:
                    update_data["assigned_bus_id"] = ObjectId(val)
                except Exception:
                    pass
    if update_data:
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update_data})
    if unset_data:
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$unset": unset_data})
    
    await log_audit(current_user, "UPDATE_USER", "users", f"Kemaskini user: {user['email']}")
    
    updated_user = await db.users.find_one({"_id": ObjectId(user_id)})
    return _serialize_user_func(updated_user)


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete user (SuperAdmin only)"""
    db = get_db()
    
    # Role check
    if current_user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Akses ditolak untuk role ini")
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="Pengguna tidak dijumpai")
    
    if str(user["_id"]) == str(current_user["_id"]):
        raise HTTPException(status_code=400, detail="Tidak boleh padam akaun sendiri")
    
    await db.users.delete_one({"_id": ObjectId(user_id)})
    await log_audit(current_user, "DELETE_USER", "users", f"Padam user: {user['email']}")
    
    return {"message": "Pengguna dipadam"}


@router.put("/{user_id}/toggle-active")
async def toggle_user_active(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Toggle user active status"""
    db = get_db()
    
    # Role check
    if current_user.get("role") not in ["superadmin", "admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak untuk role ini")
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="Pengguna tidak dijumpai")
    
    new_status = not user.get("is_active", True)
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"is_active": new_status}})
    
    await log_audit(current_user, "TOGGLE_USER", "users", f"{'Aktifkan' if new_status else 'Nyahaktif'} user: {user['email']}")
    return {"message": f"User {'diaktifkan' if new_status else 'dinyahaktifkan'}", "is_active": new_status}


class SetPasswordRequest(BaseModel):
    """Request body for admin/superadmin to set any user's password"""
    new_password: str

    @validator("new_password")
    def password_min_length(cls, v):
        if len(v) < 6:
            raise ValueError("Kata laluan minimum 6 aksara")
        return v


@router.put("/{user_id}/set-password")
async def set_user_password(
    user_id: str,
    body: SetPasswordRequest,
    current_user: dict = Depends(get_current_user)
):
    """Superadmin dan Admin boleh tukar kata laluan mana-mana pengguna yang berdaftar dalam sistem (tak kira role)."""
    db = get_db()
    if current_user.get("role") not in ["superadmin", "admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak untuk role ini")
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="Pengguna tidak dijumpai")
    hashed = _pwd_context.hash(body.new_password)
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"password": hashed, "must_change_password": True}}
    )
    await log_audit(
        current_user, "SET_PASSWORD", "users",
        f"Tukar kata laluan untuk user: {user.get('email', user.get('full_name', user_id))}"
    )
    return {"message": "Kata laluan telah dikemas kini."}
