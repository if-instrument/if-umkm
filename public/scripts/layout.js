import { apiGet, appPath, applyPermissionControls, canAccessAllOutlets, canUsePermission, clearSession, loadSession, loadState, primaryOutletId, saveSession } from "./store.js?v=coffee-v150";
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
    ? [{ title: "SaaS", items: [{ page: "users", icon: "U", label: "Perusahaan", href: "/pages/users.html" }] }]
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

export function renderLayout() {
  const state = loadState();
  const session = loadSession();
  if (!session && !window.location.pathname.endsWith("/login.html")) {
    window.location.href = appPath("/login");
    return;
  }
  if (session && !session.token && !window.location.pathname.endsWith("/login.html")) {
    clearSession();
    window.location.href = appPath("/login");
    return;
  }
  if (session?.authType !== "super_admin" && session?.companySlug && !window.__COMPANY_SLUG__) {
    const currentPath = window.location.pathname.endsWith("/login.html") ? "/login" : window.location.pathname;
    window.location.href = appPath(currentPath);
    return;
  }
  if (session?.authType === "super_admin" && document.body.dataset.page !== "users") {
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
  const companyName = company.name || state.settings.companyName || APP_NAME;
  const companyLogoUrl = company.logoUrl || state.settings.companyLogoUrl || "";
  const companyThemeColor = company.themeColor || state.settings.themeColor || "#6e3a16";
  if (companyThemeColor) document.documentElement.style.setProperty("--brand", companyThemeColor);
  const page = document.body.dataset.page || "dashboard";
  const title = document.body.dataset.title || "Dashboard";
  const eyebrow = document.body.dataset.eyebrow || "Operasional hari ini";
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
  const isSuperAdmin = session?.authType === "super_admin";
  const brandMark = isSuperAdmin
    ? `<span class="brand-mark app-brand-logo"><img src="${APP_LOGO}" alt="${APP_NAME}" /></span>`
    : `<span class="brand-mark">${companyLogoUrl ? `<img src="${companyLogoUrl}" alt="${companyName}" />` : companyName.slice(0, 2).toUpperCase()}</span>`;
  const brandTitle = isSuperAdmin ? APP_NAME : companyName;
  const brandSubtitle = isSuperAdmin ? APP_TAGLINE : "Company Management";
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

  document.body.innerHTML = `
    <div class="app-shell">
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
        <header class="topbar">
          <div>
            <p class="eyebrow">${eyebrow}</p>
            <h2>${title}</h2>
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
