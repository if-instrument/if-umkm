import { isInactiveStatus } from "./status-codes.js";

export const SESSION_KEY = "if-instrument-session";
export const SESSION_VERSION = 2;

const EMPTY_STATE = {
  activeCompanyId: "company-main",
  settings: {
    costingMethod: "average",
    companyName: "IF Instrument",
    companyLogoUrl: "",
    themeColor: "#6e3a16",
    outletName: "Outlet aktif",
    taxRate: 0,
    dineInServiceRate: 0,
    printerName: "",
    tableServiceMode: "free_seating_pay_first",
    orderChannels: {
      dineIn: false,
      takeAway: true,
      delivery: false
    },
    diningTables: [],
    paymentMethods: [],
    packagingRules: []
  },
  companies: [],
  outlets: [],
  companyRoles: [],
  users: [],
  categories: [],
  products: [],
  modifiers: [],
  ingredients: [],
  transactions: [],
  stockMovements: []
};

export function loadState() {
  return structuredClone(EMPTY_STATE);
}

export function loadSession() {
  const saved = localStorage.getItem(SESSION_KEY);
  if (!saved) return null;

  try {
    const session = JSON.parse(saved);
    if (!isValidSessionShape(session)) {
      clearSession();
      return null;
    }
    if (isJwtExpired(session?.token)) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    clearSession();
    return null;
  }
}

export function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, contextVersion: SESSION_VERSION }));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function isValidSessionShape(session) {
  return Boolean(
    session &&
    typeof session === "object" &&
    typeof session.token === "string" &&
    session.token.split(".").length === 3 &&
    session.contextVersion === SESSION_VERSION &&
    session.accessContext &&
    typeof session.accessContext === "object" &&
    typeof session.authType === "string" &&
    typeof session.email === "string"
  );
}

export function currentCompanySlug() {
  if (window.__COMPANY_SLUG__) return window.__COMPANY_SLUG__;
  const firstSegment = window.location.pathname.split("/").filter(Boolean)[0] || "";
  const reserved = ["api", "assets", "pages", "scripts", "uploads", "sales", "products", "inventory", "reports", "admin", "invitation", "login", "login.html", "index.html"];
  return firstSegment && !reserved.includes(firstSegment) ? firstSegment : "";
}

export function appPath(path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const session = loadSession();
  const slug = currentCompanySlug() || session?.companySlug || "";
  return slug ? `/${slug}${normalized}` : normalized;
}

export function primaryOutletId(state, session = loadSession()) {
  const companyId = session?.companyId || state.activeCompanyId;
  if (session?.selectedOutletId) return session.selectedOutletId;
  if (session?.outletIds?.length) return session.outletIds[0];
  return state.outlets?.find((outlet) => outlet.companyId === companyId && !isInactiveStatus(outlet.status))?.id || state.outlets?.[0]?.id || "";
}

export function canAccessAllOutlets(session) {
  return Boolean(session?.canViewAllOutlets || session?.outletScope === "all" || session?.authType === "company_admin");
}

export function canManageCompanyMasters(session) {
  return Boolean(canAccessAllOutlets(session) || (session?.outletIds || []).length > 1);
}

export function roleForSession(state, session = loadSession()) {
  return state.companyRoles?.find((role) => role.id === session?.roleId);
}

export function permissionMatrixForSession(state = loadState(), session = loadSession()) {
  if (!session) return {};
  return session.permissionMatrix || roleForSession(state, session)?.permissionMatrix || {};
}

export function canUsePermission(moduleKey, action = "read", state = loadState(), session = loadSession()) {
  if (!session) return false;
  if (session.authType === "company_admin") return true;
  if (session.authType === "super_admin") return moduleKey === "admin.companies";
  const matrix = permissionMatrixForSession(state, session);
  if (matrix?.[moduleKey]?.[action]) return true;
  const legacy = session.permissions || roleForSession(state, session)?.permissions || [];
  const legacyMap = {
    "dashboard.overview": "operations",
    "dashboard.recommendations": "operations",
    "pos.transaction": "pos",
    "pos.orderEdit": "pos",
    "pos.payment": "pos",
    "queue.kitchen": "kitchen",
    "queue.cashier": "pos",
    "categories.manage": "operations",
    "ingredients.template": "operations",
    "products.catalog": "operations",
    "products.outletPrice": "operations",
    "recipes.template": "operations",
    "recipes.outletMapping": "operations",
    "modifiers.master": "operations",
    "modifiers.options": "operations",
    "modifiers.outletPrice": "operations",
    "modifiers.ingredientTemplate": "operations",
    "inventory.overview": "inventory",
    "inventory.ingredients": "inventory",
    "inventory.purchase": "inventory",
    "inventory.movement": "inventory",
    "inventory.waste": "inventory",
    "reports.profitLoss": "reports",
    "reports.operatingExpenses": "reports",
    "reports.sales": "reports",
    "reports.inventoryLoss": "reports",
    "settings.outlet": "settings",
    "settings.payment": "settings",
    "settings.tables": "settings",
    "settings.packaging": "settings",
    "settings.costing": "settings",
    "company.branding": "company",
    "outlets.manage": "outlet",
    "users.manage": "user",
    "roles.manage": "role"
  };
  return Boolean(legacyMap[moduleKey] && legacy.includes(legacyMap[moduleKey]));
}

