import { renderLayout } from "../layout.js?v=coffee-v137";
import { apiGet, apiPut, appPath, applyPermissionControls, canUsePermission, loadSession, loadState, scopedApiUrl, scopedPayload, visibleForSession } from "../store.js?v=coffee-v137";
import { formatQty } from "../format.js";
import { byId, setText, showAlert } from "../dom.js";
import { enhanceAllDataTables } from "../datatable.js";

renderLayout();

const state = loadState();
const session = loadSession();
let mappingRows = new Map();
let activeTab = "recipe";

function applySuite(data) {
  if (!data) return;
  if (Array.isArray(data.products)) state.products = data.products;
  if (Array.isArray(data.modifiers)) state.modifiers = data.modifiers;
  if (Array.isArray(data.ingredients)) state.ingredients = data.ingredients;
  if (Array.isArray(data.ingredientTemplates)) state.ingredientTemplates = data.ingredientTemplates;
}

function refreshSuite() {
  const products = apiGet(scopedApiUrl("/api/product?per_page=100", state, session));
  const modifiers = apiGet(scopedApiUrl("/api/modifier?per_page=100", state, session));
  const ingredients = apiGet(scopedApiUrl("/api/ingredient?per_page=100", state, session));
  const templates = apiGet(scopedApiUrl("/api/ingredient-template?per_page=100&status=active", state, session));
  applySuite({
    products: products?.data?.items || [],
    modifiers: modifiers?.data?.items || [],
    ingredients: ingredients?.data?.items || [],
    ingredientTemplates: templates?.data?.items || []
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}

function visibleProducts() {
  return state.products.filter((product) => visibleForSession(product, state, session));
}

function visibleModifiers() {
  return state.modifiers.filter((modifier) => visibleForSession(modifier, state, session));
}

function visibleIngredients() {
  return state.ingredients
    .filter((ingredient) => visibleForSession(ingredient, state, session))
    .filter((ingredient) => ingredient.status !== "inactive");
}

function templateById(templateId) {
  return (state.ingredientTemplates || []).find((template) => template.id === templateId) || {};
}

function ingredientById(ingredientId) {
  return state.ingredients.find((ingredient) => ingredient.id === ingredientId);
}

function ingredientForTemplate(templateId) {
  return visibleIngredients().find((ingredient) => ingredient.templateId === templateId);
}

function ingredientOptions(selectedId = "") {
  const options = [
    `<option value="">Pilih bahan outlet</option>`,
    ...visibleIngredients().map((ingredient) => `
      <option value="${ingredient.id}" ${ingredient.id === selectedId ? "selected" : ""}>
        ${escapeHtml(ingredient.name)} (${escapeHtml(ingredient.unit)})${ingredient.templateName ? ` - ${escapeHtml(ingredient.templateName)}` : ""}
      </option>
    `)
  ];
  return options.join("");
}

function actionLabel(action) {
  if (action === "replace") return "Ganti";
  return "Tambah/Kurang";
}

function currentMappingLabel(templateId, fallbackIngredientId = "") {
  const ingredient = ingredientById(fallbackIngredientId) || ingredientForTemplate(templateId);
  if (!ingredient || ingredient.status === "inactive") return `<span class="status-pill status-low">Belum dimapping</span>`;
  return `<strong>${escapeHtml(ingredient.name)}</strong><br><small>${escapeHtml(ingredient.unit)} · stok ${formatQty(ingredient.stock)}</small>`;
}

function currentMappingId(templateId, fallbackIngredientId = "") {
  const ingredient = ingredientById(fallbackIngredientId) || ingredientForTemplate(templateId);
  return ingredient && ingredient.status !== "inactive" ? ingredient.id : "";
}

function recipeRows() {
  return visibleProducts().flatMap((product) => (product.recipe || []).map((line) => {
    const template = templateById(line.templateId);
    return {
      key: `recipe:${product.id}:${line.templateId}`,
      source: "recipe",
      product,
      templateId: line.templateId,
      templateName: line.templateName || template.name || line.ingredientName || line.templateId,
      templateUnit: line.unit || template.unit || "",
      qty: line.qty,
      ingredientId: line.ingredientId || currentMappingId(line.templateId)
    };
  })).filter((row) => row.templateId);
}

function modifierRows() {
  const rows = [];
  visibleModifiers().forEach((modifier) => {
    (modifier.options || []).forEach((option) => {
      if (option.templateId) {
        rows.push({
          key: `modifier:${modifier.id}:${option.id}:base`,
          source: "modifier",
          modifier,
          option,
          part: "base",
          action: option.action,
          templateId: option.templateId,
          templateName: option.templateName || option.ingredientName || option.templateId,
          ingredientId: option.ingredientId || currentMappingId(option.templateId)
        });
      }
      if (option.action === "replace" && option.replacementTemplateId) {
        rows.push({
          key: `modifier:${modifier.id}:${option.id}:replacement`,
          source: "modifier",
          modifier,
          option,
          part: "replacement",
          action: option.action,
          templateId: option.replacementTemplateId,
          templateName: option.replacementTemplateName || option.replacementIngredientName || option.replacementTemplateId,
          ingredientId: option.replacementIngredientId || currentMappingId(option.replacementTemplateId)
        });
      }
    });
  });
  return rows;
}

function rememberRows(rows) {
  mappingRows = new Map(rows.map((row) => [row.key, row]));
}

function renderRecipeMapping(rows) {
  byId("recipe-mapping-table").innerHTML = rows.length
    ? rows.map((row) => `
      <tr>
        <td><strong>${escapeHtml(row.product.name)}</strong><br><small>${escapeHtml(row.product.scope === "outlet" ? "Produk outlet" : "Produk perusahaan")}</small></td>
        <td><strong>${escapeHtml(row.templateName)}</strong><br><small>${escapeHtml(row.templateId)}</small></td>
        <td>${formatQty(row.qty)} ${escapeHtml(row.templateUnit || "")}</td>
        <td>${currentMappingLabel(row.templateId, row.ingredientId)}</td>
        <td>
          <select class="mapping-select" data-mapping-select="${escapeHtml(row.key)}">
            ${ingredientOptions(currentMappingId(row.templateId, row.ingredientId))}
          </select>
        </td>
        <td><button class="primary-button compact-button" data-save-mapping="${escapeHtml(row.key)}" data-permission="recipes.outletMapping:update" type="button">Simpan</button></td>
      </tr>
    `).join("")
    : `<tr><td colspan="6" class="empty-state">Belum ada template recipe yang perlu dimapping.</td></tr>`;
}

function renderModifierMapping(rows) {
  byId("modifier-mapping-table").innerHTML = rows.length
    ? rows.map((row) => `
      <tr>
        <td><strong>${escapeHtml(row.modifier.name)}</strong><br><small>${escapeHtml(row.modifier.scope === "outlet" ? "Modifier outlet" : "Modifier perusahaan")}</small></td>
        <td><strong>${escapeHtml(row.option.name)}</strong><br><small>${row.part === "replacement" ? "Bahan pengganti" : "Bahan utama"}</small></td>
        <td>${actionLabel(row.action)} ${formatQty(row.option.qty || 0)}</td>
        <td><strong>${escapeHtml(row.templateName)}</strong><br><small>${escapeHtml(row.templateId)}</small></td>
        <td>${currentMappingLabel(row.templateId, row.ingredientId)}</td>
        <td>
          <select class="mapping-select" data-mapping-select="${escapeHtml(row.key)}">
            ${ingredientOptions(currentMappingId(row.templateId, row.ingredientId))}
          </select>
        </td>
        <td><button class="primary-button compact-button" data-save-mapping="${escapeHtml(row.key)}" data-permission="modifiers.ingredientTemplate:update" type="button">Simpan</button></td>
      </tr>
    `).join("")
    : `<tr><td colspan="7" class="empty-state">Belum ada template modifier yang perlu dimapping.</td></tr>`;
}

function renderMapping() {
  const recipes = recipeRows();
  const modifiers = modifierRows();
  const allRows = [...recipes, ...modifiers];
  rememberRows(allRows);

  setText("recipe-mapping-count", recipes.length);
  setText("modifier-mapping-count", modifiers.length);
  setText("missing-mapping-count", allRows.filter((row) => !currentMappingId(row.templateId, row.ingredientId)).length);
  setText("outlet-ingredient-count", visibleIngredients().length);
  renderRecipeMapping(recipes);
  renderModifierMapping(modifiers);
  syncTabs();
  enhanceAllDataTables();
  applyPermissionControls(document, state, session);
}

function syncTabs() {
  document.querySelectorAll("[data-mapping-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mappingTab === activeTab);
  });
  document.querySelectorAll("[data-mapping-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.mappingPanel !== activeTab;
  });
}

