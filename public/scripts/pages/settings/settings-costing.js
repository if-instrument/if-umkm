import { state } from "./settings-state.js";
import { byId, setText } from "../../dom.js";

export function updateCostingPreview() {
  const costingEl = byId("costing-method");
  if (!costingEl) return;
  const descriptions = {
    average: "Average Cost menghitung HPP dari harga rata-rata tertimbang setiap pembelian.",
    fifo: "FIFO memakai lot bahan paling lama terlebih dahulu untuk estimasi HPP dan valuation.",
    standard: "Standard Cost memakai biaya standar per bahan agar margin lebih stabil untuk budgeting."
  };
  setText("costing-preview", descriptions[costingEl.value] || descriptions.average);
}

export function renderCosting() {
  if (byId("costing-method")) {
    byId("costing-method").value = state.settings?.costingMethod || "average";
  }
  updateCostingPreview();
}
