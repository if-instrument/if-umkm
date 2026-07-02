import { renderLayout } from "../layout.js?v=coffee-v151";
import { apiDelete, apiGet, apiPost, apiPut, applyPermissionControls, canUsePermission, loadSession, loadState, scopedApiUrl, scopedPayload } from "../store.js?v=coffee-v151";
import { byId, showAlert, showFeedback } from "../dom.js";
import { isActiveStatus, statusLabel } from "../status-codes.js";

renderLayout();

const state = loadState();
const session = loadSession();
let customers = [];
let pagination = { page: 1, perPage: 25, total: 0, totalPages: 1 };
let page = 1;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function statusPill(status) {
  return `<span class="status-pill ${isActiveStatus(status) ? "status-ok" : "status-empty"}">${isActiveStatus(status) ? "Aktif" : statusLabel(status, "common")}</span>`;
}

function queryParams() {
  const params = new URLSearchParams({
    page: String(page),
    per_page: "25"
  });
  const search = byId("crm-search").value.trim();
  const status = byId("crm-status-filter").value;
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  return params.toString();
}

function refreshData() {
  const response = apiGet(scopedApiUrl(`/api/customer?${queryParams()}`, state, session));
  if (!response?.ok) throw new Error(response?.message || "Data customer belum dapat dimuat.");
  customers = response.data?.items || [];
  pagination = response.data?.pagination || pagination;
  render();
}

function renderSummary() {
  const active = customers.filter((item) => isActiveStatus(item.status)).length;
  const inactive = customers.filter((item) => !isActiveStatus(item.status)).length;
  const withOrder = customers.filter((item) => item.lastOrderAt).length;
  byId("crm-summary").innerHTML = [
    ["Customer", pagination.total || 0, "Total customer sesuai filter", "date-card"],
    ["Aktif", active, "Customer aktif di halaman ini", ""],
    ["Nonaktif", inactive, "Customer nonaktif di halaman ini", "warning-card"],
    ["Pernah Order", withOrder, "Customer dengan order terakhir", "revenue-card"]
  ].map(([label, value, note, className]) => `
    <article class="order-history-card ${className}">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${note}</small>
    </article>
  `).join("");
}

function renderTable() {
  byId("crm-table-caption").textContent = `Menampilkan ${customers.length} dari ${pagination.total || 0} customer.`;
  byId("crm-customer-body").innerHTML = customers.length ? customers.map((customer) => `
    <tr>
      <td><strong>${escapeHtml(customer.name)}</strong><span>${escapeHtml(customer.id)}</span></td>
      <td>${escapeHtml(customer.email)}<span>${escapeHtml(customer.phone || "-")}</span></td>
      <td>${statusPill(customer.status)}</td>
      <td>${formatDateTime(customer.lastOrderAt)}</td>
      <td>
        <div class="table-actions">
          <button class="ghost-button compact-button" data-edit-customer="${escapeHtml(customer.id)}" data-permission="crm.customers:update" type="button">Edit</button>
          <button class="ghost-button compact-button" data-toggle-customer="${escapeHtml(customer.id)}" data-permission="crm.customers:delete" type="button">${isActiveStatus(customer.status) ? "Nonaktif" : "Aktifkan"}</button>
        </div>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="5"><div class="empty-state">Belum ada customer untuk filter ini.</div></td></tr>`;
}

function renderPagination() {
  const totalPages = pagination.totalPages || 1;
  byId("crm-pagination").innerHTML = `
    <button class="ghost-button compact-button" data-crm-page="${Math.max(1, page - 1)}" ${page <= 1 ? "disabled" : ""} type="button">Sebelumnya</button>
    <span>Halaman ${page} / ${totalPages}</span>
    <button class="ghost-button compact-button" data-crm-page="${Math.min(totalPages, page + 1)}" ${page >= totalPages ? "disabled" : ""} type="button">Berikutnya</button>
  `;
}

function render() {
  renderSummary();
  renderTable();
  renderPagination();
  applyPermissionControls(document, state, session);
}

function customerById(id) {
  return customers.find((customer) => customer.id === id);
}

function openCustomer(customer = null) {
  byId("customer-id").value = customer?.id || "";
  byId("customer-name").value = customer?.name || "";
  byId("customer-email").value = customer?.email || "";
  byId("customer-phone").value = customer?.phone || "";
  byId("customer-status").value = isActiveStatus(customer?.status) ? "10" : "90";
  byId("customer-modal-title").textContent = customer ? "Edit Customer" : "Tambah Customer";
  showFeedback("customer-feedback", "");
  openCustomerModal();
}

function closeCustomer() {
  closeCustomerModal();
}

function openCustomerModal() {
  document.querySelector("[data-customer-backdrop]").hidden = false;
  byId("customer-modal").hidden = false;
}

function closeCustomerModal() {
  document.querySelector("[data-customer-backdrop]").hidden = true;
  byId("customer-modal").hidden = true;
}

function payloadFromForm() {
  return scopedPayload({
    id: byId("customer-id").value,
    name: byId("customer-name").value.trim(),
    email: byId("customer-email").value.trim().toLowerCase(),
    phone: byId("customer-phone").value.trim(),
    status: byId("customer-status").value
  }, state, session);
}

function saveCustomer(event) {
  event.preventDefault();
  const id = byId("customer-id").value;
  const action = id ? "update" : "create";
  if (!canUsePermission("crm.customers", action, state, session)) {
    showFeedback("customer-feedback", "Anda tidak punya akses menyimpan customer.");
    return;
  }

  const response = id
    ? apiPut(`/api/customer/${encodeURIComponent(id)}`, payloadFromForm())
    : apiPost("/api/customer", payloadFromForm());
  if (!response?.ok) {
    showFeedback("customer-feedback", response?.message || "Customer belum berhasil disimpan.");
    return;
  }
  closeCustomer();
  refreshData();
  showAlert("Customer tersimpan.");
}

function toggleCustomer(id) {
  if (!canUsePermission("crm.customers", "delete", state, session)) return;
  const customer = customerById(id);
  const payload = scopedPayload({ status: isActiveStatus(customer?.status) ? "90" : "10" }, state, session);
  const response = isActiveStatus(customer?.status)
    ? apiDelete(`/api/customer/${encodeURIComponent(id)}`, scopedPayload({}, state, session))
    : apiPut(`/api/customer/${encodeURIComponent(id)}`, { ...payload, ...customer, status: "10" });
  if (!response?.ok) throw new Error(response?.message || "Status customer belum berhasil diubah.");
  refreshData();
}

byId("customer-form").addEventListener("submit", saveCustomer);
byId("crm-search").addEventListener("input", () => {
  page = 1;
  refreshData();
});
byId("crm-status-filter").addEventListener("change", () => {
  page = 1;
  refreshData();
});

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-open-customer-modal]")) openCustomer();
  if (event.target.closest("[data-close-customer-modal]")) closeCustomer();

  const edit = event.target.closest("[data-edit-customer]");
  if (edit) openCustomer(customerById(edit.dataset.editCustomer));

  const toggle = event.target.closest("[data-toggle-customer]");
  if (toggle) {
    try {
      toggleCustomer(toggle.dataset.toggleCustomer);
    } catch (error) {
      showAlert(error.message, "error");
    }
  }

  const pageButton = event.target.closest("[data-crm-page]");
  if (pageButton && !pageButton.disabled) {
    page = Number(pageButton.dataset.crmPage || 1);
    refreshData();
  }
});

try {
  refreshData();
} catch (error) {
  showAlert(error.message, "error");
}
