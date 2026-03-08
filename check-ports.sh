#!/usr/bin/env bash
# Semak status port utama projek MRSMKU (frontend, backend, PostgreSQL, optional MongoDB).

set -u

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
REQUIRE_FRONTEND=1
HAS_ERROR=0
DB_ENGINE="${DB_ENGINE:-postgres}"

FRONTEND_PORT=3000
BACKEND_PORT=8000
BACKEND_ALT_PORT=8001
MONGO_PORT=27017
POSTGRES_PORT=5432

usage() {
  cat <<'EOF'
Usage: ./check-ports.sh [--backend-only]

Options:
  --backend-only   Semak backend + database sahaja (frontend tidak diwajibkan)
  --db-engine MODE Tetapkan mode DB untuk semakan (postgres|hybrid|mongo)
  -h, --help       Papar bantuan
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend-only)
      REQUIRE_FRONTEND=0
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

REQUIRE_MONGO=0
if [[ "${DB_ENGINE}" == "mongo" || "${DB_ENGINE}" == "hybrid" ]]; then
  REQUIRE_MONGO=1
fi

if ! command -v lsof >/dev/null 2>&1; then
  echo "ERROR: 'lsof' tidak dijumpai. Sila pasang dahulu." >&2
  exit 1
fi

print_port_status() {
  local port="$1"
  echo "--- PORT ${port} ---"
  local listeners
  listeners="$(lsof -nP -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$listeners" ]]; then
    echo "$listeners"
  else
    echo "(tiada listener)"
  fi
}

is_port_listening() {
  local port="$1"
  lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
}

check_required_port() {
  local port="$1"
  local label="$2"
  if is_port_listening "$port"; then
    echo "[OK] ${label} aktif pada port ${port}"
  else
    echo "[X] ${label} tidak aktif pada port ${port}"
    HAS_ERROR=1
  fi
}

check_http_status() {
  local label="$1"
  local url="$2"
  if ! command -v curl >/dev/null 2>&1; then
    echo "[WARN] curl tiada. Semakan HTTP untuk ${label} dilangkau."
    return
  fi

  local code
  code="$(curl -s -o /dev/null -w "%{http_code}" "$url" || echo "000")"
  if [[ "$code" == "200" ]]; then
    echo "[OK] ${label} endpoint hidup (${url} -> ${code})"
  else
    echo "[X] ${label} endpoint gagal (${url} -> ${code})"
    HAS_ERROR=1
  fi
}

check_postgres_ready() {
  if command -v pg_isready >/dev/null 2>&1; then
    local out
    out="$(pg_isready -h localhost -p "${POSTGRES_PORT}" 2>/dev/null || true)"
    if [[ "$out" == *"accepting connections"* ]]; then
      echo "[OK] PostgreSQL menerima sambungan (${out})"
    else
      echo "[X] PostgreSQL belum sedia (${out:-tiada output})"
      HAS_ERROR=1
    fi
    return
  fi

  if is_port_listening "${POSTGRES_PORT}"; then
    echo "[WARN] pg_isready tiada. Port ${POSTGRES_PORT} terbuka, dianggap aktif."
  else
    echo "[X] PostgreSQL tidak aktif pada port ${POSTGRES_PORT}"
    HAS_ERROR=1
  fi
}

check_mongo_ready() {
  local py="${ROOT_DIR}/backend/venv/bin/python"
  if [[ ! -x "$py" ]]; then
    if is_port_listening "${MONGO_PORT}"; then
      echo "[WARN] Python venv backend tidak dijumpai. Port ${MONGO_PORT} terbuka, dianggap aktif."
    else
      echo "[X] MongoDB tidak aktif pada port ${MONGO_PORT}"
      HAS_ERROR=1
    fi
    return
  fi

  local ping_out
  ping_out="$("$py" - <<'PY' 2>/dev/null || true
from pymongo import MongoClient
client = MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=2000)
try:
    print(int(client.admin.command("ping").get("ok", 0)))
finally:
    client.close()
PY
)"
  if [[ "$ping_out" == "1" ]]; then
    echo "[OK] MongoDB ping berjaya"
  else
    echo "[X] MongoDB ping gagal"
    HAS_ERROR=1
  fi
}

echo "== Status Listener Port =="
print_port_status "${FRONTEND_PORT}"
print_port_status "${BACKEND_PORT}"
print_port_status "${BACKEND_ALT_PORT}"
if [[ "${REQUIRE_MONGO}" -eq 1 ]]; then
  print_port_status "${MONGO_PORT}"
fi
print_port_status "${POSTGRES_PORT}"
echo

echo "== Semakan Wajib =="
if [[ "$REQUIRE_FRONTEND" -eq 1 ]]; then
  check_required_port "${FRONTEND_PORT}" "Frontend"
fi
check_required_port "${BACKEND_PORT}" "Backend"
if [[ "${REQUIRE_MONGO}" -eq 1 ]]; then
  check_required_port "${MONGO_PORT}" "MongoDB"
else
  echo "[OK] MongoDB tidak diwajibkan (DB_ENGINE=${DB_ENGINE})"
fi
check_required_port "${POSTGRES_PORT}" "PostgreSQL"
echo

echo "== Semakan Kesihatan Endpoint =="
if [[ "$REQUIRE_FRONTEND" -eq 1 ]]; then
  check_http_status "Frontend" "http://localhost:${FRONTEND_PORT}"
fi
check_http_status "Backend docs" "http://localhost:${BACKEND_PORT}/docs"
if [[ "${REQUIRE_MONGO}" -eq 1 ]]; then
  check_mongo_ready
fi
check_postgres_ready
echo

if [[ "$HAS_ERROR" -eq 0 ]]; then
  echo "STATUS: OK (semua servis utama aktif)"
  exit 0
fi

echo "STATUS: ADA ISU (semak tanda [X] di atas)"
exit 1
