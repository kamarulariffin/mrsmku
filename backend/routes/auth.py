"""
Authentication Routes - Login, Register, Impersonate, Forgot/Reset Password
"""
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from bson import ObjectId

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, validator
from passlib.context import CryptContext
from jose import JWTError, jwt
import os

# Config
JWT_SECRET = os.environ.get("JWT_SECRET", "mrsm-secret-key")
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", 1440))

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# Database reference - will be set from server.py
db = None
ROLES = {}
ROLE_PERMISSIONS = {}

# Import validation helpers
def validate_name(name: str, field_name: str = "Nama") -> str:
    import re
    if not name or len(name) < 3:
        raise ValueError(f"{field_name} mesti sekurang-kurangnya 3 aksara")
    if re.search(r'\d', name):
        raise ValueError(f"{field_name} tidak boleh mengandungi nombor")
    return name.strip()

def validate_ic_number(ic: str) -> str:
    import re
    ic_clean = re.sub(r'[-\s]', '', ic)
    if len(ic_clean) != 12:
        raise ValueError("No. IC mesti 12 digit (contoh: 750925016913)")
    if not ic_clean.isdigit():
        raise ValueError("No. IC mesti mengandungi nombor sahaja")
    year = int(ic_clean[0:2])
    month = int(ic_clean[2:4])
    day = int(ic_clean[4:6])
    if month < 1 or month > 12:
        raise ValueError("No. IC tidak sah - bulan mesti antara 01-12")
    if day < 1 or day > 31:
        raise ValueError("No. IC tidak sah - hari mesti antara 01-31")
    return ic_clean


def validate_phone(phone: str) -> str:
    import re
    if not phone:
        return phone
    phone_clean = re.sub(r'[-\s]', '', phone)
    if not re.match(r'^01\d{8,9}$', phone_clean):
        raise ValueError("Format No. Telefon tidak sah (contoh: 01X-XXXXXXX)")
    return phone_clean


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


# Models
class ChildInfo(BaseModel):
    full_name: str
    matric_number: str
    ic_number: str
    form: int
    class_name: str
    gender: Optional[str] = None
    relationship: Optional[str] = "BAPA"
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    postcode: Optional[str] = None
    city: Optional[str] = None
    block_name: Optional[str] = ""
    room_number: Optional[str] = ""
    
    @validator('full_name')
    def validate_full_name(cls, v):
        return validate_name(v, "Nama anak")
    
    @validator('ic_number')
    def validate_ic(cls, v):
        return validate_ic_number(v)
    
    @validator('gender')
    def validate_child_gender(cls, v):
        if v:
            return validate_gender(v)
        return v
    
    @validator('class_name')
    def validate_class(cls, v):
        return validate_class_name(v)


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    phone: str
    phone_alt: Optional[str] = None
    ic_number: str
    gender: Optional[str] = None
    address: Optional[str] = None
    postcode: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    children: Optional[List[ChildInfo]] = None
    
    @validator('full_name')
    def validate_full_name(cls, v):
        return validate_name(v)
    
    @validator('ic_number')
    def validate_ic(cls, v):
        return validate_ic_number(v)
    
    @validator('phone')
    def validate_phone_num(cls, v):
        return validate_phone(v)
    
    @validator('password')
    def validate_password(cls, v):
        if len(v) < 6:
            raise ValueError("Kata laluan minimum 6 aksara")
        return v
    
    @validator('gender')
    def validate_user_gender(cls, v):
        if v:
            return validate_gender(v)
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class StudentLogin(BaseModel):
    identifier: str
    password: str


class ImpersonateRequest(BaseModel):
    user_id: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @validator("new_password")
    def password_min_length(cls, v):
        if len(v) < 6:
            raise ValueError("Kata laluan minimum 6 aksara")
        return v


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    phone: str
    role: str
    role_name: str
    ic_number: Optional[str] = None
    gender: Optional[str] = None
    is_active: bool
    assigned_class: Optional[str] = None
    assigned_block: Optional[str] = None
    staff_id: Optional[str] = None
    matric_number: Optional[str] = None
    permissions: List[str] = []
    must_change_password: bool = False
    assigned_bus_id: Optional[str] = None  # for bus_driver: which bus they drive


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


