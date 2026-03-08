"""
MRSMKU Portal Backend - Sistem Pengurusan Yuran MRSMKU
Full Role-Based Access Control (RBAC) System
"""
import os
import uuid
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager
from bson import ObjectId
from io import BytesIO
import base64

from fastapi import FastAPI, HTTPException, Depends, status, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, EmailStr, validator
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from jose import JWTError, jwt
from dotenv import load_dotenv
import qrcode

# APScheduler for background tasks
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

# Configure logging
logging.basicConfig(level=logging.INFO)
scheduler_logger = logging.getLogger("scheduler")

# Route imports
from routes import infaq as infaq_routes
from routes import email as email_routes
from routes import analytics as analytics_routes
from routes import agm as agm_routes
from routes import auth as auth_routes
from routes import complaints as complaints_routes
from routes import warden as warden_routes
from routes import hostel_blocks as hostel_blocks_routes
from routes import inventory as inventory_routes
from routes import categories as categories_routes
from routes import accounting as accounting_routes
from routes import accounting_full as accounting_full_routes
from routes import bank_accounts as bank_accounts_routes
from routes import agm_reports as agm_reports_routes
from routes import yuran as yuran_routes
from routes import upload as upload_routes
from routes import koperasi_commission as koperasi_commission_routes
from routes import marketplace as marketplace_routes
from routes import tabung as tabung_routes
from routes import students as students_routes
from routes import student_import as student_import_routes
from routes import users as users_routes
from routes import dashboard as dashboard_routes
from routes import fees as fees_routes
from routes import payments as payments_routes
from routes import reports as reports_routes
from routes import ar as ar_routes
from routes import hostel as hostel_routes
from routes import sickbay as sickbay_routes
from routes import payment_center as payment_center_routes
from routes import chatbox_faq as chatbox_faq_routes
from routes import financial_dashboard as financial_dashboard_routes
from routes import discipline as discipline_routes
from routes import risk as risk_routes
from routes import email_templates as email_templates_routes
from routes import pwa as pwa_routes
from models.hostel import DEFAULT_HOSTEL_BLOCKS
from db.config import DB_ENGINE, is_hybrid_mode, is_postgres_mode
from db.postgres import init_postgres, close_postgres, get_session_factory
from repositories.core_store import CoreStore
from repositories.tabung_relational_store import adapt_tabung_read_db
from repositories.yuran_relational_store import adapt_yuran_read_db

load_dotenv()

# Config
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "mrsm_portal")
JWT_SECRET = os.environ.get("JWT_SECRET", "mrsm-secret-key")
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", 1440))
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)

# Database
client = None
db = None
core_db = None

# Background Scheduler
scheduler = AsyncIOScheduler()


async def run_monetization_expiration_job():
    """Background job to expire ads, boosts, and premium subscriptions"""
    global db
    if db is None:
        scheduler_logger.warning("Database not initialized, skipping expiration job")
        return
    
    try:
        now = datetime.now(timezone.utc)
        expired_counts = {"ads": 0, "boosts": 0, "subscriptions": 0}
        
        # 1. Expire banner ads
        expired_ads = await db.marketplace_ads.update_many(
            {
                "status": "active",
                "end_date": {"$lt": now}
            },
            {"$set": {"status": "expired"}}
        )
        expired_counts["ads"] = expired_ads.modified_count
        
        # 2. Expire product boosts
        expired_boosts = await db.product_boosts.find({
            "status": "active",
            "end_date": {"$lt": now}
        }).to_list(500)
        
        for boost in expired_boosts:
            await db.product_boosts.update_one(
                {"_id": boost["_id"]},
                {"$set": {"status": "expired"}}
            )
            # Reset product boost status
            if boost.get("boost_type") == "featured":
                await db.marketplace_products.update_one(
                    {"_id": ObjectId(boost["product_id"])},
                    {"$set": {"is_featured": False, "featured_until": None}}
                )
            else:
                await db.marketplace_products.update_one(
                    {"_id": ObjectId(boost["product_id"])},
                    {"$set": {"is_boosted": False, "boost_expires_at": None}}
                )
        expired_counts["boosts"] = len(expired_boosts)
        
        # 3. Expire premium subscriptions
        expired_vendors = await db.marketplace_vendors.find({
            "tier": "premium",
            "premium_expires_at": {"$lt": now}
        }).to_list(500)
        
        for vendor in expired_vendors:
            await db.marketplace_vendors.update_one(
                {"_id": vendor["_id"]},
                {"$set": {"tier": "free", "updated_at": now}}
            )
            # Create notification
            await db.notifications.insert_one({
                "user_id": ObjectId(vendor["user_id"]),
                "title": "Langganan Premium Tamat",
                "message": "Langganan premium anda telah tamat. Sila langgan semula untuk terus menikmati faedah premium.",
                "type": "warning",
                "is_read": False,
                "created_at": now
            })
        expired_counts["subscriptions"] = len(expired_vendors)
        
        # Log scheduler run
        await db.scheduler_logs.insert_one({
            "type": "expire_features",
            "expired_counts": expired_counts,
            "run_at": now,
            "triggered_by": "scheduler"
        })
        
        if any(expired_counts.values()):
            scheduler_logger.info(f"Expiration job completed: {expired_counts}")
        
    except Exception as e:
        scheduler_logger.error(f"Error in expiration job: {e}")


