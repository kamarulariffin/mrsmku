# MRSMKU Portal - Product Requirements Document

## Original Problem Statement
Build a multi-phase school management application (MRSMKU Portal) with comprehensive features for managing students, fees, notifications, hostel, and more.

**User Language:** Malay (Bahasa Melayu)

## Core User Personas
1. **Super Admin** - Full system access
2. **Admin** - Administrative functions
3. **Bendahari (Treasurer)** - Fee management
4. **Guru Kelas (Class Teacher)** - Student management, notifications
5. **Warden** - Hostel management
6. **Parent** - View children info, fees, notifications
7. **Pelajar (Student)** - Personal dashboard

## What's Been Implemented

### Completed Features
- ✅ User authentication (JWT-based)
- ✅ Role-based access control
- ✅ Student management (CRUD)
- ✅ Fee structure (Set Yuran)
- ✅ Student fee assignment (student_yuran)
- ✅ Payment processing
- ✅ Notification system (PWA push + in-app)
- ✅ Teacher notification page with full announcement view
- ✅ Parent notification page with full announcement view
- ✅ Dashboard for all roles
- ✅ Hostel module (checkout/checkin)
- ✅ Sickbay module
- ✅ Koperasi (cooperative) module
- ✅ Inventory management
- ✅ AGM (Annual General Meeting) module
- ✅ Accounting module
- ✅ Reports generation (PDF/Excel)

### Refactoring Progress (2026-02-20)
- ✅ `routes/users.py` - ACTIVE & TESTED
- ✅ `routes/dashboard.py` - ACTIVE & TESTED
- ✅ `routes/fees.py` - ACTIVE & TESTED
- ✅ `routes/payments.py` - ACTIVE & TESTED
- ✅ `routes/reports.py` - ACTIVE & TESTED (refactored this session)
- ✅ `routes/hostel.py` - ACTIVE & TESTED (refactored this session)
- ✅ `routes/sickbay.py` - ACTIVE & TESTED (refactored this session)

**REFACTORING COMPLETE!** All planned modules have been successfully migrated.

### Blocked
- 🔴 Email notifications - Requires Resend domain verification

## Technical Architecture

### Backend
- **Framework:** FastAPI
- **Database:** MongoDB
- **Auth:** JWT
- **Routes:** `/app/backend/routes/` (35+ route files)

### Frontend
- **Framework:** React
- **UI:** Shadcn/UI components
- **State:** React hooks
- **PWA:** Service worker for push notifications

### Refactored Code Architecture
```
/app/backend/
├── server.py (main app - orchestrator)
├── routes/
│   ├── users.py          # ✅ REFACTORED - User management
│   ├── dashboard.py      # ✅ REFACTORED - All role dashboards
│   ├── fees.py           # ✅ REFACTORED - Fee structure & management
│   ├── payments.py       # ✅ REFACTORED - Payment processing
│   ├── reports.py        # ✅ REFACTORED - Fee & collection reports
│   ├── hostel.py         # ✅ REFACTORED - Hostel + pulang bermalam
│   ├── sickbay.py        # ✅ REFACTORED - Sickbay module
│   ├── yuran.py          # Active - Yuran management
│   ├── students.py       # Active - Student management
│   ├── infaq.py          # Active
│   ├── koperasi.py       # Active
│   └── notifications.py  # Active
```

## Prioritized Backlog

### P0 (Critical)
- ~~Complete users.py refactoring~~ ✅ DONE
- ~~Complete dashboard.py refactoring~~ ✅ DONE
- ~~Complete fees.py refactoring~~ ✅ DONE
- ~~Complete payments.py refactoring~~ ✅ DONE
- ~~Complete reports.py refactoring~~ ✅ DONE
- ~~Complete hostel.py refactoring~~ ✅ DONE
- ~~Complete sickbay.py refactoring~~ ✅ DONE
- ~~SERVER.PY CLEANUP~~ ✅ DONE
- ~~Modul Pusat Bayaran (Centralized Payment)~~ ✅ DONE

