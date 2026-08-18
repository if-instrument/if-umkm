# 🏛️ Arsitektur Sistem & Multi-Tenancy (IF Instrument UMKM Solution)

Dokumen ini menjelaskan rancangan arsitektur tingkat tinggi (*High-Level Architecture*), strategi database multi-tenancy, sistem antrian background, dan alur integrasi antar-komponen.

---

## 🏗️ 1. Diagram Arsitektur Keseluruhan

```
                                    +------------------------------+
                                    |     Klien Web / Kasir POS    |
                                    | (ES6 Modular Vanilla JS/CSS) |
                                    +--------------+---------------+
                                                   |
                             HTTP/JSON (Cookie / JWT Bearer)
                                                   |
                                                   v
                             +-------------------------------------+
                             |   Backend Web Core (CodeIgniter 4)  |
                             |   - RateLimitFilter (Anti-Brute)    |
                             |   - JwtAuthFilter (Hybrid Auth)     |
                             |   - ApiResponseTrait (Std DTO)      |
                             |   - TenantDatabaseService           |
                             +----------+---------------+----------+
                                        |               |
             +--------------------------+               +--------------------------+
             |                                                                     |
             v                                                                     v
+-------------------------------+                               +-------------------------------------+
|   Database Layer (MySQLi)     |                               | Python AI Microservice (FastAPI)    |
| • Central DB (if_instrument)  |                               | • Face & Fingerprint Biometrics     |
|   - master companies, saas    |                               | • Business Intelligence Predictive  |
|   - queued_jobs               |                               | • Quota Token Engine                |
| • Tenant DBs (if_umkm_{slug}) |                               +-------------------------------------+
|   - orders, ingredients, lots |
|   - recipes, tables, payments |
+---------------+---------------+
                |
                v
+-------------------------------+
| Background Job Queue Worker   |
| • php spark queue:work        |
| • Async Email & Notifications |
+-------------------------------+
```

---

## 🏢 2. Strategi Database Multi-Tenancy

Sistem menggunakan pendekatan **Dedicated Database per Tenant** untuk memastikan isolasi data yang aman, performa maksimal, dan kemudahan backup/restore per klien UMKM:

1. **Central Database (`if_instrument_umkm`)**:
   - Master Super Admin & Role Global
   - Pendaftaran & Verifikasi Tenant Perusahaan (`companies`)
   - Paket Langganan SaaS (`saas_plans`, `saas_subscription_logs`)
   - Master Payment Gateway Pusat (`central_payment_accounts`)
   - Tabel Antrian Pekerjaan Latar Belakang (`queued_jobs`)

2. **Dedicated Tenant Databases (`if_umkm_{route_slug}`)**:
   - Setiap perusahaan memiliki database terpisah, misalnya `if_umkm_ifresso_coffee`, `if_umkm_spider_cafe`.
   - Berisi tabel operasional lengkap: `orders`, `order_items`, `outlet_ingredients`, `ingredient_lots`, `stock_movements`, `products`, `recipes`, `dining_tables`, `payment_methods`, `operating_expenses`.
   - Menggunakan migrasi spark terdedikasi: `php spark tenant:run-migrations`.

---

## ⚡ 3. Background Job Queue Runner

Untuk menjamin waktu respons checkout dan operasional kasir tetap di bawah 15ms, proses lambat dipindahkan ke tabel antrian MySQL:
- **Tabel Antrian**: `queued_jobs`
- **Mekanisme Eksekusi**:
  - `QueueService::push($handler, $payload, $delaySeconds)`
  - `QueueWorker` mengambil job dengan status `processing` (*safe locking*).
  - Jika terjadi kendala jaringan SMTP, job dijadwalkan ulang secara otomatis (*auto-retry exponential backoff*).
- **Proses Daemon**: Berjalan di latar belakang via skrip startup `scripts/run-server.sh`.

---

## 🧪 4. Standar Mutu & Pengujian Otomatis

- **PHPUnit 10**: Menjamin fungsionalitas Service Kritis (JWT, Tenant Database, Laba Rugi, Kalkulasi Resep FIFO, Queue, Response DTO).
- **PyTest**: Menjamin keakuratan model biometrik wajah, sidik jari, dan kalkulasi kuota AI.
- **Node Check**: Validasi sintaksis seluruh submodul frontend ES6 tanpa kegagalan.
