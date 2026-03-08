"""
Universal Inventory Management System - API Routes
Central inventory that syncs between Koperasi, PUM, and Merchandise modules
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Optional
from datetime import datetime, timezone
from bson import ObjectId

from models.inventory import (
    InventoryItemCreate, InventoryItemUpdate, InventoryItemResponse,
    InventoryLinkCreate, InventoryLink,
    VendorCreate, VendorUpdate, VendorResponse,
    SyncRequest, InventoryMovementLog,
    InventorySource, InventorySyncMode, VendorType, SharedCategory,
    SHARED_CATEGORY_DISPLAY
)

router = APIRouter(prefix="/api/inventory", tags=["Universal Inventory"])
security = HTTPBearer(auto_error=False)

# These will be set from server.py
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


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Token diperlukan")
    return await _get_current_user_func(credentials)


async def log_audit(user, action, module, details):
    if _log_audit_func and user:
        await _log_audit_func(user, action, module, details)


async def record_movement(db, inventory_item_id: str, movement_type: str, quantity: int,
                          previous_stock: int, new_stock: int, source_module: str,
                          reference_type: str = None, reference_id: str = None,
                          reason: str = "", user_id: str = None, notes: str = None):
    """Record inventory movement for audit trail"""
    movement = {
        "inventory_item_id": inventory_item_id,
        "movement_type": movement_type,
        "quantity": quantity,
        "previous_stock": previous_stock,
        "new_stock": new_stock,
        "source_module": source_module,
        "reference_type": reference_type,
        "reference_id": reference_id,
        "reason": reason,
        "notes": notes,
        "created_by": user_id,
        "created_at": datetime.now(timezone.utc)
    }
    await db.inventory_movements.insert_one(movement)


async def sync_linked_products(db, inventory_item_id: str, new_stock: int, source_module: str, user_id: str = None):
    """Sync stock to all linked products in other modules"""
    item = await db.central_inventory.find_one({"_id": ObjectId(inventory_item_id)})
    if not item or item.get("sync_mode") == InventorySyncMode.DISABLED.value:
        return []
    
    links = await db.inventory_links.find({
        "inventory_item_id": inventory_item_id,
        "sync_enabled": True
    }).to_list(100)
    
    synced = []
    for link in links:
        if link["module"] == source_module:
            continue  # Skip source module
        
        # Get collection based on module
        if link["module"] == "koperasi":
            collection = db.koop_products
        elif link["module"] == "pum":
            collection = db.pum_products
        elif link["module"] == "merchandise":
            collection = db.merchandise_products
        else:
            continue
        
        # Update stock in linked product
        result = await collection.update_one(
            {"_id": ObjectId(link["product_id"])},
            {"$set": {"stock": new_stock, "total_stock": new_stock, "updated_at": datetime.now(timezone.utc)}}
        )
        
        if result.modified_count > 0:
            synced.append({
                "module": link["module"],
                "product_id": link["product_id"],
                "new_stock": new_stock
            })
            
            # Record sync movement
            await record_movement(
                db, inventory_item_id, "sync", 0, new_stock, new_stock,
                link["module"], "sync", link["product_id"],
                f"Auto-sync dari {source_module}", user_id
            )
    
    return synced


# ==================== CATEGORIES ====================

@router.get("/categories", response_model=List[dict])
async def get_shared_categories(user: dict = Depends(get_current_user)):
    """Get all shared categories with usage counts"""
    db = get_db()
    
    # Count usage in central inventory
    pipeline = [
        {"$match": {"is_active": True}},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}}
    ]
    results = await db.central_inventory.aggregate(pipeline).to_list(50)
    counts = {r["_id"]: r["count"] for r in results}
    
    categories = []
    for cat in SharedCategory:
        categories.append({
            "value": cat.value,
            "label": SHARED_CATEGORY_DISPLAY.get(cat.value, cat.value),
            "count": counts.get(cat.value, 0)
        })
    
    return sorted(categories, key=lambda x: x["label"])


# ==================== VENDORS ====================

@router.get("/vendors", response_model=List[dict])
async def get_vendors(
    vendor_type: Optional[str] = None,
    include_inactive: bool = False,
    user: dict = Depends(get_current_user)
):
    """Get all vendors"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin", "pum_admin", "merchandise_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    query = {}
    if vendor_type:
        query["vendor_type"] = vendor_type
    if not include_inactive:
        query["is_active"] = True
    
    vendors = await db.vendors.find(query).sort("name", 1).to_list(100)
    
    result = []
    for v in vendors:
        # Count products
        product_count = await db.central_inventory.count_documents({"vendor_id": str(v["_id"]), "is_active": True})
        
        created_at = v.get("created_at")
        updated_at = v.get("updated_at", created_at)
        if isinstance(created_at, datetime):
            created_at = created_at.isoformat()
        if isinstance(updated_at, datetime):
            updated_at = updated_at.isoformat()
        
        result.append({
            "id": str(v["_id"]),
            "name": v["name"],
            "vendor_type": v["vendor_type"],
            "description": v.get("description"),
            "contact_person": v.get("contact_person"),
            "contact_phone": v.get("contact_phone"),
            "contact_email": v.get("contact_email"),
            "address": v.get("address"),
            "commission_rate": v.get("commission_rate", 0),
            "is_active": v.get("is_active", True),
            "product_count": product_count,
            "created_at": created_at,
            "updated_at": updated_at
        })
    
    return result


