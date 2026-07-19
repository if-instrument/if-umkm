# 09. REST API Documentation

REST API Aplikasi UMKM (IFresso Coffee) berbasis stateless JSON API yang diamankan menggunakan token Bearer JWT pada middleware filter `jwt-auth`.

---

## 1. Autentikasi Pengguna

### `POST /api/auth/login`
- **Deskripsi**: Melakukan verifikasi email dan password user serta mengembalikan token JWT.
- **Authentication**: None (Public)
- **Request Body**:
  ```json
  {
    "email": "cashier@ifresso.com",
    "password": "secretpassword"
  }
  ```
- **Validation**:
  - `email`: Required, valid email format.
  - `password`: Required, string minimum 6 characters.
- **Success Response (HTTP 200)**:
  ```json
  {
    "ok": true,
    "data": {
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "user": {
        "id": 5,
        "name": "Staf Kasir",
        "email": "cashier@ifresso.com",
        "type": "outlet_user"
      },
      "companies": [
        {
          "id": 1,
          "name": "IFresso Coffee",
          "routeSlug": "ifresso-coffee"
        }
      ],
      "outlets": [
        {
          "id": 1,
          "companyId": 1,
          "name": "IFresso Coffee Outlet 1"
        }
      ]
    }
  }
  ```
- **Error Response (HTTP 422)**:
  ```json
  {
    "ok": false,
    "message": "Email atau password salah."
  }
  ```

---

## 2. POS Kasir (Point of Sale)

### `GET /api/page/pos/bootstrap`
- **Deskripsi**: Mengambil seluruh data awal (settings, catalog, active orders) untuk di-cache di browser POS kasir.
- **Authentication**: JWT Bearer Token (`jwt-auth`)
- **Query Parameters**:
  - `date`: Format `YYYY-MM-DD` (Required, default hari ini).
  - `per_page`: Integer (Optional, default 100).
- **Success Response (HTTP 200)**:
  ```json
  {
    "ok": true,
    "data": {
      "settings": {
        "companyName": "IFresso Coffee",
        "themeColor": "#6e3a16",
        "taxRate": 10,
        "dineInServiceRate": 5,
        "tableServiceMode": "free_seating_pay_first",
        "paymentMethods": [
          { "id": 1, "name": "Cash", "type": "cash", "status": "10" },
          { "id": 2, "name": "QRIS", "type": "qris", "qrisMode": "offline", "status": "10" }
        ]
      },
      "categories": [
        { "id": 1, "name": "Coffee" },
        { "id": 2, "name": "Non-Coffee" }
      ],
      "products": [
        { "id": 12, "sku": "IF-ACP-01", "name": "Es Kopi Aren", "price": 18000, "category": "Coffee" }
      ],
      "transactions": [
        { "id": "ord-35", "orderNumber": "WEB-20260719-0005", "status": "10", "total": 70000 }
      ]
    }
  }
  ```

### `POST /api/order`
- **Deskripsi**: Menyimpan data transaksi POS penjualan baru ke database tenant.
- **Authentication**: JWT Bearer Token (`jwt-auth`)
- **Request Body**:
  ```json
  {
    "orderNo": "POS-20260720-0001",
    "serviceType": "Take Away",
    "tableName": "-",
    "customerName": "Imam",
    "items": [
      {
        "productId": 12,
        "qty": 2,
        "price": 18000,
        "modifierIds": []
      }
    ],
    "payment": {
      "paymentMethod": "Cash",
      "cashTendered": 40000,
      "changeDue": 4000
    }
  }
  ```
- **Success Response (HTTP 200)**:
  ```json
  {
    "ok": true,
    "data": {
      "id": "ord-36",
      "orderNumber": "POS-20260720-0001",
      "status": "completed",
      "total": 36000
    }
  }
  ```

---

## 3. Persetujuan Pesanan Online (Order Approval)

### `PUT /api/order/(:segment)/approve`
- **Deskripsi**: Menyetujui pesanan online yang dibuat pelanggan, memverifikasi metode pembayaran, dan mengirim order ke dapur.
- **Authentication**: JWT Bearer Token (`jwt-auth`)
- **Request Body**:
  ```json
  {
    "paymentMethod": "QRIS",
    "cashTendered": 0,
    "changeDue": 0
  }
  ```
- **Success Response (HTTP 200)**:
  ```json
  {
    "ok": true,
    "data": {
      "id": "ord-35",
      "orderNumber": "WEB-20260719-0005",
      "status": "waiting",
      "paymentStatus": "paid",
      "paymentMethod": "QRIS"
    }
  }
  ```

---

## 4. Pembayaran Gateway (Payment Transactions)

### `POST /api/payment-transaction`
- **Deskripsi**: Membuat invoice transaksi pembayaran QRIS dinamis atau request kartu EDC pada sistem payment gateway terintegrasi.
- **Authentication**: JWT Bearer Token (`jwt-auth`)
- **Request Body**:
  ```json
  {
    "orderNumber": "WEB-20260719-0005",
    "paymentMethodId": 2,
    "amount": 70000,
    "paymentFeeAmount": 0,
    "paymentFeePayer": "merchant"
  }
  ```
- **Success Response (HTTP 200)**:
  ```json
  {
    "ok": true,
    "data": {
      "id": 84,
      "reference": "XENDIT-QRIS-20260720-6394",
      "status": "pending",
      "amount": 70000,
      "qrPayload": "00020101021226380010ID.CO.XENDIT.WWW...",
      "provider": "xendit"
    }
  }
  ```

---

## 5. Layanan Mandiri Pelanggan (Customer Public Order)

### `POST /api/public/order`
- **Deskripsi**: Mengirimkan pesanan mandiri dari browser pelanggan.
- **Authentication**: None (Public - Validated via Meja/Outlet Code)
- **Request Body**: multipart/form-data
  - `company_id`: 1
  - `outlet_id`: 1
  - `service_type`: "Dine In"
  - `table_name`: "Meja 05"
  - `customer_name`: "Faisal"
  - `customer_phone`: "08123456789"
  - `payment_method`: "QRIS"
  - `items`: JSON string `[{"productId":12,"qty":1,"price":18000}]`
  - `payment_proof`: File upload (JPG/PNG bukti bayar transfer/QRIS offline)
- **Success Response (HTTP 200)**:
  ```json
  {
    "ok": true,
    "data": {
      "id": "ord-37",
      "orderNumber": "WEB-20260720-0002",
      "status": "pending_cashier",
      "total": 18000
    }
  }
  ```
