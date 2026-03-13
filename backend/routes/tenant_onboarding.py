"""
Tenant Onboarding Routes

Wizard pendaftaran institusi baharu + semakan superadmin + provisioning tenant asas.
"""
from __future__ import annotations

from datetime import datetime, timezone
import secrets
import string
import uuid
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field, validator
from services.id_normalizer import object_id_or_none

router = APIRouter(tags=["Tenant Onboarding"])
security = HTTPBearer(auto_error=False)

_get_db_func: Callable = None
_get_current_user_func: Callable = None
_log_audit_func: Callable = None
_pwd_context = None

COLL_ONBOARDING_REQUESTS = "institution_onboarding_requests"
COLL_TENANTS = "tenants"
COLL_TENANT_MODULE_SETTINGS = "tenant_module_settings"
COLL_TENANT_USER_MEMBERSHIPS = "tenant_user_memberships"
COLL_TENANT_ONBOARDING_JOBS = "tenant_onboarding_jobs"

REQUEST_STATUS_SUBMITTED = "submitted"
REQUEST_STATUS_UNDER_REVIEW = "under_review"
REQUEST_STATUS_NEED_INFO = "need_info"
REQUEST_STATUS_APPROVED = "approved"
REQUEST_STATUS_REJECTED = "rejected"

VALID_REQUEST_STATUSES = {
    REQUEST_STATUS_SUBMITTED,
    REQUEST_STATUS_UNDER_REVIEW,
    REQUEST_STATUS_NEED_INFO,
    REQUEST_STATUS_APPROVED,
    REQUEST_STATUS_REJECTED,
}

VALID_REVIEW_DECISIONS = {"approve", "reject", "need_info"}
STAFF_ROLES = {"superadmin", "admin"}
SUPERADMIN_ONLY = {"superadmin"}

DEFAULT_TENANT_MODULE_SETTINGS: Dict[str, Dict[str, Any]] = {
    "tiket_bas": {"enabled": True, "name": "Tiket Bas", "description": "Modul tempahan tiket bas"},
    "hostel": {"enabled": True, "name": "Hostel", "description": "Modul pengurusan asrama"},
    "koperasi": {"enabled": True, "name": "Koperasi", "description": "Modul kedai koperasi maktab"},
    "marketplace": {"enabled": True, "name": "Marketplace", "description": "Modul pasaran pelbagai vendor"},
    "sickbay": {"enabled": True, "name": "Bilik Sakit", "description": "Modul pengurusan bilik sakit"},
    "vehicle": {"enabled": True, "name": "Kenderaan", "description": "Modul keselamatan kenderaan (QR)"},
    "inventory": {"enabled": True, "name": "Inventori", "description": "Modul inventori universal"},
    "complaints": {"enabled": True, "name": "Aduan", "description": "Modul aduan dan maklum balas"},
    "agm": {"enabled": True, "name": "Mesyuarat AGM", "description": "Modul mesyuarat agung tahunan"},
}


def init_router(get_db_func, auth_func, log_audit_func, pwd_context):
    global _get_db_func, _get_current_user_func, _log_audit_func, _pwd_context
    _get_db_func = get_db_func
    _get_current_user_func = auth_func
    _log_audit_func = log_audit_func
    _pwd_context = pwd_context


def get_db():
    return _get_db_func()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Token diperlukan")
    return await _get_current_user_func(credentials)


async def log_audit(user, action: str, module: str, details: str):
    if _log_audit_func and user:
        await _log_audit_func(user, action, module, details)


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _id_value(value: Any) -> Any:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return text
    oid = object_id_or_none(text)
    if oid is not None:
        return oid
    return text


def _new_id() -> str:
    return uuid.uuid4().hex


def _normalize_phone(value: Optional[str]) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    compact = "".join(ch for ch in raw if ch.isdigit() or ch == "+")
    if compact.startswith("60"):
        compact = f"+{compact}"
    return compact


def _normalize_text(value: Optional[str]) -> str:
    return str(value or "").strip()


def _normalize_code(value: Optional[str], fallback: str = "tenant") -> str:
    source = str(value or "").strip().lower()
    if not source:
        source = fallback
    out = []
    prev_dash = False
    for ch in source:
        if ch.isalnum():
            out.append(ch)
            prev_dash = False
        else:
            if not prev_dash:
                out.append("-")
            prev_dash = True
    code = "".join(out).strip("-")
    return code or fallback


