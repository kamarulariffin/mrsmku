"""
Notification System for Guru Kelas - MRSMKU Portal
Features:
- Web Push Notifications (PWA)
- Bell Notification Center
- Email Notifications (Resend)
- Announcements System
"""
from datetime import datetime, timezone
from typing import List, Optional
from bson import ObjectId

from fastapi import APIRouter, HTTPException, Query, Body
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])

# Injected from server.py
_get_db = None
_require_roles = None


def init_router(get_db_func, require_roles_func):
    global _get_db, _require_roles
    _get_db = get_db_func
    _require_roles = require_roles_func


# ============ PYDANTIC MODELS ============

class PushSubscription(BaseModel):
    endpoint: str
    keys: dict
    device_info: Optional[str] = None


class AnnouncementCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    content: str = Field(..., min_length=10)
    priority: str = Field(default="normal")
    send_push: bool = True
    send_email: bool = True


class NotificationMarkRead(BaseModel):
    notification_ids: List[str]


# ============ HELPER FUNCTIONS ============

def _created_at_str(v):
    if v is None:
        return None
    if isinstance(v, str):
        return v
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return str(v)


def serialize_notification(notif: dict) -> dict:
    return {
        "id": str(notif["_id"]),
        "type": notif.get("type", "general"),
        "title": notif.get("title", ""),
        "message": notif.get("message", ""),
        "category": notif.get("category", "general"),
        "priority": notif.get("priority", "normal"),
        "is_read": notif.get("is_read", False),
        "read_at": _created_at_str(notif.get("read_at")),
        "action_url": notif.get("action_url") or notif.get("link"),
        "action_label": notif.get("action_label"),
        "metadata": notif.get("metadata", {}),
        "created_at": _created_at_str(notif.get("created_at")),
        "sender_name": notif.get("sender_name"),
        "sender_role": notif.get("sender_role")
    }


def serialize_announcement(ann: dict) -> dict:
    return {
        "id": str(ann["_id"]),
        "title": ann.get("title", ""),
        "content": ann.get("content", ""),
        "priority": ann.get("priority", "normal"),
        "tingkatan": ann.get("tingkatan"),
        "kelas": ann.get("kelas"),
        "status": ann.get("status", "draft"),
        "sent_count": ann.get("sent_count", 0),
        "created_by_name": ann.get("created_by_name"),
        "created_at": ann.get("created_at").isoformat() if ann.get("created_at") else None,
        "published_at": ann.get("published_at").isoformat() if ann.get("published_at") else None
    }


async def create_notification(
    db, user_id, title: str, message: str, notification_type: str = "general",
    category: str = "general", priority: str = "normal", action_url: str = None,
    metadata: dict = None, sender_id = None, sender_name: str = None, sender_role: str = None
):
    notif = {
        "user_id": ObjectId(user_id) if isinstance(user_id, str) else user_id,
        "type": notification_type,
        "title": title,
        "message": message,
        "category": category,
        "priority": priority,
        "is_read": False,
        "read_at": None,
        "action_url": action_url,
        "action_label": "Lihat",
        "metadata": metadata or {},
        "sender_id": ObjectId(sender_id) if sender_id else None,
        "sender_name": sender_name,
        "sender_role": sender_role,
        "created_at": datetime.now(timezone.utc)
    }
    result = await db.notifications.insert_one(notif)
    notif["_id"] = result.inserted_id
    return notif


async def send_push_to_user(db, user_id, title: str, body: str, url: str = None):
    subscriptions = await db.push_subscriptions.find({
        "user_id": ObjectId(user_id) if isinstance(user_id, str) else user_id,
        "is_active": True
    }).to_list(10)
    
    for sub in subscriptions:
        try:
            await db.push_logs.insert_one({
                "subscription_id": sub["_id"],
                "user_id": sub["user_id"],
                "title": title,
                "body": body,
                "url": url,
                "status": "pending",
                "created_at": datetime.now(timezone.utc)
            })
        except Exception:
            pass
    return len(subscriptions)


async def log_email(db, user_id, email: str, subject: str, template: str, status: str, metadata: dict = None):
    await db.email_logs.insert_one({
        "user_id": ObjectId(user_id) if user_id else None,
        "email": email,
        "subject": subject,
        "template": template,
        "status": status,
        "metadata": metadata or {},
        "created_at": datetime.now(timezone.utc)
    })


# ============ ENDPOINTS - Using require_roles dependency directly ============
# These routes import Depends locally and use _require_roles which returns the dependency

