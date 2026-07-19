# 08. Non-Functional Requirements

Dokumentasi spesifikasi arsitektur non-fungsional sistem Aplikasi UMKM (IFresso Coffee).

---

## 1. Security

### Authentication
- Menggunakan stateless token **JSON Web Tokens (JWT)** untuk mengamankan komunikasi REST API antara POS Client / Online Store dengan server backend.
- Token JWT ditandatangani dengan algoritma HMAC SHA-256 (`JWT_SECRET`) dan memiliki masa kadaluarsa (TTL) tetap.
- Token menyimpan payload `claims` yang mencakup `userId`, `email`, `authType` (`super_admin`, `company_admin`, `outlet_user`), `companyId`, `companySlug`, dan `outletId`.

### Authorization
- Otorisasi diatur di tingkat filter (`Filters/JwtAuthFilter.php`) dan service layer.
- Sistem membatasi operasi CRUD berdasarkan permission matrix dari role user (`roles.permissions`).
- Pembatasan data dilakukan secara horizontal melalui query scope: `outlet_user` hanya dapat mengakses entitas yang memiliki `outlet_id` sesuai klaim token mereka.

### Database Isolation & Safety
- **Tenant Isolation**: Setiap tenant yang dikonfigurasi dalam mode `dedicated` terisolasi secara fisik ke dalam database terpisah. Kesalahan query atau kebocoran data di satu tenant tidak akan mempengaruhi tenant lain.
- **SQL Injection Prevention**: Seluruh interaksi database backend diimplementasikan menggunakan Query Builder CodeIgniter 4 atau model binding yang secara otomatis mengikat (*binding*) parameter masukan dan menepis SQL injection.
- **Password Hashing**: Kata sandi pengguna disimpan menggunakan algoritma hashing satu arah **bcrypt** yang kuat via fungsi `password_hash()` bawaan PHP.

### Input Validation & Sanitization
- API controllers menggunakan library validasi bawaan (`Config/Validation.php`) untuk memastikan format input JSON (seperti format email, numeric amount, minimum stock) sudah valid sebelum diproses.
- Input string disanitasi untuk mencegah serangan Cross-Site Scripting (XSS).

---

## 2. Performance

### Response Time
- **Page Load Speed**: Halaman UI utama dirancang sebagai file HTML/CSS/JS statis yang ringan (Single Page Application). Waktu pemuatan awal halaman kurang dari 1.5 detik pada koneksi internet standar (3G/4G).
- **REST API Latency**: Rata-rata response time API backend (seperti pencarian produk, update cart) berada di bawah 200ms.
- **Bootstrap Payload Optimization**: Pemuatan halaman POS menggunakan database presenter terpadu (`PosPagePresenter`) untuk mengambil setelan, produk, kategori, modifier, bahan, dan transaksi dalam satu request tunggal guna meminimalkan delay handshaking HTTP.

### Client-Side Render
- Seluruh rendering data POS dan inventaris dilakukan secara asinkron di browser klien (*Client-Side Rendering*) menggunakan Vanilla JS, mengurangi penggunaan CPU dan bandwidth web server.
- Pencarian produk dan penyaringan kategori dilakukan di level local state memory kasir (in-memory filtering) sehingga pencarian instan tanpa *lag* server.

---

## 3. Scalability

### Database Scalability
- Arsitektur **hybrid tenancy** memungkinkan pemindahan tenant besar yang memiliki jutaan transaksi ke database server terpisah tanpa perlu mengubah kode aplikasi utama.
- Dukungan dynamic provisioning: Penambahan tenant baru akan memicu CLI script `ProvisionTenantDatabases` untuk membuat database MySQL secara otomatis.

### Application Scalability
- Karena backend API bertindak secara *stateless* (tidak menyimpan session di memori web server, melainkan di JWT client), web server PHP dapat dengan mudah didistribusikan di balik Load Balancer (Auto-Scaling Group) untuk menangani jutaan request simultan.

---

## 4. Reliability & Availability

### Database Transactions
- Semua operasi bisnis yang bersifat multi-tabel (seperti proses checkout yang melibatkan pembuatan order, pengurangan stok bahan baku, pembuatan data jurnal, dan perubahan status pembayaran) dibungkus di dalam transaksi database (`$this->db->transStart()` dan `$this->db->transComplete()`).
- Jika terjadi kegagalan sistem di tengah proses, seluruh perubahan database akan di-*rollback* secara otomatis untuk menjaga integritas data.

### Error Handling
- Aplikasi menggunakan global exception handler yang dikonfigurasi di `Config/Exceptions.php`.
- Jika terjadi error pada API terproteksi, server mengembalikan respon JSON terstruktur dengan HTTP Status Code yang sesuai (misalnya: 400 Bad Request, 401 Unauthorized, 422 Unprocessable Entity, 500 Internal Server Error) dan tidak menampilkan *stack trace* mentah PHP ke publik demi alasan keamanan.

### Independent Failure Blast Radius
- Karena setiap tenant berada di database terpisah, jika terjadi kerusakan tabel atau crash pada database server tenant A, layanan untuk tenant B, C, dan lainnya tetap berjalan normal tanpa gangguan (Blast Radius < 5%).

---

## 5. Logging, Monitoring & Audit Trail

### Application Logs
- Log sistem backend ditulis ke direktori `writable/logs/` menggunakan logger bawaan CodeIgniter 4 berdasarkan level error (`critical`, `error`, `debug`).
- Log mencakup histori error exception, query database yang lambat, dan kegagalan auth.

### Payment Gateway Logs
- Setiap pembuatan payment request ke pihak ketiga, pengiriman request parameter, response payload, dan sinkronisasi status dari Xendit/Midtrans dicatat secara permanen di dalam tabel `payment_transaction_logs` untuk mempermudah investigasi selisih keuangan.
- Log transaksi pembayaran dapat diakses oleh admin perusahaan melalui UI audit gateway.

### Order Audit Trail
- Setiap perubahan status pesanan dicatat ke log histori status order (`recordStatusLog`) yang merekam:
  - Waktu perubahan status.
  - User pelaku perubahan (`actor_type` & `actor_name`).
  - Status sebelum dan sesudah.
  - Catatan atau alasan perubahan.

### Inventory Audit Trail
- Pergerakan keluar-masuk stok bahan baku dicatat secara rinci di tabel `stock_movements`. Setiap baris mencatat saldo awal stok, jumlah masuk/keluar, saldo akhir stok, ID pembelian/penjualan referensi, serta identitas staf gudang pembuat mutasi.
