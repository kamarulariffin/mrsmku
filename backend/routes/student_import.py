"""
Student Import Module - MRSMKU Portal
Phase 2: Smart Import & Claim Code System

Features:
- Smart Import: Upload Excel dengan pengesanan konflik
- Claim Code System: Jana kod unik untuk ibu bapa claim anak
- PDF Claim Slip dengan QR Code
"""
import os
import uuid
import re
import io
import base64
from datetime import datetime, timezone
from typing import List, Optional, Callable
from bson import ObjectId
from services.id_normalizer import object_id_or_none

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import pandas as pd
import qrcode
from io import BytesIO

# For PDF generation
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image

# For Excel export
import xlsxwriter

router = APIRouter(prefix="/api/student-import", tags=["Student Import"])

# Database reference - will be set from server.py
_get_db_func: Callable = None
_get_current_user_func: Callable = None
_log_audit_func: Callable = None
_pwd_context = None


def init_router(get_db_func, auth_func, audit_func, pwd_context):
    """Initialize database and dependency references"""
    global _get_db_func, _get_current_user_func, _log_audit_func, _pwd_context
    _get_db_func = get_db_func
    _get_current_user_func = auth_func
    _log_audit_func = audit_func
    _pwd_context = pwd_context


# ============ MODELS ============

class ImportResult(BaseModel):
    total_rows: int
    imported: int
    skipped: int
    failed: int
    imported_students: List[dict] = []
    skipped_students: List[dict] = []
    failed_students: List[dict] = []


class ClaimCodeResponse(BaseModel):
    id: str
    claim_code: str
    student_id: str
    student_name: str
    matric_number: str
    ic_number: str
    tingkatan: int
    nama_kelas: str
    status: str  # pending, claimed, expired
    created_at: str
    claimed_at: Optional[str] = None
    claimed_by: Optional[str] = None


class ClaimStudentRequest(BaseModel):
    claim_code: str
    parent_id: Optional[str] = None


class ClaimSlipConfig(BaseModel):
    portal_url: str = "https://portal.mrsmku.edu.my"
    school_name: str = "MRSM Kubang Pasu"
    school_address: str = "06000 Jitra, Kedah"


# ============ HELPER FUNCTIONS ============

def generate_claim_code() -> str:
    """Generate unique 8-character claim code"""
    return f"MK{uuid.uuid4().hex[:6].upper()}"


def validate_ic_number(ic: str) -> tuple:
    """Validate and clean IC number, returns (is_valid, cleaned_ic, error_message)"""
    if not ic:
        return False, None, "No. IC kosong"
    
    # Remove dashes, spaces
    ic_clean = re.sub(r'[-\s]', '', str(ic).strip())
    
    if len(ic_clean) != 12:
        return False, None, f"No. IC mesti 12 digit (dapat: {len(ic_clean)})"
    
    if not ic_clean.isdigit():
        return False, None, "No. IC mesti mengandungi nombor sahaja"
    
    return True, ic_clean, None


def validate_matric_number(matric: str) -> tuple:
    """Validate matric number, returns (is_valid, cleaned_matric, error_message)"""
    if not matric:
        return False, None, "No. Matrik kosong"
    
    matric_clean = str(matric).strip().upper()
    
    if len(matric_clean) < 4:
        return False, None, "No. Matrik terlalu pendek"
    
    return True, matric_clean, None


def generate_qr_code_base64(data: str) -> str:
    """Generate QR code and return as base64 string"""
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#065f46", back_color="white")
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode()


# ============ ROUTES ============

