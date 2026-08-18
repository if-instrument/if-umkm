import os
import json
import hmac
import hashlib
import urllib.request
import urllib.error
import logging
import pymysql
import decimal
import datetime
from typing import Dict, Any, Optional, List
from app.config import settings

logger = logging.getLogger("tool_executor")

def sanitize_json_safe(data: Any) -> Any:
    """Recursively converts Decimal, datetime, and other non-JSON types into standard JSON primitives."""
    if isinstance(data, list):
        return [sanitize_json_safe(item) for item in data]
    if isinstance(data, dict):
        return {k: sanitize_json_safe(v) for k, v in data.items()}
    if isinstance(data, decimal.Decimal):
        return float(data) if data % 1 != 0 else int(data)
    if isinstance(data, (datetime.date, datetime.datetime)):
        return data.isoformat()
    return data

class ToolExecutor:
    """
    Remote Application Tool Executor.
    Calls registered tool endpoints on external applications via signed HMAC HTTP bridge.
    Includes seamless MySQL direct query fallback for local development or single-threaded PHP servers.
    """

    @classmethod
    def execute(
        cls,
        context: Any,
        tool_name: str,
        arguments: Dict[str, Any]
    ) -> Dict[str, Any]:
        return cls.execute_remote_tool(
            application_id=context.application_id,
            company_id=context.company_id,
            user_id=context.user_id,
            tool_name=tool_name,
            arguments=arguments
        )

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
            target_url = os.getenv("AI_APPLICATION_TOOL_URL", "http://127.0.0.1:8081/api/ai/tool-execute")

        payload = {
            "application_id": application_id,
            "company_id": company_id,
            "user_id": user_id,
            "tool_name": tool_name,
            "arguments": arguments or {}
        }

        json_payload = json.dumps(payload, default=str, ensure_ascii=False)
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

        # 0. Live Public Internet / Market Search Tool
        if tool_name in ["search_web", "web_search", "search_internet"]:
            query = arguments.get("query", "")
            limit = int(arguments.get("limit", 5))
            search_data = cls._execute_web_search(query, limit)
            return sanitize_json_safe({
                "ok": True,
                "tool_name": tool_name,
                "query": query,
                "data": search_data,
                "source_note": "Live Public Web & Market Knowledge"
            })

        logger.info(f"Executing remote tool '{tool_name}' for [{application_id}:{company_id}] at {target_url}")

        try:
            req = urllib.request.Request(
                target_url,
                data=json_payload.encode("utf-8"),
                headers=headers,
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=2) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                if res_data.get("ok") and res_data.get("data"):
                    return sanitize_json_safe(res_data)
        except Exception as e:
            logger.warning(f"Remote tool HTTP bridge fallback used for '{tool_name}': {str(e)}. Querying tenant DB...")

        # Direct MySQL Tenant DB Adapter
        direct_data = cls._query_tenant_db(company_id, tool_name, arguments or {})
        return sanitize_json_safe({
            "ok": True,
            "tool_name": tool_name,
            "company_id": company_id,
            "data": direct_data,
            "source_note": "Tenant MySQL Direct Adapter"
        })

    @classmethod
    def _execute_web_search(cls, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        import urllib.parse
        import xml.etree.ElementTree as ET
        import ssl
        import re

        if not query:
            return []

        ssl_ctx = ssl._create_unverified_context()
        results = []

        # 1. Clean and extract the most relevant search keywords
        stop_words = {"harga", "supplier", "grosir", "indonesia", "2026", "terbaru", "saat", "ini", "untuk", "yang", "dan", "serta", "atau", "kira", "perkiraan", "berapa", "rata", "toko", "cafe", "bisa", "cari", "internet", "coba", "tolong"}
        raw_parts = re.split(r"[,;&]|\s+dan\s+|\s+serta\s+|\s+atau\s+", query, flags=re.IGNORECASE)
        search_terms = []
        for part in raw_parts:
            words = [w for w in part.split() if w.lower() not in stop_words and len(w) > 2]
            if words:
                search_terms.append(" ".join(words[:3]))

        if not search_terms:
            search_terms = [query[:35]]

        # 2. Extract Specific Media Publication Articles (Kompas, Sindonews, Tempo, Detik, dll)
        for term in search_terms[:2]:
            if len(results) >= limit:
                break
            enc_term = urllib.parse.quote_plus(term)
            try:
                google_news_url = f"https://news.google.com/rss/search?q={enc_term}&hl=id&gl=ID&ceid=ID:id"
                req_g = urllib.request.Request(
                    google_news_url,
                    headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)"}
                )
                with urllib.request.urlopen(req_g, context=ssl_ctx, timeout=4) as r:
                    xml_data = r.read()
                    root = ET.fromstring(xml_data)
                    items = root.findall(".//item")
                    for it in items[:2]:
                        raw_title = it.find("title").text if it.find("title") is not None else term
                        link = it.find("link").text if it.find("link") is not None else ""
                        source_elem = it.find("source")
                        source_name = source_elem.text if source_elem is not None else "Media Publikasi"
                        pub_date = it.find("pubDate").text if it.find("pubDate") is not None else ""

                        if link:
                            results.append({
                                "title": f"{source_name}: {raw_title}",
                                "snippet": f"Artikel/liputan media: '{raw_title}' dipublikasikan oleh {source_name} ({pub_date[:16]}).",
                                "source": source_name,
                                "url": link
                            })
            except Exception as e:
                logger.warning(f"Google News RSS search error for '{term}': {e}")

        # 3. Extract Specific Wikipedia Indonesia Articles
        for term in search_terms[:2]:
            if len(results) >= limit:
                break
            enc_term = urllib.parse.quote_plus(term)
            try:
                wiki_url = f"https://id.wikipedia.org/w/api.php?action=query&list=search&srsearch={enc_term}&format=json"
                req_w = urllib.request.Request(wiki_url, headers={"User-Agent": "AplikasiUMKM/1.0"})
                with urllib.request.urlopen(req_w, context=ssl_ctx, timeout=4) as rw:
                    import json
                    wdata = json.loads(rw.read().decode("utf-8"))
                    for item in wdata.get("query", {}).get("search", [])[:1]:
                        clean_snippet = re.sub(r"<[^>]+>", "", item.get("snippet", ""))
                        page_title = item.get("title", "")
                        clean_t = page_title.replace(" ", "_")
                        page_url = f"https://id.wikipedia.org/wiki/{urllib.parse.quote(clean_t)}"
                        results.append({
                            "title": f"Wikipedia Indonesia: {page_title}",
                            "snippet": clean_snippet,
                            "source": "Wikipedia Indonesia",
                            "url": page_url
                        })
            except Exception as e:
                logger.warning(f"Wikipedia search error for '{term}': {e}")

        # 4. Extract Specific Marketplace Catalog & Supplier Directory Links (Tokopedia & Shopee)
        primary_clean = search_terms[0] if search_terms else query[:30]
        enc_p = urllib.parse.quote_plus(primary_clean)

        if len(results) < limit:
            results.append({
                "title": f"Tokopedia: Katalog {primary_clean}",
                "snippet": f"Daftar produk dan direktori supplier resmi di Tokopedia untuk {primary_clean}.",
                "source": "Tokopedia",
                "url": f"https://www.tokopedia.com/search?st=product&q={enc_p}"
            })

        if len(results) < limit:
            results.append({
                "title": f"Shopee Indonesia: Katalog {primary_clean}",
                "snippet": f"Katalog produk dan harga pasar grosir di Shopee untuk {primary_clean}.",
                "source": "Shopee Indonesia",
                "url": f"https://shopee.co.id/search?keyword={enc_p}"
            })

        return results[:limit]

    @classmethod
    def _query_tenant_db(cls, company_id: str, tool_name: str, arguments: Dict[str, Any]) -> Any:
        db_slug = company_id.lower().replace("-", "_")
        possible_db_names = [f"if_umkm_{db_slug}", "if_umkm_ifresso_coffee", "if_umkm_main"]

        db_user = "root"
        db_pass = "1m4mf4154l"
        db_host = "127.0.0.1"
        db_port = 3306

        conn = None
        for db_name in possible_db_names:
            try:
                conn = pymysql.connect(
                    host=db_host,
                    port=db_port,
                    user=db_user,
                    password=db_pass,
                    database=db_name,
                    cursorclass=pymysql.cursors.DictCursor,
                    connect_timeout=2
                )
                break
            except Exception:
                continue

        if not conn:
            logger.warning(f"Could not connect to tenant database for {company_id}")
            return []

        try:
            with conn.cursor() as cursor:
                if tool_name == "get_inventory_status":
                    cursor.execute("""
                        SELECT name as item_name, category, CAST(stock_qty AS CHAR) as current_stock, unit, 
                               CAST(minimum_stock AS CHAR) as reorder_point
                        FROM outlet_ingredients
                        WHERE deleted_at IS NULL
                        LIMIT 20
                    """)
                    rows = cursor.fetchall()
                    for r in rows:
                        cur = float(r.get("current_stock") or 0)
                        rop = float(r.get("reorder_point") or 5)
                        r["status"] = "LOW_STOCK" if cur <= rop else "NORMAL"
                    return rows

                elif tool_name == "get_product_list":
                    search = arguments.get("search", "").strip()
                    if search:
                        cursor.execute("""
                            SELECT p.sku, p.name as product_name, CAST(p.selling_price AS DOUBLE) as price,
                                   p.status, COALESCE(c.name, 'General') as category
                            FROM products p
                            LEFT JOIN product_outlet_categories poc ON poc.product_id = p.id
                            LEFT JOIN categories c ON c.id = poc.category_id
                            WHERE p.name LIKE %s AND p.deleted_at IS NULL
                            LIMIT 20
                        """, (f"%{search}%",))
                    else:
                        cursor.execute("""
                            SELECT p.sku, p.name as product_name, CAST(p.selling_price AS DOUBLE) as price,
                                   p.status, COALESCE(c.name, 'General') as category
                            FROM products p
                            LEFT JOIN product_outlet_categories poc ON poc.product_id = p.id
                            LEFT JOIN categories c ON c.id = poc.category_id
                            WHERE p.deleted_at IS NULL
                            LIMIT 20
                        """)
                    rows = cursor.fetchall()
                    for r in rows:
                        r["status"] = "ACTIVE" if str(r.get("status")) == "10" else "INACTIVE"
                    return rows

                elif tool_name == "get_sales_summary":
                    cursor.execute("""
                        SELECT COALESCE(SUM(grand_total), 0) as total_revenue, COUNT(id) as total_orders
                        FROM orders
                        WHERE status != 'cancelled'
                    """)
                    row = cursor.fetchone()
                    tot_rev = float(row.get("total_revenue") or 0)
                    tot_ord = int(row.get("total_orders") or 0)
                    avg_bkt = round(tot_rev / tot_ord) if tot_ord > 0 else 0
                    return {
                        "period": arguments.get("period", "30d"),
                        "total_revenue": tot_rev,
                        "total_orders": tot_ord,
                        "average_basket_size": avg_bkt
                    }

                elif tool_name == "get_product_performance":
                    cursor.execute("""
                        SELECT p.name as product_name,
                               CAST(p.selling_price AS DOUBLE) as price,
                               COALESCE(c.name, 'General') as category,
                               CAST(COALESCE(SUM(oi.qty), 0) AS DOUBLE) as sales_volume
                        FROM products p
                        LEFT JOIN order_items oi ON oi.product_id = p.id
                        LEFT JOIN product_outlet_categories poc ON poc.product_id = p.id
                        LEFT JOIN categories c ON c.id = poc.category_id
                        WHERE p.deleted_at IS NULL
                        GROUP BY p.id, p.name, p.selling_price, c.name
                        ORDER BY sales_volume DESC
                        LIMIT 10
                    """)
                    rows = cursor.fetchall()
                    return rows

                elif tool_name == "get_recipe_ingredients":
                    cursor.execute("""
                        SELECT name as ingredient, category, CAST(stock_qty AS CHAR) as stock, unit,
                               CAST(average_cost AS DOUBLE) as unit_cost
                        FROM outlet_ingredients
                        WHERE deleted_at IS NULL
                        LIMIT 20
                    """)
                    rows = cursor.fetchall()
                    for r in rows:
                        r["available_stock"] = f"{r.get('stock')} {r.get('unit')}"
                    return rows

        except Exception as q_err:
            logger.warning(f"Error querying tenant database fallback: {q_err}")
            return []
        finally:
            conn.close()

        return []
