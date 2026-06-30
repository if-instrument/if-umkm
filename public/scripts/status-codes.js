export const COMMON_STATUS = {
  DRAFT: "00",
  ACTIVE: "10",
  INACTIVE: "90",
  DELETED: "99"
};

export const PAYMENT_STATUS = {
  UNPAID: "00",
  PAID: "10",
  FAILED: "20",
  EXPIRED: "30",
  CANCELLED: "99"
};

export const INVITATION_STATUS = {
  PENDING: "00",
  SENT: "10",
  ACCEPTED: "20",
  FAILED: "30",
  SUPERSEDED: "90",
  EXPIRED: "99"
};

export const CONNECTOR_STATUS = {
  NOT_CONFIGURED: "00",
  READY: "10",
  INACTIVE: "90"
};

export const RECIPE_STATUS = {
  DRAFT: "00",
  READY: "10"
};

export const EXPENSE_STATUS = {
  DRAFT: "00",
  POSTED: "10",
  VOID: "99"
};

const normalize = (status) => String(status ?? "").trim().toLowerCase();
const isCode = (status) => /^\d{2}$/.test(String(status ?? ""));

function codeFor(status, aliases, fallback) {
  const value = normalize(status);
  if (isCode(value)) return value;
  return aliases[value] || fallback;
}

export function commonStatusCode(status, fallback = COMMON_STATUS.ACTIVE) {
  return codeFor(status, {
    draft: COMMON_STATUS.DRAFT,
    pending: COMMON_STATUS.DRAFT,
    invited: COMMON_STATUS.DRAFT,
    active: COMMON_STATUS.ACTIVE,
    enabled: COMMON_STATUS.ACTIVE,
    ready: COMMON_STATUS.ACTIVE,
    inactive: COMMON_STATUS.INACTIVE,
    disabled: COMMON_STATUS.INACTIVE,
    depleted: COMMON_STATUS.INACTIVE,
    deleted: COMMON_STATUS.DELETED
  }, fallback);
}

export function paymentStatusCode(status, fallback = PAYMENT_STATUS.UNPAID) {
  return codeFor(status, {
    unpaid: PAYMENT_STATUS.UNPAID,
    pending: PAYMENT_STATUS.UNPAID,
    fallback_pending: PAYMENT_STATUS.UNPAID,
    paid: PAYMENT_STATUS.PAID,
    succeeded: PAYMENT_STATUS.PAID,
    settled: PAYMENT_STATUS.PAID,
    captured: PAYMENT_STATUS.PAID,
    failed: PAYMENT_STATUS.FAILED,
    configuration_required: PAYMENT_STATUS.FAILED,
    expired: PAYMENT_STATUS.EXPIRED,
    cancelled: PAYMENT_STATUS.CANCELLED,
    canceled: PAYMENT_STATUS.CANCELLED
  }, fallback);
}

export function connectorStatusCode(status, fallback = CONNECTOR_STATUS.NOT_CONFIGURED) {
  return codeFor(status, {
    not_configured: CONNECTOR_STATUS.NOT_CONFIGURED,
    configuration_required: CONNECTOR_STATUS.NOT_CONFIGURED,
    ready: CONNECTOR_STATUS.READY,
    active: CONNECTOR_STATUS.READY,
    inactive: CONNECTOR_STATUS.INACTIVE,
    connector_not_implemented: CONNECTOR_STATUS.INACTIVE
  }, fallback);
}

export function recipeStatusCode(status, fallback = RECIPE_STATUS.DRAFT) {
  return codeFor(status, {
    draft: RECIPE_STATUS.DRAFT,
    pending: RECIPE_STATUS.DRAFT,
    ready: RECIPE_STATUS.READY,
    active: RECIPE_STATUS.READY
  }, fallback);
}

export function expenseStatusCode(status, fallback = EXPENSE_STATUS.POSTED) {
  return codeFor(status, {
    draft: EXPENSE_STATUS.DRAFT,
    posted: EXPENSE_STATUS.POSTED,
    active: EXPENSE_STATUS.POSTED,
    void: EXPENSE_STATUS.VOID,
    cancelled: EXPENSE_STATUS.VOID
  }, fallback);
}

export function invitationStatusCode(status, fallback = INVITATION_STATUS.PENDING) {
  return codeFor(status, {
    pending: INVITATION_STATUS.PENDING,
    invited: INVITATION_STATUS.PENDING,
    sent: INVITATION_STATUS.SENT,
    accepted: INVITATION_STATUS.ACCEPTED,
    active: INVITATION_STATUS.ACCEPTED,
    send_failed: INVITATION_STATUS.FAILED,
    failed: INVITATION_STATUS.FAILED,
    superseded: INVITATION_STATUS.SUPERSEDED,
    expired: INVITATION_STATUS.EXPIRED,
    cancelled: INVITATION_STATUS.EXPIRED
  }, fallback);
}

export function isActiveStatus(status) {
  return commonStatusCode(status) === COMMON_STATUS.ACTIVE;
}

export function isInactiveStatus(status) {
  return commonStatusCode(status) === COMMON_STATUS.INACTIVE;
}

export function isPaidStatus(status) {
  return paymentStatusCode(status) === PAYMENT_STATUS.PAID;
}

export function isUnpaidStatus(status) {
  return paymentStatusCode(status) === PAYMENT_STATUS.UNPAID;
}

export function statusLabel(status, domain = "common") {
  const labels = {
    common: { "00": "Draft", "10": "Aktif", "90": "Nonaktif", "99": "Dihapus" },
    payment: { "00": "Belum Bayar", "10": "Paid", "20": "Gagal", "30": "Expired", "99": "Batal" },
    connector: { "00": "Belum dikonfigurasi", "10": "Ready", "90": "Nonaktif" },
    invitation: { "00": "Pending", "10": "Terkirim", "20": "Aktif", "30": "Gagal", "90": "Diganti", "99": "Expired" },
    recipe: { "00": "Draft", "10": "Ready" },
    expense: { "00": "Draft", "10": "Posted", "99": "Void" }
  };
  const code = {
    payment: paymentStatusCode,
    connector: connectorStatusCode,
    invitation: invitationStatusCode,
    recipe: recipeStatusCode,
    expense: expenseStatusCode
  }[domain]?.(status) || commonStatusCode(status);
  return labels[domain]?.[code] || code || "-";
}
