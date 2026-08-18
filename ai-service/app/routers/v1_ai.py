import os
import json
import uuid
import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.identity import RequestContext, APIResponse
from app.models.platform import (
    AICapability, AIPlan, CompanyAIQuota, UserAIQuota, AIUsageLedger, AIModelPricing, AIConversation, AIMessage
)
from app.providers.provider_factory import ProviderFactory
from app.providers.base_provider import LLMMessage
from app.services.quota_service import QuotaService, QuotaExceededException
from app.services.analyst_service import BusinessAnalystEngine

router = APIRouter(tags=["Generative & Predictive AI"])

# ==================== REQUEST SCHEMAS ====================

class ChatRequest(BaseModel):
    context: RequestContext
    prompt: str = Field(..., description="User prompt or task instruction", examples=["Berapa total penjualan hari ini?"])
    provider: Optional[str] = Field("openai", description="Target provider: openai, anthropic, gemini", examples=["openai"])
    model: Optional[str] = Field("gpt-4o-mini", description="Target model name", examples=["gpt-4o-mini"])
    temperature: Optional[float] = Field(0.7, ge=0.0, le=2.0, examples=[0.7])
    max_tokens: Optional[int] = Field(1000, ge=50, le=8000, examples=[1000])

class AnalyzeRequest(BaseModel):
    context: RequestContext
    prompt: str = Field(..., description="Business analytical prompt", examples=["Analisis menu yang paling menguntungkan bulan ini."])
    provider: Optional[str] = Field("openai", description="Target provider", examples=["openai"])
    model: Optional[str] = Field("gpt-4o-mini", description="Target model", examples=["gpt-4o-mini"])

class QuotaQueryRequest(BaseModel):
    application_id: str = Field(..., examples=["umkm-pos"])
    company_id: str = Field(..., examples=["IFresso-Coffee"])
    user_id: Optional[str] = Field(None, examples=["usr-101"])

class UsageQueryRequest(BaseModel):
    application_id: str = Field(..., examples=["umkm-pos"])
    company_id: str = Field(..., examples=["IFresso-Coffee"])
    limit: Optional[int] = Field(50, ge=1, le=500, examples=[50])

class DeleteConversationRequest(BaseModel):
    conversation_id: str = Field(..., examples=["conv_123456"])

# ==================== RESPONSE SCHEMAS ====================

class HealthResponse(BaseModel):
    ok: bool = Field(True, examples=[True])
    status: str = Field("online", examples=["online"])
    platform: str = Field("Global Reusable AI Platform", examples=["Global Reusable AI Platform"])
    version: str = Field("2.0.0", examples=["2.0.0"])
    supported_providers: List[str] = Field(["openai", "anthropic", "gemini"], examples=[["openai", "anthropic", "gemini"]])

class CapabilityItem(BaseModel):
    code: str = Field(..., examples=["business.analyst"])
    name: str = Field(..., examples=["Business Analyst Engine"])
    category: str = Field(..., examples=["Analytics"])
    description: Optional[str] = Field(None, examples=["Predictive business intelligence"])

class CapabilitiesResponse(BaseModel):
    ok: bool = Field(True, examples=[True])
    data: List[CapabilityItem]

class ProvidersResponse(BaseModel):
    ok: bool = Field(True, examples=[True])
    data: Dict[str, List[Dict[str, Any]]] = Field(..., examples=[{"openai": [{"id": "gpt-4o-mini", "name": "GPT-4o Mini"}]}])

class QuotaData(BaseModel):
    application_id: str = Field(..., examples=["umkm-pos"])
    company_id: str = Field(..., examples=["IFresso-Coffee"])
    quota_limit: int = Field(..., examples=[500000])
    tokens_consumed: int = Field(..., examples=[12450])
    tokens_remaining: int = Field(..., examples=[487550])
    is_exhausted: bool = Field(False, examples=[False])

class QuotaResponse(BaseModel):
    ok: bool = Field(True, examples=[True])
    data: QuotaData

