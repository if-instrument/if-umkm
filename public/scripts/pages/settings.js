import { renderLayout } from "../layout.js?v=coffee-v151";
import { apiDelete, apiGet, apiPost, apiPut, apiUpload, applyPermissionControls, canUsePermission, loadSession, loadState, scopedPayload } from "../store.js?v=coffee-v151";
import { formatQty, money } from "../format.js";
import { byId, setText, showAlert, showFeedback } from "../dom.js";
import { costingMethodLabel, ingredientUnitCost } from "../inventory.js";
import { enhanceAllDataTables } from "../datatable.js";
import { COMMON_STATUS, CONNECTOR_STATUS, isActiveStatus, isInactiveStatus, statusLabel } from "../status-codes.js";
import { loadPageBootstrap } from "../page-engine.js?v=coffee-v151";

renderLayout();

let state = loadState();
const session = loadSession();
const requestedSettingTab = new URLSearchParams(window.location.search).get("tab");
let activeSettingTab = ["company", "outlet", "costing", "tables", "payment", "packaging", "book-content"].includes(requestedSettingTab) ? requestedSettingTab : "company";
let printerCache = [];
let printerDropdownMode = "browse";
const settingTabPermissions = {
  company: ["company.branding", "read"],
  outlet: ["settings.outlet", "read"],
  costing: ["settings.costing", "read"],
  tables: ["settings.tables", "read"],
  payment: ["settings.payment", "read"],
  packaging: ["settings.packaging", "read"],
  "book-content": ["settings.outlet", "read"]
};
refreshSettingsData();

function defaultBookContent() {
  return {
    coverSubtitle: "UMKM Solution",
    coverDescription: "Pilih outlet dan mulai pemesanan dari buku menu digital.",
    outletTitle: "Pilih Outlet",
    serviceTitle: "Pilih Mode",
    serviceDescription: "Pilih tipe pembelian yang aktif di outlet ini.",
    tableTitle: "Table Layout",
    tableDescription: "Pilih meja untuk dine in.",
    menuTitle: "Pilih Menu",
    menuDescription: "Pilih kategori, cari menu, lalu tambahkan produk ke cart.",
    cartTitle: "Cart",
    cartDescription: "Cek detail pesanan sebelum isi data customer.",
    customerTitle: "Customer & Payment",
    customerDescription: "Data receipt dan metode pembayaran.",
    receiptTitle: "Receipt Detail",
    receiptDescription: "Ringkasan akhir dan status pesanan.",
    backSubtitle: "Terima kasih",
    backDescription: "Pesanan Anda sudah diterima outlet. Simpan nomor order untuk konfirmasi.",
    backButton: "Kembali ke Cover Depan"
  };
}

function applySettingsData(data) {
  if (!data) return;
  state.settings = { ...state.settings, ...(data.settings || {}) };
  if (Array.isArray(data.ingredients)) {
    state.ingredients = data.ingredients.map((item) => ({ ...item, minStock: item.minStock || 0, avgCost: item.avgCost || 0 }));
  }
}

function postSetting(url, payload) {
  const result = apiPost(url, scopedPayload(payload, state, session));
  if (!result?.ok) return false;
  refreshSettingsData();
  return true;
}

function putSetting(url, payload) {
  const result = apiPut(url, scopedPayload(payload, state, session));
  if (!result?.ok) return false;
  refreshSettingsData();
  return true;
}

function deleteSetting(url, payload = {}) {
  const result = apiDelete(url, scopedPayload(payload, state, session));
  if (!result?.ok) return false;
  refreshSettingsData();
  return true;
}

function refreshSettingsData() {
  const response = loadPageBootstrap("settings", state, session);
  if (!response?.ok) {
    showFeedback("company-feedback", response?.message || "Data pengaturan gagal dimuat.");
    return;
  }
  const data = response.data || {};
  state.companies = data.companies || session?.accessContext?.companies || [];
  state.outlets = data.outlets || session?.accessContext?.outlets || [];
  state.activeCompanyId = data.activeCompanyId || session?.companyId || state.activeCompanyId;
  state.settings = { ...state.settings, ...(data.settings || {}) };
  state.ingredients = (data.ingredients || []).map((item) => ({ ...item, minStock: item.minStock || 0, avgCost: item.avgCost || 0 }));
  renderSettings();
}

function exists(id) {
  return Boolean(byId(id));
}

function statusPill(status) {
  return isActiveStatus(status)
    ? `<span class="status-pill status-ok">Aktif</span>`
    : `<span class="status-pill status-empty">Nonaktif</span>`;
}

function slugify(value) {
  return (value || "company").trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "company";
}

function activeCompany() {
  return state.companies.find((company) => company.id === (session?.companyId || state.activeCompanyId)) || state.companies[0] || {};
}

function activeOutlets() {
  const companyId = session?.companyId || state.activeCompanyId;
  return state.outlets.filter((outlet) => outlet.companyId === companyId && !isInactiveStatus(outlet.status));
}

function logoPreviewMarkup(url, fallback = "IF") {
  return url ? `<img src="${url}" alt="Logo">` : fallback;
}

function setLogoValue(inputId, previewId, url, fallback = "IF") {
  byId(inputId).value = url || "";
  byId(previewId).innerHTML = logoPreviewMarkup(url, fallback);
}

function uploadLogo(file) {
  if (!file) return;
  const formData = new FormData();
  formData.append("logo", file);
  const result = apiUpload("/api/company-logo", formData);
  if (!result?.ok || !result.url) {
    showFeedback("company-feedback", "Upload logo gagal. Gunakan JPG, PNG, WEBP, atau GIF maksimal 2 MB.");
    return;
  }
  setLogoValue("company-logo-url", "company-logo-preview", result.url, (activeCompany().name || "IF").slice(0, 2).toUpperCase());
  showFeedback("company-feedback", "Logo berhasil diupload. Simpan Company untuk memakai logo ini.");
}

function setQrisImage(url = "") {
  byId("payment-qris-image-url").value = url;
  byId("payment-qris-image-preview").innerHTML = url ? `<img src="${url}" alt="Preview QRIS Static" />` : "Belum ada QRIS";
}

function uploadQrisImage(file) {
  if (!file) return;
  const formData = new FormData();
  formData.append("qrisImage", file);
  const result = apiUpload("/api/payment-method-qris-image", formData);
  if (!result?.ok || !result.url) {
    showFeedback("payment-method-feedback", result?.message || "Upload gambar QRIS gagal.");
    byId("payment-qris-image-file").value = "";
    return;
  }
  setQrisImage(result.url);
  showFeedback("payment-method-feedback", "Gambar QRIS berhasil diupload. Simpan metode bayar untuk menggunakannya.");
}

