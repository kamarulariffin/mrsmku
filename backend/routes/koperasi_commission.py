"""
Koperasi-PUM Commission Integration Module
Handles commission calculation and reporting for merchandise sales
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from bson import ObjectId

router = APIRouter(prefix="/api/koperasi/commission", tags=["Koperasi Commission"])
security = HTTPBearer()

# Will be set from server.py
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
    return await _get_current_user_func(credentials)


async def log_audit(user, action, module, details):
    if _log_audit_func:
        await _log_audit_func(user, action, module, details)


# ==================== COMMISSION SETTINGS ====================

@router.get("/settings", response_model=dict)
async def get_commission_settings(user: dict = Depends(get_current_user)):
    """Get current PUM commission settings for Koperasi"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    settings = await db.koperasi_settings.find_one({"type": "commission"})
    
    if not settings:
        # Create default settings
        default_settings = {
            "type": "commission",
            "pum_commission_rate": 10.0,  # 10% default
            "commission_enabled": True,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }
        await db.koperasi_settings.insert_one(default_settings)
        settings = default_settings
    
    return {
        "pum_commission_rate": settings.get("pum_commission_rate", 10.0),
        "commission_enabled": settings.get("commission_enabled", True),
        "updated_at": settings.get("updated_at").isoformat() if settings.get("updated_at") else None,
        "updated_by": settings.get("updated_by")
    }