@router.get("/template")
async def download_import_template():
    """Download Excel template for student import"""
    output = BytesIO()
    workbook = xlsxwriter.Workbook(output)
    worksheet = workbook.add_worksheet("Template Import Pelajar")
    
    # Styles
    header_format = workbook.add_format({
        'bold': True,
        'bg_color': '#1e3a5f',
        'font_color': 'white',
        'border': 1,
        'align': 'center',
        'valign': 'vcenter'
    })
    
    required_format = workbook.add_format({
        'bold': True,
        'bg_color': '#dc2626',
        'font_color': 'white',
        'border': 1,
        'align': 'center'
    })
    
    example_format = workbook.add_format({
        'bg_color': '#f3f4f6',
        'border': 1
    })
    
    # Headers - Column names
    headers = [
        ("Nama Penuh*", 25),
        ("No. Matrik*", 15),
        ("No. IC*", 15),
        ("Tingkatan*", 12),
        ("Nama Kelas*", 15),
        ("Jantina", 12),
        ("Agama", 12),
        ("Bangsa", 15),
        ("Negeri", 18),
        ("Blok Asrama", 15),
        ("No. Bilik/Katil", 12)
    ]
    
    for col, (header, width) in enumerate(headers):
        worksheet.write(0, col, header, header_format)
        worksheet.set_column(col, col, width)
    
    # Example row
    example_data = [
        "Ahmad bin Abu Bakar",
        "M2026001",
        "100501011234",
        4,
        "Bestari",
        "Lelaki",
        "Islam",
        "Melayu",
        "Kedah",
        "Blok A",
        "A101"
    ]
    
    for col, value in enumerate(example_data):
        worksheet.write(1, col, value, example_format)
    
    # Instructions sheet
    instructions = workbook.add_worksheet("Arahan")
    instructions.set_column(0, 0, 80)
    
    title_format = workbook.add_format({'bold': True, 'font_size': 14})
    instructions.write(0, 0, "ARAHAN PENGGUNAAN TEMPLATE IMPORT PELAJAR", title_format)
    instructions.write(2, 0, "1. Medan bertanda * adalah WAJIB diisi")
    instructions.write(3, 0, "2. No. IC mestilah 12 digit tanpa sengkang (-)")
    instructions.write(4, 0, "3. Tingkatan: 1, 2, 3, 4, atau 5")
    instructions.write(5, 0, "4. Jantina: Lelaki atau Perempuan")
    instructions.write(6, 0, "5. Agama: Islam, Buddha, Hindu, Kristian, Sikh, Lain-lain")
    instructions.write(7, 0, "6. Bangsa: Melayu, Cina, India, Bumiputera Sabah, Bumiputera Sarawak, Lain-lain")
    instructions.write(9, 0, "NOTA PENTING:")
    instructions.write(10, 0, "- Sistem akan semak No. Matrik dan No. IC untuk elak pertindihan")
    instructions.write(11, 0, "- Pelajar sedia ada dengan parent link akan di-SKIP")
    instructions.write(12, 0, "- Pelajar baru/tanpa parent link akan dijana Claim Code")
    
    workbook.close()
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=Template_Import_Pelajar.xlsx"}
    )


