# POSTGRES DOMAIN OWNER UAT SIGN-OFF

Dokumen ini digunakan untuk menutup baki gating sebelum sunset `DB_ENGINE=hybrid` dan `DB_ENGINE=mongo`.

## 1) Skop UAT Berimpak Tinggi

Modul yang wajib sign-off domain owner:

- `accounting` (termasuk aliran `accounting_full`),
- `yuran`,
- `marketplace` (termasuk `koperasi_commission` dan `student_import`),
- `hostel` (termasuk `sickbay`, `warden`, `discipline`, `risk`).

## 2) Prasyarat Sebelum UAT

1. Mode aplikasi pada env ujian ialah `DB_ENGINE=postgres`.
2. Baseline regression terkini lulus dengan artefak rasmi:
   - `./backend/venv/bin/python backend/scripts/run_smoke_stability_gate.py --runs 3 --auto-reconcile`
3. Hasil baseline mesti tunjuk:
   - `gate.matrix_ok=true`,
   - `gate.audit_total_hits=0`,
   - `gate.parity_ok=true`,
   - `gate.drift_collections_after=[]`,
   - `gate.ok=true`.

## 3) Artefak Baseline UAT

Isikan setiap kali baseline baharu dijalankan:

| Tarikh (UTC) | Artifact JSON | Smoke Logs Folder | Gate OK | Catatan |
| --- | --- | --- | --- | --- |
| 2026-03-12 | `backend/logs/stability_gate_20260312_030326.json` | `backend/logs/stability_gate_20260312_030326/smoke_matrix` | `true` | Run automasi 3x matrix + audit/parity/reconcile auto |
| 2026-03-12 | `backend/logs/stability_gate_20260312_030536.json` | `backend/logs/stability_gate_20260312_030536/smoke_matrix` | `true` | Auto-sync dari tracker incident window (D1) |
| 2026-03-12 | `backend/logs/stability_gate_20260312_123702.json` | `backend/logs/stability_gate_20260312_123702/smoke_matrix` | `true` | Re-run matrix 11-suite 3x (include-write) + audit/parity OK |
| 2026-03-12 | `backend/logs/stability_gate_20260312_125000.json` | `backend/logs/stability_gate_20260312_125000/smoke_matrix` | `true` | Post-hardening check (modul yuran) + parity/audit kekal OK |
| 2026-03-12 | `backend/logs/stability_gate_20260312_131427.json` | `backend/logs/stability_gate_20260312_131427/smoke_matrix` | `true` | Gate script hardening validation (run via `python3`, auto-resolve ke backend venv) |
| 2026-03-12 | `backend/logs/stability_gate_20260312_133115.json` | `backend/logs/stability_gate_20260312_133115/smoke_matrix` | `true` | Preflight pipeline `run_daily_cutover_check --dry-run` (incident D2 tidak ditulis) |
| 2026-03-13 | `backend/logs/stability_gate_20260313_094304.json` | `backend/logs/stability_gate_20260313_094304/smoke_matrix` | `true` | Auto-sync dari tracker incident window (D2) |
|  |  |  |  |  |

## 4) Tracker Sign-Off Domain Owner

| Modul | Domain Owner | Environment | Bukti UAT (ticket/video/log) | Status | Tarikh Sign-Off | Nota Risiko Baki |
| --- | --- | --- | --- | --- | --- | --- |
| accounting/accounting_full |  | staging-postgres | Baseline gate: backend/logs/stability_gate_20260313_094304.json; strict readiness: /api/tenants/enforcement/status ready_for_strict_mode=true; smoke accounting_full=71/71 | In Progress |  | Menunggu UAT domain owner akhir + approval rasmi |
| yuran |  | staging-postgres | Baseline gate: backend/logs/stability_gate_20260313_094304.json; smoke yuran=23/23; flow billing pack schema fixed | In Progress |  | Menunggu UAT pembayaran hujung-ke-hujung + approval rasmi |
| marketplace/koperasi/student_import |  | staging-postgres | Baseline gate: backend/logs/stability_gate_20260313_094304.json; smoke marketplace/koperasi/student_import=47/47 | In Progress |  | Menunggu UAT dataset sebenar + approval rasmi |
| hostel/sickbay/warden/discipline/risk |  | staging-postgres | Baseline gate: backend/logs/stability_gate_20260313_094304.json; smoke hostel/sickbay/warden/discipline/risk=61/61 | In Progress |  | Menunggu UAT operasi harian + approval rasmi |

## 5) Senario Minimum Wajib (Per Modul)

### accounting/accounting_full

- Cipta transaksi debit/kredit dan semak kesan pada `summary`.
- Semak laporan `annual`, `balance-sheet`, dan `agm` untuk tahun semasa.
- Uji role guard endpoint write kritikal.
- Semak data detail transaksi boleh diambil semula tanpa mismatch.

### yuran

- Cipta/kemas kini struktur fee dan assign kepada pelajar.
- Jalankan aliran bayaran (manual atau gateway mock) hingga resit.
- Semak laporan tunggakan/collection konsisten dengan dashboard.
- Uji behavior rollback/cancel pembayaran (jika digunakan domain).

### marketplace/koperasi/student_import

- Vendor/product/order lifecycle (create -> order -> fulfillment ringkas).
- Koperasi commission report + export shape.
- Student import aliran claim-code/statistik.
- Semak endpoint analytics berat berada dalam julat SLA dalaman.

### hostel/sickbay/warden/discipline/risk

- Hostel occupancy, empty room, leave/presence flow.
- Sickbay intake + status update.
- Warden calendar dan disiplin offence flow.
- Risk profile summary boleh diakses dan tidak regress.

## 5A) Bukti Perubahan Operasi (Troli Berpusat)

