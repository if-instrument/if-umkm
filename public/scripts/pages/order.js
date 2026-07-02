import { effectiveRecipe, ingredientById, isStockedProduct, modifierPrice, productModifierOptions } from "../inventory.js";
import { ORDER_STATUS, PAYMENT_STATUS, isActiveStatus, isInactiveStatus, orderStatusCode, paymentStatusCode, statusLabel } from "../status-codes.js";

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

const serviceTypes = [
  { key: "dineIn", label: "Dine In" },
  { key: "takeAway", label: "Take Away" },
  { key: "delivery", label: "Delivery" }
];

let state = {
  company: {},
  outlets: [],
  settings: {},
  categories: [],
  products: [],
  modifiers: [],
  ingredients: [],
  cart: [],
  outletId: "",
  serviceType: "Take Away",
  tableName: "",
  categoryId: "all",
  menuGridSize: 3,
  menuMobileLimit: 5,
  paymentMethodId: "",
  paymentProof: null,
  cartConfirmed: false,
  selectedMemberId: "",
  spread: "cover",
  outletConfirmed: false,
  orderResult: null
};

let flipbookReady = false;
let syncingFlipbook = false;
let forcedBookTurn = false;
let pristineBookTemplate = "";

function byId(id) {
  return document.getElementById(id);
}

function optionalById(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const element = optionalById(id);
  if (element) element.textContent = value;
}

function setSrc(id, value) {
  const element = optionalById(id);
  if (element) element.src = value;
}

function hexToRgb(hex) {
  const normalized = String(hex || "").replace("#", "").trim();
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;
  if (!/^[0-9a-f]{6}$/i.test(value)) return { r: 110, g: 58, b: 22 };
  const number = parseInt(value, 16);
  return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 };
}

function mixRgb(a, b, weight = 0.5) {
  return {
    r: Math.round(a.r * (1 - weight) + b.r * weight),
    g: Math.round(a.g * (1 - weight) + b.g * weight),
    b: Math.round(a.b * (1 - weight) + b.b * weight)
  };
}

function rgbCss(rgb) {
  return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
}

function relativeLuminance(rgb) {
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return (0.2126 * channel(rgb.r)) + (0.7152 * channel(rgb.g)) + (0.0722 * channel(rgb.b));
}

function readableTextFor(rgb) {
  return relativeLuminance(rgb) > 0.48 ? "#2c2018" : "#fffaf3";
}

function setOrderCssVariable(name, value) {
  document.documentElement.style.setProperty(name, value);
  document.body?.style.setProperty(name, value);
}

function money(value) {
  return rupiah.format(Math.round(Number(value || 0)));
}

function orderContent() {
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
    backButton: "Kembali ke Cover Depan",
    ...(state.settings.publicOrderContent || state.settings.orderBookContent || {})
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function companySlug() {
  return window.__COMPANY_SLUG__ || new URLSearchParams(window.location.search).get("company") || "";
}

function orderSessionKey() {
  return `if-instrument-public-order:${companySlug() || "global"}`;
}

function readOrderSession() {
  try {
    return JSON.parse(sessionStorage.getItem(orderSessionKey()) || "{}") || {};
  } catch {
    return {};
  }
}

function persistOrderSession() {
  const payload = {
    outletId: state.outletId,
    outletConfirmed: state.outletConfirmed,
    serviceType: state.serviceType,
    tableName: state.tableName,
    categoryId: state.categoryId,
    menuGridSize: state.menuGridSize,
    menuMobileLimit: state.menuMobileLimit,
    paymentMethodId: state.paymentMethodId,
    spread: state.spread,
    cartConfirmed: state.cartConfirmed,
    cart: state.cart
  };
  sessionStorage.setItem(orderSessionKey(), JSON.stringify(payload));
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.message || "Request gagal diproses.");
  return payload.data;
}

async function loadOrderData(outletId = "") {
  setBusy(true, "Memuat menu outlet...");
  try {
    const saved = readOrderSession();
    const query = new URLSearchParams();
    if (companySlug()) query.set("company", companySlug());
    if (outletId) query.set("outlet_id", outletId);
    const data = await requestJson(`/api/page/order/bootstrap?${query.toString()}`);
    const outlets = data.outlets || [];
    const savedOutletId = saved.outletId && outlets.some((outlet) => String(outlet.id) === String(saved.outletId)) ? saved.outletId : "";
    const requestedOutletId = outletId && outlets.some((outlet) => String(outlet.id) === String(outletId)) ? outletId : "";
    const responseOutletId = data.activeOutletId && outlets.some((outlet) => String(outlet.id) === String(data.activeOutletId)) ? data.activeOutletId : "";
    const singleOutletId = outlets.length === 1 ? outlets[0].id : "";
    const nextOutletId = requestedOutletId || savedOutletId || responseOutletId || singleOutletId || "";
    const outletConfirmed = Boolean(singleOutletId || requestedOutletId || savedOutletId || responseOutletId);
    const previousOutletId = state.outletId;
    const outletChanged = Boolean(
      (previousOutletId && nextOutletId && nextOutletId !== previousOutletId) ||
      (requestedOutletId && savedOutletId && String(requestedOutletId) !== String(savedOutletId))
    );
    state = {
      ...state,
      company: data.company || {},
      outlets,
      settings: data.settings || {},
      categories: data.categories || [],
      products: data.products || [],
      modifiers: data.modifiers || [],
      ingredients: data.ingredients || [],
      outletId: nextOutletId,
      outletConfirmed,
      serviceType: saved.serviceType || state.serviceType,
      tableName: outletChanged ? "" : (saved.tableName || state.tableName),
      categoryId: saved.categoryId || state.categoryId,
      menuGridSize: Number(saved.menuGridSize || state.menuGridSize),
      menuMobileLimit: Number(saved.menuMobileLimit || state.menuMobileLimit),
      paymentMethodId: saved.paymentMethodId || state.paymentMethodId,
      cartConfirmed: outletChanged ? false : Boolean(saved.cartConfirmed),
      spread: saved.spread || state.spread,
      cart: outletChanged ? [] : (Array.isArray(saved.cart) ? saved.cart : state.cart),
      orderResult: outletChanged ? null : state.orderResult
    };
    normalizeSelections();
    render();
  } catch (error) {
    showFeedback(error.message, true);
  } finally {
    setBusy(false);
  }
}

function normalizeSelections() {
  const services = enabledServices();
  if (!services.some((item) => item.label === state.serviceType)) {
    state.serviceType = services[0]?.label || "Take Away";
  }
  if (services.length === 1) state.serviceType = services[0].label;
  const payments = activePaymentMethods();
  if (!payments.some((item) => item.id === state.paymentMethodId)) {
    state.paymentMethodId = payments[0]?.id || "";
  }
  state.cart = state.cart
    .filter((line) => productById(line.productId))
    .map((line) => ({
      id: line.id || lineKey(line.productId, line.modifierIds || []),
      productId: line.productId,
      modifierIds: Array.isArray(line.modifierIds) ? line.modifierIds : [],
      qty: Math.max(1, Number(line.qty || 1))
    }));
  if (hasMultipleOutlets() && !hasSelectedOutlet()) {
    state.spread = "cover";
    state.cart = [];
  }
}

function enabledServices() {
  const channels = state.settings.orderChannels || { takeAway: true };
  const active = serviceTypes.filter((item) => channels[item.key] === true || (item.key === "takeAway" && channels.takeAway !== false));
  return active.length ? active : serviceTypes.filter((item) => item.key === "takeAway");
}

function activePaymentMethods() {
  return (state.settings.paymentMethods || []).filter((method) => isActiveStatus(method.status));
}

function hasMultipleOutlets() {
  return state.outlets.length > 1;
}

function hasSelectedOutlet() {
  return Boolean(state.outletId && state.outletConfirmed);
}

function needsServiceChoice() {
  return enabledServices().length > 1;
}

function shouldSkipServicePage() {
  return !needsServiceChoice();
}

function spreadOrder() {
  return ["cover", "menu", "checkout", "receipt"];
}

function pageForSpread(spread) {
  return {
    cover: 3,
    menu: menuStartPage(),
    checkout: checkoutStartPage(),
    receipt: receiptStartPage()
  }[spread] || 1;
}

function menuStartPage() {
  return shouldSkipServicePage() ? 4 : 5;
}

function spreadForPage(page) {
  if (page >= receiptStartPage()) return "receipt";
  if (page >= checkoutStartPage()) return "checkout";
  if (page >= menuStartPage()) return "menu";
  return "cover";
}

function generatedMenuPageCount() {
  return document.querySelectorAll(".public-generated-menu-page").length;
}

function receiptSpacerPageCount() {
  const receiptPage = document.querySelector('[data-book-section="receipt"]:not(.public-back-cover-page)');
  if (!receiptPage) return 0;
  return [...document.querySelectorAll(".public-receipt-spacer-page")]
    .filter((page) => page.compareDocumentPosition(receiptPage) & Node.DOCUMENT_POSITION_FOLLOWING)
    .length;
}

function checkoutStartPage() {
  return menuStartPage() + 1 + generatedMenuPageCount();
}

function receiptStartPage() {
  return checkoutStartPage() + checkoutPageCount() + receiptSpacerPageCount();
}

function isCheckoutPageNumber(page) {
  return page >= checkoutStartPage() && page < receiptStartPage();
}

function checkoutPageCount() {
  return document.querySelectorAll('[data-book-section="checkout"]').length || 1;
}

function customerPageNumber() {
  return pageNumberForElement(optionalById("order-customer-page")) || checkoutStartPage() + 1;
}

function coverStartPage() {
  const coverPage = document.querySelector(".public-cover-page:not(.public-back-cover-page)");
  return pageNumberForElement(coverPage) || pageForSpread("cover");
}

function shouldHideCustomerPageOnMobile() {
  return isMobileMenu() && !state.cartConfirmed;
}

