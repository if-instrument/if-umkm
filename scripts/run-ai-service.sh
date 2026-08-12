#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AI_DIR="$ROOT_DIR/ai-service"

cd "$AI_DIR"

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"

# Auto-provision virtual environment if missing
if [[ ! -d "$AI_DIR/venv" ]]; then
  echo "Membuat Virtual Environment di ai-service/venv..."
  python3 -m venv "$AI_DIR/venv"
fi

PYTHON_EXEC="$AI_DIR/venv/bin/python"
PIP_EXEC="$AI_DIR/venv/bin/pip"

if [[ ! -f "$PYTHON_EXEC" ]]; then
  PYTHON_EXEC="python3"
  PIP_EXEC="pip3"
fi

# Auto install missing packages
if ! "$PYTHON_EXEC" -c "import pymysql, fastapi, uvicorn" 2>/dev/null; then
  echo "Menginstall dependensi AI Microservice (pymysql, fastapi)..."
  "$PIP_EXEC" install -r requirements.txt --quiet
fi

echo "=================================================="
echo "Menjalankan POS AI Microservice (Python)"
echo "Host: $HOST"
echo "Port: $PORT"
echo "URL : http://$HOST:$PORT"
echo "=================================================="

exec "$PYTHON_EXEC" -m app.main
