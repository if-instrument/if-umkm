import { apiPost, apiPut, scopedPayload } from "../../store.js";
import { applyPageBootstrap, loadPageBootstrap } from "../../page-engine.js";
import { showAlert } from "../../dom.js";
import { state, session } from "./pos-state.js";
import { todayDateValue } from "./pos-helpers.js";

export function applySalesData(data) {
  if (!data) return;
  applyPageBootstrap(state, data, [
    "settings",
    "categories",
    "products",
    "modifiers",
    "ingredients",
    "stockMovements",
    "transactions"
  ]);
}

export function refreshSales() {
  const bootstrap = loadPageBootstrap("pos", state, session, {
    date: todayDateValue(),
    per_page: 75
  });
  if (bootstrap?.ok && bootstrap.data) {
    applySalesData(bootstrap.data);
    return;
  }
  showAlert(bootstrap?.message || "Data POS belum bisa dimuat dari page controller.", "error");
}

export function postSales(url, payload) {
  const response = apiPost(url, scopedPayload(payload, state, session));
  if (!response?.ok) throw new Error(response?.message || "Aksi sales belum berhasil disimpan.");
  refreshSales();
  return response.data;
}

export function putSales(url, payload) {
  const response = apiPut(url, scopedPayload(payload, state, session));
  if (!response?.ok) throw new Error(response?.message || "Aksi sales belum berhasil disimpan.");
  refreshSales();
  return response.data;
}