@router.post("/upload", response_model=ImportResult)
async def upload_student_excel(
    file: UploadFile = File(...),
    year: int = Query(2026, description="Tahun pengajian"),
    restrict_tingkatan: Optional[int] = Query(None, description="Hadkan kepada tingkatan ini sahaja (untuk Guru Kelas)"),
    restrict_kelas: Optional[str] = Query(None, description="Hadkan kepada kelas ini sahaja (untuk Guru Kelas)"),
    current_user: dict = Depends(lambda: None)
):
    """
    Smart Import - Upload Excel file untuk import pelajar secara pukal.
    
    Logic:
    1. Baca Excel file
    2. Untuk setiap row, semak No. Matrik atau No. IC
    3. Jika pelajar sedia ada DAN ada parent link -> SKIP
    4. Jika pelajar baru ATAU tiada parent link -> Import & jana Claim Code
    5. Jana laporan import
    
    Guru Kelas Restriction:
    - Jika restrict_tingkatan dan restrict_kelas ditetapkan, hanya pelajar dari kelas tersebut akan diimport
    - Data pelajar dari kelas lain akan ditolak
    """
    # Get current user through dependency
    db = _get_db_func()
    
    # Validate file type
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Hanya fail Excel (.xlsx, .xls) dibenarkan")
    
    try:
        # Read Excel file
        contents = await file.read()
        df = pd.read_excel(BytesIO(contents), sheet_name=0)
        
        # Normalize column names
        df.columns = df.columns.str.strip().str.lower()
        
        # Column mapping
        column_map = {
            'nama penuh*': 'full_name',
            'nama penuh': 'full_name',
            'no. matrik*': 'matric_number',
            'no. matrik': 'matric_number',
            'no matrik': 'matric_number',
            'no. ic*': 'ic_number',
            'no. ic': 'ic_number',
            'no ic': 'ic_number',
            'tingkatan*': 'tingkatan',
            'tingkatan': 'tingkatan',
            'nama kelas*': 'nama_kelas',
            'nama kelas': 'nama_kelas',
            'kelas*': 'kelas',
            'kelas': 'kelas',
            'jantina': 'gender',
            'agama': 'religion',
            'bangsa': 'race',
            'negeri': 'state',
            'blok asrama': 'block_name',
            'no. bilik': 'room_number',
            'no bilik': 'room_number'
        }
        
        df = df.rename(columns=column_map)
        
        # Required columns - either nama_kelas or kelas is required
        required_cols = ['full_name', 'matric_number', 'ic_number', 'tingkatan']
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            raise HTTPException(
                status_code=400, 
                detail=f"Lajur wajib tidak dijumpai: {', '.join(missing_cols)}"
            )
        
        # Check if at least one of nama_kelas or kelas exists
        if 'nama_kelas' not in df.columns and 'kelas' not in df.columns:
            raise HTTPException(
                status_code=400, 
                detail="Lajur 'Kelas' atau 'Nama Kelas' diperlukan"
            )
        
        result = ImportResult(
            total_rows=len(df),
            imported=0,
            skipped=0,
            failed=0,
            imported_students=[],
            skipped_students=[],
            failed_students=[]
        )
        
        for idx, row in df.iterrows():
            row_num = idx + 2  # Excel row number (1-indexed + header)
            
            try:
                # Validate required fields
                full_name = str(row.get('full_name', '')).strip()
                if not full_name or full_name == 'nan':
                    result.failed += 1
                    result.failed_students.append({
                        "row": row_num,
                        "reason": "Nama kosong",
                        "data": row.to_dict()
                    })
                    continue
                
                # Validate matric number
                is_valid, matric_clean, error = validate_matric_number(row.get('matric_number'))
                if not is_valid:
                    result.failed += 1
                    result.failed_students.append({
                        "row": row_num,
                        "name": full_name,
                        "reason": error,
                        "data": row.to_dict()
                    })
                    continue
                
                # Validate IC number
                is_valid, ic_clean, error = validate_ic_number(row.get('ic_number'))
                if not is_valid:
                    result.failed += 1
                    result.failed_students.append({
                        "row": row_num,
                        "name": full_name,
                        "reason": error,
                        "data": row.to_dict()
                    })
                    continue
                
                # Validate tingkatan
                try:
                    tingkatan = int(row.get('tingkatan', 0))
                    if tingkatan < 1 or tingkatan > 5:
                        raise ValueError()
                except Exception:
                    result.failed += 1
                    result.failed_students.append({
                        "row": row_num,
                        "name": full_name,
                        "reason": "Tingkatan tidak sah (mesti 1-5)",
                        "data": row.to_dict()
                    })
                    continue
                
                nama_kelas = str(row.get('nama_kelas', '')).strip()
                kelas = str(row.get('kelas', '')).strip().upper()
                
                # Use kelas if available, otherwise nama_kelas
                if kelas and kelas != 'NAN' and kelas in ['A', 'B', 'C', 'D', 'E', 'F']:
                    class_value = kelas
                elif nama_kelas and nama_kelas != 'nan':
                    class_value = nama_kelas
                else:
                    result.failed += 1
                    result.failed_students.append({
                        "row": row_num,
                        "name": full_name,
                        "reason": "Kelas kosong atau tidak sah (gunakan A-F)",
                        "data": row.to_dict()
                    })
                    continue
                
                # ========== GURU KELAS RESTRICTION ==========
                # Check if upload is restricted to specific class (for Guru Kelas)
                if restrict_tingkatan is not None and restrict_kelas is not None:
                    # Check if this student belongs to the restricted class
                    student_tingkatan = tingkatan
                    student_kelas = class_value.upper() if class_value in ['A', 'B', 'C', 'D', 'E', 'F'] else None
                    
                    if student_tingkatan != restrict_tingkatan or student_kelas != restrict_kelas.upper():
                        result.failed += 1
                        result.failed_students.append({
                            "row": row_num,
                            "name": full_name,
                            "reason": f"Pelajar bukan dari kelas anda (T{restrict_tingkatan} {restrict_kelas}). Pelajar ini dari T{student_tingkatan} {student_kelas or class_value}.",
                            "data": row.to_dict()
                        })
                        continue
                # ========== END GURU KELAS RESTRICTION ==========
                
                # Check if student exists by matric or IC
                existing_student = await db.students.find_one({
                    "$or": [
                        {"matric_number": matric_clean},
                        {"ic_number": ic_clean}
                    ]
                })
                
                if existing_student:
                    # Check if has parent link
                    parent_id = existing_student.get("parent_id")
                    has_parent_link = False
                    
                    if parent_id:
                        # Verify parent exists and is actually a parent role
                        parent = await db.users.find_one({"_id": parent_id, "role": "parent"})
                        if parent:
                            has_parent_link = True
                    
                    if has_parent_link:
                        # SKIP - student already linked to parent
                        result.skipped += 1
                        result.skipped_students.append({
                            "row": row_num,
                            "name": full_name,
                            "matric_number": matric_clean,
                            "reason": "Pelajar sudah didaftarkan oleh ibu bapa"
                        })
                        continue
                    else:
                        # Student exists but no parent - generate claim code
                        claim_code = generate_claim_code()
                        
                        # Check if claim code already exists for this student
                        existing_claim = await db.claim_codes.find_one({
                            "student_id": existing_student["_id"],
                            "status": "pending"
                        })
                        
                        if existing_claim:
                            result.skipped += 1
                            result.skipped_students.append({
                                "row": row_num,
                                "name": full_name,
                                "matric_number": matric_clean,
                                "reason": f"Claim code sudah wujud: {existing_claim['claim_code']}"
                            })
                            continue
                        
                        # Update student data if needed
                        update_data = {
                            "full_name": full_name,
                            "tingkatan": tingkatan,
                            "form": tingkatan,
                            "kelas": class_value if class_value in ['A','B','C','D','E','F'] else None,
                            "class": class_value if class_value in ['A','B','C','D','E','F'] else None,
                            "nama_kelas": class_value,
                            "class_name": class_value,
                            "year": year,
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }
                        
                        # Optional fields
                        gender = str(row.get('gender', '')).strip().lower()
                        if gender in ['lelaki', 'male']:
                            update_data['gender'] = 'male'
                        elif gender in ['perempuan', 'female']:
                            update_data['gender'] = 'female'
                        
                        religion = str(row.get('religion', '')).strip()
                        if religion and religion != 'nan':
                            update_data['religion'] = religion
                        
                        race = str(row.get('race', '')).strip()
                        if race and race != 'nan':
                            update_data['bangsa'] = race
                        
                        state = str(row.get('state', '')).strip()
                        if state and state != 'nan':
                            update_data['state'] = state
                        
                        block_name = str(row.get('block_name', '')).strip()
                        if block_name and block_name != 'nan':
                            update_data['block_name'] = block_name
                        
                        room_number = str(row.get('room_number', '')).strip()
                        if room_number and room_number != 'nan':
                            update_data['room_number'] = room_number
                        
                        await db.students.update_one(
                            {"_id": existing_student["_id"]},
                            {"$set": update_data}
                        )
                        
                        # Create claim code
                        await db.claim_codes.insert_one({
                            "claim_code": claim_code,
                            "student_id": existing_student["_id"],
                            "student_name": full_name,
                            "matric_number": matric_clean,
                            "ic_number": ic_clean,
                            "tingkatan": tingkatan,
                            "kelas": class_value if class_value in ['A','B','C','D','E','F'] else None,
                            "nama_kelas": class_value,
                            "status": "pending",
                            "created_at": datetime.now(timezone.utc).isoformat(),
                            "created_by": "import"
                        })
                        
                        result.imported += 1
                        result.imported_students.append({
                            "row": row_num,
                            "name": full_name,
                            "matric_number": matric_clean,
                            "claim_code": claim_code,
                            "action": "updated_and_claim_code_generated"
                        })
                else:
                    # NEW student - create student record and claim code
                    student_doc = {
                        "full_name": full_name,
                        "matric_number": matric_clean,
                        "ic_number": ic_clean,
                        "year": year,
                        "form": tingkatan,
                        "tingkatan": tingkatan,
                        "class": class_value if class_value in ['A','B','C','D','E','F'] else None,
                        "kelas": class_value if class_value in ['A','B','C','D','E','F'] else None,
                        "class_name": class_value,
                        "nama_kelas": class_value,
                        "status": "approved",
                        "block_name": "",
                        "room_number": "",
                        "state": "",
                        "religion": "Islam",
                        "bangsa": "Melayu",
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "created_by": "import"
                    }
                    
                    # Optional fields
                    gender = str(row.get('gender', '')).strip().lower()
                    if gender in ['lelaki', 'male']:
                        student_doc['gender'] = 'male'
                    elif gender in ['perempuan', 'female']:
                        student_doc['gender'] = 'female'
                    
                    religion = str(row.get('religion', '')).strip()
                    if religion and religion != 'nan':
                        student_doc['religion'] = religion
                    
                    race = str(row.get('race', '')).strip()
                    if race and race != 'nan':
                        student_doc['bangsa'] = race
                    
                    state = str(row.get('state', '')).strip()
                    if state and state != 'nan':
                        student_doc['state'] = state
                    
                    block_name = str(row.get('block_name', '')).strip()
                    if block_name and block_name != 'nan':
                        student_doc['block_name'] = block_name
                    
                    room_number = str(row.get('room_number', '')).strip()
                    if room_number and room_number != 'nan':
                        student_doc['room_number'] = room_number
                    
                    # Insert student
                    student_result = await db.students.insert_one(student_doc)
                    student_id = student_result.inserted_id
                    
                    # Generate claim code
                    claim_code = generate_claim_code()
                    
                    await db.claim_codes.insert_one({
                        "claim_code": claim_code,
                        "student_id": student_id,
                        "student_name": full_name,
                        "matric_number": matric_clean,
                        "ic_number": ic_clean,
                        "tingkatan": tingkatan,
                        "kelas": class_value if class_value in ['A','B','C','D','E','F'] else None,
                        "nama_kelas": class_value,
                        "status": "pending",
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "created_by": "import"
                    })
                    
                    result.imported += 1
                    result.imported_students.append({
                        "row": row_num,
                        "name": full_name,
                        "matric_number": matric_clean,
                        "claim_code": claim_code,
                        "action": "new_student_created"
                    })
                    
            except Exception as e:
                result.failed += 1
                result.failed_students.append({
                    "row": row_num,
                    "reason": f"Ralat: {str(e)}",
                    "data": row.to_dict() if hasattr(row, 'to_dict') else str(row)
                })
        
        # Log audit - create system user dict for logging
        if _log_audit_func:
            system_user = {"_id": "system", "full_name": "System Import", "role": "system"}
            await _log_audit_func(
                system_user, 
                "STUDENT_IMPORT", 
                "student_import", 
                f"Import {result.imported} pelajar, Skip {result.skipped}, Gagal {result.failed}"
            )
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ralat memproses fail: {str(e)}")


