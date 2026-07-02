import { renderLayout } from "../layout.js?v=coffee-v151";
import { apiPost, applyPermissionControls, canUsePermission, loadSession, loadState, scopedPayload, visibleForSession } from "../store.js?v=coffee-v151";
import { formatQty, money } from "../format.js";
import { byId, setText, showAlert, showFeedback } from "../dom.js";
import { enhanceAllDataTables } from "../datatable.js";
import { ingredientById, isStockedProduct } from "../inventory.js";
import { isInactiveStatus } from "../status-codes.js";
import { applyPageBootstrap, loadPageBootstrap } from "../page-engine.js?v=coffee-v154";

renderLayout();

const state = loadState();
const session = loadSession();
let selectedLoss = null;
let selectedLedgerBatchId = "all";
let stockModalMode = "purchase";

function isRetailProduct(product) {
  return (product?.inventoryType || "made_to_order") === "retail";
}

function isProductionProduct(product) {
  return (product?.inventoryType || "made_to_order") === "finished_good";
}

function stockableProducts(mode = stockModalMode) {
  return (state.products || [])
    .filter((product) => visibleForSession(product, state, session))
    .filter((product) => isStockedProduct(product))
    .filter((product) => mode === "purchase" ? isRetailProduct(product) : isProductionProduct(product))
    .filter((product) => !isInactiveStatus(product.status));
}

function productionReadiness(product) {
  if (!product) return { ready: false, maxQty: 0, message: "Pilih produk terlebih dahulu.", blockers: ["Pilih produk terlebih dahulu."] };
  if (isRetailProduct(product)) {
    return { ready: true, maxQty: Number.POSITIVE_INFINITY, message: "Barang dagang memakai stok masuk dari pembelian.", blockers: [] };
  }
  const lines = product.recipe || [];
  if (!lines.length) {
    return { ready: false, maxQty: 0, message: "Recipe produk belum tersedia.", blockers: ["Recipe produk belum tersedia."] };
  }
  const blockers = [];
  const capacities = lines
    .filter((line) => Number(line.qty || 0) > 0)
    .map((line) => {
      const ingredient = ingredientById(state, line.ingredientId);
      const label = line.templateName || line.ingredientName || "Bahan recipe";
      if (!ingredient || isInactiveStatus(ingredient.status)) {
        blockers.push(`${label} belum dimapping ke bahan outlet.`);
        return 0;
      }
      const stock = Number(ingredient.stock || 0);
      const qtyPerUnit = Number(line.qty || 0);
      const capacity = Math.floor(stock / qtyPerUnit);
      if (capacity < 1) blockers.push(`${ingredient.name} tidak cukup (${formatQty(stock)} ${ingredient.unit || ""}, butuh ${formatQty(qtyPerUnit)} per unit).`);
      return capacity;
    });
  if (!capacities.length) blockers.push("Qty recipe belum lengkap.");
  const maxQty = capacities.length ? Math.min(...capacities) : 0;
  return {
    ready: blockers.length === 0 && maxQty > 0,
    maxQty,
    message: blockers.length ? blockers[0] : `Maksimal produksi ${formatQty(maxQty)} unit berdasarkan stok bahan saat ini.`,
    blockers
  };
}

function produceProduct(productId, payload) {
  const response = apiPost(`/api/product/${productId}/produce`, scopedPayload(payload, state, session));
  if (!response?.ok) throw new Error(response?.message || "Stok produk belum berhasil disimpan.");
  const updated = response.data;
  const index = state.products.findIndex((item) => item.id === updated.id);
  if (index >= 0) state.products[index] = updated;
  return updated;
}

function refreshProducts() {
  const response = loadPageBootstrap("finishedProducts", state, session, {
    view: "finished-products",
    ingredient_per_page: 100
  });
  if (response?.ok) applyPageBootstrap(state, response.data, ["products", "ingredients"]);
  return response;
}

