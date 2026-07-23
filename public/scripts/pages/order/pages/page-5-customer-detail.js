import { state } from "../order-state.js";
import {
  byId,
  optionalById,
  setText,
  escapeHtml,
  activePaymentMethods,
  paymentById,
  calculateTotals,
  resolveOutletId,
  resolveOutletNumericId,
  companySlug,
  requestJson,
  showFeedback,
  setBusy,
  persistOrderSession
} from "../order-utils.js";
import { canContinue, validationMessage, shouldHideCustomerPageOnMobile } from "../order-navigation.js";

export function renderCustomerGate() {
  const content = optionalById("order-customer-content");
  const page = optionalById("order-customer-page");
  if (!content || !page) {
    syncSelectedMemberFields();
    return;
  }
  const visible = Boolean(state.cartConfirmed && state.cart.length);
  content.hidden = !visible;
  page.hidden = false;
  page.classList.toggle("is-blank", !visible);
  syncSelectedMemberFields();
}

export function syncSelectedMemberFields() {
  const nameInput = optionalById("order-customer-name");
  const registerLine = optionalById("order-register-member-line");
  const registerInput = optionalById("order-register-member");
  const selectedPanel = optionalById("order-selected-member");
  if (!nameInput || !registerLine || !registerInput || !selectedPanel) return;

  const selected = Boolean(state.selectedMemberId);
  nameInput.readOnly = selected;
  nameInput.classList.toggle("is-readonly", selected);
  registerLine.hidden = selected;
  if (selected) registerInput.checked = false;
  selectedPanel.hidden = !selected;
}

let memberTimer = null;
export function lookupMember() {
  const name = byId("order-customer-name").value.trim();
  const outletId = resolveOutletNumericId() || resolveOutletId();
  if (name.length < 2 || !outletId) {
    byId("order-member-suggestions").hidden = true;
    return;
  }
  clearTimeout(memberTimer);
  memberTimer = setTimeout(async () => {
    try {
      const query = new URLSearchParams({ outlet_id: outletId, name });
      if (companySlug()) query.set("company", companySlug());
      const members = await requestJson(`/api/page/order/member?${query.toString()}`);
      renderMemberSuggestions(members);
    } catch {
      byId("order-member-suggestions").hidden = true;
    }
  }, 280);
}

export function renderMemberSuggestions(members) {
  const target = byId("order-member-suggestions");
  target.hidden = !members.length;
  target.innerHTML = members.map((member) => `
    <button data-member-fill="${escapeHtml(member.id)}" data-name="${escapeHtml(member.name)}" data-email="${escapeHtml(member.email)}" data-phone="${escapeHtml(member.phone)}" type="button">
      <strong>${escapeHtml(member.name)}</strong><span>${escapeHtml(member.email)}</span>
    </button>
  `).join("");
}

export function renderPayments() {
  const methods = activePaymentMethods();
  byId("order-payments").innerHTML = methods.length ? methods.map((method) => {
    const label = method.account || method.channelCode || method.gatewayProvider || "";
    return `
      <button class="${method.id === state.paymentMethodId ? "active" : ""}" data-payment-id="${method.id}" type="button">
        <strong>${escapeHtml(method.name)}</strong>
        ${label ? `<span>${escapeHtml(label)}</span>` : ""}
      </button>
    `;
  }).join("") : `<div class="empty-state compact">Metode pembayaran belum aktif.</div>`;
  const method = paymentById(state.paymentMethodId);
  renderPaymentProofInput(method);
  
  const isQris = Boolean(method && (method.type === "qris" || method.qrisImageUrl));
  const isGateway = Boolean(method && (method.paymentUrl || (method.type === "card" && method.gatewayProvider && method.gatewayProvider !== "manual")));
  const qrImage = method?.qrisImageUrl || method?.qrImage || "";
  const paymentUrl = method?.paymentUrl || method?.url || "";

  const previewBox = optionalById("order-payment-preview-box");
  const inlineQrFrame = optionalById("order-inline-qr-frame");
  const inlineQrImg = optionalById("order-inline-qr-image");
  const inlineUrlFrame = optionalById("order-inline-url-frame");
  const inlineUrlBtn = optionalById("order-inline-url-btn");

  if (previewBox) {
    let showBox = false;
    if (isQris && qrImage && inlineQrFrame && inlineQrImg) {
      inlineQrImg.src = qrImage;
      inlineQrFrame.hidden = false;
      showBox = true;

      const downloadBtn = optionalById("order-download-qr-btn");
      if (downloadBtn) {
        downloadBtn.href = qrImage;
        const cleanName = (method?.name || "QRIS").replace(/[^a-zA-Z0-9-_]/g, "_");
        downloadBtn.download = `QRIS-${cleanName}.png`;
      }
    } else if (inlineQrFrame) {
      inlineQrFrame.hidden = true;
    }

    if (isGateway && paymentUrl && inlineUrlFrame && inlineUrlBtn) {
      inlineUrlBtn.href = paymentUrl;
      inlineUrlFrame.hidden = false;
      showBox = true;
    } else if (inlineUrlFrame) {
      inlineUrlFrame.hidden = true;
    }

    previewBox.hidden = !showBox;
  }

  const noteLabel = method?.account || method?.name || "";
  byId("order-payment-note").textContent = noteLabel ? `Opsi: ${noteLabel}` : "";
}

