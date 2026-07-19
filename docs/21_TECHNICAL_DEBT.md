# 21. Technical Debt Register

Daftar utang teknis (*Technical Debt*) teridentifikasi pada Aplikasi UMKM (IFresso Coffee), diurutkan berdasarkan tingkat prioritas penyelesaian.

---

## 1. Prioritas: CRITICAL

### TD-SEC-01: Penyimpanan Token JWT di `localStorage`
- **Klasifikasi**: Keamanan (Security)
- **Deskripsi**: Token JWT disimpan pada sisi browser melalui `localStorage`. Hal ini menyebabkan token mudah dicuri oleh script eksternal jika aplikasi terinfeksi celah keamanan Cross-Site Scripting (XSS).
- **Dampak Bisnis**: Risiko pembajakan akun kasir/admin perusahaan secara massal jika terjadi injeksi script berbahaya.
- **Solusi**: Ubah sistem pengiriman JWT menggunakan Secure HttpOnly Cookies.

### TD-SEC-02: Ketiadaan API Rate Limiting
- **Klasifikasi**: Keamanan / Ketersediaan (Availability)
- **Deskripsi**: Endpoint krusial seperti `/api/auth/login` (Auth) dan `/api/public/order` (Submit Order Pelanggan) tidak membatasi jumlah request masuk per unit waktu.
- **Dampak Bisnis**: Sistem rentan terhadap serangan brute-force password dan spamming order online palsu yang dapat menghabiskan kuota cetak struk atau memblokir stok bahan baku.
- **Solusi**: Tambahkan filter rate limiter bawaan framework pada routes target.

---

## 2. Prioritas: HIGH

### TD-CODE-01: God Object `pos.js`
- **Klasifikasi**: Maintainability
- **Deskripsi**: File `pos.js` berukuran lebih dari 3.400 baris kode JavaScript, menyatukan rendering UI, numpad, cart, print helper, EDC adapter integration, dan polling.
- **Dampak Bisnis**: Waktu pengembangan fitur baru melambat, risiko regresi (bug baru muncul akibat perbaikan fitur lain) sangat tinggi.
- **Solusi**: Refaktorisasi dengan memecah `pos.js` menjadi ES6 modules terpisah (misal: `cart.js`, `numpad.js`, `printer.js`, `gateway.js`).

---

## 3. Prioritas: MEDIUM

### TD-INTEG-01: Verifikasi Integrasi Fisik Terminal EDC & Printer
- **Klasifikasi**: Testability (Need Manual Verification)
- **Deskripsi**: Kode integrasi EDC bank (`Payments/Edc/*`) dan pencetakan thermal print memanfaatkan protokol port lokal fisik yang tidak dapat diuji secara otomatis pada lingkungan development/CI-CD.
- **Dampak Bisnis**: Sulit memastikan integrasi hardware tetap berjalan normal saat server melakukan upgrade library.
- **Solusi**: Buat mock simulator terminal EDC virtual pada backend untuk keperluan automation testing.

---

## 4. Prioritas: LOW

### TD-TEST-01: Ketiadaan Automated Unit Testing
- **Klasifikasi**: Quality Assurance
- **Deskripsi**: Hampir tidak ada file unit test untuk menguji keakuratan perhitungan numerik resep bahan baku di `InventoryService` atau pemotongan pajak di `SalesService`.
- **Dampak Bisnis**: Resiko kesalahan kalkulasi keuangan atau pengurangan stok bahan saat merilis fitur baru.
- **Solusi**: Tulis test case PHPUnit untuk melakukan pengujian unit terisolasi pada `InventoryService` dan `SalesService`.
