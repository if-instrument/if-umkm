import { state, session, posState } from "./pos-state.js";
import {
  isOrderUnpaid,
  orderItemCount,
  paymentProofMarkup,
  orderTimelineMarkup,
  queueElapsed,
  canActOnOrderStatus,
  canEditOrder,
  isAssignedPayLater,
  usesNameCodeField,
  isPaymentPaid,
  isPaymentFailedFinal
} from "./pos-helpers.js";
import {
  activePaymentMethods,
  setActivePaymentMethod,
  selectedPaymentMethod,
  selectedPaymentType,
  isCashPayment,
  isThirdPartyPayment,
  isQrisPayment,
  isCardPayment,
  paymentGatewayLabel,
  selectedPaymentGatewayLabel,
  createPaymentRequest,
  refreshPendingPaymentStatus,
  confirmPendingPayment,
  openQrisPaymentModal,
  openCardPaymentModal
} from "./pos-payments.js";
import { autoPrintPaidOrder } from "./pos-receipt.js";
import { putSales } from "./pos-api.js";
import { money } from "../../format.js";
import { byId, showAlert } from "../../dom.js";
import { applyPermissionControls, visibleForSession, canUsePermission } from "../../store.js";
import { isActiveStatus, statusLabel } from "../../status-codes.js";
import { productById } from "../../inventory.js";

let renderCartHandler = null;
let renderProductsHandler = null;
let renderPosQueueHandler = null;
let renderPosApprovalsHandler = null;

export function setTableCallbacks({ renderCart, renderProducts, renderPosQueue, renderPosApprovals }) {
  if (renderCart) renderCartHandler = renderCart;
  if (renderProducts) renderProductsHandler = renderProducts;
  if (renderPosQueue) renderPosQueueHandler = renderPosQueue;
  if (renderPosApprovals) renderPosApprovalsHandler = renderPosApprovals;
}

export function activeDiningTables() {
  return (state.settings.diningTables || [])
    .filter((table) => isActiveStatus(table.status))
    .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0) || a.name.localeCompare(b.name));
}