from fastapi import Depends

@router.get("/")
async def get_notifications(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    category: Optional[str] = None,
    unread_only: bool = False,
    current_user: dict = Depends(lambda: _require_roles())
):
    db = _get_db()
    user_id = current_user["_id"]
    
    query = {"user_id": user_id}
    if category:
        query["category"] = category
    if unread_only:
        query["is_read"] = False
    
    total = await db.notifications.count_documents(query)
    skip = (page - 1) * limit
    notifications = await db.notifications.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    unread_count = await db.notifications.count_documents({"user_id": user_id, "is_read": False})
    
    return {
        "notifications": [serialize_notification(n) for n in notifications],
        "pagination": {"page": page, "limit": limit, "total": total, "total_pages": max(1, (total + limit - 1) // limit), "has_next": skip + limit < total, "has_prev": page > 1},
        "unread_count": unread_count
    }


@router.get("/unread-count")
async def get_unread_count(current_user: dict = Depends(lambda: _require_roles())):
    db = _get_db()
    count = await db.notifications.count_documents({"user_id": current_user["_id"], "is_read": False})
    return {"unread_count": count}


@router.put("/mark-read")
async def mark_notifications_read(data: NotificationMarkRead, current_user: dict = Depends(lambda: _require_roles())):
    db = _get_db()
    notif_ids = [ObjectId(nid) for nid in data.notification_ids]
    result = await db.notifications.update_many(
        {"_id": {"$in": notif_ids}, "user_id": current_user["_id"]},
        {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc)}}
    )
    return {"status": "success", "marked_count": result.modified_count}


@router.put("/mark-all-read")
async def mark_all_read(current_user: dict = Depends(lambda: _require_roles())):
    db = _get_db()
    result = await db.notifications.update_many(
        {"user_id": current_user["_id"], "is_read": False},
        {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc)}}
    )
    return {"status": "success", "marked_count": result.modified_count}


