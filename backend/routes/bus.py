"""
Bus Ticket Management System - API Routes
MRSMKU Portal
"""
from datetime import datetime, timezone
from typing import List, Optional
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Depends, Query

from models.bus import (
    BusCompanyCreate, BusCompanyUpdate, BusCompanyResponse,
    APPLICATION_STATUS_PENDING, APPLICATION_STATUS_APPROVED,
    APPLICATION_STATUS_REJECTED, APPLICATION_STATUS_NEED_DOCUMENTS,
    BusCreate, BusUpdate, BusResponse,
    RouteCreate, RouteUpdate, RouteResponse, DropOffPoint, PickupPoint,
    TripCreate, TripUpdate, TripResponse,
    BookingCreate, BookingUpdate, BookingResponse,
    VendorRegistrationCreate, VendorRegistrationResponse
)

# Router will be initialized in server.py with database dependency
router = APIRouter(prefix="/api/bus", tags=["Bus Management"])


def generate_booking_number():
    """Generate unique booking number"""
    import random
    import string
    prefix = "TKT"
    date_part = datetime.now().strftime("%y%m%d")
    random_part = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"{prefix}{date_part}{random_part}"


# ============ BUS COMPANY ENDPOINTS ============

def _company_to_response(company: dict, bus_count: int = 0, route_count: int = 0) -> BusCompanyResponse:
    """Build BusCompanyResponse from company dict."""
    return BusCompanyResponse(
        id=str(company["_id"]),
        name=company["name"],
        registration_number=company["registration_number"],
        entity_type=company.get("entity_type"),
        address=company["address"],
        postcode=company.get("postcode"),
        city=company.get("city"),
        state=company.get("state"),
        director_name=company.get("director_name"),
        director_ic_passport=company.get("director_ic_passport"),
        phone=company["phone"],
        email=company["email"],
        pic_name=company["pic_name"],
        pic_phone=company["pic_phone"],
        apad_license_no=company.get("apad_license_no"),
        apad_expiry_date=company.get("apad_expiry_date"),
        apad_document_url=company.get("apad_document_url"),
        license_image_url=company.get("license_image_url"),
        permit_image_url=company.get("permit_image_url"),
        is_active=company.get("is_active", True),
        is_verified=company.get("is_verified", False),
        application_status=company.get("application_status"),
        submitted_at=company.get("submitted_at"),
        reviewed_by=company.get("reviewed_by"),
        approved_at=company.get("approved_at"),
        officer_notes=company.get("officer_notes"),
        total_buses=bus_count,
        total_routes=route_count,
        created_at=company.get("created_at", ""),
        verified_at=company.get("verified_at"),
        verified_by=company.get("verified_by")
    )


async def get_bus_companies(
    db,
    is_active: Optional[bool] = None,
    is_verified: Optional[bool] = None,
    application_status: Optional[str] = None
) -> List[BusCompanyResponse]:
    """Get all bus companies"""
    query = {}
    if is_active is not None:
        query["is_active"] = is_active
    if is_verified is not None:
        query["is_verified"] = is_verified
    if application_status is not None and (application_status if isinstance(application_status, str) else "").strip() != "":
        query["application_status"] = application_status
    
    companies = await db.bus_companies.find(query).to_list(100)
    result = []
    
    for company in companies:
        bus_count = await db.buses.count_documents({"company_id": company["_id"]})
        route_count = await db.bus_routes.count_documents({"company_id": company["_id"]})
        result.append(_company_to_response(company, bus_count, route_count))
    
    return result


async def create_bus_company(
    db,
    data: BusCompanyCreate,
    created_by: str
) -> BusCompanyResponse:
    """Create new bus company (permohonan pendaftaran; diluluskan oleh admin kemudian)."""
    existing = await db.bus_companies.find_one({"registration_number": data.registration_number})
    if existing:
        raise HTTPException(status_code=400, detail="Nombor pendaftaran syarikat sudah wujud")
    
    now = datetime.now(timezone.utc).isoformat()
    # Public self-registration must stay pending; only staff can set approved on create
    if created_by == "public":
        status = APPLICATION_STATUS_PENDING
    else:
        status = getattr(data, "application_status", None) or APPLICATION_STATUS_PENDING
    is_approved = status == APPLICATION_STATUS_APPROVED
    
    company_doc = {
        "name": data.name,
        "registration_number": data.registration_number,
        "entity_type": getattr(data, "entity_type", None),
        "address": data.address,
        "postcode": getattr(data, "postcode", None),
        "city": getattr(data, "city", None),
        "state": getattr(data, "state", None),
        "director_name": getattr(data, "director_name", None),
        "director_ic_passport": getattr(data, "director_ic_passport", None),
        "phone": data.phone,
        "email": data.email,
        "pic_name": data.pic_name,
        "pic_phone": data.pic_phone,
        "apad_license_no": getattr(data, "apad_license_no", None),
        "apad_expiry_date": getattr(data, "apad_expiry_date", None),
        "apad_document_url": getattr(data, "apad_document_url", None),
        "license_image_url": getattr(data, "license_image_url", None),
        "permit_image_url": getattr(data, "permit_image_url", None),
        "application_status": status,
        "submitted_at": now,
        "officer_notes": getattr(data, "officer_notes", None),
        "is_active": True,
        "is_verified": is_approved,
        "created_by": created_by,
        "created_at": now,
    }
    if is_approved:
        company_doc["verified_at"] = now
        company_doc["verified_by"] = created_by
        company_doc["approved_at"] = now
        company_doc["reviewed_by"] = created_by
    
    result = await db.bus_companies.insert_one(company_doc)
    company_doc["_id"] = result.inserted_id
    return _company_to_response(company_doc, 0, 0)


async def create_bus_company_public(db, data: BusCompanyCreate) -> BusCompanyResponse:
    """Pendaftaran syarikat bas oleh syarikat sendiri (tanpa login). Status sentiasa pending."""
    return await create_bus_company(db, data, created_by="public")


async def get_bus_company(db, company_id: str) -> BusCompanyResponse:
    """Get single bus company"""
    company = await db.bus_companies.find_one({"_id": ObjectId(company_id)})
    if not company:
        raise HTTPException(status_code=404, detail="Syarikat bas tidak dijumpai")
    bus_count = await db.buses.count_documents({"company_id": company["_id"]})
    route_count = await db.bus_routes.count_documents({"company_id": company["_id"]})
    return _company_to_response(company, bus_count, route_count)