class UsageLogItem(BaseModel):
    request_id: str = Field(..., examples=["req_chat_abc123"])
    user_id: str = Field(..., examples=["usr-101"])
    capability: str = Field(..., examples=["business.assistant"])
    provider: str = Field(..., examples=["openai"])
    model: str = Field(..., examples=["gpt-4o-mini"])
    input_tokens: int = Field(..., examples=[120])
    output_tokens: int = Field(..., examples=[85])
    total_tokens: int = Field(..., examples=[205])
    actual_cost: float = Field(..., examples=[0.00015])
    created_at: str = Field(..., examples=["2026-08-18T10:00:00"])

class UsageResponse(BaseModel):
    ok: bool = Field(True, examples=[True])
    data: List[UsageLogItem]

class ConversationItem(BaseModel):
    conversation_id: str = Field(..., examples=["conv_abc123"])
    title: Optional[str] = Field(None, examples=["Diskusi Penjualan Kopi"])
    created_at: Optional[str] = Field(None, examples=["2026-08-18T10:00:00"])
    updated_at: Optional[str] = Field(None, examples=["2026-08-18T10:05:00"])

class ConversationsResponse(BaseModel):
    ok: bool = Field(True, examples=[True])
    data: List[ConversationItem]

class SimpleActionResponse(BaseModel):
    ok: bool = Field(True, examples=[True])
    conversation_id: Optional[str] = Field(None, examples=["conv_abc123"])
    message: str = Field(..., examples=["Operasi berhasil."])

# ==================== ENDPOINT HANDLERS ====================

@router.get("/capabilities", response_model=CapabilitiesResponse)
def list_capabilities(db: Session = Depends(get_db)):
    capabilities = db.query(AICapability).filter(AICapability.is_active == True).all()
    return {
        "ok": True,
        "data": [
            {
                "code": c.code,
                "name": c.name,
                "category": c.category,
                "description": c.description
            }
            for c in capabilities
        ]
    }

@router.get("/providers", response_model=ProvidersResponse)
def list_providers(application_id: str = "umkm-pos", company_id: str = "IFresso-Coffee", db: Session = Depends(get_db)):
    from app.providers.gemini_provider import GeminiProvider
    from app.providers.openai_provider import OpenAIProvider
    from app.providers.anthropic_provider import AnthropicProvider

    grouped = {}
    
    # Check providers with active keys
    gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ProviderFactory.resolve_api_key(db, "gemini", application_id, company_id)
    openai_key = os.getenv("OPENAI_API_KEY") or ProviderFactory.resolve_api_key(db, "openai", application_id, company_id)
    anthropic_key = os.getenv("ANTHROPIC_API_KEY") or ProviderFactory.resolve_api_key(db, "anthropic", application_id, company_id)
    is_testing = bool(os.getenv("PYTEST_CURRENT_TEST"))

    if gemini_key or is_testing:
        live_models = GeminiProvider().list_live_models(gemini_key)
        if live_models:
            grouped["gemini"] = live_models

    if openai_key or is_testing:
        live_models = OpenAIProvider().list_live_models(openai_key)
        if live_models:
            grouped["openai"] = live_models

    if anthropic_key or is_testing:
        live_models = AnthropicProvider().list_live_models(anthropic_key)
        if live_models:
            grouped["anthropic"] = live_models

    return {
        "ok": True,
        "data": grouped
    }

