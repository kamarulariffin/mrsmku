"""
Hostel Routes - Hostel management including checkout/checkin and pulang bermalam
Integrated with real MongoDB only (e-ASRAMA PINTAR data sync).
"""
import os
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Optional, List, Callable, Tuple
from bson import ObjectId
from services.id_normalizer import object_id_or_none

from fastapi import APIRouter, HTTPException, Depends, Query, File, UploadFile
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse
from pydantic import BaseModel

from services.hostel_data_sync import (
    fetch_live_student,
    get_integration_status,
    append_movement_log,
    get_parent_id_for_student,
    get_student_id_for_pelajar_user,
    notify_parent,
    MOVEMENT_TYPE_CHECKOUT,
    MOVEMENT_TYPE_CHECKIN,
    MOVEMENT_TYPE_OUTING,
    MOVEMENT_TYPE_QR_OUT,
    MOVEMENT_TYPE_QR_IN,
)

router = APIRouter(prefix="/api/hostel", tags=["Hostel"])
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


def _id_value(value: Any) -> Any:
    """Normalize ID-like inputs while staying compatible with non-ObjectId IDs."""
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return value
    text = str(value)
    try:
        if ObjectId.is_valid(text):
            return object_id_or_none(text)
    except Exception:
        pass
    return text


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


def require_parent_pelajar():
    """Return dependency for requiring parent/pelajar roles"""
    async def _require_roles(credentials: HTTPAuthorizationCredentials = Depends(security)):
        user = await get_current_user(credentials)
        allowed_roles = ["parent", "pelajar"]
        if user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=403, 
                detail=f"Akses ditolak. Hanya {', '.join(allowed_roles)} boleh mengakses."
            )
        return user
    return _require_roles


def require_guard():
    """Return dependency for guard / admin / superadmin (imbasan kad matrik)."""
    async def _require(credentials: HTTPAuthorizationCredentials = Depends(security)):
        user = await get_current_user(credentials)
        if user.get("role") not in ("guard", "admin", "superadmin"):
            raise HTTPException(status_code=403, detail="Akses ditolak. Hanya guard/admin boleh imbasan.")
        return user
    return _require


# Kategori keluar asrama yang DIBENARKAN semasa tahanan OLAT (bukan outing/pulang bermalam)
OTHER_LEAVE_CATEGORIES = ["pertandingan", "lawatan", "aktiviti", "kem_motivasi", "kecemasan", "sakit", "program_rasmi"]

# Upload surat pengakuan kebenaran ibu bapa (PDF / image) untuk permohonan keluar urusan lain
HOSTEL_LEAVE_UPLOAD_DIR = os.environ.get(
    "HOSTEL_LEAVE_UPLOAD_DIR",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads", "hostel_leave")),
)
HOSTEL_LEAVE_ALLOWED_EXTENSIONS = {"pdf", "jpg", "jpeg", "png", "webp"}
HOSTEL_LEAVE_MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
HOSTEL_LEAVE_MAX_FILES = 5
# Kebenaran ke klinik/hospital - permohonan oleh warden, auto-approved, disegerakkan dengan e-hostel
KLINIK_KATEGORI = "klinik"
# Semua kategori yang dikira "keluar" untuk guard scan / movement (termasuk klinik)
HOSTEL_LEAVE_CATEGORIES = ["outing", "pulang_bermalam", KLINIK_KATEGORI] + OTHER_LEAVE_CATEGORIES

# Fallback jika koleksi olat_categories kosong (kategori OLAT 3 sahaja, biasanya dari DB)
OLAT_OUTING_BLOCK_KEYWORDS_FALLBACK = ["belum pulang", "tidak imbas kad", "tertinggal kad"]


async def _get_olat_block_keywords(db) -> list:
    """Baca keyword kategori OLAT dari DB (sync dengan pengurusan warden). Maksimum 3."""
    try:
        rows = await db.olat_categories.find({}).sort("order", 1).to_list(10)
        keywords = [r.get("keyword") for r in rows if r.get("keyword")]
        if keywords:
            return keywords
    except Exception:
        pass
    return OLAT_OUTING_BLOCK_KEYWORDS_FALLBACK


async def _olat_blocks_outing(db, student_id: ObjectId) -> Tuple[bool, str, Optional[str]]:
    """
    Return (blocked, reason, detention_end_date) if student has active OLAT that blocks outing.
    detention_end_date is the date (YYYY-MM-DD) until which outing is blocked; after that date button is available.
    """
    from datetime import date
    today_iso = date.today().isoformat()
    keywords = await _get_olat_block_keywords(db)
    open_cases = await db.olat_cases.find({
        "student_id": student_id,
        "status": {"$in": ["open", "in_progress"]},
    }).to_list(50)
    for case in open_cases:
        end_date = case.get("detention_end_date")
        if end_date and end_date < today_iso:
            continue
        offence_id = case.get("offence_id")
        if not offence_id:
            reason = (
                f"Anda dikenakan tindakan OLAT dan tidak dibenarkan outing sehingga "
                f"{end_date or 'tarikh yang ditetapkan pihak warden'}."
            )
            return True, reason, end_date
        offence = await db.offences.find_one({"_id": offence_id})
        if not offence:
            continue
        keterangan = (offence.get("keterangan") or "").strip().lower()
        for kw in keywords:
            if kw and kw in keterangan:
                reason = (
                    f"Anda dikenakan tindakan OLAT dan tidak dibenarkan outing sehingga "
                    f"{end_date or 'tarikh yang ditetapkan pihak warden'}."
                )
                return True, reason, end_date
    return False, "", None


# ============ PYDANTIC MODELS ============

class HostelRecord(BaseModel):
    student_id: str
    check_type: str = "keluar"
    tarikh_keluar: Optional[str] = None
    tarikh_pulang: Optional[str] = None
    pic_name: str
    driver_name: Optional[str] = None
    vehicle_out: Optional[str] = None
    vehicle_in: Optional[str] = None
    kategori: str
    remarks: Optional[str] = None


# Nilai cara_pulang untuk permohonan pulang bermalam (disegerakkan dengan keluar/masuk)
CARA_PULANG_IBU_BAPA = "ibu_bapa"       # Dibawa pulang oleh ibu bapa
CARA_PULANG_BAS = "bas"                 # Pulang menaiki bas (wajib isi transport_remarks)
CARA_PULANG_SAUDARA = "saudara"         # (legacy) Kenderaan saudara
CARA_PULANG_SAUDARA_MARA = "saudara_mara"
CARA_PULANG_IBU_SAUDARA = "ibu_saudara"
CARA_PULANG_BAPA_SAUDARA = "bapa_saudara"
CARA_PULANG_ADIK_BERADIK = "adik_beradik"
CARA_PULANG_KENALAN = "kenalan"         # (legacy) Menumpang kereta kenalan
CARA_PULANG_LAIN = "lain_lain"           # Lain-lain (wajib isi transport_remarks)


class PulangBermalamRequest(BaseModel):
    student_id: Optional[str] = ""
    tarikh_keluar: str
    tarikh_pulang: str
    sebab: str
    pic_name: str
    pic_phone: Optional[str] = None
    cara_pulang: str = CARA_PULANG_IBU_BAPA  # ibu_bapa | bas | saudara | kenalan | lain_lain
    plate_number: Optional[str] = None  # No. plat kenderaan (ibu bapa / saudara)
    transport_remarks: Optional[str] = None  # Catatan bas atau lain-lain


# ---------- PBW / PBP (Pulang Bermalam Wajib / Pilihan) - jadual ikut pekeliling maktab ----------
PBW_PBP_TYPE_PBW = "pbw"
PBW_PBP_TYPE_PBP = "pbp"


class PbwPbpPeriodCreate(BaseModel):
    type: str  # pbw | pbp
    label: str  # e.g. "PBW CNY", "PBP Hujung Minggu"
    start_date: str  # YYYY-MM-DD
    end_date: str  # YYYY-MM-DD
    description: Optional[str] = None


class PbwPbpPeriodUpdate(BaseModel):
    type: Optional[str] = None
    label: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    description: Optional[str] = None


# ============ HOSTEL ROUTES ============

