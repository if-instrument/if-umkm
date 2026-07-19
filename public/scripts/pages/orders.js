import { renderLayout } from "../layout.js?v=coffee-v151";
import { apiGet, apiPut, applyPermissionControls, canUsePermission, loadSession, loadState, scopedApiUrl, scopedPayload, visibleForSession } from "../store.js?v=coffee-v151";
import { effectiveRecipe, isStockedProduct, productById, productModifierOptions } from "../inventory.js";
import { money } from "../format.js";
import { byId } from "../dom.js";
import { ORDER_STATUS, orderStatusCode, orderStatusIn, orderStatusIs } from "../status-codes.js";

renderLayout();
let state = loadState();
const session = loadSession();
let queueFilter = "active";
const focusOrderId = new URLSearchParams(window.location.search).get("order") || "";

const statusConfig = {
  [ORDER_STATUS.FULFILLMENT]: { label: "Menunggu Pemenuhan", owner: "Inventory", next: ORDER_STATUS.WAITING, nextLabel: "Stok Sudah Siap" },
  [ORDER_STATUS.WAITING]: { label: "Pesanan Baru", owner: "Kitchen", next: ORDER_STATUS.PREPARING, nextLabel: "Mulai Proses" },
  [ORDER_STATUS.PREPARING]: { label: "Sedang Diproses", owner: "Kitchen", next: ORDER_STATUS.READY, nextLabel: "Tandai Siap" },
  [ORDER_STATUS.READY]: { label: "Siap Diambil", owner: "Kasir", next: ORDER_STATUS.COMPLETED, nextLabel: "Pesanan Diambil" },
  [ORDER_STATUS.COMPLETED]: { label: "Telah Diambil", owner: "Kasir", next: "", nextLabel: "" }
};

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function paymentProofMarkup(order) {
  if (!order?.paymentProofUrl) return "";
  const isImage = /\.(png|jpe?g|webp)$/i.test(order.paymentProofUrl);
  return `
    <div class="payment-proof-panel">
      <div>
        <span>Bukti Bayar Customer</span>
        <strong>${escapeHtml(order.paymentProofNote || order.paymentMethod || "Bukti bayar")}</strong>
      </div>
      ${isImage
        ? `<a href="${escapeHtml(order.paymentProofUrl)}" target="_blank" rel="noopener"><img src="${escapeHtml(order.paymentProofUrl)}" alt="Bukti bayar customer" style="max-width:100%;border-radius:8px;margin-top:8px;" /></a>`
        : `<a class="ghost-button compact-button" href="${escapeHtml(order.paymentProofUrl)}" target="_blank" rel="noopener">Buka Bukti Bayar</a>`
      }
    </div>
  `;
}

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

function refreshSales() {
  const settings = apiGet(scopedApiUrl("/api/setting", state, session));
  const categories = apiGet(scopedApiUrl("/api/category?per_page=100", state, session));
  const products = apiGet(scopedApiUrl("/api/product?per_page=100", state, session));
  const modifiers = apiGet(scopedApiUrl("/api/modifier?per_page=100", state, session));
  const ingredients = apiGet(scopedApiUrl("/api/ingredient?per_page=100", state, session));
  const movements = apiGet(scopedApiUrl("/api/stock-movement?per_page=100", state, session));
  const orders = apiGet(scopedApiUrl("/api/order?per_page=100", state, session));
  applySalesData({
    settings: settings?.data || {},
    categories: categories?.data?.items || [],
    products: products?.data?.items || [],
    modifiers: modifiers?.data?.items || [],
    ingredients: ingredients?.data?.items || [],
    stockMovements: movements?.data?.items || [],
    transactions: orders?.data?.items || []
  });
}

function postSales(url, payload) {
  const response = apiPut(url, scopedPayload(payload, state, session));
  if (!response?.ok) throw new Error(response?.message || "Aksi antrian belum berhasil disimpan.");
  refreshSales();
}

function canActOnOrderStatus(status) {
  const code = orderStatusCode(status);
  if (code === ORDER_STATUS.PENDING_CASHIER) return false;
  if (code === ORDER_STATUS.FULFILLMENT) return canUsePermission("queue.cashier", "update", state, session) ||
                                                canUsePermission("queue.kitchen", "update", state, session) ||
                                                canUsePermission("inventory.overview", "update", state, session) ||
                                                canUsePermission("inventory.ingredients", "update", state, session);
  if ([ORDER_STATUS.WAITING, ORDER_STATUS.PREPARING].includes(code)) return canUsePermission("queue.kitchen", "update", state, session);
  if (code === ORDER_STATUS.READY) return canUsePermission("queue.cashier", "update", state, session);
  return false;
}

