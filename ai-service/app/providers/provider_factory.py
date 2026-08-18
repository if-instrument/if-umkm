import os
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session

from app.providers.base_provider import LLMProviderInterface
from app.providers.openai_provider import OpenAIProvider
from app.providers.anthropic_provider import AnthropicProvider
from app.providers.gemini_provider import GeminiProvider
from app.models.platform import CompanyAIProviderKey

# Standard Model Token Pricing Map ($ USD per 1,000,000 tokens)
MODEL_PRICING_MAP = {
    "openai": {
        "gpt-4o": (2.50, 10.00),
        "gpt-4o-mini": (0.15, 0.60),
        "gpt-4-turbo": (10.00, 30.00),
    },
    "anthropic": {
        "claude-3-5-sonnet-20241022": (3.00, 15.00),
        "claude-3-5-haiku": (0.80, 4.00),
        "claude-3-opus-20240229": (15.00, 75.00),
    },
    "gemini": {
        "gemini-3.6-flash": (0.075, 0.30),
        "gemini-3.1-pro": (1.25, 5.00),
        "gemini-1.5-flash": (0.075, 0.30),
        "gemini-1.5-pro": (1.25, 5.00),
    }
}

class ProviderFactory:
    """
    Factory & Gateway for Multi-Provider LLM Integration.
    Supports OpenAI, Anthropic, and Google Gemini with BYOK (Bring Your Own Key) resolution.
    """

    _providers: Dict[str, LLMProviderInterface] = {
        "openai": OpenAIProvider(),
        "anthropic": AnthropicProvider(),
        "gemini": GeminiProvider(),
    }

    @classmethod
    def get_provider(cls, provider_name: str) -> LLMProviderInterface:
        key = (provider_name or "openai").lower().strip()
        if key not in cls._providers:
            raise ValueError(f"Unsupported AI Provider '{provider_name}'. Supported: {list(cls._providers.keys())}")
        return cls._providers[key]

    @classmethod
    def resolve_api_key(cls, db: Session, provider_name: str, application_id: str, company_id: str) -> Optional[str]:
        """
        Resolves active API key. Priority:
        1. Company BYOK (Bring Your Own Key) in company_ai_provider_keys
        2. System Environment Variable (.env)
        """
        provider_key = (provider_name or "openai").lower().strip()
        record = db.query(CompanyAIProviderKey).filter(
            CompanyAIProviderKey.application_id == application_id,
            CompanyAIProviderKey.company_id == company_id,
            CompanyAIProviderKey.provider == provider_key,
            CompanyAIProviderKey.is_active == True
        ).first()

        if record and record.api_key_encrypted:
            return record.api_key_encrypted

        return None

    @classmethod
    def calculate_cost(
        cls,
        db: Optional[Session],
        provider_name: str,
        model: str,
        input_tokens: int,
        output_tokens: int
    ) -> float:
        """
        Calculates estimated cost ($ USD) based on model rates per 1,000,000 tokens.
        """
        provider_key = (provider_name or "openai").lower().strip()
        model_rates = MODEL_PRICING_MAP.get(provider_key, {})
        rates = model_rates.get(model)

        if rates:
            in_cost_per_1m, out_cost_per_1m = rates
        else:
            # Universal default fallback rate
            in_cost_per_1m, out_cost_per_1m = 0.15, 0.60

        input_rate = in_cost_per_1m / 1_000_000
        output_rate = out_cost_per_1m / 1_000_000

        total_cost = (input_tokens * input_rate) + (output_tokens * output_rate)
        return round(total_cost, 6)
