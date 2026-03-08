#!/usr/bin/env bash
# Start stack MRSMKU dengan pembersihan port konflik + semakan DB.
# Default:
# - Bersihkan port frontend/backend
# - Pastikan PostgreSQL aktif (MongoDB hanya untuk mode legacy/hybrid)
# - Start backend single-process (tanpa --reload)
# - Start frontend

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_DIR="${ROOT_DIR}/frontend"

FRONTEND_PORT=3000
BACKEND_PORT=8000
BACKEND_ALT_PORT=8001
MONGO_PORT=27017
POSTGRES_PORT=5432

DB_ENGINE="${DB_ENGINE:-postgres}"
START_FRONTEND=1
DRY_RUN=0
BACKEND_PID=""

usage() {
  cat <<'EOF'
Usage: ./start-clean.sh [options]

Options:
  --backend-only            Start backend sahaja (frontend tidak dijalankan)
  --db-engine <mode>        Set DB_ENGINE backend (default: postgres)
  --db-engine=<mode>        Sama seperti atas
  --dry-run                 Papar tindakan tanpa ubah sistem
  -h, --help                Papar bantuan
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend-only)
      START_FRONTEND=0
      shift
      ;;
    --db-engine)
      if [[ $# -lt 2 ]]; then
        echo "ERROR: --db-engine perlukan nilai (postgres|hybrid|mongo)." >&2
        exit 1
      fi
      DB_ENGINE="$2"
      shift 2
      ;;
    --db-engine=*)
      DB_ENGINE="${1#*=}"
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Argumen tidak dikenali: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if ! command -v lsof >/dev/null 2>&1; then
  echo "ERROR: 'lsof' tidak dijumpai. Sila pasang dahulu." >&2
  exit 1
fi
if [[ ! -x "${BACKEND_DIR}/venv/bin/uvicorn" ]]; then
  echo "ERROR: Backend uvicorn tidak dijumpai di ${BACKEND_DIR}/venv/bin/uvicorn" >&2
  exit 1
fi

is_port_listening() {
  local port="$1"
  lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
}

stop_port_listeners() {
  local port="$1"
  local label="$2"
  local pids
  pids="$(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    echo "[OK] Tiada proses ${label} pada port ${port}"
    return 0
  fi

  echo "[INFO] Hentikan proses ${label} pada port ${port}: ${pids}"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    return 0
  fi

  kill $pids 2>/dev/null || true
  sleep 1

  local remaining
  remaining="$(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$remaining" ]]; then
    echo "[INFO] Paksa henti baki proses pada port ${port}: ${remaining}"
    kill -9 $remaining 2>/dev/null || true
    sleep 1
  fi
}

ensure_service_on_port() {
  local port="$1"
  local label="$2"
  shift 2
  local services=("$@")

  if is_port_listening "$port"; then
    echo "[OK] ${label} sudah aktif pada port ${port}"
    return 0
  fi

  if ! command -v brew >/dev/null 2>&1; then
    echo "[ERROR] ${label} belum aktif dan 'brew' tidak dijumpai." >&2
    echo "       Sila hidupkan ${label} secara manual." >&2
    return 1
  fi

  for svc in "${services[@]}"; do
    echo "[INFO] Cuba hidupkan ${label}: brew services start ${svc}"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      continue
    fi
    brew services start "${svc}" >/dev/null 2>&1 || true
    sleep 2
    if is_port_listening "$port"; then
      echo "[OK] ${label} aktif melalui service ${svc}"
      return 0
    fi
  done

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[DRY-RUN] Tidak sahkan status akhir ${label}"
    return 0
  fi

  echo "[ERROR] Gagal mengaktifkan ${label} pada port ${port}" >&2
  return 1
}

wait_for_port() {
  local port="$1"
  local timeout_seconds="${2:-45}"
  local waited=0
  while (( waited < timeout_seconds )); do
    if is_port_listening "$port"; then
      return 0
    fi
    sleep 1
    ((waited += 1))
  done
  return 1
}

