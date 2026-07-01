import { renderLayout } from "../layout.js?v=coffee-v150";
import { apiGet, loadSession, loadState, scopedApiUrl } from "../store.js?v=coffee-v150";
import { formatQty, money, shortDate } from "../format.js";
import { byId, setText } from "../dom.js";
import { enhanceAllDataTables } from "../datatable.js";

renderLayout();

const state = loadState();
const session = loadSession();
const period = byId("settlement-period");
const anchorDate = byId("settlement-anchor-date");

function localDateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function reportUrl() {
  const params = new URLSearchParams({ period: period.value || "daily", anchor_date: anchorDate.value || localDateValue() });
  return scopedApiUrl(`/api/reports/profit-loss?${params.toString()}`, state, session);
}

function fetchReport() {
  const response = apiGet(reportUrl());
  return response?.ok ? response.data : null;
}

function renderPage() {
  const report = fetchReport();
  const rows = report?.finance?.paymentSummary || [];
  const gross = rows.reduce((sum, row) => sum + Number(row.grossAmount || 0), 0);
  const net = rows.reduce((sum, row) => sum + Number(row.netSettlement || 0), 0);
  setText("settlement-gross", money(gross));
  setText("settlement-net", money(net));
  byId("payment-summary-table").innerHTML = rows.length
    ? rows.map((row) => `
      <tr><td><strong>${escapeHtml(row.method)}</strong></td><td>${formatQty(row.transactions)}</td><td>${money(row.grossAmount)}</td><td>${money(row.paymentFeeCustomer || 0)}</td><td>${money(row.paymentFeeMerchant || 0)}</td><td>${money(row.netSettlement || 0)}</td></tr>
    `).join("")
    : `<tr><td colspan="6">Belum ada settlement pada periode ini.</td></tr>`;
  byId("settlement-transaction-table").innerHTML = report?.transactions?.length
    ? report.transactions.map((trx) => {
      const fee = Number(trx.paymentFee || 0);
      const merchantFee = trx.paymentFeePayer === "merchant" ? fee : 0;
      return `<tr><td>${shortDate.format(new Date(trx.createdAt))}</td><td>${escapeHtml(trx.orderNo)}</td><td>${escapeHtml(trx.paymentMethod || "-")}</td><td>${money(trx.revenue)}</td><td>${money(fee)}</td><td>${money(Number(trx.revenue || 0) - merchantFee)}</td></tr>`;
    }).join("")
    : `<tr><td colspan="6">Belum ada transaksi payment.</td></tr>`;
  enhanceAllDataTables();
}

anchorDate.value = localDateValue();
period.addEventListener("change", renderPage);
anchorDate.addEventListener("change", renderPage);
renderPage();
