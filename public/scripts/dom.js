export function byId(id) {
  return document.getElementById(id);
}

export function setText(id, value) {
  const element = byId(id);
  if (element) element.textContent = value;
}

export function showFeedback(id, message) {
  const element = byId(id);
  if (!element) return;
  element.textContent = message;
  element.classList.add("show");
}

export function showAlert(message, type = "success") {
  let alert = document.querySelector("[data-app-alert]");
  if (!alert) {
    alert = document.createElement("div");
    alert.setAttribute("data-app-alert", "");
    alert.setAttribute("role", "status");
    document.body.appendChild(alert);
  }
  alert.className = `app-alert ${type === "error" ? "error" : "success"}`;
  alert.textContent = message;
  window.clearTimeout(showAlert.timer);
  showAlert.timer = window.setTimeout(() => {
    alert.classList.add("hide");
    window.setTimeout(() => alert.remove(), 220);
  }, 2600);
}

export function showPreorderFulfillmentModal(order, products, onSelect) {
  let backdrop = document.querySelector("[data-preorder-fulfillment-backdrop]");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.setAttribute("data-preorder-fulfillment-backdrop", "");
    backdrop.style.zIndex = "200";
    backdrop.hidden = true;
    
    const dialog = document.createElement("section");
    dialog.className = "modal-dialog";
    dialog.id = "preorder-fulfillment-modal";
    dialog.style.maxWidth = "520px";
    dialog.hidden = true;
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    
    backdrop.addEventListener("click", (e) => {
      if (e.target.matches("[data-preorder-fulfillment-backdrop]") || e.target.closest("[data-close-pf-modal]")) {
        closePreorderFulfillmentModal();
      }
    });
  }
  
  const dialog = backdrop.querySelector("#preorder-fulfillment-modal");
  const poItems = (order.items || []).filter(item => !item.isPackaging && (item.isPreorder || (item.modifier_snapshot && JSON.parse(item.modifier_snapshot).isPreorder)));
  
  let formsHtml = "";
  poItems.forEach((item, index) => {
    const product = products.find(p => p.id === item.productId || String(p.id) === String(item.productId));
    const type = product ? product.inventory_type : 'made_to_order';
    
    formsHtml += `
      <div class="pf-item-form-group" data-product-id="${item.productId}" data-qty="${item.qty}" data-type="${type}" style="background: var(--bg-surface-subtle, #f5f5f5); padding: 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border-color, #e0e0e0); text-align: left;">
        <h4 style="margin: 0 0 12px 0; color: var(--text-color, #333); font-size: 15px; border-bottom: 1px dashed var(--border-color, #ccc); padding-bottom: 6px;">
          <strong>${item.qty}x</strong> ${item.productName || item.name}
          <span style="float: right; font-size: 11px; font-weight: normal; padding: 2px 6px; border-radius: 4px; background: ${type === 'retail' ? '#e3f2fd; color: #1565c0;' : type === 'finished_good' ? '#e8f5e9; color: #2e7d32;' : '#fff3e0; color: #ef6c00;'}">
            ${type === 'retail' ? '🛒 Barang Dagang (Vendor)' : type === 'finished_good' ? '🛠️ Barang Jadi (Internal)' : '🍳 Menu Dapur'}
          </span>
        </h4>
        
        <div class="pf-fields-container-${index}">
          ${type === 'retail' ? `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; text-align: left;">
              <label style="font-size: 12px; font-weight: 600; display: block;">Total Harga Beli (Modal)
                <input type="number" class="pf-cost-${index}" min="1" required style="width: 100%; padding: 6px; margin-top: 4px; border-radius: 4px; border: 1px solid var(--border-color, #ccc); box-sizing: border-box;" />
              </label>
              <label style="font-size: 12px; font-weight: 600; display: block;">Expired Date <small style="font-weight: normal; color: #888;">(Opsional)</small>
                <input type="date" class="pf-expiry-${index}" style="width: 100%; padding: 6px; margin-top: 4px; border-radius: 4px; border: 1px solid var(--border-color, #ccc); box-sizing: border-box;" />
              </label>
            </div>
            <div style="margin-top: 8px; text-align: left;">
              <label style="font-size: 12px; font-weight: 600; display: block;">Catatan Pembelian
                <input type="text" class="pf-note-${index}" value="Fulfillment preorder #${order.orderNumber}" required style="width: 100%; padding: 6px; margin-top: 4px; border-radius: 4px; border: 1px solid var(--border-color, #ccc); box-sizing: border-box;" />
              </label>
            </div>
          ` : type === 'finished_good' ? `
            <div style="display: grid; grid-template-columns: 1fr; gap: 8px; text-align: left;">
              <label style="font-size: 12px; font-weight: 600; display: block;">Manufactured Date (Tanggal Produksi)
                <input type="date" class="pf-manufactured-${index}" value="${new Date().toISOString().slice(0, 10)}" required style="width: 100%; padding: 6px; margin-top: 4px; border-radius: 4px; border: 1px solid var(--border-color, #ccc); box-sizing: border-box;" />
              </label>
            </div>
            <div style="margin-top: 8px; text-align: left;">
              <label style="font-size: 12px; font-weight: 600; display: block;">Catatan Produksi
                <input type="text" class="pf-note-${index}" value="Produksi preorder #${order.orderNumber}" required style="width: 100%; padding: 6px; margin-top: 4px; border-radius: 4px; border: 1px solid var(--border-color, #ccc); box-sizing: border-box;" />
              </label>
            </div>
          ` : `
            <div style="font-size: 13px; color: var(--text-color-muted, #666); line-height: 1.4;">
              Produk made-to-order (resep dapur). Pemotongan bahan baku otomatis dihitung dari resep saat pesanan dikirim ke dapur.
            </div>
          `}
        </div>
      </div>
    `;
  });

  dialog.innerHTML = `
    <header class="modal-header" style="text-align: left;">
      <div>
        <span class="hero-kicker">Preorder Fulfillment</span>
        <h3 id="pf-modal-title">Penuhi Preorder #${order.orderNumber}</h3>
        <p id="pf-modal-desc">Pelanggan: ${order.customerName || order.tableName || "Pelanggan POS"}</p>
      </div>
      <button class="icon-button" data-close-pf-modal type="button">x</button>
    </header>
    <form id="pf-modal-form" style="margin: 0;">
      <div class="modal-body" style="padding: 16px 24px; max-height: 400px; overflow-y: auto;">
        ${formsHtml}
      </div>
      <div class="form-feedback" id="pf-modal-feedback" style="padding: 0 24px 12px 24px; color: var(--color-danger, #e53935); font-size: 13px; font-weight: 500; text-align: left;"></div>
      <footer class="modal-actions" style="margin-top: 0; padding: 16px 24px; border-top: 1px solid var(--border-color, #eee); display: flex; justify-content: flex-end; gap: 8px;">
        <button class="ghost-button" data-close-pf-modal type="button">Batal</button>
        <button class="primary-button" id="pf-submit-btn" type="submit">Simpan & Penuhi</button>
      </footer>
    </form>
  `;

  const form = dialog.querySelector("#pf-modal-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const feedback = dialog.querySelector("#pf-modal-feedback");
    feedback.textContent = "";
    const submitBtn = dialog.querySelector("#pf-submit-btn");
    
    const transactions = [];
    let hasProductionOrRecipe = false;
    
    for (let i = 0; i < poItems.length; i++) {
      const item = poItems[i];
      const product = products.find(p => p.id === item.productId || String(p.id) === String(item.productId));
      const type = product ? product.inventory_type : 'made_to_order';
      
      if (type === "made_to_order") {
        hasProductionOrRecipe = true;
        continue;
      }
      
      const noteInput = dialog.querySelector(`.pf-note-${i}`);
      const payload = {
        qty: Number(item.qty),
        note: noteInput ? noteInput.value.trim() : `Fulfillment preorder #${order.orderNumber}`
      };
      
      if (type === "retail") {
        const costInput = dialog.querySelector(`.pf-cost-${i}`);
        const expiryInput = dialog.querySelector(`.pf-expiry-${i}`);
        payload.totalCost = Number(costInput ? costInput.value : 0);
        payload.expiredAt = expiryInput ? expiryInput.value : "";
        payload.manufacturedAt = new Date().toISOString().slice(0, 10);
      } else {
        hasProductionOrRecipe = true;
        const manufacturedInput = dialog.querySelector(`.pf-manufactured-${i}`);
        payload.manufacturedAt = manufacturedInput ? manufacturedInput.value : new Date().toISOString().slice(0, 10);
        payload.totalCost = 0;
      }
      
      transactions.push({
        productId: item.productId,
        payload
      });
    }
    
    const nextStatus = hasProductionOrRecipe ? "10" : "30";
    onSelect(transactions, nextStatus, submitBtn, feedback);
  });

  backdrop.hidden = false;
  dialog.hidden = false;
  document.body.classList.add("modal-open");
}

export function closePreorderFulfillmentModal() {
  const backdrop = document.querySelector("[data-preorder-fulfillment-backdrop]");
  if (backdrop) {
    backdrop.hidden = true;
    backdrop.querySelector("#preorder-fulfillment-modal").hidden = true;
    document.body.classList.remove("modal-open");
  }
}
