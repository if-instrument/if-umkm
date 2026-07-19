# 13. Activity Diagrams

Dokumentasi diagram aktivitas (Activity Diagram) yang menggambarkan alur kendali operasional internal pada sistem Aplikasi UMKM.

---

## 1. Alur Opname Stok Bahan Baku (Stock Opname)

```mermaid
stateDiagram-v2
    [*] --> BukaHalamanStok: Manajer buka halaman Bahan Baku di Outlet
    BukaHalamanStok --> CetakLembarOpname: Cetak daftar nama bahan & stok sistem
    CetakLembarOpname --> HitungFisik: Lakukan penghitungan fisik bahan di gudang
    HitungFisik --> BandingkanStok: Bandingkan Qty Fisik vs Qty Sistem
    BandingkanStok --> Selisih{Ada Selisih?}
    
    Selisih -->|Tidak| SelesaiOpname: Stok akurat, tidak ada tindakan lanjutan
    
    Selisih -->|Ya| InputPenyesuaian: Buka modal "Input Waste" / "Stock Adjustment"
    InputPenyesuaian --> IsiDataForm: Input jumlah selisih, tipe mutasi, & catatan (misal: "tumpah/rusak")
    IsiDataForm --> KlikSimpan: Simpan penyesuaian stok
    
    state Sistem_Backend {
        KlikSimpan --> HitungUlangStok: Hitung saldo stock_after baru
        HitungUlangStok --> TulisLogMutasi: Insert row baru ke stock_movements (Tipe: waste/opname)
        TulisLogMutasi --> UpdateTabelStok: Update stock_qty bahan di tabel outlet_ingredients
    }
    
    UpdateTabelStok --> BerhasilDisimpan: Tampilkan notifikasi penyesuaian sukses
    BerhasilDisimpan --> SelesaiOpname
    SelesaiOpname --> [*]
```

---

## 2. Alur Produksi Menu Sendiri (Menu Production / Batching)
Modul untuk menu berstok jadi (*prepackaged products* / *preorder products*) yang diproduksi terlebih dahulu dari bahan baku mentah sebelum dijual.

```mermaid
stateDiagram-v2
    [*] --> BukaMenuProduksi: Staf buka menu "Produksi/Produce Product"
    BukaMenuProduksi --> PilihProductPreorder: Pilih produk berstok jadi & masukkan Qty target produksi
    PilihProductPreorder --> CekStokBahan: Sistem cek ketersediaan bahan baku di resep (BOM)
    CekStokBahan --> BahanCukup{Stok Bahan Cukup?}
    
    BahanCukup -->|Tidak| TampilkanAlert: Sistem tampilkan error "Bahan mentah X kurang"
    TampilkanAlert --> BatalProduksi: Transaksi dibatalkan
    BatalProduksi --> [*]
    
    BahanCukup -->|Ya| KonfirmasiProduksi: Staf klik "Konfirmasi Produksi"
    
    state Backend_Produksi {
        KonfirmasiProduksi --> KurangiStokResep: Kurangi stok bahan mentah penyusun resep (outlet_ingredients)
        KurangiStokResep --> CatatLogBahan: Tulis stock_movements log (Tipe: production_out) untuk setiap bahan mentah
        CatatLogBahan --> TambahStokProduk: Tambah saldo stock_qty produk jadi di outlet (products.finishedStock)
        TambahStokProduk --> CatatLogProduk: Tulis stock_movements log (Tipe: production_in) untuk produk jadi
    }
    
    CatatLogProduk --> SelesaiProduksi: Stok produk jadi bertambah & siap dijual di POS grid
    SelesaiProduksi --> [*]
```

---

## 3. Alur Pencatatan Pengeluaran Operasional (OPEX Logging)

```mermaid
stateDiagram-v2
    [*] --> InputExpense: Manajer Outlet pilih tab "Finance -> Expense"
    InputExpense --> KlikTambah: Klik "Tambah Pengeluaran Baru"
    KlikTambah --> IsiFormExpense: Isi Nama Biaya, Nominal, Kategori (misal: Utilities), & tanggal
    IsiFormExpense --> KlikSimpanForm: Klik "Simpan Pengeluaran"
    
    state Validation_Backend {
        KlikSimpanForm --> CekAkses: Verifikasi permission settings.payment:create
        CekAkses --> AksesValid{Valid?}
        AksesValid -->|Tidak| TolakSimpan: Kembalikan HTTP 403 Forbidden
        AksesValid -->|Ya| TulisDatabase: Insert ke tabel operating_expenses
    }
    
    TolakSimpan --> TampilkanFeedbackError: Tampilkan pesan akses ditolak
    TampilkanFeedbackError --> [*]
    
    TulisDatabase --> SimpanSukses: Tampilkan notifikasi pengeluaran disimpan
    SimpanSukses --> RefreshLabaRugi: Nilai pengeluaran langsung mengurangi laba bersih pada Laporan Laba Rugi berjalan
    RefreshLabaRugi --> [*]
```
