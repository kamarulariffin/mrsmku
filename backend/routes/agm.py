import inspect
import uuid
import base64
from io import BytesIO
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from bson import ObjectId
from services.id_normalizer import object_id_or_none
import qrcode

router = APIRouter(prefix="/api/agm", tags=["AGM"])

_get_db_func = None


def init_router(get_db_func):
    global _get_db_func
    _get_db_func = get_db_func


def get_db():
    if _get_db_func is None:
        raise RuntimeError("AGM router not initialized. Call init_router(get_db) first.")
    return _get_db_func()


def _get_collection(name: str):
    db = get_db()
    try:
        return db[name]
    except Exception:
        return getattr(db, name)


async def _maybe_await(value):
    if inspect.isawaitable(value):
        return await value
    return value


async def _find_one(collection_name: str, query: dict, sort: Optional[List[tuple]] = None):
    collection = _get_collection(collection_name)
    if sort:
        return await _maybe_await(collection.find_one(query, sort=sort))
    return await _maybe_await(collection.find_one(query))


async def _find_many(
    collection_name: str,
    query: Optional[dict] = None,
    sort: Optional[List[tuple]] = None,
    limit: Optional[int] = None,
):
    collection = _get_collection(collection_name)
    cursor = collection.find(query or {})

    if sort:
        try:
            cursor = cursor.sort(sort)
        except Exception:
            # Fallback for cursor implementations expecting positional sort args.
            for field, direction in sort:
                cursor = cursor.sort(field, direction)

    if limit is not None:
        try:
            cursor = cursor.limit(limit)
        except Exception:
            pass

    if hasattr(cursor, "to_list"):
        fetch_n = limit if limit is not None else 200000
        return await cursor.to_list(fetch_n)
    return list(cursor)


async def _insert_one(collection_name: str, doc: dict):
    collection = _get_collection(collection_name)
    return await _maybe_await(collection.insert_one(doc))


async def _update_one(
    collection_name: str,
    query: dict,
    update: dict,
    upsert: bool = False,
    **kwargs,
):
    collection = _get_collection(collection_name)
    return await _maybe_await(collection.update_one(query, update, upsert=upsert, **kwargs))


async def _delete_one(collection_name: str, query: dict):
    collection = _get_collection(collection_name)
    return await _maybe_await(collection.delete_one(query))


async def _delete_many(collection_name: str, query: dict):
    collection = _get_collection(collection_name)
    return await _maybe_await(collection.delete_many(query))

# ========== MODELS ==========

class AGMEventCreate(BaseModel):
    nama_event: str
    jenis_mesyuarat: str  # AGM Tahunan, EGM, Mesyuarat Khas
    tahun_kewangan: str
    tarikh_mesyuarat: str
    hari: str
    masa_mula: str
    masa_tamat: str
    status: str = "Draf"  # Draf, Aktif, Selesai, Ditangguhkan
    mod_mesyuarat: str  # Fizikal, Online, Hybrid
    nama_tempat: Optional[str] = None
    alamat_penuh: Optional[str] = None
    pic_lokasi: Optional[str] = None
    platform_mesyuarat: Optional[str] = None
    link_mesyuarat: Optional[str] = None
    host_mesyuarat: Optional[str] = None
    quorum_minimum: int = 50
    kaedah_kehadiran: str = "QR Code"  # QR Code, Manual, Auto login

class AGMAttendeeCreate(BaseModel):
    event_id: str
    user_id: Optional[str] = None
    nama_penuh: str
    no_ic: str
    email: str
    no_telefon: str
    jantina: str  # Lelaki, Perempuan
    negeri: str
    kategori_peserta: str  # Ahli, AJK, Pemerhati, Jemputan
    status_kehadiran: str = "Tidak Hadir"  # Hadir, Tidak Hadir, Wakil
    status_yuran: str = "Belum Bayar"  # Sudah Bayar, Belum Bayar
    anak_belum_bayar: List[str] = []
    qr_code: Optional[str] = None

class AGMAgendaCreate(BaseModel):
    event_id: str
    no_agenda: int
    tajuk_agenda: str
    penerangan: Optional[str] = None
    pembentang: Optional[str] = None
    masa_diperuntukkan: Optional[str] = None
    jenis_agenda: str  # Laporan, Perbincangan, Pengesahan, Makluman

class AGMDocumentCreate(BaseModel):
    event_id: str
    nama_dokumen: str
    jenis_dokumen: str  # Notis Mesyuarat, Agenda Rasmi, Minit Mesyuarat Lepas, etc.
    file_url: str
    versi: str = "1.0"
    dimuat_naik_oleh: str
    akses_pengguna: str = "Ahli"  # Admin sahaja, Ahli, Umum