async def run_auto_sync_job():
    """Background job to automatically synchronize students and users data"""
    global db
    if db is None:
        scheduler_logger.warning("Database not initialized, skipping auto-sync job")
        return
    
    try:
        # Check if auto-sync is enabled
        settings = await db.settings.find_one({"type": "auto_sync"})
        if not settings or not settings.get("enabled", False):
            scheduler_logger.info("Auto-sync is disabled, skipping job")
            return
        
        now = datetime.now(timezone.utc)
        results = {
            "orphan_users_deleted": 0,
            "users_created": 0,
            "religion_updated": 0,
            "errors": []
        }
        
        # Step 1: Cleanup orphan pelajar users
        pelajar_users = await db.users.find({"role": "pelajar"}).to_list(1000)
        students = await db.students.find({}).to_list(1000)
        student_matrics = set(s.get("matric_number") for s in students if s.get("matric_number"))
        student_ics = set(s.get("ic_number") for s in students if s.get("ic_number"))
        
        for user in pelajar_users:
            user_matric = user.get("matric_number", "")
            user_ic = user.get("ic_number", "")
            
            has_matching_student = (
                (user_matric and user_matric in student_matrics) or
                (user_ic and user_ic in student_ics)
            )
            
            if not has_matching_student:
                try:
                    await db.users.delete_one({"_id": user["_id"]})
                    results["orphan_users_deleted"] += 1
                except Exception as e:
                    results["errors"].append(f"Cleanup error: {str(e)}")
        
        # Step 2: Create user accounts for students without user_id
        students_without_user = await db.students.find({"user_id": {"$exists": False}}).to_list(1000)
        
        for student in students_without_user:
            try:
                existing_user = await db.users.find_one({"matric_number": student.get("matric_number")})
                
                if existing_user:
                    await db.students.update_one(
                        {"_id": student["_id"]},
                        {"$set": {"user_id": existing_user["_id"]}}
                    )
                else:
                    email = f"{student.get('matric_number', '').lower()}@pelajar.mrsm.edu.my"
                    password_hash = pwd_context.hash("student123")
                    
                    user_doc = {
                        "email": email,
                        "password": password_hash,
                        "full_name": student.get("full_name", ""),
                        "phone": student.get("phone", ""),
                        "ic_number": student.get("ic_number", ""),
                        "matric_number": student.get("matric_number", ""),
                        "role": "pelajar",
                        "religion": student.get("religion", "Islam"),
                        "is_active": True,
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                    
                    user_result = await db.users.insert_one(user_doc)
                    await db.students.update_one(
                        {"_id": student["_id"]},
                        {"$set": {"user_id": user_result.inserted_id}}
                    )
                    results["users_created"] += 1
                    
            except Exception as e:
                results["errors"].append(f"Sync error: {str(e)}")
        
        # Step 3: Update missing religion fields
        students_without_religion = await db.students.find({"religion": {"$exists": False}}).to_list(1000)
        for student in students_without_religion:
            await db.students.update_one(
                {"_id": student["_id"]},
                {"$set": {"religion": "Islam"}}
            )
            results["religion_updated"] += 1
        
        pelajar_without_religion = await db.users.find({"role": "pelajar", "religion": {"$exists": False}}).to_list(1000)
        for user in pelajar_without_religion:
            await db.users.update_one(
                {"_id": user["_id"]},
                {"$set": {"religion": "Islam"}}
            )
            results["religion_updated"] += 1
        
        # Log the auto-sync run
        await db.scheduler_logs.insert_one({
            "type": "auto_sync",
            "results": results,
            "run_at": now,
            "triggered_by": "scheduler"
        })
        
        # Update last sync time in settings
        await db.settings.update_one(
            {"type": "auto_sync"},
            {"$set": {"last_run": now.isoformat(), "last_results": results}}
        )
        
        total_changes = results["orphan_users_deleted"] + results["users_created"] + results["religion_updated"]
        if total_changes > 0:
            scheduler_logger.info(f"Auto-sync completed: {results}")
        else:
            scheduler_logger.info("Auto-sync completed: No changes needed")
        
    except Exception as e:
        scheduler_logger.error(f"Error in auto-sync job: {e}")


async def run_payment_reminder_job():
    """Background job to dispatch due payment reminders as in-app notifications."""
    global core_db, db
    target_db = core_db or db
    if target_db is None:
        scheduler_logger.warning("Database not initialized, skipping payment reminder job")
        return

    try:
        result = await payment_center_routes.process_due_payment_reminders(target_db, limit=200)
        if result.get("checked", 0) > 0:
            scheduler_logger.info(
                "Payment reminder job completed: checked=%s sent=%s failed=%s push_sent=%s push_failed=%s push_skipped=%s",
                result.get("checked", 0),
                result.get("sent", 0),
                result.get("failed", 0),
                result.get("push_sent", 0),
                result.get("push_failed", 0),
                result.get("push_skipped", 0),
            )
    except Exception as e:
        scheduler_logger.error(f"Error in payment reminder job: {e}")

# ============ QR CODE HELPER ============

def generate_user_qr_code_data(user_id: str) -> str:
    """Generate permanent QR code data for a user"""
    return f"MRSMKU-USER-{user_id}"

def generate_qr_code_image(data: str) -> str:
    """Generate QR code and return as base64 string"""
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode()

# ============ ROLE DEFINITIONS ============

ROLES = {
    "superadmin": {
        "name": "Super Admin",
        "level": 100,
        "description": "Akses penuh ke semua modul dan kawalan sistem"
    },
    "admin": {
        "name": "Admin MRSMKU",
        "level": 90,
        "description": "Pentadbiran am sistem MRSMKU"
    },
    "bendahari": {
        "name": "Bendahari",
        "level": 80,
        "description": "Pengurusan kewangan dan yuran"
    },
    "sub_bendahari": {
        "name": "Sub Bendahari",
        "level": 70,
        "description": "Pembantu bendahari"
    },
    "guru_kelas": {
        "name": "Guru Kelas",
        "level": 60,
        "description": "Pengurusan pelajar dalam kelas"
    },
    "guru_homeroom": {
        "name": "Guru HomeRoom",
        "level": 60,
        "description": "Ibu/bapa angkat pelajar"
    },
    "warden": {
        "name": "Warden",
        "level": 50,
        "description": "Role berasingan daripada Admin. Dashboard sendiri: urus pelajar outing (e-hostel) dan pengurusan Bilik Sakit. Hanya Superadmin/Admin boleh tambah warden."
    },
    "guard": {
        "name": "Pengawal Keselamatan",
        "level": 40,
        "description": "Kawalan keselamatan dan QR kenderaan"
    },
    "bus_admin": {
        "name": "Admin Bas",
        "level": 35,
        "description": "Pengurusan syarikat bas, trip dan tempahan"
    },
    "bus_driver": {
        "name": "Driver Bas",
        "level": 30,
        "description": "Pemandu bas: lihat senarai pelajar, checkpoint drop-off, kongsi lokasi live"
    },
    "koop_admin": {
        "name": "Admin Koperasi",
        "level": 35,
        "description": "Pengurusan koperasi maktab, kit dan produk"
    },
    "juruaudit": {
        "name": "Juruaudit",
        "level": 75,
        "description": "Semak dan sahkan transaksi kewangan, kunci tempoh akaun"
    },
    "parent": {
        "name": "Ibu Bapa",
        "level": 20,
        "description": "Akses data anak dan pembayaran"
    },
    "pelajar": {
        "name": "Pelajar",
        "level": 10,
        "description": "Akses maklumat diri sendiri"
    }
}

# Available modules/permissions in the system
AVAILABLE_MODULES = {
    "dashboard": {
        "name": "Dashboard",
        "permissions": [
            {"code": "dashboard.admin", "name": "Dashboard Admin", "description": "Akses dashboard pentadbir"},
            {"code": "dashboard.bendahari", "name": "Dashboard Bendahari", "description": "Akses dashboard kewangan"},
            {"code": "dashboard.guru", "name": "Dashboard Guru", "description": "Akses dashboard guru"},
            {"code": "dashboard.warden", "name": "Dashboard Warden", "description": "Akses dashboard warden"},
            {"code": "dashboard.guard", "name": "Dashboard Pengawal", "description": "Akses dashboard pengawal"},
            {"code": "dashboard.bus_admin", "name": "Dashboard Admin Bas", "description": "Akses dashboard admin bas"},
            {"code": "dashboard.bus_driver", "name": "Dashboard Driver Bas", "description": "Akses dashboard pemandu bas"},
            {"code": "dashboard.koop_admin", "name": "Dashboard Admin Koperasi", "description": "Akses dashboard admin koperasi"},
            {"code": "dashboard.parent", "name": "Dashboard Ibu Bapa", "description": "Akses dashboard ibu bapa"},
            {"code": "dashboard.pelajar", "name": "Dashboard Pelajar", "description": "Akses dashboard pelajar"},
        ]
    },
    "users": {
        "name": "Pengurusan Pengguna",
        "permissions": [
            {"code": "users.view", "name": "Lihat Pengguna", "description": "Boleh lihat senarai pengguna"},
            {"code": "users.create", "name": "Cipta Pengguna", "description": "Boleh cipta pengguna baru"},
            {"code": "users.edit", "name": "Edit Pengguna", "description": "Boleh mengemaskini pengguna"},
            {"code": "users.delete", "name": "Padam Pengguna", "description": "Boleh memadamkan pengguna"},
        ]
    },
    "students": {
        "name": "Pengurusan Pelajar",
        "permissions": [
            {"code": "students.view", "name": "Lihat Semua Pelajar", "description": "Boleh lihat semua pelajar"},
            {"code": "students.view_class", "name": "Lihat Pelajar Kelas", "description": "Lihat pelajar dalam kelas"},
            {"code": "students.view_homeroom", "name": "Lihat Pelajar HomeRoom", "description": "Lihat pelajar HomeRoom"},
            {"code": "students.view_hostel", "name": "Lihat Pelajar Asrama", "description": "Lihat pelajar dalam asrama"},
            {"code": "students.approve", "name": "Sahkan Pelajar", "description": "Boleh meluluskan pendaftaran pelajar"},
            {"code": "students.reject", "name": "Tolak Pelajar", "description": "Boleh menolak pendaftaran pelajar"},
            {"code": "students.edit", "name": "Edit Pelajar", "description": "Boleh mengemaskini maklumat pelajar"},
        ]
    },
    "fees": {
        "name": "Pengurusan Yuran",
        "permissions": [
            {"code": "fees.view", "name": "Lihat Semua Yuran", "description": "Boleh lihat semua yuran"},
            {"code": "fees.view_own", "name": "Lihat Yuran Sendiri", "description": "Lihat yuran anak sendiri"},
            {"code": "fees.view_class", "name": "Lihat Yuran Kelas", "description": "Lihat yuran pelajar dalam kelas"},
            {"code": "fees.view_homeroom", "name": "Lihat Yuran HomeRoom", "description": "Lihat yuran HomeRoom"},
            {"code": "fees.create", "name": "Cipta Yuran", "description": "Boleh mencipta yuran baru"},
            {"code": "fees.edit", "name": "Edit Yuran", "description": "Boleh mengemaskini yuran"},
        ]
    },
    "payments": {
        "name": "Pembayaran",
        "permissions": [
            {"code": "payments.view", "name": "Lihat Semua Pembayaran", "description": "Lihat semua pembayaran"},
            {"code": "payments.view_own", "name": "Lihat Pembayaran Sendiri", "description": "Lihat pembayaran sendiri"},
            {"code": "payments.make", "name": "Buat Pembayaran", "description": "Boleh membuat pembayaran"},
            {"code": "payments.verify", "name": "Sahkan Pembayaran", "description": "Boleh mengesahkan pembayaran"},
        ]
    },
    "reports": {
        "name": "Laporan",
        "permissions": [
            {"code": "reports.view", "name": "Lihat Laporan", "description": "Boleh lihat laporan"},
            {"code": "reports.view_class", "name": "Lihat Laporan Kelas", "description": "Lihat laporan kelas"},
            {"code": "reports.export", "name": "Eksport Laporan", "description": "Boleh eksport laporan"},
        ]
    },
    "hostel": {
        "name": "e-Hostel",
        "permissions": [
            {"code": "hostel.view", "name": "Lihat Hostel", "description": "Boleh lihat maklumat hostel"},
            {"code": "hostel.view_own", "name": "Lihat Hostel Sendiri", "description": "Lihat maklumat hostel sendiri"},
            {"code": "hostel.view_homeroom", "name": "Lihat Hostel HomeRoom", "description": "Lihat hostel HomeRoom"},
            {"code": "hostel.edit", "name": "Edit Hostel", "description": "Boleh edit maklumat hostel"},
            {"code": "hostel.checkin", "name": "Daftar Masuk", "description": "Boleh daftar masuk pelajar"},
            {"code": "hostel.checkout", "name": "Daftar Keluar", "description": "Boleh daftar keluar pelajar"},
        ]
    },
    "sickbay": {
        "name": "Bilik Sakit",
        "permissions": [
            {"code": "sickbay.view", "name": "Lihat Bilik Sakit", "description": "Boleh lihat rekod bilik sakit"},
            {"code": "sickbay.edit", "name": "Urus Bilik Sakit", "description": "Boleh mengurus bilik sakit"},
        ]
    },
    "vehicle": {
        "name": "Kawalan Kenderaan",
        "permissions": [
            {"code": "vehicle.view", "name": "Lihat Kenderaan", "description": "Boleh lihat senarai kenderaan"},
            {"code": "vehicle.scan", "name": "Imbas QR", "description": "Boleh mengimbas QR kenderaan"},
        ]
    },
    "security": {
        "name": "Keselamatan",
        "permissions": [
            {"code": "security.log", "name": "Log Keselamatan", "description": "Boleh merekod log keselamatan"},
        ]
    },
    "children": {
        "name": "Anak",
        "permissions": [
            {"code": "children.view", "name": "Lihat Anak", "description": "Boleh lihat maklumat anak"},
            {"code": "children.add", "name": "Tambah Anak", "description": "Boleh mendaftarkan anak"},
            {"code": "children.delete", "name": "Padam Anak", "description": "Boleh memadamkan rekod anak"},
        ]
    },
    "notifications": {
        "name": "Notifikasi",
        "permissions": [
            {"code": "notifications.view", "name": "Lihat Notifikasi", "description": "Boleh lihat notifikasi"},
            {"code": "notifications.send", "name": "Hantar Notifikasi", "description": "Boleh menghantar notifikasi"},
            {"code": "notifications.send_class", "name": "Hantar ke Kelas", "description": "Hantar notifikasi ke kelas"},
            {"code": "notifications.send_homeroom", "name": "Hantar ke HomeRoom", "description": "Hantar ke HomeRoom"},
        ]
    },
    "accounting": {
        "name": "Perakaunan",
        "permissions": [
            {"code": "accounting.view", "name": "Lihat Perakaunan", "description": "Boleh lihat rekod perakaunan"},
            {"code": "accounting.edit", "name": "Edit Perakaunan", "description": "Boleh mengemaskini perakaunan"},
            {"code": "accounting.category.view", "name": "Lihat Kategori", "description": "Boleh lihat kategori transaksi"},
            {"code": "accounting.category.edit", "name": "Edit Kategori", "description": "Boleh menguruskan kategori transaksi"},
            {"code": "accounting.transaction.create", "name": "Cipta Transaksi", "description": "Boleh mencipta transaksi baru"},
            {"code": "accounting.transaction.verify", "name": "Sahkan Transaksi", "description": "Boleh mengesahkan/menolak transaksi"},
            {"code": "accounting.period.lock", "name": "Kunci Tempoh", "description": "Boleh mengunci tempoh akaun"},
            {"code": "accounting.reports", "name": "Laporan Perakaunan", "description": "Boleh melihat laporan kewangan"},
            {"code": "accounting.audit_log", "name": "Log Audit Perakaunan", "description": "Boleh melihat log audit perakaunan"},
        ]
    },
    "settings": {
        "name": "Tetapan",
        "permissions": [
            {"code": "settings.view", "name": "Lihat Tetapan", "description": "Boleh lihat tetapan sistem"},
            {"code": "settings.edit", "name": "Edit Tetapan", "description": "Boleh mengemaskini tetapan"},
        ]
    },
    "audit": {
        "name": "Audit Log",
        "permissions": [
            {"code": "audit.view", "name": "Lihat Audit Log", "description": "Boleh lihat log audit"},
        ]
    },
    "profile": {
        "name": "Profil",
        "permissions": [
            {"code": "profile.view", "name": "Lihat Profil", "description": "Boleh lihat profil sendiri"},
            {"code": "profile.edit", "name": "Edit Profil", "description": "Boleh mengemaskini profil"},
        ]
    },
    "ai_prediction": {
        "name": "AI Ramalan",
        "permissions": [
            {"code": "ai_prediction.view", "name": "Lihat Ramalan AI", "description": "Boleh lihat ramalan AI"},
        ]
    },
    "rbac": {
        "name": "RBAC",
        "permissions": [
            {"code": "rbac.view", "name": "Lihat RBAC", "description": "Boleh lihat konfigurasi RBAC"},
            {"code": "rbac.edit", "name": "Edit RBAC", "description": "Boleh mengemaskini RBAC"},
        ]
    },
    "bus": {
        "name": "Tiket Bas",
        "permissions": [
            {"code": "bus.company.view", "name": "Lihat Syarikat Bas", "description": "Boleh lihat syarikat bas"},
            {"code": "bus.company.edit", "name": "Edit Syarikat Bas", "description": "Boleh edit syarikat bas"},
            {"code": "bus.bus.view", "name": "Lihat Bas", "description": "Boleh lihat senarai bas"},
            {"code": "bus.bus.edit", "name": "Edit Bas", "description": "Boleh edit bas"},
            {"code": "bus.route.view", "name": "Lihat Route", "description": "Boleh lihat route"},
            {"code": "bus.route.edit", "name": "Edit Route", "description": "Boleh edit route"},
            {"code": "bus.trip.view", "name": "Lihat Trip", "description": "Boleh lihat trip"},
            {"code": "bus.trip.edit", "name": "Edit Trip", "description": "Boleh edit trip"},
            {"code": "bus.booking.view", "name": "Lihat Tempahan", "description": "Boleh lihat tempahan"},
            {"code": "bus.booking.edit", "name": "Edit Tempahan", "description": "Boleh edit tempahan"},
            {"code": "bus.booking.create", "name": "Cipta Tempahan", "description": "Boleh cipta tempahan tiket"},
        ]
    },
    "koperasi": {
        "name": "Koperasi",
        "permissions": [
            {"code": "koperasi.kit.view", "name": "Lihat Kit", "description": "Boleh lihat kit koperasi"},
            {"code": "koperasi.kit.edit", "name": "Edit Kit", "description": "Boleh edit kit koperasi"},
            {"code": "koperasi.product.view", "name": "Lihat Produk", "description": "Boleh lihat produk"},
            {"code": "koperasi.product.edit", "name": "Edit Produk", "description": "Boleh edit produk"},
            {"code": "koperasi.order.view", "name": "Lihat Pesanan", "description": "Boleh lihat pesanan"},
            {"code": "koperasi.order.edit", "name": "Edit Pesanan", "description": "Boleh edit pesanan"},
            {"code": "koperasi.cart.view", "name": "Lihat Troli", "description": "Boleh lihat troli"},
            {"code": "koperasi.cart.edit", "name": "Edit Troli", "description": "Boleh edit troli"},
        ]
    },
    "infaq": {
        "name": "Infaq Slot",
        "permissions": [
            {"code": "infaq.campaign.view", "name": "Lihat Kempen Infaq", "description": "Boleh lihat senarai kempen infaq"},
            {"code": "infaq.campaign.create", "name": "Cipta Kempen Infaq", "description": "Boleh mencipta kempen infaq baru"},
            {"code": "infaq.campaign.edit", "name": "Edit Kempen Infaq", "description": "Boleh mengemaskini kempen infaq"},
            {"code": "infaq.campaign.delete", "name": "Padam Kempen Infaq", "description": "Boleh membatalkan kempen infaq"},
            {"code": "infaq.donation.view", "name": "Lihat Sumbangan", "description": "Boleh lihat semua sumbangan"},
            {"code": "infaq.donation.make", "name": "Buat Sumbangan", "description": "Boleh membuat sumbangan infaq"},
            {"code": "infaq.stats.view", "name": "Lihat Statistik", "description": "Boleh lihat statistik infaq"},
        ]
    },
    "complaints": {
        "name": "Aduan Digital",
        "permissions": [
            {"code": "complaints.view", "name": "Lihat Semua Aduan", "description": "Boleh lihat semua aduan"},
            {"code": "complaints.view_own", "name": "Lihat Aduan Sendiri", "description": "Lihat aduan yang dihantar sendiri"},
            {"code": "complaints.view_assigned", "name": "Lihat Aduan Tugasan", "description": "Lihat aduan yang ditugaskan"},
            {"code": "complaints.create", "name": "Hantar Aduan", "description": "Boleh menghantar aduan baru"},
            {"code": "complaints.action", "name": "Tindakan Aduan", "description": "Boleh mengambil tindakan atas aduan"},
            {"code": "complaints.assign", "name": "Tugaskan Aduan", "description": "Boleh tugaskan aduan kepada warden"},
            {"code": "complaints.dashboard", "name": "Dashboard Aduan", "description": "Akses dashboard aduan"},
            {"code": "complaints.reports", "name": "Laporan Aduan", "description": "Boleh lihat laporan bulanan aduan"},
        ]
    },
    "warden_management": {
        "name": "Pengurusan Warden",
        "permissions": [
            {"code": "warden.schedule.view", "name": "Lihat Jadual Warden", "description": "Boleh lihat jadual bertugas warden"},
            {"code": "warden.schedule.create", "name": "Cipta Jadual", "description": "Boleh mencipta jadual bertugas"},
            {"code": "warden.schedule.edit", "name": "Edit Jadual", "description": "Boleh mengemaskini jadual bertugas"},
            {"code": "warden.schedule.delete", "name": "Padam Jadual", "description": "Boleh memadamkan jadual bertugas"},
            {"code": "warden.calendar.view", "name": "Lihat Kalendar", "description": "Boleh lihat kalendar tugas"},
            {"code": "warden.on_duty.view", "name": "Lihat Warden Bertugas", "description": "Boleh lihat warden yang sedang bertugas"},
        ]
    },
    "hostel_blocks": {
        "name": "Blok Asrama",
        "permissions": [
            {"code": "hostel.blocks.view", "name": "Lihat Blok Asrama", "description": "Boleh lihat senarai blok asrama"},
            {"code": "hostel.blocks.create", "name": "Cipta Blok", "description": "Boleh mencipta blok asrama baru"},
            {"code": "hostel.blocks.edit", "name": "Edit Blok", "description": "Boleh mengemaskini blok asrama"},
            {"code": "hostel.blocks.delete", "name": "Padam Blok", "description": "Boleh memadamkan blok asrama"},
            {"code": "hostel.blocks.stats", "name": "Statistik Blok", "description": "Boleh lihat statistik blok asrama"},
        ]
    }
}

# Default permissions per role (used as fallback if no custom config)
DEFAULT_ROLE_PERMISSIONS = {
    "superadmin": ["*"],  # All access
    "admin": [
        "dashboard.admin", "users.view", "users.create", "users.edit", "users.delete",
        "students.view", "students.approve", "students.reject", "students.edit",
        "fees.view", "fees.create", "fees.edit",
        "reports.view", "notifications.send", "settings.view", "audit.view",
        "bus.company.view", "bus.company.edit", "bus.bus.view", "bus.bus.edit",
        "bus.route.view", "bus.route.edit", "bus.trip.view", "bus.trip.edit",
        "bus.booking.view", "bus.booking.edit",
        "infaq.campaign.view", "infaq.campaign.create", "infaq.campaign.edit", "infaq.campaign.delete",
        "infaq.donation.view", "infaq.stats.view",
        "complaints.view", "complaints.action", "complaints.assign", "complaints.dashboard", "complaints.reports",
        "warden.schedule.view", "warden.schedule.create", "warden.schedule.edit", "warden.schedule.delete",
        "warden.calendar.view", "warden.on_duty.view",
        "hostel.blocks.view", "hostel.blocks.create", "hostel.blocks.edit", "hostel.blocks.stats"
    ],
    "bendahari": [
        "dashboard.bendahari", "fees.view", "fees.create", "fees.edit",
        "payments.view", "payments.verify", "reports.view", "reports.export",
        "accounting.view", "accounting.edit", "ai_prediction.view",
        "infaq.campaign.view", "infaq.campaign.create", "infaq.campaign.edit", "infaq.campaign.delete",
        "infaq.donation.view", "infaq.stats.view"
    ],
    "sub_bendahari": [
        "dashboard.bendahari", "fees.view", "payments.view", "payments.verify",
        "reports.view"
    ],
    "guru_kelas": [
        "dashboard.guru", "students.view_class", "fees.view_class",
        "notifications.send_class", "reports.view_class"
    ],
    "guru_homeroom": [
        "dashboard.guru", "students.view_homeroom", "fees.view_homeroom",
        "hostel.view_homeroom", "notifications.send_homeroom"
    ],
    "warden": [
        "dashboard.warden", "hostel.view", "hostel.edit", "hostel.checkin", "hostel.checkout",
        "sickbay.view", "sickbay.edit", "students.view_hostel",
        "complaints.view_assigned", "complaints.action", "complaints.dashboard",
        "warden.schedule.view", "warden.calendar.view", "warden.on_duty.view",
        "hostel.blocks.view", "hostel.blocks.edit", "hostel.blocks.stats"
    ],
    "guard": [
        "dashboard.guard", "vehicle.scan", "vehicle.view", "security.log"
    ],
    "bus_admin": [
        "dashboard.bus_admin", "bus.company.view", "bus.bus.view", "bus.bus.edit",
        "bus.route.view", "bus.route.edit", "bus.trip.view", "bus.trip.edit",
        "bus.booking.view", "bus.booking.edit"
    ],
    "bus_driver": [
        "dashboard.bus_driver", "bus.driver.trips", "bus.driver.students", "bus.driver.location.update"
    ],
    "koop_admin": [
        "dashboard.koop_admin", "koperasi.kit.view", "koperasi.kit.edit",
        "koperasi.product.view", "koperasi.product.edit",
        "koperasi.order.view", "koperasi.order.edit"
    ],
    "juruaudit": [
        "dashboard.bendahari", "accounting.view", "accounting.transaction.verify", "accounting.period.lock",
        "accounting.category.view", "accounting.reports", "accounting.audit_log",
        "reports.view", "audit.view"
    ],
    "parent": [
        "dashboard.parent", "children.view", "children.add", "children.delete",
        "fees.view_own", "payments.make", "payments.view_own", "notifications.view",
        "bus.booking.create", "bus.booking.view",
        "koperasi.cart.view", "koperasi.cart.edit", "koperasi.order.view",
        "infaq.campaign.view", "infaq.donation.make",
        "complaints.view_own", "complaints.create", "warden.on_duty.view"
    ],
    "pelajar": [
        "dashboard.pelajar", "profile.view", "fees.view_own", "hostel.view_own",
        "infaq.campaign.view", "infaq.donation.make",
        "complaints.view_own", "complaints.create", "warden.on_duty.view"
    ]
}

# This will be populated from database, fallback to default
ROLE_PERMISSIONS = DEFAULT_ROLE_PERMISSIONS.copy()

# ============ MODELS ============

import re

# ============ VALIDATION HELPERS ============

def validate_name(name: str, field_name: str = "Nama") -> str:
    """Validate name - no numbers, proper format"""
    if not name or not name.strip():
        raise ValueError(f"{field_name} tidak boleh kosong")
    
    # Check for numbers in name
    if re.search(r'\d', name):
        raise ValueError(f"{field_name} tidak boleh mengandungi nombor")
    
    # Check minimum length
    if len(name.strip()) < 3:
        raise ValueError(f"{field_name} terlalu pendek (minimum 3 aksara)")
    
    # Check for invalid characters
    if re.search(r'[!@#$%^&*()_+=\[\]{};:"\\|<>?/~`]', name):
        raise ValueError(f"{field_name} mengandungi aksara tidak sah")
    
    return name.strip()

def validate_gender(gender: str) -> str:
    """Validate gender value"""
    if gender and gender.lower() not in ['male', 'female', 'lelaki', 'perempuan']:
        raise ValueError("Jantina mesti 'male' atau 'female'")
    # Normalize to English
    if gender:
        if gender.lower() in ['lelaki', 'male']:
            return 'male'
        elif gender.lower() in ['perempuan', 'female']:
            return 'female'
    return gender

def validate_class_name(class_name: str) -> str:
    """Validate class name non-empty. Senarai sah (lookup) disahkan di endpoint dari database Senarai Kelas."""
    if not class_name or not class_name.strip():
        raise ValueError("Nama kelas tidak boleh kosong")
    return class_name.strip()

def validate_matric_number(matric: str) -> str:
    """Validate matric number format"""
    if not matric or not matric.strip():
        raise ValueError("No. Matrik tidak boleh kosong")
    
    matric = matric.strip().upper()
    
    # Should not be too short or too long
    if len(matric) < 5:
        raise ValueError("No. Matrik terlalu pendek")
    if len(matric) > 20:
        raise ValueError("No. Matrik terlalu panjang")
    
    return matric

def validate_ic_number(ic: str) -> str:
    """Validate Malaysian IC number format - 12 digits without dash"""
    if not ic or not ic.strip():
        raise ValueError("No. Kad Pengenalan tidak boleh kosong")
    
    # Remove any dashes or spaces
    ic = ic.strip().replace('-', '').replace(' ', '')
    
    # Malaysian IC must be exactly 12 digits
    if len(ic) != 12:
        raise ValueError("No. Kad Pengenalan mestilah 12 digit (contoh: 750925016913)")
    
    if not ic.isdigit():
        raise ValueError("No. Kad Pengenalan hanya boleh mengandungi nombor")
    
    # Basic validation: first 6 digits are date (YYMMDD)
    year = int(ic[0:2])
    month = int(ic[2:4])
    day = int(ic[4:6])
    
    if month < 1 or month > 12:
        raise ValueError("No. Kad Pengenalan tidak sah - bulan tidak betul")
    
    if day < 1 or day > 31:
        raise ValueError("No. Kad Pengenalan tidak sah - hari tidak betul")
    
    return ic  # Return without dash

def validate_phone(phone: str) -> str:
    """Validate Malaysian phone number - no dash, can start with +"""
    if not phone:
        return phone
    
    # Remove dashes and spaces but keep +
    phone = phone.strip().replace('-', '').replace(' ', '')
    
    # Malaysian phone: starts with 01, 10-11 digits
    if phone.startswith('01') and len(phone) >= 10 and len(phone) <= 12 and phone[0:].replace('+', '').isdigit():
        return phone
    
    # Allow with country code +60
    if phone.startswith('+60') and len(phone) >= 12 and phone[1:].isdigit():
        return phone
    
    # Allow 60 without +
    if phone.startswith('60') and len(phone) >= 11 and phone.isdigit():
        return phone
    
    raise ValueError("Format No. Telefon tidak sah (contoh: 0123456789 atau +60123456789)")

def validate_email_format(email: str) -> str:
    """Validate email format - optional field"""
    if not email or not email.strip():
        return email or ""
    e = email.strip()
    if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', e):
        raise ValueError("Format emel tidak sah")
    return e

# ============ PYDANTIC MODELS WITH VALIDATION ============

class ChildInfo(BaseModel):
    matric_number: str
    full_name: str
    form: int = Field(ge=1, le=5)
    class_name: str
    ic_number: str  # Wajib diisi - 12 digit
    gender: Optional[str] = None
    relationship: str = "BAPA"  # IBU, BAPA, PENJAGA
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    postcode: Optional[str] = None
    city: Optional[str] = None
    block_name: Optional[str] = ""
    room_number: Optional[str] = ""
    
    @validator('full_name')
    def validate_child_name(cls, v):
        return validate_name(v, "Nama anak")
    
    @validator('matric_number')
    def validate_child_matric(cls, v):
        return validate_matric_number(v)
    
    @validator('class_name')
    def validate_child_class(cls, v):
        return validate_class_name(v)
    
    @validator('ic_number')
    def validate_child_ic(cls, v):
        return validate_ic_number(v)
    
    @validator('gender')
    def validate_child_gender(cls, v):
        return validate_gender(v) if v else v
    
    @validator('relationship')
    def validate_relationship(cls, v):
        if v and v.upper() not in ['IBU', 'BAPA', 'PENJAGA']:
            raise ValueError("Hubungan mestilah IBU, BAPA, atau PENJAGA")
        return v.upper() if v else "BAPA"

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    phone: str
    phone_alt: Optional[str] = None  # No. Telefon Alternatif (saudara mara, pasangan)
    ic_number: str  # Wajib diisi - 12 digit
    gender: Optional[str] = None
    address: Optional[str] = None
    postcode: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    children: Optional[List[ChildInfo]] = None
    
    @validator('full_name')
    def validate_user_name(cls, v):
        return validate_name(v, "Nama penuh")
    
    @validator('password')
    def validate_password(cls, v):
        if len(v) < 6:
            raise ValueError("Kata laluan minimum 6 aksara")
        return v
    
    @validator('phone')
    def validate_user_phone(cls, v):
        return validate_phone(v)
    
    @validator('phone_alt')
    def validate_user_phone_alt(cls, v):
        return validate_phone(v) if v else v
    
    @validator('ic_number')
    def validate_user_ic(cls, v):
        return validate_ic_number(v)
    
    @validator('gender')
    def validate_user_gender(cls, v):
        return validate_gender(v) if v else v

class UserCreateByAdmin(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    phone: str
    phone_alt: Optional[str] = None  # No. Telefon Alternatif (saudara mara, pasangan)
    ic_number: str  # Wajib diisi - 12 digit
    gender: Optional[str] = None
    role: str
    assigned_class: Optional[str] = None
    assigned_block: Optional[str] = None
    staff_id: Optional[str] = None
    state: Optional[str] = None
    
    @validator('full_name')
    def validate_admin_user_name(cls, v):
        return validate_name(v, "Nama penuh")
    
    @validator('password')
    def validate_admin_password(cls, v):
        if len(v) < 6:
            raise ValueError("Kata laluan minimum 6 aksara")
        return v
    
    @validator('phone')
    def validate_admin_user_phone(cls, v):
        return validate_phone(v)
    
    @validator('phone_alt')
    def validate_admin_user_phone_alt(cls, v):
        return validate_phone(v) if v else v
    
    @validator('ic_number')
    def validate_admin_user_ic(cls, v):
        return validate_ic_number(v)
    
    @validator('gender')
    def validate_admin_user_gender(cls, v):
        return validate_gender(v) if v else v

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    phone_alt: Optional[str] = None  # No. Telefon Alternatif
    gender: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    assigned_class: Optional[str] = None
    assigned_form: Optional[int] = None  # Tingkatan
    assigned_block: Optional[str] = None
    state: Optional[str] = None
    status: Optional[str] = None  # active/inactive
    
    @validator('full_name')
    def validate_update_name(cls, v):
        return validate_name(v, "Nama penuh") if v else v
    
    @validator('phone')
    def validate_update_phone(cls, v):
        return validate_phone(v) if v else v
    
    @validator('phone_alt')
    def validate_update_phone_alt(cls, v):
        return validate_phone(v) if v else v
    
    @validator('gender')
    def validate_update_gender(cls, v):
        return validate_gender(v) if v else v

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    phone: str
    phone_alt: Optional[str] = None  # No. Telefon Alternatif
    role: str
    role_name: str
    ic_number: Optional[str] = None
    gender: Optional[str] = None  # male, female
    is_active: bool
    assigned_class: Optional[str] = None
    assigned_form: Optional[int] = None  # Tingkatan (1-5)
    assigned_block: Optional[str] = None
    assigned_bus_id: Optional[str] = None  # untuk bus_driver: id bas yang ditugaskan
    staff_id: Optional[str] = None
    matric_number: Optional[str] = None
    state: Optional[str] = None
    status: Optional[str] = None  # active/inactive
    permissions: List[str] = []

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class StudentCreate(BaseModel):
    full_name: str
    matric_number: str
    ic_number: str
    year: int = Field(ge=2020, le=2030)
    form: int = Field(ge=1, le=5)
    class_name: str
    block_name: str
    room_number: str
    state: str
    religion: str = "Islam"
    bangsa: str = "Melayu"
    gender: Optional[str] = None
    relationship: str = "BAPA"  # IBU, BAPA, PENJAGA - hubungan dengan pendaftar
    address: Optional[str] = None
    postcode: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    
    @validator('full_name')
    def validate_student_name(cls, v):
        return validate_name(v, "Nama pelajar")
    
    @validator('matric_number')
    def validate_student_matric(cls, v):
        return validate_matric_number(v)
    
    @validator('ic_number')
    def validate_student_ic(cls, v):
        return validate_ic_number(v) if v else v
    
    @validator('class_name')
    def validate_student_class(cls, v):
        return validate_class_name(v)
    
    @validator('gender')
    def validate_student_gender(cls, v):
        return validate_gender(v) if v else v
    
    @validator('relationship')
    def validate_student_relationship(cls, v):
        if v and v.upper() not in ['IBU', 'BAPA', 'PENJAGA']:
            raise ValueError("Hubungan mestilah IBU, BAPA, atau PENJAGA")
        return v.upper() if v else "BAPA"
    
    @validator('phone')
    def validate_student_phone(cls, v):
        return validate_phone(v) if v else v
    
    @validator('email')
    def validate_student_email(cls, v):
        return validate_email_format(v) if v else v

class StudentUpdate(BaseModel):
    full_name: Optional[str] = None
    ic_number: Optional[str] = None
    year: Optional[int] = None
    form: Optional[int] = None
    class_name: Optional[str] = None
    block_name: Optional[str] = None
    room_number: Optional[str] = None
    state: Optional[str] = None
    religion: Optional[str] = None
    bangsa: Optional[str] = None
    gender: Optional[str] = None
    relationship: Optional[str] = None  # IBU, BAPA, PENJAGA
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    postcode: Optional[str] = None
    city: Optional[str] = None
    
    @validator('full_name')
    def validate_student_update_name(cls, v):
        return validate_name(v, "Nama pelajar") if v else v
    
    @validator('ic_number')
    def validate_student_update_ic(cls, v):
        return validate_ic_number(v) if v else v
    
    @validator('class_name')
    def validate_student_update_class(cls, v):
        return validate_class_name(v) if v else v
    
    @validator('gender')
    def validate_student_update_gender(cls, v):
        return validate_gender(v) if v else v
    
    @validator('relationship')
    def validate_student_update_relationship(cls, v):
        if v and v.upper() not in ['IBU', 'BAPA', 'PENJAGA']:
            raise ValueError("Hubungan mestilah IBU, BAPA, atau PENJAGA")
        return v.upper() if v else v
    
    @validator('form')
    def validate_student_update_form(cls, v):
        if v is not None and v not in [1, 2, 3, 4, 5]:
            raise ValueError("Tingkatan mesti 1-5")
        return v
    
    @validator('phone')
    def validate_student_update_phone(cls, v):
        return validate_phone(v) if v else v
    
    @validator('email')
    def validate_student_update_email(cls, v):
        return validate_email_format(v) if v else v

class StudentResponse(BaseModel):
    id: str
    full_name: str
    matric_number: str
    ic_number: str
    year: int
    form: int
    class_name: str
    block_name: str
    room_number: str
    state: str
    status: str
    parent_id: str
    created_at: str
    religion: Optional[str] = "Islam"
    bangsa: Optional[str] = "Melayu"
    gender: Optional[str] = None
    relationship: Optional[str] = "BAPA"  # IBU, BAPA, PENJAGA
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    postcode: Optional[str] = None
    city: Optional[str] = None
    address_incomplete: bool = False

# ============ FEE PACKAGE MODELS ============

class FeePackageItem(BaseModel):
    code: str  # e.g., M01, D01, A01
    name: str
    amount: float
    mandatory: bool = True
    payment_terms: Optional[int] = 1  # 1 = one-time, 2 = split into 2 terms, etc.

class FeePackageSubCategory(BaseModel):
    name: str  # e.g., "Yuran Tetap Muafakat", "Dana Kecemerlangan"
    items: List[FeePackageItem]

class FeePackageCategory(BaseModel):
    name: str  # e.g., "MUAFAKAT", "KOPERASI"
    sub_categories: List[FeePackageSubCategory]

class FeePackageCreate(BaseModel):
    year: int  # e.g., 2026
    form: int  # 1-6 (Tingkatan)
    name: str  # e.g., "Pakej Yuran 5 2026"
    categories: List[FeePackageCategory]
    is_active: bool = True

class FeePackageResponse(BaseModel):
    id: str
    year: int
    form: int
    name: str
    categories: List[FeePackageCategory]
    total_amount: float
    is_active: bool
    created_at: str
    created_by: Optional[str] = None

class StudentFeeAssignment(BaseModel):
    student_id: str
    package_id: str

class FeeCreate(BaseModel):
    student_id: str
    category: str
    amount: float
    description: str
    due_date: str
    year: int
    form: int

class FeeSubItem(BaseModel):
    code: str
    sub_category: str
    amount: float
    description: str
    paid: bool = False
    mandatory: bool = True

class FeeResponse(BaseModel):
    id: str
    student_id: str
    student_name: str
    category: str
    amount: float
    paid_amount: float
    description: str
    sub_items: Optional[List[FeeSubItem]] = None
    due_date: str
    status: str
    year: int
    form: int
    created_at: str

class ChildFeeCard(BaseModel):
    student_id: str
    student_name: str
    matric_number: str
    form: int
    class_name: str
    total_fees: float
    paid_amount: float
    progress_percent: float
    categories: List[dict]

class PaymentCreate(BaseModel):
    fee_id: str
    amount: float
    payment_method: str

class PaymentResponse(BaseModel):
    id: str
    fee_id: str
    amount: float
    payment_method: str
    status: str
    receipt_number: str
    created_at: str

class NotificationResponse(BaseModel):
    id: str
    user_id: str
    title: str
    message: str
    type: str
    is_read: bool
    created_at: str

class AuditLogResponse(BaseModel):
    id: str
    user_id: str
    user_name: str
    user_role: str
    action: str
    module: str
    details: str
    ip_address: Optional[str] = None
    created_at: str

class HostelRecord(BaseModel):
    student_id: str
    check_type: str = "keluar"  # keluar/masuk - defaults to keluar for checkout
    tarikh_keluar: Optional[str] = None
    tarikh_pulang: Optional[str] = None
    pic_name: str
    driver_name: Optional[str] = None
    vehicle_out: Optional[str] = None
    vehicle_in: Optional[str] = None
    kategori: str  # lawatan, pertandingan, sakit, kecemasan, program_rasmi, pulang_bermalam
    remarks: Optional[str] = None

class PulangBermalamRequest(BaseModel):
    student_id: str
    tarikh_keluar: str  # YYYY-MM-DD
    tarikh_pulang: str  # YYYY-MM-DD
    sebab: str  # Sebab pulang bermalam
    pic_name: str  # Nama penjaga yang akan ambil
    pic_phone: Optional[str] = None  # No telefon penjaga

class SickbayRecord(BaseModel):
    student_id: str
    check_in_time: str
    symptoms: str
    initial_treatment: str
    follow_up: Optional[str] = None
    check_out_time: Optional[str] = None

class VehicleRecord(BaseModel):
    plate_number: str
    owner_name: str
    relationship: str  # ibu, bapa, penjaga
    phone: str
    student_id: str

# ============ DONATION/SEDEKAH MODELS ============

class DonationCampaignCreate(BaseModel):
    title: str
    description: str
    full_description: Optional[str] = None
    target_amount: float
    category: str  # tabung_pelajar, tabung_masjid, tabung_asrama, tabung_kecemasan, tabung_anak_yatim
    start_date: str
    end_date: str
    image_url: Optional[str] = None
    gallery_images: Optional[List[str]] = []
    organizer: Optional[str] = "MRSMKU"
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None

class DonationCampaignUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    full_description: Optional[str] = None
    target_amount: Optional[float] = None
    is_active: Optional[bool] = None
    end_date: Optional[str] = None
    image_url: Optional[str] = None
    gallery_images: Optional[List[str]] = None
    organizer: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None

class DonationCreate(BaseModel):
    campaign_id: str
    amount: float
    payment_method: str  # fpx, card, ewallet
    is_anonymous: bool = False
    message: Optional[str] = None

class PublicDonationCreate(BaseModel):
    campaign_id: str
    amount: float
    payment_method: str = "fpx"  # fpx, card, ewallet
    donor_name: Optional[str] = None  # For anonymous public donors
    donor_email: Optional[str] = None
    donor_phone: Optional[str] = None
    message: Optional[str] = None

class DonationResponse(BaseModel):
    id: str
    campaign_id: str
    campaign_title: str
    donor_name: str
    amount: float
    payment_method: str
    is_anonymous: bool
    message: Optional[str]
    receipt_number: str
    status: str
    created_at: str

class CampaignResponse(BaseModel):
    id: str
    title: str
    description: str
    category: str
    target_amount: float
    collected_amount: float
    donor_count: int
    progress_percent: float
    start_date: str
    end_date: str
    is_active: bool
    image_url: Optional[str]
    created_at: str

# ============ DATABASE SETUP ============

async def load_rbac_from_db():
    """Load RBAC permissions from database into memory"""
    global ROLE_PERMISSIONS
    try:
        rbac_configs = await db.rbac_config.find({}).to_list(100)
        if rbac_configs:
            for config in rbac_configs:
                role = config.get("role")
                permissions = config.get("permissions", [])
                if role and role in ROLES:
                    ROLE_PERMISSIONS[role] = permissions
    except Exception:
        pass  # Use default if any error

@asynccontextmanager
async def lifespan(app: FastAPI):
    global client, db, core_db, ROLE_PERMISSIONS, scheduler
    strict_postgres_only = DB_ENGINE == "postgres"
    if strict_postgres_only:
        client = None
        db = None
    else:
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]

    if is_postgres_mode():
        await init_postgres()
        core_db = CoreStore(
            session_factory=get_session_factory(),
            mongo_db=db,
            mirror_writes=is_hybrid_mode(),
            postgres_all_collections=strict_postgres_only,
        )
        if strict_postgres_only:
            # In strict postgres mode, route all runtime calls through CoreStore.
            db = core_db
            scheduler_logger.info("Database mode: PostgreSQL-only (all collections via CoreStore)")
        else:
            scheduler_logger.info("Core modules database: PostgreSQL (%s)", DB_ENGINE)
    else:
        core_db = db
        scheduler_logger.info("Core modules database: MongoDB")

    if not strict_postgres_only:
        # Create indexes
        await db.users.create_index("email", unique=True)
        await db.students.create_index("matric_number", unique=True)
        await db.students.create_index("parent_id")
        await db.fees.create_index("student_id")
        await db.payments.create_index("fee_id")
        await db.audit_logs.create_index("created_at")
        await db.audit_logs.create_index("module")  # Fasa 9: filter by module (hostel, discipline, escalation, etc.)
        await db.notifications.create_index("user_id")
        await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
        await db.hostel_records.create_index("student_id")
        await db.movement_logs.create_index("student_id")
        await db.movement_logs.create_index("created_at")
        await db.movement_logs.create_index([("student_id", 1), ("created_at", -1)])
        await db.offences.create_index("student_id")
        await db.offences.create_index("created_at")
        await db.offences.create_index("status")
        await db.olat_cases.create_index("student_id")
        await db.olat_cases.create_index("offence_id")
        await db.olat_cases.create_index("created_at")
        await db.olat_categories.create_index("order")
        # offence_sections: remove duplicates then create unique index (must not crash startup)
        try:
            await db.offence_sections.drop_index("code_1")
        except Exception:
            pass
        try:
            sections = await db.offence_sections.find({}).sort("_id", 1).to_list(500)
            seen_codes = set()
            ids_to_delete = []
            for doc in sections:
                code = doc.get("code")
                if code is None:
                    continue
                if code in seen_codes:
                    ids_to_delete.append(doc["_id"])
                else:
                    seen_codes.add(code)
            if ids_to_delete:
                await db.offence_sections.delete_many({"_id": {"$in": ids_to_delete}})
                scheduler_logger.info("Removed %d duplicate offence_sections", len(ids_to_delete))
        except Exception as e:
            scheduler_logger.warning("offence_sections dedup skip: %s", e)
        try:
            await db.offence_sections.create_index("code", unique=True)
            await db.offence_sections.create_index("order")
        except Exception as e:
            scheduler_logger.warning("offence_sections index skipped (server will run without unique code index): %s", e)
        await db.sickbay_records.create_index("student_id")
        await db.vehicles.create_index("plate_number", unique=True)
        await db.rbac_config.create_index("role", unique=True)
        
        # Create marketplace indexes
        await db.marketplace_ads.create_index("status")
        await db.marketplace_ads.create_index("end_date")
        await db.product_boosts.create_index([("status", 1), ("end_date", 1)])
        await db.marketplace_vendors.create_index([("tier", 1), ("premium_expires_at", 1)])
        await db.scheduler_logs.create_index("run_at")
        await db.payment_reminders.create_index([("user_id", 1), ("status", 1), ("remind_at", 1)])
        await db.payment_reminders.create_index("remind_at")
        await db.payment_reminder_preferences.create_index("user_id", unique=True)
        # Yuran list performance indexes (supports admin list at 100K+ scale)
        await db.student_yuran.create_index([("tahun", -1), ("tingkatan", 1), ("student_name", 1)])
        await db.student_yuran.create_index([("tahun", -1), ("status", 1), ("tingkatan", 1)])
        await db.student_yuran.create_index("status")
        await db.student_yuran.create_index("tingkatan")
        await db.student_yuran.create_index("student_id")
        await db.student_yuran.create_index("parent_id")
        await db.student_yuran.create_index("matric_number")
        await db.student_yuran.create_index("billing_mode")
        await db.hostel_blocks.create_index("code", unique=True)
        await db.email_templates.create_index("template_key", unique=True)
        await db.password_reset_tokens.create_index("token", unique=True)
        await db.password_reset_tokens.create_index("expires_at")
    else:
        scheduler_logger.info("MongoDB bootstrap/index setup skipped (PostgreSQL-only mode)")
    
    # Start background scheduler for monetization expiration
    scheduler.add_job(
        run_monetization_expiration_job,
        trigger=IntervalTrigger(hours=1),  # Run every hour
        id="monetization_expiration",
        name="Expire ads, boosts, and premium subscriptions",
        replace_existing=True
    )
    
    # Add auto-sync job (runs daily at 2 AM by default)
    scheduler.add_job(
        run_auto_sync_job,
        trigger=IntervalTrigger(hours=24),  # Run every 24 hours
        id="auto_sync_data",
        name="Auto-sync students and users data",
        replace_existing=True
    )

    scheduler.add_job(
        run_payment_reminder_job,
        trigger=IntervalTrigger(minutes=5),  # Run every 5 minutes
        id="payment_reminder_dispatch",
        name="Dispatch due payment reminders",
        replace_existing=True
    )
    
    scheduler.start()
    scheduler_logger.info(
        "Background scheduler started - monetization expiration (hourly), auto-sync (daily), payment reminders (5 min)"
    )
    
    # Initialize auto-sync settings if not exists
    auto_sync_settings = await db.settings.find_one({"type": "auto_sync"})
    if not auto_sync_settings:
        await db.settings.insert_one({
            "type": "auto_sync",
            "enabled": True,
            "interval_hours": 24,
            "last_run": None,
            "last_results": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    # Seed RBAC default config if not exists
    rbac_count = await db.rbac_config.count_documents({})
    if rbac_count == 0:
        for role, permissions in DEFAULT_ROLE_PERMISSIONS.items():
            await db.rbac_config.insert_one({
                "role": role,
                "permissions": permissions,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            })
    
    # Load RBAC from database
    await load_rbac_from_db()
    # Satu sumber auth (register/login): pelajar dan anak disatukan dalam db.students
    auth_routes.init_db(core_db, ROLES, ROLE_PERMISSIONS)
    
    # Seed default hostel blocks if empty (sync dengan tetapan Asrama)
    if await db.hostel_blocks.count_documents({}) == 0:
        now = datetime.now(timezone.utc).isoformat()
        for b in DEFAULT_HOSTEL_BLOCKS:
            await db.hostel_blocks.insert_one({
                "code": b["code"],
                "name": b["name"],
                "gender": b["gender"],
                "levels": b.get("levels", []),
                "beds_per_level": b.get("beds_per_level") or [],
                "beds_per_room": b.get("beds_per_room"),
                "capacity": None,
                "warden_id": None,
                "description": None,
                "is_active": True,
                "created_by": None,
                "created_at": now,
                "updated_at": now,
            })
        scheduler_logger.info("Seeded default hostel blocks")
    
    # Seed default email templates (untuk modul Template Email / SES)
    _fee_reminder_default_html = (
        "<p>Assalamualaikum {{parent_name}},</p>"
        "<p>RUJUKAN: {{rujukan_surat}}<br/>"
        "TARIKH: {{tarikh_surat}}</p>"
        "<p>Kepada:<br/>Ibu Bapa / Penjaga</p>"
        "<p>Pelajar: <strong>{{student_name}}</strong><br/>"
        "No. Matriks: <strong>{{no_matriks}}</strong><br/>"
        "Tingkatan Semasa: <strong>{{current_tingkatan}}</strong></p>"
        "<p>Tuan/Puan,</p>"
        "<p><strong>PER: MAKLUMAN TUNGGAKAN YURAN PERSEKOLAHAN</strong></p>"
        "<p>Dengan segala hormatnya perkara di atas adalah dirujuk.</p>"
        "<p>Pihak sekolah ingin memaklumkan bahawa pelajar di bawah jagaan tuan/puan iaitu "
        "<strong>{{student_name}}</strong> (No. Matriks: <strong>{{no_matriks}}</strong>) "
        "mempunyai tunggakan yuran persekolahan seperti berikut:</p>"
        "<p><strong>Butiran Tunggakan:</strong></p>"
        "<table style=\"border-collapse:collapse;width:100%;max-width:720px;\">"
        "<thead>"
        "<tr>"
        "<th style=\"border:1px solid #e2e8f0;padding:6px 8px;text-align:left;background:#f8fafc;\">Tingkatan</th>"
        "<th style=\"border:1px solid #e2e8f0;padding:6px 8px;text-align:right;background:#f8fafc;\">Jumlah Yuran (RM)</th>"
        "<th style=\"border:1px solid #e2e8f0;padding:6px 8px;text-align:right;background:#f8fafc;\">Jumlah Bayaran (RM)</th>"
        "<th style=\"border:1px solid #e2e8f0;padding:6px 8px;text-align:right;background:#f8fafc;\">Jumlah Tunggakan (RM)</th>"
        "</tr>"
        "</thead>"
        "<tbody>{{outstanding_tingkatan_rows_html}}</tbody>"
        "</table>"
        "<p><strong>Jumlah Keseluruhan Tunggakan: RM {{total_outstanding}}</strong><br/>"
        "Jumlah Bayaran Diterima Setakat Ini: RM {{total_paid}}</p>"
        "<p>Sehubungan itu, pihak sekolah amat menghargai kerjasama tuan/puan untuk menjelaskan tunggakan tersebut "
        "dalam tempoh yang terdekat bagi memastikan segala urusan pentadbiran dan kemudahan persekolahan pelajar "
        "dapat berjalan dengan lancar.</p>"
        "<p>Sekiranya bayaran telah dibuat, sila abaikan makluman ini. Jika tuan/puan mempunyai sebarang pertanyaan "
        "atau memerlukan perbincangan lanjut berkaitan kaedah pembayaran, sila hubungi pihak pentadbiran sekolah "
        "melalui pejabat sekolah.</p>"
        "<p>Kerjasama dan perhatian daripada pihak tuan/puan amatlah dihargai dan didahului dengan ucapan terima kasih.</p>"
        "<p>Sekian.<br/>\"BERKHIDMAT UNTUK PENDIDIKAN\"</p>"
    )
    _fee_reminder_default_text = (
        "Assalamualaikum {{parent_name}},\n\n"
        "RUJUKAN: {{rujukan_surat}}\n"
        "TARIKH: {{tarikh_surat}}\n\n"
        "Pelajar: {{student_name}}\n"
        "No. Matriks: {{no_matriks}}\n"
        "Tingkatan Semasa: {{current_tingkatan}}\n\n"
        "PER: MAKLUMAN TUNGGAKAN YURAN PERSEKOLAHAN\n\n"
        "Butiran Tunggakan:\n"
        "{{outstanding_tingkatan_rows_text}}\n\n"
        "Jumlah Keseluruhan Tunggakan: RM {{total_outstanding}}\n"
        "Jumlah Bayaran Diterima Setakat Ini: RM {{total_paid}}\n"
    )
    _default_email_templates = [
        {
            "template_key": "fee_reminder",
            "name": "Peringatan Yuran Tertunggak",
            "description": "E-mel peringatan tunggakan yuran ke ibu bapa",
            "subject": "[MRSMKU] Peringatan Tunggakan Yuran - {{student_name}} ({{no_matriks}})",
            "body_html": _fee_reminder_default_html,
            "body_text": _fee_reminder_default_text,
            "variables": [
                "parent_name",
                "child_name",
                "student_name",
                "no_matriks",
                "rujukan_surat",
                "tarikh_surat",
                "children_outstanding",
                "outstanding_year_rows_text",
                "outstanding_year_rows_html",
                "outstanding_tingkatan_rows_text",
                "outstanding_tingkatan_rows_html",
                "current_tingkatan",
                "total_outstanding",
                "total_paid",
                "surat_peringatan_text",
            ],
            "is_active": True,
        },
        {"template_key": "payment_confirm", "name": "Pengesahan Pembayaran", "description": "E-mel pengesahan bayaran yuran", "subject": "[MRSMKU] Pengesahan Pembayaran - {{receipt_number}}", "body_html": "<p>Assalamualaikum {{parent_name}},</p><p>Terima kasih. Pembayaran RM {{amount}} untuk {{child_name}}. No. Resit: {{receipt_number}}. Baki: RM {{remaining}}.</p><p>Portal MRSMKU</p>", "variables": ["parent_name", "child_name", "amount", "receipt_number", "remaining"], "is_active": True},
        {"template_key": "new_fee_assignment", "name": "Yuran Baru Dikenakan", "description": "E-mel makluman yuran baru", "subject": "[MRSMKU] Yuran Baru - {{child_name}}", "body_html": "<p>Assalamualaikum {{parent_name}},</p><p>Yuran baru {{fee_set_name}} (RM {{total_amount}}) untuk {{child_name}}.</p><p>{{items_html}}</p><p>Portal MRSMKU</p>", "variables": ["parent_name", "child_name", "fee_set_name", "total_amount", "items_html"], "is_active": True},
        {"template_key": "bus_booking", "name": "Pengesahan Tempahan Bas", "description": "E-mel pengesahan tempahan tiket bas", "subject": "[MRSMKU] Pengesahan Tempahan Bas - {{trip_date}}", "body_html": "<p>Assalamualaikum {{recipient_name}},</p><p>Tempahan bas anda untuk {{trip_date}} telah disahkan.</p><p>{{booking_details}}</p><p>Portal MRSMKU</p>", "variables": ["recipient_name", "trip_date", "booking_details"], "is_active": True},
        {"template_key": "test_email", "name": "E-mel Ujian", "description": "E-mel ujian konfigurasi", "subject": "Email Ujian - Portal MRSMKU", "body_html": "<p>Konfigurasi e-mel berfungsi. Masa: {{timestamp}}.</p><p>Portal MRSMKU</p>", "variables": ["timestamp"], "is_active": True},
    ]
    for t in _default_email_templates:
        existing = await db.email_templates.find_one({"template_key": t["template_key"]})
        if not existing:
            now_et = datetime.now(timezone.utc).isoformat()
            await db.email_templates.insert_one({**t, "created_at": now_et, "updated_at": now_et})
            continue
        if t["template_key"] == "fee_reminder":
            now_et = datetime.now(timezone.utc).isoformat()
            existing_vars = existing.get("variables") if isinstance(existing.get("variables"), list) else []
            merged_vars: List[str] = list(dict.fromkeys([*(t.get("variables") or []), *existing_vars]))
            existing_body_html = str(existing.get("body_html") or "")
            has_legacy_children_table = "{{children_table_html}}" in existing_body_html or ("children_table_html" in existing_vars)
            needs_default_body_backfill = has_legacy_children_table or not existing_body_html.strip()

            update_doc: Dict[str, Any] = {}
            if merged_vars != existing_vars:
                update_doc["variables"] = merged_vars
            if needs_default_body_backfill:
                update_doc.update({
                    "subject": t["subject"],
                    "body_html": t["body_html"],
                    "body_text": t.get("body_text"),
                })
            if update_doc:
                update_doc["updated_at"] = now_et
                await db.email_templates.update_one({"_id": existing["_id"]}, {"$set": update_doc})
    scheduler_logger.info("Email templates ready")

    # Seed chatbox FAQ, responses & suggestions (sekali sahaja; elak data duplicate & panggilan berulang)
    await _seed_chatbox_collections()

    # Seed SuperAdmin (sentiasa pastikan kata laluan = super123 supaya boleh log masuk)
    superadmin_doc = {
        "email": "superadmin@muafakat.link",
        "password": pwd_context.hash("super123"),
        "full_name": "Super Administrator",
        "phone": "0100000000",
        "role": "superadmin",
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.update_one(
        {"email": "superadmin@muafakat.link"},
        {"$set": {
            "password": superadmin_doc["password"],
            "full_name": superadmin_doc["full_name"],
            "phone": superadmin_doc["phone"],
            "role": superadmin_doc["role"],
            "is_active": True,
        }}
    )
    if result.matched_count == 0:
        await db.users.insert_one(superadmin_doc)

    # Seed Admin
    admin = await db.users.find_one({"email": "admin@muafakat.link"})
    if not admin:
        await db.users.insert_one({
            "email": "admin@muafakat.link",
            "password": pwd_context.hash("admin123"),
            "full_name": "Admin MRSMKU",
            "phone": "0123456789",
            "role": "admin",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        })

    # Seed Admin Bas (urus modul bas sepenuhnya)
    bus_admin_user = await db.users.find_one({"email": "busadmin@muafakat.link"})
    if not bus_admin_user:
        await db.users.insert_one({
            "email": "busadmin@muafakat.link",
            "password": pwd_context.hash("busadmin123"),
            "full_name": "Pentadbir Bas MRSMKU",
            "phone": "0127778899",
            "role": "bus_admin",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        })

    # Seed Driver Bas (assigned_bus_id boleh diset oleh admin kemudian)
    driver_user = await db.users.find_one({"email": "driver@muafakat.link"})
    if not driver_user:
        await db.users.insert_one({
            "email": "driver@muafakat.link",
            "password": pwd_context.hash("driver123"),
            "full_name": "Driver Bas Demo",
            "phone": "0123334455",
            "role": "bus_driver",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        })

    # Seed data demo modul bas jika tiada syarikat demo (supaya /bus-admin/company ada data)
    try:
        demo_count = await db.bus_companies.count_documents({"created_by": "seed_bus_data"})
        if demo_count == 0:
            from seed_bus_data import seed_bus_data_into
            await seed_bus_data_into(db, silent=True)
    except Exception as e:
        import logging
        logging.getLogger("uvicorn.error").warning("Bus seed on startup skipped: %s", e)

    # Seed Bendahari
    bendahari = await db.users.find_one({"email": "bendahari@muafakat.link"})
    if not bendahari:
        await db.users.insert_one({
            "email": "bendahari@muafakat.link",
            "password": pwd_context.hash("bendahari123"),
            "full_name": "Bendahari MRSMKU",
            "phone": "0129876543",
            "role": "bendahari",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    # Seed sample staff
    sample_staff = [
        {"email": "warden@muafakat.link", "password": "warden123", "full_name": "Warden Blok A", "phone": "0121111111", "role": "warden", "assigned_block": "Blok A"},
        {"email": "guard@muafakat.link", "password": "guard123", "full_name": "Pengawal Ahmad", "phone": "0122222222", "role": "guard"},
        {"email": "guru@muafakat.link", "password": "guru123", "full_name": "Cikgu Aminah", "phone": "0123333333", "role": "guru_kelas", "assigned_class": "A"},
        {"email": "parent@muafakat.link", "password": "parent123", "full_name": "Encik Kamal bin Hassan", "phone": "0124445566", "role": "parent", "ic_number": "750101-01-5566"},
        {"email": "parent2@muafakat.link", "password": "parent123", "full_name": "Puan Siti Rahmah bt Abdullah", "phone": "0125556677", "role": "parent", "ic_number": "780202-02-6677"},
        {"email": "bendahari@muafakat.link", "password": "bendahari123", "full_name": "Puan Siti Bendahari", "phone": "0126667788", "role": "bendahari"},
        {"email": "sub_bendahari@muafakat.link", "password": "subbendahari123", "full_name": "En. Ali Sub Bendahari", "phone": "0126667799", "role": "sub_bendahari"},
        {"email": "juruaudit@muafakat.link", "password": "juruaudit123", "full_name": "En. Ahmad Juruaudit", "phone": "0126668800", "role": "juruaudit"}
    ]
    
    for staff in sample_staff:
        existing = await db.users.find_one({"email": staff["email"]})
        if not existing:
            staff["password"] = pwd_context.hash(staff["password"])
            staff["is_active"] = True
            staff["created_at"] = datetime.now(timezone.utc).isoformat()
            await db.users.insert_one(staff)
    
    # Seed Demo Student (Pelajar) — pastikan sentiasa ada dalam database sebenar (upsert)
    demo_student_user = await db.users.find_one({"matric_number": "M2024001"})
    if not demo_student_user:
        demo_student_user = await db.users.insert_one({
            "email": "pelajar@muafakat.link",
            "password": pwd_context.hash("pelajar123"),
            "full_name": "Ahmad bin Abu",
            "phone": "0124444444",
            "ic_number": "100101-01-1234",
            "matric_number": "M2024001",
            "role": "pelajar",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        user_id = demo_student_user.inserted_id
    else:
        user_id = demo_student_user["_id"]
    demo_parent = await db.users.find_one({"role": "parent"})
    parent_id = demo_parent["_id"] if demo_parent else user_id
    demo_student_doc = {
        "full_name": "Ahmad bin Abu",
        "matric_number": "M2024001",
        "ic_number": "100101-01-1234",
        "year": 2024,
        "form": 4,
        "class_name": "A",
        "block_name": "JA",
        "gender": "lelaki",
        "room_number": "101",
        "state": "Selangor",
        "status": "approved",
        "parent_id": parent_id,
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    existing_demo_record = await db.students.find_one({"matric_number": "M2024001"})
    if not existing_demo_record:
        await db.students.insert_one(demo_student_doc)
    else:
        await db.students.update_one(
            {"matric_number": "M2024001"},
            {"$set": {"block_name": "JA", "gender": "lelaki", "room_number": "101", "status": "approved", "full_name": "Ahmad bin Abu"}}
        )
    
    # Seed 10 Sample Students (Additional) — block_name ikut blok sebenar (JA/JB/JC lelaki; I/H/G/F/E perempuan)
    sample_students = [
        {"matric": "S2026001", "name": "Aiman bin Razali", "ic": "100501-01-1001", "form": 1, "class": "A", "block": "JA", "gender": "lelaki", "room": "101", "state": "Selangor"},
        {"matric": "S2026002", "name": "Nurul Aisyah bt Ahmad", "ic": "100502-02-1002", "form": 2, "class": "B", "block": "I", "gender": "perempuan", "room": "102", "state": "Johor"},
        {"matric": "S2026003", "name": "Muhammad Arif bin Ismail", "ic": "100503-03-1003", "form": 3, "class": "C", "block": "JB", "gender": "lelaki", "room": "203", "state": "Perak"},
        {"matric": "S2026004", "name": "Siti Aminah bt Hassan", "ic": "100504-04-1004", "form": 4, "class": "D", "block": "H", "gender": "perempuan", "room": "104", "state": "Kedah"},
        {"matric": "S2026005", "name": "Hafiz bin Mohd Yusof", "ic": "100505-05-1005", "form": 5, "class": "E", "block": "JC", "gender": "lelaki", "room": "205", "state": "Pahang"},
        {"matric": "S2026006", "name": "Fatimah bt Osman", "ic": "100506-06-1006", "form": 1, "class": "F", "block": "G", "gender": "perempuan", "room": "106", "state": "Kelantan"},
        {"matric": "S2026007", "name": "Ahmad Danial bin Zainal", "ic": "100507-07-1007", "form": 2, "class": "A", "block": "JA", "gender": "lelaki", "room": "107", "state": "Terengganu"},
        {"matric": "S2026008", "name": "Nur Hidayah bt Rahman", "ic": "100508-08-1008", "form": 3, "class": "B", "block": "F", "gender": "perempuan", "room": "108", "state": "Melaka"},
        {"matric": "S2026009", "name": "Mohd Faiz bin Abdullah", "ic": "100509-09-1009", "form": 4, "class": "C", "block": "JB", "gender": "lelaki", "room": "209", "state": "Sabah"},
        {"matric": "S2026010", "name": "Aisyah bt Kamal", "ic": "100510-10-1010", "form": 5, "class": "D", "block": "E", "gender": "perempuan", "room": "210", "state": "Sarawak"},
    ]
    
    for student in sample_students:
        existing_user = await db.users.find_one({"matric_number": student["matric"]})
        if not existing_user:
            await db.users.insert_one({
                "email": f"{student['matric'].lower()}@pelajar.mrsm.edu.my",
                "password": pwd_context.hash("student123"),
                "full_name": student["name"],
                "phone": f"01{hash(student['matric']) % 90000000 + 10000000}",
                "ic_number": student["ic"],
                "matric_number": student["matric"],
                "role": "pelajar",
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
        usr = await db.users.find_one({"matric_number": student["matric"]})
        user_id = usr["_id"]
        demo_parent = await db.users.find_one({"role": "parent"})
        parent_id = demo_parent["_id"] if demo_parent else user_id
        existing_record = await db.students.find_one({"matric_number": student["matric"]})
        if not existing_record:
            await db.students.insert_one({
                "full_name": student["name"],
                "matric_number": student["matric"],
                "ic_number": student["ic"],
                "year": 2026,
                "form": student["form"],
                "class_name": student["class"],
                "block_name": student["block"],
                "gender": student.get("gender", "lelaki"),
                "room_number": student["room"],
                "state": student["state"],
                "status": "approved",
                "parent_id": parent_id,
                "user_id": user_id,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
        else:
            await db.students.update_one(
                {"matric_number": student["matric"]},
                {"$set": {
                    "block_name": student["block"],
                    "gender": student.get("gender", "lelaki"),
                    "room_number": student["room"],
                    "status": "approved",
                    "full_name": student["name"],
                }}
            )
    
    # Seed: setiap ibu bapa 2 anak + sample student_yuran (data sebenar)
    parent1 = await db.users.find_one({"email": "parent@muafakat.link", "role": "parent"})
    parent2 = await db.users.find_one({"email": "parent2@muafakat.link", "role": "parent"})
    if parent1 and parent2:
        # Parent 1: 2 anak (M2024001 Ahmad, S2026001 Aiman)
        for matric, name in [("M2024001", "Ahmad bin Abu"), ("S2026001", "Aiman bin Razali")]:
            await db.students.update_one(
                {"matric_number": matric},
                {"$set": {"parent_id": parent1["_id"], "status": "approved", "full_name": name}}
            )
        # Parent 2: 2 anak (S2026002, S2026003)
        for matric, name in [("S2026002", "Nurul Aisyah bt Ahmad"), ("S2026003", "Muhammad Arif bin Ismail")]:
            await db.students.update_one(
                {"matric_number": matric},
                {"$set": {"parent_id": parent2["_id"], "status": "approved", "full_name": name}}
            )
        # Sample student_yuran untuk setiap anak (supaya ada tertunggak)
        for parent_id, matrics in [(parent1["_id"], ["M2024001", "S2026001"]), (parent2["_id"], ["S2026002", "S2026003"])]:
            for matric in matrics:
                child = await db.students.find_one({"matric_number": matric, "parent_id": parent_id})
                if not child:
                    continue
                existing = await db.student_yuran.find_one({"student_id": child["_id"]})
                if not existing:
                    await db.student_yuran.insert_one({
                        "student_id": child["_id"],
                        "parent_id": parent_id,
                        "student_name": child.get("full_name", ""),
                        "tingkatan": child.get("form", 4),
                        "tahun": 2026,
                        "set_yuran_nama": "Yuran Penginapan & Pendidikan 2026",
                        "total_amount": 850.00,
                        "paid_amount": 350.00,
                        "status": "partial",
                        "items": [],
                        "created_at": datetime.now(timezone.utc).isoformat()
                    })
    
    # Seed Donation Campaigns
    campaigns_count = await db.donation_campaigns.count_documents({})
    if campaigns_count == 0:
        sample_campaigns = [
            {
                "title": "Tabung Bantuan Pelajar Asnaf",
                "description": "Sumbangan untuk membantu pelajar asnaf yang memerlukan bantuan kewangan untuk yuran, buku dan keperluan maktab.",
                "category": "tabung_pelajar",
                "target_amount": 50000.00,
                "collected_amount": 23500.00,
                "donor_count": 47,
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
                "is_active": True,
                "image_url": "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=400&h=300&fit=crop",
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "title": "Tabung Pembangunan Surau",
                "description": "Sumbangan untuk penambahbaikan surau MRSMKU termasuk sistem pendingin hawa dan peralatan solat.",
                "category": "tabung_masjid",
                "target_amount": 30000.00,
                "collected_amount": 18200.00,
                "donor_count": 32,
                "start_date": "2024-01-01",
                "end_date": "2024-06-30",
                "is_active": True,
                "image_url": "https://images.unsplash.com/photo-1585036156261-1e2ac1b9c461?w=400&h=300&fit=crop",
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "title": "Tabung Kecemasan Pelajar",
                "description": "Dana kecemasan untuk membantu pelajar yang menghadapi masalah kewangan mendadak seperti kematian keluarga.",
                "category": "tabung_kecemasan",
                "target_amount": 20000.00,
                "collected_amount": 8750.00,
                "donor_count": 21,
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
                "is_active": True,
                "image_url": "https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=400&h=300&fit=crop",
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "title": "Tabung Penambahbaikan Asrama",
                "description": "Sumbangan untuk menaik taraf kemudahan asrama termasuk tilam, almari dan kipas baru.",
                "category": "tabung_asrama",
                "target_amount": 40000.00,
                "collected_amount": 12300.00,
                "donor_count": 28,
                "start_date": "2024-02-01",
                "end_date": "2024-08-31",
                "is_active": True,
                "image_url": "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=400&h=300&fit=crop",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
        ]
        await db.donation_campaigns.insert_many(sample_campaigns)
    
    yield
    
    # Shutdown scheduler
    if scheduler.running:
        scheduler.shutdown(wait=False)
        scheduler_logger.info("Background scheduler stopped")

    await close_postgres()

    if client is not None:
        client.close()

app = FastAPI(title="MRSMKU Portal API - Enterprise", lifespan=lifespan)


@app.get("/")
async def root():
    """Root: sahkan API berjalan. Gunakan /docs untuk Swagger."""
    return {
        "message": "MRSMKU Portal API",
        "docs": "/docs",
        "openapi": "/openapi.json",
    }


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============ HELPERS ============

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token tidak sah")
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=401, detail="Pengguna tidak dijumpai")
        if not user.get("is_active", True):
            raise HTTPException(status_code=403, detail="Akaun tidak aktif")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Token tidak sah")


async def get_current_user_optional(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_optional)):
    """Return current user if valid token provided, else None (for optional auth e.g. AI chat)."""
    if credentials is None:
        return None
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            return None
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user or not user.get("is_active", True):
            return None
        return user
    except Exception:
        return None


def check_permission(user: dict, required_permission: str) -> bool:
    role = user.get("role", "")
    permissions = ROLE_PERMISSIONS.get(role, [])
    if "*" in permissions:
        return True
    return required_permission in permissions

def require_permission(permission: str):
    async def permission_checker(current_user: dict = Depends(get_current_user)):
        if not check_permission(current_user, permission):
            raise HTTPException(status_code=403, detail=f"Tiada kebenaran: {permission}")
        return current_user
    return permission_checker

def require_roles(*roles):
    async def role_checker(current_user: dict = Depends(get_current_user)):
        # If no roles specified, allow all authenticated users
        if roles and current_user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Akses ditolak untuk role ini")
        return current_user
    return role_checker

# Audit logs: semua tindakan disimpan dengan timestamp (created_at), immutable (tiada update/delete),
# dan boleh ditelusur untuk rollback. GET /api/audit-logs untuk superadmin/admin (filter by module).
async def log_audit(user: dict, action: str, module: str, details: str):
    await db.audit_logs.insert_one({
        "user_id": user["_id"],
        "user_name": user.get("full_name", "Unknown"),
        "user_role": user.get("role", "unknown"),
        "action": action,
        "module": module,
        "details": details,
        "created_at": datetime.now(timezone.utc).isoformat()
    })

def serialize_user(user: dict) -> UserResponse:
    role = user.get("role", "parent")
    permissions = ROLE_PERMISSIONS.get(role, [])
    return UserResponse(
        id=str(user["_id"]),
        email=user.get("email", ""),
        full_name=user.get("full_name", user.get("fullName", "")),
        phone=user.get("phone", ""),
        phone_alt=user.get("phone_alt"),
        role=role,
        role_name=ROLES.get(role, {}).get("name", role),
        ic_number=(user.get("ic_number") or "").replace("-", "").replace(" ", "") or None,
        gender=user.get("gender"),
        is_active=user.get("is_active", True),
        assigned_class=user.get("assigned_class"),
        assigned_form=user.get("assigned_form"),
        assigned_block=user.get("assigned_block", user.get("block_assigned", "")),
        assigned_bus_id=str(v) if (v := user.get("assigned_bus_id")) is not None else None,
        staff_id=user.get("staff_id"),
        matric_number=user.get("matric_number", user.get("matric", "")),
        state=user.get("state"),
        status=user.get("status", "active"),
        permissions=permissions if "*" not in permissions else ["*"]
    )

def serialize_student(student: dict) -> StudentResponse:
    created_at = student.get("created_at", "")
    if isinstance(created_at, datetime):
        created_at = created_at.isoformat()
    
    # Handle form field that might be string like "4 Bestari"
    form_val = student.get("form", 1)
    if isinstance(form_val, str):
        # Extract first digit from string
        import re
        match = re.match(r'^(\d+)', form_val)
        form_val = int(match.group(1)) if match else 1
    
    # Check if address info is incomplete
    address = student.get("address", "")
    postcode = student.get("postcode", "")
    city = student.get("city", "")
    address_incomplete = not address or not postcode or not city
    
    ic_raw = student.get("ic_number", "")
    ic_number = (ic_raw or "").replace("-", "").replace(" ", "") if ic_raw else ""

    return StudentResponse(
        id=str(student["_id"]),
        full_name=student.get("full_name", ""),
        matric_number=student.get("matric_number", ""),
        ic_number=ic_number,
        year=student.get("year", 2024),
        form=form_val,
        class_name=student.get("class_name", ""),
        block_name=student.get("block_name", ""),
        room_number=student.get("room_number", ""),
        state=student.get("state", ""),
        status=student.get("status", "pending"),
        parent_id=str(student.get("parent_id", "")),
        created_at=created_at,
        religion=student.get("religion", "Islam"),
        bangsa=student.get("bangsa", "Melayu"),
        gender=student.get("gender"),
        relationship=student.get("relationship", "BAPA"),
        phone=student.get("phone"),
        email=student.get("email"),
        address=address if address else None,
        postcode=postcode if postcode else None,
        city=city if city else None,
        address_incomplete=address_incomplete
    )

def serialize_fee(fee: dict, student_name: str = "") -> FeeResponse:
    sub_items = None
    if fee.get("sub_items"):
        sub_items = [FeeSubItem(
            code=item.get("code", ""),
            sub_category=item.get("sub_category", ""),
            amount=item.get("amount", 0),
            description=item.get("description", ""),
            paid=item.get("paid", False),
            mandatory=item.get("mandatory", True)
        ) for item in fee["sub_items"]]
    
    return FeeResponse(
        id=str(fee["_id"]),
        student_id=str(fee["student_id"]),
        student_name=student_name,
        category=fee["category"],
        amount=fee["amount"],
        paid_amount=fee.get("paid_amount", 0),
        description=fee["description"],
        sub_items=sub_items,
        due_date=fee["due_date"],
        status=fee["status"],
        year=fee["year"],
        form=fee["form"],
        created_at=fee["created_at"]
    )

def serialize_fee_package(package: dict) -> FeePackageResponse:
    categories = []
    total_amount = 0
    
    for cat in package.get("categories", []):
        cat_obj = FeePackageCategory(
            name=cat["name"],
            sub_categories=[
                FeePackageSubCategory(
                    name=sub["name"],
                    items=[FeePackageItem(**item) for item in sub.get("items", [])]
                ) for sub in cat.get("sub_categories", [])
            ]
        )
        categories.append(cat_obj)
        # Calculate total
        for sub in cat.get("sub_categories", []):
            for item in sub.get("items", []):
                total_amount += item.get("amount", 0)
    
    return FeePackageResponse(
        id=str(package["_id"]),
        year=package["year"],
        form=package["form"],
        name=package["name"],
        categories=categories,
        total_amount=total_amount,
        is_active=package.get("is_active", True),
        created_at=package.get("created_at", ""),
        created_by=package.get("created_by")
    )

def serialize_payment(payment: dict) -> PaymentResponse:
    return PaymentResponse(
        id=str(payment["_id"]),
        fee_id=str(payment["fee_id"]),
        amount=payment["amount"],
        payment_method=payment["payment_method"],
        status=payment["status"],
        receipt_number=payment["receipt_number"],
        created_at=payment["created_at"]
    )

def serialize_notification(notification: dict) -> NotificationResponse:
    return NotificationResponse(
        id=str(notification["_id"]),
        user_id=str(notification["user_id"]),
        title=notification["title"],
        message=notification["message"],
        type=notification["type"],
        is_read=notification["is_read"],
        created_at=notification["created_at"]
    )

def serialize_audit(audit: dict) -> AuditLogResponse:
    return AuditLogResponse(
        id=str(audit["_id"]),
        user_id=str(audit["user_id"]),
        user_name=audit["user_name"],
        user_role=audit["user_role"],
        action=audit["action"],
        module=audit["module"],
        details=audit["details"],
        ip_address=audit.get("ip_address"),
        created_at=audit["created_at"]
    )

# ============ AUTH ROUTES (disatukan dalam routes/auth.py) ============
# Register, login, logout, login/student, impersonate, me — satu sumber: auth router.
# Pelajar dan anak = satu entiti dalam db.students (parent_id = link ke ibu bapa).
app.include_router(auth_routes.router)

# ============ ROLE & PERMISSION ROUTES ============

@app.get("/api/roles")
async def get_roles(current_user: dict = Depends(require_roles("superadmin", "admin"))):
    """Get all available roles"""
    return {"roles": ROLES, "permissions": ROLE_PERMISSIONS}

@app.get("/api/roles/{role}/permissions")
async def get_role_permissions(role: str):
    """Get permissions for a specific role"""
    if role not in ROLES:
        raise HTTPException(status_code=404, detail="Role tidak dijumpai")
    return {
        "role": role,
        "role_info": ROLES[role],
        "permissions": ROLE_PERMISSIONS.get(role, [])
    }

# ============ RBAC MANAGEMENT (SUPERADMIN) ============

class RBACUpdateRequest(BaseModel):
    permissions: List[str]

@app.get("/api/rbac/modules")
async def get_rbac_modules(current_user: dict = Depends(require_roles("superadmin"))):
    """Get all available modules and permissions for RBAC configuration"""
    return {
        "modules": AVAILABLE_MODULES,
        "roles": ROLES
    }

@app.get("/api/rbac/config")
async def get_rbac_config(current_user: dict = Depends(require_roles("superadmin"))):
    """Get current RBAC configuration for all roles"""
    rbac_configs = await db.rbac_config.find({}).to_list(100)
    
    result = {}
    for config in rbac_configs:
        role = config.get("role")
        if role:
            result[role] = {
                "permissions": config.get("permissions", []),
                "updated_at": config.get("updated_at", ""),
                "role_info": ROLES.get(role, {})
            }
    
    # Add any missing roles with defaults
    for role in ROLES:
        if role not in result:
            result[role] = {
                "permissions": DEFAULT_ROLE_PERMISSIONS.get(role, []),
                "updated_at": "",
                "role_info": ROLES.get(role, {})
            }
    
    return {
        "config": result,
        "available_modules": AVAILABLE_MODULES
    }

@app.get("/api/rbac/config/{role}")
async def get_role_rbac_config(role: str, current_user: dict = Depends(require_roles("superadmin"))):
    """Get RBAC configuration for a specific role"""
    if role not in ROLES:
        raise HTTPException(status_code=404, detail="Role tidak dijumpai")
    
    config = await db.rbac_config.find_one({"role": role})
    if not config:
        permissions = DEFAULT_ROLE_PERMISSIONS.get(role, [])
    else:
        permissions = config.get("permissions", [])
    
    return {
        "role": role,
        "role_info": ROLES[role],
        "permissions": permissions,
        "available_modules": AVAILABLE_MODULES
    }

@app.put("/api/rbac/config/{role}")
async def update_role_rbac_config(
    role: str,
    request: RBACUpdateRequest,
    current_user: dict = Depends(require_roles("superadmin"))
):
    """Update RBAC permissions for a specific role"""
    global ROLE_PERMISSIONS
    
    if role not in ROLES:
        raise HTTPException(status_code=404, detail="Role tidak dijumpai")
    
    # SuperAdmin cannot have permissions changed
    if role == "superadmin":
        raise HTTPException(status_code=400, detail="Tidak boleh mengubah kebenaran SuperAdmin")
    
    # Validate permissions
    all_valid_permissions = set()
    for module in AVAILABLE_MODULES.values():
        for perm in module["permissions"]:
            all_valid_permissions.add(perm["code"])
    
    # Filter to only valid permissions
    valid_permissions = [p for p in request.permissions if p in all_valid_permissions]
    
    # Update database
    await db.rbac_config.update_one(
        {"role": role},
        {
            "$set": {
                "permissions": valid_permissions,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": str(current_user["_id"])
            }
        },
        upsert=True
    )
    
    # Update in-memory cache
    ROLE_PERMISSIONS[role] = valid_permissions
    
    # Log audit
    await log_audit(
        current_user, 
        "UPDATE_RBAC", 
        "rbac", 
        f"Kemaskini kebenaran untuk role {role}: {len(valid_permissions)} permissions"
    )
    
    return {
        "message": f"Kebenaran untuk {ROLES[role]['name']} berjaya dikemaskini",
        "role": role,
        "permissions": valid_permissions,
        "permissions_count": len(valid_permissions)
    }

@app.post("/api/rbac/reset/{role}")
async def reset_role_rbac_config(
    role: str,
    current_user: dict = Depends(require_roles("superadmin"))
):
    """Reset RBAC permissions for a specific role to defaults"""
    global ROLE_PERMISSIONS
    
    if role not in ROLES:
        raise HTTPException(status_code=404, detail="Role tidak dijumpai")
    
    if role == "superadmin":
        raise HTTPException(status_code=400, detail="Tidak boleh mengubah kebenaran SuperAdmin")
    
    default_permissions = DEFAULT_ROLE_PERMISSIONS.get(role, [])
    
    # Update database
    await db.rbac_config.update_one(
        {"role": role},
        {
            "$set": {
                "permissions": default_permissions,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": str(current_user["_id"]),
                "reset_to_default": True
            }
        },
        upsert=True
    )
    
    # Update in-memory cache
    ROLE_PERMISSIONS[role] = default_permissions
    
    # Log audit
    await log_audit(
        current_user, 
        "RESET_RBAC", 
        "rbac", 
        f"Reset kebenaran untuk role {role} ke default"
    )
    
    return {
        "message": f"Kebenaran untuk {ROLES[role]['name']} berjaya direset ke default",
        "role": role,
        "permissions": default_permissions
    }

# ============ USER MANAGEMENT (MOVED TO routes/users.py) ============
# The following endpoints have been refactored to routes/users.py:
# - GET /api/users - Get all users
# - POST /api/users - Create user
# - PUT /api/users/{user_id} - Update user
# - DELETE /api/users/{user_id} - Delete user
# - PUT /api/users/{user_id}/toggle-active - Toggle user active status

# ============ STUDENT ROUTES ============

@app.post("/api/students", response_model=StudentResponse)
async def create_student(student_data: StudentCreate, current_user: dict = Depends(get_current_user)):
    """Register new student (by parent). Kelas mesti dari Senarai Kelas dalam Tetapan."""
    valid_kelas = await _get_valid_kelas_list()
    if student_data.class_name not in valid_kelas:
        raise HTTPException(
            status_code=400,
            detail=f"Kelas mesti salah satu dari Senarai Kelas: {', '.join(valid_kelas)}. Sila pilih dari dropdown atau kemaskini Senarai Kelas di Tetapan > Data Pelajar."
        )
    existing = await db.students.find_one({"matric_number": student_data.matric_number})
    if existing:
        raise HTTPException(status_code=400, detail="Nombor matrik sudah didaftarkan")
    
    student_doc = {
        "full_name": student_data.full_name,
        "matric_number": student_data.matric_number,
        "ic_number": student_data.ic_number,
        "year": student_data.year,
        "form": student_data.form,
        "class_name": student_data.class_name,
        "block_name": student_data.block_name,
        "room_number": student_data.room_number,
        "state": student_data.state,
        "religion": student_data.religion,
        "bangsa": student_data.bangsa,
        "gender": student_data.gender,
        "address": student_data.address or "",
        "postcode": student_data.postcode or "",
        "city": student_data.city or "",
        "phone": student_data.phone or "",
        "email": student_data.email or "",
        "status": "pending",
        "parent_id": current_user["_id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.students.insert_one(student_doc)
    student_doc["_id"] = result.inserted_id
    
    # Notify admins
    admins = await db.users.find({"role": {"$in": ["admin", "superadmin"]}}).to_list(100)
    for admin in admins:
        await db.notifications.insert_one({
            "user_id": admin["_id"],
            "title": "Pendaftaran Pelajar Baru",
            "message": f"Pelajar {student_data.full_name} ({student_data.matric_number}) menunggu pengesahan.",
            "type": "action",
            "is_read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    await log_audit(current_user, "CREATE_STUDENT", "students", f"Daftar pelajar: {student_data.full_name}")
    
    return serialize_student(student_doc)

@app.get("/api/students")
async def get_students(
    status: Optional[str] = None,
    form: Optional[int] = None,
    class_name: Optional[str] = None,
    block_name: Optional[str] = None,
    page: Optional[int] = Query(None, ge=1),
    limit: Optional[int] = Query(None, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """Get students based on role with optional pagination"""
    query = {}
    
    if current_user["role"] == "parent":
        query["parent_id"] = current_user["_id"]
    elif current_user["role"] == "guru_kelas":
        query["class_name"] = current_user.get("assigned_class", "")
    elif current_user["role"] == "warden":
        query["block_name"] = current_user.get("assigned_block", "")
    elif current_user["role"] == "pelajar":
        # Student can only see themselves
        query["ic_number"] = current_user.get("ic_number", "")
    
    # Apply filters
    if status:
        query["status"] = status
    if form:
        query["form"] = form
    if class_name and current_user["role"] not in ["guru_kelas"]:
        query["class_name"] = class_name
    if block_name and current_user["role"] not in ["warden"]:
        query["block_name"] = block_name
    
    # If pagination is requested, return paginated response
    if page is not None and limit is not None:
        total = await db.students.count_documents(query)
        skip = (page - 1) * limit
        total_pages = (total + limit - 1) // limit if total > 0 else 1
        
        students = await db.students.find(query).sort("full_name", 1).skip(skip).limit(limit).to_list(limit)
        
        return {
            "students": [serialize_student(s) for s in students],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1
            }
        }
    
    # For backward compatibility, return list (limited to 200 for safety)
    students = await db.students.find(query).sort("full_name", 1).to_list(200)
    return [serialize_student(s) for s in students]

@app.get("/api/admin/students")
async def get_admin_students(
    search: Optional[str] = None,
    status: Optional[str] = None,
    form: Optional[int] = None,
    class_name: Optional[str] = None,
    block_name: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_roles("superadmin", "admin", "bendahari", "sub_bendahari"))
):
    """Get all students with search and pagination for admin"""
    query = {}
    
    # Apply search filter
    if search:
        search_regex = {"$regex": search, "$options": "i"}
        query["$or"] = [
            {"full_name": search_regex},
            {"matric_number": search_regex},
            {"ic_number": search_regex},
            {"class_name": search_regex},
            {"block_name": search_regex}
        ]
    
    # Apply filters
    if status:
        query["status"] = status
    if form:
        query["form"] = form
    if class_name:
        query["class_name"] = class_name
    if block_name:
        query["block_name"] = block_name
    
    # Get total count
    total = await db.students.count_documents(query)
    
    # Calculate pagination
    skip = (page - 1) * limit
    total_pages = (total + limit - 1) // limit if total > 0 else 1
    
    # Get paginated students
    students = await db.students.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {
        "students": [serialize_student(s) for s in students],
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1
        }
    }

@app.get("/api/students/{student_id}", response_model=StudentResponse)
async def get_student(student_id: str, current_user: dict = Depends(get_current_user)):
    """Get single student"""
    student = await db.students.find_one({"_id": ObjectId(student_id)})
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    
    # Check access
    if current_user["role"] == "parent" and str(student["parent_id"]) != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    return serialize_student(student)

@app.put("/api/students/{student_id}/approve")
async def approve_student(
    student_id: str,
    current_user: dict = Depends(require_roles("superadmin", "admin"))
):
    """Approve student registration"""
    student = await db.students.find_one({"_id": ObjectId(student_id)})
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    
    await db.students.update_one(
        {"_id": ObjectId(student_id)},
        {"$set": {"status": "approved", "approved_by": str(current_user["_id"]), "approved_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Generate fees based on MRSMKU fee structure
    # Note: Wang Pendaftaran & Wang Caruman dibayar di MARAEPS - tidak termasuk di sini
    
    # 1. Muafakat - RM897.00/tahun (5 pecahan)
    muafakat_items = [
        {"sub_category": "yuran_muafakat", "amount": 200.00, "description": "Yuran Muafakat"},
        {"sub_category": "dana_kecemerlangan", "amount": 200.00, "description": "Dana Kecemerlangan"},
        {"sub_category": "buku_modul", "amount": 197.00, "description": "Buku dan Cetakan Modul"},
        {"sub_category": "tuisyen_program", "amount": 200.00, "description": "Tuisyen Muafakat / Program Motivasi / Kem Jati Diri"},
        {"sub_category": "majlis_graduasi", "amount": 100.00, "description": "Majlis Graduasi"},
    ]
    
    # Create Muafakat fee with sub-items
    muafakat_doc = {
        "student_id": ObjectId(student_id),
        "category": "muafakat",
        "amount": 897.00,
        "paid_amount": 0,
        "description": "Yuran Muafakat (5 pecahan)",
        "sub_items": muafakat_items,
        "due_date": (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d"),
        "status": "pending",
        "year": student["year"],
        "form": student["form"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.fees.insert_one(muafakat_doc)
    
    # 2. Koperasi - RM110.00 (Dobi RM10 x 11 bulan)
    koperasi_items = [
        {"sub_category": f"dobi_bulan_{i+1}", "amount": 10.00, "description": f"Perkhidmatan Dobi - Bulan {i+1}"} 
        for i in range(11)
    ]
    
    koperasi_doc = {
        "student_id": ObjectId(student_id),
        "category": "koperasi",
        "amount": 110.00,
        "paid_amount": 0,
        "description": "Koperasi - Perkhidmatan Dobi (RM10 x 11 bulan)",
        "sub_items": koperasi_items,
        "due_date": (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d"),
        "status": "pending",
        "year": student["year"],
        "form": student["form"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.fees.insert_one(koperasi_doc)
    
    # Notify parent
    await db.notifications.insert_one({
        "user_id": student["parent_id"],
        "title": "Pelajar Disahkan",
        "message": f"Pendaftaran {student['full_name']} telah disahkan. Yuran telah dijana.",
        "type": "success",
        "is_read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    await log_audit(current_user, "APPROVE_STUDENT", "students", f"Sahkan pelajar: {student['full_name']}")
    
    return {"message": "Pelajar disahkan", "status": "approved"}

@app.put("/api/students/{student_id}/reject")
async def reject_student(
    student_id: str,
    current_user: dict = Depends(require_roles("superadmin", "admin"))
):
    """Reject student registration"""
    student = await db.students.find_one({"_id": ObjectId(student_id)})
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    
    await db.students.update_one(
        {"_id": ObjectId(student_id)},
        {"$set": {"status": "rejected", "rejected_by": str(current_user["_id"]), "rejected_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    await db.notifications.insert_one({
        "user_id": student["parent_id"],
        "title": "Pendaftaran Ditolak",
        "message": f"Pendaftaran {student['full_name']} telah ditolak. Sila hubungi pejabat MRSMKU.",
        "type": "error",
        "is_read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    await log_audit(current_user, "REJECT_STUDENT", "students", f"Tolak pelajar: {student['full_name']}")
    
    return {"message": "Pelajar ditolak", "status": "rejected"}

@app.put("/api/students/{student_id}")
async def update_student(
    student_id: str,
    student_data: StudentUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update student information"""
    student = await db.students.find_one({"_id": ObjectId(student_id)})
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    
    # Check access - admin/superadmin can edit anyone, parent can only edit own children
    if current_user["role"] == "parent":
        if str(student["parent_id"]) != str(current_user["_id"]):
            raise HTTPException(status_code=403, detail="Akses ditolak")
    elif current_user["role"] not in ["superadmin", "admin", "bendahari", "guru_kelas"]:
        raise HTTPException(status_code=403, detail="Tiada kebenaran untuk edit pelajar")
    
    # Kelas mesti dari Senarai Kelas (database ketetapan)
    if student_data.class_name is not None:
        valid_kelas = await _get_valid_kelas_list()
        if student_data.class_name not in valid_kelas:
            raise HTTPException(
                status_code=400,
                detail=f"Kelas mesti salah satu dari Senarai Kelas: {', '.join(valid_kelas)}. Sila kemaskini di Tetapan > Data Pelajar."
            )
    
    # Build update dict
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if student_data.full_name is not None:
        update_data["full_name"] = student_data.full_name
    if student_data.ic_number is not None:
        update_data["ic_number"] = student_data.ic_number
    if student_data.year is not None:
        update_data["year"] = student_data.year
    if student_data.form is not None:
        update_data["form"] = student_data.form
    if student_data.class_name is not None:
        update_data["class_name"] = student_data.class_name
    if student_data.block_name is not None:
        update_data["block_name"] = student_data.block_name
    if student_data.room_number is not None:
        update_data["room_number"] = student_data.room_number
    if student_data.state is not None:
        update_data["state"] = student_data.state
    if student_data.religion is not None:
        update_data["religion"] = student_data.religion
    if student_data.bangsa is not None:
        update_data["bangsa"] = student_data.bangsa
    if student_data.gender is not None:
        update_data["gender"] = student_data.gender
    if student_data.phone is not None:
        update_data["phone"] = student_data.phone
    if student_data.email is not None:
        update_data["email"] = student_data.email
    if student_data.address is not None:
        update_data["address"] = student_data.address
    if student_data.postcode is not None:
        update_data["postcode"] = student_data.postcode
    if student_data.city is not None:
        update_data["city"] = student_data.city
    
    await db.students.update_one({"_id": ObjectId(student_id)}, {"$set": update_data})
    
    # Also update user record if exists
    if student.get("user_id"):
        user_update = {}
        if student_data.full_name is not None:
            user_update["full_name"] = student_data.full_name
        if student_data.religion is not None:
            user_update["religion"] = student_data.religion
        if student_data.bangsa is not None:
            user_update["bangsa"] = student_data.bangsa
        if student_data.phone is not None:
            user_update["phone"] = student_data.phone
        if user_update:
            await db.users.update_one({"_id": student["user_id"]}, {"$set": user_update})
    
    await log_audit(current_user, "UPDATE_STUDENT", "students", f"Kemaskini pelajar: {student.get('full_name', 'Unknown')}")
    
    updated = await db.students.find_one({"_id": ObjectId(student_id)})
    return serialize_student(updated)

@app.delete("/api/students/{student_id}")
async def delete_student(student_id: str, current_user: dict = Depends(get_current_user)):
    """Delete student"""
    student = await db.students.find_one({"_id": ObjectId(student_id)})
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    
    if current_user["role"] == "parent" and str(student["parent_id"]) != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    await db.fees.delete_many({"student_id": ObjectId(student_id)})
    await db.students.delete_one({"_id": ObjectId(student_id)})
    
    await log_audit(current_user, "DELETE_STUDENT", "students", f"Padam pelajar: {student['full_name']}")
    
    return {"message": "Pelajar dipadam"}

# ============ DATA SYNCHRONIZATION ROUTES ============

@app.get("/api/admin/sync/status")
async def get_sync_status(
    current_user: dict = Depends(require_roles("superadmin", "admin"))
):
    """Get data synchronization status between users and students"""
    # Get counts
    total_users = await db.users.count_documents({})
    pelajar_users = await db.users.count_documents({"role": "pelajar"})
    parent_users = await db.users.count_documents({"role": "parent"})
    total_students = await db.students.count_documents({})
    
    # Find issues
    students_without_user = await db.students.count_documents({"user_id": {"$exists": False}})
    students_without_religion = await db.students.count_documents({"religion": {"$exists": False}})
    pelajar_without_religion = await db.users.count_documents({"role": "pelajar", "religion": {"$exists": False}})
    orphan_students = await db.students.count_documents({"parent_id": {"$exists": False}})
    
    # Get students by form
    pipeline = [
        {"$match": {"status": "approved"}},
        {"$group": {"_id": "$form", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}}
    ]
    by_form = await db.students.aggregate(pipeline).to_list(10)
    students_by_form = {str(item["_id"]): item["count"] for item in by_form}
    
    return {
        "summary": {
            "total_users": total_users,
            "pelajar_users": pelajar_users,
            "parent_users": parent_users,
            "total_students": total_students
        },
        "issues": {
            "students_without_user_account": students_without_user,
            "students_without_religion": students_without_religion,
            "pelajar_users_without_religion": pelajar_without_religion,
            "orphan_students": orphan_students
        },
        "students_by_form": students_by_form,
        "sync_needed": (students_without_user > 0 or students_without_religion > 0 or pelajar_without_religion > 0)
    }

@app.post("/api/admin/sync/cleanup-orphan-users")
async def cleanup_orphan_pelajar_users(
    current_user: dict = Depends(require_roles("superadmin"))
):
    """Remove pelajar users that don't have a matching student record"""
    results = {
        "deleted_count": 0,
        "deleted_users": [],
        "errors": []
    }
    
    # Get all pelajar users
    pelajar_users = await db.users.find({"role": "pelajar"}).to_list(1000)
    
    # Get all student matric numbers
    students = await db.students.find({}).to_list(1000)
    student_matrics = set(s.get("matric_number") for s in students if s.get("matric_number"))
    student_ics = set(s.get("ic_number") for s in students if s.get("ic_number"))
    
    for user in pelajar_users:
        user_matric = user.get("matric_number", "")
        user_ic = user.get("ic_number", "")
        
        # Check if user has matching student record
        has_matching_student = (
            (user_matric and user_matric in student_matrics) or
            (user_ic and user_ic in student_ics)
        )
        
        if not has_matching_student:
            try:
                await db.users.delete_one({"_id": user["_id"]})
                results["deleted_count"] += 1
                results["deleted_users"].append({
                    "name": user.get("full_name"),
                    "matric": user_matric,
                    "email": user.get("email")
                })
            except Exception as e:
                results["errors"].append(f"Error deleting {user.get('full_name')}: {str(e)}")
    
    await log_audit(
        current_user, "CLEANUP_ORPHAN_USERS", "admin",
        f"Membersihkan {results['deleted_count']} akaun pelajar tanpa rekod student"
    )
    
    return {
        "message": f"Berjaya memadam {results['deleted_count']} akaun pelajar yang tidak mempunyai rekod student",
        "results": results
    }

@app.post("/api/admin/sync/students")
async def sync_students_data(
    current_user: dict = Depends(require_roles("superadmin", "admin"))
):
    """Synchronize students data - create user accounts and set religion"""
    results = {
        "users_created": 0,
        "religion_updated": 0,
        "errors": []
    }
    
    # Get all students without user_id
    students_without_user = await db.students.find({"user_id": {"$exists": False}}).to_list(1000)
    
    for student in students_without_user:
        try:
            # Check if user with matric already exists
            existing_user = await db.users.find_one({"matric_number": student.get("matric_number")})
            
            if existing_user:
                # Link existing user to student
                await db.students.update_one(
                    {"_id": student["_id"]},
                    {"$set": {"user_id": existing_user["_id"]}}
                )
            else:
                # Create new user account for student
                email = f"{student.get('matric_number', '').lower()}@pelajar.mrsm.edu.my"
                password_hash = pwd_context.hash("student123")
                
                user_doc = {
                    "email": email,
                    "password": password_hash,
                    "full_name": student.get("full_name", ""),
                    "phone": student.get("phone", ""),
                    "ic_number": student.get("ic_number", ""),
                    "matric_number": student.get("matric_number", ""),
                    "role": "pelajar",
                    "religion": student.get("religion", "Islam"),
                    "is_active": True,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                
                user_result = await db.users.insert_one(user_doc)
                
                # Update student with user_id
                await db.students.update_one(
                    {"_id": student["_id"]},
                    {"$set": {"user_id": user_result.inserted_id}}
                )
                results["users_created"] += 1
                
        except Exception as e:
            results["errors"].append(f"Error for {student.get('matric_number')}: {str(e)}")
    
    # Update religion for students without religion
    students_without_religion = await db.students.find({"religion": {"$exists": False}}).to_list(1000)
    for student in students_without_religion:
        await db.students.update_one(
            {"_id": student["_id"]},
            {"$set": {"religion": "Islam"}}  # Default to Islam
        )
        results["religion_updated"] += 1
    
    # Update religion for pelajar users without religion
    pelajar_without_religion = await db.users.find({"role": "pelajar", "religion": {"$exists": False}}).to_list(1000)
    for user in pelajar_without_religion:
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"religion": "Islam"}}  # Default to Islam
        )
        results["religion_updated"] += 1
    
    await log_audit(
        current_user, "SYNC_DATA", "admin",
        f"Sinkronisasi data: {results['users_created']} akaun dicipta, {results['religion_updated']} agama dikemaskini"
    )
    
    return {
        "message": "Sinkronisasi berjaya",
        "results": results
    }

@app.post("/api/admin/sync/full")
async def full_sync_data(
    current_user: dict = Depends(require_roles("superadmin"))
):
    """
    Complete data synchronization - performs both cleanup and sync operations.
    1. Removes orphan pelajar users without matching student records
    2. Creates user accounts for students without user_id
    3. Updates missing religion fields
    """
    results = {
        "cleanup": {
            "orphan_users_deleted": 0,
            "deleted_details": []
        },
        "sync": {
            "users_created": 0,
            "religion_updated": 0
        },
        "errors": [],
        "before": {},
        "after": {}
    }
    
    # Get counts before sync
    results["before"] = {
        "total_users": await db.users.count_documents({}),
        "pelajar_users": await db.users.count_documents({"role": "pelajar"}),
        "total_students": await db.students.count_documents({})
    }
    
    # Step 1: Cleanup orphan pelajar users
    pelajar_users = await db.users.find({"role": "pelajar"}).to_list(1000)
    students = await db.students.find({}).to_list(1000)
    student_matrics = set(s.get("matric_number") for s in students if s.get("matric_number"))
    student_ics = set(s.get("ic_number") for s in students if s.get("ic_number"))
    
    for user in pelajar_users:
        user_matric = user.get("matric_number", "")
        user_ic = user.get("ic_number", "")
        
        has_matching_student = (
            (user_matric and user_matric in student_matrics) or
            (user_ic and user_ic in student_ics)
        )
        
        if not has_matching_student:
            try:
                await db.users.delete_one({"_id": user["_id"]})
                results["cleanup"]["orphan_users_deleted"] += 1
                results["cleanup"]["deleted_details"].append(user.get("full_name", "Unknown"))
            except Exception as e:
                results["errors"].append(f"Cleanup error: {str(e)}")
    
    # Step 2: Create user accounts for students without user_id
    students_without_user = await db.students.find({"user_id": {"$exists": False}}).to_list(1000)
    
    for student in students_without_user:
        try:
            existing_user = await db.users.find_one({"matric_number": student.get("matric_number")})
            
            if existing_user:
                await db.students.update_one(
                    {"_id": student["_id"]},
                    {"$set": {"user_id": existing_user["_id"]}}
                )
            else:
                email = f"{student.get('matric_number', '').lower()}@pelajar.mrsm.edu.my"
                password_hash = pwd_context.hash("student123")
                
                user_doc = {
                    "email": email,
                    "password": password_hash,
                    "full_name": student.get("full_name", ""),
                    "phone": student.get("phone", ""),
                    "ic_number": student.get("ic_number", ""),
                    "matric_number": student.get("matric_number", ""),
                    "role": "pelajar",
                    "religion": student.get("religion", "Islam"),
                    "is_active": True,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                
                user_result = await db.users.insert_one(user_doc)
                await db.students.update_one(
                    {"_id": student["_id"]},
                    {"$set": {"user_id": user_result.inserted_id}}
                )
                results["sync"]["users_created"] += 1
                
        except Exception as e:
            results["errors"].append(f"Sync error for {student.get('matric_number')}: {str(e)}")
    
    # Step 3: Update missing religion fields
    students_without_religion = await db.students.find({"religion": {"$exists": False}}).to_list(1000)
    for student in students_without_religion:
        await db.students.update_one(
            {"_id": student["_id"]},
            {"$set": {"religion": "Islam"}}
        )
        results["sync"]["religion_updated"] += 1
    
    pelajar_without_religion = await db.users.find({"role": "pelajar", "religion": {"$exists": False}}).to_list(1000)
    for user in pelajar_without_religion:
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"religion": "Islam"}}
        )
        results["sync"]["religion_updated"] += 1
    
    # Get counts after sync
    results["after"] = {
        "total_users": await db.users.count_documents({}),
        "pelajar_users": await db.users.count_documents({"role": "pelajar"}),
        "total_students": await db.students.count_documents({})
    }
    
    await log_audit(
        current_user, "FULL_SYNC", "admin",
        f"Sinkronisasi penuh: {results['cleanup']['orphan_users_deleted']} dipadam, {results['sync']['users_created']} dicipta"
    )
    
    return {
        "success": True,
        "message": "Sinkronisasi data berjaya",
        "results": results
    }


@app.post("/api/admin/standardize-classes")
async def standardize_student_classes(
    current_user: dict = Depends(require_roles("superadmin", "admin"))
):
    """
    Kemaskini kelas pelajar yang tidak standard kepada kelas standard (A-F).
    Kelas tidak standard akan dipetakan mengikut logik berikut:
    - Gemilang, Cemerlang, Hebat -> A
    - Dinamik, Bestari -> B
    - Lain-lain -> Kelas sedia ada atau A
    
    Juga akan membuang field nama_kelas lama dan menggunakan field 'class' sahaja.
    """
    # Get system config for valid classes
    system_config = await db.settings.find_one({"type": "system_config"})
    valid_classes = system_config.get("kelas", ["A", "B", "C", "D", "E", "F"]) if system_config else ["A", "B", "C", "D", "E", "F"]
    
    # Mapping non-standard classes to standard
    class_mapping = {
        "Gemilang": "A",
        "Cemerlang": "A", 
        "Hebat": "A",
        "Dinamik": "B",
        "Bestari": "B",
        "Bijaksana": "C",
        "Cerdas": "C",
        "Dedikasi": "D",
        "Excellent": "E",
        "Fokus": "F",
        # Add more mappings
        "gemilang": "A",
        "cemerlang": "A",
        "hebat": "A",
        "dinamik": "B",
        "bestari": "B",
    }
    
    results = {
        "students_updated": 0,
        "claim_codes_updated": 0,
        "details": [],
        "valid_classes": valid_classes
    }
    
    # ========== UPDATE STUDENTS ==========
    all_students = await db.students.find({}).to_list(5000)
    
    for student in all_students:
        current_class = student.get("class_name") or student.get("nama_kelas") or student.get("class") or ""
        
        # Determine new class
        if current_class in valid_classes:
            new_class = current_class
        else:
            new_class = class_mapping.get(current_class, class_mapping.get(current_class.title() if current_class else "", "A"))
        
        # Update student with standardized fields
        update_data = {
            "class": new_class,
            "class_name": new_class
        }
        
        # Remove old nama_kelas field
        unset_data = {"nama_kelas": ""}
        
        await db.students.update_one(
            {"_id": student["_id"]},
            {
                "$set": update_data,
                "$unset": unset_data
            }
        )
        
        if current_class != new_class:
            results["details"].append({
                "type": "student",
                "name": student.get("full_name", ""),
                "matric_number": student.get("matric_number", ""),
                "old_class": current_class,
                "new_class": new_class
            })
        results["students_updated"] += 1
    
    # ========== UPDATE CLAIM CODES ==========
    all_claim_codes = await db.claim_codes.find({}).to_list(5000)
    
    for cc in all_claim_codes:
        current_class = cc.get("nama_kelas") or cc.get("kelas") or ""
        
        # Determine new class
        if current_class in valid_classes:
            new_class = current_class
        else:
            new_class = class_mapping.get(current_class, class_mapping.get(current_class.title() if current_class else "", "A"))
        
        # Update claim code with standardized fields
        update_data = {
            "kelas": new_class
        }
        
        # Remove old nama_kelas field
        unset_data = {"nama_kelas": ""}
        
        await db.claim_codes.update_one(
            {"_id": cc["_id"]},
            {
                "$set": update_data,
                "$unset": unset_data
            }
        )
        
        if current_class != new_class:
            results["details"].append({
                "type": "claim_code",
                "claim_code": cc.get("claim_code", ""),
                "student_name": cc.get("student_name", ""),
                "old_class": current_class,
                "new_class": new_class
            })
        results["claim_codes_updated"] += 1
    
    await log_audit(
        current_user, "STANDARDIZE_CLASSES", "admin",
        f"Kemaskini {results['students_updated']} pelajar dan {results['claim_codes_updated']} claim codes kepada format kelas A-F"
    )
    
    return {
        "success": True,
        "message": f"Berjaya mengemas kini {results['students_updated']} pelajar dan {results['claim_codes_updated']} claim codes kepada format kelas A-F",
        "results": results
    }


@app.get("/api/admin/class-summary")
async def get_class_summary(
    tahun: Optional[int] = Query(None, description="Tahun akademik"),
    current_user: dict = Depends(require_roles("superadmin", "admin"))
):
    """
    Mendapatkan ringkasan kelas dan guru yang ditugaskan mengikut tingkatan
    Struktur: 5 tingkatan × 6 kelas = 30 kelas
    """
    current_year = tahun or datetime.now().year
    
    # Get system config for valid classes and tingkatan
    system_config = await db.settings.find_one({"type": "system_config"})
    valid_classes = system_config.get("kelas", ["A", "B", "C", "D", "E", "F"]) if system_config else ["A", "B", "C", "D", "E", "F"]
    valid_tingkatan = system_config.get("tingkatan", [1, 2, 3, 4, 5]) if system_config else [1, 2, 3, 4, 5]
    
    # Get all guru_kelas users
    guru_kelas_list = await db.users.find({"role": "guru_kelas"}).to_list(200)
    
    # Build class matrix (tingkatan × kelas)
    class_matrix = []
    total_students = 0
    total_assigned = 0
    
    for tingkatan in valid_tingkatan:
        tingkatan_data = {
            "tingkatan": tingkatan,
            "classes": []
        }
        
        for kelas in valid_classes:
            # Count students in this tingkatan + kelas combination
            student_count = await db.students.count_documents({
                "form": tingkatan,
                "class_name": kelas,
                "status": "approved"
            })
            total_students += student_count
            
            # Find assigned guru for this tingkatan + kelas
            assigned_guru = next(
                (g for g in guru_kelas_list 
                 if g.get("assigned_form") == tingkatan and g.get("assigned_class") == kelas),
                None
            )
            
            if assigned_guru:
                total_assigned += 1
            
            tingkatan_data["classes"].append({
                "class_name": kelas,
                "tingkatan": tingkatan,
                "student_count": student_count,
                "has_guru": assigned_guru is not None,
                "guru": {
                    "id": str(assigned_guru["_id"]),
                    "name": assigned_guru.get("full_name"),
                    "email": assigned_guru.get("email"),
                    "phone": assigned_guru.get("phone")
                } if assigned_guru else None
            })
        
        class_matrix.append(tingkatan_data)
    
    # Get non-standard form values
    pipeline = [
        {"$match": {"form": {"$nin": valid_tingkatan}}},
        {"$group": {"_id": "$form", "count": {"$sum": 1}}}
    ]
    non_standard_forms = await db.students.aggregate(pipeline).to_list(20)
    
    # Get list of unassigned classes
    unassigned = []
    for tingkatan in valid_tingkatan:
        for kelas in valid_classes:
            has_guru = any(
                g.get("assigned_form") == tingkatan and g.get("assigned_class") == kelas 
                for g in guru_kelas_list
            )
            if not has_guru:
                unassigned.append(f"T{tingkatan} {kelas}")
    
    return {
        "tahun": current_year,
        "valid_classes": valid_classes,
        "valid_tingkatan": valid_tingkatan,
        "class_matrix": class_matrix,
        "statistics": {
            "total_classes": len(valid_classes) * len(valid_tingkatan),
            "total_students": total_students,
            "total_guru_kelas": len(guru_kelas_list),
            "assigned_classes": total_assigned,
            "unassigned_classes": len(unassigned)
        },
        "non_standard_forms": [{"form": ns["_id"], "count": ns["count"]} for ns in non_standard_forms if ns["_id"]],
        "unassigned": unassigned,
        "guru_list": [
            {
                "id": str(g["_id"]),
                "name": g.get("full_name"),
                "email": g.get("email"),
                "assigned_form": g.get("assigned_form"),
                "assigned_class": g.get("assigned_class"),
                "status": g.get("status", "active")
            }
            for g in guru_kelas_list
        ]
    }


@app.post("/api/admin/guru-kelas/assign")
async def assign_guru_to_class(
    guru_id: str,
    tingkatan: int,
    kelas: str,
    current_user: dict = Depends(require_roles("superadmin", "admin"))
):
    """
    Tugaskan guru kelas ke tingkatan dan kelas tertentu
    """
    # Validate guru exists
    guru = await db.users.find_one({"_id": ObjectId(guru_id), "role": "guru_kelas"})
    if not guru:
        raise HTTPException(status_code=404, detail="Guru tidak dijumpai")
    
    # Check if class is already assigned to another guru
    existing = await db.users.find_one({
        "role": "guru_kelas",
        "assigned_form": tingkatan,
        "assigned_class": kelas,
        "_id": {"$ne": ObjectId(guru_id)}
    })
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"Kelas T{tingkatan} {kelas} sudah ditugaskan kepada {existing.get('full_name')}"
        )
    
    # Update guru assignment
    await db.users.update_one(
        {"_id": ObjectId(guru_id)},
        {"$set": {
            "assigned_form": tingkatan,
            "assigned_class": kelas,
            "assignment_updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    await log_audit(
        current_user, "ASSIGN_GURU_KELAS", "admin",
        f"Tugaskan {guru.get('full_name')} ke Tingkatan {tingkatan} Kelas {kelas}"
    )
    
    return {
        "success": True,
        "message": f"Berjaya menugaskan guru ke Tingkatan {tingkatan} Kelas {kelas}",
        "guru_id": guru_id,
        "tingkatan": tingkatan,
        "kelas": kelas
    }


@app.put("/api/guru/profile/class-assignment")
async def update_guru_class_assignment(
    tingkatan: int,
    kelas: str,
    current_user: dict = Depends(require_roles("guru_kelas", "guru_homeroom"))
):
    """
    Guru kemas kini tugasan tingkatan dan kelas sendiri
    """
    guru_id = current_user.get("_id")
    
    # Get system config
    system_config = await db.settings.find_one({"type": "system_config"})
    valid_classes = system_config.get("kelas", ["A", "B", "C", "D", "E", "F"]) if system_config else ["A", "B", "C", "D", "E", "F"]
    valid_tingkatan = system_config.get("tingkatan", [1, 2, 3, 4, 5]) if system_config else [1, 2, 3, 4, 5]
    
    # Validate
    if tingkatan not in valid_tingkatan:
        raise HTTPException(status_code=400, detail=f"Tingkatan tidak sah. Pilih dari: {valid_tingkatan}")
    if kelas not in valid_classes:
        raise HTTPException(status_code=400, detail=f"Kelas tidak sah. Pilih dari: {valid_classes}")
    
    # Check if class is already assigned to another guru
    existing = await db.users.find_one({
        "role": "guru_kelas",
        "assigned_form": tingkatan,
        "assigned_class": kelas,
        "_id": {"$ne": guru_id}
    })
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"Kelas T{tingkatan} {kelas} sudah ditugaskan kepada guru lain"
        )
    
    # Update assignment
    await db.users.update_one(
        {"_id": guru_id},
        {"$set": {
            "assigned_form": tingkatan,
            "assigned_class": kelas,
            "assignment_updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {
        "success": True,
        "message": f"Berjaya kemas kini kepada Tingkatan {tingkatan} Kelas {kelas}",
        "tingkatan": tingkatan,
        "kelas": kelas
    }
    non_standard = await db.students.aggregate(pipeline).to_list(20)
    
    return {
        "valid_classes": valid_classes,
        "class_summary": class_summary,
        "non_standard_classes": [{"class_name": ns["_id"], "count": ns["count"]} for ns in non_standard if ns["_id"]],
        "total_guru_kelas": len(guru_kelas_list),
        "unassigned_classes": [cs["class_name"] for cs in class_summary if not cs["has_guru"]]
    }


@app.get("/api/admin/sync/auto-settings")
async def get_auto_sync_settings(
    current_user: dict = Depends(require_roles("superadmin", "admin"))
):
    """Get auto-sync settings and status"""
    settings = await db.settings.find_one({"type": "auto_sync"})
    
    # Get recent sync logs
    recent_logs = await db.scheduler_logs.find(
        {"type": "auto_sync"}
    ).sort("run_at", -1).limit(5).to_list(5)
    
    for log in recent_logs:
        log["_id"] = str(log["_id"])
    
    return {
        "enabled": settings.get("enabled", False) if settings else False,
        "interval_hours": settings.get("interval_hours", 24) if settings else 24,
        "last_run": settings.get("last_run") if settings else None,
        "last_results": settings.get("last_results") if settings else None,
        "recent_logs": recent_logs
    }


@app.put("/api/admin/sync/auto-settings")
async def update_auto_sync_settings(
    enabled: bool = Query(..., description="Enable or disable auto-sync"),
    interval_hours: int = Query(24, ge=1, le=168, description="Interval in hours (1-168)"),
    current_user: dict = Depends(require_roles("superadmin"))
):
    """Update auto-sync settings"""
    global scheduler
    
    now = datetime.now(timezone.utc)
    
    await db.settings.update_one(
        {"type": "auto_sync"},
        {
            "$set": {
                "enabled": enabled,
                "interval_hours": interval_hours,
                "updated_at": now.isoformat(),
                "updated_by": current_user.get("full_name")
            }
        },
        upsert=True
    )
    
    # Update scheduler interval if changed
    try:
        scheduler.remove_job("auto_sync_data")
        scheduler.add_job(
            run_auto_sync_job,
            trigger=IntervalTrigger(hours=interval_hours),
            id="auto_sync_data",
            name="Auto-sync students and users data",
            replace_existing=True
        )
        scheduler_logger.info(f"Auto-sync job rescheduled: interval={interval_hours}h, enabled={enabled}")
    except Exception as e:
        scheduler_logger.error(f"Failed to reschedule auto-sync job: {e}")
    
    await log_audit(
        current_user, "UPDATE_AUTO_SYNC", "settings",
        f"Auto-sync dikemaskini: enabled={enabled}, interval={interval_hours}jam"
    )
    
    return {
        "success": True,
        "message": f"Tetapan auto-sync dikemaskini. {'Aktif' if enabled else 'Tidak aktif'}, setiap {interval_hours} jam",
        "settings": {
            "enabled": enabled,
            "interval_hours": interval_hours
        }
    }


@app.post("/api/admin/sync/trigger-now")
async def trigger_auto_sync_now(
    current_user: dict = Depends(require_roles("superadmin"))
):
    """Manually trigger auto-sync job immediately"""
    try:
        await run_auto_sync_job()
        
        # Get updated settings with results
        settings = await db.settings.find_one({"type": "auto_sync"})
        
        await log_audit(
            current_user, "TRIGGER_AUTO_SYNC", "admin",
            "Auto-sync dicetuskan secara manual"
        )
        
        return {
            "success": True,
            "message": "Auto-sync berjaya dijalankan",
            "results": settings.get("last_results") if settings else None
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Gagal menjalankan auto-sync: {str(e)}"
        }


@app.get("/api/admin/religions")
async def get_religion_options():
    """Get list of available religions"""
    return {
        "options": [
            "Islam",
            "Buddha",
            "Hindu",
            "Kristian",
            "Sikh",
            "Taoisme",
            "Konfusianisme",
            "Lain-lain"
        ]
    }

@app.get("/api/admin/bangsa")
async def get_bangsa_options():
    """Get list of available races (bangsa)"""
    return {
        "options": [
            "Melayu",
            "Cina",
            "India",
            "Bumiputera Sabah",
            "Bumiputera Sarawak",
            "Lain-lain"
        ]
    }

@app.get("/api/admin/students/report")
async def get_students_report(
    current_user: dict = Depends(require_roles("superadmin", "admin", "bendahari", "juruaudit"))
):
    """Get comprehensive student report by religion and bangsa"""
    
    # Total students
    total = await db.students.count_documents({"status": "approved"})
    
    # By religion
    muslim = await db.students.count_documents({"status": "approved", "religion": "Islam"})
    non_muslim = total - muslim
    
    # By specific religion
    religion_pipeline = [
        {"$match": {"status": "approved"}},
        {"$group": {"_id": "$religion", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    by_religion = await db.students.aggregate(religion_pipeline).to_list(20)
    religion_breakdown = {item["_id"]: item["count"] for item in by_religion}
    
    # By bangsa
    bangsa_pipeline = [
        {"$match": {"status": "approved"}},
        {"$group": {"_id": "$bangsa", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    by_bangsa = await db.students.aggregate(bangsa_pipeline).to_list(20)
    bangsa_breakdown = {item["_id"] or "Tidak Dinyatakan": item["count"] for item in by_bangsa}
    
    # By form (tingkatan)
    form_pipeline = [
        {"$match": {"status": "approved"}},
        {"$group": {"_id": "$form", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}}
    ]
    by_form = await db.students.aggregate(form_pipeline).to_list(10)
    form_breakdown = {f"Tingkatan {item['_id']}": item["count"] for item in by_form}
    
    # Cross-tabulation: Bangsa x Religion
    cross_pipeline = [
        {"$match": {"status": "approved"}},
        {"$group": {
            "_id": {"bangsa": "$bangsa", "religion": "$religion"},
            "count": {"$sum": 1}
        }},
        {"$sort": {"count": -1}}
    ]
    cross_data = await db.students.aggregate(cross_pipeline).to_list(50)
    cross_breakdown = []
    for item in cross_data:
        cross_breakdown.append({
            "bangsa": item["_id"].get("bangsa") or "Tidak Dinyatakan",
            "religion": item["_id"].get("religion") or "Tidak Dinyatakan",
            "count": item["count"]
        })
    
    return {
        "summary": {
            "total_students": total,
            "muslim": muslim,
            "non_muslim": non_muslim,
            "muslim_percentage": round(muslim / total * 100, 1) if total > 0 else 0,
            "non_muslim_percentage": round(non_muslim / total * 100, 1) if total > 0 else 0
        },
        "by_religion": religion_breakdown,
        "by_bangsa": bangsa_breakdown,
        "by_form": form_breakdown,
        "cross_breakdown": cross_breakdown
    }

@app.get("/api/admin/students/with-parents")
async def get_students_with_parents(
    current_user: dict = Depends(require_roles("superadmin", "admin", "bendahari")),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100)
):
    """Get students list with their parent information"""
    skip = (page - 1) * limit
    
    pipeline = [
        {"$match": {"status": "approved"}},
        {"$lookup": {
            "from": "users",
            "localField": "parent_id",
            "foreignField": "_id",
            "as": "parent"
        }},
        {"$unwind": {"path": "$parent", "preserveNullAndEmptyArrays": True}},
        {"$sort": {"form": 1, "full_name": 1}},
        {"$skip": skip},
        {"$limit": limit},
        {"$project": {
            "_id": 0,
            "student_id": {"$toString": "$_id"},
            "student_name": "$full_name",
            "matric_number": 1,
            "form": 1,
            "class_name": 1,
            "religion": 1,
            "bangsa": 1,
            "parent_id": {"$toString": "$parent_id"},
            "parent_name": "$parent.full_name",
            "parent_email": "$parent.email",
            "parent_phone": "$parent.phone"
        }}
    ]
    
    students = await db.students.aggregate(pipeline).to_list(limit)
    total = await db.students.count_documents({"status": "approved"})
    
    return {
        "students": students,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": (total + limit - 1) // limit
        }
    }

# ============ FEE PACKAGE ROUTES (DEPRECATED - Use /api/yuran/set-yuran) ============

@app.post("/api/fee-packages")
async def create_fee_package(
    current_user: dict = Depends(require_roles("superadmin", "bendahari"))
):
    """DEPRECATED - Use /api/yuran/set-yuran instead"""
    raise HTTPException(
        status_code=410,
        detail="Endpoint ini sudah ditamatkan. Sila gunakan /api/yuran/set-yuran untuk mencipta Set Yuran baru."
    )

@app.get("/api/fee-packages")
async def get_fee_packages(
    year: Optional[int] = None,
    form: Optional[int] = None,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bendahari", "sub_bendahari"))
):
    """DEPRECATED - Use /api/yuran/set-yuran instead. Returns empty for backward compatibility."""
    return []

@app.get("/api/fee-packages/{package_id}")
async def get_fee_package(
    package_id: str,
    current_user: dict = Depends(get_current_user)
):
    """DEPRECATED - Use /api/yuran/set-yuran/{set_id} instead"""
    raise HTTPException(
        status_code=410,
        detail="Endpoint ini sudah ditamatkan. Sila gunakan /api/yuran/set-yuran/{set_id}"
    )

@app.put("/api/fee-packages/{package_id}")
async def update_fee_package(
    package_id: str,
    current_user: dict = Depends(require_roles("superadmin", "bendahari"))
):
    """DEPRECATED - Use /api/yuran/set-yuran/{set_id} instead"""
    raise HTTPException(
        status_code=410,
        detail="Endpoint ini sudah ditamatkan. Sila gunakan /api/yuran/set-yuran/{set_id}"
    )

@app.delete("/api/fee-packages/{package_id}")
async def delete_fee_package(
    package_id: str,
    current_user: dict = Depends(require_roles("superadmin"))
):
    """DEPRECATED - Use /api/yuran/set-yuran/{set_id} instead"""
    raise HTTPException(
        status_code=410,
        detail="Endpoint ini sudah ditamatkan. Sila gunakan /api/yuran/set-yuran/{set_id}"
    )

@app.post("/api/fee-packages/{package_id}/assign-student")
async def assign_package_to_student(
    package_id: str,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bendahari"))
):
    """DEPRECATED - Use /api/yuran/assign instead"""
    raise HTTPException(
        status_code=410,
        detail="Endpoint ini sudah ditamatkan. Sila gunakan /api/yuran/assign untuk assign yuran kepada pelajar."
    )

async def _get_parent_children_fee_summary(parent_id) -> List[Dict[str, Any]]:
    """Return list of {student_name, total_fees, paid_amount, outstanding} for AI chat / internal use."""
    children = await db.students.find({
        "parent_id": ObjectId(parent_id) if isinstance(parent_id, str) else parent_id,
        "status": "approved"
    }).to_list(100)
    result = []
    for child in children:
        yuran_records = await db.student_yuran.find({"student_id": child["_id"]}).to_list(100)
        total_fees = sum(r.get("total_amount", 0) for r in yuran_records)
        paid_amount = sum(r.get("paid_amount", 0) for r in yuran_records)
        result.append({
            "student_name": child.get("full_name", ""),
            "total_fees": total_fees,
            "paid_amount": paid_amount,
            "outstanding": total_fees - paid_amount,
        })
    return result


@app.get("/api/parent/children-fees")
async def get_parent_children_fees(current_user: dict = Depends(require_roles("parent"))):
    """Get fee summary for all parent's children - uses new student_yuran system"""
    # Get all children
    children = await db.students.find({
        "parent_id": ObjectId(current_user["_id"]),
        "status": "approved"
    }).to_list(100)
    
    result = []
    
    for child in children:
        # Get all yuran from new student_yuran collection
        yuran_records = await db.student_yuran.find({"student_id": child["_id"]}).to_list(100)
        
        total_fees = sum(r.get("total_amount", 0) for r in yuran_records)
        paid_amount = sum(r.get("paid_amount", 0) for r in yuran_records)
        progress = (paid_amount / total_fees * 100) if total_fees > 0 else 0
        
        # Build categories from yuran records
        categories = []
        for yuran in yuran_records:
            categories.append({
                "id": str(yuran["_id"]),
                "name": yuran.get("set_yuran_nama", "Yuran"),
                "amount": yuran.get("total_amount", 0),
                "paid": yuran.get("paid_amount", 0),
                "status": yuran.get("status", "pending"),
                "sub_items_count": len(yuran.get("items", []))
            })
        
        result.append(ChildFeeCard(
            student_id=str(child["_id"]),
            student_name=child["full_name"],
            matric_number=child.get("matric_number", ""),
            form=child["form"],
            class_name=child.get("class_name", ""),
            total_fees=total_fees,
            paid_amount=paid_amount,
            progress_percent=round(progress, 1),
            categories=categories
        ))
    
    return result

# ============ FEE REMINDER CRON JOB ============

@app.post("/api/cron/fee-reminders")
async def send_fee_reminders(
    cron_key: Optional[str] = Query(None, description="Cron security key"),
):
    """
    Cron job to send fee reminders to parents with outstanding fees.
    Can be called via scheduler or manually by superadmin.
    Uses student_yuran collection and sends both in-app notifications and emails.
    """
    # Simple security - in production, use proper API key validation
    expected_key = os.environ.get("CRON_SECRET_KEY", "mrsmku-cron-2026")
    if cron_key != expected_key:
        raise HTTPException(status_code=401, detail="Invalid cron key")
    
    try:
        from services.email_service import send_fee_reminder, RESEND_ENABLED
        
        # Find all parents with outstanding fees from student_yuran
        pipeline = [
            {"$match": {"status": {"$ne": "paid"}}},
            {"$group": {
                "_id": "$parent_id",
                "total_outstanding": {
                    "$sum": {"$subtract": ["$total_amount", "$paid_amount"]}
                },
                "records": {"$push": {
                    "student_name": "$student_name",
                    "student_id": "$student_id",
                    "tingkatan": "$tingkatan",
                    "tahun": "$tahun",
                    "total_amount": "$total_amount",
                    "paid_amount": "$paid_amount"
                }}
            }},
            {"$match": {"total_outstanding": {"$gt": 0}}}
        ]
        
        parents_outstanding = await db.student_yuran.aggregate(pipeline).to_list(1000)
        
        notifications_sent = 0
        emails_sent = 0
        
        for parent_data in parents_outstanding:
            parent_id = parent_data["_id"]
            if not parent_id:
                continue
            
            # Get parent info
            parent = await db.users.find_one({"_id": parent_id})
            if not parent:
                continue
            
            # Build children outstanding data for email
            children_outstanding = []
            records_by_student = {}
            
            for rec in parent_data["records"]:
                student_id = str(rec.get("student_id"))
                if student_id not in records_by_student:
                    records_by_student[student_id] = {
                        "name": rec.get("student_name"),
                        "outstanding": 0,
                        "outstanding_items": []
                    }
                
                outstanding = rec.get("total_amount", 0) - rec.get("paid_amount", 0)
                if outstanding > 0:
                    records_by_student[student_id]["outstanding"] += outstanding
                    records_by_student[student_id]["outstanding_items"].append({
                        "tingkatan": rec.get("tingkatan"),
                        "tahun": rec.get("tahun"),
                        "amount": outstanding
                    })
            
            # Get student details
            for student_id, data in records_by_student.items():
                try:
                    student = await db.students.find_one({"_id": ObjectId(student_id)})
                    if student:
                        data["form"] = student.get("form")
                        data["class_name"] = student.get("class_name", "")
                except Exception:
                    pass
                children_outstanding.append(data)
            
            # Create in-app notification
            student_list = ", ".join([f"{d['name']} (RM{d['outstanding']:,.2f})" for d in children_outstanding])
            await db.notifications.insert_one({
                "user_id": parent_id,
                "title": "Peringatan Tunggakan Yuran",
                "message": f"Anda mempunyai tunggakan yuran berjumlah RM {parent_data['total_outstanding']:,.2f}. Pelajar: {student_list}. Sila jelaskan secepat mungkin.",
                "type": "warning",
                "is_read": False,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            notifications_sent += 1
            
            # Send email if enabled
            if RESEND_ENABLED and parent.get("email"):
                try:
                    result = await send_fee_reminder(
                        parent_email=parent.get("email"),
                        parent_name=parent.get("full_name", "Ibu Bapa"),
                        children_outstanding=children_outstanding,
                        total_outstanding=parent_data["total_outstanding"]
                    )
                    if result.get("status") == "success":
                        emails_sent += 1
                except Exception:
                    pass
        
        return {
            "message": "Fee reminders sent successfully",
            "notifications_sent": notifications_sent,
            "emails_sent": emails_sent,
            "parents_notified": len(parents_outstanding),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error sending reminders: {str(e)}")

@app.get("/api/cron/status")
async def get_cron_status(current_user: dict = Depends(require_roles("superadmin"))):
    """Get status of cron jobs (superadmin only)"""
    return {
        "fee_reminders": {
            "endpoint": "/api/cron/fee-reminders",
            "schedule": "Every Monday at 9:00 AM",
            "description": "Sends fee reminder notifications to parents with outstanding fees"
        },
        "last_run": None,  # Would be stored in DB in production
        "next_run": "Monday 9:00 AM"
    }

# ============ AUDIT LOG ROUTES ============

@app.get("/api/audit-logs", response_model=List[AuditLogResponse])
async def get_audit_logs(
    module: Optional[str] = None,
    user_id: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    current_user: dict = Depends(require_roles("superadmin", "admin"))
):
    """Get audit logs"""
    query = {}
    if module:
        query["module"] = module
    if user_id:
        query["user_id"] = ObjectId(user_id)
    
    logs = await db.audit_logs.find(query).sort("created_at", -1).limit(limit).to_list(limit)
    return [serialize_audit(log) for log in logs]
# ============ GURU DASHBOARD FASA 3 ============

@app.get("/api/guru-dashboard/overview")
async def get_guru_dashboard_overview(
    tahun: Optional[int] = Query(None, description="Tahun akademik"),
    current_user: dict = Depends(require_roles("guru_kelas", "guru_homeroom", "superadmin", "admin"))
):
    """
    Dashboard overview untuk Guru Kelas - Statistik yuran pelajar dalam kelas
    Menggunakan assigned_form dan assigned_class
    """
    assigned_form = current_user.get("assigned_form")
    assigned_class = current_user.get("assigned_class", "")
    user_role = current_user.get("role", "")
    
    # SuperAdmin/Admin can see all classes
    if user_role in ["superadmin", "admin"]:
        assigned_form = None
        assigned_class = None
    
    # Build student query
    student_query = {"status": "approved"}
    if assigned_form:
        student_query["form"] = assigned_form
    if assigned_class:
        student_query["class_name"] = assigned_class
    
    # Get all students in class
    students = await db.students.find(student_query).to_list(500)
    student_ids = [s["_id"] for s in students]
    
    # Build class display name
    if assigned_form and assigned_class:
        class_display = f"Tingkatan {assigned_form} Kelas {assigned_class}"
    elif assigned_class:
        class_display = f"Kelas {assigned_class}"
    else:
        class_display = "Semua Kelas"
    
    if not students:
        return {
            "class_name": class_display,
            "tingkatan": assigned_form,
            "kelas": assigned_class,
            "tahun": tahun or datetime.now().year,
            "total_students": 0,
            "statistics": {
                "total_expected": 0,
                "total_collected": 0,
                "total_outstanding": 0,
                "collection_rate": 0
            },
            "by_fee_status": {
                "selesai": 0,
                "separa": 0,
                "belum_bayar": 0,
                "tiada_yuran": 0
            },
            "by_gender": {"male": 0, "female": 0},
            "by_religion": {},
            "by_bangsa": {},
            "by_state": {}
        }
    
    # Get yuran records for students
    yuran_query = {"student_id": {"$in": student_ids}}
    if tahun:
        yuran_query["tahun"] = tahun
    
    yuran_records = await db.student_yuran.find(yuran_query).to_list(2000)
    
    # Build yuran by student_id map
    yuran_by_student = {}
    for r in yuran_records:
        sid = str(r.get("student_id"))
        if sid not in yuran_by_student:
            yuran_by_student[sid] = []
        yuran_by_student[sid].append(r)
    
    # Calculate statistics
    total_expected = 0
    total_collected = 0
    
    by_fee_status = {"selesai": 0, "separa": 0, "belum_bayar": 0, "tiada_yuran": 0}
    by_gender = {"male": 0, "female": 0}
    by_religion = {}
    by_bangsa = {}
    by_state = {}
    
    students_with_outstanding = []
    
    for student in students:
        sid = str(student["_id"])
        student_yuran = yuran_by_student.get(sid, [])
        
        # Calculate totals
        student_total = sum(r.get("total_amount", 0) for r in student_yuran)
        student_paid = sum(r.get("paid_amount", 0) for r in student_yuran)
        student_outstanding = student_total - student_paid
        
        total_expected += student_total
        total_collected += student_paid
        
        # Fee status
        if student_total == 0:
            by_fee_status["tiada_yuran"] += 1
        elif student_paid >= student_total:
            by_fee_status["selesai"] += 1
        elif student_paid > 0:
            by_fee_status["separa"] += 1
        else:
            by_fee_status["belum_bayar"] += 1
        
        # Gender
        gender = student.get("gender", "").lower()
        if gender in ["male", "lelaki"]:
            by_gender["male"] += 1
        elif gender in ["female", "perempuan"]:
            by_gender["female"] += 1
        
        # Religion
        religion = student.get("religion", "Islam")
        by_religion[religion] = by_religion.get(religion, 0) + 1
        
        # Bangsa
        bangsa = student.get("bangsa", "Melayu")
        by_bangsa[bangsa] = by_bangsa.get(bangsa, 0) + 1
        
        # State
        state = student.get("state", "Tiada")
        by_state[state] = by_state.get(state, 0) + 1
        
        # Track students with outstanding
        if student_outstanding > 0:
            students_with_outstanding.append({
                "student_id": sid,
                "full_name": student.get("full_name", ""),
                "matric_number": student.get("matric_number", ""),
                "outstanding": student_outstanding
            })
    
    # Sort by outstanding amount (descending)
    students_with_outstanding.sort(key=lambda x: x["outstanding"], reverse=True)
    
    return {
        "class_name": class_display,
        "tingkatan": assigned_form,
        "kelas": assigned_class,
        "tahun": tahun or datetime.now().year,
        "total_students": len(students),
        "statistics": {
            "total_expected": total_expected,
            "total_collected": total_collected,
            "total_outstanding": total_expected - total_collected,
            "collection_rate": (total_collected / total_expected * 100) if total_expected > 0 else 0
        },
        "by_fee_status": by_fee_status,
        "by_gender": by_gender,
        "by_religion": by_religion,
        "by_bangsa": by_bangsa,
        "by_state": by_state,
        "top_outstanding": students_with_outstanding[:10]  # Top 10 with highest outstanding
    }


@app.get("/api/guru-dashboard/students")
async def get_guru_students_with_fees(
    tahun: Optional[int] = Query(None, description="Tahun akademik"),
    gender: Optional[str] = Query(None, description="Filter by gender: male/female"),
    religion: Optional[str] = Query(None, description="Filter by religion"),
    bangsa: Optional[str] = Query(None, description="Filter by bangsa"),
    state: Optional[str] = Query(None, description="Filter by state"),
    fee_status: Optional[str] = Query(None, description="Filter: selesai/separa/belum_bayar/tiada_yuran"),
    search: Optional[str] = Query(None, description="Search by name or matric"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_roles("guru_kelas", "guru_homeroom", "superadmin", "admin"))
):
    """
    Senarai pelajar dalam kelas dengan status yuran dan filters
    Menggunakan assigned_form dan assigned_class
    """
    assigned_form = current_user.get("assigned_form")
    assigned_class = current_user.get("assigned_class", "")
    user_role = current_user.get("role", "")
    
    # SuperAdmin/Admin can see all classes
    if user_role in ["superadmin", "admin"]:
        assigned_form = None
        assigned_class = None
    
    # Build student query
    student_query = {"status": "approved"}
    if assigned_form:
        student_query["form"] = assigned_form
    if assigned_class:
        student_query["class_name"] = assigned_class
    
    # Apply filters
    if gender:
        gender_lower = gender.lower()
        if gender_lower in ["male", "lelaki"]:
            student_query["gender"] = {"$in": ["male", "lelaki", "Male", "Lelaki"]}
        elif gender_lower in ["female", "perempuan"]:
            student_query["gender"] = {"$in": ["female", "perempuan", "Female", "Perempuan"]}
    
    if religion:
        student_query["religion"] = {"$regex": f"^{religion}$", "$options": "i"}
    
    if bangsa:
        student_query["bangsa"] = {"$regex": f"^{bangsa}$", "$options": "i"}
    
    if state:
        student_query["state"] = {"$regex": f"^{state}$", "$options": "i"}
    
    if search:
        student_query["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"matric_number": {"$regex": search, "$options": "i"}},
            {"ic_number": {"$regex": search, "$options": "i"}}
        ]
    
    # Get all students (we'll filter by fee_status in memory)
    all_students = await db.students.find(student_query).sort("full_name", 1).to_list(500)
    student_ids = [s["_id"] for s in all_students]
    
    # Get yuran records
    yuran_query = {"student_id": {"$in": student_ids}}
    if tahun:
        yuran_query["tahun"] = tahun
    
    yuran_records = await db.student_yuran.find(yuran_query).to_list(2000)
    
    # Build yuran by student_id map
    yuran_by_student = {}
    for r in yuran_records:
        sid = str(r.get("student_id"))
        if sid not in yuran_by_student:
            yuran_by_student[sid] = []
        yuran_by_student[sid].append(r)
    
    # Process students and apply fee_status filter
    result_students = []
    
    for student in all_students:
        sid = str(student["_id"])
        student_yuran = yuran_by_student.get(sid, [])
        
        # Calculate totals
        student_total = sum(r.get("total_amount", 0) for r in student_yuran)
        student_paid = sum(r.get("paid_amount", 0) for r in student_yuran)
        student_outstanding = student_total - student_paid
        
        # Determine fee status
        if student_total == 0:
            student_fee_status = "tiada_yuran"
        elif student_paid >= student_total:
            student_fee_status = "selesai"
        elif student_paid > 0:
            student_fee_status = "separa"
        else:
            student_fee_status = "belum_bayar"
        
        # Apply fee_status filter
        if fee_status and student_fee_status != fee_status:
            continue
        
        result_students.append({
            "student_id": sid,
            "full_name": student.get("full_name", ""),
            "matric_number": student.get("matric_number", ""),
            "ic_number": student.get("ic_number", ""),
            "form": student.get("form", 1),
            "class_name": student.get("class_name", ""),
            "gender": student.get("gender", ""),
            "religion": student.get("religion", "Islam"),
            "bangsa": student.get("bangsa", "Melayu"),
            "state": student.get("state", ""),
            "block_name": student.get("block_name", ""),
            "room_number": student.get("room_number", ""),
            "total_fees": student_total,
            "paid_amount": student_paid,
            "outstanding": student_outstanding,
            "fee_status": student_fee_status,
            "progress_percent": (student_paid / student_total * 100) if student_total > 0 else 0,
            "yuran_count": len(student_yuran)
        })
    
    # Apply pagination
    total = len(result_students)
    skip = (page - 1) * limit
    paginated = result_students[skip:skip + limit]
    
    return {
        "students": paginated,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": (total + limit - 1) // limit if total > 0 else 1,
            "has_next": skip + limit < total,
            "has_prev": page > 1
        },
        "filters_applied": {
            "tingkatan": assigned_form,
            "class_name": assigned_class or "Semua",
            "tahun": tahun,
            "gender": gender,
            "religion": religion,
            "bangsa": bangsa,
            "state": state,
            "fee_status": fee_status,
            "search": search
        }
    }


@app.get("/api/guru-dashboard/student/{student_id}")
async def get_student_detail_for_guru(
    student_id: str,
    current_user: dict = Depends(require_roles("guru_kelas", "guru_homeroom", "superadmin", "admin"))
):
    """
    Detail pelajar dengan sejarah yuran - untuk Guru Kelas
    """
    assigned_form = current_user.get("assigned_form")
    assigned_class = current_user.get("assigned_class", "")
    user_role = current_user.get("role", "")
    
    # Get student
    student = await db.students.find_one({"_id": ObjectId(student_id)})
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    
    # Check access for guru_kelas - must be in same tingkatan and class
    if user_role in ["guru_kelas", "guru_homeroom"]:
        student_form = student.get("form")
        student_class = student.get("class_name")
        if assigned_form and student_form != assigned_form:
            raise HTTPException(status_code=403, detail="Pelajar bukan dalam tingkatan anda")
        if assigned_class and student_class != assigned_class:
            raise HTTPException(status_code=403, detail="Pelajar bukan dalam kelas anda")
    
    # Get all yuran records
    yuran_records = await db.student_yuran.find({
        "student_id": ObjectId(student_id)
    }).sort([("tahun", -1), ("tingkatan", -1)]).to_list(20)
    
    # Calculate totals
    total_fees = sum(r.get("total_amount", 0) for r in yuran_records)
    paid_amount = sum(r.get("paid_amount", 0) for r in yuran_records)
    outstanding = total_fees - paid_amount
    
    # Get parent info
    parent = None
    if student.get("parent_id"):
        parent_doc = await db.users.find_one({"_id": student.get("parent_id")})
        if parent_doc:
            parent = {
                "id": str(parent_doc["_id"]),
                "full_name": parent_doc.get("full_name", ""),
                "email": parent_doc.get("email", ""),
                "phone": parent_doc.get("phone", ""),
                "phone_alt": parent_doc.get("phone_alt", "")
            }
    
    return {
        "student": {
            "id": str(student["_id"]),
            "full_name": student.get("full_name", ""),
            "matric_number": student.get("matric_number", ""),
            "ic_number": student.get("ic_number", ""),
            "form": student.get("form", 1),
            "class_name": student.get("class_name", ""),
            "gender": student.get("gender", ""),
            "religion": student.get("religion", "Islam"),
            "bangsa": student.get("bangsa", "Melayu"),
            "state": student.get("state", ""),
            "block_name": student.get("block_name", ""),
            "room_number": student.get("room_number", ""),
            "address": student.get("address", ""),
            "postcode": student.get("postcode", ""),
            "city": student.get("city", "")
        },
        "parent": parent,
        "fee_summary": {
            "total_fees": total_fees,
            "paid_amount": paid_amount,
            "outstanding": outstanding,
            "progress_percent": (paid_amount / total_fees * 100) if total_fees > 0 else 0
        },
        "yuran_records": [
            {
                "id": str(r["_id"]),
                "tahun": r.get("tahun"),
                "tingkatan": r.get("tingkatan"),
                "set_yuran_nama": r.get("set_yuran_nama", ""),
                "total_amount": r.get("total_amount", 0),
                "paid_amount": r.get("paid_amount", 0),
                "status": r.get("status", "pending"),
                "items": r.get("items", []),
                "payments": r.get("payments", [])
            }
            for r in yuran_records
        ]
    }


@app.get("/api/guru-dashboard/filter-options")
async def get_guru_filter_options(
    current_user: dict = Depends(require_roles("guru_kelas", "guru_homeroom", "superadmin", "admin"))
):
    """
    Dapatkan pilihan untuk filters - gender, religion, bangsa, state
    """
    assigned_form = current_user.get("assigned_form")
    assigned_class = current_user.get("assigned_class", "")
    user_role = current_user.get("role", "")
    
    # Build student query
    student_query = {"status": "approved"}
    if user_role in ["guru_kelas", "guru_homeroom"]:
        if assigned_form:
            student_query["form"] = assigned_form
        if assigned_class:
            student_query["class_name"] = assigned_class
    
    # Get distinct values
    students = await db.students.find(student_query).to_list(500)
    
    religions = set()
    bangsa_list = set()
    states = set()
    
    for s in students:
        if s.get("religion"):
            religions.add(s["religion"])
        if s.get("bangsa"):
            bangsa_list.add(s["bangsa"])
        if s.get("state"):
            states.add(s["state"])
    
    # Get system config for default options
    system_config = await db.settings.find_one({"type": "system_config"})
    
    return {
        "gender": [
            {"value": "male", "label": "Lelaki"},
            {"value": "female", "label": "Perempuan"}
        ],
        "religion": sorted(list(religions)) if religions else ["Islam", "Buddha", "Hindu", "Kristian"],
        "bangsa": sorted(list(bangsa_list)) if bangsa_list else ["Melayu", "Cina", "India", "Lain-lain"],
        "state": sorted(list(states)) if states else (system_config.get("negeri", []) if system_config else []),
        "fee_status": [
            {"value": "selesai", "label": "Selesai Bayar"},
            {"value": "separa", "label": "Bayaran Separa"},
            {"value": "belum_bayar", "label": "Belum Bayar"},
            {"value": "tiada_yuran", "label": "Tiada Yuran"}
        ],
        "tahun": [datetime.now().year - 1, datetime.now().year, datetime.now().year + 1]
    }


@app.post("/api/guru-dashboard/send-reminder")
async def send_fee_reminder_from_guru(
    student_ids: Optional[List[str]] = None,
    send_to_all: bool = False,
    tahun: Optional[int] = None,
    current_user: dict = Depends(require_roles("guru_kelas", "guru_homeroom", "superadmin", "admin"))
):
    """
    Hantar peringatan yuran kepada ibu bapa dari Dashboard Guru Kelas.
    - student_ids: Senarai ID pelajar tertentu
    - send_to_all: Hantar kepada semua pelajar dengan tunggakan dalam kelas
    """
    class_name = current_user.get("assigned_class", "")
    user_role = current_user.get("role", "")
    current_tahun = tahun or datetime.now().year
    
    # SuperAdmin/Admin can see all classes
    if user_role in ["superadmin", "admin"]:
        class_name = None
    
    students_to_notify = []
    
    if send_to_all:
        # Get all students with outstanding fees in the class
        student_query = {"status": "approved"}
        if class_name:
            student_query["class_name"] = class_name
        
        all_students = await db.students.find(student_query).to_list(500)
        
        for student in all_students:
            # Get yuran records
            yuran_records = await db.student_yuran.find({
                "student_id": student["_id"],
                "tahun": current_tahun
            }).to_list(10)
            
            total_fees = sum(r.get("total_amount", 0) for r in yuran_records)
            paid_amount = sum(r.get("paid_amount", 0) for r in yuran_records)
            outstanding = total_fees - paid_amount
            
            if outstanding > 0 and student.get("parent_id"):
                students_to_notify.append({
                    "student": student,
                    "outstanding": outstanding,
                    "total_fees": total_fees,
                    "paid_amount": paid_amount
                })
    
    elif student_ids:
        # Get specific students
        for sid in student_ids:
            try:
                student = await db.students.find_one({"_id": ObjectId(sid)})
                if not student:
                    continue
                
                # Check access for guru_kelas
                if user_role in ["guru_kelas", "guru_homeroom"] and class_name:
                    if student.get("class_name") != class_name:
                        continue
                
                # Get yuran records
                yuran_records = await db.student_yuran.find({
                    "student_id": student["_id"],
                    "tahun": current_tahun
                }).to_list(10)
                
                total_fees = sum(r.get("total_amount", 0) for r in yuran_records)
                paid_amount = sum(r.get("paid_amount", 0) for r in yuran_records)
                outstanding = total_fees - paid_amount
                
                if outstanding > 0 and student.get("parent_id"):
                    students_to_notify.append({
                        "student": student,
                        "outstanding": outstanding,
                        "total_fees": total_fees,
                        "paid_amount": paid_amount
                    })
            except Exception:
                continue
    else:
        raise HTTPException(status_code=400, detail="Sila pilih pelajar atau hantar kepada semua")
    
    if not students_to_notify:
        return {
            "status": "no_action",
            "message": "Tiada pelajar dengan tunggakan yang mempunyai akaun ibu bapa",
            "notifications_sent": 0,
            "emails_sent": 0
        }
    
    # Send notifications
    notifications_sent = 0
    emails_sent = 0
    results = []
    
    for item in students_to_notify:
        student = item["student"]
        outstanding = item["outstanding"]
        
        parent_id = student.get("parent_id")
        if not parent_id:
            continue
        
        # Get parent info
        parent = await db.users.find_one({"_id": parent_id})
        if not parent:
            continue
        
        # Create in-app notification
        notification_doc = {
            "user_id": parent_id,
            "title": "Peringatan Tunggakan Yuran",
            "message": f"Anak anda, {student.get('full_name')}, mempunyai tunggakan yuran sebanyak RM {outstanding:.2f}. Sila jelaskan secepat mungkin.",
            "type": "warning",
            "is_read": False,
            "source": "guru_dashboard",
            "sent_by": current_user["_id"],
            "sent_by_name": current_user.get("full_name", ""),
            "student_id": student["_id"],
            "student_name": student.get("full_name", ""),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.notifications.insert_one(notification_doc)
        notifications_sent += 1
        
        # Try to send email if Resend is enabled
        try:
            from services.email_service import send_fee_reminder, RESEND_ENABLED
            if RESEND_ENABLED and parent.get("email"):
                children_outstanding = [{
                    "name": student.get("full_name"),
                    "student_id": str(student["_id"]),
                    "outstanding": outstanding,
                    "form": student.get("form"),
                    "class_name": student.get("class_name", "")
                }]
                
                result = await send_fee_reminder(
                    parent_email=parent.get("email"),
                    parent_name=parent.get("full_name", "Ibu Bapa"),
                    children_outstanding=children_outstanding,
                    total_outstanding=outstanding
                )
                
                if result.get("status") == "success":
                    emails_sent += 1
                    results.append({
                        "student_name": student.get("full_name"),
                        "parent_email": parent.get("email"),
                        "status": "sent",
                        "notification": True,
                        "email": True
                    })
                else:
                    results.append({
                        "student_name": student.get("full_name"),
                        "parent_email": parent.get("email"),
                        "status": "partial",
                        "notification": True,
                        "email": False,
                        "error": result.get("error", "Email gagal dihantar")
                    })
            else:
                results.append({
                    "student_name": student.get("full_name"),
                    "parent_email": parent.get("email", "tiada"),
                    "status": "notification_only",
                    "notification": True,
                    "email": False
                })
        except Exception as e:
            results.append({
                "student_name": student.get("full_name"),
                "parent_email": parent.get("email", "tiada"),
                "status": "notification_only",
                "notification": True,
                "email": False,
                "error": str(e)
            })
    
    # Log audit
    await log_audit(
        current_user,
        "SEND_FEE_REMINDER",
        "guru_dashboard",
        f"Hantar {notifications_sent} peringatan yuran kepada ibu bapa dalam kelas {class_name or 'Semua'}"
    )
    
    return {
        "status": "success",
        "message": f"Berjaya menghantar {notifications_sent} notifikasi" + (f" dan {emails_sent} email" if emails_sent > 0 else ""),
        "notifications_sent": notifications_sent,
        "emails_sent": emails_sent,
        "total_students": len(students_to_notify),
        "results": results
    }


# ============ NOTIFICATION CENTER (GURU KELAS) ============

def serialize_notification(notif: dict) -> dict:
    """Serialize notification for JSON response"""
    return {
        "id": str(notif["_id"]),
        "type": notif.get("type", "general"),
        "title": notif.get("title", ""),
        "message": notif.get("message", ""),
        "category": notif.get("category", "general"),
        "priority": notif.get("priority", "normal"),
        "is_read": notif.get("is_read", False),
        "read_at": notif.get("read_at").isoformat() if notif.get("read_at") else None,
        "action_url": notif.get("action_url"),
        "action_label": notif.get("action_label"),
        "metadata": notif.get("metadata", {}),
        "created_at": notif.get("created_at").isoformat() if isinstance(notif.get("created_at"), datetime) else notif.get("created_at"),
        "sender_name": notif.get("sender_name") or notif.get("sent_by_name"),
        "sender_role": notif.get("sender_role")
    }


def serialize_announcement(ann: dict) -> dict:
    """Serialize announcement for JSON response"""
    return {
        "id": str(ann["_id"]),
        "title": ann.get("title", ""),
        "content": ann.get("content", ""),
        "priority": ann.get("priority", "normal"),
        "tingkatan": ann.get("tingkatan"),
        "kelas": ann.get("kelas"),
        "status": ann.get("status", "draft"),
        "sent_count": ann.get("sent_count", 0),
        "created_by_name": ann.get("created_by_name"),
        "created_at": ann.get("created_at").isoformat() if isinstance(ann.get("created_at"), datetime) else ann.get("created_at"),
        "published_at": ann.get("published_at").isoformat() if isinstance(ann.get("published_at"), datetime) else ann.get("published_at")
    }


class NotificationMarkRead(BaseModel):
    notification_ids: List[str]


class AnnouncementCreate(BaseModel):
    title: str
    content: str
    priority: str = "normal"
    send_push: bool = True
    send_email: bool = True


class PushSubscriptionModel(BaseModel):
    endpoint: str
    keys: dict
    device_info: Optional[str] = None


@app.get("/api/notifications")
async def get_user_notifications(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    category: Optional[str] = None,
    unread_only: bool = False,
    current_user: dict = Depends(require_roles())
):
    """Get user's notifications with pagination"""
    user_id = current_user["_id"]
    
    query = {"user_id": user_id}
    if category:
        query["category"] = category
    if unread_only:
        query["is_read"] = False
    
    total = await db.notifications.count_documents(query)
    skip = (page - 1) * limit
    notifications = await db.notifications.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    unread_count = await db.notifications.count_documents({"user_id": user_id, "is_read": False})
    
    return {
        "notifications": [serialize_notification(n) for n in notifications],
        "pagination": {"page": page, "limit": limit, "total": total, "total_pages": max(1, (total + limit - 1) // limit), "has_next": skip + limit < total, "has_prev": page > 1},
        "unread_count": unread_count
    }


@app.get("/api/notifications/unread-count")
async def get_unread_notification_count(current_user: dict = Depends(require_roles())):
    """Get count of unread notifications"""
    count = await db.notifications.count_documents({"user_id": current_user["_id"], "is_read": False})
    return {"unread_count": count}


@app.put("/api/notifications/mark-read")
async def mark_notifications_as_read(data: NotificationMarkRead, current_user: dict = Depends(require_roles())):
    """Mark specific notifications as read"""
    notif_ids = [ObjectId(nid) for nid in data.notification_ids]
    result = await db.notifications.update_many(
        {"_id": {"$in": notif_ids}, "user_id": current_user["_id"]},
        {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc)}}
    )
    return {"status": "success", "marked_count": result.modified_count}


@app.put("/api/notifications/mark-all-read")
async def mark_all_notifications_read(current_user: dict = Depends(require_roles())):
    """Mark all notifications as read"""
    result = await db.notifications.update_many(
        {"user_id": current_user["_id"], "is_read": False},
        {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc)}}
    )
    return {"status": "success", "marked_count": result.modified_count}


@app.delete("/api/notifications/{notification_id}")
async def delete_notification(notification_id: str, current_user: dict = Depends(require_roles())):
    """Delete a notification"""
    result = await db.notifications.delete_one({"_id": ObjectId(notification_id), "user_id": current_user["_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notifikasi tidak dijumpai")
    return {"status": "deleted"}


@app.get("/api/notifications/guru/dashboard")
async def get_guru_notification_dashboard(current_user: dict = Depends(require_roles("guru_kelas", "guru_homeroom", "superadmin", "admin"))):
    """Dashboard notifikasi untuk Guru Kelas"""
    teacher_id = current_user["_id"]
    tingkatan = current_user.get("assigned_form")
    kelas = current_user.get("assigned_class")
    
    student_query = {"status": "approved"}
    if tingkatan:
        student_query["form"] = tingkatan
    if kelas:
        student_query["class_name"] = kelas
    
    students = await db.students.find(student_query).to_list(100)
    parent_ids = list(set([s.get("parent_id") for s in students if s.get("parent_id")]))
    parents = await db.users.find({"_id": {"$in": parent_ids}, "role": "parent"}).to_list(100)
    
    push_count = await db.push_subscriptions.count_documents({"user_id": {"$in": [p["_id"] for p in parents]}, "is_active": True})
    recent_announcements = await db.announcements.find({"created_by": teacher_id}).sort("created_at", -1).limit(5).to_list(5)
    total_ann = await db.announcements.count_documents({"created_by": teacher_id})
    published_ann = await db.announcements.count_documents({"created_by": teacher_id, "status": "published"})
    
    return {
        "class_info": {
            "tingkatan": tingkatan,
            "kelas": kelas,
            "full_class": f"T{tingkatan} {kelas}" if tingkatan and kelas else "-",
            "student_count": len(students),
            "parent_count": len(parents)
        },
        "push_stats": {
            "total_parents": len(parents),
            "subscribed_count": push_count,
            "subscription_rate": (push_count / len(parents) * 100) if parents else 0
        },
        "announcement_stats": {"total": total_ann, "published": published_ann, "drafts": total_ann - published_ann},
        "recent_announcements": [serialize_announcement(a) for a in recent_announcements],
        "email_stats": {"sent_today": 0}
    }


@app.get("/api/notifications/guru/parents")
async def get_guru_class_parents(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    current_user: dict = Depends(require_roles("guru_kelas", "guru_homeroom", "superadmin", "admin"))
):
    """Senarai ibu bapa dalam kelas guru"""
    tingkatan = current_user.get("assigned_form")
    kelas = current_user.get("assigned_class")
    
    student_query = {"status": "approved"}
    if tingkatan:
        student_query["form"] = tingkatan
    if kelas:
        student_query["class_name"] = kelas
    
    students = await db.students.find(student_query).to_list(500)
    
    parent_students = {}
    for s in students:
        pid = s.get("parent_id")
        if pid:
            if pid not in parent_students:
                parent_students[pid] = []
            parent_students[pid].append({"id": str(s["_id"]), "name": s.get("full_name"), "matric": s.get("matric_number")})
    
    parent_query = {"_id": {"$in": list(parent_students.keys())}, "role": "parent"}
    if search:
        parent_query["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}}
        ]
    
    total = await db.users.count_documents(parent_query)
    skip = (page - 1) * limit
    parents = await db.users.find(parent_query).skip(skip).limit(limit).to_list(limit)
    
    subscriptions = await db.push_subscriptions.find({"user_id": {"$in": [p["_id"] for p in parents]}, "is_active": True}).to_list(500)
    sub_by_parent = {}
    for sub in subscriptions:
        uid = sub["user_id"]
        sub_by_parent[uid] = sub_by_parent.get(uid, 0) + 1
    
    result = []
    for p in parents:
        result.append({
            "id": str(p["_id"]),
            "full_name": p.get("full_name"),
            "email": p.get("email"),
            "phone": p.get("phone"),
            "children": parent_students.get(p["_id"], []),
            "push_subscribed": p["_id"] in sub_by_parent,
            "device_count": sub_by_parent.get(p["_id"], 0)
        })
    
    return {"parents": result, "pagination": {"page": page, "limit": limit, "total": total, "total_pages": max(1, (total + limit - 1) // limit)}}


@app.get("/api/notifications/announcements")
async def get_announcements_list(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    current_user: dict = Depends(require_roles("guru_kelas", "guru_homeroom", "superadmin", "admin"))
):
    """Senarai pengumuman oleh guru"""
    query = {}
    if current_user.get("role") in ["guru_kelas", "guru_homeroom"]:
        query["created_by"] = current_user["_id"]
    if status:
        query["status"] = status
    
    total = await db.announcements.count_documents(query)
    skip = (page - 1) * limit
    announcements = await db.announcements.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {"announcements": [serialize_announcement(a) for a in announcements], "pagination": {"page": page, "limit": limit, "total": total, "total_pages": max(1, (total + limit - 1) // limit)}}


@app.post("/api/notifications/announcements")
async def create_new_announcement(data: AnnouncementCreate, current_user: dict = Depends(require_roles("guru_kelas", "guru_homeroom", "superadmin", "admin"))):
    """Cipta dan terbitkan pengumuman baru"""
    tingkatan = current_user.get("assigned_form")
    kelas = current_user.get("assigned_class")
    
    announcement = {
        "title": data.title,
        "content": data.content,
        "priority": data.priority,
        "tingkatan": tingkatan,
        "kelas": kelas,
        "status": "published",
        "send_push": data.send_push,
        "send_email": data.send_email,
        "sent_count": 0,
        "created_by": current_user["_id"],
        "created_by_name": current_user.get("full_name"),
        "created_at": datetime.now(timezone.utc),
        "published_at": datetime.now(timezone.utc)
    }
    
    result = await db.announcements.insert_one(announcement)
    announcement["_id"] = result.inserted_id
    
    # Send to parents in class
    student_query = {"status": "approved"}
    if tingkatan:
        student_query["form"] = tingkatan
    if kelas:
        student_query["class_name"] = kelas
    
    students = await db.students.find(student_query).to_list(500)
    parent_ids = list(set([s.get("parent_id") for s in students if s.get("parent_id")]))
    parents = await db.users.find({"_id": {"$in": parent_ids}, "role": "parent"}).to_list(500)
    
    sent_count = 0
    for parent in parents:
        # Create in-app notification with FULL message content
        await db.notifications.insert_one({
            "user_id": parent["_id"],
            "type": "announcement",
            "category": "announcement",
            "title": announcement["title"],
            "message": announcement["content"],  # Store full content for complete viewing
            "priority": announcement.get("priority", "normal"),
            "is_read": False,
            "action_url": "/notifications",
            "action_label": "Lihat Pengumuman",
            "metadata": {"announcement_id": str(announcement["_id"])},
            "sender_id": current_user["_id"],
            "sender_name": current_user.get("full_name"),
            "sender_role": current_user.get("role"),
            "created_at": datetime.now(timezone.utc)
        })
        sent_count += 1
        
        # Log push notification (would be sent by service worker)
        if data.send_push:
            await db.push_logs.insert_one({
                "user_id": parent["_id"],
                "title": f"Pengumuman: {announcement['title']}",
                "body": announcement["content"][:100],
                "url": "/notifications",
                "status": "pending",
                "created_at": datetime.now(timezone.utc)
            })
        
        # Log email (would be sent by background job)
        if data.send_email and parent.get("email"):
            await db.email_logs.insert_one({
                "user_id": parent["_id"],
                "email": parent["email"],
                "subject": f"Pengumuman: {announcement['title']}",
                "template": "announcement",
                "status": "queued",
                "metadata": {"content": announcement["content"]},
                "created_at": datetime.now(timezone.utc)
            })
    
    await db.announcements.update_one({"_id": result.inserted_id}, {"$set": {"sent_count": sent_count}})
    announcement["sent_count"] = sent_count
    
    return {"status": "success", "message": f"Pengumuman berjaya diterbitkan kepada {sent_count} ibu bapa", "announcement": serialize_announcement(announcement)}


@app.delete("/api/notifications/announcements/{announcement_id}")
async def delete_announcement_by_id(announcement_id: str, current_user: dict = Depends(require_roles("guru_kelas", "guru_homeroom", "superadmin", "admin"))):
    """Padam pengumuman"""
    announcement = await db.announcements.find_one({"_id": ObjectId(announcement_id)})
    if not announcement:
        raise HTTPException(status_code=404, detail="Pengumuman tidak dijumpai")
    
    if current_user.get("role") in ["guru_kelas", "guru_homeroom"] and announcement["created_by"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    await db.announcements.delete_one({"_id": ObjectId(announcement_id)})
    return {"status": "deleted"}


@app.get("/api/notifications/announcements/{announcement_id}")
async def get_single_announcement(announcement_id: str, current_user: dict = Depends(require_roles())):
    """Get single announcement by ID"""
    announcement = await db.announcements.find_one({"_id": ObjectId(announcement_id)})
    if not announcement:
        raise HTTPException(status_code=404, detail="Pengumuman tidak dijumpai")
    return {"announcement": serialize_announcement(announcement)}



@app.post("/api/notifications/guru/send-quick")
async def send_quick_class_notification(
    title: str = Body(...),
    message: str = Body(...),
    target: str = Body("all"),
    target_parents: Optional[List[str]] = Body(None),
    send_push: bool = Body(True),
    send_email: bool = Body(False),
    current_user: dict = Depends(require_roles("guru_kelas", "guru_homeroom", "superadmin", "admin"))
):
    """Hantar notifikasi ringkas kepada ibu bapa dalam kelas"""
    tingkatan = current_user.get("assigned_form")
    kelas = current_user.get("assigned_class")
    
    if target == "all":
        student_query = {"status": "approved"}
        if tingkatan:
            student_query["form"] = tingkatan
        if kelas:
            student_query["class_name"] = kelas
        students = await db.students.find(student_query).to_list(500)
        parent_ids = list(set([s.get("parent_id") for s in students if s.get("parent_id")]))
    else:
        parent_ids = [ObjectId(pid) for pid in (target_parents or [])]
    
    if not parent_ids:
        raise HTTPException(status_code=400, detail="Tiada ibu bapa untuk dihantar notifikasi")
    
    parents = await db.users.find({"_id": {"$in": parent_ids}, "role": "parent"}).to_list(500)
    
    sent_count = 0
    for parent in parents:
        await db.notifications.insert_one({
            "user_id": parent["_id"],
            "type": "message",
            "category": "class_message",
            "title": title,
            "message": message,
            "priority": "normal",
            "is_read": False,
            "action_url": "/notifications",
            "sender_id": current_user["_id"],
            "sender_name": current_user.get("full_name"),
            "sender_role": current_user.get("role"),
            "created_at": datetime.now(timezone.utc)
        })
        sent_count += 1
        
        if send_push:
            await db.push_logs.insert_one({
                "user_id": parent["_id"],
                "title": title,
                "body": message[:100],
                "url": "/notifications",
                "status": "pending",
                "created_at": datetime.now(timezone.utc)
            })
        
        if send_email and parent.get("email"):
            await db.email_logs.insert_one({
                "user_id": parent["_id"],
                "email": parent["email"],
                "subject": title,
                "template": "quick_message",
                "status": "queued",
                "metadata": {"message": message},
                "created_at": datetime.now(timezone.utc)
            })
    
    return {"status": "success", "message": f"Berjaya menghantar {sent_count} notifikasi", "notifications_sent": sent_count}


@app.get("/api/notifications/push/public-key")
async def get_push_public_key(current_user: dict = Depends(require_roles())):
    """Dapatkan VAPID public key untuk pendaftaran push subscription."""
    public_key = str(os.environ.get("WEB_PUSH_VAPID_PUBLIC_KEY", "") or "").strip()
    return {"configured": bool(public_key), "public_key": public_key}


@app.post("/api/notifications/push/subscribe")
async def subscribe_to_push(subscription: PushSubscriptionModel, current_user: dict = Depends(require_roles())):
    """Langgan push notification"""
    existing = await db.push_subscriptions.find_one({"endpoint": subscription.endpoint, "user_id": current_user["_id"]})
    
    if existing:
        await db.push_subscriptions.update_one(
            {"_id": existing["_id"]},
            {"$set": {"keys": subscription.keys, "device_info": subscription.device_info, "is_active": True, "updated_at": datetime.now(timezone.utc)}}
        )
        return {"status": "updated", "message": "Langganan dikemas kini"}
    
    await db.push_subscriptions.insert_one({
        "user_id": current_user["_id"],
        "endpoint": subscription.endpoint,
        "keys": subscription.keys,
        "device_info": subscription.device_info,
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    })
    return {"status": "subscribed", "message": "Berjaya melanggan notifikasi"}


@app.get("/api/notifications/push/status")
async def get_push_subscription_status(current_user: dict = Depends(require_roles())):
    """Dapatkan status langganan push notification"""
    subscriptions = await db.push_subscriptions.find({"user_id": current_user["_id"], "is_active": True}).to_list(10)
    
    return {
        "is_subscribed": len(subscriptions) > 0,
        "device_count": len(subscriptions),
        "devices": [{"id": str(s["_id"]), "device_info": s.get("device_info", "Unknown")} for s in subscriptions]
    }



@app.post("/api/vehicles/register")
async def register_vehicle(
    vehicle: VehicleRecord,
    current_user: dict = Depends(require_roles("guard", "admin", "superadmin"))
):
    """Register vehicle"""
    existing = await db.vehicles.find_one({"plate_number": vehicle.plate_number.upper()})
    if existing:
        raise HTTPException(status_code=400, detail="Kenderaan sudah didaftarkan")
    
    # Try users collection first (pelajar role)
    student = await db.users.find_one({"_id": ObjectId(vehicle.student_id), "role": "pelajar"})
    if not student:
        # Fallback to students collection
        student = await db.students.find_one({"_id": ObjectId(vehicle.student_id)})
    if not student:
        raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
    
    student_name = student.get("fullName", student.get("full_name", "Unknown"))
    
    vehicle_doc = {
        "plate_number": vehicle.plate_number.upper(),
        "owner_name": vehicle.owner_name,
        "relationship": vehicle.relationship,
        "phone": vehicle.phone,
        "student_id": ObjectId(vehicle.student_id),
        "student_name": student_name,
        "student_matric": student.get("matric", ""),
        "qr_code": f"MRSMKU-VEH-{vehicle.plate_number.upper()}",
        "registered_by": str(current_user["_id"]),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.vehicles.insert_one(vehicle_doc)
    
    await log_audit(current_user, "REGISTER_VEHICLE", "vehicles", f"Daftar kenderaan: {vehicle.plate_number}")
    
    return {"message": "Kenderaan didaftarkan", "qr_code": vehicle_doc["qr_code"], "id": str(result.inserted_id)}

@app.post("/api/vehicles/scan/{plate_number}")
async def scan_vehicle(
    plate_number: str,
    current_user: dict = Depends(require_roles("guard", "admin", "superadmin"))
):
    """Scan vehicle QR"""
    vehicle = await db.vehicles.find_one({"plate_number": plate_number.upper()})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Kenderaan tidak didaftarkan")
    
    scan_doc = {
        "vehicle_id": vehicle["_id"],
        "plate_number": vehicle["plate_number"],
        "scan_time": datetime.now(timezone.utc).isoformat(),
        "scanned_by": str(current_user["_id"])
    }
    await db.vehicle_scans.insert_one(scan_doc)
    
    return {
        "message": "Scan berjaya",
        "vehicle": {
            "plate_number": vehicle["plate_number"],
            "owner_name": vehicle["owner_name"],
            "relationship": vehicle["relationship"],
            "student_name": vehicle["student_name"]
        }
    }

@app.get("/api/vehicles")
async def get_vehicles(current_user: dict = Depends(require_roles("guard", "admin", "superadmin"))):
    """Get all registered vehicles"""
    vehicles = await db.vehicles.find().to_list(1000)
    return [{"id": str(v["_id"]), **{k: val for k, val in v.items() if k not in ["_id", "student_id"]}, "student_id": str(v["student_id"])} for v in vehicles]

@app.get("/api/vehicles/stats")
async def get_vehicle_stats(current_user: dict = Depends(require_roles("guard", "admin", "superadmin"))):
    """Get vehicle statistics"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    total_vehicles = await db.vehicles.count_documents({})
    today_scans = await db.vehicle_scans.count_documents({
        "scan_time": {"$regex": f"^{today}"}
    })
    
    # Recent scans
    recent_scans = await db.vehicle_scans.find().sort("scan_time", -1).limit(10).to_list(10)
    
    return {
        "total_vehicles": total_vehicles,
        "today_scans": today_scans,
        "recent_scans": [{
            "id": str(s["_id"]),
            "plate_number": s["plate_number"],
            "scan_time": s["scan_time"]
        } for s in recent_scans]
    }

@app.get("/api/vehicles/search/{plate_number}")
async def search_vehicle(
    plate_number: str,
    current_user: dict = Depends(require_roles("guard", "admin", "superadmin"))
):
    """Search vehicle by plate number"""
    vehicle = await db.vehicles.find_one({"plate_number": {"$regex": plate_number.upper(), "$options": "i"}})
    if not vehicle:
        return {"found": False, "message": "Kenderaan tidak dijumpai"}
    
    return {
        "found": True,
        "vehicle": {
            "id": str(vehicle["_id"]),
            "plate_number": vehicle["plate_number"],
            "owner_name": vehicle["owner_name"],
            "relationship": vehicle["relationship"],
            "phone": vehicle["phone"],
            "student_name": vehicle["student_name"],
            "qr_code": vehicle["qr_code"]
        }
    }

@app.delete("/api/vehicles/{vehicle_id}")
async def delete_vehicle(
    vehicle_id: str,
    current_user: dict = Depends(require_roles("guard", "admin", "superadmin"))
):
    """Delete a vehicle"""
    result = await db.vehicles.delete_one({"_id": ObjectId(vehicle_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Kenderaan tidak dijumpai")
    
    await log_audit(current_user, "DELETE_VEHICLE", "vehicles", f"Padam kenderaan: {vehicle_id}")
    return {"message": "Kenderaan dipadam"}

@app.get("/api/vehicles/scans")
async def get_vehicle_scans(
    limit: int = 50,
    current_user: dict = Depends(require_roles("guard", "admin", "superadmin"))
):
    """Get vehicle scan history"""
    scans = await db.vehicle_scans.find().sort("scan_time", -1).limit(limit).to_list(limit)
    return [{
        "id": str(s["_id"]),
        "plate_number": s["plate_number"],
        "scan_time": s["scan_time"]
    } for s in scans]

@app.get("/api/guard/students")
async def get_students_for_vehicle(
    search: Optional[str] = None,
    current_user: dict = Depends(require_roles("guard", "admin", "superadmin"))
):
    """Get students for vehicle registration"""
    query = {"role": "pelajar", "status": "approved"}
    if search:
        query["$or"] = [
            {"fullName": {"$regex": search, "$options": "i"}},
            {"matric": {"$regex": search, "$options": "i"}}
        ]
    
    students = await db.users.find(query).limit(20).to_list(20)
    return [{
        "id": str(s["_id"]),
        "matric": s.get("matric", ""),
        "fullName": s.get("fullName", s.get("full_name", "")),
        "form": s.get("form", 0),
        "kelas": s.get("kelas", "")
    } for s in students]

# ============ DONATION/SEDEKAH MODULE ============

def serialize_campaign(campaign: dict) -> dict:
    collected = campaign.get("collected_amount", 0)
    target = campaign.get("target_amount", 1)
    return {
        "id": str(campaign["_id"]),
        "title": campaign["title"],
        "description": campaign["description"],
        "category": campaign["category"],
        "target_amount": target,
        "collected_amount": collected,
        "donor_count": campaign.get("donor_count", 0),
        "progress_percent": min((collected / target) * 100, 100) if target > 0 else 0,
        "start_date": campaign["start_date"],
        "end_date": campaign["end_date"],
        "is_active": campaign.get("is_active", True),
        "image_url": campaign.get("image_url"),
        "created_at": campaign["created_at"]
    }

# ============ PUBLIC DONATION ENDPOINTS (DEPRECATED - use /api/tabung) ============

_DONATION_DEPRECATED = "Endpoint ini telah ditamatkan. Sila gunakan /api/tabung untuk kempen dan sumbangan."

@app.get("/api/public/donations/campaigns")
async def get_public_donation_campaigns(
    limit: int = 10,
    category: Optional[str] = None
):
    """DEPRECATED: Use GET /api/tabung/public/campaigns"""
    raise HTTPException(status_code=410, detail=_DONATION_DEPRECATED)

@app.get("/api/public/donations/campaigns/{campaign_id}")
async def get_public_campaign_detail(campaign_id: str):
    """DEPRECATED: Use GET /api/tabung/public/campaigns/{campaign_id}"""
    raise HTTPException(status_code=410, detail=_DONATION_DEPRECATED)

@app.get("/api/public/donations/stats")
async def get_public_donation_stats():
    """DEPRECATED: Use GET /api/tabung/public/stats"""
    raise HTTPException(status_code=410, detail=_DONATION_DEPRECATED)

@app.post("/api/public/donations")
async def make_public_donation(donation_data: PublicDonationCreate):
    """DEPRECATED: Use POST /api/tabung/public/donate"""
    raise HTTPException(status_code=410, detail=_DONATION_DEPRECATED)

# ============ AUTHENTICATED DONATION ENDPOINTS (DEPRECATED - use /api/tabung) ============

@app.get("/api/donations/campaigns")
async def get_donation_campaigns(
    active_only: bool = True,
    current_user: dict = Depends(get_current_user)
):
    """DEPRECATED: Use GET /api/tabung/campaigns"""
    raise HTTPException(status_code=410, detail=_DONATION_DEPRECATED)

@app.get("/api/donations/campaigns/{campaign_id}")
async def get_donation_campaign(campaign_id: str, current_user: dict = Depends(get_current_user)):
    """DEPRECATED: Use GET /api/tabung/campaigns/{campaign_id}"""
    raise HTTPException(status_code=410, detail=_DONATION_DEPRECATED)

@app.post("/api/donations/campaigns")
async def create_donation_campaign(
    campaign_data: DonationCampaignCreate,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bendahari"))
):
    """DEPRECATED: Use POST /api/tabung/campaigns"""
    raise HTTPException(status_code=410, detail=_DONATION_DEPRECATED)

@app.put("/api/donations/campaigns/{campaign_id}")
async def update_donation_campaign(
    campaign_id: str,
    campaign_data: DonationCampaignUpdate,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bendahari"))
):
    """DEPRECATED: Use PUT /api/tabung/campaigns/{campaign_id}"""
    raise HTTPException(status_code=410, detail=_DONATION_DEPRECATED)

@app.delete("/api/donations/campaigns/{campaign_id}")
async def delete_donation_campaign(
    campaign_id: str,
    current_user: dict = Depends(require_roles("superadmin"))
):
    """DEPRECATED: Use DELETE /api/tabung/campaigns/{campaign_id}"""
    raise HTTPException(status_code=410, detail=_DONATION_DEPRECATED)

@app.post("/api/donations")
async def make_donation(
    donation_data: DonationCreate,
    current_user: dict = Depends(get_current_user)
):
    """DEPRECATED: Use POST /api/tabung/donate"""
    raise HTTPException(status_code=410, detail=_DONATION_DEPRECATED)

@app.get("/api/donations/my")
async def get_my_donations(current_user: dict = Depends(get_current_user)):
    """DEPRECATED: Use GET /api/tabung/donations/my"""
    raise HTTPException(status_code=410, detail=_DONATION_DEPRECATED)

@app.get("/api/donations/all")
async def get_all_donations(
    campaign_id: Optional[str] = None,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bendahari", "sub_bendahari"))
):
    """DEPRECATED: Use GET /api/tabung/donations"""
    raise HTTPException(status_code=410, detail=_DONATION_DEPRECATED)

@app.get("/api/donations/stats")
async def get_donation_stats(
    current_user: dict = Depends(require_roles("superadmin", "admin", "bendahari", "sub_bendahari"))
):
    """DEPRECATED: Use GET /api/tabung/stats"""
    raise HTTPException(status_code=410, detail=_DONATION_DEPRECATED)

# ============ AI ASSISTANT ============

AI_SYSTEM_PROMPT = """Anda adalah Pembantu AI Portal MRSMKU - sistem pengurusan yuran maktab berasrama penuh Malaysia.

Peranan anda:
- Membantu ibu bapa dengan soalan tentang yuran, pembayaran, dan pendaftaran anak
- Menjawab soalan tentang kempen sedekah/sumbangan
- Memberi panduan penggunaan portal
- Menjawab dalam Bahasa Melayu dengan mesra dan profesional

STRUKTUR YURAN MRSMKU (Contoh Tingkatan 5 - 2024):

📋 YURAN YANG DIURUS DALAM PORTAL INI:

1️⃣ MUAFAKAT - RM897.00/tahun
   Mengandungi 5 pecahan bayaran:
   • Yuran Muafakat - RM200.00
   • Dana Kecemerlangan - RM200.00
   • Buku dan Cetakan Modul - RM197.00
   • Tuisyen Muafakat / Program Motivasi / Kem Jati Diri - RM200.00
   • Majlis Graduasi - RM100.00

2️⃣ KOPERASI - RM110.00/tahun
   • Perkhidmatan Dobi - RM10.00 x 11 bulan

📌 JUMLAH KESELURUHAN: RM1,007.00/tahun

⚠️ NOTA PENTING:
- Wang Pendaftaran dan Wang Caruman dibayar melalui sistem MARAEPS (bukan di portal ini)
- Pembayaran dalam portal ini boleh dibuat melalui FPX atau Kad Kredit/Debit

Maklumat Portal:
- Ibu bapa boleh daftar anak dengan No. Matrik, Nama, Tingkatan, Kelas
- Admin perlu sahkan pendaftaran sebelum yuran dijana
- Pelajar boleh log masuk menggunakan No. Matrik atau No. IC untuk modul Hostel

Jika soalan di luar skop portal MRSMKU, beritahu pengguna dengan sopan bahawa anda hanya boleh membantu dengan hal-hal berkaitan portal.

Jawab dengan ringkas, mesra, dan membantu. Gunakan emoji dengan sederhana untuk menjadikan perbualan lebih mesra."""

class AIChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    history: Optional[list[dict]] = None  # [{"role":"user","content":"..."}, ...] untuk konteks bebual

class AIChatResponse(BaseModel):
    response: str
    session_id: str

# Dataset soalan lazim & jawapan (keyword-based, susunan dari spesifik ke umum)
# Setiap item: (kata kunci yang dipadankan dalam mesej, jawapan)
AI_CHAT_DATASET = [
    # Sapaan & perkenalan (backup jika tidak kena block salam di atas)
    ("siapa kamu", "Saya Pembantu AI untuk portal MRSMKU. Saya boleh bantu soalan tentang yuran, pendaftaran anak, pembayaran dan sedekah. Ada apa yang boleh saya bantu? 😊"),
    ("who are you", "Saya Pembantu AI MRSMKU. Saya membantu ibu bapa dengan soalan tentang yuran, daftar anak dan portal. Apa yang boleh saya bantu?"),
    ("boleh tolong", "Sudah tentu! Saya sedia membantu. Anda boleh tanya tentang yuran anak, cara bayar, daftar anak, atau sedekah. Apa soalan anda? 🙏"),
    ("boleh bantu", "Ya, sila tanya. Saya boleh bantu tentang Pusat Bayaran, tambah anak, kempen sedekah, tiket bas dan lain-lain. Apa yang anda perlukan?"),
    ("tak faham", "Tak mengapa. Cuba tanya dengan lebih spesifik — contoh: 'Berapa yuran setahun?', 'Cara daftar anak?', atau 'Cara bayar?' Saya akan jawab langkah demi langkah. 😊"),
    ("tak jelas", "Maaf jika jawapan tadi kurang jelas. Anda boleh pilih soalan dari tab FAQ atau tanya semula dengan lebih ringkas. Saya sedia membantu."),
    ("bagus", "Terima kasih! Jika ada soalan lain tentang portal MRSMKU, tanya sahaja. Selamat menggunakan portal. 😊"),
    ("good", "Terima kasih! Ada apa-apa lagi yang boleh saya bantu?"),
    # Jumlah & struktur yuran
    ("berapa jumlah yuran", "Jumlah yuran setahun ialah RM1,007.00 (Muafakat RM897 + Koperasi RM110). Wang Pendaftaran dan Caruman dibayar melalui MARAEPS, bukan dalam portal ini. 📋"),
    ("jumlah yuran setahun", "RM1,007.00 setahun — Muafakat RM897 (5 pecahan) dan Koperasi RM110 (dobi). Yuran lain seperti pendaftaran di MARAEPS. 💰"),
    ("jenis yuran", "Yuran dalam portal: (1) Muafakat RM897 — yuran muafakat, dana kecemerlangan, buku, program motivasi, majlis graduasi. (2) Koperasi RM110 — perkhidmatan dobi. 📋"),
    ("apakah jenis yuran", "Dua kategori: Muafakat (RM897) dan Koperasi (RM110). Klik 'Yuran anak saya' atau menu Pusat Bayaran untuk lihat pecahan dan bayar. 💵"),
    ("muafakat", "Yuran Muafakat RM897 setahun mengandungi: Yuran Muafakat RM200, Dana Kecemerlangan RM200, Buku & Modul RM197, Program Motivasi/Kem RM200, Majlis Graduasi RM100. 📚"),
    ("koperasi", "Koperasi RM110 setahun — terutamanya perkhidmatan dobi (RM10 x 11 bulan). Bayar melalui Pusat Bayaran dalam portal. 🧺"),
    # MARAEPS & pendaftaran wang
    ("maraeps", "MARAEPS ialah sistem lain untuk Wang Pendaftaran dan Wang Caruman. Bayaran tersebut tidak dibuat dalam portal MRSMKU ini; sila ikut arahan maktab untuk MARAEPS. 📌"),
    ("wang pendaftaran", "Wang Pendaftaran dan Wang Caruman dibayar melalui sistem MARAEPS, bukan melalui portal ini. Portal ini untuk yuran Muafakat dan Koperasi sahaja. ✅"),
    ("wang caruman", "Wang Caruman dibayar melalui MARAEPS. Dalam portal MRSMKU anda hanya bayar yuran Muafakat dan Koperasi (RM1,007 setahun). 💳"),
    # Cara bayar & kaedah
    ("fpx", "Ya, pembayaran melalui FPX disokong. Di Pusat Bayaran pilih yuran anak > Bayar Sekarang > pilih FPX. 💳"),
    ("ewallet", "Pembayaran melalui eWallet tidak disediakan dalam portal ini. Sila gunakan FPX atau Kad Kredit/Debit di Pusat Bayaran. 💳"),
    ("kad kredit", "Pembayaran dengan Kad Kredit/Debit disokong. Pilih yuran di Pusat Bayaran dan ikut langkah pembayaran. 💳"),
    ("cara bayar", "Pergi ke Pusat Bayaran > pilih anak > pilih yuran > klik Bayar Sekarang. Pilih FPX atau kad kredit/debit. ✅"),
    ("bagaimana cara membuat pembayaran", "Log masuk > Pusat Bayaran > pilih nama anak > pilih yuran tertunggak > Bayar Sekarang. Ikut langkah sehingga selesai. 💰"),
    ("bagaimana cara membayar", "Di Pusat Bayaran, pilih anak anda, pilih item yuran yang hendak dibayar, kemudian klik 'Bayar Sekarang'. Kaedah: FPX atau kad. 🙏"),
    # Daftar anak & tambah anak
    ("daftar anak", "Sila log masuk dan klik 'Tambah Anak' (atau di Pusat Bayaran). Isi No. Matrik, Nama, Tingkatan, Kelas, Blok, Bilik, Negeri. Admin akan sahkan. 👨‍👩‍👧"),
    ("tambah anak", "Di dashboard ibu bapa, cari 'Tambah Anak' atau pergi ke Pengurusan Anak. Masukkan No. Matrik, nama penuh, tingkatan, kelas, blok, bilik, negeri. ✅"),
    ("bagaimana cara mendaftar anak", "Log masuk sebagai ibu bapa > klik 'Tambah Anak' > isi No. Matrik, Nama, Tingkatan, Kelas, Blok, Bilik, Negeri. Tunggu pengesahan admin. 📝"),
    ("pendaftaran anak", "Gunakan 'Tambah Anak' dalam portal. Lengkapkan maklumat pelajar. Selepas admin sahkan, yuran akan dijana dan anda boleh bayar di Pusat Bayaran. 👶"),
    # Sedekah & kempen
    ("sedekah", "Anda boleh menyumbang melalui menu 'Sedekah' atau Tabung. Pilih kempen yang ingin disokong, masukkan jumlah, dan selesaikan pembayaran. Terima kasih! 🤲"),
    ("kempen sedekah", "Buka menu Sedekah/Tabung, pilih kempen, masukkan jumlah sumbangan dan bayar. Sumbangan anda sangat dihargai. 💚"),
    ("apa itu kempen sedekah", "Kempen sedekah ialah tabung sumbangan dalam portal. Ibu bapa boleh pilih kempen dan menderma mengikut kemampuan. Bayar melalui FPX atau kad. 🙏"),
    # Log masuk & akaun
    ("log masuk", "Ibu bapa: log masuk dengan emel dan kata laluan. Pelajar: log masuk dengan No. Matrik atau No. IC mengikut tetapan maktab. 🔐"),
    ("pelajar log masuk", "Pelajar biasanya log masuk dengan No. Matrik atau No. IC. Sila rujuk notis maktab. Ibu bapa guna emel dan kata laluan. 📱"),
    ("lupa kata laluan", "Gunakan pautan 'Lupa kata laluan' di halaman log masuk, atau hubungi pentadbir maktab untuk reset kata laluan. 🔑"),
    ("reset kata laluan", "Cuba pautan 'Lupa kata laluan' pada skrin log masuk. Jika tiada, hubungi pentadbir maktab untuk bantuan reset. 📧"),
    # Bas & tiket
    ("tiket bas", "Tiket bas boleh dilihat dan diurus dalam menu Bas / Bus Tickets. Pilih anak dan lihat tiket atau tempahan. 🚌"),
    ("bas", "Menu Bas (Bus Tickets) dalam portal untuk urusan tiket dan perjalanan bas pelajar. Log masuk dan pilih menu berkaitan bas. 🚍"),
    # Hostel & asrama
    ("hostel", "Modul hostel/asrama untuk pelajar dan warden. Ibu bapa boleh rujuk notis atau hubungi warden jika ada soalan berkaitan asrama. 🏫"),
    ("asrama", "Maklumat asrama diurus dalam modul hostel. Untuk soalan khusus asrama, hubungi warden atau pentadbir maktab. 🛏️"),
    # Tarikh & deadline
    ("tarikh akhir bayaran", "Tarikh akhir bayaran ikut notis dan surat daripada maktab. Semak dalam portal Pusat Bayaran dan notis yang dihantar. 📅"),
    ("bila perlu bayar", "Bayar mengikut tarikh yang diberi oleh maktab. Semak yuran tertunggak di Pusat Bayaran dan notis dalam portal. ⏰"),
    # Koperasi (kedai)
    ("koperasi beli", "Koperasi dalam portal boleh digunakan untuk pesanan/pembelian mengikut kemudahan maktab. Buka menu Koperasi untuk maklumat. 🛒"),
    ("beli koperasi", "Menu Koperasi menyediakan perkhidmatan pesanan. Log masuk dan pilih menu Koperasi untuk lihat produk dan cara pesan. 📦"),
    # Bantuan & hubungi
    ("bantuan", "Untuk bantuan teknikal atau soalan khusus, sila hubungi pentadbir maktab. Anda juga boleh gunakan menu dalam portal (Pusat Bayaran, Sedekah, dll). 📞"),
    ("hubungi", "Hubungi pentadbir atau pejabat maktab untuk soalan yang tidak terjawab dalam portal. Maklumat perhubungan biasanya dalam notis maktab. 📩"),
    ("siapa yang boleh saya hubungi", "Sila hubungi pentadbir maktab atau pejabat MRSM untuk bantuan. Gunakan menu Pusat Bayaran, Sedekah dan soalan lazim dalam chat ini dahulu. 🙏"),
    # Fallback umum (kata pendek)
    ("yuran", "Untuk maklumat yuran, sila pergi ke menu 'Pusat Bayaran'. Di sana anda boleh lihat yuran tertunggak dan membuat pembayaran. 💵"),
    ("daftar", "Untuk mendaftar anak, klik 'Tambah Anak' dan isi No. Matrik, Nama, Tingkatan, Kelas, Blok, Bilik, Negeri. Admin akan sahkan. 📋"),
    ("bayar", "Pembayaran melalui FPX atau Kad Kredit/Debit. Di Pusat Bayaran pilih yuran dan klik 'Bayar Sekarang'. 💳"),
]

@app.post("/api/ai/chat", response_model=AIChatResponse)
async def ai_chat(
    request: AIChatRequest,
    current_user: dict = Depends(get_current_user),
):
    """AI Assistant chat endpoint (keyword-based). Hanya untuk ibu bapa sahaja."""
    if current_user.get("role") != "parent":
        raise HTTPException(
            status_code=403,
            detail="Perkhidmatan AI hanya untuk ibu bapa sahaja."
        )
    session_id = request.session_id or str(uuid.uuid4())
    msg_lower = request.message.lower().strip()
    history = request.history or []

    # Dapatkan mesej terakhir pembantu untuk konteks bebual (follow-up)
    last_assistant = None
    for m in reversed(history):
        if isinstance(m, dict) and m.get("role") == "assistant":
            last_assistant = (m.get("content") or "").lower()
            break

    response_text = None

    # Salam & sapaan mesra — utamakan supaya chatbox lebih friendly
    if any(s in msg_lower for s in ("assalamualaikum", "assalamu'alaikum", "salam", "waalaikumsalam", "as salam")):
        response_text = "Waalaikumussalam warahmatullahi wabarakatuh. 😊 Apa yang boleh saya bantu hari ini?"
    elif any(s in msg_lower for s in ("selamat sejahtera", "selamat pagi", "selamat petang", "selamat malam", "good morning", "good afternoon", "good evening")):
        response_text = "Selamat sejahtera. Terima kasih kerana menghubungi. Apa yang boleh saya bantu?"
    elif any(s in msg_lower for s in ("apa khabar", "macam mana", "how are you", "apa cerita")):
        response_text = "Alhamdulillah, khabar baik. Terima kasih bertanya! 🙏 Ada soalan tentang yuran, pendaftaran anak atau portal? Saya sedia membantu."
    elif any(s in msg_lower for s in ("hi", "hello", "helo", "hai")):
        response_text = "Helo! 👋 Saya Pembantu AI MRSMKU. Anda boleh tanya tentang yuran, daftar anak, bayaran atau sedekah. Apa yang boleh saya bantu?"
    elif msg_lower.strip() in ("yes", "ya", "ok", "okay", "baik", "faham") and len(msg_lower) < 15:
        response_text = "Baik. Jika ada soalan lain tentang portal MRSMKU, tanya sahaja. 😊"

    follow_ups = ("ok", "bagaimana", "terima kasih", "thanks", "lagi", "boleh terangkan", "faham", "baik", "okay")
    # Jawapan konteks untuk follow-up pendek (bebual)
    if response_text is None and last_assistant and any(f in msg_lower for f in follow_ups) and len(msg_lower) < 80:
        if "yuran" in last_assistant or "tunggak" in last_assistant or "bayar" in last_assistant:
            response_text = "Anda boleh bayar melalui menu Pusat Bayaran > pilih anak > Bayar Sekarang. Pembayaran melalui FPX atau kad. Ada soalan lain? 🙏"
        elif "daftar" in last_assistant or "tambah anak" in last_assistant:
            response_text = "Di dashboard ibu bapa, klik 'Tambah Anak' dan isi No. Matrik, nama, tingkatan, kelas. Admin akan sahkan. Perlu bantuan lain? 😊"
        elif "sedekah" in last_assistant:
            response_text = "Buka menu Sedekah, pilih kempen, masukkan jumlah dan selesaikan pembayaran. Terima kasih kerana menyumbang! 🙏"
        elif "terima kasih" in msg_lower or "thanks" in msg_lower:
            response_text = "Sama-sama! Jika ada soalan lain tentang yuran atau portal, tanya sahaja. 😊"

    # Ibu bapa bertanya yuran tertunggak anak → beri ringkasan sebenar
    if response_text is None and any(k in msg_lower for k in ("yuran", "tunggak", "tertunggak", "anak", "bayar", "tunggakan")):
        summary = await _get_parent_children_fee_summary(current_user["_id"])
        if summary:
            parts = []
            for s in summary:
                out = s["outstanding"]
                if out > 0:
                    parts.append(f"**{s['student_name']}**: RM {out:.2f} tertunggak (dibayar RM {s['paid_amount']:.2f} daripada RM {s['total_fees']:.2f})")
                else:
                    parts.append(f"**{s['student_name']}**: Tiada tunggakan (RM {s['total_fees']:.2f} telah diselesaikan).")
            response_text = "Ringkasan yuran anak anda:\n\n" + "\n\n".join(parts) + "\n\nAnda boleh bayar melalui menu Pusat Bayaran dalam portal."
        else:
            response_text = "Tiada rekod yuran anak dijumpai. Sila pastikan anak telah didaftarkan dan yuran telah dijana."
    if response_text is None:
        # Ambil jawapan dari MongoDB (chatbox_responses), fallback ke AI_CHAT_DATASET jika kosong
        try:
            cursor = db.chatbox_responses.find({}).sort("order", 1)
            db_responses = await cursor.to_list(length=500)
        except Exception:
            db_responses = []
        if db_responses:
            for doc in db_responses:
                kw = (doc.get("keyword") or "").strip().lower()
                if kw and kw in msg_lower:
                    response_text = doc.get("response") or ""
                    break
        if response_text is None:
            for key, resp in AI_CHAT_DATASET:
                if key in msg_lower:
                    response_text = resp
                    break
    if not response_text:
        response_text = (
            "Terima kasih atas mesej anda. Saya Pembantu AI MRSMKU — saya boleh bantu soalan tentang yuran, daftar anak, bayaran dan sedekah. "
            "Sila rujuk tab FAQ di atas untuk soalan lazim, atau taip soalan anda. Jika perlu bantuan lanjut, hubungi pentadbir maktab. 🙏"
        )

    try:
        await db.ai_chat_history.insert_many([
            {
                "session_id": session_id,
                "role": "user",
                "content": request.message,
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "session_id": session_id,
                "role": "assistant",
                "content": response_text,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
        ])
    except Exception:
        pass  # Non-critical if history save fails

    return AIChatResponse(response=response_text, session_id=session_id)

# Soalan lazim untuk menu chatbox (pelbagai supaya pengguna tak bosan)
AI_CHAT_SUGGESTIONS = [
    "Yuran anak saya",
    "Berapa jumlah yuran setahun?",
    "Apakah jenis yuran yang perlu dibayar?",
    "Bagaimana cara mendaftar anak saya?",
    "Bagaimana cara membuat pembayaran?",
    "Boleh bayar dengan FPX?",
    "Apa itu MARAEPS?",
    "Apa itu kempen sedekah?",
    "Bagaimana pelajar log masuk?",
    "Di mana saya boleh lihat tiket bas?",
    "Apa itu Koperasi dalam portal?",
    "Bila tarikh akhir bayaran yuran?",
    "Bagaimana nak reset kata laluan?",
    "Siapa yang boleh saya hubungi untuk bantuan?",
]

@app.get("/api/ai/suggestions")
async def get_ai_suggestions():
    """Get suggested questions from MongoDB (chatbox_suggestions)."""
    try:
        cursor = db.chatbox_suggestions.find({}).sort("order", 1)
        docs = await cursor.to_list(length=100)
        suggestions = [x.get("text", "") for x in docs if x.get("text")]
    except Exception:
        suggestions = AI_CHAT_SUGGESTIONS
    if not suggestions:
        suggestions = AI_CHAT_SUGGESTIONS
    return {"suggestions": suggestions}

# SOP Urusan Pelajar Harian (FAQ chatbox)
SOP_FAQ_QUESTION = "SOP Urusan Pelajar Harian?"
SOP_FAQ_ANSWER = """SOP URUSAN PELAJAR HARIAN:

1. Berurusan dengan Guru Asrama Bertugas Harian dahulu seperti jadual tugasan bulanan.

2. Berurusan dengan Guru Asrama - Blok pelajar terlibat (JA / JB / JC / I / H / G / F / E) sekiranya Guru Asrama Bertugas Harian tidak dapat dihubungi.

3. Berurusan dengan Ketua Guru Asrama (KGA) sekiranya Guru Asrama - Blok pelajar terlibat (JA / JB / JC / I / H / G / F / E) tidak dapat dihubungi.

4. Berurusan dengan Timbalan Pengetua Pembangunan Pelajar (TPPP) sekiranya KGA tidak dapat dihubungi."""

# Senarai FAQ untuk tab dalam chatbox (soalan + jawapan ringkas)
AI_FAQ_LIST = [
    {"q": "Berapa jumlah yuran setahun?", "a": "RM1,007.00 setahun (Muafakat RM897 + Koperasi RM110). Wang Pendaftaran dan Caruman dibayar melalui MARAEPS."},
    {"q": "Apakah jenis yuran dalam portal?", "a": "Dua kategori: Muafakat (RM897 — 5 pecahan termasuk dana kecemerlangan, buku, program motivasi, graduasi) dan Koperasi (RM110 — perkhidmatan dobi)."},
    {"q": "Bagaimana cara mendaftar anak?", "a": "Log masuk > klik 'Tambah Anak' > isi No. Matrik, Nama, Tingkatan, Kelas, Blok, Bilik, Negeri. Admin akan sahkan sebelum yuran dijana."},
    {"q": "Bagaimana cara membuat pembayaran?", "a": "Pergi ke Pusat Bayaran > pilih anak > pilih yuran > Bayar Sekarang. Kaedah: FPX atau Kad Kredit/Debit."},
    {"q": "Boleh bayar dengan FPX?", "a": "Ya. Pilih yuran di Pusat Bayaran, klik Bayar Sekarang, lalu pilih FPX."},
    {"q": "Apa itu MARAEPS?", "a": "Sistem lain untuk Wang Pendaftaran dan Wang Caruman. Bayaran tersebut tidak dibuat dalam portal MRSMKU; ikut arahan maktab."},
    {"q": "Apa itu kempen sedekah?", "a": "Tabung sumbangan dalam portal. Pilih kempen, masukkan jumlah dan bayar melalui FPX atau kad."},
    {"q": "Bagaimana pelajar log masuk?", "a": "Pelajar biasanya guna No. Matrik atau No. IC. Ibu bapa guna emel dan kata laluan."},
    {"q": "Di mana lihat tiket bas?", "a": "Dalam menu Bas / Bus Tickets. Pilih anak untuk lihat tiket atau tempahan."},
    {"q": "Apa itu Koperasi dalam portal?", "a": "Yuran Koperasi RM110 (dobi). Portal juga ada menu Koperasi untuk pesanan mengikut kemudahan maktab."},
    {"q": "Bila tarikh akhir bayaran?", "a": "Ikut notis dan surat maktab. Semak di Pusat Bayaran dan notis dalam portal."},
    {"q": "Lupa kata laluan?", "a": "Gunakan pautan 'Lupa kata laluan' di halaman log masuk, atau hubungi pentadbir maktab."},
    {"q": "Siapa yang boleh dihubungi untuk bantuan?", "a": "Hubungi pentadbir maktab atau pejabat MRSM. Anda juga boleh gunakan Pusat Bayaran dan soalan lazim dalam chat."},
    {"q": SOP_FAQ_QUESTION, "a": SOP_FAQ_ANSWER},
]


async def _seed_chatbox_collections():
    """Seed chatbox_faq, chatbox_responses & chatbox_suggestions sekali sahaja (dipanggil dari lifespan).
    Kosong: isi penuh. Sedia ada: pastikan SOP FAQ wujud sahaja. Elak panggilan berulang & data duplicate."""
    try:
        faq_count = await db.chatbox_faq.count_documents({})
        if faq_count == 0:
            for i, item in enumerate(AI_FAQ_LIST):
                await db.chatbox_faq.insert_one({
                    "question": item["q"],
                    "answer": item["a"],
                    "order": i,
                })
        else:
            # Pastikan FAQ SOP Urusan Pelajar Harian wujud (untuk DB sedia ada)
            existing_sop = await db.chatbox_faq.find_one({"question": SOP_FAQ_QUESTION})
            if not existing_sop:
                max_order = await db.chatbox_faq.find_one(sort=[("order", -1)])
                next_order = (max_order["order"] + 1) if max_order and "order" in max_order else 999
                await db.chatbox_faq.insert_one({
                    "question": SOP_FAQ_QUESTION,
                    "answer": SOP_FAQ_ANSWER,
                    "order": next_order,
                })
        resp_count = await db.chatbox_responses.count_documents({})
        if resp_count == 0:
            for i, (keyword, response) in enumerate(AI_CHAT_DATASET):
                await db.chatbox_responses.insert_one({
                    "keyword": keyword,
                    "response": response,
                    "order": i,
                })
        # Soalan cadangan (untuk API jika digunakan)
        sug_count = await db.chatbox_suggestions.count_documents({})
        if sug_count == 0 and AI_CHAT_SUGGESTIONS:
            for i, s in enumerate(AI_CHAT_SUGGESTIONS):
                await db.chatbox_suggestions.insert_one({"text": s, "order": i})
    except Exception:
        pass


@app.get("/api/ai/faq")
async def get_ai_faq():
    """Get FAQ list for chatbox tab from MongoDB (chatbox_faq). Termasuk lampiran jika ada."""
    cursor = db.chatbox_faq.find({}).sort("order", 1)
    items = await cursor.to_list(length=200)
    faq = []
    base_url = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or ""
    for x in items:
        attachments = x.get("attachments") or []
        faq.append({
            "q": x.get("question", ""),
            "a": x.get("answer", ""),
            "attachments": [{"url": (base_url + a["url"]) if a.get("url", "").startswith("/") else a["url"], "original_name": a.get("original_name", "")} for a in attachments],
        })
    return {"faq": faq}

# ============ MYDIGITAL ID SETTINGS ============

class MyDigitalIDSettings(BaseModel):
    action: str
    url: str
    nonce: str

@app.get("/api/settings/mydigitalid")
async def get_mydigitalid_settings():
    """Get MyDigital ID settings (public endpoint for login page)"""
    settings = await db.settings.find_one({"key": "mydigitalid"})
    if settings:
        return {
            "enabled": True,
            "action": settings.get("action", ""),
            "url": settings.get("url", ""),
            "nonce": settings.get("nonce", "")
        }
    return {"enabled": False, "action": "", "url": "", "nonce": ""}

@app.post("/api/settings/mydigitalid")
async def save_mydigitalid_settings(
    settings: MyDigitalIDSettings,
    current_user: dict = Depends(require_roles("superadmin"))
):
    """Save MyDigital ID settings (SuperAdmin only)"""
    await db.settings.update_one(
        {"key": "mydigitalid"},
        {"$set": {
            "key": "mydigitalid",
            "action": settings.action,
            "url": settings.url,
            "nonce": settings.nonce,
            "updated_by": str(current_user["_id"]),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    await log_audit(current_user, "UPDATE_SETTINGS", "settings", "Kemaskini tetapan MyDigital ID")
    return {"message": "Tetapan MyDigital ID disimpan", "success": True}

@app.delete("/api/settings/mydigitalid")
async def delete_mydigitalid_settings(
    current_user: dict = Depends(require_roles("superadmin"))
):
    """Delete MyDigital ID settings (SuperAdmin only)"""
    await db.settings.delete_one({"key": "mydigitalid"})
    await log_audit(current_user, "DELETE_SETTINGS", "settings", "Padam tetapan MyDigital ID")
    return {"message": "Tetapan MyDigital ID dipadam", "success": True}

@app.post("/api/auth/mydigitalid/mock-login")
async def mydigitalid_mock_login():
    """Mock MyDigital ID login - returns a demo parent token"""
    # Find or create a demo parent user
    demo_user = await db.users.find_one({"email": "demo.mydigitalid@muafakat.link"})
    
    if not demo_user:
        # Create demo user for MyDigital ID
        demo_doc = {
            "email": "demo.mydigitalid@muafakat.link",
            "password": pwd_context.hash("mydigitalid123"),
            "full_name": "Pengguna Demo MyDigital ID",
            "phone": "0123456789",
            "ic_number": "880101-01-1234",
            "role": "parent",
            "is_active": True,
            "auth_method": "mydigitalid",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        result = await db.users.insert_one(demo_doc)
        demo_doc["_id"] = result.inserted_id
        demo_user = demo_doc
    
    await log_audit(demo_user, "LOGIN_MYDIGITALID", "auth", "Log masuk melalui MyDigital ID (Mock)")
    
    token = create_access_token({"sub": str(demo_user["_id"])})
    return TokenResponse(access_token=token, token_type="bearer", user=serialize_user(demo_user))

# ============ EMAIL SETTINGS (RESEND) ============

@app.get("/api/settings/email")
async def get_email_settings(current_user: dict = Depends(get_current_user)):
    """Get email settings"""
    if current_user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    settings = await db.settings.find_one({"type": "email"}, {"_id": 0})
    if settings:
        if settings.get("api_key"):
            key = settings["api_key"]
            settings["api_key_masked"] = f"{key[:8]}...{key[-4:]}" if len(key) > 12 else "***"
            del settings["api_key"]
        return {"enabled": True, **settings}
    return {"enabled": False}

@app.post("/api/settings/email")
async def save_email_settings(settings: dict, current_user: dict = Depends(get_current_user)):
    """Save email settings"""
    if current_user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    api_key = settings.get("api_key", "")
    sender_email = settings.get("sender_email", "")
    sender_name = settings.get("sender_name", "Portal MRSMKU")
    
    if not api_key.startswith("re_"):
        raise HTTPException(status_code=400, detail="API Key tidak sah. Mesti bermula dengan 're_'")
    
    await db.settings.update_one(
        {"type": "email"},
        {"$set": {
            "type": "email",
            "api_key": api_key,
            "sender_email": sender_email,
            "sender_name": sender_name,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current_user.get("id")
        }},
        upsert=True
    )
    
    await log_audit(current_user, "EMAIL_SETTINGS_UPDATED", "settings", "Email settings updated")
    return {"message": "Tetapan email berjaya disimpan"}

@app.delete("/api/settings/email")
async def delete_email_settings(current_user: dict = Depends(get_current_user)):
    """Delete email settings"""
    if current_user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    await db.settings.delete_one({"type": "email"})
    await log_audit(current_user, "EMAIL_SETTINGS_DELETED", "settings", "Email settings deleted")
    return {"message": "Tetapan email dipadam"}


@app.get("/api/settings/email-status")
async def get_email_status(current_user: dict = Depends(get_current_user)):
    """Status penyedia e-mel: SES, Resend, SMTP (env atau tetapan DB), atau mod dev. Hanya superadmin/admin."""
    if current_user.get("role") not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    try:
        from services.email_service import (
            RESEND_ENABLED,
            SMTP_ENABLED,
            get_smtp_config_from_db,
            get_ses_config_from_db,
        )
    except ImportError:
        RESEND_ENABLED = False
        SMTP_ENABLED = False
        get_smtp_config_from_db = None
        get_ses_config_from_db = None
    try:
        from services.ses_service import SES_ENABLED
    except ImportError:
        SES_ENABLED = False
    smtp_from_db = False
    ses_from_db = False
    if get_smtp_config_from_db:
        try:
            smtp_from_db = await get_smtp_config_from_db(db) is not None
        except Exception:
            pass
    if get_ses_config_from_db:
        try:
            ses_from_db = await get_ses_config_from_db(db) is not None
        except Exception:
            pass
    smtp_enabled = SMTP_ENABLED or smtp_from_db
    ses_enabled = SES_ENABLED or ses_from_db
    dev_mode = not RESEND_ENABLED and not ses_enabled and not smtp_enabled
    if ses_enabled:
        msg = "SES dikonfigurasi melalui tetapan di bawah atau env (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, SENDER_EMAIL)."
    elif RESEND_ENABLED:
        msg = "Resend dikonfigurasi melalui tab Email atau RESEND_API_KEY."
    elif smtp_enabled:
        msg = "SMTP dikonfigurasi melalui tetapan di bawah (atau env SMTP_*). Sesuai untuk localhost (Mailtrap, MailHog, Gmail)."
    else:
        msg = "Tiada penyedia dikonfigurasi. Simpan tetapan SES atau SMTP di bawah, atau set env. E-mel dilog ke konsol (mod dev)."
    return {
        "resend_enabled": RESEND_ENABLED,
        "ses_enabled": ses_enabled,
        "ses_from_db": ses_from_db,
        "smtp_enabled": smtp_enabled,
        "smtp_from_db": smtp_from_db,
        "dev_mode": dev_mode,
        "message": msg,
    }


@app.get("/api/settings/ses")
async def get_ses_settings(current_user: dict = Depends(get_current_user)):
    """Dapatkan tetapan AWS SES (rahsia disamarkan). Superadmin/admin sahaja."""
    if current_user.get("role") not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    doc = await db.settings.find_one({"type": "ses"}, {"_id": 0})
    if not doc:
        return {"enabled": False}
    out = {
        "enabled": bool(doc.get("access_key_id") and doc.get("secret_access_key")),
        "access_key_id": doc.get("access_key_id", ""),
        "region": doc.get("region", "ap-southeast-1"),
        "sender_email": doc.get("sender_email", ""),
    }
    if doc.get("secret_access_key"):
        out["secret_access_key_masked"] = "••••••••"
    return out


@app.post("/api/settings/ses")
async def save_ses_settings(body: dict, current_user: dict = Depends(get_current_user)):
    """Simpan tetapan AWS SES. Superadmin/admin sahaja."""
    if current_user.get("role") not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    access_key_id = (body.get("access_key_id") or "").strip()
    secret_access_key = body.get("secret_access_key") or ""
    region = (body.get("region") or "ap-southeast-1").strip()
    sender_email = (body.get("sender_email") or "").strip()
    if not access_key_id:
        raise HTTPException(status_code=400, detail="Access Key ID wajib")
    if not secret_access_key:
        existing = await db.settings.find_one({"type": "ses"})
        if existing and existing.get("secret_access_key"):
            secret_access_key = existing["secret_access_key"]
        else:
            raise HTTPException(status_code=400, detail="Secret Access Key wajib")
    update = {
        "type": "ses",
        "access_key_id": access_key_id,
        "secret_access_key": secret_access_key,
        "region": region,
        "sender_email": sender_email or None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": str(current_user.get("id", current_user.get("_id", ""))),
    }
    await db.settings.update_one({"type": "ses"}, {"$set": update}, upsert=True)
    await log_audit(current_user, "SES_SETTINGS_UPDATED", "settings", "SES settings updated")
    return {"message": "Tetapan AWS SES disimpan"}


@app.delete("/api/settings/ses")
async def delete_ses_settings(current_user: dict = Depends(get_current_user)):
    """Padam tetapan AWS SES. Superadmin/admin sahaja."""
    if current_user.get("role") not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    await db.settings.delete_one({"type": "ses"})
    await log_audit(current_user, "SES_SETTINGS_DELETED", "settings", "SES settings deleted")
    return {"message": "Tetapan AWS SES dipadam"}


@app.get("/api/settings/smtp")
async def get_smtp_settings(current_user: dict = Depends(get_current_user)):
    """Dapatkan tetapan SMTP (kata laluan disamarkan). Superadmin/admin sahaja."""
    if current_user.get("role") not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    doc = await db.settings.find_one({"type": "smtp"}, {"_id": 0})
    if not doc:
        return {"enabled": False}
    out = {
        "enabled": bool(doc.get("host") and doc.get("user") and doc.get("password")),
        "host": doc.get("host", ""),
        "port": doc.get("port", 587),
        "user": doc.get("user", ""),
        "use_tls": doc.get("use_tls", True),
        "sender_email": doc.get("sender_email", ""),
    }
    if doc.get("password"):
        out["password_masked"] = "••••••••"
    return out


@app.post("/api/settings/smtp")
async def save_smtp_settings(body: dict, current_user: dict = Depends(get_current_user)):
    """Simpan tetapan SMTP. Superadmin/admin sahaja."""
    if current_user.get("role") not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    host = (body.get("host") or "").strip()
    port = int(body.get("port") or 587)
    user = (body.get("user") or "").strip()
    password = body.get("password") or ""
    use_tls = body.get("use_tls", True)
    sender_email = (body.get("sender_email") or "").strip()
    if not host or not user:
        raise HTTPException(status_code=400, detail="Host dan User SMTP wajib")
    if not password:
        existing = await db.settings.find_one({"type": "smtp"})
        if existing and existing.get("password"):
            password = existing["password"]
        else:
            raise HTTPException(status_code=400, detail="Kata laluan SMTP wajib")
    update = {
        "type": "smtp",
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "use_tls": use_tls,
        "sender_email": sender_email or None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": str(current_user.get("id", current_user.get("_id", ""))),
    }
    await db.settings.update_one({"type": "smtp"}, {"$set": update}, upsert=True)
    await log_audit(current_user, "SMTP_SETTINGS_UPDATED", "settings", "SMTP settings updated")
    return {"message": "Tetapan SMTP disimpan"}


@app.delete("/api/settings/smtp")
async def delete_smtp_settings(current_user: dict = Depends(get_current_user)):
    """Padam tetapan SMTP. Superadmin/admin sahaja."""
    if current_user.get("role") not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    await db.settings.delete_one({"type": "smtp"})
    await log_audit(current_user, "SMTP_SETTINGS_DELETED", "settings", "SMTP settings deleted")
    return {"message": "Tetapan SMTP dipadam"}


@app.post("/api/settings/email/test")
async def test_email(request: dict, current_user: dict = Depends(get_current_user)):
    """Send test email"""
    import resend
    import asyncio
    
    if current_user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    recipient_email = request.get("recipient_email")
    if not recipient_email:
        raise HTTPException(status_code=400, detail="Email penerima diperlukan")
    
    settings = await db.settings.find_one({"type": "email"}, {"_id": 0})
    if not settings or not settings.get("api_key"):
        raise HTTPException(status_code=400, detail="Tetapan email belum dikonfigurasi")
    
    resend.api_key = settings["api_key"]
    
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #4F46E5, #7C3AED); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">Portal MRSMKU</h1>
        </div>
        <div style="padding: 30px; background: #f8fafc;">
            <h2 style="color: #1e293b;">Email Ujian Berjaya!</h2>
            <p style="color: #475569;">
                Tahniah! Konfigurasi email Resend anda berfungsi dengan baik.
            </p>
            <p style="color: #475569;">
                Email ini dihantar dari Portal MRSMKU untuk menguji integrasi Resend.
            </p>
            <div style="margin-top: 20px; padding: 15px; background: #e0f2fe; border-radius: 8px;">
                <p style="color: #0369a1; margin: 0;">
                    <strong>Masa dihantar:</strong> {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}
                </p>
            </div>
        </div>
        <div style="padding: 20px; background: #1e293b; text-align: center;">
            <p style="color: #94a3b8; margin: 0; font-size: 12px;">
                &copy; 2026 Portal MRSMKU - Sistem Pengurusan Sekolah Bersepadu
            </p>
        </div>
    </div>
    """
    
    params = {
        "from": f"{settings.get('sender_name', 'Portal MRSMKU')} <{settings['sender_email']}>",
        "to": [recipient_email],
        "subject": "Email Ujian - Portal MRSMKU",
        "html": html_content
    }
    
    try:
        email = await asyncio.to_thread(resend.Emails.send, params)
        
        await db.email_logs.insert_one({
            "type": "test",
            "recipient": recipient_email,
            "status": "sent",
            "email_id": email.get("id"),
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "sent_by": current_user.get("id")
        })
        
        return {
            "status": "success",
            "message": f"Email ujian berjaya dihantar ke {recipient_email}",
            "email_id": email.get("id")
        }
    except Exception as e:
        error_msg = str(e)
        # Provide helpful error message for common issues
        if "domain is not verified" in error_msg.lower():
            raise HTTPException(
                status_code=400, 
                detail=f"Domain email pengirim ({settings['sender_email'].split('@')[-1]}) belum disahkan di Resend. Sila tambah dan sahkan domain anda di https://resend.com/domains atau gunakan domain yang telah disahkan."
            )
        raise HTTPException(status_code=500, detail=f"Gagal menghantar email: {error_msg}")

# ============ BUS TICKET MANAGEMENT SYSTEM ============

# Import bus routes and models
from models.bus import (
    BusCompanyCreate, BusCompanyUpdate, BusCompanyResponse, BusCompanyApproval,
    BusCreate, BusUpdate, BusResponse,
    RouteCreate, RouteUpdate, RouteResponse, DropOffPoint,
    TripCreate, TripUpdate, TripResponse,
    BookingCreate, BookingUpdate, BookingResponse,
    VendorRegistrationCreate, VendorRegistrationResponse
)
from routes import bus as bus_routes
from routes import koperasi as koperasi_routes
from models.koperasi import (
    KoopKitCreate, KoopKitUpdate,
    KoopProductCreate, KoopProductUpdate,
    AddToCartRequest, AddKitToCartRequest, KoopOrderCreate, ProductSize, SizeType
)

# --- BUS COMPANY ENDPOINTS ---

@app.get("/api/bus/companies", response_model=List[BusCompanyResponse])
async def get_bus_companies(
    is_active: Optional[bool] = None,
    is_verified: Optional[bool] = None,
    application_status: Optional[str] = None,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bus_admin"))
):
    """Get all bus companies (filter by application_status: pending, approved, rejected, need_documents)"""
    return await bus_routes.get_bus_companies(db, is_active, is_verified, application_status)

@app.post("/api/bus/companies", response_model=BusCompanyResponse)
async def create_bus_company(
    data: BusCompanyCreate,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bus_admin"))
):
    """Create new bus company"""
    result = await bus_routes.create_bus_company(db, data, str(current_user["_id"]))
    await log_audit(current_user, "CREATE_BUS_COMPANY", "bus", f"Cipta syarikat bas: {data.name}")
    return result

@app.post("/api/bus/companies/register", response_model=BusCompanyResponse)
async def register_bus_company_public(data: BusCompanyCreate):
    """Pendaftaran syarikat bas oleh syarikat sendiri (awam, tanpa login). Status = Pending; Admin Bas akan lulus kemudian."""
    return await bus_routes.create_bus_company_public(db, data)

@app.get("/api/bus/companies/{company_id}", response_model=BusCompanyResponse)
async def get_bus_company(
    company_id: str,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bus_admin"))
):
    """Get single bus company"""
    return await bus_routes.get_bus_company(db, company_id)

@app.put("/api/bus/companies/{company_id}", response_model=BusCompanyResponse)
async def update_bus_company(
    company_id: str,
    data: BusCompanyUpdate,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bus_admin"))
):
    """Update bus company"""
    result = await bus_routes.update_bus_company(db, company_id, data)
    await log_audit(current_user, "UPDATE_BUS_COMPANY", "bus", f"Kemaskini syarikat bas: {company_id}")
    return result

@app.patch("/api/bus/companies/{company_id}/approve", response_model=BusCompanyResponse)
async def approve_bus_company(
    company_id: str,
    data: BusCompanyApproval,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bus_admin"))
):
    """Admin Bas: Lulus / Ditolak / Perlu Dokumen Tambahan permohonan syarikat"""
    result = await bus_routes.approve_bus_company(
        db, company_id, data.application_status, data.officer_notes, str(current_user["_id"])
    )
    await log_audit(current_user, "APPROVE_BUS_COMPANY", "bus", f"Status {data.application_status}: {company_id}")
    return result

@app.delete("/api/bus/companies/{company_id}")
async def delete_bus_company(
    company_id: str,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bus_admin"))
):
    """Delete bus company"""
    result = await bus_routes.delete_bus_company(db, company_id)
    await log_audit(current_user, "DELETE_BUS_COMPANY", "bus", f"Padam syarikat bas: {company_id}")
    return result

# --- BUS ENDPOINTS ---

@app.get("/api/bus/buses", response_model=List[BusResponse])
async def get_buses(
    company_id: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bus_admin"))
):
    """Get all buses"""
    return await bus_routes.get_buses(db, company_id, is_active)

@app.post("/api/bus/buses", response_model=BusResponse)
async def create_bus(
    data: BusCreate,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bus_admin"))
):
    """Create new bus"""
    result = await bus_routes.create_bus(db, data, str(current_user["_id"]))
    await log_audit(current_user, "CREATE_BUS", "bus", f"Daftar bas: {data.plate_number}")
    return result

@app.get("/api/bus/buses/{bus_id}", response_model=BusResponse)
async def get_bus(
    bus_id: str,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bus_admin"))
):
    """Get single bus"""
    return await bus_routes.get_bus(db, bus_id)

@app.put("/api/bus/buses/{bus_id}", response_model=BusResponse)
async def update_bus(
    bus_id: str,
    data: BusUpdate,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bus_admin"))
):
    """Update bus"""
    result = await bus_routes.update_bus(db, bus_id, data)
    await log_audit(current_user, "UPDATE_BUS", "bus", f"Kemaskini bas: {bus_id}")
    return result

@app.delete("/api/bus/buses/{bus_id}")
async def delete_bus(
    bus_id: str,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bus_admin"))
):
    """Delete bus"""
    result = await bus_routes.delete_bus(db, bus_id)
    await log_audit(current_user, "DELETE_BUS", "bus", f"Padam bas: {bus_id}")
    return result

# --- ROUTE ENDPOINTS ---

@app.get("/api/bus/routes", response_model=List[RouteResponse])
async def get_bus_routes(
    company_id: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bus_admin"))
):
    """Get all bus routes"""
    return await bus_routes.get_routes(db, company_id, is_active)

@app.post("/api/bus/routes", response_model=RouteResponse)
async def create_bus_route(
    data: RouteCreate,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bus_admin"))
):
    """Create new bus route"""
    result = await bus_routes.create_route(db, data, str(current_user["_id"]))
    await log_audit(current_user, "CREATE_ROUTE", "bus", f"Cipta route: {data.name}")
    return result

@app.get("/api/bus/routes/{route_id}", response_model=RouteResponse)
async def get_bus_route(
    route_id: str,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bus_admin"))
):
    """Get single bus route"""
    return await bus_routes.get_route(db, route_id)

@app.put("/api/bus/routes/{route_id}", response_model=RouteResponse)
async def update_bus_route(
    route_id: str,
    data: RouteUpdate,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bus_admin"))
):
    """Update bus route"""
    result = await bus_routes.update_route(db, route_id, data)
    await log_audit(current_user, "UPDATE_ROUTE", "bus", f"Kemaskini route: {route_id}")
    return result

@app.delete("/api/bus/routes/{route_id}")
async def delete_bus_route(
    route_id: str,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bus_admin"))
):
    """Delete bus route"""
    result = await bus_routes.delete_route(db, route_id)
    await log_audit(current_user, "DELETE_ROUTE", "bus", f"Padam route: {route_id}")
    return result

# --- TRIP ENDPOINTS ---

@app.get("/api/bus/trips", response_model=List[TripResponse])
async def get_bus_trips(
    route_id: Optional[str] = None,
    bus_id: Optional[str] = None,
    company_id: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bus_admin"))
):
    """Get all bus trips"""
    return await bus_routes.get_trips(db, route_id, bus_id, company_id, status, date_from, date_to)

@app.post("/api/bus/trips", response_model=TripResponse)
async def create_bus_trip(
    data: TripCreate,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bus_admin"))
):
    """Create new bus trip"""
    result = await bus_routes.create_trip(db, data, str(current_user["_id"]))
    await log_audit(current_user, "CREATE_TRIP", "bus", f"Cipta trip: {data.departure_date}")
    return result

@app.get("/api/bus/trips/{trip_id}", response_model=TripResponse)
async def get_bus_trip(
    trip_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get single bus trip"""
    return await bus_routes.get_trip(db, trip_id)

@app.put("/api/bus/trips/{trip_id}", response_model=TripResponse)
async def update_bus_trip(
    trip_id: str,
    data: TripUpdate,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bus_admin"))
):
    """Update bus trip"""
    result = await bus_routes.update_trip(db, trip_id, data)
    await log_audit(current_user, "UPDATE_TRIP", "bus", f"Kemaskini trip: {trip_id}")
    return result

@app.post("/api/bus/trips/{trip_id}/cancel")
async def cancel_bus_trip(
    trip_id: str,
    reason: Optional[str] = None,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bus_admin"))
):
    """Cancel bus trip"""
    result = await bus_routes.cancel_trip(db, trip_id, reason)
    await log_audit(current_user, "CANCEL_TRIP", "bus", f"Batal trip: {trip_id}")
    return result

@app.get("/api/bus/trips/{trip_id}/seats")
async def get_trip_seat_map(
    trip_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get seat map for a trip"""
    return await bus_routes.get_trip_seat_map(db, trip_id)

# --- DRIVER BAS ENDPOINTS ---

@app.get("/api/bus/driver/trips")
async def driver_get_my_trips(
    current_user: dict = Depends(require_roles("bus_driver"))
):
    """Driver Bas: senarai trip untuk bas yang ditugaskan (hari ini & akan datang)"""
    return await bus_routes.get_driver_trips(db, current_user)

@app.get("/api/bus/driver/trips/{trip_id}/students")
async def driver_get_trip_students(
    trip_id: str,
    current_user: dict = Depends(require_roles("bus_driver"))
):
    """Driver Bas: senarai pelajar menaiki bas + checkpoint drop-off"""
    return await bus_routes.get_trip_students_for_driver(db, trip_id, current_user)

@app.post("/api/bus/driver/location")
async def driver_update_location(
    trip_id: str = Body(..., embed=True),
    lat: float = Body(..., embed=True),
    lng: float = Body(..., embed=True),
    current_user: dict = Depends(require_roles("bus_driver"))
):
    """Driver Bas: hantar lokasi semasa (untuk peta live ibu bapa)"""
    return await bus_routes.update_bus_live_location(db, trip_id, lat, lng, current_user)

# --- LIVE LOCATION (untuk ibu bapa / peta) ---

@app.get("/api/bus/live-location/{trip_id}")
async def get_bus_live_location(trip_id: str):
    """Dapat lokasi bas semasa untuk trip (peta live). Ibu bapa guna trip_id dari tempahan."""
    loc = await bus_routes.get_bus_live_location(db, trip_id)
    return loc if loc else {}

@app.get("/api/bus/trips/{trip_id}/map-info")
async def get_trip_map_info(trip_id: str):
    """Maklumat trip untuk peta (route, drop-off, plat bas). Awam dengan trip_id."""
    info = await bus_routes.get_trip_for_live_map(db, trip_id)
    if not info:
        raise HTTPException(status_code=404, detail="Trip tidak dijumpai")
    return info

# --- BOOKING ENDPOINTS ---

@app.get("/api/bus/bookings", response_model=List[BookingResponse])
async def get_bus_bookings(
    trip_id: Optional[str] = None,
    student_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get bookings based on role"""
    if current_user["role"] == "parent":
        return await bus_routes.get_bookings(db, trip_id, student_id, str(current_user["_id"]), status)
    elif current_user["role"] in ["superadmin", "admin", "bus_admin"]:
        return await bus_routes.get_bookings(db, trip_id, student_id, None, status)
    else:
        raise HTTPException(status_code=403, detail="Akses ditolak")

@app.post("/api/bus/bookings", response_model=BookingResponse)
async def create_bus_booking(
    data: BookingCreate,
    current_user: dict = Depends(require_roles("parent", "pelajar"))
):
    """Create new booking (Parent or Student)"""
    # Check if hostel leave approval is required
    bus_settings = await db.settings.find_one({"type": "bus_booking"})
    require_leave_approval = bus_settings.get("require_leave_approval", False) if bus_settings else False
    
    if require_leave_approval:
        # Get student info
        student = await db.students.find_one({"_id": ObjectId(data.student_id)})
        if not student:
            # Check if pelajar user
            student = await db.users.find_one({"_id": ObjectId(data.student_id), "role": "pelajar"})
        
        if not student:
            raise HTTPException(status_code=404, detail="Pelajar tidak dijumpai")
        
        # Check for approved pulang bermalam
        trip = await db.bus_trips.find_one({"_id": ObjectId(data.trip_id)})
        if not trip:
            raise HTTPException(status_code=404, detail="Trip tidak dijumpai")
        
        departure_date = trip.get("departure_date", "")
        
        # Find approved pulang bermalam that covers this trip date
        approved_leave = await db.hostel_records.find_one({
            "student_id": ObjectId(data.student_id),
            "kategori": "pulang_bermalam",
            "status": "approved",
            "$or": [
                {"tarikh_keluar": {"$lte": departure_date}, "tarikh_pulang": {"$gte": departure_date}},
                {"tarikh_keluar": departure_date}
            ]
        })
        
        if not approved_leave:
            raise HTTPException(
                status_code=400, 
                detail="Pelajar belum mempunyai kelulusan pulang bermalam untuk tarikh ini. Sila mohon kelulusan pulang bermalam terlebih dahulu."
            )
        
        # Add pulang bermalam id to booking
        data.pulang_bermalam_id = str(approved_leave["_id"])
    
    result = await bus_routes.create_booking(db, data, str(current_user["_id"]))
    await log_audit(current_user, "CREATE_BOOKING", "bus", f"Tempah tiket: {result.booking_number}")
    return result

@app.get("/api/bus/bookings/{booking_id}", response_model=BookingResponse)
async def get_bus_booking(
    booking_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get single booking"""
    booking = await bus_routes.get_booking(db, booking_id)
    
    # Check access
    if current_user["role"] == "parent" and booking.parent_id != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    return booking

@app.put("/api/bus/bookings/{booking_id}", response_model=BookingResponse)
async def update_bus_booking(
    booking_id: str,
    data: BookingUpdate,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bus_admin"))
):
    """Update booking (Admin/Bus Admin only)"""
    result = await bus_routes.update_booking(db, booking_id, data)
    await log_audit(current_user, "UPDATE_BOOKING", "bus", f"Kemaskini tempahan: {booking_id}")
    return result

@app.post("/api/bus/bookings/{booking_id}/assign-seat")
async def assign_booking_seat(
    booking_id: str,
    seat_number: str,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bus_admin"))
):
    """Assign seat to booking"""
    result = await bus_routes.assign_seat(db, booking_id, seat_number)
    await log_audit(current_user, "ASSIGN_SEAT", "bus", f"Berikan tempat duduk {seat_number} untuk tempahan {booking_id}")
    return result

@app.post("/api/bus/bookings/{booking_id}/cancel")
async def cancel_bus_booking(
    booking_id: str,
    reason: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Cancel booking"""
    # Parents can only cancel their own bookings
    if current_user["role"] == "parent":
        booking = await bus_routes.get_booking(db, booking_id)
        if booking.parent_id != str(current_user["_id"]):
            raise HTTPException(status_code=403, detail="Akses ditolak")
    
    result = await bus_routes.cancel_booking(db, booking_id, reason)
    await log_audit(current_user, "CANCEL_BOOKING", "bus", f"Batal tempahan: {booking_id}")
    return result

# --- PUBLIC BUS ENDPOINTS (For Parents/Students) ---

@app.get("/api/public/bus/trips", response_model=List[TripResponse])
async def get_available_trips_public(
    date_from: Optional[str] = None,
    destination: Optional[str] = None
):
    """Get available trips for booking (Public)"""
    return await bus_routes.get_available_trips(db, date_from, destination)

@app.get("/api/public/bus/trips/{trip_id}/seats")
async def get_trip_seat_map_public(trip_id: str):
    """Get seat map for a trip (Public)"""
    return await bus_routes.get_trip_seat_map(db, trip_id)

# --- BUS STATISTICS ---

@app.get("/api/bus/stats")
async def get_bus_stats(
    current_user: dict = Depends(require_roles("superadmin", "admin", "bus_admin"))
):
    """Get bus system statistics"""
    total_companies = await db.bus_companies.count_documents({"is_active": True})
    total_buses = await db.buses.count_documents({"is_active": True})
    total_routes = await db.bus_routes.count_documents({"is_active": True})
    total_trips = await db.bus_trips.count_documents({"status": "scheduled"})
    total_bookings = await db.bus_bookings.count_documents({"status": {"$nin": ["cancelled"]}})
    
    return {
        "total_companies": total_companies,
        "total_buses": total_buses,
        "total_routes": total_routes,
        "active_trips": total_trips,
        "total_bookings": total_bookings
    }

# ============ BUS BOOKING SETTINGS ============

class BusBookingSettingsUpdate(BaseModel):
    require_leave_approval: bool = False


class LandingSettingsUpdate(BaseModel):
    """Gambar hero halaman landing - boleh diurus oleh Superadmin/Admin"""
    hero_image_url: Optional[str] = None


class PwaSettingsUpdate(BaseModel):
    """Smart 360 AI Edition PWA / manifest + splash settings - simpan di db.settings type pwa"""
    name: str = "Smart 360 AI Edition"
    short_name: str = "Smart 360 AI"
    theme_color: str = "#0f766e"
    background_color: str = "#ffffff"
    description: Optional[str] = None
    page_title: Optional[str] = None
    app_base_url: Optional[str] = None
    pwa_version: Optional[str] = None
    gcm_sender_id: Optional[str] = None
    icon_192_url: Optional[str] = None
    icon_512_url: Optional[str] = None
    splash_title: Optional[str] = None   # Tajuk paparan splash (boleh diubah Superadmin/Admin)
    splash_tagline: Optional[str] = None # Tagline di bawah tajuk
    splash_image_url: Optional[str] = None  # URL gambar hero splash (kosong = guna default)


@app.get("/api/settings/pwa")
async def get_pwa_settings(current_user: dict = Depends(get_current_user)):
    """Get PWA/Smart360 settings (untuk modul ketetapan)"""
    if current_user.get("role") not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    doc = await db.settings.find_one({"type": "pwa"}, {"_id": 0})
    if doc:
        return {
            "name": doc.get("name", "Smart 360 AI Edition"),
            "short_name": doc.get("short_name", "Smart 360 AI"),
            "theme_color": doc.get("theme_color", "#0f766e"),
            "background_color": doc.get("background_color", "#ffffff"),
            "description": doc.get("description", ""),
            "page_title": doc.get("page_title", ""),
            "app_base_url": doc.get("app_base_url", ""),
            "pwa_version": doc.get("pwa_version", ""),
            "gcm_sender_id": doc.get("gcm_sender_id", ""),
            "icon_192_url": doc.get("icon_192_url", "/icons/icon-192x192.png"),
            "icon_512_url": doc.get("icon_512_url", "/icons/icon-512x512.png"),
            "splash_title": doc.get("splash_title", ""),
            "splash_tagline": doc.get("splash_tagline", ""),
            "splash_image_url": doc.get("splash_image_url", ""),
            "updated_at": doc.get("updated_at"),
        }
    return {
        "name": "Smart 360 AI Edition",
        "short_name": "Smart 360 AI",
        "theme_color": "#0f766e",
        "background_color": "#ffffff",
        "description": "Sistem Pengurusan Maktab Bersepadu",
        "page_title": "",
        "app_base_url": "",
        "pwa_version": "",
        "gcm_sender_id": "",
        "icon_192_url": "/icons/icon-192x192.png",
        "icon_512_url": "/icons/icon-512x512.png",
        "splash_title": "",
        "splash_tagline": "",
        "splash_image_url": "",
    }


@app.post("/api/settings/pwa")
async def save_pwa_settings(
    body: PwaSettingsUpdate,
    current_user: dict = Depends(require_roles("superadmin", "admin")),
):
    """Save PWA + Splash settings ke database (Superadmin/Admin)"""
    await db.settings.update_one(
        {"type": "pwa"},
        {"$set": {
            "type": "pwa",
            "name": body.name.strip() or "Smart 360 AI Edition",
            "short_name": body.short_name.strip() or (body.name.strip() or "Smart 360 AI"),
            "theme_color": (body.theme_color or "#0f766e").strip(),
            "background_color": (body.background_color or "#ffffff").strip(),
            "description": (body.description or "").strip() or None,
            "page_title": (body.page_title or "").strip() or None,
            "app_base_url": (body.app_base_url or "").strip() or None,
            "pwa_version": (body.pwa_version or "").strip() or None,
            "gcm_sender_id": (body.gcm_sender_id or "").strip() or None,
            "icon_192_url": (body.icon_192_url or "").strip() or "/icons/icon-192x192.png",
            "icon_512_url": (body.icon_512_url or "").strip() or "/icons/icon-512x512.png",
            "splash_title": (body.splash_title or "").strip() or None,
            "splash_tagline": (body.splash_tagline or "").strip() or None,
            "splash_image_url": (body.splash_image_url or "").strip() or None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": str(current_user.get("_id", "")),
        }},
        upsert=True,
    )
    return {"message": "Tetapan PWA dan Splash berjaya disimpan"}


@app.get("/api/public/settings/pwa")
async def get_pwa_settings_public():
    """Tetapan PWA untuk awam (meta tag, manifest) - tiada auth"""
    doc = await db.settings.find_one({"type": "pwa"}, {"_id": 0})
    if doc:
        return {
            "name": doc.get("name", "Smart 360 AI Edition"),
            "short_name": doc.get("short_name", "Smart 360 AI"),
            "theme_color": doc.get("theme_color", "#0f766e"),
            "background_color": doc.get("background_color", "#ffffff"),
            "description": doc.get("description", "Sistem Pengurusan Maktab Bersepadu"),
            "page_title": doc.get("page_title", ""),
            "app_base_url": doc.get("app_base_url", ""),
            "icon_192_url": doc.get("icon_192_url") or "/api/upload/images/app-icon/smart360-official-192.png",
            "icon_512_url": doc.get("icon_512_url") or "/api/upload/images/app-icon/smart360-official-512.png",
            "gcm_sender_id": doc.get("gcm_sender_id", ""),
            "splash_title": doc.get("splash_title", ""),
            "splash_tagline": doc.get("splash_tagline", ""),
            "splash_image_url": doc.get("splash_image_url", ""),
        }
    # Ikon rasmi SMART360 (trimmed) dalam uploads/app_icon – digunakan jika tiada tetapan PWA
    return {
        "name": "Smart 360 AI Edition",
        "short_name": "Smart 360 AI",
        "theme_color": "#0f766e",
        "background_color": "#ffffff",
        "description": "Sistem Pengurusan Maktab Bersepadu",
        "page_title": "",
        "app_base_url": "",
        "icon_192_url": "/api/upload/images/app-icon/smart360-official-192.png",
        "icon_512_url": "/api/upload/images/app-icon/smart360-official-512.png",
        "gcm_sender_id": "",
        "splash_title": "",
        "splash_tagline": "",
        "splash_image_url": "",
    }


@app.get("/api/settings/landing")
async def get_landing_settings(current_user: dict = Depends(get_current_user)):
    """Get landing page settings (hero image). Superadmin/Admin sahaja."""
    if current_user.get("role") not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    doc = await db.settings.find_one({"type": "landing"}, {"_id": 0})
    if doc:
        return {"hero_image_url": doc.get("hero_image_url") or ""}
    return {"hero_image_url": ""}


@app.get("/api/settings/landing/public")
async def get_landing_settings_public():
    """Get landing hero image URL (awam - untuk paparan landing page)."""
    doc = await db.settings.find_one({"type": "landing"}, {"_id": 0})
    if doc and doc.get("hero_image_url"):
        return {"hero_image_url": doc["hero_image_url"]}
    return {"hero_image_url": ""}


@app.post("/api/settings/landing")
async def save_landing_settings(
    body: LandingSettingsUpdate,
    current_user: dict = Depends(require_roles("superadmin", "admin")),
):
    """Save landing page settings (gambar hero)."""
    await db.settings.update_one(
        {"type": "landing"},
        {"$set": {
            "type": "landing",
            "hero_image_url": (body.hero_image_url or "").strip() or None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": str(current_user.get("_id", "")),
        }},
        upsert=True,
    )
    return {"message": "Tetapan gambar landing berjaya disimpan"}


# --- Onboarding (slider pertama kali buka app) - database driven, boleh diedit Superadmin/Admin ---
class OnboardingSlideItem(BaseModel):
    order: int = 0
    title: str = ""
    subtitle: str = ""
    image_url: Optional[str] = None


class OnboardingSettingsUpdate(BaseModel):
    slides: list[OnboardingSlideItem] = []


DEFAULT_ONBOARDING_SLIDES = [
    {"order": 0, "title": "Selamat datang ke Smart 360 AI Edition", "subtitle": "Satu platform pengurusan Maktab yang pintar dan bersepadu.", "image_url": "/images/onboarding/onboarding-1-welcome.png"},
    {"order": 1, "title": "Yuran, Bas & Asrama", "subtitle": "Urus yuran, tiket bas dan asrama dalam satu tempat. Lebih mudah, lebih pantas.", "image_url": "/images/onboarding/onboarding-2-yuran-bas.png"},
    {"order": 2, "title": "Ibu Bapa & Pelajar", "subtitle": "Pantau anak, bayar yuran, tempah bas dengan mudah dari telefon anda.", "image_url": "/images/onboarding/onboarding-3-keluarga.png"},
    {"order": 3, "title": "Mulakan pengalaman anda", "subtitle": "Log masuk atau daftar untuk akses penuh ke Smart 360 AI Edition.", "image_url": "/images/onboarding/onboarding-4-mula.png"},
]


@app.get("/api/settings/onboarding")
async def get_onboarding_settings(current_user: dict = Depends(get_current_user)):
    """Get onboarding slides (untuk modul tetapan - Superadmin/Admin)."""
    if current_user.get("role") not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    doc = await db.settings.find_one({"type": "onboarding"}, {"_id": 0})
    if doc and doc.get("slides"):
        slides = sorted(doc["slides"], key=lambda s: s.get("order", 0))
        return {"slides": slides, "updated_at": doc.get("updated_at")}
    return {"slides": DEFAULT_ONBOARDING_SLIDES, "updated_at": None}


@app.post("/api/settings/onboarding")
async def save_onboarding_settings(
    body: OnboardingSettingsUpdate,
    current_user: dict = Depends(require_roles("superadmin", "admin")),
):
    """Simpan slide onboarding ke database."""
    # Normalize: ensure order, title, subtitle, image_url; sort by order
    slides = []
    for i, s in enumerate(body.slides or []):
        slides.append({
            "order": getattr(s, "order", i),
            "title": (getattr(s, "title", None) or "").strip() or "",
            "subtitle": (getattr(s, "subtitle", None) or "").strip() or "",
            "image_url": (getattr(s, "image_url", None) or "").strip() or None,
        })
    slides.sort(key=lambda x: x["order"])
    await db.settings.update_one(
        {"type": "onboarding"},
        {"$set": {
            "type": "onboarding",
            "slides": slides,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": str(current_user.get("_id", "")),
        }},
        upsert=True,
    )
    return {"message": "Tetapan onboarding berjaya disimpan", "slides": slides}


@app.get("/api/public/settings/onboarding")
async def get_onboarding_settings_public():
    """Tetapan onboarding untuk awam (paparan slider pertama kali - tiada auth)."""
    doc = await db.settings.find_one({"type": "onboarding"}, {"_id": 0})
    if doc and doc.get("slides"):
        slides = sorted(doc["slides"], key=lambda s: s.get("order", 0))
        return {"slides": slides}
    return {"slides": DEFAULT_ONBOARDING_SLIDES}


# --- Portal / institusi (untuk kegunaan pelbagai MRSM - nama institusi & tajuk portal) ---
class PortalSettingsUpdate(BaseModel):
    portal_title: Optional[str] = None  # e.g. "SMART360: Ai Edition"
    institution_name: Optional[str] = None  # e.g. "MRSMKU", "MRSM Kuantan"


DEFAULT_PORTAL_TITLE = "SMART360: Ai Edition"
DEFAULT_INSTITUTION_NAME = "MRSMKU"


@app.get("/api/public/settings/portal")
async def get_portal_settings_public():
    """Tetapan portal untuk awam (tajuk portal & nama institusi - tiada auth). Untuk sesuaikan dengan MRSM lain."""
    doc = await db.settings.find_one({"type": "portal"}, {"_id": 0})
    if doc:
        return {
            "portal_title": (doc.get("portal_title") or "").strip() or DEFAULT_PORTAL_TITLE,
            "institution_name": (doc.get("institution_name") or "").strip() or DEFAULT_INSTITUTION_NAME,
        }
    return {"portal_title": DEFAULT_PORTAL_TITLE, "institution_name": DEFAULT_INSTITUTION_NAME}


@app.get("/api/settings/portal")
async def get_portal_settings(current_user: dict = Depends(get_current_user)):
    """Get portal settings. Superadmin/Admin sahaja."""
    if current_user.get("role") not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Akses ditolak")
    doc = await db.settings.find_one({"type": "portal"}, {"_id": 0})
    if doc:
        return {
            "portal_title": doc.get("portal_title") or DEFAULT_PORTAL_TITLE,
            "institution_name": doc.get("institution_name") or DEFAULT_INSTITUTION_NAME,
        }
    return {"portal_title": DEFAULT_PORTAL_TITLE, "institution_name": DEFAULT_INSTITUTION_NAME}


@app.post("/api/settings/portal")
async def save_portal_settings(
    body: PortalSettingsUpdate,
    current_user: dict = Depends(require_roles("superadmin", "admin")),
):
    """Simpan tetapan portal (tajuk & nama institusi) - untuk kegunaan pelbagai MRSM."""
    updates = {}
    if body.portal_title is not None:
        updates["portal_title"] = (body.portal_title or "").strip() or DEFAULT_PORTAL_TITLE
    if body.institution_name is not None:
        updates["institution_name"] = (body.institution_name or "").strip() or DEFAULT_INSTITUTION_NAME
    if not updates:
        return {"message": "Tiada perubahan"}
    updates["type"] = "portal"
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates["updated_by"] = str(current_user.get("_id", ""))
    await db.settings.update_one({"type": "portal"}, {"$set": updates}, upsert=True)
    return {"message": "Tetapan portal berjaya disimpan"}


def _abs_url(base: str, path: str) -> str:
    """Return path as-is if already absolute URL, else base + path."""
    if not path:
        return path
    path = path.strip()
    if path.startswith("http://") or path.startswith("https://"):
        return path
    base = (base or "").strip().rstrip("/")
    if not base:
        return path if path.startswith("/") else f"/{path}"
    return f"{base}/{path.lstrip('/')}" if path else base


@app.get("/api/manifest")
async def get_manifest():
    """Manifest PWA dinamik dari DB (untuk Add to Home Screen). Jika app_base_url diset, start_url/scope/ikon guna URL penuh supaya betul bila API lain origin."""
    doc = await db.settings.find_one({"type": "pwa"}, {"_id": 0})
    name = doc.get("name", "Smart360") if doc else "Smart360"
    short_name = doc.get("short_name", "Smart360") if doc else "Smart360"
    theme_color = doc.get("theme_color", "#0f766e") if doc else "#0f766e"
    background_color = doc.get("background_color", "#ffffff") if doc else "#ffffff"
    description = doc.get("description", "Sistem Bersepadu Smart360") if doc else "Sistem Bersepadu Smart360"
    icon_192 = (doc.get("icon_192_url") or "/api/upload/images/app-icon/smart360-official-192.png").strip() if doc else "/api/upload/images/app-icon/smart360-official-192.png"
    icon_512 = (doc.get("icon_512_url") or "/api/upload/images/app-icon/smart360-official-512.png").strip() if doc else "/api/upload/images/app-icon/smart360-official-512.png"
    gcm = (doc.get("gcm_sender_id") or "").strip() if doc else ""
    base = (doc.get("app_base_url") or "").strip() if doc else ""
    start_url = _abs_url(base, "/") if base else "/"
    scope = _abs_url(base, "/") if base else "/"
    manifest = {
        "name": name,
        "short_name": short_name,
        "description": description,
        "start_url": start_url,
        "scope": scope,
        "display": "standalone",
        "orientation": "portrait-primary",
        "theme_color": theme_color,
        "background_color": background_color,
        "categories": ["business", "productivity"],
        "icons": [
            {"src": _abs_url(base, "/favicon.ico"), "sizes": "64x64 32x32 24x24 16x16", "type": "image/x-icon", "purpose": "any"},
            {"src": _abs_url(base, icon_192), "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
            {"src": _abs_url(base, icon_512), "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
        ],
        "screenshots": [],
        "prefer_related_applications": False,
    }
    if gcm:
        manifest["gcm_sender_id"] = gcm
    return manifest


@app.get("/api/public/settings/bus-booking")
async def get_bus_booking_settings_public():
    """Get bus booking settings - public endpoint for checking requirement"""
    settings = await db.settings.find_one({"type": "bus_booking"}, {"_id": 0})
    if settings:
        return {
            "require_leave_approval": settings.get("require_leave_approval", False)
        }
    return {"require_leave_approval": False}

@app.get("/api/settings/bus-booking")
async def get_bus_booking_settings(current_user: dict = Depends(get_current_user)):
    """Get bus booking settings - for authenticated users"""
    settings = await db.settings.find_one({"type": "bus_booking"}, {"_id": 0})
    if settings:
        return {
            "require_leave_approval": settings.get("require_leave_approval", False),
            "updated_at": settings.get("updated_at"),
            "updated_by": settings.get("updated_by_name")
        }
    return {"require_leave_approval": False}

@app.post("/api/settings/bus-booking")
async def save_bus_booking_settings(
    settings: BusBookingSettingsUpdate,
    current_user: dict = Depends(require_roles("superadmin", "admin", "bus_admin"))
):
    """Save bus booking settings (SuperAdmin only)"""
    await db.settings.update_one(
        {"type": "bus_booking"},
        {"$set": {
            "type": "bus_booking",
            "require_leave_approval": settings.require_leave_approval,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": str(current_user["_id"]),
            "updated_by_name": current_user.get("full_name", "")
        }},
        upsert=True
    )
    
    await log_audit(
        current_user, 
        "BUS_SETTINGS_UPDATED", 
        "settings", 
        f"Tetapan tiket bas dikemaskini: Perlu kelulusan = {settings.require_leave_approval}"
    )
    
    return {"message": "Tetapan tiket bas berjaya disimpan"}

# ============ STUDENT APPROVED LEAVES FOR BUS BOOKING ============

@app.get("/api/bus/student/{student_id}/approved-leaves")
async def get_student_approved_leaves(
    student_id: str,
    current_user: dict = Depends(require_roles("parent", "pelajar", "admin", "superadmin"))
):
    """Get approved pulang bermalam for a student"""
    # Verify parent owns this student or is admin
    if current_user["role"] == "parent":
        student = await db.students.find_one({
            "_id": ObjectId(student_id),
            "parent_id": current_user["_id"]
        })
        if not student:
            raise HTTPException(status_code=403, detail="Akses ditolak")
    elif current_user["role"] == "pelajar":
        if str(current_user["_id"]) != student_id:
            raise HTTPException(status_code=403, detail="Akses ditolak")
    
    # Get approved leaves
    leaves = await db.hostel_records.find({
        "student_id": ObjectId(student_id),
        "kategori": "pulang_bermalam",
        "status": "approved"
    }).sort("tarikh_keluar", -1).to_list(50)
    
    return [{
        "id": str(leave["_id"]),
        "tarikh_keluar": leave.get("tarikh_keluar", ""),
        "tarikh_pulang": leave.get("tarikh_pulang", ""),
        "pic_name": leave.get("pic_name", ""),
        "remarks": leave.get("remarks", ""),
        "status": leave.get("status", "")
    } for leave in leaves]

@app.get("/api/bus/check-leave-requirement")
async def check_leave_requirement_for_booking(
    student_id: str,
    trip_id: str,
    current_user: dict = Depends(require_roles("parent", "pelajar"))
):
    """Check if student has approved leave for a trip date"""
    # Get settings
    bus_settings = await db.settings.find_one({"type": "bus_booking"})
    require_leave_approval = bus_settings.get("require_leave_approval", False) if bus_settings else False
    
    if not require_leave_approval:
        return {
            "can_book": True,
            "require_leave_approval": False,
            "message": "Kelulusan pulang bermalam tidak diperlukan"
        }
    
    # Get trip date
    trip = await db.bus_trips.find_one({"_id": ObjectId(trip_id)})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip tidak dijumpai")
    
    departure_date = trip.get("departure_date", "")
    
    # Check for approved leave
    approved_leave = await db.hostel_records.find_one({
        "student_id": ObjectId(student_id),
        "kategori": "pulang_bermalam",
        "status": "approved",
        "$or": [
            {"tarikh_keluar": {"$lte": departure_date}, "tarikh_pulang": {"$gte": departure_date}},
            {"tarikh_keluar": departure_date}
        ]
    })
    
    if approved_leave:
        return {
            "can_book": True,
            "require_leave_approval": True,
            "has_approved_leave": True,
            "leave_id": str(approved_leave["_id"]),
            "leave_date_out": approved_leave.get("tarikh_keluar", ""),
            "leave_date_return": approved_leave.get("tarikh_pulang", ""),
            "message": "Kelulusan pulang bermalam ditemui"
        }
    else:
        return {
            "can_book": False,
            "require_leave_approval": True,
            "has_approved_leave": False,
            "message": f"Tiada kelulusan pulang bermalam untuk tarikh {departure_date}. Sila mohon kelulusan terlebih dahulu."
        }

# ============ KOPERASI MODULE ============

# --- KIT ENDPOINTS ---

@app.get("/api/koperasi/categories")
async def get_koperasi_categories(
    current_user: dict = Depends(get_current_user)
):
    """Get available product categories"""
    return await koperasi_routes.get_product_categories(db, current_user)

@app.get("/api/koperasi/kits")
async def get_koperasi_kits(
    include_inactive: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Get all kits"""
    return await koperasi_routes.get_kits(include_inactive, db, current_user)

@app.get("/api/koperasi/kits/{kit_id}")
async def get_koperasi_kit(
    kit_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get single kit with products"""
    return await koperasi_routes.get_kit(kit_id, db, current_user)

@app.post("/api/koperasi/kits")
async def create_koperasi_kit(
    kit: KoopKitCreate,
    current_user: dict = Depends(require_roles("superadmin", "admin", "koop_admin"))
):
    """Create new kit"""
    current_user["id"] = str(current_user["_id"])
    result = await koperasi_routes.create_kit(kit, db, current_user)
    await log_audit(current_user, "CREATE_KOOP_KIT", "koperasi", f"Cipta kit: {kit.name}")
    return result

@app.put("/api/koperasi/kits/{kit_id}")
async def update_koperasi_kit(
    kit_id: str,
    kit: KoopKitUpdate,
    current_user: dict = Depends(require_roles("superadmin", "admin", "koop_admin"))
):
    """Update kit"""
    current_user["id"] = str(current_user["_id"])
    result = await koperasi_routes.update_kit(kit_id, kit, db, current_user)
    await log_audit(current_user, "UPDATE_KOOP_KIT", "koperasi", f"Kemaskini kit: {kit_id}")
    return result

@app.delete("/api/koperasi/kits/{kit_id}")
async def delete_koperasi_kit(
    kit_id: str,
    current_user: dict = Depends(require_roles("superadmin", "admin", "koop_admin"))
):
    """Delete kit (soft delete)"""
    current_user["id"] = str(current_user["_id"])
    result = await koperasi_routes.delete_kit(kit_id, db, current_user)
    await log_audit(current_user, "DELETE_KOOP_KIT", "koperasi", f"Padam kit: {kit_id}")
    return result

# --- PRODUCT ENDPOINTS ---

@app.get("/api/koperasi/products")
async def get_koperasi_products(
    kit_id: Optional[str] = None,
    include_inactive: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Get all products"""
    return await koperasi_routes.get_products(kit_id, include_inactive, db, current_user)

@app.get("/api/koperasi/products/{product_id}")
async def get_koperasi_product(
    product_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get single product"""
    return await koperasi_routes.get_product(product_id, db, current_user)

@app.post("/api/koperasi/products")
async def create_koperasi_product(
    product: KoopProductCreate,
    current_user: dict = Depends(require_roles("superadmin", "admin", "koop_admin"))
):
    """Create new product"""
    current_user["id"] = str(current_user["_id"])
    result = await koperasi_routes.create_product(product, db, current_user)
    await log_audit(current_user, "CREATE_KOOP_PRODUCT", "koperasi", f"Cipta produk: {product.name}")
    return result

@app.put("/api/koperasi/products/{product_id}")
async def update_koperasi_product(
    product_id: str,
    product: KoopProductUpdate,
    current_user: dict = Depends(require_roles("superadmin", "admin", "koop_admin"))
):
    """Update product"""
    current_user["id"] = str(current_user["_id"])
    result = await koperasi_routes.update_product(product_id, product, db, current_user)
    await log_audit(current_user, "UPDATE_KOOP_PRODUCT", "koperasi", f"Kemaskini produk: {product_id}")
    return result

@app.delete("/api/koperasi/products/{product_id}")
async def delete_koperasi_product(
    product_id: str,
    current_user: dict = Depends(require_roles("superadmin", "admin", "koop_admin"))
):
    """Delete product (soft delete)"""
    current_user["id"] = str(current_user["_id"])
    result = await koperasi_routes.delete_product(product_id, db, current_user)
    await log_audit(current_user, "DELETE_KOOP_PRODUCT", "koperasi", f"Padam produk: {product_id}")
    return result

# --- CART ENDPOINTS (Parent) ---

@app.get("/api/koperasi/cart")
async def get_koperasi_cart(
    student_id: str,
    current_user: dict = Depends(require_roles("parent"))
):
    """Get shopping cart for a student"""
    current_user["id"] = str(current_user["_id"])
    return await koperasi_routes.get_cart(student_id, db, current_user)

@app.post("/api/koperasi/cart/add")
async def add_to_koperasi_cart(
    request: AddToCartRequest,
    current_user: dict = Depends(require_roles("parent"))
):
    """Add item to cart"""
    current_user["id"] = str(current_user["_id"])
    return await koperasi_routes.add_to_cart(request, db, current_user)

@app.post("/api/koperasi/cart/add-kit")
async def add_kit_to_koperasi_cart(
    kit_id: str,
    student_id: str,
    current_user: dict = Depends(require_roles("parent"))
):
    """Add entire kit to cart - returns size selection if needed"""
    current_user["id"] = str(current_user["_id"])
    return await koperasi_routes.add_kit_to_cart(kit_id, student_id, db, current_user)

@app.post("/api/koperasi/cart/add-kit-with-sizes")
async def add_kit_to_koperasi_cart_with_sizes(
    request: AddKitToCartRequest,
    current_user: dict = Depends(require_roles("parent"))
):
    """Add entire kit to cart with size selections"""
    current_user["id"] = str(current_user["_id"])
    return await koperasi_routes.add_kit_to_cart_with_sizes(request, db, current_user)

@app.put("/api/koperasi/cart/update")
async def update_koperasi_cart_item(
    student_id: str,
    product_id: str,
    quantity: int,
    size: Optional[str] = None,
    current_user: dict = Depends(require_roles("parent"))
):
    """Update cart item quantity"""
    current_user["id"] = str(current_user["_id"])
    return await koperasi_routes.update_cart_item(student_id, product_id, quantity, size, db, current_user)

@app.delete("/api/koperasi/cart/remove")
async def remove_from_koperasi_cart(
    student_id: str,
    product_id: str,
    size: Optional[str] = None,
    current_user: dict = Depends(require_roles("parent"))
):
    """Remove item from cart"""
    current_user["id"] = str(current_user["_id"])
    return await koperasi_routes.remove_from_cart(student_id, product_id, size, db, current_user)

@app.delete("/api/koperasi/cart/clear")
async def clear_koperasi_cart(
    student_id: str,
    current_user: dict = Depends(require_roles("parent"))
):
    """Clear all items from cart"""
    current_user["id"] = str(current_user["_id"])
    return await koperasi_routes.clear_cart(student_id, db, current_user)

# --- ORDER ENDPOINTS ---

@app.post("/api/koperasi/orders")
async def create_koperasi_order(
    order: KoopOrderCreate,
    current_user: dict = Depends(require_roles("parent"))
):
    """Create order from cart (checkout)"""
    current_user["id"] = str(current_user["_id"])
    result = await koperasi_routes.create_order(order, db, current_user)
    await log_audit(current_user, "CREATE_KOOP_ORDER", "koperasi", f"Cipta pesanan: {result.get('order_number')}")
    return result

@app.get("/api/koperasi/orders")
async def get_koperasi_orders(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get orders - Parents see their own, Admins see all"""
    current_user["id"] = str(current_user["_id"])
    return await koperasi_routes.get_orders(status, db, current_user)

@app.get("/api/koperasi/orders/{order_id}")
async def get_koperasi_order(
    order_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get single order"""
    current_user["id"] = str(current_user["_id"])
    return await koperasi_routes.get_order(order_id, db, current_user)

@app.put("/api/koperasi/orders/{order_id}/status")
async def update_koperasi_order_status(
    order_id: str,
    status: str,
    current_user: dict = Depends(require_roles("superadmin", "admin", "koop_admin"))
):
    """Update order status"""
    current_user["id"] = str(current_user["_id"])
    result = await koperasi_routes.update_order_status(order_id, status, db, current_user)
    await log_audit(current_user, "UPDATE_KOOP_ORDER", "koperasi", f"Kemaskini status pesanan {order_id}: {status}")
    return result

# --- ADMIN STATS ---

@app.get("/api/koperasi/admin/stats")
async def get_koperasi_admin_stats(
    current_user: dict = Depends(require_roles("superadmin", "admin", "koop_admin"))
):
    """Get dashboard statistics for Koperasi admin"""
    current_user["id"] = str(current_user["_id"])
    return await koperasi_routes.get_koperasi_stats(db, current_user)

# ============ INFAQ SLOT MODULE ============

class InfaqCampaignCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    image_url: Optional[str] = ""
    total_slots: int
    price_per_slot: float
    min_slots: Optional[int] = 1
    max_slots: Optional[int] = 5000
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class InfaqCampaignUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    total_slots: Optional[int] = None
    price_per_slot: Optional[float] = None
    min_slots: Optional[int] = None
    max_slots: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[str] = None

class InfaqDonation(BaseModel):
    campaign_id: str
    slots: int
    payment_method: Optional[str] = "fpx"
    is_anonymous: Optional[bool] = False
    message: Optional[str] = None

# --- PUBLIC INFAQ ENDPOINTS ---

@app.get("/api/public/infaq/campaigns")
async def get_public_infaq_campaigns(limit: int = 50):
    """Get public active infaq campaigns"""
    return await infaq_routes.get_public_campaigns(db, limit)

@app.get("/api/public/infaq/campaigns/{campaign_id}")
async def get_public_infaq_campaign(campaign_id: str):
    """Get public infaq campaign details"""
    campaign = await infaq_routes.get_public_campaign(campaign_id, db)
    if not campaign:
        raise HTTPException(status_code=404, detail="Kempen tidak dijumpai")
    return campaign

@app.get("/api/public/infaq/stats")
async def get_public_infaq_stats():
    """Get public infaq statistics"""
    return await infaq_routes.get_public_stats(db)

# --- USER INFAQ ENDPOINTS ---

@app.get("/api/infaq/campaigns")
async def get_infaq_campaigns(
    status: Optional[str] = None,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get infaq campaigns for logged in users"""
    return await infaq_routes.get_campaigns(db, status, limit)

@app.get("/api/infaq/campaigns/{campaign_id}")
async def get_infaq_campaign(
    campaign_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get infaq campaign details"""
    campaign = await infaq_routes.get_campaign(campaign_id, db)
    if not campaign:
        raise HTTPException(status_code=404, detail="Kempen tidak dijumpai")
    return campaign

@app.post("/api/infaq/donate")
async def make_infaq_donation(
    data: InfaqDonation,
    current_user: dict = Depends(require_permission("infaq.donation.make"))
):
    """Make an infaq donation"""
    current_user["id"] = str(current_user["_id"])
    try:
        donation = await infaq_routes.make_donation(data.dict(), db, current_user)
        await log_audit(current_user, "INFAQ_DONATION", "infaq", f"Derma {data.slots} slot untuk kempen {data.campaign_id}")
        return donation
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/infaq/my-donations")
async def get_my_infaq_donations(
    current_user: dict = Depends(get_current_user)
):
    """Get user's infaq donation history"""
    current_user["id"] = str(current_user["_id"])
    return await infaq_routes.get_my_donations(db, current_user)

# --- ADMIN INFAQ ENDPOINTS ---

@app.post("/api/infaq/admin/campaigns")
async def create_infaq_campaign(
    data: InfaqCampaignCreate,
    current_user: dict = Depends(require_permission("infaq.campaign.create"))
):
    """Create a new infaq campaign"""
    current_user["id"] = str(current_user["_id"])
    campaign = await infaq_routes.create_campaign(data.dict(), db, current_user)
    await log_audit(current_user, "CREATE_INFAQ_CAMPAIGN", "infaq", f"Cipta kempen infaq: {data.title}")
    return campaign

@app.put("/api/infaq/admin/campaigns/{campaign_id}")
async def update_infaq_campaign(
    campaign_id: str,
    data: InfaqCampaignUpdate,
    current_user: dict = Depends(require_permission("infaq.campaign.edit"))
):
    """Update infaq campaign"""
    current_user["id"] = str(current_user["_id"])
    campaign = await infaq_routes.update_campaign(campaign_id, data.dict(exclude_none=True), db)
    if not campaign:
        raise HTTPException(status_code=404, detail="Kempen tidak dijumpai")
    await log_audit(current_user, "UPDATE_INFAQ_CAMPAIGN", "infaq", f"Kemaskini kempen infaq: {campaign_id}")
    return campaign

@app.delete("/api/infaq/admin/campaigns/{campaign_id}")
async def delete_infaq_campaign(
    campaign_id: str,
    current_user: dict = Depends(require_permission("infaq.campaign.delete"))
):
    """Delete (cancel) infaq campaign"""
    current_user["id"] = str(current_user["_id"])
    success = await infaq_routes.delete_campaign(campaign_id, db)
    if not success:
        raise HTTPException(status_code=404, detail="Kempen tidak dijumpai")
    await log_audit(current_user, "DELETE_INFAQ_CAMPAIGN", "infaq", f"Batalkan kempen infaq: {campaign_id}")
    return {"message": "Kempen berjaya dibatalkan"}

@app.get("/api/infaq/admin/donations")
async def get_all_infaq_donations(
    campaign_id: Optional[str] = None,
    current_user: dict = Depends(require_permission("infaq.donation.view"))
):
    """Get all infaq donations"""
    return await infaq_routes.get_all_donations(db, campaign_id)

@app.get("/api/infaq/admin/stats")
async def get_infaq_admin_stats(
    current_user: dict = Depends(require_permission("infaq.stats.view"))
):
    """Get infaq statistics for admin"""
    return await infaq_routes.get_infaq_stats(db)

# ============ ANALYTICS AI MODULE ============

# Initialize analytics routes
analytics_routes.init_router(db, get_current_user)

@app.get("/api/analytics/dashboard")
async def get_analytics_dashboard_endpoint(current_user: dict = Depends(get_current_user)):
    """Get comprehensive analytics dashboard"""
    staff_roles = ["superadmin", "admin", "bendahari", "sub_bendahari", "guru_kelas", "guru_homeroom", "warden", "guard", "bus_admin", "koop_admin"]
    if current_user.get("role") not in staff_roles:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    return await analytics_routes.get_analytics_dashboard_data(db)

@app.post("/api/analytics/ai-insights")
async def get_ai_insights_endpoint(
    query: analytics_routes.AnalyticsQuery,
    current_user: dict = Depends(get_current_user)
):
    """Get AI-powered insights"""
    staff_roles = ["superadmin", "admin", "bendahari", "sub_bendahari", "guru_kelas", "guru_homeroom", "warden", "guard", "bus_admin", "koop_admin"]
    if current_user.get("role") not in staff_roles:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    return await analytics_routes.get_ai_insights_data(query, db)

@app.get("/api/analytics/module/{module_name}")
async def get_module_analytics_endpoint(
    module_name: str,
    current_user: dict = Depends(get_current_user)
):
    """Get analytics for specific module"""
    staff_roles = ["superadmin", "admin", "bendahari", "sub_bendahari", "guru_kelas", "guru_homeroom", "warden", "guard", "bus_admin", "koop_admin"]
    if current_user.get("role") not in staff_roles:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    return await analytics_routes.get_module_analytics_data(module_name, db)

@app.post("/api/analytics/chat")
async def analytics_chat_endpoint(
    query: analytics_routes.AnalyticsQuery,
    current_user: dict = Depends(get_current_user)
):
    """Chat with AI about analytics"""
    staff_roles = ["superadmin", "admin", "bendahari", "sub_bendahari", "guru_kelas", "guru_homeroom", "warden", "guard", "bus_admin", "koop_admin"]
    if current_user.get("role") not in staff_roles:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    return await analytics_routes.analytics_chat_data(query, db)

# ============ COMPLAINTS MODULE ============
def get_db():
    if DB_ENGINE == "postgres":
        return core_db or db
    return db


def get_core_db():
    # Fallback to MongoDB before lifespan initialization.
    return core_db or db


def get_relational_core_db():
    # For phased typed-table migration on yuran and tabung collections used by read-heavy modules.
    adapted_db = adapt_yuran_read_db(get_core_db())
    return adapt_tabung_read_db(adapted_db)


# ============ AGM ROUTES ============
agm_routes.init_router(get_db)
app.include_router(agm_routes.router)


complaints_routes.init_router(get_db, get_current_user, require_permission, log_audit)
app.include_router(complaints_routes.router)

# ============ DISCIPLINE & OLAT MODULE (Fasa 3) ============
discipline_routes.init_router(get_db, get_current_user, log_audit)
app.include_router(discipline_routes.router)

# ============ AI RISIKO DISIPLIN (Fasa 6) ============
risk_routes.init_router(get_db, get_current_user)
app.include_router(risk_routes.router)

# ============ EMAIL TEMPLATES (SES / Template Email) ============
email_templates_routes.init_router(get_db, get_current_user)
app.include_router(email_templates_routes.router)

# ============ WARDEN MANAGEMENT MODULE ============
warden_routes.init_router(get_db, get_current_user, require_permission, log_audit)
app.include_router(warden_routes.router)

# ============ HOSTEL BLOCKS MODULE ============
hostel_blocks_routes.init_router(get_db, get_current_user, require_permission, log_audit)
app.include_router(hostel_blocks_routes.router)

# ============ UNIVERSAL INVENTORY MANAGEMENT MODULE ============
inventory_routes.init_router(get_db, get_current_user, require_permission, log_audit)
app.include_router(inventory_routes.router)

# ============ CATEGORY MANAGEMENT MODULE ============
categories_routes.init_router(get_db, get_current_user, require_permission, log_audit)
app.include_router(categories_routes.router)

# ============ ACCOUNTING MODULE ============
accounting_routes.init_router(get_db, get_current_user, require_permission, log_audit)
app.include_router(accounting_routes.router)

# ============ ACCOUNTING FULL MODULE (SISTEM BERSEPADU) ============
accounting_full_routes.init_router(get_relational_core_db, get_current_user, require_permission, log_audit)
app.include_router(accounting_full_routes.router)

# ============ BANK ACCOUNTS & FINANCIAL YEAR ============
bank_accounts_routes.init_router(get_db, get_current_user, require_permission, log_audit)
app.include_router(bank_accounts_routes.router)

# ============ AGM REPORTS ============
agm_reports_routes.init_router(get_db, get_current_user, require_permission, log_audit)
app.include_router(agm_reports_routes.router)

# ============ YURAN (FEES MODULE) ============
yuran_routes.init_router(get_db, get_current_user, log_audit, ROLES, get_core_db)
app.include_router(yuran_routes.router)

# ============ UPLOAD & IMAGE MANAGEMENT ============
upload_routes.init_router(get_db, get_current_user, require_permission, log_audit)
app.include_router(upload_routes.router)

# ============ KOPERASI COMMISSION (PUM INTEGRATION) ============
koperasi_commission_routes.init_router(get_db, get_current_user, require_permission, log_audit)
app.include_router(koperasi_commission_routes.router)

# ============ MULTI-VENDOR MARKETPLACE ============
marketplace_routes.init_router(get_db, get_current_user, require_permission, log_audit)
app.include_router(marketplace_routes.router)

# ============ TABUNG & SUMBANGAN (Unified Donation Module) ============
tabung_routes.init_router(get_relational_core_db, get_current_user, require_permission, log_audit)
app.include_router(tabung_routes.router)

# ============ STUDENTS MODULE (Paginated) ============
students_routes.init_router(get_core_db, auth_routes.get_current_user, auth_routes.log_audit, ROLES)
app.include_router(students_routes.router)

# ============ STUDENT IMPORT MODULE ============
student_import_routes.init_router(get_db, get_current_user, log_audit, pwd_context)
app.include_router(student_import_routes.router)

# ============ USER MANAGEMENT MODULE (REFACTORED) ============
users_routes.init_router(
    get_core_db, auth_routes.get_current_user, auth_routes.log_audit, pwd_context,
    ROLES, ROLE_PERMISSIONS, serialize_user,
    generate_user_qr_code_data, generate_qr_code_image
)
app.include_router(users_routes.router)

# ============ DASHBOARD MODULE (REFACTORED) ============
dashboard_routes.init_router(get_relational_core_db, auth_routes.get_current_user, serialize_student, ROLES)
app.include_router(dashboard_routes.router)

# ============ FEES MODULE (REFACTORED) ============
fees_routes.init_router(get_relational_core_db, get_current_user, log_audit)
app.include_router(fees_routes.router)

# ============ PAYMENTS MODULE (REFACTORED) ============
payments_routes.init_router(get_relational_core_db, auth_routes.get_current_user, auth_routes.log_audit)
app.include_router(payments_routes.router)

# ============ REPORTS MODULE (REFACTORED) ============
reports_routes.init_router(get_relational_core_db, auth_routes.get_current_user)
app.include_router(reports_routes.router)
ar_routes.init_router(get_relational_core_db, auth_routes.get_current_user)
app.include_router(ar_routes.router)

# ============ HOSTEL MODULE (REFACTORED) ============
hostel_routes.init_router(get_db, get_current_user, log_audit)
app.include_router(hostel_routes.router)

# ============ SICKBAY MODULE (REFACTORED) ============
sickbay_routes.init_router(get_db, get_current_user, log_audit)
app.include_router(sickbay_routes.router)

# ============ PAYMENT CENTER MODULE (CENTRALIZED PAYMENTS) ============
payment_center_routes.init_router(get_relational_core_db, get_current_user, log_audit)
app.include_router(payment_center_routes.router)
chatbox_faq_routes.init_router(get_db, get_current_user)
app.include_router(chatbox_faq_routes.router)

# ============ SMART360 PWA (Push, version, device tokens) ============
pwa_routes.init_router(get_db, get_current_user)
app.include_router(pwa_routes.router)

# ============ FINANCIAL DASHBOARD (Integrated Reports) ============
financial_dashboard_routes.init_router(get_relational_core_db, auth_routes.get_current_user)
app.include_router(financial_dashboard_routes.router)

# ============ SYSTEM CONFIGURATION (KELAS, BANGSA, AGAMA, NEGERI) ============

# Default values
DEFAULT_KELAS = ["A", "B", "C", "D", "E", "F"]


async def _get_valid_kelas_list():
    """Senarai Kelas dari database ketetapan - disegerakkan dengan data pelajar."""
    config = await db.settings.find_one({"type": "system_config"})
    return config.get("kelas", DEFAULT_KELAS) if config else DEFAULT_KELAS
DEFAULT_BANGSA = ["Melayu", "Cina", "India", "Bumiputera Sabah", "Bumiputera Sarawak", "Lain-lain"]
DEFAULT_AGAMA = ["Islam", "Buddha", "Hindu", "Kristian", "Sikh", "Taoisme", "Konfusianisme", "Lain-lain"]
DEFAULT_NEGERI = [
    "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", 
    "Pahang", "Perak", "Perlis", "Pulau Pinang", "Sabah", 
    "Sarawak", "Selangor", "Terengganu", 
    "W.P. Kuala Lumpur", "W.P. Labuan", "W.P. Putrajaya"
]

@app.get("/api/settings/system-config")
async def get_system_config(current_user: dict = Depends(get_current_user)):
    """Get all system configurations (kelas, tingkatan, bangsa, agama, negeri)"""
    config = await db.settings.find_one({"type": "system_config"})
    if config:
        return {
            "kelas": config.get("kelas", DEFAULT_KELAS),
            "tingkatan": config.get("tingkatan", [1, 2, 3, 4, 5]),
            "bangsa": config.get("bangsa", DEFAULT_BANGSA),
            "agama": config.get("agama", DEFAULT_AGAMA),
            "negeri": config.get("negeri", DEFAULT_NEGERI)
        }
    return {
        "kelas": DEFAULT_KELAS,
        "tingkatan": [1, 2, 3, 4, 5],
        "bangsa": DEFAULT_BANGSA,
        "agama": DEFAULT_AGAMA,
        "negeri": DEFAULT_NEGERI
    }

@app.get("/api/settings/system-config/public")
async def get_system_config_public():
    """Get system config for public use (dropdowns)"""
    config = await db.settings.find_one({"type": "system_config"})
    if config:
        return {
            "kelas": config.get("kelas", DEFAULT_KELAS),
            "tingkatan": config.get("tingkatan", [1, 2, 3, 4, 5]),
            "bangsa": config.get("bangsa", DEFAULT_BANGSA),
            "agama": config.get("agama", DEFAULT_AGAMA),
            "negeri": config.get("negeri", DEFAULT_NEGERI)
        }
    return {
        "kelas": DEFAULT_KELAS,
        "tingkatan": [1, 2, 3, 4, 5],
        "bangsa": DEFAULT_BANGSA,
        "agama": DEFAULT_AGAMA,
        "negeri": DEFAULT_NEGERI
    }

@app.post("/api/settings/system-config")
async def save_system_config(config: dict, current_user: dict = Depends(get_current_user)):
    """Save system configuration (SuperAdmin dan Admin - bahagian ketetapan)"""
    if current_user.get("role") not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Hanya SuperAdmin atau Admin boleh mengurus tetapan ini")
    
    kelas = config.get("kelas", DEFAULT_KELAS)
    tingkatan = config.get("tingkatan", [1, 2, 3, 4, 5])
    bangsa = config.get("bangsa", DEFAULT_BANGSA)
    agama = config.get("agama", DEFAULT_AGAMA)
    negeri = config.get("negeri", DEFAULT_NEGERI)
    
    # Validate - must have at least one item each
    if not kelas or not bangsa or not agama or not negeri:
        raise HTTPException(status_code=400, detail="Setiap kategori mesti ada sekurang-kurangnya satu item")
    
    await db.settings.update_one(
        {"type": "system_config"},
        {"$set": {
            "type": "system_config",
            "kelas": kelas,
            "tingkatan": tingkatan,
            "bangsa": bangsa,
            "agama": agama,
            "negeri": negeri,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": str(current_user.get("_id"))
        }},
        upsert=True
    )
    
    await log_audit(current_user, "SYSTEM_CONFIG_UPDATED", "settings", f"Kemaskini konfigurasi sistem: {len(kelas)} kelas, {len(tingkatan)} tingkatan, {len(bangsa)} bangsa, {len(agama)} agama, {len(negeri)} negeri")
    
    return {"message": "Konfigurasi sistem berjaya disimpan", "kelas": kelas, "tingkatan": tingkatan, "bangsa": bangsa, "agama": agama, "negeri": negeri}

@app.post("/api/settings/system-config/sync")
async def sync_system_config(current_user: dict = Depends(get_current_user)):
    """Sync system config to all students - update invalid values to first option (synchronize with Senarai Kelas)"""
    if current_user.get("role") not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Hanya SuperAdmin atau Admin boleh melakukan sinkronisasi")
    
    # Get current config
    config = await db.settings.find_one({"type": "system_config"})
    kelas_list = config.get("kelas", DEFAULT_KELAS) if config else DEFAULT_KELAS
    bangsa_list = config.get("bangsa", DEFAULT_BANGSA) if config else DEFAULT_BANGSA
    agama_list = config.get("agama", DEFAULT_AGAMA) if config else DEFAULT_AGAMA
    negeri_list = config.get("negeri", DEFAULT_NEGERI) if config else DEFAULT_NEGERI
    
    stats = {"kelas_updated": 0, "bangsa_updated": 0, "agama_updated": 0, "negeri_updated": 0}
    
    # Update students with invalid class_name
    result = await db.students.update_many(
        {"class_name": {"$nin": kelas_list}},
        {"$set": {"class_name": kelas_list[0]}}
    )
    stats["kelas_updated"] = result.modified_count
    
    # Update students with invalid bangsa
    result = await db.students.update_many(
        {"$or": [{"bangsa": {"$nin": bangsa_list}}, {"bangsa": {"$exists": False}}, {"bangsa": None}]},
        {"$set": {"bangsa": bangsa_list[0]}}
    )
    stats["bangsa_updated"] = result.modified_count
    
    # Update students with invalid religion
    result = await db.students.update_many(
        {"$or": [{"religion": {"$nin": agama_list}}, {"religion": {"$exists": False}}, {"religion": None}]},
        {"$set": {"religion": agama_list[0]}}
    )
    stats["agama_updated"] = result.modified_count
    
    # Update students with invalid state/negeri
    result = await db.students.update_many(
        {"$or": [{"state": {"$nin": negeri_list}}, {"state": {"$exists": False}}, {"state": None}, {"state": ""}]},
        {"$set": {"state": negeri_list[0]}}
    )
    stats["negeri_updated"] = result.modified_count
    
    # Also update users with role "pelajar"
    await db.users.update_many(
        {"role": "pelajar", "$or": [{"religion": {"$nin": agama_list}}, {"religion": {"$exists": False}}, {"religion": None}]},
        {"$set": {"religion": agama_list[0]}}
    )
    
    # Update users with invalid state
    await db.users.update_many(
        {"$or": [{"state": {"$nin": negeri_list}}, {"state": {"$exists": False}}, {"state": None}, {"state": ""}]},
        {"$set": {"state": negeri_list[0]}}
    )
    
    await log_audit(current_user, "SYSTEM_CONFIG_SYNCED", "settings", f"Sinkronisasi: {stats}")
    
    return {"message": "Sinkronisasi selesai", "stats": stats}

# ============ MODULE ON/OFF SETTINGS ============

# Default module settings
DEFAULT_MODULE_SETTINGS = {
    "tiket_bas": {"enabled": True, "name": "Tiket Bas", "description": "Modul tempahan tiket bas"},
    "hostel": {"enabled": True, "name": "Hostel", "description": "Modul pengurusan asrama"},
    "koperasi": {"enabled": True, "name": "Koperasi", "description": "Modul kedai koperasi maktab"},
    "marketplace": {"enabled": True, "name": "Marketplace", "description": "Modul pasaran pelbagai vendor"},
    "sickbay": {"enabled": True, "name": "Bilik Sakit", "description": "Modul pengurusan bilik sakit"},
    "vehicle": {"enabled": True, "name": "Kenderaan", "description": "Modul keselamatan kenderaan (QR)"},
    "inventory": {"enabled": True, "name": "Inventori", "description": "Modul inventori universal"},
    "complaints": {"enabled": True, "name": "Aduan", "description": "Modul aduan dan maklum balas"},
    "agm": {"enabled": True, "name": "Mesyuarat AGM", "description": "Modul mesyuarat agung tahunan"},
}

@app.get("/api/settings/modules")
async def get_module_settings(current_user: dict = Depends(get_current_user)):
    """Get module on/off settings"""
    config = await db.settings.find_one({"type": "module_settings"})
    if config:
        # Merge with defaults for any new modules
        modules = DEFAULT_MODULE_SETTINGS.copy()
        for key, val in config.get("modules", {}).items():
            if key in modules:
                modules[key]["enabled"] = val.get("enabled", True)
        return {"modules": modules}
    return {"modules": DEFAULT_MODULE_SETTINGS}

@app.get("/api/settings/modules/public")
async def get_module_settings_public():
    """Get module settings for public/all users (for menu filtering)"""
    config = await db.settings.find_one({"type": "module_settings"})
    if config:
        modules = DEFAULT_MODULE_SETTINGS.copy()
        for key, val in config.get("modules", {}).items():
            if key in modules:
                modules[key]["enabled"] = val.get("enabled", True)
        return {"modules": modules}
    return {"modules": DEFAULT_MODULE_SETTINGS}

@app.post("/api/settings/modules")
async def save_module_settings(data: dict, current_user: dict = Depends(get_current_user)):
    """Save module on/off settings (SuperAdmin only)"""
    if current_user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Hanya SuperAdmin boleh mengurus tetapan modul")
    
    modules = data.get("modules", {})
    
    # Validate module keys
    valid_modules = {}
    for key, val in modules.items():
        if key in DEFAULT_MODULE_SETTINGS:
            valid_modules[key] = {
                "enabled": val.get("enabled", True),
                "name": DEFAULT_MODULE_SETTINGS[key]["name"],
                "description": DEFAULT_MODULE_SETTINGS[key]["description"]
            }
    
    await db.settings.update_one(
        {"type": "module_settings"},
        {"$set": {
            "type": "module_settings",
            "modules": valid_modules,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": str(current_user.get("_id"))
        }},
        upsert=True
    )
    
    # Log which modules were enabled/disabled
    enabled = [k for k, v in valid_modules.items() if v.get("enabled")]
    disabled = [k for k, v in valid_modules.items() if not v.get("enabled")]
    await log_audit(current_user, "MODULE_SETTINGS_UPDATED", "settings", 
                   f"Enabled: {enabled}, Disabled: {disabled}")
    
    return {"message": "Tetapan modul berjaya disimpan", "modules": valid_modules}

# ============ UPLOAD DATA PELAJAR MODULE ============

# Default upload settings
DEFAULT_UPLOAD_SETTINGS = {
    "portal_url": "https://portal.mrsmku.edu.my",
    "claim_code_prefix": "CLAIM",
    "auto_approve": False
}

@app.get("/api/settings/upload")
async def get_upload_settings(current_user: dict = Depends(get_current_user)):
    """Get upload data pelajar settings"""
    if current_user.get("role") not in ["superadmin", "admin", "guru_kelas", "guru_homeroom"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    
    config = await db.settings.find_one({"type": "upload_settings"})
    if config:
        return {
            "portal_url": config.get("portal_url", DEFAULT_UPLOAD_SETTINGS["portal_url"]),
            "claim_code_prefix": config.get("claim_code_prefix", DEFAULT_UPLOAD_SETTINGS["claim_code_prefix"]),
            "auto_approve": config.get("auto_approve", DEFAULT_UPLOAD_SETTINGS["auto_approve"])
        }
    return DEFAULT_UPLOAD_SETTINGS

@app.post("/api/settings/upload")
async def save_upload_settings(data: dict, current_user: dict = Depends(get_current_user)):
    """Save upload data pelajar settings (SuperAdmin only)"""
    if current_user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Hanya SuperAdmin boleh mengurus tetapan ini")
    
    await db.settings.update_one(
        {"type": "upload_settings"},
        {"$set": {
            "type": "upload_settings",
            "portal_url": data.get("portal_url", DEFAULT_UPLOAD_SETTINGS["portal_url"]),
            "claim_code_prefix": data.get("claim_code_prefix", DEFAULT_UPLOAD_SETTINGS["claim_code_prefix"]),
            "auto_approve": data.get("auto_approve", DEFAULT_UPLOAD_SETTINGS["auto_approve"]),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": str(current_user.get("_id"))
        }},
        upsert=True
    )
    
    await log_audit(current_user, "UPLOAD_SETTINGS_UPDATED", "settings", f"Portal URL: {data.get('portal_url')}")
    
    return {"message": "Tetapan upload berjaya disimpan"}

# ============ HEALTH CHECK ============

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
