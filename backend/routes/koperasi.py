"""
Koperasi Module - API Routes
For school cooperative shop with kit-based product sales
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
from bson import ObjectId
import random
import string

from models.koperasi import (
    KoopKitCreate, KoopKitUpdate, KoopKitResponse,
    KoopProductCreate, KoopProductUpdate, KoopProductResponse,
    AddToCartRequest, AddKitToCartRequest, CartResponse, CartItem,
    KoopOrderCreate, KoopOrderResponse, OrderStatus, ProductSize, SizeType
)

router = APIRouter(prefix="/api/koperasi", tags=["Koperasi"])


def generate_order_number():
    """Generate unique order number"""
    timestamp = datetime.now().strftime("%Y%m%d")
    random_str = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"KOOP-{timestamp}-{random_str}"


# ==================== KIT MANAGEMENT (Admin) ====================

@router.post("/kits", response_model=dict)
async def create_kit(kit: KoopKitCreate, db=None, current_user=None):
    """Create a new kit/package - Admin only"""
    if current_user["role"] not in ["superadmin", "admin", "koop_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    kit_doc = {
        "name": kit.name,
        "description": kit.description,
        "image_url": kit.image_url,
        "is_active": kit.is_active,
        "created_at": datetime.now(timezone.utc),
        "created_by": current_user["id"],
        "updated_at": datetime.now(timezone.utc)
    }
    
    result = await db.koop_kits.insert_one(kit_doc)
    
    return {
        "id": str(result.inserted_id),
        "message": "Kit berjaya dicipta"
    }


@router.get("/kits", response_model=List[dict])
async def get_kits(
    include_inactive: bool = False,
    db=None,
    current_user=None
):
    """Get all kits with product count and total price"""
    query = {}
    
    # Only admins can see inactive kits
    if not include_inactive or current_user["role"] not in ["superadmin", "admin", "koop_admin"]:
        query["is_active"] = True
    
    kits = await db.koop_kits.find(query).sort("created_at", -1).to_list(100)
    
    result = []
    for kit in kits:
        # Get products for this kit
        products = await db.koop_products.find({
            "kit_id": str(kit["_id"]),
            "is_active": True
        }).to_list(100)
        
        total_price = sum(p.get("price", 0) for p in products)
        
        result.append({
            "id": str(kit["_id"]),
            "name": kit["name"],
            "description": kit.get("description"),
            "image_url": kit.get("image_url"),
            "is_active": kit.get("is_active", True),
            "product_count": len(products),
            "total_price": total_price,
            "created_at": kit["created_at"].isoformat() if kit.get("created_at") else None,
            "created_by": kit.get("created_by")
        })
    
    return result


@router.get("/kits/{kit_id}", response_model=dict)
async def get_kit(kit_id: str, db=None, current_user=None):
    """Get single kit with its products"""
    kit = await db.koop_kits.find_one({"_id": ObjectId(kit_id)})
    if not kit:
        raise HTTPException(status_code=404, detail="Kit tidak dijumpai")
    
    # Get products for this kit
    products = await db.koop_products.find({
        "kit_id": kit_id,
        "is_active": True
    }).to_list(100)
    
    products_list = []
    for p in products:
        products_list.append({
            "id": str(p["_id"]),
            "name": p["name"],
            "description": p.get("description"),
            "price": p["price"],
            "image_url": p.get("image_url"),
            "has_sizes": p.get("has_sizes", False),
            "size_type": p.get("size_type", "none"),
            "sizes_stock": p.get("sizes_stock", []),
            "total_stock": p.get("total_stock", 0),
            "is_active": p.get("is_active", True)
        })
    
    total_price = sum(p["price"] for p in products_list)
    
    return {
        "id": str(kit["_id"]),
        "name": kit["name"],
        "description": kit.get("description"),
        "image_url": kit.get("image_url"),
        "is_active": kit.get("is_active", True),
        "products": products_list,
        "product_count": len(products_list),
        "total_price": total_price,
        "created_at": kit["created_at"].isoformat() if kit.get("created_at") else None
    }


@router.put("/kits/{kit_id}", response_model=dict)
async def update_kit(kit_id: str, kit: KoopKitUpdate, db=None, current_user=None):
    """Update kit - Admin only"""
    if current_user["role"] not in ["superadmin", "admin", "koop_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    update_data = {k: v for k, v in kit.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    result = await db.koop_kits.update_one(
        {"_id": ObjectId(kit_id)},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kit tidak dijumpai")
    
    return {"message": "Kit berjaya dikemaskini"}


@router.delete("/kits/{kit_id}", response_model=dict)
async def delete_kit(kit_id: str, db=None, current_user=None):
    """Delete kit (soft delete) - Admin only"""
    if current_user["role"] not in ["superadmin", "admin", "koop_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Soft delete - just deactivate
    result = await db.koop_kits.update_one(
        {"_id": ObjectId(kit_id)},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kit tidak dijumpai")
    
    return {"message": "Kit berjaya dipadam"}


# ==================== PRODUCT MANAGEMENT (Admin) ====================

# Product categories are now fetched from database via /api/categories/koperasi/flat
# Legacy mapping kept for backward compatibility
PRODUCT_CATEGORIES = {
    "merchandise": "Barangan Rasmi (Merchandise)",  # Commission to PUM
    "uniform": "Pakaian Seragam",
    "books": "Buku & Alat Tulis",
    "sports": "Peralatan Sukan",
    "accessories": "Aksesori",
    "food": "Makanan & Minuman",
    "others": "Lain-lain"
}

@router.get("/categories", response_model=dict)
async def get_product_categories(db=None, current_user=None):
    """Get available product categories from database with fallback to legacy"""
    # Try to get from database first
    db_categories = await db.product_categories.find({
        "is_active": True,
        "scope": {"$in": ["shared", "koperasi_only"]}
    }).sort("sort_order", 1).to_list(100)
    
    if db_categories:
        categories = {}
        commission_categories = []
        for cat in db_categories:
            categories[cat["code"]] = cat["name"]
            if cat.get("commission_eligible", False):
                commission_categories.append(cat["code"])
        
        return {
            "categories": categories,
            "commission_categories": commission_categories,
            "commission_note": "Hanya kategori bertanda komisyen akan dikenakan komisyen PUM"
        }
    
    # Fallback to legacy static categories
    return {
        "categories": PRODUCT_CATEGORIES,
        "commission_categories": ["merchandise"],
        "commission_note": "Hanya kategori 'Barangan Rasmi (Merchandise)' akan dikenakan komisyen PUM"
    }


@router.post("/products", response_model=dict)
async def create_product(product: KoopProductCreate, db=None, current_user=None):
    """Create a new product under a kit - Admin only"""
    if current_user["role"] not in ["superadmin", "admin", "koop_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Verify kit exists
    kit = await db.koop_kits.find_one({"_id": ObjectId(product.kit_id)})
    if not kit:
        raise HTTPException(status_code=404, detail="Kit tidak dijumpai")
    
    # Prepare sizes_stock
    sizes_stock = None
    if product.has_sizes and product.sizes_stock:
        sizes_stock = [{"size": s.size, "stock": s.stock} for s in product.sizes_stock]
    
    product_doc = {
        "kit_id": product.kit_id,
        "name": product.name,
        "description": product.description,
        "price": product.price,
        "image_url": product.image_url,
        "category": product.category or "others",  # Default to 'others'
        "has_sizes": product.has_sizes,
        "size_type": product.size_type.value if product.size_type else "none",
        "sizes_stock": sizes_stock,
        "total_stock": product.total_stock,
        "is_active": product.is_active,
        "created_at": datetime.now(timezone.utc),
        "created_by": current_user["id"],
        "updated_at": datetime.now(timezone.utc)
    }
    
    result = await db.koop_products.insert_one(product_doc)
    
    return {
        "id": str(result.inserted_id),
        "message": "Produk berjaya dicipta"
    }


@router.get("/products", response_model=List[dict])
async def get_products(
    kit_id: Optional[str] = None,
    include_inactive: bool = False,
    db=None,
    current_user=None
):
    """Get all products, optionally filtered by kit"""
    query = {}
    
    if kit_id:
        query["kit_id"] = kit_id
    
    if not include_inactive or current_user["role"] not in ["superadmin", "admin", "koop_admin"]:
        query["is_active"] = True
    
    products = await db.koop_products.find(query).sort("created_at", -1).to_list(200)
    
    # Get kit names
    kit_ids = list(set(p["kit_id"] for p in products))
    kits = await db.koop_kits.find({"_id": {"$in": [ObjectId(k) for k in kit_ids]}}).to_list(100)
    kit_map = {str(k["_id"]): k["name"] for k in kits}
    
    result = []
    for p in products:
        result.append({
            "id": str(p["_id"]),
            "kit_id": p["kit_id"],
            "kit_name": kit_map.get(p["kit_id"], "Unknown"),
            "name": p["name"],
            "description": p.get("description"),
            "price": p["price"],
            "image_url": p.get("image_url"),
            "images": p.get("images", []),
            "category": p.get("category", "others"),
            "category_display": PRODUCT_CATEGORIES.get(p.get("category", "others"), "Lain-lain"),
            "has_sizes": p.get("has_sizes", False),
            "size_type": p.get("size_type", "none"),
            "sizes_stock": p.get("sizes_stock", []),
            "total_stock": p.get("total_stock", 0),
            "is_active": p.get("is_active", True),
            "created_at": p["created_at"].isoformat() if p.get("created_at") else None
        })
    
    return result


@router.get("/products/{product_id}", response_model=dict)
async def get_product(product_id: str, db=None, current_user=None):
    """Get single product"""
    product = await db.koop_products.find_one({"_id": ObjectId(product_id)})
    if not product:
        raise HTTPException(status_code=404, detail="Produk tidak dijumpai")
    
    # Get kit name
    kit = await db.koop_kits.find_one({"_id": ObjectId(product["kit_id"])})
    kit_name = kit["name"] if kit else "Unknown"
    
    return {
        "id": str(product["_id"]),
        "kit_id": product["kit_id"],
        "kit_name": kit_name,
        "name": product["name"],
        "description": product.get("description"),
        "price": product["price"],
        "image_url": product.get("image_url"),
        "images": product.get("images", []),
        "category": product.get("category", "others"),
        "category_display": PRODUCT_CATEGORIES.get(product.get("category", "others"), "Lain-lain"),
        "has_sizes": product.get("has_sizes", False),
        "size_type": product.get("size_type", "none"),
        "sizes_stock": product.get("sizes_stock", []),
        "total_stock": product.get("total_stock", 0),
        "is_active": product.get("is_active", True),
        "created_at": product["created_at"].isoformat() if product.get("created_at") else None
    }


@router.put("/products/{product_id}", response_model=dict)
async def update_product(product_id: str, product: KoopProductUpdate, db=None, current_user=None):
    """Update product - Admin only"""
    if current_user["role"] not in ["superadmin", "admin", "koop_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    update_data = {}
    for k, v in product.dict().items():
        if v is not None:
            if k == "sizes_stock" and v:
                update_data[k] = [{"size": s.size if hasattr(s, 'size') else s["size"], "stock": s.stock if hasattr(s, 'stock') else s["stock"]} for s in v]
            elif k == "size_type":
                update_data[k] = v.value if hasattr(v, 'value') else v
            else:
                update_data[k] = v
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    result = await db.koop_products.update_one(
        {"_id": ObjectId(product_id)},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Produk tidak dijumpai")
    
    return {"message": "Produk berjaya dikemaskini"}


@router.delete("/products/{product_id}", response_model=dict)
async def delete_product(product_id: str, db=None, current_user=None):
    """Delete product (soft delete) - Admin only"""
    if current_user["role"] not in ["superadmin", "admin", "koop_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    result = await db.koop_products.update_one(
        {"_id": ObjectId(product_id)},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Produk tidak dijumpai")
    
    return {"message": "Produk berjaya dipadam"}


# ==================== SHOPPING CART (Parent) ====================

@router.get("/cart", response_model=dict)
async def get_cart(student_id: str, db=None, current_user=None):
    """Get shopping cart for a specific student"""
    if current_user["role"] != "parent":
        raise HTTPException(status_code=403, detail="Hanya ibu bapa boleh akses")
    
    cart = await db.koop_cart.find_one({
        "user_id": current_user["id"],
        "student_id": student_id
    })
    
    if not cart:
        return {
            "id": None,
            "user_id": current_user["id"],
            "student_id": student_id,
            "student_name": None,
            "items": [],
            "total_amount": 0.0,
            "item_count": 0,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
    
    # Get student name
    student = await db.students.find_one({"_id": ObjectId(student_id)})
    student_name = student.get("full_name") if student else None
    
    items = cart.get("items", [])
    total_amount = sum(item["price"] * item["quantity"] for item in items)
    
    return {
        "id": str(cart["_id"]),
        "user_id": cart["user_id"],
        "student_id": cart["student_id"],
        "student_name": student_name,
        "items": items,
        "total_amount": total_amount,
        "item_count": sum(item["quantity"] for item in items),
        "updated_at": cart.get("updated_at", datetime.now(timezone.utc)).isoformat()
    }


@router.post("/cart/add", response_model=dict)
async def add_to_cart(request: AddToCartRequest, db=None, current_user=None):
    """Add item to cart"""
    if current_user["role"] != "parent":
        raise HTTPException(status_code=403, detail="Hanya ibu bapa boleh akses")
    
    # Verify student belongs to parent (handle both string and ObjectId parent_id)
    student = await db.students.find_one({
        "_id": ObjectId(request.student_id),
        "$or": [
            {"parent_id": current_user["id"]},
            {"parent_id": ObjectId(current_user["id"])}
        ]
    })
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    
    # Get product
    product = await db.koop_products.find_one({
        "_id": ObjectId(request.product_id),
        "is_active": True
    })
    if not product:
        raise HTTPException(status_code=404, detail="Produk tidak dijumpai")
    
    # Check stock
    if product.get("has_sizes"):
        if not request.size:
            raise HTTPException(status_code=400, detail="Sila pilih saiz")
        size_stock = next((s for s in product.get("sizes_stock", []) if s["size"] == request.size), None)
        if not size_stock or size_stock["stock"] < request.quantity:
            raise HTTPException(status_code=400, detail="Stok tidak mencukupi")
    else:
        if product.get("total_stock", 0) < request.quantity:
            raise HTTPException(status_code=400, detail="Stok tidak mencukupi")
    
    # Get kit name
    kit = await db.koop_kits.find_one({"_id": ObjectId(product["kit_id"])})
    kit_name = kit["name"] if kit else "Unknown"
    
    # Find or create cart
    cart = await db.koop_cart.find_one({
        "user_id": current_user["id"],
        "student_id": request.student_id
    })
    
    cart_item = {
        "product_id": request.product_id,
        "product_name": product["name"],
        "kit_name": kit_name,
        "quantity": request.quantity,
        "size": request.size if request.size else None,
        "price": product["price"],
        "image_url": product.get("image_url")
    }
    
    if cart:
        # Check if item already in cart
        items = cart.get("items", [])
        existing_idx = None
        for idx, item in enumerate(items):
            if item["product_id"] == request.product_id and item.get("size") == cart_item.get("size"):
                existing_idx = idx
                break
        
        if existing_idx is not None:
            # Update quantity
            items[existing_idx]["quantity"] += request.quantity
        else:
            items.append(cart_item)
        
        await db.koop_cart.update_one(
            {"_id": cart["_id"]},
            {"$set": {"items": items, "updated_at": datetime.now(timezone.utc)}}
        )
    else:
        # Create new cart
        await db.koop_cart.insert_one({
            "user_id": current_user["id"],
            "student_id": request.student_id,
            "items": [cart_item],
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        })
    
    return {"message": "Produk ditambah ke troli"}


@router.post("/cart/add-kit", response_model=dict)
async def add_kit_to_cart(kit_id: str, student_id: str, db=None, current_user=None):
    """Add entire kit to cart - adds all products in the kit (without size selection)
    Use /cart/add-kit-with-sizes for size selection"""
    if current_user["role"] != "parent":
        raise HTTPException(status_code=403, detail="Hanya ibu bapa boleh akses")
    
    # Verify student belongs to parent
    student = await db.students.find_one({
        "_id": ObjectId(student_id),
        "$or": [
            {"parent_id": current_user["id"]},
            {"parent_id": ObjectId(current_user["id"])}
        ]
    })
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    
    # Get kit
    kit = await db.koop_kits.find_one({"_id": ObjectId(kit_id), "is_active": True})
    if not kit:
        raise HTTPException(status_code=404, detail="Kit tidak dijumpai")
    
    # Get all products in the kit
    products = await db.koop_products.find({
        "kit_id": kit_id,
        "is_active": True
    }).to_list(100)
    
    if not products:
        raise HTTPException(status_code=400, detail="Kit tidak mempunyai produk")
    
    # Check if any product has sizes - return info to frontend to show size selection
    products_with_sizes = [p for p in products if p.get("has_sizes")]
    if products_with_sizes:
        return {
            "requires_size_selection": True,
            "message": "Sila pilih saiz untuk barangan",
            "products_requiring_sizes": [
                {
                    "id": str(p["_id"]),
                    "name": p["name"],
                    "size_type": p.get("size_type", "clothing"),
                    "sizes_stock": p.get("sizes_stock", [])
                }
                for p in products_with_sizes
            ]
        }
    
    # No sizes needed - add all to cart directly
    cart = await db.koop_cart.find_one({
        "user_id": current_user["id"],
        "student_id": student_id
    })
    
    cart_items = []
    for product in products:
        cart_item = {
            "product_id": str(product["_id"]),
            "product_name": product["name"],
            "kit_id": kit_id,
            "kit_name": kit["name"],
            "quantity": 1,
            "size": None,
            "price": product["price"],
            "image_url": product.get("image_url")
        }
        cart_items.append(cart_item)
    
    if cart:
        existing_items = cart.get("items", [])
        
        for new_item in cart_items:
            found = False
            for idx, existing in enumerate(existing_items):
                if existing["product_id"] == new_item["product_id"] and existing.get("size") == new_item.get("size"):
                    existing_items[idx]["quantity"] += 1
                    found = True
                    break
            if not found:
                existing_items.append(new_item)
        
        await db.koop_cart.update_one(
            {"_id": cart["_id"]},
            {"$set": {"items": existing_items, "updated_at": datetime.now(timezone.utc)}}
        )
    else:
        await db.koop_cart.insert_one({
            "user_id": current_user["id"],
            "student_id": student_id,
            "items": cart_items,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        })
    
    return {"message": f"Kit '{kit['name']}' ditambah ke troli", "items_added": len(cart_items)}


@router.post("/cart/add-kit-with-sizes", response_model=dict)
async def add_kit_to_cart_with_sizes(request: AddKitToCartRequest, db=None, current_user=None):
    """Add entire kit to cart WITH size selections - E-commerce style"""
    if current_user["role"] != "parent":
        raise HTTPException(status_code=403, detail="Hanya ibu bapa boleh akses")
    
    # Verify student belongs to parent
    student = await db.students.find_one({
        "_id": ObjectId(request.student_id),
        "$or": [
            {"parent_id": current_user["id"]},
            {"parent_id": ObjectId(current_user["id"])}
        ]
    })
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    
    # Get kit
    kit = await db.koop_kits.find_one({"_id": ObjectId(request.kit_id), "is_active": True})
    if not kit:
        raise HTTPException(status_code=404, detail="Kit tidak dijumpai")
    
    # Get all products in the kit
    products = await db.koop_products.find({
        "kit_id": request.kit_id,
        "is_active": True
    }).to_list(100)
    
    if not products:
        raise HTTPException(status_code=400, detail="Kit tidak mempunyai produk")
    
    # Create a map of size selections
    size_map = {sel["product_id"]: sel["size"] for sel in request.size_selections}
    
    # Validate size selections and stock
    for product in products:
        if product.get("has_sizes"):
            product_id = str(product["_id"])
            selected_size = size_map.get(product_id)
            
            if not selected_size:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Sila pilih saiz untuk '{product['name']}'"
                )
            
            # Check stock for selected size
            size_stock = next(
                (s for s in product.get("sizes_stock", []) if s["size"] == selected_size), 
                None
            )
            if not size_stock or size_stock["stock"] < 1:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Stok saiz {selected_size} tidak mencukupi untuk '{product['name']}'"
                )
        else:
            # Check total stock
            if product.get("total_stock", 0) < 1:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Stok tidak mencukupi untuk '{product['name']}'"
                )
    
    # Find or create cart
    cart = await db.koop_cart.find_one({
        "user_id": current_user["id"],
        "student_id": request.student_id
    })
    
    # Prepare cart items for all products
    cart_items = []
    for product in products:
        product_id = str(product["_id"])
        size = size_map.get(product_id) if product.get("has_sizes") else None
        
        cart_item = {
            "product_id": product_id,
            "product_name": product["name"],
            "kit_id": request.kit_id,
            "kit_name": kit["name"],
            "quantity": 1,
            "size": size,
            "price": product["price"],
            "image_url": product.get("image_url")
        }
        cart_items.append(cart_item)
    
    if cart:
        existing_items = cart.get("items", [])
        
        # Add new items, updating quantity if already exists
        for new_item in cart_items:
            found = False
            for idx, existing in enumerate(existing_items):
                if existing["product_id"] == new_item["product_id"] and existing.get("size") == new_item.get("size"):
                    existing_items[idx]["quantity"] += 1
                    found = True
                    break
            if not found:
                existing_items.append(new_item)
        
        await db.koop_cart.update_one(
            {"_id": cart["_id"]},
            {"$set": {"items": existing_items, "updated_at": datetime.now(timezone.utc)}}
        )
    else:
        await db.koop_cart.insert_one({
            "user_id": current_user["id"],
            "student_id": request.student_id,
            "items": cart_items,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        })
    
    return {"message": f"Kit '{kit['name']}' ditambah ke troli", "items_added": len(cart_items)}


@router.put("/cart/update", response_model=dict)
async def update_cart_item(
    student_id: str,
    product_id: str,
    quantity: int,
    size: Optional[str] = None,
    db=None,
    current_user=None
):
    """Update cart item quantity"""
    if current_user["role"] != "parent":
        raise HTTPException(status_code=403, detail="Hanya ibu bapa boleh akses")
    
    cart = await db.koop_cart.find_one({
        "user_id": current_user["id"],
        "student_id": student_id
    })
    
    if not cart:
        raise HTTPException(status_code=404, detail="Troli tidak dijumpai")
    
    items = cart.get("items", [])
    updated = False
    
    for idx, item in enumerate(items):
        if item["product_id"] == product_id and item.get("size") == size:
            if quantity <= 0:
                items.pop(idx)
            else:
                items[idx]["quantity"] = quantity
            updated = True
            break
    
    if not updated:
        raise HTTPException(status_code=404, detail="Item tidak dijumpai dalam troli")
    
    await db.koop_cart.update_one(
        {"_id": cart["_id"]},
        {"$set": {"items": items, "updated_at": datetime.now(timezone.utc)}}
    )
    
    return {"message": "Troli dikemaskini"}


@router.delete("/cart/remove", response_model=dict)
async def remove_from_cart(
    student_id: str,
    product_id: str,
    size: Optional[str] = None,
    db=None,
    current_user=None
):
    """Remove item from cart"""
    if current_user["role"] != "parent":
        raise HTTPException(status_code=403, detail="Hanya ibu bapa boleh akses")
    
    cart = await db.koop_cart.find_one({
        "user_id": current_user["id"],
        "student_id": student_id
    })
    
    if not cart:
        raise HTTPException(status_code=404, detail="Troli tidak dijumpai")
    
    items = [
        item for item in cart.get("items", [])
        if not (item["product_id"] == product_id and item.get("size") == size)
    ]
    
    await db.koop_cart.update_one(
        {"_id": cart["_id"]},
        {"$set": {"items": items, "updated_at": datetime.now(timezone.utc)}}
    )
    
    return {"message": "Item dibuang dari troli"}


@router.delete("/cart/clear", response_model=dict)
async def clear_cart(student_id: str, db=None, current_user=None):
    """Clear all items from cart"""
    if current_user["role"] != "parent":
        raise HTTPException(status_code=403, detail="Hanya ibu bapa boleh akses")
    
    await db.koop_cart.delete_one({
        "user_id": current_user["id"],
        "student_id": student_id
    })
    
    return {"message": "Troli dikosongkan"}


# ==================== HELPER: COMMISSION CALCULATION ====================

# Legacy category for backward compatibility
MERCHANDISE_CATEGORY = "merchandise"  # Barangan Rasmi (Merchandise)

async def get_pum_commission_rate(db) -> float:
    """Get current PUM commission rate from settings"""
    settings = await db.koperasi_settings.find_one({"type": "commission"})
    if settings:
        return settings.get("pum_commission_rate", 10.0)
    return 10.0  # Default 10%


async def get_commission_eligible_categories(db) -> list:
    """Get list of category codes that are eligible for PUM commission"""
    categories = await db.product_categories.find({
        "is_active": True,
        "commission_eligible": True
    }).to_list(100)
    
    if categories:
        return [cat["code"] for cat in categories]
    
    # Fallback to legacy merchandise category
    return [MERCHANDISE_CATEGORY]


async def calculate_merchandise_commission(db, items: list) -> dict:
    """
    Calculate PUM commission for eligible category items
    Returns commission breakdown
    """
    commission_rate = await get_pum_commission_rate(db)
    eligible_categories = await get_commission_eligible_categories(db)
    
    commission_total = 0
    non_commission_total = 0
    
    for item in items:
        item_total = item["price"] * item["quantity"]
        # Check if item category is commission eligible
        if item.get("category") in eligible_categories:
            commission_total += item_total
        else:
            non_commission_total += item_total
    
    # Commission only applies to eligible items
    commission_amount = commission_total * (commission_rate / 100)
    total_amount = commission_total + non_commission_total
    net_amount = total_amount - commission_amount
    
    return {
        "total_amount": round(total_amount, 2),
        "commission_total": round(commission_total, 2),
        "non_commission_total": round(non_commission_total, 2),
        "commission_rate": commission_rate,
        "commission_amount": round(commission_amount, 2),
        "net_amount": round(net_amount, 2),
        "eligible_categories": eligible_categories
    }


# ==================== ORDERS ====================

@router.post("/orders", response_model=dict)
async def create_order(order: KoopOrderCreate, db=None, current_user=None):
    """Create order from cart (checkout) with PUM commission for Barangan Rasmi only"""
    if current_user["role"] != "parent":
        raise HTTPException(status_code=403, detail="Hanya ibu bapa boleh akses")
    
    # Get cart
    cart = await db.koop_cart.find_one({
        "user_id": current_user["id"],
        "student_id": order.student_id
    })
    
    if not cart or not cart.get("items"):
        raise HTTPException(status_code=400, detail="Troli kosong")
    
    items = cart["items"]
    
    # Enrich items with product category for commission calculation
    enriched_items = []
    for item in items:
        product = await db.koop_products.find_one({"_id": ObjectId(item["product_id"])})
        enriched_item = {**item}
        if product:
            enriched_item["category"] = product.get("category", "")
        enriched_items.append(enriched_item)
    
    # Calculate commission (only for merchandise/barangan rasmi category)
    commission_data = await calculate_merchandise_commission(db, enriched_items)
    
    # Get student name
    student = await db.students.find_one({"_id": ObjectId(order.student_id)})
    student_name = student.get("full_name") if student else None
    
    # Create order with commission info
    order_doc = {
        "order_number": generate_order_number(),
        "user_id": current_user["id"],
        "student_id": order.student_id,
        "student_name": student_name,
        "items": enriched_items,
        "total_amount": commission_data["total_amount"],
        "merchandise_total": commission_data["merchandise_total"],
        "non_merchandise_total": commission_data["non_merchandise_total"],
        "commission_rate": commission_data["commission_rate"],
        "commission_amount": commission_data["commission_amount"],
        "net_amount": commission_data["net_amount"],
        "commission_paid": False,
        "status": OrderStatus.PENDING.value,
        "payment_method": order.payment_method,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    
    result = await db.koop_orders.insert_one(order_doc)
    
    # Clear cart after order
    await db.koop_cart.delete_one({"_id": cart["_id"]})
    
    # Deduct stock
    for item in enriched_items:
        product = await db.koop_products.find_one({"_id": ObjectId(item["product_id"])})
        if product:
            if product.get("has_sizes") and item.get("size"):
                sizes_stock = product.get("sizes_stock", [])
                for ss in sizes_stock:
                    if ss["size"] == item["size"]:
                        ss["stock"] = max(0, ss["stock"] - item["quantity"])
                await db.koop_products.update_one(
                    {"_id": product["_id"]},
                    {"$set": {"sizes_stock": sizes_stock}}
                )
            else:
                await db.koop_products.update_one(
                    {"_id": product["_id"]},
                    {"$inc": {"total_stock": -item["quantity"]}}
                )
    
    return {
        "id": str(result.inserted_id),
        "order_number": order_doc["order_number"],
        "total_amount": commission_data["total_amount"],
        "merchandise_total": commission_data["merchandise_total"],
        "commission_rate": commission_data["commission_rate"],
        "commission_amount": commission_data["commission_amount"],
        "net_amount": commission_data["net_amount"],
        "message": "Pesanan berjaya dibuat"
    }


@router.get("/orders", response_model=List[dict])
async def get_orders(
    status: Optional[str] = None,
    db=None,
    current_user=None
):
    """Get orders - Parents see their own, Admins see all"""
    query = {}
    
    if current_user["role"] == "parent":
        query["user_id"] = current_user["id"]
    elif current_user["role"] not in ["superadmin", "admin", "koop_admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    if status:
        query["status"] = status
    
    orders = await db.koop_orders.find(query).sort("created_at", -1).to_list(100)
    
    result = []
    for o in orders:
        result.append({
            "id": str(o["_id"]),
            "order_number": o["order_number"],
            "user_id": o["user_id"],
            "student_id": o["student_id"],
            "student_name": o.get("student_name"),
            "items": o["items"],
            "total_amount": o["total_amount"],
            "commission_rate": o.get("commission_rate", 10),
            "commission_amount": o.get("commission_amount", 0),
            "net_amount": o.get("net_amount", o["total_amount"]),
            "commission_paid": o.get("commission_paid", False),
            "status": o["status"],
            "payment_method": o.get("payment_method", "fpx"),
            "created_at": o["created_at"].isoformat(),
            "updated_at": o.get("updated_at", o["created_at"]).isoformat()
        })
    
    return result


@router.get("/orders/{order_id}", response_model=dict)
async def get_order(order_id: str, db=None, current_user=None):
    """Get single order"""
    order = await db.koop_orders.find_one({"_id": ObjectId(order_id)})
    
    if not order:
        raise HTTPException(status_code=404, detail="Pesanan tidak dijumpai")
    
    # Check access
    if current_user["role"] == "parent" and order["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    return {
        "id": str(order["_id"]),
        "order_number": order["order_number"],
        "user_id": order["user_id"],
        "student_id": order["student_id"],
        "student_name": order.get("student_name"),
        "items": order["items"],
        "total_amount": order["total_amount"],
        "commission_rate": order.get("commission_rate", 10),
        "commission_amount": order.get("commission_amount", 0),
        "net_amount": order.get("net_amount", order["total_amount"]),
        "commission_paid": order.get("commission_paid", False),
        "status": order["status"],
        "payment_method": order.get("payment_method", "fpx"),
        "created_at": order["created_at"].isoformat(),
        "updated_at": order.get("updated_at", order["created_at"]).isoformat()
    }


@router.put("/orders/{order_id}/status", response_model=dict)
async def update_order_status(
    order_id: str,
    status: str,
    db=None,
    current_user=None
):
    """Update order status - Admin only"""
    if current_user["role"] not in ["superadmin", "admin", "koop_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Validate status
    valid_statuses = [s.value for s in OrderStatus]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status tidak sah. Pilihan: {valid_statuses}")
    
    result = await db.koop_orders.update_one(
        {"_id": ObjectId(order_id)},
        {"$set": {"status": status, "updated_at": datetime.now(timezone.utc)}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pesanan tidak dijumpai")
    
    return {"message": f"Status pesanan dikemaskini ke '{status}'"}


# ==================== DASHBOARD STATS ====================

@router.get("/admin/stats", response_model=dict)
async def get_koperasi_stats(db=None, current_user=None):
    """Get dashboard statistics for Koperasi admin (bendahari boleh lihat)"""
    if current_user["role"] not in ["superadmin", "admin", "koop_admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Count kits
    total_kits = await db.koop_kits.count_documents({"is_active": True})
    
    # Count products
    total_products = await db.koop_products.count_documents({"is_active": True})
    
    # Count orders by status
    pending_orders = await db.koop_orders.count_documents({"status": "pending"})
    total_orders = await db.koop_orders.count_documents({})
    
    # Calculate total revenue
    orders = await db.koop_orders.find({"status": {"$in": ["paid", "processing", "ready", "collected"]}}).to_list(1000)
    total_revenue = sum(o.get("total_amount", 0) for o in orders)
    
    return {
        "total_kits": total_kits,
        "total_products": total_products,
        "pending_orders": pending_orders,
        "total_orders": total_orders,
        "total_revenue": total_revenue
    }


# ==================== LAPORAN DETAIL KOPERASI ====================

@router.get("/laporan-detail", response_model=dict)
async def get_laporan_detail(
    year: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit_orders: int = 100,
    db=None,
    current_user=None
):
    """
    Laporan koperasi secara detail (termasuk PUM).
    Returns: ringkasan (gabungan + koperasi + pum), by_month, by_kit, by_status, pesanan_terkini, inventori.
    """
    if current_user["role"] not in ["superadmin", "admin", "koop_admin", "bendahari", "sub_bendahari"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")

    from datetime import timezone as tz
    now = datetime.now(tz.utc)
    if year is None:
        year = now.year
    date_query_koop = {}
    date_query_pum = {}
    if start_date:
        try:
            dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            date_query_koop["created_at"] = {"$gte": dt}
            date_query_pum["created_at"] = {"$gte": dt}
        except Exception:
            pass
    if end_date:
        try:
            dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            if "created_at" in date_query_koop:
                date_query_koop["created_at"]["$lte"] = dt
                date_query_pum["created_at"]["$lte"] = dt
            else:
                date_query_koop["created_at"] = {"$lte": dt}
                date_query_pum["created_at"] = {"$lte": dt}
        except Exception:
            pass
    if not date_query_koop and not date_query_pum:
        start_dt = datetime(year, 1, 1, tzinfo=tz.utc)
        end_dt = datetime(year, 12, 31, 23, 59, 59, tzinfo=tz.utc)
        date_query_koop["created_at"] = {"$gte": start_dt, "$lte": end_dt}
        date_query_pum["created_at"] = {"$gte": start_dt, "$lte": end_dt}

    # Koperasi orders (paid/processing/ready/collected)
    koop_match = {**date_query_koop, "status": {"$in": ["paid", "processing", "ready", "collected"]}}
    koop_orders = await db.koop_orders.find(koop_match).sort("created_at", -1).to_list(5000)
    koop_total_sales = sum(o.get("total_amount", 0) for o in koop_orders)
    koop_by_status = {}
    for o in koop_orders:
        s = o.get("status", "unknown")
        if s not in koop_by_status:
            koop_by_status[s] = {"count": 0, "amount": 0}
        koop_by_status[s]["count"] += 1
        koop_by_status[s]["amount"] = round(koop_by_status[s]["amount"] + o.get("total_amount", 0), 2)

    # PUM orders (if collection exists)
    pum_total_sales = 0
    pum_orders = []
    pum_by_status = {}
    if hasattr(db, "pum_orders"):
        pum_orders_cursor = db.pum_orders.find(date_query_pum).sort("created_at", -1).limit(500)
        pum_orders = await pum_orders_cursor.to_list(500)
        for o in pum_orders:
            if o.get("status") in ["paid", "processing", "shipped", "delivered"]:
                pum_total_sales += o.get("total_amount", 0)
            s = o.get("status", "unknown")
            if s not in pum_by_status:
                pum_by_status[s] = {"count": 0, "amount": 0}
            pum_by_status[s]["count"] += 1
            pum_by_status[s]["amount"] = round(pum_by_status[s]["amount"] + o.get("total_amount", 0), 2)

    # By month (koperasi)
    by_month = {}
    for o in koop_orders:
        cr = o.get("created_at")
        if cr:
            key = cr.strftime("%Y-%m") if hasattr(cr, "strftime") else str(cr)[:7]
            if key not in by_month:
                by_month[key] = {"bulan": key, "koperasi_jualan": 0, "koperasi_pesanan": 0, "pum_jualan": 0, "pum_pesanan": 0}
            by_month[key]["koperasi_jualan"] = round(by_month[key]["koperasi_jualan"] + o.get("total_amount", 0), 2)
            by_month[key]["koperasi_pesanan"] += 1
    for o in pum_orders:
        if o.get("status") not in ["paid", "processing", "shipped", "delivered"]:
            continue
        cr = o.get("created_at")
        if cr:
            key = cr.strftime("%Y-%m") if hasattr(cr, "strftime") else str(cr)[:7]
            if key not in by_month:
                by_month[key] = {"bulan": key, "koperasi_jualan": 0, "koperasi_pesanan": 0, "pum_jualan": 0, "pum_pesanan": 0}
            by_month[key]["pum_jualan"] = round(by_month[key]["pum_jualan"] + o.get("total_amount", 0), 2)
            by_month[key]["pum_pesanan"] += 1
    for v in by_month.values():
        v["jumlah_jualan"] = round(v["koperasi_jualan"] + v["pum_jualan"], 2)
        v["jumlah_pesanan"] = v["koperasi_pesanan"] + v["pum_pesanan"]
    by_month_list = sorted(by_month.values(), key=lambda x: x["bulan"], reverse=True)

    # By kit (from koperasi order items)
    by_kit = {}
    for o in koop_orders:
        kits_in_order = set()
        for item in o.get("items", []):
            kit_name = item.get("kit_name") or "Lain-lain"
            kits_in_order.add(kit_name)
            if kit_name not in by_kit:
                by_kit[kit_name] = {"kit_name": kit_name, "jumlah_jualan": 0, "bilangan_pesanan": 0, "quantity": 0}
            amt = item.get("price", 0) * item.get("quantity", 0)
            by_kit[kit_name]["jumlah_jualan"] = round(by_kit[kit_name]["jumlah_jualan"] + amt, 2)
            by_kit[kit_name]["quantity"] += item.get("quantity", 0)
        for k in kits_in_order:
            by_kit[k]["bilangan_pesanan"] += 1
    by_kit_list = sorted(by_kit.values(), key=lambda x: x["jumlah_jualan"], reverse=True)

    # Pesanan terkini (gabungan)
    pesanan_terkini = []
    for o in koop_orders[:limit_orders]:
        pesanan_terkini.append({
            "sumber": "Koperasi",
            "order_number": o.get("order_number"),
            "student_name": o.get("student_name"),
            "total_amount": round(o.get("total_amount", 0), 2),
            "status": o.get("status"),
            "created_at": o.get("created_at").isoformat() if o.get("created_at") else None
        })
    for o in pum_orders[: max(0, limit_orders - len(pesanan_terkini))]:
        pesanan_terkini.append({
            "sumber": "PUM",
            "order_number": o.get("order_number"),
            "student_name": o.get("student_name"),
            "total_amount": round(o.get("total_amount", 0), 2),
            "status": o.get("status"),
            "created_at": o.get("created_at").isoformat() if o.get("created_at") else None
        })
    pesanan_terkini.sort(key=lambda x: (x["created_at"] or ""), reverse=True)
    pesanan_terkini = pesanan_terkini[:limit_orders]

    # Inventori PUM (if exists)
    inventori_pum = {"nilai_stok": 0, "bilangan_item": 0}
    if hasattr(db, "pum_products"):
        agg = await db.pum_products.aggregate([
            {"$match": {"is_active": True}},
            {"$group": {"_id": None, "total_stock_value": {"$sum": {"$multiply": ["$price", "$stock"]}}, "total_items": {"$sum": "$stock"}}}
        ]).to_list(1)
        if agg:
            inventori_pum["nilai_stok"] = round(agg[0].get("total_stock_value", 0), 2)
            inventori_pum["bilangan_item"] = agg[0].get("total_items", 0)

    return {
        "tahun": year,
        "start_date": start_date,
        "end_date": end_date,
        "generated_at": now.isoformat(),
        "ringkasan": {
            "gabungan": {
                "jumlah_jualan": round(koop_total_sales + pum_total_sales, 2),
                "jumlah_pesanan": len(koop_orders) + len([x for x in pum_orders if x.get("status") in ["paid", "processing", "shipped", "delivered"]])
            },
            "koperasi": {
                "jumlah_jualan": round(koop_total_sales, 2),
                "jumlah_pesanan": len(koop_orders),
                "by_status": koop_by_status
            },
            "pum": {
                "jumlah_jualan": round(pum_total_sales, 2),
                "jumlah_pesanan": len([x for x in pum_orders if x.get("status") in ["paid", "processing", "shipped", "delivered"]]),
                "by_status": pum_by_status
            }
        },
        "by_month": by_month_list,
        "by_kit": by_kit_list,
        "pesanan_terkini": pesanan_terkini,
        "inventori_pum": inventori_pum
    }
