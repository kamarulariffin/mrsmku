"""
Koperasi Module - Pydantic Models
For school cooperative shop with kit-based product sales
E-commerce style size selection for clothing and shoes
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


# ============ SIZE CATEGORIES ============

class ClothingSize(str, Enum):
    """Standard clothing sizes"""
    XS = "XS"
    S = "S"
    M = "M"
    L = "L"
    XL = "XL"
    XXL = "XXL"
    XXXL = "3XL"


class ShoeSize(str, Enum):
    """Malaysian/EU shoe sizes"""
    SIZE_35 = "35"
    SIZE_36 = "36"
    SIZE_37 = "37"
    SIZE_38 = "38"
    SIZE_39 = "39"
    SIZE_40 = "40"
    SIZE_41 = "41"
    SIZE_42 = "42"
    SIZE_43 = "43"
    SIZE_44 = "44"
    SIZE_45 = "45"


class SizeType(str, Enum):
    """Type of size for product"""
    CLOTHING = "clothing"  # XS, S, M, L, XL, etc
    SHOES = "shoes"        # 35, 36, 37, etc
    NONE = "none"          # No size needed


# Keep for backward compatibility
class ProductSize(str, Enum):
    XS = "XS"
    S = "S"
    M = "M"
    L = "L"
    XL = "XL"
    XXL = "XXL"
    NA = "N/A"  # For items without size


class SizeStock(BaseModel):
    """Stock per size - supports both clothing and shoe sizes"""
    size: str  # Changed to str to support both clothing and shoe sizes
    stock: int = 0


class KoopKitCreate(BaseModel):
    """Create a new kit/package"""
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    image_url: Optional[str] = None
    is_active: bool = True


class KoopKitUpdate(BaseModel):
    """Update kit/package"""
    name: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    is_active: Optional[bool] = None


class KoopKitResponse(BaseModel):
    """Kit response with computed fields"""
    id: str
    name: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    is_active: bool = True
    product_count: int = 0
    total_price: float = 0.0
    created_at: datetime
    created_by: str


class KoopProductCreate(BaseModel):
    """Create a new product under a kit"""
    kit_id: str
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    price: float = Field(..., gt=0)
    image_url: Optional[str] = None
    category: Optional[str] = None  # 'merchandise' for Barangan Rasmi, or other categories
    has_sizes: bool = False  # True for clothing/shoe items
    size_type: SizeType = SizeType.NONE  # Type of size (clothing, shoes, none)
    sizes_stock: Optional[List[SizeStock]] = None  # Stock per size
    total_stock: int = 0  # For items without sizes
    is_active: bool = True


class KoopProductUpdate(BaseModel):
    """Update product"""
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    image_url: Optional[str] = None
    category: Optional[str] = None  # 'merchandise' for Barangan Rasmi
    has_sizes: Optional[bool] = None
    size_type: Optional[SizeType] = None
    sizes_stock: Optional[List[SizeStock]] = None
    total_stock: Optional[int] = None
    is_active: Optional[bool] = None


class KoopProductResponse(BaseModel):
    """Product response"""
    id: str
    kit_id: str
    kit_name: Optional[str] = None
    name: str
    description: Optional[str] = None
    price: float
    image_url: Optional[str] = None
    category: Optional[str] = None
    has_sizes: bool = False
    size_type: str = "none"  # clothing, shoes, or none
    sizes_stock: Optional[List[dict]] = None
    total_stock: int = 0
    is_active: bool = True
    created_at: datetime


class CartItem(BaseModel):
    """Item in shopping cart"""
    product_id: str
    product_name: str
    kit_name: str
    quantity: int = 1
    size: Optional[str] = None  # Changed to str for flexibility
    price: float
    image_url: Optional[str] = None


class AddToCartRequest(BaseModel):
    """Add item to cart"""
    product_id: str
    quantity: int = Field(1, gt=0)
    size: Optional[str] = None  # Changed to str for flexibility
    student_id: str  # Which child this is for


class AddKitToCartRequest(BaseModel):
    """Add entire kit to cart with size selections"""
    kit_id: str
    student_id: str
    size_selections: List[dict] = []  # [{product_id: str, size: str}, ...]


class CartResponse(BaseModel):
    """Shopping cart response"""
    id: str
    user_id: str
    student_id: str
    student_name: Optional[str] = None
    items: List[CartItem] = []
    total_amount: float = 0.0
    item_count: int = 0
    updated_at: datetime


class OrderStatus(str, Enum):
    PENDING = "pending"
    PAID = "paid"
    PROCESSING = "processing"
    READY = "ready"
    COLLECTED = "collected"
    CANCELLED = "cancelled"


class KoopOrderCreate(BaseModel):
    """Create order from cart"""
    student_id: str
    payment_method: str = "fpx"  # Mock payment


class KoopOrderResponse(BaseModel):
    """Order response"""
    id: str
    order_number: str
    user_id: str
    student_id: str
    student_name: Optional[str] = None
    items: List[CartItem]
    total_amount: float
    status: OrderStatus
    payment_method: str
    created_at: datetime
    updated_at: datetime
