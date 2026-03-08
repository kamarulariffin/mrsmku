"""
Bus Ticket Management System - Models
MRSMKU Portal
"""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


# ============ BUS COMPANY MODELS ============

# Status permohonan syarikat: pending, approved, rejected, need_documents
APPLICATION_STATUS_PENDING = "pending"
APPLICATION_STATUS_APPROVED = "approved"
APPLICATION_STATUS_REJECTED = "rejected"
APPLICATION_STATUS_NEED_DOCUMENTS = "need_documents"

class BusCompanyCreate(BaseModel):
    """Model untuk mendaftar syarikat bas baru (maklumat lengkap + dokumen)"""
    name: str
    registration_number: str  # No. Pendaftaran SSM
    entity_type: Optional[str] = None  # Sdn Bhd / Enterprise / dll
    address: str
    postcode: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    director_name: Optional[str] = None  # Nama Pengarah / Pemilik
    director_ic_passport: Optional[str] = None  # No. IC / Passport
    phone: str
    email: str
    pic_name: str  # Person In Charge
    pic_phone: str
    apad_license_no: Optional[str] = None  # No. Lesen Operator APAD
    apad_expiry_date: Optional[str] = None  # Tarikh Tamat Lesen Operator (YYYY-MM-DD)
    apad_document_url: Optional[str] = None  # Salinan Lesen Operator (PDF/image)
    license_image_url: Optional[str] = None  # legacy
    permit_image_url: Optional[str] = None   # legacy
    application_status: Optional[str] = APPLICATION_STATUS_PENDING  # pending/approved/rejected/need_documents
    officer_notes: Optional[str] = None  # Catatan Pegawai

class BusCompanyApproval(BaseModel):
    """Body untuk admin lulus/tolak permohonan syarikat bas"""
    application_status: str  # approved | rejected | need_documents
    officer_notes: Optional[str] = None


class BusCompanyUpdate(BaseModel):
    """Model untuk kemaskini syarikat bas"""
    name: Optional[str] = None
    registration_number: Optional[str] = None
    entity_type: Optional[str] = None
    address: Optional[str] = None
    postcode: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    director_name: Optional[str] = None
    director_ic_passport: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    pic_name: Optional[str] = None
    pic_phone: Optional[str] = None
    is_active: Optional[bool] = None
    apad_license_no: Optional[str] = None
    apad_expiry_date: Optional[str] = None
    apad_document_url: Optional[str] = None
    license_image_url: Optional[str] = None
    permit_image_url: Optional[str] = None
    application_status: Optional[str] = None
    officer_notes: Optional[str] = None

class BusCompanyResponse(BaseModel):
    """Response model untuk syarikat bas"""
    id: str
    name: str
    registration_number: str
    entity_type: Optional[str] = None
    address: str
    postcode: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    director_name: Optional[str] = None
    director_ic_passport: Optional[str] = None
    phone: str
    email: str
    pic_name: str
    pic_phone: str
    apad_license_no: Optional[str] = None
    apad_expiry_date: Optional[str] = None
    apad_document_url: Optional[str] = None
    license_image_url: Optional[str] = None
    permit_image_url: Optional[str] = None
    is_active: bool
    is_verified: bool
    application_status: Optional[str] = None
    submitted_at: Optional[str] = None
    reviewed_by: Optional[str] = None
    approved_at: Optional[str] = None
    officer_notes: Optional[str] = None
    total_buses: int = 0
    total_routes: int = 0
    created_at: str
    verified_at: Optional[str] = None
    verified_by: Optional[str] = None


# ============ BUS MODELS ============

# Jenis bas: persiaran, sekolah, kilang
BUS_TYPE_PERSIARAN = "persiaran"
BUS_TYPE_SEKOLAH = "sekolah"
BUS_TYPE_KILANG = "kilang"

class SeatLayout(BaseModel):
    """Model untuk susun atur tempat duduk"""
    row: int
    column: str  # A, B, C, D
    seat_number: str  # e.g., "1A", "1B"
    is_available: bool = True

