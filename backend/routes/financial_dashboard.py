"""
Financial Dashboard - Integrated Tabung & Accounting Reports
Dashboard Kewangan Bersepadu Tabung & Perakaunan
"""

import os
import logging

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from typing import Any, Dict, Optional
from collections import defaultdict, deque
from sqlalchemy import delete

from models_sql import FinancialDashboardCacheRecord

router = APIRouter(prefix="/api/financial-dashboard", tags=["Financial Dashboard"])
security = HTTPBearer(auto_error=False)

_get_db_func = None
_get_current_user_func = None
_financial_indexes_ensured = False
_financial_response_cache: Dict[str, Dict[str, Any]] = {}
_CACHE_TTL_SECONDS = int(os.environ.get("FINANCIAL_DASHBOARD_CACHE_TTL_SECONDS", "45"))
_MAX_FETCH_DOCS = int(os.environ.get("FINANCIAL_DASHBOARD_MAX_FETCH_DOCS", "200000"))
_PERSISTENT_CACHE_ENABLED = (
    os.environ.get("FINANCIAL_DASHBOARD_PERSISTENT_CACHE_ENABLED", "1").strip().lower()
    not in {"0", "false", "no"}
)
_persistent_cleanup_last_run: Optional[datetime] = None
_INVALIDATION_METRICS_ENABLED = (
    os.environ.get("FINANCIAL_DASHBOARD_INVALIDATION_METRICS_ENABLED", "1").strip().lower()
    not in {"0", "false", "no"}
)
_INVALIDATION_WINDOW_SECONDS = max(
    int(os.environ.get("FINANCIAL_DASHBOARD_INVALIDATION_WINDOW_SECONDS", "3600")),
    60,
)
_INVALIDATION_LOG_INTERVAL_SECONDS = max(
    int(os.environ.get("FINANCIAL_DASHBOARD_INVALIDATION_LOG_INTERVAL_SECONDS", "600")),
    60,
)
_invalidation_totals_by_scope: Dict[str, Dict[str, int]] = defaultdict(
    lambda: {
        "hits_total": 0,
        "memory_entries_removed_total": 0,
        "persistent_entries_removed_total": 0,
    }
)
_invalidation_hits_window_by_scope: Dict[str, deque[datetime]] = defaultdict(deque)
_invalidation_last_log_at: Optional[datetime] = None
_logger = logging.getLogger(__name__)
_FIN_DASHBOARD_ENDPOINTS_ACCOUNTING: tuple[str, ...] = (
    "financial_summary",
    "income_expense_breakdown",
    "recent_transactions",
    "financial_analytics_ai",
)
_FIN_DASHBOARD_ENDPOINTS_DONATION: tuple[str, ...] = (
    "financial_summary",
    "donation_trends",
    "campaign_performance",
    "financial_analytics_ai",
)
_FIN_DASHBOARD_ENDPOINTS_CAMPAIGN: tuple[str, ...] = (
    "financial_summary",
    "campaign_performance",
    "financial_analytics_ai",
)
_FIN_DASHBOARD_ENDPOINTS_YURAN: tuple[str, ...] = (
    "yuran_fee_breakdown",
    "tunggakan_summary",
    "financial_analytics_ai",
)
_FIN_DASHBOARD_INVALIDATION_SCOPES: Dict[str, tuple[str, ...]] = {
    "accounting": _FIN_DASHBOARD_ENDPOINTS_ACCOUNTING,
    "donation": _FIN_DASHBOARD_ENDPOINTS_DONATION,
    "campaign": _FIN_DASHBOARD_ENDPOINTS_CAMPAIGN,
    "yuran": _FIN_DASHBOARD_ENDPOINTS_YURAN,
    "yuran_accounting": tuple(
        dict.fromkeys(_FIN_DASHBOARD_ENDPOINTS_YURAN + _FIN_DASHBOARD_ENDPOINTS_ACCOUNTING)
    ),
    "donation_accounting": tuple(
        dict.fromkeys(_FIN_DASHBOARD_ENDPOINTS_DONATION + _FIN_DASHBOARD_ENDPOINTS_ACCOUNTING)
    ),
}


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


def _to_number(value) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _to_datetime(value):
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    if isinstance(value, str):
        raw = value.strip()
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(raw)
            if dt.tzinfo is None:
                return dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            return None
    return None


def _is_in_range(created_at_value, start_date: Optional[datetime]) -> bool:
    if start_date is None:
        return True
    created_at = _to_datetime(created_at_value)
    if created_at is None:
        return False
    return created_at >= start_date


def _build_created_at_filter(start_date: Optional[datetime]) -> Dict[str, Any]:
    if start_date is None:
        return {}
    return {
        "$or": [
            {"created_at": {"$gte": start_date}},
            {"created_at": {"$gte": start_date.isoformat()}},
        ]
    }


def _cache_key(name: str, **kwargs) -> str:
    parts = [name]
    for key in sorted(kwargs.keys()):
        parts.append(f"{key}={kwargs[key]}")
    return "|".join(parts)


def _cache_get(key: str):
    if _CACHE_TTL_SECONDS <= 0:
        return None
    item = _financial_response_cache.get(key)
    if not item:
        return None
    if datetime.now(timezone.utc) >= item["expires_at"]:
        _financial_response_cache.pop(key, None)
        return None
    return item.get("value")


def _cache_set(key: str, value) -> None:
    if _CACHE_TTL_SECONDS <= 0:
        return
    _financial_response_cache[key] = {
        "expires_at": datetime.now(timezone.utc) + timedelta(seconds=_CACHE_TTL_SECONDS),
        "value": value,
    }


def _cache_endpoint(key: str) -> str:
    if not key:
        return ""
    return key.split("|", 1)[0]


def get_financial_dashboard_invalidation_endpoints(scope: Optional[str]) -> Optional[list[str]]:
    """
    Resolve invalidation scope to endpoint list.
    Return None for full invalidation.
    """
    normalized = (scope or "").strip().lower()
    if normalized in {"", "all", "*"}:
        return None
    endpoints = _FIN_DASHBOARD_INVALIDATION_SCOPES.get(normalized)
    if endpoints is None:
        return None
    return list(endpoints)


def _normalize_invalidation_scope(scope: Optional[str]) -> str:
    normalized = (scope or "").strip().lower()
    if normalized in {"", "all", "*"}:
        return "all"
    if normalized in _FIN_DASHBOARD_INVALIDATION_SCOPES:
        return normalized
    return "custom"


def _prune_scope_window(scope_key: str, now: datetime) -> None:
    window = _invalidation_hits_window_by_scope[scope_key]
    cutoff = now - timedelta(seconds=_INVALIDATION_WINDOW_SECONDS)
    while window and window[0] < cutoff:
        window.popleft()


def _collect_invalidation_metrics_snapshot(now: Optional[datetime] = None) -> Dict[str, Dict[str, Any]]:
    now = now or datetime.now(timezone.utc)
    snapshot: Dict[str, Dict[str, Any]] = {}
    for scope_key in sorted(_invalidation_totals_by_scope.keys()):
        _prune_scope_window(scope_key, now)
        totals = _invalidation_totals_by_scope[scope_key]
        window = _invalidation_hits_window_by_scope[scope_key]
        snapshot[scope_key] = {
            "hits_total": totals["hits_total"],
            "hits_in_window": len(window),
            "window_seconds": _INVALIDATION_WINDOW_SECONDS,
            "memory_entries_removed_total": totals["memory_entries_removed_total"],
            "persistent_entries_removed_total": totals["persistent_entries_removed_total"],
        }
    return snapshot


def get_financial_dashboard_invalidation_metrics() -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    return {
        "enabled": _INVALIDATION_METRICS_ENABLED,
        "window_seconds": _INVALIDATION_WINDOW_SECONDS,
        "log_interval_seconds": _INVALIDATION_LOG_INTERVAL_SECONDS,
        "generated_at": now.isoformat(),
        "by_scope": _collect_invalidation_metrics_snapshot(now),
    }


def _prometheus_escape_label(value: str) -> str:
    return value.replace("\\", "\\\\").replace("\n", "\\n").replace('"', '\\"')


def get_financial_dashboard_invalidation_metrics_prometheus() -> str:
    metrics = get_financial_dashboard_invalidation_metrics()
    by_scope = metrics.get("by_scope", {}) or {}
    window_seconds = int(metrics.get("window_seconds", _INVALIDATION_WINDOW_SECONDS))
    log_interval_seconds = int(
        metrics.get("log_interval_seconds", _INVALIDATION_LOG_INTERVAL_SECONDS)
    )
    enabled = 1 if metrics.get("enabled") else 0

    lines = [
        "# HELP financial_dashboard_cache_invalidation_metrics_enabled Whether invalidation telemetry is enabled.",
        "# TYPE financial_dashboard_cache_invalidation_metrics_enabled gauge",
        f"financial_dashboard_cache_invalidation_metrics_enabled {enabled}",
        "# HELP financial_dashboard_cache_invalidation_window_seconds Rolling time window used for per-scope hit counters.",
        "# TYPE financial_dashboard_cache_invalidation_window_seconds gauge",
        f"financial_dashboard_cache_invalidation_window_seconds {window_seconds}",
        "# HELP financial_dashboard_cache_invalidation_log_interval_seconds Interval for periodic invalidation summary logs.",
        "# TYPE financial_dashboard_cache_invalidation_log_interval_seconds gauge",
        f"financial_dashboard_cache_invalidation_log_interval_seconds {log_interval_seconds}",
        "# HELP financial_dashboard_cache_invalidation_hits_total Total cache invalidation calls by scope.",
        "# TYPE financial_dashboard_cache_invalidation_hits_total counter",
        "# HELP financial_dashboard_cache_invalidation_hits_window Current cache invalidation hits in configured rolling window by scope.",
        "# TYPE financial_dashboard_cache_invalidation_hits_window gauge",
        "# HELP financial_dashboard_cache_invalidation_memory_entries_removed_total Total in-memory cache entries removed by invalidation scope.",
        "# TYPE financial_dashboard_cache_invalidation_memory_entries_removed_total counter",
        "# HELP financial_dashboard_cache_invalidation_persistent_entries_removed_total Total persistent cache rows removed by invalidation scope.",
        "# TYPE financial_dashboard_cache_invalidation_persistent_entries_removed_total counter",
    ]

    for scope_name, stats in sorted(by_scope.items()):
        label = f'scope="{_prometheus_escape_label(str(scope_name))}"'
        lines.append(
            f"financial_dashboard_cache_invalidation_hits_total{{{label}}} "
            f"{int(stats.get('hits_total', 0) or 0)}"
        )
        lines.append(
            f"financial_dashboard_cache_invalidation_hits_window{{{label}}} "
            f"{int(stats.get('hits_in_window', 0) or 0)}"
        )
        lines.append(
            f"financial_dashboard_cache_invalidation_memory_entries_removed_total{{{label}}} "
            f"{int(stats.get('memory_entries_removed_total', 0) or 0)}"
        )
        lines.append(
            f"financial_dashboard_cache_invalidation_persistent_entries_removed_total{{{label}}} "
            f"{int(stats.get('persistent_entries_removed_total', 0) or 0)}"
        )

    return "\n".join(lines) + "\n"