### P1 (High)
- Phase 4: Sync Yuran-Lejar + Ansuran System
- Real Payment Gateway integration (Stripe/FPX) - currently MOCKED
- Email notification system (after Resend verification)

### P2 (Medium)
- Shopping cart persistence (Redis instead of in-memory)
- ~~Add "Add to Cart" buttons to Koperasi and Bus modules~~ ✅ DONE (Koperasi integrated)

### P3 (Future)
- MyDigital ID integration
- Mobile app version
- Integrate Marketplace and Bus Ticket modules with centralized cart

## 3rd Party Integrations
- **Resend** - Email (BLOCKED)
- **apscheduler** - Background jobs
- **reportlab** - PDF generation
- **xlsxwriter/openpyxl** - Excel files
- **qrcode** - QR code generation
- **html2canvas** - Client-side image generation
- **react-quill** - WYSIWYG editor

## Test Credentials
| Role | Email | Password |
|------|-------|----------|
| Super Admin | superadmin@muafakat.link | admin123 |
| Class Teacher | guru@muafakat.link | guru123 |
| Treasurer | bendahari@muafakat.link | bendahari123 |
| Parent | parent@muafakat.link | parent123 |

## Last Updated
- **Date:** February 2026
- **Last Task:** ✅ PECAHAN YURAN REAL + TAMBAH KE TROLI

## Changelog

### February 2026 (Session 18 - Current)
- ✅ **PECAHAN YURAN REAL & TAMBAH KE TROLI**
  - **Data Fix**: Rekod pelajar Nurul Huda binti Samad diperbaiki (full_name was missing)
  - **Senarai Yuran**: Memaparkan pecahan yuran sebenar dari database:
    - Yuran Tahunan Muafakat - RM 50.00 (LUNAS)
    - Kelas Al-Quran - RM 80.00 (LUNAS)
    - E-Outing - RM 15.00 (boleh dipilih)
    - Mesin Air Coway - RM 35.00 (boleh dipilih)
    - Program Kecemerlangan - RM 30.00 (boleh dipilih)
    - Buku dan Cetakan Modul - RM 226.10 (Bukan Islam Sahaja)
  - **Checkbox Selection**: Setiap item boleh dipilih dengan checkbox
  - **Add to Cart**: Item yang dipilih boleh ditambah ke troli dengan butang "Tambah X Item (RM XX.XX)"
  - **Troli Display**: Menunjukkan item dengan harga yang betul dan butang "Bayar Sekarang"

