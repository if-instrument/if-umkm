import { applyBrandTheme, renderLayout } from "../layout.js";
import { apiDelete, apiGet, apiPost, apiPut, hideGlobalLoading, showGlobalLoading } from "../store.js";
import { byId, showAlert, showFeedback } from "../dom.js";
import { commonStatusCode, statusLabel } from "../status-codes.js";

applyBrandTheme("#3B1F8C");
renderLayout();

let plans = [];

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

function loadSaasPlans() {
  const result = apiGet("/api/saas-plan");
  plans = result?.data || [];
  renderSaasPlanCards();
  renderSaasPlanTable();
}

function formatRupiah(amount) {
  const num = Number(amount || 0);
  if (num <= 0) return "Gratis";
  return "Rp " + num.toLocaleString("id-ID");
}

function renderSaasPlanCards() {
  const container = byId("saas-plans-cards-container");
  if (!container) return;

  if (!plans.length) {
    container.innerHTML = `<p style="color:var(--muted); font-size:13px;">Belum ada data paket SaaS.</p>`;
    return;
  }

  container.innerHTML = plans.map((plan) => {
    const isFeatured = Boolean(plan.isFeatured);
    const hasAi = Boolean(plan.hasAiBiometrics);
    const outletsText = Number(plan.maxOutlets || 0) >= 999 ? "Unlimited Outlet" : `${plan.maxOutlets || 5} Outlet`;
    const durationText = !plan.durationDays ? "Selamanya (Unlimited)" : `${plan.durationDays} Hari (${Math.round(plan.durationDays / 30)} Bulan)`;
    const priceText = formatRupiah(plan.price);
    const cardBorder = isFeatured ? "2px solid #3B1F8C" : "1px solid #cbd5e1";
    const bgHeader = isFeatured ? "#f4f0ff" : "#f8fafc";

    return `
      <div style="background: #ffffff; border: ${cardBorder}; border-radius: 14px; box-shadow: ${isFeatured ? '0 10px 25px -5px rgba(59, 31, 140, 0.15)' : '0 4px 12px rgba(0,0,0,0.03)'}; display: flex; flex-direction: column; overflow: hidden; position: relative;">
        ${isFeatured ? '<div style="position: absolute; top: 12px; right: 12px; background: #3B1F8C; color: #ffffff; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 20px;">⭐ UNGGULAN</div>' : ''}
        
        <!-- Plan Header -->
        <div style="background: ${bgHeader}; padding: 18px; border-bottom: 1px solid #e2e8f0;">
          <h4 style="font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">${plan.name}</h4>
          <p style="font-size: 12px; color: #64748b; margin-bottom: 10px; line-height: 1.4;">${plan.description || "Paket SaaS berlangganan untuk bisnis UMKM."}</p>
          <div style="display: flex; align-items: baseline; gap: 4px;">
            <span style="font-size: 22px; font-weight: 800; color: var(--brand, #3B1F8C);">${priceText}</span>
            ${Number(plan.price || 0) > 0 ? '<span style="font-size: 11px; color: #64748b;">/ lisensi</span>' : ''}
          </div>
        </div>

        <!-- Plan Benefit Details List -->
        <div style="padding: 18px; display: flex; flex-direction: column; gap: 10px; flex: 1;">
          <span style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">Rincian Benefit & Fitur:</span>
          
          <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #334155;">
            <span style="color: #059669; font-weight: 700;">✓</span>
            <span><strong>Kuota Outlet:</strong> ${outletsText}</span>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #334155;">
            <span style="color: #059669; font-weight: 700;">✓</span>
            <span><strong>Masa Aktif:</strong> ${durationText}</span>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: ${hasAi ? '#047857' : '#94a3b8'};">
            <span style="color: ${hasAi ? '#059669' : '#cbd5e1'}; font-weight: 700;">${hasAi ? '✓' : '✗'}</span>
            <span>${hasAi ? '🤖 <strong>Fitur AI Biometrik Login</strong> (Wajah & Sidik Jari)' : '🤖 Fitur AI Login Biometrik (Tidak Tersedia)'}</span>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #334155;">
            <span style="color: #059669; font-weight: 700;">✓</span>
            <span>Laporan Penjualan & Inventaris Stok Realtime</span>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #334155;">
            <span style="color: #059669; font-weight: 700;">✓</span>
            <span>Dynamic QRIS & Card Payment Gateway</span>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #334155;">
            <span style="color: #059669; font-weight: 700;">✓</span>
            <span>Dedicated Tenant Database Security</span>
          </div>
        </div>

        <!-- Plan Footer Actions -->
        <div style="padding: 12px 18px 18px; border-top: 1px dashed #e2e8f0; display: flex; gap: 8px;">
          <button class="ghost-button compact-button" data-edit-plan="${plan.id}" style="flex: 1;" type="button">Edit Benefit</button>
          <button class="ghost-button compact-button" data-toggle-plan="${plan.id}" type="button">${String(plan.status) === "10" ? "Nonaktif" : "Aktifkan"}</button>
        </div>
      </div>
    `;
  }).join("");
}

