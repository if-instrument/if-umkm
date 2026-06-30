const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0
});

export const shortDate = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short"
});

export function money(value) {
  return rupiah.format(Math.round(value || 0));
}

export function formatQty(value) {
  return Number(value.toFixed(2)).toLocaleString("id-ID");
}
