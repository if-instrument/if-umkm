import { state, session, posState } from "./pos-state.js";
import {
  isAssignedPayLater,
  usesNameCodeField,
  canActOnOrderStatus,
  isOrderUnpaid
} from "./pos-helpers.js";
import {
  activePaymentMethods,
  setActivePaymentMethod,
  updateCashChange,
  openQrisPaymentModal,
  closeQrisPaymentModal,
  openCardPaymentModal,
  closeCardPaymentModal,
  openCardPaymentLink,
  printCardPaymentQr,
  printQrisPayment,
  confirmStaticQrisPayment,
  simulatePendingPayment
} from "./pos-payments.js";
import {
  renderCart,
  changeCartQty,
  changeManualPackagingQty,
  openPackagingOverride,
  closePackagingOverride,
  packagingPrice,
  openPosOrderEdit,
  cancelOrderEdit,
  checkout
} from "./pos-cart.js";
import {
  renderProducts,
  openProductDetail,
  closeProductDetail,
  openModifierModal,
  closeModifierModal,
  addToCart,
  addConfiguredProduct,
  changeCartModifiers
} from "./pos-catalog.js";
import {
  renderDiningTableOptions,
  renderActiveOpenOrderContext,
  renderOpenTableSessions,
  openPosTables,
  closePosTables,
  cancelOpenTableAdd,
  updateBillCashChange,
  renderBillDetail,
  openBillDetail,
  closeBillDetail,
  settleTable,
  approvePendingOrder,
  activeDiningTables,
  occupiedTableNames,
  openOrderForTable
} from "./pos-tables.js";
import {
  renderPosQueue,
  renderPosApprovals,
  openPosQueue,
  closePosQueue,
  openPosApprovals,
  closePosApprovals,
  openPosOrderDetail,
  closePosOrderDetail,
  openPosItemStockModal,
  posOrderVisibleItems,
  posOrderItemKey,
  renderApprovalCount
} from "./pos-drawers.js";
import { showVirtualKeyboard, hideVirtualKeyboard } from "./pos-keyboard.js";
import { putSales, refreshSales } from "./pos-api.js";
import { byId } from "../../dom.js";
import { canUsePermission, visibleForSession } from "../../store.js";
import { ORDER_STATUS, orderStatusIs } from "../../status-codes.js";
import { productById } from "../../inventory.js";

