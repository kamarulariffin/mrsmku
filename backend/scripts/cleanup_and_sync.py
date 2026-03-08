"""
Script Pembersihan dan Sinkronisasi Data MRSMKU
- Buang data tidak berguna
- Tambah field Bangsa
- Tukar nama pelajar bukan Islam kepada nama etnik sebenar
- Pastikan semua pelajar ada email dan password
- Sinkronkan hubungan ibu bapa - anak
"""
import asyncio
import random
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from datetime import datetime, timezone
import os
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "mrsm_portal")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ============ DATA CONSTANTS ============

BANGSA_OPTIONS = [
    "Melayu",
    "Cina", 
    "India",
    "Bumiputera Sabah",
    "Bumiputera Sarawak",
    "Lain-lain"
]

# Nama mengikut bangsa dan agama
NAMA_MELAYU_LELAKI = [
    "Muhammad Aiman bin Razali",
    "Ahmad Danial bin Zainal", 
    "Mohd Faiz bin Abdullah",
    "Muhammad Hafiz bin Mohd Yusof",
    "Muhammad Arif bin Ismail",
    "Ahmad Farhan bin Hassan",
    "Muhammad Irfan bin Kamal",
    "Amirul Hakim bin Othman",
    "Muhammad Syafiq bin Rahman",
    "Ahmad Zikri bin Mohd Nor"
]

NAMA_MELAYU_PEREMPUAN = [
    "Nurul Aisyah binti Ahmad",
    "Siti Aminah binti Hassan",
    "Fatimah binti Osman",
    "Nur Hidayah binti Rahman",
    "Aisyah binti Kamal",
    "Nurul Athirah binti Mohd Ali",
    "Siti Nurhaliza binti Ibrahim",
    "Nur Izzati binti Razak",
    "Anis Safiah binti Zakaria",
    "Nurul Huda binti Samad"
]

NAMA_CINA_LELAKI = [
    "Tan Kah Kee",
    "Lee Chong Wei",
    "Lim Wei Ming",
    "Wong Jun Jie",
    "Ng Zhi Xuan",
    "Chan Wai Keong",
    "Ong Jia Hao",
    "Goh Wei Liang",
    "Teo Jun Kit",
    "Koh Boon Seng"
]

NAMA_CINA_PEREMPUAN = [
    "Lim Mei Ling",
    "Tan Siew Mei",
    "Wong Xin Yi",
    "Lee Hui Wen",
    "Ng Pei Shan",
    "Chan Mei Yee",
    "Ong Jia Wen",
    "Goh Hui Ling",
    "Teo Xin Hui",
    "Koh Shu Ting"
]

NAMA_INDIA_LELAKI = [
    "Gopal A/L Murugan",
    "Kumar A/L Rajan",
    "Rajesh A/L Subramaniam",
    "Vikram A/L Krishnan",
    "Arun A/L Samy",
    "Shankar A/L Nair",
    "Praveen A/L Selvam",
    "Dinesh A/L Muthusamy",
    "Karthik A/L Anandan",
    "Ramesh A/L Pillai"
]

NAMA_INDIA_PEREMPUAN = [
    "Priya A/P Rajan",
    "Kavitha A/P Subramaniam",
    "Lakshmi A/P Krishnan",
    "Deepa A/P Nair",
    "Anitha A/P Selvam",
    "Shalini A/P Muthusamy",
    "Gayathri A/P Anandan",
    "Revathi A/P Pillai",
    "Suganthi A/P Kumar",
    "Thenmozhi A/P Samy"
]

NAMA_BUMIPUTERA_SABAH = [
    "John Anak Linus",
    "Peter Bin Jikun",
    "Mary Anak Gakim",
    "Grace Binti Juman",
    "David Anak Saging"
]

NAMA_BUMIPUTERA_SARAWAK = [
    "James Anak Ngalih",
    "Paul Anak Kana",
    "Ruth Anak Janting",
    "Sarah Anak Mujah",
    "Daniel Anak Nyabong"
]

# Kelas-kelas
KELAS = ["A", "B", "C", "D", "E", "F"]

# Blok asrama
BLOK_LELAKI = ["Blok A", "Blok B", "Blok C"]
BLOK_PEREMPUAN = ["Blok D", "Blok E", "Blok F"]

