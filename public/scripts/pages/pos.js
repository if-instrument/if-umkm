import { renderLayout } from "../layout.js?v=coffee-v137";
import { apiGet, apiPost, apiPut, applyPermissionControls, canUsePermission, loadSession, loadState, primaryOutletId, scopedApiUrl, scopedPayload, visibleForSession } from "../store.js?v=coffee-v137";
import { formatQty, money } from "../format.js";
import { costingMethod, effectiveRecipe, ingredientCostForQty, ingredientUnitCost, isStockedProduct, modifierPrice, productAvailability, productAvailabilityWithModifiers, productById, productCogs, productCogsWithModifiers, productModifierOptions } from "../inventory.js";
import { byId, showAlert } from "../dom.js";
import { ORDER_STATUS, orderStatusCode, orderStatusIn, orderStatusIs } from "../order-status.js";

renderLayout();

const state = loadState();
const session = loadSession();
const focusOrderId = new URLSearchParams(window.location.search).get("order") || "";
let cart = [];
let productSearch = "";
let productCategory = "all";
let paymentMethod = "";
let serviceType = "Take Away";
let packagingOverride = null;
let packagingManualLines = [];
let packagingResolution = { source: "automatic", note: "" };
let activeOpenOrderId = "";
let editingOrderId = "";
let editingPackagingManualId = "";
let modifierEditingLineId = "";
let pendingPayment = null;
let paymentIntentContext = null;
let paymentPollTimer = null;
let autoCheckoutInProgress = false;
let expandedPosOrderId = "";

function qrImageUrl(payload, size = 320) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=12&data=${encodeURIComponent(payload || "")}`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function looksLikeQrisPayload(payload = "") {
  const value = String(payload || "").trim();
  return value.startsWith("000201") && value.includes("5802ID") && value.length >= 80;
}

function activeOutletName() {
  return state.settings?.outletName || state.settings?.companyName || "Outlet";
}

function activeOutletCode() {
  return state.settings?.outletCode || "";
}

function activeOutletAddress() {
  return state.settings?.outletAddress || "";
}

function activeOutletLabel() {
  return activeOutletCode() ? `${activeOutletName()} (${activeOutletCode()})` : activeOutletName();
}

function activeCompanyLogo() {
  return state.settings?.companyLogoUrl || "/assets/if-instrument-logo.jpg";
}

const queueStatuses = {
  [ORDER_STATUS.WAITING]: { label: "Pesanan Baru", owner: "Kitchen", next: ORDER_STATUS.PREPARING, nextLabel: "Mulai Proses" },
  [ORDER_STATUS.PREPARING]: { label: "Sedang Diproses", owner: "Kitchen", next: ORDER_STATUS.READY, nextLabel: "Tandai Siap" },
  [ORDER_STATUS.READY]: { label: "Siap Diambil", owner: "Kasir", next: ORDER_STATUS.COMPLETED, nextLabel: "Pesanan Diambil" }
};

const approvalStatus = { label: "Menunggu Approve", owner: "Kasir", nextLabel: "Approve & Bayar" };

const serviceChannelOptions = [
  { key: "dineIn", label: "Dine In", prefix: "DI" },
  { key: "takeAway", label: "Take Away", prefix: "TA" },
  { key: "delivery", label: "Delivery", prefix: "DL" }
];

function applySalesData(data) {
  if (!data) return;
  if (data.settings) state.settings = data.settings;
  if (Array.isArray(data.categories)) state.categories = data.categories;
  if (Array.isArray(data.products)) state.products = data.products;
  if (Array.isArray(data.modifiers)) state.modifiers = data.modifiers;
  if (Array.isArray(data.ingredients)) state.ingredients = data.ingredients;
  if (Array.isArray(data.stockMovements)) state.stockMovements = data.stockMovements;
  if (Array.isArray(data.transactions)) state.transactions = data.transactions;
}

function combinePackagingLines(lines) {
  const combined = new Map();
  lines.forEach((line) => {
    if (!line?.ingredientId || Number(line.qty || 0) <= 0) return;
    const key = `${line.ingredientId}:${Number(line.price) || 0}:${line.treatment || ""}:${line.reason || ""}`;
    const current = combined.get(key) || { ...line, qty: 0 };
    current.qty += Number(line.qty) || 0;
    combined.set(key, current);
  });
  return [...combined.values()];
}

function refreshSales() {
  const settings = apiGet(scopedApiUrl("/api/setting", state, session));
  const tables = apiGet(scopedApiUrl("/api/dining-table?per_page=100", state, session));
  const payments = apiGet(scopedApiUrl("/api/payment-method?per_page=100", state, session));
  const packaging = apiGet(scopedApiUrl("/api/packaging-rule?per_page=100", state, session));
  const categories = apiGet(scopedApiUrl("/api/category?per_page=100", state, session));
  const products = apiGet(scopedApiUrl("/api/product?per_page=100", state, session));
  const modifiers = apiGet(scopedApiUrl("/api/modifier?per_page=100", state, session));
  const ingredients = apiGet(scopedApiUrl("/api/ingredient?per_page=100", state, session));
  const movements = apiGet(scopedApiUrl("/api/stock-movement?per_page=100", state, session));
  const orders = apiGet(scopedApiUrl("/api/order?per_page=100", state, session));
  applySalesData({
    settings: { ...(settings?.data || {}), diningTables: tables?.data?.items || [], paymentMethods: payments?.data?.items || [], packagingRules: packaging?.data?.items || [] },
    categories: categories?.data?.items || [],
    products: products?.data?.items || [],
    modifiers: modifiers?.data?.items || [],
    ingredients: ingredients?.data?.items || [],
    stockMovements: movements?.data?.items || [],
    transactions: orders?.data?.items || []
  });
}

function activeServiceChannels() {
  const channels = state.settings.orderChannels || { dineIn: false, takeAway: true, delivery: false };
  const active = serviceChannelOptions.filter((item) => channels[item.key] === true || (item.key === "takeAway" && channels.takeAway !== false));
  return active.length ? active : serviceChannelOptions.filter((item) => item.key === "takeAway");
}

function normalizeServiceType() {
  const active = activeServiceChannels();
  if (!active.some((item) => item.label === serviceType)) {
    serviceType = active[0].label;
  }
}

function renderServiceModes() {
  normalizeServiceType();
  const container = document.querySelector(".service-modes");
  if (!container) return;
  container.innerHTML = activeServiceChannels()
    .map((item) => `<button class="service-mode ${item.label === serviceType ? "active" : ""}" data-service-type="${item.label}" type="button">${item.label}</button>`)
    .join("");
}

function postSales(url, payload) {
  const response = apiPost(url, scopedPayload(payload, state, session));
  if (!response?.ok) throw new Error(response?.message || "Aksi sales belum berhasil disimpan.");
  refreshSales();
  return response.data;
}

function putSales(url, payload) {
  const response = apiPut(url, scopedPayload(payload, state, session));
  if (!response?.ok) throw new Error(response?.message || "Aksi sales belum berhasil disimpan.");
  refreshSales();
  return response.data;
}

function canActOnOrderStatus(status) {
  const code = orderStatusCode(status);
  if (code === ORDER_STATUS.PENDING_CASHIER) return canUsePermission("queue.cashier", "update", state, session);
  if ([ORDER_STATUS.WAITING, ORDER_STATUS.PREPARING].includes(code)) return canUsePermission("queue.kitchen", "update", state, session);
  if (code === ORDER_STATUS.READY) return canUsePermission("queue.cashier", "update", state, session);
  return false;
}

function isToday(value) {
  return new Date(value).toDateString() === new Date().toDateString();
}

function queueElapsed(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Baru saja";
  if (minutes < 60) return `${minutes} menit`;
  return `${Math.floor(minutes / 60)}j ${minutes % 60}m`;
}

function formatOrderDateTime(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function queueTime(order) {
  return new Date(order.statusUpdatedAt || order.createdAt).getTime();
}

function activeQueueOrders() {
  return state.transactions
    .filter((order) => visibleForSession(order, state, session))
    .filter((order) => queueStatuses[orderStatusCode(order.status)])
    .sort((a, b) => queueTime(a) - queueTime(b));
}

function pendingApprovalOrders() {
  return state.transactions
    .filter((order) => visibleForSession(order, state, session))
    .filter((order) => orderStatusIs(order.status, ORDER_STATUS.PENDING_CASHIER))
    .sort((a, b) => queueTime(a) - queueTime(b));
}

function renderApprovalCount() {
  byId("pos-approval-count").textContent = pendingApprovalOrders().length;
}

function canEditOrder(order) {
  return orderStatusIn(order.status, [ORDER_STATUS.PENDING_CASHIER, ORDER_STATUS.WAITING]) && order.paymentStatus === "unpaid";
}

function renderPosQueue() {
  const orders = activeQueueOrders();
  byId("pos-queue-count").textContent = orders.length;
  renderApprovalCount();
  byId("pos-queue-summary").innerHTML = Object.entries(queueStatuses).map(([status, config]) => `
    <article class="pos-queue-summary-${status}"><span>${config.label}</span><strong>${orders.filter((order) => order.status === status).length}</strong></article>
  `).join("");
  byId("pos-queue-board").innerHTML = Object.entries(queueStatuses).map(([status, config]) => {
    const statusOrders = orders.filter((order) => orderStatusIs(order.status, status));
    return `
      <section class="pos-queue-column column-${status}">
        <header><div><span>${config.owner}</span><h4>${config.label}</h4></div><strong>${statusOrders.length}</strong></header>
        <div class="pos-queue-column-list">
          ${statusOrders.length ? statusOrders.map((order) => `
            <article class="pos-queue-card status-${status}">
              <div class="pos-queue-card-heading">
                <div><strong>#${order.orderNumber}</strong><span>${order.serviceType}${order.tableName !== "-" ? ` · ${order.tableName}` : order.customerName ? ` · ${order.customerName}` : ""}</span></div>
                <span class="pos-queue-age">${queueElapsed(order.createdAt)}</span>
              </div>
              <div class="pos-queue-card-actions">
                ${canEditOrder(order) ? `<button class="ghost-button compact-button" data-pos-order-edit="${order.id}" data-permission="pos.orderEdit:update" type="button">Edit</button>` : ""}
                <button class="pos-queue-action" data-pos-order-detail="${order.id}" type="button">${expandedPosOrderId === order.id ? "Tutup Detail" : "Detail"}</button>
              </div>
              ${expandedPosOrderId === order.id ? posOrderDetailMarkup(order) : ""}
            </article>
          `).join("") : `<div class="pos-queue-empty">Belum ada pesanan</div>`}
        </div>
      </section>
    `;
  }).join("");
  applyPermissionControls(document, state, session);
}

function renderPosApprovals() {
  const orders = pendingApprovalOrders();
  byId("pos-approval-count").textContent = orders.length;
  byId("pos-approval-list").innerHTML = orders.length ? orders.map((order) => {
    const itemCount = orderItemCount(order);
    const expanded = expandedPosOrderId === order.id;
    return `
      <article class="pos-queue-card status-${ORDER_STATUS.PENDING_CASHIER}">
        <div class="pos-queue-card-heading">
          <div><strong>#${order.orderNumber}</strong><span>${order.serviceType}${order.tableName !== "-" ? ` · ${order.tableName}` : order.customerName ? ` · ${order.customerName}` : ""}</span></div>
          <span class="pos-queue-age">${queueElapsed(order.createdAt)}</span>
        </div>
        <div class="pos-queue-card-count">
          <span>Total</span><strong>${money(order.total || 0)}</strong><span>${itemCount} item · stok di-hold</span>
        </div>
        <div class="pos-queue-card-actions">
          <button class="pos-queue-action" data-pos-approval-detail="${order.id}" type="button">${expanded ? "Tutup Detail" : "Detail"}</button>
        </div>
        ${expanded ? posOrderDetailMarkup(order) : ""}
      </article>
    `;
  }).join("") : `<div class="pos-queue-empty">Belum ada pesanan online yang menunggu approve.</div>`;
  applyPermissionControls(document, state, session);
}

function posOrderVisibleItems(order) {
  return orderStatusIs(order.status, ORDER_STATUS.COMPLETED) ? (order.items || []) : (order.lastOrderItems || order.items || []);
}

function posOrderItemKey(item, index) {
  return `${item.productId || item.name}-${index}`;
}

function posOrderItemRecipe(item) {
  if (item.isPackaging) {
    const ingredient = state.ingredients.find((entry) => entry.id === item.ingredientId);
    return ingredient ? [{ name: ingredient.name, unit: ingredient.unit, qty: item.qty }] : [];
  }
  const product = productById(state, item.productId);
  if (!product || isStockedProduct(product)) return [];
  const modifierIds = item.modifierIds || productModifierOptions(state, product)
    .filter((modifier) => (item.modifiers || []).includes(modifier.name))
    .map((modifier) => modifier.id);
  return effectiveRecipe(product, modifierIds, state).map((line) => {
    const ingredient = state.ingredients.find((entry) => entry.id === line.ingredientId);
    return { name: ingredient?.name || "Bahan tidak ditemukan", unit: ingredient?.unit || "", qty: line.qty * item.qty };
  });
}

function posOrderPreparationItems(order) {
  return posOrderVisibleItems(order).map((item, index) => {
    const itemKey = posOrderItemKey(item, index);
    const checked = (order.readyItemKeys || []).includes(itemKey);
    const product = productById(state, item.productId);
    const showRecipe = item.isPackaging || !product || !isStockedProduct(product);
    const recipeRows = showRecipe ? posOrderItemRecipe(item) : [];
    return `
      <article class="preparation-item ${checked ? "ready" : ""}">
        <label class="preparation-item-heading">
          ${orderStatusIs(order.status, ORDER_STATUS.PREPARING) && canActOnOrderStatus(order.status) ? `<input data-pos-ready-item="${itemKey}" data-pos-ready-order="${order.id}" type="checkbox" ${checked ? "checked" : ""} />` : ""}
          <span><strong>${item.qty}x ${item.name}</strong>${item.modifiers?.length ? `<small>${item.modifiers.join(", ")}</small>` : ""}</span>
        </label>
        ${showRecipe ? `<div class="preparation-ingredients">${recipeRows.map((ingredient) => `<div><span>${ingredient.name}</span><strong>${formatQty(ingredient.qty)} ${ingredient.unit}</strong></div>`).join("") || `<p>Recipe belum tersedia.</p>`}</div>` : ""}
      </article>
    `;
  }).join("");
}

function posOrderDetailMarkup(order) {
  if (!order) return;
  const status = orderStatusCode(order.status);
  const config = queueStatuses[status] || approvalStatus;
  const visibleItems = posOrderVisibleItems(order);
  const allReady = visibleItems.every((item, index) => (order.readyItemKeys || []).includes(posOrderItemKey(item, index)));
  const canAct = canActOnOrderStatus(order.status);
  const actionDisabled = orderStatusIs(order.status, ORDER_STATUS.PREPARING) && !allReady;
  return `
    <div class="pos-queue-card-detail">
      <div class="selected-order-meta">
        <article><span>PIC</span><strong>${config.owner}</strong></article>
        <article><span>Status</span><strong>${config.label}</strong></article>
        ${orderStatusIs(order.status, ORDER_STATUS.PENDING_CASHIER) ? `<article><span>Nama</span><strong>${order.customerName || "-"}</strong></article><article><span>Tanggal Pesan</span><strong>${formatOrderDateTime(order.createdAt)}</strong></article>` : ""}
        <article><span>Pembayaran</span><strong>${order.paymentMethod || "-"}</strong></article>
        ${order.packagingNote ? `<article><span>Packaging</span><strong>${order.packagingNote}</strong></article>` : ""}
      </div>
      ${orderStatusIs(order.status, ORDER_STATUS.PREPARING) ? `<div class="preparation-note">${canAct ? "Centang setiap produk yang sudah selesai dibuat." : "Checklist produksi hanya bisa dilakukan oleh user Kitchen."}</div>` : ""}
      <div class="preparation-list">${posOrderPreparationItems(order)}</div>
      <div class="modal-actions order-detail-actions">
        <button class="ghost-button" data-pos-order-detail="${order.id}" type="button">Tutup</button>
        ${orderStatusIs(order.status, ORDER_STATUS.PENDING_CASHIER) && canEditOrder(order) ? `<button class="ghost-button" data-pos-order-edit="${order.id}" data-permission="pos.orderEdit:update" type="button">Edit</button>` : ""}
        ${orderStatusIs(order.status, ORDER_STATUS.PENDING_CASHIER) && canAct ? `<button class="ghost-button danger-button" data-pos-order-reject="${order.id}" type="button">Reject</button><button class="primary-button" data-pos-order-approve="${order.id}" type="button">${approvalStatus.nextLabel}</button>` : ""}
        ${config.next && canAct ? `<button class="primary-button" data-pos-order-status="${order.id}" data-next-status="${config.next}" ${actionDisabled ? "disabled" : ""} type="button">${config.nextLabel}</button>` : ""}
      </div>
    </div>
  `;
}

function openPosOrderDetail(order) {
  if (!order) return;
  expandedPosOrderId = expandedPosOrderId === order.id ? "" : order.id;
  if (orderStatusIs(order.status, ORDER_STATUS.PENDING_CASHIER)) renderPosApprovals();
  else renderPosQueue();
}

function closePosOrderDetail() {
  expandedPosOrderId = "";
  renderPosQueue();
  renderPosApprovals();
}

function openPosQueue() {
  renderPosQueue();
  document.querySelector("[data-pos-queue-backdrop]").hidden = false;
  byId("pos-queue-drawer").hidden = false;
  document.body.classList.add("pos-queue-open");
}

function closePosQueue() {
  document.querySelector("[data-pos-queue-backdrop]").hidden = true;
  byId("pos-queue-drawer").hidden = true;
  expandedPosOrderId = "";
  document.body.classList.remove("pos-queue-open");
}

function openPosApprovals() {
  renderPosApprovals();
  document.querySelector("[data-pos-approval-backdrop]").hidden = false;
  byId("pos-approval-drawer").hidden = false;
  document.body.classList.add("pos-queue-open");
}

function closePosApprovals() {
  document.querySelector("[data-pos-approval-backdrop]").hidden = true;
  byId("pos-approval-drawer").hidden = true;
  expandedPosOrderId = "";
  document.body.classList.remove("pos-queue-open");
}

function focusOrderFromUrl() {
  if (!focusOrderId) return;
  const order = state.transactions.find((item) => item.id === focusOrderId && visibleForSession(item, state, session));
  if (!order) return;
  expandedPosOrderId = order.id;
  if (orderStatusIs(order.status, ORDER_STATUS.PENDING_CASHIER)) openPosApprovals();
  else if (queueStatuses[orderStatusCode(order.status)]) openPosQueue();
}

function openPosTables() {
  renderOpenTableSessions();
  document.querySelector("[data-pos-table-backdrop]").hidden = false;
  byId("pos-table-drawer").hidden = false;
  document.body.classList.add("pos-queue-open");
}

function closePosTables() {
  document.querySelector("[data-pos-table-backdrop]").hidden = true;
  byId("pos-table-drawer").hidden = true;
  document.body.classList.remove("pos-queue-open");
}

function renderCategories() {
  const categories = state.categories.filter((category) => visibleForSession(category, state, session) && category.status === "active");
  byId("pos-category-tabs").innerHTML = `
    <button class="${productCategory === "all" ? "active" : ""}" data-pos-category="all" type="button">Semua</button>
    ${categories.map((category) => `<button class="${productCategory === category.id ? "active" : ""}" data-pos-category="${category.id}" type="button">${category.name}</button>`).join("")}
  `;
}

function activeDiningTables() {
  return (state.settings.diningTables || [])
    .filter((table) => table.status === "active")
    .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0) || a.name.localeCompare(b.name));
}

function activePaymentMethods() {
  return (state.settings.paymentMethods || [])
    .filter((method) => method.status === "active")
    .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0) || a.name.localeCompare(b.name));
}

function selectedPaymentMethod() {
  return activePaymentMethods().find((method) => method.name === paymentMethod) || null;
}

function selectedPaymentType() {
  return selectedPaymentMethod()?.type || "";
}

function paymentFeeFor(baseAmount) {
  const method = selectedPaymentMethod();
  const rate = Number(method?.feeRate || 0);
  const payer = method?.feePayer || "merchant";
  const rateDecimal = rate / 100;
  const fee = baseAmount > 0 && rate > 0
    ? (payer === "customer" && rateDecimal < 1
      ? Math.round((baseAmount / (1 - rateDecimal)) - baseAmount)
      : Math.round(baseAmount * rateDecimal))
    : 0;
  return {
    amount: fee,
    payer,
    rate,
  };
}

function selectedPaymentGatewayLabel() {
  const method = selectedPaymentMethod();
  if (method?.type === "qris") {
    return method.qrisMode === "offline" ? "QRIS Static / Manual" : `${paymentGatewayLabel(state.settings?.paymentGateway?.provider)} Online`;
  }
  if (method?.type === "card") {
    if (method.cardMode === "online") return `${paymentGatewayLabel(state.settings?.paymentGateway?.provider)} Online`;
    return method.channelCode ? `EDC ${method.channelCode}` : "Manual EDC";
  }
  const labels = { xendit: "Xendit", midtrans: "Midtrans", manual: "Manual" };
  return labels[state.settings?.paymentGateway?.provider] || "Manual";
}

function paymentGatewayLabel(provider) {
  return ({ xendit: "Xendit", midtrans: "Midtrans", manual: "Manual" })[provider] || "Gateway";
}

function isCashPayment() {
  return selectedPaymentType() === "cash" || /^cash$/i.test(paymentMethod || "");
}

function isThirdPartyPayment() {
  return ["qris", "card"].includes(selectedPaymentType());
}

function isQrisPayment() {
  return selectedPaymentType() === "qris";
}

function isOfflineQrisPayment() {
  const method = selectedPaymentMethod();
  return method?.type === "qris" && method.qrisMode === "offline";
}

function isCardPayment() {
  return selectedPaymentType() === "card";
}

function setActivePaymentMethod(name) {
  paymentMethod = name || activePaymentMethods()[0]?.name || "";
}

function updateBillCashChange() {
  const tendered = Number(byId("bill-cash-tendered")?.value || 0);
  const total = Number(byId("bill-cash-tendered")?.dataset.total || 0);
  const change = Math.max(tendered - total, 0);
  if (byId("bill-cash-change")) byId("bill-cash-change").textContent = money(change);
}

function isAssignedPayLater() {
  return serviceType === "Dine In" && state.settings.tableServiceMode === "assigned_pay_later";
}

function isFreeSeatingDineIn() {
  return serviceType === "Dine In" && state.settings.tableServiceMode === "free_seating_pay_first";
}

function usesNameCodeField() {
  return serviceType === "Take Away" || serviceType === "Delivery" || isFreeSeatingDineIn();
}

function needsPackaging() {
  return serviceType === "Take Away" || serviceType === "Delivery";
}

function isPackagingIngredient(item) {
  return String(item?.category || item?.templateCategory || "").toLowerCase() === "packaging";
}

function orderLevelPackagingIngredientIds() {
  return new Set((state.settings.packagingRules || [])
    .filter((rule) => rule.status !== "inactive")
    .flatMap((rule) => [...(rule.items || []), ...(rule.fallbackItems || [])])
    .map((item) => item.ingredientId)
    .filter(Boolean));
}

function isOrderLevelPackagingIngredient(item) {
  return isPackagingIngredient(item) && orderLevelPackagingIngredientIds().has(item?.id);
}

function automaticOrderCode() {
  const option = serviceChannelOptions.find((item) => item.label === serviceType) || serviceChannelOptions[1];
  const count = state.transactions.filter((order) => order.serviceType === serviceType && isToday(order.createdAt)).length + 1;
  return `${option.prefix}-${String(count).padStart(3, "0")}`;
}

function openTableOrders() {
  return state.transactions
    .filter((order) => visibleForSession(order, state, session))
    .filter((order) => order.serviceType === "Dine In" && order.paymentStatus === "unpaid")
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function openOrderForTable(tableName) {
  return openTableOrders().find((order) => order.tableName === tableName);
}

function occupiedTableNames() {
  return new Set(openTableOrders().map((order) => order.tableName));
}

function activeOpenOrder() {
  return openTableOrders().find((order) => order.id === activeOpenOrderId) || null;
}

function editingOrder() {
  return state.transactions.find((order) => order.id === editingOrderId && canEditOrder(order)) || null;
}

function orderItemCount(order) {
  return (order.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
}

function renderDiningTableOptions() {
  const tableField = byId("pos-table").closest("label");
  if (tableField) tableField.hidden = serviceType !== "Dine In" || state.settings.tableServiceMode !== "assigned_pay_later";
  byId("pos-pickup-field").hidden = !usesNameCodeField();
  byId("pos-pickup-name").required = false;
  if (state.settings.tableServiceMode !== "assigned_pay_later") {
    byId("pos-table").innerHTML = `<option value="">Free seating</option>`;
    byId("pos-table").disabled = true;
    return;
  }
  const tables = activeDiningTables();
  const occupied = occupiedTableNames();
  const currentValue = byId("pos-table").value;
  const availableTables = state.settings.tableServiceMode === "assigned_pay_later"
    ? tables.filter((table) => !occupied.has(table.name))
    : tables;
  byId("pos-table").innerHTML = availableTables.length
    ? availableTables.map((table) => `<option value="${table.name}">${table.name} · ${table.area || "-"} · ${table.capacity || 1} pax</option>`).join("")
    : `<option value="">Semua meja aktif sedang open</option>`;
  if ([...byId("pos-table").options].some((option) => option.value === currentValue)) byId("pos-table").value = currentValue;
  byId("pos-table").disabled = serviceType !== "Dine In" || !availableTables.length || Boolean(activeOpenOrder()) || Boolean(editingOrder());
}

function renderActiveOpenOrderContext() {
  const editedOrder = editingOrder();
  const context = byId("active-open-table-context");
  if (editedOrder) {
    context.hidden = false;
    context.innerHTML = `
      <div>
        <span>Mode Edit Pesanan</span>
        <strong>#${editedOrder.orderNumber} · ${editedOrder.serviceType}${editedOrder.tableName !== "-" ? ` · ${editedOrder.tableName}` : editedOrder.customerName ? ` · ${editedOrder.customerName}` : ""}</strong>
        <small>Pilih menu dari grid POS, kurangi qty sampai 0 untuk hapus, lalu simpan perubahan.</small>
      </div>
      <div class="active-open-table-actions">
        <button class="ghost-button compact-button" data-cancel-order-edit type="button">Batal Edit</button>
      </div>
    `;
    byId("checkout-note").textContent = `Mode edit #${editedOrder.orderNumber}. Perubahan belum tersimpan.`;
    return;
  }
  const order = activeOpenOrder();
  if (!order) {
    context.hidden = true;
    context.innerHTML = "";
    if (serviceType === "Dine In") byId("checkout-note").textContent = "";
    return;
  }
  context.hidden = false;
  context.innerHTML = `
    <div>
      <span>Mode Tambah Order</span>
      <strong>${order.tableName} · #${order.orderNumber}</strong>
      <small>${orderItemCount(order)} item sebelumnya · bill berjalan ${money(order.total)}</small>
    </div>
    <div class="active-open-table-actions">
      <button class="ghost-button compact-button" data-view-table-bill="${order.id}" type="button">Lihat Bill</button>
      <button class="ghost-button compact-button danger-button" data-cancel-open-table-add type="button">Batal</button>
    </div>
  `;
  byId("checkout-note").textContent = `Mode tambah order untuk ${order.tableName} · #${order.orderNumber}.`;
}

