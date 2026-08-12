#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AI_DIR="$ROOT_DIR/ai-service"

echo "== POS AI Microservice Setup =="
echo "Directory: $AI_DIR"

if [[ ! -d "$AI_DIR" ]]; then
  echo "Error: Directory ai-service tidak ditemukan!" >&2
  exit 1
fi

cd "$AI_DIR"

# 1. Detect Python 3
PYTHON_BIN=""
if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
else
  echo "Error: Python 3 tidak ditemukan. Silakan install Python 3.10+ terlebih dahulu." >&2
  exit 1
fi

echo "Menggunakan Python: $($PYTHON_BIN --version)"

# 2. Copy .env.example if .env does not exist
if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
    echo "Membuat ai-service/.env dari ai-service/.env.example"
  fi
fi

# 3. Create Python Virtual Environment if not exists
if [[ ! -d venv ]]; then
  echo "Membuat Virtual Environment di ai-service/venv..."
  $PYTHON_BIN -m venv venv
fi

# 4. Install dependencies
VENV_PYTHON="$AI_DIR/venv/bin/python"
VENV_PIP="$AI_DIR/venv/bin/pip"

if [[ -f "$VENV_PIP" ]]; then
  echo "Menginstall / mengupdate dependensi AI Microservice..."
  "$VENV_PIP" install --upgrade pip setuptools wheel --quiet
  if [[ -f requirements.txt ]]; then
    "$VENV_PIP" install -r requirements.txt
  fi
fi

echo
echo "✓ AI Microservice Setup Selesai!"
echo "Untuk menjalankan AI Microservice:"
echo "  scripts/run-ai-service.sh"
echo "  atau cd ai-service && source venv/bin/activate && python3 -m app.main"
