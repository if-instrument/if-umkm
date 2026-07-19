# 23. Test Scenarios & Automation Cases

Rancangan skenario pengujian (*Test Scenarios*) untuk memverifikasi fungsionalitas, integrasi, dan ketahanan sistem Aplikasi UMKM (IFresso Coffee).

---

## 1. Skenario Uji Fungsional (Functional Tests)

### TS-POS-01: Transaksi Tunai (Cash Checkout)
- **Tujuan**: Memastikan kasir dapat memproses transaksi tunai dengan kembalian secara akurat.
- **Langkah Pengujian**:
  1. Login sebagai kasir, buka halaman POS.
  2. Tambahkan "Kopi Susu Aren" (Qty: 2, Harga: @Rp 18.000) ke keranjang.
  3. Klik "Bayar Sekarang", pilih metode "Cash".
  4. Masukkan nominal bayar "Rp 50.000" pada field nominal.
  5. Pastikan kembalian terhitung otomatis "Rp 14.000".
  6. Klik "Konfirmasi Bayar".
- **Hasil yang Diharapkan**:
  - Saldo stok bahan baku pembuat Kopi Susu Aren berkurang di database.
  - Record order baru tersimpan dengan status `completed` dan `payment_status` bernilai `paid`.
  - Printer thermal mencetak struk dengan detail item dan kembalian yang cocok.

### TS-APP-01: Penerimaan Online Order (Approve QRIS Offline)
- **Tujuan**: Memverifikasi alur penerimaan pesanan pelanggan mandiri dengan bukti transfer manual.
- **Langkah Pengujian**:
  1. Sebagai pelanggan, buka menu online via scan QR meja.
  2. Pesan produk "Kopi Hitam", pilih "QRIS Static", upload bukti bayar gambar acak (.png), klik order.
  3. Sebagai kasir, buka laci "Approve Pesanan Online".
  4. Klik tombol "Detail" pada order yang masuk.
  5. Pastikan gambar bukti bayar yang diunggah terlihat jelas di modal.
  6. Klik "Approve & Bayar".
- **Hasil yang Diharapkan**:
  - Modal tertutup otomatis.
  - Status order di server berubah menjadi `waiting` (kirim ke dapur).
  - Status pembayaran order diperbarui menjadi `paid`.

---

## 2. Skenario Uji Integrasi (Integration & System Tests)

### TS-INT-01: Dynamic Tenant Database Connection Switching
- **Tujuan**: Memverifikasi filter secara dinamis membelokkan koneksi SQL ke database tenant yang benar.
- **Langkah Pengujian**:
  1. Kirim HTTP GET `/api/dashboard` dengan Header `Authorization: Bearer <Token_Tenant_A>`.
  2. Verifikasi data penjualan yang tampil berasal dari database Tenant A.
  3. Kirim HTTP GET `/api/dashboard` dengan Header `Authorization: Bearer <Token_Tenant_B>`.
  4. Verifikasi data penjualan yang tampil berasal dari database Tenant B.
- **Hasil yang Diharapkan**:
  - Respon API mengembalikan data finansial yang terisolasi sempurna.
  - Tidak ada data Tenant A yang bocor ke respon Tenant B (HTTP status 200).

### TS-INT-02: Recipe Stock Deduction & Movement Logging
- **Tujuan**: Memastikan resep (BOM) memotong stok bahan mentah dan menulis log mutasi secara benar.
- **Langkah Pengujian**:
  1. Catat stock bahan "Espresso Blend" (Stok Awal: 1000 gr) dan "Susu UHT" (Stok Awal: 1000 ml).
  2. Produk "Latte" memiliki resep: Espresso Blend (20 gr) dan Susu UHT (150 ml).
  3. Lakukan penjualan "Latte" (Qty: 2) di POS kasir.
  4. Periksa saldo akhir stok bahan di tabel `outlet_ingredients`.
- **Hasil yang Diharapkan**:
  - Saldo akhir Espresso Blend = 960 gr (berkurang $2 \times 20$ gr).
  - Saldo akhir Susu UHT = 700 ml (berkurang $2 \times 150$ ml).
  - Tercipta 2 baris baru di tabel `stock_movements` dengan tipe `sales_deduction` mencatat pengurangan tersebut.

---

## 3. Skenario Kasus Batas & Negatif (Edge Cases & Negative Tests)

### TS-NEG-01: Under-tendering Cash Payment
- **Tujuan**: Memastikan sistem menolak checkout cash jika uang yang diterima kurang dari total bill.
- **Langkah Pengujian**:
  1. Tambahkan menu dengan total belanja Rp 45.000 ke cart POS.
  2. Buka panel checkout cash, input nominal bayar Rp 40.000.
  3. Klik "Konfirmasi Bayar".
- **Hasil yang Diharapkan**:
  - Sistem menampilkan pesan error "Nominal bayar cash belum cukup."
  - Transaksi tidak tersimpan ke database.

### TS-NEG-02: Dedicated Database Target Offline
- **Tujuan**: Menguji ketahanan sistem jika server database tenant terpisah mengalami gangguan / mati.
- **Langkah Pengujian**:
  1. Konfigurasi perusahaan tenant C untuk menggunakan database dedicated di host eksternal yang dimatikan.
  2. Lakukan login sebagai admin tenant C.
- **Hasil yang Diharapkan**:
  - Sistem tidak menampilkan halaman blank/white-screen.
  - Server mengembalikan respon error JSON terstruktur (HTTP 422) dengan pesan: "Koneksi database tenant gagal dibangun. Silakan hubungi admin pusat."
