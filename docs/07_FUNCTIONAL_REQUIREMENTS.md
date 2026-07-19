# 07. Functional Requirements

Daftar kebutuhan fungsional (Functional Requirements) Aplikasi UMKM (IFresso Coffee).

---

## Modul A: Keamanan & Otorisasi

### FR-SEC-01: Autentikasi JWT
- **Deskripsi**: Sistem harus memverifikasi kredensial pengguna (email dan password) dan mengembalikan token JWT jika berhasil.
- **Trigger**: Pengguna menekan tombol "Login" pada halaman login.
- **Input**: `email`, `password` (string).
- **Output**: JSON payload berisi Token JWT (`token`), data profile user, dan daftar outlet.
- **Business Rule**: Password harus diverifikasi menggunakan `password_verify` terhadap bcrypt hash. Token JWT yang dihasilkan harus menyimpan claim ID perusahaan tenant terkait.
- **Dependency**: `JwtService`, `UserModel`.

### FR-SEC-02: Dynamic Tenant Connection Routing
- **Deskripsi**: Sistem harus mengalihkan koneksi database secara dinamis di runtime berdasarkan route segment `/company-slug/` atau claim token JWT yang dikirimkan.
- **Trigger**: Setiap request HTTP masuk ke API terproteksi atau halaman detail tenant.
- **Input**: Segment URL `company-slug` atau request header `Authorization`.
- **Output**: Penggantian setelan database group `default` di memori runtime ke database target tenant.
- **Business Rule**: Jika tipe tenant adalah `dedicated`, koneksi dialihkan ke database terpisah yang didefinisikan pada kolom `db_name` di central database. Jika database tidak dapat dibuka, kembalikan HTTP 422 "Database tidak ditemukan".
- **Dependency**: `TenantDatabaseService`, `Filters/JwtAuthFilter`.

---

## Modul B: Point of Sale (POS) & Checkout

### FR-POS-01: Sales Order Checkout
- **Deskripsi**: Sistem harus dapat menyimpan transaksi POS kasir langsung ke database dan memicu pemotongan stok bahan baku.
- **Trigger**: Kasir menekan tombol "Bayar Sekarang" di cart sidebar POS.
- **Input**: JSON payload berisi array items (produk, qty, modifiers), total bayar, metode pembayaran, nominal uang tunai diterima (`cashTendered`), dan kembalian (`changeDue`).
- **Output**: Object data transaksi order tersimpan (`orders` & `order_items`).
- **Business Rule**: 
  - Jika metode bayar tunai (Cash), `cashTendered` harus $\ge$ grand total tagihan.
  - Untuk setiap item produk non-stok jadi, sistem wajib mengambil resep produk dan memotong stok bahan baku mentah di tabel `outlet_ingredients`.
- **Dependency**: `SalesService`, `InventoryService`, `OrderModel`, `OrderItemModel`.

### FR-POS-02: Settlement Bill Open Table
- **Deskripsi**: Sistem harus mendukung penutupan bill meja (*table settlement*) untuk model restoran dine-in bayar belakangan.
- **Trigger**: Kasir membuka bill meja berjalan dan mengklik "Konfirmasi Bayar".
- **Input**: `orderId`, `paymentMethod`.
- **Output**: Update data order ke status lunas (`payment_status = 'paid'`).
- **Business Rule**: Status meja makan (`dining_tables.status`) harus diubah kembali menjadi kosong/bersih setelah settlement selesai.
- **Dependency**: `SalesService`, `DiningTableModel`.

---

## Modul C: Pemesanan Online Pelanggan & Approval

### FR-ONL-01: Customer QR Ordering
- **Deskripsi**: Pelanggan harus dapat membuat pesanan mandiri melalui web menu dengan men-scan QR code di meja.
- **Trigger**: Pelanggan menekan tombol "Confirm Order" di keranjang e-commerce pelanggan.
- **Input**: Nama pelanggan, nomor telepon, metode bayar pilihan, daftar produk belanja, and file bukti bayar (apabila memilih QRIS Static/Transfer).
- **Output**: Pembuatan record order baru dengan status awal `PENDING_CASHIER`.
- **Business Rule**: 
  - Jika pelanggan memilih metode non-tunai offline, upload gambar bukti transfer bersifat wajib (*mandatory*). File yang diunggah harus bertipe JPG, PNG, atau WEBP maksimal 3 MB.
- **Dependency**: `PublicOrderService`, `OrderNotificationService`.

### FR-ONL-02: Cashier Order Approval
- **Deskripsi**: Kasir harus dapat meninjau, menyetujui, atau menolak pesanan online pelanggan dari antrean kasir.
- **Trigger**: Kasir menekan tombol "Approve & Bayar" atau "Reject" di modal detail order online.
- **Input**: `orderId`, metode bayar yang diverifikasi kasir.
- **Output**: Status order diperbarui menjadi `WAITING` (Kirim ke dapur) jika di-approve, atau `CANCELLED` jika di-reject.
- **Business Rule**: 
  - Saat menekan detail approval order online dengan bukti bayar QRIS offline, modal Bill Confirmation harus menampilkan gambar bukti bayar asli secara langsung.
  - Dropdown metode bayar modal approval otomatis diarahkan ke metode bayar order pelanggan.
  - Panel gateway online disembunyikan apabila transaksi menggunakan QRIS static/offline.
- **Dependency**: `SalesService`, `OrderModel`.

---

## Modul D: Inventarisasi & Formula Resep

### FR-INV-01: Bahan Baku Inventory Adjustment (Stock In/Out)
- **Deskripsi**: Sistem harus mencatat penambahan stok (pembelian) atau pengurangan stok (kerusakan/opname) bahan baku lokal di outlet.
- **Trigger**: Manajer outlet menyimpan form form pembelian bahan atau log inventaris rusak.
- **Input**: `ingredientId`, `qty`, unit cost, `notes`.
- **Output**: Pembaruan kolom `stock_qty` bahan baku terkait dan penulisan log `stock_movements`.
- **Business Rule**: Nilai average cost (`average_cost`) bahan dihitung ulang secara otomatis jika metode costing perusahaan adalah Weighted Average Costing:
  $$\text{Average Cost Baru} = \frac{(\text{Stok Lama} \times \text{Average Cost Lama}) + (\text{Qty Masuk} \times \text{Harga Beli Unit})}{(\text{Stok Lama} + \text{Qty Masuk})}$$
- **Dependency**: `InventoryService`, `StockMovementModel`.
