import datetime
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Float, Boolean, ForeignKey, Index, BigInteger
)
from app.database import Base

class Application(Base):
    """
    Represents an external client application connected to the AI Platform.
    Examples: 'umkm-pos', 'ev-charging', 'hr-system', 'healthcare-saas'.
    """
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True)
    app_id = Column(String(120), unique=True, nullable=False, index=True) # e.g. 'umkm-pos'
    name = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    api_key_hash = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class Company(Base):
    """
    Represents a tenant company operating under an Application.
    """
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(String(120), nullable=False, index=True)
    company_id = Column(String(120), nullable=False, index=True) # e.g. 'comp_ifresso_99'
    name = Column(String(150), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    __table_args__ = (
        Index("idx_app_company", "application_id", "company_id", unique=True),
    )


class User(Base):
    """
    Represents an end-user within a Company under an Application.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(String(120), nullable=False, index=True)
    company_id = Column(String(120), nullable=False, index=True)
    user_id = Column(String(120), nullable=False, index=True) # e.g. 'user_mgr_77'
    name = Column(String(150), nullable=True)
    email = Column(String(150), nullable=True)
    role = Column(String(64), nullable=True, default="user")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    __table_args__ = (
        Index("idx_app_company_user", "application_id", "company_id", "user_id", unique=True),
    )


class AICapability(Base):
    """
    Defines platform capabilities e.g. biometric.face, business.analyst, business.web_search.
    """
    __tablename__ = "ai_capabilities"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(64), unique=True, nullable=False, index=True) # e.g. 'business.analyst'
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(64), nullable=False, default="business") # 'biometric' or 'business'
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


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
    application_id = Column(String(120), nullable=False, index=True)
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
    application_id = Column(String(120), nullable=False, index=True)
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


class UserAIQuota(Base):
    """
    Optional user-level quota limits within a company.
    """
    __tablename__ = "user_ai_quotas"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(String(120), nullable=False, index=True)
    company_id = Column(String(120), nullable=False, index=True)
    user_id = Column(String(120), nullable=False, index=True)
    
    monthly_token_limit = Column(BigInteger, nullable=True)
    tokens_consumed = Column(BigInteger, default=0, nullable=False)
    tokens_reserved = Column(BigInteger, default=0, nullable=False)
    
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    __table_args__ = (
        Index("idx_app_comp_user_quota", "application_id", "company_id", "user_id", unique=True),
    )


class CompanyAIProviderKey(Base):
    """
    Company Bring-Your-Own-Key (BYOK) API credentials per LLM provider.
    """
    __tablename__ = "company_ai_provider_keys"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(String(120), nullable=False, index=True)
    company_id = Column(String(120), nullable=False, index=True)
    provider = Column(String(64), nullable=False) # e.g. 'openai', 'anthropic', 'gemini'
    api_key_encrypted = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    __table_args__ = (
        Index("idx_app_comp_provider_key", "application_id", "company_id", "provider", unique=True),
    )


class AIModelPricing(Base):
    """
    Pricing configuration per LLM model for cost tracking ($ per 1,000,000 tokens).
    """
    __tablename__ = "ai_model_pricing"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String(64), nullable=False, index=True)
    model = Column(String(120), nullable=False, index=True)
    input_cost_per_1m = Column(Float, nullable=False, default=0.15)
    output_cost_per_1m = Column(Float, nullable=False, default=0.60)
    is_active = Column(Boolean, default=True, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    __table_args__ = (
        Index("idx_provider_model_price", "provider", "model", unique=True),
    )


class AIUsageReservation(Base):
    """
    Temporary quota reservation during active LLM streaming/completion.
    """
    __tablename__ = "ai_usage_reservations"

    id = Column(Integer, primary_key=True, index=True)
    reservation_id = Column(String(120), unique=True, nullable=False, index=True)
    application_id = Column(String(120), nullable=False, index=True)
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
    application_id = Column(String(120), nullable=False, index=True)
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


class AIToolRegistry(Base):
    """
    Registry of domain-agnostic tools exported by client applications.
    """
    __tablename__ = "ai_tool_registry"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(String(120), nullable=False, index=True)
    tool_name = Column(String(120), nullable=False)
    version = Column(String(32), default="1.0", nullable=False)
    description = Column(Text, nullable=False)
    input_schema = Column(Text, nullable=False) # JSON schema
    output_schema = Column(Text, nullable=True) # JSON schema
    permission = Column(String(120), nullable=False, default="read")
    timeout_seconds = Column(Integer, default=10, nullable=False)
    is_enabled = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    __table_args__ = (
        Index("idx_app_tool_name", "application_id", "tool_name", unique=True),
    )


class AIConversation(Base):
    """
    Scoped AI Conversation instance.
    """
    __tablename__ = "ai_conversations"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(String(120), unique=True, nullable=False, index=True)
    application_id = Column(String(120), nullable=False, index=True)
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


class AIAuditLog(Base):
    """
    Audit log for administrative and security actions across the platform.
    """
    __tablename__ = "ai_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(String(120), nullable=False, index=True)
    company_id = Column(String(120), nullable=False, index=True)
    user_id = Column(String(120), nullable=True, index=True)
    action = Column(String(120), nullable=False) # e.g. 'quota_exceeded', 'tool_registered', 'key_updated'
    details = Column(Text, nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)


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

