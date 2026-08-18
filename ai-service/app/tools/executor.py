import os
import json
import hmac
import hashlib
import urllib.request
import urllib.error
import logging
from typing import Dict, Any, Optional
from app.config import settings

logger = logging.getLogger("tool_executor")

class ToolExecutor:
    """
    Remote Application Tool Executor.
    Calls registered tool endpoints on external applications via signed HMAC HTTP bridge.
    Includes fallback data generator for local dev single-threaded server environments.
    """

    @classmethod
    def execute_remote_tool(
        cls,
        application_id: str,
        company_id: str,
        user_id: str,
        tool_name: str,
        arguments: Dict[str, Any],
        target_url: Optional[str] = None
    ) -> Dict[str, Any]:
        if not target_url:
            target_url = os.getenv("AI_APPLICATION_TOOL_URL", "http://localhost:8081/api/ai/tool-execute")

        payload = {
            "application_id": application_id,
            "company_id": company_id,
            "user_id": user_id,
            "tool_name": tool_name,
            "arguments": arguments or {}
        }

        json_payload = json.dumps(payload, ensure_ascii=False)
        signature = hmac.new(
            settings.HMAC_SECRET.encode("utf-8"),
            json_payload.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()

        headers = {
            "Content-Type": "application/json",
            "X-API-Key": settings.API_KEY,
            "X-Signature": signature
        }

        logger.info(f"Executing remote tool '{tool_name}' for [{application_id}:{company_id}] at {target_url}")

        try:
            req = urllib.request.Request(
                target_url,
                data=json_payload.encode("utf-8"),
                headers=headers,
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=3) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                return res_data
        except Exception as e:
            logger.warning(f"Remote tool execution fallback used for '{tool_name}': {str(e)}")
            return {
                "ok": True,
                "tool_name": tool_name,
                "company_id": company_id,
                "data": cls._fallback_data(tool_name),
                "source_note": "Domain Application Tool Bridge (Dev Fallback)"
            }

    @classmethod
    def _fallback_data(cls, tool_name: str) -> Any:
        return []
