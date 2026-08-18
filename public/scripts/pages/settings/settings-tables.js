import { state, session } from "./settings-state.js";
import { sortedDiningTables, statusPill } from "./settings-helpers.js";
import { postSetting, putSetting } from "./settings-api.js";
import { byId, setText, showAlert, showFeedback } from "../../dom.js";
import { formatQty } from "../../format.js";
import { COMMON_STATUS, isActiveStatus } from "../../status-codes.js";
import { canUsePermission, appPath, primaryOutletId } from "../../store.js";

let renderSettingsHandler = null;
let openModalHandler = null;
let closeModalHandler = null;

export function setTablesCallbacks({ renderSettings, openModal, closeModal }) {
  if (renderSettings) renderSettingsHandler = renderSettings;
  if (openModal) openModalHandler = openModal;
  if (closeModal) closeModalHandler = closeModal;
}

export function updateTableFlowPreview() {
  const tableModeEl = byId("table-service-mode");
  if (!tableModeEl) return;
  const descriptions = {
    assigned_pay_later: "Mode restoran: kasir/server membuka table, order tambahan masuk ke bill yang sama, dan settlement dilakukan saat table ditutup.",
    free_seating_pay_first: "Mode duduk bebas: pelanggan memilih tempat sendiri, transaksi dibayar di muka seperti quick service."
  };
  setText("table-flow-preview", descriptions[tableModeEl.value] || descriptions.free_seating_pay_first);
}

export function renderDiningTables() {
  const tables = sortedDiningTables();
  const tableBody = byId("dining-table-table");
  if (tableBody) {
    tableBody.innerHTML = tables.length ? tables.map((table) => `
      <tr>
        <td>${table.sort || "-"}</td>
        <td><strong>${table.name}</strong></td>
        <td>${table.area || "-"}</td>
        <td>${formatQty(table.capacity || 1)} pax</td>
        <td>${statusPill(table.status)}</td>
        <td>
          <div class="row-actions">
            <button class="ghost-button compact-button" data-qr-dining-table="${table.id}" type="button" style="color: var(--brand, #3B1F8C); font-weight: 700;">📱 QR Code</button>
            <button class="ghost-button compact-button" data-edit-dining-table="${table.id}" data-permission="settings.tables:update" type="button">Edit</button>
            <button class="ghost-button compact-button" data-delete-dining-table="${table.id}" data-permission="settings.tables:delete" type="button">${isActiveStatus(table.status) ? "Nonaktifkan" : "Aktifkan"}</button>
          </div>
        </td>
      </tr>
    `).join("") : `<tr><td colspan="6">Belum ada meja.</td></tr>`;

    tableBody.querySelectorAll("[data-qr-dining-table]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tableId = btn.dataset.qrDiningTable;
        const table = (state.settings?.diningTables || []).find((t) => String(t.id) === String(tableId));
        if (table) openDiningTableQrModal(table);
      });
    });
  }

  if (byId("table-layout-preview")) {
    byId("table-layout-preview").innerHTML = tables.length ? tables.map((table) => `
      <article class="${isActiveStatus(table.status) ? "active" : "inactive"}">
        <strong>${table.name}</strong>
        <span>${table.area || "-"} · ${formatQty(table.capacity || 1)} pax</span>
      </article>
    `).join("") : `<p class="empty-state">Layout meja belum dibuat.</p>`;
  }
}

