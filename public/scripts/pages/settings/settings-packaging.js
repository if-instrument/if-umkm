import { state, session } from "./settings-state.js";
import { statusPill } from "./settings-helpers.js";
import { postSetting, putSetting, refreshSettingsData } from "./settings-api.js";
import { byId, setText, showAlert, showFeedback } from "../../dom.js";
import { formatQty, money } from "../../format.js";
import { costingMethodLabel, ingredientUnitCost } from "../../inventory.js";
import { COMMON_STATUS, isInactiveStatus } from "../../status-codes.js";
import { canUsePermission, apiPost, scopedPayload } from "../../store.js";

let renderSettingsHandler = null;
let openModalHandler = null;
let closeModalHandler = null;

export function setPackagingCallbacks({ renderSettings, openModal, closeModal }) {
  if (renderSettings) renderSettingsHandler = renderSettings;
  if (openModal) openModalHandler = openModal;
  if (closeModal) closeModalHandler = closeModal;
}

export function fillPackagingRuleOptions() {
  return (state.ingredients || []).filter((item) => !isInactiveStatus(item.status) && String(item.category || item.templateCategory || "").toLowerCase() === "packaging");
}

export function syncPackagingNewIngredientPanel() {
  const selected = [...document.querySelectorAll("[data-packaging-ingredient]")].some((select) => select.value === "__new_packaging");
  const panel = byId("packaging-new-ingredient-panel");
  if (panel) panel.hidden = !selected;
}

export function packagingHppReference(item) {
  const unitCost = Number(ingredientUnitCost(state, item) || 0);
  if (unitCost > 0) return unitCost;
  return Number(item.standardCost || item.avgCost || 0);
}

export function packagingOptionMarkup(includeEmpty = false) {
  const packagingIngredients = fillPackagingRuleOptions();
  const costingLabel = costingMethodLabel(state);
  const options = packagingIngredients.map((item) => `<option value="${item.id}">${item.name} · stok ${formatQty(item.stock)} ${item.unit} · HPP ${costingLabel} ${money(packagingHppReference(item))}/${item.unit}</option>`).join("");
  return `${includeEmpty ? `<option value="">Tidak ada</option>` : ""}${options}<option value="__new_packaging">+ Buat bahan packaging baru</option>`;
}

export function packagingLineMarkup(line = {}, index = 0, type = "item") {
  const label = type === "fallback" ? `Pengganti ${index + 1}` : `Item ${index + 1}`;
  return `
    <div class="packaging-rule-item-grid" data-packaging-line="${type}">
      <label>${label} <select data-packaging-ingredient>${packagingOptionMarkup(type === "fallback")}</select></label>
      <label>Qty <input data-packaging-qty min="${type === "fallback" ? "0" : "1"}" ${type === "fallback" ? "" : "required"} type="number" value="${line.qty || (type === "fallback" ? 0 : 1)}" /></label>
      <label>Harga / Kemasan <input data-packaging-price min="0" ${type === "fallback" ? "" : "required"} step="1" type="number" value="${line.price || 0}" /></label>
      <button class="ghost-button compact-button" data-remove-packaging-line type="button" ${type === "item" && index === 0 ? "disabled" : ""}>Hapus</button>
    </div>
  `;
}

export function renderPackagingRuleLines(items = [], fallbackItems = []) {
  const normalItems = items.length ? items : [{ qty: 1, price: 0 }];
  if (byId("packaging-rule-items")) {
    byId("packaging-rule-items").innerHTML = normalItems.map((line, index) => packagingLineMarkup(line, index, "item")).join("");
  }
  if (byId("packaging-rule-fallbacks")) {
    byId("packaging-rule-fallbacks").innerHTML = fallbackItems.map((line, index) => packagingLineMarkup(line, index, "fallback")).join("");
  }
  document.querySelectorAll("#packaging-rule-items [data-packaging-line]").forEach((row, index) => {
    const select = row.querySelector("[data-packaging-ingredient]");
    if (select) select.value = normalItems[index]?.ingredientId || fillPackagingRuleOptions()[0]?.id || "";
  });
  document.querySelectorAll("#packaging-rule-fallbacks [data-packaging-line]").forEach((row, index) => {
    const select = row.querySelector("[data-packaging-ingredient]");
    if (select) select.value = fallbackItems[index]?.ingredientId || "";
  });
  syncPackagingNewIngredientPanel();
}

