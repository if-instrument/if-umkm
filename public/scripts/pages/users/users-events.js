import { state, session, isSuperAdmin, setActiveUserTab } from "./users-state.js";
import { activeRoles, activeOutlets, roleById, selectedUserOutletIds, slugify } from "./users-helpers.js";
import { postAccess, putAccess, deleteAccess, uploadLogo, refreshDataAndTables } from "./users-api.js";
import { readPermissionMatrix, legacyPermissionsFromMatrix, updatePermissionPreview } from "./users-matrix.js";
import {
  openModal,
  closeModal,
  refreshTables,
  openCompany,
  openRole,
  openUser,
  openOutlet,
  applySelectedPlanDefaults,
  updateAccessPreview
} from "./users-modals.js";
import {
  openApprovalModal,
  openRenewalModal,
  updateRenewalPlanDetails,
  openSubscriptionAuditModal
} from "./users-companies.js";
import { byId, showAlert, showFeedback } from "../../dom.js";
import { COMMON_STATUS, INVITATION_STATUS, isInactiveStatus } from "../../status-codes.js";
import { canUsePermission, showGlobalLoading, hideGlobalLoading } from "../../store.js";

export function bindUsersEvents() {
  // Tab click switching
  document.addEventListener("click", (event) => {
    const tabButton = event.target.closest("[data-user-tab]");
    if (tabButton) {
      setActiveUserTab(tabButton.dataset.userTab);
      refreshTables();
    }

    if (event.target.closest("[data-open-company-modal]") && canUsePermission("admin.companies", "create", state, session)) openCompany();
    if (!isSuperAdmin && event.target.closest("[data-open-role-modal]") && canUsePermission("roles.manage", "create", state, session)) openRole();
    if (!isSuperAdmin && event.target.closest("[data-open-user-modal]") && canUsePermission("users.manage", "create", state, session)) {
      activeRoles().length ? openUser() : showFeedback("company-feedback", "Buat role aktif terlebih dahulu sebelum menambahkan user.");
    }
    if (!isSuperAdmin && event.target.closest("[data-open-outlet-modal]") && canUsePermission("outlets.manage", "create", state, session)) openOutlet();

    const editCompany = event.target.closest("[data-edit-company]");
    if (editCompany && canUsePermission("admin.companies", "update", state, session)) {
      openCompany((state.companies || []).find((company) => company.id === editCompany.dataset.editCompany));
    }

    const selectCompany = event.target.closest("[data-select-company]");
    if (selectCompany && !isSuperAdmin) {
      state.activeCompanyId = selectCompany.dataset.selectCompany;
      refreshTables();
    }

    const toggleCompany = event.target.closest("[data-toggle-company]");
    if (toggleCompany && canUsePermission("admin.companies", "delete", state, session)) {
      const company = (state.companies || []).find((item) => item.id === toggleCompany.dataset.toggleCompany);
      if (company) {
        const nextStatus = isInactiveStatus(company.status) ? COMMON_STATUS.ACTIVE : "inactive";
        showGlobalLoading(`Sedang mengubah status perusahaan "${company.name}"...`);
        setTimeout(() => {
          const res = nextStatus === COMMON_STATUS.ACTIVE
            ? putAccess(`/api/company/${company.id}`, { ...company, status: COMMON_STATUS.ACTIVE })
            : deleteAccess(`/api/company/${company.id}`);
          hideGlobalLoading();
          if (res) {
            showAlert(`Status perusahaan "${company.name}" berhasil diperbarui.`);
            refreshDataAndTables();
          }
        }, 50);
      }
    }

    const approveCompany = event.target.closest("[data-approve-company]");
    if (approveCompany && isSuperAdmin) {
      const id = approveCompany.dataset.approveCompany;
      const company = (state.companies || []).find((item) => item.id === id);
      if (company) openApprovalModal(company);
    }

    const rejectCompany = event.target.closest("[data-reject-company]");
    if (rejectCompany && isSuperAdmin) {
      const id = rejectCompany.dataset.rejectCompany;
      const company = (state.companies || []).find((item) => item.id === id);
      const notes = prompt(`Masukkan alasan penolakan pendaftaran perusahaan "${company?.name || id}":`);
      if (notes !== null) {
        showGlobalLoading(`Sedang memproses penolakan pendaftaran perusahaan "${company?.name || id}"...`);
        setTimeout(() => {
          const res = postAccess(`/api/company/${id}/reject`, { notes });
          hideGlobalLoading();
          if (res && (res.ok || res.data?.ok)) {
            showAlert(res.message || res.data?.message || `Pendaftaran perusahaan "${company?.name || id}" telah ditolak.`);
            refreshDataAndTables();
          } else {
            showFeedback("company-feedback", res?.message || res?.data?.message || "Gagal menolak pendaftaran perusahaan.");
          }
        }, 50);
      }
    }

    const resendRejectionBtn = event.target.closest("[data-resend-rejection-email]");
    if (resendRejectionBtn) {
      const id = resendRejectionBtn.dataset.resendRejectionEmail;
      resendRejectionBtn.disabled = true;
      resendRejectionBtn.textContent = "⏳ Mengirim...";
      showGlobalLoading("Sedang mengirim ulang email penolakan & link perbaikan...");
      setTimeout(() => {
        try {
          const res = postAccess(`/api/company/${id}/resend-rejection`, {});
          hideGlobalLoading();
          if (res && (res.ok || res.data?.ok)) {
            showAlert(res.message || res.data?.message || "Email penolakan & link perbaikan berhasil dikirim ulang.");
            refreshDataAndTables();
          } else {
            showAlert(res?.message || "Gagal mengirim ulang email penolakan.", "error");
          }
        } catch (e) {
          hideGlobalLoading();
          showAlert("Gagal mengirim ulang email penolakan.", "error");
        } finally {
          resendRejectionBtn.disabled = false;
          resendRejectionBtn.textContent = "📧 Kirim Ulang Link Perbaikan";
        }
      }, 50);
    }

    const renewCompany = event.target.closest("[data-renew-company]");
    if (renewCompany && isSuperAdmin) {
      const id = renewCompany.dataset.renewCompany;
      const company = (state.companies || []).find((item) => item.id === id);
      if (company) openRenewalModal(company);
    }

    const auditBtn = event.target.closest("[data-audit-company]");
    if (auditBtn && isSuperAdmin) {
      const companyId = auditBtn.dataset.auditCompany;
      openSubscriptionAuditModal(companyId);
    }

    const resendCompanyInvite = event.target.closest("[data-resend-company-invite]");
    if (resendCompanyInvite && canUsePermission("admin.companies", "update", state, session)) {
      showGlobalLoading("Sedang mengirim ulang email undangan admin perusahaan...");
      setTimeout(() => {
        const result = postAccess(`/api/company/${resendCompanyInvite.dataset.resendCompanyInvite}/invite-admin`, {});
        hideGlobalLoading();
        if (result?.ok && (String(result.data?.status) === INVITATION_STATUS.SENT || result.data?.status === "sent")) {
          showAlert("Email undangan admin perusahaan dikirim ulang.");
          refreshDataAndTables();
        } else {
          showFeedback("company-feedback", result?.data?.message || result?.message || "Undangan gagal dikirim ulang.");
        }
      }, 50);
    }

    const editRole = event.target.closest("[data-edit-role]");
    if (editRole && !isSuperAdmin && canUsePermission("roles.manage", "update", state, session)) {
      openRole((state.companyRoles || []).find((role) => role.id === editRole.dataset.editRole));
    }

    const toggleRole = event.target.closest("[data-toggle-role]");
    if (toggleRole && !isSuperAdmin && canUsePermission("roles.manage", "delete", state, session)) {
      const role = (state.companyRoles || []).find((item) => item.id === toggleRole.dataset.toggleRole);
      if (role) {
        showGlobalLoading(`Sedang mengubah status role "${role.name}"...`);
        setTimeout(() => {
          const res = isInactiveStatus(role.status) ? putAccess(`/api/role/${role.id}`, { ...role, status: COMMON_STATUS.ACTIVE }) : deleteAccess(`/api/role/${role.id}`);
          hideGlobalLoading();
          if (res) {
            showAlert(`Status role "${role.name}" berhasil diperbarui.`);
            refreshDataAndTables();
          }
        }, 50);
      }
    }

    const editUser = event.target.closest("[data-edit-user]");
    if (editUser && !isSuperAdmin && canUsePermission("users.manage", "update", state, session)) {
      openUser((state.users || []).find((user) => user.id === editUser.dataset.editUser));
    }

    const toggleUser = event.target.closest("[data-toggle-user]");
    if (toggleUser && !isSuperAdmin && canUsePermission("users.manage", "delete", state, session)) {
      const user = (state.users || []).find((item) => item.id === toggleUser.dataset.toggleUser);
      if (user) {
        showGlobalLoading(`Sedang mengubah status user "${user.name}"...`);
        setTimeout(() => {
          const res = isInactiveStatus(user.status) ? putAccess(`/api/user/${user.id}`, { ...user, status: COMMON_STATUS.ACTIVE }) : deleteAccess(`/api/user/${user.id}`);
          hideGlobalLoading();
          if (res) {
            showAlert(`Status user "${user.name}" berhasil diperbarui.`);
            refreshDataAndTables();
          }
        }, 50);
      }
    }

    const resendUserInvite = event.target.closest("[data-resend-user-invite]");
    if (resendUserInvite && !isSuperAdmin && canUsePermission("users.manage", "create", state, session)) {
      const numericCompanyId = state.activeCompanyId === "company-main" ? 1 : String(state.activeCompanyId || "").replace("company-", "");
      showGlobalLoading("Sedang mengirim ulang email aktivasi user...");
      setTimeout(() => {
        const result = postAccess(`/api/user/${resendUserInvite.dataset.resendUserInvite}/invite`, { company_id: Number(numericCompanyId) || 1 });
        hideGlobalLoading();
        if (result?.ok && (String(result.data?.status) === INVITATION_STATUS.SENT || result.data?.status === "sent")) {
          showAlert("Email undangan user dikirim ulang.");
          refreshDataAndTables();
        } else {
          showFeedback("company-feedback", result?.data?.message || result?.message || "Undangan gagal dikirim ulang.");
        }
      }, 50);
    }

    const editOutlet = event.target.closest("[data-edit-outlet]");
    if (editOutlet && !isSuperAdmin && canUsePermission("outlets.manage", "update", state, session)) {
      openOutlet((state.outlets || []).find((outlet) => outlet.id === editOutlet.dataset.editOutlet));
    }

    const toggleOutlet = event.target.closest("[data-toggle-outlet]");
    if (toggleOutlet && !isSuperAdmin && canUsePermission("outlets.manage", "delete", state, session)) {
      const outlet = (state.outlets || []).find((item) => item.id === toggleOutlet.dataset.toggleOutlet);
      if (outlet) {
        showGlobalLoading(`Sedang mengubah status outlet "${outlet.name}"...`);
        setTimeout(() => {
          const res = isInactiveStatus(outlet.status) ? putAccess(`/api/outlet/${outlet.id}`, { ...outlet, status: COMMON_STATUS.ACTIVE }) : deleteAccess(`/api/outlet/${outlet.id}`);
          hideGlobalLoading();
          if (res) {
            showAlert(`Status outlet "${outlet.name}" berhasil diperbarui.`);
            refreshDataAndTables();
          }
        }, 50);
      }
    }

    if (event.target.closest("[data-close-modal]") || event.target.matches("[data-modal-backdrop]")) closeModal();
  });

  // Tenant form submission
  byId("tenant-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!canUsePermission("admin.companies", byId("tenant-id").value ? "update" : "create", state, session)) {
      showFeedback("company-feedback", "Anda tidak punya akses untuk menyimpan perusahaan.");
      return;
    }
    const payload = {
      id: byId("tenant-id").value,
      name: byId("tenant-name").value.trim(),
      routeSlug: slugify(byId("tenant-route-slug").value || byId("tenant-name").value),
      subscriptionPlan: byId("tenant-subscription-plan").value,
      maxOutlets: Number(byId("tenant-max-outlets").value || 5),
      expiresAt: byId("tenant-expires-at").value || "",
      aiEnableFaceLogin: byId("tenant-ai-face-login") ? (byId("tenant-ai-face-login").type === "checkbox" ? byId("tenant-ai-face-login").checked : byId("tenant-ai-face-login").value === "1") : true,
      aiEnableFingerprint: byId("tenant-ai-fingerprint") ? (byId("tenant-ai-fingerprint").type === "checkbox" ? byId("tenant-ai-fingerprint").checked : byId("tenant-ai-fingerprint").value === "1") : true,
      status: byId("tenant-status").value,
      adminName: byId("tenant-admin-name").value.trim(),
      adminEmail: byId("tenant-admin-email").value.trim(),
      logoUrl: byId("tenant-logo-url").value.trim(),
      themeColor: byId("tenant-theme-color").value
    };
    const id = payload.id;
    showGlobalLoading(id ? `Sedang memperbarui data perusahaan "${payload.name}"...` : `Sedang membuat perusahaan "${payload.name}" & provisi database...`);
    setTimeout(() => {
      try {
        const result = id ? putAccess(`/api/company/${id}`, payload) : postAccess("/api/company", payload);
        hideGlobalLoading();
        if (result) {
          closeModal();
          refreshDataAndTables();
          const invitation = result.data?.invitation;
          showAlert(id
            ? `Perusahaan "${payload.name}" berhasil diperbarui.`
            : (String(invitation?.status) === INVITATION_STATUS.SENT || invitation?.status === "sent")
              ? `Perusahaan "${payload.name}" dibuat dan email aktivasi admin telah dikirim.`
              : invitation?.message || `Perusahaan "${payload.name}" dibuat, tetapi email aktivasi perlu dikirim ulang.`);
        }
      } catch (e) {
        hideGlobalLoading();
        showFeedback("company-feedback", "Gagal menyimpan data perusahaan.");
      }
    }, 50);
  });

  // Role form submission
  byId("role-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!canUsePermission("roles.manage", byId("role-id").value ? "update" : "create", state, session)) {
      showFeedback("company-feedback", "Anda tidak punya akses untuk menyimpan role.");
      return;
    }
    const permissionMatrix = readPermissionMatrix();
    const permissions = legacyPermissionsFromMatrix(permissionMatrix);
    const payload = {
      id: byId("role-id").value,
      companyId: state.activeCompanyId,
      name: byId("role-name").value.trim(),
      outletScope: byId("role-outlet-scope").value,
      status: byId("role-status").value,
      responsibility: byId("role-responsibility").value.trim(),
      permissions,
      permissionMatrix
    };
    const id = payload.id;
    showGlobalLoading(`Sedang menyimpan role "${payload.name}"...`);
    setTimeout(() => {
      try {
        const result = id ? putAccess(`/api/role/${id}`, payload) : postAccess("/api/role", payload);
        hideGlobalLoading();
        if (result) {
          closeModal();
          refreshDataAndTables();
          showAlert(`Role "${payload.name}" tersimpan ke database.`);
        }
      } catch (e) {
        hideGlobalLoading();
        showFeedback("company-feedback", "Gagal menyimpan role.");
      }
    }, 50);
  });

  // User form submission
  byId("user-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!canUsePermission("users.manage", byId("user-id").value ? "update" : "create", state, session)) {
      showFeedback("company-feedback", "Anda tidak punya akses untuk menyimpan user.");
      return;
    }
    const role = roleById(byId("user-role").value);
    const allOutlets = role?.outletScope === "all";
    const payload = {
      id: byId("user-id").value,
      companyId: state.activeCompanyId,
      name: byId("user-name").value.trim(),
      email: byId("user-email").value.trim(),
      role: role?.name || "",
      roleId: role?.id || "",
      status: byId("user-status").value,
      outletScope: allOutlets ? "all" : "selected",
      canViewAllOutlets: allOutlets,
      outletIds: allOutlets ? [] : selectedUserOutletIds()
    };
    if (!payload.outletIds.length && !allOutlets && activeOutlets()[0]) payload.outletIds = [activeOutlets()[0].id];
    const id = payload.id;
    showGlobalLoading(`Sedang menyimpan data user "${payload.name}"...`);
    setTimeout(() => {
      try {
        const result = id ? putAccess(`/api/user/${id}`, payload) : postAccess("/api/user", payload);
        hideGlobalLoading();
        if (result) {
          closeModal();
          refreshDataAndTables();
          const invitation = result.data?.invitation;
          showAlert(id
            ? `User "${payload.name}" berhasil diperbarui.`
            : (String(invitation?.status) === INVITATION_STATUS.SENT || invitation?.status === "sent")
              ? `User "${payload.name}" dibuat dan email aktivasi telah dikirim.`
              : invitation?.message || `User "${payload.name}" dibuat, tetapi email aktivasi perlu dikirim ulang.`);
        }
      } catch (e) {
        hideGlobalLoading();
        showFeedback("company-feedback", "Gagal menyimpan data user.");
      }
    }, 50);
  });

  // Outlet form submission
  byId("outlet-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!canUsePermission("outlets.manage", byId("outlet-id").value ? "update" : "create", state, session)) {
      showFeedback("company-feedback", "Anda tidak punya akses untuk menyimpan outlet.");
      return;
    }
    const payload = { id: byId("outlet-id").value, companyId: state.activeCompanyId, code: byId("outlet-code").value.trim(), name: byId("outlet-name").value.trim(), city: byId("outlet-city").value.trim(), status: byId("outlet-status").value };
    const id = payload.id;
    showGlobalLoading(`Sedang menyimpan outlet "${payload.name}"...`);
    setTimeout(() => {
      try {
        const result = id ? putAccess(`/api/outlet/${id}`, payload) : postAccess("/api/outlet", payload);
        hideGlobalLoading();
        if (result) {
          closeModal();
          refreshDataAndTables();
          showAlert(`Outlet "${payload.name}" tersimpan ke database.`);
        }
      } catch (e) {
        hideGlobalLoading();
        showFeedback("company-feedback", "Gagal menyimpan data outlet.");
      }
    }, 50);
  });

  // Matrix permission checkbox change handler
  document.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-permission-module]");
    if (!checkbox) return;
    const moduleKey = checkbox.dataset.permissionModule;
    const action = checkbox.dataset.permissionAction;
    const rowInputs = [...document.querySelectorAll(`[data-permission-module="${moduleKey}"]`)];
    const readInput = rowInputs.find((input) => input.dataset.permissionAction === "read");
    if (checkbox.checked && action !== "read" && readInput) {
      readInput.checked = true;
    }
    if (!checkbox.checked && action === "read") {
      rowInputs.forEach((input) => { input.checked = false; });
    }
    updatePermissionPreview();
  });

  // Plan selection listeners
  byId("tenant-subscription-plan")?.addEventListener("change", (e) => {
    applySelectedPlanDefaults(e.target.value);
  });

  byId("tenant-name")?.addEventListener("input", () => {
    if (!byId("tenant-id").value && !byId("tenant-route-slug").value.trim()) {
      byId("tenant-route-slug").value = slugify(byId("tenant-name").value);
    }
  });

  byId("tenant-logo-file")?.addEventListener("change", (event) => {
    uploadLogo(event.target.files?.[0], "tenant-logo-url", "tenant-logo-preview");
  });

  ["user-role", "user-all-outlets"].forEach((id) => {
    byId(id)?.addEventListener("input", updateAccessPreview);
    byId(id)?.addEventListener("change", updateAccessPreview);
  });

  document.addEventListener("change", (event) => {
    if (event.target.closest("[data-user-outlet]")) updateAccessPreview();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
}
