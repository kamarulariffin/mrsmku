"""
Bank statement upload + auto reconciliation flow.
Mesra pengguna (admin, bendahari, sub_bendahari) dengan audit trail.
"""

from __future__ import annotations

import csv
import hashlib
import io
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from services.id_normalizer import object_id_or_none

router = APIRouter(prefix="/api/accounting-full/bank-reconciliation", tags=["Bank Reconciliation"])
security = HTTPBearer(auto_error=False)

UPLOAD_DIR = os.environ.get(
    "UPLOAD_DIR",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads")),
)
BANK_STATEMENT_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "bank_statements")

MAX_FILE_SIZE = 15 * 1024 * 1024  # 15MB
ALLOWED_EXTENSIONS = {"csv", "pdf"}

STATEMENT_STATUS_UPLOADED = "uploaded"
STATEMENT_STATUS_IN_REVIEW = "in_review"
STATEMENT_STATUS_READY_FOR_APPROVAL = "ready_for_approval"
STATEMENT_STATUS_APPROVED = "approved"
STATEMENT_STATUS_REJECTED = "rejected"

ITEM_STATUS_UNMATCHED = "unmatched"
ITEM_STATUS_NEEDS_REVIEW = "needs_review"
ITEM_STATUS_AUTO_MATCHED = "auto_matched"
ITEM_STATUS_MANUAL_MATCHED = "manual_matched"
ITEM_STATUS_EXCEPTION = "exception"

RESOLVED_STATUSES = {ITEM_STATUS_AUTO_MATCHED, ITEM_STATUS_MANUAL_MATCHED, ITEM_STATUS_EXCEPTION}
UNRESOLVED_STATUSES = {ITEM_STATUS_UNMATCHED, ITEM_STATUS_NEEDS_REVIEW}

OPERATOR_ROLES = {"superadmin", "admin", "bendahari", "sub_bendahari"}
VIEW_ROLES = OPERATOR_ROLES | {"juruaudit"}
ALERT_RECIPIENT_ROLES = {"admin", "bendahari", "sub_bendahari"}
ALERT_RECIPIENT_ROLE_LABEL = {
    "admin": "Admin",
    "bendahari": "Bendahari",
    "sub_bendahari": "Sub Bendahari",
}
ALERT_ROLE_ACTION_LABEL = {
    "admin": "Buka Dashboard Reconciliation",
    "bendahari": "Semak & Keputusan Reconciliation",
    "sub_bendahari": "Semak Item Reconciliation",
}
ALERT_ROLE_GUIDANCE = {
    "admin": (
        "Pantau status semasa, pastikan agihan tugasan jelas, dan eskalasi isu kritikal dengan segera."
    ),
    "bendahari": (
        "Semak bukti semasa, pastikan kawalan maker-checker dipatuhi, dan buat keputusan akhir bila sesuai."
    ),
    "sub_bendahari": (
        "Lengkapkan semakan item unresolved/remark dan kemas kini tindakan sebelum hantar untuk kelulusan."
    ),
}
RISK_ALERT_COOLDOWN_MINUTES = max(
    10,
    int(os.environ.get("BANK_RECON_ALERT_COOLDOWN_MINUTES", "240") or 240),
)

_get_db_func = None
_get_current_user_func = None
_log_audit_func = None


def init_router(get_db_func, current_user_dep, permission_dep, audit_func):
    global _get_db_func, _get_current_user_func, _log_audit_func
    _get_db_func = get_db_func
    _get_current_user_func = current_user_dep
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


def _id_value(value: Any) -> Any:
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


def _check_operator_access(user: dict):
    if user.get("role") not in OPERATOR_ROLES:
        raise HTTPException(status_code=403, detail="Akses hanya untuk admin/bendahari/sub_bendahari")


def _check_view_access(user: dict):
    if user.get("role") not in VIEW_ROLES:
        raise HTTPException(status_code=403, detail="Akses ditolak")


def _as_float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return default


def _parse_iso_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    text = str(value or "").strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed
    except Exception:
        return None


def _days_to_period_end(period_end: Any) -> Optional[int]:
    text = _parse_date_text(period_end)
    if not text:
        return None
    try:
        due = datetime.strptime(text, "%Y-%m-%d").date()
    except Exception:
        return None
    today = datetime.now(timezone.utc).date()
    return (due - today).days


def _bucket_unresolved(value: int) -> str:
    if value <= 0:
        return "0"
    if value <= 5:
        return "1_5"
    if value <= 20:
        return "6_20"
    return "21_plus"


def _bucket_overdue(days_to_due: Optional[int]) -> str:
    if days_to_due is None:
        return "na"
    if days_to_due >= 0:
        if days_to_due <= 1:
            return "due_1"
        if days_to_due <= 3:
            return "due_3"
        if days_to_due <= 7:
            return "due_7"
        return "due_later"
    overdue_days = abs(days_to_due)
    if overdue_days <= 3:
        return "overdue_1_3"
    if overdue_days <= 7:
        return "overdue_4_7"
    return "overdue_8_plus"


def _build_statement_risk_alert(statement: Dict[str, Any]) -> Dict[str, Any]:
    summary = statement.get("summary") or {}
    status = str(statement.get("status") or "")
    unresolved_items = _as_int(summary.get("unresolved_items"), 0)
    difference_abs = abs(_as_float(summary.get("difference")))
    parser_warning_count = len(statement.get("parser_warnings") or [])
    days_to_due = _days_to_period_end(statement.get("period_end"))
    is_overdue = days_to_due is not None and days_to_due < 0

    score = 0.0
    reasons: List[str] = []

    if status == STATEMENT_STATUS_REJECTED:
        score += 45.0
        reasons.append("Statement ditolak dan perlu semakan semula.")
    elif status == STATEMENT_STATUS_READY_FOR_APPROVAL:
        score += 42.0
        reasons.append("Statement menunggu tindakan checker.")
    elif status == STATEMENT_STATUS_IN_REVIEW:
        score += 30.0
        reasons.append("Statement masih dalam semakan.")
    elif status == STATEMENT_STATUS_UPLOADED:
        score += 24.0
        reasons.append("Statement baru dimuat naik.")
    elif status == STATEMENT_STATUS_APPROVED:
        score = max(score - 20.0, 0.0)

    if unresolved_items > 0:
        score += min(36.0, unresolved_items * 2.5)
        reasons.append(f"{unresolved_items} item unresolved.")
    if difference_abs > 0.01:
        score += 38.0
        reasons.append(f"Difference masih RM {difference_abs:,.2f}.")
    if parser_warning_count > 0:
        score += min(18.0, parser_warning_count * 6.0)
        reasons.append(f"{parser_warning_count} parser warning.")

    if days_to_due is not None:
        if days_to_due < 0:
            overdue_days = abs(days_to_due)
            score += min(35.0, 20.0 + overdue_days * 2.0)
            reasons.append(f"Period end overdue {overdue_days} hari.")
        elif days_to_due <= 3:
            score += 20.0
            reasons.append("Tempoh hampir tamat (<=3 hari).")
        elif days_to_due <= 7:
            score += 12.0

    score = round(max(0.0, min(100.0, score)))
    level = "low"
    if score >= 85:
        level = "critical"
    elif score >= 65:
        level = "high"
    elif score >= 40:
        level = "medium"

    should_notify = level == "critical" or is_overdue
    signature = "|".join(
        [
            status or "-",
            "overdue" if is_overdue else "not_overdue",
            "diff" if difference_abs > 0.01 else "diff_ok",
            _bucket_unresolved(unresolved_items),
            f"parser_{min(parser_warning_count, 5)}",
            _bucket_overdue(days_to_due),
            level,
        ]
    )

    if is_overdue:
        title = "Amaran Reconciliation Overdue"
    elif level == "critical" and difference_abs > 0.01:
        title = "Amaran Reconciliation Kritikal"
    elif level == "critical" and unresolved_items > 0:
        title = "Amaran Backlog Reconciliation Kritikal"
    else:
        title = "Amaran Risiko Reconciliation"

    bank_name = _normalize_text(statement.get("bank_account_name")) or "Akaun Bank"
    period_start = _normalize_text(statement.get("period_start"))
    period_end = _normalize_text(statement.get("period_end"))
    period_label = f"{period_start} hingga {period_end}" if period_start and period_end else "-"
    reason_preview = "; ".join(reasons[:2]) if reasons else "Tiada amaran kritikal."

    message = (
        f"{bank_name} ({period_label}) memerlukan tindakan segera. "
        f"{reason_preview}"
    )

    return {
        "should_notify": should_notify,
        "level": level,
        "signature": signature,
        "status": status,
        "days_to_due": days_to_due,
        "is_overdue": is_overdue,
        "title": title,
        "message": message,
        "critical_reasons": reasons[:3],
        "metrics": {
            "unresolved_items": unresolved_items,
            "difference": round(_as_float(summary.get("difference")), 2),
            "parser_warning_count": parser_warning_count,
            "priority_score": score,
            "priority_level": level,
        },
    }


def _compose_role_specific_alert_copy(
    statement: Dict[str, Any],
    risk: Dict[str, Any],
    recipient_role: str,
) -> Dict[str, Any]:
    role_key = str(recipient_role or "").strip().lower()
    role_label = ALERT_RECIPIENT_ROLE_LABEL.get(role_key, "Operator Kewangan")
    role_guidance = ALERT_ROLE_GUIDANCE.get(
        role_key,
        "Semak status statement ini dan lengkapkan tindakan susulan mengikut SOP peranan.",
    )
    action_label = ALERT_ROLE_ACTION_LABEL.get(role_key, "Buka Reconciliation")

    bank_name = _normalize_text(statement.get("bank_account_name")) or "Akaun bank"
    period_start = _normalize_text(statement.get("period_start"))
    period_end = _normalize_text(statement.get("period_end"))
    period_label = f"{period_start} hingga {period_end}" if period_start and period_end else "tempoh tidak dinyatakan"

    risk_title = _normalize_text(risk.get("title")) or "Amaran Rekonsiliasi Bank"
    if role_key == "admin":
        title = f"{risk_title} (Pemantauan Admin)"
    elif role_key == "bendahari":
        title = f"{risk_title} (Tindakan Bendahari)"
    elif role_key == "sub_bendahari":
        title = f"{risk_title} (Tindakan Sub Bendahari)"
    else:
        title = risk_title

    reasons = risk.get("critical_reasons") or []
    reason_preview = "; ".join([str(x) for x in reasons[:2] if str(x).strip()])
    if reason_preview:
        message = (
            f"{bank_name} ({period_label}) memerlukan tindakan {role_label.lower()}. "
            f"{role_guidance} Risiko utama: {reason_preview}"
        )
    else:
        message = (
            f"{bank_name} ({period_label}) memerlukan tindakan {role_label.lower()}. "
            f"{role_guidance}"
        )

    return {
        "title": title,
        "message": message,
        "action_label": action_label,
        "recipient_role": role_key,
        "recipient_role_label": role_label,
        "role_guidance": role_guidance,
    }


