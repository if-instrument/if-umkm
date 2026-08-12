import hmac
import hashlib
from fastapi import Header, HTTPException, status, Request
from app.config import settings

async def verify_security(
    request: Request,
    x_api_key: str = Header(None, alias="X-API-Key"),
    x_signature: str = Header(None, alias="X-Signature")
):
    # 1. API Key Validation
    if not x_api_key or x_api_key != settings.API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-API-Key header"
        )
    
    # 2. Optional HMAC Signature Validation
    if x_signature:
        body = await request.body()
        expected_sig = hmac.new(
            settings.HMAC_SECRET.encode("utf-8"),
            body,
            hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(x_signature, expected_sig):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="HMAC signature verification failed"
            )
    return True
