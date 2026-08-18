import datetime
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Float, Boolean, Index, BigInteger
)
from app.database import Base


class Company(Base):
    """
    Stores tenant profile, business domain, and conversational onboarding state.
    """
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(String(120), nullable=False, default="umkm-pos", index=True)
    company_id = Column(String(120), nullable=False, index=True)
    business_type = Column(String(150), nullable=True) # e.g. 'F&B / Kedai Kopi & Roastery'
    description = Column(Text, nullable=True)
    is_onboarded = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    __table_args__ = (
        Index("idx_app_company", "application_id", "company_id", unique=True),
    )


class AIPlan(Base):
    """
    Subscription tier plans e.g. Free, Basic, Professional, Enterprise.
    """
    __tablename__ = "ai_plans"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(64), unique=True, nullable=False, index=True) # e.g. 'professional'
    name = Column(String(120), nullable=False)
    monthly_token_quota = Column(BigInteger, default=1000000, nullable=False)
    monthly_web_search_quota = Column(Integer, default=500, nullable=False)
    max_tokens_per_request = Column(Integer, default=8000, nullable=False)
    price_monthly = Column(Float, default=0.0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class CompanyAISubscription(Base):
    """
    Links a Company to an AI Subscription Plan.
    """
    __tablename__ = "company_ai_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(String(120), nullable=False, default="umkm-pos", index=True)
    company_id = Column(String(120), nullable=False, index=True)
    plan_code = Column(String(64), nullable=False, default="free")
    status = Column(String(32), nullable=False, default="active") # active, expired, suspended
    starts_at = Column(DateTime, default=datetime.datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    __table_args__ = (
        Index("idx_app_company_sub", "application_id", "company_id", unique=True),
    )


class CompanyAIQuota(Base):
    """
    Company-level quota override & active usage stats for current billing cycle.
    """
    __tablename__ = "company_ai_quotas"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(String(120), nullable=False, default="umkm-pos", index=True)
    company_id = Column(String(120), nullable=False, index=True)
    monthly_token_quota_override = Column(BigInteger, nullable=True)
    monthly_web_search_quota_override = Column(Integer, nullable=True)
    
    current_period_start = Column(DateTime, nullable=False)
    current_period_end = Column(DateTime, nullable=False)
    
    tokens_consumed = Column(BigInteger, default=0, nullable=False)
    tokens_reserved = Column(BigInteger, default=0, nullable=False)
    web_searches_consumed = Column(Integer, default=0, nullable=False)
    
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    __table_args__ = (
        Index("idx_app_company_quota", "application_id", "company_id", unique=True),
    )


class CompanyAIProviderKey(Base):
    """
    Company Bring-Your-Own-Key (BYOK) API credentials per LLM provider.
    """
    __tablename__ = "company_ai_provider_keys"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(String(120), nullable=False, default="umkm-pos", index=True)
    company_id = Column(String(120), nullable=False, index=True)
    provider = Column(String(64), nullable=False) # e.g. 'openai', 'anthropic', 'gemini'
    api_key_encrypted = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    __table_args__ = (
        Index("idx_app_comp_provider_key", "application_id", "company_id", "provider", unique=True),
    )


class AIUsageReservation(Base):
    """
    Temporary quota reservation during active LLM streaming/completion.
    """
    __tablename__ = "ai_usage_reservations"

    id = Column(Integer, primary_key=True, index=True)
    reservation_id = Column(String(120), unique=True, nullable=False, index=True)
    application_id = Column(String(120), nullable=False, default="umkm-pos", index=True)
    company_id = Column(String(120), nullable=False, index=True)
    user_id = Column(String(120), nullable=False, index=True)
    reserved_tokens = Column(BigInteger, nullable=False)
    status = Column(String(32), default="reserved", nullable=False) # 'reserved', 'committed', 'released'
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class AIUsageLedger(Base):
    """
    Immutable audit ledger recording every AI consumption.
    """
    __tablename__ = "ai_usage_ledger"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(String(120), nullable=False, index=True)
    application_id = Column(String(120), nullable=False, default="umkm-pos", index=True)
    company_id = Column(String(120), nullable=False, index=True)
    user_id = Column(String(120), nullable=False, index=True)
    conversation_id = Column(String(120), nullable=True, index=True)
    capability = Column(String(64), nullable=False)
    provider = Column(String(64), nullable=False)
    model = Column(String(120), nullable=False)
    
    input_tokens = Column(Integer, default=0, nullable=False)
    output_tokens = Column(Integer, default=0, nullable=False)
    total_tokens = Column(Integer, default=0, nullable=False)
    
    estimated_cost = Column(Float, default=0.0, nullable=False)
    actual_cost = Column(Float, default=0.0, nullable=False)
    
    status = Column(String(32), default="success", nullable=False) # 'success', 'failed', 'cancelled'
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)


class AIConversation(Base):
    """
    Scoped AI Conversation instance.
    """
    __tablename__ = "ai_conversations"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(String(120), unique=True, nullable=False, index=True)
    application_id = Column(String(120), nullable=False, default="umkm-pos", index=True)
    company_id = Column(String(120), nullable=False, index=True)
    user_id = Column(String(120), nullable=False, index=True)
    title = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class AIMessage(Base):
    """
    Individual message inside an AI Conversation.
    """
    __tablename__ = "ai_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(String(120), nullable=False, index=True)
    role = Column(String(32), nullable=False) # 'system', 'user', 'assistant', 'tool'
    content = Column(Text, nullable=True)
    tool_calls = Column(Text, nullable=True) # JSON string
    tool_call_id = Column(String(120), nullable=True)
    tokens_used = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class AIDataAccessLog(Base):
    """
    Audit log for Data Reading & Exchange operations (Internal DB vs External LLMs).
    Records Source, Destination, Access Type, Operation, Payload Summary, Duration, and Status.
    """
    __tablename__ = "ai_data_access_logs"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(String(120), nullable=True, index=True)
    application_id = Column(String(120), nullable=False, default="umkm-pos", index=True)
    company_id = Column(String(120), nullable=False, default="IFresso-Coffee", index=True)
    user_id = Column(String(120), nullable=True, index=True)
    
    access_type = Column(String(32), nullable=False, index=True) # 'INTERNAL_READ' or 'EXTERNAL_LLM'
    source = Column(String(255), nullable=False) # e.g. 'ai-service.analyst_engine'
    destination = Column(String(255), nullable=False) # e.g. 'CodeIgniter Tenant DB' or 'Google Gemini Cloud API'
    operation = Column(String(120), nullable=False) # e.g. 'get_recipe_ingredients', 'generate_content'
    
    status = Column(String(32), default="SUCCESS", nullable=False) # 'SUCCESS', 'FAILED', 'TIMED_OUT'
    records_count = Column(Integer, default=0, nullable=False)
    duration_ms = Column(Float, default=0.0, nullable=False)
    request_payload = Column(Text, nullable=True)
    response_content = Column(Text, nullable=True)
    details_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