function currentBookPage() {
  const book = flipbook();
  return flipbookReady && book?.length ? book.turn("page") : pageForSpread(state.spread);
}

function blocksForwardTurnFromPage(page) {
  return isCheckoutPageNumber(page);
}

function canFreeTurnToPage(targetPage) {
  const currentPage = currentBookPage();
  return !(targetPage > currentPage && blocksForwardTurnFromPage(currentPage));
}

function pageNumberForElement(element) {
  if (!element) return 0;
  return [...byId("order-flipbook").querySelectorAll(".public-book-page")].indexOf(element) + 1;
}

function forceTurnToElement(selector, fallbackPage) {
  const element = document.querySelector(selector);
  turnToPage(pageNumberForElement(element) || fallbackPage, true);
}

function flipbook() {
  return window.jQuery ? window.jQuery("#order-flipbook") : null;
}

function flipbookSize() {
  const isMobile = window.matchMedia("(max-width: 760px)").matches;
  const width = Math.max(320, window.innerWidth);
  const height = Math.max(isMobile ? 520 : 560, window.innerHeight);
  return { width, height };
}

function isMobileMenu() {
  return window.matchMedia("(max-width: 760px)").matches;
}

function menuLayoutClass() {
  return isMobileMenu() ? `list-${state.menuMobileLimit}` : `grid-${state.menuGridSize}`;
}

function menuPageCapacity() {
  return isMobileMenu() ? state.menuMobileLimit : state.menuGridSize * state.menuGridSize;
}

function menuLayoutLabel() {
  return isMobileMenu() ? `list ${state.menuMobileLimit}/halaman` : `grid ${state.menuGridSize}x${state.menuGridSize}`;
}

function initFlipbook() {
  const book = flipbook();
  if (!book?.length || !window.jQuery?.fn?.turn || flipbookReady) return;
  const size = flipbookSize();
  const startPage = pageForSpread(state.spread);
  book.turn({
    width: size.width,
    height: size.height,
    page: startPage,
    autoCenter: true,
    gradients: true,
    acceleration: true,
	    display: window.matchMedia("(max-width: 760px)").matches ? "single" : "double",
	    when: {
	      turning(event, page) {
	        const currentPage = book.turn("page");
	        if (page > currentPage && blocksForwardTurnFromPage(currentPage) && !forcedBookTurn) {
	          event.preventDefault();
	          showFeedback("Gunakan tombol di halaman ini untuk melanjutkan.", true);
	          return;
	        }
	        if (page < pageForSpread("cover")) event.preventDefault();
	        if (hasMultipleOutlets() && !hasSelectedOutlet() && page > pageForSpread("cover")) {
	          event.preventDefault();
	          showFeedback("Pilih outlet terlebih dahulu.", true);
	          return;
	        }
	        if (shouldSkipServicePage() && menuStartPage() !== 4 && page === 4) {
	          event.preventDefault();
	          setTimeout(() => {
	            const currentPage = book.turn("page");
	            book.turn("page", currentPage < page ? menuStartPage() : pageForSpread("cover"));
	          }, 0);
	        }
	      },
	      turned(event, page) {
	        if (syncingFlipbook) return;
	        if (shouldSkipServicePage() && menuStartPage() !== 4 && page === 4) {
	          syncingFlipbook = true;
	          book.turn("page", menuStartPage());
	          syncingFlipbook = false;
	          return;
	        }
	        state.spread = spreadForPage(page);
	        showFeedback("");
	        renderSpread(false);
      }
    }
  });
  flipbookReady = true;
}

function destroyFlipbook() {
  const book = flipbook();
  if (!flipbookReady || !book?.length) return;
  try {
    book.turn("destroy");
  } catch {
    // turn.js may already be mid-destroy during rapid data refreshes.
  }
  flipbookReady = false;
  syncingFlipbook = false;
}

function snapshotBookInputs() {
  return {
    search: optionalById("order-search")?.value || "",
    statusLookup: optionalById("order-status-lookup-input")?.value || "",
    customerName: optionalById("order-customer-name")?.value || "",
    customerEmail: optionalById("order-customer-email")?.value || "",
    customerPhone: optionalById("order-customer-phone")?.value || "",
    registerMember: optionalById("order-register-member")?.checked || false,
    selectedMemberId: state.selectedMemberId || ""
  };
}

function restoreBookInputs(snapshot) {
  if (!snapshot) return;
  if (optionalById("order-search")) byId("order-search").value = snapshot.search || "";
  if (optionalById("order-status-lookup-input")) byId("order-status-lookup-input").value = snapshot.statusLookup || "";
  if (optionalById("order-customer-name")) byId("order-customer-name").value = snapshot.customerName || "";
  if (optionalById("order-customer-email")) byId("order-customer-email").value = snapshot.customerEmail || "";
  if (optionalById("order-customer-phone")) byId("order-customer-phone").value = snapshot.customerPhone || "";
  if (optionalById("order-register-member")) byId("order-register-member").checked = Boolean(snapshot.registerMember);
  state.selectedMemberId = snapshot.selectedMemberId || state.selectedMemberId || "";
  syncSelectedMemberFields();
}

function restoreStaticBookTemplate() {
  const book = byId("order-flipbook");
  const snapshot = snapshotBookInputs();
  destroyFlipbook();
  book.innerHTML = pristineBookTemplate;
  restoreBookInputs(snapshot);
  bindDynamicFieldListeners();
}

function syncOptionalBookPages() {
  if (shouldSkipServicePage()) {
    optionalById("order-service-page")?.remove();
  }
  if (shouldHideCustomerPageOnMobile()) {
    optionalById("order-customer-page")?.remove();
  }
}

function syncReceiptBookPages() {
  const book = byId("order-flipbook");
  book.querySelectorAll(".public-receipt-spacer-page").forEach((page) => page.remove());
  const backCover = book.querySelector(".public-back-cover-page");
  if (!backCover) return;

  const backCoverNumber = pageNumberForElement(backCover);
  if (backCoverNumber % 2 === 0) {
    backCover.insertAdjacentHTML("afterend", `<article class="public-book-page public-blank-page public-receipt-spacer-page" data-book-section="receipt" aria-hidden="true"></article>`);
  }
}

function rebuildFlipbook(targetPage = null) {
  const nextPage = targetPage || pageForSpread(state.spread);
  initFlipbook();
  const book = flipbook();
  if (flipbookReady && book?.length) {
    forcedBookTurn = true;
    try {
      book.turn("page", Math.min(nextPage, book.turn("pages")));
    } finally {
      forcedBookTurn = false;
    }
  }
}

function turnToPage(page, force = false) {
  const book = flipbook();
  if (flipbookReady && book?.length) {
    syncingFlipbook = true;
    forcedBookTurn = Boolean(force);
    try {
      book.turn("page", Math.min(page, book.turn("pages")));
    } finally {
      forcedBookTurn = false;
      syncingFlipbook = false;
    }
    state.spread = spreadForPage(page);
    renderSpread(false);
    return;
  }
  state.spread = spreadForPage(page);
  renderSpread(false);
}

function resizeFlipbook() {
  const book = flipbook();
  if (!flipbookReady || !book?.length) return;
  const size = flipbookSize();
  book.turn("size", size.width, size.height);
  book.turn("display", window.matchMedia("(max-width: 760px)").matches ? "single" : "double");
  renderProducts();
}

function render() {
  if (pristineBookTemplate) restoreStaticBookTemplate();
  renderBookStaticContent();
  renderProducts();
  renderSpread();
}

function renderBookStaticContent() {
  renderBrand();
  renderOrderContent();
  renderProgress();
  renderOutletChoices();
  renderServiceTypes();
  renderTables();
  renderCategories();
  renderCart();
  renderPayments();
  renderCustomerGate();
  renderBill();
}

function markCartChanged() {
  state.cartConfirmed = false;
}

function renderCustomerGate() {
  const content = optionalById("order-customer-content");
  const page = optionalById("order-customer-page");
  if (!content || !page) {
    syncSelectedMemberFields();
    return;
  }
  const visible = Boolean(state.cartConfirmed && state.cart.length);
  content.hidden = !visible;
  page.classList.toggle("is-blank", !visible);
  syncSelectedMemberFields();
}

function syncSelectedMemberFields() {
  const nameInput = optionalById("order-customer-name");
  const registerLine = optionalById("order-register-member-line");
  const registerInput = optionalById("order-register-member");
  const selectedPanel = optionalById("order-selected-member");
  if (!nameInput || !registerLine || !registerInput || !selectedPanel) return;

  const selected = Boolean(state.selectedMemberId);
  nameInput.readOnly = selected;
  nameInput.classList.toggle("is-readonly", selected);
  registerLine.hidden = selected;
  if (selected) registerInput.checked = false;
  selectedPanel.hidden = !selected;
}

function renderOrderContent() {
  const content = orderContent();
  setText("order-cover-subtitle", content.coverSubtitle);
  setText("order-cover-description", content.coverDescription);
  setText("order-outlet-title", content.outletTitle);
  setText("order-service-title", content.serviceTitle);
  setText("order-service-description", content.serviceDescription);
  setText("order-table-title", content.tableTitle);
  setText("order-table-description", content.tableDescription);
  setText("order-menu-title", content.menuTitle);
  setText("order-menu-description", content.menuDescription);
  setText("order-cart-title", content.cartTitle);
  setText("order-cart-description", content.cartDescription);
  setText("order-customer-title", content.customerTitle);
  setText("order-customer-description", content.customerDescription);
  setText("order-receipt-title", content.receiptTitle);
  setText("order-receipt-description", content.receiptDescription);
  setText("order-back-subtitle", content.backSubtitle);
  setText("order-back-description", content.backDescription);
  setText("order-reset-cover", content.backButton);
}

