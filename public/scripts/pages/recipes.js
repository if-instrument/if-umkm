import { renderLayout } from "../layout.js?v=coffee-v151";
import { apiPost, apiPut, appPath, applyPermissionControls, canAccessAllOutlets, canManageCompanyMasters, canUsePermission, loadSession, loadState, primaryOutletId, scopedPayload, stampScopedMaster, visibleForSession } from "../store.js?v=coffee-v151";
import { formatQty, money } from "../format.js";
import { byId, setText, showAlert } from "../dom.js";
import { ingredientName, missingModifierOptions, missingModifierSummary, missingRecipeLines, missingRecipeSummary, productAvailability, productCogs, productModifiers } from "../inventory.js";
import { enhanceAllDataTables } from "../datatable.js";
import { COMMON_STATUS, isInactiveStatus } from "../status-codes.js";
import { loadPageBootstrap } from "../page-engine.js?v=coffee-v151";

renderLayout();

const state = loadState();
const session = loadSession();
const requestedProductId = new URLSearchParams(window.location.search).get("product");
let modifierOptionDrafts = [];

function applyProductSuite(data) {
  if (!data) return;
  if (Array.isArray(data.categories)) state.categories = data.categories;
  if (Array.isArray(data.products)) state.products = data.products;
  if (Array.isArray(data.modifiers)) state.modifiers = data.modifiers;
  if (Array.isArray(data.ingredients)) state.ingredients = data.ingredients;
  if (Array.isArray(data.ingredientTemplates)) state.ingredientTemplates = data.ingredientTemplates;
}

function refreshProductSuite() {
  const response = loadPageBootstrap("recipes", state, session, { view: "recipes" });
  if (!response?.ok) throw new Error(response?.message || "Data recipe belum dapat dimuat.");
  applyProductSuite(response.data || {});
}

function postProductSuite(url, payload) {
  const response = apiPost(url, scopedPayload(payload, state, session));
  if (!response?.ok) throw new Error(response?.message || "Recipe belum berhasil disimpan.");
  refreshProductSuite();
  return response;
}

function putProductSuite(url, payload) {
  const response = apiPut(url, scopedPayload(payload, state, session));
  if (!response?.ok) throw new Error(response?.message || "Modifier belum berhasil disimpan.");
  refreshProductSuite();
  return response;
}

function createIngredientTemplateFromRecipe() {
  const name = byId("recipe-new-template-name").value.trim();
  const category = byId("recipe-new-template-category").value.trim();
  const unit = byId("recipe-new-template-unit").value.trim();
  if (!name || !category || !unit) {
    throw new Error("Isi nama template, kategori, dan satuan template bahan baru.");
  }
  const response = postProductSuite("/api/ingredient-template", {
    name,
    category,
    unit,
    status: COMMON_STATUS.ACTIVE
  });
  const created = response?.data || response?.template || null;
  const template = created?.id
    ? created
    : visibleTemplates().find((item) => item.name.toLowerCase() === name.toLowerCase() && item.unit.toLowerCase() === unit.toLowerCase());
  if (!template?.id) throw new Error("Template bahan baru tersimpan, tetapi belum bisa dipakai. Muat ulang halaman lalu pilih template tersebut.");
  return template;
}

function visibleProducts() {
  return state.products.filter((product) => visibleForSession(product, state, session));
}

function visibleIngredients() {
  return state.ingredients.filter((ingredient) => visibleForSession(ingredient, state, session));
}

function nextIngredientSku() {
  const existing = new Set(visibleIngredients().map((item) => item.sku).filter(Boolean));
  let index = visibleIngredients().length + 1;
  let sku = "";
  do {
    sku = `ING-${String(index).padStart(4, "0")}`;
    index += 1;
  } while (existing.has(sku));
  return sku;
}

function visibleTemplates() {
  return (state.ingredientTemplates || []).filter((template) => !isInactiveStatus(template.status));
}

function templateById(templateId) {
  return visibleTemplates().find((template) => template.id === templateId) || {};
}

function ingredientForTemplate(templateId) {
  return visibleIngredients().find((ingredient) => ingredient.templateId === templateId && !isInactiveStatus(ingredient.status));
}

function visibleModifiers() {
  return state.modifiers.filter((modifier) => visibleForSession(modifier, state, session));
}

function canEditMaster(item) {
  if (canManageCompanyMasters(session)) return true;
  return item?.scope === "outlet" && item.outletId === primaryOutletId(state, session);
}

function canEditRecipe(product) {
  return canManageCompanyMasters(session) || product?.scope === "outlet";
}

function isTemplateMappingMode(product) {
  return false;
}

refreshProductSuite();
let focusedProductId = visibleProducts().some((product) => product.id === requestedProductId) ? requestedProductId : visibleProducts()[0]?.id;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}