function renderBillDetail(order, settlementMode = false, mode = "settle") {
  const isApproveMode = mode === "approve";
  const methods = activePaymentMethods();
  if (settlementMode && !methods.some((method) => method.name === paymentMethod)) setActivePaymentMethod(order.paymentMethod && order.paymentMethod !== "Belum dibayar" ? order.paymentMethod : methods[0]?.name);
  const selectedMethod = selectedPaymentMethod();
  const methodType = selectedMethod?.type || "";
  const isCash = methodType === "cash" || /^cash$/i.test(paymentMethod || "");
  const isGateway = ["qris", "card"].includes(methodType);
  byId("bill-detail-content").dataset.orderId = order.id;
  byId("bill-detail-content").dataset.mode = mode;
  byId("bill-detail-title").textContent = `${order.tableName} · #${order.orderNumber}`;
  byId("bill-detail-subtitle").textContent = settlementMode
    ? (isApproveMode ? "Cek pesanan online dan terima pembayaran sebelum masuk ke kitchen." : "Cek ulang pesanan pelanggan sebelum menutup dan menerima pembayaran.")
    : "Rincian bill berjalan untuk konfirmasi kasir dan pelanggan.";
  const itemRows = (order.items || []).map((item) => {
    const modifiers = item.modifiers?.length ? `<small>${item.modifiers.join(", ")}</small>` : "";
    return `
      <tr>
        <td><strong>${item.name}</strong>${modifiers}</td>
        <td>${item.qty}</td>
        <td>${money(item.price || 0)}</td>
        <td>${money((item.price || 0) * (item.qty || 0))}</td>
      </tr>
    `;
  }).join("");
  byId("bill-detail-content").innerHTML = `
    <div class="bill-detail-summary">
      <article><span>Meja</span><strong>${order.tableName}</strong></article>
      <article><span>Total Item</span><strong>${orderItemCount(order)}</strong></article>
      <article><span>Total Bill</span><strong>${money(order.total)}</strong></article>
      <article><span>Status</span><strong>${order.paymentStatus === "unpaid" ? "Open" : "Paid"}</strong></article>
    </div>
    <div class="bill-detail-table-wrap">
      <table class="bill-detail-table">
        <thead><tr><th>Item</th><th>Qty</th><th>Harga</th><th>Subtotal</th></tr></thead>
        <tbody>${itemRows || `<tr><td colspan="4">Belum ada item.</td></tr>`}</tbody>
      </table>
    </div>
    <div class="bill-total-panel">
      <div><span>Subtotal Produk</span><strong>${money(order.productRevenue || 0)}</strong></div>
      <div><span>Service Charge</span><strong>${money(order.serviceCharge || 0)}</strong></div>
      <div><span>Item Kemasan</span><strong>${money(order.packagingFee || 0)}</strong></div>
      <div><span>Pajak</span><strong>${money(order.tax || 0)}</strong></div>
      <div class="total"><span>Total Bayar</span><strong>${money(order.total || 0)}</strong></div>
    </div>
    <div class="bill-settlement-row" ${settlementMode ? "" : "hidden"}>
      <label>Metode Bayar <select id="bill-settlement-method">${methods.map((method) => `<option value="${method.name}" ${method.name === paymentMethod ? "selected" : ""}>${method.name}</option>`).join("")}</select></label>
      <div class="bill-cash-fields" ${isCash ? "" : "hidden"}>
        <label>Nominal Bayar <input id="bill-cash-tendered" data-total="${Number(order.total || 0)}" min="0" step="500" type="number" placeholder="Masukkan uang diterima" /></label>
        <div><span>Kembalian</span><strong id="bill-cash-change">${money(0)}</strong></div>
      </div>
      <div class="bill-gateway-panel" ${isGateway ? "" : "hidden"}>
        <span>${methodType === "qris" ? (selectedMethod?.qrisMode === "offline" ? "QRIS Static" : "QRIS Dinamis") : "Card / EDC"} - ${selectedPaymentGatewayLabel()}</span>
        <strong>${pendingPayment && paymentIntentContext?.orderId === order.id ? `${pendingPayment.status.toUpperCase()} · ${pendingPayment.reference}` : "Belum dibuat"}</strong>
        <small>${pendingPayment && paymentIntentContext?.orderId === order.id ? (pendingPayment.qrPayload || pendingPayment.cardActionMessage || pendingPayment.edcInstruction || "Konfirmasi setelah payment sukses.") : "Payment request dibuat saat konfirmasi bayar."}</small>
      </div>
    </div>
    <div class="modal-actions">
      <button class="ghost-button" data-close-bill-detail type="button">Tutup</button>
      ${settlementMode ? `<button class="primary-button" ${isApproveMode ? `data-confirm-approve-order="${order.id}"` : `data-confirm-close-table="${order.id}"`} type="button">${isApproveMode ? "Approve & Bayar" : "Konfirmasi Bayar"}</button>` : ""}
    </div>
  `;
  updateBillCashChange();
}

function openBillDetail(orderId, settlementMode = false, mode = "settle") {
  const order = state.transactions.find((item) => item.id === orderId);
  if (!order) return;
  renderBillDetail(order, settlementMode, mode);
  document.querySelector("[data-bill-detail-backdrop]").hidden = false;
  byId("bill-detail-modal").hidden = false;
  document.body.classList.add("modal-open");
}

function closeBillDetail() {
  document.querySelector("[data-bill-detail-backdrop]").hidden = true;
  byId("bill-detail-modal").hidden = true;
  if (paymentIntentContext?.source === "bill") {
    pendingPayment = null;
    paymentIntentContext = null;
  }
  document.body.classList.remove("modal-open");
}

function cancelOpenTableAdd() {
  activeOpenOrderId = "";
  renderDiningTableOptions();
  renderCart();
  renderActiveOpenOrderContext();
}

function cancelOrderEdit() {
  editingOrderId = "";
  cart = [];
  packagingOverride = null;
  packagingManualLines = [];
  byId("pos-pickup-name").value = "";
  renderDiningTableOptions();
  renderPaymentMethods();
  renderProducts();
  renderCart();
  renderActiveOpenOrderContext();
  byId("checkout-note").textContent = "Edit pesanan dibatalkan.";
}