export function applyPermissionControls(root = document, state = loadState(), session = loadSession()) {
  root.querySelectorAll("[data-permission]").forEach((element) => {
    const [moduleKey, action = "read"] = element.dataset.permission.split(":");
    const allowed = canUsePermission(moduleKey, action, state, session);
    element.hidden = !allowed;
    if ("disabled" in element) element.disabled = !allowed;
    element.setAttribute("aria-disabled", String(!allowed));
  });
}

export function visibleForSession(item, state, session = loadSession()) {
  if (!session || session.authType === "super_admin") return true;
  const companyId = session.companyId || state.activeCompanyId;
  if (item.companyId && legacyCompanyDbId(item.companyId) !== legacyCompanyDbId(companyId)) return false;
  if (item.scope !== "outlet" && !item.outletId) return true;
  if (!item.outletId) return true;

  const itemOutletId = legacyOutletDbId(item.outletId);
  if (canAccessAllOutlets(session)) {
    return itemOutletId === legacyOutletDbId(primaryOutletId(state, session));
  }
  return (session.outletIds || []).some((outletId) => legacyOutletDbId(outletId) === itemOutletId);
}

export function stampScopedMaster(payload, state, session = loadSession()) {
  const companyId = session?.companyId || state.activeCompanyId;
  const masterScope = canManageCompanyMasters(session) && payload.scope === "company" ? "company" : "outlet";
  return {
    ...payload,
    companyId,
    scope: masterScope,
    outletId: masterScope === "company" ? "" : primaryOutletId(state, session)
  };
}

export function stampOutletPayload(payload, state, session = loadSession()) {
  return {
    ...payload,
    companyId: session?.companyId || state.activeCompanyId,
    outletId: primaryOutletId(state, session)
  };
}

export function apiGet(url) {
  return sendJson("GET", url);
}

export function apiPost(url, payload = {}) {
  return sendJson("POST", url, payload);
}

export function apiPut(url, payload = {}) {
  return sendJson("PUT", url, payload);
}

export function apiDelete(url, payload = {}) {
  return sendJson("DELETE", url, payload);
}

export function apiUpload(url, formData) {
  return sendMultipart("POST", url, formData);
}

let loadingDepth = 0;
let loadingButton = null;
let loadingButtonLabel = "";
let recentActionUntil = 0;

export function showGlobalLoading(message = "Memproses data...") {
  loadingDepth += 1;
  const overlay = ensureLoadingOverlay();
  const label = overlay.querySelector("[data-loading-label]");
  if (label) label.textContent = message;
  overlay.hidden = false;
  document.body.classList.add("app-busy");
  document.body.setAttribute("aria-busy", "true");
  lockActiveButton();
}

export function hideGlobalLoading() {
  loadingDepth = Math.max(0, loadingDepth - 1);
  if (loadingDepth > 0) return;
  const overlay = document.querySelector("[data-app-loading-overlay]");
  if (overlay) overlay.hidden = true;
  document.body.classList.remove("app-busy");
  document.body.removeAttribute("aria-busy");
  unlockActiveButton();
}

export function isGlobalLoading() {
  return loadingDepth > 0 || document.body.classList.contains("app-busy");
}

export function legacyOutletDbId(outletId) {
  if (!outletId) return 1;
  const numeric = Number(String(outletId).replace(/^\D+/, ""));
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return { "outlet-main": 1, "outlet-north": 2, "outlet-south": 3 }[outletId] || 1;
}

export function legacyCompanyDbId(companyId) {
  if (!companyId) return 1;
  const numeric = Number(String(companyId).replace(/^\D+/, ""));
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return { "company-main": 1 }[companyId] || 1;
}

export function scopedApiUrl(url, state, session = loadSession()) {
  const separator = url.includes("?") ? "&" : "?";
  const companyId = legacyCompanyDbId(session?.companyId || state.activeCompanyId);
  const outletId = legacyOutletDbId(primaryOutletId(state, session));
  return `${url}${separator}company_id=${companyId}&outlet_id=${outletId}`;
}

export function scopedPayload(payload, state, session = loadSession()) {
  return {
    ...payload,
    company_id: legacyCompanyDbId(session?.companyId || state.activeCompanyId),
    outlet_id: legacyOutletDbId(primaryOutletId(state, session))
  };
}

