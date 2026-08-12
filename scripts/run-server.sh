#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

detect_php() {
  if [[ -n "${PHP_BIN:-}" ]]; then
    echo "$PHP_BIN"
    return
  fi
  if command -v php83 >/dev/null 2>&1; then
    echo "php83"
    return
  fi
  if command -v php >/dev/null 2>&1; then
    echo "php"
    return
  fi
  echo "PHP tidak ditemukan. Install PHP 8.2+ atau set PHP_BIN." >&2
  exit 1
}

PHP_BIN="$(detect_php)"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8081}"

AI_PID=""
cleanup() {
  if [[ -n "$AI_PID" ]]; then
    echo
    echo "Menghentikan AI Microservice (PID: $AI_PID)..."
    kill "$AI_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if [[ -f scripts/run-ai-service.sh ]]; then
  echo "Menjalankan AI Microservice (Python) di background..."
  scripts/run-ai-service.sh &
  AI_PID=$!
  sleep 1
fi

echo "=================================================="
echo "Menjalankan IF Instrument UMKM Solution"
echo "URL Aplikasi POS : http://127.0.0.1:${PORT}"
echo "URL AI Microservice: http://127.0.0.1:8000"
echo "Bind            : ${HOST}:${PORT}"
echo "=================================================="
echo

"$PHP_BIN" spark serve --host "$HOST" --port "$PORT"
