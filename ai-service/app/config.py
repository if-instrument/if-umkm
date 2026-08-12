import os
from pathlib import Path

def load_env_file():
    """Load key=value variables from ai-service/.env or root .env file into os.environ if not set."""
    possible_paths = [
        Path(__file__).resolve().parent.parent / ".env",
        Path(__file__).resolve().parent.parent.parent / ".env",
    ]
    for env_path in possible_paths:
        if env_path.exists():
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip("'\"")
                        if k and k not in os.environ:
                            os.environ[k] = v

load_env_file()

class Settings:
    PROJECT_NAME: str = "POS AI Microservice"
    VERSION: str = "1.0.0"
    
    # Security Secrets (Must match PHP CodeIgniter .env settings)
    API_KEY: str = os.getenv("AI_SERVICE_API_KEY", "pos_ai_secret_key_2026")
    HMAC_SECRET: str = os.getenv("AI_SERVICE_HMAC_SECRET", "pos_ai_hmac_secret_2026")
    
    # Database Configuration (Dedicated MySQL DB for AI Microservice)
    DATABASE_URL: str = os.getenv("AI_DATABASE_URL", "mysql+pymysql://root:1m4mf4154l@127.0.0.1:3306/if_umkm_ai_db")
    
    # Threshold Configurations
    FACE_SIMILARITY_THRESHOLD: float = float(os.getenv("FACE_THRESHOLD", "0.72"))
    FINGERPRINT_SIMILARITY_THRESHOLD: float = float(os.getenv("FINGERPRINT_THRESHOLD", "0.70"))

settings = Settings()
