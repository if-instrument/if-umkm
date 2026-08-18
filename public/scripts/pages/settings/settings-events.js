import { state, session, defaultBookContent, setPrinterDropdownMode } from "./settings-state.js";
import { activeCompany, slugify } from "./settings-helpers.js";
import { putSetting, uploadLogo, uploadQrisImage, refreshSettingsData } from "./settings-api.js";
import {
  openModal,
  closeModal,
  renderSettings,
  setActiveSettingTab
} from "./settings-modals.js";
import {
  openPrinterDropdown,
  closePrinterDropdown,
  renderPrinterDropdown
} from "./settings-outlet.js";
import {
  savePackagingRule,
  openPackagingRule,
  readPackagingLines,
  renderPackagingRuleLines,
  fillPackagingRuleOptions,
  createPackagingIngredientInline,
  syncPackagingNewIngredientPanel
} from "./settings-packaging.js";
import {
  openDiningTable,
  saveDiningTable,
  updateTableFlowPreview
} from "./settings-tables.js";
import {
  openPaymentMethod,
  savePaymentMethod,
  savePaymentGateway,
  saveCentralMasterGateway,
  syncGatewayFields,
  syncPaymentMethodFields,
  toggleSecret,
  preventSecretCopy
} from "./settings-payments.js";
import { updateCostingPreview } from "./settings-costing.js";
import { byId, showAlert, showFeedback } from "../../dom.js";
import { COMMON_STATUS, isInactiveStatus } from "../../status-codes.js";
import { canUsePermission, apiPut } from "../../store.js";
import { applyBrandTheme } from "../../layout.js";