def _normalize_module_key(value: Optional[str]) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return ""
    normalized = []
    prev_sep = False
    for ch in raw:
        if ch.isalnum():
            normalized.append(ch)
            prev_sep = False
        elif ch in {"_", "-", " "}:
            if not prev_sep:
                normalized.append("_")
            prev_sep = True
        else:
            prev_sep = True
    return "".join(normalized).strip("_")


def _normalize_decision(value: Optional[str]) -> str:
    text = _normalize_module_key(value)
    if text == "need_info":
        return "need_info"
    if text == "approve":
        return "approve"
    if text == "reject":
        return "reject"
    return text


def _normalize_status_value(value: Optional[str]) -> str:
    return _normalize_module_key(value)


def _build_tracking_code() -> str:
    date_part = datetime.now(timezone.utc).strftime("%Y%m%d")
    random_part = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))
    return f"INST-{date_part}-{random_part}"


def _build_temp_password() -> str:
    alphabet = string.ascii_letters + string.digits
    return "Temp@" + "".join(secrets.choice(alphabet) for _ in range(10))


def _build_placeholder_ic_number() -> str:
    return "".join(secrets.choice(string.digits) for _ in range(12))


def _safe_copy_modules(modules: Optional[Dict[str, Dict[str, Any]]] = None) -> Dict[str, Dict[str, Any]]:
    source = modules or DEFAULT_TENANT_MODULE_SETTINGS
    out: Dict[str, Dict[str, Any]] = {}
    for key, meta in DEFAULT_TENANT_MODULE_SETTINGS.items():
        custom = (source or {}).get(key, {}) if isinstance(source, dict) else {}
        out[key] = {
            "enabled": bool(custom.get("enabled", meta.get("enabled", True))),
            "name": meta.get("name", key),
            "description": meta.get("description", ""),
        }
    return out


def _pick_requested_modules(module_keys: Optional[List[str]]) -> Dict[str, Dict[str, Any]]:
    enabled_keys = set()
    for key in module_keys or []:
        normalized = _normalize_module_key(key)
        if normalized in DEFAULT_TENANT_MODULE_SETTINGS:
            enabled_keys.add(normalized)
    modules = _safe_copy_modules()
    if not enabled_keys:
        return modules
    for key in modules:
        modules[key]["enabled"] = key in enabled_keys
    return modules


def _sanitize_review_modules(modules_payload: Optional[Dict[str, Dict[str, Any]]]) -> Dict[str, Dict[str, Any]]:
    if not isinstance(modules_payload, dict):
        return _safe_copy_modules()
    merged = _safe_copy_modules()
    for key, value in modules_payload.items():
        if key not in merged:
            continue
        merged[key]["enabled"] = bool((value or {}).get("enabled", merged[key]["enabled"]))
    return merged


def _serialize_request(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(doc.get("_id", "")),
        "tracking_code": doc.get("tracking_code", ""),
        "status": doc.get("status", REQUEST_STATUS_SUBMITTED),
        "institution_name": doc.get("institution_name", ""),
        "institution_type": doc.get("institution_type", ""),
        "contact_person_name": doc.get("contact_person_name", ""),
        "contact_person_email": doc.get("contact_person_email", ""),
        "contact_person_phone": doc.get("contact_person_phone", ""),
        "admin_full_name": doc.get("admin_full_name", ""),
        "admin_email": doc.get("admin_email", ""),
        "admin_phone": doc.get("admin_phone", ""),
        "estimated_students": doc.get("estimated_students", 0),
        "state": doc.get("state", ""),
        "notes": doc.get("notes", ""),
        "requested_modules": doc.get("requested_modules", []),
        "requested_modules_map": doc.get("requested_modules_map", _safe_copy_modules()),
        "reviewer_notes": doc.get("reviewer_notes", ""),
        "tenant_id": doc.get("tenant_id"),
        "tenant_code": doc.get("tenant_code"),
        "admin_user_id": doc.get("admin_user_id"),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
        "reviewed_at": doc.get("reviewed_at"),
    }


