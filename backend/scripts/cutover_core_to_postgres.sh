#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

RUN_RECONCILE_RUNTIME=0
RECONCILE_PRUNE=0
ENABLE_LOG_FILE=1
CUSTOM_LOG_FILE=""

usage() {
  cat <<'EOF'
Penggunaan:
  ./scripts/cutover_core_to_postgres.sh [opsyen]

Opsyen:
  --reconcile-runtime         Sync koleksi runtime divergence dari PostgreSQL -> Mongo
  --reconcile-runtime-prune   Sama seperti --reconcile-runtime, tetapi padam extra docs di target
  --log-file <path>           Simpan output ke fail log tertentu
  --no-log-file               Matikan penulisan fail log
  -h, --help                  Papar bantuan
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --reconcile-runtime)
      RUN_RECONCILE_RUNTIME=1
      shift
      ;;
    --reconcile-runtime-prune)
      RUN_RECONCILE_RUNTIME=1
      RECONCILE_PRUNE=1
      shift
      ;;
    --log-file)
      if [[ $# -lt 2 ]]; then
        echo "Opsyen --log-file memerlukan path."
        usage
        exit 1
      fi
      CUSTOM_LOG_FILE="$2"
      shift 2
      ;;
    --no-log-file)
      ENABLE_LOG_FILE=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Argumen tidak dikenali: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ "$ENABLE_LOG_FILE" -eq 1 ]]; then
  TIMESTAMP_UTC="$(date -u +"%Y%m%dT%H%M%SZ")"
  LOG_DIR="$ROOT_DIR/logs"
  mkdir -p "$LOG_DIR"

  if [[ -n "$CUSTOM_LOG_FILE" ]]; then
    LOG_FILE="$CUSTOM_LOG_FILE"
    mkdir -p "$(dirname "$LOG_FILE")"
  else
    LOG_FILE="$LOG_DIR/cutover_${TIMESTAMP_UTC}.log"
  fi

  if { : > >(cat >/dev/null); } 2>/dev/null; then
    exec > >(tee -a "$LOG_FILE") 2>&1
    echo "==> Log cutover disimpan di: $LOG_FILE"
  else
    # Fallback for restricted environments where /dev/fd process substitution is blocked.
    exec >>"$LOG_FILE" 2>&1
    echo "==> Log cutover disimpan di: $LOG_FILE (fallback log-only mode)"
  fi
fi

echo "==> Menjalankan ETL MongoDB -> PostgreSQL (core collections)..."
./venv/bin/python scripts/migrate_core_to_postgres.py --truncate

if [[ "$RUN_RECONCILE_RUNTIME" -eq 1 ]]; then
  echo "==> Menjalankan reconcile runtime divergence (PostgreSQL -> Mongo)..."
  RECONCILE_COLLECTIONS=(
    notifications
    audit_logs
    student_yuran
    yuran_payments
    accounting_categories
    accounting_transactions
    accounting_audit_logs
    accounting_journal_entries
    accounting_journal_lines
    tabung_campaigns
    tabung_donations
    financial_ledger
  )
  RECONCILE_CMD=(
    ./venv/bin/python
    scripts/reconcile_core_divergence.py
    --source
    postgres
    --collections
  )
  RECONCILE_CMD+=("${RECONCILE_COLLECTIONS[@]}")
  RECONCILE_CMD+=(--execute)
  if [[ "$RECONCILE_PRUNE" -eq 1 ]]; then
    RECONCILE_CMD+=(--prune-target)
  fi
  "${RECONCILE_CMD[@]}"
fi

echo "==> Menjalankan semakan parity..."
./venv/bin/python scripts/verify_core_parity.py

echo "==> Parity OK. Anda boleh mula backend dalam mode hybrid:"
echo "    DB_ENGINE=hybrid ./run_server.sh"
echo
echo "Jika semua modul core stabil, anda boleh uji mode postgres:"
echo "    DB_ENGINE=postgres ./run_server.sh"

