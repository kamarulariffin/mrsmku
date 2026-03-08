"""
Reports Routes - Fee and collection reports
Disegerakkan dengan pangkalan data: student_yuran, payments, accounting, tabung, koperasi.
Semua laporan dan graf menggunakan data sebenar dari DB.
"""
from datetime import datetime, timezone
from typing import Optional, Callable
from bson import ObjectId

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

router = APIRouter(prefix="/api/reports", tags=["Reports"])
security = HTTPBearer(auto_error=False)

# Database reference - will be set from server.py
_get_db_func: Callable = None
_get_current_user_func: Callable = None


def init_router(get_db_func, auth_func):
    """
    Initialize router with dependencies from server.py
    
    Args:
        get_db_func: Function that returns database instance
        auth_func: get_current_user function from server.py
    """
    global _get_db_func, _get_current_user_func
    
    _get_db_func = get_db_func
    _get_current_user_func = auth_func


# ============ LOCAL DEPENDENCY WRAPPERS ============

def get_db():
    """Get database instance"""
    return _get_db_func()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Wrapper for authentication - calls server.py's get_current_user"""
    if not credentials:
        raise HTTPException(status_code=401, detail="Token diperlukan")
    return await _get_current_user_func(credentials)


def require_report_roles():
    """Return dependency for requiring report-related roles"""
    async def _require_roles(credentials: HTTPAuthorizationCredentials = Depends(security)):
        user = await get_current_user(credentials)
        allowed_roles = ["superadmin", "admin", "bendahari", "sub_bendahari"]
        if user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=403, 
                detail=f"Akses ditolak. Hanya {', '.join(allowed_roles)} boleh mengakses laporan."
            )
        return user
    return _require_roles


# ============ ROUTES ============

def _normalize_created_at(obj, key="created_at"):
    """Return (year, month) from created_at (datetime or ISO string)."""
    val = obj.get(key)
    if val is None:
        return None, None
    if isinstance(val, datetime):
        return val.year, val.month
    if isinstance(val, str) and len(val) >= 7:
        try:
            y, m = int(val[:4]), int(val[5:7])
            return y, m
        except ValueError:
            pass
    return None, None


@router.get("/fees")
async def get_fee_report(
    tahun: Optional[int] = Query(None, description="Tahun yuran (default: tahun semasa)"),
    current_user: dict = Depends(require_report_roles())
):
    """
    Laporan yuran - disegerakkan dengan student_yuran (sumber data utama sistem yuran).
    Juga termasuk data dari db.fees untuk muafakat/koperasi jika ada.
    """
    db = get_db()
    now = datetime.now(timezone.utc)
    year = tahun or now.year

    # Sumber utama: student_yuran (selari dengan financial_dashboard & payment)
    student_yuran_records = await db.student_yuran.find({"tahun": year}).to_list(20000)
    category_stats = {}
    for r in student_yuran_records:
        items = r.get("items", [])
        cats_in_record = set()
        for item in items:
            cat = item.get("sub_category") or item.get("category") or "Yuran"
            if cat not in category_stats:
                category_stats[cat] = {"total": 0, "collected": 0, "count": 0}
            category_stats[cat]["total"] += item.get("amount", 0)
            category_stats[cat]["collected"] += item.get("paid_amount", 0)
            cats_in_record.add(cat)
        for cat in cats_in_record:
            category_stats[cat]["count"] += 1
        if not items:
            category_stats.setdefault("Yuran", {"total": 0, "collected": 0, "count": 0})
            category_stats["Yuran"]["total"] += r.get("total_amount", 0)
            category_stats["Yuran"]["collected"] += r.get("paid_amount", 0)
            category_stats["Yuran"]["count"] += 1
    # By status (per record)
    status_stats = {
        "pending": len([r for r in student_yuran_records if r.get("status") == "pending"]),
        "partial": len([r for r in student_yuran_records if r.get("status") == "partial"]),
        "paid": len([r for r in student_yuran_records if r.get("status") == "paid"])
    }
    total_expected = sum(r.get("total_amount", 0) for r in student_yuran_records)
    total_collected = sum(r.get("paid_amount", 0) for r in student_yuran_records)

    # Gabung dengan db.fees jika ada (muafakat, koperasi, dll)
    try:
        fees = await db.fees.find().to_list(10000)
    except Exception:
        fees = []
    for fee in fees:
        cat = fee.get("category", "unknown")
        if cat not in category_stats:
            category_stats[cat] = {"total": 0, "collected": 0, "count": 0}
        category_stats[cat]["total"] += fee.get("amount", 0)
        category_stats[cat]["collected"] += fee.get("paid_amount", 0)
        category_stats[cat]["count"] += 1
    status_stats["pending"] += len([f for f in fees if f.get("status") == "pending"])
    status_stats["partial"] += len([f for f in fees if f.get("status") == "partial"])
    status_stats["paid"] += len([f for f in fees if f.get("status") == "paid"])

    return {
        "by_category": category_stats,
        "by_status": status_stats,
        "total_fees": len(student_yuran_records) + len(fees),
        "total_students": len(student_yuran_records),
        "tahun": year,
        "total_expected": total_expected,
        "total_collected": total_collected,
    }


