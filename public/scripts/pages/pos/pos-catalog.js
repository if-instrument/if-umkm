import { state, session, posState } from "./pos-state.js";
import { editingOrder } from "./pos-tables.js";
import {
  productById,
  productAvailability,
  realProductAvailability,
  isPreorderStockedProduct,
  productModifierOptions,
  modifierPrice
} from "../../inventory.js";
import { money } from "../../format.js";
import { byId } from "../../dom.js";
import { visibleForSession, applyPermissionControls, canUsePermission } from "../../store.js";
import { isActiveStatus, isInactiveStatus } from "../../status-codes.js";

let canApplyCartDraftHandler = null;
let draftWithAddedProductHandler = null;
let replaceCartLineDraftHandler = null;
let renderCartHandler = null;

export function setCatalogCallbacks({ canApplyCartDraft, draftWithAddedProduct, replaceCartLineDraft, renderCart }) {
  if (canApplyCartDraft) canApplyCartDraftHandler = canApplyCartDraft;
  if (draftWithAddedProduct) draftWithAddedProductHandler = draftWithAddedProduct;
  if (replaceCartLineDraft) replaceCartLineDraftHandler = replaceCartLineDraft;
  if (renderCart) renderCartHandler = renderCart;
}

export function renderCategories() {
  const categories = (state.categories || []).filter((category) => visibleForSession(category, state, session) && isActiveStatus(category.status));
  const tabs = byId("pos-category-tabs");
  if (!tabs) return;

  tabs.innerHTML = `
    <button class="${posState.productCategory === "all" ? "active" : ""}" data-pos-category="all" type="button">Semua</button>
    ${categories.map((category) => `<button class="${posState.productCategory === category.id ? "active" : ""}" data-pos-category="${category.id}" type="button">${category.name}</button>`).join("")}
  `;
}

