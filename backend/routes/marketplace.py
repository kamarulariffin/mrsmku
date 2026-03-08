"""
Multi-Vendor Marketplace Module - API Routes
For parents as vendors with admin approval, commission split, and student-based delivery
Extended with: Product Variants, Bundles, Category Access Rules, Vendor Wallet & Payouts
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import random
import string

from models.marketplace import (
    # Vendor
    VendorCreate, VendorUpdate, VendorResponse, VendorApprovalRequest, VendorStatus, VendorTier,
    # Product
    VendorProductCreate, VendorProductUpdate, VendorProductResponse, 
    ProductApprovalRequest, ProductApprovalStatus, ProductType,
    ProductVariantCreate, ProductVariantUpdate, VariantSnapshot,
    # Bundle
    BundleCreate, BundleUpdate, BundleResponse, BundleItem, BundleItemResponse,
    # Category Access
    CategoryAccessRule, CategoryAccessRuleCreate,
    # Order
    MarketplaceOrderCreate, MarketplaceOrderResponse, OrderItemResponse,
    StudentSnapshot, OrderStatus, OrderStatusUpdate, OrderItemCreate, BundleOrderItem,
    CommissionSnapshot,
    # Wallet & Payout
    PayoutRequest, PayoutResponse, PayoutApproval, PayoutStatus, VendorWallet,
    # Ads
    AdCreate, AdUpdate, AdResponse, AdApprovalRequest, AdStatus, AdPackageType, AdPackageResponse,
    # Monetization
    ProductBoostCreate, ProductBoostResponse, BoostType, FlashSaleRegistration,
    # Finance
    LedgerEntryResponse, LedgerType, CommissionSettingsResponse, CommissionSettingsUpdate,
    AdPackageSettingsUpdate
)

router = APIRouter(prefix="/api/marketplace", tags=["Marketplace"])
security = HTTPBearer(auto_error=False)

# Global references - will be initialized by server.py
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


async def log_audit(user, action, module, details):
    if _log_audit_func and user:
        await _log_audit_func(user, action, module, details)


def generate_order_number():
    """Generate unique order number"""
    timestamp = datetime.now().strftime("%Y%m%d%H%M")
    random_str = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"MKT-{timestamp}-{random_str}"


def generate_reference_number(prefix: str = "LED"):
    """Generate unique reference number for ledger"""
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    random_str = ''.join(random.choices(string.digits, k=4))
    return f"{prefix}-{timestamp}-{random_str}"


# ==================== SETTINGS ====================

DEFAULT_SETTINGS = {
    "dana_kecemerlangan_percent": 5.0,
    "koperasi_percent": 5.0,
    "vendor_percent": 90.0,
    "vendor_registration_fee": 20.0,
    "ad_packages": {
        "bronze": {"price": 25.0, "duration_months": 1, "name": "Bronze", "features": ["1 banner slot", "1 bulan paparan"]},
        "silver": {"price": 90.0, "duration_months": 3, "name": "Silver", "features": ["1 banner slot", "3 bulan paparan", "Paparan keutamaan"]},
        "gold": {"price": 500.0, "duration_months": 12, "name": "Gold", "features": ["Premium banner", "12 bulan paparan", "Paparan tertinggi", "Sokongan khas"]}
    }
}


async def get_marketplace_settings(db):
    """Get marketplace settings from database or create defaults"""
    settings = await db.marketplace_settings.find_one({"type": "commission"})
    if not settings:
        settings = {
            "type": "commission",
            **DEFAULT_SETTINGS,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }
        await db.marketplace_settings.insert_one(settings)
    return settings


@router.get("/settings", response_model=dict)
async def get_settings(user: dict = Depends(get_current_user)):
    """Get marketplace settings - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    settings = await get_marketplace_settings(db)
    
    return {
        "dana_kecemerlangan_percent": settings.get("dana_kecemerlangan_percent", 5.0),
        "koperasi_percent": settings.get("koperasi_percent", 5.0),
        "vendor_percent": settings.get("vendor_percent", 90.0),
        "vendor_registration_fee": settings.get("vendor_registration_fee", 20.0),
        "ad_packages": settings.get("ad_packages", DEFAULT_SETTINGS["ad_packages"]),
        "updated_at": settings.get("updated_at", datetime.now(timezone.utc)).isoformat() if settings.get("updated_at") else None
    }


@router.put("/settings/commission", response_model=dict)
async def update_commission_settings(
    data: CommissionSettingsUpdate,
    user: dict = Depends(get_current_user)
):
    """Update commission settings - SuperAdmin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin"]:
        raise HTTPException(status_code=403, detail="Hanya SuperAdmin boleh ubah tetapan komisyen")
    
    settings = await get_marketplace_settings(db)
    
    update_data = {}
    if data.dana_kecemerlangan_percent is not None:
        update_data["dana_kecemerlangan_percent"] = data.dana_kecemerlangan_percent
    if data.koperasi_percent is not None:
        update_data["koperasi_percent"] = data.koperasi_percent
    if data.vendor_percent is not None:
        update_data["vendor_percent"] = data.vendor_percent
    if data.vendor_registration_fee is not None:
        update_data["vendor_registration_fee"] = data.vendor_registration_fee
    
    # Validate total doesn't exceed 100%
    dk = update_data.get("dana_kecemerlangan_percent", settings.get("dana_kecemerlangan_percent", 5))
    kop = update_data.get("koperasi_percent", settings.get("koperasi_percent", 5))
    vendor = update_data.get("vendor_percent", settings.get("vendor_percent", 90))
    
    if dk + kop + vendor != 100:
        raise HTTPException(status_code=400, detail=f"Jumlah peratusan mesti sama dengan 100%. Sekarang: {dk + kop + vendor}%")
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    update_data["updated_by"] = str(user["_id"])
    
    await db.marketplace_settings.update_one(
        {"type": "commission"},
        {"$set": update_data}
    )
    
    await log_audit(user, "UPDATE_MARKETPLACE_SETTINGS", "marketplace", f"Tetapan komisyen dikemaskini: DK={dk}%, Kop={kop}%, Vendor={vendor}%")
    
    return {"message": "Tetapan komisyen berjaya dikemaskini"}


@router.put("/settings/ad-packages", response_model=dict)
async def update_ad_package_settings(
    data: AdPackageSettingsUpdate,
    user: dict = Depends(get_current_user)
):
    """Update ad package prices - SuperAdmin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin"]:
        raise HTTPException(status_code=403, detail="Hanya SuperAdmin boleh ubah harga pakej iklan")
    
    settings = await get_marketplace_settings(db)
    ad_packages = settings.get("ad_packages", DEFAULT_SETTINGS["ad_packages"])
    
    if data.bronze_price is not None:
        ad_packages["bronze"]["price"] = data.bronze_price
    if data.silver_price is not None:
        ad_packages["silver"]["price"] = data.silver_price
    if data.gold_price is not None:
        ad_packages["gold"]["price"] = data.gold_price
    
    await db.marketplace_settings.update_one(
        {"type": "commission"},
        {"$set": {"ad_packages": ad_packages, "updated_at": datetime.now(timezone.utc)}}
    )
    
    await log_audit(user, "UPDATE_AD_PACKAGES", "marketplace", "Harga pakej iklan dikemaskini")
    
    return {"message": "Harga pakej iklan berjaya dikemaskini"}


# ==================== VENDOR MANAGEMENT ====================

