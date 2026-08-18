import { renderLayout } from "../layout.js";
import { setApiCallbacks, refreshSettingsData } from "./settings/settings-api.js";
import { renderSettings, openModal, closeModal } from "./settings/settings-modals.js";
import { setPaymentCallbacks, setQrisImage } from "./settings/settings-payments.js";
import { setTablesCallbacks } from "./settings/settings-tables.js";
import { setPackagingCallbacks } from "./settings/settings-packaging.js";
import { bindSettingsEvents } from "./settings/settings-events.js";

// 1. Render layout & topbar
renderLayout();

// 2. Wire submodule callbacks
setApiCallbacks({
  renderSettings,
  setQrisImage
});

setPaymentCallbacks({
  renderSettings,
  openModal,
  closeModal
});

setTablesCallbacks({
  renderSettings,
  openModal,
  closeModal
});

setPackagingCallbacks({
  renderSettings,
  openModal,
  closeModal
});

// 3. Load initial settings and render views
refreshSettingsData();

// 4. Bind event listeners
bindSettingsEvents();