function isToday(value) {
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function elapsed(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Baru saja";
  if (minutes < 60) return `${minutes} menit`;
  return `${Math.floor(minutes / 60)}j ${minutes % 60}m`;
}

function queueTime(order) {
  return new Date(order.statusUpdatedAt || order.createdAt).getTime();
}

function oldestFirst(orders) {
  return orders.slice().sort((a, b) => queueTime(a) - queueTime(b));
}

function formatQty(value) {
  return Number(value).toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

function itemRecipe(item) {
  if (item.isPackaging) {
    const ingredient = state.ingredients.find((entry) => entry.id === item.ingredientId);
    return ingredient ? [{ name: ingredient.name, unit: ingredient.unit, qty: item.qty }] : [];
  }
  const product = productById(state, item.productId);
  if (!product) return [];
  if (isStockedProduct(product)) return [];
  const modifierIds = item.modifierIds || productModifierOptions(state, product)
    .filter((modifier) => (item.modifiers || []).includes(modifier.name))
    .map((modifier) => modifier.id);
  return effectiveRecipe(product, modifierIds, state).map((line) => {
    const ingredient = state.ingredients.find((entry) => entry.id === line.ingredientId);
    return { name: ingredient?.name || "Bahan tidak ditemukan", unit: ingredient?.unit || "", qty: line.qty * item.qty };
  });
}

function preparationItems(order) {
  const visibleItems = orderStatusIs(order.status, ORDER_STATUS.COMPLETED) ? order.items : (order.lastOrderItems || order.items);
  return visibleItems.map((item, index) => {
    const itemKey = `${item.productId || item.name}-${index}`;
    const checked = (order.readyItemKeys || []).includes(itemKey);
    const product = productById(state, item.productId);
    const showRecipe = item.isPackaging || !product || !isStockedProduct(product);
    const recipeRows = showRecipe ? itemRecipe(item) : [];
    return `
      <article class="preparation-item ${checked ? "ready" : ""}">
        <label class="preparation-item-heading">
          ${orderStatusIs(order.status, ORDER_STATUS.PREPARING) && canActOnOrderStatus(order.status) ? `<input data-ready-item="${itemKey}" data-ready-order="${order.id}" type="checkbox" ${checked ? "checked" : ""} />` : ""}
          <span><strong>${item.qty}x ${item.name}</strong>${item.modifiers?.length ? `<small>${item.modifiers.join(", ")}</small>` : ""}</span>
        </label>
        ${showRecipe ? `<div class="preparation-ingredients">${recipeRows.map((ingredient) => `<div><span>${ingredient.name}</span><strong>${formatQty(ingredient.qty)} ${ingredient.unit}</strong></div>`).join("") || `<p>Recipe belum tersedia.</p>`}</div>` : ""}
      </article>
    `;
  }).join("");
}

function activeStatuses() {
  return [ORDER_STATUS.WAITING, ORDER_STATUS.PREPARING, ORDER_STATUS.READY];
}

function renderSummary(orders) {
  if (queueFilter === "completed") {
    byId("queue-summary").innerHTML = `
      <article class="pos-queue-summary-ready"><span>Pesanan Selesai Hari Ini</span><strong>${orders.filter((order) => orderStatusIs(order.status, ORDER_STATUS.COMPLETED)).length}</strong></article>
    `;
    return;
  }
  byId("queue-summary").innerHTML = activeStatuses().map((status) => `
    <article class="pos-queue-summary-${status}"><span>${statusConfig[status].label}</span><strong>${orders.filter((order) => orderStatusIs(order.status, status)).length}</strong></article>
  `).join("");
}

function orderCard(order) {
  const status = orderStatusCode(order.status);
  const config = statusConfig[status] || statusConfig[ORDER_STATUS.WAITING];
  const visibleItems = orderStatusIs(order.status, ORDER_STATUS.COMPLETED) ? order.items : (order.lastOrderItems || order.items);
  const itemCount = visibleItems.reduce((sum, item) => sum + item.qty, 0);
  return `
    <article class="pos-queue-card status-${status}">
      <div class="pos-queue-card-heading">
        <div><strong>#${order.orderNumber}</strong><span>${order.serviceType}${order.tableName !== "-" ? ` · ${order.tableName}` : order.customerName ? ` · ${order.customerName}` : ""}</span></div>
        <span class="pos-queue-age">${elapsed(order.createdAt)}</span>
      </div>
      <div class="queue-card-footer"><span>${config.owner} · ${itemCount} item</span><button class="ghost-button compact-button" data-order-detail="${order.id}" type="button">Pilih Pesanan</button></div>
    </article>
  `;
}

function queueColumn(status, orders) {
  const config = statusConfig[status];
  const statusOrders = oldestFirst(orders.filter((order) => orderStatusIs(order.status, status)));
  return `
    <section class="pos-queue-column column-${status}">
      <header>
        <div><span>${config.owner}</span><h4>${config.label}</h4></div>
        <strong>${statusOrders.length}</strong>
      </header>
      <div class="pos-queue-column-list">
        ${statusOrders.length ? statusOrders.map(orderCard).join("") : `<div class="pos-queue-empty">Belum ada pesanan</div>`}
      </div>
    </section>
  `;
}

function completedTable(orders) {
  const completedOrders = oldestFirst(orders.filter((order) => orderStatusIs(order.status, ORDER_STATUS.COMPLETED)));
  return `
    <section class="completed-orders-table-panel">
      <div class="completed-orders-table-scroll">
        <table class="completed-orders-table">
          <thead><tr><th>Order</th><th>Waktu Selesai</th><th>Layanan / Meja</th><th>Item Pesanan</th><th>Pembayaran</th><th>Total</th><th>Detail</th></tr></thead>
          <tbody>
            ${completedOrders.length ? completedOrders.map((order) => `
              <tr>
                <td><strong>#${order.orderNumber}</strong><span>${elapsed(order.createdAt)}</span></td>
                <td>${new Date(order.statusUpdatedAt || order.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</td>
                <td>${order.serviceType}${order.tableName !== "-" ? `<span>${order.tableName}</span>` : order.customerName ? `<span>${order.customerName}</span>` : ""}</td>
                <td><div class="completed-order-items">${order.items.map((item) => `<span><strong>${item.qty}x</strong> ${item.name}${item.modifiers?.length ? `<small>${item.modifiers.join(", ")}</small>` : ""}</span>`).join("")}</div></td>
                <td>${order.paymentMethod || "-"}</td>
                <td><strong>${money(order.total)}</strong></td>
                <td><button class="ghost-button compact-button" data-order-detail="${order.id}" type="button">Lihat</button></td>
              </tr>
            `).join("") : `<tr><td class="completed-orders-empty" colspan="7">Belum ada pesanan selesai hari ini.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderBoard() {
  refreshSales();
  const todayOrders = state.transactions.filter((order) => visibleForSession(order, state, session) && isToday(order.createdAt));
  const statuses = activeStatuses();
  const activeOrders = state.transactions.filter((order) => visibleForSession(order, state, session) && orderStatusIn(order.status, statuses));
  const boardOrders = queueFilter === "completed" ? todayOrders : activeOrders;
  renderSummary(boardOrders);
  
  const boardEl = byId("order-board");
  boardEl.classList.toggle("completed-only", queueFilter === "completed");
  if (queueFilter === "completed") {
    boardEl.style.gridTemplateColumns = "none";
    boardEl.innerHTML = completedTable(todayOrders);
  } else {
    boardEl.style.gridTemplateColumns = `repeat(${statuses.length}, minmax(240px, 1fr))`;
    boardEl.innerHTML = statuses.map((status) => queueColumn(status, activeOrders)).join("");
  }
  applyPermissionControls(document, state, session);
}

function focusOrderFromUrl() {
  if (!focusOrderId) return;
  const order = state.transactions.find((item) => item.id === focusOrderId && visibleForSession(item, state, session));
  if (!order) return;
  queueFilter = orderStatusIs(order.status, ORDER_STATUS.COMPLETED) ? "completed" : "active";
  document.querySelectorAll("[data-queue-filter]").forEach((button) => button.classList.toggle("active", button.dataset.queueFilter === queueFilter));
  renderBoard();
  openDetail(order);
}

function openDetail(order) {
  if (!order) return;
  const status = orderStatusCode(order.status);
  const config = statusConfig[status] || statusConfig[ORDER_STATUS.WAITING];
  const visibleItems = orderStatusIs(order.status, ORDER_STATUS.COMPLETED) ? order.items : (order.lastOrderItems || order.items);
  const allReady = visibleItems.every((item, index) => (order.readyItemKeys || []).includes(`${item.productId || item.name}-${index}`));
  const canAct = canActOnOrderStatus(order.status);
  const actionDisabled = orderStatusIs(order.status, ORDER_STATUS.PREPARING) && !allReady;
  byId("order-detail-title").textContent = `#${order.orderNumber}`;
  byId("order-detail-meta").textContent = `${order.serviceType}${order.tableName !== "-" ? ` · ${order.tableName}` : order.customerName ? ` · ${order.customerName}` : ""} · ${elapsed(order.createdAt)}`;
  byId("order-detail-content").innerHTML = `
    <div class="selected-order-meta">
      <article><span>PIC</span><strong>${config.owner}</strong></article>
      <article><span>Status</span><strong>${config.label}</strong></article>
      <article><span>Pembayaran</span><strong>${order.paymentMethod || "-"}</strong></article>
      ${order.packagingNote ? `<article><span>Packaging</span><strong>${order.packagingNote}</strong></article>` : ""}
    </div>
    ${orderStatusIs(order.status, ORDER_STATUS.PREPARING) ? `<div class="preparation-note">${canAct ? "Centang setiap produk yang sudah selesai dibuat." : "Checklist produksi hanya bisa dilakukan oleh user Kitchen."}</div>` : ""}
    ${paymentProofMarkup(order)}
    <div class="preparation-list">${preparationItems(order)}</div>
  `;
  byId("order-detail-actions").innerHTML = `
    <button class="ghost-button" data-close-order-detail type="button">Tutup</button>
    ${config.next && canAct ? `<button class="primary-button" data-selected-order-status="${order.id}" data-next-status="${config.next}" ${actionDisabled ? "disabled" : ""} type="button">${config.nextLabel}</button>` : ""}
  `;
  document.querySelector("[data-order-detail-backdrop]").hidden = false;
  byId("order-detail-modal").hidden = false;
  document.body.classList.add("modal-open");
}

function closeDetail() {
  document.querySelector("[data-order-detail-backdrop]").hidden = true;
  byId("order-detail-modal").hidden = true;
  document.body.classList.remove("modal-open");
}

document.addEventListener("click", (event) => {
  const filter = event.target.closest("[data-queue-filter]");
  if (filter) {
    queueFilter = filter.dataset.queueFilter;
    document.querySelectorAll("[data-queue-filter]").forEach((button) => button.classList.toggle("active", button === filter));
    renderBoard();
  }
  const detail = event.target.closest("[data-order-detail]");
  if (detail) openDetail(state.transactions.find((order) => order.id === detail.dataset.orderDetail && visibleForSession(order, state, session)));
  const status = event.target.closest("[data-selected-order-status]");
  if (status) {
    const order = state.transactions.find((item) => item.id === status.dataset.selectedOrderStatus);
    if (!order || !canActOnOrderStatus(order.status)) return;
    const visibleItems = orderStatusIs(order.status, ORDER_STATUS.COMPLETED) ? order.items : (order.lastOrderItems || order.items);
    const allReady = visibleItems.every((item, index) => (order.readyItemKeys || []).includes(`${item.productId || item.name}-${index}`));
    if (orderStatusIs(order.status, ORDER_STATUS.PREPARING) && !allReady) return;
    
    const originalText = status.textContent;
    status.disabled = true;
    status.textContent = "Memproses...";

    setTimeout(() => {
      try {
        postSales(`/api/order/${order.id}/status`, { status: status.dataset.nextStatus });
        closeDetail();
        renderBoard();
      } catch (error) {
        alert(error?.message || "Aksi pesanan belum berhasil disimpan.");
        status.disabled = false;
        status.textContent = originalText;
        closeDetail();
        renderBoard();
      }
    }, 50);
  }
  if (event.target.closest("[data-close-order-detail]") || event.target.matches("[data-order-detail-backdrop]")) closeDetail();
});
document.addEventListener("change", (event) => {
  const readyItem = event.target.closest("[data-ready-item]");
  if (!readyItem) return;
  const order = state.transactions.find((item) => item.id === readyItem.dataset.readyOrder);
  if (!order) return;
  if (!canActOnOrderStatus(order.status)) return;
  order.readyItemKeys = order.readyItemKeys || [];
  if (readyItem.checked && !order.readyItemKeys.includes(readyItem.dataset.readyItem)) order.readyItemKeys.push(readyItem.dataset.readyItem);
  if (!readyItem.checked) order.readyItemKeys = order.readyItemKeys.filter((key) => key !== readyItem.dataset.readyItem);
  try {
    postSales(`/api/order/${order.id}/ready-items`, { readyItemKeys: order.readyItemKeys });
  } catch {
    // Keep UI responsive; renderBoard will reload the server state.
  }
  openDetail(state.transactions.find((item) => item.id === order.id) || order);
});
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeDetail(); });
renderBoard();
focusOrderFromUrl();
setInterval(renderBoard, 30000);
