"""
Universal Inventory Management System - Models
Central inventory that syncs between Koperasi, PUM, and Merchandise modules
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class InventorySource(str, Enum):
    """Source module of inventory item"""
    KOPERASI = "koperasi"
    PUM = "pum"
    MERCHANDISE = "merchandise"
    CENTRAL = "central"  # Centrally managed


class InventorySyncMode(str, Enum):
    """How inventory syncs between modules"""
    AUTO = "auto"  # Auto-sync on change
    MANUAL = "manual"  # Manual sync only
    ONE_WAY = "one_way"  # Source -> Linked only
    DISABLED = "disabled"  # No sync


class SharedCategory(str, Enum):
    """Shared product categories across modules"""
    BAJU = "baju"
    AKSESORI = "aksesori"
    CENDERAMATA = "cenderamata"
    ALAT_TULIS = "alat_tulis"
    SUKAN = "sukan"
    MAKANAN = "makanan"
    PAKAIAN = "pakaian"
    KRAFTANGAN = "kraftangan"
    LAIN_LAIN = "lain_lain"


SHARED_CATEGORY_DISPLAY = {
    "baju": "Baju",
    "aksesori": "Aksesori",
    "cenderamata": "Cenderamata",
    "alat_tulis": "Alat Tulis",
    "sukan": "Sukan",
    "makanan": "Makanan",
    "pakaian": "Pakaian",
    "kraftangan": "Kraftangan",
    "lain_lain": "Lain-lain"
}


class VendorType(str, Enum):
    """Type of vendor"""
    INTERNAL = "internal"  # School cooperative
    PUM = "pum"  # Student entrepreneurs
    EXTERNAL = "external"  # External vendors
    MUAFAKAT = "muafakat"  # Muafakat MRSM Kuantan


class InventoryItemCreate(BaseModel):
    """Create a central inventory item"""
    name: str = Field(..., min_length=1, max_length=200)
    sku: Optional[str] = None
    description: Optional[str] = None
    category: SharedCategory
    base_price: float = Field(..., gt=0)  # Cost price
    selling_price: Optional[float] = None  # Selling price (retail)
    stock: int = Field(0, ge=0)
    low_stock_threshold: int = Field(10, ge=0)
    vendor_type: VendorType = VendorType.INTERNAL
    vendor_id: Optional[str] = None  # Reference to vendor if external
    image_url: Optional[str] = None
    is_active: bool = True
    # Sync settings
    sync_mode: InventorySyncMode = InventorySyncMode.AUTO
    source_module: InventorySource = InventorySource.CENTRAL


class InventoryItemUpdate(BaseModel):
    """Update central inventory item"""
    name: Optional[str] = None
    sku: Optional[str] = None
    description: Optional[str] = None
    category: Optional[SharedCategory] = None
    base_price: Optional[float] = None
    selling_price: Optional[float] = None
    stock: Optional[int] = None
    low_stock_threshold: Optional[int] = None
    vendor_type: Optional[VendorType] = None
    vendor_id: Optional[str] = None
    image_url: Optional[str] = None
    is_active: Optional[bool] = None
    sync_mode: Optional[InventorySyncMode] = None


class InventoryItemResponse(BaseModel):
    """Central inventory item response"""
    id: str
    name: str
    sku: Optional[str] = None
    description: Optional[str] = None
    category: str
    category_display: str
    base_price: float
    selling_price: Optional[float] = None
    profit_margin: Optional[float] = None
    stock: int
    low_stock_threshold: int
    is_low_stock: bool = False
    is_out_of_stock: bool = False
    vendor_type: str
    vendor_id: Optional[str] = None
    vendor_name: Optional[str] = None
    image_url: Optional[str] = None
    is_active: bool
    sync_mode: str
    source_module: str
    # Linked products in other modules
    linked_products: List[dict] = []
    created_at: datetime
    updated_at: datetime


class InventoryLink(BaseModel):
    """Link between central inventory and module product"""
    inventory_item_id: str
    module: InventorySource
    product_id: str
    sync_enabled: bool = True
    price_multiplier: float = 1.0  # Allow different pricing per module


class InventoryLinkCreate(BaseModel):
    """Create link between inventory and module product"""
    inventory_item_id: str
    module: InventorySource
    product_id: str
    sync_enabled: bool = True
    price_multiplier: float = 1.0


class InventoryMovementLog(BaseModel):
    """Log of inventory changes for audit"""
    inventory_item_id: str
    movement_type: str  # "in", "out", "adjustment", "sync"
    quantity: int
    previous_stock: int
    new_stock: int
    source_module: InventorySource
    reference_type: Optional[str] = None  # "order", "adjustment", "sync"
    reference_id: Optional[str] = None
    reason: str
    notes: Optional[str] = None
    created_by: Optional[str] = None


class SyncRequest(BaseModel):
    """Request to sync inventory between modules"""
    inventory_item_id: str
    target_modules: List[InventorySource]
    sync_type: str = "stock"  # "stock", "price", "all"


class VendorCreate(BaseModel):
    """Create a vendor"""
    name: str = Field(..., min_length=1, max_length=200)
    vendor_type: VendorType
    description: Optional[str] = None
    contact_person: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    address: Optional[str] = None
    commission_rate: float = Field(0, ge=0, le=100)  # Commission % for vendor
    is_active: bool = True


class VendorUpdate(BaseModel):
    """Update vendor"""
    name: Optional[str] = None
    description: Optional[str] = None
    contact_person: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    address: Optional[str] = None
    commission_rate: Optional[float] = None
    is_active: Optional[bool] = None


class VendorResponse(BaseModel):
    """Vendor response"""
    id: str
    name: str
    vendor_type: str
    description: Optional[str] = None
    contact_person: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    address: Optional[str] = None
    commission_rate: float
    is_active: bool
    product_count: int = 0
    created_at: datetime
    updated_at: datetime


class InventoryStatsResponse(BaseModel):
    """Inventory statistics"""
    total_items: int
    active_items: int
    low_stock_items: int
    out_of_stock_items: int
    total_value: float
    by_category: List[dict]
    by_vendor: List[dict]
    by_module: List[dict]
