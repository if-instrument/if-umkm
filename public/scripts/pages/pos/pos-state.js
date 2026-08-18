import { loadSession, loadState } from "../../store.js";

export const state = loadState();
export const session = loadSession();
export const focusOrderId = new URLSearchParams(window.location.search).get("order") || "";

export const posState = {
  cart: [],
  productSearch: "",
  productCategory: "all",
  paymentMethod: "",
  serviceType: "Take Away",
  packagingOverride: null,
  packagingManualLines: [],
  packagingResolution: { source: "automatic", note: "" },
  activeOpenOrderId: "",
  editingOrderId: "",
  editingPackagingManualId: "",
  modifierEditingLineId: "",
  pendingPayment: null,
  paymentIntentContext: null,
  paymentPollTimer: null,
  autoCheckoutInProgress: false,
  expandedPosOrderId: "",
  activeKeyboardInput: null
};
