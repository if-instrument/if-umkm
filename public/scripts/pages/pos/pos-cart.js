import { state, session, posState } from "./pos-state.js";
import {
  isAssignedPayLater,
  isFreeSeatingDineIn,
  usesNameCodeField,
  needsPackaging,
  isPackagingIngredient,
  isOrderLevelPackagingIngredient,
  combinePackagingLines,
  automaticOrderCode,
  sameModifierSet,
  canEditOrder,
  isToday
} from "./pos-helpers.js";
import {
  productById,
  productCogsWithModifiers,
  modifierPrice,
  productModifierOptions,
  isStockedProduct,
  isPreorderStockedProduct,
  realProductAvailability,
  ingredientUnitCost,
  ingredientCostForQty,
  costingMethod,
  effectiveRecipe,
  productAvailabilityWithModifiers
} from "../../inventory.js";
import {
  paymentFeeFor,
  renderPaymentPanel,
  paymentMetaForCheckout,
  renderPaymentMethods
} from "./pos-payments.js";
import { autoPrintPaidOrder } from "./pos-receipt.js";
import { putSales, postSales } from "./pos-api.js";
import { renderProducts } from "./pos-catalog.js";
import {
  renderDiningTableOptions,
  renderActiveOpenOrderContext,
  renderOpenTableSessions,
  activeOpenOrder,
  editingOrder
} from "./pos-tables.js";
import {
  renderPosQueue,
  renderApprovalCount,
  closePosQueue,
  closePosApprovals
} from "./pos-drawers.js";
import { byId, showAlert } from "../../dom.js";
import { money } from "../../format.js";
import { canUsePermission } from "../../store.js";
import { PAYMENT_STATUS, orderStatusIs, ORDER_STATUS, isInactiveStatus } from "../../status-codes.js";

