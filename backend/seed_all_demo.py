"""
Seed Semua Data Demo - Satu skrip untuk pastikan semua data demo masuk ke sistem.
Jalankan: cd backend && source venv/bin/activate && python seed_all_demo.py

Ini akan jalankan:
1. seed_bus_data  - 4 syarikat bas, 16 bas, 10 route, 4 driver bas
2. seed_yuran_data - Ibu bapa, pelajar, set yuran, rekod yuran (dashboard ibu bapa & bendahari)

Nota: Akaun pengguna (Super Admin, Admin, Bendahari, dll.) dicipta apabila backend server mula
      (lifespan). Pastikan server pernah dijalankan sekurang-kurangnya sekali sebelum atau selepas seed.
"""
import asyncio
import sys
import os

# Pastikan kita dalam backend folder
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if os.path.basename(BACKEND_DIR) != "backend":
    BACKEND_DIR = os.path.join(os.path.dirname(BACKEND_DIR), "backend")
os.chdir(BACKEND_DIR)
sys.path.insert(0, BACKEND_DIR)


async def main():
    print("\n" + "=" * 60)
    print("SEED SEMUA DATA DEMO")
    print("=" * 60)

    # 1. Seed modul bas
    try:
        from seed_bus_data import seed_bus_data
        await seed_bus_data()
    except Exception as e:
        print(f"[BAS] Ralat: {e}")
        import traceback
        traceback.print_exc()

    # 2. Seed data yuran (ibu bapa, pelajar, set yuran, rekod yuran)
    try:
        from seed_yuran_data import seed_data as seed_yuran_data
        await seed_yuran_data()
    except Exception as e:
        print(f"[YURAN] Ralat: {e}")
        import traceback
        traceback.print_exc()

    print("\n" + "=" * 60)
    print("RINGKASAN AKAUN DEMO (log masuk)")
    print("=" * 60)
    print("""
Staff / Admin:
  Super Admin   : superadmin@muafakat.link  / super123
  Admin         : admin@muafakat.link      / admin123
  Admin Bas     : busadmin@muafakat.link    / busadmin123
  Bendahari     : bendahari@muafakat.link   / bendahari123
  Sub Bendahari : sub_bendahari@muafakat.link / subbendahari123
  Juruaudit     : juruaudit@muafakat.link   / juruaudit123
  Guru Kelas    : guru@muafakat.link       / guru123
  Warden        : warden@muafakat.link     / warden123
  Pengawal      : guard@muafakat.link      / guard123

Driver Bas (modul bas):
  driver1@muafakat.link / driver2@ / driver3@ / driver4@  → driver123
  driver@muafakat.link (demo)                              → driver123

Ibu Bapa:
  parent@muafakat.link  / parent2@muafakat.link  → parent123

Pelajar:
  No. Matrik M2024001 (atau MRSM2024001 ikut seed) → pelajar123

Pastikan backend server pernah dijalankan supaya akaun staff wujud (bcrypt).
""")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
