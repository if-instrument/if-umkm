# 19. Security Analysis & Vulnerability Assessment

Analisis mendalam terhadap mekanisme keamanan data, kontrol akses, proteksi injeksi, dan kepatuhan standar keamanan pada Aplikasi UMKM.

---

## 1. Mekanisme Keamanan Saat Ini (Existing Security Mechanisms)

### Autentikasi JWT (Stateless Authentication)
- **Implementasi**: REST API backend diamankan sepenuhnya oleh filter `JwtAuthFilter` yang memeriksa keberadaan token JWT pada header `Authorization: Bearer <token>`.
- **Kekuatan**: Meniadakan kebutuhan penyimpanan session berbasis file/redis di server (stateless). Payload token menyimpan klaim kredensial sehingga server tidak perlu melakukan query user berulang untuk setiap request API.
- **Kelemahan**: Jika token JWT dicuri di sisi klien (karena disimpan di `localStorage` yang rentan terhadap serangan XSS), penyerang dapat langsung mengakses API tanpa batasan hingga masa berlaku token habis.

### Otorisasi Tingkat Endpoint (Role-Permission Matrix)
- **Implementasi**: Pemeriksaan hak akses menggunakan helper `canUsePermission($permissionKey, $action, $state, $session)` atau `$this->validatePermission()`. Setiap role pengguna memiliki struktur JSON permissions yang memetakan permission key (seperti `pos.payment`, `settings.outlet`) ke tipe akses (`create`, `read`, `update`, `delete`).
- **Kekuatan**: Matriks permission sangat terperinci dan dinamis, memungkinkan perubahan hak akses staff tanpa perlu menulis ulang baris kode PHP.
- **Kelemahan**: Perlindungan otorisasi ini harus dipanggil secara manual di setiap method controller. Kelemahan manusia (human error) dapat menyebabkan developer lupa menuliskan cek otorisasi pada endpoint baru.

### Proteksi Injeksi SQL (SQL Injection Prevention)
- **Implementasi**: Framework CodeIgniter 4 menggunakan PDO driver dengan prepared statements untuk seluruh interaksi database yang dijalankan via Query Builder atau Model.
- **Kekuatan**: Input data masukan dari klien secara otomatis di-escaping dan dipisahkan dari struktur logika query SQL, melumpuhkan serangan SQL Injection dasar secara total.

### Isolasi Multi-Tenant (Tenant Data Isolation)
- **Implementasi**: Middleware mempartisi database per tenant secara fisik menggunakan dedicated databases.
- **Kekuatan**: Mencegah kebocoran data lintas perusahaan secara absolut di level server database. Tenant A tidak mungkin membaca data tabel Tenant B karena kredensial koneksi SQL-nya terpisah total.

---

## 2. Rekomendasi Penguatan Keamanan (Security Recommendations)

### 1. Migrasi Penyimpanan JWT Klien ke Secure HttpOnly Cookie
- **Masalah**: Token JWT saat ini disimpan di browser klien via `localStorage.setItem('session', ...)` yang dapat dibaca oleh script Javascript jahat melalui serangan Cross-Site Scripting (XSS).
- **Rekomendasi**: Ubah mekanisme login agar server mengembalikan token JWT di dalam header `Set-Cookie` dengan flag `HttpOnly`, `Secure`, dan `SameSite=Strict`. Langkah ini meniadakan akses Javascript terhadap token dan mencegah pencurian session via XSS.

### 2. Implementasi JWT Refresh Token & Rotasi Kunci
- **Masalah**: Token JWT saat ini memiliki masa aktif tunggal yang jika diset terlalu lama akan meningkatkan risiko penyalahgunaan token curian.
- **Rekomendasi**: Implementasikan dual-token flow:
  - **Access Token**: Masa aktif singkat (misal: 15 menit).
  - **Refresh Token**: Disimpan di secure cookie, masa aktif lama (misal: 7 hari) untuk memperbarui access token secara otomatis tanpa memaksa user login ulang.

### 3. Penerapan Rate Limiting pada API Sensitif
- **Masalah**: Endpoint login (`/api/auth/login`) dan submit order (`/api/public/order`) tidak dibatasi frekuensi request-nya, sehingga rentan terhadap serangan brute-force password dan spamming pesanan palsu.
- **Rekomendasi**: Aktifkan fitur Throttle / Rate Limiter bawaan CodeIgniter 4 pada grup route `/api/auth/` dan `/api/public/` untuk membatasi maksimal 5 request per menit per alamat IP.

### 4. Enkripsi Payload Log Gateway Keuangan
- **Masalah**: Log response payload dari Xendit/Midtrans di tabel `payment_transaction_logs` disimpan dalam bentuk teks JSON polos (*plain text*), yang mungkin mengandung data pribadi sensitif pelanggan.
- **Rekomendasi**: Enkripsi kolom `request_payload` dan `response_payload` sebelum ditulis ke database menggunakan library `Encryption` bawaan CodeIgniter 4 (`AES-256-CTR`).
