"""
Hostel Blocks Routes - Modul Blok Asrama
MRSMKU Smart360
"""
import re
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Any, List, Optional
from datetime import datetime, timezone
from bson import ObjectId
from services.id_normalizer import object_id_or_none

from models.hostel import (
    HostelBlockCreate, HostelBlockUpdate, HostelBlockResponse,
    GENDER_DISPLAY, DEFAULT_HOSTEL_BLOCKS, _beds_per_level_from_room_config,
)

router = APIRouter(prefix="/api/hostel-blocks", tags=["Hostel Blocks"])
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


def _id_value(value: Any) -> Any:
    """Normalize ID-like inputs while supporting non-ObjectId IDs."""
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return value
    text = str(value).strip()
    try:
        if ObjectId.is_valid(text):
            return object_id_or_none(text)
    except Exception:
        pass
    return text


def _block_student_query(block: dict) -> dict:
    """Query to count students in a block (block_name matches code or block name)."""
    code_esc = re.escape(block["code"])
    name_esc = re.escape(block.get("name", "").strip())
    if name_esc and name_esc != code_esc:
        return {
            "status": "approved",
            "$or": [
                {"block_name": {"$regex": f"^{code_esc}$", "$options": "i"}},
                {"block_name": {"$regex": f"^{name_esc}$", "$options": "i"}},
            ],
        }
    return {
        "status": "approved",
        "block_name": {"$regex": f"^{code_esc}$", "$options": "i"},
    }


async def serialize_block(block: dict) -> dict:
    """Serialize hostel block with additional info"""
    # Get warden info if assigned
    warden_name = None
    if block.get("warden_id"):
        warden = await get_db().users.find_one({"_id": _id_value(block["warden_id"])})
        if warden:
            warden_name = warden.get("full_name", "")
    
    # Count students in this block (synchronized with DB: block_name matches code or block name)
    student_count = await get_db().students.count_documents(_block_student_query(block))
    levels = block.get("levels", [])
    beds_per_level = block.get("beds_per_level") or []
    bed_codes_count = sum(beds_per_level) if beds_per_level else None

    return HostelBlockResponse(
        id=str(block["_id"]),
        code=block["code"],
        name=block["name"],
        gender=block["gender"],
        gender_display=GENDER_DISPLAY.get(block["gender"], block["gender"]),
        levels=levels,
        capacity=block.get("capacity"),
        warden_id=block.get("warden_id"),
        warden_name=warden_name,
        description=block.get("description"),
        is_active=block.get("is_active", True),
        student_count=student_count,
        created_at=block.get("created_at", ""),
        beds_per_level=beds_per_level if beds_per_level else None,
        beds_per_room=block.get("beds_per_room"),
        bed_codes_count=bed_codes_count,
        room_config_per_level=block.get("room_config_per_level"),
    ).dict()


# ============ PUBLIC ENDPOINTS ============

@router.get("/public", response_model=dict)
async def get_public_blocks():
    """Get list of active blocks for public forms"""
    blocks = await get_db().hostel_blocks.find({"is_active": True}).sort("code", 1).to_list(100)
    
    return {
        "blocks": [
            {
                "code": b["code"],
                "name": b["name"],
                "gender": b["gender"],
                "gender_display": GENDER_DISPLAY.get(b["gender"], b["gender"]),
                "levels": b.get("levels", [])
            }
            for b in blocks
        ]
    }


# ============ BLOCK CRUD ============

@router.get("", response_model=dict)
async def list_blocks(
    gender: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: dict = Depends(get_current_user)
):
    """List all hostel blocks"""
    query = {}
    
    if gender:
        query["gender"] = gender
    if is_active is not None:
        query["is_active"] = is_active
    
    blocks = await get_db().hostel_blocks.find(query).sort("code", 1).to_list(100)
    
    return {
        "blocks": [await serialize_block(b) for b in blocks],
        "total": len(blocks)
    }


