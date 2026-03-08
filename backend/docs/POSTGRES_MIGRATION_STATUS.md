# PostgreSQL Migration Status

## Current Stack (Verified)

- Backend framework: FastAPI (`backend/server.py`)
- Frontend framework: React (`frontend/package.json`)
- Current runtime database in existing code: MongoDB (`motor` + `pymongo`)

## Gap To PostgreSQL

- The backend still reads/writes MongoDB collections directly in routes and `server.py`.
- There is no SQLAlchemy/Alembic/PostgreSQL config in the original backend setup.
- Existing ID and query patterns are MongoDB-oriented (`ObjectId`, `$set`, `$push`, `$regex`, `aggregate`).

## Migration Direction Implemented In This Phase

- Add PostgreSQL foundation (`db` config/engine + SQL models + repository).
- Introduce a core data adapter for phased migration of:
  - `auth`
  - `users`
  - `students`
  - `payments`
  - `reports` (read-path now uses relational yuran adapter for `set_yuran`/`student_yuran`/`yuran_payments`)
  - `dashboard` (read-path now uses relational yuran adapter for `set_yuran`/`student_yuran`/`yuran_payments`)
  - `ar` (read/query path now uses relational yuran adapter for `set_yuran`/`student_yuran`/`yuran_payments`)
  - `financial_dashboard` (wired to relational core adapter; yuran read-path no longer depends on Mongo `aggregate` pipeline)
  - `accounting_full` (now uses relational core adapter for accounting collections in `core_documents`)
  - `tabung`:
    - `tabung_campaigns` + `tabung_donations` now backed by typed relational tables (`tabung_campaign_records`, `tabung_donation_records`) with compatibility mirror to `core_documents`,
    - reporting endpoints rewritten without Mongo `aggregate`.
  - `financial_ledger` (now routed through relational core adapter / PostgreSQL `core_documents` for migrated module write-paths)
  - `payment_center` (accounting side-effects + yuran updates now flow through relational core adapter)
  - `yuran`:
    - `students`, `users`, `notifications`, `settings` via core adapter,
    - `set_yuran`, `student_yuran`, and `yuran_payments` now backed by typed relational tables (`set_yuran_records`, `student_yuran_records`, `yuran_payment_records`) with compatibility mirror to `core_documents`,
    - accounting side-effects now use relational core adapter; excess-payment donation side-effects now flow to `tabung_donations` via relational path.
  - `notifications`
  - `audit_logs`
  - `password_reset_tokens`
- PostgreSQL-only runtime kini disokong untuk semua koleksi melalui `CoreStore` (`core_documents`) apabila `DB_ENGINE=postgres`.

## Cutover Strategy

- `DB_ENGINE=mongo`: full legacy mode.
- `DB_ENGINE=hybrid`: core modules use PostgreSQL, with MongoDB still available for non-core modules.
- `DB_ENGINE=postgres`: PostgreSQL-only mode (all runtime collections routed to PostgreSQL).

## Latest Verification

- ETL + parity updated to include `set_yuran` and `yuran_payments`.
- Authenticated E2E flow verified:
  - create `set_yuran` via API,
  - assign fee to student,
  - parent payment (`/api/yuran/anak-saya/{yuran_id}/pay`) creates `yuran_payments`.
- Verification query showed new rows present in PostgreSQL `core_documents` for:
  - `collection_name='set_yuran'`
  - `collection_name='yuran_payments'`
- Same test rows were absent in MongoDB for these collections (confirming PostgreSQL write path in current runtime mode).
- Relational phase smoke test passed:
  - `adapt_yuran_read_db()` read/write for `set_yuran`, `student_yuran`, and `yuran_payments`,
  - direct SQL check confirmed inserts landed in `set_yuran_records`, `student_yuran_records`, and `yuran_payment_records`.
