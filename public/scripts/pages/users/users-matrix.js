import { crudActions, permissionModules } from "./users-state.js";
import { moduleAllows, hasCrudAccess } from "./users-helpers.js";
import { byId } from "../../dom.js";

export function matrixFromLegacy(permissions = []) {
  const normalized = Array.isArray(permissions) ? permissions : [];
  const matrix = {};
  permissionModules.forEach((module) => {
    const isAllowed = normalized.includes(module.key) || normalized.includes(module.legacy) || (module.aliases || []).some((alias) => normalized.includes(alias));
    matrix[module.key] = {
      create: isAllowed && moduleAllows(module, "create"),
      read: isAllowed && moduleAllows(module, "read"),
      update: isAllowed && moduleAllows(module, "update"),
      delete: isAllowed && moduleAllows(module, "delete")
    };
  });
  return matrix;
}

export function normalizeMatrix(matrix = {}, fallbackPermissions = []) {
  const base = matrix && typeof matrix === "object" && Object.keys(matrix).length ? matrix : matrixFromLegacy(fallbackPermissions);
  const normalized = {};
  permissionModules.forEach((module) => {
    const current = base[module.key] || {};
    normalized[module.key] = {
      create: Boolean(current.create && moduleAllows(module, "create")),
      read: Boolean(current.read && moduleAllows(module, "read")),
      update: Boolean(current.update && moduleAllows(module, "update")),
      delete: Boolean(current.delete && moduleAllows(module, "delete"))
    };
  });
  return normalized;
}

export function legacyPermissionsFromMatrix(matrix = {}) {
  const normalized = normalizeMatrix(matrix);
  const legacyKeys = new Set();
  permissionModules.forEach((module) => {
    const value = normalized[module.key];
    if (value && (value.create || value.read || value.update || value.delete)) {
      if (module.legacy) legacyKeys.add(module.legacy);
      legacyKeys.add(module.key);
    }
  });
  return [...legacyKeys];
}

export function permissionText(role) {
  const matrix = normalizeMatrix(role.permissionMatrix || {}, role.permissions || []);
  const activeCount = Object.values(matrix).filter(hasCrudAccess).length;
  if (!activeCount) return "Belum ada hak akses";
  if (activeCount === permissionModules.length) return "Akses Penuh Semua Modul";
  return `${activeCount} modul aktif`;
}

export function renderPermissionMatrix(matrix = {}) {
  const normalized = normalizeMatrix(matrix);
  const container = byId("permission-matrix-body");
  if (!container) return;

  container.innerHTML = permissionModules
    .map((module) => {
      const current = normalized[module.key] || {};
      const actionInputs = crudActions
        .map((action) => {
          const supported = moduleAllows(module, action.key);
          const checked = supported && current[action.key];
          return `
            <label class="matrix-cell ${supported ? "" : "matrix-cell-disabled"}">
              <input ${supported ? "" : "disabled"} ${checked ? "checked" : ""} data-matrix-action="${action.key}" data-matrix-module="${module.key}" type="checkbox" />
              <span>${action.label}</span>
            </label>
          `;
        })
        .join("");

      return `
        <div class="matrix-row">
          <div class="matrix-module-info">
            <strong>${module.label}</strong>
            <small>${module.group}</small>
          </div>
          <div class="matrix-actions-grid">${actionInputs}</div>
        </div>
      `;
    })
    .join("");

  updatePermissionPreview();
}

export function readPermissionMatrix() {
  const matrix = {};
  permissionModules.forEach((module) => {
    matrix[module.key] = { create: false, read: false, update: false, delete: false };
  });
  document.querySelectorAll("#permission-matrix-body input[type='checkbox']").forEach((checkbox) => {
    const { matrixModule, matrixAction } = checkbox.dataset;
    if (matrixModule && matrixAction && matrix[matrixModule]) {
      matrix[matrixModule][matrixAction] = checkbox.checked;
    }
  });
  return normalizeMatrix(matrix);
}

export function updatePermissionPreview() {
  const matrix = readPermissionMatrix();
  const allowed = Object.entries(matrix).filter(([, value]) => hasCrudAccess(value));
  const preview = byId("role-permission-summary");
  if (!preview) return;
  preview.textContent = allowed.length ? `${allowed.length} modul aktif dipilih` : "Belum ada permission aktif dipilih.";
}
