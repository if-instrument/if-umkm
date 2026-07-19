# 16. State Diagrams

Dokumentasi diagram transisi status (State Diagram) yang menggambarkan siklus hidup (lifecycle) pesanan dan transaksi pembayaran pada Aplikasi UMKM.

---

## 1. Siklus Hidup Status Pesanan (Order Status Lifecycle)

Order status berpindah melalui berbagai tahapan mulai dari pembuatan hingga penyajian akhir atau pembatalan.

```mermaid
stateDiagram-v2
    [*] --> PENDING_CASHIER : Pelanggan pesan online (QR Order)
    [*] --> WAITING : Kasir Checkout POS (Take Away / Dine In Pay First)
    [*] --> FULFILLMENT : Pesanan mengandung item Preorder (PO)

    PENDING_CASHIER --> CANCELLED : Kasir menolak pesanan (Reject)
    PENDING_CASHIER --> WAITING : Kasir menyetujui pesanan (Approve) & Stok ready
    PENDING_CASHIER --> FULFILLMENT : Kasir menyetujui pesanan & ada item PO belum siap
    
    FULFILLMENT --> WAITING : Stok produk PO siap & staf klik "Siapkan Stok"
    FULFILLMENT --> CANCELLED : Manajer membatalkan pesanan

    WAITING --> PREPARING : KDS Dapur mencentang item pertama (Mulai Masak)
    PREPARING --> READY : KDS Dapur mencentang semua item (Siap Saji)
    
    READY --> COMPLETED : Pesanan disajikan ke meja / diserahkan ke pelanggan
    
    WAITING --> CANCELLED : Kasir membatalkan pesanan (Batal/Refund)
    PREPARING --> CANCELLED : Pembatalan darurat di dapur

    CANCELLED --> [*]
    COMPLETED --> [*]
```

### Penjelasan Transisi Status Order:
1. **`PENDING_CASHIER`**: Status awal untuk order online. Pesanan tertahan di laci approval kasir dan belum dikirim ke kitchen. Stok produk belum berkurang (hanya di-*hold*).
2. **`FULFILLMENT`**: Tahap penyiapan stok untuk menu pre-order (PO). Transaksi menunggu stok produk PO diproduksi terlebih dahulu.
3. **`WAITING`**: Pesanan masuk antrean dapur. Menunggu staf dapur mulai memproses pesanan.
4. **`PREPARING`**: Staf dapur telah mengonfirmasi pembuatan pesanan. Proses memasak dimulai.
5. **`READY`**: Seluruh item dalam pesanan telah siap disajikan. Notifikasi berbunyi di kasir.
6. **`COMPLETED`**: Pelanggan telah menerima produk. Transaksi ditutup secara permanen.
7. **`CANCELLED`**: Pesanan dibatalkan. Kunci stok dibebaskan kembali ke gudang.

---

## 2. Status Transaksi Pembayaran (Payment Transaction States)

Melacak status pembayaran transaksi yang dipicu lewat QRIS Dinamis atau EDC Bank terintegrasi.

```mermaid
stateDiagram-v2
    [*] --> UNPAID : Pesanan baru dibuat (Dine In Bill)
    UNPAID --> PENDING : Kasir memicu request bayar (QRIS/Card)
    
    [*] --> PENDING : Generate QRIS Dinamis (createPaymentRequest)
    
    PENDING --> PAID : Webhook sukses diterima / Konfirmasi manual kasir
    PENDING --> FAILED : Transaksi ditolak bank / Error gateway
    PENDING --> EXPIRED : Transaksi melebihi batas waktu (timeout)
    
    UNPAID --> PAID : Pembayaran cash diterima langsung oleh kasir
    
    FAILED --> PENDING : Kasir klik "Buat Request Baru"
    EXPIRED --> PENDING : Kasir klik "Buat Request Baru"
    
    PAID --> [*]
    FAILED --> [*]
    EXPIRED --> [*]
```

### Penjelasan Transisi Status Payment:
1. **`UNPAID`**: Transaksi dine-in berjalan belum dilunasi. Tagihan terus bertambah jika ada pesanan tambahan.
2. **`PENDING`**: Request pembayaran dikirim ke API Xendit/Midtrans atau terminal EDC fisik. Status menunggu pembayaran dari pelanggan.
3. **`PAID`**: Transaksi sukses didebit/diterima. Gateway mengirim status sukses, melunasi tagihan order terkait secara otomatis.
4. **`FAILED`**: Kartu ditolak atau terjadi kegerakan jaringan pada terminal EDC.
5. **`EXPIRED`**: Pelanggan tidak memindai QRIS dalam batas waktu toleransi (misalnya 15 menit), sehingga invoice dibatalkan oleh gateway.