function generatedId(prefix, existingIds = []) {
  let id = "";
  do {
    id = `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  } while (existingIds.includes(id));
  return id;
}

function syncModifierScopeControl(modifier = null) {
  const field = byId("modifier-scope");
  if (!field) return;
  const canGlobal = canManageCompanyMasters(session);
  field.value = modifier?.scope || (canGlobal ? "company" : "outlet");
  field.disabled = !canGlobal || Boolean(modifier && !canEditMaster(modifier));
  if (!canGlobal) field.value = "outlet";
}

function emptyModifierOption() {
  return {
    id: generatedId("opt", modifierOptionDrafts.map((option) => option.id)),
    name: "",
    priceDelta: 0,
    action: "set",
    templateId: visibleTemplates()[0]?.id || "",
    newTemplateName: "",
    newTemplateCategory: "Raw Material",
    newTemplateUnit: "gram",
    ingredientId: "",
    replacementTemplateId: "",
    replacementNewTemplateName: "",
    replacementNewTemplateCategory: "Raw Material",
    replacementNewTemplateUnit: "gram",
    replacementIngredientId: "",
    qty: ""
  };
}

function normalizedModifierAction(action) {
  return action === "replace" ? "replace" : "set";
}

function createIngredientTemplateFromModifierOption(prefix, config) {
  const name = config.querySelector(`[data-option-${prefix}-new-template-name]`)?.value.trim() || "";
  const category = config.querySelector(`[data-option-${prefix}-new-template-category]`)?.value.trim() || "";
  const unit = config.querySelector(`[data-option-${prefix}-new-template-unit]`)?.value.trim() || "";
  if (!name || !category || !unit) {
    throw new Error("Isi nama template, kategori, dan satuan untuk template bahan baru di modifier.");
  }
  const response = postProductSuite("/api/ingredient-template", { name, category, unit, status: COMMON_STATUS.ACTIVE });
  const created = response?.data || response?.template || null;
  const template = created?.id
    ? created
    : visibleTemplates().find((item) => item.name.toLowerCase() === name.toLowerCase() && item.unit.toLowerCase() === unit.toLowerCase());
  if (!template?.id) throw new Error("Template bahan baru tersimpan, tetapi belum bisa dipakai. Muat ulang halaman lalu pilih template tersebut.");
  return template.id;
}

function openModal(line = null) {
  const product = state.products.find((item) => item.id === focusedProductId);
  const mappingOnly = isTemplateMappingMode(product);
  byId("recipe-form").reset();
  byId("recipe-original-template").value = line?.templateId || "";
  byId("recipe-modal-title").textContent = mappingOnly ? "Hubungkan Template ke Bahan Outlet" : (line ? "Edit Bahan Recipe" : "Tambah Bahan Recipe");
  byId("recipe-submit-button").textContent = mappingOnly ? "Simpan Mapping Outlet" : (line ? "Simpan Perubahan" : "Simpan ke Recipe");
  byId("recipe-submit-button").dataset.permission = `recipes.template:${line ? "update" : "create"}`;
  byId("recipe-product").value = focusedProductId;
  const selectedTemplateId = line?.templateId || visibleTemplates()[0]?.id || "__new_template";
  byId("recipe-template").value = selectedTemplateId;
  byId("recipe-template").disabled = mappingOnly;
  byId("recipe-template").required = !mappingOnly;
  byId("recipe-template-field").hidden = mappingOnly;
  byId("recipe-qty").value = line?.qty || "";
  byId("recipe-qty").disabled = mappingOnly;
  byId("recipe-qty").required = !mappingOnly;
  byId("recipe-product").disabled = Boolean(line) || mappingOnly;
  toggleNewTemplateFields();
  updatePreview();
  document.querySelector("[data-modal-backdrop]").hidden = false;
  byId("recipe-modal").hidden = false;
  document.body.classList.add("modal-open");
  applyPermissionControls(document, state, session);
  setTimeout(() => byId("recipe-product").focus(), 80);
}

function closeModal() {
  document.querySelector("[data-modal-backdrop]").hidden = true;
  document.querySelectorAll(".modal-dialog").forEach((modal) => { modal.hidden = true; });
  document.body.classList.remove("modal-open");
}

function renderOptions() {
  const products = visibleProducts();
  byId("recipe-product").innerHTML = products.map((item) => `<option value="${item.id}">${item.name}</option>`).join("");
  byId("recipe-focus-product").innerHTML = products.map((item) => `<option value="${item.id}">${item.name}</option>`).join("");
  byId("recipe-focus-product").value = focusedProductId;
  byId("recipe-product").value = focusedProductId;
  byId("recipe-template").innerHTML = visibleTemplates()
    .map((item) => `<option value="${item.id}">${item.name} · ${item.category} (${item.unit})</option>`)
    .join("") + `<option value="__new_template">+ Buat template bahan baru</option>`;
  if (visibleTemplates().length) byId("recipe-template").value = visibleTemplates()[0].id;
  else byId("recipe-template").value = "__new_template";
  byId("recipe-new-template-category").value = byId("recipe-new-template-category").value || "Raw Material";
  byId("recipe-new-template-unit").value = byId("recipe-new-template-unit").value || "gram";
}

function createOutletIngredientButton(templateId) {
  if (!templateId || ingredientForTemplate(templateId)) return "";
  return `<button class="ghost-button compact-button" data-create-outlet-ingredient="${templateId}" data-permission="inventory.ingredients:create" type="button">Buat Bahan Outlet</button>`;
}

function materialCategoryOptions(selected = "Raw Material") {
  const categories = ["Raw Material", "Packaging", "Consumable"];
  if (selected && !categories.includes(selected)) categories.push(selected);
  return categories.map((category) => `<option value="${escapeHtml(category)}" ${category === selected ? "selected" : ""}>${escapeHtml(category)}</option>`).join("");
}

function modifierMaterialFormMarkup(prefix, title) {
  return "";
}

function captureModifierOptionDrafts() {
  const configs = [...byId("modifier-option-editor").querySelectorAll("[data-option-config]")];
  if (!configs.length) return modifierOptionDrafts;
  modifierOptionDrafts = configs.map((config) => {
    const action = normalizedModifierAction(config.querySelector("[data-option-action]").value);
    return {
      id: config.dataset.optionId,
      name: config.querySelector("[data-option-name]").value,
      priceDelta: Number(config.querySelector("[data-option-price]").value) || 0,
      action,
      templateId: config.querySelector("[data-option-template]").value,
      newTemplateName: config.querySelector("[data-option-base-new-template-name]")?.value || "",
      newTemplateCategory: config.querySelector("[data-option-base-new-template-category]")?.value || "Raw Material",
      newTemplateUnit: config.querySelector("[data-option-base-new-template-unit]")?.value || "gram",
      ingredientId: config.querySelector("[data-option-ingredient]").value,
      replacementTemplateId: action === "replace" ? config.querySelector("[data-option-replacement-template]").value : "",
      replacementNewTemplateName: action === "replace" ? (config.querySelector("[data-option-replacement-new-template-name]")?.value || "") : "",
      replacementNewTemplateCategory: action === "replace" ? (config.querySelector("[data-option-replacement-new-template-category]")?.value || "Raw Material") : "Raw Material",
      replacementNewTemplateUnit: action === "replace" ? (config.querySelector("[data-option-replacement-new-template-unit]")?.value || "gram") : "gram",
      replacementIngredientId: action === "replace" ? config.querySelector("[data-option-replacement]").value : "",
      qty: config.querySelector("[data-option-qty]").value
    };
  });
  return modifierOptionDrafts;
}

function renderModifierOptions(options = modifierOptionDrafts) {
  const availableIngredients = visibleIngredients();
  const availableTemplates = visibleTemplates();
  const ingredientOptions = availableIngredients.map((item) => `<option value="${item.id}">${item.name} (${item.unit})</option>`).join("");
  const optionalIngredientOptions = `<option value="">Belum dimapping di outlet</option>${ingredientOptions}`;
  const templateOptions = availableTemplates.map((item) => `<option value="${item.id}">${item.name} · ${item.category} (${item.unit})</option>`).join("");
  const optionalTemplateOptions = `<option value="">Pilih template</option>${templateOptions}<option value="__new_template">+ Buat template bahan baru</option>`;
  const drafts = options.length ? options : [emptyModifierOption()];
  modifierOptionDrafts = drafts;
  byId("modifier-option-editor").innerHTML = drafts.map((option, index) => `
    <fieldset class="modifier-option-config" data-option-config="${index}" data-option-id="${option.id}" data-skip-material-prompt="${option.skipMaterialPrompt ? "true" : "false"}" data-skip-replacement-material-prompt="${option.skipReplacementMaterialPrompt ? "true" : "false"}">
      <legend>Opsi ${index + 1}</legend>
      <button class="icon-button modifier-option-remove" data-remove-option="${index}" ${drafts.length === 1 ? "disabled" : ""} type="button" aria-label="Hapus opsi">x</button>
      <label class="modifier-option-field option-name">Nama Opsi
        <input data-option-name placeholder="Contoh: Es sedikit, Extra ice, Susu oat" required type="text" value="${escapeHtml(option.name || "")}" />
      </label>
      <label class="modifier-option-field">Harga Tambahan
        <input data-option-price min="0" placeholder="0" step="1" type="number" value="${option.priceDelta || 0}" />
      </label>
      <label class="modifier-option-field">Perlakuan Bahan
        <select data-option-action>
          <option value="set" ${normalizedModifierAction(option.action) === "set" ? "selected" : ""}>Tambah/Kurang bahan</option>
          <option value="replace" ${normalizedModifierAction(option.action) === "replace" ? "selected" : ""}>Ganti bahan dasar</option>
        </select>
      </label>
      <label class="modifier-option-field">Template Bahan yang Diubah
        <select data-option-template>${optionalTemplateOptions}</select>
      </label>
      <div class="modifier-option-new-template compact-subform" data-option-base-new-template hidden>
        <label>Nama Template Baru
          <input data-option-base-new-template-name placeholder="Contoh: Oat Milk" type="text" value="${escapeHtml(option.newTemplateName || "")}" />
        </label>
        <label>Kategori
          <input data-option-base-new-template-category placeholder="Raw Material" type="text" value="${escapeHtml(option.newTemplateCategory || "Raw Material")}" />
        </label>
        <label>Satuan
          <input data-option-base-new-template-unit placeholder="gram, ml, pcs" type="text" value="${escapeHtml(option.newTemplateUnit || "gram")}" />
        </label>
        <button class="primary-button compact-button" data-save-modifier-template="base" data-permission="ingredients.template:create" type="button">Simpan & Gunakan</button>
      </div>
      <select data-option-ingredient hidden>${optionalIngredientOptions}</select>
      <label class="modifier-option-field replace-field">Template Bahan Pengganti
        <select data-option-replacement-template>${optionalTemplateOptions}</select>
      </label>
      <div class="modifier-option-new-template compact-subform replace-field" data-option-replacement-new-template hidden>
        <label>Nama Template Pengganti Baru
          <input data-option-replacement-new-template-name placeholder="Contoh: Almond Milk" type="text" value="${escapeHtml(option.replacementNewTemplateName || "")}" />
        </label>
        <label>Kategori
          <input data-option-replacement-new-template-category placeholder="Raw Material" type="text" value="${escapeHtml(option.replacementNewTemplateCategory || "Raw Material")}" />
        </label>
        <label>Satuan
          <input data-option-replacement-new-template-unit placeholder="gram, ml, pcs" type="text" value="${escapeHtml(option.replacementNewTemplateUnit || "gram")}" />
        </label>
        <button class="primary-button compact-button" data-save-modifier-template="replacement" data-permission="ingredients.template:create" type="button">Simpan & Gunakan</button>
      </div>
      <select data-option-replacement hidden>${optionalIngredientOptions}</select>
      <label class="modifier-option-field qty-field">Qty
        <input data-option-qty min="0" placeholder="0" step="0.01" type="number" value="${option.qty ?? ""}" />
      </label>
    </fieldset>
  `).join("");
  byId("modifier-option-editor").querySelectorAll("[data-option-config]").forEach((config, index) => {
    const draft = drafts[index];
    const templateId = draft.templateId || availableIngredients.find((item) => item.id === draft.ingredientId)?.templateId || "";
    const replacementTemplateId = draft.replacementTemplateId || availableIngredients.find((item) => item.id === draft.replacementIngredientId)?.templateId || "";
    config.querySelector("[data-option-template]").value = templateId;
    config.querySelector("[data-option-replacement-template]").value = replacementTemplateId;
    config.querySelector("[data-option-ingredient]").value = templateId === "__new_template" ? "" : (draft.ingredientId || ingredientForTemplate(templateId)?.id || "");
    config.querySelector("[data-option-replacement]").value = replacementTemplateId === "__new_template" ? "" : (draft.replacementIngredientId || ingredientForTemplate(replacementTemplateId)?.id || "");
  });
  syncModifierActionFields();
  syncModifierMaterialForms();
}

function resolveModifierTemplateValue(config, selectSelector, prefix, allowCreate) {
  const value = config.querySelector(selectSelector).value;
  if (value !== "__new_template") return value;
  return allowCreate ? createIngredientTemplateFromModifierOption(prefix, config) : value;
}

function readModifierOptionPayloads(requireFirst, allowCreateTemplates = false) {
  return [...byId("modifier-option-editor").querySelectorAll("[data-option-config]")].map((config) => {
    const id = config.dataset.optionId || generatedId("opt", modifierOptionDrafts.map((option) => option.id));
    const name = config.querySelector("[data-option-name]").value.trim();
    const qty = Number(config.querySelector("[data-option-qty]").value) || 0;
    const action = normalizedModifierAction(config.querySelector("[data-option-action]").value);
    const templateId = resolveModifierTemplateValue(config, "[data-option-template]", "base", allowCreateTemplates);
    const replacementTemplateId = action === "replace"
      ? resolveModifierTemplateValue(config, "[data-option-replacement-template]", "replacement", allowCreateTemplates)
      : "";
    if (!id && !name && !qty) return null;
    if (requireFirst && (!name || config.querySelector("[data-option-qty]").value === "" || qty < 0 || !templateId || (action === "replace" && !replacementTemplateId))) return null;
    if (!requireFirst && (config.querySelector("[data-option-qty]").value === "" || qty < 0)) return null;
    return {
      id,
      name,
      priceDelta: Number(config.querySelector("[data-option-price]").value) || 0,
      action,
      templateId,
      ingredientId: config.querySelector("[data-option-ingredient]").value,
      replacementTemplateId,
      replacementIngredientId: action === "replace" ? config.querySelector("[data-option-replacement]").value : "",
      qty
    };
  }).filter(Boolean);
}

function updateModifierPreview() {
  const filledOptions = readModifierOptionPayloads(false);
  const text = filledOptions.length
    ? filledOptions.map((option) => {
      const action = normalizedModifierAction(option.action) === "replace" ? "ganti" : "tambah/kurang";
      const templateName = option.templateId === "__new_template"
        ? "Template baru"
        : visibleTemplates().find((item) => item.id === option.templateId)?.name || "Template belum dipilih";
      const ingredientLabel = option.ingredientId ? ingredientName(state, option.ingredientId) : `Perlu mapping bahan (${templateName})`;
      const replacementTemplateName = option.replacementTemplateId === "__new_template"
        ? "Template pengganti baru"
        : visibleTemplates().find((item) => item.id === option.replacementTemplateId)?.name || "Template pengganti belum dipilih";
      const replacementLabel = option.replacementIngredientId ? ingredientName(state, option.replacementIngredientId) : `Perlu mapping bahan (${replacementTemplateName})`;
      const target = normalizedModifierAction(option.action) === "replace" ? `${ingredientLabel} ke ${replacementLabel}` : ingredientLabel;
      return `${option.name}: ${action} ${formatQty(option.qty || 0)} ${target} (${money(option.priceDelta || 0)})`;
    }).join(" · ")
    : "Isi minimal opsi pertama. Setiap opsi bisa menambah, mengurangi, atau mengganti bahan.";
  setText("modifier-preview", text);
}

function syncModifierActionFields() {
  byId("modifier-option-editor").querySelectorAll("[data-option-config]").forEach((config) => {
    const isReplace = normalizedModifierAction(config.querySelector("[data-option-action]").value) === "replace";
    config.querySelectorAll(".replace-field").forEach((field) => { field.hidden = !isReplace; });
    syncModifierNewTemplateFields(config, "[data-option-template]", "[data-option-base-new-template]", "base", true);
    syncModifierNewTemplateFields(config, "[data-option-replacement-template]", "[data-option-replacement-new-template]", "replacement", isReplace);
    syncModifierMaterialForm(config, "base", true && config.dataset.skipMaterialPrompt !== "true");
    syncModifierMaterialForm(config, "replacement", isReplace && config.dataset.skipReplacementMaterialPrompt !== "true");
  });
}

function syncModifierTemplateIngredient(config, templateSelector, ingredientSelector) {
  const templateId = config.querySelector(templateSelector).value;
  if (templateId === "__new_template") {
    config.querySelector(ingredientSelector).value = "";
    return;
  }
  const ingredient = ingredientForTemplate(templateId);
  if (ingredient) config.querySelector(ingredientSelector).value = ingredient.id;
  syncModifierMaterialForms();
}

function syncModifierNewTemplateFields(config, selectSelector, wrapperSelector, prefix, active = true) {
  const wrapper = config.querySelector(wrapperSelector);
  if (!wrapper) return;
  const isNewTemplate = active && config.querySelector(selectSelector).value === "__new_template";
  wrapper.hidden = !isNewTemplate;
  wrapper.querySelectorAll("input").forEach((input) => {
    input.required = isNewTemplate;
    input.disabled = !isNewTemplate;
  });
  if (isNewTemplate && prefix === "base") config.querySelector("[data-option-ingredient]").value = "";
  if (isNewTemplate && prefix === "replacement") config.querySelector("[data-option-replacement]").value = "";
}

function syncModifierMaterialForm(config, prefix, active = true) {
  const wrapper = config.querySelector(`[data-option-${prefix}-material]`);
  if (!wrapper) return;
  const templateSelector = prefix === "base" ? "[data-option-template]" : "[data-option-replacement-template]";
  const templateId = config.querySelector(templateSelector)?.value || "";
  const template = templateById(templateId);
  const shouldShow = active && Boolean(template?.id) && !ingredientForTemplate(template.id) && canUsePermission("inventory.ingredients", "create", state, session);
  wrapper.hidden = !shouldShow;
  wrapper.querySelectorAll("input, select, button").forEach((field) => { field.disabled = !shouldShow; });
  if (!shouldShow) return;
  const previousTemplate = wrapper.dataset.materialTemplate || "";
  if (previousTemplate !== template.id) {
    wrapper.dataset.materialTemplate = template.id;
    wrapper.querySelector(`[data-option-${prefix}-material-sku]`).value = nextIngredientSku();
    wrapper.querySelector(`[data-option-${prefix}-material-name]`).value = template.name || "";
    wrapper.querySelector(`[data-option-${prefix}-material-category]`).innerHTML = materialCategoryOptions(template.category || "Raw Material");
    wrapper.querySelector(`[data-option-${prefix}-material-unit]`).value = template.unit || "satuan";
    wrapper.querySelector(`[data-option-${prefix}-material-stock]`).value = "0";
    wrapper.querySelector(`[data-option-${prefix}-material-cost]`).value = "0";
    wrapper.querySelector(`[data-option-${prefix}-material-standard]`).value = "0";
    wrapper.querySelector(`[data-option-${prefix}-material-min]`).value = "0";
  }
}

function syncModifierMaterialForms() {
  byId("modifier-option-editor").querySelectorAll("[data-option-config]").forEach((config) => {
    const isReplace = normalizedModifierAction(config.querySelector("[data-option-action]").value) === "replace";
    syncModifierMaterialForm(config, "base", true && config.dataset.skipMaterialPrompt !== "true");
    syncModifierMaterialForm(config, "replacement", isReplace && config.dataset.skipReplacementMaterialPrompt !== "true");
  });
}

function syncModifierMaterialStandardCostFromField(field) {
  const wrapper = field.closest?.(".modifier-material-form");
  if (!wrapper) return;
  const prefix = wrapper.querySelector("[data-option-base-material-stock]") ? "base" : "replacement";
  if (!field.matches(`[data-option-${prefix}-material-stock], [data-option-${prefix}-material-cost]`)) return;
  const stock = Number(wrapper.querySelector(`[data-option-${prefix}-material-stock]`).value) || 0;
  const totalCost = Number(wrapper.querySelector(`[data-option-${prefix}-material-cost]`).value) || 0;
  if (stock > 0 && totalCost > 0) wrapper.querySelector(`[data-option-${prefix}-material-standard]`).value = (totalCost / stock).toFixed(2);
}

function saveModifierTemplateAndUse(config, prefix) {
  const templateSelector = prefix === "base" ? "[data-option-template]" : "[data-option-replacement-template]";
  const drafts = captureModifierOptionDrafts();
  const index = Number(config.dataset.optionConfig);
  try {
    const templateId = createIngredientTemplateFromModifierOption(prefix, config);
    if (drafts[index]) {
      if (prefix === "base") {
        drafts[index].templateId = templateId;
        drafts[index].ingredientId = "";
        drafts[index].skipMaterialPrompt = true;
        drafts[index].newTemplateName = "";
        drafts[index].newTemplateCategory = "Raw Material";
        drafts[index].newTemplateUnit = "gram";
      } else {
        drafts[index].replacementTemplateId = templateId;
        drafts[index].replacementIngredientId = "";
        drafts[index].skipReplacementMaterialPrompt = true;
        drafts[index].replacementNewTemplateName = "";
        drafts[index].replacementNewTemplateCategory = "Raw Material";
        drafts[index].replacementNewTemplateUnit = "gram";
      }
    }
    renderModifierOptions(drafts);
    const updatedConfig = byId("modifier-option-editor").querySelector(`[data-option-config="${index}"]`);
    if (updatedConfig) {
      updatedConfig.querySelector(templateSelector).value = templateId;
      const materialWrapper = updatedConfig.querySelector(`[data-option-${prefix}-material]`);
      if (materialWrapper) materialWrapper.hidden = true;
    }
    updateModifierPreview();
    showAlert("Template bahan tersimpan dan langsung dipilih di opsi modifier. Bahan outlet bisa dibuat nanti.");
  } catch (error) {
    setText("modifier-preview", error.message);
  }
}

function saveModifierMaterialAndUse(config, prefix) {
  if (!canUsePermission("inventory.ingredients", "create", state, session)) {
    setText("modifier-preview", "Anda tidak punya akses untuk membuat bahan outlet.");
    return;
  }
  const templateSelector = prefix === "base" ? "[data-option-template]" : "[data-option-replacement-template]";
  const templateId = config.querySelector(templateSelector)?.value || "";
  const template = templateById(templateId);
  const wrapper = config.querySelector(`[data-option-${prefix}-material]`);
  if (!template?.id || !wrapper) {
    setText("modifier-preview", "Pilih template bahan terlebih dahulu sebelum membuat bahan outlet.");
    return;
  }
  const name = wrapper.querySelector(`[data-option-${prefix}-material-name]`).value.trim();
  const unit = wrapper.querySelector(`[data-option-${prefix}-material-unit]`).value.trim();
  const stock = Number(wrapper.querySelector(`[data-option-${prefix}-material-stock]`).value) || 0;
  const totalCost = Number(wrapper.querySelector(`[data-option-${prefix}-material-cost]`).value) || 0;
  const fallbackCost = stock > 0 && totalCost > 0 ? totalCost / stock : 0;
  if (!name || !unit) {
    setText("modifier-preview", "Isi nama bahan outlet dan satuan terlebih dahulu.");
    return;
  }
  const drafts = captureModifierOptionDrafts();
  try {
    postProductSuite("/api/ingredient", {
      templateId,
      sku: wrapper.querySelector(`[data-option-${prefix}-material-sku]`).value.trim(),
      name,
      category: wrapper.querySelector(`[data-option-${prefix}-material-category]`).value,
      unit,
      stock,
      totalCost,
      standardCost: Number(wrapper.querySelector(`[data-option-${prefix}-material-standard]`).value) || fallbackCost,
      minStock: Number(wrapper.querySelector(`[data-option-${prefix}-material-min]`).value) || 0,
      status: COMMON_STATUS.ACTIVE
    });
    const ingredient = ingredientForTemplate(templateId);
    drafts.forEach((draft) => {
      if (draft.templateId === templateId) draft.ingredientId = ingredient?.id || "";
      if (draft.replacementTemplateId === templateId) draft.replacementIngredientId = ingredient?.id || "";
    });
    renderModifierOptions(drafts);
    renderRecipeList();
    updateModifierPreview();
    showAlert(`${name} tersimpan dan langsung digunakan untuk template ${template.name}.`);
  } catch (error) {
    setText("modifier-preview", error.message);
  }
}

function openModifierModal(modifier = null) {
  byId("modifier-form").reset();
  byId("modifier-id").value = modifier?.id || "";
  byId("modifier-name").value = modifier?.name || "";
  syncModifierScopeControl(modifier);
  byId("modifier-choice-type").value = modifier?.choiceType || (modifier?.requiredSelection ? "single" : "multiple");
  byId("modifier-status").value = modifier?.status || COMMON_STATUS.ACTIVE;
  byId("modifier-required-selection").checked = Boolean(modifier?.requiredSelection);
  renderModifierOptions(modifier?.options?.length ? modifier.options.map((option) => ({ ...option })) : [emptyModifierOption()]);
  byId("modifier-modal-title").textContent = modifier ? "Edit Modifier" : "Tambah Modifier";
  updateModifierPreview();
  document.querySelector("[data-modal-backdrop]").hidden = false;
  byId("modifier-modal").hidden = false;
  document.body.classList.add("modal-open");
  applyPermissionControls(document, state, session);
}

function ensureIngredientCategoryOption(category) {
  const field = byId("outlet-ingredient-category");
  if (!category || [...field.options].some((option) => option.value === category)) return;
  field.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`);
}

