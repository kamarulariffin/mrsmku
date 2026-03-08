"""
Seed Bus Module Data - Data DEMO untuk modul bas.

Data ini boleh diubah suai atau diganti dengan data sebenar pada masa akan datang:
- Melalui paparan Admin Bas (Syarikat Bas, Bas, Route, Pemandu) – edit/padam/tambah terus dalam sistem.
- Atau hentikan penggunaan seed (jangan jalankan seed_bus_data) dan isi data sebenar melalui pendaftaran
  syarikat (/bus/register) dan urusan Admin Bas.

Membuat:
1. 4 syarikat bas (permohonan lengkap, status approved)
2. 4 bas setiap syarikat (16 bas, butiran lengkap)
3. Route setiap syarikat dengan lokasi pickup & drop-off
4. 4 driver bas (pemandu) – assign satu bas setiap syarikat
"""
import asyncio
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from passlib.context import CryptContext
import os

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "mrsm_portal")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

NOW = datetime.now(timezone.utc).isoformat()
CREATED_BY = "seed_bus_data"

# 4 Syarikat bas DEMO – boleh edit melalui Admin Bas atau ganti dengan data real nanti
COMPANIES = [
    {
        "name": "Bas Ekspres Kuantan Sdn Bhd",
        "registration_number": "202001000001",
        "entity_type": "Sdn Bhd",
        "address": "Lot 12, Jalan Industri 1, Taman Perindustrian Gebeng, 26080 Kuantan, Pahang",
        "postcode": "26080",
        "city": "Kuantan",
        "state": "Pahang",
        "director_name": "Ahmad bin Abdullah",
        "director_ic_passport": "800101-01-1234",
        "phone": "09-1234567",
        "email": "admin@basekspreskuantan.com.my",
        "pic_name": "Siti Nurhaliza binti Ahmad",
        "pic_phone": "012-3456789",
        "apad_license_no": "APAD-PHN-2020-001",
        "apad_expiry_date": "2026-12-31",
        "officer_notes": "Permohonan diluluskan. Semua dokumen lengkap.",
    },
    {
        "name": "Lembah Express Transport Sdn Bhd",
        "registration_number": "202002000002",
        "entity_type": "Sdn Bhd",
        "address": "No. 45, Jalan Tun Razak, 50400 Kuala Lumpur",
        "postcode": "50400",
        "city": "Kuala Lumpur",
        "state": "Wilayah Persekutuan",
        "director_name": "Mohd Razak bin Hassan",
        "director_ic_passport": "780515-14-5678",
        "phone": "03-23456789",
        "email": "info@lembahexpress.com.my",
        "pic_name": "Farah Liyana binti Razak",
        "pic_phone": "019-8765432",
        "apad_license_no": "APAD-KL-2020-002",
        "apad_expiry_date": "2026-06-30",
        "officer_notes": "Syarikat beroperasi laluan Kuantan-KL.",
    },
    {
        "name": "Perkhidmatan Bas MRSM Enterprise",
        "registration_number": "202003000003",
        "entity_type": "Enterprise",
        "address": "No. 8, Jalan Semambu, 25350 Kuantan, Pahang",
        "postcode": "25350",
        "city": "Kuantan",
        "state": "Pahang",
        "director_name": "Ismail bin Yusof",
        "director_ic_passport": "850220-08-9012",
        "phone": "09-8765432",
        "email": "contact@basmrsm.com.my",
        "pic_name": "Nurul Izzati binti Ismail",
        "pic_phone": "011-23456789",
        "apad_license_no": "APAD-PHN-2021-003",
        "apad_expiry_date": "2025-12-31",
        "officer_notes": "Fokus perkhidmatan pelajar MRSM.",
    },
    {
        "name": "Syarikat Bas Timur Coast Sdn Bhd",
        "registration_number": "202004000004",
        "entity_type": "Sdn Bhd",
        "address": "Kompleks Pengangkutan Timur, Jalan Gambang, 25150 Kuantan, Pahang",
        "postcode": "25150",
        "city": "Kuantan",
        "state": "Pahang",
        "director_name": "Wong Siew Lee",
        "director_ic_passport": "920330-14-3456",
        "phone": "09-5551234",
        "email": "admin@timurcoastbus.com.my",
        "pic_name": "Ahmad Firdaus bin Wong",
        "pic_phone": "017-3456789",
        "apad_license_no": "APAD-PHN-2022-004",
        "apad_expiry_date": "2026-03-31",
        "officer_notes": "Laluan pantai timur dan KL.",
    },
]

