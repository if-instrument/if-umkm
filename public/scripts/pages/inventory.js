import { renderLayout } from "../layout.js?v=coffee-v151";
import { apiDelete, apiPost, apiPut, appPath, applyPermissionControls, canUsePermission, loadSession, loadState, scopedPayload, visibleForSession } from "../store.js?v=coffee-v151";
import { formatQty, money, shortDate } from "../format.js";
import { byId, setText, showAlert, showFeedback } from "../dom.js";
import { costingMethodLabel, ingredientStockValue, ingredientUnitCost, isStockedProduct } from "../inventory.js";
import { enhanceAllDataTables } from "../datatable.js";
import { COMMON_STATUS, isInactiveStatus } from "../status-codes.js";
import { applyPageBootstrap, loadPageBootstrap } from "../page-engine.js?v=coffee-v154";

renderLayout();

let state = loadState();
const session = loadSession();
let standardCostTouched = false;
let selectedLedgerIngredientId = "all";
const inventoryView = document.body.dataset.page === "inventory-dashboard" ? "overview" : "list";
const inventoryPageKey = document.body.dataset.page === "inventory-dashboard" ? "inventoryDashboard" : "inventoryList";

document.querySelectorAll("[data-app-link]").forEach((link) => {
  link.href = appPath(link.dataset.appLink || link.getAttribute("href") || "/");
});

function applyInventoryData(data) {
  if (!data) return;
  applyPageBootstrap(state, data, ["ingredients", "ingredientTemplates", "stockMovements", "products"]);
}

function refreshInventory() {
  const response = loadPageBootstrap(inventoryPageKey, state, session, {
    view: inventoryView,
    ingredient_per_page: 100,
    movement_per_page: 100
  });
  if (response?.ok) applyInventoryData(response.data);
  return response;
}

function postInventory(url, payload) {
  const response = apiPost(url, scopedPayload(payload, state, session));
  if (response?.ok) {
    refreshInventory();
    return response.data;
  }
  throw new Error(response?.message || "Aksi inventory belum berhasil disimpan.");
}

function putInventory(url, payload) {
  const response = apiPut(url, scopedPayload(payload, state, session));
  if (response?.ok) {
    refreshInventory();
    return response.data;
  }
  throw new Error(response?.message || "Aksi inventory belum berhasil disimpan.");
}

function deleteInventory(url, payload = {}) {
  const response = apiDelete(url, scopedPayload(payload, state, session));
  if (response?.ok) {
    refreshInventory();
    return response.data;
  }
  throw new Error(response?.message || "Aksi inventory belum berhasil disimpan.");
}

function visibleIngredients() {
  return state.ingredients.filter((item) => visibleForSession(item, state, session));
}

function visibleTemplates() {
  return (state.ingredientTemplates || []).filter((item) => !isInactiveStatus(item.status));
}

function nextIngredientSku() {
  const existing = new Set(visibleIngredients().map((item) => item.sku).filter(Boolean));
  let index = visibleIngredients().length + 1;
  let sku = "";
  do {
    sku = `ING-${String(index).padStart(4, "0")}`;
    index += 1;
  } while (existing.has(sku));
  return sku;
}

function missingTemplateRows(ingredients = visibleIngredients()) {
  const existingTemplateIds = new Set(ingredients.map((item) => item.templateId).filter(Boolean));
  return visibleTemplates().filter((template) => !existingTemplateIds.has(template.id));
}

function exists(id) {
  return Boolean(byId(id));
}

function ensureCategoryOption(selectId, value = "Raw Material") {
  if (!exists(selectId)) return;
  const select = byId(selectId);
  const category = value || "Raw Material";
  if (![...select.options].some((option) => option.value === category)) {
    select.insertAdjacentHTML("beforeend", `<option value="${category}">${category}</option>`);
  }
  select.value = category;
}

function writeText(id, value) {
  if (exists(id)) byId(id).textContent = value;
}

function writeHtml(id, value) {
  if (exists(id)) byId(id).innerHTML = value;
}

function ingredientStatus(item) {
  if (isInactiveStatus(item.status)) return { label: "Nonaktif", className: "status-empty", level: "critical" };
  if (item.stock <= 0) return { label: "Habis", className: "status-empty", level: "critical" };
  if (item.stock <= item.minStock) return { label: "Menipis", className: "status-low", level: "low" };
  return { label: "Aman", className: "status-ok", level: "ok" };
}

function reorderGap(item) {
  return Math.max(item.minStock * 2 - item.stock, 0);
}

function coverageRatio(item) {
  if (item.minStock <= 0) return 100;
  return Math.round((item.stock / item.minStock) * 100);
}

function daysUntil(dateText) {
  if (!dateText) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date - today) / 86400000);
}

function expiryLabel(expiredAt) {
  const days = daysUntil(expiredAt);
  if (days === null) return "Tanpa expired";
  if (days < 0) return `Expired ${Math.abs(days)} hari lalu`;
  if (days === 0) return "Expired hari ini";
  return `${days} hari lagi`;
}

function expiryClass(expiredAt) {
  const days = daysUntil(expiredAt);
  if (days === null) return "status-low";
  if (days <= 0) return "status-empty";
  if (days <= 7) return "status-low";
  return "status-ok";
}

function lotExpiryStatus(expiredAt) {
  const days = daysUntil(expiredAt);
  if (days === null) return { label: "Tanpa Expired", className: "status-low", priority: 3 };
  if (days < 0) return { label: `Expired ${Math.abs(days)} hari`, className: "status-empty", priority: 0 };
  if (days === 0) return { label: "Expired hari ini", className: "status-empty", priority: 0 };
  if (days <= 7) return { label: `${days} hari lagi`, className: "status-low", priority: 1 };
  if (days <= 30) return { label: `${days} hari lagi`, className: "status-ok", priority: 2 };
  return { label: "Aman", className: "status-ok", priority: 4 };
}

