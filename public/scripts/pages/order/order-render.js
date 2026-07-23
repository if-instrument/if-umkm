import { state, bookState, money, syncOrderStatus } from "./order-state.js";
import {
  byId,
  optionalById,
  setText,
  setSrc,
  hexToRgb,
  mixRgb,
  rgbCss,
  readableTextFor,
  setOrderCssVariable,
  orderContent,
  escapeHtml,
  persistOrderSession,
  activeOutlet,
  activeOutletName,
  outletLabel,
  lineUnitPrice,
  modifierNames,
  calculateTotals,
  requestJson,
  companySlug
} from "./order-utils.js";
import {
  pageForSpread,
  currentBookPage,
  spreadOrder,
  canJumpTo,
  flipbook,
  restoreBookInputs,
  snapshotBookInputs,
  destroyFlipbook,
  initFlipbook,
  syncOptionalBookPages,
  flashPageTurnArrows
} from "./order-navigation.js";
import { statusLabel, paymentStatusCode, orderStatusCode } from "../../status-codes.js";
import { ORDER_STATUS, PAYMENT_STATUS } from "../../status-codes.js";
import { bindDynamicFieldListeners, bindBookSwipe } from "./order-events.js";

// Page renderings
import { renderOutletChoices } from "./pages/page-1-select-outlet.js";
import { renderServiceTypes, renderTables } from "./pages/page-2-select-service.js";
import { renderCategories, renderProducts } from "./pages/page-3-book-menu.js";
import { renderCart } from "./pages/page-4-cart.js";
import { renderPayments, renderCustomerGate } from "./pages/page-5-customer-detail.js";

export function render() {
  console.log("[ORDER-DIAGNOSTIC] render() executing. Current state.spread:", state.spread, "cartConfirmed:", state.cartConfirmed);
  syncOrderStatus();
  const { pristineBookTemplate } = bookState;
  if (pristineBookTemplate) {
    const book = byId("order-flipbook");
    const snapshot = snapshotBookInputs();
    destroyFlipbook();
    book.innerHTML = pristineBookTemplate;
    restoreBookInputs(snapshot);
    bindDynamicFieldListeners();
    bindBookSwipe();
    renderBookStaticContent();
    renderProducts();
    initFlipbook();
    renderSpread();
  } else {
    renderBookStaticContent();
    renderProducts();
    renderSpread();
  }
}

export function renderBookStaticContent() {
  renderBrand();
  renderOrderContent();
  renderProgress();
  renderOutletChoices();
  renderServiceTypes();
  renderTables();
  renderCategories();
  renderCart();
  renderPayments();
  syncOptionalBookPages();
  renderCustomerGate();
  renderBill();
}

export function renderBrand() {
  const companyName = state.company.name || state.settings.companyName || "IF Instrument";
  const logoUrl = state.company.logoUrl || state.settings.companyLogoUrl || "/assets/if-instrument-logo.jpg";
  const themeColor = state.company.themeColor || state.settings.themeColor || "#3B1F8C";
  const themeRgb = hexToRgb(themeColor);
  const darkRgb = mixRgb(themeRgb, { r: 18, g: 10, b: 6 }, 0.62);
  const deepRgb = mixRgb(themeRgb, { r: 0, g: 0, b: 0 }, 0.78);
  const softRgb = mixRgb(themeRgb, { r: 255, g: 250, b: 243 }, 0.82);
  const coverText = readableTextFor(darkRgb);
  const coverMuted = coverText === "#fffaf3" ? "rgba(255, 250, 243, 0.82)" : "rgba(44, 32, 24, 0.72)";
  const coverPanelBg = coverText === "#fffaf3" ? "rgba(255, 255, 255, 0.92)" : "rgba(44, 32, 24, 0.08)";
  const coverPanelText = coverText === "#fffaf3" ? "#2c2018" : "#2c2018";
  ["order-company-name", "order-cover-title", "order-back-title"].forEach((id) => setText(id, companyName));
  ["order-company-logo", "order-cover-logo", "order-back-logo"].forEach((id) => setSrc(id, logoUrl));
  setOrderCssVariable("--order-accent", themeColor);
  setOrderCssVariable("--order-accent-rgb", rgbCss(themeRgb));
  setOrderCssVariable("--order-accent-dark-rgb", rgbCss(darkRgb));
  setOrderCssVariable("--order-accent-deep-rgb", rgbCss(deepRgb));
  setOrderCssVariable("--order-accent-soft-rgb", rgbCss(softRgb));
  setOrderCssVariable("--order-cover-text", coverText);
  setOrderCssVariable("--order-cover-muted", coverMuted);
  setOrderCssVariable("--order-cover-panel-bg", coverPanelBg);
  setOrderCssVariable("--order-cover-panel-text", coverPanelText);
}

