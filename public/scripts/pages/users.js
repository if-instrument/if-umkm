import { applyBrandTheme, renderLayout } from "../layout.js";
import { apiDelete, apiGet, apiPost, apiPut, apiUpload, applyPermissionControls, canUsePermission, hideGlobalLoading, loadSession, loadState, showGlobalLoading } from "../store.js";
import { byId, setText, showAlert, showFeedback } from "../dom.js";
import { enhanceAllDataTables } from "../datatable.js";
import { COMMON_STATUS, INVITATION_STATUS, isActiveStatus, isInactiveStatus, statusLabel } from "../status-codes.js";
import { loadPageBootstrap } from "../page-engine.js";

renderLayout();
let state = loadState();
const session = loadSession();
const isSuperAdmin = session?.authType === "super_admin";
const setupParams = new URLSearchParams(window.location.search);
let activeUserTab = ["users", "roles", "outlets"].includes(setupParams.get("tab")) ? setupParams.get("tab") : "users";

function ensureSaasPlansLoaded() {
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

function applyAccessData(data) {
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
    renderCentralMasterGateway(data.centralPaymentGateway);
  }
}

function loadAccessData() {
  const response = loadPageBootstrap("users", state, session);
  if (!response?.ok) {
    showFeedback("company-feedback", response?.message || "Data user & role gagal dimuat.");
    return;
  }
  applyAccessData(response.data || {});
}

function refreshDataAndTables() {
  loadAccessData();
  refreshTables();
}

function requestAccess(method, url, payload = {}) {
  const result = method(url, payload);
  if (!result?.ok) {
    showFeedback("company-feedback", result?.message || "Data gagal tersimpan.");
    return false;
  }
  loadAccessData();
  return result;
}

function postAccess(url, payload = {}) {
  return requestAccess(apiPost, url, payload);
}

function putAccess(url, payload = {}) {
  return requestAccess(apiPut, url, payload);
}

function deleteAccess(url, payload = {}) {
  return requestAccess(apiDelete, url, payload);
}

function slugify(value) {
  return (value || "company").trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "company";
}

function logoPreviewMarkup(url, fallback = "IF") {
  return url ? `<img src="${url}" alt="Logo">` : fallback;
}

function setLogoValue(inputId, previewId, url, fallback = "IF") {
  byId(inputId).value = url || "";
  byId(previewId).innerHTML = logoPreviewMarkup(url, fallback);
}