def _generate_bed_codes(block_code: str, beds_per_level: List[int]) -> List[str]:
    """Generate bed codes from block code and beds per level. Format: {CODE}-{levelIndex}-{bedNo} e.g. JA-1-001."""
    codes = []
    for level_idx, count in enumerate(beds_per_level):
        level_num = level_idx + 1
        for bed_no in range(1, int(count) + 1):
            codes.append(f"{block_code}-{level_num}-{bed_no:03d}")
    return codes


@router.get("/{block_id}/bed-codes", response_model=dict)
async def get_block_bed_codes(
    block_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Jana senarai kod katil berdasarkan jumlah katil per tingkat. Boleh digunakan oleh SuperAdmin, Admin, Warden."""
    role = current_user.get("role", "")
    if role not in ["superadmin", "admin", "warden"]:
        raise HTTPException(status_code=403, detail="Tiada kebenaran")
    block = await get_db().hostel_blocks.find_one({"_id": _id_value(block_id)})
    if not block:
        raise HTTPException(status_code=404, detail="Blok tidak dijumpai")
    beds_per_level = block.get("beds_per_level") or []
    if not beds_per_level:
        return {
            "block_id": block_id,
            "block_code": block["code"],
            "bed_codes": [],
            "total": 0,
            "message": "Tiada tetapan jumlah katil per tingkat. Sila tetapkan di Edit Blok."
        }
    bed_codes = _generate_bed_codes(block["code"], beds_per_level)
    return {
        "block_id": block_id,
        "block_code": block["code"],
        "levels": block.get("levels", []),
        "beds_per_level": beds_per_level,
        "bed_codes": bed_codes,
        "total": len(bed_codes),
    }


def _room_to_level_index(room: str, num_levels: int) -> int:
    """Map room number to level index (0-based). E.g. 101->0, 201->1, 301->2."""
    if not room or not room.strip():
        return 0
    r = room.strip()
    if r and r[0].isdigit():
        idx = int(r[0]) - 1
        return max(0, min(idx, num_levels - 1)) if num_levels > 0 else 0
    return 0


@router.get("/{block_id}/level-detail", response_model=dict)
async def get_block_level_detail(
    block_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Maklumat per tingkat: jumlah pelajar dan bilik kosong mengikut tingkat (dalam box yang sama dengan blok)."""
    role = current_user.get("role", "")
    if role not in ["superadmin", "admin", "warden"]:
        raise HTTPException(status_code=403, detail="Tiada kebenaran")
    block = await get_db().hostel_blocks.find_one({"_id": _id_value(block_id)})
    if not block:
        raise HTTPException(status_code=404, detail="Blok tidak dijumpai")
    db = get_db()
    base_query = _block_student_query(block)
    room_exists = {"$or": [{"room_number": {"$exists": True, "$ne": ""}}, {"room": {"$exists": True, "$ne": ""}}]}
    students_match = {"$and": [base_query, room_exists]} if base_query else room_exists
    by_room = {}
    async for row in db.students.find(students_match):
        room_value = row.get("room_number")
        if room_value in (None, ""):
            room_value = row.get("room")
        room_key = str(room_value).strip() if room_value not in (None, "") else ""
        if room_key:
            by_room[room_key] = by_room.get(room_key, 0) + 1
    beds_per_room = block.get("beds_per_room")
    cap = int(beds_per_room) if beds_per_room is not None and int(beds_per_room) > 0 else 2
    levels = block.get("levels") or []
    num_levels = max(len(levels), 1)
    level_data = []
    for idx, level_name in enumerate(levels):
        student_count = 0
        empty_rooms = []
        for room, occupants in by_room.items():
            if _room_to_level_index(room, num_levels) != idx:
                continue
            student_count += occupants
            empty_beds = max(0, cap - occupants)
            if empty_beds > 0:
                empty_rooms.append({"room": room or "–", "occupants": occupants, "capacity": cap, "empty_beds": empty_beds})
        level_data.append({
            "level_name": level_name,
            "level_index": idx,
            "student_count": student_count,
            "empty_rooms": empty_rooms,
            "total_empty_rooms": len(empty_rooms),
            "total_empty_beds": sum(r["empty_beds"] for r in empty_rooms),
        })
    return {
        "block_id": block_id,
        "block_code": block["code"],
        "levels": level_data,
    }


@router.get("/{block_id}", response_model=dict)
async def get_block(
    block_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get block details"""
    block = await get_db().hostel_blocks.find_one({"_id": _id_value(block_id)})
    if not block:
        raise HTTPException(status_code=404, detail="Blok tidak dijumpai")
    
    return {"block": await serialize_block(block)}


@router.post("", response_model=dict)
async def create_block(
    block_data: HostelBlockCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create new hostel block - SuperAdmin, Warden"""
    role = current_user.get("role", "")
    if role not in ["superadmin", "warden", "admin"]:
        raise HTTPException(status_code=403, detail="Tiada kebenaran untuk mencipta blok")
    
    # Check if code already exists
    existing = await get_db().hostel_blocks.find_one({"code": block_data.code.upper()})
    if existing:
        raise HTTPException(status_code=400, detail="Kod blok sudah wujud")
    
    now = datetime.now(timezone.utc).isoformat()
    room_config = getattr(block_data, "room_config_per_level", None)
    if room_config and _beds_per_level_from_room_config(room_config):
        beds_per_level = _beds_per_level_from_room_config(room_config)
    else:
        beds_per_level = getattr(block_data, "beds_per_level", None) or []
    block_doc = {
        "code": block_data.code.upper(),
        "name": block_data.name,
        "gender": block_data.gender.value,
        "levels": block_data.levels or [],
        "capacity": block_data.capacity,
        "warden_id": block_data.warden_id,
        "description": block_data.description,
        "is_active": block_data.is_active,
        "beds_per_level": beds_per_level,
        "beds_per_room": getattr(block_data, "beds_per_room", None),
        "room_config_per_level": room_config,
        "created_by": str(current_user["_id"]),
        "created_at": now,
        "updated_at": now
    }
    
    result = await get_db().hostel_blocks.insert_one(block_doc)
    block_doc["_id"] = result.inserted_id
    
    await log_audit(current_user, "CREATE_HOSTEL_BLOCK", "hostel", f"Blok baru: {block_data.code}")
    
    return {
        "message": "Blok berjaya dicipta",
        "block": await serialize_block(block_doc)
    }


@router.put("/{block_id}", response_model=dict)
async def update_block(
    block_id: str,
    block_data: HostelBlockUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update hostel block - SuperAdmin, Warden"""
    role = current_user.get("role", "")
    if role not in ["superadmin", "warden", "admin"]:
        raise HTTPException(status_code=403, detail="Tiada kebenaran untuk kemaskini blok")
    
    block = await get_db().hostel_blocks.find_one({"_id": _id_value(block_id)})
    if not block:
        raise HTTPException(status_code=404, detail="Blok tidak dijumpai")
    
    update_data = {k: v for k, v in block_data.dict().items() if v is not None}
    if "gender" in update_data:
        update_data["gender"] = update_data["gender"].value if hasattr(update_data["gender"], "value") else update_data["gender"]
    if "room_config_per_level" in update_data and update_data["room_config_per_level"]:
        computed = _beds_per_level_from_room_config(update_data["room_config_per_level"])
        if computed is not None:
            update_data["beds_per_level"] = computed
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await get_db().hostel_blocks.update_one(
        {"_id": _id_value(block_id)},
        {"$set": update_data}
    )
    
    await log_audit(current_user, "UPDATE_HOSTEL_BLOCK", "hostel", f"Blok dikemaskini: {block['code']}")
    
    updated = await get_db().hostel_blocks.find_one({"_id": _id_value(block_id)})
    return {
        "message": "Blok berjaya dikemaskini",
        "block": await serialize_block(updated)
    }


@router.delete("/{block_id}", response_model=dict)
async def delete_block(
    block_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete hostel block - SuperAdmin or Admin"""
    role = current_user.get("role", "")
    if role not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Hanya SuperAdmin atau Admin boleh padam blok")
    
    block = await get_db().hostel_blocks.find_one({"_id": _id_value(block_id)})
    if not block:
        raise HTTPException(status_code=404, detail="Blok tidak dijumpai")
    
    # Check if block has students (same query as overview)
    student_count = await get_db().students.count_documents(_block_student_query(block))
    if student_count > 0:
        raise HTTPException(status_code=400, detail=f"Tidak boleh padam. {student_count} pelajar masih dalam blok ini.")
    
    await get_db().hostel_blocks.delete_one({"_id": _id_value(block_id)})
    
    await log_audit(current_user, "DELETE_HOSTEL_BLOCK", "hostel", f"Blok dipadam: {block['code']}")
    
    return {"message": "Blok berjaya dipadam"}


# ============ SEED DEFAULT BLOCKS ============

@router.post("/seed-defaults", response_model=dict)
async def seed_default_blocks(
    current_user: dict = Depends(get_current_user)
):
    """Seed default hostel blocks - SuperAdmin only"""
    role = current_user.get("role", "")
    if role != "superadmin":
        raise HTTPException(status_code=403, detail="Hanya SuperAdmin boleh seed data")
    
    now = datetime.now(timezone.utc).isoformat()
    created = 0
    skipped = 0
    
    for block in DEFAULT_HOSTEL_BLOCKS:
        existing = await get_db().hostel_blocks.find_one({"code": block["code"]})
        if existing:
            skipped += 1
            continue
        
        block_doc = {
            **block,
            "capacity": None,
            "warden_id": None,
            "description": None,
            "is_active": True,
            "created_by": str(current_user["_id"]),
            "created_at": now,
            "updated_at": now
        }
        await get_db().hostel_blocks.insert_one(block_doc)
        created += 1
    
    await log_audit(current_user, "SEED_HOSTEL_BLOCKS", "hostel", f"Seeded {created} blocks, skipped {skipped}")
    
    return {
        "message": f"Seed selesai. Dicipta: {created}, Dilangkau: {skipped}",
        "created": created,
        "skipped": skipped
    }


# ============ BLOCK STATISTICS ============

@router.get("/stats/overview", response_model=dict)
async def get_blocks_overview(
    current_user: dict = Depends(get_current_user)
):
    """Get overview statistics for all blocks. Jumlah Pelajar disegerakkan dengan jumlah pelajar diluluskan dalam DB."""
    role = current_user.get("role", "")
    if role not in ["superadmin", "admin", "warden"]:
        raise HTTPException(status_code=403, detail="Tiada kebenaran")

    db = get_db()
    blocks = await db.hostel_blocks.find({"is_active": True}).to_list(100)

    # Jumlah Pelajar = jumlah sebenar pelajar diluluskan dalam pangkalan data
    base_query = {"status": "approved"}
    total_students = await db.students.count_documents(base_query)
    total_male = await db.students.count_documents({**base_query, "gender": "lelaki"})
    total_female = await db.students.count_documents({**base_query, "gender": "perempuan"})
    total_capacity = 0
    stats = []

    for block in blocks:
        student_count = await db.students.count_documents(_block_student_query(block))
        capacity = block.get("capacity") or 0
        total_capacity += capacity
        occupancy = (student_count / capacity * 100) if capacity > 0 else 0
        stats.append({
            "code": block["code"],
            "name": block["name"],
            "gender": GENDER_DISPLAY.get(block["gender"], block["gender"]),
            "student_count": student_count,
            "capacity": capacity,
            "occupancy_percent": round(occupancy, 1),
        })

    return {
        "blocks": stats,
        "summary": {
            "total_blocks": len(blocks),
            "total_students": total_students,
            "total_male": total_male,
            "total_female": total_female,
            "total_capacity": total_capacity or None,
            "overall_occupancy": round((total_students / total_capacity * 100), 1) if total_capacity > 0 else 0,
        },
    }
