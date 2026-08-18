from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import engine, Base
from app.migrations import run_migrations
from app.security import verify_security
from app.routers import face, fingerprint, v1_ai

# Run standalone database schema & platform migrations
run_migrations()

tags_metadata = [
    {
        "name": "Face Biometrics",
        "description": "Ekstraksi embedding wajah, verifikasi 1-to-1, dan identifikasi 1-to-many untuk login kasir & absensi.",
    },
    {
        "name": "Fingerprint Biometrics",
        "description": "Pendaftaran sidik jari ANSI/ISO template dan verifikasi biometrik hardware.",
    },
    {
        "name": "Generative & Predictive AI",
        "description": "Analisis prediksi bisnis UMKM, rekomendasi stok otomatis, asisten chat bisnis, dan kuota pemakaian token AI.",
    },
    {
        "name": "Health",
        "description": "Liveness and health status probe endpoint.",
    },
]

app = FastAPI(
    title="IF Instrument AI Microservice Platform",
    description="""
## 🧠 IF Instrument AI Microservice

Microservice kecerdasan buatan terdedikasi berkecepatan tinggi yang menyediakan:
* **Face Biometrics**: Deteksi wajah, ekstraksi vektor embedding 128/512-dimensi, anti-spoofing, dan pencocokan kosinus.
* **Fingerprint Biometrics**: Template matching sidik jari untuk login kasir hardware.
* **Predictive & Business Intelligence**: Analisis churn pelanggan, estimasi stok habis (stockout forecast), dan rekomendasi resep menu.
* **Multi-Tenant Token Quota**: Pelacakan kuota token AI per tenant perusahaan secara real-time.
    """,
    version="2.0.0",
    openapi_tags=tags_metadata,
    docs_url="/docs",
    redoc_url="/redoc",
    contact={
        "name": "IF Instrument AI Engineering Team",
        "email": "if.imam.faisal@gmail.com",
    },
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routers protected by Security Middleware (X-API-Key / HMAC)
app.include_router(face.router, dependencies=[Depends(verify_security)])
app.include_router(fingerprint.router, dependencies=[Depends(verify_security)])
app.include_router(v1_ai.router, dependencies=[Depends(verify_security)])

@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "online",
        "service": "IF Instrument AI Microservice Platform",
        "version": "2.0.0",
        "features": ["face_biometrics", "fingerprint", "v1_ai_business_intelligence"]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
