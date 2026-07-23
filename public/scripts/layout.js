import { apiGet, appPath, applyPermissionControls, canAccessAllOutlets, canUsePermission, clearSession, loadSession, loadState, primaryOutletId, saveSession } from "./store.js?v=1784794256";
import { isInactiveStatus } from "./status-codes.js";

const APP_LOGO = "/assets/if-instrument-logo.jpg";
const APP_NAME = "IF Instrument";
const APP_TAGLINE = "UMKM Solution";

const navGroups = [
  {
    title: "Beranda",
    items: [
      { page: "dashboard", access: [["dashboard.overview", "read"]], icon: "D", label: "Dashboard", href: "/index.html" }
    ]
  },
  {
    title: "Front Office",
    items: [
      { page: "pos", access: [["pos.transaction", "read"], ["pos.transaction", "create"]], icon: "K", label: "POS Outlet", href: "/pages/pos.html" },
      { page: "orders", access: [["queue.kitchen", "read"], ["queue.cashier", "read"]], icon: "A", label: "Kitchen Display", href: "/pages/orders.html" },
      { page: "order-history", access: [["orders.history", "read"], ["reports.sales", "read"]], icon: "H", label: "Riwayat Order", href: "/pages/order-history.html" }
    ]
  },
  {
    title: "CRM",
    items: [
      { page: "crm-customers", access: [["crm.customers", "read"]], icon: "C", label: "Customer", href: "/pages/crm-customers.html" },
      { page: "crm-transactions", access: [["crm.transactions", "read"]], icon: "T", label: "Transaksi Customer", href: "/pages/crm-transactions.html" }
    ]
  },
  {
    title: "Produk & Recipe",
    items: [
      { page: "categories", access: [["categories.manage", "read"]], icon: "C", label: "Kategori", href: "/pages/categories.html" },
      { page: "products", access: [["products.catalog", "read"]], icon: "P", label: "Produk", href: "/pages/products.html" },
      { page: "modifiers", access: [["modifiers.master", "read"], ["modifiers.options", "read"]], icon: "M", label: "Modifier", href: "/pages/modifiers.html" },
      { page: "ingredient-templates", access: [["ingredients.template", "read"]], icon: "T", label: "Template Bahan", href: "/pages/ingredient-templates.html" },
      { page: "recipes", access: [["recipes.template", "read"], ["recipes.outletMapping", "read"]], icon: "R", label: "Buat Recipe", href: "/pages/recipes.html" },
      { page: "ingredient-mapping", access: [["recipes.outletMapping", "read"], ["modifiers.ingredientTemplate", "read"]], icon: "B", label: "Mapping Bahan", href: "/pages/ingredient-mapping.html" }
    ]
  },
  {
    title: "Inventory & Production",
    items: [
      { page: "inventory-dashboard", access: [["inventory.overview", "read"]], icon: "O", label: "Overview Stok", href: "/pages/inventory.html" },
      { page: "inventory-list", activePages: ["inventory-list", "purchases", "inventory-history"], access: [["inventory.ingredients", "read"]], icon: "S", label: "Stok Bahan", href: "/pages/inventory-list.html" },
      { page: "finished-products", access: [["products.catalog", "read"], ["inventory.overview", "read"]], icon: "J", label: "Stok Produk", href: "/pages/finished-products.html" }
    ]
  },
  {
    title: "Finance",
    items: [
      { page: "finance-dashboard", access: [["reports.profitLoss", "read"], ["reports.sales", "read"], ["reports.inventoryLoss", "read"]], icon: "F", label: "Dashboard Finance", href: "/pages/finance-dashboard.html" },
      { page: "reports", access: [["reports.profitLoss", "read"], ["reports.sales", "read"], ["reports.inventoryLoss", "read"]], icon: "L", label: "Profit & Loss", href: "/pages/reports.html" },
      { page: "finance-expenses", access: [["reports.operatingExpenses", "read"]], icon: "E", label: "Beban Operasional", href: "/pages/finance-expenses.html" },
      { page: "finance-settlement", access: [["reports.profitLoss", "read"], ["reports.sales", "read"]], icon: "S", label: "Settlement Payment", href: "/pages/finance-settlement.html" },
      { page: "payment-gateway-logs", adminOnly: true, icon: "G", label: "Log Gateway", href: "/pages/payment-gateway-logs.html" }
    ]
  },
  {
    title: "Backoffice",
    items: [
      { page: "users", access: [["users.manage", "read"], ["roles.manage", "read"], ["outlets.manage", "read"]], icon: "U", label: "User & Role", href: "/pages/users.html" },
      { page: "settings", access: [["settings.outlet", "read"], ["settings.payment", "read"], ["settings.tables", "read"], ["settings.packaging", "read"], ["settings.costing", "read"], ["company.branding", "read"]], icon: "P", label: "Pengaturan", href: "/pages/settings.html" }
    ]
  }
];

