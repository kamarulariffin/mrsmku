"""
Accounting Module - API Routes
Basic accounting dashboard showing account summaries for Muafakat, Merchandise, Koperasi, and PUM
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Any, Optional
from datetime import datetime, timezone, timedelta
from bson import ObjectId

router = APIRouter(prefix="/api/accounting", tags=["Accounting"])
security = HTTPBearer(auto_error=False)

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


# ==================== ACCOUNT SUMMARY ====================

def _merge_by_status(a: dict, b: dict) -> dict:
    """Merge two by_status dicts (amount and count per status)."""
    out = {}
    for k, v in (a or {}).items():
        out[k] = {"amount": v.get("amount", 0), "count": v.get("count", 0)}
    for k, v in (b or {}).items():
        if k not in out:
            out[k] = {"amount": 0, "count": 0}
        out[k]["amount"] = round(out[k]["amount"] + v.get("amount", 0), 2)
        out[k]["count"] = out[k]["count"] + v.get("count", 0)
    return out


def _as_float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _as_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _as_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                return dt.replace(tzinfo=timezone.utc)
            return dt
        except Exception:
            pass
        try:
            return datetime.strptime(text[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except Exception:
            return None
    return None


@router.get("/summary")
async def get_accounting_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """
    Get comprehensive accounting summary for all modules.
    Access: superadmin, admin, bendahari, sub_bendahari
    """
    db = get_db()
    
    allowed_roles = ["superadmin", "admin", "bendahari", "sub_bendahari"]
    if user["role"] not in allowed_roles:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Build date query if provided
    date_query = {}
    if start_date:
        try:
            date_query["$gte"] = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        except Exception:
            pass
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            if "$gte" in date_query:
                date_query["$lte"] = end_dt
            else:
                date_query = {"$lte": end_dt}
        except Exception:
            pass

    # Semak tetapan modul: jika koperasi atau merchandise tidak diaktifkan, jangan laporkan pendapatan daripadanya
    config = await db.settings.find_one({"type": "module_settings"})
    modules_config = config.get("modules", {}) if config else {}
    koperasi_enabled = modules_config.get("koperasi", {}).get("enabled", True)
    marketplace_enabled = modules_config.get("marketplace", {}).get("enabled", True)
    
    # ============ MUAFAKAT ACCOUNT ============
    # From commission_records where commission_type = muafakat
    muafakat_query = {"commission_type": "muafakat"}
    if date_query:
        muafakat_query["created_at"] = date_query
    
    muafakat_summary = {
        "confirmed": 0,
        "pending": 0,
        "paid_out": 0,
        "cancelled": 0
    }
    muafakat_counts = {
        "confirmed": 0,
        "pending": 0,
        "paid_out": 0,
        "cancelled": 0
    }
    async for row in db.commission_records.find(muafakat_query):
        status = row.get("status")
        if status not in muafakat_summary:
            continue
        muafakat_summary[status] += _as_float(row.get("commission_amount"))
        muafakat_counts[status] += 1
    for status in muafakat_summary:
        muafakat_summary[status] = round(muafakat_summary[status], 2)
    
    muafakat_total = muafakat_summary["confirmed"] + muafakat_summary["paid_out"]
    
    # ============ MERCHANDISE ACCOUNT ============
    merch_by_status = {}
    merch_total_sales = 0
    merch_total_orders = 0
    merch_stock_value = 0
    merch_stock_items = 0
    if marketplace_enabled:
        merch_query = {}
        if date_query:
            merch_query["created_at"] = date_query
        async for row in db.merchandise_orders.find({**merch_query, "status": {"$ne": "cancelled"}}):
            status = row.get("status")
            amount = _as_float(row.get("total_amount"))
            if status not in merch_by_status:
                merch_by_status[status] = {"amount": 0.0, "count": 0}
            merch_by_status[status]["amount"] += amount
            merch_by_status[status]["count"] += 1
            if status in ["paid", "processing", "ready", "delivered"]:
                merch_total_sales += amount
            merch_total_orders += 1
        for status in list(merch_by_status.keys()):
            merch_by_status[status]["amount"] = round(merch_by_status[status]["amount"], 2)

        async for row in db.merchandise_products.find({"is_active": True}):
            price = _as_float(row.get("price"))
            stock = _as_int(row.get("stock"))
            merch_stock_value += (price * stock)
            merch_stock_items += stock
    
    # ============ KOPERASI ACCOUNT (termasuk PUM) ============
    koop_by_status = {}
    koop_total_sales = 0
    koop_total_orders = 0
    koop_commission_earned = 0
    pum_by_status = {}
    pum_total_sales = 0
    pum_total_orders = 0
    pum_commission_earned = 0
    pum_stock_value = 0
    pum_stock_items = 0
    if koperasi_enabled:
        koop_query = {}
        if date_query:
            koop_query["created_at"] = date_query
        async for row in db.koop_orders.find({**koop_query, "status": {"$ne": "cancelled"}}):
            status = row.get("status")
            amount = _as_float(row.get("total_amount"))
            if status not in koop_by_status:
                koop_by_status[status] = {"amount": 0.0, "count": 0}
            koop_by_status[status]["amount"] += amount
            koop_by_status[status]["count"] += 1
            if status in ["paid", "processing", "ready", "collected"]:
                koop_total_sales += amount
            koop_total_orders += 1
        for status in list(koop_by_status.keys()):
            koop_by_status[status]["amount"] = round(koop_by_status[status]["amount"], 2)

        koop_commission_query = {"commission_type": "koperasi"}
        if date_query:
            koop_commission_query["created_at"] = date_query
        async for row in db.commission_records.find({**koop_commission_query, "status": {"$in": ["confirmed", "paid_out"]}}):
            koop_commission_earned += _as_float(row.get("commission_amount"))

        pum_query = {}
        if date_query:
            pum_query["created_at"] = date_query
        async for row in db.pum_orders.find({**pum_query, "status": {"$ne": "cancelled"}}):
            status = row.get("status")
            amount = _as_float(row.get("total_amount"))
            if status not in pum_by_status:
                pum_by_status[status] = {"amount": 0.0, "count": 0}
            pum_by_status[status]["amount"] += amount
            pum_by_status[status]["count"] += 1
            if status in ["paid", "processing", "shipped", "delivered"]:
                pum_total_sales += amount
            pum_total_orders += 1
        for status in list(pum_by_status.keys()):
            pum_by_status[status]["amount"] = round(pum_by_status[status]["amount"], 2)

        pum_commission_query = {"commission_type": "pum"}
        if date_query:
            pum_commission_query["created_at"] = date_query
        async for row in db.commission_records.find({**pum_commission_query, "status": {"$in": ["confirmed", "paid_out"]}}):
            pum_commission_earned += _as_float(row.get("commission_amount"))

        async for row in db.pum_products.find({"is_active": True}):
            price = _as_float(row.get("price"))
            stock = _as_int(row.get("stock"))
            pum_stock_value += (price * stock)
            pum_stock_items += stock
    
    # ============ GRAND TOTALS ============
    total_revenue = muafakat_total + koop_commission_earned + pum_commission_earned
    total_sales = merch_total_sales + koop_total_sales + pum_total_sales
    total_inventory_value = merch_stock_value + pum_stock_value
    
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "period": {
            "start_date": start_date,
            "end_date": end_date,
            "description": "Keseluruhan" if not start_date and not end_date else f"{start_date or 'Awal'} hingga {end_date or 'Kini'}"
        },
        "grand_totals": {
            "total_revenue": round(total_revenue, 2),
            "total_sales": round(total_sales, 2),
            "total_inventory_value": round(total_inventory_value, 2),
            "total_orders": merch_total_orders + koop_total_orders + pum_total_orders
        },
        "accounts": {
            "muafakat": {
                "name": "Akaun Muafakat",
                "description": "Pendapatan utama daripada komisyen jualan",
                "total_revenue": round(muafakat_total, 2),
                "confirmed": round(muafakat_summary["confirmed"], 2),
                "paid_out": round(muafakat_summary["paid_out"], 2),
                "pending": round(muafakat_summary["pending"], 2),
                "cancelled": round(muafakat_summary["cancelled"], 2),
                "transaction_counts": muafakat_counts
            },
            "merchandise": {
                "name": "Akaun Merchandise",
                "description": "Jualan barangan Muafakat",
                "total_sales": round(merch_total_sales, 2),
                "total_orders": merch_total_orders,
                "by_status": merch_by_status,
                "inventory": {
                    "stock_value": round(merch_stock_value, 2),
                    "total_items": merch_stock_items
                }
            },
            "koperasi": {
                "name": "Akaun Koperasi (termasuk PUM)",
                "description": "Jualan kit dan barangan koperasi maktab, termasuk Persatuan Usahawan Muda (PUM)",
                "total_sales": round(koop_total_sales + pum_total_sales, 2),
                "commission_earned": round(koop_commission_earned + pum_commission_earned, 2),
                "total_orders": koop_total_orders + pum_total_orders,
                "by_status": _merge_by_status(koop_by_status, pum_by_status),
                "inventory": {
                    "stock_value": round(pum_stock_value, 2),
                    "total_items": pum_stock_items
                },
                "sub_accounts": {
                    "koperasi": {
                        "name": "Koperasi",
                        "total_sales": round(koop_total_sales, 2),
                        "commission_earned": round(koop_commission_earned, 2),
                        "total_orders": koop_total_orders,
                        "by_status": koop_by_status
                    },
                    "pum": {
                        "name": "PUM",
                        "total_sales": round(pum_total_sales, 2),
                        "commission_earned": round(pum_commission_earned, 2),
                        "total_orders": pum_total_orders,
                        "by_status": pum_by_status,
                        "inventory": {"stock_value": round(pum_stock_value, 2), "total_items": pum_stock_items}
                    }
                }
            }
        }
    }


@router.get("/monthly-trend")
async def get_monthly_trend(
    months: int = 6,
    user: dict = Depends(get_current_user)
):
    """
    Get monthly revenue trend for the past N months.
    Access: superadmin, admin, bendahari, sub_bendahari
    """
    db = get_db()
    
    allowed_roles = ["superadmin", "admin", "bendahari", "sub_bendahari"]
    if user["role"] not in allowed_roles:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Calculate start date
    start_date = datetime.now(timezone.utc) - timedelta(days=months * 30)
    
    config = await db.settings.find_one({"type": "module_settings"})
    modules_config = config.get("modules", {}) if config else {}
    koperasi_enabled = modules_config.get("koperasi", {}).get("enabled", True)
    
    # Process into monthly data
    monthly_data = {}
    bulan_names = {
        1: "Jan", 2: "Feb", 3: "Mac", 4: "Apr", 5: "Mei", 6: "Jun",
        7: "Jul", 8: "Ogos", 9: "Sep", 10: "Okt", 11: "Nov", 12: "Dis"
    }
    
    async for row in db.commission_records.find({
        "created_at": {"$gte": start_date},
        "status": {"$in": ["confirmed", "paid_out"]},
    }):
        comm_type = row.get("commission_type")
        if not comm_type:
            continue
        if not koperasi_enabled and comm_type in ("koperasi", "pum"):
            continue
        created_at = _as_datetime(row.get("created_at"))
        if created_at is None:
            continue
        year = created_at.year
        month = created_at.month
        key = f"{year}-{month:02d}"
        if key not in monthly_data:
            monthly_data[key] = {
                "period": key,
                "month_name": f"{bulan_names.get(month, month)} {year}",
                "muafakat": 0,
                "koperasi": 0,
                "pum": 0,
                "total": 0
            }
        amount = _as_float(row.get("commission_amount"))
        monthly_data[key][comm_type] = round(monthly_data[key].get(comm_type, 0) + amount, 2)
        monthly_data[key]["total"] += amount
    
    # Sort by period
    trend_data = sorted(monthly_data.values(), key=lambda x: x["period"])
    
    # Round totals
    for item in trend_data:
        item["total"] = round(item["total"], 2)
    
    return {
        "months_requested": months,
        "trend": trend_data
    }


@router.get("/transactions")
async def get_recent_transactions(
    limit: int = 50,
    module: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """
    Get recent transactions across all modules.
    Access: superadmin, admin, bendahari, sub_bendahari
    """
    db = get_db()
    
    allowed_roles = ["superadmin", "admin", "bendahari", "sub_bendahari"]
    if user["role"] not in allowed_roles:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    transactions = []
    
    # Get from commission_records for revenue transactions
    commission_query = {}
    if module:
        commission_query["module"] = module
    
    commission_records = await db.commission_records.find(commission_query).sort("created_at", -1).limit(limit).to_list(limit)
    
    for r in commission_records:
        created_at = r.get("created_at")
        if isinstance(created_at, datetime):
            created_at = created_at.isoformat()
        
        transactions.append({
            "id": str(r["_id"]),
            "type": "commission",
            "module": r.get("module", "unknown"),
            "reference": r.get("order_number", "-"),
            "description": f"{r.get('recipient_name', '-')} - {r.get('commission_type', '-').title()}",
            "amount": r.get("commission_amount", 0),
            "status": r.get("status", "unknown"),
            "created_at": created_at
        })
    
    # Sort all transactions by date
    transactions.sort(key=lambda x: x["created_at"] or "", reverse=True)
    
    return {
        "transactions": transactions[:limit],
        "total": len(transactions)
    }


@router.get("/commission-breakdown")
async def get_commission_breakdown(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """
    Get detailed commission breakdown by type and module.
    Access: superadmin, admin, bendahari, sub_bendahari
    """
    db = get_db()
    
    allowed_roles = ["superadmin", "admin", "bendahari", "sub_bendahari"]
    if user["role"] not in allowed_roles:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    query = {"status": {"$in": ["confirmed", "paid_out"]}}
    
    if start_date:
        try:
            query["created_at"] = {"$gte": datetime.fromisoformat(start_date.replace('Z', '+00:00'))}
        except Exception:
            pass
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            if "created_at" in query:
                query["created_at"]["$lte"] = end_dt
            else:
                query["created_at"] = {"$lte": end_dt}
        except Exception:
            pass
    
    grouped = {}
    async for row in db.commission_records.find(query):
        ctype = row.get("commission_type")
        module = row.get("module")
        key = (ctype, module)
        if key not in grouped:
            grouped[key] = {"total_amount": 0.0, "total_orders": 0}
        grouped[key]["total_amount"] += _as_float(row.get("commission_amount"))
        grouped[key]["total_orders"] += 1

    breakdown = []
    type_display = {
        "muafakat": "Pendapatan Muafakat",
        "koperasi": "Komisyen Koperasi",
        "pum": "Komisyen PUM"
    }
    module_display = {
        "merchandise": "Merchandise",
        "koperasi": "Koperasi",
        "pum": "PUM"
    }
    
    sorted_groups = sorted(grouped.items(), key=lambda item: item[1]["total_amount"], reverse=True)
    for (ctype, module), values in sorted_groups[:50]:
        total_amount = values["total_amount"]
        total_orders = values["total_orders"]
        avg_amount = (total_amount / total_orders) if total_orders else 0
        breakdown.append({
            "commission_type": ctype,
            "commission_type_display": type_display.get(ctype, ctype),
            "module": module,
            "module_display": module_display.get(module, module),
            "total_amount": round(total_amount, 2),
            "total_orders": total_orders,
            "avg_amount": round(avg_amount, 2)
        })
    
    # Calculate totals by type
    totals_by_type = {}
    for item in breakdown:
        t = item["commission_type"]
        if t not in totals_by_type:
            totals_by_type[t] = {"display": item["commission_type_display"], "amount": 0, "count": 0}
        totals_by_type[t]["amount"] += item["total_amount"]
        totals_by_type[t]["count"] += item["total_orders"]
    
    return {
        "breakdown": breakdown,
        "totals_by_type": [
            {"type": k, "display": v["display"], "amount": round(v["amount"], 2), "count": v["count"]}
            for k, v in totals_by_type.items()
        ]
    }
