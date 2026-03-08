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


async def get_fees_analytics(db):
    """Get fees analytics data"""
    pipeline = [
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1},
            "total": {"$sum": "$amount"}
        }}
    ]
    fees_by_status = await db.student_fees.aggregate(pipeline).to_list(100)
    
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
        "fees_by_status": {item["_id"]: {"count": item["count"], "total": item["total"]} for item in fees_by_status if item["_id"]},
        "recent_collection": total_collected
    }


async def get_koperasi_analytics(db):
    """Get koperasi analytics data"""
    total_products = await db.koperasi_products.count_documents({})
    total_kits = await db.koperasi_kits.count_documents({})
    total_orders = await db.koperasi_orders.count_documents({})
    
    pipeline = [
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1},
            "total": {"$sum": "$total_amount"}
        }}
    ]
    orders_by_status = await db.koperasi_orders.aggregate(pipeline).to_list(100)
    
    # Calculate revenue
    paid_orders = await db.koperasi_orders.find({"status": "paid"}).to_list(1000)
    total_revenue = sum([o.get("total_amount", 0) for o in paid_orders])
    
    return {
        "total_products": total_products,
        "total_kits": total_kits,
        "total_orders": total_orders,
        "total_revenue": total_revenue,
        "orders_by_status": {item["_id"]: {"count": item["count"], "total": item["total"]} for item in orders_by_status if item["_id"]}
    }


async def get_bus_analytics(db):
    """Get bus analytics data"""
    total_trips = await db.bus_trips.count_documents({})
    total_bookings = await db.bus_bookings.count_documents({})
    
    pipeline = [
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1}
        }}
    ]
    bookings_by_status = await db.bus_bookings.aggregate(pipeline).to_list(100)
    
    # Revenue from confirmed bookings
    confirmed_bookings = await db.bus_bookings.find({"status": {"$in": ["confirmed", "paid"]}}).to_list(1000)
    total_revenue = sum([b.get("total_price", 0) for b in confirmed_bookings])
    
    return {
        "total_trips": total_trips,
        "total_bookings": total_bookings,
        "total_revenue": total_revenue,
        "bookings_by_status": {item["_id"]: item["count"] for item in bookings_by_status if item["_id"]}
    }


async def get_infaq_analytics(db):
    """Get infaq analytics data"""
    total_campaigns = await db.infaq_campaigns.count_documents({})
    active_campaigns = await db.infaq_campaigns.count_documents({"status": "active"})
    total_donations = await db.infaq_donations.count_documents({})
    
    pipeline = [
        {"$group": {
            "_id": None,
            "total_amount": {"$sum": "$amount"},
            "total_slots": {"$sum": "$slots"}
        }}
    ]
    donation_stats = await db.infaq_donations.aggregate(pipeline).to_list(1)
    
    total_collected = donation_stats[0]["total_amount"] if donation_stats else 0
    total_slots_sold = donation_stats[0]["total_slots"] if donation_stats else 0
    
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
    pipeline = [
        {"$match": {"payment_status": "completed"}},
        {"$group": {"_id": None, "total_amount": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    result = await db.tabung_donations.aggregate(pipeline).to_list(1)
    total_collected = result[0]["total_amount"] if result else 0
    total_donations = result[0]["count"] if result else 0
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
    pipeline = [
        {"$match": students_match},
        {"$project": {
            "block": {"$ifNull": ["$block_name", {"$ifNull": ["$block", "$hostel_block"]}]},
            "room": {"$ifNull": ["$room_number", "$room"]}
        }},
        {"$group": {"_id": {"block": "$block", "room": "$room"}, "occupants": {"$sum": 1}}}
    ]
    room_occupancy = await db.students.aggregate(pipeline).to_list(1000)
    from collections import defaultdict
    by_room = defaultdict(int)
    for r in room_occupancy:
        bid = r.get("_id") or {}
        block = (bid.get("block") or "").strip()
        room = (bid.get("room") or "").strip()
        if block or room:
            by_room[(block, room)] += r.get("occupants", 0)
    # Tetapan katil per bilik dari blok (jika ada); jika tidak guna default
    block_beds_map = {}
    try:
        blocks_cursor = db.hostel_blocks.find({}, {"code": 1, "beds_per_room": 1})
        for b in await blocks_cursor.to_list(100):
            code = (b.get("code") or "").strip()
            bp = b.get("beds_per_room")
            if code and bp is not None and int(bp) > 0:
                block_beds_map[code] = int(bp)
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
    pipeline = [
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1}
        }}
    ]
    records_by_status = await db.sickbay_records.aggregate(pipeline).to_list(100)
    
    # Recent week
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    recent_records = await db.sickbay_records.count_documents({"created_at": {"$gte": week_ago}})
    
    return {
        "total_records": total_records,
        "recent_week_records": recent_records,
        "records_by_status": {item["_id"]: item["count"] for item in records_by_status if item["_id"]}
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