class BusCreate(BaseModel):
    """Model untuk mendaftar bas baru (butiran kenderaan + permit + PUSPAKOM + insurans)"""
    company_id: str
    plate_number: str
    bus_type: str
    total_seats: int
    brand: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    amenities: Optional[List[str]] = []
    chassis_no: Optional[str] = None
    engine_no: Optional[str] = None
    year_manufactured: Optional[int] = None
    bus_category: Optional[str] = None  # persiaran / sekolah / kilang
    color: Optional[str] = None
    ownership_status: Optional[str] = None  # Milik sendiri / Sewa / Pajakan
    operation_start_date: Optional[str] = None
    permit_no: Optional[str] = None
    permit_expiry: Optional[str] = None
    permit_document_url: Optional[str] = None
    puspakom_date: Optional[str] = None
    puspakom_result: Optional[str] = None  # Lulus / Gagal
    puspakom_document_url: Optional[str] = None
    insurance_company: Optional[str] = None
    insurance_expiry: Optional[str] = None
    insurance_document_url: Optional[str] = None
    geran_document_url: Optional[str] = None

class BusUpdate(BaseModel):
    """Model untuk kemaskini bas"""
    plate_number: Optional[str] = None
    bus_type: Optional[str] = None
    total_seats: Optional[int] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    is_active: Optional[bool] = None
    amenities: Optional[List[str]] = None
    chassis_no: Optional[str] = None
    engine_no: Optional[str] = None
    year_manufactured: Optional[int] = None
    bus_category: Optional[str] = None
    color: Optional[str] = None
    ownership_status: Optional[str] = None
    operation_start_date: Optional[str] = None
    permit_no: Optional[str] = None
    permit_expiry: Optional[str] = None
    permit_document_url: Optional[str] = None
    puspakom_date: Optional[str] = None
    puspakom_result: Optional[str] = None
    puspakom_document_url: Optional[str] = None
    insurance_company: Optional[str] = None
    insurance_expiry: Optional[str] = None
    insurance_document_url: Optional[str] = None
    geran_document_url: Optional[str] = None

class BusResponse(BaseModel):
    """Response model untuk bas"""
    id: str
    company_id: str
    company_name: Optional[str] = None
    plate_number: str
    bus_type: str
    total_seats: int
    brand: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    amenities: List[str] = []
    chassis_no: Optional[str] = None
    engine_no: Optional[str] = None
    year_manufactured: Optional[int] = None
    bus_category: Optional[str] = None
    color: Optional[str] = None
    ownership_status: Optional[str] = None
    operation_start_date: Optional[str] = None
    permit_no: Optional[str] = None
    permit_expiry: Optional[str] = None
    permit_document_url: Optional[str] = None
    puspakom_date: Optional[str] = None
    puspakom_result: Optional[str] = None
    puspakom_document_url: Optional[str] = None
    insurance_company: Optional[str] = None
    insurance_expiry: Optional[str] = None
    insurance_document_url: Optional[str] = None
    geran_document_url: Optional[str] = None
    is_active: bool
    created_at: str


# ============ BUS ROUTE MODELS ============

class DropOffPoint(BaseModel):
    """Model untuk titik turun (drop off)"""
    location: str  # e.g., "TBS", "Hentian Putra", "Masjid Wilayah"
    price: float   # Harga untuk lokasi ini
    order: int     # Urutan perhentian


class PickupPoint(BaseModel):
    """Model untuk lokasi pickup (ambilan)"""
    location: str  # e.g., "MRSMKU Kuantan", "Hentian Bandar"
    order: int     # Urutan perhentian

# Jenis perjalanan route: sehala (one-way) atau return (pergi & balik, sama bas tawarkan kedua-dua arah)
TRIP_TYPE_ONE_WAY = "one_way"
TRIP_TYPE_RETURN = "return"


class RouteCreate(BaseModel):
    """Model untuk cipta route baru"""
    company_id: str
    name: str  # e.g., "Kuantan - KL"
    origin: str  # e.g., "MRSMKU Kuantan" (lokasi asal / pickup pertama)
    destination: str  # e.g., "Kuala Lumpur"
    pickup_locations: Optional[List[PickupPoint]] = None  # lokasi pickup tambahan (urutan selepas origin)
    drop_off_points: List[DropOffPoint]  # lokasi drop off dengan harga
    base_price: float  # Harga asas
    estimated_duration: Optional[str] = None  # e.g., "3 jam 30 minit"
    distance_km: Optional[float] = None
    trip_type: Optional[str] = TRIP_TYPE_ONE_WAY  # one_way | return
    return_route_id: Optional[str] = None  # bila trip_type=return: id route balik (destinasi -> asal)

