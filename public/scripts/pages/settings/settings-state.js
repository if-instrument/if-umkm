import { loadSession, loadState } from "../../store.js";

export let state = loadState();
export const session = loadSession();
export const requestedSettingTab = new URLSearchParams(window.location.search).get("tab");
export let activeSettingTab = ["company", "outlet", "costing", "tables", "payment", "packaging", "book-content"].includes(requestedSettingTab) ? requestedSettingTab : "company";
export let printerCache = [];
export let printerDropdownMode = "browse";

export function setActiveSettingTabState(tab) {
  activeSettingTab = tab;
}

export function setPrinterCache(cache) {
  printerCache = cache;
}

export function setPrinterDropdownMode(mode) {
  printerDropdownMode = mode;
}

export const settingTabPermissions = {
  company: ["company.branding", "read"],
  outlet: ["settings.outlet", "read"],
  costing: ["settings.costing", "read"],
  tables: ["settings.tables", "read"],
  payment: ["settings.payment", "read"],
  packaging: ["settings.packaging", "read"],
  "book-content": ["settings.outlet", "read"]
};

export function defaultBookContent() {
  return {
    coverSubtitle: "UMKM Solution",
    coverDescription: "Pilih outlet dan mulai pemesanan dari buku menu digital.",
    outletTitle: "Pilih Outlet",
    serviceTitle: "Pilih Mode",
    serviceDescription: "Pilih tipe pembelian yang aktif di outlet ini.",
    tableTitle: "Table Layout",
    tableDescription: "Pilih meja untuk dine in.",
    menuTitle: "Pilih Menu",
    menuDescription: "Pilih kategori, cari menu, lalu tambahkan produk ke cart.",
    cartTitle: "Cart",
    cartDescription: "Cek detail pesanan sebelum isi data customer.",
    customerTitle: "Customer & Payment",
    customerDescription: "Data receipt dan metode pembayaran.",
    receiptTitle: "Receipt Detail",
    receiptDescription: "Ringkasan akhir dan status pesanan.",
    backSubtitle: "Terima kasih",
    backDescription: "Pesanan Anda sudah diterima outlet. Simpan nomor order untuk konfirmasi.",
    backButton: "Kembali ke Cover Depan"
  };
}