function uploadLogo(file, inputId, previewId) {
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

loadAccessData();

if (isSuperAdmin) {
  const pageTitle = document.querySelector(".topbar h2");
  const pageEyebrow = document.querySelector(".topbar .eyebrow");
  if (pageTitle) pageTitle.textContent = "Perusahaan";
  if (pageEyebrow) pageEyebrow.textContent = "SaaS Tenant";
}

const crudActions = [
  { key: "create", label: "C" },
  { key: "read", label: "R" },
  { key: "update", label: "U" },
  { key: "delete", label: "D" }
];

const permissionModules = [
  { key: "dashboard.overview", label: "Dashboard Overview", group: "Dashboard", legacy: "operations", actions: ["read"], aliases: ["dashboard"] },
  { key: "dashboard.recommendations", label: "Rekomendasi Operasional", group: "Dashboard", legacy: "operations", actions: ["read"] },
  { key: "pos.transaction", label: "POS Transaksi", group: "Operasional", legacy: "pos", actions: ["create", "read"], aliases: ["pos"] },
  { key: "pos.orderEdit", label: "Edit Pesanan Baru", group: "Operasional", legacy: "pos", actions: ["update"] },
  { key: "pos.payment", label: "Pembayaran & Close Bill", group: "Operasional", legacy: "pos", actions: ["create", "read"] },
  { key: "orders.history", label: "Riwayat Order", group: "Operasional", legacy: "reports", actions: ["read"] },
  { key: "queue.kitchen", label: "Aksi Dapur", group: "Operasional", legacy: "kitchen", actions: ["read", "update"], aliases: ["queue"] },
  { key: "queue.cashier", label: "Aksi Kasir di Antrian", group: "Operasional", legacy: "pos", actions: ["read", "update"] },
  { key: "crm.customers", label: "CRM Customer", group: "CRM", legacy: "reports", actions: ["create", "read", "update", "delete"], aliases: ["customers"] },
  { key: "crm.transactions", label: "Transaksi Customer", group: "CRM", legacy: "reports", actions: ["read"], aliases: ["customerTransactions"] },
  { key: "categories.manage", label: "Kategori Produk", group: "Produk", legacy: "operations", actions: ["create", "read", "update", "delete"], aliases: ["categories"] },
  { key: "products.catalog", label: "Kelola Produk", group: "Produk", legacy: "operations", actions: ["create", "read", "update", "delete"], aliases: ["products"] },
  { key: "products.outletPrice", label: "Harga Produk Outlet", group: "Produk", legacy: "operations", actions: ["read", "update"] },
  { key: "ingredients.template", label: "Template Bahan", group: "Produk", legacy: "operations", actions: ["create", "read", "update", "delete"], aliases: ["ingredientTemplates"] },
  { key: "recipes.template", label: "Template Recipe Produk", group: "Produk", legacy: "operations", actions: ["create", "read", "update", "delete"], aliases: ["recipes"] },
  { key: "recipes.outletMapping", label: "Mapping Bahan Recipe", group: "Produk", legacy: "operations", actions: ["read", "update"], aliases: ["ingredientMapping"] },
  { key: "modifiers.master", label: "Master Modifier", group: "Produk", legacy: "operations", actions: ["create", "read", "update", "delete"], aliases: ["modifiers"] },
  { key: "modifiers.options", label: "Opsi Modifier", group: "Produk", legacy: "operations", actions: ["create", "read", "update", "delete"] },
  { key: "modifiers.outletPrice", label: "Harga Modifier Outlet", group: "Produk", legacy: "operations", actions: ["read", "update"] },
  { key: "modifiers.ingredientTemplate", label: "Template Bahan Modifier", group: "Produk", legacy: "operations", actions: ["create", "read", "update", "delete"] },
  { key: "inventory.overview", label: "Overview Stok", group: "Inventory", legacy: "inventory", actions: ["read"] },
  { key: "inventory.ingredients", label: "Stok Bahan Outlet", group: "Inventory", legacy: "inventory", actions: ["create", "read", "update", "delete"], aliases: ["inventory"] },
  { key: "inventory.purchase", label: "Catat Stok Masuk", group: "Inventory", legacy: "inventory", actions: ["create", "read"], aliases: ["purchase"] },
  { key: "inventory.movement", label: "Kartu Stok", group: "Inventory", legacy: "inventory", actions: ["read"], aliases: ["stockMovement"] },
  { key: "inventory.waste", label: "Waste / Expired", group: "Inventory", legacy: "inventory", actions: ["create", "read"] },
  { key: "reports.profitLoss", label: "Laba Rugi", group: "Laporan", legacy: "reports", actions: ["read"], aliases: ["reports"] },
  { key: "reports.operatingExpenses", label: "Beban Operasional", group: "Laporan", legacy: "reports", actions: ["create", "read", "update", "delete"] },
  { key: "reports.sales", label: "Laporan Penjualan", group: "Laporan", legacy: "reports", actions: ["read"] },
  { key: "reports.inventoryLoss", label: "Inventory Loss", group: "Laporan", legacy: "reports", actions: ["read"] },
  { key: "settings.outlet", label: "Setting Outlet", group: "Pengaturan", legacy: "settings", actions: ["read", "update"], aliases: ["settings"] },
  { key: "settings.payment", label: "Metode Bayar", group: "Pengaturan", legacy: "settings", actions: ["create", "read", "update", "delete"] },
  { key: "settings.tables", label: "Layout Meja", group: "Pengaturan", legacy: "settings", actions: ["create", "read", "update", "delete"] },
  { key: "settings.packaging", label: "Aturan Packaging", group: "Pengaturan", legacy: "settings", actions: ["create", "read", "update", "delete"] },
  { key: "settings.costing", label: "Metode Costing", group: "Pengaturan", legacy: "settings", actions: ["read", "update"] },
  { key: "company.branding", label: "Branding Perusahaan", group: "Admin", legacy: "company", actions: ["read", "update"], aliases: ["company"] },
  { key: "outlets.manage", label: "Kelola Outlet", group: "Admin", legacy: "outlet", actions: ["create", "read", "update", "delete"], aliases: ["outlets"] },
  { key: "users.manage", label: "Kelola User", group: "Admin", legacy: "user", actions: ["create", "read", "update", "delete"], aliases: ["users"] },
  { key: "roles.manage", label: "Kelola Role", group: "Admin", legacy: "role", actions: ["create", "read", "update", "delete"], aliases: ["roles"] }
];

function statusPill(status) {
  if (String(status) === INVITATION_STATUS.PENDING || status === "invited") return `<span class="status-pill status-warning">Diundang</span>`;
  return `<span class="status-pill ${isActiveStatus(status) ? "status-ok" : "status-empty"}">${isActiveStatus(status) ? "Aktif" : statusLabel(status, "common")}</span>`;
}

function activeCompany() {
  return (state.companies || []).find((company) => company.id === state.activeCompanyId) || (state.companies || [])[0] || {};
}

function activeOutlets() {
  return state.outlets.filter((outlet) => outlet.companyId === state.activeCompanyId && !isInactiveStatus(outlet.status));
}

function activeRoles() {
  return state.companyRoles.filter((role) => role.companyId === state.activeCompanyId && !isInactiveStatus(role.status));
}

function roleById(id) {
  return state.companyRoles.find((role) => role.id === id);
}

function outletName(id) {
  return state.outlets.find((outlet) => outlet.id === id)?.name || "Outlet tidak ditemukan";
}

function userOutletLabel(user) {
  if (user.outletScope === "all" || user.canViewAllOutlets) return "All Outlet";
  const names = (user.outletIds || []).map(outletName);
  return names.length ? names.join(", ") : "Belum ada outlet";
}

function selectedUserOutletIds() {
  return [...document.querySelectorAll("[data-user-outlet]:checked")].map((input) => input.value);
}

function hasCrudAccess(value = {}) {
  return crudActions.some((action) => Boolean(value[action.key]));
}

function moduleAllows(module, actionKey) {
  return (module.actions || crudActions.map((action) => action.key)).includes(actionKey);
}

function matrixFromLegacy(permissions = []) {
  const legacySet = new Set(permissions || []);
  return permissionModules.reduce((matrix, module) => {
    const aliases = module.aliases || [];
    const enabled = legacySet.has(module.legacy) || legacySet.has(module.key) || aliases.some((alias) => legacySet.has(alias));
    matrix[module.key] = crudActions.reduce((row, action) => {
      row[action.key] = enabled && moduleAllows(module, action.key);
      return row;
    }, {});
    return matrix;
  }, {});
}

function normalizeMatrix(matrix = {}, fallbackPermissions = []) {
  const fallback = matrixFromLegacy(fallbackPermissions);
  return permissionModules.reduce((result, module) => {
    const current = matrix?.[module.key] || fallback[module.key] || {};
    result[module.key] = crudActions.reduce((row, action) => {
      row[action.key] = moduleAllows(module, action.key) && Boolean(current[action.key]);
      return row;
    }, {});
    return result;
  }, {});
}

function legacyPermissionsFromMatrix(matrix = {}) {
  const permissions = new Set();
  permissionModules.forEach((module) => {
    if (hasCrudAccess(matrix[module.key])) {
      permissions.add(module.legacy);
    }
  });
  return [...permissions];
}

function permissionText(role) {
  const matrix = normalizeMatrix(role.permissionMatrix, role.permissions || []);
  const modules = permissionModules.filter((module) => hasCrudAccess(matrix[module.key]));
  if (!modules.length) return "-";
  return `${modules.length} modul · ${modules.map((module) => module.label).slice(0, 4).join(", ")}${modules.length > 4 ? ", ..." : ""}`;
}

function setActiveUserTab(tab) {
  activeUserTab = tab || "users";
  document.querySelectorAll("[data-user-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.userTab === activeUserTab);
  });
  document.querySelectorAll("[data-user-tab-panel]").forEach((panel) => {
    const active = panel.dataset.userTabPanel === activeUserTab;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}

function renderPermissionMatrix(matrix = {}) {
  const normalized = normalizeMatrix(matrix);
  byId("role-permission-matrix").innerHTML = `
    <div class="permission-row permission-header">
      <span>Modul</span>
      ${crudActions.map((action) => `<span title="${action.key}">${action.label}</span>`).join("")}
    </div>
    ${permissionModules.map((module) => `
      <label class="permission-row" data-permission-row="${module.key}">
        <span><strong>${module.label}</strong><small>${module.group}</small></span>
        ${crudActions.map((action) => moduleAllows(module, action.key)
          ? `<input type="checkbox" data-permission-module="${module.key}" data-permission-action="${action.key}" ${normalized[module.key]?.[action.key] ? "checked" : ""} />`
          : `<span class="permission-not-applicable">-</span>`
        ).join("")}
      </label>
    `).join("")}
  `;
  updatePermissionPreview();
}

function readPermissionMatrix() {
  const matrix = normalizeMatrix();
  document.querySelectorAll("[data-permission-module]").forEach((input) => {
    matrix[input.dataset.permissionModule][input.dataset.permissionAction] = input.checked;
  });
  return matrix;
}

function updatePermissionPreview() {
  const matrix = byId("role-permission-matrix").innerHTML ? readPermissionMatrix() : normalizeMatrix();
  const moduleCount = permissionModules.filter((module) => hasCrudAccess(matrix[module.key])).length;
  const accessCount = permissionModules.reduce((total, module) => total + crudActions.filter((action) => matrix[module.key]?.[action.key]).length, 0);
  setText("role-permission-preview", moduleCount ? `${moduleCount} modul aktif dengan ${accessCount} akses relevan.` : "Belum ada akses modul yang dipilih.");
}

function renderCompanies() {
  const saasPlansMap = (state.saasPlans || []).reduce((acc, p) => {
    if (p && p.code) acc[String(p.code).toLowerCase()] = p;
    return acc;
  }, {});

  byId("company-table").innerHTML = state.companies.map((company) => {
    const planCode = String(company.subscriptionPlan || "Professional").toLowerCase();
    const planObj = saasPlansMap[planCode];
    const planName = planObj?.name || company.subscriptionPlan || "Professional Plan";
    const isExpired = company.expiresAt && new Date(company.expiresAt) < new Date();
    const expText = company.expiresAt
      ? `<span style="${isExpired ? 'color:#ef4444; font-weight:700;' : ''}">${company.expiresAt}${isExpired ? ' (Kadaluarsa)' : ''}</span>`
      : `<small style="color:var(--muted);">Selamanya</small>`;
    
    const aiBadge = company.hasAiBiometrics
      ? `<span class="status-pill status-active" style="font-size:10px; background:#ecfdf5; color:#047857; border-color:#a7f3d0;">🤖 AI Active</span>`
      : `<span class="status-pill status-inactive" style="font-size:10px;">Non-AI</span>`;

    const isProvisioned = String(company.tenantStatus) === "CREATED" || company.id === "company-main" || String(company.id) === "1";
    const isRejected = String(company.status) === "90" || String(company.paymentStatus) === "20" || String(company.status) === "rejected";
    const isPending = !isProvisioned && !isRejected && (String(company.status) === "00" || String(company.status) === "0" || (company.registrationType === "PUBLIC_REGISTRATION" && String(company.paymentStatus) === "00"));
    const isPublicReg = company.registrationType === "PUBLIC_REGISTRATION" || (isPending && !isProvisioned);

    const regBadge = isPublicReg
      ? `<span class="badge" style="background:#fffbeb; color:#b45309; border:1px solid #fde68a; font-size:10px; padding:2px 6px; border-radius:4px; font-weight:600; display:inline-block; margin-top:2px;">📝 Pengajuan Mandiri</span>`
      : `<span class="badge" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; font-size:10px; padding:2px 6px; border-radius:4px; font-weight:600; display:inline-block; margin-top:2px;">🏢 Dibuat Super Admin</span>`;

    let actionButtons = "";
    if (isPending && isSuperAdmin) {
      if (company.paymentProofUrl) {
        actionButtons += `<a class="ghost-button compact-button" href="${company.paymentProofUrl}" target="_blank" title="Lihat Bukti Transfer">Bukti Bayar</a>`;
      }
      actionButtons += `<button class="primary-button compact-button" data-approve-company="${company.id}" style="background:#059669; border-color:#059669; color:#fff;" type="button">Setujui & Provisioning</button>`;
      actionButtons += `<button class="ghost-button compact-button" data-reject-company="${company.id}" style="color:#dc2626;" type="button">Tolak</button>`;
      actionButtons += `<button class="ghost-button compact-button" data-edit-company="${company.id}" data-permission="admin.companies:update" type="button">Edit</button>`;
    } else {
      actionButtons += `<button class="ghost-button compact-button" data-edit-company="${company.id}" data-permission="admin.companies:update" type="button">Edit</button>`;
      if (isSuperAdmin && isProvisioned) {
        actionButtons += `<button class="ghost-button compact-button" data-renew-company="${company.id}" style="color:#059669; border-color:#10b981; font-weight:600;" type="button">⏳ Perpanjang Subscription</button>`;
        actionButtons += `<button class="ghost-button compact-button" data-audit-company="${company.id}" style="color:#6b21a8; border-color:#c084fc; font-weight:600;" type="button">📜 Audit Pembelian</button>`;
      }
      if (isRejected && isSuperAdmin) {
        actionButtons += `<button class="ghost-button compact-button" data-resend-rejection-email="${company.id}" style="color:#b91c1c;" type="button">📧 Kirim Ulang Link Perbaikan</button>`;
      }
      if (String(company.adminStatus) === INVITATION_STATUS.PENDING || company.adminStatus === "invited") {
        actionButtons += `<button class="ghost-button compact-button" data-resend-company-invite="${company.id}" data-permission="admin.companies:update" type="button">Kirim Ulang Undangan</button>`;
      }
      if (!isSuperAdmin) {
        actionButtons += `<button class="ghost-button compact-button" data-select-company="${company.id}" ${company.id === state.activeCompanyId ? "disabled" : ""} type="button">Kelola</button>`;
      }
      actionButtons += `<button class="ghost-button compact-button" data-toggle-company="${company.id}" data-permission="admin.companies:delete" type="button">${isActiveStatus(company.status) ? "Nonaktif" : "Aktifkan"}</button>`;
    }

    const companyStatusPill = isRejected
      ? `<span class="status-pill status-danger" style="background:#fef2f2; color:#dc2626; border-color:#fecaca; font-size:11px; font-weight:700;">Ditolak (Nonaktif)</span>`
      : isPending
      ? `<span class="status-pill status-warning" style="font-size:11px;">Menunggu Persetujuan</span>`
      : statusPill(company.status);

    return `
      <tr>
        <td>
          <strong>${company.name}</strong><br>
          <small>/${company.routeSlug || "-"}${company.id === state.activeCompanyId ? " · Perusahaan aktif" : ""}</small><br>
          ${regBadge}
          ${company.dbName ? `<br><small style="color:var(--muted);">DB: ${company.dbName}</small>` : ""}
        </td>
        <td><span class="status-pill status-active" style="font-size:11px;">${planName}</span></td>
        <td><strong>${Number(company.maxOutlets || 0) >= 999 ? "Unlimited" : (company.maxOutlets || 5) + " Outlet"}</strong></td>
        <td>${expText}</td>
        <td>${aiBadge}</td>
        <td>${company.adminName}<br><small>${company.adminEmail}</small><br>${statusPill(company.adminStatus)}</td>
        <td>${companyStatusPill}</td>
        <td>
          <div class="row-actions">
            ${actionButtons}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function populateTenantPlanOptions(selectedPlanCode = "Professional") {
  const select = byId("tenant-subscription-plan");
  if (!select) return;

  const plans = state.saasPlans || [];
  if (!plans.length) {
    select.innerHTML = `
      <option value="Starter">Starter Plan (3 Outlet)</option>
      <option value="Professional" selected>Professional Plan (10 Outlet)</option>
      <option value="Enterprise">Enterprise Plan (Unlimited)</option>
    `;
    return;
  }

  select.innerHTML = plans.map((p) => {
    const isSelected = String(p.code).toLowerCase() === String(selectedPlanCode || "Professional").toLowerCase() ? "selected" : "";
    const isFeatured = Boolean(p.isFeatured || String(p.code).toLowerCase() === "professional");
    const recBadge = isFeatured ? " ⭐ (Recommended)" : "";
    const aiText = p.hasAiBiometrics ? " 🤖 AI Included" : " (Non-AI)";
    return `
      <option value="${p.code}" ${isSelected}>
        ${p.name || p.code}${recBadge}${aiText} - ${Number(p.price || 0) <= 0 ? "Gratis" : "Rp " + Number(p.price).toLocaleString("id-ID")}
      </option>
    `;
  }).join("");
}

function applyBranding() {
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
  if (brandTitle) brandTitle.textContent = company.name;
}

function renderRoles() {
  const roles = state.companyRoles.filter((role) => role.companyId === state.activeCompanyId);
  byId("role-table").innerHTML = roles.map((role) => `
    <tr>
      <td><strong>${role.name}</strong></td>
      <td>${role.outletScope === "all" ? "All Outlet" : "Selected Outlet"}</td>
      <td>${role.responsibility}</td>
      <td>${permissionText(role)}</td>
      <td>${statusPill(role.status)}</td>
      <td>
        <div class="row-actions">
          <button class="ghost-button compact-button" data-edit-role="${role.id}" data-permission="roles.manage:update" type="button">Edit</button>
          <button class="ghost-button compact-button" data-toggle-role="${role.id}" data-permission="roles.manage:delete" type="button">${isActiveStatus(role.status) ? "Nonaktif" : "Aktifkan"}</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderOutlets() {
  const outlets = state.outlets.filter((outlet) => outlet.companyId === state.activeCompanyId);
  byId("outlet-table").innerHTML = outlets.map((outlet) => `
    <tr>
      <td><strong>${outlet.code}</strong></td>
      <td>${outlet.name}</td>
      <td>${outlet.city || "-"}</td>
      <td>${statusPill(outlet.status)}</td>
      <td>
        <div class="row-actions">
          <button class="ghost-button compact-button" data-edit-outlet="${outlet.id}" data-permission="outlets.manage:update" type="button">Edit</button>
          <button class="ghost-button compact-button" data-toggle-outlet="${outlet.id}" data-permission="outlets.manage:delete" type="button">${isActiveStatus(outlet.status) ? "Nonaktif" : "Aktifkan"}</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderUsers() {
  byId("user-table").innerHTML = state.users.filter((user) => user.companyId === state.activeCompanyId && user.authType !== "super_admin").map((user) => {
    const role = roleById(user.roleId) || state.companyRoles.find((item) => item.name === user.role);
    return `
      <tr>
        <td><strong>${user.name}</strong></td>
        <td>${user.email}</td>
        <td>${role?.name || user.role || "-"}</td>
        <td>${role?.responsibility || "Sesuai role"}</td>
        <td>${userOutletLabel(user)}</td>
        <td>${statusPill(user.status)}</td>
        <td>
          <div class="row-actions">
            <button class="ghost-button compact-button" data-edit-user="${user.id}" data-permission="users.manage:update" type="button">Edit</button>
            ${String(user.status) === INVITATION_STATUS.PENDING || user.status === "invited" ? `<button class="ghost-button compact-button" data-resend-user-invite="${user.id}" data-permission="users.manage:create" type="button">Kirim Ulang Undangan</button>` : ""}
            <button class="ghost-button compact-button" data-toggle-user="${user.id}" data-permission="users.manage:delete" type="button">${isActiveStatus(user.status) ? "Nonaktif" : "Aktifkan"}</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function renderOptions() {
  byId("user-role").innerHTML = activeRoles().map((role) => `<option value="${role.id}">${role.name}</option>`).join("");
  byId("user-outlet-checklist").innerHTML = activeOutlets().map((outlet) => `
    <label class="outlet-checkbox-card">
      <input data-user-outlet type="checkbox" value="${outlet.id}" />
      <span><strong>${outlet.name}</strong><small>${outlet.city || "Area belum diisi"}</small></span>
    </label>
  `).join("");
}

function refreshTables() {
  const company = activeCompany();
  if (!state.settings) state.settings = {};
  state.settings.companyName = company.name || "IF Instrument";
  state.settings.companyLogoUrl = company.logoUrl || "";
  state.settings.themeColor = company.themeColor || "#3B1F8C";
  applyBranding();
  renderCompanies();
  renderRoles();
  renderOutlets();
  renderOptions();
  renderUsers();
  enhanceAllDataTables();
  applyPermissionControls(document, state, session);
  setActiveUserTab(activeUserTab);
  applyAccessMode();
}

function applyAccessMode() {
  const heading = document.querySelector("[data-access-heading]");
  if (heading) heading.textContent = isSuperAdmin
    ? "Kelola perusahaan dan undangan administrator."
    : "Kelola user, role, outlet, dan akses perusahaan.";
  document.querySelectorAll("[data-super-admin-only]").forEach((section) => {
    section.hidden = !isSuperAdmin;
    section.style.display = isSuperAdmin ? "" : "none";
  });
  document.querySelectorAll("[data-company-admin-only]").forEach((section) => {
    section.hidden = isSuperAdmin;
    section.style.display = isSuperAdmin ? "none" : "";
  });
  document.querySelectorAll("[data-open-company-modal]").forEach((button) => {
    button.hidden = !isSuperAdmin;
    button.style.display = isSuperAdmin ? "" : "none";
  });
  document.querySelectorAll("[data-open-role-modal], [data-open-outlet-modal], [data-open-user-modal]").forEach((button) => {
    const permission = button.dataset.permission || "";
    const [moduleKey, action = "read"] = permission.split(":");
    const allowed = !permission || canUsePermission(moduleKey, action, state, session);
    button.hidden = isSuperAdmin || !allowed;
    button.style.display = isSuperAdmin || !allowed ? "none" : "";
  });
  const addUserButton = document.querySelector("[data-open-user-modal]");
  if (addUserButton && !isSuperAdmin) {
    const hasRole = activeRoles().length > 0;
    addUserButton.disabled = !hasRole;
    addUserButton.title = hasRole ? "" : "Buat role aktif terlebih dahulu";
  }
}

function openModal(id) {
  document.querySelector("[data-modal-backdrop]").hidden = false;
  byId(id).hidden = false;
  document.body.classList.add("modal-open");
}

function closeModal() {
  document.querySelector("[data-modal-backdrop]").hidden = true;
  document.querySelectorAll(".modal-dialog").forEach((modal) => { modal.hidden = true; });
  document.body.classList.remove("modal-open");
}

function setSelectedOptions(selectId, values = []) {
  [...byId(selectId).options].forEach((option) => { option.selected = values.includes(option.value); });
}

function updateAccessPreview() {
  const role = roleById(byId("user-role").value);
  const roleScope = role?.outletScope || "selected";
  const all = roleScope === "all";
  byId("user-all-outlets").checked = all;
  byId("user-all-outlets").disabled = true;
  byId("user-outlet-checklist-field").hidden = all;
  document.querySelectorAll("[data-user-outlet]").forEach((input) => { input.disabled = all; });
  const selectedNames = selectedUserOutletIds().map(outletName);
  const outletText = all ? "All Outlet" : selectedNames.length ? selectedNames.join(", ") : "belum ada outlet tugas";
  setText("user-access-preview", `${role?.name || "Role"}: ${role?.responsibility || "akses sesuai role"} Akses data: ${outletText}.`);
}

function calculatePlanExpiryDate(durationDays) {
  const days = Number(durationDays || 0);
  if (days <= 0) return "";
  const d = new Date();
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function updateAiStatusBadge(hasAi) {
  const isAi = Boolean(hasAi);
  if (byId("tenant-ai-face-login")) byId("tenant-ai-face-login").value = isAi ? "1" : "0";
  if (byId("tenant-ai-fingerprint")) byId("tenant-ai-fingerprint").value = isAi ? "1" : "0";

  const badge = byId("tenant-ai-status-badge");
  if (badge) {
    if (isAi) {
      badge.style.background = "#ecfdf5";
      badge.style.borderColor = "#a7f3d0";
      badge.style.color = "#047857";
      badge.innerHTML = `<span>🤖 <strong>Fitur AI Login Aktif</strong> (Termasuk Pemindaian Wajah & Sidik Jari)</span>`;
    } else {
      badge.style.background = "#f8fafc";
      badge.style.borderColor = "#cbd5e1";
      badge.style.color = "#64748b";
      badge.innerHTML = `<span>🔒 <strong>Fitur AI Login Non-Aktif</strong> (Tidak termasuk pada paket ini)</span>`;
    }
  }
}

function applySelectedPlanDefaults(planCode) {
  const code = String(planCode || "").toLowerCase();
  const plans = state.saasPlans || [];
  let plan = plans.find((p) => String(p.code).toLowerCase() === code);

  if (!plan) {
    const fallbackMap = {
      starter: { maxOutlets: 3, durationDays: 90, hasAiBiometrics: false },
      professional: { maxOutlets: 10, durationDays: 365, hasAiBiometrics: true },
      enterprise: { maxOutlets: 999, durationDays: 0, hasAiBiometrics: true },
    };
    plan = fallbackMap[code] || fallbackMap.professional;
  }

  if (byId("tenant-max-outlets")) {
    byId("tenant-max-outlets").value = plan.maxOutlets || 10;
  }
  
  if (byId("tenant-expires-at")) {
    byId("tenant-expires-at").value = calculatePlanExpiryDate(plan.durationDays);
  }

  updateAiStatusBadge(Boolean(plan.hasAiBiometrics));
}

function openApprovalModal(company) {
  if (!company) return;
  byId("approval-company-id").value = company.id;
  setText("approval-company-name", company.name || "-");
  setText("approval-company-plan", `${company.subscriptionPlan || "Professional"} (${company.maxOutlets || 5} Outlet)`);
  setText("approval-admin-email", `${company.adminName || "Admin"} <${company.adminEmail || "email"}>`);
  setText("approval-payment-notes", company.paymentNotes || "Pendaftaran mandiri online.");

  const img = byId("approval-proof-image");
  const link = byId("approval-proof-link");
  const noProof = byId("approval-no-proof");

  if (company.paymentProofUrl) {
    if (img) {
      img.src = company.paymentProofUrl;
      img.style.display = "block";
    }
    if (link) {
      link.href = company.paymentProofUrl;
      link.style.display = "inline-block";
    }
    if (noProof) noProof.style.display = "none";
  } else {
    if (img) img.style.display = "none";
    if (link) link.style.display = "none";
    if (noProof) noProof.style.display = "block";
  }

  openModal("company-approval-modal");
}

function updateRenewalPlanDetails() {
  const planCode = byId("renewal-subscription-plan")?.value;
  const plans = state.saasPlans || [];
  const plan = plans.find((p) => String(p.code).toLowerCase() === String(planCode).toLowerCase()) || plans[0];
  const detailsEl = byId("renewal-plan-details");
  if (detailsEl && plan) {
    const formattedPrice = plan.price ? `Rp ${Number(plan.price).toLocaleString("id-ID")}` : "Gratis / Custom";
    const durationText = plan.durationDays > 0 ? `${plan.durationDays} Hari` : "Unlimited / Permanen";
    const aiText = plan.hasAiBiometrics ? "✅ Termasuk AI Login" : "❌ Tanpa AI Login";
    detailsEl.innerHTML = `
      <strong>Detail Paket ${plan.name || plan.code}:</strong><br>
      • Biaya Perpanjangan: <strong>${formattedPrice}</strong><br>
      • Batas Maksimal Kuota: <strong>${plan.maxOutlets || 5} Outlet</strong><br>
      • Masa Tambahan Aktif: <strong>${durationText}</strong><br>
      • Fitur AI Biometrik: <strong>${aiText}</strong>
    `;
  }
}

function openRenewalModal(company) {
  if (!company) return;
  ensureSaasPlansLoaded();
  byId("renewal-company-id").value = company.id;
  setText("renewal-company-name", company.name || "-");
  setText("renewal-current-expiry", `Kedaluwarsa Saat Ini: ${company.expiresAt || "Belum diatur"} | Status: ${company.status === "10" ? "Aktif" : "Kedaluwarsa/Nonaktif"}`);

  // Reset payment proof fields setiap kali modal dibuka
  const proofFileInput = byId("renewal-payment-proof-file");
  const proofUrlInput  = byId("renewal-payment-proof-url");
  const proofPreview   = byId("renewal-proof-preview");
  const proofImg       = byId("renewal-proof-img");
  const proofStatus    = byId("renewal-proof-status");
  if (proofFileInput) proofFileInput.value = "";
  if (proofUrlInput)  proofUrlInput.value  = "";
  if (proofPreview)   proofPreview.style.display = "none";
  if (proofImg)       proofImg.src = "";
  if (proofStatus)    proofStatus.textContent = "Unggah bukti transfer untuk transaksi perpanjangan ini.";

  const plans = state.saasPlans || [];
  const select = byId("renewal-subscription-plan");
  if (select) {
    select.innerHTML = plans.map((p) => {
      const priceText = p.price ? `Rp ${Number(p.price).toLocaleString("id-ID")}` : "Gratis";
      const selected = String(p.code).toLowerCase() === String(company.subscriptionPlan || "Professional").toLowerCase() ? "selected" : "";
      return `<option value="${p.code}" ${selected}>${p.name || p.code} — ${priceText} (${p.maxOutlets || 5} Outlet, ${p.durationDays || 365} Hari)</option>`;
    }).join("");
  }
  updateRenewalPlanDetails();
  openModal("company-renewal-modal");
}

byId("renewal-subscription-plan")?.addEventListener("change", updateRenewalPlanDetails);

// Upload bukti bayar saat file dipilih
byId("renewal-payment-proof-file")?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const proofStatus = byId("renewal-proof-status");
  if (proofStatus) {
    proofStatus.textContent = "⏳ Sedang mengunggah bukti transfer...";
    proofStatus.style.color = "#b45309";
  }

  const formData = new FormData();
  formData.append("file", file);

  try {
    const result = apiUpload("/api/public/upload-payment-proof", formData);
    const uploadedUrl = result?.url || result?.paymentProofUrl || "";
    if (result?.ok && uploadedUrl) {
      // simpan URL ke hidden input
      const proofUrlInput = byId("renewal-payment-proof-url");
      if (proofUrlInput) proofUrlInput.value = uploadedUrl;

      // tampilkan preview gambar
      const proofPreview = byId("renewal-proof-preview");
      const proofImg     = byId("renewal-proof-img");
      if (proofImg)     proofImg.src = uploadedUrl;
      if (proofPreview) proofPreview.style.display = "flex";

      if (proofStatus) {
        proofStatus.textContent = `✅ Bukti transfer berhasil diunggah: ${file.name}`;
        proofStatus.style.color = "#047857";
      }
    } else {
      // reset file input agar bisa dicoba ulang
      event.target.value = "";
      if (proofStatus) {
        proofStatus.textContent = `❌ Gagal mengunggah: ${result?.message || "Error tidak diketahui."}`;
        proofStatus.style.color = "#dc2626";
      }
    }
  } catch (e) {
    event.target.value = "";
    if (proofStatus) {
      proofStatus.textContent = "❌ Gagal mengunggah bukti transfer.";
      proofStatus.style.color = "#dc2626";
    }
  }
});

byId("company-renewal-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const id = byId("renewal-company-id").value;
  const company = state.companies.find((item) => item.id === id);
  const planCode = byId("renewal-subscription-plan").value;
  const paymentProofUrl = byId("renewal-payment-proof-url")?.value?.trim() || "";
  if (!id || !planCode) return;

  if (!paymentProofUrl) {
    showFeedback("company-feedback", "❌ Bukti transfer pembayaran wajib diunggah terlebih dahulu.");
    byId("renewal-payment-proof-file")?.focus();
    return;
  }

  const btnConfirm = byId("btn-confirm-renewal");
  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.innerHTML = `<span class="button-spinner"></span> Memproses...`;
  }

  showGlobalLoading(`Sedang memperpanjang subscription "${company?.name || id}"...`);
  setTimeout(() => {
    try {
      const res = apiPost(`/api/company/${id}/renew-subscription`, {
        subscriptionPlan: planCode,
        paymentProofUrl: paymentProofUrl,
      });
      hideGlobalLoading();
      if (btnConfirm) {
        btnConfirm.disabled = false;
        btnConfirm.innerHTML = "⏳ Proses Perpanjangan Subscription";
      }
      if (res && (res.ok || res.data?.ok)) {
        closeModal();
        showAlert(res.message || res.data?.message || `Subscription "${company?.name || id}" berhasil diperpanjang.`);
        refreshDataAndTables();
      } else {
        showFeedback("company-feedback", res?.message || "Gagal memperpanjang subscription.");
      }
    } catch (e) {
      hideGlobalLoading();
      if (btnConfirm) {
        btnConfirm.disabled = false;
        btnConfirm.innerHTML = "⏳ Proses Perpanjangan Subscription";
      }
      showFeedback("company-feedback", "Gagal memperpanjang subscription.");
    }
  }, 50);
});

function openSubscriptionAuditModal(companyId = "") {
  const modalTitle = byId("audit-modal-title");
  const company = companyId ? state.companies.find((c) => c.id === companyId) : null;
  if (modalTitle) {
    modalTitle.textContent = company ? `Riwayat & Audit Pembelian SaaS — ${company.name}` : "Riwayat & Audit Pembelian SaaS (Semua Perusahaan)";
  }

  const tbody = byId("audit-logs-table-body");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--muted); padding: 20px;">Memuat riwayat audit...</td></tr>`;
  }
  openModal("company-audit-modal");

  const url = companyId ? `/api/company/${companyId}/subscription-logs` : "/api/saas-subscription-logs";
  const res = apiGet(url);
  const logs = (res && res.ok && Array.isArray(res.data)) ? res.data : (Array.isArray(res) ? res : []);

  const totalCountEl = byId("audit-total-count");
  const totalAmountEl = byId("audit-total-amount");
  if (totalCountEl) totalCountEl.textContent = `${logs.length} Transaksi`;

  const totalSum = logs.reduce((acc, item) => acc + Number(item.pricePaid || 0), 0);
  if (totalAmountEl) totalAmountEl.textContent = `Rp ${totalSum.toLocaleString("id-ID")}`;

  if (!logs.length) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--muted); padding: 20px;">Belum ada riwayat transaksi / perpanjangan SaaS tercatat.</td></tr>`;
    return;
  }

  if (tbody) {
    tbody.innerHTML = logs.map((log) => {
      let badge = `<span class="badge" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">📝 Pendaftaran</span>`;
      if (log.actionType === "RENEWAL") {
        badge = `<span class="badge" style="background:#ecfdf5; color:#047857; border:1px solid #a7f3d0;">🔄 Perpanjangan</span>`;
      } else if (log.actionType === "UPGRADE") {
        badge = `<span class="badge" style="background:#f3e8ff; color:#6b21a8; border:1px solid #e9d5ff;">🚀 Upgrade</span>`;
      } else if (log.actionType === "DOWNGRADE") {
        badge = `<span class="badge" style="background:#fffbeb; color:#b45309; border:1px solid #fde68a;">📉 Downgrade</span>`;
      } else if (log.actionType === "INITIAL_REGISTER") {
        badge = `<span class="badge" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">📝 Daftar Baru</span>`;
      } else if (log.actionType === "RESUBMIT_REGISTER") {
        badge = `<span class="badge" style="background:#fff7ed; color:#c2410c; border:1px solid #fed7aa;">📤 Daftar Ulang</span>`;
      } else if (log.actionType === "REGISTRATION_APPROVED") {
        badge = `<span class="badge" style="background:#f0fdf4; color:#166534; border:1px solid #bbf7d0;">✅ Disetujui</span>`;
      }

      const priceText = log.pricePaid > 0 ? `Rp ${Number(log.pricePaid).toLocaleString("id-ID")}` : "Gratis / Custom";
      const transitionText = log.fromPlanName && log.fromPlanName !== "-"
        ? `${log.fromPlanName} ➔ <strong>${log.toPlanName}</strong>`
        : `<strong>${log.toPlanName}</strong>`;

      const proofBtn = log.paymentProofUrl
        ? `<a href="${log.paymentProofUrl}" target="_blank" style="color:var(--brand); font-weight:600; text-decoration:underline;" title="Lihat Gambar Bukti Transfer">Lihat Bukti</a>`
        : "";

      return `
        <tr>
          <td>
            <strong style="font-size: 13px; color: #1e293b; display: block;">${log.createdAt || "-"}</strong>
            <small style="color: #64748b;">Masa: ${log.durationDays > 0 ? log.durationDays + " Hari" : "Selamanya"}</small>
          </td>
          <td>
            <strong style="color: var(--brand); font-size: 13px;">${log.companyName}</strong>
          </td>
          <td>${badge}</td>
          <td style="font-size: 12px; color: #334155;">${transitionText}</td>
          <td><strong style="color: #047857; font-size: 13px;">${priceText}</strong></td>
          <td style="font-size: 12px; color: #475569;">${log.newExpiresAt || "Selamanya"}</td>
          <td style="font-size: 12px; color: #475569;">
            ${log.createdByName || "System"}<br>
            ${proofBtn}
          </td>
        </tr>
      `;
    }).join("");
  }
}

