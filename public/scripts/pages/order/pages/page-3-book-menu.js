import { state, bookState, money } from "../order-state.js";
import {
  byId,
  optionalById,
  escapeHtml,
  productById,
  requiresModifierChoice,
  lineKey,
  lineUnitPrice,
  modifierNames,
  showFeedback,
  loadOrderData,
  shouldSkipServicePage
} from "../order-utils.js";
import {
  menuPageCapacity,
  menuLayoutClass,
  rebuildFlipbook,
  menuStartPage,
  checkoutStartPage,
  receiptStartPage,
  turnToPage,
  pageForSpread,
  destroyFlipbook,
  snapshotBookInputs,
  restoreBookInputs,
  syncOptionalBookPages,
  syncReceiptBookPages
} from "../order-navigation.js";
import {
  effectiveRecipe,
  ingredientById,
  isPreorderStockedProduct,
  isStockedProduct,
  productModifierOptions
} from "../../../inventory.js";
import { isActiveStatus, isInactiveStatus } from "../../../status-codes.js";
import { bindDynamicFieldListeners } from "../order-events.js";
import { renderBookStaticContent, renderBill } from "../order-render.js";
import { markCartChanged, renderCart } from "./page-4-cart.js";

export function normalizeCategoryLabel(name) {
  const normalized = String(name || "").trim();
  const legacyLabels = ["", "Tanpa Kategori", "Tidak ada kategori", "Uncategorized", "uncategorized", "Belum dikategorikan"];
  return legacyLabels.includes(normalized) ? "Lain-lain" : normalized || "Lain-lain";
}

export function renderCategories() {
  const visibleCategories = state.categories.filter((category) => !isInactiveStatus(category.status));
  const selectedValue = state.categoryId || "all";
  byId("order-categories").innerHTML = `
    <label class="public-category-picker">
      <select id="order-category-select" aria-label="Kategori">
        <option value="all" ${selectedValue === "all" ? "selected" : ""}>Semua</option>
        ${visibleCategories.map((category) => `<option value="${escapeHtml(category.id)}" ${selectedValue === category.id ? "selected" : ""}>${escapeHtml(normalizeCategoryLabel(category.name))}</option>`).join("")}
      </select>
    </label>
  `;
}

export function renderProducts() {
  const search = byId("order-search").value.trim().toLowerCase();
  const products = state.products
    .filter((product) => isActiveStatus(product.status))
    .filter((product) => state.categoryId === "all" || product.categoryId === state.categoryId)
    .filter((product) => !search || `${product.name} ${product.description || ""} ${product.category || ""}`.toLowerCase().includes(search));

  renderProductBookPages(products);
}