Kemas kini operasi rentas modul telah dilaksanakan untuk menutup bypass pembayaran direct dan menyeragamkan checkout melalui `payment_center`.

Perubahan utama:

- Aliran parent `tabung/sedekah/infaq` kini `add-to-cart` dahulu, kemudian checkout di `GET /payment-center?tab=troli`.
- Aliran parent tiket bas kini juga `add-to-cart` dahulu (bukan create booking direct dari page).
- Route legacy diseragamkan ke canonical flow:
  - `/sedekah`, `/infaq`, `/donate/:campaignId` (logged-in) -> `/tabung`.
- Page legacy (`TabungPage`, `SedekahPage`, `InfaqPage`) telah di-hard-deprecate kepada komponen redirect minimum.
- Backend `payment_center` untuk item `bus` telah dikeraskan:
  - validasi `drop_off_point` ikut route,
  - dedupe item troli ikut kombinasi `trip + student + drop_off_point`,
  - semakan checkout tambahan (ownership pelajar, status trip, seat availability, duplicate booking, syarat pulang bermalam jika diwajibkan).

Bukti implementasi (fail):

- `frontend/src/components/cart/CartDrawer.js`
- `frontend/src/App.js`
- `frontend/src/pages/parent/tabung/TabungPageNew.js`
- `frontend/src/pages/modules/BusTicketPage.js`
- `backend/routes/payment_center.py`
- `docs/ACCA_ACCOUNTING_PROCESS_FLOW.md` (Seksyen 8: Unified Central Cart)
- `docs/POSTGRES_FINAL_CUTOVER_CHECKLIST.md` (Kemas Kini Fasa 3.35)

Checklist UAT tambahan (cross-module):

1. Tambah item dari `yuran` + `tabung` + `bus` ke troli yang sama.
2. Semak indikator troli header memaparkan kiraan kategori (`YR/KP/BS/SB/MP`) dengan betul.
3. Laksanakan checkout sekali di `payment_center` dan semak:
   - resit dijana,
   - posting accounting tercatat,
   - item troli dibersihkan selepas pembayaran berjaya.
4. Uji route legacy (`/sedekah`, `/infaq`, `/donate/:campaignId`) untuk pastikan redirect ke `/tabung` bagi user login.

## 6) Incident Window 7 Hari (Tanpa Rollback)

Isi harian selepas sign-off domain owner bermula.

| Hari | Tarikh | Baseline Gate Artifact | Insiden Kritikal | Rollback ke Hybrid/Mongo | Catatan |
| --- | --- | --- | --- | --- | --- |
| D1 | 2026-03-12 | `backend/logs/stability_gate_20260312_123702.json` | 0 | Tidak | Kickoff incident window (refresh gate matrix 11-suite 3x) |
| D2 | 2026-03-13 | `backend/logs/stability_gate_20260313_094304.json` | 0 | Tidak | Daily cutover check (strict tenant + role-based smoke pass) |
| D3 |  |  | 0 | Tidak |  |
| D4 |  |  | 0 | Tidak |  |
| D5 |  |  | 0 | Tidak |  |
| D6 |  |  | 0 | Tidak |  |
| D7 |  |  | 0 | Tidak |  |

## 7) Kriteria Lulus Untuk Sunset

Semua syarat berikut mesti dipenuhi serentak:

1. Semua baris pada tracker sign-off domain owner berstatus `Approved`.
2. Incident window 7 hari lengkap tanpa rollback.
3. Baseline gate terkini menunjukkan `gate.ok=true`.
4. Tiada isu Severity-1/Severity-2 terbuka berkaitan migrasi data.

## 8) Arahan Automasi Ringkas

Jalankan baseline gate harian:

- `./backend/venv/bin/python backend/scripts/run_smoke_stability_gate.py --runs 1 --auto-reconcile`

Kemas kini tracker incident window (contoh D2):

- `./backend/venv/bin/python backend/scripts/update_incident_window.py --day D2 --artifact backend/logs/stability_gate_YYYYMMDD_HHMMSS.json --date 2026-03-13 --critical-incidents 0 --rollback Tidak --notes "Daily check"`
- Pra-semak tanpa tulis dokumen (`dry-run`):
  - `./backend/venv/bin/python backend/scripts/update_incident_window.py --day D2 --artifact backend/logs/stability_gate_YYYYMMDD_HHMMSS.json --date 2026-03-13 --critical-incidents 0 --rollback Tidak --notes "Preflight D2" --dry-run`
- Default skrip akan:
  - semak urutan hari (`D1` mesti lengkap sebelum `D2`, dan seterusnya),
  - semak tarikh incident meningkat secara ketat antara hari (D2 > D1, D3 > D2, ...),
  - semak artefak gate wujud dan `gate.ok=true` sebelum baris incident dikemas kini.

Kemas kini status sign-off domain owner (contoh):

- `./backend/venv/bin/python backend/scripts/update_domain_owner_signoff.py --module accounting --owner "Nama Owner" --environment "staging-postgres" --evidence "JIRA-123, test video" --status "In Progress" --residual-risk "Tiada isu kritikal"`

Jana laporan readiness sunset terkini:

- `./backend/venv/bin/python backend/scripts/generate_cutover_readiness_report.py --require-matrix-runs 3`

Jalankan pipeline harian one-command (gate + update incident + readiness):

- `./backend/venv/bin/python backend/scripts/run_daily_cutover_check.py --runs 1 --day auto --date YYYY-MM-DD --critical-incidents 0 --rollback Tidak --notes "Daily cutover check"`
- Pra-semak one-command tanpa tulis tracker incident:
  - `./backend/venv/bin/python backend/scripts/run_daily_cutover_check.py --runs 1 --day auto --date YYYY-MM-DD --critical-incidents 0 --rollback Tidak --notes "Preflight cutover check" --dry-run`