async def _dispatch_role_alert_notifications(
    db,
    statement_id: str,
    *,
    trigger: str,
    actor_user: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    statement = await db.bank_reconciliation_statements.find_one(
        {"_id": _id_value(statement_id), "is_deleted": {"$ne": True}}
    )
    if not statement:
        return {"sent": 0, "reason": "statement_not_found"}

    risk = _build_statement_risk_alert(statement)
    if not risk.get("should_notify"):
        return {"sent": 0, "reason": "no_critical_or_overdue"}

    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()
    notif_state = statement.get("risk_notification_state") or {}
    last_signature = _normalize_text(notif_state.get("last_signature"))
    last_sent_at = _parse_iso_datetime(notif_state.get("last_sent_at"))
    current_signature = _normalize_text(risk.get("signature"))
    is_same_signature = bool(last_signature) and last_signature == current_signature

    if is_same_signature and last_sent_at:
        delta_minutes = (now_dt - last_sent_at).total_seconds() / 60.0
        if delta_minutes < RISK_ALERT_COOLDOWN_MINUTES:
            return {
                "sent": 0,
                "reason": "cooldown_active",
                "cooldown_minutes_left": int(max(0, RISK_ALERT_COOLDOWN_MINUTES - delta_minutes)),
            }

    recipients = await db.users.find(
        {
            "role": {"$in": sorted(ALERT_RECIPIENT_ROLES)},
            "is_active": {"$ne": False},
        }
    ).to_list(500)
    recipient_rows: List[Dict[str, Any]] = []
    seen_recipient = set()
    for user_doc in recipients:
        uid = user_doc.get("_id")
        role_value = str(user_doc.get("role") or "").strip().lower()
        uid_str = str(uid) if uid is not None else ""
        if not uid_str or uid_str in seen_recipient:
            continue
        seen_recipient.add(uid_str)
        recipient_rows.append({"id": uid, "role": role_value})

    sent_count = 0
    action_url = "/admin/accounting/bank-reconciliation"
    for recipient in recipient_rows:
        recipient_id = recipient.get("id")
        recipient_role = str(recipient.get("role") or "").strip().lower()
        role_copy = _compose_role_specific_alert_copy(statement, risk, recipient_role)
        notif_doc = {
            "user_id": _id_value(recipient_id),
            "type": "bank_reconciliation_alert",
            "title": role_copy.get("title"),
            "message": role_copy.get("message"),
            "category": "bank_reconciliation",
            "priority": "high",
            "is_read": False,
            "read_at": None,
            "action_url": action_url,
            "action_label": role_copy.get("action_label"),
            "metadata": {
                "source": "bank_reconciliation_risk_alert",
                "statement_id": str(statement.get("_id")),
                "bank_account_id": statement.get("bank_account_id"),
                "bank_account_name": statement.get("bank_account_name"),
                "period_start": statement.get("period_start"),
                "period_end": statement.get("period_end"),
                "status": risk.get("status"),
                "risk_level": risk.get("level"),
                "risk_signature": risk.get("signature"),
                "risk_reasons": risk.get("critical_reasons", []),
                "days_to_due": risk.get("days_to_due"),
                "metrics": risk.get("metrics", {}),
                "trigger": trigger,
                "recipient_role": role_copy.get("recipient_role"),
                "recipient_role_label": role_copy.get("recipient_role_label"),
                "role_guidance": role_copy.get("role_guidance"),
            },
            "sender_id": _id_value(actor_user.get("_id")) if actor_user else None,
            "sender_name": actor_user.get("full_name") if actor_user else "Sistem",
            "sender_role": actor_user.get("role") if actor_user else "system",
            "created_at": now_dt,
        }
        try:
            await db.notifications.insert_one(notif_doc)
            sent_count += 1
        except Exception:
            continue

    await db.bank_reconciliation_statements.update_one(
        {"_id": _id_value(statement_id)},
        {
            "$set": {
                "risk_notification_state": {
                    "last_signature": risk.get("signature"),
                    "last_level": risk.get("level"),
                    "last_trigger": trigger,
                    "last_sent_at": now_iso,
                    "last_sent_count": sent_count,
                    "last_reasons": risk.get("critical_reasons", []),
                }
            }
        },
    )
    return {"sent": sent_count, "reason": "sent", "signature": risk.get("signature")}


def _normalize_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_header(value: str) -> str:
    x = str(value or "").strip().lower()
    x = x.replace("_", " ")
    x = re.sub(r"\s+", " ", x)
    return x


def _safe_filename(value: str) -> str:
    base = os.path.basename(value or "statement")
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", base).strip("._")
    return cleaned or "statement"


def _parse_date_text(value: Any) -> Optional[str]:
    text = str(value or "").strip()
    if not text:
        return None
    fmt_list = (
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%d/%m/%y",
        "%d-%m-%y",
        "%m/%d/%Y",
        "%m-%d-%Y",
    )
    for fmt in fmt_list:
        try:
            dt = datetime.strptime(text[:10], fmt)
            return dt.strftime("%Y-%m-%d")
        except Exception:
            continue
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return None


def _parse_money(value: Any) -> float:
    text = str(value or "").strip()
    if not text:
        return 0.0
    text = text.replace("RM", "").replace("rm", "").replace(" ", "")
    text = text.replace(",", "")
    dr = text.upper().endswith("DR")
    cr = text.upper().endswith("CR")
    text = re.sub(r"(DR|CR)$", "", text, flags=re.IGNORECASE)
    if text in {"", "-", "."}:
        return 0.0
    try:
        val = float(text)
    except Exception:
        return 0.0
    if dr and val > 0:
        return -val
    if cr and val < 0:
        return abs(val)
    return val


def _find_col(headers: List[str], aliases: List[str]) -> Optional[str]:
    mapped = {_normalize_header(h): h for h in headers}
    for alias in aliases:
        if alias in mapped:
            return mapped[alias]
    return None


def _normalize_delimiter(value: Any) -> Optional[str]:
    raw = str(value or "").strip()
    if not raw:
        return None
    if raw in {"\\t", "tab", "TAB"}:
        return "\t"
    if raw in {",", ";", "|"}:
        return raw
    return None


def _resolve_col(headers: List[str], preferred_col: Optional[str], aliases: List[str]) -> Optional[str]:
    preferred = _normalize_text(preferred_col)
    if preferred:
        preferred_norm = _normalize_header(preferred)
        for header in headers:
            if _normalize_header(header) == preferred_norm:
                return header
    return _find_col(headers, aliases)


def _model_dump(data: Any) -> Dict[str, Any]:
    if data is None:
        return {}
    if hasattr(data, "model_dump"):
        return data.model_dump()
    if hasattr(data, "dict"):
        return data.dict()
    if isinstance(data, dict):
        return dict(data)
    return {}


def _extract_reference(text: str) -> Optional[str]:
    src = _normalize_text(text)
    if not src:
        return None
    direct = re.search(r"(?:ref|trx|txn|id|rujukan|no)\s*[:#-]?\s*([A-Za-z0-9\-\/]{4,})", src, flags=re.IGNORECASE)
    if direct:
        return direct.group(1)[:64]
    token_candidates = re.findall(r"[A-Za-z0-9\-\/]{6,}", src)
    if token_candidates:
        return token_candidates[0][:64]
    return None


def _parse_csv_statement(content: bytes, parser_profile: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    text = ""
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text = content.decode(enc)
            break
        except Exception:
            continue
    if not text:
        raise HTTPException(status_code=400, detail="Fail CSV tidak dapat dibaca")

    mapping = {}
    profile_name = None
    if isinstance(parser_profile, dict):
        mapping = parser_profile.get("mapping") or {}
        profile_name = _normalize_text(parser_profile.get("profile_name")) or None

    sample = text[:2048]
    delimiter = _normalize_delimiter(mapping.get("delimiter"))
    if not delimiter:
        delimiter = ","
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
            delimiter = dialect.delimiter
        except Exception:
            pass

    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    headers = list(reader.fieldnames or [])
    if not headers:
        raise HTTPException(status_code=400, detail="CSV tiada header")

    date_col = _resolve_col(
        headers,
        mapping.get("date_column"),
        ["date", "tarikh", "transaction date", "posting date", "txn date"],
    )
    desc_col = _resolve_col(
        headers,
        mapping.get("description_column"),
        ["description", "butiran", "narration", "details", "keterangan"],
    )
    ref_col = _resolve_col(
        headers,
        mapping.get("reference_column"),
        ["reference", "ref", "no rujukan", "rujukan", "transaction id", "trx id"],
    )
    debit_col = _resolve_col(
        headers,
        mapping.get("debit_column"),
        ["debit", "withdrawal", "keluar", "amount out"],
    )
    credit_col = _resolve_col(
        headers,
        mapping.get("credit_column"),
        ["credit", "deposit", "masuk", "amount in"],
    )
    amount_col = _resolve_col(
        headers,
        mapping.get("amount_column"),
        ["amount", "amaun", "jumlah", "transaction amount"],
    )
    balance_col = _resolve_col(
        headers,
        mapping.get("balance_column"),
        ["balance", "baki", "running balance"],
    )

    if not date_col:
        if profile_name:
            raise HTTPException(
                status_code=400,
                detail=f"CSV profile '{profile_name}' tidak dapat cari kolum tarikh/date",
            )
        raise HTTPException(status_code=400, detail="CSV mesti ada kolum tarikh/date")

    warnings: List[str] = []
    if profile_name:
        if mapping.get("description_column") and not desc_col:
            warnings.append("Kolum description dari profile tidak dijumpai, fallback auto digunakan.")
        if mapping.get("reference_column") and not ref_col:
            warnings.append("Kolum reference dari profile tidak dijumpai, fallback auto digunakan.")
        if mapping.get("debit_column") and not debit_col:
            warnings.append("Kolum debit dari profile tidak dijumpai, fallback auto digunakan.")
        if mapping.get("credit_column") and not credit_col:
            warnings.append("Kolum credit dari profile tidak dijumpai, fallback auto digunakan.")
        if mapping.get("amount_column") and not amount_col:
            warnings.append("Kolum amount dari profile tidak dijumpai, fallback auto digunakan.")
        if mapping.get("balance_column") and not balance_col:
            warnings.append("Kolum balance dari profile tidak dijumpai, fallback auto digunakan.")

    parsed: List[Dict[str, Any]] = []
    line_no = 0
    for row in reader:
        line_no += 1
        tx_date = _parse_date_text(row.get(date_col))
        if not tx_date:
            continue
        desc = _normalize_text(row.get(desc_col)) if desc_col else ""
        ref = _normalize_text(row.get(ref_col)) if ref_col else ""
        debit = abs(_parse_money(row.get(debit_col))) if debit_col else 0.0
        credit = abs(_parse_money(row.get(credit_col))) if credit_col else 0.0
        if not debit_col and not credit_col and amount_col:
            amount_any = _parse_money(row.get(amount_col))
            if amount_any < 0:
                debit = abs(amount_any)
                credit = 0.0
            else:
                credit = abs(amount_any)
                debit = 0.0
        amount = round(credit - debit, 2)
        if abs(amount) <= 0:
            continue
        balance = None
        if balance_col:
            balance_raw = row.get(balance_col)
            if str(balance_raw or "").strip():
                balance = round(_parse_money(balance_raw), 2)
        parsed.append(
            {
                "line_no": line_no,
                "transaction_date": tx_date,
                "description": desc[:500],
                "reference_number": (ref or _extract_reference(desc) or "")[:64],
                "debit": round(debit, 2),
                "credit": round(credit, 2),
                "amount": amount,
                "balance": balance,
                "raw_preview": str(row)[:500],
            }
        )
    if not parsed:
        raise HTTPException(status_code=400, detail="Tiada baris transaksi yang sah dijumpai dalam CSV")
    return {"lines": parsed, "parser_type": "csv", "warnings": warnings}


def _parse_pdf_statement(content: bytes) -> Dict[str, Any]:
    try:
        from pypdf import PdfReader  # type: ignore
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "Parser PDF tidak tersedia pada server. "
                "Sila upload CSV atau pasang pakej pypdf."
            ),
        ) from exc

    try:
        reader = PdfReader(io.BytesIO(content))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="PDF tidak dapat dibaca") from exc

    text_chunks: List[str] = []
    for page in reader.pages:
        try:
            text_chunks.append(page.extract_text() or "")
        except Exception:
            continue
    text = "\n".join(text_chunks)
    if not text.strip():
        raise HTTPException(status_code=400, detail="PDF tiada teks yang boleh diproses")

    parsed: List[Dict[str, Any]] = []
    line_no = 0
    for raw_line in text.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if not line:
            continue
        m = re.match(r"^(?P<date>\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(?P<rest>.+)$", line)
        if not m:
            continue
        tx_date = _parse_date_text(m.group("date"))
        if not tx_date:
            continue
        rest = m.group("rest")
        nums = re.findall(r"-?\d[\d,]*(?:\.\d{1,2})?(?:CR|DR)?", rest, flags=re.IGNORECASE)
        if not nums:
            continue
        debit = 0.0
        credit = 0.0
        balance = None
        tail_tokens: List[str] = []
        if len(nums) >= 3:
            debit = abs(_parse_money(nums[-3]))
            credit = abs(_parse_money(nums[-2]))
            balance = round(_parse_money(nums[-1]), 2)
            tail_tokens = [nums[-3], nums[-2], nums[-1]]
        elif len(nums) == 2:
            amt = _parse_money(nums[-2])
            balance = round(_parse_money(nums[-1]), 2)
            lower_rest = rest.lower()
            if "dr" in nums[-2].lower() or "debit" in lower_rest or "keluar" in lower_rest:
                debit = abs(amt)
            elif "cr" in nums[-2].lower() or "credit" in lower_rest or "masuk" in lower_rest:
                credit = abs(amt)
            elif amt < 0:
                debit = abs(amt)
            else:
                credit = abs(amt)
            tail_tokens = [nums[-2], nums[-1]]
        else:
            amt = _parse_money(nums[-1])
            if "dr" in nums[-1].lower() or amt < 0:
                debit = abs(amt)
            else:
                credit = abs(amt)
            tail_tokens = [nums[-1]]

        amount = round(credit - debit, 2)
        if abs(amount) <= 0:
            continue
        tail = " ".join(tail_tokens).strip()
        desc = rest
        if tail and tail in rest:
            desc = rest.rsplit(tail, 1)[0].strip()
        if not desc:
            desc = "Bank statement line"
        line_no += 1
        parsed.append(
            {
                "line_no": line_no,
                "transaction_date": tx_date,
                "description": desc[:500],
                "reference_number": (_extract_reference(desc) or "")[:64],
                "debit": round(debit, 2),
                "credit": round(credit, 2),
                "amount": amount,
                "balance": balance,
                "raw_preview": line[:500],
            }
        )
    if not parsed:
        raise HTTPException(
            status_code=400,
            detail=(
                "Format PDF belum dapat dikenal pasti untuk auto-parse. "
                "Sila guna CSV atau semak format statement."
            ),
        )
    return {"lines": parsed, "parser_type": "pdf", "warnings": []}


