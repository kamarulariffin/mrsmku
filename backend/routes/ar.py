"""
Modul Accounts Receivable (AR) - Sub-Ledger per Pelajar
Disegerakkan dengan student_yuran, set_yuran, dan General Ledger (journal entries).
"""

import asyncio
import os
import tempfile
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Any, Dict
from bson import ObjectId

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

try:
    from sqlalchemy import func, select
    from models_sql.yuran_tables import StudentYuranRecord
except Exception:
    func = None
    select = None
    StudentYuranRecord = None

router = APIRouter(prefix="/api/ar", tags=["Accounts Receivable"])
security = HTTPBearer(auto_error=False)

_get_db_func = None
_get_current_user_func = None


def init_router(get_db_func, current_user_dep):
    global _get_db_func, _get_current_user_func
    _get_db_func = get_db_func
    _get_current_user_func = current_user_dep


def get_db():
    return _get_db_func()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Token diperlukan")
    return await _get_current_user_func(credentials)


def _require_ar_roles(user: dict):
    allowed = ["superadmin", "admin", "bendahari", "sub_bendahari", "juruaudit"]
    if user.get("role") not in allowed:
        raise HTTPException(status_code=403, detail="Akses ditolak untuk modul AR")


def _require_template_editor_roles(user: dict):
    allowed = ["superadmin", "admin", "bendahari", "sub_bendahari"]
    if user.get("role") not in allowed:
        raise HTTPException(status_code=403, detail="Hanya superadmin/admin/bendahari boleh kemas kini template surat")


def _parse_date(s: str):
    if not s or len(s) < 10:
        return None
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d")
    except ValueError:
        return None


def _aging_bucket(due_date_str: Optional[str], as_of=None):
    """Return bucket: 0_30, 31_60, 61_90, 90_plus."""
    due = _parse_date(due_date_str) if due_date_str else None
    if not due:
        return "no_due"
    as_of = as_of or datetime.now(timezone.utc).date()
    if hasattr(due, "date"):
        due = due.date()
    days = (as_of - due).days
    if days < 0:
        return "0_30"
    if days <= 30:
        return "0_30"
    if days <= 60:
        return "31_60"
    if days <= 90:
        return "61_90"
    return "90_plus"