def _record_invalidation_metrics(
    scope: Optional[str],
    removed_memory: int,
    removed_persistent: int,
) -> None:
    global _invalidation_last_log_at
    if not _INVALIDATION_METRICS_ENABLED:
        return

    now = datetime.now(timezone.utc)
    scope_key = _normalize_invalidation_scope(scope)
    totals = _invalidation_totals_by_scope[scope_key]
    totals["hits_total"] += 1
    totals["memory_entries_removed_total"] += removed_memory
    totals["persistent_entries_removed_total"] += removed_persistent

    window = _invalidation_hits_window_by_scope[scope_key]
    window.append(now)
    _prune_scope_window(scope_key, now)

    if (
        _invalidation_last_log_at is None
        or (now - _invalidation_last_log_at).total_seconds() >= _INVALIDATION_LOG_INTERVAL_SECONDS
    ):
        snapshot = _collect_invalidation_metrics_snapshot(now)
        if snapshot:
            compact = ", ".join(
                f"{scope_name}:hits_total={stats['hits_total']},hits_window={stats['hits_in_window']}"
                for scope_name, stats in snapshot.items()
            )
            _logger.info("financial_dashboard cache invalidation metrics | %s", compact)
        _invalidation_last_log_at = now


def _invalidate_in_memory_cache(endpoints: Optional[list[str]] = None) -> int:
    endpoint_filter = set(endpoints or [])
    removed = 0
    for key in list(_financial_response_cache.keys()):
        endpoint = _cache_endpoint(key)
        if endpoint_filter and endpoint not in endpoint_filter:
            continue
        if _financial_response_cache.pop(key, None) is not None:
            removed += 1
    return removed


async def invalidate_financial_dashboard_cache(
    db,
    endpoints: Optional[list[str]] = None,
    scope: Optional[str] = "all",
) -> Dict[str, int]:
    """
    Invalidate financial dashboard caches across:
    - in-memory TTL cache (this process)
    - persistent PostgreSQL cache table (if available)
    """
    resolved_endpoints = endpoints
    if resolved_endpoints is None:
        resolved_endpoints = get_financial_dashboard_invalidation_endpoints(scope)

    removed_memory = _invalidate_in_memory_cache(endpoints=resolved_endpoints)
    removed_persistent = 0
    endpoint_filter = set(resolved_endpoints or [])

    session_factory = _get_session_factory_from_db(db)
    if session_factory is not None:
        async with session_factory() as session:
            stmt = delete(FinancialDashboardCacheRecord)
            if endpoint_filter:
                stmt = stmt.where(FinancialDashboardCacheRecord.endpoint.in_(list(endpoint_filter)))
            result = await session.execute(stmt)
            await session.commit()
            removed_persistent = int(result.rowcount or 0)

    _record_invalidation_metrics(
        scope=scope,
        removed_memory=removed_memory,
        removed_persistent=removed_persistent,
    )

    return {
        "memory_entries_removed": removed_memory,
        "persistent_entries_removed": removed_persistent,
    }


def _get_session_factory_from_db(db):
    if not _PERSISTENT_CACHE_ENABLED:
        return None

    candidate = db
    raw_getter = getattr(candidate, "get_raw_db", None)
    if callable(raw_getter):
        try:
            candidate = raw_getter()
        except Exception:
            candidate = db

    session_factory_getter = getattr(candidate, "get_session_factory", None)
    if callable(session_factory_getter):
        try:
            return session_factory_getter()
        except Exception:
            return None
    return None


async def _persistent_cache_get(db, key: str):
    session_factory = _get_session_factory_from_db(db)
    if session_factory is None:
        return None

    now = datetime.now(timezone.utc)
    async with session_factory() as session:
        row = await session.get(FinancialDashboardCacheRecord, key)
        if row is None:
            return None
        if row.expires_at <= now:
            await session.execute(
                delete(FinancialDashboardCacheRecord).where(
                    FinancialDashboardCacheRecord.cache_key == key
                )
            )
            await session.commit()
            return None
        return row.payload


async def _maybe_cleanup_persistent_cache(db) -> None:
    global _persistent_cleanup_last_run
    session_factory = _get_session_factory_from_db(db)
    if session_factory is None:
        return

    now = datetime.now(timezone.utc)
    if (
        _persistent_cleanup_last_run is not None
        and now - _persistent_cleanup_last_run < timedelta(minutes=10)
    ):
        return

    async with session_factory() as session:
        await session.execute(
            delete(FinancialDashboardCacheRecord).where(
                FinancialDashboardCacheRecord.expires_at <= now
            )
        )
        await session.commit()
    _persistent_cleanup_last_run = now


async def _persistent_cache_set(db, key: str, endpoint: str, value) -> None:
    session_factory = _get_session_factory_from_db(db)
    if session_factory is None:
        return

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=max(_CACHE_TTL_SECONDS, 1))
    async with session_factory() as session:
        row = await session.get(FinancialDashboardCacheRecord, key)
        if row is None:
            session.add(
                FinancialDashboardCacheRecord(
                    cache_key=key,
                    endpoint=endpoint,
                    payload=value,
                    generated_at=now,
                    expires_at=expires_at,
                )
            )
        else:
            row.endpoint = endpoint
            row.payload = value
            row.generated_at = now
            row.expires_at = expires_at
        await session.commit()


async def _get_cached_response(db, key: str):
    cached = _cache_get(key)
    if cached is not None:
        return cached

    persistent = await _persistent_cache_get(db, key)
    if persistent is not None:
        _cache_set(key, persistent)
        return persistent
    return None


async def _set_cached_response(db, key: str, endpoint: str, value) -> None:
    _cache_set(key, value)
    await _persistent_cache_set(db, key, endpoint, value)
    await _maybe_cleanup_persistent_cache(db)


async def _ensure_financial_indexes(db) -> None:
    global _financial_indexes_ensured
    if _financial_indexes_ensured:
        return
    try:
        await db.tabung_donations.create_index([("payment_status", 1), ("created_at", -1)])
        await db.tabung_donations.create_index([("campaign_id", 1), ("payment_status", 1), ("created_at", -1)])
        await db.accounting_transactions.create_index([("status", 1), ("type", 1), ("created_at", -1)])
        await db.accounting_transactions.create_index([("category_id", 1), ("type", 1), ("status", 1)])
        await db.tabung_campaigns.create_index([("status", 1)])
    except Exception:
        # Keep runtime resilient if index creation is unsupported/unavailable.
        pass
    _financial_indexes_ensured = True


def _created_at_sort_key(row: Dict[str, Any]) -> datetime:
    created_at = _to_datetime(row.get("created_at"))
    if created_at is None:
        return datetime(1970, 1, 1, tzinfo=timezone.utc)
    return created_at


async def _get_filtered_completed_donations(db, start_date: Optional[datetime]):
    query = {"payment_status": "completed"}
    query.update(_build_created_at_filter(start_date))
    rows = await db.tabung_donations.find(query).to_list(_MAX_FETCH_DOCS)
    if start_date is None:
        return rows
    return [row for row in rows if _is_in_range(row.get("created_at"), start_date)]


async def _get_filtered_accounting_transactions(db, start_date: Optional[datetime]):
    query = {"status": {"$in": ["verified", "pending"]}}
    query.update(_build_created_at_filter(start_date))
    rows = await db.accounting_transactions.find(query).to_list(_MAX_FETCH_DOCS)
    if start_date is None:
        return rows
    return [row for row in rows if _is_in_range(row.get("created_at"), start_date)]


