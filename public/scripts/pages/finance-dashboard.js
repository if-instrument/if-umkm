import { renderLayout } from "../layout.js?v=coffee-v151";
import { loadSession, loadState } from "../store.js?v=coffee-v151";
import { money } from "../format.js";
import { byId, setText } from "../dom.js";
import { loadPageBootstrap } from "../page-engine.js?v=coffee-v154";

renderLayout();

const state = loadState();
const session = loadSession();
const period = byId("finance-period");
const anchorDate = byId("finance-anchor-date");

function localDateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function renderPage() {
  const response = loadPageBootstrap("financeDashboard", state, session, {
    view: "dashboard",
    period: period.value || "daily",
    anchor_date: anchorDate.value || localDateValue()
  });
  const report = response?.data?.report || {};
  setText("finance-revenue", money(report.totals?.revenue || 0));
  setText("finance-gross-profit", money(report.totals?.profit || 0));
  setText("finance-expense", money(report.totals?.operatingExpenses || 0));
  setText("finance-net-cash", money(report.finance?.netCashMovement || 0));
  const expenses = report.finance?.expenseSummary || [];
  byId("finance-expense-summary").innerHTML = expenses.length
    ? expenses.map((row) => `<tr><td><strong>${escapeHtml(row.category)}</strong></td><td>${row.count}</td><td>${money(row.amount)}</td></tr>`).join("")
    : `<tr><td colspan="3">Belum ada expense.</td></tr>`;
  const payments = report.finance?.paymentSummary || [];
  byId("finance-payment-summary").innerHTML = payments.length
    ? payments.map((row) => `<tr><td><strong>${escapeHtml(row.method)}</strong></td><td>${money(row.grossAmount)}</td><td>${money(row.netSettlement)}</td></tr>`).join("")
    : `<tr><td colspan="3">Belum ada settlement.</td></tr>`;
}

anchorDate.value = localDateValue();
period.addEventListener("change", renderPage);
anchorDate.addEventListener("change", renderPage);
renderPage();
