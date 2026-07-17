import { state } from "../order-state.js";
import {
  byId,
  optionalById,
  companySlug,
  resolveOutletId,
  resolveOutletNumericId,
  requestJson,
  showFeedback,
  setBusy,
  persistOrderSession
} from "../order-utils.js";
import { receiptStartPage, turnToPage } from "../order-navigation.js";

function showLookupFeedback(message, error = false) {
  const el = optionalById("order-lookup-feedback");
  if (el) {
    el.textContent = message;
    el.classList.toggle("error", error);
  }
}

export async function lookupPreviousOrder() {
  const input = byId("order-status-lookup-input");
  const orderNumber = input.value.trim();
  if (!orderNumber) {
    showLookupFeedback("Masukkan nomor order terlebih dahulu.", true);
    input.focus();
    return;
  }
  setBusy(true, "Mengecek status order...");
  showLookupFeedback("");
  try {
    const query = new URLSearchParams({ q: orderNumber });
    if (companySlug()) query.set("company", companySlug());
    if (resolveOutletId()) query.set("outlet_id", resolveOutletNumericId() || resolveOutletId());
    
    const result = await requestJson(`/api/page/order/status?${query.toString()}`);
    if (!result || !result.order) {
      showLookupFeedback("Order tidak ditemukan.", true);
      return;
    }
    showLookupFeedback("");
    state.orderResult = result;
    state.lastOrderNumber = orderNumber;
    state.orderStatus = "ORDER_CREATED";
    state.spread = "receipt";
    persistOrderSession();
    import("../order-render.js").then(({ render }) => {
      render();
      turnToPage(receiptStartPage(), true);
      showFeedback("");
    });
  } catch (error) {
    showLookupFeedback(error.message || "Order tidak ditemukan.", true);
  } finally {
    setBusy(false);
  }
}
