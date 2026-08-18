import { state, session, posState, focusOrderId } from "./pos-state.js";
import {
  queueStatuses,
  approvalStatus,
  canActOnOrderStatus,
  canEditOrder,
  formatOrderDateTime,
  orderTimelineMarkup,
  paymentProofMarkup,
  queueElapsed,
  queueTime,
  escapeHtml,
  orderItemCount
} from "./pos-helpers.js";
import { ORDER_STATUS, orderStatusCode, orderStatusIs, orderStatusIn, isInactiveStatus } from "../../status-codes.js";
import { formatQty, money } from "../../format.js";
import { productById, isStockedProduct, productModifierOptions, effectiveRecipe } from "../../inventory.js";
import { byId, showAlert } from "../../dom.js";
import { applyPermissionControls, visibleForSession, apiPost, scopedApiUrl, scopedPayload } from "../../store.js";
import { putSales, refreshSales } from "./pos-api.js";

let openPosOrderEditHandler = null;
let renderOpenTableSessionsHandler = null;

export function setDrawerCallbacks({ openPosOrderEdit, renderOpenTableSessions }) {
  if (openPosOrderEdit) openPosOrderEditHandler = openPosOrderEdit;
  if (renderOpenTableSessions) renderOpenTableSessionsHandler = renderOpenTableSessions;
}

export function activeQueueOrders() {
  return (state.transactions || [])
    .filter((order) => visibleForSession(order, state, session))
    .filter((order) => queueStatuses[orderStatusCode(order.status)])
    .sort((a, b) => queueTime(a) - queueTime(b));
}

export function pendingApprovalOrders() {
  return (state.transactions || [])
    .filter((order) => visibleForSession(order, state, session))
    .filter((order) => orderStatusIs(order.status, ORDER_STATUS.PENDING_CASHIER))
    .sort((a, b) => queueTime(a) - queueTime(b));
}

export function renderApprovalCount() {
  const badge = byId("pos-approval-count");
  if (badge) badge.textContent = pendingApprovalOrders().length;
}

export function renderPosQueue() {
  const orders = activeQueueOrders();
  if (byId("pos-queue-count")) byId("pos-queue-count").textContent = orders.length;
  renderApprovalCount();
  const activeStatuses = [
    ORDER_STATUS.FULFILLMENT,
    ORDER_STATUS.WAITING,
    ORDER_STATUS.PREPARING,
    ORDER_STATUS.READY
  ];

  const board = byId("pos-queue-board");
  if (!board) return;

  board.innerHTML = activeStatuses.map((status) => {
    const config = queueStatuses[status];
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
                <button class="pos-queue-action" data-pos-order-detail="${order.id}" type="button">${posState.expandedPosOrderId === order.id ? "Tutup Detail" : "Detail"}</button>
              </div>
              ${posState.expandedPosOrderId === order.id ? posOrderDetailMarkup(order) : ""}
            </article>
          `).join("") : `<div class="pos-queue-empty">Belum ada pesanan</div>`}
        </div>
      </section>
    `;
  }).join("");
  applyPermissionControls(document, state, session);
}

