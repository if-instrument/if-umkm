import { renderLayout } from "../layout.js?v=coffee-v150";
import { apiDelete, apiPost, apiPut, applyPermissionControls, canManageCompanyMasters, canUsePermission, legacyOutletDbId, loadSession, loadState, primaryOutletId, scopedPayload, stampScopedMaster, visibleForSession } from "../store.js?v=coffee-v150";
import { byId, showAlert, showFeedback } from "../dom.js";
import { COMMON_STATUS, isActiveStatus, isInactiveStatus } from "../status-codes.js";
import { loadPageBootstrap } from "../page-engine.js?v=coffee-v150";

renderLayout();

const state = loadState();
const session = loadSession();
const canGlobal = canManageCompanyMasters(session);
let scopeFilter = canGlobal ? "all" : "outlet";
let productSearch = "";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function refreshData() {
  const response = loadPageBootstrap("categories", state, session, { view: "categories" });
  if (!response?.ok) throw new Error(response?.message || "Daftar kategori belum dapat dimuat dari database.");
  state.categories = response.data?.categories || [];
  state.products = response.data?.products || [];
}

function postCategory(url, payload) {
  const response = apiPost(url, scopedPayload(payload, state, session));
  if (!response?.ok) throw new Error(response?.message || "Kategori belum berhasil disimpan.");
  refreshData();
}

function putCategory(url, payload) {
  const response = apiPut(url, scopedPayload(payload, state, session));
  if (!response?.ok) throw new Error(response?.message || "Kategori belum berhasil disimpan.");
  refreshData();
}

function deleteCategory(url) {
  const response = apiDelete(url, scopedPayload({}, state, session));
  if (!response?.ok) throw new Error(response?.message || "Status kategori belum berhasil diubah.");
  refreshData();
}

function availableCategories() {
  return state.categories
    .filter((category) => visibleForSession(category, state, session))
    .filter((category) => canGlobal || category.scope === "outlet")
    .filter((category) => scopeFilter === "all" || category.scope === scopeFilter);
}

function allTargetCategories() {
  return state.categories
    .filter((category) => visibleForSession(category, state, session) && isActiveStatus(category.status))
    .filter((category) => canGlobal || category.scope === "outlet");
}

function visibleProducts() {
  return state.products
    .filter((product) => visibleForSession(product, state, session))
    .filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(productSearch));
}

function moveOptions(product) {
  const current = state.categories.find((category) => category.id === product.categoryId);
  return [
    isInactiveStatus(current?.status) ? `<option value="${current.id}" selected disabled>${escapeHtml(current.name)} · Nonaktif</option>` : "",
    `<option value="" ${product.categoryId ? "" : "selected"}>Belum dikategorikan</option>`,
    ...allTargetCategories().map((category) => `<option value="${category.id}" ${category.id === product.categoryId ? "selected" : ""}>${escapeHtml(category.name)} · ${category.scope === "company" ? "Global" : "Outlet"}</option>`)
  ].join("");
}

function productCard(product) {
  const canMove = canUsePermission("products.catalog", "update", state, session);
  return `
    <article class="category-product-card" draggable="${canMove}" data-category-product="${product.id}">
      <span class="category-product-grip" aria-hidden="true">::</span>
      <div class="category-product-copy"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku)} · ${product.scope === "company" ? "Produk global" : "Produk outlet"}</small></div>
      <label class="category-product-move"><span>Pindahkan kategori</span><select data-move-product="${product.id}" ${canMove ? "" : "disabled"}>${moveOptions(product)}</select></label>
    </article>`;
}

function lane(category, products) {
  const id = category?.id || "";
  const title = category?.name || "Belum Dikategorikan";
  const scope = category ? (category.scope === "company" ? "Global" : "Outlet Aktif") : "Tampil di tab Semua pada POS";
  const active = !category || isActiveStatus(category.status);
  const editable = !category || canGlobal || (category.scope === "outlet" && legacyOutletDbId(category.outletId) === legacyOutletDbId(primaryOutletId(state, session)));
  return `
    <section class="category-lane ${active ? "" : "category-lane-inactive"}" ${active ? `data-category-drop="${id}"` : ""}>
      <header>
        <div><strong>${escapeHtml(title)}</strong><small>${category && !active ? `${scope} · Nonaktif` : scope}</small></div>
        <div class="category-lane-heading-actions">
          <span>${products.length}</span>
          ${category ? `<button class="icon-button category-lane-action" ${editable ? "" : "disabled"} aria-label="Edit kategori ${escapeHtml(category.name)}" data-edit-category="${category.id}" data-permission="categories.manage:update" title="Edit kategori" type="button">E</button>` : ""}
          ${category ? `<button class="icon-button category-lane-action" ${editable ? "" : "disabled"} aria-label="${active ? "Nonaktifkan" : "Aktifkan"} kategori ${escapeHtml(category.name)}" data-toggle-category="${category.id}" data-permission="categories.manage:delete" title="${active ? "Nonaktifkan" : "Aktifkan"} kategori" type="button">${active ? "-" : "+"}</button>` : ""}
        </div>
      </header>
      <div class="category-lane-products">${products.length ? products.map(productCard).join("") : `<p class="category-lane-empty">Tarik produk ke area ini</p>`}</div>
    </section>`;
}