export function productCard(product) {
  const preorder = isPreorderStockedProduct(product);
  const soldOut = !preorder && (product.soldOut || Number(product.availableQty || 0) <= 0);
  const inCart = state.cart.filter((line) => line.productId === product.id).reduce((sum, line) => sum + line.qty, 0);
  const preorderBadge = product.isPreorder ? `<span class="preorder-pill">Preorder</span>` : "";
  const preorderNote = product.isPreorder ? `<div class="preorder-note">${escapeHtml(product.preorderNote || "Pesanan khusus, diproses sesuai jadwal outlet")}</div>` : "";
  return `
    <article class="public-product-card ${soldOut ? "is-soldout" : ""}" ${soldOut ? `aria-disabled="true"` : `data-product-card="${escapeHtml(product.id)}" role="button" tabindex="0"`}>
      <div class="public-product-photo">${product.imageUrl ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" />` : `<span>${escapeHtml((product.name || "?").slice(0, 1))}</span>`}</div>
      <div class="public-product-info">
        <strong>${escapeHtml(product.name)}</strong>
        <span>${money(product.price)}</span>
        ${preorderNote}
      </div>
      ${soldOut ? `<span class="soldout-badge">Sold Out</span>` : `<button data-add-product="${product.id}" type="button">${inCart ? inCart : "+"}</button>`}
      ${preorderBadge}
    </article>
  `;
}

export function categoryName(categoryId) {
  if (!categoryId) return "Lain-lain";
  const category = state.categories.find((category) => category.id === categoryId);
  return normalizeCategoryLabel(category?.name || "");
}

export function selectedCategoryName() {
  return state.categoryId === "all" ? "Semua Menu" : categoryName(state.categoryId);
}

export function groupedProducts(products) {
  const groups = new Map();
  products.forEach((product) => {
    const key = product.categoryId || "uncategorized";
    const groupName = normalizeCategoryLabel(product.category || categoryName(product.categoryId));
    const finalGroupName = groupName === "Lain-lain" ? "Lain-lain" : groupName;
    if (!groups.has(key)) groups.set(key, { id: key, name: groupName, products: [] });
    groups.get(key).products.push(product);
  });
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "id"));
}

export function renderProductBookPages(products) {
  const book = byId("order-flipbook");
  const currentPage = bookState.flipbookReady ? (flipbook()?.turn("page") || pageForSpread(state.spread)) : pageForSpread(state.spread);
  const capacity = menuPageCapacity();
  const layoutClass = menuLayoutClass();
  
  if (bookState.pristineBookTemplate && (bookState.flipbookReady || book.querySelector(".public-generated-menu-page") || book.querySelector(".page-wrapper"))) {
    const snapshot = snapshotBookInputs();
    destroyFlipbook();
    book.innerHTML = bookState.pristineBookTemplate;
    restoreBookInputs(snapshot);
    bindDynamicFieldListeners();
    renderBookStaticContent();
    continueRenderProductBookPages(products, currentPage, capacity, layoutClass);
  } else {
    continueRenderProductBookPages(products, currentPage, capacity, layoutClass);
  }
}

function continueRenderProductBookPages(products, currentPage, capacity, layoutClass) {
  const book = byId("order-flipbook");
  syncOptionalBookPages();
  const checkoutPage = book.querySelector('[data-book-section="checkout"]');
  const firstGrid = byId("order-products-current");
  const firstCategoryTitle = optionalById("order-menu-category-title");
  if (!checkoutPage || !firstGrid) {
    showFeedback("Halaman menu belum siap dimuat. Silakan refresh halaman.", true);
    rebuildFlipbook(Math.min(currentPage, receiptStartPage() + 1));
    return;
  }

  const pages = [];
  let firstChunkRendered = false;
  groupedProducts(products).forEach((group) => {
    for (let index = 0; index < group.products.length; index += capacity) {
      const chunk = group.products.slice(index, index + capacity);
      if (!firstChunkRendered) {
        firstChunkRendered = true;
        firstGrid.className = `public-order-grid public-order-grid-book ${layoutClass} public-menu-first-grid`;
        firstGrid.innerHTML = chunk.map(productCard).join("");
        if (firstCategoryTitle) firstCategoryTitle.textContent = group.name;
        byId("order-menu-summary").textContent = `${products.length} produk`;
        continue;
      }
      pages.push(`
        <article class="public-book-page public-generated-menu-page" data-book-section="menu">
          <div class="public-step-heading compact-heading">
            <div>
              <h1>${escapeHtml(group.name)}</h1>
            </div>
          </div>
          <div class="public-order-grid public-order-grid-book ${layoutClass}">
            ${chunk.map(productCard).join("")}
          </div>
        </article>
      `);
    }
  });

  if (!firstChunkRendered) {
    firstGrid.className = `public-order-grid public-order-grid-book ${layoutClass} public-menu-first-grid`;
    firstGrid.innerHTML = `<div class="empty-state">Produk belum tersedia untuk pilihan ini.</div>`;
    if (firstCategoryTitle) firstCategoryTitle.textContent = selectedCategoryName();
    byId("order-menu-summary").textContent = "Belum ada produk untuk filter ini.";
  }

  checkoutPage.insertAdjacentHTML("beforebegin", pages.join(""));
  syncReceiptBookPages();
  rebuildFlipbook(Math.min(currentPage, receiptStartPage() + 1));
}

export function addProduct(productId) {
  const product = productById(productId);
  if (!product || (!isPreorderStockedProduct(product) && (product.soldOut || Number(product.availableQty || 0) <= 0))) return;
  openMenuDetail(product);
}

export function openMenuDetail(product, preferredLine = null, editMode = false) {
  const defaultLine = preferredLine || state.cart.find((line) => line.productId === product.id);
  const defaultQty = defaultLine ? defaultLine.qty : 1;
  byId("order-modifier-product-id").value = product.id;
  byId("order-detail-line-id").value = defaultLine?.id || "";
  byId("order-detail-original-line-id").value = defaultLine?.id || "";
  byId("order-detail-edit-mode").value = editMode ? "1" : "0";
  byId("order-detail-submit-label").textContent = editMode ? "Simpan Perubahan" : "Masukkan Cart";
  byId("order-detail-qty").value = String(defaultQty);
  byId("order-detail-qty-label").textContent = String(defaultQty);
  byId("order-detail-name").textContent = product.name;
  byId("order-detail-description").textContent = product.description || product.category || "Produk tersedia";
  byId("order-detail-price").textContent = money(product.price);
  byId("order-detail-photo").innerHTML = product.imageUrl
    ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" />`
    : `<span>${escapeHtml((product.name || "?").slice(0, 1))}</span>`;
  const groups = productModifierOptions(state, product).reduce((map, option) => {
    if (!map.has(option.groupId)) {
      map.set(option.groupId, {
        id: option.groupId,
        name: option.groupName,
        required: option.groupRequired,
        choiceType: option.groupChoiceType || "multiple",
        options: []
      });
    }
    map.get(option.groupId).options.push(option);
    return map;
  }, new Map());
  const existingLines = state.cart.filter((line) => line.productId === product.id);
  const existingPanel = byId("order-existing-configs");
  existingPanel.hidden = existingLines.length === 0;
  existingPanel.innerHTML = existingLines.length ? `
    <strong>Sudah ada di cart</strong>
    ${existingLines.map((line) => `
      <button class="${defaultLine?.id === line.id ? "active" : ""}" data-repeat-config="${escapeHtml(line.id)}" type="button">
        <span>${escapeHtml(modifierNames(product, line.modifierIds || []) || "Tanpa modifier")}</span>
        <small>${line.qty} item di cart · lanjutkan atau buat pilihan baru</small>
      </button>
    `).join("")}
  ` : "";
  byId("order-modifier-options").innerHTML = [...groups.values()].map((group) => `
    <fieldset class="public-modifier-group" data-required-modifier-group="${group.required ? group.id : ""}">
      <legend>${escapeHtml(group.name)} <small>${group.required ? "Wajib" : "Opsional"} · ${group.choiceType === "single" ? "pilih satu" : "bisa pilih beberapa"}</small></legend>
      ${group.options.map((option) => `
        <label class="public-modifier-option">
          <input name="modifier-${escapeHtml(group.id)}" type="${group.choiceType === "single" ? "radio" : "checkbox"}" value="${escapeHtml(option.id)}" />
          <span><strong>${escapeHtml(option.name)}</strong><small>${Number(option.priceDelta || 0) ? `+ ${money(option.priceDelta)}` : "Tanpa tambahan harga"}</small></span>
        </label>
      `).join("")}
    </fieldset>
  `).join("") || `<div class="empty-state compact">Tidak ada modifier untuk produk ini.</div>`;
  if (defaultLine) {
    byId("order-modifier-form").querySelectorAll(".public-modifier-option input").forEach((input) => {
      input.checked = (defaultLine.modifierIds || []).includes(input.value);
    });
  }
  updateDetailQty(0);
  byId("order-menu-detail").hidden = false;
}

