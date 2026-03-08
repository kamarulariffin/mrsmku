#!/usr/bin/env bash
set -euo pipefail

# Optional env file loader (e.g. /etc/prometheus/secrets/mrsm-token.env)
if [[ -n "${PROM_TOKEN_ENV_FILE:-}" ]]; then
  if [[ ! -f "${PROM_TOKEN_ENV_FILE}" ]]; then
    echo "PROM_TOKEN_ENV_FILE not found: ${PROM_TOKEN_ENV_FILE}" >&2
    exit 1
  fi
  # shellcheck disable=SC1090
  source "${PROM_TOKEN_ENV_FILE}"
fi

BACKEND_BASE_URL="${BACKEND_BASE_URL:-http://localhost:8000}"
PROM_EMAIL="${PROM_EMAIL:-}"
PROM_PASSWORD="${PROM_PASSWORD:-}"
TOKEN_FILE="${TOKEN_FILE:-/etc/prometheus/secrets/mrsm_token.txt}"

if [[ -z "${PROM_EMAIL}" || -z "${PROM_PASSWORD}" ]]; then
  echo "PROM_EMAIL and PROM_PASSWORD are required." >&2
  echo "Set them as env vars or via PROM_TOKEN_ENV_FILE." >&2
  exit 1
fi

LOGIN_URL="${BACKEND_BASE_URL%/}/api/auth/login"

PAYLOAD="$(PROM_EMAIL="${PROM_EMAIL}" PROM_PASSWORD="${PROM_PASSWORD}" python3 - <<'PY'
import json
import os

print(json.dumps({
    "email": os.environ["PROM_EMAIL"],
    "password": os.environ["PROM_PASSWORD"],
}))
PY
)"

RESPONSE="$(curl -fsS -X POST "${LOGIN_URL}" -H "Content-Type: application/json" -d "${PAYLOAD}")"

TOKEN="$(printf '%s' "${RESPONSE}" | python3 - <<'PY'
import json
import sys

try:
    body = json.load(sys.stdin)
except Exception:
    print("", end="")
    raise SystemExit(0)

print(body.get("access_token", ""), end="")
PY
)"

if [[ -z "${TOKEN}" ]]; then
  echo "Failed to read access_token from login response." >&2
  echo "Response: ${RESPONSE}" >&2
  exit 1
fi

TOKEN_DIR="$(dirname "${TOKEN_FILE}")"
mkdir -p "${TOKEN_DIR}"

TMP_FILE="${TOKEN_FILE}.tmp.$$"
umask 077
printf '%s\n' "${TOKEN}" > "${TMP_FILE}"
mv "${TMP_FILE}" "${TOKEN_FILE}"

echo "Prometheus token refreshed -> ${TOKEN_FILE}"
