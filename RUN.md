# Cara Jalankan Projek MRSMKU Portal

## 1. PostgreSQL (wajib)
```bash
brew services start postgresql@18
```

## 2. Satu command – backend + frontend
```bash
./start.sh
```
Backend akan berjalan di latar belakang, frontend di http://localhost:3000. Apabila anda hentikan (Ctrl+C), backend juga akan berhenti.

---

## Alternatif: jalankan backend dan frontend berasingan

## 2a. Backend (API)
```bash
cd backend
./run_server.sh
```
Atau manual:
```bash
cd backend
./venv/bin/uvicorn server:app --reload --host 0.0.0.0 --port 8000
```
Jika keluar **Address already in use**, guna port 8001:
```bash
./venv/bin/uvicorn server:app --reload --host 0.0.0.0 --port 8001
```
Kalau guna 8001, ubah `frontend/.env` kepada `REACT_APP_BACKEND_URL=http://localhost:8001`.

## 2b. Frontend (React)
Buka terminal baharu:
```bash
cd frontend
npm start
```

## 2c. Start bersih (auto clean port + aktifkan DB + start app)

Jika anda mahu workflow lebih ketat (elak proses bertindih pada port app), guna skrip baru di root projek:

```bash
cd <PROJECT_ROOT>
./start-clean.sh
```

Fungsi `start-clean.sh`:
- hentikan proses pada port app (`8000`, `8001`, `3000`) sebelum start semula,
- pastikan PostgreSQL (`5432`) aktif (MongoDB hanya untuk mode `hybrid`/`mongo`),
- jalankan backend **single-process** (tanpa `--reload`) di `8000`,
- jalankan frontend di `3000`.

Opsyen penting:

```bash
./start-clean.sh --dry-run
./start-clean.sh --backend-only
./start-clean.sh --db-engine postgres
```

Semakan pantas status port/endpoint:

```bash
./check-ports.sh
./check-ports.sh --backend-only
```

Shortcut `make`:

```bash
make app-check-ports
make app-check-ports-backend
make app-start-clean
make app-start-clean-dry-run
make app-start-clean-backend
```

## 3. Log masuk
- URL: http://localhost:3000
- **Super Admin:** superadmin@muafakat.link / super123
- **Sample Layout (rujukan UI):** Selepas log masuk sebagai Super Admin, pilih **Sample Layout** dalam sidebar atau buka http://localhost:3000/sample-layout

## 4. Restart backend (bila server hang atau mahu muat semula)
Dalam folder **backend**:
```bash
cd backend
./restart_server.sh
```
Skrip ini akan hentikan proses yang guna port 8000 atau 8001, kemudian start semula server. Jika fail belum boleh dijalankan: `chmod +x restart_server.sh`.

**Manual restart:** Cari PID proses pada port 8000 (contoh: `lsof -ti :8000`), kemudian `kill <PID>`, dan jalankan semula `./run_server.sh`.

