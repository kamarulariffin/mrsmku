"""
Complaints Routes - Modul Aduan Digital
MRSMKU Smart360
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import uuid

from models.complaints import (
    ComplaintCreate, ComplaintStatusUpdate, ComplaintActionCreate,
    ComplaintResponse, ComplaintDetailResponse,
    ComplaintStatus, ComplaintPriority,
    COMPLAINT_TYPE_DISPLAY, COMPLAINT_PRIORITY_DISPLAY, COMPLAINT_STATUS_DISPLAY,
    COMPLAINT_GUIDELINES
)

router = APIRouter(prefix="/api/complaints", tags=["Complaints"])
security = HTTPBearer()

# These will be set from server.py
_get_db_func = None
_get_current_user_func = None
_log_audit_func = None


def init_router(get_db_func, current_user_dep, permission_dep, audit_func):
    global _get_db_func, _get_current_user_func, _log_audit_func
    _get_db_func = get_db_func
    _get_current_user_func = current_user_dep
    _log_audit_func = audit_func


def get_db():
    """Get database instance"""
    return _get_db_func()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current user from token"""
    return await _get_current_user_func(credentials)


async def log_audit(user, action, module, details):
    """Log audit entry"""
    if _log_audit_func:
        await _log_audit_func(user, action, module, details)


def generate_complaint_number():
    """Generate unique complaint number: ADU-YYYYMMDD-XXXX"""
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    random_suffix = uuid.uuid4().hex[:4].upper()
    return f"ADU-{today}-{random_suffix}"


def serialize_complaint(complaint: dict, include_details: bool = False) -> dict:
    """Serialize complaint document to response"""
    response = ComplaintResponse(
        id=str(complaint["_id"]),
        nombor_aduan=complaint.get("nombor_aduan", ""),
        nama_pengadu=complaint.get("nama_pengadu", ""),
        hubungan=complaint.get("hubungan", ""),
        nombor_maktab=complaint.get("nombor_maktab", ""),
        nama_pelajar=complaint.get("nama_pelajar", ""),
        tingkatan=complaint.get("tingkatan", 1),
        asrama=complaint.get("asrama", ""),
        jenis_aduan=complaint.get("jenis_aduan", ""),
        jenis_aduan_display=COMPLAINT_TYPE_DISPLAY.get(complaint.get("jenis_aduan", ""), complaint.get("jenis_aduan", "")),
        penerangan=complaint.get("penerangan", ""),
        gambar_sokongan=complaint.get("gambar_sokongan", []),
        tahap_keutamaan=complaint.get("tahap_keutamaan", "sederhana"),
        tahap_keutamaan_display=COMPLAINT_PRIORITY_DISPLAY.get(complaint.get("tahap_keutamaan", ""), ""),
        status=complaint.get("status", "baru_dihantar"),
        status_display=COMPLAINT_STATUS_DISPLAY.get(complaint.get("status", ""), ""),
        warden_assigned=complaint.get("warden_assigned"),
        warden_name=complaint.get("warden_name"),
        created_at=complaint.get("created_at", ""),
        updated_at=complaint.get("updated_at", ""),
        pengadu_id=str(complaint.get("pengadu_id", "")) if complaint.get("pengadu_id") else None
    )
    
    result = response.dict()
    
    # Include guideline reference if status is "di_luar_bidang"
    if complaint.get("guideline_reference"):
        result["guideline_reference"] = complaint.get("guideline_reference")
    
    if include_details:
        detail_response = ComplaintDetailResponse(
            **response.dict(),
            audit_log=complaint.get("audit_log", []),
            tindakan_list=complaint.get("tindakan_list", [])
        ).dict()
        if complaint.get("guideline_reference"):
            detail_response["guideline_reference"] = complaint.get("guideline_reference")
        return detail_response
    
    return result


