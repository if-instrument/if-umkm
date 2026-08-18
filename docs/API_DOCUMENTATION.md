# 📖 Dokumentasi Lengkap API (IF Instrument UMKM Solution)

Dokumen ini berisi panduan komprehensif mengenai endpoint REST API backend **CodeIgniter 4 (PHP)** dan **FastAPI Microservice (Python)**, termasuk autentikasi, model data, kode status, dan tautan Swagger UI interaktif.

---

## 🌐 1. Tautan Dokumentasi Interaktif (Swagger UI)

| Layanan | URL Dokumentasi Interaktif | Format Spek |
|---|---|---|
| **PHP Backend (POS & SaaS)** | [http://127.0.0.1:8081/docs/](http://127.0.0.1:8081/docs/) atau `/api-docs` | OpenAPI 3.0.3 (`/docs/openapi.json`) |
| **Python AI Microservice** | [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) (Swagger) / `/redoc` | OpenAPI 3.1.0 (`/openapi.json`) |

---

## 🔐 2. Protokol Autentikasi & Keamanan

### A. Autentikasi Web & POS (Hybrid JWT)
- **HttpOnly Cookie**: Endpoint login menyetel cookie `jwt_token` secara otomatis (`HttpOnly`, `SameSite=Lax`, `Path=/`).
- **Bearer Token**: Untuk client non-browser / mobile app, token juga dikembalikan di respons JSON dan dapat dikirim via header:
  ```http
  Authorization: Bearer <token_jwt>
  ```

### B. Autentikasi Python AI Microservice
Setiap request dari backend PHP ke microservice Python diproteksi dengan header:
```http
X-API-Key: <AI_API_SECRET_KEY>
```

---

## 📦 3. Ringkasan Endpoint Backend PHP (CodeIgniter 4)

### A. Autentikasi & Sesi
- `POST /api/auth/login` (Rate limit: 10 req/min) - Login kasir / admin
- `POST /api/auth/logout` - Logout dan pembersihan HttpOnly cookie
- `POST /api/page/login/face-identify` - Login biometrik pengenalan wajah
- `POST /api/page/login/fingerprint-identify` - Login biometrik sidik jari
- `GET /api/invitation/{token}` - Verifikasi token undangan akun baru
- `POST /api/invitation/{token}/accept` - Penerimaan undangan dan aktivasi akun

### B. Transaksi & Penjualan POS
- `GET /api/order` - Daftar transaksi pesanan dengan filter status dan outlet
- `POST /api/order` - Checkout transaksi kasir baru
- `GET /api/order/{id}` - Detail pesanan lengkap dan daftar item
- `POST /api/order/{id}/status` - Pembaruan status pesanan (Kitchen KDS / Ready / Done)
- `POST /api/order/{id}/ready-items` - Penandaan item siap saji per item
- `POST /api/order/{id}/cancel` - Pembatalan pesanan dan rollback stok otomatis
- `POST /api/order/{id}/pay` - Pelunasan tagihan meja (Dine-in assigned table)

### C. Inventaris, HPP & Resep
- `GET /api/ingredient` - Daftar bahan baku outlet dan stok realtime
- `POST /api/ingredient` - Tambah bahan baku baru ke outlet
- `POST /api/inventory/purchase` - Catat pembelian bahan (Stock In + Lot FIFO)
- `POST /api/inventory/waste` - Catat bahan rusak / kedaluwarsa (Stock Out Waste)
- `GET /api/stock-movement` - Kartu riwayat mutasi stok
- `GET /api/product` - Daftar katalog produk menu
- `POST /api/product` - Buat / edit menu dan komponen resep HPP

### D. Pengaturan & Operasional
- `GET /api/setting` - Ambil konfigurasi outlet, pajak PB1, service charge, dan printer
- `PUT /api/setting` - Simpan konfigurasi outlet dan printer
- `GET /api/payment-method` - Daftar metode pembayaran (Cash, QRIS, EDC, VA, E-Wallet)
- `POST /api/payment-method` - Tambah / modifikasi metode pembayaran
- `GET /api/dining-table` - Daftar meja makan restoran
- `POST /api/dining-table` - Tambah meja makan dan unduh QR Code pemesanan

### E. Super Admin & Multi-Tenancy SaaS
- `GET /api/company` - Daftar seluruh tenant perusahaan terdaftar
- `POST /api/company/{id}/approve` - Approval pendaftaran tenant baru
- `POST /api/company/{id}/reject` - Penolakan pendaftaran dengan catatan email
- `POST /api/company/{id}/renew-subscription` - Perpanjangan masa aktif lisensi SaaS
- `GET /api/saas-plan` - Daftar paket langganan SaaS

### F. Pelaporan Keuangan & CRM
- `GET /api/report/profit-loss` - Laporan Laba Rugi komprehensif (Pendapatan - HPP - Biaya Operasional)
- `GET /api/crm/customers` - Daftar database pelanggan dan riwayat transaksi

### G. Buku Menu Digital Publik
- `GET /api/public/order/bootstrap` - Bootstrap data menu tanpa login
- `POST /api/public/order` (Rate limit: 20 req/min) - Submit pesanan mandiri pelanggan

---

## 🧠 4. Ringkasan Endpoint Python AI Microservice

### A. Face Biometrics
- `POST /face/detect` - Deteksi lokasi bounding box wajah
- `POST /face/embed` - Ekstraksi vektor embedding 128-D / 512-D
- `POST /face/verify` - Verifikasi kemiripan 1-to-1 dua foto wajah
- `POST /face/identify` - Pencocokan 1-to-many wajah kasir dalam tenant

### B. Fingerprint Biometrics
- `POST /fingerprint/extract` - Ekstraksi minutiae template sidik jari
- `POST /fingerprint/verify` - Verifikasi pencocokan sidik jari hardware

### C. Predictive & Business Intelligence
- `POST /v1/ai/predict/stockout` - Estimasi hari bahan habis berdasarkan tren penjualan
- `POST /v1/ai/recommend/recipes` - Rekomendasi menu baru dengan margin profit optimal
- `POST /v1/ai/chat` - Asisten cerdas tanya jawab data bisnis UMKM
- `GET /v1/ai/quota` - Cek sisa kuota token AI tenant perusahaan