def _extract_statement_lines(
    ext: str,
    content: bytes,
    parser_profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if ext == "csv":
        return _parse_csv_statement(content, parser_profile=parser_profile)
    if ext == "pdf":
        return _parse_pdf_statement(content)
    raise HTTPException(status_code=400, detail="Jenis fail tidak disokong")


def _date_distance_days(a: str, b: str) -> int:
    try:
        da = datetime.strptime(a, "%Y-%m-%d").date()
        db = datetime.strptime(b, "%Y-%m-%d").date()
        return abs((da - db).days)
    except Exception:
        return 9999


def _tokenize_desc(text: str) -> set[str]:
    norm = re.sub(r"[^a-z0-9\s]", " ", _normalize_text(text).lower())
    tokens = [t for t in norm.split() if len(t) >= 3]
    return set(tokens)


def _desc_similarity(a: str, b: str) -> float:
    ta = _tokenize_desc(a)
    tb = _tokenize_desc(b)
    if not ta or not tb:
        return 0.0
    inter = len(ta & tb)
    uni = len(ta | tb)
    if uni <= 0:
        return 0.0
    return inter / uni


def _score_candidate(item: Dict[str, Any], tx: Dict[str, Any], *, amount_tolerance: float, date_tolerance_days: int) -> float:
    item_amount = round(_as_float(item.get("amount")), 2)
    tx_amount = round(_as_float(tx.get("_signed_amount")), 2)
    amount_delta = abs(item_amount - tx_amount)
    if amount_delta > max(amount_tolerance, 0.01):
        return 0.0

    score = 60.0
    days_delta = _date_distance_days(str(item.get("transaction_date", "")), str(tx.get("transaction_date", "")))
    if days_delta <= 1:
        score += 25.0
    elif days_delta <= date_tolerance_days:
        score += 15.0
    elif days_delta <= max(7, date_tolerance_days + 2):
        score += 8.0

    item_ref = _normalize_text(item.get("reference_number")).lower()
    tx_ref = _normalize_text(tx.get("reference_number")).lower()
    if item_ref and tx_ref and (item_ref in tx_ref or tx_ref in item_ref):
        score += 20.0

    similarity = _desc_similarity(str(item.get("description", "")), str(tx.get("description", "")))
    score += min(15.0, similarity * 15.0)
    return min(100.0, round(score, 2))


def _clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def _build_ai_assist_payload(statement: Dict[str, Any], items: List[Dict[str, Any]]) -> Dict[str, Any]:
    total_items = len(items)
    needs_review_items = [row for row in items if row.get("status") == ITEM_STATUS_NEEDS_REVIEW]
    unresolved_items = [row for row in items if row.get("status") in UNRESOLVED_STATUSES]
    auto_matched_items = [row for row in items if row.get("status") == ITEM_STATUS_AUTO_MATCHED]
    manual_matched_items = [row for row in items if row.get("status") == ITEM_STATUS_MANUAL_MATCHED]
    unmatched_items = [row for row in items if row.get("status") == ITEM_STATUS_UNMATCHED]

    parser_warning_count = len(statement.get("parser_warnings") or [])
    unresolved_ratio = (len(unresolved_items) / total_items) if total_items > 0 else 0.0
    needs_review_ratio = (len(needs_review_items) / total_items) if total_items > 0 else 0.0
    auto_match_ratio = (len(auto_matched_items) / total_items) if total_items > 0 else 0.0
    manual_match_ratio = (len(manual_matched_items) / total_items) if total_items > 0 else 0.0

    avg_review_score = 0.0
    if needs_review_items:
        avg_review_score = sum(_as_float(row.get("match_score")) for row in needs_review_items) / len(
            needs_review_items
        )
    high_conf_review_count = len(
        [row for row in needs_review_items if _as_float(row.get("match_score")) >= 85.0]
    )
    medium_conf_review_count = len(
        [row for row in needs_review_items if 70.0 <= _as_float(row.get("match_score")) < 85.0]
    )
    near_match_unmatched_count = len(
        [row for row in unmatched_items if _as_float(row.get("match_score")) >= 60.0]
    )

    summary = statement.get("summary") or {}
    difference_abs = abs(_as_float(summary.get("difference")))
    can_submit = bool(summary.get("can_submit"))

    suggested_date_tolerance = 3
    suggested_amount_tolerance = 0.01
    suggested_min_conf_suggest = 70.0
    suggested_min_conf_auto = 95.0
    recommendation_notes: List[str] = []

    if parser_warning_count > 0:
        suggested_date_tolerance = 4
        suggested_min_conf_auto = 96.0
        suggested_min_conf_suggest = 75.0
        recommendation_notes.append(
            "Parser warning dikesan, AI kekalkan threshold lebih konservatif untuk elak false match."
        )

    if unresolved_ratio >= 0.45:
        suggested_min_conf_suggest = min(suggested_min_conf_suggest, 68.0)
        suggested_date_tolerance = max(suggested_date_tolerance, 4)
        recommendation_notes.append(
            "Kadar unresolved tinggi, AI perluaskan liputan suggestion untuk percepat semakan operator."
        )

    if avg_review_score >= 82.0 and high_conf_review_count >= 3 and parser_warning_count == 0:
        suggested_min_conf_auto = min(suggested_min_conf_auto, 92.0)
        recommendation_notes.append(
            "Banyak item review skor tinggi, AI syor auto threshold lebih agresif secara terkawal."
        )

    if near_match_unmatched_count >= 5:
        suggested_amount_tolerance = max(suggested_amount_tolerance, 0.02)
        recommendation_notes.append(
            "Terdapat banyak near-match pada item unmatched, AI syor amount tolerance sedikit lebih luas."
        )

    if difference_abs > 0.01:
        suggested_min_conf_auto = max(suggested_min_conf_auto, 95.0)
        recommendation_notes.append(
            "Difference masih tidak sifar, AI kunci auto threshold tinggi sehingga beza diselesaikan."
        )

    if manual_match_ratio > auto_match_ratio * 1.5 and total_items >= 10:
        recommendation_notes.append(
            "Manual match dominan. Semak profil CSV dan guna Auto-Match AI untuk kurangkan ralat manusia."
        )

    suggested_date_tolerance = int(_clamp(float(suggested_date_tolerance), 0, 14))
    suggested_amount_tolerance = round(_clamp(float(suggested_amount_tolerance), 0.0, 10.0), 2)
    suggested_min_conf_suggest = round(_clamp(float(suggested_min_conf_suggest), 0.0, 100.0), 1)
    suggested_min_conf_auto = round(
        _clamp(max(suggested_min_conf_auto, suggested_min_conf_suggest + 8.0), 0.0, 100.0), 1
    )

    estimated_auto_next_run = min(
        len(unresolved_items),
        high_conf_review_count + max(0, int(medium_conf_review_count * 0.4)),
    )
    estimated_review_reduction_pct = (
        round((estimated_auto_next_run / len(unresolved_items)) * 100.0, 1)
        if unresolved_items
        else 0.0
    )

    readiness_score = 100.0
    readiness_score -= unresolved_ratio * 50.0
    readiness_score -= parser_warning_count * 7.0
    readiness_score -= 15.0 if difference_abs > 0.01 else 0.0
    readiness_score += auto_match_ratio * 12.0
    readiness_score -= 8.0 if not can_submit else 0.0
    readiness_score = round(_clamp(readiness_score, 0.0, 100.0), 1)

    risk_flags: List[Dict[str, Any]] = []
    if parser_warning_count > 0:
        risk_flags.append(
            {
                "level": "medium",
                "title": "Kualiti parser perlu semakan",
                "detail": f"{parser_warning_count} parser warning boleh menurunkan ketepatan auto-match.",
            }
        )
    if difference_abs > 0.01:
        risk_flags.append(
            {
                "level": "high",
                "title": "Difference belum sifar",
                "detail": f"Difference semasa RM {difference_abs:,.2f}. Lengkapkan review sebelum submit.",
            }
        )
    if unresolved_ratio >= 0.35:
        risk_flags.append(
            {
                "level": "high",
                "title": "Kadar unresolved tinggi",
                "detail": f"{len(unresolved_items)} daripada {total_items} item masih unresolved.",
            }
        )
    if manual_match_ratio > auto_match_ratio * 1.5 and total_items >= 10:
        risk_flags.append(
            {
                "level": "medium",
                "title": "Manual match dominan",
                "detail": "Automasi rendah boleh meningkatkan risiko ralat manusia dan beban kerja bendahari.",
            }
        )

    if not recommendation_notes:
        recommendation_notes.append(
            "Data statement kelihatan stabil. Teruskan Auto-Match dengan konfigurasi AI semasa."
        )

    return {
        "statement_id": str(statement.get("_id")),
        "engine": "AI Smart Reconcile v1 (scoring + risk model)",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "readiness_score": readiness_score,
        "recommended_config": {
            "date_tolerance_days": suggested_date_tolerance,
            "amount_tolerance": suggested_amount_tolerance,
            "min_confidence_for_suggestion": suggested_min_conf_suggest,
            "min_confidence_for_auto": suggested_min_conf_auto,
        },
        "metrics": {
            "total_items": total_items,
            "unresolved_items": len(unresolved_items),
            "needs_review_items": len(needs_review_items),
            "auto_matched_items": len(auto_matched_items),
            "manual_matched_items": len(manual_matched_items),
            "unresolved_ratio": round(unresolved_ratio * 100.0, 1),
            "average_review_score": round(avg_review_score, 1),
            "high_confidence_review_items": high_conf_review_count,
        },
        "automation_projection": {
            "estimated_auto_match_next_run": int(estimated_auto_next_run),
            "estimated_review_reduction_pct": estimated_review_reduction_pct,
        },
        "risk_flags": risk_flags,
        "recommendations": recommendation_notes[:6],
    }


def _serialize_statement(doc: Dict[str, Any]) -> Dict[str, Any]:
    out = {
        "id": str(doc.get("_id")),
        "bank_account_id": doc.get("bank_account_id"),
        "bank_account_name": doc.get("bank_account_name"),
        "period_start": doc.get("period_start"),
        "period_end": doc.get("period_end"),
        "status": doc.get("status", STATEMENT_STATUS_UPLOADED),
        "file_name": doc.get("file_name"),
        "original_file_name": doc.get("original_file_name"),
        "file_size": doc.get("file_size", 0),
        "file_hash": doc.get("file_hash"),
        "statement_remark": doc.get("statement_remark"),
        "parser_type": doc.get("parser_type"),
        "parser_warnings": doc.get("parser_warnings", []),
        "parser_profile_id": doc.get("parser_profile_id"),
        "parser_profile_name": doc.get("parser_profile_name"),
        "summary": doc.get("summary", {}),
        "submitted_by_name": doc.get("submitted_by_name"),
        "submitted_at": doc.get("submitted_at"),
        "approved_by_name": doc.get("approved_by_name"),
        "approved_at": doc.get("approved_at"),
        "rejected_by_name": doc.get("rejected_by_name"),
        "rejected_at": doc.get("rejected_at"),
        "rejected_reason": doc.get("rejected_reason"),
        "created_by_name": doc.get("created_by_name"),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }
    return out


def _serialize_csv_profile(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(doc.get("_id")),
        "profile_name": doc.get("profile_name"),
        "bank_name": doc.get("bank_name"),
        "mapping": doc.get("mapping", {}),
        "notes": doc.get("notes"),
        "is_active": bool(doc.get("is_active", True)),
        "created_by_name": doc.get("created_by_name"),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


def _serialize_item(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(doc.get("_id")),
        "statement_id": doc.get("statement_id"),
        "line_no": doc.get("line_no"),
        "transaction_date": doc.get("transaction_date"),
        "description": doc.get("description"),
        "reference_number": doc.get("reference_number"),
        "debit": round(_as_float(doc.get("debit")), 2),
        "credit": round(_as_float(doc.get("credit")), 2),
        "amount": round(_as_float(doc.get("amount")), 2),
        "balance": doc.get("balance"),
        "status": doc.get("status", ITEM_STATUS_UNMATCHED),
        "matched_transaction_id": doc.get("matched_transaction_id"),
        "suggested_transaction_id": doc.get("suggested_transaction_id"),
        "match_score": round(_as_float(doc.get("match_score")), 2),
        "remarks": doc.get("remarks", []),
        "updated_at": doc.get("updated_at"),
    }


async def _get_statement_or_404(db, statement_id: str) -> Dict[str, Any]:
    doc = await db.bank_reconciliation_statements.find_one({"_id": _id_value(statement_id)})
    if not doc or doc.get("is_deleted"):
        raise HTTPException(status_code=404, detail="Statement tidak dijumpai")
    return doc


async def _get_item_or_404(db, statement_id: str, item_id: str) -> Dict[str, Any]:
    doc = await db.bank_reconciliation_items.find_one(
        {"_id": _id_value(item_id), "statement_id": statement_id, "is_deleted": {"$ne": True}}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Item statement tidak dijumpai")
    return doc


async def _recalculate_statement_summary(db, statement_id: str) -> Dict[str, Any]:
    statement = await _get_statement_or_404(db, statement_id)
    items = await db.bank_reconciliation_items.find(
        {"statement_id": statement_id, "is_deleted": {"$ne": True}}
    ).sort("line_no", 1).to_list(20000)

    total_items = len(items)
    matched_items = 0
    unresolved_items = 0
    exception_items = 0

    bank_total_net = 0.0
    resolved_total_net = 0.0
    auto_matched_items = 0
    manual_matched_items = 0
    needs_review_items = 0

    for row in items:
        amount = round(_as_float(row.get("amount")), 2)
        bank_total_net += amount
        status = row.get("status", ITEM_STATUS_UNMATCHED)
        if status in RESOLVED_STATUSES:
            resolved_total_net += amount
            if status in {ITEM_STATUS_AUTO_MATCHED, ITEM_STATUS_MANUAL_MATCHED}:
                matched_items += 1
            if status == ITEM_STATUS_AUTO_MATCHED:
                auto_matched_items += 1
            elif status == ITEM_STATUS_MANUAL_MATCHED:
                manual_matched_items += 1
            elif status == ITEM_STATUS_EXCEPTION:
                exception_items += 1
        else:
            unresolved_items += 1
            if status == ITEM_STATUS_NEEDS_REVIEW:
                needs_review_items += 1

    opening_balance = statement.get("opening_balance")
    closing_balance = statement.get("closing_balance")
    statement_net = bank_total_net
    if opening_balance is not None and closing_balance is not None:
        statement_net = round(_as_float(closing_balance) - _as_float(opening_balance), 2)

    difference = round(statement_net - resolved_total_net, 2)
    summary = {
        "total_items": total_items,
        "matched_items": matched_items,
        "auto_matched_items": auto_matched_items,
        "manual_matched_items": manual_matched_items,
        "exception_items": exception_items,
        "needs_review_items": needs_review_items,
        "unresolved_items": unresolved_items,
        "bank_total_net": round(bank_total_net, 2),
        "statement_net": round(statement_net, 2),
        "resolved_total_net": round(resolved_total_net, 2),
        "difference": difference,
        "can_submit": unresolved_items == 0 and abs(difference) <= 0.01,
    }

    await db.bank_reconciliation_statements.update_one(
        {"_id": _id_value(statement_id)},
        {"$set": {"summary": summary, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return summary


class AutoMatchRequest(BaseModel):
    date_tolerance_days: int = Field(default=3, ge=0, le=14)
    min_confidence_for_suggestion: float = Field(default=70.0, ge=0, le=100)
    min_confidence_for_auto: float = Field(default=95.0, ge=0, le=100)
    amount_tolerance: float = Field(default=0.01, ge=0, le=10)


class ManualMatchRequest(BaseModel):
    action: str = Field(..., pattern="^(match|unmatch|exception)$")
    transaction_id: Optional[str] = None
    remark_text: str = Field(..., min_length=3, max_length=500)
    remark_category: Optional[str] = Field(default=None, max_length=64)


class ItemRemarkRequest(BaseModel):
    remark_text: str = Field(..., min_length=3, max_length=500)
    remark_category: Optional[str] = Field(default=None, max_length=64)


class ItemAdjustRequest(BaseModel):
    transaction_date: Optional[str] = None
    description: Optional[str] = Field(default=None, max_length=500)
    reference_number: Optional[str] = Field(default=None, max_length=64)
    debit: Optional[float] = Field(default=None, ge=0)
    credit: Optional[float] = Field(default=None, ge=0)
    balance: Optional[float] = None
    adjustment_remark: str = Field(..., min_length=3, max_length=500)
    remark_category: Optional[str] = Field(default=None, max_length=64)


class SubmitStatementRequest(BaseModel):
    statement_remark: Optional[str] = Field(default=None, max_length=500)


class CsvProfileMappingRequest(BaseModel):
    date_column: str = Field(..., min_length=1, max_length=120)
    description_column: Optional[str] = Field(default=None, max_length=120)
    reference_column: Optional[str] = Field(default=None, max_length=120)
    debit_column: Optional[str] = Field(default=None, max_length=120)
    credit_column: Optional[str] = Field(default=None, max_length=120)
    amount_column: Optional[str] = Field(default=None, max_length=120)
    balance_column: Optional[str] = Field(default=None, max_length=120)
    delimiter: Optional[str] = Field(default=None, max_length=8)


class CsvProfileCreateRequest(BaseModel):
    profile_name: str = Field(..., min_length=2, max_length=120)
    bank_name: Optional[str] = Field(default=None, max_length=120)
    notes: Optional[str] = Field(default=None, max_length=500)
    is_active: bool = True
    mapping: CsvProfileMappingRequest


class CsvProfileUpdateRequest(BaseModel):
    profile_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    bank_name: Optional[str] = Field(default=None, max_length=120)
    notes: Optional[str] = Field(default=None, max_length=500)
    is_active: Optional[bool] = None
    mapping: Optional[CsvProfileMappingRequest] = None


class ApproveStatementRequest(BaseModel):
    approval_remark: Optional[str] = Field(default=None, max_length=500)


class RejectStatementRequest(BaseModel):
    reject_reason: str = Field(..., min_length=3, max_length=500)


class BulkItemActionRequest(BaseModel):
    action: str = Field(..., pattern="^(apply_suggested|exception|unmatch)$")
    item_ids: List[str]
    remark_text: str = Field(..., min_length=3, max_length=500)
    remark_category: Optional[str] = Field(default=None, max_length=64)


@router.get("/profiles")
async def list_csv_profiles(
    include_inactive: bool = Query(False),
    user: dict = Depends(get_current_user),
):
    db = get_db()
    _check_view_access(user)

    query: Dict[str, Any] = {"is_deleted": {"$ne": True}}
    if not include_inactive:
        query["is_active"] = True
    rows = await db.bank_reconciliation_profiles.find(query).sort("updated_at", -1).to_list(500)
    return {"profiles": [_serialize_csv_profile(row) for row in rows]}


@router.post("/profiles")
async def create_csv_profile(
    data: CsvProfileCreateRequest,
    user: dict = Depends(get_current_user),
):
    db = get_db()
    _check_operator_access(user)

    profile_name = data.profile_name.strip()
    duplicate = await db.bank_reconciliation_profiles.find_one(
        {"profile_name_lower": profile_name.lower(), "is_deleted": {"$ne": True}}
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="Nama profile CSV sudah wujud")

    mapping = _model_dump(data.mapping)
    delimiter = _normalize_delimiter(mapping.get("delimiter"))
    if mapping.get("delimiter") and not delimiter:
        raise HTTPException(status_code=400, detail="Delimiter profile hanya sokong ',', ';', '|', atau '\\t'")
    mapping["delimiter"] = delimiter

    now_iso = datetime.now(timezone.utc).isoformat()
    insert_doc = {
        "profile_name": profile_name,
        "profile_name_lower": profile_name.lower(),
        "bank_name": _normalize_text(data.bank_name) or None,
        "notes": _normalize_text(data.notes) or None,
        "is_active": bool(data.is_active),
        "mapping": mapping,
        "created_by": user.get("_id"),
        "created_by_name": user.get("full_name", ""),
        "created_by_role": user.get("role", ""),
        "created_at": now_iso,
        "updated_at": now_iso,
        "is_deleted": False,
    }
    result = await db.bank_reconciliation_profiles.insert_one(insert_doc)
    created = await db.bank_reconciliation_profiles.find_one({"_id": result.inserted_id})
    await log_audit(
        user,
        "CREATE_BANK_RECONCILE_CSV_PROFILE",
        "accounting",
        f"Cipta CSV profile '{profile_name}'",
    )
    return {
        "message": "CSV profile berjaya dicipta",
        "profile": _serialize_csv_profile(created or {"_id": result.inserted_id, **insert_doc}),
    }


@router.put("/profiles/{profile_id}")
async def update_csv_profile(
    profile_id: str,
    data: CsvProfileUpdateRequest,
    user: dict = Depends(get_current_user),
):
    db = get_db()
    _check_operator_access(user)

    existing = await db.bank_reconciliation_profiles.find_one(
        {"_id": _id_value(profile_id), "is_deleted": {"$ne": True}}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="CSV profile tidak dijumpai")

    updates: Dict[str, Any] = {}
    if data.profile_name is not None:
        name = data.profile_name.strip()
        duplicate = await db.bank_reconciliation_profiles.find_one(
            {
                "profile_name_lower": name.lower(),
                "_id": {"$ne": _id_value(profile_id)},
                "is_deleted": {"$ne": True},
            }
        )
        if duplicate:
            raise HTTPException(status_code=409, detail="Nama profile CSV sudah wujud")
        updates["profile_name"] = name
        updates["profile_name_lower"] = name.lower()
    if data.bank_name is not None:
        updates["bank_name"] = _normalize_text(data.bank_name) or None
    if data.notes is not None:
        updates["notes"] = _normalize_text(data.notes) or None
    if data.is_active is not None:
        updates["is_active"] = bool(data.is_active)
    if data.mapping is not None:
        mapping = _model_dump(data.mapping)
        delimiter = _normalize_delimiter(mapping.get("delimiter"))
        if mapping.get("delimiter") and not delimiter:
            raise HTTPException(status_code=400, detail="Delimiter profile hanya sokong ',', ';', '|', atau '\\t'")
        mapping["delimiter"] = delimiter
        updates["mapping"] = mapping

    if not updates:
        raise HTTPException(status_code=400, detail="Tiada perubahan untuk dikemaskini")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.bank_reconciliation_profiles.update_one(
        {"_id": _id_value(profile_id)},
        {"$set": updates},
    )
    updated = await db.bank_reconciliation_profiles.find_one({"_id": _id_value(profile_id)})
    await log_audit(
        user,
        "UPDATE_BANK_RECONCILE_CSV_PROFILE",
        "accounting",
        f"Kemaskini CSV profile '{existing.get('profile_name', profile_id)}'",
    )
    return {
        "message": "CSV profile berjaya dikemaskini",
        "profile": _serialize_csv_profile(updated or existing),
    }


@router.post("/statements/upload")
async def upload_bank_statement(
    bank_account_id: str = Form(...),
    period_start: str = Form(...),
    period_end: str = Form(...),
    opening_balance: Optional[float] = Form(None),
    closing_balance: Optional[float] = Form(None),
    statement_remark: Optional[str] = Form(None),
    parser_profile_id: Optional[str] = Form(None),
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    db = get_db()
    _check_operator_access(user)

    start_date = _parse_date_text(period_start)
    end_date = _parse_date_text(period_end)
    if not start_date or not end_date:
        raise HTTPException(status_code=400, detail="Period start/end tidak sah (YYYY-MM-DD)")
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="Period start mesti lebih awal dari period end")

    bank_acc = await db.bank_accounts.find_one({"_id": _id_value(bank_account_id)})
    if not bank_acc:
        raise HTTPException(status_code=404, detail="Akaun bank tidak dijumpai")

    original_name = file.filename or "statement"
    ext = original_name.rsplit(".", 1)[-1].lower() if "." in original_name else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Format fail tidak disokong. Guna CSV atau PDF")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Fail kosong")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Saiz fail melebihi 15MB")

    file_hash = hashlib.sha256(content).hexdigest()
    duplicate = await db.bank_reconciliation_statements.find_one(
        {
            "bank_account_id": bank_account_id,
            "file_hash": file_hash,
            "is_deleted": {"$ne": True},
        }
    )
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail=f"Statement duplicate dikesan (statement_id={duplicate.get('_id')})",
        )

    parser_profile_doc = None
    if parser_profile_id:
        parser_profile_doc = await db.bank_reconciliation_profiles.find_one(
            {
                "_id": _id_value(parser_profile_id),
                "is_deleted": {"$ne": True},
                "is_active": True,
            }
        )
        if not parser_profile_doc:
            raise HTTPException(status_code=404, detail="CSV profile mapping tidak dijumpai/aktif")

    parsed = _extract_statement_lines(ext, content, parser_profile=parser_profile_doc)
    parser_warnings = list(parsed.get("warnings", []))
    if parser_profile_doc and ext != "csv":
        parser_warnings.append("CSV profile diabaikan kerana fail upload bukan CSV.")
    lines = parsed.get("lines", [])
    now_iso = datetime.now(timezone.utc).isoformat()
    token = uuid.uuid4().hex[:12]
    safe_name = _safe_filename(original_name)
    save_name = f"{token}_{safe_name}"
    save_path = os.path.join(BANK_STATEMENT_UPLOAD_DIR, save_name)
    os.makedirs(BANK_STATEMENT_UPLOAD_DIR, exist_ok=True)
    with open(save_path, "wb") as f:
        f.write(content)

    statement_doc = {
        "bank_account_id": bank_account_id,
        "bank_account_name": bank_acc.get("name", ""),
        "period_start": start_date,
        "period_end": end_date,
        "status": STATEMENT_STATUS_UPLOADED,
        "file_name": save_name,
        "original_file_name": original_name,
        "file_ext": ext,
        "file_size": len(content),
        "file_hash": file_hash,
        "file_path": save_path,
        "statement_remark": _normalize_text(statement_remark) or None,
        "opening_balance": opening_balance,
        "closing_balance": closing_balance,
        "parser_type": parsed.get("parser_type"),
        "parser_warnings": parser_warnings,
        "parser_profile_id": str(parser_profile_doc.get("_id")) if parser_profile_doc else None,
        "parser_profile_name": parser_profile_doc.get("profile_name") if parser_profile_doc else None,
        "created_at": now_iso,
        "updated_at": now_iso,
        "created_by": user.get("_id"),
        "created_by_name": user.get("full_name", ""),
        "created_by_role": user.get("role", ""),
        "is_deleted": False,
    }
    insert_result = await db.bank_reconciliation_statements.insert_one(statement_doc)
    statement_id = str(insert_result.inserted_id)

    item_docs = []
    for row in lines:
        item_docs.append(
            {
                "statement_id": statement_id,
                "line_no": row.get("line_no"),
                "transaction_date": row.get("transaction_date"),
                "description": row.get("description", ""),
                "reference_number": row.get("reference_number"),
                "debit": row.get("debit", 0.0),
                "credit": row.get("credit", 0.0),
                "amount": row.get("amount", 0.0),
                "balance": row.get("balance"),
                "raw_preview": row.get("raw_preview"),
                "status": ITEM_STATUS_UNMATCHED,
                "match_score": 0.0,
                "matched_transaction_id": None,
                "suggested_transaction_id": None,
                "remarks": [],
                "created_at": now_iso,
                "updated_at": now_iso,
                "is_deleted": False,
            }
        )
    if item_docs:
        await db.bank_reconciliation_items.insert_many(item_docs)

    summary = await _recalculate_statement_summary(db, statement_id)
    role_alert_dispatch = {"sent": 0, "reason": "not_attempted"}
    try:
        role_alert_dispatch = await _dispatch_role_alert_notifications(
            db,
            statement_id,
            trigger="upload_statement",
            actor_user=user,
        )
    except Exception:
        role_alert_dispatch = {"sent": 0, "reason": "dispatch_failed"}
    await log_audit(
        user,
        "UPLOAD_BANK_STATEMENT",
        "accounting",
        f"Upload statement {original_name} ({len(item_docs)} transaksi) untuk akaun {bank_acc.get('name', '-')}",
    )
    return {
        "statement_id": statement_id,
        "status": STATEMENT_STATUS_UPLOADED,
        "message": "Statement berjaya dimuat naik",
        "parsed_transactions": len(item_docs),
        "summary": summary,
        "role_alert_notifications": role_alert_dispatch,
    }


@router.get("/statements")
async def list_bank_reconciliation_statements(
    bank_account_id: Optional[str] = None,
    status: Optional[str] = None,
    period_start: Optional[str] = None,
    period_end: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
):
    db = get_db()
    _check_view_access(user)

    query: Dict[str, Any] = {"is_deleted": {"$ne": True}}
    if bank_account_id:
        query["bank_account_id"] = bank_account_id
    if status:
        query["status"] = status
    if period_start:
        start = _parse_date_text(period_start)
        if start:
            query["period_start"] = {"$gte": start}
    if period_end:
        end = _parse_date_text(period_end)
        if end:
            if "period_end" in query and isinstance(query["period_end"], dict):
                query["period_end"]["$lte"] = end
            else:
                query["period_end"] = {"$lte": end}

    total = await db.bank_reconciliation_statements.count_documents(query)
    skip = (page - 1) * limit
    rows = await db.bank_reconciliation_statements.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {
        "statements": [_serialize_statement(row) for row in rows],
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": (total + limit - 1) // limit,
        },
    }


@router.get("/statements/{statement_id}")
async def get_bank_reconciliation_statement(
    statement_id: str,
    user: dict = Depends(get_current_user),
):
    db = get_db()
    _check_view_access(user)
    doc = await _get_statement_or_404(db, statement_id)
    if not doc.get("summary"):
        summary = await _recalculate_statement_summary(db, statement_id)
        doc["summary"] = summary
    return _serialize_statement(doc)


@router.get("/{statement_id}/ai-assist")
async def get_ai_assist_for_statement(
    statement_id: str,
    user: dict = Depends(get_current_user),
):
    db = get_db()
    _check_view_access(user)
    statement = await _get_statement_or_404(db, statement_id)
    items = await db.bank_reconciliation_items.find(
        {"statement_id": statement_id, "is_deleted": {"$ne": True}}
    ).to_list(20000)
    payload = _build_ai_assist_payload(statement, items)
    await log_audit(
        user,
        "VIEW_BANK_RECONCILIATION_AI_ASSIST",
        "accounting",
        f"Lihat AI assist bank reconciliation untuk statement {statement_id}",
    )
    return payload


@router.get("/statements/files/{filename}")
async def download_bank_statement_file(
    filename: str,
    user: dict = Depends(get_current_user),
):
    _check_view_access(user)
    safe_name = _safe_filename(filename)
    path = os.path.join(BANK_STATEMENT_UPLOAD_DIR, safe_name)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Fail statement tidak dijumpai")
    ext = safe_name.rsplit(".", 1)[-1].lower() if "." in safe_name else ""
    media = "application/pdf" if ext == "pdf" else "text/csv"
    return FileResponse(path=path, media_type=media, filename=safe_name)


@router.post("/{statement_id}/auto-match")
async def run_auto_match(
    statement_id: str,
    config: AutoMatchRequest,
    user: dict = Depends(get_current_user),
):
    db = get_db()
    _check_operator_access(user)

    statement = await _get_statement_or_404(db, statement_id)
    if statement.get("status") == STATEMENT_STATUS_APPROVED:
        raise HTTPException(status_code=400, detail="Statement yang sudah approved tidak boleh diubah")

    bank_account_id = statement.get("bank_account_id")
    if not bank_account_id:
        raise HTTPException(status_code=400, detail="Statement tiada bank_account_id")

    period_start = _parse_date_text(statement.get("period_start"))
    period_end = _parse_date_text(statement.get("period_end"))
    if not period_start or not period_end:
        raise HTTPException(status_code=400, detail="Period statement tidak sah")

    start_dt = datetime.strptime(period_start, "%Y-%m-%d").date() - timedelta(days=config.date_tolerance_days)
    end_dt = datetime.strptime(period_end, "%Y-%m-%d").date() + timedelta(days=config.date_tolerance_days)
    search_start = start_dt.strftime("%Y-%m-%d")
    search_end = end_dt.strftime("%Y-%m-%d")

    tx_rows = await db.accounting_transactions.find(
        {
            "bank_account_id": bank_account_id,
            "status": {"$in": ["pending", "verified"]},
            "is_deleted": {"$ne": True},
            "transaction_date": {"$gte": search_start, "$lte": search_end},
        }
    ).to_list(10000)
    for tx in tx_rows:
        amount = _as_float(tx.get("amount"))
        tx["_signed_amount"] = round(amount if tx.get("type") == "income" else -amount, 2)
        tx["_id_str"] = str(tx.get("_id"))

    existing_items = await db.bank_reconciliation_items.find(
        {"statement_id": statement_id, "is_deleted": {"$ne": True}}
    ).sort("line_no", 1).to_list(20000)

    used_transactions = {
        str(x.get("matched_transaction_id"))
        for x in existing_items
        if x.get("status") in {ITEM_STATUS_AUTO_MATCHED, ITEM_STATUS_MANUAL_MATCHED}
        and x.get("matched_transaction_id")
    }

    auto_count = 0
    suggest_count = 0
    unmatched_count = 0

    for item in existing_items:
        if item.get("status") == ITEM_STATUS_MANUAL_MATCHED:
            continue
        if item.get("status") == ITEM_STATUS_EXCEPTION:
            continue

        best_tx = None
        best_score = 0.0
        for tx in tx_rows:
            tx_id = tx.get("_id_str")
            if tx_id in used_transactions:
                continue
            score = _score_candidate(
                item,
                tx,
                amount_tolerance=config.amount_tolerance,
                date_tolerance_days=config.date_tolerance_days,
            )
            if score > best_score:
                best_score = score
                best_tx = tx

        now_iso = datetime.now(timezone.utc).isoformat()
        if best_tx and best_score >= config.min_confidence_for_auto:
            tx_id = str(best_tx.get("_id_str"))
            used_transactions.add(tx_id)
            await db.bank_reconciliation_items.update_one(
                {"_id": item["_id"]},
                {"$set": {
                    "status": ITEM_STATUS_AUTO_MATCHED,
                    "matched_transaction_id": tx_id,
                    "suggested_transaction_id": None,
                    "match_score": round(best_score, 2),
                    "updated_at": now_iso,
                    "last_auto_match_at": now_iso,
                }},
            )
            auto_count += 1
        elif best_tx and best_score >= config.min_confidence_for_suggestion:
            await db.bank_reconciliation_items.update_one(
                {"_id": item["_id"]},
                {"$set": {
                    "status": ITEM_STATUS_NEEDS_REVIEW,
                    "matched_transaction_id": None,
                    "suggested_transaction_id": str(best_tx.get("_id_str")),
                    "match_score": round(best_score, 2),
                    "updated_at": now_iso,
                    "last_auto_match_at": now_iso,
                }},
            )
            suggest_count += 1
        else:
            await db.bank_reconciliation_items.update_one(
                {"_id": item["_id"]},
                {"$set": {
                    "status": ITEM_STATUS_UNMATCHED,
                    "matched_transaction_id": None,
                    "suggested_transaction_id": None,
                    "match_score": 0.0,
                    "updated_at": now_iso,
                    "last_auto_match_at": now_iso,
                }},
            )
            unmatched_count += 1

    await db.bank_reconciliation_statements.update_one(
        {"_id": _id_value(statement_id)},
        {"$set": {"status": STATEMENT_STATUS_IN_REVIEW, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    summary = await _recalculate_statement_summary(db, statement_id)
    role_alert_dispatch = {"sent": 0, "reason": "not_attempted"}
    try:
        role_alert_dispatch = await _dispatch_role_alert_notifications(
            db,
            statement_id,
            trigger="auto_match",
            actor_user=user,
        )
    except Exception:
        role_alert_dispatch = {"sent": 0, "reason": "dispatch_failed"}
    await log_audit(
        user,
        "AUTO_MATCH_BANK_STATEMENT",
        "accounting",
        f"Auto-match statement {statement_id}: auto={auto_count}, suggest={suggest_count}, unmatched={unmatched_count}",
    )
    return {
        "statement_id": statement_id,
        "auto_matched": auto_count,
        "needs_review": suggest_count,
        "unmatched": unmatched_count,
        "summary": summary,
        "role_alert_notifications": role_alert_dispatch,
    }


@router.get("/{statement_id}/items")
async def list_statement_items(
    statement_id: str,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    user: dict = Depends(get_current_user),
):
    db = get_db()
    _check_view_access(user)
    await _get_statement_or_404(db, statement_id)

    query: Dict[str, Any] = {"statement_id": statement_id, "is_deleted": {"$ne": True}}
    if status:
        query["status"] = status

    total = await db.bank_reconciliation_items.count_documents(query)
    skip = (page - 1) * limit
    rows = await db.bank_reconciliation_items.find(query).sort("line_no", 1).skip(skip).limit(limit).to_list(limit)
    return {
        "items": [_serialize_item(row) for row in rows],
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": (total + limit - 1) // limit,
        },
    }


@router.post("/{statement_id}/bulk-action")
async def bulk_apply_items_action(
    statement_id: str,
    data: BulkItemActionRequest,
    user: dict = Depends(get_current_user),
):
    db = get_db()
    _check_operator_access(user)
    statement = await _get_statement_or_404(db, statement_id)
    if statement.get("status") == STATEMENT_STATUS_APPROVED:
        raise HTTPException(status_code=400, detail="Statement yang sudah approved tidak boleh diubah")

    item_ids: List[str] = []
    seen = set()
    for raw in data.item_ids or []:
        sid = _normalize_text(raw)
        if not sid or sid in seen:
            continue
        seen.add(sid)
        item_ids.append(sid)
    if not item_ids:
        raise HTTPException(status_code=400, detail="item_ids diperlukan untuk bulk action")
    if len(item_ids) > 500:
        raise HTTPException(status_code=400, detail="Maksimum 500 item per bulk action")

    item_rows = await db.bank_reconciliation_items.find(
        {
            "_id": {"$in": [_id_value(x) for x in item_ids]},
            "statement_id": statement_id,
            "is_deleted": {"$ne": True},
        }
    ).to_list(1000)
    row_map = {str(row.get("_id")): row for row in item_rows}

    now_iso = datetime.now(timezone.utc).isoformat()
    action = data.action.strip().lower()
    updated_count = 0
    skipped_count = 0
    skipped_no_suggestion = 0
    tx_cache: Dict[str, Any] = {}

    for item_id in item_ids:
        item = row_map.get(item_id)
        if not item:
            skipped_count += 1
            continue

        update_data: Dict[str, Any] = {"updated_at": now_iso}
        remark_action = "bulk_action"
        if action == "apply_suggested":
            suggested_id = _normalize_text(item.get("suggested_transaction_id"))
            if not suggested_id:
                skipped_count += 1
                skipped_no_suggestion += 1
                continue

            tx = tx_cache.get(suggested_id)
            if tx is None:
                tx = await db.accounting_transactions.find_one(
                    {
                        "_id": _id_value(suggested_id),
                        "bank_account_id": statement.get("bank_account_id"),
                        "is_deleted": {"$ne": True},
                    }
                )
                tx_cache[suggested_id] = tx
            if not tx:
                skipped_count += 1
                continue

            update_data.update(
                {
                    "status": ITEM_STATUS_MANUAL_MATCHED,
                    "matched_transaction_id": str(tx.get("_id")),
                    "suggested_transaction_id": None,
                    "match_score": max(95.0, _as_float(item.get("match_score"))),
                    "matched_by": user.get("_id"),
                    "matched_by_name": user.get("full_name", ""),
                    "matched_at": now_iso,
                }
            )
            remark_action = "bulk_apply_suggested"
        elif action == "exception":
            update_data.update(
                {
                    "status": ITEM_STATUS_EXCEPTION,
                    "matched_transaction_id": None,
                    "suggested_transaction_id": None,
                    "match_score": 0.0,
                }
            )
            remark_action = "bulk_exception"
        else:  # action == "unmatch"
            update_data.update(
                {
                    "status": ITEM_STATUS_UNMATCHED,
                    "matched_transaction_id": None,
                    "suggested_transaction_id": None,
                    "match_score": 0.0,
                }
            )
            remark_action = "bulk_unmatch"

        remark_doc = {
            "action": remark_action,
            "remark_text": data.remark_text.strip(),
            "remark_category": _normalize_text(data.remark_category) or None,
            "bulk": True,
            "created_by": user.get("_id"),
            "created_by_name": user.get("full_name", ""),
            "created_by_role": user.get("role", ""),
            "created_at": now_iso,
        }
        await db.bank_reconciliation_items.update_one(
            {"_id": item.get("_id")},
            {"$set": update_data, "$push": {"remarks": remark_doc}},
        )
        updated_count += 1

    if updated_count <= 0:
        raise HTTPException(
            status_code=400,
            detail="Tiada item berjaya dikemaskini (semak item dipilih / cadangan match)",
        )

    await db.bank_reconciliation_statements.update_one(
        {"_id": _id_value(statement_id)},
        {"$set": {"status": STATEMENT_STATUS_IN_REVIEW, "updated_at": now_iso}},
    )
    summary = await _recalculate_statement_summary(db, statement_id)
    role_alert_dispatch = {"sent": 0, "reason": "not_attempted"}
    try:
        role_alert_dispatch = await _dispatch_role_alert_notifications(
            db,
            statement_id,
            trigger=f"bulk_action:{action}",
            actor_user=user,
        )
    except Exception:
        role_alert_dispatch = {"sent": 0, "reason": "dispatch_failed"}
    await log_audit(
        user,
        "BULK_ACTION_BANK_RECONCILIATION_ITEMS",
        "accounting",
        (
            f"statement={statement_id} action={action} updated={updated_count} "
            f"skipped={skipped_count} no_suggested={skipped_no_suggestion}"
        ),
    )
    return {
        "message": "Bulk action berjaya diproses",
        "updated_items": updated_count,
        "skipped_items": skipped_count,
        "skipped_no_suggestion": skipped_no_suggestion,
        "summary": summary,
        "role_alert_notifications": role_alert_dispatch,
    }


@router.post("/{statement_id}/items/{item_id}/manual-match")
async def manual_match_item(
    statement_id: str,
    item_id: str,
    data: ManualMatchRequest,
    user: dict = Depends(get_current_user),
):
    db = get_db()
    _check_operator_access(user)

    statement = await _get_statement_or_404(db, statement_id)
    if statement.get("status") == STATEMENT_STATUS_APPROVED:
        raise HTTPException(status_code=400, detail="Statement yang sudah approved tidak boleh diubah")
    item = await _get_item_or_404(db, statement_id, item_id)

    now_iso = datetime.now(timezone.utc).isoformat()
    action = data.action.strip().lower()
    updates: Dict[str, Any] = {"updated_at": now_iso}

    if action == "match":
        if not data.transaction_id:
            raise HTTPException(status_code=400, detail="transaction_id wajib untuk action=match")
        tx = await db.accounting_transactions.find_one(
            {
                "_id": _id_value(data.transaction_id),
                "bank_account_id": statement.get("bank_account_id"),
                "is_deleted": {"$ne": True},
            }
        )
        if not tx:
            raise HTTPException(status_code=404, detail="Transaksi sistem untuk manual match tidak dijumpai")
        updates.update(
            {
                "status": ITEM_STATUS_MANUAL_MATCHED,
                "matched_transaction_id": str(tx["_id"]),
                "suggested_transaction_id": None,
                "match_score": 100.0,
                "matched_by": user.get("_id"),
                "matched_by_name": user.get("full_name", ""),
                "matched_at": now_iso,
            }
        )
    elif action == "unmatch":
        updates.update(
            {
                "status": ITEM_STATUS_UNMATCHED,
                "matched_transaction_id": None,
                "suggested_transaction_id": None,
                "match_score": 0.0,
            }
        )
    elif action == "exception":
        updates.update(
            {
                "status": ITEM_STATUS_EXCEPTION,
                "matched_transaction_id": None,
                "suggested_transaction_id": None,
                "match_score": 0.0,
            }
        )
    else:
        raise HTTPException(status_code=400, detail="Action tidak sah")

    remark_doc = {
        "action": action,
        "remark_text": data.remark_text.strip(),
        "remark_category": _normalize_text(data.remark_category) or None,
        "created_by": user.get("_id"),
        "created_by_name": user.get("full_name", ""),
        "created_by_role": user.get("role", ""),
        "created_at": now_iso,
    }
    await db.bank_reconciliation_items.update_one(
        {"_id": item["_id"]},
        {"$set": updates, "$push": {"remarks": remark_doc}},
    )
    summary = await _recalculate_statement_summary(db, statement_id)
    role_alert_dispatch = {"sent": 0, "reason": "not_attempted"}
    try:
        role_alert_dispatch = await _dispatch_role_alert_notifications(
            db,
            statement_id,
            trigger=f"manual_action:{action}",
            actor_user=user,
        )
    except Exception:
        role_alert_dispatch = {"sent": 0, "reason": "dispatch_failed"}
    return {
        "message": "Tindakan manual berjaya disimpan",
        "summary": summary,
        "role_alert_notifications": role_alert_dispatch,
    }


@router.post("/{statement_id}/items/{item_id}/remark")
async def add_item_remark(
    statement_id: str,
    item_id: str,
    data: ItemRemarkRequest,
    user: dict = Depends(get_current_user),
):
    db = get_db()
    _check_operator_access(user)
    statement = await _get_statement_or_404(db, statement_id)
    if statement.get("status") == STATEMENT_STATUS_APPROVED:
        raise HTTPException(status_code=400, detail="Statement yang sudah approved tidak boleh diubah")
    item = await _get_item_or_404(db, statement_id, item_id)

    now_iso = datetime.now(timezone.utc).isoformat()
    remark_doc = {
        "action": "remark",
        "remark_text": data.remark_text.strip(),
        "remark_category": _normalize_text(data.remark_category) or None,
        "created_by": user.get("_id"),
        "created_by_name": user.get("full_name", ""),
        "created_by_role": user.get("role", ""),
        "created_at": now_iso,
    }
    await db.bank_reconciliation_items.update_one(
        {"_id": item["_id"]},
        {"$set": {"updated_at": now_iso}, "$push": {"remarks": remark_doc}},
    )
    return {"message": "Remark berjaya disimpan"}


@router.post("/{statement_id}/items/{item_id}/adjust")
async def adjust_statement_item(
    statement_id: str,
    item_id: str,
    data: ItemAdjustRequest,
    user: dict = Depends(get_current_user),
):
    db = get_db()
    _check_operator_access(user)
    statement = await _get_statement_or_404(db, statement_id)
    if statement.get("status") == STATEMENT_STATUS_APPROVED:
        raise HTTPException(status_code=400, detail="Statement yang sudah approved tidak boleh diubah")
    item = await _get_item_or_404(db, statement_id, item_id)

    now_iso = datetime.now(timezone.utc).isoformat()
    update_data: Dict[str, Any] = {
        "status": ITEM_STATUS_NEEDS_REVIEW,
        "matched_transaction_id": None,
        "suggested_transaction_id": None,
        "match_score": 0.0,
        "updated_at": now_iso,
        "adjusted_at": now_iso,
        "adjusted_by": user.get("_id"),
        "adjusted_by_name": user.get("full_name", ""),
    }
    if data.transaction_date is not None:
        parsed = _parse_date_text(data.transaction_date)
        if not parsed:
            raise HTTPException(status_code=400, detail="Format transaction_date tidak sah")
        update_data["transaction_date"] = parsed
    if data.description is not None:
        update_data["description"] = data.description.strip()
    if data.reference_number is not None:
        update_data["reference_number"] = data.reference_number.strip()[:64]
    if data.debit is not None:
        update_data["debit"] = round(abs(data.debit), 2)
    if data.credit is not None:
        update_data["credit"] = round(abs(data.credit), 2)
    if data.balance is not None:
        update_data["balance"] = round(_as_float(data.balance), 2)

    new_debit = _as_float(update_data.get("debit", item.get("debit", 0.0)))
    new_credit = _as_float(update_data.get("credit", item.get("credit", 0.0)))
    if new_debit <= 0 and new_credit <= 0:
        raise HTTPException(status_code=400, detail="Sekurang-kurangnya debit atau credit mesti > 0")
    update_data["amount"] = round(new_credit - new_debit, 2)

    remark_doc = {
        "action": "adjust",
        "remark_text": data.adjustment_remark.strip(),
        "remark_category": _normalize_text(data.remark_category) or None,
        "created_by": user.get("_id"),
        "created_by_name": user.get("full_name", ""),
        "created_by_role": user.get("role", ""),
        "created_at": now_iso,
        "old_value": {
            "transaction_date": item.get("transaction_date"),
            "description": item.get("description"),
            "reference_number": item.get("reference_number"),
            "debit": item.get("debit"),
            "credit": item.get("credit"),
            "balance": item.get("balance"),
            "amount": item.get("amount"),
        },
        "new_value": {
            "transaction_date": update_data.get("transaction_date", item.get("transaction_date")),
            "description": update_data.get("description", item.get("description")),
            "reference_number": update_data.get("reference_number", item.get("reference_number")),
            "debit": update_data.get("debit", item.get("debit")),
            "credit": update_data.get("credit", item.get("credit")),
            "balance": update_data.get("balance", item.get("balance")),
            "amount": update_data.get("amount"),
        },
    }
    await db.bank_reconciliation_items.update_one(
        {"_id": item["_id"]},
        {"$set": update_data, "$push": {"remarks": remark_doc}},
    )
    summary = await _recalculate_statement_summary(db, statement_id)
    role_alert_dispatch = {"sent": 0, "reason": "not_attempted"}
    try:
        role_alert_dispatch = await _dispatch_role_alert_notifications(
            db,
            statement_id,
            trigger="adjust_item",
            actor_user=user,
        )
    except Exception:
        role_alert_dispatch = {"sent": 0, "reason": "dispatch_failed"}
    return {
        "message": "Item statement berjaya dilaras",
        "summary": summary,
        "role_alert_notifications": role_alert_dispatch,
    }


@router.post("/{statement_id}/submit")
async def submit_statement_for_approval(
    statement_id: str,
    data: SubmitStatementRequest,
    user: dict = Depends(get_current_user),
):
    db = get_db()
    _check_operator_access(user)
    statement = await _get_statement_or_404(db, statement_id)
    if statement.get("status") == STATEMENT_STATUS_APPROVED:
        raise HTTPException(status_code=400, detail="Statement sudah approved")

    summary = await _recalculate_statement_summary(db, statement_id)
    if not summary.get("can_submit"):
        raise HTTPException(
            status_code=400,
            detail=(
                "Statement belum boleh dihantar untuk kelulusan. "
                "Selesaikan semua unmatched/needs_review dan pastikan difference = 0.00"
            ),
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    update_data = {
        "status": STATEMENT_STATUS_READY_FOR_APPROVAL,
        "submitted_by": user.get("_id"),
        "submitted_by_name": user.get("full_name", ""),
        "submitted_by_role": user.get("role", ""),
        "submitted_at": now_iso,
        "updated_at": now_iso,
    }
    if data.statement_remark is not None:
        update_data["statement_remark"] = data.statement_remark.strip() or None
    await db.bank_reconciliation_statements.update_one(
        {"_id": _id_value(statement_id)},
        {"$set": update_data},
    )
    role_alert_dispatch = {"sent": 0, "reason": "not_attempted"}
    try:
        role_alert_dispatch = await _dispatch_role_alert_notifications(
            db,
            statement_id,
            trigger="submit_for_approval",
            actor_user=user,
        )
    except Exception:
        role_alert_dispatch = {"sent": 0, "reason": "dispatch_failed"}
    await log_audit(
        user,
        "SUBMIT_BANK_RECONCILIATION",
        "accounting",
        f"Statement {statement_id} dihantar untuk kelulusan",
    )
    return {
        "message": "Statement berjaya dihantar untuk kelulusan",
        "status": STATEMENT_STATUS_READY_FOR_APPROVAL,
        "role_alert_notifications": role_alert_dispatch,
    }


@router.post("/{statement_id}/approve")
async def approve_statement(
    statement_id: str,
    data: ApproveStatementRequest,
    user: dict = Depends(get_current_user),
):
    db = get_db()
    _check_operator_access(user)
    statement = await _get_statement_or_404(db, statement_id)
    if statement.get("status") != STATEMENT_STATUS_READY_FOR_APPROVAL:
        raise HTTPException(status_code=400, detail="Statement mesti berstatus ready_for_approval untuk approve")

    submitted_by = statement.get("submitted_by")
    if submitted_by is not None and str(submitted_by) == str(user.get("_id")):
        raise HTTPException(
            status_code=400,
            detail="Maker-checker aktif: pengguna yang submit tidak boleh approve statement sendiri",
        )

    summary = await _recalculate_statement_summary(db, statement_id)
    if not summary.get("can_submit"):
        raise HTTPException(status_code=400, detail="Summary statement tidak lagi memenuhi syarat approval")

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.bank_reconciliation_statements.update_one(
        {"_id": _id_value(statement_id)},
        {"$set": {
            "status": STATEMENT_STATUS_APPROVED,
            "approved_by": user.get("_id"),
            "approved_by_name": user.get("full_name", ""),
            "approved_by_role": user.get("role", ""),
            "approved_at": now_iso,
            "approval_remark": _normalize_text(data.approval_remark) or None,
            "updated_at": now_iso,
        }},
    )
    await log_audit(
        user,
        "APPROVE_BANK_RECONCILIATION",
        "accounting",
        f"Statement {statement_id} diluluskan",
    )
    return {"message": "Statement berjaya diluluskan", "status": STATEMENT_STATUS_APPROVED}


@router.post("/{statement_id}/reject")
async def reject_statement(
    statement_id: str,
    data: RejectStatementRequest,
    user: dict = Depends(get_current_user),
):
    db = get_db()
    _check_operator_access(user)
    statement = await _get_statement_or_404(db, statement_id)
    if statement.get("status") != STATEMENT_STATUS_READY_FOR_APPROVAL:
        raise HTTPException(status_code=400, detail="Statement mesti berstatus ready_for_approval untuk reject")

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.bank_reconciliation_statements.update_one(
        {"_id": _id_value(statement_id)},
        {"$set": {
            "status": STATEMENT_STATUS_IN_REVIEW,
            "rejected_by": user.get("_id"),
            "rejected_by_name": user.get("full_name", ""),
            "rejected_by_role": user.get("role", ""),
            "rejected_at": now_iso,
            "rejected_reason": data.reject_reason.strip(),
            "updated_at": now_iso,
        }},
    )
    role_alert_dispatch = {"sent": 0, "reason": "not_attempted"}
    try:
        role_alert_dispatch = await _dispatch_role_alert_notifications(
            db,
            statement_id,
            trigger="reject_statement",
            actor_user=user,
        )
    except Exception:
        role_alert_dispatch = {"sent": 0, "reason": "dispatch_failed"}
    await log_audit(
        user,
        "REJECT_BANK_RECONCILIATION",
        "accounting",
        f"Statement {statement_id} ditolak: {data.reject_reason}",
    )
    return {
        "message": "Statement ditolak dan dipulangkan untuk semakan",
        "status": STATEMENT_STATUS_IN_REVIEW,
        "role_alert_notifications": role_alert_dispatch,
    }
