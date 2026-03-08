"""
AR Risk Score & Suggested Actions
Analisis sejarah bayaran, tertunggak dan overdue untuk skor risiko (Low/Medium/High).
"""

from datetime import datetime, timezone, timedelta


def _parse_date(s):
    if not s or len(s) < 10:
        return None
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d")
    except ValueError:
        return None


def _days_overdue(due_str, as_of=None):
    due = _parse_date(due_str)
    if not due:
        return 0
    as_of = as_of or datetime.now(timezone.utc).date()
    if hasattr(due, "date"):
        due = due.date()
    return max(0, (as_of - due).days)


async def compute_student_risk(db, student_id, year=None):
    """
    Return risk_score: low | medium | high, score 0-100, suggested_actions: list.
    Based on: total outstanding, max days overdue, count of late payments, amount in 90+ bucket.
    """
    from bson import ObjectId
    query = {"student_id": ObjectId(student_id)}
    if year:
        query["tahun"] = year
    records = await db.student_yuran.find(query).to_list(100)
    total_outstanding = 0.0
    max_overdue_days = 0
    late_payment_count = 0
    amount_90_plus = 0.0
    as_of = datetime.now(timezone.utc).date()

    for r in records:
        balance = (r.get("total_amount") or 0) - (r.get("paid_amount") or 0)
        if balance <= 0:
            continue
        total_outstanding += balance
        due = r.get("due_date")
        days = _days_overdue(due, as_of)
        if days > max_overdue_days:
            max_overdue_days = days
        if days >= 90:
            amount_90_plus += balance
        for pay in r.get("payments", []):
            paid_at = pay.get("paid_at")
            if due and paid_at:
                paid_dt = _parse_date(paid_at)
                due_dt = _parse_date(due)
                if paid_dt and due_dt and paid_dt.date() > due_dt.date():
                    late_payment_count += 1

    score = 0
    if total_outstanding > 0:
        if total_outstanding >= 5000:
            score += 30
        elif total_outstanding >= 2000:
            score += 20
        elif total_outstanding >= 500:
            score += 10
    if max_overdue_days >= 90:
        score += 35
    elif max_overdue_days >= 60:
        score += 25
    elif max_overdue_days >= 30:
        score += 15
    if late_payment_count >= 3:
        score += 25
    elif late_payment_count >= 1:
        score += 10
    if amount_90_plus >= 1000:
        score += 15

    score = min(100, score)
    if score >= 60:
        risk = "high"
        actions = ["call_parent", "reminder", "restrict_hostel", "installment_offer"]
    elif score >= 30:
        risk = "medium"
        actions = ["reminder", "call_parent", "installment_offer"]
    else:
        risk = "low"
        actions = ["reminder"]

    return {
        "risk_score": risk,
        "score_value": score,
        "total_outstanding": round(total_outstanding, 2),
        "max_overdue_days": max_overdue_days,
        "late_payment_count": late_payment_count,
        "suggested_actions": actions,
    }