function setActiveSettingTab(tab) {
  const requestedTab = tab || "company";
  const canOpenRequested = canUsePermission(settingTabPermissions[requestedTab]?.[0] || "", settingTabPermissions[requestedTab]?.[1] || "read", state, session);
  activeSettingTab = canOpenRequested
    ? requestedTab
    : Object.entries(settingTabPermissions).find(([, permission]) => canUsePermission(permission[0], permission[1], state, session))?.[0] || requestedTab;
  document.querySelectorAll("[data-setting-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.settingTab === activeSettingTab);
  });
  document.querySelectorAll("[data-setting-tab-panel]").forEach((panel) => {
    const active = panel.dataset.settingTabPanel === activeSettingTab;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}

function sortedDiningTables() {
  return (state.settings.diningTables || []).slice().sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0) || a.name.localeCompare(b.name));
}

function sortedPaymentMethods() {
  return (state.settings.paymentMethods || []).slice().sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0) || a.name.localeCompare(b.name));
}

function paymentTypeLabel(type) {
  const labels = {
    cash: "Cash (Tunai)",
    qris: "QRIS",
    edc: "EDC Kasir",
    card: "Card Online",
    transfer: "Transfer / E-Wallet",
    ewallet: "E-Wallet",
    other: "Lainnya"
  };
  return labels[type] || type || "Lainnya";
}

function paymentGatewayLabel(provider) {
  const labels = {
    manual: "Manual / Offline",
    xendit: "Xendit",
    midtrans: "Midtrans"
  };
  return labels[provider] || "Manual / Offline";
}

function cardModeLabel(method) {
  if (method.type === "card") return `Online Gateway (${paymentGatewayLabel(state.settings.paymentGateway?.provider)})`;
  if (method.type === "edc") return method.edcMode === "online" ? "Online Integrated Device" : "Offline / Manual EDC";
  return "";
}

function qrisModeLabel(method) {
  if (method.type !== "qris") return "";
  return method.qrisMode === "offline" ? "QRIS Static (Upload Gambar)" : `QRIS Dinamis (${paymentGatewayLabel(state.settings.paymentGateway?.provider)})`;
}

function edcConnectorLabel(method) {
  if (method.type !== "edc") return "";
  const mode = method.edcMode === "online" ? "Integrated Device API" : "Manual EDC Kasir";
  return `${mode}`;
}

function feePayerLabel(method) {
  if (!Number(method.feeRate || 0)) return "-";
  return method.feePayer === "customer" ? "Customer" : "Merchant";
}

function renderDiningTables() {
  const tables = sortedDiningTables();
  byId("dining-table-table").innerHTML = tables.length ? tables.map((table) => `
    <tr>
      <td>${table.sort || "-"}</td>
      <td><strong>${table.name}</strong></td>
      <td>${table.area || "-"}</td>
      <td>${formatQty(table.capacity || 1)} pax</td>
      <td>${statusPill(table.status)}</td>
      <td><div class="row-actions"><button class="ghost-button compact-button" data-edit-dining-table="${table.id}" data-permission="settings.tables:update" type="button">Edit</button><button class="ghost-button compact-button" data-delete-dining-table="${table.id}" data-permission="settings.tables:delete" type="button">${isActiveStatus(table.status) ? "Nonaktifkan" : "Aktifkan"}</button></div></td>
    </tr>
  `).join("") : `<tr><td colspan="6">Belum ada meja.</td></tr>`;

  byId("table-layout-preview").innerHTML = tables.length ? tables.map((table) => `
    <article class="${isActiveStatus(table.status) ? "active" : "inactive"}">
      <strong>${table.name}</strong>
      <span>${table.area || "-"} · ${formatQty(table.capacity || 1)} pax</span>
    </article>
  `).join("") : `<p class="empty-state">Layout meja belum dibuat.</p>`;
}

function renderPaymentMethods() {
  const methods = sortedPaymentMethods();
  byId("payment-method-table").innerHTML = methods.length ? methods.map((method) => `
    <tr>
      <td>${method.sort || "-"}</td>
      <td><strong>${method.name}</strong><br><small style="color:#4f46e5; font-weight:600;">${(method.isAvailablePos ?? true) && (method.isAvailableOnline ?? true) ? "POS & Online" : (method.isAvailablePos ?? true) ? "Hanya POS" : (method.isAvailableOnline ?? true) ? "Hanya Online" : "Non-aktif Kanal"}</small></td>
      <td>${paymentTypeLabel(method.type)}</td>
      <td>${method.channelCode || "-"}${method.terminalId ? `<br><small>${method.terminalId}</small>` : ""}${cardModeLabel(method) ? `<br><small>${cardModeLabel(method)}</small>` : ""}${qrisModeLabel(method) ? `<br><small>${qrisModeLabel(method)}</small>` : ""}${edcConnectorLabel(method) ? `<br><small>${edcConnectorLabel(method)}</small>` : ""}</td>
      <td>${formatQty(Number(method.feeRate || 0))}%<br><small>${feePayerLabel(method)}</small></td>
      <td>${method.account || "-"}</td>
      <td>${statusPill(method.status)}</td>
      <td><div class="row-actions"><button class="ghost-button compact-button" data-edit-payment-method="${method.id}" data-permission="settings.payment:update" type="button">Edit</button><button class="ghost-button compact-button" data-delete-payment-method="${method.id}" data-permission="settings.payment:delete" type="button">${isActiveStatus(method.status) ? "Nonaktifkan" : "Aktifkan"}</button></div>${method.isDefault ? `<small>Default outlet</small>` : ""}</td>
    </tr>
  `).join("") : `<tr><td colspan="8">Belum ada metode bayar.</td></tr>`;
}

function renderPaymentGateway() {
  const gateway = state.settings.paymentGateway || {};
  byId("payment-gateway-provider").value = gateway.provider || "manual";
  byId("payment-gateway-mode").value = gateway.mode || "sandbox";
  byId("payment-gateway-timeout").value = gateway.timeout || 15;
  byId("payment-gateway-xendit-secret").value = "";
  byId("payment-gateway-midtrans-secret").value = "";
  const xendit = gateway.xenditSecretSet ? "Xendit key tersimpan" : "Xendit key belum diset";
  const midtrans = gateway.midtransServerKeySet ? "Midtrans key tersimpan" : "Midtrans key belum diset";
  setText("payment-gateway-status", `${paymentGatewayLabel(gateway.provider || "manual")} aktif. ${xendit}. ${midtrans}.`);
  syncGatewayFields();
}

