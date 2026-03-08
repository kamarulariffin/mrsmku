"""
Complaints Module - Pydantic Models
Modul Aduan Digital untuk MRSMKU Smart360
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class ComplaintType(str, Enum):
    DISIPLIN = "disiplin"
    KESELAMATAN = "keselamatan"
    KEBAJIKAN = "kebajikan"
    FASILITI_ROSAK = "fasiliti_rosak"
    PENAPIS_AIR = "penapis_air"
    PARANORMAL = "paranormal"  # NEW: Kategori Paranormal
    MAKANAN = "makanan"
    GANGGUAN_PELAJAR = "gangguan_pelajar"
    LAIN_LAIN = "lain_lain"


class ComplaintPriority(str, Enum):
    RENDAH = "rendah"
    SEDERHANA = "sederhana"
    KRITIKAL = "kritikal"


class ComplaintStatus(str, Enum):
    BARU_DIHANTAR = "baru_dihantar"
    DITERIMA_WARDEN = "diterima_warden"
    DALAM_SIASATAN = "dalam_siasatan"
    DALAM_TINDAKAN = "dalam_tindakan"
    MENUNGGU_MAKLUM_BALAS = "menunggu_maklum_balas"
    DI_LUAR_BIDANG = "di_luar_bidang"  # NEW: Di Luar Bidang Tugas Warden
    SELESAI = "selesai"
    DITUTUP = "ditutup"


class ComplaintRelation(str, Enum):
    IBU_BAPA = "ibu_bapa"
    PELAJAR = "pelajar"
    MUAFAKAT = "muafakat"


# Request Models
class ComplaintCreate(BaseModel):
    nama_pengadu: str = Field(..., min_length=2, max_length=100)
    hubungan: ComplaintRelation
    nombor_maktab: str = Field(..., min_length=1, max_length=20)
    nama_pelajar: str = Field(..., min_length=2, max_length=100)
    tingkatan: int = Field(..., ge=1, le=6)
    asrama: str = Field(..., min_length=1, max_length=50)
    jenis_aduan: ComplaintType
    penerangan: str = Field(..., min_length=10, max_length=2000)
    gambar_sokongan: Optional[List[str]] = []  # Base64 encoded images
    tahap_keutamaan: ComplaintPriority = ComplaintPriority.SEDERHANA


class ComplaintStatusUpdate(BaseModel):
    status: ComplaintStatus
    catatan: Optional[str] = None


class ComplaintActionCreate(BaseModel):
    tindakan: str = Field(..., min_length=5, max_length=1000)
    bukti_tindakan: Optional[List[str]] = []  # Base64 encoded images
    respon_kepada_ibubapa: Optional[str] = None


class ComplaintResponse(BaseModel):
    id: str
    nombor_aduan: str
    nama_pengadu: str
    hubungan: str
    nombor_maktab: str
    nama_pelajar: str
    tingkatan: int
    asrama: str
    jenis_aduan: str
    jenis_aduan_display: str
    penerangan: str
    gambar_sokongan: List[str]
    tahap_keutamaan: str
    tahap_keutamaan_display: str
    status: str
    status_display: str
    warden_assigned: Optional[str]
    warden_name: Optional[str]
    created_at: str
    updated_at: str
    pengadu_id: Optional[str]


class ComplaintDetailResponse(ComplaintResponse):
    audit_log: List[dict]
    tindakan_list: List[dict]


class ComplaintDashboardStats(BaseModel):
    jumlah_hari_ini: int
    aduan_kritikal: int
    aduan_belum_selesai: int
    prestasi_respon: dict
    aduan_ikut_kategori: dict
    aduan_ikut_status: dict


class ComplaintMonthlyReport(BaseModel):
    bulan: str
    tahun: int
    jenis_aduan_kerap: List[dict]
    warden_terpantas: List[dict]
    trend_masalah: List[dict]
    jumlah_aduan: int
    kadar_penyelesaian: float


# Complaint Type Display Names
COMPLAINT_TYPE_DISPLAY = {
    "disiplin": "Disiplin",
    "keselamatan": "Keselamatan",
    "kebajikan": "Kebajikan",
    "fasiliti_rosak": "Fasiliti Rosak",
    "penapis_air": "Penapis Air",
    "paranormal": "Paranormal",
    "makanan": "Makanan",
    "gangguan_pelajar": "Gangguan Pelajar Lain",
    "lain_lain": "Lain-lain"
}

COMPLAINT_PRIORITY_DISPLAY = {
    "rendah": "Rendah",
    "sederhana": "Sederhana",
    "kritikal": "Kritikal"
}

COMPLAINT_STATUS_DISPLAY = {
    "baru_dihantar": "Baru Dihantar",
    "diterima_warden": "Diterima Warden",
    "dalam_siasatan": "Dalam Siasatan",
    "dalam_tindakan": "Dalam Tindakan",
    "menunggu_maklum_balas": "Menunggu Maklum Balas Ibu Bapa",
    "di_luar_bidang": "Di Luar Bidang Tugas",
    "selesai": "Selesai",
    "ditutup": "Ditutup"
}

# Peraturan dan Panduan untuk aduan yang di luar bidang tugas warden
# Warden boleh rujuk ibu bapa kepada peraturan ini
COMPLAINT_GUIDELINES = {
    "disiplin": {
        "title": "Peraturan Disiplin Pelajar MRSMKU",
        "items": [
            "Pelajar hendaklah mematuhi peraturan maktab pada setiap masa",
            "Pelajar tidak boleh bergaduh atau berkelakuan ganas dalam asrama",
            "Pelajar mesti memakai pakaian yang sopan dan kemas",
            "Pelajar tidak dibenarkan membawa barang larangan",
            "Untuk kes disiplin berat, sila rujuk kepada Unit HEM maktab"
        ],
        "contact": "Unit Hal Ehwal Murid (HEM): 03-XXXXXXXX"
    },
    "keselamatan": {
        "title": "Panduan Keselamatan Asrama",
        "items": [
            "Pelajar mesti keluar masuk asrama melalui pintu utama",
            "Pelawat perlu mendaftar di pejabat pengawal keselamatan",
            "Waktu keluar bermalam perlu kelulusan warden terlebih dahulu",
            "Untuk kecemasan, hubungi pengawal keselamatan 24 jam",
            "Laporan kehilangan barang perlu dibuat dalam masa 24 jam"
        ],
        "contact": "Pengawal Keselamatan: 03-XXXXXXXX"
    },
    "kebajikan": {
        "title": "Panduan Kebajikan Pelajar",
        "items": [
            "Pelajar boleh memohon bantuan kebajikan melalui Unit HEM",
            "Permohonan yuran perlu disertakan dokumen sokongan",
            "Kes kecemasan keluarga boleh dirujuk kepada kaunselor maktab",
            "Bantuan makanan tambahan boleh dimohon melalui warden",
            "Untuk masalah kesihatan mental, sila hubungi kaunselor"
        ],
        "contact": "Unit Kaunseling: 03-XXXXXXXX"
    },
    "fasiliti_rosak": {
        "title": "Prosedur Laporan Fasiliti Rosak",
        "items": [
            "Laporan kerosakan perlu dibuat dalam masa 24 jam",
            "Kerosakan akibat kecuaian akan ditanggung oleh pelajar",
            "Penyelenggaraan besar akan diuruskan oleh pihak JKR",
            "Kerosakan kecil akan dibaiki dalam tempoh 3-7 hari bekerja",
            "Untuk kerosakan kritikal, sila hubungi pejabat maktab"
        ],
        "contact": "Unit Penyelenggaraan: 03-XXXXXXXX"
    },
    "penapis_air": {
        "title": "Panduan Penapis Air Asrama",
        "items": [
            "Penapis air diservis setiap 3 bulan sekali",
            "Laporan kerosakan penapis air akan diurus dalam 24-48 jam",
            "Sementara menunggu pembaikan, air minuman boleh diambil dari blok berdekatan",
            "Jangan cuba membaiki penapis air sendiri",
            "Hubungi warden bertugas untuk laporan segera"
        ],
        "contact": "Unit Penyelenggaraan: 03-XXXXXXXX"
    },
    "paranormal": {
        "title": "Panduan Kejadian Paranormal/Luar Biasa",
        "items": [
            "Kekal tenang dan jangan panik",
            "Hubungi warden bertugas dengan segera",
            "Berkumpul di kawasan terbuka jika perlu",
            "Baca doa dan zikir untuk ketenangan",
            "Kes serius akan dirujuk kepada pihak berkaitan"
        ],
        "contact": "Warden Bertugas: Hubungi segera"
    },
    "makanan": {
        "title": "Panduan Makanan & Dewan Makan",
        "items": [
            "Menu makanan disediakan mengikut jadual yang ditetapkan",
            "Permintaan diet khas perlu disertakan sijil doktor",
            "Aduan kualiti makanan akan dikemukakan kepada kontraktor",
            "Pelajar tidak dibenarkan membawa makanan luar ke asrama",
            "Waktu makan adalah tetap dan perlu dipatuhi"
        ],
        "contact": "Penyelia Dewan Makan: 03-XXXXXXXX"
    },
    "gangguan_pelajar": {
        "title": "Panduan Menangani Gangguan/Buli",
        "items": [
            "Laporkan segera kepada warden atau guru bertugas",
            "Simpan bukti (mesej, gambar) jika ada",
            "Kes buli siber boleh dilaporkan kepada PDRM",
            "Mangsa buli boleh dirujuk kepada kaunselor",
            "Tindakan tegas akan diambil terhadap pembuli"
        ],
        "contact": "Unit Disiplin: 03-XXXXXXXX"
    },
    "lain_lain": {
        "title": "Panduan Am",
        "items": [
            "Sila pastikan aduan berkaitan dengan hal ehwal asrama",
            "Untuk hal akademik, sila hubungi guru kelas",
            "Untuk hal kewangan, sila hubungi pejabat maktab",
            "Aduan berkaitan pengangkutan, hubungi unit pengangkutan",
            "Untuk pertanyaan am, sila hubungi pejabat maktab"
        ],
        "contact": "Pejabat MRSMKU: 03-XXXXXXXX"
    }
}
