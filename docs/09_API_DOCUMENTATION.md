# 09. REST API Documentation

REST API Aplikasi UMKM (IFresso Coffee) terdiri dari grup route publik (unprotected) dan route terproteksi (`jwt-auth`).

---

## 1. Group Route Publik (No Auth)

### Autentikasi & Undangan
- **`POST /api/auth/login`**
  - **Fungsi**: Verifikasi email/password kasir/admin, mengembalikan JWT token.
  - **Body**: `{ "email": "string", "password": "string" }`
  - **Response**: `{ "ok": true, "data": { "token": "string", "user": {}, "outlets": [] } }`
- **`GET /api/invitation/(:segment)`**
  - **Fungsi**: Memeriksa validitas kode undangan karyawan baru.
  - **Response**: `{ "ok": true, "data": { "email": "string", "companyName": "string" } }`
- **`POST /api/invitation/(:segment)/accept`**
  - **Fungsi**: Menerima undangan, menginput nama, password, dan membuat akun user aktif.
  - **Body**: `{ "name": "string", "password": "string" }`
  - **Response**: `{ "ok": true, "data": true }`
- **`GET /api/tenants`**
  - **Fungsi**: Mengembalikan daftar seluruh tenant perusahaan aktif di platform.
- **`GET /api/tenant/(:segment)`**
  - **Fungsi**: Membaca detail tenant berdasarkan route slug perusahaan.

### Pemesanan Mandiri Pelanggan (QR Order)
- **`GET /api/public/order/bootstrap`**
  - **Fungsi**: Mengambil data katalog menu, status outlet, dan opsi pembayaran untuk browser pelanggan.
  - **Response**: `{ "ok": true, "data": { "outlet": {}, "products": [], "paymentMethods": [] } }`
- **`GET /api/public/order/member`**
  - **Fungsi**: Pengecekan status loyalitas CRM pelanggan via nomor telepon.
  - **Params**: `?phone=0812...`
- **`POST /api/public/order`**
  - **Fungsi**: Kirim pesanan mandiri meja. Mendukung upload file bukti bayar transfer.
  - **Body**: Multipart form-data (`company_id`, `outlet_id`, `service_type`, `table_name`, `customer_name`, `customer_phone`, `items` [JSON], `payment_proof` [File]).
  - **Response**: `{ "ok": true, "data": { "id": "string", "orderNumber": "string", "status": "pending_cashier" } }`
- **`POST /api/webhook/xendit`**
  - **Fungsi**: Callback dari Xendit API saat status invoice/QRIS dinamis terbayar.
- **`GET /api/public/card-payment/(:segment)`**
  - **Fungsi**: Mengecek status invoice EDC kartu online dari ponsel pelanggan.
- **`POST /api/public/card-payment/(:segment)/sync`**
  - **Fungsi**: Sinkronisasi status EDC manual.

---

## 2. Group Route Terproteksi (`jwt-auth`)

Semua endpoint berikut wajib menyertakan header `Authorization: Bearer <JWT_Token>`.

### A. Modul Perusahaan (Company) & Gerai (Outlet)
- **`GET /api/company`** - Membaca daftar perusahaan.
- **`GET /api/company/(:segment)`** - Membaca detail data perusahaan.
- **`POST /api/company`** - Registrasi tenant perusahaan baru (hanya Super Admin).
- **`PUT /api/company/(:segment)`** - Mengupdate setelan logo/warna tema perusahaan.
- **`DELETE /api/company/(:segment)`** - Menghapus tenant perusahaan.
- **`POST /api/company/(:segment)/invite-admin`** - Mengirim undangan admin utama.
- **`POST /api/company-logo`** - Upload file logo perusahaan.
- **`GET /api/outlet`** - Daftar gerai cabang aktif.
- **`POST /api/outlet`** - Membuat gerai baru.
- **`PUT /api/outlet/(:segment)`** - Update alamat/nama gerai.
- **`DELETE /api/outlet/(:segment)`** - Nonaktifkan gerai.

### B. Otorisasi Pengguna (User & Role)
- **`GET /api/role`** - Membaca daftar jabatan role perusahaan.
- **`POST /api/role`** - Membuat role baru & mendefinisikan permission matrix JSON.
- **`PUT /api/role/(:segment)`** - Edit permission role.
- **`DELETE /api/role/(:segment)`** - Hapus role.
- **`GET /api/user`** - Daftar karyawan.
- **`POST /api/user`** - Menambah data karyawan baru.
- **`PUT /api/user/(:segment)`** - Edit data karyawan (nama/status).
- **`POST /api/user/(:segment)/invite`** - Mengirim ulang email undangan aktifasi password.
- **`DELETE /api/user/(:segment)`** - Cabut akses karyawan.

