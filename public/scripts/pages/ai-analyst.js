import { renderLayout, applyBrandTheme } from "../layout.js";
import { apiGet, apiPost, apiDelete, loadSession, loadState, currentCompanySlug } from "../store.js";
import { loadPageBootstrap } from "../page-engine.js";

// Initial Layout Render
renderLayout();

export function initAiAnalystPage() {
  const session = loadSession();
  const state = loadState();
  const slugFromPath = currentCompanySlug();
  const companySlug = slugFromPath || session?.companySlug || window.__COMPANY_SLUG__ || "IFresso-Coffee";
  const userId = session?.userId || "usr_mgr_1";

  // DOM Element References (declared once here to be accessible throughout all inner functions)
  const newChatBtn         = document.getElementById("new-chat-btn");
  const historyListContainer = document.getElementById("history-list");
  const messagesContainer  = document.getElementById("chat-messages");
  const providerSelect     = document.getElementById("ai-provider-select");
  const promptInput        = document.getElementById("ai-prompt-input");
  const sendBtn            = document.getElementById("ai-send-btn");
  const quotaDisplay       = document.getElementById("ai-quota-display");

  // Mutable conversation state
  let currentConversationId = null;

  // Realtime USD -> IDR Exchange Rate Converter
  let usdToIdrRate = 16300; // fallback standard rate
  let isRateFetched = false;

  async function fetchUsdToIdrRate() {
    // Check localStorage cache (valid for 1 hour)
    try {
      const cached = localStorage.getItem("if_ai_usd_idr_rate");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.rate && Date.now() - (parsed.time || 0) < 3600000) {
          usdToIdrRate = Number(parsed.rate) || 16300;
          isRateFetched = true;
          return usdToIdrRate;
        }
      }
    } catch {}

    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD");
      if (res.ok) {
        const data = await res.json();
        if (data?.rates?.IDR) {
          usdToIdrRate = Number(data.rates.IDR);
          isRateFetched = true;
          try {
            localStorage.setItem("if_ai_usd_idr_rate", JSON.stringify({ rate: usdToIdrRate, time: Date.now() }));
          } catch {}
        }
      }
    } catch (err) {
      console.warn("Could not fetch realtime USD-IDR exchange rate, using fallback:", err);
    }
    return usdToIdrRate;
  }

  function formatCostToIdr(costUsd) {
    const cost = Number(costUsd) || 0;
    if (cost <= 0) return "Rp 0,00 ($0.000000)";
    const costIdr = cost * usdToIdrRate;
    let idrString = "";
    if (costIdr < 1) {
      idrString = `Rp ${costIdr.toFixed(2).replace(".", ",")}`;
    } else if (costIdr < 100) {
      idrString = `Rp ${costIdr.toFixed(2).replace(".", ",")}`;
    } else {
      idrString = `Rp ${Math.round(costIdr).toLocaleString("id-ID")}`;
    }
    return `<strong style="color: #059669;" title="Kurs Realtime: $1 = Rp ${Math.round(usdToIdrRate).toLocaleString('id-ID')}">${idrString}</strong> <span style="font-size:0.75rem; opacity:0.85;">($${cost.toFixed(6)})</span>`;
  }

  // 1. Fetch Company Settings & Branding Data via Bootstrap
  try {
    const bootstrapRes = loadPageBootstrap("aiAnalyst", state, session);
    if (bootstrapRes && bootstrapRes.ok && bootstrapRes.data) {
      const data = bootstrapRes.data;
      state.companies = data.companies || state.companies || [];
      state.settings = { ...state.settings, ...(data.settings || {}) };
      state.outlets = data.outlets || state.outlets || [];
      state.activeCompanyId = data.activeCompanyId || state.activeCompanyId;
    }
  } catch (bErr) {
    console.warn("Could not load AI analyst bootstrap:", bErr);
  }

  // 2. Identify active company & apply theme
  const matchedCompany = (state.companies || []).find((c) => (c.routeSlug || "").toLowerCase() === companySlug.toLowerCase() || (c.slug || "").toLowerCase() === companySlug.toLowerCase()) || (state.companies || [])[0] || session?.accessContext?.company || {};

  const companyTheme = matchedCompany.themeColor || matchedCompany.theme_color || state.settings.themeColor || session?.themeColor || session?.theme_color || "#3B1F8C";
  applyBrandTheme(companyTheme);

  // 3. Format and apply Company Brand Title & Logo in AI Analyst Header
  const companyName = matchedCompany.name || matchedCompany.brand_name || state.settings.companyName || session?.accessContext?.company?.name || formatSlug(companySlug);
  const companyLogo = matchedCompany.logoUrl || matchedCompany.logo_url || matchedCompany.logo_path || state.settings.companyLogoUrl || session?.accessContext?.company?.logoUrl || "";

  const heroTenantBadge = document.getElementById("ai-hero-tenant-badge");
  const heroAvatar = document.getElementById("ai-hero-company-avatar");
  const heroTitle = document.getElementById("ai-hero-title-text");
  const heroDesc = document.getElementById("ai-hero-desc-text");

  if (heroTenantBadge) {
    heroTenantBadge.textContent = `🏢 ${companyName} · AI Intelligence`;
  }
  if (heroAvatar) {
    if (companyLogo) {
      heroAvatar.innerHTML = `<img src="${companyLogo}" alt="${escapeHtml(companyName)}" />`;
    } else {
      heroAvatar.textContent = companyName.slice(0, 2).toUpperCase();
    }
  }
  if (heroTitle) {
    heroTitle.textContent = `${companyName} AI Analyst & Strategic Advisor`;
  }
  if (heroDesc) {
    heroDesc.textContent = `Asisten analitik cerdas & rekomendasi keputusan bisnis otomatis untuk ${companyName}.`;
  }

  function formatSlug(slug) {
    if (!slug) return "IFresso Coffee";
    return slug
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Load Initial Quota Stats, Exchange Rate, Active Providers, and Chat History List
  fetchUsdToIdrRate();
  loadQuota();
  loadActiveProviders();
  loadHistoryList();

  if (newChatBtn) {
    newChatBtn.addEventListener("click", () => startNewChat());
  }

  function startNewChat() {
    currentConversationId = null;
    try { sessionStorage.removeItem("if_ai_active_conv_id"); } catch {}
    if (messagesContainer) {
      messagesContainer.innerHTML = `
        <div class="msg-row ai-msg">
          <div class="msg-avatar">AI</div>
          <div class="msg-bubble">
            <strong>Halo! Saya AI Business Analyst Anda.</strong><br/>
            Saya siap menganalisis performa toko, evaluasi menu, hitung HPP resep baru, dan memberikan rekomendasi keputusan bisnis otomatis.<br/>
            <em>Silakan pilih salah satu kartu preset di atas atau ketik pertanyaan Anda di bawah.</em>
          </div>
        </div>
      `;
    }
    document.querySelectorAll(".history-item").forEach(el => el.classList.remove("active"));
  }

  async function loadHistoryList() {
    if (!historyListContainer) return;
    try {
      const res = await apiGet(`/api/page/ai/conversations?companySlug=${encodeURIComponent(companySlug)}&userId=${encodeURIComponent(userId)}`);
      if (res && res.ok && res.data) {
        if (!res.data.length) {
          historyListContainer.innerHTML = `<div style="font-size: 0.8rem; color: #94a3b8; text-align: center; padding: 20px;">Belum ada riwayat obrolan.</div>`;
          return;
        }

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const last7Days = new Date(today);
        last7Days.setDate(last7Days.getDate() - 7);
        const last30Days = new Date(today);
        last30Days.setDate(last30Days.getDate() - 30);

        const groups = {
          "Hari Ini": [],
          "Kemarin": [],
          "7 Hari Terakhir": [],
          "30 Hari Terakhir": [],
          "Lebih Lama": []
        };

        res.data.forEach((c) => {
          const dt = c.updated_at ? new Date(c.updated_at) : (c.created_at ? new Date(c.created_at) : new Date());
          if (dt >= today) {
            groups["Hari Ini"].push(c);
          } else if (dt >= yesterday) {
            groups["Kemarin"].push(c);
          } else if (dt >= last7Days) {
            groups["7 Hari Terakhir"].push(c);
          } else if (dt >= last30Days) {
            groups["30 Hari Terakhir"].push(c);
          } else {
            groups["Lebih Lama"].push(c);
          }
        });

        let html = "";
        for (const [groupName, items] of Object.entries(groups)) {
          if (!items.length) continue;

          html += `<div class="history-group-header">📌 ${groupName}</div>`;
          items.forEach((c) => {
            const isActive = c.conversation_id === currentConversationId ? "active" : "";
            const dateStr = c.updated_at ? new Date(c.updated_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";
            html += `
              <div class="history-item ${isActive}" data-id="${c.conversation_id}">
                <div class="history-item-info">
                  <span class="history-title" title="${escapeHtml(c.title || 'Obrolan')}">${escapeHtml(c.title || 'Obrolan')}</span>
                  <span class="history-date">${dateStr}</span>
                </div>
                <button class="history-del-btn" data-del="${c.conversation_id}" title="Hapus Obrolan">✕</button>
              </div>
            `;
          });
        }

        historyListContainer.innerHTML = html;

        // Auto-restore active conversation session if saved in sessionStorage
        const savedConvId = sessionStorage.getItem("if_ai_active_conv_id");
        if (savedConvId && (!currentConversationId || currentConversationId === savedConvId)) {
          const itemToActive = historyListContainer.querySelector(`.history-item[data-id="${savedConvId}"]`);
          if (itemToActive) {
            itemToActive.classList.add("active");
          }
          if (!currentConversationId) {
            selectHistorySession(savedConvId);
          }
        }

        // Bind Item Click Handlers
        historyListContainer.querySelectorAll(".history-item").forEach((item) => {
          item.addEventListener("click", (e) => {
            const delBtn = e.target.closest(".history-del-btn");
            if (delBtn) {
              e.stopPropagation();
              e.preventDefault();
              const delId = delBtn.getAttribute("data-del");
              if (delId) {
                deleteHistorySession(delId);
              }
              return;
            }
            const convId = item.getAttribute("data-id");
            if (convId) {
              selectHistorySession(convId);
            }
          });
        });
      }
    } catch (err) {
      console.warn("Could not load chat history list:", err);
    }
  }

  async function selectHistorySession(convId) {
    if (!convId) return;
    currentConversationId = convId;
    try { sessionStorage.setItem("if_ai_active_conv_id", convId); } catch {}
    document.querySelectorAll(".history-item").forEach(el => {
      el.classList.toggle("active", el.getAttribute("data-id") === convId);
    });

    try {
      const res = await apiGet(`/api/page/ai/conversations/${encodeURIComponent(convId)}/messages`);
      if (res && res.ok && res.data) {
        messagesContainer.innerHTML = "";
        res.data.forEach((m) => {
          if (m.role === "user") {
            renderUserMessage(m.content);
          } else if (m.role === "assistant") {
            renderAiResponse(
              {
                answer: m.content,
                provider: m.provider || "gemini",
                model: m.model || "gemini-flash"
              },
              {
                conversation_id: convId,
                request_id: m.request_id || "",
                usage: m.usage || {
                  total_tokens: m.tokens_used || 0,
                  input_tokens: m.input_tokens || 0,
                  output_tokens: m.output_tokens || 0,
                  estimated_cost: m.estimated_cost || 0
                }
              }
            );
          }
        });
        scrollToBottom();
      }
    } catch (err) {
      console.warn("Could not load conversation messages:", err);
    }
  }

  async function deleteHistorySession(convId) {
    if (!convId) return;
    if (!confirm("Apakah Anda yakin ingin menghapus riwayat obrolan ini?")) return;
    try {
      let res = await apiPost('/api/page/ai/conversations/delete', { conversation_id: convId });
      if (!res || !res.ok) {
        res = await apiDelete(`/api/page/ai/conversations/${encodeURIComponent(convId)}`);
      }
      if (res && res.ok) {
        if (currentConversationId === convId) {
          startNewChat();
        }
        loadHistoryList();
      } else {
        alert(res?.message || "Gagal menghapus riwayat obrolan.");
      }
    } catch (err) {
      console.warn("Could not delete conversation:", err);
    }
  }

  async function loadActiveProviders() {
    if (!providerSelect) return;
    try {
      const res = await apiGet('/api/page/ai/providers');
      if (res && res.ok && res.data) {
        const activeGroupMap = res.data;
        let html = '';

        const providerTitles = {
          gemini: "🟢 Google Gemini (Active Cloud API)",
          openai: "🟢 OpenAI (Active Cloud API)",
          anthropic: "🟢 Anthropic Claude (Active Cloud API)"
        };

        for (const [provider, modelList] of Object.entries(activeGroupMap)) {
          if (!modelList || !modelList.length) continue;

          const groupTitle = providerTitles[provider] || `🟢 ${provider.toUpperCase()}`;
          html += `<optgroup label="${groupTitle}">`;

          modelList.forEach((mItem, idx) => {
            const m = mItem.model;
            let icon = (m.includes('pro') || m.includes('sonnet') || m === 'gpt-4o') ? '🧠' : '⚡';
            let label = mItem.display_name ? `${icon} ${mItem.display_name}` : `${icon} ${m}`;

            const selectedAttr = (provider === 'gemini' && (m === 'gemini-2.5-flash' || m === 'gemini-3.6-flash' || idx === 0)) ? 'selected' : '';
            html += `<option value="${provider}:${m}" ${selectedAttr}>${label}</option>`;
          });

          html += `</optgroup>`;
        }

        if (html) {
          providerSelect.innerHTML = html;
        }
      }
    } catch (err) {
      console.warn("Could not load active AI providers:", err);
    }
  }

  // Preset Card Click Handlers
  document.querySelectorAll(".preset-card").forEach((card) => {
    card.addEventListener("click", () => {
      const promptType = card.getAttribute("data-prompt-type");
      let promptText = card.getAttribute("data-prompt") || "";

      if (promptType === "recipe") {
        const customMenu = prompt("Masukkan nama menu / minuman yang ingin dibuatkan resep & estimasi HPP-nya:", "Americano Peach");
        if (customMenu !== null) {
          const menuName = customMenu.trim() || "Americano Peach";
          promptText = `Saya ingin membuat resep baru ${menuName}, bahan apa saja yang harus disiapkan dan berapa perkiraan HPP-nya?`;
        } else {
          // If cancelled by user, populate prompt template in input and highlight [Nama Menu]
          if (promptInput) {
            const template = "Saya ingin membuat resep baru [Nama Menu], bahan apa saja yang harus disiapkan dan berapa perkiraan HPP-nya?";
            promptInput.value = template;
            promptInput.focus();
            const startIdx = template.indexOf("[Nama Menu]");
            if (startIdx !== -1) {
              promptInput.setSelectionRange(startIdx, startIdx + 11);
            }
          }
          return;
        }
      }

      if (promptText && promptInput) {
        promptInput.value = promptText;
        executeAnalysis();
      }
    });
  });

  // Send Button Click Handler
  if (sendBtn) {
    sendBtn.addEventListener("click", () => executeAnalysis());
  }

  // Enter Key Handler
  if (promptInput) {
    promptInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        executeAnalysis();
      }
    });
  }

  async function loadQuota() {
    try {
      const res = await apiGet(`/api/page/ai/quota?companySlug=${encodeURIComponent(companySlug)}`);
      if (res && res.ok && res.data) {
        const limitNum = Number(res.data.quota_limit || res.data.monthly_token_quota || 10000000);
        const remainingNum = Number(res.data.tokens_remaining ?? (limitNum - (res.data.tokens_consumed || 0)));
        
        let limitFormatted;
        if (limitNum >= 1000000) {
          limitFormatted = `${(limitNum / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 1 })}M`;
        } else {
          limitFormatted = limitNum.toLocaleString('id-ID');
        }

        const remainingFormatted = remainingNum.toLocaleString('id-ID');
        if (quotaDisplay) {
          quotaDisplay.textContent = `${remainingFormatted} / ${limitFormatted}`;
          quotaDisplay.title = `Sisa: ${remainingFormatted} dari total kuota ${limitNum.toLocaleString('id-ID')} token (${res.data.plan_code || 'Enterprise'})`;
        }
      }
    } catch (err) {
      console.warn("Could not load AI quota:", err);
    }
  }

  async function executeAnalysis() {
    const prompt = promptInput.value.trim();
    if (!prompt) return;

    const [provider, model] = (providerSelect.value || "gemini:gemini-1.5-flash").split(":");

    // 1. Render User Message
    renderUserMessage(prompt);
    promptInput.value = "";
    
    // Disable Controls
    sendBtn.disabled = true;
    const origBtnContent = sendBtn.innerHTML;
    sendBtn.innerHTML = `⏳ Menganalisis...`;

    // 2. Render Loading AI Bubble
    const loadingId = renderLoadingBubble();

    // Force browser DOM repaint before starting async network request
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 60)));

    try {
      const session = loadSession();
      const token = session?.token;
      const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch("/api/page/ai/analyze", {
        method: "POST",
        headers,
        body: JSON.stringify({
          companySlug,
          userId,
          conversation_id: currentConversationId,
          prompt,
          provider,
          model
        })
      });

      const res = await response.json();

      removeLoadingBubble(loadingId);

      if (res && res.ok && res.data) {
        if (res.meta && res.meta.conversation_id) {
          currentConversationId = res.meta.conversation_id;
          try { sessionStorage.setItem("if_ai_active_conv_id", currentConversationId); } catch {}
        }
        renderAiResponse(res.data, res.meta);
        loadQuota();
        loadHistoryList(); // Refresh sidebar list
      } else {
        renderErrorMessage(res?.message || "Gagal memproses analisis AI.");
      }
    } catch (err) {
      removeLoadingBubble(loadingId);
      renderErrorMessage("Terjadi kesalahan koneksi ke AI Platform: " + err.message);
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = origBtnContent;
      scrollToBottom();
    }
  }

  function renderUserMessage(text) {
    const row = document.createElement("div");
    row.className = "msg-row user-msg";
    row.innerHTML = `
      <div class="msg-avatar">U</div>
      <div class="msg-bubble">${escapeHtml(text)}</div>
    `;
    messagesContainer.appendChild(row);
    scrollToBottom();
  }

  function renderLoadingBubble() {
    const id = "loading_" + Date.now();
    const row = document.createElement("div");
    row.className = "msg-row ai-msg";
    row.id = id;
    row.innerHTML = `
      <div class="msg-avatar ai-avatar-loading">AI</div>
      <div class="ai-typing-bubble">
        <div class="ai-typing-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <span class="ai-loading-text">Senior AI Analyst sedang membaca data multi-signal & merumuskan keputusan...</span>
      </div>
    `;
    messagesContainer.appendChild(row);
    scrollToBottom();
    setTimeout(() => scrollToBottom(), 50);
    return id;
  }

  function removeLoadingBubble(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  function renderAiResponse(data, meta) {
    const row = document.createElement("div");
    row.className = "msg-row ai-msg";

    let sourcesHtml = "";
    if (data.sources && data.sources.length) {
      sourcesHtml = `
        <div style="margin-top:8px; font-size:0.78rem; color:#475569;">
          📁 <strong>Data Sources Executed:</strong> ${data.sources.map(s => `<span class="meta-pill">${escapeHtml(s)}</span>`).join(" ")}
        </div>
      `;
    }

    let recomHtml = "";
    if (data.recommendations && data.recommendations.length) {
      recomHtml = `<div class="recom-grid">` + data.recommendations.map(r => `
        <div class="recom-card">
          <div class="recom-card-head">
            <span class="recom-title">📌 ${escapeHtml(r.product)}</span>
            <div class="recom-badges">
              <span class="badge-metric ${r.trend.includes('-') ? 'negative' : 'positive'}">Tren 90d: ${escapeHtml(r.trend)}</span>
              <span class="badge-metric">Volume: ${r.sales_volume} / Avg ${r.category_avg}</span>
              <span class="badge-metric">Margin: ${escapeHtml(r.margin)}</span>
            </div>
          </div>
          <div class="recom-body">
            <strong>Rekomendasi AI:</strong> ${escapeHtml(r.recommendation)}<br/>
            <small style="color:#64748b;">${escapeHtml(r.reasoning)}</small>
          </div>
        </div>
      `).join("") + `</div>`;
    }

    const usage = meta?.usage || {};
    const costHtml = formatCostToIdr(usage.estimated_cost || 0);
    const metaBarHtml = `
      <div class="msg-meta-bar">
        <span>⚡ ${usage.total_tokens || 0} Tokens (${usage.input_tokens || 0} in / ${usage.output_tokens || 0} out)</span>
        <span>· Est. Biaya: ${costHtml}</span>
        <span>· Model: ${data.provider || 'openai'} / ${data.model || 'gpt-4o-mini'}</span>
        <span>· RequestID: ${meta?.request_id || ''}</span>
      </div>
    `;

    row.innerHTML = `
      <div class="msg-avatar">AI</div>
      <div class="msg-bubble">
        <div>${formatMarkdown(data.answer)}</div>
        ${recomHtml}
        ${sourcesHtml}
        ${metaBarHtml}
      </div>
    `;

    messagesContainer.appendChild(row);
    scrollToBottom();
  }

  function renderErrorMessage(msg) {
    const row = document.createElement("div");
    row.className = "msg-row ai-msg";
    row.innerHTML = `
      <div class="msg-avatar" style="background:#ef4444;">!</div>
      <div class="msg-bubble" style="border-color:#fca5a5; background:#fef2f2; color:#991b1b;">
        <strong>Terjadi Kesalahan:</strong> ${escapeHtml(msg)}
      </div>
    `;
    messagesContainer.appendChild(row);
    scrollToBottom();
  }

  function scrollToBottom() {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  function escapeHtml(text) {
    if (!text) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatMarkdown(text) {
    if (!text) return "";

    // 1. Preprocess: Protect existing <br> / <br/> tags from getting destroyed
    let preprocessed = text
      .replace(/<br\s*\/?>/gi, " [[BR_TOKEN]] ")
      .replace(/\r\n/g, "\n");

    // 2. Preprocess: Normalize tab-separated tables (\t) into pipe tables
    const rawLines = preprocessed.split("\n");
    const normalizedLines = [];
    let inTabTable = false;

    for (let idx = 0; idx < rawLines.length; idx++) {
      let l = rawLines[idx];
      if (l.includes("\t") && l.split("\t").length >= 2) {
        const parts = l.split("\t").map((p) => p.trim());
        const pipeRow = "| " + parts.join(" | ") + " |";
        if (!inTabTable) {
          inTabTable = true;
          normalizedLines.push(pipeRow);
          // Auto inject markdown header separator if not present
          const sep = "| " + parts.map(() => "---").join(" | ") + " |";
          normalizedLines.push(sep);
        } else {
          normalizedLines.push(pipeRow);
        }
      } else {
        inTabTable = false;
        normalizedLines.push(l);
      }
    }

    preprocessed = normalizedLines.join("\n");

    // 3. Fix asymmetric/malformed asterisks (e.g. *text** -> **text**, point* -> point)
    preprocessed = preprocessed
      .replace(/\*([^*\n]+)\*\*/g, "**$1**")
      .replace(/\*\*([^*\n]+)\*/g, "**$1**");

    // 4. If Marked.js is available from CDN, use it with custom table/badge post-processing
    if (typeof window !== "undefined" && window.marked && typeof window.marked.parse === "function") {
      try {
        let parsedHtml = window.marked.parse(preprocessed, {
          gfm: true,
          breaks: true
        });

        // Restore protected BR tokens
        parsedHtml = parsedHtml.replace(/\[\[BR_TOKEN\]\]/g, "<br/>");

        // Wrap <table> with responsive container and add style classes
        parsedHtml = parsedHtml.replace(/<table>/gi, '<div class="ai-table-wrapper"><table class="ai-table">');
        parsedHtml = parsedHtml.replace(/<\/table>/gi, '</table></div>');

        // Post-process table cells for Status Badges & Bullet formatting
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = parsedHtml;

        tempDiv.querySelectorAll("td, th").forEach((cell) => {
          let cellHtml = cell.innerHTML;

          // Convert internal bullets into stylish cell items
          if (cellHtml.includes("&lt;br&gt;") || cellHtml.includes("<br>")) {
            cellHtml = cellHtml.replace(/&lt;br\s*\/?&gt;/gi, "<br/>");
          }

          // Format bullet lists inside table cells
          if (cellHtml.includes("• ") || cellHtml.includes("- ")) {
            const items = cellHtml.split(/<br\s*\/?>/i);
            if (items.length > 1) {
              cellHtml = items.map(it => {
                const cleanIt = it.replace(/^[\s•\-]+/, "").trim();
                return cleanIt ? `<div class="cell-bullet">${cleanIt}</div>` : "";
              }).join("");
            }
          }

          // Format Status Badges inside table cells
          const textOnly = cell.textContent.trim();
          if (/^(NORMAL|AMAN|SANGAT AMAN|ACTIVE|AKTIF|LANCAR)$/i.test(textOnly) || textOnly.includes("✅")) {
            cellHtml = `<span class="ai-status-badge success">${cellHtml}</span>`;
          } else if (/^(LOW_STOCK|HABIS|KRITIS|NONAKTIF|INACTIVE)$/i.test(textOnly) || textOnly.includes("⚠️") || textOnly.includes("RAWAN")) {
            cellHtml = `<span class="ai-status-badge warning">${cellHtml}</span>`;
          } else if (textOnly.includes("MENIPIS")) {
            cellHtml = `<span class="ai-status-badge warning">${cellHtml}</span>`;
          }

          cell.innerHTML = cellHtml;
        });

        return `<div class="ai-content">${tempDiv.innerHTML}</div>`;
      } catch (markedErr) {
        console.warn("Marked parser fallback:", markedErr);
      }
    }

    // 5. High-Performance Built-in Parser (Fallback)
    const lines = preprocessed.split("\n");
    let result = [];
    let inTable = false;
    let tableRows = [];
    let inList = false;
    let listType = null;
    let inCodeBlock = false;
    let codeContent = [];

    const closeList = () => {
      if (inList) {
        result.push(listType === "ol" ? "</ol>" : "</ul>");
        inList = false;
        listType = null;
      }
    };

    const flushTable = () => {
      if (tableRows.length >= 2) {
        const headerLine = tableRows[0];
        const separatorLine = tableRows[1];
        const dataLines = tableRows.slice(2);

        const parseCells = (line) => {
          return line
            .trim()
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((c) => c.trim());
        };

        const headers = parseCells(headerLine);
        const alignments = parseCells(separatorLine).map((align) => {
          if (align.startsWith(":") && align.endsWith(":")) return "center";
          if (align.endsWith(":")) return "right";
          return "left";
        });

        let tableHtml = '<div class="ai-table-wrapper"><table class="ai-table"><thead><tr>';
        headers.forEach((h, idx) => {
          const align = alignments[idx] || "left";
          tableHtml += `<th style="text-align:${align}">${formatInline(h)}</th>`;
        });
        tableHtml += "</tr></thead><tbody>";

        dataLines.forEach((rowLine) => {
          const cells = parseCells(rowLine);
          tableHtml += "<tr>";
          cells.forEach((cell, idx) => {
            const align = alignments[idx] || "left";
            let formattedCell = formatInline(cell);
            
            // Format bullet lists inside cell
            if (formattedCell.includes("<br/>") || formattedCell.includes("•") || formattedCell.includes("- ")) {
              const items = formattedCell.split(/<br\s*\/?>/i);
              if (items.length > 1) {
                formattedCell = items.map(it => {
                  const cleanIt = it.replace(/^[\s•\-]+/, "").trim();
                  return cleanIt ? `<div class="cell-bullet">${cleanIt}</div>` : "";
                }).join("");
              }
            }

            // Auto Badge Formatter for Status Cells
            const cleanText = cell.replace(/\[\[BR_TOKEN\]\]/g, " ").trim();
            if (/^(NORMAL|AMAN|SANGAT AMAN|ACTIVE|AKTIF)$/i.test(cleanText) || cleanText.includes("✅")) {
              formattedCell = `<span class="ai-status-badge success">${formattedCell}</span>`;
            } else if (/^(LOW_STOCK|HABIS|KRITIS|INACTIVE|NONAKTIF)$/i.test(cleanText) || cleanText.includes("⚠️") || cleanText.includes("RAWAN") || cleanText.includes("MENIPIS")) {
              formattedCell = `<span class="ai-status-badge warning">${formattedCell}</span>`;
            }
            tableHtml += `<td style="text-align:${align}">${formattedCell}</td>`;
          });
          tableHtml += "</tr>";
        });

        tableHtml += "</tbody></table></div>";
        result.push(tableHtml);
      }
      inTable = false;
      tableRows = [];
    };

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Code Block Handling (```)
      if (line.trim().startsWith("```")) {
        closeList();
        if (inTable) flushTable();
        if (inCodeBlock) {
          result.push(`<pre><code>${escapeHtml(codeContent.join("\n"))}</code></pre>`);
          inCodeBlock = false;
          codeContent = [];
        } else {
          inCodeBlock = true;
          codeContent = [];
        }
        continue;
      }
      if (inCodeBlock) {
        codeContent.push(line);
        continue;
      }

      // Markdown Table Detection
      if (line.trim().startsWith("|") && (line.trim().endsWith("|") || line.includes("|"))) {
        closeList();
        inTable = true;
        tableRows.push(line);
        continue;
      } else if (inTable) {
        flushTable();
      }

      // Horizontal Rule
      if (/^(\*\*\*|---|___)$/.test(line.trim())) {
        closeList();
        result.push("<hr/>");
        continue;
      }

      // Headings
      if (line.startsWith("#### ")) {
        closeList();
        result.push(`<h4>${formatInline(line.slice(5))}</h4>`);
        continue;
      }
      if (line.startsWith("### ")) {
        closeList();
        result.push(`<h3>${formatInline(line.slice(4))}</h3>`);
        continue;
      }
      if (line.startsWith("## ")) {
        closeList();
        result.push(`<h2>${formatInline(line.slice(3))}</h2>`);
        continue;
      }
      if (line.startsWith("# ")) {
        closeList();
        result.push(`<h1>${formatInline(line.slice(2))}</h1>`);
        continue;
      }

      // Blockquotes
      if (line.startsWith("> ")) {
        closeList();
        result.push(`<blockquote>${formatInline(line.slice(2))}</blockquote>`);
        continue;
      }

      // Unordered Lists (*, -)
      const ulMatch = line.match(/^(\s*)([-*])\s+(.+)$/);
      if (ulMatch) {
        if (!inList || listType !== "ul") {
          closeList();
          result.push("<ul>");
          inList = true;
          listType = "ul";
        }
        result.push(`<li>${formatInline(ulMatch[3])}</li>`);
        continue;
      }

      // Ordered Lists (1., 2.)
      const olMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
      if (olMatch) {
        if (!inList || listType !== "ol") {
          closeList();
          result.push("<ol>");
          inList = true;
          listType = "ol";
        }
        result.push(`<li>${formatInline(olMatch[3])}</li>`);
        continue;
      }

      // Regular line
      closeList();
      if (line.trim() === "") {
        result.push("<div style='height: 6px;'></div>");
      } else {
        result.push(`<p>${formatInline(line)}</p>`);
      }
    }

    closeList();
    if (inTable) flushTable();

    return `<div class="ai-content">${result.join("")}</div>`;
  }

  function formatInline(str) {
    if (!str) return "";
    let html = escapeHtml(str);
    // Restore protected BR token
    html = html.replace(/\[\[BR_TOKEN\]\]/g, "<br/>");
    // Inline Code: `code`
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    // Bold: **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // Italic: *text* or _text_
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    html = html.replace(/_([^_]+)_/g, "<em>$1</em>");
    // Markdown Links / Citations: [Title](https://...)
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="ai-citation-link">🔗 $1</a>');
    return html;
  }
}

// Initialize on DOM load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAiAnalystPage);
} else {
  initAiAnalystPage();
}