async def update_bus_company(
    db,
    company_id: str,
    data: BusCompanyUpdate
) -> BusCompanyResponse:
    """Update bus company"""
    company = await db.bus_companies.find_one({"_id": ObjectId(company_id)})
    if not company:
        raise HTTPException(status_code=404, detail="Syarikat bas tidak dijumpai")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.bus_companies.update_one(
            {"_id": ObjectId(company_id)},
            {"$set": update_data}
        )
    
    return await get_bus_company(db, company_id)


async def approve_bus_company(
    db,
    company_id: str,
    application_status: str,
    officer_notes: Optional[str] = None,
    reviewed_by: str = None
) -> BusCompanyResponse:
    """Admin Bas: Lulus / Ditolak / Perlu Dokumen Tambahan."""
    if application_status not in (
        APPLICATION_STATUS_APPROVED,
        APPLICATION_STATUS_REJECTED,
        APPLICATION_STATUS_NEED_DOCUMENTS,
    ):
        raise HTTPException(
            status_code=400,
            detail="Status mestilah: approved, rejected, atau need_documents"
        )
    company = await db.bus_companies.find_one({"_id": ObjectId(company_id)})
    if not company:
        raise HTTPException(status_code=404, detail="Syarikat bas tidak dijumpai")
    
    now = datetime.now(timezone.utc).isoformat()
    update = {
        "application_status": application_status,
        "officer_notes": officer_notes,
        "reviewed_by": reviewed_by,
        "updated_at": now,
    }
    if application_status == APPLICATION_STATUS_APPROVED:
        update["is_verified"] = True
        update["verified_at"] = now
        update["verified_by"] = reviewed_by
        update["approved_at"] = now
    
    await db.bus_companies.update_one(
        {"_id": ObjectId(company_id)},
        {"$set": update}
    )
    return await get_bus_company(db, company_id)


async def delete_bus_company(db, company_id: str) -> dict:
    """Delete bus company"""
    company = await db.bus_companies.find_one({"_id": ObjectId(company_id)})
    if not company:
        raise HTTPException(status_code=404, detail="Syarikat bas tidak dijumpai")
    
    # Check for active buses and routes
    bus_count = await db.buses.count_documents({"company_id": ObjectId(company_id)})
    if bus_count > 0:
        raise HTTPException(status_code=400, detail="Tidak boleh padam syarikat yang mempunyai bas berdaftar")
    
    await db.bus_companies.delete_one({"_id": ObjectId(company_id)})
    return {"message": "Syarikat bas berjaya dipadam"}


# ============ BUS ENDPOINTS ============

def _bus_to_response(bus: dict, company_name: Optional[str] = None) -> BusResponse:
    """Build BusResponse from bus dict."""
    if company_name is None:
        company_name = "Unknown"
    return BusResponse(
        id=str(bus["_id"]),
        company_id=str(bus["company_id"]),
        company_name=company_name,
        plate_number=bus["plate_number"],
        bus_type=bus["bus_type"],
        total_seats=bus["total_seats"],
        brand=bus.get("brand"),
        model=bus.get("model"),
        year=bus.get("year"),
        amenities=bus.get("amenities", []),
        chassis_no=bus.get("chassis_no"),
        engine_no=bus.get("engine_no"),
        year_manufactured=bus.get("year_manufactured"),
        bus_category=bus.get("bus_category"),
        color=bus.get("color"),
        ownership_status=bus.get("ownership_status"),
        operation_start_date=bus.get("operation_start_date"),
        permit_no=bus.get("permit_no"),
        permit_expiry=bus.get("permit_expiry"),
        permit_document_url=bus.get("permit_document_url"),
        puspakom_date=bus.get("puspakom_date"),
        puspakom_result=bus.get("puspakom_result"),
        puspakom_document_url=bus.get("puspakom_document_url"),
        insurance_company=bus.get("insurance_company"),
        insurance_expiry=bus.get("insurance_expiry"),
        insurance_document_url=bus.get("insurance_document_url"),
        geran_document_url=bus.get("geran_document_url"),
        is_active=bus.get("is_active", True),
        created_at=bus.get("created_at", "")
    )


async def get_buses(
    db,
    company_id: Optional[str] = None,
    is_active: Optional[bool] = None
) -> List[BusResponse]:
    """Get all buses"""
    query = {}
    if company_id:
        query["company_id"] = ObjectId(company_id)
    if is_active is not None:
        query["is_active"] = is_active
    
    buses = await db.buses.find(query).to_list(200)
    result = []
    
    for bus in buses:
        company = await db.bus_companies.find_one({"_id": bus["company_id"]})
        company_name = company["name"] if company else "Unknown"
        result.append(_bus_to_response(bus, company_name))
    return result