function paymentMetaForBill(order, mode = "settle") {
  const total = Number(order.total || 0);
  if (isCashPayment()) {
    const tendered = Number(byId("bill-cash-tendered")?.value || 0);
    if (tendered < total) throw new Error("Nominal bayar cash belum cukup.");
    return {
      paymentMethod,
      cashTendered: tendered,
      changeDue: tendered - total,
      provider: "cashier",
      reference: `CASH-${order.orderNumber}`,
      paymentProvider: "cashier",
      paymentReference: `CASH-${order.orderNumber}`,
    };
  }
  if (isThirdPartyPayment()) {
    paymentIntentContext = { source: "bill", orderId: order.id, mode };
    if (!pendingPayment || pendingPayment.amount !== total || pendingPayment.methodName !== paymentMethod || pendingPayment.contextOrderId !== order.id) {
      createPaymentRequest(total, order.orderNumber, { amount: 0, payer: "merchant" });
      throw new Error(`${selectedPaymentType() === "qris" ? "QRIS" : "Request kartu"} dibuat. Konfirmasi setelah pembayaran sukses.`);
    }
    refreshPendingPaymentStatus();
    if (isQrisPayment() && pendingPayment.status !== "paid") openQrisPaymentModal(pendingPayment);
    if (isCardPayment() && pendingPayment.status !== "paid") openCardPaymentModal(pendingPayment);
    if (["failed", "cancelled", "expired"].includes(pendingPayment.status)) throw new Error(`Payment ${pendingPayment.status}. Buat payment request baru.`);
    if (["xendit", "midtrans"].includes(pendingPayment.provider) && pendingPayment.status !== "paid") throw new Error(`Menunggu status pembayaran sukses dari ${paymentGatewayLabel(pendingPayment.provider)}.`);
    const paid = pendingPayment.status === "paid" ? pendingPayment : confirmPendingPayment();
    if (paid.status !== "paid") throw new Error("Payment belum sukses.");
    return {
      paymentMethod,
      provider: paid.provider,
      reference: paid.reference,
      transactionId: paid.id,
      paymentProvider: paid.provider,
      paymentReference: paid.reference,
      paymentTransactionId: paid.id,
    };
  }
  return {
    paymentMethod,
    provider: "offline",
    reference: `${paymentMethod}-${order.orderNumber}`,
    paymentProvider: "offline",
    paymentReference: `${paymentMethod}-${order.orderNumber}`,
  };
}

function settleTable(orderId, paymentMethodValue) {
  if (!canUsePermission("pos.payment", "create", state, session)) {
    byId("checkout-note").textContent = "Anda tidak punya akses untuk pembayaran atau close bill.";
    return;
  }
  const order = state.transactions.find((item) => item.id === orderId);
  if (!order) return;
  try {
    setActivePaymentMethod(paymentMethodValue || paymentMethod || activePaymentMethods()[0]?.name || "Settlement");
    const paymentMeta = paymentMetaForBill(order, "settle");
    const settledOrder = putSales(`/api/order/${order.id}/settle`, paymentMeta);
    autoPrintPaidOrder(settledOrder);
    if (activeOpenOrderId === order.id) activeOpenOrderId = "";
    pendingPayment = null;
    paymentIntentContext = null;
    closeBillDetail();
    renderDiningTableOptions();
    renderOpenTableSessions();
    renderPosQueue();
    renderCart();
    renderActiveOpenOrderContext();
    byId("checkout-note").textContent = `${order.tableName} ditutup dan dibayar.`;
  } catch (error) {
    byId("checkout-note").textContent = error.message;
  }
}

function approvePendingOrder(orderId, paymentMethodValue) {
  if (!canUsePermission("queue.cashier", "update", state, session) || !canUsePermission("pos.payment", "create", state, session)) {
    byId("checkout-note").textContent = "Anda tidak punya akses approve dan pembayaran pesanan online.";
    return;
  }
  const order = state.transactions.find((item) => item.id === orderId);
  if (!order) return;
  try {
    setActivePaymentMethod(paymentMethodValue || paymentMethod || activePaymentMethods()[0]?.name || "Cash");
    const paymentMeta = paymentMetaForBill(order, "approve");
    const approvedOrder = putSales(`/api/order/${order.id}/approve`, paymentMeta);
    autoPrintPaidOrder(approvedOrder);
    pendingPayment = null;
    paymentIntentContext = null;
    closeBillDetail();
    renderDiningTableOptions();
    renderOpenTableSessions();
    renderPosQueue();
    renderPosApprovals();
    renderProducts();
    renderCart();
    renderActiveOpenOrderContext();
    byId("checkout-note").textContent = `${order.orderNumber} sudah dibayar dan masuk ke kitchen.`;
    showAlert("Order online berhasil di-approve dan masuk ke kitchen.");
  } catch (error) {
    byId("checkout-note").textContent = error.message;
  }
}

function orderLineIngredients(item, qty) {
  if (item.isPackaging) return [{ ingredientId: item.ingredientId, qty }];
  const product = productById(state, item.productId);
  if (!product) return [];
  const modifierIds = item.modifierIds || productModifierOptions(state, product)
    .filter((modifier) => (item.modifiers || []).includes(modifier.name))
    .map((modifier) => modifier.id);
  return effectiveRecipe(product, modifierIds, state).map((line) => ({ ingredientId: line.ingredientId, qty: line.qty * qty }));
}

function itemRecipeUsage(item) {
  const product = productById(state, item.productId);
  if (product && isStockedProduct(product)) return [];
  return orderLineIngredients(item, Number(item.qty) || 0);
}

function salesPayload(orderId, orderItems, totals, packaging, serviceCharge, packagingFee, tax, taxableRevenue, total, options = {}) {
  const payLater = isAssignedPayLater();
  const existingOpenOrder = options.existingOpenOrder || null;
  const payment = options.payment || {};
  const paymentFee = options.paymentFee || { amount: 0, payer: "merchant" };
  return {
    id: orderId || "",
    orderNumber: options.orderNumber || existingOpenOrder?.orderNumber || `POS-${String(state.transactions.length + 1).padStart(5, "0")}`,
    serviceType,
    tableFlow: state.settings.tableServiceMode,
    tableName: isAssignedPayLater() ? (existingOpenOrder?.tableName || byId("pos-table").value) : "-",
    customerName: serviceType === "Take Away" || serviceType === "Delivery"
      ? (byId("pos-pickup-name").value.trim() || automaticOrderCode())
      : isFreeSeatingDineIn()
        ? (byId("pos-pickup-name").value.trim() || `DI-${String(state.transactions.filter((order) => order.serviceType === "Dine In" && order.tableFlow === "free_seating_pay_first" && isToday(order.createdAt)).length + 1).padStart(3, "0")}`)
        : "",
    items: orderItems.map((item) => ({ ...item, recipeUsage: itemRecipeUsage(item) })),
    productRevenue: totals.revenue,
    serviceCharge,
    packagingFee,
    paymentFee: Number(paymentFee.amount || 0),
    paymentFeePayer: paymentFee.payer || "merchant",
    packagingSource: packagingResolution.source,
    packagingNote: packagingResolution.note,
    revenue: taxableRevenue,
    cogs: totals.cogs + packaging.cogs,
    profit: taxableRevenue - totals.cogs - packaging.cogs,
    packagingLoss: packaging.loss || 0,
    tax,
    total,
    paymentStatus: payLater && !options.forcePaid ? "unpaid" : "paid",
    paymentMethod: payLater && !options.forcePaid ? "Belum dibayar" : paymentMethod,
    cashTendered: payment.cashTendered || 0,
    changeDue: payment.changeDue || 0,
    paymentProvider: payment.provider || "",
    paymentReference: payment.reference || "",
    paymentTransactionId: payment.transactionId || ""
  };
}

function recalculateOrder(order) {
  const productRevenue = order.items.filter((item) => !item.isPackaging).reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 0), 0);
  const packagingFee = order.items.filter((item) => item.isPackaging).reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 0), 0);
  const cogs = order.items.reduce((sum, item) => sum + (Number(item.cogs) || 0) * (Number(item.qty) || 0), 0);
  const serviceCharge = order.serviceType === "Dine In" ? productRevenue * ((state.settings.dineInServiceRate || 0) / 100) : 0;
  const revenue = productRevenue + serviceCharge + packagingFee;
  const tax = revenue * ((state.settings.taxRate || 0) / 100);
  order.productRevenue = productRevenue;
  order.packagingFee = packagingFee;
  order.serviceCharge = serviceCharge;
  order.revenue = revenue;
  order.cogs = cogs;
  order.profit = revenue - cogs;
  order.tax = tax;
  order.total = revenue + tax;
}

function checkEditStock(order, changes) {
  for (const change of changes) {
    if (change.delta <= 0) continue;
    for (const usage of orderLineIngredients(change.item, change.delta)) {
      const ingredient = state.ingredients.find((entry) => entry.id === usage.ingredientId);
      if (!ingredient || ingredient.stock < usage.qty) return ingredient?.name || change.item.name;
    }
  }
  return "";
}

function applyEditStock(order, changes) {
  changes.forEach((change) => {
    orderLineIngredients(change.item, Math.abs(change.delta)).forEach((usage) => {
      const ingredient = state.ingredients.find((entry) => entry.id === usage.ingredientId);
      if (!ingredient) return;
      const beforeQty = ingredient.stock;
      const stockQty = change.delta > 0 ? -usage.qty : usage.qty;
      const unitCost = change.delta > 0 ? ingredientCostForQty(state, ingredient, usage.qty) / usage.qty : ingredientUnitCost(state, ingredient);
      ingredient.stock += stockQty;
      state.stockMovements.push({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ingredientId: ingredient.id,
        companyId: ingredient.companyId,
        outletId: ingredient.outletId,
        type: "sale_edit",
        beforeQty,
        qty: stockQty,
        afterQty: ingredient.stock,
        unitCost,
        totalCost: stockQty * unitCost,
        note: `Edit pesanan kasir #${order.orderNumber}: ${change.item.name}`
      });
    });
  });
}

function openPosOrderEdit(orderId) {
  if (!canUsePermission("pos.orderEdit", "update", state, session)) {
    byId("checkout-note").textContent = "Anda tidak punya akses untuk edit pesanan.";
    return;
  }
  const order = state.transactions.find((item) => item.id === orderId);
  if (!order || !canEditOrder(order)) return;
  editingOrderId = order.id;
  activeOpenOrderId = "";
  serviceType = order.serviceType;
  paymentMethod = order.paymentMethod && order.paymentMethod !== "Belum dibayar" ? order.paymentMethod : paymentMethod;
  packagingOverride = null;
  packagingManualLines = [];
  cart = (order.items || [])
    .filter((item) => !item.isPackaging && item.productId)
    .map((item) => {
      const modifierIds = item.modifierIds || [];
      return {
        id: `${item.productId}:${[...modifierIds].sort().join(",")}`,
        productId: item.productId,
        modifierIds: [...modifierIds],
        qty: Number(item.qty) || 0
      };
    })
    .filter((item) => item.qty > 0);
  document.querySelectorAll(".service-mode").forEach((button) => button.classList.toggle("active", button.textContent.trim() === serviceType));
  byId("pos-pickup-field").hidden = !usesNameCodeField();
  byId("pos-pickup-name").required = false;
  byId("pos-pickup-name").value = usesNameCodeField() ? order.customerName || "" : "";
  closePosQueue();
  closePosApprovals();
  renderDiningTableOptions();
  if (isAssignedPayLater()) {
    byId("pos-table").innerHTML = `<option value="${order.tableName}">${order.tableName} · pesanan sedang diedit</option>`;
    byId("pos-table").disabled = true;
  }
  renderPaymentMethods();
  renderProducts();
  renderCart();
  renderActiveOpenOrderContext();
}

function itemUsageMap(items) {
  const usage = new Map();
  items.forEach((item) => {
    orderLineIngredients(item, Number(item.qty) || 0).forEach((line) => {
      usage.set(line.ingredientId, (usage.get(line.ingredientId) || 0) + line.qty);
    });
  });
  return usage;
}

function applyOrderItemStockDiff(order, nextItems) {
  const previousUsage = itemUsageMap(order.items || []);
  const nextUsage = itemUsageMap(nextItems);
  const ingredientIds = new Set([...previousUsage.keys(), ...nextUsage.keys()]);
  for (const ingredientId of ingredientIds) {
    const delta = (nextUsage.get(ingredientId) || 0) - (previousUsage.get(ingredientId) || 0);
    if (delta <= 0) continue;
    const ingredient = state.ingredients.find((item) => item.id === ingredientId);
    if (!ingredient || ingredient.stock < delta) return ingredient?.name || "bahan";
  }
  ingredientIds.forEach((ingredientId) => {
    const delta = (nextUsage.get(ingredientId) || 0) - (previousUsage.get(ingredientId) || 0);
    if (!delta) return;
    const ingredient = state.ingredients.find((item) => item.id === ingredientId);
    if (!ingredient) return;
    const beforeQty = ingredient.stock;
    const stockQty = -delta;
    const unitCost = delta > 0 ? ingredientCostForQty(state, ingredient, delta) / delta : ingredientUnitCost(state, ingredient);
    ingredient.stock += stockQty;
      state.stockMovements.push({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ingredientId: ingredient.id,
        companyId: ingredient.companyId,
        outletId: ingredient.outletId,
        type: "sale_edit",
      beforeQty,
      qty: stockQty,
      afterQty: ingredient.stock,
      unitCost,
      totalCost: stockQty * unitCost,
      note: `Edit pesanan kasir #${order.orderNumber}`
    });
  });
  return "";
}

function saveEditingOrder(orderItems, payload) {
  if (!canUsePermission("pos.orderEdit", "update", state, session)) {
    byId("checkout-note").textContent = "Anda tidak punya akses untuk menyimpan edit pesanan.";
    return true;
  }
  const order = editingOrder();
  if (!order) return false;
  if (!orderItems.filter((item) => !item.isPackaging).length) {
    byId("checkout-note").textContent = "Minimal harus ada 1 menu produk dalam pesanan.";
    return true;
  }
  try {
    putSales(`/api/order/${order.id}`, payload);
    const orderNumber = order.orderNumber;
    editingOrderId = "";
    cart = [];
    packagingOverride = null;
    packagingManualLines = [];
    byId("pos-pickup-name").value = "";
    renderProducts();
    renderCart();
    renderPosQueue();
    renderOpenTableSessions();
    renderDiningTableOptions();
    renderActiveOpenOrderContext();
    byId("checkout-note").textContent = `#${orderNumber} berhasil diperbarui dari POS.`;
  } catch (error) {
    byId("checkout-note").textContent = error.message;
  }
  return true;
}

function renderPaymentMethods() {
  const methods = activePaymentMethods();
  if (!methods.some((method) => method.name === paymentMethod)) paymentMethod = methods[0]?.name || "";
  byId("payment-methods").hidden = isAssignedPayLater();
  byId("payment-methods").innerHTML = methods.length
    ? methods.map((method) => `<button class="${method.name === paymentMethod ? "active" : ""}" data-payment="${method.name}" type="button">${method.name}</button>`).join("")
    : `<button class="active" data-payment="" disabled type="button">Belum ada metode</button>`;
  renderPaymentPanel();
}

function renderOpenTableSessions() {
  const orders = openTableOrders();
  byId("pos-table-count").textContent = orders.length;
  byId("open-pos-tables").hidden = state.settings.tableServiceMode !== "assigned_pay_later";
  if (state.settings.tableServiceMode !== "assigned_pay_later") {
    byId("pos-table-drawer").hidden = true;
    document.querySelector("[data-pos-table-backdrop]").hidden = true;
    return;
  }
  byId("open-table-list").innerHTML = orders.length
    ? orders.map((order) => `
      <article class="open-table-card">
        <div>
          <strong>${order.tableName}</strong>
          <span>#${order.orderNumber} · ${queueElapsed(order.createdAt)} · ${order.items.reduce((sum, item) => sum + Number(item.qty || 0), 0)} item</span>
        </div>
        <div class="open-table-total">
          <span>Total Tagihan</span>
          <strong>${money(order.total)}</strong>
        </div>
        <select data-move-table-target="${order.id}">
          ${activeDiningTables()
            .filter((table) => table.name === order.tableName || !occupiedTableNames().has(table.name))
            .map((table) => `<option value="${table.name}" ${table.name === order.tableName ? "selected" : ""}>${table.name}${table.name === order.tableName ? " · Saat ini" : ""}</option>`)
            .join("")}
        </select>
        <button class="ghost-button compact-button" data-move-table-order="${order.id}" data-permission="pos.orderEdit:update" type="button">Pindah</button>
        <button class="ghost-button compact-button" data-add-to-open-table="${order.id}" data-permission="pos.transaction:create" type="button">Tambah Order</button>
        <button class="ghost-button compact-button" data-view-table-bill="${order.id}" type="button">Detail Bill</button>
        <select data-table-payment-method="${order.id}">
          ${activePaymentMethods().map((method) => `<option value="${method.name}">${method.name}</option>`).join("")}
        </select>
        <button class="primary-button compact-button" data-close-table-order="${order.id}" data-permission="pos.payment:create" type="button">Tutup & Bayar</button>
      </article>
    `).join("")
    : `<p class="empty-state">Belum ada open table.</p>`;
  applyPermissionControls(document, state, session);
}

