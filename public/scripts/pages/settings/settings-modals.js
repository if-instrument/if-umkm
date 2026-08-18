import { state, session, activeSettingTab, settingTabPermissions, setActiveSettingTabState } from "./settings-state.js";
import { activeCompany } from "./settings-helpers.js";
import { renderCompany, renderOutletSettings, renderBookContentSettings } from "./settings-outlet.js";
import { renderCosting, updateCostingPreview } from "./settings-costing.js";
import { renderDiningTables, updateTableFlowPreview } from "./settings-tables.js";
import { renderPaymentGateway, renderPaymentMethods } from "./settings-payments.js";
import { renderPackagingRules } from "./settings-packaging.js";
import { byId } from "../../dom.js";
import { applyBrandTheme } from "../../layout.js";
import { applyPermissionControls, canUsePermission } from "../../store.js";
import { enhanceAllDataTables } from "../../datatable.js";

export function openModal(id) {
  const backdrop = document.querySelector("[data-modal-backdrop]");
  const modal = byId(id);
  if (backdrop) backdrop.hidden = false;
  if (modal) modal.hidden = false;
  document.body.classList.add("modal-open");
  const firstField = modal?.querySelector("input, select, button");
  if (firstField) setTimeout(() => firstField.focus(), 80);
}

export function closeModal() {
  const backdrop = document.querySelector("[data-modal-backdrop]");
  if (backdrop) backdrop.hidden = true;
  document.querySelectorAll(".modal-dialog").forEach((modal) => {
    modal.hidden = true;
  });
  document.body.classList.remove("modal-open");
}

export function applyBranding() {
  const isSuperAdmin = session?.authType === "super_admin";
  const brandMark = document.querySelector(".brand-mark");
  const brandTitle = document.querySelector(".brand h1");
  const brandSubtitle = document.querySelector(".brand p");
  if (isSuperAdmin) {
    applyBrandTheme("#3B1F8C");
    if (brandMark) {
      brandMark.classList.add("app-brand-logo");
      brandMark.innerHTML = `<img src="/assets/if-instrument-logo.jpg" alt="IF Instrument">`;
    }
    if (brandTitle) brandTitle.textContent = "IF Instrument";
    if (brandSubtitle) brandSubtitle.textContent = "UMKM Solution";
    return;
  }
  const company = activeCompany();
  applyBrandTheme(company.themeColor || "#3B1F8C");
  if (brandMark) brandMark.innerHTML = company.logoUrl ? `<img src="${company.logoUrl}" alt="${company.name}">` : "IF";
}

export function setActiveSettingTab(tab) {
  const requestedTab = tab || "company";
  const canOpenRequested = canUsePermission(settingTabPermissions[requestedTab]?.[0] || "", settingTabPermissions[requestedTab]?.[1] || "read", state, session);
  const activeTab = canOpenRequested
    ? requestedTab
    : Object.entries(settingTabPermissions).find(([, permission]) => canUsePermission(permission[0], permission[1], state, session))?.[0] || requestedTab;
  
  setActiveSettingTabState(activeTab);

  document.querySelectorAll("[data-setting-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.settingTab === activeTab);
  });
  document.querySelectorAll("[data-setting-tab-panel]").forEach((panel) => {
    const active = panel.dataset.settingTabPanel === activeTab;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}

export function renderSettings() {
  applyBranding();
  renderCompany();
  renderBookContentSettings();
  renderCosting();
  renderOutletSettings();
  updateTableFlowPreview();
  renderPaymentGateway();
  renderDiningTables();
  renderPaymentMethods();
  renderPackagingRules();
  enhanceAllDataTables();
  applyPermissionControls(document, state, session);
  setActiveSettingTab(activeSettingTab);
}
