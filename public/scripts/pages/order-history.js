import { renderLayout } from "../layout.js?v=coffee-v151";
import { apiGet, appPath, applyPermissionControls, loadSession, loadState, scopedApiUrl, visibleForSession } from "../store.js?v=coffee-v151";
import { money } from "../format.js";
import { byId } from "../dom.js";
import { ORDER_STATUS, openOrderStatuses, orderStatusClass, orderStatusCode, orderStatusIn, orderStatusIs, orderStatusLabel, statusLabel } from "../status-codes.js";

renderLayout();

let state = loadState();
const session = loadSession();
let orders = [];
let selectedDate = localDateValue();

function localDateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function yesterdayDateValue() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return localDateValue(date);
}

function displayDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
}

function formatDateTime(value) {
  return new Date(value || Date.now()).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function syncDateControls() {
  byId("order-history-date").value = selectedDate;
  if (selectedDate === localDateValue()) byId("order-history-preset").value = "today";
  else if (selectedDate === yesterdayDateValue()) byId("order-history-preset").value = "yesterday";
  else byId("order-history-preset").value = "custom";
}

function syncStatusTabs() {
  const value = byId("order-history-status").value;
  document.querySelectorAll("[data-history-status-tab]").forEach((button) => {
    button.classList.toggle("active", (button.dataset.historyStatusTab || "") === value);
  });
}

function refreshOrders() {
  const response = apiGet(scopedApiUrl(`/api/order?per_page=500&date=${encodeURIComponent(selectedDate)}`, state, session));
  orders = (response?.data?.items || []).filter((order) => visibleForSession(order, state, session));
}

function filteredOrders() {
  const status = byId("order-history-status").value;
  const search = byId("order-history-search").value.trim().toLowerCase();
  return orders
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .filter((order) => {
    const matchesStatus = !status || (status === "open" ? orderStatusIn(order.status, openOrderStatuses) : orderStatusIs(order.status, status));
    const haystack = [
      order.orderNumber,
      order.customerName,
      order.tableName,
      order.serviceType,
      order.paymentMethod,
      ...(order.items || []).flatMap((item) => [item.name, ...(item.modifiers || [])])
    ].join(" ").toLowerCase();
    return matchesStatus && (!search || haystack.includes(search));
  });
}

function itemCount(order) {
  return (order.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
}

function renderSummary(rows) {
  const totalRevenue = rows.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const completed = rows.filter((order) => orderStatusIs(order.status, ORDER_STATUS.COMPLETED)).length;
  const active = rows.filter((order) => orderStatusIn(order.status, openOrderStatuses)).length;
  const cancelled = rows.filter((order) => orderStatusIs(order.status, ORDER_STATUS.CANCELLED)).length;
  byId("order-history-summary").innerHTML = `
    <article class="order-history-card date-card">
      <span>Periode</span>
      <strong>${displayDate(selectedDate)}</strong>
      <small>Filter tanggal aktif</small>
    </article>
    <article class="order-history-card warning-card">
      <span>Belum Selesai</span>
      <strong>${active}</strong>
      <small>Perlu tindak lanjut kasir/kitchen</small>
    </article>
    <article class="order-history-card">
      <span>Selesai / Batal</span>
      <strong>${completed} <em>/</em> ${cancelled}</strong>
      <small>Total ${rows.length} order pada filter ini</small>
    </article>
    <article class="order-history-card revenue-card">
      <span>Omzet</span>
      <strong>${money(totalRevenue)}</strong>
      <small>Total nilai transaksi</small>
    </article>
  `;
}

function orderItemsMarkup(order) {
  return (order.items || []).map((item) => `
    <span><strong>${item.qty}x</strong> ${item.name}${item.modifiers?.length ? `<small>${item.modifiers.join(", ")}</small>` : ""}</span>
  `).join("");
}

function followUpLabel(order) {
  if (orderStatusIs(order.status, ORDER_STATUS.PENDING_CASHIER)) return "Approve di POS";
  if (orderStatusIs(order.status, ORDER_STATUS.FULFILLMENT)) return "Cek Pemenuhan";
  if (orderStatusIn(order.status, [ORDER_STATUS.WAITING, ORDER_STATUS.PREPARING, ORDER_STATUS.READY])) return "Lanjutkan";
  return "";
}

function followUpHref(order) {
  if (orderStatusIs(order.status, ORDER_STATUS.PENDING_CASHIER)) return `${appPath("/pages/pos.html")}?order=${encodeURIComponent(order.id)}`;
  if (orderStatusIn(order.status, [ORDER_STATUS.FULFILLMENT, ORDER_STATUS.WAITING, ORDER_STATUS.PREPARING, ORDER_STATUS.READY])) return `${appPath("/pages/orders.html")}?order=${encodeURIComponent(order.id)}`;
  return "";
}

function followUpMessage(order) {
  if (orderStatusIs(order.status, ORDER_STATUS.PENDING_CASHIER)) return "Pesanan masih menunggu approve kasir. Lanjutkan di POS untuk cek detail, terima pembayaran, approve, atau reject.";
  if (orderStatusIs(order.status, ORDER_STATUS.FULFILLMENT)) return "Pesanan preorder menunggu stok diproduksi atau dipenuhi dari vendor. Tandai stok siap setelah produk tersedia.";
  if (orderStatusIs(order.status, ORDER_STATUS.WAITING)) return "Pesanan sudah masuk antrian kitchen. Lanjutkan di Kitchen Display untuk mulai proses.";
  if (orderStatusIs(order.status, ORDER_STATUS.PREPARING)) return "Pesanan sedang diproses. Kitchen perlu checklist item ready sebelum ditandai siap diambil.";
  if (orderStatusIs(order.status, ORDER_STATUS.READY)) return "Pesanan sudah siap. Kasir perlu konfirmasi pesanan sudah diambil customer.";
  if (orderStatusIs(order.status, ORDER_STATUS.COMPLETED)) return "Pesanan sudah selesai dan masuk laporan.";
  if (orderStatusIs(order.status, ORDER_STATUS.CANCELLED)) return "Pesanan sudah dibatalkan.";
  return "Detail riwayat order.";
}

function actionButtons(order) {
  const followUp = followUpHref(order);
  return `
    <div class="order-history-actions">
      <button class="ghost-button compact-button" data-history-detail="${order.id}" type="button">Detail</button>
      ${followUp ? `<button class="primary-button compact-button" data-history-follow-up="${order.id}" type="button">${followUpLabel(order)}</button>` : ""}
    </div>
  `;
}

function renderTable() {
  const rows = filteredOrders();
  syncStatusTabs();
  renderSummary(rows);
  byId("order-history-body").innerHTML = rows.length ? rows.map((order) => `
    <tr class="${orderStatusIn(order.status, openOrderStatuses) ? "order-history-open-row" : ""}">
      <td><strong>#${order.orderNumber}</strong><span>${order.id}</span></td>
      <td><strong>${formatDateTime(order.createdAt)}</strong><span>Update: ${order.statusUpdatedAt ? formatDateTime(order.statusUpdatedAt) : "-"}</span></td>
      <td>${order.customerName || order.tableName || "-"}${order.customerPhone ? `<span>${order.customerPhone}</span>` : ""}</td>
      <td>${order.serviceType || "-"}</td>
      <td><span class="status-pill ${orderStatusClass(order.status)}">${orderStatusLabel(order.status)} <small>${orderStatusCode(order.status)}</small></span></td>
      <td><div class="completed-order-items">${orderItemsMarkup(order) || "-"}</div></td>
      <td>${order.paymentMethod || "-"}<span>${statusLabel(order.paymentStatus, "payment")}</span></td>
      <td><strong>${money(order.total || 0)}</strong><span>${itemCount(order)} item</span></td>
      <td>${actionButtons(order)}</td>
    </tr>
  `).join("") : `<tr><td class="completed-orders-empty" colspan="9">Belum ada order pada ${displayDate(selectedDate)}.</td></tr>`;
  applyPermissionControls(document, state, session);
}

function openDetail(order) {
  if (!order) return;
  byId("history-detail-title").textContent = `#${order.orderNumber}`;
  byId("history-detail-meta").textContent = `${formatDateTime(order.createdAt)} · ${order.serviceType || "-"} · ${orderStatusLabel(order.status)} (${orderStatusCode(order.status)})`;
  byId("history-detail-content").innerHTML = `
    <div class="selected-order-meta">
      <article><span>Customer</span><strong>${order.customerName || "-"}</strong></article>
      <article><span>Meja</span><strong>${order.tableName || "-"}</strong></article>
      <article><span>Pembayaran</span><strong>${order.paymentMethod || "-"}</strong></article>
      <article><span>Total</span><strong>${money(order.total || 0)}</strong></article>
    </div>
    <div class="order-history-followup-panel ${orderStatusIn(order.status, openOrderStatuses) ? "needs-action" : ""}">
      <div>
        <span>Status Saat Ini</span>
        <strong>${orderStatusLabel(order.status)} (${orderStatusCode(order.status)})</strong>
        <p>${followUpMessage(order)}</p>
      </div>
      ${followUpHref(order) ? `<button class="primary-button" data-history-follow-up="${order.id}" type="button">${followUpLabel(order)}</button>` : ""}
    </div>
    <section class="completed-orders-table-panel">
      <div class="completed-orders-table-scroll">
        <table class="completed-orders-table">
          <thead><tr><th>Item</th><th>Qty</th><th>Harga</th><th>Subtotal</th></tr></thead>
          <tbody>
            ${(order.items || []).map((item) => `
              <tr>
                <td><strong>${item.name}</strong>${item.modifiers?.length ? `<span>${item.modifiers.join(", ")}</span>` : ""}</td>
                <td>${item.qty}</td>
                <td>${money(item.price || 0)}</td>
                <td><strong>${money((item.price || 0) * (item.qty || 0))}</strong></td>
              </tr>
            `).join("") || `<tr><td colspan="4">Belum ada item.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
  document.querySelector("[data-history-detail-backdrop]").hidden = false;
  byId("history-detail-modal").hidden = false;
  document.body.classList.add("modal-open");
}

function closeDetail() {
  document.querySelector("[data-history-detail-backdrop]").hidden = true;
  byId("history-detail-modal").hidden = true;
  document.body.classList.remove("modal-open");
}

function renderPage() {
  syncDateControls();
  refreshOrders();
  renderTable();
}

document.addEventListener("change", (event) => {
  if (event.target?.id === "order-history-preset") {
    if (event.target.value === "today") selectedDate = localDateValue();
    if (event.target.value === "yesterday") selectedDate = yesterdayDateValue();
    if (event.target.value === "custom") selectedDate = byId("order-history-date").value || selectedDate;
    renderPage();
  }
  if (event.target?.id === "order-history-date") {
    selectedDate = event.target.value || localDateValue();
    renderPage();
  }
  if (event.target?.id === "order-history-status") renderTable();
});

document.addEventListener("input", (event) => {
  if (event.target?.id === "order-history-search") renderTable();
});

document.addEventListener("click", (event) => {
  const statusTab = event.target.closest("[data-history-status-tab]");
  if (statusTab) {
    byId("order-history-status").value = statusTab.dataset.historyStatusTab || "";
    document.querySelectorAll("[data-history-status-tab]").forEach((button) => button.classList.toggle("active", button === statusTab));
    renderTable();
    return;
  }
  const followUp = event.target.closest("[data-history-follow-up]");
  if (followUp) {
    const order = orders.find((item) => item.id === followUp.dataset.historyFollowUp);
    const target = order ? followUpHref(order) : "";
    if (target) window.location.href = target;
    return;
  }
  const detail = event.target.closest("[data-history-detail]");
  if (detail) openDetail(orders.find((order) => order.id === detail.dataset.historyDetail));
  if (event.target.closest("[data-close-history-detail]") || event.target.matches("[data-history-detail-backdrop]")) closeDetail();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDetail();
});

renderPage();
