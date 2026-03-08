#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

SERVICE_TEMPLATE="${SCRIPT_DIR}/mrsm-prometheus-token-refresh.service"
TIMER_TEMPLATE="${SCRIPT_DIR}/mrsm-prometheus-token-refresh.timer"
ENV_TEMPLATE="${SCRIPT_DIR}/mrsm-token.env.example"

SYSTEMD_DIR="/etc/systemd/system"
SERVICE_DEST="${SYSTEMD_DIR}/mrsm-prometheus-token-refresh.service"
TIMER_DEST="${SYSTEMD_DIR}/mrsm-prometheus-token-refresh.timer"

PROJECT_ROOT="${DEFAULT_PROJECT_ROOT}"
SERVICE_USER="prometheus"
SERVICE_GROUP="prometheus"
ENV_FILE="/etc/prometheus/secrets/mrsm-token.env"
TOKEN_FILE="/etc/prometheus/secrets/mrsm_token.txt"
BACKEND_BASE_URL="http://localhost:8000"
PROM_EMAIL=""
PROM_PASSWORD=""
ENABLE_NOW=1
RUN_ONESHOT=1
DRY_RUN=0

usage() {
  cat <<'EOF'
Install MRSM Prometheus token refresh systemd units.

Usage:
  install_mrsm_prometheus_token_timer.sh [options]

Options:
  --project-root PATH       Project root path (default: auto-detect)
  --service-user USER       systemd User for service (default: prometheus)
  --service-group GROUP     systemd Group for service (default: prometheus)
  --env-file PATH           Env file path for token refresh script
                            (default: /etc/prometheus/secrets/mrsm-token.env)
  --token-file PATH         Token output file in env content
                            (default: /etc/prometheus/secrets/mrsm_token.txt)
  --backend-url URL         Backend base URL in env content
                            (default: http://localhost:8000)
  --prom-email EMAIL        Auth email for token refresh env content
  --prom-password PASSWORD  Auth password for token refresh env content
  --no-enable               Install unit files only (do not enable/start timer)
  --no-run-once             Do not run oneshot service immediately after install
  --dry-run                 Print actions without applying changes
  -h, --help                Show this help

Examples:
  sudo ./install_mrsm_prometheus_token_timer.sh \
    --project-root /opt/yuranmrsmV2 \
    --prom-email superadmin@muafakat.link \
    --prom-password 'your-strong-password'

  sudo ./install_mrsm_prometheus_token_timer.sh --no-enable
EOF
}

log() {
  printf '[install-systemd] %s\n' "$*"
}

run_cmd() {
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "DRY-RUN: $*"
    return 0
  fi
  "$@"
}

require_file() {
  local path="$1"
  if [[ ! -f "${path}" ]]; then
    log "Missing required file: ${path}"
    exit 1
  fi
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
      --project-root)
        PROJECT_ROOT="${2:-}"; shift 2 ;;
      --service-user)
        SERVICE_USER="${2:-}"; shift 2 ;;
      --service-group)
        SERVICE_GROUP="${2:-}"; shift 2 ;;
      --env-file)
        ENV_FILE="${2:-}"; shift 2 ;;
      --token-file)
        TOKEN_FILE="${2:-}"; shift 2 ;;
      --backend-url)
        BACKEND_BASE_URL="${2:-}"; shift 2 ;;
      --prom-email)
        PROM_EMAIL="${2:-}"; shift 2 ;;
      --prom-password)
        PROM_PASSWORD="${2:-}"; shift 2 ;;
      --no-enable)
        ENABLE_NOW=0; shift ;;
      --no-run-once)
        RUN_ONESHOT=0; shift ;;
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
  require_file "${SERVICE_TEMPLATE}"
  require_file "${TIMER_TEMPLATE}"
  require_file "${ENV_TEMPLATE}"

  if [[ -z "${PROJECT_ROOT}" || ! -d "${PROJECT_ROOT}" ]]; then
    log "Invalid --project-root: ${PROJECT_ROOT}"
    exit 1
  fi
  PROJECT_ROOT="$(cd "${PROJECT_ROOT}" && pwd)"

  if [[ -z "${SERVICE_USER}" || -z "${SERVICE_GROUP}" ]]; then
    log "--service-user and --service-group cannot be empty."
    exit 1
  fi
  if [[ -z "${ENV_FILE}" || -z "${TOKEN_FILE}" || -z "${BACKEND_BASE_URL}" ]]; then
    log "--env-file, --token-file, and --backend-url cannot be empty."
    exit 1
  fi
}

