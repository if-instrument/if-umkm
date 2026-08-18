# 🐍 Python AI Microservice - API & System Documentation

Dokumentasi resmi untuk **AI Microservice Platform (Face & Fingerprint Biometrics, Business Intelligence Analytics, and Token Quota Engine)** berbasis FastAPI, PyTorch, dan OpenCV (Python 3.9+).

---

## 🌐 1. Live Swagger UI & ReDoc Interaktif

- **Swagger UI**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc**: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)
- **OpenAPI 3.1.0 Spec**: [http://127.0.0.1:8000/openapi.json](http://127.0.0.1:8000/openapi.json)

---

## 🔐 2. Protokol Autentikasi & Keamanan

Setiap request masuk ke microservice ini harus memuat header API Key valid:
```http
X-API-Key: <AI_API_SECRET_KEY>
```
Atau menyertakan tanda tangan HMAC-SHA256 pada header `X-Signature`.

---

## 📋 3. Rincian Endpoint REST API (Python AI Service)

### A. Face Biometrics (`/face/`)
| Method | Endpoint | Deskripsi & Kegunaan |
|---|---|---|
| `POST` | `/face/detect` | Deteksi posisi bounding box wajah, landmark mata/hidung/mulut |
| `POST` | `/face/embed` | Ekstraksi vektor embedding wajah 128-D / 512-D |
| `POST` | `/face/verify` | Verifikasi kemiripan 1-to-1 antara foto input dan user terdaftar |
| `POST` | `/face/identify` | Identifikasi 1-to-many wajah kasir dalam tenant (`cosine similarity`) |
| `POST` | `/face/register` | Pendaftaran wajah baru dan penyimpanan vektor embedding |
| `POST` | `/face/verify-pose` | Deteksi pose wajah (hadap depan, kiri, kanan) untuk anti-spoofing |

### B. Fingerprint Biometrics (`/fingerprint/`)
| Method | Endpoint | Deskripsi & Kegunaan |
|---|---|---|
| `POST` | `/fingerprint/open-device` | Inisialisasi koneksi driver hardware scanner (ZKTeco, Suprema, Generic) |
| `POST` | `/fingerprint/capture-frame` | Pengambilan frame snapshot pemindaian sensor sidik jari |
| `POST` | `/fingerprint/register` | Pendaftaran template sidik jari ISO/ANSI |
| `POST` | `/fingerprint/verify` | Verifikasi kecocokan 1-to-1 sidik jari user |
| `POST` | `/fingerprint/identify` | Pencocokan 1-to-many sidik jari kasir saat login |
| `POST` | `/fingerprint/close-device` | Pelepasan handle USB scanner |

### C. Generative & Predictive Business Intelligence (`/v1/ai/`)
| Method | Endpoint | Deskripsi & Kegunaan |
|---|---|---|
| `POST` | `/v1/ai/chat` | Asisten AI analitik tanya jawab performa penjualan & operasional toko |
| `POST` | `/v1/ai/predict/stockout` | Prediksi estimasi tanggal bahan baku habis berdasarkan laju konsumsi |
| `POST` | `/v1/ai/recommend/recipes` | Rekomendasi komposisi menu baru dengan margin laba optimal |
| `POST` | `/v1/ai/quota/query` | Cek sisa kuota token AI tenant perusahaan |
| `POST` | `/v1/ai/usage/query` | Riwayat log pemakaian token per request AI |

### D. Health Check Probe (`/health`)
| Method | Endpoint | Deskripsi |
|---|---|---|
| `GET` | `/health` | Liveness and health probe untuk monitoring status microservice |

---

## 🧪 4. Menjalankan Test Suite Python

```bash
cd ai-service
PYTHONPATH=. venv/bin/pytest
```
**Hasil**: 10 tests passed (100% Passed).
