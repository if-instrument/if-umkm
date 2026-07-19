# 01. Project Overview

## Executive Summary
Aplikasi UMKM (IFresso Coffee) adalah sistem Point of Sale (POS) dan manajemen inventaris berbasis multi-tenant Software as a Service (SaaS). Sistem ini dirancang untuk mendigitalkan operasional gerai makanan dan minuman (F&B) skala mikro, kecil, dan menengah. Aplikasi ini mengintegrasikan fungsi pencatatan penjualan di kasir (POS), pemesanan menu digital oleh pelanggan via online store, manajemen resep, rantai pasok inventaris/bahan baku, sistem CRM sederhana untuk loyalitas pelanggan, hingga pencatatan beban operasional dan laporan laba rugi.

Sistem ini menggunakan arsitektur *hybrid database tenancy*, mendukung pembagian database bersama (shared database) maupun database terpisah secara fisik (dedicated database) untuk setiap tenant perusahaan demi keamanan dan isolasi data tingkat tinggi.

## Tujuan Aplikasi
1. **Digitalisasi POS & Kasir**: Memudahkan kasir mencatat transaksi secara cepat, mendukung sistem penambahan pesanan meja (*open table*), diskon loyalitas member, dan integrasi pembayaran digital.
2. **Efisiensi Rantai Pasok (Supply Chain)**: Otomatisasi pemotongan stok bahan baku berdasarkan resep menu yang terjual, serta pencatatan stok opname dan pembelian bahan baku.
3. **Pemesanan Mandiri Pelanggan**: Menyediakan halaman e-commerce/online store di mana pelanggan dapat men-scan QR code di meja untuk memesan secara langsung dan meng-upload bukti pembayaran.
4. **Analisis Finansial Terpadu**: Memberikan visualisasi margin kotor, HPP (Cost of Goods Sold - COGS), beban operasional harian, serta laporan laba rugi bulanan per outlet atau secara konsolidasi global.

## Ruang Lingkup Sistem (System Scope)
Sistem Aplikasi UMKM mencakup fitur-fitur berikut:
- **Central Administration (Super Admin)**: Mengelola pendaftaran tenant perusahaan baru, melakukan provisi database dedicated, dan memantau status tenant.
- **Branding & Tenant Settings**: Kustomisasi logo, domain/route slug, tema warna, layout meja, dan aktivasi gerbang pembayaran (Xendit/Midtrans) serta terminal EDC bank.
- **Manajemen Pengguna & Otorisasi**: Manajemen role dengan matriks permission yang presisi dan pembatasan akses pengguna berdasarkan gerai (outlet-scoped users).
- **POS Kasir (Point of Sale)**: Aplikasi kasir responsif (SPA) yang mendukung keyboard virtual/numpad, hold stok untuk preorder, dan settlement bill meja.
- **Online Store & QR Order**: Halaman pemesanan online pelanggan yang memiliki alur checkout mandiri dan sistem unggah bukti transfer/QRIS offline.
- **Inventory & Production Manager**: Pencatatan pembelian bahan baku, stock movement log, konversi unit bahan, formula resep, dan produksi produk jadi dari bahan mentah.
- **CRM & Loyalty**: Manajemen keanggotaan pelanggan, diskon member, dan pencatatan riwayat transaksi member.
- **Finance**: Laporan laba rugi (margin produk, beban operasional, pajak, service charge, revenue) dan log history settlement pembayaran gateway.

## Stakeholders & Target Pengguna
1. **Pemilik Bisnis (Company Admin)**: Pemilik UMKM yang mengelola pengaturan umum perusahaan, harga jual global, data produk, role karyawan, dan melihat laporan finansial akhir.
2. **Manajer Outlet (Outlet Manager)**: Mengelola ketersediaan stok bahan di outlet, stock opname lokal, pengeluaran lokal (expense), dan melakukan approval pesanan online.
3. **Kasir (Cashier)**: Pengguna POS di outlet yang melayani pelanggan langsung, membuka bill meja, memproses pembayaran tunai/EDC, dan mencetak receipt fisik.
4. **Staf Dapur (Kitchen Staff)**: Pengguna Kitchen Display System (KDS) yang memantau pesanan aktif, mencentang produk yang sudah selesai dibuat, dan menandai kesiapan saji pesanan.
5. **Pelanggan (Customer)**: Pengguna online store yang mengakses menu via scan QR code di meja, memesan, mengunggah bukti bayar, dan melacak status pesanan.

