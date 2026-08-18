import { state, session, isSuperAdmin, activeUserTab } from "./users-state.js";
import {
  activeCompany,
  activeOutlets,
  activeRoles,
  roleById,
  outletName,
  userOutletLabel,
  selectedUserOutletIds,
  statusPill,
  setLogoValue,
  calculatePlanExpiryDate
} from "./users-helpers.js";
import { renderPermissionMatrix, normalizeMatrix } from "./users-matrix.js";
import { renderRoles } from "./users-roles.js";
import { renderOutlets } from "./users-outlets.js";
import { renderCompanies, populateTenantPlanOptions } from "./users-companies.js";
import { byId, setText } from "../../dom.js";
import { COMMON_STATUS, INVITATION_STATUS, isActiveStatus } from "../../status-codes.js";
import { applyPermissionControls, canUsePermission } from "../../store.js";
import { enhanceAllDataTables } from "../../datatable.js";
import { applyBrandTheme } from "../../layout.js";

let setActiveUserTabHandler = null;

export function setModalsCallbacks({ setActiveUserTab }) {
  if (setActiveUserTab) setActiveUserTabHandler = setActiveUserTab;
}

export function openModal(id) {
  const backdrop = document.querySelector("[data-modal-backdrop]");
  if (backdrop) backdrop.hidden = false;
  const modal = byId(id);
  if (modal) modal.hidden = false;
  document.body.classList.add("modal-open");
}

export function closeModal() {
  const backdrop = document.querySelector("[data-modal-backdrop]");
  if (backdrop) backdrop.hidden = true;
  document.querySelectorAll(".modal-dialog").forEach((modal) => { modal.hidden = true; });
  document.body.classList.remove("modal-open");
}

export function setSelectedOptions(selectId, values = []) {
  const select = byId(selectId);
  if (!select) return;
  [...select.options].forEach((option) => { option.selected = values.includes(option.value); });
}

export function updateAccessPreview() {
  const roleSelect = byId("user-role");
  if (!roleSelect) return;
  const role = roleById(roleSelect.value);
  const roleScope = role?.outletScope || "selected";
  const all = roleScope === "all";
  const allOutletsCheckbox = byId("user-all-outlets");
  if (allOutletsCheckbox) {
    allOutletsCheckbox.checked = all;
    allOutletsCheckbox.disabled = true;
  }
  const checklistField = byId("user-outlet-checklist-field");
  if (checklistField) checklistField.hidden = all;
  document.querySelectorAll("[data-user-outlet]").forEach((input) => { input.disabled = all; });
  const selectedNames = selectedUserOutletIds().map(outletName);
  const outletText = all ? "All Outlet" : selectedNames.length ? selectedNames.join(", ") : "belum ada outlet tugas";
  setText("user-access-preview", `${role?.name || "Role"}: ${role?.responsibility || "akses sesuai role"} Akses data: ${outletText}.`);
}

export function renderUsers() {
  const table = byId("user-table");
  if (!table) return;

  const users = (state.users || []).filter((user) => user.companyId === state.activeCompanyId && user.authType !== "super_admin");
  table.innerHTML = users.map((user) => {
    const role = roleById(user.roleId) || (state.companyRoles || []).find((item) => item.name === user.role);
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

export function renderOptions() {
  const roleSelect = byId("user-role");
  if (roleSelect) {
    roleSelect.innerHTML = activeRoles().map((role) => `<option value="${role.id}">${role.name}</option>`).join("");
  }
  const outletChecklist = byId("user-outlet-checklist");
  if (outletChecklist) {
    outletChecklist.innerHTML = activeOutlets().map((outlet) => `
      <label class="outlet-checkbox-card">
        <input data-user-outlet type="checkbox" value="${outlet.id}" />
        <span><strong>${outlet.name}</strong><small>${outlet.city || "Area belum diisi"}</small></span>
      </label>
    `).join("");
  }
}

export function applyBranding() {
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
}

export function refreshTables() {
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
  if (setActiveUserTabHandler) setActiveUserTabHandler(activeUserTab);
  applyAccessMode();
}

export function applyAccessMode() {
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

export function updateAiStatusBadge(hasAi) {
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

export function applySelectedPlanDefaults(planCode) {
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

export function openCompany(company = null) {
  byId("tenant-form")?.reset();
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
    applySelectedPlanDefaults(planCode);
  }

  byId("tenant-status").value = company?.status || COMMON_STATUS.ACTIVE;
  byId("tenant-admin-name").value = company?.adminName || "";
  byId("tenant-admin-email").value = company?.adminEmail || "";
  
  if (byId("tenant-admin-email")) {
    byId("tenant-admin-email").disabled = Boolean(company?.id);
  }

  setLogoValue("tenant-logo-url", "tenant-logo-preview", company?.logoUrl || "", (company?.name || "IF").slice(0, 2).toUpperCase());
  if (byId("tenant-logo-file")) byId("tenant-logo-file").value = "";
  byId("tenant-theme-color").value = company?.themeColor || "#3B1F8C";
  openModal("company-modal");
}

export function openRole(role = null) {
  byId("role-form")?.reset();
  byId("role-id").value = role?.id || "";
  byId("role-modal-title").textContent = role ? "Edit Role" : "Tambah Role";
  byId("role-name").value = role?.name || "";
  byId("role-outlet-scope").value = role?.outletScope || "selected";
  byId("role-status").value = role?.status || COMMON_STATUS.ACTIVE;
  byId("role-responsibility").value = role?.responsibility || "";
  renderPermissionMatrix(normalizeMatrix(role?.permissionMatrix, role?.permissions || []));
  openModal("role-modal");
}

export function openUser(user = null) {
  byId("user-form")?.reset();
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

export function openOutlet(outlet = null) {
  byId("outlet-form")?.reset();
  byId("outlet-id").value = outlet?.id || "";
  byId("outlet-modal-title").textContent = outlet ? "Edit Outlet" : "Tambah Outlet";
  byId("outlet-code").value = outlet?.code || `OUT-${String((state.outlets || []).length + 1).padStart(3, "0")}`;
  byId("outlet-name").value = outlet?.name || "";
  byId("outlet-city").value = outlet?.city || "";
  byId("outlet-status").value = outlet?.status || COMMON_STATUS.ACTIVE;
  openModal("outlet-modal");
}