function renderBrand() {
  const companyName = state.company.name || state.settings.companyName || "IF Instrument";
  const logoUrl = state.company.logoUrl || state.settings.companyLogoUrl || "/assets/if-instrument-logo.jpg";
  const themeColor = state.company.themeColor || state.settings.themeColor || "#6e3a16";
  const themeRgb = hexToRgb(themeColor);
  const darkRgb = mixRgb(themeRgb, { r: 18, g: 10, b: 6 }, 0.62);
  const deepRgb = mixRgb(themeRgb, { r: 0, g: 0, b: 0 }, 0.78);
  const softRgb = mixRgb(themeRgb, { r: 255, g: 250, b: 243 }, 0.82);
  const coverText = readableTextFor(darkRgb);
  const coverMuted = coverText === "#fffaf3" ? "rgba(255, 250, 243, 0.82)" : "rgba(44, 32, 24, 0.72)";
  const coverPanelBg = coverText === "#fffaf3" ? "rgba(255, 255, 255, 0.92)" : "rgba(44, 32, 24, 0.08)";
  const coverPanelText = coverText === "#fffaf3" ? "#2c2018" : "#2c2018";
  ["order-company-name", "order-cover-title", "order-back-title"].forEach((id) => setText(id, companyName));
  ["order-company-logo", "order-cover-logo", "order-back-logo"].forEach((id) => setSrc(id, logoUrl));
  setOrderCssVariable("--order-accent", themeColor);
  setOrderCssVariable("--order-accent-rgb", rgbCss(themeRgb));
  setOrderCssVariable("--order-accent-dark-rgb", rgbCss(darkRgb));
  setOrderCssVariable("--order-accent-deep-rgb", rgbCss(deepRgb));
  setOrderCssVariable("--order-accent-soft-rgb", rgbCss(softRgb));
  setOrderCssVariable("--order-cover-text", coverText);
  setOrderCssVariable("--order-cover-muted", coverMuted);
  setOrderCssVariable("--order-cover-panel-bg", coverPanelBg);
  setOrderCssVariable("--order-cover-panel-text", coverPanelText);
}

function renderProgress() {
  const progress = optionalById("order-progress");
  if (!progress) return;
  const labels = {
    cover: "Cover",
    menu: "Menu",
    checkout: "Cart & Payment",
    receipt: "Receipt"
  };
  const spreads = spreadOrder();
  progress.innerHTML = spreads.map((spread) => `
    <button class="${spread === state.spread ? "active" : ""} ${canJumpTo(spread) ? "" : "disabled"}" data-jump-spread="${spread}" type="button">
      ${labels[spread]}
    </button>
  `).join("");
}

function renderOutletChoices() {
  document.body.classList.toggle("single-outlet-order", !hasMultipleOutlets());
  document.body.classList.toggle("multi-outlet-order", hasMultipleOutlets());
  const panel = optionalById("order-cover-outlets-panel");
  if (panel) panel.hidden = !hasMultipleOutlets();
  if (!hasMultipleOutlets()) {
    byId("order-outlet-choices").innerHTML = "";
    return;
  }
  byId("order-outlet-choices").innerHTML = state.outlets.map((outlet) => `
    <button class="public-choice-card ${outlet.id === state.outletId ? "active" : ""}" data-outlet-id="${outlet.id}" type="button">
      <strong>${escapeHtml(outlet.name)}</strong>
      <span>${escapeHtml(outlet.address || "Alamat outlet belum diisi")}</span>
    </button>
  `).join("") || `<div class="empty-state">Belum ada outlet aktif.</div>`;
}

function renderServiceTypes() {
  const page = optionalById("order-service-page");
  page?.classList.toggle("is-skipped", shouldSkipServicePage());
  if (shouldSkipServicePage()) {
    byId("order-service-types").innerHTML = "";
    return;
  }
  byId("order-service-types").innerHTML = enabledServices().map((item) => `
    <button class="public-choice-card ${item.label === state.serviceType ? "active" : ""}" data-service-type="${item.label}" type="button">
      <strong>${item.label}</strong>
      <span>${serviceDescription(item.label)}</span>
    </button>
  `).join("");
}

function renderTables() {
  const section = byId("order-table-section");
  const needsTable = state.serviceType === "Dine In" && state.settings.tableServiceMode !== "free_seating_pay_first";
  section.hidden = !needsTable;
  if (!needsTable) {
    state.tableName = "";
    byId("order-table-choices").innerHTML = "";
    return;
  }
  const tables = (state.settings.diningTables || []).filter((table) => isActiveStatus(table.status));
  if (!state.tableName && tables.length) state.tableName = tables[0].name;
  byId("order-table-choices").innerHTML = tables.length ? tables.map((table) => `
    <button class="public-choice-card ${table.name === state.tableName ? "active" : ""}" data-table-name="${escapeHtml(table.name)}" type="button">
      <strong>${escapeHtml(table.name)}</strong>
      <span>${escapeHtml(table.area || "Area")} · ${Number(table.capacity || 1)} kursi</span>
    </button>
  `).join("") : `<div class="empty-state compact">Table layout belum dibuat.</div>`;
}

function serviceDescription(label) {
  if (label === "Dine In") return "Makan di tempat sesuai setting outlet.";
  if (label === "Delivery") return "Pesanan dikirim sesuai proses outlet.";
  return "Ambil pesanan di outlet.";
}

function renderCategories() {
  const visibleCategories = state.categories.filter((category) => !isInactiveStatus(category.status));
  byId("order-categories").innerHTML = [
    `<button class="${state.categoryId === "all" ? "active" : ""}" data-category-id="all" type="button">Semua</button>`,
    ...visibleCategories.map((category) => `<button class="${state.categoryId === category.id ? "active" : ""}" data-category-id="${category.id}" type="button">${escapeHtml(category.name)}</button>`)
  ].join("");
}

function renderProducts() {
  const search = byId("order-search").value.trim().toLowerCase();
  const products = state.products
    .filter((product) => isActiveStatus(product.status))
    .filter((product) => state.categoryId === "all" || product.categoryId === state.categoryId)
    .filter((product) => !search || `${product.name} ${product.description || ""} ${product.category || ""}`.toLowerCase().includes(search));

  renderGridSizePicker();
  renderProductBookPages(products);
}

function renderGridSizePicker() {
  const select = optionalById("order-grid-size-select");
  if (!select) return;
  const mobile = isMobileMenu();
  setText("order-grid-size-label", mobile ? "List" : "Grid");
  const options = mobile
    ? [
        { value: "5", label: "List 5" },
        { value: "10", label: "List 10" },
        { value: "15", label: "List 15" }
      ]
    : [
        { value: "2", label: "2x2" },
        { value: "3", label: "3x3" },
        { value: "4", label: "4x4" }
      ];
  const currentValue = String(mobile ? state.menuMobileLimit : state.menuGridSize);
  select.innerHTML = options.map((option) => `<option value="${option.value}">${option.label}</option>`).join("");
  select.value = currentValue;
}

