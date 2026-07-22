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
let selectedProductForLedger = null;
let stockModalMode = "purchase";
let ledgerCurrentPage = 1;
const ledgerPageSize = 10;
let activeLedgerTab = "batches";

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

function productStockStatus(product) {
  const stock = Number(product.finishedStock || 0);
  if (stock <= 0) return { label: "Habis", className: "status-empty" };
  
  // Find nearest expiry date among active batches (qty > 0)
  const activeBatches = (product.batches || []).filter((b) => Number(b.qty || 0) > 0);
  if (activeBatches.length > 0) {
    const statuses = activeBatches.map((b) => expiryStatus(b.expiredAt));
    // Sort by priority (lower priority is more urgent, e.g. Expired=0, 7 days=1, etc.)
    statuses.sort((a, b) => a.priority - b.priority);
    return statuses[0];
  }
  return { label: "Aman", className: "status-ok" };
}

function productNearestExpiry(product) {
  const activeBatches = (product.batches || []).filter((b) => Number(b.qty || 0) > 0 && b.expiredAt);
  if (activeBatches.length === 0) return "-";
  const dates = activeBatches.map((b) => b.expiredAt).sort();
  return dates[0];
}

function renderFinishedProducts() {
  const products = finishedProducts();
  const activeBatches = products.flatMap((product) => (product.batches || []).map((batch) => ({ product, batch })))
    .filter(({ batch }) => Number(batch.qty || 0) > 0);
  const expiring = activeBatches.filter(({ batch }) => {
    const days = daysUntil(batch.expiredAt);
    return days !== null && days <= 7;
  });
  const stockValue = activeBatches.reduce((total, { batch }) => total + Number(batch.qty || 0) * Number(batch.unitCost || 0), 0);

  setText("finished-product-count", products.length.toLocaleString("id-ID"));
  setText("finished-batch-count", activeBatches.length.toLocaleString("id-ID"));
  setText("finished-expiring-count", expiring.length.toLocaleString("id-ID"));
  setText("finished-stock-value", money(stockValue));

  byId("finished-product-table").innerHTML = products.length
    ? products
        .map((product) => {
          const typeLabel = isRetailProduct(product) ? "Barang Dagang" : "Produk Jadi";
          const status = productStockStatus(product);
          const expiryText = productNearestExpiry(product);
          const totalStock = Number(product.finishedStock || 0);
          const avgCost = Number(product.finishedUnitCost || 0);
          const totalValue = totalStock * avgCost;
          
          const actionBtn = isRetailProduct(product)
            ? `<button class="ghost-button compact-button" data-open-product-stock-modal="purchase" data-product-id="${product.id}" data-permission="products.catalog:update" type="button">Beli</button>`
            : `<button class="ghost-button compact-button" data-open-product-stock-modal="production" data-product-id="${product.id}" data-permission="products.catalog:update" type="button">Produksi</button>`;

          return `
            <tr>
              <td><strong>${product.name}</strong><br><small>${product.sku || "-"} · ${product.category || "Tanpa kategori"}</small></td>
              <td><span class="status-pill status-ok">${typeLabel}</span></td>
              <td>${formatQty(totalStock)} unit</td>
              <td>${money(avgCost)}</td>
              <td>${money(totalValue)}</td>
              <td>${expiryText}</td>
              <td><span class="status-pill ${status.className}">${status.label}</span></td>
              <td>
                <div class="row-actions">
                  ${actionBtn}
                  <button class="primary-button compact-button" data-finished-product-ledger="${product.id}" type="button">Kartu Stok</button>
                </div>
              </td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="8">Belum ada stok produk. Tambahkan stok menggunakan tombol di atas.</td></tr>`;

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

function renderProductBatches() {
  if (!selectedProductForLedger) return;
  const product = selectedProductForLedger;
  
  const batches = (product.batches || [])
    .sort((a, b) => {
      const qtyA = Number(a.qty || 0);
      const qtyB = Number(b.qty || 0);
      if ((qtyA === 0) !== (qtyB === 0)) {
        return qtyA === 0 ? 1 : -1;
      }
      return String(a.expiredAt || "9999-12-31").localeCompare(String(b.expiredAt || "9999-12-31"));
    });

  byId("product-batches-grid").innerHTML = batches.length
    ? batches
        .map((batch) => {
          const isEmpty = Number(batch.qty || 0) === 0;
          const status = isEmpty 
            ? { label: "Habis / Terpakai", className: "status-empty" }
            : expiryStatus(batch.expiredAt);
            
          const cardStyle = isEmpty
            ? "border: 1px dashed var(--line); background: #fafbfc; opacity: 0.75;"
            : "border: 1px solid var(--line); background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.05);";
            
          return `
            <div style="border-radius: 8px; padding: 14px; display: flex; flex-direction: column; justify-content: space-between; transition: transform 0.15s, box-shadow 0.15s; ${cardStyle}">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; gap: 8px;">
                  <div>
                    <span style="font-size: 11px; color: var(--ink-light); text-transform: uppercase; font-weight: bold; tracking: 0.5px;">No. Batch</span>
                    <strong style="display: block; font-size: 15px; color: var(--ink); font-family: monospace;">${batch.batchNo}</strong>
                  </div>
                  <span class="status-pill ${status.className}" style="font-size: 11px; padding: 2px 6px;">${status.label}</span>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; font-size: 12px; margin-bottom: 12px;">
                  <div>
                    <span style="color: var(--ink-light); display: block; font-size: 11px;">Stok Tersisa</span>
                    <strong style="color: ${isEmpty ? "var(--ink-light)" : "var(--ink)"}; font-size: 13px;">${formatQty(batch.qty)} unit</strong>
                  </div>
                  <div>
                    <span style="color: var(--ink-light); display: block; font-size: 11px;">HPP Batch</span>
                    <strong style="color: var(--ink); font-size: 13px;">${money(batch.unitCost || 0)}</strong>
                  </div>
                  <div style="grid-column: span 2;">
                    <span style="color: var(--ink-light); display: block; font-size: 11px;">Expired Date</span>
                    <strong style="color: var(--ink); font-size: 12px;">${batch.expiredAt || "Tanpa Kedaluwarsa"}</strong>
                  </div>
                </div>
              </div>
              
              <div style="border-top: 1px solid var(--line); padding-top: 10px; margin-top: auto; display: flex; justify-content: flex-end;">
                <button class="ghost-button compact-button" data-finished-loss="${batch.id}" data-permission="inventory.waste:create" ${isEmpty ? "disabled title='Batch sudah habis'" : ""} type="button" style="width: 100%; text-align: center; justify-content: center; font-size: 12px;">
                  Catat Loss
                </button>
              </div>
            </div>
          `;
        })
        .join("")
    : `<div style="grid-column: span 3; text-align: center; color: var(--ink-light); padding: 24px;">Tidak ada batch untuk produk ini.</div>`;
  applyPermissionControls(byId("product-batches-grid"), state, session);
  
  // Explicitly disable depleted loss buttons after applyPermissionControls
  byId("product-batches-grid").querySelectorAll("[data-finished-loss]").forEach((btn) => {
    const batchId = btn.dataset.finishedLoss;
    const found = findBatch(batchId);
    if (found && Number(found.batch.qty || 0) <= 0) {
      btn.disabled = true;
      btn.title = "Batch sudah habis";
    }
  });
}

function setLedgerActiveTab(tabName) {
  activeLedgerTab = tabName;
  
  const tabBatchesBtn = byId("ledger-tab-batches");
  const tabLedgerBtn = byId("ledger-tab-ledger");
  const contentBatches = byId("tab-content-batches");
  const contentLedger = byId("tab-content-ledger");
  
  if (!tabBatchesBtn || !tabLedgerBtn || !contentBatches || !contentLedger) return;
  
  if (activeLedgerTab === "batches") {
    tabBatchesBtn.style.color = "var(--ink)";
    tabBatchesBtn.style.borderBottomColor = "var(--ink)";
    tabLedgerBtn.style.color = "var(--ink-light)";
    tabLedgerBtn.style.borderBottomColor = "transparent";
    
    contentBatches.hidden = false;
    contentLedger.hidden = true;
  } else {
    tabBatchesBtn.style.color = "var(--ink-light)";
    tabBatchesBtn.style.borderBottomColor = "transparent";
    tabLedgerBtn.style.color = "var(--ink)";
    tabLedgerBtn.style.borderBottomColor = "var(--ink)";
    
    contentBatches.hidden = true;
    contentLedger.hidden = false;
  }
}

function openProductLedgerModal(productId) {
  const product = finishedProducts().find((p) => p.id === productId);
  if (!product) return;
  selectedProductForLedger = product;
  
  ledgerCurrentPage = 1;
  setLedgerActiveTab("batches");
  
  renderProductBatches();
  renderFinishedLedger();
  document.querySelector("[data-modal-backdrop]").hidden = false;
  byId("finished-ledger-modal").hidden = false;
  document.body.classList.add("modal-open");
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
  if (byId("finished-loss-modal") && !byId("finished-loss-modal").hidden) {
    byId("finished-loss-modal").hidden = true;
    if (selectedProductForLedger) {
      byId("finished-ledger-modal").hidden = false;
    } else {
      document.querySelector("[data-modal-backdrop]").hidden = true;
      document.body.classList.remove("modal-open");
    }
    return;
  }

  const backdrop = document.querySelector("[data-modal-backdrop]");
  if (backdrop) backdrop.hidden = true;
  byId("product-stock-modal").hidden = true;
  byId("finished-loss-modal").hidden = true;
  byId("finished-ledger-modal").hidden = true;
  selectedProductForLedger = null;
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
  const found = findBatch(batchId);
  if (found) {
    openProductLedgerModal(found.product.id);
  }
}

function filteredFinishedLedgerMovements() {
  const type = byId("finished-ledger-filter-type").value || "all";
  const from = byId("finished-ledger-filter-from").value;
  const to = byId("finished-ledger-filter-to").value;
  const search = byId("finished-ledger-filter-search").value.trim().toLowerCase();
  
  if (!selectedProductForLedger) return [];
  const product = selectedProductForLedger;
  
  // 1. Gather all movements from all batches of this product
  const allMovements = (product.batches || []).flatMap((batch) => 
    (batch.movements || []).map((m) => ({
      batch,
      movement: m,
      createdAtTime: new Date(m.createdAt).getTime()
    }))
  );
  
  // 2. Sort chronologically by createdAt (ascending) to calculate running balance correctly
  allMovements.sort((a, b) => {
    if (a.createdAtTime !== b.createdAtTime) {
      return a.createdAtTime - b.createdAtTime;
    }
    return Number(a.movement.id || 0) - Number(b.movement.id || 0);
  });
  
  // 3. Calculate product-level running balance
  let runningQty = 0;
  const movementsWithRunningBalance = allMovements.map((item) => {
    const qtyIn = Number(item.movement.qtyIn || 0);
    const qtyOut = Number(item.movement.qtyOut || 0);
    const beforeQty = runningQty;
    const afterQty = runningQty + qtyIn - qtyOut;
    runningQty = afterQty;
    
    return {
      batch: item.batch,
      movement: item.movement,
      beforeQty,
      qtyIn,
      qtyOut,
      afterQty
    };
  });
  
  // 4. Reverse the order so newest is at the top of the table
  movementsWithRunningBalance.reverse();
  
  // 5. Apply filters
  return movementsWithRunningBalance
    .filter((item) => type === "all" || item.movement.type === type)
    .filter((item) => !from || new Date(item.movement.createdAt) >= new Date(`${from}T00:00:00`))
    .filter((item) => !to || new Date(item.movement.createdAt) <= new Date(`${item.movement.createdAt}T23:59:59.999`))
    .filter((item) => !search || (item.movement.note || "").toLowerCase().includes(search));
}

function renderLedgerPagination(totalItems) {
  const paginationEl = byId("finished-ledger-pagination");
  if (!paginationEl) return;
  
  const totalPages = Math.ceil(totalItems / ledgerPageSize) || 1;
  if (totalItems <= ledgerPageSize) {
    paginationEl.innerHTML = "";
    paginationEl.style.display = "none";
    return;
  }
  
  const start = (ledgerCurrentPage - 1) * ledgerPageSize + 1;
  const end = Math.min(ledgerCurrentPage * ledgerPageSize, totalItems);
  
  paginationEl.style.display = "flex";
  paginationEl.innerHTML = `
    <div style="color: var(--ink-light);">
      Menampilkan <strong>${start}</strong> - <strong>${end}</strong> dari <strong>${totalItems}</strong> mutasi
    </div>
    <div style="display: flex; gap: 6px; align-items: center;">
      <button class="ghost-button compact-button" id="ledger-prev-btn" ${ledgerCurrentPage === 1 ? "disabled" : ""} type="button">Sebelumnya</button>
      <span style="font-weight: 500; padding: 0 8px;">Halaman ${ledgerCurrentPage} dari ${totalPages}</span>
      <button class="ghost-button compact-button" id="ledger-next-btn" ${ledgerCurrentPage === totalPages ? "disabled" : ""} type="button">Berikutnya</button>
    </div>
  `;
  
  byId("ledger-prev-btn").addEventListener("click", () => {
    if (ledgerCurrentPage > 1) {
      ledgerCurrentPage--;
      renderFinishedLedger();
    }
  });
  byId("ledger-next-btn").addEventListener("click", () => {
    if (ledgerCurrentPage < totalPages) {
      ledgerCurrentPage++;
      renderFinishedLedger();
    }
  });
}

function renderFinishedLedger() {
  if (!selectedProductForLedger) return;
  const product = selectedProductForLedger;
  const rows = filteredFinishedLedgerMovements();
  
  // Calculate total stock in and stock out from all filtered records
  const totalIn = rows.reduce((sum, item) => sum + item.qtyIn, 0);
  const totalOut = rows.reduce((sum, item) => sum + item.qtyOut, 0);
  
  setText("ledger-total-in", `+${formatQty(totalIn)} unit`);
  setText("ledger-total-out", `-${formatQty(totalOut)} unit`);
  
  const totalItems = rows.length;
  const totalPages = Math.ceil(totalItems / ledgerPageSize) || 1;
  if (ledgerCurrentPage > totalPages) {
    ledgerCurrentPage = totalPages;
  }
  
  const start = (ledgerCurrentPage - 1) * ledgerPageSize;
  const end = start + ledgerPageSize;
  const paginatedRows = rows.slice(start, end);
  
  byId("finished-loss-modal").hidden = true;
  setText("finished-ledger-title", `Kartu Stok - ${product.name}`);
  setText("finished-ledger-summary", `Total Stok: ${formatQty(product.finishedStock || 0)} unit · ${totalItems} transaksi sesuai filter.`);
  
  byId("finished-ledger-table").innerHTML = paginatedRows.length
    ? paginatedRows.map(({ batch, movement, beforeQty, qtyIn, qtyOut, afterQty }) => `
        <tr>
          <td>${formatDateTime(movement.createdAt)}</td>
          <td><span class="status-pill status-ok">${movementTypeLabel(movement.type)}</span><br><small>Batch: ${batch.batchNo}</small></td>
          <td>${formatQty(beforeQty)}</td>
          <td class="text-success">${qtyIn > 0 ? `+${formatQty(qtyIn)}` : "-"}</td>
          <td class="text-danger">${qtyOut > 0 ? `-${formatQty(qtyOut)}` : "-"}</td>
          <td><strong>${formatQty(afterQty)}</strong></td>
          <td>${money(movement.totalCost || 0)}</td>
          <td>${movement.note || "-"}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="8">Belum ada mutasi untuk produk ini.</td></tr>`;
    
  renderLedgerPagination(totalItems);
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
  if (selectedProductForLedger) {
    selectedProductForLedger = finishedProducts().find((p) => p.id === selectedProductForLedger.id);
    renderProductBatches();
    renderFinishedLedger();
  }
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
  if (stockModalButton && canUsePermission("products.catalog", "update", state, session)) {
    openStockModal(stockModalButton.dataset.openProductStockModal, stockModalButton.dataset.productId);
  }
  const productLedgerButton = event.target.closest("[data-finished-product-ledger]");
  if (productLedgerButton) {
    openProductLedgerModal(productLedgerButton.dataset.finishedProductLedger);
  }
  const lossButton = event.target.closest("[data-finished-loss]");
  if (lossButton && canUsePermission("inventory.waste", "create", state, session)) {
    const batchId = lossButton.dataset.finishedLoss;
    const found = findBatch(batchId);
    if (found && Number(found.batch.qty || 0) <= 0) {
      return;
    }
    openLossModal(batchId);
  }
  const ledgerButton = event.target.closest("[data-finished-ledger]");
  if (ledgerButton) {
    openLedgerModal(ledgerButton.dataset.finishedLedger);
  }
  const tabButton = event.target.closest("[data-ledger-tab]");
  if (tabButton) {
    setLedgerActiveTab(tabButton.dataset.ledgerTab);
  }
  if (event.target.closest("[data-close-modal]") || event.target.matches("[data-modal-backdrop]")) {
    closeModal();
  }
});

["product-stock-product", "product-stock-qty", "product-stock-total-cost", "product-stock-manufactured-at", "product-stock-expired-at"].forEach((id) => {
  byId(id).addEventListener("input", updateStockModal);
  byId(id).addEventListener("change", updateStockModal);
});

["finished-ledger-filter-type", "finished-ledger-filter-from", "finished-ledger-filter-to", "finished-ledger-filter-search"].forEach((id) => {
  const handler = () => {
    ledgerCurrentPage = 1;
    renderFinishedLedger();
  };
  byId(id).addEventListener("input", handler);
  byId(id).addEventListener("change", handler);
});

byId("finished-ledger-filter-reset").addEventListener("click", () => {
  ledgerCurrentPage = 1;
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