# Negeri
NEGERI = ["Selangor", "Johor", "Perak", "Kedah", "Pahang", "Kelantan", "Terengganu", "Melaka", "Pulau Pinang", "Sabah", "Sarawak", "Perlis", "Negeri Sembilan"]

async def cleanup_and_sync():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    print("=" * 70)
    print("PEMBERSIHAN DAN SINKRONISASI DATA MRSMKU")
    print("=" * 70)
    
    # ============ STEP 1: Buang data tidak berguna ============
    print("\n[STEP 1] Membersihkan data tidak berguna...")
    
    # Delete test students (nama bermula dengan "Test Student")
    test_students = await db.students.delete_many({"full_name": {"$regex": "^Test Student"}})
    print(f"   - Padam {test_students.deleted_count} test students")
    
    # Delete orphan pelajar users (pelajar tanpa student record)
    pelajar_users = await db.users.find({"role": "pelajar"}).to_list(1000)
    orphan_deleted = 0
    for user in pelajar_users:
        student = await db.students.find_one({"user_id": user["_id"]})
        if not student:
            # Check by matric number
            if user.get("matric_number"):
                student = await db.students.find_one({"matric_number": user.get("matric_number")})
            if not student:
                await db.users.delete_one({"_id": user["_id"]})
                orphan_deleted += 1
    print(f"   - Padam {orphan_deleted} orphan pelajar users")
    
    # Delete parents without children
    parents = await db.users.find({"role": "parent"}).to_list(1000)
    parents_deleted = 0
    for parent in parents:
        children = await db.students.count_documents({"parent_id": parent["_id"]})
        if children == 0:
            await db.users.delete_one({"_id": parent["_id"]})
            parents_deleted += 1
    print(f"   - Padam {parents_deleted} parents tanpa anak")
    
    # Delete duplicate superadmin (keep only first one)
    superadmins = await db.users.find({"role": "superadmin"}).sort("created_at", 1).to_list(10)
    if len(superadmins) > 1:
        for sa in superadmins[1:]:
            await db.users.delete_one({"_id": sa["_id"]})
        print(f"   - Padam {len(superadmins) - 1} duplicate superadmin")
    
    # ============ STEP 2: Pastikan staff roles lengkap ============
    print("\n[STEP 2] Memastikan staff roles lengkap...")
    
    # Check and create Sub Bendahari if not exists
    sub_bendahari = await db.users.find_one({"role": "sub_bendahari"})
    if not sub_bendahari:
        await db.users.insert_one({
            "email": "sub_bendahari@muafakat.link",
            "password": pwd_context.hash("subbendahari123"),
            "full_name": "Puan Fatimah Sub Bendahari",
            "phone": "0126667700",
            "role": "sub_bendahari",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        print("   - Cipta Sub Bendahari")
    else:
        print("   - Sub Bendahari sudah wujud")
    
    # ============ STEP 3: Buang semua students dan buat data baru ============
    print("\n[STEP 3] Mencipta data pelajar baru dengan nama etnik sebenar...")
    
    # Delete all existing students
    await db.students.delete_many({})
    
    # Delete all pelajar users
    await db.users.delete_many({"role": "pelajar"})
    
    # Delete all parents
    await db.users.delete_many({"role": "parent"})
    
    print("   - Padam semua data pelajar dan parents lama")
    
    # Create new students with proper ethnic names
    # Total: 50 students (70% Muslim, 30% Non-Muslim)
    # Distribution: T1=10, T2=10, T3=10, T4=10, T5=10
    
    students_created = []
    parents_created = []
    
    for tingkatan in range(1, 6):
        # 7 Muslim + 3 Non-Muslim per tingkatan
        
        # Muslim students (Melayu)
        for i in range(7):
            is_male = i % 2 == 0
            nama = random.choice(NAMA_MELAYU_LELAKI if is_male else NAMA_MELAYU_PEREMPUAN)
            # Make sure name is unique
            while any(s["full_name"] == nama for s in students_created):
                nama = random.choice(NAMA_MELAYU_LELAKI if is_male else NAMA_MELAYU_PEREMPUAN)
                # Add suffix if still duplicate
                nama = nama + f" {random.randint(1,99)}"
            
            matric = f"M2026{tingkatan:01d}{i+1:02d}"
            ic = f"11{tingkatan:02d}0{i+1:01d}-{random.randint(10,14)}-{random.randint(1000,9999)}"
            
            students_created.append({
                "full_name": nama,
                "matric_number": matric,
                "ic_number": ic,
                "year": 2026,
                "form": tingkatan,
                "class_name": KELAS[i % len(KELAS)],
                "block_name": random.choice(BLOK_LELAKI if is_male else BLOK_PEREMPUAN),
                "room_number": f"{random.choice(['A','B','C','D','E'])}{random.randint(101, 310)}",
                "state": random.choice(NEGERI),
                "religion": "Islam",
                "bangsa": "Melayu",
                "status": "approved",
                "created_at": datetime.now(timezone.utc).isoformat()
            })
        
        # Non-Muslim students (1 Cina, 1 India, 1 random)
        non_muslim_configs = [
            {"bangsa": "Cina", "religion": "Buddha", "nama_l": NAMA_CINA_LELAKI, "nama_p": NAMA_CINA_PEREMPUAN},
            {"bangsa": "India", "religion": "Hindu", "nama_l": NAMA_INDIA_LELAKI, "nama_p": NAMA_INDIA_PEREMPUAN},
            {"bangsa": random.choice(["Bumiputera Sabah", "Bumiputera Sarawak"]), "religion": "Kristian", "nama_l": NAMA_BUMIPUTERA_SABAH, "nama_p": NAMA_BUMIPUTERA_SARAWAK}
        ]
        
        for j, config in enumerate(non_muslim_configs):
            is_male = j % 2 == 0
            nama = random.choice(config["nama_l"] if is_male else config["nama_p"])
            while any(s["full_name"] == nama for s in students_created):
                nama = random.choice(config["nama_l"] if is_male else config["nama_p"])
            
            matric = f"M2026{tingkatan:01d}{7+j+1:02d}"
            ic = f"11{tingkatan:02d}0{7+j+1:01d}-{random.randint(10,14)}-{random.randint(1000,9999)}"
            
            students_created.append({
                "full_name": nama,
                "matric_number": matric,
                "ic_number": ic,
                "year": 2026,
                "form": tingkatan,
                "class_name": KELAS[(7+j) % len(KELAS)],
                "block_name": random.choice(BLOK_LELAKI if is_male else BLOK_PEREMPUAN),
                "room_number": f"{random.choice(['A','B','C','D','E'])}{random.randint(101, 310)}",
                "state": random.choice(NEGERI),
                "religion": config["religion"],
                "bangsa": config["bangsa"],
                "status": "approved",
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    
    print(f"   - Mencipta {len(students_created)} pelajar baru")
    
    # ============ STEP 4: Cipta parents dan link dengan students ============
    print("\n[STEP 4] Mencipta ibu bapa dan menghubungkan dengan anak...")
    
    # Group students by family (every 2 students = 1 family)
    for i in range(0, len(students_created), 2):
        student1 = students_created[i]
        student2 = students_created[i+1] if i+1 < len(students_created) else None
        
        # Create parent based on first child's ethnicity
        if student1["bangsa"] == "Melayu":
            parent_name = f"Encik {student1['full_name'].split()[-1]} bin Ahmad" if "bin" in student1["full_name"] else f"Puan {student1['full_name'].split()[-1]} binti Ahmad"
        elif student1["bangsa"] == "Cina":
            surname = student1["full_name"].split()[0]
            parent_name = f"{surname} Ah Kow" if random.choice([True, False]) else f"{surname} Mei Lan"
        elif student1["bangsa"] == "India":
            parent_name = f"Encik {student1['full_name'].split()[-1]}" if "A/L" in student1["full_name"] else f"Puan {student1['full_name'].split()[-1]}"
        else:
            parent_name = f"Encik/Puan {student1['full_name'].split()[0]}"
        
        parent_email = f"parent{i//2 + 1}@muafakat.link"
        
        parent_doc = {
            "email": parent_email,
            "password": pwd_context.hash("parent123"),
            "full_name": parent_name,
            "phone": f"01{random.randint(10000000, 99999999)}",
            "ic_number": f"7{random.randint(10101, 91231)}-{random.randint(10,14)}-{random.randint(1000,9999)}",
            "role": "parent",
            "religion": student1["religion"],
            "bangsa": student1["bangsa"],
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        parent_result = await db.users.insert_one(parent_doc)
        parent_id = parent_result.inserted_id
        
        parents_created.append({
            "id": parent_id,
            "email": parent_email,
            "name": parent_name,
            "children": [student1["full_name"]]
        })
        
        # Link students to parent
        student1["parent_id"] = parent_id
        if student2:
            student2["parent_id"] = parent_id
            parents_created[-1]["children"].append(student2["full_name"])
    
    print(f"   - Mencipta {len(parents_created)} ibu bapa")
    
    # ============ STEP 5: Insert students dan cipta user accounts ============
    print("\n[STEP 5] Memasukkan data pelajar dan mencipta akaun login...")
    
    for student in students_created:
        # Insert student record
        student_result = await db.students.insert_one(student)
        student_id = student_result.inserted_id
        
        # Create user account for student
        email = f"{student['matric_number'].lower()}@pelajar.mrsm.edu.my"
        user_doc = {
            "email": email,
            "password": pwd_context.hash("pelajar123"),
            "full_name": student["full_name"],
            "phone": f"01{random.randint(10000000, 99999999)}",
            "ic_number": student["ic_number"],
            "matric_number": student["matric_number"],
            "role": "pelajar",
            "religion": student["religion"],
            "bangsa": student["bangsa"],
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        user_result = await db.users.insert_one(user_doc)
        
        # Update student with user_id
        await db.students.update_one(
            {"_id": student_id},
            {"$set": {"user_id": user_result.inserted_id}}
        )
    
    print(f"   - Semua pelajar kini ada email dan password")
    
    # ============ STEP 6: Generate Report ============
    print("\n" + "=" * 70)
    print("LAPORAN DATA PELAJAR")
    print("=" * 70)
    
    # Count by religion
    muslim = await db.students.count_documents({"religion": "Islam"})
    non_muslim = await db.students.count_documents({"religion": {"$ne": "Islam"}})
    total = muslim + non_muslim
    
    print(f"\n📊 JUMLAH PELAJAR:")
    print(f"   Total: {total}")
    print(f"   Muslim: {muslim} ({muslim/total*100:.1f}%)")
    print(f"   Bukan Islam: {non_muslim} ({non_muslim/total*100:.1f}%)")
    
    # Count by bangsa
    print(f"\n📊 PECAHAN MENGIKUT BANGSA:")
    for bangsa in BANGSA_OPTIONS:
        count = await db.students.count_documents({"bangsa": bangsa})
        if count > 0:
            print(f"   {bangsa}: {count} ({count/total*100:.1f}%)")
    
    # Count by religion breakdown
    print(f"\n📊 PECAHAN MENGIKUT AGAMA:")
    religions = ["Islam", "Buddha", "Hindu", "Kristian", "Sikh", "Lain-lain"]
    for religion in religions:
        count = await db.students.count_documents({"religion": religion})
        if count > 0:
            print(f"   {religion}: {count}")
    
    # Sample data
    print(f"\n📋 SENARAI PELAJAR (CONTOH 10 PERTAMA):")
    students = await db.students.find({}).limit(10).to_list(10)
    for i, s in enumerate(students, 1):
        parent = await db.users.find_one({"_id": s.get("parent_id")})
        parent_name = parent.get("full_name", "N/A") if parent else "N/A"
        print(f"   {i}. {s['full_name']}")
        print(f"      Matric: {s['matric_number']} | T{s['form']} | {s['religion']} | {s['bangsa']}")
        print(f"      Ibu Bapa: {parent_name}")
    
    # ============ FINAL SUMMARY ============
    print("\n" + "=" * 70)
    print("RINGKASAN AKHIR")
    print("=" * 70)
    
    total_users = await db.users.count_documents({})
    total_students = await db.students.count_documents({})
    total_parents = await db.users.count_documents({"role": "parent"})
    total_pelajar_users = await db.users.count_documents({"role": "pelajar"})
    
    print(f"\n   Total Users: {total_users}")
    print(f"   Total Students: {total_students}")
    print(f"   Total Parents: {total_parents}")
    print(f"   Total Pelajar Users: {total_pelajar_users}")
    
    # Verify all students have user accounts
    students_with_users = await db.students.count_documents({"user_id": {"$exists": True}})
    print(f"\n   ✅ Students dengan user account: {students_with_users}/{total_students}")
    
    client.close()
    print("\n✅ Pembersihan dan sinkronisasi selesai!")

if __name__ == "__main__":
    asyncio.run(cleanup_and_sync())
