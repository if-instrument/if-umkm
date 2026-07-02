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

echo "Menjalankan IF Instrument UMKM Solution"
echo "URL lokal : http://127.0.0.1:${PORT}"
echo "Bind     : ${HOST}:${PORT}"
echo

exec "$PHP_BIN" spark serve --host "$HOST" --port "$PORT"
