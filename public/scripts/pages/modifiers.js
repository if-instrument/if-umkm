import { renderLayout } from "../layout.js?v=coffee-v137";
import { apiDelete, apiGet, apiPost, apiPut, applyPermissionControls, canAccessAllOutlets, canManageCompanyMasters, canUsePermission, loadSession, loadState, primaryOutletId, scopedApiUrl, scopedPayload, stampScopedMaster, visibleForSession } from "../store.js?v=coffee-v137";
import { formatQty, money } from "../format.js";
import { byId, setText, showAlert } from "../dom.js";
import { ingredientName, missingModifierOptions, missingModifierSummary } from "../inventory.js";
import { enhanceAllDataTables } from "../datatable.js";

renderLayout();

const state = loadState();
const session = loadSession();
const requestedModifierId = new URLSearchParams(window.location.search).get("modifier");
let optionDrafts = [];

function applyProductSuite(data) {
  if (!data) return;
  if (Array.isArray(data.categories)) state.categories = data.categories;
  if (Array.isArray(data.products)) state.products = data.products;
  if (Array.isArray(data.modifiers)) state.modifiers = data.modifiers;
  if (Array.isArray(data.ingredients)) state.ingredients = data.ingredients;
  if (Array.isArray(data.ingredientTemplates)) state.ingredientTemplates = data.ingredientTemplates;
}

function refreshProductSuite() {
  const modifiers = apiGet(scopedApiUrl("/api/modifier?per_page=100", state, session));
  const ingredients = apiGet(scopedApiUrl("/api/ingredient?per_page=100", state, session));
  const templates = apiGet(scopedApiUrl("/api/ingredient-template?per_page=100&status=active", state, session));
  applyProductSuite({
    modifiers: modifiers?.data?.items || [],
    ingredients: ingredients?.data?.items || [],
    ingredientTemplates: templates?.data?.items || []
  });
}

function postProductSuite(url, payload) {
  const response = apiPost(url, scopedPayload(payload, state, session));
  if (!response?.ok) throw new Error(response?.message || "Modifier belum berhasil disimpan.");
  refreshProductSuite();
  return response;
}

function putProductSuite(url, payload) {
  const response = apiPut(url, scopedPayload(payload, state, session));
  if (!response?.ok) throw new Error(response?.message || "Modifier belum berhasil disimpan.");
  refreshProductSuite();
}

function putModifierOptionPrice(modifierId, payload) {
  const response = apiPut(`/api/modifier/${modifierId}/option-price`, scopedPayload(payload, state, session));
  if (!response?.ok) throw new Error(response?.message || "Harga outlet modifier belum berhasil disimpan.");
  refreshProductSuite();
}

function deleteProductSuite(url, payload = {}) {
  const response = apiDelete(url, scopedPayload(payload, state, session));
  if (!response?.ok) throw new Error(response?.message || "Modifier belum berhasil disimpan.");
  refreshProductSuite();
}

function visibleIngredients() {
  return state.ingredients.filter((ingredient) => visibleForSession(ingredient, state, session));
}

function visibleTemplates() {
  return (state.ingredientTemplates || []).filter((template) => template.status !== "inactive");
}

function templateById(templateId) {
  return visibleTemplates().find((template) => template.id === templateId) || {};
}

