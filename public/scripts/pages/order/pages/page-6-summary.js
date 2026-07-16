import { state } from "../order-state.js";
import {
  byId,
  companySlug,
  resolveOutletId,
  resolveOutletNumericId,
  requestJson,
  showFeedback,
  setBusy
} from "../order-utils.js";
import { receiptStartPage, turnToPage } from "../order-navigation.js";

export async function lookupPreviousOrder() {
  const input = byId("order-status-lookup-input");
  const orderNumber = input.value.trim();
  if (!orderNumber) {
    showFeedback("Masukkan nomor order terlebih dahulu.", true);
    input.focus();
    return;
  }
  setBusy(true, "Mengecek status order...");
  showFeedback("");
  try {
    const query = new URLSearchParams({ q: orderNumber });
    if (companySlug()) query.set("company", companySlug());
    if (resolveOutletId()) query.set("outlet_id", resolveOutletNumericId() || resolveOutletId());
    
    const result = await requestJson(`/api/page/order/status?${query.toString()}`);
    state.orderResult = result;
    state.spread = "receipt";
    import("../order-render.js").then(({ render }) => {
      render();
      turnToPage(receiptStartPage(), true);
      showFeedback("");
    });
  } catch (error) {
    showFeedback(error.message, true);
  } finally {
    setBusy(false);
  }
}
