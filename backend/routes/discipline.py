"""
Modul Disiplin & OLAT (RASMI MRSM) - Fasa 3
Log kesalahan ikut seksyen rasmi, sync ke profil pelajar, trigger OLAT dalam DB.
Semua data dari MongoDB; dipaparkan di dashboard & parent portal.
"""
from datetime import datetime, timezone
from typing import Any, Optional, List, Callable
from bson import ObjectId
from services.id_normalizer import object_id_or_none

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/discipline", tags=["Discipline"])
security = HTTPBearer(auto_error=False)

_get_db_func: Callable = None
_get_current_user_func: Callable = None
_log_audit_func: Callable = None


def init_router(get_db_func, auth_func, audit_func):
    global _get_db_func, _get_current_user_func, _log_audit_func
    _get_db_func = get_db_func
    _get_current_user_func = auth_func
    _log_audit_func = audit_func


def get_db():
    return _get_db_func()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Token diperlukan")
    return await _get_current_user_func(credentials)


async def log_audit(user, action, module, details):
    if _log_audit_func and user:
        await _log_audit_func(user, action, module, details)


def _id_value(value: Any, *, strict: bool = False) -> Any:
    """Normalize ID-like inputs while supporting non-ObjectId IDs."""
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return value
    text = str(value).strip()
    try:
        if ObjectId.is_valid(text):
            return object_id_or_none(text)
    except Exception:
        pass
    if strict:
        raise ValueError("Invalid ObjectId")
    return text


def require_warden_admin():
    async def _dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
        user = await get_current_user(credentials)
        if user.get("role") not in ("warden", "admin", "superadmin"):
            raise HTTPException(status_code=403, detail="Akses ditolak")
        return user
    return _dep


# Seksyen rasmi kesalahan disiplin (default untuk seed; warden boleh edit/tambah/padam dalam ketetapan)
SEKSYEN_OFFENCE_DEFAULTS = [
    {"code": "3_1_am", "label": "Peraturan Am / Tatatertib Umum", "order": 1},
    {"code": "3_2_sopan", "label": "Kurang Sopan Santun", "order": 2},
    {"code": "3_3_ponteng", "label": "Ponteng / Tidak Hadir Tanpa Kebenaran", "order": 3},
    {"code": "3_4_rosak", "label": "Kerosakan Harta / Kemudahan", "order": 4},
    {"code": "3_5_keselamatan", "label": "Keselamatan & Disiplin Keselamatan", "order": 5},
    {"code": "3_6_berat", "label": "Kesalahan Berat", "order": 6},
    {"code": "3_7_lain", "label": "Lain-lain Kesalahan", "order": 7},
]

OFFENCE_STATUS_PENDING = "pending"
OFFENCE_STATUS_SIASATAN = "dalam_siasatan"
OFFENCE_STATUS_OLAT = "dirujuk_olat"
OFFENCE_STATUS_SELESAI = "selesai"

OLAT_STATUS_OPEN = "open"
OLAT_STATUS_IN_PROGRESS = "in_progress"
OLAT_STATUS_CLOSED = "closed"


class OffenceCreate(BaseModel):
    student_id: str
    seksyen: str = Field(..., description="Kod seksyen rasmi e.g. 3_1_am")
    keterangan: str = Field(..., min_length=5, max_length=2000)
    tarikh_kesalahan: str
    tempat: Optional[str] = None
    dilaporkan_oleh_nama: Optional[str] = None
    rujuk_olat: bool = False


class OffenceUpdate(BaseModel):
    status: Optional[str] = None
    keterangan_tindakan: Optional[str] = None


class SectionCreate(BaseModel):
    code: str = Field(..., min_length=2, max_length=80)
    label: str = Field(..., min_length=2, max_length=200)


class SectionUpdate(BaseModel):
    code: Optional[str] = Field(None, min_length=2, max_length=80)
    label: Optional[str] = Field(None, min_length=2, max_length=200)


class OLATCaseCreate(BaseModel):
    offence_id: str
    catatan: Optional[str] = None


class OLATManualCreate(BaseModel):
    """Tambah pelajar ke OLAT (kena OLAT) dengan tarikh maksima tahanan tidak boleh outing."""
    student_id: str
    detention_end_date: str  # YYYY-MM-DD
    catatan: Optional[str] = None
    category_ids: Optional[list[str]] = None  # ID kategori OLAT yang dipilih warden


