"""
Hostel Blocks Module - Pydantic Models
Modul Blok Asrama untuk MRSMKU Smart360
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Any
from enum import Enum


def _beds_per_level_from_room_config(room_config_per_level: Optional[List[List[Any]]]) -> Optional[List[int]]:
    """Kira beds_per_level dari room_config_per_level (jumlah katil per tingkat)."""
    if not room_config_per_level or not isinstance(room_config_per_level, list):
        return None
    result = []
    for level_segments in room_config_per_level:
        if not isinstance(level_segments, list):
            result.append(0)
            continue
        total = 0
        for seg in level_segments:
            if isinstance(seg, dict):
                r = int(seg.get("rooms") or 0)
                b = int(seg.get("beds_per_room") or 0)
                if b < 1:
                    b = 1
                total += r * b
            elif hasattr(seg, "rooms") and hasattr(seg, "beds_per_room"):
                total += seg.rooms * seg.beds_per_room
        result.append(total)
    return result if any(result) else None


class Gender(str, Enum):
    LELAKI = "lelaki"
    PEREMPUAN = "perempuan"


class HostelBlockCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=10)  # JA, JB, JC, I, H, G, F, E
    name: str = Field(..., min_length=2, max_length=100)
    gender: Gender
    levels: Optional[List[str]] = []  # ["Tingkat 1", "Tingkat 2", etc.]
    capacity: Optional[int] = None
    warden_id: Optional[str] = None  # Default warden for this block
    description: Optional[str] = None
    is_active: bool = True
    # Jumlah katil per tingkat (sama susunan dengan levels); untuk jana kod katil
    beds_per_level: Optional[List[int]] = None  # e.g. [40, 40, 40] untuk 3 tingkat
    # Katil per bilik (untuk blok ini); digunakan dalam laporan katil kosong jika ada
    beds_per_room: Optional[int] = None  # e.g. 2 atau 3
    # Pilihan: konfigurasi bilik per tingkat (cth. 10 bilik×3 katil + 5 bilik×5 katil). Jika ada, beds_per_level dikira dari sini.
    room_config_per_level: Optional[List[List[dict]]] = None


class HostelBlockUpdate(BaseModel):
    name: Optional[str] = None
    gender: Optional[Gender] = None
    levels: Optional[List[str]] = None
    capacity: Optional[int] = None
    warden_id: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    beds_per_level: Optional[List[int]] = None
    beds_per_room: Optional[int] = None
    room_config_per_level: Optional[List[List[dict]]] = None


class HostelBlockResponse(BaseModel):
    id: str
    code: str
    name: str
    gender: str
    gender_display: str
    levels: List[str]
    capacity: Optional[int]
    warden_id: Optional[str]
    warden_name: Optional[str]
    description: Optional[str]
    is_active: bool
    student_count: int
    created_at: str
    beds_per_level: Optional[List[int]] = None
    beds_per_room: Optional[int] = None
    bed_codes_count: Optional[int] = None  # jumlah kod katil terhasil dari beds_per_level
    room_config_per_level: Optional[List[List[dict]]] = None


class HostelBlockListResponse(BaseModel):
    blocks: List[HostelBlockResponse]
    total: int


# Gender Display Names
GENDER_DISPLAY = {
    "lelaki": "Lelaki",
    "perempuan": "Perempuan"
}

# Default Hostel Blocks for MRSMKU
# beds_per_level: bilangan katil per tingkat (ikut susunan levels); kosong = tiada data katil
DEFAULT_HOSTEL_BLOCKS = [
    {"code": "JA", "name": "Asrama JA", "gender": "lelaki", "levels": ["Tingkat 1", "Tingkat 2", "Tingkat 3"], "beds_per_level": [40, 40, 40]},
    {"code": "JB", "name": "Asrama JB", "gender": "lelaki", "levels": ["Tingkat 1", "Tingkat 2", "Tingkat 3"], "beds_per_level": [40, 40, 40]},
    {"code": "JC", "name": "Asrama JC", "gender": "lelaki", "levels": ["Tingkat 1", "Tingkat 2", "Tingkat 3"], "beds_per_level": [40, 40, 40]},
    {"code": "I", "name": "Asrama I", "gender": "perempuan", "levels": ["Tingkat 1", "Tingkat 2", "Tingkat 3"], "beds_per_level": [40, 40, 40]},
    {"code": "H", "name": "Asrama H", "gender": "perempuan", "levels": ["Tingkat 1", "Tingkat 2", "Tingkat 3"], "beds_per_level": [40, 40, 40]},
    {"code": "G", "name": "Asrama G", "gender": "perempuan", "levels": ["Tingkat 1", "Tingkat 2"], "beds_per_level": [40, 40]},
    {"code": "F", "name": "Asrama F", "gender": "perempuan", "levels": ["Tingkat 1", "Tingkat 2"], "beds_per_level": [40, 40]},
    {"code": "E", "name": "Asrama E", "gender": "perempuan", "levels": ["Tingkat 1", "Tingkat 2"], "beds_per_level": [40, 40]},
]