def init_db(database, roles, role_permissions):
    """Initialize database and roles references"""
    global db, ROLES, ROLE_PERMISSIONS
    db = database
    ROLES = roles
    ROLE_PERMISSIONS = role_permissions


def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token tidak sah")
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=401, detail="Pengguna tidak dijumpai")
        if not user.get("is_active", True):
            raise HTTPException(status_code=403, detail="Akaun tidak aktif")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Token tidak sah")


async def get_current_user_optional(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_optional)):
    """Return current user if valid token provided, else None."""
    if credentials is None:
        return None
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            return None
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user or not user.get("is_active", True):
            return None
        return user
    except Exception:
        return None


def require_roles(*roles):
    async def role_checker(current_user: dict = Depends(get_current_user)):
        if current_user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Akses ditolak untuk role ini")
        return current_user
    return role_checker


async def log_audit(user: dict, action: str, module: str, details: str):
    await db.audit_logs.insert_one({
        "user_id": user["_id"],
        "user_name": user.get("full_name", "Unknown"),
        "user_role": user.get("role", "unknown"),
        "action": action,
        "module": module,
        "details": details,
        "created_at": datetime.now(timezone.utc).isoformat()
    })


def serialize_user(user: dict) -> UserResponse:
    role = user.get("role", "parent")
    permissions = ROLE_PERMISSIONS.get(role, [])
    return UserResponse(
        id=str(user["_id"]),
        email=user.get("email", ""),
        full_name=user.get("full_name", user.get("fullName", "")),
        phone=user.get("phone", ""),
        role=role,
        role_name=ROLES.get(role, {}).get("name", role),
        ic_number=user.get("ic_number"),
        gender=user.get("gender"),
        is_active=user.get("is_active", True),
        assigned_class=user.get("assigned_class"),
        assigned_block=user.get("assigned_block", user.get("block_assigned", "")),
        staff_id=user.get("staff_id"),
        matric_number=user.get("matric_number", user.get("matric", "")),
        permissions=permissions if "*" not in permissions else ["*"],
        must_change_password=user.get("must_change_password", False),
        assigned_bus_id=str(user["assigned_bus_id"]) if user.get("assigned_bus_id") is not None else None
    )


def generate_user_qr_code_data(user_id: str) -> str:
    return f"MRSMKU:USER:{user_id}"


def generate_qr_code_image(data: str) -> str:
    import qrcode
    import base64
    from io import BytesIO
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    return base64.b64encode(buffer.getvalue()).decode('utf-8')


# Pelajar dan anak (child) disatukan: semua disimpan dalam satu koleksi db.students.
# Rekod dengan parent_id = anak yang didaftar oleh ibu bapa; tanpa parent_id = pelajar ditambah admin/import.


