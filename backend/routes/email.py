import os
import asyncio
import logging
import resend
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime, timezone

router = APIRouter()
logger = logging.getLogger(__name__)

# Models
class EmailSettingsModel(BaseModel):
    api_key: str
    sender_email: str
    sender_name: Optional[str] = "Portal MRSMKU"
    
class EmailTestRequest(BaseModel):
    recipient_email: EmailStr
    
class EmailNotificationRequest(BaseModel):
    recipient_email: EmailStr
    recipient_name: str
    notification_type: str  # fee_reminder, payment_confirm, bus_booking
    data: dict

# Email Settings endpoints
@router.get("/settings/email")
async def get_email_settings(db=None, current_user=None):
    """Get email settings (API key masked)"""
    settings = await db.settings.find_one({"type": "email"}, {"_id": 0})
    if settings:
        # Mask API key for security
        if settings.get("api_key"):
            key = settings["api_key"]
            settings["api_key_masked"] = f"{key[:8]}...{key[-4:]}" if len(key) > 12 else "***"
            del settings["api_key"]
        return {"enabled": True, **settings}
    return {"enabled": False}

@router.post("/settings/email")
async def save_email_settings(settings: EmailSettingsModel, db=None, current_user=None):
    """Save email settings (SuperAdmin only)"""
    if current_user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Validate API key format
    if not settings.api_key.startswith("re_"):
        raise HTTPException(status_code=400, detail="API Key tidak sah. Mesti bermula dengan 're_'")
    
    # Test the API key by initializing resend
    try:
        resend.api_key = settings.api_key
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"API Key tidak sah: {str(e)}")
    
    await db.settings.update_one(
        {"type": "email"},
        {"$set": {
            "type": "email",
            "api_key": settings.api_key,
            "sender_email": settings.sender_email,
            "sender_name": settings.sender_name,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current_user.get("id")
        }},
        upsert=True
    )
    
    # Log audit
    await db.audit_logs.insert_one({
        "action": "email_settings_updated",
        "user_id": current_user.get("id"),
        "user_email": current_user.get("email"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "details": {"sender_email": settings.sender_email}
    })
    
    return {"message": "Tetapan email berjaya disimpan"}

@router.delete("/settings/email")
async def delete_email_settings(db=None, current_user=None):
    """Delete email settings"""
    if current_user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    await db.settings.delete_one({"type": "email"})
    return {"message": "Tetapan email dipadam"}

@router.post("/settings/email/test")
async def test_email(request: EmailTestRequest, db=None, current_user=None):
    """Send a test email"""
    if current_user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Get email settings
    settings = await db.settings.find_one({"type": "email"}, {"_id": 0})
    if not settings or not settings.get("api_key"):
        raise HTTPException(status_code=400, detail="Tetapan email belum dikonfigurasi")
    
    resend.api_key = settings["api_key"]
    
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #4F46E5, #7C3AED); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">Portal MRSMKU</h1>
        </div>
        <div style="padding: 30px; background: #f8fafc;">
            <h2 style="color: #1e293b;">Email Ujian Berjaya!</h2>
            <p style="color: #475569;">
                Tahniah! Konfigurasi email Resend anda berfungsi dengan baik.
            </p>
            <p style="color: #475569;">
                Email ini dihantar dari Portal MRSMKU untuk menguji integrasi Resend.
            </p>
            <div style="margin-top: 20px; padding: 15px; background: #e0f2fe; border-radius: 8px;">
                <p style="color: #0369a1; margin: 0;">
                    <strong>Masa dihantar:</strong> {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}
                </p>
            </div>
        </div>
        <div style="padding: 20px; background: #1e293b; text-align: center;">
            <p style="color: #94a3b8; margin: 0; font-size: 12px;">
                © 2026 Portal MRSMKU - Sistem Pengurusan Sekolah Bersepadu
            </p>
        </div>
    </div>
    """
    
    params = {
        "from": f"{settings.get('sender_name', 'Portal MRSMKU')} <{settings['sender_email']}>",
        "to": [request.recipient_email],
        "subject": "Email Ujian - Portal MRSMKU",
        "html": html_content
    }
    
    try:
        email = await asyncio.to_thread(resend.Emails.send, params)
        
        # Log success
        await db.email_logs.insert_one({
            "type": "test",
            "recipient": request.recipient_email,
            "status": "sent",
            "email_id": email.get("id"),
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "sent_by": current_user.get("id")
        })
        
        return {
            "status": "success",
            "message": f"Email ujian berjaya dihantar ke {request.recipient_email}",
            "email_id": email.get("id")
        }
    except Exception as e:
        logger.error(f"Failed to send test email: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Gagal menghantar email: {str(e)}")

# Send notification email
async def send_notification_email(
    db, 
    recipient_email: str, 
    recipient_name: str,
    notification_type: str,
    data: dict
):
    """Internal function to send notification emails"""
    settings = await db.settings.find_one({"type": "email"}, {"_id": 0})
    if not settings or not settings.get("api_key"):
        logger.warning("Email settings not configured, skipping notification")
        return None
    
    resend.api_key = settings["api_key"]
    
    # Generate email content based on type
    if notification_type == "fee_reminder":
        subject = f"Peringatan Yuran Tertunggak - {data.get('student_name', 'Pelajar')}"
        html_content = _generate_fee_reminder_html(recipient_name, data)
    elif notification_type == "payment_confirm":
        subject = f"Pengesahan Pembayaran - RM {data.get('amount', 0):.2f}"
        html_content = _generate_payment_confirm_html(recipient_name, data)
    elif notification_type == "bus_booking":
        subject = f"Pengesahan Tempahan Bas - {data.get('trip_date', '')}"
        html_content = _generate_bus_booking_html(recipient_name, data)
    else:
        logger.error(f"Unknown notification type: {notification_type}")
        return None
    
    params = {
        "from": f"{settings.get('sender_name', 'Portal MRSMKU')} <{settings['sender_email']}>",
        "to": [recipient_email],
        "subject": subject,
        "html": html_content
    }
    
    try:
        email = await asyncio.to_thread(resend.Emails.send, params)
        
        await db.email_logs.insert_one({
            "type": notification_type,
            "recipient": recipient_email,
            "status": "sent",
            "email_id": email.get("id"),
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "data": data
        })
        
        return email.get("id")
    except Exception as e:
        logger.error(f"Failed to send notification email: {str(e)}")
        await db.email_logs.insert_one({
            "type": notification_type,
            "recipient": recipient_email,
            "status": "failed",
            "error": str(e),
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "data": data
        })
        return None

def _generate_fee_reminder_html(recipient_name: str, data: dict) -> str:
    return f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #4F46E5, #7C3AED); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">Portal MRSMKU</h1>
        </div>
        <div style="padding: 30px; background: #f8fafc;">
            <h2 style="color: #1e293b;">Peringatan Yuran Tertunggak</h2>
            <p style="color: #475569;">Assalamualaikum {recipient_name},</p>
            <p style="color: #475569;">
                Ini adalah peringatan mesra bahawa terdapat yuran tertunggak untuk anak anda:
            </p>
            <div style="background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <p style="margin: 5px 0;"><strong>Nama Pelajar:</strong> {data.get('student_name', '-')}</p>
                <p style="margin: 5px 0;"><strong>Tingkatan:</strong> {data.get('form', '-')}</p>
                <p style="margin: 5px 0; color: #dc2626;"><strong>Jumlah Tertunggak:</strong> RM {data.get('amount', 0):.2f}</p>
            </div>
            <p style="color: #475569; margin-top: 20px;">
                Sila log masuk ke Portal MRSMKU untuk membuat pembayaran.
            </p>
        </div>
        <div style="padding: 20px; background: #1e293b; text-align: center;">
            <p style="color: #94a3b8; margin: 0; font-size: 12px;">
                © 2026 Portal MRSMKU - Sistem Pengurusan Sekolah Bersepadu
            </p>
        </div>
    </div>
    """

def _generate_payment_confirm_html(recipient_name: str, data: dict) -> str:
    return f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #059669, #10B981); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">Portal MRSMKU</h1>
        </div>
        <div style="padding: 30px; background: #f8fafc;">
            <h2 style="color: #059669;">Pembayaran Berjaya!</h2>
            <p style="color: #475569;">Assalamualaikum {recipient_name},</p>
            <p style="color: #475569;">
                Terima kasih! Pembayaran anda telah berjaya diproses.
            </p>
            <div style="background: #ecfdf5; padding: 20px; border-radius: 8px; border: 1px solid #a7f3d0;">
                <p style="margin: 5px 0;"><strong>No. Resit:</strong> {data.get('receipt_no', '-')}</p>
                <p style="margin: 5px 0;"><strong>Jumlah:</strong> RM {data.get('amount', 0):.2f}</p>
                <p style="margin: 5px 0;"><strong>Tarikh:</strong> {data.get('date', '-')}</p>
                <p style="margin: 5px 0;"><strong>Jenis:</strong> {data.get('type', '-')}</p>
            </div>
        </div>
        <div style="padding: 20px; background: #1e293b; text-align: center;">
            <p style="color: #94a3b8; margin: 0; font-size: 12px;">
                © 2026 Portal MRSMKU - Sistem Pengurusan Sekolah Bersepadu
            </p>
        </div>
    </div>
    """

def _generate_bus_booking_html(recipient_name: str, data: dict) -> str:
    return f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0891B2, #06B6D4); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">Portal MRSMKU</h1>
        </div>
        <div style="padding: 30px; background: #f8fafc;">
            <h2 style="color: #0891B2;">Pengesahan Tempahan Bas</h2>
            <p style="color: #475569;">Assalamualaikum {recipient_name},</p>
            <p style="color: #475569;">
                Tempahan tiket bas anda telah berjaya disahkan.
            </p>
            <div style="background: #ecfeff; padding: 20px; border-radius: 8px; border: 1px solid #a5f3fc;">
                <p style="margin: 5px 0;"><strong>Nama Pelajar:</strong> {data.get('student_name', '-')}</p>
                <p style="margin: 5px 0;"><strong>Laluan:</strong> {data.get('route', '-')}</p>
                <p style="margin: 5px 0;"><strong>Tarikh:</strong> {data.get('trip_date', '-')}</p>
                <p style="margin: 5px 0;"><strong>Masa Bertolak:</strong> {data.get('departure_time', '-')}</p>
                <p style="margin: 5px 0;"><strong>No. Tempat Duduk:</strong> {data.get('seat_number', '-')}</p>
            </div>
        </div>
        <div style="padding: 20px; background: #1e293b; text-align: center;">
            <p style="color: #94a3b8; margin: 0; font-size: 12px;">
                © 2026 Portal MRSMKU - Sistem Pengurusan Sekolah Bersepadu
            </p>
        </div>
    </div>
    """