@router.get("/collection")
async def get_collection_report(
    tahun: Optional[int] = Query(None, description="Tahun (optional filter)"),
    current_user: dict = Depends(require_report_roles())
):
    """Laporan kutipan - dari db.payments dan student_yuran (disegerakkan dengan sistem bayaran)."""
    db = get_db()
    now = datetime.now(timezone.utc)
    year = tahun or now.year
    query = {"status": "completed"}
    payments = await db.payments.find(query).to_list(10000)

    monthly = {}
    for payment in payments:
        y, m = _normalize_created_at(payment)
        if y and m:
            month = f"{y}-{m:02d}"
        else:
            month = "unknown"
        if month not in monthly:
            monthly[month] = 0
        monthly[month] += payment.get("amount", 0)

    by_method = {}
    for payment in payments:
        method = payment.get("payment_method", "unknown")
        if method not in by_method:
            by_method[method] = 0
        by_method[method] += payment.get("amount", 0)

    # Kutipan bagi tahun berkenaan (untuk kadar kutipan selari dengan student_yuran)
    collected_this_year = sum(
        p.get("amount", 0) for p in payments
        if (_normalize_created_at(p)[0] or 0) == year
    )
    yuran_records = await db.student_yuran.find({"tahun": year}).to_list(20000)
    total_expected = sum(r.get("total_amount", 0) for r in yuran_records)
    total_outstanding = max(0, total_expected - collected_this_year)
    collection_rate = round((collected_this_year / total_expected * 100), 1) if total_expected else 0
    total_collected = sum(p.get("amount", 0) for p in payments)

    return {
        "monthly_collection": monthly,
        "by_payment_method": by_method,
        "total_collected": total_collected,
        "total_transactions": len(payments),
        "total_outstanding": round(total_outstanding, 2),
        "collection_rate": collection_rate,
        "tahun": year,
    }


@router.get("/monthly")
async def get_monthly_report(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2020, le=2030),
    current_user: dict = Depends(require_report_roles())
):
    """
    Laporan bulanan - disegerakkan dengan db.payments dan student_yuran.
    Digunakan oleh halaman Laporan untuk tab Laporan Bulanan.
    """
    db = get_db()
    all_payments = await db.payments.find({"status": "completed"}).to_list(50000)

    def in_month(p, y, m):
        created = p.get("created_at")
        if isinstance(created, datetime):
            return created.year == y and created.month == m
        if isinstance(created, str) and len(created) >= 7:
            try:
                return int(created[:4]) == y and int(created[5:7]) == m
            except ValueError:
                pass
        return False

    payments_in_month = [p for p in all_payments if in_month(p, year, month)]
    total_collected = sum(p.get("amount", 0) for p in payments_in_month)
    total_transactions = len(payments_in_month)
    student_yuran_count = await db.student_yuran.count_documents({"tahun": year})
    avg = (total_collected / total_transactions) if total_transactions else 0

    prev_month = month - 1 if month > 1 else 12
    prev_year = year if month > 1 else year - 1
    prev_total = sum(p.get("amount", 0) for p in all_payments if in_month(p, prev_year, prev_month))
    change_percent = round(((total_collected - prev_total) / prev_total * 100), 1) if prev_total else 0

    return {
        "month": month,
        "year": year,
        "total_collected": round(total_collected, 2),
        "total_transactions": total_transactions,
        "active_students": student_yuran_count,
        "average_payment": round(avg, 2),
        "change_percent": change_percent,
    }


