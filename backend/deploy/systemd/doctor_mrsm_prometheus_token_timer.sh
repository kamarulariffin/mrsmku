#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

INSTALL_SCRIPT="${SCRIPT_DIR}/install_mrsm_prometheus_token_timer.sh"
CHECK_SCRIPT="${SCRIPT_DIR}/check_mrsm_prometheus_token_timer.sh"

PROJECT_ROOT="${DEFAULT_PROJECT_ROOT}"
ENV_FILE="/etc/prometheus/secrets/mrsm-token.env"
TOKEN_FILE="/etc/prometheus/secrets/mrsm_token.txt"
BACKEND_URL=""
MAX_TOKEN_AGE_SECONDS=5400
RUN_SCRAPE_TEST=0
SKIP_SYSTEMD=0
AUTO_FIX=0
DRY_RUN=0
QUIET=0

SERVICE_USER="prometheus"
SERVICE_GROUP="prometheus"
PROM_EMAIL=""
PROM_PASSWORD=""
NO_ENABLE=0
NO_RUN_ONCE=0

usage() {
  cat <<'EOF'
Doctor script for MRSM Prometheus token refresh setup.

Usage:
  doctor_mrsm_prometheus_token_timer.sh [options]

Checks:
  - Runs health check script for systemd units, env/token files, token age.
  - Optional scrape test against backend endpoint.
  - Optional auto-fix via install script, then re-check.

Options:
  --project-root PATH          Project root path for installer (default: auto-detect)
  --env-file PATH              Env file path (default: /etc/prometheus/secrets/mrsm-token.env)
  --token-file PATH            Token file path (default: /etc/prometheus/secrets/mrsm_token.txt)
  --backend-url URL            Override backend URL for checks/installer
  --max-token-age-seconds N    Token staleness threshold (default: 5400)
  --scrape-test                Include endpoint scrape test in health check
  --skip-systemd               Skip systemd checks in health check
  --auto-fix                   If check fails, run installer and re-check
  --service-user USER          Service user for auto-fix install (default: prometheus)
  --service-group GROUP        Service group for auto-fix install (default: prometheus)
  --prom-email EMAIL           Login email for auto-fix install env provisioning
  --prom-password PASSWORD     Login password for auto-fix install env provisioning
  --no-enable                  Auto-fix: install only, do not enable/start timer
  --no-run-once                Auto-fix: do not run oneshot refresh service
  --dry-run                    Print auto-fix install actions without applying
  --quiet                      Compact output from health check
  -h, --help                   Show this help

Examples:
  ./doctor_mrsm_prometheus_token_timer.sh
  ./doctor_mrsm_prometheus_token_timer.sh --scrape-test
  sudo ./doctor_mrsm_prometheus_token_timer.sh --auto-fix --prom-email superadmin@muafakat.link --prom-password 'strong-pass'
EOF
}

