import { renderLayout } from "../layout.js?v=coffee-v137";
import { apiDelete, apiGet, apiPost, apiPut, applyPermissionControls, loadSession, loadState, scopedApiUrl, scopedPayload } from "../store.js?v=coffee-v137";
import { money } from "../format.js";
import { byId, setText, showAlert, showFeedback } from "../dom.js";
import { enhanceAllDataTables } from "../datatable.js";

renderLayout();

const state = loadState();
const session = loadSession();
const period = byId("expense-period");
const anchorDate = byId("expense-anchor-date");
let expenses = [];

function localDateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function expenseUrl() {
  const params = new URLSearchParams({ period: period.value || "daily", anchor_date: anchorDate.value || localDateValue() });
  return scopedApiUrl(`/api/finance/expense?${params.toString()}`, state, session);
}

function fetchExpenses() {
  const response = apiGet(expenseUrl());
  expenses = response?.data?.items || [];
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function renderSummary() {
  const summary = {};
  expenses.forEach((expense) => {
    const category = expense.category || "Other";
    summary[category] ||= { category, count: 0, amount: 0 };
    summary[category].count += 1;
    summary[category].amount += Number(expense.amount || 0);
  });
  const rows = Object.values(summary).sort((a, b) => b.amount - a.amount);
  byId("expense-summary-table").innerHTML = rows.length
    ? rows.map((row) => `<tr><td><strong>${escapeHtml(row.category)}</strong></td><td>${row.count}</td><td>${money(row.amount)}</td></tr>`).join("")
    : `<tr><td colspan="3">Belum ada expense pada periode ini.</td></tr>`;
}

function renderTable() {
  byId("expense-table").innerHTML = expenses.length
    ? expenses.map((expense) => `
      <tr>
        <td>${escapeHtml(expense.expenseDate)}</td>
        <td>${escapeHtml(expense.category)}</td>
        <td><strong>${escapeHtml(expense.name)}</strong><br><small>${escapeHtml(expense.referenceNo || expense.notes || "")}</small></td>
        <td>${escapeHtml(expense.paymentMethod || "-")}</td>
        <td>${escapeHtml(expense.vendor || "-")}</td>
        <td>${money(expense.amount)}</td>
        <td><div class="row-actions"><button class="ghost-button compact-button" data-edit-expense="${expense.id}" data-permission="reports.operatingExpenses:update" type="button">Edit</button><button class="ghost-button compact-button" data-delete-expense="${expense.id}" data-permission="reports.operatingExpenses:delete" type="button">Void</button></div></td>
      </tr>
    `).join("")
    : `<tr><td colspan="7">Belum ada beban operasional pada periode ini.</td></tr>`;
}

function renderPage() {
  fetchExpenses();
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  setText("expense-total", money(total));
  renderSummary();
  renderTable();
  applyPermissionControls(document, state, session);
  enhanceAllDataTables();
}

function openModal() {
  document.querySelector("[data-modal-backdrop]").hidden = false;
  byId("expense-modal").hidden = false;
  document.body.classList.add("modal-open");
}

function closeModal() {
  document.querySelector("[data-modal-backdrop]").hidden = true;
  byId("expense-modal").hidden = true;
  document.body.classList.remove("modal-open");
}

function openExpenseModal(expense = null) {
  byId("expense-id").value = expense?.id || "";
  byId("expense-date").value = expense?.expenseDate || anchorDate.value || localDateValue();
  byId("expense-category").value = expense?.category || "Other";
  byId("expense-name").value = expense?.name || "";
  byId("expense-amount").value = expense?.amount || "";
  byId("expense-payment-method").value = expense?.paymentMethod || "";
  byId("expense-vendor").value = expense?.vendor || "";
  byId("expense-reference").value = expense?.referenceNo || "";
  byId("expense-status").value = expense?.status || "posted";
  byId("expense-notes").value = expense?.notes || "";
  setText("expense-feedback", "");
  openModal();
}

function saveExpense(event) {
  event.preventDefault();
  const id = byId("expense-id").value;
  const payload = scopedPayload({
    id,
    expenseDate: byId("expense-date").value,
    category: byId("expense-category").value,
    name: byId("expense-name").value.trim(),
    amount: Number(byId("expense-amount").value || 0),
    paymentMethod: byId("expense-payment-method").value.trim(),
    vendor: byId("expense-vendor").value.trim(),
    referenceNo: byId("expense-reference").value.trim(),
    status: byId("expense-status").value,
    notes: byId("expense-notes").value.trim()
  }, state, session);
  const response = id ? apiPut(`/api/finance/expense/${id}`, payload) : apiPost("/api/finance/expense", payload);
  if (!response?.ok) {
    showFeedback("expense-feedback", response?.message || "Beban operasional belum berhasil disimpan.");
    return;
  }
  closeModal();
  renderPage();
  showAlert("Beban operasional tersimpan.");
}

anchorDate.value = localDateValue();
period.addEventListener("change", renderPage);
anchorDate.addEventListener("change", renderPage);
byId("expense-form").addEventListener("submit", saveExpense);
document.addEventListener("click", (event) => {
  if (event.target.closest("[data-open-expense-modal]")) openExpenseModal();
  if (event.target.closest("[data-close-modal]") || event.target.matches("[data-modal-backdrop]")) closeModal();
  const edit = event.target.closest("[data-edit-expense]");
  if (edit) openExpenseModal(expenses.find((expense) => expense.id === edit.dataset.editExpense));
  const remove = event.target.closest("[data-delete-expense]");
  if (remove && confirm("Void beban operasional ini?")) {
    const response = apiDelete(`/api/finance/expense/${remove.dataset.deleteExpense}`, scopedPayload({}, state, session));
    if (!response?.ok) return showAlert(response?.message || "Beban operasional belum berhasil di-void.");
    renderPage();
    showAlert("Beban operasional di-void.");
  }
});
renderPage();
