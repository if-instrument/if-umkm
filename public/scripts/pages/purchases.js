import { renderLayout } from "../layout.js?v=coffee-v151";
import { apiPost, applyPermissionControls, canUsePermission, loadSession, loadState, scopedPayload, visibleForSession } from "../store.js?v=coffee-v151";
import { formatQty, money, shortDate } from "../format.js";
import { byId, setText, showAlert, showFeedback } from "../dom.js";
import { enhanceAllDataTables } from "../datatable.js";
import { isInactiveStatus } from "../status-codes.js";
import { applyPageBootstrap, loadPageBootstrap } from "../page-engine.js?v=coffee-v154";

renderLayout();

let state = loadState();
const session = loadSession();

function applyInventoryData(data) {
  if (!data) return;
  applyPageBootstrap(state, data, ["ingredients", "stockMovements"]);
}

function refreshInventory() {
  const response = loadPageBootstrap("purchases", state, session, {
    view: "purchase",
    ingredient_per_page: 100,
    movement_per_page: 100
  });
  if (response?.ok) applyInventoryData(response.data);
  return response;
}

function savePurchase(payload) {
  if (!canUsePermission("inventory.purchase", "create", state, session)) {
    showFeedback("purchase-feedback", "Anda tidak punya akses untuk mencatat stok masuk.");
    return false;
  }
  const response = apiPost("/api/purchase", scopedPayload(payload, state, session));
  if (response?.ok) {
    refreshInventory();
    return true;
  }
  showFeedback("purchase-feedback", response?.message || "Stok masuk bahan outlet belum berhasil disimpan.");
  return false;
}

function openModal() {
  document.querySelector("[data-modal-backdrop]").hidden = false;
  byId("purchase-modal").hidden = false;
  document.body.classList.add("modal-open");
  setTimeout(() => byId("purchase-ingredient").focus(), 80);
}

function closeModal() {
  document.querySelector("[data-modal-backdrop]").hidden = true;
  byId("purchase-modal").hidden = true;
  document.body.classList.remove("modal-open");
}

function renderOptions() {
  byId("purchase-ingredient").innerHTML = state.ingredients
    .filter((item) => visibleForSession(item, state, session))
    .filter((item) => !isInactiveStatus(item.status))
    .map((item) => `<option value="${item.id}">${item.name} (${item.unit})</option>`)
    .join("");
}

function updatePreview() {
  const qty = Number(byId("purchase-qty").value);
  const totalCost = Number(byId("purchase-cost").value);
  if (qty > 0 && totalCost > 0) setText("purchase-preview", `Estimasi biaya pembelian: ${money(totalCost / qty)} per satuan.`);
  else setText("purchase-preview", "Biaya per satuan akan muncul saat jumlah dan total biaya diisi.");
}

function renderPurchaseHistory() {
  const movements = state.stockMovements
    .filter((movement) => visibleForSession(movement, state, session))
    .filter((movement) => movement.type === "purchase")
    .slice()
    .reverse();
  byId("purchase-history-table").innerHTML = movements.length
    ? movements
        .map((movement) => {
          const ingredient = state.ingredients.find((item) => item.id === movement.ingredientId);
          return `
            <tr>
              <td>${shortDate.format(new Date(movement.createdAt))}</td>
              <td><strong>${ingredient ? ingredient.name : "Bahan outlet tidak ditemukan"}</strong></td>
              <td>${formatQty(movement.qty)} ${ingredient ? ingredient.unit : ""}</td>
              <td>${money(movement.unitCost)}</td>
              <td>${money(movement.totalCost)}</td>
              <td>${movement.note}</td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="6">Belum ada penerimaan stok.</td></tr>`;
  enhanceAllDataTables();
  applyPermissionControls(document, state, session);
}

byId("purchase-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const ingredient = state.ingredients.find((item) => item.id === byId("purchase-ingredient").value);
  if (!ingredient || isInactiveStatus(ingredient.status)) {
    showFeedback("purchase-feedback", "Pilih bahan outlet aktif terlebih dahulu.");
    return;
  }
  const qty = Number(byId("purchase-qty").value);
  const totalCost = Number(byId("purchase-cost").value);
  if (!savePurchase({ ingredientId: ingredient.id, qty, totalCost, note: "Pembelian stok bahan outlet" })) return;
  const updated = state.ingredients.find((item) => item.id === ingredient.id) || ingredient;
  event.target.reset();
  updatePreview();
  renderPurchaseHistory();
  closeModal();
  showAlert(`Stok masuk ${updated.name} tersimpan. Stok baru: ${formatQty(updated.stock)} ${updated.unit}.`);
});

document.querySelectorAll("input, select").forEach((field) => {
  field.addEventListener("input", updatePreview);
  field.addEventListener("change", updatePreview);
});

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-open-purchase-modal]") && canUsePermission("inventory.purchase", "create", state, session)) openModal();
  if (event.target.closest("[data-close-modal]") || event.target.matches("[data-modal-backdrop]")) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

const bootstrapResponse = refreshInventory();
if (!bootstrapResponse?.ok) showAlert(bootstrapResponse?.message || "Data pembelian stok belum berhasil dimuat.");
renderOptions();
updatePreview();
renderPurchaseHistory();
