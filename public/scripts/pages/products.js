import { renderLayout } from "../layout.js?v=coffee-v151";
import { apiDelete, apiPost, apiPut, apiUpload, appPath, applyPermissionControls, canAccessAllOutlets, canManageCompanyMasters, canUsePermission, legacyOutletDbId, loadSession, loadState, primaryOutletId, scopedPayload, stampScopedMaster, visibleForSession } from "../store.js?v=coffee-v151";
import { formatQty, money } from "../format.js";
import { isStockedProduct, missingRecipeLines, missingRecipeSummary, productCogs } from "../inventory.js";
import { byId, setText, showAlert, showFeedback } from "../dom.js";
import { enhanceAllDataTables } from "../datatable.js";
import { COMMON_STATUS, isInactiveStatus } from "../status-codes.js";
import { loadPageBootstrap } from "../page-engine.js?v=coffee-v151";

renderLayout();

const state = loadState();
const session = loadSession();

function exists(id) {
  return Boolean(byId(id));
}

function applyProductSuite(data) {
  if (!data) return;
  if (Array.isArray(data.categories)) state.categories = data.categories;
  if (Array.isArray(data.products)) state.products = data.products;
  if (Array.isArray(data.modifiers)) state.modifiers = data.modifiers;
  if (Array.isArray(data.ingredients)) state.ingredients = data.ingredients;
}

function refreshProductSuite() {
  const response = loadPageBootstrap("products", state, session, { view: "products" });
  if (!response?.ok) throw new Error(response?.message || "Data produk belum dapat dimuat.");
  applyProductSuite(response.data || {});
}

function postProductSuite(url, payload) {
  const response = apiPost(url, scopedPayload(payload, state, session));
  if (!response?.ok) throw new Error(response?.message || "Data produk belum berhasil disimpan.");
  refreshProductSuite();
}

function putProductSuite(url, payload) {
  const response = apiPut(url, scopedPayload(payload, state, session));
  if (!response?.ok) throw new Error(response?.message || "Data produk belum berhasil disimpan.");
  refreshProductSuite();
}

function putProductPrice(productId, payload) {
  const response = apiPut(`/api/product/${productId}/price`, scopedPayload(payload, state, session));
  if (!response?.ok) throw new Error(response?.message || "Harga outlet belum berhasil disimpan.");
  refreshProductSuite();
}

function deleteProductSuite(url, payload = {}) {
  const response = apiDelete(url, scopedPayload(payload, state, session));
  if (!response?.ok) throw new Error(response?.message || "Data produk belum berhasil disimpan.");
  refreshProductSuite();
}

function visibleProducts() {
  return state.products.filter((product) => visibleForSession(product, state, session));
}

function nextProductSku() {
  const existing = new Set(state.products.map((product) => product.sku).filter(Boolean));
  let index = state.products.length + 1;
  let sku = "";
  do {
    sku = `PRD-${String(index).padStart(4, "0")}`;
    index += 1;
  } while (existing.has(sku));
  return sku;
}

function categoryName(product) {
  return state.categories.find((category) => category.id === product.categoryId)?.name || product.category || "Belum dikategorikan";
}

function canEditMaster(item) {
  if (canManageCompanyMasters(session)) return true;
  return item?.scope === "outlet" && legacyOutletDbId(item.outletId) === legacyOutletDbId(primaryOutletId(state, session));
}

function syncScopeControl(product = null) {
  const field = byId("modal-product-scope");
  if (!field) return;
  const canGlobal = canManageCompanyMasters(session);
  field.value = product?.scope || (canGlobal ? "company" : "outlet");
  field.disabled = !canGlobal || Boolean(product && !canEditMaster(product));
  if (!canGlobal) field.value = "outlet";
}

function syncInventoryTypeFields() {
  if (!exists("modal-product-inventory-type") || !exists("modal-product-shelf-life-field")) return;
  const isFinishedGood = byId("modal-product-inventory-type").value === "finished_good";
  byId("modal-product-shelf-life-field").hidden = !isFinishedGood;
  if (!isFinishedGood && exists("modal-product-shelf-life")) byId("modal-product-shelf-life").value = 0;
}