byId("btn-view-all-saas-audit")?.addEventListener("click", () => {
  openSubscriptionAuditModal("");
});

byId("btn-confirm-approval")?.addEventListener("click", () => {
  const id = byId("approval-company-id").value;
  const company = state.companies.find((item) => item.id === id);
  if (!id) return;

  const btnConfirm = byId("btn-confirm-approval");
  const btnReject = byId("btn-reject-approval");
  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.textContent = "⏳ Memproses Database Tenant...";
  }
  if (btnReject) btnReject.disabled = true;

  showGlobalLoading(`Sedang memproses persetujuan perusahaan "${company?.name || id}" & membuat database tenant baru...`);

  setTimeout(() => {
    try {
      const res = apiPost(`/api/company/${id}/approve`, {});
      hideGlobalLoading();
      if (res && (res.ok || res.data?.ok)) {
        closeModal();
        showAlert(`Pendaftaran perusahaan "${company?.name || id}" berhasil disetujui & diprovisi.`);
        refreshTables();
      } else {
        showFeedback("company-feedback", res?.message || res?.data?.message || "Gagal menyetujui pendaftaran perusahaan.");
      }
    } catch (err) {
      hideGlobalLoading();
      showFeedback("company-feedback", err?.message || "Terjadi kesalahan saat menyetujui pendaftaran.");
    } finally {
      if (btnConfirm) {
        btnConfirm.disabled = false;
        btnConfirm.textContent = "✓ Setujui & Buat Tenant DB";
      }
      if (btnReject) btnReject.disabled = false;
    }
  }, 100);
});

