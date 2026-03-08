#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_DIR="${SCRIPT_DIR}/reports"
SHOW_LOG_PATHS=1

usage() {
  cat <<'EOF'
Open and display the latest MRSM Prometheus audit summary report.

Usage:
  open_latest_mrsm_prometheus_report.sh [options]

Options:
  --report-dir PATH      Report directory (default: backend/deploy/systemd/reports)
  --no-log-paths         Show summary only
  -h, --help             Show this help

Examples:
  ./open_latest_mrsm_prometheus_report.sh
  ./open_latest_mrsm_prometheus_report.sh --report-dir /var/log/mrsm/prom-audit
EOF
}

log() {
  printf '[prom-report-open] %s\n' "$*"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --report-dir)
        REPORT_DIR="${2:-}"; shift 2 ;;
      --no-log-paths)
        SHOW_LOG_PATHS=0; shift ;;
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

find_latest_summary() {
  python3 - <<'PY'
from pathlib import Path

import os

report_dir = Path(os.environ["REPORT_DIR_PATH"])
if not report_dir.exists() or not report_dir.is_dir():
    print("", end="")
    raise SystemExit(0)

files = sorted(
    report_dir.glob("prom_audit_*_summary.txt"),
    key=lambda p: p.stat().st_mtime,
    reverse=True,
)
print(str(files[0]) if files else "", end="")
PY
}

main() {
  parse_args "$@"

  if [[ ! -d "${REPORT_DIR}" ]]; then
    log "Report directory not found: ${REPORT_DIR}"
    exit 1
  fi

  local latest_summary
  latest_summary="$(REPORT_DIR_PATH="${REPORT_DIR}" find_latest_summary)"
  if [[ -z "${latest_summary}" ]]; then
    log "No summary report found in ${REPORT_DIR}"
    exit 1
  fi

  log "Latest summary file: ${latest_summary}"
  printf '\n'
  cat "${latest_summary}"
  printf '\n'

  if [[ "${SHOW_LOG_PATHS}" -eq 1 ]]; then
    printf '\nLinked logs:\n'
    SUMMARY_PATH="${latest_summary}" python3 - <<'PY'
from pathlib import Path

import os

summary_path = Path(os.environ["SUMMARY_PATH"])
pairs = {}
for line in summary_path.read_text(encoding="utf-8").splitlines():
    if "=" not in line:
        continue
    k, v = line.split("=", 1)
    pairs[k.strip()] = v.strip()

for key in ("check_log", "status_log", "doctor_log"):
    value = pairs.get(key, "")
    if not value:
        print(f"- {key}: <missing>")
        continue
    p = Path(value)
    if p.exists():
        try:
            size = p.stat().st_size
        except OSError:
            size = -1
        print(f"- {key}: {value} (exists, {size} bytes)")
    else:
        print(f"- {key}: {value} (missing)")
PY
    printf '\n'
  fi
}

main "$@"
