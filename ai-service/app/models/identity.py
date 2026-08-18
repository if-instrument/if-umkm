from typing import Optional, Dict, Any
from pydantic import BaseModel, Field

class RequestContext(BaseModel):
    """
    Standardized Domain-Agnostic Context for every AI Platform Request.
    """
    application_id: str = Field(..., description="Unique application identifier e.g. 'umkm-pos', 'ev-platform'")
    company_id: str = Field(..., description="Unique company / tenant identifier e.g. 'comp_ifresso_99'")
    user_id: str = Field(..., description="Unique user identifier e.g. 'user_mgr_77'")
    conversation_id: Optional[str] = Field(None, description="Optional conversation session GUID")
    request_id: Optional[str] = Field(None, description="Unique request GUID for tracing")
    capability: str = Field("business.assistant", description="Target AI capability e.g. 'business.analyst'")
    locale: Optional[str] = Field("id-ID", description="User preferred locale")
    timezone: Optional[str] = Field("Asia/Jakarta", description="User preferred timezone")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Arbitrary context metadata")


class UsageMeta(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    estimated_cost: float = 0.0


class APIResponse(BaseModel):
    ok: bool = True
    data: Optional[Dict[str, Any]] = None
    message: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None
    error: Optional[Dict[str, Any]] = None