byId("btn-reject-approval")?.addEventListener("click", () => {
  const id = byId("approval-company-id").value;
  const company = state.companies.find((item) => item.id === id);
  if (!id) return;

  const notes = prompt(`Masukkan alasan penolakan pendaftaran perusahaan "${company?.name || id}":`);
  if (notes !== null) {
    const btnConfirm = byId("btn-confirm-approval");
    const btnReject = byId("btn-reject-approval");
    if (btnConfirm) btnConfirm.disabled = true;
    if (btnReject) {
      btnReject.disabled = true;
      btnReject.textContent = "⏳ Memproses Penolakan...";
    }

  showGlobalLoading(`Sedang memproses penolakan pendaftaran perusahaan "${company?.name || id}"...`);

  setTimeout(() => {
    try {
      const res = apiPost(`/api/company/${id}/reject`, { notes });
      hideGlobalLoading();
      if (res && (res.ok || res.data?.ok)) {
        closeModal();
        showAlert(res.message || res.data?.message || `Pendaftaran perusahaan "${company?.name || id}" telah ditolak.`);
        refreshDataAndTables();
      } else {
        showFeedback("company-feedback", res?.message || res?.data?.message || "Gagal menolak pendaftaran perusahaan.");
      }
    } catch (err) {
      hideGlobalLoading();
      showFeedback("company-feedback", err?.message || "Terjadi kesalahan saat menolak pendaftaran.");
    } finally {
      if (btnConfirm) btnConfirm.disabled = false;
      if (btnReject) {
        btnReject.disabled = false;
        btnReject.textContent = "Tolak Pendaftaran";
      }
    }
  }, 100);
  }
});

