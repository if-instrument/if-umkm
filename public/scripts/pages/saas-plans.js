import { applyBrandTheme, renderLayout } from "../layout.js";
import { apiDelete, apiGet, apiPost, apiPut } from "../store.js";
import { byId, showFeedback } from "../dom.js";
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
  renderSaasPlanTable();
}

function formatRupiah(amount) {
  const num = Number(amount || 0);
  if (num <= 0) return "Gratis";
  return "Rp " + num.toLocaleString("id-ID");
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
    : '<tr><td colspan="8"><p class="form-preview">Belum ada paket SaaS.</p></td></tr>';
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
      isFeatured: byId("saas-plan-featured").checked,
      description: byId("saas-plan-description").value.trim()
    };
    const id = payload.id;
    const result = id ? apiPut(`/api/saas-plan/${id}`, payload) : apiPost("/api/saas-plan", payload);
    if (result?.ok) {
      plans = result.data || plans;
      renderSaasPlanTable();
      closeModal();
      showFeedback("saas-plan-feedback", id ? "Paket SaaS berhasil diperbarui." : "Paket SaaS baru berhasil ditambahkan.");
    } else {
      showFeedback("saas-plan-feedback", result?.message || "Gagal menyimpan paket SaaS.");
    }
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
        const result = isCurrentActive
          ? apiDelete(`/api/saas-plan/${plan.id}`)
          : apiPut(`/api/saas-plan/${plan.id}`, { ...plan, status: "10" });
        if (result?.ok) {
          plans = result.data || plans;
          renderSaasPlanTable();
        }
      }
    }

    if (event.target.closest("[data-close-modal]") || event.target.matches("[data-app-modal]")) {
      closeModal();
    }
  });
});
