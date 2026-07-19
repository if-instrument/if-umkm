# 20. Code Quality Analysis & Anti-Patterns

Analisis mendalam terhadap kualitas struktur penulisan kode (*Code Quality*), identifikasi *Code Smells*, *Anti-Patterns*, *Dead Code*, dan keterikatan erat (*Tight Coupling*) pada Aplikasi UMKM.

---

## 1. Identifikasi God Object

### File: `public/scripts/pages/pos.js` (Ukuran: >3,400 Baris)
- **Deskripsi**: File javascript ini menampung seluruh fungsionalitas halaman kasir POS. Ia mengelola visual DOM, input keyboard virtual (numpad), pencetakan thermal struk, logika keranjang belanja (cart), polling status QRIS, modal approval pesanan online, status checklist kitchen, perpindahan meja, pencarian produk, hingga logic diskon member CRM.
- **Dampak Anti-Pattern**: File menjadi sangat sulit dipelihara, rentan konflik git (*merge conflicts*), memperlambat waktu parsing browser, dan melanggar prinsip **Single Responsibility Principle (SRP)**.

---

## 2. Long Functions (Fungsi Terlalu Panjang)

### Fungsi: `renderBillDetail()` (`pos.js` L-920 s/d L-1038)
- **Analisis**: Berfungsi merender tampilan detail bill modal. Fungsi ini mencampur logika manipulasi state (mengatur active payment method, validasi metode bayar), logika formatting angka, dan penulisan blok HTML string template yang masif.
- **Rekomendasi**: Pisahkan logika penentuan elemen modal (cash fields, gateway panel) ke fungsi-fungsi presenter kecil terpisah, lalu gunakan `renderBillDetail` hanya untuk penggabungan DOM akhir.

### Fungsi: `checkout()` (`pos.js` L-2698 s/d L-2870)
- **Analisis**: Berfungsi melakukan proses checkout POS. Fungsi ini memiliki kompleksitas kognitif yang sangat tinggi karena menangani validasi stok kemasan, kalkulasi harga diskon modifier, cek preorder, pembuatan transaksi database via Ajax, print struk, hingga resetting cart dalam satu fungsi tunggal.

---

## 3. Duplicate Code (Duplikasi Kode)

### Logika Verifikasi Pembayaran Tunai & Non-Tunai
- **Lokasi Duplikasi**:
  - `paymentMetaForCheckout()` (`pos.js` L-2303 s/d L-2338)
  - `paymentMetaForBill()` (`pos.js` L-1082 s/d L-1127)
- **Analisis**: Kedua fungsi ini memiliki kode verifikasi yang hampir sama persis untuk mengecek apakah nominal cash cukup, membuat request transaksi payment gateway online, memicu polling status, dan menyusun metadata payment offline.
- **Rekomendasi**: Satukan kedua logika ini menjadi satu fungsi utilitas terpusat, misalnya `resolvePaymentMetadata(total, orderNumber, context)`.

---

## 4. Tight Coupling (Ketergantungan Erat)

### Controller dan Presenter Layer
- **Lokasi**: `PosController::bootstrap()`, `SettingsPageController::bootstrap()`
- **Analisis**: Controller memanggil fungsi bootstrap presenter yang secara statis merender data database. Controller sangat bergantung pada struktur array yang dikembalikan oleh presenter, sehingga perubahan kecil pada struktur data presenter dapat langsung merusak respon API Controller terkait.
- **Rekomendasi**: Terapkan Data Transfer Object (DTO) untuk standarisasi pertukaran data antar layer.
