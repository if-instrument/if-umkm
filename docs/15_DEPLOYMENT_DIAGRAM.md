# 15. Deployment Diagram

Diagram Penyebaran (Deployment Diagram) menggambarkan infrastruktur fisik dan jaringan tempat Aplikasi UMKM dijalankan pada lingkungan produksi.

```mermaid
graph TD
    subgraph Client_Devices [Client Nodes - Web Browsers]
        POS_Device[Tablet/PC Kasir - Chrome Browser]
        Cust_Mobile[Ponsel Pintar Pelanggan - Safari/Chrome]
    end

    subgraph CDN_Edge [CDN & Network Layer]
        LoadBalancer[Nginx Load Balancer / Reverse Proxy]
    end

    subgraph App_Server_Node [Application Server - Hosting Node]
        WebServer[Nginx / Apache Web Server]
        PHP_Engine[PHP-FPM Engine 8.x]
        CI4_App[CodeIgniter 4 Application Code]
    end

    subgraph Database_Cluster [Database Server Node]
        MySQL_Central[(Central Database Instance - MySQL 8.0)]
        MySQL_Tenants[(Tenant Databases - SQLite / MySQL Instances)]
    end

    subgraph External_Cloud [External SaaS Services]
        Xendit_Cloud[Xendit Payment Gateway Cloud]
        Midtrans_Cloud[Midtrans Payment Gateway Cloud]
    end

    %% Network Connections
    POS_Device & Cust_Mobile -->|HTTPS - Port 443| LoadBalancer
    LoadBalancer -->|HTTP - Port 80/8080| WebServer
    WebServer -->|Unix Socket / TCP 9000| PHP_Engine
    PHP_Engine -->|Execute Code| CI4_App
    
    %% DB Connections
    CI4_App -->|PDO/MySQLi - Port 3306| MySQL_Central
    CI4_App -->|Dynamic PDO/MySQLi - Port 3306| MySQL_Tenants
    
    %% API Requests
    CI4_App -->|HTTPS Outbound API - Port 443| Xendit_Cloud & Midtrans_Cloud
```

## Spesifikasi Node Infrastruktur

### 1. Client Devices (Klien POS & Pelanggan)
- **Klien POS (Tablet/Laptop)**: Perangkat kasir di gerai fisik. Menampilkan halaman POS SPA secara lokal. Berkomunikasi asinkron via AJAX/Fetch API ke Web Server.
- **Ponsel Pintar Pelanggan**: Mengakses halaman menu pemesanan mandiri menggunakan browser mobile saat men-scan QR code di meja.

### 2. CDN & Network Layer (Nginx Load Balancer)
- Bertindak sebagai gerbang masuk tunggal, mengelola sertifikat SSL/TLS untuk enkripsi komunikasi data (HTTPS), serta membagi beban traffic request ke beberapa instansi App Server Node.

### 3. Application Server Node (Web Server & PHP-FPM)
- **Web Server (Nginx)**: Melayani request aset statis (HTML, CSS, JS, Gambar menu) secara cepat, serta meneruskan request API dinamis (`/api/*`) ke PHP-FPM.
- **PHP-FPM 8.x**: Mesin pengeksekusi kode PHP yang dikonfigurasi dengan Opcache aktif untuk performa kompilasi script yang optimal.
- **CodeIgniter 4**: Source code aplikasi yang dipasang di server.

### 4. Database Server Node (MySQL Cluster)
- **MySQL 8.0**: Database engine utama yang menampung central database dan ribuan instansi database tenant secara efisien.
- **Isolasi Database**: Setiap tenant baru mendapatkan database tersendiri (`tenant_1`, `tenant_2`, dst.). Database ini dapat ditempatkan pada server database yang sama atau didelegasikan ke database server terpisah secara fisik (`db_host` khusus pada konfigurasi tenant).

### 5. External SaaS Services
- **Xendit & Midtrans Cloud API**: Layanan SaaS pihak ketiga yang memproses transaksi gateway keuangan dan mengirim callback status pembayaran via HTTPS Webhook ke endpoint `/api/webhook/xendit`.
