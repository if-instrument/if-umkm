import { state, session, isSuperAdmin } from "./users-state.js";
import { setLogoValue } from "./users-helpers.js";
import { apiDelete, apiGet, apiPost, apiPut, apiUpload } from "../../store.js";
import { showFeedback } from "../../dom.js";
import { loadPageBootstrap } from "../../page-engine.js";

let refreshTablesHandler = null;
let renderCentralGatewayHandler = null;

export function setApiCallbacks({ refreshTables, renderCentralGateway }) {
  if (refreshTables) refreshTablesHandler = refreshTables;
  if (renderCentralGateway) renderCentralGatewayHandler = renderCentralGateway;
}

export function ensureSaasPlansLoaded() {
  if (!state.saasPlans || !state.saasPlans.length) {
    const res = apiGet("/api/saas-plan");
    if (res?.ok && Array.isArray(res.data)) {
      state.saasPlans = res.data;
    } else if (Array.isArray(res)) {
      state.saasPlans = res;
    }
  }
  if (!state.saasPlans || !state.saasPlans.length) {
    state.saasPlans = [
      { id: "1", code: "Starter", name: "Starter Plan", price: 150000, maxOutlets: 3, durationDays: 90, hasAiBiometrics: false },
      { id: "2", code: "Professional", name: "Professional Plan", price: 350000, maxOutlets: 10, durationDays: 365, hasAiBiometrics: true },
      { id: "3", code: "Enterprise", name: "Enterprise Plan", price: 750000, maxOutlets: 999, durationDays: 0, hasAiBiometrics: true }
    ];
  }
}

export function applyAccessData(data) {
  if (!data) return;
  state.activeCompanyId = isSuperAdmin ? (data.activeCompanyId || state.activeCompanyId) : (session?.companyId || data.activeCompanyId || state.activeCompanyId);
  state.companies = data.companies || [];
  state.outlets = data.outlets || [];
  state.companyRoles = data.companyRoles || [];
  state.users = data.users || [];
  if (data.saasPlans && data.saasPlans.length) {
    state.saasPlans = data.saasPlans;
  } else {
    ensureSaasPlansLoaded();
  }
  if (data.centralPaymentGateway) {
    state.centralPaymentGateway = data.centralPaymentGateway;
    if (renderCentralGatewayHandler) renderCentralGatewayHandler(data.centralPaymentGateway);
  }
}

export function loadAccessData() {
  const response = loadPageBootstrap("users", state, session);
  if (!response?.ok) {
    showFeedback("company-feedback", response?.message || "Data user & role gagal dimuat.");
    return;
  }
  applyAccessData(response.data || {});
}

export function refreshDataAndTables() {
  loadAccessData();
  if (refreshTablesHandler) refreshTablesHandler();
}

export function requestAccess(method, url, payload = {}) {
  const result = method(url, payload);
  if (!result?.ok) {
    showFeedback("company-feedback", result?.message || "Data gagal tersimpan.");
    return false;
  }
  loadAccessData();
  return result;
}

export function postAccess(url, payload = {}) {
  return requestAccess(apiPost, url, payload);
}

export function putAccess(url, payload = {}) {
  return requestAccess(apiPut, url, payload);
}

export function deleteAccess(url, payload = {}) {
  return requestAccess(apiDelete, url, payload);
}

export function uploadLogo(file, inputId, previewId) {
  if (!file) return;
  const formData = new FormData();
  formData.append("logo", file);
  formData.append("file", file);
  const result = apiUpload("/api/company-logo", formData);
  if (!result?.ok || !result.url) {
    showFeedback("company-feedback", "Upload logo gagal. Gunakan JPG, PNG, WEBP, atau GIF maksimal 2 MB.");
    return;
  }
  setLogoValue(inputId, previewId, result.url);
  showFeedback("company-feedback", "Logo berhasil diupload. Simpan data untuk memakai logo ini.");
}
