import json
import logging
import time
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from app.models.identity import RequestContext
from app.models.platform import Company, AIDataAccessLog
from app.providers.provider_factory import ProviderFactory
from app.providers.base_provider import LLMMessage
from app.tools.executor import ToolExecutor
from app.tools.registry import ToolRegistry
from app.services.chat_service import ChatHistoryService

logger = logging.getLogger("analyst_service")

class BusinessAnalystEngine:
    """
    AI Business Analyst Engine.
    Features:
    - 100% Dynamic & Natural Conversational Onboarding (LLM-driven phrasing)
    - Zero Hardcoded Template Responses
    - Immediate multi-turn resolution of initial questions upon onboarding
    - Dynamic Multi-Tool Planning & Anti-Hallucination
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
        just_completed_onboarding = False

        # 1. Retrieve or auto-create Company profile in DB
        company = db.query(Company).filter(
            Company.application_id == context.application_id,
            Company.company_id == context.company_id
        ).first()

        if not company:
            company = Company(
                application_id=context.application_id,
                company_id=context.company_id,
                is_onboarded=False
            )
            db.add(company)
            db.commit()
            db.refresh(company)

        # 2. Check for Profile Reset Command
        is_updating_profile = any(k in prompt_lower for k in [
            "ganti bidang", "ubah kategori", "ubah bidang usaha", "reset profil usaha", "ubah profil"
        ])
        if is_updating_profile:
            company.business_type = None
            company.description = None
            company.is_onboarded = False
            db.commit()

        byok_key = ProviderFactory.resolve_api_key(db, provider_name, context.application_id, context.company_id)
        llm_driver = ProviderFactory.get_provider(provider_name)
        company_label = context.company_id or "UMKM"

        # 3. DYNAMIC MULTI-TURN STEP-BY-STEP ONBOARDING
        if not company.is_onboarded:
            # -------------------------------------------------------------
            # STEP 1: Business Category (Type) is missing
            # -------------------------------------------------------------
            if not company.business_type:
                classifier_prompt = (
                    "You are a business classifier. Analyze the user's message and determine if the user is stating their business category/industry.\n"
                    "Examples: 'kami kedai kopi', 'kafe', 'toko baju', 'fashion retail', 'apotek', 'bengkel motor', 'laundry', 'barbershop', 'sembako', dll.\n\n"
                    "Return ONLY a JSON object:\n"
                    "{\n"
                    '  "is_answering_category": true|false,\n'
                    '  "business_type": "Concise business category in Indonesian, e.g. Kedai Kopi & F&B, Fashion Retail, Apotek, Bengkel Otomotif, dll."\n'
                    "}"
                )
                try:
                    cat_res = llm_driver.chat_completion(
                        messages=[
                            LLMMessage(role="system", content=classifier_prompt),
                            LLMMessage(role="user", content=prompt)
                        ],
                        model="gpt-4o-mini",
                        temperature=0.1,
                        max_tokens=200,
                        api_key_override=byok_key
                    )
                    cat_json = json.loads(cat_res.content.replace("```json", "").replace("```", "").strip())
                    if cat_json.get("is_answering_category") and cat_json.get("business_type"):
                        company.business_type = cat_json.get("business_type")
                        company.description = None
                        company.is_onboarded = False
                        db.commit()

                        # Generate natural, contextual Step 2 question via LLM
                        step2_gen_prompt = (
                            f"Anda adalah Senior AI Business Assistant untuk bisnis '{company_label}' di aplikasi POS '{context.application_id}'.\n"
                            f"Pengguna baru saja memberitahu bahwa bidang usahanya adalah '{company.business_type}'.\n"
                            "TUGAS ANDA:\n"
                            "1. Apresiasi bidang usaha tersebut dengan ramah, natural, dan antusias dalam 1 kalimat.\n"
                            "2. Secara santun dan mengalir, tanyakan deskripsi singkat operasional toko mereka atau apa saja produk/jasa yang mereka tawarkan.\n"
                            "Gunakan Bahasa Indonesia yang hangat, bersahabat, dan profesional tanpa terdengar kaku atau robotik."
                        )
                        step2_res = llm_driver.chat_completion(
                            messages=[
                                LLMMessage(role="system", content=step2_gen_prompt),
                                LLMMessage(role="user", content=prompt)
                            ],
                            model=model_name,
                            temperature=0.7,
                            max_tokens=250,
                            api_key_override=byok_key
                        )
                        step2_message = step2_res.content

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
                        ChatHistoryService.save_message(db, conv.conversation_id, "assistant", step2_message, tokens_used=step2_res.total_tokens)

                        return {
                            "answer": step2_message,
                            "tool_calls": [],
                            "data_sources": [],
                            "provider": provider_name,
                            "model": model_name,
                            "input_tokens": step2_res.input_tokens,
                            "output_tokens": step2_res.output_tokens,
                            "total_tokens": step2_res.total_tokens,
                            "is_onboarded": False,
                            "business_type": company.business_type
                        }
                except Exception as e:
                    logger.warning(f"Error in Step 1 category check: {e}")

                # If STILL missing business_type -> Generate Natural Step 1 Question
                step1_gen_prompt = (
                    f"Anda adalah Senior AI Business Assistant untuk bisnis '{company_label}' di aplikasi POS '{context.application_id}'.\n"
                    "Pengguna baru saja mengirim pesan pertama kali ke chatbot sistem analitik.\n"
                    "TUGAS ANDA:\n"
                    "1. Sapa pengguna secara hangat dan natural (tanggapi secara wajar pesan mereka).\n"
                    "2. Beritahu dengan santun bahwa sebelum Anda dapat menganalisis data atau mendampingi toko mereka, Anda perlu mengetahui toko mereka bergerak di bidang usaha/kategori apa (berikan contoh yang variatif).\n"
                    "Bicaralah secara mengalir seperti rekan bisnis yang ramah, jangan terdengar kaku."
                )
                step1_res = llm_driver.chat_completion(
                    messages=[
                        LLMMessage(role="system", content=step1_gen_prompt),
                        LLMMessage(role="user", content=prompt)
                    ],
                    model=model_name,
                    temperature=0.7,
                    max_tokens=250,
                    api_key_override=byok_key
                )
                step1_message = step1_res.content

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
                ChatHistoryService.save_message(db, conv.conversation_id, "assistant", step1_message, tokens_used=step1_res.total_tokens)

                return {
                    "answer": step1_message,
                    "tool_calls": [],
                    "data_sources": [],
                    "provider": provider_name,
                    "model": model_name,
                    "input_tokens": step1_res.input_tokens,
                    "output_tokens": step1_res.output_tokens,
                    "total_tokens": step1_res.total_tokens,
                    "is_onboarded": False,
                    "business_type": None
                }

            # -------------------------------------------------------------
            # STEP 2: Business Category is known, now asking for Description
            # -------------------------------------------------------------
            if not company.description:
                desc_classifier_prompt = (
                    f"The user previously registered their business category as '{company.business_type}'.\n"
                    "Now analyze the user's latest message and extract the user's brief business operational description (what they sell, offer, or do).\n\n"
                    "Return ONLY a JSON object:\n"
                    "{\n"
                    '  "is_providing_description": true|false,\n'
                    '  "description": "Clean summary of what they sell and how they operate based solely on their message"\n'
                    "}"
                )
                try:
                    desc_res = llm_driver.chat_completion(
                        messages=[
                            LLMMessage(role="system", content=desc_classifier_prompt),
                            LLMMessage(role="user", content=prompt)
                        ],
                        model="gpt-4o-mini",
                        temperature=0.1,
                        max_tokens=250,
                        api_key_override=byok_key
                    )
                    desc_json = json.loads(desc_res.content.replace("```json", "").replace("```", "").strip())
                    if desc_json.get("is_providing_description") and desc_json.get("description"):
                        company.description = desc_json.get("description")
                        company.is_onboarded = True
                        just_completed_onboarding = True
                        db.commit()
                        logger.info(f"[{context.company_id}] Onboarding Step 2 completed: Desc={company.description}. Proceeding to answer previous questions!")
                except Exception as e:
                    logger.warning(f"Error in Step 2 description check: {e}")

                # If description NOT provided yet -> Ask for Description Naturally via LLM
                if not company.is_onboarded:
                    step2_remind_prompt = (
                        f"Anda adalah Senior AI Business Assistant untuk bisnis '{company_label}' ({company.business_type}) di aplikasi POS '{context.application_id}'.\n"
                        "Tanggapi pesan pengguna dengan ramah dan santun, lalu ingatkan secara natural bahwa Anda memerlukan sedikit gambaran mengenai operasional toko atau produk utama yang mereka tawarkan agar Anda bisa mulai membantu menganalisis data bisnis mereka."
                    )
                    step2_remind_res = llm_driver.chat_completion(
                        messages=[
                            LLMMessage(role="system", content=step2_remind_prompt),
                            LLMMessage(role="user", content=prompt)
                        ],
                        model=model_name,
                        temperature=0.7,
                        max_tokens=250,
                        api_key_override=byok_key
                    )
                    step2_message = step2_remind_res.content

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
                    ChatHistoryService.save_message(db, conv.conversation_id, "assistant", step2_message, tokens_used=step2_remind_res.total_tokens)

                    return {
                        "answer": step2_message,
                        "tool_calls": [],
                        "data_sources": [],
                        "provider": provider_name,
                        "model": model_name,
                        "input_tokens": step2_remind_res.input_tokens,
                        "output_tokens": step2_remind_res.output_tokens,
                        "total_tokens": step2_remind_res.total_tokens,
                        "is_onboarded": False,
                        "business_type": company.business_type
                    }

        # 4. Manage Conversation Session & Retrieve History Memory (For fully onboarded tenants)
        conv = ChatHistoryService.get_or_create_conversation(
            db=db,
            application_id=context.application_id,
            company_id=context.company_id,
            user_id=context.user_id,
            conversation_id=context.conversation_id,
            first_prompt=prompt
        )
        context.conversation_id = conv.conversation_id
        past_turns = ChatHistoryService.get_conversation_context(db, conv.conversation_id, limit=6)

        # 5. Dynamic LLM Tool Planning with Multi-Turn Context Memory
        available_tools = ToolRegistry.list_tools(context.application_id)
        tools_summary = []
        for t in available_tools:
            tools_summary.append({
                "name": t.name,
                "description": t.description,
                "input_schema": t.input_schema
            })

        planner_system_prompt = (
            f"You are an AI Internal Data Planner for company '{context.company_id}' ({company.business_type} - {company.description or ''}). "
            "Your primary task is to analyze the user's prompt AND past conversation history turns.\n\n"
            "STRICT PLANNING RULES:\n"
            "1. If the user was answering an onboarding question and previously asked about sales, revenue, products, inventory, recipes, or performance in earlier turns, "
            "select the appropriate tools to answer that previous inquiry now!\n"
            "2. If the user prompt is a general greeting or conversational question without specific internal data request, return {\"needed_tools\": []}.\n"
            "3. TOOL SELECTION RULES:\n"
            "   - IF user asked to view/see the catalog (e.g. 'minta lihat produk', 'daftar produk', 'tampilkan katalog'), select 'get_product_list'.\n"
            "   - IF user asked about product performance, menu evaluation, or specific product stats, select 'get_product_performance'.\n"
            "   - IF user asked for raw materials, ingredients stock, or HPP recipe costs, select 'get_recipe_ingredients'.\n"
            "   - IF user asked for inventory stock levels or low stock warnings, select 'get_inventory_status'.\n"
            "   - IF user asked for overall revenue, omset, or sales aggregate summary, select 'get_sales_summary'.\n\n"
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

            plan_res = llm_driver.chat_completion(
                messages=planner_messages,
                model="gpt-4o-mini",
                temperature=0.1,
                max_tokens=300,
                api_key_override=byok_key
            )
            raw_plan_content = plan_res.content.replace("```json", "").replace("```", "").strip()
            plan_json = json.loads(raw_plan_content)
            requested_tools = plan_json.get("needed_tools", [])
            logger.info(f"[{context.request_id}] Dynamic Planner Output: {requested_tools}")
        except Exception as e:
            logger.warning(f"[{context.request_id}] Planner fallback: {e}")
            requested_tools = []

        # 6. Execute Required Tools
        for tool_req in requested_tools:
            tool_name = tool_req.get("tool_name")
            tool_args = tool_req.get("arguments", {})

            t0 = time.time()
            exec_res = ToolExecutor.execute(context, tool_name, tool_args)
            duration_ms = round((time.time() - t0) * 1000, 2)

            data_arr = exec_res.get("data", [])
            internal_data_retrieved[tool_name] = data_arr
            data_sources_used.append(f"Tool:{tool_name}")
            tool_calls_executed.append({
                "tool": tool_name,
                "arguments": tool_args,
                "result_summary": f"{len(data_arr) if isinstance(data_arr, list) else 1} records fetched ({duration_ms}ms)"
            })

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
                    request_payload=json.dumps({"tool": tool_name, "arguments": tool_args}, default=str, ensure_ascii=False),
                    response_content=json.dumps(exec_res, default=str, ensure_ascii=False),
                    details_json=json.dumps({"arguments": tool_args, "tool": tool_name}, default=str)
                ))
                db.commit()
            except Exception as log_err:
                logger.warning(f"Could not save internal data access log: {log_err}")

        # 7. Manage Conversation Session & Persist User Message
        ChatHistoryService.save_message(db, conv.conversation_id, "user", prompt)

        # 8. Build Persona & Context Prompt
        biz_domain_text = f" (Bidang Usaha: {company.business_type})" if company.business_type else ""
        desc_text = f" Deskripsi Usaha: '{company.description}'." if company.description else ""

        if just_completed_onboarding:
            onboarding_instruction = (
                "1. RESPON SELESAI ONBOARDING (HANYA UNTUK PESAN INI):\n"
                "   - Awali respon Anda dengan ucapan terima kasih dan konfirmasi singkat yang natural mengenai profil bisnis yang telah dicatat.\n"
                "   - KEMUDIAN LANGSUNG JAWAB pertanyaan yang sempat diajukan oleh pengguna di awal percakapan secara lengkap dan profesional menggunakan data tools yang tersedia!\n"
            )
        else:
            onboarding_instruction = (
                "1. ATURAN RESPON NORMAL (PROFIL SUDAH TERDAFTAR):\n"
                "   - JANGAN PERNAH mengulang kalimat pendaftaran seperti 'Profil bisnis Anda telah sukses tercatat / tersimpan di sistem kami'.\n"
                "   - Langsung jawab pertanyaan atau tanggapi percakapan pengguna secara to the point, ramah, solutif, dan profesional sebagai AI Business Analyst.\n"
            )

        system_instruction = (
            f"Anda adalah Senior AI Business Assistant & Analyst untuk bisnis/perusahaan '{company_label}'{biz_domain_text} "
            f"(Aplikasi: '{context.application_id}').\n\n"
            f"PROFIL BISNIS TERDAFTAR: '{company_label}' bergerak di bidang '{company.business_type}'.{desc_text} "
            "Berikan analisis, rekomendasi, dan strategi bisnis yang sangat kontekstual dan relevan dengan industri tersebut.\n\n"
            "PANDUAN PERILAKU & ATURAN FORMATTING RESMI:\n"
            f"{onboarding_instruction}"
            "2. STANDAR FORMATTING WAJIB MENGGUNAKAN RICH MARKDOWN:\n"
            "   - Selalu susun jawaban Anda menggunakan format Markdown yang rapi, terstruktur, dan mudah dipindai (scannable) oleh pengguna di antarmuka UI web:\n"
            "     * Gunakan Heading terstruktur (`### Judul Bagian`, `#### Sub-bagian`) untuk memisahkan topik atau analisis.\n"
            "     * Gunakan Tabel Markdown (`| Kolom 1 | Kolom 2 | ... |`) setiap kali menyajikan rekap data numerik, daftar produk, status stok, perbandingan margin, atau rincian transaksi.\n"
            "     * Gunakan Bullet Points (`- ` atau `* `) dan Numbering (`1. `, `2. `) untuk rincian penjelasan dan rekomendasi taktis.\n"
            "     * Gunakan Teks Tebal (`**angka / istilah penting**`) untuk menonjolkan nominal uang, kuantitas stok, dan nama produk utama.\n"
            "     * Gunakan Garis Horizontal (`---`) sebagai pembatas antar bagian laporan/analisis.\n"
            "     * Gunakan Blockquote (`> ...`) untuk kesimpulan atau highlight rekomendasi kunci.\n"
            "3. ANTI-HALUSINASI DATA INTERNAL:\n"
            "   - Jangan mengarang angka finansial internal (omset, sisa stok, HPP) jika tidak ada dalam data tools.\n"
            "4. BAHASA: Gunakan Bahasa Indonesia yang profesional, ramah, solutif, dan ringkas padat."
        )

        data_section = ""
        if internal_data_retrieved:
            data_section = f"\n\nDATA INTERNAL TERSEDIA DARI SISTEM BISNIS:\n{json.dumps(internal_data_retrieved, default=str, indent=2, ensure_ascii=False)}"

        messages = [
            LLMMessage(role="system", content=f"{system_instruction}{data_section}")
        ]

        # Append past turns except the current prompt to prevent context duplication
        past_turns = ChatHistoryService.get_conversation_context(db, conv.conversation_id, limit=6)
        for pm in past_turns[:-1]:
            if pm.role in ["user", "assistant"]:
                messages.append(pm)

        messages.append(LLMMessage(role="user", content=prompt))

        # 9. Call LLM Driver
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
        ChatHistoryService.save_message(
            db,
            conv.conversation_id,
            "assistant",
            llm_res.content,
            tool_calls=tool_calls_executed if tool_calls_executed else None,
            tokens_used=llm_res.total_tokens
        )

        # Record External LLM Data Access Log
        try:
            db.add(AIDataAccessLog(
                request_id=context.request_id,
                application_id=context.application_id,
                company_id=context.company_id,
                user_id=context.user_id,
                access_type="EXTERNAL_LLM",
                source="ai-service.analyst_engine",
                destination=f"{provider_name.capitalize()} Cloud API ({model_name})",
                operation="chat_completion",
                status="SUCCESS",
                records_count=1,
                duration_ms=llm_duration_ms,
                request_payload=json.dumps({"model": model_name, "temperature": temperature, "prompt_preview": prompt[:200]}, ensure_ascii=False),
                response_content=llm_res.content[:500],
                details_json=json.dumps({"input_tokens": llm_res.input_tokens, "output_tokens": llm_res.output_tokens, "total_tokens": llm_res.total_tokens})
            ))
            db.commit()
        except Exception as log_err:
            logger.warning(f"Could not save external LLM data access log: {log_err}")

        return {
            "answer": llm_res.content,
            "tool_calls": tool_calls_executed,
            "data_sources": data_sources_used,
            "provider": provider_name,
            "model": llm_res.model,
            "input_tokens": llm_res.input_tokens,
            "output_tokens": llm_res.output_tokens,
            "total_tokens": llm_res.total_tokens,
            "is_onboarded": company.is_onboarded,
            "business_type": company.business_type
        }
