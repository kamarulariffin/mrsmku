"""
Category Management Module - API Routes
For managing shared and exclusive categories across modules
Synchronized with Koperasi, Inventory, and other modules
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Any, List, Optional
from datetime import datetime, timezone
from bson import ObjectId
from services.id_normalizer import object_id_or_none

from models.category import (
    CategoryCreate, CategoryUpdate, CategoryResponse,
    CategoryScope, DEFAULT_CATEGORIES, CATEGORY_SCOPE_DISPLAY
)

router = APIRouter(prefix="/api/categories", tags=["Categories"])
security = HTTPBearer(auto_error=False)

# Default Koperasi categories to seed
KOPERASI_DEFAULT_CATEGORIES = [
    {"name": "Barangan Rasmi (Merchandise)", "code": "merchandise", "scope": "shared", "icon": "Star", "color": "purple", "description": "Barangan rasmi maktab - dikenakan komisyen PUM", "commission_eligible": True},
    {"name": "Pakaian Seragam", "code": "uniform", "scope": "koperasi_only", "icon": "Shirt", "color": "blue", "description": "Pakaian seragam pelajar"},
    {"name": "Buku & Alat Tulis", "code": "books", "scope": "koperasi_only", "icon": "BookOpen", "color": "amber", "description": "Buku teks dan alat tulis"},
    {"name": "Peralatan Sukan", "code": "sports", "scope": "shared", "icon": "Trophy", "color": "green", "description": "Peralatan sukan"},
    {"name": "Aksesori", "code": "accessories", "scope": "shared", "icon": "Watch", "color": "pink", "description": "Aksesori pelajar"},
    {"name": "Makanan & Minuman", "code": "food", "scope": "koperasi_only", "icon": "UtensilsCrossed", "color": "orange", "description": "Makanan dan minuman"},
    {"name": "Lain-lain", "code": "others", "scope": "shared", "icon": "Package", "color": "slate", "description": "Barangan lain"},
]

_get_db_func = None
_get_current_user_func = None
_log_audit_func = None


def init_router(get_db_func, current_user_dep, permission_dep, audit_func):
    global _get_db_func, _get_current_user_func, _log_audit_func
    _get_db_func = get_db_func
    _get_current_user_func = current_user_dep
    _log_audit_func = audit_func


def get_db():
    return _get_db_func()


async def get_current_user_optional(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current user from token (optional - for public access)"""
    if not credentials:
        return None
    try:
        return await _get_current_user_func(credentials)
    except Exception:
        return None


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Token diperlukan")
    return await _get_current_user_func(credentials)


async def log_audit(user, action, module, details):
    if _log_audit_func and user:
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


# ==================== PUBLIC ENDPOINTS ====================

@router.get("/public", response_model=List[dict])
async def get_public_categories(
    scope: Optional[str] = None,
    module: Optional[str] = None  # "koperasi", "merchandise", "pum"
):
    """Get categories for public view - filter by module"""
    db = get_db()
    
    query = {"is_active": True}
    
    # Filter by scope based on module
    if module:
        if module == "koperasi":
            query["scope"] = {"$in": ["shared", "koperasi_only"]}
        elif module == "merchandise":
            query["scope"] = {"$in": ["shared", "merchandise_only"]}
        elif module == "pum":
            query["scope"] = {"$in": ["shared", "pum_only"]}
    elif scope:
        query["scope"] = scope
    
    categories = await db.product_categories.find(query).sort("sort_order", 1).to_list(100)
    
    result = []
    for cat in categories:
        result.append({
            "id": str(cat["_id"]),
            "name": cat["name"],
            "code": cat["code"],
            "scope": cat["scope"],
            "icon": cat.get("icon"),
            "color": cat.get("color")
        })
    
    return result


# ==================== ADMIN ENDPOINTS ====================