function cartTotals() {
  return cart.reduce(
    (totals, line) => {
      const product = productById(state, line.productId);
      if (!product) return totals;
      const cogs = productCogsWithModifiers(state, product, line.modifierIds) * line.qty;
      const revenue = (product.price + modifierPrice(product, line.modifierIds, state)) * line.qty;
      totals.qty += line.qty;
      totals.revenue += revenue;
      totals.cogs += cogs;
      totals.profit += revenue - cogs;
      return totals;
    },
    { qty: 0, revenue: 0, cogs: 0, profit: 0 }
  );
}

function automaticPackaging() {
  if (!needsPackaging()) return [];
  const itemCount = cart.reduce((total, line) => total + line.qty, 0);
  if (!itemCount) return [];
  const rules = (state.settings.packagingRules || []).filter((rule) => rule.status !== "inactive").slice();
  const largestRules = rules.slice().sort((a, b) => b.maxQty - a.maxQty);
  const smallestFittingRules = rules.slice().sort((a, b) => a.maxQty - b.maxQty || a.minQty - b.minQty);
  const selectedRules = [];
  let remaining = itemCount;

  // Each rule contributes its full package set: item[0] is utama, later items are additional-within-rule.
  // Overflow is handled by selecting another rule for the remaining item count.
  while (remaining > 0) {
    const directRule = smallestFittingRules.find((rule) => remaining >= rule.minQty && remaining <= rule.maxQty);
    if (directRule) {
      selectedRules.push(directRule);
      remaining = 0;
      break;
    }
    const splitRule = largestRules.find((rule) => rule.maxQty <= remaining);
    if (!splitRule) return [];
    selectedRules.push(splitRule);
    remaining -= splitRule.maxQty;
  }

  const hasEnoughStockForPackage = (items) => {
    if (!items.length) return false;
    const requiredByIngredient = items.reduce((map, item) => {
      map.set(item.ingredientId, (map.get(item.ingredientId) || 0) + Number(item.qty || 0));
      return map;
    }, new Map());
    return [...requiredByIngredient.entries()].every(([ingredientId, required]) => {
      const ingredient = state.ingredients.find((entry) => entry.id === ingredientId && entry.status !== "inactive" && isPackagingIngredient(entry));
      return ingredient && ingredient.stock >= required;
    });
  };
  const primaryItems = selectedRules.flatMap((rule) => rule.items || []);
  const fallbackItems = selectedRules.flatMap((rule) => rule.fallbackItems || []);
  const primaryAvailable = hasEnoughStockForPackage(primaryItems);
  const fallbackAvailable = hasEnoughStockForPackage(fallbackItems);
  if (!primaryAvailable && !fallbackAvailable) {
    packagingResolution = { source: "unavailable", note: fallbackItems.length ? "Stok paket kemasan normal dan paket pengganti tidak cukup" : "Stok paket kemasan normal tidak cukup dan paket pengganti belum diatur" };
    return [];
  }
  const selectedItems = primaryAvailable ? primaryItems : fallbackItems;
  if (!selectedItems.length) return [];
  packagingResolution = { source: primaryAvailable ? "automatic" : "fallback", note: primaryAvailable ? "Kemasan otomatis dari Packaging Rule" : "Paket pengganti dipakai karena stok paket kemasan normal tidak cukup" };

  const combined = new Map();
  selectedItems.forEach((item) => {
    const key = `${item.ingredientId}:${Number(item.price) || 0}`;
    const current = combined.get(key) || { ...item, qty: 0 };
    current.qty += Number(item.qty) || 0;
    combined.set(key, current);
  });

  return [...combined.values()].map((item) => {
    const ingredient = state.ingredients.find((entry) => entry.id === item.ingredientId && entry.status !== "inactive" && isPackagingIngredient(entry));
    return {
      ingredientId: item.ingredientId,
      name: ingredient?.name || "Kemasan tambahan tidak ditemukan",
      qty: item.qty,
      price: Number(item.price) || 0,
      cogs: ingredient ? ingredientUnitCost(state, ingredient) : 0,
      isPackaging: true
    };
  }).filter((line) => line.qty > 0);
}

function resolvedPackaging() {
  if (!needsPackaging()) return [];
  const automatic = automaticPackaging();
  const manualLines = packagingManualLines.map((line) => {
    const ingredient = state.ingredients.find((item) => item.id === line.ingredientId && item.status !== "inactive" && isPackagingIngredient(item));
    return ingredient ? { manualId: line.id, ingredientId: ingredient.id, name: ingredient.name, qty: line.qty, price: line.price, cogs: ingredientUnitCost(state, ingredient), lossCost: 0, treatment: line.treatment, reason: line.reason, isManualPackaging: true, isPackaging: true } : null;
  }).filter(Boolean);
  if (packagingOverride) {
    const ingredient = state.ingredients.find((item) => item.id === packagingOverride.ingredientId && item.status !== "inactive" && isPackagingIngredient(item));
    const isLoss = packagingOverride.treatment === "replacement_loss";
    packagingResolution = { source: manualLines.length ? `manual_add_${packagingOverride.treatment}` : packagingOverride.treatment, note: manualLines.length ? `Kemasan otomatis diganti + ${manualLines.length} tambahan manual` : `Kemasan otomatis diganti: ${packagingOverride.reason}` };
    const replacement = ingredient ? [{
      manualId: packagingOverride.id,
      ingredientId: ingredient.id,
      name: ingredient.name,
      qty: packagingOverride.qty,
      price: 0,
      cogs: isLoss ? 0 : ingredientUnitCost(state, ingredient),
      lossCost: isLoss ? ingredientUnitCost(state, ingredient) : 0,
      treatment: packagingOverride.treatment,
      reason: packagingOverride.reason,
      isManualPackaging: true,
      isPackaging: true
    }] : [];
    return [...combinePackagingLines(replacement), ...manualLines];
  }
  if (manualLines.length) {
    packagingResolution = { source: "automatic_plus_manual", note: `Kemasan otomatis + ${manualLines.length} tambahan manual` };
  }
  return [...combinePackagingLines(automatic), ...manualLines];
}

function packagingTotals() {
  return resolvedPackaging().reduce((totals, line) => {
    totals.revenue += line.price * line.qty;
    totals.cogs += line.cogs * line.qty;
    totals.loss += (line.lossCost || 0) * line.qty;
    return totals;
  }, { revenue: 0, cogs: 0, loss: 0 });
}

function renderProducts() {
  const activeCategoryIds = new Set(state.categories.filter((category) => visibleForSession(category, state, session) && category.status === "active").map((category) => category.id));
  const visibleProducts = state.products
    .filter((product) => visibleForSession(product, state, session))
    .filter((product) => product.status !== "inactive")
    .filter((product) => !product.categoryId || activeCategoryIds.has(product.categoryId))
    .filter((product) => product.name.toLowerCase().includes(productSearch) && (productCategory === "all" || product.categoryId === productCategory));
  byId("pos-product-result").textContent = `${visibleProducts.length} produk tersedia`;
  byId("product-grid").innerHTML = visibleProducts
    .map((product, index) => {
      const available = productAvailability(state, product);
      const canAdd = canAddProductFromCurrentDraft(product);
      const soldOut = !canAdd;
      return `
        <article class="product-card ${soldOut ? "product-card-soldout" : ""}" aria-disabled="${soldOut ? "true" : "false"}">
          <div class="product-visual product-tone-${index % 4}">
            ${product.imageUrl ? `<img src="${product.imageUrl}" alt="${product.name}" />` : `<span></span>`}
            <span class="product-stock-badge ${available < 1 ? "product-stock-badge-soldout" : ""}">${available < 1 ? (canAdd && editingOrder() ? "Draft tersedia" : "Sold Out") : `${available} unit`}</span>
          </div>
          <div class="product-card-copy">
            <span class="product-category-label">${product.category}</span>
            <h4>${product.name}</h4>
            <span class="price">${money(product.price)}</span>
          </div>
          <div class="product-card-actions">
            <button class="product-detail-button" data-product-detail="${product.id}" type="button">Detail</button>
            <button class="product-add-button" aria-label="${soldOut ? `${product.name} sold out` : `Tambah ${product.name}`}" data-add-product="${product.id}" data-permission="pos.transaction:create" ${soldOut ? "disabled title=\"Sold Out\"" : ""} type="button">+</button>
          </div>
        </article>
      `;
    })
    .join("");
  applyPermissionControls(document, state, session);
}

function openProductDetail(productId) {
  const product = productById(state, productId);
  if (!product) return;
  const available = productAvailability(state, product);
  byId("pos-product-detail-title").textContent = product.name;
  byId("pos-product-detail").innerHTML = `
    <section class="pos-product-detail-layout">
      <div class="pos-product-detail-visual">${product.imageUrl ? `<img src="${product.imageUrl}" alt="${product.name}" />` : `<span></span>`}</div>
      <div class="pos-product-story">
        <div class="product-detail-heading"><span class="status-pill status-ok">${product.category}</span><strong>${money(product.price)}</strong></div>
        <div class="cashier-recommendation"><span>Deskripsi Produk</span><strong>${product.description || "Belum ada deskripsi produk."}</strong></div>
        <button class="primary-button" data-add-from-detail="${product.id}" data-permission="pos.transaction:create" ${available < 1 ? "disabled" : ""} type="button">${available < 1 ? "Sold Out" : "Tambahkan ke Pesanan"}</button>
      </div>
    </section>
  `;
  document.querySelector("[data-product-detail-backdrop]").hidden = false;
  byId("pos-product-detail-modal").hidden = false;
  document.body.classList.add("modal-open");
}

function closeProductDetail() {
  document.querySelector("[data-product-detail-backdrop]").hidden = true;
  byId("pos-product-detail-modal").hidden = true;
  document.body.classList.remove("modal-open");
}

function renderCart() {
  const totals = cartTotals();
  const packaging = packagingTotals();
  const serviceCharge = serviceType === "Dine In" ? totals.revenue * ((state.settings.dineInServiceRate || 0) / 100) : 0;
  const packagingFee = packaging.revenue;
  const taxableRevenue = totals.revenue + serviceCharge + packagingFee;
  const tax = taxableRevenue * ((state.settings.taxRate || 0) / 100);
  const paymentFee = paymentFeeFor(taxableRevenue + tax);
  const customerPaymentFee = paymentFee.payer === "customer" ? paymentFee.amount : 0;
  const merchantPaymentFee = paymentFee.payer === "merchant" ? paymentFee.amount : 0;
  byId("cart-count").textContent = `${totals.qty} item`;
  byId("cart-subtotal").textContent = money(totals.revenue);
  byId("cart-cogs").textContent = money(totals.cogs + packaging.cogs + packaging.loss);
  byId("cart-profit").textContent = money(taxableRevenue - totals.cogs - packaging.cogs - packaging.loss - merchantPaymentFee);
  byId("cart-service-label").textContent = `Service Charge Dine In (${state.settings.dineInServiceRate || 0}%)`;
  byId("cart-service-charge").textContent = money(serviceCharge);
  byId("cart-packaging-fee").textContent = money(packagingFee);
  byId("cart-service-row").hidden = serviceCharge <= 0;
  byId("cart-packaging-row").hidden = packagingFee <= 0;
  byId("cart-tax-label").textContent = `Pajak (${state.settings.taxRate || 0}%)`;
  byId("cart-tax").textContent = money(tax);
  byId("cart-payment-fee-label").textContent = `Payment Fee (${paymentFee.rate || 0}%)`;
  byId("cart-payment-fee").textContent = money(paymentFee.amount);
  byId("cart-payment-fee-row").hidden = paymentFee.amount <= 0;
  const selectedOpenOrder = isAssignedPayLater() ? activeOpenOrder() : null;
  byId("cart-total-label").textContent = editingOrder() ? "Total Setelah Edit" : isAssignedPayLater() ? (selectedOpenOrder ? "Tambahan Tagihan" : "Estimasi Tagihan") : "Total Bayar";
  byId("cart-grand-total").textContent = money(taxableRevenue + tax + customerPaymentFee);
  byId("checkout").textContent = editingOrder() ? "Simpan Perubahan Pesanan" : isAssignedPayLater() ? (selectedOpenOrder ? "Tambah Order ke Table" : "Kirim Order ke Table") : "Bayar Sekarang";
  byId("checkout").disabled = cart.length === 0;
  renderPaymentPanel(taxableRevenue + tax + customerPaymentFee);
  byId("packaging-control").hidden = !needsPackaging() || cart.length === 0;
  byId("packaging-control-note").textContent = packagingResolution.note || "Kemasan tambahan otomatis";

  byId("cart-list").innerHTML = cart.length
    ? cart
        .map((line) => {
          const product = productById(state, line.productId);
          const linePrice = product.price + modifierPrice(product, line.modifierIds, state);
          const modifierNames = productModifierOptions(state, product).filter((modifier) => line.modifierIds.includes(modifier.id)).map((modifier) => `${modifier.groupName}: ${modifier.name}`).join(", ");
          const plusEnabled = canIncreaseCartLine(line);
          return `
            <div class="cart-row">
              <span class="cart-product-thumb"></span>
              <div>
                <strong>${product.name}</strong>
                ${modifierNames ? `<small>${modifierNames}</small>` : ""}
                <span>${money(linePrice)}</span>
              </div>
              <div class="qty-controls">
                <button class="qty-button" data-cart-minus="${line.id}" type="button">-</button>
                <strong>${line.qty}</strong>
                <button class="qty-button" data-cart-plus="${line.id}" ${plusEnabled ? "" : "disabled title=\"Stok tambahan tidak cukup\""} type="button">+</button>
              </div>
              ${productModifierOptions(state, product).length ? `<button class="ghost-button compact-button" data-cart-modifier-edit="${line.id}" type="button">Edit</button>` : ""}
              <strong class="cart-line-total">${money(linePrice * line.qty)}</strong>
            </div>
          `;
        })
        .join("") + resolvedPackaging().map((line) => `
          <div class="cart-row packaging-cart-row">
            <span class="cart-product-thumb"></span>
            <div><strong>${line.name}</strong><small>${line.treatment === "replacement_loss" ? "Pengganti rusak / loss" : line.treatment === "replacement_cost" ? "Pengganti stok kosong" : `Kemasan tambahan ${serviceType}`}</small><span>${money(line.price)}</span></div>
            <div class="qty-controls">
              ${line.isManualPackaging ? `<button class="qty-button" data-packaging-minus="${line.manualId}" type="button">-</button>` : ""}
              <strong>${line.qty}</strong>
              ${line.isManualPackaging ? `<button class="qty-button" data-packaging-plus="${line.manualId}" type="button">+</button>` : ""}
            </div>
            <strong class="cart-line-total">${money(line.price * line.qty)}</strong>
          </div>
        `).join("")
    : `<p class="empty-state">Keranjang masih kosong.</p>`;
}

function renderPaymentPanel(currentTotal = null) {
  const panel = byId("pos-payment-panel");
  if (!panel) return;
  const payableTotal = currentTotal ?? (Number(String(byId("cart-grand-total")?.textContent || "0").replace(/[^\d]/g, "")) || 0);
  const showPanel = !isAssignedPayLater() && !editingOrder() && cart.length > 0 && Boolean(paymentMethod);
  panel.hidden = !showPanel;
  byId("cash-payment-fields").hidden = !showPanel || !isCashPayment();
  byId("third-party-payment").hidden = !showPanel || !isThirdPartyPayment();
  if (isCashPayment()) updateCashChange(payableTotal);
  if (pendingPayment && (pendingPayment.amount !== payableTotal || pendingPayment.methodName !== paymentMethod)) pendingPayment = null;
  if (isThirdPartyPayment()) {
    byId("third-party-payment-label").textContent = `${selectedPaymentType() === "qris" ? (isOfflineQrisPayment() ? "QRIS Static" : "QRIS Dinamis") : "Card / EDC"} - ${selectedPaymentGatewayLabel()}`;
    byId("third-party-payment-status").textContent = pendingPayment ? `${pendingPayment.status.toUpperCase()} · ${pendingPayment.reference}` : "Belum dibuat";
    byId("third-party-payment-note").textContent = pendingPayment
      ? (pendingPayment.qrPayload || pendingPayment.cardActionMessage || pendingPayment.edcInstruction || "Konfirmasi setelah provider menyatakan pembayaran sukses.")
      : "Payment request dibuat saat checkout, lalu kasir konfirmasi setelah sukses.";
    if (!editingOrder() && !isAssignedPayLater()) byId("checkout").textContent = pendingPayment ? "Konfirmasi Pembayaran & Simpan" : `Buat ${selectedPaymentType() === "qris" ? (isOfflineQrisPayment() ? "Pembayaran QRIS" : "QRIS") : "Request Card"}`;
  }
}