export function renderProgress() {
  const progress = optionalById("order-progress");
  if (!progress) return;
  const labels = {
    cover: "Cover",
    menu: "Menu",
    checkout: "Cart & Payment",
    receipt: "Receipt"
  };
  const spreads = spreadOrder();
  progress.innerHTML = spreads.map((spread) => `
    <button class="${spread === state.spread ? "active" : ""} ${canJumpTo(spread) ? "" : "disabled"}" data-jump-spread="${spread}" type="button">
      ${labels[spread]}
    </button>
  `).join("");
}

export function renderOrderContent() {
  const content = orderContent();
  setText("order-cover-subtitle", content.coverSubtitle);
  setText("order-cover-description", content.coverDescription);
  setText("order-outlet-title", content.outletTitle);
  setText("order-service-title", content.serviceTitle);
  setText("order-service-description", content.serviceDescription);
  setText("order-table-title", content.tableTitle);
  setText("order-table-description", content.tableDescription);
  setText("order-menu-title", content.menuTitle);
  setText("order-menu-description", content.menuDescription);
  setText("order-cart-title", content.cartTitle);
  setText("order-cart-description", content.cartDescription);
  setText("order-customer-title", content.customerTitle);
  setText("order-customer-description", content.customerDescription);
  setText("order-receipt-title", content.receiptTitle);
  setText("order-receipt-description", content.receiptDescription);
  setText("order-back-subtitle", content.backSubtitle);
  setText("order-back-description", content.backDescription);
  setText("order-reset-cover", content.backButton);
}

