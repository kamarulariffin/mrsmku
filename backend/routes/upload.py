"""
File Upload Module - API Routes
For handling product image uploads with compression
Max 10 images per product, max 3MB per file
Supports: jpg, png, webp
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Any, List, Optional
from datetime import datetime, timezone
from bson import ObjectId
from services.id_normalizer import object_id_or_none
import os
import uuid
import base64
from PIL import Image
import io

router = APIRouter(prefix="/api/upload", tags=["Upload"])
security = HTTPBearer()

# Will be set from server.py
_get_db_func = None
_get_current_user_func = None
_log_audit_func = None

# Constants
MAX_FILE_SIZE = 3 * 1024 * 1024  # 3MB
MAX_IMAGES_PER_PRODUCT = 10
ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp'}
# Use project-relative path (backend/uploads); override with env UPLOAD_DIR if set (e.g. in Docker)
UPLOAD_DIR = os.environ.get(
    "UPLOAD_DIR",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads"))
)
COMPRESS_QUALITY = 85  # JPEG quality for compression


def _ensure_upload_dirs():
    """Create upload directories if they don't exist (skip if read-only)."""
    try:
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        os.makedirs(os.path.join(UPLOAD_DIR, "products"), exist_ok=True)
        os.makedirs(os.path.join(UPLOAD_DIR, "editor"), exist_ok=True)
        os.makedirs(os.path.join(UPLOAD_DIR, "bus"), exist_ok=True)
        os.makedirs(os.path.join(UPLOAD_DIR, "landing"), exist_ok=True)
        os.makedirs(os.path.join(UPLOAD_DIR, "onboarding"), exist_ok=True)
        os.makedirs(os.path.join(UPLOAD_DIR, "app_icon"), exist_ok=True)
    except OSError:
        pass  # e.g. read-only filesystem; routes will fail at upload time


_ensure_upload_dirs()


def init_router(get_db_func, current_user_dep, permission_dep, audit_func):
    global _get_db_func, _get_current_user_func, _log_audit_func
    _get_db_func = get_db_func
    _get_current_user_func = current_user_dep
    _log_audit_func = audit_func


def get_db():
    return _get_db_func()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    return await _get_current_user_func(credentials)


async def log_audit(user, action, module, details):
    if _log_audit_func:
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


def get_file_extension(filename: str) -> str:
    """Get file extension from filename"""
    if '.' in filename:
        return filename.rsplit('.', 1)[1].lower()
    return ''


def validate_file(file: UploadFile) -> bool:
    """Validate file extension and size"""
    ext = get_file_extension(file.filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400, 
            detail=f"Jenis fail tidak dibenarkan. Hanya: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    return True


def compress_image(image_data: bytes, max_size: tuple = (800, 800), quality: int = COMPRESS_QUALITY) -> bytes:
    """Compress and resize image while maintaining aspect ratio"""
    try:
        img = Image.open(io.BytesIO(image_data))
        
        # Convert RGBA to RGB if necessary (for JPEG)
        if img.mode in ('RGBA', 'P'):
            # Create white background
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[3] if len(img.split()) == 4 else None)
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        
        # Resize if larger than max_size
        img.thumbnail(max_size, Image.Resampling.LANCZOS)
        
        # Save to bytes with compression
        output = io.BytesIO()
        img.save(output, format='JPEG', quality=quality, optimize=True)
        return output.getvalue()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gagal memproses gambar: {str(e)}")


def generate_filename(original_filename: str, product_id: str) -> str:
    """Generate unique filename for uploaded image"""
    unique_id = uuid.uuid4().hex[:8]
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    return f"{product_id}_{timestamp}_{unique_id}.jpg"  # Always save as jpg after compression


# ==================== PRODUCT IMAGE UPLOAD ====================