class OLATCaseUpdate(BaseModel):
    status: Optional[str] = None
    outcome: Optional[str] = None
    catatan: Optional[str] = None
    detention_end_date: Optional[str] = None  # Tarikh tamat tahanan (YYYY-MM-DD); sehingga tarikh ini pelajar tidak dibenarkan outing


# Kategori OLAT (boleh banyak; disimpan dalam DB; warden boleh tambah/edit/padam)
# Kategori ini menentukan kesalahan yang menyebabkan pelajar tersenarai dalam OLAT
OLAT_CATEGORY_DEFAULTS = [
    {"keyword": "belum pulang", "label": "Belum pulang ke asrama / tanpa sebab", "order": 1},
    {"keyword": "tidak imbas kad", "label": "Tidak mengimbas kad matriks keluar dan masuk", "order": 2},
    {"keyword": "tertinggal kad", "label": "Tertinggal kad matriks", "order": 3},
]


class OLATCategoryCreate(BaseModel):
    keyword: str = Field(..., min_length=2, max_length=200)
    label: str = Field(..., min_length=2, max_length=200)


class OLATCategoryUpdate(BaseModel):
    keyword: Optional[str] = Field(None, min_length=2, max_length=200)
    label: Optional[str] = Field(None, min_length=2, max_length=200)


async def _ensure_offence_sections_seeded(db):
    """Seed default seksyen kesalahan jika koleksi kosong."""
    n = await db.offence_sections.count_documents({})
    if n > 0:
        return
    now_iso = datetime.now(timezone.utc).isoformat()
    for d in SEKSYEN_OFFENCE_DEFAULTS:
        await db.offence_sections.insert_one({
            "code": d["code"].strip(),
            "label": d["label"].strip(),
            "order": d.get("order", 99),
            "created_at": now_iso,
            "updated_at": now_iso,
        })


async def _ensure_olat_categories_seeded(db):
    """Seed default 3 kategori OLAT jika koleksi kosong."""
    n = await db.olat_categories.count_documents({})
    if n > 0:
        return
    now_iso = datetime.now(timezone.utc).isoformat()
    for i, d in enumerate(OLAT_CATEGORY_DEFAULTS, start=1):
        await db.olat_categories.insert_one({
            "keyword": d["keyword"].strip().lower(),
            "label": d["label"],
            "order": d.get("order", i),
            "created_at": now_iso,
            "updated_at": now_iso,
        })


async def _get_student(db, student_id: str):
    from services.hostel_data_sync import fetch_live_student
    return await fetch_live_student(db, student_id)


async def _notify_parent_student_event(db, student_id, title: str, message: str, notif_type: str = "info"):
    from services.hostel_data_sync import get_parent_id_for_student, notify_parent
    parent_id = await get_parent_id_for_student(db, student_id)
    await notify_parent(db, parent_id, title, message, notif_type, link="/children")


def _serialize_offence(r: dict, sections_map: Optional[dict] = None) -> dict:
    code = r.get("seksyen", "")
    if sections_map is not None:
        seksyen_display = sections_map.get(code, code or "—")
    else:
        seksyen_display = r.get("seksyen_display") or code or "—"
    return {
        "id": str(r["_id"]),
        "student_id": str(r["student_id"]),
        "student_name": r.get("student_name", ""),
        "student_matric": r.get("student_matric", ""),
        "seksyen": code,
        "seksyen_display": seksyen_display,
        "keterangan": r.get("keterangan", ""),
        "tarikh_kesalahan": r.get("tarikh_kesalahan", ""),
        "tempat": r.get("tempat"),
        "status": r.get("status", OFFENCE_STATUS_PENDING),
        "olat_case_id": r.get("olat_case_id"),
        "dilaporkan_oleh": r.get("dilaporkan_oleh"),
        "dilaporkan_oleh_nama": r.get("dilaporkan_oleh_nama"),
        "created_at": r.get("created_at", ""),
        "updated_at": r.get("updated_at", ""),
    }


def _parse_category_ids(category_ids: Optional[list]) -> Optional[list]:
    """Convert list of category id strings to ObjectIds; skip invalid. Returns None if empty."""
    if not category_ids:
        return None
    out = []
    for cid in category_ids:
        if not cid:
            continue
        try:
            out.append(_id_value(cid, strict=True))
        except Exception:
            pass
    return out if out else None


