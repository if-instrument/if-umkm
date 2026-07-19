# 17. Data Flow Diagrams (DFD)

Dokumentasi diagram aliran data (Data Flow Diagram - DFD) dari Level Konteks, Level 0, hingga DFD Level 1 pada Aplikasi UMKM.

---

## 1. DFD Konteks (Context Diagram)
Menggambarkan batasan sistem (system boundary) dan entitas luar (*external entities*) yang berinteraksi mengirim/menerima data dengan sistem.

```mermaid
graph TD
    %% Entities
    CA[Company Admin]
    CS[Kasir / Staf POS]
    CU[Pelanggan / Customer]
    PG[Payment Gateway API]

    %% System Boundary
    subgraph System [Aplikasi POS & Inventaris UMKM]
        SYS[Core Engine SaaS]
    end

    %% Data Flow
    CA -->|Kredensial, Pengaturan Company & Menu| SYS
    SYS -->|Laporan Keuangan & Hasil Audit Stok| CA
    
    CS -->|Aksi Checkout, Input Opname & Expense| SYS
    SYS -->|Cetak Struk, Data Bill Meja, Alert Stok| CS
    
    CU -->|Pilih Menu, Upload Bukti Bayar| SYS
    SYS -->|Tampilkan QR, Status Pesanan, Nota| CU
    
    PG -->|Callback Webhook Sukses Pembayaran| SYS
    SYS -->|Request QRIS Invoice & Sinkronisasi| PG
```

---

## 2. DFD Level 0
Memecah sistem utama menjadi 4 proses pengolahan data makro:
1. **Proses 1.0**: Access & Tenant Management.
2. **Proses 2.0**: POS Sales & Settlement.
3. **Proses 3.0**: Inventory & Recipe BOM Control.
4. **Proses 4.0**: Finance Accounting & Expense.

```mermaid
graph TD
    %% Entities
    CA[Company Admin]
    CS[Kasir / Staf POS]
    CU[Pelanggan]
    PG[Payment Gateway]

    %% Data Stores
    subgraph Data_Stores [Penyimpanan Data Tenant]
        DS_User[(Data Store: Users & Roles)]
        DS_Sales[(Data Store: Orders & Payments)]
        DS_Inv[(Data Store: Ingredients & Recipes)]
        DS_Finance[(Data Store: Expenses)]
    end

    %% DFD Process
    subgraph DFD_Level_0 [Proses Utama]
        P1(1.0 Access & Tenant Management)
        P2(2.0 POS Sales & Settlement)
        P3(3.0 Inventory & Recipe Control)
        P4(4.0 Finance & Expense)
    end

    %% Flow P1
    CA -->|Input Profil & Role| P1
    P1 -->|Tulis Data Karyawan| DS_User
    P1 -->|Kirim Token Akses| CA
    
    %% Flow P2
    CS -->|Checkout & Settlement| P2
    CU -->|Online QR Order| P2
    P2 -->|Simpan Order & Payment| DS_Sales
    DS_Sales -->|Tampilkan Detail Bill| P2
    P2 -->|Konfirmasi Lunas| CU
    P2 -->|Sinyal Print Struk| CS
    PG -->|Webhook Success| P2
    P2 -->|Request Invoice| PG
    
    %% Flow P3
    CS -->|Log Opname & Pembelian| P3
    P3 -->|Tulis Stok & Movement| DS_Inv
    P2 -->|Trigger Potong Stok Resep| P3
    
    %% Flow P4
    CS -->|Input Expense| P4
    P4 -->|Simpan Jurnal OPEX| DS_Finance
    DS_Sales -->|Baca Total Revenue| P4
    DS_Inv -->|Baca Total HPP/COGS| P4
    P4 -->|Generate Laporan Rugi Laba| CA
```

---

## 3. DFD Level 1: Proses 2.0 (POS Sales & Settlement)
Memecah alur pemrosesan data order dan pembayaran secara detail.

```mermaid
graph TD
    %% External Entities
    CS[Kasir]
    CU[Pelanggan]
    PG[Payment Gateway]

    %% Processes
    P21(2.1 Validasi & Susun Keranjang Belanja)
    P22(2.2 Pembuatan Payment Transaction)
    P23(2.3 Verifikasi Pembayaran & Approval)
    P24(2.4 Penyimpanan Sales Order)
    P25(2.5 Kalkulasi Margin & Pengurangan Stok)

    %% Data Stores
    DS_Sales[(orders & order_items)]
    DS_Pay[(payment_transactions)]
    DS_Inv[(outlet_ingredients & stock_movements)]

    %% Aliran Data
    CS -->|Pilih Item & Modifier| P21
    CU -->|Pilih Menu & No Meja| P21
    P21 -->|Data Pesanan tervalidasi| P22
    P22 -->|Simpan Payment Pending| DS_Pay
    P22 -->|Request QRIS/Card| PG
    PG -->|Callback Paid / EDC Success| P23
    CS -->|Konfirmasi Bayar / Approve| P23
    P23 -->|Update Status Lunas| DS_Pay
    P23 -->|Trigger Save Order| P24
    P24 -->|Simpan Order & Items| DS_Sales
    P24 -->|Trigger Potong Stok| P25
    P25 -->|Deduct Qty & Write Movement| DS_Inv
    P25 -->|Kalkulasi COGS & Profit| DS_Sales
    P24 -->|Nota Pembayaran Sukses| CS
```