# ========== HELPER FUNCTIONS ==========

def generate_qr_code(data: str) -> str:
    """Generate QR code and return as base64 string"""
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode()

def serialize_doc(doc):
    """Convert MongoDB document to JSON-serializable dict"""
    if doc is None:
        return None
    doc['id'] = str(doc.pop('_id'))
    return doc


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

async def check_muafakat_fee_status(user_id: str) -> dict:
    """
    Check Muafakat fee status for all children of a parent user.
    Returns fee status and list of children who haven't paid.
    """
    result = {
        "all_paid": True,
        "total_children": 0,
        "children_paid": 0,
        "children_unpaid": 0,
        "anak_belum_bayar": [],
        "anak_sudah_bayar": [],
        "total_unpaid_amount": 0.0,
        "details": []
    }
    
    try:
        # Find all children (students) of this parent
        children = await _find_many("students", {"parent_id": _id_value(user_id)})
        result["total_children"] = len(children)
        
        current_year = datetime.now().year
        
        for child in children:
            child_name = child.get("full_name", "Tidak Diketahui")
            child_id = child.get("_id")
            
            # Check Muafakat fee for this child for current year
            muafakat_fee = await _find_one("fees", {
                "student_id": child_id,
                "category": "muafakat"
            })
            
            child_detail = {
                "nama": child_name,
                "matric": child.get("matric_number", ""),
                "form": child.get("form", ""),
                "fee_status": "Tiada rekod yuran"
            }
            
            if muafakat_fee:
                amount = muafakat_fee.get("amount", 0)
                paid_amount = muafakat_fee.get("paid_amount", 0)
                status = muafakat_fee.get("status", "pending")
                due_date = muafakat_fee.get("due_date", "")
                
                child_detail["jumlah_yuran"] = amount
                child_detail["jumlah_dibayar"] = paid_amount
                child_detail["baki"] = amount - paid_amount
                child_detail["tarikh_akhir"] = due_date
                
                if status == "paid" or paid_amount >= amount:
                    child_detail["fee_status"] = "Sudah Bayar"
                    result["children_paid"] += 1
                    result["anak_sudah_bayar"].append(child_name)
                else:
                    child_detail["fee_status"] = "Belum Bayar"
                    result["children_unpaid"] += 1
                    result["anak_belum_bayar"].append(child_name)
                    result["total_unpaid_amount"] += (amount - paid_amount)
                    result["all_paid"] = False
            else:
                # No fee record found - treat as unpaid
                result["children_unpaid"] += 1
                result["anak_belum_bayar"].append(child_name)
                result["all_paid"] = False
            
            result["details"].append(child_detail)
        
        # If no children found, consider as special case
        if result["total_children"] == 0:
            result["all_paid"] = True  # No children means nothing to check
            
    except Exception as e:
        print(f"Error checking fee status: {e}")
        result["error"] = str(e)
    
    return result

async def get_user_by_ic(no_ic: str) -> dict:
    """Find user by IC number or email"""
    # Users may have IC stored in different fields
    user = await _find_one("users", {
        "$or": [
            {"ic_number": no_ic},
            {"no_ic": no_ic},
            {"ic": no_ic},
            {"email": no_ic}  # Also search by email
        ]
    })
    return user

# ========== EVENT ROUTES ==========

@router.post("/events")
async def create_agm_event(event: AGMEventCreate):
    """Create new AGM event"""
    event_dict = event.dict()
    event_dict['created_at'] = datetime.now(timezone.utc).isoformat()
    event_dict['updated_at'] = datetime.now(timezone.utc).isoformat()
    event_dict['event_code'] = f"AGM-{uuid.uuid4().hex[:8].upper()}"
    
    result = await _insert_one("agm_events", event_dict)
    event_dict['id'] = str(result.inserted_id)
    event_dict.pop('_id', None)
    
    return {"message": "Event AGM berjaya dicipta", "event": event_dict}

@router.get("/events")
async def get_all_agm_events():
    """Get all AGM events"""
    events = await _find_many("agm_events", sort=[("created_at", -1)])
    return {"events": [serialize_doc(e) for e in events]}

