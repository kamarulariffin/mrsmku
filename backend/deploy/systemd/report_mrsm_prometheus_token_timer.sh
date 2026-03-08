#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK_SCRIPT="${SCRIPT_DIR}/check_mrsm_prometheus_token_timer.sh"
STATUS_SCRIPT="${SCRIPT_DIR}/status_mrsm_prometheus_token_timer.sh"
DOCTOR_SCRIPT="${SCRIPT_DIR}/doctor_mrsm_prometheus_token_timer.sh"

REPORT_DIR="${SCRIPT_DIR}/reports"
ENV_FILE="/etc/prometheus/secrets/mrsm-token.env"
TOKEN_FILE="/etc/prometheus/secrets/mrsm_token.txt"
BACKEND_URL=""
MAX_TOKEN_AGE_SECONDS=5400
INCLUDE_SCRAPE=1
SKIP_SYSTEMD=0
QUIET=0

usage() {
  cat <<'EOF'
Generate a timestamped audit report for MRSM Prometheus token timer setup.

Usage:
  report_mrsm_prometheus_token_timer.sh [options]

Options:
  --output-dir PATH            Report output directory
                               (default: backend/deploy/systemd/reports)
  --env-file PATH              Env file path (default: /etc/prometheus/secrets/mrsm-token.env)
  --token-file PATH            Token file path (default: /etc/prometheus/secrets/mrsm_token.txt)
  --backend-url URL            Override backend URL for scrape test
  --max-token-age-seconds N    Token staleness threshold (default: 5400)
  --scrape-test                Include scrape tests (default)
  --no-scrape-test             Skip scrape tests
  --skip-systemd               Skip systemd checks in health scripts
  --quiet                      Pass quiet mode where supported
  -h, --help                   Show this help

Outputs:
  prom_audit_<timestamp>_check.log
  prom_audit_<timestamp>_status.log
  prom_audit_<timestamp>_doctor.log
  prom_audit_<timestamp>_summary.txt
EOF
}

log() {
  printf '[prom-report] %s\n' "$*"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --output-dir)
        REPORT_DIR="${2:-}"; shift 2 ;;
      --env-file)
        ENV_FILE="${2:-}"; shift 2 ;;
      --token-file)
        TOKEN_FILE="${2:-}"; shift 2 ;;
      --backend-url)
        BACKEND_URL="${2:-}"; shift 2 ;;
      --max-token-age-seconds)
        MAX_TOKEN_AGE_SECONDS="${2:-}"; shift 2 ;;
      --scrape-test)
        INCLUDE_SCRAPE=1; shift ;;
      --no-scrape-test)
        INCLUDE_SCRAPE=0; shift ;;
      --skip-systemd)
        SKIP_SYSTEMD=1; shift ;;
      --quiet)
        QUIET=1; shift ;;
      -h|--help)
        usage
        exit 0 ;;
      *)
        log "Unknown option: $1"
        usage
        exit 1 ;;
    esac
  done
}

validate_inputs() {
  if ! [[ "${MAX_TOKEN_AGE_SECONDS}" =~ ^[0-9]+$ ]]; then
    log "--max-token-age-seconds must be an integer."
    exit 1
  fi
  if [[ ! -f "${CHECK_SCRIPT}" || ! -f "${STATUS_SCRIPT}" || ! -f "${DOCTOR_SCRIPT}" ]]; then
    log "One or more required scripts are missing in ${SCRIPT_DIR}"
    exit 1
  fi
}

build_common_args() {
  COMMON_ARGS=(
    --env-file "${ENV_FILE}"
    --token-file "${TOKEN_FILE}"
    --max-token-age-seconds "${MAX_TOKEN_AGE_SECONDS}"
  )
  if [[ -n "${BACKEND_URL}" ]]; then
    COMMON_ARGS+=(--backend-url "${BACKEND_URL}")
  fi
  if [[ "${SKIP_SYSTEMD}" -eq 1 ]]; then
    COMMON_ARGS+=(--skip-systemd)
  fi
  if [[ "${QUIET}" -eq 1 ]]; then
    COMMON_ARGS+=(--quiet)
  fi
}

run_step() {
  local label="$1"
  local outfile="$2"
  shift 2

  set +e
  "$@" > "${outfile}" 2>&1
  local code=$?
  set -e

  if [[ "${code}" -eq 0 ]]; then
    log "${label} OK -> ${outfile}"
  else
    log "${label} FAIL(${code}) -> ${outfile}"
  fi
  RUN_STEP_CODE="${code}"
}

main() {
  parse_args "$@"
  validate_inputs
  build_common_args

  mkdir -p "${REPORT_DIR}"
  local ts prefix summary_file
  ts="$(date -u +"%Y%m%dT%H%M%SZ")"
  prefix="${REPORT_DIR}/prom_audit_${ts}"
  summary_file="${prefix}_summary.txt"

  local check_log status_log doctor_log
  check_log="${prefix}_check.log"
  status_log="${prefix}_status.log"
  doctor_log="${prefix}_doctor.log"

  local -a check_args status_args doctor_args
  check_args=("${COMMON_ARGS[@]}")
  status_args=("${COMMON_ARGS[@]}")
  doctor_args=("${COMMON_ARGS[@]}")

  if [[ "${INCLUDE_SCRAPE}" -eq 1 ]]; then
    check_args+=(--scrape-test)
    status_args+=(--scrape-test)
    doctor_args+=(--scrape-test)
  else
    status_args+=(--no-scrape-test)
  fi

  log "Generating audit report at ${REPORT_DIR}"
  local check_code status_code doctor_code
  RUN_STEP_CODE=0
  run_step "check" "${check_log}" "${CHECK_SCRIPT}" "${check_args[@]}"
  check_code="${RUN_STEP_CODE}"
  run_step "status" "${status_log}" "${STATUS_SCRIPT}" "${status_args[@]}"
  status_code="${RUN_STEP_CODE}"
  run_step "doctor" "${doctor_log}" "${DOCTOR_SCRIPT}" "${doctor_args[@]}"
  doctor_code="${RUN_STEP_CODE}"

  local overall=0
  if [[ "${check_code}" -ne 0 || "${status_code}" -ne 0 || "${doctor_code}" -ne 0 ]]; then
    overall=1
  fi

  cat > "${summary_file}" <<EOF
timestamp_utc=${ts}
include_scrape=${INCLUDE_SCRAPE}
skip_systemd=${SKIP_SYSTEMD}
env_file=${ENV_FILE}
token_file=${TOKEN_FILE}
backend_url=${BACKEND_URL:-auto}
max_token_age_seconds=${MAX_TOKEN_AGE_SECONDS}
check_exit_code=${check_code}
status_exit_code=${status_code}
doctor_exit_code=${doctor_code}
overall_exit_code=${overall}
check_log=${check_log}
status_log=${status_log}
doctor_log=${doctor_log}
EOF

  log "Summary -> ${summary_file}"
  if [[ "${overall}" -eq 0 ]]; then
    log "Audit report completed with all checks passing."
  else
    log "Audit report completed with failures. See summary/log files."
  fi
  exit "${overall}"
}

main "$@"