function isRetailProduct(product) {
  return (product?.inventoryType || "made_to_order") === "retail";
}

function productImagePreviewMarkup(url) {
  return url ? `<img src="${url}" alt="Preview foto produk" />` : "Foto";
}

function setProductImage(url) {
  byId("modal-product-image-url").value = url || "";
  byId("modal-product-image-preview").innerHTML = productImagePreviewMarkup(url);
}

function uploadProductImage(file) {
  if (!file) return;
  const formData = new FormData();
  formData.append("productImage", file);
  const result = apiUpload("/api/product-image", formData);
  if (!result?.ok || !result.url) {
    showFeedback("modal-product-feedback", result?.message || "Upload foto produk gagal.");
    byId("modal-product-image-file").value = "";
    return;
  }
  setProductImage(result.url);
  showFeedback("modal-product-feedback", "Foto produk berhasil diupload. Simpan produk untuk memakai foto ini.");
}

function renderProducts() {
  if (!exists("product-table")) return;
  byId("product-table").innerHTML = state.products
    .filter((product) => visibleForSession(product, state, session))
    .map((product) => {
    const cogs = productCogs(state, product);
    const profit = product.price - cogs;
    const margin = product.price ? (profit / product.price) * 100 : 0;
    const isInactive = isInactiveStatus(product.status);
    const missingRecipe = missingRecipeLines(state, product);
    const stockedProduct = isStockedProduct(product);
    const recipeStatus = isRetailProduct(product) ? "Siap Jual" : (!product.recipe.length ? "Recipe Kosong" : missingRecipe.length ? "Perlu Mapping Bahan" : "Recipe Siap");
    const canEdit = canEditMaster(product);
    const needsRecipe = !isRetailProduct(product) && (missingRecipe.length || !product.recipe.length);
    const recipeNote = !isRetailProduct(product) && missingRecipe.length ? `<br><small class="muted-text">Perlu mapping bahan: ${missingRecipeSummary(state, product)}</small>` : "";
    const recipeAction = isRetailProduct(product)
      ? ""
      : `<a class="primary-button compact-button button-link" data-permission="recipes.template:read" href="${appPath(`/pages/recipes.html?product=${encodeURIComponent(product.id)}`)}">${product.recipe.length ? "Kelola Recipe" : "Buat Recipe"}</a>`;

      return `
      <tr>
        <td>${product.imageUrl ? `<img class="table-product-photo product-photo-image" src="${product.imageUrl}" alt="${product.name}" />` : `<span class="table-product-photo"></span>`}</td>
        <td><strong>${product.sku}</strong></td>
        <td><strong>${product.name}</strong><br><small>${product.scope === "outlet" ? "Menu khusus outlet" : "Menu perusahaan"}</small>${recipeNote}</td>
        <td>${categoryName(product)}</td>
        <td><strong>${money(product.price)}</strong><br><small>${product.priceSource === "outlet" ? "Harga outlet aktif" : "Default produk"}${product.priceSource === "outlet" ? ` · default ${money(product.basePrice || 0)}` : ""}</small></td>
        <td>${money(cogs)}</td>
        <td>${stockedProduct ? `${formatQty(product.finishedStock || 0)} unit<br><small>${isRetailProduct(product) ? "Stok barang dagang" : "FEFO produk jadi"}</small>` : `<small>Made to order</small>`}</td>
        <td>${margin.toFixed(1)}%</td>
        <td><span class="status-pill ${isInactive ? "status-empty" : needsRecipe ? "status-low" : "status-ok"}">${isInactive ? "Nonaktif" : recipeStatus}</span></td>
        <td>
          <div class="row-actions">
            ${recipeAction}
            <button class="ghost-button compact-button" data-product-price="${product.id}" data-permission="products.outletPrice:update" type="button">Harga Outlet</button>
            <button class="ghost-button compact-button" ${canEdit ? "" : "disabled title=\"Selected Outlet hanya bisa edit produk outlet yang dipilih\""} data-edit-product="${product.id}" data-permission="products.catalog:update" type="button">Edit</button>
            <button class="ghost-button compact-button" ${canEdit ? "" : "disabled title=\"Selected Outlet hanya bisa edit produk outlet yang dipilih\""} data-toggle-product="${product.id}" data-permission="products.catalog:delete" type="button">${isInactive ? "Aktifkan" : "Nonaktif"}</button>
          </div>
        </td>
      </tr>
      `;
    })
    .join("");

  enhanceAllDataTables();
  applyPermissionControls(document, state, session);
}

