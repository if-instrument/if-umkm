from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field

@dataclass
class LLMMessage:
    role: str # 'system', 'user', 'assistant', 'tool'
    content: str
    tool_call_id: Optional[str] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None

@dataclass
class LLMResponse:
    content: str
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    total_tokens: int
    tool_calls: List[Dict[str, Any]] = field(default_factory=list)
    raw_response: Optional[Dict[str, Any]] = None

class LLMProviderInterface(ABC):
    """
    Abstract interface for Multi-LLM Provider Integration (OpenAI, Anthropic, Gemini).
    """

    @abstractmethod
    def get_provider_name(self) -> str:
        pass

    @abstractmethod
    def chat_completion(
        self,
        messages: List[LLMMessage],
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 1500,
        tools: Optional[List[Dict[str, Any]]] = None,
        api_key_override: Optional[str] = None
    ) -> LLMResponse:
        """
        Execute chat completion against target provider API.
        Supports API Key Override (Company Bring-Your-Own-Key).
        """
        pass

    @abstractmethod
    def estimate_tokens(self, text: str) -> int:
        """
        Estimate token count for a given text prompt.
        """
        pass