@router.post("/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    """Register new parent account with optional children. Anak disimpan sebagai pelajar dalam db.students."""
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email sudah didaftarkan")
    
    # Senarai Kelas dari ketetapan - kelas anak mesti dalam senarai
    valid_kelas = ["A", "B", "C", "D", "E", "F"]
    if user_data.children:
        config = await db.settings.find_one({"type": "system_config"})
        if config and config.get("kelas"):
            valid_kelas = config["kelas"]
        for child in user_data.children:
            existing_student = await db.students.find_one({"matric_number": child.matric_number})
            if existing_student:
                raise HTTPException(status_code=400, detail=f"Nombor matrik {child.matric_number} sudah didaftarkan")
            if child.class_name not in valid_kelas:
                raise HTTPException(
                    status_code=400,
                    detail=f"Kelas '{child.class_name}' tidak dalam Senarai Kelas. Sila pilih dari Tetapan > Data Pelajar atau pilih: {', '.join(valid_kelas)}"
                )
    
    user_doc = {
        "email": user_data.email,
        "password": pwd_context.hash(user_data.password),
        "full_name": user_data.full_name,
        "phone": user_data.phone,
        "phone_alt": user_data.phone_alt,
        "ic_number": user_data.ic_number,
        "gender": user_data.gender,
        "address": user_data.address,
        "postcode": user_data.postcode,
        "city": user_data.city,
        "state": user_data.state,
        "role": "parent",
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(user_doc)
    user_doc["_id"] = result.inserted_id
    
    user_id_str = str(result.inserted_id)
    qr_code = generate_user_qr_code_data(user_id_str)
    qr_code_image = generate_qr_code_image(qr_code)
    await db.users.update_one(
        {"_id": result.inserted_id},
        {"$set": {
            "qr_code": qr_code,
            "qr_code_image": qr_code_image,
            "qr_code_generated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    children_registered = []
    if user_data.children:
        for child in user_data.children:
            # Simpan jantina ikut DB: lelaki/perempuan (API boleh hantar male/female)
            gender_val = (child.gender or "").lower()
            if gender_val in ("male", "lelaki"):
                gender_stored = "lelaki"
            elif gender_val in ("female", "perempuan"):
                gender_stored = "perempuan"
            else:
                gender_stored = gender_val or ""
            student_doc = {
                "full_name": child.full_name,
                "matric_number": child.matric_number,
                "ic_number": child.ic_number,
                "year": datetime.now().year,
                "form": child.form,
                "class_name": child.class_name,
                "block_name": (child.block_name or "").strip(),
                "room_number": (child.room_number or "").strip(),
                "state": user_data.state or "",
                "gender": gender_stored,
                "relationship": child.relationship or "BAPA",
                "phone": child.phone or "",
                "email": child.email or "",
                "address": child.address or user_data.address or "",
                "postcode": child.postcode or user_data.postcode or "",
                "city": child.city or user_data.city or "",
                "status": "approved",
                "parent_id": result.inserted_id,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.students.insert_one(student_doc)
            children_registered.append(child.full_name)
        
        admins = await db.users.find({"role": {"$in": ["admin", "superadmin"]}}).to_list(100)
        for admin in admins:
            await db.notifications.insert_one({
                "user_id": admin["_id"],
                "title": "Pendaftaran Pelajar Baru",
                "message": f"{len(children_registered)} pelajar baru didaftarkan oleh {user_data.full_name} (auto-diluluskan).",
                "type": "action",
                "is_read": False,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    
    welcome_msg = "Terima kasih kerana mendaftar."
    if children_registered:
        welcome_msg += f" {len(children_registered)} anak telah didaftarkan dan diluluskan."
    else:
        welcome_msg += " Sila tambah anak anda untuk mula menggunakan sistem."
    
    await db.notifications.insert_one({
        "user_id": result.inserted_id,
        "title": "Selamat Datang ke Portal MRSMKU",
        "message": welcome_msg,
        "type": "info",
        "is_read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    token = create_access_token({"sub": str(result.inserted_id)})
    return TokenResponse(access_token=token, token_type="bearer", user=serialize_user(user_doc))


@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user_optional)):
    """Log keluar - audit log. Panggil sebelum clear token di frontend."""
    if current_user:
        await log_audit(
            current_user,
            "LOGOUT",
            "auth",
            f"Log keluar: {current_user.get('email', current_user.get('full_name', 'Unknown'))}"
        )
    return {"message": "Log keluar berjaya"}


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    """Login for all user types"""
    email_normalized = (credentials.email or "").strip().lower()
    user = await db.users.find_one({"email": email_normalized})
    if not user:
        raise HTTPException(status_code=401, detail="Email atau kata laluan tidak sah")
    stored = user.get("password")
    if not stored:
        raise HTTPException(status_code=401, detail="Email atau kata laluan tidak sah")
    try:
        if not pwd_context.verify(credentials.password, stored):
            raise HTTPException(status_code=401, detail="Email atau kata laluan tidak sah")
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Email atau kata laluan tidak sah")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Akaun telah dinyahaktifkan")
    
    await log_audit(user, "LOGIN", "auth", f"Log masuk dari {credentials.email}")
    
    token = create_access_token({"sub": str(user["_id"])})
    return TokenResponse(access_token=token, token_type="bearer", user=serialize_user(user))


@router.post("/login/student", response_model=TokenResponse)
async def login_student(credentials: StudentLogin):
    """Login for students using Matric Number or IC Number"""
    user = await db.users.find_one({
        "$or": [
            {"matric_number": credentials.identifier},
            {"ic_number": credentials.identifier}
        ],
        "role": "pelajar"
    })
    
    if not user:
        raise HTTPException(status_code=401, detail="No. Matrik/IC atau kata laluan tidak sah")
    stored = user.get("password")
    if not stored:
        raise HTTPException(status_code=401, detail="No. Matrik/IC atau kata laluan tidak sah")
    try:
        if not pwd_context.verify(credentials.password, stored):
            raise HTTPException(status_code=401, detail="No. Matrik/IC atau kata laluan tidak sah")
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="No. Matrik/IC atau kata laluan tidak sah")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Akaun telah dinyahaktifkan")
    
    await log_audit(user, "LOGIN_STUDENT", "auth", f"Log masuk pelajar: {user.get('matric_number', credentials.identifier)}")
    
    token = create_access_token({"sub": str(user["_id"])})
    return TokenResponse(access_token=token, token_type="bearer", user=serialize_user(user))


@router.post("/impersonate", response_model=TokenResponse)
async def impersonate_user(
    request: ImpersonateRequest,
    current_user: dict = Depends(require_roles("superadmin"))
):
    """SuperAdmin can impersonate any user"""
    target_user = await db.users.find_one({"_id": ObjectId(request.user_id)})
    if not target_user:
        raise HTTPException(status_code=404, detail="Pengguna tidak dijumpai")
    
    if not target_user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Akaun tidak aktif")
    
    await log_audit(
        current_user, 
        "IMPERSONATE", 
        "auth", 
        f"SuperAdmin impersonate sebagai {target_user['email']} ({target_user.get('role', 'unknown')})"
    )
    
    token = create_access_token({
        "sub": str(target_user["_id"]),
        "impersonated_by": str(current_user["_id"])
    })
    
    return TokenResponse(access_token=token, token_type="bearer", user=serialize_user(target_user))


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current user profile"""
    return serialize_user(current_user)


class UpdateMyProfileRequest(BaseModel):
    """Update own profile - fields same as registration where applicable"""
    full_name: Optional[str] = None
    phone: Optional[str] = None
    phone_alt: Optional[str] = None
    ic_number: Optional[str] = None
    gender: Optional[str] = None
    state: Optional[str] = None
    address: Optional[str] = None
    postcode: Optional[str] = None
    city: Optional[str] = None

    @validator("full_name")
    def validate_name(cls, v):
        return validate_name(v, "Nama penuh") if v else v

    @validator("ic_number")
    def validate_ic(cls, v):
        return validate_ic_number(v) if v else v

    @validator("phone")
    def validate_ph(cls, v):
        return validate_phone(v) if v else v

    @validator("phone_alt")
    def validate_ph_alt(cls, v):
        return validate_phone(v) if v else v

    @validator("gender")
    def validate_gen(cls, v):
        return validate_gender(v) if v else v


@router.put("/me")
async def update_me(
    body: UpdateMyProfileRequest,
    current_user: dict = Depends(get_current_user)
):
    """Update current user profile (own account only)."""
    update_data = {k: v for k, v in body.dict().items() if v is not None}
    if not update_data:
        return serialize_user(current_user)
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": update_data}
    )
    await log_audit(current_user, "UPDATE_OWN_PROFILE", "auth", "Kemaskini profil sendiri")
    updated = await db.users.find_one({"_id": current_user["_id"]})
    return serialize_user(updated)