function daysUntil(dateText) {
  if (!dateText) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date - today) / 86400000);
}

function expiryStatus(expiredAt) {
  const days = daysUntil(expiredAt);
  if (days === null) return { label: "Tanpa Expired", className: "status-low", priority: 3 };
  if (days < 0) return { label: `Expired ${Math.abs(days)} hari`, className: "status-empty", priority: 0 };
  if (days <= 7) return { label: `${days} hari lagi`, className: "status-low", priority: 1 };
  if (days <= 30) return { label: `${days} hari lagi`, className: "status-ok", priority: 2 };
  return { label: "Aman", className: "status-ok", priority: 4 };
}

function finishedProducts() {
  return (state.products || [])
    .filter((product) => visibleForSession(product, state, session))
    .filter((product) => isStockedProduct(product));
}

function finishedBatches() {
  return finishedProducts()
    .flatMap((product) => (product.batches || []).map((batch) => ({ product, batch })))
    .filter(({ batch }) => Number(batch.qty || 0) > 0)
    .sort((a, b) => {
      const statusA = expiryStatus(a.batch.expiredAt);
      const statusB = expiryStatus(b.batch.expiredAt);
      if (statusA.priority !== statusB.priority) return statusA.priority - statusB.priority;
      return String(a.batch.expiredAt || "9999-12-31").localeCompare(String(b.batch.expiredAt || "9999-12-31"));
    });
}

