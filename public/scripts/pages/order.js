import { byId, loadOrderData } from "./order/order-utils.js";
import { bookState } from "./order/order-state.js";
import { resizeFlipbook } from "./order/order-navigation.js";
import {
  bindDynamicFieldListeners,
  bindBookSwipe,
  registerGlobalClickDispatcher
} from "./order/order-events.js";

// Resize handler
window.addEventListener("resize", resizeFlipbook);

// Save template
bookState.pristineBookTemplate = byId("order-flipbook").innerHTML;

// Bind listeners
bindDynamicFieldListeners();
bindBookSwipe();
registerGlobalClickDispatcher();

// Bootstrap app
loadOrderData();