@router.get("", response_model=List[dict])
async def get_all_categories(
    scope: Optional[str] = None,
    include_inactive: bool = False,
    user: dict = Depends(get_current_user)
):
    """Get all categories with usage counts - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin", "merchandise_admin", "pum_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    query = {}
    if scope:
        query["scope"] = scope
    if not include_inactive:
        query["is_active"] = True
    
    categories = await db.product_categories.find(query).sort("sort_order", 1).to_list(100)
    
    result = []
    for cat in categories:
        # Count usage in each module
        koperasi_count = await db.koop_products.count_documents({"category": cat["code"], "is_active": True})
        merchandise_count = await db.merchandise_products.count_documents({"category": cat["code"], "is_active": True})
        pum_count = await db.pum_products.count_documents({"category": cat["code"], "is_active": True})
        
        # Get parent name
        parent_name = None
        if cat.get("parent_id"):
            parent = await db.product_categories.find_one({"_id": _id_value(cat["parent_id"])})
            parent_name = parent["name"] if parent else None
        
        # Get children
        children = await db.product_categories.find({"parent_id": str(cat["_id"]), "is_active": True}).to_list(50)
        
        created_at = cat.get("created_at")
        updated_at = cat.get("updated_at", created_at)
        if isinstance(created_at, datetime):
            created_at = created_at.isoformat()
        if isinstance(updated_at, datetime):
            updated_at = updated_at.isoformat()
        
        result.append({
            "id": str(cat["_id"]),
            "name": cat["name"],
            "code": cat["code"],
            "description": cat.get("description"),
            "scope": cat["scope"],
            "scope_display": CATEGORY_SCOPE_DISPLAY.get(cat["scope"], cat["scope"]),
            "parent_id": cat.get("parent_id"),
            "parent_name": parent_name,
            "icon": cat.get("icon"),
            "color": cat.get("color"),
            "sort_order": cat.get("sort_order", 0),
            "is_active": cat.get("is_active", True),
            "koperasi_count": koperasi_count,
            "merchandise_count": merchandise_count,
            "pum_count": pum_count,
            "total_count": koperasi_count + merchandise_count + pum_count,
            "children": [{"id": str(c["_id"]), "name": c["name"], "code": c["code"]} for c in children],
            "created_at": created_at,
            "updated_at": updated_at
        })
    
    return result


@router.post("", response_model=dict)
async def create_category(category: CategoryCreate, user: dict = Depends(get_current_user)):
    """Create a new category - Admin only"""
    db = get_db()
    
    # Check permissions based on scope
    allowed_roles = ["superadmin", "admin", "koop_admin"]
    if category.scope == CategoryScope.MERCHANDISE_ONLY:
        allowed_roles.append("merchandise_admin")
    elif category.scope == CategoryScope.PUM_ONLY:
        allowed_roles.append("pum_admin")
    
    if user["role"] not in allowed_roles:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Check if code already exists
    existing = await db.product_categories.find_one({"code": category.code})
    if existing:
        raise HTTPException(status_code=400, detail="Kod kategori sudah wujud")
    
    cat_doc = {
        "name": category.name,
        "code": category.code,
        "description": category.description,
        "scope": category.scope.value,
        "parent_id": category.parent_id,
        "icon": category.icon,
        "color": category.color,
        "sort_order": category.sort_order,
        "is_active": category.is_active,
        "created_at": datetime.now(timezone.utc),
        "created_by": str(user["_id"]),
        "updated_at": datetime.now(timezone.utc)
    }
    
    result = await db.product_categories.insert_one(cat_doc)
    
    await log_audit(user, "CREATE_CATEGORY", "category", f"Kategori dicipta: {category.name}")
    
    return {"id": str(result.inserted_id), "message": "Kategori berjaya dicipta"}


@router.put("/{category_id}", response_model=dict)
async def update_category(category_id: str, category: CategoryUpdate, user: dict = Depends(get_current_user)):
    """Update a category - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin", "merchandise_admin", "pum_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    existing = await db.product_categories.find_one({"_id": _id_value(category_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Kategori tidak dijumpai")
    
    # Check scope permissions
    if existing["scope"] == "merchandise_only" and user["role"] not in ["superadmin", "admin", "koop_admin", "merchandise_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    if existing["scope"] == "pum_only" and user["role"] not in ["superadmin", "admin", "koop_admin", "pum_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    update_data = {}
    for k, v in category.dict().items():
        if v is not None:
            if k == "scope":
                update_data[k] = v.value if hasattr(v, 'value') else v
            else:
                update_data[k] = v
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.product_categories.update_one({"_id": _id_value(category_id)}, {"$set": update_data})
    
    await log_audit(user, "UPDATE_CATEGORY", "category", f"Kategori dikemaskini: {category_id}")
    
    return {"message": "Kategori berjaya dikemaskini"}


@router.delete("/{category_id}", response_model=dict)
async def delete_category(category_id: str, user: dict = Depends(get_current_user)):
    """Soft delete a category - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Check if category has products
    cat = await db.product_categories.find_one({"_id": _id_value(category_id)})
    if not cat:
        raise HTTPException(status_code=404, detail="Kategori tidak dijumpai")
    
    koperasi_count = await db.koop_products.count_documents({"category": cat["code"]})
    merchandise_count = await db.merchandise_products.count_documents({"category": cat["code"]})
    pum_count = await db.pum_products.count_documents({"category": cat["code"]})
    
    if koperasi_count + merchandise_count + pum_count > 0:
        raise HTTPException(status_code=400, detail=f"Kategori ini mempunyai {koperasi_count + merchandise_count + pum_count} produk. Sila pindahkan produk dahulu.")
    
    await db.product_categories.update_one(
        {"_id": _id_value(category_id)},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    
    await log_audit(user, "DELETE_CATEGORY", "category", f"Kategori dipadam: {category_id}")
    
    return {"message": "Kategori berjaya dipadam"}


# ==================== SEED DEFAULT CATEGORIES ====================

@router.post("/seed-defaults", response_model=dict)
async def seed_default_categories(user: dict = Depends(get_current_user)):
    """Seed default categories - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    created = 0
    skipped = 0
    
    # Use Koperasi categories as default
    all_categories = KOPERASI_DEFAULT_CATEGORIES + DEFAULT_CATEGORIES
    seen_codes = set()
    
    for cat in all_categories:
        if cat["code"] in seen_codes:
            continue
        seen_codes.add(cat["code"])
        
        existing = await db.product_categories.find_one({"code": cat["code"]})
        if existing:
            skipped += 1
            continue
        
        cat_doc = {
            **cat,
            "is_active": True,
            "sort_order": created,
            "created_at": datetime.now(timezone.utc),
            "created_by": str(user["_id"]),
            "updated_at": datetime.now(timezone.utc)
        }
        await db.product_categories.insert_one(cat_doc)
        created += 1
    
    await log_audit(user, "SEED_CATEGORIES", "category", f"Kategori default dicipta: {created}, dilangkau: {skipped}")
    
    return {
        "message": f"Kategori default dicipta: {created}, sudah wujud: {skipped}",
        "created": created,
        "skipped": skipped
    }


# ==================== CATEGORY TREE ====================

@router.get("/tree", response_model=List[dict])
async def get_category_tree(
    module: Optional[str] = None,
    user: dict = Depends(get_current_user_optional)
):
    """Get category tree with hierarchy"""
    db = get_db()
    
    query = {"is_active": True, "parent_id": None}  # Root categories only
    
    if module:
        if module == "koperasi":
            query["scope"] = {"$in": ["shared", "koperasi_only"]}
        elif module == "merchandise":
            query["scope"] = {"$in": ["shared", "merchandise_only"]}
        elif module == "pum":
            query["scope"] = {"$in": ["shared", "pum_only"]}
    
    root_categories = await db.product_categories.find(query).sort("sort_order", 1).to_list(50)
    
    async def build_tree(parent_id):
        children = await db.product_categories.find({
            "parent_id": parent_id,
            "is_active": True
        }).sort("sort_order", 1).to_list(50)
        
        result = []
        for child in children:
            grandchildren = await build_tree(str(child["_id"]))
            result.append({
                "id": str(child["_id"]),
                "name": child["name"],
                "code": child["code"],
                "scope": child["scope"],
                "icon": child.get("icon"),
                "color": child.get("color"),
                "children": grandchildren
            })
        return result
    
    tree = []
    for cat in root_categories:
        children = await build_tree(str(cat["_id"]))
        tree.append({
            "id": str(cat["_id"]),
            "name": cat["name"],
            "code": cat["code"],
            "scope": cat["scope"],
            "scope_display": CATEGORY_SCOPE_DISPLAY.get(cat["scope"], cat["scope"]),
            "icon": cat.get("icon"),
            "color": cat.get("color"),
            "children": children
        })
    
    return tree



# ==================== KOPERASI SPECIFIC ENDPOINTS ====================

@router.get("/koperasi", response_model=List[dict])
async def get_koperasi_categories(
    include_children: bool = True,
    user: dict = Depends(get_current_user_optional)
):
    """Get categories available for Koperasi module with hierarchy support"""
    db = get_db()
    
    # Get categories that are shared or koperasi_only
    query = {
        "is_active": True,
        "scope": {"$in": ["shared", "koperasi_only"]}
    }
    
    if include_children:
        # Get only root categories (no parent)
        query["$or"] = [{"parent_id": None}, {"parent_id": {"$exists": False}}]
    
    categories = await db.product_categories.find(query).sort("sort_order", 1).to_list(100)
    
    async def get_children(parent_id: str):
        children = await db.product_categories.find({
            "parent_id": parent_id,
            "is_active": True,
            "scope": {"$in": ["shared", "koperasi_only"]}
        }).sort("sort_order", 1).to_list(50)
        
        result = []
        for child in children:
            grandchildren = await get_children(str(child["_id"]))
            result.append({
                "id": str(child["_id"]),
                "code": child["code"],
                "name": child["name"],
                "icon": child.get("icon"),
                "color": child.get("color"),
                "description": child.get("description"),
                "commission_eligible": child.get("commission_eligible", False),
                "children": grandchildren
            })
        return result
    
    result = []
    for cat in categories:
        children = await get_children(str(cat["_id"])) if include_children else []
        result.append({
            "id": str(cat["_id"]),
            "code": cat["code"],
            "name": cat["name"],
            "scope": cat["scope"],
            "icon": cat.get("icon"),
            "color": cat.get("color"),
            "description": cat.get("description"),
            "commission_eligible": cat.get("commission_eligible", False),
            "children": children
        })
    
    return result


@router.get("/koperasi/flat", response_model=List[dict])
async def get_koperasi_categories_flat(user: dict = Depends(get_current_user_optional)):
    """Get all Koperasi categories as flat list (for dropdown select)"""
    db = get_db()
    
    categories = await db.product_categories.find({
        "is_active": True,
        "scope": {"$in": ["shared", "koperasi_only"]}
    }).sort("sort_order", 1).to_list(100)
    
    result = []
    for cat in categories:
        # Get parent name if exists
        parent_name = None
        if cat.get("parent_id"):
            parent = await db.product_categories.find_one({"_id": _id_value(cat["parent_id"])})
            parent_name = parent["name"] if parent else None
        
        result.append({
            "id": str(cat["_id"]),
            "code": cat["code"],
            "name": cat["name"],
            "full_name": f"{parent_name} > {cat['name']}" if parent_name else cat["name"],
            "parent_id": cat.get("parent_id"),
            "parent_name": parent_name,
            "icon": cat.get("icon"),
            "color": cat.get("color"),
            "commission_eligible": cat.get("commission_eligible", False)
        })
    
    return result


@router.post("/koperasi/seed", response_model=dict)
async def seed_koperasi_categories(user: dict = Depends(get_current_user)):
    """Seed Koperasi-specific categories - Admin only"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    created = 0
    skipped = 0
    
    for cat in KOPERASI_DEFAULT_CATEGORIES:
        existing = await db.product_categories.find_one({"code": cat["code"]})
        if existing:
            skipped += 1
            continue
        
        cat_doc = {
            **cat,
            "is_active": True,
            "sort_order": created,
            "created_at": datetime.now(timezone.utc),
            "created_by": str(user["_id"]),
            "updated_at": datetime.now(timezone.utc)
        }
        await db.product_categories.insert_one(cat_doc)
        created += 1
    
    await log_audit(user, "SEED_KOPERASI_CATEGORIES", "category", f"Kategori Koperasi dicipta: {created}")
    
    return {
        "message": f"Kategori Koperasi: {created} dicipta, {skipped} sudah wujud",
        "created": created,
        "skipped": skipped
    }


# ==================== INVENTORY SPECIFIC ENDPOINTS ====================

@router.get("/inventory", response_model=List[dict])
async def get_inventory_categories(user: dict = Depends(get_current_user_optional)):
    """Get categories available for Inventory module"""
    db = get_db()
    
    # Get all active categories for inventory
    categories = await db.product_categories.find({
        "is_active": True
    }).sort("sort_order", 1).to_list(100)
    
    result = []
    for cat in categories:
        result.append({
            "value": cat["code"],
            "label": cat["name"],
            "icon": cat.get("icon"),
            "color": cat.get("color"),
            "scope": cat["scope"]
        })
    
    return result


# ==================== SUB-CATEGORY MANAGEMENT ====================

@router.post("/{parent_id}/subcategory", response_model=dict)
async def create_subcategory(
    parent_id: str,
    category: CategoryCreate,
    user: dict = Depends(get_current_user)
):
    """Create a subcategory under a parent category"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Verify parent exists
    parent = await db.product_categories.find_one({"_id": _id_value(parent_id)})
    if not parent:
        raise HTTPException(status_code=404, detail="Kategori induk tidak dijumpai")
    
    # Check if code already exists
    existing = await db.product_categories.find_one({"code": category.code})
    if existing:
        raise HTTPException(status_code=400, detail="Kod kategori sudah wujud")
    
    # Inherit scope from parent if not specified
    scope = category.scope.value if category.scope else parent["scope"]
    
    cat_doc = {
        "name": category.name,
        "code": category.code,
        "description": category.description,
        "scope": scope,
        "parent_id": parent_id,
        "icon": category.icon or parent.get("icon"),
        "color": category.color or parent.get("color"),
        "sort_order": category.sort_order,
        "is_active": category.is_active,
        "commission_eligible": parent.get("commission_eligible", False),
        "created_at": datetime.now(timezone.utc),
        "created_by": str(user["_id"]),
        "updated_at": datetime.now(timezone.utc)
    }
    
    result = await db.product_categories.insert_one(cat_doc)
    
    await log_audit(user, "CREATE_SUBCATEGORY", "category", f"Sub-kategori dicipta: {category.name} di bawah {parent['name']}")
    
    return {"id": str(result.inserted_id), "message": "Sub-kategori berjaya dicipta"}


@router.put("/{category_id}/move", response_model=dict)
async def move_category(
    category_id: str,
    new_parent_id: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Move a category to a new parent (or make it root if new_parent_id is None)"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Verify category exists
    category = await db.product_categories.find_one({"_id": _id_value(category_id)})
    if not category:
        raise HTTPException(status_code=404, detail="Kategori tidak dijumpai")
    
    # Prevent moving to self or own child
    if new_parent_id:
        if new_parent_id == category_id:
            raise HTTPException(status_code=400, detail="Tidak boleh pindah ke diri sendiri")
        
        # Check if new parent is a child of this category
        async def is_child(parent_id, target_id):
            children = await db.product_categories.find({"parent_id": parent_id}).to_list(100)
            for child in children:
                if str(child["_id"]) == target_id:
                    return True
                if await is_child(str(child["_id"]), target_id):
                    return True
            return False
        
        if await is_child(category_id, new_parent_id):
            raise HTTPException(status_code=400, detail="Tidak boleh pindah ke kategori anak")
        
        # Verify new parent exists
        new_parent = await db.product_categories.find_one({"_id": _id_value(new_parent_id)})
        if not new_parent:
            raise HTTPException(status_code=404, detail="Kategori induk baru tidak dijumpai")
    
    await db.product_categories.update_one(
        {"_id": _id_value(category_id)},
        {"$set": {"parent_id": new_parent_id, "updated_at": datetime.now(timezone.utc)}}
    )
    
    await log_audit(user, "MOVE_CATEGORY", "category", f"Kategori dipindahkan: {category['name']}")
    
    return {"message": "Kategori berjaya dipindahkan"}