function ingredientLotRows(ingredients = visibleIngredients()) {
  return ingredients
    .flatMap((ingredient) => {
      const lots = (ingredient.lots || []).filter((lot) => Number(lot.remainingQty || 0) > 0);
      if (lots.length) {
        return lots.map((lot) => ({
          ingredient,
          lot,
          synthetic: false
        }));
      }
      return [{
        ingredient,
        synthetic: true,
        lot: {
          id: `stock-${ingredient.id}`,
          lotNo: Number(ingredient.stock || 0) > 0 ? "Stok tanpa lot" : "Belum ada lot",
          manufacturedAt: "",
          expiredAt: "",
          remainingQty: Number(ingredient.stock || 0),
          unitCost: ingredientUnitCost(state, ingredient)
        }
      }];
    })
    .sort((a, b) => {
      const statusA = lotExpiryStatus(a.lot.expiredAt);
      const statusB = lotExpiryStatus(b.lot.expiredAt);
      if (statusA.priority !== statusB.priority) return statusA.priority - statusB.priority;
      return String(a.lot.expiredAt || "9999-12-31").localeCompare(String(b.lot.expiredAt || "9999-12-31"));
    });
}

function ingredientExpiryRows() {
  return visibleIngredients()
    .flatMap((ingredient) => (ingredient.lots || [])
      .filter((lot) => lot.expiredAt && Number(lot.remainingQty || 0) > 0)
      .map((lot) => ({ ingredient, lot, days: daysUntil(lot.expiredAt) })))
    .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999))
    .slice(0, 6);
}

function finishedExpiryRows() {
  return (state.products || [])
    .filter((product) => visibleForSession(product, state, session))
    .filter((product) => isStockedProduct(product))
    .flatMap((product) => (product.batches || [])
      .filter((batch) => batch.expiredAt && Number(batch.qty || 0) > 0)
      .map((batch) => ({ product, batch, days: daysUntil(batch.expiredAt) })))
    .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999))
    .slice(0, 6);
}

function renderExpiryDashboard() {
  writeHtml("ingredient-expiry-list", ingredientExpiryRows().length
    ? ingredientExpiryRows()
        .map(({ ingredient, lot }) => `
          <article class="recommendation-item">
            <div>
              <strong>${ingredient.name}</strong>
              <span>${lot.lotNo} · ${formatQty(lot.remainingQty)} ${ingredient.unit}</span>
            </div>
            <div>
              <strong>${lot.expiredAt}</strong>
              <span class="status-pill ${expiryClass(lot.expiredAt)}">${expiryLabel(lot.expiredAt)}</span>
            </div>
          </article>
        `)
        .join("")
    : `<p class="empty-state">Tidak ada lot bahan dengan expired date.</p>`);

  writeHtml("finished-expiry-list", finishedExpiryRows().length
    ? finishedExpiryRows()
        .map(({ product, batch }) => `
          <article class="recommendation-item">
            <div>
              <strong>${product.name}</strong>
              <span>${batch.batchNo} · ${formatQty(batch.qty)} unit</span>
            </div>
            <div>
              <strong>${batch.expiredAt}</strong>
              <span class="status-pill ${expiryClass(batch.expiredAt)}">${expiryLabel(batch.expiredAt)}</span>
            </div>
          </article>
        `)
        .join("")
    : `<p class="empty-state">Belum ada batch produk dengan expired date.</p>`);
}

function renderIngredientOptions() {
  const options = state.ingredients
    .filter((item) => visibleForSession(item, state, session))
    .filter((item) => !isInactiveStatus(item.status))
    .map((item) => `<option value="${item.id}">${item.name} (${item.unit})</option>`)
    .join("");
  if (exists("modal-purchase-ingredient")) byId("modal-purchase-ingredient").innerHTML = options;
  if (exists("modal-waste-ingredient")) byId("modal-waste-ingredient").innerHTML = options;
}

function renderLedgerIngredientOptions() {
  if (!exists("ingredient-ledger-filter-ingredient")) return;
  const currentValue = selectedLedgerIngredientId || byId("ingredient-ledger-filter-ingredient").value || "all";
  const selectedIngredient = visibleIngredients().find((item) => item.id === currentValue) || visibleIngredients()[0];
  byId("ingredient-ledger-filter-ingredient").innerHTML = (selectedIngredient ? [selectedIngredient] : [])
    .map((item) => `<option value="${item.id}">${item.name} (${item.unit})</option>`)
    .join("");
  byId("ingredient-ledger-filter-ingredient").value = selectedIngredient?.id || "";
  selectedLedgerIngredientId = byId("ingredient-ledger-filter-ingredient").value;
}

function renderTemplateOptions() {
  const templates = (state.ingredientTemplates || []).filter((item) => !isInactiveStatus(item.status));
  const usedTemplateIds = new Set(visibleIngredients().map((item) => item.templateId).filter(Boolean));
  const addableTemplates = templates.filter((item) => !usedTemplateIds.has(item.id));
  const addOptions = [
    `<option value="new">Buat template baru dari nama bahan outlet</option>`,
    ...addableTemplates.map((item) => `<option value="${item.id}">${item.name} · ${item.category} (${item.unit})</option>`)
  ].join("");
  const editOptions = [
    `<option value="new">Buat template baru dari nama bahan outlet</option>`,
    ...templates.map((item) => `<option value="${item.id}">${item.name} · ${item.category} (${item.unit})</option>`)
  ].join("");
  if (exists("modal-ingredient-template")) byId("modal-ingredient-template").innerHTML = addOptions;
  if (exists("modal-edit-template")) byId("modal-edit-template").innerHTML = editOptions;
}

