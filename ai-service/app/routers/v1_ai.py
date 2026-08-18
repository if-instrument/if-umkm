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
    AICapability, AIPlan, CompanyAIQuota, UserAIQuota, AIUsageLedger, AIModelPricing
)
from app.providers.provider_factory import ProviderFactory
from app.providers.base_provider import LLMMessage
from app.services.quota_service import QuotaService, QuotaExceededException
from app.services.analyst_service import BusinessAnalystEngine

router = APIRouter(tags=["Generative & Predictive AI"])

class ChatRequest(BaseModel):
    context: RequestContext
    prompt: str = Field(..., description="User prompt or task instruction")
    provider: Optional[str] = Field("openai", description="Target provider e.g. openai, anthropic, gemini")
    model: Optional[str] = Field("gpt-4o-mini", description="Target model name")
    temperature: Optional[float] = Field(0.7, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(1000, ge=50, le=8000)

class AnalyzeRequest(BaseModel):
    context: RequestContext
    prompt: str = Field(..., description="Business analytical prompt")
    provider: Optional[str] = Field("openai", description="Target provider")
    model: Optional[str] = Field("gpt-4o-mini", description="Target model")

class QuotaQueryRequest(BaseModel):
    application_id: str
    company_id: str
    user_id: Optional[str] = None

class UsageQueryRequest(BaseModel):
    application_id: str
    company_id: str
    limit: Optional[int] = Field(50, ge=1, le=500)

@router.get("/health")
def ai_platform_health():
    return {
        "ok": True,
        "status": "online",
        "platform": "Global Reusable AI Platform",
        "version": "1.0.0",
        "supported_providers": ["openai", "anthropic", "gemini"]
    }

@router.get("/capabilities")
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

@router.get("/providers")
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

@router.get("/data-logs")
def list_data_access_logs(application_id: str = "umkm-pos", company_id: Optional[str] = None, limit: int = 50, db: Session = Depends(get_db)):
    from app.models.platform import AIDataAccessLog
    query = db.query(AIDataAccessLog)
    if application_id:
        query = query.filter(AIDataAccessLog.application_id == application_id)
    if company_id:
        query = query.filter(AIDataAccessLog.company_id == company_id)
    logs = query.order_by(AIDataAccessLog.id.desc()).limit(limit).all()

    items = []
    for l in logs:
        items.append({
            "id": l.id,
            "request_id": l.request_id,
            "access_type": l.access_type,
            "source": l.source,
            "destination": l.destination,
            "operation": l.operation,
            "status": l.status,
            "records_count": l.records_count,
            "duration_ms": l.duration_ms,
            "request_payload": json.loads(l.request_payload) if (l.request_payload and l.request_payload.startswith(("{", "["))) else l.request_payload,
            "response_content": json.loads(l.response_content) if (l.response_content and l.response_content.startswith(("{", "["))) else l.response_content,
            "created_at": l.created_at.isoformat() if l.created_at else None,
            "details": json.loads(l.details_json) if l.details_json else {}
        })

    return {
        "ok": True,
        "total": len(items),
        "data": items
    }

@router.get("/conversations")
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
    items = []
    for c in convs:
        items.append({
            "id": c.id,
            "conversation_id": c.conversation_id,
            "application_id": c.application_id,
            "company_id": c.company_id,
            "user_id": c.user_id,
            "title": c.title,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None
        })
    return {"ok": True, "total": len(items), "data": items}

@router.get("/conversations/{conversation_id}/messages")
def get_conversation_messages(conversation_id: str, limit: int = 100, db: Session = Depends(get_db)):
    from app.services.chat_service import ChatHistoryService
    msgs = ChatHistoryService.get_messages(db, conversation_id, limit=limit)
    items = []
    for m in msgs:
        items.append({
            "id": m.id,
            "conversation_id": m.conversation_id,
            "role": m.role,
            "content": m.content,
            "tokens_used": m.tokens_used,
            "created_at": m.created_at.isoformat() if m.created_at else None
        })
    return {"ok": True, "conversation_id": conversation_id, "total": len(items), "data": items}

class DeleteConversationRequest(BaseModel):
    conversation_id: str

@router.get("/conversations/{conversation_id}")
def get_conversation_details(conversation_id: str, db: Session = Depends(get_db)):
    from app.models.platform import AIConversation
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

@router.post("/conversations/{conversation_id}/delete")
def delete_conversation(conversation_id: str, db: Session = Depends(get_db)):
    from app.services.chat_service import ChatHistoryService
    success = ChatHistoryService.delete_conversation(db, conversation_id)
    return {"ok": success, "conversation_id": conversation_id, "message": "Conversation deleted successfully." if success else "Conversation not found."}

@router.post("/conversations/delete")
def delete_conversation_body(req: DeleteConversationRequest, db: Session = Depends(get_db)):
    from app.services.chat_service import ChatHistoryService
    success = ChatHistoryService.delete_conversation(db, req.conversation_id)
    return {"ok": success, "conversation_id": req.conversation_id, "message": "Conversation deleted successfully." if success else "Conversation not found."}

@router.post("/quota")
def get_effective_quota(req: QuotaQueryRequest, db: Session = Depends(get_db)):
    company_max, web_search_max = QuotaService.get_effective_company_quota(db, req.application_id, req.company_id)
    
    quota_rec = db.query(CompanyAIQuota).filter(
        CompanyAIQuota.application_id == req.application_id,
        CompanyAIQuota.company_id == req.company_id
    ).first()

    consumed = quota_rec.tokens_consumed if quota_rec else 0
    reserved = quota_rec.tokens_reserved if quota_rec else 0

    return {
        "ok": True,
        "data": {
            "application_id": req.application_id,
            "company_id": req.company_id,
            "monthly_token_quota": company_max,
            "tokens_consumed": consumed,
            "tokens_reserved": reserved,
            "tokens_remaining": max(0, company_max - (consumed + reserved)),
            "monthly_web_searches_quota": web_search_max,
            "web_searches_consumed": quota_rec.web_searches_consumed if quota_rec else 0
        }
    }

@router.post("/chat", response_model=APIResponse)
def execute_chat(req: ChatRequest, db: Session = Depends(get_db)):
    ctx = req.context
    request_id = f"req_{uuid.uuid4().hex[:16]}"
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

@router.post("/usage")
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
                "created_at": l.created_at.isoformat()
            }
            for l in logs
        ]
    }
