import { state, session } from "./pos-state.js";
import { ORDER_STATUS, PAYMENT_STATUS, isPaidStatus, isUnpaidStatus, orderStatusCode, paymentStatusCode, statusLabel } from "../../status-codes.js";
import { pageDateValue } from "../../page-engine.js";
import { canUsePermission } from "../../store.js";

export function isPaymentPaid(status) {
  return isPaidStatus(status);
}

export function isOrderUnpaid(order) {
  return isUnpaidStatus(order?.paymentStatus);
}

export function isPaymentFailedFinal(status) {
  return [PAYMENT_STATUS.FAILED, PAYMENT_STATUS.CANCELLED, PAYMENT_STATUS.EXPIRED].includes(paymentStatusCode(status));
}

export function qrImageUrl(payload, size = 320) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=12&data=${encodeURIComponent(payload || "")}`;
}

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

export function looksLikeQrisPayload(payload = "") {
  const value = String(payload || "").trim();
  return value.startsWith("000201") && value.includes("5802ID") && value.length >= 80;
}

export function activeOutletName() {
  return state.settings?.outletName || state.settings?.companyName || "Outlet";
}

export function activeOutletCode() {
  return state.settings?.outletCode || "";
}

export function activeOutletAddress() {
  return state.settings?.outletAddress || "";
}

export function activeOutletLabel() {
  return activeOutletCode() ? `${activeOutletName()} (${activeOutletCode()})` : activeOutletName();
}

export function activeCompanyLogo() {
  return state.settings?.companyLogoUrl || "/assets/if-instrument-logo.jpg";
}

export const queueStatuses = {
  [ORDER_STATUS.FULFILLMENT]: { label: "Menunggu Pemenuhan", owner: "Inventory", next: ORDER_STATUS.WAITING, nextLabel: "Stok Sudah Siap" },
  [ORDER_STATUS.WAITING]: { label: "Pesanan Baru", owner: "Kitchen", next: ORDER_STATUS.PREPARING, nextLabel: "Mulai Proses" },
  [ORDER_STATUS.PREPARING]: { label: "Sedang Diproses", owner: "Kitchen", next: ORDER_STATUS.READY, nextLabel: "Tandai Siap" },
  [ORDER_STATUS.READY]: { label: "Siap Diambil", owner: "Kasir", next: ORDER_STATUS.COMPLETED, nextLabel: "Pesanan Diambil" }
};

export const approvalStatus = { label: "Menunggu Approve", owner: "Kasir", nextLabel: "Approve & Bayar" };

export const serviceChannelOptions = [
  { key: "dineIn", label: "Dine In", prefix: "DI" },
  { key: "takeAway", label: "Take Away", prefix: "TA" },
  { key: "delivery", label: "Delivery", prefix: "DL" }
];

export function combinePackagingLines(lines) {
  const combined = new Map();
  lines.forEach((line) => {
    if (!line?.ingredientId || Number(line.qty || 0) <= 0) return;
    const key = `${line.ingredientId}:${Number(line.price) || 0}:${line.treatment || ""}:${line.reason || ""}`;
    const current = combined.get(key) || { ...line, qty: 0 };
    current.qty += Number(line.qty) || 0;
    combined.set(key, current);
  });
  return [...combined.values()];
}

export function canActOnOrderStatus(status) {
  const code = orderStatusCode(status);
  if (code === ORDER_STATUS.PENDING_CASHIER) return canUsePermission("queue.cashier", "update", state, session);
  if (code === ORDER_STATUS.FULFILLMENT) return canUsePermission("queue.cashier", "update", state, session) || canUsePermission("queue.kitchen", "update", state, session);
  if ([ORDER_STATUS.WAITING, ORDER_STATUS.PREPARING].includes(code)) return canUsePermission("queue.kitchen", "update", state, session);
  if (code === ORDER_STATUS.READY) return canUsePermission("queue.cashier", "update", state, session);
  return false;
}

export function isToday(value) {
  return new Date(value).toDateString() === new Date().toDateString();
}

export function todayDateValue(date = new Date()) {
  return pageDateValue(date);
}

export function queueElapsed(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Baru saja";
  if (minutes < 60) return `${minutes} menit`;
  return `${Math.floor(minutes / 60)}j ${minutes % 60}m`;
}

export function formatOrderDateTime(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function orderTimelineMarkup(order) {
  const rows = Array.isArray(order?.timeline) ? order.timeline : [];
  if (!rows.length) return "";
  return `
    <div class="order-status-timeline">
      <strong>Timeline Status</strong>
      ${rows.map((row) => `
        <div>
          <span>${formatOrderDateTime(row.createdAt)}</span>
          <p><b>${statusLabel(row.status, "order")}</b>${row.paymentStatus ? ` · ${statusLabel(row.paymentStatus, "payment")}` : ""}</p>
          <small>${escapeHtml(row.actorName || "System")}${row.note ? ` - ${escapeHtml(row.note)}` : ""}</small>
        </div>
      `).join("")}
    </div>
  `;
}

export function paymentProofMarkup(order) {
  if (!order?.paymentProofUrl) return "";
  const isImage = /\.(png|jpe?g|webp)$/i.test(order.paymentProofUrl);
  return `
    <div class="payment-proof-panel">
      <div>
        <span>Bukti Bayar Customer</span>
        <strong>${escapeHtml(order.paymentProofNote || order.paymentMethod || "Bukti bayar")}</strong>
      </div>
      ${isImage ? `<a href="${escapeHtml(order.paymentProofUrl)}" target="_blank" rel="noopener"><img src="${escapeHtml(order.paymentProofUrl)}" alt="Bukti bayar customer" /></a>` : `<a class="ghost-button compact-button" href="${escapeHtml(order.paymentProofUrl)}" target="_blank" rel="noopener">Buka Bukti Bayar</a>`}
    </div>
  `;
}

export function queueTime(order) {
  return new Date(order.statusUpdatedAt || order.createdAt).getTime();
}

export function canEditOrder(order) {
  return [ORDER_STATUS.PENDING_CASHIER, ORDER_STATUS.WAITING].includes(orderStatusCode(order.status)) && isOrderUnpaid(order);
}

export function orderItemCount(order) {
  return (order.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
}

export function isAssignedPayLater(serviceType) {
  return serviceType === "Dine In" && state.settings.tableServiceMode === "assigned_pay_later";
}

export function isFreeSeatingDineIn(serviceType) {
  return serviceType === "Dine In" && state.settings.tableServiceMode === "free_seating_pay_first";
}

export function usesNameCodeField(serviceType) {
  return serviceType === "Take Away" || serviceType === "Delivery" || isFreeSeatingDineIn(serviceType);
}

export function needsPackaging(serviceType) {
  return serviceType === "Take Away" || serviceType === "Delivery";
}

export function isPackagingIngredient(item) {
  return String(item?.category || item?.templateCategory || "").toLowerCase() === "packaging";
}

export function orderLevelPackagingIngredientIds() {
  return new Set((state.settings.packagingRules || [])
    .filter((rule) => String(rule.status || "").toLowerCase() !== "inactive")
    .flatMap((rule) => [...(rule.items || []), ...(rule.fallbackItems || [])])
    .map((item) => item.ingredientId)
    .filter(Boolean));
}

export function isOrderLevelPackagingIngredient(item) {
  return isPackagingIngredient(item) && orderLevelPackagingIngredientIds().has(item?.id);
}

export function automaticOrderCode(serviceType) {
  const option = serviceChannelOptions.find((item) => item.label === serviceType) || serviceChannelOptions[1];
  const count = (state.transactions || []).filter((order) => order.serviceType === serviceType && isToday(order.createdAt)).length + 1;
  return `${option.prefix}-${String(count).padStart(3, "0")}`;
}

export function sameModifierSet(first = [], second = []) {
  return first.length === second.length && [...first].sort().every((id, index) => id === [...second].sort()[index]);
}