function renderPackagingRules() {
  const rules = (state.settings.packagingRules || []).slice().sort((a, b) => a.minQty - b.minQty);
  byId("packaging-rule-table").innerHTML = rules.length ? rules.map((rule) => `
    <tr>
      <td><strong>${rule.minQty === rule.maxQty ? rule.minQty : `${rule.minQty} - ${rule.maxQty}`} item pesanan</strong><br>${statusPill(rule.status || COMMON_STATUS.ACTIVE)}</td>
      <td>${rule.items.map((item, index) => {
        const ingredient = state.ingredients.find((entry) => entry.id === item.ingredientId);
        return `<span class="packaging-rule-chip">Item ${index + 1}: ${item.qty}x ${ingredient?.name || "Kemasan terhapus"} · Harga ${money(item.price || 0)}</span>`;
      }).join("")}${rule.fallbackItems?.length ? `<br><small>Paket Pengganti: ${rule.fallbackItems.map((item) => `${item.qty}x ${state.ingredients.find((entry) => entry.id === item.ingredientId)?.name || "Kemasan terhapus"} · Harga ${money(item.price || 0)}`).join(", ")}</small>` : ""}</td>
      <td><div class="row-actions"><button class="ghost-button compact-button" data-edit-packaging-rule="${rule.id}" data-permission="settings.packaging:update" type="button">Edit</button><button class="ghost-button compact-button" data-delete-packaging-rule="${rule.id}" data-permission="settings.packaging:delete" type="button">${isInactiveStatus(rule.status) ? "Aktifkan" : "Nonaktifkan"}</button></div></td>
    </tr>
  `).join("") : `<tr><td colspan="3">Belum ada packaging rule.</td></tr>`;
}

function renderCompany() {
  const company = activeCompany();
  byId("company-name").value = company.name || "";
  byId("company-route-slug").value = company.routeSlug || slugify(company.name || "");
  setLogoValue("company-logo-url", "company-logo-preview", company.logoUrl || "", (company.name || "IF").slice(0, 2).toUpperCase());
  byId("company-theme-color").value = company.themeColor || "#6e3a16";
  byId("company-default-outlet").innerHTML = activeOutlets().map((outlet) => `<option value="${outlet.id}">${outlet.name}</option>`).join("");
  const current = state.outlets.find((outlet) => outlet.name === state.settings.outletName)?.id || activeOutlets()[0]?.id || "";
  byId("company-default-outlet").value = current;
}

function fillPackagingRuleOptions() {
  const packagingIngredients = state.ingredients.filter((item) => !isInactiveStatus(item.status) && String(item.category || item.templateCategory || "").toLowerCase() === "packaging");
  return packagingIngredients;
}

function syncPackagingNewIngredientPanel() {
  const selected = [...document.querySelectorAll("[data-packaging-ingredient]")].some((select) => select.value === "__new_packaging");
  byId("packaging-new-ingredient-panel").hidden = !selected;
}

function packagingHppReference(item) {
  const unitCost = Number(ingredientUnitCost(state, item) || 0);
  if (unitCost > 0) return unitCost;
  return Number(item.standardCost || item.avgCost || 0);
}

function packagingOptionMarkup(includeEmpty = false) {
  const packagingIngredients = fillPackagingRuleOptions();
  const costingLabel = costingMethodLabel(state);
  const options = packagingIngredients.map((item) => `<option value="${item.id}">${item.name} · stok ${formatQty(item.stock)} ${item.unit} · HPP ${costingLabel} ${money(packagingHppReference(item))}/${item.unit}</option>`).join("");
  return `${includeEmpty ? `<option value="">Tidak ada</option>` : ""}${options}<option value="__new_packaging">+ Buat bahan packaging baru</option>`;
}