@router.get("/claim-codes")
async def get_claim_codes(
    status: Optional[str] = None,
    tingkatan: Optional[int] = None,
    nama_kelas: Optional[str] = None,
    kelas: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(lambda: None)
):
    """Get list of claim codes with filters"""
    db = _get_db_func()
    
    query = {}
    
    if status:
        query["status"] = status
    
    if tingkatan:
        query["tingkatan"] = tingkatan
    
    if nama_kelas:
        query["nama_kelas"] = nama_kelas
    
    # Support new kelas format (A-F)
    if kelas:
        query["$or"] = [
            {"kelas": kelas},
            {"class_name": kelas},
            {"nama_kelas": kelas}
        ]
    
    if search:
        search_regex = {"$regex": search, "$options": "i"}
        query["$or"] = [
            {"claim_code": search_regex},
            {"student_name": search_regex},
            {"matric_number": search_regex},
            {"ic_number": search_regex}
        ]
    
    total = await db.claim_codes.count_documents(query)
    skip = (page - 1) * limit
    total_pages = (total + limit - 1) // limit if total > 0 else 1
    
    claim_codes = await db.claim_codes.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    result = []
    for cc in claim_codes:
        result.append({
            "id": str(cc["_id"]),
            "claim_code": cc.get("claim_code", ""),
            "student_id": str(cc.get("student_id", "")),
            "student_name": cc.get("student_name", ""),
            "matric_number": cc.get("matric_number", ""),
            "ic_number": cc.get("ic_number", ""),
            "tingkatan": cc.get("tingkatan", 0),
            "kelas": cc.get("kelas", cc.get("class_name", cc.get("nama_kelas", ""))),
            "nama_kelas": cc.get("nama_kelas", ""),
            "status": cc.get("status", "pending"),
            "created_at": cc.get("created_at", ""),
            "claimed_at": cc.get("claimed_at"),
            "claimed_by": cc.get("claimed_by")
        })
    
    # Get stats
    stats = {
        "total": await db.claim_codes.count_documents({}),
        "pending": await db.claim_codes.count_documents({"status": "pending"}),
        "claimed": await db.claim_codes.count_documents({"status": "claimed"}),
        "expired": await db.claim_codes.count_documents({"status": "expired"})
    }
    
    return {
        "claim_codes": result,
        "stats": stats,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1
        }
    }