export function bindSettingsEvents() {
  document.addEventListener("click", (event) => {
    const tabButton = event.target.closest("[data-setting-tab]");
    if (tabButton) setActiveSettingTab(tabButton.dataset.settingTab);

    // Packaging Rules events
    if (event.target.closest("[data-new-packaging-rule]") && canUsePermission("settings.packaging", "create", state, session)) openPackagingRule();
    const editPackagingRule = event.target.closest("[data-edit-packaging-rule]");
    if (editPackagingRule && canUsePermission("settings.packaging", "update", state, session)) {
      openPackagingRule((state.settings?.packagingRules || []).find((rule) => rule.id === editPackagingRule.dataset.editPackagingRule));
    }
    const deletePackagingRule = event.target.closest("[data-delete-packaging-rule]");
    if (deletePackagingRule && canUsePermission("settings.packaging", "delete", state, session)) {
      const rule = (state.settings?.packagingRules || []).find((item) => item.id === deletePackagingRule.dataset.deletePackagingRule);
      if (rule && isInactiveStatus(rule.status)) {
        const overlap = (state.settings?.packagingRules || []).some((item) => !isInactiveStatus(item.status) && item.id !== rule.id && rule.minQty <= item.maxQty && rule.maxQty >= item.minQty);
        if (overlap) {
          showFeedback("setting-feedback", "Rule tidak bisa diaktifkan karena rentangnya bertabrakan dengan rule aktif lain.");
          return;
        }
        if (!putSetting(`/api/packaging-rule/${rule.id}`, { ...rule, status: COMMON_STATUS.ACTIVE })) showFeedback("setting-feedback", "Gagal mengaktifkan rule.");
      } else if (rule && !putSetting(`/api/packaging-rule/${rule.id}`, { ...rule, status: "inactive" })) {
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

    // Dining Tables events
    if (event.target.closest("[data-new-dining-table]") && canUsePermission("settings.tables", "create", state, session)) openDiningTable();
    const editDiningTable = event.target.closest("[data-edit-dining-table]");
    if (editDiningTable && canUsePermission("settings.tables", "update", state, session)) {
      openDiningTable((state.settings?.diningTables || []).find((table) => table.id === editDiningTable.dataset.editDiningTable));
    }
    const deleteDiningTable = event.target.closest("[data-delete-dining-table]");
    if (deleteDiningTable && canUsePermission("settings.tables", "delete", state, session)) {
      const table = (state.settings?.diningTables || []).find((item) => item.id === deleteDiningTable.dataset.deleteDiningTable);
      if (table && !(isInactiveStatus(table.status) ? putSetting(`/api/dining-table/${table.id}`, { ...table, status: COMMON_STATUS.ACTIVE }) : putSetting(`/api/dining-table/${table.id}`, { ...table, status: "inactive" }))) {
        showFeedback("setting-feedback", "Gagal mengubah status meja.");
      }
      renderSettings();
    }

    // Payment Methods events
    if (event.target.closest("[data-new-payment-method]") && canUsePermission("settings.payment", "create", state, session)) openPaymentMethod();
    const editPaymentMethod = event.target.closest("[data-edit-payment-method]");
    if (editPaymentMethod && canUsePermission("settings.payment", "update", state, session)) {
      openPaymentMethod((state.settings?.paymentMethods || []).find((method) => method.id === editPaymentMethod.dataset.editPaymentMethod));
    }
    const deletePaymentMethod = event.target.closest("[data-delete-payment-method]");
    if (deletePaymentMethod && canUsePermission("settings.payment", "delete", state, session)) {
      const method = (state.settings?.paymentMethods || []).find((item) => item.id === deletePaymentMethod.dataset.deletePaymentMethod);
      if (method && !(isInactiveStatus(method.status) ? putSetting(`/api/payment-method/${method.id}`, { ...method, status: COMMON_STATUS.ACTIVE }) : putSetting(`/api/payment-method/${method.id}`, { ...method, status: "inactive" }))) {
        showFeedback("setting-feedback", "Gagal mengubah status metode bayar.");
      }
      renderSettings();
    }

    if (event.target.closest("[data-close-modal]")) closeModal();
    if (event.target.matches("[data-modal-backdrop]")) closeModal();
    const toggleSecretButton = event.target.closest("[data-toggle-secret]");
    if (toggleSecretButton) toggleSecret(toggleSecretButton.dataset.toggleSecret);
    const printerOption = event.target.closest("[data-printer-name]");
    if (printerOption) {
      if (byId("setting-printer-name")) byId("setting-printer-name").value = printerOption.dataset.printerName || "";
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

  byId("packaging-rule-form")?.addEventListener("submit", savePackagingRule);
  byId("dining-table-form")?.addEventListener("submit", saveDiningTable);
  byId("payment-method-form")?.addEventListener("submit", savePaymentMethod);
  byId("payment-gateway-form")?.addEventListener("submit", savePaymentGateway);
  byId("payment-gateway-provider")?.addEventListener("change", syncGatewayFields);
  ["payment-gateway-xendit-secret", "payment-gateway-midtrans-secret"].forEach((id) => {
    byId(id)?.addEventListener("copy", preventSecretCopy);
    byId(id)?.addEventListener("cut", preventSecretCopy);
  });
  byId("setting-printer-name")?.addEventListener("focus", openPrinterDropdown);
  byId("setting-printer-name")?.addEventListener("click", openPrinterDropdown);
  byId("setting-printer-name")?.addEventListener("pointerdown", openPrinterDropdown);
  byId("setting-printer-name")?.addEventListener("input", () => {
    setPrinterDropdownMode("search");
    renderPrinterDropdown();
  });

  byId("company-form")?.addEventListener("submit", (event) => {
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
    if (payload.themeColor) applyBrandTheme(payload.themeColor);
    const brandMark = document.querySelector(".brand-mark");
    const brandTitle = document.querySelector(".brand h1");
    if (brandMark) brandMark.innerHTML = payload.logoUrl ? `<img src="${payload.logoUrl}" alt="${payload.name}">` : payload.name.slice(0, 2).toUpperCase();
    if (brandTitle) brandTitle.textContent = payload.name;
    showAlert("Company setting berhasil disimpan ke database.");
  });

  byId("costing-method")?.addEventListener("change", () => {
    if (!canUsePermission("settings.costing", "update", state, session)) {
      byId("costing-method").value = state.settings?.costingMethod || "average";
      showFeedback("setting-feedback", "Anda tidak punya akses untuk mengubah metode costing.");
      return;
    }
    state.settings.costingMethod = byId("costing-method").value;
    putSetting("/api/setting", state.settings);
    updateCostingPreview();
  });

  byId("table-service-mode")?.addEventListener("change", () => {
    if (!canUsePermission("settings.tables", "update", state, session)) {
      byId("table-service-mode").value = state.settings?.tableServiceMode || "free_seating_pay_first";
      showFeedback("setting-feedback", "Anda tidak punya akses untuk mengubah flow table.");
      return;
    }
    state.settings.tableServiceMode = byId("table-service-mode").value;
    putSetting("/api/setting", state.settings);
    updateTableFlowPreview();
    showAlert("Flow Dine In berhasil diperbarui.");
  });

  byId("outlet-settings-form")?.addEventListener("submit", (event) => {
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

  byId("book-content-form")?.addEventListener("submit", (event) => {
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

  byId("company-name")?.addEventListener("input", () => {
    if (!byId("company-route-slug").value.trim()) {
      byId("company-route-slug").value = slugify(byId("company-name").value);
    }
  });

  byId("company-logo-file")?.addEventListener("change", (event) => {
    uploadLogo(event.target.files?.[0]);
  });

  byId("payment-method-type")?.addEventListener("change", () => {
    const val = byId("payment-method-type").value;
    if (val === "qris" && !byId("payment-method-channel").value.trim()) byId("payment-method-channel").value = "QRIS";
    if (val === "card" && !byId("payment-method-channel").value.trim()) byId("payment-method-channel").value = "CARDS";
    if (val === "va" && !byId("payment-method-channel").value.trim()) byId("payment-method-channel").value = "VA";
    if (val === "ewallet" && !byId("payment-method-channel").value.trim()) byId("payment-method-channel").value = "EWALLET";
    syncPaymentMethodFields();
  });

  byId("payment-card-mode")?.addEventListener("change", syncPaymentMethodFields);
  byId("payment-qris-mode")?.addEventListener("change", syncPaymentMethodFields);
  byId("payment-qris-image-file")?.addEventListener("change", (event) => uploadQrisImage(event.target.files?.[0]));
  byId("payment-card-acquirer")?.addEventListener("change", syncPaymentMethodFields);
  byId("payment-edc-mode")?.addEventListener("change", syncPaymentMethodFields);
  byId("central-master-gateway-form")?.addEventListener("submit", saveCentralMasterGateway);
}
