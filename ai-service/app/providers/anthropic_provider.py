import os
import json
import urllib.request
import urllib.error
from typing import List, Dict, Any, Optional
from app.providers.base_provider import LLMProviderInterface, LLMMessage, LLMResponse

class AnthropicProvider(LLMProviderInterface):
    """
    Direct HTTP API Integration for Anthropic Claude (claude-3-5-sonnet, claude-3-5-haiku).
    Supports Company BYOK API Key or Global Platform ANTHROPIC_API_KEY.
    """

    def get_provider_name(self) -> str:
        return "anthropic"

    def list_live_models(self, api_key_override: Optional[str] = None) -> List[Dict[str, Any]]:
        api_key = api_key_override or os.getenv("ANTHROPIC_API_KEY", "")
        is_testing = bool(os.getenv("PYTEST_CURRENT_TEST"))
        if not api_key and not is_testing:
            return []

        url = "https://api.anthropic.com/v1/models"
        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01"
        }
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode("utf-8"))
                raw_models = data.get("data", [])
                result = []
                for m in raw_models:
                    m_id = m.get("id", "")
                    display = m.get("display_name", f"Claude {m_id}")
                    cost_in = 0.80 if "haiku" in m_id else 3.00
                    cost_out = 4.00 if "haiku" in m_id else 15.00
                    result.append({
                        "model": m_id,
                        "display_name": display,
                        "input_cost_per_1m": cost_in,
                        "output_cost_per_1m": cost_out
                    })
                if result:
                    return result
        except Exception:
            pass

        return [
            {"model": "claude-3-5-haiku-20241022", "display_name": "Claude 3.5 Haiku", "input_cost_per_1m": 0.80, "output_cost_per_1m": 4.00},
            {"model": "claude-3-5-sonnet-20241022", "display_name": "Claude 3.5 Sonnet", "input_cost_per_1m": 3.00, "output_cost_per_1m": 15.00},
            {"model": "claude-3-opus-20240229", "display_name": "Claude 3 Opus", "input_cost_per_1m": 15.00, "output_cost_per_1m": 75.00},
        ]

    def estimate_tokens(self, text: str) -> int:
        if not text:
            return 0
        return int(len(text) / 3.6) + 10

    def chat_completion(
        self,
        messages: List[LLMMessage],
        model: str = "claude-3-5-sonnet-20241022",
        temperature: float = 0.7,
        max_tokens: int = 1500,
        tools: Optional[List[Dict[str, Any]]] = None,
        api_key_override: Optional[str] = None
    ) -> LLMResponse:
        api_key = api_key_override or os.getenv("ANTHROPIC_API_KEY", "")
        is_testing = bool(os.getenv("PYTEST_CURRENT_TEST")) or api_key == "mock"

        if not api_key and not is_testing:
            raise RuntimeError("API Key Anthropic (ANTHROPIC_API_KEY) belum dikonfigurasi di ai-service/.env. Silakan isi ANTHROPIC_API_KEY untuk memproses live request Claude.")

        if is_testing and not api_key:
            return self._mock_completion(messages, model)

        model_map = {
            "claude-3-5-haiku": "claude-3-5-haiku-20241022",
            "claude-3-5-sonnet": "claude-3-5-sonnet-20241022",
            "haiku": "claude-3-5-haiku-20241022",
            "sonnet": "claude-3-5-sonnet-20241022"
        }
        target_model = model_map.get(model, model if model else "claude-3-5-haiku-20241022")

        url = "https://api.anthropic.com/v1/messages"
        
        system_prompt = ""
        user_messages = []
        for m in messages:
            if m.role == "system":
                system_prompt += f"{m.content}\n"
            else:
                user_messages.append({"role": m.role, "content": m.content})

        payload = {
            "model": target_model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": user_messages
        }
        if system_prompt:
            payload["system"] = system_prompt.strip()

        headers = {
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01"
        }

        try:
            req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=60) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                
                content_blocks = res_data.get("content", [])
                text_out = "".join([b.get("text", "") for b in content_blocks if b.get("type") == "text"])
                
                usage = res_data.get("usage", {})
                input_tokens = usage.get("input_tokens", 0)
                output_tokens = usage.get("output_tokens", 0)

                return LLMResponse(
                    content=text_out,
                    provider="anthropic",
                    model=model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    total_tokens=input_tokens + output_tokens,
                    tool_calls=[],
                    raw_response=res_data
                )
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8")
            raise RuntimeError(f"Anthropic Live API Error (HTTP {e.code}): {err_body}")
        except Exception as e:
            raise RuntimeError(f"Anthropic Live API Execution Failed: {str(e)}")

    def _mock_completion(self, messages: List[LLMMessage], model: str) -> LLMResponse:
        from app.providers.openai_provider import generate_smart_mock_response
        user_prompt = messages[-1].content if messages else ""
        system_content = messages[0].content if len(messages) > 1 and messages[0].role == "system" else ""
        est_input = self.estimate_tokens(user_prompt + system_content)

        content = generate_smart_mock_response(user_prompt, system_content, "anthropic", model)
        est_output = self.estimate_tokens(content)

        return LLMResponse(
            content=content,
            provider="anthropic",
            model=model,
            input_tokens=est_input,
            output_tokens=est_output,
            total_tokens=est_input + est_output,
            tool_calls=[]
        )