@router.get("/events/{event_id}")
async def get_agm_event(event_id: str):
    """Get single AGM event by ID"""
    try:
        event = await _find_one("agm_events", {"_id": _id_value(event_id)})
        if not event:
            raise HTTPException(status_code=404, detail="Event tidak dijumpai")
        return {"event": serialize_doc(event)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/events/{event_id}")
async def update_agm_event(event_id: str, event: AGMEventCreate):
    """Update AGM event"""
    try:
        event_dict = event.dict()
        event_dict['updated_at'] = datetime.now(timezone.utc).isoformat()
        
        result = await _update_one(
            "agm_events",
            {"_id": _id_value(event_id)},
            {"$set": event_dict}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Event tidak dijumpai")
        
        return {"message": "Event AGM berjaya dikemaskini"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/events/{event_id}")
async def delete_agm_event(event_id: str):
    """Delete AGM event"""
    try:
        result = await _delete_one("agm_events", {"_id": _id_value(event_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Event tidak dijumpai")
        
        # Also delete related attendees, agendas, documents
        await _delete_many("agm_attendees", {"event_id": event_id})
        await _delete_many("agm_agendas", {"event_id": event_id})
        await _delete_many("agm_documents", {"event_id": event_id})
        
        return {"message": "Event AGM berjaya dipadam"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ========== ATTENDEE ROUTES ==========

@router.post("/attendees")
async def register_attendee(attendee: AGMAttendeeCreate):
    """Register attendee for AGM event with automatic fee status check"""
    attendee_dict = attendee.dict()
    attendee_dict['created_at'] = datetime.now(timezone.utc).isoformat()
    
    # AUTO-CHECK: Find user by IC and check Muafakat fee status
    fee_check_result = None
    if attendee.user_id:
        # If user_id provided, check directly
        fee_check_result = await check_muafakat_fee_status(attendee.user_id)
    else:
        # Try to find user by IC number
        user = await get_user_by_ic(attendee.no_ic)
        if user:
            attendee_dict['user_id'] = str(user['_id'])
            fee_check_result = await check_muafakat_fee_status(str(user['_id']))
    
    # Update fee status based on check
    if fee_check_result:
        attendee_dict['fee_check_result'] = fee_check_result
        attendee_dict['anak_belum_bayar'] = fee_check_result.get('anak_belum_bayar', [])
        attendee_dict['anak_sudah_bayar'] = fee_check_result.get('anak_sudah_bayar', [])
        attendee_dict['total_unpaid_amount'] = fee_check_result.get('total_unpaid_amount', 0)
        
        if fee_check_result.get('all_paid', False):
            attendee_dict['status_yuran'] = "Sudah Bayar"
        else:
            attendee_dict['status_yuran'] = "Belum Bayar"
            # If unpaid before deadline (30 April), keep as Ahli but flag
            # If unpaid after deadline, set as Pemerhati
            current_date = datetime.now()
            deadline = datetime(current_date.year, 4, 30)
            if current_date > deadline:
                attendee_dict['kategori_peserta'] = "Pemerhati"
    
    # Generate unique QR code for attendance
    qr_data = f"AGM-{attendee.event_id}-{attendee.no_ic}-{uuid.uuid4().hex[:8]}"
    attendee_dict['qr_code'] = qr_data
    attendee_dict['qr_code_image'] = generate_qr_code(qr_data)
    
    result = await _insert_one("agm_attendees", attendee_dict)
    attendee_dict['id'] = str(result.inserted_id)
    attendee_dict.pop('_id', None)
    
    # Prepare response message
    message = "Peserta berjaya didaftarkan"
    if fee_check_result and not fee_check_result.get('all_paid', True):
        message += f" (PERHATIAN: {len(fee_check_result.get('anak_belum_bayar', []))} anak belum bayar yuran Muafakat)"
    
    return {
        "message": message, 
        "attendee": attendee_dict,
        "fee_status": fee_check_result
    }

@router.get("/attendees/{event_id}")
async def get_event_attendees(event_id: str):
    """Get all attendees for an event"""
    attendees = await _find_many("agm_attendees", {"event_id": event_id})
    return {"attendees": [serialize_doc(a) for a in attendees]}

@router.get("/attendees/check-fee/{no_ic}")
async def check_attendee_fee_by_ic(no_ic: str):
    """Check Muafakat fee status for a parent by IC number or email"""
    user = await get_user_by_ic(no_ic)
    if not user:
        # Try to find by email that contains the IC
        user = await _find_one("users", {"email": {"$regex": no_ic.replace("-", "")}})
    
    if not user:
        return {
            "found": False,
            "message": "Pengguna tidak dijumpai dalam sistem",
            "fee_status": None
        }
    
    fee_result = await check_muafakat_fee_status(str(user['_id']))
    
    return {
        "found": True,
        "user_name": user.get('full_name', 'Tidak Diketahui'),
        "user_email": user.get('email', ''),
        "fee_status": fee_result,
        "message": "Semua anak sudah bayar yuran Muafakat" if fee_result.get('all_paid') else f"Ada {len(fee_result.get('anak_belum_bayar', []))} anak belum bayar yuran"
    }

@router.post("/attendees/scan")
async def scan_attendance(qr_code: str):
    """Scan QR code to mark attendance with real-time fee check"""
    attendee = await _find_one("agm_attendees", {"qr_code": qr_code})
    
    if not attendee:
        raise HTTPException(status_code=404, detail="QR Code tidak sah")
    
    # RE-CHECK fee status in real-time from database
    fee_alert = None
    current_fee_status = None
    
    if attendee.get('user_id'):
        current_fee_status = await check_muafakat_fee_status(attendee.get('user_id'))
    
    # Determine if fees are paid
    fees_paid = True
    anak_belum_bayar = []
    
    if current_fee_status:
        fees_paid = current_fee_status.get('all_paid', False)
        anak_belum_bayar = current_fee_status.get('anak_belum_bayar', [])
    elif attendee.get('status_yuran') == "Belum Bayar":
        fees_paid = False
        anak_belum_bayar = attendee.get('anak_belum_bayar', [])
    
    if not fees_paid:
        fee_alert = {
            "message": "AMARAN: Peserta belum menjelaskan yuran Muafakat!",
            "anak_belum_bayar": anak_belum_bayar,
            "jumlah_anak_belum_bayar": len(anak_belum_bayar),
            "total_unpaid_amount": current_fee_status.get('total_unpaid_amount', 0) if current_fee_status else 0,
            "status": "Pemerhati sahaja",
            "info": "Sila jelaskan yuran sebelum 30 April untuk layak mengundi"
        }
        # Update to observer status
        await _update_one(
            "agm_attendees",
            {"qr_code": qr_code},
            {"$set": {
                "status_kehadiran": "Hadir",
                "kategori_peserta": "Pemerhati",
                "status_yuran": "Belum Bayar",
                "anak_belum_bayar": anak_belum_bayar,
                "waktu_hadir": datetime.now(timezone.utc).isoformat(),
                "fee_check_at_scan": current_fee_status
            }}
        )
    else:
        await _update_one(
            "agm_attendees",
            {"qr_code": qr_code},
            {"$set": {
                "status_kehadiran": "Hadir",
                "status_yuran": "Sudah Bayar",
                "waktu_hadir": datetime.now(timezone.utc).isoformat(),
                "fee_check_at_scan": current_fee_status
            }}
        )
    
    updated_attendee = await _find_one("agm_attendees", {"qr_code": qr_code})
    
    return {
        "message": "Kehadiran berjaya direkodkan",
        "attendee": serialize_doc(updated_attendee),
        "fee_alert": fee_alert
    }

@router.put("/attendees/{attendee_id}/status")
async def update_attendee_status(attendee_id: str, status: str, kategori: Optional[str] = None):
    """Update attendee status manually"""
    try:
        update_data = {
            "status_kehadiran": status,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        if kategori:
            update_data["kategori_peserta"] = kategori
        if status == "Hadir":
            update_data["waktu_hadir"] = datetime.now(timezone.utc).isoformat()
            
        result = await _update_one(
            "agm_attendees",
            {"_id": _id_value(attendee_id)},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Peserta tidak dijumpai")
        
        return {"message": "Status peserta berjaya dikemaskini"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ========== AGENDA ROUTES ==========

@router.post("/agendas")
async def create_agenda(agenda: AGMAgendaCreate):
    """Create agenda item"""
    agenda_dict = agenda.dict()
    agenda_dict['created_at'] = datetime.now(timezone.utc).isoformat()
    
    result = await _insert_one("agm_agendas", agenda_dict)
    agenda_dict['id'] = str(result.inserted_id)
    agenda_dict.pop('_id', None)
    
    return {"message": "Agenda berjaya ditambah", "agenda": agenda_dict}

@router.get("/agendas/{event_id}")
async def get_event_agendas(event_id: str):
    """Get all agendas for an event"""
    agendas = await _find_many("agm_agendas", {"event_id": event_id}, sort=[("no_agenda", 1)])
    return {"agendas": [serialize_doc(a) for a in agendas]}

@router.delete("/agendas/{agenda_id}")
async def delete_agenda(agenda_id: str):
    """Delete agenda item"""
    try:
        result = await _delete_one("agm_agendas", {"_id": _id_value(agenda_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Agenda tidak dijumpai")
        return {"message": "Agenda berjaya dipadam"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ========== DOCUMENT ROUTES ==========

@router.post("/documents")
async def upload_document(document: AGMDocumentCreate):
    """Upload document for AGM event"""
    doc_dict = document.dict()
    doc_dict['created_at'] = datetime.now(timezone.utc).isoformat()
    
    result = await _insert_one("agm_documents", doc_dict)
    doc_dict['id'] = str(result.inserted_id)
    doc_dict.pop('_id', None)
    
    return {"message": "Dokumen berjaya dimuat naik", "document": doc_dict}

@router.get("/documents/{event_id}")
async def get_event_documents(event_id: str):
    """Get all documents for an event"""
    documents = await _find_many("agm_documents", {"event_id": event_id})
    return {"documents": [serialize_doc(d) for d in documents]}

@router.delete("/documents/{document_id}")
async def delete_document(document_id: str):
    """Delete document"""
    try:
        result = await _delete_one("agm_documents", {"_id": _id_value(document_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Dokumen tidak dijumpai")
        return {"message": "Dokumen berjaya dipadam"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ========== REPORTING ROUTES ==========

@router.get("/reports/{event_id}")
async def get_event_report(event_id: str):
    """Get comprehensive report for an AGM event"""
    try:
        # Get event details
        event = await _find_one("agm_events", {"_id": _id_value(event_id)})
        if not event:
            raise HTTPException(status_code=404, detail="Event tidak dijumpai")
        
        # Get all attendees
        attendees = await _find_many("agm_attendees", {"event_id": event_id})
        
        # Calculate statistics
        total_registered = len(attendees)
        total_hadir = len([a for a in attendees if a.get('status_kehadiran') == 'Hadir'])
        total_tidak_hadir = len([a for a in attendees if a.get('status_kehadiran') == 'Tidak Hadir'])
        total_wakil = len([a for a in attendees if a.get('status_kehadiran') == 'Wakil'])
        
        # Gender breakdown
        lelaki_hadir = len([a for a in attendees if a.get('jantina') == 'Lelaki' and a.get('status_kehadiran') == 'Hadir'])
        perempuan_hadir = len([a for a in attendees if a.get('jantina') == 'Perempuan' and a.get('status_kehadiran') == 'Hadir'])
        
        # State breakdown
        negeri_stats = {}
        for a in attendees:
            if a.get('status_kehadiran') == 'Hadir':
                negeri = a.get('negeri', 'Tidak Dinyatakan')
                negeri_stats[negeri] = negeri_stats.get(negeri, 0) + 1
        
        # Gender by state
        negeri_jantina_stats = {}
        for a in attendees:
            if a.get('status_kehadiran') == 'Hadir':
                negeri = a.get('negeri', 'Tidak Dinyatakan')
                jantina = a.get('jantina', 'Tidak Dinyatakan')
                if negeri not in negeri_jantina_stats:
                    negeri_jantina_stats[negeri] = {'Lelaki': 0, 'Perempuan': 0}
                negeri_jantina_stats[negeri][jantina] = negeri_jantina_stats[negeri].get(jantina, 0) + 1
        
        # Most attended state
        negeri_paling_ramai = max(negeri_stats, key=negeri_stats.get) if negeri_stats else None
        
        # Category breakdown
        kategori_stats = {}
        for a in attendees:
            if a.get('status_kehadiran') == 'Hadir':
                kategori = a.get('kategori_peserta', 'Tidak Dinyatakan')
                kategori_stats[kategori] = kategori_stats.get(kategori, 0) + 1
        
        # Fee status
        sudah_bayar = len([a for a in attendees if a.get('status_yuran') == 'Sudah Bayar'])
        belum_bayar = len([a for a in attendees if a.get('status_yuran') == 'Belum Bayar'])
        pemerhati = len([a for a in attendees if a.get('kategori_peserta') == 'Pemerhati'])
        
        # Quorum check
        quorum_minimum = event.get('quorum_minimum', 50)
        quorum_achieved = (total_hadir / total_registered * 100) >= quorum_minimum if total_registered > 0 else False
        quorum_percentage = (total_hadir / total_registered * 100) if total_registered > 0 else 0
        
        report = {
            "event": serialize_doc(event),
            "ringkasan_kehadiran": {
                "jumlah_didaftarkan": total_registered,
                "jumlah_hadir": total_hadir,
                "jumlah_tidak_hadir": total_tidak_hadir,
                "jumlah_wakil": total_wakil,
                "peratus_kehadiran": round(quorum_percentage, 2)
            },
            "statistik_jantina": {
                "lelaki_hadir": lelaki_hadir,
                "perempuan_hadir": perempuan_hadir
            },
            "statistik_negeri": negeri_stats,
            "statistik_negeri_jantina": negeri_jantina_stats,
            "negeri_paling_ramai": {
                "negeri": negeri_paling_ramai,
                "jumlah": negeri_stats.get(negeri_paling_ramai, 0) if negeri_paling_ramai else 0
            },
            "statistik_kategori": kategori_stats,
            "statistik_yuran": {
                "sudah_bayar": sudah_bayar,
                "belum_bayar": belum_bayar,
                "pemerhati": pemerhati
            },
            "quorum": {
                "minimum_diperlukan": quorum_minimum,
                "peratus_semasa": round(quorum_percentage, 2),
                "tercapai": quorum_achieved
            }
        }
        
        return {"report": report}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/reports/{event_id}/attendees-list")
async def get_attendees_report(event_id: str, status: Optional[str] = None):
    """Get detailed attendees list for reporting"""
    query = {"event_id": event_id}
    if status:
        query["status_kehadiran"] = status
    
    attendees = await _find_many("agm_attendees", query)
    
    return {
        "total": len(attendees),
        "attendees": [serialize_doc(a) for a in attendees]
    }

@router.get("/reports/summary/all")
async def get_all_events_summary():
    """Get summary of all AGM events"""
    events = await _find_many("agm_events", sort=[("created_at", -1)])
    
    summary = []
    for event in events:
        event_id = str(event['_id'])
        attendees = await _find_many("agm_attendees", {"event_id": event_id})
        total_hadir = len([a for a in attendees if a.get('status_kehadiran') == 'Hadir'])
        
        summary.append({
            "event": serialize_doc(event.copy()),
            "jumlah_didaftarkan": len(attendees),
            "jumlah_hadir": total_hadir
        })
    
    return {"summary": summary}


# ========== USER QR CODE & AGM STATUS ==========

def generate_user_qr_code(user_id: str) -> str:
    """Generate permanent QR code for a user"""
    # Format: MRSMKU-USER-{user_id}
    qr_data = f"MRSMKU-USER-{user_id}"
    return qr_data

async def get_agm_membership_status(user_id: str) -> dict:
    """
    Determine AGM membership status based on Muafakat fee payment.
    Must pay RM50 per child before 30 April each year to be 'Ahli Aktif'.
    """
    current_year = datetime.now().year
    current_date = datetime.now()
    deadline = datetime(current_year, 4, 30)
    
    result = {
        "status": "Ahli Muafakat Pemerhati",
        "status_code": "pemerhati",
        "tahun": current_year,
        "tarikh_cutoff": "30 April " + str(current_year),
        "boleh_mengundi": False,
        "sebab": "",
        "jumlah_anak": 0,
        "anak_sudah_bayar": [],
        "anak_belum_bayar": [],
        "jumlah_perlu_bayar": 0.0,
        "jumlah_sudah_bayar": 0.0,
        "baki_tertunggak": 0.0
    }
    
    try:
        # Get fee status
        fee_status = await check_muafakat_fee_status(user_id)
        result["jumlah_anak"] = fee_status.get("total_children", 0)
        result["anak_sudah_bayar"] = fee_status.get("anak_sudah_bayar", [])
        result["anak_belum_bayar"] = fee_status.get("anak_belum_bayar", [])
        result["baki_tertunggak"] = fee_status.get("total_unpaid_amount", 0)
        
        # Calculate required payment (RM50 per child for Muafakat)
        muafakat_per_child = 50.0
        result["jumlah_perlu_bayar"] = result["jumlah_anak"] * muafakat_per_child
        result["jumlah_sudah_bayar"] = result["jumlah_perlu_bayar"] - result["baki_tertunggak"]
        
        # Determine status
        if result["jumlah_anak"] == 0:
            result["status"] = "Tiada Anak Berdaftar"
            result["status_code"] = "tiada_anak"
            result["sebab"] = "Tiada anak yang didaftarkan dalam sistem."
            result["boleh_mengundi"] = False
        elif fee_status.get("all_paid", False):
            # All fees paid - check if before deadline
            if current_date <= deadline:
                result["status"] = "Ahli Muafakat Aktif"
                result["status_code"] = "aktif"
                result["boleh_mengundi"] = True
                result["sebab"] = f"Semua yuran Muafakat ({result['jumlah_anak']} anak) telah dijelaskan."
            else:
                # After deadline but paid
                result["status"] = "Ahli Muafakat Aktif"
                result["status_code"] = "aktif"
                result["boleh_mengundi"] = True
                result["sebab"] = f"Semua yuran Muafakat telah dijelaskan."
        else:
            result["status"] = "Ahli Muafakat Pemerhati"
            result["status_code"] = "pemerhati"
            result["boleh_mengundi"] = False
            unpaid_count = len(result["anak_belum_bayar"])
            result["sebab"] = f"{unpaid_count} daripada {result['jumlah_anak']} anak belum menjelaskan yuran Muafakat (RM{result['baki_tertunggak']:.2f} tertunggak)."
            
    except Exception as e:
        result["error"] = str(e)
        result["sebab"] = "Ralat semasa menyemak status yuran."
    
    return result


@router.get("/user/qrcode/{user_id}")
async def get_user_qr_code(user_id: str):
    """Get permanent QR code for a user"""
    try:
        user = await _find_one("users", {"_id": _id_value(user_id)})
        if not user:
            raise HTTPException(status_code=404, detail="Pengguna tidak dijumpai")
        
        # Check if user already has QR code
        qr_code = user.get("qr_code")
        qr_code_image = user.get("qr_code_image")
        
        if not qr_code:
            # Generate new permanent QR code
            qr_code = generate_user_qr_code(user_id)
            qr_code_image = generate_qr_code(qr_code)
            
            # Save to user document
            await _update_one(
                "users",
                {"_id": _id_value(user_id)},
                {"$set": {
                    "qr_code": qr_code,
                    "qr_code_image": qr_code_image,
                    "qr_code_generated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
        
        return {
            "user_id": user_id,
            "full_name": user.get("full_name", ""),
            "email": user.get("email", ""),
            "role": user.get("role", ""),
            "qr_code": qr_code,
            "qr_code_image": qr_code_image
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/user/agm-status/{user_id}")
async def get_user_agm_status(user_id: str):
    """Get AGM membership status for a user (based on Muafakat fee)"""
    try:
        user = await _find_one("users", {"_id": _id_value(user_id)})
        if not user:
            raise HTTPException(status_code=404, detail="Pengguna tidak dijumpai")
        
        # Only applicable for parent role
        if user.get("role") != "parent":
            return {
                "user_id": user_id,
                "full_name": user.get("full_name", ""),
                "role": user.get("role", ""),
                "applicable": False,
                "message": "Status AGM hanya untuk peranan Ibu Bapa."
            }
        
        agm_status = await get_agm_membership_status(user_id)
        
        return {
            "user_id": user_id,
            "full_name": user.get("full_name", ""),
            "email": user.get("email", ""),
            "role": user.get("role", ""),
            "applicable": True,
            "agm_status": agm_status
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/user/profile-with-qr/{user_id}")
async def get_user_profile_with_qr(user_id: str):
    """Get complete user profile with QR code and AGM status"""
    try:
        user = await _find_one("users", {"_id": _id_value(user_id)})
        if not user:
            raise HTTPException(status_code=404, detail="Pengguna tidak dijumpai")
        
        # Get or generate QR code
        qr_code = user.get("qr_code")
        qr_code_image = user.get("qr_code_image")
        
        if not qr_code:
            qr_code = generate_user_qr_code(user_id)
            qr_code_image = generate_qr_code(qr_code)
            
            await _update_one(
                "users",
                {"_id": _id_value(user_id)},
                {"$set": {
                    "qr_code": qr_code,
                    "qr_code_image": qr_code_image,
                    "qr_code_generated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
        
        # Get AGM status if parent
        agm_status = None
        if user.get("role") == "parent":
            agm_status = await get_agm_membership_status(user_id)
        
        # Get children info if parent
        children = []
        if user.get("role") == "parent":
            children_docs = await _find_many("students", {"parent_id": _id_value(user_id)})
            for child in children_docs:
                children.append({
                    "id": str(child["_id"]),
                    "full_name": child.get("full_name", ""),
                    "matric_number": child.get("matric_number", ""),
                    "form": child.get("form", ""),
                    "class_name": child.get("class_name", ""),
                    "status": child.get("status", "")
                })
        
        return {
            "user_id": user_id,
            "full_name": user.get("full_name", ""),
            "email": user.get("email", ""),
            "phone": user.get("phone", ""),
            "phone_alt": user.get("phone_alt", ""),
            "ic_number": user.get("ic_number", ""),
            "gender": user.get("gender", ""),
            "state": user.get("state", ""),
            "address": user.get("address", ""),
            "postcode": user.get("postcode", ""),
            "city": user.get("city", ""),
            "role": user.get("role", ""),
            "qr_code": qr_code,
            "qr_code_image": qr_code_image,
            "agm_status": agm_status,
            "children": children,
            "created_at": user.get("created_at", "")
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/user/scan-attendance")
async def scan_user_attendance(qr_code: str, event_id: str):
    """
    Scan user's permanent QR code to record AGM attendance.
    Auto-determine membership status (Aktif/Pemerhati) based on fee payment.
    """
    try:
        # Parse QR code to get user_id
        if not qr_code.startswith("MRSMKU-USER-"):
            raise HTTPException(status_code=400, detail="Format QR Code tidak sah")
        
        user_id = qr_code.replace("MRSMKU-USER-", "")
        
        # Find user
        user = await _find_one("users", {"_id": _id_value(user_id)})
        if not user:
            raise HTTPException(status_code=404, detail="Pengguna tidak dijumpai")
        
        # Check if event exists
        event = await _find_one("agm_events", {"_id": _id_value(event_id)})
        if not event:
            raise HTTPException(status_code=404, detail="Event AGM tidak dijumpai")
        
        # Check if already registered for this event
        existing_attendee = await _find_one("agm_attendees", {
            "event_id": event_id,
            "user_id": user_id
        })
        
        # Get AGM membership status
        agm_status = await get_agm_membership_status(user_id) if user.get("role") == "parent" else None
        
        # Determine kategori based on fee status
        kategori = "Ahli"
        fee_alert = None
        
        if agm_status:
            if agm_status.get("status_code") == "aktif":
                kategori = "Ahli"
            else:
                kategori = "Pemerhati"
                fee_alert = {
                    "message": "AMARAN: Peserta belum menjelaskan yuran Muafakat!",
                    "anak_belum_bayar": agm_status.get("anak_belum_bayar", []),
                    "jumlah_anak_belum_bayar": len(agm_status.get("anak_belum_bayar", [])),
                    "total_unpaid_amount": agm_status.get("baki_tertunggak", 0),
                    "status": "Pemerhati sahaja",
                    "info": agm_status.get("sebab", "")
                }
        
        if existing_attendee:
            # Update existing attendance
            await _update_one(
                "agm_attendees",
                {"_id": existing_attendee["_id"]},
                {"$set": {
                    "status_kehadiran": "Hadir",
                    "kategori_peserta": kategori,
                    "waktu_hadir": datetime.now(timezone.utc).isoformat(),
                    "status_yuran": "Sudah Bayar" if kategori == "Ahli" else "Belum Bayar"
                }}
            )
            updated_attendee = await _find_one("agm_attendees", {"_id": existing_attendee["_id"]})
            
            return {
                "message": "Kehadiran berjaya dikemaskini",
                "attendee": serialize_doc(updated_attendee),
                "fee_alert": fee_alert,
                "agm_status": agm_status
            }
        else:
            # Create new attendance record
            attendee_doc = {
                "event_id": event_id,
                "user_id": user_id,
                "nama_penuh": user.get("full_name", ""),
                "no_ic": user.get("ic_number", ""),
                "email": user.get("email", ""),
                "no_telefon": user.get("phone", ""),
                "jantina": user.get("gender", "Tidak Dinyatakan"),
                "negeri": user.get("state", "Tidak Dinyatakan"),
                "kategori_peserta": kategori,
                "status_kehadiran": "Hadir",
                "status_yuran": "Sudah Bayar" if kategori == "Ahli" else "Belum Bayar",
                "anak_belum_bayar": agm_status.get("anak_belum_bayar", []) if agm_status else [],
                "qr_code": qr_code,
                "waktu_hadir": datetime.now(timezone.utc).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            result = await _insert_one("agm_attendees", attendee_doc)
            attendee_doc["id"] = str(result.inserted_id)
            attendee_doc.pop("_id", None)
            
            return {
                "message": "Kehadiran berjaya direkodkan",
                "attendee": attendee_doc,
                "fee_alert": fee_alert,
                "agm_status": agm_status
            }
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/user/generate-all-qrcodes")
async def generate_all_user_qrcodes():
    """Generate QR codes for all users who don't have one (admin utility)"""
    try:
        users_without_qr = await _find_many("users", {"qr_code": {"$exists": False}})
        
        generated_count = 0
        for user in users_without_qr:
            user_id = str(user["_id"])
            qr_code = generate_user_qr_code(user_id)
            qr_code_image = generate_qr_code(qr_code)
            
            await _update_one(
                "users",
                {"_id": user["_id"]},
                {"$set": {
                    "qr_code": qr_code,
                    "qr_code_image": qr_code_image,
                    "qr_code_generated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            generated_count += 1
        
        return {
            "message": f"Berjaya menjana {generated_count} QR code",
            "total_generated": generated_count
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

