import { state } from "../order-state.js";
import {
  byId,
  optionalById,
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
import { canContinue, validationMessage } from "../order-navigation.js";

export function renderCustomerGate() {
  const content = optionalById("order-customer-content");
  const page = optionalById("order-customer-page");
  if (!content || !page) {
    syncSelectedMemberFields();
    return;
  }
  console.log("Rendering customer gate. Cart confirmed:", state.cartConfirmed, "Cart length:", state.cart.length);
  const visible = Boolean(state.cartConfirmed && state.cart.length);
  content.hidden = !visible;
  console.log("Customer gate visibility:", visible);
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
  console.log("Syncing selected member fields. Selected member ID:", state.selectedMemberId, "Selected:", selected);
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
  byId("order-payments").innerHTML = methods.length ? methods.map((method) => `
    <button class="${method.id === state.paymentMethodId ? "active" : ""}" data-payment-id="${method.id}" type="button">
      <strong>${escapeHtml(method.name)}</strong>
      <span>${method.type === "cash" ? "Bayar nanti di kasir" : method.qrisMode === "offline" ? "Konfirmasi outlet" : "Payment gateway"}</span>
    </button>
  `).join("") : `<div class="empty-state compact">Metode pembayaran belum aktif.</div>`;
  const method = paymentById(state.paymentMethodId);
  renderPaymentProofInput(method);
  byId("order-payment-note").textContent = method?.type === "cash"
    ? "Order akan dibuat dengan status unpaid dan dibayar di kasir."
    : paymentRequiresProof(method)
      ? "Upload bukti bayar agar kasir bisa cek sebelum approve pesanan."
      : "Order akan dibuat menunggu pembayaran sesuai konfigurasi outlet.";
}

export function paymentRequiresProof(method = paymentById(state.paymentMethodId)) {
  if (!method) return false;
  return method.type === "transfer" || (method.type === "qris" && method.qrisMode === "offline");
}

export function renderPaymentProofInput(method = paymentById(state.paymentMethodId)) {
  const panel = optionalById("order-payment-proof-panel");
  if (!panel) return;
  const required = paymentRequiresProof(method);
  panel.hidden = !required;
  optionalById("order-payment-proof-file")?.toggleAttribute("required", required);
  const nameLabel = optionalById("order-payment-proof-name");
  if (nameLabel) {
    nameLabel.textContent = state.paymentProof?.name || (required ? "Belum ada file dipilih." : "");
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
