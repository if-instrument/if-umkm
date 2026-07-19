# 11. Class Diagram

Diagram kelas (Class Diagram) memvisualisasikan relasi OOP antara Controller, Service, Model, dan Presenter utama pada backend Aplikasi UMKM.

```mermaid
classDiagram
    class BaseController {
        +initController()
        #scope() array
        #payload() array
    }

    class SalesController {
        -sales: SalesService
        -payments: PaymentGatewayService
        +listOrders()
        +order()
        +status()
        +settle()
        +approve()
        +createPayment()
        +confirmPayment()
    }
    BaseController <|-- SalesController

    class PosController {
        +bootstrap()
        +renderPosPage()
    }
    BaseController <|-- PosController

    class SalesService {
        -orders: OrderModel
        -orderItems: OrderItemModel
        +orderPage() array
        +orderDetail() array
        +createOrder() array
        +updateStatus() array
        +approvePendingOrder() array
        +settle() array
    }

    class PaymentGatewayService {
        -transactions: PaymentTransactionModel
        +create() array
        +status() array
        +confirm() array
        +cancel() array
    }

    class TenantDatabaseService {
        -centralConfig: array
        +activateForClaims() array
        +activateForCompanySlug() array
        +connectionForCompanySlug() BaseConnection
        +companyBySlug() array
    }

    class BaseAppModel {
        #db: Connection
        #table: string
        #primaryKey: string
        #useSoftDeletes: bool
        #allowedFields: array
    }

    class OrderModel {
        #table: string
        #allowedFields: array
    }
    BaseAppModel <|-- OrderModel

    class OrderItemModel {
        #table: string
        #allowedFields: array
    }
    BaseAppModel <|-- OrderItemModel

    class PosPagePresenter {
        +bootstrap() array
        -posSettings() array
        -posProduct() array
        -posOrder() array
    }

    SalesController --> SalesService : Delegates to
    SalesController --> PaymentGatewayService : Delegates to
    SalesService --> OrderModel : Uses
    SalesService --> OrderItemModel : Uses
    PaymentGatewayService --> BaseAppModel : Uses
    PosController --> PosPagePresenter : Uses
    SalesController ..> TenantDatabaseService : Switches connection via filter
```

## Deskripsi Relasi
1. **Inheritance (Pewarisan)**:
   - `SalesController` dan `PosController` mewarisi `BaseController` yang menyediakan helper internal untuk membaca payload input JSON dan cakupan (*scope*) ID outlet/perusahaan.
   - `OrderModel` dan `OrderItemModel` mewarisi `BaseAppModel` yang membungkus fungsi utilitas CRUD framework CodeIgniter 4.
2. **Association (Asosiasi/Delegasi)**:
   - Controller layer bertindak sebagai *thin controller* dan mendelegasikan pemrosesan data ke Service layer (`SalesService`, `PaymentGatewayService`).
   - Service layer melakukan manipulasi database dengan memanggil Model layer (`OrderModel`, `OrderItemModel`).
3. **Usage (Penggunaan)**:
   - `PosController` memanggil `PosPagePresenter` untuk menyusun and memformat bootstrap data (settings, catalog, orders) ke client-side.
   - `TenantDatabaseService` dipanggil oleh filter middleware untuk memodifikasi koneksi database model secara dinamis.
