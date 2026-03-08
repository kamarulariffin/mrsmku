#!/usr/bin/env bash
set -euo pipefail

SYSTEMD_DIR="/etc/systemd/system"
SERVICE_UNIT="mrsm-prometheus-token-refresh.service"
TIMER_UNIT="mrsm-prometheus-token-refresh.timer"
SERVICE_PATH="${SYSTEMD_DIR}/${SERVICE_UNIT}"
TIMER_PATH="${SYSTEMD_DIR}/${TIMER_UNIT}"

ENV_FILE="/etc/prometheus/secrets/mrsm-token.env"
TOKEN_FILE="/etc/prometheus/secrets/mrsm_token.txt"
BACKEND_URL=""
MAX_TOKEN_AGE_SECONDS=5400
SCRAPE_TEST=0
SKIP_SYSTEMD=0

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

usage() {
  cat <<'EOF'
Show quick status for MRSM Prometheus token timer setup.

Usage:
  status_mrsm_prometheus_token_timer.sh [options]

Options:
  --env-file PATH              Env file path (default: /etc/prometheus/secrets/mrsm-token.env)
  --token-file PATH            Token file path (default: /etc/prometheus/secrets/mrsm_token.txt)
  --backend-url URL            Override backend URL for scrape test
  --max-token-age-seconds N    Token staleness threshold (default: 5400)
  --skip-systemd               Skip systemd checks
  --scrape-test                Validate Prometheus scrape endpoint using token
  --no-scrape-test             Skip scrape test (default)
  -h, --help                   Show this help

Examples:
  ./status_mrsm_prometheus_token_timer.sh
  ./status_mrsm_prometheus_token_timer.sh --scrape-test
  ./status_mrsm_prometheus_token_timer.sh --token-file /tmp/token --no-scrape-test
EOF
}

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf '[OK] %s\n' "$*"
}

warn() {
  WARN_COUNT=$((WARN_COUNT + 1))
  printf '[WARN] %s\n' "$*"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf '[FAIL] %s\n' "$*"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --env-file)
        ENV_FILE="${2:-}"; shift 2 ;;
      --token-file)
        TOKEN_FILE="${2:-}"; shift 2 ;;
      --backend-url)
        BACKEND_URL="${2:-}"; shift 2 ;;
      --max-token-age-seconds)
        MAX_TOKEN_AGE_SECONDS="${2:-}"; shift 2 ;;
      --skip-systemd)
        SKIP_SYSTEMD=1; shift ;;
      --scrape-test)
        SCRAPE_TEST=1; shift ;;
      --no-scrape-test)
        SCRAPE_TEST=0; shift ;;
      -h|--help)
        usage; exit 0 ;;
      *)
        printf 'Unknown option: %s\n\n' "$1" >&2
        usage
        exit 1 ;;
    esac
  done
}

validate_inputs() {
  if ! [[ "${MAX_TOKEN_AGE_SECONDS}" =~ ^[0-9]+$ ]]; then
    printf '--max-token-age-seconds must be an integer.\n' >&2
    exit 1
  fi
}

load_env_if_exists() {
  if [[ -f "${ENV_FILE}" ]]; then
    # shellcheck disable=SC1090
    source "${ENV_FILE}"
    pass "Env file loaded: ${ENV_FILE}"
  else
    warn "Env file not found: ${ENV_FILE}"
  fi
}

check_systemd_summary() {
  printf '\n== systemd ==\n'
  if [[ "${SKIP_SYSTEMD}" -eq 1 ]]; then
    warn "Skipping systemd checks (--skip-systemd)."
    return
  fi

  if ! command -v systemctl >/dev/null 2>&1; then
    warn "systemctl not available on this host."
    return
  fi

  if [[ -f "${SERVICE_PATH}" ]]; then
    pass "Service unit file present: ${SERVICE_PATH}"
  else
    fail "Service unit file missing: ${SERVICE_PATH}"
  fi

  if [[ -f "${TIMER_PATH}" ]]; then
    pass "Timer unit file present: ${TIMER_PATH}"
  else
    fail "Timer unit file missing: ${TIMER_PATH}"
  fi

  if systemctl is-enabled "${TIMER_UNIT}" >/dev/null 2>&1; then
    pass "Timer enabled: ${TIMER_UNIT}"
  else
    warn "Timer not enabled: ${TIMER_UNIT}"
  fi

  if systemctl is-active "${TIMER_UNIT}" >/dev/null 2>&1; then
    pass "Timer active: ${TIMER_UNIT}"
  else
    warn "Timer not active: ${TIMER_UNIT}"
  fi

  local next_elapse last_trigger
  next_elapse="$(systemctl show "${TIMER_UNIT}" -p NextElapseUSecRealtime --value 2>/dev/null || true)"
  last_trigger="$(systemctl show "${TIMER_UNIT}" -p LastTriggerUSec --value 2>/dev/null || true)"
  printf 'Next timer elapse : %s\n' "${next_elapse:-n/a}"
  printf 'Last timer trigger: %s\n' "${last_trigger:-n/a}"
}

