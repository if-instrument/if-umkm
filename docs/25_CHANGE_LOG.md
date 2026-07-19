# 25. Analysis Change Log

Catatan riwayat hasil audit source code, modifikasi, dan penyusunan dokumentasi teknis pada project Aplikasi UMKM (IFresso Coffee).

---

### Audit Info
- **Tanggal Audit**: 20 Juli 2026
- **Versi Project**: 1.0.0 (Coffee-v151)
- **Metode**: Reverse Engineering & Static Code Analysis

---

## Riwayat Perubahan Terkini (Session Changes)

### 1. Perbaikan Alur Pembayaran Online & Bukti Transfer
- **File Dimodifikasi**:
  - `app/Presenters/Page/PosPagePresenter.php`
  - `public/scripts/pages/pos.js`
- **Deskripsi Perubahan**:
  - Menambahkan field `paymentProofUrl` dan `paymentProofNote` ke presenter POS agar data gambar bukti bayar terkirim dari database ke client-side.
  - Menghapus rendering bukti bayar di list card drawer antrean kasir agar layout bersih, dan memindahkannya ke modal **Bill Confirmation** (khusus mode approval).
  - Mengimplementasikan logika *auto-select* metode pembayaran pada modal Bill Confirmation agar secara otomatis mencocokkan pilihan awal pelanggan (misal: QRIS).
  - Menyembunyikan panel status online gateway pembayaran untuk order online yang menggunakan bukti bayar QRIS offline agar tidak membingungkan kasir dengan pesan status "Belum dibuat".

### 2. Resolusi Konflik Tampilan Modal (Z-Index)
- **File Dimodifikasi**:
  - `public/styles.css`
- **Deskripsi Perubahan**:
  - Mengubah z-index `data-qris-payment-backdrop` dan `data-card-payment-backdrop` ke `120`.
  - Mengubah z-index `#qris-payment-modal` dan `#card-payment-modal` ke `121`.
  - **Dampak**: Memastikan modal pembayaran QRIS dan Card fisik muncul tepat di atas modal Bill Confirmation (z-index 110/111) saat checkout, menghindari modal tersembunyi di bawah backdrop.

### 3. Logika Gateway Dinamis (Manual Mode Adaptation)
- **File Dimodifikasi**:
  - `public/scripts/pages/settings.js`
  - `public/scripts/pages/pos.js`
- **Deskripsi Perubahan**:
  - **Pengaturan**: Menonaktifkan opsi mode `online` pada pengaturan QRIS/Card di tab metode pembayaran secara dinamis jika setelan gateway global diset ke **`manual`**.
  - **POS Kasir**: Membuat `isOfflineQrisPayment()`, `selectedPaymentGatewayLabel()`, `qrisModalData()`, dan `renderBillDetail` secara otomatis beralih ke mode offline/static jika setelan gateway global diset ke **`manual`**, meskipun metode bayar di database belum diubah.

---

## Log Dokumen Hasil Analisis (docs/)
- Seluruh 25 dokumen analisis teknis dan arsitektur bisnis telah selesai disusun di direktori `/docs` dari file `01_PROJECT_OVERVIEW.md` hingga `25_CHANGE_LOG.md` tanpa ada placeholder atau TODO.
