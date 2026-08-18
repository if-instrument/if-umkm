import { state, session } from "./settings-state.js";
import {
  sortedPaymentMethods,
  isSuperAdminUser,
  paymentTypeLabel,
  paymentGatewayLabel,
  cardModeLabel,
  qrisModeLabel,
  edcConnectorLabel,
  feePayerLabel,
  statusPill
} from "./settings-helpers.js";
import { postSetting, putSetting } from "./settings-api.js";
import { byId, setText, showAlert, showFeedback } from "../../dom.js";
import { formatQty, money } from "../../format.js";
import { COMMON_STATUS, CONNECTOR_STATUS, isActiveStatus } from "../../status-codes.js";
import { canUsePermission } from "../../store.js";

let renderSettingsHandler = null;
let openModalHandler = null;
let closeModalHandler = null;

export function setPaymentCallbacks({ renderSettings, openModal, closeModal }) {
  if (renderSettings) renderSettingsHandler = renderSettings;
  if (openModal) openModalHandler = openModal;
  if (closeModal) closeModalHandler = closeModal;
}

export function setQrisImage(url = "") {
  if (byId("payment-qris-image-url")) byId("payment-qris-image-url").value = url;
  if (byId("payment-qris-image-preview")) {
    byId("payment-qris-image-preview").innerHTML = url ? `<img src="${url}" alt="Preview QRIS Static" />` : "Belum ada QRIS";
  }
}

export function renderPaymentMethods() {
  const methods = sortedPaymentMethods();
  const table = byId("payment-method-table");
  if (!table) return;

  table.innerHTML = methods.length ? methods.map((method) => `
    <tr>
      <td>${method.sort || "-"}</td>
      <td><strong>${method.name}</strong><br><small style="color:#4f46e5; font-weight:600;">${(method.isAvailablePos ?? true) && (method.isAvailableOnline ?? true) ? "POS & Online" : (method.isAvailablePos ?? true) ? "Hanya POS" : (method.isAvailableOnline ?? true) ? "Hanya Online" : "Non-aktif Kanal"}</small></td>
      <td>${paymentTypeLabel(method.type)}</td>
      <td>${method.channelCode || "-"}${method.terminalId ? `<br><small>${method.terminalId}</small>` : ""}${cardModeLabel(method) ? `<br><small>${cardModeLabel(method)}</small>` : ""}${qrisModeLabel(method) ? `<br><small>${qrisModeLabel(method)}</small>` : ""}${edcConnectorLabel(method) ? `<br><small>${edcConnectorLabel(method)}</small>` : ""}</td>
      <td>${formatQty(Number(method.feeRate || 0))}%<br><small>${feePayerLabel(method)}</small></td>
      <td>${method.account || "-"}</td>
      <td>${statusPill(method.status)}</td>
      <td><div class="row-actions"><button class="ghost-button compact-button" data-edit-payment-method="${method.id}" data-permission="settings.payment:update" type="button">Edit</button><button class="ghost-button compact-button" data-delete-payment-method="${method.id}" data-permission="settings.payment:delete" type="button">${isActiveStatus(method.status) ? "Nonaktifkan" : "Aktifkan"}</button></div>${method.isDefault ? `<small>Default outlet</small>` : ""}</td>
    </tr>
  `).join("") : `<tr><td colspan="8">Belum ada metode bayar.</td></tr>`;
}