function renderFinishedProducts() {
  const products = finishedProducts();
  const batches = finishedBatches();
  const expiring = batches.filter(({ batch }) => {
    const days = daysUntil(batch.expiredAt);
    return days !== null && days <= 7;
  });
  const stockValue = batches.reduce((total, { batch }) => total + Number(batch.qty || 0) * Number(batch.unitCost || 0), 0);

  setText("finished-product-count", products.length.toLocaleString("id-ID"));
  setText("finished-batch-count", batches.length.toLocaleString("id-ID"));
  setText("finished-expiring-count", expiring.length.toLocaleString("id-ID"));
  setText("finished-stock-value", money(stockValue));

  byId("finished-product-table").innerHTML = batches.length
    ? batches
        .map(({ product, batch }) => {
          const status = expiryStatus(batch.expiredAt);
          return `
            <tr>
              <td><strong>${product.name}</strong><br><small>${product.sku || "-"} · ${product.category || "Tanpa kategori"}</small></td>
              <td><strong>${batch.batchNo}</strong><br><small>${batch.status || "active"}</small></td>
              <td>${formatQty(batch.qty)} unit</td>
              <td>${money(batch.unitCost || 0)}</td>
              <td>${money(Number(batch.qty || 0) * Number(batch.unitCost || 0))}</td>
              <td>${batch.manufacturedAt || "-"}</td>
              <td>${batch.expiredAt || "-"}</td>
              <td><span class="status-pill ${status.className}">${status.label}</span></td>
              <td>
                <div class="row-actions">
                  <button class="ghost-button compact-button" data-finished-loss="${batch.id}" data-permission="inventory.waste:create" type="button">Loss</button>
                  <button class="ghost-button compact-button" data-finished-ledger="${batch.id}" type="button">Kartu Stok</button>
                </div>
              </td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="9">Belum ada batch stok produk. Tambahkan stok dari tombol Stok Masuk / Produksi di halaman ini.</td></tr>`;

  enhanceAllDataTables();
  applyPermissionControls(document, state, session);
}

function selectedStockProduct() {
  return state.products.find((product) => product.id === byId("product-stock-product").value);
}

function renderStockProductOptions() {
  const products = stockableProducts();
  byId("product-stock-product").innerHTML = products.length
    ? products.map((product) => `<option value="${product.id}">${product.name} · ${isRetailProduct(product) ? "Barang Dagang" : "Produk Produksi"}</option>`).join("")
    : `<option value="">${stockModalMode === "purchase" ? "Belum ada barang dagang aktif" : "Belum ada produk produksi aktif"}</option>`;
  byId("product-stock-product").disabled = products.length === 0;
}

function productStockExpiryDate(product) {
  const shelfLifeDays = Number(product?.shelfLifeDays || 0);
  const manufacturedAt = byId("product-stock-manufactured-at").value;
  if (!shelfLifeDays || !manufacturedAt) return "";
  const date = new Date(`${manufacturedAt}T00:00:00`);
  date.setDate(date.getDate() + shelfLifeDays);
  return date.toISOString().slice(0, 10);
}

function updateStockModal() {
  if (!byId("product-stock-modal")) return;
  const product = selectedStockProduct();
  const retail = stockModalMode === "purchase";
  const readiness = productionReadiness(product);
  const qty = Math.floor(Number(byId("product-stock-qty").value) || 0);
  byId("product-stock-eyebrow").textContent = retail ? "Pembelian Produk" : "Produksi Batch";
  byId("product-stock-title").textContent = retail ? "Beli Barang Dagang" : "Produksi Produk";
  byId("product-stock-description").textContent = retail
    ? "Pilih barang dagang. Pembelian akan membuat batch produk dengan HPP dari total harga beli."
    : "Produksi batch memotong bahan recipe FEFO lalu menambah stok produk.";
  byId("product-stock-qty-label").textContent = retail ? "Qty Beli" : "Qty Produksi";
  byId("product-stock-submit-button").textContent = retail ? "Simpan Pembelian" : "Simpan Produksi";
  byId("product-stock-total-cost-field").hidden = !retail;
  byId("product-stock-total-cost").disabled = !retail;
  byId("product-stock-total-cost").required = retail;
  byId("product-stock-expired-at-field").hidden = !retail;
  byId("product-stock-expired-at").disabled = !retail;
  byId("product-stock-qty").max = retail || !readiness.ready ? "" : readiness.maxQty;
  if (retail) {
    const totalCost = Number(byId("product-stock-total-cost").value) || 0;
    const unitCost = qty > 0 && totalCost > 0 ? totalCost / qty : 0;
    byId("product-stock-preview").textContent = qty > 0
      ? `Stok masuk ${formatQty(qty)} unit. HPP per unit ${money(unitCost)} dari total harga beli ${money(totalCost)}.`
      : "Isi qty stok masuk dan total harga beli.";
    byId("product-stock-expired-preview").textContent = "Expired barang dagang diisi manual bila produk memiliki masa kedaluwarsa.";
    return;
  }
  const expiry = productStockExpiryDate(product);
  byId("product-stock-expired-preview").textContent = expiry
    ? `Expired otomatis: ${expiry} (${Number(product?.shelfLifeDays || 0)} hari setelah produksi)`
    : "Produk ini tidak memakai expired otomatis karena shelf life belum diisi.";
  byId("product-stock-preview").textContent = readiness.ready
    ? `Maksimal produksi ${formatQty(readiness.maxQty)} unit. Stok produk saat ini ${formatQty(product?.finishedStock || 0)} unit.`
    : readiness.message;
}

function openStockModal(mode = "purchase") {
  stockModalMode = mode === "production" ? "production" : "purchase";
  renderStockProductOptions();
  byId("product-stock-form").reset();
  byId("product-stock-qty").value = 1;
  byId("product-stock-manufactured-at").value = new Date().toISOString().slice(0, 10);
  updateStockModal();
  document.querySelector("[data-modal-backdrop]").hidden = false;
  byId("product-stock-modal").hidden = false;
  document.body.classList.add("modal-open");
}

function findBatch(batchId) {
  for (const product of finishedProducts()) {
    const batch = (product.batches || []).find((item) => item.id === batchId);
    if (batch) return { product, batch };
  }
  return null;
}

function allFinishedBatchRows() {
  return finishedProducts().flatMap((product) => (product.batches || []).map((batch) => ({ product, batch })));
}

function renderLedgerBatchOptions() {
  if (!byId("finished-ledger-filter-batch")) return;
  const currentValue = selectedLedgerBatchId || byId("finished-ledger-filter-batch").value || "all";
  const rows = allFinishedBatchRows();
  const selectedRow = rows.find(({ batch }) => batch.id === currentValue) || rows[0];
  byId("finished-ledger-filter-batch").innerHTML = (selectedRow ? [selectedRow] : [])
    .map(({ product, batch }) => `<option value="${batch.id}">${product.name} · ${batch.batchNo}</option>`)
    .join("");
  byId("finished-ledger-filter-batch").value = selectedRow?.batch.id || "";
  selectedLedgerBatchId = byId("finished-ledger-filter-batch").value;
}

function openLossModal(batchId) {
  selectedLoss = findBatch(batchId);
  if (!selectedLoss) return;
  byId("finished-ledger-modal").hidden = true;
  byId("finished-loss-form").reset();
  byId("finished-loss-batch-id").value = selectedLoss.batch.id;
  byId("finished-loss-product").value = selectedLoss.product.name;
  byId("finished-loss-batch").value = `${selectedLoss.batch.batchNo} · sisa ${formatQty(selectedLoss.batch.qty)}`;
  byId("finished-loss-qty").max = Math.floor(Number(selectedLoss.batch.qty || 0));
  updateLossPreview();
  document.querySelector("[data-modal-backdrop]").hidden = false;
  byId("finished-loss-modal").hidden = false;
  document.body.classList.add("modal-open");
}

function closeModal() {
  const backdrop = document.querySelector("[data-modal-backdrop]");
  if (backdrop) backdrop.hidden = true;
  byId("product-stock-modal").hidden = true;
  byId("finished-loss-modal").hidden = true;
  byId("finished-ledger-modal").hidden = true;
  document.body.classList.remove("modal-open");
}

function lossTypeLabel(type) {
  return {
    expired: "Expired",
    waste: "Rusak / Terbuang",
    lost: "Hilang",
    sample: "Sample / Tester",
    adjustment: "Koreksi"
  }[type] || "Loss";
}

function updateLossPreview() {
  if (!selectedLoss) return;
  const qty = Math.min(Math.floor(Number(byId("finished-loss-qty").value) || 0), Math.floor(Number(selectedLoss.batch.qty || 0)));
  const value = qty * Number(selectedLoss.batch.unitCost || 0);
  setText("finished-loss-preview", qty > 0
    ? `Estimasi ${lossTypeLabel(byId("finished-loss-type").value)}: ${money(value)}. Stok setelah loss: ${formatQty(Number(selectedLoss.batch.qty || 0) - qty)} unit.`
    : "Estimasi nilai loss akan muncul setelah qty diisi.");
}

function movementTypeLabel(type) {
  return {
    production: "Produksi",
    purchase: "Stok Masuk Retail",
    sale: "Penjualan POS",
    sale_edit: "Edit / Restock POS",
    expired: "Expired",
    waste: "Waste",
    lost: "Hilang",
    sample: "Sample",
    adjustment: "Koreksi"
  }[type] || type || "-";
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function openLedgerModal(batchId) {
  selectedLedgerBatchId = batchId;
  if (!selectedLedgerBatchId) return;
  renderLedgerBatchOptions();
  renderFinishedLedger();
  document.querySelector("[data-modal-backdrop]").hidden = false;
  byId("finished-ledger-modal").hidden = false;
  document.body.classList.add("modal-open");
}

function filteredFinishedLedgerMovements() {
  const batchId = byId("finished-ledger-filter-batch").value || selectedLedgerBatchId || "all";
  const type = byId("finished-ledger-filter-type").value || "all";
  const from = byId("finished-ledger-filter-from").value;
  const to = byId("finished-ledger-filter-to").value;
  const search = byId("finished-ledger-filter-search").value.trim().toLowerCase();
  selectedLedgerBatchId = batchId;
  return allFinishedBatchRows()
    .filter(({ batch }) => batch.id === selectedLedgerBatchId)
    .flatMap(({ product, batch }) => (batch.movements || []).map((movement) => ({ product, batch, movement })))
    .filter(({ movement }) => type === "all" || movement.type === type)
    .filter(({ movement }) => !from || new Date(movement.createdAt) >= new Date(`${from}T00:00:00`))
    .filter(({ movement }) => !to || new Date(movement.createdAt) <= new Date(`${to}T23:59:59.999`))
    .filter(({ movement }) => !search || (movement.note || "").toLowerCase().includes(search));
}

function renderFinishedLedger() {
  const selected = findBatch(selectedLedgerBatchId);
  const rows = filteredFinishedLedgerMovements();
  byId("finished-loss-modal").hidden = true;
  setText("finished-ledger-title", selected ? `Kartu Stok - ${selected.product.name}` : "Kartu Stok Produk");
  setText("finished-ledger-summary", selected
    ? `${selected.batch.batchNo} · sisa ${formatQty(selected.batch.qty)} unit · HPP batch ${money(selected.batch.unitCost || 0)}`
    : `${rows.length} transaksi produk sesuai filter.`);
  byId("finished-ledger-table").innerHTML = rows.length
    ? rows.map(({ product, batch, movement }) => `
        <tr>
          <td>${formatDateTime(movement.createdAt)}</td>
          <td><span class="status-pill status-ok">${movementTypeLabel(movement.type)}</span><br><small>${product.name} · ${batch.batchNo}</small></td>
          <td>${formatQty(movement.beforeQty || 0)}</td>
          <td class="text-success">${Number(movement.qtyIn || 0) > 0 ? `+${formatQty(movement.qtyIn)}` : "-"}</td>
          <td class="text-danger">${Number(movement.qtyOut || 0) > 0 ? `-${formatQty(movement.qtyOut)}` : "-"}</td>
          <td><strong>${formatQty(movement.afterQty || 0)}</strong></td>
          <td>${money(movement.totalCost || 0)}</td>
          <td>${movement.note || "-"}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="8">Belum ada mutasi untuk batch ini.</td></tr>`;
}

byId("finished-loss-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canUsePermission("inventory.waste", "create", state, session)) {
    showFeedback("finished-loss-feedback", "Anda tidak punya akses untuk mencatat loss produk.");
    return;
  }
  if (!selectedLoss) return;
  const rawQty = Number(byId("finished-loss-qty").value);
  const qty = Math.min(Math.floor(rawQty || 0), Math.floor(Number(selectedLoss.batch.qty || 0)));
  if (qty <= 0) {
    showFeedback("finished-loss-feedback", "Qty loss wajib lebih dari 0.");
    return;
  }
  if (!Number.isInteger(rawQty) || rawQty !== qty) {
    showFeedback("finished-loss-feedback", "Qty loss produk wajib bilangan utuh dan tidak boleh melebihi stok batch.");
    return;
  }
  const response = apiPost(`/api/product-batch/${selectedLoss.batch.id}/loss`, scopedPayload({
    qty,
    type: byId("finished-loss-type").value,
    note: byId("finished-loss-note").value.trim() || `${lossTypeLabel(byId("finished-loss-type").value)} produk`
  }, state, session));
  if (!response?.ok) {
    showFeedback("finished-loss-feedback", response?.message || "Loss produk belum berhasil disimpan.");
    return;
  }
  refreshProducts();
  renderFinishedProducts();
  closeModal();
  showAlert(`${lossTypeLabel(byId("finished-loss-type").value)} produk tercatat.`);
});

byId("product-stock-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canUsePermission("products.catalog", "update", state, session)) {
    showFeedback("product-stock-feedback", "Anda tidak punya akses untuk menambah stok produk.");
    return;
  }
  const product = selectedStockProduct();
  const readiness = productionReadiness(product);
  const qty = Math.floor(Number(byId("product-stock-qty").value) || 0);
  if (!product) {
    showFeedback("product-stock-feedback", "Pilih produk terlebih dahulu.");
    return;
  }
  if (!readiness.ready) {
    showFeedback("product-stock-feedback", readiness.blockers.join(" "));
    return;
  }
  if (qty <= 0 || (!isRetailProduct(product) && qty > readiness.maxQty) || Number(byId("product-stock-qty").value) !== qty) {
    showFeedback("product-stock-feedback", isRetailProduct(product)
      ? "Qty stok masuk wajib bilangan utuh lebih dari 0."
      : `Qty produksi wajib bilangan utuh 1 sampai ${formatQty(readiness.maxQty)} sesuai ketersediaan bahan.`);
    return;
  }
  if (isRetailProduct(product) && Number(byId("product-stock-total-cost").value) <= 0) {
    showFeedback("product-stock-feedback", "Total harga beli wajib lebih dari 0 untuk stok barang dagang.");
    return;
  }
  try {
    produceProduct(product.id, {
      qty,
      totalCost: Number(byId("product-stock-total-cost").value) || 0,
      manufacturedAt: byId("product-stock-manufactured-at").value,
      expiredAt: byId("product-stock-expired-at").value,
      note: byId("product-stock-note").value.trim()
    });
    refreshProducts();
    renderFinishedProducts();
    closeModal();
    showAlert(isRetailProduct(product)
      ? "Stok barang dagang tersimpan dan siap dijual sesuai batch FEFO."
      : "Batch produk tersimpan dan stok bahan sudah dipotong FEFO.");
  } catch (error) {
    showFeedback("product-stock-feedback", error.message);
  }
});

