import { state, isSuperAdmin } from "./users-state.js";
import { statusPill } from "./users-helpers.js";
import { byId, setText, showAlert, showFeedback } from "../../dom.js";
import { INVITATION_STATUS, isActiveStatus } from "../../status-codes.js";
import { apiGet, apiPost, apiUpload, showGlobalLoading, hideGlobalLoading } from "../../store.js";
import { ensureSaasPlansLoaded } from "./users-api.js";

let refreshDataHandler = null;
let closeModalHandler = null;
let openModalHandler = null;

export function setCompanyCallbacks({ refreshDataAndTables, closeModal, openModal }) {
  if (refreshDataAndTables) refreshDataHandler = refreshDataAndTables;
  if (closeModal) closeModalHandler = closeModal;
  if (openModal) openModalHandler = openModal;
}

export function renderCompanies() {
  const saasPlansMap = (state.saasPlans || []).reduce((acc, p) => {
    if (p && p.code) acc[String(p.code).toLowerCase()] = p;
    return acc;
  }, {});

  const table = byId("company-table");
  if (!table) return;

  table.innerHTML = (state.companies || []).map((company) => {
    const planCode = String(company.subscriptionPlan || "Professional").toLowerCase();
    const planObj = saasPlansMap[planCode];
    const planName = planObj?.name || company.subscriptionPlan || "Professional Plan";
    const isExpired = company.expiresAt && new Date(company.expiresAt) < new Date();
    const expText = company.expiresAt
      ? `<span style="${isExpired ? 'color:#ef4444; font-weight:700;' : ''}">${company.expiresAt}${isExpired ? ' (Kadaluarsa)' : ''}</span>`
      : `<small style="color:var(--muted);">Selamanya</small>`;
    
    const aiBadge = company.hasAiBiometrics
      ? `<span class="status-pill status-active" style="font-size:10px; background:#ecfdf5; color:#047857; border-color:#a7f3d0;">🤖 AI Active</span>`
      : `<span class="status-pill status-inactive" style="font-size:10px;">Non-AI</span>`;

    const isProvisioned = String(company.tenantStatus) === "CREATED" || company.id === "company-main" || String(company.id) === "1";
    const isRejected = String(company.status) === "90" || String(company.paymentStatus) === "20" || String(company.status) === "rejected";
    const isPending = !isProvisioned && !isRejected && (String(company.status) === "00" || String(company.status) === "0" || (company.registrationType === "PUBLIC_REGISTRATION" && String(company.paymentStatus) === "00"));
    const isPublicReg = company.registrationType === "PUBLIC_REGISTRATION" || (isPending && !isProvisioned);

    const regBadge = isPublicReg
      ? `<span class="badge" style="background:#fffbeb; color:#b45309; border:1px solid #fde68a; font-size:10px; padding:2px 6px; border-radius:4px; font-weight:600; display:inline-block; margin-top:2px;">📝 Pengajuan Mandiri</span>`
      : `<span class="badge" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; font-size:10px; padding:2px 6px; border-radius:4px; font-weight:600; display:inline-block; margin-top:2px;">🏢 Dibuat Super Admin</span>`;

    let actionButtons = "";
    if (isPending && isSuperAdmin) {
      if (company.paymentProofUrl) {
        actionButtons += `<a class="ghost-button compact-button" href="${company.paymentProofUrl}" target="_blank" title="Lihat Bukti Transfer">Bukti Bayar</a>`;
      }
      actionButtons += `<button class="primary-button compact-button" data-approve-company="${company.id}" style="background:#059669; border-color:#059669; color:#fff;" type="button">Setujui & Provisioning</button>`;
      actionButtons += `<button class="ghost-button compact-button" data-reject-company="${company.id}" style="color:#dc2626;" type="button">Tolak</button>`;
      actionButtons += `<button class="ghost-button compact-button" data-edit-company="${company.id}" data-permission="admin.companies:update" type="button">Edit</button>`;
    } else {
      actionButtons += `<button class="ghost-button compact-button" data-edit-company="${company.id}" data-permission="admin.companies:update" type="button">Edit</button>`;
      if (isSuperAdmin && isProvisioned) {
        actionButtons += `<button class="ghost-button compact-button" data-renew-company="${company.id}" style="color:#059669; border-color:#10b981; font-weight:600;" type="button">⏳ Perpanjang Subscription</button>`;
        actionButtons += `<button class="ghost-button compact-button" data-audit-company="${company.id}" style="color:#6b21a8; border-color:#c084fc; font-weight:600;" type="button">📜 Audit Pembelian</button>`;
      }
      if (isRejected && isSuperAdmin) {
        actionButtons += `<button class="ghost-button compact-button" data-resend-rejection-email="${company.id}" style="color:#b91c1c;" type="button">📧 Kirim Ulang Link Perbaikan</button>`;
      }
      if (String(company.adminStatus) === INVITATION_STATUS.PENDING || company.adminStatus === "invited") {
        actionButtons += `<button class="ghost-button compact-button" data-resend-company-invite="${company.id}" data-permission="admin.companies:update" type="button">Kirim Ulang Undangan</button>`;
      }
      if (!isSuperAdmin) {
        actionButtons += `<button class="ghost-button compact-button" data-select-company="${company.id}" ${company.id === state.activeCompanyId ? "disabled" : ""} type="button">Kelola</button>`;
      }
      actionButtons += `<button class="ghost-button compact-button" data-toggle-company="${company.id}" data-permission="admin.companies:delete" type="button">${isActiveStatus(company.status) ? "Nonaktif" : "Aktifkan"}</button>`;
    }

    const companyStatusPill = isRejected
      ? `<span class="status-pill status-danger" style="background:#fef2f2; color:#dc2626; border-color:#fecaca; font-size:11px; font-weight:700;">Ditolak (Nonaktif)</span>`
      : isPending
      ? `<span class="status-pill status-warning" style="font-size:11px;">Menunggu Persetujuan</span>`
      : statusPill(company.status);

    return `
      <tr>
        <td>
          <strong>${company.name}</strong><br>
          <small>/${company.routeSlug || "-"}${company.id === state.activeCompanyId ? " · Perusahaan aktif" : ""}</small><br>
          ${regBadge}
          ${company.dbName ? `<br><small style="color:var(--muted);">DB: ${company.dbName}</small>` : ""}
        </td>
        <td><span class="status-pill status-active" style="font-size:11px;">${planName}</span></td>
        <td><strong>${Number(company.maxOutlets || 0) >= 999 ? "Unlimited" : (company.maxOutlets || 5) + " Outlet"}</strong></td>
        <td>${expText}</td>
        <td>${aiBadge}</td>
        <td>${company.adminName || "-"}<br><small>${company.adminEmail || "-"}</small><br>${statusPill(company.adminStatus)}</td>
        <td>${companyStatusPill}</td>
        <td>
          <div class="row-actions">
            ${actionButtons}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

export function populateTenantPlanOptions(selectedPlanCode = "Professional") {
  const select = byId("tenant-subscription-plan");
  if (!select) return;

  const plans = state.saasPlans || [];
  if (!plans.length) {
    select.innerHTML = `
      <option value="Starter">Starter Plan (3 Outlet)</option>
      <option value="Professional" selected>Professional Plan (10 Outlet)</option>
      <option value="Enterprise">Enterprise Plan (Unlimited)</option>
    `;
    return;
  }

  select.innerHTML = plans.map((p) => {
    const isSelected = String(p.code).toLowerCase() === String(selectedPlanCode || "Professional").toLowerCase() ? "selected" : "";
    const isFeatured = Boolean(p.isFeatured || String(p.code).toLowerCase() === "professional");
    const recBadge = isFeatured ? " ⭐ (Recommended)" : "";
    const aiText = p.hasAiBiometrics ? " 🤖 AI Included" : " (Non-AI)";
    return `
      <option value="${p.code}" ${isSelected}>
        ${p.name || p.code}${recBadge}${aiText} - ${Number(p.price || 0) <= 0 ? "Gratis" : "Rp " + Number(p.price).toLocaleString("id-ID")}
      </option>
    `;
  }).join("");
}

export function renderCentralMasterGateway(gw) {
  const container = byId("central-gateway-config-container");
  if (!container) return;
  if (!isSuperAdmin) {
    container.style.display = "none";
    return;
  }
  container.style.display = "block";
  const statusEl = byId("central-gw-status");
  if (statusEl) {
    statusEl.innerHTML = gw?.isActive
      ? '<span class="status-pill status-ok">Aktif</span>'
      : '<span class="status-pill status-empty">Belum Dikonfigurasi</span>';
  }
}

export function openApprovalModal(company) {
  if (!company) return;
  byId("approval-company-id").value = company.id;
  setText("approval-company-name", company.name || "-");
  setText("approval-company-plan", `${company.subscriptionPlan || "Professional"} (${company.maxOutlets || 5} Outlet)`);
  setText("approval-admin-email", `${company.adminName || "Admin"} <${company.adminEmail || "email"}>`);
  setText("approval-payment-notes", company.paymentNotes || "Pendaftaran mandiri online.");

  const img = byId("approval-proof-image");
  const link = byId("approval-proof-link");
  const noProof = byId("approval-no-proof");

  if (company.paymentProofUrl) {
    if (img) {
      img.src = company.paymentProofUrl;
      img.style.display = "block";
    }
    if (link) {
      link.href = company.paymentProofUrl;
      link.style.display = "inline-block";
    }
    if (noProof) noProof.style.display = "none";
  } else {
    if (img) img.style.display = "none";
    if (link) link.style.display = "none";
    if (noProof) noProof.style.display = "block";
  }

  if (openModalHandler) openModalHandler("company-approval-modal");
}

export function updateRenewalPlanDetails() {
  const planCode = byId("renewal-subscription-plan")?.value;
  const plans = state.saasPlans || [];
  const plan = plans.find((p) => String(p.code).toLowerCase() === String(planCode).toLowerCase()) || plans[0];
  const detailsEl = byId("renewal-plan-details");
  if (detailsEl && plan) {
    const formattedPrice = plan.price ? `Rp ${Number(plan.price).toLocaleString("id-ID")}` : "Gratis / Custom";
    const durationText = plan.durationDays > 0 ? `${plan.durationDays} Hari` : "Unlimited / Permanen";
    const aiText = plan.hasAiBiometrics ? "✅ Termasuk AI Login" : "❌ Tanpa AI Login";
    detailsEl.innerHTML = `
      <strong>Detail Paket ${plan.name || plan.code}:</strong><br>
      • Biaya Perpanjangan: <strong>${formattedPrice}</strong><br>
      • Batas Maksimal Kuota: <strong>${plan.maxOutlets || 5} Outlet</strong><br>
      • Masa Tambahan Aktif: <strong>${durationText}</strong><br>
      • Fitur AI Biometrik: <strong>${aiText}</strong>
    `;
  }
}

export function openRenewalModal(company) {
  if (!company) return;
  ensureSaasPlansLoaded();
  byId("renewal-company-id").value = company.id;
  setText("renewal-company-name", company.name || "-");
  setText("renewal-current-expiry", `Kedaluwarsa Saat Ini: ${company.expiresAt || "Belum diatur"} | Status: ${company.status === "10" ? "Aktif" : "Kedaluwarsa/Nonaktif"}`);

  const proofFileInput = byId("renewal-payment-proof-file");
  const proofUrlInput  = byId("renewal-payment-proof-url");
  const proofPreview   = byId("renewal-proof-preview");
  const proofImg       = byId("renewal-proof-img");
  const proofStatus    = byId("renewal-proof-status");
  if (proofFileInput) proofFileInput.value = "";
  if (proofUrlInput)  proofUrlInput.value  = "";
  if (proofPreview)   proofPreview.style.display = "none";
  if (proofImg)       proofImg.src = "";
  if (proofStatus)    proofStatus.textContent = "Unggah bukti transfer untuk transaksi perpanjangan ini.";

  const plans = state.saasPlans || [];
  const select = byId("renewal-subscription-plan");
  if (select) {
    select.innerHTML = plans.map((p) => {
      const priceText = p.price ? `Rp ${Number(p.price).toLocaleString("id-ID")}` : "Gratis";
      const selected = String(p.code).toLowerCase() === String(company.subscriptionPlan || "Professional").toLowerCase() ? "selected" : "";
      return `<option value="${p.code}" ${selected}>${p.name || p.code} — ${priceText} (${p.maxOutlets || 5} Outlet, ${p.durationDays || 365} Hari)</option>`;
    }).join("");
  }
  updateRenewalPlanDetails();
  if (openModalHandler) openModalHandler("company-renewal-modal");
}

export function openSubscriptionAuditModal(companyId = "") {
  const modalTitle = byId("audit-modal-title");
  const company = companyId ? (state.companies || []).find((c) => c.id === companyId) : null;
  if (modalTitle) {
    modalTitle.textContent = company ? `Riwayat & Audit Pembelian SaaS — ${company.name}` : "Riwayat & Audit Pembelian SaaS (Semua Perusahaan)";
  }

  const tbody = byId("audit-logs-table-body");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--muted); padding: 20px;">Memuat riwayat audit...</td></tr>`;
  }
  if (openModalHandler) openModalHandler("company-audit-modal");

  const url = companyId ? `/api/company/${companyId}/subscription-logs` : "/api/saas-subscription-logs";
  const res = apiGet(url);
  const logs = (res && res.ok && Array.isArray(res.data)) ? res.data : (Array.isArray(res) ? res : []);

  const totalCountEl = byId("audit-total-count");
  const totalAmountEl = byId("audit-total-amount");
  if (totalCountEl) totalCountEl.textContent = `${logs.length} Transaksi`;

  const totalSum = logs.reduce((acc, item) => acc + Number(item.pricePaid || 0), 0);
  if (totalAmountEl) totalAmountEl.textContent = `Rp ${totalSum.toLocaleString("id-ID")}`;

  if (!logs.length) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--muted); padding: 20px;">Belum ada riwayat transaksi / perpanjangan SaaS tercatat.</td></tr>`;
    return;
  }

  if (tbody) {
    tbody.innerHTML = logs.map((log) => {
      let badge = `<span class="badge" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">📝 Pendaftaran</span>`;
      if (log.actionType === "RENEWAL") {
        badge = `<span class="badge" style="background:#ecfdf5; color:#047857; border:1px solid #a7f3d0;">🔄 Perpanjangan</span>`;
      } else if (log.actionType === "UPGRADE") {
        badge = `<span class="badge" style="background:#f3e8ff; color:#6b21a8; border:1px solid #e9d5ff;">🚀 Upgrade</span>`;
      } else if (log.actionType === "DOWNGRADE") {
        badge = `<span class="badge" style="background:#fffbeb; color:#b45309; border:1px solid #fde68a;">📉 Downgrade</span>`;
      } else if (log.actionType === "INITIAL_REGISTER") {
        badge = `<span class="badge" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">📝 Daftar Baru</span>`;
      } else if (log.actionType === "RESUBMIT_REGISTER") {
        badge = `<span class="badge" style="background:#fff7ed; color:#c2410c; border:1px solid #fed7aa;">📤 Daftar Ulang</span>`;
      } else if (log.actionType === "REGISTRATION_APPROVED") {
        badge = `<span class="badge" style="background:#f0fdf4; color:#166534; border:1px solid #bbf7d0;">✅ Disetujui</span>`;
      }

      const priceText = log.pricePaid > 0 ? `Rp ${Number(log.pricePaid).toLocaleString("id-ID")}` : "Gratis / Custom";
      const transitionText = log.fromPlanName && log.fromPlanName !== "-"
        ? `${log.fromPlanName} ➔ <strong>${log.toPlanName}</strong>`
        : `<strong>${log.toPlanName}</strong>`;

      const proofBtn = log.paymentProofUrl
        ? `<a href="${log.paymentProofUrl}" target="_blank" style="color:var(--brand); font-weight:600; text-decoration:underline;" title="Lihat Gambar Bukti Transfer">Lihat Bukti</a>`
        : "";

      return `
        <tr>
          <td>
            <strong style="font-size: 13px; color: #1e293b; display: block;">${log.createdAt || "-"}</strong>
            <small style="color: #64748b;">Masa: ${log.durationDays > 0 ? log.durationDays + " Hari" : "Selamanya"}</small>
          </td>
          <td>
            <strong style="color: var(--brand); font-size: 13px;">${log.companyName || "-"}</strong>
          </td>
          <td>${badge}</td>
          <td style="font-size: 12px; color: #334155;">${transitionText}</td>
          <td><strong style="color: #047857; font-size: 13px;">${priceText}</strong></td>
          <td style="font-size: 12px; color: #475569;">${log.newExpiresAt || "Selamanya"}</td>
          <td style="font-size: 12px; color: #475569;">
            ${log.createdByName || "System"}<br>
            ${proofBtn}
          </td>
        </tr>
      `;
    }).join("");
  }
}