export function renderPosApprovals() {
  const orders = pendingApprovalOrders();
  renderApprovalCount();
  const list = byId("pos-approval-list");
  if (!list) return;

  list.innerHTML = orders.length ? orders.map((order) => {
    const itemCount = orderItemCount(order);
    const expanded = posState.expandedPosOrderId === order.id;
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

export function posOrderVisibleItems(order) {
  return orderStatusIs(order.status, ORDER_STATUS.COMPLETED) ? (order.items || []) : (order.lastOrderItems || order.items || []);
}

export function posOrderItemKey(item, index) {
  return `${item.productId || item.name}-${index}`;
}

export function posOrderItemRecipe(item) {
  if (item.isPackaging) {
    const ingredient = (state.ingredients || []).find((entry) => entry.id === item.ingredientId);
    return ingredient ? [{ name: ingredient.name, unit: ingredient.unit, qty: item.qty }] : [];
  }
  const product = productById(state, item.productId);
  if (!product || isStockedProduct(product)) return [];
  const modifierIds = item.modifierIds || productModifierOptions(state, product)
    .filter((modifier) => (item.modifiers || []).includes(modifier.name))
    .map((modifier) => modifier.id);
  return effectiveRecipe(product, modifierIds, state).map((line) => {
    const ingredient = (state.ingredients || []).find((entry) => entry.id === line.ingredientId);
    return { name: ingredient?.name || "Bahan tidak ditemukan", unit: ingredient?.unit || "", qty: line.qty * item.qty };
  });
}

export function posOrderPreparationItems(order) {
  const isFulfillment = orderStatusIs(order.status, ORDER_STATUS.FULFILLMENT);
  return posOrderVisibleItems(order).map((item, index) => {
    const itemKey = posOrderItemKey(item, index);
    const checked = (order.readyItemKeys || []).includes(itemKey);
    const product = productById(state, item.productId);
    const showRecipe = item.isPackaging || !product || !isStockedProduct(product);
    const recipeRows = showRecipe ? posOrderItemRecipe(item) : [];
    const isPoItem = Boolean(item.isPreorder || item.is_preorder);
    return `
      <article class="preparation-item ${checked ? "ready" : ""}">
        <label class="preparation-item-heading">
          ${orderStatusIs(order.status, ORDER_STATUS.PREPARING) && canActOnOrderStatus(order.status) ? `<input data-pos-ready-item="${itemKey}" data-pos-ready-order="${order.id}" type="checkbox" ${checked ? "checked" : ""} />` : ""}
          <span>
            <strong>${item.qty}x ${item.name}</strong>
            ${isPoItem ? ` <span class="status-pill status-empty" style="font-size: 8px; padding: 1px 4px; margin-left: 4px; display: inline-block;">Preorder (PO)</span>` : ` <span class="status-pill status-ok" style="font-size: 8px; padding: 1px 4px; margin-left: 4px; display: inline-block;">Ready Stok</span>`}
            ${item.modifiers?.length ? `<small>${item.modifiers.join(", ")}</small>` : ""}
          </span>
        </label>
        ${isFulfillment && isPoItem && canActOnOrderStatus(order.status) ? `
          <div style="margin-top: 6px; margin-left: 4px;">
            ${(order.fulfilledPoKeys || []).includes(itemKey)
              ? `<span class="status-pill status-ok" style="font-size: 11px;">✓ Stok Sudah Disiapkan</span>`
              : `<button class="ghost-button compact-button" data-pos-fulfill-item="${itemKey}" data-pos-fulfill-order="${order.id}" data-pos-fulfill-index="${index}" type="button" style="font-size: 11px;">Siapkan Stok →</button>`
            }
          </div>
        ` : ""}
        ${showRecipe && !isFulfillment ? `<div class="preparation-ingredients">${recipeRows.map((ingredient) => `<div><span>${ingredient.name}</span><strong>${formatQty(ingredient.qty)} ${ingredient.unit}</strong></div>`).join("") || `<p>Recipe belum tersedia.</p>`}</div>` : ""}
      </article>
    `;
  }).join("");
}

export function posItemProductionReadiness(product) {
  if (!product) return { ready: false, maxQty: 0, message: "Produk tidak ditemukan.", blockers: ["Produk tidak ditemukan."] };
  const type = product.inventoryType || product.inventory_type || "made_to_order";
  if (type === "retail") {
    return { ready: true, maxQty: Number.POSITIVE_INFINITY, message: "Barang dagang memakai stok masuk dari pembelian.", blockers: [] };
  }
  const lines = product.recipe || [];
  if (!lines.length) return { ready: false, maxQty: 0, message: "Recipe produk belum tersedia.", blockers: ["Recipe produk belum tersedia."] };
  const blockers = [];
  const capacities = lines
    .filter((line) => Number(line.qty || 0) > 0)
    .map((line) => {
      const ingredient = (state.ingredients || []).find((ing) => ing.id === line.ingredientId);
      const label = line.templateName || line.ingredientName || "Bahan recipe";
      if (!ingredient || isInactiveStatus(ingredient.status)) { blockers.push(`${label} belum dimapping ke bahan outlet.`); return 0; }
      const capacity = Math.floor(Number(ingredient.stock || 0) / Number(line.qty || 0));
      if (capacity < 1) blockers.push(`${ingredient.name} tidak cukup (${formatQty(ingredient.stock || 0)} ${ingredient.unit || ""})`);
      return capacity;
    });
  if (!capacities.length) blockers.push("Qty recipe belum lengkap.");
  const maxQty = capacities.length ? Math.min(...capacities) : 0;
  return { ready: blockers.length === 0 && maxQty > 0, maxQty, message: blockers.length ? blockers[0] : `Maksimal produksi ${formatQty(maxQty)} unit.`, blockers };
}

export function openPosItemStockModal(item, product, order, itemKey, itemIndex) {
  let backdrop = document.querySelector("[data-pos-item-stock-backdrop]");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.setAttribute("data-pos-item-stock-backdrop", "");
    backdrop.style.zIndex = "200";
    backdrop.hidden = true;
    const dialog = document.createElement("section");
    dialog.className = "modal-dialog";
    dialog.id = "pos-item-stock-modal";
    dialog.style.maxWidth = "560px";
    dialog.hidden = true;
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", (e) => {
      if (e.target.matches("[data-pos-item-stock-backdrop]") || e.target.closest("[data-close-pos-item-stock]")) {
        closePosItemStockModal();
      }
    });
  }
  const dialog = backdrop.querySelector("#pos-item-stock-modal");
  const type = product ? (product.inventoryType || product.inventory_type || "made_to_order") : "made_to_order";
  const isRetail = type === "retail";
  const readiness = posItemProductionReadiness(product);
  const today = new Date().toISOString().slice(0, 10);
  const shelfLifeDays = Number(product?.shelfLifeDays || 0);
  const autoExpiry = shelfLifeDays > 0 ? (() => { const d = new Date(`${today}T00:00:00`); d.setDate(d.getDate() + shelfLifeDays); return d.toISOString().slice(0, 10); })() : "";

  const isPreorder = Boolean(product?.isPreorder || product?.is_preorder);
  dialog.innerHTML = `
    <header class="modal-header">
      <div>
        <h3 id="pis-title">${isRetail ? "Beli Barang Dagang" : "Produksi Produk"} — ${escapeHtml(product?.name || item.name)}</h3>
        <p id="pis-desc">${isRetail ? "Pembelian akan membuat batch produk dengan HPP dari total harga beli." : "Produksi batch memotong bahan recipe FEFO lalu menambah stok produk."}</p>
      </div>
      <button class="icon-button" data-close-pos-item-stock type="button" aria-label="Tutup modal">x</button>
    </header>
    <form class="form-grid input-workflow" id="pis-form">
      <label class="full-row">Produk
        <input type="text" value="${escapeHtml(product?.name || item.name)} · ${isRetail ? "Barang Dagang" : "Produk Produksi"}" disabled style="width:100%;" />
      </label>
      <label><span id="pis-qty-label">${isRetail ? "Qty Beli" : "Qty Produksi"}</span>
        <input id="pis-qty" min="1" step="1" type="number" required value="${Number(item.qty)}" ${!isRetail && !isPreorder && readiness.ready ? `max="${readiness.maxQty}"` : ""} />
      </label>
      ${isRetail ? `
        <label id="pis-total-cost-field">Total Harga Beli <input id="pis-total-cost" min="1" step="1" type="number" required /></label>
        <label>Manufactured Date <input id="pis-manufactured-at" type="date" required value="${today}" /></label>
        <label id="pis-expired-at-field">Expired Date <small>Opsional</small><input id="pis-expired-at" type="date" /></label>
        <div class="form-preview full-row" id="pis-expired-preview">Expired barang dagang diisi manual bila produk memiliki masa kedaluwarsa.</div>
      ` : `
        <label>Manufactured Date <input id="pis-manufactured-at" type="date" required value="${today}" /></label>
        <div class="form-preview full-row" id="pis-expired-preview">${autoExpiry ? `Expired otomatis: ${autoExpiry} (${shelfLifeDays} hari setelah produksi)` : "Produk ini tidak memakai expired otomatis karena shelf life belum diisi."}</div>
      `}
      <label class="full-row">Catatan <input id="pis-note" autocomplete="off" placeholder="Contoh: pembelian supplier / produksi pagi" type="text" value="Fulfillment preorder #${order.orderNumber}" /></label>
      <p class="form-preview full-row" id="pis-preview">${!isRetail && !isPreorder && !readiness.ready ? readiness.message : (isRetail ? `Stok masuk ${Number(item.qty)} unit.` : (isPreorder ? `Stok masuk preorder ${Number(item.qty)} unit. (Bahan baku dipotong saat proses kitchen)` : `Maksimal produksi ${formatQty(readiness.maxQty)} unit. Stok saat ini ${formatQty(product?.finishedStock || 0)} unit.`))}</p>
      <div class="modal-actions full-row">
        <button class="ghost-button" data-close-pos-item-stock type="button">Batal</button>
        <button class="primary-button" id="pis-submit" type="submit">${isRetail ? "Simpan Pembelian" : "Simpan Produksi"}</button>
      </div>
      <p class="form-feedback full-row" id="pis-feedback" role="status"></p>
    </form>
  `;

  const form = dialog.querySelector("#pis-form");
  const updateModal = () => {
    const qtyInput = dialog.querySelector("#pis-qty");
    const totalCostInput = dialog.querySelector("#pis-total-cost");
    const feedback = dialog.querySelector("#pis-feedback");
    const preview = dialog.querySelector("#pis-preview");
    const submitBtn = dialog.querySelector("#pis-submit");

    const qty = Math.floor(Number(qtyInput.value) || 0);
    feedback.textContent = "";
    feedback.classList.remove("show");
    submitBtn.disabled = false;

    if (!isRetail) {
      if (!isPreorder) {
        const currentReadiness = posItemProductionReadiness(product);
        if (!currentReadiness.ready) {
          feedback.textContent = `Bahan kurang: ${currentReadiness.message}`;
          feedback.classList.add("show");
          submitBtn.disabled = true;
          preview.textContent = currentReadiness.message;
          return;
        }
        qtyInput.max = currentReadiness.maxQty;
        if (qty > currentReadiness.maxQty) {
          feedback.textContent = `Bahan kurang. Qty produksi maksimal ${formatQty(currentReadiness.maxQty)} unit.`;
          feedback.classList.add("show");
          submitBtn.disabled = true;
          preview.textContent = currentReadiness.message;
          return;
        }
        preview.textContent = `Maksimal produksi ${formatQty(currentReadiness.maxQty)} unit. Stok saat ini ${formatQty(product?.finishedStock || 0)} unit.`;
      } else {
        qtyInput.max = "";
        preview.textContent = `Stok masuk preorder ${qty} unit. (Bahan baku dipotong saat proses kitchen)`;
      }
    } else {
      const totalCost = Number(totalCostInput?.value || 0);
      if (qty > 0 && totalCost > 0) {
        const unitCost = totalCost / qty;
        preview.textContent = `Stok masuk ${formatQty(qty)} unit. HPP per unit ${money(unitCost)} dari total harga beli ${money(totalCost)}.`;
      } else {
        preview.textContent = "Isi qty stok masuk dan total harga beli.";
      }
    }
  };

  const qtyInput = dialog.querySelector("#pis-qty");
  const totalCostInput = dialog.querySelector("#pis-total-cost");
  if (qtyInput) {
    qtyInput.addEventListener("input", updateModal);
    qtyInput.addEventListener("change", updateModal);
  }
  if (totalCostInput) {
    totalCostInput.addEventListener("input", updateModal);
    totalCostInput.addEventListener("change", updateModal);
  }
  updateModal();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const feedback = dialog.querySelector("#pis-feedback");
    feedback.textContent = "";
    feedback.classList.remove("show");
    const submitBtn = dialog.querySelector("#pis-submit");
    const qty = Math.floor(Number(dialog.querySelector("#pis-qty").value) || 0);
    const manufacturedAt = dialog.querySelector("#pis-manufactured-at").value;
    const note = dialog.querySelector("#pis-note").value.trim() || `Fulfillment preorder #${order.orderNumber}`;
    if (qty <= 0) { feedback.textContent = "Qty wajib lebih dari 0."; feedback.classList.add("show"); return; }
    if (!isRetail && !isPreorder) {
      const currentReadiness = posItemProductionReadiness(product);
      if (!currentReadiness.ready) {
        feedback.textContent = `Bahan kurang: ${currentReadiness.message}`;
        feedback.classList.add("show");
        return;
      }
      if (qty > currentReadiness.maxQty) {
        feedback.textContent = `Bahan kurang. Qty produksi maksimal ${formatQty(currentReadiness.maxQty)} unit.`;
        feedback.classList.add("show");
        return;
      }
    }
    const payload = { qty, manufacturedAt, note, totalCost: 0 };
    if (isRetail) {
      const totalCost = Number(dialog.querySelector("#pis-total-cost")?.value || 0);
      if (totalCost <= 0) { feedback.textContent = "Total harga beli wajib lebih dari 0 untuk barang dagang."; feedback.classList.add("show"); return; }
      const expiredAt = dialog.querySelector("#pis-expired-at")?.value || "";
      payload.totalCost = totalCost;
      payload.expiredAt = expiredAt;
    }
    const origText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Memproses...";
    setTimeout(() => {
      try {
        const res = apiPost(scopedApiUrl(`/api/product/${product.id}/produce`, state, session), scopedPayload(payload, state, session));
        if (!res || !res.ok) throw new Error(res?.message || "Gagal menyimpan stok produk.");
        
        const nextFulfilledPoKeys = [...(order.fulfilledPoKeys || [])];
        if (!nextFulfilledPoKeys.includes(itemKey)) {
          nextFulfilledPoKeys.push(itemKey);
        }
        
        const updatedOrderData = putSales(`/api/order/${order.id}/fulfilled-po-keys`, { fulfilledPoKeys: nextFulfilledPoKeys });
        
        order.fulfilledPoKeys = nextFulfilledPoKeys;
        const txIndex = (state.transactions || []).findIndex((o) => o.id === order.id);
        if (txIndex >= 0) {
          state.transactions[txIndex] = { ...state.transactions[txIndex], ...updatedOrderData, fulfilledPoKeys: nextFulfilledPoKeys };
        }
        
        closePosItemStockModal();

        const updatedOrder = (state.transactions || []).find((o) => o.id === order.id) || order;
        const allPoItems = posOrderVisibleItems(updatedOrder).filter((oi) => Boolean(oi.isPreorder || oi.is_preorder));
        const allPoKeys = allPoItems.map((oi, i) => {
          const globalIdx = posOrderVisibleItems(updatedOrder).indexOf(oi);
          return posOrderItemKey(oi, globalIdx >= 0 ? globalIdx : i);
        });
        const allFulfilled = allPoKeys.length > 0 && allPoKeys.every((k) => (updatedOrder.fulfilledPoKeys || []).includes(k));
        if (allFulfilled) {
          const nextStatus = ORDER_STATUS.WAITING;
          putSales(`/api/order/${order.id}/status`, { status: nextStatus });
          closePosOrderDetail();
          showAlert("Semua stok siap! Pesanan dikirim ke antrian dapur untuk diproses.");
        } else {
          showAlert(`Stok ${item.name} berhasil disiapkan.`);
          openPosOrderDetail(updatedOrder);
        }
        refreshSales();
        renderPosQueue();
        if (renderOpenTableSessionsHandler) renderOpenTableSessionsHandler();
      } catch (err) {
        feedback.textContent = err.message;
        submitBtn.disabled = false;
        submitBtn.textContent = origText;
      }
    }, 50);
  });

  backdrop.hidden = false;
  dialog.hidden = false;
  document.body.classList.add("modal-open");
}