@router.delete("/{notification_id}")
async def delete_notification(notification_id: str, current_user: dict = Depends(lambda: _require_roles())):
    db = _get_db()
    result = await db.notifications.delete_one({"_id": ObjectId(notification_id), "user_id": current_user["_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notifikasi tidak dijumpai")
    return {"status": "deleted"}


# ============ GURU KELAS ENDPOINTS ============

@router.get("/guru/dashboard")
async def get_guru_notification_dashboard(current_user: dict = Depends(lambda: _require_roles("guru_kelas", "guru_homeroom", "superadmin", "admin"))):
    db = _get_db()
    
    tingkatan = current_user.get("assigned_form")
    kelas = current_user.get("assigned_class")
    
    student_query = {"status": "approved"}
    if tingkatan:
        student_query["form"] = tingkatan
    if kelas:
        student_query["class_name"] = kelas
    
    students = await db.students.find(student_query).to_list(100)
    parent_ids = list(set([s.get("parent_id") for s in students if s.get("parent_id")]))
    parents = await db.users.find({"_id": {"$in": parent_ids}, "role": "parent"}).to_list(100)
    
    push_count = await db.push_subscriptions.count_documents({"user_id": {"$in": [p["_id"] for p in parents]}, "is_active": True})
    recent_announcements = await db.announcements.find({"created_by": current_user["_id"]}).sort("created_at", -1).limit(5).to_list(5)
    total_ann = await db.announcements.count_documents({"created_by": current_user["_id"]})
    published_ann = await db.announcements.count_documents({"created_by": current_user["_id"], "status": "published"})
    
    return {
        "class_info": {
            "tingkatan": tingkatan,
            "kelas": kelas,
            "full_class": f"T{tingkatan} {kelas}" if tingkatan and kelas else "-",
            "student_count": len(students),
            "parent_count": len(parents)
        },
        "push_stats": {
            "total_parents": len(parents),
            "subscribed_count": push_count,
            "subscription_rate": (push_count / len(parents) * 100) if parents else 0
        },
        "announcement_stats": {"total": total_ann, "published": published_ann, "drafts": total_ann - published_ann},
        "recent_announcements": [serialize_announcement(a) for a in recent_announcements],
        "email_stats": {"sent_today": 0}
    }


@router.get("/guru/parents")
async def get_class_parents(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    current_user: dict = Depends(lambda: _require_roles("guru_kelas", "guru_homeroom", "superadmin", "admin"))
):
    db = _get_db()
    
    tingkatan = current_user.get("assigned_form")
    kelas = current_user.get("assigned_class")
    
    student_query = {"status": "approved"}
    if tingkatan:
        student_query["form"] = tingkatan
    if kelas:
        student_query["class_name"] = kelas
    
    students = await db.students.find(student_query).to_list(500)
    
    parent_students = {}
    for s in students:
        pid = s.get("parent_id")
        if pid:
            if pid not in parent_students:
                parent_students[pid] = []
            parent_students[pid].append({"id": str(s["_id"]), "name": s.get("full_name"), "matric": s.get("matric_number")})
    
    parent_query = {"_id": {"$in": list(parent_students.keys())}, "role": "parent"}
    if search:
        parent_query["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}}
        ]
    
    total = await db.users.count_documents(parent_query)
    skip = (page - 1) * limit
    parents = await db.users.find(parent_query).skip(skip).limit(limit).to_list(limit)
    
    subscriptions = await db.push_subscriptions.find({"user_id": {"$in": [p["_id"] for p in parents]}, "is_active": True}).to_list(500)
    sub_by_parent = {}
    for sub in subscriptions:
        uid = sub["user_id"]
        sub_by_parent[uid] = sub_by_parent.get(uid, 0) + 1
    
    result = []
    for p in parents:
        result.append({
            "id": str(p["_id"]),
            "full_name": p.get("full_name"),
            "email": p.get("email"),
            "phone": p.get("phone"),
            "children": parent_students.get(p["_id"], []),
            "push_subscribed": p["_id"] in sub_by_parent,
            "device_count": sub_by_parent.get(p["_id"], 0)
        })
    
    return {"parents": result, "pagination": {"page": page, "limit": limit, "total": total, "total_pages": max(1, (total + limit - 1) // limit)}}


@router.get("/announcements")
async def get_announcements(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    current_user: dict = Depends(lambda: _require_roles("guru_kelas", "guru_homeroom", "superadmin", "admin"))
):
    db = _get_db()
    
    query = {}
    if current_user.get("role") in ["guru_kelas", "guru_homeroom"]:
        query["created_by"] = current_user["_id"]
    if status:
        query["status"] = status
    
    total = await db.announcements.count_documents(query)
    skip = (page - 1) * limit
    announcements = await db.announcements.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {"announcements": [serialize_announcement(a) for a in announcements], "pagination": {"page": page, "limit": limit, "total": total, "total_pages": max(1, (total + limit - 1) // limit)}}


@router.post("/announcements")
async def create_announcement(data: AnnouncementCreate, current_user: dict = Depends(lambda: _require_roles("guru_kelas", "guru_homeroom", "superadmin", "admin"))):
    db = _get_db()
    
    tingkatan = current_user.get("assigned_form")
    kelas = current_user.get("assigned_class")
    
    announcement = {
        "title": data.title,
        "content": data.content,
        "priority": data.priority,
        "tingkatan": tingkatan,
        "kelas": kelas,
        "status": "published",
        "send_push": data.send_push,
        "send_email": data.send_email,
        "sent_count": 0,
        "created_by": current_user["_id"],
        "created_by_name": current_user.get("full_name"),
        "created_at": datetime.now(timezone.utc),
        "published_at": datetime.now(timezone.utc)
    }
    
    result = await db.announcements.insert_one(announcement)
    announcement["_id"] = result.inserted_id
    
    # Send to parents
    student_query = {"status": "approved"}
    if tingkatan:
        student_query["form"] = tingkatan
    if kelas:
        student_query["class_name"] = kelas
    
    students = await db.students.find(student_query).to_list(500)
    parent_ids = list(set([s.get("parent_id") for s in students if s.get("parent_id")]))
    parents = await db.users.find({"_id": {"$in": parent_ids}, "role": "parent"}).to_list(500)
    
    sent_count = 0
    for parent in parents:
        await create_notification(
            db, str(parent["_id"]), announcement["title"],
            announcement["content"][:200] + "..." if len(announcement["content"]) > 200 else announcement["content"],
            "announcement", "announcement", announcement.get("priority", "normal"), "/notifications",
            metadata={"announcement_id": str(announcement["_id"])},
            sender_id=str(current_user["_id"]), sender_name=current_user.get("full_name"), sender_role=current_user.get("role")
        )
        sent_count += 1
        
        if data.send_push:
            await send_push_to_user(db, str(parent["_id"]), f"Pengumuman: {announcement['title']}", announcement["content"][:100], "/notifications")
        
        if data.send_email and parent.get("email"):
            await log_email(db, str(parent["_id"]), parent["email"], f"Pengumuman: {announcement['title']}", "announcement", "queued", {"content": announcement["content"]})
    
    await db.announcements.update_one({"_id": result.inserted_id}, {"$set": {"sent_count": sent_count}})
    announcement["sent_count"] = sent_count
    
    return {"status": "success", "message": f"Pengumuman berjaya diterbitkan kepada {sent_count} ibu bapa", "announcement": serialize_announcement(announcement)}


@router.delete("/announcements/{announcement_id}")
async def delete_announcement(announcement_id: str, current_user: dict = Depends(lambda: _require_roles("guru_kelas", "guru_homeroom", "superadmin", "admin"))):
    db = _get_db()
    
    announcement = await db.announcements.find_one({"_id": ObjectId(announcement_id)})
    if not announcement:
        raise HTTPException(status_code=404, detail="Pengumuman tidak dijumpai")
    
    if current_user.get("role") in ["guru_kelas", "guru_homeroom"] and announcement["created_by"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    await db.announcements.delete_one({"_id": ObjectId(announcement_id)})
    return {"status": "deleted"}


@router.post("/guru/send-quick")
async def send_quick_notification(
    title: str = Body(...),
    message: str = Body(...),
    target: str = Body("all"),
    target_parents: Optional[List[str]] = Body(None),
    send_push: bool = Body(True),
    send_email: bool = Body(False),
    current_user: dict = Depends(lambda: _require_roles("guru_kelas", "guru_homeroom", "superadmin", "admin"))
):
    db = _get_db()
    
    tingkatan = current_user.get("assigned_form")
    kelas = current_user.get("assigned_class")
    
    if target == "all":
        student_query = {"status": "approved"}
        if tingkatan:
            student_query["form"] = tingkatan
        if kelas:
            student_query["class_name"] = kelas
        students = await db.students.find(student_query).to_list(500)
        parent_ids = list(set([s.get("parent_id") for s in students if s.get("parent_id")]))
    else:
        parent_ids = [ObjectId(pid) for pid in (target_parents or [])]
    
    if not parent_ids:
        raise HTTPException(status_code=400, detail="Tiada ibu bapa untuk dihantar notifikasi")
    
    parents = await db.users.find({"_id": {"$in": parent_ids}, "role": "parent"}).to_list(500)
    
    sent_count = 0
    for parent in parents:
        await create_notification(
            db, str(parent["_id"]), title, message, "message", "class_message", "normal", "/notifications",
            sender_id=str(current_user["_id"]), sender_name=current_user.get("full_name"), sender_role=current_user.get("role")
        )
        sent_count += 1
        
        if send_push:
            await send_push_to_user(db, str(parent["_id"]), title, message[:100], "/notifications")
        
        if send_email and parent.get("email"):
            await log_email(db, str(parent["_id"]), parent["email"], title, "quick_message", "queued", {"message": message})
    
    return {"status": "success", "message": f"Berjaya menghantar {sent_count} notifikasi", "notifications_sent": sent_count}


# ============ PUSH SUBSCRIPTION ============

@router.post("/push/subscribe")
async def subscribe_push(subscription: PushSubscription, current_user: dict = Depends(lambda: _require_roles())):
    db = _get_db()
    
    existing = await db.push_subscriptions.find_one({"endpoint": subscription.endpoint, "user_id": current_user["_id"]})
    
    if existing:
        await db.push_subscriptions.update_one(
            {"_id": existing["_id"]},
            {"$set": {"keys": subscription.keys, "device_info": subscription.device_info, "is_active": True, "updated_at": datetime.now(timezone.utc)}}
        )
        return {"status": "updated", "message": "Langganan dikemas kini"}
    
    await db.push_subscriptions.insert_one({
        "user_id": current_user["_id"],
        "endpoint": subscription.endpoint,
        "keys": subscription.keys,
        "device_info": subscription.device_info,
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    })
    return {"status": "subscribed", "message": "Berjaya melanggan notifikasi"}


@router.get("/push/status")
async def get_push_status(current_user: dict = Depends(lambda: _require_roles())):
    db = _get_db()
    subscriptions = await db.push_subscriptions.find({"user_id": current_user["_id"], "is_active": True}).to_list(10)
    
    return {
        "is_subscribed": len(subscriptions) > 0,
        "device_count": len(subscriptions),
        "devices": [{"id": str(s["_id"]), "device_info": s.get("device_info", "Unknown")} for s in subscriptions]
    }