function packagingLineMarkup(line = {}, index = 0, type = "item") {
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

function renderPackagingRuleLines(items = [], fallbackItems = []) {
  const normalItems = items.length ? items : [{ qty: 1, price: 0 }];
  byId("packaging-rule-items").innerHTML = normalItems.map((line, index) => packagingLineMarkup(line, index, "item")).join("");
  byId("packaging-rule-fallbacks").innerHTML = fallbackItems.map((line, index) => packagingLineMarkup(line, index, "fallback")).join("");
  byId("packaging-rule-items").querySelectorAll("[data-packaging-line]").forEach((row, index) => {
    row.querySelector("[data-packaging-ingredient]").value = normalItems[index]?.ingredientId || fillPackagingRuleOptions()[0]?.id || "";
  });
  byId("packaging-rule-fallbacks").querySelectorAll("[data-packaging-line]").forEach((row, index) => {
    row.querySelector("[data-packaging-ingredient]").value = fallbackItems[index]?.ingredientId || "";
  });
  syncPackagingNewIngredientPanel();
}

function readPackagingLines(containerId, requireOne = false, allowNewPlaceholder = false) {
  const rows = [...byId(containerId).querySelectorAll("[data-packaging-line]")];
  const lines = rows.map((row) => ({
    ingredientId: row.querySelector("[data-packaging-ingredient]").value,
    qty: Number(row.querySelector("[data-packaging-qty]").value),
    price: Number(row.querySelector("[data-packaging-price]").value)
  })).filter((line) => line.ingredientId && line.qty > 0);
  if (!allowNewPlaceholder && lines.some((line) => line.ingredientId === "__new_packaging")) {
    throw new Error("Buat bahan packaging baru terlebih dahulu sebelum menyimpan rule.");
  }
  if (requireOne && !lines.length) {
    throw new Error("Isi minimal satu item kemasan untuk rule.");
  }
  return lines;
}

function createPackagingIngredientInline() {
  const targetSelect = [...document.querySelectorAll("[data-packaging-ingredient]")].find((select) => select.value === "__new_packaging")
    || byId("packaging-rule-items").querySelector("[data-packaging-ingredient]");
  const name = byId("packaging-new-ingredient-name").value.trim();
  const unit = byId("packaging-new-ingredient-unit").value.trim() || "pcs";
  const standardCost = Number(byId("packaging-new-ingredient-cost").value || 0);
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
    minStock: Number(byId("packaging-new-ingredient-min-stock").value || 0),
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
  if (created?.id) {
    const targetType = targetSelect.closest("[data-packaging-line]")?.dataset.packagingLine || "item";
    const targetIndex = [...targetSelect.closest(`#${targetType === "fallback" ? "packaging-rule-fallbacks" : "packaging-rule-items"}`).querySelectorAll("[data-packaging-line]")].indexOf(targetSelect.closest("[data-packaging-line]"));
    if (targetType === "fallback") currentFallbacks[targetIndex] = { ingredientId: created.id, qty: currentFallbacks[targetIndex]?.qty || 1, price: standardCost };
    else currentItems[targetIndex] = { ingredientId: created.id, qty: currentItems[targetIndex]?.qty || 1, price: standardCost };
    renderPackagingRuleLines(currentItems, currentFallbacks);
  }
  byId("packaging-new-ingredient-name").value = "";
  byId("packaging-new-ingredient-cost").value = 0;
  byId("packaging-new-ingredient-min-stock").value = 0;
  showFeedback("packaging-rule-feedback", "Bahan packaging baru dibuat dan dipilih di rule.");
}

function openModal(id) {
  const backdrop = document.querySelector("[data-modal-backdrop]");
  const modal = byId(id);
  backdrop.hidden = false;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  const firstField = modal.querySelector("input, select, button");
  if (firstField) setTimeout(() => firstField.focus(), 80);
}

function closeModal() {
  const backdrop = document.querySelector("[data-modal-backdrop]");
  backdrop.hidden = true;
  backdrop.querySelectorAll(".modal-dialog").forEach((modal) => {
    modal.hidden = true;
  });
  document.body.classList.remove("modal-open");
}

function updateCostingPreview() {
  const descriptions = {
    average: "Average Cost menghitung HPP dari harga rata-rata tertimbang setiap pembelian.",
    fifo: "FIFO memakai lot bahan paling lama terlebih dahulu untuk estimasi HPP dan valuation.",
    standard: "Standard Cost memakai biaya standar per bahan agar margin lebih stabil untuk budgeting."
  };
  setText("costing-preview", descriptions[byId("costing-method").value]);
}

function updateTableFlowPreview() {
  const descriptions = {
    assigned_pay_later: "Mode restoran: kasir/server membuka table, order tambahan masuk ke bill yang sama, dan settlement dilakukan saat table ditutup.",
    free_seating_pay_first: "Mode duduk bebas: pelanggan memilih tempat sendiri, transaksi dibayar di muka seperti quick service."
  };
  setText("table-flow-preview", descriptions[byId("table-service-mode").value]);
}

function openPackagingRule(rule = null) {
  const packagingIngredients = fillPackagingRuleOptions();
  const defaultPackagingId = packagingIngredients[0]?.id || "";
  byId("packaging-rule-id").value = rule?.id || "";
  byId("packaging-rule-min").value = rule?.minQty || 1;
  byId("packaging-rule-max").value = rule?.maxQty || 1;
  renderPackagingRuleLines(rule?.items?.length ? rule.items : [{ ingredientId: defaultPackagingId, qty: 1, price: 0 }], rule?.fallbackItems || []);
  setText("packaging-rule-feedback", packagingIngredients.length ? "" : "Buat bahan outlet dengan kategori Packaging terlebih dahulu agar bisa dipilih sebagai kemasan.");
  openModal("packaging-rule-modal");
}

function savePackagingRule(event) {
  event.preventDefault();
  const id = byId("packaging-rule-id").value;
  if (!canUsePermission("settings.packaging", id ? "update" : "create", state, session)) {
    showFeedback("packaging-rule-feedback", "Anda tidak punya akses untuk menyimpan packaging rule.");
    return;
  }
  const minQty = Number(byId("packaging-rule-min").value);
  const maxQty = Number(byId("packaging-rule-max").value);
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
  const overlap = (state.settings.packagingRules || []).some((rule) => !isInactiveStatus(rule.status) && rule.id !== id && minQty <= rule.maxQty && maxQty >= rule.minQty);
  if (overlap) {
    showFeedback("packaging-rule-feedback", "Rentang jumlah bertabrakan dengan rule lain.");
    return;
  }
  const existing = state.settings.packagingRules.find((rule) => rule.id === id);
  const status = existing?.status || COMMON_STATUS.ACTIVE;
  if (!(id ? putSetting(`/api/packaging-rule/${id}`, { minQty, maxQty, items, fallbackItems, status }) : postSetting("/api/packaging-rule", { minQty, maxQty, items, fallbackItems, status }))) {
    showFeedback("packaging-rule-feedback", "Gagal menyimpan packaging rule ke database.");
    return;
  }
  closeModal();
  renderSettings();
  showAlert("Packaging rule tersimpan.");
}

function openDiningTable(table = null) {
  const nextSort = Math.max(0, ...sortedDiningTables().map((item) => Number(item.sort || 0))) + 1;
  byId("dining-table-id").value = table?.id || "";
  byId("dining-table-name").value = table?.name || "";
  byId("dining-table-area").value = table?.area || "Indoor";
  byId("dining-table-capacity").value = table?.capacity || 2;
  byId("dining-table-sort").value = table?.sort || nextSort;
  byId("dining-table-status").value = table?.status || COMMON_STATUS.ACTIVE;
  setText("dining-table-feedback", "");
  openModal("dining-table-modal");
}

function saveDiningTable(event) {
  event.preventDefault();
  const id = byId("dining-table-id").value;
  if (!canUsePermission("settings.tables", id ? "update" : "create", state, session)) {
    showFeedback("dining-table-feedback", "Anda tidak punya akses untuk menyimpan meja.");
    return;
  }
  const name = byId("dining-table-name").value.trim();
  const duplicate = (state.settings.diningTables || []).some((table) => table.id !== id && table.name.toLowerCase() === name.toLowerCase());
  if (duplicate) {
    showFeedback("dining-table-feedback", "Nama meja sudah digunakan.");
    return;
  }
  const payload = {
    id,
    name,
    area: byId("dining-table-area").value.trim(),
    capacity: Number(byId("dining-table-capacity").value),
    sort: Number(byId("dining-table-sort").value),
    status: byId("dining-table-status").value
  };
  if (!(id ? putSetting(`/api/dining-table/${id}`, payload) : postSetting("/api/dining-table", payload))) {
    showFeedback("dining-table-feedback", "Gagal menyimpan meja ke database.");
    return;
  }
  closeModal();
  renderSettings();
  showAlert(`Meja ${name} tersimpan.`);
}

function openPaymentMethod(method = null) {
  const nextSort = Math.max(0, ...sortedPaymentMethods().map((item) => Number(item.sort || 0))) + 1;
  if (byId("payment-method-id")) byId("payment-method-id").value = method?.id || "";
  if (byId("payment-method-name")) byId("payment-method-name").value = method?.name || "";
  if (byId("payment-method-type")) byId("payment-method-type").value = method?.type || "cash";
  if (byId("payment-qris-mode")) byId("payment-qris-mode").value = method?.qrisMode || (method?.gatewayProvider === "manual" ? "offline" : "online");
  setQrisImage(method?.qrisImageUrl || "");
  if (byId("payment-qris-image-file")) byId("payment-qris-image-file").value = "";
  if (byId("payment-card-mode")) byId("payment-card-mode").value = method?.cardMode || (method?.gatewayProvider !== "manual" ? "online" : "offline");
  if (byId("payment-card-acquirer")) byId("payment-card-acquirer").value = ["BCA", "BRI", "BNI", "Mandiri"].includes(method?.channelCode) ? method.channelCode : "BCA";
  if (byId("payment-method-channel")) byId("payment-method-channel").value = method?.channelCode || "";
  if (byId("payment-method-terminal")) byId("payment-method-terminal").value = method?.terminalId || "";
  if (byId("payment-edc-mode")) byId("payment-edc-mode").value = method?.edcMode || "manual";
  if (byId("payment-merchant-id")) byId("payment-merchant-id").value = method?.merchantId || "";
  if (byId("payment-terminal-serial")) byId("payment-terminal-serial").value = method?.terminalSerial || "";
  if (byId("payment-connector-status")) byId("payment-connector-status").value = method?.connectorStatus || CONNECTOR_STATUS.NOT_CONFIGURED;
  if (byId("payment-method-fee")) byId("payment-method-fee").value = method?.feeRate ?? 0;
  if (byId("payment-method-fee-payer")) byId("payment-method-fee-payer").value = method?.feePayer || "merchant";
  if (byId("payment-method-account")) byId("payment-method-account").value = method?.account || "";
  if (byId("payment-method-sort")) byId("payment-method-sort").value = method?.sort || nextSort;
  if (byId("payment-method-available-pos")) byId("payment-method-available-pos").checked = method?.isAvailablePos ?? true;
  if (byId("payment-method-available-online")) byId("payment-method-available-online").checked = method?.isAvailableOnline ?? true;
  if (byId("payment-method-status")) byId("payment-method-status").value = method?.status || COMMON_STATUS.ACTIVE;
  setText("payment-method-feedback", "");
  syncPaymentMethodFields();
  openModal("payment-method-modal");
}

function syncPaymentMethodFields() {
  const type = byId("payment-method-type").value;
  const isQris = type === "qris";
  const isEdc = type === "edc";
  const isCard = type === "card";
  
  // Get active gateway provider configuration
  const gateway = state.settings.paymentGateway || {};
  const isManualGateway = !gateway.provider || gateway.provider === "manual";
  
  // Find online option elements in QRIS mode
  const qrisOnlineOpt = byId("payment-qris-mode")?.querySelector('option[value="online"]');
  if (qrisOnlineOpt) qrisOnlineOpt.disabled = isManualGateway;
  
  if (isManualGateway && isQris && byId("payment-qris-mode")) {
    byId("payment-qris-mode").value = "offline";
  }

  const isOfflineQris = isQris && byId("payment-qris-mode").value === "offline";
  byId("payment-qris-mode-field").hidden = !isQris;
  byId("payment-qris-image-field").hidden = !isOfflineQris;
  byId("payment-edc-mode-field").hidden = !isEdc;
  byId("payment-card-acquirer-field").hidden = !isEdc;
  byId("payment-merchant-id-field").hidden = !isEdc;
  byId("payment-terminal-serial-field").hidden = !isEdc;
  byId("payment-connector-status-field").hidden = !isEdc;

  if (isQris) {
    byId("payment-method-channel").value = "QRIS";
  } else if (isEdc) {
    byId("payment-method-channel").value = byId("payment-card-acquirer").value;
  } else if (isCard) {
    byId("payment-method-channel").value = "CARDS";
  }
}

function savePaymentMethod(event) {
  event.preventDefault();
  const id = byId("payment-method-id").value;
  if (!canUsePermission("settings.payment", id ? "update" : "create", state, session)) {
    showFeedback("payment-method-feedback", "Anda tidak punya akses untuk menyimpan metode bayar.");
    return;
  }
  const name = byId("payment-method-name").value.trim();
  const duplicate = (state.settings.paymentMethods || []).some((method) => method.id !== id && method.name.toLowerCase() === name.toLowerCase());
  if (duplicate) {
    showFeedback("payment-method-feedback", "Nama metode bayar sudah digunakan.");
    return;
  }
  const type = byId("payment-method-type").value;
  const qrisMode = byId("payment-qris-mode").value;
  const isOnlinePayment = (type === "qris" && qrisMode === "online") || type === "card";
  const payload = {
    id,
    name,
    type,
    gatewayProvider: isOnlinePayment ? "online" : "manual",
    qrisMode,
    qrisImageUrl: byId("payment-qris-image-url").value.trim(),
    channelCode: byId("payment-method-channel").value.trim(),
    terminalId: byId("payment-method-terminal").value.trim(),
    edcMode: byId("payment-edc-mode").value,
    merchantId: byId("payment-merchant-id").value.trim(),
    terminalSerial: byId("payment-terminal-serial").value.trim(),
    connectorStatus: byId("payment-connector-status").value,
    feeRate: Number(byId("payment-method-fee").value || 0),
    feePayer: byId("payment-method-fee-payer").value,
    account: byId("payment-method-account").value.trim(),
    sort: Number(byId("payment-method-sort").value),
    isAvailablePos: byId("payment-method-available-pos") ? byId("payment-method-available-pos").checked : true,
    isAvailableOnline: byId("payment-method-available-online") ? byId("payment-method-available-online").checked : true,
    status: byId("payment-method-status").value
  };
  if (payload.type === "qris" && payload.qrisMode === "offline" && !payload.qrisImageUrl) {
    showFeedback("payment-method-feedback", "Upload gambar QRIS Static terlebih dahulu.");
    return;
  }
  if (isOnlinePayment && !["xendit", "midtrans"].includes(state.settings.paymentGateway?.provider)) {
    showFeedback("payment-method-feedback", "Pilih Xendit atau Midtrans pada Pengaturan Gateway terlebih dahulu.");
    return;
  }
  if (!(id ? putSetting(`/api/payment-method/${id}`, payload) : postSetting("/api/payment-method", payload))) {
    showFeedback("payment-method-feedback", "Gagal menyimpan metode bayar ke database.");
    return;
  }
  closeModal();
  renderSettings();
  showAlert(`Metode bayar ${name} tersimpan.`);
}

function savePaymentGateway(event) {
  event.preventDefault();
  if (!canUsePermission("settings.payment", "update", state, session)) {
    showFeedback("payment-gateway-feedback", "Anda tidak punya akses untuk menyimpan gateway pembayaran.");
    return;
  }
  const provider = byId("payment-gateway-provider").value;
  state.settings.paymentGateway = {
    ...(state.settings.paymentGateway || {}),
    provider,
    mode: byId("payment-gateway-mode").value,
    timeout: Number(byId("payment-gateway-timeout").value || 15),
    xenditSecretKey: provider === "xendit" ? byId("payment-gateway-xendit-secret").value.trim() : "",
    midtransServerKey: provider === "midtrans" ? byId("payment-gateway-midtrans-secret").value.trim() : ""
  };
  if (putSetting("/api/setting", state.settings)) {
    renderSettings();
    showAlert("Payment gateway berhasil disimpan.");
  } else {
    showFeedback("payment-gateway-feedback", "Gagal menyimpan payment gateway ke database.");
  }
}

function syncGatewayFields() {
  const provider = byId("payment-gateway-provider").value;
  const isGateway = provider !== "manual";
  byId("payment-gateway-mode-field").hidden = !isGateway;
  byId("payment-gateway-timeout-field").hidden = !isGateway;
  byId("payment-gateway-xendit-secret-field").hidden = provider !== "xendit";
  byId("payment-gateway-midtrans-secret-field").hidden = provider !== "midtrans";
}

function toggleSecret(inputId) {
  const input = byId(inputId);
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
}

function preventSecretCopy(event) {
  event.preventDefault();
  showFeedback("payment-gateway-feedback", "Secret key tidak bisa dicopy dari form.");
}

function searchPrinters() {
  printerDropdownMode = "browse";
  renderPrinterDropdown({ loading: true });
  setText("setting-feedback", "Mencari printer yang tersedia...");
  const result = apiGet("/api/printer");
  printerCache = result?.data?.items || [];
  renderPrinterDropdown();
  showFeedback("setting-feedback", printerCache.length ? `${printerCache.length} printer ditemukan. Pilih dari dropdown printer.` : "Printer belum ditemukan oleh server. Isi manual atau kosongkan jika tidak memakai printer struk.");
}

function renderPrinterDropdown(options = {}) {
  const dropdown = byId("printer-dropdown");
  const currentValue = byId("setting-printer-name").value.trim();
  const keyword = printerDropdownMode === "search" ? currentValue.toLowerCase() : "";
  const printers = printerCache.filter((printer) => !keyword || printer.name.toLowerCase().includes(keyword) || String(printer.target || "").toLowerCase().includes(keyword));
  const currentExists = !currentValue || printers.some((printer) => printer.name === currentValue) || printerCache.some((printer) => printer.name === currentValue);
  dropdown.hidden = false;
  dropdown.innerHTML = `
    ${options.loading ? `<div class="printer-empty">Mencari printer yang tersedia...</div>` : ""}
    <button class="printer-option ${currentValue ? "" : "active"}" data-printer-name="" type="button">
      <strong>Tidak memakai printer</strong>
      <small>POS tidak akan print struk otomatis.</small>
    </button>
    ${currentValue && !currentExists ? `
      <button class="printer-option active" data-printer-name="${currentValue}" type="button">
        <strong>${currentValue}</strong>
        <small>Printer tersimpan saat ini. Tidak muncul dari hasil scan terbaru.</small>
      </button>
    ` : ""}
    ${!options.loading && printers.length ? printers.map((printer) => `
      <button class="printer-option ${printer.name === currentValue ? "active" : ""}" data-printer-name="${printer.name}" type="button">
        <strong>${printer.name}</strong>
        <small>${printer.source || "Printer"}${printer.target ? ` · ${printer.target}` : ""}</small>
      </button>
    `).join("") : !options.loading ? `<div class="printer-empty">Printer tidak ditemukan. Isi manual atau kosongkan jika tidak memakai printer struk.</div>` : ""}
  `;
}

function openPrinterDropdown() {
  searchPrinters();
}

function closePrinterDropdown() {
  const dropdown = byId("printer-dropdown");
  if (dropdown) dropdown.hidden = true;
}

function renderSettings() {
  renderCompany();
  renderBookContentSettings();
  byId("costing-method").value = state.settings.costingMethod;
  byId("setting-outlet-name").value = state.settings.outletName;
  byId("setting-tax-rate").value = state.settings.taxRate;
  byId("setting-dine-in-service-rate").value = state.settings.dineInServiceRate;
  byId("setting-printer-name").value = state.settings.printerName;
  const channels = state.settings.orderChannels || { dineIn: false, takeAway: true, delivery: false };
  byId("order-channel-dine-in").checked = Boolean(channels.dineIn);
  byId("order-channel-take-away").checked = channels.takeAway !== false;
  byId("order-channel-delivery").checked = Boolean(channels.delivery);
  byId("table-service-mode").value = state.settings.tableServiceMode || "free_seating_pay_first";
  updateCostingPreview();
  updateTableFlowPreview();
  renderPaymentGateway();
  renderDiningTables();
  renderPaymentMethods();
  renderPackagingRules();
  enhanceAllDataTables();
  applyPermissionControls(document, state, session);
  setActiveSettingTab(activeSettingTab);
}

function renderBookContentSettings() {
  const content = { ...defaultBookContent(), ...(state.settings.publicOrderContent || {}) };
  const map = {
    "book-cover-subtitle": "coverSubtitle",
    "book-cover-description": "coverDescription",
    "book-outlet-title": "outletTitle",
    "book-service-title": "serviceTitle",
    "book-service-description": "serviceDescription",
    "book-table-title": "tableTitle",
    "book-table-description": "tableDescription",
    "book-menu-title": "menuTitle",
    "book-menu-description": "menuDescription",
    "book-cart-title": "cartTitle",
    "book-cart-description": "cartDescription",
    "book-customer-title": "customerTitle",
    "book-customer-description": "customerDescription",
    "book-receipt-title": "receiptTitle",
    "book-receipt-description": "receiptDescription",
    "book-back-subtitle": "backSubtitle",
    "book-back-description": "backDescription",
    "book-back-button": "backButton"
  };
  Object.entries(map).forEach(([id, key]) => {
    const field = byId(id);
    if (field) field.value = content[key] || "";
  });
}

document.addEventListener("click", (event) => {
  const tabButton = event.target.closest("[data-setting-tab]");
  if (tabButton) setActiveSettingTab(tabButton.dataset.settingTab);

  if (event.target.closest("[data-new-packaging-rule]") && canUsePermission("settings.packaging", "create", state, session)) openPackagingRule();
  const editPackagingRule = event.target.closest("[data-edit-packaging-rule]");
  if (editPackagingRule && canUsePermission("settings.packaging", "update", state, session)) openPackagingRule(state.settings.packagingRules.find((rule) => rule.id === editPackagingRule.dataset.editPackagingRule));
  const deletePackagingRule = event.target.closest("[data-delete-packaging-rule]");
  if (deletePackagingRule && canUsePermission("settings.packaging", "delete", state, session)) {
    const rule = state.settings.packagingRules.find((item) => item.id === deletePackagingRule.dataset.deletePackagingRule);
    if (rule && isInactiveStatus(rule.status)) {
      const overlap = (state.settings.packagingRules || []).some((item) => !isInactiveStatus(item.status) && item.id !== rule.id && rule.minQty <= item.maxQty && rule.maxQty >= item.minQty);
      if (overlap) {
        showFeedback("setting-feedback", "Rule tidak bisa diaktifkan karena rentangnya bertabrakan dengan rule aktif lain.");
        return;
      }
      if (!putSetting(`/api/packaging-rule/${rule.id}`, { ...rule, status: COMMON_STATUS.ACTIVE })) showFeedback("setting-feedback", "Gagal mengaktifkan rule.");
    } else if (rule && !deleteSetting(`/api/packaging-rule/${rule.id}`, {})) {
      showFeedback("setting-feedback", "Gagal menonaktifkan rule.");
    }
    renderSettings();
  }
  if (event.target.closest("[data-add-packaging-item]")) {
    const items = readPackagingLines("packaging-rule-items", false, true);
    const fallbackItems = readPackagingLines("packaging-rule-fallbacks", false, true);
    items.push({ ingredientId: fillPackagingRuleOptions()[0]?.id || "", qty: 1, price: 0 });
    renderPackagingRuleLines(items, fallbackItems);
  }
  if (event.target.closest("[data-add-packaging-fallback]")) {
    const items = readPackagingLines("packaging-rule-items", false, true);
    const fallbackItems = readPackagingLines("packaging-rule-fallbacks", false, true);
    fallbackItems.push({ ingredientId: "", qty: 1, price: 0 });
    renderPackagingRuleLines(items, fallbackItems);
  }
  const removePackagingLine = event.target.closest("[data-remove-packaging-line]");
  if (removePackagingLine) {
    const row = removePackagingLine.closest("[data-packaging-line]");
    const type = row?.dataset.packagingLine || "item";
    const container = type === "fallback" ? "packaging-rule-fallbacks" : "packaging-rule-items";
    const index = [...byId(container).querySelectorAll("[data-packaging-line]")].indexOf(row);
    const items = readPackagingLines("packaging-rule-items", false, true);
    const fallbackItems = readPackagingLines("packaging-rule-fallbacks", false, true);
    if (type === "fallback") fallbackItems.splice(index, 1);
    else if (items.length > 1) items.splice(index, 1);
    renderPackagingRuleLines(items, fallbackItems);
  }
  if (event.target.closest("[data-create-packaging-ingredient]")) {
    if (!canUsePermission("inventory.ingredients", "create", state, session)) {
      showFeedback("packaging-rule-feedback", "Anda tidak punya akses untuk membuat bahan outlet.");
      return;
    }
    createPackagingIngredientInline();
  }

  if (event.target.closest("[data-new-dining-table]") && canUsePermission("settings.tables", "create", state, session)) openDiningTable();
  const editDiningTable = event.target.closest("[data-edit-dining-table]");
  if (editDiningTable && canUsePermission("settings.tables", "update", state, session)) openDiningTable(state.settings.diningTables.find((table) => table.id === editDiningTable.dataset.editDiningTable));
  const deleteDiningTable = event.target.closest("[data-delete-dining-table]");
  if (deleteDiningTable && canUsePermission("settings.tables", "delete", state, session)) {
    const table = state.settings.diningTables.find((item) => item.id === deleteDiningTable.dataset.deleteDiningTable);
    if (table && !(isInactiveStatus(table.status) ? putSetting(`/api/dining-table/${table.id}`, { ...table, status: COMMON_STATUS.ACTIVE }) : deleteSetting(`/api/dining-table/${table.id}`, {}))) showFeedback("setting-feedback", "Gagal mengubah status meja.");
    renderSettings();
  }

  if (event.target.closest("[data-new-payment-method]") && canUsePermission("settings.payment", "create", state, session)) openPaymentMethod();
  const editPaymentMethod = event.target.closest("[data-edit-payment-method]");
  if (editPaymentMethod && canUsePermission("settings.payment", "update", state, session)) openPaymentMethod(state.settings.paymentMethods.find((method) => method.id === editPaymentMethod.dataset.editPaymentMethod));
  const deletePaymentMethod = event.target.closest("[data-delete-payment-method]");
  if (deletePaymentMethod && canUsePermission("settings.payment", "delete", state, session)) {
    const method = state.settings.paymentMethods.find((item) => item.id === deletePaymentMethod.dataset.deletePaymentMethod);
    if (method && !(isInactiveStatus(method.status) ? putSetting(`/api/payment-method/${method.id}`, { ...method, status: COMMON_STATUS.ACTIVE }) : deleteSetting(`/api/payment-method/${method.id}`, {}))) showFeedback("setting-feedback", "Gagal mengubah status metode bayar.");
    renderSettings();
  }

  if (event.target.closest("[data-close-modal]")) closeModal();
  if (event.target.matches("[data-modal-backdrop]")) closeModal();
  const toggleSecretButton = event.target.closest("[data-toggle-secret]");
  if (toggleSecretButton) toggleSecret(toggleSecretButton.dataset.toggleSecret);
  const printerOption = event.target.closest("[data-printer-name]");
  if (printerOption) {
    byId("setting-printer-name").value = printerOption.dataset.printerName || "";
    closePrinterDropdown();
  } else if (!event.target.closest(".printer-picker")) {
    closePrinterDropdown();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

document.addEventListener("change", (event) => {
  if (event.target.closest("[data-packaging-ingredient]")) syncPackagingNewIngredientPanel();
});

byId("packaging-rule-form").addEventListener("submit", savePackagingRule);
byId("dining-table-form").addEventListener("submit", saveDiningTable);
byId("payment-method-form").addEventListener("submit", savePaymentMethod);
byId("payment-gateway-form").addEventListener("submit", savePaymentGateway);
byId("payment-gateway-provider").addEventListener("change", syncGatewayFields);
["payment-gateway-xendit-secret", "payment-gateway-midtrans-secret"].forEach((id) => {
  byId(id).addEventListener("copy", preventSecretCopy);
  byId(id).addEventListener("cut", preventSecretCopy);
});
byId("setting-printer-name").addEventListener("focus", openPrinterDropdown);
byId("setting-printer-name").addEventListener("click", openPrinterDropdown);
byId("setting-printer-name").addEventListener("pointerdown", openPrinterDropdown);
byId("setting-printer-name").addEventListener("input", () => {
  printerDropdownMode = "search";
  renderPrinterDropdown();
});
byId("company-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canUsePermission("company.branding", "update", state, session)) {
    showFeedback("company-feedback", "Anda tidak punya akses untuk mengubah branding perusahaan.");
    return;
  }
  const company = activeCompany();
  const payload = {
    id: company.id,
    name: byId("company-name").value.trim(),
    routeSlug: slugify(byId("company-route-slug").value || byId("company-name").value),
    logoUrl: byId("company-logo-url").value.trim(),
    themeColor: byId("company-theme-color").value,
    status: company.status,
    adminName: company.adminName,
    adminEmail: company.adminEmail
  };
  const result = apiPut(`/api/company/${payload.id}`, payload);
  if (!result?.ok) {
    showFeedback("company-feedback", result?.message || "Gagal menyimpan company setting.");
    return;
  }
  refreshSettingsData();
  renderSettings();
  document.documentElement.style.setProperty("--brand", payload.themeColor);
  const brandMark = document.querySelector(".brand-mark");
  const brandTitle = document.querySelector(".brand h1");
  if (brandMark) brandMark.innerHTML = payload.logoUrl ? `<img src="${payload.logoUrl}" alt="${payload.name}">` : payload.name.slice(0, 2).toUpperCase();
  if (brandTitle) brandTitle.textContent = payload.name;
  showAlert("Company setting berhasil disimpan ke database.");
});
byId("costing-method").addEventListener("change", () => {
  if (!canUsePermission("settings.costing", "update", state, session)) {
    byId("costing-method").value = state.settings.costingMethod;
    showFeedback("setting-feedback", "Anda tidak punya akses untuk mengubah metode costing.");
    return;
  }
  state.settings.costingMethod = byId("costing-method").value;
  putSetting("/api/setting", state.settings);
  updateCostingPreview();
});
byId("table-service-mode").addEventListener("change", () => {
  if (!canUsePermission("settings.tables", "update", state, session)) {
    byId("table-service-mode").value = state.settings.tableServiceMode || "free_seating_pay_first";
    showFeedback("setting-feedback", "Anda tidak punya akses untuk mengubah flow table.");
    return;
  }
  state.settings.tableServiceMode = byId("table-service-mode").value;
  putSetting("/api/setting", state.settings);
  updateTableFlowPreview();
  showAlert("Flow Dine In berhasil diperbarui.");
});
byId("outlet-settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canUsePermission("settings.outlet", "update", state, session)) {
    showFeedback("setting-feedback", "Anda tidak punya akses untuk menyimpan pengaturan outlet.");
    return;
  }
  state.settings.outletName = byId("setting-outlet-name").value.trim();
  state.settings.taxRate = Number(byId("setting-tax-rate").value);
  state.settings.dineInServiceRate = Number(byId("setting-dine-in-service-rate").value);
  state.settings.printerName = byId("setting-printer-name").value.trim();
  state.settings.orderChannels = {
    dineIn: byId("order-channel-dine-in").checked,
    takeAway: byId("order-channel-take-away").checked,
    delivery: byId("order-channel-delivery").checked
  };
  if (!state.settings.orderChannels.dineIn && !state.settings.orderChannels.takeAway && !state.settings.orderChannels.delivery) {
    showFeedback("setting-feedback", "Minimal satu channel order harus aktif.");
    return;
  }
  if (putSetting("/api/setting", state.settings)) {
    renderSettings();
    showAlert("Pengaturan outlet berhasil disimpan ke database.");
  } else {
    showFeedback("setting-feedback", "Gagal menyimpan pengaturan outlet ke database.");
  }
});
byId("book-content-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canUsePermission("settings.outlet", "update", state, session)) {
    showFeedback("book-content-feedback", "Anda tidak punya akses untuk menyimpan content buku menu.");
    return;
  }
  state.settings.publicOrderContent = {
    coverSubtitle: byId("book-cover-subtitle").value.trim(),
    coverDescription: byId("book-cover-description").value.trim(),
    outletTitle: byId("book-outlet-title").value.trim(),
    serviceTitle: byId("book-service-title").value.trim(),
    serviceDescription: byId("book-service-description").value.trim(),
    tableTitle: byId("book-table-title").value.trim(),
    tableDescription: byId("book-table-description")?.value.trim() || defaultBookContent().tableDescription,
    menuTitle: byId("book-menu-title").value.trim(),
    menuDescription: byId("book-menu-description").value.trim(),
    cartTitle: byId("book-cart-title").value.trim(),
    cartDescription: byId("book-cart-description").value.trim(),
    customerTitle: byId("book-customer-title").value.trim(),
    customerDescription: byId("book-customer-description").value.trim(),
    receiptTitle: byId("book-receipt-title").value.trim(),
    receiptDescription: byId("book-receipt-description").value.trim(),
    backSubtitle: byId("book-back-subtitle").value.trim(),
    backDescription: byId("book-back-description").value.trim(),
    backButton: byId("book-back-button").value.trim()
  };
  if (putSetting("/api/setting", state.settings)) {
    renderSettings();
    showAlert("Content buku menu berhasil disimpan.");
  } else {
    showFeedback("book-content-feedback", "Gagal menyimpan content buku menu.");
  }
});
byId("company-name").addEventListener("input", () => {
  if (!byId("company-route-slug").value.trim()) {
    byId("company-route-slug").value = slugify(byId("company-name").value);
  }
});
byId("company-logo-file").addEventListener("change", (event) => {
  uploadLogo(event.target.files?.[0]);
});
byId("payment-method-type")?.addEventListener("change", () => {
  if (byId("payment-method-type").value === "qris" && !byId("payment-method-channel").value.trim()) byId("payment-method-channel").value = "QRIS";
  if (byId("payment-method-type").value === "card" && !byId("payment-method-channel").value.trim()) byId("payment-method-channel").value = "CARDS";
  syncPaymentMethodFields();
});
byId("payment-card-mode")?.addEventListener("change", syncPaymentMethodFields);
byId("payment-qris-mode")?.addEventListener("change", syncPaymentMethodFields);
byId("payment-qris-image-file")?.addEventListener("change", (event) => uploadQrisImage(event.target.files?.[0]));
byId("payment-card-acquirer")?.addEventListener("change", syncPaymentMethodFields);
byId("payment-edc-mode")?.addEventListener("change", syncPaymentMethodFields);

renderSettings();
