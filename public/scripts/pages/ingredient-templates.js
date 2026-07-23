import { renderLayout } from "../layout.js?v=1784794256";
import { apiDelete, apiGet, apiPost, apiPut, applyPermissionControls, canUsePermission, loadSession, loadState, scopedApiUrl, scopedPayload } from "../store.js?v=1784794256";
import { byId, setText, showAlert } from "../dom.js";
import { enhanceAllDataTables } from "../datatable.js";
import { COMMON_STATUS, isInactiveStatus } from "../status-codes.js";

renderLayout();

const state = loadState();
const session = loadSession();
let templates = [];
let statusFilter = "";
let searchValue = "";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function ensureCategoryOption(category) {
  const field = byId("template-category");
  if (!category || [...field.options].some((option) => option.value === category)) return;
  field.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`);
}

function nextTemplateCode() {
  const existing = new Set(templates.map((template) => template.code).filter(Boolean));
  let index = templates.length + 1;
  let code = "";
  do {
    code = `tpl-${String(index).padStart(4, "0")}`;
    index += 1;
  } while (existing.has(code));
  return code;
}

function refreshTemplates() {
  const query = new URLSearchParams({ per_page: "100" });
  if (statusFilter) query.set("status", statusFilter);
  if (searchValue) query.set("search", searchValue);
  const response = apiGet(scopedApiUrl(`/api/ingredient-template?${query.toString()}`, state, session));
  if (!response?.ok || !Array.isArray(response?.data?.items)) {
    throw new Error(response?.message || "Template bahan belum dapat dimuat.");
  }
  templates = response.data.items;
  state.ingredientTemplates = templates;
}

function saveTemplate(url, payload, method = "post") {
  const response = method === "put"
    ? apiPut(url, scopedPayload(payload, state, session))
    : apiPost(url, scopedPayload(payload, state, session));
  if (!response?.ok) throw new Error(response?.message || "Template bahan belum berhasil disimpan.");
  refreshTemplates();
}

function deactivateTemplate(id) {
  const response = apiDelete(`/api/ingredient-template/${id}`, scopedPayload({}, state, session));
  if (!response?.ok) throw new Error(response?.message || "Template bahan belum berhasil dinonaktifkan.");
  refreshTemplates();
}

function renderTemplates() {
  byId("template-table").innerHTML = templates.length
    ? templates.map((template) => {
      const inactive = isInactiveStatus(template.status);
      return `
        <tr>
          <td>${escapeHtml(template.code || template.id)}</td>
          <td><strong>${escapeHtml(template.name)}</strong></td>
          <td>${escapeHtml(template.category || "-")}</td>
          <td>${escapeHtml(template.unit || "-")}</td>
          <td><span class="status-pill ${inactive ? "status-low" : "status-ok"}">${inactive ? "Nonaktif" : "Aktif"}</span></td>
          <td>
            <div class="row-actions">
              <button class="ghost-button compact-button" data-edit-template="${template.id}" data-permission="ingredients.template:update" type="button">Edit</button>
              <button class="ghost-button compact-button" data-toggle-template="${template.id}" data-permission="ingredients.template:delete" type="button">${inactive ? "Aktifkan" : "Nonaktifkan"}</button>
            </div>
          </td>
        </tr>
      `;
    }).join("")
    : `<tr><td colspan="6" class="empty-state">Belum ada template bahan.</td></tr>`;
  enhanceAllDataTables(byId("template-table").closest(".workspace-panel"));
  applyPermissionControls(document, state, session);
}

function openModal(template = null) {
  byId("template-form").reset();
  byId("template-id").value = template?.id || "";
  byId("template-code").value = template?.code || nextTemplateCode();
  byId("template-name").value = template?.name || "";
  ensureCategoryOption(template?.category || "Raw Material");
  byId("template-category").value = template?.category || "Raw Material";
  byId("template-unit").value = template?.unit || "";
  byId("template-status").value = template?.status || COMMON_STATUS.ACTIVE;
  byId("template-modal-title").textContent = template ? "Edit Template" : "Tambah Template";
  setText("template-feedback", "");
  setText("template-preview", template
    ? "Pastikan perubahan nama, kategori, atau satuan memang diinginkan karena recipe dan modifier memakai template ini."
    : "Gunakan template sebagai bahasa standar recipe. Stok fisik tetap dikelola per outlet.");
  document.querySelector("[data-template-backdrop]").hidden = false;
  byId("template-modal").hidden = false;
  document.body.classList.add("modal-open");
  applyPermissionControls(document, state, session);
}

function closeModal() {
  document.querySelector("[data-template-backdrop]").hidden = true;
  byId("template-modal").hidden = true;
  document.body.classList.remove("modal-open");
}

function reloadAndRender() {
  try {
    refreshTemplates();
    renderTemplates();
  } catch (error) {
    byId("template-table").innerHTML = `<tr><td colspan="6" class="empty-state">${escapeHtml(error.message)}</td></tr>`;
  }
}

byId("template-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = byId("template-id").value;
  const action = id ? "update" : "create";
  if (!canUsePermission("ingredients.template", action, state, session)) {
    setText("template-feedback", "Anda tidak punya akses untuk menyimpan template bahan.");
    return;
  }
  const payload = {
    code: byId("template-code").value.trim(),
    name: byId("template-name").value.trim(),
    category: byId("template-category").value,
    unit: byId("template-unit").value.trim(),
    status: byId("template-status").value
  };
  try {
    saveTemplate(id ? `/api/ingredient-template/${id}` : "/api/ingredient-template", payload, id ? "put" : "post");
    closeModal();
    renderTemplates();
    showAlert(`${payload.name} tersimpan sebagai template bahan.`);
  } catch (error) {
    setText("template-feedback", error.message);
  }
});

byId("template-status-filter").addEventListener("change", (event) => {
  statusFilter = event.target.value;
  reloadAndRender();
});

byId("template-search").addEventListener("input", (event) => {
  searchValue = event.target.value.trim();
  reloadAndRender();
});

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-open-template-modal]") && canUsePermission("ingredients.template", "create", state, session)) openModal();
  const editButton = event.target.closest("[data-edit-template]");
  if (editButton && canUsePermission("ingredients.template", "update", state, session)) {
    openModal(templates.find((template) => template.id === editButton.dataset.editTemplate));
  }
  const toggleButton = event.target.closest("[data-toggle-template]");
  if (toggleButton && canUsePermission("ingredients.template", "delete", state, session)) {
    const template = templates.find((item) => item.id === toggleButton.dataset.toggleTemplate);
    if (!template) return;
    try {
      if (isInactiveStatus(template.status)) saveTemplate(`/api/ingredient-template/${template.id}`, { ...template, status: COMMON_STATUS.ACTIVE }, "put");
      else deactivateTemplate(template.id);
      renderTemplates();
      showAlert(`Template ${template.name} ${isInactiveStatus(template.status) ? "diaktifkan" : "dinonaktifkan"}.`);
    } catch (error) {
      setText("template-feedback", error.message);
    }
  }
  if (event.target.closest("[data-close-template-modal]") || event.target.matches("[data-template-backdrop]")) closeModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

reloadAndRender();