function allNavItems() {
  return navGroups.flatMap((group) => group.items);
}

function canAccessItem(item, state, session) {
  if (item.adminOnly) return session?.authType === "company_admin";
  if (!session || session.authType === "company_admin") return true;
  if (!item.access?.length) return true;
  return item.access.some(([moduleKey, action]) => canUsePermission(moduleKey, action, state, session));
}

function applyAccessState(state, session) {
  if (!session?.token) return state;
  const context = session.accessContext || {};
  state.companies = context.companies || state.companies || [];
  state.outlets = context.outlets || state.outlets || [];
  state.companyRoles = context.companyRoles || state.companyRoles || [];
  state.users = context.users || state.users || [];
  state.activeCompanyId = context.activeCompanyId || (session?.authType === "super_admin"
    ? state.companies[0]?.id || state.activeCompanyId
    : session?.companyId || state.companies[0]?.id || state.activeCompanyId);
  return state;
}

function activeCompany(state, session) {
  const companyId = session?.companyId || state.activeCompanyId;
  return (state.companies || []).find((company) => company.id === companyId) || (state.companies || [])[0] || {};
}

function navMarkup(currentPage, session, state) {
  const groups = session?.authType === "super_admin"
    ? [{
        title: "SaaS",
        items: [
          { page: "users", icon: "🏢", label: "Perusahaan", href: "/pages/users.html" },
          { page: "central-payment-gateway", icon: "💳", label: "Payment Gateway", href: "/pages/central-payment-gateway.html" }
        ]
      }]
    : navGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => canAccessItem(item, state, session))
        }))
        .filter((group) => group.items.length);
  return groups
    .map(
      (group) => {
        const isActiveGroup = group.items.some((item) => (item.activePages || [item.page]).includes(currentPage));
        return `
        <details class="nav-group ${isActiveGroup ? "active" : ""}" ${isActiveGroup ? "open" : ""}>
          <summary class="nav-group-title">${group.title}</summary>
          <div class="nav-group-menu">
          ${group.items
            .map(
              (item) => `
                <a class="nav-tab ${(item.activePages || [item.page]).includes(currentPage) ? "active" : ""}" href="${session?.authType === "super_admin" ? item.href : appPath(item.href)}">
                  <span class="nav-icon" aria-hidden="true">${item.icon}</span>
                  <span>${item.label}</span>
                </a>
              `
            )
            .join("")}
          </div>
        </details>
      `;
      }
    )
    .join("");
}