function productCard(product) {
  const soldOut = product.soldOut || Number(product.availableQty || 0) <= 0;
  const inCart = state.cart.filter((line) => line.productId === product.id).reduce((sum, line) => sum + line.qty, 0);
  return `
    <article class="public-product-card ${soldOut ? "is-soldout" : ""}" ${soldOut ? `aria-disabled="true"` : `data-product-card="${escapeHtml(product.id)}" role="button" tabindex="0"`}>
      <div class="public-product-photo">${product.imageUrl ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" />` : `<span>${escapeHtml((product.name || "?").slice(0, 1))}</span>`}</div>
      <div class="public-product-info">
        <strong>${escapeHtml(product.name)}</strong>
        <p>${escapeHtml(product.description || product.category || "Produk tersedia")}</p>
        <span>${money(product.price)}</span>
      </div>
      ${soldOut ? `<span class="soldout-badge">Sold Out</span>` : `<button data-add-product="${product.id}" type="button">${inCart ? inCart : "+"}</button>`}
    </article>
  `;
}

function categoryName(categoryId) {
  if (!categoryId) return "Tanpa Kategori";
  return state.categories.find((category) => category.id === categoryId)?.name || "Tanpa Kategori";
}

function selectedCategoryName() {
  return state.categoryId === "all" ? "Semua Menu" : categoryName(state.categoryId);
}

function groupedProducts(products) {
  const groups = new Map();
  products.forEach((product) => {
    const key = product.categoryId || "uncategorized";
    if (!groups.has(key)) groups.set(key, { id: key, name: product.category || categoryName(product.categoryId), products: [] });
    groups.get(key).products.push(product);
  });
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "id"));
}

function renderProductBookPages(products) {
  const book = byId("order-flipbook");
  const currentPage = flipbookReady ? flipbook()?.turn("page") : pageForSpread(state.spread);
  const capacity = menuPageCapacity();
  const layoutClass = menuLayoutClass();
  if (pristineBookTemplate && (flipbookReady || book.querySelector(".public-generated-menu-page") || book.querySelector(".page-wrapper"))) {
    restoreStaticBookTemplate();
    renderBookStaticContent();
    renderGridSizePicker();
  }
  syncOptionalBookPages();
  const checkoutPage = book.querySelector('[data-book-section="checkout"]');
  const firstGrid = byId("order-products-current");
  const firstCategoryTitle = optionalById("order-menu-category-title");
  if (!checkoutPage || !firstGrid) {
    showFeedback("Halaman menu belum siap dimuat. Silakan refresh halaman.", true);
    rebuildFlipbook(Math.min(currentPage, receiptStartPage() + 1));
    return;
  }

  const pages = [];
  let firstChunkRendered = false;
  groupedProducts(products).forEach((group) => {
    for (let index = 0; index < group.products.length; index += capacity) {
      const chunk = group.products.slice(index, index + capacity);
      const pageNumber = Math.floor(index / capacity) + 1;
      const totalPages = Math.ceil(group.products.length / capacity);
      if (!firstChunkRendered) {
        firstChunkRendered = true;
        firstGrid.className = `public-order-grid public-order-grid-book ${layoutClass} public-menu-first-grid`;
        firstGrid.innerHTML = chunk.map(productCard).join("");
        if (firstCategoryTitle) firstCategoryTitle.textContent = group.name;
        byId("order-menu-summary").textContent = `${group.name} · ${products.length} produk · ${menuLayoutLabel()}`;
        continue;
      }
      pages.push(`
        <article class="public-book-page public-generated-menu-page" data-book-section="menu">
          <div class="public-step-heading compact-heading">
            <div>
              <h1>${escapeHtml(group.name)}</h1>
              <p>${chunk.length} menu · halaman ${pageNumber}/${totalPages}</p>
            </div>
          </div>
          <div class="public-order-grid public-order-grid-book ${layoutClass}">
            ${chunk.map(productCard).join("")}
          </div>
        </article>
      `);
    }
  });

  if (!firstChunkRendered) {
    firstGrid.className = `public-order-grid public-order-grid-book ${layoutClass} public-menu-first-grid`;
    firstGrid.innerHTML = `<div class="empty-state">Produk belum tersedia untuk pilihan ini.</div>`;
    if (firstCategoryTitle) firstCategoryTitle.textContent = selectedCategoryName();
    byId("order-menu-summary").textContent = "Belum ada produk untuk filter ini.";
  }

  checkoutPage.insertAdjacentHTML("beforebegin", pages.join(""));
  syncReceiptBookPages();
  if (firstChunkRendered) {
    byId("order-menu-summary").textContent += ` · ${pages.length + 1} halaman menu`;
  }
  rebuildFlipbook(Math.min(currentPage, receiptStartPage() + 1));
}

function renderCart() {
  const totals = calculateTotals();
  const confirmButton = optionalById("order-confirm-cart");
  byId("order-cart-count").textContent = `${state.cart.reduce((sum, item) => sum + item.qty, 0)} item`;
  byId("order-action-total").textContent = money(totals.total);
  if (confirmButton) confirmButton.disabled = state.cart.length === 0;
  if (!state.cart.length) state.cartConfirmed = false;
  byId("order-cart").innerHTML = state.cart.length ? state.cart.map((line) => {
    const product = productById(line.productId);
    const linePrice = lineUnitPrice(product, line);
    const modifiers = modifierNames(product, line.modifierIds || []);
    const photo = product?.imageUrl
      ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name || "Produk")}" />`
      : `<span>${escapeHtml((product?.name || "?").slice(0, 1))}</span>`;
    return `
      <div class="cart-row">
        <span class="cart-product-thumb">${photo}</span>
        <div class="cart-line-main">
          <strong>${escapeHtml(product?.name || "Produk")}</strong>
          ${modifiers ? `<small>${escapeHtml(modifiers)}</small>` : `<small>Tanpa modifier</small>`}
          <span>${money(linePrice)} / item</span>
        </div>
        <div class="cart-line-actions">
          <div class="qty-control">
            <button class="qty-button" data-cart-minus="${line.id}" type="button">-</button>
            <span>${line.qty}</span>
            <button class="qty-button" data-cart-plus="${line.id}" type="button">+</button>
          </div>
          <button class="cart-edit-button" data-edit-cart-line="${line.id}" type="button">Edit</button>
        </div>
        <strong class="cart-line-total">${money(linePrice * line.qty)}</strong>
      </div>
    `;
  }).join("") : `<div class="empty-state compact">Cart masih kosong.</div>`;

  byId("order-subtotal").textContent = money(totals.subtotal);
  byId("order-service-row").hidden = totals.serviceCharge <= 0;
  byId("order-service-label").textContent = `Service Charge (${state.settings.dineInServiceRate || 0}%)`;
  byId("order-service").textContent = money(totals.serviceCharge);
  byId("order-packaging-row").hidden = totals.packagingFee <= 0;
  byId("order-packaging").textContent = money(totals.packagingFee);
  byId("order-tax-label").textContent = `Pajak (${state.settings.taxRate || 0}%)`;
  byId("order-tax").textContent = money(totals.tax);
  byId("order-payment-fee-row").hidden = totals.customerPaymentFee <= 0;
  byId("order-payment-fee-label").textContent = `Payment Fee (${paymentById(state.paymentMethodId)?.feeRate || 0}%)`;
  byId("order-payment-fee").textContent = money(totals.customerPaymentFee);
  byId("order-total").textContent = money(totals.total);
  renderCustomerGate();
}

function renderPayments() {
  const methods = activePaymentMethods();
  byId("order-payments").innerHTML = methods.length ? methods.map((method) => `
    <button class="${method.id === state.paymentMethodId ? "active" : ""}" data-payment-id="${method.id}" type="button">
      <strong>${escapeHtml(method.name)}</strong>
      <span>${method.type === "cash" ? "Bayar nanti di kasir" : method.qrisMode === "offline" ? "Konfirmasi outlet" : "Payment gateway"}</span>
    </button>
  `).join("") : `<div class="empty-state compact">Metode pembayaran belum aktif.</div>`;
  const method = paymentById(state.paymentMethodId);
  renderPaymentProofInput(method);
  byId("order-payment-note").textContent = method?.type === "cash"
    ? "Order akan dibuat dengan status unpaid dan dibayar di kasir."
    : paymentRequiresProof(method)
      ? "Upload bukti bayar agar kasir bisa cek sebelum approve pesanan."
      : "Order akan dibuat menunggu pembayaran sesuai konfigurasi outlet.";
}

function paymentRequiresProof(method = paymentById(state.paymentMethodId)) {
  if (!method) return false;
  return method.type === "transfer" || (method.type === "qris" && method.qrisMode === "offline");
}

function renderPaymentProofInput(method = paymentById(state.paymentMethodId)) {
  const panel = optionalById("order-payment-proof-panel");
  if (!panel) return;
  const required = paymentRequiresProof(method);
  panel.hidden = !required;
  optionalById("order-payment-proof-file")?.toggleAttribute("required", required);
  setText("order-payment-proof-name", state.paymentProof?.name || (required ? "Belum ada file dipilih." : ""));
}

