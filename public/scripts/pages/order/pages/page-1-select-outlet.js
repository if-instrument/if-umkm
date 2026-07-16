import { state } from "../order-state.js";
import { byId, optionalById, hasMultipleOutlets, escapeHtml } from "../order-utils.js";

export function renderOutletChoices() {
  document.body.classList.toggle("single-outlet-order", !hasMultipleOutlets());
  document.body.classList.toggle("multi-outlet-order", hasMultipleOutlets());
  const panel = optionalById("order-cover-outlets-panel");
  if (panel) panel.hidden = !hasMultipleOutlets();
  if (!hasMultipleOutlets()) {
    byId("order-outlet-choices").innerHTML = "";
    return;
  }
  byId("order-outlet-choices").innerHTML = state.outlets.map((outlet) => `
    <button class="public-choice-card ${outlet.id === state.outletId ? "active" : ""}" data-outlet-id="${outlet.id}" type="button">
      <strong>${escapeHtml(outlet.name)}</strong>
      <span>${escapeHtml(outlet.address || "Alamat outlet belum diisi")}</span>
    </button>
  `).join("") || `<div class="empty-state">Belum ada outlet aktif.</div>`;
}