# 4 bas setiap syarikat - plat unik, butiran lengkap (boleh diubah suai)
def make_buses(company_id: ObjectId, plate_prefix: str):
    return [
        {
            "company_id": company_id,
            "plate_number": f"{plate_prefix} 1001",
            "bus_type": "persiaran",
            "total_seats": 45,
            "brand": "Scania",
            "model": "Touring",
            "year": 2022,
            "amenities": ["Air cond", "WiFi", "USB charging"],
            "chassis_no": "YS2R4X20002212345",
            "engine_no": "D12345678",
            "year_manufactured": 2022,
            "bus_category": "persiaran",
            "color": "Putih biru",
            "ownership_status": "Milik sendiri",
            "operation_start_date": "2022-03-01",
            "permit_no": "PHN-2022-001",
            "permit_expiry": "2025-12-31",
            "puspakom_date": "2024-06-15",
            "puspakom_result": "Lulus",
            "insurance_company": "Takaful Malaysia",
            "insurance_expiry": "2025-12-31",
            "is_active": True,
            "created_by": CREATED_BY,
            "created_at": NOW,
        },
        {
            "company_id": company_id,
            "plate_number": f"{plate_prefix} 1002",
            "bus_type": "persiaran",
            "total_seats": 44,
            "brand": "Hino",
            "model": "S'elega",
            "year": 2021,
            "amenities": ["Air cond", "Reclining seat"],
            "chassis_no": "JH2BK9650MC123456",
            "engine_no": "E87654321",
            "year_manufactured": 2021,
            "bus_category": "persiaran",
            "color": "Putih",
            "ownership_status": "Milik sendiri",
            "operation_start_date": "2021-07-01",
            "permit_no": "PHN-2021-002",
            "permit_expiry": "2025-06-30",
            "puspakom_date": "2024-03-10",
            "puspakom_result": "Lulus",
            "insurance_company": "Etiqa",
            "insurance_expiry": "2025-06-30",
            "is_active": True,
            "created_by": CREATED_BY,
            "created_at": NOW,
        },
        {
            "company_id": company_id,
            "plate_number": f"{plate_prefix} 1003",
            "bus_type": "sekolah",
            "total_seats": 35,
            "brand": "Isuzu",
            "model": "Journey",
            "year": 2023,
            "amenities": ["Air cond"],
            "chassis_no": "MP1TUB4321K123456",
            "engine_no": "F11223344",
            "year_manufactured": 2023,
            "bus_category": "sekolah",
            "color": "Kuning hitam",
            "ownership_status": "Sewa",
            "operation_start_date": "2023-01-15",
            "permit_no": "PHN-2023-003",
            "permit_expiry": "2026-01-31",
            "puspakom_date": "2024-09-01",
            "puspakom_result": "Lulus",
            "insurance_company": "Allianz",
            "insurance_expiry": "2026-01-31",
            "is_active": True,
            "created_by": CREATED_BY,
            "created_at": NOW,
        },
        {
            "company_id": company_id,
            "plate_number": f"{plate_prefix} 1004",
            "bus_type": "persiaran",
            "total_seats": 42,
            "brand": "Mercedes-Benz",
            "model": "Tourismo",
            "year": 2020,
            "amenities": ["Air cond", "WiFi", "Toilet"],
            "chassis_no": "WDB9632021L123456",
            "engine_no": "G55667788",
            "year_manufactured": 2020,
            "bus_category": "persiaran",
            "color": "Kelabu",
            "ownership_status": "Pajakan",
            "operation_start_date": "2020-09-01",
            "permit_no": "PHN-2020-004",
            "permit_expiry": "2025-09-30",
            "puspakom_date": "2024-01-20",
            "puspakom_result": "Lulus",
            "insurance_company": "MSIG",
            "insurance_expiry": "2025-09-30",
            "is_active": True,
            "created_by": CREATED_BY,
            "created_at": NOW,
        },
    ]