function renderBoard() {
  const categories = availableCategories();
  let products = visibleProducts();
  const categoryIds = new Set(categories.map((category) => category.id));
  if (canGlobal && scopeFilter !== "all") products = products.filter((product) => !product.categoryId || categoryIds.has(product.categoryId));
  const uncategorized = products.filter((product) => !product.categoryId || (!canGlobal && !categoryIds.has(product.categoryId)));
  byId("category-board").innerHTML = [lane(null, uncategorized), ...categories.map((category) => lane(category, products.filter((product) => product.categoryId === category.id)))].join("");
  byId("category-board-summary").textContent = `${products.length} produk · ${categories.length} kategori`;
  byId("category-scope-filter").hidden = !canGlobal;
  document.querySelectorAll("[data-category-scope-filter]").forEach((button) => button.classList.toggle("active", button.dataset.categoryScopeFilter === scopeFilter));
  applyPermissionControls(document, state, session);
}

function renderAll() {
  renderBoard();
}

function openModal(category = null) {
  byId("category-form").reset();
  byId("category-id").value = category?.id || "";
  byId("category-name").value = category?.name || "";
  byId("category-scope").value = category?.scope || (canGlobal ? "company" : "outlet");
  byId("category-scope").disabled = !canGlobal;
  byId("category-status").value = category?.status || "active";
  byId("category-modal-title").textContent = category ? "Edit Kategori" : "Tambah Kategori";
  document.querySelector("[data-category-backdrop]").hidden = false;
  byId("category-modal").hidden = false;
  document.body.classList.add("modal-open");
}

function closeModal() {
  document.querySelector("[data-category-backdrop]").hidden = true;
  byId("category-modal").hidden = true;
  document.body.classList.remove("modal-open");
}

function saveMapping(productId, categoryId) {
  const response = categoryId
    ? apiPut(`/api/product/${productId}/category`, scopedPayload({ categoryId }, state, session))
    : apiDelete(`/api/product/${productId}/category`, scopedPayload({}, state, session));
  if (!response?.ok) throw new Error(response?.message || "Kategori produk belum berhasil dipindahkan.");
  const index = state.products.findIndex((product) => product.id === productId);
  if (index >= 0 && response.data) state.products[index] = response.data;
  renderBoard();
  showAlert(categoryId ? "Kategori outlet produk berhasil diperbarui." : "Produk dipindahkan ke Belum Dikategorikan.");
}

byId("category-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = byId("category-id").value;
  if (!canUsePermission("categories.manage", id ? "update" : "create", state, session)) return;
  const name = byId("category-name").value.trim();
  const payload = stampScopedMaster({ name, scope: byId("category-scope").value, status: byId("category-status").value }, state, session);
  try {
    id ? putCategory(`/api/category/${id}`, payload) : postCategory("/api/category", payload);
    closeModal();
    renderAll();
    showAlert(`Kategori ${name} tersimpan.`);
  } catch (error) {
    byId("category-name").setCustomValidity(error.message);
    byId("category-name").reportValidity();
    byId("category-name").setCustomValidity("");
  }
});

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-open-category-modal]") && canUsePermission("categories.manage", "create", state, session)) openModal();
  const edit = event.target.closest("[data-edit-category]");
  if (edit && !edit.disabled && canUsePermission("categories.manage", "update", state, session)) openModal(state.categories.find((category) => category.id === edit.dataset.editCategory));
  const toggle = event.target.closest("[data-toggle-category]");
  if (toggle && !toggle.disabled && canUsePermission("categories.manage", "delete", state, session)) {
    const category = state.categories.find((item) => item.id === toggle.dataset.toggleCategory);
    if (!category) return;
    try {
      isInactiveStatus(category.status) ? putCategory(`/api/category/${category.id}`, { ...category, status: COMMON_STATUS.ACTIVE }) : deleteCategory(`/api/category/${category.id}`);
      renderAll();
    } catch (error) {
      showAlert(error.message, "error");
    }
  }
  const filter = event.target.closest("[data-category-scope-filter]");
  if (filter && canGlobal) {
    scopeFilter = filter.dataset.categoryScopeFilter;
    renderBoard();
  }
  if (event.target.closest("[data-close-category-modal]") || event.target.matches("[data-category-backdrop]")) closeModal();
});

document.addEventListener("change", (event) => {
  const select = event.target.closest("[data-move-product]");
  if (!select) return;
  try {
    saveMapping(select.dataset.moveProduct, select.value);
  } catch (error) {
    showFeedback("category-board-feedback", error.message);
    renderBoard();
  }
});

document.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-category-product]");
  if (!card || !canUsePermission("products.catalog", "update", state, session)) return;
  event.dataTransfer.setData("text/plain", card.dataset.categoryProduct);
  event.dataTransfer.effectAllowed = "move";
  card.classList.add("dragging");
});

document.addEventListener("dragend", (event) => {
  event.target.closest("[data-category-product]")?.classList.remove("dragging");
  document.querySelectorAll(".category-lane.drag-over").forEach((laneElement) => laneElement.classList.remove("drag-over"));
});

document.addEventListener("dragover", (event) => {
  const target = event.target.closest("[data-category-drop]");
  if (!target || !canUsePermission("products.catalog", "update", state, session)) return;
  event.preventDefault();
  target.classList.add("drag-over");
});

document.addEventListener("dragleave", (event) => {
  const target = event.target.closest("[data-category-drop]");
  if (target && !target.contains(event.relatedTarget)) target.classList.remove("drag-over");
});

document.addEventListener("drop", (event) => {
  const target = event.target.closest("[data-category-drop]");
  if (!target || !canUsePermission("products.catalog", "update", state, session)) return;
  event.preventDefault();
  target.classList.remove("drag-over");
  try {
    saveMapping(event.dataTransfer.getData("text/plain"), target.dataset.categoryDrop);
  } catch (error) {
    showFeedback("category-board-feedback", error.message);
    renderBoard();
  }
});

byId("category-board-search").addEventListener("input", (event) => {
  productSearch = event.target.value.trim().toLowerCase();
  renderBoard();
});
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });

try {
  refreshData();
} catch (error) {
  showAlert(error.message, "error");
}
renderAll();