### February 2026 (Session 17)
- ✅ **KAD HIJAU UNTUK YURAN LUNAS & BUTANG TROLI MERAH**
  - **Butang "Lihat Troli"**: Ditukar warna dari hijau ke **MERAH** (from-red-500 to-rose-600)
  - **Kad Anak Fully Paid (100%)**: Design khas dengan visual menarik:
    - Background gradient hijau (#059669 → #10b981 → #34d399)
    - Glow shadow hijau apabila dipilih
    - Animasi sparkles bergerak di background
    - Ikon **Trophy** 🏆 berputar di atas avatar
    - Ikon **Star** ⭐ dan **Sparkles** ✨ dengan animasi
    - Banner **"Yuran Sudah Dibayar!"** dengan ikon **PartyPopper** 🎉
    - Teks "Tahniah! Semua yuran telah dijelaskan"
    - Badge **100%** dengan animasi pulse
    - Checkmark besar dalam bulatan putih
  - **Backend Updated**: API `/pending-items` kini return SEMUA pelajar termasuk yang sudah fully paid (status="paid")
  - **New Icons Imported**: Trophy, Sparkles, Star, PartyPopper dari lucide-react

### February 2026 (Session 16)
- ✅ **AUTO-SELECT ANAK PERTAMA**
  - Anak pertama dalam senarai akan dipilih secara automatik apabila page Payment Center dimuatkan
  - Senarai yuran terus dipaparkan tanpa perlu klik
  - Menggunakan functional setState untuk mengelakkan dependency issues

### February 2026 (Session 15)
- ✅ **UI ENHANCEMENTS - ANIMASI, LAYOUT & MODAL**
  - **Animasi Kad Anak**:
    - Glow effect (indigo shadow 0 0 30px) apabila dipilih
    - Scale up 1.02x dengan spring animation
    - Header bar sedikit lebih tebal apabila dipilih
    - Avatar juga membesar sedikit
    - Gradient background (#f5f3ff) untuk kad yang dipilih
  - **Layout Bayaran Pantas**:
    - Dipindahkan ke sidebar kanan di bawah "Wallet Saya"
    - Design lebih compact (grid 2x2)
    - Padding dan font size dikecilkan untuk fit sidebar
  - **Modal Resit Centered**:
    - Kini di tengah skrin (left-1/2, top-1/2, -translate)
    - Backdrop blur untuk kesan profesional
    - Spring animation untuk smooth appearance
    - Max height 85vh dengan scrollable content
    - Footer buttons fixed di bawah (tidak scroll)

### February 2026 (Session 14)
- ✅ **UI REDESIGN - BOX ANAK DENGAN PROGRESS BULATAN**
  - **Problem**: Pengguna mahu pindahkan info progress bayaran ke kad anak dengan design progress bulatan
  - **Solution**: Redesign komponen StudentCarousel dan YuranDetailView
  - **Features Implemented**:
    - **Progress Bulatan**: Setiap kad anak kini memaparkan progress bayaran dalam bentuk bulatan
    - **Info Baki & Dibayar**: Dipaparkan terus di kad anak (bukan header berasingan)
    - **Butang "Lihat Senarai Bayaran"**: Diklik pada kad anak untuk melihat senarai yuran
    - **Senarai Yuran Dinamik**: Tajuk menunjukkan nama anak yang dipilih
    - **Resit dengan Nama Lengkap**: Modal resit kini memaparkan:
      - Nama Ibu Bapa
      - Email
      - Nama Anak
      - Item yang dibayar secara terperinci
  - **UI Changes**:
    - `StudentCarousel` - Ditambah SVG circular progress, info baki/dibayar, butang "Lihat Senarai Bayaran"
    - `YuranDetailView` - Filter berdasarkan selectedStudent, design lebih ringkas tanpa header berlebihan
    - Receipt Modal - Memaparkan nama ibu bapa dan nama anak
  - **Color Coding Progress**:
    - Hijau (≥100%): Telah selesai
    - Kuning (>50%): Separa
    - Merah (<50%): Belum bayar banyak

### February 2026 (Session 13)
- ✅ **REAL BALANCE & PAYMENT PROGRESS DATA**: Data baki dan progress bayaran adalah data sebenar
  - **Problem**: Pengguna mahu data baki dan progress bayaran berdasarkan bayaran sebenar
  - **Solution**: Sistem kini mengira baki dan progress dari data pembayaran sebenar dalam database
  - **Features Implemented**:
    - **Baki Header Box**: Nurul Huda menunjukkan RM 306.10 (sebenar: 436.10 - 130.00 dibayar)
    - **Progress Bayaran**: Bar progress menunjukkan 30% (130/436.10 * 100)
    - **Resit dalam Sejarah Bayaran**: Resit dijana untuk kategori yang telah dibayar
    - **Filter Tab Yuran**: Tab "Yuran" dalam sejarah bayaran kini berfungsi dengan betul
    - **Modal Resit dengan Butiran**: Modal menunjukkan item yang dibayar secara terperinci
  - **Backend Changes**:
    - `/api/payment-center/receipts` - Kini return `items` array untuk filtering
  - **Frontend Changes**:
    - `PaymentHistorySection` - Filter berdasarkan `item_type` berfungsi
    - Receipt Modal - Memaparkan butiran item dari `metadata.selected_items`
  - **Data Test**:
    - Nurul Huda binti Samad: Baki RM 306.10, Progress 30%
    - Item dibayar: Yuran Tahunan Muafakat (RM 50), Kelas Al-Quran (RM 80)
    - Resit MRSMKU-20260219-E66DB541 dicipta untuk pembayaran
  - **Cleanup**: Fail sementara `add_fee_item.py` dipadam
  
- ⚠️ **MOCKED**: Wallet balance (RM 120.50 hardcoded), Payment gateway (SIMULASI)

### February 2026 (Session 12)
- ✅ **RELIGION-BASED FEE FILTER FROM REAL DATA**: Yuran berdasarkan agama dari set_yuran superadmin
  - **Problem**: Sebelum ini data yuran "Bukan Islam" menggunakan data palsu/hardcoded
  - **Solution**: Kini mengambil data sebenar dari `set_yuran` collection yang diuruskan superadmin
  - **Features Added**:
    - Field `bukan_islam_only` ditambah dalam `set_yuran` items
    - Superadmin boleh menanda item sebagai "Islam Sahaja" ATAU "Bukan Islam Sahaja"
    - Checkbox `Islam` dan `Bkn Isl` dalam form Edit Set Yuran
    - Jumlah berbeza untuk pelajar Islam vs Bukan Islam dipaparkan di Tingkatan card
    - Item "Bukan Islam" dilumpuhkan untuk pelajar Muslim dengan badge "Bukan Islam" dan status "Bukan Islam Sahaja"
  - **Data Test**: 
    - "Yuran Pendidikan Moral" (RM50) dengan `bukan_islam_only=true` ditambah untuk Tingkatan 3
    - "Yuran Sivik & Kewarganegaraan" dengan `bukan_islam_only=true` 
  - **Backend Changes**:
    - `/app/backend/routes/yuran.py` - `YuranItemCreate` model dengan `bukan_islam_only` field
    - `/app/backend/routes/payment_center.py` - Return `bukan_islam_only` flag dalam pending-items
    - `filter_items_by_religion()` - Logic to filter items based on religion
    - `calculate_totals_by_religion()` - Calculate separate totals for Islam/Bukan Islam
  - **Frontend Changes**:
    - `/app/frontend/src/pages/admin/yuran/SetYuranManagementPage.js` - Checkbox "Bkn Isl" dalam form
    - `/app/frontend/src/pages/payment_center/NewPaymentCenterLayout.js` - Badge "Bukan Islam" + disabled state
  - **Testing**: 100% passed - All religion-based fee features working
  
- ⚠️ **MOCKED**: Wallet balance (RM 120.50 hardcoded), Payment gateway (SIMULASI)

### February 2026 (Session 11)
- ✅ **YURAN CHECKBOX SELECTION**: Senarai yuran dengan pilihan checkbox
  - **Features Added**:
    - Item LUNAS (sudah bayar) menunjukkan ikon checkmark hijau
    - Item belum bayar mempunyai checkbox yang boleh diklik
    - Pilih item individu atau "Pilih Semua" untuk quick selection
    - Butang "Batal" untuk clear selection
    - Text "X item dipilih (RM XX.XX)" dikemaskini mengikut pilihan
    - Butang "Tambah X Item (RM XX.XX)" muncul bila ada item dipilih
    - Klik butang tambah > item masuk cart > cart slider opens
  - **API Integration**: Fixed `item_type` to use `yuran_partial` with `selected_items` metadata
  - **Testing**: 100% UI features passed, cart integration working
  
- ✅ **NEW PAYMENT CENTER LAYOUT**: Layout baharu dengan navigasi asal + cart slider
  - Navigasi utama dikekalkan (DashboardLayout sidebar)
  - Cart slider dari kanan (aktif bila ada item dalam cart)
  - Student carousel, Bayaran Pantas, Yuran Tertunggak, Sejarah Bayaran

- ⚠️ **MOCKED**: Wallet balance (RM 120.50 hardcoded), Payment gateway (SIMULASI)

### February 2026 (Session 10)
- ✅ **CART ICON NAVIGATION FIX**: Navigasi ikon troli kini berfungsi
  - **Fix**: Tukar dari `<Link>` ke `useNavigate` hook dalam `CartIconButton`
  - **URL Tab Support**: Tambah `useSearchParams` untuk baca `?tab=troli` dari URL
  - **Tab Mapping**: Map URL param `troli` ke internal state `cart`
  - **Koperasi Integration**: Checkout button navigates to `/payment-center?tab=troli`
  - **Files Updated**:
    - `/app/frontend/src/components/cart/CartDrawer.js` - Import useNavigate, programmatic navigation
    - `/app/frontend/src/pages/modules/PaymentCenterPageNew.js` - useSearchParams for tab URL sync
    - `/app/frontend/src/pages/modules/KoperasiPage.js` - useCart integration, checkout navigation
- ✅ **TESTING PASSED**: 100% frontend - All cart navigation features working

### February 2026 (Session 9)
- 🟡 **CENTRALIZED CART SYSTEM**: Sistem troli berpusat untuk semua modul
  - ✅ **CartContext**: State management berpusat untuk troli (`/app/frontend/src/context/CartContext.js`)
  - ✅ **CartIconButton**: Ikon troli di header (desktop & mobile)
  - ✅ **Backend APIs**: 
    - `PATCH /api/payment-center/cart/update/{id}` - Kemaskini kuantiti
    - `DELETE /api/payment-center/cart/clear` - Kosongkan troli
  - ✅ **Helper Functions**: 
    - `addKoperasiToCart()` - Tambah produk koperasi
    - `addBusTicketToCart()` - Tambah tiket bas
    - `addYuranToCart()` - Tambah yuran
    - `addInfaqToCart()` - Tambah sumbangan
  - ✅ **Koperasi Integration**: Checkout navigates to Payment Center with Troli tab

### February 2026 (Session 8)
- ✅ **FEE ITEM RELIGION FILTER**: Papar semua item yuran termasuk yang tidak berkaitan dengan agama pelajar
  - **Tunjuk Semua Item**: Semua item yuran dari `set_yuran` dipaparkan, termasuk yang tidak di-assign
  - **Tag "Islam"**: Badge hijau untuk item `islam_only`
  - **Label "TIDAK BERKAITAN"**: Untuk item tidak berkaitan dalam senarai yuran
  - **Checkbox Disabled**: Item tidak berkaitan mempunyai:
    - Ikon X dalam checkbox
    - Badge "N/A"
    - Styling kelabu/pudar (`opacity-60`, `cursor-not-allowed`)
    - Teks italic "Tidak berkaitan dengan pelajar ini"
  - **Agama Pelajar Dipapar**: "Pelajar: Buddha" dalam header senarai yuran
  - **"Pilih Semua" Pintar**: Hanya pilih item yang berkaitan, abaikan item disabled
- ✅ **BACKEND ENHANCED**: 
  - `GET /api/payment-center/pending-items` kini:
    - Mengambil SEMUA item dari `set_yuran` (bukan hanya yang di-assign)
    - Menambah field `islam_only`, `applicable`, `status: not_applicable`
    - Menambah field `student_religion`
- ✅ **TESTING PASSED**: 100% backend dan frontend
- ✅ **Files Updated**:
  - `/app/backend/routes/payment_center.py` - Logic untuk religion filter
  - `/app/frontend/src/pages/modules/PaymentCenterPageNew.js` - UI untuk disabled items

### February 2026 (Session 7)
- ✅ **PAYMENT CENTER UI REVAMP**: Rekaan baharu dengan slider payment panel
  - **Slider Payment Panel**: Panel pembayaran slide dari kanan
  - **Senarai Yuran Terperinci**: Item dengan struktur **Category > Sub-Category > Item** sama seperti Set Yuran admin
  - **Butang "Masuk Troli"**: Butang dalam slider
  - **Tab Order**: Yuran Saya → Ansuran → Tabung → Resit → Troli (last)
  - **Butang Checkout Merah/Hijau**: Dalam Tab Troli
- ✅ **BAYAR MENGIKUT KATEGORI**: Fungsi baharu untuk pilih item tertentu
  - **Item Selection Checkbox**: Ibu bapa boleh pilih item yuran tertentu dengan checkbox
  - **Pilih Semua / Nyah Pilih**: Butang untuk pilih/nyah pilih semua item
  - **Summary Card**: Papar jumlah item dipilih dan jumlah bayaran
  - **Backend Support**: Tambah `yuran_partial` item type dalam cart
  - **Cart Display**: Senarai item dipilih dipapar sebagai bullet list
- ✅ **DATA MIGRATION**: Buang data lama student_yuran dan reassign dengan struktur lengkap
  - 35 student_yuran records dikemas kini
  - Setiap item ada `category`, `sub_category`, `name`
- ✅ **Files Updated**:
  - `/app/frontend/src/pages/modules/PaymentCenterPageNew.js`
  - `/app/backend/routes/payment_center.py`

### February 2026 (Session 6)
- ✅ **PUSAT BAYARAN ENHANCED**: Penambahbaikan modul Pusat Bayaran
  - **Sync Tabung & Sumbangan**: Infaq kini mengambil data dari `tabung_campaigns` (bukan `donation_campaigns`)
  - **Paparan Yuran Terperinci**: Tab baharu "Yuran Terperinci" dengan item breakdown dan checkbox
  - **Tab Ansuran**: Tab baharu untuk pelajar dengan pelan ansuran aktif
  - **New APIs**:
    - `POST /api/payment-center/cart/add-items` - Tambah item yuran separa
    - `POST /api/payment-center/cart/add-installment` - Tambah bayaran ansuran
  - **Sync tabung_donations**: Checkout kini sync dengan collection `tabung_donations`
- ✅ **TESTING PASSED**: 13/13 backend tests, 100% frontend flows working
- ✅ **Test Data Created**: Yuran with partial items, Yuran with installment plan

### February 2026 (Session 5)
- ✅ **MODUL PUSAT BAYARAN**: Centralized payment system implemented
  - Backend: `/app/backend/routes/payment_center.py`
  - Frontend: `/app/frontend/src/pages/modules/PaymentCenterPageNew.js`
  - Features: Cart (session-based), Add to Cart, Checkout, Receipt (PDF + Web)
  - Integrated: Yuran, Koperasi, Bus, Infaq
  - Payment Gateway: **MOCKED (fpx_mock)** - simulasi sahaja
- ✅ **TESTING PASSED**: 15/15 backend tests, 100% frontend flows working
- ✅ **UI/UX**: Modern gradient design with tabs, progress bars, receipt modal

### February 2026 (Session 4)
- ✅ **CLEANUP COMPLETE**: Removed 1,130 lines of commented-out legacy code from server.py
- ✅ **REGRESSION TEST PASSED**: All 18 backend tests passed (100% success rate)
- server.py reduced from 8,372 lines to 7,242 lines
- All refactored modules verified working: users, dashboard, fees, payments, reports, hostel, sickbay
- Test file created: /app/backend/tests/test_cleanup_regression.py

### December 2025 (Session 3)
- ✅ Refactored reports.py module (2 endpoints: /api/reports/fees, /api/reports/collection)
- ✅ Refactored hostel.py module (11 endpoints: checkout/checkin, students, blocks, stats, pulang bermalam CRUD)
- ✅ Refactored sickbay.py module (5 endpoints: checkin/checkout, records, stats, students)
- Pattern: Uses init_router() with dependency injection pattern (get_db, get_current_user, log_audit)
- All endpoints tested and working via curl
- Legacy code commented out in server.py

### December 2025 (Session 2)
- ✅ Refactored dashboard.py module
- ✅ Refactored fees.py module
- ✅ Refactored payments.py module

### December 2025 (Session 1)
- ✅ Successfully refactored User Management module from server.py to routes/users.py
- Pattern: Uses init_router() with dependency injection for get_db, get_current_user, log_audit, etc.
- All 5 endpoints working: GET/POST/PUT/DELETE /api/users, PUT /api/users/{id}/toggle-active
- Removed 168 lines from server.py