export function readPackagingLines(containerId, requireOne = false, allowNewPlaceholder = false) {
  const container = byId(containerId);
  if (!container) return [];
  const rows = [...container.querySelectorAll("[data-packaging-line]")];
  const lines = rows.map((row) => ({
    ingredientId: row.querySelector("[data-packaging-ingredient]")?.value,
    qty: Number(row.querySelector("[data-packaging-qty]")?.value || 0),
    price: Number(row.querySelector("[data-packaging-price]")?.value || 0)
  })).filter((line) => line.ingredientId && line.qty > 0);
  if (!allowNewPlaceholder && lines.some((line) => line.ingredientId === "__new_packaging")) {
    throw new Error("Buat bahan packaging baru terlebih dahulu sebelum menyimpan rule.");
  }
  if (requireOne && !lines.length) {
    throw new Error("Isi minimal satu item kemasan untuk rule.");
  }
  return lines;
}

export function createPackagingIngredientInline() {
  const targetSelect = [...document.querySelectorAll("[data-packaging-ingredient]")].find((select) => select.value === "__new_packaging")
    || byId("packaging-rule-items")?.querySelector("[data-packaging-ingredient]");
  const name = byId("packaging-new-ingredient-name")?.value.trim() || "";
  const unit = byId("packaging-new-ingredient-unit")?.value.trim() || "pcs";
  const standardCost = Number(byId("packaging-new-ingredient-cost")?.value || 0);
  if (!name) {
    showFeedback("packaging-rule-feedback", "Isi nama bahan packaging baru terlebih dahulu.");
    return;
  }
  const response = apiPost("/api/ingredient", scopedPayload({
    name,
    category: "Packaging",
    unit,
    stock: 0,
    totalCost: 0,
    standardCost,
    minStock: Number(byId("packaging-new-ingredient-min-stock")?.value || 0),
    note: "Dibuat dari Packaging Rule"
  }, state, session));
  if (!response?.ok) {
    showFeedback("packaging-rule-feedback", response?.message || "Bahan packaging baru gagal dibuat.");
    return;
  }
  refreshSettingsData();
  const currentItems = readPackagingLines("packaging-rule-items", false, true);
  const currentFallbacks = readPackagingLines("packaging-rule-fallbacks", false, true);
  const created = response.data;
  if (created?.id && targetSelect) {
    const targetType = targetSelect.closest("[data-packaging-line]")?.dataset.packagingLine || "item";
    const targetIndex = [...targetSelect.closest(`#${targetType === "fallback" ? "packaging-rule-fallbacks" : "packaging-rule-items"}`).querySelectorAll("[data-packaging-line]")].indexOf(targetSelect.closest("[data-packaging-line]"));
    if (targetType === "fallback") currentFallbacks[targetIndex] = { ingredientId: created.id, qty: currentFallbacks[targetIndex]?.qty || 1, price: standardCost };
    else currentItems[targetIndex] = { ingredientId: created.id, qty: currentItems[targetIndex]?.qty || 1, price: standardCost };
    renderPackagingRuleLines(currentItems, currentFallbacks);
  }
  if (byId("packaging-new-ingredient-name")) byId("packaging-new-ingredient-name").value = "";
  if (byId("packaging-new-ingredient-cost")) byId("packaging-new-ingredient-cost").value = 0;
  if (byId("packaging-new-ingredient-min-stock")) byId("packaging-new-ingredient-min-stock").value = 0;
  showFeedback("packaging-rule-feedback", "Bahan packaging baru dibuat dan dipilih di rule.");
}