def _serialize_tenant(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(doc.get("_id", "")),
        "tenant_code": doc.get("tenant_code", ""),
        "institution_name": doc.get("institution_name", ""),
        "institution_type": doc.get("institution_type", ""),
        "status": doc.get("status", "draft"),
        "onboarding_stage": doc.get("onboarding_stage", ""),
        "contact_person_name": doc.get("contact_person_name", ""),
        "contact_person_email": doc.get("contact_person_email", ""),
        "contact_person_phone": doc.get("contact_person_phone", ""),
        "portal_title": doc.get("portal_title", ""),
        "institution_name_display": doc.get("institution_name_display", ""),
        "timezone": doc.get("timezone", "Asia/Kuala_Lumpur"),
        "created_at": doc.get("created_at"),
        "activated_at": doc.get("activated_at"),
    }


def _assert_roles(current_user: Dict[str, Any], allowed_roles: set[str], detail: str = "Akses ditolak") -> None:
    if current_user.get("role") not in allowed_roles:
        raise HTTPException(status_code=403, detail=detail)


async def _ensure_unique_tenant_code(db, desired_code: Optional[str], institution_name: str) -> str:
    base = _normalize_code(desired_code or institution_name, fallback="tenant")
    candidate = base
    suffix = 1
    while await db.tenants.find_one({"tenant_code": candidate}):
        suffix += 1
        candidate = f"{base}-{suffix}"
    return candidate


class InstitutionWizardSubmitRequest(BaseModel):
    institution_name: str = Field(..., min_length=3, max_length=255)
    institution_type: Optional[str] = Field(default="mrsm", max_length=64)
    state: Optional[str] = Field(default="", max_length=128)
    contact_person_name: str = Field(..., min_length=3, max_length=255)
    contact_person_email: EmailStr
    contact_person_phone: str = Field(..., min_length=8, max_length=64)
    admin_full_name: str = Field(..., min_length=3, max_length=255)
    admin_email: EmailStr
    admin_phone: str = Field(..., min_length=8, max_length=64)
    estimated_students: Optional[int] = Field(default=0, ge=0, le=100000)
    requested_modules: Optional[List[str]] = Field(default_factory=list)
    preferred_tenant_code: Optional[str] = Field(default="", max_length=64)
    notes: Optional[str] = Field(default="", max_length=2000)

    @validator("institution_name", "contact_person_name", "admin_full_name")
    def _trim_non_empty(cls, value: str):
        text = _normalize_text(value)
        if not text:
            raise ValueError("Medan wajib tidak boleh kosong")
        return text

    @validator("contact_person_phone", "admin_phone")
    def _normalize_phone_field(cls, value: str):
        text = _normalize_phone(value)
        if len(text) < 8:
            raise ValueError("No telefon tidak sah")
        return text

    @validator("institution_type", "state", "preferred_tenant_code", "notes")
    def _trim_optional(cls, value: Optional[str]):
        return _normalize_text(value)


class InstitutionWizardReviewRequest(BaseModel):
    decision: str = Field(..., description="approve | reject | need_info")
    reviewer_notes: Optional[str] = Field(default="", max_length=2000)
    tenant_code: Optional[str] = Field(default="", max_length=64)
    portal_title: Optional[str] = Field(default="", max_length=255)
    institution_name_display: Optional[str] = Field(default="", max_length=255)
    create_admin_account: bool = True
    admin_password: Optional[str] = Field(default="", max_length=128)
    approved_modules: Optional[Dict[str, Dict[str, Any]]] = None

    @validator("decision")
    def _validate_decision(cls, value: str):
        decision = _normalize_decision(value)
        if decision not in VALID_REVIEW_DECISIONS:
            raise ValueError("decision mesti approve, reject, atau need_info")
        return decision

    @validator("reviewer_notes", "tenant_code", "portal_title", "institution_name_display", "admin_password")
    def _trim_optional(cls, value: Optional[str]):
        return _normalize_text(value)


class TenantModulesUpdateRequest(BaseModel):
    modules: Dict[str, Dict[str, Any]] = Field(default_factory=dict)