function updateOutletIngredientPreview() {
  const stock = Number(byId("outlet-ingredient-stock").value) || 0;
  const totalCost = Number(byId("outlet-ingredient-cost").value) || 0;
  const unit = byId("outlet-ingredient-unit").value || "satuan";
  const avgCost = stock > 0 ? totalCost / stock : 0;
  setText("outlet-ingredient-preview", stock > 0
    ? `Average cost awal ${money(avgCost)} / ${unit}. Bahan outlet ini langsung terhubung ke template recipe setelah disimpan.`
    : "Boleh dibuat dengan stok 0 untuk mapping awal. Stok bisa diisi nanti lewat Stok Bahan.");
}

function syncOutletIngredientStandardCost() {
  const stock = Number(byId("outlet-ingredient-stock").value) || 0;
  const totalCost = Number(byId("outlet-ingredient-cost").value) || 0;
  if (stock > 0 && totalCost > 0) byId("outlet-ingredient-standard-cost").value = (totalCost / stock).toFixed(2);
  updateOutletIngredientPreview();
}

function openOutletIngredientModal(templateId) {
  const template = templateById(templateId);
  if (!template?.id || ingredientForTemplate(template.id)) return;
  byId("outlet-ingredient-form").reset();
  byId("outlet-ingredient-template").value = template.id;
  byId("outlet-ingredient-template-name").value = `${template.name} · ${template.category} (${template.unit})`;
  byId("outlet-ingredient-sku").value = nextIngredientSku();
  byId("outlet-ingredient-name").value = template.name;
  ensureIngredientCategoryOption(template.category || "Raw Material");
  byId("outlet-ingredient-category").value = template.category || "Raw Material";
  byId("outlet-ingredient-unit").value = template.unit || "satuan";
  byId("outlet-ingredient-stock").value = "0";
  byId("outlet-ingredient-cost").value = "0";
  byId("outlet-ingredient-standard-cost").value = "0";
  byId("outlet-ingredient-min").value = "0";
  setText("outlet-ingredient-feedback", "");
  updateOutletIngredientPreview();
  document.querySelector("[data-modal-backdrop]").hidden = false;
  byId("outlet-ingredient-modal").hidden = false;
  document.body.classList.add("modal-open");
  applyPermissionControls(document, state, session);
  setTimeout(() => byId("outlet-ingredient-name").focus(), 80);
}