@router.post("/vendors", response_model=dict)
async def create_vendor(vendor: VendorCreate, user: dict = Depends(get_current_user)):
    """Create a new vendor"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    vendor_doc = {
        "name": vendor.name,
        "vendor_type": vendor.vendor_type.value,
        "description": vendor.description,
        "contact_person": vendor.contact_person,
        "contact_phone": vendor.contact_phone,
        "contact_email": vendor.contact_email,
        "address": vendor.address,
        "commission_rate": vendor.commission_rate,
        "is_active": vendor.is_active,
        "created_at": datetime.now(timezone.utc),
        "created_by": str(user["_id"]),
        "updated_at": datetime.now(timezone.utc)
    }
    
    result = await db.vendors.insert_one(vendor_doc)
    await log_audit(user, "CREATE_VENDOR", "inventory", f"Vendor dicipta: {vendor.name}")
    
    return {"id": str(result.inserted_id), "message": "Vendor berjaya dicipta"}


@router.put("/vendors/{vendor_id}", response_model=dict)
async def update_vendor(vendor_id: str, vendor: VendorUpdate, user: dict = Depends(get_current_user)):
    """Update a vendor"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    update_data = {k: v for k, v in vendor.dict().items() if v is not None}
    if "vendor_type" in update_data:
        update_data["vendor_type"] = update_data["vendor_type"].value
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    result = await db.vendors.update_one({"_id": ObjectId(vendor_id)}, {"$set": update_data})
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Vendor tidak dijumpai")
    
    await log_audit(user, "UPDATE_VENDOR", "inventory", f"Vendor dikemaskini: {vendor_id}")
    
    return {"message": "Vendor berjaya dikemaskini"}


