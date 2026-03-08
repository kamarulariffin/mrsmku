"""
Seed Yuran Data - Create test data for Parent Yuran Dashboard
This script creates:
1. Parent user: parent@muafakat.link
2. 4 children (students) linked to parent
3. Fee Sets (Set Yuran) for T2-T5 for years 2024-2026
4. Student Yuran records with various payment statuses
"""
import asyncio
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import hashlib

# MongoDB connection
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "mrsm_portal")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]


def hash_password(password: str) -> str:
    """Simple SHA256 hash for password"""
    return hashlib.sha256(password.encode()).hexdigest()


async def seed_data():
    print("=" * 60)
    print("SEEDING YURAN DATA FOR PARENT DASHBOARD DEMO")
    print("=" * 60)
    
    # 1. Create/Update Parent User
    print("\n[1] Creating Parent User...")
    parent_id = ObjectId()
    parent_data = {
        "_id": parent_id,
        "email": "parent@muafakat.link",
        "password": hash_password("parent123"),
        "full_name": "Encik Kamal bin Hassan",
        "role": "parent",
        "phone": "0123456789",
        "status": "approved",
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Check if parent exists
    existing_parent = await db.users.find_one({"email": "parent@muafakat.link"})
    if existing_parent:
        parent_id = existing_parent["_id"]
        print(f"  -> Parent exists, using ID: {parent_id}")
    else:
        await db.users.insert_one(parent_data)
        print(f"  -> Created Parent: {parent_data['full_name']} (ID: {parent_id})")
    
    # Also create second parent
    parent2_id = ObjectId()
    parent2_data = {
        "_id": parent2_id,
        "email": "parent2@muafakat.link",
        "password": hash_password("parent123"),
        "full_name": "Puan Fatimah binti Ahmad",
        "role": "parent",
        "phone": "0129876543",
        "status": "approved",
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    existing_parent2 = await db.users.find_one({"email": "parent2@muafakat.link"})
    if existing_parent2:
        parent2_id = existing_parent2["_id"]
    else:
        await db.users.insert_one(parent2_data)
        print(f"  -> Created Parent 2: {parent2_data['full_name']}")
    
    # 2. Create Children (Students)
    print("\n[2] Creating Students...")
    
    # Delete existing test students first
    await db.students.delete_many({"parent_id": {"$in": [parent_id, parent2_id]}})
    
    children = [
        {
            "_id": ObjectId(),
            "full_name": "Nur Aisyah binti Kamal",
            "matric_number": "MRSM2024001",
            "parent_id": parent_id,
            "form": 2,
            "year": 2026,
            "class_name": "A",
            "status": "approved",
            "gender": "female",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "_id": ObjectId(),
            "full_name": "Muhammad Izzat bin Kamal",
            "matric_number": "MRSM2024002",
            "parent_id": parent_id,
            "form": 3,
            "year": 2026,
            "class_name": "B",
            "status": "approved",
            "gender": "male",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "_id": ObjectId(),
            "full_name": "Ahmad Farhan bin Kamal",
            "matric_number": "MRSM2024003",
            "parent_id": parent_id,
            "form": 4,
            "year": 2026,
            "class_name": "4 Dinamik",
            "status": "approved",
            "gender": "male",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "_id": ObjectId(),
            "full_name": "Siti Aminah binti Kamal",
            "matric_number": "MRSM2024004",
            "parent_id": parent_id,
            "form": 5,
            "year": 2026,
            "class_name": "5 Elit",
            "status": "approved",
            "gender": "female",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    
    for child in children:
        await db.students.insert_one(child)
        print(f"  -> Created: {child['full_name']} ({child['class_name']})")
    
    # 3. Create Fee Sets (Set Yuran)
    print("\n[3] Creating Fee Sets (Set Yuran)...")
    
    # Delete existing set_yuran for clean setup
    await db.set_yuran.delete_many({})
    await db.student_yuran.delete_many({})
    
    # Standard fee structure
    def create_fee_categories(tingkatan):
        base_fees = {
            "MUAFAKAT": {
                "Yuran Tetap Muafakat": [
                    {"code": "M01", "name": "Yuran Pendaftaran", "amount": 50.00, "mandatory": True},
                    {"code": "M02", "name": "Yuran Keahlian Tahunan", "amount": 100.00, "mandatory": True},
                    {"code": "M03", "name": "Tabung Kebajikan", "amount": 30.00, "mandatory": True},
                ],
                "Yuran Aktiviti": [
                    {"code": "M04", "name": "Aktiviti Ko-Kurikulum", "amount": 80.00, "mandatory": True},
                    {"code": "M05", "name": "Majlis Tahunan", "amount": 50.00, "mandatory": True},
                ]
            },
            "KOPERASI": {
                "Yuran Asrama": [
                    {"code": "K01", "name": "Yuran Penginapan", "amount": 200.00, "mandatory": True},
                    {"code": "K02", "name": "Yuran Makan (Tahunan)", "amount": 1800.00, "mandatory": True},
                    {"code": "K03", "name": "Yuran Dobi", "amount": 150.00, "mandatory": True},
                ],
                "Yuran Utiliti": [
                    {"code": "K04", "name": "Elektrik & Air", "amount": 120.00, "mandatory": True},
                    {"code": "K05", "name": "Internet & WiFi", "amount": 100.00, "mandatory": True},
                ]
            },
            "PUM": {
                "Yuran PUM": [
                    {"code": "P01", "name": "Sumbangan Pembangunan", "amount": 200.00, "mandatory": True},
                    {"code": "P02", "name": "Tabung Kecemasan", "amount": 50.00, "mandatory": False},
                ]
            }
        }
        
        categories = []
        for cat_name, sub_cats in base_fees.items():
            sub_categories = []
            for sub_name, items in sub_cats.items():
                sub_categories.append({
                    "name": sub_name,
                    "items": [
                        {
                            "code": item["code"],
                            "name": item["name"],
                            "amount": item["amount"],
                            "mandatory": item["mandatory"],
                            "description": f"{item['name']} untuk Tingkatan {tingkatan}"
                        }
                        for item in items
                    ]
                })
            categories.append({
                "name": cat_name,
                "sub_categories": sub_categories
            })
        return categories
    
    def calculate_total(categories):
        total = 0
        for cat in categories:
            for sub in cat.get("sub_categories", []):
                for item in sub.get("items", []):
                    total += item.get("amount", 0)
        return total
    
    # Create Set Yuran for T1-T5 for 2024, 2025, 2026
    set_yuran_docs = []
    for tahun in [2024, 2025, 2026]:
        for tingkatan in [1, 2, 3, 4, 5]:
            categories = create_fee_categories(tingkatan)
            total = calculate_total(categories)
            set_yuran_docs.append({
                "_id": ObjectId(),
                "tahun": tahun,
                "tingkatan": tingkatan,
                "nama": f"Set Yuran Tingkatan {tingkatan} Tahun {tahun}",
                "categories": categories,
                "total_amount": total,
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "created_by": str(parent_id),
                "created_by_name": "System"
            })
    
    await db.set_yuran.insert_many(set_yuran_docs)
    print(f"  -> Created {len(set_yuran_docs)} fee sets for years 2024-2026, T1-T5")
    
    # 4. Assign Yuran to Students with Different Statuses
    print("\n[4] Assigning Yuran to Students...")
    
    # Helper to get set_yuran
    async def get_set_yuran(tahun, tingkatan):
        return await db.set_yuran.find_one({"tahun": tahun, "tingkatan": tingkatan})
    
    # Helper to create student_yuran
    def create_student_yuran(student, set_yuran, paid_amount, status):
        items = []
        for cat in set_yuran.get("categories", []):
            for sub in cat.get("sub_categories", []):
                for item in sub.get("items", []):
                    item_paid = paid_amount > 0 and status != "pending"
                    items.append({
                        "category": cat.get("name"),
                        "sub_category": sub.get("name"),
                        "code": item.get("code"),
                        "name": item.get("name"),
                        "amount": item.get("amount"),
                        "mandatory": item.get("mandatory", True),
                        "paid": item_paid if status == "paid" else False,
                        "paid_amount": item.get("amount") if item_paid and status == "paid" else 0,
                        "paid_date": datetime.now(timezone.utc).isoformat() if item_paid and status == "paid" else None
                    })
        
        return {
            "_id": ObjectId(),
            "student_id": student["_id"],
            "student_name": student["full_name"],
            "matric_number": student["matric_number"],
            "parent_id": student["parent_id"],
            "tahun": set_yuran["tahun"],
            "tingkatan": set_yuran["tingkatan"],
            "set_yuran_id": set_yuran["_id"],
            "set_yuran_nama": set_yuran["nama"],
            "items": items,
            "total_amount": set_yuran["total_amount"],
            "paid_amount": paid_amount,
            "status": status,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "payments": [
                {
                    "amount": paid_amount,
                    "payment_method": "fpx",
                    "receipt_number": f"RCP-{datetime.now().strftime('%Y%m%d')}-{str(student['_id'])[-4:]}",
                    "paid_at": datetime.now(timezone.utc).isoformat(),
                    "paid_by": str(student["parent_id"]),
                    "paid_by_name": "Parent"
                }
            ] if paid_amount > 0 else []
        }
    
    student_yuran_records = []
    
    # Nur Aisyah (T2, 2026) - FULLY PAID - TAHNIAH case
    child_aisyah = children[0]
    set_yuran = await get_set_yuran(2026, 2)
    if set_yuran:
        student_yuran_records.append(
            create_student_yuran(child_aisyah, set_yuran, set_yuran["total_amount"], "paid")
        )
        print(f"  -> {child_aisyah['full_name']}: T2 2026 - PAID (RM {set_yuran['total_amount']:.2f})")
    
    # Muhammad Izzat (T3, 2026) - Has outstanding from T2 (2025) and partial T3
    child_izzat = children[1]
    
    # T2 2025 - Not paid (outstanding)
    set_yuran_t2_2025 = await get_set_yuran(2025, 2)
    if set_yuran_t2_2025:
        student_yuran_records.append(
            create_student_yuran(child_izzat, set_yuran_t2_2025, 0, "pending")
        )
        print(f"  -> {child_izzat['full_name']}: T2 2025 - PENDING (RM 0/{set_yuran_t2_2025['total_amount']:.2f})")
    
    # T3 2026 - Partial
    set_yuran_t3_2026 = await get_set_yuran(2026, 3)
    if set_yuran_t3_2026:
        paid = set_yuran_t3_2026["total_amount"] * 0.4  # 40% paid
        student_yuran_records.append(
            create_student_yuran(child_izzat, set_yuran_t3_2026, paid, "partial")
        )
        print(f"  -> {child_izzat['full_name']}: T3 2026 - PARTIAL (RM {paid:.2f}/{set_yuran_t3_2026['total_amount']:.2f})")
    
    # Ahmad Farhan (T4, 2026) - Outstanding from T3 (2025) and T4 (2026)
    child_farhan = children[2]
    
    # T3 2025 - Not paid
    set_yuran_t3_2025 = await get_set_yuran(2025, 3)
    if set_yuran_t3_2025:
        student_yuran_records.append(
            create_student_yuran(child_farhan, set_yuran_t3_2025, 0, "pending")
        )
        print(f"  -> {child_farhan['full_name']}: T3 2025 - PENDING (RM 0/{set_yuran_t3_2025['total_amount']:.2f})")
    
    # T4 2026 - Partial (30%)
    set_yuran_t4_2026 = await get_set_yuran(2026, 4)
    if set_yuran_t4_2026:
        paid = set_yuran_t4_2026["total_amount"] * 0.3
        student_yuran_records.append(
            create_student_yuran(child_farhan, set_yuran_t4_2026, paid, "partial")
        )
        print(f"  -> {child_farhan['full_name']}: T4 2026 - PARTIAL (RM {paid:.2f}/{set_yuran_t4_2026['total_amount']:.2f})")
    
    # Siti Aminah (T5, 2026) - Outstanding from T4 (2025), T5 partial
    child_aminah = children[3]
    
    # T4 2025 - Partial (60%)
    set_yuran_t4_2025 = await get_set_yuran(2025, 4)
    if set_yuran_t4_2025:
        paid = set_yuran_t4_2025["total_amount"] * 0.6
        student_yuran_records.append(
            create_student_yuran(child_aminah, set_yuran_t4_2025, paid, "partial")
        )
        print(f"  -> {child_aminah['full_name']}: T4 2025 - PARTIAL (RM {paid:.2f}/{set_yuran_t4_2025['total_amount']:.2f})")
    
    # T5 2026 - Pending
    set_yuran_t5_2026 = await get_set_yuran(2026, 5)
    if set_yuran_t5_2026:
        student_yuran_records.append(
            create_student_yuran(child_aminah, set_yuran_t5_2026, 0, "pending")
        )
        print(f"  -> {child_aminah['full_name']}: T5 2026 - PENDING (RM 0/{set_yuran_t5_2026['total_amount']:.2f})")
    
    if student_yuran_records:
        await db.student_yuran.insert_many(student_yuran_records)
    
    print("\n" + "=" * 60)
    print("SEED COMPLETED SUCCESSFULLY!")
    print("=" * 60)
    print("\nLogin Credentials:")
    print("  Email: parent@muafakat.link")
    print("  Password: parent123")
    print("\nChildren Summary:")
    print("  1. Nur Aisyah (T2) - SELESAI / TAHNIAH")
    print("  2. Muhammad Izzat (T3) - ADA TUNGGAKAN dari T2 2025")
    print("  3. Ahmad Farhan (T4) - ADA TUNGGAKAN dari T3 2025")
    print("  4. Siti Aminah (T5) - ADA TUNGGAKAN dari T4 2025")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(seed_data())
