# 02. System Architecture

## Sistem Arsitektur (Multi-Tenancy Strategy)
Aplikasi ini diimplementasikan sebagai platform **SaaS Multi-Tenant** menggunakan model hybrid database tenancy:
1. **Shared Database (Central)**: Database sentral menyimpan data global seperti pemetaan tenant (`companies`), daftar lisensi tenant, data registrasi user utama, dan log transaksi central.
2. **Dedicated Database (Tenant)**: Setiap tenant perusahaan dapat dikonfigurasi untuk memiliki database MySQL terpisah secara fisik (`dedicated` mode). Skema database tenant berisi data transaksional khusus (orders, products, ingredients, roles, app_settings, dll.).

Isolasi data berjalan di level middleware (`TenantDatabaseService`). Setiap request API yang masuk memiliki header otorisasi JWT atau parameter route slug `/company-slug/`. Middleware mengidentifikasi tenant, mengambil kredensial database tenant dari tabel sentral `companies`, lalu secara dinamis mengubah konfigurasi grup database `default` di runtime.

```mermaid
graph TD
    Client[Web Browser / Client POS & Online Store] -->|HTTP Requests + JWT| Router[CodeIgniter 4 Router]
    Router -->|Filter| JWTFilter[JwtAuthFilter Middleware]
    JWTFilter -->|Identifikasi Tenant| TenantService[TenantDatabaseService]
    TenantService -->|Baca Detail Tenant| CentralDB[(Central Database)]
    TenantService -->|Switch Connection| DBPool[App Database Config default]
    DBPool -.->|Koneksi Dinamis| TenantDB1[(Tenant DB 1 - Dedicated)]
    DBPool -.->|Koneksi Dinamis| TenantDB2[(Tenant DB 2 - Shared/Dedicated)]
    JWTFilter -->|Lulus Validasi| Controller[Controller Layer]
    Controller -->|Delegasikan Aksi| Service[Service Layer]
    Service -->|Akses Data| Models[Model Layer]
    Models --> TenantDB1
```

## Layering & Tanggung Jawab (Layers)

### 1. Presentation Layer (Frontend / SPA)
- **Halaman Statis**: Menggunakan template HTML5 murni (`/public/pages/pos.html`, `settings.html`, dll.).
- **Javascript Client (`/public/scripts/`)**: Modul-modul ES6 (seperti `pos.js`, `settings.js`, `store.js`) menangani local state management, integrasi DOM, event listener, validasi form, dan rendering dinamis UI tanpa rendering ulang seluruh halaman.
- **Local Cache**: Menyimpan token JWT dan status session di `localStorage` melalui helper `loadSession()` dan `saveSession()` di `store.js`.

### 2. Router & Filter Layer (Middleware)
- **CodeIgniter 4 Routes (`Config/Routes.php`)**: Menerima request URL, memisahkan grup API publik dengan API terproteksi (`jwt-auth`).
- **JwtAuthFilter (`Filters/JwtAuthFilter.php`)**: Membaca token JWT dari header `Authorization: Bearer <token>`, memvalidasi masa berlaku, memecah payload (`claims`), dan memanggil `TenantDatabaseService` untuk mengaktifkan koneksi database tenant yang sesuai.

### 3. Controller Layer
- **Page Controllers** (`PosController`, `SettingsPageController`, dll.): Menangani pemuatan halaman HTML utama dan memanggil method `bootstrap()` untuk menghasilkan data awal katalog, pengguna, dan transaksi dalam satu request terpadu.
- **API Controllers** (`SalesController`, `InventoryController`, `AuthController`): Berfungsi sebagai endpoint REST API yang menerima input JSON, memvalidasi input dasar, memanggil Service Layer, dan mengembalikan response JSON seragam (`ok: true/false`, `data: [...]`, `message: "..."`).

### 4. Service Layer (Business Logic)
Lapisan terpenting di mana semua aturan bisnis didefinisikan secara independen dari framework. Contoh:
- **`SalesService`**: Mengelola siklus hidup pesanan, kalkulasi pajak, service charge, packaging fee, ready stock check, dan settlement closing.
- **`InventoryService`**: Mengelola pembukuan bahan baku, pemotongan stok otomatis berdasarkan resep menu, stock movement log, dan pembuangan inventaris rusak (*waste*).
- **`PaymentGatewayService`**: Mengintegrasikan API Xendit/Midtrans dan memproses webhook status pembayaran.
- **`TenantDatabaseProvisioningService`**: Otomatisasi pembuatan database tenant baru dan menjalankan migrasi skema tabel tenant via CLI command.