["finished-loss-qty", "finished-loss-type"].forEach((id) => {
  byId(id).addEventListener("input", updateLossPreview);
  byId(id).addEventListener("change", updateLossPreview);
});

document.addEventListener("click", (event) => {
  const stockModalButton = event.target.closest("[data-open-product-stock-modal]");
  if (stockModalButton && canUsePermission("products.catalog", "update", state, session)) openStockModal(stockModalButton.dataset.openProductStockModal);
  const lossButton = event.target.closest("[data-finished-loss]");
  if (lossButton && canUsePermission("inventory.waste", "create", state, session)) openLossModal(lossButton.dataset.finishedLoss);
  const ledgerButton = event.target.closest("[data-finished-ledger]");
  if (ledgerButton) openLedgerModal(ledgerButton.dataset.finishedLedger);
  if (event.target.closest("[data-close-modal]") || event.target.matches("[data-modal-backdrop]")) closeModal();
});

["product-stock-product", "product-stock-qty", "product-stock-total-cost", "product-stock-manufactured-at", "product-stock-expired-at"].forEach((id) => {
  byId(id).addEventListener("input", updateStockModal);
  byId(id).addEventListener("change", updateStockModal);
});

["finished-ledger-filter-batch", "finished-ledger-filter-type", "finished-ledger-filter-from", "finished-ledger-filter-to", "finished-ledger-filter-search"].forEach((id) => {
  byId(id).addEventListener("input", renderFinishedLedger);
  byId(id).addEventListener("change", renderFinishedLedger);
});

byId("finished-ledger-filter-reset").addEventListener("click", () => {
  byId("finished-ledger-filter-batch").value = selectedLedgerBatchId;
  byId("finished-ledger-filter-type").value = "all";
  byId("finished-ledger-filter-from").value = "";
  byId("finished-ledger-filter-to").value = "";
  byId("finished-ledger-filter-search").value = "";
  renderFinishedLedger();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

const bootstrapResponse = refreshProducts();
if (!bootstrapResponse?.ok) showAlert(bootstrapResponse?.message || "Data stok produk belum berhasil dimuat.");
renderFinishedProducts();