@router.get("/conversations", response_model=ConversationsResponse)
def list_conversations(
    application_id: str = "umkm-pos",
    company_id: str = "IFresso-Coffee",
    user_id: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    from app.services.chat_service import ChatHistoryService
    convs = ChatHistoryService.list_conversations(
        db=db,
        application_id=application_id,
        company_id=company_id,
        user_id=user_id,
        limit=limit
    )
    return {
        "ok": True,
        "data": [
            {
                "conversation_id": c.conversation_id,
                "title": c.title,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None
            }
            for c in convs
        ]
    }

@router.get("/conversations/{conversation_id}")
def get_conversation_details(conversation_id: str, db: Session = Depends(get_db)):
    conv = db.query(AIConversation).filter(AIConversation.conversation_id == conversation_id).first()
    if not conv:
        return {"ok": False, "message": "Conversation not found."}
    return {
        "ok": True,
        "data": {
            "conversation_id": conv.conversation_id,
            "application_id": conv.application_id,
            "company_id": conv.company_id,
            "user_id": conv.user_id,
            "title": conv.title,
            "created_at": conv.created_at.isoformat() if conv.created_at else None,
            "updated_at": conv.updated_at.isoformat() if conv.updated_at else None
        }
    }

@router.post("/conversations/{conversation_id}/delete", response_model=SimpleActionResponse)
def delete_conversation(conversation_id: str, db: Session = Depends(get_db)):
    from app.services.chat_service import ChatHistoryService
    success = ChatHistoryService.delete_conversation(db, conversation_id)
    return {"ok": success, "conversation_id": conversation_id, "message": "Conversation deleted successfully." if success else "Conversation not found."}

@router.post("/conversations/delete", response_model=SimpleActionResponse)
def delete_conversation_body(req: DeleteConversationRequest, db: Session = Depends(get_db)):
    from app.services.chat_service import ChatHistoryService
    success = ChatHistoryService.delete_conversation(db, req.conversation_id)
    return {"ok": success, "conversation_id": req.conversation_id, "message": "Conversation deleted successfully." if success else "Conversation not found."}

@router.post("/quota", response_model=QuotaResponse)
def get_effective_quota(req: QuotaQueryRequest, db: Session = Depends(get_db)):
    company_max, web_search_max = QuotaService.get_effective_company_quota(db, req.application_id, req.company_id)
    
    quota_rec = db.query(CompanyAIQuota).filter(
        CompanyAIQuota.application_id == req.application_id,
        CompanyAIQuota.company_id == req.company_id
    ).first()

    consumed = quota_rec.tokens_consumed if quota_rec else 0
    remaining = max(0, company_max - consumed)

    return {
        "ok": True,
        "data": {
            "application_id": req.application_id,
            "company_id": req.company_id,
            "quota_limit": company_max,
            "tokens_consumed": consumed,
            "tokens_remaining": remaining,
            "is_exhausted": consumed >= company_max
        }
    }

@router.post("/chat", response_model=APIResponse)
def execute_chat(req: ChatRequest, db: Session = Depends(get_db)):
    ctx = req.context
    request_id = f"req_cht_{uuid.uuid4().hex[:16]}"
    ctx.request_id = request_id

    cap = db.query(AICapability).filter(
        AICapability.code == ctx.capability,
        AICapability.is_active == True
    ).first()
    if not cap:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Capability '{ctx.capability}' tidak aktif atau belum terdaftar."
        )

    provider_name = (req.provider or "openai").lower()
    llm_driver = ProviderFactory.get_provider(provider_name)
    est_prompt_tokens = llm_driver.estimate_tokens(req.prompt)
    est_total_tokens = est_prompt_tokens + (req.max_tokens or 1000)

    try:
        reservation_id = QuotaService.reserve_tokens(
            db=db,
            application_id=ctx.application_id,
            company_id=ctx.company_id,
            user_id=ctx.user_id,
            estimated_tokens=est_total_tokens
        )
    except QuotaExceededException as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(e)
        )

    byok_key = ProviderFactory.resolve_api_key(db, provider_name, ctx.application_id, ctx.company_id)

    try:
        messages = [
            LLMMessage(role="system", content=f"You are the Global AI Platform assistant serving context app={ctx.application_id}, company={ctx.company_id}."),
            LLMMessage(role="user", content=req.prompt)
        ]
        llm_res = llm_driver.chat_completion(
            messages=messages,
            model=req.model,
            temperature=req.temperature,
            max_tokens=req.max_tokens,
            api_key_override=byok_key
        )
    except Exception as err:
        QuotaService.release_reservation(db, reservation_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"LLM Provider Execution Error: {str(err)}"
        )

    actual_cost = ProviderFactory.calculate_cost(
        db=db,
        provider_name=provider_name,
        model=llm_res.model,
        input_tokens=llm_res.input_tokens,
        output_tokens=llm_res.output_tokens
    )

    ledger = QuotaService.commit_usage(
        db=db,
        reservation_id=reservation_id,
        request_id=request_id,
        capability=ctx.capability,
        provider=provider_name,
        model=llm_res.model,
        input_tokens=llm_res.input_tokens,
        output_tokens=llm_res.output_tokens,
        actual_cost=actual_cost,
        conversation_id=ctx.conversation_id
    )

    return APIResponse(
        ok=True,
        data={
            "answer": llm_res.content,
            "tool_calls": llm_res.tool_calls,
            "provider": provider_name,
            "model": llm_res.model
        },
        meta={
            "request_id": request_id,
            "conversation_id": ctx.conversation_id,
            "capability": ctx.capability,
            "usage": {
                "input_tokens": llm_res.input_tokens,
                "output_tokens": llm_res.output_tokens,
                "total_tokens": llm_res.total_tokens,
                "estimated_cost": actual_cost
            }
        }
    )

