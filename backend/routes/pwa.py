"""
Smart360 PWA - FastAPI endpoints
- POST /api/register-device-token (FCM token)
- POST /api/send-notification (admin send push)
- GET /api/pwa/version (public, for SW update check)
"""
import os
from datetime import datetime, timezone
from typing import Optional, List
from bson import ObjectId

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

router = APIRouter(tags=["PWA"])
_security = HTTPBearer()

_get_db = None
_get_current_user = None


def init_router(get_db_func, get_current_user_func):
    global _get_db, _get_current_user
    _get_db = get_db_func
    _get_current_user = get_current_user_func


async def _pwa_current_user(credentials: HTTPAuthorizationCredentials = Depends(_security)):
    """Dependency that resolves at request time (after init_router has set _get_current_user)."""
    if _get_current_user is None:
        raise HTTPException(status_code=503, detail="PWA auth not initialized")
    return await _get_current_user(credentials)


# ---------- Pydantic models ----------

class RegisterDeviceTokenRequest(BaseModel):
    fcm_token: str = Field(..., min_length=10)
    device_type: Optional[str] = Field(None, description="android | ios | web")
    device_name: Optional[str] = Field(None, max_length=200)


class SendNotificationRequest(BaseModel):
    user_id: Optional[str] = None
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=500)
    data: Optional[dict] = None
    priority: Optional[str] = Field("normal", description="normal | high | urgent")


# ---------- Endpoints ----------

@router.get("/api/pwa/version")
async def get_pwa_version():
    """
    Public endpoint for service worker version check.
    Returns build/version so SW can skipWaiting when new version deployed.
    """
    version = os.environ.get("PWA_VERSION", os.environ.get("BUILD_ID", "1"))
    return {"version": version, "name": "Smart360"}


@router.post("/api/register-device-token")
async def register_device_token(
    body: RegisterDeviceTokenRequest,
    current_user: dict = Depends(_pwa_current_user),
):
    """
    Register FCM device token for push notifications (JWT required).
    Stores in MongoDB collection pwa_device_tokens.
    """
    if _get_db is None:
        raise HTTPException(status_code=500, detail="PWA router not initialized")
    db = _get_db()
    user_id = current_user.get("_id") or current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found")

    doc = {
        "user_id": ObjectId(user_id) if isinstance(user_id, str) and len(user_id) == 24 else user_id,
        "fcm_token": body.fcm_token.strip(),
        "device_type": (body.device_type or "web").lower(),
        "device_name": (body.device_name or "").strip() or None,
        "updated_at": datetime.now(timezone.utc),
    }

    await db.pwa_device_tokens.update_one(
        {"user_id": doc["user_id"], "fcm_token": doc["fcm_token"]},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True, "message": "Token berdaftar"}


@router.post("/api/send-notification")
async def send_notification(
    body: SendNotificationRequest,
    current_user: dict = Depends(_pwa_current_user),
):
    """
    Send push notification to a user (admin or self).
    Requires JWT. In production, call FCM HTTP v1 API with stored tokens.
    """
    if _get_db is None:
        raise HTTPException(status_code=500, detail="PWA router not initialized")
    db = _get_db()
    role = current_user.get("role")
    if role not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Akses ditolak")

    user_id = body.user_id or str(current_user.get("_id") or current_user.get("id"))
    try:
        uid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="user_id tidak sah")

    tokens_docs = await db.pwa_device_tokens.find({"user_id": uid}).to_list(100)
    tokens = [t["fcm_token"] for t in tokens_docs]

    if not tokens:
        return {"ok": True, "sent": 0, "message": "Tiada peranti berdaftar untuk pengguna ini"}

    # Store notification in DB (FCM actual send would use firebase-admin or HTTP v1)
    await db.notifications.insert_one({
        "user_id": uid,
        "title": body.title,
        "message": body.body,
        "type": "push",
        "data": body.data or {},
        "priority": body.priority or "normal",
        "is_read": False,
        "created_at": datetime.now(timezone.utc),
    })

    # TODO: Integrate Firebase Admin SDK to send via FCM:
    # from firebase_admin import messaging
    # messaging.send_multicast(messaging.MulticastMessage(tokens=tokens, notification=..., data=...))
    return {"ok": True, "sent": len(tokens), "message": "Notifikasi direkod; hantar push melalui FCM apabila dikonfigurasi."}