@router.post("/product-image", response_model=dict)
async def upload_product_image(
    file: UploadFile = File(...),
    product_id: str = Form(...),
    product_type: str = Form(...),  # 'koperasi' or 'pum'
    user: dict = Depends(get_current_user)
):
    """
    Upload single product image with compression
    - Max file size: 3MB
    - Allowed types: jpg, png, webp
    - Auto compress to JPEG
    """
    db = get_db()
    
    # Check admin permission
    if user["role"] not in ["superadmin", "admin", "koop_admin", "pum_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Validate file
    validate_file(file)
    
    # Read file content
    content = await file.read()
    
    # Check file size
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Saiz fail melebihi had 3MB")
    
    # Get existing product images count
    collection = "koop_products" if product_type == "koperasi" else "pum_products"
    product = await db[collection].find_one({"_id": _id_value(product_id)})
    
    if not product:
        raise HTTPException(status_code=404, detail="Produk tidak dijumpai")
    
    existing_images = product.get("images", [])
    if len(existing_images) >= MAX_IMAGES_PER_PRODUCT:
        raise HTTPException(
            status_code=400, 
            detail=f"Maksimum {MAX_IMAGES_PER_PRODUCT} gambar untuk setiap produk"
        )
    
    # Compress image
    compressed = compress_image(content)
    
    # Generate filename
    filename = generate_filename(file.filename, product_id)
    filepath = f"{UPLOAD_DIR}/products/{filename}"
    
    # Save file
    with open(filepath, "wb") as f:
        f.write(compressed)
    
    # Generate URL (relative path that will be served by backend)
    image_url = f"/api/upload/images/products/{filename}"
    
    # Add to product images array
    image_doc = {
        "id": uuid.uuid4().hex[:12],
        "url": image_url,
        "filename": filename,
        "original_name": file.filename,
        "size": len(compressed),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "uploaded_by": str(user["_id"])
    }
    
    await db[collection].update_one(
        {"_id": _id_value(product_id)},
        {
            "$push": {"images": image_doc},
            "$set": {"updated_at": datetime.now(timezone.utc)}
        }
    )
    
    # Set as primary image if first image
    if len(existing_images) == 0:
        await db[collection].update_one(
            {"_id": _id_value(product_id)},
            {"$set": {"image_url": image_url}}
        )
    
    await log_audit(user, "UPLOAD_PRODUCT_IMAGE", product_type, f"Gambar dimuat naik untuk produk {product_id}")
    
    return {
        "success": True,
        "message": "Gambar berjaya dimuat naik",
        "image": image_doc,
        "total_images": len(existing_images) + 1
    }


@router.post("/product-images-bulk", response_model=dict)
async def upload_product_images_bulk(
    files: List[UploadFile] = File(...),
    product_id: str = Form(...),
    product_type: str = Form(...),
    user: dict = Depends(get_current_user)
):
    """
    Upload multiple product images at once
    - Max 10 images per product total
    - Max 3MB per file
    """
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin", "pum_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    collection = "koop_products" if product_type == "koperasi" else "pum_products"
    product = await db[collection].find_one({"_id": _id_value(product_id)})
    
    if not product:
        raise HTTPException(status_code=404, detail="Produk tidak dijumpai")
    
    existing_images = product.get("images", [])
    available_slots = MAX_IMAGES_PER_PRODUCT - len(existing_images)
    
    if available_slots <= 0:
        raise HTTPException(
            status_code=400,
            detail=f"Produk sudah mempunyai {MAX_IMAGES_PER_PRODUCT} gambar"
        )
    
    if len(files) > available_slots:
        raise HTTPException(
            status_code=400,
            detail=f"Hanya boleh muat naik {available_slots} gambar lagi"
        )
    
    uploaded_images = []
    errors = []
    
    for file in files:
        try:
            validate_file(file)
            content = await file.read()
            
            if len(content) > MAX_FILE_SIZE:
                errors.append(f"{file.filename}: Melebihi had 3MB")
                continue
            
            compressed = compress_image(content)
            filename = generate_filename(file.filename, product_id)
            filepath = f"{UPLOAD_DIR}/products/{filename}"
            
            with open(filepath, "wb") as f:
                f.write(compressed)
            
            image_url = f"/api/upload/images/products/{filename}"
            
            image_doc = {
                "id": uuid.uuid4().hex[:12],
                "url": image_url,
                "filename": filename,
                "original_name": file.filename,
                "size": len(compressed),
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
                "uploaded_by": str(user["_id"])
            }
            
            uploaded_images.append(image_doc)
            
        except HTTPException as e:
            errors.append(f"{file.filename}: {e.detail}")
        except Exception:
            errors.append(f"{file.filename}: Gagal memproses")
    
    if uploaded_images:
        # Update product with all new images
        update_ops = {
            "$push": {"images": {"$each": uploaded_images}},
            "$set": {"updated_at": datetime.now(timezone.utc)}
        }
        
        # Set first image as primary if no existing images
        if len(existing_images) == 0 and uploaded_images:
            update_ops["$set"]["image_url"] = uploaded_images[0]["url"]
        
        await db[collection].update_one(
            {"_id": _id_value(product_id)},
            update_ops
        )
    
    return {
        "success": len(uploaded_images) > 0,
        "message": f"{len(uploaded_images)} gambar berjaya dimuat naik",
        "uploaded": uploaded_images,
        "errors": errors,
        "total_images": len(existing_images) + len(uploaded_images)
    }


@router.delete("/product-image/{product_id}/{image_id}", response_model=dict)
async def delete_product_image(
    product_id: str,
    image_id: str,
    product_type: str = "koperasi",
    user: dict = Depends(get_current_user)
):
    """Delete a product image"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin", "pum_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    collection = "koop_products" if product_type == "koperasi" else "pum_products"
    product = await db[collection].find_one({"_id": _id_value(product_id)})
    
    if not product:
        raise HTTPException(status_code=404, detail="Produk tidak dijumpai")
    
    images = product.get("images", [])
    image_to_delete = next((img for img in images if img["id"] == image_id), None)
    
    if not image_to_delete:
        raise HTTPException(status_code=404, detail="Gambar tidak dijumpai")
    
    # Delete file from disk
    try:
        filepath = f"{UPLOAD_DIR}/products/{image_to_delete['filename']}"
        if os.path.exists(filepath):
            os.remove(filepath)
    except Exception:
        pass  # File might already be deleted
    
    # Remove from database
    new_images = [img for img in images if img["id"] != image_id]
    
    update_data = {
        "images": new_images,
        "updated_at": datetime.now(timezone.utc)
    }
    
    # Update primary image if deleted
    if product.get("image_url") == image_to_delete["url"]:
        update_data["image_url"] = new_images[0]["url"] if new_images else None
    
    await db[collection].update_one(
        {"_id": _id_value(product_id)},
        {"$set": update_data}
    )
    
    await log_audit(user, "DELETE_PRODUCT_IMAGE", product_type, f"Gambar dipadam dari produk {product_id}")
    
    return {
        "success": True,
        "message": "Gambar berjaya dipadam",
        "remaining_images": len(new_images)
    }


@router.put("/product-image/{product_id}/reorder", response_model=dict)
async def reorder_product_images(
    product_id: str,
    image_ids: List[str],
    product_type: str = "koperasi",
    user: dict = Depends(get_current_user)
):
    """Reorder product images - first image becomes primary"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin", "pum_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    collection = "koop_products" if product_type == "koperasi" else "pum_products"
    product = await db[collection].find_one({"_id": _id_value(product_id)})
    
    if not product:
        raise HTTPException(status_code=404, detail="Produk tidak dijumpai")
    
    images = product.get("images", [])
    image_map = {img["id"]: img for img in images}
    
    # Reorder images based on provided order
    reordered = []
    for img_id in image_ids:
        if img_id in image_map:
            reordered.append(image_map[img_id])
    
    # Add any images not in the list at the end
    for img in images:
        if img["id"] not in image_ids:
            reordered.append(img)
    
    # Update with new order, first image becomes primary
    update_data = {
        "images": reordered,
        "updated_at": datetime.now(timezone.utc)
    }
    
    if reordered:
        update_data["image_url"] = reordered[0]["url"]
    
    await db[collection].update_one(
        {"_id": _id_value(product_id)},
        {"$set": update_data}
    )
    
    return {
        "success": True,
        "message": "Susunan gambar dikemaskini",
        "images": reordered
    }


@router.put("/product-image/{product_id}/set-primary/{image_id}", response_model=dict)
async def set_primary_image(
    product_id: str,
    image_id: str,
    product_type: str = "koperasi",
    user: dict = Depends(get_current_user)
):
    """Set a specific image as primary product image"""
    db = get_db()
    
    if user["role"] not in ["superadmin", "admin", "koop_admin", "pum_admin"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    collection = "koop_products" if product_type == "koperasi" else "pum_products"
    product = await db[collection].find_one({"_id": _id_value(product_id)})
    
    if not product:
        raise HTTPException(status_code=404, detail="Produk tidak dijumpai")
    
    images = product.get("images", [])
    image = next((img for img in images if img["id"] == image_id), None)
    
    if not image:
        raise HTTPException(status_code=404, detail="Gambar tidak dijumpai")
    
    # Move selected image to front
    reordered = [image] + [img for img in images if img["id"] != image_id]
    
    await db[collection].update_one(
        {"_id": _id_value(product_id)},
        {
            "$set": {
                "images": reordered,
                "image_url": image["url"],
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    return {
        "success": True,
        "message": "Gambar utama dikemaskini",
        "primary_image": image
    }


# ==================== SERVE UPLOADED IMAGES ====================

from fastapi.responses import FileResponse


@router.post("/editor-image", response_model=dict)
async def upload_editor_image(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user)
):
    """
    Upload image from WYSIWYG editor
    - Max file size: 5MB
    - Allowed types: jpg, png, webp, gif
    - Auto compress to JPEG
    """
    # Validate file extension
    ext = get_file_extension(file.filename)
    allowed_editor_ext = {'jpg', 'jpeg', 'png', 'webp', 'gif'}
    if ext not in allowed_editor_ext:
        raise HTTPException(
            status_code=400,
            detail=f"Jenis fail tidak dibenarkan. Hanya: {', '.join(allowed_editor_ext)}"
        )
    
    # Read file content
    content = await file.read()
    
    # Check file size (5MB for editor images)
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Saiz fail melebihi had 5MB")
    
    # Compress image (larger max size for editor images)
    compressed = compress_image(content, max_size=(1200, 1200), quality=85)
    
    # Generate unique filename
    unique_id = uuid.uuid4().hex[:12]
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    filename = f"editor_{timestamp}_{unique_id}.jpg"
    filepath = f"{UPLOAD_DIR}/editor/{filename}"
    
    # Save file
    with open(filepath, "wb") as f:
        f.write(compressed)
    
    # Generate URL
    image_url = f"/api/upload/images/editor/{filename}"
    
    return {
        "success": True,
        "url": image_url,
        "filename": filename,
        "size": len(compressed)
    }


@router.get("/images/editor/{filename}")
async def serve_editor_image(filename: str):
    """Serve uploaded editor images"""
    filepath = f"{UPLOAD_DIR}/editor/{filename}"
    
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Gambar tidak dijumpai")
    
    return FileResponse(
        filepath,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"}
    )


# ==================== BUS DOCUMENT UPLOAD (PDF / IMAGE) ====================

ALLOWED_BUS_DOC_EXT = {'pdf', 'jpg', 'jpeg', 'png', 'webp'}
MAX_BUS_DOC_SIZE = 10 * 1024 * 1024  # 10MB


def _user_can_upload_bus(user: dict) -> bool:
    role = user.get("role") or user.get("roles")
    if isinstance(role, list):
        return bool(set(role) & {"superadmin", "admin", "bus_admin"})
    return role in ("superadmin", "admin", "bus_admin")


@router.post("/bus-document", response_model=dict)
async def upload_bus_document(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user)
):
    """
    Upload dokumen bas (Lesen Operator, Permit, PUSPAKOM, Insurans, Geran).
    Hanya superadmin, admin, bus_admin. Format: PDF atau imej. Max 10MB.
    """
    if not _user_can_upload_bus(user):
        raise HTTPException(status_code=403, detail="Tiada kebenaran untuk muat naik dokumen bas")
    return await _do_upload_bus_document(file)


async def _do_upload_bus_document(file: UploadFile) -> dict:
    """Shared logic for bus document upload (auth checked by caller)."""
    ext = get_file_extension(file.filename)
    if ext not in ALLOWED_BUS_DOC_EXT:
        raise HTTPException(
            status_code=400,
            detail=f"Format tidak disokong. Hanya: {', '.join(ALLOWED_BUS_DOC_EXT)}"
        )
    content = await file.read()
    if len(content) > MAX_BUS_DOC_SIZE:
        raise HTTPException(status_code=400, detail="Saiz fail melebihi 10MB")
    unique_id = uuid.uuid4().hex[:12]
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    safe_name = f"bus_{timestamp}_{unique_id}.{ext}"
    bus_dir = os.path.join(UPLOAD_DIR, "bus")
    os.makedirs(bus_dir, exist_ok=True)
    filepath = os.path.join(bus_dir, safe_name)
    with open(filepath, "wb") as f:
        f.write(content)
    url = f"/api/upload/images/bus/{safe_name}"
    return {"success": True, "url": url, "filename": safe_name}


@router.post("/bus-document-public", response_model=dict)
async def upload_bus_document_public(file: UploadFile = File(...)):
    """
    Muat naik dokumen bas untuk pendaftaran awam (tanpa login).
    Format: PDF atau imej. Max 10MB. Untuk borang daftar syarikat bas sahaja.
    """
    return await _do_upload_bus_document(file)


@router.get("/images/bus/{filename}")
async def serve_bus_document(filename: str):
    """Serve uploaded bus documents (PDF/image)."""
    if ".." in filename or "/" in filename:
        raise HTTPException(status_code=400, detail="Nama fail tidak sah")
    filepath = os.path.join(UPLOAD_DIR, "bus", filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Fail tidak dijumpai")
    ext = get_file_extension(filename)
    media = "application/pdf" if ext == "pdf" else f"image/{ext}" if ext in ("jpg", "jpeg", "png", "webp") else "application/octet-stream"
    return FileResponse(filepath, media_type=media, headers={"Cache-Control": "public, max-age=86400"})


@router.get("/images/products/{filename}")
async def serve_product_image(filename: str):
    """Serve uploaded product images"""
    filepath = f"{UPLOAD_DIR}/products/{filename}"
    
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Gambar tidak dijumpai")
    
    return FileResponse(
        filepath,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"}  # Cache for 24 hours
    )


# ==================== LANDING HERO IMAGE ====================

MAX_LANDING_SIZE = 5 * 1024 * 1024  # 5MB


@router.post("/landing-hero", response_model=dict)
async def upload_landing_hero(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user)
):
    """Upload gambar hero untuk halaman landing. Superadmin/Admin sahaja. Max 5MB."""
    if user.get("role") not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    ext = get_file_extension(file.filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Format tidak disokong. Hanya: {', '.join(ALLOWED_EXTENSIONS)}")
    content = await file.read()
    if len(content) > MAX_LANDING_SIZE:
        raise HTTPException(status_code=400, detail="Saiz fail melebihi 5MB")
    compressed = compress_image(content, max_size=(1600, 1200), quality=88)
    unique_id = uuid.uuid4().hex[:8]
    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    filename = f"landing_hero_{ts}_{unique_id}.jpg"
    landing_dir = os.path.join(UPLOAD_DIR, "landing")
    os.makedirs(landing_dir, exist_ok=True)
    filepath = os.path.join(landing_dir, filename)
    with open(filepath, "wb") as f:
        f.write(compressed)
    url = f"/api/upload/images/landing/{filename}"
    return {"success": True, "url": url, "filename": filename}


def _media_type_for_image(filename: str) -> str:
    ext = (filename or "").lower().split(".")[-1]
    if ext == "png":
        return "image/png"
    if ext == "webp":
        return "image/webp"
    return "image/jpeg"


@router.get("/images/landing/{filename}")
async def serve_landing_image(filename: str):
    """Serve uploaded landing hero images (public)."""
    if ".." in filename or "/" in filename:
        raise HTTPException(status_code=400, detail="Nama fail tidak sah")
    filepath = os.path.join(UPLOAD_DIR, "landing", filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Gambar tidak dijumpai")
    return FileResponse(filepath, media_type=_media_type_for_image(filename), headers={"Cache-Control": "public, max-age=86400"})


# ==================== ONBOARDING SLIDE IMAGE ====================

MAX_ONBOARDING_SIZE = 5 * 1024 * 1024  # 5MB


@router.post("/onboarding-slide", response_model=dict)
async def upload_onboarding_slide(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user)
):
    """Upload gambar untuk slide onboarding. Superadmin/Admin sahaja. Max 5MB."""
    if user.get("role") not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    ext = get_file_extension(file.filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Format tidak disokong. Hanya: {', '.join(ALLOWED_EXTENSIONS)}")
    content = await file.read()
    if len(content) > MAX_ONBOARDING_SIZE:
        raise HTTPException(status_code=400, detail="Saiz fail melebihi 5MB")
    compressed = compress_image(content, max_size=(1200, 900), quality=88)
    unique_id = uuid.uuid4().hex[:8]
    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    filename = f"onboarding_slide_{ts}_{unique_id}.jpg"
    onboarding_dir = os.path.join(UPLOAD_DIR, "onboarding")
    os.makedirs(onboarding_dir, exist_ok=True)
    filepath = os.path.join(onboarding_dir, filename)
    with open(filepath, "wb") as f:
        f.write(compressed)
    url = f"/api/upload/images/onboarding/{filename}"
    return {"success": True, "url": url, "filename": filename}


@router.get("/images/onboarding/{filename}")
async def serve_onboarding_image(filename: str):
    """Serve uploaded onboarding slide images (public)."""
    if ".." in filename or "/" in filename:
        raise HTTPException(status_code=400, detail="Nama fail tidak sah")
    filepath = os.path.join(UPLOAD_DIR, "onboarding", filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Gambar tidak dijumpai")
    return FileResponse(filepath, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


# ==================== APP LOGO / IKON RASMI (Splash & PWA) ====================

MAX_APP_ICON_SIZE = 2 * 1024 * 1024  # 2MB


@router.post("/app-icon", response_model=dict)
async def upload_app_icon(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user)
):
    """Upload logo/ikon rasmi untuk splash & PWA. Superadmin/Admin sahaja. Max 2MB. Satu imej digunakan untuk ikon 512 (dan 192)."""
    if user.get("role") not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    ext = get_file_extension(file.filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Format tidak disokong. Hanya: {', '.join(ALLOWED_EXTENSIONS)}")
    content = await file.read()
    if len(content) > MAX_APP_ICON_SIZE:
        raise HTTPException(status_code=400, detail="Saiz fail melebihi 2MB")
    compressed = compress_image(content, max_size=(512, 512), quality=90)
    unique_id = uuid.uuid4().hex[:8]
    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    filename = f"app_icon_{ts}_{unique_id}.jpg"
    app_icon_dir = os.path.join(UPLOAD_DIR, "app_icon")
    os.makedirs(app_icon_dir, exist_ok=True)
    filepath = os.path.join(app_icon_dir, filename)
    with open(filepath, "wb") as f:
        f.write(compressed)
    url = f"/api/upload/images/app-icon/{filename}"
    return {"success": True, "url": url, "filename": filename}


@router.get("/images/app-icon/{filename}")
async def serve_app_icon(filename: str):
    """Serve uploaded app logo/icon (public)."""
    if ".." in filename or "/" in filename:
        raise HTTPException(status_code=400, detail="Nama fail tidak sah")
    filepath = os.path.join(UPLOAD_DIR, "app_icon", filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Gambar tidak dijumpai")
    media_type = "image/png" if filename.lower().endswith(".png") else "image/jpeg"
    return FileResponse(filepath, media_type=media_type, headers={"Cache-Control": "public, max-age=86400"})
