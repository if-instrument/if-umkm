import { state } from "../order-state.js";
import { byId, optionalById, enabledServices, shouldSkipServicePage, escapeHtml } from "../order-utils.js";
import { isActiveStatus } from "../../../status-codes.js";

export function renderServiceTypes() {
  const page = optionalById("order-service-page");
  page?.classList.toggle("is-skipped", shouldSkipServicePage());
  if (shouldSkipServicePage()) {
    byId("order-service-types").innerHTML = "";
    return;
  }
  byId("order-service-types").innerHTML = enabledServices().map((item) => `
    <button class="public-choice-card ${item.label === state.serviceType ? "active" : ""}" data-service-type="${item.label}" type="button">
      <strong>${item.label}</strong>
      <span>${serviceDescription(item.label)}</span>
    </button>
  `).join("");
}

export function renderTables() {
  const section = byId("order-table-section");
  const needsTable = state.serviceType === "Dine In" && state.settings.tableServiceMode !== "free_seating_pay_first";
  section.hidden = !needsTable;
  if (!needsTable) {
    state.tableName = "";
    byId("order-table-choices").innerHTML = "";
    return;
  }
  const tables = (state.settings.diningTables || []).filter((table) => isActiveStatus(table.status));
  if (!state.tableName && tables.length) state.tableName = tables[0].name;
  byId("order-table-choices").innerHTML = tables.length ? tables.map((table) => `
    <button class="public-choice-card ${table.name === state.tableName ? "active" : ""}" data-table-name="${escapeHtml(table.name)}" type="button">
      <strong>${escapeHtml(table.name)}</strong>
      <span>${escapeHtml(table.area || "Area")} · ${Number(table.capacity || 1)} kursi</span>
    </button>
  `).join("") : `<div class="empty-state compact">Table layout belum dibuat.</div>`;
}

export function serviceDescription(label) {
  if (label === "Dine In") return "Makan di tempat sesuai setting outlet.";
  if (label === "Delivery") return "Pesanan dikirim sesuai proses outlet.";
  return "Ambil pesanan di outlet.";
}