wait_for_http_200() {
  local url="$1"
  local timeout_seconds="${2:-45}"
  if ! command -v curl >/dev/null 2>&1; then
    echo "[WARN] curl tiada. Semakan HTTP dilangkau: ${url}"
    return 0
  fi

  local waited=0
  while (( waited < timeout_seconds )); do
    local code
    code="$(curl -s -o /dev/null -w "%{http_code}" "${url}" || true)"
    if [[ "$code" == "200" ]]; then
      return 0
    fi
    sleep 1
    ((waited += 1))
  done
  return 1
}

cleanup() {
  if [[ -n "${BACKEND_PID}" ]]; then
    echo
    echo "[INFO] Hentikan backend (PID ${BACKEND_PID})..."
    kill "${BACKEND_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "==> Langkah 1/4: Bersihkan konflik port aplikasi"
stop_port_listeners "${BACKEND_PORT}" "backend"
stop_port_listeners "${BACKEND_ALT_PORT}" "backend-alt"
if [[ "$START_FRONTEND" -eq 1 ]]; then
  stop_port_listeners "${FRONTEND_PORT}" "frontend"
fi
echo

echo "==> Langkah 2/4: Pastikan database aktif"
if [[ "${DB_ENGINE}" == "mongo" || "${DB_ENGINE}" == "hybrid" ]]; then
  ensure_service_on_port "${MONGO_PORT}" "MongoDB" \
    "mongodb-community@7.0" "mongodb-community@8.0" "mongodb-community"
else
  echo "[OK] MongoDB dilangkau (DB_ENGINE=${DB_ENGINE})"
fi
ensure_service_on_port "${POSTGRES_PORT}" "PostgreSQL" \
  "postgresql@18" "postgresql@17" "postgresql@16" "postgresql@15" "postgresql@14" "postgresql"
echo

echo "==> Langkah 3/4: Start backend single-process (DB_ENGINE=${DB_ENGINE})"
if [[ "$START_FRONTEND" -eq 0 ]]; then
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[DRY-RUN] cd \"${BACKEND_DIR}\" && DB_ENGINE=${DB_ENGINE} ./venv/bin/uvicorn server:app --host 0.0.0.0 --port ${BACKEND_PORT}"
    exit 0
  fi
  cd "${BACKEND_DIR}"
  exec env DB_ENGINE="${DB_ENGINE}" ./venv/bin/uvicorn server:app --host 0.0.0.0 --port "${BACKEND_PORT}"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[DRY-RUN] (cd \"${BACKEND_DIR}\" && DB_ENGINE=${DB_ENGINE} ./venv/bin/uvicorn server:app --host 0.0.0.0 --port ${BACKEND_PORT}) &"
else
  (
    cd "${BACKEND_DIR}"
    DB_ENGINE="${DB_ENGINE}" ./venv/bin/uvicorn server:app --host 0.0.0.0 --port "${BACKEND_PORT}"
  ) &
  BACKEND_PID=$!
fi

if [[ "$DRY_RUN" -eq 0 ]]; then
  wait_for_port "${BACKEND_PORT}" 45 || { echo "[ERROR] Backend gagal bind port ${BACKEND_PORT}"; exit 1; }
  wait_for_http_200 "http://localhost:${BACKEND_PORT}/docs" 45 || { echo "[ERROR] Backend /docs tidak respons 200"; exit 1; }
  echo "[OK] Backend aktif pada http://localhost:${BACKEND_PORT}"
else
  echo "[DRY-RUN] Semakan backend health dilangkau"
fi
echo

echo "==> Langkah 4/4: Start frontend"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[DRY-RUN] cd \"${FRONTEND_DIR}\" && npm start"
  exit 0
fi

echo "Frontend: http://localhost:${FRONTEND_PORT}"
echo "Backend : http://localhost:${BACKEND_PORT}"
(cd "${FRONTEND_DIR}" && npm start)