document.addEventListener("click", (event) => {
  const resendRejectionBtn = event.target.closest("[data-resend-rejection-email]");
  if (resendRejectionBtn) {
    const id = resendRejectionBtn.dataset.resendRejectionEmail;
    resendRejectionBtn.disabled = true;
    resendRejectionBtn.textContent = "⏳ Mengirim...";
    showGlobalLoading("Sedang mengirim ulang email penolakan & link perbaikan...");
    setTimeout(() => {
      try {
        const res = apiPost(`/api/company/${id}/resend-rejection`, {});
        hideGlobalLoading();
        if (res && (res.ok || res.data?.ok)) {
          showAlert(res.message || res.data?.message || "Email penolakan & link perbaikan berhasil dikirim ulang.");
          refreshDataAndTables();
        } else {
          showAlert(res?.message || "Gagal mengirim ulang email penolakan.", "error");
        }
      } catch (e) {
        hideGlobalLoading();
        showAlert("Gagal mengirim ulang email penolakan.", "error");
      } finally {
        resendRejectionBtn.disabled = false;
        resendRejectionBtn.textContent = "📧 Kirim Ulang Link Perbaikan";
      }
    }, 50);
  }

  const renewCompany = event.target.closest("[data-renew-company]");
  if (renewCompany && isSuperAdmin) {
    const id = renewCompany.dataset.renewCompany;
    const company = state.companies.find((item) => item.id === id);
    if (company) openRenewalModal(company);
  }

  const auditBtn = event.target.closest("[data-audit-company]");
  if (auditBtn && isSuperAdmin) {
    const companyId = auditBtn.dataset.auditCompany;
    openSubscriptionAuditModal(companyId);
  }

  const tabButton = event.target.closest("[data-user-tab]");
  if (tabButton) setActiveUserTab(tabButton.dataset.userTab);

  if (event.target.closest("[data-open-company-modal]") && canUsePermission("admin.companies", "create", state, session)) openCompany();
  if (!isSuperAdmin && event.target.closest("[data-open-role-modal]") && canUsePermission("roles.manage", "create", state, session)) openRole();
  if (!isSuperAdmin && event.target.closest("[data-open-user-modal]") && canUsePermission("users.manage", "create", state, session)) {
    activeRoles().length ? openUser() : showFeedback("company-feedback", "Buat role aktif terlebih dahulu sebelum menambahkan user.");
  }
  if (!isSuperAdmin && event.target.closest("[data-open-outlet-modal]") && canUsePermission("outlets.manage", "create", state, session)) openOutlet();
});

