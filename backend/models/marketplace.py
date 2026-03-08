"""
Multi-Vendor Marketplace Module - Pydantic Models
For parents as vendors selling products to students with commission split
Extended with: Product Variants, Bundles, Category Access Rules, Monetization Add-ons
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# ============ ENUMS ============

class VendorStatus(str, Enum):
    """Vendor application status"""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUSPENDED = "suspended"


class VendorTier(str, Enum):
    """Vendor subscription tier"""
    FREE = "free"
    PREMIUM = "premium"


class ProductApprovalStatus(str, Enum):
    """Product approval status"""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ProductType(str, Enum):
    """Product type"""
    SIMPLE = "simple"
    VARIABLE = "variable"  # Has variants


class OrderStatus(str, Enum):
    """Order status pipeline"""
    PENDING_PAYMENT = "pending_payment"
    PAID = "paid"
    PREPARING = "preparing"
    OUT_FOR_DELIVERY = "out_for_delivery"
    ARRIVED_HOSTEL = "arrived_hostel"
    DELIVERED = "delivered"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AdPackageType(str, Enum):
    """Advertisement package types"""
    BRONZE = "bronze"
    SILVER = "silver"
    GOLD = "gold"


class AdStatus(str, Enum):
    """Advertisement status"""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    ACTIVE = "active"
    EXPIRED = "expired"


class LedgerType(str, Enum):
    """Financial ledger entry type"""
    DANA_KECEMERLANGAN = "dana_kecemerlangan"
    KOPERASI = "koperasi"
    VENDOR_EARNING = "vendor_earning"
    VENDOR_PAYOUT = "vendor_payout"
    AD_REVENUE = "ad_revenue"
    VENDOR_REGISTRATION = "vendor_registration"
    FEATURED_PRODUCT = "featured_product"
    BOOST_LISTING = "boost_listing"
    PREMIUM_SUBSCRIPTION = "premium_subscription"
    FLASH_SALE_SLOT = "flash_sale_slot"


class LedgerEntryType(str, Enum):
    """Ledger entry debit/credit type"""
    DEBIT = "debit"
    CREDIT = "credit"


class PayoutStatus(str, Enum):
    """Vendor payout status"""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    COMPLETED = "completed"


class BoostType(str, Enum):
    """Product boost types"""
    FEATURED = "featured"
    BOOST = "boost"
    FLASH_SALE = "flash_sale"


# ============ PRODUCT VARIANT MODELS ============

class ProductVariant(BaseModel):
    """Single product variant with SKU"""
    sku: str = Field(..., min_length=1, max_length=50)
    size: Optional[str] = None
    color: Optional[str] = None
    stock: int = Field(..., ge=0)
    price_override: Optional[float] = None  # If None, use base price
    is_active: bool = True


class ProductVariantCreate(BaseModel):
    """Create product variant"""
    sku: str = Field(..., min_length=1, max_length=50)
    size: Optional[str] = None
    color: Optional[str] = None
    stock: int = Field(..., ge=0)
    price_override: Optional[float] = Field(None, ge=0)


class ProductVariantUpdate(BaseModel):
    """Update product variant"""
    sku: Optional[str] = None
    size: Optional[str] = None
    color: Optional[str] = None
    stock: Optional[int] = Field(None, ge=0)
    price_override: Optional[float] = Field(None, ge=0)
    is_active: Optional[bool] = None


class VariantSnapshot(BaseModel):
    """Immutable variant info at order time"""
    sku: str
    size: Optional[str] = None
    color: Optional[str] = None
    price: float


# ============ BUNDLE MODELS ============

class BundleItem(BaseModel):
    """Single item in a bundle"""
    product_id: str
    quantity: int = Field(..., gt=0)
    variant_sku: Optional[str] = None  # If product has variants


class BundleItemResponse(BaseModel):
    """Bundle item with product details"""
    product_id: str
    product_name: str
    quantity: int
    variant_sku: Optional[str] = None
    variant_details: Optional[Dict[str, Any]] = None
    unit_price: float
    subtotal: float


class BundleCreate(BaseModel):
    """Create bundle"""
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    price: float = Field(..., gt=0)
    items: List[BundleItem]
    images: List[str] = []
    category: str = "bundle"


class BundleUpdate(BaseModel):
    """Update bundle"""
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = Field(None, gt=0)
    items: Optional[List[BundleItem]] = None
    images: Optional[List[str]] = None
    is_active: Optional[bool] = None


class BundleResponse(BaseModel):
    """Bundle response"""
    id: str
    vendor_id: str
    vendor_name: str
    name: str
    description: Optional[str] = None
    price: float
    original_price: float  # Sum of individual items
    savings: float
    items: List[BundleItemResponse]
    images: List[str] = []
    category: str
    approval_status: ProductApprovalStatus
    rejection_reason: Optional[str] = None
    is_active: bool = True
    sales_count: int = 0
    created_at: datetime
    approved_at: Optional[datetime] = None


# ============ CATEGORY ACCESS RULES ============

class CategoryAccessRule(BaseModel):
    """Category access control"""
    category: str
    allowed_roles: List[str] = ["parent"]  # Roles that can purchase
    requires_student: bool = True  # Must select student for delivery
    is_food: bool = False  # Food category - special rules


class CategoryAccessRuleCreate(BaseModel):
    """Create category access rule"""
    category: str
    allowed_roles: List[str] = ["parent"]
    requires_student: bool = True
    is_food: bool = False


# ============ MONETIZATION MODELS ============

class ProductBoostCreate(BaseModel):
    """Create product boost/feature"""
    product_id: str
    boost_type: BoostType
    duration_days: int = Field(..., ge=1, le=365)


class ProductBoostResponse(BaseModel):
    """Product boost response"""
    id: str
    product_id: str
    product_name: str
    vendor_id: str
    boost_type: BoostType
    price_paid: float
    start_date: datetime
    end_date: datetime
    is_active: bool
    impressions: int = 0
    clicks: int = 0
    created_at: datetime


class FlashSaleSlot(BaseModel):
    """Flash sale slot"""
    id: str
    name: str
    start_time: datetime
    end_time: datetime
    max_products: int
    price_per_slot: float
    current_products: int = 0
    is_active: bool = True


class FlashSaleRegistration(BaseModel):
    """Register product for flash sale"""
    product_id: str
    flash_sale_id: str
    discount_percent: float = Field(..., ge=1, le=90)


# ============ VENDOR WALLET & PAYOUT MODELS ============

class VendorWallet(BaseModel):
    """Vendor wallet balance"""
    vendor_id: str
    total_earnings: float = 0.0
    pending_amount: float = 0.0  # Earnings not yet cleared
    available_balance: float = 0.0  # Can withdraw
    total_withdrawn: float = 0.0
    last_updated: datetime


class PayoutRequest(BaseModel):
    """Vendor payout/withdrawal request"""
    amount: float = Field(..., gt=0)
    bank_name: str
    bank_account_number: str
    bank_account_name: str
    notes: Optional[str] = None


class PayoutResponse(BaseModel):
    """Payout request response"""
    id: str
    vendor_id: str
    vendor_name: str
    amount: float
    bank_name: str
    bank_account_number: str
    bank_account_name: str
    status: PayoutStatus
    rejection_reason: Optional[str] = None
    reference_number: Optional[str] = None
    requested_at: datetime
    processed_at: Optional[datetime] = None
    processed_by: Optional[str] = None


class PayoutApproval(BaseModel):
    """Admin payout approval"""
    status: PayoutStatus
    rejection_reason: Optional[str] = None
    reference_number: Optional[str] = None


# ============ COMMISSION SNAPSHOT ============

class CommissionSnapshot(BaseModel):
    """Immutable commission rates at order time"""
    dana_kecemerlangan_percent: float
    koperasi_percent: float
    vendor_percent: float
    dana_kecemerlangan_amount: float
    koperasi_amount: float
    vendor_amount: float


# ============ VENDOR MODELS ============

class VendorCreate(BaseModel):
    """Create vendor application - by parent"""
    business_name: str = Field(..., min_length=3, max_length=200)
    business_description: Optional[str] = None
    business_category: Optional[str] = None
    contact_phone: str
    bank_name: str
    bank_account_number: str
    bank_account_name: str


class VendorUpdate(BaseModel):
    """Update vendor info"""
    business_name: Optional[str] = None
    business_description: Optional[str] = None
    business_category: Optional[str] = None
    logo_url: Optional[str] = None
    contact_phone: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_account_name: Optional[str] = None


class VendorResponse(BaseModel):
    """Vendor response"""
    id: str
    user_id: str
    parent_name: str
    business_name: str
    business_description: Optional[str] = None
    business_category: Optional[str] = None
    logo_url: Optional[str] = None
    contact_phone: str
    bank_name: str
    bank_account_number: str
    bank_account_name: str
    status: VendorStatus
    tier: VendorTier = VendorTier.FREE
    rejection_reason: Optional[str] = None
    total_sales: float = 0.0
    total_products: int = 0
    rating: float = 0.0
    rating_count: int = 0
    registration_fee_paid: bool = False
    # Wallet info
    wallet_balance: float = 0.0
    pending_earnings: float = 0.0
    total_withdrawn: float = 0.0
    # Premium subscription
    premium_expires_at: Optional[datetime] = None
    created_at: datetime
    approved_at: Optional[datetime] = None


class VendorApprovalRequest(BaseModel):
    """Admin approval/rejection request"""
    status: VendorStatus
    rejection_reason: Optional[str] = None


# ============ PRODUCT MODELS ============

class VendorProductCreate(BaseModel):
    """Create product by vendor"""
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    category: str
    price: float = Field(..., gt=0)
    stock: int = Field(0, ge=0)  # Total stock for simple products, 0 for variable
    images: List[str] = []
    product_type: ProductType = ProductType.SIMPLE
    variants: Optional[List[ProductVariantCreate]] = None  # For variable products


class VendorProductUpdate(BaseModel):
    """Update product"""
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    stock: Optional[int] = None
    images: Optional[List[str]] = None
    product_type: Optional[ProductType] = None
    variants: Optional[List[ProductVariantCreate]] = None
    is_active: Optional[bool] = None


class VendorProductResponse(BaseModel):
    """Product response"""
    id: str
    vendor_id: str
    vendor_name: str
    name: str
    description: Optional[str] = None
    category: str
    category_name: Optional[str] = None
    price: float
    stock: int  # Total stock (sum of variants if variable)
    images: List[str] = []
    product_type: ProductType = ProductType.SIMPLE
    variants: Optional[List[Dict[str, Any]]] = None
    approval_status: ProductApprovalStatus
    rejection_reason: Optional[str] = None
    is_active: bool = True
    is_featured: bool = False
    is_boosted: bool = False
    boost_expires_at: Optional[datetime] = None
    sales_count: int = 0
    rating: float = 0.0
    rating_count: int = 0
    created_at: datetime
    approved_at: Optional[datetime] = None


class ProductApprovalRequest(BaseModel):
    """Admin product approval request"""
    status: ProductApprovalStatus
    rejection_reason: Optional[str] = None


# ============ ORDER MODELS ============

class OrderItemCreate(BaseModel):
    """Single order item"""
    product_id: str
    quantity: int = Field(..., gt=0)
    variant_sku: Optional[str] = None  # SKU for variable products
    is_bundle: bool = False


class BundleOrderItem(BaseModel):
    """Bundle order item"""
    bundle_id: str
    quantity: int = Field(..., gt=0)


class MarketplaceOrderCreate(BaseModel):
    """Create marketplace order"""
    student_id: str  # Must be registered active student
    items: List[OrderItemCreate] = []
    bundles: List[BundleOrderItem] = []
    delivery_notes: Optional[str] = None


class StudentSnapshot(BaseModel):
    """Immutable student info at order time"""
    student_id: str
    full_name: str
    matric_number: str
    form: int
    class_name: str
    block_name: str
    room_number: str
    guardian_phone: Optional[str] = None


class OrderItemResponse(BaseModel):
    """Order item response"""
    product_id: str
    product_name: str
    vendor_id: str
    vendor_name: str
    quantity: int
    unit_price: float
    total_price: float
    variant_snapshot: Optional[VariantSnapshot] = None
    is_bundle: bool = False
    bundle_id: Optional[str] = None
    bundle_name: Optional[str] = None


class MarketplaceOrderResponse(BaseModel):
    """Order response"""
    id: str
    order_number: str
    buyer_id: str  # Parent user ID
    buyer_name: str
    student_snapshot: StudentSnapshot
    items: List[OrderItemResponse]
    subtotal: float
    commission_snapshot: CommissionSnapshot
    total_amount: float
    status: OrderStatus
    status_history: List[Dict[str, Any]] = []
    delivery_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class OrderStatusUpdate(BaseModel):
    """Update order status"""
    status: OrderStatus
    notes: Optional[str] = None


# ============ ADVERTISEMENT MODELS ============

class AdPackageResponse(BaseModel):
    """Ad package response"""
    id: str
    type: AdPackageType
    name: str
    description: str
    duration_months: int
    price: float
    features: List[str] = []
    is_active: bool = True


class AdCreate(BaseModel):
    """Create advertisement"""
    package_type: AdPackageType
    title: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    image_url: str
    link_url: Optional[str] = None


class AdUpdate(BaseModel):
    """Update advertisement"""
    title: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    link_url: Optional[str] = None


class AdResponse(BaseModel):
    """Advertisement response"""
    id: str
    vendor_id: str
    vendor_name: str
    package_type: AdPackageType
    package_name: str
    title: str
    description: Optional[str] = None
    image_url: str
    link_url: Optional[str] = None
    status: AdStatus
    rejection_reason: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    impressions: int = 0
    clicks: int = 0
    created_at: datetime


class AdApprovalRequest(BaseModel):
    """Admin ad approval request"""
    status: AdStatus
    rejection_reason: Optional[str] = None


# ============ FINANCIAL MODELS ============

class LedgerEntryResponse(BaseModel):
    """Financial ledger entry"""
    id: str
    type: LedgerType
    amount: float
    order_id: Optional[str] = None
    vendor_id: Optional[str] = None
    description: str
    reference_number: str
    created_at: datetime


class CommissionSettingsResponse(BaseModel):
    """Commission settings"""
    dana_kecemerlangan_percent: float
    koperasi_percent: float
    vendor_percent: float
    vendor_registration_fee: float
    updated_at: datetime
    updated_by: Optional[str] = None


class CommissionSettingsUpdate(BaseModel):
    """Update commission settings"""
    dana_kecemerlangan_percent: Optional[float] = Field(None, ge=0, le=100)
    koperasi_percent: Optional[float] = Field(None, ge=0, le=100)
    vendor_percent: Optional[float] = Field(None, ge=0, le=100)
    vendor_registration_fee: Optional[float] = Field(None, ge=0)


class AdPackageSettingsUpdate(BaseModel):
    """Update ad package settings"""
    bronze_price: Optional[float] = Field(None, ge=0)
    silver_price: Optional[float] = Field(None, ge=0)
    gold_price: Optional[float] = Field(None, ge=0)


# ============ REPORTING MODELS ============

class VendorSalesReport(BaseModel):
    """Vendor sales performance report"""
    vendor_id: str
    vendor_name: str
    total_sales: float
    total_orders: int
    commission_paid: float
    net_earnings: float
    period_start: datetime
    period_end: datetime


class DanaKecemerllanganReport(BaseModel):
    """Dana Kecemerlangan collection report"""
    total_collected: float
    total_entries: int
    by_month: List[Dict[str, Any]] = []
    by_vendor: List[Dict[str, Any]] = []
    period_start: datetime
    period_end: datetime


class KoperasiRevenueReport(BaseModel):
    """Koperasi revenue report"""
    total_revenue: float
    total_entries: int
    by_month: List[Dict[str, Any]] = []
    period_start: datetime
    period_end: datetime
