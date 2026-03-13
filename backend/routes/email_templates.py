"""
Modul Template Email - CRUD template e-mel mengikut fungsi dalam sistem.
Akses: semua peranan pentadbiran (superadmin, admin, bendahari, warden, dll.) — BUKAN pelajar/ibu bapa.
"""
from datetime import datetime, timezone
from typing import Any, Optional, List, Callable
from bson import ObjectId
from services.id_normalizer import object_id_or_none

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/email-templates", tags=["Email Templates"])
security = HTTPBearer(auto_error=False)

_get_db_func: Callable = None
_get_current_user_func: Callable = None

# Peranan yang boleh akses (semua admin, bukan parent/pelajar)
ADMIN_ROLES = {
    "superadmin", "admin", "bendahari", "sub_bendahari", "warden",
    "guru_kelas", "guru_homeroom", "juruaudit", "koop_admin", "bus_admin", "guard"
}


def init_router(get_db_func, auth_func):
    global _get_db_func, _get_current_user_func
    _get_db_func = get_db_func
    _get_current_user_func = auth_func


def get_db():
    return _get_db_func()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Token diperlukan")
    return await _get_current_user_func(credentials)


def _id_value(value: Any) -> Any:
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
    return text


def require_admin():
    async def _dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
        user = await get_current_user(credentials)
        if user.get("role") not in ADMIN_ROLES:
            raise HTTPException(status_code=403, detail="Akses ditolak. Hanya pentadbir.")
        return user
    return _dep


class EmailTemplateCreate(BaseModel):
    template_key: str = Field(..., min_length=1, max_length=80, description="Kod unik template, cth. fee_reminder")
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    subject: str = Field(..., min_length=1, max_length=300)
    body_html: str = Field(..., min_length=1)
    body_text: Optional[str] = None
    variables: List[str] = Field(default_factory=list, description="Senarai pembolehubah, cth. parent_name, child_name")
    tingkatan: Optional[int] = Field(None, ge=1, le=5, description="Tingkatan 1-5; null = template umum")


class EmailTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    subject: Optional[str] = None
    body_html: Optional[str] = None
    body_text: Optional[str] = None
    variables: Optional[List[str]] = None
    is_active: Optional[bool] = None
    tingkatan: Optional[int] = Field(None, ge=1, le=5)


def serialize_template(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "template_key": doc.get("template_key", ""),
        "name": doc.get("name", ""),
        "description": doc.get("description"),
        "subject": doc.get("subject", ""),
        "body_html": doc.get("body_html", ""),
        "body_text": doc.get("body_text"),
        "variables": doc.get("variables", []),
        "is_active": doc.get("is_active", True),
        "tingkatan": doc.get("tingkatan"),
        "created_at": doc.get("created_at", ""),
        "updated_at": doc.get("updated_at", ""),
    }


# Template keys dan deskripsi rujukan (untuk UI)
TEMPLATE_KEYS_REF = [
    {
        "key": "fee_reminder",
        "name": "Peringatan Yuran Tertunggak",
        "variables": [
            "parent_name",
            "child_name",
            "student_name",
            "no_matriks",
            "rujukan_surat",
            "tarikh_surat",
            "children_outstanding",
            "outstanding_year_rows_text",
            "outstanding_year_rows_html",
            "outstanding_tingkatan_rows_text",
            "outstanding_tingkatan_rows_html",
            "current_tingkatan",
            "total_outstanding",
            "total_paid",
            "surat_peringatan_text",
        ],
    },
    {"key": "payment_confirm", "name": "Pengesahan Pembayaran", "variables": ["parent_name", "child_name", "amount", "receipt_number", "remaining"]},
    {"key": "new_fee_assignment", "name": "Yuran Baru Dikenakan", "variables": ["parent_name", "child_name", "fee_set_name", "total_amount", "items"]},
    {"key": "bus_booking", "name": "Pengesahan Tempahan Bas", "variables": ["recipient_name", "trip_date", "booking_details"]},
    {"key": "test_email", "name": "E-mel Ujian", "variables": []},
]


@router.get("/keys")
async def get_template_keys_ref(current_user: dict = Depends(require_admin())):
    """Senarai template key rujukan dan pembolehubah yang disokong."""
    return {"keys": TEMPLATE_KEYS_REF}


@router.get("/stats-by-tingkatan")
async def stats_by_tingkatan(current_user: dict = Depends(require_admin())):
    """Statistik pelajar dan ibu bapa mengikut tingkatan (selari dengan data sistem)."""
    db = get_db()
    stats = {}
    for tingkatan in range(1, 6):
        student_count = await db.students.count_documents({"form": tingkatan})
        # Ibu bapa unik yang mempunyai sekurang-kurangnya seorang anak dalam tingkatan ini
        parent_ids = set()
        async for row in db.students.find({"form": tingkatan, "parent_id": {"$nin": [None, ""]}}):
            parent_id = row.get("parent_id")
            if parent_id in (None, ""):
                continue
            parent_ids.add(str(parent_id).strip())
        parent_count = len(parent_ids)
        stats[str(tingkatan)] = {"students": student_count, "parents": parent_count}
    return {"by_tingkatan": stats}


