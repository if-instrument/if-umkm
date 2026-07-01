import { renderLayout } from "../layout.js?v=coffee-v137";
import { apiDelete, apiGet, apiPost, apiPut, apiUpload, applyPermissionControls, canUsePermission, loadSession, loadState } from "../store.js?v=coffee-v137";
import { byId, setText, showAlert, showFeedback } from "../dom.js";
import { enhanceAllDataTables } from "../datatable.js";
import { COMMON_STATUS, INVITATION_STATUS, isActiveStatus, isInactiveStatus, statusLabel } from "../status-codes.js";

renderLayout();
let state = loadState();
const session = loadSession();
const isSuperAdmin = session?.authType === "super_admin";
const setupParams = new URLSearchParams(window.location.search);
let activeUserTab = ["users", "roles", "outlets"].includes(setupParams.get("tab")) ? setupParams.get("tab") : "users";

function applyAccessData(data) {
  if (!data) return;
  state.activeCompanyId = isSuperAdmin ? (data.activeCompanyId || state.activeCompanyId) : (session?.companyId || data.activeCompanyId || state.activeCompanyId);
  state.companies = data.companies || [];
  state.outlets = data.outlets || [];
  state.companyRoles = data.companyRoles || [];
  state.users = data.users || [];
}

function loadAccessData() {
  const companies = apiGet("/api/company?per_page=100");
  const activeCompanyId = isSuperAdmin ? (companies?.data?.items?.[0]?.id || state.activeCompanyId) : session?.companyId;
  const companyIdParam = activeCompanyId ? `&companyId=${encodeURIComponent(activeCompanyId)}` : "";
  const numericCompanyId = activeCompanyId === "company-main" ? 1 : String(activeCompanyId || "").replace("company-", "");
  const outlets = isSuperAdmin ? { data: { items: [] } } : apiGet(`/api/outlet?per_page=100${companyIdParam}`);
  const roles = isSuperAdmin ? { data: { items: [] } } : apiGet(`/api/role?per_page=100${companyIdParam}`);
  const users = isSuperAdmin ? { data: { items: [] } } : apiGet(`/api/user?company_id=${numericCompanyId}&per_page=100`);
  applyAccessData({
    activeCompanyId,
    companies: companies?.data?.items || [],
    outlets: outlets?.data?.items || [],
    companyRoles: roles?.data?.items || [],
    users: users?.data?.items || []
  });
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
  return state.companies.find((company) => company.id === state.activeCompanyId) || state.companies[0];
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
  byId("company-table").innerHTML = state.companies.map((company) => `
    <tr>
      <td><strong>${company.name}</strong><br><small>/${company.routeSlug || "-"}${company.id === state.activeCompanyId ? " · Perusahaan aktif" : ""}</small>${company.dbName ? `<br><small>DB: ${company.dbName}</small>` : ""}</td>
      <td>${company.adminName}<br><small>${company.adminEmail}</small><br>${statusPill(company.adminStatus)}</td>
      <td><span class="theme-swatch" style="background:${company.themeColor || "#6e3a16"}"></span>${company.logoUrl ? " Logo diset" : "Logo belum diset"}</td>
      <td>${statusPill(company.status)}</td>
      <td>
        <div class="row-actions">
          <button class="ghost-button compact-button" data-edit-company="${company.id}" data-permission="admin.companies:update" type="button">Edit</button>
          ${String(company.adminStatus) === INVITATION_STATUS.PENDING || company.adminStatus === "invited" ? `<button class="ghost-button compact-button" data-resend-company-invite="${company.id}" data-permission="admin.companies:update" type="button">Kirim Ulang Undangan</button>` : ""}
          ${isSuperAdmin ? "" : `<button class="ghost-button compact-button" data-select-company="${company.id}" ${company.id === state.activeCompanyId ? "disabled" : ""} type="button">Kelola</button>`}
          <button class="ghost-button compact-button" data-toggle-company="${company.id}" data-permission="admin.companies:delete" type="button">${isActiveStatus(company.status) ? "Nonaktif" : "Aktifkan"}</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function applyBranding() {
  const brandMark = document.querySelector(".brand-mark");
  const brandTitle = document.querySelector(".brand h1");
  const brandSubtitle = document.querySelector(".brand p");
  if (isSuperAdmin) {
    document.documentElement.style.setProperty("--brand", "#6e3a16");
    if (brandMark) {
      brandMark.classList.add("app-brand-logo");
      brandMark.innerHTML = `<img src="/assets/if-instrument-logo.jpg" alt="IF Instrument">`;
    }
    if (brandTitle) brandTitle.textContent = "IF Instrument";
    if (brandSubtitle) brandSubtitle.textContent = "UMKM Solution";
    return;
  }
  const company = activeCompany();
  document.documentElement.style.setProperty("--brand", company.themeColor || "#6e3a16");
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
  state.settings.companyName = company.name;
  state.settings.companyLogoUrl = company.logoUrl;
  state.settings.themeColor = company.themeColor;
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

function openCompany(company = null) {
  byId("tenant-form").reset();
  byId("tenant-id").value = company?.id || "";
  byId("company-modal-title").textContent = company ? "Edit Perusahaan" : "Tambah Perusahaan";
  byId("tenant-name").value = company?.name || "";
  byId("tenant-route-slug").value = company?.routeSlug || "";
  byId("tenant-status").value = company?.status || COMMON_STATUS.ACTIVE;
  byId("tenant-admin-name").value = company?.adminName || "";
  byId("tenant-admin-email").value = company?.adminEmail || "";
  setLogoValue("tenant-logo-url", "tenant-logo-preview", company?.logoUrl || "", (company?.name || "IF").slice(0, 2).toUpperCase());
  byId("tenant-logo-file").value = "";
  byId("tenant-theme-color").value = company?.themeColor || "#6e3a16";
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
    status: byId("tenant-status").value,
    adminName: byId("tenant-admin-name").value.trim(),
    adminEmail: byId("tenant-admin-email").value.trim(),
    logoUrl: byId("tenant-logo-url").value.trim(),
    themeColor: byId("tenant-theme-color").value
  };
  const id = payload.id;
  const result = id ? putAccess(`/api/company/${id}`, payload) : postAccess("/api/company", payload);
  if (result) {
    closeModal();
    refreshTables();
    const invitation = result.data?.invitation;
    showAlert(id
      ? "Perusahaan berhasil diperbarui."
      : (String(invitation?.status) === INVITATION_STATUS.SENT || invitation?.status === "sent")
        ? "Perusahaan dibuat dan email aktivasi admin telah dikirim."
        : invitation?.message || "Perusahaan dibuat, tetapi email aktivasi perlu dikirim ulang.");
  }
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
  if (id ? putAccess(`/api/role/${id}`, payload) : postAccess("/api/role", payload)) {
    closeModal();
    refreshTables();
    showAlert(`Role ${payload.name} tersimpan ke database dengan ${Object.keys(payload.permissionMatrix).length} modul permission.`);
  }
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
  const result = id ? putAccess(`/api/user/${id}`, payload) : postAccess("/api/user", payload);
  if (result) {
    closeModal();
    refreshTables();
    const invitation = result.data?.invitation;
    showAlert(id
      ? `User ${payload.name} diperbarui.`
      : (String(invitation?.status) === INVITATION_STATUS.SENT || invitation?.status === "sent")
        ? `User ${payload.name} dibuat dan email aktivasi telah dikirim.`
        : invitation?.message || `User ${payload.name} dibuat, tetapi email aktivasi perlu dikirim ulang.`);
  }
});

byId("outlet-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canUsePermission("outlets.manage", byId("outlet-id").value ? "update" : "create", state, session)) {
    showFeedback("company-feedback", "Anda tidak punya akses untuk menyimpan outlet.");
    return;
  }
  const payload = { id: byId("outlet-id").value, companyId: state.activeCompanyId, code: byId("outlet-code").value.trim(), name: byId("outlet-name").value.trim(), city: byId("outlet-city").value.trim(), status: byId("outlet-status").value };
  const id = payload.id;
  if (id ? putAccess(`/api/outlet/${id}`, payload) : postAccess("/api/outlet", payload)) {
    closeModal();
    refreshTables();
    showAlert(`Outlet ${payload.name} tersimpan ke database.`);
  }
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
    if (company && (isInactiveStatus(company.status) ? putAccess(`/api/company/${company.id}`, { ...company, status: COMMON_STATUS.ACTIVE }) : deleteAccess(`/api/company/${company.id}`))) refreshTables();
  }
  const resendCompanyInvite = event.target.closest("[data-resend-company-invite]");
  if (resendCompanyInvite && canUsePermission("admin.companies", "update", state, session)) {
    const result = apiPost(`/api/company/${resendCompanyInvite.dataset.resendCompanyInvite}/invite-admin`, {});
    result?.ok && (String(result.data?.status) === INVITATION_STATUS.SENT || result.data?.status === "sent")
      ? showAlert("Email undangan admin perusahaan dikirim ulang.")
      : showFeedback("company-feedback", result?.data?.message || result?.message || "Undangan gagal dikirim ulang.");
  }

  const editRole = event.target.closest("[data-edit-role]");
  if (editRole && !isSuperAdmin && canUsePermission("roles.manage", "update", state, session)) openRole(state.companyRoles.find((role) => role.id === editRole.dataset.editRole));
  const toggleRole = event.target.closest("[data-toggle-role]");
  if (toggleRole && !isSuperAdmin && canUsePermission("roles.manage", "delete", state, session)) {
    const role = state.companyRoles.find((item) => item.id === toggleRole.dataset.toggleRole);
    if (role && (isInactiveStatus(role.status) ? putAccess(`/api/role/${role.id}`, { ...role, status: COMMON_STATUS.ACTIVE }) : deleteAccess(`/api/role/${role.id}`))) refreshTables();
  }

  const editUser = event.target.closest("[data-edit-user]");
  if (editUser && !isSuperAdmin && canUsePermission("users.manage", "update", state, session)) openUser(state.users.find((user) => user.id === editUser.dataset.editUser));
  const toggleUser = event.target.closest("[data-toggle-user]");
  if (toggleUser && !isSuperAdmin && canUsePermission("users.manage", "delete", state, session)) {
    const user = state.users.find((item) => item.id === toggleUser.dataset.toggleUser);
    if (user && (isInactiveStatus(user.status) ? putAccess(`/api/user/${user.id}`, { ...user, status: COMMON_STATUS.ACTIVE }) : deleteAccess(`/api/user/${user.id}`))) refreshTables();
  }
  const resendUserInvite = event.target.closest("[data-resend-user-invite]");
  if (resendUserInvite && !isSuperAdmin && canUsePermission("users.manage", "create", state, session)) {
    const numericCompanyId = state.activeCompanyId === "company-main" ? 1 : String(state.activeCompanyId || "").replace("company-", "");
    const result = apiPost(`/api/user/${resendUserInvite.dataset.resendUserInvite}/invite`, { company_id: Number(numericCompanyId) || 1 });
    result?.ok && (String(result.data?.status) === INVITATION_STATUS.SENT || result.data?.status === "sent")
      ? showAlert("Email undangan user dikirim ulang.")
      : showFeedback("company-feedback", result?.data?.message || result?.message || "Undangan gagal dikirim ulang.");
  }

  const editOutlet = event.target.closest("[data-edit-outlet]");
  if (editOutlet && !isSuperAdmin && canUsePermission("outlets.manage", "update", state, session)) openOutlet(state.outlets.find((outlet) => outlet.id === editOutlet.dataset.editOutlet));
  const toggleOutlet = event.target.closest("[data-toggle-outlet]");
  if (toggleOutlet && !isSuperAdmin && canUsePermission("outlets.manage", "delete", state, session)) {
    const outlet = state.outlets.find((item) => item.id === toggleOutlet.dataset.toggleOutlet);
    if (outlet && (isInactiveStatus(outlet.status) ? putAccess(`/api/outlet/${outlet.id}`, { ...outlet, status: COMMON_STATUS.ACTIVE }) : deleteAccess(`/api/outlet/${outlet.id}`))) refreshTables();
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
