# 🐍 Python AI Microservice - Standardized API v1 Documentation

Dokumentasi resmi untuk **AI Microservice Platform (Face & Fingerprint Biometrics, Business Intelligence Analytics, and Token Quota Engine)** berbasis FastAPI, PyTorch, dan OpenCV (Python 3.9+).

---

## 🌐 1. Live Swagger UI & ReDoc Interaktif

- **Swagger UI**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc**: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)
- **OpenAPI 3.1.0 Spec**: [http://127.0.0.1:8000/openapi.json](http://127.0.0.1:8000/openapi.json) (Juga tersimpan di `ai-service/docs/openapi.json`)
- **📖 Panduan Integrasi Developer & Format Chat**: [AI_DEVELOPER_INTEGRATION_GUIDE.md](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/ai-service/docs/AI_DEVELOPER_INTEGRATION_GUIDE.md)

---

## 🔐 2. Protokol Autentikasi & Keamanan

Setiap request masuk ke microservice ini harus memuat header API Key valid:
```http
X-API-Key: <AI_API_SECRET_KEY>
```
Atau menyertakan tanda tangan HMAC-SHA256 pada header `X-Signature`.

---

## 📋 3. Standarisasi Routing Unified API v1

Seluruh routing kini terstandarisasi penuh di bawah prefix `/api/v1/`:

### A. Face Biometrics (`/api/v1/face/`)
| Method | Endpoint | Deskripsi & Kegunaan |
|---|---|---|
| `POST` | `/api/v1/face/detect` | Deteksi posisi bounding box wajah, landmark mata/hidung/mulut |
| `POST` | `/api/v1/face/embed` | Ekstraksi vektor embedding wajah 128-D / 512-D |
| `POST` | `/api/v1/face/verify` | Verifikasi kemiripan 1-to-1 antara foto input dan user terdaftar |
| `POST` | `/api/v1/face/identify` | Identifikasi 1-to-many wajah kasir dalam tenant (`cosine similarity`) |
| `POST` | `/api/v1/face/register` | Pendaftaran wajah baru dan penyimpanan vektor embedding |
| `POST` | `/api/v1/face/verify-pose` | Deteksi pose wajah (hadap depan, kiri, kanan) untuk anti-spoofing |
| `POST` | `/api/v1/face/status` | Cek status pendaftaran wajah pengguna |
| `POST` | `/api/v1/face/delete` | Hapus embedding biometrik wajah pengguna |
| `POST` | `/api/v1/face/open-device` | Buka kamera untuk capture frame |
| `POST` | `/api/v1/face/close-device` | Tutup koneksi kamera |

### B. Fingerprint Biometrics (`/api/v1/fingerprint/`)
| Method | Endpoint | Deskripsi & Kegunaan |
|---|---|---|
| `POST` | `/api/v1/fingerprint/open-device` | Inisialisasi koneksi driver hardware scanner (ZKTeco, Suprema, Generic) |
| `POST` | `/api/v1/fingerprint/capture-frame` | Pengambilan frame snapshot pemindaian sensor sidik jari |
| `POST` | `/api/v1/fingerprint/register` | Pendaftaran template sidik jari ISO/ANSI |
| `POST` | `/api/v1/fingerprint/verify-step` | Verifikasi multi-step enrollment (1 s.d. 6 sampel) |
| `POST` | `/api/v1/fingerprint/verify` | Verifikasi kecocokan 1-to-1 sidik jari user |
| `POST` | `/api/v1/fingerprint/identify` | Pencocokan 1-to-many sidik jari kasir saat login |
| `POST` | `/api/v1/fingerprint/status` | Cek status pendaftaran sidik jari pengguna |
| `POST` | `/api/v1/fingerprint/delete` | Hapus template sidik jari pengguna |
| `GET` | `/api/v1/fingerprint/list-devices` | Daftar USB fingerprint hardware scanner terdeteksi |
| `POST` | `/api/v1/fingerprint/close-device` | Pelepasan handle USB scanner |

### C. Generative & Predictive Business Intelligence (`/api/v1/ai/`)
| Method | Endpoint | Deskripsi & Kegunaan |
|---|---|---|
| `POST` | `/api/v1/ai/chat` | Asisten AI analitik tanya jawab performa penjualan & operasional toko |
| `POST` | `/api/v1/ai/analyze` | Analisis mendalam metriks performa bisnis dengan integrasi tool |
| `POST` | `/api/v1/ai/predict/stockout` | Prediksi estimasi tanggal bahan baku habis berdasarkan laju konsumsi |
| `POST` | `/api/v1/ai/recommend/recipes` | Rekomendasi komposisi menu baru dengan margin laba optimal |
| `GET` | `/api/v1/ai/quota` | Cek sisa kuota token AI tenant perusahaan |
| `GET` | `/api/v1/ai/usage` | Riwayat log pemakaian token per request AI |
| `GET` | `/api/v1/ai/capabilities` | Daftar kapabilitas AI yang aktif di sistem |
| `GET` | `/api/v1/ai/providers` | Daftar LLM provider yang tersedia (OpenAI, Gemini, Anthropic) |

### D. Health Check Probe (`/api/v1/health`)
| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/api/v1/health` | Health probe dan status liveness microservice |