class ChangeMyPasswordRequest(BaseModel):
    """Request for logged-in user to change own password"""
    current_password: str
    new_password: str

    @validator("new_password")
    def new_password_min(cls, v):
        if len(v) < 6:
            raise ValueError("Kata laluan baru minimum 6 aksara")
        return v


@router.put("/me/password")
async def change_my_password(
    body: ChangeMyPasswordRequest,
    current_user: dict = Depends(get_current_user)
):
    """Pengguna tukar kata laluan sendiri (untuk keselamatan). Padam must_change_password selepas berjaya."""
    if not pwd_context.verify(body.current_password, current_user.get("password", "")):
        raise HTTPException(status_code=400, detail="Kata laluan semasa tidak tepat")
    hashed = pwd_context.hash(body.new_password)
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"password": hashed, "must_change_password": False}}
    )
    await log_audit(current_user, "CHANGE_OWN_PASSWORD", "auth", "Pengguna menukar kata laluan sendiri")
    updated = await db.users.find_one({"_id": current_user["_id"]})
    return {"message": "Kata laluan telah dikemas kini.", "user": serialize_user(updated)}


# ============ LUPA KATA LALUAN / SET SEMULA (trending: link dalam e-mel) ============

RESET_TOKEN_EXPIRE_HOURS = 1
FRONTEND_URL = os.environ.get("FRONTEND_URL", os.environ.get("REACT_APP_FRONTEND_URL", "http://localhost:3000")).rstrip("/")