@router.post("/checkout")
async def hostel_checkout(
    record: HostelRecord,
    current_user: dict = Depends(require_warden_admin())
):
    """Record student checkout (real MongoDB sync)"""
    db = get_db()
    student = await fetch_live_student(db, record.student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    
    record_doc = {
        "student_id": _id_value(record.student_id),
        "student_name": student.get("full_name", student.get("fullName", "Unknown")),
        "check_type": "keluar",
        "tarikh_keluar": record.tarikh_keluar or datetime.now(timezone.utc).isoformat(),
        "tarikh_pulang": record.tarikh_pulang,
        "pic_name": record.pic_name,
        "driver_name": record.driver_name,
        "vehicle_out": record.vehicle_out,
        "kategori": record.kategori,
        "remarks": record.remarks,
        "recorded_by": str(current_user["_id"]),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.hostel_records.insert_one(record_doc)
    student_name = student.get("full_name", student.get("fullName", "Unknown"))
    await append_movement_log(
        db,
        _id_value(record.student_id),
        student_name,
        MOVEMENT_TYPE_CHECKOUT,
        recorded_by=str(current_user["_id"]),
        expected_return=record.tarikh_pulang,
        source_record_id=str(result.inserted_id),
        metadata={"kategori": record.kategori, "pic_name": record.pic_name},
    )
    await log_audit(current_user, "HOSTEL_CHECKOUT", "hostel", f"Pelajar keluar: {student_name}")
    parent_id = await get_parent_id_for_student(db, record.student_id)
    await notify_parent(
        db, parent_id,
        "Anak Keluar Asrama",
        f"{student_name} telah didaftarkan keluar asrama. Kategori: {record.kategori}.",
        "info",
        "/children",
    )
    return {"message": "Rekod keluar disimpan", "id": str(result.inserted_id)}


@router.post("/checkin/{record_id}")
async def hostel_checkin(
    record_id: str,
    vehicle_in: Optional[str] = None,
    current_user: dict = Depends(require_warden_admin())
):
    """Record student checkin"""
    db = get_db()
    record = await db.hostel_records.find_one({"_id": _id_value(record_id)})
    if not record:
        raise HTTPException(status_code=404, detail="Rekod tidak dijumpai")
    
    actual_return_iso = datetime.now(timezone.utc).isoformat()
    await db.hostel_records.update_one(
        {"_id": _id_value(record_id)},
        {"$set": {
            "check_type": "masuk",
            "actual_return": actual_return_iso,
            "vehicle_in": vehicle_in,
            "checkin_by": str(current_user["_id"])
        }}
    )
    expected = record.get("tarikh_pulang") or record.get("actual_return")
    is_late = False
    if expected:
        try:
            expected_dt = datetime.fromisoformat(expected.replace("Z", "+00:00"))
            is_late = datetime.now(timezone.utc) > expected_dt
        except Exception:
            pass
    await append_movement_log(
        db,
        record["student_id"],
        record.get("student_name", "Unknown"),
        MOVEMENT_TYPE_CHECKIN,
        recorded_by=str(current_user["_id"]),
        expected_return=expected,
        actual_return=actual_return_iso,
        is_late_return=is_late,
        source_record_id=record_id,
        metadata={"vehicle_in": vehicle_in},
    )
    await log_audit(current_user, "HOSTEL_CHECKIN", "hostel", f"Pelajar masuk: {record['student_name']}" + (" (lewat balik)" if is_late else ""))
    parent_id = await get_parent_id_for_student(db, str(record["student_id"]))
    await notify_parent(
        db, parent_id,
        "Anak Masuk Asrama",
        f"{record.get('student_name', '')} telah didaftarkan masuk asrama." + (" (Lewat balik)" if is_late else ""),
        "warning" if is_late else "success",
        "/children",
    )
    return {"message": "Rekod masuk dikemaskini", "is_late_return": is_late}


@router.get("/records")
async def get_hostel_records(
    student_id: Optional[str] = None,
    current_user: dict = Depends(require_warden_admin())
):
    """Get hostel records"""
    db = get_db()
    query = {}
    if student_id:
        query["student_id"] = _id_value(student_id)
    if current_user["role"] == "warden":
        # Filter by block - check both users and students collections
        block = current_user.get("assigned_block", current_user.get("block_assigned", ""))
        users_in_block = await db.users.find({"block": block, "role": "pelajar"}).to_list(1000)
        students_in_block = await db.students.find({"block_name": block}).to_list(1000)
        all_student_ids = [s["_id"] for s in users_in_block] + [s["_id"] for s in students_in_block]
        if all_student_ids:
            query["student_id"] = {"$in": all_student_ids}
    
    records = await db.hostel_records.find(query).sort("created_at", -1).to_list(100)
    return [{"id": str(r["_id"]), **{k: v for k, v in r.items() if k != "_id" and k != "student_id"}, "student_id": str(r["student_id"])} for r in records]


@router.get("/students")
async def get_hostel_students(
    block: Optional[str] = None,
    form: Optional[int] = None,
    current_user: dict = Depends(require_warden_admin())
):
    """Get students for hostel management (disegerakkan dengan modul asrama: users + students)."""
    db = get_db()
    block_filter = None
    if current_user["role"] == "warden":
        block_filter = current_user.get("block_assigned", current_user.get("assigned_block", ""))
    elif block:
        block_filter = block

    result = []
    seen_ids = set()

    # Dari db.users (pelajar)
    query = {"status": "approved", "role": "pelajar"}
    if block_filter:
        query["block"] = block_filter
    if form:
        query["form"] = form
    students_users = await db.users.find(query).to_list(500)
    for s in students_users:
        sid = s["_id"]
        if sid in seen_ids:
            continue
        seen_ids.add(sid)
        latest_record = await db.hostel_records.find_one(
            {"student_id": sid},
            sort=[("created_at", -1)]
        )
        hostel_status = "dalam_asrama"
        if latest_record and latest_record.get("check_type") == "keluar" and not latest_record.get("actual_return"):
            hostel_status = "keluar"
        result.append({
            "id": str(sid),
            "matric": s.get("matric", ""),
            "fullName": s.get("fullName", s.get("full_name", "")),
            "form": s.get("form", 0),
            "kelas": s.get("kelas", ""),
            "block": s.get("block", ""),
            "phone": s.get("phone", ""),
            "hostel_status": hostel_status,
            "latest_record_id": str(latest_record["_id"]) if latest_record else None
        })

    # Dari db.students (modul asrama) - merge pelajar yang mungkin tiada dalam users
    if block_filter:
        students_students = await db.students.find({"block_name": block_filter}).to_list(500)
        if form:
            students_students = [s for s in students_students if s.get("form") == form]
    else:
        students_students = []
    for s in students_students:
        sid = s["_id"]
        if sid in seen_ids:
            continue
        seen_ids.add(sid)
        latest_record = await db.hostel_records.find_one(
            {"student_id": sid},
            sort=[("created_at", -1)]
        )
        hostel_status = "dalam_asrama"
        if latest_record and latest_record.get("check_type") == "keluar" and not latest_record.get("actual_return"):
            hostel_status = "keluar"
        result.append({
            "id": str(sid),
            "matric": s.get("matric_number", s.get("matric", "")),
            "fullName": s.get("full_name", s.get("fullName", "")),
            "form": s.get("form", 0),
            "kelas": s.get("kelas", s.get("class_name", "")),
            "block": s.get("block_name", s.get("block", "")),
            "phone": s.get("phone", ""),
            "hostel_status": hostel_status,
            "latest_record_id": str(latest_record["_id"]) if latest_record else None
        })

    return result


@router.get("/blocks")
async def get_hostel_blocks(current_user: dict = Depends(require_warden_admin())):
    """Get list of hostel blocks"""
    db = get_db()
    blocks = await db.users.distinct("block", {"role": "pelajar", "status": "approved"})
    return [b for b in blocks if b]


@router.get("/stats")
async def get_hostel_stats(current_user: dict = Depends(require_warden_admin())):
    """Get hostel statistics"""
    db = get_db()
    block_filter = {}
    if current_user["role"] == "warden":
        block_filter["block"] = current_user.get("block_assigned", current_user.get("assigned_block", ""))
    
    total_students = await db.users.count_documents({**block_filter, "role": "pelajar", "status": "approved"})
    
    # Count students currently out
    out_students = await db.hostel_records.distinct(
        "student_id",
        {"check_type": "keluar", "actual_return": {"$exists": False}},
    )
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_checkouts = await db.hostel_records.count_documents({
        "check_type": "keluar",
        "created_at": {"$regex": f"^{today}"}
    })
    today_checkins = await db.hostel_records.count_documents({
        "actual_return": {"$regex": f"^{today}"}
    })
    late_returns_count = await db.movement_logs.count_documents({"is_late_return": True})
    return {
        "total_students": total_students,
        "in_hostel": total_students - len(out_students),
        "out_count": len(out_students),
        "today_checkouts": today_checkouts,
        "today_checkins": today_checkins,
        "late_returns_count": late_returns_count,
        "block": current_user.get("block_assigned", current_user.get("assigned_block", "Semua"))
    }


BEDS_PER_ROOM_DEFAULT = 2


@router.get("/empty-rooms")
async def get_empty_rooms_by_block(current_user: dict = Depends(require_warden_admin())):
    """
    Bilik kosong ikut blok (bilik yang ada katil kosong).
    Untuk warden: blok yang ditetapkan sahaja. Memudahkan tetapan penginapan pelajar baru.
    """
    db = get_db()
    warden_block = (current_user.get("block_assigned") or current_user.get("assigned_block") or "").strip()
    students_match = {
        "$and": [
            {"$or": [
                {"block_name": {"$exists": True, "$ne": ""}},
                {"block": {"$exists": True, "$ne": ""}},
                {"hostel_block": {"$exists": True, "$ne": ""}}
            ]},
            {"$or": [{"room_number": {"$exists": True, "$ne": ""}}, {"room": {"$exists": True, "$ne": ""}}]}
        ]
    }
    from collections import defaultdict
    by_room = defaultdict(int)
    async for row in db.students.find(students_match):
        block = row.get("block_name")
        if block in (None, ""):
            block = row.get("block")
        if block in (None, ""):
            block = row.get("hostel_block")
        room = row.get("room_number")
        if room in (None, ""):
            room = row.get("room")
        block = str(block or "").strip()
        room = str(room or "").strip()
        if block or room:
            by_room[(block, room)] += 1
    block_beds_map = {}
    try:
        for b in await db.hostel_blocks.find({}).to_list(100):
            code = (b.get("code") or "").strip()
            bp = b.get("beds_per_room")
            if code and bp is not None and int(bp) > 0:
                block_beds_map[code] = int(bp)
    except Exception:
        pass
    # Build per-block list of rooms with empty beds only
    block_empty = defaultdict(list)
    for (block, room), occupants in by_room.items():
        if warden_block and block != warden_block:
            continue
        cap = block_beds_map.get(block) or BEDS_PER_ROOM_DEFAULT
        empty = max(0, cap - occupants)
        if empty > 0:
            block_empty[block].append({
                "room": room or "–",
                "occupants": occupants,
                "capacity": cap,
                "empty_beds": empty,
            })
    # Also include blocks that have no students in DB but might be in hostel_blocks (fully empty block)
    if warden_block:
        try:
            block_doc = await db.hostel_blocks.find_one(
                {"$or": [{"code": warden_block}, {"name": {"$regex": warden_block, "$options": "i"}}]},
                {"code": 1, "beds_per_room": 1}
            )
            if block_doc and warden_block not in block_empty:
                block_empty[warden_block] = []
        except Exception:
            pass
    result = []
    for block in sorted(block_empty.keys()):
        rooms = block_empty[block]
        total_empty_beds = sum(r["empty_beds"] for r in rooms)
        result.append({
            "block": block,
            "empty_rooms": rooms,
            "total_empty_rooms": len(rooms),
            "total_empty_beds": total_empty_beds,
        })
    return {"blocks": result}


@router.get("/integration-status")
async def hostel_integration_status(current_user: dict = Depends(require_warden_admin())):
    """Real-time integration status with MongoDB (e-ASRAMA PINTAR). All data synced."""
    db = get_db()
    return await get_integration_status(db)


# ============ MOVEMENT LOGS (Fasa 2 - E-Hostel) ============

@router.get("/movement-logs")
async def get_movement_logs(
    student_id: Optional[str] = None,
    movement_type: Optional[str] = None,
    limit: int = Query(100, le=500),
    current_user: dict = Depends(require_warden_admin()),
):
    """Senarai log pergerakan pelajar (live dari MongoDB)."""
    db = get_db()
    query = {}
    if student_id:
        query["student_id"] = _id_value(student_id)
    if movement_type:
        query["movement_type"] = movement_type
    if current_user["role"] == "warden":
        block = current_user.get("assigned_block", current_user.get("block_assigned", ""))
        users_in_block = await db.users.find({"block": block, "role": "pelajar"}).to_list(1000)
        students_in_block = await db.students.find({"block_name": block}).to_list(1000)
        all_ids = [s["_id"] for s in users_in_block] + [s["_id"] for s in students_in_block]
        if all_ids:
            query["student_id"] = {"$in": all_ids}
    logs = await db.movement_logs.find(query).sort("created_at", -1).limit(limit).to_list(limit)
    return [
        {
            "id": str(r["_id"]),
            "student_id": str(r["student_id"]),
            "student_name": r.get("student_name", ""),
            "movement_type": r.get("movement_type", ""),
            "expected_return": r.get("expected_return"),
            "actual_return": r.get("actual_return"),
            "is_late_return": r.get("is_late_return", False),
            "source_record_id": r.get("source_record_id"),
            "metadata": r.get("metadata"),
            "created_at": r.get("created_at", ""),
        }
        for r in logs
    ]


# ============ LIVE INCIDENTS (Fasa 8 - optional) ============

def _parse_created_at(s: Optional[str]) -> datetime:
    """Parse created_at string to datetime for sorting."""
    if not s:
        return datetime.min.replace(tzinfo=timezone.utc)
    try:
        if isinstance(s, datetime):
            return s if s.tzinfo else s.replace(tzinfo=timezone.utc)
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return datetime.min.replace(tzinfo=timezone.utc)


@router.get("/live-incidents")
async def get_live_incidents(
    hours: int = Query(24, ge=1, le=168, description="Jam kebelakangan"),
    limit: int = Query(25, ge=5, le=50),
    current_user: dict = Depends(require_warden_admin()),
):
    """
    Aktiviti terkini dari MongoDB: pergerakan, kesalahan, OLAT.
    Untuk paparan real-time pada dashboard bersepadu (Fasa 8).
    """
    db = get_db()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    cutoff_iso = cutoff.isoformat()
    incidents = []

    # Movement logs (lewat balik atau checkin/checkout baru)
    mov_cursor = db.movement_logs.find({
        "created_at": {"$gte": cutoff_iso}
    }).sort("created_at", -1).limit(limit)
    for r in await mov_cursor.to_list(limit):
        at = _parse_created_at(r.get("created_at"))
        late = r.get("is_late_return", False)
        mtype = r.get("movement_type", "")
        name = r.get("student_name", "Pelajar")
        if late:
            title = f"Lewat balik: {name}"
        elif mtype in (MOVEMENT_TYPE_CHECKIN, "checkin"):
            title = f"Masuk asrama: {name}"
        elif mtype in (MOVEMENT_TYPE_CHECKOUT, "checkout"):
            title = f"Keluar asrama: {name}"
        else:
            title = f"Pergerakan: {name}"
        incidents.append({
            "type": "movement",
            "id": str(r["_id"]),
            "title": title,
            "at": at.isoformat(),
            "link": "/hostel",
            "meta": {"is_late_return": late},
        })

    # Offences (kesalahan baru)
    off_cursor = db.offences.find({"created_at": {"$gte": cutoff_iso}}).sort("created_at", -1).limit(limit)
    for r in await off_cursor.to_list(limit):
        at = _parse_created_at(r.get("created_at"))
        name = r.get("student_name", "Pelajar")
        incidents.append({
            "type": "offence",
            "id": str(r["_id"]),
            "title": f"Kesalahan disiplin: {name}",
            "at": at.isoformat(),
            "link": "/admin/discipline",
        })

    # OLAT cases (dibuka/dikemaskini)
    olat_cursor = db.olat_cases.find({"created_at": {"$gte": cutoff_iso}}).sort("created_at", -1).limit(limit)
    for r in await olat_cursor.to_list(limit):
        at = _parse_created_at(r.get("created_at"))
        case_num = r.get("case_number", "")
        incidents.append({
            "type": "olat",
            "id": str(r["_id"]),
            "title": f"Kes OLAT: {case_num}",
            "at": at.isoformat(),
            "link": "/admin/discipline",
        })

    # Sort by time desc and cap
    incidents.sort(key=lambda x: x["at"], reverse=True)
    return incidents[:limit]


@router.get("/my-olat-outing-block")
async def get_my_olat_outing_block(current_user: dict = Depends(require_parent_pelajar())):
    """
    Pelajar: semak sama ada diri dikecualikan daripada outing (OLAT tahanan).
    Return { "blocked": bool, "reason": str, "detention_end_date": str|null }. Selepas detention_end_date, butang mohon outing available.
    """
    if current_user["role"] != "pelajar":
        return {"blocked": False, "reason": "", "detention_end_date": None}
    db = get_db()
    my_student_id = await get_student_id_for_pelajar_user(db, current_user)
    if not my_student_id:
        return {"blocked": False, "reason": "", "detention_end_date": None}
    blocked, reason, detention_end_date = await _olat_blocks_outing(db, my_student_id)
    return {"blocked": blocked, "reason": reason, "detention_end_date": detention_end_date}


@router.get("/olat-status-children")
async def get_olat_status_children(current_user: dict = Depends(get_current_user)):
    """
    Ibu bapa: senarai status OLAT untuk setiap anak. Untuk paparan dashboard ibu bapa.
    Return { "children": [ { student_id, student_name, matric_number, blocked, reason, detention_end_date } ] }.
    """
    if current_user.get("role") != "parent":
        raise HTTPException(status_code=403, detail="Akses ditolak. Hanya ibu bapa.")
    db = get_db()
    students = await db.students.find({"parent_id": current_user["_id"]}).to_list(100)
    result = []
    for s in students:
        sid = s["_id"]
        blocked, reason, detention_end_date = await _olat_blocks_outing(db, sid)
        result.append({
            "student_id": str(sid),
            "student_name": s.get("full_name", "Unknown"),
            "matric_number": s.get("matric_number", ""),
            "ic_number": s.get("ic_number", ""),
            "blocked": blocked,
            "reason": reason,
            "detention_end_date": detention_end_date,
        })
    return {"children": result}


# ============ PERMOHONAN KELUAR (URUSAN LAIN) - Dibenarkan semasa OLAT ============
# Pertandingan, lawatan, aktiviti, kecemasan, sakit, program_rasmi — TIADA sekatan OLAT.


class LeaveRequest(BaseModel):
    student_id: Optional[str] = ""
    kategori: str  # pertandingan | lawatan | aktiviti | kecemasan | sakit | program_rasmi
    tarikh_keluar: str
    tarikh_pulang: str
    sebab: str
    pic_name: str  # Nama guru / person in charge
    pic_phone: Optional[str] = None  # No. telefon guru PIC
    destinasi: Optional[str] = None  # Lokasi
    vehicle_plate: Optional[str] = None  # No. plat kenderaan (kereta/bas/van)
    vehicle_type: Optional[str] = None  # kereta | bas | van
    remarks: Optional[str] = None  # Catatan tambahan (lokasi/kenderaan lain)
    attachments: Optional[List[str]] = None  # URL list dari POST /leave/upload (surat pengakuan ibu bapa)


@router.post("/leave/request")
async def request_leave(
    request: LeaveRequest,
    current_user: dict = Depends(require_parent_pelajar()),
):
    """
    Permohonan keluar asrama untuk urusan selain outing: pertandingan, lawatan, aktiviti,
    kecemasan, sakit, program rasmi. Dibenarkan semasa tahanan OLAT (tiada sekatan).
    """
    if request.kategori not in OTHER_LEAVE_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Kategori mesti salah satu: {', '.join(OTHER_LEAVE_CATEGORIES)}",
        )
    db = get_db()
    student_id_str = request.student_id
    if current_user["role"] == "pelajar":
        my_student_id = await get_student_id_for_pelajar_user(db, current_user)
        if not my_student_id:
            raise HTTPException(status_code=403, detail="Rekod pelajar tidak dijumpai. Sila hubungi pentadbir.")
        if not student_id_str or str(student_id_str).strip() == "":
            student_id_str = str(my_student_id)
        elif str(my_student_id) != str(student_id_str):
            raise HTTPException(status_code=403, detail="Akses ditolak")
    student = await fetch_live_student(db, student_id_str)
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    if current_user["role"] == "parent":
        if str(student.get("parent_id", "")) != str(current_user["_id"]):
            raise HTTPException(status_code=403, detail="Akses ditolak")
    student_name = student.get("full_name", student.get("fullName", "Unknown"))
    existing = await db.hostel_records.find_one({
        "student_id": _id_value(student_id_str),
        "kategori": request.kategori,
        "tarikh_keluar": request.tarikh_keluar,
        "status": {"$in": ["pending", "approved"]},
    })
    if existing:
        raise HTTPException(status_code=400, detail="Sudah ada permohonan untuk tarikh dan kategori ini")
    record_doc = {
        "student_id": _id_value(student_id_str),
        "student_name": student_name,
        "student_matric": student.get("matric_number", student.get("matric", "")),
        "student_form": student.get("form", 0),
        "student_block": student.get("block_name", student.get("block", "")),
        "check_type": "permohonan",
        "tarikh_keluar": request.tarikh_keluar,
        "tarikh_pulang": request.tarikh_pulang,
        "pic_name": request.pic_name,
        "pic_phone": request.pic_phone,
        "kategori": request.kategori,
        "remarks": request.sebab,
        "destinasi": request.destinasi,
        "vehicle_plate": (request.vehicle_plate or "").strip() or None,
        "vehicle_type": (request.vehicle_type or "").strip() or None,
        "leave_remarks": (request.remarks or "").strip() or None,
        "attachments": request.attachments or [],
        "status": "pending",
        "requested_by": str(current_user["_id"]),
        "requested_by_role": current_user["role"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.hostel_records.insert_one(record_doc)
    block = student.get("block_name", student.get("block", ""))
    wardens = await db.users.find({
        "role": "warden",
        "$or": [{"assigned_block": block}, {"block_assigned": block}],
    }).to_list(10)
    for w in wardens:
        await db.notifications.insert_one({
            "user_id": w["_id"],
            "title": f"Permohonan Keluar ({request.kategori})",
            "message": f"{student_name} memohon keluar asrama ({request.kategori}) {request.tarikh_keluar} - {request.tarikh_pulang}",
            "type": "action",
            "is_read": False,
            "link": "/hostel",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    await log_audit(current_user, "REQUEST_LEAVE", "hostel", f"Mohon keluar ({request.kategori}): {student_name}")
    return {"message": "Permohonan keluar berjaya dihantar", "id": str(result.inserted_id)}


@router.get("/leave/requests")
async def get_leave_requests(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Senarai permohonan keluar (urusan lain: pertandingan, lawatan, dll.)."""
    db = get_db()
    query = {"kategori": {"$in": OTHER_LEAVE_CATEGORIES}}
    if status:
        query["status"] = status
    if current_user["role"] == "parent":
        children = await db.students.find({"parent_id": current_user["_id"]}).to_list(100)
        query["student_id"] = {"$in": [c["_id"] for c in children]}
    elif current_user["role"] == "pelajar":
        my_student_id = await get_student_id_for_pelajar_user(db, current_user)
        if not my_student_id:
            return []
        query["student_id"] = my_student_id
    elif current_user["role"] == "warden":
        block = current_user.get("assigned_block", current_user.get("block_assigned", ""))
        if block:
            query["student_block"] = block
    records = await db.hostel_records.find(query).sort("created_at", -1).to_list(100)
    return [
        {
            "id": str(r["_id"]),
            "student_id": str(r["student_id"]),
            "student_name": r.get("student_name", ""),
            "kategori": r.get("kategori", ""),
            "tarikh_keluar": r.get("tarikh_keluar", ""),
            "tarikh_pulang": r.get("tarikh_pulang", ""),
            "sebab": r.get("remarks", ""),
            "pic_name": r.get("pic_name", ""),
            "pic_phone": r.get("pic_phone", ""),
            "destinasi": r.get("destinasi", ""),
            "vehicle_plate": r.get("vehicle_plate", ""),
            "vehicle_type": r.get("vehicle_type", ""),
            "leave_remarks": r.get("leave_remarks", ""),
            "attachments": r.get("attachments", []),
            "status": r.get("status", "pending"),
            "requested_by_role": r.get("requested_by_role", ""),
            "created_at": r.get("created_at", ""),
        }
        for r in records
    ]


def _sanitize_leave_filename(name: str) -> str:
    """Sanitize filename for hostel leave upload (no path, safe chars)."""
    if not name or not name.strip():
        return "file"
    base = os.path.basename(name).strip()
    base = re.sub(r"[^\w\s\-\.]", "", base)[:80]
    return base or "file"


def _mime_for_leave_ext(ext: str) -> str:
    m = {"pdf": "application/pdf", "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
    return m.get(ext.lower(), "application/octet-stream")


@router.post("/leave/upload")
async def upload_leave_attachment(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_parent_pelajar()),
):
    """
    Muat naik surat pengakuan kebenaran ibu bapa (PDF atau imej) untuk permohonan keluar urusan lain.
    Return URL untuk disertakan dalam permohonan leave.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Nama fail tidak sah")
    ext = (file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "").strip()
    if ext not in HOSTEL_LEAVE_ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Hanya fail PDF atau imej (jpg, png, webp) dibenarkan. Diterima: {ext or 'tiada sambungan'}",
        )
    content = await file.read()
    if len(content) > HOSTEL_LEAVE_MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Saiz fail melebihi 10MB")
    try:
        os.makedirs(HOSTEL_LEAVE_UPLOAD_DIR, exist_ok=True)
    except OSError:
        raise HTTPException(status_code=500, detail="Direktori muat naik tidak boleh dicipta")
    safe_name = _sanitize_leave_filename(file.filename)
    if not safe_name.endswith(f".{ext}"):
        safe_name = f"{safe_name}.{ext}" if "." not in safe_name else safe_name
    unique = uuid.uuid4().hex[:12]
    stored_name = f"{unique}_{safe_name}"
    path = os.path.join(HOSTEL_LEAVE_UPLOAD_DIR, stored_name)
    with open(path, "wb") as f:
        f.write(content)
    url = f"/api/hostel/leave/files/{stored_name}"
    return {"url": url, "filename": file.filename, "stored_name": stored_name}


@router.get("/leave/files/{stored_name}")
async def serve_leave_file(
    stored_name: str,
    current_user: dict = Depends(get_current_user),
):
    """Serve surat pengakuan yang telah dimuat naik (auth required)."""
    if ".." in stored_name or "/" in stored_name or "\\" in stored_name:
        raise HTTPException(status_code=404, detail="Fail tidak dijumpai")
    path = os.path.join(HOSTEL_LEAVE_UPLOAD_DIR, stored_name)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Fail tidak dijumpai")
    ext = stored_name.rsplit(".", 1)[-1].lower() if "." in stored_name else ""
    media_type = _mime_for_leave_ext(ext)
    return FileResponse(path, media_type=media_type, filename=stored_name)


@router.post("/leave/{request_id}/approve")
async def approve_leave(request_id: str, current_user: dict = Depends(require_warden_admin())):
    """Lulus permohonan keluar (urusan lain)."""
    db = get_db()
    record = await db.hostel_records.find_one({"_id": _id_value(request_id), "kategori": {"$in": OTHER_LEAVE_CATEGORIES}})
    if not record:
        raise HTTPException(status_code=404, detail="Permohonan tidak dijumpai")
    if record.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Permohonan sudah diproses")
    await db.hostel_records.update_one(
        {"_id": _id_value(request_id)},
        {"$set": {
            "status": "approved",
            "approved_by": str(current_user["_id"]),
            "approved_by_name": current_user.get("full_name", ""),
            "approved_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    requester_id = record.get("requested_by")
    if requester_id:
        await db.notifications.insert_one({
            "user_id": _id_value(requester_id),
            "title": "Kelulusan Permohonan Keluar",
            "message": f"Permohonan keluar ({record.get('kategori', '')}) untuk {record.get('student_name', '')} telah DILULUSKAN.",
            "type": "success",
            "is_read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    await log_audit(current_user, "APPROVE_LEAVE", "hostel", f"Lulus keluar ({record.get('kategori')}): {record.get('student_name')}")
    return {"message": "Permohonan diluluskan"}


@router.post("/leave/{request_id}/reject")
async def reject_leave(
    request_id: str,
    reason: str = "",
    current_user: dict = Depends(require_warden_admin()),
):
    """Tolak permohonan keluar (urusan lain)."""
    db = get_db()
    record = await db.hostel_records.find_one({"_id": _id_value(request_id), "kategori": {"$in": OTHER_LEAVE_CATEGORIES}})
    if not record:
        raise HTTPException(status_code=404, detail="Permohonan tidak dijumpai")
    if record.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Permohonan sudah diproses")
    await db.hostel_records.update_one(
        {"_id": _id_value(request_id)},
        {"$set": {
            "status": "rejected",
            "rejected_by": str(current_user["_id"]),
            "rejection_reason": reason,
            "rejected_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    requester_id = record.get("requested_by")
    if requester_id:
        await db.notifications.insert_one({
            "user_id": _id_value(requester_id),
            "title": "Permohonan Keluar Ditolak",
            "message": f"Permohonan keluar ({record.get('kategori', '')}) telah DITOLAK. {reason or ''}",
            "type": "warning",
            "is_read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    await log_audit(current_user, "REJECT_LEAVE", "hostel", f"Tolak keluar: {record.get('student_name')}")
    return {"message": "Permohonan ditolak"}


# ============ PERMOHONAN KE KLINIK/HOSPITAL (oleh warden, auto-approved, sync e-hostel) ============

class KlinikRequest(BaseModel):
    student_id: str
    tarikh_keluar: str
    tarikh_pulang: str
    destinasi: str  # Nama klinik atau hospital
    sebab: str
    pic_name: Optional[str] = None  # Nama pengiring (jika ada)
    pic_phone: Optional[str] = None


def _warden_can_manage_klinik_record(current_user: dict, record: dict) -> bool:
    """Warden hanya boleh urus rekod dalam blok mereka."""
    if current_user.get("role") not in ("warden", "admin", "superadmin"):
        return False
    if current_user.get("role") != "warden":
        return True
    warden_block = current_user.get("assigned_block") or current_user.get("block_assigned") or ""
    record_block = record.get("student_block", "")
    return bool(warden_block and record_block == warden_block)


@router.post("/klinik/request")
async def request_klinik(
    request: KlinikRequest,
    current_user: dict = Depends(require_warden_admin()),
):
    """
    Warden memohon kebenaran e-hostel ke Klinik/Hospital bagi pihak pelajar.
    Permohonan melalui warden diluluskan secara automatik. Data pelajar disegerakkan dengan modul asrama.
    """
    db = get_db()
    student = await fetch_live_student(db, request.student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    if current_user["role"] == "warden":
        block = current_user.get("assigned_block", current_user.get("block_assigned", ""))
        student_block = student.get("block_name", student.get("block", ""))
        if not block or student_block != block:
            raise HTTPException(status_code=403, detail="Anda hanya boleh memohon untuk pelajar dalam blok anda")
    student_name = student.get("full_name", student.get("fullName", "Unknown"))
    record_doc = {
        "student_id": _id_value(request.student_id),
        "student_name": student_name,
        "student_matric": student.get("matric_number", student.get("matric", "")),
        "student_form": student.get("form", 0),
        "student_block": student.get("block_name", student.get("block", "")),
        "student_room": student.get("room_number", student.get("room", "")),
        "check_type": "permohonan",
        "tarikh_keluar": request.tarikh_keluar,
        "tarikh_pulang": request.tarikh_pulang,
        "pic_name": request.pic_name or "",
        "pic_phone": request.pic_phone or "",
        "kategori": KLINIK_KATEGORI,
        "remarks": request.sebab,
        "destinasi": request.destinasi,
        "status": "approved",
        "requested_by": str(current_user["_id"]),
        "requested_by_role": current_user["role"],
        "approved_by": str(current_user["_id"]),
        "approved_by_name": current_user.get("full_name", ""),
        "approved_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.hostel_records.insert_one(record_doc)
    await log_audit(current_user, "KLINIK_REQUEST", "hostel", f"Permohonan klinik/hospital bagi {student_name} (auto-approved)")
    return {"message": "Kebenaran ke klinik/hospital telah diluluskan", "id": str(result.inserted_id)}


@router.get("/klinik/requests")
async def get_klinik_requests(
    status: Optional[str] = None,
    current_user: dict = Depends(require_warden_admin()),
):
    """Senarai permohonan ke klinik/hospital (disegerakkan dengan modul asrama)."""
    db = get_db()
    query = {"kategori": KLINIK_KATEGORI}
    if status:
        query["status"] = status
    if current_user["role"] == "warden":
        block = current_user.get("assigned_block", current_user.get("block_assigned", ""))
        if block:
            query["student_block"] = block
    records = await db.hostel_records.find(query).sort("created_at", -1).to_list(100)
    return [
        {
            "id": str(r["_id"]),
            "student_id": str(r["student_id"]),
            "student_name": r.get("student_name", ""),
            "student_matric": r.get("student_matric", ""),
            "student_form": r.get("student_form", 0),
            "student_block": r.get("student_block", ""),
            "student_room": r.get("student_room", ""),
            "tarikh_keluar": r.get("tarikh_keluar", ""),
            "tarikh_pulang": r.get("tarikh_pulang", ""),
            "destinasi": r.get("destinasi", ""),
            "sebab": r.get("remarks", ""),
            "pic_name": r.get("pic_name", ""),
            "pic_phone": r.get("pic_phone", ""),
            "status": r.get("status", "approved"),
            "created_at": r.get("created_at", ""),
        }
        for r in records
    ]


class KlinikUpdateRequest(BaseModel):
    tarikh_keluar: Optional[str] = None
    tarikh_pulang: Optional[str] = None
    destinasi: Optional[str] = None
    sebab: Optional[str] = None
    pic_name: Optional[str] = None
    pic_phone: Optional[str] = None


@router.put("/klinik/{request_id}")
async def update_klinik_request(
    request_id: str,
    body: KlinikUpdateRequest,
    current_user: dict = Depends(require_warden_admin()),
):
    """Warden boleh mengemaskini permohonan klinik/hospital."""
    db = get_db()
    record = await db.hostel_records.find_one({"_id": _id_value(request_id), "kategori": KLINIK_KATEGORI})
    if not record:
        raise HTTPException(status_code=404, detail="Permohonan tidak dijumpai")
    if not _warden_can_manage_klinik_record(current_user, record):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    updates = {}
    if body.tarikh_keluar is not None:
        updates["tarikh_keluar"] = body.tarikh_keluar
    if body.tarikh_pulang is not None:
        updates["tarikh_pulang"] = body.tarikh_pulang
    if body.destinasi is not None:
        updates["destinasi"] = body.destinasi
    if body.sebab is not None:
        updates["remarks"] = body.sebab
    if body.pic_name is not None:
        updates["pic_name"] = body.pic_name
    if body.pic_phone is not None:
        updates["pic_phone"] = body.pic_phone
    if not updates:
        return {"message": "Tiada perubahan"}
    await db.hostel_records.update_one({"_id": _id_value(request_id)}, {"$set": updates})
    await log_audit(current_user, "KLINIK_UPDATE", "hostel", f"Kemaskini permohonan klinik: {record.get('student_name')}")
    return {"message": "Permohonan dikemaskini"}


@router.delete("/klinik/{request_id}")
async def delete_klinik_request(
    request_id: str,
    current_user: dict = Depends(require_warden_admin()),
):
    """Warden boleh padam permohonan klinik/hospital."""
    db = get_db()
    record = await db.hostel_records.find_one({"_id": _id_value(request_id), "kategori": KLINIK_KATEGORI})
    if not record:
        raise HTTPException(status_code=404, detail="Permohonan tidak dijumpai")
    if not _warden_can_manage_klinik_record(current_user, record):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    await db.hostel_records.delete_one({"_id": _id_value(request_id)})
    await log_audit(current_user, "KLINIK_DELETE", "hostel", f"Padam permohonan klinik: {record.get('student_name')}")
    return {"message": "Permohonan telah dipadam"}


# ============ OUTING (Fasa 2) ============

class OutingRequest(BaseModel):
    student_id: Optional[str] = ""  # Wajib untuk parent; pelajar boleh kosong (auto-isikan)
    tarikh_keluar: str
    tarikh_pulang: str
    sebab: str
    destinasi: Optional[str] = None
    pic_name: str
    pic_phone: Optional[str] = None


@router.post("/outing/request")
async def request_outing(
    request: OutingRequest,
    current_user: dict = Depends(require_parent_pelajar()),
):
    """Permohonan outing (ibu bapa/pelajar). Pelajar under OLAT (3 jenis kesalahan) tidak dibenarkan outing sehingga tarikh tahanan."""
    db = get_db()
    student_id_str = request.student_id
    if current_user["role"] == "pelajar":
        my_student_id = await get_student_id_for_pelajar_user(db, current_user)
        if not my_student_id:
            raise HTTPException(status_code=403, detail="Rekod pelajar tidak dijumpai. Sila hubungi pentadbir.")
        if not student_id_str or str(student_id_str).strip() == "":
            student_id_str = str(my_student_id)
        elif str(my_student_id) != str(student_id_str):
            raise HTTPException(status_code=403, detail="Akses ditolak")
        blocked, reason, _ = await _olat_blocks_outing(db, my_student_id)
        if blocked:
            raise HTTPException(status_code=403, detail=reason)
    student = await fetch_live_student(db, student_id_str)
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    if current_user["role"] == "parent":
        if str(student.get("parent_id", "")) != str(current_user["_id"]):
            raise HTTPException(status_code=403, detail="Akses ditolak")
    student_id_obj = _id_value(student_id_str) if student_id_str else _id_value(student.get("_id"))
    if current_user["role"] == "parent":
        blocked, reason, _ = await _olat_blocks_outing(db, student_id_obj)
        if blocked:
            raise HTTPException(status_code=403, detail=reason)
    student_name = student.get("full_name", student.get("fullName", "Unknown"))
    record_doc = {
        "student_id": _id_value(student_id_str),
        "student_name": student_name,
        "student_matric": student.get("matric_number", student.get("matric", "")),
        "student_form": student.get("form", 0),
        "student_block": student.get("block_name", student.get("block", "")),
        "check_type": "permohonan",
        "tarikh_keluar": request.tarikh_keluar,
        "tarikh_pulang": request.tarikh_pulang,
        "pic_name": request.pic_name,
        "pic_phone": request.pic_phone,
        "kategori": "outing",
        "remarks": request.sebab,
        "destinasi": request.destinasi,
        "status": "pending",
        "requested_by": str(current_user["_id"]),
        "requested_by_role": current_user["role"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.hostel_records.insert_one(record_doc)
    block = student.get("block_name", student.get("block", ""))
    wardens = await db.users.find({
        "role": "warden",
        "$or": [{"assigned_block": block}, {"block_assigned": block}],
    }).to_list(10)
    for w in wardens:
        await db.notifications.insert_one({
            "user_id": w["_id"],
            "title": "Permohonan Outing",
            "message": f"{student_name} memohon outing {request.tarikh_keluar} - {request.tarikh_pulang}",
            "type": "action",
            "is_read": False,
            "link": "/hostel",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    await log_audit(current_user, "REQUEST_OUTING", "hostel", f"Mohon outing: {student_name}")
    return {"message": "Permohonan outing berjaya dihantar", "id": str(result.inserted_id)}


@router.post("/outing/request-by-warden")
async def request_outing_by_warden(
    request: OutingRequest,
    current_user: dict = Depends(require_warden_admin()),
):
    """Warden memohon outing bagi pihak pelajar. Pelajar dalam OLAT tetap disekat."""
    if not request.student_id or not str(request.student_id).strip():
        raise HTTPException(status_code=400, detail="Sila pilih pelajar")
    db = get_db()
    student_id_str = str(request.student_id).strip()
    student = await fetch_live_student(db, student_id_str)
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    block = current_user.get("assigned_block", current_user.get("block_assigned", ""))
    student_block = student.get("block_name", student.get("block", ""))
    if block and student_block and block != student_block:
        raise HTTPException(status_code=403, detail="Anda hanya boleh memohon bagi pelajar dalam blok anda")
    blocked, reason, _ = await _olat_blocks_outing(db, _id_value(student_id_str))
    if blocked:
        raise HTTPException(status_code=403, detail=reason)
    student_name = student.get("full_name", student.get("fullName", "Unknown"))
    record_doc = {
        "student_id": _id_value(student_id_str),
        "student_name": student_name,
        "student_matric": student.get("matric_number", student.get("matric", "")),
        "student_form": student.get("form", 0),
        "student_block": student_block,
        "check_type": "permohonan",
        "tarikh_keluar": request.tarikh_keluar,
        "tarikh_pulang": request.tarikh_pulang,
        "pic_name": request.pic_name,
        "pic_phone": request.pic_phone,
        "kategori": "outing",
        "remarks": request.sebab,
        "destinasi": request.destinasi,
        "status": "pending",
        "requested_by": str(current_user["_id"]),
        "requested_by_role": "warden",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.hostel_records.insert_one(record_doc)
    await log_audit(current_user, "REQUEST_OUTING_BY_WARDEN", "hostel", f"Warden mohon outing bagi {student_name}")
    return {"message": "Permohonan outing berjaya dihantar", "id": str(result.inserted_id)}


@router.get("/outing/requests")
async def get_outing_requests(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Senarai permohonan outing."""
    db = get_db()
    query = {"kategori": "outing"}
    if status:
        query["status"] = status
    if current_user["role"] == "parent":
        children = await db.students.find({"parent_id": current_user["_id"]}).to_list(100)
        query["student_id"] = {"$in": [c["_id"] for c in children]}
    elif current_user["role"] == "pelajar":
        my_student_id = await get_student_id_for_pelajar_user(db, current_user)
        if not my_student_id:
            return []
        query["student_id"] = my_student_id
    elif current_user["role"] == "warden":
        block = current_user.get("assigned_block", current_user.get("block_assigned", ""))
        if block:
            query["student_block"] = block
    records = await db.hostel_records.find(query).sort("created_at", -1).to_list(100)
    return [
        {
            "id": str(r["_id"]),
            "student_id": str(r["student_id"]),
            "student_name": r.get("student_name", ""),
            "tarikh_keluar": r.get("tarikh_keluar", ""),
            "tarikh_pulang": r.get("tarikh_pulang", ""),
            "sebab": r.get("remarks", ""),
            "destinasi": r.get("destinasi", ""),
            "pic_name": r.get("pic_name", ""),
            "status": r.get("status", "pending"),
            "requested_by_role": r.get("requested_by_role", ""),
            "created_at": r.get("created_at", ""),
        }
        for r in records
    ]


@router.post("/outing/{request_id}/approve")
async def approve_outing(request_id: str, current_user: dict = Depends(require_warden_admin())):
    """Lulus permohonan outing."""
    db = get_db()
    record = await db.hostel_records.find_one({"_id": _id_value(request_id), "kategori": "outing"})
    if not record:
        raise HTTPException(status_code=404, detail="Permohonan tidak dijumpai")
    if record.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Permohonan sudah diproses")
    await db.hostel_records.update_one(
        {"_id": _id_value(request_id)},
        {"$set": {
            "status": "approved",
            "approved_by": str(current_user["_id"]),
            "approved_by_name": current_user.get("full_name", ""),
            "approved_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    await append_movement_log(
        db,
        record["student_id"],
        record.get("student_name", "Unknown"),
        MOVEMENT_TYPE_OUTING,
        recorded_by=str(current_user["_id"]),
        expected_return=record.get("tarikh_pulang"),
        source_record_id=request_id,
        metadata={"status": "approved"},
    )
    requester_id = record.get("requested_by")
    if requester_id:
        await db.notifications.insert_one({
            "user_id": _id_value(requester_id),
            "title": "Kelulusan Outing",
            "message": f"Permohonan outing untuk {record.get('student_name', '')} telah DILULUSKAN.",
            "type": "success",
            "is_read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    await log_audit(current_user, "APPROVE_OUTING", "hostel", f"Lulus outing: {record.get('student_name', '')}")
    return {"message": "Permohonan outing diluluskan"}


@router.post("/outing/{request_id}/reject")
async def reject_outing(
    request_id: str,
    reason: str = "",
    current_user: dict = Depends(require_warden_admin()),
):
    """Tolak permohonan outing."""
    db = get_db()
    record = await db.hostel_records.find_one({"_id": _id_value(request_id), "kategori": "outing"})
    if not record:
        raise HTTPException(status_code=404, detail="Permohonan tidak dijumpai")
    if record.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Permohonan sudah diproses")
    await db.hostel_records.update_one(
        {"_id": _id_value(request_id)},
        {"$set": {
            "status": "rejected",
            "rejected_by": str(current_user["_id"]),
            "rejection_reason": reason,
            "rejected_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    requester_id = record.get("requested_by")
    if requester_id:
        await db.notifications.insert_one({
            "user_id": _id_value(requester_id),
            "title": "Permohonan Outing Ditolak",
            "message": f"Permohonan outing telah DITOLAK. {reason or ''}",
            "type": "warning",
            "is_read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    await log_audit(current_user, "REJECT_OUTING", "hostel", f"Tolak outing: {record.get('student_name', '')}")
    return {"message": "Permohonan outing ditolak"}


@router.get("/outing/calendar-counts")
async def get_outing_calendar_counts(
    bulan: int = Query(..., ge=1, le=12),
    tahun: int = Query(..., ge=2020, le=2030),
    current_user: dict = Depends(require_warden_admin()),
):
    """Bilangan pelajar keluar outing mengikut tarikh (untuk laporan kalendar). Approved sahaja."""
    import calendar as cal
    db = get_db()
    num_days = cal.monthrange(tahun, bulan)[1]
    start = f"{tahun}-{bulan:02d}-01"
    end = f"{tahun}-{bulan:02d}-{num_days:02d}"
    by_date = {}
    async for row in db.hostel_records.find(
        {
            "kategori": "outing",
            "status": "approved",
            "tarikh_keluar": {"$gte": start, "$lte": end},
        }
    ):
        date_key = row.get("tarikh_keluar")
        if not date_key:
            continue
        by_date[date_key] = by_date.get(date_key, 0) + 1
    return {"bulan": bulan, "tahun": tahun, "by_date": by_date}


# ============ QR KELUAR/MASUK (Fasa 2) ============

class QRScanRequest(BaseModel):
    student_id: str
    direction: str  # "out" | "in"


@router.post("/qr/scan")
async def qr_scan(
    body: QRScanRequest,
    current_user: dict = Depends(require_warden_admin()),
):
    """Daftar keluar/masuk pelajar melalui imbasan QR. Rekod terus ke movement_logs."""
    if body.direction not in ("out", "in"):
        raise HTTPException(status_code=400, detail="direction mesti 'out' atau 'in'")
    db = get_db()
    student = await fetch_live_student(db, body.student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    student_name = student.get("full_name", student.get("fullName", "Unknown"))
    now_iso = datetime.now(timezone.utc).isoformat()
    movement_type = MOVEMENT_TYPE_QR_OUT if body.direction == "out" else MOVEMENT_TYPE_QR_IN
    is_late = False
    if body.direction == "in":
        open_record = await db.hostel_records.find_one({
            "student_id": _id_value(body.student_id),
            "check_type": "keluar",
            "actual_return": {"$exists": False},
        }, sort=[("created_at", -1)])
        if open_record and open_record.get("tarikh_pulang"):
            try:
                expected_dt = datetime.fromisoformat(open_record["tarikh_pulang"].replace("Z", "+00:00"))
                is_late = datetime.now(timezone.utc) > expected_dt
            except Exception:
                pass
    await append_movement_log(
        db,
        _id_value(body.student_id),
        student_name,
        movement_type,
        recorded_by=str(current_user["_id"]),
        actual_return=now_iso if body.direction == "in" else None,
        expected_return=None,
        is_late_return=is_late,
        metadata={"source": "qr_scan"},
    )
    await log_audit(current_user, "QR_SCAN", "hostel", f"QR {body.direction}: {student_name}" + (" (lewat balik)" if is_late else ""))
    return {"message": f"QR {body.direction} berjaya", "is_late_return": is_late}


class GuardScanRequest(BaseModel):
    matric_number: str
    direction: str  # "out" | "in"
    reason: Optional[str] = None  # Alasan / catatan keluar masuk


@router.post("/guard/scan")
async def guard_scan(
    body: GuardScanRequest,
    current_user: dict = Depends(require_guard()),
):
    """
    Guard imbasan kad matrik pelajar keluar/masuk maktab (outing atau pulang bermalam).
    Rekod ke movement_logs dengan alasan dalam metadata.
    """
    if body.direction not in ("out", "in"):
        raise HTTPException(status_code=400, detail="direction mesti 'out' atau 'in'")
    db = get_db()
    student = await db.students.find_one({"matric_number": body.matric_number.strip()})
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai. Semak nombor matrik.")
    student_id = student["_id"]
    student_name = student.get("full_name", "Unknown")
    now_iso = datetime.now(timezone.utc).isoformat()
    movement_type = MOVEMENT_TYPE_QR_OUT if body.direction == "out" else MOVEMENT_TYPE_QR_IN
    is_late = False
    open_record = None
    if body.direction == "in":
        open_record = await db.hostel_records.find_one({
            "student_id": student_id,
            "status": "approved",
            "kategori": {"$in": HOSTEL_LEAVE_CATEGORIES},
            "actual_return": {"$exists": False},
        }, sort=[("created_at", -1)])
        if open_record and open_record.get("tarikh_pulang"):
            try:
                expected_dt = datetime.fromisoformat(open_record["tarikh_pulang"].replace("Z", "+00:00"))
                is_late = datetime.now(timezone.utc) > expected_dt
            except Exception:
                pass
        if open_record:
            await db.hostel_records.update_one(
                {"_id": open_record["_id"]},
                {"$set": {"actual_return": now_iso, "checkin_by": str(current_user["_id"])}},
            )
    expected_ret = open_record.get("tarikh_pulang") if open_record else None
    if body.direction == "out" and not open_record:
        open_record = await db.hostel_records.find_one({
            "student_id": student_id,
            "status": "approved",
            "kategori": {"$in": HOSTEL_LEAVE_CATEGORIES},
            "actual_return": {"$exists": False},
        }, sort=[("created_at", -1)])
    meta = {"source": "guard_scan", "reason": (body.reason or "").strip(), "matric_number": body.matric_number}
    if open_record:
        if open_record.get("cara_pulang"):
            meta["cara_pulang"] = open_record["cara_pulang"]
        if open_record.get("plate_number"):
            meta["plate_number"] = open_record["plate_number"]
        if open_record.get("transport_remarks"):
            meta["transport_remarks"] = open_record["transport_remarks"]
    await append_movement_log(
        db,
        student_id,
        student_name,
        movement_type,
        recorded_by=str(current_user["_id"]),
        actual_return=now_iso if body.direction == "in" else None,
        expected_return=expected_ret,
        is_late_return=is_late,
        metadata=meta,
    )
    await log_audit(current_user, "GUARD_SCAN", "hostel", f"Guard scan {body.direction}: {student_name}" + (f" ({body.reason})" if body.reason else ""))
    return {"message": f"Imbasan {body.direction} berjaya", "student_name": student_name, "is_late_return": is_late}


# ============ PULANG BERMALAM ROUTES ============

@router.post("/pulang-bermalam/request")
async def request_pulang_bermalam(
    request: PulangBermalamRequest,
    current_user: dict = Depends(require_parent_pelajar())
):
    """Request pulang bermalam (Parent or Student). Pelajar under OLAT (3 jenis kesalahan) tidak dibenarkan sehingga tarikh tahanan."""
    allowed_cara = (
        CARA_PULANG_IBU_BAPA, CARA_PULANG_BAS, CARA_PULANG_SAUDARA,
        CARA_PULANG_SAUDARA_MARA, CARA_PULANG_IBU_SAUDARA, CARA_PULANG_BAPA_SAUDARA, CARA_PULANG_ADIK_BERADIK,
        CARA_PULANG_KENALAN, CARA_PULANG_LAIN,
    )
    if request.cara_pulang and request.cara_pulang not in allowed_cara:
        raise HTTPException(status_code=400, detail="Nilai cara_pulang tidak sah")
    db = get_db()
    student_id_str = request.student_id
    if current_user["role"] == "pelajar":
        my_student_id = await get_student_id_for_pelajar_user(db, current_user)
        if not my_student_id:
            raise HTTPException(status_code=403, detail="Rekod pelajar tidak dijumpai. Sila hubungi pentadbir.")
        if not student_id_str or str(student_id_str).strip() == "":
            student_id_str = str(my_student_id)
        elif str(my_student_id) != str(student_id_str):
            raise HTTPException(status_code=403, detail="Akses ditolak")
        blocked, reason, _ = await _olat_blocks_outing(db, my_student_id)
        if blocked:
            raise HTTPException(status_code=403, detail=reason)
    student = await fetch_live_student(db, student_id_str)
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    if current_user["role"] == "parent":
        if str(student.get("parent_id", "")) != str(current_user["_id"]):
            raise HTTPException(status_code=403, detail="Akses ditolak")
        blocked, reason, _ = await _olat_blocks_outing(db, _id_value(student_id_str))
        if blocked:
            raise HTTPException(status_code=403, detail=reason)
    student_name = student.get("full_name", student.get("fullName", "Unknown"))
    existing = await db.hostel_records.find_one({
        "student_id": _id_value(student_id_str),
        "kategori": "pulang_bermalam",
        "tarikh_keluar": request.tarikh_keluar,
        "status": {"$in": ["pending", "approved"]}
    })
    if existing:
        raise HTTPException(status_code=400, detail="Sudah ada permohonan untuk tarikh ini")
    record_doc = {
        "student_id": _id_value(student_id_str),
        "student_name": student_name,
        "student_matric": student.get("matric_number", student.get("matric", "")),
        "student_form": student.get("form", 0),
        "student_block": student.get("block_name", student.get("block", "")),
        "student_room": student.get("room_number", student.get("room", "")),
        "check_type": "permohonan",
        "tarikh_keluar": request.tarikh_keluar,
        "tarikh_pulang": request.tarikh_pulang,
        "pic_name": request.pic_name,
        "pic_phone": request.pic_phone,
        "kategori": "pulang_bermalam",
        "remarks": request.sebab,
        "cara_pulang": request.cara_pulang or CARA_PULANG_IBU_BAPA,
        "plate_number": (request.plate_number or "").strip() or None,
        "transport_remarks": (request.transport_remarks or "").strip() or None,
        "status": "pending",
        "requested_by": str(current_user["_id"]),
        "requested_by_role": current_user["role"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.hostel_records.insert_one(record_doc)
    # Notify warden
    block = student.get("block_name", student.get("block", ""))
    wardens = await db.users.find({
        "role": "warden",
        "$or": [
            {"assigned_block": block},
            {"block_assigned": block}
        ]
    }).to_list(10)
    
    for warden in wardens:
        await db.notifications.insert_one({
            "user_id": warden["_id"],
            "title": "Permohonan Pulang Bermalam",
            "message": f"{student_name} memohon pulang bermalam dari {request.tarikh_keluar} hingga {request.tarikh_pulang}",
            "type": "action",
            "is_read": False,
            "link": "/hostel/pulang-bermalam",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    await log_audit(current_user, "REQUEST_PULANG_BERMALAM", "hostel", f"Mohon pulang bermalam untuk {student_name}")
    
    return {"message": "Permohonan pulang bermalam berjaya dihantar", "id": str(result.inserted_id)}


@router.get("/pulang-bermalam/requests")
async def get_pulang_bermalam_requests(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get pulang bermalam requests"""
    db = get_db()
    query = {"kategori": "pulang_bermalam"}
    
    if status:
        query["status"] = status
    
    if current_user["role"] == "parent":
        children = await db.students.find({"parent_id": current_user["_id"]}).to_list(100)
        children_ids = [c["_id"] for c in children]
        query["student_id"] = {"$in": children_ids}
    elif current_user["role"] == "pelajar":
        my_student_id = await get_student_id_for_pelajar_user(db, current_user)
        if not my_student_id:
            return []
        query["student_id"] = my_student_id
    elif current_user["role"] == "warden":
        block = current_user.get("assigned_block", current_user.get("block_assigned", ""))
        if block:
            query["student_block"] = block
    # Admin/superadmin see all
    
    records = await db.hostel_records.find(query).sort("created_at", -1).to_list(100)
    
    return [{
        "id": str(r["_id"]),
        "student_id": str(r["student_id"]),
        "student_name": r.get("student_name", ""),
        "student_matric": r.get("student_matric", ""),
        "student_form": r.get("student_form", 0),
        "student_block": r.get("student_block", ""),
        "student_room": r.get("student_room", ""),
        "tarikh_keluar": r.get("tarikh_keluar", ""),
        "tarikh_pulang": r.get("tarikh_pulang", ""),
        "pic_name": r.get("pic_name", ""),
        "pic_phone": r.get("pic_phone", ""),
        "sebab": r.get("remarks", ""),
        "cara_pulang": r.get("cara_pulang", ""),
        "plate_number": r.get("plate_number", ""),
        "transport_remarks": r.get("transport_remarks", ""),
        "status": r.get("status", "pending"),
        "requested_by_role": r.get("requested_by_role", ""),
        "approved_by": r.get("approved_by_name", ""),
        "approved_at": r.get("approved_at", ""),
        "rejection_reason": r.get("rejection_reason", ""),
        "created_at": r.get("created_at", "")
    } for r in records]


# ============ PBW/PBP PERIODS (Jadual Pulang Bermalam Wajib/Pilihan) ============
# Berkait dengan pekeliling maktab; warden tetapkan tarikh ikut jadual asrama.

def _serialize_pbw_pbp(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "type": doc.get("type", ""),
        "label": doc.get("label", ""),
        "start_date": doc.get("start_date", ""),
        "end_date": doc.get("end_date", ""),
        "description": doc.get("description", ""),
        "created_at": doc.get("created_at", ""),
        "updated_at": doc.get("updated_at", ""),
    }


@router.get("/pbw-pbp-periods")
async def get_pbw_pbp_periods(
    year: Optional[int] = Query(None, description="Tahun (contoh 2026)"),
    type_filter: Optional[str] = Query(None, alias="type", description="pbw atau pbp"),
):
    """Senarai tempoh PBW/PBP. Awam untuk ibu bapa/pelajar (rujuk semasa isi borang permohonan)."""
    db = get_db()
    query = {}
    if year:
        query["$or"] = [
            {"start_date": {"$regex": f"^{year}-"}},
            {"end_date": {"$regex": f"^{year}-"}},
        ]
    if type_filter and type_filter in (PBW_PBP_TYPE_PBW, PBW_PBP_TYPE_PBP):
        query["type"] = type_filter
    cursor = db.hostel_pbw_pbp_periods.find(query).sort("start_date", 1)
    items = await cursor.to_list(100)
    return [_serialize_pbw_pbp(d) for d in items]


@router.get("/pbw-pbp-periods/check")
async def check_pbw_pbp_for_date(
    date_str: str = Query(..., description="Tarikh YYYY-MM-DD"),
):
    """Semak sama ada satu tarikh jatuh dalam mana-mana tempoh PBW/PBP. Untuk paparan pada borang permohonan."""
    db = get_db()
    # Normalise to date only (no time)
    if "T" in date_str:
        date_str = date_str.split("T")[0]
    cursor = db.hostel_pbw_pbp_periods.find({
        "start_date": {"$lte": date_str},
        "end_date": {"$gte": date_str},
    }).sort("start_date", 1)
    periods = await cursor.to_list(10)
    return {
        "date": date_str,
        "periods": [_serialize_pbw_pbp(p) for p in periods],
    }


@router.post("/pbw-pbp-periods")
async def create_pbw_pbp_period(
    body: PbwPbpPeriodCreate,
    current_user: dict = Depends(require_warden_admin()),
):
    """Warden/Admin: tambah tempoh PBW atau PBP (ikut pekeliling/jadual asrama)."""
    if body.type not in (PBW_PBP_TYPE_PBW, PBW_PBP_TYPE_PBP):
        raise HTTPException(status_code=400, detail="type mesti pbw atau pbp")
    if body.start_date > body.end_date:
        raise HTTPException(status_code=400, detail="start_date tidak boleh lewat daripada end_date")
    db = get_db()
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "type": body.type,
        "label": body.label.strip(),
        "start_date": body.start_date,
        "end_date": body.end_date,
        "description": (body.description or "").strip() or None,
        "created_at": now_iso,
        "updated_at": now_iso,
        "created_by": str(current_user["_id"]),
    }
    result = await db.hostel_pbw_pbp_periods.insert_one(doc)
    await log_audit(current_user, "CREATE_PBW_PBP_PERIOD", "hostel", f"{body.type.upper()} {body.label} {body.start_date}–{body.end_date}")
    return {"message": "Tempoh PBW/PBP berjaya ditambah", **_serialize_pbw_pbp({**doc, "_id": result.inserted_id})}


@router.put("/pbw-pbp-periods/{period_id}")
async def update_pbw_pbp_period(
    period_id: str,
    body: PbwPbpPeriodUpdate,
    current_user: dict = Depends(require_warden_admin()),
):
    """Warden/Admin: kemaskini tempoh PBW/PBP."""
    try:
        oid = _id_value(period_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID tidak sah")
    db = get_db()
    doc = await db.hostel_pbw_pbp_periods.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Tempoh tidak dijumpai")
    updates = {}
    if body.type is not None:
        if body.type not in (PBW_PBP_TYPE_PBW, PBW_PBP_TYPE_PBP):
            raise HTTPException(status_code=400, detail="type mesti pbw atau pbp")
        updates["type"] = body.type
    if body.label is not None:
        updates["label"] = body.label.strip()
    if body.start_date is not None:
        updates["start_date"] = body.start_date
    if body.end_date is not None:
        updates["end_date"] = body.end_date
    if body.description is not None:
        updates["description"] = (body.description or "").strip() or None
    if updates:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.hostel_pbw_pbp_periods.update_one({"_id": oid}, {"$set": updates})
    await log_audit(current_user, "UPDATE_PBW_PBP_PERIOD", "hostel", f"period_id={period_id}")
    return {"message": "Tempoh dikemaskini", **_serialize_pbw_pbp(await db.hostel_pbw_pbp_periods.find_one({"_id": oid}))}


@router.delete("/pbw-pbp-periods/{period_id}")
async def delete_pbw_pbp_period(
    period_id: str,
    current_user: dict = Depends(require_warden_admin()),
):
    """Warden/Admin: padam tempoh PBW/PBP."""
    try:
        oid = _id_value(period_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID tidak sah")
    db = get_db()
    result = await db.hostel_pbw_pbp_periods.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Tempoh tidak dijumpai")
    await log_audit(current_user, "DELETE_PBW_PBP_PERIOD", "hostel", f"period_id={period_id}")
    return {"message": "Tempoh dipadam"}


def _warden_can_approve_record(current_user: dict, record: dict) -> bool:
    """Warden hanya boleh lulus rekod dalam blok mereka."""
    if current_user.get("role") != "warden":
        return True
    warden_block = current_user.get("assigned_block") or current_user.get("block_assigned") or ""
    record_block = record.get("student_block", "")
    return warden_block and record_block == warden_block


@router.post("/pulang-bermalam/{request_id}/approve")
async def approve_pulang_bermalam(
    request_id: str,
    current_user: dict = Depends(require_warden_admin())
):
    """Approve pulang bermalam request"""
    db = get_db()
    record = await db.hostel_records.find_one({"_id": _id_value(request_id)})
    if not record:
        raise HTTPException(status_code=404, detail="Permohonan tidak dijumpai")
    if not _warden_can_approve_record(current_user, record):
        raise HTTPException(status_code=403, detail="Anda hanya boleh meluluskan permohonan dalam blok anda")
    if record.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Permohonan ini sudah diproses")
    
    await db.hostel_records.update_one(
        {"_id": _id_value(request_id)},
        {"$set": {
            "status": "approved",
            "approved_by": str(current_user["_id"]),
            "approved_by_name": current_user.get("full_name", ""),
            "approved_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    requester_id = record.get("requested_by")
    if requester_id:
        await db.notifications.insert_one({
            "user_id": _id_value(requester_id),
            "title": "Kelulusan Pulang Bermalam",
            "message": f"Permohonan pulang bermalam untuk {record.get('student_name', '')} dari {record.get('tarikh_keluar', '')} hingga {record.get('tarikh_pulang', '')} telah DILULUSKAN.",
            "type": "success",
            "is_read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    await log_audit(current_user, "APPROVE_PULANG_BERMALAM", "hostel", f"Luluskan pulang bermalam: {record.get('student_name', '')}")
    
    return {"message": "Permohonan pulang bermalam diluluskan"}


class PulangBermalamBulkApproveRequest(BaseModel):
    request_ids: list[str]


@router.post("/pulang-bermalam/bulk-approve")
async def bulk_approve_pulang_bermalam(
    body: PulangBermalamBulkApproveRequest,
    current_user: dict = Depends(require_warden_admin())
):
    """Lulus permohonan pulang bermalam secara serentak (mengikut blok). Untuk senario WAJIB Pulang."""
    if not body.request_ids:
        return {"message": "Tiada permohonan dipilih", "approved_count": 0}
    db = get_db()
    approved = 0
    for rid in body.request_ids:
        try:
            oid = _id_value(rid)
        except Exception:
            continue
        record = await db.hostel_records.find_one({"_id": oid, "kategori": "pulang_bermalam"})
        if not record or record.get("status") != "pending":
            continue
        if not _warden_can_approve_record(current_user, record):
            continue
        await db.hostel_records.update_one(
            {"_id": oid},
            {"$set": {
                "status": "approved",
                "approved_by": str(current_user["_id"]),
                "approved_by_name": current_user.get("full_name", ""),
                "approved_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        requester_id = record.get("requested_by")
        if requester_id:
            await db.notifications.insert_one({
                "user_id": _id_value(requester_id),
                "title": "Kelulusan Pulang Bermalam",
                "message": f"Permohonan pulang bermalam untuk {record.get('student_name', '')} dari {record.get('tarikh_keluar', '')} hingga {record.get('tarikh_pulang', '')} telah DILULUSKAN.",
                "type": "success",
                "is_read": False,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
        approved += 1
        await log_audit(current_user, "APPROVE_PULANG_BERMALAM", "hostel", f"Luluskan pulang bermalam: {record.get('student_name', '')}")
    return {"message": f"{approved} permohonan diluluskan", "approved_count": approved}


@router.post("/pulang-bermalam/{request_id}/reject")
async def reject_pulang_bermalam(
    request_id: str,
    reason: str = "",
    current_user: dict = Depends(require_warden_admin())
):
    """Reject pulang bermalam request"""
    db = get_db()
    record = await db.hostel_records.find_one({"_id": _id_value(request_id)})
    if not record:
        raise HTTPException(status_code=404, detail="Permohonan tidak dijumpai")
    
    if record.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Permohonan ini sudah diproses")
    
    await db.hostel_records.update_one(
        {"_id": _id_value(request_id)},
        {"$set": {
            "status": "rejected",
            "rejected_by": str(current_user["_id"]),
            "rejected_by_name": current_user.get("full_name", ""),
            "rejection_reason": reason,
            "rejected_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Notify requester
    requester_id = record.get("requested_by")
    if requester_id:
        await db.notifications.insert_one({
            "user_id": _id_value(requester_id),
            "title": "Permohonan Pulang Bermalam Ditolak",
            "message": f"Permohonan pulang bermalam untuk {record.get('student_name', '')} telah DITOLAK. Sebab: {reason or 'Tidak dinyatakan'}",
            "type": "warning",
            "is_read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    await log_audit(current_user, "REJECT_PULANG_BERMALAM", "hostel", f"Tolak pulang bermalam: {record.get('student_name', '')}")
    
    return {"message": "Permohonan pulang bermalam ditolak"}


@router.get("/pulang-bermalam/stats")
async def get_pulang_bermalam_stats(
    current_user: dict = Depends(require_warden_admin())
):
    """Get pulang bermalam statistics (untuk status kelulusan di dashboard warden)."""
    db = get_db()
    query = {"kategori": "pulang_bermalam"}
    
    if current_user["role"] == "warden":
        block = current_user.get("assigned_block", current_user.get("block_assigned", ""))
        if block:
            query["student_block"] = block
    
    pending = await db.hostel_records.count_documents({**query, "status": "pending"})
    approved = await db.hostel_records.count_documents({**query, "status": "approved"})
    rejected = await db.hostel_records.count_documents({**query, "status": "rejected"})
    
    return {
        "pending": pending,
        "approved": approved,
        "rejected": rejected,
        "total": pending + approved + rejected,
        "kelulusan_selesai": pending == 0 and (approved + rejected) > 0,
    }


@router.get("/presence-report")
async def get_presence_report(
    date_from: Optional[str] = Query(None, description="Tarikh mula (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Tarikh akhir (YYYY-MM-DD)"),
    current_user: dict = Depends(require_warden_admin()),
):
    """
    Laporan lengkap keberadaan pelajar: pulang bermalam vs berada di maktab.
    Untuk laporan dewan makan — senarai pelajar yang tidak pulang (berada di maktab).
    """
    db = get_db()
    block = current_user.get("assigned_block", current_user.get("block_assigned", ""))
    if current_user["role"] == "warden" and not block:
        return {
            "date_from": date_from,
            "date_to": date_to,
            "block": "",
            "pelajar_pulang_bermalam": [],
            "pelajar_berada_di_maktab": [],
            "summary": {"total_pulang": 0, "total_di_maktab": 0},
        }

    # Default: hujung minggu ini (Jumaat–Ahad)
    today = datetime.now(timezone.utc).date()
    if not date_from:
        # Jumaat minggu ini
        friday = today
        while friday.weekday() != 4:
            friday -= timedelta(days=1)
        date_from = friday.strftime("%Y-%m-%d")
    if not date_to:
        # Ahad minggu ini
        sunday = today
        while sunday.weekday() != 6:
            sunday += timedelta(days=1)
        date_to = sunday.strftime("%Y-%m-%d")

    # Semua pelajar dalam blok (students + users)
    students_in_block = await db.students.find({"block_name": block}).to_list(1000)
    users_in_block = await db.users.find({"block": block, "role": "pelajar"}).to_list(1000)
    seen_ids = set()
    all_students = []
    for s in students_in_block:
        sid = s["_id"]
        if sid not in seen_ids:
            seen_ids.add(sid)
            all_students.append({
                "student_id": str(sid),
                "name": s.get("full_name", s.get("fullName", "")),
                "matric": s.get("matric_number", s.get("matric", "")),
                "form": s.get("form", 0),
                "room": s.get("room_number", s.get("room", "")),
            })
    for u in users_in_block:
        sid = u["_id"]
        if sid not in seen_ids:
            seen_ids.add(sid)
            all_students.append({
                "student_id": str(sid),
                "name": u.get("full_name", u.get("fullName", "")),
                "matric": u.get("matric_number", u.get("matric", "")),
                "form": u.get("form", 0),
                "room": u.get("room_number", u.get("room", "")),
            })

    # Permohonan pulang bermalam diluluskan yang bertindan dengan tempoh
    date_to_iso = f"{date_to}T23:59:59.999Z"
    date_from_iso = f"{date_from}T00:00:00.000Z"
    cursor = db.hostel_records.find({
        "kategori": "pulang_bermalam",
        "status": "approved",
        "student_block": block,
        "tarikh_keluar": {"$lte": date_to_iso},
        "tarikh_pulang": {"$gte": date_from_iso},
    })
    overlapping = await cursor.to_list(500)
    # Normalise overlap: record keluar <= date_to AND pulang >= date_from
    pulang_ids = set()
    pulang_details = []
    for r in overlapping:
        try:
            keluar = r.get("tarikh_keluar", "") or ""
            pulang = r.get("tarikh_pulang", "") or ""
            if keluar <= date_to_iso and pulang >= date_from_iso:
                sid = r["student_id"]
                pulang_ids.add(str(sid))
                pulang_details.append({
                    "student_id": str(sid),
                    "student_name": r.get("student_name", ""),
                    "student_matric": r.get("student_matric", ""),
                    "student_room": r.get("student_room", ""),
                    "tarikh_keluar": keluar,
                    "tarikh_pulang": pulang,
                    "pic_name": r.get("pic_name", ""),
                    "cara_pulang": r.get("cara_pulang", ""),
                    "plate_number": r.get("plate_number", ""),
                })
        except Exception:
            continue

    # Deduplicate pulang by student_id (keep one record per student)
    by_student = {d["student_id"]: d for d in pulang_details}
    pelajar_pulang_bermalam = list(by_student.values())

    # Berada di maktab = dalam blok tetapi tidak dalam senarai pulang
    pelajar_berada_di_maktab = [
        s for s in all_students
        if s["student_id"] not in pulang_ids
    ]

    return {
        "date_from": date_from,
        "date_to": date_to,
        "block": block,
        "pelajar_pulang_bermalam": pelajar_pulang_bermalam,
        "pelajar_berada_di_maktab": pelajar_berada_di_maktab,
        "summary": {
            "total_pulang": len(pelajar_pulang_bermalam),
            "total_di_maktab": len(pelajar_berada_di_maktab),
            "total_pelajar": len(all_students),
        },
    }