class RouteUpdate(BaseModel):
    """Model untuk kemaskini route"""
    name: Optional[str] = None
    origin: Optional[str] = None
    destination: Optional[str] = None
    pickup_locations: Optional[List[PickupPoint]] = None
    drop_off_points: Optional[List[DropOffPoint]] = None
    base_price: Optional[float] = None
    estimated_duration: Optional[str] = None
    is_active: Optional[bool] = None
    trip_type: Optional[str] = None  # one_way | return
    return_route_id: Optional[str] = None

class RouteResponse(BaseModel):
    """Response model untuk route"""
    id: str
    company_id: str
    company_name: str
    name: str
    origin: str
    destination: str
    pickup_locations: List[PickupPoint] = []  # lokasi pickup tambahan
    drop_off_points: List[DropOffPoint]
    base_price: float
    estimated_duration: Optional[str] = None
    distance_km: Optional[float] = None
    is_active: bool
    trip_type: str = TRIP_TYPE_ONE_WAY  # one_way | return
    return_route_id: Optional[str] = None
    return_route_name: Optional[str] = None  # nama route balik (untuk paparan)
    created_at: str


# ============ BUS TRIP/SCHEDULE MODELS ============

class TripCreate(BaseModel):
    """Model untuk cipta trip/jadual baru"""
    route_id: str
    bus_id: str
    departure_date: str  # YYYY-MM-DD
    departure_time: str  # HH:MM
    return_date: Optional[str] = None
    return_time: Optional[str] = None
    available_seats: Optional[int] = None
    notes: Optional[str] = None

class TripUpdate(BaseModel):
    """Model untuk kemaskini trip"""
    bus_id: Optional[str] = None
    departure_date: Optional[str] = None
    departure_time: Optional[str] = None
    return_date: Optional[str] = None
    return_time: Optional[str] = None
    status: Optional[str] = None  # scheduled, in_progress, completed, cancelled
    notes: Optional[str] = None

class TripResponse(BaseModel):
    """Response model untuk trip"""
    id: str
    route_id: str
    route_name: str
    bus_id: str
    bus_plate: str
    bus_type: str
    company_name: str
    origin: str
    destination: str
    departure_date: str
    departure_time: str
    return_date: Optional[str] = None
    return_time: Optional[str] = None
    total_seats: int
    available_seats: int
    booked_seats: int
    status: str
    drop_off_points: List[DropOffPoint]
    created_at: str


# ============ BOOKING MODELS ============

class BookingCreate(BaseModel):
    """Model untuk cipta tempahan baru"""
    trip_id: str
    student_id: str
    drop_off_point: str  # Lokasi turun yang dipilih
    seat_preference: Optional[str] = None  # Pilihan tempat duduk (jika ada)
    pulang_bermalam_id: Optional[str] = None  # ID permohonan pulang bermalam

class BookingUpdate(BaseModel):
    """Model untuk kemaskini tempahan"""
    assigned_seat: Optional[str] = None  # Tempat duduk yang diberikan
    status: Optional[str] = None  # pending, confirmed, assigned, cancelled, completed
    payment_status: Optional[str] = None  # pending, paid, refunded
    notes: Optional[str] = None

class BookingResponse(BaseModel):
    """Response model untuk tempahan"""
    id: str
    booking_number: str  # Auto-generated booking reference
    trip_id: str
    route_name: str
    student_id: str
    student_name: str
    student_matric: str
    parent_id: str
    parent_name: str
    company_name: str
    bus_plate: str
    origin: str
    destination: str
    drop_off_point: str
    drop_off_price: float
    departure_date: str
    departure_time: str
    seat_preference: Optional[str] = None
    assigned_seat: Optional[str] = None
    status: str
    payment_status: str
    pulang_bermalam_approved: bool
    created_at: str


# ============ VENDOR REGISTRATION REQUEST ============

class VendorRegistrationCreate(BaseModel):
    """Model untuk pendaftaran vendor bas baru"""
    company_name: str
    registration_number: str
    address: str
    phone: str
    email: str
    pic_name: str
    pic_phone: str
    pic_ic: str
    license_image_url: Optional[str] = None
    permit_image_url: Optional[str] = None
    password: str  # Password untuk akaun Bus Admin

class VendorRegistrationResponse(BaseModel):
    """Response model untuk pendaftaran vendor"""
    id: str
    company_name: str
    registration_number: str
    status: str  # pending, approved, rejected
    submitted_at: str
    reviewed_at: Optional[str] = None
    reviewed_by: Optional[str] = None
    rejection_reason: Optional[str] = None