@router.get("")
async def list_templates(
    is_active: Optional[bool] = None,
    tingkatan: Optional[int] = Query(None, ge=1, le=5),
    current_user: dict = Depends(require_admin()),
):
    """Senarai semua template e-mel. Filter by tingkatan (1-5) atau tiada = semua."""
    db = get_db()
    query = {}
    if is_active is not None:
        query["is_active"] = is_active
    if tingkatan is not None:
        query["$or"] = [{"tingkatan": tingkatan}, {"tingkatan": None}]
    cursor = db.email_templates.find(query).sort([("tingkatan", 1), ("template_key", 1)])
    items = await cursor.to_list(200)
    return {"templates": [serialize_template(t) for t in items], "total": len(items)}


@router.get("/by-key/{template_key}")
async def get_by_key(
    template_key: str,
    tingkatan: Optional[int] = Query(None, ge=1, le=5),
    current_user: dict = Depends(require_admin()),
):
    """Dapatkan template mengikut template_key. Jika tingkatan diberi, utamakan template untuk tingkatan itu."""
    db = get_db()
    doc = None
    if tingkatan is not None:
        doc = await db.email_templates.find_one({"template_key": template_key, "tingkatan": tingkatan})
    if doc is None:
        doc = await db.email_templates.find_one({"template_key": template_key, "tingkatan": None})
    if doc is None:
        doc = await db.email_templates.find_one({"template_key": template_key})
    if not doc:
        raise HTTPException(status_code=404, detail="Template tidak dijumpai")
    return {"template": serialize_template(doc)}


class SendTestEmailBody(BaseModel):
    template_key: str
    to_email: str
    variables: Optional[dict] = None
    tingkatan: Optional[int] = Field(None, ge=1, le=5)


@router.post("/send-test")
async def send_test_email(
    body: SendTestEmailBody,
    current_user: dict = Depends(require_admin()),
):
    """Hantar e-mel ujian menggunakan template (SES atau Resend). Boleh pilih template per tingkatan."""
    from services.email_service import send_email_via_template
    db = get_db()
    result = await send_email_via_template(
        db,
        template_key=body.template_key,
        to_email=body.to_email,
        variables=body.variables or {},
        tingkatan=body.tingkatan,
    )
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("error", "Gagal hantar e-mel"))
    return {"message": "E-mel ujian dihantar", "result": result}


@router.get("/{template_id}")
async def get_template(template_id: str, current_user: dict = Depends(require_admin())):
    """Dapatkan template mengikut ID."""
    db = get_db()
    doc = await db.email_templates.find_one({"_id": _id_value(template_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Template tidak dijumpai")
    return {"template": serialize_template(doc)}


@router.post("")
async def create_template(
    body: EmailTemplateCreate,
    current_user: dict = Depends(require_admin()),
):
    """Cipta template e-mel baru (boleh per tingkatan)."""
    db = get_db()
    # Unik per (template_key, tingkatan)
    lookup = {"template_key": body.template_key.strip().lower().replace(" ", "_")}
    if body.tingkatan is not None:
        lookup["tingkatan"] = body.tingkatan
    else:
        lookup["tingkatan"] = None
    existing = await db.email_templates.find_one(lookup)
    if existing:
        raise HTTPException(status_code=400, detail="Template dengan kunci dan tingkatan ini sudah wujud")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "template_key": body.template_key.strip().lower().replace(" ", "_"),
        "name": body.name.strip(),
        "description": body.description,
        "subject": body.subject,
        "body_html": body.body_html,
        "body_text": body.body_text,
        "variables": body.variables or [],
        "tingkatan": body.tingkatan,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
        "created_by": str(current_user.get("_id", "")),
    }
    result = await db.email_templates.insert_one(doc)
    doc["_id"] = result.inserted_id
    return {"message": "Template dicipta", "template": serialize_template(doc)}


@router.put("/{template_id}")
async def update_template(
    template_id: str,
    body: EmailTemplateUpdate,
    current_user: dict = Depends(require_admin()),
):
    """Kemaskini template e-mel."""
    db = get_db()
    doc = await db.email_templates.find_one({"_id": _id_value(template_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Template tidak dijumpai")
    update = {k: v for k, v in body.dict().items() if v is not None}
    if not update:
        return {"message": "Tiada perubahan", "template": serialize_template(doc)}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.email_templates.update_one({"_id": _id_value(template_id)}, {"$set": update})
    updated = await db.email_templates.find_one({"_id": _id_value(template_id)})
    return {"message": "Template dikemaskini", "template": serialize_template(updated)}


@router.delete("/{template_id}")
async def delete_template(
    template_id: str,
    current_user: dict = Depends(require_admin()),
):
    """Padam template (soft: set is_active=False) atau hard delete."""
    db = get_db()
    doc = await db.email_templates.find_one({"_id": _id_value(template_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Template tidak dijumpai")
    await db.email_templates.delete_one({"_id": _id_value(template_id)})
    return {"message": "Template dipadam"}