@router.delete("/vendors/{vendor_id}", response_model=dict)
async def delete_vendor(vendor_id: str, user: dict = Depends(get_current_user)):
    """Soft delete a vendor"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    result = await db.vendors.update_one(
        {"_id": ObjectId(vendor_id)},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Vendor tidak dijumpai")
    
    await log_audit(user, "DELETE_VENDOR", "inventory", f"Vendor dipadam: {vendor_id}")
    
    return {"message": "Vendor berjaya dipadam"}


# ==================== INVENTORY ITEMS ====================

@router.get("/items", response_model=List[dict])
async def get_inventory_items(
    category: Optional[str] = None,
    vendor_id: Optional[str] = None,
    vendor_type: Optional[str] = None,
    include_inactive: bool = False,
    low_stock_only: bool = False,
    user: dict = Depends(get_current_user)
):
    """Get all central inventory items"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin", "pum_admin", "merchandise_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    query = {}
    if category:
        query["category"] = category
    if vendor_id:
        query["vendor_id"] = vendor_id
    if vendor_type:
        query["vendor_type"] = vendor_type
    if not include_inactive:
        query["is_active"] = True
    
    items = await db.central_inventory.find(query).sort("name", 1).to_list(500)
    
    # Filter low stock if needed
    if low_stock_only:
        items = [i for i in items if i.get("stock", 0) <= i.get("low_stock_threshold", 10)]
    
    # Get vendor names
    vendor_ids = list(set(i.get("vendor_id") for i in items if i.get("vendor_id")))
    vendors = {}
    if vendor_ids:
        vendor_docs = await db.vendors.find({"_id": {"$in": [ObjectId(v) for v in vendor_ids if v]}}).to_list(100)
        vendors = {str(v["_id"]): v["name"] for v in vendor_docs}
    
    result = []
    for item in items:
        stock = item.get("stock", 0)
        threshold = item.get("low_stock_threshold", 10)
        
        # Get linked products
        links = await db.inventory_links.find({"inventory_item_id": str(item["_id"])}).to_list(20)
        linked_products = []
        for link in links:
            linked_products.append({
                "module": link["module"],
                "product_id": link["product_id"],
                "sync_enabled": link.get("sync_enabled", True),
                "price_multiplier": link.get("price_multiplier", 1.0)
            })
        
        created_at = item.get("created_at")
        updated_at = item.get("updated_at", created_at)
        if isinstance(created_at, datetime):
            created_at = created_at.isoformat()
        if isinstance(updated_at, datetime):
            updated_at = updated_at.isoformat()
        
        result.append({
            "id": str(item["_id"]),
            "name": item["name"],
            "sku": item.get("sku"),
            "description": item.get("description"),
            "category": item["category"],
            "category_display": SHARED_CATEGORY_DISPLAY.get(item["category"], item["category"]),
            "base_price": item["base_price"],
            "selling_price": item.get("selling_price", item["base_price"]),
            "profit_margin": ((item.get("selling_price", item["base_price"]) - item["base_price"]) / item["base_price"] * 100) if item["base_price"] > 0 else 0,
            "stock": stock,
            "low_stock_threshold": threshold,
            "is_low_stock": stock > 0 and stock <= threshold,
            "is_out_of_stock": stock == 0,
            "vendor_type": item.get("vendor_type", "internal"),
            "vendor_id": item.get("vendor_id"),
            "vendor_name": vendors.get(item.get("vendor_id")),
            "image_url": item.get("image_url"),
            "is_active": item.get("is_active", True),
            "sync_mode": item.get("sync_mode", "auto"),
            "source_module": item.get("source_module", "central"),
            "linked_products": linked_products,
            "created_at": created_at,
            "updated_at": updated_at
        })
    
    return result


