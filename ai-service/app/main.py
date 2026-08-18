from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import engine, Base
from app.migrations import run_migrations
from app.security import verify_security
from app.routers import face, fingerprint, v1_ai

# Run standalone database schema & platform migrations
run_migrations()

app = FastAPI(
    title="Global Reusable AI Platform",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
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
        "service": "Global Reusable AI Platform",
        "version": "1.0.0"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
