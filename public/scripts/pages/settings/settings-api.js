import { state, session } from "./settings-state.js";
import { activeCompany, setLogoValue } from "./settings-helpers.js";
import { apiDelete, apiPost, apiPut, apiUpload, scopedPayload } from "../../store.js";
import { byId, showFeedback } from "../../dom.js";
import { loadPageBootstrap } from "../../page-engine.js";
import { updateSidebarBrand } from "../../layout.js";

let renderSettingsHandler = null;
let setQrisImageHandler = null;

export function setApiCallbacks({ renderSettings, setQrisImage }) {
  if (renderSettings) renderSettingsHandler = renderSettings;
  if (setQrisImage) setQrisImageHandler = setQrisImage;
}

export function applySettingsData(data) {
  if (!data) return;
  state.settings = { ...state.settings, ...(data.settings || {}) };
  if (Array.isArray(data.ingredients)) {
    state.ingredients = data.ingredients.map((item) => ({ ...item, minStock: item.minStock || 0, avgCost: item.avgCost || 0 }));
  }
}

export function refreshSettingsData() {
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
  // Refresh sidebar logo and favicon from the latest DB values
  if (state.settings?.companyLogoUrl) {
    updateSidebarBrand(state.settings.companyLogoUrl, state.settings.companyName);
  }
  if (renderSettingsHandler) renderSettingsHandler();
}

export function postSetting(url, payload) {
  const result = apiPost(url, scopedPayload(payload, state, session));
  if (!result?.ok) return false;
  refreshSettingsData();
  return true;
}

export function putSetting(url, payload) {
  const result = apiPut(url, scopedPayload(payload, state, session));
  if (!result?.ok) return false;
  refreshSettingsData();
  return true;
}

export function deleteSetting(url, payload = {}) {
  const result = apiDelete(url, scopedPayload(payload, state, session));
  if (!result?.ok) return false;
  refreshSettingsData();
  return true;
}

export function uploadLogo(file) {
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

export function uploadQrisImage(file) {
  if (!file) return;
  const formData = new FormData();
  formData.append("qrisImage", file);
  const result = apiUpload("/api/payment-method-qris-image", formData);
  if (!result?.ok || !result.url) {
    showFeedback("payment-method-feedback", result?.message || "Upload gambar QRIS gagal.");
    if (byId("payment-qris-image-file")) byId("payment-qris-image-file").value = "";
    return;
  }
  if (setQrisImageHandler) setQrisImageHandler(result.url);
  showFeedback("payment-method-feedback", "Gambar QRIS berhasil diupload. Simpan metode bayar untuk menggunakannya.");
}
