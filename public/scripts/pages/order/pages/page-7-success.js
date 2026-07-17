import { state } from "../order-state.js";
import {
  optionalById,
  byId,
  orderSessionKey,
  showFeedback,
  persistOrderSession
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
  
  if (state.outlets && state.outlets.length > 1) {
    state.outletId = "";
    state.outletConfirmed = false;
  }

  state.spread = "cover";
  persistOrderSession();
  location.reload();
}