@router.get("/summary")
async def get_financial_summary(
    period: Optional[str] = "month",  # month, quarter, year, all
    user: dict = Depends(get_current_user)
):
    """
    Get integrated financial summary from Tabung & Accounting modules
    Accessible by: superadmin, admin, bendahari
    """
    if user["role"] not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    db = get_db()
    await _ensure_financial_indexes(db)
    cache_key = _cache_key("financial_summary", period=period or "month")
    cached = await _get_cached_response(db, cache_key)
    if cached is not None:
        return cached
    
    # Calculate date range
    now = datetime.now(timezone.utc)
    if period == "month":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "quarter":
        quarter_month = ((now.month - 1) // 3) * 3 + 1
        start_date = now.replace(month=quarter_month, day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "year":
        start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        start_date = None
    
    # ========== TABUNG & SUMBANGAN ==========
    
    # Get donation stats (relational-compatible, no Mongo aggregate pipeline)
    donation_rows = await _get_filtered_completed_donations(db, start_date)
    unique_donors = {
        (row.get("donor_name") or "").strip()
        for row in donation_rows
        if (row.get("donor_name") or "").strip()
    }
    donation_stats = {
        "total_donations": sum(_to_number(row.get("amount")) for row in donation_rows),
        "donation_count": len(donation_rows),
        "unique_donors": list(unique_donors),
    }
    
    # Get active campaigns count
    active_campaigns = await db.tabung_campaigns.count_documents({"status": "active"})
    completed_campaigns = await db.tabung_campaigns.count_documents({"status": "completed"})
    
    # ========== ACCOUNTING MODULE ==========
    
    accounting_rows = await _get_filtered_accounting_transactions(db, start_date)
    income_rows = [row for row in accounting_rows if row.get("type") == "income"]
    expense_rows = [row for row in accounting_rows if row.get("type") == "expense"]
    income_stats = {
        "total_income": sum(_to_number(row.get("amount")) for row in income_rows),
        "income_count": len(income_rows),
    }
    expense_stats = {
        "total_expense": sum(_to_number(row.get("amount")) for row in expense_rows),
        "expense_count": len(expense_rows),
    }
    
    # Calculate net balance
    total_income = income_stats.get("total_income", 0)
    total_expense = expense_stats.get("total_expense", 0)
    net_balance = total_income - total_expense
    
    result = {
        "period": period,
        "period_start": start_date.isoformat() if start_date else None,
        "generated_at": now.isoformat(),
        
        # Tabung Summary
        "tabung": {
            "total_donations": donation_stats.get("total_donations", 0),
            "donation_count": donation_stats.get("donation_count", 0),
            "unique_donors": len(donation_stats.get("unique_donors", [])),
            "active_campaigns": active_campaigns,
            "completed_campaigns": completed_campaigns
        },
        
        # Accounting Summary
        "accounting": {
            "total_income": total_income,
            "income_count": income_stats.get("income_count", 0),
            "total_expense": total_expense,
            "expense_count": expense_stats.get("expense_count", 0),
            "net_balance": net_balance
        },
        
        # Combined
        "combined": {
            "total_revenue": total_income,
            "total_expenditure": total_expense,
            "surplus_deficit": net_balance,
            "health_status": "surplus" if net_balance > 0 else "deficit" if net_balance < 0 else "balanced"
        }
    }
    await _set_cached_response(db, cache_key, "financial_summary", result)
    return result


@router.get("/donation-trends")
async def get_donation_trends(
    period: Optional[str] = "month",  # week, month, year
    user: dict = Depends(get_current_user)
):
    """Get donation trends over time"""
    if user["role"] not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    db = get_db()
    await _ensure_financial_indexes(db)
    cache_key = _cache_key("donation_trends", period=period or "month")
    cached = await _get_cached_response(db, cache_key)
    if cached is not None:
        return cached
    now = datetime.now(timezone.utc)
    
    if period == "week":
        start_date = now - timedelta(days=7)
        group_format = "%Y-%m-%d"
    elif period == "month":
        start_date = now - timedelta(days=30)
        group_format = "%Y-%m-%d"
    else:  # year
        start_date = now - timedelta(days=365)
        group_format = "%Y-%m"
    
    donation_rows = await _get_filtered_completed_donations(db, start_date)
    trend_map = {}
    for row in donation_rows:
        created_at = _to_datetime(row.get("created_at"))
        if created_at is None:
            continue
        bucket = created_at.strftime(group_format)
        if bucket not in trend_map:
            trend_map[bucket] = {"date": bucket, "total": 0.0, "count": 0}
        trend_map[bucket]["total"] += _to_number(row.get("amount"))
        trend_map[bucket]["count"] += 1

    trends = [trend_map[k] for k in sorted(trend_map.keys())]
    result = {"period": period, "trends": trends}
    await _set_cached_response(db, cache_key, "donation_trends", result)
    return result


@router.get("/income-expense-breakdown")
async def get_income_expense_breakdown(
    period: Optional[str] = "month",
    user: dict = Depends(get_current_user)
):
    """Get breakdown of income and expenses by category"""
    if user["role"] not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    db = get_db()
    await _ensure_financial_indexes(db)
    cache_key = _cache_key("income_expense_breakdown", period=period or "month")
    cached = await _get_cached_response(db, cache_key)
    if cached is not None:
        return cached
    now = datetime.now(timezone.utc)
    
    if period == "month":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "quarter":
        quarter_month = ((now.month - 1) // 3) * 3 + 1
        start_date = now.replace(month=quarter_month, day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "year":
        start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        start_date = None
    
    # Get all categories
    categories = await db.accounting_categories.find({}).to_list(100)
    category_map = {str(c["_id"]): c for c in categories}

    transactions = await _get_filtered_accounting_transactions(db, start_date)
    income_groups = {}
    expense_groups = {}

    for tx in transactions:
        tx_type = tx.get("type")
        if tx_type not in {"income", "expense"}:
            continue
        cat_id = str(tx.get("category_id")) if tx.get("category_id") is not None else None
        bucket = income_groups if tx_type == "income" else expense_groups
        if cat_id not in bucket:
            bucket[cat_id] = {"category_id": cat_id, "total": 0.0, "count": 0}
        bucket[cat_id]["total"] += _to_number(tx.get("amount"))
        bucket[cat_id]["count"] += 1

    income_breakdown = []
    for cat_id, data in income_groups.items():
        cat = category_map.get(cat_id, {})
        income_breakdown.append(
            {
                "category_id": cat_id,
                "category_name": cat.get("name", "Lain-lain"),
                "total": data["total"],
                "count": data["count"],
            }
        )
    income_breakdown.sort(key=lambda x: x["total"], reverse=True)

    expense_breakdown = []
    for cat_id, data in expense_groups.items():
        cat = category_map.get(cat_id, {})
        expense_breakdown.append(
            {
                "category_id": cat_id,
                "category_name": cat.get("name", "Lain-lain"),
                "total": data["total"],
                "count": data["count"],
            }
        )
    expense_breakdown.sort(key=lambda x: x["total"], reverse=True)
    
    result = {
        "period": period,
        "income_breakdown": income_breakdown,
        "expense_breakdown": expense_breakdown
    }
    await _set_cached_response(db, cache_key, "income_expense_breakdown", result)
    return result


@router.get("/campaign-performance")
async def get_campaign_performance(user: dict = Depends(get_current_user)):
    """Get performance metrics for all campaigns"""
    if user["role"] not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    db = get_db()
    await _ensure_financial_indexes(db)
    cache_key = _cache_key("campaign_performance")
    cached = await _get_cached_response(db, cache_key)
    if cached is not None:
        return cached
    
    campaigns = await db.tabung_campaigns.find({}).to_list(100)
    donations = await db.tabung_donations.find({"payment_status": "completed"}).to_list(200000)

    donations_by_campaign = {}
    for donation in donations:
        campaign_key = str(donation.get("campaign_id")) if donation.get("campaign_id") is not None else None
        if not campaign_key:
            continue
        if campaign_key not in donations_by_campaign:
            donations_by_campaign[campaign_key] = {"total": 0.0, "count": 0}
        donations_by_campaign[campaign_key]["total"] += _to_number(donation.get("amount"))
        donations_by_campaign[campaign_key]["count"] += 1
    
    performance = []
    for c in campaigns:
        campaign_id = c["_id"]
        donation_stats = donations_by_campaign.get(str(campaign_id), {"total": 0.0, "count": 0})
        
        # Calculate progress
        if c["campaign_type"] == "slot":
            target = c.get("total_slots", 0) * c.get("price_per_slot", 0)
            collected = c.get("slots_sold", 0) * c.get("price_per_slot", 0)
        else:
            target = c.get("target_amount", 0)
            collected = c.get("collected_amount", 0)
        
        progress = (collected / target * 100) if target > 0 else 0
        
        performance.append({
            "id": str(campaign_id),
            "title": c["title"],
            "type": c["campaign_type"],
            "status": c.get("status", "active"),
            "target": target,
            "collected": collected,
            "progress_percent": round(progress, 1),
            "donor_count": c.get("donor_count", donation_stats.get("count", 0)),
            "is_featured": c.get("is_featured", False)
        })
    
    # Sort by progress descending
    performance.sort(key=lambda x: x["progress_percent"], reverse=True)
    
    result = {
        "campaigns": performance,
        "total_campaigns": len(performance),
        "total_target": sum(p["target"] for p in performance),
        "total_collected": sum(p["collected"] for p in performance),
        "overall_progress": round(
            sum(p["collected"] for p in performance) / sum(p["target"] for p in performance) * 100, 1
        ) if sum(p["target"] for p in performance) > 0 else 0
    }
    await _set_cached_response(db, cache_key, "campaign_performance", result)
    return result


@router.get("/recent-transactions")
async def get_recent_transactions(
    limit: int = 20,
    user: dict = Depends(get_current_user)
):
    """Get recent transactions from both Tabung and Accounting"""
    if user["role"] not in ["superadmin", "admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    db = get_db()
    await _ensure_financial_indexes(db)
    cache_key = _cache_key("recent_transactions", limit=limit)
    cached = await _get_cached_response(db, cache_key)
    if cached is not None:
        return cached
    
    transactions = []
    
    # Get recent donations
    donations = await db.tabung_donations.find(
        {"payment_status": "completed"}
    ).sort("created_at", -1).limit(limit // 2).to_list(limit // 2)
    
    for d in donations:
        transactions.append({
            "id": str(d["_id"]),
            "type": "donation",
            "amount": d.get("amount", 0),
            "description": f"Sumbangan: {d.get('campaign_title', 'Kempen')}",
            "donor_name": d.get("donor_name", "Penderma"),
            "reference": d.get("receipt_number", ""),
            "created_at": d["created_at"].isoformat() if isinstance(d.get("created_at"), datetime) else d.get("created_at"),
            "source": "tabung"
        })
    
    # Get recent accounting transactions
    accounting = await db.accounting_transactions.find(
        {"status": {"$in": ["verified", "pending"]}}
    ).sort("created_at", -1).limit(limit // 2).to_list(limit // 2)
    
    for a in accounting:
        transactions.append({
            "id": str(a["_id"]),
            "type": a.get("type", "income"),
            "amount": a.get("amount", 0),
            "description": a.get("description", ""),
            "reference": a.get("transaction_number", ""),
            "created_at": a["created_at"].isoformat() if isinstance(a.get("created_at"), datetime) else a.get("created_at"),
            "source": "accounting"
        })
    
    # Sort all transactions by date
    transactions.sort(key=lambda x: x["created_at"], reverse=True)
    
    result = {
        "transactions": transactions[:limit],
        "total": len(transactions)
    }
    await _set_cached_response(db, cache_key, "recent_transactions", result)
    return result


# ==================== YURAN FEE BREAKDOWN ====================

@router.get("/yuran-breakdown")
async def get_yuran_fee_breakdown(
    tahun: Optional[int] = None,
    user: dict = Depends(get_current_user)
):
    """
    Get detailed breakdown of school fees by category and payment method
    Pecahan terperinci yuran maktab mengikut kategori dan kaedah bayaran
    """
    if user["role"] not in ["superadmin", "admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    db = get_db()
    await _ensure_financial_indexes(db)
    now = datetime.now(timezone.utc)
    
    # Default to current year if not specified
    if not tahun:
        tahun = now.year

    cache_key = _cache_key("yuran_fee_breakdown", tahun=tahun)
    cached = await _get_cached_response(db, cache_key)
    if cached is not None:
        return cached
    
    # ========== 1. CATEGORY BREAKDOWN ==========
    # Get all student_yuran records for the year
    student_yuran_records = await db.student_yuran.find({"tahun": tahun}).to_list(2000)
    
    # Get set_yuran to understand category structure
    set_yuran_list = await db.set_yuran.find({"tahun": tahun, "is_active": True}).to_list(10)
    
    # Build category breakdown
    category_breakdown = {}
    
    for record in student_yuran_records:
        items = record.get("items", [])
        payments = record.get("payments", [])
        
        for item in items:
            cat_name = item.get("sub_category") or item.get("category") or "Lain-lain"
            item_name = item.get("name", "Item")
            item_amount = item.get("amount", 0)
            item_paid = item.get("paid_amount", 0)
            
            if cat_name not in category_breakdown:
                category_breakdown[cat_name] = {
                    "name": cat_name,
                    "total_expected": 0,
                    "total_collected": 0,
                    "student_count": 0,
                    "items": {}
                }
            
            category_breakdown[cat_name]["total_expected"] += item_amount
            category_breakdown[cat_name]["total_collected"] += item_paid
            
            # Track individual items
            if item_name not in category_breakdown[cat_name]["items"]:
                category_breakdown[cat_name]["items"][item_name] = {
                    "name": item_name,
                    "expected": 0,
                    "collected": 0
                }
            category_breakdown[cat_name]["items"][item_name]["expected"] += item_amount
            category_breakdown[cat_name]["items"][item_name]["collected"] += item_paid
    
    # Calculate percentages and format
    category_list = []
    for cat_name, cat_data in category_breakdown.items():
        expected = cat_data["total_expected"]
        collected = cat_data["total_collected"]
        percentage = (collected / expected * 100) if expected > 0 else 0
        
        category_list.append({
            "name": cat_name,
            "total_expected": expected,
            "total_collected": collected,
            "outstanding": expected - collected,
            "collection_rate": round(percentage, 1),
            "items": list(cat_data["items"].values())
        })
    
    # Sort by expected amount descending
    category_list.sort(key=lambda x: x["total_expected"], reverse=True)
    
    # ========== 2. PAYMENT METHOD BREAKDOWN ==========
    # Get all yuran_payments for the year
    payment_records = await db.yuran_payments.find({
        "created_at": {"$regex": f"^{tahun}"}
    }).to_list(5000)
    
    # If no yuran_payments, extract from student_yuran payments array
    if not payment_records:
        payment_records = []
        for record in student_yuran_records:
            for payment in record.get("payments", []):
                payment["student_yuran_id"] = str(record["_id"])
                payment["student_name"] = record.get("student_name")
                payment_records.append(payment)
    
    # Categorize by payment method
    full_payments = {"count": 0, "total": 0, "students": set()}
    installment_payments = {"count": 0, "total": 0, "students": set(), "by_installment_number": {}}
    partial_payments = {"count": 0, "total": 0, "students": set()}
    
    for record in student_yuran_records:
        student_id = str(record.get("student_id"))
        total_amount = record.get("total_amount", 0)
        paid_amount = record.get("paid_amount", 0)
        status = record.get("status", "pending")
        installment_plan = record.get("installment_plan")
        
        if status == "paid":
            # Check if paid in full at once or via installments
            payments = record.get("payments", [])
            if len(payments) == 1 or not installment_plan:
                full_payments["count"] += 1
                full_payments["total"] += paid_amount
                full_payments["students"].add(student_id)
            else:
                # Paid via installments
                installment_payments["count"] += 1
                installment_payments["total"] += paid_amount
                installment_payments["students"].add(student_id)
        elif status == "partial":
            if installment_plan:
                installment_payments["count"] += 1
                installment_payments["total"] += paid_amount
                installment_payments["students"].add(student_id)
                
                # Track by installment number
                paid_installments = installment_plan.get("paid_installments", 0)
                total_installments = installment_plan.get("total_installments", 1)
                key = f"{paid_installments}/{total_installments}"
                if key not in installment_payments["by_installment_number"]:
                    installment_payments["by_installment_number"][key] = {"count": 0, "total": 0}
                installment_payments["by_installment_number"][key]["count"] += 1
                installment_payments["by_installment_number"][key]["total"] += paid_amount
            else:
                partial_payments["count"] += 1
                partial_payments["total"] += paid_amount
                partial_payments["students"].add(student_id)
    
    payment_method_breakdown = {
        "bayar_penuh": {
            "label": "Bayaran Penuh",
            "description": "Pelajar yang bayar sekali gus",
            "count": full_payments["count"],
            "total_collected": full_payments["total"],
            "unique_students": len(full_payments["students"])
        },
        "ansuran": {
            "label": "Bayaran Ansuran",
            "description": "Pelajar yang bayar secara berperingkat",
            "count": installment_payments["count"],
            "total_collected": installment_payments["total"],
            "unique_students": len(installment_payments["students"]),
            "by_progress": installment_payments["by_installment_number"]
        },
        "separa": {
            "label": "Bayaran Separa",
            "description": "Pelajar yang buat bayaran tidak lengkap",
            "count": partial_payments["count"],
            "total_collected": partial_payments["total"],
            "unique_students": len(partial_payments["students"])
        }
    }
    
    # ========== 3. OUTSTANDING/TUNGGAKAN ==========
    total_expected = sum(r.get("total_amount", 0) for r in student_yuran_records)
    total_collected = sum(r.get("paid_amount", 0) for r in student_yuran_records)
    total_outstanding = total_expected - total_collected
    
    # Outstanding by tingkatan
    outstanding_by_tingkatan = {}
    for record in student_yuran_records:
        tingkatan = record.get("tingkatan", 0)
        outstanding = record.get("total_amount", 0) - record.get("paid_amount", 0)
        
        if tingkatan not in outstanding_by_tingkatan:
            outstanding_by_tingkatan[tingkatan] = {
                "tingkatan": tingkatan,
                "total_expected": 0,
                "total_collected": 0,
                "outstanding": 0,
                "student_count": 0,
                "students_with_outstanding": 0
            }
        
        outstanding_by_tingkatan[tingkatan]["total_expected"] += record.get("total_amount", 0)
        outstanding_by_tingkatan[tingkatan]["total_collected"] += record.get("paid_amount", 0)
        outstanding_by_tingkatan[tingkatan]["outstanding"] += outstanding
        outstanding_by_tingkatan[tingkatan]["student_count"] += 1
        if outstanding > 0:
            outstanding_by_tingkatan[tingkatan]["students_with_outstanding"] += 1
    
    # Sort by tingkatan and add collection_rate per tingkatan
    for t in outstanding_by_tingkatan.values():
        exp = t.get("total_expected", 0)
        t["collection_rate"] = round((t["total_collected"] / exp * 100) if exp > 0 else 0, 1)
    outstanding_list = sorted(outstanding_by_tingkatan.values(), key=lambda x: x["tingkatan"])
    
    # Students with outstanding
    students_with_outstanding = len([r for r in student_yuran_records if r.get("total_amount", 0) > r.get("paid_amount", 0)])
    students_fully_paid = len([r for r in student_yuran_records if r.get("status") == "paid"])
    
    result = {
        "tahun": tahun,
        "generated_at": now.isoformat(),
        
        # Overall Summary
        "summary": {
            "total_students": len(student_yuran_records),
            "total_expected": total_expected,
            "total_collected": total_collected,
            "total_outstanding": total_outstanding,
            "collection_rate": round((total_collected / total_expected * 100) if total_expected > 0 else 0, 1),
            "students_fully_paid": students_fully_paid,
            "students_with_outstanding": students_with_outstanding
        },
        
        # Category Breakdown
        "category_breakdown": category_list,
        
        # Payment Method Breakdown
        "payment_method_breakdown": payment_method_breakdown,
        
        # Outstanding by Tingkatan
        "outstanding_by_tingkatan": outstanding_list
    }
    await _set_cached_response(db, cache_key, "yuran_fee_breakdown", result)
    return result


@router.get("/analytics-ai")
async def get_financial_analytics_ai(
    tahun: Optional[int] = None,
    user: dict = Depends(get_current_user)
):
    """
    Get financial analytics for AI page: by class (tingkatan), jantina, negeri;
    cadangan: kelas paling lambat bayar, kelas paling cepat habis bayar.
    """
    if user["role"] not in ["superadmin", "admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    db = get_db()
    await _ensure_financial_indexes(db)
    now = datetime.now(timezone.utc)
    if not tahun:
        tahun = now.year

    cache_key = _cache_key("financial_analytics_ai", tahun=tahun)
    cached = await _get_cached_response(db, cache_key)
    if cached is not None:
        return cached
    
    student_yuran_records = await db.student_yuran.find({"tahun": tahun}).to_list(2000)
    if not student_yuran_records:
        empty_result = {
            "tahun": tahun,
            "generated_at": now.isoformat(),
            "summary": {
                "total_students": 0,
                "total_expected": 0,
                "total_collected": 0,
                "total_outstanding": 0,
                "collection_rate": 0,
                "students_fully_paid": 0,
                "students_with_outstanding": 0,
            },
            "outstanding_by_tingkatan": [],
            "ai_cadangan": {"slowest_class": None, "fastest_class": None},
            "by_jantina": [],
            "by_negeri": [],
        }
        await _set_cached_response(db, cache_key, "financial_analytics_ai", empty_result)
        return empty_result
    
    # Normalize student_id to ObjectId for lookup
    student_ids = []
    for r in student_yuran_records:
        sid = r.get("student_id")
        if sid is None:
            continue
        if isinstance(sid, ObjectId):
            student_ids.append(sid)
        else:
            try:
                student_ids.append(ObjectId(sid))
            except Exception:
                pass
    
    students_data = {}
    if student_ids:
        students_list = await db.students.find({"_id": {"$in": student_ids}}).to_list(5000)
        students_data = {str(s["_id"]): s for s in students_list}
    
    # By tingkatan (with collection_rate)
    outstanding_by_tingkatan = {}
    for record in student_yuran_records:
        tingkatan = record.get("tingkatan", 0)
        total_amount = record.get("total_amount", 0)
        paid_amount = record.get("paid_amount", 0)
        outstanding = total_amount - paid_amount
        if tingkatan not in outstanding_by_tingkatan:
            outstanding_by_tingkatan[tingkatan] = {
                "tingkatan": tingkatan,
                "total_expected": 0,
                "total_collected": 0,
                "outstanding": 0,
                "student_count": 0,
                "students_with_outstanding": 0,
            }
        outstanding_by_tingkatan[tingkatan]["total_expected"] += total_amount
        outstanding_by_tingkatan[tingkatan]["total_collected"] += paid_amount
        outstanding_by_tingkatan[tingkatan]["outstanding"] += outstanding
        outstanding_by_tingkatan[tingkatan]["student_count"] += 1
        if outstanding > 0:
            outstanding_by_tingkatan[tingkatan]["students_with_outstanding"] += 1
    
    for t in outstanding_by_tingkatan.values():
        exp = t.get("total_expected", 0)
        t["collection_rate"] = round((t["total_collected"] / exp * 100) if exp > 0 else 0, 1)
    
    outstanding_list = sorted(outstanding_by_tingkatan.values(), key=lambda x: x["tingkatan"])
    
    # Slowest class (lowest collection rate), fastest class (highest collection rate)
    slowest_class = None
    fastest_class = None
    if outstanding_list:
        with_rate = [x for x in outstanding_list if x.get("student_count", 0) > 0]
        if with_rate:
            slowest_class = min(with_rate, key=lambda x: x.get("collection_rate", 100))
            fastest_class = max(with_rate, key=lambda x: x.get("collection_rate", 0))
    
    # By jantina
    by_jantina_map = {}
    for record in student_yuran_records:
        sid = str(record.get("student_id", ""))
        student = students_data.get(sid, {})
        gender = (student.get("gender") or "unknown").lower()
        if gender not in ("male", "female"):
            gender = "lain" if gender == "unknown" else gender
        key = "Lelaki" if gender == "male" else ("Perempuan" if gender == "female" else "Lain-lain")
        if key not in by_jantina_map:
            by_jantina_map[key] = {
                "jantina": key,
                "total_expected": 0,
                "total_collected": 0,
                "student_count": 0,
            }
        by_jantina_map[key]["total_expected"] += record.get("total_amount", 0)
        by_jantina_map[key]["total_collected"] += record.get("paid_amount", 0)
        by_jantina_map[key]["student_count"] += 1
    
    for v in by_jantina_map.values():
        exp = v.get("total_expected", 0)
        v["collection_rate"] = round((v["total_collected"] / exp * 100) if exp > 0 else 0, 1)
        v["outstanding"] = v["total_expected"] - v["total_collected"]
    by_jantina = sorted(by_jantina_map.values(), key=lambda x: x["total_expected"], reverse=True)
    
    # By negeri
    by_negeri_map = {}
    for record in student_yuran_records:
        sid = str(record.get("student_id", ""))
        student = students_data.get(sid, {})
        state = (student.get("state") or "Tiada data").strip() or "Tiada data"
        if state not in by_negeri_map:
            by_negeri_map[state] = {
                "negeri": state,
                "total_expected": 0,
                "total_collected": 0,
                "student_count": 0,
            }
        by_negeri_map[state]["total_expected"] += record.get("total_amount", 0)
        by_negeri_map[state]["total_collected"] += record.get("paid_amount", 0)
        by_negeri_map[state]["student_count"] += 1
    
    for v in by_negeri_map.values():
        exp = v.get("total_expected", 0)
        v["collection_rate"] = round((v["total_collected"] / exp * 100) if exp > 0 else 0, 1)
        v["outstanding"] = v["total_expected"] - v["total_collected"]
    by_negeri = sorted(by_negeri_map.values(), key=lambda x: x["total_expected"], reverse=True)
    
    total_expected = sum(r.get("total_amount", 0) for r in student_yuran_records)
    total_collected = sum(r.get("paid_amount", 0) for r in student_yuran_records)
    total_outstanding = total_expected - total_collected
    students_with_outstanding = len([r for r in student_yuran_records if (r.get("total_amount", 0) - r.get("paid_amount", 0)) > 0])
    students_fully_paid = len([r for r in student_yuran_records if r.get("status") == "paid"])

    # ---------- AI Pelaporan Bendahari: Skor, MoM, Narrative, Cadangan, Segmentasi ----------
    fee_to_tingkatan = {str(r["_id"]): r.get("tingkatan", 0) for r in student_yuran_records}
    payments_this_year = await db.payments.find({"status": "completed"}).to_list(50000)
    monthly_by_tingkatan = {}
    first_payment_month_by_fee = {}
    for p in payments_this_year:
        fid = p.get("fee_id")
        fee_id = str(fid) if fid else None
        if not fee_id:
            continue
        ting = fee_to_tingkatan.get(fee_id)
        if ting is None:
            continue
        created = p.get("created_at")
        if isinstance(created, datetime):
            y, m = created.year, created.month
        elif isinstance(created, str) and len(created) >= 7:
            try:
                y, m = int(created[:4]), int(created[5:7])
            except ValueError:
                continue
        else:
            continue
        if y != tahun:
            continue
        key = (m, ting)
        monthly_by_tingkatan[key] = monthly_by_tingkatan.get(key, 0) + p.get("amount", 0)
        if fee_id not in first_payment_month_by_fee or first_payment_month_by_fee[fee_id] > m:
            first_payment_month_by_fee[fee_id] = m

    current_month = now.month
    prev_month = current_month - 1 if current_month > 1 else 12
    prev_year = tahun if current_month > 1 else tahun - 1
    mom_by_tingkatan = {}
    for t in outstanding_list:
        ting = t["tingkatan"]
        cur_amt = monthly_by_tingkatan.get((current_month, ting), 0)
        prev_amt = monthly_by_tingkatan.get((prev_month, ting), 0) if prev_year == tahun else 0
        pct = round((cur_amt - prev_amt) / prev_amt * 100, 1) if prev_amt else (100.0 if cur_amt else 0.0)
        mom_by_tingkatan[ting] = {"current_month_amount": cur_amt, "prev_month_amount": prev_amt, "change_percent": pct}

    # AI Scoring: 0-100, status, classification
    def ai_score_and_status(rate):
        score = min(100, max(0, round(rate * 1.1)))
        if rate >= 80:
            status, classification = "Excellent", "high_engagement"
        elif rate >= 60:
            status, classification = "Good", "medium_risk"
        else:
            status, classification = "Risk", "critical"
        return score, status, classification

    ai_scoring = []
    for t in outstanding_list:
        rate = t.get("collection_rate", 0)
        score, status, classification = ai_score_and_status(rate)
        mom = mom_by_tingkatan.get(t["tingkatan"], {})
        ai_scoring.append({
            "tingkatan": t["tingkatan"],
            "collection_rate": rate,
            "score": score,
            "status": status,
            "classification": classification,
            "mom_change_percent": mom.get("change_percent"),
        })

    # AI Narrative (contoh output)
    ai_narrative = []
    if fastest_class:
        ai_narrative.append(
            f"Tingkatan {fastest_class['tingkatan']} mencatat kadar kutipan tertinggi ({fastest_class.get('collection_rate', 0)}%)"
        )
    if slowest_class:
        ai_narrative.append(
            f"Tingkatan {slowest_class['tingkatan']} memerlukan perhatian dengan kadar kutipan {slowest_class.get('collection_rate', 0)}%"
        )
    for t in outstanding_list:
        ting = t["tingkatan"]
        mom = mom_by_tingkatan.get(ting, {})
        pct = mom.get("change_percent")
        if pct is not None and pct != 0:
            word = "penurunan" if pct < 0 else "peningkatan"
            ai_narrative.append(
                f"Tingkatan {ting} menunjukkan {word} {abs(pct)}% berbanding bulan lalu"
            )
    if not ai_narrative:
        ai_narrative.append(f"Kadar kutipan keseluruhan tahun {tahun}: {round((total_collected / total_expected * 100) if total_expected else 0, 1)}%.")

    # AI Cadangan automatik (action recommendation engine)
    ai_recommendations = []
    for t in outstanding_list:
        rate = t.get("collection_rate", 0)
        ting = t["tingkatan"]
        if rate < 70:
            ai_recommendations.append({
                "tingkatan": ting,
                "title": f"Tingkatan {ting} – Perlu intervensi",
                "actions": [
                    "Cadangkan kempen kelas vs kelas untuk meningkatkan motivasi",
                    "Hantar notifikasi khas kepada ibu bapa Tingkatan " + str(ting),
                    "Cadangkan reward badge untuk pelajar yang selesai bayar awal",
                ],
                "suggested_whatsapp": f"Tingkatan {ting} kini pada {rate}% sasaran. Jom kita capai 70% sebelum Jumaat! 💪",
            })
    if not ai_recommendations and slowest_class:
        ting = slowest_class["tingkatan"]
        rate = slowest_class.get("collection_rate", 0)
        ai_recommendations.append({
            "tingkatan": ting,
            "title": f"Tingkatan {ting} – Kadar terendah",
            "actions": [
                "Notifikasi peringatan kepada ibu bapa",
                "Pertimbangkan sesi penerangan bayaran yuran",
            ],
            "suggested_whatsapp": f"Tingkatan {ting} kini pada {rate}% sasaran. Sokong anak anda menyelesaikan yuran. 🙏",
        })

    # AI Segmentasi tingkatan (behaviour: early / last minute / medium)
    tingkatan_first_months = {}
    for fee_id, month in first_payment_month_by_fee.items():
        ting = fee_to_tingkatan.get(fee_id)
        if ting is None:
            continue
        if ting not in tingkatan_first_months:
            tingkatan_first_months[ting] = []
        tingkatan_first_months[ting].append(month)
    ai_segments = []
    for t in outstanding_list:
        ting = t["tingkatan"]
        months = tingkatan_first_months.get(ting, [])
        if not months:
            behaviour = "Tiada data bayaran"
            segment_label = "medium_risk"
        else:
            avg_month = sum(months) / len(months)
            if avg_month <= 3:
                behaviour = "Respond awal (bayar dalam bulan 1–3)"
                segment_label = "high_engagement"
            elif avg_month >= 10:
                behaviour = "Tunggu saat akhir (bayar bulan 10–12)"
                segment_label = "medium_risk"
            else:
                behaviour = "Bayar pertengahan tahun (bulan 4–9)"
                segment_label = "medium_risk"
        ai_segments.append({
            "tingkatan": ting,
            "behaviour": behaviour,
            "segment_label": segment_label,
            "avg_first_payment_month": round(sum(months) / len(months), 1) if months else None,
        })

    result = {
        "tahun": tahun,
        "generated_at": now.isoformat(),
        "summary": {
            "total_students": len(student_yuran_records),
            "total_expected": total_expected,
            "total_collected": total_collected,
            "total_outstanding": total_outstanding,
            "collection_rate": round((total_collected / total_expected * 100) if total_expected > 0 else 0, 1),
            "students_fully_paid": students_fully_paid,
            "students_with_outstanding": students_with_outstanding,
        },
        "outstanding_by_tingkatan": outstanding_list,
        "ai_cadangan": {
            "slowest_class": slowest_class,
            "fastest_class": fastest_class,
        },
        "by_jantina": by_jantina,
        "by_negeri": by_negeri,
        "ai_narrative": ai_narrative,
        "ai_scoring": ai_scoring,
        "ai_recommendations": ai_recommendations,
        "ai_segments": ai_segments,
    }
    await _set_cached_response(db, cache_key, "financial_analytics_ai", result)
    return result


@router.get("/tunggakan-summary")
async def get_tunggakan_summary(
    tahun: Optional[int] = None,
    user: dict = Depends(get_current_user)
):
    """
    Get summary of outstanding fees (tunggakan)
    Ringkasan tunggakan yuran
    """
    if user["role"] not in ["superadmin", "admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    db = get_db()
    await _ensure_financial_indexes(db)
    now = datetime.now(timezone.utc)
    
    if not tahun:
        tahun = now.year

    cache_key = _cache_key("tunggakan_summary", tahun=tahun)
    cached = await _get_cached_response(db, cache_key)
    if cached is not None:
        return cached
    
    # Relational-compatible implementation (no Mongo aggregate pipeline).
    records = await db.student_yuran.find({"tahun": tahun, "status": {"$ne": "paid"}}).to_list(5000)
    students_outstanding = []
    for record in records:
        total_amount = record.get("total_amount", 0) or 0
        paid_amount = record.get("paid_amount", 0) or 0
        outstanding = total_amount - paid_amount
        if outstanding <= 0:
            continue
        students_outstanding.append(
            {
                "student_name": record.get("student_name"),
                "tingkatan": record.get("tingkatan"),
                "total_amount": total_amount,
                "paid_amount": paid_amount,
                "outstanding": outstanding,
            }
        )
    students_outstanding.sort(key=lambda s: s.get("outstanding", 0), reverse=True)
    
    # Top 10 highest outstanding
    top_outstanding = students_outstanding[:10]
    
    # By tingkatan summary
    tingkatan_summary = {}
    for student in students_outstanding:
        ting = student.get("tingkatan", 0)
        if ting not in tingkatan_summary:
            tingkatan_summary[ting] = {
                "tingkatan": ting,
                "count": 0,
                "total_outstanding": 0
            }
        tingkatan_summary[ting]["count"] += 1
        tingkatan_summary[ting]["total_outstanding"] += student.get("outstanding", 0)
    
    result = {
        "tahun": tahun,
        "total_students_with_outstanding": len(students_outstanding),
        "total_outstanding_amount": sum(s.get("outstanding", 0) for s in students_outstanding),
        "top_10_outstanding": [
            {
                "student_name": s.get("student_name"),
                "tingkatan": s.get("tingkatan"),
                "total_amount": s.get("total_amount"),
                "paid_amount": s.get("paid_amount"),
                "outstanding": s.get("outstanding")
            }
            for s in top_outstanding
        ],
        "by_tingkatan": sorted(tingkatan_summary.values(), key=lambda x: x["tingkatan"])
    }
    await _set_cached_response(db, cache_key, "tunggakan_summary", result)
    return result


@router.get("/cache/invalidation-metrics")
async def get_cache_invalidation_metrics(
    user: dict = Depends(get_current_user)
):
    """Get cache invalidation metrics by scope."""
    if user["role"] not in ["superadmin", "admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    return get_financial_dashboard_invalidation_metrics()


@router.get("/cache/invalidation-metrics/prometheus")
async def get_cache_invalidation_metrics_prometheus(
    user: dict = Depends(get_current_user)
):
    """Get cache invalidation metrics in Prometheus text format."""
    if user["role"] not in ["superadmin", "admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    return PlainTextResponse(
        get_financial_dashboard_invalidation_metrics_prometheus(),
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )


# ==================== PAYMENT CATEGORIES (KATEGORI BAYARAN) ====================

@router.get("/kategori-bayaran")
async def get_kategori_bayaran(
    tahun: Optional[int] = None,
    tingkatan: Optional[int] = None,
    user: dict = Depends(get_current_user)
):
    """
    Get list of payment categories from set_yuran, optionally filtered by tingkatan
    Dapatkan senarai kategori bayaran dari set_yuran, boleh ditapis mengikut tingkatan
    """
    if user["role"] not in ["superadmin", "admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    db = get_db()
    now = datetime.now(timezone.utc)
    
    if not tahun:
        tahun = now.year
    
    # Build query
    query = {"tahun": tahun, "is_active": True}
    if tingkatan:
        query["tingkatan"] = tingkatan
    
    # Get set_yuran records
    set_yuran_list = await db.set_yuran.find(query).to_list(10)
    
    # Extract unique sub-categories (these are the payment categories)
    categories_set = set()
    categories_by_tingkatan = {}
    item_to_category_map = {}  # Maps item name to its sub-category
    
    for set_yuran in set_yuran_list:
        ting = set_yuran.get("tingkatan", 0)
        if ting not in categories_by_tingkatan:
            categories_by_tingkatan[ting] = []
        
        for category in set_yuran.get("categories", []):
            for sub_cat in category.get("sub_categories", []):
                sub_cat_name = sub_cat.get("name", "")
                if sub_cat_name:
                    categories_set.add(sub_cat_name)
                    if sub_cat_name not in categories_by_tingkatan[ting]:
                        categories_by_tingkatan[ting].append(sub_cat_name)
                    
                    # Map each item to its sub-category
                    for item in sub_cat.get("items", []):
                        item_name = item.get("name", "")
                        if item_name:
                            item_to_category_map[item_name] = sub_cat_name
    
    return {
        "tahun": tahun,
        "tingkatan_filter": tingkatan,
        "categories": sorted(list(categories_set)),
        "categories_by_tingkatan": {str(k): sorted(v) for k, v in categories_by_tingkatan.items()},
        "item_to_category_map": item_to_category_map
    }


# ==================== DETAILED YURAN REPORT ====================

@router.get("/yuran-detailed-report")
async def get_yuran_detailed_report(
    tahun: Optional[int] = None,
    tingkatan: Optional[int] = None,
    kelas: Optional[str] = None,
    jantina: Optional[str] = None,  # male, female
    kategori_bayaran: Optional[str] = None,  # Payment category filter (sub_category name)
    tarikh_mula: Optional[str] = None,  # YYYY-MM-DD
    tarikh_akhir: Optional[str] = None,  # YYYY-MM-DD
    user: dict = Depends(get_current_user)
):
    """
    Get detailed yuran report with filters by tingkatan, kelas, jantina, kategori bayaran, and date range
    Laporan terperinci yuran dengan penapis mengikut tingkatan, kelas, jantina, kategori bayaran, dan julat tarikh
    """
    if user["role"] not in ["superadmin", "admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    db = get_db()
    now = datetime.now(timezone.utc)
    
    if not tahun:
        tahun = now.year
    
    # Build base query for student_yuran
    base_query = {"tahun": tahun}
    if tingkatan:
        base_query["tingkatan"] = tingkatan
    
    # Get all student_yuran records
    student_yuran_records = await db.student_yuran.find(base_query).to_list(5000)
    
    # ========== BUILD ITEM TO CATEGORY MAP FROM SET_YURAN ==========
    set_yuran_query = {"tahun": tahun, "is_active": True}
    set_yuran_list = await db.set_yuran.find(set_yuran_query).to_list(10)
    
    item_to_category_map = {}
    all_categories = set()
    
    for set_yuran in set_yuran_list:
        for category in set_yuran.get("categories", []):
            for sub_cat in category.get("sub_categories", []):
                sub_cat_name = sub_cat.get("name", "")
                if sub_cat_name:
                    all_categories.add(sub_cat_name)
                    for item in sub_cat.get("items", []):
                        item_name = item.get("name", "")
                        if item_name:
                            item_to_category_map[item_name] = sub_cat_name
    
    # Get student details for additional filtering (kelas, jantina)
    student_ids = [r.get("student_id") for r in student_yuran_records if r.get("student_id")]
    students_data = {}
    
    if student_ids:
        students_list = await db.students.find({"_id": {"$in": student_ids}}).to_list(5000)
        students_data = {str(s["_id"]): s for s in students_list}
    
    # Enrich yuran records with student data and apply filters
    filtered_records = []
    for record in student_yuran_records:
        student_id = str(record.get("student_id", ""))
        student = students_data.get(student_id, {})
        
        # Apply kelas filter
        if kelas and student.get("class_name", "").lower() != kelas.lower():
            continue
        
        # Apply jantina filter
        if jantina and student.get("gender", "").lower() != jantina.lower():
            continue
        
        # Apply kategori_bayaran filter - filter items belonging to specific category
        if kategori_bayaran:
            record = dict(record)  # Make a copy
            filtered_items = []
            filtered_item_total = 0
            filtered_item_paid = 0
            
            for item in record.get("items", []):
                item_name = item.get("name", "")
                # Lookup category from map (from set_yuran)
                item_category = item_to_category_map.get(item_name, "Lain-lain")
                
                if item_category.lower() == kategori_bayaran.lower():
                    filtered_items.append(item)
                    filtered_item_total += item.get("amount", 0)
                    filtered_item_paid += item.get("paid_amount", 0)
            
            # Skip record if no items match the category
            if not filtered_items:
                continue
            
            # Update record with filtered items and recalculated totals
            record["items"] = filtered_items
            record["total_amount"] = filtered_item_total
            record["paid_amount"] = filtered_item_paid
        
        # Apply date filter on payments
        if tarikh_mula or tarikh_akhir:
            payments = record.get("payments", [])
            filtered_payments = []
            for payment in payments:
                paid_at = payment.get("paid_at", "")
                if paid_at:
                    payment_date = paid_at[:10]  # YYYY-MM-DD
                    if tarikh_mula and payment_date < tarikh_mula:
                        continue
                    if tarikh_akhir and payment_date > tarikh_akhir:
                        continue
                    filtered_payments.append(payment)
            
            # Only include if has payments in date range (or no date filter)
            if tarikh_mula or tarikh_akhir:
                if not filtered_payments:
                    continue
                # Recalculate paid amount based on filtered payments
                if not isinstance(record, dict):
                    record = dict(record)
                record["payments"] = filtered_payments
                record["paid_amount"] = sum(p.get("amount", 0) for p in filtered_payments)
        
        # Add student info to record
        if not isinstance(record, dict):
            record = dict(record)
        record["class_name"] = student.get("class_name", "-")
        record["gender"] = student.get("gender", "-")
        filtered_records.append(record)
    
    # ========== AGGREGATE DATA ==========
    
    # 1. Summary totals
    total_expected = sum(r.get("total_amount", 0) for r in filtered_records)
    total_collected = sum(r.get("paid_amount", 0) for r in filtered_records)
    total_outstanding = total_expected - total_collected
    
    # 2. Breakdown by Category (using item_to_category_map for proper mapping)
    category_breakdown = {}
    for record in filtered_records:
        for item in record.get("items", []):
            item_name = item.get("name", "")
            # Use the map to get proper category, fallback to item's own category field
            cat_name = item_to_category_map.get(item_name) or item.get("sub_category") or item.get("category") or "Lain-lain"
            if cat_name not in category_breakdown:
                category_breakdown[cat_name] = {
                    "name": cat_name,
                    "expected": 0,
                    "collected": 0,
                    "student_count": 0
                }
            category_breakdown[cat_name]["expected"] += item.get("amount", 0)
            category_breakdown[cat_name]["collected"] += item.get("paid_amount", 0)
    
    category_list = []
    for cat_name, data in category_breakdown.items():
        percentage = (data["collected"] / data["expected"] * 100) if data["expected"] > 0 else 0
        category_list.append({
            "name": cat_name,
            "expected": data["expected"],
            "collected": data["collected"],
            "outstanding": data["expected"] - data["collected"],
            "percentage": round(percentage, 1)
        })
    category_list.sort(key=lambda x: x["expected"], reverse=True)
    
    # 3. Breakdown by Tingkatan
    tingkatan_breakdown = {}
    for record in filtered_records:
        ting = record.get("tingkatan", 0)
        if ting not in tingkatan_breakdown:
            tingkatan_breakdown[ting] = {
                "tingkatan": ting,
                "student_count": 0,
                "expected": 0,
                "collected": 0,
                "male_count": 0,
                "female_count": 0
            }
        tingkatan_breakdown[ting]["student_count"] += 1
        tingkatan_breakdown[ting]["expected"] += record.get("total_amount", 0)
        tingkatan_breakdown[ting]["collected"] += record.get("paid_amount", 0)
        if record.get("gender", "").lower() == "male":
            tingkatan_breakdown[ting]["male_count"] += 1
        elif record.get("gender", "").lower() == "female":
            tingkatan_breakdown[ting]["female_count"] += 1
    
    tingkatan_list = []
    for ting, data in tingkatan_breakdown.items():
        percentage = (data["collected"] / data["expected"] * 100) if data["expected"] > 0 else 0
        tingkatan_list.append({
            **data,
            "outstanding": data["expected"] - data["collected"],
            "percentage": round(percentage, 1)
        })
    tingkatan_list.sort(key=lambda x: x["tingkatan"])
    
    # 4. Breakdown by Kelas
    kelas_breakdown = {}
    for record in filtered_records:
        class_name = record.get("class_name", "-")
        if class_name not in kelas_breakdown:
            kelas_breakdown[class_name] = {
                "class_name": class_name,
                "student_count": 0,
                "expected": 0,
                "collected": 0,
                "male_count": 0,
                "female_count": 0
            }
        kelas_breakdown[class_name]["student_count"] += 1
        kelas_breakdown[class_name]["expected"] += record.get("total_amount", 0)
        kelas_breakdown[class_name]["collected"] += record.get("paid_amount", 0)
        if record.get("gender", "").lower() == "male":
            kelas_breakdown[class_name]["male_count"] += 1
        elif record.get("gender", "").lower() == "female":
            kelas_breakdown[class_name]["female_count"] += 1
    
    kelas_list = []
    for class_name, data in kelas_breakdown.items():
        percentage = (data["collected"] / data["expected"] * 100) if data["expected"] > 0 else 0
        kelas_list.append({
            **data,
            "outstanding": data["expected"] - data["collected"],
            "percentage": round(percentage, 1)
        })
    kelas_list.sort(key=lambda x: x["class_name"])
    
    # 5. Breakdown by Jantina (Gender)
    gender_breakdown = {
        "male": {"label": "Lelaki", "student_count": 0, "expected": 0, "collected": 0},
        "female": {"label": "Perempuan", "student_count": 0, "expected": 0, "collected": 0}
    }
    for record in filtered_records:
        gender = record.get("gender", "").lower()
        if gender in gender_breakdown:
            gender_breakdown[gender]["student_count"] += 1
            gender_breakdown[gender]["expected"] += record.get("total_amount", 0)
            gender_breakdown[gender]["collected"] += record.get("paid_amount", 0)
    
    for gender, data in gender_breakdown.items():
        percentage = (data["collected"] / data["expected"] * 100) if data["expected"] > 0 else 0
        data["outstanding"] = data["expected"] - data["collected"]
        data["percentage"] = round(percentage, 1)
    
    # 6. Trend data for chart (by month if date range)
    monthly_trend = {}
    for record in filtered_records:
        for payment in record.get("payments", []):
            paid_at = payment.get("paid_at", "")
            if paid_at:
                month_key = paid_at[:7]  # YYYY-MM
                if month_key not in monthly_trend:
                    monthly_trend[month_key] = {"month": month_key, "collected": 0, "count": 0}
                monthly_trend[month_key]["collected"] += payment.get("amount", 0)
                monthly_trend[month_key]["count"] += 1
    
    trend_list = sorted(monthly_trend.values(), key=lambda x: x["month"])
    
    # Get available filter options
    all_classes = list(set(students_data[sid].get("class_name", "") for sid in students_data if students_data[sid].get("class_name")))
    all_tingkatan = list(set(r.get("tingkatan") for r in student_yuran_records if r.get("tingkatan")))
    
    return {
        "tahun": tahun,
        "generated_at": now.isoformat(),
        "filters_applied": {
            "tingkatan": tingkatan,
            "kelas": kelas,
            "jantina": jantina,
            "kategori_bayaran": kategori_bayaran,
            "tarikh_mula": tarikh_mula,
            "tarikh_akhir": tarikh_akhir
        },
        "filter_options": {
            "tingkatan": sorted(all_tingkatan),
            "kelas": sorted(all_classes),
            "kategori_bayaran": sorted(list(all_categories))
        },
        "summary": {
            "total_students": len(filtered_records),
            "total_expected": total_expected,
            "total_collected": total_collected,
            "total_outstanding": total_outstanding,
            "collection_rate": round((total_collected / total_expected * 100) if total_expected > 0 else 0, 1)
        },
        "category_breakdown": category_list,
        "tingkatan_breakdown": tingkatan_list,
        "kelas_breakdown": kelas_list,
        "gender_breakdown": gender_breakdown,
        "monthly_trend": trend_list
    }


# ==================== EXPORT FUNCTIONS ====================

from fastapi.responses import StreamingResponse, PlainTextResponse
from io import BytesIO
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
import xlsxwriter


def format_currency(amount):
    """Format amount as Malaysian Ringgit"""
    return f"RM {amount:,.2f}"


def get_period_label(period: str) -> str:
    """Get readable period label in Malay"""
    labels = {
        "month": "Bulan Ini",
        "quarter": "Suku Tahun Ini",
        "year": "Tahun Ini",
        "all": "Keseluruhan"
    }
    return labels.get(period, period)


@router.get("/export/pdf")
async def export_financial_report_pdf(
    period: Optional[str] = "month",
    user: dict = Depends(get_current_user)
):
    """Export financial report as PDF"""
    if user["role"] not in ["superadmin", "admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    db = get_db()
    await _ensure_financial_indexes(db)
    
    # Get summary data
    now = datetime.now(timezone.utc)
    if period == "month":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "quarter":
        quarter_month = ((now.month - 1) // 3) * 3 + 1
        start_date = now.replace(month=quarter_month, day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "year":
        start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        start_date = None
    
    donation_rows = await _get_filtered_completed_donations(db, start_date)
    donation_stats = {
        "total_donations": sum(_to_number(row.get("amount")) for row in donation_rows),
        "donation_count": len(donation_rows),
    }

    accounting_rows = await _get_filtered_accounting_transactions(db, start_date)
    total_income = sum(
        _to_number(row.get("amount"))
        for row in accounting_rows
        if row.get("type") == "income"
    )
    total_expense = sum(
        _to_number(row.get("amount"))
        for row in accounting_rows
        if row.get("type") == "expense"
    )
    
    # Get campaigns
    campaigns = await db.tabung_campaigns.find({}).to_list(100)
    
    # Get recent transactions
    recent_donations = sorted(donation_rows, key=_created_at_sort_key, reverse=True)[:20]
    
    # Create PDF
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=1*cm, bottomMargin=1*cm)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=18, alignment=TA_CENTER, spaceAfter=20)
    subtitle_style = ParagraphStyle('Subtitle', parent=styles['Normal'], fontSize=10, alignment=TA_CENTER, textColor=colors.gray)
    heading_style = ParagraphStyle('Heading', parent=styles['Heading2'], fontSize=14, spaceBefore=15, spaceAfter=10, textColor=colors.HexColor('#10b981'))
    normal_style = styles['Normal']
    
    elements = []
    
    # Header
    elements.append(Paragraph("LAPORAN KEWANGAN", title_style))
    elements.append(Paragraph(f"Portal MRSMKU - {get_period_label(period)}", subtitle_style))
    elements.append(Paragraph(f"Dijana pada: {now.strftime('%d %B %Y, %H:%M')}", subtitle_style))
    elements.append(Spacer(1, 20))
    
    # Summary Section
    elements.append(Paragraph("Ringkasan Kewangan", heading_style))
    
    summary_data = [
        ["Perkara", "Jumlah (RM)"],
        ["Jumlah Kutipan Tabung", format_currency(donation_stats.get("total_donations", 0))],
        ["Jumlah Pendapatan", format_currency(total_income)],
        ["Jumlah Perbelanjaan", format_currency(total_expense)],
        ["Baki Bersih", format_currency(total_income - total_expense)],
    ]
    
    summary_table = Table(summary_data, colWidths=[300, 150])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#10b981')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e2e8f0')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 20))
    
    # Campaign Performance
    elements.append(Paragraph("Prestasi Kempen", heading_style))
    
    campaign_data = [["Nama Kempen", "Sasaran", "Terkumpul", "Pencapaian"]]
    for c in campaigns[:10]:
        if c["campaign_type"] == "slot":
            target = c.get("total_slots", 0) * c.get("price_per_slot", 0)
            collected = c.get("slots_sold", 0) * c.get("price_per_slot", 0)
        else:
            target = c.get("target_amount", 0)
            collected = c.get("collected_amount", 0)
        progress = (collected / target * 100) if target > 0 else 0
        campaign_data.append([
            c["title"][:40],
            format_currency(target),
            format_currency(collected),
            f"{progress:.1f}%"
        ])
    
    if len(campaign_data) > 1:
        campaign_table = Table(campaign_data, colWidths=[200, 100, 100, 70])
        campaign_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3b82f6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e2e8f0')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
        ]))
        elements.append(campaign_table)
    elements.append(Spacer(1, 20))
    
    # Recent Donations
    elements.append(Paragraph("Sumbangan Terkini", heading_style))
    
    donation_table_data = [["Tarikh", "Penderma", "Kempen", "Jumlah"]]
    for d in recent_donations[:15]:
        created = d.get("created_at")
        date_str = created.strftime("%d/%m/%Y") if isinstance(created, datetime) else "-"
        donation_table_data.append([
            date_str,
            d.get("donor_name", "Penderma")[:20],
            d.get("campaign_title", "-")[:25],
            format_currency(d.get("amount", 0))
        ])
    
    if len(donation_table_data) > 1:
        donation_table = Table(donation_table_data, colWidths=[80, 120, 170, 100])
        donation_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#8b5cf6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (3, 0), (3, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e2e8f0')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
        ]))
        elements.append(donation_table)
    
    # Footer
    elements.append(Spacer(1, 30))
    footer_style = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8, alignment=TA_CENTER, textColor=colors.gray)
    elements.append(Paragraph("Laporan ini dijana secara automatik oleh sistem Portal MRSMKU", footer_style))
    elements.append(Paragraph(f"© {now.year} Portal MRSMKU. Hak Cipta Terpelihara.", footer_style))
    
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"Laporan_Kewangan_{period}_{now.strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/export/excel")
async def export_financial_report_excel(
    period: Optional[str] = "month",
    user: dict = Depends(get_current_user)
):
    """Export financial report as Excel"""
    if user["role"] not in ["superadmin", "admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    db = get_db()
    
    # Get date range
    now = datetime.now(timezone.utc)
    if period == "month":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "quarter":
        quarter_month = ((now.month - 1) // 3) * 3 + 1
        start_date = now.replace(month=quarter_month, day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "year":
        start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        start_date = None
    
    # Get all data
    donation_query = {"payment_status": "completed"}
    if start_date:
        donation_query["created_at"] = {"$gte": start_date}
    
    donations = await db.tabung_donations.find(donation_query).sort("created_at", -1).to_list(500)
    campaigns = await db.tabung_campaigns.find({}).to_list(100)
    
    income_query = {"type": "income", "status": {"$in": ["verified", "pending"]}}
    expense_query = {"type": "expense", "status": {"$in": ["verified", "pending"]}}
    if start_date:
        income_query["created_at"] = {"$gte": start_date}
        expense_query["created_at"] = {"$gte": start_date}
    
    income_transactions = await db.accounting_transactions.find(income_query).sort("created_at", -1).to_list(500)
    expense_transactions = await db.accounting_transactions.find(expense_query).sort("created_at", -1).to_list(500)
    
    # Create Excel
    buffer = BytesIO()
    workbook = xlsxwriter.Workbook(buffer, {'in_memory': True})
    
    # Formats
    header_format = workbook.add_format({
        'bold': True, 'bg_color': '#10b981', 'font_color': 'white',
        'border': 1, 'align': 'center', 'valign': 'vcenter'
    })
    title_format = workbook.add_format({
        'bold': True, 'font_size': 16, 'align': 'center'
    })
    subtitle_format = workbook.add_format({
        'font_size': 10, 'font_color': 'gray', 'align': 'center'
    })
    currency_format = workbook.add_format({'num_format': 'RM #,##0.00', 'align': 'right'})
    date_format = workbook.add_format({'num_format': 'dd/mm/yyyy', 'align': 'center'})
    percent_format = workbook.add_format({'num_format': '0.0%', 'align': 'center'})
    cell_format = workbook.add_format({'border': 1, 'valign': 'vcenter'})
    
    # ===== Sheet 1: Summary =====
    ws_summary = workbook.add_worksheet("Ringkasan")
    ws_summary.set_column('A:A', 35)
    ws_summary.set_column('B:B', 20)
    
    ws_summary.merge_range('A1:B1', 'LAPORAN KEWANGAN', title_format)
    ws_summary.merge_range('A2:B2', f'Portal MRSMKU - {get_period_label(period)}', subtitle_format)
    ws_summary.merge_range('A3:B3', f'Dijana: {now.strftime("%d %B %Y, %H:%M")}', subtitle_format)
    
    row = 5
    ws_summary.write(row, 0, "Perkara", header_format)
    ws_summary.write(row, 1, "Jumlah (RM)", header_format)
    
    total_donations = sum(d.get("amount", 0) for d in donations)
    total_income = sum(t.get("amount", 0) for t in income_transactions)
    total_expense = sum(t.get("amount", 0) for t in expense_transactions)
    
    summary_items = [
        ("Jumlah Kutipan Tabung", total_donations),
        ("Bilangan Sumbangan", len(donations)),
        ("Jumlah Pendapatan (Perakaunan)", total_income),
        ("Jumlah Perbelanjaan", total_expense),
        ("Baki Bersih", total_income - total_expense),
    ]
    
    for item in summary_items:
        row += 1
        ws_summary.write(row, 0, item[0], cell_format)
        if isinstance(item[1], (int, float)):
            ws_summary.write(row, 1, item[1], currency_format)
        else:
            ws_summary.write(row, 1, item[1], cell_format)
    
    # ===== Sheet 2: Campaigns =====
    ws_campaigns = workbook.add_worksheet("Kempen")
    ws_campaigns.set_column('A:A', 40)
    ws_campaigns.set_column('B:B', 15)
    ws_campaigns.set_column('C:D', 18)
    ws_campaigns.set_column('E:E', 12)
    
    headers = ["Nama Kempen", "Status", "Sasaran (RM)", "Terkumpul (RM)", "Pencapaian"]
    for col, header in enumerate(headers):
        ws_campaigns.write(0, col, header, header_format)
    
    row = 1
    for c in campaigns:
        if c["campaign_type"] == "slot":
            target = c.get("total_slots", 0) * c.get("price_per_slot", 0)
            collected = c.get("slots_sold", 0) * c.get("price_per_slot", 0)
        else:
            target = c.get("target_amount", 0)
            collected = c.get("collected_amount", 0)
        progress = (collected / target) if target > 0 else 0
        
        ws_campaigns.write(row, 0, c["title"], cell_format)
        ws_campaigns.write(row, 1, c.get("status", "active"), cell_format)
        ws_campaigns.write(row, 2, target, currency_format)
        ws_campaigns.write(row, 3, collected, currency_format)
        ws_campaigns.write(row, 4, progress, percent_format)
        row += 1
    
    # ===== Sheet 3: Donations =====
    ws_donations = workbook.add_worksheet("Sumbangan")
    ws_donations.set_column('A:A', 15)
    ws_donations.set_column('B:B', 25)
    ws_donations.set_column('C:C', 35)
    ws_donations.set_column('D:D', 18)
    ws_donations.set_column('E:E', 20)
    
    headers = ["Tarikh", "Penderma", "Kempen", "Jumlah (RM)", "No. Resit"]
    for col, header in enumerate(headers):
        ws_donations.write(0, col, header, header_format)
    
    row = 1
    for d in donations:
        created = d.get("created_at")
        if isinstance(created, datetime):
            ws_donations.write(row, 0, created, date_format)
        else:
            ws_donations.write(row, 0, "-", cell_format)
        ws_donations.write(row, 1, d.get("donor_name", "Penderma"), cell_format)
        ws_donations.write(row, 2, d.get("campaign_title", "-"), cell_format)
        ws_donations.write(row, 3, d.get("amount", 0), currency_format)
        ws_donations.write(row, 4, d.get("receipt_number", "-"), cell_format)
        row += 1
    
    # ===== Sheet 4: Income =====
    ws_income = workbook.add_worksheet("Pendapatan")
    ws_income.set_column('A:A', 15)
    ws_income.set_column('B:B', 20)
    ws_income.set_column('C:C', 40)
    ws_income.set_column('D:D', 18)
    
    headers = ["Tarikh", "No. Transaksi", "Penerangan", "Jumlah (RM)"]
    for col, header in enumerate(headers):
        ws_income.write(0, col, header, header_format)
    
    row = 1
    for t in income_transactions:
        created = t.get("created_at")
        if isinstance(created, datetime):
            ws_income.write(row, 0, created, date_format)
        else:
            ws_income.write(row, 0, "-", cell_format)
        ws_income.write(row, 1, t.get("transaction_number", "-"), cell_format)
        ws_income.write(row, 2, t.get("description", "-"), cell_format)
        ws_income.write(row, 3, t.get("amount", 0), currency_format)
        row += 1
    
    # ===== Sheet 5: Expenses =====
    ws_expense = workbook.add_worksheet("Perbelanjaan")
    ws_expense.set_column('A:A', 15)
    ws_expense.set_column('B:B', 20)
    ws_expense.set_column('C:C', 40)
    ws_expense.set_column('D:D', 18)
    
    headers = ["Tarikh", "No. Transaksi", "Penerangan", "Jumlah (RM)"]
    for col, header in enumerate(headers):
        ws_expense.write(0, col, header, header_format)
    
    row = 1
    for t in expense_transactions:
        created = t.get("created_at")
        if isinstance(created, datetime):
            ws_expense.write(row, 0, created, date_format)
        else:
            ws_expense.write(row, 0, "-", cell_format)
        ws_expense.write(row, 1, t.get("transaction_number", "-"), cell_format)
        ws_expense.write(row, 2, t.get("description", "-"), cell_format)
        ws_expense.write(row, 3, t.get("amount", 0), currency_format)
        row += 1
    
    workbook.close()
    buffer.seek(0)
    
    filename = f"Laporan_Kewangan_{period}_{now.strftime('%Y%m%d')}.xlsx"
    
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