function renderBill() {
  const result = state.orderResult;
  const totals = calculateTotals();
  const order = result?.order || {};
  const outlet = activeOutlet();
  const logoUrl = state.company?.logoUrl || state.settings?.companyLogoUrl || "/assets/if-instrument-logo.jpg";
  byId("order-final-bill").innerHTML = `
    <div class="public-receipt-paper">
      <div class="public-receipt-head">
        ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(state.company?.name || "Logo")}" />` : ""}
        <strong>${escapeHtml(state.company?.name || "IF Instrument")}</strong>
        <span>${escapeHtml(outletLabel(outlet))}</span>
        ${outlet.address ? `<em>${escapeHtml(outlet.address)}</em>` : ""}
        <small>${escapeHtml(state.serviceType || "Take Away")}${state.tableName ? ` · ${escapeHtml(state.tableName)}` : ""}</small>
      </div>
      <div class="public-receipt-meta">
        <div><span>ORDER</span><strong>#${escapeHtml(order.orderNumber || "PREVIEW")}</strong></div>
        <div><span>TANGGAL</span><strong>${escapeHtml(receiptDate(order.createdAt))}</strong></div>
        <div><span>STATUS</span><strong>${escapeHtml(order.paymentStatus ? statusLabel(order.paymentStatus, "payment") : (result ? "Belum Bayar" : "Preview"))}</strong></div>
        <div><span>CUSTOMER</span><strong>${escapeHtml(order.customerName || byId("order-customer-name").value.trim() || "-")}</strong></div>
      </div>
      ${billRows(order.total || totals.total, order)}
      <div class="public-receipt-foot">
        <strong>${escapeHtml(result ? "TERIMA KASIH" : "PREVIEW ORDER")}</strong>
        <span>${escapeHtml(result?.message || "Struk final akan dibuat setelah order dikirim.")}</span>
      </div>
    </div>
    ${receiptTimeline(order.timeline || [], order)}
  `;
}

function receiptTimeline(timeline = [], order = {}) {
  const orderData = order || state.orderResult?.order || {};
  const rows = orderStatusSteps(orderData, timeline);
  return `
    <section class="public-order-status-card" data-order-status-card>
      <button class="public-order-status-header" data-toggle-order-timeline type="button" aria-expanded="true">
        <span>Order Status</span>
        <b aria-hidden="true"></b>
      </button>
      <div class="public-order-status-body">
        <div class="public-order-status-timeline">
          ${rows.map((row, index) => statusStepMarkup(row, index, rows.length)).join("")}
        </div>
      </div>
    </section>
  `;
}

function statusStepMarkup(row, index, totalRows) {
  return `
    <article class="${row.state || "pending"}">
      <i aria-hidden="true">${row.state === "completed" ? "✓" : ""}</i>
      <strong>${escapeHtml(row.title)}</strong>
      <span>${escapeHtml(row.createdAt ? receiptShortDateTime(row.createdAt) : "-")}</span>
      <em>${escapeHtml(row.createdAt ? (row.actorName || actorNameForOrderStatus(row.status)) : "-")}</em>
      <small>${escapeHtml(row.badge || statusStepBadge(row.state))}</small>
    </article>
  `;
}

function statusStepBadge(stateValue) {
  if (stateValue === "completed") return "Completed";
  if (stateValue === "current") return "In progress";
  return "Pending";
}

function orderStatusSteps(order = {}, timeline = []) {
  if (!state.orderResult) {
    return [{
      title: "Preview",
      status: "",
      actorName: "System",
      note: "Preview order.",
      createdAt: new Date().toISOString()
    }];
  }

  const rawRows = timeline.length ? timeline : fallbackReceiptTimeline(order);
  const currentStatus = orderStatusCode(order.status || rawRows.at(-1)?.status || ORDER_STATUS.PENDING_CASHIER);
  const currentPayment = paymentStatusCode(order.paymentStatus || rawRows.at(-1)?.paymentStatus || PAYMENT_STATUS.UNPAID);
  const createdAt = order.createdAt || rawRows[0]?.createdAt || new Date().toISOString();
  const pendingAt = firstTimelineAt(rawRows, ORDER_STATUS.PENDING_CASHIER) || createdAt;
  const confirmedAt = order.paidAt || firstPaidTimelineAt(rawRows) || firstTimelineAt(rawRows, ORDER_STATUS.WAITING);
  const preparingAt = firstTimelineAt(rawRows, ORDER_STATUS.PREPARING);
  const readyAt = firstTimelineAt(rawRows, ORDER_STATUS.READY);
  const completedAt = firstTimelineAt(rawRows, ORDER_STATUS.COMPLETED);
  const confirmed = currentPayment === PAYMENT_STATUS.PAID || confirmedAt || [ORDER_STATUS.WAITING, ORDER_STATUS.PREPARING, ORDER_STATUS.READY, ORDER_STATUS.COMPLETED].includes(currentStatus);
  const currentIndex = currentOrderStepIndex(currentStatus, confirmed);
  const stepDefinitions = [
    {
      title: "Dibuat",
      status: ORDER_STATUS.PENDING_CASHIER,
      actorName: order.customerName || "Customer",
      note: "Order dibuat dari buku menu online.",
      createdAt
    },
    {
      title: "Menunggu Konfirmasi",
      status: ORDER_STATUS.PENDING_CASHIER,
      actorName: "Kasir",
      note: "Menunggu kasir mengecek pembayaran dan detail order.",
      createdAt: pendingAt
    },
    {
      title: "Dikonfirmasi",
      status: ORDER_STATUS.WAITING,
      actorName: "Kasir",
      note: "Pembayaran dan order sudah dikonfirmasi.",
      createdAt: confirmed ? (confirmedAt || order.statusUpdatedAt || createdAt) : ""
    },
    {
      title: "Diproses",
      status: ORDER_STATUS.PREPARING,
      actorName: "Kitchen",
      note: "Pesanan sedang dibuat oleh kitchen.",
      createdAt: preparingAt || ([ORDER_STATUS.PREPARING, ORDER_STATUS.READY, ORDER_STATUS.COMPLETED].includes(currentStatus) ? (order.statusUpdatedAt || confirmedAt || createdAt) : "")
    },
    {
      title: "Siap Diambil",
      status: ORDER_STATUS.READY,
      actorName: "Kasir",
      note: "Pesanan sudah siap diterima customer.",
      createdAt: readyAt || ([ORDER_STATUS.READY, ORDER_STATUS.COMPLETED].includes(currentStatus) ? (order.statusUpdatedAt || preparingAt || createdAt) : "")
    },
    {
      title: "Selesai",
      status: ORDER_STATUS.COMPLETED,
      actorName: "Kasir",
      note: "Pesanan selesai.",
      createdAt: completedAt || (currentStatus === ORDER_STATUS.COMPLETED ? (order.statusUpdatedAt || readyAt || createdAt) : "")
    }
  ];

  return stepDefinitions.map((step, index) => ({
    ...step,
    state: index < currentIndex ? "completed" : index === currentIndex ? "current" : "pending",
    badge: index < currentIndex ? "Completed" : index === currentIndex ? (currentStatus === ORDER_STATUS.COMPLETED ? "Completed" : "In progress") : "Pending",
  }));
}

function currentOrderStepIndex(currentStatus, confirmed) {
  if (currentStatus === ORDER_STATUS.COMPLETED) return 5;
  if (currentStatus === ORDER_STATUS.READY) return 4;
  if (currentStatus === ORDER_STATUS.PREPARING) return 3;
  if (currentStatus === ORDER_STATUS.WAITING || confirmed) return 2;
  return 1;
}

function firstTimelineAt(rows, status) {
  const code = orderStatusCode(status);
  return rows.find((row) => orderStatusCode(row.status) === code)?.createdAt || "";
}

function firstPaidTimelineAt(rows) {
  return rows.find((row) => paymentStatusCode(row.paymentStatus) === PAYMENT_STATUS.PAID)?.createdAt || "";
}

function fallbackReceiptTimeline(order = {}) {
  if (!state.orderResult) {
    return [{
      status: "",
      paymentStatus: "",
      actorName: "System",
      note: "Preview order.",
      createdAt: new Date().toISOString()
    }];
  }
  const rows = [{
    status: order.status || "00",
    paymentStatus: order.paymentStatus || "00",
    actorName: order.customerName || "Customer",
    note: "Order dibuat dari buku menu online.",
    createdAt: order.createdAt || new Date().toISOString()
  }];
  if (order.paidAt) {
    rows.push({
      status: order.status || "10",
      paymentStatus: order.paymentStatus || "10",
      actorName: "Kasir",
      note: "Pembayaran dikonfirmasi.",
      createdAt: order.paidAt
    });
  }
  if (order.statusUpdatedAt && order.statusUpdatedAt !== order.createdAt && order.statusUpdatedAt !== order.paidAt) {
    rows.push({
      status: order.status || "10",
      paymentStatus: order.paymentStatus || "",
      actorName: actorNameForOrderStatus(order.status),
      note: "Status pesanan diperbarui.",
      createdAt: order.statusUpdatedAt
    });
  }
  return rows;
}

function actorNameForOrderStatus(status) {
  const label = statusLabel(status, "order");
  if (["Diproses", "Siap Diambil", "Pesanan Baru"].includes(label)) return "Kitchen";
  if (["Selesai", "Menunggu Kasir"].includes(label)) return "Kasir";
  return "System";
}

function billRows(total, order = {}) {
  const totals = calculateTotals();
  const sourceItems = Array.isArray(order.items) && order.items.length
    ? order.items.map((item) => ({
        name: item.name,
        modifiers: item.modifiers || [],
        qty: Number(item.qty || 0),
        unitPrice: Number(item.price || 0),
      }))
    : state.cart.map((line) => {
    const product = productById(line.productId);
      return {
        name: product?.name || "Produk",
        modifiers: modifierNames(product, line.modifierIds || []) ? [modifierNames(product, line.modifierIds || [])] : [],
        qty: Number(line.qty || 0),
        unitPrice: lineUnitPrice(product, line),
      };
    });
  const items = sourceItems.map((item) => {
    const modifiers = (item.modifiers || []).join(", ");
    return `
      <li>
        <div>
          <strong>${escapeHtml(item.name || "Produk")}</strong>
          ${modifiers ? `<small>${escapeHtml(modifiers)}</small>` : ""}
          <span>${item.qty} x ${money(item.unitPrice)}</span>
        </div>
        <b>${money(item.unitPrice * item.qty)}</b>
      </li>
    `;
  }).join("");
  const subtotal = Number(order.productRevenue || totals.subtotal || 0);
  const finalTotal = Number(order.total || total || 0);
  const feeTotal = Math.max(0, finalTotal - subtotal);
  return `
    <ul class="public-bill-items">${items || `<li><div><strong>Item</strong><span>-</span></div><b>-</b></li>`}</ul>
    <div class="public-receipt-totals">
      <div><span>SUBTOTAL</span><strong>${money(subtotal)}</strong></div>
      <div><span>PAJAK & BIAYA</span><strong>${money(feeTotal)}</strong></div>
      <div class="total"><span>TOTAL</span><strong>${money(finalTotal)}</strong></div>
    </div>
  `;
}

function receiptDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function receiptShortDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function receiptShortDateTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderSpread(syncBook = true) {
  const spreads = spreadOrder();
  if (!spreads.includes(state.spread)) state.spread = "cover";
  const book = flipbook();
  setText("order-status", `${activeOutletName()} · ${state.serviceType}`);
  if (syncBook && flipbookReady) {
    const targetPage = pageForSpread(state.spread);
    if (book?.length && book.turn("page") !== targetPage) {
      syncingFlipbook = true;
      forcedBookTurn = true;
      try {
        book.turn("page", targetPage);
      } finally {
        forcedBookTurn = false;
        syncingFlipbook = false;
      }
    }
  }
  renderProgress();
  persistOrderSession();
}

function canContinue(spread) {
  if (spread === "cover") return Boolean(hasSelectedOutlet() && state.serviceType && (!needsTableSelection() || state.tableName));
  if (spread === "menu") return state.cart.length > 0;
  if (spread === "checkout") return Boolean(resolveOutletId()) && state.cartConfirmed && state.cart.length > 0 && Boolean(state.paymentMethodId) && customerFormValid();
  return true;
}

function canJumpTo(spread) {
  return spreadOrder().includes(spread);
}

function needsTableSelection() {
  return state.serviceType === "Dine In" && state.settings.tableServiceMode !== "free_seating_pay_first";
}

function customerFormValid() {
  const name = byId("order-customer-name").value.trim();
  const email = byId("order-customer-email").value.trim();
  const phone = byId("order-customer-phone").value.trim();
  return Boolean(name && email && phone && byId("order-customer-email").checkValidity());
}

function goNext() {
  turnNextPage();
}

function turnNextPage() {
  const currentPage = currentBookPage();
  if (!canFreeTurnToPage(currentPage + 1)) {
    showFeedback("Gunakan tombol di halaman ini untuk melanjutkan.", true);
    return;
  }
  if (state.spread === "cover" && hasMultipleOutlets() && !hasSelectedOutlet()) {
    showFeedback("Pilih outlet terlebih dahulu.", true);
    return;
  }
  const book = flipbook();
  if (flipbookReady && book?.length) {
    if (shouldSkipServicePage() && book.turn("page") <= pageForSpread("cover")) {
      book.turn("page", menuStartPage());
      return;
    }
    book.turn("next");
    return;
  }
  showFeedback("");
  const spreads = spreadOrder();
  const nextIndex = Math.min(spreads.indexOf(state.spread) + 1, spreads.length - 1);
  state.spread = shouldSkipServicePage() && state.spread === "cover" ? "menu" : spreads[nextIndex];
  renderSpread();
}

function goBack() {
  turnPrevPage();
}

function turnPrevPage() {
  const book = flipbook();
  if (flipbookReady && book?.length) {
    if (book.turn("page") <= pageForSpread("cover")) return;
    if (shouldSkipServicePage() && book.turn("page") <= menuStartPage()) {
      book.turn("page", pageForSpread("cover"));
      return;
    }
    book.turn("previous");
    return;
  }
  const spreads = spreadOrder();
  const index = spreads.indexOf(state.spread);
  if (index > 0) {
    state.spread = spreads[index - 1];
    showFeedback("");
    renderSpread();
  }
}

function validationMessage() {
  if (!resolveOutletId()) return "Pilih outlet terlebih dahulu.";
  if (state.spread === "cover") return hasMultipleOutlets() && !hasSelectedOutlet() ? "Pilih outlet terlebih dahulu." : "Lengkapi pilihan pemesanan terlebih dahulu.";
  if (state.spread === "menu") return "Pilih minimal satu menu terlebih dahulu.";
  if (state.spread === "checkout") return state.cartConfirmed ? "Lengkapi data customer dan pilih metode pembayaran." : "Konfirmasi cart terlebih dahulu.";
  return "Lengkapi pilihan sebelum lanjut.";
}

function calculateTotals() {
  const subtotal = state.cart.reduce((sum, line) => sum + lineUnitPrice(productById(line.productId), line) * line.qty, 0);
  const packagingFee = packagingFeeEstimate();
  const serviceCharge = state.serviceType === "Dine In" ? subtotal * ((state.settings.dineInServiceRate || 0) / 100) : 0;
  const taxable = subtotal + packagingFee + serviceCharge;
  const tax = taxable * ((state.settings.taxRate || 0) / 100);
  const method = paymentById(state.paymentMethodId);
  const paymentFee = (taxable + tax) * ((method?.feeRate || 0) / 100);
  const customerPaymentFee = method?.feePayer === "customer" ? paymentFee : 0;
  return { subtotal, packagingFee, serviceCharge, tax, customerPaymentFee, total: taxable + tax + customerPaymentFee };
}

function packagingFeeEstimate() {
  if (!["Take Away", "Delivery"].includes(state.serviceType)) return 0;
  const qty = state.cart.reduce((sum, line) => sum + line.qty, 0);
  const rule = (state.settings.packagingRules || []).find((item) => !isInactiveStatus(item.status) && qty >= item.minQty && qty <= item.maxQty);
  return rule ? (rule.items || []).reduce((sum, line) => sum + Number(line.price || 0) * Number(line.qty || 0), 0) : 0;
}

function productById(id) {
  return state.products.find((product) => product.id === id);
}

function paymentById(id) {
  return activePaymentMethods().find((method) => method.id === id);
}

function activeOutletName() {
  return activeOutlet().name || "Outlet";
}

function activeOutlet() {
  return state.outlets.find((outlet) => outlet.id === state.outletId) || {};
}

function resolveOutletId() {
  if (state.outletId) return state.outletId;
  if (state.outlets.length === 1) {
    state.outletId = state.outlets[0].id;
    state.outletConfirmed = true;
    return state.outletId;
  }
  return "";
}

function resolveOutletNumericId() {
  const outlet = activeOutlet();
  return Number(outlet.numericId || 0) || 0;
}

function outletLabel(outlet = activeOutlet()) {
  const name = outlet.name || activeOutletName();
  return outlet.code ? `${name} (${outlet.code})` : name;
}

function lineKey(productId, modifierIds = []) {
  return `${productId}:${[...modifierIds].sort().join(",")}`;
}

function lineUnitPrice(product, line = {}) {
  return (Number(product?.price || 0) + modifierPrice(product || {}, line.modifierIds || [], state));
}

function modifierNames(product, modifierIds = []) {
  return productModifierOptions(state, product || {})
    .filter((modifier) => modifierIds.includes(modifier.id))
    .map((modifier) => `${modifier.groupName}: ${modifier.name}`)
    .join(", ");
}

function requiresModifierChoice(product) {
  return productModifierOptions(state, product || {}).length > 0;
}

function addProduct(productId) {
  const product = productById(productId);
  if (!product || product.soldOut || Number(product.availableQty || 0) <= 0) return;
  openMenuDetail(product);
}

function addConfiguredProduct(productId, modifierIds = [], qty = 1) {
  const product = productById(productId);
  if (!product) return;
  const activePage = flipbookReady && flipbook()?.length ? flipbook().turn("page") : pageForSpread("menu");
  const quantity = Math.max(1, Number(qty || 1));
  const key = lineKey(productId, modifierIds);
  const current = state.cart.find((line) => line.id === key);
  const available = maxQtyForConfig(product, modifierIds, current?.id || "");
  if (current) {
    if (current.qty + quantity > available) {
      showFeedback(`Pilihan ini tersisa ${Math.max(0, available - current.qty)} item lagi.`, true);
      return;
    }
    current.qty += quantity;
  } else {
    if (available <= 0) {
      showFeedback("Maaf, pilihan ini sedang tidak tersedia.", true);
      return;
    }
    if (quantity > available) {
      showFeedback(`Pilihan ini tersedia ${available} item.`, true);
      return;
    }
    state.cart.push({ id: key, productId, modifierIds: [...modifierIds], qty: quantity });
  }
  markCartChanged();
  closeMenuDetail();
  state.spread = "menu";
  renderProducts();
  renderCart();
  renderBill();
  rebuildFlipbook(activePage);
  renderSpread(false);
}

function setConfiguredProductQty(productId, modifierIds = [], qty = 1, options = {}) {
  const product = productById(productId);
  if (!product) return;
  const activePage = flipbookReady && flipbook()?.length ? flipbook().turn("page") : pageForSpread("menu");
  const quantity = Math.max(1, Number(qty || 1));
  const key = lineKey(productId, modifierIds);
  const current = state.cart.find((line) => line.id === key);
  const available = maxQtyForConfig(product, modifierIds, current?.id || "");
  if (quantity > available) {
    showFeedback(`Pilihan ini tersedia ${available} item.`, true);
    return;
  }
  if (current) current.qty = quantity;
  else state.cart.push({ id: key, productId, modifierIds: [...modifierIds], qty: quantity });
  markCartChanged();
  closeMenuDetail();
  state.spread = options.spread || "menu";
  renderProducts();
  renderCart();
  renderBill();
  rebuildFlipbook(activePage);
  renderSpread(false);
}

function detailQty() {
  return Math.max(0, Number(optionalById("order-detail-qty")?.value || 1));
}

function selectedDetailModifierIds() {
  return [...byId("order-modifier-form").querySelectorAll(".public-modifier-option input:checked")].map((input) => input.value);
}

function cartLineForConfig(productId, modifierIds = []) {
  return state.cart.find((line) => line.id === lineKey(productId, modifierIds));
}

function selectedDetailLineId(productId, modifierIds = []) {
  const selectedLineId = byId("order-detail-line-id").value;
  const selectedLine = state.cart.find((line) => line.id === selectedLineId);
  if (selectedLine?.id === lineKey(productId, modifierIds)) return selectedLine.id;
  return cartLineForConfig(productId, modifierIds)?.id || "";
}

function cartStockReservations(excludeLineId = "") {
  const excludedLineIds = new Set(Array.isArray(excludeLineId) ? excludeLineId.filter(Boolean) : [excludeLineId].filter(Boolean));
  const reservations = { products: new Map(), ingredients: new Map() };
  state.cart
    .filter((line) => !excludedLineIds.has(line.id))
    .forEach((line) => {
      const product = productById(line.productId);
      if (!product) return;
      const qty = Number(line.qty || 0);
      if (isStockedProduct(product)) {
        reservations.products.set(product.id, (reservations.products.get(product.id) || 0) + qty);
        return;
      }
      effectiveRecipe(product, line.modifierIds || [], state).forEach((recipeLine) => {
        const usedQty = Number(recipeLine.qty || 0) * qty;
        reservations.ingredients.set(recipeLine.ingredientId, (reservations.ingredients.get(recipeLine.ingredientId) || 0) + usedQty);
      });
    });
  return reservations;
}

function maxQtyForConfig(product, modifierIds = [], excludeLineId = "") {
  if (!product) return 0;
  const reservations = cartStockReservations(excludeLineId);
  if (isStockedProduct(product)) {
    return Math.max(0, Math.floor(Number(product.finishedStock || 0) - (reservations.products.get(product.id) || 0)));
  }
  const recipe = effectiveRecipe(product, modifierIds, state);
  if (!recipe.length) return 0;
  return Math.max(0, Math.min(...recipe.map((line) => {
    const ingredient = ingredientById(state, line.ingredientId);
    const perItemQty = Number(line.qty || 0);
    if (!ingredient || isInactiveStatus(ingredient.status) || perItemQty <= 0) return 0;
    const remaining = Number(ingredient.stock || 0) - (reservations.ingredients.get(line.ingredientId) || 0);
    return Math.floor(remaining / perItemQty);
  })));
}

function stockNote(product, modifierIds = [], maxQty = 0) {
  if (!product) return "";
  return maxQty > 0 ? `Tersedia ${maxQty} item untuk pilihan ini.` : "Maaf, pilihan ini sedang tidak tersedia.";
}

function updateDetailQty(delta = 0) {
  const input = byId("order-detail-qty");
  const product = productById(byId("order-modifier-product-id").value);
  const modifierIds = selectedDetailModifierIds();
  const selectedLineId = product ? selectedDetailLineId(product.id, modifierIds) : "";
  const originalLineId = byId("order-detail-edit-mode").value === "1" ? byId("order-detail-original-line-id").value : "";
  const maxQty = product ? maxQtyForConfig(product, modifierIds, [selectedLineId, originalLineId].filter(Boolean)) : 1;
  const next = maxQty <= 0 ? 0 : Math.min(maxQty, Math.max(1, Number(input.value || 1) + delta));
  input.value = String(next);
  byId("order-detail-qty-label").textContent = String(next);
  byId("order-detail-line-total").textContent = money(lineUnitPrice(product, { modifierIds }) * next);
  byId("order-detail-stock-note").textContent = stockNote(product, modifierIds, maxQty);
}

function syncDetailSelectionWithCart() {
  const productId = byId("order-modifier-product-id").value;
  const modifierIds = selectedDetailModifierIds();
  const existingLine = cartLineForConfig(productId, modifierIds);
  const originalLine = state.cart.find((line) => line.id === byId("order-detail-original-line-id").value);
  const isEditingCartLine = byId("order-detail-edit-mode").value === "1";
  byId("order-detail-line-id").value = existingLine?.id || "";
  byId("order-existing-configs").querySelectorAll("[data-repeat-config]").forEach((button) => {
    button.classList.toggle("active", existingLine?.id === button.dataset.repeatConfig);
  });
  byId("order-detail-qty").value = existingLine ? String(existingLine.qty) : isEditingCartLine && originalLine ? String(originalLine.qty) : "1";
}

function selectDetailConfig(lineId) {
  const line = state.cart.find((item) => item.id === lineId);
  if (!line) return;
  byId("order-detail-line-id").value = line.id;
  byId("order-existing-configs").querySelectorAll("[data-repeat-config]").forEach((button) => {
    button.classList.toggle("active", button.dataset.repeatConfig === line.id);
  });
  byId("order-detail-qty").value = String(line.qty);
  byId("order-modifier-form").querySelectorAll(".public-modifier-option input").forEach((input) => {
    input.checked = (line.modifierIds || []).includes(input.value);
  });
  updateDetailQty(0);
}

function changeQty(lineId, delta) {
  const current = state.cart.find((line) => line.id === lineId);
  const product = productById(current?.productId);
  if (!current || !product) return;
  const next = current.qty + delta;
  if (next <= 0) state.cart = state.cart.filter((line) => line.id !== lineId);
  else {
    const maxQty = maxQtyForConfig(product, current.modifierIds || [], current.id);
    if (next > maxQty) {
      showFeedback(`Pilihan ini tersisa ${Math.max(0, maxQty - current.qty)} item lagi.`, true);
      return;
    }
    current.qty = next;
  }
  markCartChanged();
  renderProducts();
  renderCart();
  renderBill();
  renderSpread();
}

function openCartLineEditor(lineId) {
  const line = state.cart.find((item) => item.id === lineId);
  const product = productById(line?.productId);
  if (!line || !product) return;
  openMenuDetail(product, line, true);
}

function openMenuDetail(product, preferredLine = null, editMode = false) {
  const defaultLine = preferredLine || state.cart.find((line) => line.productId === product.id);
  const defaultQty = defaultLine ? defaultLine.qty : 1;
  byId("order-modifier-product-id").value = product.id;
  byId("order-detail-line-id").value = defaultLine?.id || "";
  byId("order-detail-original-line-id").value = defaultLine?.id || "";
  byId("order-detail-edit-mode").value = editMode ? "1" : "0";
  byId("order-detail-submit-label").textContent = editMode ? "Simpan Perubahan" : "Masukkan Cart";
  byId("order-detail-qty").value = String(defaultQty);
  byId("order-detail-qty-label").textContent = String(defaultQty);
  byId("order-detail-name").textContent = product.name;
  byId("order-detail-description").textContent = product.description || product.category || "Produk tersedia";
  byId("order-detail-price").textContent = money(product.price);
  byId("order-detail-photo").innerHTML = product.imageUrl
    ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" />`
    : `<span>${escapeHtml((product.name || "?").slice(0, 1))}</span>`;
  const groups = productModifierOptions(state, product).reduce((map, option) => {
    if (!map.has(option.groupId)) {
      map.set(option.groupId, {
        id: option.groupId,
        name: option.groupName,
        required: option.groupRequired,
        choiceType: option.groupChoiceType || "multiple",
        options: []
      });
    }
    map.get(option.groupId).options.push(option);
    return map;
  }, new Map());
  const existingLines = state.cart.filter((line) => line.productId === product.id);
  const existingPanel = byId("order-existing-configs");
  existingPanel.hidden = existingLines.length === 0;
  existingPanel.innerHTML = existingLines.length ? `
    <strong>Sudah ada di cart</strong>
    ${existingLines.map((line) => `
      <button class="${defaultLine?.id === line.id ? "active" : ""}" data-repeat-config="${escapeHtml(line.id)}" type="button">
        <span>${escapeHtml(modifierNames(product, line.modifierIds || []) || "Tanpa modifier")}</span>
        <small>${line.qty} item di cart · lanjutkan atau buat pilihan baru</small>
      </button>
    `).join("")}
  ` : "";
  byId("order-modifier-options").innerHTML = [...groups.values()].map((group) => `
    <fieldset class="public-modifier-group" data-required-modifier-group="${group.required ? group.id : ""}">
      <legend>${escapeHtml(group.name)} <small>${group.required ? "Wajib" : "Opsional"} · ${group.choiceType === "single" ? "pilih satu" : "bisa pilih beberapa"}</small></legend>
      ${group.options.map((option) => `
        <label class="public-modifier-option">
          <input name="modifier-${escapeHtml(group.id)}" type="${group.choiceType === "single" ? "radio" : "checkbox"}" value="${escapeHtml(option.id)}" />
          <span><strong>${escapeHtml(option.name)}</strong><small>${Number(option.priceDelta || 0) ? `+ ${money(option.priceDelta)}` : "Tanpa tambahan harga"}</small></span>
        </label>
      `).join("")}
    </fieldset>
  `).join("") || `<div class="empty-state compact">Tidak ada modifier untuk produk ini.</div>`;
  if (defaultLine) {
    byId("order-modifier-form").querySelectorAll(".public-modifier-option input").forEach((input) => {
      input.checked = (defaultLine.modifierIds || []).includes(input.value);
    });
  }
  updateDetailQty(0);
  byId("order-menu-detail").hidden = false;
}

