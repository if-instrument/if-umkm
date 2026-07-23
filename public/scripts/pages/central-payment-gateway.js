import { applyBrandTheme, renderLayout } from "../layout.js?v=light-v3";
import { apiGet, apiPut, loadSession, loadState } from "../store.js?v=light-v3";
import { byId, showFeedback } from "../dom.js";
import { loadPageBootstrap } from "../page-engine.js?v=light-v3";

applyBrandTheme("#3B1F8C");
renderLayout();

const state = loadState();
const session = loadSession();

if (session?.authType !== "super_admin") {
  window.location.href = "/pages/users.html";
} else {
  loadCentralGatewayData();
}

function loadCentralGatewayData() {
  const response = loadPageBootstrap("users", state, session);
  if (response?.ok && response?.data?.centralPaymentGateway) {
    renderCentralMasterGateway(response.data.centralPaymentGateway);
  } else {
    const res = apiGet("/api/setting/central-gateway-master");
    if (res?.ok && res?.data) {
      renderCentralMasterGateway(res.data);
    }
  }
}

function renderCentralMasterGateway(gateway = {}) {
  // Data from GET /api/setting/central-gateway-master returns {xendit, midtrans} directly
  // Data from bootstrap returns wrapped in centralMasterGateway
  const master = gateway.centralMasterGateway || gateway;
  const xenditMaster = master.xendit || { status: "active", qrisRate: 0.7, cardRate: 2.0, vaFee: 4500, ewalletRate: 1.5 };
  const midtransMaster = master.midtrans || { status: "active", qrisRate: 0.7, cardRate: 1.9, vaFee: 4000, ewalletRate: 1.7 };

  const isXenditActive = xenditMaster.status === "active";
  if (byId("central-xendit-status")) byId("central-xendit-status").checked = isXenditActive;
  if (byId("stat-xendit-status")) byId("stat-xendit-status").textContent = isXenditActive ? "Active" : "Disabled";
  if (byId("xendit-status-text")) byId("xendit-status-text").textContent = isXenditActive ? "Aktif" : "Nonaktif";
  if (byId("central-xendit-secret")) byId("central-xendit-secret").placeholder = xenditMaster.hasApiKey ? "••••••••••••••••" : "Masukkan Secret Key Xendit";
  if (byId("central-xendit-qris-rate")) byId("central-xendit-qris-rate").value = xenditMaster.qrisRate;
  if (byId("central-xendit-card-rate")) byId("central-xendit-card-rate").value = xenditMaster.cardRate;
  if (byId("central-xendit-va-fee")) byId("central-xendit-va-fee").value = xenditMaster.vaFee;
  if (byId("central-xendit-ewallet-rate")) byId("central-xendit-ewallet-rate").value = xenditMaster.ewalletRate;

  const isMidtransActive = midtransMaster.status === "active";
  if (byId("central-midtrans-status")) byId("central-midtrans-status").checked = isMidtransActive;
  if (byId("stat-midtrans-status")) byId("stat-midtrans-status").textContent = isMidtransActive ? "Active" : "Disabled";
  if (byId("midtrans-status-text")) byId("midtrans-status-text").textContent = isMidtransActive ? "Aktif" : "Nonaktif";
  if (byId("central-midtrans-server-key")) byId("central-midtrans-server-key").placeholder = midtransMaster.hasApiKey ? "••••••••••••••••" : "Masukkan Server Key Midtrans";
  if (byId("central-midtrans-qris-rate")) byId("central-midtrans-qris-rate").value = midtransMaster.qrisRate;
  if (byId("central-midtrans-card-rate")) byId("central-midtrans-card-rate").value = midtransMaster.cardRate;
  if (byId("central-midtrans-va-fee")) byId("central-midtrans-va-fee").value = midtransMaster.vaFee;
  if (byId("central-midtrans-ewallet-rate")) byId("central-midtrans-ewallet-rate").value = midtransMaster.ewalletRate;
}

function saveCentralMasterGateway(event) {
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
  const res = apiPut("/api/setting/central-gateway-master", payload);
  if (!res?.ok) {
    showFeedback("central-master-gateway-feedback", res?.message || "Gagal menyimpan Master Gateway Pusat.");
    return;
  }
  showFeedback("central-master-gateway-feedback", "Pengaturan Master Gateway Pusat berhasil disimpan.");
  loadCentralGatewayData();
}

byId("central-xendit-status")?.addEventListener("change", (e) => {
  const isChecked = e.target.checked;
  if (byId("stat-xendit-status")) byId("stat-xendit-status").textContent = isChecked ? "Active" : "Disabled";
  if (byId("xendit-status-text")) byId("xendit-status-text").textContent = isChecked ? "Aktif" : "Nonaktif";
});

byId("central-midtrans-status")?.addEventListener("change", (e) => {
  const isChecked = e.target.checked;
  if (byId("stat-midtrans-status")) byId("stat-midtrans-status").textContent = isChecked ? "Active" : "Disabled";
  if (byId("midtrans-status-text")) byId("midtrans-status-text").textContent = isChecked ? "Aktif" : "Nonaktif";
});

byId("central-master-gateway-form")?.addEventListener("submit", saveCentralMasterGateway);

document.querySelectorAll("[data-toggle-secret]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const inputId = btn.dataset.toggleSecret;
    const input = byId(inputId);
    if (input) input.type = input.type === "password" ? "text" : "password";
  });
});