def _serialize_olat(o: dict) -> dict:
    offence_id = o.get("offence_id")
    cat_ids = o.get("category_ids") or []
    return {
        "id": str(o["_id"]),
        "case_number": o.get("case_number", ""),
        "student_id": str(o["student_id"]),
        "student_name": o.get("student_name", ""),
        "student_matric": o.get("student_matric", ""),
        "offence_id": str(offence_id) if offence_id else None,
        "is_manual": offence_id is None,
        "status": o.get("status", OLAT_STATUS_OPEN),
        "outcome": o.get("outcome"),
        "catatan": o.get("catatan"),
        "opened_at": o.get("opened_at", ""),
        "closed_at": o.get("closed_at"),
        "detention_end_date": o.get("detention_end_date"),
        "category_ids": [str(c) for c in cat_ids],
        "created_at": o.get("created_at", ""),
    }


# --------------- OFFENCES ---------------

async def _get_sections_map(db) -> dict:
    """Return dict code -> label for offence sections (untuk paparan)."""
    await _ensure_offence_sections_seeded(db)
    rows = await db.offence_sections.find({}).sort("order", 1).to_list(500)
    return {r["code"]: r.get("label", r["code"]) for r in rows}


@router.get("/offences/sections")
async def get_offence_sections():
    """Senarai seksyen rasmi kesalahan disiplin (dari DB; warden boleh edit dalam Ketetapan Seksyen)."""
    db = get_db()
    await _ensure_offence_sections_seeded(db)
    rows = await db.offence_sections.find({}).sort("order", 1).to_list(500)
    return {
        "sections": [
            {"id": str(r["_id"]), "code": r["code"], "label": r.get("label", r["code"]), "order": r.get("order", 99)}
            for r in rows
        ]
    }


@router.post("/offences/sections")
async def create_offence_section(
    body: SectionCreate,
    current_user: dict = Depends(require_warden_admin()),
):
    """Tambah seksyen rasmi (ketetapan warden)."""
    db = get_db()
    await _ensure_offence_sections_seeded(db)
    code = body.code.strip()
    existing = await db.offence_sections.find_one({"code": code})
    if existing:
        raise HTTPException(status_code=400, detail="Kod seksyen sudah wujud")
    max_order = await db.offence_sections.find({}).sort("order", -1).limit(1).to_list(1)
    order = (max_order[0]["order"] + 1) if max_order else 1
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "code": code,
        "label": body.label.strip(),
        "order": order,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    result = await db.offence_sections.insert_one(doc)
    await log_audit(current_user, "CREATE_OFFENCE_SECTION", "discipline", f"Seksyen: {code} - {body.label}")
    return {"message": "Seksyen ditambah", "id": str(result.inserted_id)}


@router.put("/offences/sections/{section_id}")
async def update_offence_section(
    section_id: str,
    body: SectionUpdate,
    current_user: dict = Depends(require_warden_admin()),
):
    """Kemaskini seksyen rasmi."""
    db = get_db()
    try:
        oid = _id_value(section_id, strict=True)
    except Exception:
        raise HTTPException(status_code=400, detail="ID tidak sah")
    section = await db.offence_sections.find_one({"_id": oid})
    if not section:
        raise HTTPException(status_code=404, detail="Seksyen tidak dijumpai")
    updates = {}
    if body.code is not None:
        code = body.code.strip()
        if code != section.get("code"):
            other = await db.offence_sections.find_one({"code": code})
            if other:
                raise HTTPException(status_code=400, detail="Kod seksyen sudah wujud")
            updates["code"] = code
    if body.label is not None:
        updates["label"] = body.label.strip()
    if updates:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.offence_sections.update_one({"_id": oid}, {"$set": updates})
    await log_audit(current_user, "UPDATE_OFFENCE_SECTION", "discipline", f"Seksyen id={section_id}")
    return {"message": "Seksyen dikemaskini"}


