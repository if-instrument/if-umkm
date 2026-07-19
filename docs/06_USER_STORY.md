# 06. User Stories

Dokumentasi user story beserta kriteria penerimaan (Acceptance Criteria) menggunakan format **Given-When-Then** (Gherkin).

---

## 1. Modul POS Kasir (Staf Kasir)

### US-POS-01: Settlement Bill Dine-In
- **Sebagai** Kasir POS
- **Saya ingin** memilih meja aktif, meninjau bill berjalan, dan melakukan settlement pembayaran tunai/non-tunai
- **Agar** meja tersebut kosong kembali dan transaksi tercatat lunas di database.
- **Kriteria Penerimaan (Acceptance Criteria)**:
  - **Given**: Pelanggan telah selesai makan dan meminta tagihan untuk Meja 03.
  - **When**: Kasir mengklik Meja 03 pada layout POS kasir dan memilih opsi "Lihat Bill".
  - **Then**: Sistem harus membuka modal Bill Confirmation yang menampilkan seluruh item pesanan, service charge, pajak, dan subtotal tagihan berjalan.
  - **And**: Kasir memilih metode pembayaran "QRIS" dan menekan "Konfirmasi Bayar".
  - **Then**: Sistem menampilkan status pembayaran lunas, mengosongkan status Meja 03 pada grid, memotong stok bahan baku, dan mencetak struk thermal lunas.

---

## 2. Modul Persetujuan Order Online (Staf Kasir)

### US-APP-01: Approval Pembayaran QRIS Offline
- **Sebagai** Kasir POS
- **Saya ingin** meninjau bukti bayar dari pesanan online pelanggan QRIS/Transfer offline
- **Agar** saya dapat meng-approve pembayaran sebelum pesanan diteruskan ke dapur untuk dimasak.
- **Kriteria Penerimaan (Acceptance Criteria)**:
  - **Given**: Pelanggan telah mengirim pesanan mandiri lewat QR Code Meja dengan metode bayar QRIS Static.
  - **When**: Kasir membuka laci "Approve Pesanan Online" dan mengklik detail order.
  - **Then**: Sistem menampilkan gambar bukti transfer/QRIS yang diunggah pelanggan di dalam modal Bill Confirmation.
  - **And**: Dropdown metode pembayaran otomatis terarah ke metode asal yaitu "QRIS" (kasir dapat mengubahnya manual jika diperlukan).
  - **And**: Panel petunjuk online gateway payment disembunyikan karena transaksi diselesaikan via bukti transfer manual.
  - **When**: Kasir memverifikasi kecocokan bukti bayar dan mengklik "Approve & Bayar".
  - **Then**: Sistem mengubah status pembayaran menjadi Lunas (PAID), status order menjadi WAITING (masuk antrean dapur), dan menyembunyikan order dari laci approval.

---

## 3. Modul Kitchen Display System (Staf Dapur)

### US-KIT-01: Pemantauan & checklist Produksi Dapur
- **Sebagai** Staf Dapur (Kitchen Staff)
- **Saya ingin** melihat daftar pesanan aktif yang berstatus WAITING dan mencentang setiap item produk yang selesai diproduksi
- **Agar** kasir dan pramusaji mengetahui makanan/minuman siap disajikan.
- **Kriteria Penerimaan (Acceptance Criteria)**:
  - **Given**: Pesanan online atau POS baru saja disetujui/dibayar dan dikirim ke dapur.
  - **When**: Staf Dapur membuka KDS drawer di antarmuka POS.
  - **Then**: Sistem menampilkan daftar pesanan aktif berstatus "Sedang Disiapkan".
  - **When**: Staf Dapur mencentang checkbox di samping item "Es Kopi Susu Aren".
  - **Then**: Sistem memperbarui data `readyItemKeys` pesanan tersebut di server tanpa me-reload halaman.
  - **And**: Jika seluruh item di pesanan telah tercentang, sistem mengubah status pesanan menjadi READY ("Siap Disajikan") dan mengirimkan notifikasi.

---

## 4. Modul Pemesanan Pelanggan (Pelanggan)

### US-CUST-01: QR Code Self-Ordering
- **Sebagai** Pelanggan di Outlet
- **Saya ingin** men-scan QR code di meja untuk membuka menu digital dan memesan menu secara langsung dari ponsel saya
- **Agar** saya tidak perlu mengantre di kasir atau menunggu pramusaji mencatat pesanan saya.
- **Kriteria Penerimaan (Acceptance Criteria)**:
  - **Given**: Pelanggan men-scan QR code di Meja 05 menggunakan kamera smartphone.
  - **When**: Browser ponsel membuka URL online menu khusus outlet tersebut.
  - **Then**: Sistem secara otomatis mengunci parameter meja ke "Meja 05".
  - **When**: Pelanggan memilih "Kopi Susu Aren" (Qty: 2), mengisi nama "Imam Faisal", memilih metode bayar "Cash di Kasir", dan menekan "Confirm Order".
  - **Then**: Sistem menyimpan pesanan ke server dengan status `PENDING_CASHIER` dan menampilkan halaman pelacakan status pesanan.

---

## 5. Modul Inventaris & HPP (Pemilik Bisnis)

### US-INV-01: Pengaturan Costing Method HPP Bahan Baku
- **Sebagai** Pemilik Bisnis (Company Admin)
- **Saya ingin** memilih metode penilaian persediaan bahan baku antara Weighted Average Costing atau Standard Costing
- **Agar** penghitungan HPP dan penilaian aset inventaris di laporan keuangan sesuai dengan standar akuntansi yang saya inginkan.
- **Kriteria Penerimaan (Acceptance Criteria)**:
  - **Given**: Perusahaan saat ini menggunakan metode HPP default "Average Cost".
  - **When**: Company Admin membuka "Pengaturan -> Sistem Persediaan", mengganti pilihan metode ke "Standard Costing", dan mengklik "Simpan".
  - **Then**: Sistem memperbarui kolom `costing_method` pada setelan perusahaan.
  - **When**: Ada transaksi penjualan POS baru.
  - **Then**: Sistem menghitung HPP penjualan di tabel `orders` berdasarkan nilai `standard_cost` bahan baku penyusunnya, bukan nilai `average_cost` dinamis.
