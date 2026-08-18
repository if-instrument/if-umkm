import os
import json
import urllib.request
import urllib.error
from typing import List, Dict, Any, Optional
from app.providers.base_provider import LLMProviderInterface, LLMMessage, LLMResponse

class OpenAIProvider(LLMProviderInterface):
    """
    Direct HTTP API Integration for OpenAI (gpt-4o, gpt-4o-mini, o3-mini).
    Supports Company BYOK API Key or Global Platform OPENAI_API_KEY.
    """

    def get_provider_name(self) -> str:
        return "openai"

    def list_live_models(self, api_key_override: Optional[str] = None) -> List[Dict[str, Any]]:
        api_key = api_key_override or os.getenv("OPENAI_API_KEY", "")
        is_testing = bool(os.getenv("PYTEST_CURRENT_TEST"))
        if not api_key and not is_testing:
            return []

        url = "https://api.openai.com/v1/models"
        headers = {
            "Authorization": f"Bearer {api_key}"
        }
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode("utf-8"))
                raw_models = data.get("data", [])
                result = []
                valid_prefixes = ("gpt-4o", "gpt-4-", "o1-", "o3-", "gpt-3.5-")
                for m in raw_models:
                    m_id = m.get("id", "")
                    if any(m_id.startswith(p) for p in valid_prefixes) and not m_id.endswith("-realtime") and not m_id.endswith("-audio"):
                        display = f"OpenAI {m_id}"
                        cost_in = 0.15 if "mini" in m_id else 2.50
                        cost_out = 0.60 if "mini" in m_id else 10.00
                        result.append({
                            "model": m_id,
                            "display_name": display,
                            "input_cost_per_1m": cost_in,
                            "output_cost_per_1m": cost_out
                        })
                result.sort(key=lambda x: (0 if "mini" in x["model"] else (1 if "4o" in x["model"] else 2), x["model"]))
                if result:
                    return result
        except Exception:
            pass

        return [
            {"model": "gpt-4o-mini", "display_name": "OpenAI GPT-4o Mini", "input_cost_per_1m": 0.15, "output_cost_per_1m": 0.60},
            {"model": "gpt-4o", "display_name": "OpenAI GPT-4o Flagship", "input_cost_per_1m": 2.50, "output_cost_per_1m": 10.00},
            {"model": "o3-mini", "display_name": "OpenAI o3-Mini Reasoning", "input_cost_per_1m": 1.10, "output_cost_per_1m": 4.40},
        ]

    def estimate_tokens(self, text: str) -> int:
        # Rule of thumb for OpenAI token estimation (~4 chars/token + safety multiplier)
        if not text:
            return 0
        return int(len(text) / 3.8) + 10

    def chat_completion(
        self,
        messages: List[LLMMessage],
        model: str = "gpt-4o-mini",
        temperature: float = 0.7,
        max_tokens: int = 1500,
        tools: Optional[List[Dict[str, Any]]] = None,
        api_key_override: Optional[str] = None
    ) -> LLMResponse:
        api_key = api_key_override or os.getenv("OPENAI_API_KEY", "")
        is_testing = bool(os.getenv("PYTEST_CURRENT_TEST")) or api_key == "mock"
        
        if not api_key and not is_testing:
            raise RuntimeError("API Key OpenAI (OPENAI_API_KEY) belum dikonfigurasi di ai-service/.env. Silakan isi OPENAI_API_KEY untuk memproses live request.")

        if is_testing and not api_key:
            return self._mock_completion(messages, model, tools)

        model_map = {
            "gpt-4o-mini": "gpt-4o-mini",
            "gpt-4o": "gpt-4o",
            "gpt-4": "gpt-4o",
            "mini": "gpt-4o-mini"
        }
        target_model = model_map.get(model, model if model else "gpt-4o-mini")

        url = "https://api.openai.com/v1/chat/completions"
        payload = {
            "model": target_model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        if tools:
            payload["tools"] = tools

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }

        try:
            req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=60) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                
                choice = res_data["choices"][0]["message"]
                usage = res_data.get("usage", {})
                
                input_tokens = usage.get("prompt_tokens", 0)
                output_tokens = usage.get("completion_tokens", 0)
                total_tokens = usage.get("total_tokens", input_tokens + output_tokens)

                tool_calls = choice.get("tool_calls", [])

                return LLMResponse(
                    content=choice.get("content") or "",
                    provider="openai",
                    model=model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    total_tokens=total_tokens,
                    tool_calls=tool_calls,
                    raw_response=res_data
                )
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8")
            raise RuntimeError(f"OpenAI Live API Error (HTTP {e.code}): {err_body}")
        except Exception as e:
            raise RuntimeError(f"OpenAI Live API Execution Failed: {str(e)}")

    def _mock_completion(self, messages: List[LLMMessage], model: str, tools: Optional[List[Dict[str, Any]]] = None) -> LLMResponse:
        user_prompt = messages[-1].content if messages else ""
        system_content = messages[0].content if len(messages) > 1 and messages[0].role == "system" else ""
        est_input = self.estimate_tokens(user_prompt + system_content)

        content = generate_smart_mock_response(user_prompt, system_content, "openai", model)
        est_output = self.estimate_tokens(content)

        return LLMResponse(
            content=content,
            provider="openai",
            model=model,
            input_tokens=est_input,
            output_tokens=est_output,
            total_tokens=est_input + est_output,
            tool_calls=[]
        )


