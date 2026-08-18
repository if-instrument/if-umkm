import { state, session, posState } from "./pos-state.js";
import { isPaymentPaid, isPaymentFailedFinal, qrImageUrl, looksLikeQrisPayload, activeOutletName, isAssignedPayLater } from "./pos-helpers.js";
import { apiPost, apiPut, apiGet, scopedPayload, scopedApiUrl } from "../../store.js";
import { statusLabel, isActiveStatus } from "../../status-codes.js";
import { money } from "../../format.js";
import { byId, showAlert } from "../../dom.js";

let checkoutHandler = null;
let settleTableHandler = null;
let approvePendingOrderHandler = null;
let renderBillDetailHandler = null;

export function setPaymentCallbacks({ checkout, settleTable, approvePendingOrder, renderBillDetail }) {
  if (checkout) checkoutHandler = checkout;
  if (settleTable) settleTableHandler = settleTable;
  if (approvePendingOrder) approvePendingOrderHandler = approvePendingOrder;
  if (renderBillDetail) renderBillDetailHandler = renderBillDetail;
}

export function activePaymentMethods() {
  return (state.settings.paymentMethods || [])
    .filter((method) => isActiveStatus(method.status))
    .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0) || a.name.localeCompare(b.name));
}

export function selectedPaymentMethod() {
  return activePaymentMethods().find((method) => method.name === posState.paymentMethod) || null;
}

export function selectedPaymentType() {
  return selectedPaymentMethod()?.type || "";
}

export function paymentFeeFor(baseAmount) {
  const method = selectedPaymentMethod();
  const rate = Number(method?.feeRate || 0);
  const payer = method?.feePayer || "merchant";
  const rateDecimal = rate / 100;
  const fee = baseAmount > 0 && rate > 0
    ? (payer === "customer" && rateDecimal < 1
      ? Math.round((baseAmount / (1 - rateDecimal)) - baseAmount)
      : Math.round(baseAmount * rateDecimal))
    : 0;
  return {
    amount: fee,
    payer,
    rate,
  };
}

export function isGatewayManual() {
  const provider = state.settings?.paymentGateway?.provider || "manual";
  return provider === "manual";
}

export function paymentGatewayLabel(provider) {
  return ({ xendit: "Xendit", midtrans: "Midtrans", manual: "Manual" })[provider] || "Gateway";
}

export function selectedPaymentGatewayLabel() {
  const method = selectedPaymentMethod();
  const gatewayManual = isGatewayManual();
  if (method?.type === "qris") {
    return (method.qrisMode === "offline" || gatewayManual) ? "QRIS Static / Manual" : `${paymentGatewayLabel(state.settings?.paymentGateway?.provider)} Online`;
  }
  if (method?.type === "card") {
    if (method.cardMode === "online" && !gatewayManual) return `${paymentGatewayLabel(state.settings?.paymentGateway?.provider)} Online`;
    return method.channelCode ? `EDC ${method.channelCode}` : "Manual EDC";
  }
  const labels = { xendit: "Xendit", midtrans: "Midtrans", manual: "Manual" };
  return labels[state.settings?.paymentGateway?.provider] || "Manual";
}

export function isCashPayment() {
  return selectedPaymentType() === "cash" || /^cash$/i.test(posState.paymentMethod || "");
}

export function isThirdPartyPayment() {
  return ["qris", "card"].includes(selectedPaymentType());
}

export function isQrisPayment() {
  return selectedPaymentType() === "qris";
}

export function isOfflineQrisPayment() {
  const method = selectedPaymentMethod();
  return method?.type === "qris" && (method.qrisMode === "offline" || isGatewayManual());
}

export function isCardPayment() {
  return selectedPaymentType() === "card";
}

export function setActivePaymentMethod(name) {
  posState.paymentMethod = name || activePaymentMethods()[0]?.name || "";
}