@router.get("/api/public/institutions/wizard/defaults")
async def get_institution_wizard_defaults():
    return {
        "module_defaults": _safe_copy_modules(),
        "institution_types": [
            {"value": "mrsm", "label": "MRSM"},
            {"value": "sekolah_menengah", "label": "Sekolah Menengah"},
            {"value": "sekolah_rendah", "label": "Sekolah Rendah"},
            {"value": "kolej", "label": "Kolej / Institusi Pengajian"},
            {"value": "lain_lain", "label": "Lain-lain"},
        ],
        "status_labels": {
            REQUEST_STATUS_SUBMITTED: "Dihantar",
            REQUEST_STATUS_UNDER_REVIEW: "Dalam Semakan",
            REQUEST_STATUS_NEED_INFO: "Perlu Maklumat Tambahan",
            REQUEST_STATUS_APPROVED: "Diluluskan",
            REQUEST_STATUS_REJECTED: "Ditolak",
        },
    }


@router.post("/api/public/institutions/wizard/submit")
async def submit_institution_wizard(body: InstitutionWizardSubmitRequest):
    db = get_db()
    now = _iso_now()

    email_query = {
        "$or": [
            {"contact_person_email": _normalize_text(body.contact_person_email).lower()},
            {"admin_email": _normalize_text(body.admin_email).lower()},
        ],
        "status": {"$in": [REQUEST_STATUS_SUBMITTED, REQUEST_STATUS_UNDER_REVIEW, REQUEST_STATUS_NEED_INFO]},
    }
    existing = await db.institution_onboarding_requests.find_one(email_query)
    if existing:
        raise HTTPException(
            status_code=409,
            detail="Permohonan aktif sudah wujud untuk emel ini. Sila semak status permohonan sedia ada.",
        )

    requested_modules_map = _pick_requested_modules(body.requested_modules)
    requested_module_keys = [key for key, value in requested_modules_map.items() if value.get("enabled")]
    if not requested_module_keys:
        requested_module_keys = [key for key in DEFAULT_TENANT_MODULE_SETTINGS.keys()]

    tracking_code = _build_tracking_code()
    request_id = _new_id()
    doc = {
        "_id": request_id,
        "tracking_code": tracking_code,
        "status": REQUEST_STATUS_SUBMITTED,
        "institution_name": body.institution_name,
        "institution_type": body.institution_type or "mrsm",
        "state": body.state or "",
        "contact_person_name": body.contact_person_name,
        "contact_person_email": _normalize_text(body.contact_person_email).lower(),
        "contact_person_phone": body.contact_person_phone,
        "admin_full_name": body.admin_full_name,
        "admin_email": _normalize_text(body.admin_email).lower(),
        "admin_phone": body.admin_phone,
        "estimated_students": int(body.estimated_students or 0),
        "requested_modules": requested_module_keys,
        "requested_modules_map": requested_modules_map,
        "preferred_tenant_code": _normalize_code(body.preferred_tenant_code, fallback=""),
        "notes": body.notes or "",
        "created_at": now,
        "updated_at": now,
    }
    await db.institution_onboarding_requests.insert_one(doc)

    return {
        "success": True,
        "message": "Permohonan onboarding institusi berjaya dihantar.",
        "request_id": request_id,
        "tracking_code": tracking_code,
        "status": REQUEST_STATUS_SUBMITTED,
    }


@router.get("/api/public/institutions/wizard/status/{tracking_code}")
async def get_institution_wizard_status(
    tracking_code: str,
    email: EmailStr = Query(..., description="Emel contact atau admin untuk pengesahan"),
):
    db = get_db()
    doc = await db.institution_onboarding_requests.find_one(
        {
            "tracking_code": _normalize_text(tracking_code).upper(),
            "$or": [
                {"contact_person_email": _normalize_text(email).lower()},
                {"admin_email": _normalize_text(email).lower()},
            ],
        }
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Permohonan tidak dijumpai")

    serialized = _serialize_request(doc)
    registration_url = None
    if serialized.get("status") == REQUEST_STATUS_APPROVED and serialized.get("tenant_code"):
        registration_url = f"/register?tenant_code={serialized.get('tenant_code')}"
    return {
        "tracking_code": serialized["tracking_code"],
        "status": serialized["status"],
        "institution_name": serialized["institution_name"],
        "reviewer_notes": serialized["reviewer_notes"],
        "updated_at": serialized["updated_at"],
        "tenant_code": serialized.get("tenant_code"),
        "registration_url": registration_url,
    }


@router.get("/api/tenants/onboarding/requests")
async def list_onboarding_requests(
    status: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
):
    _assert_roles(current_user, STAFF_ROLES)
    db = get_db()

    query: Dict[str, Any] = {}
    if status:
        normalized = _normalize_status_value(status)
        if normalized not in VALID_REQUEST_STATUSES:
            raise HTTPException(status_code=400, detail="status tidak sah")
        query["status"] = normalized
    if search:
        regex = {"$regex": _normalize_text(search), "$options": "i"}
        query["$or"] = [
            {"institution_name": regex},
            {"contact_person_name": regex},
            {"contact_person_email": regex},
            {"admin_email": regex},
            {"tracking_code": regex},
        ]

    total = await db.institution_onboarding_requests.count_documents(query)
    skip = (page - 1) * limit
    rows = (
        await db.institution_onboarding_requests.find(query)
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
        .to_list(limit)
    )
    return {
        "items": [_serialize_request(row) for row in rows],
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": max(1, (total + limit - 1) // limit),
        },
    }