function openModal(product = null) {
  byId("product-modal-form").reset();
  byId("modal-product-id").value = product?.id || "";
  byId("product-modal-title").textContent = product ? "Edit Produk" : "Tambah Produk Baru";
  byId("modal-product-sku").value = product?.sku || nextProductSku();
  byId("modal-product-name").value = product?.name || "";
  byId("modal-product-price").value = product ? (product.basePrice ?? product.price ?? "") : "";
  byId("modal-product-inventory-type").value = product?.inventoryType || "made_to_order";
  byId("modal-product-shelf-life").value = product?.shelfLifeDays || 0;
  syncInventoryTypeFields();
  byId("modal-product-status").value = product?.status || "active";
  syncScopeControl(product);
  byId("modal-product-image-file").value = "";
  setProductImage(product?.imageUrl || "");
  byId("modal-product-description").value = product?.description || "";
  document.querySelector("[data-modal-backdrop]").hidden = false;
  byId("product-modal").hidden = false;
  document.body.classList.add("modal-open");
  setTimeout(() => byId("modal-product-name").focus(), 80);
}

function closeModal() {
  document.querySelector("[data-modal-backdrop]").hidden = true;
  byId("product-modal").hidden = true;
  document.body.classList.remove("modal-open");
}

function openPriceModal(product) {
  if (!product) return;
  byId("product-price-form").reset();
  byId("price-product-id").value = product.id;
  byId("product-price-title").textContent = `Harga Outlet - ${product.name}`;
  byId("price-product-name").value = product.name;
  byId("price-product-base").value = money(product.basePrice ?? product.price ?? 0);
  byId("price-product-outlet").value = product.outletPrice ?? product.price ?? "";
  byId("price-product-note").value = product.outletPriceNote || "";
  byId("price-product-preview").textContent = `${product.name} akan dijual di outlet aktif dengan harga ${money(Number(byId("price-product-outlet").value) || 0)}.`;
  document.querySelector("[data-modal-backdrop]").hidden = false;
  byId("product-price-modal").hidden = false;
  document.body.classList.add("modal-open");
  setTimeout(() => byId("price-product-outlet").focus(), 80);
}

function closePriceModal() {
  document.querySelector("[data-modal-backdrop]").hidden = true;
  byId("product-price-modal").hidden = true;
  document.body.classList.remove("modal-open");
}

function closeAnyModal() {
  closeModal();
  closePriceModal();
}

function updatePreview() {
  if (!exists("modal-product-name") || !exists("modal-product-price")) return;
  const name = byId("modal-product-name").value.trim();
  const price = Number(byId("modal-product-price").value);
  setText("modal-product-preview", name && price > 0 ? `${name} akan dijual ${money(price)}. Deskripsi akan tampil sebagai panduan kasir di POS.` : "Deskripsi produk membantu kasir menjelaskan produk kepada pelanggan.");
}