- Startup bootstrap (`bootstrap_relational_yuran_tables`) now seeds relational yuran tables from `core_documents` when typed tables are empty.
- `server.py` now routes `ar`/`reports`/`dashboard` through `get_relational_core_db()` so read-heavy endpoints consume typed relational tables for yuran data.
- `financial_dashboard` now also routes through `get_relational_core_db()`, and aggregate-based endpoints were rewritten to query + Python aggregation (including `summary`, `donation-trends`, `income-expense-breakdown`, `campaign-performance`, `tunggakan-summary`, `export/pdf` stats path).
- Accounting core collections added to PostgreSQL adapter (`accounting_categories`, `accounting_transactions`, `accounting_audit_logs`, `accounting_period_locks`, `accounting_journal_entries`, `accounting_journal_lines`) and ETL/parity defaults updated.
- Tabung typed relational tables added (`tabung_campaign_records`, `tabung_donation_records`), and startup bootstrap `bootstrap_relational_tabung_tables` now seeds from `core_documents` when typed tables are empty.
- `server.py` now routes `accounting_full`, `tabung`, and `payment_center` through `get_relational_core_db()` where adapter composition (`adapt_yuran_read_db` + `adapt_tabung_read_db`) keeps migrated yuran/tabung flows on typed relational tables while preserving compatibility mirrors to `core_documents`.
- `yuran` accounting sync calls now target relational core DB (`core_db`) instead of Mongo-only DB for `accounting_transactions`/`accounting_audit_logs`.
- `yuran` excess-payment donation path now writes to `tabung_donations` on relational core DB (legacy `mongo_db.donations` write removed).
- `financial_ledger` added to `CoreStore.CORE_COLLECTIONS`; migrated modules (`tabung`, `payment_center` when routed via relational core) now persist ledger writes to PostgreSQL-backed core storage.
- Tabung reporting compatibility hardened for PostgreSQL/core adapter by replacing `aggregate` pipelines in `/api/tabung/stats`, `/api/tabung/reports/real-time`, and `/api/tabung/public/stats` with in-memory aggregation logic.
- Reconciliation helper script added for transition parity cleanup on runtime-diverging collections (`notifications`, `audit_logs`): `backend/scripts/reconcile_core_divergence.py` (supports dry-run, direction selection, execute, and optional prune-target).
- `backend/scripts/cutover_core_to_postgres.sh` now supports optional runtime reconciliation flags:
  - `--reconcile-runtime`
  - `--reconcile-runtime-prune`
  - `--log-file <path>`
  - `--no-log-file`
  - default audit log output: `backend/logs/cutover_*.log`
- Root `Makefile` now includes PostgreSQL migration shortcuts:
  - `make pg-help`
  - `make pg-cutover`
  - `make pg-cutover-reconcile`
  - `make pg-cutover-prune`
  - `make pg-parity`
  - `make pg-reconcile*`
- Parent UX quick wins shipped for migration-era usability:
  - parent dashboard now surfaces a dedicated `Baki & Bayar Sekarang` summary card linked to one-click payment flow (`/payment-center?bulk=all-yuran`) when tunggakan exists,
  - notifications UI (`/notifications` and bell dropdown) now renders contextual action buttons (e.g. `Bayar Sekarang`, `Lihat Kempen`) from `action_url/action_label` with safe keyword fallback,
  - new frontend error helper `frontend/src/utils/errorMessages.js` provides clearer, actionable API/network messages used in parent dashboard + notifications flows.
  - parent yuran/payment flows now surface due-date urgency cues (overdue / due soon) and timeline summary for faster prioritisation.
  - payment center now supports one-click `Tambah Semua Yuran` (bulk add outstanding yuran to cart), including deep-link auto-trigger via `?bulk=all-yuran`.
  - payment center sidebar now includes a `Keutamaan Minggu Ini` urgency widget with one-tap add-to-cart actions for overdue / near-deadline yuran.
  - urgency widget now includes one-tap `Ingatkan` flow with reminder scheduler (Google Calendar deep-link + downloadable `.ics` event file).
  - reminder scheduler now also persists reminder schedules to backend (`/api/payment-center/reminders`) with auto-dispatch worker (5-minute scheduler) that sends in-app notification follow-ups when reminder time is due.
  - failed reminder dispatches now support bounded auto-retry (exponential backoff, max attempt guard) before marked failed-muktamad.
  - reminder dispatch now attempts browser push delivery to active `push_subscriptions` (when `WEB_PUSH_VAPID_PUBLIC_KEY` + `WEB_PUSH_VAPID_PRIVATE_KEY` configured) and records delivery logs in `push_logs`.
  - payment center now includes `Reminder Saya` management card (list status reminder + quick cancel) so parents can monitor and manage scheduled reminders in-app.
  - user-level `Reminder Preferences` added (`GET/PUT /api/payment-center/reminder-preferences`) to store default days-before, reminder time, and preferred action source for faster repeat scheduling.
  - payment center sidebar now includes a `Status Push Reminder` card with one-tap route to `/notifications` so parents can quickly activate browser push without leaving payment workflow.
  - push readiness CTA now deep-links to `/notifications?focus=push` with auto-scroll + temporary highlight on push manager for faster activation.
  - after successful push activation from the deep-link flow, UI now auto-returns parent to `/payment-center` with confirmation toast (`push=activated` handoff).
  - yuran detail view now includes `Smart Installment Preset` using backend two-payment policy (`next_payment_amount`) to auto-select a practical partial-payment set.
  - receipt modal now surfaces a post-payment `Langkah Seterusnya` card so users can continue remaining urgent yuran actions without leaving flow.
  - payment center summary sidebar now includes `Bayaran Minimum Selamat` (one-click add all overdue/due-soon yuran) and a `Confidence Checkout` progress bar so users can gauge whether high-risk items are already covered before checkout.