# Template route dengan lokasi pickup & drop-off (boleh diubah suai oleh admin bas)
def make_routes(company_id: ObjectId, company_index: int):
    """Setiap syarikat dapat 2 route dengan lokasi sample. Admin bas boleh edit lokasi."""
    # Route 1: Kuantan - KL (semua syarikat)
    route1 = {
        "company_id": company_id,
        "name": "Kuantan - Kuala Lumpur",
        "origin": "MRSMKU Kuantan",
        "destination": "TBS (Terminal Bersepadu Selatan)",
        "pickup_locations": [
            {"location": "Hentian Bandar Kuantan", "order": 1},
            {"location": "Toll Gambang", "order": 2},
        ],
        "drop_off_points": [
            {"location": "TBS (Terminal Bersepadu Selatan)", "price": 35.00, "order": 1},
            {"location": "KL Sentral", "price": 38.00, "order": 2},
            {"location": "Hentian Putra", "price": 32.00, "order": 3},
            {"location": "Masjid Wilayah", "price": 36.00, "order": 4},
        ],
        "base_price": 35.00,
        "estimated_duration": "3 jam 30 minit",
        "distance_km": 260.0,
        "trip_type": "one_way",
        "return_route_id": None,
        "is_active": True,
        "created_by": CREATED_BY,
        "created_at": NOW,
    }
    # Route 2: KL - Kuantan (return)
    route2 = {
        "company_id": company_id,
        "name": "Kuala Lumpur - Kuantan",
        "origin": "TBS (Terminal Bersepadu Selatan)",
        "destination": "MRSMKU Kuantan",
        "pickup_locations": [
            {"location": "KL Sentral", "order": 1},
            {"location": "Hentian Putra", "order": 2},
        ],
        "drop_off_points": [
            {"location": "MRSMKU Kuantan", "price": 35.00, "order": 1},
            {"location": "Hentian Bandar Kuantan", "price": 32.00, "order": 2},
            {"location": "Toll Gambang", "price": 28.00, "order": 3},
        ],
        "base_price": 35.00,
        "estimated_duration": "3 jam 45 minit",
        "distance_km": 260.0,
        "trip_type": "one_way",
        "return_route_id": None,
        "is_active": True,
        "created_by": CREATED_BY,
        "created_at": NOW,
    }
    # Route 3: Kuantan - JB (syarikat 1 & 2 sahaja)
    if company_index < 2:
        route3 = {
            "company_id": company_id,
            "name": "Kuantan - Johor Bahru",
            "origin": "MRSMKU Kuantan",
            "destination": "Larkin Sentral",
            "pickup_locations": [
                {"location": "Hentian Bandar Kuantan", "order": 1},
                {"location": "Pekan", "order": 2},
            ],
            "drop_off_points": [
                {"location": "Larkin Sentral", "price": 55.00, "order": 1},
                {"location": "Larkin Terminal", "price": 55.00, "order": 2},
                {"location": "Kulai", "price": 45.00, "order": 3},
            ],
            "base_price": 55.00,
            "estimated_duration": "5 jam",
            "distance_km": 380.0,
            "trip_type": "one_way",
            "return_route_id": None,
            "is_active": True,
            "created_by": CREATED_BY,
            "created_at": NOW,
        }
        return [route1, route2, route3]
    return [route1, route2]


# 4 Driver bas – data sample (boleh diubah suai; assigned_bus_id ikut bas syarikat)
DRIVERS = [
    {
        "email": "driver1@muafakat.link",
        "password": "driver123",
        "full_name": "Ahmad Fadzli bin Rahman",
        "phone": "012-3456701",
    },
    {
        "email": "driver2@muafakat.link",
        "password": "driver123",
        "full_name": "Mohd Hafiz bin Ismail",
        "phone": "012-3456702",
    },
    {
        "email": "driver3@muafakat.link",
        "password": "driver123",
        "full_name": "Zulkifli bin Hassan",
        "phone": "012-3456703",
    },
    {
        "email": "driver4@muafakat.link",
        "password": "driver123",
        "full_name": "Wong Chee Meng",
        "phone": "012-3456704",
    },
]