function closeMenuDetail() {
  byId("order-menu-detail").hidden = true;
  byId("order-modifier-form").reset();
  byId("order-detail-line-id").value = "";
  byId("order-detail-original-line-id").value = "";
  byId("order-detail-edit-mode").value = "0";
  byId("order-detail-submit-label").textContent = "Masukkan Cart";
  byId("order-detail-qty").value = "1";
}

let memberTimer = null;
function lookupMember() {
  const name = byId("order-customer-name").value.trim();
  const outletId = resolveOutletNumericId() || resolveOutletId();
  if (name.length < 2 || !outletId) {
    byId("order-member-suggestions").hidden = true;
    return;
  }
  clearTimeout(memberTimer);
  memberTimer = setTimeout(async () => {
    try {
      const query = new URLSearchParams({ outlet_id: outletId, name });
      if (companySlug()) query.set("company", companySlug());
      const members = await requestJson(`/api/page/order/member?${query.toString()}`);
      renderMemberSuggestions(members);
    } catch {
      byId("order-member-suggestions").hidden = true;
    }
  }, 280);
}

function renderMemberSuggestions(members) {
  const target = byId("order-member-suggestions");
  target.hidden = !members.length;
  target.innerHTML = members.map((member) => `
    <button data-member-fill="${escapeHtml(member.id)}" data-name="${escapeHtml(member.name)}" data-email="${escapeHtml(member.email)}" data-phone="${escapeHtml(member.phone)}" type="button">
      <strong>${escapeHtml(member.name)}</strong><span>${escapeHtml(member.email)}</span>
    </button>
  `).join("");
}

