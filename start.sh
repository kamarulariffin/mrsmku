#!/bin/bash
# Jalankan backend + frontend dengan satu command.
# Pastikan PostgreSQL sudah running: brew services start postgresql@18

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
BACKEND_PID=""
cleanup() {
  if [[ -n "$BACKEND_PID" ]]; then
    echo ""
    echo "Menghentikan backend (PID $BACKEND_PID)..."
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "==> Starting backend..."
(cd backend && ./run_server.sh) &
BACKEND_PID=$!
sleep 3
echo "==> Starting frontend (buka http://localhost:3000)..."
(cd frontend && npm start)