export function renderPackagingRules() {
  const rules = (state.settings?.packagingRules || []).slice().sort((a, b) => a.minQty - b.minQty);
  const table = byId("packaging-rule-table");
  if (!table) return;

  table.innerHTML = rules.length ? rules.map((rule) => `
    <tr>
      <td><strong>${rule.minQty === rule.maxQty ? rule.minQty : `${rule.minQty} - ${rule.maxQty}`} item pesanan</strong><br>${statusPill(rule.status || COMMON_STATUS.ACTIVE)}</td>
      <td>${rule.items.map((item, index) => {
        const ingredient = (state.ingredients || []).find((entry) => entry.id === item.ingredientId);
        return `<span class="packaging-rule-chip">Item ${index + 1}: ${item.qty}x ${ingredient?.name || "Kemasan terhapus"} · Harga ${money(item.price || 0)}</span>`;
      }).join("")}${rule.fallbackItems?.length ? `<br><small>Paket Pengganti: ${rule.fallbackItems.map((item) => `${item.qty}x ${(state.ingredients || []).find((entry) => entry.id === item.ingredientId)?.name || "Kemasan terhapus"} · Harga ${money(item.price || 0)}`).join(", ")}</small>` : ""}</td>
      <td><div class="row-actions"><button class="ghost-button compact-button" data-edit-packaging-rule="${rule.id}" data-permission="settings.packaging:update" type="button">Edit</button><button class="ghost-button compact-button" data-delete-packaging-rule="${rule.id}" data-permission="settings.packaging:delete" type="button">${isInactiveStatus(rule.status) ? "Aktifkan" : "Nonaktifkan"}</button></div></td>
    </tr>
  `).join("") : `<tr><td colspan="3">Belum ada packaging rule.</td></tr>`;
}

export function openPackagingRule(rule = null) {
  const packagingIngredients = fillPackagingRuleOptions();
  const defaultPackagingId = packagingIngredients[0]?.id || "";
  if (byId("packaging-rule-id")) byId("packaging-rule-id").value = rule?.id || "";
  if (byId("packaging-rule-min")) byId("packaging-rule-min").value = rule?.minQty || 1;
  if (byId("packaging-rule-max")) byId("packaging-rule-max").value = rule?.maxQty || 1;
  renderPackagingRuleLines(rule?.items?.length ? rule.items : [{ ingredientId: defaultPackagingId, qty: 1, price: 0 }], rule?.fallbackItems || []);
  setText("packaging-rule-feedback", packagingIngredients.length ? "" : "Buat bahan outlet dengan kategori Packaging terlebih dahulu agar bisa dipilih sebagai kemasan.");
  if (openModalHandler) openModalHandler("packaging-rule-modal");
}

export function savePackagingRule(event) {
  event.preventDefault();
  const id = byId("packaging-rule-id")?.value || "";
  if (!canUsePermission("settings.packaging", id ? "update" : "create", state, session)) {
    showFeedback("packaging-rule-feedback", "Anda tidak punya akses untuk menyimpan packaging rule.");
    return;
  }
  const minQty = Number(byId("packaging-rule-min")?.value || 1);
  const maxQty = Number(byId("packaging-rule-max")?.value || 1);
  if (maxQty < minQty) {
    showFeedback("packaging-rule-feedback", "Jumlah maksimum tidak boleh lebih kecil dari minimum.");
    return;
  }
  let items = [];
  let fallbackItems = [];
  try {
    items = readPackagingLines("packaging-rule-items", true);
    fallbackItems = readPackagingLines("packaging-rule-fallbacks", false);
  } catch (error) {
    showFeedback("packaging-rule-feedback", error.message);
    return;
  }
  const overlap = (state.settings?.packagingRules || []).some((rule) => !isInactiveStatus(rule.status) && rule.id !== id && minQty <= rule.maxQty && maxQty >= rule.minQty);
  if (overlap) {
    showFeedback("packaging-rule-feedback", "Rentang jumlah bertabrakan dengan rule lain.");
    return;
  }
  const existing = (state.settings?.packagingRules || []).find((rule) => rule.id === id);
  const status = existing?.status || COMMON_STATUS.ACTIVE;
  if (!(id ? putSetting(`/api/packaging-rule/${id}`, { minQty, maxQty, items, fallbackItems, status }) : postSetting("/api/packaging-rule", { minQty, maxQty, items, fallbackItems, status }))) {
    showFeedback("packaging-rule-feedback", "Gagal menyimpan packaging rule ke database.");
    return;
  }
  if (closeModalHandler) closeModalHandler();
  if (renderSettingsHandler) renderSettingsHandler();
  showAlert("Packaging rule tersimpan.");
}