function openCompany(company = null) {
  byId("tenant-form").reset();
  byId("tenant-id").value = company?.id || "";
  byId("company-modal-title").textContent = company ? "Edit Perusahaan" : "Tambah Perusahaan Baru";
  byId("tenant-name").value = company?.name || "";
  byId("tenant-route-slug").value = company?.routeSlug || "";
  
  const planCode = company?.subscriptionPlan || "Professional";
  populateTenantPlanOptions(planCode);

  if (company) {
    const planObj = (state.saasPlans || []).find((p) => String(p.code).toLowerCase() === String(planCode).toLowerCase());
    byId("tenant-max-outlets").value = company.maxOutlets || planObj?.maxOutlets || 10;
    byId("tenant-expires-at").value = company.expiresAt ? company.expiresAt.substring(0, 10) : "";
    const hasAi = company.hasAiBiometrics ?? (Boolean(company.aiEnableFaceLogin) || Boolean(company.aiEnableFingerprint));
    updateAiStatusBadge(hasAi);
  } else {
    // New Company: apply default attributes for selected plan automatically
    applySelectedPlanDefaults(planCode);
  }

  byId("tenant-status").value = company?.status || COMMON_STATUS.ACTIVE;
  byId("tenant-admin-name").value = company?.adminName || "";
  byId("tenant-admin-email").value = company?.adminEmail || "";
  
  if (byId("tenant-admin-email")) {
    byId("tenant-admin-email").disabled = Boolean(company?.id);
  }

  setLogoValue("tenant-logo-url", "tenant-logo-preview", company?.logoUrl || "", (company?.name || "IF").slice(0, 2).toUpperCase());
  byId("tenant-logo-file").value = "";
  byId("tenant-theme-color").value = company?.themeColor || "#3B1F8C";
  openModal("company-modal");
}

function openRole(role = null) {
  byId("role-form").reset();
  byId("role-id").value = role?.id || "";
  byId("role-modal-title").textContent = role ? "Edit Role" : "Tambah Role";
  byId("role-name").value = role?.name || "";
  byId("role-outlet-scope").value = role?.outletScope || "selected";
  byId("role-status").value = role?.status || COMMON_STATUS.ACTIVE;
  byId("role-responsibility").value = role?.responsibility || "";
  renderPermissionMatrix(normalizeMatrix(role?.permissionMatrix, role?.permissions || []));
  openModal("role-modal");
}

function openUser(user = null) {
  byId("user-form").reset();
  byId("user-id").value = user?.id || "";
  byId("user-modal-title").textContent = user ? "Edit User" : "Tambah User";
  byId("user-name").value = user?.name || "";
  byId("user-email").value = user?.email || "";
  byId("user-role").value = user?.roleId || activeRoles()[0]?.id || "";
  byId("user-status").value = user?.status || COMMON_STATUS.ACTIVE;
  byId("user-all-outlets").checked = (roleById(byId("user-role").value)?.outletScope || "") === "all";
  const assignedOutlets = new Set(user?.outletIds?.length ? user.outletIds : [activeOutlets()[0]?.id].filter(Boolean));
  document.querySelectorAll("[data-user-outlet]").forEach((input) => { input.checked = assignedOutlets.has(input.value); });
  updateAccessPreview();
  openModal("user-modal");
}

function openOutlet(outlet = null) {
  byId("outlet-form").reset();
  byId("outlet-id").value = outlet?.id || "";
  byId("outlet-modal-title").textContent = outlet ? "Edit Outlet" : "Tambah Outlet";
  byId("outlet-code").value = outlet?.code || `OUT-${String(state.outlets.length + 1).padStart(3, "0")}`;
  byId("outlet-name").value = outlet?.name || "";
  byId("outlet-city").value = outlet?.city || "";
  byId("outlet-status").value = outlet?.status || COMMON_STATUS.ACTIVE;
  openModal("outlet-modal");
}