function saveMapping(key) {
  const row = mappingRows.get(key);
  const moduleKey = row?.source === "modifier" ? "modifiers.ingredientTemplate" : "recipes.outletMapping";
  if (!canUsePermission(moduleKey, "update", state, session)) {
    setText("mapping-feedback", "Anda tidak punya akses untuk menyimpan mapping bahan outlet.");
    return;
  }
  const select = [...document.querySelectorAll("[data-mapping-select]")]
    .find((field) => field.dataset.mappingSelect === key);
  const ingredientId = select?.value || "";
  const ingredient = ingredientById(ingredientId);
  if (!row || !ingredient) {
    setText("mapping-feedback", "Pilih bahan outlet aktif terlebih dahulu.");
    return;
  }

  const response = apiPut("/api/ingredient-mapping", scopedPayload({
    ingredientId: ingredient.id,
    templateId: row.templateId,
    note: `Mapping ${row.source} ${row.templateName || row.templateId}`
  }, state, session));

  if (!response?.ok) {
    setText("mapping-feedback", response?.message || "Mapping bahan outlet belum berhasil disimpan.");
    return;
  }

  refreshSuite();
  renderMapping();
  setText("mapping-feedback", "");
  showAlert(`${ingredient.name} berhasil dihubungkan ke template ${row.templateName || row.templateId}.`);
}

document.addEventListener("click", (event) => {
  const saveButton = event.target.closest("[data-save-mapping]");
  if (saveButton) saveMapping(saveButton.dataset.saveMapping);
  const tabButton = event.target.closest("[data-mapping-tab]");
  if (tabButton) {
    activeTab = tabButton.dataset.mappingTab || "recipe";
    syncTabs();
  }
  if (event.target.closest("#refresh-mapping")) {
    refreshSuite();
    renderMapping();
    setText("mapping-feedback", "");
    showAlert("Data mapping sudah diperbarui.");
  }
});

document.querySelectorAll('a[href^="/"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = link.getAttribute("href") || "";
    if (!href.startsWith("/pages/")) return;
    event.preventDefault();
    window.location.href = appPath(href);
  });
});

refreshSuite();
renderMapping();
