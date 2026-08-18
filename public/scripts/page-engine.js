import { apiGet, scopedApiUrl } from "./store.js";
import { updateSidebarBrand } from "./layout.js";

const PAGE_ENDPOINTS = {
  login: "/api/page/login/bootstrap",
  pos: "/api/page/pos/bootstrap",
  settings: "/api/page/settings/bootstrap",
  aiAnalyst: "/api/page/settings/bootstrap",
  users: "/api/page/users/bootstrap",
  products: "/api/page/products/bootstrap",
  categories: "/api/page/products/bootstrap",
  modifiers: "/api/page/products/bootstrap",
  recipes: "/api/page/products/bootstrap",
  ingredientMapping: "/api/page/products/bootstrap",
  ingredientTemplates: "/api/page/products/bootstrap",
  inventoryDashboard: "/api/page/inventory/bootstrap",
  inventoryList: "/api/page/inventory/bootstrap",
  purchases: "/api/page/inventory/bootstrap",
  finishedProducts: "/api/page/inventory/bootstrap",
  financeDashboard: "/api/page/finance/bootstrap",
  reports: "/api/page/finance/bootstrap",
  financeExpenses: "/api/page/finance/bootstrap",
  financeSettlement: "/api/page/finance/bootstrap",
  paymentGatewayLogs: "/api/page/finance/bootstrap"
};

export function pageDateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function loadPageBootstrap(page, state, session, params = {}) {
  const endpoint = PAGE_ENDPOINTS[page];
  if (!endpoint) return { ok: false, message: `Endpoint page ${page} belum tersedia.` };
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  });
  const url = query.toString() ? `${endpoint}?${query.toString()}` : endpoint;
  const response = apiGet(scopedApiUrl(url, state, session));
  // Auto-refresh sidebar logo/favicon from the latest DB values on every bootstrap load
  const logoUrl = response?.data?.settings?.companyLogoUrl;
  const companyName = response?.data?.settings?.companyName;
  if (logoUrl) updateSidebarBrand(logoUrl, companyName);
  return response;
}


export function applyPageBootstrap(targetState, data, fields = []) {
  if (!data) return targetState;
  fields.forEach((field) => {
    if (Array.isArray(targetState[field]) && Array.isArray(data[field])) {
      targetState[field] = data[field];
      return;
    }
    if (data[field] !== undefined) targetState[field] = data[field];
  });
  return targetState;
}