function modifierDescription(modifier) {
  return (modifier.options || []).map((option) => {
    const mappedIngredient = option.templateId ? ingredientForTemplate(option.templateId) : null;
    const mappedReplacement = option.replacementTemplateId ? ingredientForTemplate(option.replacementTemplateId) : null;
    const ingredient = mappedIngredient
      ? ingredientName(state, mappedIngredient.id)
      : (option.templateName || option.ingredientName || templateById(option.templateId).name || "Bahan outlet belum tersedia");
    const baseAction = createOutletIngredientButton(option.templateId);
    if (normalizedModifierAction(option.action) === "set") return `${escapeHtml(option.name)}: atur ${escapeHtml(ingredient)} menjadi ${formatQty(option.qty)} ${baseAction}`;
    const replacement = mappedReplacement
      ? ingredientName(state, mappedReplacement.id)
      : (option.replacementTemplateName || option.replacementIngredientName || templateById(option.replacementTemplateId).name || "Bahan pengganti belum tersedia");
    const replacementAction = createOutletIngredientButton(option.replacementTemplateId);
    return `${escapeHtml(option.name)}: ganti ${escapeHtml(ingredient)} ${baseAction} dengan ${escapeHtml(replacement)} ${replacementAction} (${formatQty(option.qty)})`;
  }).join("<br>");
}