@router.post("/analyze", response_model=APIResponse)
def execute_analysis(req: AnalyzeRequest, db: Session = Depends(get_db)):
    ctx = req.context
    ctx.capability = "business.analyst"
    request_id = f"req_anl_{uuid.uuid4().hex[:16]}"
    ctx.request_id = request_id

    provider_name = (req.provider or "openai").lower()
    llm_driver = ProviderFactory.get_provider(provider_name)
    est_total = llm_driver.estimate_tokens(req.prompt) + 1500

    try:
        reservation_id = QuotaService.reserve_tokens(
            db=db,
            application_id=ctx.application_id,
            company_id=ctx.company_id,
            user_id=ctx.user_id,
            estimated_tokens=est_total
        )
    except QuotaExceededException as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(e)
        )

    try:
        res = BusinessAnalystEngine.analyze_business(
            db=db,
            context=ctx,
            prompt=req.prompt,
            provider_name=provider_name,
            model_name=req.model or "gpt-4o-mini"
        )
    except Exception as err:
        QuotaService.release_reservation(db, reservation_id)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"AI Business Analyst Execution Error: {str(err)}"
        )

    actual_cost = ProviderFactory.calculate_cost(
        db=db,
        provider_name=provider_name,
        model=res["model"],
        input_tokens=res["input_tokens"],
        output_tokens=res["output_tokens"]
    )

    QuotaService.commit_usage(
        db=db,
        reservation_id=reservation_id,
        request_id=request_id,
        capability="business.analyst",
        provider=provider_name,
        model=res["model"],
        input_tokens=res["input_tokens"],
        output_tokens=res["output_tokens"],
        actual_cost=actual_cost,
        conversation_id=ctx.conversation_id
    )

    return APIResponse(
        ok=True,
        data={
            "answer": res["answer"],
            "sources": res["sources"],
            "recommendations": res["recommendations"],
            "proposed_actions": res["proposed_actions"],
            "tool_calls_executed": res["tool_calls_executed"],
            "provider": provider_name,
            "model": res["model"]
        },
        meta={
            "request_id": request_id,
            "conversation_id": ctx.conversation_id,
            "capability": "business.analyst",
            "usage": {
                "input_tokens": res["input_tokens"],
                "output_tokens": res["output_tokens"],
                "total_tokens": res["total_tokens"],
                "estimated_cost": actual_cost
            }
        }
    )

@router.post("/usage", response_model=UsageResponse)
def query_usage(req: UsageQueryRequest, db: Session = Depends(get_db)):
    logs = db.query(AIUsageLedger).filter(
        AIUsageLedger.application_id == req.application_id,
        AIUsageLedger.company_id == req.company_id
    ).order_by(AIUsageLedger.created_at.desc()).limit(req.limit).all()

    return {
        "ok": True,
        "data": [
            {
                "request_id": l.request_id,
                "user_id": l.user_id,
                "capability": l.capability,
                "provider": l.provider,
                "model": l.model,
                "input_tokens": l.input_tokens,
                "output_tokens": l.output_tokens,
                "total_tokens": l.total_tokens,
                "actual_cost": l.actual_cost,
                "created_at": l.created_at.isoformat() if l.created_at else ""
            }
            for l in logs
        ]
    }
