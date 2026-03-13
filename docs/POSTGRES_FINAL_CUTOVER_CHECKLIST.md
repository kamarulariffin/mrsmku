# PostgreSQL Final Cutover Checklist

Dokumen ini merumuskan baki kerja untuk menutup migrasi MongoDB -> PostgreSQL sepenuhnya.

## 1) Ringkasan Status Semasa

- Runtime default sudah `DB_ENGINE=postgres`.
- Core storage `CoreStore` sudah aktif di `backend/server.py`.
- Sebahagian modul sudah dialihkan ke `get_relational_core_db`.
- Projek masih mengekalkan mode transisi (`mongo`, `hybrid`) dan masih ada modul yang bergantung pada pola MongoDB.

### Kemas Kini Fasa 1 (iterasi semasa)

- `marketplace` kini di-wire melalui `get_core_db` (bukan lagi `get_db`) untuk memastikan laluan melalui `CoreStore`.
- Lapisan aggregate emulation dalam `backend/repositories/core_store.py` ditambah sokongan awal untuk:
  - `$lookup`,
  - `$unwind`,
  - `$limit`,
  - `$group` expression (`$year`, `$month`, `$abs`, object `_id`).
- Baki endpoint `marketplace` masih perlukan audit fungsi demi fungsi untuk menutup jurang operator Mongo yang lebih kompleks.

### Kemas Kini Fasa 1.2 (iterasi semasa)

- `student_import` kini di-wire melalui `get_core_db`.
- `koperasi_commission` kini di-wire melalui `get_core_db`.
- Kedua-dua modul masih perlukan hardening lanjut pada semantik data (terutamanya medan ID legacy/ObjectId) semasa regression test penuh.

### Kemas Kini Fasa 1.3 (iterasi semasa)

- `hostel` kini di-wire melalui `get_core_db`.
- `sickbay` kini di-wire melalui `get_core_db`.
- `CoreStore` aggregate ditambah sokongan `$project` dan expression `$ifNull` untuk menutup keperluan pipeline modul asrama.
- Baki kerja masih melibatkan hardening semantik ID legacy/ObjectId serta regression test menyeluruh untuk flow warden/parent/pelajar.

### Kemas Kini Fasa 1.4 (iterasi semasa)

- `warden` kini di-wire melalui `get_core_db`.
- `discipline` kini di-wire melalui `get_core_db`.
- `CoreStore` query matcher ditambah sokongan `$size` dan semantik `$in`/`$nin` untuk medan array (kritikal untuk logik `blok_assigned` dalam modul warden).
- Pembaikan kecil kestabilan di `discipline` untuk penjanaan nombor kes OLAT (`inserted_id`).
- Baki kerja masih fokus pada hardening semantik ID legacy/ObjectId dan regresi flow penuh peranan warden/parent/pelajar.

### Kemas Kini Fasa 1.5 (iterasi semasa)

- `risk` kini di-wire melalui `get_core_db`.
- `upload` kini di-wire melalui `get_core_db`.
- `chatbox_faq` kini di-wire melalui `get_core_db`.
- `pwa` kini di-wire melalui `get_core_db`.
- `CoreStore` dikemas kini untuk kompatibiliti tambahan:
  - sokongan operator update `$pull` (digunakan oleh `chatbox_faq`),
  - sokongan `to_list(length=...)` agar serasi dengan gaya cursor Motor sedia ada.

### Kemas Kini Fasa 1.6 (iterasi semasa)

- Laluan runtime untuk batch endpoint berikut kini melalui resolver `_runtime_db()` (CoreStore dalam postgres mode):
  - `analytics` endpoints,
  - `infaq` endpoints,
  - `bus` endpoints yang delegated ke `routes/bus.py`,
  - `system-config` endpoints dalam `server.py`.
- `CoreStore` cursor diperkukuh untuk keserasian Motor:
  - sokongan `async for` melalui `__aiter__/__anext__` pada `_CoreCursor` dan `_AggregateCursor`,
  - sokongan `find(query, projection=...)` pada `CoreCollection`.
- Isu runtime sebenar pada `GET /api/public/infaq/campaigns` (TypeError: `_CoreCursor` tiada `__aiter__`) telah diperbaiki dan endpoint kini lulus semakan runtime.

### Kemas Kini Fasa 1.7 (iterasi semasa)

- Baki flow modul `bus` dalam `server.py` kini diseragamkan ke `_runtime_db()`:
  - `GET/POST /api/settings/bus-booking`,
  - `GET /api/public/settings/bus-booking`,
  - `GET /api/bus/student/{student_id}/approved-leaves`,
  - `GET /api/bus/check-leave-requirement`.
- Semakan runtime lulus untuk flow `bus-booking` dan `leave` (termasuk role `superadmin` dan `parent`) tanpa regresi pada endpoint `GET /api/bus/companies`.

### Kemas Kini Fasa 1.8 (iterasi semasa)

- Endpoint `koperasi` dalam `server.py` kini dinormalkan ke `_runtime_db()` (tidak lagi terus menyuntik `db` global ke `koperasi_routes`).
- Scope meliputi flow utama:
  - kategori, kits, products,
  - cart,
  - orders,
  - admin stats.
- Semakan runtime lulus untuk:
  - `GET /api/koperasi/categories`,
  - `GET /api/koperasi/kits`,
  - `GET /api/koperasi/products`,
  - `GET /api/koperasi/orders`,
  - `GET /api/koperasi/admin/stats`.

### Kemas Kini Fasa 1.9 (iterasi semasa)

- Endpoint tetapan di `server.py` kini diseragamkan ke `_runtime_db()`:
  - `pwa` (`/api/settings/pwa`, `/api/public/settings/pwa`, `/api/manifest`),
  - `landing` (`/api/settings/landing`, `/api/settings/landing/public`),
  - `onboarding` (`/api/settings/onboarding`, `/api/public/settings/onboarding`),
  - `portal` (`/api/settings/portal`, `/api/public/settings/portal`),
  - `modules` (`/api/settings/modules`, `/api/settings/modules/public`),
  - `upload settings` (`/api/settings/upload`).
- Semakan runtime lulus untuk read + write flow tetapan (`GET` dan `POST`) tanpa regresi endpoint batch terdahulu.

### Kemas Kini Fasa 2.0 (iterasi semasa)

- Semua router yang sebelum ini di-wire dengan `init_router(get_db, ...)` kini dipindahkan ke `init_router(get_core_db, ...)`:
  - `agm`, `complaints`, `email_templates`, `hostel_blocks`, `inventory`, `categories`,
  - `accounting`, `bank_accounts`, `agm_reports`,
  - `yuran` (arg utama kini `get_core_db`, sambil mengekalkan parameter `get_core_db` tambahan untuk compatibility dalaman).
- `CoreStore` aggregate emulation dipertingkatkan untuk sokongan tambahan yang diperlukan modul transisi:
  - stage: `$count`, `$addFields` (alias `$set`),
  - expression: `$toString`, `$multiply`, `$lte`, `$arrayElemAt`, `$dateFromString`, `$subtract`,
  - group accumulator: `$avg`, `$max`, `$push`.
- Isu runtime `GET /api/email-templates/stats-by-tingkatan` (KeyError `count`) telah diselesaikan selepas sokongan stage `$count`.

### Kemas Kini Fasa 2.1 (iterasi semasa)

- Endpoint domain legacy `server.py` batch berikut kini dinormalkan menggunakan resolver `_runtime_db()` (tidak lagi akses terus `db` global):
  - `rbac config` (`GET/PUT /api/rbac/config`, `GET /api/rbac/config/{role}`, `POST /api/rbac/reset/{role}`),
  - `students` (`POST/GET /api/students`, `GET /api/students/{id}`, `PUT /api/students/{id}`, `PUT /api/students/{id}/approve`, `PUT /api/students/{id}/reject`, `DELETE /api/students/{id}`),
  - `admin sync` (`GET /api/admin/sync/status`, `POST /api/admin/sync/cleanup-orphan-users`, `POST /api/admin/sync/students`, `POST /api/admin/sync/full`).
- Semakan runtime batch Fasa 2.1 lulus (`200 OK`) untuk:
  - `POST /api/auth/login`,
  - `GET /api/rbac/config`,
  - `GET /api/rbac/config/admin`,
  - `GET /api/students?page=1&limit=5`,
  - `GET /api/admin/students?page=1&limit=5`,
  - `GET /api/admin/sync/status`.

### Kemas Kini Fasa 2.2 (iterasi semasa)

- Batch endpoint admin lanjutan dalam `server.py` kini turut dinormalkan ke `_runtime_db()`:
  - `POST /api/admin/standardize-classes`,
  - `GET /api/admin/class-summary`,
  - `POST /api/admin/guru-kelas/assign`,
  - `PUT /api/guru/profile/class-assignment`,
  - `GET/PUT /api/admin/sync/auto-settings`,
  - `POST /api/admin/sync/trigger-now`,
  - `GET /api/admin/students/report`,
  - `GET /api/admin/students/with-parents`.
- Semakan runtime batch Fasa 2.2 lulus (`200 OK`) untuk:
  - `GET /api/admin/class-summary`,
  - `GET /api/admin/sync/auto-settings`,
  - `GET /api/admin/students/report`,
  - `GET /api/admin/students/with-parents?page=1&limit=5`.

### Kemas Kini Fasa 2.3 (iterasi semasa)

- Batch endpoint `audit` dan `notifications` dalam `server.py` kini dinormalkan ke `_runtime_db()`:
  - `GET /api/audit-logs`,
  - `GET/PUT/DELETE /api/notifications*`,
  - `GET /api/notifications/guru/*`,
  - `GET/POST/DELETE /api/notifications/announcements*`,
  - `POST /api/notifications/guru/send-quick`,
  - `POST /api/notifications/push/subscribe`,
  - `GET /api/notifications/push/status`.
- Hardening tambahan serializer response:
  - `serialize_audit`, `serialize_notification`, `serialize_payment`, `serialize_fee_package` kini menormalisasi `datetime` ke ISO string untuk elak `pydantic` ValidationError.
- Isu runtime `GET /api/audit-logs` (`created_at` bertipe `datetime` ketika model jangkaan `str`) telah diselesaikan.
- Semakan runtime batch Fasa 2.3 lulus (`200 OK`) untuk:
  - `GET /api/audit-logs?limit=5`,
  - `GET /api/notifications?page=1&limit=5`,
  - `GET /api/notifications/unread-count`,
  - `GET /api/notifications/guru/dashboard`,
  - `GET /api/notifications/guru/parents?page=1&limit=5`,
  - `GET /api/notifications/announcements?page=1&limit=5`,
  - `GET /api/notifications/push/status`.

### Kemas Kini Fasa 2.4 (iterasi semasa)

- Batch endpoint `vehicles/guard` dan `settings-auth` berikut kini dinormalkan ke `_runtime_db()`:
  - `POST /api/vehicles/register`,
  - `POST /api/vehicles/scan/{plate_number}`,
  - `GET /api/vehicles`,
  - `GET /api/vehicles/stats`,
  - `GET /api/vehicles/search/{plate_number}`,
  - `DELETE /api/vehicles/{vehicle_id}`,
  - `GET /api/vehicles/scans`,
  - `GET /api/guard/students`,
  - `GET/POST/DELETE /api/settings/mydigitalid`,
  - `POST /api/auth/mydigitalid/mock-login`,
  - `GET/POST/DELETE /api/settings/email`,
  - `GET /api/settings/email-status`,
  - `GET/POST/DELETE /api/settings/ses`,
  - `GET/POST/DELETE /api/settings/smtp`,
  - `POST /api/settings/email/test`.
- `email-status` kini menilai konfigurasi DB melalui `runtime_db` (bukan `db` global) untuk `SMTP`/`SES`.
- Semakan runtime Fasa 2.4 lulus (`200 OK`) untuk:
  - `GET /api/settings/mydigitalid`,
  - `POST /api/auth/mydigitalid/mock-login`,
  - `GET /api/settings/email`,
  - `GET /api/settings/email-status`,
  - `GET /api/settings/ses`,
  - `GET /api/settings/smtp`,
  - `GET /api/guard/students`,
  - `GET /api/vehicles`,
  - `GET /api/vehicles/stats`,
  - `GET /api/vehicles/scans?limit=5`,
  - `GET /api/vehicles/search/ABC123TEST`.

### Kemas Kini Fasa 2.5 (iterasi semasa)

- Batch helper + scheduler + dashboard/AI berikut kini dinormalkan ke `_runtime_db()`:
  - helper auth/audit (`get_current_user`, `get_current_user_optional`, `log_audit`),
  - scheduler jobs (`run_monetization_expiration_job`, `run_auto_sync_job`),
  - startup seeding runtime (RBAC, hostel blocks, email templates, users/students demo, donation campaigns),
  - parent/guru fee dashboard:
    - `GET /api/parent/children-fees`,
    - `GET /api/guru-dashboard/overview`,
    - `GET /api/guru-dashboard/students`,
    - `GET /api/guru-dashboard/student/{student_id}`,
    - `GET /api/guru-dashboard/filter-options`,
    - `POST /api/guru-dashboard/send-reminder`,
  - cron reminder endpoint `POST /api/cron/fee-reminders`,
  - AI chat endpoints:
    - `POST /api/ai/chat`,
    - `GET /api/ai/suggestions`,
    - `GET /api/ai/faq`,
    - termasuk seed utiliti chatbox (`_seed_chatbox_collections`).
- Semakan runtime Fasa 2.5 lulus (`200 OK`) untuk:
  - `GET /api/audit-logs?limit=3`,
  - `GET /api/guru-dashboard/overview`,
  - `GET /api/guru-dashboard/students?page=1&limit=3`,
  - `GET /api/guru-dashboard/filter-options`,
  - `GET /api/guru-dashboard/student/{id}`,
  - `POST /api/cron/fee-reminders?cron_key=...`,
  - `GET /api/parent/children-fees`,
  - `POST /api/ai/chat`,
  - `GET /api/ai/suggestions`,
  - `GET /api/ai/faq`.

### Kemas Kini Fasa 2.6 (iterasi semasa)

- Blok bootstrap index Mongo dalam `lifespan` kini diasingkan kepada alias lokal `mongo_bootstrap_db` (bukan lagi akses `await db.*` terus).
- Audit kod `server.py` mengesahkan tiada lagi penggunaan runtime `await db.*`; baki rujukan `db.` hanya:
  - import `db.config` / `db.postgres`,
  - komen/docstring legacy.
- Semakan runtime tambahan lulus (`200 OK`) selepas kemas kini ini untuk endpoint rentas domain:
  - `GET /api/vehicles`,
  - `GET /api/settings/email-status`,
  - `GET /api/notifications/unread-count`,
  - `GET /api/guru-dashboard/overview`,
  - `POST /api/cron/fee-reminders?cron_key=...`,
  - `GET /api/parent/children-fees`,
  - `POST /api/ai/chat`,
  - `GET /api/ai/suggestions`,
  - `GET /api/ai/faq`.

### Kemas Kini Fasa 2.7 (iterasi semasa)

- Hardening parity untuk modul `accounting_full` dan `CoreStore`:
  - pembaikan sorting `CoreStore` agar stabil untuk nilai campuran (`None` + `str`/numeric) melalui kunci sort berjenis (`_to_sort_key`),
  - normalisasi `old_value`/`new_value` pada endpoint `GET /api/accounting-full/audit-logs` supaya data legacy berbentuk string tidak memecahkan model `AccountingAuditLogResponse` yang menjangka `dict`.
- Isu runtime yang diperbaiki:
  - `GET /api/accounting-full/chart-of-accounts` (`TypeError: '<' not supported between instances of 'NoneType' and 'str'`),
  - `GET /api/accounting-full/audit-logs` (`ValidationError: new_value mesti dictionary`).
- Semakan smoke automatik rentas modul (`inventory`/`accounting`/`accounting-full`/`yuran`) ke atas 43 endpoint `GET` menunjukkan `TOTAL_500 = 0` selepas pembaikan.
- Nota validasi (sebelum Fasa 2.8): endpoint AGM `accounting-full` boleh `404` jika prasyarat business data tiada (`Tiada tahun kewangan aktif`).

### Kemas Kini Fasa 2.8 (iterasi semasa)

- Hardening flow `financial year` untuk modul `bank_accounts` + `agm_reports`:
  - tambah utiliti shared `routes/accounting_financial_year_utils.py` dengan resolver `ensure_current_financial_year(...)`,
  - resolver ini self-healing:
    1. guna rekod `is_current=True` jika wujud,
    2. fallback ke tahun yang meliputi tarikh hari ini,
    3. fallback ke tahun terkini yang belum ditutup,
    4. auto-seed tahun kewangan default (window sekolah: `01-05` hingga `30-04`) jika koleksi kosong.
- Endpoint yang kini stabil tanpa 404 prasyarat kosong:
  - `GET /api/accounting-full/financial-years/current`,
  - `GET /api/accounting-full/agm/income-expenditure`,
  - `GET /api/accounting-full/agm/balance-sheet`,
  - `GET /api/accounting-full/agm/cash-flow`,
  - `GET /api/accounting-full/agm/executive-summary`,
  - `GET /api/accounting-full/agm/trial-balance`.
- Semakan smoke semula (43 endpoint `GET` untuk `inventory/accounting/accounting-full/yuran`) kekal `TOTAL_500 = 0`.

### Kemas Kini Fasa 2.9 (iterasi semasa)

- Tambah skrip regression khusus modul `yuran`:
  - `backend/scripts/smoke_yuran_postgres.py`
  - menyokong semakan role-aware (`superadmin` + `parent`), lookup ID dinamik (`set_yuran`, `student`, `yuran`, `notification`), dan assertion guard authorization (`403` untuk endpoint parent-only bila dipanggil superadmin).
- Mod semakan:
  - default read-only checks (tiada kesan data),
  - pilihan `--include-write` untuk semakan idempotent write path (`mark-all-read`, `mark-read`, `PUT settings` dengan payload semasa).
- Keputusan runtime semasa:
  - read-only: `SUMMARY total=17 passed=17 failed=0`,
  - include-write: `SUMMARY total=22 passed=22 failed=0`.

### Kemas Kini Fasa 2.10 (iterasi semasa)

- Tambah skrip regression tambahan untuk domain berisiko tinggi:
  - `backend/scripts/smoke_inventory_postgres.py`,
  - `backend/scripts/smoke_accounting_full_postgres.py`.
- Cakupan semakan:
  - `inventory`: semakan role matrix (`superadmin` vs `parent`), endpoint read utama, dan write idempotent `POST /api/inventory/seed/muafakat-vendor` (opsyen `--include-write`).
  - `accounting-full`: semakan endpoint laporan/operasi utama termasuk `bank_accounts` + `agm_reports`, role matrix (`superadmin`/`bendahari`/`juruaudit`/`parent`), lookup ID dinamik transaksi, serta write idempotent `POST /api/accounting-full/categories/seed-defaults` (opsyen `--include-write`).
- Keputusan runtime semasa:
  - `smoke_inventory_postgres.py` read-only: `SUMMARY total=10 passed=10 failed=0`,
  - `smoke_inventory_postgres.py --include-write`: `SUMMARY total=11 passed=11 failed=0`,
  - `smoke_accounting_full_postgres.py --year 2026` read-only: `SUMMARY total=33 passed=33 failed=0`,
  - `smoke_accounting_full_postgres.py --year 2026 --include-write`: `SUMMARY total=35 passed=35 failed=0`.

### Kemas Kini Fasa 2.11 (iterasi semasa)

- Tutup gap fungsi `yuran` untuk backward-compatibility:
  - tambah endpoint `GET /api/yuran/settings/installment`,
  - tambah endpoint `PUT /api/yuran/settings/installment`.
- Endpoint baru ini memetakan konfigurasi lama `max_installment_months` kepada storage semasa (`SETTINGS_KEY_PAYMENT_POLICY`, field `max_payments`) supaya frontend/test lama kekal berfungsi tanpa ubah kontrak.
- Semakan behavior:
  - `GET /api/yuran/settings/installment` kini `200` (sebelum ini `404`),
  - `PUT /api/yuran/settings/installment` menyokong role guard sedia ada (`bendahari/sub_bendahari/admin/superadmin`),
  - validasi nilai kekal ketat (`1..9`, invalid `12` → `422`).
- Skrip smoke `backend/scripts/smoke_yuran_postgres.py` dikemas kini untuk meliputi endpoint kompatibiliti ini:
  - keputusan semasa `--include-write`: `SUMMARY total=24 passed=24 failed=0`.

### Kemas Kini Fasa 2.12 (iterasi semasa)

- Hardening kompatibiliti tambahan untuk endpoint legacy/frontend:
  - `dashboard`: tambah alias root `GET /api/dashboard` dan `GET /api/dashboard/` yang auto-route ikut role,
  - `payment_center`: tambah alias `POST /api/payment-center/cart/add-installment` (reuse flow `add-two-payment`),
  - `bus`: normalisasi medan tarikh/masa ke string dalam serializer response untuk elak mismatch type (`datetime` vs `str`) pada model Pydantic.
- Tambah skrip regression domain gabungan:
  - `backend/scripts/smoke_bus_dashboard_payment_postgres.py`.
- Keputusan runtime semasa:
  - read-only: `SUMMARY total=15 passed=15 failed=0`,
  - include-write: `SUMMARY total=17 passed=17 failed=0`.
- Re-run smoke domain kritikal kekal hijau selepas Fasa 2.12:
  - `smoke_yuran_postgres.py --include-write`: `SUMMARY total=24 passed=24 failed=0`,
  - `smoke_inventory_postgres.py --include-write`: `SUMMARY total=11 passed=11 failed=0`,
  - `smoke_accounting_full_postgres.py --year 2026 --include-write`: `SUMMARY total=35 passed=35 failed=0`.

### Kemas Kini Fasa 2.13 (iterasi semasa)

- Tambah skrip smoke regression gabungan untuk modul backlog kumpulan awal:
  - `backend/scripts/smoke_marketplace_koperasi_student_import_postgres.py`.
