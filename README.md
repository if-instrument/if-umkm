# IF Instrument UMKM Solution

Aplikasi operasional UMKM untuk POS/Kasir, Inventory Management, Product Recipe/HPP, Laporan Laba Rugi, dan SaaS multi-perusahaan/multi-outlet.

Project ini memakai CodeIgniter 4 sebagai backend produksi dan UI operasional di `public/`.
Semua aksi data berjalan melalui alur `views -> controller pages -> api -> controller api -> service -> model`.

## Arsitektur CodeIgniter

Struktur utama mengikuti pola profesional:

- `app/Config/Routes.php` untuk route halaman dan API.
- `app/Controllers/LegacyFrontendController.php` sebagai controller halaman untuk UI HTML.
- `app/Controllers/Api` untuk request handler API per modul.
- `app/Services` untuk business logic seperti POS, inventory costing, recipe HPP, dan profit/loss.
- `app/Models` untuk akses database MySQL.
- `public/pages`, `public/scripts`, dan `public/styles.css` untuk UI operasional.
- `app/Database/Migrations` untuk schema MySQL.

## Requirement

CodeIgniter 4 terbaru membutuhkan PHP 8.2 atau lebih baru. Environment lokal yang terdeteksi saat scaffold masih PHP 7.4, jadi dependency belum bisa dipasang sampai PHP dinaikkan.

## Setup Dengan PHP 8.3 CLI

```bash
php83 /usr/local/bin/composer install
cp .env.example .env
php83 spark key:generate
php83 spark migrate
php83 spark db:seed DemoSeeder
php83 spark serve
```

Database default:

```text
database: if_instrument_umkm
driver: MySQLi
```

## Sample Login Seeder

- Super Admin: `superadmin@app.test` / `super123`
- Admin Perusahaan: `admin@ifresso.id` / `admin123`

## Modul Awal CI

- Dashboard
- POS / Kasir
- Antrian Pesanan
- Product List
- Kategori Produk
- Modifier Master
- Recipe / HPP
- Inventory Overview
- Stock List
- Purchase / Stock In
- Stock Movement
- Laporan Laba Rugi
- Admin SaaS: Perusahaan, User, Role, Pengaturan

## Jalankan Aplikasi

```bash
php83 spark serve --port 8081
```

Lalu buka `http://127.0.0.1:8081`.