@router.put("/settings", response_model=dict)
async def update_commission_settings(
    pum_commission_rate: float = Query(..., ge=0, le=100, description="Kadar komisyen PUM (%)"),
    commission_enabled: bool = Query(True, description="Aktifkan komisyen"),
    user: dict = Depends(get_current_user)
):
    """Update PUM commission rate for Koperasi merchandise sales"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    await db.koperasi_settings.update_one(
        {"type": "commission"},
        {
            "$set": {
                "pum_commission_rate": pum_commission_rate,
                "commission_enabled": commission_enabled,
                "updated_at": datetime.now(timezone.utc),
                "updated_by": str(user["_id"])
            }
        },
        upsert=True
    )
    
    await log_audit(
        user, 
        "UPDATE_COMMISSION_SETTINGS", 
        "koperasi", 
        f"Kadar komisyen PUM dikemaskini ke {pum_commission_rate}%"
    )
    
    return {
        "success": True,
        "message": f"Kadar komisyen PUM dikemaskini ke {pum_commission_rate}%",
        "pum_commission_rate": pum_commission_rate,
        "commission_enabled": commission_enabled
    }


# ==================== COMMISSION CALCULATION ====================

async def calculate_commission(db, order_total: float) -> dict:
    """Calculate commission for an order"""
    settings = await db.koperasi_settings.find_one({"type": "commission"})
    
    rate = settings.get("pum_commission_rate", 10.0) if settings else 10.0
    enabled = settings.get("commission_enabled", True) if settings else True
    
    if not enabled:
        return {
            "commission_rate": 0,
            "commission_amount": 0,
            "net_amount": order_total,
            "enabled": False
        }
    
    commission_amount = order_total * (rate / 100)
    net_amount = order_total - commission_amount
    
    return {
        "commission_rate": rate,
        "commission_amount": round(commission_amount, 2),
        "net_amount": round(net_amount, 2),
        "enabled": True
    }


# ==================== COMMISSION REPORTS ====================

@router.get("/report", response_model=dict)
async def get_commission_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    status: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """
    Get commission report for Koperasi merchandise sales
    Returns summary and detailed breakdown
    """
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Build query
    query = {}
    
    # Default to current month if no dates provided
    if not start_date:
        now = datetime.now(timezone.utc)
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    
    if not end_date:
        now = datetime.now(timezone.utc)
        # Get last day of current month
        if now.month == 12:
            end_date = now.replace(year=now.year + 1, month=1, day=1) - timedelta(days=1)
        else:
            end_date = now.replace(month=now.month + 1, day=1) - timedelta(days=1)
        end_date = end_date.replace(hour=23, minute=59, second=59).isoformat()
    
    # Parse dates
    try:
        start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
    except ValueError:
        start_dt = datetime.now(timezone.utc).replace(day=1)
        end_dt = datetime.now(timezone.utc)
    
    query["created_at"] = {"$gte": start_dt, "$lte": end_dt}
    
    if status:
        query["status"] = status
    else:
        # Only include completed orders by default
        query["status"] = {"$in": ["paid", "processing", "ready", "collected"]}
    
    # Get orders
    orders = await db.koop_orders.find(query).sort("created_at", -1).to_list(1000)
    
    # Get commission settings
    settings = await db.koperasi_settings.find_one({"type": "commission"})
    commission_rate = settings.get("pum_commission_rate", 10.0) if settings else 10.0
    
    # Calculate totals
    total_sales = 0
    total_commission = 0
    order_details = []
    
    for order in orders:
        amount = order.get("total_amount", 0)
        # Use order-specific rate if stored, otherwise use current rate
        order_rate = order.get("commission_rate", commission_rate)
        commission = amount * (order_rate / 100)
        
        total_sales += amount
        total_commission += commission
        
        order_details.append({
            "id": str(order["_id"]),
            "order_number": order.get("order_number"),
            "student_name": order.get("student_name"),
            "total_amount": amount,
            "commission_rate": order_rate,
            "commission_amount": round(commission, 2),
            "net_amount": round(amount - commission, 2),
            "status": order.get("status"),
            "created_at": order.get("created_at").isoformat() if order.get("created_at") else None
        })
    
    return {
        "period": {
            "start_date": start_dt.isoformat(),
            "end_date": end_dt.isoformat()
        },
        "summary": {
            "total_orders": len(orders),
            "total_sales": round(total_sales, 2),
            "current_commission_rate": commission_rate,
            "total_commission": round(total_commission, 2),
            "net_for_koperasi": round(total_sales - total_commission, 2)
        },
        "orders": order_details
    }


@router.get("/report/monthly", response_model=List[dict])
async def get_monthly_commission_summary(
    year: int = Query(default=None, description="Tahun laporan"),
    user: dict = Depends(get_current_user)
):
    """Get monthly commission summary for the year"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    if not year:
        year = datetime.now().year
    
    # Get commission settings
    settings = await db.koperasi_settings.find_one({"type": "commission"})
    commission_rate = settings.get("pum_commission_rate", 10.0) if settings else 10.0
    
    monthly_data = []
    month_names = [
        "Januari", "Februari", "Mac", "April", "Mei", "Jun",
        "Julai", "Ogos", "September", "Oktober", "November", "Disember"
    ]
    
    for month in range(1, 13):
        # Start and end of month
        start_date = datetime(year, month, 1, 0, 0, 0, tzinfo=timezone.utc)
        if month == 12:
            end_date = datetime(year + 1, 1, 1, 0, 0, 0, tzinfo=timezone.utc) - timedelta(seconds=1)
        else:
            end_date = datetime(year, month + 1, 1, 0, 0, 0, tzinfo=timezone.utc) - timedelta(seconds=1)
        
        # Get orders for this month
        orders = await db.koop_orders.find({
            "created_at": {"$gte": start_date, "$lte": end_date},
            "status": {"$in": ["paid", "processing", "ready", "collected"]}
        }).to_list(1000)
        
        total_sales = sum(o.get("total_amount", 0) for o in orders)
        total_commission = total_sales * (commission_rate / 100)
        
        monthly_data.append({
            "month": month,
            "month_name": month_names[month - 1],
            "year": year,
            "total_orders": len(orders),
            "total_sales": round(total_sales, 2),
            "commission_rate": commission_rate,
            "total_commission": round(total_commission, 2),
            "net_for_koperasi": round(total_sales - total_commission, 2)
        })
    
    return monthly_data