- Cakupan semakan:
  - `marketplace`: dashboard/report/finance/analytics utama, role guard (`superadmin` vs `parent`), serta endpoint detail dinamik (`vendor`/`product`/`order`) jika data tersedia.
  - `koperasi_commission`: settings/report/pending + role guard, termasuk endpoint export laporan dengan parameter tarikh.
  - `student_import`: template/download, listing/export claim code, stats, dan negative-path claim (`404` untuk kod tidak sah) tanpa mutasi data produksi.
- Keputusan runtime semasa:
  - read-only: `SUMMARY total=28 passed=28 failed=0`,
  - include-write: `SUMMARY total=31 passed=31 failed=0`.
- Semakan write idempotent yang diliputi:
  - `PUT /api/marketplace/settings/commission`,
  - `PUT /api/marketplace/settings/ad-packages`,
  - `PUT /api/koperasi/commission/settings`.

### Kemas Kini Fasa 2.14 (iterasi semasa)

- Hardening compatibility tambahan pada adapter `CoreStore`:
  - `CoreCollection.distinct(...)` kini serasi dengan semantik Motor/PyMongo untuk argumen filter (`distinct(field, query)` dan `distinct(field, filter=...)`).
- Isu runtime sebenar yang diperbaiki:
  - `GET /api/hostel/blocks` sebelum ini `500` dalam mode `postgres` kerana panggilan `distinct("block", {...})` tidak disokong sepenuhnya oleh adapter.
- Tambah skrip smoke regression operasi pelajar:
  - `backend/scripts/smoke_hostel_sickbay_warden_discipline_risk_postgres.py`.
- Cakupan semakan:
  - `hostel`, `sickbay`, `warden`, `discipline`, `risk` (read endpoint utama + role guard),
  - validation write-path tanpa mutasi data (`422` expected untuk payload kosong pada endpoint write terpilih).
- Keputusan runtime semasa:
  - read-only: `SUMMARY total=38 passed=38 failed=0`,
  - include-write: `SUMMARY total=43 passed=43 failed=0`.
- Re-run smoke domain kritikal kekal hijau selepas pembaikan adapter `distinct(...)`:
  - `smoke_bus_dashboard_payment_postgres.py --include-write`: `SUMMARY total=17 passed=17 failed=0`,
  - `smoke_marketplace_koperasi_student_import_postgres.py --include-write`: `SUMMARY total=31 passed=31 failed=0`,
  - `smoke_yuran_postgres.py --include-write`: `SUMMARY total=24 passed=24 failed=0`,
  - `smoke_inventory_postgres.py --include-write`: `SUMMARY total=11 passed=11 failed=0`,
  - `smoke_accounting_full_postgres.py --year 2026 --include-write`: `SUMMARY total=35 passed=35 failed=0`.

### Kemas Kini Fasa 2.15 (iterasi semasa)

- Tambah skrip smoke regression untuk batch urutan #3:
  - `backend/scripts/smoke_infaq_analytics_system_config_postgres.py`.
- Cakupan semakan:
  - `infaq`: public campaign/stats, user flow (`campaigns`, `my-donations`), admin flow (`donations`, `stats`) + role guard.
  - `analytics`: dashboard/module analytics + AI endpoints (`ai-insights`, `chat`) untuk role staff.
  - `system-config`: read private/public, role guard write endpoint, dan write idempotent `POST /api/settings/system-config`.
- Hardening runtime tambahan:
  - `routes/infaq.py` kini mengendalikan `campaign_id` tidak sah secara selamat (invalid `ObjectId`) supaya endpoint detail/public memulangkan `404` dan bukan `500`.
- Keputusan runtime semasa:
  - read-only: `SUMMARY total=18 passed=18 failed=0`,
  - include-write: `SUMMARY total=25 passed=25 failed=0`.

### Kemas Kini Fasa 2.16 (iterasi semasa)

- Tambah skrip smoke regression untuk batch urutan #4:
  - `backend/scripts/smoke_upload_pwa_chatbox_postgres.py`.
- Cakupan semakan:
  - `upload`: endpoint serve imej (missing file -> `404`) + validation write endpoint upload (`422` tanpa multipart body).
  - `pwa`: version endpoint, role guard `send-notification`, pendaftaran token peranti (`register-device-token`).
  - `chatbox_faq`: list FAQ admin + role guard parent.
- Keputusan runtime semasa:
  - read-only: `SUMMARY total=10 passed=10 failed=0`,
  - include-write: `SUMMARY total=21 passed=21 failed=0`.
- Catatan kestabilan:
  - smoke ini mengesahkan flow kompatibiliti untuk endpoint upload/pwa/chatbox dalam mode `postgres` tanpa regresi endpoint kritikal.

### Kemas Kini Fasa 2.17 (iterasi semasa)

- Audit operator Mongo-only backlog dimulakan secara sistematik:
  - hotspot tertinggi semasa: `marketplace`, `accounting_full`, `hostel`, `inventory`, `accounting`.
- Hardening adapter `CoreStore`:
  - tambah sokongan semantik `$setOnInsert` yang hanya diaplikasi semasa laluan upsert-insert (`update_one` / `update_many` bila tiada dokumen padanan), selari dengan kelakuan MongoDB.
- Tambah skrip parity backlog per-modul:
  - `backend/scripts/verify_backlog_parity.py`.
- Ciri utama skrip parity backlog:
  - pemetaan `module -> collections` untuk kumpulan backlog,
  - semakan `count parity` per koleksi,
  - semakan `amount parity` (sum medan numerik terpilih),
  - semakan `snapshot parity` berasaskan sampel dokumen,
  - `ETL command hint` per modul (terus guna `migrate_core_to_postgres.py --collections ...`),
  - alias batch (`batch_1` hingga `batch_4`) untuk eksekusi berperingkat.
- Semakan awal menggunakan skrip baharu:
  - `student_import`: lulus (`claim_codes` 0 vs 0),
  - `marketplace`: mengesan divergence awal pada `marketplace_settings` (Mongo=0, Postgres=1) untuk tindakan reconcile seterusnya.
- Dapatan baseline parity backlog (run `batch_1` hingga `batch_4`, `max_docs=10000`, `snapshot_size=20`):
  - `marketplace`: `marketplace_settings` count tidak padan (`0` vs `1`).
  - `koperasi_commission`: `koperasi_settings` count padan tetapi snapshot ID tidak sepadan (rekod berbeza antara Mongo/Postgres).
  - `hostel`: `hostel_pbw_pbp_periods` count tidak padan (`1` vs `0`).
  - `discipline`: `olat_categories` count tidak padan (`3` vs `6`).
  - `inventory`: `vendors` count tidak padan (`0` vs `1`).
  - `accounting`: koleksi `settings` tidak padan (`2` vs `13`) dan snapshot berbeza.
  - `bank_accounts` / `agm_reports`: `accounting_transactions` amount sum berbeza (`30.11` vs `160.11`) bersama beberapa mismatch ID/count (`financial_years`, `accounting_categories`).
  - `chatbox_faq`: count padan (`14` vs `14`) tetapi semua snapshot ID tidak beririsan (set ID berbeza sepenuhnya).
  - `pwa`: `pwa_device_tokens` count tidak padan (`0` vs `3`).

### Kemas Kini Fasa 2.18 (iterasi semasa)

- Tambah utiliti perancangan reconcile:
  - `backend/scripts/plan_backlog_reconcile.py`.
- Fungsi utiliti ini:
  - klasifikasi divergence per koleksi (`aligned`, `mongo_ahead`, `postgres_ahead`, `id_drift`, `content_drift`),
  - saranan tindakan untuk konteks cutover `postgres`,
  - cadangan arahan `reconcile_core_divergence.py` mengikut arah source-target.
- Laporan semasa disimpan ke:
  - `backend/logs/backlog_reconcile_plan_20260311.json`.
- Tindakan terkawal yang telah dieksekusi:
  - `Mongo -> Postgres` reconcile untuk `hostel_pbw_pbp_periods` (`upserted=1`, `deleted=0`).
- Pengesahan selepas execute:
  - parity modul `hostel` kini lulus semula (`ok=true`; `hostel_pbw_pbp_periods` 1 vs 1 dan snapshot match).
- Ringkasan klasifikasi terkini (daripada utiliti plan):
  - `aligned`: 1 (`hostel_pbw_pbp_periods`),
  - `mongo_ahead`: 0,
  - `postgres_ahead`: 6,
  - `id_drift`: 4,
  - `content_drift`: 1 (`settings`).

### Kemas Kini Fasa 2.19 (iterasi semasa)

- Analisis tambahan untuk koleksi `id_drift` / `content_drift`:
  - semak overlap payload dengan abaikan `_id` bagi membezakan drift ID semata-mata vs drift kandungan.
- Laporan overlap disimpan ke:
  - `backend/logs/backlog_reconcile_payload_overlap_20260311.json`.
- Dapatan utama overlap payload:
  - `koperasi_settings`: tiada payload overlap (`common=0/1`) -> drift kandungan sebenar.
  - `olat_categories`: tiada payload overlap (`common=0`) -> drift kandungan sebenar.
  - `bank_accounts`: tiada payload overlap (`common=0/2`) -> drift kandungan sebenar.
  - `chatbox_faq`: overlap separa (`common=7/14`) -> separuh data berbeza.
  - `settings`: overlap separa (`common=1` daripada `mongo=2`, `postgres=13`) -> perlu keputusan source-of-truth per key.
- Implikasi tindakan:
  - koleksi di atas **tidak sesuai** untuk auto-prune tanpa semakan domain/UAT kerana bukan sekadar pertukaran `_id`.

### Kemas Kini Fasa 2.20 (iterasi semasa)

- Analisis natural-key untuk membezakan drift `_id` vs drift business entity:
  - laporan: `backend/logs/backlog_natural_key_overlap_20260311.json`.
- Dapatan natural-key:
  - `bank_accounts`: natural-key overlap penuh (`2/2`) walaupun `_id` tidak beririsan -> indikasi kuat drift ID/seed semata-mata.
  - `chatbox_faq`: natural-key overlap penuh (`14/14`) tetapi payload overlap separa -> entiti sama, kandungan sebahagian telah berubah.
  - `koperasi_settings`: natural-key overlap (`1/1`) tetapi payload berbeza -> konflik konfigurasi aktif.
  - `settings`: natural-key overlap untuk rekod asas (`2` key sepadan) dengan tambahan key baharu di postgres (template/modul/onboarding).
  - `olat_categories`: natural-key overlap tiada (`0`) -> data kategori benar-benar bercabang antara Mongo/Postgres.
- Keutamaan operasi seterusnya:
  - fokus manual review `settings`, `koperasi_settings`, `olat_categories`, `chatbox_faq` sebelum sebarang `prune`.
  - untuk `bank_accounts`, boleh pertimbang strategy reconcile berasaskan natural-key (bukan `_id`) jika mahu parity dua hala ketika fasa hybrid.

### Kemas Kini Fasa 2.21 (iterasi semasa)

- Tambah laporan diff per-field untuk koleksi yang natural-key sepadan:
  - `backend/logs/backlog_natural_key_field_diff_20260311.json`.
- Dapatan per-field (untuk keputusan reconcile lebih tepat):
  - `settings`:
    - padanan natural-key `type=auto_sync` dan `type=landing`,
    - drift kandungan sebenar hanya pada `type=landing.updated_at` (timestamp berlainan).
  - `koperasi_settings` (`type=commission`):
    - beza utama pada metadata (`created_at`, `updated_at`, `updated_by`), bukan pada kadar komisyen teras.
  - `bank_accounts` (2/2 natural-key padan):
    - beza pada `created_at` sahaja.
  - `chatbox_faq` (14/14 natural-key padan):
    - 7 entri berbeza pada teks `answer` (frasa/wording), bukan struktur.
- Implikasi:
  - sebahagian besar drift yang tinggal adalah metadata atau kandungan copywriting; bukan semestinya mismatch struktur ETL.
  - ini membolehkan keputusan reconcile dibuat lebih granular (ikut domain owner), tanpa auto-prune menyeluruh.

### Kemas Kini Fasa 2.22 (iterasi semasa)

- Execute reconcile konservatif tanpa prune (Postgres -> Mongo) untuk koleksi `postgres_ahead` + `settings`:
  - `marketplace_settings`, `vendors`, `accounting_transactions`, `financial_years`, `accounting_categories`, `pwa_device_tokens`, `settings`.
- Keputusan execute:
  - `upserted=34`, `deleted=0`.
- Hardening tool parity/reconcile:
  - `verify_backlog_parity.py`, `plan_backlog_reconcile.py`, `reconcile_core_divergence.py` kini menormalisasi datetime ke format canonical `UTC + milliseconds` sebelum semakan signature/parity.
  - tujuan: elak false positive drift akibat beza precision microsecond/tz.
- Laporan terkini:
  - `backend/logs/backlog_reconcile_plan_20260311.json`.

### Kemas Kini Fasa 2.23 (iterasi semasa)

- Execute reconcile targeted dengan prune (low-risk, ID drift metadata sahaja):
  - `bank_accounts`, `koperasi_settings` (`source=postgres`, `--prune-target`).
- Keputusan execute:
  - `upserted=3`, `deleted=3`.
- Re-run parity backlog selepas kemas kini:
  - laporan batch:
    - `backend/logs/backlog_parity_batch1_20260311.json`,
    - `backend/logs/backlog_parity_batch2_20260311.json`,
    - `backend/logs/backlog_parity_batch3_20260311.json`,
    - `backend/logs/backlog_parity_batch4_20260311.json`.
  - batch yang kini `ok=true`:
    - `batch_1` (`marketplace`, `koperasi_commission`, `student_import`),
    - `batch_3` (`inventory`, `accounting`, `bank_accounts`, `agm_reports`).
  - batch separa:
    - `batch_2`: hanya `discipline` masih gagal (drift `olat_categories`),
    - `batch_4`: hanya `chatbox_faq` masih gagal (ID drift penuh antara Mongo/Postgres).
- Ringkasan klasifikasi semasa (`plan_backlog_reconcile.py`):
  - `aligned=10`,
  - `id_drift=2` (`olat_categories`, `chatbox_faq`),
  - `mongo_ahead=0`, `postgres_ahead=0`, `content_drift=0`.

### Kemas Kini Fasa 2.24 (iterasi semasa)

- Sebelum reconcile final untuk koleksi kandungan:
  - snapshot backup Mongo dibuat ke `backend/logs/mongo_backup_before_final_prune_20260311.json`.
- Execute reconcile final (Postgres -> Mongo, `--prune-target`) untuk baki drift:
  - `olat_categories`, `chatbox_faq`.
- Keputusan execute:
  - `upserted=20`, `deleted=17`.
- Pengesahan parity pasca execute:
  - `batch_2` kini `ok=true` (termasuk `discipline`),
  - `batch_4` kini `ok=true` (termasuk `chatbox_faq` + `pwa` + `upload`),
  - laporan terkini:
    - `backend/logs/backlog_parity_batch2_20260311.json`,
    - `backend/logs/backlog_parity_batch4_20260311.json`.
- Klasifikasi reconcile terkini (`backend/logs/backlog_reconcile_plan_20260311.json`):
  - `aligned=12`, `mongo_ahead=0`, `postgres_ahead=0`, `id_drift=0`, `content_drift=0`.

### Kemas Kini Fasa 2.25 (iterasi semasa)

- Re-run smoke regression pasca reconcile untuk modul terkesan:
  - `smoke_marketplace_koperasi_student_import_postgres.py` -> `SUMMARY total=28 passed=28 failed=0`,
  - `smoke_hostel_sickbay_warden_discipline_risk_postgres.py` -> `SUMMARY total=38 passed=38 failed=0`,
  - `smoke_inventory_postgres.py` -> `SUMMARY total=10 passed=10 failed=0`,
  - `smoke_accounting_full_postgres.py --year 2026` -> `SUMMARY total=33 passed=33 failed=0`,
  - `smoke_upload_pwa_chatbox_postgres.py` -> `SUMMARY total=10 passed=10 failed=0`.
- Kesimpulan semasa:
  - parity backlog untuk set koleksi audit semasa sudah selari dua hala (Mongo/Postgres),
  - smoke kritikal pasca reconcile kekal hijau (tiada regresi dikesan).

### Kemas Kini Fasa 2.26 (iterasi semasa)

- Jalankan semakan parity gabungan semua modul backlog:
  - `backend/scripts/verify_backlog_parity.py --modules backlog_all --max-docs 10000 --snapshot-size 20`.
- Laporan disimpan ke:
  - `backend/logs/backlog_parity_all_20260311.json`.
- Keputusan semasa:
  - `ok=true` untuk semua modul dalam set backlog:
    - `marketplace`, `koperasi_commission`, `student_import`,
    - `hostel`, `sickbay`, `warden`, `discipline`, `risk`,
    - `inventory`, `accounting`, `bank_accounts`, `agm_reports`,
    - `chatbox_faq`, `pwa`, `upload`.
- Catatan operasi:
  - backup pra-prune kekal tersedia di `backend/logs/mongo_backup_before_final_prune_20260311.json` untuk rujukan/rollback manual jika diperlukan.

### Kemas Kini Fasa 2.27 (iterasi semasa)

- Jalankan smoke regression `include-write` (idempotent/validation writes) untuk suite postgres:
  - `smoke_marketplace_koperasi_student_import_postgres.py` -> `SUMMARY total=31 passed=31 failed=0`,
  - `smoke_hostel_sickbay_warden_discipline_risk_postgres.py` -> `SUMMARY total=43 passed=43 failed=0`,
  - `smoke_inventory_postgres.py` -> `SUMMARY total=11 passed=11 failed=0`,
  - `smoke_accounting_full_postgres.py --year 2026 --include-write` -> `SUMMARY total=35 passed=35 failed=0`,
  - `smoke_upload_pwa_chatbox_postgres.py --include-write` -> `SUMMARY total=21 passed=21 failed=0`,
  - `smoke_bus_dashboard_payment_postgres.py --include-write` -> `SUMMARY total=17 passed=17 failed=0`,
  - `smoke_yuran_postgres.py --tahun 2026 --include-write` -> `SUMMARY total=24 passed=24 failed=0`,
  - `smoke_infaq_analytics_system_config_postgres.py --include-write` -> `SUMMARY total=25 passed=25 failed=0`.
- Baseline performance endpoint berat (postgres mode) direkod:
  - laporan: `backend/logs/perf_backlog_heavy_endpoints_20260311.json`,
  - liputan: 12 endpoint berat (accounting/marketplace/yuran/dashboard/analytics),
  - metrik ringkas semasa: `overall_p95_max_ms=22.69`.
- Rekod ringkas keputusan smoke include-write juga disimpan:
  - `backend/logs/smoke_include_write_summary_20260311.json`.
- Implikasi semasa:
  - parity + smoke write-path + baseline latency kini tersedia sebagai bukti kestabilan pra-cutover backlog.

### Kemas Kini Fasa 2.28 (iterasi semasa)

- Selepas smoke `include-write`, divergence `content_drift` sempat dikesan pada:
  - `marketplace_settings`, `koperasi_settings`, `settings`, `pwa_device_tokens` (perubahan payload pada ID sama akibat write-path test).
- Tindakan susulan:
  - reconcile `Postgres -> Mongo` **tanpa prune** untuk 4 koleksi tersebut (`upserted=8`, `deleted=0`).
- Pengesahan akhir pasca sync:
  - `verify_backlog_parity.py --modules backlog_all` kembali `ok=true`,
  - `plan_backlog_reconcile.py` kembali `aligned=12`, `content_drift=0`, `id_drift=0`.
- Laporan rujukan kekal:
  - `backend/logs/backlog_parity_all_20260311.json`,
  - `backend/logs/backlog_reconcile_plan_20260311.json`.

### Kemas Kini Fasa 2.29 (iterasi semasa)

- Tambah automasi audit operator Mongo-only:
  - skrip baharu `backend/scripts/audit_mongo_only_usage.py`.
- Jalankan audit terhadap `backend/routes/*.py`:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - ringkasan: `files_with_hits=39`, `total_hits=575`.
- Corak dominan semasa:
  - `object_id_constructor=477`,
  - `aggregate_call=98`.
- Hotspot fail tertinggi:
  - `routes/marketplace.py` (`103`),
  - `routes/bus.py` (`75`),
  - `routes/hostel.py` (`48`),
  - `routes/accounting_full.py` (`45`),
  - `routes/payment_center.py` (`38`).
- Implikasi operasi:
  - backlog parity kini stabil, tetapi pengurangan kebergantungan Mongo-only patut diprioritikan ikut ranking hotspot audit ini.

### Kemas Kini Fasa 2.30 (iterasi semasa)

- Refactor hotspot `marketplace` untuk kurangkan operator Mongo-only:
  - semua penggunaan `.aggregate(...)` dalam `backend/routes/marketplace.py` telah diganti kepada pengiraan berasaskan `find()` + pemprosesan Python (sum/group/count harian/bulanan).
- Kesan audit operator selepas refactor:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `575` ke `537`,
  - `routes/marketplace.py` turun daripada `103` ke `65`,
  - `aggregate_call` keseluruhan turun daripada `98` ke `60`.
- Verifikasi pasca refactor:
  - compile/lint `marketplace.py`: lulus,
  - smoke `smoke_marketplace_koperasi_student_import_postgres.py --include-write`: `SUMMARY total=31 passed=31 failed=0`.
- Kestabilan parity:
  - semasa smoke write-path, drift content sementara dikesan pada `marketplace_settings` + `koperasi_settings`,
  - sync semula `Postgres -> Mongo` tanpa prune (`upserted=2`),
  - `verify_backlog_parity.py --modules batch_1` kembali `ok=true`,
  - `plan_backlog_reconcile.py` kembali `aligned=12`, `content_drift=0`.

### Kemas Kini Fasa 2.31 (iterasi semasa)

- Refactor hotspot `bus` untuk kurangkan penggunaan `ObjectId(...)` terus dalam route:
  - tambah helper `_id_value()` di `backend/routes/bus.py`,
  - semua callsite query/insert/update/delete dalam `bus.py` kini guna helper tersebut (normalisasi ID konsisten, fallback selamat untuk ID bukan-ObjectId).