@router.post("/items", response_model=dict)
async def create_inventory_item(item: InventoryItemCreate, user: dict = Depends(get_current_user)):
    """Create a new central inventory item"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin", "pum_admin", "merchandise_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    item_doc = {
        "name": item.name,
        "sku": item.sku,
        "description": item.description,
        "category": item.category.value,
        "base_price": item.base_price,
        "selling_price": item.selling_price or item.base_price,
        "stock": item.stock,
        "low_stock_threshold": item.low_stock_threshold,
        "vendor_type": item.vendor_type.value,
        "vendor_id": item.vendor_id,
        "image_url": item.image_url,
        "is_active": item.is_active,
        "sync_mode": item.sync_mode.value,
        "source_module": item.source_module.value,
        "created_at": datetime.now(timezone.utc),
        "created_by": str(user["_id"]),
        "updated_at": datetime.now(timezone.utc)
    }
    
    result = await db.central_inventory.insert_one(item_doc)
    
    # Record initial inventory
    if item.stock > 0:
        await record_movement(
            db, str(result.inserted_id), "in", item.stock, 0, item.stock,
            "central", "initial", None, "Stok permulaan", str(user["_id"])
        )
    
    await log_audit(user, "CREATE_INVENTORY_ITEM", "inventory", f"Item inventori dicipta: {item.name}")
    
    return {"id": str(result.inserted_id), "message": "Item inventori berjaya dicipta"}


@router.get("/items/{item_id}", response_model=dict)
async def get_inventory_item(item_id: str, user: dict = Depends(get_current_user)):
    """Get single inventory item with full details"""
    db = get_db()
    
    item = await db.central_inventory.find_one({"_id": ObjectId(item_id)})
    if not item:
        raise HTTPException(status_code=404, detail="Item tidak dijumpai")
    
    # Get vendor
    vendor_name = None
    if item.get("vendor_id"):
        vendor = await db.vendors.find_one({"_id": ObjectId(item["vendor_id"])})
        vendor_name = vendor["name"] if vendor else None
    
    # Get linked products with details
    links = await db.inventory_links.find({"inventory_item_id": item_id}).to_list(20)
    linked_products = []
    for link in links:
        product_name = None
        if link["module"] == "koperasi":
            product = await db.koop_products.find_one({"_id": ObjectId(link["product_id"])})
        elif link["module"] == "pum":
            product = await db.pum_products.find_one({"_id": ObjectId(link["product_id"])})
        elif link["module"] == "merchandise":
            product = await db.merchandise_products.find_one({"_id": ObjectId(link["product_id"])})
        else:
            product = None
        
        if product:
            product_name = product.get("name")
        
        linked_products.append({
            "link_id": str(link["_id"]),
            "module": link["module"],
            "product_id": link["product_id"],
            "product_name": product_name,
            "sync_enabled": link.get("sync_enabled", True),
            "price_multiplier": link.get("price_multiplier", 1.0)
        })
    
    stock = item.get("stock", 0)
    threshold = item.get("low_stock_threshold", 10)
    
    created_at = item.get("created_at")
    updated_at = item.get("updated_at", created_at)
    if isinstance(created_at, datetime):
        created_at = created_at.isoformat()
    if isinstance(updated_at, datetime):
        updated_at = updated_at.isoformat()
    
    return {
        "id": str(item["_id"]),
        "name": item["name"],
        "sku": item.get("sku"),
        "description": item.get("description"),
        "category": item["category"],
        "category_display": SHARED_CATEGORY_DISPLAY.get(item["category"], item["category"]),
        "base_price": item["base_price"],
        "stock": stock,
        "low_stock_threshold": threshold,
        "is_low_stock": stock > 0 and stock <= threshold,
        "is_out_of_stock": stock == 0,
        "vendor_type": item.get("vendor_type", "internal"),
        "vendor_id": item.get("vendor_id"),
        "vendor_name": vendor_name,
        "image_url": item.get("image_url"),
        "is_active": item.get("is_active", True),
        "sync_mode": item.get("sync_mode", "auto"),
        "source_module": item.get("source_module", "central"),
        "linked_products": linked_products,
        "created_at": created_at,
        "updated_at": updated_at
    }


@router.put("/items/{item_id}", response_model=dict)
async def update_inventory_item(item_id: str, item: InventoryItemUpdate, user: dict = Depends(get_current_user)):
    """Update inventory item"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin", "pum_admin", "merchandise_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    existing = await db.central_inventory.find_one({"_id": ObjectId(item_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Item tidak dijumpai")
    
    update_data = {}
    for k, v in item.dict().items():
        if v is not None:
            if k in ["category", "vendor_type", "sync_mode"]:
                update_data[k] = v.value if hasattr(v, 'value') else v
            else:
                update_data[k] = v
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    # Check if stock changed
    old_stock = existing.get("stock", 0)
    new_stock = update_data.get("stock", old_stock)
    
    await db.central_inventory.update_one({"_id": ObjectId(item_id)}, {"$set": update_data})
    
    # If stock changed, sync to linked products
    if new_stock != old_stock:
        await record_movement(
            db, item_id, "adjustment", abs(new_stock - old_stock),
            old_stock, new_stock, "central", "adjustment", None,
            "Pelarasan stok", str(user["_id"])
        )
        
        # Auto-sync if enabled
        await sync_linked_products(db, item_id, new_stock, "central", str(user["_id"]))
    
    await log_audit(user, "UPDATE_INVENTORY_ITEM", "inventory", f"Item inventori dikemaskini: {item_id}")
    
    return {"message": "Item berjaya dikemaskini"}