log() {
  printf '[doctor-systemd] %s\n' "$*"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --project-root)
        PROJECT_ROOT="${2:-}"; shift 2 ;;
      --env-file)
        ENV_FILE="${2:-}"; shift 2 ;;
      --token-file)
        TOKEN_FILE="${2:-}"; shift 2 ;;
      --backend-url)
        BACKEND_URL="${2:-}"; shift 2 ;;
      --max-token-age-seconds)
        MAX_TOKEN_AGE_SECONDS="${2:-}"; shift 2 ;;
      --scrape-test)
        RUN_SCRAPE_TEST=1; shift ;;
      --skip-systemd)
        SKIP_SYSTEMD=1; shift ;;
      --auto-fix)
        AUTO_FIX=1; shift ;;
      --service-user)
        SERVICE_USER="${2:-}"; shift 2 ;;
      --service-group)
        SERVICE_GROUP="${2:-}"; shift 2 ;;
      --prom-email)
        PROM_EMAIL="${2:-}"; shift 2 ;;
      --prom-password)
        PROM_PASSWORD="${2:-}"; shift 2 ;;
      --no-enable)
        NO_ENABLE=1; shift ;;
      --no-run-once)
        NO_RUN_ONCE=1; shift ;;
      --dry-run)
        DRY_RUN=1; shift ;;
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
  if [[ ! -f "${CHECK_SCRIPT}" ]]; then
    log "Missing check script: ${CHECK_SCRIPT}"
    exit 1
  fi
  if [[ ! -f "${INSTALL_SCRIPT}" ]]; then
    log "Missing install script: ${INSTALL_SCRIPT}"
    exit 1
  fi

  if ! [[ "${MAX_TOKEN_AGE_SECONDS}" =~ ^[0-9]+$ ]]; then
    log "--max-token-age-seconds must be an integer."
    exit 1
  fi

  if [[ -z "${PROJECT_ROOT}" || ! -d "${PROJECT_ROOT}" ]]; then
    log "Invalid --project-root: ${PROJECT_ROOT}"
    exit 1
  fi
  PROJECT_ROOT="$(cd "${PROJECT_ROOT}" && pwd)"

  if [[ "${AUTO_FIX}" -eq 1 && "${DRY_RUN}" -eq 0 && "${EUID}" -ne 0 ]]; then
    log "--auto-fix requires root privileges (run with sudo), or use --dry-run."
    exit 1
  fi
}

run_health_check() {
  local args
  args=(
    --env-file "${ENV_FILE}"
    --token-file "${TOKEN_FILE}"
    --max-token-age-seconds "${MAX_TOKEN_AGE_SECONDS}"
  )
  if [[ -n "${BACKEND_URL}" ]]; then
    args+=(--backend-url "${BACKEND_URL}")
  fi
  if [[ "${RUN_SCRAPE_TEST}" -eq 1 ]]; then
    args+=(--scrape-test)
  fi
  if [[ "${SKIP_SYSTEMD}" -eq 1 ]]; then
    args+=(--skip-systemd)
  fi
  if [[ "${QUIET}" -eq 1 ]]; then
    args+=(--quiet)
  fi

  log "Running health check..."
  if "${CHECK_SCRIPT}" "${args[@]}"; then
    log "Health check passed."
    return 0
  fi

  log "Health check failed."
  return 1
}

run_auto_fix_install() {
  local args
  args=(
    --project-root "${PROJECT_ROOT}"
    --env-file "${ENV_FILE}"
    --token-file "${TOKEN_FILE}"
    --service-user "${SERVICE_USER}"
    --service-group "${SERVICE_GROUP}"
  )

  if [[ -n "${BACKEND_URL}" ]]; then
    args+=(--backend-url "${BACKEND_URL}")
  fi
  if [[ -n "${PROM_EMAIL}" ]]; then
    args+=(--prom-email "${PROM_EMAIL}")
  fi
  if [[ -n "${PROM_PASSWORD}" ]]; then
    args+=(--prom-password "${PROM_PASSWORD}")
  fi
  if [[ "${NO_ENABLE}" -eq 1 ]]; then
    args+=(--no-enable)
  fi
  if [[ "${NO_RUN_ONCE}" -eq 1 ]]; then
    args+=(--no-run-once)
  fi
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    args+=(--dry-run)
  fi

  log "Running auto-fix installer..."
  "${INSTALL_SCRIPT}" "${args[@]}"
}

main() {
  parse_args "$@"
  validate_inputs

  if run_health_check; then
    exit 0
  fi

  if [[ "${AUTO_FIX}" -ne 1 ]]; then
    log "Run again with --auto-fix to apply installer remediation."
    exit 1
  fi

  run_auto_fix_install

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "Auto-fix dry-run complete. Re-run without --dry-run to apply fixes."
    exit 1
  fi

  log "Re-running health check after auto-fix..."
  if run_health_check; then
    exit 0
  fi

  log "Auto-fix completed but some checks still failed."
  exit 1
}

main "$@"