byId("tenant-subscription-plan")?.addEventListener("change", (e) => {
  applySelectedPlanDefaults(e.target.value);
});

byId("tenant-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canUsePermission("admin.companies", byId("tenant-id").value ? "update" : "create", state, session)) {
    showFeedback("company-feedback", "Anda tidak punya akses untuk menyimpan perusahaan.");
    return;
  }
  const payload = {
    id: byId("tenant-id").value,
    name: byId("tenant-name").value.trim(),
    routeSlug: slugify(byId("tenant-route-slug").value || byId("tenant-name").value),
    subscriptionPlan: byId("tenant-subscription-plan").value,
    maxOutlets: Number(byId("tenant-max-outlets").value || 5),
    expiresAt: byId("tenant-expires-at").value || "",
    aiEnableFaceLogin: byId("tenant-ai-face-login") ? (byId("tenant-ai-face-login").type === "checkbox" ? byId("tenant-ai-face-login").checked : byId("tenant-ai-face-login").value === "1") : true,
    aiEnableFingerprint: byId("tenant-ai-fingerprint") ? (byId("tenant-ai-fingerprint").type === "checkbox" ? byId("tenant-ai-fingerprint").checked : byId("tenant-ai-fingerprint").value === "1") : true,
    status: byId("tenant-status").value,
    adminName: byId("tenant-admin-name").value.trim(),
    adminEmail: byId("tenant-admin-email").value.trim(),
    logoUrl: byId("tenant-logo-url").value.trim(),
    themeColor: byId("tenant-theme-color").value
  };
  const id = payload.id;
  showGlobalLoading(id ? `Sedang memperbarui data perusahaan "${payload.name}"...` : `Sedang membuat perusahaan "${payload.name}" & provisi database...`);
  setTimeout(() => {
    try {
      const result = id ? putAccess(`/api/company/${id}`, payload) : postAccess("/api/company", payload);
      hideGlobalLoading();
      if (result) {
        closeModal();
        refreshDataAndTables();
        const invitation = result.data?.invitation;
        showAlert(id
          ? `Perusahaan "${payload.name}" berhasil diperbarui.`
          : (String(invitation?.status) === INVITATION_STATUS.SENT || invitation?.status === "sent")
            ? `Perusahaan "${payload.name}" dibuat dan email aktivasi admin telah dikirim.`
            : invitation?.message || `Perusahaan "${payload.name}" dibuat, tetapi email aktivasi perlu dikirim ulang.`);
      }
    } catch (e) {
      hideGlobalLoading();
      showFeedback("company-feedback", "Gagal menyimpan data perusahaan.");
    }
  }, 50);
});

byId("role-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canUsePermission("roles.manage", byId("role-id").value ? "update" : "create", state, session)) {
    showFeedback("company-feedback", "Anda tidak punya akses untuk menyimpan role.");
    return;
  }
  const permissionMatrix = readPermissionMatrix();
  const permissions = legacyPermissionsFromMatrix(permissionMatrix);
  const payload = {
    id: byId("role-id").value,
    companyId: state.activeCompanyId,
    name: byId("role-name").value.trim(),
    outletScope: byId("role-outlet-scope").value,
    status: byId("role-status").value,
    responsibility: byId("role-responsibility").value.trim(),
    permissions,
    permissionMatrix
  };
  const id = payload.id;
  showGlobalLoading(`Sedang menyimpan role "${payload.name}"...`);
  setTimeout(() => {
    try {
      const result = id ? putAccess(`/api/role/${id}`, payload) : postAccess("/api/role", payload);
      hideGlobalLoading();
      if (result) {
        closeModal();
        refreshDataAndTables();
        showAlert(`Role "${payload.name}" tersimpan ke database.`);
      }
    } catch (e) {
      hideGlobalLoading();
      showFeedback("company-feedback", "Gagal menyimpan role.");
    }
  }, 50);
});

byId("user-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canUsePermission("users.manage", byId("user-id").value ? "update" : "create", state, session)) {
    showFeedback("company-feedback", "Anda tidak punya akses untuk menyimpan user.");
    return;
  }
  const role = roleById(byId("user-role").value);
  const allOutlets = role?.outletScope === "all";
  const payload = {
    id: byId("user-id").value,
    companyId: state.activeCompanyId,
    name: byId("user-name").value.trim(),
    email: byId("user-email").value.trim(),
    role: role?.name || "",
    roleId: role?.id || "",
    status: byId("user-status").value,
    outletScope: allOutlets ? "all" : "selected",
    canViewAllOutlets: allOutlets,
    outletIds: allOutlets ? [] : selectedUserOutletIds()
  };
  if (!payload.outletIds.length && !allOutlets && activeOutlets()[0]) payload.outletIds = [activeOutlets()[0].id];
  const id = payload.id;
  showGlobalLoading(`Sedang menyimpan data user "${payload.name}"...`);
  setTimeout(() => {
    try {
      const result = id ? putAccess(`/api/user/${id}`, payload) : postAccess("/api/user", payload);
      hideGlobalLoading();
      if (result) {
        closeModal();
        refreshDataAndTables();
        const invitation = result.data?.invitation;
        showAlert(id
          ? `User "${payload.name}" berhasil diperbarui.`
          : (String(invitation?.status) === INVITATION_STATUS.SENT || invitation?.status === "sent")
            ? `User "${payload.name}" dibuat dan email aktivasi telah dikirim.`
            : invitation?.message || `User "${payload.name}" dibuat, tetapi email aktivasi perlu dikirim ulang.`);
      }
    } catch (e) {
      hideGlobalLoading();
      showFeedback("company-feedback", "Gagal menyimpan data user.");
    }
  }, 50);
});

byId("outlet-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canUsePermission("outlets.manage", byId("outlet-id").value ? "update" : "create", state, session)) {
    showFeedback("company-feedback", "Anda tidak punya akses untuk menyimpan outlet.");
    return;
  }
  const payload = { id: byId("outlet-id").value, companyId: state.activeCompanyId, code: byId("outlet-code").value.trim(), name: byId("outlet-name").value.trim(), city: byId("outlet-city").value.trim(), status: byId("outlet-status").value };
  const id = payload.id;
  showGlobalLoading(`Sedang menyimpan outlet "${payload.name}"...`);
  setTimeout(() => {
    try {
      const result = id ? putAccess(`/api/outlet/${id}`, payload) : postAccess("/api/outlet", payload);
      hideGlobalLoading();
      if (result) {
        closeModal();
        refreshDataAndTables();
        showAlert(`Outlet "${payload.name}" tersimpan ke database.`);
      }
    } catch (e) {
      hideGlobalLoading();
      showFeedback("company-feedback", "Gagal menyimpan data outlet.");
    }
  }, 50);
});

