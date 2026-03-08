"""
Category Management Module - Models
For managing shared and exclusive categories across modules
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class CategoryScope(str, Enum):
    """Scope of category usage"""
    SHARED = "shared"  # Can be used by all modules
    KOPERASI_ONLY = "koperasi_only"  # Exclusive to Koperasi
    MERCHANDISE_ONLY = "merchandise_only"  # Exclusive to Merchandise
    PUM_ONLY = "pum_only"  # Exclusive to PUM


class CategoryType(str, Enum):
    """Type of category"""
    PRODUCT = "product"  # Product category
    SERVICE = "service"  # Service category


CATEGORY_SCOPE_DISPLAY = {
    "shared": "Dikongsi (Semua Modul)",
    "koperasi_only": "Koperasi Sahaja",
    "merchandise_only": "Merchandise Sahaja",
    "pum_only": "PUM Sahaja"
}


class CategoryCreate(BaseModel):
    """Create a new category"""
    name: str = Field(..., min_length=1, max_length=100)
    code: str = Field(..., min_length=1, max_length=50)  # e.g., "baju", "makanan"
    description: Optional[str] = None
    scope: CategoryScope = CategoryScope.SHARED
    parent_id: Optional[str] = None  # For hierarchical categories
    icon: Optional[str] = None  # Icon name from lucide-react
    color: Optional[str] = None  # Tailwind color class
    sort_order: int = 0
    is_active: bool = True
    commission_eligible: bool = False  # Whether PUM commission applies


class CategoryUpdate(BaseModel):
    """Update category"""
    name: Optional[str] = None
    description: Optional[str] = None
    scope: Optional[CategoryScope] = None
    parent_id: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    commission_eligible: Optional[bool] = None


class CategoryResponse(BaseModel):
    """Category response"""
    id: str
    name: str
    code: str
    description: Optional[str] = None
    scope: str
    scope_display: str
    parent_id: Optional[str] = None
    parent_name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    sort_order: int
    is_active: bool
    # Usage counts
    koperasi_count: int = 0
    merchandise_count: int = 0
    pum_count: int = 0
    total_count: int = 0
    # Children for hierarchical
    children: List[dict] = []
    created_at: datetime
    updated_at: datetime


class CategoryTreeNode(BaseModel):
    """Category tree node for hierarchical display"""
    id: str
    name: str
    code: str
    scope: str
    children: List["CategoryTreeNode"] = []
    product_count: int = 0


# Default categories to seed
DEFAULT_CATEGORIES = [
    # Shared categories
    {"name": "Baju", "code": "baju", "scope": "shared", "icon": "Shirt", "color": "blue"},
    {"name": "Aksesori", "code": "aksesori", "scope": "shared", "icon": "Watch", "color": "purple"},
    {"name": "Alat Tulis", "code": "alat_tulis", "scope": "shared", "icon": "Pencil", "color": "amber"},
    {"name": "Sukan", "code": "sukan", "scope": "shared", "icon": "Trophy", "color": "green"},
    
    # Koperasi exclusive
    {"name": "Makanan & Minuman", "code": "makanan", "scope": "koperasi_only", "icon": "UtensilsCrossed", "color": "orange"},
    {"name": "Keperluan Harian", "code": "keperluan", "scope": "koperasi_only", "icon": "Package", "color": "slate"},
    
    # Merchandise exclusive
    {"name": "Cenderamata", "code": "cenderamata", "scope": "merchandise_only", "icon": "Gift", "color": "pink"},
    {"name": "Edisi Terhad", "code": "edisi_terhad", "scope": "merchandise_only", "icon": "Star", "color": "yellow"},
    
    # PUM exclusive
    {"name": "Kraftangan", "code": "kraftangan", "scope": "pum_only", "icon": "Palette", "color": "teal"},
    {"name": "Produk Usahawan", "code": "usahawan", "scope": "pum_only", "icon": "Briefcase", "color": "indigo"},
]
