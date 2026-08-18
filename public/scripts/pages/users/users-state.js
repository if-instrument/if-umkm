import { loadSession, loadState } from "../../store.js";

export let state = loadState();
export const session = loadSession();
export const isSuperAdmin = session?.authType === "super_admin";

const setupParams = new URLSearchParams(window.location.search);
export let activeUserTab = ["users", "roles", "outlets"].includes(setupParams.get("tab")) ? setupParams.get("tab") : "users";

export function setActiveUserTab(tab) {
  activeUserTab = tab;
}

export const crudActions = [
  { key: "create", label: "C" },
  { key: "read", label: "R" },
  { key: "update", label: "U" },
  { key: "delete", label: "D" }
];

export const permissionModules = [
  { key: "dashboard.overview", label: "Dashboard Overview", group: "Dashboard", legacy: "operations", actions: ["read"], aliases: ["dashboard"] },
  { key: "dashboard.recommendations", label: "Rekomendasi Operasional", group: "Dashboard", legacy: "operations", actions: ["read"] },
  { key: "pos.transaction", label: "POS Transaksi", group: "Operasional", legacy: "pos", actions: ["create", "read"], aliases: ["pos"] },
  { key: "pos.orderEdit", label: "Edit Pesanan Baru", group: "Operasional", legacy: "pos", actions: ["update"] },
  { key: "pos.payment", label: "Pembayaran & Close Bill", group: "Operasional", legacy: "pos", actions: ["create", "read"] },
  { key: "orders.history", label: "Riwayat Order", group: "Operasional", legacy: "reports", actions: ["read"] },
  { key: "queue.kitchen", label: "Aksi Dapur", group: "Operasional", legacy: "kitchen", actions: ["read", "update"], aliases: ["queue"] },
  { key: "queue.cashier", label: "Aksi Kasir di Antrian", group: "Operasional", legacy: "pos", actions: ["read", "update"] },
  { key: "crm.customers", label: "CRM Customer", group: "CRM", legacy: "reports", actions: ["create", "read", "update", "delete"], aliases: ["customers"] },
  { key: "crm.transactions", label: "Transaksi Customer", group: "CRM", legacy: "reports", actions: ["read"], aliases: ["customerTransactions"] },
  { key: "categories.manage", label: "Kategori Produk", group: "Produk", legacy: "operations", actions: ["create", "read", "update", "delete"], aliases: ["categories"] },
  { key: "products.catalog", label: "Kelola Produk", group: "Produk", legacy: "operations", actions: ["create", "read", "update", "delete"], aliases: ["products"] },
  { key: "products.outletPrice", label: "Harga Produk Outlet", group: "Produk", legacy: "operations", actions: ["read", "update"] },
  { key: "ingredients.template", label: "Template Bahan", group: "Produk", legacy: "operations", actions: ["create", "read", "update", "delete"], aliases: ["ingredientTemplates"] },
  { key: "recipes.template", label: "Template Recipe Produk", group: "Produk", legacy: "operations", actions: ["create", "read", "update", "delete"], aliases: ["recipes"] },
  { key: "recipes.outletMapping", label: "Mapping Bahan Recipe", group: "Produk", legacy: "operations", actions: ["read", "update"], aliases: ["ingredientMapping"] },
  { key: "modifiers.master", label: "Master Modifier", group: "Produk", legacy: "operations", actions: ["create", "read", "update", "delete"], aliases: ["modifiers"] },
  { key: "modifiers.options", label: "Opsi Modifier", group: "Produk", legacy: "operations", actions: ["create", "read", "update", "delete"] },
  { key: "modifiers.outletPrice", label: "Harga Modifier Outlet", group: "Produk", legacy: "operations", actions: ["read", "update"] },
  { key: "modifiers.ingredientTemplate", label: "Template Bahan Modifier", group: "Produk", legacy: "operations", actions: ["create", "read", "update", "delete"] },
  { key: "inventory.overview", label: "Overview Stok", group: "Inventory", legacy: "inventory", actions: ["read"] },
  { key: "inventory.ingredients", label: "Stok Bahan Outlet", group: "Inventory", legacy: "inventory", actions: ["create", "read", "update", "delete"], aliases: ["inventory"] },
  { key: "inventory.purchase", label: "Catat Stok Masuk", group: "Inventory", legacy: "inventory", actions: ["create", "read"], aliases: ["purchase"] },
  { key: "inventory.movement", label: "Kartu Stok", group: "Inventory", legacy: "inventory", actions: ["read"], aliases: ["stockMovement"] },
  { key: "inventory.waste", label: "Waste / Expired", group: "Inventory", legacy: "inventory", actions: ["create", "read"] },
  { key: "reports.profitLoss", label: "Laba Rugi", group: "Laporan", legacy: "reports", actions: ["read"], aliases: ["reports"] },
  { key: "reports.operatingExpenses", label: "Beban Operasional", group: "Laporan", legacy: "reports", actions: ["create", "read", "update", "delete"] },
  { key: "reports.sales", label: "Laporan Penjualan", group: "Laporan", legacy: "reports", actions: ["read"] },
  { key: "reports.inventoryLoss", label: "Inventory Loss", group: "Laporan", legacy: "reports", actions: ["read"] },
  { key: "settings.outlet", label: "Setting Outlet", group: "Pengaturan", legacy: "settings", actions: ["read", "update"], aliases: ["settings"] },
  { key: "settings.payment", label: "Metode Bayar", group: "Pengaturan", legacy: "settings", actions: ["create", "read", "update", "delete"] },
  { key: "settings.tables", label: "Layout Meja", group: "Pengaturan", legacy: "settings", actions: ["create", "read", "update", "delete"] },
  { key: "settings.packaging", label: "Aturan Packaging", group: "Pengaturan", legacy: "settings", actions: ["create", "read", "update", "delete"] },
  { key: "settings.costing", label: "Metode Costing", group: "Pengaturan", legacy: "settings", actions: ["read", "update"] },
  { key: "company.branding", label: "Branding Perusahaan", group: "Admin", legacy: "company", actions: ["read", "update"], aliases: ["company"] },
  { key: "outlets.manage", label: "Kelola Outlet", group: "Admin", legacy: "outlet", actions: ["create", "read", "update", "delete"], aliases: ["outlets"] },
  { key: "users.manage", label: "Kelola User", group: "Admin", legacy: "user", actions: ["create", "read", "update", "delete"], aliases: ["users"] },
  { key: "roles.manage", label: "Kelola Role", group: "Admin", legacy: "role", actions: ["create", "read", "update", "delete"], aliases: ["roles"] }
];