export function cartTotals() {
  return posState.cart.reduce(
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

export function automaticPackaging() {
  if (!needsPackaging(posState.serviceType)) return [];
  const itemCount = posState.cart.reduce((total, line) => total + line.qty, 0);
  if (!itemCount) return [];
  const rules = (state.settings.packagingRules || []).filter((rule) => !isInactiveStatus(rule.status)).slice();
  const largestRules = rules.slice().sort((a, b) => b.maxQty - a.maxQty);
  const smallestFittingRules = rules.slice().sort((a, b) => a.maxQty - b.maxQty || a.minQty - b.minQty);
  const selectedRules = [];
  let remaining = itemCount;

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
      const ingredient = (state.ingredients || []).find((entry) => entry.id === ingredientId && !isInactiveStatus(entry.status) && isPackagingIngredient(entry));
      return ingredient && ingredient.stock >= required;
    });
  };
  const primaryItems = selectedRules.flatMap((rule) => rule.items || []);
  const fallbackItems = selectedRules.flatMap((rule) => rule.fallbackItems || []);
  const primaryAvailable = hasEnoughStockForPackage(primaryItems);
  const fallbackAvailable = hasEnoughStockForPackage(fallbackItems);
  if (!primaryAvailable && !fallbackAvailable) {
    posState.packagingResolution = { source: "unavailable", note: fallbackItems.length ? "Stok paket kemasan normal dan paket pengganti tidak cukup" : "Stok paket kemasan normal tidak cukup dan paket pengganti belum diatur" };
    return [];
  }
  const selectedItems = primaryAvailable ? primaryItems : fallbackItems;
  if (!selectedItems.length) return [];
  posState.packagingResolution = { source: primaryAvailable ? "automatic" : "fallback", note: primaryAvailable ? "Kemasan otomatis dari Packaging Rule" : "Paket pengganti dipakai karena stok paket kemasan normal tidak cukup" };

  const combined = new Map();
  selectedItems.forEach((item) => {
    const key = `${item.ingredientId}:${Number(item.price) || 0}`;
    const current = combined.get(key) || { ...item, qty: 0 };
    current.qty += Number(item.qty) || 0;
    combined.set(key, current);
  });

  return [...combined.values()].map((item) => {
    const ingredient = (state.ingredients || []).find((entry) => entry.id === item.ingredientId && !isInactiveStatus(entry.status) && isPackagingIngredient(entry));
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

export function resolvedPackaging() {
  if (!needsPackaging(posState.serviceType)) return [];
  const automatic = automaticPackaging();
  const manualLines = posState.packagingManualLines.map((line) => {
    const ingredient = (state.ingredients || []).find((item) => item.id === line.ingredientId && !isInactiveStatus(item.status) && isPackagingIngredient(item));
    return ingredient ? { manualId: line.id, ingredientId: ingredient.id, name: ingredient.name, qty: line.qty, price: line.price, cogs: ingredientUnitCost(state, ingredient), lossCost: 0, treatment: line.treatment, reason: line.reason, isManualPackaging: true, isPackaging: true } : null;
  }).filter(Boolean);
  if (posState.packagingOverride) {
    const ingredient = (state.ingredients || []).find((item) => item.id === posState.packagingOverride.ingredientId && !isInactiveStatus(item.status) && isPackagingIngredient(item));
    const isLoss = posState.packagingOverride.treatment === "replacement_loss";
    posState.packagingResolution = { source: manualLines.length ? `manual_add_${posState.packagingOverride.treatment}` : posState.packagingOverride.treatment, note: manualLines.length ? `Kemasan otomatis diganti + ${manualLines.length} tambahan manual` : `Kemasan otomatis diganti: ${posState.packagingOverride.reason}` };
    const replacement = ingredient ? [{
      manualId: posState.packagingOverride.id,
      ingredientId: ingredient.id,
      name: ingredient.name,
      qty: posState.packagingOverride.qty,
      price: 0,
      cogs: isLoss ? 0 : ingredientUnitCost(state, ingredient),
      lossCost: isLoss ? ingredientUnitCost(state, ingredient) : 0,
      treatment: posState.packagingOverride.treatment,
      reason: posState.packagingOverride.reason,
      isManualPackaging: true,
      isPackaging: true
    }] : [];
    return [...combinePackagingLines(replacement), ...manualLines];
  }
  if (manualLines.length) {
    posState.packagingResolution = { source: "automatic_plus_manual", note: `Kemasan otomatis + ${manualLines.length} tambahan manual` };
  }
  return [...combinePackagingLines(automatic), ...manualLines];
}

export function packagingTotals() {
  return resolvedPackaging().reduce((totals, line) => {
    totals.revenue += line.price * line.qty;
    totals.cogs += line.cogs * line.qty;
    totals.loss += (line.lossCost || 0) * line.qty;
    return totals;
  }, { revenue: 0, cogs: 0, loss: 0 });
}

export function packagingPrice(ingredientId) {
  const configured = (state.settings.packagingRules || [])
    .flatMap((rule) => [...(rule.items || []), ...(rule.fallbackItems || [])])
    .find((item) => item.ingredientId === ingredientId);
  return Number(configured?.price || 0);
}

export function renderCart() {
  const totals = cartTotals();
  const packaging = packagingTotals();
  const serviceCharge = posState.serviceType === "Dine In" ? totals.revenue * ((state.settings.dineInServiceRate || 0) / 100) : 0;
  const packagingFee = packaging.revenue;
  const taxableRevenue = totals.revenue + serviceCharge + packagingFee;
  const tax = taxableRevenue * ((state.settings.taxRate || 0) / 100);
  const paymentFee = paymentFeeFor(taxableRevenue + tax);
  const customerPaymentFee = paymentFee.payer === "customer" ? paymentFee.amount : 0;
  const merchantPaymentFee = paymentFee.payer === "merchant" ? paymentFee.amount : 0;
  if (byId("cart-count")) byId("cart-count").textContent = `${totals.qty} item`;
  if (byId("cart-subtotal")) byId("cart-subtotal").textContent = money(totals.revenue);
  if (byId("cart-cogs")) byId("cart-cogs").textContent = money(totals.cogs + packaging.cogs + packaging.loss);
  if (byId("cart-profit")) byId("cart-profit").textContent = money(taxableRevenue - totals.cogs - packaging.cogs - packaging.loss - merchantPaymentFee);
  if (byId("cart-service-label")) byId("cart-service-label").textContent = `Service Charge Dine In (${state.settings.dineInServiceRate || 0}%)`;
  if (byId("cart-service-charge")) byId("cart-service-charge").textContent = money(serviceCharge);
  if (byId("cart-packaging-fee")) byId("cart-packaging-fee").textContent = money(packagingFee);
  if (byId("cart-service-row")) byId("cart-service-row").hidden = serviceCharge <= 0;
  if (byId("cart-packaging-row")) byId("cart-packaging-row").hidden = packagingFee <= 0;
  if (byId("cart-tax-label")) byId("cart-tax-label").textContent = `Pajak (${state.settings.taxRate || 0}%)`;
  if (byId("cart-tax")) byId("cart-tax").textContent = money(tax);
  if (byId("cart-payment-fee-label")) byId("cart-payment-fee-label").textContent = `Payment Fee (${paymentFee.rate || 0}%)`;
  if (byId("cart-payment-fee")) byId("cart-payment-fee").textContent = money(paymentFee.amount);
  if (byId("cart-payment-fee-row")) byId("cart-payment-fee-row").hidden = paymentFee.amount <= 0;
  const selectedOpenOrder = isAssignedPayLater(posState.serviceType) ? activeOpenOrder() : null;
  if (byId("cart-total-label")) byId("cart-total-label").textContent = editingOrder() ? "Total Setelah Edit" : isAssignedPayLater(posState.serviceType) ? (selectedOpenOrder ? "Tambahan Tagihan" : "Estimasi Tagihan") : "Total Bayar";
  if (byId("cart-grand-total")) byId("cart-grand-total").textContent = money(taxableRevenue + tax + customerPaymentFee);
  if (byId("checkout")) {
    byId("checkout").textContent = editingOrder() ? "Simpan Perubahan Pesanan" : isAssignedPayLater(posState.serviceType) ? (selectedOpenOrder ? "Tambah Order ke Table" : "Kirim Order ke Table") : "Bayar Sekarang";
    byId("checkout").disabled = posState.cart.length === 0;
  }
  renderPaymentPanel(taxableRevenue + tax + customerPaymentFee);
  if (byId("packaging-control")) byId("packaging-control").hidden = !needsPackaging(posState.serviceType) || posState.cart.length === 0;
  if (byId("packaging-control-note")) byId("packaging-control-note").textContent = posState.packagingResolution.note || "Kemasan tambahan otomatis";

  const cartList = byId("cart-list");
  if (cartList) {
    cartList.innerHTML = posState.cart.length
      ? posState.cart
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
              <div><strong>${line.name}</strong><small>${line.treatment === "replacement_loss" ? "Pengganti rusak / loss" : line.treatment === "replacement_cost" ? "Pengganti stok kosong" : `Kemasan tambahan ${posState.serviceType}`}</small><span>${money(line.price)}</span></div>
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

  const floatingBadge = byId("floating-cart-badge");
  if (floatingBadge) {
    floatingBadge.textContent = `${totals.qty} item`;
  }
}

export function originalEditingItems() {
  const order = editingOrder();
  return order ? (order.items || []).filter((item) => !item.isPackaging && item.productId) : [];
}

export function originalEditingQty(productId, modifierIds = []) {
  return originalEditingItems()
    .filter((item) => item.productId === productId && sameModifierSet(item.modifierIds || [], modifierIds))
    .reduce((sum, item) => sum + Number(item.qty || 0), 0);
}

export function availableForCartLine(product, modifierIds = []) {
  return productAvailabilityWithModifiers(state, product, modifierIds) + originalEditingQty(product.id, modifierIds);
}

export function canIncreaseCartLine(line) {
  const product = productById(state, line.productId);
  return product ? canApplyCartDraft(replaceCartLineDraft(line.id, { ...line, qty: Number(line.qty || 0) + 1 })).ok : false;
}

export function releasedIngredientQty(items = []) {
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

export function releasedProductQty(items = []) {
  const released = new Map();
  items.forEach((item) => {
    const product = productById(state, item.productId);
    if (product && isStockedProduct(product) && !isPreorderStockedProduct(product)) {
      released.set(product.id, (released.get(product.id) || 0) + Number(item.qty || 0));
    }
  });
  return released;
}

export function pendingIngredientQty(ingredientId) {
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

export function pendingProductQty(productId) {
  return (state.transactions || [])
    .filter((order) => orderStatusIs(order.status, ORDER_STATUS.PENDING_CASHIER))
    .flatMap((order) => order.items || order.lastOrderItems || [])
    .filter((item) => !item.isPackaging && item.productId === productId)
    .reduce((sum, item) => sum + Number(item.qty || 0), 0);
}

export function replaceCartLineDraft(lineId, nextLine) {
  return posState.cart
    .map((item) => item.id === lineId ? nextLine : item)
    .filter((item) => Number(item.qty || 0) > 0);
}

export function draftProductUsage(draft = posState.cart) {
  const usage = new Map();
  draft.forEach((line) => {
    const product = productById(state, line.productId);
    if (product && isStockedProduct(product) && !isPreorderStockedProduct(product)) {
      usage.set(product.id, (usage.get(product.id) || 0) + Number(line.qty || 0));
    }
  });
  return usage;
}

export function draftIngredientUsage(draft = posState.cart) {
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

export function canApplyCartDraft(draft = posState.cart) {
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
    const ingredient = (state.ingredients || []).find((item) => item.id === ingredientId);
    const available = Math.max(0, Number(ingredient?.stock || 0) - pendingIngredientQty(ingredientId) + (releasedIngredients.get(ingredientId) || 0));
    if (!ingredient || isInactiveStatus(ingredient.status) || qty > available) return { ok: false, name: ingredient?.name || "bahan" };
  }
  return { ok: true };
}

export function draftWithAddedProduct(productId, modifierIds = []) {
  const key = `${productId}:${[...modifierIds].sort().join(",")}`;
  const current = posState.cart.find((item) => item.id === key);
  return current
    ? replaceCartLineDraft(current.id, { ...current, qty: Number(current.qty || 0) + 1 })
    : [...posState.cart, { id: key, productId, modifierIds: [...modifierIds], qty: 1 }];
}

export function changeCartQty(lineId, delta) {
  const line = posState.cart.find((item) => item.id === lineId);
  if (!line) return;
  const product = productById(state, line.productId);
  const nextQty = line.qty + delta;
  if (nextQty <= 0) posState.cart = posState.cart.filter((item) => item.id !== lineId);
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

export function changeManualPackagingQty(lineId, delta) {
  const currentLine = posState.packagingManualLines.find((line) => line.id === lineId) || (posState.packagingOverride?.id === lineId ? posState.packagingOverride : null);
  if (!currentLine) return;
  const nextQty = Number(currentLine.qty || 0) + delta;
  if (nextQty <= 0) {
    posState.packagingManualLines = posState.packagingManualLines.filter((line) => line.id !== lineId);
    if (posState.packagingOverride?.id === lineId) posState.packagingOverride = null;
    renderCart();
    return;
  }
  const ingredient = (state.ingredients || []).find((item) => item.id === currentLine.ingredientId);
  if (ingredient && nextQty > Number(ingredient.stock || 0)) {
    byId("checkout-note").textContent = "Stok kemasan tambahan manual tidak cukup.";
    return;
  }
  if (posState.packagingOverride?.id === lineId) posState.packagingOverride = { ...posState.packagingOverride, qty: nextQty };
  else posState.packagingManualLines = posState.packagingManualLines.map((line) => line.id === lineId ? { ...line, qty: nextQty } : line);
  byId("checkout-note").textContent = "";
  renderCart();
}

export function openPackagingOverride(lineId = "") {
  const packagingIngredients = (state.ingredients || []).filter((item) => item.stock > 0 && !isInactiveStatus(item.status) && isOrderLevelPackagingIngredient(item));
  const editingLine = lineId ? (posState.packagingManualLines.find((line) => line.id === lineId) || (posState.packagingOverride?.id === lineId ? posState.packagingOverride : null)) : null;
  const isEditing = Boolean(editingLine);
  const currentPackagingId = editingLine?.ingredientId || resolvedPackaging()[0]?.ingredientId || packagingIngredients[0]?.id || "";
  posState.editingPackagingManualId = editingLine?.id || "";
  byId("packaging-override-title").textContent = isEditing ? "Edit Jumlah Kemasan" : "Tambah Kemasan Tambahan";
  byId("packaging-override-mode").value = editingLine?.treatment === "replacement_loss" ? "replace_damage" : editingLine?.treatment === "replacement_cost" ? "replace_shortage" : "add_chargeable";
  byId("packaging-override-item").innerHTML = (state.ingredients || [])
    .filter((item) => item.stock > 0 && !isInactiveStatus(item.status) && isOrderLevelPackagingIngredient(item))
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

export function closePackagingOverride() {
  const backdrop = document.querySelector("[data-packaging-override-backdrop]");
  if (backdrop) backdrop.hidden = true;
  if (byId("packaging-override-modal")) byId("packaging-override-modal").hidden = true;
  posState.editingPackagingManualId = "";
  document.querySelector("[data-packaging-override-mode-field]").hidden = false;
  document.querySelector("[data-packaging-override-item-field]").hidden = false;
  byId("packaging-override-mode").disabled = false;
  byId("packaging-override-item").disabled = false;
  byId("packaging-override-title").textContent = "Tambah Kemasan Tambahan";
  byId("packaging-override-submit").textContent = "Simpan Kemasan";
  document.querySelector("[data-reset-packaging-override]").hidden = false;
  document.body.classList.remove("modal-open");
}

export function orderLineIngredients(item, qty) {
  if (item.isPackaging) return [{ ingredientId: item.ingredientId, qty }];
  const product = productById(state, item.productId);
  if (!product) return [];
  const modifierIds = item.modifierIds || productModifierOptions(state, product)
    .filter((modifier) => (item.modifiers || []).includes(modifier.name))
    .map((modifier) => modifier.id);
  return effectiveRecipe(product, modifierIds, state).map((line) => ({ ingredientId: line.ingredientId, qty: line.qty * qty }));
}

export function itemRecipeUsage(item) {
  const product = productById(state, item.productId);
  if (product && isStockedProduct(product)) return [];
  return orderLineIngredients(item, Number(item.qty) || 0);
}

export function salesPayload(orderId, orderItems, totals, packaging, serviceCharge, packagingFee, tax, taxableRevenue, total, options = {}) {
  const payLater = isAssignedPayLater(posState.serviceType);
  const existingOpenOrder = options.existingOpenOrder || null;
  const payment = options.payment || {};
  const paymentFee = options.paymentFee || { amount: 0, payer: "merchant" };
  return {
    id: orderId || "",
    orderNumber: options.orderNumber || existingOpenOrder?.orderNumber || `POS-${String((state.transactions || []).length + 1).padStart(5, "0")}`,
    serviceType: posState.serviceType,
    tableFlow: state.settings.tableServiceMode,
    tableName: isAssignedPayLater(posState.serviceType) ? (existingOpenOrder?.tableName || byId("pos-table").value) : "-",
    customerName: posState.serviceType === "Take Away" || posState.serviceType === "Delivery"
      ? (byId("pos-pickup-name").value.trim() || automaticOrderCode(posState.serviceType))
      : isFreeSeatingDineIn(posState.serviceType)
        ? (byId("pos-pickup-name").value.trim() || `DI-${String((state.transactions || []).filter((order) => order.serviceType === "Dine In" && order.tableFlow === "free_seating_pay_first" && isToday(order.createdAt)).length + 1).padStart(3, "0")}`)
        : "",
    items: orderItems.map((item) => ({ ...item, recipeUsage: itemRecipeUsage(item) })),
    productRevenue: totals.revenue,
    serviceCharge,
    packagingFee,
    paymentFee: Number(paymentFee.amount || 0),
    paymentFeePayer: paymentFee.payer || "merchant",
    packagingSource: posState.packagingResolution.source,
    packagingNote: posState.packagingResolution.note,
    revenue: taxableRevenue,
    cogs: totals.cogs + packaging.cogs,
    profit: taxableRevenue - totals.cogs - packaging.cogs,
    packagingLoss: packaging.loss || 0,
    tax,
    total,
    paymentStatus: payLater && !options.forcePaid ? PAYMENT_STATUS.UNPAID : PAYMENT_STATUS.PAID,
    paymentMethod: payLater && !options.forcePaid ? "Belum dibayar" : posState.paymentMethod,
    cashTendered: payment.cashTendered || 0,
    changeDue: payment.changeDue || 0,
    paymentProvider: payment.provider || "",
    paymentReference: payment.reference || "",
    paymentTransactionId: payment.transactionId || ""
  };
}

export function recalculateOrder(order) {
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

export function openPosOrderEdit(orderId) {
  if (!canUsePermission("pos.orderEdit", "update", state, session)) {
    byId("checkout-note").textContent = "Anda tidak punya akses untuk edit pesanan.";
    return;
  }
  const order = (state.transactions || []).find((item) => item.id === orderId);
  if (!order || !canEditOrder(order)) return;
  posState.editingOrderId = order.id;
  posState.activeOpenOrderId = "";
  posState.serviceType = order.serviceType;
  posState.paymentMethod = order.paymentMethod && order.paymentMethod !== "Belum dibayar" ? order.paymentMethod : posState.paymentMethod;
  posState.packagingOverride = null;
  posState.packagingManualLines = [];
  posState.cart = (order.items || [])
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
  document.querySelectorAll(".service-mode").forEach((button) => button.classList.toggle("active", button.textContent.trim() === posState.serviceType));
  byId("pos-pickup-field").hidden = !usesNameCodeField(posState.serviceType);
  byId("pos-pickup-name").required = false;
  byId("pos-pickup-name").value = usesNameCodeField(posState.serviceType) ? order.customerName || "" : "";
  closePosQueue();
  closePosApprovals();
  renderDiningTableOptions();
  if (isAssignedPayLater(posState.serviceType)) {
    byId("pos-table").innerHTML = `<option value="${order.tableName}">${order.tableName} · pesanan sedang diedit</option>`;
    byId("pos-table").disabled = true;
  }
  renderPaymentMethods();
  renderProducts();
  renderCart();
  renderActiveOpenOrderContext();
}

export function saveEditingOrder(orderItems, payload) {
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
    posState.editingOrderId = "";
    posState.cart = [];
    posState.packagingOverride = null;
    posState.packagingManualLines = [];
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

export function cancelOrderEdit() {
  posState.editingOrderId = "";
  posState.cart = [];
  posState.packagingOverride = null;
  posState.packagingManualLines = [];
  byId("pos-pickup-name").value = "";
  renderDiningTableOptions();
  renderPaymentMethods();
  renderProducts();
  renderCart();
  renderActiveOpenOrderContext();
  byId("checkout-note").textContent = "Edit pesanan dibatalkan.";
}

export function checkout() {
  if (!canUsePermission("pos.transaction", "create", state, session)) {
    byId("checkout-note").textContent = "Anda tidak punya akses untuk membuat transaksi POS.";
    return false;
  }
  if (!posState.cart.length) return false;
  const payLater = isAssignedPayLater(posState.serviceType);
  if (!posState.paymentMethod && !payLater) {
    byId("checkout-note").textContent = "Metode bayar aktif belum tersedia. Atur di Pengaturan.";
    return false;
  }
  if (isAssignedPayLater(posState.serviceType) && !activeOpenOrder() && !byId("pos-table").value) {
    byId("checkout-note").textContent = "Meja aktif belum tersedia. Atur Table Layout di Pengaturan.";
    return false;
  }
  const totals = cartTotals();
  const packagingLines = resolvedPackaging();
  if (needsPackaging(posState.serviceType) && !packagingLines.length) {
    byId("checkout-note").textContent = posState.packagingResolution.note || "Packaging rule belum tersedia atau stok kemasan tidak cukup. Order tetap diproses tanpa potong stok kemasan otomatis.";
  }
  const packaging = packagingTotals();
  const serviceCharge = posState.serviceType === "Dine In" ? totals.revenue * ((state.settings.dineInServiceRate || 0) / 100) : 0;
  const packagingFee = packaging.revenue;
  const taxableRevenue = totals.revenue + serviceCharge + packagingFee;
  const tax = taxableRevenue * ((state.settings.taxRate || 0) / 100);
  const paymentFee = !payLater && !posState.editingOrderId ? paymentFeeFor(taxableRevenue + tax) : { amount: 0, payer: "merchant", rate: 0 };
  const customerPaymentFee = paymentFee.payer === "customer" ? paymentFee.amount : 0;
  const unavailablePackaging = packagingLines.find((line) => {
    const ingredient = (state.ingredients || []).find((item) => item.id === line.ingredientId);
    return !ingredient || ingredient.stock < line.qty;
  });
  if (unavailablePackaging && !posState.editingOrderId) {
    byId("checkout-note").textContent = `Stok ${unavailablePackaging.name} tidak cukup.`;
    return false;
  }

  const productItems = [];
  posState.cart.forEach((line) => {
    const product = productById(state, line.productId);
    const modifiers = productModifierOptions(state, product).filter((modifier) => line.modifierIds.includes(modifier.id));
    const itemBase = {
      productId: product.id,
      name: product.name,
      price: product.price + modifierPrice(product, line.modifierIds, state),
      cogs: productCogsWithModifiers(state, product, line.modifierIds),
      lossCost: 0,
      modifierIds: [...line.modifierIds],
      modifiers: modifiers.map((modifier) => `${modifier.groupName}: ${modifier.name}`)
    };
    
    if (isPreorderStockedProduct(product)) {
      const avail = realProductAvailability(state, product, line.modifierIds);
      if (avail > 0 && avail < line.qty) {
        productItems.push({
          ...itemBase,
          qty: avail,
          isPreorder: false
        });
        productItems.push({
          ...itemBase,
          qty: line.qty - avail,
          isPreorder: true
        });
      } else if (avail <= 0) {
        productItems.push({
          ...itemBase,
          qty: line.qty,
          isPreorder: true
        });
      } else {
        productItems.push({
          ...itemBase,
          qty: line.qty,
          isPreorder: false
        });
      }
    } else {
      productItems.push({
        ...itemBase,
        qty: line.qty,
        isPreorder: false
      });
    }
  });
  const orderItems = productItems.concat(packagingLines);

  if (posState.editingOrderId) {
    const edited = editingOrder();
    const payload = salesPayload(posState.editingOrderId, orderItems, totals, packaging, serviceCharge, packagingFee, tax, taxableRevenue, taxableRevenue + tax, {
      orderNumber: edited?.orderNumber,
      paymentFee
    });
    saveEditingOrder(orderItems, payload);
    return true;
  }

  const existingOpenOrder = payLater ? activeOpenOrder() : null;
  const orderNumber = existingOpenOrder?.orderNumber || posState.pendingPayment?.orderNo || `POS-${String((state.transactions || []).length + 1).padStart(5, "0")}`;
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

  const checkoutBtn = byId("checkout");
  const originalText = checkoutBtn.textContent;
  checkoutBtn.disabled = true;
  checkoutBtn.textContent = "Memproses...";

  setTimeout(() => {
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

      posState.cart = [];
      posState.packagingOverride = null;
      posState.packagingManualLines = [];
      posState.pendingPayment = null;
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
        ? `${orderNumber} ${existingOpenOrder ? "ditambahkan ke" : "membuka"} ${existingOpenOrder?.tableName || (posState.serviceType === "Dine In" ? byId("pos-table").value : "table")} dan masuk Antrian Pesanan.`
        : `${orderNumber} tersimpan dan masuk Antrian Pesanan.`;
      showAlert(payLater ? "Pesanan berhasil dikirim ke antrian." : "Pembayaran sukses dan pesanan berhasil dibuat.");
    } catch (error) {
      byId("checkout-note").textContent = error.message;
      checkoutBtn.disabled = false;
      checkoutBtn.textContent = originalText;
    }
  }, 50);
  return true;
}