function sendJson(method, url, payload = null) {
  const shouldOverlay = shouldUseGlobalLoading(method, url);
  if (shouldOverlay) showGlobalLoading(loadingMessage(method, url));
  try {
    const request = new XMLHttpRequest();
    request.open(method, url, false);
    request.setRequestHeader("Accept", "application/json");
    const token = loadSession()?.token;
    if (token && !url.includes("/api/auth/login")) request.setRequestHeader("Authorization", `Bearer ${token}`);
    if (payload) request.setRequestHeader("Content-Type", "application/json");
    request.send(payload ? JSON.stringify(payload) : null);
    const response = request.responseText ? JSON.parse(request.responseText) : null;
    if (request.status === 401) handleSessionExpired(url);
    if (request.status < 200 || request.status >= 300) return response;
    return response;
  } catch {
    return null;
  } finally {
    if (shouldOverlay) hideGlobalLoading();
  }
}

function sendMultipart(method, url, formData) {
  const shouldOverlay = shouldUseGlobalLoading(method, url);
  if (shouldOverlay) showGlobalLoading(loadingMessage(method, url));
  try {
    const request = new XMLHttpRequest();
    request.open(method, url, false);
    request.setRequestHeader("Accept", "application/json");
    const token = loadSession()?.token;
    if (token) request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.send(formData);
    const response = request.responseText ? JSON.parse(request.responseText) : null;
    if (request.status === 401) handleSessionExpired(url);
    if (request.status < 200 || request.status >= 300) return response;
    return response;
  } catch {
    return null;
  } finally {
    if (shouldOverlay) hideGlobalLoading();
  }
}

function ensureLoadingOverlay() {
  let overlay = document.querySelector("[data-app-loading-overlay]");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.className = "app-loading-overlay";
  overlay.dataset.appLoadingOverlay = "true";
  overlay.hidden = true;
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.innerHTML = `
    <div class="app-loading-panel">
      <span class="app-loading-spinner" aria-hidden="true"></span>
      <strong data-loading-label>Memproses data...</strong>
      <small>Mohon tunggu, aksi sedang dikirim.</small>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function lockActiveButton() {
  const submitter = window.__lastSubmitter instanceof HTMLElement ? window.__lastSubmitter : null;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const button = submitter || active?.closest?.("button, input[type='submit'], input[type='button']");
  if (!button || button.disabled || button.dataset.loadingLocked === "1") return;

  loadingButton = button;
  loadingButtonLabel = button.tagName === "INPUT" ? button.value : button.textContent;
  button.dataset.loadingLocked = "1";
  button.disabled = true;
  button.classList.add("is-loading");
  if (button.tagName === "INPUT") button.value = "Memproses...";
  else button.textContent = "Memproses...";
}

function unlockActiveButton() {
  if (!loadingButton) return;
  loadingButton.disabled = false;
  loadingButton.classList.remove("is-loading");
  delete loadingButton.dataset.loadingLocked;
  if (loadingButton.tagName === "INPUT") loadingButton.value = loadingButtonLabel;
  else loadingButton.textContent = loadingButtonLabel;
  loadingButton = null;
  loadingButtonLabel = "";
}

function shouldUseGlobalLoading(method, url = "") {
  if (isPublicAuthUrl(url) && method === "GET") return false;
  return true;
}

function loadingMessage(method, url = "") {
  if (method === "GET") return "Memuat data...";
  if (url.includes("upload") || url.includes("image") || url.includes("logo")) return "Mengunggah file...";
  if (method === "DELETE") return "Menghapus data...";
  return "Menyimpan perubahan...";
}

function isJwtExpired(token) {
  if (!token || typeof token !== "string") return false;
  const [, payload] = token.split(".");
  if (!payload) return false;

  try {
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=")));
    return decoded?.exp ? decoded.exp * 1000 <= Date.now() : false;
  } catch {
    return false;
  }
}

function handleSessionExpired(url = "") {
  if (isPublicAuthUrl(url) || isLoginPage()) return;
  if (!localStorage.getItem(SESSION_KEY)) return;

  clearSession();
  const target = appPath("/login");
  if (window.location.pathname !== target) window.location.href = target;
}

function isPublicAuthUrl(url = "") {
  return [
    "/api/auth/login",
    "/api/tenant",
    "/api/tenants",
    "/api/invitation"
  ].some((path) => url.includes(path));
}

function isLoginPage() {
  const path = window.location.pathname;
  return path.endsWith("/login") || path.endsWith("/login.html");
}

document.addEventListener("submit", (event) => {
  if (isGlobalLoading()) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  window.__lastSubmitter = event.submitter || document.activeElement || null;
}, true);

document.addEventListener("click", (event) => {
  const target = event.target instanceof HTMLElement ? event.target.closest("button, [role='button'], a, input[type='submit'], input[type='button']") : null;
  if (!target) return;
  if (isGlobalLoading() || Date.now() < recentActionUntil) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  const isAction = target.matches("button, [role='button'], input[type='submit'], input[type='button']")
    && !target.matches("[data-close-modal], [data-close-category-modal], [data-close-template-modal], .icon-button");
  if (isAction) recentActionUntil = Date.now() + 700;
}, true);