## 5. Jika "Tidak dapat menghubungi pelayan"
- Pastikan backend berjalan: dalam terminal lain jalankan `cd backend && ./run_server.sh`.
- Jika server pernah hang, gunakan **restart**: `cd backend && ./restart_server.sh`.
- Pastikan mesej ralat menunjukkan URL yang betul (contoh: http://localhost:8000). Jika backend guna port 8001, set `REACT_APP_BACKEND_URL=http://localhost:8001` dalam `frontend/.env` lalu **restart frontend** (`npm start`).
- Refresh halaman login selepas backend berjalan.

---

## 6. Mod Database

### 6a. Jalankan ETL dan parity check
```bash
cd backend
./scripts/cutover_core_to_postgres.sh
```

Dengan runtime reconcile (PostgreSQL -> Mongo) untuk koleksi migration yang sering diverge:
```bash
cd backend
./scripts/cutover_core_to_postgres.sh --reconcile-runtime
```

Jika mahu strict parity (extra docs di target akan dipadam):
```bash
cd backend
./scripts/cutover_core_to_postgres.sh --reconcile-runtime-prune
```

Secara default, output cutover disimpan ke `backend/logs/cutover_*.log`.

Jika tidak mahu tulis log fail:
```bash
cd backend
./scripts/cutover_core_to_postgres.sh --no-log-file
```

Jika mahu path log khusus:
```bash
cd backend
./scripts/cutover_core_to_postgres.sh --log-file logs/cutover_manual.log
```

### 6b. Mod default: `postgres` (disyorkan)
```bash
cd backend
DB_ENGINE=postgres ./run_server.sh
```
Dalam mod ini, semua koleksi runtime menggunakan PostgreSQL melalui `core_documents`/jadual relational.

### 6c. Mod `hybrid` (opsyenal semasa transisi tertentu)
```bash
cd backend
DB_ENGINE=hybrid ./run_server.sh
```
Dalam mod ini, sebahagian aliran masih boleh fallback ke MongoDB.

### 6d. Reconcile divergence runtime untuk `notifications` dan `audit_logs` (opsyenal legacy)
Gunakan jika anda perlukan semakan/parity sementara antara PostgreSQL core dan Mongo semasa transisi.

Dry-run (tiada perubahan data):
```bash
cd backend
./venv/bin/python scripts/reconcile_core_divergence.py --collections notifications audit_logs
```

Apply sync dari PostgreSQL -> Mongo:
```bash
cd backend
./venv/bin/python scripts/reconcile_core_divergence.py \
  --collections notifications audit_logs \
  --source postgres \
  --execute
```

### 6e. Shortcut `make` (lebih mudah untuk operasi harian)
```bash
make pg-help
make pg-cutover
make pg-cutover-reconcile
make pg-cutover-prune
make pg-parity
```

---

## 7. Monitoring Prometheus (cache invalidation financial dashboard)

Endpoint metrics (Prometheus text exposition):

- `GET /api/financial-dashboard/cache/invalidation-metrics/prometheus`
- Perlu token untuk role: `superadmin`, `admin`, `bendahari`, atau `sub_bendahari`

### 7a. Jana token API untuk Prometheus

```bash
curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@muafakat.link","password":"super123"}' \
| python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])"
```

Simpan token ini ke fail secret (contoh server Linux):

```bash
sudo mkdir -p /etc/prometheus/secrets
sudo sh -c 'echo "<TOKEN_DIJANA>" > /etc/prometheus/secrets/mrsm_token.txt'
sudo chmod 600 /etc/prometheus/secrets/mrsm_token.txt
```

> Nota: token ada tempoh luput (`ACCESS_TOKEN_EXPIRE_MINUTES`). Automasi refresh token disyorkan.

### 7b. Contoh `prometheus.yml`

```yaml
scrape_configs:
  - job_name: "mrsm-financial-dashboard-cache"
    scheme: http
    metrics_path: /api/financial-dashboard/cache/invalidation-metrics/prometheus
    static_configs:
      - targets: ["localhost:8000"]
    authorization:
      type: Bearer
      credentials_file: /etc/prometheus/secrets/mrsm_token.txt
```

Jika backend berjalan pada host lain, tukar `targets` (contoh: `["api.mrsmku.local:8000"]`).

### 7c. Uji endpoint metrics secara manual

```bash
TOKEN="<TOKEN_DIJANA>"
curl -s http://localhost:8000/api/financial-dashboard/cache/invalidation-metrics/prometheus \
  -H "Authorization: Bearer ${TOKEN}"
```

### 7d. Contoh query PromQL

```promql
sum(rate(financial_dashboard_cache_invalidation_hits_total[5m])) by (scope)
```

```promql
increase(financial_dashboard_cache_invalidation_persistent_entries_removed_total[1h])
```

### 7e. Automasi refresh token (disyorkan)

Skrip tersedia di:

- `backend/scripts/refresh_prometheus_token.sh`

Contoh fail env selamat (`chmod 600`):

```bash
sudo sh -c 'cat > /etc/prometheus/secrets/mrsm-token.env <<EOF
BACKEND_BASE_URL=http://localhost:8000
PROM_EMAIL=superadmin@muafakat.link
PROM_PASSWORD=super123
TOKEN_FILE=/etc/prometheus/secrets/mrsm_token.txt
EOF'
sudo chmod 600 /etc/prometheus/secrets/mrsm-token.env
```

Jalankan refresh manual:

```bash
PROM_TOKEN_ENV_FILE=/etc/prometheus/secrets/mrsm-token.env \
  <PROJECT_ROOT>/backend/scripts/refresh_prometheus_token.sh
```

Contoh `cron` (refresh setiap 30 minit):

```bash
*/30 * * * * PROM_TOKEN_ENV_FILE=/etc/prometheus/secrets/mrsm-token.env <PROJECT_ROOT>/backend/scripts/refresh_prometheus_token.sh >/var/log/mrsm-prom-token.log 2>&1
```

`<PROJECT_ROOT>` = folder root projek `yuranmrsmV2` pada server anda.

### 7f. systemd service + timer (production disyorkan)

Template unit fail disediakan dalam repo:

- `backend/deploy/systemd/mrsm-prometheus-token-refresh.service`
- `backend/deploy/systemd/mrsm-prometheus-token-refresh.timer`
- `backend/deploy/systemd/mrsm-token.env.example`

Langkah pemasangan di server Linux:

```bash
# 1) Sediakan env fail sebenar
sudo cp <PROJECT_ROOT>/backend/deploy/systemd/mrsm-token.env.example /etc/prometheus/secrets/mrsm-token.env
sudo chmod 600 /etc/prometheus/secrets/mrsm-token.env

# 2) Pasang unit files
sudo cp <PROJECT_ROOT>/backend/deploy/systemd/mrsm-prometheus-token-refresh.service /etc/systemd/system/
sudo cp <PROJECT_ROOT>/backend/deploy/systemd/mrsm-prometheus-token-refresh.timer /etc/systemd/system/

# 3) Ganti placeholder path project dalam service file
sudo sed -i 's|<PROJECT_ROOT>|/opt/yuranmrsmV2|g' /etc/systemd/system/mrsm-prometheus-token-refresh.service

# 4) Reload dan aktifkan timer
sudo systemctl daemon-reload
sudo systemctl enable --now mrsm-prometheus-token-refresh.timer
```

Ujian dan semakan:

```bash
# Trigger sekali untuk uji
sudo systemctl start mrsm-prometheus-token-refresh.service

# Lihat status timer
sudo systemctl status mrsm-prometheus-token-refresh.timer --no-pager

# Lihat log refresh token
sudo journalctl -u mrsm-prometheus-token-refresh.service -n 50 --no-pager
```

### 7g. Installer satu command (auto-install `systemd`)

Skrip installer:

- `backend/deploy/systemd/install_mrsm_prometheus_token_timer.sh`

Contoh penggunaan (disyorkan):

```bash
sudo <PROJECT_ROOT>/backend/deploy/systemd/install_mrsm_prometheus_token_timer.sh \
  --project-root <PROJECT_ROOT> \
  --prom-email superadmin@muafakat.link \
  --prom-password 'gantikan-kata-laluan-kuat'
```

Semak dahulu tanpa perubahan:

```bash
<PROJECT_ROOT>/backend/deploy/systemd/install_mrsm_prometheus_token_timer.sh --dry-run
```

Jika anda sudah ada fail env sendiri, installer akan kekalkan fail tersebut dan tidak overwrite.

### 7h. Rollback / uninstall `systemd` setup

Skrip uninstall:

- `backend/deploy/systemd/uninstall_mrsm_prometheus_token_timer.sh`

Uninstall unit sahaja (default, fail secret dikekalkan):

```bash
sudo <PROJECT_ROOT>/backend/deploy/systemd/uninstall_mrsm_prometheus_token_timer.sh
```

Uninstall + padam secret files:

```bash
sudo <PROJECT_ROOT>/backend/deploy/systemd/uninstall_mrsm_prometheus_token_timer.sh --remove-secrets
```

Dry-run:

```bash
<PROJECT_ROOT>/backend/deploy/systemd/uninstall_mrsm_prometheus_token_timer.sh --dry-run
```

### 7i. Health check setup (selepas install)

Skrip health check:

- `backend/deploy/systemd/check_mrsm_prometheus_token_timer.sh`

Semak status asas (unit + token):

```bash
<PROJECT_ROOT>/backend/deploy/systemd/check_mrsm_prometheus_token_timer.sh
```

Semak penuh termasuk ujian scrape endpoint:

```bash
<PROJECT_ROOT>/backend/deploy/systemd/check_mrsm_prometheus_token_timer.sh --scrape-test
```

Contoh semak tanpa systemd (untuk debug lokal):

```bash
<PROJECT_ROOT>/backend/deploy/systemd/check_mrsm_prometheus_token_timer.sh --skip-systemd
```

### 7j. Doctor script (diagnose + auto-fix)

Skrip doctor:

- `backend/deploy/systemd/doctor_mrsm_prometheus_token_timer.sh`

Diagnose sahaja:

```bash
<PROJECT_ROOT>/backend/deploy/systemd/doctor_mrsm_prometheus_token_timer.sh --scrape-test
```

Diagnose + auto-fix (perlukan sudo):

```bash
sudo <PROJECT_ROOT>/backend/deploy/systemd/doctor_mrsm_prometheus_token_timer.sh \
  --auto-fix \
  --prom-email superadmin@muafakat.link \
  --prom-password 'gantikan-kata-laluan-kuat'
```

Simulasi auto-fix tanpa ubah sistem:

```bash
<PROJECT_ROOT>/backend/deploy/systemd/doctor_mrsm_prometheus_token_timer.sh --auto-fix --dry-run
```

### 7k. Makefile shortcuts (pantas)

Dari root projek, gunakan command berikut:

```bash
make prom-install PROM_EMAIL=superadmin@muafakat.link PROM_PASSWORD='gantikan-kata-laluan-kuat'
make prom-install-dry-run
make prom-check
make prom-check-scrape
make prom-status
make prom-status-no-scrape
make prom-all
make prom-all-no-scrape
make prom-report
make prom-report-no-scrape
make prom-report-open-latest
make prom-doctor
make prom-doctor-fix PROM_EMAIL=superadmin@muafakat.link PROM_PASSWORD='gantikan-kata-laluan-kuat'
make prom-uninstall
make prom-uninstall-remove-secrets
```

Jika perlu, override path project:

```bash
make prom-check PROJECT_ROOT=/opt/yuranmrsmV2
```

Simpan report audit ke folder khusus:

```bash
make prom-report REPORT_DIR=/var/log/mrsm/prom-audit
```

---

## 8. Push Notification Sebenar (PWA) untuk Payment Reminder

Reminder kini dihantar sebagai:
- **In-app notification** (sentiasa)
- **Browser push notification** (jika user sudah subscribe + VAPID dikonfigurasi)

### 8a. Jana VAPID key pair

```bash
cd backend
./venv/bin/vapid --gen --json
```

Contoh output:
- `private_key`: simpan sebagai `WEB_PUSH_VAPID_PRIVATE_KEY`
- `applicationServerKey`: simpan sebagai `WEB_PUSH_VAPID_PUBLIC_KEY`

### 8b. Set env sebelum jalankan backend

```bash
cd backend
export WEB_PUSH_VAPID_PUBLIC_KEY="<applicationServerKey>"
export WEB_PUSH_VAPID_PRIVATE_KEY="<private_key>"
export WEB_PUSH_VAPID_SUBJECT="mailto:admin@mrsmku.local"
./run_server.sh
```

### 8c. Semakan pantas

1) Login sebagai parent, pergi ke halaman notifikasi, klik **Aktifkan Push Notification**  
2) Jadualkan reminder di Payment Center  
3) Tunggu scheduler (5 minit) atau trigger manual:

```bash
curl -X POST http://localhost:8000/api/payment-center/reminders/process-due \
  -H "Authorization: Bearer <TOKEN_ADMIN>"
```

Jika VAPID belum diset, reminder tetap dihantar in-app tetapi push ditanda `skipped` dalam `push_logs`.