function modifierOptionSummary(modifier) {
  return (modifier.options || []).slice(0, 4).map((option) => {
    const ingredientExists = state.ingredients.some((item) => item.id === option.ingredientId && !isInactiveStatus(item.status));
    const replacementExists = state.ingredients.some((item) => item.id === option.replacementIngredientId && !isInactiveStatus(item.status));
    const ingredient = !ingredientExists
      ? (option.templateName || option.ingredientName || "Bahan outlet belum tersedia")
      : ingredientName(state, option.ingredientId);
    const action = normalizedModifierAction(option.action) === "replace" ? "Ganti bahan" : "Tambah/Kurang bahan";
    const replacement = !replacementExists
      ? (option.replacementTemplateName || option.replacementIngredientName || "Bahan pengganti belum tersedia")
      : ingredientName(state, option.replacementIngredientId);
    const target = normalizedModifierAction(option.action) === "replace" ? `${ingredient} ke ${replacement}` : ingredient;
    return `<li>${escapeHtml(option.name)}: ${action} ${formatQty(option.qty)} ${escapeHtml(target)}${option.priceDelta ? ` · ${money(option.priceDelta)}` : ""}</li>`;
  }).join("");
}

function renderModifiers() {
  const product = state.products.find((item) => item.id === focusedProductId);
  const modifiers = product ? productModifiers(state, product) : [];
  const masterModifiers = visibleModifiers();
  byId("product-modifier-list").innerHTML = masterModifiers.length
    ? masterModifiers.map((modifier) => `
      <label class="modifier-checkbox-card">
        <input ${product?.modifierIds?.includes(modifier.id) ? "checked" : ""} data-product-modifier-id="${modifier.id}" type="checkbox" />
        <span>
          <strong>${escapeHtml(modifier.name)}</strong>
          <small>${isInactiveStatus(modifier.status) ? "Nonaktif" : `${(modifier.options || []).length} opsi tersedia · ${modifier.choiceType === "single" ? "Radio" : "Checkbox"} · ${modifier.requiredSelection ? "Wajib" : "Opsional"}`}</small>
          <ul>${modifierOptionSummary(modifier)}</ul>
        </span>
      </label>
    `).join("")
    : `<div class="empty-state">Belum ada modifier master. Tambahkan master modifier dulu.</div>`;
  byId("modifier-table").innerHTML = modifiers.length
    ? modifiers.map((modifier) => {
      const missingOptions = missingModifierOptions(state, modifier);
      return `
      <tr>
        <td><strong>${escapeHtml(modifier.name)}</strong><br><span class="muted-text">${modifier.choiceType === "single" ? "Radio" : "Checkbox"} · ${modifier.requiredSelection ? "Wajib" : "Opsional"}</span>${missingOptions.length ? `<br><small class="muted-text">Mapping bahan: ${escapeHtml(missingModifierSummary(state, modifier))}</small>` : ""}</td>
        <td>${(modifier.options || []).map((option) => `${escapeHtml(option.name)}: ${money(option.priceDelta || 0)}`).join("<br>")}</td>
        <td>${modifierDescription(modifier)}</td>
        <td><button class="ghost-button compact-button" ${canEditMaster(modifier) ? "" : "disabled title=\"Selected Outlet hanya bisa edit modifier outlet yang dipilih\""} data-edit-modifier="${modifier.id}" data-permission="modifiers.master:update" type="button">Edit Master</button></td>
      </tr>
    `;
    }).join("")
    : `<tr><td colspan="4" class="empty-state">Belum ada modifier untuk produk ini. Pilih modifier dari daftar master.</td></tr>`;
  enhanceAllDataTables(byId("modifier-table").closest(".workspace-panel"));
  applyPermissionControls(document, state, session);
}