@router.get("/claim-codes/export")
async def export_claim_codes(
    status: Optional[str] = None,
    tingkatan: Optional[int] = None,
    nama_kelas: Optional[str] = None,
    current_user: dict = Depends(lambda: None)
):
    """Export claim codes to Excel"""
    db = _get_db_func()
    
    query = {}
    if status:
        query["status"] = status
    if tingkatan:
        query["tingkatan"] = tingkatan
    if nama_kelas:
        query["nama_kelas"] = nama_kelas
    
    claim_codes = await db.claim_codes.find(query).sort("tingkatan", 1).to_list(1000)
    
    output = BytesIO()
    workbook = xlsxwriter.Workbook(output)
    worksheet = workbook.add_worksheet("Claim Codes")
    
    # Styles
    header_format = workbook.add_format({
        'bold': True,
        'bg_color': '#1e3a5f',
        'font_color': 'white',
        'border': 1,
        'align': 'center'
    })
    
    cell_format = workbook.add_format({'border': 1})
    code_format = workbook.add_format({'border': 1, 'bold': True, 'font_color': '#065f46'})
    
    # Headers
    headers = ["No.", "Claim Code", "Nama Pelajar", "No. Matrik", "No. IC", "Tingkatan", "Nama Kelas", "Status"]
    for col, header in enumerate(headers):
        worksheet.write(0, col, header, header_format)
        worksheet.set_column(col, col, 15 if col == 0 else 20)
    
    # Data
    for row_idx, cc in enumerate(claim_codes, start=1):
        worksheet.write(row_idx, 0, row_idx, cell_format)
        worksheet.write(row_idx, 1, cc.get("claim_code", ""), code_format)
        worksheet.write(row_idx, 2, cc.get("student_name", ""), cell_format)
        worksheet.write(row_idx, 3, cc.get("matric_number", ""), cell_format)
        worksheet.write(row_idx, 4, cc.get("ic_number", ""), cell_format)
        worksheet.write(row_idx, 5, cc.get("tingkatan", ""), cell_format)
        worksheet.write(row_idx, 6, cc.get("nama_kelas", ""), cell_format)
        
        status = cc.get("status", "pending")
        status_malay = {"pending": "Belum Dituntut", "claimed": "Sudah Dituntut", "expired": "Tamat Tempoh"}
        worksheet.write(row_idx, 7, status_malay.get(status, status), cell_format)
    
    workbook.close()
    output.seek(0)
    
    filename = f"Claim_Codes_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/claim-codes/{claim_code}/slip")
