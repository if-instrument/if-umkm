import { state } from "../order-state.js";
import {
  optionalById,
  byId,
  orderSessionKey,
  showFeedback
} from "../order-utils.js";
import { forceTurnToElement, coverStartPage } from "../order-navigation.js";
import { syncSelectedMemberFields } from "./page-5-customer-detail.js";

export function resetOrder() {
  if (state.orderResult?.order?.orderNumber) {
    state.lastOrderNumber = state.orderResult.order.orderNumber;
  }
  state.cart = [];
  state.orderResult = null;
  state.orderStatus = "NEW_ORDER";
  state.cartConfirmed = false;
  state.selectedMemberId = "";
  state.categoryId = "all";
  if (optionalById("order-search")) byId("order-search").value = "";
  optionalById("order-customer-form")?.reset();
  syncSelectedMemberFields();

  state.spread = "cover";
  import("../order-render.js").then(({ render }) => {
    render();
    forceTurnToElement(".public-cover-page:not(.public-back-cover-page)", coverStartPage());
    showFeedback("");
  });
}
