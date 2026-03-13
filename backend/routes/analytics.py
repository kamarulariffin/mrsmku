"""
Analytics AI Module - Comprehensive analytics across all modules
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from bson import ObjectId

from pydantic import BaseModel


class AnalyticsQuery(BaseModel):
    question: str
    module: Optional[str] = "all"  # all, yuran, koperasi, bus, infaq, sedekah, hostel, sickbay


class AnalyticsResponse(BaseModel):
    summary: str
    insights: List[str]
    predictions: List[str]
    recommendations: List[str]
    data: Dict[str, Any]


def init_router(database, auth_func):
    """Initialize - kept for compatibility but not used"""
    pass


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


async def get_fees_analytics(db):
    """Get fees analytics data"""
    fees_by_status: Dict[str, Dict[str, Any]] = {}
    async for row in db.student_fees.find({}):
        status = row.get("status")
        if not status:
            continue
        if status not in fees_by_status:
            fees_by_status[status] = {"count": 0, "total": 0.0}
        fees_by_status[status]["count"] += 1
        fees_by_status[status]["total"] += _as_float(row.get("amount"))
    
    total_fees = await db.student_fees.count_documents({})
    paid_fees = await db.student_fees.count_documents({"status": "paid"})
    pending_fees = await db.student_fees.count_documents({"status": {"$in": ["pending", "partial"]}})
    
    # Get recent payments
    recent_payments = await db.payments.find().sort("created_at", -1).limit(10).to_list(10)
    total_collected = sum([p.get("amount", 0) for p in recent_payments])
    
    return {
        "total_fees": total_fees,
        "paid_fees": paid_fees,
        "pending_fees": pending_fees,
        "collection_rate": round((paid_fees / total_fees * 100) if total_fees > 0 else 0, 1),
        "fees_by_status": {
            status: {"count": stats["count"], "total": stats["total"]}
            for status, stats in fees_by_status.items()
        },
        "recent_collection": total_collected
    }


async def get_koperasi_analytics(db):
    """Get koperasi analytics data"""
    total_products = await db.koperasi_products.count_documents({})
    total_kits = await db.koperasi_kits.count_documents({})
    total_orders = await db.koperasi_orders.count_documents({})
    
    orders_by_status: Dict[str, Dict[str, Any]] = {}
    async for row in db.koperasi_orders.find({}):
        status = row.get("status")
        if not status:
            continue
        if status not in orders_by_status:
            orders_by_status[status] = {"count": 0, "total": 0.0}
        orders_by_status[status]["count"] += 1
        orders_by_status[status]["total"] += _as_float(row.get("total_amount"))
    
    # Calculate revenue
    total_revenue = 0.0
    async for row in db.koperasi_orders.find({"status": "paid"}):
        total_revenue += _as_float(row.get("total_amount"))
    
    return {
        "total_products": total_products,
        "total_kits": total_kits,
        "total_orders": total_orders,
        "total_revenue": total_revenue,
        "orders_by_status": {
            status: {"count": stats["count"], "total": stats["total"]}
            for status, stats in orders_by_status.items()
        },
    }


async def get_bus_analytics(db):
    """Get bus analytics data"""
    total_trips = await db.bus_trips.count_documents({})
    total_bookings = await db.bus_bookings.count_documents({})
    
    bookings_by_status: Dict[str, int] = {}
    async for row in db.bus_bookings.find({}):
        status = row.get("status")
        if not status:
            continue
        bookings_by_status[status] = bookings_by_status.get(status, 0) + 1
    
    # Revenue from confirmed bookings
    total_revenue = 0.0
    async for row in db.bus_bookings.find({"status": {"$in": ["confirmed", "paid"]}}):
        total_revenue += _as_float(row.get("total_price"))
    
    return {
        "total_trips": total_trips,
        "total_bookings": total_bookings,
        "total_revenue": total_revenue,
        "bookings_by_status": bookings_by_status,
    }


async def get_infaq_analytics(db):
    """Get infaq analytics data"""
    total_campaigns = await db.infaq_campaigns.count_documents({})
    active_campaigns = await db.infaq_campaigns.count_documents({"status": "active"})
    total_donations = await db.infaq_donations.count_documents({})
    
    total_collected = 0.0
    total_slots_sold = 0
    async for row in db.infaq_donations.find({}):
        total_collected += _as_float(row.get("amount"))
        total_slots_sold += _as_int(row.get("slots"))
    
    return {
        "total_campaigns": total_campaigns,
        "active_campaigns": active_campaigns,
        "total_donations": total_donations,
        "total_collected": total_collected,
        "total_slots_sold": total_slots_sold
    }


async def get_sedekah_analytics(db):
    """Get sedekah/tabung analytics data (unified Tabung & Sumbangan)"""
    total_campaigns = await db.tabung_campaigns.count_documents({})
    active_campaigns = await db.tabung_campaigns.count_documents({"status": "active"})
    total_collected = 0.0
    total_donations = 0
    async for row in db.tabung_donations.find({"payment_status": "completed"}):
        total_collected += _as_float(row.get("amount"))
        total_donations += 1
    unique_donors = len(await db.tabung_donations.distinct("user_id"))
    return {
        "total_campaigns": total_campaigns,
        "active_campaigns": active_campaigns,
        "total_donations": total_donations,
        "total_collected": total_collected,
        "unique_donors": unique_donors
    }


# Default katil per bilik jika tiada dalam DB (biasa 2 untuk asrama sekolah)
BEDS_PER_ROOM_DEFAULT = 2


async def get_hostel_analytics(db):
    """Get hostel analytics data including room occupancy and rooms with empty beds."""
    # Students with block + room (block_name/block/hostel_block, room_number/room)
    students_match = {
        "$and": [
            {"$or": [
                {"block_name": {"$exists": True, "$ne": ""}},
                {"block": {"$exists": True, "$ne": ""}},
                {"hostel_block": {"$exists": True, "$ne": ""}}
            ]},
            {"$or": [{"room_number": {"$exists": True, "$ne": ""}}, {"room": {"$exists": True, "$ne": ""}}]}
        ]
    }
    from collections import defaultdict
    by_room = defaultdict(int)
    async for row in db.students.find(students_match):
        block = row.get("block_name")
        if block in (None, ""):
            block = row.get("block")
        if block in (None, ""):
            block = row.get("hostel_block")
        room = row.get("room_number")
        if room in (None, ""):
            room = row.get("room")
        block = str(block or "").strip()
        room = str(room or "").strip()
        if block or room:
            by_room[(block, room)] += 1
    # Tetapan katil per bilik dari blok (jika ada); jika tidak guna default
    block_beds_map = {}
    try:
        blocks_cursor = db.hostel_blocks.find({}, {"code": 1, "beds_per_room": 1})
        for b in await blocks_cursor.to_list(100):
            code = (b.get("code") or "").strip()
            bp = b.get("beds_per_room")
            bp_int = _as_int(bp)
            if code and bp_int > 0:
                block_beds_map[code] = bp_int
    except Exception:
        pass
    rooms_with_empty_beds = 0
    total_empty_beds = 0
    room_detail = []
    for (block, room), occupants in by_room.items():
        cap = block_beds_map.get(block) or BEDS_PER_ROOM_DEFAULT
        empty = max(0, cap - occupants)
        if empty > 0:
            rooms_with_empty_beds += 1
            total_empty_beds += empty
        room_detail.append({"block": block, "room": room, "occupants": occupants, "capacity": cap, "empty_beds": empty})
    # Fully empty rooms (no occupant) - count as having empty beds
    total_students_legacy = await db.students.count_documents({"hostel_block": {"$exists": True, "$ne": ""}})
    total_students = sum(by_room.values()) if by_room else total_students_legacy
    total_leave_requests = await db.leave_requests.count_documents({})
    pending_requests = await db.leave_requests.count_documents({"status": "pending"})
    approved_requests = await db.leave_requests.count_documents({"status": "approved"})
    return {
        "total_hostel_students": total_students,
        "total_leave_requests": total_leave_requests,
        "pending_requests": pending_requests,
        "approved_requests": approved_requests,
        "rooms_with_empty_beds": rooms_with_empty_beds,
        "total_empty_beds": total_empty_beds,
        "total_rooms": len(by_room),
        "beds_per_room_default": BEDS_PER_ROOM_DEFAULT,
        "room_occupancy_detail": room_detail[:100],
    }


async def get_sickbay_analytics(db):
    """Get sickbay analytics data"""
    total_records = await db.sickbay_records.count_documents({})
    
    # Records by status
    records_by_status: Dict[str, int] = {}
    async for row in db.sickbay_records.find({}):
        status = row.get("status")
        if not status:
            continue
        records_by_status[status] = records_by_status.get(status, 0) + 1
    
    # Recent week
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    recent_records = await db.sickbay_records.count_documents({"created_at": {"$gte": week_ago}})
    
    return {
        "total_records": total_records,
        "recent_week_records": recent_records,
        "records_by_status": records_by_status,
    }


async def get_analytics_dashboard_data(db):
    """Get comprehensive analytics dashboard data"""
    # Gather all analytics
    fees_data = await get_fees_analytics(db)
    koperasi_data = await get_koperasi_analytics(db)
    bus_data = await get_bus_analytics(db)
    infaq_data = await get_infaq_analytics(db)
    sedekah_data = await get_sedekah_analytics(db)
    hostel_data = await get_hostel_analytics(db)
    sickbay_data = await get_sickbay_analytics(db)
    
    # Calculate totals
    total_revenue = (
        fees_data.get("recent_collection", 0) +
        koperasi_data.get("total_revenue", 0) +
        bus_data.get("total_revenue", 0) +
        infaq_data.get("total_collected", 0) +
        sedekah_data.get("total_collected", 0)
    )
    
    return {
        "summary": {
            "total_revenue": total_revenue,
            "fees_collection_rate": fees_data.get("collection_rate", 0),
            "active_campaigns": infaq_data.get("active_campaigns", 0) + sedekah_data.get("active_campaigns", 0),
            "pending_leave_requests": hostel_data.get("pending_requests", 0)
        },
        "modules": {
            "yuran": fees_data,
            "koperasi": koperasi_data,
            "bus": bus_data,
            "infaq": infaq_data,
            "sedekah": sedekah_data,
            "hostel": hostel_data,
            "sickbay": sickbay_data
        }
    }


def _build_insights_from_data(data: dict, question: str) -> dict:
    """Build summary, insights, predictions, recommendations from analytics data (no LLM)."""
    summary_parts = []
    insights = []
    predictions = []
    recommendations = []

    if data.get("yuran"):
        d = data["yuran"]
        total = d.get("total_fees", 0) or 0
        paid = d.get("paid_fees", 0) or 0
        rate = d.get("collection_rate", 0) or 0
        summary_parts.append(f"Yuran: {paid}/{total} dibayar ({rate}% kadar kutipan).")
        if rate < 80:
            insights.append("Kadar kutipan yuran di bawah 80% — pertimbangkan peringatan atau bantuan.")
        recommendations.append("Tingkatkan peringatan yuran tertunggak untuk ibu bapa.")

    if data.get("koperasi"):
        d = data["koperasi"]
        rev = d.get("total_revenue", 0) or 0
        orders = d.get("total_orders", 0) or 0
        summary_parts.append(f"Koperasi: {orders} pesanan, jumlah hasil RM {rev:,.2f}.")
        insights.append(f"Jumlah pesanan koperasi: {orders}.")

    if data.get("bus"):
        d = data["bus"]
        trips = d.get("total_trips", 0) or 0
        bookings = d.get("total_bookings", 0) or 0
        summary_parts.append(f"Bas: {bookings} tempahan untuk {trips} perjalanan.")
        insights.append(f"Tempahan bas: {bookings}.")

    if data.get("infaq"):
        d = data["infaq"]
        total = d.get("total_collected", 0) or 0
        summary_parts.append(f"Infaq: jumlah sumbangan RM {total:,.2f}.")
        insights.append("Data infaq slot tersedia untuk analisis.")

    if data.get("sedekah"):
        d = data["sedekah"]
        total = d.get("total_collected", 0) or 0
        campaigns = d.get("active_campaigns", 0) or 0
        summary_parts.append(f"Sedekah: {campaigns} kempen aktif, jumlah derma RM {total:,.2f}.")
        insights.append(f"Kempen sedekah aktif: {campaigns}.")

    if data.get("hostel"):
        d = data["hostel"]
        total = d.get("total_hostel_students", 0) or 0
        summary_parts.append(f"Hostel: {total} pelajar berdaftar.")
        rooms_empty = d.get("rooms_with_empty_beds", 0)
        total_empty = d.get("total_empty_beds", 0)
        total_rooms = d.get("total_rooms", 0)
        if total_rooms is not None and (rooms_empty is not None or total_empty is not None):
            summary_parts.append(f"Bilik berdaftar: {total_rooms}. Bilik yang ada katil kosong: {rooms_empty} bilik ({total_empty} katil kosong).")
            insights.append(f"Berdasarkan data semasa: {rooms_empty} bilik ada katil kosong; jumlah katil kosong {total_empty}.")
        else:
            insights.append("Data asrama boleh digunakan untuk perancangan penginapan.")

    if data.get("sickbay"):
        d = data["sickbay"]
        total = d.get("total_records", 0) or 0
        summary_parts.append(f"Sickbay: {total} rekod bilik sakit.")
        insights.append("Rekod sickbay berguna untuk pemantauan kesihatan pelajar.")

    summary = " ".join(summary_parts) if summary_parts else "Tiada data untuk modul dipilih."
    if not insights:
        insights = ["Data telah dikumpulkan. Gunakan soalan khusus untuk insight lanjut."]
    if not predictions:
        predictions = ["Trend boleh dipantau dari semasa ke semasa melalui dashboard.", "Kadar kutipan dijangka bertambah dengan peringatan yang konsisten."]
    if not recommendations:
        recommendations = ["Semak dashboard secara berkala.", "Eksport laporan untuk rekod.", "Kongsi ringkasan dengan pihak pengurusan."]

    return {
        "summary": summary,
        "insights": insights[:5],
        "predictions": predictions[:3],
        "recommendations": recommendations[:5],
    }


async def get_ai_insights_data(query: AnalyticsQuery, db):
    """Get insights based on analytics data (rule-based, no external LLM)."""
    data = {}
    if query.module == "all" or query.module == "yuran":
        data["yuran"] = await get_fees_analytics(db)
    if query.module == "all" or query.module == "koperasi":
        data["koperasi"] = await get_koperasi_analytics(db)
    if query.module == "all" or query.module == "bus":
        data["bus"] = await get_bus_analytics(db)
    if query.module == "all" or query.module == "infaq":
        data["infaq"] = await get_infaq_analytics(db)
    if query.module == "all" or query.module == "sedekah":
        data["sedekah"] = await get_sedekah_analytics(db)
    if query.module == "all" or query.module == "hostel":
        data["hostel"] = await get_hostel_analytics(db)
    if query.module == "all" or query.module == "sickbay":
        data["sickbay"] = await get_sickbay_analytics(db)

    built = _build_insights_from_data(data, query.question)
    return {
        "response": built["summary"],
        "data": data,
        "module": query.module,
        "summary": built["summary"],
        "insights": built["insights"],
        "predictions": built["predictions"],
        "recommendations": built["recommendations"],
    }


async def get_module_analytics_data(module_name: str, db):
    """Get analytics for specific module"""
    module_functions = {
        "yuran": get_fees_analytics,
        "koperasi": get_koperasi_analytics,
        "bus": get_bus_analytics,
        "infaq": get_infaq_analytics,
        "sedekah": get_sedekah_analytics,
        "hostel": get_hostel_analytics,
        "sickbay": get_sickbay_analytics
    }
    
    if module_name not in module_functions:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Modul tidak dijumpai")
    
    data = await module_functions[module_name](db)
    return {"module": module_name, "data": data}


async def analytics_chat_data(query: AnalyticsQuery, db):
    """Chat about analytics (rule-based response from data, no external LLM)."""
    module = (query.module or "all").lower()
    if module == "hostel":
        all_data = {"hostel": await get_hostel_analytics(db)}
    elif module == "sickbay":
        all_data = {"sickbay": await get_sickbay_analytics(db)}
    else:
        all_data = {
            "yuran": await get_fees_analytics(db),
            "koperasi": await get_koperasi_analytics(db),
            "bus": await get_bus_analytics(db),
            "infaq": await get_infaq_analytics(db),
            "sedekah": await get_sedekah_analytics(db),
            "hostel": await get_hostel_analytics(db),
            "sickbay": await get_sickbay_analytics(db),
        }
    built = _build_insights_from_data(all_data, query.question)
    q = query.question.lower()
    # Soalan khusus: bilik ada katil kosong (data real dari DB)
    if (module in ("hostel", "all")) and all_data.get("hostel") and ("bilik" in q or "room" in q) and ("katil kosong" in q or "kosong" in q or "empty" in q or "slot" in q):
        h = all_data.get("hostel", {})
        rooms_empty = h.get("rooms_with_empty_beds", 0)
        total_empty = h.get("total_empty_beds", 0)
        total_rooms = h.get("total_rooms", 0)
        beds_per = h.get("beds_per_room_default", BEDS_PER_ROOM_DEFAULT)
        response = (
            f"Berdasarkan data semasa dari pangkalan data: Terdapat {rooms_empty} bilik yang ada katil kosong, "
            f"dengan jumlah {total_empty} katil kosong. Jumlah bilik berdaftar (ada pelajar): {total_rooms}. "
            f"(Anggaran {beds_per} katil per bilik digunakan jika tiada maklumat kapasiti dalam sistem.)"
        )
    elif "ringkasan" in q or "summary" in q or "keseluruhan" in q:
        response = built["summary"]
    elif "insight" in q or "penemuan" in q:
        response = "Insight: " + " | ".join(built["insights"])
    elif "ramalan" in q or "trend" in q or "prediction" in q:
        response = "Ramalan/trend: " + " | ".join(built["predictions"])
    elif "cadangan" in q or "recommendation" in q:
        response = "Cadangan: " + " | ".join(built["recommendations"])
    else:
        response = built["summary"] + " " + " ".join(f"• {i}" for i in built["insights"][:3])
    return {
        "response": response,
        "question": query.question,
    }