export function openPaymentModal(method = paymentById(state.paymentMethodId)) {
  const modal = optionalById("order-payment-modal");
  if (!modal || !method) return;

  const isQris = method.type === "qris" || method.qrisImageUrl;
  const isCardOrGateway = method.type === "card" || method.paymentUrl;
  
  const title = isQris ? `Pembayaran QRIS - ${method.name}` : `Pembayaran ${method.name}`;
  const subtitle = isQris ? "Scan QR Code di bawah ini menggunakan M-Banking atau E-Wallet" : "Selesaikan pembayaran melalui halaman pembayaran gateway";

  const qrImage = method.qrisImageUrl || method.qrImage || (isQris ? "/assets/qris-placeholder.png" : "");
  const paymentUrl = method.paymentUrl || method.url || "";

  if (optionalById("order-payment-modal-title")) setText("order-payment-modal-title", title);
  if (optionalById("order-payment-modal-subtitle")) setText("order-payment-modal-subtitle", subtitle);

  const qrFrame = optionalById("order-payment-modal-qr-frame");
  const qrImg = optionalById("order-payment-modal-qr-image");
  if (qrFrame && qrImg) {
    if (qrImage) {
      qrImg.src = qrImage;
      qrFrame.hidden = false;
    } else {
      qrFrame.hidden = true;
    }
  }

  const urlFrame = optionalById("order-payment-modal-url-frame");
  const urlBtn = optionalById("order-payment-modal-url-btn");
  if (urlFrame && urlBtn) {
    if (paymentUrl) {
      urlBtn.href = paymentUrl;
      urlFrame.hidden = false;
    } else {
      urlFrame.hidden = true;
    }
  }

  const note = isQris
    ? "Scan QRIS menggunakan aplikasi M-Banking atau E-Wallet pilihan Anda (GoPay, OVO, Dana, ShopeePay, BCA, Mandiri, dll)."
    : "Buka link pembayaran di atas untuk menyelesaikan transaksi Anda secara aman.";
  if (optionalById("order-payment-modal-note")) setText("order-payment-modal-note", note);

  const modalProofPanel = optionalById("order-modal-payment-proof-panel");
  if (modalProofPanel) {
    const required = paymentRequiresProof(method);
    modalProofPanel.hidden = !required;
  }

  renderPaymentProofInput(method);
  modal.hidden = false;
}

export function closePaymentModal() {
  const modal = optionalById("order-payment-modal");
  if (modal) modal.hidden = true;
}

export function openImageLightbox(imageSrc, caption = "Preview Gambar") {
  const lightbox = optionalById("order-image-lightbox");
  const img = optionalById("order-lightbox-img");
  const cap = optionalById("order-lightbox-caption");
  if (!lightbox || !img || !imageSrc) return;
  img.src = imageSrc;
  if (cap) cap.textContent = caption;
  lightbox.hidden = false;
}

export function closeImageLightbox() {
  const lightbox = optionalById("order-image-lightbox");
  if (lightbox) lightbox.hidden = true;
}

