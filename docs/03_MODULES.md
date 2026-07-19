# 03. Application Modules

Sistem ini terbagi menjadi 7 modul utama yang saling terintegrasi melalui database tenant dan repositori Service.

---

## 1. Access Control & Tenant Module

### Tujuan
Mengelola registrasi perusahaan (tenant), provisi database tenant secara dedicated, hak akses user melalui role-permission matrix, serta distribusi undangan user (*invitations*).

### Fungsi
- Pembuatan dan pembaruan profil perusahaan (logo, warna tema, route slug).
- Registrasi gerai (outlet) baru di bawah naungan tenant perusahaan.
- Pembuatan role dengan konfigurasi otorisasi terperinci.
- Pengiriman undangan kolaborasi ke email karyawan baru.
- dynamic dynamic database connection switching saat user login.

### Controller
- [AccessController](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Controllers/Api/AccessController.php)
- [AuthController](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Controllers/Api/AuthController.php)
- [OnboardingController](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Controllers/Api/OnboardingController.php)

### Service
- [AccessManagementService](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Services/AccessManagementService.php)
- [AuthService](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Services/AuthService.php)
- [JwtService](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Services/JwtService.php)
- [TenantDatabaseService](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Services/TenantDatabaseService.php)
- [UserInvitationService](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Services/UserInvitationService.php)

### Model
- [CompanyModel](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Models/CompanyModel.php)
- [OutletModel](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Models/OutletModel.php)
- [UserModel](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Models/UserModel.php)
- [RoleModel](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Models/RoleModel.php)
- [UserInvitationModel](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Models/UserInvitationModel.php)

### View (HTML Frontend)
- `login.html`
- `users.html`
- `invitation.html`

### API Endpoint
- `POST /api/auth/login`
- `GET /api/user`, `POST /api/user`, `PUT /api/user/(:segment)`, `DELETE /api/user/(:segment)`
- `GET /api/role`, `POST /api/role`, `PUT /api/role/(:segment)`, `DELETE /api/role/(:segment)`
- `GET /api/company`, `POST /api/company`, `PUT /api/company/(:segment)`
- `GET /api/outlet`, `POST /api/outlet`, `PUT /api/outlet/(:segment)`

### Dependency
- `JwtService` untuk encoding/decoding token.
- `DatabaseConfig` central untuk membaca tabel `companies`.

### Database Tables Used
- `companies`
- `outlets`
- `users`
- `roles`
- `user_roles`
- `user_outlets`
- `user_invitations`

### Business Rules
- User bertipe `company_admin` memiliki akses penuh ke seluruh outlet di bawah naungan perusahaannya.
- Karyawan outlet (`outlet_user`) hanya dapat melihat dan memodifikasi data pada outlet yang diasosiasikan dengannya (`user_outlets`).
- Undangan kolaborasi memiliki batas kadaluarsa dan kode unik yang hanya dapat dikonfirmasi satu kali oleh penerima email.

---

## 2. POS & Sales Module

### Tujuan
Menangani proses pencatatan penjualan langsung di kasir outlet, manajemen pesanan meja (*open table*), integrasi terminal pembayaran pihak ketiga, dan closing shift harian.

### Fungsi
- Antarmuka Single Page Application (SPA) kasir POS yang cepat dan responsif.
- Penambahan, pengurangan, dan penghapusan produk di keranjang belanja.
- Pembukaan bill meja (*dine-in*) dan pembukuan tagihan berjalan.
- Integrasi pembayaran tunai, QRIS (online/static), dan mesin EDC kartu.
- Fitur "Approve & Bayar" untuk pesanan online dari pelanggan.

### Controller
- [PosController](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Controllers/PosController.php)
- [SalesController](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Controllers/Api/SalesController.php)

### Service
- [SalesService](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Services/SalesService.php)
- [PaymentGatewayService](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Services/PaymentGatewayService.php)
- [ReceiptRendererService](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Services/ReceiptRendererService.php)

### Model
- [OrderModel](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Models/OrderModel.php)
- [OrderItemModel](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Models/OrderItemModel.php)
- [PaymentTransactionModel](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Models/PaymentTransactionModel.php)
- [PaymentTransactionLogModel](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Models/PaymentTransactionLogModel.php)

### View (HTML Frontend)
- `pos.html`
- `orders.html`

### API Endpoint
- `GET /api/page/pos/bootstrap` (Pemuatan data POS awal)
- `POST /api/order` (Simpan transaksi POS baru)
- `PUT /api/order/(:segment)/settle` (Pelunasan bill berjalan/dine-in)
- `PUT /api/order/(:segment)/approve` (Penerimaan pesanan online)
- `POST /api/payment-transaction` (Pembuatan invoice pembayaran QRIS/Card)

### Dependency
- `InventoryService` untuk pemotongan stok otomatis saat penjualan terjadi.
- SDK/HTTP Client Xendit & Midtrans API untuk verifikasi QRIS dinamis.