def _as_object_id_if_valid(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return value
    if isinstance(value, str):
        try:
            return ObjectId(value)
        except Exception:
            return value
    return value


def _id_str(value: Any) -> str:
    return str(value) if value is not None else ""


def _to_number(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _balance_of(record: Dict[str, Any]) -> float:
    return _to_number(record.get("total_amount")) - _to_number(record.get("paid_amount"))


def _student_form_value(student: Optional[Dict[str, Any]]) -> Optional[int]:
    if not student:
        return None
    form = student.get("form")
    if form is None:
        form = student.get("tingkatan")
    try:
        return int(form) if form is not None else None
    except (TypeError, ValueError):
        return None


SETTINGS_KEY_AR_REMINDER_LETTER_TEMPLATE = "ar_reminder_letter_template_v1"
AR_NOTIFICATION_REPORT_COLLECTION = "ar_notification_report_log"
AR_PRINT_JOB_COLLECTION = "ar_print_jobs"
AR_PRINT_JOB_STATUSES = {"queued", "running", "completed", "failed"}
AR_NOTIFICATION_JOB_COLLECTION = "ar_notification_jobs"
AR_NOTIFICATION_JOB_STATUSES = {"queued", "running", "completed", "failed"}

# Heavy PDF job dijalankan satu-satu untuk elak tekanan berlebihan pada server.
_AR_PRINT_JOB_TASKS: Dict[str, asyncio.Task] = {}
_AR_PRINT_JOB_SEMAPHORE = asyncio.Semaphore(1)
_AR_NOTIFICATION_JOB_TASKS: Dict[str, asyncio.Task] = {}
_AR_NOTIFICATION_JOB_SEMAPHORE = asyncio.Semaphore(2)
DEFAULT_AR_REMINDER_LETTER_TEMPLATE = {
    "header": {
        "title": "SURAT PERINGATAN TUNGGAKAN YURAN",
        "subtitle": "Tunggakan yuran persekolahan",
        "rows": [
            "RUJUKAN : {rujukan_prefix}/{no_matriks}/{tarikh_surat}",
            "TARIKH : {tarikh_surat}",
            "Kepada:",
            "Ibu Bapa / Penjaga",
            "Pelajar: {nama_pelajar}",
            "No. Matriks: {no_matriks}",
            "Tuan/Puan,",
            "PER: MAKLUMAN TUNGGAKAN YURAN PERSEKOLAHAN",
        ],
    },
    "body": {
        "intro_rows": [
            "Dengan segala hormatnya perkara di atas adalah dirujuk.",
            "Pihak sekolah ingin memaklumkan bahawa pelajar di bawah jagaan tuan/puan iaitu {nama_pelajar} (No. Matriks: {no_matriks}) mempunyai tunggakan yuran persekolahan seperti berikut:",
        ],
        "note_rows": [
            "Sehubungan itu, pihak sekolah amat menghargai kerjasama tuan/puan untuk menjelaskan tunggakan tersebut dalam tempoh yang terdekat bagi memastikan segala urusan pentadbiran dan kemudahan persekolahan pelajar dapat berjalan dengan lancar.",
            "Sekiranya bayaran telah dibuat, sila abaikan makluman ini. Jika tuan/puan mempunyai sebarang pertanyaan atau memerlukan perbincangan lanjut berkaitan kaedah pembayaran, sila hubungi pihak pentadbiran sekolah melalui pejabat sekolah.",
            "Kerjasama dan perhatian daripada pihak tuan/puan amatlah dihargai dan didahului dengan ucapan terima kasih.",
            "Sekian.",
        ],
    },
    "footer": {
        "rows": [
            "Ini adalah cetakan komputer. Tiada tandatangan diperlukan.",
            "“BERKHIDMAT UNTUK PENDIDIKAN”",
            "Yang menjalankan amanah,",
            "{nama_penandatangan}",
            "{jawatan_penandatangan}",
            "{nama_maktab}",
        ],
    },
    "attributes": {
        "nama_penandatangan": "NAMA PENANDATANGAN",
        "jawatan_penandatangan": "JAWATAN PENANDATANGAN",
        "nama_maktab": "NAMA MAKTAB",
        "rujukan_prefix": "SR/KEW",
        "butiran_tunggakan_title": "Butiran Tunggakan:",
        "jumlah_label": "Jumlah Keseluruhan Tunggakan:",
        "tahun_semasa_label": "Tahun Semasa",
        "tahun_sebelum_label": "Tahun Sebelum",
        "jumlah_yuran_header": "Jumlah Yuran",
        "jumlah_bayaran_header": "Jumlah Bayaran",
        "jumlah_tunggakan_header": "Jumlah Tunggakan",
        "dijana_sistem_label": "Tarikh dan masa surat ini dijana oleh sistem:",
        "dijana_oleh_label": "Dijana oleh:",
        "show_previous_year_row": "1",
        "include_system_generated_footer_note": "1",
    },
}


def _normalize_template_attributes(raw_attrs: Any, defaults: Dict[str, str]) -> Dict[str, str]:
    if not isinstance(raw_attrs, dict):
        raw_attrs = {}
    return {
        "nama_penandatangan": _normalize_setting_line(raw_attrs.get("nama_penandatangan", defaults.get("nama_penandatangan")), max_len=120) or defaults.get("nama_penandatangan", ""),
        "jawatan_penandatangan": _normalize_setting_line(raw_attrs.get("jawatan_penandatangan", defaults.get("jawatan_penandatangan")), max_len=120) or defaults.get("jawatan_penandatangan", ""),
        "nama_maktab": _normalize_setting_line(raw_attrs.get("nama_maktab", defaults.get("nama_maktab")), max_len=160) or defaults.get("nama_maktab", ""),
        "rujukan_prefix": _normalize_setting_line(raw_attrs.get("rujukan_prefix", defaults.get("rujukan_prefix")), max_len=80) or defaults.get("rujukan_prefix", "SR/KEW"),
        "butiran_tunggakan_title": _normalize_setting_line(raw_attrs.get("butiran_tunggakan_title", defaults.get("butiran_tunggakan_title")), max_len=120) or defaults.get("butiran_tunggakan_title", "Butiran Tunggakan:"),
        "jumlah_label": _normalize_setting_line(raw_attrs.get("jumlah_label", defaults.get("jumlah_label")), max_len=160) or defaults.get("jumlah_label", "Jumlah Keseluruhan Tunggakan:"),
        "tahun_semasa_label": _normalize_setting_line(raw_attrs.get("tahun_semasa_label", defaults.get("tahun_semasa_label")), max_len=60) or defaults.get("tahun_semasa_label", "Tahun Semasa"),
        "tahun_sebelum_label": _normalize_setting_line(raw_attrs.get("tahun_sebelum_label", defaults.get("tahun_sebelum_label")), max_len=60) or defaults.get("tahun_sebelum_label", "Tahun Sebelum"),
        "jumlah_yuran_header": _normalize_setting_line(raw_attrs.get("jumlah_yuran_header", defaults.get("jumlah_yuran_header")), max_len=120) or defaults.get("jumlah_yuran_header", "Jumlah Yuran"),
        "jumlah_bayaran_header": _normalize_setting_line(raw_attrs.get("jumlah_bayaran_header", defaults.get("jumlah_bayaran_header")), max_len=120) or defaults.get("jumlah_bayaran_header", "Jumlah Bayaran"),
        "jumlah_tunggakan_header": _normalize_setting_line(raw_attrs.get("jumlah_tunggakan_header", defaults.get("jumlah_tunggakan_header")), max_len=120) or defaults.get("jumlah_tunggakan_header", "Jumlah Tunggakan"),
        "dijana_sistem_label": _normalize_setting_line(raw_attrs.get("dijana_sistem_label", defaults.get("dijana_sistem_label")), max_len=180) or defaults.get("dijana_sistem_label", "Tarikh dan masa surat ini dijana oleh sistem:"),
        "dijana_oleh_label": _normalize_setting_line(raw_attrs.get("dijana_oleh_label", defaults.get("dijana_oleh_label")), max_len=120) or defaults.get("dijana_oleh_label", "Dijana oleh:"),
        "show_previous_year_row": "1" if str(raw_attrs.get("show_previous_year_row", defaults.get("show_previous_year_row", "1"))).strip().lower() in ("1", "true", "yes", "ya") else "0",
        "include_system_generated_footer_note": "1" if str(raw_attrs.get("include_system_generated_footer_note", defaults.get("include_system_generated_footer_note", "1"))).strip().lower() in ("1", "true", "yes", "ya") else "0",
    }


def _normalize_setting_line(value: Any, *, max_len: int = 240) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    return text[:max_len]


def _normalize_setting_rows(
    raw_rows: Any,
    *,
    max_rows: int = 12,
    max_len_per_row: int = 240,
) -> List[str]:
    if not isinstance(raw_rows, list):
        return []
    rows: List[str] = []
    for raw in raw_rows:
        normalized = _normalize_setting_line(raw, max_len=max_len_per_row)
        if normalized:
            rows.append(normalized)
        if len(rows) >= max_rows:
            break
    return rows


def normalize_ar_reminder_letter_template(raw_template: Any) -> Dict[str, Any]:
    base = DEFAULT_AR_REMINDER_LETTER_TEMPLATE
    if not isinstance(raw_template, dict):
        raw_template = {}

    raw_header = raw_template.get("header")
    raw_body = raw_template.get("body")
    raw_footer = raw_template.get("footer")
    raw_attributes = raw_template.get("attributes")
    if not isinstance(raw_header, dict):
        raw_header = {}
    if not isinstance(raw_body, dict):
        raw_body = {}
    if not isinstance(raw_footer, dict):
        raw_footer = {}
    if not isinstance(raw_attributes, dict):
        raw_attributes = {}

    header_default = base["header"]
    body_default = base["body"]
    footer_default = base["footer"]
    attributes_default = base.get("attributes") or {}

    normalized_header = {
        "title": _normalize_setting_line(raw_header.get("title", header_default["title"]), max_len=120) or header_default["title"],
        "subtitle": _normalize_setting_line(raw_header.get("subtitle", header_default["subtitle"]), max_len=180),
        "rows": _normalize_setting_rows(raw_header.get("rows", header_default["rows"]), max_rows=14, max_len_per_row=180),
    }
    if not normalized_header["rows"]:
        normalized_header["rows"] = list(header_default["rows"])

    normalized_body = {
        "intro_rows": _normalize_setting_rows(raw_body.get("intro_rows", body_default["intro_rows"]), max_rows=10, max_len_per_row=240),
        "note_rows": _normalize_setting_rows(raw_body.get("note_rows", body_default["note_rows"]), max_rows=10, max_len_per_row=240),
    }
    if not normalized_body["intro_rows"]:
        normalized_body["intro_rows"] = list(body_default["intro_rows"])

    normalized_footer = {
        "rows": _normalize_setting_rows(raw_footer.get("rows", footer_default["rows"]), max_rows=10, max_len_per_row=240),
    }
    if not normalized_footer["rows"]:
        normalized_footer["rows"] = list(footer_default["rows"])

    normalized_attributes = _normalize_template_attributes(raw_attributes, attributes_default)

    return {
        "header": normalized_header,
        "body": normalized_body,
        "footer": normalized_footer,
        "attributes": normalized_attributes,
    }


async def get_ar_reminder_letter_template_settings(db=None):
    db = db or get_db()
    doc = await db.settings.find_one({"key": SETTINGS_KEY_AR_REMINDER_LETTER_TEMPLATE})
    if not doc:
        return normalize_ar_reminder_letter_template(DEFAULT_AR_REMINDER_LETTER_TEMPLATE)
    return normalize_ar_reminder_letter_template(doc.get("template"))


def _normalize_selected_tingkatan(raw_values: Optional[List[int]]) -> List[int]:
    values = raw_values or [1, 2, 3, 4, 5]
    selected = []
    for value in values:
        try:
            parsed = int(value)
        except Exception:
            continue
        if parsed in (1, 2, 3, 4, 5):
            selected.append(parsed)
    normalized = sorted(set(selected))
    return normalized or [1, 2, 3, 4, 5]


def _iso_datetime(value: Any) -> Optional[str]:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if value is None:
        return None
    return str(value)


def _format_money(value: Any) -> str:
    return f"RM {_to_number(value):,.2f}"


def _format_money_plain(value: Any) -> str:
    return f"{_to_number(value):,.2f}"


def _template_flag_enabled(value: Any) -> bool:
    return str(value or "").strip().lower() in ("1", "true", "yes", "ya")


def _apply_template_tokens(line: Any, tokens: Dict[str, Any]) -> str:
    rendered = str(line or "")
    for key, value in tokens.items():
        rendered = rendered.replace("{" + str(key) + "}", str(value if value is not None else ""))
    return rendered


def _resolve_session_factory(db):
    getter = getattr(db, "get_session_factory", None)
    if callable(getter):
        try:
            session_factory = getter()
            if session_factory is not None:
                return session_factory
        except Exception:
            pass

    raw_getter = getattr(db, "get_raw_db", None)
    if callable(raw_getter):
        try:
            raw_db = raw_getter()
            raw_session_getter = getattr(raw_db, "get_session_factory", None)
            if callable(raw_session_getter):
                session_factory = raw_session_getter()
                if session_factory is not None:
                    return session_factory
        except Exception:
            pass
    return None


def _build_student_id_candidates(student_ids: Optional[List[str]]) -> List[Any]:
    if not student_ids:
        return []
    candidates: List[Any] = []
    seen = set()
    for raw_sid in student_ids:
        sid = _id_str(raw_sid).strip()
        if not sid:
            continue
        if sid not in seen:
            candidates.append(sid)
            seen.add(sid)
        sid_oid = _as_object_id_if_valid(sid)
        sid_oid_key = _id_str(sid_oid)
        if sid_oid_key not in seen:
            candidates.append(sid_oid)
            seen.add(sid_oid_key)
    return candidates


async def _fetch_student_outstanding_year_rows(
    db,
    *,
    student_ids: Optional[List[str]] = None,
    year: Optional[int] = None,
    year_mode: str = "upto",
    include_only_outstanding: bool = True,
) -> List[Dict[str, Any]]:
    normalized_student_ids = sorted({_id_str(s).strip() for s in (student_ids or []) if _id_str(s).strip()})
    year_mode = str(year_mode or "upto").strip().lower()
    if year_mode not in ("upto", "exact"):
        year_mode = "upto"

    session_factory = _resolve_session_factory(db)
    if session_factory is not None and StudentYuranRecord is not None and select is not None and func is not None:
        outstanding_expr = (
            func.coalesce(StudentYuranRecord.total_amount, 0.0)
            - func.coalesce(StudentYuranRecord.paid_amount, 0.0)
        )
        stmt = select(
            StudentYuranRecord.student_id.label("student_id"),
            StudentYuranRecord.tingkatan.label("tingkatan"),
            StudentYuranRecord.tahun.label("tahun"),
            func.sum(func.coalesce(StudentYuranRecord.total_amount, 0.0)).label("total_amount"),
            func.sum(func.coalesce(StudentYuranRecord.paid_amount, 0.0)).label("paid_amount"),
            func.sum(outstanding_expr).label("outstanding"),
        ).where(StudentYuranRecord.student_id.is_not(None))

        if normalized_student_ids:
            stmt = stmt.where(StudentYuranRecord.student_id.in_(normalized_student_ids))
        if year is not None:
            if year_mode == "exact":
                stmt = stmt.where(StudentYuranRecord.tahun == int(year))
            else:
                stmt = stmt.where(StudentYuranRecord.tahun <= int(year))
        stmt = stmt.group_by(
            StudentYuranRecord.student_id,
            StudentYuranRecord.tingkatan,
            StudentYuranRecord.tahun,
        )

        async with session_factory() as session:
            sql_rows = (await session.execute(stmt)).all()

        rows: List[Dict[str, Any]] = []
        for row in sql_rows:
            sid = _id_str(row.student_id).strip()
            if not sid:
                continue
            try:
                tahun = int(row.tahun)
            except Exception:
                continue
            try:
                tingkatan = int(row.tingkatan or 0)
            except Exception:
                tingkatan = 0
            total_amount = round(_to_number(row.total_amount), 2)
            paid_amount = round(_to_number(row.paid_amount), 2)
            outstanding = round(max(_to_number(row.outstanding), 0.0), 2)
            if include_only_outstanding and outstanding <= 0:
                continue
            if (not include_only_outstanding) and total_amount <= 0 and paid_amount <= 0 and outstanding <= 0:
                continue
            rows.append({
                "student_id": sid,
                "tingkatan": tingkatan,
                "tahun": tahun,
                "total_amount": total_amount,
                "paid_amount": paid_amount,
                "outstanding": outstanding,
            })
        return rows

    query: Dict[str, Any] = {}
    student_id_candidates = _build_student_id_candidates(normalized_student_ids)
    if student_id_candidates:
        query["student_id"] = {"$in": student_id_candidates}
    if year is not None:
        if year_mode == "exact":
            query["tahun"] = int(year)
        else:
            query["tahun"] = {"$lte": int(year)}

    records = await db.student_yuran.find(
        query,
        {"student_id": 1, "tahun": 1, "tingkatan": 1, "total_amount": 1, "paid_amount": 1, "balance": 1},
    ).to_list(300000)
    year_map: Dict[str, Dict[tuple, Dict[str, float]]] = {}
    for rec in records:
        sid = _id_str(rec.get("student_id")).strip()
        if not sid:
            continue
        if normalized_student_ids and sid not in normalized_student_ids:
            continue
        try:
            tahun = int(rec.get("tahun"))
        except Exception:
            continue
        try:
            tingkatan = int(rec.get("tingkatan") or 0)
        except Exception:
            tingkatan = 0
        if year is not None:
            if year_mode == "exact" and tahun != int(year):
                continue
            if year_mode == "upto" and tahun > int(year):
                continue
        total_amount = _to_number(rec.get("total_amount"))
        paid_amount = _to_number(rec.get("paid_amount"))
        outstanding = max(total_amount - paid_amount, 0.0)
        if include_only_outstanding and outstanding <= 0:
            continue
        if (not include_only_outstanding) and total_amount <= 0 and paid_amount <= 0 and outstanding <= 0:
            continue

        student_year_map = year_map.setdefault(sid, {})
        key = (tingkatan, tahun)
        bucket = student_year_map.setdefault(
            key,
            {"total_amount": 0.0, "paid_amount": 0.0, "outstanding": 0.0},
        )
        bucket["total_amount"] += total_amount
        bucket["paid_amount"] += paid_amount
        bucket["outstanding"] += outstanding

    rows: List[Dict[str, Any]] = []
    for sid, by_key in year_map.items():
        for key, values in by_key.items():
            tingkatan, tahun = key
            outstanding = round(_to_number(values.get("outstanding")), 2)
            total_amount = round(_to_number(values.get("total_amount")), 2)
            paid_amount = round(_to_number(values.get("paid_amount")), 2)
            if include_only_outstanding and outstanding <= 0:
                continue
            if (not include_only_outstanding) and total_amount <= 0 and paid_amount <= 0 and outstanding <= 0:
                continue
            rows.append({
                "student_id": sid,
                "tingkatan": int(tingkatan),
                "tahun": int(tahun),
                "total_amount": total_amount,
                "paid_amount": paid_amount,
                "outstanding": outstanding,
            })
    return rows


async def _build_outstanding_reminder_payload(
    db,
    *,
    year: int,
    selected_tingkatan: List[int],
    limit_per_tingkatan: int,
    generated_by: str = "",
) -> Dict[str, Any]:
    outstanding_rows = await _aggregate_outstanding_by_student(db, year)
    template = await get_ar_reminder_letter_template_settings(db)
    generated_now = datetime.now(timezone.utc)
    generated_iso = generated_now.isoformat()
    tarikh_surat = generated_now.strftime("%d/%m/%Y")
    if not outstanding_rows:
        return {
            "year": year,
            "generated_at": generated_iso,
            "tarikh_surat": tarikh_surat,
            "generated_by": generated_by,
            "selected_tingkatan": selected_tingkatan,
            "forms": [],
            "grand_total_students": 0,
            "grand_total_outstanding": 0.0,
            "template": template,
        }

    student_ids = [_id_str(r.get("_id")).strip() for r in outstanding_rows if _id_str(r.get("_id")).strip()]
    student_id_candidates = _build_student_id_candidates(student_ids)
    students = await db.students.find(
        {"_id": {"$in": student_id_candidates}},
        {"full_name": 1, "matric_number": 1, "form": 1, "tingkatan": 1},
    ).to_list(len(student_id_candidates) or 1)
    students_by_id = {_id_str(s.get("_id")): s for s in students}

    form_students: Dict[int, List[Dict[str, Any]]] = {t: [] for t in selected_tingkatan}
    form_total_students: Dict[int, int] = {t: 0 for t in selected_tingkatan}
    form_total_outstanding: Dict[int, float] = {t: 0.0 for t in selected_tingkatan}

    for row in outstanding_rows:
        sid_str = _id_str(row.get("_id"))
        if not sid_str:
            continue
        student = students_by_id.get(sid_str)
        form_value = _student_form_value(student)
        if form_value not in selected_tingkatan:
            continue
        outstanding = round(_to_number(row.get("outstanding")), 2)
        form_total_students[form_value] += 1
        form_total_outstanding[form_value] += outstanding
        if len(form_students[form_value]) >= limit_per_tingkatan:
            continue
        form_students[form_value].append({
            "student_id": sid_str,
            "student_name": (student or {}).get("full_name") or "-",
            "matric_number": (student or {}).get("matric_number") or "-",
            "current_tingkatan": int(form_value),
            "outstanding": outstanding,
        })

    forms = []
    grand_total_students = 0
    grand_total_outstanding = 0.0
    for t in selected_tingkatan:
        total_students_form = int(form_total_students.get(t, 0) or 0)
        total_outstanding_form = round(_to_number(form_total_outstanding.get(t, 0.0)), 2)
        students_form = form_students.get(t, [])
        grand_total_students += total_students_form
        grand_total_outstanding += total_outstanding_form
        forms.append({
            "tingkatan": t,
            "total_students": total_students_form,
            "printed_students": len(students_form),
            "truncated": total_students_form > len(students_form),
            "total_outstanding": total_outstanding_form,
            "students": students_form,
        })

    printed_student_ids: List[str] = []
    for form in forms:
        for student in form.get("students", []):
            sid = _id_str(student.get("student_id")).strip()
            if sid:
                printed_student_ids.append(sid)
    printed_student_ids = sorted(set(printed_student_ids))

    per_student_year_rows: Dict[str, List[Dict[str, Any]]] = {}
    per_student_tingkatan_totals: Dict[str, Dict[int, Dict[str, float]]] = {}
    if printed_student_ids:
        year_rows = await _fetch_student_outstanding_year_rows(
            db,
            student_ids=printed_student_ids,
            year=year,
            year_mode="upto",
            include_only_outstanding=False,
        )
        for row in year_rows:
            sid = _id_str(row.get("student_id")).strip()
            if not sid:
                continue
            try:
                tingkatan_value = int(row.get("tingkatan") or 0)
            except Exception:
                tingkatan_value = 0
            total_amount_value = round(_to_number(row.get("total_amount")), 2)
            paid_amount_value = round(_to_number(row.get("paid_amount")), 2)
            outstanding_value = round(_to_number(row.get("outstanding")), 2)
            per_student_year_rows.setdefault(sid, []).append({
                "tingkatan": tingkatan_value,
                "tahun": int(row.get("tahun") or 0),
                "total_amount": total_amount_value,
                "paid_amount": paid_amount_value,
                "outstanding": outstanding_value,
            })
            if tingkatan_value > 0:
                tingkatan_bucket = per_student_tingkatan_totals.setdefault(sid, {}).setdefault(
                    tingkatan_value,
                    {"total_amount": 0.0, "paid_amount": 0.0, "outstanding": 0.0},
                )
                tingkatan_bucket["total_amount"] += total_amount_value
                tingkatan_bucket["paid_amount"] += paid_amount_value
                tingkatan_bucket["outstanding"] += outstanding_value
        for sid, rows in per_student_year_rows.items():
            rows.sort(key=lambda item: int(item.get("tahun") or 0), reverse=True)

    rujukan_prefix = str(((template.get("attributes") or {}).get("rujukan_prefix") or "SR/KEW")).strip() or "SR/KEW"
    rujukan_date_segment = generated_now.strftime("%Y%m%d")
    for form in forms:
        for student in form.get("students", []):
            sid = _id_str(student.get("student_id")).strip()
            year_rows = list(per_student_year_rows.get(sid, []))
            if not year_rows:
                fallback_outstanding = round(_to_number(student.get("outstanding")), 2)
                year_rows = [{
                    "tingkatan": int(_to_number(student.get("current_tingkatan") or form.get("tingkatan") or 1)),
                    "tahun": int(year),
                    "total_amount": fallback_outstanding,
                    "paid_amount": 0.0,
                    "outstanding": fallback_outstanding,
                }]

            tingkatan_totals = per_student_tingkatan_totals.get(sid, {})
            current_tingkatan = int(_to_number(student.get("current_tingkatan") or form.get("tingkatan")))
            if current_tingkatan <= 0:
                available_tingkatan = sorted(
                    int(t)
                    for t in tingkatan_totals.keys()
                    if int(_to_number(t)) > 0
                )
                if available_tingkatan:
                    current_tingkatan = available_tingkatan[-1]
            if current_tingkatan <= 0:
                current_tingkatan = int(_to_number(form.get("tingkatan") or 1))

            current_bucket = tingkatan_totals.get(current_tingkatan)
            if current_bucket is None:
                fallback_outstanding = round(_to_number(student.get("outstanding")), 2)
                current_bucket = {
                    "total_amount": fallback_outstanding,
                    "paid_amount": 0.0,
                    "outstanding": fallback_outstanding,
                }

            tingkatan_rows: List[Dict[str, Any]] = [{
                "tingkatan": int(current_tingkatan),
                "label": f"Tingkatan {int(current_tingkatan)} (Semasa)",
                "is_current": True,
                "total_amount": round(_to_number(current_bucket.get("total_amount")), 2),
                "paid_amount": round(_to_number(current_bucket.get("paid_amount")), 2),
                "outstanding": round(_to_number(current_bucket.get("outstanding")), 2),
            }]
            for tingkatan_idx in range(1, max(int(current_tingkatan), 1)):
                bucket = tingkatan_totals.get(tingkatan_idx, {"total_amount": 0.0, "paid_amount": 0.0, "outstanding": 0.0})
                tingkatan_rows.append({
                    "tingkatan": int(tingkatan_idx),
                    "label": f"Tingkatan {int(tingkatan_idx)}",
                    "is_current": False,
                    "total_amount": round(_to_number(bucket.get("total_amount")), 2),
                    "paid_amount": round(_to_number(bucket.get("paid_amount")), 2),
                    "outstanding": round(_to_number(bucket.get("outstanding")), 2),
                })

            current_outstanding = round(_to_number(tingkatan_rows[0].get("outstanding")), 2) if tingkatan_rows else 0.0
            total_outstanding = round(sum(_to_number(row.get("outstanding")) for row in tingkatan_rows), 2)
            total_paid = round(sum(_to_number(row.get("paid_amount")) for row in tingkatan_rows), 2)
            previous_year = year - 1
            previous_outstanding = round(max(total_outstanding - current_outstanding, 0.0), 2)
            matric_no = str(student.get("matric_number") or "-").strip() or "-"
            student["current_tingkatan"] = int(current_tingkatan)
            student["current_year"] = year
            student["previous_year"] = previous_year
            student["current_year_outstanding"] = current_outstanding
            student["previous_year_outstanding"] = previous_outstanding
            student["total_outstanding"] = total_outstanding
            student["total_paid"] = total_paid
            student["tingkatan_rows"] = tingkatan_rows
            student["year_rows"] = year_rows[:12]
            student["rujukan_surat"] = f"{rujukan_prefix}/{matric_no}/{rujukan_date_segment}"

    return {
        "year": year,
        "generated_at": generated_iso,
        "tarikh_surat": tarikh_surat,
        "generated_by": generated_by,
        "selected_tingkatan": selected_tingkatan,
        "forms": forms,
        "grand_total_students": grand_total_students,
        "grand_total_outstanding": round(grand_total_outstanding, 2),
        "template": template,
    }


async def _aggregate_outstanding_by_student(db, year: int) -> List[Dict[str, Any]]:
    rows = await _fetch_student_outstanding_year_rows(
        db,
        year=year,
        year_mode="exact",
    )
    outstanding_by_student: Dict[str, float] = {}
    for row in rows:
        sid = _id_str(row.get("student_id")).strip()
        if not sid:
            continue
        outstanding_by_student[sid] = round(
            _to_number(outstanding_by_student.get(sid)) + _to_number(row.get("outstanding")),
            2,
        )
    ordered = sorted(
        (
            {"_id": sid, "outstanding": round(_to_number(total), 2)}
            for sid, total in outstanding_by_student.items()
            if _to_number(total) > 0
        ),
        key=lambda item: _to_number(item.get("outstanding")),
        reverse=True,
    )
    return ordered


async def _log_notification_report(
    db,
    *,
    channel: str,
    status: str,
    action_type: str,
    year: Optional[int],
    triggered_by: Optional[dict],
    tingkatan: Optional[Any] = None,
    student_id: Optional[str] = None,
    total_targets: Optional[int] = None,
    success_count: Optional[int] = None,
    failed_count: Optional[int] = None,
    template_key: Optional[str] = None,
    push_template_key: Optional[str] = None,
    error: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    try:
        role = (triggered_by or {}).get("role")
        uid = (triggered_by or {}).get("_id")
        uname = (triggered_by or {}).get("full_name", "")
        if isinstance(tingkatan, list):
            tingkatan_value = [int(t) for t in tingkatan if str(t).isdigit()]
        elif tingkatan is None:
            tingkatan_value = None
        else:
            try:
                tingkatan_value = int(tingkatan)
            except Exception:
                tingkatan_value = None
        doc = {
            "channel": str(channel or ""),
            "status": str(status or "success"),
            "action_type": str(action_type or "single"),
            "year": year,
            "tingkatan": tingkatan_value,
            "student_id": _as_object_id_if_valid(student_id) if student_id else None,
            "total_targets": int(total_targets or 0),
            "success_count": int(success_count or 0),
            "failed_count": int(failed_count or 0),
            "template_key": template_key or None,
            "push_template_key": push_template_key or None,
            "error": _normalize_setting_line(error, max_len=500) if error else None,
            "meta": meta or {},
            "created_at": datetime.now(timezone.utc),
            "triggered_by": str(uid) if uid is not None else None,
            "triggered_by_name": uname,
            "triggered_by_role": role,
        }
        await db[AR_NOTIFICATION_REPORT_COLLECTION].insert_one(doc)
    except Exception:
        # Pelaporan adalah best-effort dan tidak boleh ganggu aliran utama.
        pass


def _require_print_job_roles(user: dict):
    allowed = ["superadmin", "admin", "bendahari", "sub_bendahari"]
    if user.get("role") not in allowed:
        raise HTTPException(status_code=403, detail="Hanya superadmin/admin/bendahari/sub bendahari boleh jana PDF server-side")


def _truncate_pdf_text(text: Any, max_chars: int = 90) -> str:
    value = _normalize_setting_line(text, max_len=max_chars * 2)
    if len(value) <= max_chars:
        return value
    return f"{value[:max_chars - 1]}..."


def _serialize_print_job(doc: Dict[str, Any]) -> Dict[str, Any]:
    result = {
        "id": _id_str(doc.get("_id")),
        "job_type": doc.get("job_type", "reminder_print_pdf"),
        "status": doc.get("status", "queued"),
        "year": doc.get("year"),
        "tingkatan": doc.get("tingkatan") or [],
        "limit_per_tingkatan": int(doc.get("limit_per_tingkatan") or 0),
        "progress_total": int(doc.get("progress_total") or 0),
        "progress_processed": int(doc.get("progress_processed") or 0),
        "progress_percent": int(doc.get("progress_percent") or 0),
        "total_targets": int(doc.get("total_targets") or 0),
        "printed_students_total": int(doc.get("printed_students_total") or 0),
        "message": doc.get("message") or "",
        "error": doc.get("error"),
        "file_name": doc.get("file_name"),
        "file_size": int(doc.get("file_size") or 0),
        "created_at": _iso_datetime(doc.get("created_at")),
        "started_at": _iso_datetime(doc.get("started_at")),
        "finished_at": _iso_datetime(doc.get("finished_at")),
        "updated_at": _iso_datetime(doc.get("updated_at")),
        "created_by": doc.get("created_by"),
        "created_by_name": doc.get("created_by_name"),
        "created_by_role": doc.get("created_by_role"),
        "meta": doc.get("meta") or {},
    }
    if doc.get("status") == "completed" and doc.get("file_name"):
        result["download_url"] = f"/api/ar/print-jobs/{result['id']}/download"
    else:
        result["download_url"] = None
    return result


def _serialize_notification_job(doc: Dict[str, Any]) -> Dict[str, Any]:
    failed_student_ids = doc.get("failed_student_ids") if isinstance(doc.get("failed_student_ids"), list) else []
    job_status = str(doc.get("status") or "queued").strip().lower()
    return {
        "id": _id_str(doc.get("_id")),
        "job_type": doc.get("job_type", "bulk_reminder_notify"),
        "status": job_status,
        "year": doc.get("year"),
        "tingkatan": doc.get("tingkatan"),
        "channel": doc.get("channel"),
        "template_key": doc.get("template_key"),
        "push_template_key": doc.get("push_template_key"),
        "batch_size": int(doc.get("batch_size") or 0),
        "progress_total": int(doc.get("progress_total") or 0),
        "progress_processed": int(doc.get("progress_processed") or 0),
        "progress_percent": int(doc.get("progress_percent") or 0),
        "success_count": int(doc.get("success_count") or 0),
        "failed_count": int(doc.get("failed_count") or 0),
        "failed_student_ids_count": len(failed_student_ids),
        "can_retry_failed": bool(failed_student_ids and job_status in ("completed", "failed")),
        "message": doc.get("message") or "",
        "error": doc.get("error"),
        "created_at": _iso_datetime(doc.get("created_at")),
        "started_at": _iso_datetime(doc.get("started_at")),
        "finished_at": _iso_datetime(doc.get("finished_at")),
        "updated_at": _iso_datetime(doc.get("updated_at")),
        "created_by": doc.get("created_by"),
        "created_by_name": doc.get("created_by_name"),
        "created_by_role": doc.get("created_by_role"),
        "meta": doc.get("meta") or {},
    }


def _normalize_tingkatan_value(raw_value: Any) -> int:
    try:
        parsed = int(raw_value)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="tingkatan mesti 1-5") from exc
    if parsed not in (1, 2, 3, 4, 5):
        raise HTTPException(status_code=400, detail="tingkatan mesti 1-5")
    return parsed


def _normalize_report_source(meta: Any) -> str:
    if not isinstance(meta, dict):
        return "manual"
    raw = str(meta.get("source") or "").strip().lower()
    if raw in ("notification_job_queue", "server_pdf_job", "queue", "job_queue"):
        return "queue"
    if raw in ("manual", "manual_sync", "manual_log", "ui_manual", "browser_manual", ""):
        return "manual"
    return raw


def _build_report_source_filter(raw_source: Optional[str]) -> Optional[Dict[str, Any]]:
    source = str(raw_source or "").strip().lower()
    if not source:
        return None
    if source == "queue":
        return {
            "meta.source": {
                "$in": [
                    "notification_job_queue",
                    "server_pdf_job",
                    "queue",
                    "job_queue",
                ]
            }
        }
    if source == "manual":
        return {
            "$or": [
                {"meta.source": {"$exists": False}},
                {"meta.source": None},
                {"meta.source": ""},
                {"meta.source": {"$in": ["manual", "manual_sync", "manual_log", "ui_manual", "browser_manual"]}},
            ]
        }
    return {"meta.source": source}


async def _get_bulk_reminder_targets(db, *, year: int, tingkatan: int) -> List[str]:
    outstanding_rows = await _aggregate_outstanding_by_student(db, year)
    if not outstanding_rows:
        return []
    form_students = await db.students.find(
        {
            "$or": [
                {"form": tingkatan},
                {"tingkatan": tingkatan},
                {"form": str(tingkatan)},
                {"tingkatan": str(tingkatan)},
            ]
        },
        {"_id": 1},
    ).to_list(20000)
    eligible_ids = {_id_str(s.get("_id")) for s in form_students if s.get("_id") is not None}
    ordered: List[str] = []
    for row in outstanding_rows:
        sid_str = _id_str(row.get("_id"))
        if sid_str and sid_str in eligible_ids:
            ordered.append(sid_str)
    return ordered


def _extract_failed_student_ids(source_job: Dict[str, Any]) -> List[str]:
    failed_student_ids = source_job.get("failed_student_ids")
    if not isinstance(failed_student_ids, list):
        failed_student_ids = []
    if not failed_student_ids:
        meta_error_samples = (source_job.get("meta") or {}).get("error_samples")
        if isinstance(meta_error_samples, list):
            failed_student_ids = [
                _id_str(item.get("student_id"))
                for item in meta_error_samples
                if isinstance(item, dict) and _id_str(item.get("student_id")).strip()
            ]

    normalized_failed_ids: List[str] = []
    seen_ids = set()
    for raw_sid in failed_student_ids:
        sid = _id_str(raw_sid).strip()
        if sid and sid not in seen_ids:
            normalized_failed_ids.append(sid)
            seen_ids.add(sid)
    return normalized_failed_ids


async def _queue_retry_notification_job(
    db,
    *,
    source_job: Dict[str, Any],
    current_user: Dict[str, Any],
    batch_size: int,
    request_source: str,
) -> Dict[str, Any]:
    source_status = str(source_job.get("status") or "").strip().lower()
    if source_status in ("queued", "running"):
        raise HTTPException(status_code=409, detail="Job asal masih berjalan. Sila tunggu sehingga selesai dahulu.")

    normalized_failed_ids = _extract_failed_student_ids(source_job)
    if not normalized_failed_ids:
        raise HTTPException(status_code=400, detail="Tiada penerima gagal untuk diulang hantar.")

    channel = str(source_job.get("channel") or "").strip().lower()
    if channel not in ("email", "push"):
        raise HTTPException(status_code=400, detail="Job asal bukan job notifikasi email/push yang boleh diulang hantar.")

    source_job_id = _id_str(source_job.get("_id"))
    running_retry = await db[AR_NOTIFICATION_JOB_COLLECTION].find_one(
        {
            "job_type": "bulk_reminder_notify",
            "meta.retry_of_job_id": source_job_id,
            "status": {"$in": ["queued", "running"]},
        },
        {"_id": 1},
    )
    if running_retry:
        raise HTTPException(status_code=409, detail="Retry job untuk rekod ini masih berjalan.")

    year_value = int(source_job.get("year") or datetime.now(timezone.utc).year)
    tingkatan_value = _normalize_tingkatan_value(source_job.get("tingkatan"))
    template_key = (source_job.get("template_key") or "fee_reminder").strip() or "fee_reminder"
    push_template_key = (source_job.get("push_template_key") or "reminder_full").strip() or "reminder_full"
    if batch_size is None:
        resolved_batch_size = int(source_job.get("batch_size") or 20)
    else:
        resolved_batch_size = int(batch_size)
    if resolved_batch_size < 0:
        resolved_batch_size = 20

    now = datetime.now(timezone.utc)
    doc = {
        "job_type": "bulk_reminder_notify",
        "status": "queued",
        "year": year_value,
        "tingkatan": tingkatan_value,
        "channel": channel,
        "template_key": template_key if channel == "email" else None,
        "push_template_key": push_template_key if channel == "push" else None,
        "batch_size": resolved_batch_size,
        "progress_total": 0,
        "progress_processed": 0,
        "progress_percent": 0,
        "success_count": 0,
        "failed_count": 0,
        "failed_student_ids": [],
        "target_student_ids": normalized_failed_ids,
        "message": "Retry job diterima. Menunggu giliran pemprosesan.",
        "error": None,
        "created_at": now,
        "started_at": None,
        "finished_at": None,
        "updated_at": now,
        "created_by": str(current_user.get("_id")) if current_user.get("_id") is not None else None,
        "created_by_name": current_user.get("full_name", ""),
        "created_by_role": current_user.get("role"),
        "meta": {
            "requested_from": request_source,
            "retry_of_job_id": source_job_id,
            "retry_failed_count": len(normalized_failed_ids),
            "batch_mode": "chunked" if resolved_batch_size > 0 else "all_at_once",
        },
    }
    insert_result = await db[AR_NOTIFICATION_JOB_COLLECTION].insert_one(doc)
    retry_job_id = str(insert_result.inserted_id)
    _start_notification_job_task(retry_job_id)
    created_doc = await db[AR_NOTIFICATION_JOB_COLLECTION].find_one({"_id": insert_result.inserted_id})
    return _serialize_notification_job(created_doc or {"_id": insert_result.inserted_id, **doc})


def _get_print_job_output_path(job_id: str, year: int) -> Dict[str, str]:
    output_dir = os.path.join(tempfile.gettempdir(), "mrsmku_ar_print_jobs")
    os.makedirs(output_dir, exist_ok=True)
    safe_job_id = "".join(ch for ch in str(job_id) if ch.isalnum())[:24] or "job"
    safe_year = "".join(ch for ch in str(year) if ch.isdigit())[:4] or str(datetime.now(timezone.utc).year)
    file_name = f"surat-peringatan-ar-{safe_year}-{safe_job_id}.pdf"
    file_path = os.path.join(output_dir, file_name)
    return {"file_name": file_name, "file_path": file_path}


async def _run_reminder_print_job(job_id: str):
    db = get_db()
    job_oid = _as_object_id_if_valid(job_id)
    job_doc = await db[AR_PRINT_JOB_COLLECTION].find_one({"_id": job_oid, "job_type": "reminder_print_pdf"})
    if not job_doc:
        return

    year = int(job_doc.get("year") or datetime.now(timezone.utc).year)
    selected_tingkatan = _normalize_selected_tingkatan(job_doc.get("tingkatan") or [])
    limit_per_tingkatan = int(job_doc.get("limit_per_tingkatan") or 5000)
    triggered_by = {
        "_id": job_doc.get("created_by"),
        "full_name": job_doc.get("created_by_name"),
        "role": job_doc.get("created_by_role"),
    }
    base_meta = job_doc.get("meta") if isinstance(job_doc.get("meta"), dict) else {}

    async with _AR_PRINT_JOB_SEMAPHORE:
        try:
            await db[AR_PRINT_JOB_COLLECTION].update_one(
                {"_id": job_oid},
                {
                    "$set": {
                        "status": "running",
                        "message": "Mengumpul data tunggakan pelajar...",
                        "started_at": datetime.now(timezone.utc),
                        "updated_at": datetime.now(timezone.utc),
                        "progress_percent": 5,
                    }
                },
            )

            payload = await _build_outstanding_reminder_payload(
                db,
                year=year,
                selected_tingkatan=selected_tingkatan,
                limit_per_tingkatan=limit_per_tingkatan,
                generated_by=job_doc.get("created_by_name", ""),
            )
            forms = payload.get("forms") or []
            total_targets = int(payload.get("grand_total_students") or 0)
            printable_total = int(sum(len(form.get("students") or []) for form in forms))
            truncated_forms = [int(form.get("tingkatan")) for form in forms if form.get("truncated")]

            await db[AR_PRINT_JOB_COLLECTION].update_one(
                {"_id": job_oid},
                {
                    "$set": {
                        "total_targets": total_targets,
                        "progress_total": printable_total,
                        "printed_students_total": 0,
                        "message": "Menjana PDF server-side...",
                        "updated_at": datetime.now(timezone.utc),
                        "progress_percent": 15,
                        "meta": {
                            "truncated_forms": truncated_forms,
                            "selected_tingkatan": selected_tingkatan,
                            "limit_per_tingkatan": limit_per_tingkatan,
                            "grand_total_outstanding": payload.get("grand_total_outstanding"),
                        },
                    }
                },
            )

            if total_targets <= 0 or printable_total <= 0:
                raise ValueError("Tiada data tunggakan untuk dijana sebagai PDF")

            try:
                from reportlab.lib.pagesizes import A4
                from reportlab.lib import colors
                from reportlab.pdfgen import canvas
            except Exception as import_error:
                raise RuntimeError(
                    "Server belum ada pakej reportlab untuk jana PDF. Sila pasang dependency reportlab."
                ) from import_error

            output_meta = _get_print_job_output_path(job_id, year)
            file_name = output_meta["file_name"]
            file_path = output_meta["file_path"]

            c = canvas.Canvas(file_path, pagesize=A4)
            width, height = A4
            now_label = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
            tarikh_surat = str(payload.get("tarikh_surat") or datetime.now().strftime("%d/%m/%Y"))
            template = normalize_ar_reminder_letter_template(payload.get("template") or {})
            header = template.get("header") or {}
            body = template.get("body") or {}
            footer = template.get("footer") or {}
            attributes = template.get("attributes") or {}
            header_rows = header.get("rows") or []
            intro_rows = body.get("intro_rows") or []
            note_rows = body.get("note_rows") or []
            footer_rows = footer.get("rows") or []
            rujukan_prefix = str(attributes.get("rujukan_prefix") or "SR/KEW").strip() or "SR/KEW"
            butiran_tunggakan_title = str(attributes.get("butiran_tunggakan_title") or "Butiran Tunggakan:").strip()
            jumlah_label = str(attributes.get("jumlah_label") or "Jumlah Keseluruhan Tunggakan:").strip()
            jumlah_yuran_header = str(attributes.get("jumlah_yuran_header") or "Jumlah Yuran").strip()
            jumlah_bayaran_header = str(attributes.get("jumlah_bayaran_header") or "Jumlah Bayaran").strip()
            jumlah_tunggakan_header = str(attributes.get("jumlah_tunggakan_header") or "Jumlah Tunggakan").strip()
            dijana_sistem_label = str(attributes.get("dijana_sistem_label") or "Tarikh dan masa surat ini dijana oleh sistem:").strip()
            dijana_oleh_label = str(attributes.get("dijana_oleh_label") or "Dijana oleh:").strip()
            show_previous_year_row = _template_flag_enabled(attributes.get("show_previous_year_row"))
            include_system_generated_footer_note = _template_flag_enabled(attributes.get("include_system_generated_footer_note"))
            generated_date_segment = datetime.now().strftime("%Y%m%d")

            processed = 0
            total_pages = 0
            left = 40
            right = width - 40
            table_row_height = 17

            for form in forms:
                students = form.get("students") or []
                if not students:
                    continue
                tingkatan = int(form.get("tingkatan") or 0)
                for student in students:
                    total_pages += 1
                    y = height - 44
                    no_matriks = str(student.get("matric_number") or "-").strip() or "-"
                    nama_pelajar = str(student.get("student_name") or "-").strip() or "-"
                    current_year = int(_to_number(student.get("current_year") or year))
                    previous_year = int(_to_number(student.get("previous_year") or (current_year - 1)))
                    current_tingkatan = int(_to_number(student.get("current_tingkatan") or tingkatan or 1))
                    tingkatan_rows_source = student.get("tingkatan_rows") if isinstance(student.get("tingkatan_rows"), list) else []
                    tingkatan_rows = [
                        {
                            "tingkatan": int(_to_number(row.get("tingkatan") or 0)),
                            "label": str(row.get("label") or "").strip(),
                            "is_current": bool(row.get("is_current")),
                            "total_amount": round(_to_number(row.get("total_amount")), 2),
                            "paid_amount": round(_to_number(row.get("paid_amount")), 2),
                            "outstanding": round(_to_number(row.get("outstanding")), 2),
                        }
                        for row in tingkatan_rows_source
                        if int(_to_number(row.get("tingkatan") or 0)) > 0
                    ]
                    tingkatan_rows.sort(
                        key=lambda row: (
                            0 if (row.get("is_current") or int(_to_number(row.get("tingkatan") or 0)) == current_tingkatan) else 1,
                            int(_to_number(row.get("tingkatan") or 0)),
                        )
                    )
                    if not show_previous_year_row:
                        tingkatan_rows = [
                            row for row in tingkatan_rows
                            if row.get("is_current") or int(_to_number(row.get("tingkatan") or 0)) == current_tingkatan
                        ]
                    if not tingkatan_rows:
                        fallback_outstanding = round(_to_number(student.get("outstanding")), 2)
                        tingkatan_rows = [{
                            "tingkatan": current_tingkatan,
                            "label": f"Tingkatan {current_tingkatan} (Semasa)",
                            "is_current": True,
                            "total_amount": fallback_outstanding,
                            "paid_amount": 0.0,
                            "outstanding": fallback_outstanding,
                        }]
                    tingkatan_rows = tingkatan_rows[:8]

                    nilaisemasa = round(
                        sum(
                            _to_number(row.get("outstanding"))
                            for row in tingkatan_rows
                            if row.get("is_current") or int(_to_number(row.get("tingkatan") or 0)) == current_tingkatan
                        ),
                        2,
                    )
                    nilaisebelum = round(
                        sum(
                            _to_number(row.get("outstanding"))
                            for row in tingkatan_rows
                            if not (row.get("is_current") or int(_to_number(row.get("tingkatan") or 0)) == current_tingkatan)
                        ),
                        2,
                    )
                    total_paid_tingkatan_rows = round(sum(_to_number(row.get("paid_amount")) for row in tingkatan_rows), 2)
                    jumlah_tertunggak = round(
                        _to_number(student.get("total_outstanding")) or sum(_to_number(row.get("outstanding")) for row in tingkatan_rows),
                        2,
                    )
                    rujukan_surat = str(student.get("rujukan_surat") or f"{rujukan_prefix}/{no_matriks}/{generated_date_segment}").strip()

                    tokens = {
                        "rujukan_surat": rujukan_surat,
                        "rujukan_prefix": rujukan_prefix,
                        "tarikh_surat": tarikh_surat,
                        "nama_pelajar": nama_pelajar,
                        "no_matriks": no_matriks,
                        "tahunsemasa_tertunggak": current_year,
                        "nilaisemasa_tertunggak": _format_money_plain(nilaisemasa),
                        "tahunsebelum_tertunggak": previous_year,
                        "nilaistahunsebelum_tertunggak": _format_money_plain(nilaisebelum),
                        "nilaistahunebelum_tertunggak": _format_money_plain(nilaisebelum),
                        "jumlah_tertunggak": _format_money_plain(jumlah_tertunggak),
                        "jumlah_bayaran": _format_money_plain(total_paid_tingkatan_rows),
                        "tingkatan_semasa": current_tingkatan,
                        "nama_penandatangan": attributes.get("nama_penandatangan") or "",
                        "jawatan_penandatangan": attributes.get("jawatan_penandatangan") or "",
                        "nama_maktab": attributes.get("nama_maktab") or "",
                    }

                    c.setFont("Helvetica-Bold", 13)
                    c.drawString(left, y, _truncate_pdf_text(header.get("title") or "SURAT PERINGATAN TUNGGAKAN YURAN", 78))
                    c.setFont("Helvetica", 9)
                    c.drawRightString(right, y + 1, f"Tingkatan {tingkatan} | Tahun {year}")
                    y -= 14

                    subtitle = _normalize_setting_line(header.get("subtitle"), max_len=180)
                    if subtitle:
                        c.setFont("Helvetica", 9)
                        c.drawString(left, y, _truncate_pdf_text(subtitle, 108))
                        y -= 12

                    for row_text in header_rows[:10]:
                        rendered = _apply_template_tokens(row_text, tokens)
                        if rendered.strip().upper().startswith("PER:"):
                            c.setFont("Helvetica-Bold", 9)
                        else:
                            c.setFont("Helvetica", 9)
                        c.drawString(left, y, _truncate_pdf_text(rendered, 110))
                        y -= 11

                    y -= 3
                    c.setFont("Helvetica", 9)
                    for row_text in intro_rows[:8]:
                        rendered = _apply_template_tokens(row_text, tokens)
                        c.drawString(left, y, _truncate_pdf_text(rendered, 112))
                        y -= 11

                    y -= 2
                    c.setFont("Helvetica-Bold", 9)
                    c.drawString(left, y, _truncate_pdf_text(butiran_tunggakan_title, 110))
                    y -= 13

                    table_left = left
                    table_right = right
                    col_tingkatan = 110
                    col_total = 130
                    col_paid = 120
                    col2 = table_left + col_tingkatan
                    col3 = col2 + col_total
                    col4 = col3 + col_paid
                    row_count = max(1, len(tingkatan_rows))
                    table_height = table_row_height * (1 + row_count)
                    header_y = y

                    c.setFillColor(colors.HexColor("#F1F5F9"))
                    c.rect(table_left, header_y - table_row_height, table_right - table_left, table_row_height, fill=1, stroke=0)
                    c.setFillColor(colors.black)
                    c.setFont("Helvetica-Bold", 9)
                    c.drawString(table_left + 6, header_y - 11, "Tingkatan")
                    c.drawRightString(col3 - 6, header_y - 11, _truncate_pdf_text(jumlah_yuran_header, 20))
                    c.drawRightString(col4 - 6, header_y - 11, _truncate_pdf_text(jumlah_bayaran_header, 20))
                    c.drawRightString(table_right - 6, header_y - 11, _truncate_pdf_text(jumlah_tunggakan_header, 20))
                    c.setStrokeColor(colors.HexColor("#CBD5E1"))
                    c.rect(table_left, header_y - table_height, table_right - table_left, table_height, fill=0, stroke=1)
                    c.line(col2, header_y, col2, header_y - table_height)
                    c.line(col3, header_y, col3, header_y - table_height)
                    c.line(col4, header_y, col4, header_y - table_height)

                    y_row = header_y - table_row_height
                    c.setFont("Helvetica", 9)
                    for row_index, tingkatan_row in enumerate(tingkatan_rows):
                        tingkatan_value = int(_to_number(tingkatan_row.get("tingkatan") or 0))
                        total_amount_value = round(_to_number(tingkatan_row.get("total_amount")), 2)
                        paid_amount_value = round(_to_number(tingkatan_row.get("paid_amount")), 2)
                        outstanding_value = round(_to_number(tingkatan_row.get("outstanding")), 2)
                        if row_index > 0:
                            c.line(table_left, y_row - table_row_height, table_right, y_row - table_row_height)
                            y_row -= table_row_height
                        if tingkatan_row.get("label"):
                            tingkatan_label = str(tingkatan_row.get("label"))
                        elif tingkatan_row.get("is_current") or tingkatan_value == current_tingkatan:
                            tingkatan_label = f"Tingkatan {tingkatan_value} (Semasa)"
                        else:
                            tingkatan_label = f"Tingkatan {tingkatan_value}"
                        c.drawString(table_left + 6, y_row - 11, _truncate_pdf_text(tingkatan_label, 38))
                        c.drawRightString(col3 - 6, y_row - 11, f"RM {_format_money_plain(total_amount_value)}")
                        c.drawRightString(col4 - 6, y_row - 11, f"RM {_format_money_plain(paid_amount_value)}")
                        c.drawRightString(table_right - 6, y_row - 11, f"RM {_format_money_plain(outstanding_value)}")

                    y = header_y - table_height - 14
                    c.setFont("Helvetica-Bold", 9)
                    c.drawString(left, y, _truncate_pdf_text(f"{jumlah_label} RM {_format_money_plain(jumlah_tertunggak)}", 112))
                    y -= 13

                    c.setFont("Helvetica", 8.8)
                    for row_text in note_rows[:8]:
                        rendered = _apply_template_tokens(row_text, tokens)
                        c.drawString(left, y, _truncate_pdf_text(rendered, 112))
                        y -= 10

                    y -= 3
                    for row_text in footer_rows[:8]:
                        rendered = _apply_template_tokens(row_text, tokens)
                        c.drawString(left, y, _truncate_pdf_text(rendered, 112))
                        y -= 9

                    if include_system_generated_footer_note:
                        y = max(y - 4, 46)
                        c.drawString(left, y, _truncate_pdf_text(f"{dijana_sistem_label} {now_label}", 112))
                        y -= 9
                        c.drawString(left, y, _truncate_pdf_text(f"{dijana_oleh_label} {triggered_by.get('full_name') or '-'}", 112))

                    c.showPage()
                    processed += 1
                    if processed % 100 == 0 or processed >= printable_total:
                        progress_percent = min(96, 15 + int((processed / max(printable_total, 1)) * 80))
                        await db[AR_PRINT_JOB_COLLECTION].update_one(
                            {"_id": job_oid},
                            {
                                "$set": {
                                    "progress_processed": processed,
                                    "progress_percent": progress_percent,
                                    "printed_students_total": processed,
                                    "message": f"Menjana PDF ({processed}/{printable_total})",
                                    "updated_at": datetime.now(timezone.utc),
                                }
                            },
                        )

            c.save()
            file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
            printed_students_total = int(sum(len(form.get("students") or []) for form in forms))
            status_for_log = "partial" if printed_students_total < total_targets else "success"
            failed_for_log = max(total_targets - printed_students_total, 0)

            await db[AR_PRINT_JOB_COLLECTION].update_one(
                {"_id": job_oid},
                {
                    "$set": {
                        "status": "completed",
                        "message": "PDF siap dijana.",
                        "progress_processed": printed_students_total,
                        "progress_total": printable_total,
                        "progress_percent": 100,
                        "printed_students_total": printed_students_total,
                        "file_name": file_name,
                        "file_path": file_path,
                        "file_size": int(file_size or 0),
                        "total_pages": total_pages,
                        "finished_at": datetime.now(timezone.utc),
                        "updated_at": datetime.now(timezone.utc),
                        "error": None,
                    }
                },
            )
            await _log_notification_report(
                db,
                channel="print",
                status=status_for_log,
                action_type="print_generate",
                year=year,
                tingkatan=selected_tingkatan,
                triggered_by=triggered_by,
                total_targets=total_targets,
                success_count=printed_students_total,
                failed_count=failed_for_log,
                meta={
                    "source": "server_pdf_job",
                    "job_id": job_id,
                    "forms": selected_tingkatan,
                    "limit_per_tingkatan": limit_per_tingkatan,
                    "total_pages": total_pages,
                    "truncated_forms": truncated_forms,
                },
            )
        except Exception as err:
            err_msg = _normalize_setting_line(str(err), max_len=500) or "Gagal jana PDF server-side"
            latest_job = await db[AR_PRINT_JOB_COLLECTION].find_one({"_id": job_oid}, {"total_targets": 1})
            failed_total = int((latest_job or {}).get("total_targets") or 0)
            await db[AR_PRINT_JOB_COLLECTION].update_one(
                {"_id": job_oid},
                {
                    "$set": {
                        "status": "failed",
                        "message": "Penjanaan PDF gagal.",
                        "error": err_msg,
                        "finished_at": datetime.now(timezone.utc),
                        "updated_at": datetime.now(timezone.utc),
                    }
                },
            )
            await _log_notification_report(
                db,
                channel="print",
                status="failed",
                action_type="print_generate",
                year=year,
                tingkatan=selected_tingkatan,
                triggered_by=triggered_by,
                total_targets=failed_total,
                success_count=0,
                failed_count=failed_total,
                error=err_msg,
                meta={
                    "source": "server_pdf_job",
                    "job_id": job_id,
                    "forms": selected_tingkatan,
                    "limit_per_tingkatan": limit_per_tingkatan,
                },
            )
        finally:
            _AR_PRINT_JOB_TASKS.pop(job_id, None)


def _start_print_job_task(job_id: str):
    task = asyncio.create_task(_run_reminder_print_job(job_id))
    _AR_PRINT_JOB_TASKS[job_id] = task

    def _cleanup(_task):
        _AR_PRINT_JOB_TASKS.pop(job_id, None)

    task.add_done_callback(_cleanup)


async def _run_bulk_notification_job(job_id: str):
    db = get_db()
    job_oid = _as_object_id_if_valid(job_id)
    job_doc = await db[AR_NOTIFICATION_JOB_COLLECTION].find_one({"_id": job_oid, "job_type": "bulk_reminder_notify"})
    if not job_doc:
        return

    year = int(job_doc.get("year") or datetime.now(timezone.utc).year)
    tingkatan = _normalize_tingkatan_value(job_doc.get("tingkatan"))
    channel = str(job_doc.get("channel") or "email").strip().lower()
    template_key = (job_doc.get("template_key") or "fee_reminder").strip() or "fee_reminder"
    push_template_key = (job_doc.get("push_template_key") or "reminder_full").strip() or "reminder_full"
    batch_size = int(job_doc.get("batch_size") or 20)
    if batch_size <= 0:
        batch_size = 1000000
    triggered_by = {
        "_id": job_doc.get("created_by"),
        "full_name": job_doc.get("created_by_name"),
        "role": job_doc.get("created_by_role"),
    }

    async with _AR_NOTIFICATION_JOB_SEMAPHORE:
        try:
            now = datetime.now(timezone.utc)
            await db[AR_NOTIFICATION_JOB_COLLECTION].update_one(
                {"_id": job_oid},
                {
                    "$set": {
                        "status": "running",
                        "message": "Mengumpul senarai penerima tertunggak...",
                        "started_at": now,
                        "updated_at": now,
                        "progress_percent": 3,
                    }
                },
            )

            raw_target_ids = job_doc.get("target_student_ids")
            if isinstance(raw_target_ids, list) and raw_target_ids:
                targets: List[str] = []
                seen_ids = set()
                for raw_sid in raw_target_ids:
                    sid = _id_str(raw_sid).strip()
                    if sid and sid not in seen_ids:
                        targets.append(sid)
                        seen_ids.add(sid)
            else:
                targets = await _get_bulk_reminder_targets(db, year=year, tingkatan=tingkatan)
            total_targets = len(targets)
            if total_targets <= 0:
                no_data_error = "Tiada pelajar tertunggak untuk tingkatan dipilih"
                await db[AR_NOTIFICATION_JOB_COLLECTION].update_one(
                    {"_id": job_oid},
                    {
                        "$set": {
                            "status": "failed",
                            "message": "Tiada data untuk dihantar.",
                            "error": no_data_error,
                            "progress_total": 0,
                            "progress_processed": 0,
                            "progress_percent": 100,
                            "failed_student_ids": [],
                            "finished_at": datetime.now(timezone.utc),
                            "updated_at": datetime.now(timezone.utc),
                        }
                    },
                )
                await _log_notification_report(
                    db,
                    channel=channel,
                    status="failed",
                    action_type="bulk",
                    year=year,
                    tingkatan=tingkatan,
                    total_targets=0,
                    success_count=0,
                    failed_count=0,
                    template_key=template_key if channel == "email" else None,
                    push_template_key=push_template_key if channel == "push" else None,
                    error=no_data_error,
                    meta={
                        **base_meta,
                        "source": "notification_job_queue",
                        "job_id": job_id,
                        "batch_size": batch_size,
                    },
                    triggered_by=triggered_by,
                )
                return

            await db[AR_NOTIFICATION_JOB_COLLECTION].update_one(
                {"_id": job_oid},
                {
                    "$set": {
                        "message": "Menghantar notifikasi pukal...",
                        "progress_total": total_targets,
                        "progress_processed": 0,
                        "success_count": 0,
                        "failed_count": 0,
                        "progress_percent": 5,
                        "updated_at": datetime.now(timezone.utc),
                    }
                },
            )

            sent = 0
            failed = 0
            errors = []
            failed_student_ids: List[str] = []
            sender_id = job_doc.get("created_by")
            sender_name = job_doc.get("created_by_name")
            sender_role = job_doc.get("created_by_role")
            update_every = max(10, min(batch_size, 100))

            for idx, sid in enumerate(targets, start=1):
                result = await _send_one_reminder(
                    db,
                    sid,
                    channel,
                    template_key,
                    push_template_key,
                    sender_id=sender_id,
                    sender_name=sender_name,
                    sender_role=sender_role,
                    reference_year=year,
                )
                if result.get("ok"):
                    sent += 1
                else:
                    failed += 1
                    failed_student_ids.append(sid)
                    if len(errors) < 100:
                        errors.append({"student_id": sid, "error": result.get("error", "Unknown")})

                if idx % update_every == 0 or idx >= total_targets:
                    progress_percent = min(99, int((idx / max(total_targets, 1)) * 100))
                    await db[AR_NOTIFICATION_JOB_COLLECTION].update_one(
                        {"_id": job_oid},
                        {
                            "$set": {
                                "progress_processed": idx,
                                "progress_percent": progress_percent,
                                "success_count": sent,
                                "failed_count": failed,
                                "failed_student_ids": failed_student_ids,
                                "message": f"Menghantar notifikasi ({idx}/{total_targets})",
                                "updated_at": datetime.now(timezone.utc),
                            }
                        },
                    )

                if batch_size > 0 and idx % batch_size == 0 and idx < total_targets:
                    await asyncio.sleep(1)

            report_status = "success" if failed == 0 else ("failed" if sent == 0 else "partial")
            final_job_status = "failed" if sent == 0 else "completed"
            await db[AR_NOTIFICATION_JOB_COLLECTION].update_one(
                {"_id": job_oid},
                {
                    "$set": {
                        "status": final_job_status,
                        "message": "Job notifikasi selesai diproses." if final_job_status == "completed" else "Job notifikasi gagal (tiada penghantaran berjaya).",
                        "progress_processed": total_targets,
                        "progress_total": total_targets,
                        "progress_percent": 100,
                        "success_count": sent,
                        "failed_count": failed,
                        "failed_student_ids": failed_student_ids,
                        "error": errors[0].get("error") if errors and final_job_status == "failed" else None,
                        "meta": {
                            **base_meta,
                            "batch_size": batch_size,
                            "error_samples": errors[:20],
                            "channel": channel,
                        },
                        "finished_at": datetime.now(timezone.utc),
                        "updated_at": datetime.now(timezone.utc),
                    }
                },
            )
            await _log_notification_report(
                db,
                channel=channel,
                status=report_status,
                action_type="bulk",
                year=year,
                tingkatan=tingkatan,
                total_targets=total_targets,
                success_count=sent,
                failed_count=failed,
                template_key=template_key if channel == "email" else None,
                push_template_key=push_template_key if channel == "push" else None,
                error=errors[0].get("error") if errors else None,
                meta={
                    **base_meta,
                    "source": "notification_job_queue",
                    "job_id": job_id,
                    "batch_size": batch_size,
                    "error_samples": errors[:10],
                },
                triggered_by=triggered_by,
            )
        except Exception as err:
            err_msg = _normalize_setting_line(str(err), max_len=500) or "Gagal memproses job notifikasi pukal"
            latest = await db[AR_NOTIFICATION_JOB_COLLECTION].find_one(
                {"_id": job_oid},
                {"progress_total": 1, "progress_processed": 1, "success_count": 1, "failed_count": 1, "failed_student_ids": 1}
            )
            total_targets = int((latest or {}).get("progress_total") or 0)
            current_failed = int((latest or {}).get("failed_count") or 0)
            current_success = int((latest or {}).get("success_count") or 0)
            if total_targets and current_failed <= 0:
                current_failed = max(total_targets - current_success, 0)
            await db[AR_NOTIFICATION_JOB_COLLECTION].update_one(
                {"_id": job_oid},
                {
                    "$set": {
                        "status": "failed",
                        "message": "Job notifikasi gagal.",
                        "error": err_msg,
                        "failed_student_ids": (latest or {}).get("failed_student_ids") or [],
                        "finished_at": datetime.now(timezone.utc),
                        "updated_at": datetime.now(timezone.utc),
                    }
                },
            )
            await _log_notification_report(
                db,
                channel=channel,
                status="failed",
                action_type="bulk",
                year=year,
                tingkatan=tingkatan,
                total_targets=total_targets,
                success_count=current_success,
                failed_count=current_failed,
                template_key=template_key if channel == "email" else None,
                push_template_key=push_template_key if channel == "push" else None,
                error=err_msg,
                meta={
                    **base_meta,
                    "source": "notification_job_queue",
                    "job_id": job_id,
                    "batch_size": batch_size,
                },
                triggered_by=triggered_by,
            )
        finally:
            _AR_NOTIFICATION_JOB_TASKS.pop(job_id, None)


def _start_notification_job_task(job_id: str):
    task = asyncio.create_task(_run_bulk_notification_job(job_id))
    _AR_NOTIFICATION_JOB_TASKS[job_id] = task

    def _cleanup(_task):
        _AR_NOTIFICATION_JOB_TASKS.pop(job_id, None)

    task.add_done_callback(_cleanup)


# ==================== INVOICES (student_yuran as invoice) ====================


@router.get("/invoices")
async def list_invoices(
    year: Optional[int] = Query(None),
    student_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    """Senarai invoice (rekod student_yuran). Status: pending, partial, paid."""
    _require_ar_roles(current_user)
    db = get_db()
    query = {}
    if year:
        query["tahun"] = year
    if student_id:
        query["student_id"] = _as_object_id_if_valid(student_id)
    if status:
        query["status"] = status
    skip = (page - 1) * limit
    total = await db.student_yuran.count_documents(query)
    cursor = db.student_yuran.find(query).sort("created_at", -1).skip(skip).limit(limit)
    rows = []
    as_of = datetime.now(timezone.utc).date()
    for r in await cursor.to_list(limit):
        balance = (r.get("total_amount") or 0) - (r.get("paid_amount") or 0)
        due = r.get("due_date")
        rows.append({
            "id": str(r["_id"]),
            "student_id": str(r.get("student_id")),
            "student_name": r.get("student_name"),
            "matric_number": r.get("matric_number"),
            "set_yuran_nama": r.get("set_yuran_nama"),
            "tahun": r.get("tahun"),
            "tingkatan": r.get("tingkatan"),
            "total_amount": r.get("total_amount"),
            "paid_amount": r.get("paid_amount"),
            "balance": round(balance, 2),
            "status": r.get("status"),
            "due_date": due,
            "aging_bucket": _aging_bucket(due, as_of),
            "created_at": r.get("created_at"),
        })
    return {"total": total, "page": page, "limit": limit, "data": rows}


# ==================== SUB-LEDGER PER STUDENT ====================


@router.get("/subledger/{student_id}")
async def get_student_subledger(
    student_id: str,
    year: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Sub-ledger satu pelajar: senarai invoice dan total outstanding."""
    _require_ar_roles(current_user)
    db = get_db()
    query = {"student_id": _as_object_id_if_valid(student_id)}
    if year:
        query["tahun"] = year
    records = await db.student_yuran.find(query).sort("tahun", -1).to_list(100)
    invoices = []
    total_outstanding = 0.0
    as_of = datetime.now(timezone.utc).date()
    for r in records:
        balance = (r.get("total_amount") or 0) - (r.get("paid_amount") or 0)
        total_outstanding += balance
        invoices.append({
            "id": str(r["_id"]),
            "set_yuran_nama": r.get("set_yuran_nama"),
            "tahun": r.get("tahun"),
            "total_amount": r.get("total_amount"),
            "paid_amount": r.get("paid_amount"),
            "balance": round(balance, 2),
            "status": r.get("status"),
            "due_date": r.get("due_date"),
            "aging_bucket": _aging_bucket(r.get("due_date"), as_of),
        })
    student = await db.students.find_one({"_id": _as_object_id_if_valid(student_id)})
    risk_data = {}
    try:
        from services.ar_risk import compute_student_risk
        y = year or datetime.now(timezone.utc).year
        risk_data = await compute_student_risk(db, student_id, y)
    except Exception:
        pass
    return {
        "student_id": student_id,
        "student_name": student.get("full_name") if student else None,
        "matric_number": student.get("matric_number") if student else None,
        "total_outstanding": round(total_outstanding, 2),
        "invoices": invoices,
        "risk_score": risk_data.get("risk_score"),
        "suggested_actions": risk_data.get("suggested_actions", []),
    }


@router.get("/subledger")
async def list_subledgers(
    year: Optional[int] = Query(None),
    block: Optional[str] = Query(None),
    tingkatan: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
):
    """Senarai sub-ledger semua pelajar yang ada outstanding."""
    _require_ar_roles(current_user)
    db = get_db()
    query = {}
    if year:
        query["tahun"] = year
    if tingkatan is not None:
        query["tingkatan"] = tingkatan

    block_student_ids = None
    if block:
        students_in_block = await db.students.find({"block_name": block}).to_list(10000)
        block_student_ids = {_id_str(s.get("_id")) for s in students_in_block if s.get("_id")}

    records = await db.student_yuran.find(query).to_list(50000)
    grouped: Dict[str, Dict[str, Any]] = {}
    for r in records:
        sid = r.get("student_id")
        if sid is None:
            continue
        sid_str = _id_str(sid)
        if block_student_ids is not None and sid_str not in block_student_ids:
            continue
        balance = _balance_of(r)
        if balance <= 0:
            continue
        if sid_str not in grouped:
            grouped[sid_str] = {
                "student_id": sid_str,
                "total_outstanding": 0.0,
                "invoice_count": 0,
            }
        grouped[sid_str]["total_outstanding"] += balance
        grouped[sid_str]["invoice_count"] += 1

    ordered = sorted(grouped.values(), key=lambda x: x["total_outstanding"], reverse=True)
    total_students = len(ordered)
    start = (page - 1) * limit
    page_rows = ordered[start : start + limit]
    student_ids = [_as_object_id_if_valid(r["student_id"]) for r in page_rows if r.get("student_id")]
    students = []
    if student_ids:
        students = await db.students.find({"_id": {"$in": student_ids}}).to_list(len(student_ids))
    students_by_id = {str(s["_id"]): s for s in students}
    rows = []
    for g in page_rows:
        sid_str = g.get("student_id", "")
        s = students_by_id.get(sid_str)
        rows.append({
            "student_id": sid_str,
            "student_name": s.get("full_name") if s else None,
            "matric_number": s.get("matric_number") if s else None,
            "block_name": s.get("block_name") if s else None,
            "total_outstanding": round(g.get("total_outstanding", 0), 2),
            "invoice_count": g.get("invoice_count", 0),
        })
    return {
        "total_students": total_students,
        "page": page,
        "limit": limit,
        "data": rows,
    }


# ==================== AGING ====================


@router.get("/aging")
async def get_aging_summary(
    year: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Ringkasan aging: 0-30, 31-60, 61-90, 90+ hari."""
    _require_ar_roles(current_user)
    db = get_db()
    query = {}
    if year:
        query["tahun"] = year
    records = await db.student_yuran.find(query).to_list(10000)
    as_of = datetime.now(timezone.utc).date()
    buckets = {"0_30": 0.0, "31_60": 0.0, "61_90": 0.0, "90_plus": 0.0, "no_due": 0.0}
    for r in records:
        balance = _balance_of(r)
        if balance <= 0:
            continue
        b = _aging_bucket(r.get("due_date"), as_of)
        buckets[b] = buckets.get(b, 0) + balance
    return {
        "year": year,
        "as_of": as_of.isoformat(),
        "aging": {
            "0_30": round(buckets.get("0_30", 0), 2),
            "31_60": round(buckets.get("31_60", 0), 2),
            "61_90": round(buckets.get("61_90", 0), 2),
            "90_plus": round(buckets.get("90_plus", 0), 2),
            "no_due": round(buckets.get("no_due", 0), 2),
        },
        "total_outstanding": round(sum(buckets.values()), 2),
    }


# ==================== DASHBOARD ====================


@router.get("/dashboard")
async def get_ar_dashboard(
    year: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Dashboard AR: total AR, aging, top outstanding, collection rate."""
    _require_ar_roles(current_user)
    db = get_db()
    y = year or datetime.now(timezone.utc).year
    query = {"tahun": y}
    all_sy = await db.student_yuran.find(query).to_list(20000)
    total_expected = sum(r.get("total_amount", 0) for r in all_sy)
    total_collected = sum(r.get("paid_amount", 0) for r in all_sy)
    total_outstanding = total_expected - total_collected
    collection_rate = round((total_collected / total_expected * 100), 1) if total_expected else 0
    by_status = {"pending": 0, "partial": 0, "paid": 0}
    for r in all_sy:
        s = r.get("status", "pending")
        if s in by_status:
            by_status[s] += 1
    as_of = datetime.now(timezone.utc).date()
    buckets = {"0_30": 0.0, "31_60": 0.0, "61_90": 0.0, "90_plus": 0.0}
    for r in all_sy:
        balance = _balance_of(r)
        if balance <= 0:
            continue
        b = _aging_bucket(r.get("due_date"), as_of)
        if b in buckets:
            buckets[b] += balance

    top_outstanding: Dict[str, float] = {}
    for r in all_sy:
        balance = _balance_of(r)
        if balance <= 0:
            continue
        sid = r.get("student_id")
        if sid is None:
            continue
        sid_str = _id_str(sid)
        top_outstanding[sid_str] = top_outstanding.get(sid_str, 0.0) + balance

    top = sorted(
        [{"student_id": sid, "outstanding": amt} for sid, amt in top_outstanding.items()],
        key=lambda x: x["outstanding"],
        reverse=True,
    )[:10]

    student_ids = [_as_object_id_if_valid(x["student_id"]) for x in top if x.get("student_id")]
    students = await db.students.find({"_id": {"$in": student_ids}}).to_list(len(student_ids) or 10)
    students_by_id = {str(s["_id"]): s for s in students}
    from services.ar_risk import compute_student_risk
    top_list = []
    for t in top:
        sid = t.get("student_id", "")
        risk_data = {}
        try:
            risk_data = await compute_student_risk(db, sid, y)
        except Exception:
            pass
        top_list.append({
            "student_id": sid,
            "student_name": students_by_id.get(sid, {}).get("full_name"),
            "matric_number": students_by_id.get(sid, {}).get("matric_number"),
            "outstanding": round(t.get("outstanding", 0), 2),
            "risk_score": risk_data.get("risk_score"),
            "suggested_actions": risk_data.get("suggested_actions", []),
        })
    return {
        "year": y,
        "total_expected": round(total_expected, 2),
        "total_collected": round(total_collected, 2),
        "total_outstanding": round(total_outstanding, 2),
        "collection_rate": collection_rate,
        "by_status": by_status,
        "aging": {k: round(v, 2) for k, v in buckets.items()},
        "top_10_outstanding": top_list,
    }


@router.get("/outstanding-by-tingkatan")
async def get_outstanding_by_tingkatan(
    tingkatan: int = Query(..., ge=1, le=5, description="Tingkatan 1-5"),
    year: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    """Senarai pelajar tertunggak mengikut tingkatan, dengan pagination dan status notifikasi terakhir (e-mel/push)."""
    _require_ar_roles(current_user)
    db = get_db()
    y = year or datetime.now(timezone.utc).year

    outstanding_rows = await _aggregate_outstanding_by_student(db, y)
    if not outstanding_rows:
        return {"total": 0, "page": page, "limit": limit, "tingkatan": tingkatan, "year": y, "data": []}

    form_students = await db.students.find(
        {
            "$or": [
                {"form": tingkatan},
                {"tingkatan": tingkatan},
                {"form": str(tingkatan)},
                {"tingkatan": str(tingkatan)},
            ]
        },
        {"full_name": 1, "matric_number": 1, "form": 1, "tingkatan": 1},
    ).to_list(20000)
    if not form_students:
        return {"total": 0, "page": page, "limit": limit, "tingkatan": tingkatan, "year": y, "data": []}

    students_by_id = {_id_str(s.get("_id")): s for s in form_students}
    form_student_ids = set(students_by_id.keys())

    outstanding_by_student: Dict[str, float] = {}
    ordered: List[str] = []
    for row in outstanding_rows:
        sid_str = _id_str(row.get("_id"))
        if not sid_str or sid_str not in form_student_ids:
            continue
        outstanding_by_student[sid_str] = round(_to_number(row.get("outstanding")), 2)
        ordered.append(sid_str)

    total = len(ordered)
    start = (page - 1) * limit
    page_ids = ordered[start : start + limit]
    if not page_ids:
        return {"total": total, "page": page, "limit": limit, "tingkatan": tingkatan, "year": y, "data": []}

    page_id_candidates = []
    for sid in page_ids:
        sid_obj = _as_object_id_if_valid(sid)
        page_id_candidates.append(sid_obj)
        if not isinstance(sid_obj, str):
            page_id_candidates.append(str(sid_obj))

    from services.ar_risk import compute_student_risk
    # Last reminder per student (ar_reminder_log)
    logs = await db.ar_reminder_log.find({"student_id": {"$in": page_id_candidates}}).sort("sent_at", -1).to_list(
        max(len(page_ids) * 5, 100)
    )
    last_by_student = {}
    for log in logs:
        sid = _id_str(log.get("student_id"))
        if sid not in last_by_student:
            sent_at = log.get("sent_at")
            if hasattr(sent_at, "isoformat"):
                sent_at_value = sent_at.isoformat()
            elif sent_at is None:
                sent_at_value = None
            else:
                sent_at_value = str(sent_at)
            last_by_student[sid] = {
                "channel": log.get("channel", "push"),
                "sent_at": sent_at_value,
            }
    data = []
    for sid in page_ids:
        sid_str = _id_str(sid)
        s = students_by_id.get(sid_str, {})
        risk_data = {}
        try:
            risk_data = await compute_student_risk(db, sid_str, y)
        except Exception:
            pass
        data.append({
            "student_id": sid_str,
            "student_name": s.get("full_name"),
            "matric_number": s.get("matric_number"),
            "outstanding": round(outstanding_by_student.get(sid_str, 0), 2),
            "risk_score": risk_data.get("risk_score"),
            "last_reminder": last_by_student.get(sid_str),
        })
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "tingkatan": tingkatan,
        "year": y,
        "data": data,
    }


class ArReminderLetterHeaderUpdate(BaseModel):
    title: Optional[str] = "SURAT PERINGATAN TUNGGAKAN YURAN"
    subtitle: Optional[str] = "Tunggakan yuran persekolahan"
    rows: List[str] = Field(default_factory=list)


class ArReminderLetterBodyUpdate(BaseModel):
    intro_rows: List[str] = Field(default_factory=list)
    note_rows: List[str] = Field(default_factory=list)


class ArReminderLetterFooterUpdate(BaseModel):
    rows: List[str] = Field(default_factory=list)


class ArReminderLetterAttributesUpdate(BaseModel):
    nama_penandatangan: Optional[str] = "NAMA PENANDATANGAN"
    jawatan_penandatangan: Optional[str] = "JAWATAN PENANDATANGAN"
    nama_maktab: Optional[str] = "NAMA MAKTAB"
    rujukan_prefix: Optional[str] = "SR/KEW"
    butiran_tunggakan_title: Optional[str] = "Butiran Tunggakan:"
    jumlah_label: Optional[str] = "Jumlah Keseluruhan Tunggakan:"
    tahun_semasa_label: Optional[str] = "Tahun Semasa"
    tahun_sebelum_label: Optional[str] = "Tahun Sebelum"
    jumlah_yuran_header: Optional[str] = "Jumlah Yuran"
    jumlah_bayaran_header: Optional[str] = "Jumlah Bayaran"
    jumlah_tunggakan_header: Optional[str] = "Jumlah Tunggakan"
    dijana_sistem_label: Optional[str] = "Tarikh dan masa surat ini dijana oleh sistem:"
    dijana_oleh_label: Optional[str] = "Dijana oleh:"
    show_previous_year_row: Optional[str] = "1"
    include_system_generated_footer_note: Optional[str] = "1"


class ArReminderLetterTemplateUpdate(BaseModel):
    header: ArReminderLetterHeaderUpdate = Field(default_factory=ArReminderLetterHeaderUpdate)
    body: ArReminderLetterBodyUpdate = Field(default_factory=ArReminderLetterBodyUpdate)
    footer: ArReminderLetterFooterUpdate = Field(default_factory=ArReminderLetterFooterUpdate)
    attributes: ArReminderLetterAttributesUpdate = Field(default_factory=ArReminderLetterAttributesUpdate)


@router.get("/reminder-letter-template")
async def get_ar_reminder_letter_template(current_user: dict = Depends(get_current_user)):
    _require_ar_roles(current_user)
    db = get_db()
    doc = await db.settings.find_one({"key": SETTINGS_KEY_AR_REMINDER_LETTER_TEMPLATE})
    template = normalize_ar_reminder_letter_template(doc.get("template") if doc else None)
    return {
        "template": template,
        "updated_at": doc.get("updated_at") if doc else None,
        "updated_by": doc.get("updated_by_name") if doc else None,
    }


@router.put("/reminder-letter-template")
async def update_ar_reminder_letter_template(
    data: ArReminderLetterTemplateUpdate,
    current_user: dict = Depends(get_current_user),
):
    _require_template_editor_roles(current_user)
    db = get_db()
    template = normalize_ar_reminder_letter_template(data.dict())
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.settings.update_one(
        {"key": SETTINGS_KEY_AR_REMINDER_LETTER_TEMPLATE},
        {
            "$set": {
                "key": SETTINGS_KEY_AR_REMINDER_LETTER_TEMPLATE,
                "template": template,
                "updated_at": now_iso,
                "updated_by": str(current_user.get("_id")),
                "updated_by_name": current_user.get("full_name", ""),
            }
        },
        upsert=True,
    )
    return {
        "template": template,
        "updated_at": now_iso,
        "updated_by": current_user.get("full_name", ""),
    }


@router.get("/outstanding-reminder-print-data")
async def get_outstanding_reminder_print_data(
    year: Optional[int] = Query(None),
    tingkatan: Optional[List[int]] = Query(None, description="Boleh ulang parameter: ?tingkatan=1&tingkatan=2"),
    limit_per_tingkatan: int = Query(5000, ge=1, le=50000),
    current_user: dict = Depends(get_current_user),
):
    """Data cetak surat peringatan yuran mengikut tingkatan (dioptimumkan untuk dataset besar)."""
    _require_ar_roles(current_user)
    db = get_db()
    y = year or datetime.now(timezone.utc).year
    selected_tingkatan = _normalize_selected_tingkatan(tingkatan)
    payload = await _build_outstanding_reminder_payload(
        db,
        year=y,
        selected_tingkatan=selected_tingkatan,
        limit_per_tingkatan=limit_per_tingkatan,
        generated_by=current_user.get("full_name", ""),
    )
    forms = payload.get("forms") or []
    grand_total_students = int(payload.get("grand_total_students") or 0)
    grand_total_outstanding = round(_to_number(payload.get("grand_total_outstanding")), 2)
    status_for_log = "success" if grand_total_students > 0 else "failed"
    error_for_log = None if grand_total_students > 0 else "Tiada data tunggakan untuk dijana sebagai cetakan"
    await _log_notification_report(
        db,
        channel="print",
        status=status_for_log,
        action_type="print_generate",
        year=y,
        tingkatan=selected_tingkatan,
        triggered_by=current_user,
        total_targets=grand_total_students,
        success_count=grand_total_students,
        failed_count=0,
        error=error_for_log,
        meta={
            "forms": selected_tingkatan,
            "limit_per_tingkatan": limit_per_tingkatan,
            "grand_total_outstanding": grand_total_outstanding,
            "printed_students_total": sum(int(form.get("printed_students", 0)) for form in forms),
        },
    )
    return payload


class ArPrintJobCreateBody(BaseModel):
    year: Optional[int] = None
    tingkatan: List[int] = Field(default_factory=lambda: [1, 2, 3, 4, 5])
    limit_per_tingkatan: int = Field(default=5000, ge=100, le=50000)


@router.post("/print-jobs")
async def create_ar_print_job(
    body: ArPrintJobCreateBody,
    current_user: dict = Depends(get_current_user),
):
    """Queue background job untuk jana PDF surat peringatan AR."""
    _require_print_job_roles(current_user)
    db = get_db()

    year_value = int(body.year or datetime.now(timezone.utc).year)
    selected_tingkatan = _normalize_selected_tingkatan(body.tingkatan)
    limit_per_tingkatan = int(body.limit_per_tingkatan or 5000)
    now = datetime.now(timezone.utc)

    doc = {
        "job_type": "reminder_print_pdf",
        "status": "queued",
        "year": year_value,
        "tingkatan": selected_tingkatan,
        "limit_per_tingkatan": limit_per_tingkatan,
        "progress_total": 0,
        "progress_processed": 0,
        "progress_percent": 0,
        "total_targets": 0,
        "printed_students_total": 0,
        "message": "Job diterima. Menunggu giliran pemprosesan.",
        "error": None,
        "file_name": None,
        "file_path": None,
        "file_size": 0,
        "created_at": now,
        "started_at": None,
        "finished_at": None,
        "updated_at": now,
        "created_by": str(current_user.get("_id")) if current_user.get("_id") is not None else None,
        "created_by_name": current_user.get("full_name", ""),
        "created_by_role": current_user.get("role"),
        "meta": {
            "requested_from": "ar_outstanding_ui",
            "tingkatan_count": len(selected_tingkatan),
        },
    }
    insert_result = await db[AR_PRINT_JOB_COLLECTION].insert_one(doc)
    job_id = str(insert_result.inserted_id)
    _start_print_job_task(job_id)
    created_doc = await db[AR_PRINT_JOB_COLLECTION].find_one({"_id": insert_result.inserted_id})
    return {"job": _serialize_print_job(created_doc or {"_id": insert_result.inserted_id, **doc})}


@router.get("/print-jobs")
async def list_ar_print_jobs(
    year: Optional[int] = Query(None),
    status: Optional[str] = Query(None, description="queued | running | completed | failed"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    _require_ar_roles(current_user)
    db = get_db()
    query: Dict[str, Any] = {"job_type": "reminder_print_pdf"}
    if year is not None:
        query["year"] = int(year)
    if status:
        status_value = str(status).strip().lower()
        if status_value not in AR_PRINT_JOB_STATUSES:
            raise HTTPException(status_code=400, detail="status mesti queued/running/completed/failed")
        query["status"] = status_value

    skip = (page - 1) * limit
    total = await db[AR_PRINT_JOB_COLLECTION].count_documents(query)
    rows = await db[AR_PRINT_JOB_COLLECTION].find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "data": [_serialize_print_job(row) for row in rows],
    }


@router.get("/print-jobs/{job_id}")
async def get_ar_print_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    _require_ar_roles(current_user)
    db = get_db()
    doc = await db[AR_PRINT_JOB_COLLECTION].find_one(
        {"_id": _as_object_id_if_valid(job_id), "job_type": "reminder_print_pdf"}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Job tidak dijumpai")
    return {"job": _serialize_print_job(doc)}


@router.get("/print-jobs/{job_id}/download")
async def download_ar_print_job_pdf(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    _require_ar_roles(current_user)
    db = get_db()
    doc = await db[AR_PRINT_JOB_COLLECTION].find_one(
        {"_id": _as_object_id_if_valid(job_id), "job_type": "reminder_print_pdf"}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Job tidak dijumpai")
    if doc.get("status") != "completed":
        raise HTTPException(status_code=409, detail="PDF belum siap dijana")
    file_path = doc.get("file_path")
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Fail PDF tidak ditemui pada server")
    file_name = doc.get("file_name") or f"surat-peringatan-ar-{job_id}.pdf"
    return FileResponse(path=file_path, media_type="application/pdf", filename=file_name)


class ArNotificationJobCreateBody(BaseModel):
    tingkatan: int
    year: Optional[int] = None
    channel: str = "email"
    template_key: Optional[str] = None
    push_template_key: Optional[str] = None
    batch_size: int = Field(default=20, ge=0, le=200)


@router.post("/notification-jobs")
async def create_ar_notification_job(
    body: ArNotificationJobCreateBody,
    current_user: dict = Depends(get_current_user),
):
    """Queue background job untuk hantar notifikasi pukal (email/push)."""
    _require_ar_roles(current_user)
    db = get_db()
    channel = str(body.channel or "").strip().lower()
    if channel not in ("email", "push"):
        raise HTTPException(status_code=400, detail="channel mesti 'email' atau 'push'")
    tingkatan = _normalize_tingkatan_value(body.tingkatan)
    year_value = int(body.year or datetime.now(timezone.utc).year)
    batch_size = int(body.batch_size or 0)
    if batch_size <= 0:
        batch_size = 0
    template_key = (body.template_key or "fee_reminder").strip() or "fee_reminder"
    push_template_key = (body.push_template_key or "reminder_full").strip() or "reminder_full"
    now = datetime.now(timezone.utc)

    doc = {
        "job_type": "bulk_reminder_notify",
        "status": "queued",
        "year": year_value,
        "tingkatan": tingkatan,
        "channel": channel,
        "template_key": template_key if channel == "email" else None,
        "push_template_key": push_template_key if channel == "push" else None,
        "batch_size": batch_size,
        "progress_total": 0,
        "progress_processed": 0,
        "progress_percent": 0,
        "success_count": 0,
        "failed_count": 0,
        "failed_student_ids": [],
        "target_student_ids": [],
        "message": "Job diterima. Menunggu giliran pemprosesan.",
        "error": None,
        "created_at": now,
        "started_at": None,
        "finished_at": None,
        "updated_at": now,
        "created_by": str(current_user.get("_id")) if current_user.get("_id") is not None else None,
        "created_by_name": current_user.get("full_name", ""),
        "created_by_role": current_user.get("role"),
        "meta": {
            "requested_from": "ar_outstanding_ui",
            "batch_mode": "chunked" if batch_size > 0 else "all_at_once",
        },
    }
    insert_result = await db[AR_NOTIFICATION_JOB_COLLECTION].insert_one(doc)
    job_id = str(insert_result.inserted_id)
    _start_notification_job_task(job_id)
    created_doc = await db[AR_NOTIFICATION_JOB_COLLECTION].find_one({"_id": insert_result.inserted_id})
    return {"job": _serialize_notification_job(created_doc or {"_id": insert_result.inserted_id, **doc})}


@router.get("/notification-jobs")
async def list_ar_notification_jobs(
    year: Optional[int] = Query(None),
    status: Optional[str] = Query(None, description="queued | running | completed | failed"),
    channel: Optional[str] = Query(None, description="email | push"),
    tingkatan: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    _require_ar_roles(current_user)
    db = get_db()
    query: Dict[str, Any] = {"job_type": "bulk_reminder_notify"}
    if year is not None:
        query["year"] = int(year)
    if tingkatan is not None:
        query["tingkatan"] = _normalize_tingkatan_value(tingkatan)
    if status:
        status_value = str(status).strip().lower()
        if status_value not in AR_NOTIFICATION_JOB_STATUSES:
            raise HTTPException(status_code=400, detail="status mesti queued/running/completed/failed")
        query["status"] = status_value
    if channel:
        channel_value = str(channel).strip().lower()
        if channel_value not in ("email", "push"):
            raise HTTPException(status_code=400, detail="channel mesti email/push")
        query["channel"] = channel_value

    skip = (page - 1) * limit
    total = await db[AR_NOTIFICATION_JOB_COLLECTION].count_documents(query)
    rows = await db[AR_NOTIFICATION_JOB_COLLECTION].find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "data": [_serialize_notification_job(row) for row in rows],
    }


class RetryFailedNotificationJobsBatchBody(BaseModel):
    year: Optional[int] = None
    tingkatan: int
    channel: Optional[str] = None
    batch_size: int = Field(default=20, ge=0, le=200)
    max_jobs: int = Field(default=20, ge=1, le=100)


@router.post("/notification-jobs/retry-failed-batch")
async def retry_failed_ar_notification_jobs_batch(
    body: RetryFailedNotificationJobsBatchBody,
    current_user: dict = Depends(get_current_user),
):
    _require_ar_roles(current_user)
    db = get_db()
    year_value = int(body.year or datetime.now(timezone.utc).year)
    tingkatan_value = _normalize_tingkatan_value(body.tingkatan)
    channel_value = str(body.channel or "").strip().lower()
    if channel_value and channel_value not in ("email", "push"):
        raise HTTPException(status_code=400, detail="channel mesti email/push jika diisi")

    query: Dict[str, Any] = {
        "job_type": "bulk_reminder_notify",
        "year": year_value,
        "tingkatan": tingkatan_value,
        "status": {"$in": ["completed", "failed"]},
    }
    if channel_value:
        query["channel"] = channel_value

    scan_limit = min(500, max(int(body.max_jobs) * 5, 50))
    rows = await db[AR_NOTIFICATION_JOB_COLLECTION].find(query).sort("created_at", -1).limit(scan_limit).to_list(scan_limit)

    queued_jobs = []
    skipped = []
    for row in rows:
        if len(queued_jobs) >= int(body.max_jobs):
            break
        try:
            queued_job = await _queue_retry_notification_job(
                db,
                source_job=row,
                current_user=current_user,
                batch_size=int(body.batch_size),
                request_source="retry_failed_batch_notification_jobs",
            )
            queued_jobs.append(queued_job)
        except HTTPException as exc:
            skipped.append({
                "source_job_id": _id_str(row.get("_id")),
                "reason": str(exc.detail),
            })
        except Exception as exc:
            skipped.append({
                "source_job_id": _id_str(row.get("_id")),
                "reason": _normalize_setting_line(str(exc), max_len=160) or "Gagal queue retry",
            })

    return {
        "ok": True,
        "year": year_value,
        "tingkatan": tingkatan_value,
        "channel": channel_value or None,
        "scanned_jobs": len(rows),
        "queued_count": len(queued_jobs),
        "skipped_count": len(skipped),
        "queued_jobs": queued_jobs,
        "skipped_samples": skipped[:30],
    }


@router.get("/notification-jobs/{job_id}")
async def get_ar_notification_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    _require_ar_roles(current_user)
    db = get_db()
    doc = await db[AR_NOTIFICATION_JOB_COLLECTION].find_one(
        {"_id": _as_object_id_if_valid(job_id), "job_type": "bulk_reminder_notify"}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Job notifikasi tidak dijumpai")
    return {"job": _serialize_notification_job(doc)}


class RetryFailedNotificationJobBody(BaseModel):
    batch_size: int = Field(default=20, ge=0, le=200)


@router.post("/notification-jobs/{job_id}/retry-failed")
async def retry_failed_ar_notification_job(
    job_id: str,
    body: RetryFailedNotificationJobBody,
    current_user: dict = Depends(get_current_user),
):
    _require_ar_roles(current_user)
    db = get_db()
    source_job = await db[AR_NOTIFICATION_JOB_COLLECTION].find_one(
        {"_id": _as_object_id_if_valid(job_id), "job_type": "bulk_reminder_notify"}
    )
    if not source_job:
        raise HTTPException(status_code=404, detail="Job notifikasi asal tidak dijumpai")
    queued_job = await _queue_retry_notification_job(
        db,
        source_job=source_job,
        current_user=current_user,
        batch_size=int(body.batch_size),
        request_source="retry_failed_notification_job",
    )
    return {"job": queued_job}


@router.get("/notification-report")
async def get_ar_notification_report(
    year: Optional[int] = Query(None),
    tingkatan: Optional[int] = Query(None, description="1-5"),
    status: Optional[str] = Query(None, description="success | failed | partial"),
    channel: Optional[str] = Query(None, description="email | push | print"),
    action_type: Optional[str] = Query(None, description="single | bulk | print_generate"),
    source: Optional[str] = Query(None, description="queue | manual"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    """Laporan status notifikasi AR dan janaan cetakan surat (berjaya/gagal)."""
    _require_ar_roles(current_user)
    db = get_db()

    query_conditions: List[Dict[str, Any]] = []
    if year is not None:
        query_conditions.append({"year": year})
    if tingkatan is not None:
        query_conditions.append({"tingkatan": _normalize_tingkatan_value(tingkatan)})
    if status:
        query_conditions.append({"status": str(status).strip().lower()})
    if channel:
        query_conditions.append({"channel": str(channel).strip().lower()})
    if action_type:
        query_conditions.append({"action_type": str(action_type).strip().lower()})
    source_filter = _build_report_source_filter(source)
    if source_filter:
        query_conditions.append(source_filter)

    if not query_conditions:
        query: Dict[str, Any] = {}
    elif len(query_conditions) == 1:
        query = query_conditions[0]
    else:
        query = {"$and": query_conditions}

    skip = (page - 1) * limit
    total = await db[AR_NOTIFICATION_REPORT_COLLECTION].count_documents(query)
    rows = await db[AR_NOTIFICATION_REPORT_COLLECTION].find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)

    data = []
    for row in rows:
        created_at = row.get("created_at")
        if hasattr(created_at, "isoformat"):
            created_at_value = created_at.isoformat()
        elif created_at is None:
            created_at_value = None
        else:
            created_at_value = str(created_at)
        data.append({
            "id": _id_str(row.get("_id")),
            "channel": row.get("channel"),
            "status": row.get("status"),
            "action_type": row.get("action_type"),
            "year": row.get("year"),
            "tingkatan": row.get("tingkatan"),
            "student_id": _id_str(row.get("student_id")) if row.get("student_id") is not None else None,
            "total_targets": int(row.get("total_targets") or 0),
            "success_count": int(row.get("success_count") or 0),
            "failed_count": int(row.get("failed_count") or 0),
            "template_key": row.get("template_key"),
            "push_template_key": row.get("push_template_key"),
            "error": row.get("error"),
            "meta": row.get("meta") or {},
            "source": _normalize_report_source(row.get("meta")),
            "created_at": created_at_value,
            "triggered_by_name": row.get("triggered_by_name"),
            "triggered_by_role": row.get("triggered_by_role"),
        })

    summary_pipeline = [
        {"$match": query},
        {
            "$group": {
                "_id": "$status",
                "count": {"$sum": 1},
                "success_count": {"$sum": {"$ifNull": ["$success_count", 0]}},
                "failed_count": {"$sum": {"$ifNull": ["$failed_count", 0]}},
            }
        },
    ]
    summary_rows = await db[AR_NOTIFICATION_REPORT_COLLECTION].aggregate(summary_pipeline).to_list(20)
    summary = {item.get("_id") or "unknown": {
        "records": int(item.get("count") or 0),
        "success_count": int(item.get("success_count") or 0),
        "failed_count": int(item.get("failed_count") or 0),
    } for item in summary_rows}

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "summary": summary,
        "data": data,
    }


class ManualNotificationReportLogBody(BaseModel):
    channel: str = "print"
    status: str = "failed"
    action_type: str = "print_generate"
    year: Optional[int] = None
    tingkatan: Optional[List[int]] = None
    total_targets: Optional[int] = 0
    success_count: Optional[int] = 0
    failed_count: Optional[int] = 0
    error: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None


@router.post("/notification-report/log")
async def create_manual_notification_report_log(
    body: ManualNotificationReportLogBody,
    current_user: dict = Depends(get_current_user),
):
    """Log manual event untuk laporan notifikasi (contoh: cetakan gagal kerana pop-up disekat)."""
    _require_ar_roles(current_user)
    channel = str(body.channel or "").strip().lower()
    status = str(body.status or "").strip().lower()
    action_type = str(body.action_type or "").strip().lower()
    if channel not in ("email", "push", "print"):
        raise HTTPException(status_code=400, detail="channel mesti email/push/print")
    if status not in ("success", "failed", "partial"):
        raise HTTPException(status_code=400, detail="status mesti success/failed/partial")
    if action_type not in ("single", "bulk", "print_generate"):
        raise HTTPException(status_code=400, detail="action_type mesti single/bulk/print_generate")

    report_year = body.year or datetime.now(timezone.utc).year
    meta_payload = dict(body.meta or {})
    if not str(meta_payload.get("source") or "").strip():
        meta_payload["source"] = "manual_log"
    await _log_notification_report(
        get_db(),
        channel=channel,
        status=status,
        action_type=action_type,
        year=report_year,
        tingkatan=body.tingkatan or None,
        total_targets=body.total_targets or 0,
        success_count=body.success_count or 0,
        failed_count=body.failed_count or 0,
        error=body.error,
        meta=meta_payload,
        triggered_by=current_user,
    )
    return {"ok": True}


# ==================== RISK SCORE ====================


@router.get("/risk/{student_id}")
async def get_student_risk(
    student_id: str,
    year: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Skor risiko pelajar (low/medium/high) dan cadangan tindakan berdasarkan tertunggak & sejarah bayaran."""
    _require_ar_roles(current_user)
    from services.ar_risk import compute_student_risk
    db = get_db()
    try:
        result = await compute_student_risk(db, student_id, year)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== SEND REMINDER ====================


# Pilihan template push (mesej notifikasi dalam app + FCM) — bendahari pilih mana satu
PUSH_TEMPLATE_OPTIONS = [
    {"key": "reminder_full", "name": "Peringatan penuh (dengan nama & jumlah)", "title": "Peringatan Yuran Tertunggak", "message_template": "Yuran tertunggak untuk {student_name} berjumlah RM {outstanding}. Sila log masuk ke portal untuk membuat bayaran."},
    {"key": "reminder_short", "name": "Peringatan ringkas", "title": "Peringatan Yuran", "message_template": "Terdapat tunggakan yuran. Sila log masuk ke portal untuk membuat bayaran."},
    {"key": "reminder_urgent", "name": "Peringatan segera", "title": "Tindakan: Tunggakan Yuran", "message_template": "Sila segera jelaskan yuran tertunggak RM {outstanding} untuk {student_name}."},
]


def _build_year_rows_text_and_html(year_rows: List[Dict[str, Any]]) -> Dict[str, str]:
    text_lines: List[str] = []
    html_rows: List[str] = []
    for row in year_rows:
        tingkatan = int(_to_number(row.get("tingkatan") or 0))
        tahun = int(_to_number(row.get("tahun") or 0))
        label = str(row.get("label") or "").strip()
        if not label:
            if tingkatan > 0 and bool(row.get("is_current")):
                label = f"Tingkatan {tingkatan} (Semasa)"
            elif tingkatan > 0:
                label = f"Tingkatan {tingkatan}"
            elif tahun > 0:
                label = str(tahun)
            else:
                label = "-"
        total_amount = round(_to_number(row.get("total_amount")), 2)
        paid_amount = round(_to_number(row.get("paid_amount")), 2)
        outstanding = round(_to_number(row.get("outstanding")), 2)
        text_lines.append(
            f"{label}: Yuran RM {_format_money_plain(total_amount)} | Bayaran RM {_format_money_plain(paid_amount)} | Tunggakan RM {_format_money_plain(outstanding)}"
        )
        html_rows.append(
            "<tr>"
            f"<td style=\"padding:6px 8px;border:1px solid #e2e8f0;\">{label}</td>"
            f"<td style=\"padding:6px 8px;border:1px solid #e2e8f0;text-align:right;\">RM {_format_money_plain(total_amount)}</td>"
            f"<td style=\"padding:6px 8px;border:1px solid #e2e8f0;text-align:right;\">RM {_format_money_plain(paid_amount)}</td>"
            f"<td style=\"padding:6px 8px;border:1px solid #e2e8f0;text-align:right;\">RM {_format_money_plain(outstanding)}</td>"
            "</tr>"
        )
    return {
        "rows_text_multiline": "\n".join(text_lines),
        "rows_text_compact": "; ".join(text_lines),
        "rows_html": "".join(html_rows),
    }


async def _build_student_reminder_context(
    db,
    student_id: str,
    *,
    reference_year: Optional[int] = None,
) -> Dict[str, Any]:
    import urllib.parse

    student = await db.students.find_one({"_id": _as_object_id_if_valid(student_id)})
    if not student:
        return {"ok": False, "error": "Pelajar tidak dijumpai"}

    parent_id = student.get("parent_id")
    if not parent_id:
        return {"ok": False, "error": "Pelajar tiada ibu bapa dikaitkan"}

    parent = await db.users.find_one({"_id": _as_object_id_if_valid(parent_id)})
    template = await get_ar_reminder_letter_template_settings(db)
    header = template.get("header") or {}
    body = template.get("body") or {}
    attributes = template.get("attributes") or {}

    effective_year = int(reference_year) if reference_year is not None else datetime.now(timezone.utc).year
    raw_rows = await _fetch_student_outstanding_year_rows(
        db,
        student_ids=[student_id],
        year=effective_year,
        year_mode="upto",
        include_only_outstanding=False,
    )
    raw_rows = sorted(
        (
            {
                "tingkatan": int(_to_number(row.get("tingkatan") or 0)),
                "tahun": int(_to_number(row.get("tahun") or 0)),
                "total_amount": round(_to_number(row.get("total_amount")), 2),
                "paid_amount": round(_to_number(row.get("paid_amount")), 2),
                "outstanding": round(_to_number(row.get("outstanding")), 2),
            }
            for row in raw_rows
        ),
        key=lambda item: (int(item.get("tingkatan") or 0), int(item.get("tahun") or 0)),
        reverse=True,
    )
    if not raw_rows:
        return {"ok": False, "error": "Tiada tunggakan aktif untuk pelajar ini"}

    current_tingkatan = _student_form_value(student) or 0
    if current_tingkatan <= 0:
        available_tingkatan = sorted(
            int(row.get("tingkatan") or 0)
            for row in raw_rows
            if int(_to_number(row.get("tingkatan") or 0)) > 0
        )
        if available_tingkatan:
            current_tingkatan = available_tingkatan[-1]
    if current_tingkatan <= 0:
        current_tingkatan = 1

    totals_by_tingkatan: Dict[int, Dict[str, float]] = {}
    for row in raw_rows:
        tingkatan_value = int(_to_number(row.get("tingkatan") or 0))
        if tingkatan_value <= 0 or tingkatan_value > current_tingkatan:
            continue
        bucket = totals_by_tingkatan.setdefault(
            tingkatan_value,
            {"total_amount": 0.0, "paid_amount": 0.0, "outstanding": 0.0},
        )
        bucket["total_amount"] += _to_number(row.get("total_amount"))
        bucket["paid_amount"] += _to_number(row.get("paid_amount"))
        bucket["outstanding"] += _to_number(row.get("outstanding"))

    current_bucket = totals_by_tingkatan.get(current_tingkatan, {"total_amount": 0.0, "paid_amount": 0.0, "outstanding": 0.0})
    tingkatan_rows: List[Dict[str, Any]] = [{
        "tingkatan": int(current_tingkatan),
        "label": f"Tingkatan {int(current_tingkatan)} (Semasa)",
        "is_current": True,
        "total_amount": round(_to_number(current_bucket.get("total_amount")), 2),
        "paid_amount": round(_to_number(current_bucket.get("paid_amount")), 2),
        "outstanding": round(_to_number(current_bucket.get("outstanding")), 2),
    }]
    for tingkatan_idx in range(1, int(current_tingkatan)):
        bucket = totals_by_tingkatan.get(tingkatan_idx, {"total_amount": 0.0, "paid_amount": 0.0, "outstanding": 0.0})
        tingkatan_rows.append({
            "tingkatan": int(tingkatan_idx),
            "label": f"Tingkatan {int(tingkatan_idx)}",
            "is_current": False,
            "total_amount": round(_to_number(bucket.get("total_amount")), 2),
            "paid_amount": round(_to_number(bucket.get("paid_amount")), 2),
            "outstanding": round(_to_number(bucket.get("outstanding")), 2),
        })

    total_outstanding = round(sum(_to_number(row.get("outstanding")) for row in tingkatan_rows), 2)
    total_paid = round(sum(_to_number(row.get("paid_amount")) for row in tingkatan_rows), 2)
    if total_outstanding <= 0:
        return {"ok": False, "error": "Tiada tunggakan aktif untuk pelajar ini"}
    current_year = int(effective_year)
    previous_year = current_year - 1
    current_outstanding = round(_to_number(tingkatan_rows[0].get("outstanding")), 2) if tingkatan_rows else 0.0
    previous_outstanding = round(max(total_outstanding - current_outstanding, 0.0), 2)

    student_name = str(student.get("full_name") or "Pelajar")
    matric_number = str(student.get("matric_number") or "-").strip() or "-"
    parent_name = str((parent or {}).get("full_name") or "Ibu Bapa / Penjaga")
    now_dt = datetime.now(timezone.utc)
    tarikh_surat = now_dt.strftime("%d/%m/%Y")
    rujukan_prefix = str(attributes.get("rujukan_prefix") or "SR/KEW").strip() or "SR/KEW"
    rujukan_surat = f"{rujukan_prefix}/{matric_number}/{tarikh_surat}"

    rows_render = _build_year_rows_text_and_html(tingkatan_rows)
    tokens = {
        "rujukan_surat": rujukan_surat,
        "rujukan_prefix": rujukan_prefix,
        "tarikh_surat": tarikh_surat,
        "nama_pelajar": student_name,
        "no_matriks": matric_number,
        "tahunsemasa_tertunggak": current_year,
        "nilaisemasa_tertunggak": _format_money_plain(current_outstanding),
        "tahunsebelum_tertunggak": previous_year,
        "nilaistahunsebelum_tertunggak": _format_money_plain(previous_outstanding),
        "nilaistahunebelum_tertunggak": _format_money_plain(previous_outstanding),
        "jumlah_tertunggak": _format_money_plain(total_outstanding),
        "jumlah_bayaran": _format_money_plain(total_paid),
        "tingkatan_semasa": int(current_tingkatan),
        "nama_penandatangan": attributes.get("nama_penandatangan") or "",
        "jawatan_penandatangan": attributes.get("jawatan_penandatangan") or "",
        "nama_maktab": attributes.get("nama_maktab") or "",
        "parent_name": parent_name,
    }

    butiran_title = str(attributes.get("butiran_tunggakan_title") or "Butiran Tunggakan:").strip()
    jumlah_label = str(attributes.get("jumlah_label") or "Jumlah Keseluruhan Tunggakan:").strip()
    wa_lines: List[str] = []
    if header.get("title"):
        wa_lines.append(_apply_template_tokens(header.get("title"), tokens))
    for row in (header.get("rows") or [])[:8]:
        rendered = _apply_template_tokens(row, tokens).strip()
        if rendered:
            wa_lines.append(rendered)
    for row in (body.get("intro_rows") or [])[:4]:
        rendered = _apply_template_tokens(row, tokens).strip()
        if rendered:
            wa_lines.append(rendered)
    wa_lines.append(butiran_title)
    for row in tingkatan_rows:
        row_label = row.get("label") or f"Tingkatan {int(_to_number(row.get('tingkatan') or 0))}"
        wa_lines.append(
            f"{row_label}: Yuran RM {_format_money_plain(row.get('total_amount'))}, "
            f"Bayaran RM {_format_money_plain(row.get('paid_amount'))}, "
            f"Tunggakan RM {_format_money_plain(row.get('outstanding'))}"
        )
    wa_lines.append(f"{jumlah_label} RM {_format_money_plain(total_outstanding)}")
    for row in (body.get("note_rows") or [])[:4]:
        rendered = _apply_template_tokens(row, tokens).strip()
        if rendered:
            wa_lines.append(rendered)
    wa_text = "\n".join(line for line in wa_lines if line)
    wa_link = f"https://wa.me/?text={urllib.parse.quote(wa_text[:3500])}"

    return {
        "ok": True,
        "student": student,
        "parent": parent,
        "parent_id": str(parent_id),
        "student_name": student_name,
        "matric_number": matric_number,
        "current_tingkatan": int(current_tingkatan),
        "tingkatan_rows": tingkatan_rows,
        "year_rows": raw_rows,
        "total_outstanding": total_outstanding,
        "total_paid": total_paid,
        "tarikh_surat": tarikh_surat,
        "rujukan_surat": rujukan_surat,
        "tokens": tokens,
        "rows_text_multiline": rows_render["rows_text_multiline"],
        "rows_text_compact": rows_render["rows_text_compact"],
        "rows_html": rows_render["rows_html"],
        "whatsapp_text": wa_text,
        "whatsapp_link": wa_link,
    }


async def _send_one_reminder(
    db,
    student_id: str,
    channel: str,
    template_key: str,
    push_template_key: str,
    sender_id=None,
    sender_name: str = None,
    sender_role: str = None,
    reference_year: Optional[int] = None,
) -> dict:
    """Hantar satu peringatan (e-mel atau push). Return {"ok": True, "whatsapp_link": "..."} atau {"ok": False, "error": "..."}."""
    context = await _build_student_reminder_context(
        db,
        student_id,
        reference_year=reference_year,
    )
    if not context.get("ok"):
        return {"ok": False, "error": context.get("error", "Gagal bina data peringatan pelajar")}

    student = context.get("student") or {}
    parent = context.get("parent") or {}
    parent_id = str(context.get("parent_id") or "")
    student_name = context.get("student_name") or "Pelajar"
    outstanding = round(_to_number(context.get("total_outstanding")), 2)
    tingkatan_rows = context.get("tingkatan_rows") if isinstance(context.get("tingkatan_rows"), list) else []
    year_rows = context.get("year_rows") if isinstance(context.get("year_rows"), list) else []
    default_msg = (
        f"Peringatan: Yuran tertunggak untuk {student_name} berjumlah RM {outstanding:,.2f}. "
        "Sila log masuk ke portal untuk membuat bayaran."
    )
    message = default_msg
    title = "Peringatan Yuran Tertunggak"
    wa_text = context.get("whatsapp_text") or f"{title}: {message[:150]}"
    wa_link = context.get("whatsapp_link")

    if channel == "email":
        template_key = (template_key or "fee_reminder").strip() or "fee_reminder"
        to_email = (parent or {}).get("email") or (parent or {}).get("username")
        if not to_email:
            return {"ok": False, "error": "Ibu bapa tiada e-mel dikaitkan"}
        from services.email_service import send_email_via_template
        tingkatan = _student_form_value(student)
        result = await send_email_via_template(
            db,
            template_key=template_key,
            to_email=to_email,
            variables={
                "parent_name": (parent or {}).get("full_name") or "Ibu Bapa",
                "child_name": student_name,
                "student_name": student_name,
                "no_matriks": context.get("matric_number") or "-",
                "tarikh_surat": context.get("tarikh_surat") or "",
                "rujukan_surat": context.get("rujukan_surat") or "",
                "total_outstanding": f"{outstanding:,.2f}",
                "children_outstanding": context.get("rows_text_compact") or f"{student_name}: RM {outstanding:,.2f}",
                "outstanding_year_rows_text": context.get("rows_text_multiline") or "",
                "outstanding_year_rows_html": context.get("rows_html") or "",
                "outstanding_tingkatan_rows_text": context.get("rows_text_multiline") or "",
                "outstanding_tingkatan_rows_html": context.get("rows_html") or "",
                "current_tingkatan": context.get("current_tingkatan") or "",
                "total_paid": f"{_to_number(context.get('total_paid')):,.2f}",
                "surat_peringatan_text": wa_text,
            },
            tingkatan=tingkatan,
        )
        if result.get("status") == "error":
            return {"ok": False, "error": result.get("error", "Gagal hantar e-mel")}
        await db.ar_reminder_log.insert_one({
            "student_id": _as_object_id_if_valid(student_id),
            "parent_id": _as_object_id_if_valid(parent_id),
            "channel": "email",
            "template_key": template_key,
            "sent_at": datetime.now(timezone.utc),
        })
        return {"ok": True, "whatsapp_link": wa_link, "whatsapp_text": wa_text}

    # channel == "push"
    push_tpl = next((t for t in PUSH_TEMPLATE_OPTIONS if t["key"] == (push_template_key or "reminder_full")), PUSH_TEMPLATE_OPTIONS[0])
    title = push_tpl.get("title", title)
    message = push_tpl.get("message_template", message).format(
        student_name=student_name,
        outstanding=f"{outstanding:,.2f}",
    )
    try:
        from routes.notifications import create_notification, send_push_to_user
        await create_notification(
            db, parent_id, title, message,
            notification_type="ar_reminder",
            category="yuran",
            priority="high",
            action_url="/payment-center",
            metadata={
                "student_id": student_id,
                "outstanding": outstanding,
                "tingkatan_rows": tingkatan_rows[:5],
                "year_rows": year_rows[:5],
            },
            sender_id=sender_id,
            sender_name=sender_name,
            sender_role=sender_role,
        )
        await send_push_to_user(db, parent_id, title, message[:100], "/payment-center")
        await db.ar_reminder_log.insert_one({
            "student_id": _as_object_id_if_valid(student_id),
            "parent_id": _as_object_id_if_valid(parent_id),
            "channel": "push",
            "push_template_key": push_template_key or "reminder_full",
            "sent_at": datetime.now(timezone.utc),
        })
    except Exception as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True, "whatsapp_link": wa_link, "whatsapp_text": wa_text}


@router.get("/push-template-options")
async def get_push_template_options(current_user: dict = Depends(get_current_user)):
    """Senarai template push untuk bendahari pilih bila hantar peringatan (channel=push)."""
    _require_ar_roles(current_user)
    return {"options": PUSH_TEMPLATE_OPTIONS}


class SendReminderBody(BaseModel):
    student_id: Optional[str] = None
    student_yuran_id: Optional[str] = None
    message: Optional[str] = None
    channel: str = "push"  # "email" | "push"
    template_key: Optional[str] = None   # untuk channel=email: fee_reminder, payment_confirm, dll. (default fee_reminder)
    push_template_key: Optional[str] = None  # untuk channel=push: reminder_full, reminder_short, reminder_urgent (default reminder_full)


@router.post("/send-reminder")
async def send_ar_reminder(
    body: SendReminderBody,
    current_user: dict = Depends(get_current_user),
):
    """Hantar peringatan tertunggak: bendahari pilih sama ada e-mel sahaja ATAU push notifikasi sahaja (bukan kedua-dua)."""
    _require_ar_roles(current_user)
    if body.channel not in ("email", "push"):
        raise HTTPException(status_code=400, detail="channel mesti 'email' atau 'push'")
    db = get_db()
    student_id = body.student_id
    if body.student_yuran_id and not student_id:
        sy = await db.student_yuran.find_one({"_id": _as_object_id_if_valid(body.student_yuran_id)})
        if sy:
            student_id = str(sy.get("student_id"))
    if not student_id:
        raise HTTPException(status_code=400, detail="Sila beri student_id atau student_yuran_id")
    template_key = (body.template_key or "fee_reminder").strip() or "fee_reminder"
    push_template_key = (body.push_template_key or "reminder_full").strip() or "reminder_full"
    student_doc = await db.students.find_one(
        {"_id": _as_object_id_if_valid(student_id)},
        {"form": 1, "tingkatan": 1},
    )
    tingkatan_value = _student_form_value(student_doc)
    report_year = datetime.now(timezone.utc).year
    result = await _send_one_reminder(
        db, student_id, body.channel, template_key, push_template_key,
        sender_id=current_user.get("_id"),
        sender_name=current_user.get("full_name"),
        sender_role=current_user.get("role"),
        reference_year=report_year,
    )
    if not result.get("ok"):
        await _log_notification_report(
            db,
            channel=body.channel,
            status="failed",
            action_type="single",
            year=report_year,
            tingkatan=tingkatan_value,
            student_id=student_id,
            total_targets=1,
            success_count=0,
            failed_count=1,
            template_key=template_key if body.channel == "email" else None,
            push_template_key=push_template_key if body.channel == "push" else None,
            error=result.get("error", "Gagal hantar peringatan"),
            meta={"source": "manual_sync"},
            triggered_by=current_user,
        )
        raise HTTPException(status_code=400, detail=result.get("error", "Gagal hantar peringatan"))
    await _log_notification_report(
        db,
        channel=body.channel,
        status="success",
        action_type="single",
        year=report_year,
        tingkatan=tingkatan_value,
        student_id=student_id,
        total_targets=1,
        success_count=1,
        failed_count=0,
        template_key=template_key if body.channel == "email" else None,
        push_template_key=push_template_key if body.channel == "push" else None,
        meta={"source": "manual_sync"},
        triggered_by=current_user,
    )
    if body.channel == "email":
        return {
            "ok": True,
            "message": "Peringatan telah dihantar melalui e-mel (template: {}).".format(template_key),
            "channel": "email",
            "template_key": template_key,
            "email_sent": True,
            "whatsapp_link": result.get("whatsapp_link"),
            "whatsapp_text": result.get("whatsapp_text"),
        }
    return {
        "ok": True,
        "message": "Peringatan telah dihantar (notifikasi dalam app + push).",
        "channel": "push",
        "in_app_sent": True,
        "push_sent": 1,
        "whatsapp_link": result.get("whatsapp_link"),
        "whatsapp_text": result.get("whatsapp_text"),
    }


class SendReminderBulkBody(BaseModel):
    tingkatan: int  # 1-5
    year: Optional[int] = None
    channel: str = "email"  # "email" | "push"
    template_key: Optional[str] = None  # default fee_reminder
    push_template_key: Optional[str] = None  # default reminder_full
    batch_size: Optional[int] = 20  # hantar dalam kelompok N orang; 0 atau None = tiada had (semua sekali)


@router.post("/send-reminder-bulk")
async def send_ar_reminder_bulk(
    body: SendReminderBulkBody,
    current_user: dict = Depends(get_current_user),
):
    """Hantar peringatan pukal kepada semua pelajar tertunggak dalam satu tingkatan. Pilih e-mel atau push. Pilihan batch (cth. 20 orang) untuk elak beban sistem."""
    _require_ar_roles(current_user)
    if body.channel not in ("email", "push"):
        raise HTTPException(status_code=400, detail="channel mesti 'email' atau 'push'")
    tingkatan_value = _normalize_tingkatan_value(body.tingkatan)
    db = get_db()
    y = body.year or datetime.now(timezone.utc).year
    ordered = await _get_bulk_reminder_targets(db, year=y, tingkatan=tingkatan_value)

    if not ordered:
        await _log_notification_report(
            db,
            channel=body.channel,
            status="failed",
            action_type="bulk",
            year=y,
            tingkatan=tingkatan_value,
            total_targets=0,
            success_count=0,
            failed_count=0,
            template_key=(body.template_key or "fee_reminder") if body.channel == "email" else None,
            push_template_key=(body.push_template_key or "reminder_full") if body.channel == "push" else None,
            error="Tiada pelajar tertunggak untuk tingkatan dipilih",
            meta={"source": "manual_sync"},
            triggered_by=current_user,
        )
        return {"ok": True, "total_recipients": 0, "sent": 0, "failed": 0, "errors": []}
    template_key = (body.template_key or "fee_reminder").strip() or "fee_reminder"
    push_template_key = (body.push_template_key or "reminder_full").strip() or "reminder_full"
    batch_size = body.batch_size or 0
    if batch_size <= 0:
        batch_size = len(ordered)
    sent = 0
    failed = 0
    errors = []
    sender_id = current_user.get("_id")
    sender_name = current_user.get("full_name")
    sender_role = current_user.get("role")
    for i in range(0, len(ordered), batch_size):
        chunk = ordered[i : i + batch_size]
        for sid in chunk:
            sid_str = str(sid)
            result = await _send_one_reminder(
                db, sid_str, body.channel, template_key, push_template_key,
                sender_id=sender_id, sender_name=sender_name, sender_role=sender_role,
                reference_year=y,
            )
            if result.get("ok"):
                sent += 1
            else:
                failed += 1
                errors.append({"student_id": sid_str, "error": result.get("error", "Unknown")})
        if i + batch_size < len(ordered):
            await asyncio.sleep(1)
    status = "success" if failed == 0 else ("failed" if sent == 0 else "partial")
    await _log_notification_report(
        db,
        channel=body.channel,
        status=status,
        action_type="bulk",
        year=y,
        tingkatan=tingkatan_value,
        total_targets=len(ordered),
        success_count=sent,
        failed_count=failed,
        template_key=template_key if body.channel == "email" else None,
        push_template_key=push_template_key if body.channel == "push" else None,
        error=errors[0].get("error") if errors else None,
        meta={
            "source": "manual_sync",
            "batch_size": batch_size,
            "error_samples": errors[:10],
        },
        triggered_by=current_user,
    )
    return {
        "ok": True,
        "total_recipients": len(ordered),
        "sent": sent,
        "failed": failed,
        "errors": errors[:50],
    }


# ==================== REVERSAL ====================


class ReversalBody(BaseModel):
    journal_entry_id: str
    reason: str


@router.post("/reversal")
async def create_ar_reversal(
    body: ReversalBody,
    current_user: dict = Depends(get_current_user),
):
    """Cipta entri pembalikan untuk jurnal AR (Bendahari/Superadmin sahaja)."""
    if current_user.get("role") not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Hanya Bendahari/Admin boleh buat pembalikan")
    from services.ar_journal import post_reversal
    db = get_db()
    rev_id = await post_reversal(
        db,
        body.journal_entry_id,
        body.reason[:500],
        created_by=current_user.get("_id"),
        created_by_name=current_user.get("full_name", ""),
    )
    if not rev_id:
        raise HTTPException(status_code=404, detail="Entri jurnal tidak dijumpai atau tiada baris")
    return {"ok": True, "reversal_entry_id": rev_id, "message": "Pembalikan berjaya dicipta."}


# ==================== WARDEN SUMMARY ====================


@router.get("/warden/summary")
async def get_warden_ar_summary(
    year: Optional[int] = Query(None),
    block: Optional[str] = Query(None),
    tingkatan: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Ringkasan AR untuk Warden: mengikut blok dan/atau tingkatan."""
    if current_user.get("role") not in ["superadmin", "admin", "bendahari", "sub_bendahari", "warden"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    db = get_db()
    y = year or datetime.now(timezone.utc).year
    query = {"tahun": y}
    if tingkatan is not None:
        query["tingkatan"] = tingkatan

    records = await db.student_yuran.find(query).to_list(50000)
    records = [r for r in records if _balance_of(r) > 0]
    if not records:
        return {
            "year": y,
            "total_outstanding": 0.0,
            "by_block": [],
            "by_tingkatan": [],
        }

    student_ids = list({_id_str(r.get("student_id")) for r in records if r.get("student_id") is not None})
    students = await db.students.find({"_id": {"$in": [_as_object_id_if_valid(sid) for sid in student_ids]}}).to_list(
        len(student_ids) or 1
    )
    students_by_id = {_id_str(s.get("_id")): s for s in students}

    by_block_map: Dict[str, Dict[str, Any]] = {}
    by_tingkatan_map: Dict[int, Dict[str, Any]] = {}
    for r in records:
        sid_str = _id_str(r.get("student_id"))
        student = students_by_id.get(sid_str)
        block_name = (student or {}).get("block_name") or "_unknown"
        if block and block_name != block:
            continue

        ting = r.get("tingkatan")
        try:
            ting = int(ting) if ting is not None else 0
        except (TypeError, ValueError):
            ting = 0
        balance = _balance_of(r)

        if block_name not in by_block_map:
            by_block_map[block_name] = {
                "block": block_name,
                "outstanding": 0.0,
                "student_ids": set(),
            }
        by_block_map[block_name]["outstanding"] += balance
        by_block_map[block_name]["student_ids"].add(sid_str)

        if ting not in by_tingkatan_map:
            by_tingkatan_map[ting] = {
                "tingkatan": ting,
                "outstanding": 0.0,
                "student_ids": set(),
            }
        by_tingkatan_map[ting]["outstanding"] += balance
        by_tingkatan_map[ting]["student_ids"].add(sid_str)

    by_block = sorted(by_block_map.values(), key=lambda x: x["outstanding"], reverse=True)
    by_tingkatan = sorted(by_tingkatan_map.values(), key=lambda x: x["tingkatan"])
    total = sum(x["outstanding"] for x in by_block)
    return {
        "year": y,
        "total_outstanding": round(total, 2),
        "by_block": [
            {
                "block": x["block"],
                "outstanding": round(x["outstanding"], 2),
                "student_count": len(x["student_ids"]),
            }
            for x in by_block
        ],
        "by_tingkatan": [
            {
                "tingkatan": x["tingkatan"],
                "outstanding": round(x["outstanding"], 2),
                "student_count": len(x["student_ids"]),
            }
            for x in by_tingkatan
        ],
    }


# ==================== INTEGRITY CHECK ====================


@router.get("/integrity")
async def check_ar_integrity(
    year: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Semak: jumlah sub-ledger outstanding = GL AR balance (dari journal)."""
    _require_ar_roles(current_user)
    db = get_db()
    from services.ar_journal import get_or_create_ar_account
    ar_id = await get_or_create_ar_account(db)
    y = year or datetime.now(timezone.utc).year
    records = await db.student_yuran.find({"tahun": y}).to_list(50000)
    subledger_total = sum(_balance_of(r) for r in records)
    lines = await db.accounting_journal_lines.find({
        "account_type": "ar",
        "account_id": ar_id,
    }).to_list(100000)
    gl_ar = 0.0
    for line in lines:
        gl_ar += line.get("debit", 0) - line.get("credit", 0)
    match = abs(subledger_total - gl_ar) < 0.02
    return {
        "year": y,
        "subledger_total_outstanding": round(subledger_total, 2),
        "gl_ar_balance": round(gl_ar, 2),
        "match": match,
        "message": "Sub-ledger = GL AR" if match else "Mismatch - semak integriti",
    }
