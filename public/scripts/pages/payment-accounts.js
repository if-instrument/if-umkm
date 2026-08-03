import { applyBrandTheme, renderLayout } from "../layout.js";
import { apiDelete, apiGet, apiPost, apiPut, apiUpload } from "../store.js";
import { byId, showFeedback } from "../dom.js";
import { commonStatusCode, statusLabel } from "../status-codes.js";

applyBrandTheme("#3B1F8C");
renderLayout();

let paymentAccounts = [];

function statusPill(status, domain = "common") {
  const code = commonStatusCode(status);
  const text = statusLabel(status, domain);
  const tone = code === "10" ? "status-active" : code === "00" ? "status-draft" : "status-inactive";
  return `<span class="status-pill ${tone}">${text}</span>`;
}

function openModal(id) {
  const backdrop = document.querySelector("[data-app-modal]");
  if (backdrop) backdrop.hidden = false;
  const modal = byId(id);
  if (modal) modal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeModal() {
  const backdrop = document.querySelector("[data-app-modal]");
  if (backdrop) backdrop.hidden = true;
  document.querySelectorAll(".modal-dialog").forEach((modal) => { modal.hidden = true; });
  document.body.classList.remove("modal-open");
}

function loadCentralPaymentAccounts() {
  const result = apiGet("/api/central-payment-account");
  paymentAccounts = result?.data || [];
  renderPaymentAccountTable();
}

function togglePaymentTypeFields(type) {
  const isQris = type === "qris";
  const bankSec = byId("section-bank-fields");
  const qrisSec = byId("section-qris-fields");
  if (bankSec) bankSec.hidden = isQris;
  if (qrisSec) qrisSec.hidden = !isQris;
}

function renderPaymentAccountTable() {
  const table = byId("payment-account-table");
  if (!table) return;
  table.innerHTML = paymentAccounts.length
    ? paymentAccounts.map((acc) => {
        const isQris = /qris/i.test(acc.bankName) || /qris/i.test(acc.notes) || Boolean(acc.qrisImageUrl);
        const icon = isQris ? "⚡" : "🏦";
        const qrisImg = acc.qrisImageUrl ? `<br><img src="${acc.qrisImageUrl}" alt="QRIS" style="max-height:48px; border-radius:4px; margin-top:4px; border:1px solid #cbd5e1;" />` : "";
        return `
          <tr>
            <td>
              <strong style="display:flex; align-items:center; gap:6px; color:${isQris ? '#15803d' : 'var(--ink)'};">
                <span>${icon}</span> <span>${acc.bankName}</span>
              </strong>
            </td>
            <td>
              <strong style="color:var(--brand); font-size:14px; font-family:monospace;">${acc.accountNumber || "-"}</strong>
              ${qrisImg}
            </td>
            <td><strong>a.n. ${acc.accountHolder}</strong></td>
            <td><small style="color:var(--muted);">${acc.notes || "-"}</small></td>
            <td>${statusPill(acc.status)}</td>
            <td>
              <div class="row-actions">
                <button class="ghost-button compact-button" data-edit-payment-account="${acc.id}" type="button">Edit</button>
                <button class="ghost-button compact-button" data-toggle-payment-account="${acc.id}" type="button">${String(acc.status) === "10" ? "Nonaktif" : "Aktifkan"}</button>
              </div>
            </td>
          </tr>
        `;
      }).join("")
    : '<tr><td colspan="6"><p class="form-preview">Belum ada rekening / metode pembayaran pusat.</p></td></tr>';
}

function openPaymentAccountModal(acc = null) {
  byId("payment-account-form").reset();
  byId("payment-account-id").value = acc?.id || "";
  byId("payment-account-modal-title").textContent = acc ? "Edit Metode Pembayaran SaaS Central" : "Tambah Metode Pembayaran SaaS Central";

  const isQris = acc ? (/qris/i.test(acc.bankName) || Boolean(acc.qrisImageUrl)) : false;
  const typeSelect = byId("payment-account-type");
  if (typeSelect) {
    typeSelect.value = isQris ? "qris" : "bank";
    togglePaymentTypeFields(typeSelect.value);
  }

  const cleanQrisUrl = (acc?.qrisImageUrl && !acc.qrisImageUrl.startsWith("data:"))
    ? acc.qrisImageUrl
    : "/assets/qris-static-sample.png";

  if (isQris) {
    byId("payment-account-qris-provider").value = acc?.bankName || "QRIS All Payment";
    byId("payment-account-qris-nmid").value = acc?.accountNumber || "";
    byId("payment-account-qris-holder").value = acc?.accountHolder || "";
    byId("payment-account-qris-url").value = cleanQrisUrl;
  } else {
    byId("payment-account-bank-name").value = acc?.bankName || "";
    byId("payment-account-number").value = acc?.accountNumber || "";
    byId("payment-account-holder").value = acc?.accountHolder || "";
  }

  byId("payment-account-status").value = acc?.status || "10";
  byId("payment-account-notes").value = acc?.notes || "";

  // Preview QRIS image if available
  const previewWrap = byId("payment-account-qris-preview-wrap");
  const imgPreview  = byId("payment-account-qris-img-preview");
  if (previewWrap && imgPreview) {
    if (cleanQrisUrl) {
      imgPreview.src = cleanQrisUrl;
      previewWrap.hidden = false;
    } else {
      previewWrap.hidden = true;
    }
  }

  openModal("payment-account-modal");
}

document.addEventListener("DOMContentLoaded", () => {
  loadCentralPaymentAccounts();

  byId("payment-account-type")?.addEventListener("change", (e) => {
    togglePaymentTypeFields(e.target.value);
  });

  // Handle QRIS static image file upload (Direct Server Upload, Original Quality)
  byId("payment-account-qris-file")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    const result = apiUpload("/api/public/upload-payment-proof", formData);
    if (result?.ok && result.url) {
      byId("payment-account-qris-url").value = result.url;
      const previewWrap = byId("payment-account-qris-preview-wrap");
      const imgPreview  = byId("payment-account-qris-img-preview");
      if (previewWrap && imgPreview) {
        imgPreview.src = result.url;
        previewWrap.hidden = false;
      }
      showFeedback("payment-account-feedback", "Gambar QRIS berhasil diunggah dengan kualitas asli.");
    } else {
      showFeedback("payment-account-feedback", result?.message || "Gagal mengunggah gambar QRIS.");
    }
  });

  byId("btn-add-payment-account")?.addEventListener("click", () => openPaymentAccountModal());

  byId("payment-account-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const type = byId("payment-account-type")?.value || "bank";
    const isQris = type === "qris";

    let rawQrisUrl = byId("payment-account-qris-url")?.value.trim() || "";
    if (!rawQrisUrl || rawQrisUrl.startsWith("data:")) {
      rawQrisUrl = "/assets/qris-static-sample.png";
    }

    const payload = {
      id: byId("payment-account-id").value,
      bankName: isQris
        ? (byId("payment-account-qris-provider").value.trim() || "QRIS All Payment")
        : byId("payment-account-bank-name").value.trim(),
      accountNumber: isQris
        ? (byId("payment-account-qris-nmid").value.trim() || "QRIS-SCAN")
        : byId("payment-account-number").value.trim(),
      accountHolder: isQris
        ? byId("payment-account-qris-holder").value.trim()
        : byId("payment-account-holder").value.trim(),
      qrisImageUrl: isQris ? rawQrisUrl : "",
      status: byId("payment-account-status").value,
      notes: byId("payment-account-notes").value.trim()
    };

    const id = payload.id;
    const result = id ? apiPut(`/api/central-payment-account/${id}`, payload) : apiPost("/api/central-payment-account", payload);
    if (result?.ok) {
      paymentAccounts = result.data || paymentAccounts;
      renderPaymentAccountTable();
      closeModal();
      showFeedback("payment-account-feedback", id ? "Metode pembayaran berhasil diperbarui." : "Metode pembayaran baru berhasil ditambahkan.");
    } else {
      showFeedback("payment-account-feedback", result?.message || "Gagal menyimpan metode pembayaran.");
    }
  });

  document.addEventListener("click", (event) => {
    const editAcc = event.target.closest("[data-edit-payment-account]");
    if (editAcc) {
      const acc = paymentAccounts.find((a) => String(a.id) === editAcc.dataset.editPaymentAccount);
      if (acc) openPaymentAccountModal(acc);
    }

    const toggleAcc = event.target.closest("[data-toggle-payment-account]");
    if (toggleAcc) {
      const acc = paymentAccounts.find((a) => String(a.id) === toggleAcc.dataset.togglePaymentAccount);
      if (acc) {
        const isCurrentActive = String(acc.status) === "10";
        const result = isCurrentActive
          ? apiDelete(`/api/central-payment-account/${acc.id}`)
          : apiPut(`/api/central-payment-account/${acc.id}`, { ...acc, status: "10" });
        if (result?.ok) {
          paymentAccounts = result.data || paymentAccounts;
          renderPaymentAccountTable();
        }
      }
    }

    if (event.target.closest("[data-close-modal]") || event.target.matches("[data-app-modal]")) {
      closeModal();
    }
  });
});