document.addEventListener("click", (event) => {
  const tabButton = event.target.closest("[data-user-tab]");
  if (tabButton) setActiveUserTab(tabButton.dataset.userTab);

  if (event.target.closest("[data-open-company-modal]") && canUsePermission("admin.companies", "create", state, session)) openCompany();
  if (!isSuperAdmin && event.target.closest("[data-open-role-modal]") && canUsePermission("roles.manage", "create", state, session)) openRole();
  if (!isSuperAdmin && event.target.closest("[data-open-user-modal]") && canUsePermission("users.manage", "create", state, session)) {
    activeRoles().length ? openUser() : showFeedback("company-feedback", "Buat role aktif terlebih dahulu sebelum menambahkan user.");
  }
  if (!isSuperAdmin && event.target.closest("[data-open-outlet-modal]") && canUsePermission("outlets.manage", "create", state, session)) openOutlet();

  const editCompany = event.target.closest("[data-edit-company]");
  if (editCompany && canUsePermission("admin.companies", "update", state, session)) openCompany(state.companies.find((company) => company.id === editCompany.dataset.editCompany));
  const selectCompany = event.target.closest("[data-select-company]");
  if (selectCompany && !isSuperAdmin) {
    state.activeCompanyId = selectCompany.dataset.selectCompany;
    refreshTables();
  }
  const toggleCompany = event.target.closest("[data-toggle-company]");
  if (toggleCompany && canUsePermission("admin.companies", "delete", state, session)) {
    const company = state.companies.find((item) => item.id === toggleCompany.dataset.toggleCompany);
    if (company) {
      const nextStatus = isInactiveStatus(company.status) ? COMMON_STATUS.ACTIVE : "inactive";
      showGlobalLoading(`Sedang mengubah status perusahaan "${company.name}"...`);
      setTimeout(() => {
        const res = nextStatus === COMMON_STATUS.ACTIVE
          ? putAccess(`/api/company/${company.id}`, { ...company, status: COMMON_STATUS.ACTIVE })
          : deleteAccess(`/api/company/${company.id}`);
        hideGlobalLoading();
        if (res) {
          showAlert(`Status perusahaan "${company.name}" berhasil diperbarui.`);
          refreshDataAndTables();
        }
      }, 50);
    }
  }

  const approveCompany = event.target.closest("[data-approve-company]");
  if (approveCompany && isSuperAdmin) {
    const id = approveCompany.dataset.approveCompany;
    const company = state.companies.find((item) => item.id === id);
    if (company) openApprovalModal(company);
  }

  const rejectCompany = event.target.closest("[data-reject-company]");
  if (rejectCompany && isSuperAdmin) {
    const id = rejectCompany.dataset.rejectCompany;
    const company = state.companies.find((item) => item.id === id);
    const notes = prompt(`Masukkan alasan penolakan pendaftaran perusahaan "${company?.name || id}":`);
    if (notes !== null) {
      showGlobalLoading(`Sedang memproses penolakan pendaftaran perusahaan "${company?.name || id}"...`);
      setTimeout(() => {
        const res = apiPost(`/api/company/${id}/reject`, { notes });
        hideGlobalLoading();
        if (res && (res.ok || res.data?.ok)) {
          showAlert(res.message || res.data?.message || `Pendaftaran perusahaan "${company?.name || id}" telah ditolak.`);
          refreshDataAndTables();
        } else {
          showFeedback("company-feedback", res?.message || res?.data?.message || "Gagal menolak pendaftaran perusahaan.");
        }
      }, 50);
    }
  }

  const resendCompanyInvite = event.target.closest("[data-resend-company-invite]");
  if (resendCompanyInvite && canUsePermission("admin.companies", "update", state, session)) {
    showGlobalLoading("Sedang mengirim ulang email undangan admin perusahaan...");
    setTimeout(() => {
      const result = apiPost(`/api/company/${resendCompanyInvite.dataset.resendCompanyInvite}/invite-admin`, {});
      hideGlobalLoading();
      if (result?.ok && (String(result.data?.status) === INVITATION_STATUS.SENT || result.data?.status === "sent")) {
        showAlert("Email undangan admin perusahaan dikirim ulang.");
        refreshDataAndTables();
      } else {
        showFeedback("company-feedback", result?.data?.message || result?.message || "Undangan gagal dikirim ulang.");
      }
    }, 50);
  }

  const editRole = event.target.closest("[data-edit-role]");
  if (editRole && !isSuperAdmin && canUsePermission("roles.manage", "update", state, session)) openRole(state.companyRoles.find((role) => role.id === editRole.dataset.editRole));
  const toggleRole = event.target.closest("[data-toggle-role]");
  if (toggleRole && !isSuperAdmin && canUsePermission("roles.manage", "delete", state, session)) {
    const role = state.companyRoles.find((item) => item.id === toggleRole.dataset.toggleRole);
    if (role) {
      showGlobalLoading(`Sedang mengubah status role "${role.name}"...`);
      setTimeout(() => {
        const res = isInactiveStatus(role.status) ? putAccess(`/api/role/${role.id}`, { ...role, status: COMMON_STATUS.ACTIVE }) : deleteAccess(`/api/role/${role.id}`);
        hideGlobalLoading();
        if (res) {
          showAlert(`Status role "${role.name}" berhasil diperbarui.`);
          refreshDataAndTables();
        }
      }, 50);
    }
  }

  const editUser = event.target.closest("[data-edit-user]");
  if (editUser && !isSuperAdmin && canUsePermission("users.manage", "update", state, session)) openUser(state.users.find((user) => user.id === editUser.dataset.editUser));
  const toggleUser = event.target.closest("[data-toggle-user]");
  if (toggleUser && !isSuperAdmin && canUsePermission("users.manage", "delete", state, session)) {
    const user = state.users.find((item) => item.id === toggleUser.dataset.toggleUser);
    if (user) {
      showGlobalLoading(`Sedang mengubah status user "${user.name}"...`);
      setTimeout(() => {
        const res = isInactiveStatus(user.status) ? putAccess(`/api/user/${user.id}`, { ...user, status: COMMON_STATUS.ACTIVE }) : deleteAccess(`/api/user/${user.id}`);
        hideGlobalLoading();
        if (res) {
          showAlert(`Status user "${user.name}" berhasil diperbarui.`);
          refreshDataAndTables();
        }
      }, 50);
    }
  }
  const resendUserInvite = event.target.closest("[data-resend-user-invite]");
  if (resendUserInvite && !isSuperAdmin && canUsePermission("users.manage", "create", state, session)) {
    const numericCompanyId = state.activeCompanyId === "company-main" ? 1 : String(state.activeCompanyId || "").replace("company-", "");
    showGlobalLoading("Sedang mengirim ulang email aktivasi user...");
    setTimeout(() => {
      const result = apiPost(`/api/user/${resendUserInvite.dataset.resendUserInvite}/invite`, { company_id: Number(numericCompanyId) || 1 });
      hideGlobalLoading();
      if (result?.ok && (String(result.data?.status) === INVITATION_STATUS.SENT || result.data?.status === "sent")) {
        showAlert("Email undangan user dikirim ulang.");
        refreshDataAndTables();
      } else {
        showFeedback("company-feedback", result?.data?.message || result?.message || "Undangan gagal dikirim ulang.");
      }
    }, 50);
  }

  const editOutlet = event.target.closest("[data-edit-outlet]");
  if (editOutlet && !isSuperAdmin && canUsePermission("outlets.manage", "update", state, session)) openOutlet(state.outlets.find((outlet) => outlet.id === editOutlet.dataset.editOutlet));
  const toggleOutlet = event.target.closest("[data-toggle-outlet]");
  if (toggleOutlet && !isSuperAdmin && canUsePermission("outlets.manage", "delete", state, session)) {
    const outlet = state.outlets.find((item) => item.id === toggleOutlet.dataset.toggleOutlet);
    if (outlet) {
      showGlobalLoading(`Sedang mengubah status outlet "${outlet.name}"...`);
      setTimeout(() => {
        const res = isInactiveStatus(outlet.status) ? putAccess(`/api/outlet/${outlet.id}`, { ...outlet, status: COMMON_STATUS.ACTIVE }) : deleteAccess(`/api/outlet/${outlet.id}`);
        hideGlobalLoading();
        if (res) {
          showAlert(`Status outlet "${outlet.name}" berhasil diperbarui.`);
          refreshDataAndTables();
        }
      }, 50);
    }
  }

  if (event.target.closest("[data-close-modal]") || event.target.matches("[data-modal-backdrop]")) closeModal();
});

document.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-permission-module]");
  if (!checkbox) return;
  const moduleKey = checkbox.dataset.permissionModule;
  const action = checkbox.dataset.permissionAction;
  const rowInputs = [...document.querySelectorAll(`[data-permission-module="${moduleKey}"]`)];
  const readInput = rowInputs.find((input) => input.dataset.permissionAction === "read");
  if (checkbox.checked && action !== "read" && readInput) {
    readInput.checked = true;
  }
  if (!checkbox.checked && action === "read") {
    rowInputs.forEach((input) => { input.checked = false; });
  }
  updatePermissionPreview();
});

byId("tenant-name").addEventListener("input", () => {
  if (!byId("tenant-id").value && !byId("tenant-route-slug").value.trim()) {
    byId("tenant-route-slug").value = slugify(byId("tenant-name").value);
  }
});

byId("tenant-logo-file").addEventListener("change", (event) => {
  uploadLogo(event.target.files?.[0], "tenant-logo-url", "tenant-logo-preview");
});

["user-role", "user-all-outlets"].forEach((id) => {
  byId(id).addEventListener("input", updateAccessPreview);
  byId(id).addEventListener("change", updateAccessPreview);
});

document.addEventListener("change", (event) => {
  if (event.target.closest("[data-user-outlet]")) updateAccessPreview();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

refreshTables();
applyAccessMode();
setActiveUserTab(activeUserTab);

const setupAction = setupParams.get("create");
if (!isSuperAdmin && setupParams.get("onboarding") === "1") {
  if (setupAction === "outlet" && canUsePermission("outlets.manage", "create", state, session)) openOutlet();
  if (setupAction === "role" && canUsePermission("roles.manage", "create", state, session)) openRole();
  if (setupAction === "user" && canUsePermission("users.manage", "create", state, session)) {
    activeRoles().length ? openUser() : showFeedback("company-feedback", "Buat role terlebih dahulu sebelum mengundang user.");
  }
}