@router.post("/vendors/apply", response_model=dict)
async def apply_vendor(vendor: VendorCreate, user: dict = Depends(get_current_user)):
    """Apply to become a vendor - Parent only"""
    db = get_db()
    
    if user["role"] != "parent":
        raise HTTPException(status_code=403, detail="Hanya ibu bapa boleh memohon menjadi vendor")
    
    # Check if already a vendor
    existing = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    if existing:
        if existing["status"] == VendorStatus.PENDING.value:
            raise HTTPException(status_code=400, detail="Permohonan anda sedang diproses")
        elif existing["status"] == VendorStatus.APPROVED.value:
            raise HTTPException(status_code=400, detail="Anda sudah menjadi vendor")
        elif existing["status"] == VendorStatus.REJECTED.value:
            # Allow reapplication
            pass
        elif existing["status"] == VendorStatus.SUSPENDED.value:
            raise HTTPException(status_code=400, detail="Akaun vendor anda telah digantung. Sila hubungi admin.")
    
    settings = await get_marketplace_settings(db)
    registration_fee = settings.get("vendor_registration_fee", 20.0)
    
    vendor_doc = {
        "user_id": str(user["_id"]),
        "parent_name": user.get("full_name", ""),
        "parent_email": user.get("email", ""),
        "parent_phone": user.get("phone", ""),
        "business_name": vendor.business_name,
        "business_description": vendor.business_description,
        "business_category": vendor.business_category,
        "contact_phone": vendor.contact_phone,
        "bank_name": vendor.bank_name,
        "bank_account_number": vendor.bank_account_number,
        "bank_account_name": vendor.bank_account_name,
        "status": VendorStatus.PENDING.value,
        "registration_fee": registration_fee,
        "registration_fee_paid": False,  # Will be True after payment
        "total_sales": 0.0,
        "total_products": 0,
        "rating": 0.0,
        "rating_count": 0,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    
    if existing:
        # Update existing rejected application
        await db.marketplace_vendors.update_one(
            {"_id": existing["_id"]},
            {"$set": {**vendor_doc, "reapplied_at": datetime.now(timezone.utc)}}
        )
        vendor_id = str(existing["_id"])
    else:
        result = await db.marketplace_vendors.insert_one(vendor_doc)
        vendor_id = str(result.inserted_id)
    
    # Notify admins
    admins = await db.users.find({"role": {"$in": ["superadmin", "admin"]}}).to_list(50)
    for admin in admins:
        await db.notifications.insert_one({
            "user_id": admin["_id"],
            "title": "Permohonan Vendor Baru",
            "message": f"{user.get('full_name')} ({vendor.business_name}) memohon menjadi vendor marketplace.",
            "type": "action",
            "is_read": False,
            "link": "/admin/marketplace/vendors",
            "created_at": datetime.now(timezone.utc)
        })
    
    await log_audit(user, "VENDOR_APPLICATION", "marketplace", f"Permohonan vendor: {vendor.business_name}")
    
    return {
        "id": vendor_id,
        "message": "Permohonan vendor berjaya dihantar. Sila tunggu kelulusan admin.",
        "registration_fee": registration_fee
    }


@router.get("/vendors/my-vendor", response_model=dict)
async def get_my_vendor_profile(user: dict = Depends(get_current_user)):
    """Get current user's vendor profile"""
    db = get_db()
    
    vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    if not vendor:
        return {"vendor": None, "message": "Anda belum menjadi vendor"}
    
    return {
        "vendor": {
            "id": str(vendor["_id"]),
            "user_id": vendor["user_id"],
            "parent_name": vendor.get("parent_name", ""),
            "business_name": vendor["business_name"],
            "business_description": vendor.get("business_description"),
            "business_category": vendor.get("business_category"),
            "logo_url": vendor.get("logo_url"),
            "contact_phone": vendor["contact_phone"],
            "bank_name": vendor["bank_name"],
            "bank_account_number": vendor["bank_account_number"],
            "bank_account_name": vendor["bank_account_name"],
            "status": vendor["status"],
            "rejection_reason": vendor.get("rejection_reason"),
            "total_sales": vendor.get("total_sales", 0),
            "total_products": vendor.get("total_products", 0),
            "rating": vendor.get("rating", 0),
            "rating_count": vendor.get("rating_count", 0),
            "registration_fee_paid": vendor.get("registration_fee_paid", False),
            "created_at": vendor["created_at"].isoformat() if vendor.get("created_at") else None,
            "approved_at": vendor.get("approved_at").isoformat() if vendor.get("approved_at") else None
        }
    }


@router.put("/vendors/my-vendor", response_model=dict)
async def update_my_vendor_profile(vendor: VendorUpdate, user: dict = Depends(get_current_user)):
    """Update vendor profile"""
    db = get_db()
    
    existing = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    if not existing:
        raise HTTPException(status_code=404, detail="Anda belum menjadi vendor")
    
    if existing["status"] not in [VendorStatus.APPROVED.value, VendorStatus.PENDING.value]:
        raise HTTPException(status_code=400, detail="Tidak boleh kemaskini profil vendor dalam status semasa")
    
    update_data = {k: v for k, v in vendor.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.marketplace_vendors.update_one(
        {"_id": existing["_id"]},
        {"$set": update_data}
    )
    
    await log_audit(user, "UPDATE_VENDOR_PROFILE", "marketplace", f"Profil vendor dikemaskini: {existing['business_name']}")
    
    return {"message": "Profil vendor berjaya dikemaskini"}


@router.get("/vendors", response_model=List[dict])
async def get_vendors(
    status: Optional[str] = None,
    search: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Get all vendors - Admin view all, others see approved only"""
    db = get_db()
    
    is_admin = user["role"] in ["superadmin", "admin", "bendahari"]
    
    query = {}
    if status and is_admin:
        query["status"] = status
    elif not is_admin:
        query["status"] = VendorStatus.APPROVED.value
    
    if search:
        query["$or"] = [
            {"business_name": {"$regex": search, "$options": "i"}},
            {"parent_name": {"$regex": search, "$options": "i"}}
        ]
    
    vendors = await db.marketplace_vendors.find(query).sort("created_at", -1).to_list(200)
    
    result = []
    for v in vendors:
        result.append({
            "id": str(v["_id"]),
            "user_id": v["user_id"],
            "parent_name": v.get("parent_name", ""),
            "business_name": v["business_name"],
            "business_description": v.get("business_description"),
            "business_category": v.get("business_category"),
            "logo_url": v.get("logo_url"),
            "contact_phone": v["contact_phone"],
            "status": v["status"],
            "total_sales": v.get("total_sales", 0),
            "total_products": v.get("total_products", 0),
            "rating": v.get("rating", 0),
            "rating_count": v.get("rating_count", 0),
            "registration_fee_paid": v.get("registration_fee_paid", False),
            "created_at": v["created_at"].isoformat() if v.get("created_at") else None,
            "approved_at": v.get("approved_at").isoformat() if v.get("approved_at") else None
        })
    
    return result


# Premium subscription routes - MUST be before /vendors/{vendor_id} to avoid route conflicts
@router.post("/vendors/subscribe-premium", response_model=dict)
async def subscribe_premium(
    package_type: str,
    user: dict = Depends(get_current_user)
):
    """Subscribe to premium vendor package (MOCKED payment)"""
    db = get_db()
    
    vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    if not vendor:
        raise HTTPException(status_code=403, detail="Anda bukan vendor")
    
    if vendor["status"] != VendorStatus.APPROVED.value:
        raise HTTPException(status_code=400, detail="Hanya vendor yang diluluskan boleh melanggan premium")
    
    packages = {
        "monthly": {"price": 29.0, "months": 1},
        "quarterly": {"price": 79.0, "months": 3},
        "yearly": {"price": 249.0, "months": 12}
    }
    
    package = packages.get(package_type)
    if not package:
        raise HTTPException(status_code=400, detail="Pakej tidak sah")
    
    now = datetime.now(timezone.utc)
    
    # If already premium, extend from current expiry - handle timezone
    current_expiry = vendor.get("premium_expires_at")
    if current_expiry:
        if current_expiry.tzinfo is None:
            current_expiry = current_expiry.replace(tzinfo=timezone.utc)
        if current_expiry > now:
            start_date = current_expiry
        else:
            start_date = now
    else:
        start_date = now
    
    end_date = start_date + timedelta(days=package["months"] * 30)
    
    # Create subscription record
    subscription_doc = {
        "vendor_id": str(vendor["_id"]),
        "vendor_name": vendor["business_name"],
        "package_type": package_type,
        "price_paid": package["price"],
        "start_date": start_date,
        "end_date": end_date,
        "is_active": True,
        "created_at": now
    }
    
    await db.vendor_subscriptions.insert_one(subscription_doc)
    
    # Update vendor
    await db.marketplace_vendors.update_one(
        {"_id": vendor["_id"]},
        {"$set": {
            "tier": VendorTier.PREMIUM.value,
            "premium_expires_at": end_date,
            "updated_at": now
        }}
    )
    
    # Create ledger entry
    await db.financial_ledger.insert_one({
        "type": LedgerType.PREMIUM_SUBSCRIPTION.value,
        "amount": package["price"],
        "vendor_id": str(vendor["_id"]),
        "vendor_name": vendor["business_name"],
        "description": f"Langganan Premium ({package_type}): {vendor['business_name']}",
        "reference_number": generate_reference_number("PRM"),
        "created_at": now
    })
    
    await log_audit(user, "SUBSCRIBE_PREMIUM", "marketplace", f"Langganan premium {package_type}")
    
    return {
        "message": "Langganan premium berjaya diaktifkan!",
        "tier": VendorTier.PREMIUM.value,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat()
    }


@router.get("/vendors/premium-status", response_model=dict)
async def get_premium_status(user: dict = Depends(get_current_user)):
    """Get vendor's premium subscription status"""
    db = get_db()
    
    vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    if not vendor:
        raise HTTPException(status_code=403, detail="Anda bukan vendor")
    
    now = datetime.now(timezone.utc)
    
    # Handle premium_expires_at safely
    premium_expires_at = vendor.get("premium_expires_at")
    if premium_expires_at and premium_expires_at.tzinfo is None:
        premium_expires_at = premium_expires_at.replace(tzinfo=timezone.utc)
    
    is_premium = vendor.get("tier") == VendorTier.PREMIUM.value and premium_expires_at and premium_expires_at > now
    
    # Get subscription history
    subscriptions = await db.vendor_subscriptions.find(
        {"vendor_id": str(vendor["_id"])}
    ).sort("created_at", -1).to_list(10)
    
    # Calculate days remaining safely
    days_remaining = 0
    if is_premium and premium_expires_at:
        days_remaining = (premium_expires_at - now).days
    
    return {
        "is_premium": is_premium,
        "tier": vendor.get("tier", VendorTier.FREE.value),
        "premium_expires_at": premium_expires_at.isoformat() if premium_expires_at else None,
        "days_remaining": days_remaining,
        "history": [{
            "package_type": s["package_type"],
            "price_paid": s["price_paid"],
            "start_date": s["start_date"].isoformat() if s.get("start_date") else None,
            "end_date": s["end_date"].isoformat() if s.get("end_date") else None,
            "created_at": s["created_at"].isoformat() if s.get("created_at") else None
        } for s in subscriptions]
    }


@router.get("/vendors/{vendor_id}", response_model=dict)
async def get_vendor(vendor_id: str, user: dict = Depends(get_current_user_optional)):
    """Get single vendor details"""
    db = get_db()
    
    vendor = await db.marketplace_vendors.find_one({"_id": ObjectId(vendor_id)})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor tidak dijumpai")
    
    # Non-admin can only see approved vendors
    is_admin = user and user.get("role") in ["superadmin", "admin", "bendahari"]
    is_owner = user and str(user.get("_id")) == vendor["user_id"]
    
    if not is_admin and not is_owner and vendor["status"] != VendorStatus.APPROVED.value:
        raise HTTPException(status_code=404, detail="Vendor tidak dijumpai")
    
    # Get products count
    products_count = await db.marketplace_products.count_documents({
        "vendor_id": vendor_id,
        "is_active": True,
        "approval_status": ProductApprovalStatus.APPROVED.value
    })
    
    return {
        "id": str(vendor["_id"]),
        "user_id": vendor["user_id"],
        "parent_name": vendor.get("parent_name", ""),
        "business_name": vendor["business_name"],
        "business_description": vendor.get("business_description"),
        "business_category": vendor.get("business_category"),
        "logo_url": vendor.get("logo_url"),
        "contact_phone": vendor["contact_phone"],
        "bank_name": vendor["bank_name"] if is_admin or is_owner else None,
        "bank_account_number": vendor["bank_account_number"] if is_admin or is_owner else None,
        "bank_account_name": vendor["bank_account_name"] if is_admin or is_owner else None,
        "status": vendor["status"],
        "rejection_reason": vendor.get("rejection_reason") if is_admin or is_owner else None,
        "total_sales": vendor.get("total_sales", 0),
        "total_products": products_count,
        "rating": vendor.get("rating", 0),
        "rating_count": vendor.get("rating_count", 0),
        "registration_fee_paid": vendor.get("registration_fee_paid", False),
        "created_at": vendor["created_at"].isoformat() if vendor.get("created_at") else None,
        "approved_at": vendor.get("approved_at").isoformat() if vendor.get("approved_at") else None
    }


@router.put("/vendors/{vendor_id}/approve", response_model=dict)
async def approve_vendor(
    vendor_id: str,
    approval: VendorApprovalRequest,
    user: dict = Depends(get_current_user)
):
    """Approve or reject vendor application - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    vendor = await db.marketplace_vendors.find_one({"_id": ObjectId(vendor_id)})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor tidak dijumpai")
    
    update_data = {
        "status": approval.status.value,
        "updated_at": datetime.now(timezone.utc),
        "approved_by": str(user["_id"])
    }
    
    if approval.status == VendorStatus.APPROVED:
        update_data["approved_at"] = datetime.now(timezone.utc)
        update_data["rejection_reason"] = None
        
        # Create ledger entry for registration fee if paid
        if vendor.get("registration_fee_paid"):
            settings = await get_marketplace_settings(db)
            reg_fee = settings.get("vendor_registration_fee", 20.0)
            
            # Split registration fee (all goes to Koperasi)
            await db.financial_ledger.insert_one({
                "type": LedgerType.VENDOR_REGISTRATION.value,
                "amount": reg_fee,
                "vendor_id": vendor_id,
                "vendor_name": vendor["business_name"],
                "description": f"Yuran pendaftaran vendor: {vendor['business_name']}",
                "reference_number": generate_reference_number("REG"),
                "created_at": datetime.now(timezone.utc)
            })
        
    elif approval.status == VendorStatus.REJECTED:
        if not approval.rejection_reason:
            raise HTTPException(status_code=400, detail="Sila nyatakan sebab penolakan")
        update_data["rejection_reason"] = approval.rejection_reason
    
    await db.marketplace_vendors.update_one(
        {"_id": ObjectId(vendor_id)},
        {"$set": update_data}
    )
    
    # Notify vendor
    await db.notifications.insert_one({
        "user_id": ObjectId(vendor["user_id"]),
        "title": "Status Permohonan Vendor",
        "message": f"Permohonan vendor anda telah {'diluluskan' if approval.status == VendorStatus.APPROVED else 'ditolak'}." + 
                  (f" Sebab: {approval.rejection_reason}" if approval.rejection_reason else ""),
        "type": "info" if approval.status == VendorStatus.APPROVED else "warning",
        "is_read": False,
        "created_at": datetime.now(timezone.utc)
    })
    
    await log_audit(user, f"VENDOR_{approval.status.value.upper()}", "marketplace", 
                   f"Vendor {vendor['business_name']} {approval.status.value}")
    
    return {"message": f"Vendor berjaya di{approval.status.value}"}


# ==================== PRODUCT MANAGEMENT ====================

@router.post("/products", response_model=dict)
async def create_product(product: VendorProductCreate, user: dict = Depends(get_current_user)):
    """Create a new product - Vendor only. Supports simple and variable products."""
    db = get_db()
    
    # Verify user is an approved vendor
    vendor = await db.marketplace_vendors.find_one({
        "user_id": str(user["_id"]),
        "status": VendorStatus.APPROVED.value
    })
    if not vendor:
        raise HTTPException(status_code=403, detail="Anda bukan vendor yang diluluskan")
    
    # Calculate total stock for variable products
    total_stock = product.stock
    variants_data = None
    
    if product.product_type == ProductType.VARIABLE:
        if not product.variants or len(product.variants) == 0:
            raise HTTPException(status_code=400, detail="Produk variasi mesti mempunyai sekurang-kurangnya satu varian")
        
        # Validate unique SKUs
        skus = [v.sku for v in product.variants]
        if len(skus) != len(set(skus)):
            raise HTTPException(status_code=400, detail="SKU varian mesti unik")
        
        # Calculate total stock from variants
        total_stock = sum(v.stock for v in product.variants)
        variants_data = [
            {
                "sku": v.sku,
                "size": v.size,
                "color": v.color,
                "stock": v.stock,
                "price_override": v.price_override,
                "is_active": True
            }
            for v in product.variants
        ]
    
    product_doc = {
        "vendor_id": str(vendor["_id"]),
        "vendor_name": vendor["business_name"],
        "name": product.name,
        "description": product.description,
        "category": product.category,
        "price": product.price,
        "stock": total_stock,
        "images": product.images,
        "product_type": product.product_type.value,
        "variants": variants_data,
        "approval_status": ProductApprovalStatus.PENDING.value,
        "is_active": True,
        "is_featured": False,
        "is_boosted": False,
        "boost_expires_at": None,
        "sales_count": 0,
        "rating": 0.0,
        "rating_count": 0,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    
    result = await db.marketplace_products.insert_one(product_doc)
    
    # Notify admins
    admins = await db.users.find({"role": {"$in": ["superadmin", "admin"]}}).to_list(50)
    for admin in admins:
        await db.notifications.insert_one({
            "user_id": admin["_id"],
            "title": "Produk Baru Menunggu Kelulusan",
            "message": f"Produk '{product.name}' dari {vendor['business_name']} menunggu kelulusan.",
            "type": "action",
            "is_read": False,
            "link": "/admin/marketplace/products",
            "created_at": datetime.now(timezone.utc)
        })
    
    await log_audit(user, "CREATE_PRODUCT", "marketplace", f"Produk dicipta: {product.name}")
    
    return {
        "id": str(result.inserted_id),
        "message": "Produk berjaya dicipta. Menunggu kelulusan admin."
    }


@router.get("/products", response_model=List[dict])
async def get_products(
    vendor_id: Optional[str] = None,
    category: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    featured_only: bool = False,
    user: dict = Depends(get_current_user_optional)
):
    """Get products - Public sees approved only, vendors see their own, admin sees all"""
    db = get_db()
    
    query = {}
    
    is_admin = user and user.get("role") in ["superadmin", "admin"]
    
    # Check if user is vendor viewing their own products
    user_vendor = None
    if user:
        user_vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    
    if vendor_id:
        query["vendor_id"] = vendor_id
        
        # If not admin and not the vendor owner, only show approved
        if not is_admin:
            if not user_vendor or str(user_vendor["_id"]) != vendor_id:
                query["approval_status"] = ProductApprovalStatus.APPROVED.value
                query["is_active"] = True
    else:
        # General product listing
        if not is_admin:
            query["approval_status"] = ProductApprovalStatus.APPROVED.value
            query["is_active"] = True
    
    if status and is_admin:
        query["approval_status"] = status
    
    if category:
        query["category"] = category
    
    if featured_only:
        query["is_featured"] = True
    
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}}
        ]
    
    # Sort: featured/boosted products first, then by created_at
    products = await db.marketplace_products.find(query).sort([
        ("is_featured", -1), 
        ("is_boosted", -1), 
        ("created_at", -1)
    ]).to_list(200)
    
    result = []
    for p in products:
        # Calculate total stock for variable products
        total_stock = p.get("stock", 0)
        if p.get("product_type") == ProductType.VARIABLE.value and p.get("variants"):
            total_stock = sum(v.get("stock", 0) for v in p["variants"] if v.get("is_active", True))
        
        result.append({
            "id": str(p["_id"]),
            "vendor_id": p["vendor_id"],
            "vendor_name": p.get("vendor_name", ""),
            "name": p["name"],
            "description": p.get("description"),
            "category": p["category"],
            "price": p["price"],
            "stock": total_stock,
            "images": p.get("images", []),
            "product_type": p.get("product_type", ProductType.SIMPLE.value),
            "variants": p.get("variants"),
            "approval_status": p["approval_status"],
            "rejection_reason": p.get("rejection_reason") if is_admin or (user_vendor and str(user_vendor["_id"]) == p["vendor_id"]) else None,
            "is_active": p.get("is_active", True),
            "is_featured": p.get("is_featured", False),
            "is_boosted": p.get("is_boosted", False),
            "boost_expires_at": p.get("boost_expires_at").isoformat() if p.get("boost_expires_at") else None,
            "sales_count": p.get("sales_count", 0),
            "rating": p.get("rating", 0),
            "rating_count": p.get("rating_count", 0),
            "created_at": p["created_at"].isoformat() if p.get("created_at") else None
        })
    
    return result


@router.get("/products/my-products", response_model=List[dict])
async def get_my_products(
    status: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Get current vendor's products"""
    db = get_db()
    
    vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    if not vendor:
        raise HTTPException(status_code=403, detail="Anda bukan vendor")
    
    query = {"vendor_id": str(vendor["_id"])}
    if status:
        query["approval_status"] = status
    
    products = await db.marketplace_products.find(query).sort("created_at", -1).to_list(200)
    
    result = []
    for p in products:
        # Calculate total stock for variable products
        total_stock = p.get("stock", 0)
        if p.get("product_type") == ProductType.VARIABLE.value and p.get("variants"):
            total_stock = sum(v.get("stock", 0) for v in p["variants"] if v.get("is_active", True))
        
        result.append({
            "id": str(p["_id"]),
            "vendor_id": p["vendor_id"],
            "name": p["name"],
            "description": p.get("description"),
            "category": p["category"],
            "price": p["price"],
            "stock": total_stock,
            "images": p.get("images", []),
            "product_type": p.get("product_type", ProductType.SIMPLE.value),
            "variants": p.get("variants"),
            "approval_status": p["approval_status"],
            "rejection_reason": p.get("rejection_reason"),
            "is_active": p.get("is_active", True),
            "sales_count": p.get("sales_count", 0),
            "created_at": p["created_at"].isoformat() if p.get("created_at") else None
        })
    
    return result


@router.get("/products/{product_id}", response_model=dict)
async def get_product(product_id: str, user: dict = Depends(get_current_user_optional)):
    """Get single product"""
    db = get_db()
    
    product = await db.marketplace_products.find_one({"_id": ObjectId(product_id)})
    if not product:
        raise HTTPException(status_code=404, detail="Produk tidak dijumpai")
    
    is_admin = user and user.get("role") in ["superadmin", "admin"]
    user_vendor = None
    if user:
        user_vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    is_owner = user_vendor and str(user_vendor["_id"]) == product["vendor_id"]
    
    # Non-admin/non-owner can only see approved products
    if not is_admin and not is_owner and product["approval_status"] != ProductApprovalStatus.APPROVED.value:
        raise HTTPException(status_code=404, detail="Produk tidak dijumpai")
    
    # Get vendor info
    vendor = await db.marketplace_vendors.find_one({"_id": ObjectId(product["vendor_id"])})
    
    return {
        "id": str(product["_id"]),
        "vendor_id": product["vendor_id"],
        "vendor_name": vendor["business_name"] if vendor else "",
        "vendor_logo": vendor.get("logo_url") if vendor else None,
        "name": product["name"],
        "description": product.get("description"),
        "category": product["category"],
        "price": product["price"],
        "stock": product["stock"],
        "images": product.get("images", []),
        "has_variants": product.get("has_variants", False),
        "variants": product.get("variants"),
        "approval_status": product["approval_status"],
        "rejection_reason": product.get("rejection_reason") if is_admin or is_owner else None,
        "is_active": product.get("is_active", True),
        "sales_count": product.get("sales_count", 0),
        "rating": product.get("rating", 0),
        "rating_count": product.get("rating_count", 0),
        "created_at": product["created_at"].isoformat() if product.get("created_at") else None,
        "approved_at": product.get("approved_at").isoformat() if product.get("approved_at") else None
    }


@router.put("/products/{product_id}", response_model=dict)
async def update_product(product_id: str, product: VendorProductUpdate, user: dict = Depends(get_current_user)):
    """Update product - Vendor owner only"""
    db = get_db()
    
    existing = await db.marketplace_products.find_one({"_id": ObjectId(product_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Produk tidak dijumpai")
    
    # Verify ownership
    vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    is_admin = user["role"] in ["superadmin", "admin"]
    
    if not is_admin and (not vendor or str(vendor["_id"]) != existing["vendor_id"]):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    update_data = {k: v for k, v in product.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    # If significant changes, require re-approval (for non-admin)
    if not is_admin and any(k in update_data for k in ["price", "name", "description"]):
        update_data["approval_status"] = ProductApprovalStatus.PENDING.value
        update_data["rejection_reason"] = None
    
    await db.marketplace_products.update_one(
        {"_id": ObjectId(product_id)},
        {"$set": update_data}
    )
    
    await log_audit(user, "UPDATE_PRODUCT", "marketplace", f"Produk dikemaskini: {existing['name']}")
    
    return {"message": "Produk berjaya dikemaskini"}


@router.put("/products/{product_id}/approve", response_model=dict)
async def approve_product(
    product_id: str,
    approval: ProductApprovalRequest,
    user: dict = Depends(get_current_user)
):
    """Approve or reject product - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    product = await db.marketplace_products.find_one({"_id": ObjectId(product_id)})
    if not product:
        raise HTTPException(status_code=404, detail="Produk tidak dijumpai")
    
    update_data = {
        "approval_status": approval.status.value,
        "updated_at": datetime.now(timezone.utc),
        "approved_by": str(user["_id"])
    }
    
    if approval.status == ProductApprovalStatus.APPROVED:
        update_data["approved_at"] = datetime.now(timezone.utc)
        update_data["rejection_reason"] = None
        
        # Update vendor product count
        await db.marketplace_vendors.update_one(
            {"_id": ObjectId(product["vendor_id"])},
            {"$inc": {"total_products": 1}}
        )
    elif approval.status == ProductApprovalStatus.REJECTED:
        if not approval.rejection_reason:
            raise HTTPException(status_code=400, detail="Sila nyatakan sebab penolakan")
        update_data["rejection_reason"] = approval.rejection_reason
    
    await db.marketplace_products.update_one(
        {"_id": ObjectId(product_id)},
        {"$set": update_data}
    )
    
    # Notify vendor
    vendor = await db.marketplace_vendors.find_one({"_id": ObjectId(product["vendor_id"])})
    if vendor:
        await db.notifications.insert_one({
            "user_id": ObjectId(vendor["user_id"]),
            "title": "Status Kelulusan Produk",
            "message": f"Produk '{product['name']}' telah {'diluluskan' if approval.status == ProductApprovalStatus.APPROVED else 'ditolak'}." +
                      (f" Sebab: {approval.rejection_reason}" if approval.rejection_reason else ""),
            "type": "info" if approval.status == ProductApprovalStatus.APPROVED else "warning",
            "is_read": False,
            "created_at": datetime.now(timezone.utc)
        })
    
    await log_audit(user, f"PRODUCT_{approval.status.value.upper()}", "marketplace",
                   f"Produk {product['name']} {approval.status.value}")
    
    return {"message": f"Produk berjaya di{approval.status.value}"}


@router.delete("/products/{product_id}", response_model=dict)
async def delete_product(product_id: str, user: dict = Depends(get_current_user)):
    """Soft delete product - Vendor owner or admin"""
    db = get_db()
    
    product = await db.marketplace_products.find_one({"_id": ObjectId(product_id)})
    if not product:
        raise HTTPException(status_code=404, detail="Produk tidak dijumpai")
    
    vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    is_admin = user["role"] in ["superadmin", "admin"]
    
    if not is_admin and (not vendor or str(vendor["_id"]) != product["vendor_id"]):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    await db.marketplace_products.update_one(
        {"_id": ObjectId(product_id)},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    
    # Update vendor product count if was approved
    if product["approval_status"] == ProductApprovalStatus.APPROVED.value:
        await db.marketplace_vendors.update_one(
            {"_id": ObjectId(product["vendor_id"])},
            {"$inc": {"total_products": -1}}
        )
    
    await log_audit(user, "DELETE_PRODUCT", "marketplace", f"Produk dipadam: {product['name']}")
    
    return {"message": "Produk berjaya dipadam"}


# ==================== STUDENT LOOKUP ====================

@router.get("/students/lookup", response_model=List[dict])
async def lookup_students(
    search: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Lookup students for order delivery - Parent sees their own children"""
    db = get_db()
    
    if user["role"] != "parent":
        raise HTTPException(status_code=403, detail="Hanya ibu bapa boleh akses")
    
    # Get parent's children
    query = {
        "$or": [
            {"parent_id": str(user["_id"])},
            {"parent_id": user["_id"]}
        ],
        "status": "approved"
    }
    
    if search:
        query["$and"] = [
            {"$or": [
                {"full_name": {"$regex": search, "$options": "i"}},
                {"matric_number": {"$regex": search, "$options": "i"}}
            ]}
        ]
    
    students = await db.students.find(query).to_list(50)
    
    result = []
    for s in students:
        result.append({
            "id": str(s["_id"]),
            "full_name": s["full_name"],
            "matric_number": s["matric_number"],
            "form": s["form"],
            "class_name": s["class_name"],
            "block_name": s.get("block_name", ""),
            "room_number": s.get("room_number", "")
        })
    
    return result


# ==================== ORDERS ====================

@router.post("/orders", response_model=dict)
async def create_order(order: MarketplaceOrderCreate, user: dict = Depends(get_current_user)):
    """Create order - Parent only, delivery to registered student only.
    Supports: Simple products, Variable products (with SKU), Bundles, Category access rules.
    """
    db = get_db()
    
    if user["role"] != "parent":
        raise HTTPException(status_code=403, detail="Hanya ibu bapa boleh membuat pesanan")
    
    if not order.items and not order.bundles:
        raise HTTPException(status_code=400, detail="Pesanan mesti mengandungi sekurang-kurangnya satu item atau bundle")
    
    # Verify student belongs to parent and is active
    student = await db.students.find_one({
        "_id": ObjectId(order.student_id),
        "$or": [
            {"parent_id": str(user["_id"])},
            {"parent_id": user["_id"]}
        ],
        "status": "approved"
    })
    
    if not student:
        raise HTTPException(status_code=400, detail="Pelajar tidak sah atau tidak aktif. Penghantaran hanya boleh dibuat kepada pelajar berdaftar yang aktif.")
    
    # Create immutable student snapshot
    student_snapshot = {
        "student_id": str(student["_id"]),
        "full_name": student["full_name"],
        "matric_number": student["matric_number"],
        "form": student["form"],
        "class_name": student["class_name"],
        "block_name": student.get("block_name", ""),
        "room_number": student.get("room_number", ""),
        "guardian_phone": user.get("phone", "")
    }
    
    # Get settings for commission calculation
    settings = await get_marketplace_settings(db)
    dk_percent = settings.get("dana_kecemerlangan_percent", 5)
    kop_percent = settings.get("koperasi_percent", 5)
    vendor_percent = settings.get("vendor_percent", 90)
    
    # Get category access rules
    category_rules = await db.marketplace_category_rules.find({}).to_list(100)
    rules_map = {r["category"]: r for r in category_rules}
    
    # Process order items
    order_items = []
    subtotal = 0
    vendor_items = {}  # Group by vendor for split calculation
    stock_updates = []  # Track stock updates to apply after validation
    
    # Process regular items
    for item in order.items:
        product = await db.marketplace_products.find_one({
            "_id": ObjectId(item.product_id),
            "is_active": True,
            "approval_status": ProductApprovalStatus.APPROVED.value
        })
        
        if not product:
            raise HTTPException(status_code=400, detail="Produk tidak dijumpai atau tidak tersedia")
        
        # Check category access rules (Food category - parent only)
        category_rule = rules_map.get(product["category"], {})
        if category_rule.get("is_food", False):
            # Food category - only parents can buy, ensure this is enforced
            if user["role"] != "parent":
                raise HTTPException(status_code=403, detail="Hanya ibu bapa boleh membeli produk kategori makanan")
        
        # Handle variable products with variants
        variant_snapshot = None
        unit_price = product["price"]
        
        if product.get("product_type") == ProductType.VARIABLE.value:
            if not item.variant_sku:
                raise HTTPException(status_code=400, detail=f"Produk '{product['name']}' mempunyai varian. Sila pilih SKU varian.")
            
            variant = next((v for v in product.get("variants", []) if v["sku"] == item.variant_sku and v.get("is_active", True)), None)
            if not variant:
                raise HTTPException(status_code=400, detail=f"Varian '{item.variant_sku}' tidak dijumpai atau tidak aktif")
            
            if variant["stock"] < item.quantity:
                raise HTTPException(status_code=400, detail=f"Stok tidak mencukupi untuk varian {item.variant_sku} (Tersedia: {variant['stock']})")
            
            unit_price = variant.get("price_override") or product["price"]
            variant_snapshot = {
                "sku": variant["sku"],
                "size": variant.get("size"),
                "color": variant.get("color"),
                "price": unit_price
            }
            
            # Track stock update for variant
            stock_updates.append({
                "type": "variant",
                "product_id": item.product_id,
                "variant_sku": item.variant_sku,
                "quantity": item.quantity
            })
        else:
            # Simple product
            if product["stock"] < item.quantity:
                raise HTTPException(status_code=400, detail=f"Stok tidak mencukupi untuk '{product['name']}' (Tersedia: {product['stock']})")
            
            stock_updates.append({
                "type": "simple",
                "product_id": item.product_id,
                "quantity": item.quantity
            })
        
        item_total = unit_price * item.quantity
        subtotal += item_total
        
        order_items.append({
            "product_id": str(product["_id"]),
            "product_name": product["name"],
            "vendor_id": product["vendor_id"],
            "vendor_name": product.get("vendor_name", ""),
            "quantity": item.quantity,
            "unit_price": unit_price,
            "total_price": item_total,
            "variant_snapshot": variant_snapshot,
            "is_bundle": False
        })
        
        # Group by vendor
        if product["vendor_id"] not in vendor_items:
            vendor_items[product["vendor_id"]] = {"total": 0, "vendor_name": product.get("vendor_name", "")}
        vendor_items[product["vendor_id"]]["total"] += item_total
    
    # Process bundles
    for bundle_item in order.bundles:
        bundle = await db.marketplace_bundles.find_one({
            "_id": ObjectId(bundle_item.bundle_id),
            "is_active": True,
            "approval_status": ProductApprovalStatus.APPROVED.value
        })
        
        if not bundle:
            raise HTTPException(status_code=400, detail="Bundle tidak dijumpai atau tidak tersedia")
        
        # Validate all bundle items have stock
        for bi in bundle.get("items", []):
            product = await db.marketplace_products.find_one({"_id": ObjectId(bi["product_id"])})
            if not product:
                raise HTTPException(status_code=400, detail="Produk dalam bundle tidak dijumpai")
            
            required_qty = bi["quantity"] * bundle_item.quantity
            
            if bi.get("variant_sku"):
                variant = next((v for v in product.get("variants", []) if v["sku"] == bi["variant_sku"]), None)
                if not variant or variant["stock"] < required_qty:
                    raise HTTPException(status_code=400, detail=f"Stok tidak mencukupi untuk item dalam bundle '{bundle['name']}'")
                
                stock_updates.append({
                    "type": "variant",
                    "product_id": bi["product_id"],
                    "variant_sku": bi["variant_sku"],
                    "quantity": required_qty
                })
            else:
                if product["stock"] < required_qty:
                    raise HTTPException(status_code=400, detail=f"Stok tidak mencukupi untuk item dalam bundle '{bundle['name']}'")
                
                stock_updates.append({
                    "type": "simple",
                    "product_id": bi["product_id"],
                    "quantity": required_qty
                })
        
        bundle_total = bundle["price"] * bundle_item.quantity
        subtotal += bundle_total
        
        order_items.append({
            "product_id": str(bundle["_id"]),
            "product_name": bundle["name"],
            "vendor_id": bundle["vendor_id"],
            "vendor_name": bundle.get("vendor_name", ""),
            "quantity": bundle_item.quantity,
            "unit_price": bundle["price"],
            "total_price": bundle_total,
            "is_bundle": True,
            "bundle_id": str(bundle["_id"]),
            "bundle_name": bundle["name"],
            "bundle_items": bundle.get("items", [])
        })
        
        # Group by vendor
        if bundle["vendor_id"] not in vendor_items:
            vendor_items[bundle["vendor_id"]] = {"total": 0, "vendor_name": bundle.get("vendor_name", "")}
        vendor_items[bundle["vendor_id"]]["total"] += bundle_total
    
    # Calculate commission split
    dana_kecemerlangan = round(subtotal * (dk_percent / 100), 2)
    koperasi_amount = round(subtotal * (kop_percent / 100), 2)
    vendor_earnings = round(subtotal * (vendor_percent / 100), 2)
    
    # Create commission snapshot
    commission_snapshot = {
        "dana_kecemerlangan_percent": dk_percent,
        "koperasi_percent": kop_percent,
        "vendor_percent": vendor_percent,
        "dana_kecemerlangan_amount": dana_kecemerlangan,
        "koperasi_amount": koperasi_amount,
        "vendor_amount": vendor_earnings
    }
    
    order_doc = {
        "order_number": generate_order_number(),
        "buyer_id": str(user["_id"]),
        "buyer_name": user.get("full_name", ""),
        "buyer_email": user.get("email", ""),
        "buyer_phone": user.get("phone", ""),
        "student_snapshot": student_snapshot,
        "items": order_items,
        "subtotal": subtotal,
        "commission_snapshot": commission_snapshot,
        "dana_kecemerlangan_amount": dana_kecemerlangan,
        "koperasi_amount": koperasi_amount,
        "vendor_earnings": vendor_earnings,
        "total_amount": subtotal,
        "vendor_split": vendor_items,
        "status": OrderStatus.PENDING_PAYMENT.value,
        "status_history": [
            {"status": OrderStatus.PENDING_PAYMENT.value, "timestamp": datetime.now(timezone.utc).isoformat(), "notes": "Pesanan dicipta"}
        ],
        "delivery_notes": order.delivery_notes,
        "ledger_entries_created": False,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    
    result = await db.marketplace_orders.insert_one(order_doc)
    
    # Apply stock deductions
    for update in stock_updates:
        if update["type"] == "variant":
            await db.marketplace_products.update_one(
                {"_id": ObjectId(update["product_id"]), "variants.sku": update["variant_sku"]},
                {"$inc": {"variants.$.stock": -update["quantity"]}}
            )
        else:
            await db.marketplace_products.update_one(
                {"_id": ObjectId(update["product_id"])},
                {"$inc": {"stock": -update["quantity"]}}
            )
    
    await log_audit(user, "CREATE_ORDER", "marketplace", f"Pesanan dicipta: {order_doc['order_number']}")
    
    return {
        "id": str(result.inserted_id),
        "order_number": order_doc["order_number"],
        "total_amount": subtotal,
        "commission_snapshot": commission_snapshot,
        "message": "Pesanan berjaya dicipta. Sila buat pembayaran."
    }


@router.get("/orders", response_model=List[dict])
async def get_orders(
    status: Optional[str] = None,
    vendor_id: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Get orders - Parent sees their own, Vendor sees their orders, Admin sees all"""
    db = get_db()
    
    query = {}
    is_admin = user["role"] in ["superadmin", "admin", "bendahari"]
    
    if is_admin:
        if status:
            query["status"] = status
        if vendor_id:
            query["items.vendor_id"] = vendor_id
    elif user["role"] == "parent":
        # Check if user is a vendor
        vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
        
        if vendor and vendor_id == str(vendor["_id"]):
            # Vendor viewing their orders
            query["items.vendor_id"] = str(vendor["_id"])
        else:
            # Parent viewing their purchases
            query["buyer_id"] = str(user["_id"])
        
        if status:
            query["status"] = status
    else:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    orders = await db.marketplace_orders.find(query).sort("created_at", -1).to_list(200)
    
    result = []
    for o in orders:
        result.append({
            "id": str(o["_id"]),
            "order_number": o["order_number"],
            "buyer_name": o.get("buyer_name", ""),
            "student_name": o["student_snapshot"]["full_name"],
            "student_matric": o["student_snapshot"]["matric_number"],
            "student_block": o["student_snapshot"]["block_name"],
            "student_room": o["student_snapshot"]["room_number"],
            "items_count": len(o["items"]),
            "total_amount": o["total_amount"],
            "status": o["status"],
            "created_at": o["created_at"].isoformat() if o.get("created_at") else None,
            "updated_at": o.get("updated_at", o["created_at"]).isoformat() if o.get("updated_at") or o.get("created_at") else None
        })
    
    return result


@router.get("/orders/{order_id}", response_model=dict)
async def get_order(order_id: str, user: dict = Depends(get_current_user)):
    """Get single order details"""
    db = get_db()
    
    order = await db.marketplace_orders.find_one({"_id": ObjectId(order_id)})
    if not order:
        raise HTTPException(status_code=404, detail="Pesanan tidak dijumpai")
    
    is_admin = user["role"] in ["superadmin", "admin", "bendahari"]
    is_buyer = order["buyer_id"] == str(user["_id"])
    
    # Check if user is vendor of any item
    vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    is_vendor = vendor and any(item["vendor_id"] == str(vendor["_id"]) for item in order["items"])
    
    if not is_admin and not is_buyer and not is_vendor:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    return {
        "id": str(order["_id"]),
        "order_number": order["order_number"],
        "buyer_id": order["buyer_id"],
        "buyer_name": order.get("buyer_name", ""),
        "buyer_phone": order.get("buyer_phone", "") if is_admin or is_vendor else None,
        "student_snapshot": order["student_snapshot"],
        "items": order["items"],
        "subtotal": order["subtotal"],
        "dana_kecemerlangan_amount": order["dana_kecemerlangan_amount"],
        "koperasi_amount": order["koperasi_amount"],
        "vendor_earnings": order["vendor_earnings"],
        "total_amount": order["total_amount"],
        "commission_rates": order.get("commission_rates", {}),
        "status": order["status"],
        "status_history": order.get("status_history", []),
        "delivery_notes": order.get("delivery_notes"),
        "created_at": order["created_at"].isoformat() if order.get("created_at") else None,
        "updated_at": order.get("updated_at", order["created_at"]).isoformat() if order.get("updated_at") or order.get("created_at") else None
    }


@router.put("/orders/{order_id}/status", response_model=dict)
async def update_order_status(
    order_id: str,
    status_update: OrderStatusUpdate,
    user: dict = Depends(get_current_user)
):
    """Update order status - Admin or Vendor"""
    db = get_db()
    
    order = await db.marketplace_orders.find_one({"_id": ObjectId(order_id)})
    if not order:
        raise HTTPException(status_code=404, detail="Pesanan tidak dijumpai")
    
    is_admin = user["role"] in ["superadmin", "admin"]
    
    # Check if vendor can update
    vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    is_vendor = vendor and any(item["vendor_id"] == str(vendor["_id"]) for item in order["items"])
    
    if not is_admin and not is_vendor:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Validate status transition
    current_status = order["status"]
    new_status = status_update.status.value
    
    valid_transitions = {
        OrderStatus.PENDING_PAYMENT.value: [OrderStatus.PAID.value, OrderStatus.CANCELLED.value],
        OrderStatus.PAID.value: [OrderStatus.PREPARING.value, OrderStatus.CANCELLED.value],
        OrderStatus.PREPARING.value: [OrderStatus.OUT_FOR_DELIVERY.value, OrderStatus.CANCELLED.value],
        OrderStatus.OUT_FOR_DELIVERY.value: [OrderStatus.ARRIVED_HOSTEL.value, OrderStatus.FAILED.value],
        OrderStatus.ARRIVED_HOSTEL.value: [OrderStatus.DELIVERED.value, OrderStatus.FAILED.value],
        OrderStatus.DELIVERED.value: [],
        OrderStatus.FAILED.value: [],
        OrderStatus.CANCELLED.value: []
    }
    
    if new_status not in valid_transitions.get(current_status, []):
        raise HTTPException(status_code=400, detail=f"Tidak boleh tukar status dari '{current_status}' ke '{new_status}'")
    
    # Update status
    status_history = order.get("status_history", [])
    status_history.append({
        "status": new_status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "notes": status_update.notes,
        "updated_by": str(user["_id"])
    })
    
    update_data = {
        "status": new_status,
        "status_history": status_history,
        "updated_at": datetime.now(timezone.utc)
    }
    
    # If status is PAID, create ledger entries
    if new_status == OrderStatus.PAID.value and not order.get("ledger_entries_created"):
        # Create Dana Kecemerlangan entry
        await db.financial_ledger.insert_one({
            "type": LedgerType.DANA_KECEMERLANGAN.value,
            "amount": order["dana_kecemerlangan_amount"],
            "order_id": order_id,
            "order_number": order["order_number"],
            "description": f"Komisyen Dana Kecemerlangan dari pesanan {order['order_number']}",
            "reference_number": generate_reference_number("DK"),
            "created_at": datetime.now(timezone.utc)
        })
        
        # Create Koperasi entry
        await db.financial_ledger.insert_one({
            "type": LedgerType.KOPERASI.value,
            "amount": order["koperasi_amount"],
            "order_id": order_id,
            "order_number": order["order_number"],
            "description": f"Komisyen Koperasi dari pesanan {order['order_number']}",
            "reference_number": generate_reference_number("KOP"),
            "created_at": datetime.now(timezone.utc)
        })
        
        # Create vendor earnings entries
        commission_snap = order.get("commission_snapshot", {})
        vendor_percent = commission_snap.get("vendor_percent", 90)
        
        for vendor_id_key, vendor_data in order.get("vendor_split", {}).items():
            vendor_earning = vendor_data["total"] * (vendor_percent / 100)
            await db.financial_ledger.insert_one({
                "type": LedgerType.VENDOR_EARNING.value,
                "amount": round(vendor_earning, 2),
                "order_id": order_id,
                "order_number": order["order_number"],
                "vendor_id": vendor_id_key,
                "vendor_name": vendor_data["vendor_name"],
                "description": f"Pendapatan vendor dari pesanan {order['order_number']}",
                "reference_number": generate_reference_number("VND"),
                "created_at": datetime.now(timezone.utc)
            })
            
            # Also credit vendor wallet (update or create wallet record)
            await db.vendor_wallets.update_one(
                {"vendor_id": vendor_id_key},
                {
                    "$inc": {"total_earnings": round(vendor_earning, 2), "available_balance": round(vendor_earning, 2)},
                    "$setOnInsert": {"vendor_id": vendor_id_key, "pending_amount": 0, "total_withdrawn": 0, "created_at": datetime.now(timezone.utc)},
                    "$set": {"last_updated": datetime.now(timezone.utc)}
                },
                upsert=True
            )
            
            # Update vendor total sales
            await db.marketplace_vendors.update_one(
                {"_id": ObjectId(vendor_id_key)},
                {"$inc": {"total_sales": vendor_data["total"]}}
            )
        
        # Update products sales count
        for item in order["items"]:
            await db.marketplace_products.update_one(
                {"_id": ObjectId(item["product_id"])},
                {"$inc": {"sales_count": item["quantity"]}}
            )
        
        update_data["ledger_entries_created"] = True
    
    # If cancelled or failed, restore stock for all items (simple, variants, bundles)
    if new_status in [OrderStatus.CANCELLED.value, OrderStatus.FAILED.value]:
        for item in order["items"]:
            if item.get("is_bundle") and item.get("bundle_items"):
                # Restore stock for each item in the bundle
                for bi in item["bundle_items"]:
                    required_qty = bi["quantity"] * item["quantity"]
                    if bi.get("variant_sku"):
                        # Restore variant stock
                        await db.marketplace_products.update_one(
                            {"_id": ObjectId(bi["product_id"]), "variants.sku": bi["variant_sku"]},
                            {"$inc": {"variants.$.stock": required_qty}}
                        )
                    else:
                        # Restore simple product stock
                        await db.marketplace_products.update_one(
                            {"_id": ObjectId(bi["product_id"])},
                            {"$inc": {"stock": required_qty}}
                        )
            elif item.get("variant_snapshot") and item["variant_snapshot"].get("sku"):
                # Restore variant stock
                await db.marketplace_products.update_one(
                    {"_id": ObjectId(item["product_id"]), "variants.sku": item["variant_snapshot"]["sku"]},
                    {"$inc": {"variants.$.stock": item["quantity"]}}
                )
            else:
                # Restore simple product stock
                await db.marketplace_products.update_one(
                    {"_id": ObjectId(item["product_id"])},
                    {"$inc": {"stock": item["quantity"]}}
                )
    
    await db.marketplace_orders.update_one(
        {"_id": ObjectId(order_id)},
        {"$set": update_data}
    )
    
    # Notify buyer of status change
    await db.notifications.insert_one({
        "user_id": ObjectId(order["buyer_id"]),
        "title": "Status Pesanan Dikemaskini",
        "message": f"Pesanan {order['order_number']} telah dikemaskini ke status: {new_status}",
        "type": "info",
        "is_read": False,
        "created_at": datetime.now(timezone.utc)
    })
    
    await log_audit(user, "UPDATE_ORDER_STATUS", "marketplace", 
                   f"Status pesanan {order['order_number']} dikemaskini: {current_status} -> {new_status}")
    
    return {"message": f"Status pesanan dikemaskini ke '{new_status}'"}


# ==================== DASHBOARD STATS ====================

@router.get("/dashboard/stats", response_model=dict)
async def get_dashboard_stats(user: dict = Depends(get_current_user)):
    """Get dashboard statistics"""
    db = get_db()
    
    is_admin = user["role"] in ["superadmin", "admin", "bendahari"]
    
    # Check if user is a vendor
    vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    
    if is_admin:
        # Admin stats
        total_vendors = await db.marketplace_vendors.count_documents({"status": VendorStatus.APPROVED.value})
        pending_vendors = await db.marketplace_vendors.count_documents({"status": VendorStatus.PENDING.value})
        total_products = await db.marketplace_products.count_documents({"approval_status": ProductApprovalStatus.APPROVED.value, "is_active": True})
        pending_products = await db.marketplace_products.count_documents({"approval_status": ProductApprovalStatus.PENDING.value})
        total_orders = await db.marketplace_orders.count_documents({})
        
        # Calculate totals from ledger
        dk_total = await db.financial_ledger.aggregate([
            {"$match": {"type": LedgerType.DANA_KECEMERLANGAN.value}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]).to_list(1)
        
        kop_total = await db.financial_ledger.aggregate([
            {"$match": {"type": LedgerType.KOPERASI.value}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]).to_list(1)
        
        return {
            "type": "admin",
            "total_vendors": total_vendors,
            "pending_vendors": pending_vendors,
            "total_products": total_products,
            "pending_products": pending_products,
            "total_orders": total_orders,
            "dana_kecemerlangan_total": dk_total[0]["total"] if dk_total else 0,
            "koperasi_total": kop_total[0]["total"] if kop_total else 0
        }
    
    elif vendor:
        # Vendor stats
        vendor_id = str(vendor["_id"])
        my_products = await db.marketplace_products.count_documents({"vendor_id": vendor_id, "is_active": True})
        pending_products = await db.marketplace_products.count_documents({"vendor_id": vendor_id, "approval_status": ProductApprovalStatus.PENDING.value})
        
        my_orders = await db.marketplace_orders.count_documents({"items.vendor_id": vendor_id})
        pending_orders = await db.marketplace_orders.count_documents({
            "items.vendor_id": vendor_id,
            "status": {"$in": [OrderStatus.PAID.value, OrderStatus.PREPARING.value]}
        })
        
        # Calculate earnings
        earnings = await db.financial_ledger.aggregate([
            {"$match": {"type": LedgerType.VENDOR_EARNING.value, "vendor_id": vendor_id}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]).to_list(1)
        
        return {
            "type": "vendor",
            "vendor_status": vendor["status"],
            "my_products": my_products,
            "pending_products": pending_products,
            "my_orders": my_orders,
            "pending_orders": pending_orders,
            "total_sales": vendor.get("total_sales", 0),
            "total_earnings": earnings[0]["total"] if earnings else 0
        }
    
    else:
        # Parent/buyer stats
        my_orders = await db.marketplace_orders.count_documents({"buyer_id": str(user["_id"])})
        
        return {
            "type": "buyer",
            "my_orders": my_orders,
            "is_vendor": False
        }


# ==================== REPORTS ====================

@router.get("/reports/dana-kecemerlangan", response_model=dict)
async def get_dana_kecemerlangan_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Get Dana Kecemerlangan collection report - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    query = {"type": LedgerType.DANA_KECEMERLANGAN.value}
    
    if start_date:
        query["created_at"] = {"$gte": datetime.fromisoformat(start_date)}
    if end_date:
        if "created_at" not in query:
            query["created_at"] = {}
        query["created_at"]["$lte"] = datetime.fromisoformat(end_date)
    
    entries = await db.financial_ledger.find(query).sort("created_at", -1).to_list(500)
    
    total = sum(e["amount"] for e in entries)
    
    # Group by month
    by_month = {}
    for e in entries:
        month_key = e["created_at"].strftime("%Y-%m")
        if month_key not in by_month:
            by_month[month_key] = 0
        by_month[month_key] += e["amount"]
    
    return {
        "total_collected": total,
        "total_entries": len(entries),
        "by_month": [{"month": k, "amount": v} for k, v in sorted(by_month.items(), reverse=True)],
        "entries": [
            {
                "id": str(e["_id"]),
                "amount": e["amount"],
                "order_number": e.get("order_number", ""),
                "description": e["description"],
                "reference_number": e["reference_number"],
                "created_at": e["created_at"].isoformat()
            }
            for e in entries[:50]  # Limit to 50 recent entries
        ]
    }


@router.get("/reports/koperasi-revenue", response_model=dict)
async def get_koperasi_revenue_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Get Koperasi revenue report - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    query = {"type": LedgerType.KOPERASI.value}
    
    if start_date:
        query["created_at"] = {"$gte": datetime.fromisoformat(start_date)}
    if end_date:
        if "created_at" not in query:
            query["created_at"] = {}
        query["created_at"]["$lte"] = datetime.fromisoformat(end_date)
    
    entries = await db.financial_ledger.find(query).sort("created_at", -1).to_list(500)
    
    total = sum(e["amount"] for e in entries)
    
    # Group by month
    by_month = {}
    for e in entries:
        month_key = e["created_at"].strftime("%Y-%m")
        if month_key not in by_month:
            by_month[month_key] = 0
        by_month[month_key] += e["amount"]
    
    return {
        "total_revenue": total,
        "total_entries": len(entries),
        "by_month": [{"month": k, "amount": v} for k, v in sorted(by_month.items(), reverse=True)],
        "entries": [
            {
                "id": str(e["_id"]),
                "amount": e["amount"],
                "order_number": e.get("order_number", ""),
                "description": e["description"],
                "reference_number": e["reference_number"],
                "created_at": e["created_at"].isoformat()
            }
            for e in entries[:50]
        ]
    }


@router.get("/reports/vendor-performance", response_model=List[dict])
async def get_vendor_performance_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Get vendor performance report - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Get all approved vendors
    vendors = await db.marketplace_vendors.find({"status": VendorStatus.APPROVED.value}).to_list(200)
    
    result = []
    for v in vendors:
        vendor_id = str(v["_id"])
        
        # Get earnings from ledger
        query = {"type": LedgerType.VENDOR_EARNING.value, "vendor_id": vendor_id}
        if start_date:
            query["created_at"] = {"$gte": datetime.fromisoformat(start_date)}
        if end_date:
            if "created_at" not in query:
                query["created_at"] = {}
            query["created_at"]["$lte"] = datetime.fromisoformat(end_date)
        
        earnings = await db.financial_ledger.aggregate([
            {"$match": query},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
        ]).to_list(1)
        
        result.append({
            "vendor_id": vendor_id,
            "vendor_name": v["business_name"],
            "total_sales": v.get("total_sales", 0),
            "total_products": v.get("total_products", 0),
            "total_earnings": earnings[0]["total"] if earnings else 0,
            "orders_count": earnings[0]["count"] if earnings else 0,
            "rating": v.get("rating", 0)
        })
    
    # Sort by total sales
    result.sort(key=lambda x: x["total_sales"], reverse=True)
    
    return result



# ==================== BUNDLE MANAGEMENT ====================

@router.post("/bundles", response_model=dict)
async def create_bundle(bundle: BundleCreate, user: dict = Depends(get_current_user)):
    """Create a new bundle - Vendor only"""
    db = get_db()
    
    # Verify user is an approved vendor
    vendor = await db.marketplace_vendors.find_one({
        "user_id": str(user["_id"]),
        "status": VendorStatus.APPROVED.value
    })
    if not vendor:
        raise HTTPException(status_code=403, detail="Anda bukan vendor yang diluluskan")
    
    # Validate all items belong to this vendor and have stock
    original_price = 0
    bundle_items = []
    
    for item in bundle.items:
        product = await db.marketplace_products.find_one({
            "_id": ObjectId(item.product_id),
            "vendor_id": str(vendor["_id"]),
            "is_active": True,
            "approval_status": ProductApprovalStatus.APPROVED.value
        })
        
        if not product:
            raise HTTPException(status_code=400, detail=f"Produk dengan ID {item.product_id} tidak dijumpai atau tidak diluluskan")
        
        # Check stock
        if product.get("product_type") == ProductType.VARIABLE.value:
            if not item.variant_sku:
                raise HTTPException(status_code=400, detail=f"Produk '{product['name']}' mempunyai varian. Sila pilih SKU varian.")
            variant = next((v for v in product.get("variants", []) if v["sku"] == item.variant_sku), None)
            if not variant:
                raise HTTPException(status_code=400, detail=f"SKU varian '{item.variant_sku}' tidak dijumpai")
            if variant["stock"] < item.quantity:
                raise HTTPException(status_code=400, detail=f"Stok tidak mencukupi untuk varian {item.variant_sku}")
            item_price = variant.get("price_override") or product["price"]
        else:
            if product["stock"] < item.quantity:
                raise HTTPException(status_code=400, detail=f"Stok tidak mencukupi untuk '{product['name']}'")
            item_price = product["price"]
        
        original_price += item_price * item.quantity
        bundle_items.append({
            "product_id": str(product["_id"]),
            "product_name": product["name"],
            "quantity": item.quantity,
            "variant_sku": item.variant_sku,
            "unit_price": item_price
        })
    
    if bundle.price >= original_price:
        raise HTTPException(status_code=400, detail="Harga bundle mesti lebih rendah daripada jumlah harga individu")
    
    bundle_doc = {
        "vendor_id": str(vendor["_id"]),
        "vendor_name": vendor["business_name"],
        "name": bundle.name,
        "description": bundle.description,
        "price": bundle.price,
        "original_price": original_price,
        "savings": original_price - bundle.price,
        "items": bundle_items,
        "images": bundle.images,
        "category": bundle.category,
        "approval_status": ProductApprovalStatus.PENDING.value,
        "is_active": True,
        "sales_count": 0,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    
    result = await db.marketplace_bundles.insert_one(bundle_doc)
    
    # Notify admins
    admins = await db.users.find({"role": {"$in": ["superadmin", "admin"]}}).to_list(50)
    for admin in admins:
        await db.notifications.insert_one({
            "user_id": admin["_id"],
            "title": "Bundle Baru Menunggu Kelulusan",
            "message": f"Bundle '{bundle.name}' dari {vendor['business_name']} menunggu kelulusan.",
            "type": "action",
            "is_read": False,
            "link": "/admin/marketplace/products",
            "created_at": datetime.now(timezone.utc)
        })
    
    await log_audit(user, "CREATE_BUNDLE", "marketplace", f"Bundle dicipta: {bundle.name}")
    
    return {
        "id": str(result.inserted_id),
        "message": "Bundle berjaya dicipta. Menunggu kelulusan admin."
    }


@router.get("/bundles", response_model=List[dict])
async def get_bundles(
    vendor_id: Optional[str] = None,
    status: Optional[str] = None,
    user: dict = Depends(get_current_user_optional)
):
    """Get bundles - Public sees approved only, vendors see their own, admin sees all"""
    db = get_db()
    
    query = {}
    is_admin = user and user.get("role") in ["superadmin", "admin"]
    
    user_vendor = None
    if user:
        user_vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    
    if vendor_id:
        query["vendor_id"] = vendor_id
        if not is_admin and (not user_vendor or str(user_vendor["_id"]) != vendor_id):
            query["approval_status"] = ProductApprovalStatus.APPROVED.value
            query["is_active"] = True
    else:
        if not is_admin:
            query["approval_status"] = ProductApprovalStatus.APPROVED.value
            query["is_active"] = True
    
    if status and is_admin:
        query["approval_status"] = status
    
    bundles = await db.marketplace_bundles.find(query).sort("created_at", -1).to_list(100)
    
    result = []
    for b in bundles:
        result.append({
            "id": str(b["_id"]),
            "vendor_id": b["vendor_id"],
            "vendor_name": b.get("vendor_name", ""),
            "name": b["name"],
            "description": b.get("description"),
            "price": b["price"],
            "original_price": b.get("original_price", 0),
            "savings": b.get("savings", 0),
            "items": b.get("items", []),
            "images": b.get("images", []),
            "category": b.get("category", "bundle"),
            "approval_status": b["approval_status"],
            "is_active": b.get("is_active", True),
            "sales_count": b.get("sales_count", 0),
            "created_at": b["created_at"].isoformat() if b.get("created_at") else None
        })
    
    return result


@router.get("/bundles/my-bundles", response_model=List[dict])
async def get_my_bundles(user: dict = Depends(get_current_user)):
    """Get current vendor's bundles"""
    db = get_db()
    
    vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    if not vendor:
        raise HTTPException(status_code=403, detail="Anda bukan vendor")
    
    bundles = await db.marketplace_bundles.find({"vendor_id": str(vendor["_id"])}).sort("created_at", -1).to_list(100)
    
    return [{
        "id": str(b["_id"]),
        "name": b["name"],
        "description": b.get("description"),
        "price": b["price"],
        "original_price": b.get("original_price", 0),
        "savings": b.get("savings", 0),
        "items": b.get("items", []),
        "images": b.get("images", []),
        "approval_status": b["approval_status"],
        "is_active": b.get("is_active", True),
        "sales_count": b.get("sales_count", 0),
        "created_at": b["created_at"].isoformat() if b.get("created_at") else None
    } for b in bundles]


@router.get("/bundles/{bundle_id}", response_model=dict)
async def get_bundle(bundle_id: str, user: dict = Depends(get_current_user_optional)):
    """Get single bundle details"""
    db = get_db()
    
    bundle = await db.marketplace_bundles.find_one({"_id": ObjectId(bundle_id)})
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle tidak dijumpai")
    
    is_admin = user and user.get("role") in ["superadmin", "admin"]
    user_vendor = None
    if user:
        user_vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    is_owner = user_vendor and str(user_vendor["_id"]) == bundle["vendor_id"]
    
    # Non-admin/non-owner can only see approved bundles
    if not is_admin and not is_owner and bundle["approval_status"] != ProductApprovalStatus.APPROVED.value:
        raise HTTPException(status_code=404, detail="Bundle tidak dijumpai")
    
    return {
        "id": str(bundle["_id"]),
        "vendor_id": bundle["vendor_id"],
        "vendor_name": bundle.get("vendor_name", ""),
        "name": bundle["name"],
        "description": bundle.get("description"),
        "price": bundle["price"],
        "original_price": bundle.get("original_price", 0),
        "savings": bundle.get("savings", 0),
        "items": bundle.get("items", []),
        "images": bundle.get("images", []),
        "category": bundle.get("category", "bundle"),
        "approval_status": bundle["approval_status"],
        "rejection_reason": bundle.get("rejection_reason") if is_admin or is_owner else None,
        "is_active": bundle.get("is_active", True),
        "sales_count": bundle.get("sales_count", 0),
        "created_at": bundle["created_at"].isoformat() if bundle.get("created_at") else None,
        "approved_at": bundle.get("approved_at").isoformat() if bundle.get("approved_at") else None
    }


@router.put("/bundles/{bundle_id}", response_model=dict)
async def update_bundle(bundle_id: str, bundle_update: BundleUpdate, user: dict = Depends(get_current_user)):
    """Update bundle - Vendor owner only"""
    db = get_db()
    
    existing = await db.marketplace_bundles.find_one({"_id": ObjectId(bundle_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Bundle tidak dijumpai")
    
    # Verify ownership
    vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    is_admin = user["role"] in ["superadmin", "admin"]
    
    if not is_admin and (not vendor or str(vendor["_id"]) != existing["vendor_id"]):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    update_data = {}
    
    if bundle_update.name is not None:
        update_data["name"] = bundle_update.name
    if bundle_update.description is not None:
        update_data["description"] = bundle_update.description
    if bundle_update.images is not None:
        update_data["images"] = bundle_update.images
    if bundle_update.is_active is not None:
        update_data["is_active"] = bundle_update.is_active
    
    # If items or price changed, recalculate and validate
    if bundle_update.items is not None or bundle_update.price is not None:
        if bundle_update.items is not None:
            # Validate and recalculate original price
            original_price = 0
            bundle_items = []
            
            for item in bundle_update.items:
                product = await db.marketplace_products.find_one({
                    "_id": ObjectId(item.product_id),
                    "vendor_id": existing["vendor_id"],
                    "is_active": True
                })
                
                if not product:
                    raise HTTPException(status_code=400, detail=f"Produk dengan ID {item.product_id} tidak dijumpai")
                
                if product.get("product_type") == ProductType.VARIABLE.value:
                    if not item.variant_sku:
                        raise HTTPException(status_code=400, detail=f"Produk '{product['name']}' mempunyai varian. Sila pilih SKU varian.")
                    variant = next((v for v in product.get("variants", []) if v["sku"] == item.variant_sku), None)
                    if not variant:
                        raise HTTPException(status_code=400, detail=f"SKU varian '{item.variant_sku}' tidak dijumpai")
                    item_price = variant.get("price_override") or product["price"]
                else:
                    item_price = product["price"]
                
                original_price += item_price * item.quantity
                bundle_items.append({
                    "product_id": str(product["_id"]),
                    "product_name": product["name"],
                    "quantity": item.quantity,
                    "variant_sku": item.variant_sku,
                    "unit_price": item_price
                })
            
            update_data["items"] = bundle_items
            update_data["original_price"] = original_price
        else:
            original_price = existing.get("original_price", 0)
        
        # Validate price
        new_price = bundle_update.price if bundle_update.price is not None else existing["price"]
        if new_price >= original_price:
            raise HTTPException(status_code=400, detail="Harga bundle mesti lebih rendah daripada jumlah harga individu")
        
        if bundle_update.price is not None:
            update_data["price"] = bundle_update.price
            update_data["savings"] = original_price - bundle_update.price
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    # If significant changes, require re-approval (for non-admin)
    if not is_admin and any(k in update_data for k in ["price", "name", "items"]):
        update_data["approval_status"] = ProductApprovalStatus.PENDING.value
        update_data["rejection_reason"] = None
    
    await db.marketplace_bundles.update_one({"_id": ObjectId(bundle_id)}, {"$set": update_data})
    
    await log_audit(user, "UPDATE_BUNDLE", "marketplace", f"Bundle dikemaskini: {existing['name']}")
    
    return {"message": "Bundle berjaya dikemaskini"}


@router.delete("/bundles/{bundle_id}", response_model=dict)
async def delete_bundle(bundle_id: str, user: dict = Depends(get_current_user)):
    """Soft delete bundle - Vendor owner or admin"""
    db = get_db()
    
    bundle = await db.marketplace_bundles.find_one({"_id": ObjectId(bundle_id)})
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle tidak dijumpai")
    
    vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    is_admin = user["role"] in ["superadmin", "admin"]
    
    if not is_admin and (not vendor or str(vendor["_id"]) != bundle["vendor_id"]):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    await db.marketplace_bundles.update_one(
        {"_id": ObjectId(bundle_id)},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    
    await log_audit(user, "DELETE_BUNDLE", "marketplace", f"Bundle dipadam: {bundle['name']}")
    
    return {"message": "Bundle berjaya dipadam"}


@router.put("/bundles/{bundle_id}/approve", response_model=dict)
async def approve_bundle(
    bundle_id: str,
    approval: ProductApprovalRequest,
    user: dict = Depends(get_current_user)
):
    """Approve or reject bundle - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    bundle = await db.marketplace_bundles.find_one({"_id": ObjectId(bundle_id)})
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle tidak dijumpai")
    
    update_data = {
        "approval_status": approval.status.value,
        "updated_at": datetime.now(timezone.utc)
    }
    
    if approval.status == ProductApprovalStatus.APPROVED:
        update_data["approved_at"] = datetime.now(timezone.utc)
    elif approval.status == ProductApprovalStatus.REJECTED:
        if not approval.rejection_reason:
            raise HTTPException(status_code=400, detail="Sila nyatakan sebab penolakan")
        update_data["rejection_reason"] = approval.rejection_reason
    
    await db.marketplace_bundles.update_one({"_id": ObjectId(bundle_id)}, {"$set": update_data})
    
    await log_audit(user, f"BUNDLE_{approval.status.value.upper()}", "marketplace", f"Bundle {bundle['name']} {approval.status.value}")
    
    return {"message": f"Bundle berjaya di{approval.status.value}"}


# ==================== CATEGORY ACCESS RULES ====================

@router.get("/category-rules", response_model=List[dict])
async def get_category_rules(user: dict = Depends(get_current_user)):
    """Get all category access rules - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    rules = await db.marketplace_category_rules.find({}).to_list(100)
    
    return [{
        "id": str(r["_id"]),
        "category": r["category"],
        "allowed_roles": r.get("allowed_roles", ["parent"]),
        "requires_student": r.get("requires_student", True),
        "is_food": r.get("is_food", False),
        "created_at": r["created_at"].isoformat() if r.get("created_at") else None
    } for r in rules]


@router.post("/category-rules", response_model=dict)
async def create_category_rule(rule: CategoryAccessRuleCreate, user: dict = Depends(get_current_user)):
    """Create category access rule - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Check if rule already exists for this category
    existing = await db.marketplace_category_rules.find_one({"category": rule.category})
    if existing:
        raise HTTPException(status_code=400, detail="Peraturan untuk kategori ini sudah wujud")
    
    rule_doc = {
        "category": rule.category,
        "allowed_roles": rule.allowed_roles,
        "requires_student": rule.requires_student,
        "is_food": rule.is_food,
        "created_at": datetime.now(timezone.utc),
        "created_by": str(user["_id"])
    }
    
    result = await db.marketplace_category_rules.insert_one(rule_doc)
    
    await log_audit(user, "CREATE_CATEGORY_RULE", "marketplace", f"Peraturan kategori dicipta: {rule.category}")
    
    return {"id": str(result.inserted_id), "message": "Peraturan kategori berjaya dicipta"}


@router.put("/category-rules/{rule_id}", response_model=dict)
async def update_category_rule(
    rule_id: str,
    rule: CategoryAccessRuleCreate,
    user: dict = Depends(get_current_user)
):
    """Update category access rule - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    existing = await db.marketplace_category_rules.find_one({"_id": ObjectId(rule_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Peraturan tidak dijumpai")
    
    await db.marketplace_category_rules.update_one(
        {"_id": ObjectId(rule_id)},
        {"$set": {
            "category": rule.category,
            "allowed_roles": rule.allowed_roles,
            "requires_student": rule.requires_student,
            "is_food": rule.is_food,
            "updated_at": datetime.now(timezone.utc),
            "updated_by": str(user["_id"])
        }}
    )
    
    return {"message": "Peraturan kategori berjaya dikemaskini"}


@router.delete("/category-rules/{rule_id}", response_model=dict)
async def delete_category_rule(rule_id: str, user: dict = Depends(get_current_user)):
    """Delete category access rule - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    result = await db.marketplace_category_rules.delete_one({"_id": ObjectId(rule_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Peraturan tidak dijumpai")
    
    return {"message": "Peraturan kategori berjaya dipadam"}


# ==================== VENDOR WALLET & PAYOUT ====================

@router.get("/wallet/my-wallet", response_model=dict)
async def get_my_wallet(user: dict = Depends(get_current_user)):
    """Get vendor's wallet balance"""
    db = get_db()
    
    vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    if not vendor:
        raise HTTPException(status_code=403, detail="Anda bukan vendor")
    
    vendor_id = str(vendor["_id"])
    
    # Calculate earnings from ledger
    total_earnings_result = await db.financial_ledger.aggregate([
        {"$match": {"type": LedgerType.VENDOR_EARNING.value, "vendor_id": vendor_id}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    total_earnings = total_earnings_result[0]["total"] if total_earnings_result else 0
    
    # Calculate total withdrawn (payouts completed)
    total_withdrawn_result = await db.marketplace_payouts.aggregate([
        {"$match": {"vendor_id": vendor_id, "status": PayoutStatus.COMPLETED.value}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    total_withdrawn = total_withdrawn_result[0]["total"] if total_withdrawn_result else 0
    
    # Calculate pending payouts
    pending_payouts_result = await db.marketplace_payouts.aggregate([
        {"$match": {"vendor_id": vendor_id, "status": {"$in": [PayoutStatus.PENDING.value, PayoutStatus.APPROVED.value]}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    pending_payouts = pending_payouts_result[0]["total"] if pending_payouts_result else 0
    
    # Calculate pending earnings (orders not yet PAID)
    pending_earnings_result = await db.marketplace_orders.aggregate([
        {"$match": {"items.vendor_id": vendor_id, "status": OrderStatus.PENDING_PAYMENT.value}},
        {"$unwind": "$items"},
        {"$match": {"items.vendor_id": vendor_id}},
        {"$group": {"_id": None, "total": {"$sum": "$items.total_price"}}}
    ]).to_list(1)
    pending_earnings = pending_earnings_result[0]["total"] if pending_earnings_result else 0
    
    available_balance = total_earnings - total_withdrawn - pending_payouts
    
    return {
        "vendor_id": vendor_id,
        "total_earnings": round(total_earnings, 2),
        "pending_earnings": round(pending_earnings, 2),
        "available_balance": round(available_balance, 2),
        "total_withdrawn": round(total_withdrawn, 2),
        "pending_payouts": round(pending_payouts, 2)
    }


@router.post("/wallet/payout-request", response_model=dict)
async def request_payout(payout: PayoutRequest, user: dict = Depends(get_current_user)):
    """Request payout/withdrawal - Vendor only"""
    db = get_db()
    
    vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    if not vendor:
        raise HTTPException(status_code=403, detail="Anda bukan vendor")
    
    vendor_id = str(vendor["_id"])
    
    # Calculate available balance inline
    total_earnings_result = await db.financial_ledger.aggregate([
        {"$match": {"type": LedgerType.VENDOR_EARNING.value, "vendor_id": vendor_id}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    total_earnings = total_earnings_result[0]["total"] if total_earnings_result else 0
    
    total_withdrawn_result = await db.marketplace_payouts.aggregate([
        {"$match": {"vendor_id": vendor_id, "status": PayoutStatus.COMPLETED.value}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    total_withdrawn = total_withdrawn_result[0]["total"] if total_withdrawn_result else 0
    
    pending_payouts_result = await db.marketplace_payouts.aggregate([
        {"$match": {"vendor_id": vendor_id, "status": {"$in": [PayoutStatus.PENDING.value, PayoutStatus.APPROVED.value]}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    pending_payouts = pending_payouts_result[0]["total"] if pending_payouts_result else 0
    
    available_balance = total_earnings - total_withdrawn - pending_payouts
    
    if payout.amount > available_balance:
        raise HTTPException(status_code=400, detail=f"Baki tidak mencukupi. Baki tersedia: RM {available_balance:.2f}")
    
    if payout.amount < 10:
        raise HTTPException(status_code=400, detail="Jumlah minimum pengeluaran ialah RM 10")
    
    payout_doc = {
        "vendor_id": vendor_id,
        "vendor_name": vendor["business_name"],
        "amount": payout.amount,
        "bank_name": payout.bank_name,
        "bank_account_number": payout.bank_account_number,
        "bank_account_name": payout.bank_account_name,
        "notes": payout.notes,
        "status": PayoutStatus.PENDING.value,
        "requested_at": datetime.now(timezone.utc)
    }
    
    result = await db.marketplace_payouts.insert_one(payout_doc)
    
    # Notify admins
    admins = await db.users.find({"role": {"$in": ["superadmin", "admin", "bendahari"]}}).to_list(50)
    for admin in admins:
        await db.notifications.insert_one({
            "user_id": admin["_id"],
            "title": "Permohonan Pengeluaran Wang",
            "message": f"Vendor {vendor['business_name']} memohon pengeluaran RM {payout.amount:.2f}",
            "type": "action",
            "is_read": False,
            "link": "/admin/marketplace",
            "created_at": datetime.now(timezone.utc)
        })
    
    await log_audit(user, "PAYOUT_REQUEST", "marketplace", f"Permohonan pengeluaran: RM {payout.amount:.2f}")
    
    return {
        "id": str(result.inserted_id),
        "message": "Permohonan pengeluaran berjaya dihantar. Menunggu kelulusan admin."
    }


@router.get("/wallet/payout-history", response_model=List[dict])
async def get_payout_history(user: dict = Depends(get_current_user)):
    """Get vendor's payout history"""
    db = get_db()
    
    vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    if not vendor:
        raise HTTPException(status_code=403, detail="Anda bukan vendor")
    
    payouts = await db.marketplace_payouts.find({"vendor_id": str(vendor["_id"])}).sort("requested_at", -1).to_list(100)
    
    return [{
        "id": str(p["_id"]),
        "amount": p["amount"],
        "bank_name": p["bank_name"],
        "bank_account_number": p["bank_account_number"][-4:].rjust(len(p["bank_account_number"]), "*"),
        "status": p["status"],
        "rejection_reason": p.get("rejection_reason"),
        "reference_number": p.get("reference_number"),
        "requested_at": p["requested_at"].isoformat(),
        "processed_at": p.get("processed_at").isoformat() if p.get("processed_at") else None
    } for p in payouts]


@router.get("/payouts/pending", response_model=List[dict])
async def get_pending_payouts(user: dict = Depends(get_current_user)):
    """Get all pending payouts - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    payouts = await db.marketplace_payouts.find({
        "status": {"$in": [PayoutStatus.PENDING.value, PayoutStatus.APPROVED.value]}
    }).sort("requested_at", 1).to_list(200)
    
    return [{
        "id": str(p["_id"]),
        "vendor_id": p["vendor_id"],
        "vendor_name": p.get("vendor_name", ""),
        "amount": p["amount"],
        "bank_name": p["bank_name"],
        "bank_account_number": p["bank_account_number"],
        "bank_account_name": p["bank_account_name"],
        "notes": p.get("notes"),
        "status": p["status"],
        "requested_at": p["requested_at"].isoformat()
    } for p in payouts]


@router.put("/payouts/{payout_id}/approve", response_model=dict)
async def approve_payout(
    payout_id: str,
    approval: PayoutApproval,
    user: dict = Depends(get_current_user)
):
    """Approve or reject payout - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    payout = await db.marketplace_payouts.find_one({"_id": ObjectId(payout_id)})
    if not payout:
        raise HTTPException(status_code=404, detail="Permohonan tidak dijumpai")
    
    if payout["status"] not in [PayoutStatus.PENDING.value, PayoutStatus.APPROVED.value]:
        raise HTTPException(status_code=400, detail="Permohonan ini tidak boleh diproses lagi")
    
    update_data = {
        "status": approval.status.value,
        "processed_at": datetime.now(timezone.utc),
        "processed_by": str(user["_id"])
    }
    
    if approval.status == PayoutStatus.REJECTED:
        if not approval.rejection_reason:
            raise HTTPException(status_code=400, detail="Sila nyatakan sebab penolakan")
        update_data["rejection_reason"] = approval.rejection_reason
    
    elif approval.status == PayoutStatus.COMPLETED:
        if not approval.reference_number:
            raise HTTPException(status_code=400, detail="Sila masukkan nombor rujukan transaksi")
        update_data["reference_number"] = approval.reference_number
        
        # Create ledger entry for payout
        await db.financial_ledger.insert_one({
            "type": LedgerType.VENDOR_PAYOUT.value,
            "amount": -payout["amount"],  # Negative for payout
            "vendor_id": payout["vendor_id"],
            "vendor_name": payout.get("vendor_name", ""),
            "description": f"Pengeluaran wang vendor ke {payout['bank_name']} ({payout['bank_account_number'][-4:]})",
            "reference_number": approval.reference_number,
            "payout_id": payout_id,
            "created_at": datetime.now(timezone.utc)
        })
    
    await db.marketplace_payouts.update_one({"_id": ObjectId(payout_id)}, {"$set": update_data})
    
    # Notify vendor
    vendor = await db.marketplace_vendors.find_one({"_id": ObjectId(payout["vendor_id"])})
    if vendor:
        status_msg = {
            PayoutStatus.APPROVED.value: "diluluskan",
            PayoutStatus.REJECTED.value: "ditolak",
            PayoutStatus.COMPLETED.value: "selesai diproses"
        }
        await db.notifications.insert_one({
            "user_id": ObjectId(vendor["user_id"]),
            "title": "Status Pengeluaran Wang",
            "message": f"Permohonan pengeluaran RM {payout['amount']:.2f} telah {status_msg.get(approval.status.value, approval.status.value)}." +
                      (f" Rujukan: {approval.reference_number}" if approval.reference_number else "") +
                      (f" Sebab: {approval.rejection_reason}" if approval.rejection_reason else ""),
            "type": "info" if approval.status != PayoutStatus.REJECTED else "warning",
            "is_read": False,
            "created_at": datetime.now(timezone.utc)
        })
    
    await log_audit(user, f"PAYOUT_{approval.status.value.upper()}", "marketplace",
                   f"Pengeluaran {payout.get('vendor_name', '')} RM {payout['amount']:.2f} - {approval.status.value}")
    
    return {"message": f"Permohonan pengeluaran berjaya di{approval.status.value}"}


# ==================== MARKETPLACE CATEGORIES ====================

@router.get("/categories", response_model=List[dict])
async def get_marketplace_categories():
    """Get marketplace product categories with access rules"""
    db = get_db()
    
    # Default categories
    default_categories = [
        {"id": "food", "name": "Makanan", "name_en": "Food", "is_food": True, "icon": "🍔"},
        {"id": "clothing", "name": "Pakaian", "name_en": "Clothing", "is_food": False, "icon": "👕"},
        {"id": "stationery", "name": "Alat Tulis", "name_en": "Stationery", "is_food": False, "icon": "📚"},
        {"id": "electronics", "name": "Elektronik", "name_en": "Electronics", "is_food": False, "icon": "📱"},
        {"id": "accessories", "name": "Aksesori", "name_en": "Accessories", "is_food": False, "icon": "🎒"},
        {"id": "health", "name": "Kesihatan", "name_en": "Health", "is_food": False, "icon": "💊"},
        {"id": "sports", "name": "Sukan", "name_en": "Sports", "is_food": False, "icon": "⚽"},
        {"id": "bundle", "name": "Pakej Bundle", "name_en": "Bundle", "is_food": False, "icon": "📦"},
        {"id": "others", "name": "Lain-lain", "name_en": "Others", "is_food": False, "icon": "🛒"},
    ]
    
    # Fetch custom rules
    rules = await db.marketplace_category_rules.find({}).to_list(100)
    rules_map = {r["category"]: r for r in rules}
    
    result = []
    for cat in default_categories:
        rule = rules_map.get(cat["id"], {})
        result.append({
            **cat,
            "allowed_roles": rule.get("allowed_roles", ["parent"]),
            "requires_student": rule.get("requires_student", True)
        })
    
    return result


# ==================== FINANCIAL DASHBOARD ====================

@router.get("/finance/dashboard", response_model=dict)
async def get_finance_dashboard(user: dict = Depends(get_current_user)):
    """Get comprehensive financial dashboard - Admin/Bendahari only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    now = datetime.now(timezone.utc)
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Dana Kecemerlangan totals
    dk_total = await db.financial_ledger.aggregate([
        {"$match": {"type": LedgerType.DANA_KECEMERLANGAN.value}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    
    dk_month = await db.financial_ledger.aggregate([
        {"$match": {"type": LedgerType.DANA_KECEMERLANGAN.value, "created_at": {"$gte": start_of_month}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    
    # Koperasi totals
    kop_total = await db.financial_ledger.aggregate([
        {"$match": {"type": LedgerType.KOPERASI.value}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    
    kop_month = await db.financial_ledger.aggregate([
        {"$match": {"type": LedgerType.KOPERASI.value, "created_at": {"$gte": start_of_month}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    
    # Vendor earnings & payouts
    vendor_earnings_total = await db.financial_ledger.aggregate([
        {"$match": {"type": LedgerType.VENDOR_EARNING.value}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    
    vendor_payouts_total = await db.financial_ledger.aggregate([
        {"$match": {"type": LedgerType.VENDOR_PAYOUT.value}},
        {"$group": {"_id": None, "total": {"$sum": {"$abs": "$amount"}}}}
    ]).to_list(1)
    
    # Pending payouts count
    pending_payouts = await db.marketplace_payouts.count_documents({"status": PayoutStatus.PENDING.value})
    
    # Orders this month
    orders_month = await db.marketplace_orders.count_documents({"created_at": {"$gte": start_of_month}})
    orders_total = await db.marketplace_orders.count_documents({})
    
    # Total sales (from orders)
    sales_total = await db.marketplace_orders.aggregate([
        {"$match": {"status": {"$nin": [OrderStatus.CANCELLED.value, OrderStatus.FAILED.value]}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
    ]).to_list(1)
    
    sales_month = await db.marketplace_orders.aggregate([
        {"$match": {"created_at": {"$gte": start_of_month}, "status": {"$nin": [OrderStatus.CANCELLED.value, OrderStatus.FAILED.value]}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
    ]).to_list(1)
    
    # Monthly breakdown (last 6 months)
    monthly_breakdown = await db.financial_ledger.aggregate([
        {"$match": {"type": {"$in": [LedgerType.DANA_KECEMERLANGAN.value, LedgerType.KOPERASI.value, LedgerType.VENDOR_EARNING.value]}}},
        {"$group": {
            "_id": {
                "year": {"$year": "$created_at"},
                "month": {"$month": "$created_at"},
                "type": "$type"
            },
            "total": {"$sum": "$amount"}
        }},
        {"$sort": {"_id.year": -1, "_id.month": -1}},
        {"$limit": 30}
    ]).to_list(30)
    
    # Process monthly data
    months_data = {}
    for entry in monthly_breakdown:
        key = f"{entry['_id']['year']}-{entry['_id']['month']:02d}"
        if key not in months_data:
            months_data[key] = {"dana_kecemerlangan": 0, "koperasi": 0, "vendor_earnings": 0}
        if entry['_id']['type'] == LedgerType.DANA_KECEMERLANGAN.value:
            months_data[key]["dana_kecemerlangan"] = round(entry["total"], 2)
        elif entry['_id']['type'] == LedgerType.KOPERASI.value:
            months_data[key]["koperasi"] = round(entry["total"], 2)
        elif entry['_id']['type'] == LedgerType.VENDOR_EARNING.value:
            months_data[key]["vendor_earnings"] = round(entry["total"], 2)
    
    return {
        "summary": {
            "dana_kecemerlangan_total": round(dk_total[0]["total"], 2) if dk_total else 0,
            "dana_kecemerlangan_month": round(dk_month[0]["total"], 2) if dk_month else 0,
            "koperasi_total": round(kop_total[0]["total"], 2) if kop_total else 0,
            "koperasi_month": round(kop_month[0]["total"], 2) if kop_month else 0,
            "vendor_earnings_total": round(vendor_earnings_total[0]["total"], 2) if vendor_earnings_total else 0,
            "vendor_payouts_total": round(vendor_payouts_total[0]["total"], 2) if vendor_payouts_total else 0,
            "vendor_balance_unpaid": round((vendor_earnings_total[0]["total"] if vendor_earnings_total else 0) - (vendor_payouts_total[0]["total"] if vendor_payouts_total else 0), 2),
            "pending_payouts_count": pending_payouts,
            "sales_total": round(sales_total[0]["total"], 2) if sales_total else 0,
            "sales_month": round(sales_month[0]["total"], 2) if sales_month else 0,
            "orders_total": orders_total,
            "orders_month": orders_month
        },
        "monthly_breakdown": [
            {"month": k, **v} for k, v in sorted(months_data.items(), reverse=True)[:6]
        ]
    }


@router.get("/finance/ledger", response_model=dict)
async def get_finance_ledger(
    type: Optional[str] = None,
    vendor_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    user: dict = Depends(get_current_user)
):
    """Get financial ledger entries with filtering and pagination"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    query = {}
    
    if type:
        query["type"] = type
    
    if vendor_id:
        query["vendor_id"] = vendor_id
    
    if start_date:
        query.setdefault("created_at", {})["$gte"] = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
    
    if end_date:
        query.setdefault("created_at", {})["$lte"] = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
    
    # Get total count
    total = await db.financial_ledger.count_documents(query)
    
    # Get paginated entries
    skip = (page - 1) * limit
    entries = await db.financial_ledger.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Calculate totals for current filter
    totals = await db.financial_ledger.aggregate([
        {"$match": query},
        {"$group": {
            "_id": "$type",
            "total": {"$sum": "$amount"},
            "count": {"$sum": 1}
        }}
    ]).to_list(20)
    
    return {
        "entries": [{
            "id": str(e["_id"]),
            "type": e["type"],
            "amount": e["amount"],
            "order_id": e.get("order_id"),
            "order_number": e.get("order_number"),
            "vendor_id": e.get("vendor_id"),
            "vendor_name": e.get("vendor_name"),
            "description": e["description"],
            "reference_number": e["reference_number"],
            "created_at": e["created_at"].isoformat()
        } for e in entries],
        "pagination": {
            "total": total,
            "page": page,
            "limit": limit,
            "pages": (total + limit - 1) // limit
        },
        "totals": {t["_id"]: {"total": round(t["total"], 2), "count": t["count"]} for t in totals}
    }


@router.get("/finance/vendor-summary", response_model=List[dict])
async def get_vendor_financial_summary(user: dict = Depends(get_current_user)):
    """Get financial summary for all vendors - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Get all approved vendors
    vendors = await db.marketplace_vendors.find({"status": VendorStatus.APPROVED.value}).to_list(500)
    
    result = []
    for vendor in vendors:
        vendor_id = str(vendor["_id"])
        
        # Get earnings
        earnings = await db.financial_ledger.aggregate([
            {"$match": {"type": LedgerType.VENDOR_EARNING.value, "vendor_id": vendor_id}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]).to_list(1)
        
        # Get payouts
        payouts = await db.financial_ledger.aggregate([
            {"$match": {"type": LedgerType.VENDOR_PAYOUT.value, "vendor_id": vendor_id}},
            {"$group": {"_id": None, "total": {"$sum": {"$abs": "$amount"}}}}
        ]).to_list(1)
        
        # Get pending payout
        pending = await db.marketplace_payouts.aggregate([
            {"$match": {"vendor_id": vendor_id, "status": PayoutStatus.PENDING.value}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]).to_list(1)
        
        total_earnings = earnings[0]["total"] if earnings else 0
        total_payouts = payouts[0]["total"] if payouts else 0
        pending_amount = pending[0]["total"] if pending else 0
        
        result.append({
            "vendor_id": vendor_id,
            "vendor_name": vendor["business_name"],
            "parent_name": vendor.get("parent_name", ""),
            "total_sales": vendor.get("total_sales", 0),
            "total_earnings": round(total_earnings, 2),
            "total_paid": round(total_payouts, 2),
            "pending_payout": round(pending_amount, 2),
            "available_balance": round(total_earnings - total_payouts - pending_amount, 2),
            "orders_count": await db.marketplace_orders.count_documents({"items.vendor_id": vendor_id})
        })
    
    # Sort by total sales descending
    result.sort(key=lambda x: x["total_sales"], reverse=True)
    
    return result


@router.get("/finance/commission-report", response_model=dict)
async def get_commission_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Get detailed commission report - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Build date query
    date_query = {}
    if start_date:
        date_query["$gte"] = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
    if end_date:
        date_query["$lte"] = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
    
    order_query = {}
    if date_query:
        order_query["created_at"] = date_query
    order_query["status"] = {"$nin": [OrderStatus.CANCELLED.value, OrderStatus.PENDING_PAYMENT.value]}
    
    # Get orders with commission data
    orders = await db.marketplace_orders.find(order_query).sort("created_at", -1).to_list(500)
    
    # Aggregate data
    total_sales = 0
    total_dk = 0
    total_kop = 0
    total_vendor = 0
    
    by_vendor = {}
    by_date = {}
    
    for order in orders:
        total_sales += order.get("total_amount", 0)
        total_dk += order.get("dana_kecemerlangan_amount", 0)
        total_kop += order.get("koperasi_amount", 0)
        total_vendor += order.get("vendor_earnings", 0)
        
        # Group by date
        date_key = order["created_at"].strftime("%Y-%m-%d")
        if date_key not in by_date:
            by_date[date_key] = {"sales": 0, "dana_kecemerlangan": 0, "koperasi": 0, "vendor": 0, "orders": 0}
        by_date[date_key]["sales"] += order.get("total_amount", 0)
        by_date[date_key]["dana_kecemerlangan"] += order.get("dana_kecemerlangan_amount", 0)
        by_date[date_key]["koperasi"] += order.get("koperasi_amount", 0)
        by_date[date_key]["vendor"] += order.get("vendor_earnings", 0)
        by_date[date_key]["orders"] += 1
        
        # Group by vendor
        for item in order.get("items", []):
            vid = item.get("vendor_id")
            if vid not in by_vendor:
                by_vendor[vid] = {"vendor_name": item.get("vendor_name", ""), "sales": 0, "earnings": 0, "orders": 0}
            by_vendor[vid]["sales"] += item.get("total_price", 0)
            by_vendor[vid]["orders"] += 1
    
    # Calculate vendor earnings for by_vendor
    settings = await get_marketplace_settings(db)
    vendor_percent = settings.get("vendor_percent", 90)
    for vid in by_vendor:
        by_vendor[vid]["earnings"] = round(by_vendor[vid]["sales"] * vendor_percent / 100, 2)
    
    return {
        "period": {
            "start": start_date,
            "end": end_date
        },
        "summary": {
            "total_sales": round(total_sales, 2),
            "total_orders": len(orders),
            "dana_kecemerlangan": round(total_dk, 2),
            "koperasi": round(total_kop, 2),
            "vendor_earnings": round(total_vendor, 2)
        },
        "by_date": [{"date": k, **{key: round(v, 2) if isinstance(v, float) else v for key, v in val.items()}} for k, val in sorted(by_date.items(), reverse=True)[:30]],
        "by_vendor": [{"vendor_id": k, **v} for k, v in sorted(by_vendor.items(), key=lambda x: x[1]["sales"], reverse=True)]
    }


# ==================== ADMIN PAYOUT MANAGEMENT ====================

@router.get("/payouts/all", response_model=dict)
async def get_all_payouts(
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    user: dict = Depends(get_current_user)
):
    """Get all payouts with filtering and pagination - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    query = {}
    if status:
        query["status"] = status
    
    total = await db.marketplace_payouts.count_documents(query)
    skip = (page - 1) * limit
    
    payouts = await db.marketplace_payouts.find(query).sort("requested_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Get status counts
    status_counts = await db.marketplace_payouts.aggregate([
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]).to_list(10)
    
    return {
        "payouts": [{
            "id": str(p["_id"]),
            "vendor_id": p["vendor_id"],
            "vendor_name": p.get("vendor_name", ""),
            "amount": p["amount"],
            "bank_name": p["bank_name"],
            "bank_account_number": p["bank_account_number"],
            "bank_account_name": p["bank_account_name"],
            "notes": p.get("notes"),
            "status": p["status"],
            "rejection_reason": p.get("rejection_reason"),
            "reference_number": p.get("reference_number"),
            "requested_at": p["requested_at"].isoformat(),
            "processed_at": p["processed_at"].isoformat() if p.get("processed_at") else None,
            "processed_by": p.get("processed_by")
        } for p in payouts],
        "pagination": {
            "total": total,
            "page": page,
            "limit": limit,
            "pages": (total + limit - 1) // limit
        },
        "status_counts": {s["_id"]: s["count"] for s in status_counts}
    }



# ==================== MONETIZATION ADD-ONS ====================

# --------------- AD BANNERS ---------------

@router.get("/ad-packages", response_model=List[dict])
async def get_ad_packages():
    """Get all available ad packages"""
    db = get_db()
    settings = await get_marketplace_settings(db)
    ad_packages = settings.get("ad_packages", DEFAULT_SETTINGS["ad_packages"])
    
    result = []
    for pkg_type, pkg_data in ad_packages.items():
        result.append({
            "type": pkg_type,
            "name": pkg_data["name"],
            "price": pkg_data["price"],
            "duration_months": pkg_data["duration_months"],
            "features": pkg_data.get("features", [])
        })
    
    return result


@router.post("/ads", response_model=dict)
async def create_ad(ad: AdCreate, user: dict = Depends(get_current_user)):
    """Create advertisement - Vendor only"""
    db = get_db()
    
    # Verify user is an approved vendor
    vendor = await db.marketplace_vendors.find_one({
        "user_id": str(user["_id"]),
        "status": VendorStatus.APPROVED.value
    })
    if not vendor:
        raise HTTPException(status_code=403, detail="Anda bukan vendor yang diluluskan")
    
    # Get ad package details
    settings = await get_marketplace_settings(db)
    ad_packages = settings.get("ad_packages", DEFAULT_SETTINGS["ad_packages"])
    package = ad_packages.get(ad.package_type.value)
    
    if not package:
        raise HTTPException(status_code=400, detail="Pakej iklan tidak sah")
    
    ad_doc = {
        "vendor_id": str(vendor["_id"]),
        "vendor_name": vendor["business_name"],
        "package_type": ad.package_type.value,
        "package_name": package["name"],
        "price": package["price"],
        "duration_months": package["duration_months"],
        "title": ad.title,
        "description": ad.description,
        "image_url": ad.image_url,
        "link_url": ad.link_url,
        "status": AdStatus.PENDING.value,
        "impressions": 0,
        "clicks": 0,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    
    result = await db.marketplace_ads.insert_one(ad_doc)
    
    # Notify admins
    admins = await db.users.find({"role": {"$in": ["superadmin", "admin"]}}).to_list(50)
    for admin in admins:
        await db.notifications.insert_one({
            "user_id": admin["_id"],
            "title": "Iklan Baru Menunggu Kelulusan",
            "message": f"Iklan '{ad.title}' dari {vendor['business_name']} menunggu kelulusan.",
            "type": "action",
            "is_read": False,
            "link": "/admin/marketplace/ads",
            "created_at": datetime.now(timezone.utc)
        })
    
    await log_audit(user, "CREATE_AD", "marketplace", f"Iklan dicipta: {ad.title}")
    
    return {
        "id": str(result.inserted_id),
        "price": package["price"],
        "message": "Iklan berjaya dicipta. Menunggu kelulusan admin dan pembayaran."
    }


@router.get("/ads", response_model=List[dict])
async def get_ads(
    status: Optional[str] = None,
    vendor_id: Optional[str] = None,
    user: dict = Depends(get_current_user_optional)
):
    """Get ads - Admin sees all, vendor sees their own"""
    db = get_db()
    
    is_admin = user and user.get("role") in ["superadmin", "admin"]
    
    query = {}
    
    if is_admin:
        if status:
            query["status"] = status
        if vendor_id:
            query["vendor_id"] = vendor_id
    else:
        # Vendors can only see their own
        vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])}) if user else None
        if vendor:
            query["vendor_id"] = str(vendor["_id"])
        else:
            # Public only sees active ads
            query["status"] = AdStatus.ACTIVE.value
    
    ads = await db.marketplace_ads.find(query).sort("created_at", -1).to_list(100)
    
    return [{
        "id": str(a["_id"]),
        "vendor_id": a["vendor_id"],
        "vendor_name": a.get("vendor_name", ""),
        "package_type": a["package_type"],
        "package_name": a.get("package_name", ""),
        "price": a.get("price", 0),
        "duration_months": a.get("duration_months", 1),
        "title": a["title"],
        "description": a.get("description"),
        "image_url": a["image_url"],
        "link_url": a.get("link_url"),
        "status": a["status"],
        "rejection_reason": a.get("rejection_reason"),
        "payment_status": a.get("payment_status", "unpaid"),
        "start_date": a["start_date"].isoformat() if a.get("start_date") else None,
        "end_date": a["end_date"].isoformat() if a.get("end_date") else None,
        "impressions": a.get("impressions", 0),
        "clicks": a.get("clicks", 0),
        "created_at": a["created_at"].isoformat()
    } for a in ads]


@router.get("/ads/my-ads", response_model=List[dict])
async def get_my_ads(user: dict = Depends(get_current_user)):
    """Get vendor's own ads"""
    db = get_db()
    
    vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    if not vendor:
        raise HTTPException(status_code=403, detail="Anda bukan vendor")
    
    ads = await db.marketplace_ads.find({"vendor_id": str(vendor["_id"])}).sort("created_at", -1).to_list(100)
    
    return [{
        "id": str(a["_id"]),
        "package_type": a["package_type"],
        "package_name": a.get("package_name", ""),
        "price": a.get("price", 0),
        "title": a["title"],
        "description": a.get("description"),
        "image_url": a["image_url"],
        "link_url": a.get("link_url"),
        "status": a["status"],
        "rejection_reason": a.get("rejection_reason"),
        "payment_status": a.get("payment_status", "unpaid"),
        "start_date": a["start_date"].isoformat() if a.get("start_date") else None,
        "end_date": a["end_date"].isoformat() if a.get("end_date") else None,
        "impressions": a.get("impressions", 0),
        "clicks": a.get("clicks", 0),
        "created_at": a["created_at"].isoformat()
    } for a in ads]


@router.get("/ads/active", response_model=List[dict])
async def get_active_ads():
    """Get currently active ads for display"""
    db = get_db()
    now = datetime.now(timezone.utc)
    
    ads = await db.marketplace_ads.find({
        "status": AdStatus.ACTIVE.value,
        "start_date": {"$lte": now},
        "end_date": {"$gte": now}
    }).sort([("package_type", -1), ("created_at", -1)]).to_list(20)
    
    # Increment impressions
    for ad in ads:
        await db.marketplace_ads.update_one(
            {"_id": ad["_id"]},
            {"$inc": {"impressions": 1}}
        )
    
    return [{
        "id": str(a["_id"]),
        "vendor_name": a.get("vendor_name", ""),
        "package_type": a["package_type"],
        "title": a["title"],
        "description": a.get("description"),
        "image_url": a["image_url"],
        "link_url": a.get("link_url")
    } for a in ads]


@router.post("/ads/{ad_id}/click", response_model=dict)
async def record_ad_click(ad_id: str):
    """Record ad click"""
    db = get_db()
    
    result = await db.marketplace_ads.update_one(
        {"_id": ObjectId(ad_id)},
        {"$inc": {"clicks": 1}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Iklan tidak dijumpai")
    
    return {"message": "Klik direkodkan"}


@router.put("/ads/{ad_id}/approve", response_model=dict)
async def approve_ad(
    ad_id: str,
    approval: AdApprovalRequest,
    user: dict = Depends(get_current_user)
):
    """Approve or reject ad - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    ad = await db.marketplace_ads.find_one({"_id": ObjectId(ad_id)})
    if not ad:
        raise HTTPException(status_code=404, detail="Iklan tidak dijumpai")
    
    update_data = {
        "status": approval.status.value,
        "updated_at": datetime.now(timezone.utc),
        "approved_by": str(user["_id"])
    }
    
    if approval.status == AdStatus.APPROVED:
        # Set payment as pending (vendor needs to pay)
        update_data["payment_status"] = "pending_payment"
        update_data["rejection_reason"] = None
        update_data["approved_at"] = datetime.now(timezone.utc)
    elif approval.status == AdStatus.REJECTED:
        if not approval.rejection_reason:
            raise HTTPException(status_code=400, detail="Sila nyatakan sebab penolakan")
        update_data["rejection_reason"] = approval.rejection_reason
    
    await db.marketplace_ads.update_one(
        {"_id": ObjectId(ad_id)},
        {"$set": update_data}
    )
    
    # Notify vendor
    vendor = await db.marketplace_vendors.find_one({"_id": ObjectId(ad["vendor_id"])})
    if vendor:
        await db.notifications.insert_one({
            "user_id": ObjectId(vendor["user_id"]),
            "title": "Status Kelulusan Iklan",
            "message": f"Iklan '{ad['title']}' telah {'diluluskan. Sila buat pembayaran.' if approval.status == AdStatus.APPROVED else 'ditolak. Sebab: ' + (approval.rejection_reason or '')}",
            "type": "info" if approval.status == AdStatus.APPROVED else "warning",
            "is_read": False,
            "link": "/vendor/ads",
            "created_at": datetime.now(timezone.utc)
        })
    
    await log_audit(user, f"AD_{approval.status.value.upper()}", "marketplace", f"Iklan '{ad['title']}' {approval.status.value}")
    
    return {"message": f"Iklan berjaya di{approval.status.value}"}


@router.post("/ads/{ad_id}/pay", response_model=dict)
async def pay_for_ad(ad_id: str, user: dict = Depends(get_current_user)):
    """Process payment for approved ad (MOCKED) - Activates ad"""
    db = get_db()
    
    # Verify vendor owns this ad
    vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    if not vendor:
        raise HTTPException(status_code=403, detail="Anda bukan vendor")
    
    ad = await db.marketplace_ads.find_one({
        "_id": ObjectId(ad_id),
        "vendor_id": str(vendor["_id"])
    })
    
    if not ad:
        raise HTTPException(status_code=404, detail="Iklan tidak dijumpai")
    
    if ad["status"] != AdStatus.APPROVED.value:
        raise HTTPException(status_code=400, detail="Iklan belum diluluskan atau sudah aktif")
    
    # Calculate start and end dates
    now = datetime.now(timezone.utc)
    duration_months = ad.get("duration_months", 1)
    end_date = now + timedelta(days=duration_months * 30)
    
    # Create ledger entry
    await db.financial_ledger.insert_one({
        "type": LedgerType.AD_REVENUE.value,
        "amount": ad["price"],
        "ad_id": ad_id,
        "vendor_id": str(vendor["_id"]),
        "vendor_name": vendor["business_name"],
        "description": f"Pembayaran iklan {ad['package_name']}: {ad['title']}",
        "reference_number": generate_reference_number("AD"),
        "created_at": now
    })
    
    # Activate ad
    await db.marketplace_ads.update_one(
        {"_id": ObjectId(ad_id)},
        {"$set": {
            "status": AdStatus.ACTIVE.value,
            "payment_status": "paid",
            "paid_at": now,
            "start_date": now,
            "end_date": end_date,
            "updated_at": now
        }}
    )
    
    await log_audit(user, "PAY_AD", "marketplace", f"Pembayaran iklan: {ad['title']}")
    
    return {
        "message": "Pembayaran berjaya. Iklan anda kini aktif!",
        "start_date": now.isoformat(),
        "end_date": end_date.isoformat()
    }


@router.delete("/ads/{ad_id}", response_model=dict)
async def delete_ad(ad_id: str, user: dict = Depends(get_current_user)):
    """Delete ad - vendor or admin"""
    db = get_db()
    
    ad = await db.marketplace_ads.find_one({"_id": ObjectId(ad_id)})
    if not ad:
        raise HTTPException(status_code=404, detail="Iklan tidak dijumpai")
    
    is_admin = user["role"] in ["superadmin", "admin"]
    vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    is_owner = vendor and str(vendor["_id"]) == ad["vendor_id"]
    
    if not is_admin and not is_owner:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Cannot delete active paid ads
    if ad["status"] == AdStatus.ACTIVE.value and ad.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Tidak boleh padam iklan yang aktif dan berbayar")
    
    await db.marketplace_ads.delete_one({"_id": ObjectId(ad_id)})
    
    await log_audit(user, "DELETE_AD", "marketplace", f"Iklan dipadam: {ad['title']}")
    
    return {"message": "Iklan berjaya dipadam"}


# --------------- FEATURED PRODUCTS & BOOSTS ---------------

@router.get("/boost-packages", response_model=List[dict])
async def get_boost_packages():
    """Get available product boost packages"""
    return [
        {
            "type": "featured",
            "name": "Produk Pilihan",
            "description": "Paparkan produk anda di bahagian 'Produk Pilihan'",
            "prices": [
                {"days": 7, "price": 15.0, "label": "1 Minggu"},
                {"days": 14, "price": 25.0, "label": "2 Minggu"},
                {"days": 30, "price": 45.0, "label": "1 Bulan"}
            ]
        },
        {
            "type": "boost",
            "name": "Boost Visibility",
            "description": "Tingkatkan ranking produk dalam carian",
            "prices": [
                {"days": 3, "price": 5.0, "label": "3 Hari"},
                {"days": 7, "price": 10.0, "label": "1 Minggu"},
                {"days": 14, "price": 18.0, "label": "2 Minggu"}
            ]
        }
    ]


@router.post("/products/{product_id}/boost", response_model=dict)
async def boost_product(
    product_id: str,
    boost: ProductBoostCreate,
    user: dict = Depends(get_current_user)
):
    """Boost/feature a product - Vendor only"""
    db = get_db()
    
    # Verify vendor owns product
    vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    if not vendor:
        raise HTTPException(status_code=403, detail="Anda bukan vendor")
    
    product = await db.marketplace_products.find_one({
        "_id": ObjectId(product_id),
        "vendor_id": str(vendor["_id"]),
        "approval_status": ProductApprovalStatus.APPROVED.value
    })
    
    if not product:
        raise HTTPException(status_code=404, detail="Produk tidak dijumpai atau belum diluluskan")
    
    # Calculate price based on boost type and duration
    boost_prices = {
        "featured": {7: 15.0, 14: 25.0, 30: 45.0},
        "boost": {3: 5.0, 7: 10.0, 14: 18.0}
    }
    
    price = boost_prices.get(boost.boost_type.value, {}).get(boost.duration_days)
    if not price:
        raise HTTPException(status_code=400, detail="Tempoh boost tidak sah")
    
    now = datetime.now(timezone.utc)
    end_date = now + timedelta(days=boost.duration_days)
    
    # Create boost record
    boost_doc = {
        "product_id": product_id,
        "product_name": product["name"],
        "vendor_id": str(vendor["_id"]),
        "vendor_name": vendor["business_name"],
        "boost_type": boost.boost_type.value,
        "duration_days": boost.duration_days,
        "price_paid": price,
        "start_date": now,
        "end_date": end_date,
        "is_active": True,
        "impressions": 0,
        "clicks": 0,
        "created_at": now
    }
    
    result = await db.product_boosts.insert_one(boost_doc)
    
    # Update product
    update_fields = {"updated_at": now}
    if boost.boost_type == BoostType.FEATURED:
        update_fields["is_featured"] = True
        update_fields["featured_until"] = end_date
    elif boost.boost_type == BoostType.BOOST:
        update_fields["is_boosted"] = True
        update_fields["boost_expires_at"] = end_date
    
    await db.marketplace_products.update_one(
        {"_id": ObjectId(product_id)},
        {"$set": update_fields}
    )
    
    # Create ledger entry
    ledger_type = LedgerType.FEATURED_PRODUCT.value if boost.boost_type == BoostType.FEATURED else LedgerType.BOOST_LISTING.value
    await db.financial_ledger.insert_one({
        "type": ledger_type,
        "amount": price,
        "product_id": product_id,
        "vendor_id": str(vendor["_id"]),
        "vendor_name": vendor["business_name"],
        "description": f"{'Produk Pilihan' if boost.boost_type == BoostType.FEATURED else 'Boost'}: {product['name']} ({boost.duration_days} hari)",
        "reference_number": generate_reference_number("BST"),
        "created_at": now
    })
    
    await log_audit(user, "BOOST_PRODUCT", "marketplace", f"{boost.boost_type.value}: {product['name']} ({boost.duration_days} hari)")
    
    return {
        "id": str(result.inserted_id),
        "message": "Produk berjaya di-boost!",
        "price_paid": price,
        "end_date": end_date.isoformat()
    }


@router.get("/products/{product_id}/boosts", response_model=List[dict])
async def get_product_boosts(product_id: str, user: dict = Depends(get_current_user)):
    """Get boost history for a product"""
    db = get_db()
    
    # Verify ownership
    vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    is_admin = user["role"] in ["superadmin", "admin"]
    
    if not is_admin and not vendor:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    query = {"product_id": product_id}
    if not is_admin and vendor:
        query["vendor_id"] = str(vendor["_id"])
    
    boosts = await db.product_boosts.find(query).sort("created_at", -1).to_list(50)
    
    return [{
        "id": str(b["_id"]),
        "boost_type": b["boost_type"],
        "duration_days": b["duration_days"],
        "price_paid": b["price_paid"],
        "start_date": b["start_date"].isoformat(),
        "end_date": b["end_date"].isoformat(),
        "is_active": b.get("is_active", False) and b["end_date"] > datetime.now(timezone.utc),
        "impressions": b.get("impressions", 0),
        "clicks": b.get("clicks", 0),
        "created_at": b["created_at"].isoformat()
    } for b in boosts]


@router.get("/my-boosts", response_model=List[dict])
async def get_my_boosts(user: dict = Depends(get_current_user)):
    """Get all active boosts for vendor"""
    db = get_db()
    
    vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    if not vendor:
        raise HTTPException(status_code=403, detail="Anda bukan vendor")
    
    now = datetime.now(timezone.utc)
    boosts = await db.product_boosts.find({
        "vendor_id": str(vendor["_id"]),
        "end_date": {"$gte": now}
    }).sort("end_date", 1).to_list(50)
    
    result = []
    for b in boosts:
        end_date = b["end_date"]
        # Ensure end_date is timezone-aware
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)
        
        result.append({
            "id": str(b["_id"]),
            "product_id": b["product_id"],
            "product_name": b["product_name"],
            "boost_type": b["boost_type"],
            "duration_days": b["duration_days"],
            "price_paid": b["price_paid"],
            "start_date": b["start_date"].isoformat() if b.get("start_date") else None,
            "end_date": end_date.isoformat(),
            "days_remaining": (end_date - now).days,
            "is_active": b.get("is_active", True),
            "impressions": b.get("impressions", 0),
            "clicks": b.get("clicks", 0)
        })
    
    return result


# --------------- PREMIUM VENDOR SUBSCRIPTION ---------------

@router.get("/premium-packages", response_model=List[dict])
async def get_premium_packages():
    """Get vendor premium subscription packages"""
    return [
        {
            "type": "monthly",
            "name": "Langganan Bulanan",
            "price": 29.0,
            "duration_months": 1,
            "features": [
                "Unlimited produk listing",
                "Yuran komisyen dikurangkan ke 85%",
                "Badge 'Premium Vendor'",
                "Akses analytics terperinci",
                "Sokongan keutamaan"
            ]
        },
        {
            "type": "quarterly",
            "name": "Langganan Suku Tahun",
            "price": 79.0,
            "duration_months": 3,
            "features": [
                "Semua faedah bulanan",
                "Jimat 9%",
                "1x Free Featured Product (7 hari)"
            ]
        },
        {
            "type": "yearly",
            "name": "Langganan Tahunan",
            "price": 249.0,
            "duration_months": 12,
            "features": [
                "Semua faedah suku tahun",
                "Jimat 28%",
                "3x Free Featured Product (7 hari)",
                "1x Free Ad Banner (Bronze)"
            ]
        }
    ]


# --------------- FLASH SALES ---------------

@router.get("/flash-sales", response_model=List[dict])
async def get_flash_sales():
    """Get available and upcoming flash sales"""
    db = get_db()
    now = datetime.now(timezone.utc)
    
    flash_sales = await db.flash_sales.find({
        "end_time": {"$gte": now},
        "is_active": True
    }).sort("start_time", 1).to_list(20)
    
    result = []
    for fs in flash_sales:
        # Get products in this flash sale
        products = await db.flash_sale_products.find(
            {"flash_sale_id": str(fs["_id"])}
        ).to_list(50)
        
        result.append({
            "id": str(fs["_id"]),
            "name": fs["name"],
            "description": fs.get("description"),
            "start_time": fs["start_time"].isoformat(),
            "end_time": fs["end_time"].isoformat(),
            "max_products": fs["max_products"],
            "current_products": len(products),
            "price_per_slot": fs["price_per_slot"],
            "is_live": fs["start_time"] <= now <= fs["end_time"],
            "products_count": len(products)
        })
    
    return result


@router.post("/flash-sales", response_model=dict)
async def create_flash_sale(
    name: str,
    description: Optional[str],
    start_time: datetime,
    end_time: datetime,
    max_products: int = 10,
    price_per_slot: float = 10.0,
    user: dict = Depends(get_current_user)
):
    """Create flash sale event - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    if start_time >= end_time:
        raise HTTPException(status_code=400, detail="Masa mula mesti sebelum masa tamat")
    
    flash_sale_doc = {
        "name": name,
        "description": description,
        "start_time": start_time,
        "end_time": end_time,
        "max_products": max_products,
        "price_per_slot": price_per_slot,
        "is_active": True,
        "created_by": str(user["_id"]),
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await db.flash_sales.insert_one(flash_sale_doc)
    
    await log_audit(user, "CREATE_FLASH_SALE", "marketplace", f"Flash sale dicipta: {name}")
    
    return {
        "id": str(result.inserted_id),
        "message": "Flash sale berjaya dicipta"
    }


@router.post("/flash-sales/{flash_sale_id}/register", response_model=dict)
async def register_for_flash_sale(
    flash_sale_id: str,
    registration: FlashSaleRegistration,
    user: dict = Depends(get_current_user)
):
    """Register product for flash sale - Vendor only"""
    db = get_db()
    
    vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    if not vendor:
        raise HTTPException(status_code=403, detail="Anda bukan vendor")
    
    # Verify flash sale exists and has slots
    flash_sale = await db.flash_sales.find_one({"_id": ObjectId(flash_sale_id)})
    if not flash_sale:
        raise HTTPException(status_code=404, detail="Flash sale tidak dijumpai")
    
    # Check available slots
    current_count = await db.flash_sale_products.count_documents({"flash_sale_id": flash_sale_id})
    if current_count >= flash_sale["max_products"]:
        raise HTTPException(status_code=400, detail="Flash sale sudah penuh")
    
    # Verify product ownership
    product = await db.marketplace_products.find_one({
        "_id": ObjectId(registration.product_id),
        "vendor_id": str(vendor["_id"]),
        "approval_status": ProductApprovalStatus.APPROVED.value
    })
    
    if not product:
        raise HTTPException(status_code=404, detail="Produk tidak dijumpai atau belum diluluskan")
    
    # Check if already registered
    existing = await db.flash_sale_products.find_one({
        "flash_sale_id": flash_sale_id,
        "product_id": registration.product_id
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Produk sudah didaftarkan untuk flash sale ini")
    
    now = datetime.now(timezone.utc)
    discounted_price = product["price"] * (1 - registration.discount_percent / 100)
    
    registration_doc = {
        "flash_sale_id": flash_sale_id,
        "product_id": registration.product_id,
        "product_name": product["name"],
        "vendor_id": str(vendor["_id"]),
        "vendor_name": vendor["business_name"],
        "original_price": product["price"],
        "discount_percent": registration.discount_percent,
        "discounted_price": round(discounted_price, 2),
        "slot_price_paid": flash_sale["price_per_slot"],
        "is_active": True,
        "created_at": now
    }
    
    await db.flash_sale_products.insert_one(registration_doc)
    
    # Create ledger entry
    await db.financial_ledger.insert_one({
        "type": LedgerType.FLASH_SALE_SLOT.value,
        "amount": flash_sale["price_per_slot"],
        "flash_sale_id": flash_sale_id,
        "product_id": registration.product_id,
        "vendor_id": str(vendor["_id"]),
        "vendor_name": vendor["business_name"],
        "description": f"Slot Flash Sale: {product['name']}",
        "reference_number": generate_reference_number("FS"),
        "created_at": now
    })
    
    await log_audit(user, "REGISTER_FLASH_SALE", "marketplace", f"Produk didaftarkan untuk flash sale: {product['name']}")
    
    return {
        "message": "Produk berjaya didaftarkan untuk flash sale",
        "discounted_price": round(discounted_price, 2),
        "slot_price_paid": flash_sale["price_per_slot"]
    }


# --------------- EXPIRATION SCHEDULER ---------------

@router.post("/scheduler/expire-features", response_model=dict)
async def run_expiration_scheduler(cron_key: Optional[str] = None, user: dict = Depends(get_current_user_optional)):
    """Run expiration scheduler for ads, boosts, subscriptions - Called by CRON or Admin"""
    import os
    db = get_db()
    
    # Verify access - either admin or valid cron key
    is_admin = user and user.get("role") in ["superadmin", "admin"]
    valid_cron_key = cron_key == os.environ.get("CRON_SECRET_KEY", "")
    
    if not is_admin and not valid_cron_key:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    now = datetime.now(timezone.utc)
    expired_counts = {"ads": 0, "boosts": 0, "subscriptions": 0}
    
    # 1. Expire ads
    expired_ads = await db.marketplace_ads.update_many(
        {
            "status": AdStatus.ACTIVE.value,
            "end_date": {"$lt": now}
        },
        {"$set": {"status": AdStatus.EXPIRED.value, "updated_at": now}}
    )
    expired_counts["ads"] = expired_ads.modified_count
    
    # 2. Expire product boosts
    expired_boosts = await db.product_boosts.find({
        "is_active": True,
        "end_date": {"$lt": now}
    }).to_list(500)
    
    for boost in expired_boosts:
        await db.product_boosts.update_one(
            {"_id": boost["_id"]},
            {"$set": {"is_active": False}}
        )
        
        # Update product
        if boost["boost_type"] == BoostType.FEATURED.value:
            await db.marketplace_products.update_one(
                {"_id": ObjectId(boost["product_id"])},
                {"$set": {"is_featured": False, "featured_until": None}}
            )
        elif boost["boost_type"] == BoostType.BOOST.value:
            await db.marketplace_products.update_one(
                {"_id": ObjectId(boost["product_id"])},
                {"$set": {"is_boosted": False, "boost_expires_at": None}}
            )
    
    expired_counts["boosts"] = len(expired_boosts)
    
    # 3. Expire vendor premium subscriptions
    expired_vendors = await db.marketplace_vendors.find({
        "tier": VendorTier.PREMIUM.value,
        "premium_expires_at": {"$lt": now}
    }).to_list(500)
    
    for vendor in expired_vendors:
        await db.marketplace_vendors.update_one(
            {"_id": vendor["_id"]},
            {"$set": {"tier": VendorTier.FREE.value}}
        )
        
        # Notify vendor
        await db.notifications.insert_one({
            "user_id": ObjectId(vendor["user_id"]),
            "title": "Langganan Premium Tamat",
            "message": "Langganan premium anda telah tamat. Langgani semula untuk terus menikmati faedah premium.",
            "type": "warning",
            "is_read": False,
            "link": "/vendor/subscription",
            "created_at": now
        })
    
    expired_counts["subscriptions"] = len(expired_vendors)
    
    # Log scheduler run
    await db.scheduler_logs.insert_one({
        "type": "expire_features",
        "expired_counts": expired_counts,
        "run_at": now,
        "triggered_by": "admin" if is_admin else "cron"
    })
    
    return {
        "message": "Scheduler berjaya dijalankan",
        "expired": expired_counts,
        "run_at": now.isoformat()
    }


# --------------- MONETIZATION STATS FOR ADMIN ---------------

@router.get("/monetization/stats", response_model=dict)
async def get_monetization_stats(user: dict = Depends(get_current_user)):
    """Get monetization statistics - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    now = datetime.now(timezone.utc)
    
    # Active ads
    active_ads = await db.marketplace_ads.count_documents({"status": AdStatus.ACTIVE.value})
    pending_ads = await db.marketplace_ads.count_documents({"status": AdStatus.PENDING.value})
    
    # Ad revenue
    ad_revenue = await db.financial_ledger.aggregate([
        {"$match": {"type": LedgerType.AD_REVENUE.value}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    
    # Boost revenue
    boost_revenue = await db.financial_ledger.aggregate([
        {"$match": {"type": {"$in": [LedgerType.FEATURED_PRODUCT.value, LedgerType.BOOST_LISTING.value]}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    
    # Premium subscriptions revenue
    subscription_revenue = await db.financial_ledger.aggregate([
        {"$match": {"type": LedgerType.PREMIUM_SUBSCRIPTION.value}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    
    # Flash sale revenue
    flash_sale_revenue = await db.financial_ledger.aggregate([
        {"$match": {"type": LedgerType.FLASH_SALE_SLOT.value}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    
    # Active premium vendors
    premium_vendors = await db.marketplace_vendors.count_documents({
        "tier": VendorTier.PREMIUM.value,
        "premium_expires_at": {"$gt": now}
    })
    
    # Active boosts
    active_boosts = await db.product_boosts.count_documents({
        "is_active": True,
        "end_date": {"$gt": now}
    })
    
    return {
        "ads": {
            "active": active_ads,
            "pending": pending_ads,
            "revenue": ad_revenue[0]["total"] if ad_revenue else 0
        },
        "boosts": {
            "active": active_boosts,
            "revenue": boost_revenue[0]["total"] if boost_revenue else 0
        },
        "subscriptions": {
            "premium_vendors": premium_vendors,
            "revenue": subscription_revenue[0]["total"] if subscription_revenue else 0
        },
        "flash_sales": {
            "revenue": flash_sale_revenue[0]["total"] if flash_sale_revenue else 0
        },
        "total_monetization_revenue": (
            (ad_revenue[0]["total"] if ad_revenue else 0) +
            (boost_revenue[0]["total"] if boost_revenue else 0) +
            (subscription_revenue[0]["total"] if subscription_revenue else 0) +
            (flash_sale_revenue[0]["total"] if flash_sale_revenue else 0)
        )
    }



# ==================== COMPREHENSIVE REPORTING (PHASE 6) ====================

@router.get("/analytics/vendor/{vendor_id}", response_model=dict)
async def get_vendor_analytics(
    vendor_id: str,
    period: str = "6months",  # 6months, 12months, all
    user: dict = Depends(get_current_user)
):
    """Get comprehensive vendor analytics with monthly trends"""
    db = get_db()
    
    # Verify access - vendor owner or admin
    is_admin = user["role"] in ["superadmin", "admin", "bendahari"]
    user_vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    is_owner = user_vendor and str(user_vendor["_id"]) == vendor_id
    
    if not is_admin and not is_owner:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    vendor = await db.marketplace_vendors.find_one({"_id": ObjectId(vendor_id)})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor tidak dijumpai")
    
    now = datetime.now(timezone.utc)
    
    # Determine date range
    if period == "6months":
        start_date = now - timedelta(days=180)
    elif period == "12months":
        start_date = now - timedelta(days=365)
    else:
        start_date = datetime(2020, 1, 1, tzinfo=timezone.utc)
    
    # Monthly sales trend (aggregation)
    monthly_sales = await db.marketplace_orders.aggregate([
        {
            "$match": {
                "items.vendor_id": vendor_id,
                "status": {"$in": [OrderStatus.PAID.value, OrderStatus.DELIVERED.value]},
                "created_at": {"$gte": start_date}
            }
        },
        {
            "$group": {
                "_id": {
                    "year": {"$year": "$created_at"},
                    "month": {"$month": "$created_at"}
                },
                "total_sales": {"$sum": "$total_amount"},
                "order_count": {"$sum": 1}
            }
        },
        {"$sort": {"_id.year": 1, "_id.month": 1}}
    ]).to_list(24)
    
    # Format monthly data
    monthly_trend = []
    for m in monthly_sales:
        month_name = f"{m['_id']['year']}-{str(m['_id']['month']).zfill(2)}"
        monthly_trend.append({
            "month": month_name,
            "sales": m["total_sales"],
            "orders": m["order_count"]
        })
    
    # Top selling products
    top_products = await db.marketplace_products.find(
        {"vendor_id": vendor_id, "is_active": True}
    ).sort("sales_count", -1).limit(5).to_list(5)
    
    top_products_data = [{
        "id": str(p["_id"]),
        "name": p["name"],
        "sales_count": p.get("sales_count", 0),
        "revenue": p.get("sales_count", 0) * p["price"]
    } for p in top_products]
    
    # Category breakdown
    category_sales = await db.marketplace_orders.aggregate([
        {"$match": {"items.vendor_id": vendor_id, "status": {"$in": [OrderStatus.PAID.value, OrderStatus.DELIVERED.value]}}},
        {"$unwind": "$items"},
        {"$match": {"items.vendor_id": vendor_id}},
        {"$lookup": {
            "from": "marketplace_products",
            "localField": "items.product_id",
            "foreignField": "_id",
            "as": "product"
        }},
        {"$unwind": {"path": "$product", "preserveNullAndEmptyArrays": True}},
        {"$group": {
            "_id": "$product.category",
            "total": {"$sum": "$items.total_price"},
            "count": {"$sum": "$items.quantity"}
        }},
        {"$sort": {"total": -1}}
    ]).to_list(20)
    
    # Order status breakdown
    order_status_breakdown = await db.marketplace_orders.aggregate([
        {"$match": {"items.vendor_id": vendor_id}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]).to_list(10)
    
    # Wallet summary
    wallet = await db.vendor_wallets.find_one({"vendor_id": vendor_id})
    
    # Earnings trend
    earnings_trend = await db.financial_ledger.aggregate([
        {
            "$match": {
                "type": LedgerType.VENDOR_EARNING.value,
                "vendor_id": vendor_id,
                "created_at": {"$gte": start_date}
            }
        },
        {
            "$group": {
                "_id": {
                    "year": {"$year": "$created_at"},
                    "month": {"$month": "$created_at"}
                },
                "earnings": {"$sum": "$amount"}
            }
        },
        {"$sort": {"_id.year": 1, "_id.month": 1}}
    ]).to_list(24)
    
    earnings_monthly = [{
        "month": f"{e['_id']['year']}-{str(e['_id']['month']).zfill(2)}",
        "earnings": e["earnings"]
    } for e in earnings_trend]
    
    return {
        "vendor": {
            "id": str(vendor["_id"]),
            "business_name": vendor["business_name"],
            "tier": vendor.get("tier", "free"),
            "total_sales": vendor.get("total_sales", 0),
            "total_products": vendor.get("total_products", 0),
            "rating": vendor.get("rating", 0)
        },
        "monthly_trend": monthly_trend,
        "earnings_trend": earnings_monthly,
        "top_products": top_products_data,
        "category_breakdown": [{"category": c["_id"] or "Lain-lain", "total": c["total"], "count": c["count"]} for c in category_sales],
        "order_status": {s["_id"]: s["count"] for s in order_status_breakdown},
        "wallet": {
            "total_earnings": wallet.get("total_earnings", 0) if wallet else 0,
            "available_balance": wallet.get("available_balance", 0) if wallet else 0,
            "pending_amount": wallet.get("pending_amount", 0) if wallet else 0,
            "total_withdrawn": wallet.get("total_withdrawn", 0) if wallet else 0
        },
        "period": period
    }


@router.get("/analytics/sales-overview", response_model=dict)
async def get_sales_overview(
    period: str = "12months",
    user: dict = Depends(get_current_user)
):
    """Get comprehensive sales analytics for admin - with trends and breakdowns"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    now = datetime.now(timezone.utc)
    
    if period == "6months":
        start_date = now - timedelta(days=180)
    elif period == "12months":
        start_date = now - timedelta(days=365)
    else:
        start_date = datetime(2020, 1, 1, tzinfo=timezone.utc)
    
    # Monthly sales trend
    monthly_sales = await db.marketplace_orders.aggregate([
        {
            "$match": {
                "status": {"$in": [OrderStatus.PAID.value, OrderStatus.DELIVERED.value]},
                "created_at": {"$gte": start_date}
            }
        },
        {
            "$group": {
                "_id": {
                    "year": {"$year": "$created_at"},
                    "month": {"$month": "$created_at"}
                },
                "total_sales": {"$sum": "$total_amount"},
                "dana_kecemerlangan": {"$sum": "$dana_kecemerlangan_amount"},
                "koperasi": {"$sum": "$koperasi_amount"},
                "vendor_earnings": {"$sum": "$vendor_earnings"},
                "order_count": {"$sum": 1}
            }
        },
        {"$sort": {"_id.year": 1, "_id.month": 1}}
    ]).to_list(24)
    
    monthly_trend = [{
        "month": f"{m['_id']['year']}-{str(m['_id']['month']).zfill(2)}",
        "sales": m["total_sales"],
        "dana_kecemerlangan": m["dana_kecemerlangan"],
        "koperasi": m["koperasi"],
        "vendor_earnings": m["vendor_earnings"],
        "orders": m["order_count"]
    } for m in monthly_sales]
    
    # Daily sales for last 30 days
    thirty_days_ago = now - timedelta(days=30)
    daily_sales = await db.marketplace_orders.aggregate([
        {
            "$match": {
                "status": {"$in": [OrderStatus.PAID.value, OrderStatus.DELIVERED.value]},
                "created_at": {"$gte": thirty_days_ago}
            }
        },
        {
            "$group": {
                "_id": {
                    "year": {"$year": "$created_at"},
                    "month": {"$month": "$created_at"},
                    "day": {"$dayOfMonth": "$created_at"}
                },
                "total": {"$sum": "$total_amount"},
                "count": {"$sum": 1}
            }
        },
        {"$sort": {"_id.year": 1, "_id.month": 1, "_id.day": 1}}
    ]).to_list(31)
    
    daily_trend = [{
        "date": f"{d['_id']['year']}-{str(d['_id']['month']).zfill(2)}-{str(d['_id']['day']).zfill(2)}",
        "sales": d["total"],
        "orders": d["count"]
    } for d in daily_sales]
    
    # Top vendors by sales
    top_vendors = await db.marketplace_vendors.find(
        {"status": "approved"}
    ).sort("total_sales", -1).limit(10).to_list(10)
    
    top_vendors_data = [{
        "id": str(v["_id"]),
        "name": v["business_name"],
        "total_sales": v.get("total_sales", 0),
        "products": v.get("total_products", 0)
    } for v in top_vendors]
    
    # Category sales breakdown
    category_breakdown = await db.marketplace_orders.aggregate([
        {"$match": {"status": {"$in": [OrderStatus.PAID.value, OrderStatus.DELIVERED.value]}}},
        {"$unwind": "$items"},
        {"$lookup": {
            "from": "marketplace_products",
            "let": {"pid": {"$toObjectId": "$items.product_id"}},
            "pipeline": [{"$match": {"$expr": {"$eq": ["$_id", "$$pid"]}}}],
            "as": "product"
        }},
        {"$unwind": {"path": "$product", "preserveNullAndEmptyArrays": True}},
        {"$group": {
            "_id": "$product.category",
            "total_sales": {"$sum": "$items.total_price"},
            "quantity": {"$sum": "$items.quantity"}
        }},
        {"$sort": {"total_sales": -1}}
    ]).to_list(20)
    
    # Summary totals
    totals = await db.marketplace_orders.aggregate([
        {"$match": {"status": {"$in": [OrderStatus.PAID.value, OrderStatus.DELIVERED.value]}}},
        {"$group": {
            "_id": None,
            "total_sales": {"$sum": "$total_amount"},
            "total_orders": {"$sum": 1},
            "dana_kecemerlangan": {"$sum": "$dana_kecemerlangan_amount"},
            "koperasi": {"$sum": "$koperasi_amount"},
            "vendor_earnings": {"$sum": "$vendor_earnings"}
        }}
    ]).to_list(1)
    
    summary = totals[0] if totals else {
        "total_sales": 0, "total_orders": 0, 
        "dana_kecemerlangan": 0, "koperasi": 0, "vendor_earnings": 0
    }
    
    # Order status distribution
    status_dist = await db.marketplace_orders.aggregate([
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]).to_list(10)
    
    return {
        "summary": {
            "total_sales": summary.get("total_sales", 0),
            "total_orders": summary.get("total_orders", 0),
            "dana_kecemerlangan": summary.get("dana_kecemerlangan", 0),
            "koperasi": summary.get("koperasi", 0),
            "vendor_earnings": summary.get("vendor_earnings", 0)
        },
        "monthly_trend": monthly_trend,
        "daily_trend": daily_trend,
        "top_vendors": top_vendors_data,
        "category_breakdown": [
            {"category": c["_id"] or "Lain-lain", "sales": c["total_sales"], "quantity": c["quantity"]} 
            for c in category_breakdown
        ],
        "order_status_distribution": {s["_id"]: s["count"] for s in status_dist},
        "period": period
    }


@router.get("/analytics/export/sales", response_model=dict)
async def export_sales_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    format: str = "json",  # json or csv
    user: dict = Depends(get_current_user)
):
    """Export sales report data"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    query = {"status": {"$in": [OrderStatus.PAID.value, OrderStatus.DELIVERED.value]}}
    
    if start_date:
        query["created_at"] = {"$gte": datetime.fromisoformat(start_date.replace('Z', '+00:00'))}
    if end_date:
        if "created_at" in query:
            query["created_at"]["$lte"] = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        else:
            query["created_at"] = {"$lte": datetime.fromisoformat(end_date.replace('Z', '+00:00'))}
    
    orders = await db.marketplace_orders.find(query).sort("created_at", -1).to_list(1000)
    
    export_data = []
    for o in orders:
        export_data.append({
            "order_number": o["order_number"],
            "date": o["created_at"].strftime("%Y-%m-%d %H:%M") if o.get("created_at") else "",
            "buyer_name": o.get("buyer_name", ""),
            "student_name": o["student_snapshot"]["full_name"],
            "student_class": f"T{o['student_snapshot']['form']} {o['student_snapshot']['class_name']}",
            "total_amount": o["total_amount"],
            "dana_kecemerlangan": o["dana_kecemerlangan_amount"],
            "koperasi": o["koperasi_amount"],
            "vendor_earnings": o["vendor_earnings"],
            "status": o["status"],
            "items_count": len(o["items"])
        })
    
    if format == "csv":
        # Generate CSV string
        if not export_data:
            csv_content = "No data"
        else:
            headers = list(export_data[0].keys())
            csv_lines = [",".join(headers)]
            for row in export_data:
                csv_lines.append(",".join([str(row[h]).replace(",", ";") for h in headers]))
            csv_content = "\n".join(csv_lines)
        
        return {
            "format": "csv",
            "filename": f"sales_report_{datetime.now().strftime('%Y%m%d')}.csv",
            "content": csv_content,
            "record_count": len(export_data)
        }
    
    return {
        "format": "json",
        "data": export_data,
        "record_count": len(export_data)
    }


@router.get("/analytics/export/ledger", response_model=dict)
async def export_ledger_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    ledger_type: Optional[str] = None,
    format: str = "json",
    user: dict = Depends(get_current_user)
):
    """Export financial ledger data"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    query = {}
    
    if ledger_type:
        query["type"] = ledger_type
    
    if start_date:
        query["created_at"] = {"$gte": datetime.fromisoformat(start_date.replace('Z', '+00:00'))}
    if end_date:
        if "created_at" in query:
            query["created_at"]["$lte"] = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        else:
            query["created_at"] = {"$lte": datetime.fromisoformat(end_date.replace('Z', '+00:00'))}
    
    ledger_entries = await db.financial_ledger.find(query).sort("created_at", -1).to_list(2000)
    
    export_data = []
    for entry in ledger_entries:
        export_data.append({
            "reference_number": entry.get("reference_number", ""),
            "date": entry["created_at"].strftime("%Y-%m-%d %H:%M") if entry.get("created_at") else "",
            "type": entry["type"],
            "amount": entry["amount"],
            "vendor_name": entry.get("vendor_name", ""),
            "order_number": entry.get("order_number", ""),
            "description": entry.get("description", "")
        })
    
    if format == "csv":
        if not export_data:
            csv_content = "No data"
        else:
            headers = list(export_data[0].keys())
            csv_lines = [",".join(headers)]
            for row in export_data:
                csv_lines.append(",".join([str(row[h]).replace(",", ";").replace("\n", " ") for h in headers]))
            csv_content = "\n".join(csv_lines)
        
        return {
            "format": "csv",
            "filename": f"ledger_report_{datetime.now().strftime('%Y%m%d')}.csv",
            "content": csv_content,
            "record_count": len(export_data)
        }
    
    return {
        "format": "json",
        "data": export_data,
        "record_count": len(export_data)
    }


@router.get("/analytics/my-analytics", response_model=dict)
async def get_my_vendor_analytics(
    period: str = "6months",
    user: dict = Depends(get_current_user)
):
    """Get current vendor's own analytics"""
    db = get_db()
    
    vendor = await db.marketplace_vendors.find_one({"user_id": str(user["_id"])})
    if not vendor:
        raise HTTPException(status_code=403, detail="Anda bukan vendor")
    
    # Reuse the vendor analytics endpoint
    return await get_vendor_analytics(str(vendor["_id"]), period, user)