export function closePosItemStockModal() {
  const backdrop = document.querySelector("[data-pos-item-stock-backdrop]");
  if (backdrop) {
    backdrop.hidden = true;
    backdrop.querySelector("#pos-item-stock-modal").hidden = true;
    document.body.classList.remove("modal-open");
  }
}

export function posOrderDetailMarkup(order) {
  if (!order) return "";
  const status = orderStatusCode(order.status);
  const config = queueStatuses[status] || approvalStatus;
  const visibleItems = posOrderVisibleItems(order);
  const allReady = visibleItems.every((item, index) => (order.readyItemKeys || []).includes(posOrderItemKey(item, index)));
  const canAct = canActOnOrderStatus(order.status);
  const isFulfillment = orderStatusIs(order.status, ORDER_STATUS.FULFILLMENT);
  const poItems = visibleItems.filter((item) => Boolean(item.isPreorder || item.is_preorder));
  const fulfilledKeys = order.fulfilledPoKeys || [];
  const allPoFulfilled = poItems.length > 0 && poItems.every((item, i) => {
    const globalIdx = visibleItems.indexOf(item);
    return fulfilledKeys.includes(posOrderItemKey(item, globalIdx >= 0 ? globalIdx : i));
  });
  const actionDisabled = (orderStatusIs(order.status, ORDER_STATUS.PREPARING) && !allReady)
    || (isFulfillment && !allPoFulfilled);
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
      ${isFulfillment && canAct ? `<div class="preparation-note">${allPoFulfilled ? "Semua stok sudah disiapkan. Tekan Stok Sudah Siap untuk melanjutkan." : "Tekan tombol <strong>Siapkan Stok →</strong> di setiap item PO di bawah untuk menyiapkan stok satu per satu."}</div>` : ""}
      ${orderTimelineMarkup(order)}
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

export function openPosOrderDetail(order) {
  if (!order) return;
  posState.expandedPosOrderId = posState.expandedPosOrderId === order.id ? "" : order.id;
  if (orderStatusIs(order.status, ORDER_STATUS.PENDING_CASHIER)) renderPosApprovals();
  else renderPosQueue();
}

export function closePosOrderDetail() {
  posState.expandedPosOrderId = "";
  renderPosQueue();
  renderPosApprovals();
}

export function openPosQueue() {
  renderPosQueue();
  const backdrop = document.querySelector("[data-pos-queue-backdrop]");
  if (backdrop) backdrop.hidden = false;
  if (byId("pos-queue-drawer")) byId("pos-queue-drawer").hidden = false;
  document.body.classList.add("pos-queue-open");
}

export function closePosQueue() {
  const backdrop = document.querySelector("[data-pos-queue-backdrop]");
  if (backdrop) backdrop.hidden = true;
  if (byId("pos-queue-drawer")) byId("pos-queue-drawer").hidden = true;
  posState.expandedPosOrderId = "";
  document.body.classList.remove("pos-queue-open");
}

export function openPosApprovals() {
  renderPosApprovals();
  const backdrop = document.querySelector("[data-pos-approval-backdrop]");
  if (backdrop) backdrop.hidden = false;
  if (byId("pos-approval-drawer")) byId("pos-approval-drawer").hidden = false;
  document.body.classList.add("pos-queue-open");
}

export function closePosApprovals() {
  const backdrop = document.querySelector("[data-pos-approval-backdrop]");
  if (backdrop) backdrop.hidden = true;
  if (byId("pos-approval-drawer")) byId("pos-approval-drawer").hidden = true;
  posState.expandedPosOrderId = "";
  document.body.classList.remove("pos-queue-open");
}

export function focusOrderFromUrl() {
  if (!focusOrderId) return;
  const order = (state.transactions || []).find((item) => item.id === focusOrderId && visibleForSession(item, state, session));
  if (!order) return;
  posState.expandedPosOrderId = order.id;
  if (orderStatusIs(order.status, ORDER_STATUS.PENDING_CASHIER)) openPosApprovals();
  else if (queueStatuses[orderStatusCode(order.status)]) openPosQueue();
}