create_or_update_env_file() {
  local env_dir
  env_dir="$(dirname "${ENV_FILE}")"
  run_cmd mkdir -p "${env_dir}"

  if [[ -f "${ENV_FILE}" ]]; then
    log "Env file already exists, preserving: ${ENV_FILE}"
    return 0
  fi

  local final_email final_password
  final_email="${PROM_EMAIL:-superadmin@muafakat.link}"
  final_password="${PROM_PASSWORD:-change-this-password}"

  if [[ -z "${PROM_EMAIL}" || -z "${PROM_PASSWORD}" ]]; then
    log "PROM_EMAIL/PROM_PASSWORD not provided. Creating env with placeholders."
    log "Timer will not auto-start until credentials are updated."
    ENABLE_NOW=0
    RUN_ONESHOT=0
  fi

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "DRY-RUN: create env file ${ENV_FILE} with configured values"
    return 0
  fi

  cat > "${ENV_FILE}" <<EOF
BACKEND_BASE_URL=${BACKEND_BASE_URL}
PROM_EMAIL=${final_email}
PROM_PASSWORD=${final_password}
TOKEN_FILE=${TOKEN_FILE}
EOF
  chmod 600 "${ENV_FILE}"
  log "Created env file: ${ENV_FILE}"
}

render_service_unit() {
  local tmp_file
  tmp_file="$(mktemp)"
  cp "${SERVICE_TEMPLATE}" "${tmp_file}"

  sed -i.bak \
    -e "s|<PROJECT_ROOT>|${PROJECT_ROOT}|g" \
    -e "s|^User=.*|User=${SERVICE_USER}|g" \
    -e "s|^Group=.*|Group=${SERVICE_GROUP}|g" \
    -e "s|^Environment=PROM_TOKEN_ENV_FILE=.*|Environment=PROM_TOKEN_ENV_FILE=${ENV_FILE}|g" \
    "${tmp_file}"
  rm -f "${tmp_file}.bak"

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "DRY-RUN: install service file -> ${SERVICE_DEST}"
    rm -f "${tmp_file}"
    return 0
  fi

  install -m 0644 "${tmp_file}" "${SERVICE_DEST}"
  rm -f "${tmp_file}"
  log "Installed service: ${SERVICE_DEST}"
}

install_timer_unit() {
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    log "DRY-RUN: install timer file -> ${TIMER_DEST}"
    return 0
  fi
  install -m 0644 "${TIMER_TEMPLATE}" "${TIMER_DEST}"
  log "Installed timer: ${TIMER_DEST}"
}

reload_and_enable() {
  run_cmd systemctl daemon-reload

  if [[ "${ENABLE_NOW}" -eq 1 ]]; then
    run_cmd systemctl enable --now mrsm-prometheus-token-refresh.timer
    log "Enabled and started timer: mrsm-prometheus-token-refresh.timer"
  else
    log "Skipped enable/start timer (--no-enable or placeholder env)."
  fi

  if [[ "${RUN_ONESHOT}" -eq 1 ]]; then
    run_cmd systemctl start mrsm-prometheus-token-refresh.service
    log "Ran oneshot refresh service once."
  else
    log "Skipped oneshot execution (--no-run-once or placeholder env)."
  fi
}

print_next_steps() {
  cat <<EOF

Done.

Useful commands:
  sudo systemctl status mrsm-prometheus-token-refresh.timer --no-pager
  sudo journalctl -u mrsm-prometheus-token-refresh.service -n 50 --no-pager
  sudo systemctl start mrsm-prometheus-token-refresh.service

Current settings:
  PROJECT_ROOT=${PROJECT_ROOT}
  ENV_FILE=${ENV_FILE}
  TOKEN_FILE=${TOKEN_FILE}
  SERVICE_USER=${SERVICE_USER}
  SERVICE_GROUP=${SERVICE_GROUP}
EOF
}

main() {
  parse_args "$@"
  validate_inputs
  require_root_if_needed

  create_or_update_env_file
  render_service_unit
  install_timer_unit
  reload_and_enable
  print_next_steps
}

main "$@"
