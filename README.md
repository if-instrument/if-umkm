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
- `app/Database/Migrations`: schema pusat dan tenant.
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
- Web server production disarankan Nginx/Apache dengan document root ke folder `public/`.

## Setup Server Baru

Clone atau upload project ke server, lalu jalankan:

```bash
DB_USER=root \
DB_PASS='password_mysql' \
APP_URL='https://domain-anda.com/' \
scripts/setup-server.sh --fresh
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

```bash
scripts/run-server.sh
```

Atau set port sendiri:

```bash
PORT=8081 scripts/run-server.sh
```

Lalu buka:

```text
http://127.0.0.1:8081
```

## Production Web Server

Untuk production, jangan arahkan web server ke root project. Arahkan document root ke:

```text
/path/to/project/public
```

Contoh Nginx sederhana:

```nginx
server {
    listen 80;
    server_name domain-anda.com;
    root /path/to/project/public;
    index index.php index.html;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }
}
```

Pastikan folder berikut bisa ditulis oleh user web server:

```bash
chmod -R ug+rw writable public/uploads
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

Data operasional perusahaan berada di database tenant masing-masing. Saat Super Admin membuat perusahaan baru, sistem akan:

- Membuat database tenant.
- Menjalankan migration tenant.
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