def _mask_email(email: str) -> str:
    """Mask email for display e.g. a***@example.com"""
    if not email or "@" not in email:
        return "***"
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        return f"{local[0]}***@{domain}"
    return f"{local[0]}***{local[-1]}@{domain}"


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest):
    """
    Minta pautan set semula kata laluan. E-mel dihantar jika akaun wujud (log masuk dengan email).
    Sentiasa return mesej sama untuk elak email enumeration.
    """
    email = (body.email or "").strip().lower()
    # Hanya pengguna yang log masuk dengan email (bukan pelajar dengan matrik)
    user = await db.users.find_one({"email": email})
    if user and user.get("role") != "pelajar":
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=RESET_TOKEN_EXPIRE_HOURS)
        await db.password_reset_tokens.delete_many({"email": email})
        await db.password_reset_tokens.insert_one({
            "email": email,
            "token": token,
            "expires_at": expires_at,
            "used": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        reset_link = f"{FRONTEND_URL}/reset-password?token={token}"
        subject = "[MRSMKU] Set Semula Kata Laluan"
        html = f"""
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #4f46e5;">Set Semula Kata Laluan</h2>
            <p>Assalamualaikum,</p>
            <p>Anda telah memohon set semula kata laluan untuk Portal MRSMKU. Klik pautan di bawah dalam masa {RESET_TOKEN_EXPIRE_HOURS} jam untuk menetapkan kata laluan baru:</p>
            <p style="margin: 24px 0;">
                <a href="{reset_link}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(to right, #4f46e5, #7c3aed); color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Set Kata Laluan Baru</a>
            </p>
            <p style="word-break: break-all; font-size: 12px; color: #64748b;">Atau salin pautan: {reset_link}</p>
            <p style="color: #94a3b8; font-size: 14px;">Jika anda tidak memohon ini, abaikan e-mel ini. Pautan akan luput selepas {RESET_TOKEN_EXPIRE_HOURS} jam.</p>
            <p>— Portal MRSMKU</p>
        </div>
        """
        try:
            from services.email_service import send_email
            await send_email(to_email=email, subject=subject, html_content=html)
        except Exception:
            pass
    return {"message": "Jika e-mel anda berdaftar, pautan set semula kata laluan telah dihantar. Sila semak peti masuk dan folder spam."}


@router.get("/reset-password/validate")
async def reset_password_validate(token: str = Query(..., alias="token")):
    """Semak sama ada token set semula masih sah (untuk paparan UI)."""
    if not token:
        return {"valid": False}
    row = await db.password_reset_tokens.find_one({"token": token, "used": False})
    if not row:
        return {"valid": False}
    if datetime.now(timezone.utc) > row["expires_at"]:
        return {"valid": False}
    return {"valid": True, "email_masked": _mask_email(row["email"])}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest):
    """Set kata laluan baru menggunakan token dari e-mel."""
    row = await db.password_reset_tokens.find_one({"token": body.token, "used": False})
    if not row:
        raise HTTPException(status_code=400, detail="Pautan tidak sah atau telah digunakan. Sila minta pautan set semula yang baru.")
    if datetime.now(timezone.utc) > row["expires_at"]:
        raise HTTPException(status_code=400, detail="Pautan telah luput. Sila minta pautan set semula yang baru.")
    email = row["email"]
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=400, detail="Akaun tidak dijumpai.")
    hashed = pwd_context.hash(body.new_password)
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"password": hashed, "must_change_password": False}}
    )
    await db.password_reset_tokens.update_one({"_id": row["_id"]}, {"$set": {"used": True}})
    return {"message": "Kata laluan telah dikemas kini. Sila log masuk dengan kata laluan baru."}
