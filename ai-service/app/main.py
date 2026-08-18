from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.migrations import run_migrations
from app.security import verify_security
from app.routers import face, fingerprint, v1_ai

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Auto-run schema migrations and seed platform definitions
    run_migrations()
    yield

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
## 🧠 IF Instrument AI Microservice (API v1)

Microservice kecerdasan buatan terstandarisasi berkecepatan tinggi yang menyediakan:
* **Face Biometrics (`/api/v1/face`)**: Deteksi wajah, ekstraksi vektor embedding 128/512-dimensi, anti-spoofing, dan pencocokan kosinus.
* **Fingerprint Biometrics (`/api/v1/fingerprint`)**: Template matching sidik jari untuk login kasir hardware.
* **Predictive & Business Intelligence (`/api/v1/ai`)**: Analisis churn pelanggan, estimasi stok habis (stockout forecast), dan rekomendasi resep menu.
* **Multi-Tenant Token Quota (`/api/v1/ai/quota`)**: Pelacakan kuota token AI per tenant perusahaan secara real-time.
    """,
    version="2.0.0",
    openapi_tags=tags_metadata,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
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

# Standardized Unified API v1 Router
api_v1_router = APIRouter(prefix="/api/v1", dependencies=[Depends(verify_security)])
api_v1_router.include_router(face.router, prefix="/face")
api_v1_router.include_router(fingerprint.router, prefix="/fingerprint")
api_v1_router.include_router(v1_ai.router, prefix="/ai")
app.include_router(api_v1_router)

@app.get("/api/v1/health", tags=["Health"])
def health_check():
    return {
        "ok": True,
        "status": "online",
        "service": "IF Instrument AI Microservice Platform",
        "version": "2.0.0",
        "api_prefix": "/api/v1",
        "features": ["face_biometrics", "fingerprint", "v1_ai_business_intelligence"]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