export function renderPaymentGateway() {
  const isSuperAdmin = isSuperAdminUser();
  if (byId("central-master-gateway-panel")) {
    byId("central-master-gateway-panel").hidden = !isSuperAdmin;
  }

  const gateway = state.settings?.paymentGateway || {};
  const master = gateway.centralMasterGateway || {};
  const xenditMaster = master.xendit || { status: "active", qrisRate: 0.7, cardRate: 2.0, vaFee: 4500, ewalletRate: 1.5 };
  const midtransMaster = master.midtrans || { status: "active", qrisRate: 0.7, cardRate: 1.9, vaFee: 4000, ewalletRate: 1.7 };
  
  if (byId("central-xendit-status")) byId("central-xendit-status").checked = xenditMaster.status === "active";
  if (byId("central-xendit-secret")) byId("central-xendit-secret").value = xenditMaster.apiKey || "";
  if (byId("central-xendit-qris-rate")) byId("central-xendit-qris-rate").value = xenditMaster.qrisRate;
  if (byId("central-xendit-card-rate")) byId("central-xendit-card-rate").value = xenditMaster.cardRate;
  if (byId("central-xendit-va-fee")) byId("central-xendit-va-fee").value = xenditMaster.vaFee;
  if (byId("central-xendit-ewallet-rate")) byId("central-xendit-ewallet-rate").value = xenditMaster.ewalletRate;

  if (byId("central-midtrans-status")) byId("central-midtrans-status").checked = midtransMaster.status === "active";
  if (byId("central-midtrans-server-key")) byId("central-midtrans-server-key").value = midtransMaster.apiKey || "";
  if (byId("central-midtrans-qris-rate")) byId("central-midtrans-qris-rate").value = midtransMaster.qrisRate;
  if (byId("central-midtrans-card-rate")) byId("central-midtrans-card-rate").value = midtransMaster.cardRate;
  if (byId("central-midtrans-va-fee")) byId("central-midtrans-va-fee").value = midtransMaster.vaFee;
  if (byId("central-midtrans-ewallet-rate")) byId("central-midtrans-ewallet-rate").value = midtransMaster.ewalletRate;

  const activeProviders = gateway.centralActiveProviders || ["manual", "central_xendit", "central_midtrans", "direct_xendit", "direct_midtrans"];
  const providerSelect = byId("payment-gateway-provider");
  if (providerSelect) {
    const centralXenditOpt = providerSelect.querySelector('option[value="central_xendit"]');
    const centralMidtransOpt = providerSelect.querySelector('option[value="central_midtrans"]');
    if (centralXenditOpt) {
      const isOk = activeProviders.includes("central_xendit");
      centralXenditOpt.disabled = !isOk;
      centralXenditOpt.textContent = isOk ? "Xendit (Gateway Pusat)" : "Xendit (Belum diaktifkan Pusat)";
    }
    if (centralMidtransOpt) {
      const isOk = activeProviders.includes("central_midtrans");
      centralMidtransOpt.disabled = !isOk;
      centralMidtransOpt.textContent = isOk ? "Midtrans (Gateway Pusat)" : "Midtrans (Belum diaktifkan Pusat)";
    }
  }

  if (byId("payment-gateway-provider")) byId("payment-gateway-provider").value = gateway.provider || "manual";
  if (byId("payment-gateway-mode")) byId("payment-gateway-mode").value = gateway.mode || "sandbox";
  if (byId("payment-gateway-timeout")) byId("payment-gateway-timeout").value = gateway.timeout || 15;
  if (byId("payment-gateway-xendit-secret")) byId("payment-gateway-xendit-secret").value = "";
  if (byId("payment-gateway-midtrans-secret")) byId("payment-gateway-midtrans-secret").value = "";
  const xendit = gateway.xenditSecretSet ? "Xendit key tersimpan" : "Xendit key belum diset";
  const midtrans = gateway.midtransServerKeySet ? "Midtrans key tersimpan" : "Midtrans key belum diset";
  setText("payment-gateway-status", `${paymentGatewayLabel(gateway.provider || "manual")} aktif. ${xendit}. ${midtrans}.`);
  syncGatewayFields();
}