function ingredientForTemplate(templateId) {
  return visibleIngredients().find((ingredient) => ingredient.templateId === templateId && ingredient.status !== "inactive");
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

function visibleModifiers() {
  return state.modifiers.filter((modifier) => visibleForSession(modifier, state, session));
}

function canEditMaster(item) {
  if (canManageCompanyMasters(session)) return true;
  return item?.scope === "outlet" && item.outletId === primaryOutletId(state, session);
}

function syncScopeControl(modifier = null) {
  const field = byId("modifier-scope");
  if (!field) return;
  const canGlobal = canManageCompanyMasters(session);
  field.value = modifier?.scope || (canGlobal ? "company" : "outlet");
  field.disabled = !canGlobal || Boolean(modifier && !canEditMaster(modifier));
  if (!canGlobal) field.value = "outlet";
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

function generatedId(prefix, existingIds = []) {
  let id = "";
  do {
    id = `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  } while (existingIds.includes(id));
  return id;
}

function emptyOption() {
  return {
    id: generatedId("opt", optionDrafts.map((option) => option.id)),
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

function normalizedOptionAction(action) {
  return action === "replace" ? "replace" : "set";
}

function createIngredientTemplateFromOption(prefix, config) {
  const name = config.querySelector(`[data-option-${prefix}-new-template-name]`)?.value.trim() || "";
  const category = config.querySelector(`[data-option-${prefix}-new-template-category]`)?.value.trim() || "";
  const unit = config.querySelector(`[data-option-${prefix}-new-template-unit]`)?.value.trim() || "";
  if (!name || !category || !unit) {
    throw new Error("Isi nama template, kategori, dan satuan untuk template bahan baru di modifier.");
  }
  const response = postProductSuite("/api/ingredient-template", {
    name,
    category,
    unit,
    status: "active"
  });
  const created = response?.data || response?.template || null;
  const template = created?.id
    ? created
    : visibleTemplates().find((item) => item.name.toLowerCase() === name.toLowerCase() && item.unit.toLowerCase() === unit.toLowerCase());
  if (!template?.id) throw new Error("Template bahan baru tersimpan, tetapi belum bisa dipakai. Muat ulang halaman lalu pilih template tersebut.");
  return template.id;
}

function materialCategoryOptions(selected = "Raw Material") {
  const categories = ["Raw Material", "Packaging", "Consumable"];
  if (selected && !categories.includes(selected)) categories.push(selected);
  return categories.map((category) => `<option value="${escapeHtml(category)}" ${category === selected ? "selected" : ""}>${escapeHtml(category)}</option>`).join("");
}

function materialFormMarkup(prefix, title) {
  return "";
}

function syncMaterialForm(config, prefix, active = true) {
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

function syncMaterialForms() {
  byId("modifier-option-editor").querySelectorAll("[data-option-config]").forEach((config) => {
    const isReplace = normalizedOptionAction(config.querySelector("[data-option-action]").value) === "replace";
    syncMaterialForm(config, "base", true && config.dataset.skipMaterialPrompt !== "true");
    syncMaterialForm(config, "replacement", isReplace && config.dataset.skipReplacementMaterialPrompt !== "true");
  });
}

function syncMaterialStandardCostFromField(field) {
  const wrapper = field.closest?.(".modifier-material-form");
  if (!wrapper) return;
  const prefix = wrapper.querySelector("[data-option-base-material-stock]") ? "base" : "replacement";
  if (!field.matches(`[data-option-${prefix}-material-stock], [data-option-${prefix}-material-cost]`)) return;
  const stock = Number(wrapper.querySelector(`[data-option-${prefix}-material-stock]`).value) || 0;
  const totalCost = Number(wrapper.querySelector(`[data-option-${prefix}-material-cost]`).value) || 0;
  if (stock > 0 && totalCost > 0) wrapper.querySelector(`[data-option-${prefix}-material-standard]`).value = (totalCost / stock).toFixed(2);
}

function saveTemplateAndUse(config, prefix) {
  const templateSelector = prefix === "base" ? "[data-option-template]" : "[data-option-replacement-template]";
  const drafts = captureOptionDrafts();
  const index = Number(config.dataset.optionConfig);
  try {
    const templateId = createIngredientTemplateFromOption(prefix, config);
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
    renderOptions(drafts);
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

function saveMaterialAndUse(config, prefix) {
  if (!canUsePermission("inventory.ingredients", "create", state, session)) {
    setText("modifier-preview", "Anda tidak punya akses untuk membuat bahan outlet.");
    return;
  }
  const templateSelector = prefix === "base" ? "[data-option-template]" : "[data-option-replacement-template]";
  const ingredientSelector = prefix === "base" ? "[data-option-ingredient]" : "[data-option-replacement]";
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
  const drafts = captureOptionDrafts();
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
      status: "active"
    });
    const ingredient = ingredientForTemplate(templateId);
    drafts.forEach((draft) => {
      if (draft.templateId === templateId) draft.ingredientId = ingredient?.id || "";
      if (draft.replacementTemplateId === templateId) draft.replacementIngredientId = ingredient?.id || "";
    });
    renderOptions(drafts);
    updateModifierPreview();
    showAlert(`${name} tersimpan dan langsung digunakan untuk template ${template.name}.`);
  } catch (error) {
    setText("modifier-preview", error.message);
  }
}

function modifierDescription(modifier) {
  const options = modifier.options || [];
  return options.map((option) => {
    const ingredientExists = state.ingredients.some((item) => item.id === option.ingredientId && item.status !== "inactive");
    const replacementExists = state.ingredients.some((item) => item.id === option.replacementIngredientId && item.status !== "inactive");
    const missingBase = !ingredientExists;
    const missingReplacement = option.action === "replace" && !replacementExists;
    const ingredient = missingBase
      ? (option.templateName || option.ingredientName || "Bahan outlet belum tersedia")
      : ingredientName(state, option.ingredientId);
      const action = normalizedOptionAction(option.action) === "replace" ? "Ganti bahan" : "Tambah/Kurang bahan";
    const replacementName = missingReplacement
      ? (option.replacementTemplateName || option.replacementIngredientName || "Bahan pengganti belum tersedia")
      : ingredientName(state, option.replacementIngredientId);
      const target = normalizedOptionAction(option.action) === "replace" ? `${ingredient} ke ${replacementName}` : ingredient;
    const warning = missingBase || missingReplacement ? ` <span class="status-pill status-low">Mapping outlet belum lengkap</span>` : "";
    const priceNote = option.priceSource === "outlet"
      ? `${money(option.priceDelta || 0)} <small class="muted-text">(outlet, default ${money(option.basePriceDelta || 0)})</small>`
      : `${money(option.priceDelta || 0)} <small class="muted-text">(default)</small>`;
    return `${escapeHtml(option.name)}: ${action} ${formatQty(option.qty)} ${escapeHtml(target)} · ${priceNote}${warning}`;
  }).join("<br>");
}

function renderModifiers() {
  const modifiers = visibleModifiers();
  byId("modifier-master-table").innerHTML = modifiers.length
    ? modifiers.map((modifier) => {
      const missingOptions = missingModifierOptions(state, modifier);
      return `
      <tr>
        <td><strong>${escapeHtml(modifier.name)}</strong><br><span class="muted-text">${modifier.scope === "outlet" ? "Khusus outlet aktif" : "Global perusahaan"} · ${modifier.choiceType === "single" ? "Radio" : "Checkbox"} · ${modifier.status === "inactive" ? "Nonaktif" : modifier.requiredSelection ? "Wajib" : "Opsional"}</span>${missingOptions.length ? `<br><small class="muted-text">Perlu mapping bahan outlet: ${escapeHtml(missingModifierSummary(state, modifier))}</small>` : ""}</td>
        <td>${modifierDescription(modifier)}</td>
        <td><div class="row-actions"><button class="ghost-button compact-button" data-modifier-price="${modifier.id}" data-permission="modifiers.outletPrice:update" type="button">Harga Outlet</button><button class="ghost-button compact-button" ${canEditMaster(modifier) ? "" : "disabled title=\"Selected Outlet hanya bisa edit modifier outlet yang dipilih\""} data-edit-modifier="${modifier.id}" data-permission="modifiers.master:update" type="button">Edit</button><button class="ghost-button compact-button" ${canEditMaster(modifier) ? "" : "disabled title=\"Selected Outlet hanya bisa edit modifier outlet yang dipilih\""} data-toggle-modifier="${modifier.id}" data-permission="modifiers.master:delete" type="button">${modifier.status === "inactive" ? "Aktifkan" : "Nonaktifkan"}</button></div></td>
      </tr>
    `;
    }).join("")
    : `<tr><td colspan="3" class="empty-state">Belum ada modifier master.</td></tr>`;
  enhanceAllDataTables();
  applyPermissionControls(document, state, session);
}

function captureOptionDrafts() {
  const configs = [...byId("modifier-option-editor").querySelectorAll("[data-option-config]")];
  if (!configs.length) return optionDrafts;
  optionDrafts = configs.map((config) => {
    const action = normalizedOptionAction(config.querySelector("[data-option-action]").value);
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
  return optionDrafts;
}

function renderOptions(options = optionDrafts) {
  const availableIngredients = visibleIngredients();
  const availableTemplates = visibleTemplates();
  const ingredientOptions = availableIngredients.map((item) => `<option value="${item.id}">${item.name} (${item.unit})</option>`).join("");
  const optionalIngredientOptions = `<option value="">Belum dimapping di outlet</option>${ingredientOptions}`;
  const templateOptions = availableTemplates.map((item) => `<option value="${item.id}">${item.name} · ${item.category} (${item.unit})</option>`).join("");
  const optionalTemplateOptions = `<option value="">Pilih template</option>${templateOptions}<option value="__new_template">+ Buat template bahan baru</option>`;
  const drafts = options.length ? options : [emptyOption()];
  optionDrafts = drafts;
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
          <option value="set" ${normalizedOptionAction(option.action) === "set" ? "selected" : ""}>Tambah/Kurang bahan</option>
          <option value="replace" ${normalizedOptionAction(option.action) === "replace" ? "selected" : ""}>Ganti bahan dasar</option>
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
        <button class="primary-button compact-button" data-save-template="base" data-permission="ingredients.template:create" type="button">Simpan & Gunakan</button>
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
        <button class="primary-button compact-button" data-save-template="replacement" data-permission="ingredients.template:create" type="button">Simpan & Gunakan</button>
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
  syncActionFields();
  syncMaterialForms();
}

function resolveTemplateValue(config, selectSelector, prefix, allowCreate) {
  const value = config.querySelector(selectSelector).value;
  if (value !== "__new_template") return value;
  return allowCreate ? createIngredientTemplateFromOption(prefix, config) : value;
}

function readOptionPayloads(requireFirst, allowCreateTemplates = false) {
  return [...byId("modifier-option-editor").querySelectorAll("[data-option-config]")].map((config) => {
    const id = config.dataset.optionId || generatedId("opt", optionDrafts.map((option) => option.id));
    const name = config.querySelector("[data-option-name]").value.trim();
    const qty = Number(config.querySelector("[data-option-qty]").value) || 0;
    const action = normalizedOptionAction(config.querySelector("[data-option-action]").value);
    const templateId = resolveTemplateValue(config, "[data-option-template]", "base", allowCreateTemplates);
    const replacementTemplateId = action === "replace"
      ? resolveTemplateValue(config, "[data-option-replacement-template]", "replacement", allowCreateTemplates)
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
      replacementIngredientId: action === "replace"
        ? config.querySelector("[data-option-replacement]").value
        : "",
      qty
    };
  }).filter(Boolean);
}

function updateModifierPreview() {
  const filledOptions = readOptionPayloads(false);
  const text = filledOptions.length
    ? filledOptions.map((option) => {
      const action = normalizedOptionAction(option.action) === "replace" ? "ganti" : "tambah/kurang";
      const templateName = option.templateId === "__new_template"
        ? "Template baru"
        : visibleTemplates().find((item) => item.id === option.templateId)?.name || "Template belum dipilih";
      const ingredientLabel = option.ingredientId ? ingredientName(state, option.ingredientId) : `Perlu mapping bahan (${templateName})`;
      const replacementTemplateName = option.replacementTemplateId === "__new_template"
        ? "Template pengganti baru"
        : visibleTemplates().find((item) => item.id === option.replacementTemplateId)?.name || "Template pengganti belum dipilih";
      const replacementLabel = option.replacementIngredientId ? ingredientName(state, option.replacementIngredientId) : `Perlu mapping bahan (${replacementTemplateName})`;
      const target = normalizedOptionAction(option.action) === "replace" ? `${ingredientLabel} ke ${replacementLabel}` : ingredientLabel;
      return `${option.name}: ${action} ${formatQty(option.qty || 0)} ${target} (${money(option.priceDelta || 0)})`;
    }).join(" · ")
    : "Isi minimal opsi pertama. Setiap opsi bisa menambah, mengurangi, atau mengganti bahan.";
  setText("modifier-preview", text);
}

function syncActionFields() {
  byId("modifier-option-editor").querySelectorAll("[data-option-config]").forEach((config) => {
    const isReplace = normalizedOptionAction(config.querySelector("[data-option-action]").value) === "replace";
    config.querySelectorAll(".replace-field").forEach((field) => { field.hidden = !isReplace; });
    syncNewTemplateFields(config, "[data-option-template]", "[data-option-base-new-template]", "base", true);
    syncNewTemplateFields(config, "[data-option-replacement-template]", "[data-option-replacement-new-template]", "replacement", isReplace);
    syncMaterialForm(config, "base", true && config.dataset.skipMaterialPrompt !== "true");
    syncMaterialForm(config, "replacement", isReplace && config.dataset.skipReplacementMaterialPrompt !== "true");
  });
}

function syncTemplateIngredient(config, templateSelector, ingredientSelector) {
  const templateId = config.querySelector(templateSelector).value;
  if (templateId === "__new_template") {
    config.querySelector(ingredientSelector).value = "";
    return;
  }
  const ingredient = ingredientForTemplate(templateId);
  if (ingredient) config.querySelector(ingredientSelector).value = ingredient.id;
  syncMaterialForms();
}

function syncNewTemplateFields(config, selectSelector, wrapperSelector, prefix, active = true) {
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

function openModal(modifier = null) {
  byId("modifier-form").reset();
  byId("modifier-id").value = modifier?.id || "";
  byId("modifier-name").value = modifier?.name || "";
  syncScopeControl(modifier);
  byId("modifier-choice-type").value = modifier?.choiceType || (modifier?.requiredSelection ? "single" : "multiple");
  byId("modifier-status").value = modifier?.status || "active";
  byId("modifier-required-selection").checked = Boolean(modifier?.requiredSelection);
  renderOptions(modifier?.options?.length ? modifier.options.map((option) => ({ ...option })) : [emptyOption()]);
  byId("modifier-modal-title").textContent = modifier ? "Edit Modifier" : "Tambah Modifier";
  updateModifierPreview();
  document.querySelector("[data-modal-backdrop]").hidden = false;
  byId("modifier-modal").hidden = false;
  document.body.classList.add("modal-open");
}

function closeModal() {
  document.querySelector("[data-modal-backdrop]").hidden = true;
  byId("modifier-modal").hidden = true;
  document.body.classList.remove("modal-open");
}

function selectedPriceModifier() {
  return state.modifiers.find((modifier) => modifier.id === byId("price-modifier-id").value);
}

function renderModifierPriceRows(modifier) {
  byId("modifier-price-editor").innerHTML = (modifier.options || []).map((option) => `
    <article class="modifier-price-row" data-modifier-price-option="${option.id}">
      <div>
        <strong>${escapeHtml(option.name)}</strong>
        <span>${option.priceSource === "outlet" ? "Harga outlet aktif" : "Default master"} · default ${money(option.basePriceDelta ?? option.priceDelta ?? 0)}</span>
      </div>
      <label>Harga Outlet
        <input data-price-option-value min="0" step="500" type="number" value="${option.outletPriceDelta ?? option.priceDelta ?? 0}" />
      </label>
      <label>Catatan
        <input data-price-option-note autocomplete="off" placeholder="Catatan harga outlet" type="text" value="${escapeHtml(option.outletPriceNote || "")}" />
      </label>
    </article>
  `).join("");
}

function updateModifierPricePreview() {
  const rows = [...byId("modifier-price-editor").querySelectorAll("[data-modifier-price-option]")];
  if (!rows.length) {
    byId("price-modifier-preview").textContent = "Modifier belum memiliki opsi harga.";
    return;
  }
  const total = rows.reduce((sum, row) => sum + (Number(row.querySelector("[data-price-option-value]").value) || 0), 0);
  byId("price-modifier-preview").textContent = `${rows.length} opsi siap disimpan. Total nilai tambahan bila semua opsi dipilih: ${money(total)}.`;
}

function openPriceModal(modifier) {
  if (!modifier) return;
  if (!(modifier.options || []).length) {
    setText("modifier-preview", "Modifier belum memiliki opsi untuk diatur harganya.");
    return;
  }
  byId("modifier-price-form").reset();
  byId("price-modifier-id").value = modifier.id;
  byId("modifier-price-title").textContent = `Harga Outlet - ${modifier.name}`;
  byId("price-modifier-name").value = modifier.name;
  renderModifierPriceRows(modifier);
  updateModifierPricePreview();
  document.querySelector("[data-modal-backdrop]").hidden = false;
  byId("modifier-price-modal").hidden = false;
  document.body.classList.add("modal-open");
}

function closePriceModal() {
  document.querySelector("[data-modal-backdrop]").hidden = true;
  byId("modifier-price-modal").hidden = true;
  document.body.classList.remove("modal-open");
}

function closeAnyModal() {
  byId("modifier-modal").hidden = true;
  byId("modifier-price-modal").hidden = true;
  document.querySelector("[data-modal-backdrop]").hidden = true;
  document.body.classList.remove("modal-open");
}

byId("modifier-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = byId("modifier-id").value || generatedId("mod", state.modifiers.map((modifier) => modifier.id));
  const existing = state.modifiers.find((modifier) => modifier.id === id);
  if (!canUsePermission("modifiers.master", existing ? "update" : "create", state, session)) {
    setText("modifier-preview", "Anda tidak punya akses untuk menyimpan modifier.");
    return;
  }
  const options = readOptionPayloads(true, true);
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
    renderModifiers();
    closeModal();
    showAlert(`Modifier ${payload.name} tersimpan.`);
  } catch (error) {
    setText("modifier-preview", error.message);
  }
});

byId("modifier-price-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canUsePermission("modifiers.outletPrice", "update", state, session)) {
    setText("price-modifier-feedback", "Anda tidak punya akses untuk mengubah harga outlet modifier.");
    return;
  }
  const modifierId = byId("price-modifier-id").value;
  const rows = [...byId("modifier-price-editor").querySelectorAll("[data-modifier-price-option]")];
  try {
    rows.forEach((row) => {
      putModifierOptionPrice(modifierId, {
        optionId: row.dataset.modifierPriceOption,
        priceDelta: Number(row.querySelector("[data-price-option-value]").value) || 0,
        note: row.querySelector("[data-price-option-note]").value.trim(),
        status: "active"
      });
    });
    closePriceModal();
    renderModifiers();
    showAlert(`${rows.length} harga opsi modifier outlet tersimpan.`);
  } catch (error) {
    setText("price-modifier-feedback", error.message);
  }
});

byId("modifier-option-editor").addEventListener("input", (event) => {
  syncMaterialStandardCostFromField(event.target);
  updateModifierPreview();
});
byId("modifier-option-editor").addEventListener("change", (event) => {
  const changed = event.target;
  const config = changed?.closest?.("[data-option-config]");
  if (config && changed?.matches("[data-option-template]")) {
    config.dataset.skipMaterialPrompt = "false";
    syncTemplateIngredient(config, "[data-option-template]", "[data-option-ingredient]");
  }
  if (config && changed?.matches("[data-option-replacement-template]")) {
    config.dataset.skipReplacementMaterialPrompt = "false";
    syncTemplateIngredient(config, "[data-option-replacement-template]", "[data-option-replacement]");
  }
  syncActionFields();
  updateModifierPreview();
});

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-open-modifier-modal]") && canUsePermission("modifiers.master", "create", state, session)) openModal();
  if (event.target.closest("[data-add-option]") && canUsePermission("modifiers.options", "create", state, session)) {
    captureOptionDrafts();
    optionDrafts.push(emptyOption());
    renderOptions();
    updateModifierPreview();
  }
  const removeOption = event.target.closest("[data-remove-option]");
  if (removeOption) {
    captureOptionDrafts();
    optionDrafts.splice(Number(removeOption.dataset.removeOption), 1);
    renderOptions();
    updateModifierPreview();
  }
  const saveTemplate = event.target.closest("[data-save-template]");
  if (saveTemplate) {
    const config = saveTemplate.closest("[data-option-config]");
    if (config) saveTemplateAndUse(config, saveTemplate.dataset.saveTemplate);
  }
  const saveMaterial = event.target.closest("[data-save-material]");
  if (saveMaterial) {
    const config = saveMaterial.closest("[data-option-config]");
    if (config) saveMaterialAndUse(config, saveMaterial.dataset.saveMaterial);
  }
  const editModifier = event.target.closest("[data-edit-modifier]");
  if (editModifier && !editModifier.disabled && canUsePermission("modifiers.master", "update", state, session)) openModal(state.modifiers.find((modifier) => modifier.id === editModifier.dataset.editModifier));
  const priceModifier = event.target.closest("[data-modifier-price]");
  if (priceModifier && canUsePermission("modifiers.outletPrice", "update", state, session)) openPriceModal(state.modifiers.find((modifier) => modifier.id === priceModifier.dataset.modifierPrice));
  const toggleModifier = event.target.closest("[data-toggle-modifier]");
  if (toggleModifier && !toggleModifier.disabled && canUsePermission("modifiers.master", "delete", state, session)) {
    const modifier = state.modifiers.find((item) => item.id === toggleModifier.dataset.toggleModifier);
    if (!modifier) return;
    try {
      if (modifier.status === "inactive") putProductSuite(`/api/modifier/${modifier.id}`, { ...modifier, status: "active" });
      else deleteProductSuite(`/api/modifier/${modifier.id}`, {});
      renderModifiers();
    } catch (error) {
      setText("modifier-preview", error.message);
    }
  }
  if (event.target.closest("[data-close-modal]")) closeModal();
  if (event.target.closest("[data-close-price-modal]")) closePriceModal();
  if (event.target.matches("[data-modal-backdrop]")) closeAnyModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeAnyModal();
});

byId("modifier-price-editor").addEventListener("input", updateModifierPricePreview);

refreshProductSuite();
renderOptions([emptyOption()]);
renderModifiers();
updateModifierPreview();
if (requestedModifierId) openModal(state.modifiers.find((modifier) => modifier.id === requestedModifierId));