async def create_bus(db, data: BusCreate, created_by: str) -> BusResponse:
    """Create new bus"""
    # Verify company exists
    company = await db.bus_companies.find_one({"_id": ObjectId(data.company_id)})
    if not company:
        raise HTTPException(status_code=404, detail="Syarikat bas tidak dijumpai")
    
    # Check for duplicate plate number
    existing = await db.buses.find_one({"plate_number": data.plate_number.upper()})
    if existing:
        raise HTTPException(status_code=400, detail="Nombor plat bas sudah didaftarkan")
    
    bus_doc = {
        "company_id": ObjectId(data.company_id),
        "plate_number": data.plate_number.upper(),
        "bus_type": data.bus_type,
        "total_seats": data.total_seats,
        "brand": data.brand,
        "model": data.model,
        "year": getattr(data, "year", None),
        "amenities": data.amenities or [],
        "chassis_no": getattr(data, "chassis_no", None),
        "engine_no": getattr(data, "engine_no", None),
        "year_manufactured": getattr(data, "year_manufactured", None),
        "bus_category": getattr(data, "bus_category", None),
        "color": getattr(data, "color", None),
        "ownership_status": getattr(data, "ownership_status", None),
        "operation_start_date": getattr(data, "operation_start_date", None),
        "permit_no": getattr(data, "permit_no", None),
        "permit_expiry": getattr(data, "permit_expiry", None),
        "permit_document_url": getattr(data, "permit_document_url", None),
        "puspakom_date": getattr(data, "puspakom_date", None),
        "puspakom_result": getattr(data, "puspakom_result", None),
        "puspakom_document_url": getattr(data, "puspakom_document_url", None),
        "insurance_company": getattr(data, "insurance_company", None),
        "insurance_expiry": getattr(data, "insurance_expiry", None),
        "insurance_document_url": getattr(data, "insurance_document_url", None),
        "geran_document_url": getattr(data, "geran_document_url", None),
        "is_active": True,
        "created_by": created_by,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.buses.insert_one(bus_doc)
    bus_doc["_id"] = result.inserted_id
    return _bus_to_response(bus_doc, company["name"])


async def get_bus(db, bus_id: str) -> BusResponse:
    """Get single bus"""
    bus = await db.buses.find_one({"_id": ObjectId(bus_id)})
    if not bus:
        raise HTTPException(status_code=404, detail="Bas tidak dijumpai")
    company = await db.bus_companies.find_one({"_id": bus["company_id"]})
    company_name = company["name"] if company else "Unknown"
    return _bus_to_response(bus, company_name)


async def update_bus(db, bus_id: str, data: BusUpdate) -> BusResponse:
    """Update bus"""
    bus = await db.buses.find_one({"_id": ObjectId(bus_id)})
    if not bus:
        raise HTTPException(status_code=404, detail="Bas tidak dijumpai")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if "plate_number" in update_data:
        update_data["plate_number"] = update_data["plate_number"].upper()
    
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.buses.update_one(
            {"_id": ObjectId(bus_id)},
            {"$set": update_data}
        )
    
    return await get_bus(db, bus_id)


async def delete_bus(db, bus_id: str) -> dict:
    """Delete bus"""
    bus = await db.buses.find_one({"_id": ObjectId(bus_id)})
    if not bus:
        raise HTTPException(status_code=404, detail="Bas tidak dijumpai")
    
    # Check for active trips
    trip_count = await db.bus_trips.count_documents({
        "bus_id": ObjectId(bus_id),
        "status": {"$in": ["scheduled", "in_progress"]}
    })
    if trip_count > 0:
        raise HTTPException(status_code=400, detail="Tidak boleh padam bas yang mempunyai trip aktif")
    
    await db.buses.delete_one({"_id": ObjectId(bus_id)})
    return {"message": "Bas berjaya dipadam"}


# ============ ROUTE ENDPOINTS ============

async def get_routes(
    db,
    company_id: Optional[str] = None,
    is_active: Optional[bool] = None
) -> List[RouteResponse]:
    """Get all routes"""
    query = {}
    if company_id:
        query["company_id"] = ObjectId(company_id)
    if is_active is not None:
        query["is_active"] = is_active
    
    routes = await db.bus_routes.find(query).to_list(200)
    result = []
    
    for route in routes:
        company = await db.bus_companies.find_one({"_id": route["company_id"]})
        company_name = company["name"] if company else "Unknown"
        
        drop_off_points = [
            DropOffPoint(**point) for point in route.get("drop_off_points", [])
        ]
        pickup_locations = [
            PickupPoint(**p) for p in route.get("pickup_locations", [])
        ]
        
        return_route_name = None
        if route.get("return_route_id"):
            return_route = await db.bus_routes.find_one({"_id": ObjectId(route["return_route_id"])})
            if return_route:
                return_route_name = return_route.get("name")
        
        result.append(RouteResponse(
            id=str(route["_id"]),
            company_id=str(route["company_id"]),
            company_name=company_name,
            name=route["name"],
            origin=route["origin"],
            destination=route["destination"],
            pickup_locations=pickup_locations,
            drop_off_points=drop_off_points,
            base_price=route["base_price"],
            estimated_duration=route.get("estimated_duration"),
            distance_km=route.get("distance_km"),
            is_active=route.get("is_active", True),
            trip_type=route.get("trip_type", "one_way"),
            return_route_id=str(route["return_route_id"]) if route.get("return_route_id") else None,
            return_route_name=return_route_name,
            created_at=route.get("created_at", "")
        ))
    
    return result


async def create_route(db, data: RouteCreate, created_by: str) -> RouteResponse:
    """Create new route"""
    # Verify company exists
    company = await db.bus_companies.find_one({"_id": ObjectId(data.company_id)})
    if not company:
        raise HTTPException(status_code=404, detail="Syarikat bas tidak dijumpai")
    
    trip_type = getattr(data, "trip_type", None) or "one_way"
    return_route_oid = None
    if trip_type == "return" and getattr(data, "return_route_id", None):
        try:
            return_route_oid = ObjectId(data.return_route_id)
        except Exception:
            pass
    
    pickup_locations = []
    if getattr(data, "pickup_locations", None):
        pickup_locations = [p.dict() for p in data.pickup_locations]
    
    route_doc = {
        "company_id": ObjectId(data.company_id),
        "name": data.name,
        "origin": data.origin,
        "destination": data.destination,
        "pickup_locations": pickup_locations,
        "drop_off_points": [point.dict() for point in data.drop_off_points],
        "base_price": data.base_price,
        "estimated_duration": data.estimated_duration,
        "distance_km": data.distance_km,
        "trip_type": trip_type,
        "return_route_id": return_route_oid,
        "is_active": True,
        "created_by": created_by,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.bus_routes.insert_one(route_doc)
    route_doc["_id"] = result.inserted_id
    
    return_route_name = None
    if return_route_oid:
        rr = await db.bus_routes.find_one({"_id": return_route_oid})
        if rr:
            return_route_name = rr.get("name")
    
    return RouteResponse(
        id=str(route_doc["_id"]),
        company_id=str(route_doc["company_id"]),
        company_name=company["name"],
        name=route_doc["name"],
        origin=route_doc["origin"],
        destination=route_doc["destination"],
        pickup_locations=[PickupPoint(**p) for p in pickup_locations],
        drop_off_points=data.drop_off_points,
        base_price=route_doc["base_price"],
        estimated_duration=route_doc.get("estimated_duration"),
        distance_km=route_doc.get("distance_km"),
        is_active=True,
        trip_type=trip_type,
        return_route_id=str(return_route_oid) if return_route_oid else None,
        return_route_name=return_route_name,
        created_at=route_doc["created_at"]
    )


async def get_route(db, route_id: str) -> RouteResponse:
    """Get single route"""
    route = await db.bus_routes.find_one({"_id": ObjectId(route_id)})
    if not route:
        raise HTTPException(status_code=404, detail="Route tidak dijumpai")
    
    company = await db.bus_companies.find_one({"_id": route["company_id"]})
    company_name = company["name"] if company else "Unknown"
    
    drop_off_points = [
        DropOffPoint(**point) for point in route.get("drop_off_points", [])
    ]
    pickup_locations = [
        PickupPoint(**p) for p in route.get("pickup_locations", [])
    ]
    
    return_route_name = None
    if route.get("return_route_id"):
        rr = await db.bus_routes.find_one({"_id": route["return_route_id"]})
        if rr:
            return_route_name = rr.get("name")
    
    return RouteResponse(
        id=str(route["_id"]),
        company_id=str(route["company_id"]),
        company_name=company_name,
        name=route["name"],
        origin=route["origin"],
        destination=route["destination"],
        pickup_locations=pickup_locations,
        drop_off_points=drop_off_points,
        base_price=route["base_price"],
        estimated_duration=route.get("estimated_duration"),
        distance_km=route.get("distance_km"),
        is_active=route.get("is_active", True),
        trip_type=route.get("trip_type", "one_way"),
        return_route_id=str(route["return_route_id"]) if route.get("return_route_id") else None,
        return_route_name=return_route_name,
        created_at=route.get("created_at", "")
    )


async def update_route(db, route_id: str, data: RouteUpdate) -> RouteResponse:
    """Update route"""
    route = await db.bus_routes.find_one({"_id": ObjectId(route_id)})
    if not route:
        raise HTTPException(status_code=404, detail="Route tidak dijumpai")
    
    update_data = {}
    for k, v in data.dict().items():
        if v is not None:
            if k == "drop_off_points":
                update_data[k] = [point.dict() for point in v]
            elif k == "pickup_locations":
                update_data[k] = [p.dict() for p in v]
            elif k == "return_route_id":
                update_data[k] = ObjectId(v) if v else None
            else:
                update_data[k] = v
    
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.bus_routes.update_one(
            {"_id": ObjectId(route_id)},
            {"$set": update_data}
        )
    
    return await get_route(db, route_id)


async def delete_route(db, route_id: str) -> dict:
    """Delete route"""
    route = await db.bus_routes.find_one({"_id": ObjectId(route_id)})
    if not route:
        raise HTTPException(status_code=404, detail="Route tidak dijumpai")
    
    # Check for active trips
    trip_count = await db.bus_trips.count_documents({
        "route_id": ObjectId(route_id),
        "status": {"$in": ["scheduled", "in_progress"]}
    })
    if trip_count > 0:
        raise HTTPException(status_code=400, detail="Tidak boleh padam route yang mempunyai trip aktif")
    
    await db.bus_routes.delete_one({"_id": ObjectId(route_id)})
    return {"message": "Route berjaya dipadam"}


# ============ TRIP ENDPOINTS ============

async def get_trips(
    db,
    route_id: Optional[str] = None,
    bus_id: Optional[str] = None,
    company_id: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
) -> List[TripResponse]:
    """Get all trips"""
    query = {}
    if route_id:
        query["route_id"] = ObjectId(route_id)
    if bus_id:
        query["bus_id"] = ObjectId(bus_id)
    if status:
        query["status"] = status
    if date_from:
        query["departure_date"] = {"$gte": date_from}
    if date_to:
        if "departure_date" in query:
            query["departure_date"]["$lte"] = date_to
        else:
            query["departure_date"] = {"$lte": date_to}
    
    trips = await db.bus_trips.find(query).sort("departure_date", 1).to_list(500)
    result = []
    
    for trip in trips:
        route = await db.bus_routes.find_one({"_id": trip["route_id"]})
        bus = await db.buses.find_one({"_id": trip["bus_id"]})
        company = await db.bus_companies.find_one({"_id": route["company_id"]}) if route else None
        
        # Filter by company_id if specified
        if company_id and company and str(company["_id"]) != company_id:
            continue
        
        # Count booked seats
        booked_count = await db.bus_bookings.count_documents({
            "trip_id": trip["_id"],
            "status": {"$nin": ["cancelled"]}
        })
        
        drop_off_points = [
            DropOffPoint(**point) for point in (route.get("drop_off_points", []) if route else [])
        ]
        
        result.append(TripResponse(
            id=str(trip["_id"]),
            route_id=str(trip["route_id"]),
            route_name=route["name"] if route else "Unknown",
            bus_id=str(trip["bus_id"]),
            bus_plate=bus["plate_number"] if bus else "Unknown",
            bus_type=bus["bus_type"] if bus else "Unknown",
            company_name=company["name"] if company else "Unknown",
            origin=route["origin"] if route else "Unknown",
            destination=route["destination"] if route else "Unknown",
            departure_date=trip["departure_date"],
            departure_time=trip["departure_time"],
            return_date=trip.get("return_date"),
            return_time=trip.get("return_time"),
            total_seats=bus["total_seats"] if bus else 0,
            available_seats=trip.get("available_seats", bus["total_seats"] if bus else 0) - booked_count,
            booked_seats=booked_count,
            status=trip.get("status", "scheduled"),
            drop_off_points=drop_off_points,
            created_at=trip.get("created_at", "")
        ))
    
    return result


async def create_trip(db, data: TripCreate, created_by: str) -> TripResponse:
    """Create new trip"""
    # Verify route exists
    route = await db.bus_routes.find_one({"_id": ObjectId(data.route_id)})
    if not route:
        raise HTTPException(status_code=404, detail="Route tidak dijumpai")
    
    # Verify bus exists
    bus = await db.buses.find_one({"_id": ObjectId(data.bus_id)})
    if not bus:
        raise HTTPException(status_code=404, detail="Bas tidak dijumpai")
    
    # Check bus belongs to same company as route
    if bus["company_id"] != route["company_id"]:
        raise HTTPException(status_code=400, detail="Bas tidak dimiliki oleh syarikat yang sama dengan route")
    
    trip_doc = {
        "route_id": ObjectId(data.route_id),
        "bus_id": ObjectId(data.bus_id),
        "departure_date": data.departure_date,
        "departure_time": data.departure_time,
        "return_date": data.return_date,
        "return_time": data.return_time,
        "available_seats": data.available_seats or bus["total_seats"],
        "status": "scheduled",
        "notes": data.notes,
        "created_by": created_by,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.bus_trips.insert_one(trip_doc)
    trip_doc["_id"] = result.inserted_id
    
    company = await db.bus_companies.find_one({"_id": route["company_id"]})
    drop_off_points = [DropOffPoint(**point) for point in route.get("drop_off_points", [])]
    
    return TripResponse(
        id=str(trip_doc["_id"]),
        route_id=str(trip_doc["route_id"]),
        route_name=route["name"],
        bus_id=str(trip_doc["bus_id"]),
        bus_plate=bus["plate_number"],
        bus_type=bus["bus_type"],
        company_name=company["name"] if company else "Unknown",
        origin=route["origin"],
        destination=route["destination"],
        departure_date=trip_doc["departure_date"],
        departure_time=trip_doc["departure_time"],
        return_date=trip_doc.get("return_date"),
        return_time=trip_doc.get("return_time"),
        total_seats=bus["total_seats"],
        available_seats=trip_doc["available_seats"],
        booked_seats=0,
        status="scheduled",
        drop_off_points=drop_off_points,
        created_at=trip_doc["created_at"]
    )


async def get_trip(db, trip_id: str) -> TripResponse:
    """Get single trip"""
    trip = await db.bus_trips.find_one({"_id": ObjectId(trip_id)})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip tidak dijumpai")
    
    route = await db.bus_routes.find_one({"_id": trip["route_id"]})
    bus = await db.buses.find_one({"_id": trip["bus_id"]})
    company = await db.bus_companies.find_one({"_id": route["company_id"]}) if route else None
    
    booked_count = await db.bus_bookings.count_documents({
        "trip_id": trip["_id"],
        "status": {"$nin": ["cancelled"]}
    })
    
    drop_off_points = [
        DropOffPoint(**point) for point in (route.get("drop_off_points", []) if route else [])
    ]
    
    return TripResponse(
        id=str(trip["_id"]),
        route_id=str(trip["route_id"]),
        route_name=route["name"] if route else "Unknown",
        bus_id=str(trip["bus_id"]),
        bus_plate=bus["plate_number"] if bus else "Unknown",
        bus_type=bus["bus_type"] if bus else "Unknown",
        company_name=company["name"] if company else "Unknown",
        origin=route["origin"] if route else "Unknown",
        destination=route["destination"] if route else "Unknown",
        departure_date=trip["departure_date"],
        departure_time=trip["departure_time"],
        return_date=trip.get("return_date"),
        return_time=trip.get("return_time"),
        total_seats=bus["total_seats"] if bus else 0,
        available_seats=trip.get("available_seats", bus["total_seats"] if bus else 0) - booked_count,
        booked_seats=booked_count,
        status=trip.get("status", "scheduled"),
        drop_off_points=drop_off_points,
        created_at=trip.get("created_at", "")
    )


async def update_trip(db, trip_id: str, data: TripUpdate) -> TripResponse:
    """Update trip"""
    trip = await db.bus_trips.find_one({"_id": ObjectId(trip_id)})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip tidak dijumpai")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    
    if "bus_id" in update_data:
        update_data["bus_id"] = ObjectId(update_data["bus_id"])
    
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.bus_trips.update_one(
            {"_id": ObjectId(trip_id)},
            {"$set": update_data}
        )
    
    return await get_trip(db, trip_id)


async def cancel_trip(db, trip_id: str, reason: str = None) -> dict:
    """Cancel trip"""
    trip = await db.bus_trips.find_one({"_id": ObjectId(trip_id)})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip tidak dijumpai")
    
    if trip.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Trip sudah dibatalkan")
    
    # Cancel all bookings for this trip
    await db.bus_bookings.update_many(
        {"trip_id": ObjectId(trip_id)},
        {"$set": {"status": "cancelled", "cancellation_reason": "Trip dibatalkan"}}
    )
    
    await db.bus_trips.update_one(
        {"_id": ObjectId(trip_id)},
        {"$set": {
            "status": "cancelled",
            "cancellation_reason": reason,
            "cancelled_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Trip berjaya dibatalkan"}


# ============ BOOKING ENDPOINTS ============

async def get_bookings(
    db,
    trip_id: Optional[str] = None,
    student_id: Optional[str] = None,
    parent_id: Optional[str] = None,
    status: Optional[str] = None
) -> List[BookingResponse]:
    """Get all bookings"""
    query = {}
    if trip_id:
        query["trip_id"] = ObjectId(trip_id)
    if student_id:
        query["student_id"] = ObjectId(student_id)
    if parent_id:
        query["parent_id"] = ObjectId(parent_id)
    if status:
        query["status"] = status
    
    bookings = await db.bus_bookings.find(query).sort("created_at", -1).to_list(500)
    result = []
    
    for booking in bookings:
        trip = await db.bus_trips.find_one({"_id": booking["trip_id"]})
        route = await db.bus_routes.find_one({"_id": trip["route_id"]}) if trip else None
        bus = await db.buses.find_one({"_id": trip["bus_id"]}) if trip else None
        company = await db.bus_companies.find_one({"_id": route["company_id"]}) if route else None
        student = await db.students.find_one({"_id": booking["student_id"]})
        parent = await db.users.find_one({"_id": booking["parent_id"]})
        
        # Get drop-off price
        drop_off_price = 0
        if route:
            for point in route.get("drop_off_points", []):
                if point["location"] == booking.get("drop_off_point"):
                    drop_off_price = point["price"]
                    break
        
        result.append(BookingResponse(
            id=str(booking["_id"]),
            booking_number=booking.get("booking_number", ""),
            trip_id=str(booking["trip_id"]),
            route_name=route["name"] if route else "Unknown",
            student_id=str(booking["student_id"]),
            student_name=student["full_name"] if student else "Unknown",
            student_matric=student["matric_number"] if student else "Unknown",
            parent_id=str(booking["parent_id"]),
            parent_name=parent["full_name"] if parent else "Unknown",
            company_name=company["name"] if company else "Unknown",
            bus_plate=bus["plate_number"] if bus else "Unknown",
            origin=route["origin"] if route else "Unknown",
            destination=route["destination"] if route else "Unknown",
            drop_off_point=booking.get("drop_off_point", ""),
            drop_off_price=drop_off_price,
            departure_date=trip["departure_date"] if trip else "",
            departure_time=trip["departure_time"] if trip else "",
            seat_preference=booking.get("seat_preference"),
            assigned_seat=booking.get("assigned_seat"),
            status=booking.get("status", "pending"),
            payment_status=booking.get("payment_status", "pending"),
            pulang_bermalam_approved=booking.get("pulang_bermalam_approved", False),
            created_at=booking.get("created_at", "")
        ))
    
    return result


async def create_booking(
    db,
    data: BookingCreate,
    parent_id: str
) -> BookingResponse:
    """Create new booking"""
    # Verify trip exists and is active
    trip = await db.bus_trips.find_one({"_id": ObjectId(data.trip_id)})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip tidak dijumpai")
    
    if trip.get("status") != "scheduled":
        raise HTTPException(status_code=400, detail="Trip tidak tersedia untuk tempahan")
    
    # Verify student exists and belongs to parent
    student = await db.students.find_one({"_id": ObjectId(data.student_id)})
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    
    if str(student.get("parent_id")) != parent_id:
        raise HTTPException(status_code=403, detail="Pelajar bukan anak anda")
    
    # Check available seats
    booked_count = await db.bus_bookings.count_documents({
        "trip_id": ObjectId(data.trip_id),
        "status": {"$nin": ["cancelled"]}
    })
    
    bus = await db.buses.find_one({"_id": trip["bus_id"]})
    available = trip.get("available_seats", bus["total_seats"] if bus else 0) - booked_count
    
    if available <= 0:
        raise HTTPException(status_code=400, detail="Tiada tempat duduk tersedia")
    
    # Check for existing booking for same student on same trip
    existing = await db.bus_bookings.find_one({
        "trip_id": ObjectId(data.trip_id),
        "student_id": ObjectId(data.student_id),
        "status": {"$nin": ["cancelled"]}
    })
    if existing:
        raise HTTPException(status_code=400, detail="Pelajar sudah mempunyai tempahan untuk trip ini")
    
    # Check pulang bermalam approval (optional for now)
    pulang_bermalam_approved = False
    if data.pulang_bermalam_id:
        pb_request = await db.hostel_records.find_one({
            "_id": ObjectId(data.pulang_bermalam_id),
            "student_id": ObjectId(data.student_id),
            "kategori": "pulang_bermalam",
            "status": "approved"
        })
        pulang_bermalam_approved = pb_request is not None
    
    route = await db.bus_routes.find_one({"_id": trip["route_id"]})
    
    # Get drop-off price
    drop_off_price = route["base_price"] if route else 0
    if route:
        for point in route.get("drop_off_points", []):
            if point["location"] == data.drop_off_point:
                drop_off_price = point["price"]
                break
    
    booking_doc = {
        "booking_number": generate_booking_number(),
        "trip_id": ObjectId(data.trip_id),
        "student_id": ObjectId(data.student_id),
        "parent_id": ObjectId(parent_id),
        "drop_off_point": data.drop_off_point,
        "drop_off_price": drop_off_price,
        "seat_preference": data.seat_preference,
        "assigned_seat": None,
        "status": "pending",
        "payment_status": "pending",
        "pulang_bermalam_id": data.pulang_bermalam_id,
        "pulang_bermalam_approved": pulang_bermalam_approved,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.bus_bookings.insert_one(booking_doc)
    booking_doc["_id"] = result.inserted_id
    
    company = await db.bus_companies.find_one({"_id": route["company_id"]}) if route else None
    parent = await db.users.find_one({"_id": ObjectId(parent_id)})
    
    return BookingResponse(
        id=str(booking_doc["_id"]),
        booking_number=booking_doc["booking_number"],
        trip_id=str(booking_doc["trip_id"]),
        route_name=route["name"] if route else "Unknown",
        student_id=str(booking_doc["student_id"]),
        student_name=student["full_name"],
        student_matric=student["matric_number"],
        parent_id=str(booking_doc["parent_id"]),
        parent_name=parent["full_name"] if parent else "Unknown",
        company_name=company["name"] if company else "Unknown",
        bus_plate=bus["plate_number"] if bus else "Unknown",
        origin=route["origin"] if route else "Unknown",
        destination=route["destination"] if route else "Unknown",
        drop_off_point=booking_doc["drop_off_point"],
        drop_off_price=drop_off_price,
        departure_date=trip["departure_date"],
        departure_time=trip["departure_time"],
        seat_preference=booking_doc.get("seat_preference"),
        assigned_seat=None,
        status="pending",
        payment_status="pending",
        pulang_bermalam_approved=pulang_bermalam_approved,
        created_at=booking_doc["created_at"]
    )


async def get_booking(db, booking_id: str) -> BookingResponse:
    """Get single booking"""
    booking = await db.bus_bookings.find_one({"_id": ObjectId(booking_id)})
    if not booking:
        raise HTTPException(status_code=404, detail="Tempahan tidak dijumpai")
    
    trip = await db.bus_trips.find_one({"_id": booking["trip_id"]})
    route = await db.bus_routes.find_one({"_id": trip["route_id"]}) if trip else None
    bus = await db.buses.find_one({"_id": trip["bus_id"]}) if trip else None
    company = await db.bus_companies.find_one({"_id": route["company_id"]}) if route else None
    student = await db.students.find_one({"_id": booking["student_id"]})
    parent = await db.users.find_one({"_id": booking["parent_id"]})
    
    drop_off_price = booking.get("drop_off_price", 0)
    
    return BookingResponse(
        id=str(booking["_id"]),
        booking_number=booking.get("booking_number", ""),
        trip_id=str(booking["trip_id"]),
        route_name=route["name"] if route else "Unknown",
        student_id=str(booking["student_id"]),
        student_name=student["full_name"] if student else "Unknown",
        student_matric=student["matric_number"] if student else "Unknown",
        parent_id=str(booking["parent_id"]),
        parent_name=parent["full_name"] if parent else "Unknown",
        company_name=company["name"] if company else "Unknown",
        bus_plate=bus["plate_number"] if bus else "Unknown",
        origin=route["origin"] if route else "Unknown",
        destination=route["destination"] if route else "Unknown",
        drop_off_point=booking.get("drop_off_point", ""),
        drop_off_price=drop_off_price,
        departure_date=trip["departure_date"] if trip else "",
        departure_time=trip["departure_time"] if trip else "",
        seat_preference=booking.get("seat_preference"),
        assigned_seat=booking.get("assigned_seat"),
        status=booking.get("status", "pending"),
        payment_status=booking.get("payment_status", "pending"),
        pulang_bermalam_approved=booking.get("pulang_bermalam_approved", False),
        created_at=booking.get("created_at", "")
    )


async def update_booking(
    db,
    booking_id: str,
    data: BookingUpdate
) -> BookingResponse:
    """Update booking (admin/bus company)"""
    booking = await db.bus_bookings.find_one({"_id": ObjectId(booking_id)})
    if not booking:
        raise HTTPException(status_code=404, detail="Tempahan tidak dijumpai")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.bus_bookings.update_one(
            {"_id": ObjectId(booking_id)},
            {"$set": update_data}
        )
    
    return await get_booking(db, booking_id)


async def assign_seat(
    db,
    booking_id: str,
    seat_number: str
) -> BookingResponse:
    """Assign seat to booking (bus company admin)"""
    booking = await db.bus_bookings.find_one({"_id": ObjectId(booking_id)})
    if not booking:
        raise HTTPException(status_code=404, detail="Tempahan tidak dijumpai")
    
    # Check if seat is already assigned to another booking
    existing = await db.bus_bookings.find_one({
        "trip_id": booking["trip_id"],
        "assigned_seat": seat_number,
        "_id": {"$ne": booking["_id"]},
        "status": {"$nin": ["cancelled"]}
    })
    if existing:
        raise HTTPException(status_code=400, detail="Tempat duduk sudah diberikan kepada penumpang lain")
    
    await db.bus_bookings.update_one(
        {"_id": ObjectId(booking_id)},
        {"$set": {
            "assigned_seat": seat_number,
            "status": "assigned",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return await get_booking(db, booking_id)


async def cancel_booking(db, booking_id: str, reason: str = None) -> dict:
    """Cancel booking"""
    booking = await db.bus_bookings.find_one({"_id": ObjectId(booking_id)})
    if not booking:
        raise HTTPException(status_code=404, detail="Tempahan tidak dijumpai")
    
    if booking.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Tempahan sudah dibatalkan")
    
    await db.bus_bookings.update_one(
        {"_id": ObjectId(booking_id)},
        {"$set": {
            "status": "cancelled",
            "cancellation_reason": reason,
            "cancelled_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Tempahan berjaya dibatalkan"}


# ============ PUBLIC ENDPOINTS (For Parents/Students) ============

async def get_available_trips(
    db,
    date_from: Optional[str] = None,
    destination: Optional[str] = None
) -> List[TripResponse]:
    """Get available trips for booking (public)"""
    query = {"status": "scheduled"}
    
    if date_from:
        query["departure_date"] = {"$gte": date_from}
    
    trips = await db.bus_trips.find(query).sort("departure_date", 1).to_list(100)
    result = []
    
    for trip in trips:
        route = await db.bus_routes.find_one({"_id": trip["route_id"]})
        
        # Filter by destination if specified
        if destination and route and destination.lower() not in route["destination"].lower():
            continue
        
        bus = await db.buses.find_one({"_id": trip["bus_id"]})
        company = await db.bus_companies.find_one({"_id": route["company_id"]}) if route else None
        
        booked_count = await db.bus_bookings.count_documents({
            "trip_id": trip["_id"],
            "status": {"$nin": ["cancelled"]}
        })
        
        available = trip.get("available_seats", bus["total_seats"] if bus else 0) - booked_count
        
        if available > 0:
            drop_off_points = [
                DropOffPoint(**point) for point in (route.get("drop_off_points", []) if route else [])
            ]
            
            result.append(TripResponse(
                id=str(trip["_id"]),
                route_id=str(trip["route_id"]),
                route_name=route["name"] if route else "Unknown",
                bus_id=str(trip["bus_id"]),
                bus_plate=bus["plate_number"] if bus else "Unknown",
                bus_type=bus["bus_type"] if bus else "Unknown",
                company_name=company["name"] if company else "Unknown",
                origin=route["origin"] if route else "Unknown",
                destination=route["destination"] if route else "Unknown",
                departure_date=trip["departure_date"],
                departure_time=trip["departure_time"],
                return_date=trip.get("return_date"),
                return_time=trip.get("return_time"),
                total_seats=bus["total_seats"] if bus else 0,
                available_seats=available,
                booked_seats=booked_count,
                status="scheduled",
                drop_off_points=drop_off_points,
                created_at=trip.get("created_at", "")
            ))
    
    return result


async def get_trip_seat_map(db, trip_id: str) -> dict:
    """Get seat map for a trip showing available/booked seats"""
    trip = await db.bus_trips.find_one({"_id": ObjectId(trip_id)})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip tidak dijumpai")
    
    bus = await db.buses.find_one({"_id": trip["bus_id"]})
    if not bus:
        raise HTTPException(status_code=404, detail="Bas tidak dijumpai")
    
    # Get all bookings for this trip
    bookings = await db.bus_bookings.find({
        "trip_id": ObjectId(trip_id),
        "status": {"$nin": ["cancelled"]}
    }).to_list(100)
    
    booked_seats = {b.get("assigned_seat"): str(b["_id"]) for b in bookings if b.get("assigned_seat")}
    
    # Generate seat layout
    total_seats = bus["total_seats"]
    bus_type = bus["bus_type"]
    
    seats = []
    columns = ["A", "B", "C", "D"]  # 4 seats per row
    rows = (total_seats + 3) // 4  # Calculate number of rows
    
    seat_num = 1
    for row in range(1, rows + 1):
        for col in columns:
            if seat_num <= total_seats:
                seat_id = f"{row}{col}"
                seats.append({
                    "seat_id": seat_id,
                    "row": row,
                    "column": col,
                    "is_booked": seat_id in booked_seats,
                    "booking_id": booked_seats.get(seat_id)
                })
                seat_num += 1
    
    return {
        "trip_id": trip_id,
        "bus_type": bus_type,
        "total_seats": total_seats,
        "booked_count": len(booked_seats),
        "available_count": total_seats - len(booked_seats),
        "seats": seats,
        "layout": {
            "rows": rows,
            "columns": columns,
            "type": bus_type
        }
    }


# ============ DRIVER BAS & LIVE LOCATION ============

async def get_driver_trips(db, driver_user: dict) -> List[dict]:
    """Get trips for driver's assigned bus (today and upcoming, scheduled/in_progress)."""
    bus_id = driver_user.get("assigned_bus_id")
    if not bus_id:
        return []
    try:
        bus_oid = ObjectId(bus_id) if isinstance(bus_id, str) else bus_id
    except Exception:
        return []
    from datetime import date
    today = date.today().isoformat()
    trips = await db.bus_trips.find({
        "bus_id": bus_oid,
        "departure_date": {"$gte": today},
        "status": {"$in": ["scheduled", "in_progress"]}
    }).sort("departure_date", 1).sort("departure_time", 1).to_list(50)
    result = []
    for trip in trips:
        route = await db.bus_routes.find_one({"_id": trip["route_id"]})
        bus = await db.buses.find_one({"_id": trip["bus_id"]})
        company = await db.bus_companies.find_one({"_id": route["company_id"]}) if route else None
        booked_count = await db.bus_bookings.count_documents({
            "trip_id": trip["_id"],
            "status": {"$nin": ["cancelled"]}
        })
        total_seats = bus["total_seats"] if bus else 0
        result.append({
            "id": str(trip["_id"]),
            "route_name": route["name"] if route else "Unknown",
            "bus_plate": bus["plate_number"] if bus else "Unknown",
            "company_name": company["name"] if company else "Unknown",
            "origin": route["origin"] if route else "",
            "destination": route["destination"] if route else "",
            "departure_date": trip["departure_date"],
            "departure_time": trip["departure_time"],
            "status": trip.get("status", "scheduled"),
            "total_seats": total_seats,
            "booked_seats": booked_count,
            "drop_off_points": route.get("drop_off_points", []) if route else []
        })
    return result


async def get_trip_students_for_driver(db, trip_id: str, driver_user: dict) -> dict:
    """List of students on this trip (for driver), with drop-off checkpoint. Driver must be assigned to this trip's bus."""
    trip = await db.bus_trips.find_one({"_id": ObjectId(trip_id)})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip tidak dijumpai")
    bus_id = driver_user.get("assigned_bus_id")
    bus_oid = ObjectId(bus_id) if bus_id and isinstance(bus_id, str) else bus_id
    if not bus_oid or trip["bus_id"] != bus_oid:
        raise HTTPException(status_code=403, detail="Anda tidak ditugaskan ke bas trip ini")
    route = await db.bus_routes.find_one({"_id": trip["route_id"]})
    bus = await db.buses.find_one({"_id": trip["bus_id"]})
    bookings = await db.bus_bookings.find({
        "trip_id": ObjectId(trip_id),
        "status": {"$nin": ["cancelled"]}
    }).to_list(100)
    students = []
    for b in bookings:
        student = await db.students.find_one({"_id": b["student_id"]})
        students.append({
            "booking_id": str(b["_id"]),
            "student_name": student["full_name"] if student else "Unknown",
            "matric_number": student.get("matric_number", "") if student else "",
            "drop_off_point": b.get("drop_off_point", ""),
            "assigned_seat": b.get("assigned_seat")
        })
    # Count by drop-off for "bilangan pelajar mencukupi" per checkpoint
    by_checkpoint = {}
    for s in students:
        cp = s["drop_off_point"] or "Lain"
        by_checkpoint[cp] = by_checkpoint.get(cp, 0) + 1
    return {
        "trip_id": trip_id,
        "bus_plate": bus["plate_number"] if bus else "Unknown",
        "route_name": route["name"] if route else "Unknown",
        "origin": route["origin"] if route else "",
        "destination": route["destination"] if route else "",
        "departure_date": trip["departure_date"],
        "departure_time": trip["departure_time"],
        "total_seats": bus["total_seats"] if bus else 0,
        "student_count": len(students),
        "students": students,
        "drop_off_points": route.get("drop_off_points", []) if route else [],
        "count_by_checkpoint": by_checkpoint
    }


async def update_bus_live_location(db, trip_id: str, lat: float, lng: float, driver_user: dict) -> dict:
    """Driver updates current bus location (live tracking)."""
    trip = await db.bus_trips.find_one({"_id": ObjectId(trip_id)})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip tidak dijumpai")
    bus_id = driver_user.get("assigned_bus_id")
    bus_oid = ObjectId(bus_id) if bus_id and isinstance(bus_id, str) else bus_id
    if not bus_oid or trip["bus_id"] != bus_oid:
        raise HTTPException(status_code=403, detail="Anda tidak ditugaskan ke bas trip ini")
    bus = await db.buses.find_one({"_id": trip["bus_id"]})
    plate = bus["plate_number"] if bus else "Unknown"
    now = datetime.now(timezone.utc).isoformat()
    await db.bus_live_locations.update_one(
        {"trip_id": ObjectId(trip_id)},
        {"$set": {
            "trip_id": ObjectId(trip_id),
            "bus_id": trip["bus_id"],
            "plate_number": plate,
            "lat": lat,
            "lng": lng,
            "updated_at": now
        }},
        upsert=True
    )
    return {"ok": True, "updated_at": now}


async def get_bus_live_location(db, trip_id: str) -> Optional[dict]:
    """Get current live location for a trip (for parent map)."""
    doc = await db.bus_live_locations.find_one({"trip_id": ObjectId(trip_id)})
    if not doc:
        return None
    return {
        "trip_id": trip_id,
        "bus_id": str(doc["bus_id"]),
        "plate_number": doc.get("plate_number", ""),
        "lat": doc.get("lat"),
        "lng": doc.get("lng"),
        "updated_at": doc.get("updated_at")
    }


async def get_trip_for_live_map(db, trip_id: str) -> Optional[dict]:
    """Get trip summary + route drop_off_points for parent live map (no auth required if trip_id known)."""
    trip = await db.bus_trips.find_one({"_id": ObjectId(trip_id)})
    if not trip:
        return None
    route = await db.bus_routes.find_one({"_id": trip["route_id"]})
    bus = await db.buses.find_one({"_id": trip["bus_id"]})
    return {
        "trip_id": trip_id,
        "bus_plate": bus["plate_number"] if bus else "Unknown",
        "route_name": route["name"] if route else "Unknown",
        "origin": route["origin"] if route else "",
        "destination": route["destination"] if route else "",
        "departure_date": trip["departure_date"],
        "departure_time": trip["departure_time"],
        "drop_off_points": route.get("drop_off_points", []) if route else []
    }
