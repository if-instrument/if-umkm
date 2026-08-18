import { state } from "./users-state.js";
import { statusPill } from "./users-helpers.js";
import { permissionText } from "./users-matrix.js";
import { byId } from "../../dom.js";
import { isActiveStatus } from "../../status-codes.js";

export function renderRoles() {
  const roles = (state.companyRoles || []).filter((role) => role.companyId === state.activeCompanyId);
  const table = byId("role-table");
  if (!table) return;

  table.innerHTML = roles
    .map((role) => `
      <tr>
        <td><strong>${role.name}</strong></td>
        <td>${role.outletScope === "all" ? "All Outlet" : "Selected Outlet"}</td>
        <td>${role.responsibility || "-"}</td>
        <td>${permissionText(role)}</td>
        <td>${statusPill(role.status)}</td>
        <td>
          <div class="row-actions">
            <button class="ghost-button compact-button" data-edit-role="${role.id}" data-permission="roles.manage:update" type="button">Edit</button>
            <button class="ghost-button compact-button" data-toggle-role="${role.id}" data-permission="roles.manage:delete" type="button">${isActiveStatus(role.status) ? "Nonaktif" : "Aktifkan"}</button>
          </div>
        </td>
      </tr>
    `)
    .join("");
}
