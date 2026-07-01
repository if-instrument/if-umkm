import { apiGet, apiPost } from "../store.js?v=coffee-v150";
import { money } from "../format.js";

const reference = window.__PAYMENT_REFERENCE__ || new URLSearchParams(window.location.search).get("ref") || "";
const result = new URLSearchParams(window.location.search).get("result") || "";

function byId(id) {
  return document.getElementById(id);
}

let currentPayment = null;
let hostedPaymentUrl = "";

function setCustomerAction(enabled, message = "") {
  const button = byId("open-xendit-payment");
  if (button) button.disabled = !enabled;
  const feedback = byId("customer-card-feedback");
  if (feedback) feedback.textContent = message || (enabled ? "Membuka form pembayaran..." : "Form pembayaran belum tersedia.");
}

function renderError(message) {
  byId("customer-payment-title").textContent = "Pembayaran tidak ditemukan";
  byId("customer-payment-subtitle").textContent = message || "Link pembayaran tidak valid.";
  setCustomerAction(false, message || "Link pembayaran tidak valid.");
}

function renderPayment(data) {
  currentPayment = data;
  hostedPaymentUrl = data.hostedPaymentUrl || "";
  byId("customer-payment-title").textContent = data.outletName || data.companyName || "Online Card Payment";
  byId("customer-payment-subtitle").textContent = data.reference || reference;
  byId("customer-payment-order").textContent = data.orderNo || "-";
  byId("customer-payment-amount").textContent = money(Number(data.amount || 0));
  byId("customer-payment-status").textContent = String(data.status || "-").toUpperCase();
  byId("customer-payment-message").textContent = data.message || "Lanjutkan pembayaran menggunakan form kartu aman dari gateway.";
  if (data.status !== "pending") {
    setCustomerAction(false, `Pembayaran berstatus ${String(data.status || "-").toUpperCase()}.`);
    return;
  }
  if (data.hostedPaymentUrl) {
    setCustomerAction(true, `Mengarahkan ke form kartu aman ${data.provider || "gateway"}...`);
    window.setTimeout(() => {
      window.location.href = data.hostedPaymentUrl;
    }, 800);
    return;
  }
  setCustomerAction(false, data.message || "Hosted card page gateway belum tersedia. Cek log pembayaran dan secret key gateway.");
}

if (!reference) {
  renderError("Reference pembayaran kosong.");
} else {
  const response = result === "success"
    ? apiPost(`/api/public/card-payment/${encodeURIComponent(reference)}/sync`, { result })
    : apiGet(`/api/public/card-payment/${encodeURIComponent(reference)}`);
  if (!response?.ok) renderError(response?.message || "Link pembayaran tidak valid.");
  else renderPayment(response.data || {});
}

byId("open-xendit-payment")?.addEventListener("click", () => {
  const feedback = byId("customer-card-feedback");
  if (!currentPayment || currentPayment.status !== "pending") {
    feedback.textContent = "Payment tidak dalam status pending.";
    return;
  }
  if (!hostedPaymentUrl) {
    feedback.textContent = "Hosted card page gateway belum tersedia.";
    return;
  }
  feedback.textContent = "Membuka halaman aman gateway untuk input detail kartu...";
  window.location.href = hostedPaymentUrl;
});