export function renderPaymentMethods() {
  const methods = activePaymentMethods();
  if (!methods.some((method) => method.name === posState.paymentMethod)) posState.paymentMethod = methods[0]?.name || "";
  byId("payment-methods").hidden = isAssignedPayLater(posState.serviceType);
  byId("payment-methods").innerHTML = methods.length
    ? methods.map((method) => `<button class="${method.name === posState.paymentMethod ? "active" : ""}" data-payment="${method.name}" type="button">${method.name}</button>`).join("")
    : `<button class="active" data-payment="" disabled type="button">Belum ada metode</button>`;
  renderPaymentPanel();
}

export function renderPaymentPanel(currentTotal = null) {
  const panel = byId("pos-payment-panel");
  if (!panel) return;
  const payableTotal = currentTotal ?? (Number(String(byId("cart-grand-total")?.textContent || "0").replace(/[^\d]/g, "")) || 0);
  const showPanel = !isAssignedPayLater(posState.serviceType) && !posState.editingOrderId && posState.cart.length > 0 && Boolean(posState.paymentMethod);
  panel.hidden = !showPanel;
  byId("cash-payment-fields").hidden = !showPanel || !isCashPayment();
  byId("third-party-payment").hidden = !showPanel || !isThirdPartyPayment();
  if (isCashPayment()) updateCashChange(payableTotal);
  if (posState.pendingPayment && (posState.pendingPayment.amount !== payableTotal || posState.pendingPayment.methodName !== posState.paymentMethod)) posState.pendingPayment = null;
  if (isThirdPartyPayment()) {
    byId("third-party-payment-label").textContent = `${selectedPaymentType() === "qris" ? (isOfflineQrisPayment() ? "QRIS Static" : "QRIS Dinamis") : "Card / EDC"} - ${selectedPaymentGatewayLabel()}`;
    byId("third-party-payment-status").textContent = posState.pendingPayment ? `${posState.pendingPayment.status.toUpperCase()} · ${posState.pendingPayment.reference}` : "Belum dibuat";
    byId("third-party-payment-note").textContent = posState.pendingPayment
      ? (posState.pendingPayment.qrPayload || posState.pendingPayment.cardActionMessage || posState.pendingPayment.edcInstruction || "Konfirmasi setelah provider menyatakan pembayaran sukses.")
      : "Payment request dibuat saat checkout, lalu kasir konfirmasi setelah sukses.";
    if (!posState.editingOrderId && !isAssignedPayLater(posState.serviceType)) byId("checkout").textContent = posState.pendingPayment ? "Konfirmasi Pembayaran & Simpan" : `Buat ${selectedPaymentType() === "qris" ? (isOfflineQrisPayment() ? "Pembayaran QRIS" : "QRIS") : "Request Card"}`;
  }
}

export function updateCashChange(currentTotal = null) {
  const total = currentTotal ?? (Number(String(byId("cart-grand-total")?.textContent || "0").replace(/[^\d]/g, "")) || 0);
  const tendered = Number(byId("cash-tendered")?.value || 0);
  byId("cash-change").textContent = money(Math.max(tendered - total, 0));
}

export function qrisModalData(payment = posState.pendingPayment) {
  if (!payment) return null;
  const staticQris = payment.qrisMode === "offline" || payment.provider === "manual_qris" || isGatewayManual();
  const providerQrImage = payment.provider === "midtrans" && /^https?:\/\//i.test(payment.qrPayload || "");
  const valid = providerQrImage || (typeof payment.qrPayloadValid === "boolean" ? payment.qrPayloadValid : looksLikeQrisPayload(payment.qrPayload));
  const mode = payment.paymentGatewayMode || state.settings?.paymentGateway?.mode || "sandbox";
  return {
    outlet: activeOutletName(),
    orderNo: payment.orderNo || "POS",
    reference: payment.reference || "-",
    amount: Number(payment.amount || 0),
    qrPayload: payment.qrPayload,
    qrPayloadValid: staticQris ? Boolean(payment.qrisImageUrl) : valid,
    staticQris,
    sandboxSimulatable: payment.provider === "xendit" && payment.status === "pending" && (mode !== "live" || !valid),
    qrMessage: staticQris ? "Gambar QRIS Static outlet belum tersedia." : (payment.qrPayloadMessage || (valid ? "Payload QRIS valid dan siap discan." : "Xendit sandbox mengirim payload testing yang tidak bisa discan aplikasi pembayaran.")),
    qrImage: staticQris ? (payment.qrisImageUrl || "") : (providerQrImage ? payment.qrPayload : (valid ? qrImageUrl(payment.qrPayload, 360) : ""))
  };
}

