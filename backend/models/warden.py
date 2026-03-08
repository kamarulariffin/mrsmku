"""
Warden Management Module - Pydantic Models
Modul Pengurusan Warden untuk MRSMKU Smart360
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, time
from enum import Enum


class WardenPosition(str, Enum):
    WARDEN_ASRAMA_LELAKI = "warden_asrama_lelaki"
    WARDEN_ASRAMA_PEREMPUAN = "warden_asrama_perempuan"
    GURU_ASRAMA_LELAKI = "guru_asrama_lelaki"
    GURU_ASRAMA_PEREMPUAN = "guru_asrama_perempuan"
    KETUA_WARDEN = "ketua_warden"


class DayOfWeek(str, Enum):
    ISNIN = "isnin"
    SELASA = "selasa"
    RABU = "rabu"
    KHAMIS = "khamis"
    JUMAAT = "jumaat"
    SABTU = "sabtu"
    AHAD = "ahad"


# Request Models
class WardenScheduleCreate(BaseModel):
    warden_id: str  # Reference to user ID
    tarikh_mula: str  # YYYY-MM-DD
    tarikh_tamat: str  # YYYY-MM-DD
    waktu_mula: str = "18:00"  # HH:MM (default 6pm)
    waktu_tamat: str = "07:00"  # HH:MM (default 7am)
    blok_assigned: Optional[List[str]] = []  # Blocks assigned during duty
    catatan: Optional[str] = None


class WardenScheduleUpdate(BaseModel):
    tarikh_mula: Optional[str] = None
    tarikh_tamat: Optional[str] = None
    waktu_mula: Optional[str] = None
    waktu_tamat: Optional[str] = None
    blok_assigned: Optional[List[str]] = None
    catatan: Optional[str] = None
    is_active: Optional[bool] = None


class WardenScheduleResponse(BaseModel):
    id: str
    warden_id: str
    warden_name: str
    warden_phone: str
    jawatan: str
    tarikh_mula: str
    tarikh_tamat: str
    waktu_mula: str
    waktu_tamat: str
    blok_assigned: List[str]
    catatan: Optional[str]
    is_active: bool
    created_at: str


class DutyWardenResponse(BaseModel):
    id: str
    warden_id: str
    warden_name: str
    warden_phone: str
    warden_email: str
    jawatan: str
    jawatan_display: str
    waktu_mula: str
    waktu_tamat: str
    blok_assigned: List[str]
    is_on_duty: bool


class WardenCalendarDay(BaseModel):
    tarikh: str
    hari: str
    wardens: List[DutyWardenResponse]


class WardenCalendarResponse(BaseModel):
    bulan: int
    tahun: int
    days: List[WardenCalendarDay]


# Position Display Names
WARDEN_POSITION_DISPLAY = {
    "warden_asrama_lelaki": "Warden Asrama Lelaki",
    "warden_asrama_perempuan": "Warden Asrama Perempuan",
    "guru_asrama_lelaki": "Guru Asrama Lelaki",
    "guru_asrama_perempuan": "Guru Asrama Perempuan",
    "ketua_warden": "Ketua Warden"
}

DAY_OF_WEEK_DISPLAY = {
    "isnin": "Isnin",
    "selasa": "Selasa",
    "rabu": "Rabu",
    "khamis": "Khamis",
    "jumaat": "Jumaat",
    "sabtu": "Sabtu",
    "ahad": "Ahad"
}

DAY_OF_WEEK_EN_TO_MY = {
    "Monday": "Isnin",
    "Tuesday": "Selasa",
    "Wednesday": "Rabu",
    "Thursday": "Khamis",
    "Friday": "Jumaat",
    "Saturday": "Sabtu",
    "Sunday": "Ahad"
}
