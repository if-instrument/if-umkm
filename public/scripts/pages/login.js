import { apiGet, apiPost, appPath, currentCompanySlug, loadSession, saveSession } from "../store.js?v=coffee-v150";
import { byId, setText, showFeedback } from "../dom.js";

const session = loadSession();
const companySlug = currentCompanySlug();
const loginBootstrapQuery = companySlug ? `?companySlug=${encodeURIComponent(companySlug)}` : "";
const loginBootstrap = apiGet(`/api/page/login/bootstrap${loginBootstrapQuery}`)?.data || {};
const tenant = loginBootstrap.company || null;
const tenants = loginBootstrap.companies || [];

if (session) {
  window.location.href = session.authType === "super_admin" ? "/pages/users.html" : appPath("/index.html");
}

if (companySlug && !tenant) {
  setText("login-preview", "Route perusahaan tidak ditemukan atau belum aktif.");
}

if (tenant) {
  document.documentElement.style.setProperty("--brand", tenant.themeColor || "#6e3a16");
  const logo = document.querySelector(".login-brand .brand-mark");
  const title = document.querySelector(".login-brand h1");
  const tagline = document.querySelector(".login-brand p");
  const copyTitle = document.querySelector(".login-copy h2");
  const copyText = document.querySelector(".login-copy p");
  if (logo) logo.innerHTML = tenant.logoUrl ? `<img src="${tenant.logoUrl}" alt="${tenant.name}">` : tenant.name.slice(0, 2).toUpperCase();
  if (title) title.textContent = tenant.name;
  if (tagline) tagline.textContent = tenant.tagline || "UMKM Solution";
  if (copyTitle) copyTitle.textContent = `Masuk ke ${tenant.name}`;
  if (copyText) copyText.textContent = "Gunakan email dan password user yang terdaftar pada perusahaan ini.";
  document.querySelectorAll('[data-sample-login]').forEach((button) => button.remove());
  byId("tenant-login-panel").hidden = true;
} else {
  document.querySelectorAll('[data-sample-login]:not([data-sample-login="super"])').forEach((button) => { button.hidden = true; });
  byId("tenant-login-panel").hidden = false;
  renderTenantList();
}

function renderTenantList() {
  const list = byId("tenant-login-list");
  if (!list) return;
  list.innerHTML = tenants.length
    ? tenants.map((company) => `
      <button class="tenant-login-card" data-company-login="${company.routeSlug}" type="button">
        <span class="tenant-logo" style="--tenant-color:${company.themeColor || "#6e3a16"}">${company.logoUrl ? `<img src="${company.logoUrl}" alt="${company.name}">` : company.name.slice(0, 2).toUpperCase()}</span>
        <span><strong>${company.name}</strong><small>/${company.routeSlug}</small></span>
      </button>
    `).join("")
    : `<p class="form-preview">Belum ada perusahaan aktif.</p>`;
}

function sampleUser(type) {
  const sampleUsers = {
    super: { name: "Super Admin SaaS", email: "superadmin@app.test", password: "super123" },
    company: { name: "Admin Perusahaan", email: "admin@ifresso.id", password: "admin123" },
    area: { name: "Area Manager", email: "area@ifresso.id", password: "area123" },
    manager: { name: "Outlet Manager Utama", email: "manager@ifresso.id", password: "manager123" },
    cashier: { name: "Kasir Outlet Utama", email: "kasir@ifresso.id", password: "kasir123" },
    kitchen: { name: "Kitchen Outlet Utama", email: "kitchen@ifresso.id", password: "kitchen123" },
    inventory: { name: "Inventory Staff Utama", email: "inventory@ifresso.id", password: "inventory123" }
  };
  return sampleUsers[type] || sampleUsers.company;
}

function fillSample(type) {
  const user = sampleUser(type);
  if (!user) return;
  byId("login-email").value = user.email;
  byId("login-password").value = user.password;
  setText("login-preview", `${user.name}: ${user.email} / ${user.password}`);
}

function login(email, password) {
  const result = apiPost("/api/page/login/submit", { email, password, companySlug });
  if (!result?.ok || !result.user) {
    showFeedback("login-feedback", result?.message || "Email atau password tidak sesuai.");
    if (result?.routeUrl) {
      window.setTimeout(() => {
        window.location.href = result.routeUrl;
      }, 700);
    }
    return false;
  }
  const user = result.user;
  const authType = user.authType || (user.role === "Super Admin" ? "super_admin" : "company_user");
  const companyId = authType === "super_admin" ? "" : user.companyId || "";
  const selectedOutletId = user.selectedOutletId || user.outletIds?.[0] || "";
  saveSession({
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleId: user.roleId,
    permissions: user.permissions || [],
    permissionMatrix: user.permissionMatrix || {},
    authType,
    companyId,
    companySlug: user.companySlug || companySlug,
    outletScope: user.outletScope || "selected",
    canViewAllOutlets: Boolean(user.canViewAllOutlets || user.outletScope === "all"),
    outletIds: user.outletIds || [],
    selectedOutletId,
    accessContext: result.accessContext || result.context || {},
    token: result.token,
    loggedInAt: new Date().toISOString()
  });
  if (authType === "super_admin") window.location.href = "/pages/users.html";
  else if (authType === "company_admin" && user.onboardingRequired) window.location.href = appPath("/pages/onboarding.html");
  else if (user.permissions?.includes("kitchen") && !user.permissions.includes("pos")) window.location.href = appPath("/pages/orders.html");
  else window.location.href = appPath("/index.html");
  return true;
}

document.addEventListener("click", (event) => {
  const companyLogin = event.target.closest("[data-company-login]");
  if (companyLogin) {
    window.location.href = `/${companyLogin.dataset.companyLogin}/login`;
    return;
  }

  const sample = event.target.closest("[data-sample-login]");
  if (sample) fillSample(sample.dataset.sampleLogin);
});

byId("login-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const email = byId("login-email").value.trim().toLowerCase();
  const password = byId("login-password").value;
  if (!login(email, password)) showFeedback("login-feedback", "Email atau password tidak sesuai.");
});

if (!companySlug) fillSample("super");