export function openQrisPaymentModal(payment = posState.pendingPayment) {
  const data = qrisModalData(payment);
  if (!data) return;
  byId("qris-payment-outlet").textContent = data.outlet;
  byId("qris-payment-order").textContent = `#${data.orderNo}`;
  byId("qris-payment-amount").textContent = money(data.amount);
  byId("qris-payment-reference").textContent = data.reference;
  const frame = document.querySelector(".qris-code-frame");
  frame.classList.toggle("invalid", !data.qrPayloadValid);
  byId("qris-payment-image").hidden = !data.qrPayloadValid;
  byId("qris-payment-placeholder").hidden = data.qrPayloadValid;
  byId("qris-payment-image").src = data.qrImage || "";
  byId("qris-payment-image").dataset.qrPayload = data.qrPayload || "";
  byId("qris-payment-note").textContent = data.staticQris
    ? "Minta pelanggan scan QRIS Static outlet. Setelah bukti pembayaran diterima, konfirmasi secara manual."
    : data.qrPayloadValid
    ? "Minta pelanggan scan QRIS ini. Sistem mengecek status pembayaran otomatis setiap 1 menit."
    : `${data.qrMessage} Reference: ${data.reference}. Sistem mengecek status otomatis setiap 1 menit.`;
  const simulateButton = document.querySelector("[data-simulate-qris-payment]");
  if (simulateButton) simulateButton.hidden = !data.sandboxSimulatable;
  const confirmButton = document.querySelector("[data-confirm-static-qris-payment]");
  const continueButton = document.querySelector("[data-close-qris-payment].primary-button");
  if (confirmButton) confirmButton.hidden = !data.staticQris;
  if (continueButton) continueButton.hidden = data.staticQris;
  document.querySelector("[data-qris-payment-backdrop]").hidden = false;
  byId("qris-payment-modal").hidden = false;
  document.body.classList.add("modal-open");
  if (!data.staticQris) startPaymentStatusPolling("qris");
}

export function closeQrisPaymentModal() {
  document.querySelector("[data-qris-payment-backdrop]").hidden = true;
  byId("qris-payment-modal").hidden = true;
  document.body.classList.remove("modal-open");
  stopPaymentStatusPolling();
}

