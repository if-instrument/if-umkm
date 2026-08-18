import { state } from "./users-state.js";
import { statusPill } from "./users-helpers.js";
import { byId } from "../../dom.js";
import { isActiveStatus } from "../../status-codes.js";

export function renderOutlets() {
  const outlets = (state.outlets || []).filter((outlet) => outlet.companyId === state.activeCompanyId);
  const table = byId("outlet-table");
  if (!table) return;

  table.innerHTML = outlets
    .map((outlet) => `
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
    `)
    .join("");
}
