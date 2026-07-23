import { renderLayout } from "../layout.js?v=coffee-v151";
import { apiGet, canUsePermission, loadSession, loadState, scopedApiUrl } from "../store.js?v=coffee-v151";
import { money } from "../format.js";
import { byId } from "../dom.js";

renderLayout();

const today = new Date();
let currentDashboardData = null;

function exists(id) {
  return Boolean(byId(id));
}

function writeText(id, value) {
  if (exists(id)) byId(id).textContent = value;
}

function writeHtml(id, value) {
  if (exists(id)) byId(id).innerHTML = value;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusClass(status) {
  return status === "warning" ? "status-warning" : status === "danger" ? "status-empty" : "status-ok";
}

function drawSalesChart() {
  if (!exists("sales-chart") || !currentDashboardData) return;
  const canvas = byId("sales-chart");
  const context = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 640;
  const height = 220;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  context.scale(ratio, ratio);

  const days = (currentDashboardData.chart?.length ? currentDashboardData.chart : Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    return { date: date.toISOString().slice(0, 10), revenue: 0 };
  })).map((day) => ({ date: new Date(day.date), revenue: Number(day.revenue || 0) }));
  const max = Math.max(...days.map((day) => day.revenue), 1);
  const padding = { top: 18, right: 16, bottom: 30, left: 40 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const points = days.map((day, index) => ({
    x: padding.left + (plotWidth / Math.max(days.length - 1, 1)) * index,
    y: padding.top + plotHeight - (day.revenue / max) * plotHeight
  }));

  context.clearRect(0, 0, width, height);
  context.strokeStyle = "#eee6de";
  context.lineWidth = 1;
  for (let index = 0; index <= 3; index += 1) {
    const y = padding.top + (plotHeight / 3) * index;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
  }

  context.beginPath();
  context.moveTo(points[0].x, padding.top + plotHeight);
  points.forEach((point) => context.lineTo(point.x, point.y));
  context.lineTo(points.at(-1).x, padding.top + plotHeight);
  context.closePath();
  const fill = context.createLinearGradient(0, padding.top, 0, height);
  fill.addColorStop(0, "rgba(142, 73, 25, .22)");
  fill.addColorStop(1, "rgba(142, 73, 25, 0)");
  context.fillStyle = fill;
  context.fill();

  context.beginPath();
  points.forEach((point, index) => (index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)));
  context.strokeStyle = "#3B1F8C";
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = "#3B1F8C";
  points.forEach((point) => {
    context.beginPath();
    context.arc(point.x, point.y, 3, 0, Math.PI * 2);
    context.fill();
  });

  context.fillStyle = "#82756a";
  context.font = "9px Inter, sans-serif";
  context.textAlign = "center";
  days.forEach((day, index) => {
    context.fillText(day.date.toLocaleDateString("id-ID", { day: "numeric", month: "short" }), points[index].x, height - 8);
  });
}

