#!/usr/bin/env bash
set -euo pipefail

SYSTEMD_DIR="/etc/systemd/system"
SERVICE_UNIT="mrsm-prometheus-token-refresh.service"
TIMER_UNIT="mrsm-prometheus-token-refresh.timer"
SERVICE_PATH="${SYSTEMD_DIR}/${SERVICE_UNIT}"
TIMER_PATH="${SYSTEMD_DIR}/${TIMER_UNIT}"

ENV_FILE="/etc/prometheus/secrets/mrsm-token.env"
TOKEN_FILE="/etc/prometheus/secrets/mrsm_token.txt"
REMOVE_ENV=0
REMOVE_TOKEN=0
DRY_RUN=0

usage() {
  cat <<'EOF'
Uninstall MRSM Prometheus token refresh systemd units.

Usage:
  uninstall_mrsm_prometheus_token_timer.sh [options]

Options:
  --env-file PATH       Env file path (default: /etc/prometheus/secrets/mrsm-token.env)
  --token-file PATH     Token file path (default: /etc/prometheus/secrets/mrsm_token.txt)
  --remove-env          Remove env file after uninstall
  --remove-token        Remove token file after uninstall
  --remove-secrets      Remove both env + token files
  --dry-run             Print actions without applying changes
  -h, --help            Show this help

Examples:
  sudo ./uninstall_mrsm_prometheus_token_timer.sh
  sudo ./uninstall_mrsm_prometheus_token_timer.sh --remove-secrets
EOF
}

log() {
  printf '[uninstall-systemd] %s\n' "$*"
}

run_cmd() {
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "DRY-RUN: $*"
    return 0
  fi
  "$@"
}

run_best_effort() {
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "DRY-RUN: $*"
    return 0
  fi
  "$@" >/dev/null 2>&1 || true
}

require_root_if_needed() {
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    return 0
  fi
  if [[ "${EUID}" -ne 0 ]]; then
    log "Please run as root (use sudo), or add --dry-run."
    exit 1
  fi
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --env-file)
        ENV_FILE="${2:-}"; shift 2 ;;
      --token-file)
        TOKEN_FILE="${2:-}"; shift 2 ;;
      --remove-env)
        REMOVE_ENV=1; shift ;;
      --remove-token)
        REMOVE_TOKEN=1; shift ;;
      --remove-secrets)
        REMOVE_ENV=1; REMOVE_TOKEN=1; shift ;;
      --dry-run)
        DRY_RUN=1; shift ;;
      -h|--help)
        usage; exit 0 ;;
      *)
        log "Unknown option: $1"
        usage
        exit 1 ;;
    esac
  done
}

validate_inputs() {
  if [[ -z "${ENV_FILE}" || -z "${TOKEN_FILE}" ]]; then
    log "--env-file and --token-file cannot be empty."
    exit 1
  fi
}

disable_and_stop_units() {
  run_best_effort systemctl disable --now "${TIMER_UNIT}"
  run_best_effort systemctl stop "${TIMER_UNIT}"
  run_best_effort systemctl disable --now "${SERVICE_UNIT}"
  run_best_effort systemctl stop "${SERVICE_UNIT}"
}

remove_unit_files() {
  if [[ -f "${SERVICE_PATH}" ]]; then
    run_cmd rm -f "${SERVICE_PATH}"
    log "Removed ${SERVICE_PATH}"
  else
    log "Skip (not found): ${SERVICE_PATH}"
  fi

  if [[ -f "${TIMER_PATH}" ]]; then
    run_cmd rm -f "${TIMER_PATH}"
    log "Removed ${TIMER_PATH}"
  else
    log "Skip (not found): ${TIMER_PATH}"
  fi
}

reload_systemd() {
  run_cmd systemctl daemon-reload
  run_best_effort systemctl reset-failed "${SERVICE_UNIT}"
  run_best_effort systemctl reset-failed "${TIMER_UNIT}"
}

remove_secrets_if_requested() {
  if [[ "${REMOVE_ENV}" -eq 1 ]]; then
    if [[ -f "${ENV_FILE}" ]]; then
      run_cmd rm -f "${ENV_FILE}"
      log "Removed env file: ${ENV_FILE}"
    else
      log "Skip env remove (not found): ${ENV_FILE}"
    fi
  fi

  if [[ "${REMOVE_TOKEN}" -eq 1 ]]; then
    if [[ -f "${TOKEN_FILE}" ]]; then
      run_cmd rm -f "${TOKEN_FILE}"
      log "Removed token file: ${TOKEN_FILE}"
    else
      log "Skip token remove (not found): ${TOKEN_FILE}"
    fi
  fi
}

print_summary() {
  cat <<EOF

Done.

Removed units:
  ${SERVICE_UNIT}
  ${TIMER_UNIT}

Secrets:
  ENV_FILE=${ENV_FILE} (removed=${REMOVE_ENV})
  TOKEN_FILE=${TOKEN_FILE} (removed=${REMOVE_TOKEN})
EOF
}

main() {
  parse_args "$@"
  validate_inputs
  require_root_if_needed

  disable_and_stop_units
  remove_unit_files
  reload_systemd
  remove_secrets_if_requested
  print_summary
}

main "$@"