@router.get("/api/tenants/onboarding/requests/{request_id}")
async def get_onboarding_request_detail(
    request_id: str,
    current_user: dict = Depends(get_current_user),
):
    _assert_roles(current_user, STAFF_ROLES)
    db = get_db()
    doc = await db.institution_onboarding_requests.find_one({"_id": _id_value(request_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Permohonan tidak dijumpai")
    return _serialize_request(doc)


@router.post("/api/tenants/onboarding/requests/{request_id}/review")
async def review_onboarding_request(
    request_id: str,
    body: InstitutionWizardReviewRequest,
    current_user: dict = Depends(get_current_user),
):
    _assert_roles(current_user, SUPERADMIN_ONLY, detail="Hanya superadmin dibenarkan menyemak permohonan")
    db = get_db()
    now = _iso_now()

    doc = await db.institution_onboarding_requests.find_one({"_id": _id_value(request_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Permohonan tidak dijumpai")

    current_status = doc.get("status", REQUEST_STATUS_SUBMITTED)
    if current_status in {REQUEST_STATUS_APPROVED, REQUEST_STATUS_REJECTED}:
        raise HTTPException(status_code=409, detail="Permohonan ini telah dimuktamadkan sebelum ini")

    decision = _normalize_decision(body.decision)
    reviewer_notes = body.reviewer_notes or ""
    reviewer_id = str(current_user.get("_id", ""))
    reviewer_name = current_user.get("full_name", "")

    if decision == "need_info":
        await db.institution_onboarding_requests.update_one(
            {"_id": doc["_id"]},
            {
                "$set": {
                    "status": REQUEST_STATUS_NEED_INFO,
                    "reviewer_notes": reviewer_notes,
                    "reviewed_by": reviewer_id,
                    "reviewed_by_name": reviewer_name,
                    "reviewed_at": now,
                    "updated_at": now,
                }
            },
        )
        await log_audit(
            current_user,
            "TENANT_ONBOARDING_NEED_INFO",
            "tenant_onboarding",
            f"Permohonan {str(doc.get('_id'))} perlu maklumat tambahan",
        )
        return {"success": True, "status": REQUEST_STATUS_NEED_INFO}

    if decision == "reject":
        await db.institution_onboarding_requests.update_one(
            {"_id": doc["_id"]},
            {
                "$set": {
                    "status": REQUEST_STATUS_REJECTED,
                    "reviewer_notes": reviewer_notes,
                    "reviewed_by": reviewer_id,
                    "reviewed_by_name": reviewer_name,
                    "reviewed_at": now,
                    "updated_at": now,
                }
            },
        )
        await log_audit(
            current_user,
            "TENANT_ONBOARDING_REJECTED",
            "tenant_onboarding",
            f"Permohonan {str(doc.get('_id'))} ditolak",
        )
        return {"success": True, "status": REQUEST_STATUS_REJECTED}

    approved_modules = _sanitize_review_modules(body.approved_modules)
    if not any(v.get("enabled") for v in approved_modules.values()):
        raise HTTPException(status_code=400, detail="Sekurang-kurangnya satu modul perlu diaktifkan")

    tenant_code = await _ensure_unique_tenant_code(
        db,
        desired_code=body.tenant_code or doc.get("preferred_tenant_code"),
        institution_name=doc.get("institution_name", "tenant"),
    )
    tenant_id = _new_id()
    tenant_doc = {
        "_id": tenant_id,
        "tenant_code": tenant_code,
        "institution_name": doc.get("institution_name", ""),
        "institution_type": doc.get("institution_type", "mrsm"),
        "state": doc.get("state", ""),
        "status": "active",
        "onboarding_stage": "completed",
        "contact_person_name": doc.get("contact_person_name", ""),
        "contact_person_email": doc.get("contact_person_email", ""),
        "contact_person_phone": doc.get("contact_person_phone", ""),
        "portal_title": body.portal_title or "SMART360: Ai Edition",
        "institution_name_display": body.institution_name_display or doc.get("institution_name", ""),
        "timezone": "Asia/Kuala_Lumpur",
        "registration_request_id": str(doc.get("_id", "")),
        "created_by": reviewer_id,
        "created_by_name": reviewer_name,
        "created_at": now,
        "activated_at": now,
        "updated_at": now,
    }
    await db.tenants.insert_one(tenant_doc)

    await db.tenant_module_settings.update_one(
        {"tenant_id": tenant_id},
        {
            "$set": {
                "tenant_id": tenant_id,
                "tenant_code": tenant_code,
                "modules": approved_modules,
                "updated_at": now,
                "updated_by": reviewer_id,
                "updated_by_name": reviewer_name,
            }
        },
        upsert=True,
    )

    onboarding_job_id = _new_id()
    await db.tenant_onboarding_jobs.insert_one(
        {
            "_id": onboarding_job_id,
            "tenant_id": tenant_id,
            "job_type": "tenant_onboarding_provision",
            "status": "success",
            "payload": {
                "request_id": str(doc.get("_id", "")),
                "review_decision": decision,
                "create_admin_account": bool(body.create_admin_account),
            },
            "result_summary": {
                "tenant_created": True,
                "module_settings_created": True,
            },
            "requested_by": reviewer_id,
            "requested_by_name": reviewer_name,
            "started_at": now,
            "completed_at": now,
            "created_at": now,
            "updated_at": now,
        }
    )

    provision_notes: List[str] = []
    admin_user_id = None
    temporary_password = ""

    if body.create_admin_account:
        admin_email = _normalize_text(doc.get("admin_email", "")).lower()
        admin_name = _normalize_text(doc.get("admin_full_name", "Admin Institusi")) or "Admin Institusi"
        admin_phone = _normalize_phone(doc.get("admin_phone", "")) or _normalize_phone(doc.get("contact_person_phone", ""))
        existing_user = await db.users.find_one({"email": admin_email}) if admin_email else None
        if existing_user:
            admin_user_id = str(existing_user.get("_id", ""))
            provision_notes.append(
                "Emel admin sudah wujud; akaun sedia ada dipautkan ke tenant baharu tanpa reset kata laluan."
            )
        else:
            if not admin_email:
                provision_notes.append("Akaun admin automatik tidak dicipta kerana emel admin kosong.")
            else:
                temporary_password = body.admin_password or _build_temp_password()
                password_hash = _pwd_context.hash(temporary_password) if _pwd_context else temporary_password
                admin_user_id = _new_id()
                await db.users.insert_one(
                    {
                        "_id": admin_user_id,
                        "email": admin_email,
                        "password": password_hash,
                        "full_name": admin_name,
                        "phone": admin_phone,
                        "phone_alt": _normalize_phone(doc.get("contact_person_phone", "")),
                        "ic_number": _build_placeholder_ic_number(),
                        "role": "admin",
                        "is_active": True,
                        "must_change_password": True,
                        "tenant_id": tenant_id,
                        "tenant_code": tenant_code,
                        "created_at": now,
                        "updated_at": now,
                    }
                )
                provision_notes.append("Akaun admin institusi berjaya dicipta.")

        if admin_user_id:
            membership_existing = await db.tenant_user_memberships.find_one(
                {"tenant_id": tenant_id, "user_id": admin_user_id}
            )
            if not membership_existing:
                await db.tenant_user_memberships.insert_one(
                    {
                        "_id": _new_id(),
                        "tenant_id": tenant_id,
                        "tenant_code": tenant_code,
                        "user_id": admin_user_id,
                        "email": admin_email,
                        "role": "admin",
                        "status": "active",
                        "is_primary": True,
                        "created_at": now,
                        "updated_at": now,
                    }
                )

    await db.institution_onboarding_requests.update_one(
        {"_id": doc["_id"]},
        {
            "$set": {
                "status": REQUEST_STATUS_APPROVED,
                "reviewer_notes": reviewer_notes,
                "reviewed_by": reviewer_id,
                "reviewed_by_name": reviewer_name,
                "reviewed_at": now,
                "updated_at": now,
                "tenant_id": tenant_id,
                "tenant_code": tenant_code,
                "approved_modules_map": approved_modules,
                "admin_user_id": admin_user_id,
            }
        },
    )

    await log_audit(
        current_user,
        "TENANT_ONBOARDING_APPROVED",
        "tenant_onboarding",
        f"Permohonan {str(doc.get('_id'))} diluluskan sebagai tenant {tenant_code}",
    )

    return {
        "success": True,
        "status": REQUEST_STATUS_APPROVED,
        "tenant": _serialize_tenant(tenant_doc),
        "admin_user_id": admin_user_id,
        "temporary_password": temporary_password,
        "registration_url": f"/register?tenant_code={tenant_code}",
        "notes": provision_notes,
    }


@router.get("/api/tenants")
async def list_tenants(
    status: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
):
    _assert_roles(current_user, STAFF_ROLES)
    db = get_db()
    query: Dict[str, Any] = {}
    if status:
        query["status"] = _normalize_code(status, fallback="")
    if search:
        regex = {"$regex": _normalize_text(search), "$options": "i"}
        query["$or"] = [
            {"institution_name": regex},
            {"tenant_code": regex},
            {"contact_person_email": regex},
        ]

    total = await db.tenants.count_documents(query)
    skip = (page - 1) * limit
    rows = await db.tenants.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {
        "items": [_serialize_tenant(row) for row in rows],
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": max(1, (total + limit - 1) // limit),
        },
    }


@router.get("/api/tenants/{tenant_id}")
async def get_tenant_detail(
    tenant_id: str,
    current_user: dict = Depends(get_current_user),
):
    _assert_roles(current_user, STAFF_ROLES)
    db = get_db()
    tenant = await db.tenants.find_one({"_id": _id_value(tenant_id)})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant tidak dijumpai")
    module_doc = await db.tenant_module_settings.find_one({"tenant_id": str(tenant.get("_id", ""))})
    return {
        "tenant": _serialize_tenant(tenant),
        "modules": (module_doc or {}).get("modules", _safe_copy_modules()),
    }


@router.get("/api/tenants/{tenant_id}/modules")
async def get_tenant_modules(
    tenant_id: str,
    current_user: dict = Depends(get_current_user),
):
    _assert_roles(current_user, STAFF_ROLES)
    db = get_db()
    tenant = await db.tenants.find_one({"_id": _id_value(tenant_id)})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant tidak dijumpai")
    module_doc = await db.tenant_module_settings.find_one({"tenant_id": str(tenant.get("_id", ""))})
    modules = (module_doc or {}).get("modules", _safe_copy_modules())
    return {"tenant_id": str(tenant.get("_id", "")), "tenant_code": tenant.get("tenant_code", ""), "modules": modules}


@router.post("/api/tenants/{tenant_id}/modules")
async def update_tenant_modules(
    tenant_id: str,
    body: TenantModulesUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    _assert_roles(current_user, SUPERADMIN_ONLY, detail="Hanya superadmin boleh kemaskini modul tenant")
    db = get_db()
    tenant = await db.tenants.find_one({"_id": _id_value(tenant_id)})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant tidak dijumpai")

    sanitized_modules = _sanitize_review_modules(body.modules)
    if not any(value.get("enabled") for value in sanitized_modules.values()):
        raise HTTPException(status_code=400, detail="Sekurang-kurangnya satu modul perlu aktif")

    now = _iso_now()
    await db.tenant_module_settings.update_one(
        {"tenant_id": str(tenant.get("_id", ""))},
        {
            "$set": {
                "tenant_id": str(tenant.get("_id", "")),
                "tenant_code": tenant.get("tenant_code", ""),
                "modules": sanitized_modules,
                "updated_at": now,
                "updated_by": str(current_user.get("_id", "")),
                "updated_by_name": current_user.get("full_name", ""),
            }
        },
        upsert=True,
    )
    await log_audit(
        current_user,
        "TENANT_MODULES_UPDATED",
        "tenant_onboarding",
        f"Kemaskini modul tenant {tenant.get('tenant_code', '')}",
    )
    return {"success": True, "modules": sanitized_modules}
