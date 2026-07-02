#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  cat <<'USAGE'
IF Instrument UMKM Solution - setup server baru

Usage:
  scripts/setup-server.sh [options]

Options:
  --fresh              Reset database pusat lalu seed hanya Super Admin SaaS.
                       Gunakan hanya untuk server/database baru.
  --skip-composer      Lewati composer install.
  --skip-db-create     Lewati pembuatan database MySQL.
  --skip-migrate       Lewati migration.
  -h, --help           Tampilkan bantuan.

Environment yang bisa diisi:
  PHP_BIN              Default auto-detect php83 lalu php.
  COMPOSER_BIN         Default composer.
  APP_URL              Default http://localhost:8081/
  DB_HOST              Default localhost
  DB_NAME              Default if_instrument_umkm
  DB_USER              Default root
  DB_PASS              Default kosong
  DB_PORT              Default 3306
  CI_ENVIRONMENT       Default production

Contoh:
  DB_USER=root DB_PASS='password' APP_URL='https://app.domain.com/' scripts/setup-server.sh --fresh
USAGE
}

FRESH=0
SKIP_COMPOSER=0
SKIP_DB_CREATE=0
SKIP_MIGRATE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fresh)
      FRESH=1
      shift
      ;;
    --skip-composer)
      SKIP_COMPOSER=1
      shift
      ;;
    --skip-db-create)
      SKIP_DB_CREATE=1
      shift
      ;;
    --skip-migrate)
      SKIP_MIGRATE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Option tidak dikenal: $1" >&2
      usage
      exit 1
      ;;
  esac
done

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
COMPOSER_BIN="${COMPOSER_BIN:-composer}"
APP_URL="${APP_URL:-http://localhost:8081/}"
DB_HOST="${DB_HOST:-localhost}"
DB_NAME="${DB_NAME:-if_instrument_umkm}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASS:-}"
DB_PORT="${DB_PORT:-3306}"
CI_ENVIRONMENT="${CI_ENVIRONMENT:-production}"

echo "== IF Instrument UMKM Solution setup =="
echo "Project     : $ROOT_DIR"
echo "PHP         : $PHP_BIN"
echo "Environment : $CI_ENVIRONMENT"
echo "App URL     : $APP_URL"
echo "Database    : $DB_HOST:$DB_PORT/$DB_NAME"

PHP_VERSION="$("$PHP_BIN" -r 'echo PHP_VERSION;')"
"$PHP_BIN" -r 'exit(version_compare(PHP_VERSION, "8.2.0", ">=") ? 0 : 1);' || {
  echo "PHP minimal 8.2. Versi saat ini: $PHP_VERSION" >&2
  exit 1
}

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Membuat .env dari .env.example"
fi

TMP_ENV="$(mktemp)"
awk '
  /^# BEGIN IF_INSTRUMENT_SERVER_SETUP$/ { skip = 1; next }
  /^# END IF_INSTRUMENT_SERVER_SETUP$/ { skip = 0; next }
  skip != 1 { print }
' .env > "$TMP_ENV"
cat >> "$TMP_ENV" <<EOF

# BEGIN IF_INSTRUMENT_SERVER_SETUP
CI_ENVIRONMENT = ${CI_ENVIRONMENT}
app.baseURL = '${APP_URL}'
app.indexPage = ''

database.default.hostname = ${DB_HOST}
database.default.database = ${DB_NAME}
database.default.username = ${DB_USER}
database.default.password = ${DB_PASS}
database.default.DBDriver = MySQLi
database.default.DBPrefix =
database.default.port = ${DB_PORT}
# END IF_INSTRUMENT_SERVER_SETUP
EOF
mv "$TMP_ENV" .env

mkdir -p writable/cache writable/debugbar writable/logs writable/session writable/uploads public/uploads
chmod -R ug+rw writable public/uploads

if [[ "$SKIP_COMPOSER" -eq 0 ]]; then
  if command -v "$COMPOSER_BIN" >/dev/null 2>&1; then
    echo "Menjalankan composer install..."
    "$COMPOSER_BIN" install --no-dev --optimize-autoloader
  else
    echo "Composer tidak ditemukan, lewati composer install. Set COMPOSER_BIN jika path berbeda." >&2
  fi
fi

if [[ "$SKIP_DB_CREATE" -eq 0 ]]; then
  if command -v mysql >/dev/null 2>&1; then
    echo "Membuat database pusat jika belum ada..."
    MYSQL_PWD="$DB_PASS" mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" \
      -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  else
    echo "mysql CLI tidak ditemukan, lewati create database. Pastikan database $DB_NAME sudah dibuat." >&2
  fi
fi

if grep -Eq '^encryption\.key[[:space:]]*=[[:space:]]*$' .env; then
  echo "Generate encryption key..."
  "$PHP_BIN" spark key:generate
fi

if [[ "$SKIP_MIGRATE" -eq 0 ]]; then
  echo "Menjalankan migration database pusat..."
  "$PHP_BIN" spark migrate
fi

if [[ "$FRESH" -eq 1 ]]; then
  echo "Fresh seed aktif: reset database pusat dan seed Super Admin SaaS..."
  "$PHP_BIN" spark db:seed DemoSeeder
fi

echo
echo "Setup selesai."
echo "Login awal jika memakai --fresh:"
echo "  Email    : superadmin@app.test"
echo "  Password : super123"
echo
echo "Jalankan built-in server:"
echo "  scripts/run-server.sh"
echo
echo "Untuk production, arahkan web server ke folder public/."
