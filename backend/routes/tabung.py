"""
Tabung & Sumbangan - Unified Donation Module
Gabungan modul Infaq Slot dan Sedekah dalam satu sistem bersepadu
Features:
- Slot-based campaigns (Infaq)
- Amount-based campaigns (Sedekah)
- Auto-generated receipts
- Real-time collection reports
- Financial ledger integration
- Payment status tracking
- QR Code generation for sharing
- Multi-image gallery support (up to 10 images)
- Social media sharing
- Public donation capability
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Any, Dict, Optional, List
from datetime import datetime, timezone
from bson import ObjectId
from enum import Enum
import uuid
import os
import io
from urllib.parse import quote, urlparse
import qrcode
from PIL import Image

router = APIRouter(prefix="/api/tabung", tags=["Tabung & Sumbangan"])
security = HTTPBearer(auto_error=False)

# Upload configuration (project-relative; override with env UPLOAD_DIR if set)
UPLOAD_DIR = os.environ.get(
    "UPLOAD_DIR",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads"))
)
CAMPAIGN_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "campaigns")
MAX_IMAGES = 10
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp', 'gif'}

try:
    os.makedirs(CAMPAIGN_UPLOAD_DIR, exist_ok=True)
except OSError:
    pass

# Global references
_get_db_func = None
_get_current_user_func = None
_log_audit_func = None


def init_router(get_db_func, current_user_dep, permission_dep, audit_func):
    """Initialize router with database and auth dependencies"""
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


async def get_current_user_optional(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        return None
    try:
        return await _get_current_user_func(credentials)
    except Exception:
        return None


def _to_number(value) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _to_bool(value, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "y", "on"}:
            return True
        if lowered in {"0", "false", "no", "n", "off"}:
            return False
    return bool(value)


def _to_datetime(value) -> Optional[datetime]:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    if isinstance(value, str):
        raw = value.strip()
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(raw)
            if dt.tzinfo is None:
                return dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            return None
    return None


def _as_object_id_if_valid(value):
    if isinstance(value, ObjectId):
        return value
    if isinstance(value, str):
        try:
            return ObjectId(value)
        except Exception:
            return value
    return value


async def log_audit(user, action, module, details):
    if _log_audit_func and user:
        await _log_audit_func(user, action, module, details)


async def _invalidate_financial_dashboard_cache_safely(db, scope: str = "all") -> None:
    try:
        from routes.financial_dashboard import invalidate_financial_dashboard_cache

        await invalidate_financial_dashboard_cache(db, scope=scope)
    except Exception:
        # Cache invalidation should never block write flow.
        pass


def _campaign_public_path(campaign_id: str) -> str:
    return f"/donate/{campaign_id}"


def _resolve_frontend_base_url(request: Optional[Request] = None) -> str:
    if request is not None:
        origin = (request.headers.get("origin") or "").strip()
        if origin:
            return origin.rstrip("/")

        referer = (request.headers.get("referer") or "").strip()
        if referer:
            try:
                parsed = urlparse(referer)
                if parsed.scheme and parsed.netloc:
                    return f"{parsed.scheme}://{parsed.netloc}"
            except Exception:
                pass

        try:
            return str(request.base_url).rstrip("/")
        except Exception:
            pass

    configured_url = (os.environ.get("FRONTEND_URL") or "").strip()
    if configured_url:
        return configured_url.rstrip("/")
    return ""


def _build_campaign_public_url(campaign_id: str, request: Optional[Request] = None) -> str:
    campaign_path = _campaign_public_path(campaign_id)
    base_url = _resolve_frontend_base_url(request)
    if not base_url:
        return campaign_path
    return f"{base_url}{campaign_path}"


TABUNG_MANAGER_ROLES = ["superadmin", "admin", "bendahari", "sub_bendahari"]
DEFAULT_UNLIMITED_MILESTONES = [50000.0, 100000.0, 200000.0]
MAX_MILESTONE_COUNT = 8


def _normalize_milestones(raw_values: Optional[List[Any]]) -> List[float]:
    candidates: List[Any] = []
    if isinstance(raw_values, list):
        candidates = raw_values
    elif isinstance(raw_values, str):
        candidates = [chunk.strip() for chunk in raw_values.split(",") if chunk.strip()]

    normalized: List[float] = []
    seen = set()
    for item in candidates:
        amount = round(_to_number(item), 2)
        if amount <= 0:
            continue
        key = int(amount * 100)
        if key in seen:
            continue
        seen.add(key)
        normalized.append(float(amount))

    normalized.sort()
    if not normalized:
        normalized = list(DEFAULT_UNLIMITED_MILESTONES)
    return normalized[:MAX_MILESTONE_COUNT]


def _build_milestone_progress(current_amount: Any, milestones: Optional[List[Any]] = None) -> Dict[str, float]:
    amount = max(_to_number(current_amount), 0.0)
    normalized_milestones = _normalize_milestones(milestones)

    floor = 0.0
    next_milestone = normalized_milestones[-1]
    previous = 0.0
    for milestone in normalized_milestones:
        if amount < milestone:
            next_milestone = milestone
            floor = previous
            break
        previous = milestone
    else:
        if len(normalized_milestones) > 1:
            step = normalized_milestones[-1] - normalized_milestones[-2]
        else:
            step = normalized_milestones[-1]
        step = max(step, 1.0)
        floor = previous
        next_milestone = previous + step
        while amount >= next_milestone:
            floor = next_milestone
            next_milestone += step

    span = max(next_milestone - floor, 1.0)
    segment_percent = min(max(((amount - floor) / span) * 100.0, 0.0), 100.0)
    track_max = max(normalized_milestones[-1], 1.0)
    overall_percent = max((amount / track_max) * 100.0, 0.0)

    return {
        "milestone_floor": float(floor),
        "milestone_next": float(next_milestone),
        "milestone_track_max": float(track_max),
        "milestone_remaining": float(max(next_milestone - amount, 0.0)),
        "milestone_segment_progress_percent": float(segment_percent),
        "milestone_overall_progress_percent": float(overall_percent),
    }


def _is_unlimited_amount_campaign(doc: Dict[str, Any]) -> bool:
    return _to_bool(doc.get("is_unlimited"), default=False)


# ==================== ENUMS ====================

class CampaignType(str, Enum):
    SLOT = "slot"      # Slot-based (Infaq)
    AMOUNT = "amount"  # Amount-based (Sedekah)


class CampaignStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class PaymentStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    REFUNDED = "refunded"


class LedgerType(str, Enum):
    DONATION_RECEIVED = "donation_received"
    DONATION_SLOT = "donation_slot"
    DONATION_AMOUNT = "donation_amount"


# ==================== MODELS ====================

class CampaignCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    description: Optional[str] = ""
    full_description: Optional[str] = ""  # Rich text description for detail page
    image_url: Optional[str] = ""
    campaign_type: CampaignType
    # For slot-based
    total_slots: Optional[int] = None
    price_per_slot: Optional[float] = None
    min_slots: Optional[int] = 1
    max_slots: Optional[int] = 5000
    # For amount-based
    target_amount: Optional[float] = None
    min_amount: Optional[float] = 1.0
    max_amount: Optional[float] = 100000.0
    is_unlimited: Optional[bool] = False  # No hard target cap for sedekah
    milestones: Optional[List[float]] = None  # Milestone checkpoints for unlimited mode
    # Common
    is_permanent: Optional[bool] = False  # Kempen sepanjang masa
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_public: Optional[bool] = True  # Allow public donations
    allow_anonymous: Optional[bool] = True


class CampaignUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    full_description: Optional[str] = None
    image_url: Optional[str] = None
    total_slots: Optional[int] = None
    price_per_slot: Optional[float] = None
    min_slots: Optional[int] = None
    max_slots: Optional[int] = None
    target_amount: Optional[float] = None
    min_amount: Optional[float] = None
    max_amount: Optional[float] = None
    is_unlimited: Optional[bool] = None
    milestones: Optional[List[float]] = None
    status: Optional[CampaignStatus] = None
    is_permanent: Optional[bool] = None  # Kempen sepanjang masa
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_public: Optional[bool] = None
    allow_anonymous: Optional[bool] = None
    is_featured: Optional[bool] = None  # Featured campaign flag


class DonationCreate(BaseModel):
    campaign_id: str
    # For slot-based
    slots: Optional[int] = None
    # For amount-based
    amount: Optional[float] = None
    # Common
    payment_method: str = "fpx"
    is_anonymous: bool = False
    message: Optional[str] = None


# ==================== HELPERS ====================

def generate_receipt_number(prefix: str = "TAB"):
    """Generate unique receipt number"""
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    unique_id = uuid.uuid4().hex[:6].upper()
    return f"{prefix}-{timestamp}-{unique_id}"


async def generate_accounting_transaction_number(db):
    """Generate unique transaction number: TRX-YYYY-XXXX"""
    year = datetime.now().year
    prefix = f"TRX-{year}-"
    
    # Find latest transaction number for this year
    latest = await db.accounting_transactions.find_one(
        {"transaction_number": {"$regex": f"^{prefix}"}},
        sort=[("transaction_number", -1)]
    )
    
    if latest and latest.get("transaction_number"):
        try:
            last_num = int(latest["transaction_number"].split("-")[-1])
            next_num = last_num + 1
        except Exception:
            next_num = 1
    else:
        next_num = 1
    
    return f"{prefix}{str(next_num).zfill(4)}"


async def create_accounting_transaction(db, amount, campaign_title, donor_name, receipt_number, campaign_type, slots=None):
    """
    Create an accounting transaction for donation income.
    This synchronizes Tabung & Sumbangan with the Lejar Perakaunan.
    """
    try:
        # Find or create "Derma & Sumbangan" category
        category = await db.accounting_categories.find_one({
            "name": {"$regex": "Derma|Sumbangan|Tabung", "$options": "i"},
            "type": "income"
        })
        
        if not category:
            # Create default donation category
            category_result = await db.accounting_categories.insert_one({
                "name": "Derma & Sumbangan",
                "type": "income",
                "description": "Pendapatan dari derma dan sumbangan kempen",
                "is_active": True,
                "created_at": datetime.now(timezone.utc),
                "created_by": None,
                "created_by_name": "Sistem"
            })
            category_id = category_result.inserted_id
        else:
            category_id = category["_id"]
        
        # Generate transaction number
        transaction_number = await generate_accounting_transaction_number(db)
        
        # Create the accounting transaction
        description = f"Sumbangan {'slot' if slots else 'kempen'} - {campaign_title} daripada {donor_name}"
        if slots:
            description += f" ({slots} slot)"
        
        transaction_doc = {
            "transaction_number": transaction_number,
            "type": "income",  # Wang Masuk
            "category_id": category_id,
            "amount": amount,
            "transaction_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "description": description,
            "reference_number": receipt_number,
            "source": "system",  # Auto dari sistem
            "status": "verified",  # Auto-verified for system transactions
            "notes": f"Auto-sync dari modul Tabung & Sumbangan - {campaign_title}",
            "created_at": datetime.now(timezone.utc),
            "created_by": None,
            "created_by_name": "Sistem Tabung",
            "verified_at": datetime.now(timezone.utc),
            "verified_by_name": "Auto-verified"
        }
        
        await db.accounting_transactions.insert_one(transaction_doc)
        await _invalidate_financial_dashboard_cache_safely(db, scope="accounting")
        
        # Log the sync
        await db.accounting_audit_logs.insert_one({
            "transaction_id": None,
            "transaction_number": transaction_number,
            "action": "create",
            "old_value": None,
            "new_value": f"RM {amount:.2f}",
            "performed_by": None,
            "performed_by_name": "Sistem Tabung",
            "performed_by_role": "system",
            "performed_at": datetime.now(timezone.utc),
            "notes": f"Auto-sync sumbangan: {campaign_title} ({receipt_number})"
        })
        
    except Exception as e:
        # Log error but don't fail the donation
        print(f"[ACCOUNTING SYNC ERROR] {str(e)}")


async def generate_campaign_qr_code(
    db,
    campaign_id: str,
    campaign_title: str,
    request: Optional[Request] = None,
):
    """
    Generate QR code for campaign and store in database.
    Returns base64 encoded QR code image.
    """
    import base64
    from io import BytesIO
    
    try:
        campaign_url = _build_campaign_public_url(campaign_id, request=request)
        
        # Generate QR code with emerald color
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=10,
            border=4
        )
        qr.add_data(campaign_url)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="#10B981", back_color="white")  # Emerald color
        
        # Convert to base64
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        qr_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        # Update campaign with QR code
        await db.tabung_campaigns.update_one(
            {"_id": _as_object_id_if_valid(campaign_id)},
            {"$set": {
                "qr_code_base64": qr_base64,
                "qr_code_url": campaign_url
            }}
        )
        
        print(f"[QR CODE] Generated for campaign: {campaign_title}")
        return qr_base64
        
    except Exception as e:
        print(f"[QR CODE ERROR] {str(e)}")
        return None


def get_date_status(start_date_str, end_date_str):
    """Get campaign date status based on start and end dates"""
    now = datetime.now(timezone.utc)
    
    def ensure_timezone_aware(dt):
        """Ensure datetime is timezone aware"""
        if dt is None:
            return None
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt
    
    def parse_date(date_input, is_end_date=False):
        """Parse date input and return timezone-aware datetime"""
        if date_input is None:
            return None
        
        try:
            if isinstance(date_input, datetime):
                return ensure_timezone_aware(date_input)
            
            date_str = str(date_input).strip()
            
            # Try parsing full ISO format with timezone
            if 'T' in date_str or '+' in date_str or 'Z' in date_str:
                parsed = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                return ensure_timezone_aware(parsed)
            else:
                # Date only format (YYYY-MM-DD)
                if is_end_date:
                    # End date should be end of day
                    return datetime.strptime(date_str[:10], "%Y-%m-%d").replace(
                        hour=23, minute=59, second=59, tzinfo=timezone.utc
                    )
                else:
                    # Start date should be start of day
                    return datetime.strptime(date_str[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except Exception:
            return None
    
    start_date = parse_date(start_date_str, is_end_date=False)
    end_date = parse_date(end_date_str, is_end_date=True)
    
    # Determine status
    date_status = "active"  # Default
    date_remark = None
    can_donate = True
    
    if start_date and now < start_date:
        date_status = "upcoming"
        date_remark = "Belum Dilancarkan"
        can_donate = False
    elif end_date and now > end_date:
        date_status = "ended"
        date_remark = "Kutipan Sudah Tamat"
        can_donate = False
    
    return {
        "date_status": date_status,
        "date_remark": date_remark,
        "can_donate": can_donate,
        "start_date": start_date.isoformat() if start_date else None,
        "end_date": end_date.isoformat() if end_date else None
    }


def serialize_campaign(doc):
    """Serialize campaign document"""
    if not doc:
        return None
    
    # Get date status
    date_info = get_date_status(doc.get("start_date"), doc.get("end_date"))
    
    # Calculate days remaining until end date
    days_remaining = None
    if doc.get("end_date"):
        try:
            end_date_str = doc.get("end_date")
            if isinstance(end_date_str, datetime):
                end_dt = end_date_str
            else:
                end_dt = datetime.fromisoformat(str(end_date_str).replace('Z', '+00:00')) if 'T' in str(end_date_str) else datetime.strptime(str(end_date_str)[:10], "%Y-%m-%d")
            
            now = datetime.now(timezone.utc)
            if end_dt.tzinfo is None:
                end_dt = end_dt.replace(tzinfo=timezone.utc)
            
            delta = end_dt - now
            days_remaining = max(0, delta.days)
        except Exception:
            days_remaining = None
    
    campaign = {
        "id": str(doc["_id"]),
        "title": doc["title"],
        "description": doc.get("description", ""),
        "full_description": doc.get("full_description", ""),
        "category": doc.get("category"),
        "image_url": doc.get("image_url", ""),
        "images": doc.get("images", []),  # Gallery images
        "campaign_type": doc["campaign_type"],
        "status": doc.get("status", "active"),
        "donor_count": doc.get("donor_count", 0),
        "is_public": doc.get("is_public", True),
        "allow_anonymous": doc.get("allow_anonymous", True),
        "is_featured": doc.get("is_featured", False),  # Featured campaign flag
        "is_permanent": doc.get("is_permanent", False),  # Kempen sepanjang masa
        "days_remaining": days_remaining,  # Days until campaign ends
        # Date fields
        "start_date": date_info["start_date"],
        "end_date": date_info["end_date"],
        "date_status": date_info["date_status"],
        "date_remark": date_info["date_remark"],
        "can_donate": date_info["can_donate"],
        "created_at": doc["created_at"].isoformat() if isinstance(doc.get("created_at"), datetime) else doc.get("created_at"),
        "updated_at": doc.get("updated_at").isoformat() if isinstance(doc.get("updated_at"), datetime) else doc.get("updated_at")
    }
    
    if doc["campaign_type"] == CampaignType.SLOT.value:
        campaign["total_slots"] = doc.get("total_slots", 0)
        campaign["slots_sold"] = doc.get("slots_sold", 0)
        campaign["slots_available"] = campaign["total_slots"] - campaign["slots_sold"]
        campaign["price_per_slot"] = doc.get("price_per_slot", 0)
        campaign["min_slots"] = doc.get("min_slots", 1)
        campaign["max_slots"] = doc.get("max_slots", 5000)
        campaign["total_collected"] = campaign["slots_sold"] * campaign["price_per_slot"]
        campaign["progress_percent"] = (campaign["slots_sold"] / campaign["total_slots"] * 100) if campaign["total_slots"] > 0 else 0
        campaign["is_unlimited"] = False
        campaign["milestones"] = []
    else:
        is_unlimited = _is_unlimited_amount_campaign(doc)
        milestones = _normalize_milestones(doc.get("milestones"))

        campaign["is_unlimited"] = is_unlimited
        campaign["milestones"] = milestones
        default_target = milestones[-1] if is_unlimited else 0
        campaign["target_amount"] = _to_number(doc.get("target_amount", default_target) or default_target)
        campaign["collected_amount"] = _to_number(doc.get("collected_amount", 0))
        campaign["min_amount"] = _to_number(doc.get("min_amount", 1)) or 1
        campaign["max_amount"] = _to_number(doc.get("max_amount", 100000)) or 100000
        campaign["total_collected"] = campaign["collected_amount"]
        if is_unlimited:
            milestone_progress = _build_milestone_progress(campaign["collected_amount"], milestones)
            campaign.update(milestone_progress)
            campaign["progress_percent"] = campaign["milestone_segment_progress_percent"]
        else:
            campaign["progress_percent"] = (
                (campaign["collected_amount"] / campaign["target_amount"] * 100)
                if campaign["target_amount"] > 0
                else 0
            )
    
    # QR Code for campaign
    campaign["qr_code_base64"] = doc.get("qr_code_base64")
    campaign["qr_code_url"] = doc.get("qr_code_url")
    
    return campaign


def serialize_donation(doc, campaign_type: str = None):
    """Serialize donation document"""
    if not doc:
        return None
    
    donation = {
        "id": str(doc["_id"]),
        "campaign_id": str(doc["campaign_id"]) if isinstance(doc.get("campaign_id"), ObjectId) else doc.get("campaign_id"),
        "campaign_title": doc.get("campaign_title", ""),
        "campaign_type": doc.get("campaign_type", campaign_type),
        "donor_name": doc.get("donor_name", "Penderma"),
        "is_anonymous": doc.get("is_anonymous", False),
        "amount": doc.get("amount", 0),
        "payment_method": doc.get("payment_method", "fpx"),
        "payment_status": doc.get("payment_status", "completed"),
        "receipt_number": doc.get("receipt_number", ""),
        "message": doc.get("message"),
        "created_at": doc["created_at"].isoformat() if isinstance(doc.get("created_at"), datetime) else doc.get("created_at")
    }
    
    # Add slot info if slot-based
    if doc.get("slots"):
        donation["slots"] = doc["slots"]
        donation["price_per_slot"] = doc.get("price_per_slot", 0)
        donation["is_slot_based"] = True
    else:
        donation["is_slot_based"] = False
    
    return donation


# ==================== CAMPAIGN MANAGEMENT ====================

@router.post("/campaigns", response_model=dict)
async def create_campaign(data: CampaignCreate, request: Request, user: dict = Depends(get_current_user)):
    """Create new donation campaign - Admin only"""
    db = get_db()
    
    if user["role"] not in TABUNG_MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Validate based on campaign type
    if data.campaign_type == CampaignType.SLOT:
        if not data.total_slots or not data.price_per_slot:
            raise HTTPException(status_code=400, detail="Kempen slot memerlukan jumlah slot dan harga per slot")
        if data.total_slots < 1:
            raise HTTPException(status_code=400, detail="Jumlah slot mesti sekurang-kurangnya 1")
    else:
        is_unlimited = _to_bool(data.is_unlimited, default=False)
        normalized_milestones = _normalize_milestones(data.milestones)
        if not is_unlimited:
            if not data.target_amount:
                raise HTTPException(status_code=400, detail="Kempen sumbangan memerlukan jumlah sasaran")
            if data.target_amount < 1:
                raise HTTPException(status_code=400, detail="Jumlah sasaran mesti sekurang-kurangnya RM 1")
    
    campaign_doc = {
        "title": data.title,
        "description": data.description or "",
        "full_description": data.full_description or "",
        "image_url": data.image_url or "",
        "images": [],  # Gallery images
        "campaign_type": data.campaign_type.value,
        "status": CampaignStatus.ACTIVE.value,
        "donor_count": 0,
        "is_public": data.is_public if data.is_public is not None else True,
        "allow_anonymous": data.allow_anonymous if data.allow_anonymous is not None else True,
        "start_date": data.start_date,
        "end_date": data.end_date,
        "created_by": str(user["_id"]),
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    
    if data.campaign_type == CampaignType.SLOT:
        campaign_doc.update({
            "total_slots": data.total_slots,
            "slots_sold": 0,
            "price_per_slot": data.price_per_slot,
            "min_slots": data.min_slots or 1,
            "max_slots": data.max_slots or 5000
        })
    else:
        effective_target = data.target_amount
        if is_unlimited and (_to_number(effective_target) <= 0):
            effective_target = normalized_milestones[-1]
        campaign_doc.update({
            "target_amount": _to_number(effective_target),
            "collected_amount": 0.0,
            "min_amount": data.min_amount or 1.0,
            "max_amount": data.max_amount or 100000.0,
            "is_unlimited": is_unlimited,
            "milestones": normalized_milestones,
        })
    
    # Handle permanent campaign vs dated campaign
    campaign_doc["is_permanent"] = data.is_permanent or False
    if not data.is_permanent:
        if data.start_date:
            campaign_doc["start_date"] = data.start_date
        if data.end_date:
            campaign_doc["end_date"] = data.end_date
    
    result = await db.tabung_campaigns.insert_one(campaign_doc)
    campaign_id = str(result.inserted_id)
    await _invalidate_financial_dashboard_cache_safely(db, scope="campaign")
    
    # Generate QR code for the new campaign
    await generate_campaign_qr_code(db, campaign_id, data.title, request=request)
    
    await log_audit(user, "CREATE_CAMPAIGN", "tabung", f"Cipta kempen: {data.title} ({data.campaign_type.value})")
    
    return {
        "id": campaign_id,
        "message": "Kempen berjaya dicipta"
    }


@router.get("/campaigns", response_model=List[dict])
async def get_campaigns(
    campaign_type: Optional[str] = None,
    status: Optional[str] = None,
    active_only: bool = False,
    user: dict = Depends(get_current_user_optional)
):
    """Get all campaigns"""
    db = get_db()
    
    query = {}
    
    if campaign_type:
        query["campaign_type"] = campaign_type
    
    if status:
        query["status"] = status
    elif active_only:
        query["status"] = CampaignStatus.ACTIVE.value
    
    # Non-admin only sees active campaigns
    is_admin = user and user.get("role") in TABUNG_MANAGER_ROLES
    if not is_admin:
        query["status"] = CampaignStatus.ACTIVE.value
    
    campaigns = await db.tabung_campaigns.find(query).sort("created_at", -1).to_list(100)
    
    return [serialize_campaign(c) for c in campaigns]


@router.get("/campaigns/{campaign_id}", response_model=dict)
async def get_campaign(campaign_id: str, user: dict = Depends(get_current_user_optional)):
    """Get single campaign with details"""
    db = get_db()
    
    campaign_lookup_id = _as_object_id_if_valid(campaign_id)
    campaign = await db.tabung_campaigns.find_one({"_id": campaign_lookup_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Kempen tidak dijumpai")
    
    # Non-admin can only see active campaigns
    is_admin = user and user.get("role") in TABUNG_MANAGER_ROLES
    if not is_admin and campaign.get("status") != CampaignStatus.ACTIVE.value:
        raise HTTPException(status_code=404, detail="Kempen tidak dijumpai")
    
    result = serialize_campaign(campaign)
    
    # Get recent donations
    donations = await db.tabung_donations.find(
        {"campaign_id": campaign_lookup_id}
    ).sort("created_at", -1).limit(20).to_list(20)
    
    result["recent_donations"] = []
    for d in donations:
        donor_info = {
            "donor_name": "Tanpa Nama" if d.get("is_anonymous") else d.get("donor_name", "Penderma"),
            "amount": d.get("amount", 0),
            "message": d.get("message"),
            "created_at": d["created_at"].isoformat() if isinstance(d.get("created_at"), datetime) else d.get("created_at")
        }
        if d.get("slots"):
            donor_info["slots"] = d["slots"]
        result["recent_donations"].append(donor_info)
    
    return result


@router.put("/campaigns/{campaign_id}", response_model=dict)
async def update_campaign(
    campaign_id: str,
    data: CampaignUpdate,
    user: dict = Depends(get_current_user)
):
    """Update campaign - Admin only"""
    db = get_db()
    
    if user["role"] not in TABUNG_MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    campaign_lookup_id = _as_object_id_if_valid(campaign_id)
    campaign = await db.tabung_campaigns.find_one({"_id": campaign_lookup_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Kempen tidak dijumpai")
    
    update_data = {"updated_at": datetime.now(timezone.utc)}

    payload = data.dict(exclude_unset=True)

    requested_unlimited = _to_bool(
        payload.get("is_unlimited", campaign.get("is_unlimited")),
        default=False,
    )
    milestone_source = payload.get("milestones", campaign.get("milestones"))
    normalized_milestones = _normalize_milestones(milestone_source)

    if campaign.get("campaign_type") == CampaignType.AMOUNT.value:
        if requested_unlimited and _to_number(payload.get("target_amount", campaign.get("target_amount"))) <= 0:
            payload["target_amount"] = normalized_milestones[-1]
        if not requested_unlimited and "target_amount" in payload and _to_number(payload.get("target_amount")) < 1:
            raise HTTPException(status_code=400, detail="Jumlah sasaran mesti sekurang-kurangnya RM 1")
    else:
        # Unlimited mode and milestones are only applicable to amount campaigns.
        payload.pop("is_unlimited", None)
        payload.pop("milestones", None)

    for field, value in payload.items():
        if value is None:
            continue
        if field == "status":
            update_data[field] = value.value if hasattr(value, "value") else value
            continue
        if field == "is_unlimited":
            update_data[field] = requested_unlimited
            continue
        if field == "milestones":
            update_data[field] = normalized_milestones
            continue
        update_data[field] = value

    if campaign.get("campaign_type") == CampaignType.AMOUNT.value:
        # Ensure milestones stay valid when toggling to unlimited without explicit milestones field.
        if requested_unlimited and "milestones" not in update_data:
            update_data["milestones"] = normalized_milestones
        if "is_unlimited" in payload and "is_unlimited" not in update_data:
            update_data["is_unlimited"] = requested_unlimited
    
    await db.tabung_campaigns.update_one(
        {"_id": campaign_lookup_id},
        {"$set": update_data}
    )
    await _invalidate_financial_dashboard_cache_safely(db, scope="campaign")
    
    await log_audit(user, "UPDATE_CAMPAIGN", "tabung", f"Kemaskini kempen: {campaign['title']}")
    
    return {"message": "Kempen berjaya dikemaskini"}


@router.delete("/campaigns/{campaign_id}", response_model=dict)
async def delete_campaign(campaign_id: str, user: dict = Depends(get_current_user)):
    """Delete campaign (soft delete) - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    campaign_lookup_id = _as_object_id_if_valid(campaign_id)
    campaign = await db.tabung_campaigns.find_one({"_id": campaign_lookup_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Kempen tidak dijumpai")
    
    await db.tabung_campaigns.update_one(
        {"_id": campaign_lookup_id},
        {"$set": {"status": CampaignStatus.CANCELLED.value, "updated_at": datetime.now(timezone.utc)}}
    )
    await _invalidate_financial_dashboard_cache_safely(db, scope="campaign")
    
    await log_audit(user, "DELETE_CAMPAIGN", "tabung", f"Batal kempen: {campaign['title']}")
    
    return {"message": "Kempen berjaya dibatalkan"}


@router.put("/campaigns/{campaign_id}/featured", response_model=dict)
async def toggle_featured_campaign(campaign_id: str, user: dict = Depends(get_current_user)):
    """Toggle campaign featured status - Admin, Bendahari, Sub Bendahari only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    campaign_lookup_id = _as_object_id_if_valid(campaign_id)
    campaign = await db.tabung_campaigns.find_one({"_id": campaign_lookup_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Kempen tidak dijumpai")
    
    # Toggle featured status
    new_featured_status = not campaign.get("is_featured", False)
    
    await db.tabung_campaigns.update_one(
        {"_id": campaign_lookup_id},
        {"$set": {"is_featured": new_featured_status, "updated_at": datetime.now(timezone.utc)}}
    )
    await _invalidate_financial_dashboard_cache_safely(db, scope="campaign")
    
    action = "Set sebagai Pilihan Utama" if new_featured_status else "Buang dari Pilihan Utama"
    await log_audit(user, "TOGGLE_FEATURED", "tabung", f"{action}: {campaign['title']}")
    
    return {
        "message": f"Kempen {'ditetapkan sebagai' if new_featured_status else 'dibuang dari'} Pilihan Utama",
        "is_featured": new_featured_status
    }


# ==================== DONATION MANAGEMENT ====================

@router.post("/donate", response_model=dict)
async def make_donation(data: DonationCreate, user: dict = Depends(get_current_user)):
    """Make a donation"""
    db = get_db()
    
    campaign_lookup_id = _as_object_id_if_valid(data.campaign_id)
    campaign = await db.tabung_campaigns.find_one({"_id": campaign_lookup_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Kempen tidak dijumpai")
    
    if campaign.get("status") != CampaignStatus.ACTIVE.value:
        raise HTTPException(status_code=400, detail="Kempen tidak aktif")
    
    # Check date status
    date_info = get_date_status(campaign.get("start_date"), campaign.get("end_date"))
    if not date_info["can_donate"]:
        raise HTTPException(status_code=400, detail=date_info["date_remark"])
    
    campaign_type = campaign["campaign_type"]
    amount = 0
    slots = None
    
    # Validate and calculate amount
    if campaign_type == CampaignType.SLOT.value:
        if not data.slots or data.slots < 1:
            raise HTTPException(status_code=400, detail="Sila nyatakan bilangan slot")
        
        slots_available = campaign["total_slots"] - campaign.get("slots_sold", 0)
        if data.slots > slots_available:
            raise HTTPException(status_code=400, detail=f"Slot tidak mencukupi. Baki: {slots_available}")
        
        min_slots = campaign.get("min_slots", 1)
        max_slots = campaign.get("max_slots", 5000)
        if data.slots < min_slots:
            raise HTTPException(status_code=400, detail=f"Minimum {min_slots} slot")
        if data.slots > max_slots:
            raise HTTPException(status_code=400, detail=f"Maksimum {max_slots} slot")
        
        slots = data.slots
        amount = slots * campaign["price_per_slot"]
    else:
        if not data.amount or data.amount < 1:
            raise HTTPException(status_code=400, detail="Sila nyatakan jumlah sumbangan")
        
        min_amount = _to_number(campaign.get("min_amount", 1)) or 1
        max_amount = _to_number(campaign.get("max_amount", 100000))
        is_unlimited = _is_unlimited_amount_campaign(campaign)
        if data.amount < min_amount:
            raise HTTPException(status_code=400, detail=f"Minimum RM {min_amount}")
        if (not is_unlimited) and max_amount > 0 and data.amount > max_amount:
            raise HTTPException(status_code=400, detail=f"Maksimum RM {max_amount}")
        
        amount = data.amount
    
    # Get donor info
    donor_name = "Penderma Tanpa Nama" if data.is_anonymous else user.get("full_name", "Penderma")
    
    # Generate receipt
    prefix = "SLOT" if campaign_type == CampaignType.SLOT.value else "SED"
    receipt_number = generate_receipt_number(prefix)
    
    # Create donation record
    donation_doc = {
        "campaign_id": campaign_lookup_id,
        "campaign_title": campaign["title"],
        "campaign_type": campaign_type,
        "user_id": str(user["_id"]),
        "donor_name": donor_name,
        "donor_email": user.get("email", ""),
        "is_anonymous": data.is_anonymous,
        "amount": amount,
        "payment_method": data.payment_method,
        "payment_status": PaymentStatus.COMPLETED.value,  # Mock payment - completed immediately
        "message": data.message,
        "receipt_number": receipt_number,
        "created_at": datetime.now(timezone.utc)
    }
    
    if slots:
        donation_doc["slots"] = slots
        donation_doc["price_per_slot"] = campaign["price_per_slot"]
    
    result = await db.tabung_donations.insert_one(donation_doc)
    
    # Update campaign
    if campaign_type == CampaignType.SLOT.value:
        update_op = {
            "$inc": {"slots_sold": slots, "donor_count": 1},
            "$set": {"updated_at": datetime.now(timezone.utc)}
        }
        await db.tabung_campaigns.update_one({"_id": campaign_lookup_id}, update_op)
        
        # Check if complete
        updated_campaign = await db.tabung_campaigns.find_one({"_id": campaign_lookup_id})
        if updated_campaign["slots_sold"] >= updated_campaign["total_slots"]:
            await db.tabung_campaigns.update_one(
                {"_id": campaign_lookup_id},
                {"$set": {"status": CampaignStatus.COMPLETED.value}}
            )
    else:
        update_op = {
            "$inc": {"collected_amount": amount, "donor_count": 1},
            "$set": {"updated_at": datetime.now(timezone.utc)}
        }
        await db.tabung_campaigns.update_one({"_id": campaign_lookup_id}, update_op)
        
        # Check if complete
        updated_campaign = await db.tabung_campaigns.find_one({"_id": campaign_lookup_id})
        updated_is_unlimited = _is_unlimited_amount_campaign(updated_campaign or {})
        target_amount = _to_number((updated_campaign or {}).get("target_amount"))
        collected_amount = _to_number((updated_campaign or {}).get("collected_amount"))
        if (not updated_is_unlimited) and target_amount > 0 and collected_amount >= target_amount:
            await db.tabung_campaigns.update_one(
                {"_id": campaign_lookup_id},
                {"$set": {"status": CampaignStatus.COMPLETED.value}}
            )
    await _invalidate_financial_dashboard_cache_safely(db, scope="donation")
    
    # Create ledger entry (financial_ledger)
    ledger_type = LedgerType.DONATION_SLOT.value if campaign_type == CampaignType.SLOT.value else LedgerType.DONATION_AMOUNT.value
    ledger_entry = {
        "type": ledger_type,
        "amount": amount,
        "donation_id": str(result.inserted_id),
        "campaign_id": data.campaign_id,
        "campaign_title": campaign["title"],
        "donor_name": donor_name,
        "description": f"Sumbangan {'slot' if slots else 'umum'} untuk {campaign['title']}",
        "reference_number": receipt_number,
        "created_at": datetime.now(timezone.utc)
    }
    await db.financial_ledger.insert_one(ledger_entry)
    
    # ===== SYNC WITH ACCOUNTING MODULE =====
    # Create accounting transaction for donation income
    await create_accounting_transaction(
        db=db,
        amount=amount,
        campaign_title=campaign["title"],
        donor_name=donor_name,
        receipt_number=receipt_number,
        campaign_type=campaign_type,
        slots=slots
    )
    
    # Notify user
    await db.notifications.insert_one({
        "user_id": user["_id"],
        "title": "Sumbangan Berjaya",
        "message": f"Terima kasih atas sumbangan RM {amount:.2f} untuk {campaign['title']}. No. Resit: {receipt_number}",
        "type": "success",
        "category": "tabung",
        "action_url": "/tabung",
        "action_label": "Lihat Kempen",
        "metadata": {
            "campaign_id": str(campaign.get("_id")) if campaign.get("_id") is not None else str(data.campaign_id),
            "donation_id": str(result.inserted_id),
            "receipt_number": receipt_number,
        },
        "is_read": False,
        "created_at": datetime.now(timezone.utc)
    })
    
    await log_audit(user, "DONATE", "tabung", f"Sumbangan RM{amount:.2f} untuk {campaign['title']}")
    
    return {
        "id": str(result.inserted_id),
        "campaign_id": data.campaign_id,
        "campaign_title": campaign["title"],
        "campaign_type": campaign_type,
        "donor_name": donor_name,
        "amount": amount,
        "slots": slots,
        "payment_status": PaymentStatus.COMPLETED.value,
        "receipt_number": receipt_number,
        "message": "Sumbangan berjaya direkodkan. Terima kasih!"
    }


@router.get("/donations/my", response_model=List[dict])
async def get_my_donations(user: dict = Depends(get_current_user)):
    """Get current user's donation history"""
    db = get_db()
    
    donations = await db.tabung_donations.find(
        {"user_id": str(user["_id"])}
    ).sort("created_at", -1).to_list(100)
    
    return [serialize_donation(d) for d in donations]


@router.get("/donations", response_model=List[dict])
async def get_all_donations(
    campaign_id: Optional[str] = None,
    campaign_type: Optional[str] = None,
    payment_status: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Get all donations - Admin only"""
    db = get_db()
    
    if user["role"] not in TABUNG_MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    query = {}
    if campaign_id:
        query["campaign_id"] = _as_object_id_if_valid(campaign_id)
    if campaign_type:
        query["campaign_type"] = campaign_type
    if payment_status:
        query["payment_status"] = payment_status
    
    donations = await db.tabung_donations.find(query).sort("created_at", -1).to_list(500)
    
    return [serialize_donation(d) for d in donations]


@router.get("/donations/{donation_id}", response_model=dict)
async def get_donation(donation_id: str, user: dict = Depends(get_current_user)):
    """Get donation details"""
    db = get_db()
    
    donation_lookup_id = _as_object_id_if_valid(donation_id)
    donation = await db.tabung_donations.find_one({"_id": donation_lookup_id})
    if not donation:
        raise HTTPException(status_code=404, detail="Sumbangan tidak dijumpai")
    
    # Check access
    is_admin = user["role"] in TABUNG_MANAGER_ROLES
    is_owner = str(user["_id"]) == donation.get("user_id")
    
    if not is_admin and not is_owner:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    return serialize_donation(donation)


# ==================== STATISTICS & REPORTS ====================

@router.get("/stats", response_model=dict)
async def get_stats(user: dict = Depends(get_current_user)):
    """Get overall statistics - Admin only"""
    db = get_db()
    
    if user["role"] not in TABUNG_MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Campaign stats
    total_campaigns = await db.tabung_campaigns.count_documents({})
    active_campaigns = await db.tabung_campaigns.count_documents({"status": CampaignStatus.ACTIVE.value})
    completed_campaigns = await db.tabung_campaigns.count_documents({"status": CampaignStatus.COMPLETED.value})
    
    slot_campaigns = await db.tabung_campaigns.count_documents({"campaign_type": CampaignType.SLOT.value})
    amount_campaigns = await db.tabung_campaigns.count_documents({"campaign_type": CampaignType.AMOUNT.value})
    
    donation_rows = await db.tabung_donations.find(
        {"payment_status": PaymentStatus.COMPLETED.value}
    ).to_list(200000)

    donation_stats = {
        "total_amount": sum(_to_number(d.get("amount")) for d in donation_rows),
        "total_donations": len(donation_rows),
        "total_slots": sum(
            int(_to_number(d.get("slots")))
            for d in donation_rows
            if d.get("slots") is not None
        ),
    }

    slot_rows = [d for d in donation_rows if d.get("campaign_type") == CampaignType.SLOT.value]
    amount_rows = [d for d in donation_rows if d.get("campaign_type") == CampaignType.AMOUNT.value]
    slot_stats = {
        "total": sum(_to_number(d.get("amount")) for d in slot_rows),
        "count": len(slot_rows),
    }
    amount_stats = {
        "total": sum(_to_number(d.get("amount")) for d in amount_rows),
        "count": len(amount_rows),
    }

    unique_donors = {
        str(d.get("user_id"))
        for d in donation_rows
        if d.get("user_id") is not None
    }

    top_donor_map: Dict[str, Dict[str, Any]] = {}
    for donation in donation_rows:
        if donation.get("is_anonymous"):
            continue
        donor_name = (donation.get("donor_name") or "").strip()
        if not donor_name:
            continue
        if donor_name not in top_donor_map:
            top_donor_map[donor_name] = {"name": donor_name, "total": 0.0, "count": 0}
        top_donor_map[donor_name]["total"] += _to_number(donation.get("amount"))
        top_donor_map[donor_name]["count"] += 1
    top_donors = sorted(
        top_donor_map.values(),
        key=lambda row: row["total"],
        reverse=True,
    )[:10]

    monthly_map: Dict[str, Dict[str, Any]] = {}
    for donation in donation_rows:
        created_at = _to_datetime(donation.get("created_at"))
        if created_at is None:
            continue
        month_key = created_at.strftime("%Y-%m")
        if month_key not in monthly_map:
            monthly_map[month_key] = {"month": month_key, "total": 0.0, "count": 0}
        monthly_map[month_key]["total"] += _to_number(donation.get("amount"))
        monthly_map[month_key]["count"] += 1
    monthly_trend = [monthly_map[key] for key in sorted(monthly_map.keys(), reverse=True)[:12]]
    
    return {
        "campaigns": {
            "total": total_campaigns,
            "active": active_campaigns,
            "completed": completed_campaigns,
            "slot_based": slot_campaigns,
            "amount_based": amount_campaigns
        },
        "donations": {
            "total_amount": donation_stats["total_amount"],
            "total_donations": donation_stats["total_donations"],
            "total_slots_sold": donation_stats["total_slots"],
            "unique_donors": len(unique_donors)
        },
        "by_type": {
            "slot": {"total": slot_stats["total"], "count": slot_stats["count"]},
            "amount": {"total": amount_stats["total"], "count": amount_stats["count"]}
        },
        "top_donors": [
            {"name": d["name"], "total": d["total"], "count": d["count"]}
            for d in top_donors
        ],
        "monthly_trend": monthly_trend
    }


@router.get("/reports/real-time", response_model=dict)
async def get_realtime_report(user: dict = Depends(get_current_user)):
    """Get real-time collection report"""
    db = get_db()
    
    if user["role"] not in TABUNG_MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Today's collections
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    
    today_rows = await db.tabung_donations.find(
        {"payment_status": PaymentStatus.COMPLETED.value, "created_at": {"$gte": today_start}}
    ).to_list(50000)
    today_stats = {
        "total": sum(_to_number(row.get("amount")) for row in today_rows),
        "count": len(today_rows),
    }
    
    # This month's collections
    month_start = today_start.replace(day=1)
    
    month_rows = await db.tabung_donations.find(
        {"payment_status": PaymentStatus.COMPLETED.value, "created_at": {"$gte": month_start}}
    ).to_list(200000)
    month_stats = {
        "total": sum(_to_number(row.get("amount")) for row in month_rows),
        "count": len(month_rows),
    }
    
    # Recent donations (last 20)
    recent = await db.tabung_donations.find(
        {"payment_status": PaymentStatus.COMPLETED.value}
    ).sort("created_at", -1).limit(20).to_list(20)
    
    # Active campaigns summary
    active_campaigns = await db.tabung_campaigns.find(
        {"status": CampaignStatus.ACTIVE.value}
    ).to_list(50)
    
    campaigns_summary = []
    for c in active_campaigns:
        summary = {
            "id": str(c["_id"]),
            "title": c["title"],
            "campaign_type": c["campaign_type"],
            "donor_count": c.get("donor_count", 0)
        }
        
        if c["campaign_type"] == CampaignType.SLOT.value:
            summary["progress"] = f"{c.get('slots_sold', 0)}/{c.get('total_slots', 0)} slot"
            summary["collected"] = c.get("slots_sold", 0) * c.get("price_per_slot", 0)
            summary["progress_percent"] = (c.get("slots_sold", 0) / c.get("total_slots", 1)) * 100
        else:
            collected_amount = _to_number(c.get("collected_amount", 0))
            is_unlimited = _is_unlimited_amount_campaign(c)
            summary["collected"] = collected_amount
            summary["is_unlimited"] = is_unlimited
            if is_unlimited:
                milestone_progress = _build_milestone_progress(collected_amount, c.get("milestones"))
                summary["progress"] = (
                    f"RM {collected_amount:,.2f}/RM {milestone_progress['milestone_next']:,.2f} "
                    "(Milestone)"
                )
                summary["progress_percent"] = milestone_progress["milestone_segment_progress_percent"]
                summary["milestone_next"] = milestone_progress["milestone_next"]
            else:
                target_amount = _to_number(c.get("target_amount", 0))
                summary["progress"] = f"RM {collected_amount:,.2f}/RM {target_amount:,.2f}"
                summary["progress_percent"] = (collected_amount / target_amount) * 100 if target_amount > 0 else 0
        
        campaigns_summary.append(summary)
    
    return {
        "today": {"total": today_stats["total"], "count": today_stats["count"]},
        "this_month": {"total": month_stats["total"], "count": month_stats["count"]},
        "recent_donations": [serialize_donation(d) for d in recent],
        "active_campaigns": campaigns_summary,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }


@router.get("/reports/ledger", response_model=List[dict])
async def get_ledger_entries(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Get financial ledger entries for donations"""
    db = get_db()
    
    if user["role"] not in TABUNG_MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    query = {"type": {"$in": [LedgerType.DONATION_SLOT.value, LedgerType.DONATION_AMOUNT.value, LedgerType.DONATION_RECEIVED.value]}}
    
    if start_date:
        query["created_at"] = {"$gte": datetime.fromisoformat(start_date)}
    if end_date:
        if "created_at" in query:
            query["created_at"]["$lte"] = datetime.fromisoformat(end_date)
        else:
            query["created_at"] = {"$lte": datetime.fromisoformat(end_date)}
    
    entries = await db.financial_ledger.find(query).sort("created_at", -1).to_list(500)
    
    result = []
    for e in entries:
        result.append({
            "id": str(e["_id"]),
            "type": e["type"],
            "amount": e["amount"],
            "campaign_title": e.get("campaign_title", ""),
            "donor_name": e.get("donor_name", ""),
            "description": e.get("description", ""),
            "reference_number": e.get("reference_number", ""),
            "created_at": e["created_at"].isoformat() if isinstance(e.get("created_at"), datetime) else e.get("created_at")
        })
    
    return result


# ==================== PUBLIC ENDPOINTS ====================

@router.get("/public/campaigns", response_model=List[dict])
async def get_public_campaigns(limit: int = 50):
    """Get public active campaigns"""
    db = get_db()
    
    campaigns = await db.tabung_campaigns.find(
        {"status": CampaignStatus.ACTIVE.value}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return [serialize_campaign(c) for c in campaigns]


@router.get("/public/campaigns/{campaign_id}", response_model=dict)
async def get_public_campaign(campaign_id: str):
    """Get public campaign details"""
    db = get_db()
    
    try:
        campaign = await db.tabung_campaigns.find_one({
            "_id": _as_object_id_if_valid(campaign_id),
            "$or": [
                {"is_public": True},
                {"status": CampaignStatus.ACTIVE.value},  # Allow active campaigns
                {"status": CampaignStatus.COMPLETED.value}  # Allow completed campaigns
            ]
        })
    except Exception:
        raise HTTPException(status_code=400, detail="ID kempen tidak sah")
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Kempen tidak dijumpai")
    
    result = serialize_campaign(campaign)
    
    # Get recent public donations
    donations = await db.tabung_donations.find(
        {
            "campaign_id": _as_object_id_if_valid(campaign_id),
            "payment_status": PaymentStatus.COMPLETED.value,
        }
    ).sort("created_at", -1).limit(10).to_list(10)
    
    result["recent_donations"] = []
    for d in donations:
        result["recent_donations"].append({
            "donor_name": "Tanpa Nama" if d.get("is_anonymous") else d.get("donor_name", "Penderma"),
            "amount": d.get("amount", 0),
            "slots": d.get("slots"),
            "created_at": d["created_at"].isoformat() if isinstance(d.get("created_at"), datetime) else d.get("created_at")
        })
    
    return result


@router.get("/public/stats", response_model=dict)
async def get_public_stats():
    """Get public statistics"""
    db = get_db()
    
    active_campaigns = await db.tabung_campaigns.count_documents({"status": CampaignStatus.ACTIVE.value})
    
    donation_rows = await db.tabung_donations.find(
        {"payment_status": PaymentStatus.COMPLETED.value}
    ).to_list(200000)
    donation_stats = {
        "total": sum(_to_number(row.get("amount")) for row in donation_rows),
        "count": len(donation_rows),
    }

    unique_donors = {
        str(row.get("user_id"))
        for row in donation_rows
        if row.get("user_id") is not None
    }
    
    return {
        "active_campaigns": active_campaigns,
        "total_collected": donation_stats["total"],
        "total_donations": donation_stats["count"],
        "unique_donors": len(unique_donors)
    }


# ==================== IMAGE UPLOAD & QR CODE ====================

def compress_image(image_data: bytes, max_size: tuple = (1200, 1200), quality: int = 85) -> bytes:
    """Compress and resize image"""
    try:
        img = Image.open(io.BytesIO(image_data))
        if img.mode in ('RGBA', 'P'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[3] if len(img.split()) == 4 else None)
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        img.thumbnail(max_size, Image.Resampling.LANCZOS)
        output = io.BytesIO()
        img.save(output, format='JPEG', quality=quality, optimize=True)
        return output.getvalue()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gagal memproses gambar: {str(e)}")


@router.post("/campaigns/{campaign_id}/images", response_model=dict)
async def upload_campaign_image(
    campaign_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user)
):
    """Upload image to campaign gallery (max 10 images)"""
    db = get_db()
    
    if user["role"] not in TABUNG_MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    campaign_lookup_id = _as_object_id_if_valid(campaign_id)
    campaign = await db.tabung_campaigns.find_one({"_id": campaign_lookup_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Kempen tidak dijumpai")
    
    existing_images = campaign.get("images", [])
    if len(existing_images) >= MAX_IMAGES:
        raise HTTPException(status_code=400, detail=f"Maksimum {MAX_IMAGES} gambar sahaja")
    
    # Validate file extension
    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Jenis fail tidak dibenarkan")
    
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Saiz fail melebihi 5MB")
    
    # Compress image
    compressed = compress_image(content)
    
    # Generate unique filename
    filename = f"{campaign_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}.jpg"
    filepath = f"{CAMPAIGN_UPLOAD_DIR}/{filename}"
    
    with open(filepath, "wb") as f:
        f.write(compressed)
    
    image_url = f"/api/tabung/images/{filename}"
    
    image_doc = {
        "id": uuid.uuid4().hex[:12],
        "url": image_url,
        "filename": filename,
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Update campaign
    update_data = {
        "$push": {"images": image_doc},
        "$set": {"updated_at": datetime.now(timezone.utc)}
    }
    
    # Set as main image if first
    if len(existing_images) == 0:
        update_data["$set"]["image_url"] = image_url
    
    await db.tabung_campaigns.update_one({"_id": campaign_lookup_id}, update_data)
    
    await log_audit(user, "UPLOAD_IMAGE", "tabung", f"Muat naik gambar untuk kempen {campaign['title']}")
    
    return {
        "success": True,
        "message": "Gambar berjaya dimuat naik",
        "image": image_doc,
        "total_images": len(existing_images) + 1
    }


@router.delete("/campaigns/{campaign_id}/images/{image_id}", response_model=dict)
async def delete_campaign_image(
    campaign_id: str,
    image_id: str,
    user: dict = Depends(get_current_user)
):
    """Delete image from campaign gallery"""
    db = get_db()
    
    if user["role"] not in TABUNG_MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    campaign_lookup_id = _as_object_id_if_valid(campaign_id)
    campaign = await db.tabung_campaigns.find_one({"_id": campaign_lookup_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Kempen tidak dijumpai")
    
    images = campaign.get("images", [])
    image_to_delete = next((img for img in images if img["id"] == image_id), None)
    
    if not image_to_delete:
        raise HTTPException(status_code=404, detail="Gambar tidak dijumpai")
    
    # Delete file
    try:
        filepath = f"{CAMPAIGN_UPLOAD_DIR}/{image_to_delete['filename']}"
        if os.path.exists(filepath):
            os.remove(filepath)
    except Exception:
        pass
    
    # Update database
    new_images = [img for img in images if img["id"] != image_id]
    update_data = {"images": new_images, "updated_at": datetime.now(timezone.utc)}
    
    if campaign.get("image_url") == image_to_delete["url"]:
        update_data["image_url"] = new_images[0]["url"] if new_images else ""
    
    await db.tabung_campaigns.update_one({"_id": campaign_lookup_id}, {"$set": update_data})
    
    return {"success": True, "message": "Gambar berjaya dipadam"}


@router.put("/campaigns/{campaign_id}/images/{image_id}/primary", response_model=dict)
async def set_primary_image(
    campaign_id: str,
    image_id: str,
    user: dict = Depends(get_current_user)
):
    """Set image as primary campaign image"""
    db = get_db()
    
    if user["role"] not in TABUNG_MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    campaign_lookup_id = _as_object_id_if_valid(campaign_id)
    campaign = await db.tabung_campaigns.find_one({"_id": campaign_lookup_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Kempen tidak dijumpai")
    
    images = campaign.get("images", [])
    image = next((img for img in images if img["id"] == image_id), None)
    
    if not image:
        raise HTTPException(status_code=404, detail="Gambar tidak dijumpai")
    
    await db.tabung_campaigns.update_one(
        {"_id": campaign_lookup_id},
        {"$set": {"image_url": image["url"], "updated_at": datetime.now(timezone.utc)}}
    )
    
    return {"success": True, "message": "Gambar utama dikemaskini"}


from fastapi.responses import FileResponse

@router.get("/images/{filename}")
async def serve_campaign_image(filename: str):
    """Serve campaign images"""
    filepath = f"{CAMPAIGN_UPLOAD_DIR}/{filename}"
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Gambar tidak dijumpai")
    return FileResponse(filepath, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


@router.get("/campaigns/{campaign_id}/qrcode")
async def generate_qrcode(campaign_id: str, request: Request, size: int = 300):
    """Generate QR code for campaign sharing"""
    db = get_db()
    
    campaign_lookup_id = _as_object_id_if_valid(campaign_id)
    campaign = await db.tabung_campaigns.find_one({"_id": campaign_lookup_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Kempen tidak dijumpai")
    
    # Generate QR code with campaign URL based on current system domain.
    campaign_url = _build_campaign_public_url(campaign_id, request=request)
    
    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=10, border=2)
    qr.add_data(campaign_url)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="#047857", back_color="white")
    
    # Add logo/center icon (optional - simple green circle)
    img = img.convert("RGB")
    
    # Resize to requested size
    img = img.resize((size, size), Image.Resampling.LANCZOS)
    
    # Return as PNG
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="image/png",
        headers={"Content-Disposition": f"inline; filename=qr-{campaign_id}.png"}
    )


@router.get("/campaigns/{campaign_id}/share-data", response_model=dict)
async def get_share_data(campaign_id: str, request: Request):
    """Get sharing data for campaign"""
    db = get_db()
    
    campaign_lookup_id = _as_object_id_if_valid(campaign_id)
    campaign = await db.tabung_campaigns.find_one({"_id": campaign_lookup_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Kempen tidak dijumpai")
    
    campaign_path = _campaign_public_path(campaign_id)
    campaign_url = _build_campaign_public_url(campaign_id, request=request)
    
    title = campaign["title"]
    description = campaign.get("description", "")[:150]
    
    # Generate share URLs
    share_text = f"Jom sumbang untuk {title}! {description}"
    encoded_text = quote(share_text, safe="")
    encoded_url = quote(campaign_url, safe="")
    
    return {
        "campaign_id": campaign_id,
        "title": title,
        "description": description,
        "url": campaign_url,
        "path": campaign_path,
        "qr_code_url": f"/api/tabung/campaigns/{campaign_id}/qrcode",
        "share_links": {
            "whatsapp": f"https://wa.me/?text={encoded_text}%20{encoded_url}",
            "facebook": f"https://www.facebook.com/sharer/sharer.php?u={encoded_url}",
            "twitter": f"https://twitter.com/intent/tweet?text={encoded_text}&url={encoded_url}",
            "telegram": f"https://t.me/share/url?url={encoded_url}&text={encoded_text}"
        }
    }


# ==================== PUBLIC DONATION (For shared links) ====================

class PublicDonationCreate(BaseModel):
    campaign_id: str
    donor_name: str = "Penderma"
    donor_email: Optional[str] = None
    donor_phone: Optional[str] = None
    slots: Optional[int] = None
    amount: Optional[float] = None
    is_anonymous: bool = False
    message: Optional[str] = None


@router.post("/public/donate", response_model=dict)
async def make_public_donation(data: PublicDonationCreate):
    """Make donation without authentication (for shared links)"""
    db = get_db()
    
    campaign_lookup_id = _as_object_id_if_valid(data.campaign_id)
    campaign = await db.tabung_campaigns.find_one({"_id": campaign_lookup_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Kempen tidak dijumpai")
    
    if campaign.get("status") != CampaignStatus.ACTIVE.value:
        raise HTTPException(status_code=400, detail="Kempen tidak aktif")
    
    # Check date status
    date_info = get_date_status(campaign.get("start_date"), campaign.get("end_date"))
    if not date_info["can_donate"]:
        raise HTTPException(status_code=400, detail=date_info["date_remark"])
    
    if not campaign.get("is_public", True):
        raise HTTPException(status_code=403, detail="Kempen tidak terbuka untuk sumbangan awam")
    
    campaign_type = campaign["campaign_type"]
    amount = 0
    slots = None
    
    # Validate and calculate
    if campaign_type == CampaignType.SLOT.value:
        if not data.slots or data.slots < 1:
            raise HTTPException(status_code=400, detail="Sila nyatakan bilangan slot")
        slots_available = campaign["total_slots"] - campaign.get("slots_sold", 0)
        if data.slots > slots_available:
            raise HTTPException(status_code=400, detail=f"Slot tidak mencukupi. Baki: {slots_available}")
        slots = data.slots
        amount = slots * campaign["price_per_slot"]
    else:
        if not data.amount or data.amount < 1:
            raise HTTPException(status_code=400, detail="Sila nyatakan jumlah sumbangan")
        min_amount = _to_number(campaign.get("min_amount", 1)) or 1
        max_amount = _to_number(campaign.get("max_amount", 100000))
        is_unlimited = _is_unlimited_amount_campaign(campaign)
        if data.amount < min_amount:
            raise HTTPException(status_code=400, detail=f"Minimum RM {min_amount}")
        if (not is_unlimited) and max_amount > 0 and data.amount > max_amount:
            raise HTTPException(status_code=400, detail=f"Maksimum RM {max_amount}")
        amount = data.amount
    
    donor_name = "Penderma Tanpa Nama" if data.is_anonymous else data.donor_name
    prefix = "SLOT" if campaign_type == CampaignType.SLOT.value else "SED"
    receipt_number = generate_receipt_number(prefix)
    
    donation_doc = {
        "campaign_id": campaign_lookup_id,
        "campaign_title": campaign["title"],
        "campaign_type": campaign_type,
        "user_id": "public",  # Mark as public donation
        "donor_name": donor_name,
        "donor_email": data.donor_email or "",
        "donor_phone": data.donor_phone or "",
        "is_anonymous": data.is_anonymous,
        "is_public_donation": True,
        "amount": amount,
        "payment_method": "fpx",
        "payment_status": PaymentStatus.COMPLETED.value,
        "message": data.message,
        "receipt_number": receipt_number,
        "created_at": datetime.now(timezone.utc)
    }
    
    if slots:
        donation_doc["slots"] = slots
        donation_doc["price_per_slot"] = campaign["price_per_slot"]
    
    result = await db.tabung_donations.insert_one(donation_doc)
    
    # Update campaign
    if campaign_type == CampaignType.SLOT.value:
        await db.tabung_campaigns.update_one(
            {"_id": campaign_lookup_id},
            {"$inc": {"slots_sold": slots, "donor_count": 1}, "$set": {"updated_at": datetime.now(timezone.utc)}}
        )
        updated_campaign = await db.tabung_campaigns.find_one({"_id": campaign_lookup_id})
        if (
            updated_campaign
            and _to_number(updated_campaign.get("total_slots")) > 0
            and _to_number(updated_campaign.get("slots_sold")) >= _to_number(updated_campaign.get("total_slots"))
        ):
            await db.tabung_campaigns.update_one(
                {"_id": campaign_lookup_id},
                {"$set": {"status": CampaignStatus.COMPLETED.value}}
            )
    else:
        await db.tabung_campaigns.update_one(
            {"_id": campaign_lookup_id},
            {"$inc": {"collected_amount": amount, "donor_count": 1}, "$set": {"updated_at": datetime.now(timezone.utc)}}
        )
        updated_campaign = await db.tabung_campaigns.find_one({"_id": campaign_lookup_id})
        updated_is_unlimited = _is_unlimited_amount_campaign(updated_campaign or {})
        target_amount = _to_number((updated_campaign or {}).get("target_amount"))
        collected_amount = _to_number((updated_campaign or {}).get("collected_amount"))
        if (not updated_is_unlimited) and target_amount > 0 and collected_amount >= target_amount:
            await db.tabung_campaigns.update_one(
                {"_id": campaign_lookup_id},
                {"$set": {"status": CampaignStatus.COMPLETED.value}}
            )
    await _invalidate_financial_dashboard_cache_safely(db, scope="donation")
    
    # Create ledger entry
    ledger_type = LedgerType.DONATION_SLOT.value if campaign_type == CampaignType.SLOT.value else LedgerType.DONATION_AMOUNT.value
    await db.financial_ledger.insert_one({
        "type": ledger_type,
        "amount": amount,
        "donation_id": str(result.inserted_id),
        "campaign_id": data.campaign_id,
        "campaign_title": campaign["title"],
        "donor_name": donor_name,
        "description": f"Sumbangan awam untuk {campaign['title']}",
        "reference_number": receipt_number,
        "created_at": datetime.now(timezone.utc)
    })
    
    # ===== SYNC WITH ACCOUNTING MODULE =====
    # Create accounting transaction for public donation income
    await create_accounting_transaction(
        db=db,
        amount=amount,
        campaign_title=campaign["title"],
        donor_name=donor_name,
        receipt_number=receipt_number,
        campaign_type=campaign_type,
        slots=slots
    )
    
    return {
        "success": True,
        "donation_id": str(result.inserted_id),
        "campaign_title": campaign["title"],
        "amount": amount,
        "slots": slots,
        "receipt_number": receipt_number,
        "message": "Terima kasih atas sumbangan anda!"
    }