@router.delete("/offences/sections/{section_id}")
async def delete_offence_section(
    section_id: str,
    current_user: dict = Depends(require_warden_admin()),
):
    """Padam seksyen rasmi (hanya jika tiada kesalahan guna seksyen ini)."""
    db = get_db()
    try:
        oid = _id_value(section_id, strict=True)
    except Exception:
        raise HTTPException(status_code=400, detail="ID tidak sah")
    section = await db.offence_sections.find_one({"_id": oid})
    if not section:
        raise HTTPException(status_code=404, detail="Seksyen tidak dijumpai")
    code = section.get("code", "")
    in_use = await db.offences.count_documents({"seksyen": code})
    if in_use > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Seksyen ini digunakan oleh {in_use} rekod kesalahan. Tidak boleh dipadam.",
        )
    await db.offence_sections.delete_one({"_id": oid})
    await log_audit(current_user, "DELETE_OFFENCE_SECTION", "discipline", f"Seksyen: {code}")
    return {"message": "Seksyen dipadam"}


@router.post("/offences")
async def create_offence(
    body: OffenceCreate,
    current_user: dict = Depends(require_warden_admin()),
):
    """Log kesalahan disiplin. Sync ke profil pelajar; boleh trigger OLAT."""
    db = get_db()
    sections_map = await _get_sections_map(db)
    if body.seksyen not in sections_map:
        raise HTTPException(status_code=400, detail="Seksyen tidak sah")
    student = await _get_student(db, body.student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    student_name = student.get("full_name", student.get("fullName", "Unknown"))
    student_matric = student.get("matric_number", student.get("matric", ""))
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "student_id": _id_value(body.student_id),
        "student_name": student_name,
        "student_matric": student_matric,
        "seksyen": body.seksyen,
        "keterangan": body.keterangan,
        "tarikh_kesalahan": body.tarikh_kesalahan,
        "tempat": body.tempat,
        "status": OFFENCE_STATUS_PENDING,
        "dilaporkan_oleh": str(current_user["_id"]),
        "dilaporkan_oleh_nama": body.dilaporkan_oleh_nama or current_user.get("full_name", ""),
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    result = await db.offences.insert_one(doc)
    offence_id = str(result.inserted_id)
    # Sync to student profile: increment total_offences, set last_offence_at (students or users)
    await db.students.update_one(
        {"$or": [{"_id": _id_value(body.student_id)}, {"user_id": _id_value(body.student_id)}]},
        {
            "$inc": {"total_offences": 1},
            "$set": {"last_offence_at": now_iso, "updated_at": now_iso},
        },
    )
    await db.users.update_one(
        {"_id": _id_value(body.student_id), "role": "pelajar"},
        {
            "$inc": {"total_offences": 1},
            "$set": {"last_offence_at": now_iso},
        },
    )
    if body.rujuk_olat:
        case_number = f"OLAT-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{str(result.inserted_id)[:6].upper()}"
        olat_doc = {
            "case_number": case_number,
            "offence_id": result.inserted_id,
            "student_id": _id_value(body.student_id),
            "student_name": student_name,
            "student_matric": student_matric,
            "status": OLAT_STATUS_OPEN,
            "opened_at": now_iso,
            "created_at": now_iso,
        }
        olat_res = await db.olat_cases.insert_one(olat_doc)
        await db.offences.update_one(
            {"_id": result.inserted_id},
            {"$set": {"status": OFFENCE_STATUS_OLAT, "olat_case_id": str(olat_res.inserted_id), "updated_at": now_iso}},
        )
        await _notify_parent_student_event(
            db, body.student_id,
            "Kes OLAT Dibuka",
            f"Kes OLAT {case_number} telah dibuka untuk {student_name}. Sila hubungi pihak maktab untuk maklumat lanjut.",
            "warning",
        )
        await log_audit(current_user, "CREATE_OLAT_FROM_OFFENCE", "discipline", f"OLAT {case_number} untuk {student_name}")
    await log_audit(current_user, "CREATE_OFFENCE", "discipline", f"Kesalahan: {student_name} - {body.seksyen}")
    seksyen_label = sections_map.get(body.seksyen, body.seksyen)
    await _notify_parent_student_event(
        db, body.student_id,
        "Rekod Disiplin",
        f"Rekod kesalahan disiplin untuk {student_name} telah didaftarkan. Seksyen: {seksyen_label}.",
        "warning",
    )
    return {"message": "Rekod kesalahan disimpan", "id": offence_id, "olat_triggered": body.rujuk_olat}


@router.get("/offences")
async def list_offences(
    student_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(100, le=500),
    current_user: dict = Depends(require_warden_admin()),
):
    """Senarai kesalahan disiplin (live dari MongoDB)."""
    db = get_db()
    query = {}
    if student_id:
        query["student_id"] = _id_value(student_id)
    if status:
        query["status"] = status
    if current_user.get("role") == "warden":
        block = current_user.get("assigned_block", current_user.get("block_assigned", ""))
        if block:
            users_in = await db.users.find({"block": block, "role": "pelajar"}).to_list(1000)
            students_in = await db.students.find({"block_name": block}).to_list(1000)
            ids = [s["_id"] for s in users_in] + [s["_id"] for s in students_in]
            if ids:
                query["student_id"] = {"$in": ids}
    rows = await db.offences.find(query).sort("created_at", -1).limit(limit).to_list(limit)
    sections_map = await _get_sections_map(db)
    return [_serialize_offence(r, sections_map) for r in rows]


@router.get("/offences/student/{student_id}")
async def get_offences_by_student(
    student_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Kesalahan untuk satu pelajar (untuk dashboard/parent portal). Parent hanya anak sendiri."""
    db = get_db()
    if current_user.get("role") == "parent":
        children = await db.students.find({"parent_id": current_user["_id"]}).to_list(100)
        if not any(str(c["_id"]) == student_id for c in children):
            raise HTTPException(status_code=403, detail="Akses ditolak")
    elif current_user.get("role") == "pelajar":
        if str(current_user["_id"]) != student_id:
            raise HTTPException(status_code=403, detail="Akses ditolak")
    rows = await db.offences.find({"student_id": _id_value(student_id)}).sort("created_at", -1).to_list(100)
    sections_map = await _get_sections_map(db)
    return [_serialize_offence(r, sections_map) for r in rows]


# --------------- OLAT ---------------

@router.post("/olat")
async def create_olat_case(
    body: OLATCaseCreate,
    current_user: dict = Depends(require_warden_admin()),
):
    """Trigger OLAT dari kesalahan sedia ada."""
    db = get_db()
    offence = await db.offences.find_one({"_id": _id_value(body.offence_id)})
    if not offence:
        raise HTTPException(status_code=404, detail="Rekod kesalahan tidak dijumpai")
    if offence.get("olat_case_id"):
        raise HTTPException(status_code=400, detail="Kesalahan ini sudah dirujuk OLAT")
    now_iso = datetime.now(timezone.utc).isoformat()
    case_number = f"OLAT-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{body.offence_id[:6].upper()}"
    olat_doc = {
        "case_number": case_number,
        "offence_id": offence["_id"],
        "student_id": offence["student_id"],
        "student_name": offence.get("student_name", ""),
        "student_matric": offence.get("student_matric", ""),
        "status": OLAT_STATUS_OPEN,
        "catatan": body.catatan,
        "opened_at": now_iso,
        "created_at": now_iso,
        "detention_end_date": None,
    }
    res = await db.olat_cases.insert_one(olat_doc)
    await db.offences.update_one(
        {"_id": offence["_id"]},
        {"$set": {"status": OFFENCE_STATUS_OLAT, "olat_case_id": str(res.inserted_id), "updated_at": now_iso}},
    )
    await _notify_parent_student_event(
        db, str(offence["student_id"]),
        "Kes OLAT Dibuka",
        f"Kes OLAT {case_number} telah dibuka untuk {offence.get('student_name', '')}. Sila hubungi pihak maktab.",
        "warning",
    )
    await log_audit(current_user, "CREATE_OLAT", "discipline", f"OLAT {case_number} - {offence.get('student_name', '')}")
    return {"message": "Kes OLAT dibuka", "id": str(res.inserted_id), "case_number": case_number}


@router.get("/olat")
async def list_olat_cases(
    student_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(100, le=500),
    current_user: dict = Depends(require_warden_admin()),
):
    """Senarai kes OLAT."""
    db = get_db()
    query = {}
    if student_id:
        query["student_id"] = _id_value(student_id)
    if status:
        query["status"] = status
    if current_user.get("role") == "warden":
        block = current_user.get("assigned_block", current_user.get("block_assigned", ""))
        if block:
            users_in = await db.users.find({"block": block, "role": "pelajar"}).to_list(1000)
            students_in = await db.students.find({"block_name": block}).to_list(1000)
            ids = [s["_id"] for s in users_in] + [s["_id"] for s in students_in]
            if ids:
                query["student_id"] = {"$in": ids}
    rows = await db.olat_cases.find(query).sort("created_at", -1).limit(limit).to_list(limit)
    return [_serialize_olat(o) for o in rows]


@router.get("/olat/student/{student_id}/count")
async def get_olat_count_for_student(
    student_id: str,
    current_user: dict = Depends(require_warden_admin()),
):
    """Jumlah kesalahan OLAT yang pernah pelajar ini lakukan (untuk paparan warden)."""
    db = get_db()
    try:
        sid = _id_value(student_id, strict=True)
    except Exception:
        raise HTTPException(status_code=400, detail="ID pelajar tidak sah")
    count = await db.olat_cases.count_documents({"student_id": sid})
    return {"student_id": student_id, "past_olat_count": count}


@router.post("/olat/manual")
async def create_olat_manual(
    body: OLATManualCreate,
    current_user: dict = Depends(require_warden_admin()),
):
    """Tambah pelajar ke OLAT (kena OLAT) dengan tarikh maksima tahanan tidak boleh outing. Tanpa kaitan kesalahan."""
    db = get_db()
    student = await _get_student(db, body.student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    student_name = student.get("full_name", student.get("fullName", "Unknown"))
    student_matric = student.get("matric_number", student.get("matric", ""))
    now_iso = datetime.now(timezone.utc).isoformat()
    case_number = f"OLAT-M-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{body.student_id[:6].upper()}"
    olat_doc = {
        "case_number": case_number,
        "offence_id": None,
        "student_id": _id_value(body.student_id),
        "student_name": student_name,
        "student_matric": student_matric,
        "status": OLAT_STATUS_OPEN,
        "catatan": body.catatan,
        "opened_at": now_iso,
        "created_at": now_iso,
        "detention_end_date": body.detention_end_date or None,
        "category_ids": _parse_category_ids(body.category_ids),
    }
    res = await db.olat_cases.insert_one(olat_doc)
    await _notify_parent_student_event(
        db, body.student_id,
        "Kes OLAT (Tahanan)",
        f"Pelajar {student_name} telah disenaraikan dalam OLAT. Tidak dibenarkan outing sehingga {body.detention_end_date or 'tarikh ditetapkan'}.",
        "warning",
    )
    await log_audit(current_user, "CREATE_OLAT_MANUAL", "discipline", f"OLAT manual {case_number} - {student_name}")
    return {"message": "Pelajar ditambah ke senarai OLAT", "id": str(res.inserted_id), "case_number": case_number}


@router.patch("/olat/{case_id}")
async def update_olat_case(
    case_id: str,
    body: OLATCaseUpdate,
    current_user: dict = Depends(require_warden_admin()),
):
    """Kemaskini status/outcome kes OLAT."""
    db = get_db()
    now_iso = datetime.now(timezone.utc).isoformat()
    updates = {"updated_at": now_iso}
    if body.status is not None:
        updates["status"] = body.status
        if body.status == OLAT_STATUS_CLOSED:
            updates["closed_at"] = now_iso
    if body.outcome is not None:
        updates["outcome"] = body.outcome
    if body.catatan is not None:
        updates["catatan"] = body.catatan
    if body.detention_end_date is not None:
        updates["detention_end_date"] = body.detention_end_date
    result = await db.olat_cases.update_one(
        {"_id": _id_value(case_id)},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kes OLAT tidak dijumpai")
    if body.status == OLAT_STATUS_CLOSED:
        case_doc = await db.olat_cases.find_one({"_id": _id_value(case_id)})
        if case_doc:
            await _notify_parent_student_event(
                db, str(case_doc["student_id"]),
                "Kes OLAT Ditutup",
                f"Kes OLAT {case_doc.get('case_number', '')} untuk {case_doc.get('student_name', '')} telah ditutup." + (f" Outcome: {body.outcome}" if body.outcome else ""),
                "info",
            )
    await log_audit(current_user, "UPDATE_OLAT", "discipline", f"Kemaskini kes OLAT {case_id}")
    return {"message": "Kes OLAT dikemaskini"}


# --------------- Kategori OLAT (3 sahaja, sync DB - warden boleh tambah/edit/padam) ---------------

def _serialize_olat_category(c: dict) -> dict:
    return {
        "id": str(c["_id"]),
        "keyword": c.get("keyword", ""),
        "label": c.get("label", ""),
        "order": c.get("order", 0),
        "created_at": c.get("created_at"),
        "updated_at": c.get("updated_at"),
    }


@router.get("/olat/categories")
async def list_olat_categories(current_user: dict = Depends(require_warden_admin())):
    """Senarai kategori OLAT (boleh banyak). Disegerakkan dengan DB."""
    db = get_db()
    await _ensure_olat_categories_seeded(db)
    rows = await db.olat_categories.find({}).sort("order", 1).to_list(500)
    return {"categories": [_serialize_olat_category(r) for r in rows]}


@router.post("/olat/categories")
async def create_olat_category(
    body: OLATCategoryCreate,
    current_user: dict = Depends(require_warden_admin()),
):
    """Tambah kategori OLAT. Boleh banyak kategori."""
    db = get_db()
    await _ensure_olat_categories_seeded(db)
    n = await db.olat_categories.count_documents({})
    keyword = body.keyword.strip().lower()
    existing = await db.olat_categories.find_one({"keyword": keyword})
    if existing:
        raise HTTPException(status_code=400, detail="Keyword kategori ini sudah wujud")
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "keyword": keyword,
        "label": (body.label or body.keyword).strip(),
        "order": n + 1,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    res = await db.olat_categories.insert_one(doc)
    await log_audit(current_user, "CREATE_OLAT_CATEGORY", "discipline", f"Kategori: {doc['label']}")
    return {"message": "Kategori OLAT ditambah", "category": _serialize_olat_category({**doc, "_id": res.inserted_id})}


@router.put("/olat/categories/{category_id}")
async def update_olat_category(
    category_id: str,
    body: OLATCategoryUpdate,
    current_user: dict = Depends(require_warden_admin()),
):
    """Kemaskini kategori OLAT."""
    db = get_db()
    if body.keyword is None and body.label is None:
        raise HTTPException(status_code=400, detail="Sila beri keyword atau label untuk dikemaskini")
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.keyword is not None:
        updates["keyword"] = body.keyword.strip().lower()
    if body.label is not None:
        updates["label"] = body.label.strip()
    result = await db.olat_categories.update_one(
        {"_id": _id_value(category_id)},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kategori tidak dijumpai")
    await log_audit(current_user, "UPDATE_OLAT_CATEGORY", "discipline", f"Kategori id {category_id}")
    updated = await db.olat_categories.find_one({"_id": _id_value(category_id)})
    return {"message": "Kategori dikemaskini", "category": _serialize_olat_category(updated)}


@router.delete("/olat/categories/{category_id}")
async def delete_olat_category(
    category_id: str,
    current_user: dict = Depends(require_warden_admin()),
):
    """Padam kategori OLAT."""
    db = get_db()
    result = await db.olat_categories.delete_one({"_id": _id_value(category_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Kategori tidak dijumpai")
    await log_audit(current_user, "DELETE_OLAT_CATEGORY", "discipline", f"Kategori id {category_id}")
    return {"message": "Kategori OLAT dipadam"}


@router.get("/stats")
async def discipline_stats(current_user: dict = Depends(require_warden_admin())):
    """Statistik disiplin & OLAT (live dari MongoDB)."""
    db = get_db()
    query_off = {}
    query_olat = {}
    if current_user.get("role") == "warden":
        block = current_user.get("assigned_block", current_user.get("block_assigned", ""))
        if block:
            users_in = await db.users.find({"block": block, "role": "pelajar"}).to_list(1000)
            students_in = await db.students.find({"block_name": block}).to_list(1000)
            ids = [s["_id"] for s in users_in] + [s["_id"] for s in students_in]
            if ids:
                query_off["student_id"] = {"$in": ids}
                query_olat["student_id"] = {"$in": ids}
    total_offences = await db.offences.count_documents(query_off)
    pending_offences = await db.offences.count_documents({**query_off, "status": OFFENCE_STATUS_PENDING})
    total_olat = await db.olat_cases.count_documents(query_olat)
    open_olat = await db.olat_cases.count_documents({**query_olat, "status": {"$in": [OLAT_STATUS_OPEN, OLAT_STATUS_IN_PROGRESS]}})
    return {
        "total_offences": total_offences,
        "pending_offences": pending_offences,
        "total_olat_cases": total_olat,
        "open_olat_cases": open_olat,
    }