- Verifikasi pasca refactor:
  - compile/lint `bus.py`: lulus,
  - smoke `smoke_bus_dashboard_payment_postgres.py --include-write`: `SUMMARY total=17 passed=17 failed=0`.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `537` ke `463`,
  - `routes/bus.py` turun daripada `75` ke `1`,
  - `object_id_constructor` keseluruhan turun kepada `403`.
- Kestabilan parity:
  - `plan_backlog_reconcile.py` kekal `aligned=12`, `content_drift=0`, `id_drift=0` selepas smoke/refactor.

### Kemas Kini Fasa 2.32 (iterasi semasa)

- Refactor susulan hotspot `marketplace` untuk kurangkan `ObjectId(...)` terus dalam route:
  - tambah helper `_id_value()` di `backend/routes/marketplace.py`,
  - semua callsite ID query/update/write dalam `marketplace.py` kini guna helper tersebut (normalisasi ID konsisten untuk laluan Mongo + CoreStore/Postgres).
- Verifikasi pasca refactor:
  - compile/lint `marketplace.py`: lulus,
  - smoke `smoke_marketplace_koperasi_student_import_postgres.py --include-write`: `SUMMARY total=31 passed=31 failed=0`.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `463` ke `399`,
  - `routes/marketplace.py` turun daripada `65` ke `1`,
  - `object_id_constructor` keseluruhan turun kepada `339`.
- Kestabilan parity:
  - smoke write-path menghasilkan `content_drift` sementara pada `marketplace_settings` + `koperasi_settings`,
  - sync semula konservatif `Postgres -> Mongo` tanpa prune (`upserted=2`),
  - `plan_backlog_reconcile.py` kembali `aligned=12`, `content_drift=0`, `id_drift=0`,
  - `verify_backlog_parity.py --modules backlog_all` kembali `ok=true`.

### Kemas Kini Fasa 2.33 (iterasi semasa)

- Refactor hotspot `hostel` untuk kurangkan penggunaan `ObjectId(...)` terus dalam route:
  - tambah helper `_id_value()` di `backend/routes/hostel.py`,
  - semua callsite `ObjectId(...)` pada path query/update/write ditukar kepada helper ID terpusat.
- Verifikasi pasca refactor:
  - compile/lint `hostel.py`: lulus,
  - smoke `smoke_hostel_sickbay_warden_discipline_risk_postgres.py --include-write`: `SUMMARY total=43 passed=43 failed=0`.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `399` ke `355`,
  - `routes/hostel.py` turun daripada `48` ke `4`,
  - `object_id_constructor` keseluruhan turun kepada `295`.
- Kestabilan parity:
  - `plan_backlog_reconcile.py` kekal `aligned=12`, `content_drift=0`, `id_drift=0`,
  - `verify_backlog_parity.py --modules backlog_all` kekal `ok=true`.

### Kemas Kini Fasa 2.34 (iterasi semasa)

- Refactor hotspot `payment_center` untuk kurangkan penggunaan `ObjectId(...)` terus dalam route:
  - tambah helper `_id_value()` di `backend/routes/payment_center.py`,
  - semua callsite `ObjectId(...)` untuk query/update/write pada route payment-center ditukar kepada helper ID terpusat.
- Verifikasi pasca refactor:
  - compile/lint `payment_center.py`: lulus,
  - smoke `smoke_bus_dashboard_payment_postgres.py --include-write`: `SUMMARY total=17 passed=17 failed=0`.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `355` ke `318`,
  - `routes/payment_center.py` turun daripada `38` ke `1`,
  - `object_id_constructor` keseluruhan turun kepada `258`.
- Kestabilan parity:
  - `plan_backlog_reconcile.py` kekal `aligned=12`, `content_drift=0`, `id_drift=0`,
  - `verify_backlog_parity.py --modules backlog_all` kekal `ok=true`.

### Kemas Kini Fasa 2.35 (iterasi semasa)

- Refactor susulan `accounting_full` untuk kurangkan penggunaan `ObjectId(...)` terus dalam route:
  - tambah helper `_id_value()` di `backend/routes/accounting_full.py`,
  - semua callsite `ObjectId(...)` untuk path query/update/write/list lookup dinormalkan ke helper ID terpusat.
- Verifikasi pasca refactor:
  - compile/lint `accounting_full.py`: lulus,
  - smoke `smoke_accounting_full_postgres.py --include-write`: `SUMMARY total=35 passed=35 failed=0`.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `318` ke `287`,
  - `routes/accounting_full.py` turun daripada `45` ke `14`,
  - `object_id_constructor` keseluruhan turun kepada `227` (baki utama kini pada operator `aggregate_call`).
- Kestabilan parity:
  - `plan_backlog_reconcile.py` kekal `aligned=12`, `content_drift=0`, `id_drift=0`,
  - `verify_backlog_parity.py --modules backlog_all` kekal `ok=true`.

### Kemas Kini Fasa 2.36 (iterasi semasa)

- Refactor hotspot `inventory` untuk kurangkan penggunaan `ObjectId(...)` terus dalam route:
  - tambah helper `_id_value()` di `backend/routes/inventory.py`,
  - semua callsite `ObjectId(...)` untuk query/update/write/list lookup dinormalkan kepada helper ID terpusat.
- Verifikasi pasca refactor:
  - compile/lint `inventory.py`: lulus,
  - smoke `smoke_inventory_postgres.py --include-write`: `SUMMARY total=11 passed=11 failed=0`.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `287` ke `262`,
  - `routes/inventory.py` turun daripada `31` ke `6`,
  - `object_id_constructor` keseluruhan turun kepada `202`.
- Kestabilan parity:
  - `plan_backlog_reconcile.py` kekal `aligned=12`, `content_drift=0`, `id_drift=0`,
  - `verify_backlog_parity.py --modules backlog_all` kekal `ok=true`.

### Kemas Kini Fasa 2.37 (iterasi semasa)

- Refactor hotspot `koperasi` untuk kurangkan penggunaan `ObjectId(...)` terus dalam route:
  - tambah helper `_id_value()` di `backend/routes/koperasi.py`,
  - semua callsite `ObjectId(...)` pada path query/update/write dinormalkan kepada helper ID terpusat.
- Verifikasi pasca refactor:
  - compile/lint `koperasi.py`: lulus,
  - smoke `smoke_marketplace_koperasi_student_import_postgres.py --include-write`: `SUMMARY total=31 passed=31 failed=0`.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `262` ke `238`,
  - `routes/koperasi.py` turun daripada `26` ke `2`,
  - `object_id_constructor` keseluruhan turun kepada `178`.
- Kestabilan parity:
  - smoke write-path menghasilkan `content_drift` sementara pada `marketplace_settings` + `koperasi_settings`,
  - sync semula konservatif `Postgres -> Mongo` tanpa prune (`upserted=2`),
  - `plan_backlog_reconcile.py` kembali `aligned=12`, `content_drift=0`, `id_drift=0`,
  - `verify_backlog_parity.py --modules backlog_all` kembali `ok=true`.

### Kemas Kini Fasa 2.38 (iterasi semasa)

- Refactor hotspot `bank_accounts` untuk kurangkan penggunaan `ObjectId(...)` terus dalam route:
  - tambah helper `_id_value()` di `backend/routes/bank_accounts.py`,
  - semua callsite `ObjectId(...)` pada path query/update/write/list lookup dinormalkan kepada helper ID terpusat.
- Verifikasi pasca refactor:
  - compile/lint `bank_accounts.py`: lulus,
  - smoke `smoke_accounting_full_postgres.py --include-write`: `SUMMARY total=35 passed=35 failed=0`.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `238` ke `219`,
  - `routes/bank_accounts.py` turun daripada `23` ke `4`,
  - `object_id_constructor` keseluruhan turun kepada `159`.
- Kestabilan parity:
  - `plan_backlog_reconcile.py` kekal `aligned=12`, `content_drift=0`, `id_drift=0`,
  - `verify_backlog_parity.py --modules backlog_all` kekal `ok=true`.

### Kemas Kini Fasa 2.39 (iterasi semasa)

- Refactor hotspot `discipline` untuk kurangkan penggunaan `ObjectId(...)` terus dalam route:
  - tambah helper `_id_value()` di `backend/routes/discipline.py` (dengan mod `strict=True` untuk endpoint yang memang perlu validasi ID),
  - semua callsite `ObjectId(...)` pada path query/update/write dinormalkan kepada helper ID terpusat.
- Verifikasi pasca refactor:
  - compile/lint `discipline.py`: lulus,
  - smoke `smoke_hostel_sickbay_warden_discipline_risk_postgres.py --include-write`: `SUMMARY total=43 passed=43 failed=0`.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `219` ke `201`,
  - `routes/discipline.py` turun daripada `19` ke `1`,
  - `object_id_constructor` keseluruhan turun kepada `141`.
- Kestabilan parity:
  - `plan_backlog_reconcile.py` kekal `aligned=12`, `content_drift=0`, `id_drift=0`,
  - `verify_backlog_parity.py --modules backlog_all` kekal `ok=true`.

### Kemas Kini Fasa 2.40 (iterasi semasa)

- Refactor hotspot `complaints` untuk kurangkan penggunaan `ObjectId(...)` terus dalam route:
  - tambah helper `_id_value()` di `backend/routes/complaints.py`,
  - semua callsite `ObjectId(...)` untuk path query/update/write dinormalkan kepada helper ID terpusat.
- Verifikasi pasca refactor:
  - compile/lint `complaints.py`: lulus,
  - tiada skrip smoke khusus `complaints`; verifikasi modul berkaitan kekal stabil melalui smoke lintas-modul semasa.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `201` ke `190`,
  - `routes/complaints.py` turun daripada `17` ke `6`,
  - `object_id_constructor` keseluruhan turun kepada `130`.
- Kestabilan parity:
  - `plan_backlog_reconcile.py` kekal `aligned=12`, `content_drift=0`, `id_drift=0`,
  - `verify_backlog_parity.py --modules backlog_all` kekal `ok=true`.

### Kemas Kini Fasa 2.41 (iterasi semasa)

- Refactor hotspot `agm` untuk kurangkan penggunaan `ObjectId(...)` terus dalam route:
  - tambah helper `_id_value()` di `backend/routes/agm.py`,
  - semua callsite `ObjectId(...)` pada path query/update/write dinormalkan kepada helper ID terpusat.
- Verifikasi pasca refactor:
  - compile/lint `agm.py`: lulus,
  - smoke `smoke_accounting_full_postgres.py --include-write`: `SUMMARY total=35 passed=35 failed=0` (meliputi endpoint AGM di bawah `accounting-full/agm/*`).
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `190` ke `175`,
  - `routes/agm.py` turun daripada `16` ke `1`,
  - `object_id_constructor` keseluruhan turun kepada `115`.
- Kestabilan parity:
  - `plan_backlog_reconcile.py` kekal `aligned=12`, `content_drift=0`, `id_drift=0`,
  - `verify_backlog_parity.py --modules backlog_all` kekal `ok=true`.

### Kemas Kini Fasa 2.42 (iterasi semasa)

- Refactor hotspot `users` untuk kurangkan penggunaan `ObjectId(...)` terus dalam route:
  - tambah helper `_id_value()` di `backend/routes/users.py`,
  - semua callsite `ObjectId(...)` pada query/update/delete user dinormalkan kepada helper ID terpusat.
- Verifikasi pasca refactor:
  - compile/lint `users.py`: lulus.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `175` ke `164`,
  - `routes/users.py` turun daripada `12` ke `1`,
  - `object_id_constructor` keseluruhan turun kepada `104`.
- Kestabilan parity:
  - `plan_backlog_reconcile.py` dan `verify_backlog_parity.py --modules backlog_all` kekal selari.

### Kemas Kini Fasa 2.43 (iterasi semasa)

- Refactor hotspot `upload` untuk kurangkan penggunaan `ObjectId(...)` terus dalam route:
  - tambah helper `_id_value()` di `backend/routes/upload.py`,
  - semua callsite `ObjectId(...)` pada query/update path upload dinormalkan kepada helper ID terpusat.
- Verifikasi pasca refactor:
  - compile/lint `upload.py`: lulus,
  - smoke `smoke_upload_pwa_chatbox_postgres.py --include-write`: `SUMMARY total=21 passed=21 failed=0`.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `164` ke `154`,
  - `routes/upload.py` turun daripada `11` ke `1`,
  - `object_id_constructor` keseluruhan turun kepada `94`.
- Nota parity:
  - smoke write untuk PWA menghasilkan `content_drift` sementara pada `pwa_device_tokens` (2 rekod),
  - reconcile `postgres -> mongo` telah dijalankan (`upserted=2`),
  - semakan semula `plan_backlog_reconcile.py` dan `verify_backlog_parity.py --modules backlog_all` kembali `aligned=12`, `content_drift=0`, `id_drift=0`, `ok=true`.

### Kemas Kini Fasa 2.44 (iterasi semasa)

- Refactor hotspot `warden` untuk kurangkan penggunaan `ObjectId(...)` terus dalam route:
  - tambah helper `_id_value()` di `backend/routes/warden.py` (sokong `strict=True` untuk validasi ID jadual),
  - semua callsite `ObjectId(...)` pada query/update/delete dinormalkan kepada helper ID terpusat.
- Verifikasi pasca refactor:
  - compile/lint `warden.py`: lulus,
  - smoke `smoke_hostel_sickbay_warden_discipline_risk_postgres.py --include-write`: `SUMMARY total=43 passed=43 failed=0`.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `154` ke `144`,
  - `routes/warden.py` turun daripada `11` ke `1`,
  - `object_id_constructor` keseluruhan turun kepada `84`.
- Kestabilan parity:
  - `plan_backlog_reconcile.py` kekal `aligned=12`, `content_drift=0`, `id_drift=0`,
  - `verify_backlog_parity.py --modules backlog_all` kekal `ok=true`.

### Kemas Kini Fasa 2.45 (iterasi semasa)

- Refactor hotspot tambahan untuk kurangkan penggunaan `ObjectId(...)` terus dalam route:
  - `backend/routes/categories.py`,
  - `backend/routes/notifications.py`,
  - `backend/routes/hostel_blocks.py`,
  - `backend/routes/email_templates.py`.
- Perubahan utama:
  - tambah helper `_id_value()` pada setiap modul di atas,
  - normalkan semua callsite `ObjectId(...)` pada path query/update/delete/write kepada helper ID terpusat,
  - tinggalkan operator `.aggregate(...)` yang masih diperlukan (akan difasa semasa kerja aggregate parity seterusnya).
- Verifikasi pasca refactor:
  - compile/lint semua fail di atas: lulus,
  - smoke lintas-modul:
    - `smoke_hostel_sickbay_warden_discipline_risk_postgres.py --include-write` → `43/43` lulus,
    - `smoke_upload_pwa_chatbox_postgres.py --include-write` → `21/21` lulus,
    - `smoke_accounting_full_postgres.py --include-write` → `35/35` lulus.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `144` ke `114`,
  - `object_id_constructor` keseluruhan turun daripada `84` ke `54`,
  - modul sasaran kini rendah:
    - `categories`: `10 -> 1`,
    - `notifications`: `9 -> 1`,
    - `hostel_blocks`: `10 -> 2` (baki `aggregate_call=1`),
    - `email_templates`: `7 -> 2` (baki `aggregate_call=1`).
- Nota parity:
  - smoke write-path `upload/pwa` menjana `content_drift` sementara pada `pwa_device_tokens` (2 rekod),
  - reconcile `postgres -> mongo` telah dijalankan (`upserted=2`),
  - semakan semula `plan_backlog_reconcile.py` + `verify_backlog_parity.py --modules backlog_all` kembali `aligned=12`, `content_drift=0`, `id_drift=0`, `ok=true`.

### Kemas Kini Fasa 2.46 (iterasi semasa)

- Refactor susulan pada `backend/routes/sickbay.py` untuk normalisasi ID:
  - tambah helper `_id_value()` dan tukar semua callsite `ObjectId(...)` pada query/update/write kepada helper ID terpusat.
- Verifikasi pasca refactor:
  - compile/lint `sickbay.py`: lulus,
  - smoke `smoke_hostel_sickbay_warden_discipline_risk_postgres.py --include-write`: `SUMMARY total=43 passed=43 failed=0`.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `114` ke `110`,
  - `routes/sickbay.py` turun daripada `6` ke `2` (baki `aggregate_call=1` + helper hit).
- Kestabilan parity:
  - `plan_backlog_reconcile.py` kekal `aligned=12`, `content_drift=0`, `id_drift=0`,
  - `verify_backlog_parity.py --modules backlog_all` kekal `ok=true`.

### Kemas Kini Fasa 2.47 (iterasi semasa)

- Refactor susulan pada `backend/routes/escalation.py` untuk normalisasi ID:
  - tambah helper `_id_value()` dan tukar semua callsite `ObjectId(...)` pada path query/update/write kepada helper ID terpusat.
- Verifikasi pasca refactor:
  - compile/lint `escalation.py`: lulus.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `110` ke `105`,
  - `routes/escalation.py` turun daripada `6` ke `1`,
  - `object_id_constructor` keseluruhan turun kepada `45`.
- Kestabilan parity:
  - `plan_backlog_reconcile.py` kekal `aligned=12`, `content_drift=0`, `id_drift=0`,
  - `verify_backlog_parity.py --modules backlog_all` kekal `ok=true`.

### Kemas Kini Fasa 2.48 (iterasi semasa)

- Refactor susulan untuk kurangkan baki `aggregate_call` pada modul low-risk:
  - `backend/routes/sickbay.py` (`common_symptoms`): gantikan `aggregate()` dengan kiraan Python atas hasil `find()`,
  - `backend/routes/hostel_blocks.py` (`level-detail`): gantikan `aggregate()` occupancy bilik dengan kiraan Python atas hasil `find()`,
  - `backend/routes/email_templates.py` (`stats-by-tingkatan`): gantikan `aggregate()` distinct parent dengan set-based kiraan Python.
- Verifikasi pasca refactor:
  - compile/lint ketiga-tiga fail: lulus,
  - smoke `smoke_hostel_sickbay_warden_discipline_risk_postgres.py --include-write`: `SUMMARY total=43 passed=43 failed=0`.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `105` ke `102`,
  - `aggregate_call` keseluruhan turun daripada `60` ke `57`,
  - modul sasaran kini:
    - `sickbay`: `2 -> 1` (tinggal helper `ObjectId`),
    - `hostel_blocks`: `2 -> 1` (tinggal helper `ObjectId`),
    - `email_templates`: `2 -> 1` (tinggal helper `ObjectId`).
- Kestabilan parity:
  - `plan_backlog_reconcile.py` kekal `aligned=12`, `content_drift=0`, `id_drift=0`,
  - `verify_backlog_parity.py --modules backlog_all` kekal `ok=true`.

### Kemas Kini Fasa 2.49 (iterasi semasa)

- Refactor susulan `backend/routes/bank_accounts.py` untuk buang baki `aggregate_call`:
  - helper kira baki akaun semasa (`calculate_account_balance`) kini guna `find()` + jumlah Python,
  - helper jumlah baki bawa ke hadapan (`get_total_opening_balance`) kini guna `find()` + jumlah Python.
- Verifikasi pasca refactor:
  - compile/lint `bank_accounts.py`: lulus,
  - smoke `smoke_accounting_full_postgres.py --include-write`: `SUMMARY total=35 passed=35 failed=0`.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `102` ke `99`,
  - `aggregate_call` keseluruhan turun daripada `57` ke `54`,
  - `routes/bank_accounts.py` turun daripada `4` ke `1` (tinggal helper `ObjectId`).
- Kestabilan parity:
  - `plan_backlog_reconcile.py` kekal `aligned=12`, `content_drift=0`, `id_drift=0`,
  - `verify_backlog_parity.py --modules backlog_all` kekal `ok=true`.

### Kemas Kini Fasa 2.50 (iterasi semasa)

- Refactor susulan `backend/routes/infaq.py` untuk buang baki `aggregate_call`:
  - `get_infaq_stats`: gantikan pipeline group dengan iterasi `find()` + jumlah Python (`total_donations`, `total_amount`, `total_slots_sold`),
  - `get_public_stats`: gantikan pipeline `$match/$group/$multiply` dengan iterasi `find()` + kiraan Python (`total_collected`, `total_slots_sold`).
- Verifikasi pasca refactor:
  - compile/lint `infaq.py`: lulus,
  - smoke `smoke_infaq_analytics_system_config_postgres.py --include-write`: `SUMMARY total=25 passed=25 failed=0`.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `99` ke `97`,
  - `aggregate_call` keseluruhan turun daripada `54` ke `52`,
  - `routes/infaq.py` turun daripada `4` ke `2` (tinggal helper `ObjectId`).