export function initPosEvents() {
  document.addEventListener("click", (event) => {
    const numpadBtn = event.target.closest("[data-numpad-val]");
    if (numpadBtn) {
      const val = numpadBtn.dataset.numpadVal;
      const targetSelector = numpadBtn.dataset.numpadTarget;
      const input = document.querySelector(targetSelector);
      if (input) {
        let currentVal = input.value || "";
        if (val === "backspace") {
          currentVal = currentVal.slice(0, -1);
        } else if (val === "pas") {
          const total = Number(input.dataset.total || Number(String(byId("cart-grand-total")?.textContent || "0").replace(/[^\d]/g, "")) || 0);
          currentVal = String(total);
        } else {
          currentVal = currentVal + val;
        }
        input.value = currentVal;
        if (targetSelector === "#cash-tendered") {
          updateCashChange();
        } else {
          updateBillCashChange();
        }
      }
      return;
    }

    if (event.target.closest("#hide-cart-sidebar")) {
      const layout = document.querySelector(".pos-layout");
      if (layout) {
        layout.classList.add("cart-hidden");
        const floatingFab = byId("show-cart-sidebar");
        if (floatingFab) {
          floatingFab.style.display = "flex";
          const cartCountText = byId("cart-count")?.textContent || "0 item";
          byId("floating-cart-badge").textContent = cartCountText;
        }
      }
      return;
    }

    if (event.target.closest("#show-cart-sidebar")) {
      const layout = document.querySelector(".pos-layout");
      if (layout) {
        layout.classList.remove("cart-hidden");
        const floatingFab = byId("show-cart-sidebar");
        if (floatingFab) {
          floatingFab.style.display = "none";
        }
      }
      return;
    }

    if (event.target.closest("#open-pos-queue")) openPosQueue();
    if (event.target.closest("[data-close-pos-queue]") || event.target.matches("[data-pos-queue-backdrop]")) closePosQueue();
    if (event.target.closest("#open-pos-approvals")) openPosApprovals();
    if (event.target.closest("[data-close-pos-approvals]") || event.target.matches("[data-pos-approval-backdrop]")) closePosApprovals();
    if (event.target.closest("#open-pos-tables")) openPosTables();
    if (event.target.closest("[data-close-pos-tables]") || event.target.matches("[data-pos-table-backdrop]")) closePosTables();

    const queueAction = event.target.closest("[data-pos-order-status]");
    if (queueAction) {
      const order = (state.transactions || []).find((item) => item.id === queueAction.dataset.posOrderStatus);
      if (order && canActOnOrderStatus(order.status)) {
        const visibleItems = posOrderVisibleItems(order);
        const allReady = visibleItems.every((item, index) => (order.readyItemKeys || []).includes(posOrderItemKey(item, index)));
        if (orderStatusIs(order.status, ORDER_STATUS.PREPARING) && !allReady) return;

        const originalText = queueAction.textContent;
        queueAction.disabled = true;
        queueAction.textContent = "Memproses...";
        
        setTimeout(() => {
          try {
            putSales(`/api/order/${order.id}/status`, { status: queueAction.dataset.nextStatus });
            closePosOrderDetail();
            renderPosQueue();
            renderOpenTableSessions();
          } catch (error) {
            byId("checkout-note").textContent = error.message;
            queueAction.disabled = false;
            queueAction.textContent = originalText;
          }
        }, 50);
      }
    }

    const queueDetail = event.target.closest("[data-pos-order-detail]");
    if (queueDetail) openPosOrderDetail((state.transactions || []).find((order) => order.id === queueDetail.dataset.posOrderDetail && visibleForSession(order, state, session)));

    const fulfillItemBtn = event.target.closest("[data-pos-fulfill-item]");
    if (fulfillItemBtn) {
      const order = (state.transactions || []).find((o) => o.id === fulfillItemBtn.dataset.posFulfillOrder);
      if (order) {
        const itemIndex = Number(fulfillItemBtn.dataset.posFulfillIndex);
        const item = posOrderVisibleItems(order)[itemIndex];
        const product = item ? productById(state, item.productId) : null;
        if (item) openPosItemStockModal(item, product, order, fulfillItemBtn.dataset.posFulfillItem, itemIndex);
      }
    }

    const approvalDetail = event.target.closest("[data-pos-approval-detail]");
    if (approvalDetail) openPosOrderDetail((state.transactions || []).find((order) => order.id === approvalDetail.dataset.posApprovalDetail && visibleForSession(order, state, session)));

    const approveQueueOrder = event.target.closest("[data-pos-order-approve]");
    if (approveQueueOrder) {
      const order = (state.transactions || []).find((item) => item.id === approveQueueOrder.dataset.posOrderApprove);
      if (order && orderStatusIs(order.status, ORDER_STATUS.PENDING_CASHIER) && canActOnOrderStatus(order.status)) openBillDetail(order.id, true, "approve");
    }

    const rejectQueueOrder = event.target.closest("[data-pos-order-reject]");
    if (rejectQueueOrder) {
      const order = (state.transactions || []).find((item) => item.id === rejectQueueOrder.dataset.posOrderReject);
      if (order && orderStatusIs(order.status, ORDER_STATUS.PENDING_CASHIER) && canActOnOrderStatus(order.status)) {
        try {
          putSales(`/api/order/${order.id}/status`, { status: ORDER_STATUS.CANCELLED });
          closeBillDetail();
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
      const order = (state.transactions || []).find((item) => item.id === closeTableButton.dataset.closeTableOrder);
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
      const order = (state.transactions || []).find((item) => item.id === moveTableButton.dataset.moveTableOrder);
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
      if (posState.editingOrderId) {
        byId("checkout-note").textContent = "Selesaikan atau batalkan edit pesanan dulu.";
        return;
      }
      const order = (state.transactions || []).find((item) => item.id === addToOpenTableButton.dataset.addToOpenTable);
      if (order) {
        posState.serviceType = "Dine In";
        posState.activeOpenOrderId = order.id;
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
      posState.packagingOverride = null;
      posState.packagingManualLines = [];
      closePackagingOverride();
      renderCart();
    }

    const plusButton = event.target.closest("[data-cart-plus]");
    if (plusButton) changeCartQty(plusButton.dataset.cartPlus, 1);

    const minusButton = event.target.closest("[data-cart-minus]");
    if (minusButton) changeCartQty(minusButton.dataset.cartMinus, -1);

    const modifierEditButton = event.target.closest("[data-cart-modifier-edit]");
    if (modifierEditButton) {
      const line = posState.cart.find((item) => item.id === modifierEditButton.dataset.cartModifierEdit);
      const product = line ? productById(state, line.productId) : null;
      if (product) openModifierModal(product, line.modifierIds || [], line.id);
    }

    const serviceButton = event.target.closest(".service-mode");
    if (serviceButton) {
      if (posState.editingOrderId) {
        byId("checkout-note").textContent = "Selesaikan atau batalkan edit pesanan dulu.";
        return;
      }
      document.querySelectorAll(".service-mode").forEach((button) => button.classList.remove("active"));
      serviceButton.classList.add("active");
      posState.serviceType = serviceButton.dataset.serviceType || serviceButton.textContent.trim();
      posState.activeOpenOrderId = "";
      byId("pos-table").disabled = !isAssignedPayLater(posState.serviceType);
      byId("pos-pickup-field").hidden = !usesNameCodeField(posState.serviceType);
      byId("pos-pickup-name").required = false;
      byId("checkout-note").textContent = "";
      posState.packagingOverride = null;
      posState.packagingManualLines = [];
      renderDiningTableOptions();
      renderPaymentMethods();
      renderOpenTableSessions();
      renderCart();
      renderActiveOpenOrderContext();
    }

    const categoryButton = event.target.closest("[data-pos-category]");
    if (categoryButton) {
      posState.productCategory = categoryButton.dataset.posCategory;
      document.querySelectorAll("[data-pos-category]").forEach((button) => button.classList.toggle("active", button === categoryButton));
      renderProducts();
    }

    const paymentButton = event.target.closest("[data-payment]");
    if (paymentButton) {
      posState.paymentMethod = paymentButton.dataset.payment;
      posState.pendingPayment = null;
      document.querySelectorAll("[data-payment]").forEach((button) => button.classList.toggle("active", button === paymentButton));
      renderCart();
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target?.id === "bill-settlement-method") {
      setActivePaymentMethod(event.target.value);
      posState.pendingPayment = null;
      const orderId = posState.paymentIntentContext?.orderId || byId("bill-detail-content")?.dataset.orderId || "";
      const mode = posState.paymentIntentContext?.mode || byId("bill-detail-content")?.dataset.mode || "settle";
      const order = (state.transactions || []).find((item) => item.id === orderId);
      if (order) {
        posState.paymentIntentContext = { source: "bill", orderId: order.id, mode };
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
    const order = (state.transactions || []).find((item) => item.id === readyItem.dataset.posReadyOrder);
    if (!order || !canActOnOrderStatus(order.status)) return;
    order.readyItemKeys = order.readyItemKeys || [];
    if (readyItem.checked && !order.readyItemKeys.includes(readyItem.dataset.posReadyItem)) order.readyItemKeys.push(readyItem.dataset.posReadyItem);
    if (!readyItem.checked) order.readyItemKeys = order.readyItemKeys.filter((key) => key !== readyItem.dataset.posReadyItem);
    try {
      putSales(`/api/order/${order.id}/ready-items`, { readyItemKeys: order.readyItemKeys });
    } catch (error) {
      byId("checkout-note").textContent = error.message;
    }
    posState.expandedPosOrderId = order.id;
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

  const modifierForm = byId("pos-modifier-form");
  if (modifierForm) {
    modifierForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const missingRequired = [...event.target.querySelectorAll("[data-required-modifier-group]")]
        .filter((group) => group.dataset.requiredModifierGroup && !group.querySelector("input:checked"));
      if (missingRequired.length) {
        byId("checkout-note").textContent = "Pilih opsi modifier wajib terlebih dahulu.";
        return;
      }
      const modifierIds = [...event.target.querySelectorAll('.modifier-option input:checked')].map((input) => input.value);
      const editingLineId = posState.modifierEditingLineId;
      if (editingLineId && !changeCartModifiers(editingLineId, modifierIds)) return;
      if (!editingLineId) addConfiguredProduct(byId("pos-modifier-product-id").value, modifierIds);
      closeModifierModal();
    });
  }

  const packagingForm = byId("packaging-override-form");
  if (packagingForm) {
    packagingForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const editingLine = posState.editingPackagingManualId
        ? (posState.packagingManualLines.find((item) => item.id === posState.editingPackagingManualId) || (posState.packagingOverride?.id === posState.editingPackagingManualId ? posState.packagingOverride : null))
        : null;
      const ingredientId = editingLine?.ingredientId || byId("packaging-override-item").value;
      const ingredient = (state.ingredients || []).find((item) => item.id === ingredientId);
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
        if (posState.packagingOverride?.id === posState.editingPackagingManualId) posState.packagingOverride = updatedLine;
        else posState.packagingManualLines = posState.packagingManualLines.map((item) => item.id === posState.editingPackagingManualId ? updatedLine : item);
        closePackagingOverride();
        renderCart();
        return;
      }
      const mode = byId("packaging-override-mode").value;
      const treatment = mode === "replace_damage" ? "replacement_loss" : mode === "replace_shortage" ? "replacement_cost" : "chargeable_extra";
      const price = treatment === "chargeable_extra" ? packagingPrice(ingredient.id) : 0;
      const reason = byId("packaging-override-mode").selectedOptions[0]?.textContent || "";
      const line = { id: posState.editingPackagingManualId || `pack-manual-${crypto.randomUUID().slice(0, 8)}`, ingredientId: ingredient.id, qty, price, treatment, reason };
      if (treatment === "replacement_loss" || treatment === "replacement_cost") {
        posState.packagingManualLines = posState.packagingManualLines.filter((item) => item.id !== posState.editingPackagingManualId);
        posState.packagingOverride = line;
      } else if (posState.editingPackagingManualId) {
        if (posState.packagingOverride?.id === posState.editingPackagingManualId) posState.packagingOverride = null;
        posState.packagingManualLines = posState.packagingManualLines.some((item) => item.id === posState.editingPackagingManualId)
          ? posState.packagingManualLines.map((item) => item.id === posState.editingPackagingManualId ? line : item)
          : [...posState.packagingManualLines, line];
      } else posState.packagingManualLines.push(line);
      closePackagingOverride();
      renderCart();
    });
  }

  if (byId("checkout")) byId("checkout").addEventListener("click", checkout);
  if (byId("cash-tendered")) byId("cash-tendered").addEventListener("input", () => updateCashChange());
  if (byId("pos-product-search")) {
    byId("pos-product-search").addEventListener("input", (event) => {
      posState.productSearch = event.target.value.trim().toLowerCase();
      renderProducts();
    });
  }
  if (byId("pos-table")) {
    byId("pos-table").addEventListener("change", () => {
      posState.activeOpenOrderId = "";
      renderDiningTableOptions();
      renderCart();
      renderActiveOpenOrderContext();
    });
  }

  document.addEventListener("focusin", (e) => {
    if (e.target?.id === "pos-product-search" || e.target?.id === "pos-pickup-name") {
      showVirtualKeyboard(e.target);
    }
  });

  document.addEventListener("mousedown", (e) => {
    const keyboard = document.querySelector("[data-virtual-keyboard]");
    if (!keyboard || keyboard.hidden) return;
    if (e.target.closest("[data-virtual-keyboard]") || e.target.id === "pos-product-search" || e.target.id === "pos-pickup-name") {
      return;
    }
    hideVirtualKeyboard();
  });

  setInterval(() => {
    refreshSales();
    renderApprovalCount();
    if (!byId("pos-queue-drawer")?.hidden) renderPosQueue();
    if (!byId("pos-approval-drawer")?.hidden) renderPosApprovals();
    if (!byId("pos-table-drawer")?.hidden) renderOpenTableSessions();
    const billDetailModal = byId("bill-detail-modal");
    if (billDetailModal && !billDetailModal.hidden) {
      const orderId = byId("bill-detail-content")?.dataset.orderId;
      const mode = byId("bill-detail-content")?.dataset.mode;
      const order = (state.transactions || []).find((o) => o.id === orderId);
      if (order) {
        renderBillDetail(order, true, mode);
      }
    }
  }, 30000);
}
