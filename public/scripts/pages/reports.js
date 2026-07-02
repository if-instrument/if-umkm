import { renderLayout } from "../layout.js?v=coffee-v151";
import { applyPermissionControls, loadSession, loadState } from "../store.js?v=coffee-v151";
import { formatQty, money, shortDate } from "../format.js";
import { byId, setText } from "../dom.js";
import { enhanceAllDataTables } from "../datatable.js";
import { loadPageBootstrap } from "../page-engine.js?v=coffee-v154";

renderLayout();

const state = loadState();
const session = loadSession();
const reportPeriod = byId("report-period");
const reportAnchorDate = byId("report-anchor-date");
let currentReport = null;

function expenseRows(report) {
  return report.operatingExpenses || [];
}

function statementAmount(value, options = {}) {
  const amount = Math.abs(Number(value) || 0);
  if (options.parentheses || value < 0) return `(${money(amount)})`;
  return money(amount);
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function reportFilename() {
  const period = reportPeriod.options[reportPeriod.selectedIndex].textContent;
  const label = currentReport?.range.label || "periode";
  return `laporan-laba-rugi-${slug(currentReport?.outletName || "outlet")}-${slug(period)}-${slug(label)}`;
}

function reportSummaryRows(report) {
  return [
    ["Outlet", report.outletName],
    ["Periode", report.range.label],
    ["Omzet Penjualan", money(report.totals.revenue)],
    ["Service Charge Dine In", money(report.totals.serviceCharge)],
    ["Pendapatan Item Kemasan Take Away", money(report.totals.packagingFee)],
    ["Payment Fee Customer", money(report.totals.paymentFeeCustomer || 0)],
    ["HPP Penjualan", money(report.totals.cogs)],
    ["Laba Kotor", money(report.totals.profit)],
    ["Payment Fee Merchant", money(report.totals.paymentFeeMerchant || 0)],
    ["Waste / Expired", money(report.wasteLoss)],
    ["Koreksi Stok Bersih", money(report.netAdjustment)],
    ["Beban Operasional", money(report.totals.operatingExpenses || 0)],
    ["Laba Operasional", money(report.operatingProfit)]
  ];
}

function movementTypeLabel(movement) {
  return movement.label || movement.reportType || movement.type || "-";
}

function movementCost(movement) {
  return Number(movement.totalCost) || 0;
}

function lossExportRows(report) {
  return report.lossMovements.map((movement) => [
    shortDate.format(new Date(movement.createdAt)),
    movement.ingredientName || "Bahan outlet tidak ditemukan",
    movementTypeLabel(movement),
    `${formatQty(movement.qty)} ${movement.unit || ""}`.trim(),
    money(movementCost(movement)),
    movement.note || ""
  ]);
}

function transactionExportRows(report) {
  return report.transactions.map((trx) => [
    shortDate.format(new Date(trx.createdAt)),
    trx.items.map(itemLabel).join(", "),
    money(trx.revenue),
    money(trx.cogs),
    money(trx.profit)
  ]);
}

function expenseExportRows(report) {
  return expenseRows(report).map((expense) => [
    expense.expenseDate,
    expense.category,
    expense.name,
    expense.paymentMethod || "",
    expense.vendor || "",
    money(expense.amount),
    expense.notes || ""
  ]);
}

function itemLabel(item) {
  const modifiers = item.modifiers?.length ? ` (${item.modifiers.join(", ")})` : "";
  return `${formatQty(item.qty)}x ${item.name}${modifiers}`;
}

function exportReportExcel() {
  if (!currentReport) return;
  const summaryRows = reportSummaryRows(currentReport);
  const lossRows = lossExportRows(currentReport);
  const expenses = expenseExportRows(currentReport);
  const transactionRows = transactionExportRows(currentReport);
  const html = `
    <html>
      <head><meta charset="UTF-8" /></head>
      <body>
        <h1>Laporan Laba Rugi - ${escapeHtml(currentReport.outletName)}</h1>
        <table border="1">
          <caption>Ringkasan Profit & Loss</caption>
          ${summaryRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
        </table>
        <br />
        <table border="1">
          <caption>Beban Operasional</caption>
          <tr><td>Tanggal</td><td>Kategori</td><td>Nama Beban</td><td>Metode</td><td>Vendor</td><td>Nominal</td><td>Catatan</td></tr>
          ${expenses.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
        </table>
        <br />
        <table border="1">
          <caption>Kerugian Stok Outlet</caption>
          <tr><td>Waktu</td><td>Bahan Outlet</td><td>Tipe</td><td>Qty</td><td>Nilai</td><td>Catatan</td></tr>
          ${lossRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
        </table>
        <br />
        <table border="1">
          <caption>Riwayat Transaksi</caption>
          <tr><td>Waktu</td><td>Item</td><td>Omzet</td><td>HPP</td><td>Laba</td></tr>
          ${transactionRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
        </table>
      </body>
    </html>
  `;
  downloadFile(`${reportFilename()}.xls`, "application/vnd.ms-excel", html);
}

function exportReportPdf() {
  if (!currentReport) return;
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  const summaryRows = reportSummaryRows(currentReport);
  const lossRows = lossExportRows(currentReport);
  const expenses = expenseExportRows(currentReport);
  const transactionRows = transactionExportRows(currentReport);
  printWindow.document.write(`
    <html>
      <head>
        <title>Laporan Laba Rugi - ${escapeHtml(currentReport.outletName)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #1d2329; }
          h1 { margin: 0 0 4px; font-size: 22px; }
          p { margin: 0 0 18px; color: #69727c; }
          h2 { margin-top: 22px; font-size: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #d7dde4; padding: 8px; text-align: left; }
          th { background: #f4f6f8; }
          .total { font-weight: 700; background: #17211f; color: #ffffff; }
        </style>
      </head>
      <body>
        <h1>Laporan Laba Rugi - ${escapeHtml(currentReport.outletName)}</h1>
        <p>Periode ${escapeHtml(currentReport.range.label)}</p>
        <h2>Ringkasan Profit & Loss</h2>
        <table>
          <tbody>
            ${summaryRows.map((row, index) => `<tr class="${index === summaryRows.length - 1 ? "total" : ""}"><td>${escapeHtml(row[0])}</td><td>${escapeHtml(row[1])}</td></tr>`).join("")}
          </tbody>
        </table>
        <h2>Kerugian Stok Outlet</h2>
        <table>
          <thead><tr><th>Waktu</th><th>Bahan Outlet</th><th>Tipe</th><th>Qty</th><th>Nilai</th><th>Catatan</th></tr></thead>
          <tbody>${lossRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
        <h2>Beban Operasional</h2>
        <table>
          <thead><tr><th>Tanggal</th><th>Kategori</th><th>Nama Beban</th><th>Metode</th><th>Vendor</th><th>Nominal</th><th>Catatan</th></tr></thead>
          <tbody>${expenses.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
        <h2>Riwayat Transaksi</h2>
        <table>
          <thead><tr><th>Waktu</th><th>Item</th><th>Omzet</th><th>HPP</th><th>Laba</th></tr></thead>
          <tbody>${transactionRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function downloadFile(filename, type, content) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "report";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fetchReport() {
  const response = loadPageBootstrap("reports", state, session, {
    view: "profit-loss",
    period: reportPeriod.value || "daily",
    anchor_date: reportAnchorDate.value || localDateValue()
  });
  if (!response?.ok) {
    throw new Error(response?.message || "Laporan belum bisa diambil dari database.");
  }
  return response.data?.report;
}

function renderStatement(report) {
  byId("pnl-statement").innerHTML = `
    <div class="pnl-header">
      <div>
        <span>${escapeHtml(report.outletName)}</span>
        <strong>Statement of Profit & Loss</strong>
        <small>Periode ${escapeHtml(report.range.label)} berdasarkan transaksi POS dan kartu stok outlet.</small>
      </div>
      <div class="pnl-badge">Accrual View</div>
    </div>

    <div class="pnl-section-label">Pendapatan</div>
    <div class="pnl-row">
      <span>Penjualan Bersih</span>
      <strong>${statementAmount(report.totals.revenue)}</strong>
    </div>
    <div class="pnl-row">
      <span>Termasuk Service Charge Dine In</span>
      <strong>${statementAmount(report.totals.serviceCharge)}</strong>
    </div>
    <div class="pnl-row">
      <span>Termasuk Item Kemasan Take Away</span>
      <strong>${statementAmount(report.totals.packagingFee)}</strong>
    </div>
    <div class="pnl-row">
      <span>Payment Fee Ditanggung Customer</span>
      <strong>${statementAmount(report.totals.paymentFeeCustomer || 0)}</strong>
    </div>

    <div class="pnl-section-label">Harga Pokok Penjualan</div>
    <div class="pnl-row expense-row">
      <span>HPP Bahan Terpakai</span>
      <strong>${statementAmount(report.totals.cogs, { parentheses: true })}</strong>
    </div>
    <div class="pnl-row total-row">
      <span>Laba Kotor</span>
      <strong>${statementAmount(report.totals.profit)}</strong>
    </div>

    <div class="pnl-section-label">Beban Payment</div>
    <div class="pnl-row expense-row">
      <span>Payment Fee Ditanggung Merchant</span>
      <strong>${statementAmount(report.totals.paymentFeeMerchant || 0, { parentheses: true })}</strong>
    </div>

    <div class="pnl-section-label">Beban Stok Outlet</div>
    <div class="pnl-row expense-row">
      <span>Waste / Expired</span>
      <strong>${statementAmount(report.wasteLoss, { parentheses: true })}</strong>
    </div>
    <div class="pnl-row ${report.netAdjustment < 0 ? "expense-row" : "income-row"}">
      <span>Koreksi Stok Bersih</span>
      <strong>${statementAmount(report.netAdjustment)}</strong>
    </div>

    <div class="pnl-section-label">Beban Operasional</div>
    ${(report.finance?.expenseSummary || []).length
      ? report.finance.expenseSummary.map((row) => `
        <div class="pnl-row expense-row">
          <span>${escapeHtml(row.category)}</span>
          <strong>${statementAmount(row.amount, { parentheses: true })}</strong>
        </div>
      `).join("")
      : `<div class="pnl-row"><span>Belum ada beban operasional</span><strong>${money(0)}</strong></div>`}

    <div class="pnl-row grand-total-row">
      <span>Laba Operasional</span>
      <strong>${statementAmount(report.operatingProfit)}</strong>
    </div>
  `;
}

function renderLossTable(report) {
  byId("loss-table").innerHTML = report.lossMovements.length
    ? report.lossMovements
        .map((movement) => `
          <tr>
            <td>${shortDate.format(new Date(movement.createdAt))}</td>
            <td><strong>${escapeHtml(movement.ingredientName || "Bahan outlet tidak ditemukan")}</strong></td>
            <td>${escapeHtml(movementTypeLabel(movement))}</td>
            <td>${escapeHtml(`${formatQty(movement.qty)} ${movement.unit || ""}`.trim())}</td>
            <td>${money(movementCost(movement))}</td>
            <td>${escapeHtml(movement.note || "")}</td>
          </tr>
        `)
        .join("")
    : `<tr><td colspan="6">Belum ada waste, expired, atau koreksi stok pada periode ini.</td></tr>`;
}

function renderTransactionTable(report) {
  byId("transaction-table").innerHTML = report.transactions.length
    ? report.transactions
        .map((trx) => `
          <tr>
            <td>${shortDate.format(new Date(trx.createdAt))}</td>
            <td>${escapeHtml(trx.items.map(itemLabel).join(", "))}</td>
            <td>${money(trx.revenue)}</td>
            <td>${money(trx.cogs)}</td>
            <td>${money(trx.profit)}</td>
          </tr>
        `)
        .join("")
    : `<tr><td colspan="5">Belum ada transaksi pada periode ini.</td></tr>`;
}

function renderEmptyReport(message) {
  setText("report-period-label", "-");
  setText("report-outlet-label", "-");
  setText("report-revenue", money(0));
  setText("report-cogs", money(0));
  setText("report-gross-profit", money(0));
  setText("report-waste", money(0));
  setText("report-adjustment", money(0));
  setText("report-operating-profit", money(0));
  setText("report-operating-expenses", money(0));
  setText("report-net-cash", money(0));
  byId("pnl-statement").innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  byId("loss-table").innerHTML = `<tr><td colspan="6">${escapeHtml(message)}</td></tr>`;
  byId("transaction-table").innerHTML = `<tr><td colspan="5">${escapeHtml(message)}</td></tr>`;
  currentReport = null;
}

function renderReport() {
  try {
    const report = fetchReport();
    currentReport = report;

    setText("report-period-label", report.range.label);
    setText("report-outlet-label", report.outletName);
    setText("report-revenue", money(report.totals.revenue));
    setText("report-cogs", money(report.totals.cogs));
    setText("report-gross-profit", money(report.totals.profit));
    setText("report-waste", money(report.wasteLoss));
    setText("report-adjustment", money(report.netAdjustment));
    setText("report-operating-profit", money(report.operatingProfit));
    setText("report-operating-expenses", money(report.totals.operatingExpenses || 0));
    setText("report-net-cash", money(report.finance?.netCashMovement || 0));

    renderStatement(report);
    renderLossTable(report);
    renderTransactionTable(report);
    applyPermissionControls(document, state, session);
    enhanceAllDataTables();
  } catch (error) {
    renderEmptyReport(error.message);
  }
}

reportAnchorDate.value = localDateValue();
reportPeriod.addEventListener("change", renderReport);
reportAnchorDate.addEventListener("change", renderReport);
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-export-report]");
  if (!button) return;
  if (button.dataset.exportReport === "excel") exportReportExcel();
  if (button.dataset.exportReport === "pdf") exportReportPdf();
});
renderReport();