- Drift pasca smoke (expected write effect) dan pemulihan:
  - semakan parity mengesan `content_drift=1` pada `settings` (1 dokumen),
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections settings --execute` (`upserted=1`),
  - semakan semula parity kembali stabil: `aligned=12`, `content_drift=0`, `id_drift=0`, `ok=true`.

### Kemas Kini Fasa 2.51 (iterasi semasa)

- Refactor susulan `backend/routes/accounting_full.py` untuk buang baki `aggregate_call`:
  - `dashboard/stats`: gantikan 4 pipeline aggregate (bulan semasa + all-time) dengan iterasi `find()` + jumlah Python,
  - `summary`: gantikan pipeline group/sum untuk `commission_records`, `merchandise_orders`, `koop_orders`, `pum_orders`, `merchandise_products`, `pum_products` dengan iterasi `find()` + agregasi Python,
  - `monthly-trend`: gantikan pipeline `$match/$group/$year/$month` dengan iterasi `find()` + grouping Python berasaskan `created_at`.
- Verifikasi pasca refactor:
  - compile/lint `accounting_full.py`: lulus,
  - smoke `smoke_accounting_full_postgres.py --include-write`: `SUMMARY total=35 passed=35 failed=0`.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `97` ke `84`,
  - `aggregate_call` keseluruhan turun daripada `52` ke `39`,
  - `routes/accounting_full.py` turun daripada `14` ke `1` (tinggal helper `ObjectId`).
- Kestabilan parity:
  - `plan_backlog_reconcile.py` kekal `aligned=12`, `content_drift=0`, `id_drift=0`,
  - `verify_backlog_parity.py --modules backlog_all` kekal `ok=true`.

### Kemas Kini Fasa 2.52 (iterasi semasa)

- Refactor susulan `backend/routes/accounting.py` untuk buang semua baki `aggregate_call`:
  - endpoint `summary`: gantikan semua pipeline aggregate (muafakat/merchandise/koperasi/pum + inventory) dengan iterasi `find()` + agregasi Python,
  - endpoint `monthly-trend`: gantikan pipeline `$match/$group/$year/$month` dengan iterasi `find()` + grouping Python,
  - endpoint `commission-breakdown`: gantikan pipeline group/sort/avg dengan grouping Python (`sum`, `count`, `avg`).
- Verifikasi pasca refactor:
  - compile/lint `accounting.py`: lulus,
  - targeted API checks endpoint legacy accounting:
    - `GET /api/accounting/summary` → 200,
    - `GET /api/accounting/monthly-trend` → 200,
    - `GET /api/accounting/transactions` → 200,
    - `GET /api/accounting/commission-breakdown` → 200.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `84` ke `74`,
  - `aggregate_call` keseluruhan turun daripada `39` ke `29`,
  - `routes/accounting.py` turun daripada `10` ke `0`.
- Kestabilan parity:
  - `plan_backlog_reconcile.py` kekal `aligned=12`, `content_drift=0`, `id_drift=0`,
  - `verify_backlog_parity.py --modules backlog_all` kekal `ok=true`.

### Kemas Kini Fasa 2.53 (iterasi semasa)

- Refactor susulan `backend/routes/analytics.py` untuk buang semua baki `aggregate_call`:
  - gantikan 7 pipeline aggregate dalam modul analitik (`yuran`, `koperasi`, `bus`, `infaq`, `sedekah/tabung`, `hostel`, `sickbay`) dengan iterasi `find()` + agregasi Python,
  - kekalkan output struktur API yang sama untuk dashboard dan AI insight endpoint.
- Verifikasi pasca refactor:
  - compile/lint `analytics.py`: lulus,
  - smoke `smoke_infaq_analytics_system_config_postgres.py`: `SUMMARY total=18 passed=18 failed=0`.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `74` ke `67`,
  - `aggregate_call` keseluruhan turun daripada `29` ke `22`,
  - `routes/analytics.py` turun daripada `7` ke `0`.
- Kestabilan parity:
  - `plan_backlog_reconcile.py` kekal `aligned=12`, `content_drift=0`, `id_drift=0`,
  - `verify_backlog_parity.py --modules backlog_all` kekal `ok=true`.

### Kemas Kini Fasa 2.54 (iterasi semasa)

- Refactor susulan `backend/routes/complaints.py` untuk buang semua baki `aggregate_call`:
  - endpoint `trending/categories`, `dashboard/stats`, dan `reports/monthly` kini guna iterasi `find()` + grouping Python,
  - pengiraan `prestasi_respon` kini guna parser masa audit (`timestamp`) + purata response time Python.
- Refactor susulan `backend/routes/inventory.py` untuk buang semua baki `aggregate_call`:
  - endpoint `categories` kini kira usage category melalui iterasi `find()`,
  - endpoint `stats` kini kira `low_stock`, `total_value`, `by_category`, `by_vendor`, `by_module` melalui iterasi `find()` + agregasi Python.
- Verifikasi pasca refactor:
  - compile/lint `complaints.py` dan `inventory.py`: lulus,
  - smoke `smoke_inventory_postgres.py --include-write`: `SUMMARY total=11 passed=11 failed=0`,
  - targeted API checks `complaints`: `7/7` lulus (`/types`, `/guidelines`, list, my-complaints, trending, dashboard stats, monthly report).
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `67` ke `57`,
  - `aggregate_call` keseluruhan turun daripada `22` ke `12`,
  - `routes/complaints.py` turun daripada `6` ke `1` (tinggal helper `ObjectId`),
  - `routes/inventory.py` turun daripada `6` ke `1` (tinggal helper `ObjectId`).
- Kestabilan parity:
  - `plan_backlog_reconcile.py` kekal `aligned=12`, `content_drift=0`, `id_drift=0`,
  - `verify_backlog_parity.py --modules backlog_all` kekal `ok=true`.

### Kemas Kini Fasa 2.55 (iterasi semasa)

- Refactor susulan `backend/routes/hostel.py` untuk buang baki `aggregate_call`:
  - `stats`: kira pelajar keluar semasa melalui `distinct("student_id")`,
  - `empty-rooms`: gantikan pipeline project/group kepada iterasi `students.find()` + kiraan occupancy Python,
  - `outing/calendar-counts`: gantikan group tarikh kepada kiraan Python atas `hostel_records.find()`.
- Refactor susulan `backend/routes/agm_reports.py` untuk buang baki `aggregate_call`:
  - pengiraan `income` dan `expense` setiap akaun bank kini guna iterasi `find()` + jumlah Python dalam `get_bank_account_balances`.
- Verifikasi pasca refactor:
  - compile/lint `hostel.py` dan `agm_reports.py`: lulus,
  - smoke `smoke_hostel_sickbay_warden_discipline_risk_postgres.py --include-write`: `SUMMARY total=43 passed=43 failed=0`,
  - smoke `smoke_accounting_full_postgres.py --include-write`: `SUMMARY total=35 passed=35 failed=0`.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `57` ke `52`,
  - `aggregate_call` keseluruhan turun daripada `12` ke `7`,
  - `routes/hostel.py` turun daripada `4` ke `1` (tinggal helper `ObjectId`),
  - `routes/agm_reports.py` turun daripada `5` ke `3` (tinggal `ObjectId` sahaja).
- Kestabilan parity:
  - `plan_backlog_reconcile.py` kekal `aligned=12`, `content_drift=0`, `id_drift=0`,
  - `verify_backlog_parity.py --modules backlog_all` kekal `ok=true`.

### Kemas Kini Fasa 2.56 (iterasi semasa)

- Final sweep baki `aggregate_call` (7 callsite terakhir) diselesaikan pada:
  - `backend/routes/student_import.py`,
  - `backend/routes/koperasi_commission.py`,
  - `backend/routes/koperasi.py`,
  - `backend/routes/ar.py`,
  - `backend/routes/students.py`,
  - `backend/routes/admin_sync.py`.
- Ringkasan perubahan:
  - semua pipeline `aggregate($group/$sum/$count/$avg)` diganti kepada iterasi `find()` + agregasi Python setara,
  - output kontrak API dikekalkan (struktur response kekal sama).
- Verifikasi pasca refactor:
  - compile/lint keenam-enam fail: lulus,
  - smoke `smoke_marketplace_koperasi_student_import_postgres.py --include-write`: `SUMMARY total=31 passed=31 failed=0`,
  - targeted endpoint checks:
    - `GET /api/students-paginated/stats/summary` → 200,
    - `GET /api/admin/sync/status` → 200,
    - `GET /api/ar/notification-report` → 200.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `52` ke `45`,
  - `aggregate_call` keseluruhan turun daripada `7` ke `0`,
  - baki hit kini hanya `object_id_constructor` (tiada `aggregate_call` lagi dalam `backend/routes/*`).

### Kemas Kini Fasa 2.57 (iterasi semasa)

- Drift pasca smoke (expected write effect) dan pemulihan:
  - semakan parity mengesan `content_drift=2` pada `marketplace_settings` + `koperasi_settings`,
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections marketplace_settings koperasi_settings --execute` (`upserted=2`),
  - semakan semula parity kembali stabil: `aligned=12`, `content_drift=0`, `id_drift=0`, `ok=true`.

### Kemas Kini Fasa 2.58 (iterasi semasa)

- Normalisasi `ObjectId` hotspot seterusnya kepada helper `_id_value` terpusat:
  - `backend/routes/chatbox_faq.py` (4 callsite -> 1 callsite helper),
  - `backend/routes/agm_reports.py` (3 callsite -> 1 callsite helper),
  - `backend/routes/auth.py` (3 callsite -> 1 callsite helper).
- Kesan teknikal:
  - validasi ID lebih konsisten untuk endpoint berkaitan,
  - fallback non-ObjectId kekal serasi dengan `CoreCollection`/adapter semasa.
- Verifikasi pasca refactor:
  - compile/lint ketiga-tiga fail: lulus,
  - smoke `smoke_upload_pwa_chatbox_postgres.py --include-write`: `SUMMARY total=21 passed=21 failed=0`,
  - smoke `smoke_accounting_full_postgres.py --include-write`: `SUMMARY total=35 passed=35 failed=0`.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `45` ke `38`,
  - `summary_by_operator` kini `{"object_id_constructor": 38}` (tiada `aggregate_call`).

### Kemas Kini Fasa 2.59 (iterasi semasa)

- Drift pasca smoke (expected write effect) dan pemulihan:
  - semakan parity mengesan `content_drift=1` pada `pwa_device_tokens`,
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections pwa_device_tokens --execute` (`upserted=2`),
  - semakan semula parity kembali stabil: `aligned=12`, `content_drift=0`, `id_drift=0`, `ok=true`.

### Kemas Kini Fasa 2.60 (iterasi semasa)

- Normalisasi `ObjectId` batch susulan pada modul hotspot:
  - `backend/routes/infaq.py` (2 callsite -> 1 callsite helper),
  - `backend/routes/pwa.py` (2 callsite -> 1 callsite helper),
  - `backend/routes/risk.py` (2 callsite -> 1 callsite helper).
- Verifikasi pasca refactor:
  - compile/lint ketiga-tiga fail: lulus,
  - smoke `smoke_infaq_analytics_system_config_postgres.py`: `SUMMARY total=18 passed=18 failed=0`,
  - smoke `smoke_upload_pwa_chatbox_postgres.py --include-write`: `SUMMARY total=21 passed=21 failed=0`,
  - smoke `smoke_hostel_sickbay_warden_discipline_risk_postgres.py --include-write`: `SUMMARY total=43 passed=43 failed=0`.
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `total_hits` turun daripada `38` ke `35`,
  - `summary_by_operator` kekal `{"object_id_constructor": 35}` (tiada `aggregate_call`),
  - tiada modul >1 hit; baki hit berada pada helper `_id_value`/`_to_object_id` per modul.

### Kemas Kini Fasa 2.61 (iterasi semasa)

- Drift pasca smoke (expected write effect) dan pemulihan:
  - semakan parity mengesan `content_drift=1` pada `pwa_device_tokens`,
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections pwa_device_tokens --execute` (`upserted=2`),
  - semakan semula parity kembali stabil: `aligned=12`, `content_drift=0`, `id_drift=0`, `ok=true`.

### Kemas Kini Fasa 2.62 (iterasi semasa)

- Centralize helper ID ke modul shared:
  - fail baharu: `backend/services/id_normalizer.py` dengan helper `object_id_or_none()` dan `id_value()`,
  - semua helper lokal `_id_value`/`_to_object_id`/`_as_object_id_if_valid` dalam `backend/routes/*` dipaut ke helper shared (tiada lagi constructor `ObjectId(...)` dalam route file),
  - callsite direct constructor yang berbaki juga dinormalkan:
    - `backend/routes/student_import.py` (`parent_id` link),
    - `backend/routes/reports.py` (`set_yuran_id` filter),
    - `backend/routes/financial_dashboard.py` (normalisasi `student_id`),
    - `backend/routes/koperasi_commission.py` (`mark-paid` order IDs dengan validasi 400 untuk ID tidak sah).
- Verifikasi pasca refactor:
  - compile: `python -m py_compile routes/*.py services/id_normalizer.py` lulus,
  - lint: tiada isu baharu pada `backend/routes/*` dan `backend/services/id_normalizer.py`,
  - smoke matrix penuh lulus:
    - `smoke_marketplace_koperasi_student_import_postgres.py --include-write` (`31/31`),
    - `smoke_inventory_postgres.py --include-write` (`11/11`),
    - `smoke_hostel_sickbay_warden_discipline_risk_postgres.py --include-write` (`43/43`),
    - `smoke_upload_pwa_chatbox_postgres.py --include-write` (`21/21`),
    - `smoke_infaq_analytics_system_config_postgres.py` (`18/18`),
    - `smoke_accounting_full_postgres.py --include-write` (`35/35`),
    - `smoke_bus_dashboard_payment_postgres.py --include-write` (`17/17`),
    - `smoke_yuran_postgres.py --include-write` (`24/24`).
- Kesan audit operator selepas iterasi ini:
  - laporan: `backend/logs/mongo_only_operator_audit_20260311.json`,
  - `files_with_hits=0`, `modules_with_hits=0`, `total_hits=0`,
  - tiada lagi `aggregate_call` atau `object_id_constructor` pada `backend/routes/*`.

### Kemas Kini Fasa 2.63 (iterasi semasa)

- Drift pasca smoke matrix (expected write effect) dan pemulihan:
  - semakan reconcile/parity mengesan `content_drift` pada `marketplace_settings`, `koperasi_settings`, `settings`, dan `pwa_device_tokens`,
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections marketplace_settings koperasi_settings settings pwa_device_tokens --execute` (`upserted=7`),
  - semakan semula:
    - `plan_backlog_reconcile.py`: `aligned=12`, `content_drift=0`, `id_drift=0`,
    - `verify_backlog_parity.py --modules backlog_all`: `ok=true`.

### Kemas Kini Fasa 2.64 (iterasi semasa)

- Permulaan task #3 (typed table non-core) untuk domain PWA:
  - model baharu: `backend/models_sql/pwa_tables.py` (`PwaDeviceTokenRecord`),
  - migration baharu: `backend/alembic/versions/20260311_07_create_pwa_device_token_records.py`,
  - adapter baharu: `backend/repositories/pwa_relational_store.py` (typed collection + compatibility mirror ke `core_documents`),
  - bootstrap startup ditambah: `db/postgres.py` kini jalankan `bootstrap_relational_pwa_tables(...)`,
  - wiring runtime: `server.py` kini tambah `adapt_pwa_read_db(...)` dalam `get_relational_core_db()`, dan `routes/pwa.py` di-init melalui `get_relational_core_db`.
- Verifikasi pasca implementasi:
  - compile/lint fail baharu dan wiring: lulus,
  - smoke `smoke_upload_pwa_chatbox_postgres.py --include-write`: `SUMMARY total=21 passed=21 failed=0`,
  - audit operator kekal bersih: `total_hits=0`.

### Kemas Kini Fasa 2.65 (iterasi semasa)

- Drift pasca smoke PWA (expected write effect) dan pemulihan:
  - semakan parity mengesan `content_drift=1` pada `pwa_device_tokens`,
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections pwa_device_tokens --execute` (`upserted=2`),
  - semakan semula parity kembali stabil:
    - `plan_backlog_reconcile.py`: `aligned=12`, `content_drift=0`, `id_drift=0`,
    - `verify_backlog_parity.py --modules backlog_all`: `ok=true`.

### Kemas Kini Fasa 2.66 (iterasi semasa)

- Batch kedua task #3 (typed table non-core) untuk domain Chatbox FAQ:
  - model baharu: `backend/models_sql/chatbox_tables.py` (`ChatboxFaqRecord`),
  - migration baharu: `backend/alembic/versions/20260311_08_create_chatbox_faq_records.py`,
  - adapter baharu: `backend/repositories/chatbox_relational_store.py` (typed collection + compatibility mirror ke `core_documents`),
  - bootstrap startup ditambah: `db/postgres.py` kini jalankan `bootstrap_relational_chatbox_tables(...)`,
  - wiring runtime: `server.py` kini tambah `adapt_chatbox_read_db(...)` dalam `get_relational_core_db()`, dan `routes/chatbox_faq.py` di-init melalui `get_relational_core_db`.
- Verifikasi pasca implementasi:
  - compile/lint fail baharu dan wiring: lulus,
  - smoke `smoke_upload_pwa_chatbox_postgres.py --include-write`: `SUMMARY total=21 passed=21 failed=0`,
  - audit operator kekal bersih: `total_hits=0`.

### Kemas Kini Fasa 2.67 (iterasi semasa)

- Drift pasca smoke Chatbox/PWA (expected write effect) dan pemulihan:
  - semakan parity mengesan `content_drift=1` pada `pwa_device_tokens`,
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections pwa_device_tokens --execute` (`upserted=2`),
  - semakan semula parity kembali stabil:
    - `plan_backlog_reconcile.py`: `aligned=12`, `content_drift=0`, `id_drift=0`,
    - `verify_backlog_parity.py --modules backlog_all`: `ok=true`.

### Kemas Kini Fasa 2.68 (iterasi semasa)

- Batch ketiga task #3 (typed table non-core) untuk domain Notifications:
  - model baharu: `backend/models_sql/notification_tables.py` (`NotificationRecord`),
  - migration baharu: `backend/alembic/versions/20260311_09_create_notification_records.py`,
  - adapter baharu: `backend/repositories/notifications_relational_store.py` (typed collection + compatibility mirror ke `core_documents`),
  - bootstrap startup ditambah: `db/postgres.py` kini jalankan `bootstrap_relational_notification_tables(...)`,
  - wiring runtime:
    - `server.py` kini tambah `adapt_notifications_read_db(...)` dalam `get_relational_core_db()`,
    - `_runtime_db()` kini melalui `adapt_notifications_read_db(core_db or db)` supaya endpoint notifikasi legacy dalam `server.py` juga guna typed collection.
- Verifikasi pasca implementasi:
  - compile/lint fail baharu dan wiring: lulus,
  - smoke matrix penuh (8 suite) lulus termasuk flow yang melibatkan runtime `_runtime_db()`,
  - audit operator kekal bersih: `total_hits=0`.

### Kemas Kini Fasa 2.69 (iterasi semasa)

- Drift pasca smoke matrix (expected write effect) dan pemulihan:
  - semakan parity mengesan `content_drift` pada `marketplace_settings`, `koperasi_settings`, `settings`, dan `pwa_device_tokens`,
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections marketplace_settings koperasi_settings settings pwa_device_tokens --execute` (`upserted=7`),
  - semakan semula parity kembali stabil:
    - `plan_backlog_reconcile.py`: `aligned=12`, `content_drift=0`, `id_drift=0`,
    - `verify_backlog_parity.py --modules backlog_all`: `ok=true`.

### Kemas Kini Fasa 2.70 (iterasi semasa)

- Batch keempat task #3 (typed table non-core) dalam domain Notifications:
  - model baharu: `backend/models_sql/announcement_tables.py` (`AnnouncementRecord`),
  - migration baharu: `backend/alembic/versions/20260311_10_create_announcement_records.py`,
  - adapter `backend/repositories/notifications_relational_store.py` diperluas untuk koleksi `announcements` (selain `notifications`) dengan compatibility mirror ke `core_documents`,
  - bootstrap startup `bootstrap_relational_notification_tables(...)` kini seed dua typed table: `notification_records` + `announcement_records`.
- Verifikasi pasca implementasi:
  - compile/lint fail baharu dan wiring: lulus,
  - smoke matrix penuh (8 suite) lulus,
  - smoke sasaran endpoint `announcements` (list + create + get-by-id + delete) lulus (`ANNOUNCEMENTS_TYPED_SMOKE_OK`),
  - audit operator kekal bersih: `total_hits=0`.

### Kemas Kini Fasa 2.71 (iterasi semasa)

- Drift pasca smoke matrix (expected write effect) dan pemulihan:
  - semakan parity mengesan `content_drift` pada `marketplace_settings`, `koperasi_settings`, `settings`, dan `pwa_device_tokens`,
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections marketplace_settings koperasi_settings settings pwa_device_tokens --execute` (`upserted=7`),
  - semakan semula parity kembali stabil:
    - `plan_backlog_reconcile.py`: `aligned=12`, `content_drift=0`, `id_drift=0`,
    - `verify_backlog_parity.py --modules backlog_all`: `ok=true`.

### Kemas Kini Fasa 2.72 (iterasi semasa)

- Batch kelima task #3 (typed table non-core) dalam domain Notifications:
  - model baharu: `backend/models_sql/push_subscription_tables.py` (`PushSubscriptionRecord`),
  - migration baharu: `backend/alembic/versions/20260311_11_create_push_subscription_records.py`,
  - adapter `backend/repositories/notifications_relational_store.py` diperluas untuk koleksi `push_subscriptions` (selain `notifications` + `announcements`) dengan compatibility mirror ke `core_documents`,
  - bootstrap startup `bootstrap_relational_notification_tables(...)` kini seed tiga typed table domain notifikasi: `notification_records`, `announcement_records`, `push_subscription_records`.
- Verifikasi pasca implementasi:
  - compile/lint fail baharu dan wiring: lulus,
  - smoke matrix penuh (8 suite) lulus,
  - smoke sasaran endpoint push subscription (`public-key` + `subscribe` + `status`) lulus (`PUSH_SUBSCRIPTIONS_TYPED_SMOKE_OK`),
  - audit operator kekal bersih: `total_hits=0`.

### Kemas Kini Fasa 2.73 (iterasi semasa)

- Drift pasca smoke matrix (expected write effect) dan pemulihan:
  - semakan parity mengesan `content_drift` pada `marketplace_settings`, `koperasi_settings`, `settings`, dan `pwa_device_tokens`,
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections marketplace_settings koperasi_settings settings pwa_device_tokens --execute` (`upserted=7`),
  - semakan semula parity kembali stabil:
    - `plan_backlog_reconcile.py`: `aligned=12`, `content_drift=0`, `id_drift=0`,
    - `verify_backlog_parity.py --modules backlog_all`: `ok=true`.

### Kemas Kini Fasa 2.74 (iterasi semasa)

- Batch keenam task #3 (typed table non-core) dalam domain Notifications:
  - model baharu: `backend/models_sql/push_log_tables.py` (`PushLogRecord`),
  - migration baharu: `backend/alembic/versions/20260311_12_create_push_log_records.py`,
  - adapter `backend/repositories/notifications_relational_store.py` diperluas untuk koleksi `push_logs` (selain `notifications` + `announcements` + `push_subscriptions`) dengan compatibility mirror ke `core_documents`,
  - bootstrap startup `bootstrap_relational_notification_tables(...)` kini seed empat typed table domain notifikasi: `notification_records`, `announcement_records`, `push_subscription_records`, `push_log_records`.
- Verifikasi pasca implementasi:
  - compile/lint fail baharu dan wiring: lulus,
  - smoke matrix penuh (8 suite) lulus,
  - smoke sasaran flow `guru/send-quick` untuk trigger write `push_logs` lulus (`PUSH_LOGS_TYPED_SMOKE_OK`),
  - audit operator kekal bersih: `total_hits=0`.

### Kemas Kini Fasa 2.75 (iterasi semasa)

- Drift pasca smoke matrix (expected write effect) dan pemulihan:
  - semakan parity mengesan `content_drift` pada `marketplace_settings`, `koperasi_settings`, `settings`, dan `pwa_device_tokens`,
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections marketplace_settings koperasi_settings settings pwa_device_tokens --execute` (`upserted=7`),
  - semakan semula parity kembali stabil:
    - `plan_backlog_reconcile.py`: `aligned=12`, `content_drift=0`, `id_drift=0`,
    - `verify_backlog_parity.py --modules backlog_all`: `ok=true`.

### Kemas Kini Fasa 2.76 (iterasi semasa)

- Batch ketujuh task #3 (typed table non-core) dalam domain Notifications:
  - model baharu: `backend/models_sql/email_log_tables.py` (`EmailLogRecord`),
  - migration baharu: `backend/alembic/versions/20260311_13_create_email_log_records.py`,
  - adapter `backend/repositories/notifications_relational_store.py` diperluas untuk koleksi `email_logs` (selain `notifications` + `announcements` + `push_subscriptions` + `push_logs`) dengan compatibility mirror ke `core_documents`,
  - bootstrap startup `bootstrap_relational_notification_tables(...)` kini seed lima typed table domain notifikasi: `notification_records`, `announcement_records`, `push_subscription_records`, `push_log_records`, `email_log_records`.
- Verifikasi pasca implementasi:
  - compile/lint fail baharu dan wiring: lulus,
  - smoke matrix penuh (8 suite) lulus,
  - smoke sasaran flow `guru/send-quick` dengan `send_email=true` untuk trigger write `email_logs` lulus (`EMAIL_LOGS_TYPED_SMOKE_OK`),
  - audit operator kekal bersih: `total_hits=0`.

### Kemas Kini Fasa 2.77 (iterasi semasa)

- Drift pasca smoke matrix (expected write effect) dan pemulihan:
  - semakan parity mengesan `content_drift` pada `marketplace_settings`, `koperasi_settings`, `settings`, dan `pwa_device_tokens`,
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections marketplace_settings koperasi_settings settings pwa_device_tokens --execute` (`upserted=7`),
  - semakan semula parity kembali stabil:
    - `plan_backlog_reconcile.py`: `aligned=12`, `content_drift=0`, `id_drift=0`,
    - `verify_backlog_parity.py --modules backlog_all`: `ok=true`.

### Kemas Kini Fasa 2.78 (iterasi semasa)

- Batch kelapan task #3 (typed table non-core) dalam domain Notifications:
  - model baharu: `backend/models_sql/email_template_tables.py` (`EmailTemplateRecord`),
  - migration baharu: `backend/alembic/versions/20260311_14_create_email_template_records.py`,
  - adapter `backend/repositories/notifications_relational_store.py` diperluas untuk koleksi `email_templates` (selain `notifications` + `announcements` + `push_subscriptions` + `push_logs` + `email_logs`) dengan compatibility mirror ke `core_documents`,
  - bootstrap startup `bootstrap_relational_notification_tables(...)` kini seed enam typed table domain notifikasi: `notification_records`, `announcement_records`, `push_subscription_records`, `push_log_records`, `email_log_records`, `email_template_records`,
  - wiring route dimuktamadkan ke jalur relational: `email_templates_routes.init_router(get_relational_core_db, get_current_user)`.
- Verifikasi pasca implementasi:
  - compile/lint fail baharu dan wiring: lulus,
  - smoke matrix penuh (8 suite) lulus,
  - smoke sasaran CRUD + send-test untuk `email_templates` lulus (`EMAIL_TEMPLATES_TYPED_SMOKE_OK`),
  - audit operator kekal bersih: `total_hits=0`.

### Kemas Kini Fasa 2.79 (iterasi semasa)

- Drift pasca smoke matrix (expected write effect) dan pemulihan:
  - semakan parity mengesan `content_drift` pada `marketplace_settings`, `koperasi_settings`, `settings`, dan `pwa_device_tokens`,
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections marketplace_settings koperasi_settings settings pwa_device_tokens --execute` (`upserted=7`),
  - semakan semula parity kembali stabil:
    - `plan_backlog_reconcile.py`: `aligned=12`, `content_drift=0`, `id_drift=0`,
    - `verify_backlog_parity.py --modules backlog_all`: `ok=true`.

### Kemas Kini Fasa 2.80 (iterasi semasa)

- Batch kesembilan task #3 (typed table non-core) untuk aliran payment reminder:
  - model baharu: `backend/models_sql/payment_reminder_tables.py` (`PaymentReminderRecord`, `PaymentReminderPreferenceRecord`),
  - migration baharu: `backend/alembic/versions/20260311_15_create_payment_reminder_records.py`,
  - adapter `backend/repositories/notifications_relational_store.py` diperluas untuk koleksi `payment_reminders` dan `payment_reminder_preferences` (selain koleksi domain notifikasi sedia ada) dengan compatibility mirror ke `core_documents`,
  - bootstrap startup `bootstrap_relational_notification_tables(...)` kini seed lapan typed table dalam domain notifikasi+reminder: `notification_records`, `announcement_records`, `push_subscription_records`, `push_log_records`, `email_log_records`, `email_template_records`, `payment_reminder_records`, `payment_reminder_preference_records`,
  - scheduler reminder kini melalui adapter typed: `run_payment_reminder_job()` menggunakan `adapt_notifications_read_db(core_db or db)`.
- Verifikasi pasca implementasi:
  - compile/lint fail baharu dan wiring: lulus,
  - smoke matrix penuh (8 suite) lulus,
  - smoke sasaran reminder preferences + create/list/process/cancel reminder lulus (`PAYMENT_REMINDERS_TYPED_SMOKE_OK`),
  - audit operator kekal bersih: `total_hits=0`.

### Kemas Kini Fasa 2.81 (iterasi semasa)

- Drift pasca smoke matrix (expected write effect) dan pemulihan:
  - semakan parity mengesan `content_drift` pada `marketplace_settings`, `koperasi_settings`, `settings`, dan `pwa_device_tokens`,
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections marketplace_settings koperasi_settings settings pwa_device_tokens --execute` (`upserted=7`),
  - semakan semula parity kembali stabil:
    - `plan_backlog_reconcile.py`: `aligned=12`, `content_drift=0`, `id_drift=0`,
    - `verify_backlog_parity.py --modules backlog_all`: `ok=true`.

### Kemas Kini Fasa 2.82 (iterasi semasa)

- Batch kesepuluh task #3 (typed table non-core) untuk troli payment center:
  - model baharu: `backend/models_sql/payment_center_cart_tables.py` (`PaymentCenterCartRecord`),
  - migration baharu: `backend/alembic/versions/20260311_16_create_payment_center_cart_records.py`,
  - adapter `backend/repositories/notifications_relational_store.py` diperluas untuk koleksi `payment_center_cart` (selain koleksi typed notifikasi+reminder sedia ada) dengan compatibility mirror ke `core_documents`,
  - bootstrap startup `bootstrap_relational_notification_tables(...)` kini turut seed `payment_center_cart_records`,
  - kemas kini kecil route comment `payment_center.py` supaya neutral kepada runtime DB (bukan Mongo-only).
- Verifikasi pasca implementasi:
  - compile/lint fail baharu dan wiring: lulus,
  - smoke matrix penuh (8 suite) lulus,
  - smoke sasaran cart (`pending-items` -> add -> patch quantity -> remove -> clear) lulus (`PAYMENT_CENTER_CART_TYPED_SMOKE_OK`),
  - audit operator kekal bersih: `total_hits=0`.

### Kemas Kini Fasa 2.83 (iterasi semasa)

- Drift pasca smoke matrix (expected write effect) dan pemulihan:
  - semakan parity mengesan `content_drift` pada `marketplace_settings`, `koperasi_settings`, `settings`, dan `pwa_device_tokens`,
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections marketplace_settings koperasi_settings settings pwa_device_tokens --execute` (`upserted=7`),
  - semakan semula parity kembali stabil:
    - `plan_backlog_reconcile.py`: `aligned=12`, `content_drift=0`, `id_drift=0`,
    - `verify_backlog_parity.py --modules backlog_all`: `ok=true`.

### Kemas Kini Fasa 2.84 (iterasi semasa)

- Batch kesebelas task #3 (typed table non-core) untuk resit payment center:
  - model baharu: `backend/models_sql/payment_receipt_tables.py` (`PaymentReceiptRecord`),
  - migration baharu: `backend/alembic/versions/20260311_17_create_payment_receipt_records.py`,
  - adapter `backend/repositories/notifications_relational_store.py` diperluas untuk koleksi `payment_receipts` (selain koleksi typed notifikasi+reminder+cart sedia ada) dengan compatibility mirror ke `core_documents`,
  - bootstrap startup `bootstrap_relational_notification_tables(...)` kini turut seed `payment_receipt_records`,
  - hardening endpoint PDF resit: format `created_at` kini serasi jika nilai datang sebagai `str` atau `datetime`.
- Verifikasi pasca implementasi:
  - compile/lint fail baharu dan wiring: lulus,
  - smoke matrix penuh (8 suite) lulus,
  - smoke sasaran receipts (`pending-items` -> add -> checkout -> list/detail/pdf) lulus (`PAYMENT_RECEIPTS_TYPED_SMOKE_OK`),
  - audit operator kekal bersih: `total_hits=0`.

### Kemas Kini Fasa 2.85 (iterasi semasa)

- Drift pasca smoke matrix (expected write effect) dan pemulihan:
  - semakan parity mengesan `content_drift` pada `marketplace_settings`, `koperasi_settings`, `settings`, dan `pwa_device_tokens`, serta `postgres_ahead` pada `accounting_transactions` (kesan write-path checkout smoke),
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections marketplace_settings koperasi_settings settings accounting_transactions pwa_device_tokens --execute` (`upserted=11`),
  - semakan semula parity kembali stabil:
    - `plan_backlog_reconcile.py`: `aligned=12`, `content_drift=0`, `id_drift=0`,
    - `verify_backlog_parity.py --modules backlog_all`: `ok=true`.

### Kemas Kini Fasa 2.86 (iterasi semasa)

- Batch kedua belas task #3 (typed table non-core) untuk aliran tempahan bas:
  - model baharu: `backend/models_sql/bus_booking_tables.py` (`BusBookingRecord`),
  - migration baharu: `backend/alembic/versions/20260311_18_create_bus_booking_records.py`,
  - adapter `backend/repositories/notifications_relational_store.py` diperluas untuk koleksi `bus_bookings` (dengan compatibility mirror ke `core_documents`),
  - bootstrap startup `bootstrap_relational_notification_tables(...)` kini turut seed `bus_booking_records`,
  - hardening checkout bas dalam `backend/routes/payment_center.py`: dokumen booking kini menyimpan medan yang konsisten dengan modul bas (`booking_number`, `parent_id`, `payment_status`, `drop_off_point`, `notes`, dll) supaya read-path `bus` lebih stabil.
- Hardening tambahan keserasian cursor adapter:
  - sokongan `cursor.to_list(length=...)` ditambah pada adapter relational (`notifications_relational_store`, `chatbox_relational_store`),
  - iterator async `__aiter__/__anext__` ditambah pada cursor typed `notifications` untuk sokong `async for` pada endpoint analitik/bas.
- Verifikasi pasca implementasi:
  - compile/lint fail baharu dan wiring: lulus,
  - smoke matrix penuh (8 suite) lulus,
  - smoke sasaran `bus_bookings` (setup syarikat/bas/route/trip -> parent booking -> assign-seat -> checkout `payment_center` item `bus` -> cancel trip) lulus (`BUS_BOOKINGS_TYPED_SMOKE_OK`),
  - audit operator kekal bersih: `total_hits=0`.

### Kemas Kini Fasa 2.87 (iterasi semasa)

- Drift pasca smoke matrix (expected write effect) dan pemulihan:
  - semakan parity mengesan `content_drift` pada `marketplace_settings`, `koperasi_settings`, `settings`, dan `pwa_device_tokens`,
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections marketplace_settings koperasi_settings settings pwa_device_tokens --execute` (`upserted=7`),
  - semakan semula parity kembali stabil:
    - `plan_backlog_reconcile.py`: `aligned=12`, `content_drift=0`, `id_drift=0`,
    - `verify_backlog_parity.py --modules backlog_all`: `ok=true`.

### Kemas Kini Fasa 2.88 (iterasi semasa)

- Batch ketiga belas task #3 (typed table non-core) untuk aliran jadual trip bas:
  - model baharu: `backend/models_sql/bus_trip_tables.py` (`BusTripRecord`),
  - migration baharu: `backend/alembic/versions/20260311_19_create_bus_trip_records.py`,
  - adapter `backend/repositories/notifications_relational_store.py` diperluas untuk koleksi `bus_trips` (dengan compatibility mirror ke `core_documents`),
  - bootstrap startup `bootstrap_relational_notification_tables(...)` kini turut seed `bus_trip_records`.
- Verifikasi pasca implementasi:
  - compile/lint fail baharu dan wiring: lulus,
  - smoke matrix penuh (8 suite) lulus,
  - smoke sasaran `bus_trips` (setup syarikat/bas/route/trip -> update trip -> parent booking -> assign-seat -> checkout `payment_center` item `bus` -> cancel trip) lulus (`BUS_TRIPS_TYPED_SMOKE_OK`),
  - audit operator kekal bersih: `total_hits=0`.

### Kemas Kini Fasa 2.89 (iterasi semasa)

- Drift pasca smoke matrix (expected write effect) dan pemulihan:
  - semakan parity mengesan `content_drift` pada `marketplace_settings`, `koperasi_settings`, `settings`, dan `pwa_device_tokens`,
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections marketplace_settings koperasi_settings settings pwa_device_tokens --execute` (`upserted=7`),
  - semakan semula parity kembali stabil:
    - `plan_backlog_reconcile.py`: `aligned=12`, `content_drift=0`, `id_drift=0`,
    - `verify_backlog_parity.py --modules backlog_all`: `ok=true`.

### Kemas Kini Fasa 2.90 (iterasi semasa)

- Batch keempat belas task #3 (typed table non-core) untuk aliran route bas:
  - model baharu: `backend/models_sql/bus_route_tables.py` (`BusRouteRecord`),
  - migration baharu: `backend/alembic/versions/20260311_20_create_bus_route_records.py`,
  - adapter `backend/repositories/notifications_relational_store.py` diperluas untuk koleksi `bus_routes` (dengan compatibility mirror ke `core_documents`),
  - bootstrap startup `bootstrap_relational_notification_tables(...)` kini turut seed `bus_route_records`.
- Hardening regresi semasa verifikasi:
  - `backend/routes/bus.py` (`update_route`) kini serasi apabila `pickup_locations` / `drop_off_points` datang sebagai dict atau model object,
  - semakan pemilikan bas vs route dalam `create_trip` dinormalkan menggunakan perbandingan string ID supaya robust antara `ObjectId`/`str`.
- Verifikasi pasca implementasi:
  - compile/lint fail baharu dan wiring: lulus,
  - smoke matrix penuh (8 suite) lulus,
  - smoke sasaran `bus_routes` (setup syarikat/bas/route return -> update route -> create trip -> guard delete route aktif -> cancel trip -> delete route) lulus (`BUS_ROUTES_TYPED_SMOKE_OK`),
  - smoke regresi modul berkaitan `bus`/`payment_center` lulus (`smoke_bus_dashboard_payment_postgres.py --include-write`: `17/17`),
  - audit operator kekal bersih: `total_hits=0`.

### Kemas Kini Fasa 2.91 (iterasi semasa)

- Drift pasca smoke matrix (expected write effect) dan pemulihan:
  - semakan parity mengesan `content_drift` pada `marketplace_settings`, `koperasi_settings`, `settings`, dan `pwa_device_tokens`,
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections marketplace_settings koperasi_settings settings pwa_device_tokens --execute` (`upserted=7`),
  - semakan semula parity kembali stabil:
    - `plan_backlog_reconcile.py`: `aligned=12`, `content_drift=0`, `id_drift=0`,
    - `verify_backlog_parity.py --modules backlog_all`: `ok=true`.

### Kemas Kini Fasa 2.92 (iterasi semasa)

- Batch kelima belas task #3 (typed table non-core) untuk aliran syarikat bas:
  - model baharu: `backend/models_sql/bus_company_tables.py` (`BusCompanyRecord`),
  - migration baharu: `backend/alembic/versions/20260311_21_create_bus_company_records.py`,
  - adapter `backend/repositories/notifications_relational_store.py` diperluas untuk koleksi `bus_companies` (dengan compatibility mirror ke `core_documents`),
  - bootstrap startup `bootstrap_relational_notification_tables(...)` kini turut seed `bus_company_records`.
- Verifikasi pasca implementasi:
  - compile/lint fail baharu dan wiring: lulus,
  - smoke matrix penuh (8 suite) lulus,
  - smoke sasaran `bus_companies` (create -> duplicate registration guard -> get/list by status -> update -> approve flow -> delete) lulus (`BUS_COMPANIES_TYPED_SMOKE_OK`),
  - smoke regresi modul berkaitan `bus`/`payment_center` lulus (`smoke_bus_dashboard_payment_postgres.py --include-write`: `17/17`),
  - audit operator kekal bersih: `total_hits=0`.

### Kemas Kini Fasa 2.93 (iterasi semasa)

- Drift pasca smoke matrix (expected write effect) dan pemulihan:
  - semakan parity mengesan `content_drift` pada `marketplace_settings`, `koperasi_settings`, `settings`, dan `pwa_device_tokens`,
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections marketplace_settings koperasi_settings settings pwa_device_tokens --execute` (`upserted=7`),
  - semakan semula parity kembali stabil:
    - `plan_backlog_reconcile.py`: `aligned=12`, `content_drift=0`, `id_drift=0`,
    - `verify_backlog_parity.py --modules backlog_all`: `ok=true`.

### Kemas Kini Fasa 2.94 (iterasi semasa)

- Batch keenam belas task #3 (typed table non-core) untuk aliran bas:
  - model baharu: `backend/models_sql/bus_tables.py` (`BusRecord`),
  - migration baharu: `backend/alembic/versions/20260311_22_create_bus_records.py`,
  - adapter `backend/repositories/notifications_relational_store.py` diperluas untuk koleksi `buses` (dengan compatibility mirror ke `core_documents`),
  - bootstrap startup `bootstrap_relational_notification_tables(...)` kini turut seed `bus_records`.
- Verifikasi pasca implementasi:
  - compile/lint fail baharu dan wiring: lulus,
  - smoke matrix penuh (8 suite) lulus,
  - smoke sasaran `buses` (create -> duplicate plate guard -> get/list filter -> update -> guard delete bila trip aktif -> delete) lulus (`BUSES_TYPED_SMOKE_OK`),
  - smoke regresi modul berkaitan `bus`/`payment_center` lulus (`smoke_bus_dashboard_payment_postgres.py --include-write`: `17/17`),
  - audit operator kekal bersih: `total_hits=0`.

### Kemas Kini Fasa 2.95 (iterasi semasa)

- Drift pasca smoke matrix (expected write effect) dan pemulihan:
  - semakan parity mengesan `content_drift` pada `marketplace_settings`, `koperasi_settings`, `settings`, dan `pwa_device_tokens`,
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections marketplace_settings koperasi_settings settings pwa_device_tokens --execute` (`upserted=7`),
  - semakan semula parity kembali stabil:
    - `plan_backlog_reconcile.py`: `aligned=12`, `content_drift=0`, `id_drift=0`,
    - `verify_backlog_parity.py --modules backlog_all`: `ok=true`.

### Kemas Kini Fasa 2.96 (iterasi semasa)

- Batch ketujuh belas task #3 (typed table non-core) untuk aliran live-tracking bas:
  - model baharu: `backend/models_sql/bus_live_location_tables.py` (`BusLiveLocationRecord`),
  - migration baharu: `backend/alembic/versions/20260311_23_create_bus_live_location_records.py`,
  - adapter `backend/repositories/notifications_relational_store.py` diperluas untuk koleksi `bus_live_locations` (dengan compatibility mirror ke `core_documents`),
  - bootstrap startup `bootstrap_relational_notification_tables(...)` kini turut seed `bus_live_location_records`.
- Verifikasi pasca implementasi:
  - compile/lint fail baharu dan wiring: lulus,
  - smoke matrix penuh (8 suite) lulus,
  - smoke sasaran live-tracking (create driver `bus_driver` + assign bas -> `GET /api/bus/driver/trips` -> `POST /api/bus/driver/location` -> `GET /api/bus/live-location/{trip_id}` + `GET /api/bus/trips/{trip_id}/map-info`) lulus (`BUS_LIVE_LOCATION_TYPED_SMOKE_OK`),
  - smoke regresi modul berkaitan `bus`/`payment_center` lulus (`smoke_bus_dashboard_payment_postgres.py --include-write`: `18/18`),
  - audit operator kekal bersih: `total_hits=0`.

### Kemas Kini Fasa 2.97 (iterasi semasa)

- Drift pasca smoke matrix (expected write effect) dan pemulihan:
  - semakan parity mengesan `content_drift` pada `marketplace_settings`, `koperasi_settings`, `settings`, dan `pwa_device_tokens`,
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections marketplace_settings koperasi_settings settings pwa_device_tokens --execute` (`upserted=7`),
  - semakan semula parity kembali stabil:
    - `plan_backlog_reconcile.py`: `aligned=12`, `content_drift=0`, `id_drift=0`,
    - `verify_backlog_parity.py --modules backlog_all`: `ok=true`.

### Kemas Kini Fasa 2.98 (iterasi semasa)

- Hardening susulan modul `bus` untuk UAT + performance ringan endpoint live tracking:
  - skrip `backend/scripts/smoke_bus_dashboard_payment_postgres.py` diperkukuh untuk liputan `bus_driver` + live map end-to-end (create data sementara `company -> bus -> route -> trip` + create `bus_driver` + assign bas + login + update location),
  - tambah validasi role guard (`parent` kekal `403` pada `GET /api/bus/driver/trips`),
  - tambah assertion payload untuk:
    - `GET /api/bus/live-location/{trip_id}`,
    - `GET /api/bus/trips/{trip_id}/map-info`,
  - tambah semakan latency endpoint berat dengan budget `4000ms`:
    - `GET /api/bus/driver/trips`,
    - `GET /api/bus/live-location/{trip_id}`,
    - `GET /api/bus/trips/{trip_id}/map-info`,
  - tambah cleanup best-effort artefak ujian (`trip/route/bus/company/user`) supaya smoke kekal idempotent.
- Verifikasi pasca hardening:
  - `py_compile` skrip smoke: lulus,
  - smoke regresi `bus`/`dashboard`/`payment_center` dengan write path: `smoke_bus_dashboard_payment_postgres.py --include-write` lulus (`SUMMARY total=36 passed=36 failed=0`).

### Kemas Kini Fasa 2.99 (iterasi semasa)

- Audit + parity selepas hardening `bus`:
  - audit operator Mongo-only kekal bersih: `scripts/audit_mongo_only_usage.py --path routes` menghasilkan `total_hits=0` (report: `backend/logs/mongo_only_operator_audit_20260312.json`),
  - `plan_backlog_reconcile.py` kembali stabil: `aligned=12`, `content_drift=0`, `id_drift=0`,
  - `verify_backlog_parity.py --modules backlog_all`: `ok=true`.

### Kemas Kini Fasa 3.00 (iterasi semasa)

- Hardening susulan modul `infaq` + `analytics` + `system-config` untuk UAT + performance ringan:
  - skrip `backend/scripts/smoke_infaq_analytics_system_config_postgres.py` diperkukuh dengan:
    - role guard tambahan (`parent` kekal `403` untuk endpoint analytics staff-only),
    - assertion bentuk payload (`public infaq stats`, `analytics dashboard`, `analytics module/infaq`, `analytics ai-insights`, `analytics chat`),
    - aliran write idempotent untuk `infaq` (create/reuse kempen smoke -> update -> get detail -> validate guard `min_slots` pada donation -> filter admin donations -> cancel kempen),
    - semakan sync `system-config` untuk role dibenarkan,
    - semakan latency endpoint berat dengan budget `5000ms`:
      - `GET /api/analytics/dashboard`,
      - `POST /api/analytics/ai-insights`,
      - `POST /api/analytics/chat`,
      - `GET /api/infaq/admin/stats`,
      - `GET /api/infaq/admin/donations`.
- Verifikasi pasca hardening:
  - `py_compile` skrip smoke: lulus,
  - smoke read-only lulus: `smoke_infaq_analytics_system_config_postgres.py` (`SUMMARY total=26 passed=26 failed=0`),
  - smoke write-path lulus: `smoke_infaq_analytics_system_config_postgres.py --include-write` (`SUMMARY total=46 passed=46 failed=0`).

### Kemas Kini Fasa 3.01 (iterasi semasa)

- Audit + parity selepas hardening `infaq/analytics/system-config`:
  - audit operator Mongo-only kekal bersih: `scripts/audit_mongo_only_usage.py --path routes` menghasilkan `total_hits=0` (report: `backend/logs/mongo_only_operator_audit_20260312.json`),
  - semakan awal parity mengesan `content_drift` sementara pada `settings` (expected write effect daripada `system-config` save/sync),
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections settings --execute` (`upserted=1`),
  - semakan semula parity kembali stabil:
    - `plan_backlog_reconcile.py`: `aligned=12`, `content_drift=0`, `id_drift=0`,
    - `verify_backlog_parity.py --modules backlog_all`: `ok=true`.

### Kemas Kini Fasa 3.02 (iterasi semasa)

- Hardening susulan modul `marketplace` + `koperasi_commission` + `student_import` untuk UAT + performance ringan:
  - skrip `backend/scripts/smoke_marketplace_koperasi_student_import_postgres.py` diperkukuh dengan:
    - assertion bentuk payload untuk endpoint penting (`marketplace settings/vendors/products/orders/finance/analytics`, `koperasi settings/export`, `student-import stats/claim-codes`),
    - semakan latency endpoint berat dengan budget `6000ms`:
      - `GET /api/marketplace/dashboard/stats`,
      - `GET /api/marketplace/finance/dashboard`,
      - `GET /api/marketplace/finance/ledger?page=1&limit=5`,
      - `GET /api/marketplace/analytics/sales-overview`,
      - `GET /api/koperasi/commission/report/monthly`,
      - `GET /api/student-import/stats`,
    - kekalkan write-check idempotent untuk tetapan `marketplace` dan `koperasi`.
- Verifikasi pasca hardening:
  - `py_compile` skrip smoke: lulus,
  - smoke read-only lulus: `smoke_marketplace_koperasi_student_import_postgres.py` (`SUMMARY total=38 passed=38 failed=0`),
  - smoke write-path lulus: `smoke_marketplace_koperasi_student_import_postgres.py --include-write` (`SUMMARY total=47 passed=47 failed=0`).

### Kemas Kini Fasa 3.03 (iterasi semasa)

- Hardening susulan modul `hostel` + `sickbay` + `warden` + `discipline` + `risk` untuk UAT + performance ringan:
  - skrip `backend/scripts/smoke_hostel_sickbay_warden_discipline_risk_postgres.py` diperkukuh dengan:
    - assertion bentuk payload untuk endpoint kritikal (`hostel stats/empty rooms/leave/presence`, `sickbay stats`, `warden calendar`, `discipline offences/stats`, `risk profiles/summary`),
    - semakan latency endpoint berat dengan budget `6000ms`:
      - `GET /api/hostel/stats`,
      - `GET /api/hostel/presence-report`,
      - `GET /api/sickbay/stats`,
      - `GET /api/warden/calendar?bulan=3&tahun=2026`,
      - `GET /api/discipline/stats`,
      - `GET /api/risk/profiles?limit=20`,
      - `GET /api/risk/summary`,
    - kekalkan write-check validation-style (`422`) untuk endpoint write berisiko tinggi.
- Verifikasi pasca hardening:
  - `py_compile` skrip smoke: lulus,
  - smoke read-only lulus: `smoke_hostel_sickbay_warden_discipline_risk_postgres.py` (`SUMMARY total=49 passed=49 failed=0`),
  - smoke write-path lulus: `smoke_hostel_sickbay_warden_discipline_risk_postgres.py --include-write` (`SUMMARY total=61 passed=61 failed=0`).
- Audit + parity selepas hardening batch ini:
  - audit operator Mongo-only kekal bersih: `scripts/audit_mongo_only_usage.py --path routes` (`total_hits=0`),
  - semakan awal parity mengesan `content_drift` sementara pada `marketplace_settings` dan `koperasi_settings` (expected write effect daripada update tetapan),
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections marketplace_settings koperasi_settings --execute` (`upserted=2`),
  - semakan semula parity kembali stabil:
    - `plan_backlog_reconcile.py`: `aligned=12`, `content_drift=0`, `id_drift=0`,
    - `verify_backlog_parity.py --modules backlog_all`: `ok=true`.

### Kemas Kini Fasa 3.04 (iterasi semasa)

- Hardening susulan modul `inventory` + `accounting_full` untuk UAT + performance ringan:
  - skrip `backend/scripts/smoke_inventory_postgres.py` diperkukuh dengan:
    - assertion bentuk payload (`categories`, `vendors`, `items`, `movements`, `stats`, `item detail`),
    - role guard write tambahan (`POST /api/inventory/seed/muafakat-vendor` kekal `403` untuk `parent`),
    - semakan latency endpoint berat dengan budget `5000ms`:
      - `GET /api/inventory/items`,
      - `GET /api/inventory/movements?limit=20`,
      - `GET /api/inventory/stats`,
      - `GET /api/inventory/categories`.
  - skrip `backend/scripts/smoke_accounting_full_postgres.py` diperkukuh dengan:
    - assertion bentuk payload untuk endpoint kritikal (`transactions`, `reports`, `dashboard`, `summary`, `financial years`, `AGM`, `transaction detail`),
    - role guard write tambahan (`POST /api/accounting-full/categories/seed-defaults` kekal `403` untuk `parent`),
    - semakan latency endpoint berat dengan budget `7000ms`:
      - `GET /api/accounting-full/transactions?page=1&limit=20`,
      - `GET /api/accounting-full/dashboard/stats`,
      - `GET /api/accounting-full/summary`,
      - `GET /api/accounting-full/monthly-trend`,
      - `GET /api/accounting-full/reports/annual?year=...`,
      - `GET /api/accounting-full/reports/balance-sheet`,
      - `GET /api/accounting-full/agm/executive-summary`.
- Verifikasi pasca hardening:
  - `py_compile` kedua-dua skrip smoke: lulus,
  - smoke read-only lulus:
    - `smoke_inventory_postgres.py` (`SUMMARY total=15 passed=15 failed=0`),
    - `smoke_accounting_full_postgres.py` (`SUMMARY total=51 passed=51 failed=0`),
  - smoke write-path lulus:
    - `smoke_inventory_postgres.py --include-write` (`SUMMARY total=21 passed=21 failed=0`),
    - `smoke_accounting_full_postgres.py --include-write` (`SUMMARY total=61 passed=61 failed=0`).

### Kemas Kini Fasa 3.05 (iterasi semasa)

- Audit + parity selepas hardening `inventory/accounting_full`:
  - audit operator Mongo-only kekal bersih: `scripts/audit_mongo_only_usage.py --path routes` (`total_hits=0`; report: `backend/logs/mongo_only_operator_audit_20260312.json`),
  - `plan_backlog_reconcile.py`: `aligned=12`, `content_drift=0`, `id_drift=0`,
  - `verify_backlog_parity.py --modules backlog_all`: `ok=true`,
  - tiada reconcile tambahan diperlukan untuk batch ini.

### Kemas Kini Fasa 3.06 (iterasi semasa)

- Hardening susulan modul `upload` + `pwa` + `chatbox_faq` untuk UAT + performance ringan:
  - skrip `backend/scripts/smoke_upload_pwa_chatbox_postgres.py` diperkukuh dengan:
    - assertion bentuk payload (`/api/pwa/version`, `/api/chatbox/faq/admin`, response write `register-device-token` dan `send-notification`),
    - liputan endpoint missing-file tambahan (`/api/chatbox/faq/files/nonexistent.pdf`),
    - validation guard tambahan (`POST /api/register-device-token` dengan body kosong -> `422`),
    - semakan latency endpoint berat dengan budget `5000ms`:
      - `GET /api/chatbox/faq/admin`,
      - `POST /api/send-notification`,
      - `POST /api/register-device-token`,
      - `GET /api/pwa/version`,
      - `GET /api/upload/images/editor/nonexistent.jpg`.
- Verifikasi pasca hardening:
  - `py_compile` skrip smoke: lulus,
  - smoke read-only lulus: `smoke_upload_pwa_chatbox_postgres.py` (`SUMMARY total=13 passed=13 failed=0`),
  - smoke write-path lulus: `smoke_upload_pwa_chatbox_postgres.py --include-write` (`SUMMARY total=33 passed=33 failed=0`).

### Kemas Kini Fasa 3.07 (iterasi semasa)

- Gating consistency: smoke matrix `include-write` 8 suite dijalankan **3 run berturut-turut**:
  - suite: `yuran`, `inventory`, `accounting_full`, `bus_dashboard_payment`, `hostel_sickbay_warden_discipline_risk`, `marketplace_koperasi_student_import`, `upload_pwa_chatbox`, `infaq_analytics_system_config`,
  - semua run lulus penuh (`RUN_1_DONE`, `RUN_2_DONE`, `RUN_3_DONE`, `MATRIX_3_RUNS_OK`),
  - log setiap run disimpan di `backend/logs/smoke_matrix/run{1..3}_*.log`.
- Ringkasan run #3:
  - `yuran` `24/24`,
  - `inventory` `21/21`,
  - `accounting_full` `61/61`,
  - `bus_dashboard_payment` `36/36`,
  - `hostel_sickbay_warden_discipline_risk` `61/61`,
  - `marketplace_koperasi_student_import` `47/47`,
  - `upload_pwa_chatbox` `33/33`,
  - `infaq_analytics_system_config` `45/45`.
- Audit + parity pasca matrix:
  - audit operator Mongo-only kekal bersih: `total_hits=0`,
  - parity awal mengesan drift expected write-effect pada `marketplace_settings`, `koperasi_settings`, `settings`, `pwa_device_tokens`,
  - resync dilaksana: `scripts/reconcile_core_divergence.py --source postgres --collections marketplace_settings koperasi_settings settings pwa_device_tokens --execute` (`upserted=9`),
  - semakan semula parity kembali stabil:
    - `plan_backlog_reconcile.py`: `aligned=12`, `content_drift=0`, `id_drift=0`,
    - `verify_backlog_parity.py --modules backlog_all`: `ok=true`.

### Kemas Kini Fasa 3.08 (iterasi semasa)

- Automasi gating kestabilan ditambah melalui skrip baharu:
  - `backend/scripts/run_smoke_stability_gate.py`,
  - jalankan matrix `--include-write` 8 suite sebanyak N run berturut-turut,
  - teruskan audit Mongo-only + semakan parity backlog,
  - sokong reconcile automatik `postgres -> mongo` jika drift dikesan (`--auto-reconcile`, default aktif).
- Verifikasi automasi semasa:
  - arahan: `./backend/venv/bin/python backend/scripts/run_smoke_stability_gate.py --runs 3 --auto-reconcile`,
  - artefak ringkasan: `backend/logs/stability_gate_20260312_030326.json`,
  - log suite per run: `backend/logs/stability_gate_20260312_030326/smoke_matrix`,
  - keputusan gate: `matrix_ok=true`, `audit_total_hits=0`, `parity_ok=true`, `drift_collections_after=[]`, `ok=true`.
- Dokumen operasi UAT domain owner ditambah:
  - `docs/POSTGRES_DOMAIN_OWNER_UAT_SIGNOFF.md`,
  - mengandungi tracker sign-off modul berimpak tinggi + template incident window 7 hari tanpa rollback.

### Kemas Kini Fasa 3.09 (iterasi semasa)

- Automasi kemas kini tracker incident window ditambah:
  - skrip baharu `backend/scripts/update_incident_window.py`,
  - fungsi: isi baris `D1..D7` dalam `docs/POSTGRES_DOMAIN_OWNER_UAT_SIGNOFF.md` + sync artefak ke jadual baseline UAT.
- Incident window dimulakan (`D1/7`):
  - baseline gate harian dijalankan:
    - `./backend/venv/bin/python backend/scripts/run_smoke_stability_gate.py --runs 1 --auto-reconcile`,
    - artefak: `backend/logs/stability_gate_20260312_030536.json`,
    - keputusan: `gate.ok=true` (`matrix_ok=true`, `audit_total_hits=0`, `parity_ok=true`).
  - tracker dikemas kini automatik:
    - `./backend/venv/bin/python backend/scripts/update_incident_window.py --day D1 --artifact backend/logs/stability_gate_20260312_030536.json --date 2026-03-12 --critical-incidents 0 --rollback Tidak --notes "Kickoff incident window"`.
- Status gating sunset semasa:
  - syarat smoke matrix 3-run: **tercapai**,
  - syarat incident window: **berjalan (D1 selesai, baki D2-D7)**,
  - syarat sign-off domain owner modul berimpak tinggi: **masih pending**.

### Kemas Kini Fasa 3.10 (iterasi semasa)

- Automasi tambahan untuk tracker sign-off domain owner ditambah:
  - skrip baharu `backend/scripts/update_domain_owner_signoff.py`,
  - fungsi: kemas kini satu baris modul (`accounting`, `yuran`, `marketplace`, `hostel`) dengan `owner`, `environment`, `evidence`, `status`, `date-signoff`, dan `residual-risk`.
- Dokumen sign-off UAT dikemas kini dengan seksyen arahan automasi ringkas:
  - baseline gate harian (`run_smoke_stability_gate.py --runs 1`),
  - kemas kini incident window (`update_incident_window.py`),
  - kemas kini status sign-off domain owner (`update_domain_owner_signoff.py`).
- Tujuan fasa ini:
  - memastikan proses penutupan gating terakhir boleh dilaksana konsisten oleh ops/domain owner tanpa edit manual markdown.

### Kemas Kini Fasa 3.11 (iterasi semasa)

- Laporan readiness sunset bersepadu ditambah melalui skrip baharu:
  - `backend/scripts/generate_cutover_readiness_report.py`,
  - sumber data:
    - artefak gate kestabilan (`backend/logs/stability_gate_*.json`),
    - tracker `domain owner sign-off` + `incident window` dalam `docs/POSTGRES_DOMAIN_OWNER_UAT_SIGNOFF.md`.
- Verifikasi semasa:
  - arahan: `./backend/venv/bin/python backend/scripts/generate_cutover_readiness_report.py --require-matrix-runs 3`,
  - artefak laporan: `backend/logs/cutover_readiness_20260312_033501.json`.
- Snapshot keputusan readiness semasa:
  - `latest_gate_ok=true`,
  - `matrix_consistency_ok=true` (rujuk artefak 3-run),
  - `domain_signoff_ok=false`,
  - `incident_window_ok=false`,
  - `ready_for_sunset=false`.
- Blocking item semasa (automatik dari laporan):
  - sign-off domain owner untuk modul berimpak tinggi masih belum lengkap,
  - incident window 7 hari tanpa rollback masih belum lengkap (`D1/7`).

### Kemas Kini Fasa 3.12 (iterasi semasa)

- Pipeline automasi harian diperkenalkan untuk operasi cutover:
  - skrip baharu `backend/scripts/run_daily_cutover_check.py`,
  - aliran satu arahan:
    - run `run_smoke_stability_gate.py`,
    - (opsyenal) update incident day (`D1..D7`) pada tracker,
    - jana `cutover_readiness_*.json`.
- Verifikasi skrip:
  - arahan semak tanpa kemas kini tracker:  
    `./backend/venv/bin/python backend/scripts/run_daily_cutover_check.py --runs 1 --no-update-incident --require-matrix-runs 3`,
  - hasil semak:
    - gate artefak: `backend/logs/stability_gate_20260312_033622.json` (`ok=true`),
    - readiness artefak: `backend/logs/cutover_readiness_20260312_033633.json` (`ready_for_sunset=false`).
- Kegunaan operasi:
  - mengurangkan langkah manual harian semasa incident window,
  - memastikan evidence gate + readiness konsisten untuk audit cutover.

### Kemas Kini Fasa 3.13 (iterasi semasa)

- Hardening tambahan automasi cutover:
  - `backend/scripts/update_incident_window.py` kini ada validasi lalai:
    - enforce urutan incident day (`D1 -> D2 -> ... -> D7`),
    - enforce tarikh meningkat ketat antara hari incident,
    - semak artefak gate JSON wujud dan `gate.ok=true` sebelum update tracker.
  - `backend/scripts/generate_cutover_readiness_report.py` kini menilai kualiti artefak per hari incident:
    - `artifact_exists`,
    - `artifact_gate_ok`,
    - `artifact_gate_fail_days`,
    - `filled_days_artifact_gate_ok`.
  - `backend/scripts/run_daily_cutover_check.py` kini mem-forward validasi incident updater dan return non-zero jika update incident gagal.
- Verifikasi pasca hardening:
  - compile skrip lulus (`update_incident_window.py`, `generate_cutover_readiness_report.py`, `run_daily_cutover_check.py`),
  - probe validasi urutan tarikh incident: cubaan isi `D2` dengan tarikh sama `D1` kini ditolak dengan mesej  
    `Date 2026-03-12 must be later than previous incident day date 2026-03-12.`,
  - readiness report terkini: `backend/logs/cutover_readiness_20260312_034037.json`,
  - daily pipeline dry-run terkini (tanpa update incident):  
    `backend/logs/stability_gate_20260312_034037.json` + `backend/logs/cutover_readiness_20260312_034049.json`.
- Status readiness kekal:
  - `ready_for_sunset=false` sehingga:
    - semua sign-off domain owner berstatus `Approved`,
    - incident window 7 hari lengkap tanpa rollback.

### Kemas Kini Fasa 3.14 (iterasi semasa)

- Hardening modul `system/settings` diperkukuh (sebelum ini hanya separa melalui `system-config`):
  - skrip baharu `backend/scripts/smoke_system_settings_postgres.py`,
  - liputan endpoint settings yang ditambah:
    - `mydigitalid`, `email/email-status`, `ses`, `smtp`,
    - `pwa`, `landing`, `onboarding`, `portal`,
    - `bus-booking`, `modules`, `upload`, `system-config`,
    - endpoint awam `manifest` + `public settings`.
- Verifikasi skrip baharu:
  - read-only: `SUMMARY total=37 passed=37 failed=0`,
  - include-write: `SUMMARY total=67 passed=67 failed=0`,
  - write path idempotent untuk tetapan utama + role guard/validation check untuk tetapan sensitif.
- Integrasi automasi gate:
  - `backend/scripts/run_smoke_stability_gate.py` kini termasuk suite `system_settings`,
  - matrix kini **9 suite** (sebelum ini 8 suite).
- Verifikasi kestabilan matrix 9 suite:
  - `./backend/venv/bin/python backend/scripts/run_smoke_stability_gate.py --runs 3 --auto-reconcile`,
  - artefak: `backend/logs/stability_gate_20260312_035111.json`,
  - keputusan: `matrix_ok=true`, `audit_total_hits=0`, `parity_ok=true`, `drift_collections_after=[]`, `ok=true`.
- Readiness terkini:
  - artefak: `backend/logs/cutover_readiness_20260312_035212.json`,
  - `ready_for_sunset=false` (blocker kekal: sign-off domain owner + incident window 7 hari belum lengkap).

### Kemas Kini Fasa 3.15 (iterasi semasa)

- Hardening susulan modul `accounting` (legacy) yang sebelum ini masih separa liputan:
  - skrip baharu `backend/scripts/smoke_accounting_legacy_postgres.py`,
  - endpoint diliputi:
    - `GET /api/accounting/summary`,
    - `GET /api/accounting/monthly-trend`,
    - `GET /api/accounting/transactions`,
    - `GET /api/accounting/commission-breakdown`,
    - termasuk role guard (`parent` -> `403`), assertion payload shape, validasi query (`422`), dan semakan latency ringan.
- Verifikasi skrip baharu:
  - read-only: `SUMMARY total=15 passed=15 failed=0`,
  - include-write (extended validation/perf): `SUMMARY total=21 passed=21 failed=0`.
- Integrasi automasi gate:
  - `backend/scripts/run_smoke_stability_gate.py` kini termasuk suite `accounting_legacy`,
  - matrix kini **10 suite**.
- Verifikasi kestabilan matrix 10 suite:
  - arahan: `./backend/venv/bin/python backend/scripts/run_smoke_stability_gate.py --runs 3 --auto-reconcile`,
  - artefak: `backend/logs/stability_gate_20260312_035754.json`,
  - keputusan: `matrix_ok=true`, `audit_total_hits=0`, `parity_ok=true`, `drift_collections_after=[]`, `ok=true`.
- Readiness terkini:
  - artefak: `backend/logs/cutover_readiness_20260312_035852.json`,
  - `ready_for_sunset=false` (blocker kekal: sign-off domain owner + incident window 7 hari belum lengkap).

### Kemas Kini Fasa 3.16 (iterasi semasa)

- Penyeragaman flow `accounting_full` mengikut accounting cycle standard (rujukan ACCA) telah dilaksanakan pada runtime:
  - `backend/services/accounting_journal.py` ditambah upsert journal dan mekanisme `void`,
  - `backend/routes/accounting_full.py` diketatkan agar:
    - transaksi `pending` yang dikemaskini akan sync semula ke jurnal debit/kredit,
    - transaksi `pending` yang dipadam akan menanda jurnal sebagai `void` (audit trail kekal),
    - verify/reject memastikan jurnal wujud dan status jurnal selari dengan status transaksi,
    - `lock period` ditolak jika masih ada transaksi `pending`,
    - sebelum `lock period`, semua transaksi `verified` dalam tempoh disemak/sync ke jurnal.
- Dokumen flow rasmi baharu ditambah:
  - `docs/ACCA_ACCOUNTING_PROCESS_FLOW.md` (mapping langkah proses + flowchart + control gates).
- Smoke regression `accounting_full` diperkukuh dengan semakan workflow ACCA end-to-end:
  - `backend/scripts/smoke_accounting_full_postgres.py` kini tambah semakan create -> journal -> update -> re-check journal -> delete -> journal `void`.
- Automasi harian diperkemas untuk operasi environment berbilang port:
  - `backend/scripts/run_smoke_stability_gate.py` tambah opsyen `--base-url`,
  - `backend/scripts/run_daily_cutover_check.py` tambah forwarding `--base-url`.
- Verifikasi semasa (backend pada `http://127.0.0.1:8001`):
  - `smoke_accounting_full_postgres.py --include-write`: `SUMMARY total=71 passed=71 failed=0`,
  - `smoke_accounting_legacy_postgres.py --include-write`: `SUMMARY total=21 passed=21 failed=0`,
  - `run_smoke_stability_gate.py --runs 1 --base-url ... --auto-reconcile`:
    - artefak `backend/logs/stability_gate_20260312_041056.json`,
    - keputusan `matrix_ok=true`, `audit_total_hits=0`, `parity_ok=true`, `ok=true`,
  - `run_daily_cutover_check.py --runs 1 --base-url ... --no-update-incident`:
    - artefak `backend/logs/stability_gate_20260312_041140.json`,
    - readiness `backend/logs/cutover_readiness_20260312_041152.json`.

### Kemas Kini Fasa 3.17 (iterasi semasa)

- Cadangan flow `bank statement auto-reconciliation` untuk pengguna tanpa latar accounting telah dimuktamadkan:
  - dokumen baharu: `docs/BANK_STATEMENT_AUTO_RECONCILIATION_FLOW.md`,
  - merangkumi flow wizard hujung-ke-hujung: pilih akaun/tempoh -> upload statement -> auto-match -> review exception -> remark -> submit/approve.
- Fokus kebolehgunaan untuk peranan operasi:
  - `sub_bendahari`, `bendahari`, `admin` boleh lakukan operasi harian reconcile secara fleksibel,
  - `juruaudit` kekal read-only untuk semakan pematuhan.
- Kawalan penting dimasukkan dalam cadangan:
  - remark wajib untuk tindakan manual/override,
  - maker-checker (pembuat tidak approve batch sendiri),
  - confidence-based matching + status warna (hijau/kuning/merah),
  - finalize hanya apabila `difference = 0.00`.
- Dokumen ACCA turut dipautkan kepada flow mesra pengguna:
  - `docs/ACCA_ACCOUNTING_PROCESS_FLOW.md` kini rujuk flow bank reconciliation untuk onboarding pengguna bukan accounting.

### Kemas Kini Fasa 3.18 (iterasi semasa)

- Implementasi backend MVP untuk `bank statement auto-reconciliation` telah siap:
  - route baharu: `backend/routes/bank_reconciliation.py`,
  - server wiring baharu di `backend/server.py`,
  - support upload statement `CSV/PDF`, parse line item, auto-match, manual match/unmatch/exception, remark, submit, approve/reject.
- Implementasi frontend wizard mesra pengguna turut siap:
  - halaman baharu `frontend/src/pages/admin/accounting/BankReconciliationPage.js`,
  - route UI baharu `/admin/accounting/bank-reconciliation`,
  - integrasi menu di dashboard perakaunan (`AccountingDashboard`) untuk flow non-accounting langkah demi langkah.
- Kawalan proses dan fleksibiliti pengguna telah dikuatkuasakan:
  - role operasi: `admin`, `bendahari`, `sub_bendahari`,
  - role semakan: `juruaudit` (read-only),
  - maker-checker: pengguna yang submit tidak boleh approve statement sendiri,
  - remark disokong pada item (remark biasa + action manual + adjustment remark),
  - line adjustment disediakan untuk kes data statement perlu dilaras.
- Ketahanan parser:
  - `CSV` parser generik (header synonym + debit/credit/amount),
  - `PDF` parser asas berasaskan text extraction (`pypdf`).
- Dependencies:
  - `backend/requirements.txt` tambah `pypdf`.
- Automation/regression:
  - skrip baharu `backend/scripts/smoke_bank_reconciliation_postgres.py`,
  - `backend/scripts/run_smoke_stability_gate.py` kini tambah suite `bank_reconciliation` (matrix kini **11 suite**).
- Verifikasi semasa (backend `http://127.0.0.1:8010`):
  - `smoke_bank_reconciliation_postgres.py --include-write`: `SUMMARY total=24 passed=24 failed=0`,
  - `run_smoke_stability_gate.py --runs 1 --base-url ... --auto-reconcile`:
    - artefak `backend/logs/stability_gate_20260312_072931.json`,
    - keputusan `matrix_ok=true`, `audit_total_hits=0`, `parity_ok=true`, `ok=true`,
  - `run_daily_cutover_check.py --runs 1 --base-url ... --no-update-incident`:
    - artefak `backend/logs/stability_gate_20260312_073011.json`,
    - readiness `backend/logs/cutover_readiness_20260312_073027.json`.

### Kemas Kini Fasa 3.19 (iterasi semasa)

- Penambahbaikan usability untuk `bank_reconciliation` telah ditambah (fokus pengguna non-accounting):
  - onboarding helper panel dalam wizard langkah 1-6,
  - preset `CSV profile mapping` boleh cipta/kemaskini terus dari UI,
  - bulk action review untuk proses item secara pukal,
  - statement list kini boleh ditapis mengikut akaun bank untuk operasi multi-akaun (2, 3 atau lebih),
  - ringkasan kad per akaun bank (in-progress/ready/approved/unresolved/difference alert) untuk prioriti tindakan cepat.
- Backend API baharu untuk menyokong fleksibiliti operasi:
  - `GET /api/accounting-full/bank-reconciliation/profiles`,
  - `POST /api/accounting-full/bank-reconciliation/profiles`,
  - `PUT /api/accounting-full/bank-reconciliation/profiles/{profile_id}`,
  - `POST /api/accounting-full/bank-reconciliation/{statement_id}/bulk-action`.
- Endpoint upload kini menyokong `parser_profile_id` (optional) untuk memaksa mapping CSV berdasarkan preset profile.
- Regression/smoke suite dikemaskini:
  - `backend/scripts/smoke_bank_reconciliation_postgres.py` kini menguji create/update CSV profile + bulk action flow + senario secondary bank account.
- Verifikasi semasa (backend `http://127.0.0.1:8000`):
  - `smoke_bank_reconciliation_postgres.py --include-write`: `SUMMARY total=38 passed=38 failed=0`.
  - `frontend npm run build`: berjaya (`Compiled with warnings` sedia ada projek).

### Kemas Kini Fasa 3.20 (iterasi semasa)

- Susunan navigasi peranan `admin`, `bendahari`, `sub_bendahari` telah disusun semula ikut keutamaan operasi kewangan/perakaunan:
  - `Reconcile Bank` diletakkan pada kedudukan prioriti,
  - laluan checklist bendahari ditambah terus dalam menu (`/admin/manual-bendahari#checklist-priority`),
  - urutan menu dikemas semula supaya operasi harian didahulukan berbanding analitik.
- `BankReconciliationPage` ditambah komponen mesra pengguna untuk pengguna non-accounting:
  - `Queue Prioriti Kerja` (review, difference alert, ready for approval, unresolved),
  - `Checklist SOP Reconciliation` dengan status done/warning/pending,
  - `Pengesan Perkara Pelik/Ralat` untuk amaran awal ketidakselarasan flow accounting,
  - `Manual Match Picker` (dropdown calon transaksi + fallback input ID manual),
  - butang `Cadang Terbaik` dengan rule konservatif untuk auto-select calon paling selamat,
  - auto-fill/template remark untuk tindakan manual dan bulk action,
  - sticky action bar mudah alih untuk navigasi cepat langkah review/summary/submit.
- `AccountingDashboard` ditambah panel:
  - `Checklist Prioriti Bendahari/Sub Bendahari`,
  - `Pengesan Perkara Pelik / Ralat Accounting`,
  - susunan `Menu Perakaunan` dikemaskini dengan urutan langkah berprioriti.

### Kemas Kini Fasa 3.21 (iterasi semasa)

- `BankReconciliationPage` kini ada toggle `Mode Ringkas Harian` vs `Mode Lanjutan`:
  - default mode ringkas disimpan di local storage untuk konsistensi UX operator harian,
  - mode ringkas fokus kepada 3 tindakan utama: `Review -> Match -> Submit`.
- Panel tindakan harian ringkas ditambah:
  - paparan progres `x/3 tindakan selesai`,
  - butang cepat untuk lompat ke step berkaitan dan auto-filter item `needs_review`.
- Ribbon langkah wizard kini adaptif:
  - mode ringkas paparkan 3 step kritikal (`Step 4/5/6`) untuk kurangkan beban kognitif,
  - mode lanjutan kekal paparkan 6 step penuh.
- Step `Auto-Match` disederhanakan untuk pengguna non-accounting:
  - dalam mode ringkas, parameter tolerance lanjutan disorok dan sistem guna setting konservatif sedia ada,
  - mode lanjutan kekal membenarkan pelarasan penuh parameter.
- Pengesan anomali ditambah rule baharu:
  - amaran `Kemungkinan akaun bank / period tidak tepat` dipaparkan apabila kadar matched terlalu rendah selepas proses review bermula.

### Kemas Kini Fasa 3.22 (iterasi semasa)

- `Quick Action Selesai Hari Ini` ditambah pada panel `Senarai Statement`:
  - toggle untuk paparan statement kritikal harian sahaja,
  - butang `Fokus Statement Kritikal` untuk lompat terus ke statement paling perlu tindakan.
- `Guard submit pintar` ditambah pada `Step 6`:
  - butang submit kini memaparkan sebab lock secara jelas (status, unresolved, difference),
  - approve/reject juga memaparkan sebab kenapa tindakan belum dibenarkan jika status belum `ready_for_approval`.
- `Template SOP Ikut Peranan` dipaparkan terus dalam wizard:
  - SOP berbeza mengikut role (`admin`, `bendahari`, `sub_bendahari`, `juruaudit`) untuk mengurangkan kekeliruan operator non-accounting.

### Kemas Kini Fasa 3.23 (iterasi semasa)

- `bank_reconciliation` backend ditambah endpoint AI assist:
  - `GET /api/accounting-full/bank-reconciliation/{statement_id}/ai-assist`,
  - enjin `AI Smart Reconcile v1` (ML-style scoring + risk model) mengeluarkan `recommended_config`, `readiness_score`, `risk_flags`, dan unjuran automasi.
- `BankReconciliationPage` diintegrasi dengan panel AI:
  - butang `Guna Konfigurasi AI`,
  - butang `Jalankan Auto-Match AI`,
  - paparan risk flags untuk bantu bendahari membuat keputusan yang lebih selamat.
- `AGM Executive Summary` ditambah metadata profesional + quality gate:
  - backend mengeluarkan `professional_header`, `quality_status`, dan `quality_checks`,
  - frontend `AGMReportsPage` memaparkan panel kawalan kualiti dan menahan eksport/cetak jika status kritikal.
- Eksport AGM (`PDF/Excel/Word`) dikemas kini dengan metadata standard:
  - rujukan laporan, organisasi, serta nota basis penyediaan untuk gaya laporan accounting yang lebih profesional.

### Kemas Kini Fasa 3.24 (iterasi semasa)

- `BankReconciliationPage` ditambah `AI auto-priority queue harian`:
  - scoring berasaskan status + unresolved + difference + parser warning + due period,
  - auto-sort statement paling kritikal di atas,
  - toggle `AI Prioriti`, `Kritikal Sahaja`, dan paparan ringkas statistik prioriti.
- Kad `Preview Statement` kini memaparkan:
  - prioriti semasa (`Kritikal/Tinggi/Sederhana/Rendah`) + skor,
  - due label (`Overdue` / `Due X hari`) + cadangan tindakan AI.

### Kemas Kini Fasa 3.25 (iterasi semasa)

- `BankReconciliationPage` ditambah **Kad Tindakan Seterusnya**:
  - memaparkan langkah semasa paling penting + blocker utama,
  - menyediakan CTA terus ke step relevan (`Upload`, `Auto-Match`, `Review`, `Submit/Approve`).
- Label status UI dikemas ke **BM penuh + tooltip penerangan**:
  - mengurangkan kekeliruan operator non-accounting,
  - memudahkan pemahaman status semasa tanpa buka rujukan tambahan.
- Modul **Bulk Action** dinaik taraf ke wizard:
  - `Langkah 1`: pilih aksi + remark,
  - `Langkah 2`: preview impak (`selected`, `unresolved`, `skip estimate`),
  - `Langkah 3`: sahkan sebelum execute.

### Kemas Kini Fasa 3.26 (iterasi semasa)

- Backend `bank_reconciliation` ditambah **auto-notification peranan** untuk risiko operasi:
  - trigger automatik selepas event kritikal (`upload`, `auto-match`, `bulk/manual action`, `adjust`, `submit`, `reject`),
  - notifikasi dihantar ke role `admin`, `bendahari`, `sub_bendahari` bila statement jadi `Kritikal` atau `Overdue`.
- Logik notifikasi diselaras dengan **priority scoring** yang sama seperti UI:
  - kira skor berdasarkan status, unresolved, difference, parser warnings, dan due period,
  - notifikasi hanya dihantar jika level `critical` atau `period_end` telah overdue.
- Mekanisme anti-spam ditambah:
  - setiap statement simpan `risk_notification_state` (signature/trigger/last_sent_at),
  - dedupe + cooldown (`BANK_RECON_ALERT_COOLDOWN_MINUTES`, default 240 minit) mengelakkan notifikasi berulang yang sama.

### Kemas Kini Fasa 3.27 (iterasi semasa)

- `NotificationCenter` (komponen bell di header desktop/mobile) ditambah microcopy BM khusus untuk notifikasi `bank_reconciliation_alert`:
  - tajuk alert disederhanakan (`Amaran Kritikal Rekonsiliasi Bank` / `Amaran Overdue Rekonsiliasi`),
  - ringkasan tindakan padat dipaparkan (`Status`, `Unresolved`, `Difference`, `Parser warning`),
  - CTA distandardkan kepada `Buka Rekonsiliasi Bank`.
- Badge konteks ditambah dalam bell dropdown:
  - badge domain `Rekonsiliasi Bank`,
  - badge risiko `Kritikal` atau `Overdue` untuk fokus tindakan segera admin/bendahari/sub-bendahari.

### Kemas Kini Fasa 3.28 (iterasi semasa)

- Backend `bank_reconciliation` kini jana kandungan notifikasi ikut role penerima:
  - `admin`: fokus pemantauan dan eskalasi,
  - `bendahari`: fokus semakan checker + keputusan akhir,
  - `sub_bendahari`: fokus semakan item unresolved/remark sebelum submit.
- Metadata notifikasi ditambah untuk personalization UI:
  - `recipient_role`, `recipient_role_label`, `role_guidance`.
- `NotificationCenter` menggunakan metadata ini untuk paparan BM yang lebih tepat:
  - mesej utama ikut peranan,
  - badge konteks `Untuk <Peranan>` dalam dropdown bell.

### Kemas Kini Fasa 3.29 (iterasi semasa)

- `NotificationCenter` ditambah **tone warna ikut peranan** untuk notifikasi `bank_reconciliation_alert`:
  - `admin` = tone pemantauan,
  - `bendahari` = tone semakan/keputusan,
  - `sub_bendahari` = tone tindakan operasi.
- Guard visual risiko ditambah pada tone:
  - apabila metadata risiko `critical` atau `days_to_due < 0`, tone bertukar ke warna amaran (`Kritikal/Overdue`) walaupun role berbeza.
- Microcopy dipisahkan lebih jelas:
  - mesej utama kekal ringkas,
  - `role_guidance` dipaparkan sebagai panel `Panduan peranan` berwarna untuk tindakan segera yang lebih terarah.

### Kemas Kini Fasa 3.30 (iterasi semasa)

- Stability gate matrix 11-suite (`include-write`) telah diulang **3 run berturut-turut** menggunakan virtualenv backend:
  - arahan: `backend/venv/bin/python backend/scripts/run_smoke_stability_gate.py --runs 3 --auto-reconcile`,
  - artefak: `backend/logs/stability_gate_20260312_123702.json`,
  - hasil gate: `matrix_ok=true`, `audit_total_hits=0`, `parity_ok=true`, `gate.ok=true`.
- Laporan readiness semasa dijana semula:
  - arahan: `backend/venv/bin/python backend/scripts/generate_cutover_readiness_report.py --require-matrix-runs 3`,
  - artefak: `backend/logs/cutover_readiness_20260312_124116.json`,
  - status: belum ready untuk sunset kerana `domain_owner_signoff` masih `Pending` dan incident window baru lengkap `D1`.

### Kemas Kini Fasa 3.31 (iterasi semasa)

- Hardening modul `yuran` untuk kurangkan mixed-path semasa cutover:
  - flow `POST /api/yuran/assign` dan `POST /api/yuran/bayar/{student_yuran_id}` kini guna `core_db` bagi panggilan AR journal (`post_ar_invoice`, `post_ar_payment`) tanpa bergantung pada `mongo_db = get_db()`.
- Verifikasi regresi selepas perubahan:
  - `python3 -m py_compile backend/routes/yuran.py` lulus,
  - `backend/venv/bin/python backend/scripts/smoke_yuran_postgres.py --include-write` -> `SUMMARY total=24 passed=24 failed=0`.
- Semakan gate selepas hardening:
  - `backend/venv/bin/python backend/scripts/run_smoke_stability_gate.py --runs 1 --auto-reconcile`,
  - artefak: `backend/logs/stability_gate_20260312_125000.json`,
  - ringkasan: `matrix_ok=true`, `audit_total_hits=0`, `parity_ok=true`, `gate.ok=true`.

### Kemas Kini Fasa 3.32 (iterasi semasa)

- Tracker `Domain Owner UAT Sign-Off` telah dikemas kini kepada status operasi semasa:
  - modul `accounting/accounting_full`, `yuran`, `marketplace/koperasi/student_import`, `hostel/sickbay/warden/discipline/risk` kini berstatus `In Progress` pada environment `staging-postgres`,
  - evidence baseline dan residual risk telah diisi untuk setiap modul bagi memudahkan semakan domain owner.
- Laporan readiness dijana semula selepas kemas kini tracker:
  - arahan: `backend/venv/bin/python backend/scripts/generate_cutover_readiness_report.py --require-matrix-runs 3`,
  - artefak: `backend/logs/cutover_readiness_20260312_130713.json`,
  - ringkasan: `latest_gate_ok=true`, `matrix_consistency_ok=true`, tetapi `domain_signoff_ok=false` (belum `Approved`) dan `incident_window_ok=false` (D2-D7 belum lengkap).

### Kemas Kini Fasa 3.33 (iterasi semasa)

- Hardening automasi gate pada `backend/scripts/run_smoke_stability_gate.py`:
  - skrip kini auto-pilih interpreter virtualenv backend (`backend/venv/bin/python`) untuk semua sub-skrip smoke/audit/parity/reconcile,
  - pembolehubah env `BACKEND_PYTHON` disokong sebagai override eksplisit bila perlu.
- Pembaikan tambahan pada resolver interpreter:
  - path virtualenv dikekalkan tanpa `.resolve()` untuk elak hilang konteks venv (isu symlink Python 3.14).
- Verifikasi pasca-hardening:
  - arahan: `python3 backend/scripts/run_smoke_stability_gate.py --runs 1 --auto-reconcile`,
  - artefak: `backend/logs/stability_gate_20260312_131427.json`,
  - hasil: `python_executable=backend/venv/bin/python`, `matrix_ok=true`, `audit_total_hits=0`, `parity_ok=true`, `gate.ok=true`.
- Readiness report terkini selepas verifikasi:
  - artefak: `backend/logs/cutover_readiness_20260312_131514.json`,
  - status global kekal: belum ready sunset kerana sign-off domain owner belum `Approved` dan incident window D2-D7 belum lengkap.

### Kemas Kini Fasa 3.34 (iterasi semasa)

- Automasi incident window diperkukuh dengan mod `dry-run`:
  - `backend/scripts/update_incident_window.py` kini menyokong `--dry-run` untuk validate urutan hari/tarikh/artefak tanpa menulis markdown,
  - `backend/scripts/run_daily_cutover_check.py` kini menyokong `--dry-run` dan akan pass-through mod ini ke updater incident.
- Preflight D2 berjaya disahkan tanpa ubah tracker:
  - arahan: `python3 backend/scripts/run_daily_cutover_check.py --runs 1 --day auto --date 2026-03-13 --critical-incidents 0 --rollback Tidak --notes "Preflight D2" --dry-run`,
  - output: day sasaran `D2` tervalidasi (`incident_update.executed=true`, `dry_run=true`, `exit_code=0`),
  - gate artefak: `backend/logs/stability_gate_20260312_133115.json` (`gate.ok=true`),
  - readiness artefak: `backend/logs/cutover_readiness_20260312_133133.json`.
- Runbook UAT dikemas kini untuk tambah contoh arahan pra-semak (`--dry-run`) bagi incident update dan pipeline harian one-command.

### Kemas Kini Fasa 3.35 (iterasi semasa)

- Aliran bayaran parent diseragamkan kepada **troli berpusat** (single checkout gate):
  - aliran sumbangan (`tabung/sedekah/infaq`) kini `add-to-cart` dahulu sebelum checkout,
  - aliran tiket bas parent kini juga `add-to-cart` dahulu sebelum checkout.
- Indikator troli global di header telah diperkukuh untuk operasi harian:
  - dipaparkan pada semua halaman `DashboardLayout`,
  - tunjuk pecahan kategori (`YR`, `KP`, `BS`, `SB`, `MP`) + jumlah item.
- Hard-deprecate route/page legacy untuk elak bypass:
  - `/sedekah`, `/infaq`, `/donate/:campaignId` (logged-in) diseragamkan ke `/tabung`,
  - fail legacy parent/module (`TabungPage`, `SedekahPage`, `InfaqPage`) kini komponen redirect minimum ke canonical flow.
- Hardening backend `payment_center` untuk item `bus`:
  - `POST /api/payment-center/cart/add` kini validasi `drop_off_point` ikut route + kira harga ikut lokasi turun,
  - dedupe item bas dibuat ikut kombinasi `trip + student + drop_off_point` (elak duplicate troli tidak sah),
  - semasa `POST /api/payment-center/checkout`, flow bas kini semak semula ownership pelajar, status trip, seat availability, duplicate booking aktif, dan syarat `pulang bermalam` jika diwajibkan oleh settings.
- Kesan cutover:
  - kawalan accounting/resit lebih konsisten kerana semua payment final melalui `checkout` pusat,
  - jejak audit dan rekonsiliasi lebih mudah kerana pintu transaksi dikurangkan kepada satu flow canonical.
- Verifikasi pasca-implementasi:
  - `backend/venv/bin/python -m py_compile backend/routes/payment_center.py` lulus,
  - `npm run build` frontend lulus (amaran ESLint sedia ada projek kekal).

## 2) Modul Mengikut Tahap Kematangan Migrasi

### A. Sudah guna jalur relational adapter (`get_relational_core_db`)

- `accounting_full`
- `tabung`
- `dashboard`
- `fees`
- `payments`
- `reports`
- `ar`
- `payment_center` (typed collection untuk reminder+troli+resit+tempahan/jadual bas checkout: `payment_reminders` + `payment_reminder_preferences` + `payment_center_cart` + `payment_receipts` + `bus_bookings` + `bus_trips`)
- `financial_dashboard`
- `pwa`
- `chatbox_faq`
- `notifications` (typed domain: `notifications` + `announcements` + `push_subscriptions` + `push_logs` + `email_logs` + `email_templates` + `payment_reminders` + `payment_reminder_preferences` + `payment_center_cart` + `payment_receipts` + `bus_bookings` + `bus_trips` + `bus_routes` + `bus_companies` + `buses` + `bus_live_locations` melalui adapter pada `_runtime_db()` + `get_relational_core_db()`)
- `email_templates`

### B. Pada jalur `get_core_db` tetapi masih perlu hardening/regresi

- `agm` (Fasa 2.0: sudah guna `get_core_db`, perlu regression/UAT modul penuh)
- `complaints` (Fasa 2.0: sudah guna `get_core_db`, perlu hardening pipeline analytics tertentu)
- `discipline` (Fasa 1.4 + 2.14: sudah guna `get_core_db`, smoke regression automation tersedia; masih perlu parity dataset produksi/UAT)
- `risk` (Fasa 1.5 + 2.14: sudah guna `get_core_db`, smoke regression automation tersedia; masih perlu parity dataset produksi/UAT)
- `warden` (Fasa 1.4 + 2.14: sudah guna `get_core_db`, smoke regression automation tersedia; masih perlu parity dataset produksi/UAT)
- `hostel_blocks` (Fasa 2.0: sudah guna `get_core_db`, perlu regression/UAT)
- `inventory` (Fasa 2.0 + 2.10: sudah guna `get_core_db`, smoke regression automation tersedia; masih perlu parity dataset produksi/UAT)
- `categories` (Fasa 2.0: sudah guna `get_core_db`, perlu regression/UAT)
- `accounting` (legacy; Fasa 2.0 + 2.10: endpoint utama diselaputi smoke regression `accounting-full`, masih perlu hardening laporan agregat dataset sebenar)
- `bank_accounts` (Fasa 2.0 + 2.8: sudah guna `get_core_db`, hardening fallback tahun kewangan selesai; masih perlu regression flow penutupan tahun kewangan)
- `agm_reports` (Fasa 2.0 + 2.8: fallback/auto-seed tahun kewangan telah dikeraskan; masih perlu regression dataset sebenar)
- `yuran` (Fasa 2.0 + 3.31: arg utama sudah `get_core_db`, hardening AR posting kepada `core_db` telah siap; baki fokus pada UAT dataset sebenar + hardening endpoint legacy yang belum melalui sign-off domain owner)
- `upload` (Fasa 1.5 + 2.16: sudah guna `get_core_db`, smoke regression automation tersedia; masih perlu parity dataset produksi/UAT)
- `koperasi_commission` (Fasa 1.2 + 2.13: sudah guna `get_core_db`, smoke regression automation tersedia; masih perlu parity dataset produksi/UAT)
- `marketplace` (Fasa 1 + 2.13 + 2.30 + 2.32: sudah guna `get_core_db`, smoke regression automation tersedia; hotspot `.aggregate` dan `ObjectId` utama telah dikurangkan, baki utama ialah UAT dataset sebenar + hardening endpoint berat tertentu)
- `student_import` (Fasa 1.2 + 2.13: sudah guna `get_core_db`, smoke regression automation tersedia; masih perlu hardening semantik data + UAT aliran import sebenar)
- `hostel` (Fasa 1.3 + 2.14: sudah guna `get_core_db`, smoke regression automation tersedia; isu runtime `hostel/blocks` diselesaikan)
- `sickbay` (Fasa 1.3 + 2.14: sudah guna `get_core_db`, smoke regression automation tersedia; masih perlu parity dataset produksi/UAT)

### C. Endpoint yang masih guna `db` global secara langsung

- tiada lagi wiring `init_router(get_db, ...)` untuk modul API utama yang disenaraikan
- batch `rbac config`, `student management`, `admin sync`, `admin class/report flows`, `audit/notifications`, `vehicles/settings-auth`, serta `helper/scheduler/dashboard/AI` sudah dipindahkan ke `_runtime_db()` (Fasa 2.1-2.6)
- tiada lagi akses runtime `await db.*` dalam `server.py` (disahkan audit Fasa 2.6)
- baki rujukan `db.` ialah import dan komen/docstring sahaja (bukan akses runtime koleksi)
- hardening tambahan Fasa 2.7 menutup 2 isu runtime `accounting_full` yang dikesan semasa smoke automatik
- hardening Fasa 2.8 menutup jurang runtime `financial-years/current` dan report AGM semasa dataset `financial_years` kosong
- hardening Fasa 2.9-2.10 menambah skrip smoke automation `yuran`, `inventory`, dan `accounting-full` untuk regresi berulang pasca cutover
- modul backlog di luar batch Fasa 2.0 yang belum dinormalkan penuh ke resolver runtime

## 3) Baki Task Kritikal (Belum Selesai)

1. **Modul migration backlog**
   - Refactor modul kumpulan B/C ke repository/adapter relational (atau pastikan operasi yang digunakan serasi 100% dengan `CoreCollection`).

2. **Elak ketergantungan operator Mongo-only**
   - Audit semua penggunaan `aggregate`, `ObjectId`, dan operator pipeline lanjutan (`$lookup`, `$unwind`, dll) dalam modul backlog.
   - Ganti dengan query relational/aggregation Python atau SQL yang setara.
   - Status semasa: audit berterusan dengan automasi report; modul utama backlog (termasuk `marketplace`, `bus`, `hostel`, `payment_center`, `accounting_full`, `accounting`, `analytics`, `inventory`, `koperasi`, `bank_accounts`, `discipline`, `complaints`, `agm`, `agm_reports`, `ar`, `students`, `student_import`, `admin_sync`, `users`, `upload`, `warden`, `categories`, `notifications`, `hostel_blocks`, `email_templates`, `sickbay`, `infaq`, `pwa`, `risk`, `escalation`, `chatbox_faq`, `auth`) telah dinormalkan kepada helper ID terpusat dan **tiada lagi `aggregate_call` atau `object_id_constructor` dalam `backend/routes/*`** (`total_hits=0`), serta backlog parity kekal selari untuk koleksi audit semasa.

3. **Skema typed table untuk modul non-core**
   - Wujudkan jadual typed baharu mengikut domain (jika tidak sesuai kekal di `core_documents`).
   - Tambah migration Alembic + seed/bootstrap yang jelas.
   - Status semasa: tujuh belas batch siap untuk modul `pwa`, `chatbox_faq`, dan domain `notifications` (`pwa_device_token_records` + Alembic `20260311_07`; `chatbox_faq_records` + Alembic `20260311_08`; `notification_records` + Alembic `20260311_09`; `announcement_records` + Alembic `20260311_10`; `push_subscription_records` + Alembic `20260311_11`; `push_log_records` + Alembic `20260311_12`; `email_log_records` + Alembic `20260311_13`; `email_template_records` + Alembic `20260311_14`; `payment_reminder_records` + `payment_reminder_preference_records` + Alembic `20260311_15`; `payment_center_cart_records` + Alembic `20260311_16`; `payment_receipt_records` + Alembic `20260311_17`; `bus_booking_records` + Alembic `20260311_18`; `bus_trip_records` + Alembic `20260311_19`; `bus_route_records` + Alembic `20260311_20`; `bus_company_records` + Alembic `20260311_21`; `bus_records` + Alembic `20260311_22`; `bus_live_location_records` + Alembic `20260311_23`) termasuk bootstrap + adapter runtime.

4. **Data cutover dan parity modul backlog**
   - ETL per modul.
   - Laporan parity per modul (count, amount, snapshot checks) sebelum cutover.
   - Status semasa: rangka parity per-modul telah disediakan melalui `verify_backlog_parity.py` (boleh dijalankan ikut batch modul) dan laporan `backlog_all` semasa menunjukkan `ok=true` untuk set modul backlog audit ini.

5. **Kemas mod transisi selepas stabil**
   - Tetapkan tarikh sunset untuk `DB_ENGINE=hybrid` dan `DB_ENGINE=mongo`.
   - Buang fallback dan code path Mongo secara berperingkat selepas acceptance.
   - Cadangan tarikh operasi (boleh diselaraskan oleh domain owner/ops):
     - `2026-03-18`: freeze penggunaan `DB_ENGINE=hybrid` pada environment production-like (postgres-only sebagai default wajib),
     - `2026-03-25`: sunset `DB_ENGINE=mongo` + mula nyahaktif code path fallback Mongo untuk modul backlog yang telah lulus UAT.
   - Gating sebelum execute sunset:
     - parity `backlog_all` kekal `ok=true`,
    - smoke `include-write` kekal lulus sekurang-kurangnya 3 run berturut-turut (**status semasa: tercapai melalui matrix 8 suite pada Fasa 3.07, disahkan semula pada matrix 9 suite termasuk `system_settings` pada Fasa 3.14, matrix 10 suite termasuk `accounting_legacy` pada Fasa 3.15, dan matrix 11 suite termasuk `bank_reconciliation` kini juga lulus 3 run berturut-turut pada Fasa 3.30**),
     - UAT domain owner selesai untuk modul berimpak tinggi (`accounting`, `yuran`, `marketplace`, `hostel`),
     - incident window 7 hari tanpa rollback ke mode `hybrid/mongo`.
   - Rujukan eksekusi:
     - automasi gate: `backend/scripts/run_smoke_stability_gate.py`,
     - tracker UAT + incident window: `docs/POSTGRES_DOMAIN_OWNER_UAT_SIGNOFF.md`.

6. **Kualiti dan UAT**
   - E2E regression untuk semua modul backlog dalam mode postgres-only.
   - Smoke test + performance check pada endpoint berat.
   - Status semasa: smoke regression utama backlog yang terkesan reconcile telah diulang dan semua lulus; hardening UAT/performance ringan meliputi:
     - `bus` live-map + driver dashboard (`smoke_bus_dashboard_payment_postgres.py --include-write`: `36/36`, budget `4000ms`),
     - `infaq/analytics/system-config` (`smoke_infaq_analytics_system_config_postgres.py --include-write`: `46/46`, budget `5000ms`),
     - `marketplace/koperasi/student-import` (`smoke_marketplace_koperasi_student_import_postgres.py --include-write`: `47/47`, budget `6000ms`),
     - `hostel/sickbay/warden/discipline/risk` (`smoke_hostel_sickbay_warden_discipline_risk_postgres.py --include-write`: `61/61`, budget `6000ms`),
     - `inventory` (`smoke_inventory_postgres.py --include-write`: `21/21`, budget `5000ms`),
     - `accounting` legacy (`smoke_accounting_legacy_postgres.py --include-write`: `21/21`, budget `7000ms`),
    - `accounting_full` (`smoke_accounting_full_postgres.py --include-write`: `71/71`, budget `7000ms`, termasuk semakan workflow ACCA: journal sync + void),
     - `bank_reconciliation` (`smoke_bank_reconciliation_postgres.py --include-write`: `24/24`, flow upload statement + auto-match + remark + submit/approve),
     - `system/settings` (`smoke_system_settings_postgres.py --include-write`: `67/67`, budget `6000ms`),
     - `upload/pwa/chatbox_faq` (`smoke_upload_pwa_chatbox_postgres.py --include-write`: `33/33`, budget `5000ms`);
     smoke matrix 8 suite `include-write` telah lulus 3 run berturut-turut (Fasa 3.07), matrix 9 suite (termasuk `system_settings`) juga lulus 3 run berturut-turut (Fasa 3.14), matrix 10 suite (termasuk `accounting_legacy`) lulus 3 run berturut-turut (Fasa 3.15), dan matrix 11 suite (termasuk `bank_reconciliation`) kini lulus 3 run berturut-turut (Fasa 3.30).
     Templat sign-off domain owner + tracker incident window kini disediakan di `docs/POSTGRES_DOMAIN_OWNER_UAT_SIGNOFF.md`.
     E2E/performance penuh masih diperlukan untuk penutupan akhir.

7. **Backfill tenant context + strict mode gating (multi-tenant)**
   - Objektif: melengkapkan migrasi `tenant_id`/`tenant_code` untuk rekod legacy sebelum aktifkan enforcement tenant lebih ketat.
   - Skrip baharu disediakan: `backend/scripts/backfill_tenant_context.py` (dry-run default, execute optional, report JSON optional).
   - Hardening backend telah ditambah:
     - servis bersama `backend/services/tenant_enforcement.py` untuk `tenant_scope`, doc-access guard, stamping, dan strict-mode toggle,
     - strict check kini aktif pada auth context (`server.py` + `routes/auth.py`) apabila strict mode dihidupkan,
     - endpoint readiness baharu: `GET /api/tenants/enforcement/status` (SuperAdmin) untuk semak `missing_tenant_total` sebelum lock strict mode.
   - Toggle strict mode:
     - transitional (default): `TENANT_ENFORCEMENT_MODE=transitional`,
     - strict: `TENANT_ENFORCEMENT_MODE=strict` (atau override boolean `TENANT_STRICT_MODE=true`).
     - nota operasi semasa: `backend/run_server.sh` dan `start-clean.sh` kini default ke `TENANT_ENFORCEMENT_MODE=strict` (boleh override jika perlu).
   - Cadangan aliran operasi:
     - audit awal (dry-run):
       - `cd backend && ./venv/bin/python scripts/backfill_tenant_context.py --report-json ../docs/reports/tenant-backfill-dryrun.json`
     - audit penuh rekod unresolved (ID capture):
       - `cd backend && ./venv/bin/python scripts/backfill_tenant_context.py --capture-unresolved --unresolved-capture-limit 50000 --report-json ../docs/reports/tenant-backfill-unresolved.json`
    - backfill sebenar (execute):
      - `cd backend && ./venv/bin/python scripts/backfill_tenant_context.py --execute --default-tenant-id tenant_legacy_main --default-tenant-code mrsm-main --assign-unresolved-to-default --report-json ../docs/reports/tenant-backfill-execute-final.json`
     - untuk env legacy tanpa master tenant, boleh guna fallback:
       - `--default-tenant-id <tenant_id> --default-tenant-code <tenant_code>`
       - jika perlu paksa rekod unresolved ke tenant fallback: tambah `--assign-unresolved-to-default`
     - keselamatan execute mode:
       - jika fallback tenant belum wujud dalam `tenants`, skrip akan block execute secara default,
       - override hanya jika benar-benar perlu: `--allow-nonexistent-default-tenant`.
   - Gating sebelum strict mode:
     - `unresolved=0` untuk koleksi kritikal (`users`, `students`, `student_yuran`, `payments`, `yuran_payments`, `accounting_transactions`, `notifications`),
     - `GET /api/tenants/enforcement/status?include_counts=true` menunjukkan `ready_for_strict_mode=true`,
     - simpan report JSON sebagai bukti audit cutover.
   - Bukti eksekusi semasa:
     - tenant master bootstrap dibuat: `tenant_id=tenant_legacy_main`, `tenant_code=mrsm-main`,
     - execute backfill berjaya: `docs/reports/tenant-backfill-execute.json` (`updates_applied=4046`, `unresolved=0`),
     - backfill `tenant_user_memberships` daripada rekod `users` dilaksana (`membership_created=32`),
    - hardening lanjutan `backfill_tenant_context.py`: default koleksi diperluas + generic resolver + `postgres_all_collections=True` supaya koleksi modular turut diliputi,
    - execute lanjutan berjaya: `docs/reports/tenant-backfill-execute-extended.json` (`updates_applied=489`, `unresolved=0`),
    - execute akhir stabil: `docs/reports/tenant-backfill-execute-final.json` (`updates_applied=2`, `unresolved=0`) selepas patch write-path,
    - verifikasi pasca-execute terkini: `docs/reports/tenant-backfill-postexecute-final-dryrun.json` (`unresolved=0`, `updates_planned=2` pada koleksi bus relational yang belum expose tenant field sebagai kolum khusus; tidak termasuk set audit strict-gating),
    - endpoint readiness strict tenant telah hijau semasa runtime: `GET /api/tenants/enforcement/status?include_counts=true` -> `ready_for_strict_mode=true`, `missing_tenant_total=0`,
    - pembetulan skema runtime untuk `student_yuran_records` telah diaplikasi (kolum `billing_pack_enabled`, `billing_pack_mode`, `billing_packs`, `charge_context`) supaya endpoint `yuran` tidak lagi `500`,
    - smoke role-based pasca strict-mode lulus:
      - `smoke_accounting_full_postgres.py --include-write` -> `SUMMARY total=71 passed=71 failed=0`,
      - `smoke_yuran_postgres.py --include-write` -> `SUMMARY total=23 passed=23 failed=0`,
      - `smoke_bus_dashboard_payment_postgres.py --include-write` -> `SUMMARY total=34 passed=34 failed=0`.

## 4) Definition of Done (Migration 100% Complete)

Anggap migrasi selesai sepenuhnya hanya jika semua syarat di bawah dipenuhi:

- Tiada endpoint runtime bergantung pada MongoDB untuk read/write.
- Tiada operasi business-critical bergantung pada operator Mongo-specific yang tidak disokong penuh.
- Semua modul kritikal lulus E2E di mode `DB_ENGINE=postgres`.
- Runbook operasi tidak lagi memerlukan mode `hybrid` untuk operasi normal.
- Script parity/reconcile hanya tinggal sebagai tool audit historikal, bukan keperluan runtime.

## 5) Urutan Pelaksanaan Disyorkan

1. `marketplace` + `koperasi_commission` + `student_import` (kompleksiti data tinggi).
2. `hostel` + `sickbay` + `warden` + `discipline` + `risk` (operasi harian pelajar).
3. `bus` + `infaq` + `analytics` + `system-config` endpoints.
4. `upload` + `pwa` + `chatbox_faq` + modul sokongan lain.
5. Final hardening, matikan `hybrid/mongo`, dan cutover penuh.