export function renderBill() {
  const result = state.orderResult;
  const totals = calculateTotals();
  const order = result?.order || {};
  const outlet = activeOutlet();
  const logoUrl = state.company?.logoUrl || state.settings?.companyLogoUrl || "/assets/if-instrument-logo.jpg";
  const customerName = optionalById("order-customer-name")?.value?.trim() || "";
  
  const hasPreorder = Array.isArray(order.items) && order.items.length
    ? order.items.some((item) => Boolean(item.isPreorder))
    : state.cart.some((line) => {
        const product = state.products.find((p) => p.id === line.productId);
        return Boolean(product?.isPreorder);
      });

  byId("order-final-bill").innerHTML = `
    <div class="public-receipt-paper">
      <div class="public-receipt-head">
        ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(state.company?.name || "Logo")}" />` : ""}
        <strong>${escapeHtml(state.company?.name || "IF Instrument")}</strong>
        <span>${escapeHtml(outletLabel(outlet))}</span>
        ${outlet.address ? `<em>${escapeHtml(outlet.address)}</em>` : ""}
        <small>${escapeHtml(state.serviceType || "Take Away")}${state.tableName ? ` · ${escapeHtml(state.tableName)}` : ""}</small>
      </div>
      <div class="public-receipt-meta">
        <div><span>ORDER</span><strong>#${escapeHtml(order.orderNumber || "PREVIEW")}</strong></div>
        <div><span>TANGGAL</span><strong>${escapeHtml(receiptDate(order.createdAt))}</strong></div>
        <div><span>STATUS</span><strong>${escapeHtml(order.paymentStatus ? statusLabel(order.paymentStatus, "payment") : (result ? "Belum Bayar" : "Preview"))}</strong></div>
        <div><span>CUSTOMER</span><strong>${escapeHtml(order.customerName || customerName || "-")}</strong></div>
      </div>
      ${billRows(order.total || totals.total, order)}
      <div class="public-receipt-foot">
        <strong>${escapeHtml(result ? "TERIMA KASIH" : "PREVIEW ORDER")}</strong>
        <span>${escapeHtml(result?.message || "Struk final akan dibuat setelah order dikirim.")}</span>
        ${hasPreorder ? `
          <em style="display: block; margin-top: 10px; border-top: 1px dashed #ccc; padding-top: 10px; font-style: normal; color: #666; font-size: 11px; text-align: center;">
            * Catatan: Pesanan ini mengandung produk Preorder (PO). Tim kami akan menyiapkan produk PO Anda secara khusus.
          </em>
        ` : ""}
      </div>
    </div>
    ${receiptTimeline(order.timeline || [], order)}
  `;
}

export function billRows(total, order = {}) {
  const totals = calculateTotals();
  const sourceItems = Array.isArray(order.items) && order.items.length
    ? order.items.map((item) => ({
        name: item.name,
        modifiers: item.modifiers || [],
        qty: Number(item.qty || 0),
        unitPrice: Number(item.price || 0),
        isPreorder: Boolean(item.isPreorder),
      }))
    : state.cart.map((line) => {
      const product = state.products.find((p) => p.id === line.productId);
      return {
        name: product?.name || "Produk",
        modifiers: modifierNames(product, line.modifierIds || []) ? [modifierNames(product, line.modifierIds || [])] : [],
        qty: Number(line.qty || 0),
        unitPrice: lineUnitPrice(product, line),
        isPreorder: Boolean(product?.isPreorder || line.isPreorder),
      };
    });
  const items = sourceItems.map((item) => {
    const modifiers = (item.modifiers || []).join(", ");
    const poBadge = item.isPreorder
      ? ` <span class="status-pill status-empty" style="font-size: 8px; padding: 1px 4px; display: inline-block; vertical-align: middle; margin-left: 4px; background: #fff2e8; border-color: #ffbb96; color: #fa541c;">Preorder (PO)</span>`
      : "";
    return `
      <li>
        <div>
          <strong>${escapeHtml(item.name || "Produk")}${poBadge}</strong>
          ${modifiers ? `<small>${escapeHtml(modifiers)}</small>` : ""}
          <span>${item.qty} x ${money(item.unitPrice)}</span>
        </div>
        <b>${money(item.unitPrice * item.qty)}</b>
      </li>
    `;
  }).join("");
  const subtotal = Number(order.productRevenue || totals.subtotal || 0);
  const finalTotal = Number(order.total || total || 0);
  const feeTotal = Math.max(0, finalTotal - subtotal);
  return `
    <ul class="public-bill-items">${items || `<li><div><strong>Item</strong><span>-</span></div><b>-</b></li>`}</ul>
    <div class="public-receipt-totals">
      <div><span>SUBTOTAL</span><strong>${money(subtotal)}</strong></div>
      <div><span>PAJAK & BIAYA</span><strong>${money(feeTotal)}</strong></div>
      <div class="total"><span>TOTAL</span><strong>${money(finalTotal)}</strong></div>
    </div>
  `;
}

export function receiptTimeline(timeline = [], order = {}) {
  const orderData = order || state.orderResult?.order || {};
  const rows = orderStatusSteps(orderData, timeline);
  return `
    <section class="public-order-status-card" data-order-status-card>
      <button class="public-order-status-header" data-toggle-order-timeline type="button" aria-expanded="true">
        <span>Order Status</span>
        <b aria-hidden="true"></b>
      </button>
      <div class="public-order-status-body">
        <div class="public-order-status-timeline">
          ${rows.map((row, index) => statusStepMarkup(row, index, rows.length)).join("")}
        </div>
      </div>
    </section>
  `;
}

export function statusStepMarkup(row, index, totalRows) {
  const isCancelled = row.state === "cancelled" || orderStatusCode(row.status) === ORDER_STATUS.CANCELLED;
  const iconSymbol = isCancelled ? "✕" : (row.state === "completed" ? "✓" : "");
  return `
    <article class="${isCancelled ? "cancelled" : (row.state || "pending")}">
      <i aria-hidden="true">${iconSymbol}</i>
      <strong>${escapeHtml(row.title)}</strong>
      <span>${escapeHtml(row.createdAt ? receiptShortDateTime(row.createdAt) : "-")}</span>
      <em>${escapeHtml(row.createdAt ? (row.actorName || actorNameForOrderStatus(row.status)) : "-")}</em>
      <small>${escapeHtml(row.badge || statusStepBadge(row.state))}</small>
    </article>
  `;
}

export function statusStepBadge(stateValue) {
  if (stateValue === "cancelled") return "Dibatalkan";
  if (stateValue === "completed") return "Completed";
  if (stateValue === "current") return "In progress";
  return "Pending";
}

export function orderStatusSteps(order = {}, timeline = []) {
  if (!state.orderResult) {
    return [{
      title: "Preview",
      status: "",
      actorName: "System",
      note: "Preview order.",
      createdAt: new Date().toISOString()
    }];
  }

  const rawRows = timeline.length ? timeline : fallbackReceiptTimeline(order);
  const currentStatus = orderStatusCode(order.status || rawRows.at(-1)?.status || ORDER_STATUS.PENDING_CASHIER);
  const currentPayment = paymentStatusCode(order.paymentStatus || rawRows.at(-1)?.paymentStatus || PAYMENT_STATUS.UNPAID);
  const createdAt = order.createdAt || rawRows[0]?.createdAt || new Date().toISOString();

  if (currentStatus === ORDER_STATUS.CANCELLED) {
    const cancelledEntry = rawRows.find((row) => orderStatusCode(row.status) === ORDER_STATUS.CANCELLED);
    const cancelledAt = cancelledEntry?.createdAt || order.cancelledAt || order.statusUpdatedAt || createdAt;
    const cancellationNote = cancelledEntry?.note || order.cancellationReason || "Pesanan dibatalkan.";
    const cancellationActor = cancelledEntry?.actorName || order.cancelledBy || "Kasir";
    const confirmedAt = order.paidAt || firstPaidTimelineAt(rawRows) || firstTimelineAt(rawRows, ORDER_STATUS.WAITING);

    const baseSteps = [
      {
        title: "Dibuat",
        status: ORDER_STATUS.PENDING_CASHIER,
        actorName: order.customerName || "Customer",
        note: "Order dibuat dari buku menu online.",
        createdAt,
        state: "completed",
        badge: "Completed"
      },
      {
        title: "Menunggu Konfirmasi",
        status: ORDER_STATUS.PENDING_CASHIER,
        actorName: "Kasir",
        note: "Menunggu kasir mengecek pembayaran dan detail order.",
        createdAt: firstTimelineAt(rawRows, ORDER_STATUS.PENDING_CASHIER) || createdAt,
        state: "completed",
        badge: "Completed"
      }
    ];

    if (confirmedAt) {
      baseSteps.push({
        title: "Dikonfirmasi",
        status: ORDER_STATUS.WAITING,
        actorName: "Kasir",
        note: "Pembayaran dan order sudah dikonfirmasi.",
        createdAt: confirmedAt,
        state: "completed",
        badge: "Completed"
      });
    }

    baseSteps.push({
      title: "Dibatalkan",
      status: ORDER_STATUS.CANCELLED,
      actorName: cancellationActor,
      note: cancellationNote,
      createdAt: cancelledAt,
      state: "cancelled",
      badge: "Dibatalkan"
    });

    return baseSteps;
  }

  const pendingAt = firstTimelineAt(rawRows, ORDER_STATUS.PENDING_CASHIER) || createdAt;
  const confirmedAt = order.paidAt || firstPaidTimelineAt(rawRows) || firstTimelineAt(rawRows, ORDER_STATUS.WAITING);
  const fulfillmentAt = firstTimelineAt(rawRows, ORDER_STATUS.FULFILLMENT);
  const preparingAt = firstTimelineAt(rawRows, ORDER_STATUS.PREPARING);
  const readyAt = firstTimelineAt(rawRows, ORDER_STATUS.READY);
  const completedAt = firstTimelineAt(rawRows, ORDER_STATUS.COMPLETED);
  const confirmed = currentPayment === PAYMENT_STATUS.PAID || confirmedAt || [ORDER_STATUS.FULFILLMENT, ORDER_STATUS.WAITING, ORDER_STATUS.PREPARING, ORDER_STATUS.READY, ORDER_STATUS.COMPLETED].includes(currentStatus);
  const currentIndex = currentOrderStepIndex(currentStatus, confirmed);
  const stepDefinitions = [
    {
      title: "Dibuat",
      status: ORDER_STATUS.PENDING_CASHIER,
      actorName: order.customerName || "Customer",
      note: "Order dibuat dari buku menu online.",
      createdAt
    },
    {
      title: "Menunggu Konfirmasi",
      status: ORDER_STATUS.PENDING_CASHIER,
      actorName: "Kasir",
      note: "Menunggu kasir mengecek pembayaran dan detail order.",
      createdAt: pendingAt
    },
    {
      title: "Dikonfirmasi",
      status: ORDER_STATUS.WAITING,
      actorName: "Kasir",
      note: "Pembayaran dan order sudah dikonfirmasi.",
      createdAt: confirmed ? (confirmedAt || order.statusUpdatedAt || createdAt) : ""
    },
    {
      title: "Pemenuhan Stok",
      status: ORDER_STATUS.FULFILLMENT,
      actorName: "Inventory",
      note: "Produk preorder sedang diproduksi atau dipenuhi dari vendor.",
      createdAt: fulfillmentAt || (currentStatus === ORDER_STATUS.FULFILLMENT ? (order.statusUpdatedAt || confirmedAt || createdAt) : "")
    },
    {
      title: "Diproses",
      status: ORDER_STATUS.PREPARING,
      actorName: "Kitchen",
      note: "Pesanan sedang dibuat oleh kitchen.",
      createdAt: preparingAt || ([ORDER_STATUS.PREPARING, ORDER_STATUS.READY, ORDER_STATUS.COMPLETED].includes(currentStatus) ? (order.statusUpdatedAt || fulfillmentAt || confirmedAt || createdAt) : "")
    },
    {
      title: "Siap Diambil",
      status: ORDER_STATUS.READY,
      actorName: "Kasir",
      note: "Pesanan sudah siap diterima customer.",
      createdAt: readyAt || ([ORDER_STATUS.READY, ORDER_STATUS.COMPLETED].includes(currentStatus) ? (order.statusUpdatedAt || preparingAt || createdAt) : "")
    },
    {
      title: "Selesai",
      status: ORDER_STATUS.COMPLETED,
      actorName: "Kasir",
      note: "Pesanan selesai.",
      createdAt: completedAt || (currentStatus === ORDER_STATUS.COMPLETED ? (order.statusUpdatedAt || readyAt || createdAt) : "")
    }
  ];

  return stepDefinitions.map((step, index) => ({
    ...step,
    state: index < currentIndex ? "completed" : index === currentIndex ? "current" : "pending",
    badge: index < currentIndex ? "Completed" : index === currentIndex ? (currentStatus === ORDER_STATUS.COMPLETED ? "Completed" : "In progress") : "Pending",
  }));
}

export function currentOrderStepIndex(currentStatus, confirmed) {
  if (currentStatus === ORDER_STATUS.COMPLETED) return 6;
  if (currentStatus === ORDER_STATUS.READY) return 5;
  if (currentStatus === ORDER_STATUS.PREPARING) return 4;
  if (currentStatus === ORDER_STATUS.FULFILLMENT) return 3;
  if (currentStatus === ORDER_STATUS.WAITING || confirmed) return 2;
  return 1;
}

export function firstTimelineAt(rows, status) {
  const code = orderStatusCode(status);
  return rows.find((row) => orderStatusCode(row.status) === code)?.createdAt || "";
}

export function firstPaidTimelineAt(rows) {
  return rows.find((row) => paymentStatusCode(row.paymentStatus) === PAYMENT_STATUS.PAID)?.createdAt || "";
}

export function fallbackReceiptTimeline(order = {}) {
  if (!state.orderResult) {
    return [{
      status: "",
      paymentStatus: "",
      actorName: "System",
      note: "Preview order.",
      createdAt: new Date().toISOString()
    }];
  }
  const rows = [{
    status: order.status || "00",
    paymentStatus: order.paymentStatus || "00",
    actorName: order.customerName || "Customer",
    note: "Order dibuat dari buku menu online.",
    createdAt: order.createdAt || new Date().toISOString()
  }];
  if (order.paidAt) {
    rows.push({
      status: order.status || "10",
      paymentStatus: order.paymentStatus || "10",
      actorName: "Kasir",
      note: "Pembayaran dikonfirmasi.",
      createdAt: order.paidAt
    });
  }
  if (order.statusUpdatedAt && order.statusUpdatedAt !== order.createdAt && order.statusUpdatedAt !== order.paidAt) {
    rows.push({
      status: order.status || "10",
      paymentStatus: order.paymentStatus || "",
      actorName: actorNameForOrderStatus(order.status),
      note: "Status pesanan diperbarui.",
      createdAt: order.statusUpdatedAt
    });
  }
  return rows;
}

export function actorNameForOrderStatus(status) {
  const label = statusLabel(status, "order");
  if (label === "Menunggu Pemenuhan") return "Inventory";
  if (["Diproses", "Siap Diambil", "Pesanan Baru"].includes(label)) return "Kitchen";
  if (["Selesai", "Menunggu Kasir"].includes(label)) return "Kasir";
  return "System";
}

export function receiptDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function receiptShortDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

export function receiptShortDateTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function renderSpread(syncBook = true) {
  console.log("[ORDER-DIAGNOSTIC] renderSpread() called. syncBook:", syncBook, "state.spread:", state.spread, "flipbookReady:", bookState.flipbookReady);
  syncOrderStatus();
  const spreads = spreadOrder();
  if (!spreads.includes(state.spread)) {
    console.warn("[ORDER-DIAGNOSTIC Warning] Invalid spread:", state.spread, "Resetting to cover.");
    state.spread = "cover";
  }
  const book = flipbook();
  setText("order-status", `${activeOutletName()} · ${state.serviceType}`);
  if (syncBook && bookState.flipbookReady) {
    const targetPage = pageForSpread(state.spread);
    console.log("[ORDER-DIAGNOSTIC] Syncing book to targetPage:", targetPage, "current book page:", book?.turn("page"));
    if (book?.length && book.turn("page") !== targetPage) {
      bookState.syncingFlipbook = true;
      bookState.forcedBookTurn = true;
      book.turn("page", targetPage);
      setTimeout(() => {
        bookState.forcedBookTurn = false;
        bookState.syncingFlipbook = false;
      }, 450);
    }
  }
  renderCustomerGate();
  renderBill();
  renderProgress();
  persistOrderSession();
  lockAllOrderInputs();
  const frame = document.getElementById("order-book-frame");
  if (frame) {
    frame.setAttribute("data-active-spread", state.spread);
    console.log("[ORDER-DIAGNOSTIC] data-active-spread set to:", state.spread);
  }
  bindBookSwipe();
  manageStockRefreshInterval();
  flashPageTurnArrows();
}

export function lockAllOrderInputs() {
  const isLocked = state.orderStatus === "ORDER_CREATED";
  const selectors = ["#order-flipbook", "#order-menu-detail"];
  
  selectors.forEach((sel) => {
    const container = document.getElementById(sel.substring(1));
    if (!container) return;
    
    const elements = container.querySelectorAll("input, select, textarea, button");
    elements.forEach((el) => {
      if (el.id === "order-reset-cover" || el.closest("#order-reset-cover")) return;
      if (el.matches("[data-toggle-order-timeline]") || el.closest("[data-toggle-order-timeline]")) return;
      if (el.closest("#order-status-lookup-form")) return;
      
      if (isLocked) {
        el.disabled = true;
        el.setAttribute("disabled", "true");
      } else {
        el.disabled = false;
        el.removeAttribute("disabled");
      }
    });
  });
}

let stockIntervalId = null;

export async function refreshMenuStock() {
  if (!state.outletId) {
    console.log("refreshMenuStock: no outletId, skipping.");
    return;
  }
  console.log("refreshMenuStock: fetching stock for outlet", state.outletId);
  try {
    const query = new URLSearchParams({ only: "menu", outlet_id: state.outletId });
    if (companySlug()) query.set("company", companySlug());
    const data = await requestJson(`/api/page/order/bootstrap?${query.toString()}`);
    console.log("refreshMenuStock: fetched data successfully, count of products:", data.products?.length);
    
    state.products = data.products || [];
    state.ingredients = data.ingredients || [];
    state.modifiers = data.modifiers || [];
    
    const { updateStockInDOM } = await import("./pages/page-3-book-menu.js");
    updateStockInDOM();
    console.log("refreshMenuStock: DOM stock update complete.");
  } catch (error) {
    console.error("Failed to refresh stock:", error);
  }
}

let receiptIntervalId = null;

export async function refreshReceiptStatus() {
  if (state.spread !== "receipt" || !state.lastOrderNumber) return;
  try {
    const query = new URLSearchParams({ q: state.lastOrderNumber });
    if (companySlug()) query.set("company", companySlug());
    if (state.outletId) query.set("outlet_id", state.outletId);
    const result = await requestJson(`/api/page/order/status?${query.toString()}`);
    if (result && result.order) {
      state.orderResult = result;
      render();
    }
  } catch (error) {
    console.error("Failed to auto-refresh receipt status:", error);
  }
}

export function manageStockRefreshInterval() {
  if (state.spread === "menu" && state.outletId) {
    if (receiptIntervalId) {
      clearInterval(receiptIntervalId);
      receiptIntervalId = null;
    }
    if (!stockIntervalId) {
      stockIntervalId = setInterval(refreshMenuStock, 60000);
    }
  } else if (state.spread === "receipt" && state.lastOrderNumber) {
    if (stockIntervalId) {
      clearInterval(stockIntervalId);
      stockIntervalId = null;
    }
    if (!receiptIntervalId) {
      receiptIntervalId = setInterval(refreshReceiptStatus, 10000);
    }
  } else {
    if (stockIntervalId) {
      clearInterval(stockIntervalId);
      stockIntervalId = null;
    }
    if (receiptIntervalId) {
      clearInterval(receiptIntervalId);
      receiptIntervalId = null;
    }
  }
}