## Teknologi Yang Digunakan

| Komponen | Teknologi | Deskripsi |
|---|---|---|
| **Backend Framework** | CodeIgniter 4 (PHP 8.x) | Framework MVC PHP yang ringan, efisien, dengan performa routing cepat. |
| **Frontend Framework** | Vanilla JavaScript (ES6 Modules) & HTML5 | Menghindari overhead framework JS berat (seperti React/Vue) untuk POS kasir yang berjalan cepat. |
| **Styling (CSS)** | CSS3 (Custom CSS Variables & CSS Grid) | Styling modern bertema premium, responsive, tanpa menggunakan framework utility (Tailwind). |
| **Database** | MySQL (MySQLi Driver) | Penyimpanan data relasional dengan model data dinamis terenkripsi. |
| **Authentication** | JSON Web Tokens (JWT) | Pengamanan REST API yang stateless dan scalable dengan payload tersinkronisasi. |
| **Payment Gateway** | Xendit API & Midtrans API | Integrasi pembuatan invoice, QRIS dinamis, dan verifikasi status pembayaran otomatis via webhook. |
| **EDC Connection** | Integrated Bank EDC Protocols | Integrasi terminal EDC BCA, BRI, BNI, dan Mandiri untuk settlement kartu debit/kredit di kasir. |

## Struktur Project (Project Structure)
Sistem ini menggunakan struktur standar CodeIgniter 4 dengan kustomisasi layanan multi-tenant:
```
├── app/
│   ├── Commands/              # Perintah CLI (Provisi Tenant, Migrasi DB, Prune Central DB)
│   ├── Config/                # Konfigurasi sistem (Routing, Filters, Database, App)
│   ├── Controllers/           # Controllers utama (AppPage, POS, Login, OnlineOrder)
│   │   └── Api/               # API Controllers (Auth, Sales, CRM, Inventory, Settings)
│   ├── Database/              # Migrasi skema database sentral & tenant, seed data demo
│   ├── Filters/               # Middleware untuk JWT auth & otorisasi route
│   ├── Models/                # Database Models (OrderModel, ProductModel, dll.)
│   ├── Presenters/            # Presenters untuk pemformatan data khusus ke halaman UI
│   ├── Services/              # Business Logic Services (AuthService, InventoryService, dll.)
│   │   └── Payments/          # Adapter EDC Bank (Bca, Bri, Bni, Mandiri)
│   └── Views/                 # View template bawaan (Error pages)
├── docs/                      # Dokumen reverse engineering saat ini
├── public/                    # Root folder webserver (assets, index.php)
│   ├── pages/                 # Halaman HTML statis (POS, orders, settings, login, dll.)
│   ├── scripts/               # Javascript pendukung SPA (pages/, layout.js, store.js)
│   └── uploads/               # Asset upload (bukti transfer, logo outlet, gambar menu)
└── composer.json              # Dependency backend manager
```

## High Level Architecture
Aplikasi ini beroperasi dalam lingkungan Web Server Apache/Nginx dengan PHP-FPM. Client mengakses halaman HTML dinamis yang bertindak sebagai Single Page Application (SPA). Komunikasi data ke server berjalan asinkron via API JSON yang diamankan dengan JWT Filter. 

Central database menyimpan daftar perusahaan/tenant dan konfigurasi server utama. Ketika request masuk dengan mengenali domain atau route slug tenant (`/company-slug/`), middleware `TenantDatabaseService` secara dinamis membelokkan koneksi default MySQL ke database dedicated tenant yang bersangkutan, sehingga isolasi data tetap terjaga secara penuh secara real-time.