async function submitOrder() {
  const outletId = resolveOutletId();
  if (!canContinue("checkout")) {
    showFeedback(validationMessage(), true);
    return;
  }
  setBusy(true, "Menyimpan order...");
  showFeedback("");
  try {
    if (paymentRequiresProof() && !state.paymentProof?.dataUrl) {
      throw new Error("Upload bukti bayar terlebih dahulu.");
    }
    const outletNumericId = resolveOutletNumericId();
    const payload = {
      companySlug: companySlug(),
      outletId,
      outlet_id: outletNumericId || outletId,
      serviceType: state.serviceType,
      tableName: state.tableName,
      items: state.cart,
      customerName: byId("order-customer-name").value.trim(),
      customerEmail: byId("order-customer-email").value.trim().toLowerCase(),
      customerPhone: byId("order-customer-phone").value.trim(),
      customerMemberId: state.selectedMemberId || "",
      registerMember: state.selectedMemberId ? false : byId("order-register-member").checked,
      paymentMethodId: state.paymentMethodId,
      paymentProof: paymentRequiresProof() ? state.paymentProof : null
    };
    state.orderResult = await requestJson("/api/page/order/submit", { method: "POST", body: JSON.stringify(payload) });
    state.spread = "receipt";
    render();
    showFeedback("");
  } catch (error) {
    showFeedback(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function lookupPreviousOrder() {
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
    state.orderResult = await requestJson(`/api/page/order/status?${query.toString()}`);
    state.spread = "receipt";
    render();
    turnToPage(receiptStartPage(), true);
    showFeedback("");
  } catch (error) {
    showFeedback(error.message, true);
  } finally {
    setBusy(false);
  }
}

function readProofFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      reject(new Error("Ukuran bukti bayar maksimal 3 MB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: String(reader.result || "") });
    reader.onerror = () => reject(new Error("Bukti bayar gagal dibaca."));
    reader.readAsDataURL(file);
  });
}

function resetOrder() {
  sessionStorage.removeItem(orderSessionKey());
  state.cart = [];
  state.orderResult = null;
  state.cartConfirmed = false;
  state.selectedMemberId = "";
  state.categoryId = "all";
  if (optionalById("order-search")) byId("order-search").value = "";
  if (optionalById("order-status-lookup-input")) byId("order-status-lookup-input").value = "";
  optionalById("order-customer-form")?.reset();
  syncSelectedMemberFields();
  state.spread = "cover";
  render();
  forceTurnToElement(".public-cover-page:not(.public-back-cover-page)", coverStartPage());
  showFeedback("");
}

function showFeedback(message, error = false) {
  byId("order-feedback").textContent = message;
  byId("order-feedback").classList.toggle("error", error);
}

function setBusy(active, message = "Memproses...") {
  document.body.classList.toggle("app-busy", active);
  setText("order-status", active ? message : `${activeOutletName()} · ${state.serviceType}`);
}

function interactiveSwipeTarget(target) {
  return Boolean(target.closest("button, input, textarea, select, label, form, .public-menu-detail, .public-order-tabs"));
}

function bindBookSwipe() {
  if (flipbookReady) return;
  const frame = byId("order-book-frame");
  let startX = 0;
  let startY = 0;
  let tracking = false;

  const start = (clientX, clientY, target) => {
    if (interactiveSwipeTarget(target)) return;
    startX = clientX;
    startY = clientY;
    tracking = true;
  };

  const finish = (clientX, clientY) => {
    if (!tracking) return;
    tracking = false;
    const deltaX = clientX - startX;
    const deltaY = clientY - startY;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.15) return;
    const isForwardSwipe = deltaX < 0;
    if (isForwardSwipe && !canFreeTurnToPage(currentBookPage() + 1)) {
      showFeedback("Gunakan tombol di halaman ini untuk melanjutkan.", true);
      return;
    }
    if (isForwardSwipe) turnNextPage();
    else turnPrevPage();
  };

  frame.addEventListener("pointerdown", (event) => {
    start(event.clientX, event.clientY, event.target);
  });

  frame.addEventListener("pointerup", (event) => {
    finish(event.clientX, event.clientY);
  });

  frame.addEventListener("pointercancel", () => {
    tracking = false;
  });

  frame.addEventListener("touchstart", (event) => {
    if (window.PointerEvent) return;
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    start(touch.clientX, touch.clientY, event.target);
  }, { passive: true });

  frame.addEventListener("touchend", (event) => {
    if (window.PointerEvent) return;
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    finish(touch.clientX, touch.clientY);
  }, { passive: true });

  frame.addEventListener("touchcancel", () => {
    tracking = false;
  }, { passive: true });
}