def generate_smart_mock_response(user_prompt: str, system_context: str, provider_name: str, model_name: str) -> str:
    prompt_lower = user_prompt.lower()

    # Attempt to extract internal data JSON from system_context
    internal_data = {}
    if "INTERNAL BUSINESS DATA:" in system_context:
        try:
            json_part = system_context.split("INTERNAL BUSINESS DATA:")[1].strip()
            internal_data = json.loads(json_part)
        except Exception:
            internal_data = {}

    lines = []

    # If get_product_list is present in internal data
    if "get_product_list" in internal_data:
        products = internal_data["get_product_list"]
        lines.append("### 📊 Data Internal Perusahaan (Daftar Produk)")
        if isinstance(products, list) and len(products) > 0:
            lines.append("| SKU | Nama Produk | Kategori | Harga | Status |")
            lines.append("| :--- | :--- | :--- | :--- | :--- |")
            for p in products:
                sku = p.get("sku", "-")
                name = p.get("product_name", "-")
                cat = p.get("category", "-")
                price = f"Rp {p.get('price', 0):,}"
                st = p.get("status", "ACTIVE")
                lines.append(f"| {sku} | {name} | {cat} | {price} | {st} |")
        else:
            lines.append("*(Belum ada data produk yang tercatat di dalam database internal)*")
        lines.append("\n### 💡 Rekomendasi AI Analyst")
        lines.append("Pastikan katalog produk selalu diperbarui agar transaksi dan laporan keuangan tercatat secara akurat.")
        return "\n".join(lines)

    # If get_inventory_status is present in internal data
    elif "get_inventory_status" in internal_data:
        items = internal_data["get_inventory_status"]
        lines.append("### 📦 Data Internal Perusahaan (Status Inventaris)")
        if isinstance(items, list) and len(items) > 0:
            lines.append("| Nama Bahan | Stok Saat Ini | Unit | Minimum Stock | Status |")
            lines.append("| :--- | :---: | :---: | :---: | :---: |")
            for item in items:
                name = item.get("item_name", "-")
                qty = f"{item.get('current_stock', 0):,}"
                unit = item.get("unit", "")
                min_s = f"{item.get('reorder_point', 0):,}"
                st = item.get("status", "NORMAL")
                lines.append(f"| {name} | {qty} | {unit} | {min_s} | {st} |")
        else:
            lines.append("*(Belum ada data bahan baku/inventaris yang tercatat di dalam database internal)*")
        lines.append("\n### 💡 Rekomendasi AI Analyst")
        lines.append("Lakukan pemantauan berkala pada bahan baku dengan status LOW_STOCK untuk mencegah keterlambatan operasional.")
        return "\n".join(lines)

    # If get_recipe_ingredients is present in internal data
    elif "get_recipe_ingredients" in internal_data:
        recipe = internal_data["get_recipe_ingredients"]
        lines.append("### 🍹 Data Internal Perusahaan (Resep & HPP)")
        if isinstance(recipe, list) and len(recipe) > 0:
            lines.append("| Bahan Baku | Stok Tersedia | Unit Cost |")
            lines.append("| :--- | :--- | :--- |")
            for r in recipe:
                ing = r.get("ingredient", "-")
                stk = r.get("available_stock", "-")
                cost = f"Rp {r.get('unit_cost', 0):,}"
                lines.append(f"| {ing} | {stk} | {cost} |")
        else:
            lines.append("*(Belum ada data resep/komposisi bahan baku yang tercatat di dalam database)*")
        lines.append("\n### 💡 Rekomendasi AI Analyst")
        lines.append("Evaluasi takaran porsi secara konsisten untuk menjaga kestabilan margin kotor.")
        return "\n".join(lines)

    # If get_sales_summary is present in internal data
    elif "get_sales_summary" in internal_data:
        sales = internal_data["get_sales_summary"]
        lines.append("### 📈 Data Internal Perusahaan (Summary Penjualan)")
        if isinstance(sales, dict) and sales:
            lines.append(f"- **Periode**: {sales.get('period', '-')}")
            lines.append(f"- **Total Revenue**: Rp {sales.get('total_revenue', 0):,}")
            lines.append(f"- **Total Pesanan**: {sales.get('total_orders', 0):,} transaksi")
            lines.append(f"- **Average Basket Size**: Rp {sales.get('average_basket_size', 0):,}")
            lines.append(f"- **Growth Rate**: {sales.get('growth_rate', '-')}")
        else:
            lines.append("*(Belum ada data ringkasan transaksi yang tercatat)*")
        return "\n".join(lines)

    # General feature query or default help prompt
    if any(w in prompt_lower for w in ["bisa apa", "fitur", "kemampuan", "apa saja", "siapa kamu", "fungsi"]):
        return (
            "### 🤖 Kemampuan & Fitur **AI Business Analyst Platform**\n\n"
            "Saya adalah **AI Business Analyst & Decision Engine** yang terintegrasi langsung dengan database internal toko Anda.\n\n"
            "#### 🚀 Kemampuan Utama:\n"
            "1. **📊 Analisis Performa Produk & Evaluasi Menu**\n"
            "2. **🍹 Formulasi Resep & Perhitungan HPP Otomatis**\n"
            "3. **📈 Audit Penjualan & Proyeksi Tren Omset**\n"
            "4. **📦 Audit Stok & Early Warning Reorder Point**\n\n"
            "Silakan ajukan pertanyaan atau pilih menu preset untuk memulai analisis!"
        )

    return (
        f"Halo! Saya AI Business Analyst untuk toko Anda.\n\n"
        f"Pertanyaan Anda: *\"{user_prompt}\"*\n\n"
        f"Berdasarkan data internal toko yang tersedia, silakan tentukan spesifikasi analisis yang Anda butuhkan (misalnya: katalog produk, stok bahan baku, atau ringkasan penjualan)."
    )