export function openCardPaymentModal(payment = posState.pendingPayment) {
  if (!payment) return;
  const actionUrl = payment.cardActionUrl || "";
  const mode = payment.paymentGatewayMode || state.settings?.paymentGateway?.mode || "sandbox";
  const hasCustomerPage = Boolean(actionUrl);
  byId("card-payment-outlet").textContent = activeOutletName();
  byId("card-payment-order").textContent = `#${payment.orderNo || "POS"}`;
  byId("card-payment-amount").textContent = money(Number(payment.amount || 0));
  byId("card-payment-reference").textContent = payment.reference || "-";
  byId("card-payment-subtitle").textContent = hasCustomerPage
    ? "Minta customer scan QR untuk membuka halaman pembayaran kartu online."
    : "Gunakan mesin EDC fisik sesuai bank acquirer yang dipilih.";
  byId("card-payment-note").textContent = payment.cardActionMessage || payment.edcInstruction || (hasCustomerPage
    ? "Setelah customer menyelesaikan pembayaran kartu, sistem mengecek status otomatis setiap 1 menit."
    : "Proses kartu pada mesin EDC, lalu konfirmasi setelah transaksi approved.");
  const qrFrame = byId("card-payment-qr-frame");
  const qrImage = byId("card-payment-qr");
  const offlinePanel = byId("card-payment-offline-panel");
  qrFrame.hidden = !hasCustomerPage;
  offlinePanel.hidden = hasCustomerPage;
  if (hasCustomerPage) {
    qrImage.src = qrImageUrl(actionUrl, 360);
    qrImage.dataset.qrPayload = actionUrl;
  } else {
    qrImage.src = "";
    qrImage.dataset.qrPayload = "";
    byId("card-payment-offline-label").textContent = payment.edcInstruction || "Approval menggunakan mesin EDC offline.";
  }
  const openButton = byId("open-card-payment-link");
  openButton.hidden = !hasCustomerPage;
  openButton.dataset.cardActionUrl = actionUrl;
  const printButton = byId("print-card-payment-qr");
  if (printButton) printButton.hidden = !hasCustomerPage;
  const simulateButton = document.querySelector("[data-simulate-card-payment]");
  if (simulateButton) simulateButton.hidden = !(payment.provider === "xendit" && payment.status === "pending" && mode !== "live");
  document.querySelector("[data-card-payment-backdrop]").hidden = false;
  byId("card-payment-modal").hidden = false;
  document.body.classList.add("modal-open");
  startPaymentStatusPolling("card");
}

export function closeCardPaymentModal() {
  document.querySelector("[data-card-payment-backdrop]").hidden = true;
  byId("card-payment-modal").hidden = true;
  document.body.classList.remove("modal-open");
  stopPaymentStatusPolling();
}

