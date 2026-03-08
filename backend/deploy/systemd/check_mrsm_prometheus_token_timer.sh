#!/usr/bin/env bash
set -euo pipefail

SYSTEMD_DIR="/etc/systemd/system"
SERVICE_UNIT="mrsm-prometheus-token-refresh.service"
TIMER_UNIT="mrsm-prometheus-token-refresh.timer"
SERVICE_PATH="${SYSTEMD_DIR}/${SERVICE_UNIT}"
TIMER_PATH="${SYSTEMD_DIR}/${TIMER_UNIT}"

ENV_FILE="/etc/prometheus/secrets/mrsm-token.env"
TOKEN_FILE="/etc/prometheus/secrets/mrsm_token.txt"
BACKEND_BASE_URL=""
MAX_TOKEN_AGE_SECONDS=5400

CHECK_SYSTEMD=1
CHECK_SCRAPE=0
QUIET=0

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

usage() {
  cat <<'EOF'
Check MRSM Prometheus token refresh setup health.

Usage:
  check_mrsm_prometheus_token_timer.sh [options]

Options:
  --env-file PATH              Env file path (default: /etc/prometheus/secrets/mrsm-token.env)
  --token-file PATH            Token file path (default: /etc/prometheus/secrets/mrsm_token.txt)
  --backend-url URL            Override BACKEND_BASE_URL for scrape test
  --max-token-age-seconds N    Warn if token age > N (default: 5400)
  --scrape-test                Test metrics scrape endpoint using token
  --skip-systemd               Skip systemd unit/timer checks
  --quiet                      Print compact output
  -h, --help                   Show this help

Examples:
  ./check_mrsm_prometheus_token_timer.sh
  ./check_mrsm_prometheus_token_timer.sh --scrape-test
  ./check_mrsm_prometheus_token_timer.sh --skip-systemd --scrape-test --backend-url http://localhost:8000
EOF
}

print_line() {
  if [[ "${QUIET}" -eq 0 ]]; then
    printf '%s\n' "$*"
  fi
}

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  print_line "[OK] $*"
}

warn() {
  WARN_COUNT=$((WARN_COUNT + 1))
  print_line "[WARN] $*"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  print_line "[FAIL] $*"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --env-file)
        ENV_FILE="${2:-}"; shift 2 ;;
      --token-file)
        TOKEN_FILE="${2:-}"; shift 2 ;;
      --backend-url)
        BACKEND_BASE_URL="${2:-}"; shift 2 ;;
      --max-token-age-seconds)
        MAX_TOKEN_AGE_SECONDS="${2:-}"; shift 2 ;;
      --scrape-test)
        CHECK_SCRAPE=1; shift ;;
      --skip-systemd)
        CHECK_SYSTEMD=0; shift ;;
      --quiet)
        QUIET=1; shift ;;
      -h|--help)
        usage; exit 0 ;;
      *)
        printf 'Unknown option: %s\n\n' "$1" >&2
        usage
        exit 1 ;;
    esac
  done
}

load_env_file_if_present() {
  if [[ -f "${ENV_FILE}" ]]; then
    # shellcheck disable=SC1090
    source "${ENV_FILE}"
    pass "Env file found: ${ENV_FILE}"
  else
    warn "Env file not found: ${ENV_FILE}"
  fi
}

validate_numeric_inputs() {
  if ! [[ "${MAX_TOKEN_AGE_SECONDS}" =~ ^[0-9]+$ ]]; then
    printf '--max-token-age-seconds must be integer.\n' >&2
    exit 1
  fi
}

