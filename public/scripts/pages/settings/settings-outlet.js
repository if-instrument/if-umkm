import { state, printerCache, printerDropdownMode, setPrinterCache, setPrinterDropdownMode, defaultBookContent } from "./settings-state.js";
import { activeCompany, activeOutlets, setLogoValue, slugify } from "./settings-helpers.js";
import { byId, setText, showFeedback } from "../../dom.js";
import { apiGet } from "../../store.js";

export function renderCompany() {
  const company = activeCompany();
  if (byId("company-name")) byId("company-name").value = company.name || "";
  if (byId("company-route-slug")) byId("company-route-slug").value = company.routeSlug || slugify(company.name || "");
  setLogoValue("company-logo-url", "company-logo-preview", company.logoUrl || "", (company.name || "IF").slice(0, 2).toUpperCase());
  if (byId("company-theme-color")) byId("company-theme-color").value = company.themeColor || "#3B1F8C";
  if (byId("company-default-outlet")) {
    byId("company-default-outlet").innerHTML = activeOutlets().map((outlet) => `<option value="${outlet.id}">${outlet.name}</option>`).join("");
    const current = (state.outlets || []).find((outlet) => outlet.name === state.settings?.outletName)?.id || activeOutlets()[0]?.id || "";
    byId("company-default-outlet").value = current;
  }
}

export function renderOutletSettings() {
  if (byId("setting-outlet-name")) byId("setting-outlet-name").value = state.settings?.outletName || "";
  if (byId("setting-tax-rate")) byId("setting-tax-rate").value = state.settings?.taxRate ?? 0;
  if (byId("setting-dine-in-service-rate")) byId("setting-dine-in-service-rate").value = state.settings?.dineInServiceRate ?? 0;
  if (byId("setting-printer-name")) byId("setting-printer-name").value = state.settings?.printerName || "";
  const channels = state.settings?.orderChannels || { dineIn: false, takeAway: true, delivery: false };
  if (byId("order-channel-dine-in")) byId("order-channel-dine-in").checked = Boolean(channels.dineIn);
  if (byId("order-channel-take-away")) byId("order-channel-take-away").checked = channels.takeAway !== false;
  if (byId("order-channel-delivery")) byId("order-channel-delivery").checked = Boolean(channels.delivery);
  if (byId("table-service-mode")) byId("table-service-mode").value = state.settings?.tableServiceMode || "free_seating_pay_first";
}

export function renderBookContentSettings() {
  const content = { ...defaultBookContent(), ...(state.settings?.publicOrderContent || {}) };
  const map = {
    "book-cover-subtitle": "coverSubtitle",
    "book-cover-description": "coverDescription",
    "book-outlet-title": "outletTitle",
    "book-service-title": "serviceTitle",
    "book-service-description": "serviceDescription",
    "book-table-title": "tableTitle",
    "book-table-description": "tableDescription",
    "book-menu-title": "menuTitle",
    "book-menu-description": "menuDescription",
    "book-cart-title": "cartTitle",
    "book-cart-description": "cartDescription",
    "book-customer-title": "customerTitle",
    "book-customer-description": "customerDescription",
    "book-receipt-title": "receiptTitle",
    "book-receipt-description": "receiptDescription",
    "book-back-subtitle": "backSubtitle",
    "book-back-description": "backDescription",
    "book-back-button": "backButton"
  };
  Object.entries(map).forEach(([id, key]) => {
    const field = byId(id);
    if (field) field.value = content[key] || "";
  });
}

export function searchPrinters() {
  setPrinterDropdownMode("browse");
  renderPrinterDropdown({ loading: true });
  setText("setting-feedback", "Mencari printer yang tersedia...");
  const result = apiGet("/api/printer");
  const items = result?.data?.items || [];
  setPrinterCache(items);
  renderPrinterDropdown();
  showFeedback("setting-feedback", items.length ? `${items.length} printer ditemukan. Pilih dari dropdown printer.` : "Printer belum ditemukan oleh server. Isi manual atau kosongkan jika tidak memakai printer struk.");
}

export function renderPrinterDropdown(options = {}) {
  const dropdown = byId("printer-dropdown");
  if (!dropdown) return;
  const currentValue = byId("setting-printer-name")?.value.trim() || "";
  const keyword = printerDropdownMode === "search" ? currentValue.toLowerCase() : "";
  const printers = (printerCache || []).filter((printer) => !keyword || printer.name.toLowerCase().includes(keyword) || String(printer.target || "").toLowerCase().includes(keyword));
  const currentExists = !currentValue || printers.some((printer) => printer.name === currentValue) || (printerCache || []).some((printer) => printer.name === currentValue);
  dropdown.hidden = false;
  dropdown.innerHTML = `
    ${options.loading ? `<div class="printer-empty">Mencari printer yang tersedia...</div>` : ""}
    <button class="printer-option ${currentValue ? "" : "active"}" data-printer-name="" type="button">
      <strong>Tidak memakai printer</strong>
      <small>POS tidak akan print struk otomatis.</small>
    </button>
    ${currentValue && !currentExists ? `
      <button class="printer-option active" data-printer-name="${currentValue}" type="button">
        <strong>${currentValue}</strong>
        <small>Printer tersimpan saat ini. Tidak muncul dari hasil scan terbaru.</small>
      </button>
    ` : ""}
    ${!options.loading && printers.length ? printers.map((printer) => `
      <button class="printer-option ${printer.name === currentValue ? "active" : ""}" data-printer-name="${printer.name}" type="button">
        <strong>${printer.name}</strong>
        <small>${printer.source || "Printer"}${printer.target ? ` · ${printer.target}` : ""}</small>
      </button>
    `).join("") : !options.loading ? `<div class="printer-empty">Printer tidak ditemukan. Isi manual atau kosongkan jika tidak memakai printer struk.</div>` : ""}
  `;
}

export function openPrinterDropdown() {
  searchPrinters();
}

export function closePrinterDropdown() {
  const dropdown = byId("printer-dropdown");
  if (dropdown) dropdown.hidden = true;
}