function refreshDashboard() {
  const state = loadState();
  const session = loadSession();
  const response = apiGet(scopedApiUrl("/api/dashboard", state, session));
  if (!response || !response.ok) return;

  const dashboard = response.data || null;
  currentDashboardData = dashboard;
  const metrics = dashboard?.metrics || { revenue: 0, transactions: 0, profit: 0, productsSold: 0, lowStock: 0 };

  writeText("metric-revenue", money(metrics.revenue));
  writeText("metric-transactions", Number(metrics.transactions || 0).toLocaleString("id-ID"));
  writeText("metric-profit", money(metrics.profit));
  writeText("metric-products-sold", Number(metrics.productsSold || 0).toLocaleString("id-ID"));

  const operations = dashboard?.operations || {};
  const paymentMethods = dashboard?.integrations?.paymentMethods || [];
  const moduleCards = [
    canUsePermission("pos.transaction", "read", state, session) ? { name: "POS", value: Number(metrics.transactions || 0), note: "Transaksi hari ini", status: "ok" } : null,
    canUsePermission("queue.kitchen", "read", state, session) ? { name: "Kitchen", value: Number(operations.kitchenQueue || 0), note: "Antrian aktif", status: operations.kitchenQueue ? "warning" : "ok" } : null,
    canUsePermission("inventory.overview", "read", state, session) ? { name: "Inventory", value: Number(metrics.lowStock || 0), note: "Stok menipis", status: metrics.lowStock ? "warning" : "ok" } : null,
    Number(operations.activeTables || 0) > 0 && canUsePermission("settings.tables", "read", state, session) ? { name: "Table Service", value: Number(operations.openTables || 0), note: "Open bill berjalan", status: operations.openTables ? "warning" : "ok" } : null,
    paymentMethods.length && canUsePermission("settings.payment", "read", state, session) ? { name: "Payment", value: Number(operations.paymentPending || 0), note: "Pembayaran tertunda", status: operations.paymentPending ? "warning" : "ok" } : null,
  ].filter(Boolean);
  byId("dashboard-module-panel").hidden = moduleCards.length === 0;

  writeHtml("esb-module-grid", moduleCards.map((item) => `
    <article class="esb-module-card ${item.status}">
      <span>${escapeHtml(item.name)}</span>
      <strong>${typeof item.value === "number" ? item.value.toLocaleString("id-ID") : escapeHtml(item.value)}</strong>
      <small>${escapeHtml(item.note)}</small>
    </article>
  `).join(""));

  const riskSignals = (dashboard?.riskSignals || [])
    .filter((item) => Number(item.value || 0) > 0)
    .filter((item) => {
      if (item.label === "Payment Pending") return canUsePermission("settings.payment", "read", state, session) || canUsePermission("pos.payment", "read", state, session);
      if (item.label === "Open Bill") return canUsePermission("pos.transaction", "read", state, session);
      if (item.label === "Low Stock") return canUsePermission("inventory.overview", "read", state, session);
      return false;
    });
  byId("dashboard-attention-panel").hidden = riskSignals.length === 0;
  const controlPanelCount = Number(moduleCards.length > 0) + Number(riskSignals.length > 0);
  byId("dashboard-control-grid").hidden = controlPanelCount === 0;
  byId("dashboard-control-grid").classList.toggle("single-panel", controlPanelCount === 1);

  writeHtml("esb-risk-list", riskSignals.map((item) => `
    <article class="esb-risk-item">
      <span class="status-pill ${statusClass(item.severity)}">${item.severity === "danger" ? "Kritis" : "Perhatian"}</span>
      <div>
        <strong>${escapeHtml(item.label)}</strong>
        <small>${escapeHtml(item.note)}</small>
      </div>
      <b>${Number(item.value || 0).toLocaleString("id-ID")}</b>
    </article>
  `).join(""));

  const integrations = paymentMethods.map((item) => ({
    name: item.name,
    label: `${item.provider || "manual"} · ${item.type}`,
    note: Number(item.feeRate || 0) ? `MDR ${item.feeRate}% · ${item.feePayer === "customer" ? "Customer" : "Merchant"}` : "Tanpa MDR",
    status: "connected",
  }));
  byId("dashboard-payment-panel").hidden = integrations.length === 0 || !canUsePermission("settings.payment", "read", state, session);

  writeHtml("esb-integration-grid", integrations.map((item) => `
    <article class="esb-integration-card">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.name)}</strong>
      <small>${escapeHtml(item.note)}</small>
    </article>
  `).join(""));

  const topProducts = dashboard?.topProducts || [];
  byId("dashboard-top-products-panel").hidden = topProducts.length === 0;
  writeHtml("top-product-list", topProducts
    .map(
      (item, index) => `
        <article class="ranking-item">
          <span class="menu-thumbnail">${index + 1}</span>
          <strong>${item.name}</strong>
          <b>${item.qty}</b>
        </article>
      `
    )
    .join(""));

  const lowStock = dashboard?.lowStockItems || [];
  const lowStockCount = Number(metrics.lowStock || 0);
  writeText("low-stock-summary", lowStockCount ? `${lowStockCount} perlu perhatian` : "Lihat semua");
  byId("dashboard-low-stock-panel").hidden = lowStock.length === 0 || !canUsePermission("inventory.overview", "read", state, session);
  writeHtml("dashboard-low-stock", lowStock
    .map((item) => {
      const percentage = Math.min(100, (Number(item.stock || 0) / Math.max(Number(item.minStock || 0), 1)) * 100);
      const danger = item.stock <= item.minStock;
      return `
        <article class="low-stock-item">
          <div>
            <span class="ingredient-thumbnail"></span>
            <strong>${item.name}</strong>
            <b>${Number(item.stock || 0).toLocaleString("id-ID")} / ${Number(item.minStock || 0).toLocaleString("id-ID")} ${item.unit}</b>
          </div>
          <span class="stock-progress"><i class="${danger ? "danger" : ""}" style="width:${percentage}%"></i></span>
        </article>
      `;
    })
    .join(""));

  const operationalPanelCount = 1
    + Number(!byId("dashboard-top-products-panel").hidden)
    + Number(!byId("dashboard-low-stock-panel").hidden);
  byId("dashboard-operational-grid").dataset.panels = String(operationalPanelCount);

  drawSalesChart();
}

refreshDashboard();
window.addEventListener("resize", drawSalesChart);

setInterval(refreshDashboard, 30000);