export function paymentRequiresProof(method = paymentById(state.paymentMethodId)) {
  if (!method) return false;
  return method.type === "transfer" || (method.type === "qris" && method.qrisMode === "offline");
}

export function renderPaymentProofInput(method = paymentById(state.paymentMethodId)) {
  const panel = optionalById("order-payment-proof-panel");
  const modalPanel = optionalById("order-modal-payment-proof-panel");
  const required = paymentRequiresProof(method);
  
  if (panel) panel.hidden = !required;
  if (modalPanel) modalPanel.hidden = !required;
  
  optionalById("order-payment-proof-file")?.toggleAttribute("required", required);
  optionalById("order-modal-payment-proof-file")?.toggleAttribute("required", required);
  
  const text = state.paymentProof?.name ? `✓ ${state.paymentProof.name}` : (required ? "Belum ada file dipilih." : "");
  
  const nameLabel = optionalById("order-payment-proof-name");
  if (nameLabel) nameLabel.textContent = text;
  
  const modalNameLabel = optionalById("order-modal-payment-proof-name");
  if (modalNameLabel) modalNameLabel.textContent = text;

  const hasImage = Boolean(state.paymentProof?.dataUrl && state.paymentProof.dataUrl.startsWith("data:image/"));
  const proofFrame = optionalById("order-proof-preview-frame");
  const proofImg = optionalById("order-proof-preview-image");
  if (proofFrame && proofImg) {
    if (hasImage) {
      proofImg.src = state.paymentProof.dataUrl;
      proofFrame.hidden = false;
    } else {
      proofFrame.hidden = true;
    }
  }

  const modalProofFrame = optionalById("order-modal-proof-preview-frame");
  const modalProofImg = optionalById("order-modal-proof-preview-image");
  if (modalProofFrame && modalProofImg) {
    if (hasImage) {
      modalProofImg.src = state.paymentProof.dataUrl;
      modalProofFrame.hidden = false;
    } else {
      modalProofFrame.hidden = true;
    }
  }
}

export function readProofFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      reject(new Error("Ukuran bukti bayar maksimal 3 MB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: String(reader.result || "") });
    reader.onerror = () => reject(new Error("Bukti bayar gagal dibaca."));
    reader.readAsDataURL(file);
  });
}

export async function submitOrder() {
  const outletId = resolveOutletId();
  if (!canContinue("checkout")) {
    showFeedback(validationMessage(), true);
    return;
  }
  setBusy(true, "Memeriksa ketersediaan stok...");
  showFeedback("");
  try {
    const { refreshMenuStock } = await import("../order-render.js");
    await Promise.all([
      refreshMenuStock(),
      new Promise((resolve) => setTimeout(resolve, 500))
    ]);
    const { validateCartStock } = await import("./page-3-book-menu.js");
    const validation = validateCartStock();
    if (!validation.valid) {
      showFeedback(validation.reason, true);
      return;
    }
    setBusy(true, "Menyimpan order...");
    if (paymentRequiresProof() && !state.paymentProof?.dataUrl) {
      throw new Error("Upload bukti bayar terlebih dahulu.");
    }
    const outletNumericId = resolveOutletNumericId();
    const payload = {
      companySlug: companySlug(),
      outletId,
      outlet_id: outletNumericId || outletId,
      serviceType: state.serviceType,
      tableName: state.tableName,
      items: state.cart,
      customerName: byId("order-customer-name").value.trim(),
      customerEmail: byId("order-customer-email").value.trim().toLowerCase(),
      customerPhone: byId("order-customer-phone").value.trim(),
      customerMemberId: state.selectedMemberId || "",
      registerMember: state.selectedMemberId ? false : byId("order-register-member").checked,
      paymentMethodId: state.paymentMethodId,
      paymentProof: paymentRequiresProof() ? state.paymentProof : null
    };
    
    const result = await requestJson("/api/page/order/submit", { method: "POST", body: JSON.stringify(payload) });
    state.orderResult = result;
    state.orderStatus = "ORDER_CREATED";
    state.spread = "receipt";
    persistOrderSession();
    location.reload();
  } catch (error) {
    showFeedback(error.message, true);
  } finally {
    setBusy(false);
  }
}
