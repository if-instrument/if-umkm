import { apiGet, apiPost, appPath, currentCompanySlug, loadSession, saveSession } from "../store.js?v=coffee-v151";
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
  applyCompanyTheme(tenant.themeColor || "#3B1F8C");
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

/**
 * Apply company theme hex color.
 * Default color for Super Admin is derived from app logo (#3B1F8C).
 * For company, calculates 4 distinct intensity levels based on company's themeColor.
 */
function applyCompanyTheme(hex) {
  if (!hex || !hex.startsWith("#")) hex = "#3B1F8C";
  const root = document.documentElement;
  root.style.setProperty("--brand", hex);

  const { h, s, l } = hexToHsl(hex);
  
  // Intensitas 1: Strong (Deep)
  const strongL = Math.max(l - 16, 5);
  root.style.setProperty("--brand-strong", hslToHex(h, s, strongL));

  // Intensitas 2: Hover
  const hoverL = Math.max(l - 8, 8);
  root.style.setProperty("--brand-hover", hslToHex(h, s, hoverL));

  // Intensitas 3: Soft (Pastel)
  const softL = Math.min(l + 42, 95);
  const softS = Math.max(s - 15, 10);
  root.style.setProperty("--brand-soft", hslToHex(h, softS, softL));

  // Intensitas 4: Sidebar Dark Background
  const sidebarBgL = Math.max(Math.min(l - 35, 11), 6);
  const sidebarBgS = Math.min(s, 35);
  root.style.setProperty("--sidebar-bg", hslToHex(h, sidebarBgS, sidebarBgL));

  // RGB triplet untuk alpha-channel opacity
  const sr = parseInt(hex.slice(1,3), 16) || 59;
  const sg = parseInt(hex.slice(3,5), 16) || 31;
  const sb = parseInt(hex.slice(5,7), 16) || 140;
  root.style.setProperty("--brand-rgb", `${sr}, ${sg}, ${sb}`);
}

/** Convert hex to HSL object */
function hexToHsl(hex) {
  let r = parseInt(hex.slice(1,3),16)/255;
  let g = parseInt(hex.slice(3,5),16)/255;
  let b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s, l = (max+min)/2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    switch(max) {
      case r: h = ((g-b)/d + (g<b?6:0))/6; break;
      case g: h = ((b-r)/d + 2)/6; break;
      default: h = ((r-g)/d + 4)/6;
    }
  }
  return { h: Math.round(h*360), s: Math.round(s*100), l: Math.round(l*100) };
}

/** Convert HSL to hex string */
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1-l);
  const f = n => {
    const k = (n + h/30) % 12;
    const c = l - a * Math.max(Math.min(k-3, 9-k, 1), -1);
    return Math.round(255*c).toString(16).padStart(2,'0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}


function renderTenantList() {
  const list = byId("tenant-login-list");
  if (!list) return;
  list.innerHTML = tenants.length
    ? tenants.map((company) => `
      <button class="tenant-login-card" data-company-login="${company.routeSlug}" type="button">
        <span class="tenant-logo" style="--tenant-color:${company.themeColor || "#3B1F8C"}">${company.logoUrl ? `<img src="${company.logoUrl}" alt="${company.name}">` : company.name.slice(0, 2).toUpperCase()}</span>
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
