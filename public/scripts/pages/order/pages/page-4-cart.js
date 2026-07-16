import { state, bookState, money } from "../order-state.js";
import {
  byId,
  optionalById,
  escapeHtml,
  productById,
  paymentById,
  lineUnitPrice,
  modifierNames,
  calculateTotals,
  showFeedback
} from "../order-utils.js";
import { checkoutStartPage } from "../order-navigation.js";
import { maxQtyForConfig } from "./page-3-book-menu.js";

export function renderCart() {
  const totals = calculateTotals();
  const confirmButton = optionalById("order-confirm-cart");
  byId("order-cart-count").textContent = `${state.cart.reduce((sum, item) => sum + item.qty, 0)} item`;
  byId("order-action-total").textContent = money(totals.total);
  if (confirmButton) confirmButton.disabled = state.cart.length === 0;
  if (!state.cart.length) state.cartConfirmed = false;
  byId("order-cart").innerHTML = state.cart.length ? state.cart.map((line) => {
    const product = productById(line.productId);
    const linePrice = lineUnitPrice(product, line);
    const modifiers = modifierNames(product, line.modifierIds || []);
    const photo = product?.imageUrl
      ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name || "Produk")}" />`
      : `<span>${escapeHtml((product?.name || "?").slice(0, 1))}</span>`;
    return `
      <div class="cart-row">
        <span class="cart-product-thumb">${photo}</span>
        <div class="cart-line-main">
          <strong>${escapeHtml(product?.name || "Produk")}</strong>
          ${modifiers ? `<small>${escapeHtml(modifiers)}</small>` : `<small>Tanpa modifier</small>`}
          <span>${money(linePrice)} / item</span>
        </div>
        <div class="cart-line-actions">
          <div class="qty-control">
            <button class="qty-button" data-cart-minus="${line.id}" type="button">-</button>
            <span>${line.qty}</span>
            <button class="qty-button" data-cart-plus="${line.id}" type="button">+</button>
          </div>
          <button class="cart-edit-button" data-edit-cart-line="${line.id}" type="button">Edit</button>
        </div>
        <strong class="cart-line-total">${money(linePrice * line.qty)}</strong>
      </div>
    `;
  }).join("") : `<div class="empty-state compact">Cart masih kosong.</div>`;

  byId("order-subtotal").textContent = money(totals.subtotal);
  byId("order-service-row").hidden = totals.serviceCharge <= 0;
  byId("order-service-label").textContent = `Service Charge (${state.settings.dineInServiceRate || 0}%)`;
  byId("order-service").textContent = money(totals.serviceCharge);
  byId("order-packaging-row").hidden = totals.packagingFee <= 0;
  byId("order-packaging").textContent = money(totals.packagingFee);
  byId("order-tax-label").textContent = `Pajak (${state.settings.taxRate || 0}%)`;
  byId("order-tax").textContent = money(totals.tax);
  byId("order-payment-fee-row").hidden = totals.customerPaymentFee <= 0;
  byId("order-payment-fee-label").textContent = `Payment Fee (${paymentById(state.paymentMethodId)?.feeRate || 0}%)`;
  byId("order-payment-fee").textContent = money(totals.customerPaymentFee);
  byId("order-total").textContent = money(totals.total);
  
  import("./page-5-customer-detail.js").then(({ renderCustomerGate }) => {
    renderCustomerGate();
  });
}

export function changeQty(lineId, delta) {
  const current = state.cart.find((line) => line.id === lineId);
  const product = productById(current?.productId);
  if (!current || !product) return;
  const next = current.qty + delta;
  if (next <= 0) state.cart = state.cart.filter((line) => line.id !== lineId);
  else {
    const maxQty = maxQtyForConfig(product, current.modifierIds || [], current.id);
    if (next > maxQty) {
      showFeedback(`Pilihan ini tersisa ${Math.max(0, maxQty - current.qty)} item lagi.`, true);
      return;
    }
    current.qty = next;
  }
  markCartChanged();
  import("./page-3-book-menu.js").then(({ renderProducts }) => {
    renderProducts();
    renderCart();
    import("../order-render.js").then(({ renderBill, renderSpread }) => {
      renderBill();
      renderSpread();
    });
  });
}

export function openCartLineEditor(lineId) {
  const line = state.cart.find((item) => item.id === lineId);
  const product = productById(line?.productId);
  if (!line || !product) return;
  import("./page-3-book-menu.js").then(({ openMenuDetail }) => {
    openMenuDetail(product, line, true);
  });
}

export function markCartChanged() {
  state.cartConfirmed = false;
}