async def seed_bus_data_into(db_instance=None, silent=False, force=False):
    """Seed bus module data into the given db (or module-level db).
    silent=True for server startup (no print).
    force=True: padam data demo (created_by seed) dahulu kemudian masukkan semula."""
    use_db = db_instance if db_instance is not None else db

    if force:
        # Padam hanya dokumen demo (created_by seed) supaya boleh isi semula
        await use_db.bus_companies.delete_many({"created_by": CREATED_BY})
        await use_db.buses.delete_many({"created_by": CREATED_BY})
        await use_db.bus_routes.delete_many({"created_by": CREATED_BY})
        if not silent:
            print("Data demo bas (syarikat/bas/route) telah dipadam. Memasukkan data baru...")
    else:
        # Skip jika sudah ada data demo
        existing = await use_db.bus_companies.count_documents({"created_by": CREATED_BY})
        if existing > 0:
            if not silent:
                print("\nData bas sample sudah wujud. Untuk seed semula gunakan: python seed_bus_data.py --force")
            return

    if not silent:
        print("=" * 60)
        print("SEEDING BUS MODULE DATA (Sample)")
        print("=" * 60)

    company_ids = []
    plate_prefixes = ["BKK", "BCC", "BEE", "BTC"]  # Unik setiap syarikat

    # 1. Syarikat bas (4)
    if not silent:
        print("\n[1] Membuat 4 syarikat bas (permohonan diluluskan)...")
    for i, c in enumerate(COMPANIES):
        doc = {
            "name": c["name"],
            "registration_number": c["registration_number"],
            "entity_type": c["entity_type"],
            "address": c["address"],
            "postcode": c["postcode"],
            "city": c["city"],
            "state": c["state"],
            "director_name": c["director_name"],
            "director_ic_passport": c["director_ic_passport"],
            "phone": c["phone"],
            "email": c["email"],
            "pic_name": c["pic_name"],
            "pic_phone": c["pic_phone"],
            "apad_license_no": c["apad_license_no"],
            "apad_expiry_date": c["apad_expiry_date"],
            "application_status": "approved",
            "submitted_at": NOW,
            "officer_notes": c["officer_notes"],
            "is_active": True,
            "is_verified": True,
            "verified_at": NOW,
            "verified_by": CREATED_BY,
            "approved_at": NOW,
            "reviewed_by": CREATED_BY,
            "created_by": CREATED_BY,
            "created_at": NOW,
        }
        r = await use_db.bus_companies.insert_one(doc)
        company_ids.append(r.inserted_id)
        if not silent:
            print(f"  -> {c['name']} (ID: {r.inserted_id})")

    # 2. Bas (4 per syarikat = 16); simpan id bas pertama setiap syarikat untuk assign driver
    first_bus_ids = []  # satu bas pertama per syarikat (untuk driver)
    if not silent:
        print("\n[2] Membuat 4 bas setiap syarikat (16 bas)...")
    for i, cid in enumerate(company_ids):
        buses = make_buses(cid, plate_prefixes[i])
        for j, b in enumerate(buses):
            b["plate_number"] = b["plate_number"].replace(" ", "").upper()
            r = await use_db.buses.insert_one(b)
            if j == 0:
                first_bus_ids.append(r.inserted_id)
        if not silent:
            print(f"  -> Syarikat {i + 1}: {buses[0]['plate_number']}, {buses[1]['plate_number']}, {buses[2]['plate_number']}, {buses[3]['plate_number']}")

    # 3. Routes (dengan lokasi pickup & drop-off sample)
    if not silent:
        print("\n[3] Membuat route setiap syarikat (lokasi pickup & drop-off sample)...")
    for i, cid in enumerate(company_ids):
        routes = make_routes(cid, i)
        for r in routes:
            await use_db.bus_routes.insert_one(r)
        if not silent:
            names = [x["name"] for x in routes]
            print(f"  -> Syarikat {i + 1}: {', '.join(names)}")

    # 4. Driver bas (4 orang) – satu driver per syarikat, assign ke bas pertama syarikat
    if not silent:
        print("\n[4] Membuat 4 driver bas (assign ke bas setiap syarikat)...")
    for i, d in enumerate(DRIVERS):
        existing_user = await use_db.users.find_one({"email": d["email"]})
        if existing_user:
            await use_db.users.update_one(
                {"_id": existing_user["_id"]},
                {"$set": {"assigned_bus_id": first_bus_ids[i], "updated_at": NOW}}
            )
            if not silent:
                print(f"  -> {d['full_name']} ({d['email']}) – assigned_bus_id dikemaskini")
        else:
            doc = {
                "email": d["email"],
                "password": pwd_context.hash(d["password"]),
                "full_name": d["full_name"],
                "phone": d["phone"],
                "role": "bus_driver",
                "is_active": True,
                "assigned_bus_id": first_bus_ids[i],
                "created_at": NOW,
            }
            await use_db.users.insert_one(doc)
            if not silent:
                print(f"  -> {d['full_name']} ({d['email']}) – bas {plate_prefixes[i]}1001")

    if not silent:
        print("\n" + "=" * 60)
        print("SEED BAS DATA SELESAI")
        print("=" * 60)
        print("Ringkasan:")
        print("  - 4 syarikat bas (approved)")
        print("  - 16 bas (4 setiap syarikat)")
        print("  - 10 route (2–3 setiap syarikat) dengan lokasi pickup & drop-off sample")
        print("  - 4 driver bas (1 per syarikat, assign ke bas pertama); kata laluan: driver123")
        print("Admin bas boleh log masuk, ubah syarikat/bas/route, dan tukar assign driver ke bas lain.")
        print("=" * 60)


async def seed_bus_data(force=False):
    """CLI entry: seed using module-level db with console output. force=True: clear demo data then re-seed."""
    await seed_bus_data_into(db_instance=None, silent=False, force=force)


if __name__ == "__main__":
    # Jalankan dari folder backend: python seed_bus_data.py   atau   python seed_bus_data.py --force
    import sys
    force = "--force" in sys.argv
    asyncio.run(seed_bus_data(force=force))