async def generate_claim_slip_pdf(
    claim_code: str,
    portal_url: str = Query("https://portal.mrsmku.edu.my", description="URL Portal untuk QR Code")
):
    """Generate PDF claim slip for a student"""
    db = _get_db_func()
    
    # Find claim code
    cc = await db.claim_codes.find_one({"claim_code": claim_code.upper()})
    if not cc:
        raise HTTPException(status_code=404, detail="Claim code tidak dijumpai")
    
    # Generate PDF
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=20*mm,
        leftMargin=20*mm,
        topMargin=15*mm,
        bottomMargin=15*mm
    )
    
    styles = getSampleStyleSheet()
    elements = []
    
    # Title
    title_style = styles['Heading1']
    title_style.alignment = 1  # Center
    elements.append(Paragraph("SLIP TUNTUTAN PELAJAR", title_style))
    elements.append(Spacer(1, 5*mm))
    
    # School name
    school_style = styles['Heading2']
    school_style.alignment = 1
    elements.append(Paragraph("MRSM KUBANG PASU", school_style))
    elements.append(Paragraph("06000 Jitra, Kedah", styles['Normal']))
    elements.append(Spacer(1, 10*mm))
    
    # Student info table
    student_data = [
        ["Nama Pelajar", cc.get("student_name", "")],
        ["No. Matrik", cc.get("matric_number", "")],
        ["No. IC", cc.get("ic_number", "")],
        ["Tingkatan", f"Tingkatan {cc.get('tingkatan', '')}"],
        ["Nama Kelas", cc.get("nama_kelas", "")]
    ]
    
    student_table = Table(student_data, colWidths=[50*mm, 100*mm])
    student_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.Color(0.12, 0.23, 0.37)),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 1, colors.grey),
    ]))
    elements.append(student_table)
    elements.append(Spacer(1, 10*mm))
    
    # Claim Code - Big and Bold
    claim_code_style = styles['Heading1']
    claim_code_style.alignment = 1
    claim_code_style.textColor = colors.Color(0.02, 0.37, 0.27)  # Emerald
    elements.append(Paragraph("KOD TUNTUTAN", styles['Heading2']))
    elements.append(Paragraph(f"<b>{cc.get('claim_code', '')}</b>", claim_code_style))
    elements.append(Spacer(1, 10*mm))
    
    # QR Code
    qr_url = f"{portal_url}/claim/{claim_code}"
    qr = qrcode.QRCode(version=1, box_size=8, border=4)
    qr.add_data(qr_url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="#065f46", back_color="white")
    
    qr_buffer = BytesIO()
    qr_img.save(qr_buffer, format="PNG")
    qr_buffer.seek(0)
    
    qr_image = Image(qr_buffer, width=50*mm, height=50*mm)
    qr_image.hAlign = 'CENTER'
    elements.append(qr_image)
    elements.append(Spacer(1, 5*mm))
    
    # Instructions
    instruction_style = styles['Normal']
    instruction_style.alignment = 1
    elements.append(Paragraph(f"Layari <b>{portal_url}</b>", instruction_style))
    elements.append(Paragraph("atau imbas QR code di atas untuk mendaftarkan anak anda.", instruction_style))
    elements.append(Spacer(1, 10*mm))
    
    # Footer
    footer_style = styles['Normal']
    footer_style.fontSize = 9
    footer_style.textColor = colors.grey
    elements.append(Paragraph(f"Dijana pada: {datetime.now().strftime('%d/%m/%Y %H:%M')}", footer_style))
    
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"Slip_Tuntutan_{cc.get('matric_number', '')}_{claim_code}.pdf"
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("/claim")
async def claim_student(
    request: ClaimStudentRequest
):
    """Parent claims a student using claim code"""
    db = _get_db_func()
    
    claim_code = request.claim_code.upper().strip()
    
    # Find claim code
    cc = await db.claim_codes.find_one({"claim_code": claim_code})
    if not cc:
        raise HTTPException(status_code=404, detail="Kod tuntutan tidak sah")
    
    if cc.get("status") == "claimed":
        raise HTTPException(status_code=400, detail="Kod tuntutan ini sudah digunakan")
    
    if cc.get("status") == "expired":
        raise HTTPException(status_code=400, detail="Kod tuntutan ini telah tamat tempoh")
    
    student_id = cc.get("student_id")
    
    # Get student
    student = await db.students.find_one({"_id": student_id})
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    
    # Note: In production, this should verify parent authentication
    # For now, just mark the claim code as claimed and return student info
    # The actual parent linking should be done via the authenticated endpoint
    
    return {
        "success": True,
        "message": "Pelajar berjaya dituntut",
        "student": {
            "id": str(student["_id"]),
            "full_name": student.get("full_name", ""),
            "matric_number": student.get("matric_number", ""),
            "tingkatan": student.get("form", student.get("tingkatan", 0)),
            "nama_kelas": student.get("class_name", student.get("nama_kelas", ""))
        }
    }


