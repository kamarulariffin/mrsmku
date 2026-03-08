#!/bin/bash
# Jalankan backend API (MRSMKU Portal) - default PostgreSQL-only mode.

cd "$(dirname "$0")"

# Optional: mode boleh dihantar sebagai argumen pertama.
# Contoh:
#   ./run_server.sh postgres
#   ./run_server.sh hybrid
#   ./run_server.sh mongo
if [[ -n "${1:-}" ]]; then
  export DB_ENGINE="$1"
fi
export DB_ENGINE="${DB_ENGINE:-postgres}"

# Guna port 8001 jika 8000 sudah digunakan
if lsof -i :8000 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "Port 8000 sedang digunakan. Gunakan port 8001."
  echo "Frontend: set REACT_APP_BACKEND_URL=http://localhost:8001 dalam .env"
  PORT=8001
else
  PORT=8000
fi

echo "Starting backend pada http://localhost:$PORT"
echo "API docs: http://localhost:$PORT/docs"
echo "DB_ENGINE=$DB_ENGINE"
if [[ "$DB_ENGINE" == "postgres" ]]; then
  echo "PostgreSQL-only mode aktif (semua koleksi melalui PostgreSQL)."
elif [[ "$DB_ENGINE" == "hybrid" ]]; then
  echo "Hybrid mode aktif (PostgreSQL + Mongo compatibility)."
fi
exec ./venv/bin/uvicorn server:app --reload --host 0.0.0.0 --port "$PORT"