@router.get("/report/export", response_model=dict)
async def export_commission_report(
    start_date: str,
    end_date: str,
    format: str = "json",
    user: dict = Depends(get_current_user)
):
    """Export commission report data"""
    if user["role"] not in ["superadmin", "admin", "koop_admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Get full report
    report = await get_commission_report(start_date, end_date, None, user)
    
    if format == "json":
        return {
            "export_date": datetime.now(timezone.utc).isoformat(),
            "exported_by": user.get("full_name", user.get("email")),
            "report": report
        }
    
    # For PDF/Excel export, return data that can be used by frontend
    return {
        "export_date": datetime.now(timezone.utc).isoformat(),
        "format": format,
        "data": report
    }


# ==================== RECORD COMMISSION ON ORDER ====================

async def record_order_commission(db, order_id: str, order_total: float, user_id: str = None):
    """Record commission for a completed order"""
    commission = await calculate_commission(db, order_total)
    
    if not commission["enabled"]:
        return None
    
    commission_record = {
        "order_id": order_id,
        "order_total": order_total,
        "commission_rate": commission["commission_rate"],
        "commission_amount": commission["commission_amount"],
        "net_amount": commission["net_amount"],
        "status": "pending",  # pending, paid_to_pum, cancelled
        "created_at": datetime.now(timezone.utc),
        "created_by": user_id
    }
    
    result = await db.koperasi_commissions.insert_one(commission_record)
    
    return {
        "id": str(result.inserted_id),
        **commission
    }


@router.get("/pending", response_model=dict)
async def get_pending_commissions(user: dict = Depends(get_current_user)):
    """Get total pending commissions to be paid to PUM"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Get completed orders that haven't had commission marked as paid
    pipeline = [
        {
            "$match": {
                "status": {"$in": ["paid", "processing", "ready", "collected"]},
                "commission_paid": {"$ne": True}
            }
        },
        {
            "$group": {
                "_id": None,
                "total_sales": {"$sum": "$total_amount"},
                "order_count": {"$sum": 1}
            }
        }
    ]
    
    result = await db.koop_orders.aggregate(pipeline).to_list(1)
    
    if not result:
        return {
            "pending_orders": 0,
            "total_sales": 0,
            "commission_rate": 10.0,
            "pending_commission": 0
        }
    
    settings = await db.koperasi_settings.find_one({"type": "commission"})
    rate = settings.get("pum_commission_rate", 10.0) if settings else 10.0
    
    total_sales = result[0]["total_sales"]
    pending_commission = total_sales * (rate / 100)
    
    return {
        "pending_orders": result[0]["order_count"],
        "total_sales": round(total_sales, 2),
        "commission_rate": rate,
        "pending_commission": round(pending_commission, 2)
    }


@router.post("/mark-paid", response_model=dict)
async def mark_commission_paid(
    order_ids: List[str] = None,
    mark_all_pending: bool = False,
    payment_reference: str = None,
    user: dict = Depends(get_current_user)
):
    """Mark commission as paid to PUM for specific orders or all pending"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    query = {"status": {"$in": ["paid", "processing", "ready", "collected"]}}
    
    if mark_all_pending:
        query["commission_paid"] = {"$ne": True}
    elif order_ids:
        query["_id"] = {"$in": [ObjectId(oid) for oid in order_ids]}
    else:
        raise HTTPException(status_code=400, detail="Sila pilih pesanan atau tandakan semua")
    
    # Get orders to calculate total
    orders = await db.koop_orders.find(query).to_list(1000)
    
    settings = await db.koperasi_settings.find_one({"type": "commission"})
    rate = settings.get("pum_commission_rate", 10.0) if settings else 10.0
    
    total_commission = sum(o.get("total_amount", 0) * (rate / 100) for o in orders)
    
    # Mark as paid
    result = await db.koop_orders.update_many(
        query,
        {
            "$set": {
                "commission_paid": True,
                "commission_paid_at": datetime.now(timezone.utc),
                "commission_paid_by": str(user["_id"]),
                "commission_payment_reference": payment_reference
            }
        }
    )
    
    # Create payment record
    payment_record = {
        "type": "pum_commission_payment",
        "order_count": result.modified_count,
        "total_amount": round(total_commission, 2),
        "commission_rate": rate,
        "payment_reference": payment_reference,
        "paid_by": str(user["_id"]),
        "paid_at": datetime.now(timezone.utc)
    }
    await db.koperasi_commission_payments.insert_one(payment_record)
    
    await log_audit(
        user,
        "MARK_COMMISSION_PAID",
        "koperasi",
        f"Komisyen PUM RM{total_commission:.2f} ditandakan sebagai dibayar untuk {result.modified_count} pesanan"
    )
    
    return {
        "success": True,
        "message": f"Komisyen untuk {result.modified_count} pesanan ditandakan sebagai dibayar",
        "orders_updated": result.modified_count,
        "total_commission_paid": round(total_commission, 2)
    }