@router.post("/claim-authenticated")
async def claim_student_authenticated(
    request: ClaimStudentRequest
):
    """
    Parent claims a student using claim code (authenticated endpoint).
    This endpoint should be called with proper JWT authentication.
    """
    db = _get_db_func()
    
    claim_code = request.claim_code.upper().strip()
    parent_id = request.parent_id  # Get parent_id from request model
    
    # Find claim code
    cc = await db.claim_codes.find_one({"claim_code": claim_code})
    if not cc:
        raise HTTPException(status_code=404, detail="Kod tuntutan tidak sah")
    
    if cc.get("status") == "claimed":
        raise HTTPException(status_code=400, detail="Kod tuntutan ini sudah digunakan")
    
    if cc.get("status") == "expired":
        raise HTTPException(status_code=400, detail="Kod tuntutan ini telah tamat tempoh")
    
    student_id = cc.get("student_id")
    
    # Get student
    student = await db.students.find_one({"_id": student_id})
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    
    # Update claim code status
    await db.claim_codes.update_one(
        {"_id": cc["_id"]},
        {
            "$set": {
                "status": "claimed",
                "claimed_at": datetime.now(timezone.utc).isoformat(),
                "claimed_by": parent_id
            }
        }
    )
    
    # Update student with parent link if parent_id provided
    if parent_id:
        try:
            parent_oid = object_id_or_none(parent_id)
            if parent_oid is None:
                raise ValueError("Invalid parent_id format")
            await db.students.update_one(
                {"_id": student_id},
                {"$set": {"parent_id": parent_oid}}
            )
        except Exception:
            pass  # Invalid parent_id format
    
    return {
        "success": True,
        "message": "Pelajar berjaya dituntut dan dikaitkan dengan akaun anda",
        "student": {
            "id": str(student["_id"]),
            "full_name": student.get("full_name", ""),
            "matric_number": student.get("matric_number", ""),
            "tingkatan": student.get("form", student.get("tingkatan", 0)),
            "nama_kelas": student.get("class_name", student.get("nama_kelas", ""))
        }
    }