export function syncGatewayFields() {
  const provider = byId("payment-gateway-provider")?.value || "manual";
  const isGateway = provider !== "manual";
  const isCentral = provider === "central_xendit" || provider === "central_midtrans";
  const isDirectXendit = provider === "direct_xendit";
  const isDirectMidtrans = provider === "direct_midtrans";

  if (byId("payment-gateway-mode-field")) byId("payment-gateway-mode-field").hidden = !isGateway;
  if (byId("payment-gateway-timeout-field")) byId("payment-gateway-timeout-field").hidden = !isGateway;
  if (byId("payment-gateway-xendit-secret-field")) byId("payment-gateway-xendit-secret-field").hidden = !isDirectXendit;
  if (byId("payment-gateway-midtrans-secret-field")) byId("payment-gateway-midtrans-secret-field").hidden = !isDirectMidtrans;

  const infoBox = byId("central-gateway-rates-info");
  const ratesGrid = byId("central-gateway-rates-grid");
  if (infoBox && ratesGrid) {
    if (isCentral) {
      infoBox.hidden = false;
      const gatewayKey = provider === "central_xendit" ? "xendit" : "midtrans";
      const master = state.settings?.paymentGateway?.centralMasterGateway || {};
      const rates = master[gatewayKey] || (gatewayKey === "xendit" ? { qrisRate: 0.7, cardRate: 2.0, vaFee: 4500, ewalletRate: 1.5 } : { qrisRate: 0.7, cardRate: 1.9, vaFee: 4000, ewalletRate: 1.7 });
      ratesGrid.innerHTML = `
        <span class="central-rate-badge"><strong>QRIS:</strong> ${rates.qrisRate}%</span>
        <span class="central-rate-badge"><strong>Card:</strong> ${rates.cardRate}%</span>
        <span class="central-rate-badge"><strong>Virtual Account:</strong> ${money(rates.vaFee)}</span>
        <span class="central-rate-badge"><strong>E-Wallet:</strong> ${rates.ewalletRate}%</span>
      `;
    } else {
      infoBox.hidden = true;
    }
  }
}

export function saveCentralMasterGateway(event) {
  event.preventDefault();
  const payload = {
    xendit: {
      status: byId("central-xendit-status")?.checked ? "active" : "inactive",
      secretKey: byId("central-xendit-secret")?.value.trim() || "",
      qrisRate: Number(byId("central-xendit-qris-rate")?.value || 0.7),
      cardRate: Number(byId("central-xendit-card-rate")?.value || 2.0),
      vaFee: Number(byId("central-xendit-va-fee")?.value || 4500),
      ewalletRate: Number(byId("central-xendit-ewallet-rate")?.value || 1.5)
    },
    midtrans: {
      status: byId("central-midtrans-status")?.checked ? "active" : "inactive",
      serverKey: byId("central-midtrans-server-key")?.value.trim() || "",
      qrisRate: Number(byId("central-midtrans-qris-rate")?.value || 0.7),
      cardRate: Number(byId("central-midtrans-card-rate")?.value || 1.9),
      vaFee: Number(byId("central-midtrans-va-fee")?.value || 4000),
      ewalletRate: Number(byId("central-midtrans-ewallet-rate")?.value || 1.7)
    }
  };
  if (!putSetting("/api/setting/central-gateway-master", payload)) {
    showFeedback("central-master-gateway-feedback", "Gagal menyimpan Pengaturan Master Gateway Pusat.");
    return;
  }
  showFeedback("central-master-gateway-feedback", "Pengaturan Master Gateway Pusat & Central API Keys berhasil disimpan.");
  if (renderSettingsHandler) renderSettingsHandler();
}

