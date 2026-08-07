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

  const isLocked = Boolean(state.isTableLocked || (state.isQrLocked && state.serviceType === "Dine In"));

  byId("order-service-types").innerHTML = enabledServices().map((item) => {
    const isSelected = item.label === state.serviceType;
    const isDisabled = isLocked && !isSelected;
    const lockNotice = isSelected && isLocked ? ` <small style="color:var(--brand); font-weight:700;">🔒 Terkunci (QR Scan)</small>` : "";

    return `
      <button class="public-choice-card ${isSelected ? "active" : ""} ${isDisabled ? "disabled-card" : ""}" data-service-type="${item.label}" type="button" ${isDisabled ? "disabled style='opacity:0.5; cursor:not-allowed;'" : ""}>
        <strong>${item.label}${lockNotice}</strong>
        <span>${serviceDescription(item.label)}</span>
      </button>
    `;
  }).join("");
}

export function renderTables() {
  const section = byId("order-table-section");
  const needsTable = state.serviceType === "Dine In" && state.settings.tableServiceMode !== "free_seating_pay_first";
  section.hidden = !needsTable;
  if (!needsTable) {
    if (!state.isTableLocked) state.tableName = "";
    byId("order-table-choices").innerHTML = "";
    return;
  }

  if (state.isTableLocked && state.tableName) {
    byId("order-table-choices").innerHTML = `
      <div class="public-choice-card active qr-locked-table-card" style="border: 2px solid var(--brand); background: var(--brand-soft, #ede9f9); padding: 14px; border-radius: 12px; cursor: default;">
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <strong style="font-size: 15px; color: var(--brand-strong, #3B1F8C);">${escapeHtml(state.tableName)}</strong>
          <span class="status-pill status-active" style="font-size: 10px; padding: 2px 8px; font-weight: 800;">🔒 Terkunci via Scan QR Meja</span>
        </div>
        <small style="color: #64748b; margin-top: 4px; display: block; font-size: 11px;">Nomor meja ini terisi otomatis dari Scan QR Code Meja Anda dan tidak dapat diubah.</small>
      </div>
    `;
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