function renderSaasPlanTable() {
  const table = byId("saas-plan-standalone-table");
  if (!table) return;
  table.innerHTML = plans.length
    ? plans.map((plan) => `
      <tr>
        <td><strong>${plan.name}</strong><br><small>${plan.description || "Tanpa deskripsi"}</small></td>
        <td><code>${plan.code}</code></td>
        <td><strong style="color:var(--brand);">${formatRupiah(plan.price)}</strong></td>
        <td><strong>${plan.maxOutlets >= 999 ? "Unlimited" : plan.maxOutlets + " Outlet"}</strong></td>
        <td><strong>${!plan.durationDays ? "Unlimited (Selamanya)" : plan.durationDays + " Hari (" + Math.round(plan.durationDays / 30) + " Bulan)"}</strong></td>
        <td>${plan.hasAiBiometrics ? '<span class="status-pill status-active" style="font-size:10px; background:#ecfdf5; color:#047857; border-color:#a7f3d0;">🤖 AI Login (Ya)</span>' : '<span class="status-pill status-inactive" style="font-size:10px;">Non-AI</span>'}</td>
        <td>${statusPill(plan.status)}</td>
        <td>${plan.isFeatured ? '<span class="status-pill status-active" style="font-size:10px;">⭐ Featured</span>' : '<span style="color:var(--muted); font-size:10px;">-</span>'}</td>
        <td>
          <div class="row-actions">
            <button class="ghost-button compact-button" data-edit-plan="${plan.id}" type="button">Edit</button>
            <button class="ghost-button compact-button" data-toggle-plan="${plan.id}" type="button">${String(plan.status) === "10" ? "Nonaktif" : "Aktifkan"}</button>
          </div>
        </td>
      </tr>
    `).join("")
    : '<tr><td colspan="9"><p class="form-preview">Belum ada paket SaaS.</p></td></tr>';
}

function openPlanModal(plan = null) {
  byId("saas-plan-standalone-form").reset();
  byId("saas-plan-id").value = plan?.id || "";
  byId("saas-plan-modal-title").textContent = plan ? "Edit Paket SaaS Subscription" : "Tambah Paket SaaS Subscription";
  byId("saas-plan-name").value = plan?.name || "";
  byId("saas-plan-code").value = plan?.code || "";
  byId("saas-plan-price").value = plan?.price !== undefined ? plan.price : 350000;
  byId("saas-plan-max-outlets").value = plan?.maxOutlets || 10;
  byId("saas-plan-duration-days").value = plan?.durationDays !== undefined ? plan.durationDays : 365;
  byId("saas-plan-status").value = plan?.status || "10";
  byId("saas-plan-ai-login").checked = plan ? Boolean(plan.hasAiBiometrics) : true;
  byId("saas-plan-featured").checked = !!plan?.isFeatured;
  byId("saas-plan-description").value = plan?.description || "";
  openModal("saas-plan-standalone-modal");
}

document.addEventListener("DOMContentLoaded", () => {
  loadSaasPlans();

  byId("btn-add-saas-plan")?.addEventListener("click", () => openPlanModal());

  byId("saas-plan-standalone-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const payload = {
      id: byId("saas-plan-id").value,
      name: byId("saas-plan-name").value.trim(),
      code: byId("saas-plan-code").value.trim(),
      price: Number(byId("saas-plan-price").value || 0),
      maxOutlets: Number(byId("saas-plan-max-outlets").value),
      durationDays: Number(byId("saas-plan-duration-days").value || 0),
      status: byId("saas-plan-status").value,
      hasAiBiometrics: byId("saas-plan-ai-login").checked,
      isFeatured: byId("saas-plan-featured").checked,
      description: byId("saas-plan-description").value.trim()
    };
    const id = payload.id;
    showGlobalLoading(id ? `Sedang memperbarui paket SaaS "${payload.name}"...` : `Sedang menambah paket SaaS "${payload.name}"...`);
    setTimeout(() => {
      try {
        const result = id ? apiPut(`/api/saas-plan/${id}`, payload) : apiPost("/api/saas-plan", payload);
        hideGlobalLoading();
        if (result?.ok) {
          plans = result.data || plans;
          renderSaasPlanCards();
          renderSaasPlanTable();
          closeModal();
          showAlert(id ? `Paket SaaS "${payload.name}" berhasil diperbarui.` : `Paket SaaS "${payload.name}" berhasil ditambahkan.`);
        } else {
          showFeedback("saas-plan-feedback", result?.message || "Gagal menyimpan paket SaaS.");
        }
      } catch (e) {
        hideGlobalLoading();
        showFeedback("saas-plan-feedback", "Gagal menyimpan paket SaaS.");
      }
    }, 50);
  });

  document.addEventListener("click", (event) => {
    const editBtn = event.target.closest("[data-edit-plan]");
    if (editBtn) {
      const plan = plans.find((p) => String(p.id) === editBtn.dataset.editPlan);
      if (plan) openPlanModal(plan);
    }

    const toggleBtn = event.target.closest("[data-toggle-plan]");
    if (toggleBtn) {
      const plan = plans.find((p) => String(p.id) === toggleBtn.dataset.togglePlan);
      if (plan) {
        const isCurrentActive = String(plan.status) === "10";
        showGlobalLoading(`Sedang memperbarui status paket SaaS "${plan.name}"...`);
        setTimeout(() => {
          try {
            const result = isCurrentActive
              ? apiDelete(`/api/saas-plan/${plan.id}`)
              : apiPut(`/api/saas-plan/${plan.id}`, { ...plan, status: "10" });
            hideGlobalLoading();
            if (result?.ok) {
              plans = result.data || plans;
              renderSaasPlanCards();
              renderSaasPlanTable();
              showAlert(`Status paket SaaS "${plan.name}" berhasil diperbarui.`);
            } else {
              showAlert(result?.message || "Gagal memperbarui status paket SaaS.", "error");
            }
          } catch (e) {
            hideGlobalLoading();
            showAlert("Gagal memperbarui status paket SaaS.", "error");
          }
        }, 50);
      }
    }

    if (event.target.closest("[data-close-modal]") || event.target.matches("[data-app-modal]")) {
      closeModal();
    }
  });
});
