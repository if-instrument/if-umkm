import { renderLayout } from "../layout.js";
import { apiGet, apiPost, apiDelete, loadSession } from "../store.js";

renderLayout();

export function initAiAnalystPage() {
  const session = loadSession();
  const companySlug = session?.companySlug || window.__COMPANY_SLUG__ || "IFresso-Coffee";
  const userId = session?.userId || "usr_mgr_1";

  let currentConversationId = null;

  const promptInput = document.getElementById("ai-prompt-input");
  const sendBtn = document.getElementById("ai-send-btn");
  const messagesContainer = document.getElementById("chat-messages");
  const providerSelect = document.getElementById("ai-provider-select");
  const quotaDisplay = document.getElementById("ai-quota-display");
  const historyListContainer = document.getElementById("history-list");
  const newChatBtn = document.getElementById("new-chat-btn");

  // Load Initial Quota Stats, Active Providers, and Chat History List
  loadQuota();
  loadActiveProviders();
  loadHistoryList();

  if (newChatBtn) {
    newChatBtn.addEventListener("click", () => startNewChat());
  }

  function startNewChat() {
    currentConversationId = null;
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
    currentConversationId = convId;
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
            renderAiResponse({ answer: m.content, provider: "ai", model: "assistant" }, { conversation_id: convId });
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
      const promptText = card.getAttribute("data-prompt");
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
        const remaining = (res.data.tokens_remaining || 0).toLocaleString();
        const total = (res.data.monthly_token_quota || 2000000).toLocaleString();
        if (quotaDisplay) {
          quotaDisplay.textContent = `${remaining} / ${total}`;
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
    const metaBarHtml = `
      <div class="msg-meta-bar">
        <span>⚡ ${usage.total_tokens || 0} Tokens (${usage.input_tokens || 0} in / ${usage.output_tokens || 0} out)</span>
        <span>· Est. Cost: $${(usage.estimated_cost || 0).toFixed(6)}</span>
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
    let html = escapeHtml(text);
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
    html = html.replace(/\n/g, "<br/>");
    return html;
  }
}

// Initialize on DOM load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAiAnalystPage);
} else {
  initAiAnalystPage();
}
