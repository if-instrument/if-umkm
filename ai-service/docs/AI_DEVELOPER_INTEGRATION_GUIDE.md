# 🧠 Panduan Integrasi AI Service & Frontend Chat Engine
### IF Instrument UMKM AI Platform — Developer & Integration Guide

Dokumentasi ini menjelaskan secara komprehensif arsitektur integrasi antara **Aplikasi Frontend / Backend (CodeIgniter 4 / PHP)** dengan **AI Microservice (Python FastAPI)**, tata cara **menambahkan Tool Execution (Function Calling)** baru, serta **standar rendering chat, tabel, dan metrik biaya** pada antarmuka pengguna.

---

## 📑 Daftar Isi
1. [Arsitektur & Alur Kerja Sistem](#1-arsitektur--alur-kerja-sistem)
2. [Panduan Menambahkan Tool Baru (Function Calling)](#2-panduan-menambahkan-tool-baru-function-calling)
   - [Langkah 1: Daftarkan Schema di `registry.py`](#langkah-1-daftarkan-schema-di-registrypy)
   - [Langkah 2: Implementasikan Eksekusi di `executor.py`](#langkah-2-implementasikan-eksekusi-di-executorpy)
   - [Langkah 3: Penanganan Serialisasi Data (`Decimal`, `DateTime`)](#langkah-3-penanganan-serialisasi-data)
3. [Format Endpoint & Schema Payload AI Service](#3-format-endpoint--schema-payload-ai-service)
   - [Analisis Bisnis AI (`POST /api/v1/ai/analyze`)](#a-post-apiv1aianalyze)
   - [Riwayat Obrolan (`GET /api/v1/ai/conversations/{id}/messages`)](#b-get-apiv1aiconversationsidmessages)
   - [Kuota Token Tenant (`POST /api/v1/ai/quota`)](#c-post-apiv1aiquota)
4. [Standar Format Rendering Tampilan Chat Frontend](#4-standar-format-rendering-tampilan-chat-frontend)
   - [Struktur DOM Bubble Chat](#a-struktur-dom-bubble-chat)
   - [Parser Markdown, List & Tabel GFM](#b-parser-markdown-list--tabel-gfm)
   - [Format Metadata Bar & Konversi Rupiah Realtime](#c-format-metadata-bar--konversi-rupiah-realtime)
5. [Contoh Implementasi Lengkap (Frontend JavaScript)](#5-contoh-implementasi-lengkap-frontend-javascript)

---

## 1. Arsitektur & Alur Kerja Sistem

```
┌────────────────────────────────┐
│   Frontend Client (Browser)    │
│  - ai-analyst.html / .js       │
└──────────────┬─────────────────┘
               │ 1. Kirim prompt + companySlug
               ▼
┌────────────────────────────────┐
│  CodeIgniter 4 Backend Proxy   │
│  - AiBusinessController.php    │
│  - AIService.php (HTTP Bridge) │
└──────────────┬─────────────────┘
               │ 2. Forward payload + X-API-Key
               ▼
┌────────────────────────────────┐
│ Python FastAPI AI Microservice │
│  - v1_ai.py / analyst_service  │
│  - ProviderFactory (LLM)       │
└──────┬──────────────────┬──────┘
       │                  │
3. Tool Execution    4. LLM Completion (Gemini / OpenAI / Claude)
       ▼                  ▼
┌──────────────┐   ┌──────────────────────┐
│  Tenant DB   │   │ Return Analisis      │
│  (MySQL POS) │   │ Markdown + Metadata  │
└──────────────┘   └──────────────────────┘
```

---

## 2. Panduan Menambahkan Tool Baru (Function Calling)

AI Analyst bekerja menggunakan mekanisme **Two-Stage Tool Execution**:
1. **Stage 1 (Intent & Tool Selection)**: LLM membaca prompt pengguna dan memilih tool database yang relevan.
2. **Execution**: Microservice mengeksekusi tool untuk menarik data riil dari database tenant UMKM.
3. **Stage 2 (Synthesis & Decision Formulation)**: LLM merumuskan saran bisnis berbasis data hasil query tool.

---

### Langkah 1: Daftarkan Schema di `registry.py`
Buka file [`ai-service/app/tools/registry.py`](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/ai-service/app/tools/registry.py) dan tambahkan definisi tool baru:

```python
# Contoh: Menambahkan tool get_expense_summary
ToolRegistry.register_tool(
    ToolDefinition(
        name="get_expense_summary",
        version="1.0",
        description="Mengembalikan rekap beban operasional & pengeluaran toko per kategori dalam rentang waktu tertentu.",
        input_schema={
            "type": "object",
            "properties": {
                "period": {
                    "type": "string",
                    "default": "30d",
                    "description": "Periode waktu analisis: '7d', '30d', '90d', atau '1y'"
                },
                "category": {
                    "type": "string",
                    "default": "",
                    "description": "Filter kategori beban (opsional), misal: 'Gaji', 'Listrik', 'Bahan Baku'"
                }
            }
        },
        permission="analytics.expenses.read",
        application_scope="all"
    )
)
```

---

### Langkah 2: Implementasikan Eksekusi di `executor.py`
Buka file [`ai-service/app/tools/executor.py`](file:///Users/imamfaisal/Documents/Aplikasi%20UMKM/ai-service/app/tools/executor.py). Pada method `_direct_db_tool_query`, tambahkan penanganan untuk nama tool baru:

```python
elif tool_name == "get_expense_summary":
    period = arguments.get("period", "30d")
    days = 30
    if period == "7d": days = 7
    elif period == "90d": days = 90
    elif period == "1y": days = 365
    
    start_date = (datetime.datetime.now() - datetime.timedelta(days=days)).strftime("%Y-%m-%d")
    
    # Query ke tabel database tenant
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT category, SUM(amount) AS total_amount, COUNT(id) AS transaction_count
            FROM operating_expenses
            WHERE expense_date >= %s AND status = 'active'
            GROUP BY category
            ORDER BY total_amount DESC
        """, (start_date,))
        rows = cursor.fetchall()
        
        return {
            "period": period,
            "since_date": start_date,
            "total_categories": len(rows),
            "breakdown": rows
        }
```

---

### Langkah 3: Penanganan Serialisasi Data
> [!IMPORTANT]
> Driver MySQL (`PyMySQL`) sering kali mengembalikan tipe data `Decimal` untuk kolom numerik (`DECIMAL/NUMERIC/FLOAT`) dan objek `datetime.date`.
> 
> Selalu pastikan hasil dibungkus dengan `sanitize_json_safe(data)` sebelum dikirimkan ke prompt LLM agar tidak terjadi error:  
> `TypeError: Object of type Decimal is not JSON serializable`.

Fungsi `sanitize_json_safe()` di `executor.py` akan otomatis mengubah:
- `Decimal("15000.00")` $\rightarrow$ `15000.0` (float/int)
- `datetime.date(2026, 8, 18)` $\rightarrow$ `"2026-08-18"` (ISO string)

---

## 3. Format Endpoint & Schema Payload AI Service

### a. `POST /api/v1/ai/analyze`
Endpoint utama untuk menjalankan inferensi analitik bisnis.

#### **Request Body (JSON):**
```json
{
  "prompt": "Bagaimana evaluasi stok bahan baku kita minggu ini?",
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "conversation_id": "conv_28df8151d1844f87",
  "context": {
    "application_id": "umkm-pos",
    "company_id": "IFresso-Coffee",
    "user_id": "usr-admin-1",
    "business_type": "fnb_cafe"
  }
}
```

#### **Response Body (JSON):**
```json
{
  "ok": true,
  "data": {
    "answer": "Berikut adalah rangkuman evaluasi stok bahan baku di IFresso-Coffee:\n\n### 📦 Status Stok Kritis\n| Bahan Baku | Sisa Stok | Status |\n| :--- | :--- | :--- |\n| Botol Plastik 250ml | 48 pcs | ⚠️ Kritis |\n| Gula Cair | 100 ml | ⚠️ Menipis |\n\n...",
    "tool_calls_executed": [
      {
        "tool": "get_inventory_status",
        "arguments": {"low_stock_only": true}
      }
    ],
    "recommendations": [
      {
        "product": "Iced Americano Bottled",
        "trend": "+18%",
        "sales_volume": 420,
        "category_avg": 250,
        "margin": "65%",
        "recommendation": "Lakukan pemesanan ulang botol plastik 250ml segera.",
        "reasoning": "Sisa stok kemasan hanya cukup untuk 2 hari operasional."
      }
    ],
    "provider": "gemini",
    "model": "gemini-2.5-flash"
  },
  "meta": {
    "request_id": "req_anl_bac368d717624711",
    "conversation_id": "conv_28df8151d1844f87",
    "capability": "business.analyst",
    "usage": {
      "input_tokens": 587,
      "output_tokens": 614,
      "total_tokens": 1201,
      "estimated_cost": 0.000456
    }
  }
}
```

---

### b. `GET /api/v1/ai/conversations/{id}/messages`
Mengambil riwayat obrolan masa lalu lengkap dengan audit metrik penggunaan token.

#### **Response Body (JSON):**
```json
{
  "ok": true,
  "data": [
    {
      "id": 261,
      "conversation_id": "conv_28df8151d1844f87",
      "role": "user",
      "content": "Bagaimana performa penjualan hari ini?",
      "tokens_used": 0,
      "created_at": "2026-08-18T07:56:08"
    },
    {
      "id": 262,
      "conversation_id": "conv_28df8151d1844f87",
      "role": "assistant",
      "content": "Penjualan hari ini mencapai Rp 1.450.000 dari 48 transaksi...",
      "provider": "gemini",
      "model": "gemini-2.5-flash",
      "request_id": "req_anl_bac368d717624711",
      "usage": {
        "input_tokens": 587,
        "output_tokens": 614,
        "total_tokens": 1201,
        "estimated_cost": 0.000456
      },
      "created_at": "2026-08-18T07:56:11"
    }
  ]
}
```

---

### c. `POST /api/v1/ai/quota`
Mengecek sisa kuota token bulanan tenant.

#### **Response Body (JSON):**
```json
{
  "ok": true,
  "data": {
    "application_id": "umkm-pos",
    "company_id": "IFresso-Coffee",
    "plan_code": "enterprise",
    "quota_limit": 10000000,
    "monthly_token_quota": 10000000,
    "tokens_consumed": 45114,
    "tokens_remaining": 9954886,
    "is_exhausted": false
  }
}
```

---

## 4. Standar Format Rendering Tampilan Chat Frontend

Untuk menghasilkan tampilan chat yang bersih, rapi, dan mudah dibaca oleh pemilik usaha, gunakan aturan format rendering berikut:

### a. Struktur DOM Bubble Chat
Setiap giliran pesan asisten harus membungkus komponen:
1. **Avatar AI**: Berisi ikon atau logo AI.
2. **Isi Jawaban Analisis**: HTML hasil parsing Markdown (termasuk tabel dan list).
3. **Tool Badges** *(opsional)*: Menampilkan tool query database yang dieksekusi.
4. **Recommendation Cards** *(opsional)*: Kartu rekomendasi produk terstruktur.
5. **Meta Bar**: Menampilkan Tokens in/out, Est. Biaya Rupiah, Model, dan Request ID.

---

### b. Parser Markdown, List & Tabel GFM

LLM mengembalikan teks berformat **GitHub Flavored Markdown (GFM)**. Parser JavaScript harus menangani elemen berikut:

| Sintaks Markdown | Output HTML | Keterangan |
|---|---|---|
| `### Judul` | `<h3>Judul</h3>` | Heading section analisis |
| `**Teks Tebal**` | `<strong>Teks Tebal</strong>` | Penekanan angka atau poin penting |
| `` `kode / angka` `` | `<code>kode</code>` | Format SKU / parameter teknis |
| `- Poin bullet` | `<ul><li>Poin bullet</li></ul>` | Daftar tidak berurutan |
| `1. Poin angka` | `<ol><li>Poin angka</li></ol>` | Daftar berurutan / tahapan |
| `\| Kolom 1 \| Kolom 2 \|` | `<table class="ai-table">...</table>` | Tabel matriks komparasi data |
| `---` | `<hr class="ai-divider"/>` | Pemisah visual section |

> [!TIP]
> **Perlindungan Token `<br/>`:**  
> Jika di dalam sel tabel terdapat tag `<br/>` atau `<br>`, gantikan sementara dengan placeholder token (misal `[[BR_TOKEN]]`) sebelum pemotongan baris `split('\n')`, kemudian kembalikan lagi ke `<br/>` di inline formatter agar format multi-line di dalam tabel tidak rusak.

---

### c. Format Metadata Bar & Konversi Rupiah Realtime

Biaya LLM dihitung dalam USD per 1M token. Di antarmuka, biaya harus dikonversi ke **Rupiah Indonesia (IDR)** dengan kurs terkini:

$$\text{Biaya (Rp)} = \text{estimated\_cost (USD)} \times \text{Kurs USD/IDR}$$

```javascript
// Contoh format output Meta Bar
⚡ 1.201 Tokens (587 in / 614 out) · Est. Biaya: Rp 8,13 ($0.000456) · Model: gemini / gemini-2.5-flash · RequestID: req_anl_bac368d717624711
```

---

## 5. Contoh Implementasi Lengkap (Frontend JavaScript)

Berikut adalah referensi kode JavaScript murni untuk merender pesan AI secara optimal:

```javascript
// 1. Kurs Realtime Fetcher dengan Cache 1 Jam
let usdToIdrRate = 16300;
async function fetchUsdToIdrRate() {
  try {
    const cached = localStorage.getItem("if_ai_usd_idr_rate");
    if (cached) {
      const p = JSON.parse(cached);
      if (p.rate && Date.now() - p.time < 3600000) {
        usdToIdrRate = p.rate;
        return usdToIdrRate;
      }
    }
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const data = await res.json();
    if (data?.rates?.IDR) {
      usdToIdrRate = Number(data.rates.IDR);
      localStorage.setItem("if_ai_usd_idr_rate", JSON.stringify({ rate: usdToIdrRate, time: Date.now() }));
    }
  } catch (e) {
    console.warn("Using fallback rate:", usdToIdrRate);
  }
  return usdToIdrRate;
}

// 2. Format Biaya Rupiah
function formatCostToIdr(costUsd) {
  const cost = Number(costUsd) || 0;
  if (cost <= 0) return "Rp 0,00 ($0.000000)";
  const costIdr = cost * usdToIdrRate;
  const idrStr = costIdr < 100 ? `Rp ${costIdr.toFixed(2).replace(".", ",")}` : `Rp ${Math.round(costIdr).toLocaleString("id-ID")}`;
  return `<strong style="color:#059669;" title="Kurs $1 = Rp ${Math.round(usdToIdrRate).toLocaleString('id-ID')}">${idrStr}</strong> <span style="font-size:0.75rem; opacity:0.85;">($${cost.toFixed(6)})</span>`;
}

// 3. Render Bubble Pesan Asisten AI
function renderAiResponse(data, meta) {
  const usage = meta?.usage || {};
  const costHtml = formatCostToIdr(usage.estimated_cost || 0);

  const metaBarHtml = `
    <div class="msg-meta-bar">
      <span>⚡ ${usage.total_tokens || 0} Tokens (${usage.input_tokens || 0} in / ${usage.output_tokens || 0} out)</span>
      <span>· Est. Biaya: ${costHtml}</span>
      <span>· Model: ${data.provider || 'gemini'} / ${data.model || 'gemini-flash'}</span>
      <span>· RequestID: ${meta?.request_id || '-'}</span>
    </div>
  `;

  const bubbleHtml = `
    <div class="msg-row ai-msg">
      <div class="msg-avatar">AI</div>
      <div class="msg-bubble">
        <div class="ai-content">${formatMarkdown(data.answer)}</div>
        ${metaBarHtml}
      </div>
    </div>
  `;

  document.getElementById("chat-messages").insertAdjacentHTML("beforeend", bubbleHtml);
}
```

---

*Dokumentasi ini dikelola secara berkala untuk platform **IF Instrument UMKM Multi-Tenant SaaS**.*
