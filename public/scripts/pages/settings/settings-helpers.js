import { state, session } from "./settings-state.js";
import { byId } from "../../dom.js";
import { isActiveStatus, isInactiveStatus } from "../../status-codes.js";

export function exists(id) {
  return Boolean(byId(id));
}

export function statusPill(status) {
  return isActiveStatus(status)
    ? `<span class="status-pill status-ok">Aktif</span>`
    : `<span class="status-pill status-empty">Nonaktif</span>`;
}

export function slugify(value) {
  return (value || "company").trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "company";
}

export function activeCompany() {
  return (state.companies || []).find((company) => company.id === (session?.companyId || state.activeCompanyId)) || (state.companies || [])[0] || {};
}

export function activeOutlets() {
  const companyId = session?.companyId || state.activeCompanyId;
  return (state.outlets || []).filter((outlet) => outlet.companyId === companyId && !isInactiveStatus(outlet.status));
}

export function logoPreviewMarkup(url, fallback = "IF") {
  return url ? `<img src="${url}" alt="Logo">` : fallback;
}

export function setLogoValue(inputId, previewId, url, fallback = "IF") {
  if (byId(inputId)) byId(inputId).value = url || "";
  if (byId(previewId)) byId(previewId).innerHTML = logoPreviewMarkup(url, fallback);
}

export function sortedDiningTables() {
  return (state.settings?.diningTables || []).slice().sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0) || a.name.localeCompare(b.name));
}

export function sortedPaymentMethods() {
  return (state.settings?.paymentMethods || []).slice().sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0) || a.name.localeCompare(b.name));
}

export function isSuperAdminUser() {
  return session?.authType === "super_admin" || session?.role === "super_admin";
}

export function paymentTypeLabel(type) {
  const labels = {
    cash: "Cash (Tunai)",
    qris: "QRIS",
    card: "Card / EDC",
    va: "VA (Virtual Account)",
    ewallet: "E-Wallet",
    edc: "Card / EDC",
    transfer: "VA / E-Wallet",
    other: "Lainnya"
  };
  return labels[type] || type || "Cash (Tunai)";
}

export function paymentGatewayLabel(provider) {
  const labels = {
    manual: "Manual / Offline",
    midtrans: "Midtrans Snap",
    xendit: "Xendit Gateway",
    doku: "DOKU Checkout",
    espay: "Espay PG"
  };
  return labels[provider] || provider || "Manual / Offline";
}

export function cardModeLabel(method) {
  if (method.type !== "card") return "-";
  return method.edcTerminalId ? `EDC ${method.edcTerminalId}` : "Manual EDC Slip";
}

export function qrisModeLabel(method) {
  if (method.type !== "qris") return "-";
  return method.gatewayProvider === "manual" ? "Static Upload" : "Dynamic Dynamic Gateway";
}

export function edcConnectorLabel(method) {
  if (method.type !== "card") return "-";
  if (!method.edcIntegrationEnabled) return "Standalone (Non-integrated)";
  return method.edcTerminalId ? `Integrated (${method.edcTerminalId})` : "Integrated (Bridge Ready)";
}

export function feePayerLabel(method) {
  return method.feePayer === "merchant" ? "Toko / Merchant" : "Customer";
}
