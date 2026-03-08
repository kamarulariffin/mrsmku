# Panduan Refactoring

Dokumen ini menyenaraikan refactoring yang telah dilakukan dan cadangan langkah seterusnya.

## Selesai

### 1. API client sepusat
- **`frontend/src/services/api.js`** – Satu instance axios (baseURL, auth interceptor) untuk seluruh app.
- **Selesai:** Semua halaman/komponen yang memanggil backend kini menggunakan `import api` atau `import api, { API_URL }` dari `services/api`. Tiada lagi `axios.create` atau `const API_URL = process.env.REACT_APP_BACKEND_URL` dalam fail selain `services/api.js`.
- **Fail yang telah diubah:** App.js, ChildrenPage, RegisterPage, ParentYuranDashboard, ParentChildrenFeesPage, TabungPageNew, SetYuranManagementPage, StudentYuranListPage, AdminKoperasiPage, NotificationBell, ProductImageUpload, AdminTabungPage, TabungPage, CampaignFormPage, AdminTabungPageNew, AdminBusManagementPage, AdminInfaqPage, FeePackageManagementPage, VendorAdsPage, PublicDonatePage, PublicCampaignDetailPage, BusTicketPage, CampaignPosterPrint, AGMReportsPage, MyQRCodePage, MonetizationStatsPage, VendorAnalyticsPage, BankAccountsPage, VendorSubscriptionPage, AGMPage, AdsManagementPage, VendorBoostPage, AccountingDashboard, SalesAnalyticsPage, TransactionForm, AnnualReport, VerificationPage, TransactionDetail, CategoryManager, FinancialYearPage, TransactionList, MonthlyReport, UniversalInventoryPage, LoginPage, ParentHostelPage, PelajarHostelPage, dll.

### 2. Validasi berkongsi
- **`frontend/src/utils/validation.js`** – Fungsi: `validateName`, `validateEmail`, `validatePhone`, `validateIC`, `validateMatric`, `validateClassName`.
- **Digunakan di:** ChildrenPage, RegisterPage.
- **Seterusnya:** Gunakan dalam mana-mana borang yang ada validasi IC/telefon/emel/kelas (contoh: AdminStudentsPage, GuruKelasManagement, MyQRCodePage).

## Cadangan (belum buat)

### 3. Pecah fail terlalu besar
- **Backend:** `server.py` (~7300+ baris) – pindah route handlers ke modul dalam `routes/` atau `core/`, kekalkan server.py sebagai entry (create app, mount routers).
- **Frontend:** Pecah mengikut bahagian atau subcomponents:
  - `pages/superadmin/SettingsPage.js` (~1885 baris) – contoh: tab “Data Pelajar” → `SettingsPelajarTab.js`, tab “Asrama” → komponen berasingan.
  - `pages/agm/AGMPage.js` (~1836 baris) – bahagian utama → fail/hooks berasingan.
  - `App.js` (~1574 baris) – pindah definisi routes ke `routes.jsx` atau serupa, layout ke `DashboardLayout.jsx` jika belum.

### 4. Konsistensi export/import
- Guna satu gaya import API: `import api from '.../services/api'` (default) di seluruh projek.
- Untuk komponen: pilih sama ada default export sahaja atau default + named; kemas barrel files (`index.js`) supaya nama export jelas.

### 5. Tabung / AdminTabung naming
- Elak dua komponen berbeza sama nama default export (`TabungPage`, `AdminTabungPage`). Cadangan: export bernama berbeza (contoh: `TabungPageNew`, `AdminTabungPageNew`) dari fail masing-masing dan kemas barrel supaya route import nama yang betul.

## Cara guna panduan ini

- Untuk **API client:** cari semua `axios.create` / `API_URL` dalam `frontend/src` dan gantikan dengan import dari `services/api`.
- Untuk **validasi:** import dari `utils/validation.js` dalam borang baru atau semasa refactor borang sedia ada.
- Untuk **pecah fail:** pilih satu fail besar, ekstrak satu bahagian (tab atau section) ke fail baru, kemas import, kemudian ulang.