### Database Tables Used
- `orders`
- `order_items`
- `payment_transactions`
- `payment_transaction_logs`
- `dining_tables`

### Business Rules
- Transaksi tunai wajib mencatat uang diterima (`cash_tendered`) dan menghitung kembalian (`change_due`).
- Pesanan online (`ORDER_STATUS.PENDING_CASHIER`) tidak mengurangi stok bahan sebelum di-approve kasir.
- Logika preorder: Pesanan yang mengandung menu preorder (PO) akan ditahan di status `FULFILLMENT` sebelum diubah manual menjadi `WAITING` saat stok tersedia.

---

## 3. Inventory & Recipe Module

### Tujuan
Mengelola data bahan baku mentah (ingredients), pemetaan bahan di tingkat outlet, pencatatan resep produk (BOM), pergerakan stok (in/out/waste), dan stock opname.

### Fungsi
- Manajemen template bahan baku global perusahaan (`ingredient_templates`).
- Pemetaan dan penetapan modal standar (*standard cost*) serta rata-rata (*average cost*) di tingkat outlet.
- Pencatatan resep produk jadi yang memetakan kebutuhan bahan baku secara akurat.
- Log histori masuk-keluar stok (`stock_movements`) akibat pembelian (`purchase`), produksi (`production`), atau kerusakan (`waste`).

### Controller
- [InventoryController](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Controllers/Api/InventoryController.php)

### Service
- [InventoryService](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Services/InventoryService.php)

### Model
- [IngredientTemplateModel](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Models/IngredientTemplateModel.php)
- [IngredientModel](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Models/IngredientModel.php)
- [RecipeIngredientModel](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Models/RecipeIngredientModel.php)
- [StockMovementModel](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Models/StockMovementModel.php)

### View (HTML Frontend)
- `inventory.html`
- `recipes.html`
- `ingredient-mapping.html`
- `ingredient-templates.html`
- `purchases.html`
- `finished-products.html`

### API Endpoint
- `GET /api/ingredient`, `POST /api/ingredient`
- `POST /api/purchase` (Input stok dari pembelian)
- `POST /api/inventory-loss` (Pencatatan barang rusak/waste)
- `PUT /api/ingredient-mapping` (Pemetaan template ke outlet)

### Dependency
- `SettingsService` untuk membaca kustomisasi pajak/service charge.

### Database Tables Used
- `ingredient_templates`
- `outlet_ingredients`
- `product_recipe_items`
- `stock_movements`

### Business Rules
- Setiap pergerakan stok wajib mencatat tipe mutasi (`purchase`, `sales_deduction`, `waste`, `production_in`, `production_out`).
- Nilai HPP bahan dihitung dinamis menggunakan metode **Weighted Average Costing** atau **Standard Costing** berdasarkan opsi setelan perusahaan.
- Bahan yang berstatus nonaktif tidak boleh digunakan dalam perumusan resep menu.

---

## 4. Product Catalog Module

### Tujuan
Mengelola katalog menu yang ditawarkan ke pelanggan, termasuk kategori menu, harga jual khusus outlet, varian rasa/pilihan tambahan (modifiers), dan stok produk jadi.

### Fungsi
- Manajemen kategori produk tingkat global perusahaan maupun outlet lokal.
- Pengaturan harga produk per outlet (`product_outlet_prices`).
- Konfigurasi modifier group (misalnya: level pedas, topping tambahan, jenis susu).
- Upload gambar menu ke direktori public server.

### Controller
- [ProductSuiteController](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Controllers/Api/ProductSuiteController.php)
- [ProductPageController](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Controllers/ProductPageController.php)

### Service
- [ProductSuiteService](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Services/ProductSuiteService.php)

### Model
- [ProductModel](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Models/ProductModel.php)
- [CategoryModel](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Models/CategoryModel.php)
- [ModifierModel](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Models/ModifierModel.php)
- [ModifierOptionModel](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Models/ModifierOptionModel.php)
- [ProductModifierModel](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Models/ProductModifierModel.php)

### View (HTML Frontend)
- `products.html`
- `categories.html`
- `modifiers.html`

### API Endpoint
- `GET /api/product`, `POST /api/product`, `PUT /api/product/(:segment)`
- `GET /api/category`, `POST /api/category`, `DELETE /api/category/(:segment)`
- `GET /api/modifier`, `POST /api/modifier`
- `POST /api/product-image` (Upload gambar)

### Database Tables Used
- `products`
- `categories`
- `modifiers`
- `modifier_options`
- `product_modifiers`
- `product_outlet_prices`

### Business Rules
- Nama SKU produk bersifat unik dalam satu perusahaan tenant.
- Modifier dapat berstatus wajib diisi (*required selection*) atau opsional (*multiple choice*).
- Jika sebuah produk jadi dibuat dari resep, maka stok produk tersebut bersifat dinamis (*made to order*) mengikuti ketersediaan bahan baku mentah penyusunnya.