window.addEventListener("resize", resizeFlipbook);

function bindDynamicFieldListeners() {
  optionalById("order-search")?.addEventListener("input", renderProducts);
  optionalById("order-grid-size-select")?.addEventListener("change", (event) => {
    if (isMobileMenu()) {
      state.menuMobileLimit = Number(event.target.value || 5);
    } else {
      state.menuGridSize = Number(event.target.value || 3);
    }
    renderProducts();
  });
  optionalById("order-customer-name")?.addEventListener("input", () => {
    if (!optionalById("order-customer-name")?.readOnly) {
      state.selectedMemberId = "";
      syncSelectedMemberFields();
    }
    lookupMember();
    renderBill();
    renderSpread(false);
  });
  ["order-customer-email", "order-customer-phone", "order-register-member"].forEach((id) => {
    optionalById(id)?.addEventListener("input", () => {
      renderBill();
      renderSpread(false);
    });
    optionalById(id)?.addEventListener("change", () => {
      renderBill();
      renderSpread(false);
    });
  });
  optionalById("order-payment-proof-file")?.addEventListener("change", async (event) => {
    try {
      state.paymentProof = await readProofFile(event.target.files?.[0] || null);
      renderPaymentProofInput();
      renderSpread(false);
    } catch (error) {
      state.paymentProof = null;
      event.target.value = "";
      renderPaymentProofInput();
      showFeedback(error.message, true);
    }
  });
  optionalById("order-customer-form")?.addEventListener("submit", (event) => event.preventDefault());
  optionalById("order-status-lookup-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    lookupPreviousOrder();
  });
  optionalById("order-modifier-form")?.addEventListener("submit", handleModifierSubmit);
  optionalById("order-modifier-form")?.addEventListener("change", (event) => {
    if (event.target.matches(".public-modifier-option input")) {
      syncDetailSelectionWithCart();
      updateDetailQty(0);
    }
  });
}

function handleModifierSubmit(event) {
  event.preventDefault();
  const missingRequired = [...event.target.querySelectorAll("[data-required-modifier-group]")]
    .filter((group) => group.dataset.requiredModifierGroup && !group.querySelector("input:checked"));
  if (missingRequired.length) {
    showFeedback("Pilih opsi modifier wajib terlebih dahulu.", true);
    return;
  }
  const modifierIds = [...event.target.querySelectorAll(".public-modifier-option input:checked")].map((input) => input.value);
  const productId = byId("order-modifier-product-id").value;
  const selectedKey = lineKey(productId, modifierIds);
  const isEditingCartLine = byId("order-detail-edit-mode").value === "1";
  const originalLineId = byId("order-detail-original-line-id").value;
  if (isEditingCartLine && originalLineId && originalLineId !== selectedKey) {
    state.cart = state.cart.filter((line) => line.id !== originalLineId);
    setConfiguredProductQty(productId, modifierIds, detailQty(), { spread: state.spread });
  } else if (byId("order-detail-line-id").value === selectedKey) {
    setConfiguredProductQty(productId, modifierIds, detailQty(), { spread: state.spread });
  } else {
    addConfiguredProduct(productId, modifierIds, detailQty());
  }
}

document.addEventListener("click", (event) => {
  const outletButton = event.target.closest("[data-outlet-id]");
  if (outletButton) {
    loadOrderData(outletButton.dataset.outletId);
    return;
  }

  const addButton = event.target.closest("[data-add-product]");
  if (addButton) {
    addProduct(addButton.dataset.addProduct);
    return;
  }

  const productCardButton = event.target.closest("[data-product-card]");
  if (productCardButton && !event.target.closest("button, input, select, textarea, label")) {
    addProduct(productCardButton.dataset.productCard);
    return;
  }

  if (event.target.closest("[data-close-menu-detail]")) closeMenuDetail();

  const detailPlus = event.target.closest("[data-detail-qty-plus]");
  if (detailPlus) updateDetailQty(1);

  const detailMinus = event.target.closest("[data-detail-qty-minus]");
  if (detailMinus) updateDetailQty(-1);

  const repeatButton = event.target.closest("[data-repeat-config]");
  if (repeatButton) {
    selectDetailConfig(repeatButton.dataset.repeatConfig);
  }

  const plusButton = event.target.closest("[data-cart-plus]");
  if (plusButton) changeQty(plusButton.dataset.cartPlus, 1);

  const minusButton = event.target.closest("[data-cart-minus]");
  if (minusButton) changeQty(minusButton.dataset.cartMinus, -1);

  const editCartLine = event.target.closest("[data-edit-cart-line]");
  if (editCartLine) {
    openCartLineEditor(editCartLine.dataset.editCartLine);
    return;
  }

  if (event.target.closest("#order-confirm-cart")) {
    if (!state.cart.length) {
      showFeedback("Pilih minimal satu menu terlebih dahulu.", true);
      return;
    }
    state.cartConfirmed = true;
    render();
    showFeedback("");
    turnToPage(customerPageNumber(), true);
    return;
  }

  const serviceButton = event.target.closest("[data-service-type]");
  if (serviceButton) {
    state.serviceType = serviceButton.dataset.serviceType;
    if (!needsTableSelection()) state.tableName = "";
    renderServiceTypes();
    renderTables();
    renderCart();
    renderSpread();
  }

  const tableButton = event.target.closest("[data-table-name]");
  if (tableButton) {
    state.tableName = tableButton.dataset.tableName || "";
    renderTables();
    renderSpread();
  }

  const categoryButton = event.target.closest("[data-category-id]");
  if (categoryButton) {
    state.categoryId = categoryButton.dataset.categoryId;
    renderCategories();
    renderProducts();
  }

  const paymentButton = event.target.closest("[data-payment-id]");
  if (paymentButton) {
    state.paymentMethodId = paymentButton.dataset.paymentId;
    state.paymentProof = null;
    if (optionalById("order-payment-proof-file")) byId("order-payment-proof-file").value = "";
    renderPayments();
    renderCart();
    renderSpread();
  }

  const memberButton = event.target.closest("[data-member-fill]");
  if (memberButton) {
    state.selectedMemberId = memberButton.dataset.memberFill || "";
    byId("order-customer-name").value = memberButton.dataset.name || "";
    byId("order-customer-email").value = memberButton.dataset.email || "";
    byId("order-customer-phone").value = memberButton.dataset.phone || "";
    byId("order-member-suggestions").hidden = true;
    syncSelectedMemberFields();
    renderBill();
    renderSpread(false);
  }

  if (event.target.closest("[data-clear-selected-member]")) {
    state.selectedMemberId = "";
    byId("order-customer-name").readOnly = false;
    syncSelectedMemberFields();
    lookupMember();
    renderSpread(false);
  }

  const timelineToggle = event.target.closest("[data-toggle-order-timeline]");
  if (timelineToggle) {
    const card = timelineToggle.closest("[data-order-status-card]");
    const isCollapsed = card.classList.toggle("is-collapsed");
    timelineToggle.setAttribute("aria-expanded", String(!isCollapsed));
    return;
  }

  const jumpButton = event.target.closest("[data-jump-spread]");
  if (jumpButton && canJumpTo(jumpButton.dataset.jumpSpread)) {
    state.spread = jumpButton.dataset.jumpSpread;
    renderSpread();
  }

  if (event.target.closest("#order-reset-cover")) resetOrder();
  if (event.target.closest("#order-submit")) submitOrder();
});

document.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;
  const productCardButton = event.target.closest?.("[data-product-card]");
  if (!productCardButton) return;
  event.preventDefault();
  addProduct(productCardButton.dataset.productCard);
});
byId("order-book-hit-next").addEventListener("click", turnNextPage);
byId("order-book-hit-prev").addEventListener("click", turnPrevPage);
pristineBookTemplate = byId("order-flipbook").innerHTML;
bindDynamicFieldListeners();
bindBookSwipe();

loadOrderData();