function receiptRows(order) {
  return (order.items || []).map((item) => `
    <tr>
      <td><strong>${escapeHtml(item.name || "Item")}</strong>${item.modifiers?.length ? `<small>${escapeHtml(item.modifiers.join(", "))}</small>` : ""}</td>
      <td class="num">${Number(item.qty || 0).toLocaleString("id-ID")}</td>
      <td class="num">${money((Number(item.price || 0) * Number(item.qty || 0)))}</td>
    </tr>
  `).join("");
}

function autoPrintPaidOrder(order) {
  if (!order || order.paymentStatus !== "paid" || !state.settings?.printerName) return;
  const printWindow = window.open("", "_blank", "width=420,height=720");
  if (!printWindow) {
    showAlert("Order paid, tetapi popup print diblokir browser. Izinkan popup untuk auto print struk.", "error");
    return;
  }
  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Struk ${escapeHtml(order.orderNumber || "")}</title>
        <style>
          body { margin: 0; padding: 14px; font-family: Arial, sans-serif; color: #25170f; background: #fff; }
          .receipt { width: 280px; margin: 0 auto; font-family: Consolas, Menlo, monospace; font-size: 12px; line-height: 1.35; }
          .receipt-logo { display: block; width: 58px; height: 58px; object-fit: contain; margin: 0 auto 7px; filter: grayscale(1) contrast(1.2); }
          h1 { font-size: 18px; margin: 0; text-align: center; }
          .muted { color: #5f5348; font-size: 11px; text-align: center; margin: 3px 0; }
          .head { border-bottom: 1px dashed #9c8c7e; padding-bottom: 10px; margin-bottom: 8px; text-align: center; }
          .meta, .totals { border-top: 1px dashed #b9aaa0; border-bottom: 1px dashed #b9aaa0; padding: 8px 0; margin: 8px 0; font-size: 12px; }
          .line { display: flex; justify-content: space-between; gap: 12px; margin: 4px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          td { padding: 5px 0; vertical-align: top; border-bottom: 1px solid #eee7e1; }
          td small { display: block; color: #6f6259; margin-top: 2px; }
          .num { text-align: right; white-space: nowrap; }
          .total { font-size: 15px; font-weight: 700; }
          .footer { text-align: center; font-size: 11px; margin-top: 14px; color: #6f6259; }
          @media print { body { padding: 0; } .receipt { width: 100%; } }
        </style>
      </head>
      <body>
        <section class="receipt">
          <div class="head">
            ${activeCompanyLogo() ? `<img class="receipt-logo" src="${escapeHtml(activeCompanyLogo())}" alt="Logo" />` : ""}
            <h1>${escapeHtml(state.settings?.companyName || "IF Instrument")}</h1>
            <p class="muted">${escapeHtml(activeOutletLabel())}</p>
            ${activeOutletAddress() ? `<p class="muted">${escapeHtml(activeOutletAddress())}</p>` : ""}
            <p class="muted">Printer: ${escapeHtml(state.settings.printerName)}</p>
          </div>
          <div class="meta">
            <div class="line"><span>No Order</span><strong>#${escapeHtml(order.orderNumber || "-")}</strong></div>
            <div class="line"><span>Waktu</span><span>${new Date(order.createdAt || Date.now()).toLocaleString("id-ID")}</span></div>
            <div class="line"><span>Layanan</span><span>${escapeHtml(order.serviceType || "-")}</span></div>
            <div class="line"><span>Customer/Meja</span><span>${escapeHtml(order.customerName || order.tableName || "-")}</span></div>
            <div class="line"><span>Bayar</span><span>${escapeHtml(order.paymentMethod || "-")}</span></div>
          </div>
          <table><tbody>${receiptRows(order)}</tbody></table>
          <div class="totals">
            <div class="line"><span>Subtotal</span><span>${money(order.productRevenue || 0)}</span></div>
            ${(order.packagingFee || 0) > 0 ? `<div class="line"><span>Kemasan</span><span>${money(order.packagingFee || 0)}</span></div>` : ""}
            ${(order.serviceCharge || 0) > 0 ? `<div class="line"><span>Service</span><span>${money(order.serviceCharge || 0)}</span></div>` : ""}
            ${(order.tax || 0) > 0 ? `<div class="line"><span>Pajak</span><span>${money(order.tax || 0)}</span></div>` : ""}
            <div class="line total"><span>Total</span><span>${money(order.total || 0)}</span></div>
            ${(order.cashTendered || 0) > 0 ? `<div class="line"><span>Bayar Cash</span><span>${money(order.cashTendered || 0)}</span></div><div class="line"><span>Kembali</span><span>${money(order.changeDue || 0)}</span></div>` : ""}
          </div>
          <div class="footer">Terima kasih</div>
        </section>
        <script>
          window.addEventListener("load", function () {
            setTimeout(function () {
              window.print();
              setTimeout(function () { window.close(); }, 500);
            }, 250);
          });
        <\/script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function updateCashChange(currentTotal = null) {
  const total = currentTotal ?? (Number(String(byId("cart-grand-total")?.textContent || "0").replace(/[^\d]/g, "")) || 0);
  const tendered = Number(byId("cash-tendered")?.value || 0);
  byId("cash-change").textContent = money(Math.max(tendered - total, 0));
}

function qrisModalData(payment = pendingPayment) {
  if (!payment) return null;
  const staticQris = payment.qrisMode === "offline" || payment.provider === "manual_qris";
  const providerQrImage = payment.provider === "midtrans" && /^https?:\/\//i.test(payment.qrPayload || "");
  const valid = providerQrImage || (typeof payment.qrPayloadValid === "boolean" ? payment.qrPayloadValid : looksLikeQrisPayload(payment.qrPayload));
  const mode = payment.paymentGatewayMode || state.settings?.paymentGateway?.mode || "sandbox";
  return {
    outlet: activeOutletName(),
    orderNo: payment.orderNo || "POS",
    reference: payment.reference || "-",
    amount: Number(payment.amount || 0),
    qrPayload: payment.qrPayload,
    qrPayloadValid: staticQris ? Boolean(payment.qrisImageUrl) : valid,
    staticQris,
    sandboxSimulatable: payment.provider === "xendit" && payment.status === "pending" && (mode !== "live" || !valid),
    qrMessage: staticQris ? "Gambar QRIS Static outlet belum tersedia." : (payment.qrPayloadMessage || (valid ? "Payload QRIS valid dan siap discan." : "Xendit sandbox mengirim payload testing yang tidak bisa discan aplikasi pembayaran.")),
    qrImage: staticQris ? (payment.qrisImageUrl || "") : (providerQrImage ? payment.qrPayload : (valid ? qrImageUrl(payment.qrPayload, 360) : ""))
  };
}

function openQrisPaymentModal(payment = pendingPayment) {
  const data = qrisModalData(payment);
  if (!data) return;
  byId("qris-payment-outlet").textContent = data.outlet;
  byId("qris-payment-order").textContent = `#${data.orderNo}`;
  byId("qris-payment-amount").textContent = money(data.amount);
  byId("qris-payment-reference").textContent = data.reference;
  const frame = document.querySelector(".qris-code-frame");
  frame.classList.toggle("invalid", !data.qrPayloadValid);
  byId("qris-payment-image").hidden = !data.qrPayloadValid;
  byId("qris-payment-placeholder").hidden = data.qrPayloadValid;
  byId("qris-payment-image").src = data.qrImage || "";
  byId("qris-payment-image").dataset.qrPayload = data.qrPayload || "";
  byId("qris-payment-note").textContent = data.staticQris
    ? "Minta pelanggan scan QRIS Static outlet. Setelah bukti pembayaran diterima, konfirmasi secara manual."
    : data.qrPayloadValid
    ? "Minta pelanggan scan QRIS ini. Sistem mengecek status pembayaran otomatis setiap 1 menit."
    : `${data.qrMessage} Reference: ${data.reference}. Sistem mengecek status otomatis setiap 1 menit.`;
  const simulateButton = document.querySelector("[data-simulate-qris-payment]");
  if (simulateButton) simulateButton.hidden = !data.sandboxSimulatable;
  const confirmButton = document.querySelector("[data-confirm-static-qris-payment]");
  const continueButton = document.querySelector("[data-close-qris-payment].primary-button");
  if (confirmButton) confirmButton.hidden = !data.staticQris;
  if (continueButton) continueButton.hidden = data.staticQris;
  document.querySelector("[data-qris-payment-backdrop]").hidden = false;
  byId("qris-payment-modal").hidden = false;
  document.body.classList.add("modal-open");
  if (!data.staticQris) startPaymentStatusPolling("qris");
}

function closeQrisPaymentModal() {
  document.querySelector("[data-qris-payment-backdrop]").hidden = true;
  byId("qris-payment-modal").hidden = true;
  document.body.classList.remove("modal-open");
  stopPaymentStatusPolling();
}

function openCardPaymentModal(payment = pendingPayment) {
  if (!payment) return;
  const actionUrl = payment.cardActionUrl || "";
  const mode = payment.paymentGatewayMode || state.settings?.paymentGateway?.mode || "sandbox";
  const hasCustomerPage = Boolean(actionUrl);
  byId("card-payment-outlet").textContent = activeOutletName();
  byId("card-payment-order").textContent = `#${payment.orderNo || "POS"}`;
  byId("card-payment-amount").textContent = money(Number(payment.amount || 0));
  byId("card-payment-reference").textContent = payment.reference || "-";
  byId("card-payment-subtitle").textContent = hasCustomerPage
    ? "Minta customer scan QR untuk membuka halaman pembayaran kartu online."
    : "Gunakan mesin EDC fisik sesuai bank acquirer yang dipilih.";
  byId("card-payment-note").textContent = payment.cardActionMessage || payment.edcInstruction || (hasCustomerPage
    ? "Setelah customer menyelesaikan pembayaran kartu, sistem mengecek status otomatis setiap 1 menit."
    : "Proses kartu pada mesin EDC, lalu konfirmasi setelah transaksi approved.");
  const qrFrame = byId("card-payment-qr-frame");
  const qrImage = byId("card-payment-qr");
  const offlinePanel = byId("card-payment-offline-panel");
  qrFrame.hidden = !hasCustomerPage;
  offlinePanel.hidden = hasCustomerPage;
  if (hasCustomerPage) {
    qrImage.src = qrImageUrl(actionUrl, 360);
    qrImage.dataset.qrPayload = actionUrl;
  } else {
    qrImage.src = "";
    qrImage.dataset.qrPayload = "";
    byId("card-payment-offline-label").textContent = payment.edcInstruction || "Approval menggunakan mesin EDC offline.";
  }
  const openButton = byId("open-card-payment-link");
  openButton.hidden = !hasCustomerPage;
  openButton.dataset.cardActionUrl = actionUrl;
  const printButton = byId("print-card-payment-qr");
  if (printButton) printButton.hidden = !hasCustomerPage;
  const simulateButton = document.querySelector("[data-simulate-card-payment]");
  if (simulateButton) simulateButton.hidden = !(payment.provider === "xendit" && payment.status === "pending" && mode !== "live");
  document.querySelector("[data-card-payment-backdrop]").hidden = false;
  byId("card-payment-modal").hidden = false;
  document.body.classList.add("modal-open");
  startPaymentStatusPolling("card");
}

function closeCardPaymentModal() {
  document.querySelector("[data-card-payment-backdrop]").hidden = true;
  byId("card-payment-modal").hidden = true;
  document.body.classList.remove("modal-open");
  stopPaymentStatusPolling();
}

function openCardPaymentLink() {
  const url = byId("open-card-payment-link")?.dataset.cardActionUrl || pendingPayment?.cardActionUrl || "";
  if (!url) {
    byId("checkout-note").textContent = "Link approval kartu belum tersedia dari gateway.";
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function cardModalData(payment = pendingPayment) {
  const actionUrl = payment?.cardActionUrl || "";
  if (!payment || !actionUrl) return null;
  return {
    outlet: activeOutletName(),
    orderNo: payment.orderNo || "POS",
    reference: payment.reference || "-",
    amount: Number(payment.amount || 0),
    actionUrl,
    qrImage: qrImageUrl(actionUrl, 360)
  };
}

function printCardPaymentQr() {
  const data = cardModalData();
  if (!data) {
    byId("checkout-note").textContent = "QR pembayaran kartu belum tersedia.";
    return;
  }
  const printWindow = window.open("", "_blank", "width=420,height=620");
  if (!printWindow) {
    byId("checkout-note").textContent = "Popup print diblokir browser. Izinkan popup untuk mencetak QR kartu.";
    return;
  }
  printWindow.document.write(`
    <!doctype html>
    <html lang="id">
      <head>
        <meta charset="UTF-8" />
        <title>Print Card Payment ${data.orderNo}</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 18px; font-family: Arial, sans-serif; color: #21170f; }
          .receipt { width: 320px; margin: 0 auto; text-align: center; }
          h1 { margin: 0 0 4px; font-size: 18px; }
          .order { margin: 0 0 14px; color: #6f5c4d; font-size: 12px; font-weight: 700; }
          img { width: 280px; height: 280px; object-fit: contain; border: 1px solid #ddd; padding: 10px; }
          .amount { margin: 14px 0 4px; font-size: 22px; font-weight: 800; }
          .ref, .url { color: #6f5c4d; font-size: 11px; overflow-wrap: anywhere; }
          .note { margin-top: 14px; font-size: 11px; line-height: 1.4; }
          @media print { body { padding: 0; } .receipt { width: 100%; } }
        </style>
      </head>
      <body>
        <section class="receipt">
          <h1>${data.outlet}</h1>
          <p class="order">#${data.orderNo}</p>
          <img src="${data.qrImage}" alt="QR Card Payment" />
          <div class="amount">${money(data.amount)}</div>
          <div class="ref">${data.reference}</div>
          <p class="note">Scan QR ini dari HP customer untuk membuka pembayaran kartu online.</p>
          <div class="url">${data.actionUrl}</div>
        </section>
        <script>
          window.addEventListener("load", () => {
            window.print();
            setTimeout(() => window.close(), 500);
          });
        <\/script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function printQrisPayment() {
  const data = qrisModalData();
  if (!data) return;
  const printWindow = window.open("", "_blank", "width=420,height=620");
  if (!printWindow) {
    byId("checkout-note").textContent = "Popup print diblokir browser. Izinkan popup untuk mencetak QRIS.";
    return;
  }
  printWindow.document.write(`
    <!doctype html>
    <html lang="id">
      <head>
        <meta charset="UTF-8" />
        <title>Print QRIS ${data.orderNo}</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 18px; font-family: Arial, sans-serif; color: #21170f; }
          .receipt { width: 320px; margin: 0 auto; text-align: center; }
          h1 { margin: 0 0 4px; font-size: 18px; }
          .order { margin: 0 0 14px; color: #6f5c4d; font-size: 12px; font-weight: 700; }
          img { width: 280px; height: 280px; object-fit: contain; border: 1px solid #ddd; padding: 10px; }
          .placeholder { display: grid; place-items: center; width: 280px; height: 280px; margin: 0 auto; padding: 16px; border: 1px dashed #c2410c; color: #9a3412; font-size: 13px; font-weight: 800; line-height: 1.4; }
          .amount { margin: 14px 0 4px; font-size: 22px; font-weight: 800; }
          .ref { color: #6f5c4d; font-size: 11px; overflow-wrap: anywhere; }
          .note { margin-top: 14px; font-size: 11px; line-height: 1.4; }
          @media print { body { padding: 0; } .receipt { width: 100%; } }
        </style>
      </head>
      <body>
        <section class="receipt">
          <h1>${data.outlet}</h1>
          <p class="order">#${data.orderNo}</p>
          ${data.qrPayloadValid ? `<img src="${data.qrImage}" alt="QRIS" />` : `<div class="placeholder">${data.qrMessage}</div>`}
          <div class="amount">${money(data.amount)}</div>
          <div class="ref">${data.reference}</div>
          <p class="note">Scan QRIS ini untuk pembayaran. Tunjukkan bukti sukses ke kasir.</p>
        </section>
        <script>
          window.addEventListener("load", () => {
            window.print();
            setTimeout(() => window.close(), 500);
          });
        <\/script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function confirmStaticQrisPayment() {
  if (!pendingPayment?.id || !isOfflineQrisPayment()) return;
  try {
    const paid = confirmPendingPayment();
    if (paid.status !== "paid") throw new Error("Pembayaran QRIS belum berhasil dikonfirmasi.");
    closeQrisPaymentModal();
    if (paymentIntentContext?.source === "bill") {
      const billOrder = state.transactions.find((order) => order.id === paymentIntentContext.orderId);
      if (billOrder) renderBillDetail(billOrder, true, paymentIntentContext.mode);
      if (paymentIntentContext.mode === "approve") approvePendingOrder(paymentIntentContext.orderId, paymentMethod);
      else settleTable(paymentIntentContext.orderId, paymentMethod);
      return;
    }
    renderPaymentPanel(paid.amount);
    byId("checkout-note").textContent = "Pembayaran QRIS dikonfirmasi. Menyimpan pesanan...";
    const cartCountBeforeCheckout = cart.length;
    const saved = checkout();
    if (saved && cartCountBeforeCheckout > 0 && cart.length === 0) {
      showAlert("Pembayaran QRIS dikonfirmasi dan pesanan masuk ke antrian.");
    } else if (!saved) {
      showAlert(byId("checkout-note").textContent || "Pesanan belum berhasil disimpan.", "error");
    }
  } catch (error) {
    byId("checkout-note").textContent = error.message;
    showAlert(error.message, "error");
  }
}

function createPaymentRequest(amount, orderNumber, paymentFee = { amount: 0, payer: "merchant" }) {
  const method = selectedPaymentMethod();
  if (!method) throw new Error("Metode bayar tidak ditemukan.");
  const response = apiPost("/api/payment-transaction", scopedPayload({
    orderNumber,
    paymentMethodId: method.id,
    amount,
    paymentFeeAmount: Number(paymentFee.amount || 0),
    paymentFeePayer: paymentFee.payer || "merchant"
  }, state, session));
  if (!response?.ok) throw new Error(response?.message || "Payment request belum berhasil dibuat.");
  pendingPayment = { ...response.data, amount, methodName: method.name };
  if (paymentIntentContext?.source === "bill") pendingPayment.contextOrderId = paymentIntentContext.orderId;
  if (["failed", "cancelled", "expired"].includes(pendingPayment.status)) {
    throw new Error(pendingPayment.errorMessage || `Payment ${pendingPayment.status}. Periksa konfigurasi ${selectedPaymentGatewayLabel()}.`);
  }
  if (isQrisPayment()) openQrisPaymentModal(pendingPayment);
  if (isCardPayment()) openCardPaymentModal(pendingPayment);
  return pendingPayment;
}

function confirmPendingPayment() {
  if (!pendingPayment?.id) throw new Error("Payment request belum dibuat.");
  const response = apiPut(`/api/payment-transaction/${pendingPayment.id}/confirm`, scopedPayload({}, state, session));
  if (!response?.ok) throw new Error(response?.message || "Payment belum berhasil dikonfirmasi.");
  pendingPayment = { ...response.data, amount: pendingPayment.amount, methodName: pendingPayment.methodName, contextOrderId: pendingPayment.contextOrderId };
  return pendingPayment;
}

function refreshPendingPaymentStatus() {
  if (!pendingPayment?.id) return pendingPayment;
  if (["xendit", "midtrans"].includes(pendingPayment.provider) && (pendingPayment.methodType || selectedPaymentType()) === "card" && pendingPayment.reference) {
    apiPost(`/api/public/card-payment/${encodeURIComponent(pendingPayment.reference)}/sync`, { source: "pos_polling" });
  }
  const response = apiGet(scopedApiUrl(`/api/payment-transaction/${pendingPayment.id}`, state, session));
  if (response?.ok) {
    pendingPayment = {
      ...pendingPayment,
      ...response.data,
      amount: pendingPayment.amount,
      methodName: pendingPayment.methodName,
      contextOrderId: pendingPayment.contextOrderId
    };
    if (paymentIntentContext?.source === "bill") {
      const order = state.transactions.find((item) => item.id === paymentIntentContext.orderId);
      if (order && !byId("bill-detail-modal").hidden) renderBillDetail(order, true, paymentIntentContext.mode);
    } else {
      renderPaymentPanel(pendingPayment.amount);
    }
  }
  return pendingPayment;
}

function isAnyPaymentModalOpen() {
  return !byId("qris-payment-modal")?.hidden || !byId("card-payment-modal")?.hidden;
}

function stopPaymentStatusPolling() {
  if (paymentPollTimer) window.clearInterval(paymentPollTimer);
  paymentPollTimer = null;
}

function startPaymentStatusPolling(type = selectedPaymentType()) {
  stopPaymentStatusPolling();
  if (!pendingPayment?.id || pendingPayment.status === "paid") return;
  const poll = () => pollPendingPaymentStatus(type);
  window.setTimeout(poll, 3000);
  paymentPollTimer = window.setInterval(poll, 60000);
}

function pollPendingPaymentStatus(type = selectedPaymentType()) {
  if (!pendingPayment?.id || autoCheckoutInProgress || !isAnyPaymentModalOpen()) return;
  const previousStatus = pendingPayment.status;
  refreshPendingPaymentStatus();
  if (!pendingPayment?.id) return;
  if (pendingPayment.status === "paid") {
    autoCheckoutInProgress = true;
    stopPaymentStatusPolling();
    closeQrisPaymentModal();
    closeCardPaymentModal();
    if (paymentIntentContext?.source === "bill") {
      if (paymentIntentContext.mode === "approve") approvePendingOrder(paymentIntentContext.orderId, paymentMethod);
      else settleTable(paymentIntentContext.orderId, paymentMethod);
      autoCheckoutInProgress = false;
      return;
    }
    renderPaymentPanel(pendingPayment.amount);
    byId("checkout-note").textContent = "Pembayaran sukses. Pesanan sedang disimpan otomatis...";
    const cartCountBeforeCheckout = cart.length;
    const saved = checkout();
    autoCheckoutInProgress = false;
    if (saved && cartCountBeforeCheckout > 0 && cart.length === 0) {
      showAlert("Pembayaran sukses dan pesanan otomatis masuk ke antrian.");
    } else if (!saved && cartCountBeforeCheckout > 0) {
      showAlert(byId("checkout-note").textContent || "Pembayaran sukses, tetapi pesanan belum berhasil dibuat.", "error");
    }
    return;
  }
  if (["failed", "cancelled", "expired"].includes(pendingPayment.status)) {
    stopPaymentStatusPolling();
    const message = `Payment ${pendingPayment.status}. Buat payment request baru.`;
    if (type === "qris") byId("qris-payment-note").textContent = message;
    if (type === "card") byId("card-payment-note").textContent = message;
    byId("checkout-note").textContent = message;
    showAlert(message, "error");
    return;
  }
  if (pendingPayment.status !== previousStatus) {
    if (paymentIntentContext?.source === "bill") {
      const order = state.transactions.find((item) => item.id === paymentIntentContext.orderId);
      if (order && !byId("bill-detail-modal").hidden) renderBillDetail(order, true, paymentIntentContext.mode);
    } else {
      renderPaymentPanel(pendingPayment.amount);
    }
  }
}

function simulatedXenditWebhookPayload() {
  const now = new Date().toISOString();
  const numericId = String(pendingPayment?.id || "paytxn-0").replace(/\D/g, "") || Date.now();
  return {
    event: "payment.capture",
    created: now,
    data: {
      payment_id: `py-sim-${numericId}-${Date.now()}`,
      payment_request_id: pendingPayment.reference,
      reference_id: pendingPayment.reference,
      type: "PAY",
      country: "ID",
      currency: "IDR",
      request_amount: Number(pendingPayment.amount || 0),
      capture_method: "AUTOMATIC",
      channel_code: isCardPayment() ? "CARDS" : "QRIS",
      status: "SUCCEEDED",
      captures: [{
        capture_id: `cap-sim-${numericId}-${Date.now()}`,
        capture_amount: Number(pendingPayment.amount || 0),
        capture_timestamp: now
      }],
      metadata: {
        simulation: true,
        source: "if_instrument_pos_sandbox"
      }
    }
  };
}

function simulatePendingPayment() {
  if (!pendingPayment?.id) {
    byId("checkout-note").textContent = "Payment request belum dibuat.";
    return;
  }
  const webhook = apiPost("/api/webhook/xendit", simulatedXenditWebhookPayload());
  if (!webhook?.ok) {
    byId("checkout-note").textContent = webhook?.message || "Webhook simulasi Xendit belum berhasil.";
    return;
  }
  pendingPayment = { ...webhook.data, amount: pendingPayment.amount, methodName: pendingPayment.methodName, contextOrderId: pendingPayment.contextOrderId };
  closeQrisPaymentModal();
  closeCardPaymentModal();
  if (paymentIntentContext?.source === "bill") {
    const billOrder = state.transactions.find((order) => order.id === paymentIntentContext.orderId);
    if (billOrder) renderBillDetail(billOrder, true, paymentIntentContext.mode);
    if (paymentIntentContext.mode === "approve") approvePendingOrder(paymentIntentContext.orderId, paymentMethod);
    else settleTable(paymentIntentContext.orderId, paymentMethod);
    return;
  }
  renderPaymentPanel(pendingPayment.amount);
  byId("checkout-note").textContent = "Simulasi Xendit berhasil: payment dianggap terbayar. Menyimpan pesanan...";
  const cartCountBeforeCheckout = cart.length;
  const saved = checkout();
  if (saved && cartCountBeforeCheckout > 0 && cart.length === 0) {
    showAlert("Pembayaran sukses dan pesanan berhasil dibuat.");
  } else if (!saved && cartCountBeforeCheckout > 0) {
    showAlert(byId("checkout-note").textContent || "Pembayaran sukses, tetapi pesanan belum berhasil dibuat.", "error");
  }
}

function paymentMetaForCheckout(total, orderNumber, paymentFee = { amount: 0, payer: "merchant" }) {
  paymentIntentContext = { source: "checkout" };
  if (isCashPayment()) {
    const tendered = Number(byId("cash-tendered").value || 0);
    if (tendered < total) throw new Error("Nominal bayar cash belum cukup.");
    return {
      cashTendered: tendered,
      changeDue: tendered - total,
      provider: "cashier",
      reference: `CASH-${orderNumber}`,
    };
  }
  if (isThirdPartyPayment()) {
    if (!pendingPayment) {
      createPaymentRequest(total, orderNumber, paymentFee);
      throw new Error(`${selectedPaymentType() === "qris" ? "QRIS dinamis" : "Request kartu"} dibuat. Konfirmasi setelah pembayaran sukses.`);
    }
    refreshPendingPaymentStatus();
    if (isQrisPayment() && pendingPayment.qrPayload && pendingPayment.status !== "paid") openQrisPaymentModal(pendingPayment);
    if (isCardPayment() && pendingPayment.status !== "paid") openCardPaymentModal(pendingPayment);
    if (["failed", "cancelled", "expired"].includes(pendingPayment.status)) {
      throw new Error(`Payment ${pendingPayment.status}. Buat payment request baru.`);
    }
    if (["xendit", "midtrans"].includes(pendingPayment.provider) && pendingPayment.status !== "paid") {
      throw new Error(`Menunggu status pembayaran sukses dari ${paymentGatewayLabel(pendingPayment.provider)}.`);
    }
    const paid = pendingPayment.status === "paid" ? pendingPayment : confirmPendingPayment();
    if (paid.status !== "paid") throw new Error("Payment belum sukses.");
    return {
      provider: paid.provider,
      reference: paid.reference,
      transactionId: paid.id,
    };
  }
  return { provider: "offline", reference: `${paymentMethod}-${orderNumber}` };
}

function sameModifierSet(first = [], second = []) {
  return first.length === second.length && [...first].sort().every((id, index) => id === [...second].sort()[index]);
}

function originalEditingItems() {
  const order = editingOrder();
  return order ? (order.items || []).filter((item) => !item.isPackaging && item.productId) : [];
}

function originalEditingQty(productId, modifierIds = []) {
  return originalEditingItems()
    .filter((item) => item.productId === productId && sameModifierSet(item.modifierIds || [], modifierIds))
    .reduce((sum, item) => sum + Number(item.qty || 0), 0);
}

function availableForCartLine(product, modifierIds = []) {
  return productAvailabilityWithModifiers(state, product, modifierIds) + originalEditingQty(product.id, modifierIds);
}

function canIncreaseCartLine(line) {
  const product = productById(state, line.productId);
  return product ? canApplyCartDraft(replaceCartLineDraft(line.id, { ...line, qty: Number(line.qty || 0) + 1 })).ok : false;
}

function releasedIngredientQty(items = []) {
  const released = new Map();
  items.forEach((item) => {
    const usage = Array.isArray(item.recipeUsage) && item.recipeUsage.length
      ? item.recipeUsage
      : orderLineIngredients(item, Number(item.qty) || 0);
    usage.forEach((line) => {
      if (line.ingredientId) released.set(line.ingredientId, (released.get(line.ingredientId) || 0) + Number(line.qty || 0));
    });
  });
  return released;
}

function releasedProductQty(items = []) {
  const released = new Map();
  items.forEach((item) => {
    const product = productById(state, item.productId);
    if (product && isStockedProduct(product)) released.set(product.id, (released.get(product.id) || 0) + Number(item.qty || 0));
  });
  return released;
}

function pendingIngredientQty(ingredientId) {
  return (state.transactions || [])
    .filter((order) => orderStatusIs(order.status, ORDER_STATUS.PENDING_CASHIER))
    .flatMap((order) => order.items || order.lastOrderItems || [])
    .reduce((sum, item) => {
      if (item.isPackaging) return item.ingredientId === ingredientId ? sum + Number(item.qty || 0) : sum;
      const usage = Array.isArray(item.recipeUsage) && item.recipeUsage.length ? item.recipeUsage : orderLineIngredients(item, Number(item.qty) || 0);
      return sum + usage
        .filter((line) => line.ingredientId === ingredientId)
        .reduce((lineSum, line) => lineSum + Number(line.qty || 0), 0);
    }, 0);
}

function pendingProductQty(productId) {
  return (state.transactions || [])
    .filter((order) => orderStatusIs(order.status, ORDER_STATUS.PENDING_CASHIER))
    .flatMap((order) => order.items || order.lastOrderItems || [])
    .filter((item) => !item.isPackaging && item.productId === productId)
    .reduce((sum, item) => sum + Number(item.qty || 0), 0);
}

function replaceCartLineDraft(lineId, nextLine) {
  return cart
    .map((item) => item.id === lineId ? nextLine : item)
    .filter((item) => Number(item.qty || 0) > 0);
}

function draftProductUsage(draft = cart) {
  const usage = new Map();
  draft.forEach((line) => {
    const product = productById(state, line.productId);
    if (product && isStockedProduct(product)) usage.set(product.id, (usage.get(product.id) || 0) + Number(line.qty || 0));
  });
  return usage;
}

function draftIngredientUsage(draft = cart) {
  const usage = new Map();
  draft.forEach((line) => {
    const product = productById(state, line.productId);
    if (!product || isStockedProduct(product)) return;
    orderLineIngredients(line, Number(line.qty || 0)).forEach((recipeLine) => {
      if (recipeLine.ingredientId) usage.set(recipeLine.ingredientId, (usage.get(recipeLine.ingredientId) || 0) + Number(recipeLine.qty || 0));
    });
  });
  return usage;
}

function canApplyCartDraft(draft = cart) {
  if (!editingOrder()) {
    for (const line of draft) {
      const product = productById(state, line.productId);
      if (!product || productAvailabilityWithModifiers(state, product, line.modifierIds || []) < Number(line.qty || 0)) {
        return { ok: false, name: product?.name || "produk" };
      }
    }
    return { ok: true };
  }

  const releasedProducts = releasedProductQty(originalEditingItems());
  const releasedIngredients = releasedIngredientQty(originalEditingItems());
  const productUsage = draftProductUsage(draft);
  for (const [productId, qty] of productUsage.entries()) {
    const product = productById(state, productId);
    const available = Math.max(0, Number(product?.finishedStock || 0) - pendingProductQty(productId) + (releasedProducts.get(productId) || 0));
    if (qty > available) return { ok: false, name: product?.name || "produk" };
  }

  const ingredientUsage = draftIngredientUsage(draft);
  for (const [ingredientId, qty] of ingredientUsage.entries()) {
    const ingredient = state.ingredients.find((item) => item.id === ingredientId);
    const available = Math.max(0, Number(ingredient?.stock || 0) - pendingIngredientQty(ingredientId) + (releasedIngredients.get(ingredientId) || 0));
    if (!ingredient || ingredient.status === "inactive" || qty > available) return { ok: false, name: ingredient?.name || "bahan" };
  }
  return { ok: true };
}

function draftWithAddedProduct(productId, modifierIds = []) {
  const key = `${productId}:${[...modifierIds].sort().join(",")}`;
  const current = cart.find((item) => item.id === key);
  return current
    ? replaceCartLineDraft(current.id, { ...current, qty: Number(current.qty || 0) + 1 })
    : [...cart, { id: key, productId, modifierIds: [...modifierIds], qty: 1 }];
}

function modifierCandidateSets(product) {
  const options = productModifierOptions(state, product);
  if (!options.length) return [[]];
  const groups = options.reduce((map, option) => {
    if (!map.has(option.groupId)) map.set(option.groupId, []);
    map.get(option.groupId).push(option);
    return map;
  }, new Map());
  const requiredDefaults = [...groups.values()]
    .filter((groupOptions) => groupOptions[0]?.groupRequired)
    .map((groupOptions) => groupOptions[0].id);
  return [
    requiredDefaults,
    ...options.map((option) => {
      const otherRequired = [...groups.values()]
        .filter((groupOptions) => groupOptions[0]?.groupRequired && groupOptions[0].groupId !== option.groupId)
        .map((groupOptions) => groupOptions[0].id);
      return [...otherRequired, option.id];
    })
  ];
}

function canAddProductFromCurrentDraft(product) {
  if (productAvailability(state, product) > 0) return true;
  if (!editingOrder()) return false;
  return modifierCandidateSets(product).some((modifierIds) => canApplyCartDraft(draftWithAddedProduct(product.id, modifierIds)).ok);
}

function addConfiguredProduct(productId, modifierIds = []) {
  if (!canUsePermission("pos.transaction", "create", state, session)) {
    byId("checkout-note").textContent = "Anda tidak punya akses untuk membuat transaksi POS.";
    return;
  }
  const product = productById(state, productId);
  if (!product || product.status === "inactive") return;
  const key = `${productId}:${[...modifierIds].sort().join(",")}`;
  const current = cart.find((item) => item.id === key);
  const draft = draftWithAddedProduct(productId, modifierIds);
  const validation = canApplyCartDraft(draft);
  if (!validation.ok) {
    byId("checkout-note").textContent = `Stok bahan tidak cukup untuk ${validation.name || product.name}.`;
    return;
  }
  if (current) current.qty += 1;
  else cart.push({ id: key, productId, modifierIds: [...modifierIds], qty: 1 });
  byId("checkout-note").textContent = "";
  renderProducts();
  renderCart();
}

function changeCartModifiers(lineId, modifierIds = []) {
  const line = cart.find((item) => item.id === lineId);
  if (!line) return false;
  const product = productById(state, line.productId);
  if (!product) return false;
  const nextKey = `${line.productId}:${[...modifierIds].sort().join(",")}`;
  const duplicate = cart.find((item) => item.id === nextKey && item.id !== lineId);
  const nextQty = line.qty + (duplicate?.qty || 0);
  const draft = duplicate
    ? cart.filter((item) => item.id !== lineId).map((item) => item.id === duplicate.id ? { ...item, qty: nextQty } : item)
    : replaceCartLineDraft(lineId, { ...line, id: nextKey, modifierIds: [...modifierIds] });
  const validation = canApplyCartDraft(draft);
  if (!validation.ok) {
    byId("checkout-note").textContent = `Stok bahan tidak cukup untuk kombinasi modifier ${validation.name || product.name}.`;
    return false;
  }
  if (duplicate) {
    duplicate.qty += line.qty;
    cart = cart.filter((item) => item.id !== lineId);
  } else {
    line.id = nextKey;
    line.modifierIds = [...modifierIds];
  }
  byId("checkout-note").textContent = "Modifier item keranjang berhasil diperbarui.";
  renderProducts();
  renderCart();
  return true;
}

function addToCart(productId) {
  const product = productById(state, productId);
  if (!product || product.status === "inactive") return;
  if (!canAddProductFromCurrentDraft(product)) {
    byId("checkout-note").textContent = `${product.name} sold out.`;
    return;
  }
  if (productModifierOptions(state, product).length) openModifierModal(product);
  else addConfiguredProduct(productId);
}

function changeCartQty(lineId, delta) {
  const line = cart.find((item) => item.id === lineId);
  if (!line) return;
  const product = productById(state, line.productId);
  const nextQty = line.qty + delta;
  if (nextQty <= 0) cart = cart.filter((item) => item.id !== lineId);
  else if (canApplyCartDraft(replaceCartLineDraft(lineId, { ...line, qty: nextQty })).ok) {
    line.qty = nextQty;
    byId("checkout-note").textContent = "";
  } else {
    byId("checkout-note").textContent = editingOrder()
      ? `Stok tambahan ${product.name} tidak cukup. Qty order lama hanya dibuka sementara selama edit dan batal jika cancel.`
      : `Stok bahan tidak cukup untuk ${product.name}.`;
  }
  renderProducts();
  renderCart();
}

function changeManualPackagingQty(lineId, delta) {
  const currentLine = packagingManualLines.find((line) => line.id === lineId) || (packagingOverride?.id === lineId ? packagingOverride : null);
  if (!currentLine) return;
  const nextQty = Number(currentLine.qty || 0) + delta;
  if (nextQty <= 0) {
    packagingManualLines = packagingManualLines.filter((line) => line.id !== lineId);
    if (packagingOverride?.id === lineId) packagingOverride = null;
    renderCart();
    return;
  }
  const ingredient = state.ingredients.find((item) => item.id === currentLine.ingredientId);
  if (ingredient && nextQty > Number(ingredient.stock || 0)) {
    byId("checkout-note").textContent = "Stok kemasan tambahan manual tidak cukup.";
    return;
  }
  if (packagingOverride?.id === lineId) packagingOverride = { ...packagingOverride, qty: nextQty };
  else packagingManualLines = packagingManualLines.map((line) => line.id === lineId ? { ...line, qty: nextQty } : line);
  byId("checkout-note").textContent = "";
  renderCart();
}

function openModifierModal(product, selectedModifierIds = [], cartLineId = "") {
  modifierEditingLineId = cartLineId;
  const optionGroups = productModifierOptions(state, product).reduce((groups, modifier) => {
    if (!groups.has(modifier.groupId)) {
      groups.set(modifier.groupId, {
        id: modifier.groupId,
        name: modifier.groupName,
        required: modifier.groupRequired,
        choiceType: modifier.groupChoiceType || "multiple",
        options: []
      });
    }
    groups.get(modifier.groupId).options.push(modifier);
    return groups;
  }, new Map());
  byId("pos-modifier-product-id").value = product.id;
  byId("pos-modifier-title").textContent = product.name;
  byId("pos-modifier-options").innerHTML = [...optionGroups.values()].map((group) => `
    <fieldset class="pos-modifier-group" data-required-modifier-group="${group.required ? group.id : ""}">
      <legend>${group.name} <small>${group.required ? "Wajib" : "Opsional"} · ${group.choiceType === "single" ? "pilih satu" : "bisa pilih beberapa"}</small></legend>
      ${group.options.map((modifier) => `
        <label class="modifier-option">
          <input name="modifier-${group.id}" type="${group.choiceType === "single" ? "radio" : "checkbox"}" value="${modifier.id}" ${selectedModifierIds.includes(modifier.id) ? "checked" : ""} />
          <span><strong>${modifier.name}</strong><small>${modifier.priceDelta ? `+ ${money(modifier.priceDelta)}` : "Tanpa tambahan harga"}</small></span>
        </label>
      `).join("")}
    </fieldset>
  `).join("");
  document.querySelector("[data-modifier-backdrop]").hidden = false;
  byId("pos-modifier-modal").hidden = false;
  document.body.classList.add("modal-open");
}

function closeModifierModal() {
  document.querySelector("[data-modifier-backdrop]").hidden = true;
  byId("pos-modifier-modal").hidden = true;
  modifierEditingLineId = "";
  document.body.classList.remove("modal-open");
}

function packagingPrice(ingredientId) {
  const configured = (state.settings.packagingRules || [])
    .flatMap((rule) => [...(rule.items || []), ...(rule.fallbackItems || [])])
    .find((item) => item.ingredientId === ingredientId);
  return Number(configured?.price || 0);
}

function openPackagingOverride(lineId = "") {
  const packagingIngredients = state.ingredients.filter((item) => item.stock > 0 && item.status !== "inactive" && isOrderLevelPackagingIngredient(item));
  const editingLine = lineId ? (packagingManualLines.find((line) => line.id === lineId) || (packagingOverride?.id === lineId ? packagingOverride : null)) : null;
  const isEditing = Boolean(editingLine);
  const currentPackagingId = editingLine?.ingredientId || resolvedPackaging()[0]?.ingredientId || packagingIngredients[0]?.id || "";
  editingPackagingManualId = editingLine?.id || "";
  byId("packaging-override-title").textContent = isEditing ? "Edit Jumlah Kemasan" : "Tambah Kemasan Tambahan";
  byId("packaging-override-mode").value = editingLine?.treatment === "replacement_loss" ? "replace_damage" : editingLine?.treatment === "replacement_cost" ? "replace_shortage" : "add_chargeable";
  byId("packaging-override-item").innerHTML = state.ingredients
    .filter((item) => item.stock > 0 && item.status !== "inactive" && isOrderLevelPackagingIngredient(item))
    .map((item) => `<option value="${item.id}">${item.name} · stok ${item.stock} ${item.unit} · ${money(packagingPrice(item.id))}</option>`)
    .join("") || `<option value="">Belum ada kemasan order-level di Packaging Rule</option>`;
  byId("packaging-override-item").value = currentPackagingId;
  byId("packaging-override-qty").value = editingLine?.qty || 1;
  document.querySelector("[data-packaging-override-mode-field]").hidden = isEditing;
  document.querySelector("[data-packaging-override-item-field]").hidden = isEditing;
  byId("packaging-override-mode").disabled = isEditing;
  byId("packaging-override-item").disabled = isEditing;
  byId("packaging-override-submit").textContent = isEditing ? "Simpan Jumlah" : "Simpan Kemasan";
  document.querySelector("[data-reset-packaging-override]").hidden = isEditing;
  document.querySelector("[data-packaging-override-backdrop]").hidden = false;
  byId("packaging-override-modal").hidden = false;
  document.body.classList.add("modal-open");
}

function closePackagingOverride() {
  document.querySelector("[data-packaging-override-backdrop]").hidden = true;
  byId("packaging-override-modal").hidden = true;
  editingPackagingManualId = "";
  document.querySelector("[data-packaging-override-mode-field]").hidden = false;
  document.querySelector("[data-packaging-override-item-field]").hidden = false;
  byId("packaging-override-mode").disabled = false;
  byId("packaging-override-item").disabled = false;
  byId("packaging-override-title").textContent = "Tambah Kemasan Tambahan";
  byId("packaging-override-submit").textContent = "Simpan Kemasan";
  document.querySelector("[data-reset-packaging-override]").hidden = false;
  document.body.classList.remove("modal-open");
}

function checkout() {
  if (!canUsePermission("pos.transaction", "create", state, session)) {
    byId("checkout-note").textContent = "Anda tidak punya akses untuk membuat transaksi POS.";
    return false;
  }
  if (!cart.length) return false;
  const payLater = isAssignedPayLater();
  if (!paymentMethod && !payLater) {
    byId("checkout-note").textContent = "Metode bayar aktif belum tersedia. Atur di Pengaturan.";
    return false;
  }
  if (isAssignedPayLater() && !activeOpenOrder() && !byId("pos-table").value) {
    byId("checkout-note").textContent = "Meja aktif belum tersedia. Atur Table Layout di Pengaturan.";
    return false;
  }
  const totals = cartTotals();
  const packagingLines = resolvedPackaging();
  if (needsPackaging() && !packagingLines.length) {
    byId("checkout-note").textContent = packagingResolution.note || "Packaging rule belum tersedia atau stok kemasan tidak cukup. Order tetap diproses tanpa potong stok kemasan otomatis.";
  }
  const packaging = packagingTotals();
  const serviceCharge = serviceType === "Dine In" ? totals.revenue * ((state.settings.dineInServiceRate || 0) / 100) : 0;
  const packagingFee = packaging.revenue;
  const taxableRevenue = totals.revenue + serviceCharge + packagingFee;
  const tax = taxableRevenue * ((state.settings.taxRate || 0) / 100);
  const paymentFee = !payLater && !editingOrderId ? paymentFeeFor(taxableRevenue + tax) : { amount: 0, payer: "merchant", rate: 0 };
  const customerPaymentFee = paymentFee.payer === "customer" ? paymentFee.amount : 0;
  const unavailablePackaging = packagingLines.find((line) => {
    const ingredient = state.ingredients.find((item) => item.id === line.ingredientId);
    return !ingredient || ingredient.stock < line.qty;
  });
  if (unavailablePackaging && !editingOrderId) {
    byId("checkout-note").textContent = `Stok ${unavailablePackaging.name} tidak cukup.`;
    return false;
  }

  const orderItems = cart.map((line) => {
    const product = productById(state, line.productId);
    const modifiers = productModifierOptions(state, product).filter((modifier) => line.modifierIds.includes(modifier.id));
    return { productId: product.id, name: product.name, qty: line.qty, price: product.price + modifierPrice(product, line.modifierIds, state), cogs: productCogsWithModifiers(state, product, line.modifierIds), lossCost: 0, modifierIds: [...line.modifierIds], modifiers: modifiers.map((modifier) => `${modifier.groupName}: ${modifier.name}`) };
  }).concat(packagingLines);

  if (editingOrderId) {
    const edited = editingOrder();
    const payload = salesPayload(editingOrderId, orderItems, totals, packaging, serviceCharge, packagingFee, tax, taxableRevenue, taxableRevenue + tax, {
      orderNumber: edited?.orderNumber,
      paymentFee
    });
    saveEditingOrder(orderItems, payload);
    return true;
  }

  const existingOpenOrder = payLater ? activeOpenOrder() : null;
  const orderNumber = existingOpenOrder?.orderNumber || pendingPayment?.orderNo || `POS-${String(state.transactions.length + 1).padStart(5, "0")}`;
  let paymentMeta = {};
  if (!payLater) {
    try {
      paymentMeta = paymentMetaForCheckout(taxableRevenue + tax + customerPaymentFee, orderNumber, paymentFee);
    } catch (error) {
      byId("checkout-note").textContent = error.message;
      renderPaymentPanel(taxableRevenue + tax);
      return false;
    }
  }

  const baseItems = existingOpenOrder ? [...(existingOpenOrder.items || []), ...orderItems] : orderItems;
  const payloadTotals = existingOpenOrder
    ? {
        revenue: (existingOpenOrder.productRevenue || 0) + totals.revenue,
        cogs: (existingOpenOrder.cogs || 0) + totals.cogs + packaging.cogs,
        packaging: { revenue: (existingOpenOrder.packagingFee || 0) + packagingFee, cogs: 0 },
        serviceCharge: (existingOpenOrder.serviceCharge || 0) + serviceCharge,
        tax: (existingOpenOrder.tax || 0) + tax,
        taxableRevenue: (existingOpenOrder.revenue || 0) + taxableRevenue,
        total: (existingOpenOrder.total || 0) + taxableRevenue + tax + customerPaymentFee,
        packagingLoss: packaging.loss
      }
    : { revenue: totals.revenue, cogs: totals.cogs + packaging.cogs, packaging, serviceCharge, tax, taxableRevenue, total: taxableRevenue + tax + customerPaymentFee, packagingLoss: packaging.loss };

  try {
    const orderPayload = salesPayload(existingOpenOrder?.id || "", baseItems, {
      revenue: payloadTotals.revenue,
      cogs: payloadTotals.cogs - (payloadTotals.packaging?.cogs || 0)
    }, {
      revenue: payloadTotals.packaging.revenue,
      cogs: payloadTotals.packaging.cogs || 0
    }, payloadTotals.serviceCharge, payloadTotals.packaging.revenue, payloadTotals.tax, payloadTotals.taxableRevenue, payloadTotals.total, {
      existingOpenOrder,
      orderNumber,
      payment: paymentMeta,
      paymentFee
    });
    const savedOrder = existingOpenOrder?.id ? putSales(`/api/order/${existingOpenOrder.id}`, orderPayload) : postSales("/api/order", orderPayload);
    autoPrintPaidOrder(savedOrder);
  } catch (error) {
    byId("checkout-note").textContent = error.message;
    return false;
  }

  cart = [];
  packagingOverride = null;
  packagingManualLines = [];
  pendingPayment = null;
  byId("pos-pickup-name").value = "";
  if (byId("cash-tendered")) byId("cash-tendered").value = "";
  renderDiningTableOptions();
  renderProducts();
  renderCart();
  renderPosQueue();
  renderApprovalCount();
  renderOpenTableSessions();
  renderActiveOpenOrderContext();
  byId("checkout-note").textContent = payLater
    ? `${orderNumber} ${existingOpenOrder ? "ditambahkan ke" : "membuka"} ${existingOpenOrder?.tableName || (serviceType === "Dine In" ? byId("pos-table").value : "table")} dan masuk Antrian Pesanan.`
    : `${orderNumber} tersimpan dan masuk Antrian Pesanan.`;
  showAlert(payLater ? "Pesanan berhasil dikirim ke antrian." : "Pembayaran sukses dan pesanan berhasil dibuat.");
  return true;
}

function consumeLots(ingredient, qty) {
  if (costingMethod(state) !== "fifo") return;
  let remaining = qty;
  const lots = [...(ingredient.lots || [])]
    .filter((lot) => lot.remainingQty > 0)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  lots.forEach((lot) => {
    if (remaining <= 0) return;
    const used = Math.min(remaining, lot.remainingQty);
    lot.remainingQty -= used;
    remaining -= used;
  });
}

document.addEventListener("click", (event) => {
  if (event.target.closest("#open-pos-queue")) openPosQueue();
  if (event.target.closest("[data-close-pos-queue]") || event.target.matches("[data-pos-queue-backdrop]")) closePosQueue();
  if (event.target.closest("#open-pos-approvals")) openPosApprovals();
  if (event.target.closest("[data-close-pos-approvals]") || event.target.matches("[data-pos-approval-backdrop]")) closePosApprovals();
  if (event.target.closest("#open-pos-tables")) openPosTables();
  if (event.target.closest("[data-close-pos-tables]") || event.target.matches("[data-pos-table-backdrop]")) closePosTables();

  const queueAction = event.target.closest("[data-pos-order-status]");
  if (queueAction) {
    const order = state.transactions.find((item) => item.id === queueAction.dataset.posOrderStatus);
    if (order && canActOnOrderStatus(order.status)) {
      const visibleItems = posOrderVisibleItems(order);
      const allReady = visibleItems.every((item, index) => (order.readyItemKeys || []).includes(posOrderItemKey(item, index)));
      if (orderStatusIs(order.status, ORDER_STATUS.PREPARING) && !allReady) return;
      try {
        putSales(`/api/order/${order.id}/status`, { status: queueAction.dataset.nextStatus });
        closePosOrderDetail();
        renderPosQueue();
        renderOpenTableSessions();
      } catch (error) {
        byId("checkout-note").textContent = error.message;
      }
    }
  }

  const queueDetail = event.target.closest("[data-pos-order-detail]");
  if (queueDetail) openPosOrderDetail(state.transactions.find((order) => order.id === queueDetail.dataset.posOrderDetail && visibleForSession(order, state, session)));

  const approvalDetail = event.target.closest("[data-pos-approval-detail]");
  if (approvalDetail) openPosOrderDetail(state.transactions.find((order) => order.id === approvalDetail.dataset.posApprovalDetail && visibleForSession(order, state, session)));

  const approveQueueOrder = event.target.closest("[data-pos-order-approve]");
  if (approveQueueOrder) {
    const order = state.transactions.find((item) => item.id === approveQueueOrder.dataset.posOrderApprove);
    if (order && orderStatusIs(order.status, ORDER_STATUS.PENDING_CASHIER) && canActOnOrderStatus(order.status)) openBillDetail(order.id, true, "approve");
  }

  const rejectQueueOrder = event.target.closest("[data-pos-order-reject]");
  if (rejectQueueOrder) {
    const order = state.transactions.find((item) => item.id === rejectQueueOrder.dataset.posOrderReject);
    if (order && orderStatusIs(order.status, ORDER_STATUS.PENDING_CASHIER) && canActOnOrderStatus(order.status)) {
      try {
        putSales(`/api/order/${order.id}/status`, { status: ORDER_STATUS.CANCELLED });
        closePosOrderDetail();
        renderPosQueue();
        renderPosApprovals();
        renderOpenTableSessions();
        renderProducts();
        byId("checkout-note").textContent = `${order.orderNumber} ditolak. Hold stok dilepas.`;
      } catch (error) {
        byId("checkout-note").textContent = error.message;
      }
    }
  }

  const editQueueOrder = event.target.closest("[data-pos-order-edit]");
  if (editQueueOrder) openPosOrderEdit(editQueueOrder.dataset.posOrderEdit);

  const closeTableButton = event.target.closest("[data-close-table-order]");
  if (closeTableButton) {
    if (!canUsePermission("pos.payment", "create", state, session)) return;
    const order = state.transactions.find((item) => item.id === closeTableButton.dataset.closeTableOrder);
    const methodSelect = document.querySelector(`[data-table-payment-method="${closeTableButton.dataset.closeTableOrder}"]`);
    if (order) {
      if (methodSelect?.value) setActivePaymentMethod(methodSelect.value);
      openBillDetail(order.id, true);
    }
  }

  const confirmCloseTableButton = event.target.closest("[data-confirm-close-table]");
  if (confirmCloseTableButton) {
    if (!canUsePermission("pos.payment", "create", state, session)) return;
    settleTable(confirmCloseTableButton.dataset.confirmCloseTable, byId("bill-settlement-method")?.value);
  }

  const confirmApproveOrderButton = event.target.closest("[data-confirm-approve-order]");
  if (confirmApproveOrderButton) {
    approvePendingOrder(confirmApproveOrderButton.dataset.confirmApproveOrder, byId("bill-settlement-method")?.value);
  }

  const moveTableButton = event.target.closest("[data-move-table-order]");
  if (moveTableButton) {
    if (!canUsePermission("pos.orderEdit", "update", state, session)) return;
    const order = state.transactions.find((item) => item.id === moveTableButton.dataset.moveTableOrder);
    const targetSelect = document.querySelector(`[data-move-table-target="${moveTableButton.dataset.moveTableOrder}"]`);
    const targetTable = targetSelect?.value || "";
    if (order && targetTable && targetTable !== order.tableName) {
      if (openOrderForTable(targetTable)) {
        byId("checkout-note").textContent = `${targetTable} masih terisi. Pilih meja kosong untuk pindah.`;
        return;
      }
      const previousTable = order.tableName;
      try {
        putSales(`/api/order/${order.id}/move-table`, { tableName: targetTable });
        renderDiningTableOptions();
        renderOpenTableSessions();
        renderPosQueue();
        renderCart();
        byId("checkout-note").textContent = `${order.orderNumber} pindah dari ${previousTable} ke ${targetTable}.`;
      } catch (error) {
        byId("checkout-note").textContent = error.message;
      }
    }
  }

  const addToOpenTableButton = event.target.closest("[data-add-to-open-table]");
  if (addToOpenTableButton) {
    if (!canUsePermission("pos.transaction", "create", state, session)) return;
    if (editingOrder()) {
      byId("checkout-note").textContent = "Selesaikan atau batalkan edit pesanan dulu.";
      return;
    }
    const order = state.transactions.find((item) => item.id === addToOpenTableButton.dataset.addToOpenTable);
    if (order) {
      serviceType = "Dine In";
      activeOpenOrderId = order.id;
      document.querySelectorAll(".service-mode").forEach((button) => button.classList.toggle("active", button.textContent.trim() === "Dine In"));
      byId("pos-pickup-field").hidden = true;
      byId("pos-pickup-name").required = false;
      closePosTables();
      renderDiningTableOptions();
      renderPaymentMethods();
      renderOpenTableSessions();
      renderCart();
      renderActiveOpenOrderContext();
    }
  }

  const viewTableBillButton = event.target.closest("[data-view-table-bill]");
  if (viewTableBillButton) openBillDetail(viewTableBillButton.dataset.viewTableBill);

  if (event.target.closest("[data-cancel-open-table-add]")) cancelOpenTableAdd();
  if (event.target.closest("[data-cancel-order-edit]")) cancelOrderEdit();

  const addButton = event.target.closest("[data-add-product]");
  if (addButton) addToCart(addButton.dataset.addProduct);

  const detailButton = event.target.closest("[data-product-detail]");
  if (detailButton) openProductDetail(detailButton.dataset.productDetail);

  const detailAddButton = event.target.closest("[data-add-from-detail]");
  if (detailAddButton) {
    addToCart(detailAddButton.dataset.addFromDetail);
    closeProductDetail();
  }

  if (event.target.closest("[data-close-product-detail]") || event.target.matches("[data-product-detail-backdrop]")) closeProductDetail();
  if (event.target.closest("[data-close-pos-modifier]") || event.target.matches("[data-modifier-backdrop]")) closeModifierModal();
  if (event.target.closest("[data-close-qris-payment]") || event.target.matches("[data-qris-payment-backdrop]")) closeQrisPaymentModal();
  if (event.target.closest("[data-print-qris-payment]")) printQrisPayment();
  if (event.target.closest("[data-confirm-static-qris-payment]")) confirmStaticQrisPayment();
  if (event.target.closest("[data-simulate-qris-payment]")) simulatePendingPayment();
  if (event.target.closest("[data-close-card-payment]") || event.target.matches("[data-card-payment-backdrop]")) closeCardPaymentModal();
  if (event.target.closest("[data-simulate-card-payment]")) simulatePendingPayment();
  if (event.target.closest("#open-card-payment-link")) openCardPaymentLink();
  if (event.target.closest("#print-card-payment-qr")) printCardPaymentQr();
  if (event.target.closest("#open-packaging-override")) openPackagingOverride();
  if (event.target.closest("[data-close-packaging-override]") || event.target.matches("[data-packaging-override-backdrop]")) closePackagingOverride();
  if (event.target.closest("[data-close-bill-detail]") || event.target.matches("[data-bill-detail-backdrop]")) closeBillDetail();
  const packagingPlusButton = event.target.closest("[data-packaging-plus]");
  if (packagingPlusButton) changeManualPackagingQty(packagingPlusButton.dataset.packagingPlus, 1);
  const packagingMinusButton = event.target.closest("[data-packaging-minus]");
  if (packagingMinusButton) changeManualPackagingQty(packagingMinusButton.dataset.packagingMinus, -1);
  if (event.target.closest("[data-reset-packaging-override]")) {
    packagingOverride = null;
    packagingManualLines = [];
    closePackagingOverride();
    renderCart();
  }

  const plusButton = event.target.closest("[data-cart-plus]");
  if (plusButton) changeCartQty(plusButton.dataset.cartPlus, 1);

  const minusButton = event.target.closest("[data-cart-minus]");
  if (minusButton) changeCartQty(minusButton.dataset.cartMinus, -1);

  const modifierEditButton = event.target.closest("[data-cart-modifier-edit]");
  if (modifierEditButton) {
    const line = cart.find((item) => item.id === modifierEditButton.dataset.cartModifierEdit);
    const product = line ? productById(state, line.productId) : null;
    if (product) openModifierModal(product, line.modifierIds || [], line.id);
  }

  const serviceButton = event.target.closest(".service-mode");
  if (serviceButton) {
    if (editingOrder()) {
      byId("checkout-note").textContent = "Selesaikan atau batalkan edit pesanan dulu.";
      return;
    }
    document.querySelectorAll(".service-mode").forEach((button) => button.classList.remove("active"));
    serviceButton.classList.add("active");
    serviceType = serviceButton.dataset.serviceType || serviceButton.textContent.trim();
    activeOpenOrderId = "";
    byId("pos-table").disabled = !isAssignedPayLater();
    byId("pos-pickup-field").hidden = !usesNameCodeField();
    byId("pos-pickup-name").required = false;
    byId("checkout-note").textContent = "";
    packagingOverride = null;
    packagingManualLines = [];
    renderDiningTableOptions();
    renderPaymentMethods();
    renderOpenTableSessions();
    renderCart();
    renderActiveOpenOrderContext();
  }

  const categoryButton = event.target.closest("[data-pos-category]");
  if (categoryButton) {
    productCategory = categoryButton.dataset.posCategory;
    document.querySelectorAll("[data-pos-category]").forEach((button) => button.classList.toggle("active", button === categoryButton));
    renderProducts();
  }

  const paymentButton = event.target.closest("[data-payment]");
  if (paymentButton) {
    paymentMethod = paymentButton.dataset.payment;
    pendingPayment = null;
    document.querySelectorAll("[data-payment]").forEach((button) => button.classList.toggle("active", button === paymentButton));
    renderCart();
  }
});

document.addEventListener("change", (event) => {
  if (event.target?.id === "bill-settlement-method") {
    setActivePaymentMethod(event.target.value);
    pendingPayment = null;
    const orderId = paymentIntentContext?.orderId || byId("bill-detail-content")?.dataset.orderId || "";
    const mode = paymentIntentContext?.mode || byId("bill-detail-content")?.dataset.mode || "settle";
    const order = state.transactions.find((item) => item.id === orderId);
    if (order) {
      paymentIntentContext = { source: "bill", orderId: order.id, mode };
      renderBillDetail(order, true, mode);
    }
  }
});

document.addEventListener("input", (event) => {
  if (event.target?.id === "bill-cash-tendered") updateBillCashChange();
});

document.addEventListener("change", (event) => {
  const readyItem = event.target.closest("[data-pos-ready-item]");
  if (!readyItem) return;
  const order = state.transactions.find((item) => item.id === readyItem.dataset.posReadyOrder);
  if (!order || !canActOnOrderStatus(order.status)) return;
  order.readyItemKeys = order.readyItemKeys || [];
  if (readyItem.checked && !order.readyItemKeys.includes(readyItem.dataset.posReadyItem)) order.readyItemKeys.push(readyItem.dataset.posReadyItem);
  if (!readyItem.checked) order.readyItemKeys = order.readyItemKeys.filter((key) => key !== readyItem.dataset.posReadyItem);
  try {
    putSales(`/api/order/${order.id}/ready-items`, { readyItemKeys: order.readyItemKeys });
  } catch (error) {
    byId("checkout-note").textContent = error.message;
  }
  expandedPosOrderId = order.id;
  renderPosQueue();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeProductDetail();
    closePosOrderDetail();
    closeModifierModal();
    closePackagingOverride();
    closeQrisPaymentModal();
    closeBillDetail();
    closePosQueue();
    closePosTables();
  }
});

byId("pos-modifier-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const missingRequired = [...event.target.querySelectorAll("[data-required-modifier-group]")]
    .filter((group) => group.dataset.requiredModifierGroup && !group.querySelector("input:checked"));
  if (missingRequired.length) {
    byId("checkout-note").textContent = "Pilih opsi modifier wajib terlebih dahulu.";
    return;
  }
  const modifierIds = [...event.target.querySelectorAll('.modifier-option input:checked')].map((input) => input.value);
  const editingLineId = modifierEditingLineId;
  if (editingLineId && !changeCartModifiers(editingLineId, modifierIds)) return;
  if (!editingLineId) addConfiguredProduct(byId("pos-modifier-product-id").value, modifierIds);
  closeModifierModal();
});
byId("packaging-override-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const editingLine = editingPackagingManualId
    ? (packagingManualLines.find((item) => item.id === editingPackagingManualId) || (packagingOverride?.id === editingPackagingManualId ? packagingOverride : null))
    : null;
  const ingredientId = editingLine?.ingredientId || byId("packaging-override-item").value;
  const ingredient = state.ingredients.find((item) => item.id === ingredientId);
  const qty = Number(byId("packaging-override-qty").value);
  if (!ingredient || !isOrderLevelPackagingIngredient(ingredient)) {
    byId("checkout-note").textContent = "Pilih kemasan yang terdaftar di Packaging Rule. Cup/lid per produk masuk lewat Recipe, bukan Tambah Kemasan POS.";
    return;
  }
  if (qty > ingredient.stock) {
    byId("checkout-note").textContent = "Stok kemasan tambahan manual tidak cukup.";
    return;
  }
  if (editingLine) {
    const updatedLine = { ...editingLine, qty };
    if (packagingOverride?.id === editingPackagingManualId) packagingOverride = updatedLine;
    else packagingManualLines = packagingManualLines.map((item) => item.id === editingPackagingManualId ? updatedLine : item);
    closePackagingOverride();
    renderCart();
    return;
  }
  const mode = byId("packaging-override-mode").value;
  const treatment = mode === "replace_damage" ? "replacement_loss" : mode === "replace_shortage" ? "replacement_cost" : "chargeable_extra";
  const price = treatment === "chargeable_extra" ? packagingPrice(ingredient.id) : 0;
  const reason = byId("packaging-override-mode").selectedOptions[0]?.textContent || "";
  const line = { id: editingPackagingManualId || `pack-manual-${crypto.randomUUID().slice(0, 8)}`, ingredientId: ingredient.id, qty, price, treatment, reason };
  if (treatment === "replacement_loss" || treatment === "replacement_cost") {
    packagingManualLines = packagingManualLines.filter((item) => item.id !== editingPackagingManualId);
    packagingOverride = line;
  } else if (editingPackagingManualId) {
    if (packagingOverride?.id === editingPackagingManualId) packagingOverride = null;
    packagingManualLines = packagingManualLines.some((item) => item.id === editingPackagingManualId)
      ? packagingManualLines.map((item) => item.id === editingPackagingManualId ? line : item)
      : [...packagingManualLines, line];
  } else packagingManualLines.push(line);
  closePackagingOverride();
  renderCart();
});

byId("checkout").addEventListener("click", checkout);
byId("cash-tendered").addEventListener("input", () => updateCashChange());
byId("pos-product-search").addEventListener("input", (event) => {
  productSearch = event.target.value.trim().toLowerCase();
  renderProducts();
});
byId("pos-table").addEventListener("change", () => {
  activeOpenOrderId = "";
  renderDiningTableOptions();
  renderCart();
  renderActiveOpenOrderContext();
});
refreshSales();
renderServiceModes();
renderCategories();
renderDiningTableOptions();
renderPaymentMethods();
renderOpenTableSessions();
renderProducts();
renderCart();
renderActiveOpenOrderContext();
renderPosQueue();
renderApprovalCount();
focusOrderFromUrl();
setInterval(() => {
  refreshSales();
  renderApprovalCount();
  if (!byId("pos-queue-drawer").hidden) renderPosQueue();
  if (!byId("pos-approval-drawer").hidden) renderPosApprovals();
  if (!byId("pos-table-drawer").hidden) renderOpenTableSessions();
}, 30000);
