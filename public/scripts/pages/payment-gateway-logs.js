import { renderLayout } from "../layout.js?v=coffee-v150";
import { loadSession, loadState } from "../store.js?v=coffee-v150";
import { money } from "../format.js";
import { byId } from "../dom.js";
import { PAYMENT_STATUS, isPaidStatus, paymentStatusCode, statusLabel } from "../status-codes.js";
import { loadPageBootstrap } from "../page-engine.js?v=coffee-v154";

renderLayout();

const state = loadState();
const session = loadSession();
let logs = [];

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusPill(status) {
  const code = paymentStatusCode(status);
  const className = {
    [PAYMENT_STATUS.PAID]: "status-ok",
    [PAYMENT_STATUS.UNPAID]: "status-warning",
    [PAYMENT_STATUS.FAILED]: "status-empty",
    [PAYMENT_STATUS.CANCELLED]: "status-empty",
    [PAYMENT_STATUS.EXPIRED]: "status-empty"
  }[code] || "status-warning";
  return `<span class="status-pill ${className}">${statusLabel(code, "payment")} <small>${code}</small></span>`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value.replace(" ", "T")));
}

function queryString() {
  return {
    view: "gateway-logs",
    per_page: "100",
    provider: byId("gateway-log-provider").value,
    status: byId("gateway-log-status").value,
    q: byId("gateway-log-search").value.trim()
  };
}

function loadLogs() {
  const response = loadPageBootstrap("paymentGatewayLogs", state, session, queryString());
  if (!response?.ok) {
    logs = [];
    byId("gateway-log-feedback").textContent = response?.message || "Log payment gateway tidak bisa dibuka.";
    renderLogs();
    return;
  }
  logs = response.data?.gatewayLogs || [];
  byId("gateway-log-feedback").textContent = "";
  renderLogs();
}

function renderSummary() {
  const totalAmount = logs.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const paid = logs.filter((item) => isPaidStatus(item.status)).length;
  const pending = logs.filter((item) => paymentStatusCode(item.status) === PAYMENT_STATUS.UNPAID).length;
  const simulated = logs.filter((item) => item.simulated).length;
  byId("gateway-log-summary").innerHTML = `
    <article><span>Total Log</span><strong>${logs.length}</strong></article>
    <article><span>Paid</span><strong>${paid}</strong></article>
    <article><span>Pending</span><strong>${pending}</strong></article>
    <article><span>Simulasi</span><strong>${simulated}</strong></article>
    <article><span>Nominal</span><strong>${money(totalAmount)}</strong></article>
  `;
}

function renderLogs() {
  renderSummary();
  byId("gateway-log-table").innerHTML = logs.length ? logs.map((item) => `
    <tr>
      <td>${formatDate(item.createdAt)}</td>
      <td><strong>${escapeHtml(item.orderNo)}</strong><br><small>${escapeHtml(item.reference)}</small></td>
      <td><strong>${escapeHtml(item.provider)}</strong><br><small>${escapeHtml(item.methodName)}${item.mode ? ` · ${escapeHtml(item.mode)}` : ""}</small></td>
      <td>${money(item.amount)}<br><small>Fee ${money(item.feeAmount || 0)}</small></td>
      <td>${statusPill(item.status)}${item.methodType === "qris" ? (item.qrPayloadValid ? `<br><small>QR valid</small>` : `<br><small>QR sandbox</small>`) : `<br><small>${escapeHtml(item.methodType || "-")}</small>`}</td>
      <td>${item.webhookEvent ? escapeHtml(item.webhookEvent) : "-"}${item.simulated ? `<br><small>Simulasi</small>` : ""}</td>
      <td><button class="ghost-button compact-button" data-gateway-log-detail="${item.id}" type="button">Detail</button></td>
    </tr>
  `).join("") : `<tr><td colspan="7">Belum ada log payment gateway.</td></tr>`;
}

function openDetail(id) {
  const item = logs.find((entry) => entry.id === id);
  if (!item) return;
  const detailLogs = item.detailLogs || [];
  byId("gateway-log-title").textContent = `${item.orderNo} · ${item.provider}`;
  byId("gateway-log-subtitle").textContent = `${item.reference} · ${statusLabel(item.status, "payment")} (${paymentStatusCode(item.status)})`;
  byId("gateway-log-detail").innerHTML = `
    <div class="gateway-log-detail-grid">
      <article><span>Order</span><strong>${escapeHtml(item.orderNo)}</strong></article>
      <article><span>Provider Ref</span><strong>${escapeHtml(item.reference)}</strong></article>
      <article><span>Status</span><strong>${escapeHtml(statusLabel(item.status, "payment"))} (${paymentStatusCode(item.status)})</strong></article>
      <article><span>Dibuat</span><strong>${formatDate(item.createdAt)}</strong></article>
    </div>
    <section class="gateway-hit-log-section">
      <h4>Detail Hit Gateway</h4>
      ${detailLogs.length ? detailLogs.map((log, index) => `
        <details class="gateway-hit-log-card" ${index === detailLogs.length - 1 ? "open" : ""}>
          <summary>
            <div>
              <strong>${index + 1}. ${escapeHtml(log.action || "-")}</strong>
              <span>${formatDate(log.createdAt)} · ${escapeHtml(log.direction || "-")} · ${escapeHtml(log.httpMethod || "-")} · ${escapeHtml(log.target || "-")}</span>
            </div>
            <div>
              ${log.httpStatus ? `<span class="status-pill status-ok">HTTP ${log.httpStatus}</span>` : `<span class="status-pill status-warning">No HTTP</span>`}
              ${log.status ? statusPill(log.status) : ""}
            </div>
          </summary>
          ${log.errorMessage ? `<p class="form-note">${escapeHtml(log.errorMessage)}</p>` : ""}
          <div class="gateway-log-payload-grid">
            <section><h4>Request</h4><pre>${escapeHtml(JSON.stringify(log.requestPayload || {}, null, 2))}</pre></section>
            <section><h4>Response</h4><pre>${escapeHtml(JSON.stringify(log.responsePayload || {}, null, 2))}</pre></section>
          </div>
        </details>
      `).join("") : `<p class="empty-state">Belum ada detail hit untuk transaksi ini.</p>`}
    </section>
  `;
  document.querySelector("[data-gateway-log-backdrop]").hidden = false;
  byId("gateway-log-modal").hidden = false;
  document.body.classList.add("modal-open");
}

function closeDetail() {
  document.querySelector("[data-gateway-log-backdrop]").hidden = true;
  byId("gateway-log-modal").hidden = true;
  document.body.classList.remove("modal-open");
}

document.addEventListener("click", (event) => {
  const detailButton = event.target.closest("[data-gateway-log-detail]");
  if (detailButton) openDetail(detailButton.dataset.gatewayLogDetail);
  if (event.target.closest("[data-close-gateway-log]") || event.target.matches("[data-gateway-log-backdrop]")) closeDetail();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDetail();
});

["gateway-log-provider", "gateway-log-status"].forEach((id) => byId(id).addEventListener("change", loadLogs));
byId("gateway-log-search").addEventListener("input", () => {
  window.clearTimeout(window.__gatewayLogSearchTimer);
  window.__gatewayLogSearchTimer = window.setTimeout(loadLogs, 250);
});
byId("gateway-log-refresh").addEventListener("click", loadLogs);

loadLogs();
