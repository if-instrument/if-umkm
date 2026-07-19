# 24. Glossary of Terms

Daftar istilah teknis, finansial, dan bisnis yang digunakan dalam arsitektur dan proses bisnis Aplikasi UMKM (IFresso Coffee).

---

### Istilah Bisnis & Retail (POS)
1. **POS (Point of Sale)**: Sistem komputer kasir fisik yang digunakan untuk mencatat transaksi penjualan, menerima pembayaran, dan mencetak nota struk di outlet gerai retail/F&B.
2. **Dine In**: Layanan makan di tempat. Pelanggan memesan makanan dan menduduki meja yang disediakan gerai.
3. **Take Away**: Layanan bawa pulang. Makanan dibeli untuk dikonsumsi di luar outlet. Pembayaran biasanya dilakukan di muka (*Pay First*).
4. **Open Table**: Sesi tagihan berjalan yang terikat pada meja tertentu untuk pelanggan *Dine In* yang membayar belakangan (*Pay Later*). Tagihan ditahan tetap aktif sebelum di-*settle* lunas saat pelanggan pulang.
5. **KDS (Kitchen Display System)**: Layanan layar antrean monitor di area dapur yang memvisualisasikan pesanan aktif untuk membantu staf dapur memasak pesanan sesuai urutan antrean.

---

### Istilah Finansial & Inventarisasi
6. **COGS (Cost of Goods Sold / HPP)**: Harga Pokok Penjualan. Total biaya langsung yang dikeluarkan untuk memproduksi atau menyajikan suatu menu makanan/minuman, dihitung berdasarkan konsumsi stok bahan baku mentah.
7. **BOM (Bill of Materials / Resep)**: Formula resep produk. Daftar bahan mentah beserta takaran kuantitas spesifik yang dibutuhkan untuk membuat 1 unit porsi menu.
8. **Weighted Average Costing (Metode Rata-rata)**: Metode penilaian persediaan yang menghitung HPP berdasarkan rata-rata biaya perolehan bahan baku saat pembelian stok baru digabung dengan stok sisa di gudang.
9. **Standard Costing (Metode Standar)**: Penilaian persediaan yang menggunakan nilai taksiran biaya standar yang diset manual di pengaturan bahan baku, tanpa terpengaruh fluktuasi harga beli bahan.
10. **Stock Opname**: Kegiatan berkala menghitung jumlah stok fisik bahan baku secara langsung di gudang untuk dicocokkan dengan catatan stok yang tertera di sistem.
11. **Waste (Kerusakan/Kehilangan)**: Pencatatan penyusutan stok bahan baku akibat kedaluwarsa, tumpah, basi, atau rusak saat penyimpanan.

---

### Istilah Jaringan & Gerbang Pembayaran
12. **MDR (Merchant Discount Rate)**: Biaya potongan transaksi kartu atau QRIS yang dikenakan oleh penyedia payment gateway/bank kepada merchant (dapat dibebankan ke usaha atau dibebankan langsung ke pelanggan).
13. **QRIS Static (Manual QRIS)**: Barcode QR kode statis outlet milik merchant yang di-scan pelanggan, di mana konfirmasi keabsahan transaksi dilakukan secara visual oleh kasir dengan memeriksa struk di HP pelanggan.
14. **QRIS Dynamic (Online QRIS)**: Barcode QR kode dinamis yang digenerate unik untuk setiap transaksi belanja. Status sukses pembayaran dicek otomatis oleh server backend melalui polling API atau HTTPS Webhook dari penyedia gerbang pembayaran (Xendit/Midtrans).
15. **EDC (Electronic Data Capture)**: Mesin terminal gesek kartu debit/kredit fisik yang dipasang di samping meja kasir.
16. **Tenant Database (Tenancy)**: Konsep pembagian data pengguna SaaS. *Dedicated tenancy* menempatkan data transaksi masing-masing perusahaan ke database terisolasi terpisah, sedangkan *shared tenancy* mencampur data di tabel yang sama dengan kolom pembeda `company_id`.
