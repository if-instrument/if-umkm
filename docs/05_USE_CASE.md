# 05. Use Cases

Dokumentasi use case mendeskripsikan interaksi antara aktor (pengguna sistem) dengan fungsi-fungsi utama yang disediakan oleh Aplikasi UMKM (IFresso Coffee).

---

## 1. Daftar Aktor (Actors)
1. **Super Admin (Central)**: Pengelola platform SaaS UMKM tingkat pusat yang mengawasi seluruh tenant perusahaan.
2. **Company Admin (Owner)**: Pemilik bisnis tenant yang memiliki hak akses penuh untuk mengkonfigurasi setelan global perusahaan.
3. **Outlet Manager**: Pengelola operasional gerai lokal yang bertanggung jawab atas stok, expense, dan staff outlet.
4. **Kasir (Cashier)**: Staf gerai yang memproses pembayaran langsung, mencetak receipt, dan mengoperasikan mesin EDC.
5. **Dapur (Kitchen Staff)**: Staf produksi makanan/minuman yang memproses antrean pembuatan produk.
6. **Pelanggan (Customer)**: Pengunjung outlet yang memesan makanan secara langsung atau online mandiri.

---

## 2. Use Case Diagram (Mermaid)

```mermaid
leftToRightDirection
graph TD
    %% Actors
    CA[Company Admin]
    OM[Outlet Manager]
    CS[Kasir / Cashier]
    KT[Dapur / Kitchen]
    CU[Pelanggan / Customer]

    %% Use Cases
    subgraph Sistem_POS_dan_Inventaris
        UC1(Login & Kelola Akun)
        UC2(Kelola Menu & Resep)
        UC3(Kelola Pengguna & Hak Akses)
        UC4(Kelola Meja & Pengaturan Outlet)
        UC5(Kelola Pembelian Bahan Baku)
        UC6(Pencatatan Expense Operasional)
        UC7(Melakukan Checkout POS)
        UC8(Mengelola Bill Meja / Open Table)
        UC9(Approve / Reject Pesanan Online)
        UC10(Memantau & Menyelesaikan Antrean Dapur)
        UC11(Memesan Menu via QR Code)
        UC12(Mengunggah Bukti Pembayaran)
        UC13(Melihat Laporan Keuangan)
    end

    %% Associations
    CA --> UC1
    CA --> UC2
    CA --> UC3
    CA --> UC4
    CA --> UC13
    
    OM --> UC1
    OM --> UC2
    OM --> UC5
    OM --> UC6
    OM --> UC9
    OM --> UC13
    
    CS --> UC1
    CS --> UC7
    CS --> UC8
    CS --> UC9
    
    KT --> UC1
    KT --> UC10
    
    CU --> UC11
    CU --> UC12
```

---

## 3. Deskripsi Use Case Utama

### UC-09: Approve / Reject Pesanan Online
- **Aktor**: Kasir, Outlet Manager
- **Deskripsi**: Kasir meninjau pesanan masuk dari pelanggan online, memverifikasi bukti bayar yang diunggah (apabila non-tunai), lalu menyetujui pesanan agar diteruskan ke dapur atau menolaknya jika tidak valid.
- **Preconditions**:
  - Pelanggan telah mengirim pesanan (`SubmitOrder`) dengan status `PENDING_CASHIER`.
  - Kasir telah login ke halaman POS dan membuka laci antrean pesanan online (*Approvals drawer*).
- **Postconditions**:
  - Jika di-approve: Status pesanan berubah menjadi `WAITING` atau `FULFILLMENT` (jika mengandung barang Preorder). Sinyal pesanan dikirim ke dapur.
  - Jika di-reject: Status pesanan berubah menjadi `CANCELLED`. Kunci stok (*hold stock*) dilepaskan.
- **Main Flow**:
  1. Kasir menerima notifikasi audio/visual pesanan online masuk di POS.
  2. Kasir membuka *Approvals Drawer* ("Approve Pesanan Online").
  3. Kasir mengklik tombol **"Detail"** pada kartu pesanan.
  4. Sistem membuka modal **Bill Confirmation** yang menyajikan:
     - Nomor meja dan nama pelanggan.
     - Detail item yang dipesan.
     - Total tagihan.
     - Bukti bayar (gambar transfer/QRIS offline) yang diunggah pelanggan.
  5. Kasir memverifikasi kecocokan nominal bukti bayar dengan total tagihan.
  6. Kasir menekan tombol **"Approve & Bayar"**.
  7. Sistem memperbarui status pesanan menjadi `WAITING`, mengubah status pembayaran menjadi `PAID`, mencetak struk kasir, dan menutup modal.
- **Alternate Flow (Reject Order)**:
  - Pada langkah 5, jika bukti bayar tidak terbaca, kosong, atau nominal salah:
    1. Kasir menekan tombol **"Reject"** di modal.
    2. Sistem membatalkan order, mengembalikan stok produk yang sempat ditahan, dan menutup modal.
    3. Notifikasi pembatalan muncul di checkout log.
- **Exception Flow**:
  - Jika koneksi internet terputus saat menekan "Approve & Bayar":
    1. Sistem menampilkan pesan error "Gagal memperbarui status order. Periksa koneksi internet."
    2. Tombol "Approve & Bayar" diaktifkan kembali agar kasir dapat mencoba ulang setelah koneksi pulih.

---

### UC-08: Mengelola Bill Meja / Open Table
- **Aktor**: Kasir
- **Deskripsi**: Kasir membuka bill berjalan untuk meja pelanggan dine-in, menambahkan menu tambahan ke bill yang sama, memindahkan meja pelanggan, dan melunasi tagihan saat pelanggan pulang.
- **Preconditions**:
  - Fitur Table Service Mode diaktifkan dengan pengaturan `assigned_pay_later`.
- **Postconditions**:
  - Meja berstatus terisi saat bill aktif, dan kembali kosong/bersih saat pembayaran dilunasi.
- **Main Flow**:
  1. Pelanggan datang dan duduk di meja. Kasir mengklik meja tersebut di antarmuka POS layout.
  2. Kasir memilih menu awal dan menekan **"Kirim Order ke Table"**.
  3. Sistem mengubah status meja menjadi terisi, mencetak tiket order ke dapur, dan membuka session bill berjalan.
  4. (Kondisional) Pelanggan memesan menu tambahan. Kasir mengklik meja aktif, menambahkan menu baru, dan menekan **"Tambah Order ke Table"**.
  5. Saat pelanggan ingin pulang, kasir mengklik tombol **"Lihat Bill"** pada meja atau menu transaksi POS berjalan.
  6. Sistem menampilkan modal **Bill Confirmation**.
  7. Kasir memilih metode pembayaran (Cash/QRIS/Card) dan menekan **"Konfirmasi Bayar"**.
  8. Sistem memproses pembayaran, mengosongkan status meja, mencetak struk lunas, dan menutup session bill berjalan.