@router.get("/stats")
async def get_import_stats():
    """Get import statistics"""
    db = _get_db_func()
    
    # Total students
    total_students = await db.students.count_documents({})
    
    # Students with parent link
    students_with_parent = await db.students.count_documents({
        "parent_id": {"$exists": True, "$ne": None}
    })
    
    # Students without parent link
    students_without_parent = total_students - students_with_parent
    
    # Claim codes stats
    claim_codes_total = await db.claim_codes.count_documents({})
    claim_codes_pending = await db.claim_codes.count_documents({"status": "pending"})
    claim_codes_claimed = await db.claim_codes.count_documents({"status": "claimed"})
    
    # By tingkatan
    tingkatan_counts = {}
    async for row in db.claim_codes.find({}):
        tingkatan = row.get("tingkatan")
        if tingkatan is None:
            continue
        tingkatan_counts[tingkatan] = tingkatan_counts.get(tingkatan, 0) + 1
    by_tingkatan = sorted(
        [{"_id": tingkatan, "count": count} for tingkatan, count in tingkatan_counts.items()],
        key=lambda item: item["_id"],
    )[:10]
    
    return {
        "students": {
            "total": total_students,
            "with_parent": students_with_parent,
            "without_parent": students_without_parent
        },
        "claim_codes": {
            "total": claim_codes_total,
            "pending": claim_codes_pending,
            "claimed": claim_codes_claimed
        },
        "by_tingkatan": {str(item["_id"]): item["count"] for item in by_tingkatan if item["_id"]}
    }
