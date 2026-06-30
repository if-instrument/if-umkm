export const ORDER_STATUS = {
  PENDING_CASHIER: "00",
  WAITING: "10",
  PREPARING: "20",
  READY: "30",
  COMPLETED: "90",
  CANCELLED: "99"
};

const legacyToCode = {
  pending_cashier: ORDER_STATUS.PENDING_CASHIER,
  waiting: ORDER_STATUS.WAITING,
  preparing: ORDER_STATUS.PREPARING,
  ready: ORDER_STATUS.READY,
  completed: ORDER_STATUS.COMPLETED,
  cancelled: ORDER_STATUS.CANCELLED
};

export const orderStatusLabels = {
  [ORDER_STATUS.PENDING_CASHIER]: "Menunggu Kasir",
  [ORDER_STATUS.WAITING]: "Pesanan Baru",
  [ORDER_STATUS.PREPARING]: "Diproses",
  [ORDER_STATUS.READY]: "Siap Diambil",
  [ORDER_STATUS.COMPLETED]: "Selesai",
  [ORDER_STATUS.CANCELLED]: "Dibatalkan"
};

export function orderStatusCode(status) {
  const value = String(status ?? "").trim();
  return legacyToCode[value] || value;
}

export function orderStatusIs(status, code) {
  return orderStatusCode(status) === code;
}

export function orderStatusIn(status, codes) {
  return codes.includes(orderStatusCode(status));
}

export function orderStatusClass(status) {
  return `status-${orderStatusCode(status)}`;
}

export function orderStatusLabel(status) {
  const code = orderStatusCode(status);
  return orderStatusLabels[code] || code || "-";
}

export const openOrderStatuses = [
  ORDER_STATUS.PENDING_CASHIER,
  ORDER_STATUS.WAITING,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY
];