export function openTableOrders() {
  return (state.transactions || [])
    .filter((order) => visibleForSession(order, state, session))
    .filter((order) => order.serviceType === "Dine In" && isOrderUnpaid(order))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

export function openOrderForTable(tableName) {
  return openTableOrders().find((order) => order.tableName === tableName);
}

export function occupiedTableNames() {
  return new Set(openTableOrders().map((order) => order.tableName));
}

export function activeOpenOrder() {
  return openTableOrders().find((order) => order.id === posState.activeOpenOrderId) || null;
}

export function editingOrder() {
  return (state.transactions || []).find((order) => order.id === posState.editingOrderId && canEditOrder(order)) || null;
}

export function renderDiningTableOptions() {
  const tableField = byId("pos-table")?.closest("label");
  if (tableField) tableField.hidden = posState.serviceType !== "Dine In" || state.settings.tableServiceMode !== "assigned_pay_later";
  if (byId("pos-pickup-field")) byId("pos-pickup-field").hidden = !usesNameCodeField(posState.serviceType);
  if (byId("pos-pickup-name")) byId("pos-pickup-name").required = false;
  if (state.settings.tableServiceMode !== "assigned_pay_later") {
    if (byId("pos-table")) {
      byId("pos-table").innerHTML = `<option value="">Free seating</option>`;
      byId("pos-table").disabled = true;
    }
    return;
  }
  const tables = activeDiningTables();
  const occupied = occupiedTableNames();
  const currentValue = byId("pos-table")?.value;
  const availableTables = state.settings.tableServiceMode === "assigned_pay_later"
    ? tables.filter((table) => !occupied.has(table.name))
    : tables;
  if (byId("pos-table")) {
    byId("pos-table").innerHTML = availableTables.length
      ? availableTables.map((table) => `<option value="${table.name}">${table.name} · ${table.area || "-"} · ${table.capacity || 1} pax</option>`).join("")
      : `<option value="">Semua meja aktif sedang open</option>`;
    if ([...byId("pos-table").options].some((option) => option.value === currentValue)) byId("pos-table").value = currentValue;
    byId("pos-table").disabled = posState.serviceType !== "Dine In" || !availableTables.length || Boolean(activeOpenOrder()) || Boolean(editingOrder());
  }
}

export function renderActiveOpenOrderContext() {
  const editedOrder = editingOrder();
  const context = byId("active-open-table-context");
  if (!context) return;

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
    if (posState.serviceType === "Dine In") byId("checkout-note").textContent = "";
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

export function updateBillCashChange() {
  const tendered = Number(byId("bill-cash-tendered")?.value || 0);
  const total = Number(byId("bill-cash-tendered")?.dataset.total || 0);
  const change = Math.max(tendered - total, 0);
  if (byId("bill-cash-change")) byId("bill-cash-change").textContent = money(change);
}

export function renderBillDetail(order, settlementMode = false, mode = "settle") {
  const isApproveMode = mode === "approve";
  const methods = activePaymentMethods();
  const orderPaymentMethod = order.paymentMethod && order.paymentMethod !== "Belum dibayar" ? order.paymentMethod : "";
  if (settlementMode) {
    const currentMethodValid = methods.some((m) => m.name === posState.paymentMethod);
    if (!currentMethodValid) {
      setActivePaymentMethod(
        isApproveMode && orderPaymentMethod && methods.some((m) => m.name === orderPaymentMethod)
          ? orderPaymentMethod
          : orderPaymentMethod || methods[0]?.name
      );
    } else if (isApproveMode && orderPaymentMethod && methods.some((m) => m.name === orderPaymentMethod) && posState.paymentMethod !== orderPaymentMethod && !posState.paymentIntentContext) {
      setActivePaymentMethod(orderPaymentMethod);
    }
  }
  const selectedMethod = selectedPaymentMethod();
  const methodType = selectedMethod?.type || "";
  const isCash = methodType === "cash" || /^cash$/i.test(posState.paymentMethod || "");
  const isGateway = ["qris", "card"].includes(methodType);
  byId("bill-detail-content").dataset.orderId = order.id;
  byId("bill-detail-content").dataset.mode = mode;
  byId("bill-detail-title").textContent = `${order.tableName} · #${order.orderNumber}`;
  byId("bill-detail-subtitle").textContent = settlementMode
    ? (isApproveMode ? "Cek pesanan online dan terima pembayaran sebelum masuk ke kitchen." : "Cek ulang pesanan pelanggan sebelum menutup dan menerima pembayaran.")
    : "Rincian bill berjalan untuk konfirmasi kasir dan pelanggan.";
  const itemRows = (order.items || []).map((item) => {
    const modifiers = item.modifiers?.length ? `<br><small>${item.modifiers.join(", ")}</small>` : "";
    const isPo = Boolean(item.isPreorder || item.is_preorder);
    const badge = isPo
      ? ` <span class="status-pill status-empty" style="font-size: 8px; padding: 1px 4px; margin-left: 4px; display: inline-block;">Preorder (PO)</span>`
      : ` <span class="status-pill status-ok" style="font-size: 8px; padding: 1px 4px; margin-left: 4px; display: inline-block;">Ready Stok</span>`;
    return `
      <tr>
        <td><strong>${item.name}</strong>${badge}${modifiers}</td>
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
      <article><span>Status</span><strong>${isOrderUnpaid(order) ? "Open" : "Paid"}</strong></article>
    </div>
    ${isApproveMode ? paymentProofMarkup(order) : ""}
    ${orderTimelineMarkup(order)}
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
      <label>Metode Bayar <select id="bill-settlement-method">${methods.map((method) => `<option value="${method.name}" ${method.name === posState.paymentMethod ? "selected" : ""}>${method.name}</option>`).join("")}</select></label>
      <div class="bill-cash-fields" ${isCash ? "" : "hidden"}>
        <label>Nominal Bayar <input id="bill-cash-tendered" data-total="${Number(order.total || 0)}" min="0" step="500" type="number" placeholder="Masukkan uang diterima" /></label>
        <div class="virtual-numpad" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 10px 0; max-width: 240px; margin-left: auto; margin-right: auto;">
          <button type="button" class="ghost-button compact-button" data-numpad-val="1" data-numpad-target="#bill-cash-tendered" style="font-size: 14px; padding: 6px; font-weight: bold;">1</button>
          <button type="button" class="ghost-button compact-button" data-numpad-val="2" data-numpad-target="#bill-cash-tendered" style="font-size: 14px; padding: 6px; font-weight: bold;">2</button>
          <button type="button" class="ghost-button compact-button" data-numpad-val="3" data-numpad-target="#bill-cash-tendered" style="font-size: 14px; padding: 6px; font-weight: bold;">3</button>
          <button type="button" class="ghost-button compact-button" data-numpad-val="4" data-numpad-target="#bill-cash-tendered" style="font-size: 14px; padding: 6px; font-weight: bold;">4</button>
          <button type="button" class="ghost-button compact-button" data-numpad-val="5" data-numpad-target="#bill-cash-tendered" style="font-size: 14px; padding: 6px; font-weight: bold;">5</button>
          <button type="button" class="ghost-button compact-button" data-numpad-val="6" data-numpad-target="#bill-cash-tendered" style="font-size: 14px; padding: 6px; font-weight: bold;">6</button>
          <button type="button" class="ghost-button compact-button" data-numpad-val="7" data-numpad-target="#bill-cash-tendered" style="font-size: 14px; padding: 6px; font-weight: bold;">7</button>
          <button type="button" class="ghost-button compact-button" data-numpad-val="8" data-numpad-target="#bill-cash-tendered" style="font-size: 14px; padding: 6px; font-weight: bold;">8</button>
          <button type="button" class="ghost-button compact-button" data-numpad-val="9" data-numpad-target="#bill-cash-tendered" style="font-size: 14px; padding: 6px; font-weight: bold;">9</button>
          <button type="button" class="ghost-button compact-button" data-numpad-val="0" data-numpad-target="#bill-cash-tendered" style="font-size: 14px; padding: 6px; font-weight: bold;">0</button>
          <button type="button" class="ghost-button compact-button" data-numpad-val="000" data-numpad-target="#bill-cash-tendered" style="font-size: 11px; padding: 6px; font-weight: bold;">000</button>
          <button type="button" class="ghost-button compact-button" data-numpad-val="backspace" data-numpad-target="#bill-cash-tendered" style="font-size: 14px; padding: 6px; font-weight: bold; color: var(--danger-color);">⌫</button>
          <button type="button" class="ghost-button compact-button" data-numpad-val="pas" data-numpad-target="#bill-cash-tendered" style="font-size: 12px; padding: 6px; font-weight: bold; grid-column: span 3; color: var(--primary-color);">Uang Pas</button>
        </div>
        <div><span>Kembalian</span><strong id="bill-cash-change">${money(0)}</strong></div>
      </div>
      <div class="bill-gateway-panel" ${isGateway && !(isApproveMode && order.paymentProofUrl) ? "" : "hidden"}>
        <span>${methodType === "qris" ? ((selectedMethod?.qrisMode === "offline" || isGatewayManual()) ? "QRIS Static" : "QRIS Dinamis") : "Card / EDC"} - ${selectedPaymentGatewayLabel()}</span>
        <strong>${posState.pendingPayment && posState.paymentIntentContext?.orderId === order.id ? `${posState.pendingPayment.status.toUpperCase()} · ${posState.pendingPayment.reference}` : "Belum dibuat"}</strong>
        <small>${posState.pendingPayment && posState.paymentIntentContext?.orderId === order.id ? (posState.pendingPayment.qrPayload || posState.pendingPayment.cardActionMessage || posState.pendingPayment.edcInstruction || "Konfirmasi setelah payment sukses.") : "Payment request dibuat saat konfirmasi bayar."}</small>
      </div>
    </div>
    <div class="modal-actions">
      <button class="ghost-button" data-close-bill-detail type="button">Tutup</button>
      ${isApproveMode && canActOnOrderStatus(order.status) ? `<button class="ghost-button danger-button" data-pos-order-reject="${order.id}" type="button">Reject</button>` : ""}
      ${settlementMode ? `<button class="primary-button" ${isApproveMode ? `data-confirm-approve-order="${order.id}"` : `data-confirm-close-table="${order.id}"`} type="button">${isApproveMode ? "Approve & Bayar" : "Konfirmasi Bayar"}</button>` : ""}
    </div>
  `;
  updateBillCashChange();
}

export function openBillDetail(orderId, settlementMode = false, mode = "settle") {
  const order = (state.transactions || []).find((item) => item.id === orderId);
  if (!order) return;
  renderBillDetail(order, settlementMode, mode);
  const backdrop = document.querySelector("[data-bill-detail-backdrop]");
  if (backdrop) backdrop.hidden = false;
  if (byId("bill-detail-modal")) byId("bill-detail-modal").hidden = false;
  document.body.classList.add("modal-open");
}

export function closeBillDetail() {
  const backdrop = document.querySelector("[data-bill-detail-backdrop]");
  if (backdrop) backdrop.hidden = true;
  if (byId("bill-detail-modal")) byId("bill-detail-modal").hidden = true;
  if (posState.paymentIntentContext?.source === "bill") {
    posState.pendingPayment = null;
    posState.paymentIntentContext = null;
  }
  document.body.classList.remove("modal-open");
}

export function cancelOpenTableAdd() {
  posState.activeOpenOrderId = "";
  renderDiningTableOptions();
  if (renderCartHandler) renderCartHandler();
  renderActiveOpenOrderContext();
}

export function paymentMetaForBill(order, mode = "settle") {
  const total = Number(order.total || 0);
  if (isCashPayment()) {
    const tendered = Number(byId("bill-cash-tendered")?.value || 0);
    if (tendered < total) throw new Error("Nominal bayar cash belum cukup.");
    return {
      paymentMethod: posState.paymentMethod,
      cashTendered: tendered,
      changeDue: tendered - total,
      provider: "cashier",
      reference: `CASH-${order.orderNumber}`,
      paymentProvider: "cashier",
      paymentReference: `CASH-${order.orderNumber}`,
    };
  }
  if (isThirdPartyPayment()) {
    posState.paymentIntentContext = { source: "bill", orderId: order.id, mode };
    if (!posState.pendingPayment || posState.pendingPayment.amount !== total || posState.pendingPayment.methodName !== posState.paymentMethod || posState.pendingPayment.contextOrderId !== order.id) {
      createPaymentRequest(total, order.orderNumber, { amount: 0, payer: "merchant" });
      throw new Error(`${selectedPaymentType() === "qris" ? "QRIS" : "Request kartu"} dibuat. Konfirmasi setelah pembayaran sukses.`);
    }
    refreshPendingPaymentStatus();
    if (isQrisPayment() && !isPaymentPaid(posState.pendingPayment.status)) openQrisPaymentModal(posState.pendingPayment);
    if (isCardPayment() && !isPaymentPaid(posState.pendingPayment.status)) openCardPaymentModal(posState.pendingPayment);
    if (isPaymentFailedFinal(posState.pendingPayment.status)) throw new Error(`Payment ${statusLabel(posState.pendingPayment.status, "payment")}. Buat payment request baru.`);
    if (["xendit", "midtrans"].includes(posState.pendingPayment.provider) && !isPaymentPaid(posState.pendingPayment.status)) throw new Error(`Menunggu status pembayaran sukses dari ${paymentGatewayLabel(posState.pendingPayment.provider)}.`);
    const paid = isPaymentPaid(posState.pendingPayment.status) ? posState.pendingPayment : confirmPendingPayment();
    if (!isPaymentPaid(paid.status)) throw new Error("Payment belum sukses.");
    return {
      paymentMethod: posState.paymentMethod,
      provider: paid.provider,
      reference: paid.reference,
      transactionId: paid.id,
      paymentProvider: paid.provider,
      paymentReference: paid.reference,
      paymentTransactionId: paid.id,
    };
  }
  return {
    paymentMethod: posState.paymentMethod,
    provider: "offline",
    reference: `${posState.paymentMethod}-${order.orderNumber}`,
    paymentProvider: "offline",
    paymentReference: `${posState.paymentMethod}-${order.orderNumber}`,
  };
}

export function settleTable(orderId, paymentMethodValue) {
  if (!canUsePermission("pos.payment", "create", state, session)) {
    byId("checkout-note").textContent = "Anda tidak punya akses untuk pembayaran atau close bill.";
    return;
  }
  const order = (state.transactions || []).find((item) => item.id === orderId);
  if (!order) return;
  
  const btn = document.querySelector(`[data-confirm-close-table="${orderId}"]`);
  const originalText = btn ? btn.textContent : "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Memproses...";
  }

  setTimeout(() => {
    try {
      setActivePaymentMethod(paymentMethodValue || posState.paymentMethod || activePaymentMethods()[0]?.name || "Settlement");
      const paymentMeta = paymentMetaForBill(order, "settle");
      const settledOrder = putSales(`/api/order/${order.id}/settle`, paymentMeta);
      autoPrintPaidOrder(settledOrder);
      if (posState.activeOpenOrderId === order.id) posState.activeOpenOrderId = "";
      posState.pendingPayment = null;
      posState.paymentIntentContext = null;
      closeBillDetail();
      renderDiningTableOptions();
      renderOpenTableSessions();
      if (renderPosQueueHandler) renderPosQueueHandler();
      if (renderCartHandler) renderCartHandler();
      renderActiveOpenOrderContext();
      byId("checkout-note").textContent = `${order.tableName} ditutup dan dibayar.`;
    } catch (error) {
      byId("checkout-note").textContent = error.message;
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  }, 50);
}

export function approvePendingOrder(orderId, paymentMethodValue) {
  if (!canUsePermission("queue.cashier", "update", state, session) || !canUsePermission("pos.payment", "create", state, session)) {
    byId("checkout-note").textContent = "Anda tidak punya akses approve dan pembayaran pesanan online.";
    return;
  }
  const order = (state.transactions || []).find((item) => item.id === orderId);
  if (!order) return;
  
  const btn = document.querySelector(`[data-confirm-approve-order="${orderId}"]`);
  const originalText = btn ? btn.textContent : "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Memproses...";
  }

  setTimeout(() => {
    try {
      setActivePaymentMethod(paymentMethodValue || posState.paymentMethod || activePaymentMethods()[0]?.name || "Cash");
      const paymentMeta = paymentMetaForBill(order, "approve");
      const approvedOrder = putSales(`/api/order/${order.id}/approve`, paymentMeta);
      autoPrintPaidOrder(approvedOrder);
      posState.pendingPayment = null;
      posState.paymentIntentContext = null;
      closeBillDetail();
      renderDiningTableOptions();
      renderOpenTableSessions();
      if (renderPosQueueHandler) renderPosQueueHandler();
      if (renderPosApprovalsHandler) renderPosApprovalsHandler();
      if (renderProductsHandler) renderProductsHandler();
      if (renderCartHandler) renderCartHandler();
      renderActiveOpenOrderContext();
      byId("checkout-note").textContent = `${order.orderNumber} sudah dibayar dan masuk ke kitchen.`;
      showAlert("Order online berhasil di-approve dan masuk ke kitchen.");
    } catch (error) {
      byId("checkout-note").textContent = error.message;
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  }, 50);
}

export function renderOpenTableSessions() {
  const orders = openTableOrders();
  if (byId("pos-table-count")) byId("pos-table-count").textContent = orders.length;
  if (byId("open-pos-tables")) byId("open-pos-tables").hidden = state.settings.tableServiceMode !== "assigned_pay_later";
  if (state.settings.tableServiceMode !== "assigned_pay_later") {
    if (byId("pos-table-drawer")) byId("pos-table-drawer").hidden = true;
    const backdrop = document.querySelector("[data-pos-table-backdrop]");
    if (backdrop) backdrop.hidden = true;
    return;
  }
  const list = byId("open-table-list");
  if (!list) return;

  list.innerHTML = orders.length
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

export function openPosTables() {
  renderOpenTableSessions();
  const backdrop = document.querySelector("[data-pos-table-backdrop]");
  if (backdrop) backdrop.hidden = false;
  if (byId("pos-table-drawer")) byId("pos-table-drawer").hidden = false;
  document.body.classList.add("pos-queue-open");
}

export function closePosTables() {
  const backdrop = document.querySelector("[data-pos-table-backdrop]");
  if (backdrop) backdrop.hidden = true;
  if (byId("pos-table-drawer")) byId("pos-table-drawer").hidden = true;
  document.body.classList.remove("pos-queue-open");
}
