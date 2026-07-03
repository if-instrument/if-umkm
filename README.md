# IF Instrument UMKM Solution

Aplikasi SaaS operasional UMKM untuk POS/Kasir, online order, kitchen/queue, inventory, product recipe/HPP, CRM, finance, laporan, multi-company, multi-outlet, dan tenant database per perusahaan.

Backend memakai CodeIgniter 4, database MySQL, dan UI web berada di folder `public/`.

## Arsitektur

Flow utama aplikasi:

```text
HTML/View -> JavaScript Page -> Page Controller -> API Service -> Module Service -> Model/Database
```

Struktur penting:

- `app/Config/Routes.php`: route halaman dan API.
- `app/Controllers`: controller halaman, API, dan page bootstrap.
- `app/Services`: business logic modul POS, inventory, product, finance, tenant, payment, dan CRM.
- `app/Models`: akses database.
- `app/Presenters`: transform data untuk kebutuhan halaman.
- `app/Database/Migrations`: schema pusat SaaS saja.
- `app/Database/TenantMigrations`: schema operasional tenant/perusahaan.
- `app/Database/Seeds/DemoSeeder.php`: reset database pusat dan seed Super Admin SaaS.
- `public/pages`: file halaman frontend.
- `public/scripts/pages`: JavaScript khusus halaman.
- `public/styles/pages`: CSS khusus halaman.
- `scripts`: script setup dan menjalankan aplikasi.

## Requirement Server

- PHP 8.2 atau lebih baru. Di lokal project ini biasa memakai `php83`.
- Composer 2.
- MySQL 8 atau MariaDB yang kompatibel.
- Ekstensi PHP umum CodeIgniter: `intl`, `mbstring`, `json`, `mysqli`, `curl`, `openssl`.
- Linux: Nginx/Apache dengan PHP-FPM disarankan untuk production.
- Windows: IIS + PHP FastCGI, Apache Windows, atau Nginx Windows.
- Untuk semua OS, document root direct harus ke folder `public/`.

## Setup Server Baru

Clone atau upload project ke server, lalu jalankan:

Linux/macOS:

```bash
DB_USER=root \
DB_PASS='password_mysql' \
APP_URL='https://domain-anda.com/' \
scripts/setup-server.sh --fresh
```

Windows PowerShell:

```powershell
.\scripts\setup-server.ps1 -DbUser root -DbPass 'password_mysql' -AppUrl 'https://domain-anda.com/' -Fresh
```

Default yang dipakai script:

```text
APP_URL=http://localhost:8081/
DB_HOST=localhost
DB_NAME=if_instrument_umkm
DB_USER=root
DB_PASS=
DB_PORT=3306
CI_ENVIRONMENT=production
```

Script `setup-server.sh` akan:

- Membuat `.env` dari `.env.example` jika belum ada.
- Mengisi konfigurasi server ke `.env`.
- Membuat folder runtime `writable/*` dan `public/uploads`.
- Menjalankan `composer install --no-dev --optimize-autoloader`.
- Membuat database pusat jika MySQL CLI tersedia.
- Menjalankan `php spark key:generate` jika encryption key masih kosong.
- Menjalankan migration database pusat.
- Jika memakai `--fresh`, reset database pusat dan seed Super Admin SaaS.

Hati-hati: `--fresh` menjalankan `DemoSeeder`, sehingga data pusat akan direset. Gunakan hanya untuk server/database baru.

## Login Awal

Jika setup dijalankan dengan `--fresh`:

```text
Email    : superadmin@app.test
Password : super123
```

Setelah login sebagai Super Admin:

1. Buat perusahaan baru.
2. Isi route slug perusahaan, contoh `IFressoCoffee`.
3. Isi admin perusahaan.
4. Sistem akan membuat database tenant perusahaan, menjalankan migration tenant, dan menyiapkan admin perusahaan.
5. Admin perusahaan login melalui route perusahaan, contoh:

```text
https://domain-anda.com/IFressoCoffee/login
```

## Menjalankan Dengan Built-In Server

Untuk development atau test cepat:

Linux/macOS:

```bash
scripts/run-server.sh
```

Windows PowerShell:

```powershell
.\scripts\run-server.ps1
```

Atau set port sendiri:

```bash
PORT=8081 scripts/run-server.sh
```

```powershell
.\scripts\run-server.ps1 -Port 8081
```

Lalu buka:

```text
http://127.0.0.1:8081
```

## Script Cepat Dev dan Production

Development lokal Linux/macOS:

```bash
CI_ENVIRONMENT=development APP_URL='http://localhost:8081/' scripts/setup-server.sh
HOST=0.0.0.0 PORT=8081 scripts/run-server.sh
```

Development lokal Windows PowerShell:

```powershell
.\scripts\setup-server.ps1 -CiEnvironment development -AppUrl 'http://localhost:8081/'
.\scripts\run-server.ps1 -HostName 0.0.0.0 -Port 8081
```

Production setup awal Linux/macOS:

```bash
CI_ENVIRONMENT=production \
APP_URL='https://domain-anda.com/' \
DB_USER=root \
DB_PASS='password_mysql' \
scripts/setup-server.sh
```

Production setup awal Windows PowerShell:

```powershell
.\scripts\setup-server.ps1 -CiEnvironment production -AppUrl 'https://domain-anda.com/' -DbUser root -DbPass 'password_mysql'
```

Jika server benar-benar baru dan ingin reset + seed Super Admin SaaS:

```bash
CI_ENVIRONMENT=production \
APP_URL='https://domain-anda.com/' \
DB_USER=root \
DB_PASS='password_mysql' \
scripts/setup-server.sh --fresh
```

```powershell
.\scripts\setup-server.ps1 -CiEnvironment production -AppUrl 'https://domain-anda.com/' -DbUser root -DbPass 'password_mysql' -Fresh
```

Generate config web server Linux/macOS:

```bash
scripts/webserver-config.sh apache direct domain-anda.com --project-dir /var/www/if-instrument --output if-instrument-apache.conf
scripts/webserver-config.sh apache proxy domain-anda.com --port 8081 --https --output if-instrument-apache-proxy.conf
scripts/webserver-config.sh nginx direct domain-anda.com --project-dir /var/www/if-instrument --output if-instrument-nginx.conf
scripts/webserver-config.sh nginx proxy domain-anda.com --port 8081 --https --output if-instrument-nginx-proxy.conf
```

Generate config web server Windows PowerShell:

```powershell
.\scripts\webserver-config.ps1 -Server iis -Mode direct -Domain domain-anda.com -ProjectDir 'C:\apps\if-instrument' -Output web.config
.\scripts\webserver-config.ps1 -Server iis -Mode proxy -Domain domain-anda.com -Port 8081 -Https -Output web.config
.\scripts\webserver-config.ps1 -Server apache -Mode direct -Domain domain-anda.com -ProjectDir 'C:\apps\if-instrument' -Output if-instrument-apache.conf
.\scripts\webserver-config.ps1 -Server nginx -Mode proxy -Domain domain-anda.com -Port 8081 -Https -Output if-instrument-nginx.conf
```

Mode `direct` berarti web server langsung mengarah ke `public/`. Mode `proxy` berarti web server meneruskan request ke service internal, misalnya:

```bash
HOST=127.0.0.1 PORT=8081 scripts/run-server.sh
```

```powershell
.\scripts\run-server.ps1 -HostName 127.0.0.1 -Port 8081
```

## Production Web Server

Untuk production normal, jangan arahkan web server ke root project. Arahkan document root ke:

```text
/path/to/project/public
```

Contoh path di server:

```text
/var/www/if-instrument/public
```

### Nginx + PHP-FPM

Gunakan opsi ini jika Nginx langsung menjalankan PHP-FPM.

```nginx
server {
    listen 80;
    server_name domain-anda.com;

    root /var/www/if-instrument/public;
    index index.php index.html;
    client_max_body_size 20M;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_param PATH_INFO $fastcgi_path_info;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }
}
```

Aktifkan:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Apache VirtualHost

Gunakan opsi ini jika Apache langsung menjalankan PHP melalui PHP-FPM/mod_php.

```apache
<VirtualHost *:80>
    ServerName domain-anda.com
    DocumentRoot /var/www/if-instrument/public

    <Directory /var/www/if-instrument/public>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog ${APACHE_LOG_DIR}/if-instrument-error.log
    CustomLog ${APACHE_LOG_DIR}/if-instrument-access.log combined
</VirtualHost>
```

Aktifkan rewrite dan site:

```bash
sudo a2enmod rewrite
sudo a2ensite if-instrument.conf
sudo apache2ctl configtest
sudo systemctl reload apache2
```

Jika file `public/.htaccess` belum ada, buat seperti ini:

```apache
<IfModule mod_rewrite.c>
    RewriteEngine On

    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^(.*)$ index.php/$1 [L]
</IfModule>

Options -Indexes

<FilesMatch "^\.">
    Require all denied
</FilesMatch>
```

### Reverse Proxy / ProxyPass

Gunakan opsi ini jika aplikasi dijalankan sebagai service di belakang web server, misalnya:

```bash
HOST=127.0.0.1 PORT=8081 scripts/run-server.sh
```

Pada mode ini web server tidak mengarah ke folder `public`, tetapi meneruskan request ke service internal `127.0.0.1:8081`.

Contoh Apache ProxyPass:

```apache
<VirtualHost *:80>
    ServerName domain-anda.com

    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "http"
    RequestHeader set X-Forwarded-Port "80"

    ProxyPass / http://127.0.0.1:8081/
    ProxyPassReverse / http://127.0.0.1:8081/

    ErrorLog ${APACHE_LOG_DIR}/if-instrument-proxy-error.log
    CustomLog ${APACHE_LOG_DIR}/if-instrument-proxy-access.log combined
</VirtualHost>
```

Aktifkan modul Apache:

```bash
sudo a2enmod proxy proxy_http headers rewrite
sudo apache2ctl configtest
sudo systemctl reload apache2
```

Contoh Nginx reverse proxy:

```nginx
server {
    listen 80;
    server_name domain-anda.com;
    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Port $server_port;
    }
}
```

Jika memakai HTTPS di proxy, pastikan `.env` memakai URL publik:

```text
app.baseURL = 'https://domain-anda.com/'
```

Catatan: untuk production besar, opsi PHP-FPM langsung lebih disarankan daripada `spark serve`. Reverse proxy cocok untuk staging, demo, atau saat service dijalankan melalui supervisor/systemd.

### Windows IIS

Untuk Windows direct mode:

- Install PHP 8.2+ untuk IIS/FastCGI.
- Install IIS URL Rewrite.
- Set IIS Site Physical Path ke folder `public`.
- Simpan hasil generator `iis direct` sebagai `public/web.config`.

Generate:

```powershell
.\scripts\webserver-config.ps1 -Server iis -Mode direct -Domain domain-anda.com -ProjectDir 'C:\apps\if-instrument' -Output public\web.config
```

Untuk Windows proxy mode:

- Install IIS URL Rewrite dan Application Request Routing (ARR).
- Aktifkan proxy di ARR.
- Jalankan app internal dengan `run-server.ps1`.
- Simpan hasil generator `iis proxy` sebagai `web.config` pada root site IIS.

Generate:

```powershell
.\scripts\webserver-config.ps1 -Server iis -Mode proxy -Domain domain-anda.com -Port 8081 -Https -Output web.config
.\scripts\run-server.ps1 -HostName 127.0.0.1 -Port 8081
```

Pastikan folder berikut bisa ditulis oleh user web server:

```bash
sudo chown -R www-data:www-data writable public/uploads
sudo chmod -R ug+rw writable public/uploads
```

## Konfigurasi Penting `.env`

Database pusat:

```text
database.default.hostname = localhost
database.default.database = if_instrument_umkm
database.default.username = root
database.default.password = password_mysql
database.default.DBDriver = MySQLi
database.default.port = 3306
```

Email invitation dan receipt:

```text
email.protocol = smtp
email.SMTPHost = smtp.gmail.com
email.SMTPUser = email@gmail.com
email.SMTPPass = app_password_gmail
email.SMTPPort = 587
email.SMTPCrypto = tls
email.mailType = html
email.fromEmail = email@gmail.com
email.fromName = 'IF Instrument'
```

Payment gateway:

```text
XENDIT_SECRET_KEY =
MIDTRANS_SERVER_KEY =
PAYMENT_GATEWAY_TIMEOUT = 15
```

Credential gateway juga bisa dikelola dari setting outlet/perusahaan sesuai flow aplikasi.

## Tenant Database

Database pusat `if_instrument_umkm` hanya untuk control plane SaaS:

- companies
- users super admin
- invitations
- konfigurasi database tenant

Data operasional perusahaan berada di database tenant masing-masing. `php spark migrate` hanya menjalankan migration pusat, sehingga database pusat tidak berisi table POS, inventory, finance, product, CRM, atau order.

Saat Super Admin membuat perusahaan baru, sistem akan:

- Membuat database tenant.
- Menjalankan migration dari `app/Database/TenantMigrations` ke database tenant.
- Menyimpan konfigurasi DB tenant di data company pusat.
- Membuat admin perusahaan di tenant.

Command tenant yang tersedia:

```bash
php83 spark tenant:provision
php83 spark tenant:migrate-merchant-data <company-route-slug> --cleanup-central
php83 spark tenant:drop-company-id <company-route-slug>
php83 spark tenant:prune-central
```

Gunakan command tenant dengan hati-hati, terutama pada server production.

## Maintenance

Update dependency production:

```bash
composer install --no-dev --optimize-autoloader
```

Jalankan migration:

```bash
php83 spark migrate
```

Command di atas hanya untuk database pusat. Migration tenant berjalan otomatis saat company dibuat atau saat menjalankan command tenant provisioning.

Cek syntax JavaScript:

```bash
npm run check
```

Lihat log aplikasi:

```bash
tail -f writable/logs/log-*.php
```

## Catatan Git

File berikut tidak dinaikkan ke git:

- `.env`
- `vendor/`
- `node_modules/`
- file runtime `writable/*`
- upload user di `public/uploads/*`

Simpan credential server di `.env` server, bukan di repository.