export function openDiningTableQrModal(table) {
  const compSlug = session?.companySlug || state.activeCompanySlug || window.__COMPANY_SLUG__ || "";
  const outletId = session?.outletId || state.activeOutletId || primaryOutletId(state, session) || "";

  const tableOrderUrl = `${window.location.origin}${appPath(`/${compSlug}/order`)}?outletId=${encodeURIComponent(outletId)}&tableNo=${encodeURIComponent(table.name)}`;
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(tableOrderUrl)}`;

  setText("dining-table-qr-title", `QR Code ${table.name}`);
  setText("dining-table-qr-sub", `Scan QR Code ini untuk langsung memesan ke ${table.name} (${table.area || "Area"}).`);

  const img = byId("dining-table-qr-img");
  const urlInput = byId("dining-table-qr-url");
  const downloadBtn = byId("btn-download-dining-table-qr");
  const shareBtn = byId("btn-share-dining-table-qr");
  const copyUrlBtn = byId("btn-copy-dining-table-qr-url");
  const closeBtn = byId("btn-close-dining-table-qr");

  if (img) img.src = qrApiUrl;
  if (urlInput) urlInput.value = tableOrderUrl;
  if (downloadBtn) {
    downloadBtn.href = qrApiUrl;
    downloadBtn.download = `QR-${table.name.replace(/\s+/g, "_")}.png`;
  }

  if (copyUrlBtn) {
    copyUrlBtn.onclick = () => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(tableOrderUrl);
        copyUrlBtn.textContent = "✓ Tersalin";
        setTimeout(() => { copyUrlBtn.textContent = "📋 Salin Link"; }, 1500);
      }
    };
  }

  if (shareBtn) {
    shareBtn.onclick = async () => {
      if (navigator.share) {
        try {
          await navigator.share({
            title: `QR Code ${table.name}`,
            text: `Scan / Buka link ini untuk pesan langsung di ${table.name}:`,
            url: tableOrderUrl
          });
        } catch {
          if (navigator.clipboard) {
            navigator.clipboard.writeText(tableOrderUrl);
            shareBtn.textContent = "✓ Link Tersalin";
            setTimeout(() => { shareBtn.textContent = "🔗 Share QR"; }, 1500);
          }
        }
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(tableOrderUrl);
        shareBtn.textContent = "✓ Link Tersalin";
        setTimeout(() => { shareBtn.textContent = "🔗 Share QR"; }, 1500);
      }
    };
  }

  if (closeBtn) {
    closeBtn.onclick = closeDiningTableQrModal;
  }

  if (byId("dining-table-qr-modal-backdrop")) byId("dining-table-qr-modal-backdrop").hidden = false;
  if (byId("dining-table-qr-modal")) byId("dining-table-qr-modal").hidden = false;
  document.body.classList.add("modal-open");
}

export function closeDiningTableQrModal() {
  if (byId("dining-table-qr-modal-backdrop")) byId("dining-table-qr-modal-backdrop").hidden = true;
  if (byId("dining-table-qr-modal")) byId("dining-table-qr-modal").hidden = true;
  document.body.classList.remove("modal-open");
}

export function openDiningTable(table = null) {
  const nextSort = Math.max(0, ...sortedDiningTables().map((item) => Number(item.sort || 0))) + 1;
  if (byId("dining-table-id")) byId("dining-table-id").value = table?.id || "";
  if (byId("dining-table-name")) byId("dining-table-name").value = table?.name || "";
  if (byId("dining-table-area")) byId("dining-table-area").value = table?.area || "Indoor";
  if (byId("dining-table-capacity")) byId("dining-table-capacity").value = table?.capacity || 2;
  if (byId("dining-table-sort")) byId("dining-table-sort").value = table?.sort || nextSort;
  if (byId("dining-table-status")) byId("dining-table-status").value = table?.status || COMMON_STATUS.ACTIVE;
  setText("dining-table-feedback", "");
  if (openModalHandler) openModalHandler("dining-table-modal");
}

export function saveDiningTable(event) {
  event.preventDefault();
  const id = byId("dining-table-id")?.value || "";
  if (!canUsePermission("settings.tables", id ? "update" : "create", state, session)) {
    showFeedback("dining-table-feedback", "Anda tidak punya akses untuk menyimpan meja.");
    return;
  }
  const name = byId("dining-table-name")?.value.trim() || "";
  const duplicate = (state.settings?.diningTables || []).some((table) => table.id !== id && table.name.toLowerCase() === name.toLowerCase());
  if (duplicate) {
    showFeedback("dining-table-feedback", "Nama meja sudah digunakan.");
    return;
  }
  const payload = {
    id,
    name,
    area: byId("dining-table-area")?.value.trim() || "Indoor",
    capacity: Number(byId("dining-table-capacity")?.value || 2),
    sort: Number(byId("dining-table-sort")?.value || 1),
    status: byId("dining-table-status")?.value || COMMON_STATUS.ACTIVE
  };
  if (!(id ? putSetting(`/api/dining-table/${id}`, payload) : postSetting("/api/dining-table", payload))) {
    showFeedback("dining-table-feedback", "Gagal menyimpan meja ke database.");
    return;
  }
  if (closeModalHandler) closeModalHandler();
  if (renderSettingsHandler) renderSettingsHandler();
  showAlert(`Meja ${name} tersimpan.`);
}