function renderRecipeList() {
  const product = visibleProducts().find((item) => item.id === focusedProductId) || visibleProducts()[0];
  if (!product) return;
  const mappingOnly = isTemplateMappingMode(product);
  const cogs = productCogs(state, product);
  const missingRecipe = missingRecipeLines(state, product);
  const profit = product.price - cogs;
  const margin = product.price ? (profit / product.price) * 100 : 0;
  const rows = product.recipe.length
    ? product.recipe
        .map((line) => {
          const ingredient = (line.templateId ? ingredientForTemplate(line.templateId) : null) || state.ingredients.find((item) => item.id === line.ingredientId);
          const unitCost = ingredient?.avgCost || 0;
          const rowKey = line.templateId || line.ingredientId;
          const ingredientReady = Boolean(ingredient && !isInactiveStatus(ingredient.status));
          const name = ingredientReady ? ingredientName(state, ingredient.id) : (line.templateName || line.ingredientName || "Bahan belum tersedia di outlet");
          const editAction = canEditRecipe(product)
            ? `<button class="ghost-button compact-button" data-edit-recipe-ingredient="${rowKey}" data-permission="recipes.template:update" type="button">Edit</button>`
            : `<a class="ghost-button compact-button button-link" href="${appPath("/pages/ingredient-mapping.html")}">Atur Mapping</a>`;
          const action = `<div class="row-actions">${!ingredientReady ? createOutletIngredientButton(line.templateId) : ""}${editAction}</div>`;
          return `<tr><td><strong>${name}</strong>${!ingredientReady ? `<br><small class="status-pill status-low">Belum dimapping di outlet</small>` : ""}${line.templateName ? `<br><small>Template: ${line.templateName}</small>` : ""}</td><td>${ingredient?.unit || line.unit || ""}</td><td>${formatQty(line.qty)}</td><td>${money(unitCost)} / ${ingredient?.unit || line.unit || ""}</td><td>${money(unitCost * line.qty)}</td><td>${action}</td></tr>`;
        })
        .join("")
    : `<tr><td colspan="6" class="empty-state">Belum ada recipe untuk produk ini.</td></tr>`;

  byId("recipe-detail").innerHTML = `
    <section class="recipe-detail-layout">
      <article class="workspace-panel recipe-product-summary">
        <div class="recipe-hero-visual"><span></span></div>
        <h3>${product.name}</h3>
        <span class="status-pill status-ok">Aktif</span>
        <dl>
          <div><dt>Kategori</dt><dd>${product.category}</dd></div>
          <div><dt>Harga Jual</dt><dd>${money(product.price)}</dd></div>
          <div><dt>Total HPP</dt><dd>${money(cogs)}</dd></div>
          <div><dt>Kapasitas</dt><dd>${productAvailability(state, product)} unit</dd></div>
        </dl>
      </article>
      <article class="workspace-panel">
        <div class="panel-heading"><h3>Template Bahan Recipe</h3><p>Susun kebutuhan bahan standar produk di sini. Mapping bahan outlet dikerjakan di menu Produk & Recipe.</p></div>
        ${missingRecipe.length ? `<div class="form-preview full-row">Pengingat outlet: ${missingRecipeSummary(state, product)} belum dimapping. Buka Produk & Recipe > Mapping Bahan agar kapasitas dan HPP akurat.</div>` : ""}
        <div class="table-wrap"><table><thead><tr><th>Bahan</th><th>Satuan</th><th>Qty Digunakan</th><th>Harga Satuan</th><th>Total Cost</th><th>Aksi</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="recipe-cost-summary">
          <div><span>Total HPP</span><strong>${money(cogs)}</strong></div>
          <div><span>Harga Jual</span><strong>${money(product.price)}</strong></div>
          <div class="margin"><span>Margin</span><strong>${money(profit)} (${margin.toFixed(1)}%)</strong></div>
        </div>
      </article>
    </section>
  `;
  enhanceAllDataTables(byId("recipe-detail"));
  applyPermissionControls(document, state, session);
  const addButton = document.querySelector("[data-open-recipe-modal]");
  if (addButton) {
    addButton.hidden = !canEditRecipe(product) || !canUsePermission("recipes.template", "create", state, session);
  }
  renderModifiers();
}