- Notification payloads for key finance flows now carry actionable metadata:
  - `yuran` fee assignment reminder and outstanding reminder notifications now include `category`, payment-focused `action_url` (`/payment-center` or `/payment-center?bulk=all-yuran`), `action_label`, and metadata.
  - `tabung` donation success notifications now include `category=tabung`, `action_url=/tabung`, `action_label`, and metadata.
  - parent notifications endpoint (`/api/yuran/notifications/parent`) now returns `category`, `action_url`, `action_label`, and `metadata` fields.
  - payment center pending payload (`/api/payment-center/pending-items`) now includes `due_date`, `days_to_due`, and `is_overdue` for yuran records.
- Performance hardening added for `financial_dashboard`:
  - one-time index bootstrap for heavy Mongo-backed collections (`tabung_donations`, `accounting_transactions`, `tabung_campaigns`),
  - short TTL in-memory response cache for repeated dashboard reads,
  - persistent materialized cache table in PostgreSQL: `financial_dashboard_cache_records` (cross-restart cache),
  - bounded fetch size with env knobs: `FINANCIAL_DASHBOARD_CACHE_TTL_SECONDS`, `FINANCIAL_DASHBOARD_MAX_FETCH_DOCS`, `FINANCIAL_DASHBOARD_PERSISTENT_CACHE_ENABLED`,
  - scope-aware cache invalidation wired on write-paths that affect financial read models (`tabung`, `payment_center`, `yuran`, `accounting_full`), targeting only impacted endpoint groups (`donation`, `campaign`, `accounting`, `yuran`) to reduce invalidation overhead while avoiding stale reads,
  - lightweight invalidation telemetry (per-scope hit counters + rolling window + periodic log summary) with admin visibility endpoints: `GET /api/financial-dashboard/cache/invalidation-metrics` (JSON) and `GET /api/financial-dashboard/cache/invalidation-metrics/prometheus` (Prometheus text exposition).
  - operational scrape example (Bearer token + `prometheus.yml`) documented in `RUN.md` section 7, including token auto-refresh helper script: `backend/scripts/refresh_prometheus_token.sh`, production `systemd` templates under `backend/deploy/systemd/`, one-command installer script `backend/deploy/systemd/install_mrsm_prometheus_token_timer.sh`, rollback script `backend/deploy/systemd/uninstall_mrsm_prometheus_token_timer.sh`, health-check script `backend/deploy/systemd/check_mrsm_prometheus_token_timer.sh`, quick-status script `backend/deploy/systemd/status_mrsm_prometheus_token_timer.sh`, doctor script `backend/deploy/systemd/doctor_mrsm_prometheus_token_timer.sh`, audit-report script `backend/deploy/systemd/report_mrsm_prometheus_token_timer.sh`, latest-report viewer `backend/deploy/systemd/open_latest_mrsm_prometheus_report.sh`, reconciliation helper `backend/scripts/reconcile_core_divergence.py`, and root-level `Makefile` shortcuts (`make prom-*`, termasuk audit agregat `make prom-all`).
- Note: parity script (`verify_core_parity.py`) is intended for ETL/cutover checkpoints. In `DB_ENGINE=postgres`, MongoDB and PostgreSQL will naturally diverge over time because new core writes happen on PostgreSQL.

## Cleanup Utility (E2E Artifacts)

- Script: `backend/scripts/cleanup_e2e_migration_data.py`
- Safe default is dry-run (no deletion), then rerun with `--execute`.
- Targeted cleanup example:
  - `./venv/bin/python scripts/cleanup_e2e_migration_data.py --set-id <set_id> --yuran-id <yuran_id> --receipt-number <receipt> --marker <exact_marker>`
- Batch cleanup by marker prefix + date window:
  - `./venv/bin/python scripts/cleanup_e2e_migration_data.py --marker-prefix PG-MIG-SET- --from-datetime 2026-03-01T00:00:00+00:00 --to-datetime 2026-03-31T23:59:59+00:00`
  - Add `--execute` to apply deletion.