export function closeMenuDetail() {
  byId("order-menu-detail").hidden = true;
  byId("order-modifier-form").reset();
  byId("order-detail-line-id").value = "";
  byId("order-detail-original-line-id").value = "";
  byId("order-detail-edit-mode").value = "0";
  byId("order-detail-submit-label").textContent = "Masukkan Cart";
  byId("order-detail-qty").value = "1";
}

export function updateDetailQty(delta = 0) {
  const input = byId("order-detail-qty");
  const product = productById(byId("order-modifier-product-id").value);
  const modifierIds = selectedDetailModifierIds();
  const selectedLineId = product ? selectedDetailLineId(product.id, modifierIds) : "";
  const originalLineId = byId("order-detail-edit-mode").value === "1" ? byId("order-detail-original-line-id").value : "";
  const maxQty = product ? maxQtyForConfig(product, modifierIds, [selectedLineId, originalLineId].filter(Boolean)) : 1;
  const next = maxQty <= 0 ? 0 : Math.min(maxQty, Math.max(1, Number(input.value || 1) + delta));
  input.value = String(next);
  byId("order-detail-qty-label").textContent = String(next);
  byId("order-detail-line-total").textContent = money(lineUnitPrice(product, { modifierIds }) * next);
  byId("order-detail-stock-note").textContent = stockNote(product, modifierIds, maxQty);
}