export function syncPaymentMethodFields() {
  const type = byId("payment-method-type")?.value || "cash";
  const isQris = type === "qris";
  const isEdc = type === "edc";
  const isCard = type === "card";
  
  const gateway = state.settings?.paymentGateway || {};
  const isManualGateway = !gateway.provider || gateway.provider === "manual";
  
  const qrisOnlineOpt = byId("payment-qris-mode")?.querySelector('option[value="online"]');
  if (qrisOnlineOpt) qrisOnlineOpt.disabled = isManualGateway;
  
  if (isManualGateway && isQris && byId("payment-qris-mode")) {
    byId("payment-qris-mode").value = "offline";
  }

  const isOfflineQris = isQris && byId("payment-qris-mode")?.value === "offline";
  if (byId("payment-qris-mode-field")) byId("payment-qris-mode-field").hidden = !isQris;
  if (byId("payment-qris-image-field")) byId("payment-qris-image-field").hidden = !isOfflineQris;
  if (byId("payment-edc-mode-field")) byId("payment-edc-mode-field").hidden = !isEdc;
  if (byId("payment-card-acquirer-field")) byId("payment-card-acquirer-field").hidden = !isEdc;
  if (byId("payment-merchant-id-field")) byId("payment-merchant-id-field").hidden = !isEdc;
  if (byId("payment-terminal-serial-field")) byId("payment-terminal-serial-field").hidden = !isEdc;
  if (byId("payment-connector-status-field")) byId("payment-connector-status-field").hidden = !isEdc;

  if (isQris && byId("payment-method-channel")) {
    byId("payment-method-channel").value = "QRIS";
  } else if (isEdc && byId("payment-method-channel")) {
    byId("payment-method-channel").value = byId("payment-card-acquirer")?.value || "BCA";
  } else if (isCard && byId("payment-method-channel")) {
    byId("payment-method-channel").value = "CARDS";
  }
}

export function openPaymentMethod(method = null) {
  byId("payment-method-form")?.reset();
  const nextSort = ((state.settings?.paymentMethods || []).reduce((max, item) => Math.max(max, Number(item.sort || 0)), 0) || 0) + 1;
  if (byId("payment-method-id")) byId("payment-method-id").value = method?.id || "";
  if (byId("payment-method-modal-title")) byId("payment-method-modal-title").textContent = method ? "Edit Metode Bayar" : "Tambah Metode Bayar";
  if (byId("payment-method-name")) byId("payment-method-name").value = method?.name || "";
  if (byId("payment-method-type")) byId("payment-method-type").value = method?.type || "cash";
  if (byId("payment-qris-mode")) byId("payment-qris-mode").value = method?.qrisMode || "offline";
  setQrisImage(method?.qrisImageUrl || "");
  if (byId("payment-method-channel")) byId("payment-method-channel").value = method?.channelCode || "CASH";
  if (byId("payment-method-terminal")) byId("payment-method-terminal").value = method?.terminalId || "";
  if (byId("payment-edc-mode")) byId("payment-edc-mode").value = method?.edcMode || "manual_slip";
  if (byId("payment-card-acquirer")) byId("payment-card-acquirer").value = method?.channelCode || "BCA";
  if (byId("payment-merchant-id")) byId("payment-merchant-id").value = method?.merchantId || "";
  if (byId("payment-terminal-serial")) byId("payment-terminal-serial").value = method?.terminalSerial || "";
  if (byId("payment-connector-status")) byId("payment-connector-status").value = method?.connectorStatus || CONNECTOR_STATUS.NOT_CONFIGURED;
  if (byId("payment-method-fee")) byId("payment-method-fee").value = method?.feeRate ?? 0;
  if (byId("payment-method-fee-payer")) byId("payment-method-fee-payer").value = method?.feePayer || "merchant";
  if (byId("payment-method-account")) byId("payment-method-account").value = method?.account || "";
  if (byId("payment-method-sort")) byId("payment-method-sort").value = method?.sort || nextSort;
  if (byId("payment-method-available-pos")) byId("payment-method-available-pos").checked = method?.isAvailablePos ?? true;
  if (byId("payment-method-available-online")) byId("payment-method-available-online").checked = method?.isAvailableOnline ?? true;
  if (byId("payment-method-status")) byId("payment-method-status").value = method?.status || COMMON_STATUS.ACTIVE;
  setText("payment-method-feedback", "");
  syncPaymentMethodFields();
  if (openModalHandler) openModalHandler("payment-method-modal");
}

