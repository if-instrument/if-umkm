#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'USAGE'
IF Instrument UMKM Solution - generator config web server

Usage:
  scripts/webserver-config.sh --server apache|nginx --mode direct|proxy --domain domain.com [options]

Shortcut:
  scripts/webserver-config.sh apache direct domain.com
  scripts/webserver-config.sh apache proxy domain.com
  scripts/webserver-config.sh nginx direct domain.com
  scripts/webserver-config.sh nginx proxy domain.com

Options:
  --server apache|nginx       Web server yang dipakai.
  --mode direct|proxy         direct = document root ke public/; proxy = reverse proxy ke app service.
  --domain DOMAIN             Domain/subdomain.
  --project-dir PATH          Default: folder project saat ini.
  --port PORT                 Default: 8081 untuk mode proxy.
  --proxy-host HOST           Default: 127.0.0.1 untuk mode proxy.
  --php-fpm TARGET            Default: unix:/run/php/php8.3-fpm.sock untuk nginx direct.
  --https                     Set header/proto HTTPS pada mode proxy.
  --output FILE               Simpan config ke file. Jika kosong, config dicetak ke layar.
  -h, --help                  Tampilkan bantuan.

Contoh:
  scripts/webserver-config.sh apache direct app.domain.com --project-dir /var/www/if-instrument --output if-instrument.conf
  scripts/webserver-config.sh nginx proxy app.domain.com --port 8081 --https

Catatan:
  - Mode direct lebih disarankan untuk production besar.
  - Mode proxy cocok untuk staging/demo atau app service di belakang Apache/Nginx.
USAGE
}

SERVER="${1:-}"
MODE="${2:-}"
DOMAIN="${3:-}"

if [[ "$SERVER" == "--help" || "$SERVER" == "-h" ]]; then
  usage
  exit 0
fi

if [[ "$SERVER" == --* ]]; then
  SERVER=""
  MODE=""
  DOMAIN=""
fi

PROJECT_DIR="$ROOT_DIR"
PORT="8081"
PROXY_HOST="127.0.0.1"
PHP_FPM="unix:/run/php/php8.3-fpm.sock"
HTTPS=0
OUTPUT=""

if [[ $# -gt 0 && "${1:-}" != --* ]]; then shift || true; fi
if [[ $# -gt 0 && "${1:-}" != --* ]]; then shift || true; fi
if [[ $# -gt 0 && "${1:-}" != --* ]]; then shift || true; fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server)
      SERVER="${2:-}"
      shift 2
      ;;
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    --domain)
      DOMAIN="${2:-}"
      shift 2
      ;;
    --project-dir)
      PROJECT_DIR="${2:-}"
      shift 2
      ;;
    --port)
      PORT="${2:-}"
      shift 2
      ;;
    --proxy-host)
      PROXY_HOST="${2:-}"
      shift 2
      ;;
    --php-fpm)
      PHP_FPM="${2:-}"
      shift 2
      ;;
    --https)
      HTTPS=1
      shift
      ;;
    --output)
      OUTPUT="${2:-}"
      shift 2
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

SERVER="$(printf '%s' "$SERVER" | tr '[:upper:]' '[:lower:]')"
MODE="$(printf '%s' "$MODE" | tr '[:upper:]' '[:lower:]')"

if [[ "$SERVER" != "apache" && "$SERVER" != "nginx" ]]; then
  echo "--server wajib apache atau nginx." >&2
  usage
  exit 1
fi

if [[ "$MODE" != "direct" && "$MODE" != "proxy" ]]; then
  echo "--mode wajib direct atau proxy." >&2
  usage
  exit 1
fi

if [[ -z "$DOMAIN" ]]; then
  echo "--domain wajib diisi." >&2
  usage
  exit 1
fi

PROJECT_DIR="${PROJECT_DIR%/}"
PUBLIC_DIR="${PROJECT_DIR}/public"
PROTO="http"
FORWARDED_PORT="80"
if [[ "$HTTPS" -eq 1 ]]; then
  PROTO="https"
  FORWARDED_PORT="443"
fi

render_apache_direct() {
  cat <<EOF
<VirtualHost *:80>
    ServerName ${DOMAIN}
    DocumentRoot ${PUBLIC_DIR}

    <Directory ${PUBLIC_DIR}>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog \${APACHE_LOG_DIR}/if-instrument-error.log
    CustomLog \${APACHE_LOG_DIR}/if-instrument-access.log combined
</VirtualHost>
EOF
}

render_apache_proxy() {
  cat <<EOF
<VirtualHost *:80>
    ServerName ${DOMAIN}

    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "${PROTO}"
    RequestHeader set X-Forwarded-Port "${FORWARDED_PORT}"

    ProxyPass / http://${PROXY_HOST}:${PORT}/
    ProxyPassReverse / http://${PROXY_HOST}:${PORT}/

    ErrorLog \${APACHE_LOG_DIR}/if-instrument-proxy-error.log
    CustomLog \${APACHE_LOG_DIR}/if-instrument-proxy-access.log combined
</VirtualHost>
EOF
}

render_nginx_direct() {
  cat <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    root ${PUBLIC_DIR};
    index index.php index.html;
    client_max_body_size 20M;

    location / {
        try_files \$uri \$uri/ /index.php?\$query_string;
    }

    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_pass ${PHP_FPM};
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        fastcgi_param PATH_INFO \$fastcgi_path_info;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }
}
EOF
}

render_nginx_proxy() {
  cat <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    client_max_body_size 20M;

    location / {
        proxy_pass http://${PROXY_HOST}:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto ${PROTO};
        proxy_set_header X-Forwarded-Port ${FORWARDED_PORT};
    }
}
EOF
}

CONFIG=""
if [[ "$SERVER" == "apache" && "$MODE" == "direct" ]]; then
  CONFIG="$(render_apache_direct)"
elif [[ "$SERVER" == "apache" && "$MODE" == "proxy" ]]; then
  CONFIG="$(render_apache_proxy)"
elif [[ "$SERVER" == "nginx" && "$MODE" == "direct" ]]; then
  CONFIG="$(render_nginx_direct)"
elif [[ "$SERVER" == "nginx" && "$MODE" == "proxy" ]]; then
  CONFIG="$(render_nginx_proxy)"
fi

if [[ -n "$OUTPUT" ]]; then
  printf '%s\n' "$CONFIG" > "$OUTPUT"
  echo "Config tersimpan: $OUTPUT"
else
  printf '%s\n' "$CONFIG"
fi

cat <<EOF

Langkah berikutnya:
EOF

if [[ "$SERVER" == "apache" ]]; then
  cat <<'EOF'
  sudo a2enmod rewrite
EOF
  if [[ "$MODE" == "proxy" ]]; then
    cat <<'EOF'
  sudo a2enmod proxy proxy_http headers
EOF
  fi
  cat <<EOF
  sudo cp ${OUTPUT:-hasil-config.conf} /etc/apache2/sites-available/if-instrument.conf
  sudo a2ensite if-instrument.conf
  sudo apache2ctl configtest
  sudo systemctl reload apache2
EOF
else
  cat <<EOF
  sudo cp ${OUTPUT:-hasil-config.conf} /etc/nginx/sites-available/if-instrument
  sudo ln -s /etc/nginx/sites-available/if-instrument /etc/nginx/sites-enabled/if-instrument
  sudo nginx -t
  sudo systemctl reload nginx
EOF
fi

if [[ "$MODE" == "proxy" ]]; then
  cat <<EOF

Jalankan app service internal:
  HOST=${PROXY_HOST} PORT=${PORT} scripts/run-server.sh
EOF
fi