@router.delete("/items/{item_id}", response_model=dict)
async def delete_inventory_item(item_id: str, user: dict = Depends(get_current_user)):
    """Soft delete inventory item"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    result = await db.central_inventory.update_one(
        {"_id": ObjectId(item_id)},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item tidak dijumpai")
    
    await log_audit(user, "DELETE_INVENTORY_ITEM", "inventory", f"Item inventori dipadam: {item_id}")
    
    return {"message": "Item berjaya dipadam"}


# ==================== INVENTORY LINKS ====================

@router.post("/links", response_model=dict)
async def create_inventory_link(link: InventoryLinkCreate, user: dict = Depends(get_current_user)):
    """Link central inventory item to a module product"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin", "pum_admin", "merchandise_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Verify inventory item exists
    item = await db.central_inventory.find_one({"_id": ObjectId(link.inventory_item_id)})
    if not item:
        raise HTTPException(status_code=404, detail="Item inventori tidak dijumpai")
    
    # Verify product exists in target module
    if link.module == InventorySource.KOPERASI:
        product = await db.koop_products.find_one({"_id": ObjectId(link.product_id)})
    elif link.module == InventorySource.PUM:
        product = await db.pum_products.find_one({"_id": ObjectId(link.product_id)})
    elif link.module == InventorySource.MERCHANDISE:
        product = await db.merchandise_products.find_one({"_id": ObjectId(link.product_id)})
    else:
        product = None
    
    if not product:
        raise HTTPException(status_code=404, detail="Produk tidak dijumpai dalam modul sasaran")
    
    # Check if link already exists
    existing = await db.inventory_links.find_one({
        "inventory_item_id": link.inventory_item_id,
        "module": link.module.value,
        "product_id": link.product_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Pautan sudah wujud")
    
    link_doc = {
        "inventory_item_id": link.inventory_item_id,
        "module": link.module.value,
        "product_id": link.product_id,
        "sync_enabled": link.sync_enabled,
        "price_multiplier": link.price_multiplier,
        "created_at": datetime.now(timezone.utc),
        "created_by": str(user["_id"])
    }
    
    result = await db.inventory_links.insert_one(link_doc)
    
    # Initial sync
    if link.sync_enabled:
        stock = item.get("stock", 0)
        if link.module == InventorySource.KOPERASI:
            await db.koop_products.update_one(
                {"_id": ObjectId(link.product_id)},
                {"$set": {"total_stock": stock, "updated_at": datetime.now(timezone.utc)}}
            )
        elif link.module == InventorySource.PUM:
            await db.pum_products.update_one(
                {"_id": ObjectId(link.product_id)},
                {"$set": {"stock": stock, "updated_at": datetime.now(timezone.utc)}}
            )
        elif link.module == InventorySource.MERCHANDISE:
            await db.merchandise_products.update_one(
                {"_id": ObjectId(link.product_id)},
                {"$set": {"stock": stock, "updated_at": datetime.now(timezone.utc)}}
            )
    
    await log_audit(user, "CREATE_INVENTORY_LINK", "inventory", 
                   f"Pautan dicipta: {link.inventory_item_id} -> {link.module.value}:{link.product_id}")
    
    return {"id": str(result.inserted_id), "message": "Pautan inventori berjaya dicipta"}


@router.delete("/links/{link_id}", response_model=dict)
async def delete_inventory_link(link_id: str, user: dict = Depends(get_current_user)):
    """Remove inventory link"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin", "pum_admin", "merchandise_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    result = await db.inventory_links.delete_one({"_id": ObjectId(link_id)})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pautan tidak dijumpai")
    
    await log_audit(user, "DELETE_INVENTORY_LINK", "inventory", f"Pautan dipadam: {link_id}")
    
    return {"message": "Pautan berjaya dipadam"}


@router.put("/links/{link_id}/toggle-sync", response_model=dict)
async def toggle_link_sync(link_id: str, sync_enabled: bool, user: dict = Depends(get_current_user)):
    """Toggle sync for a link"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin", "pum_admin", "merchandise_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    result = await db.inventory_links.update_one(
        {"_id": ObjectId(link_id)},
        {"$set": {"sync_enabled": sync_enabled}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pautan tidak dijumpai")
    
    return {"message": f"Sync {'diaktifkan' if sync_enabled else 'dinyahaktifkan'}"}


# ==================== SYNC OPERATIONS ====================

@router.post("/sync/manual", response_model=dict)
async def manual_sync(request: SyncRequest, user: dict = Depends(get_current_user)):
    """Manually trigger sync for an inventory item"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin", "pum_admin", "merchandise_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    item = await db.central_inventory.find_one({"_id": ObjectId(request.inventory_item_id)})
    if not item:
        raise HTTPException(status_code=404, detail="Item tidak dijumpai")
    
    synced = await sync_linked_products(
        db, request.inventory_item_id, item.get("stock", 0), "central", str(user["_id"])
    )
    
    await log_audit(user, "MANUAL_SYNC", "inventory", 
                   f"Sync manual: {request.inventory_item_id} -> {len(synced)} produk")
    
    return {
        "message": f"Sync berjaya ke {len(synced)} produk",
        "synced_products": synced
    }


@router.post("/sync/from-module", response_model=dict)
async def sync_from_module_stock(
    module: str,
    product_id: str,
    new_stock: int,
    reason: str = "Perubahan stok dari modul",
    user: dict = Depends(get_current_user)
):
    """Called when stock changes in a module - updates central and syncs to others"""
    db = get_db()
    
    # Find link
    link = await db.inventory_links.find_one({
        "module": module,
        "product_id": product_id,
        "sync_enabled": True
    })
    
    if not link:
        return {"message": "Tiada pautan aktif", "synced": False}
    
    inventory_item_id = link["inventory_item_id"]
    
    # Get current central stock
    item = await db.central_inventory.find_one({"_id": ObjectId(inventory_item_id)})
    if not item:
        return {"message": "Item inventori tidak dijumpai", "synced": False}
    
    old_stock = item.get("stock", 0)
    
    # Update central inventory
    await db.central_inventory.update_one(
        {"_id": ObjectId(inventory_item_id)},
        {"$set": {"stock": new_stock, "updated_at": datetime.now(timezone.utc)}}
    )
    
    # Record movement
    user_id = str(user["_id"]) if user else None
    await record_movement(
        db, inventory_item_id, "sync", abs(new_stock - old_stock),
        old_stock, new_stock, module, "module_change", product_id,
        reason, user_id
    )
    
    # Sync to other modules
    synced = await sync_linked_products(db, inventory_item_id, new_stock, module, user_id)
    
    return {
        "message": f"Sync berjaya ke {len(synced)} produk lain",
        "synced_products": synced,
        "synced": True
    }


# ==================== MOVEMENT HISTORY ====================

@router.get("/movements", response_model=List[dict])
async def get_inventory_movements(
    inventory_item_id: Optional[str] = None,
    module: Optional[str] = None,
    limit: int = 50,
    user: dict = Depends(get_current_user)
):
    """Get inventory movement history"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin", "pum_admin", "merchandise_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    query = {}
    if inventory_item_id:
        query["inventory_item_id"] = inventory_item_id
    if module:
        query["source_module"] = module
    
    movements = await db.inventory_movements.find(query).sort("created_at", -1).limit(limit).to_list(limit)
    
    result = []
    for m in movements:
        # Get item name
        item = await db.central_inventory.find_one({"_id": ObjectId(m["inventory_item_id"])})
        item_name = item["name"] if item else "Unknown"
        
        created_at = m.get("created_at")
        if isinstance(created_at, datetime):
            created_at = created_at.isoformat()
        
        result.append({
            "id": str(m["_id"]),
            "inventory_item_id": m["inventory_item_id"],
            "item_name": item_name,
            "movement_type": m["movement_type"],
            "quantity": m["quantity"],
            "previous_stock": m["previous_stock"],
            "new_stock": m["new_stock"],
            "source_module": m["source_module"],
            "reference_type": m.get("reference_type"),
            "reference_id": m.get("reference_id"),
            "reason": m["reason"],
            "notes": m.get("notes"),
            "created_at": created_at
        })
    
    return result


# ==================== STATISTICS ====================

@router.get("/stats", response_model=dict)
async def get_inventory_stats(user: dict = Depends(get_current_user)):
    """Get inventory statistics"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin", "pum_admin", "merchandise_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Total counts
    total_items = await db.central_inventory.count_documents({})
    active_items = await db.central_inventory.count_documents({"is_active": True})
    out_of_stock = await db.central_inventory.count_documents({"is_active": True, "stock": 0})
    
    # Low stock (using aggregation)
    pipeline = [
        {"$match": {"is_active": True, "stock": {"$gt": 0}}},
        {"$addFields": {"is_low": {"$lte": ["$stock", {"$ifNull": ["$low_stock_threshold", 10]}]}}},
        {"$match": {"is_low": True}},
        {"$count": "count"}
    ]
    low_stock_result = await db.central_inventory.aggregate(pipeline).to_list(1)
    low_stock_items = low_stock_result[0]["count"] if low_stock_result else 0
    
    # Total value
    items = await db.central_inventory.find({"is_active": True}).to_list(1000)
    total_value = sum(i.get("base_price", 0) * i.get("stock", 0) for i in items)
    
    # By category
    cat_pipeline = [
        {"$match": {"is_active": True}},
        {"$group": {"_id": "$category", "count": {"$sum": 1}, "total_stock": {"$sum": "$stock"}}}
    ]
    by_category = await db.central_inventory.aggregate(cat_pipeline).to_list(20)
    
    # By vendor
    vendor_pipeline = [
        {"$match": {"is_active": True}},
        {"$group": {"_id": "$vendor_type", "count": {"$sum": 1}, "total_stock": {"$sum": "$stock"}}}
    ]
    by_vendor = await db.central_inventory.aggregate(vendor_pipeline).to_list(10)
    
    # By source module
    module_pipeline = [
        {"$match": {"is_active": True}},
        {"$group": {"_id": "$source_module", "count": {"$sum": 1}}}
    ]
    by_module = await db.central_inventory.aggregate(module_pipeline).to_list(10)
    
    return {
        "total_items": total_items,
        "active_items": active_items,
        "low_stock_items": low_stock_items,
        "out_of_stock_items": out_of_stock,
        "total_value": round(total_value, 2),
        "by_category": [
            {"category": c["_id"], "category_display": SHARED_CATEGORY_DISPLAY.get(c["_id"], c["_id"]),
             "count": c["count"], "total_stock": c["total_stock"]} for c in by_category
        ],
        "by_vendor": [
            {"vendor_type": v["_id"], "count": v["count"], "total_stock": v["total_stock"]} for v in by_vendor
        ],
        "by_module": [
            {"module": m["_id"], "count": m["count"]} for m in by_module
        ]
    }


# ==================== SEED DEFAULT VENDOR ====================

@router.post("/seed/muafakat-vendor", response_model=dict)
async def seed_muafakat_vendor(user: dict = Depends(get_current_user)):
    """Seed Muafakat MRSM Kuantan as default vendor"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Check if already exists
    existing = await db.vendors.find_one({"vendor_type": "muafakat"})
    if existing:
        return {"message": "Vendor Muafakat sudah wujud", "id": str(existing["_id"])}
    
    vendor_doc = {
        "name": "Merchandise Muafakat MRSM Kuantan",
        "vendor_type": "muafakat",
        "description": "Vendor rasmi untuk merchandise MRSM Kuantan di bawah pengurusan Koperasi",
        "contact_person": "Admin Koperasi",
        "contact_phone": "",
        "contact_email": "",
        "address": "MRSM Kuantan, Pahang",
        "commission_rate": 10.0,  # PUM gets 10% commission
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "created_by": str(user["_id"]),
        "updated_at": datetime.now(timezone.utc)
    }
    
    result = await db.vendors.insert_one(vendor_doc)
    
    await log_audit(user, "SEED_MUAFAKAT_VENDOR", "inventory", "Vendor Muafakat dicipta")
    
    return {"message": "Vendor Muafakat berjaya dicipta", "id": str(result.inserted_id)}