@router.get("/yearly-students")
async def get_yearly_students_report(
    year: int = Query(..., ge=2020, le=2030, description="Tahun laporan"),
    set_yuran_id: Optional[str] = Query(None, description="Filter set yuran (optional)"),
    current_user: dict = Depends(require_report_roles())
):
    """
    Laporan tahunan pelajar - satu baris per pelajar/set yuran, lajur Jan–Dis.
    Disegerakkan dengan student_yuran dan payments (payments[] dengan paid_at).
    Sesuai untuk export CSV dan cetak seperti Payment Yearly Report.
    """
    db = get_db()
    query = {"tahun": year}
    if set_yuran_id:
        try:
            query["set_yuran_id"] = ObjectId(set_yuran_id)
        except Exception:
            pass
    records = await db.student_yuran.find(query).to_list(10000)
    student_ids = list({r.get("student_id") for r in records if r.get("student_id")})
    students_map = {}
    if student_ids:
        students = await db.students.find({"_id": {"$in": student_ids}}).to_list(10000)
        for s in students:
            students_map[str(s["_id"])] = s

    MONTHS = list(range(1, 13))

    def _month_from_paid_at(paid_at):
        if not paid_at:
            return None
        if isinstance(paid_at, datetime):
            return paid_at.month
        if isinstance(paid_at, str) and len(paid_at) >= 7:
            try:
                return int(paid_at[5:7])
            except ValueError:
                pass
        return None

    rows = []
    for r in records:
        student_id = r.get("student_id")
        student = students_map.get(str(student_id)) if student_id else None
        no_matrik = r.get("matric_number") or (student.get("matric_number") if student else "") or "-"
        ic = (student.get("ic_number") or student.get("nric") or "") if student else ""
        event_name = r.get("set_yuran_nama") or "Yuran"
        monthly = {m: None for m in MONTHS}  # None = no payment, else amount
        for pay in r.get("payments", []):
            m = _month_from_paid_at(pay.get("paid_at"))
            if m and m in monthly:
                amt = pay.get("amount", 0)
                if monthly[m] is None:
                    monthly[m] = 0
                monthly[m] += amt
        row = {
            "asset_no": no_matrik,
            "ic_no": ic,
            "event_name": event_name,
            "student_name": r.get("student_name") or (student.get("full_name") if student else "") or "-",
            "student_id": str(student_id) if student_id is not None else "",
            "months": {m: (round(monthly[m], 2) if monthly[m] is not None else None) for m in MONTHS},
            "total_paid": r.get("paid_amount", 0),
            "total_amount": r.get("total_amount", 0),
            "status": r.get("status", "pending"),
        }
        rows.append(row)

    # Summary
    total_students = len(records)
    total_expected = sum(r.get("total_amount", 0) for r in records)
    total_collected = sum(r.get("paid_amount", 0) for r in records)
    set_yuran_list = []
    if not set_yuran_id:
        grouped = {}
        for rec in records:
            sid = rec.get("set_yuran_id")
            if not sid:
                continue
            sid_key = str(sid)
            if sid_key not in grouped:
                grouped[sid_key] = {
                    "id": sid_key,
                    "nama": rec.get("set_yuran_nama") or "Yuran",
                    "count": 0,
                }
            grouped[sid_key]["count"] += 1
        set_yuran_list = sorted(grouped.values(), key=lambda x: x["nama"])

    return {
        "year": year,
        "rows": rows,
        "summary": {
            "total_students": total_students,
            "total_expected": round(total_expected, 2),
            "total_collected": round(total_collected, 2),
            "collection_rate": round((total_collected / total_expected * 100), 1) if total_expected else 0,
        },
        "set_yuran_options": set_yuran_list,
    }
