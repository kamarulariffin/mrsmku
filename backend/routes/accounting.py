"""
Accounting Module - API Routes
Basic accounting dashboard showing account summaries for Muafakat, Merchandise, Koperasi, and PUM
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
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
    
    muafakat_pipeline = [
        {"$match": muafakat_query},
        {"$group": {
            "_id": "$status",
            "total": {"$sum": "$commission_amount"},
            "count": {"$sum": 1}
        }}
    ]
    muafakat_results = await db.commission_records.aggregate(muafakat_pipeline).to_list(10)
    
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
    for r in muafakat_results:
        if r["_id"] in muafakat_summary:
            muafakat_summary[r["_id"]] = round(r["total"], 2)
            muafakat_counts[r["_id"]] = r["count"]
    
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
        merch_pipeline = [
            {"$match": {**merch_query, "status": {"$ne": "cancelled"}}},
            {"$group": {
                "_id": "$status",
                "total": {"$sum": "$total_amount"},
                "count": {"$sum": 1}
            }}
        ]
        merch_results = await db.merchandise_orders.aggregate(merch_pipeline).to_list(10)
        for r in merch_results:
            merch_by_status[r["_id"]] = {"amount": round(r["total"], 2), "count": r["count"]}
            if r["_id"] in ["paid", "processing", "ready", "delivered"]:
                merch_total_sales += r["total"]
            merch_total_orders += r["count"]
        merch_inventory_pipeline = [
            {"$match": {"is_active": True}},
            {"$group": {
                "_id": None,
                "total_stock_value": {"$sum": {"$multiply": ["$price", "$stock"]}},
                "total_items": {"$sum": "$stock"}
            }}
        ]
        merch_inventory = await db.merchandise_products.aggregate(merch_inventory_pipeline).to_list(1)
        merch_stock_value = merch_inventory[0]["total_stock_value"] if merch_inventory else 0
        merch_stock_items = merch_inventory[0]["total_items"] if merch_inventory else 0
    
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
        koop_pipeline = [
            {"$match": {**koop_query, "status": {"$ne": "cancelled"}}},
            {"$group": {
                "_id": "$status",
                "total": {"$sum": "$total_amount"},
                "count": {"$sum": 1}
            }}
        ]
        koop_results = await db.koop_orders.aggregate(koop_pipeline).to_list(10)
        for r in koop_results:
            koop_by_status[r["_id"]] = {"amount": round(r["total"], 2), "count": r["count"]}
            if r["_id"] in ["paid", "processing", "ready", "collected"]:
                koop_total_sales += r["total"]
            koop_total_orders += r["count"]
        koop_commission_query = {"commission_type": "koperasi"}
        if date_query:
            koop_commission_query["created_at"] = date_query
        koop_commission_pipeline = [
            {"$match": {**koop_commission_query, "status": {"$in": ["confirmed", "paid_out"]}}},
            {"$group": {"_id": None, "total": {"$sum": "$commission_amount"}}}
        ]
        koop_commission_result = await db.commission_records.aggregate(koop_commission_pipeline).to_list(1)
        koop_commission_earned = koop_commission_result[0]["total"] if koop_commission_result else 0
        pum_query = {}
        if date_query:
            pum_query["created_at"] = date_query
        pum_pipeline = [
            {"$match": {**pum_query, "status": {"$ne": "cancelled"}}},
            {"$group": {
                "_id": "$status",
                "total": {"$sum": "$total_amount"},
                "count": {"$sum": 1}
            }}
        ]
        pum_results = await db.pum_orders.aggregate(pum_pipeline).to_list(10)
        for r in pum_results:
            pum_by_status[r["_id"]] = {"amount": round(r["total"], 2), "count": r["count"]}
            if r["_id"] in ["paid", "processing", "shipped", "delivered"]:
                pum_total_sales += r["total"]
            pum_total_orders += r["count"]
        pum_commission_query = {"commission_type": "pum"}
        if date_query:
            pum_commission_query["created_at"] = date_query
        pum_commission_pipeline = [
            {"$match": {**pum_commission_query, "status": {"$in": ["confirmed", "paid_out"]}}},
            {"$group": {"_id": None, "total": {"$sum": "$commission_amount"}}}
        ]
        pum_commission_result = await db.commission_records.aggregate(pum_commission_pipeline).to_list(1)
        pum_commission_earned = pum_commission_result[0]["total"] if pum_commission_result else 0
        pum_inventory_pipeline = [
            {"$match": {"is_active": True}},
            {"$group": {
                "_id": None,
                "total_stock_value": {"$sum": {"$multiply": ["$price", "$stock"]}},
                "total_items": {"$sum": "$stock"}
            }}
        ]
        pum_inventory = await db.pum_products.aggregate(pum_inventory_pipeline).to_list(1)
        pum_stock_value = pum_inventory[0]["total_stock_value"] if pum_inventory else 0
        pum_stock_items = pum_inventory[0]["total_items"] if pum_inventory else 0
    
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
    
    # Aggregate commission records by month
    pipeline = [
        {"$match": {
            "created_at": {"$gte": start_date},
            "status": {"$in": ["confirmed", "paid_out"]}
        }},
        {"$group": {
            "_id": {
                "year": {"$year": "$created_at"},
                "month": {"$month": "$created_at"},
                "type": "$commission_type"
            },
            "amount": {"$sum": "$commission_amount"}
        }},
        {"$sort": {"_id.year": 1, "_id.month": 1}}
    ]
    
    results = await db.commission_records.aggregate(pipeline).to_list(100)
    
    # Process into monthly data
    monthly_data = {}
    bulan_names = {
        1: "Jan", 2: "Feb", 3: "Mac", 4: "Apr", 5: "Mei", 6: "Jun",
        7: "Jul", 8: "Ogos", 9: "Sep", 10: "Okt", 11: "Nov", 12: "Dis"
    }
    
    for r in results:
        comm_type = r["_id"]["type"]
        if not koperasi_enabled and comm_type in ("koperasi", "pum"):
            continue
        key = f"{r['_id']['year']}-{r['_id']['month']:02d}"
        if key not in monthly_data:
            monthly_data[key] = {
                "period": key,
                "month_name": f"{bulan_names.get(r['_id']['month'], r['_id']['month'])} {r['_id']['year']}",
                "muafakat": 0,
                "koperasi": 0,
                "pum": 0,
                "total": 0
            }
        monthly_data[key][comm_type] = round(r["amount"], 2)
        monthly_data[key]["total"] += r["amount"]
    
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
    
    pipeline = [
        {"$match": query},
        {"$group": {
            "_id": {
                "type": "$commission_type",
                "module": "$module"
            },
            "total_amount": {"$sum": "$commission_amount"},
            "total_orders": {"$sum": 1},
            "avg_amount": {"$avg": "$commission_amount"}
        }},
        {"$sort": {"total_amount": -1}}
    ]
    
    results = await db.commission_records.aggregate(pipeline).to_list(50)
    
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
    
    for r in results:
        breakdown.append({
            "commission_type": r["_id"]["type"],
            "commission_type_display": type_display.get(r["_id"]["type"], r["_id"]["type"]),
            "module": r["_id"]["module"],
            "module_display": module_display.get(r["_id"]["module"], r["_id"]["module"]),
            "total_amount": round(r["total_amount"], 2),
            "total_orders": r["total_orders"],
            "avg_amount": round(r["avg_amount"], 2)
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