---

## 5. Customer Relationship Management (CRM) Module

### Tujuan
Membangun loyalitas pelanggan dengan pencatatan data keanggotaan (membership) dan pemberian diskon otomatis.

### Fungsi
- Pendaftaran anggota pelanggan dengan input nama, nomor telepon, dan email.
- Pencatatan transaksi belanja historis dari setiap member.
- Penghitungan dan visualisasi total belanja member.

### Controller
- [CrmController](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Controllers/Api/CrmController.php)

### Service
- [CrmService](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Services/CrmService.php)

### Model
- [CustomerMemberModel](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Models/CustomerMemberModel.php)

### View (HTML Frontend)
- `crm-customers.html`
- `crm-transactions.html`

### API Endpoint
- `GET /api/customer`, `POST /api/customer`, `PUT /api/customer/(:segment)`
- `GET /api/customer-transaction`

### Database Tables Used
- `customer_members`
- `orders`

### Business Rules
- Nomor telepon member bersifat unik untuk setiap tenant perusahaan.
- Pelanggan yang terdaftar sebagai member berhak mendapatkan potongan harga (diskon member) yang konfigurasinya diatur di tingkat perusahaan.

---

## 6. Finance & Reports Module

### Tujuan
Menyediakan laporan keuangan terpadu, termasuk laba kotor penjualan, rekap pengeluaran operasional (OPEX), dan performa bisnis bulanan.

### Fungsi
- Pencatatan biaya operasional outlet (sewa tempat, gaji karyawan, listrik, pembelian peralatan kecil).
- Penghitungan HPP (COGS) riil dari resep yang terjual.
- Laporan rugi laba bulanan per outlet atau secara konsolidasi.

### Controller
- [FinancePageController](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Controllers/FinancePageController.php)
- [ReportController](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Controllers/Api/ReportController.php)

### Service
- [ProfitLossService](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Services/ProfitLossService.php)

### Model
- [OperatingExpenseModel](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Models/OperatingExpenseModel.php)

### View (HTML Frontend)
- `finance-dashboard.html`
- `finance-expenses.html`
- `finance-settlement.html`
- `reports.html`

### API Endpoint
- `GET /api/reports/profit-loss`
- `GET /api/finance/expense`, `POST /api/finance/expense`, `DELETE /api/finance/expense/(:segment)`
- `GET /api/payment-gateway-log`

### Database Tables Used
- `operating_expenses`
- `orders`
- `order_items`

### Business Rules
- Pengeluaran operasional dikelompokkan ke dalam kategori biaya yang valid (`operational`, `marketing`, `payroll`, `rent`, `utilities`, `other`).
- Laporan laba rugi dihitung dengan rumus:
  $$\text{Laba Kotor} = \text{Total Penjualan} - \text{Total HPP (COGS)}$$
  $$\text{Laba Bersih} = \text{Laba Kotor} - \text{Total Pajak} - \text{Total Pengeluaran Operasional}$$

---

## 7. Online Ordering Module (Customer-Facing)

### Tujuan
Menyediakan antarmuka digital berbasis web bagi pelanggan di meja gerai untuk melihat menu, memesan makanan/minuman, dan menyelesaikan pembayaran secara mandiri.

### Fungsi
- Single Page Application khusus untuk menu pemesanan pelanggan.
- Dukungan deteksi nomor meja secara otomatis via parameter URL.
- Integrasi proses unggah bukti transfer/bukti pembayaran QRIS offline.
- Status pelacakan pemesanan langsung (*real-time order status tracking*).

### Controller
- [OnlineOrderController](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Controllers/OnlineOrderController.php)
- [PublicOrderController](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Controllers/Api/PublicOrderController.php)

### Service
- [PublicOrderService](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Services/PublicOrderService.php)
- [OrderNotificationService](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Services/OrderNotificationService.php)

### Model
- [OrderModel](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Models/OrderModel.php)
- [OrderItemModel](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/app/Models/OrderItemModel.php)

### View (HTML Frontend)
- `order.html`

### API Endpoint
- `GET /api/public/order/bootstrap` (Loading awal katalog menu)
- `POST /api/public/order` (Submit pesanan oleh customer)
- `GET /api/page/order/status` (Polling status pesanan pelanggan)

### Dependency
- Layanan notifikasi websocket/polling untuk mengirim sinyal pesanan masuk ke kasir POS.

### Database Tables Used
- `orders`
- `order_items`

### Business Rules
- Pemesanan online harus diawali dengan pemilihan outlet yang aktif dan nomor meja yang valid (atau take away).
- Pesanan online dengan metode bayar non-tunai (Transfer/QRIS Offline) wajib menyertakan unggahan gambar bukti bayar agar kasir dapat menyetujui pesanan.
- Status awal pesanan pelanggan adalah `PENDING_CASHIER`.