function updateFavicon(iconUrl) {
  if (!iconUrl) return;
  let link = document.querySelector("link[rel*='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = iconUrl;
}

function formatSlugToTitle(slug) {
  if (!slug) return "";
  return slug
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function renderLayout() {
  const session = loadSession();
  const state = loadState();
  if (!session && !window.location.pathname.endsWith("/login.html") && window.location.pathname !== "/login") {
    window.location.href = appPath("/login.html");
    return;
  }
  if (session?.authType !== "super_admin" && session?.companySlug && !window.__COMPANY_SLUG__) {
    const currentPath = window.location.pathname.endsWith("/login.html") ? "/login" : window.location.pathname;
    window.location.href = appPath(currentPath);
    return;
  }
  const allowedSuperAdminPages = ["users", "central-payment-gateway"];
  if (session?.authType === "super_admin" && !allowedSuperAdminPages.includes(document.body.dataset.page)) {
    window.location.href = "/pages/users.html";
    return;
  }
  applyAccessState(state, session);
  const currentPage = document.body.dataset.page || "dashboard";
  const onboardingAction = new URLSearchParams(window.location.search).get("onboarding") === "1";
  let onboardingStatus = null;
  if (session?.authType === "company_admin") {
    const companyId = session.companyId === "company-main" ? 1 : Number(String(session.companyId || "").replace(/^\D+/, "")) || 1;
    const onboarding = apiGet(`/api/onboarding?company_id=${companyId}`);
    if (onboarding?.ok && onboarding.data) onboardingStatus = onboarding.data;
  }
  if (session?.authType === "company_admin" && currentPage !== "onboarding" && !onboardingAction) {
    if (onboardingStatus?.requiresOnboarding) {
      window.location.href = appPath("/pages/onboarding.html");
      return;
    }
  }
  if (session?.authType !== "super_admin") {
    const allowedItems = allNavItems().filter((item) => canAccessItem(item, state, session));
    const canOpenPage = (currentPage === "onboarding" && session?.authType === "company_admin") || allowedItems.some((item) => (item.activePages || [item.page]).includes(currentPage));
    if (!canOpenPage && allowedItems[0]) {
      window.location.href = appPath(allowedItems[0].href);
      return;
    }
  }
  const company = activeCompany(state, session);
  const companySlug = company.routeSlug || session?.companySlug || window.__COMPANY_SLUG__ || "";
  const derivedCompanyName = company.name || state.settings.companyName || (companySlug ? formatSlugToTitle(companySlug) : APP_NAME);
  const companyName = derivedCompanyName;
  const companyLogoUrl = company.logoUrl || state.settings.companyLogoUrl || "";
  const isSuperAdmin = session?.authType === "super_admin";
  const companyThemeColor = isSuperAdmin ? "#3B1F8C" : (company.themeColor || state.settings.themeColor || "#3B1F8C");
  applyBrandTheme(companyThemeColor);

  const activeFavicon = isSuperAdmin ? APP_LOGO : (companyLogoUrl || APP_LOGO);
  updateFavicon(activeFavicon);

  const page = document.body.dataset.page || "dashboard";
  const title = document.body.dataset.title || "Dashboard";
  const eyebrow = document.body.dataset.eyebrow || "Operasional hari ini";

  if (isSuperAdmin) {
    document.title = `${title} - ${APP_NAME}`;
  } else {
    document.title = `${title} - ${companyName}`;
  }

  const content = document.querySelector("#page-content");
  const today = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
  const companyId = session?.companyId || state.activeCompanyId;
  const accessibleOutlets = (state.outlets || [])
    .filter((outlet) => outlet.companyId === companyId && !isInactiveStatus(outlet.status))
    .filter((outlet) => canAccessAllOutlets(session) || (session?.outletIds || []).includes(outlet.id));
  const selectedOutletId = primaryOutletId(state, session);
  const selectedOutlet = accessibleOutlets.find((outlet) => outlet.id === selectedOutletId);
  const outletMarkup = session?.authType === "super_admin"
    ? ""
    : accessibleOutlets.length > 1
      ? `
            <label class="outlet-card outlet-card-select">
              <span>Outlet Aktif</span>
              <select id="sidebar-outlet-select">
                ${accessibleOutlets.map((outlet) => `<option value="${outlet.id}" ${outlet.id === selectedOutletId ? "selected" : ""}>${outlet.name}</option>`).join("")}
              </select>
            </label>
        `
      : `
            <div class="outlet-card">
              <span>Outlet Tugas</span>
              <strong>${selectedOutlet?.name || state.settings.outletName}</strong>
            </div>
        `;
  const brandMark = isSuperAdmin
    ? `<span class="brand-mark app-brand-logo"><img src="${APP_LOGO}" alt="${APP_NAME}" /></span>`
    : `<span class="brand-mark">${companyLogoUrl ? `<img src="${companyLogoUrl}" alt="${companyName}" />` : companyName.slice(0, 2).toUpperCase()}</span>`;
  const brandTitle = isSuperAdmin ? APP_NAME : companyName;
  const brandSubtitle = isSuperAdmin ? APP_TAGLINE : "UMKM Solution";
  const showOnboardingProgress = session?.authType === "company_admin"
    && currentPage !== "onboarding"
    && onboardingStatus
    && Number(onboardingStatus.progress || 0) < 100;
  const onboardingTopbarMarkup = showOnboardingProgress ? `
    <a class="onboarding-topbar-button" href="${appPath("/pages/onboarding.html")}" aria-label="Setup Guide ${Number(onboardingStatus.progress || 0)} persen selesai">
      <span class="onboarding-topbar-copy"><small>Setup Guide</small><strong>${Number(onboardingStatus.completed || 0)}/${Number(onboardingStatus.total || 0)}</strong></span>
      <span class="onboarding-topbar-progress"><i style="width:${Number(onboardingStatus.progress || 0)}%"></i></span>
      <span class="onboarding-topbar-percent">${Number(onboardingStatus.progress || 0)}%</span>
    </a>
  ` : "";

  if (!document.getElementById("layout-sidebar-styles")) {
    const style = document.createElement("style");
    style.id = "layout-sidebar-styles";
    style.textContent = `
      @media (min-width: 981px) {
        .app-shell.sidebar-collapsed {
          display: block !important;
        }
        .app-shell.sidebar-collapsed .sidebar {
          display: none !important;
        }
      }
      @media (max-width: 980px) {
        #sidebar-toggle {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  const isCollapsed = localStorage.getItem("sidebar-collapsed") === "true";

  document.body.innerHTML = `
    <div class="app-shell ${isCollapsed ? "sidebar-collapsed" : ""}">
      <aside class="sidebar">
        <div class="brand">
          ${brandMark}
          <div>
            <h1>${brandTitle}</h1>
            <p>${brandSubtitle}</p>
          </div>
        </div>
        <button class="mobile-menu-toggle" id="mobile-menu-toggle" type="button" aria-label="Buka menu navigasi" aria-expanded="false">
          <span></span>
          <span></span>
          <span></span>
        </button>
        <nav class="nav-tabs" aria-label="Navigasi utama">${navMarkup(page, session, state)}</nav>
        <div class="sidebar-footer">
          ${outletMarkup}
          <div class="user-card">
            <span class="user-avatar">${(session?.name || "A").slice(0, 1).toUpperCase()}</span>
            <div><strong>${session?.name || "Admin"}</strong><small>${session?.email || "admin@ifresso.id"}</small></div>
          </div>
          <button class="ghost-button compact-button full" id="logout-button" type="button">Logout</button>
        </div>
      </aside>

      <main class="main">
        <header class="topbar" style="display: flex; align-items: center; gap: 14px;">
          <button id="sidebar-toggle" type="button" class="ghost-button" style="padding: 8px 12px; font-size: 16px; border-radius: 8px; border-color: #c2b6aa; line-height: 1; height: 38px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;" title="Toggle Sidebar">☰</button>
          <div style="flex-grow: 1;">
            <p class="eyebrow">${eyebrow}</p>
            <h2 style="margin: 0;">${title}</h2>
          </div>
          <div class="top-actions">
            ${onboardingTopbarMarkup}
            <span class="date-chip">${today}</span>
          </div>
        </header>
        ${content ? content.innerHTML : ""}
      </main>
    </div>
  `;
  applyPermissionControls(document, state, session);

  document.querySelector("#sidebar-toggle")?.addEventListener("click", () => {
    const shell = document.querySelector(".app-shell");
    if (shell) {
      const nowCollapsed = shell.classList.toggle("sidebar-collapsed");
      localStorage.setItem("sidebar-collapsed", String(nowCollapsed));
    }
  });

  document.querySelector("#logout-button").addEventListener("click", () => {
    clearSession();
    window.location.href = appPath("/login");
  });

  document.querySelector("#mobile-menu-toggle")?.addEventListener("click", (event) => {
    const sidebar = document.querySelector(".sidebar");
    const isOpen = !sidebar?.classList.contains("mobile-nav-open");
    sidebar?.classList.toggle("mobile-nav-open", isOpen);
    event.currentTarget.setAttribute("aria-expanded", String(isOpen));
  });

  document.querySelectorAll(".nav-tab").forEach((link) => {
    link.addEventListener("click", () => {
      document.querySelector(".sidebar")?.classList.remove("mobile-nav-open");
      document.querySelector("#mobile-menu-toggle")?.setAttribute("aria-expanded", "false");
    });
  });

  document.querySelectorAll('main a[href^="/"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      if (session?.authType === "super_admin") return;
      const href = link.getAttribute("href") || "";
      if (!href.startsWith("/pages/") && !["/index.html", "/login", "/login.html"].includes(href)) return;
      event.preventDefault();
      window.location.href = appPath(href);
    });
  });

  document.querySelector("#sidebar-outlet-select")?.addEventListener("change", (event) => {
    const currentSession = loadSession();
    saveSession({ ...currentSession, selectedOutletId: event.target.value });
    window.location.reload();
  });

  const firstField = document.querySelector("main input, main select");
  if (firstField) setTimeout(() => firstField.focus(), 80);
}

/**
 * Apply brand theme hex color to CSS variables.
 * Default color for Super Admin is derived from app logo (#3B1F8C).
 * For company, calculates 5 distinct intensity levels based on company's themeColor:
 * 1. --brand (base accent)
 * 2. --brand-strong (deep/dark intensity)
 * 3. --brand-hover (interactive hover intensity)
 * 4. --brand-soft (pastel/light tint)
 * 5. --sidebar-bg (deep dark hue derived from company theme hue & saturation)
 * 6. --brand-rgb (RGB triplet for opacity)
 */
export function applyBrandTheme(hex) {
  if (!hex || !hex.startsWith("#")) hex = "#3B1F8C"; // Default: Logo color (Super Admin)
  const root = document.documentElement;
  root.style.setProperty("--brand", hex);

  const { h, s, l } = hexToHsl(hex);
  
  // Intensitas 1: Strong (Deep) - untuk button gradient, dark headers, active borders
  const strongL = Math.max(l - 16, 5);
  root.style.setProperty("--brand-strong", hslToHex(h, s, strongL));

  // Intensitas 2: Hover - untuk interactive hover state
  const hoverL = Math.max(l - 8, 8);
  root.style.setProperty("--brand-hover", hslToHex(h, s, hoverL));

  // Intensitas 3: Soft (Pastel) - untuk badge, soft highlights, alert background
  const softL = Math.min(l + 42, 95);
  const softS = Math.max(s - 15, 10);
  root.style.setProperty("--brand-soft", hslToHex(h, softS, softL));

  // Intensitas 4: Sidebar Dark Background - warna gelap pekat turunan dari Hue tema perusahaan
  const sidebarBgL = Math.max(Math.min(l - 35, 11), 6);
  const sidebarBgS = Math.min(s, 35);
  root.style.setProperty("--sidebar-bg", hslToHex(h, sidebarBgS, sidebarBgL));

  // RGB triplet untuk alpha-channel opacity
  const sr = parseInt(hex.slice(1,3), 16) || 59;
  const sg = parseInt(hex.slice(3,5), 16) || 31;
  const sb = parseInt(hex.slice(5,7), 16) || 140;
  root.style.setProperty("--brand-rgb", `${sr}, ${sg}, ${sb}`);
}

function hexToHsl(hex) {
  let r = parseInt(hex.slice(1,3),16)/255;
  let g = parseInt(hex.slice(3,5),16)/255;
  let b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s, l = (max+min)/2;
  if (max === min) { h = s = 0; }
  else {
    const d = max-min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    switch(max) {
      case r: h = ((g-b)/d + (g<b?6:0))/6; break;
      case g: h = ((b-r)/d + 2)/6; break;
      default: h = ((r-g)/d + 4)/6;
    }
  }
  return { h: Math.round(h*360), s: Math.round(s*100), l: Math.round(l*100) };
}

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
