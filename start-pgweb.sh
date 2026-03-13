#!/usr/bin/env bash
# Start pgweb for local MRSM PostgreSQL database.

set -euo pipefail

LISTEN_PORT=8081
BIND_HOST="0.0.0.0"
OPEN_BROWSER=0
RESTART_PORT=1
DRY_RUN=0
DATABASE_URL_INPUT="${DATABASE_URL:-postgresql+psycopg://kamarulariffin@localhost:5432/mrsm_portal}"

usage() {
  cat <<'EOF'
Usage: ./start-pgweb.sh [options]

Options:
  --listen <port>       HTTP listen port for pgweb (default: 8081)
  --listen=<port>       Same as above
  --bind <host>         HTTP bind host (default: 0.0.0.0)
  --bind=<host>         Same as above
  --db-url <url>        PostgreSQL connection URL (default: DATABASE_URL env or project default)
  --db-url=<url>        Same as above
  --open                Open browser automatically (default: skip open)
  --no-restart          Do not stop existing listener on pgweb port
  --dry-run             Show resolved command without starting pgweb
  -h, --help            Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --listen)
      if [[ $# -lt 2 ]]; then
        echo "ERROR: --listen requires a port value." >&2
        exit 1
      fi
      LISTEN_PORT="$2"
      shift 2
      ;;
    --listen=*)
      LISTEN_PORT="${1#*=}"
      shift
      ;;
    --bind)
      if [[ $# -lt 2 ]]; then
        echo "ERROR: --bind requires a host value." >&2
        exit 1
      fi
      BIND_HOST="$2"
      shift 2
      ;;
    --bind=*)
      BIND_HOST="${1#*=}"
      shift
      ;;
    --db-url)
      if [[ $# -lt 2 ]]; then
        echo "ERROR: --db-url requires a URL value." >&2
        exit 1
      fi
      DATABASE_URL_INPUT="$2"
      shift 2
      ;;
    --db-url=*)
      DATABASE_URL_INPUT="${1#*=}"
      shift
      ;;
    --open)
      OPEN_BROWSER=1
      shift
      ;;
    --no-restart)
      RESTART_PORT=0
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
      echo "ERROR: Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if ! command -v pgweb >/dev/null 2>&1; then
  echo "ERROR: pgweb is not installed or not in PATH." >&2
  echo "Install example: brew install pgweb" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 is required to parse DATABASE_URL." >&2
  exit 1
fi

if ! [[ "$LISTEN_PORT" =~ ^[0-9]+$ ]]; then
  echo "ERROR: --listen must be a numeric port. Got: ${LISTEN_PORT}" >&2
  exit 1
fi

parse_output="$(
  python3 - "$DATABASE_URL_INPUT" <<'PY'
import sys
from urllib.parse import unquote, urlparse

raw = (sys.argv[1] or "").strip()
if not raw:
    raw = "postgresql://kamarulariffin@localhost:5432/mrsm_portal"
if raw.startswith("postgresql+psycopg://"):
    raw = "postgresql://" + raw[len("postgresql+psycopg://") :]
parsed = urlparse(raw)

host = parsed.hostname or "localhost"
port = parsed.port or 5432
user = unquote(parsed.username) if parsed.username else ""
password = unquote(parsed.password) if parsed.password else ""
db = (parsed.path or "/mrsm_portal").lstrip("/") or "mrsm_portal"

print(host)
print(port)
print(user)
print(password)
print(db)
PY
)"

parsed_url_lines=()
while IFS= read -r line; do
  parsed_url_lines+=("$line")
done <<<"${parse_output}"
PG_HOST="${parsed_url_lines[0]:-localhost}"
PG_PORT="${parsed_url_lines[1]:-5432}"
PG_USER="${parsed_url_lines[2]:-}"
PG_PASS="${parsed_url_lines[3]:-}"
PG_DB="${parsed_url_lines[4]:-mrsm_portal}"

if [[ -z "$PG_USER" ]]; then
  PG_USER="$(id -un)"
fi

if ! [[ "$PG_PORT" =~ ^[0-9]+$ ]]; then
  echo "ERROR: Parsed PostgreSQL port is invalid: ${PG_PORT}" >&2
  exit 1
fi

if command -v lsof >/dev/null 2>&1; then
  existing_pids="$(lsof -tiTCP:"${LISTEN_PORT}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${existing_pids}" ]]; then
    if [[ "${RESTART_PORT}" -eq 0 ]]; then
      echo "ERROR: Port ${LISTEN_PORT} already in use (PIDs: ${existing_pids})." >&2
      echo "Use another port with --listen or allow restart (remove --no-restart)." >&2
      exit 1
    fi
    if [[ "${DRY_RUN}" -eq 1 ]]; then
      echo "[DRY-RUN] Would stop existing process(es) on port ${LISTEN_PORT}: ${existing_pids}"
    else
      echo "[INFO] Stopping existing process(es) on port ${LISTEN_PORT}: ${existing_pids}"
      kill ${existing_pids} 2>/dev/null || true
      sleep 1
      remaining_pids="$(lsof -tiTCP:"${LISTEN_PORT}" -sTCP:LISTEN 2>/dev/null || true)"
      if [[ -n "${remaining_pids}" ]]; then
        kill -9 ${remaining_pids} 2>/dev/null || true
      fi
    fi
  fi
fi

if command -v pg_isready >/dev/null 2>&1; then
  readiness="$(pg_isready -h "${PG_HOST}" -p "${PG_PORT}" 2>/dev/null || true)"
  if [[ "${readiness}" != *"accepting connections"* ]]; then
    echo "[WARN] PostgreSQL readiness check is not healthy yet: ${readiness:-no output}"
    echo "       pgweb will still try to connect."
  fi
fi

pgweb_args=(
  --host "${PG_HOST}"
  --port "${PG_PORT}"
  --user "${PG_USER}"
  --db "${PG_DB}"
  --bind "${BIND_HOST}"
  --listen "${LISTEN_PORT}"
)
if [[ -n "${PG_PASS}" ]]; then
  pgweb_args+=(--pass "${PG_PASS}")
fi
if [[ "${OPEN_BROWSER}" -eq 0 ]]; then
  pgweb_args+=(--skip-open)
fi

masked_pass="<empty>"
if [[ -n "${PG_PASS}" ]]; then
  masked_pass="***"
fi

echo "[INFO] Starting pgweb"
echo "       DB     : postgresql://${PG_USER}@${PG_HOST}:${PG_PORT}/${PG_DB}"
echo "       DB pass: ${masked_pass}"
echo "       Web    : http://${BIND_HOST}:${LISTEN_PORT}"

if [[ "${DRY_RUN}" -eq 1 ]]; then
  echo "[DRY-RUN] pgweb command resolved. No process started."
  exit 0
fi

exec pgweb "${pgweb_args[@]}"
