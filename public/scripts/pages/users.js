import { renderLayout } from "../layout.js";
import { state, session, isSuperAdmin, activeUserTab, setActiveUserTab } from "./users/users-state.js";
import { activeRoles } from "./users/users-helpers.js";
import { loadAccessData, setApiCallbacks, refreshDataAndTables } from "./users/users-api.js";
import { renderCentralMasterGateway, setCompanyCallbacks } from "./users/users-companies.js";
import {
  openModal,
  closeModal,
  refreshTables,
  applyAccessMode,
  openOutlet,
  openRole,
  openUser,
  setModalsCallbacks
} from "./users/users-modals.js";
import { bindUsersEvents } from "./users/users-events.js";
import { canUsePermission } from "../store.js";
import { showFeedback } from "../dom.js";

// 1. Render layout and topbar
renderLayout();

if (isSuperAdmin) {
  const pageTitle = document.querySelector(".topbar h2");
  const pageEyebrow = document.querySelector(".topbar .eyebrow");
  if (pageTitle) pageTitle.textContent = "Perusahaan";
  if (pageEyebrow) pageEyebrow.textContent = "SaaS Tenant";
}

// 2. Wire module callbacks
setApiCallbacks({
  refreshTables,
  renderCentralGateway: renderCentralMasterGateway
});

setCompanyCallbacks({
  refreshDataAndTables,
  closeModal,
  openModal
});

setModalsCallbacks({
  setActiveUserTab
});

// 3. Load initial access data & populate views
loadAccessData();
refreshTables();
applyAccessMode();
setActiveUserTab(activeUserTab);

// 4. Bind event listeners
bindUsersEvents();

// 5. Onboarding automated trigger check
const setupParams = new URLSearchParams(window.location.search);
const setupAction = setupParams.get("create");
if (!isSuperAdmin && setupParams.get("onboarding") === "1") {
  if (setupAction === "outlet" && canUsePermission("outlets.manage", "create", state, session)) openOutlet();
  if (setupAction === "role" && canUsePermission("roles.manage", "create", state, session)) openRole();
  if (setupAction === "user" && canUsePermission("users.manage", "create", state, session)) {
    activeRoles().length ? openUser() : showFeedback("company-feedback", "Buat role terlebih dahulu sebelum mengundang user.");
  }
}
