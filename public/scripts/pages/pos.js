import { renderLayout } from "../layout.js";
import { state, posState } from "./pos/pos-state.js";
import { serviceChannelOptions } from "./pos/pos-helpers.js";
import { refreshSales } from "./pos/pos-api.js";
import {
  renderCategories,
  renderProducts,
  setCatalogCallbacks
} from "./pos/pos-catalog.js";
import {
  renderCart,
  canApplyCartDraft,
  draftWithAddedProduct,
  replaceCartLineDraft,
  openPosOrderEdit,
  checkout
} from "./pos/pos-cart.js";
import {
  renderDiningTableOptions,
  renderActiveOpenOrderContext,
  renderOpenTableSessions,
  renderBillDetail,
  settleTable,
  approvePendingOrder,
  setTableCallbacks
} from "./pos/pos-tables.js";
import {
  renderPosQueue,
  renderApprovalCount,
  renderPosApprovals,
  focusOrderFromUrl,
  setDrawerCallbacks
} from "./pos/pos-drawers.js";
import {
  renderPaymentMethods,
  setPaymentCallbacks
} from "./pos/pos-payments.js";
import { initPosEvents } from "./pos/pos-events.js";

renderLayout();

export function activeServiceChannels() {
  const channels = state.settings?.orderChannels || { dineIn: false, takeAway: true, delivery: false };
  const active = serviceChannelOptions.filter((item) => channels[item.key] === true || (item.key === "takeAway" && channels.takeAway !== false));
  return active.length ? active : serviceChannelOptions.filter((item) => item.key === "takeAway");
}

export function normalizeServiceType() {
  const active = activeServiceChannels();
  if (!active.some((item) => item.label === posState.serviceType)) {
    posState.serviceType = active[0].label;
  }
}

export function renderServiceModes() {
  normalizeServiceType();
  const container = document.querySelector(".service-modes");
  if (!container) return;
  container.innerHTML = activeServiceChannels()
    .map((item) => `<button class="service-mode ${item.label === posState.serviceType ? "active" : ""}" data-service-type="${item.label}" type="button">${item.label}</button>`)
    .join("");
}

// Wire inter-module callbacks
setCatalogCallbacks({
  canApplyCartDraft,
  draftWithAddedProduct,
  replaceCartLineDraft,
  renderCart
});

setTableCallbacks({
  renderCart,
  renderProducts,
  renderPosQueue,
  renderPosApprovals
});

setDrawerCallbacks({
  openPosOrderEdit,
  renderOpenTableSessions
});

setPaymentCallbacks({
  checkout,
  settleTable,
  approvePendingOrder,
  renderBillDetail
});

// Initial Bootstrap Sequence
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

// Initialize Event Listeners
initPosEvents();