export function openCardPaymentLink() {
  const url = byId("open-card-payment-link")?.dataset.cardActionUrl || posState.pendingPayment?.cardActionUrl || "";
  if (!url) {
    byId("checkout-note").textContent = "Link approval kartu belum tersedia dari gateway.";
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function cardModalData(payment = posState.pendingPayment) {
  const actionUrl = payment?.cardActionUrl || "";
  if (!payment || !actionUrl) return null;
  return {
    outlet: activeOutletName(),
    orderNo: payment.orderNo || "POS",
    reference: payment.reference || "-",
    amount: Number(payment.amount || 0),
    actionUrl,
    qrImage: qrImageUrl(actionUrl, 360)
  };
}

export function printCardPaymentQr() {
  const data = cardModalData();
  if (!data) {
    byId("checkout-note").textContent = "QR pembayaran kartu belum tersedia.";
    return;
  }
  const printWindow = window.open("", "_blank", "width=420,height=620");
  if (!printWindow) {
    byId("checkout-note").textContent = "Popup print diblokir browser. Izinkan popup untuk mencetak QR kartu.";
    return;
  }
  printWindow.document.write(`
    <!doctype html>
    <html lang="id">
      <head>
        <meta charset="UTF-8" />
        <title>Print Card Payment ${data.orderNo}</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 18px; font-family: Arial, sans-serif; color: #21170f; }
          .receipt { width: 320px; margin: 0 auto; text-align: center; }
          h1 { margin: 0 0 4px; font-size: 18px; }
          .order { margin: 0 0 14px; color: #6f5c4d; font-size: 12px; font-weight: 700; }
          img { width: 280px; height: 280px; object-fit: contain; border: 1px solid #ddd; padding: 10px; }
          .amount { margin: 14px 0 4px; font-size: 22px; font-weight: 800; }
          .ref, .url { color: #6f5c4d; font-size: 11px; overflow-wrap: anywhere; }
          .note { margin-top: 14px; font-size: 11px; line-height: 1.4; }
          @media print { body { padding: 0; } .receipt { width: 100%; } }
        </style>
      </head>
      <body>
        <section class="receipt">
          <h1>${data.outlet}</h1>
          <p class="order">#${data.orderNo}</p>
          <img src="${data.qrImage}" alt="QR Card Payment" />
          <div class="amount">${money(data.amount)}</div>
          <div class="ref">${data.reference}</div>
          <p class="note">Scan QR ini dari HP customer untuk membuka pembayaran kartu online.</p>
          <div class="url">${data.actionUrl}</div>
        </section>
        <script>
          window.addEventListener("load", () => {
            window.print();
            setTimeout(() => window.close(), 500);
          });
        <\/script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

export function printQrisPayment() {
  const data = qrisModalData();
  if (!data) return;
  const printWindow = window.open("", "_blank", "width=420,height=620");
  if (!printWindow) {
    byId("checkout-note").textContent = "Popup print diblokir browser. Izinkan popup untuk mencetak QRIS.";
    return;
  }
  printWindow.document.write(`
    <!doctype html>
    <html lang="id">
      <head>
        <meta charset="UTF-8" />
        <title>Print QRIS ${data.orderNo}</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 18px; font-family: Arial, sans-serif; color: #21170f; }
          .receipt { width: 320px; margin: 0 auto; text-align: center; }
          h1 { margin: 0 0 4px; font-size: 18px; }
          .order { margin: 0 0 14px; color: #6f5c4d; font-size: 12px; font-weight: 700; }
          img { width: 280px; height: 280px; object-fit: contain; border: 1px solid #ddd; padding: 10px; }
          .placeholder { display: grid; place-items: center; width: 280px; height: 280px; margin: 0 auto; padding: 16px; border: 1px dashed #c2410c; color: #9a3412; font-size: 13px; font-weight: 800; line-height: 1.4; }
          .amount { margin: 14px 0 4px; font-size: 22px; font-weight: 800; }
          .ref { color: #6f5c4d; font-size: 11px; overflow-wrap: anywhere; }
          .note { margin-top: 14px; font-size: 11px; line-height: 1.4; }
          @media print { body { padding: 0; } .receipt { width: 100%; } }
        </style>
      </head>
      <body>
        <section class="receipt">
          <h1>${data.outlet}</h1>
          <p class="order">#${data.orderNo}</p>
          ${data.qrPayloadValid ? `<img src="${data.qrImage}" alt="QRIS" />` : `<div class="placeholder">${data.qrMessage}</div>`}
          <div class="amount">${money(data.amount)}</div>
          <div class="ref">${data.reference}</div>
          <p class="note">Scan QRIS ini untuk pembayaran. Tunjukkan bukti sukses ke kasir.</p>
        </section>
        <script>
          window.addEventListener("load", () => {
            window.print();
            setTimeout(() => window.close(), 500);
          });
        <\/script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

export function createPaymentRequest(amount, orderNumber, paymentFee = { amount: 0, payer: "merchant" }) {
  const method = selectedPaymentMethod();
  if (!method) throw new Error("Metode bayar tidak ditemukan.");
  const response = apiPost("/api/payment-transaction", scopedPayload({
    orderNumber,
    paymentMethodId: method.id,
    amount,
    paymentFeeAmount: Number(paymentFee.amount || 0),
    paymentFeePayer: paymentFee.payer || "merchant"
  }, state, session));
  if (!response?.ok) throw new Error(response?.message || "Payment request belum berhasil dibuat.");
  posState.pendingPayment = { ...response.data, amount, methodName: method.name };
  if (posState.paymentIntentContext?.source === "bill") posState.pendingPayment.contextOrderId = posState.paymentIntentContext.orderId;
  if (isPaymentFailedFinal(posState.pendingPayment.status)) {
    throw new Error(posState.pendingPayment.errorMessage || `Payment ${posState.pendingPayment.status}. Periksa konfigurasi ${selectedPaymentGatewayLabel()}.`);
  }
  if (isQrisPayment()) openQrisPaymentModal(posState.pendingPayment);
  if (isCardPayment()) openCardPaymentModal(posState.pendingPayment);
  return posState.pendingPayment;
}

export function confirmPendingPayment() {
  if (!posState.pendingPayment?.id) throw new Error("Payment request belum dibuat.");
  const response = apiPut(`/api/payment-transaction/${posState.pendingPayment.id}/confirm`, scopedPayload({}, state, session));
  if (!response?.ok) throw new Error(response?.message || "Payment belum berhasil dikonfirmasi.");
  posState.pendingPayment = { ...response.data, amount: posState.pendingPayment.amount, methodName: posState.pendingPayment.methodName, contextOrderId: posState.pendingPayment.contextOrderId };
  return posState.pendingPayment;
}

export function refreshPendingPaymentStatus() {
  if (!posState.pendingPayment?.id) return posState.pendingPayment;
  if (["xendit", "midtrans"].includes(posState.pendingPayment.provider) && (posState.pendingPayment.methodType || selectedPaymentType()) === "card" && posState.pendingPayment.reference) {
    apiPost(`/api/public/card-payment/${encodeURIComponent(posState.pendingPayment.reference)}/sync`, { source: "pos_polling" });
  }
  const response = apiGet(scopedApiUrl(`/api/payment-transaction/${posState.pendingPayment.id}`, state, session));
  if (response?.ok) {
    posState.pendingPayment = {
      ...posState.pendingPayment,
      ...response.data,
      amount: posState.pendingPayment.amount,
      methodName: posState.pendingPayment.methodName,
      contextOrderId: posState.pendingPayment.contextOrderId
    };
    if (posState.paymentIntentContext?.source === "bill") {
      const order = state.transactions.find((item) => item.id === posState.paymentIntentContext.orderId);
      if (order && !byId("bill-detail-modal").hidden && renderBillDetailHandler) {
        renderBillDetailHandler(order, true, posState.paymentIntentContext.mode);
      }
    } else {
      renderPaymentPanel(posState.pendingPayment.amount);
    }
  }
  return posState.pendingPayment;
}

export function isAnyPaymentModalOpen() {
  return !byId("qris-payment-modal")?.hidden || !byId("card-payment-modal")?.hidden;
}

export function stopPaymentStatusPolling() {
  if (posState.paymentPollTimer) window.clearInterval(posState.paymentPollTimer);
  posState.paymentPollTimer = null;
}

export function startPaymentStatusPolling(type = selectedPaymentType()) {
  stopPaymentStatusPolling();
  if (!posState.pendingPayment?.id || isPaymentPaid(posState.pendingPayment.status)) return;
  const poll = () => pollPendingPaymentStatus(type);
  window.setTimeout(poll, 3000);
  posState.paymentPollTimer = window.setInterval(poll, 60000);
}

export function pollPendingPaymentStatus(type = selectedPaymentType()) {
  if (!posState.pendingPayment?.id || posState.autoCheckoutInProgress || !isAnyPaymentModalOpen()) return;
  const previousStatus = posState.pendingPayment.status;
  refreshPendingPaymentStatus();
  if (!posState.pendingPayment?.id) return;
  if (isPaymentPaid(posState.pendingPayment.status)) {
    posState.autoCheckoutInProgress = true;
    stopPaymentStatusPolling();
    closeQrisPaymentModal();
    closeCardPaymentModal();
    if (posState.paymentIntentContext?.source === "bill") {
      if (posState.paymentIntentContext.mode === "approve" && approvePendingOrderHandler) {
        approvePendingOrderHandler(posState.paymentIntentContext.orderId, posState.paymentMethod);
      } else if (settleTableHandler) {
        settleTableHandler(posState.paymentIntentContext.orderId, posState.paymentMethod);
      }
      posState.autoCheckoutInProgress = false;
      return;
    }
    renderPaymentPanel(posState.pendingPayment.amount);
    byId("checkout-note").textContent = "Pembayaran sukses. Pesanan sedang disimpan otomatis...";
    const cartCountBeforeCheckout = posState.cart.length;
    const saved = checkoutHandler ? checkoutHandler() : false;
    posState.autoCheckoutInProgress = false;
    if (saved && cartCountBeforeCheckout > 0 && posState.cart.length === 0) {
      showAlert("Pembayaran sukses dan pesanan otomatis masuk ke antrian.");
    } else if (!saved && cartCountBeforeCheckout > 0) {
      showAlert(byId("checkout-note").textContent || "Pembayaran sukses, tetapi pesanan belum berhasil dibuat.", "error");
    }
    return;
  }
  if (isPaymentFailedFinal(posState.pendingPayment.status)) {
    stopPaymentStatusPolling();
    const message = `Payment ${posState.pendingPayment.status}. Buat payment request baru.`;
    if (type === "qris") byId("qris-payment-note").textContent = message;
    if (type === "card") byId("card-payment-note").textContent = message;
    byId("checkout-note").textContent = message;
    showAlert(message, "error");
    return;
  }
  if (posState.pendingPayment.status !== previousStatus) {
    if (posState.paymentIntentContext?.source === "bill") {
      const order = state.transactions.find((item) => item.id === posState.paymentIntentContext.orderId);
      if (order && !byId("bill-detail-modal").hidden && renderBillDetailHandler) {
        renderBillDetailHandler(order, true, posState.paymentIntentContext.mode);
      }
    } else {
      renderPaymentPanel(posState.pendingPayment.amount);
    }
  }
}

export function simulatedXenditWebhookPayload() {
  const now = new Date().toISOString();
  const numericId = String(posState.pendingPayment?.id || "paytxn-0").replace(/\D/g, "") || Date.now();
  return {
    event: "payment.capture",
    created: now,
    data: {
      payment_id: `py-sim-${numericId}-${Date.now()}`,
      payment_request_id: posState.pendingPayment.reference,
      reference_id: posState.pendingPayment.reference,
      type: "PAY",
      country: "ID",
      currency: "IDR",
      request_amount: Number(posState.pendingPayment.amount || 0),
      capture_method: "AUTOMATIC",
      channel_code: isCardPayment() ? "CARDS" : "QRIS",
      status: "SUCCEEDED",
      captures: [{
        capture_id: `cap-sim-${numericId}-${Date.now()}`,
        capture_amount: Number(posState.pendingPayment.amount || 0),
        capture_timestamp: now
      }],
      metadata: {
        simulation: true,
        source: "if_instrument_pos_sandbox"
      }
    }
  };
}

export function simulatePendingPayment() {
  if (!posState.pendingPayment?.id) {
    byId("checkout-note").textContent = "Payment request belum dibuat.";
    return;
  }
  const webhook = apiPost("/api/webhook/xendit", simulatedXenditWebhookPayload());
  if (!webhook?.ok) {
    byId("checkout-note").textContent = webhook?.message || "Webhook simulasi Xendit belum berhasil.";
    return;
  }
  posState.pendingPayment = { ...webhook.data, amount: posState.pendingPayment.amount, methodName: posState.pendingPayment.methodName, contextOrderId: posState.pendingPayment.contextOrderId };
  closeQrisPaymentModal();
  closeCardPaymentModal();
  if (posState.paymentIntentContext?.source === "bill") {
    const billOrder = state.transactions.find((order) => order.id === posState.paymentIntentContext.orderId);
    if (billOrder && renderBillDetailHandler) renderBillDetailHandler(billOrder, true, posState.paymentIntentContext.mode);
    if (posState.paymentIntentContext.mode === "approve" && approvePendingOrderHandler) {
      approvePendingOrderHandler(posState.paymentIntentContext.orderId, posState.paymentMethod);
    } else if (settleTableHandler) {
      settleTableHandler(posState.paymentIntentContext.orderId, posState.paymentMethod);
    }
    return;
  }
  renderPaymentPanel(posState.pendingPayment.amount);
  byId("checkout-note").textContent = "Simulasi Xendit berhasil: payment dianggap terbayar. Menyimpan pesanan...";
  const cartCountBeforeCheckout = posState.cart.length;
  const saved = checkoutHandler ? checkoutHandler() : false;
  if (saved && cartCountBeforeCheckout > 0 && posState.cart.length === 0) {
    showAlert("Pembayaran sukses dan pesanan berhasil dibuat.");
  } else if (!saved && cartCountBeforeCheckout > 0) {
    showAlert(byId("checkout-note").textContent || "Pembayaran sukses, tetapi pesanan belum berhasil dibuat.", "error");
  }
}

export function confirmStaticQrisPayment() {
  if (!posState.pendingPayment?.id || !isOfflineQrisPayment()) return;
  try {
    const paid = confirmPendingPayment();
    if (!isPaymentPaid(paid.status)) throw new Error("Pembayaran QRIS belum berhasil dikonfirmasi.");
    closeQrisPaymentModal();
    if (posState.paymentIntentContext?.source === "bill") {
      const billOrder = state.transactions.find((order) => order.id === posState.paymentIntentContext.orderId);
      if (billOrder && renderBillDetailHandler) renderBillDetailHandler(billOrder, true, posState.paymentIntentContext.mode);
      if (posState.paymentIntentContext.mode === "approve" && approvePendingOrderHandler) {
        approvePendingOrderHandler(posState.paymentIntentContext.orderId, posState.paymentMethod);
      } else if (settleTableHandler) {
        settleTableHandler(posState.paymentIntentContext.orderId, posState.paymentMethod);
      }
      return;
    }
    renderPaymentPanel(paid.amount);
    byId("checkout-note").textContent = "Pembayaran QRIS dikonfirmasi. Menyimpan pesanan...";
    const cartCountBeforeCheckout = posState.cart.length;
    const saved = checkoutHandler ? checkoutHandler() : false;
    if (saved && cartCountBeforeCheckout > 0 && posState.cart.length === 0) {
      showAlert("Pembayaran QRIS dikonfirmasi dan pesanan masuk ke antrian.");
    } else if (!saved) {
      showAlert(byId("checkout-note").textContent || "Pesanan belum berhasil disimpan.", "error");
    }
  } catch (error) {
    byId("checkout-note").textContent = error.message;
    showAlert(error.message, "error");
  }
}

export function paymentMetaForCheckout(total, orderNumber, paymentFee = { amount: 0, payer: "merchant" }) {
  posState.paymentIntentContext = { source: "checkout" };
  if (isCashPayment()) {
    const tendered = Number(byId("cash-tendered").value || 0);
    if (tendered < total) throw new Error("Nominal bayar cash belum cukup.");
    return {
      cashTendered: tendered,
      changeDue: tendered - total,
      provider: "cashier",
      reference: `CASH-${orderNumber}`,
    };
  }
  if (isThirdPartyPayment()) {
    if (!posState.pendingPayment) {
      createPaymentRequest(total, orderNumber, paymentFee);
      throw new Error(`${selectedPaymentType() === "qris" ? "QRIS dinamis" : "Request kartu"} dibuat. Konfirmasi setelah pembayaran sukses.`);
    }
    refreshPendingPaymentStatus();
    if (isQrisPayment() && posState.pendingPayment.qrPayload && !isPaymentPaid(posState.pendingPayment.status)) openQrisPaymentModal(posState.pendingPayment);
    if (isCardPayment() && !isPaymentPaid(posState.pendingPayment.status)) openCardPaymentModal(posState.pendingPayment);
    if (isPaymentFailedFinal(posState.pendingPayment.status)) {
      throw new Error(`Payment ${posState.pendingPayment.status}. Buat payment request baru.`);
    }
    if (["xendit", "midtrans"].includes(posState.pendingPayment.provider) && !isPaymentPaid(posState.pendingPayment.status)) {
      throw new Error(`Menunggu status pembayaran sukses dari ${paymentGatewayLabel(posState.pendingPayment.provider)}.`);
    }
    const paid = isPaymentPaid(posState.pendingPayment.status) ? posState.pendingPayment : confirmPendingPayment();
    if (!isPaymentPaid(paid.status)) throw new Error("Payment belum sukses.");
    return {
      provider: paid.provider,
      reference: paid.reference,
      transactionId: paid.id,
    };
  }
  return { provider: "offline", reference: `${posState.paymentMethod}-${orderNumber}` };
}