function updatePreview() {
  const product = state.products.find((item) => item.id === byId("recipe-product").value);
  const mappingOnly = isTemplateMappingMode(product);
  const template = visibleTemplates().find((item) => item.id === byId("recipe-template").value);
  const isNewTemplate = byId("recipe-template").value === "__new_template";
  const qty = Number(byId("recipe-qty").value);
  if (isNewTemplate) {
    const name = byId("recipe-new-template-name").value.trim();
    const unit = byId("recipe-new-template-unit").value.trim() || "satuan";
    setText("recipe-preview", name
      ? `Template bahan ${name} akan dibuat sebagai standar perusahaan, lalu dipakai ${formatQty(qty || 0)} ${unit} per porsi. Stok outlet belum berubah.`
      : "Isi template bahan baru. Template ini hanya standar recipe, bukan stok outlet.");
    return;
  }
  if (template && qty > 0) {
    const mappedIngredient = ingredientForTemplate(template.id);
    const costText = mappedIngredient ? ` Estimasi biaya outlet aktif: ${money(mappedIngredient.avgCost * qty)} per porsi.` : " Bahan outlet belum terhubung, HPP akan lengkap setelah outlet melakukan mapping.";
    setText("recipe-preview", `Template ${template.name} disimpan sebagai kebutuhan recipe perusahaan.${costText}`);
  } else {
    setText("recipe-preview", "Pilih produk dan template bahan, lalu isi jumlah per porsi.");
  }
}

function toggleNewTemplateFields() {
  const product = state.products.find((item) => item.id === byId("recipe-product").value);
  const isNewTemplate = !isTemplateMappingMode(product) && byId("recipe-template").value === "__new_template";
  const fields = byId("recipe-new-template-fields");
  if (!fields) return;
  fields.hidden = !isNewTemplate;
  ["recipe-new-template-name", "recipe-new-template-category", "recipe-new-template-unit"].forEach((id) => {
    byId(id).required = isNewTemplate;
    byId(id).disabled = !isNewTemplate;
  });
}

byId("recipe-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const product = visibleProducts().find((item) => item.id === byId("recipe-product").value);
  if (!product) return;
  if (!canUsePermission("recipes.template", byId("recipe-original-template").value ? "update" : "create", state, session)) {
    setText("recipe-feedback", "Anda tidak punya akses untuk menyimpan template recipe.");
    return;
  }
  const templateId = byId("recipe-template").value;
  let template = visibleTemplates().find((item) => item.id === templateId);
  const qty = Number(byId("recipe-qty").value);
  const originalTemplateId = byId("recipe-original-template").value;
  const mappingOnly = isTemplateMappingMode(product);

  try {
    if (templateId === "__new_template") {
      template = createIngredientTemplateFromRecipe();
    }
    if (!template || qty <= 0) {
      setText("recipe-feedback", "Pilih template bahan dan isi jumlah per porsi.");
      return;
    }
    postProductSuite("/api/recipe", {
      productId: product.id,
      originalTemplateId,
      templateId: template.id,
      qty,
      unit: template.unit || ""
    });
    focusedProductId = product.id;
    renderOptions();
    renderRecipeList();
    closeModal();
    showAlert("Recipe produk tersimpan.");
  } catch (error) {
    setText("recipe-feedback", error.message);
  }
});

byId("modifier-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = byId("modifier-id").value || generatedId("mod", state.modifiers.map((modifier) => modifier.id));
  const existing = state.modifiers.find((modifier) => modifier.id === id);
  if (!canUsePermission("modifiers.master", existing ? "update" : "create", state, session)) {
    setText("modifier-preview", "Anda tidak punya akses untuk menyimpan modifier.");
    return;
  }
  const options = readModifierOptionPayloads(true, true);
  if (!options.length) {
    setText("modifier-preview", "Minimal isi satu opsi modifier dengan template bahan dan qty 0 atau lebih.");
    return;
  }
  const payload = stampScopedMaster({
    name: byId("modifier-name").value.trim(),
    scope: byId("modifier-scope").value,
    choiceType: byId("modifier-choice-type").value,
    status: byId("modifier-status").value,
    requiredSelection: byId("modifier-required-selection").checked,
    options
  }, state, session);
  if (existing && !canEditMaster(existing)) {
    setText("modifier-preview", "User Selected Outlet hanya bisa edit modifier outlet yang dipilih.");
    return;
  }
  if (existing && canAccessAllOutlets(session) && existing.scope === "outlet") {
    payload.scope = existing.scope;
    payload.outletId = existing.outletId;
  }
  try {
    existing ? putProductSuite(`/api/modifier/${id}`, payload) : postProductSuite("/api/modifier", payload);
    renderOptions();
    renderRecipeList();
    closeModal();
    showAlert(`Modifier ${payload.name} tersimpan.`);
  } catch (error) {
    setText("modifier-preview", error.message);
  }
});