check_token_summary() {
  printf '\n== token ==\n'
  if [[ ! -f "${TOKEN_FILE}" ]]; then
    fail "Token file missing: ${TOKEN_FILE}"
    return
  fi
  if [[ ! -s "${TOKEN_FILE}" ]]; then
    fail "Token file empty: ${TOKEN_FILE}"
    return
  fi
  pass "Token file present and non-empty: ${TOKEN_FILE}"

  local perm size age_seconds
  perm="$(stat -c '%a' "${TOKEN_FILE}" 2>/dev/null || stat -f '%A' "${TOKEN_FILE}" 2>/dev/null || echo '?')"
  size="$(stat -c '%s' "${TOKEN_FILE}" 2>/dev/null || stat -f '%z' "${TOKEN_FILE}" 2>/dev/null || echo '?')"
  age_seconds="$(TOKEN_FILE_PATH="${TOKEN_FILE}" python3 - <<'PY'
import os
import time
path = os.environ["TOKEN_FILE_PATH"]
print(int(time.time() - os.path.getmtime(path)))
PY
)"

  printf 'Token size (bytes): %s\n' "${size}"
  printf 'Token permission : %s\n' "${perm}"
  printf 'Token age (secs) : %s\n' "${age_seconds}"

  if [[ "${perm}" != "600" ]]; then
    warn "Recommended token permission is 600."
  else
    pass "Token permission is 600."
  fi

  if [[ "${age_seconds}" -gt "${MAX_TOKEN_AGE_SECONDS}" ]]; then
    warn "Token age exceeds threshold (${MAX_TOKEN_AGE_SECONDS}s)."
  else
    pass "Token age within threshold (${MAX_TOKEN_AGE_SECONDS}s)."
  fi
}

run_scrape_test() {
  if [[ "${SCRAPE_TEST}" -ne 1 ]]; then
    warn "Scrape test skipped (use --scrape-test to enable)."
    return
  fi

  printf '\n== scrape ==\n'
  if [[ ! -f "${TOKEN_FILE}" || ! -s "${TOKEN_FILE}" ]]; then
    fail "Cannot run scrape test: token file missing/empty."
    return
  fi

  if [[ -z "${BACKEND_URL}" ]]; then
    BACKEND_URL="${BACKEND_BASE_URL:-http://localhost:8000}"
  fi
  local url token body
  url="${BACKEND_URL%/}/api/financial-dashboard/cache/invalidation-metrics/prometheus"
  token="$(<"${TOKEN_FILE}")"

  if ! body="$(curl -fsS "${url}" -H "Authorization: Bearer ${token}" 2>/dev/null)"; then
    fail "Scrape endpoint request failed: ${url}"
    return
  fi

  if [[ "${body}" == *"financial_dashboard_cache_invalidation_hits_total"* ]]; then
    pass "Scrape payload contains expected metric series."
  else
    fail "Scrape payload missing expected metric series."
  fi
}

print_summary() {
  printf '\nSummary: pass=%d warn=%d fail=%d\n' "${PASS_COUNT}" "${WARN_COUNT}" "${FAIL_COUNT}"
}

main() {
  parse_args "$@"
  validate_inputs
  load_env_if_exists
  check_systemd_summary
  check_token_summary
  run_scrape_test
  print_summary

  if [[ "${FAIL_COUNT}" -gt 0 ]]; then
    exit 1
  fi
}

main "$@"