export function savePaymentMethod(event) {
  event.preventDefault();
  const id = byId("payment-method-id")?.value || "";
  if (!canUsePermission("settings.payment", id ? "update" : "create", state, session)) {
    showFeedback("payment-method-feedback", "Anda tidak punya akses untuk menyimpan metode bayar.");
    return;
  }
  const name = byId("payment-method-name")?.value.trim() || "";
  const duplicate = (state.settings?.paymentMethods || []).some((method) => method.id !== id && method.name.toLowerCase() === name.toLowerCase());
  if (duplicate) {
    showFeedback("payment-method-feedback", "Nama metode bayar sudah digunakan.");
    return;
  }
  const type = byId("payment-method-type")?.value || "cash";
  const qrisMode = byId("payment-qris-mode")?.value || "offline";
  const isOnlinePayment = (type === "qris" && qrisMode === "online") || type === "card";
  const payload = {
    id,
    name,
    type,
    gatewayProvider: isOnlinePayment ? "online" : "manual",
    qrisMode,
    qrisImageUrl: byId("payment-qris-image-url")?.value.trim() || "",
    channelCode: byId("payment-method-channel")?.value.trim() || "",
    terminalId: byId("payment-method-terminal")?.value.trim() || "",
    edcMode: byId("payment-edc-mode")?.value || "manual_slip",
    merchantId: byId("payment-merchant-id")?.value.trim() || "",
    terminalSerial: byId("payment-terminal-serial")?.value.trim() || "",
    connectorStatus: byId("payment-connector-status")?.value || "not_configured",
    feeRate: Number(byId("payment-method-fee")?.value || 0),
    feePayer: byId("payment-method-fee-payer")?.value || "merchant",
    account: byId("payment-method-account")?.value.trim() || "",
    sort: Number(byId("payment-method-sort")?.value || 1),
    isAvailablePos: byId("payment-method-available-pos") ? byId("payment-method-available-pos").checked : true,
    isAvailableOnline: byId("payment-method-available-online") ? byId("payment-method-available-online").checked : true,
    status: byId("payment-method-status")?.value || COMMON_STATUS.ACTIVE
  };
  if (payload.type === "qris" && payload.qrisMode === "offline" && !payload.qrisImageUrl) {
    showFeedback("payment-method-feedback", "Upload gambar QRIS Static terlebih dahulu.");
    return;
  }
  if (isOnlinePayment && !["xendit", "midtrans"].includes(state.settings?.paymentGateway?.provider)) {
    showFeedback("payment-method-feedback", "Pilih Xendit atau Midtrans pada Pengaturan Gateway terlebih dahulu.");
    return;
  }
  if (!(id ? putSetting(`/api/payment-method/${id}`, payload) : postSetting("/api/payment-method", payload))) {
    showFeedback("payment-method-feedback", "Gagal menyimpan metode bayar ke database.");
    return;
  }
  if (closeModalHandler) closeModalHandler();
  if (renderSettingsHandler) renderSettingsHandler();
  showAlert(`Metode bayar ${name} tersimpan.`);
}

export function savePaymentGateway(event) {
  event.preventDefault();
  if (!canUsePermission("settings.payment", "update", state, session)) {
    showFeedback("payment-gateway-feedback", "Anda tidak punya akses untuk menyimpan gateway pembayaran.");
    return;
  }
  const provider = byId("payment-gateway-provider")?.value || "manual";
  state.settings.paymentGateway = {
    ...(state.settings?.paymentGateway || {}),
    provider,
    mode: byId("payment-gateway-mode")?.value || "sandbox",
    timeout: Number(byId("payment-gateway-timeout")?.value || 15),
    xenditSecretKey: provider === "xendit" ? byId("payment-gateway-xendit-secret")?.value.trim() : "",
    midtransServerKey: provider === "midtrans" ? byId("payment-gateway-midtrans-secret")?.value.trim() : ""
  };
  if (putSetting("/api/setting", state.settings)) {
    if (renderSettingsHandler) renderSettingsHandler();
    showAlert("Payment gateway berhasil disimpan.");
  } else {
    showFeedback("payment-gateway-feedback", "Gagal menyimpan payment gateway ke database.");
  }
}

export function toggleSecret(inputId) {
  const input = byId(inputId);
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
}

export function preventSecretCopy(event) {
  event.preventDefault();
  showFeedback("payment-gateway-feedback", "Secret key tidak bisa dicopy dari form.");
}
