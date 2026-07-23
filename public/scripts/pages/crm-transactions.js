import { renderLayout } from "../layout.js?v=1784794256";
import { apiGet, applyPermissionControls, loadSession, loadState, scopedApiUrl } from "../store.js?v=1784794256";
import { byId, showAlert } from "../dom.js";
import { orderStatusLabel, statusLabel } from "../status-codes.js";

renderLayout();

const state = loadState();
const session = loadSession();
const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
let rows = [];
let pagination = { page: 1, perPage: 25, total: 0, totalPages: 1 };
let page = 1;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value) {
  return rupiah.format(Math.round(Number(value || 0)));
}

function localDateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function last30DaysValue() {
  const date = new Date();
  date.setDate(date.getDate() - 29);
  return localDateValue(date);
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function queryParams() {
  const params = new URLSearchParams({
    page: String(page),
    per_page: "25"
  });
  const search = byId("crm-transaction-search").value.trim();
  const from = byId("crm-transaction-from").value;
  const to = byId("crm-transaction-to").value;
  if (search) params.set("search", search);
  if (from) params.set("date_from", from);
  if (to) params.set("date_to", to);
  return params.toString();
}

function refreshData() {
  const response = apiGet(scopedApiUrl(`/api/customer-transaction?${queryParams()}`, state, session));
  if (!response?.ok) throw new Error(response?.message || "Transaksi customer belum dapat dimuat.");
  rows = response.data?.items || [];
  pagination = response.data?.pagination || pagination;
  render();
}

function renderSummary() {
  const totalValue = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const members = new Set(rows.map((row) => row.customerMemberId).filter(Boolean)).size;
  byId("crm-transaction-summary").innerHTML = `
    <article class="order-history-card date-card">
      <span>Transaksi</span>
      <strong>${pagination.total || 0}</strong>
      <small>Total transaksi sesuai filter</small>
    </article>
    <article class="order-history-card">
      <span>Member</span>
      <strong>${members}</strong>
      <small>Member unik di halaman ini</small>
    </article>
    <article class="order-history-card revenue-card">
      <span>Nilai Transaksi</span>
      <strong>${money(totalValue)}</strong>
      <small>Total nilai transaksi halaman ini</small>
    </article>
  `;
}

function renderTable() {
  byId("crm-transaction-caption").textContent = `Menampilkan ${rows.length} dari ${pagination.total || 0} transaksi member.`;
  byId("crm-transaction-body").innerHTML = rows.length ? rows.map((row) => `
    <tr>
      <td><strong>#${escapeHtml(row.orderNumber)}</strong><span>${formatDateTime(row.createdAt)}</span></td>
      <td><strong>${escapeHtml(row.customerName || "-")}</strong><span>${escapeHtml(row.customerEmail || row.customerPhone || "-")}</span></td>
      <td>${escapeHtml(row.serviceType || "-")}</td>
      <td>${escapeHtml(row.paymentMethod || "-")}<span>${statusLabel(row.paymentStatus, "payment")}</span></td>
      <td><span class="status-pill">${orderStatusLabel(row.status)}</span></td>
      <td><strong>${money(row.total || 0)}</strong></td>
    </tr>
  `).join("") : `<tr><td colspan="6"><div class="empty-state">Belum ada transaksi customer untuk filter ini.</div></td></tr>`;
}

function renderPagination() {
  const totalPages = pagination.totalPages || 1;
  byId("crm-transaction-pagination").innerHTML = `
    <button class="ghost-button compact-button" data-crm-transaction-page="${Math.max(1, page - 1)}" ${page <= 1 ? "disabled" : ""} type="button">Sebelumnya</button>
    <span>Halaman ${page} / ${totalPages}</span>
    <button class="ghost-button compact-button" data-crm-transaction-page="${Math.min(totalPages, page + 1)}" ${page >= totalPages ? "disabled" : ""} type="button">Berikutnya</button>
  `;
}

function render() {
  renderSummary();
  renderTable();
  renderPagination();
  applyPermissionControls(document, state, session);
}

function resetAndRefresh() {
  page = 1;
  refreshData();
}

byId("crm-transaction-from").value = last30DaysValue();
byId("crm-transaction-to").value = localDateValue();
["crm-transaction-from", "crm-transaction-to", "crm-transaction-search"].forEach((id) => {
  byId(id).addEventListener(id.endsWith("search") ? "input" : "change", resetAndRefresh);
});

document.addEventListener("click", (event) => {
  const pageButton = event.target.closest("[data-crm-transaction-page]");
  if (pageButton && !pageButton.disabled) {
    page = Number(pageButton.dataset.crmTransactionPage || 1);
    refreshData();
  }
});

try {
  refreshData();
} catch (error) {
  showAlert(error.message, "error");
}