byId("outlet-ingredient-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canUsePermission("inventory.ingredients", "create", state, session)) {
    setText("outlet-ingredient-feedback", "Anda tidak punya akses untuk membuat bahan outlet.");
    return;
  }
  const templateId = byId("outlet-ingredient-template").value;
  const name = byId("outlet-ingredient-name").value.trim();
  const stock = Number(byId("outlet-ingredient-stock").value) || 0;
  const totalCost = Number(byId("outlet-ingredient-cost").value) || 0;
  const fallbackCost = stock > 0 && totalCost > 0 ? totalCost / stock : 0;
  try {
    postProductSuite("/api/ingredient", {
      name,
      sku: byId("outlet-ingredient-sku").value.trim(),
      templateId,
      category: byId("outlet-ingredient-category").value,
      unit: byId("outlet-ingredient-unit").value.trim(),
      stock,
      totalCost,
      standardCost: Number(byId("outlet-ingredient-standard-cost").value) || fallbackCost,
      minStock: Number(byId("outlet-ingredient-min").value) || 0,
      manufacturedAt: byId("outlet-ingredient-manufactured-at").value,
      expiredAt: byId("outlet-ingredient-expired-at").value,
      status: COMMON_STATUS.ACTIVE
    });
    renderOptions();
    renderRecipeList();
    closeModal();
    showAlert(`${name} berhasil dibuat sebagai bahan outlet dan terhubung ke recipe.`);
  } catch (error) {
    setText("outlet-ingredient-feedback", error.message);
  }
});

byId("save-product-modifiers").addEventListener("click", () => {
  const product = state.products.find((item) => item.id === focusedProductId);
  if (!product) return;
  if (!canUsePermission("recipes.template", "update", state, session)) {
    setText("recipe-feedback", "Anda tidak punya akses untuk mengubah modifier produk.");
    return;
  }
  product.modifierIds = [...byId("product-modifier-list").querySelectorAll("[data-product-modifier-id]:checked")]
    .map((option) => option.dataset.productModifierId)
    .filter(Boolean);
  try {
    postProductSuite("/api/product-modifier", {
      productId: product.id,
      modifierIds: product.modifierIds
    });
    renderModifiers();
  } catch (error) {
    setText("recipe-feedback", error.message);
  }
});

byId("recipe-form").querySelectorAll("input, select").forEach((field) => {
  field.addEventListener("input", updatePreview);
  field.addEventListener("change", () => {
    if (field.id === "recipe-template") toggleNewTemplateFields();
    updatePreview();
  });
});

byId("modifier-option-editor").addEventListener("input", (event) => {
  syncModifierMaterialStandardCostFromField(event.target);
  updateModifierPreview();
});
byId("modifier-option-editor").addEventListener("change", (event) => {
  const changed = event.target;
  const config = changed?.closest?.("[data-option-config]");
  if (config && changed?.matches("[data-option-template]")) {
    config.dataset.skipMaterialPrompt = "false";
    syncModifierTemplateIngredient(config, "[data-option-template]", "[data-option-ingredient]");
  }
  if (config && changed?.matches("[data-option-replacement-template]")) {
    config.dataset.skipReplacementMaterialPrompt = "false";
    syncModifierTemplateIngredient(config, "[data-option-replacement-template]", "[data-option-replacement]");
  }
  syncModifierActionFields();
  updateModifierPreview();
});

["outlet-ingredient-stock", "outlet-ingredient-cost"].forEach((id) => {
  byId(id).addEventListener("input", syncOutletIngredientStandardCost);
});
byId("outlet-ingredient-unit").addEventListener("input", updateOutletIngredientPreview);

byId("recipe-focus-product").addEventListener("change", (event) => {
  focusedProductId = event.target.value;
  byId("recipe-product").value = focusedProductId;
  window.history.replaceState({}, "", `${window.location.pathname}?product=${encodeURIComponent(focusedProductId)}`);
  renderRecipeList();
});

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-open-recipe-modal]") && canUsePermission("recipes.template", "create", state, session)) openModal();
  if (event.target.closest("[data-open-modifier-modal]") && canUsePermission("modifiers.master", "create", state, session)) openModifierModal();
  if (event.target.closest("[data-add-option]") && canUsePermission("modifiers.options", "create", state, session)) {
    captureModifierOptionDrafts();
    modifierOptionDrafts.push(emptyModifierOption());
    renderModifierOptions();
    updateModifierPreview();
  }
  const removeOption = event.target.closest("[data-remove-option]");
  if (removeOption) {
    captureModifierOptionDrafts();
    modifierOptionDrafts.splice(Number(removeOption.dataset.removeOption), 1);
    renderModifierOptions();
    updateModifierPreview();
  }
  const saveModifierTemplate = event.target.closest("[data-save-modifier-template]");
  if (saveModifierTemplate) {
    const config = saveModifierTemplate.closest("[data-option-config]");
    if (config) saveModifierTemplateAndUse(config, saveModifierTemplate.dataset.saveModifierTemplate);
  }
  const saveModifierMaterial = event.target.closest("[data-save-modifier-material]");
  if (saveModifierMaterial) {
    const config = saveModifierMaterial.closest("[data-option-config]");
    if (config) saveModifierMaterialAndUse(config, saveModifierMaterial.dataset.saveModifierMaterial);
  }
  const editButton = event.target.closest("[data-edit-recipe-ingredient]");
  if (editButton) {
    if (!canUsePermission("recipes.template", "update", state, session)) return;
    const product = state.products.find((item) => item.id === focusedProductId);
    openModal(product?.recipe.find((line) => (line.templateId || line.ingredientId) === editButton.dataset.editRecipeIngredient));
  }
  const createIngredientButton = event.target.closest("[data-create-outlet-ingredient]");
  if (createIngredientButton) {
    if (!canUsePermission("inventory.ingredients", "create", state, session)) return;
    openOutletIngredientModal(createIngredientButton.dataset.createOutletIngredient);
  }
  const editModifier = event.target.closest("[data-edit-modifier]");
  if (editModifier) {
    if (editModifier.disabled || !canUsePermission("modifiers.master", "update", state, session)) return;
    openModifierModal(state.modifiers.find((modifier) => modifier.id === editModifier.dataset.editModifier));
  }
  if (event.target.closest("[data-close-modal]") || event.target.matches("[data-modal-backdrop]")) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

renderOptions();
renderRecipeList();
updatePreview();
