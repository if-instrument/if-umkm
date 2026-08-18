import logging
from typing import Dict, Optional, Tuple
from sqlalchemy.orm import Session

from app.providers.base_provider import LLMProviderInterface
from app.providers.openai_provider import OpenAIProvider
from app.providers.anthropic_provider import AnthropicProvider
from app.providers.gemini_provider import GeminiProvider
from app.models.platform import CompanyAIProviderKey, AIModelPricing

logger = logging.getLogger("provider_factory")

class ProviderFactory:
    """
    Factory & Resolver for Multi-LLM Providers.
    Supports Company Bring-Your-Own-Key (BYOK) overrides and model pricing lookup.
    """

    _providers: Dict[str, LLMProviderInterface] = {
        "openai": OpenAIProvider(),
        "anthropic": AnthropicProvider(),
        "gemini": GeminiProvider(),
    }

    @classmethod
    def get_provider(cls, provider_name: str) -> LLMProviderInterface:
        provider_key = (provider_name or "openai").lower().strip()
        if provider_key not in cls._providers:
            raise ValueError(f"Unsupported LLM provider: {provider_name}. Available: {list(cls._providers.keys())}")
        return cls._providers[provider_key]

    @classmethod
    def resolve_api_key(
        cls,
        db: Session,
        provider_name: str,
        application_id: str,
        company_id: str
    ) -> Optional[str]:
        """
        Key Resolution Hierarchy:
        1. Company BYOK stored in company_ai_provider_keys
        2. Returns None (falls back to platform environment master keys in provider driver)
        """
        provider_key = (provider_name or "openai").lower().strip()
        record = db.query(CompanyAIProviderKey).filter(
            CompanyAIProviderKey.application_id == application_id,
            CompanyAIProviderKey.company_id == company_id,
            CompanyAIProviderKey.provider == provider_key,
            CompanyAIProviderKey.is_active == True
        ).first()

        if record and record.api_key_encrypted:
            # Return decrypted key (in production, decrypt with system AES key)
            return record.api_key_encrypted

        return None

    @classmethod
    def calculate_cost(
        cls,
        db: Session,
        provider_name: str,
        model: str,
        input_tokens: int,
        output_tokens: int
    ) -> float:
        """
        Calculates estimated cost ($ USD) based on model pricing table in database.
        """
        provider_key = (provider_name or "openai").lower().strip()
        pricing = db.query(AIModelPricing).filter(
            AIModelPricing.provider == provider_key,
            AIModelPricing.model == model
        ).first()

        if not pricing:
            # Default fallback rates per 1,000,000 tokens
            input_rate = 0.15 / 1_000_000
            output_rate = 0.60 / 1_000_000
        else:
            input_rate = pricing.input_cost_per_1m / 1_000_000
            output_rate = pricing.output_cost_per_1m / 1_000_000

        total_cost = (input_tokens * input_rate) + (output_tokens * output_rate)
        return round(total_cost, 6)