export function selectedDetailModifierIds() {
  return [...byId("order-modifier-form").querySelectorAll(".public-modifier-option input:checked")].map((input) => input.value);
}

export function selectedDetailLineId(productId, modifierIds = []) {
  const selectedLineId = byId("order-detail-line-id").value;
  const selectedLine = state.cart.find((line) => line.id === selectedLineId);
  if (selectedLine?.id === lineKey(productId, modifierIds)) return selectedLine.id;
  return cartLineForConfig(productId, modifierIds)?.id || "";
}

export function cartLineForConfig(productId, modifierIds = []) {
  return state.cart.find((line) => line.id === lineKey(productId, modifierIds));
}

export function cartStockReservations(excludeLineId = "") {
  const excludedLineIds = new Set(Array.isArray(excludeLineId) ? excludeLineId.filter(Boolean) : [excludeLineId].filter(Boolean));
  const reservations = { products: new Map(), ingredients: new Map() };
  state.cart
    .filter((line) => !excludedLineIds.has(line.id))
    .forEach((line) => {
      const product = productById(line.productId);
      if (!product) return;
      const qty = Number(line.qty || 0);
      if (isStockedProduct(product)) {
        if (isPreorderStockedProduct(product)) return;
        reservations.products.set(product.id, (reservations.products.get(product.id) || 0) + qty);
        return;
      }
      effectiveRecipe(product, line.modifierIds || [], state).forEach((recipeLine) => {
        const usedQty = Number(recipeLine.qty || 0) * qty;
        reservations.ingredients.set(recipeLine.ingredientId, (reservations.ingredients.get(recipeLine.ingredientId) || 0) + usedQty);
      });
    });
  return reservations;
}

export function maxQtyForConfig(product, modifierIds = [], excludeLineId = "") {
  if (!product) return 0;
  const reservations = cartStockReservations(excludeLineId);
  if (isStockedProduct(product)) {
    if (isPreorderStockedProduct(product)) return 999999;
    return Math.max(0, Math.floor(Number(product.finishedStock || 0) - (reservations.products.get(product.id) || 0)));
  }
  const recipe = effectiveRecipe(product, modifierIds, state);
  if (!recipe.length) return 0;
  return Math.max(0, Math.min(...recipe.map((line) => {
    const ingredient = ingredientById(state, line.ingredientId);
    const perItemQty = Number(line.qty || 0);
    if (!ingredient || isInactiveStatus(ingredient.status) || perItemQty <= 0) return 0;
    const remaining = Number(ingredient.stock || 0) - (reservations.ingredients.get(line.ingredientId) || 0);
    return Math.floor(remaining / perItemQty);
  })));
}

export function stockNote(product, modifierIds = [], maxQty = 0) {
  if (!product) return "";
  if (isPreorderStockedProduct(product)) return product.preorderNote || "Produk preorder, stok akan dipenuhi sesuai jadwal outlet.";
  return maxQty > 0 ? `Tersedia ${maxQty} item untuk pilihan ini.` : "Maaf, pilihan ini sedang tidak tersedia.";
}

export function syncDetailSelectionWithCart() {
  const productId = byId("order-modifier-product-id").value;
  const modifierIds = selectedDetailModifierIds();
  const existingLine = cartLineForConfig(productId, modifierIds);
  const originalLine = state.cart.find((line) => line.id === byId("order-detail-original-line-id").value);
  const isEditingCartLine = byId("order-detail-edit-mode").value === "1";
  byId("order-detail-line-id").value = existingLine?.id || "";
  byId("order-existing-configs").querySelectorAll("[data-repeat-config]").forEach((button) => {
    button.classList.toggle("active", existingLine?.id === button.dataset.repeatConfig);
  });
  byId("order-detail-qty").value = existingLine ? String(existingLine.qty) : isEditingCartLine && originalLine ? String(originalLine.qty) : "1";
}

export function selectDetailConfig(lineId) {
  const line = state.cart.find((item) => item.id === lineId);
  if (!line) return;
  byId("order-detail-line-id").value = line.id;
  byId("order-existing-configs").querySelectorAll("[data-repeat-config]").forEach((button) => {
    button.classList.toggle("active", button.dataset.repeatConfig === line.id);
  });
  byId("order-detail-qty").value = String(line.qty);
  byId("order-modifier-form").querySelectorAll(".public-modifier-option input").forEach((input) => {
    input.checked = (line.modifierIds || []).includes(input.value);
  });
  updateDetailQty(0);
}

