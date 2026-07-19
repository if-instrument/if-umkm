# 12. Sequence Diagrams

Dokumentasi diagram urutan (Sequence Diagram) untuk alur transaksi paling penting dalam Aplikasi UMKM.

---

## 1. Alur Autentikasi Pengguna (Login)

```mermaid
sequenceDiagram
    autonumber
    actor Staff as Kasir / Admin
    participant Client as Web Browser
    participant AuthC as AuthController
    participant AuthS as AuthService
    participant Jwt as JwtService
    participant DB as Central Database

    Staff->>Client: Input Email & Password, Klik Login
    Client->>AuthC: POST /api/auth/login
    AuthC->>AuthS: authenticate(email, password)
    AuthS->>DB: Query user by email
    DB-->>AuthS: Data User (Password Hash)
    AuthS->>AuthS: Verify password hash (bcrypt)
    AuthS->>DB: Query user roles & company details
    DB-->>AuthS: Roles & Company info
    AuthS->>Jwt: generateToken(userPayload)
    Jwt-->>AuthS: Token JWT (String)
    AuthS-->>AuthC: Array (User profile, Token, Outlets)
    AuthC-->>Client: HTTP 200 JSON Response
    Client->>Client: Simpan token & profile ke localStorage
    Client->>Client: Redirect ke Dashboard
```

---

## 2. Alur Penerimaan Undangan User (Accept Invitation)

```mermaid
sequenceDiagram
    autonumber
    actor User as Penerima Undangan
    participant UI as Halaman Invitation
    participant AuthC as AuthController (API)
    participant InvS as UserInvitationService
    participant DB as Central Database

    User->>UI: Buka email undangan & klik link
    UI->>AuthC: GET /api/invitation/:code
    AuthC->>InvS: getValidInvitation(code)
    InvS->>DB: Query user_invitations & join company
    DB-->>InvS: Data Undangan (Status: PENDING)
    InvS-->>AuthC: Valid Invitation Info
    AuthC-->>UI: HTTP 200 (Tampilkan Form Setup Password)
    User->>UI: Isi Nama, Password baru, klik "Terima Undangan"
    UI->>AuthC: POST /api/invitation/:code/accept
    AuthC->>InvS: accept(code, payload)
    InvS->>DB: Insert new User (Bcrypt Password)
    InvS->>DB: Assign Role (user_roles) & Outlet (user_outlets)
    InvS->>DB: Update user_invitations (Status: ACCEPTED)
    InvS-->>AuthC: Success Status
    AuthC-->>UI: HTTP 200 (Success, Redirect to Login)
```

---

## 3. Alur Pesanan Pelanggan Online & Approval Kasir

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Pelanggan Meja 05
    participant Client as Online Order Web (order.html)
    participant PO_Ctrl as PublicOrderController
    participant PO_Serv as PublicOrderService
    participant Notif as OrderNotificationService
    participant POS as POS Kasir UI (pos.js)
    actor Cashier as Staf Kasir

    Customer->>Client: Pilih Menu, Pilih "QRIS Static", Upload Bukti Transfer, Klik Order
    Client->>PO_Ctrl: POST /api/public/order (Payload + Bukti)
    PO_Ctrl->>PO_Serv: submit(payload, file)
    PO_Serv->>PO_Serv: Upload file bukti bayar ke disk
    PO_Serv->>PO_Serv: Hitung total bill, packaging, tax
    PO_Serv->>PO_Serv: DB Insert orders (Status: PENDING_CASHIER, payment_proof_path)
    PO_Serv-->>PO_Ctrl: Saved Order Object
    PO_Ctrl-->>Client: HTTP 200 (Order PENDING_CASHIER)
    PO_Ctrl->>Notif: sendNewOrderNotification(order)
    Notif->>POS: Push Notification / Websocket Sinyal Pesanan Baru
    POS->>POS: Play Sound & Tambah Item ke Approvals Drawer List
    Cashier->>POS: Klik "Detail" -> Tinjau Pesanan & Bukti Bayar
    Cashier->>POS: Klik "Approve & Bayar"
    POS->>PO_Ctrl: PUT /api/order/:id/approve
    PO_Ctrl->>PO_Serv: approvePendingOrder(id, paymentMethod)
    PO_Serv->>PO_Serv: Ubah order status ke WAITING / FULFILLMENT
    PO_Serv->>PO_Serv: Ubah payment_status ke PAID
    PO_Serv->>PO_Serv: Potong stok bahan baku (Inventory Service)
    PO_Serv-->>PO_Ctrl: Approved Order Info
    PO_Ctrl-->>POS: HTTP 200 (Success)
    POS->>POS: Cetak Struk Printer Termal
```
