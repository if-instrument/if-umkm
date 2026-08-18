import json
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from app.models.identity import RequestContext
from app.providers.provider_factory import ProviderFactory
from app.providers.base_provider import LLMMessage
from app.tools.executor import ToolExecutor
from app.tools.registry import ToolRegistry

logger = logging.getLogger("analyst_service")

class BusinessAnalystEngine:
    """
    AI Business Analyst Engine.
    Executes domain-agnostic tool requests, multi-signal reasoning, and recipe recommendations.
    Strictly enforces Anti-Hallucination rules for internal business data.
    """

    @classmethod
    def analyze_business(
        cls,
        db: Session,
        context: RequestContext,
        prompt: str,
        provider_name: str = "openai",
        model_name: str = "gpt-4o-mini",
        temperature: float = 0.5
    ) -> Dict[str, Any]:
        prompt_lower = prompt.lower()

        tool_calls_executed = []
        internal_data_retrieved = {}
        data_sources_used = []

        import time
        from app.models.platform import AIDataAccessLog

        # 1. Manage Conversation Session & Retrieve History Memory
        from app.services.chat_service import ChatHistoryService
        conv = ChatHistoryService.get_or_create_conversation(
            db=db,
            application_id=context.application_id,
            company_id=context.company_id,
            user_id=context.user_id,
            conversation_id=context.conversation_id,
            first_prompt=prompt
        )
        context.conversation_id = conv.conversation_id
        past_turns = ChatHistoryService.get_conversation_context(db, conv.conversation_id, limit=4)

        # 2. Dynamic LLM Tool Planning with Multi-Turn Context Memory
        available_tools = ToolRegistry.list_tools(context.application_id)
        tools_summary = []
        for t in available_tools:
            tools_summary.append({
                "name": t.name,
                "description": t.description,
                "input_schema": t.input_schema
            })

        planner_system_prompt = (
            "You are an AI Internal Data Planner. Your primary task is to analyze the user's chat prompt and past conversation history FIRST.\n\n"
            "STRICT PLANNING RULES:\n"
            "1. IF the prompt is general conversation, greeting, advice, general knowledge, or external industry information "
            "(unrelated to specific internal company data like sales orders, inventory stock, product recipes/HPP, or expenses), "
            "do NOT call any internal tools. Return {\"needed_tools\": []}.\n"
            "2. TOOL SELECTION RULES:\n"
            "   - IF user explicitly asks to view/see the full catalog (e.g., 'minta lihat produk', 'daftar produk', 'tampilkan katalog'), select 'get_product_list'.\n"
            "   - IF user asks about product performance, menu evaluation, or specific product stats (e.g. 'produk mana yang kurang laku', 'kalau untuk produk banana latte'), select 'get_product_performance'.\n"
            "   - IF user asks for raw materials, ingredients stock, or HPP recipe costs, select 'get_recipe_ingredients'.\n"
            "   - IF user asks for inventory stock levels or low stock warnings, select 'get_inventory_status'.\n\n"
            f"AVAILABLE INTERNAL TOOLS:\n{json.dumps(tools_summary, indent=2)}\n\n"
            "OUTPUT FORMAT INSTRUCTIONS:\n"
            "Return ONLY a valid JSON object matching this schema:\n"
            "{\n"
            '  "needed_tools": [\n'
            '    {\n'
            '      "tool_name": "tool_name_here",\n'
            '      "arguments": { ... }\n'
            '    }\n'
            '  ]\n'
            "}\n"
            "If no internal tools are required, return {\"needed_tools\": []}."
        )

        byok_key = ProviderFactory.resolve_api_key(db, provider_name, context.application_id, context.company_id)
        llm_driver = ProviderFactory.get_provider(provider_name)

        t_plan0 = time.time()
        requested_tools = []
        try:
            planner_messages = [
                LLMMessage(role="system", content=planner_system_prompt)
            ]
            for pm in past_turns:
                if pm.role in ["user", "assistant"]:
                    planner_messages.append(pm)
            if not past_turns or past_turns[-1].content != prompt:
                planner_messages.append(LLMMessage(role="user", content=prompt))

            planner_res = llm_driver.chat_completion(
                messages=planner_messages,
                model="gemini-flash-latest" if provider_name == "gemini" else "gpt-4o-mini",
                temperature=0.0,
                max_tokens=200,
                api_key_override=byok_key
            )
            plan_duration_ms = round((time.time() - t_plan0) * 1000, 2)

            # Record External LLM Data Access Log for Planner Step
            try:
                db.add(AIDataAccessLog(
                    request_id=context.request_id,
                    application_id=context.application_id,
                    company_id=context.company_id,
                    user_id=context.user_id,
                    access_type="EXTERNAL_LLM",
                    source="ai-service.analyst_engine.planner",
                    destination=f"{provider_name.capitalize()} Cloud API ({planner_res.model})",
                    operation=f"llm_tool_planner ({planner_res.model})",
                    status="SUCCESS",
                    records_count=planner_res.total_tokens,
                    duration_ms=plan_duration_ms,
                    request_payload=json.dumps([{"role": m.role, "content": m.content} for m in planner_messages], ensure_ascii=False),
                    response_content=planner_res.content,
                    details_json=json.dumps({
                        "step": "tool_planner",
                        "provider": provider_name,
                        "model": planner_res.model,
                        "input_tokens": planner_res.input_tokens,
                        "output_tokens": planner_res.output_tokens,
                        "total_tokens": planner_res.total_tokens
                    })
                ))
                db.commit()
            except Exception as log_err:
                logger.warning(f"Could not save planner LLM data access log: {log_err}")

            cleaned_json = planner_res.content.strip()
            if "```json" in cleaned_json:
                cleaned_json = cleaned_json.split("```json")[1].split("```")[0].strip()
            elif "```" in cleaned_json:
                cleaned_json = cleaned_json.split("```")[1].split("```")[0].strip()
            parsed_plan = json.loads(cleaned_json)
            requested_tools = parsed_plan.get("needed_tools", [])
        except Exception as plan_err:
            logger.warning(f"LLM Tool Planner notice/fallback: {plan_err}")
            if any(w in prompt_lower for w in ["lihat produk", "daftar produk", "list produk", "katalog"]):
                requested_tools.append({"tool_name": "get_product_list", "arguments": {"search": ""}})
            elif any(w in prompt_lower for w in ["resep", "recipe", "americano", "peach", "bahan", "ingredient", "hpp"]):
                requested_tools.append({"tool_name": "get_recipe_ingredients", "arguments": {"search": ""}})
            else:
                requested_tools.append({"tool_name": "get_product_performance", "arguments": {"period": "90d", "limit": 10}})

        # 2. Dynamically execute all requested tools from the LLM plan!
        for req_t in requested_tools:
            tool_name = req_t.get("tool_name") or req_t.get("tool")
            tool_args = req_t.get("arguments") or {}
            if not tool_name:
                continue

            t0 = time.time()
            exec_res = ToolExecutor.execute_remote_tool(
                application_id=context.application_id,
                company_id=context.company_id,
                user_id=context.user_id,
                tool_name=tool_name,
                arguments=tool_args
            )
            duration_ms = round((time.time() - t0) * 1000, 2)
            tool_calls_executed.append({"tool": tool_name, "arguments": tool_args, "result": exec_res})

            data_arr = exec_res.get("data", []) if exec_res.get("ok") else []
            if exec_res.get("ok"):
                internal_data_retrieved[tool_name] = data_arr
                data_sources_used.append(f"Aplikasi Internal DB ({tool_name})")

            # Record Internal Data Access Audit Log
            try:
                db.add(AIDataAccessLog(
                    request_id=context.request_id,
                    application_id=context.application_id,
                    company_id=context.company_id,
                    user_id=context.user_id,
                    access_type="INTERNAL_READ",
                    source="ai-service.analyst_engine",
                    destination=f"CodeIgniter Tenant DB ({context.company_id})",
                    operation=tool_name,
                    status="SUCCESS" if exec_res.get("ok") else "FAILED",
                    records_count=len(data_arr) if isinstance(data_arr, list) else 1,
                    duration_ms=duration_ms,
                    request_payload=json.dumps({"tool": tool_name, "arguments": tool_args}, ensure_ascii=False),
                    response_content=json.dumps(exec_res, ensure_ascii=False),
                    details_json=json.dumps({"arguments": tool_args, "tool": tool_name})
                ))
                db.commit()
            except Exception as log_err:
                logger.warning(f"Could not save internal data access log: {log_err}")

        # 3. Manage Conversation Session & Persist User Message
        from app.services.chat_service import ChatHistoryService
        conv = ChatHistoryService.get_or_create_conversation(
            db=db,
            application_id=context.application_id,
            company_id=context.company_id,
            user_id=context.user_id,
            conversation_id=context.conversation_id,
            first_prompt=prompt
        )
        context.conversation_id = conv.conversation_id
        ChatHistoryService.save_message(db, conv.conversation_id, "user", prompt)

        # 4. Build Anti-Hallucination & Multi-Signal System Context
        company_label = context.company_id or "UMKM"
        system_instruction = (
            f"Anda adalah Senior AI Business Assistant & Analyst untuk bisnis/perusahaan '{company_label}' (Aplikasi: '{context.application_id}').\n"
            "PANDUAN PERILAKU & ATURAN RESPON:\n"
            "1. RELEVANSI KONTEKS:\n"
            "   - Jika user bertanya topik umum (misalnya cuaca, sapaan, tips bisnis, atau wawasan umum), jawablah dengan ramah, cerdas, dan natural dalam Bahasa Indonesia.\n"
            "   - Jika pertanyaan terkait dampak eksternal (seperti cuaca terhadap penjualan minuman/makanan), berikan analisis korelasi bisnis yang bermanfaat (misal: saat musim hujan dorong promo minuman panas/delivery).\n"
            "   - Jika user menanyakan data internal spesifik (produk, penjualan, stok, resep, HPP), gunakan data dari tools internal di bawah ini.\n"
            "2. ANTI-HALUSINASI DATA INTERNAL:\n"
            "   - Jangan mengarang angka finansial internal (omset, sisa stok, HPP) jika tidak ada dalam data tools.\n"
            "   - Tampilkan tabel hanya jika relevan dengan pertanyaan user (jangan memaksakan tabel jika user hanya bertanya hal umum atau sapaan).\n"
            "3. BAHASA: Gunakan Bahasa Indonesia yang profesional, ramah, dan solutif."
        )

        data_section = ""
        if internal_data_retrieved:
            data_section = f"\n\nDATA INTERNAL TERSEDIA DARI SISTEM BISNIS:\n{json.dumps(internal_data_retrieved, indent=2, ensure_ascii=False)}"

        messages = [
            LLMMessage(role="system", content=f"{system_instruction}{data_section}")
        ]

        # Append past turns except the current prompt to prevent context duplication
        past_turns = ChatHistoryService.get_conversation_context(db, conv.conversation_id, limit=6)
        for pm in past_turns[:-1]:
            if pm.role in ["user", "assistant"]:
                messages.append(pm)

        messages.append(LLMMessage(role="user", content=prompt))

        # 4. Call LLM Driver
        byok_key = ProviderFactory.resolve_api_key(db, provider_name, context.application_id, context.company_id)
        llm_driver = ProviderFactory.get_provider(provider_name)
        
        t_llm0 = time.time()
        llm_res = llm_driver.chat_completion(
            messages=messages,
            model=model_name,
            temperature=temperature,
            max_tokens=1500,
            api_key_override=byok_key
        )
        llm_duration_ms = round((time.time() - t_llm0) * 1000, 2)

        # Save Assistant Answer to Message History
        ChatHistoryService.save_message(db, conv.conversation_id, "assistant", llm_res.content, tokens_used=llm_res.total_tokens)

        # Record External LLM Data Access Log
        try:
            db.add(AIDataAccessLog(
                request_id=context.request_id,
                application_id=context.application_id,
                company_id=context.company_id,
                user_id=context.user_id,
                access_type="EXTERNAL_LLM",
                source="ai-service.llm_provider",
                destination=f"{provider_name.capitalize()} Cloud API ({llm_res.model})",
                operation=f"chat_completion ({llm_res.model})",
                status="SUCCESS",
                records_count=llm_res.total_tokens,
                duration_ms=llm_duration_ms,
                request_payload=json.dumps([{"role": m.role, "content": m.content} for m in messages], ensure_ascii=False),
                response_content=llm_res.content,
                details_json=json.dumps({
                    "provider": provider_name,
                    "model": llm_res.model,
                    "input_tokens": llm_res.input_tokens,
                    "output_tokens": llm_res.output_tokens,
                    "total_tokens": llm_res.total_tokens
                })
            ))
            db.commit()
        except Exception as log_err:
            logger.warning(f"Could not save external LLM data access log: {log_err}")

        # 4. Extract Structured Recommendations & Actions
        recommendations = []
        proposed_actions = []

        if "product_performance" in internal_data_retrieved:
            for item in internal_data_retrieved["product_performance"]:
                vol = item.get("sales_volume", 0)
                avg = item.get("category_avg", 100)
                trend = item.get("trend_percent", 0)
                if vol < avg or trend < 0:
                    recommendations.append({
                        "product": item.get("product_name"),
                        "sales_volume": vol,
                        "category_avg": avg,
                        "trend": f"{trend}%",
                        "margin": item.get("margin_percent", "N/A"),
                        "recommendation": f"Evaluasi harga, resep, atau promosi untuk {item.get('product_name')} karena volume penjualan di bawah rata-rata kategori.",
                        "reasoning": f"Penjualan 90 hari ({vol}) di bawah rata-rata ({avg}) dengan tren {trend}%."
                    })

        return {
            "answer": llm_res.content,
            "sources": data_sources_used,
            "tool_calls_executed": [t["tool"] for t in tool_calls_executed],
            "internal_data_supplied": bool(internal_data_retrieved),
            "recommendations": recommendations,
            "proposed_actions": proposed_actions,
            "provider": provider_name,
            "model": llm_res.model,
            "input_tokens": llm_res.input_tokens,
            "output_tokens": llm_res.output_tokens,
            "total_tokens": llm_res.total_tokens
        }