### C. Halaman Bootstrap Data
Mengambil bundel data konfigurasi dan cache untuk dimuat di frontend SPA.
- **`GET /api/page/pos/bootstrap`** - Data master POS kasir.
- **`GET /api/page/settings/bootstrap`** - Data master form pengaturan.
- **`GET /api/page/users/bootstrap`** - Data master manajemen user.
- **`GET /api/page/products/bootstrap`** - Data katalog & modifier.
- **`GET /api/page/inventory/bootstrap`** - Data bahan & opname.
- **`GET /api/page/finance/bootstrap`** - Data pengeluaran operasional.

### D. Setelan Operasional (Settings)
- **`GET /api/setting`** - Membaca parameter operasional outlet (PPN, service rate).
- **`PUT /api/setting`** - Update parameter operasional.
- **`GET /api/printer`** - Daftar device printer thermal di outlet.
- **`GET /api/dining-table`** - Daftar meja makan.
- **`POST /api/dining-table`** - Membuat meja makan baru.
- **`PUT /api/dining-table/(:segment)`** - Edit kapasitas/nama meja.
- **`DELETE /api/dining-table/(:segment)`** - Hapus meja.
- **`GET /api/payment-method`** - Daftar metode pembayaran outlet.
- **`POST /api/payment-method`** - Membuat metode pembayaran baru.
- **`PUT /api/payment-method/(:segment)`** - Edit detail EDC / QRIS Static image.
- **`DELETE /api/payment-method/(:segment)`** - Nonaktifkan metode pembayaran.
- **`POST /api/payment-method-qris-image`** - Upload gambar QRIS Static outlet.
- **`GET /api/packaging-rule`** - Daftar kemasan otomatis.
- **`POST /api/packaging-rule`** - Membuat aturan kemasan baru.

### E. Manajemen Inventaris (Inventory)
- **`GET /api/ingredient-template`** - Master bahan baku perusahaan.
- **`POST /api/ingredient-template`** - Tambah item bahan template.
- **`GET /api/ingredient`** - Stok bahan lokal outlet.
- **`POST /api/ingredient`** - Tambah bahan lokal baru.
- **`PUT /api/ingredient/(:segment)`** - Update average cost / min stock.
- **`PUT /api/ingredient-mapping`** - Pemetaan relasi template bahan ke outlet.
- **`GET /api/stock-movement`** - Log mutasi stok.
- **`POST /api/purchase`** - Input pembelian bahan baru (menambah stok).
- **`POST /api/inventory-loss`** - Input barang rusak/waste (mengurangi stok).

### F. Katalog Produk & Resep (Product Suite)
- **`GET /api/category`** - Membaca kategori produk.
- **`POST /api/category`** - Membuat kategori baru.
- **`GET /api/product`** - Membaca katalog menu.
- **`POST /api/product`** - Menambah menu baru.
- **`PUT /api/product/(:segment)/price`** - Kustomisasi harga jual produk per outlet.
- **`PUT /api/product/(:segment)/category`** - Ubah kategori produk.
- **`POST /api/product/(:segment)/produce`** - Memproses produksi manual produk prepackaged (potong bahan mentah, tambah stok produk jadi).
- **`POST /api/product-batch/(:segment)/loss`** - Jurnal penyusutan batch produk jadi.
- **`GET /api/modifier`** - Daftar group modifier rasa/topping.
- **`POST /api/modifier`** - Membuat modifier group baru.
- **`GET /api/recipe`** - Membaca daftar resep produk.
- **`POST /api/recipe`** - Mengupdate/menyimpan baris resep produk baru.
- **`POST /api/product-image`** - Upload gambar produk menu.

### G. Transaksi POS & Order (Sales)
- **`GET /api/order`** - Membaca riwayat transaksi.
- **`POST /api/order`** - Checkout POS baru.
- **`PUT /api/order/(:segment)/status`** - Memperbarui status pesanan (WAITING -> PREPARING -> READY).
- **`PUT /api/order/(:segment)/ready-items`** - Menyimpan checklist produksi item per pesanan (KDS).
- **`PUT /api/order/(:segment)/settle`** - Settlement pembayaran dine-in/bill meja.
- **`PUT /api/order/(:segment)/approve`** - Penerimaan & approval order online.
- **`PUT /api/order/(:segment)/move-table`** - Pindah meja pelanggan dine-in.
- **`POST /api/payment-transaction`** - Request transaksi gateway baru.
- **`PUT /api/payment-transaction/(:segment)/confirm`** - Konfirmasi manual pembayaran.
- **`PUT /api/payment-transaction/(:segment)/cancel`** - Batalkan invoice pembayaran.

### H. CRM & Pengeluaran (CRM & Finance)
- **`GET /api/customer`** - Membaca daftar pelanggan.
- **`POST /api/customer`** - Mendaftarkan member baru.
- **`GET /api/customer-transaction`** - Histori belanja per member.
- **`GET /api/reports/profit-loss`** - Laporan laba rugi bulanan.
- **`GET /api/finance/expense`** - Daftar pengeluaran operasional outlet.
- **`POST /api/finance/expense`** - Tambah pengeluaran baru.
- **`DELETE /api/finance/expense/(:segment)`** - Hapus jurnal pengeluaran.
- **`GET /api/payment-gateway-log`** - Log detail API transaksi payment.
