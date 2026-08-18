import { state, session } from "./users-state.js";
import { byId } from "../../dom.js";
import { INVITATION_STATUS, isActiveStatus, isInactiveStatus, statusLabel } from "../../status-codes.js";

export function statusPill(status) {
  if (String(status) === INVITATION_STATUS.PENDING || status === "invited") return `<span class="status-pill status-warning">Diundang</span>`;
  return `<span class="status-pill ${isActiveStatus(status) ? "status-ok" : "status-empty"}">${isActiveStatus(status) ? "Aktif" : statusLabel(status, "common")}</span>`;
}

export function activeCompany() {
  return (state.companies || []).find((company) => company.id === state.activeCompanyId) || (state.companies || [])[0] || {};
}

export function activeOutlets() {
  return state.outlets.filter((outlet) => outlet.companyId === state.activeCompanyId && !isInactiveStatus(outlet.status));
}

export function activeRoles() {
  return state.companyRoles.filter((role) => role.companyId === state.activeCompanyId && !isInactiveStatus(role.status));
}

export function roleById(id) {
  return state.companyRoles.find((role) => role.id === id);
}

export function outletName(id) {
  return state.outlets.find((outlet) => outlet.id === id)?.name || "Outlet tidak ditemukan";
}

export function userOutletLabel(user) {
  if (user.outletScope === "all" || user.canViewAllOutlets) return "All Outlet";
  const names = (user.outletIds || []).map(outletName);
  return names.length ? names.join(", ") : "Belum ada outlet";
}

export function selectedUserOutletIds() {
  return Array.from(document.querySelectorAll("#user-outlets input:checked")).map((input) => input.value);
}

export function hasCrudAccess(value = {}) {
  return Boolean(value && (value.create || value.read || value.update || value.delete));
}

export function moduleAllows(module, actionKey) {
  return Boolean(module?.actions?.includes(actionKey));
}

export function slugify(value) {
  return (value || "company").trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "company";
}

export function logoPreviewMarkup(url, fallback = "IF") {
  return url ? `<img src="${url}" alt="Logo">` : fallback;
}

export function setLogoValue(inputId, previewId, url, fallback = "IF") {
  byId(inputId).value = url || "";
  byId(previewId).innerHTML = logoPreviewMarkup(url, fallback);
}

export function calculatePlanExpiryDate(durationDays) {
  if (!durationDays || durationDays <= 0) return "Tanpa Batas (Lifetime)";
  const now = new Date();
  now.setDate(now.getDate() + Number(durationDays));
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function updateAiStatusBadge(hasAi) {
  const badge = byId("company-plan-ai-badge");
  if (!badge) return;
  badge.innerHTML = hasAi
    ? '<span class="status-pill status-ok">🧠 Fitur AI Biometrik: Aktif</span>'
    : '<span class="status-pill status-empty">Fitur AI Biometrik: Tidak Aktif</span>';
}