if (exists("product-modal-form")) byId("product-modal-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = byId("modal-product-id").value;
  if (!canUsePermission("products.catalog", id ? "update" : "create", state, session)) {
    showFeedback("modal-product-feedback", "Anda tidak punya akses untuk menyimpan produk.");
    return;
  }
  const existing = state.products.find((product) => product.id === id);
  const payload = stampScopedMaster({
    sku: byId("modal-product-sku").value.trim(),
    name: byId("modal-product-name").value.trim(),
    price: Number(byId("modal-product-price").value),
    inventoryType: byId("modal-product-inventory-type").value,
    shelfLifeDays: Number(byId("modal-product-shelf-life").value) || 0,
    scope: byId("modal-product-scope").value,
    status: byId("modal-product-status").value,
    imageUrl: byId("modal-product-image-url").value.trim(),
    description: byId("modal-product-description").value.trim()
  }, state, session);
  if (existing && !canEditMaster(existing)) {
    showFeedback("modal-product-feedback", "User Selected Outlet hanya bisa edit produk outlet yang dipilih.");
    return;
  }
  if (existing && canAccessAllOutlets(session) && existing.scope === "outlet") {
    payload.scope = existing.scope;
    payload.outletId = existing.outletId;
  }
  try {
    id ? putProductSuite(`/api/product/${id}`, payload) : postProductSuite("/api/product", payload);
    event.target.reset();
    updatePreview();
    renderProducts();
    closeModal();
    showAlert(existing ? "Perubahan produk tersimpan." : "Produk tersimpan. Atur kategori outlet dan recipe agar siap dijual di POS.");
  } catch (error) {
    showFeedback("modal-product-feedback", error.message);
  }
});

if (exists("product-price-form")) byId("product-price-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canUsePermission("products.outletPrice", "update", state, session)) {
    showFeedback("price-product-feedback", "Anda tidak punya akses untuk mengubah harga outlet.");
    return;
  }
  const productId = byId("price-product-id").value;
  const product = state.products.find((item) => item.id === productId);
  try {
    putProductPrice(productId, {
      price: Number(byId("price-product-outlet").value),
      note: byId("price-product-note").value.trim(),
      status: COMMON_STATUS.ACTIVE
    });
    closePriceModal();
    renderProducts();
    showAlert(`Harga outlet ${product?.name || "produk"} tersimpan.`);
  } catch (error) {
    showFeedback("price-product-feedback", error.message);
  }
});

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-open-product-modal]") && canUsePermission("products.catalog", "create", state, session)) openModal();
  const editButton = event.target.closest("[data-edit-product]");
  if (editButton && !editButton.disabled && canUsePermission("products.catalog", "update", state, session)) openModal(state.products.find((product) => product.id === editButton.dataset.editProduct));
  const priceButton = event.target.closest("[data-product-price]");
  if (priceButton && canUsePermission("products.outletPrice", "update", state, session)) openPriceModal(state.products.find((product) => product.id === priceButton.dataset.productPrice));
  const toggleButton = event.target.closest("[data-toggle-product]");
  if (toggleButton && !toggleButton.disabled && canUsePermission("products.catalog", "delete", state, session)) {
    const product = state.products.find((item) => item.id === toggleButton.dataset.toggleProduct);
    if (!product) return;
    try {
      if (isInactiveStatus(product.status)) putProductSuite(`/api/product/${product.id}`, { ...product, status: COMMON_STATUS.ACTIVE });
      else deleteProductSuite(`/api/product/${product.id}`, {});
      const updated = state.products.find((item) => item.id === product.id) || product;
      renderProducts();
      showFeedback("modal-product-feedback", `${updated.name} ${isInactiveStatus(updated.status) ? "dinonaktifkan" : "diaktifkan"} tanpa menghapus data audit.`);
    } catch (error) {
      showFeedback("modal-product-feedback", error.message);
    }
  }
  if (event.target.closest("[data-close-modal]")) closeModal();
  if (event.target.closest("[data-close-price-modal]")) closePriceModal();
  if (event.target.matches("[data-modal-backdrop]")) closeAnyModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeAnyModal();
});
["modal-product-name", "modal-product-price"].forEach((id) => {
  if (exists(id)) byId(id).addEventListener("input", updatePreview);
});
if (exists("modal-product-inventory-type")) byId("modal-product-inventory-type").addEventListener("change", syncInventoryTypeFields);
if (exists("price-product-outlet")) byId("price-product-outlet").addEventListener("input", () => {
  const product = state.products.find((item) => item.id === byId("price-product-id").value);
  byId("price-product-preview").textContent = `${product?.name || "Produk"} akan dijual di outlet aktif dengan harga ${money(Number(byId("price-product-outlet").value) || 0)}.`;
});
if (exists("modal-product-image-file")) byId("modal-product-image-file").addEventListener("change", (event) => {
  uploadProductImage(event.target.files?.[0]);
});

refreshProductSuite();
renderProducts();
updatePreview();