### 5. Model Layer (Data Access)
- **CodeIgniter Models** (`OrderModel`, `ProductModel`, `IngredientModel`): Mewarisi `BaseAppModel` atau `CodeIgniter\Model` untuk menangani operasi CRUD database, relasi query, soft-deletes, dan tracking timestamps otomatis (`created_at`, `updated_at`, `deleted_at`).

---

## Design Patterns

### 1. Model-View-Presenter (MVP) / Bootstrap Pattern
Untuk mengoptimalkan pemuatan halaman Single Page Application (SPA), server menggunakan Presenter (`PosPagePresenter`, `SettingsPagePresenter`) untuk menyatukan beberapa query data master menjadi satu paket respon payload ("bootstrap payload"). Ini mengurangi *round-trip latency* HTTP requests pada perangkat POS kasir.

### 2. Service-Oriented Architecture (SOA)
Seluruh controller tipis (*thin controllers*) mendelegasikan business logic yang rumit ke service gemuk (*fat services*). Controller tidak melakukan query database langsung maupun manipulasi data transaksional.

### 3. Strategy Pattern (Payment EDC Integration)
Integrasi EDC fisik menggunakan Strategy Pattern. Service `Payments` memanggil `EdcTerminalAdapter` yang memiliki implementasi konkrit untuk berbagai bank (`BcaEdcAdapter`, `BriEdcAdapter`, `BniEdcAdapter`, `MandiriEdcAdapter`) melalui kontrak *interface* yang seragam.

```mermaid
classDiagram
    class EdcTerminalAdapter {
        <<interface>>
        +createPaymentRequest(amount, reference)
        +checkStatus(transactionId)
    }
    class BcaEdcAdapter {
        +createPaymentRequest(amount, reference)
        +checkStatus(transactionId)
    }
    class BriEdcAdapter {
        +createPaymentRequest(amount, reference)
        +checkStatus(transactionId)
    }
    class BniEdcAdapter {
        +createPaymentRequest(amount, reference)
        +checkStatus(transactionId)
    }
    class MandiriEdcAdapter {
        +createPaymentRequest(amount, reference)
        +checkStatus(transactionId)
    }
    EdcTerminalAdapter <|.. BcaEdcAdapter
    EdcTerminalAdapter <|.. BriEdcAdapter
    EdcTerminalAdapter <|.. BniEdcAdapter
    EdcTerminalAdapter <|.. MandiriEdcAdapter
```

---

## Event Flow & Data Lifecycle (Checkout & Payment Flow)
Berikut adalah alur data lengkap saat kasir memproses transaksi QRIS/Card di kasir POS:

```mermaid
sequenceDiagram
    autonumber
    actor Kasir
    participant POS_Client as POS Javascript (pos.js)
    participant API as POS API Controller (SalesController)
    participant SalesServ as SalesService
    participant PayServ as PaymentGatewayService
    participant DB as Tenant Database (MySQL)

    Kasir->>POS_Client: Pilih menu & Klik "Bayar Sekarang"
    POS_Client->>API: HTTP POST /api/payment-transaction (Method: QRIS)
    API->>PayServ: create(payload)
    PayServ->>PayServ: Hitung MDR & Biaya Transaksi
    PayServ->>DB: Simpan payment_transactions (Status: PENDING)
    PayServ->>PayServ: Request QRIS Dinamis ke Gateway (Xendit/Midtrans)
    PayServ-->>API: Response QR Payload + URL QR
    API-->>POS_Client: HTTP 200 (QR Payload)
    POS_Client->>POS_Client: Tampilkan QR Modal ke Customer
    Note over POS_Client: Polling status pembayaran / sync status
    Note over Customer: Customer scan QR & Bayar sukses
    POS_Client->>API: HTTP PUT /api/payment-transaction/:id/confirm
    API->>PayServ: confirm(id)
    PayServ->>DB: Update payment_transactions (Status: PAID)
    PayServ-->>POS_Client: HTTP 200 (Status: SUCCESS)
    POS_Client->>API: HTTP POST /api/order (Submit Sales Order)
    API->>SalesServ: createOrder(orderPayload)
    SalesServ->>DB: Insert orders & order_items
    SalesServ->>DB: Kurangi stok bahan mentah (Recipe usage deduction)
    SalesServ->>DB: Log stock_movements
    SalesServ-->>POS_Client: HTTP 200 (Order Saved)
    POS_Client->>POS_Client: Cetak Struk Fisik & Bersihkan Cart
```