async def get_duty_warden_for_block(block_code: str):
    """Get the current duty warden for a specific block"""
    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")
    
    # Find active schedule for today
    schedule = await get_db().warden_schedules.find_one({
        "tarikh_mula": {"$lte": today_str},
        "tarikh_tamat": {"$gte": today_str},
        "is_active": True,
        "$or": [
            {"blok_assigned": {"$in": [block_code]}},
            {"blok_assigned": {"$size": 0}}  # Assigned to all blocks
        ]
    })
    
    if schedule:
        warden = await get_db().users.find_one({"_id": ObjectId(schedule["warden_id"])})
        if warden:
            return {
                "warden_id": str(warden["_id"]),
                "warden_name": warden.get("full_name", ""),
                "warden_phone": warden.get("phone", "")
            }
    
    return None


async def auto_assign_warden(complaint_data: dict):
    """Auto-assign complaint to duty warden based on block"""
    block_code = complaint_data.get("asrama", "")
    duty_warden = await get_duty_warden_for_block(block_code)
    
    if duty_warden:
        return duty_warden
    
    # Fallback: Find any available warden
    warden = await get_db().users.find_one({"role": "warden", "is_active": True})
    if warden:
        return {
            "warden_id": str(warden["_id"]),
            "warden_name": warden.get("full_name", ""),
            "warden_phone": warden.get("phone", "")
        }
    
    return None


# ============ PUBLIC ENDPOINTS ============

@router.get("/types")
async def get_complaint_types():
    """Get all complaint types"""
    return {
        "types": COMPLAINT_TYPE_DISPLAY,
        "priorities": COMPLAINT_PRIORITY_DISPLAY,
        "statuses": COMPLAINT_STATUS_DISPLAY
    }


@router.get("/guidelines")
async def get_complaint_guidelines():
    """Get complaint guidelines/peraturan for reference"""
    return {
        "guidelines": COMPLAINT_GUIDELINES
    }


@router.get("/guidelines/{jenis_aduan}")
async def get_guideline_by_type(jenis_aduan: str):
    """Get specific guideline by complaint type"""
    if jenis_aduan not in COMPLAINT_GUIDELINES:
        raise HTTPException(status_code=404, detail="Panduan tidak dijumpai")
    return {
        "guideline": COMPLAINT_GUIDELINES[jenis_aduan]
    }


# ============ COMPLAINT CRUD ============

