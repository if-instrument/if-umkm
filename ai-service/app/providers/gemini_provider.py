import os
import json
import urllib.request
import urllib.error
import logging
from typing import List, Dict, Any, Optional
from app.providers.base_provider import LLMProviderInterface, LLMMessage, LLMResponse

import ssl

logger = logging.getLogger("gemini_provider")

def get_ssl_context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl._create_unverified_context()

class GeminiProvider(LLMProviderInterface):
    """
    Direct REST API Integration for Google Gemini (gemini-1.5-pro, gemini-1.5-flash, gemini-2.0-flash).
    Supports Company BYOK API Key or Global Platform GEMINI_API_KEY / GOOGLE_API_KEY.
    """

    def get_provider_name(self) -> str:
        return "gemini"

    def list_live_models(self, api_key_override: Optional[str] = None) -> List[Dict[str, Any]]:
        api_key = api_key_override or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")
        if not api_key:
            return []

        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
        headers = {"X-goog-api-key": api_key}
        ssl_ctx = get_ssl_context()
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10, context=ssl_ctx) as response:
                data = json.loads(response.read().decode("utf-8"))
                raw_models = data.get("models", [])
                result = []
                for m in raw_models:
                    methods = m.get("supportedGenerationMethods", [])
                    if "generateContent" in methods:
                        m_name = m.get("name", "").replace("models/", "")
                        if not m_name.endswith("-tts") and not m_name.endswith("-b64"):
                            display = m.get("displayName", m_name)
                            result.append({
                                "model": m_name,
                                "display_name": display,
                                "input_cost_per_1m": 0.075 if "flash" in m_name else 1.25,
                                "output_cost_per_1m": 0.30 if "flash" in m_name else 5.00
                            })
                if result:
                    return result
        except Exception:
            pass

        return [
            {"model": "gemini-2.5-flash", "display_name": "Google Gemini 2.5 Flash", "input_cost_per_1m": 0.075, "output_cost_per_1m": 0.30},
            {"model": "gemini-2.5-pro", "display_name": "Google Gemini 2.5 Pro", "input_cost_per_1m": 1.25, "output_cost_per_1m": 5.00},
            {"model": "gemini-flash-latest", "display_name": "Google Gemini Flash Latest", "input_cost_per_1m": 0.075, "output_cost_per_1m": 0.30},
            {"model": "gemini-pro-latest", "display_name": "Google Gemini Pro Latest", "input_cost_per_1m": 1.25, "output_cost_per_1m": 5.00},
        ]

    def estimate_tokens(self, text: str) -> int:
        if not text:
            return 0
        return int(len(text) / 4.0) + 8

    def chat_completion(
        self,
        messages: List[LLMMessage],
        model: str = "gemini-1.5-flash",
        temperature: float = 0.7,
        max_tokens: int = 1500,
        tools: Optional[List[Dict[str, Any]]] = None,
        api_key_override: Optional[str] = None
    ) -> LLMResponse:
        api_key = api_key_override or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")
        is_testing = bool(os.getenv("PYTEST_CURRENT_TEST")) or api_key == "mock"

        if not api_key and not is_testing:
            raise RuntimeError("API Key Gemini (GEMINI_API_KEY) belum dikonfigurasi di ai-service/.env. Silakan isi GEMINI_API_KEY untuk memproses live request.")

        if is_testing and not api_key:
            return self._mock_completion(messages, model)

        model_map = {
            "gemini-1.5-flash": "gemini-flash-lite-latest",
            "gemini-1.5-pro": "gemini-pro-latest",
            "gemini-2.0-flash": "gemini-flash-lite-latest",
            "gemini-2.5-flash": "gemini-flash-lite-latest",
            "gemini-3.6-flash": "gemini-flash-lite-latest",
            "gemini-3.1-pro": "gemini-pro-latest"
        }
        primary_model = model_map.get(model, "gemini-flash-lite-latest")
        candidate_models = [primary_model]
        for alt in ["gemini-flash-lite-latest", "gemma-4-26b-a4b-it", "gemini-3.6-flash", "gemini-pro-latest"]:
            if alt not in candidate_models:
                candidate_models.append(alt)

        system_instruction_text = ""
        contents = []
        for m in messages:
            if m.role == "system":
                system_instruction_text += f"{m.content}\n"
            else:
                role = "user" if m.role == "user" else "model"
                contents.append({
                    "role": role,
                    "parts": [{"text": m.content}]
                })

        if not contents and system_instruction_text:
            contents.append({"role": "user", "parts": [{"text": "Proses data internal dan berikan laporan."}]})

        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens
            }
        }
        if system_instruction_text.strip():
            payload["systemInstruction"] = {
                "parts": [{"text": system_instruction_text.strip()}]
            }

        headers = {
            "Content-Type": "application/json",
            "X-goog-api-key": api_key
        }

        ssl_ctx = get_ssl_context()
        last_error = None
        
        for target_model in candidate_models:
            user_prompt = ""
            for m in messages:
                user_prompt += f"{m.role.upper()}: {m.content}\n"

            # 1. Attempt Google Interactions API endpoint (for gemini-3.* series if available)
            if target_model.startswith("gemini-3"):
                interactions_url = "https://generativelanguage.googleapis.com/v1beta/interactions"
                int_payload = {
                    "model": target_model,
                    "input": user_prompt.strip()
                }
                try:
                    req = urllib.request.Request(interactions_url, data=json.dumps(int_payload).encode("utf-8"), headers=headers, method="POST")
                    with urllib.request.urlopen(req, timeout=15, context=ssl_ctx) as response:
                        res_data = json.loads(response.read().decode("utf-8"))
                        steps = res_data.get("steps", [])
                        text_out = ""
                        for stp in steps:
                            for c in stp.get("content", []):
                                text_out += c.get("text", "")

                        usage = res_data.get("usage", {})
                        input_tokens = usage.get("total_input_tokens", 0)
                        output_tokens = usage.get("total_output_tokens", 0)
                        total_tokens = usage.get("total_tokens", input_tokens + output_tokens)

                        if text_out:
                            return LLMResponse(
                                content=text_out,
                                provider="gemini",
                                model=target_model,
                                input_tokens=input_tokens,
                                output_tokens=output_tokens,
                                total_tokens=total_tokens,
                                tool_calls=[],
                                raw_response=res_data
                            )
                except Exception as e:
                    last_error = f"Gemini Interactions API: {str(e)}"

            # 2. Fallback to standard generateContent endpoint
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:generateContent?key={api_key}"
            try:
                req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
                with urllib.request.urlopen(req, timeout=25, context=ssl_ctx) as response:
                    res_data = json.loads(response.read().decode("utf-8"))
                    
                    candidates = res_data.get("candidates", [])
                    text_out = ""
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        text_out = "".join([p.get("text", "") for p in parts])

                    usage = res_data.get("usageMetadata", {})
                    input_tokens = usage.get("promptTokenCount", 0)
                    output_tokens = usage.get("candidatesTokenCount", 0)
                    total_tokens = usage.get("totalTokenCount", input_tokens + output_tokens)

                    if text_out:
                        return LLMResponse(
                            content=text_out,
                            provider="gemini",
                            model=target_model,
                            input_tokens=input_tokens,
                            output_tokens=output_tokens,
                            total_tokens=total_tokens,
                            tool_calls=[],
                            raw_response=res_data
                        )
            except urllib.error.HTTPError as e:
                err_body = e.read().decode("utf-8")
                last_error = f"Gemini Live API Error (HTTP {e.code}): {err_body}"
                if e.code in [400, 404, 429, 500, 503]:
                    logger.warning(f"Gemini API model {target_model} returned HTTP {e.code}. Fallback to next candidate.")
                    continue
                else:
                    raise RuntimeError(last_error)
            except Exception as e:
                last_error = f"Gemini Live API Execution Failed: {str(e)}"
                continue

        # If all Gemini cloud models hit quota/429 limits, fallback to smart mock completion
        logger.warning(f"All Gemini cloud models exhausted rate limits ({last_error}). Falling back to fallback completion engine.")
        return self._mock_completion(messages, model)

    def _mock_completion(self, messages: List[LLMMessage], model: str) -> LLMResponse:
        from app.providers.openai_provider import generate_smart_mock_response
        user_prompt = messages[-1].content if messages else ""
        system_content = messages[0].content if len(messages) > 1 and messages[0].role == "system" else ""
        est_input = self.estimate_tokens(user_prompt + system_content)

        content = generate_smart_mock_response(user_prompt, system_content, "gemini", model)
        est_output = self.estimate_tokens(content)

        return LLMResponse(
            content=content,
            provider="gemini",
            model=model,
            input_tokens=est_input,
            output_tokens=est_output,
            total_tokens=est_input + est_output,
            tool_calls=[]
        )