function prepareNewIngredientModal(templateId = "new") {
  const form = exists("modal-ingredient-form") ? byId("modal-ingredient-form") : null;
  if (form) form.reset();
  standardCostTouched = false;
  renderTemplateOptions();
  if (exists("modal-ingredient-sku")) byId("modal-ingredient-sku").value = nextIngredientSku();
  if (exists("modal-ingredient-template")) byId("modal-ingredient-template").value = templateId;
  if (templateId !== "new") {
    fillFromTemplate("modal-ingredient-template", "modal-ingredient-name", "modal-ingredient-category", "modal-ingredient-unit");
  }
  setText("modal-ingredient-preview", "Bahan outlet adalah stok fisik outlet aktif. Hubungkan ke template agar recipe dan modifier bisa menghitung HPP.");
}

function renderHistoryFilterOptions() {
  if (!exists("history-filter-ingredient")) return;
  const currentValue = byId("history-filter-ingredient").value || "all";
  byId("history-filter-ingredient").innerHTML = `
    <option value="all">Semua Bahan Outlet</option>
    ${visibleIngredients().map((item) => `<option value="${item.id}">${item.name} (${item.unit})</option>`).join("")}
  `;
  byId("history-filter-ingredient").value = currentValue;
}

function renderInventory() {
  const ingredients = visibleIngredients();
  const missingTemplates = missingTemplateRows(ingredients);
  const lotRows = ingredientLotRows(ingredients);
  const availableLotRows = lotRows.filter(({ lot }) => Number(lot.remainingQty || 0) > 0);
  const expiringLotRows = availableLotRows.filter(({ lot }) => {
    const days = daysUntil(lot.expiredAt);
    return days !== null && days <= 7;
  });
  const inventoryValue = ingredients.reduce((total, item) => total + ingredientStockValue(state, item), 0);
  const criticalItems = ingredients.filter((item) => item.stock <= item.minStock);
  const reorderValue = criticalItems.reduce((total, item) => total + reorderGap(item) * ingredientUnitCost(state, item), 0);
  const stockHealth = ingredients.reduce(
    (health, item) => {
      health[ingredientStatus(item).level] += 1;
      return health;
    },
    { ok: 0, low: 0, critical: 0 }
  );

  writeText("inventory-value", money(inventoryValue));
  writeText("ingredient-count", ingredients.length);
  writeText("ingredient-lot-count", availableLotRows.length);
  writeText("ingredient-expiring-count", expiringLotRows.length);
  writeText("critical-count", criticalItems.length);
  writeText("reorder-value", money(reorderValue));

  writeHtml("inventory-reorder-list", criticalItems.length
    ? criticalItems
        .map((item) => {
          const gap = reorderGap(item);
          return `
            <article class="recommendation-item">
              <div>
                <strong>${item.name}</strong>
                <span>Stok ${formatQty(item.stock)} ${item.unit} · batas aman ${formatQty(item.minStock)} ${item.unit}</span>
              </div>
              <div>
                <strong>${formatQty(gap)} ${item.unit}</strong>
                <span>${money(gap * ingredientUnitCost(state, item))}</span>
              </div>
            </article>
          `;
        })
        .join("")
    : `<p class="empty-state">Tidak ada bahan outlet yang perlu dibeli saat ini.</p>`);

  writeHtml("stock-health-list", `
    <div class="health-row"><span>Aman</span><strong>${stockHealth.ok}</strong></div>
    <div class="health-row"><span>Menipis</span><strong>${stockHealth.low}</strong></div>
    <div class="health-row"><span>Habis</span><strong>${stockHealth.critical}</strong></div>
  `);
  renderExpiryDashboard();

  writeHtml("ingredient-table", [
    ...availableLotRows.map((row) => ({ ...row, isLotRow: true })),
    ...lotRows.filter(({ lot }) => Number(lot.remainingQty || 0) <= 0).map((row) => ({ ...row, isLotRow: true })),
    ...missingTemplates.map((template) => ({ template, isTemplateOnly: true }))
  ]
    .map((row) => {
      if (row.isTemplateOnly) {
        const item = row.template;
        return `
          <tr>
            <td><strong>${item.name}</strong><br><small>Template: ${item.code || item.id} · ${item.category} · ${item.unit}</small></td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td><span class="status-pill status-low">Perlu dibuat outlet</span></td>
            <td>
              <div class="row-actions">
                <button class="primary-button compact-button" data-add-ingredient-template="${item.id}" data-permission="inventory.ingredients:create" type="button">Buat Bahan Outlet</button>
              </div>
            </td>
          </tr>
        `;
      }
      const { ingredient: item, lot, synthetic } = row;
      const unitCost = Number(lot.unitCost || ingredientUnitCost(state, item));
      const qty = Number(lot.remainingQty || 0);
      const value = qty * unitCost;
      const lotStatus = qty <= 0 ? { label: "Habis", className: "status-empty" } : lotExpiryStatus(lot.expiredAt);
      const cannotDeactivate = !isInactiveStatus(item.status) && Number(item.stock || 0) > 0;
      const toggleButton = cannotDeactivate
        ? `<button class="ghost-button compact-button" disabled title="Stok harus habis dulu sebelum bahan dinonaktifkan" type="button">Nonaktif</button>`
        : `<button class="ghost-button compact-button" data-toggle-ingredient="${item.id}" data-permission="inventory.ingredients:delete" type="button">${isInactiveStatus(item.status) ? "Aktifkan" : "Nonaktif"}</button>`;
      return `
        <tr>
          <td><strong>${item.name}</strong><br><small>${item.templateName ? `Template: ${item.templateName} · ` : "Belum terhubung template · "}${item.category || item.templateCategory || ""} · ${item.unit}</small></td>
          <td><strong>${lot.lotNo || "-"}</strong><br><small>${synthetic ? "Saldo agregat bahan" : "Lot FEFO"}</small></td>
          <td>${formatQty(qty)} ${item.unit}<br><small>Total bahan: ${formatQty(item.stock)} ${item.unit}</small></td>
          <td>${money(unitCost)}<br><small>${costingMethodLabel(state)}</small></td>
          <td>${money(value)}</td>
          <td>${lot.manufacturedAt || "-"}</td>
          <td>${lot.expiredAt || "-"}</td>
          <td><span class="status-pill ${isInactiveStatus(item.status) ? "status-empty" : lotStatus.className}">${isInactiveStatus(item.status) ? "Nonaktif" : lotStatus.label}</span></td>
          <td>
            <div class="row-actions">
              <button class="ghost-button compact-button" data-purchase-ingredient="${item.id}" data-permission="inventory.purchase:create" type="button">Stok Masuk</button>
              <button class="ghost-button compact-button" data-waste-ingredient="${item.id}" data-permission="inventory.waste:create" ${qty > 0 ? "" : "disabled"} type="button">Waste</button>
              <button class="ghost-button compact-button" data-edit-ingredient="${item.id}" data-permission="inventory.ingredients:update" type="button">Edit</button>
              ${toggleButton}
              <button class="ghost-button compact-button" data-detail-ingredient="${item.id}" type="button">Kartu Stok</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("") || `<tr><td colspan="9">Belum ada stok bahan. Tambahkan bahan outlet atau catat stok masuk.</td></tr>`);

  const filteredMovements = filteredStockMovements();
  writeText("movement-summary", `${filteredMovements.length} transaksi kartu stok sesuai filter.`);
  writeHtml("movement-table", filteredMovements.length
    ? filteredMovements
        .map((movement) => {
          const ingredient = state.ingredients.find((item) => item.id === movement.ingredientId);
          const unit = ingredient ? ingredient.unit : "";
          const name = ingredient ? ingredient.name : "Bahan outlet tidak ditemukan";
          const typeLabel = movementTypeLabel(movement);
          return `
            <tr>
              <td>${shortDate.format(new Date(movement.createdAt))}</td>
              <td><strong>${name}</strong></td>
              <td>${typeLabel}</td>
              <td>${formatQty(movement.beforeQty)} ${unit}</td>
              <td>${formatQty(movement.qty)} ${unit}</td>
              <td>${formatQty(movement.afterQty)} ${unit}</td>
              <td>${money(movement.totalCost)}</td>
              <td>${movement.note}</td>
              <td>
                ${ingredient ? `<button class="ghost-button compact-button" data-detail-ingredient="${ingredient.id}" type="button">Kartu Stok</button>` : "-"}
              </td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="9">Tidak ada transaksi kartu stok sesuai filter.</td></tr>`);

  renderIngredientOptions();
  renderLedgerIngredientOptions();
  renderTemplateOptions();
  renderHistoryFilterOptions();
  enhanceAllDataTables();
  applyPermissionControls(document, state, session);
}

function movementTypeLabel(movementOrType) {
  const type = typeof movementOrType === "string" ? movementOrType : movementOrType.type;
  const note = typeof movementOrType === "string" ? "" : (movementOrType.note || "").toLowerCase();
  if (type === "adjustment" && note.includes("edit pesanan kasir")) return "Edit Pesanan";
  if (type === "purchase") return "Stok Masuk";
  if (type === "sale") return "Pemakaian";
  if (type === "sale_edit") return "Edit Pesanan";
  if (type === "expired") return "Expired";
  if (type === "waste") return "Waste / Terbuang";
  if (type === "adjustment") return "Koreksi";
  return "Saldo Awal";
}

function filteredStockMovements() {
  const fromFilter = exists("history-filter-from") ? byId("history-filter-from").value : "";
  const toFilter = exists("history-filter-to") ? byId("history-filter-to").value : "";
  const ingredientFilter = exists("history-filter-ingredient") ? byId("history-filter-ingredient").value : "all";
  const typeFilter = exists("history-filter-type") ? byId("history-filter-type").value : "all";
  const search = exists("history-filter-search") ? byId("history-filter-search").value.trim().toLowerCase() : "";

  return state.stockMovements
    .filter((movement) => {
      const ingredient = state.ingredients.find((item) => item.id === movement.ingredientId);
      return ingredient && visibleForSession(ingredient, state, session);
    })
    .filter((movement) => !fromFilter || new Date(movement.createdAt) >= new Date(`${fromFilter}T00:00:00`))
    .filter((movement) => !toFilter || new Date(movement.createdAt) <= new Date(`${toFilter}T23:59:59.999`))
    .filter((movement) => ingredientFilter === "all" || movement.ingredientId === ingredientFilter)
    .filter((movement) => typeFilter === "all" || movement.type === typeFilter)
    .filter((movement) => !search || movement.note.toLowerCase().includes(search))
    .slice()
    .reverse();
}

function openModal(id) {
  const backdrop = document.querySelector("[data-modal-backdrop]");
  const modal = byId(id);
  if (!backdrop || !modal) return;
  backdrop.hidden = false;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  const firstField = modal.querySelector("input, select, button");
  if (firstField) setTimeout(() => firstField.focus(), 80);
}

function closeModal() {
  const backdrop = document.querySelector("[data-modal-backdrop]");
  if (!backdrop) return;
  backdrop.hidden = true;
  backdrop.querySelectorAll(".modal-dialog").forEach((modal) => {
    modal.hidden = true;
  });
  if (exists("modal-purchase-ingredient")) byId("modal-purchase-ingredient").disabled = false;
  if (exists("modal-waste-ingredient")) byId("modal-waste-ingredient").disabled = false;
  document.body.classList.remove("modal-open");
}

function updatePurchasePreview() {
  if (!exists("modal-purchase-qty")) return;
  const qty = Number(byId("modal-purchase-qty").value);
  const totalCost = Number(byId("modal-purchase-cost").value);
  if (qty > 0 && totalCost > 0) setText("modal-purchase-preview", `Estimasi biaya pembelian: ${money(totalCost / qty)} per satuan.`);
  else setText("modal-purchase-preview", "Biaya per satuan akan muncul saat jumlah dan total biaya diisi.");
}

function updateWastePreview() {
  if (!exists("modal-waste-qty")) return;
  const ingredient = state.ingredients.find((item) => item.id === byId("modal-waste-ingredient").value);
  const qty = Number(byId("modal-waste-qty").value);
  if (!ingredient || qty <= 0) {
    setText("modal-waste-preview", "Estimasi nilai waste akan muncul setelah bahan outlet dan jumlah diisi.");
    return;
  }

  const unitCost = ingredientUnitCost(state, ingredient);
  const projectedStock = Math.max(ingredient.stock - qty, 0);
  setText(
    "modal-waste-preview",
    `Estimasi waste ${money(qty * unitCost)}. Stok setelah transaksi: ${formatQty(projectedStock)} ${ingredient.unit}.`
  );
}

function updateIngredientPreview() {
  if (!exists("modal-ingredient-stock")) return;
  const stock = Number(byId("modal-ingredient-stock").value);
  const totalCost = Number(byId("modal-ingredient-cost").value);
  let standardCost = Number(byId("modal-ingredient-standard-cost").value);
  const unit = byId("modal-ingredient-unit").value.trim() || "satuan";
  if (stock > 0 && totalCost >= 0) {
    const averageCost = totalCost / stock;
    if (exists("modal-ingredient-standard-cost") && !standardCostTouched) {
      byId("modal-ingredient-standard-cost").value = averageCost ? averageCost.toFixed(2) : 0;
      standardCost = averageCost;
    }
    const standardText = standardCost > 0 ? ` Standard cost: ${money(standardCost)} per ${unit}.` : "";
    setText("modal-ingredient-preview", `Average cost: ${money(averageCost)} per ${unit}.${standardText || " Standard cost otomatis mengikuti harga default / jumlah."}`);
  } else {
    if (exists("modal-ingredient-standard-cost") && !standardCostTouched) byId("modal-ingredient-standard-cost").value = 0;
    setText("modal-ingredient-preview", "Average cost dan standard cost default dihitung dari nilai stok awal dibagi jumlah.");
  }
}

function fillFromTemplate(selectId, nameId, categoryId, unitId) {
  if (!exists(selectId)) return;
  const template = (state.ingredientTemplates || []).find((item) => item.id === byId(selectId).value);
  if (!template) return;
  if (exists(nameId)) byId(nameId).value = template.name;
  if (exists(categoryId)) ensureCategoryOption(categoryId, template.category);
  if (exists(unitId)) byId(unitId).value = template.unit;
  updateIngredientPreview();
}

function openIngredientFromTemplate(templateId) {
  const template = (state.ingredientTemplates || []).find((item) => item.id === templateId);
  if (!template) return;
  prepareNewIngredientModal(template.id);
  if (exists("modal-ingredient-name")) byId("modal-ingredient-name").value = template.name;
  if (exists("modal-ingredient-sku")) byId("modal-ingredient-sku").value = nextIngredientSku();
  if (exists("modal-ingredient-category")) ensureCategoryOption("modal-ingredient-category", template.category);
  if (exists("modal-ingredient-unit")) byId("modal-ingredient-unit").value = template.unit;
  if (exists("modal-ingredient-stock")) byId("modal-ingredient-stock").value = "";
  if (exists("modal-ingredient-cost")) byId("modal-ingredient-cost").value = "";
  if (exists("modal-ingredient-standard-cost")) byId("modal-ingredient-standard-cost").value = "";
  if (exists("modal-ingredient-min")) byId("modal-ingredient-min").value = "";
  standardCostTouched = false;
  setText("modal-ingredient-preview", `Template ${template.name} belum punya bahan fisik di outlet ini. Isi stok, biaya, dan batas aman agar recipe bisa menghitung HPP.`);
  openModal("ingredient-modal");
}

function openPurchaseForIngredient(id) {
  const ingredient = state.ingredients.find((item) => item.id === id);
  if (!ingredient) return;
  renderIngredientOptions();
  if (exists("modal-purchase-form")) byId("modal-purchase-form").reset();
  if (exists("modal-purchase-ingredient")) {
    byId("modal-purchase-ingredient").value = ingredient.id;
    byId("modal-purchase-ingredient").disabled = true;
  }
  updatePurchasePreview();
  openModal("purchase-modal");
}

function openWasteForIngredient(id) {
  const ingredient = state.ingredients.find((item) => item.id === id);
  if (!ingredient) return;
  renderIngredientOptions();
  if (exists("modal-waste-form")) byId("modal-waste-form").reset();
  if (exists("modal-waste-ingredient")) {
    byId("modal-waste-ingredient").value = ingredient.id;
    byId("modal-waste-ingredient").disabled = true;
  }
  updateWastePreview();
  openModal("waste-modal");
}

function openEditIngredient(id) {
  const ingredient = state.ingredients.find((item) => item.id === id);
  if (!ingredient) return;

  byId("modal-edit-ingredient-id").value = ingredient.id;
  if (exists("modal-edit-template")) byId("modal-edit-template").value = ingredient.templateId || "new";
  if (exists("modal-edit-sku")) byId("modal-edit-sku").value = ingredient.sku || "";
  byId("modal-edit-name").value = ingredient.name;
  if (exists("modal-edit-category")) ensureCategoryOption("modal-edit-category", ingredient.category || ingredient.templateCategory || "Raw Material");
  byId("modal-edit-unit").value = ingredient.unit;
  byId("modal-edit-stock").value = ingredient.stock;
  byId("modal-edit-min").value = ingredient.minStock;
  byId("modal-edit-avg-cost").value = ingredient.avgCost;
  byId("modal-edit-standard-cost").value = ingredient.standardCost;
  byId("modal-edit-note").value = "";
  setText("modal-edit-preview", "Perubahan stok akan tercatat di kartu stok outlet.");
  openModal("edit-ingredient-modal");
}

function openIngredientLedger(id) {
  selectedLedgerIngredientId = id;
  if (!selectedLedgerIngredientId) return;
  renderLedgerIngredientOptions();
  renderIngredientLedger();
  openModal("ingredient-ledger-modal");
  enhanceAllDataTables(byId("ingredient-ledger-modal"));
}

function filteredIngredientLedgerMovements() {
  const ingredientId = exists("ingredient-ledger-filter-ingredient") ? byId("ingredient-ledger-filter-ingredient").value : selectedLedgerIngredientId;
  const type = exists("ingredient-ledger-filter-type") ? byId("ingredient-ledger-filter-type").value : "all";
  const from = exists("ingredient-ledger-filter-from") ? byId("ingredient-ledger-filter-from").value : "";
  const to = exists("ingredient-ledger-filter-to") ? byId("ingredient-ledger-filter-to").value : "";
  const search = exists("ingredient-ledger-filter-search") ? byId("ingredient-ledger-filter-search").value.trim().toLowerCase() : "";
  selectedLedgerIngredientId = ingredientId || selectedLedgerIngredientId;

  return state.stockMovements
    .filter((movement) => {
      const ingredient = state.ingredients.find((item) => item.id === movement.ingredientId);
      return ingredient && visibleForSession(ingredient, state, session);
    })
    .filter((movement) => movement.ingredientId === selectedLedgerIngredientId)
    .filter((movement) => type === "all" || movement.type === type)
    .filter((movement) => !from || new Date(movement.createdAt) >= new Date(`${from}T00:00:00`))
    .filter((movement) => !to || new Date(movement.createdAt) <= new Date(`${to}T23:59:59.999`))
    .filter((movement) => !search || (movement.note || "").toLowerCase().includes(search))
    .slice()
    .reverse();
}

function renderIngredientLedger() {
  if (!exists("ingredient-ledger-table")) return;
  const movements = filteredIngredientLedgerMovements();
  const ingredient = state.ingredients.find((item) => item.id === selectedLedgerIngredientId);
  byId("ingredient-ledger-modal-title").textContent = ingredient ? `Kartu Stok: ${ingredient.name}` : "Kartu Stok Bahan";
  byId("ingredient-ledger-summary").textContent = ingredient
    ? `${movements.length} transaksi tercatat untuk bahan outlet ${ingredient.name}.`
    : `${movements.length} transaksi tercatat sesuai filter bahan outlet.`;
  byId("ingredient-ledger-table").innerHTML = movements.length
    ? movements
        .map((movement) => {
          const rowIngredient = state.ingredients.find((item) => item.id === movement.ingredientId);
          const unit = rowIngredient?.unit || "";
          const qtyIn = movement.qty > 0 ? `${formatQty(movement.qty)} ${unit}` : "-";
          const qtyOut = movement.qty < 0 ? `${formatQty(Math.abs(movement.qty))} ${unit}` : "-";
          return `
            <tr>
              <td>${shortDate.format(new Date(movement.createdAt))}</td>
              <td>${movementTypeLabel(movement)}<br><small>${rowIngredient?.name || "Bahan tidak ditemukan"}</small></td>
              <td>${formatQty(movement.beforeQty)} ${unit}</td>
              <td>${qtyIn}</td>
              <td>${qtyOut}</td>
              <td>${formatQty(movement.afterQty)} ${unit}</td>
              <td>${money(movement.totalCost)}</td>
              <td>${movement.note || "-"}</td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="8">Tidak ada transaksi kartu stok sesuai filter.</td></tr>`;
}

function consumeLotsForAdjustment(ingredient, qty) {
  let remaining = qty;
  const lots = [...(ingredient.lots || [])]
    .filter((lot) => lot.remainingQty > 0)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  lots.forEach((lot) => {
    if (remaining <= 0) return;
    const used = Math.min(remaining, lot.remainingQty);
    lot.remainingQty -= used;
    remaining -= used;
  });
}

function saveEditedIngredient(event) {
  event.preventDefault();
  if (!canUsePermission("inventory.ingredients", "update", state, session)) {
    showFeedback("modal-edit-feedback", "Anda tidak punya akses untuk mengubah bahan outlet.");
    return;
  }
  const ingredient = state.ingredients.find((item) => item.id === byId("modal-edit-ingredient-id").value);
  if (!ingredient) return;

  try {
    putInventory(`/api/ingredient/${ingredient.id}`, {
      name: byId("modal-edit-name").value.trim(),
      sku: exists("modal-edit-sku") ? byId("modal-edit-sku").value.trim() : ingredient.sku,
      templateId: exists("modal-edit-template") ? byId("modal-edit-template").value : ingredient.templateId,
      unit: byId("modal-edit-unit").value.trim(),
      stock: Number(byId("modal-edit-stock").value),
      minStock: Number(byId("modal-edit-min").value),
      avgCost: Number(byId("modal-edit-avg-cost").value),
      standardCost: Number(byId("modal-edit-standard-cost").value),
      category: exists("modal-edit-category") ? byId("modal-edit-category").value.trim() : (ingredient.category || "Raw Material"),
      note: byId("modal-edit-note").value.trim() || "Koreksi data bahan outlet"
    });
    const updated = state.ingredients.find((item) => item.id === ingredient.id) || ingredient;
    renderInventory();
    closeModal();
    showAlert(`${updated.name} berhasil diperbarui. Stok sekarang ${formatQty(updated.stock)} ${updated.unit}.`);
  } catch (error) {
    showFeedback("modal-edit-feedback", error.message);
  }
}

function savePurchase(event) {
  event.preventDefault();
  if (!canUsePermission("inventory.purchase", "create", state, session)) {
    showFeedback("modal-purchase-feedback", "Anda tidak punya akses untuk mencatat stok masuk.");
    return;
  }
  const ingredient = state.ingredients.find((item) => item.id === byId("modal-purchase-ingredient").value);
  if (!ingredient || isInactiveStatus(ingredient.status)) {
    showFeedback("modal-purchase-feedback", "Pilih bahan aktif terlebih dahulu.");
    return;
  }
  const qty = Number(byId("modal-purchase-qty").value);
  const totalCost = Number(byId("modal-purchase-cost").value);
  try {
    postInventory("/api/purchase", {
      ingredientId: ingredient.id,
      qty,
      totalCost,
      manufacturedAt: exists("modal-purchase-manufactured-at") ? byId("modal-purchase-manufactured-at").value : "",
      expiredAt: exists("modal-purchase-expired-at") ? byId("modal-purchase-expired-at").value : "",
      note: "Pembelian stok bahan outlet"
    });
    const updated = state.ingredients.find((item) => item.id === ingredient.id) || ingredient;
    event.target.reset();
    updatePurchasePreview();
    renderInventory();
    closeModal();
    showAlert(`Stok ${updated.name} tersimpan. Stok baru: ${formatQty(updated.stock)} ${updated.unit}.`);
  } catch (error) {
    showFeedback("modal-purchase-feedback", error.message);
  }
}

function saveWaste(event) {
  event.preventDefault();
  if (!canUsePermission("inventory.waste", "create", state, session)) {
    showFeedback("modal-waste-feedback", "Anda tidak punya akses untuk mencatat waste/expired.");
    return;
  }
  const ingredient = state.ingredients.find((item) => item.id === byId("modal-waste-ingredient").value);
  if (!ingredient) return;

  const qty = Number(byId("modal-waste-qty").value);
  const type = byId("modal-waste-type").value;
  const beforeQty = ingredient.stock;
  const wasteQty = Math.min(qty, beforeQty);
  const unitCost = ingredientUnitCost(state, ingredient);
  const defaultNote = type === "expired" ? "Bahan outlet expired" : "Bahan outlet terbuang/rusak";
  const note = byId("modal-waste-note").value.trim() || defaultNote;

  if (wasteQty <= 0) {
    showFeedback("modal-waste-feedback", "Stok bahan outlet tidak cukup untuk dicatat sebagai waste.");
    return;
  }

  try {
    postInventory("/api/inventory-loss", {
      ingredientId: ingredient.id,
      qty: wasteQty,
      type,
      note
    });
    const updated = state.ingredients.find((item) => item.id === ingredient.id) || ingredient;
    event.target.reset();
    updateWastePreview();
    renderInventory();
    closeModal();
    showAlert(`${movementTypeLabel(type)} ${updated.name} tercatat. Stok sekarang ${formatQty(updated.stock)} ${updated.unit}.`);
  } catch (error) {
    showFeedback("modal-waste-feedback", error.message);
  }
}

function saveIngredient(event) {
  event.preventDefault();
  if (!canUsePermission("inventory.ingredients", "create", state, session)) {
    showFeedback("modal-ingredient-feedback", "Anda tidak punya akses untuk menambah bahan outlet.");
    return;
  }
  const stock = Number(byId("modal-ingredient-stock").value);
  const totalCost = Number(byId("modal-ingredient-cost").value);
  const name = byId("modal-ingredient-name").value.trim();

  try {
    postInventory("/api/ingredient", {
      name: byId("modal-ingredient-name").value.trim(),
      sku: exists("modal-ingredient-sku") ? byId("modal-ingredient-sku").value.trim() : "",
      templateId: exists("modal-ingredient-template") ? byId("modal-ingredient-template").value : "new",
      unit: byId("modal-ingredient-unit").value.trim(),
      stock,
      totalCost,
      manufacturedAt: exists("modal-ingredient-manufactured-at") ? byId("modal-ingredient-manufactured-at").value : "",
      expiredAt: exists("modal-ingredient-expired-at") ? byId("modal-ingredient-expired-at").value : "",
      standardCost: Number(byId("modal-ingredient-standard-cost").value),
      minStock: Number(byId("modal-ingredient-min").value),
      category: exists("modal-ingredient-category") ? byId("modal-ingredient-category").value.trim() : "Raw Material",
      status: COMMON_STATUS.ACTIVE
    });
    event.target.reset();
    updateIngredientPreview();
    renderInventory();
    closeModal();
    showAlert(`${name} tersimpan sebagai bahan outlet dan siap dipakai untuk HPP jika sudah terhubung template.`);
  } catch (error) {
    showFeedback("modal-ingredient-feedback", error.message);
  }
}

document.addEventListener("click", (event) => {
  const openButton = event.target.closest("[data-open-modal]");
  if (openButton) {
    const permissionMap = {
      "purchase-modal": ["inventory.purchase", "create"],
      "waste-modal": ["inventory.waste", "create"],
      "ingredient-modal": ["inventory.ingredients", "create"]
    };
    const rule = permissionMap[openButton.dataset.openModal];
    if (rule && !canUsePermission(rule[0], rule[1], state, session)) return;
    if (openButton.dataset.openModal === "ingredient-modal") prepareNewIngredientModal();
    if (openButton.dataset.openModal === "ingredient-modal") standardCostTouched = false;
    if (openButton.dataset.openModal === "purchase-modal" && exists("modal-purchase-ingredient")) byId("modal-purchase-ingredient").disabled = false;
    if (openButton.dataset.openModal === "waste-modal" && exists("modal-waste-ingredient")) byId("modal-waste-ingredient").disabled = false;
    openModal(openButton.dataset.openModal);
  }

  const editButton = event.target.closest("[data-edit-ingredient]");
  if (editButton && canUsePermission("inventory.ingredients", "update", state, session)) openEditIngredient(editButton.dataset.editIngredient);

  const detailButton = event.target.closest("[data-detail-ingredient]");
  if (detailButton) openIngredientLedger(detailButton.dataset.detailIngredient);

  const purchaseIngredientButton = event.target.closest("[data-purchase-ingredient]");
  if (purchaseIngredientButton && canUsePermission("inventory.purchase", "create", state, session)) openPurchaseForIngredient(purchaseIngredientButton.dataset.purchaseIngredient);

  const wasteIngredientButton = event.target.closest("[data-waste-ingredient]");
  if (wasteIngredientButton && !wasteIngredientButton.disabled && canUsePermission("inventory.waste", "create", state, session)) openWasteForIngredient(wasteIngredientButton.dataset.wasteIngredient);

  const addTemplateButton = event.target.closest("[data-add-ingredient-template]");
  if (addTemplateButton && canUsePermission("inventory.ingredients", "create", state, session)) openIngredientFromTemplate(addTemplateButton.dataset.addIngredientTemplate);

  const toggleIngredient = event.target.closest("[data-toggle-ingredient]");
  if (toggleIngredient && canUsePermission("inventory.ingredients", "delete", state, session)) {
    const ingredient = state.ingredients.find((item) => item.id === toggleIngredient.dataset.toggleIngredient);
    if (!ingredient) return;
    if (!isInactiveStatus(ingredient.status) && Number(ingredient.stock || 0) > 0) {
      writeText("movement-summary", `${ingredient.name} belum bisa dinonaktifkan karena stok masih ${formatQty(ingredient.stock)} ${ingredient.unit}. Habiskan stok dulu.`);
      return;
    }
    try {
      if (isInactiveStatus(ingredient.status)) putInventory(`/api/ingredient/${ingredient.id}`, { ...ingredient, status: COMMON_STATUS.ACTIVE });
      else deleteInventory(`/api/ingredient/${ingredient.id}`, {});
      const updated = state.ingredients.find((item) => item.id === ingredient.id) || ingredient;
      renderInventory();
      writeText("movement-summary", `${updated.name} ${isInactiveStatus(updated.status) ? "dinonaktifkan" : "diaktifkan"} tanpa menghapus audit.`);
    } catch (error) {
      writeText("movement-summary", error.message);
    }
  }

  if (event.target.closest("[data-close-modal]")) closeModal();
  if (event.target.matches("[data-modal-backdrop]")) closeModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

if (exists("modal-purchase-form")) byId("modal-purchase-form").addEventListener("submit", savePurchase);
if (exists("modal-waste-form")) byId("modal-waste-form").addEventListener("submit", saveWaste);
if (exists("modal-ingredient-form")) byId("modal-ingredient-form").addEventListener("submit", saveIngredient);
if (exists("modal-edit-ingredient-form")) byId("modal-edit-ingredient-form").addEventListener("submit", saveEditedIngredient);

["history-filter-from", "history-filter-to", "history-filter-ingredient", "history-filter-type", "history-filter-search"].forEach((id) => {
  if (exists(id)) byId(id).addEventListener("input", renderInventory);
  if (exists(id)) byId(id).addEventListener("change", renderInventory);
});

if (exists("history-filter-reset")) {
  byId("history-filter-reset").addEventListener("click", () => {
    byId("history-filter-ingredient").value = "all";
    byId("history-filter-type").value = "all";
    byId("history-filter-search").value = "";
    byId("history-filter-from").value = "";
    byId("history-filter-to").value = "";
    renderInventory();
  });
}

["ingredient-ledger-filter-ingredient", "ingredient-ledger-filter-type", "ingredient-ledger-filter-from", "ingredient-ledger-filter-to", "ingredient-ledger-filter-search"].forEach((id) => {
  if (exists(id)) byId(id).addEventListener("input", renderIngredientLedger);
  if (exists(id)) byId(id).addEventListener("change", renderIngredientLedger);
});

if (exists("ingredient-ledger-filter-reset")) {
  byId("ingredient-ledger-filter-reset").addEventListener("click", () => {
    byId("ingredient-ledger-filter-ingredient").value = selectedLedgerIngredientId;
    byId("ingredient-ledger-filter-type").value = "all";
    byId("ingredient-ledger-filter-from").value = "";
    byId("ingredient-ledger-filter-to").value = "";
    byId("ingredient-ledger-filter-search").value = "";
    renderIngredientLedger();
  });
}

["modal-purchase-qty", "modal-purchase-cost"].forEach((id) => {
  if (exists(id)) byId(id).addEventListener("input", updatePurchasePreview);
});

["modal-waste-ingredient", "modal-waste-qty", "modal-waste-type"].forEach((id) => {
  if (exists(id)) byId(id).addEventListener("input", updateWastePreview);
  if (exists(id)) byId(id).addEventListener("change", updateWastePreview);
});

["modal-ingredient-unit", "modal-ingredient-stock", "modal-ingredient-cost"].forEach((id) => {
  if (exists(id)) byId(id).addEventListener("input", updateIngredientPreview);
});
if (exists("modal-ingredient-standard-cost")) {
  byId("modal-ingredient-standard-cost").addEventListener("input", () => {
    standardCostTouched = true;
    updateIngredientPreview();
  });
}

if (exists("modal-ingredient-template")) {
  byId("modal-ingredient-template").addEventListener("change", () => fillFromTemplate("modal-ingredient-template", "modal-ingredient-name", "modal-ingredient-category", "modal-ingredient-unit"));
}
if (exists("modal-edit-template")) {
  byId("modal-edit-template").addEventListener("change", () => fillFromTemplate("modal-edit-template", "modal-edit-name", "modal-edit-category", "modal-edit-unit"));
}

const bootstrapResponse = refreshInventory();
if (!bootstrapResponse?.ok) showAlert(bootstrapResponse?.message || "Data inventory belum berhasil dimuat.");
renderInventory();
updatePurchasePreview();
updateWastePreview();
updateIngredientPreview();

const onboardingParams = new URLSearchParams(window.location.search);
if (onboardingParams.get("onboarding") === "1" && onboardingParams.get("create") === "ingredient" && canUsePermission("inventory.ingredients", "create", state, session)) {
  prepareNewIngredientModal();
  standardCostTouched = false;
  openModal("ingredient-modal");
}