check_systemd_units() {
  if [[ "${CHECK_SYSTEMD}" -ne 1 ]]; then
    warn "Skipping systemd checks (--skip-systemd)."
    return
  fi

  if ! command -v systemctl >/dev/null 2>&1; then
    fail "systemctl not found on this host."
    return
  fi

  if [[ -f "${SERVICE_PATH}" ]]; then
    pass "Service unit file exists: ${SERVICE_PATH}"
  else
    fail "Missing service unit file: ${SERVICE_PATH}"
  fi

  if [[ -f "${TIMER_PATH}" ]]; then
    pass "Timer unit file exists: ${TIMER_PATH}"
  else
    fail "Missing timer unit file: ${TIMER_PATH}"
  fi

  if systemctl is-enabled "${TIMER_UNIT}" >/dev/null 2>&1; then
    pass "Timer is enabled: ${TIMER_UNIT}"
  else
    warn "Timer is not enabled: ${TIMER_UNIT}"
  fi

  if systemctl is-active "${TIMER_UNIT}" >/dev/null 2>&1; then
    pass "Timer is active: ${TIMER_UNIT}"
  else
    warn "Timer is not active: ${TIMER_UNIT}"
  fi

  local timer_show service_show
  timer_show="$(systemctl show "${TIMER_UNIT}" -p LastTriggerUSec -p NextElapseUSecRealtime 2>/dev/null || true)"
  service_show="$(systemctl show "${SERVICE_UNIT}" -p Result -p ActiveState -p ExecMainStatus 2>/dev/null || true)"
  if [[ -n "${timer_show}" ]]; then
    print_line "  timer-show: ${timer_show//$'\n'/; }"
  fi
  if [[ -n "${service_show}" ]]; then
    print_line "  service-show: ${service_show//$'\n'/; }"
  fi
}

check_token_file() {
  if [[ -z "${TOKEN_FILE}" ]]; then
    fail "TOKEN_FILE is empty."
    return
  fi

  if [[ ! -f "${TOKEN_FILE}" ]]; then
    fail "Token file not found: ${TOKEN_FILE}"
    return
  fi

  if [[ ! -s "${TOKEN_FILE}" ]]; then
    fail "Token file is empty: ${TOKEN_FILE}"
    return
  fi

  pass "Token file exists and non-empty: ${TOKEN_FILE}"

  local perm
  perm="$(stat -c '%a' "${TOKEN_FILE}" 2>/dev/null || stat -f '%A' "${TOKEN_FILE}" 2>/dev/null || echo '?')"
  if [[ "${perm}" != "600" ]]; then
    warn "Token file permission expected 600, got ${perm} (${TOKEN_FILE})"
  else
    pass "Token file permission is 600."
  fi

  local age_seconds
  age_seconds="$(TOKEN_FILE_PATH="${TOKEN_FILE}" python3 - <<'PY'
import os
import time
path = os.environ["TOKEN_FILE_PATH"]
print(int(time.time() - os.path.getmtime(path)))
PY
)"
  if [[ "${age_seconds}" -gt "${MAX_TOKEN_AGE_SECONDS}" ]]; then
    warn "Token age ${age_seconds}s exceeds threshold ${MAX_TOKEN_AGE_SECONDS}s."
  else
    pass "Token age ${age_seconds}s is within threshold ${MAX_TOKEN_AGE_SECONDS}s."
  fi
}

run_scrape_test_if_requested() {
  if [[ "${CHECK_SCRAPE}" -ne 1 ]]; then
    warn "Skipping scrape test (use --scrape-test to enable)."
    return
  fi

  if [[ -z "${BACKEND_BASE_URL}" ]]; then
    BACKEND_BASE_URL="http://localhost:8000"
  fi

  if [[ ! -f "${TOKEN_FILE}" || ! -s "${TOKEN_FILE}" ]]; then
    fail "Cannot run scrape test: token file missing or empty (${TOKEN_FILE})."
    return
  fi

  local token url body
  token="$(<"${TOKEN_FILE}")"
  url="${BACKEND_BASE_URL%/}/api/financial-dashboard/cache/invalidation-metrics/prometheus"

  if ! body="$(curl -fsS "${url}" -H "Authorization: Bearer ${token}" 2>/dev/null)"; then
    fail "Scrape test failed: ${url}"
    return
  fi

  if [[ "${body}" == *"financial_dashboard_cache_invalidation_hits_total"* ]]; then
    pass "Scrape test passed: metrics payload contains expected series."
  else
    fail "Scrape test response missing expected metric series."
  fi
}

print_summary() {
  printf '\n'
  printf 'Summary: pass=%d warn=%d fail=%d\n' "${PASS_COUNT}" "${WARN_COUNT}" "${FAIL_COUNT}"
}

main() {
  parse_args "$@"
  validate_numeric_inputs
  load_env_file_if_present
  check_systemd_units
  check_token_file
  run_scrape_test_if_requested
  print_summary

  if [[ "${FAIL_COUNT}" -gt 0 ]]; then
    exit 1
  fi
}

main "$@"