@router.post("", response_model=dict)
async def create_complaint(
    complaint_data: ComplaintCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create new complaint - Ibu Bapa, Pelajar, Muafakat"""
    # Auto-assign to duty warden
    assigned_warden = await auto_assign_warden(complaint_data.dict())
    
    now = datetime.now(timezone.utc).isoformat()
    complaint_doc = {
        "nombor_aduan": generate_complaint_number(),
        "nama_pengadu": complaint_data.nama_pengadu,
        "hubungan": complaint_data.hubungan.value,
        "nombor_maktab": complaint_data.nombor_maktab,
        "nama_pelajar": complaint_data.nama_pelajar,
        "tingkatan": complaint_data.tingkatan,
        "asrama": complaint_data.asrama,
        "jenis_aduan": complaint_data.jenis_aduan.value,
        "penerangan": complaint_data.penerangan,
        "gambar_sokongan": complaint_data.gambar_sokongan or [],
        "tahap_keutamaan": complaint_data.tahap_keutamaan.value,
        "status": ComplaintStatus.BARU_DIHANTAR.value,
        "warden_assigned": assigned_warden.get("warden_id") if assigned_warden else None,
        "warden_name": assigned_warden.get("warden_name") if assigned_warden else None,
        "pengadu_id": current_user["_id"],
        "audit_log": [{
            "action": "CREATED",
            "user_id": str(current_user["_id"]),
            "user_name": current_user.get("full_name", ""),
            "timestamp": now,
            "details": "Aduan baru dihantar"
        }],
        "tindakan_list": [],
        "created_at": now,
        "updated_at": now
    }
    
    result = await get_db().complaints.insert_one(complaint_doc)
    complaint_doc["_id"] = result.inserted_id
    
    # Create notification for assigned warden
    if assigned_warden:
        await get_db().notifications.insert_one({
            "user_id": ObjectId(assigned_warden["warden_id"]),
            "title": "Aduan Baru Diterima",
            "message": f"Aduan {complaint_doc['nombor_aduan']} telah diberikan kepada anda. Keutamaan: {COMPLAINT_PRIORITY_DISPLAY.get(complaint_data.tahap_keutamaan.value, '')}",
            "type": "action",
            "is_read": False,
            "created_at": now
        })
    
    # Audit log
    await log_audit(current_user, "CREATE_COMPLAINT", "complaints", f"Aduan baru: {complaint_doc['nombor_aduan']}")
    
    return {
        "message": "Aduan berjaya dihantar",
        "complaint": serialize_complaint(complaint_doc)
    }


@router.get("", response_model=dict)
async def list_complaints(
    status: Optional[str] = None,
    jenis_aduan: Optional[str] = None,
    tahap_keutamaan: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """List complaints - filtered by role"""
    query = {}
    role = current_user.get("role", "")
    
    # Role-based filtering
    if role in ["parent", "pelajar"]:
        # Parents and students only see their own complaints
        query["pengadu_id"] = current_user["_id"]
    elif role == "warden":
        # Wardens see complaints assigned to them
        query["warden_assigned"] = str(current_user["_id"])
    # Admin, SuperAdmin see all
    
    # Apply filters
    if status:
        query["status"] = status
    if jenis_aduan:
        query["jenis_aduan"] = jenis_aduan
    if tahap_keutamaan:
        query["tahap_keutamaan"] = tahap_keutamaan
    if search:
        query["$or"] = [
            {"nombor_aduan": {"$regex": search, "$options": "i"}},
            {"nama_pengadu": {"$regex": search, "$options": "i"}},
            {"nama_pelajar": {"$regex": search, "$options": "i"}},
            {"penerangan": {"$regex": search, "$options": "i"}}
        ]
    
    # Pagination
    skip = (page - 1) * limit
    total = await get_db().complaints.count_documents(query)
    
    complaints = await get_db().complaints.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {
        "complaints": [serialize_complaint(c) for c in complaints],
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": (total + limit - 1) // limit
        }
    }


@router.get("/my-complaints", response_model=dict)
async def get_my_complaints(
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """Get complaints submitted by current user"""
    query = {"pengadu_id": current_user["_id"]}
    
    if status:
        query["status"] = status
    
    skip = (page - 1) * limit
    total = await get_db().complaints.count_documents(query)
    
    complaints = await get_db().complaints.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {
        "complaints": [serialize_complaint(c) for c in complaints],
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": (total + limit - 1) // limit
        }
    }


@router.get("/{complaint_id}", response_model=dict)
async def get_complaint_detail(
    complaint_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get complaint details with audit log and actions"""
    complaint = await get_db().complaints.find_one({"_id": ObjectId(complaint_id)})
    if not complaint:
        raise HTTPException(status_code=404, detail="Aduan tidak dijumpai")
    
    # Check access
    role = current_user.get("role", "")
    if role in ["parent", "pelajar"]:
        if complaint.get("pengadu_id") != current_user["_id"]:
            raise HTTPException(status_code=403, detail="Tiada akses kepada aduan ini")
    elif role == "warden":
        if complaint.get("warden_assigned") != str(current_user["_id"]):
            # Allow warden to see if they are admin too
            if role not in ["admin", "superadmin"]:
                raise HTTPException(status_code=403, detail="Tiada akses kepada aduan ini")
    
    return {"complaint": serialize_complaint(complaint, include_details=True)}


@router.put("/{complaint_id}/status", response_model=dict)
async def update_complaint_status(
    complaint_id: str,
    status_update: ComplaintStatusUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update complaint status - Warden, Admin"""
    role = current_user.get("role", "")
    if role not in ["warden", "admin", "superadmin", "guru_asrama"]:
        raise HTTPException(status_code=403, detail="Tiada kebenaran untuk kemaskini status")
    
    complaint = await get_db().complaints.find_one({"_id": ObjectId(complaint_id)})
    if not complaint:
        raise HTTPException(status_code=404, detail="Aduan tidak dijumpai")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Add to audit log
    audit_entry = {
        "action": "STATUS_CHANGE",
        "user_id": str(current_user["_id"]),
        "user_name": current_user.get("full_name", ""),
        "timestamp": now,
        "details": f"Status berubah dari {COMPLAINT_STATUS_DISPLAY.get(complaint['status'], '')} ke {COMPLAINT_STATUS_DISPLAY.get(status_update.status.value, '')}",
        "catatan": status_update.catatan
    }
    
    update_data = {
        "status": status_update.status.value,
        "updated_at": now
    }
    
    # If status is "di_luar_bidang", add guideline reference
    if status_update.status.value == "di_luar_bidang":
        jenis_aduan = complaint.get("jenis_aduan", "lain_lain")
        guideline = COMPLAINT_GUIDELINES.get(jenis_aduan, COMPLAINT_GUIDELINES["lain_lain"])
        update_data["guideline_reference"] = {
            "jenis_aduan": jenis_aduan,
            "title": guideline["title"],
            "items": guideline["items"],
            "contact": guideline["contact"]
        }
    
    await get_db().complaints.update_one(
        {"_id": ObjectId(complaint_id)},
        {
            "$set": update_data,
            "$push": {"audit_log": audit_entry}
        }
    )
    
    # Notify complainant
    if complaint.get("pengadu_id"):
        notification_message = f"Aduan {complaint['nombor_aduan']} kini berstatus: {COMPLAINT_STATUS_DISPLAY.get(status_update.status.value, '')}"
        
        # Special message for "di_luar_bidang"
        if status_update.status.value == "di_luar_bidang":
            jenis_aduan = complaint.get("jenis_aduan", "lain_lain")
            guideline = COMPLAINT_GUIDELINES.get(jenis_aduan, COMPLAINT_GUIDELINES["lain_lain"])
            notification_message = f"Aduan {complaint['nombor_aduan']} telah ditandakan 'Di Luar Bidang Tugas Warden'. Sila rujuk '{guideline['title']}' untuk panduan berkaitan. {guideline['contact']}"
        
        await get_db().notifications.insert_one({
            "user_id": complaint["pengadu_id"],
            "title": "Status Aduan Dikemaskini",
            "message": notification_message,
            "type": "info",
            "is_read": False,
            "created_at": now
        })
    
    await log_audit(current_user, "UPDATE_COMPLAINT_STATUS", "complaints", f"Aduan {complaint['nombor_aduan']} status: {status_update.status.value}")
    
    updated = await get_db().complaints.find_one({"_id": ObjectId(complaint_id)})
    return {"message": "Status berjaya dikemaskini", "complaint": serialize_complaint(updated, include_details=True)}


@router.post("/{complaint_id}/action", response_model=dict)
async def add_complaint_action(
    complaint_id: str,
    action_data: ComplaintActionCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add action/response to complaint - Warden, Admin"""
    role = current_user.get("role", "")
    if role not in ["warden", "admin", "superadmin", "guru_asrama"]:
        raise HTTPException(status_code=403, detail="Tiada kebenaran untuk menambah tindakan")
    
    complaint = await get_db().complaints.find_one({"_id": ObjectId(complaint_id)})
    if not complaint:
        raise HTTPException(status_code=404, detail="Aduan tidak dijumpai")
    
    now = datetime.now(timezone.utc).isoformat()
    
    action_entry = {
        "id": uuid.uuid4().hex[:8],
        "tindakan": action_data.tindakan,
        "bukti_tindakan": action_data.bukti_tindakan or [],
        "respon_kepada_ibubapa": action_data.respon_kepada_ibubapa,
        "user_id": str(current_user["_id"]),
        "user_name": current_user.get("full_name", ""),
        "timestamp": now
    }
    
    audit_entry = {
        "action": "ACTION_ADDED",
        "user_id": str(current_user["_id"]),
        "user_name": current_user.get("full_name", ""),
        "timestamp": now,
        "details": f"Tindakan ditambah: {action_data.tindakan[:50]}..."
    }
    
    await get_db().complaints.update_one(
        {"_id": ObjectId(complaint_id)},
        {
            "$set": {"updated_at": now},
            "$push": {
                "tindakan_list": action_entry,
                "audit_log": audit_entry
            }
        }
    )
    
    # Notify complainant if there's a response
    if action_data.respon_kepada_ibubapa and complaint.get("pengadu_id"):
        await get_db().notifications.insert_one({
            "user_id": complaint["pengadu_id"],
            "title": "Respon Warden untuk Aduan Anda",
            "message": action_data.respon_kepada_ibubapa,
            "type": "info",
            "is_read": False,
            "created_at": now
        })
    
    await log_audit(current_user, "ADD_COMPLAINT_ACTION", "complaints", f"Tindakan untuk aduan {complaint['nombor_aduan']}")
    
    updated = await get_db().complaints.find_one({"_id": ObjectId(complaint_id)})
    return {"message": "Tindakan berjaya ditambah", "complaint": serialize_complaint(updated, include_details=True)}



# ============ PARENT FEEDBACK ============

@router.post("/{complaint_id}/feedback", response_model=dict)
async def submit_complaint_feedback(
    complaint_id: str,
    rating: int = Query(..., ge=1, le=5, description="Rating 1-5"),
    komen: Optional[str] = Query(None, description="Komen tambahan"),
    current_user: dict = Depends(get_current_user)
):
    """Submit feedback for a complaint - Only the complainant"""
    complaint = await get_db().complaints.find_one({"_id": ObjectId(complaint_id)})
    if not complaint:
        raise HTTPException(status_code=404, detail="Aduan tidak dijumpai")
    
    # Check if user is the complainant
    if complaint.get("pengadu_id") != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Hanya pengadu boleh berikan maklum balas")
    
    # Check if feedback already given
    if complaint.get("feedback_given"):
        raise HTTPException(status_code=400, detail="Maklum balas sudah diberikan")
    
    now = datetime.now(timezone.utc).isoformat()
    
    feedback_data = {
        "rating": rating,
        "komen": komen,
        "user_id": str(current_user["_id"]),
        "user_name": current_user.get("full_name", ""),
        "timestamp": now
    }
    
    audit_entry = {
        "action": "FEEDBACK_SUBMITTED",
        "user_id": str(current_user["_id"]),
        "user_name": current_user.get("full_name", ""),
        "timestamp": now,
        "details": f"Maklum balas diberikan: {rating}/5 bintang"
    }
    
    await get_db().complaints.update_one(
        {"_id": ObjectId(complaint_id)},
        {
            "$set": {
                "feedback": feedback_data,
                "feedback_given": True,
                "updated_at": now
            },
            "$push": {"audit_log": audit_entry}
        }
    )
    
    # Notify warden about feedback
    if complaint.get("warden_assigned"):
        await get_db().notifications.insert_one({
            "user_id": ObjectId(complaint["warden_assigned"]),
            "title": "Maklum Balas Diterima",
            "message": f"Pengadu telah memberikan rating {rating}/5 untuk aduan {complaint['nombor_aduan']}",
            "type": "info",
            "is_read": False,
            "created_at": now
        })
    
    await log_audit(current_user, "SUBMIT_FEEDBACK", "complaints", f"Maklum balas untuk aduan {complaint['nombor_aduan']}: {rating}/5")
    
    return {"message": "Maklum balas berjaya dihantar"}



# ============ BULK ACTIONS ============

@router.get("/trending/categories", response_model=dict)
async def get_trending_complaint_categories(
    limit: int = Query(3, ge=1, le=10),
    current_user: dict = Depends(get_current_user)
):
    """Get top trending complaint categories (most complaints) - Warden, Admin"""
    role = current_user.get("role", "")
    if role not in ["warden", "admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Tiada kebenaran")
    
    # Only count unresolved complaints
    pipeline = [
        {"$match": {"status": {"$nin": ["selesai", "ditutup"]}}},
        {"$group": {
            "_id": "$jenis_aduan",
            "count": {"$sum": 1},
            "complaint_ids": {"$push": {"$toString": "$_id"}},
            "latest": {"$max": "$created_at"}
        }},
        {"$sort": {"count": -1}},
        {"$limit": limit}
    ]
    
    results = await get_db().complaints.aggregate(pipeline).to_list(limit)
    
    trending = []
    for r in results:
        if r["count"] >= 2:  # Only show if 2 or more complaints
            trending.append({
                "jenis_aduan": r["_id"],
                "jenis_aduan_display": COMPLAINT_TYPE_DISPLAY.get(r["_id"], r["_id"]),
                "count": r["count"],
                "complaint_ids": r["complaint_ids"][:20],  # Limit to 20 IDs
                "latest": r["latest"],
                "can_bulk_action": r["count"] >= 2
            })
    
    return {"trending": trending}


@router.post("/bulk-action", response_model=dict)
async def bulk_update_complaints(
    jenis_aduan: str = Query(..., description="Jenis aduan untuk dikemaskini"),
    status: str = Query(..., description="Status baharu"),
    tindakan: str = Query(..., min_length=5, description="Penerangan tindakan"),
    respon_kepada_semua: Optional[str] = Query(None, description="Mesej kepada semua pengadu"),
    current_user: dict = Depends(get_current_user)
):
    """Bulk update all complaints of a specific type - Warden, Admin"""
    role = current_user.get("role", "")
    if role not in ["warden", "admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Tiada kebenaran untuk tindakan pukal")
    
    # Validate status
    valid_statuses = ["dalam_tindakan", "selesai", "ditutup"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status tidak sah. Pilih: {', '.join(valid_statuses)}")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Find all unresolved complaints of this type
    query = {
        "jenis_aduan": jenis_aduan,
        "status": {"$nin": ["selesai", "ditutup"]}
    }
    
    # If warden, only update complaints assigned to them
    if role == "warden":
        query["warden_assigned"] = str(current_user["_id"])
    
    complaints = await get_db().complaints.find(query).to_list(100)
    
    if not complaints:
        raise HTTPException(status_code=404, detail="Tiada aduan dijumpai untuk kategori ini")
    
    updated_count = 0
    notified_users = set()
    
    for complaint in complaints:
        # Create action entry
        action_entry = {
            "id": uuid.uuid4().hex[:8],
            "tindakan": f"[TINDAKAN PUKAL] {tindakan}",
            "bukti_tindakan": [],
            "respon_kepada_ibubapa": respon_kepada_semua,
            "user_id": str(current_user["_id"]),
            "user_name": current_user.get("full_name", ""),
            "timestamp": now,
            "is_bulk_action": True
        }
        
        # Create audit entry
        audit_entry = {
            "action": "BULK_STATUS_CHANGE",
            "user_id": str(current_user["_id"]),
            "user_name": current_user.get("full_name", ""),
            "timestamp": now,
            "details": f"Tindakan Pukal: Status berubah ke {COMPLAINT_STATUS_DISPLAY.get(status, status)}"
        }
        
        # Update the complaint
        await get_db().complaints.update_one(
            {"_id": complaint["_id"]},
            {
                "$set": {
                    "status": status,
                    "updated_at": now
                },
                "$push": {
                    "tindakan_list": action_entry,
                    "audit_log": audit_entry
                }
            }
        )
        updated_count += 1
        
        # Notify complainant (avoid duplicate notifications)
        if complaint.get("pengadu_id") and str(complaint["pengadu_id"]) not in notified_users:
            notification_message = respon_kepada_semua or f"Aduan {COMPLAINT_TYPE_DISPLAY.get(jenis_aduan, jenis_aduan)} anda telah dikemaskini. Status: {COMPLAINT_STATUS_DISPLAY.get(status, status)}"
            
            await get_db().notifications.insert_one({
                "user_id": complaint["pengadu_id"],
                "title": f"Kemaskini Aduan {COMPLAINT_TYPE_DISPLAY.get(jenis_aduan, jenis_aduan)}",
                "message": notification_message,
                "type": "info",
                "is_read": False,
                "created_at": now
            })
            notified_users.add(str(complaint["pengadu_id"]))
    
    await log_audit(
        current_user, 
        "BULK_UPDATE_COMPLAINTS", 
        "complaints", 
        f"Tindakan pukal untuk {updated_count} aduan {COMPLAINT_TYPE_DISPLAY.get(jenis_aduan, jenis_aduan)}"
    )
    
    return {
        "message": f"Berjaya kemaskini {updated_count} aduan",
        "updated_count": updated_count,
        "notified_users": len(notified_users),
        "jenis_aduan": jenis_aduan,
        "jenis_aduan_display": COMPLAINT_TYPE_DISPLAY.get(jenis_aduan, jenis_aduan),
        "new_status": status,
        "new_status_display": COMPLAINT_STATUS_DISPLAY.get(status, status)
    }


# ============ DASHBOARD & REPORTS ============

@router.get("/dashboard/stats", response_model=dict)
async def get_dashboard_stats(
    current_user: dict = Depends(get_current_user)
):
    """Get complaint dashboard statistics"""
    role = current_user.get("role", "")
    
    # Base query based on role
    base_query = {}
    if role == "warden":
        base_query["warden_assigned"] = str(current_user["_id"])
    elif role in ["parent", "pelajar"]:
        base_query["pengadu_id"] = current_user["_id"]
    
    # Today's complaints
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_query = {**base_query, "created_at": {"$gte": today_start}}
    jumlah_hari_ini = await get_db().complaints.count_documents(today_query)
    
    # Critical complaints
    critical_query = {**base_query, "tahap_keutamaan": "kritikal", "status": {"$nin": ["selesai", "ditutup"]}}
    aduan_kritikal = await get_db().complaints.count_documents(critical_query)
    
    # Unresolved complaints
    unresolved_query = {**base_query, "status": {"$nin": ["selesai", "ditutup"]}}
    aduan_belum_selesai = await get_db().complaints.count_documents(unresolved_query)
    
    # Complaints by category
    pipeline = [
        {"$match": base_query},
        {"$group": {"_id": "$jenis_aduan", "count": {"$sum": 1}}}
    ]
    category_results = await get_db().complaints.aggregate(pipeline).to_list(100)
    aduan_ikut_kategori = {
        COMPLAINT_TYPE_DISPLAY.get(r["_id"], r["_id"]): r["count"] 
        for r in category_results
    }
    
    # Complaints by status
    pipeline_status = [
        {"$match": base_query},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    status_results = await get_db().complaints.aggregate(pipeline_status).to_list(100)
    aduan_ikut_status = {
        COMPLAINT_STATUS_DISPLAY.get(r["_id"], r["_id"]): r["count"] 
        for r in status_results
    }
    
    # Warden response performance (only for admin/superadmin)
    prestasi_respon = {}
    if role in ["admin", "superadmin"]:
        # Calculate average response time
        pipeline_response = [
            {"$match": {"status": {"$ne": "baru_dihantar"}}},
            {"$project": {
                "warden_name": 1,
                "response_time": {
                    "$subtract": [
                        {"$dateFromString": {"dateString": {"$arrayElemAt": ["$audit_log.timestamp", 1]}}},
                        {"$dateFromString": {"dateString": {"$arrayElemAt": ["$audit_log.timestamp", 0]}}}
                    ]
                }
            }},
            {"$group": {
                "_id": "$warden_name",
                "avg_response_ms": {"$avg": "$response_time"},
                "total_handled": {"$sum": 1}
            }}
        ]
        try:
            response_results = await get_db().complaints.aggregate(pipeline_response).to_list(100)
            for r in response_results:
                if r["_id"]:
                    avg_hours = (r["avg_response_ms"] or 0) / (1000 * 60 * 60)
                    prestasi_respon[r["_id"]] = {
                        "avg_response_hours": round(avg_hours, 1),
                        "total_handled": r["total_handled"]
                    }
        except Exception:
            pass
    
    return {
        "stats": {
            "jumlah_hari_ini": jumlah_hari_ini,
            "aduan_kritikal": aduan_kritikal,
            "aduan_belum_selesai": aduan_belum_selesai,
            "prestasi_respon": prestasi_respon,
            "aduan_ikut_kategori": aduan_ikut_kategori,
            "aduan_ikut_status": aduan_ikut_status
        }
    }


@router.get("/reports/monthly", response_model=dict)
async def get_monthly_report(
    bulan: int = Query(..., ge=1, le=12),
    tahun: int = Query(..., ge=2020, le=2030),
    current_user: dict = Depends(get_current_user)
):
    """Get monthly complaint report - Admin only"""
    role = current_user.get("role", "")
    if role not in ["admin", "superadmin", "warden"]:
        raise HTTPException(status_code=403, detail="Tiada kebenaran untuk laporan")
    
    # Date range for the month
    start_date = datetime(tahun, bulan, 1, tzinfo=timezone.utc)
    if bulan == 12:
        end_date = datetime(tahun + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end_date = datetime(tahun, bulan + 1, 1, tzinfo=timezone.utc)
    
    query = {
        "created_at": {
            "$gte": start_date.isoformat(),
            "$lt": end_date.isoformat()
        }
    }
    
    # Total complaints
    jumlah_aduan = await get_db().complaints.count_documents(query)
    
    # Resolved complaints
    resolved_query = {**query, "status": {"$in": ["selesai", "ditutup"]}}
    resolved_count = await get_db().complaints.count_documents(resolved_query)
    kadar_penyelesaian = (resolved_count / jumlah_aduan * 100) if jumlah_aduan > 0 else 0
    
    # Most common complaint types
    pipeline_types = [
        {"$match": query},
        {"$group": {"_id": "$jenis_aduan", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5}
    ]
    type_results = await get_db().complaints.aggregate(pipeline_types).to_list(5)
    jenis_aduan_kerap = [
        {"jenis": COMPLAINT_TYPE_DISPLAY.get(r["_id"], r["_id"]), "count": r["count"]}
        for r in type_results
    ]
    
    # Fastest responding wardens
    warden_terpantas = []
    
    # Trend analysis
    trend_masalah = jenis_aduan_kerap  # Same as most common for now
    
    months_my = ["", "Januari", "Februari", "Mac", "April", "Mei", "Jun", 
                 "Julai", "Ogos", "September", "Oktober", "November", "Disember"]
    
    return {
        "report": {
            "bulan": months_my[bulan],
            "tahun": tahun,
            "jumlah_aduan": jumlah_aduan,
            "kadar_penyelesaian": round(kadar_penyelesaian, 1),
            "jenis_aduan_kerap": jenis_aduan_kerap,
            "warden_terpantas": warden_terpantas,
            "trend_masalah": trend_masalah
        }
    }