export function addConfiguredProduct(productId, modifierIds = [], qty = 1) {
  const product = productById(productId);
  if (!product) return;
  const book = flipbook();
  const rawActivePage = bookState.flipbookReady && book?.length ? Number(book.turn("page")) : checkoutStartPage();
  const activePage = Number.isFinite(rawActivePage) && rawActivePage > 0 ? rawActivePage : menuStartPage();
  const quantity = Math.max(1, Number(qty || 1));
  const key = lineKey(productId, modifierIds);
  const current = state.cart.find((line) => line.id === key);
  const available = maxQtyForConfig(product, modifierIds, current?.id || "");
  if (current) {
    if (current.qty + quantity > available) {
      showFeedback(`Pilihan ini tersisa ${Math.max(0, available - current.qty)} item lagi.`, true);
      return;
    }
    current.qty += quantity;
  } else {
    if (available <= 0) {
      showFeedback("Maaf, pilihan ini sedang tidak tersedia.", true);
      return;
    }
    if (quantity > available) {
      showFeedback(`Pilihan ini tersedia ${available} item.`, true);
      return;
    }
    state.cart.push({ id: key, productId, modifierIds: [...modifierIds], qty: quantity });
  }
  markCartChanged();
  closeMenuDetail();
  const targetPage = Math.min(Math.max(activePage, menuStartPage()), Math.max(menuStartPage(), checkoutStartPage() - 1));
  renderProducts();
  renderCart();
  renderBill();
  turnToPage(targetPage, true);
}

export function setConfiguredProductQty(productId, modifierIds = [], qty = 1, options = {}) {
  const product = productById(productId);
  if (!product) return;
  const book = flipbook();
  const rawActivePage = bookState.flipbookReady && book?.length ? Number(book.turn("page")) : checkoutStartPage();
  const activePage = Number.isFinite(rawActivePage) && rawActivePage > 0 ? rawActivePage : menuStartPage();
  const quantity = Math.max(1, Number(qty || 1));
  const key = lineKey(productId, modifierIds);
  const current = state.cart.find((line) => line.id === key);
  const available = maxQtyForConfig(product, modifierIds, current?.id || "");
  if (quantity > available) {
    showFeedback(`Pilihan ini tersedia ${available} item.`, true);
    return;
  }
  if (current) current.qty = quantity;
  else state.cart.push({ id: key, productId, modifierIds: [...modifierIds], qty: quantity });
  markCartChanged();
  closeMenuDetail();
  const targetPage = options.spread === "checkout"
    ? checkoutStartPage()
    : Math.min(Math.max(activePage, menuStartPage()), Math.max(menuStartPage(), checkoutStartPage() - 1));
  renderProducts();
  renderCart();
  renderBill();
  turnToPage(targetPage, true);
}

export function handleModifierSubmit(event) {
  event.preventDefault();
  const missingRequired = [...event.target.querySelectorAll("[data-required-modifier-group]")]
    .filter((group) => group.dataset.requiredModifierGroup && !group.querySelector("input:checked"));
  if (missingRequired.length) {
    showFeedback("Pilih opsi modifier wajib terlebih dahulu.", true);
    return;
  }
  const modifierIds = [...event.target.querySelectorAll(".public-modifier-option input:checked")].map((input) => input.value);
  const productId = byId("order-modifier-product-id").value;
  const selectedKey = lineKey(productId, modifierIds);
  const isEditingCartLine = byId("order-detail-edit-mode").value === "1";
  const originalLineId = byId("order-detail-original-line-id").value;
  if (isEditingCartLine && originalLineId && originalLineId !== selectedKey) {
    state.cart = state.cart.filter((line) => line.id !== originalLineId);
    setConfiguredProductQty(productId, modifierIds, detailQty(), { spread: state.spread });
  } else if (byId("order-detail-line-id").value === selectedKey) {
    setConfiguredProductQty(productId, modifierIds, detailQty(), { spread: state.spread });
  } else {
    addConfiguredProduct(productId, modifierIds, detailQty());
  }
}

export function detailQty() {
  return Math.max(0, Number(optionalById("order-detail-qty")?.value || 1));
}

function flipbook() {
  return window.jQuery ? window.jQuery("#order-flipbook") : null;
}
