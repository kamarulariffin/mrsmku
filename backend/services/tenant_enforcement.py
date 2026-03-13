from __future__ import annotations

import os
from typing import Any, Dict, Optional

from fastapi import HTTPException


_STRICT_TRUE = {"1", "true", "yes", "on", "strict", "enabled"}
_STRICT_FALSE = {"0", "false", "no", "off", "disabled"}
_STRICT_MODES = {"strict", "enforced", "hard"}


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _as_bool(value: Any, default: bool = False) -> bool:
    text = _as_text(value).lower()
    if not text:
        return default
    if text in _STRICT_TRUE:
        return True
    if text in _STRICT_FALSE:
        return False
    return default


def tenant_enforcement_mode() -> str:
    return _as_text(os.environ.get("TENANT_ENFORCEMENT_MODE", "transitional")).lower() or "transitional"


def is_tenant_strict_mode() -> bool:
    override_raw = os.environ.get("TENANT_STRICT_MODE")
    if override_raw is not None and _as_text(override_raw):
        return _as_bool(override_raw, default=False)
    return tenant_enforcement_mode() in _STRICT_MODES


def tenant_enforcement_snapshot() -> Dict[str, Any]:
    mode = tenant_enforcement_mode()
    strict_override = _as_text(os.environ.get("TENANT_STRICT_MODE"))
    return {
        "mode": mode,
        "strict_mode": is_tenant_strict_mode(),
        "strict_override": strict_override or None,
    }


def _user_role(user: Optional[Dict[str, Any]]) -> str:
    return _as_text((user or {}).get("role")).lower()


def _tenant_id(user: Optional[Dict[str, Any]]) -> str:
    return _as_text((user or {}).get("tenant_id"))


def _tenant_code(user: Optional[Dict[str, Any]]) -> str:
    return _as_text((user or {}).get("tenant_code"))


def require_user_tenant_context(
    user: Optional[Dict[str, Any]],
    *,
    detail: str = "Tenant context diperlukan. Sila hubungi pentadbir institusi.",
) -> None:
    if _user_role(user) == "superadmin":
        return
    if _tenant_id(user):
        return
    if is_tenant_strict_mode():
        raise HTTPException(status_code=403, detail=detail)


def tenant_scope_query(
    current_user: Dict[str, Any],
    *,
    detail: str = "Tenant context diperlukan untuk operasi ini.",
) -> Dict[str, Any]:
    if _user_role(current_user) == "superadmin":
        return {}
    tenant_id = _tenant_id(current_user)
    if tenant_id:
        return {"tenant_id": tenant_id}
    require_user_tenant_context(current_user, detail=detail)
    return {}


def assert_tenant_doc_access(
    current_user: Dict[str, Any],
    doc: Optional[Dict[str, Any]],
    resource_name: str,
) -> None:
    if not doc:
        return
    if _user_role(current_user) == "superadmin":
        return
    tenant_id = _tenant_id(current_user)
    if not tenant_id:
        require_user_tenant_context(
            current_user,
            detail=f"Tenant context diperlukan untuk akses {resource_name}",
        )
        return

    doc_tenant_id = _as_text(doc.get("tenant_id"))
    if doc_tenant_id and doc_tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail=f"Akses tenant ditolak untuk {resource_name}")
    if is_tenant_strict_mode() and not doc_tenant_id:
        raise HTTPException(
            status_code=403,
            detail=(
                f"Rekod {resource_name} belum mempunyai tenant_id. "
                "Lengkapkan backfill tenant sebelum strict mode penuh."
            ),
        )


def stamp_tenant_fields(
    doc: Dict[str, Any],
    current_user: Dict[str, Any],
    *,
    fallback_doc: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    tenant_id = _tenant_id(current_user)
    tenant_code = _tenant_code(current_user)

    if not tenant_id and fallback_doc:
        tenant_id = _as_text(fallback_doc.get("tenant_id"))
        tenant_code = tenant_code or _as_text(fallback_doc.get("tenant_code"))

    if tenant_id:
        doc["tenant_id"] = tenant_id
        if tenant_code:
            doc["tenant_code"] = tenant_code
        return doc

    if _user_role(current_user) != "superadmin" and is_tenant_strict_mode():
        raise HTTPException(
            status_code=403,
            detail="Tidak boleh menulis data tanpa tenant_id dalam strict tenant mode.",
        )
    return doc
