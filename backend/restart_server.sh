#!/bin/bash
# Restart backend API: hentikan proses pada port 8000/8001, kemudian start semula.
# Guna bila server hang atau anda mahu muat semula tanpa menutup terminal.

cd "$(dirname "$0")"

PORT_8000_PID=""
PORT_8001_PID=""
if command -v lsof >/dev/null 2>&1; then
  PORT_8000_PID=$(lsof -ti :8000 -sTCP:LISTEN 2>/dev/null)
  PORT_8001_PID=$(lsof -ti :8001 -sTCP:LISTEN 2>/dev/null)
fi

if [[ -n "$PORT_8000_PID" ]]; then
  echo "Menghentikan backend pada port 8000 (PID $PORT_8000_PID)..."
  kill $PORT_8000_PID 2>/dev/null || true
  sleep 1
fi
if [[ -n "$PORT_8001_PID" ]]; then
  echo "Menghentikan backend pada port 8001 (PID $PORT_8001_PID)..."
  kill $PORT_8001_PID 2>/dev/null || true
  sleep 1
fi

if [[ -z "$PORT_8000_PID" && -z "$PORT_8001_PID" ]]; then
  echo "Tiada proses backend ditemui pada port 8000/8001. Memulakan server..."
fi

echo "Memulakan backend..."
exec ./run_server.sh
