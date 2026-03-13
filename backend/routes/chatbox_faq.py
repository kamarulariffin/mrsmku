"""
Chatbox FAQ - Module pengurusan FAQ untuk chatbox AI.
Hanya superadmin dan admin boleh mengurus (tambah/edit/padam).
Menyokong lampiran: PDF, gambar (jpg, png, webp, gif).
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone
from bson import ObjectId
from services.id_normalizer import object_id_or_none
import os
import uuid

router = APIRouter(prefix="/api/chatbox", tags=["Chatbox FAQ"])
UPLOAD_DIR = os.environ.get(
    "UPLOAD_DIR",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads"))
)
FAQ_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "chatbox_faq")
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB per file
ALLOWED_EXTENSIONS = {"pdf", "jpg", "jpeg", "png", "webp", "gif"}
MAX_ATTACHMENTS_PER_FAQ = 5

_get_db_func = None
_get_current_user_func = None

security = HTTPBearer(auto_error=True)


def init_router(get_db_func, get_current_user_func):
    global _get_db_func, _get_current_user_func
    _get_db_func = get_db_func
    _get_current_user_func = get_current_user_func


async def _current_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    return await _get_current_user_func(credentials)


def get_db():
    return _get_db_func()


def _id_value(value: object, *, strict: bool = False, error_detail: str = "ID tidak sah"):
    """Normalize ID-like inputs while supporting non-ObjectId IDs."""
    if value is None:
        if strict:
            raise HTTPException(status_code=400, detail=error_detail)
        return None
    if isinstance(value, ObjectId):
        return value
    text = str(value).strip()
    try:
        if ObjectId.is_valid(text):
            return object_id_or_none(text)
    except Exception:
        pass
    if strict:
        raise HTTPException(status_code=400, detail=error_detail)
    return text


try:
    os.makedirs(FAQ_UPLOAD_DIR, exist_ok=True)
except OSError:
    pass


# --- Schemas ---
class AttachmentOut(BaseModel):
    url: str
    filename: str
    original_name: str
    mime_type: str
    size: int


class FAQItemCreate(BaseModel):
    question: str = Field(..., min_length=1)
    answer: str = Field(default="")
    order: int = Field(default=0, ge=0)


class FAQItemUpdate(BaseModel):
    question: Optional[str] = Field(None, min_length=1)
    answer: Optional[str] = None
    order: Optional[int] = Field(None, ge=0)


def _require_admin(current_user: dict):
    if current_user.get("role") not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Hanya SuperAdmin dan Admin boleh mengurus FAQ Chatbox.")


def _allowed_file(filename: str) -> bool:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return ext in ALLOWED_EXTENSIONS


def _mime_for_ext(ext: str) -> str:
    m = {"pdf": "application/pdf", "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "gif": "image/gif"}
    return m.get(ext.lower(), "application/octet-stream")


# --- Admin: List all FAQ (for management) ---
@router.get("/faq/admin", response_model=dict)
async def list_faq_admin(current_user: dict = Depends(_current_user_dep)):
    _require_admin(current_user)
    db = get_db()
    cursor = db.chatbox_faq.find({}).sort("order", 1)
    items = await cursor.to_list(length=200)
    out = []
    for x in items:
        out.append({
            "id": str(x["_id"]),
            "question": x.get("question", ""),
            "answer": x.get("answer", ""),
            "order": x.get("order", 0),
            "attachments": x.get("attachments", []),
            "updated_at": x.get("updated_at"),
        })
    return {"items": out}


# --- Admin: Create FAQ ---
@router.post("/faq", response_model=dict)
async def create_faq(
    data: FAQItemCreate,
    current_user: dict = Depends(_current_user_dep),
):
    _require_admin(current_user)
    db = get_db()
    doc = {
        "question": data.question.strip(),
        "answer": data.answer.strip(),
        "order": data.order,
        "attachments": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "created_by": str(current_user["_id"]),
    }
    r = await db.chatbox_faq.insert_one(doc)
    return {"id": str(r.inserted_id), "message": "FAQ ditambah."}


# --- Admin: Update FAQ ---
@router.put("/faq/{faq_id}", response_model=dict)
async def update_faq(
    faq_id: str,
    data: FAQItemUpdate,
    current_user: dict = Depends(_current_user_dep),
):
    _require_admin(current_user)
    db = get_db()
    oid = _id_value(faq_id, strict=True)
    update = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.question is not None:
        update["question"] = data.question.strip()
    if data.answer is not None:
        update["answer"] = data.answer.strip()
    if data.order is not None:
        update["order"] = data.order
    result = await db.chatbox_faq.update_one({"_id": oid}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="FAQ tidak dijumpai")
    return {"message": "FAQ dikemaskini."}


# --- Admin: Delete FAQ ---
@router.delete("/faq/{faq_id}", response_model=dict)
async def delete_faq(
    faq_id: str,
    current_user: dict = Depends(_current_user_dep),
):
    _require_admin(current_user)
    db = get_db()
    oid = _id_value(faq_id, strict=True)
    doc = await db.chatbox_faq.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="FAQ tidak dijumpai")
    for att in doc.get("attachments", []):
        path = os.path.join(FAQ_UPLOAD_DIR, att.get("filename", ""))
        if os.path.isfile(path):
            try:
                os.remove(path)
            except OSError:
                pass
    await db.chatbox_faq.delete_one({"_id": oid})
    return {"message": "FAQ dipadam."}


# --- Admin: Upload attachment for FAQ ---
@router.post("/faq/upload", response_model=dict)
async def upload_faq_attachment(
    file: UploadFile = File(...),
    faq_id: str = Form(...),
    current_user: dict = Depends(_current_user_dep),
):
    _require_admin(current_user)
    if not file.filename or not _allowed_file(file.filename):
        raise HTTPException(
            status_code=400,
            detail=f"Jenis fail tidak disokong. Hanya: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Saiz fail melebihi 10MB")
    db = get_db()
    oid = _id_value(faq_id, strict=True, error_detail="ID FAQ tidak sah")
    faq = await db.chatbox_faq.find_one({"_id": oid})
    if not faq:
        raise HTTPException(status_code=404, detail="FAQ tidak dijumpai")
    attachments = faq.get("attachments", [])
    if len(attachments) >= MAX_ATTACHMENTS_PER_FAQ:
        raise HTTPException(status_code=400, detail=f"Maksimum {MAX_ATTACHMENTS_PER_FAQ} lampiran setiap FAQ")
    ext = file.filename.rsplit(".", 1)[-1].lower()
    filename = f"{faq_id}_{uuid.uuid4().hex[:12]}.{ext}"
    path = os.path.join(FAQ_UPLOAD_DIR, filename)
    with open(path, "wb") as f:
        f.write(content)
    url = f"/api/chatbox/faq/files/{filename}"
    att_doc = {
        "url": url,
        "filename": filename,
        "original_name": file.filename,
        "mime_type": _mime_for_ext(ext),
        "size": len(content),
    }
    await db.chatbox_faq.update_one(
        {"_id": oid},
        {"$push": {"attachments": att_doc}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"attachment": att_doc, "message": "Fail dimuat naik."}


# --- Admin: Remove attachment from FAQ ---
@router.delete("/faq/{faq_id}/attachments/{filename}", response_model=dict)
async def delete_faq_attachment(
    faq_id: str,
    filename: str,
    current_user: dict = Depends(_current_user_dep),
):
    _require_admin(current_user)
    db = get_db()
    oid = _id_value(faq_id, strict=True)
    path = os.path.join(FAQ_UPLOAD_DIR, filename)
    if os.path.isfile(path):
        try:
            os.remove(path)
        except OSError:
            pass
    result = await db.chatbox_faq.update_one(
        {"_id": oid},
        {"$pull": {"attachments": {"filename": filename}}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="FAQ tidak dijumpai")
    return {"message": "Lampiran dipadam."}


# --- Serve uploaded file (public read for chatbox users) ---
@router.get("/faq/files/{filename}")
async def serve_faq_file(filename: str):
    if ".." in filename or "/" in filename:
        raise HTTPException(status_code=404, detail="Fail tidak dijumpai")
    path = os.path.join(FAQ_UPLOAD_DIR, filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Fail tidak dijumpai")
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    media_type = _mime_for_ext(ext)
    return FileResponse(path, media_type=media_type, filename=filename)