export function modifierCandidateSets(product) {
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

export function canAddProductFromCurrentDraft(product) {
  if (productAvailability(state, product) > 0) return true;
  if (!editingOrder()) return false;
  if (!draftWithAddedProductHandler || !canApplyCartDraftHandler) return false;
  return modifierCandidateSets(product).some((modifierIds) => canApplyCartDraftHandler(draftWithAddedProductHandler(product.id, modifierIds)).ok);
}

export function renderProducts() {
  const activeCategoryIds = new Set((state.categories || []).filter((category) => visibleForSession(category, state, session) && isActiveStatus(category.status)).map((category) => category.id));
  const visibleProducts = (state.products || [])
    .filter((product) => visibleForSession(product, state, session))
    .filter((product) => !isInactiveStatus(product.status))
    .filter((product) => !product.categoryId || activeCategoryIds.has(product.categoryId))
    .filter((product) => product.name.toLowerCase().includes(posState.productSearch) && (posState.productCategory === "all" || product.categoryId === posState.productCategory));

  if (byId("pos-product-result")) byId("pos-product-result").textContent = `${visibleProducts.length} produk tersedia`;
  const grid = byId("product-grid");
  if (!grid) return;

  grid.innerHTML = visibleProducts
    .map((product, index) => {
      const available = productAvailability(state, product);
      const canAdd = canAddProductFromCurrentDraft(product);
      const soldOut = !canAdd;
      const readyStock = realProductAvailability(state, product, []);
      const stockBadge = isPreorderStockedProduct(product) ? `Preorder (Stok: ${readyStock})` : (available < 1 ? (canAdd && editingOrder() ? "Draft tersedia" : "Sold Out") : `${available} unit`);
      return `
        <article class="product-card ${soldOut ? "product-card-soldout" : ""}" aria-disabled="${soldOut ? "true" : "false"}">
          <div class="product-visual product-tone-${index % 4}">
            ${product.imageUrl ? `<img src="${product.imageUrl}" alt="${product.name}" />` : `<span></span>`}
            <span class="product-stock-badge ${available < 1 && !isPreorderStockedProduct(product) ? "product-stock-badge-soldout" : ""}">${stockBadge}</span>
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

export function openProductDetail(productId) {
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
  const backdrop = document.querySelector("[data-product-detail-backdrop]");
  if (backdrop) backdrop.hidden = false;
  if (byId("pos-product-detail-modal")) byId("pos-product-detail-modal").hidden = false;
  document.body.classList.add("modal-open");
}

export function closeProductDetail() {
  const backdrop = document.querySelector("[data-product-detail-backdrop]");
  if (backdrop) backdrop.hidden = true;
  if (byId("pos-product-detail-modal")) byId("pos-product-detail-modal").hidden = true;
  document.body.classList.remove("modal-open");
}

export function openModifierModal(product, selectedModifierIds = [], cartLineId = "") {
  posState.modifierEditingLineId = cartLineId;
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
  const backdrop = document.querySelector("[data-modifier-backdrop]");
  if (backdrop) backdrop.hidden = false;
  if (byId("pos-modifier-modal")) byId("pos-modifier-modal").hidden = false;
  document.body.classList.add("modal-open");
}

export function closeModifierModal() {
  const backdrop = document.querySelector("[data-modifier-backdrop]");
  if (backdrop) backdrop.hidden = true;
  if (byId("pos-modifier-modal")) byId("pos-modifier-modal").hidden = true;
  posState.modifierEditingLineId = "";
  document.body.classList.remove("modal-open");
}

export function addConfiguredProduct(productId, modifierIds = []) {
  if (!canUsePermission("pos.transaction", "create", state, session)) {
    byId("checkout-note").textContent = "Anda tidak punya akses untuk membuat transaksi POS.";
    return;
  }
  const product = productById(state, productId);
  if (!product || isInactiveStatus(product.status)) return;
  const key = `${productId}:${[...modifierIds].sort().join(",")}`;
  const current = posState.cart.find((item) => item.id === key);
  const draft = draftWithAddedProductHandler ? draftWithAddedProductHandler(productId, modifierIds) : [];
  const validation = canApplyCartDraftHandler ? canApplyCartDraftHandler(draft) : { ok: true };
  if (!validation.ok) {
    byId("checkout-note").textContent = `Stok bahan tidak cukup untuk ${validation.name || product.name}.`;
    return;
  }
  if (current) current.qty += 1;
  else posState.cart.push({ id: key, productId, modifierIds: [...modifierIds], qty: 1 });
  byId("checkout-note").textContent = "";

  const layout = document.querySelector(".pos-layout");
  if (layout && layout.classList.contains("cart-hidden")) {
    layout.classList.remove("cart-hidden");
    const floatingFab = byId("show-cart-sidebar");
    if (floatingFab) floatingFab.style.display = "none";
  }

  renderProducts();
  if (renderCartHandler) renderCartHandler();
}

export function changeCartModifiers(lineId, modifierIds = []) {
  const line = posState.cart.find((item) => item.id === lineId);
  if (!line) return false;
  const product = productById(state, line.productId);
  if (!product) return false;
  const nextKey = `${line.productId}:${[...modifierIds].sort().join(",")}`;
  const duplicate = posState.cart.find((item) => item.id === nextKey && item.id !== lineId);
  const nextQty = line.qty + (duplicate?.qty || 0);
  const draft = duplicate
    ? posState.cart.filter((item) => item.id !== lineId).map((item) => item.id === duplicate.id ? { ...item, qty: nextQty } : item)
    : (replaceCartLineDraftHandler ? replaceCartLineDraftHandler(lineId, { ...line, id: nextKey, modifierIds: [...modifierIds] }) : []);
  const validation = canApplyCartDraftHandler ? canApplyCartDraftHandler(draft) : { ok: true };
  if (!validation.ok) {
    byId("checkout-note").textContent = `Stok bahan tidak cukup untuk kombinasi modifier ${validation.name || product.name}.`;
    return false;
  }
  if (duplicate) {
    duplicate.qty += line.qty;
    posState.cart = posState.cart.filter((item) => item.id !== lineId);
  } else {
    line.id = nextKey;
    line.modifierIds = [...modifierIds];
  }
  byId("checkout-note").textContent = "Modifier item keranjang berhasil diperbarui.";
  renderProducts();
  if (renderCartHandler) renderCartHandler();
  return true;
}

export function addToCart(productId) {
  const product = productById(state, productId);
  if (!product || isInactiveStatus(product.status)) return;
  if (!canAddProductFromCurrentDraft(product)) {
    byId("checkout-note").textContent = `${product.name} sold out.`;
    return;
  }
  if (productModifierOptions(state, product).length) openModifierModal(product);
  else addConfiguredProduct(productId);
}
