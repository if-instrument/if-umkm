import { effectiveRecipe, ingredientById, isPreorderStockedProduct, isStockedProduct, modifierPrice, productModifierOptions } from "../../inventory.js";
import { isActiveStatus, isInactiveStatus } from "../../status-codes.js";
import { state, bookState, serviceTypes, money } from "./order-state.js";

// We will dynamically import render when needed or we can reference it,
// but to avoid circular dependencies, we can receive or import it if needed.
// Wait! loadOrderData and normalizeSelections call render() and other functions.
// Let's import render from './order-render.js' dynamically inside the function, or import it at top.
// Wait, is render() a circular dependency?
// order-render.js imports order-utils.js. If order-utils.js imports order-render.js, that's circular.
// In ES modules, circular imports are allowed, but it's safer to avoid them by calling a callback,
// or importing dynamically inside functions, or importing them at top (since ES module bindings are live).
// Yes, live bindings make circular imports work perfectly fine if functions are called after load.
// Let's import render at the top or dynamically when called.
// Let's import dynamically inside the function: `const { render } = await import("./order-render.js");`
// Or even simpler: we can pass a reference or just use live binding `import { render } from "./order-render.js";`

export function byId(id) {
  return document.getElementById(id);
}

export function optionalById(id) {
  return document.getElementById(id);
}

export function setText(id, value) {
  const element = optionalById(id);
  if (element) element.textContent = value;
}

export function setSrc(id, value) {
  const element = optionalById(id);
  if (element) element.src = value;
}

export function hexToRgb(hex) {
  const normalized = String(hex || "").replace("#", "").trim();
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;
  if (!/^[0-9a-f]{6}$/i.test(value)) return { r: 110, g: 58, b: 22 };
  const number = parseInt(value, 16);
  return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 };
}

export function mixRgb(a, b, weight = 0.5) {
  return {
    r: Math.round(a.r * (1 - weight) + b.r * weight),
    g: Math.round(a.g * (1 - weight) + b.g * weight),
    b: Math.round(a.b * (1 - weight) + b.b * weight)
  };
}

export function rgbCss(rgb) {
  return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
}

export function relativeLuminance(rgb) {
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return (0.2126 * channel(rgb.r)) + (0.7152 * channel(rgb.g)) + (0.0722 * channel(rgb.b));
}

export function readableTextFor(rgb) {
  return relativeLuminance(rgb) > 0.48 ? "#2c2018" : "#fffaf3";
}

export function setOrderCssVariable(name, value) {
  document.documentElement.style.setProperty(name, value);
  document.body?.style.setProperty(name, value);
}

export function orderContent() {
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

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

export function companySlug() {
  return window.__COMPANY_SLUG__ || new URLSearchParams(window.location.search).get("company") || "";
}

export function orderSessionKey() {
  return `if-instrument-public-order:${companySlug() || "global"}`;
}

export function readOrderSession() {
  try {
    return JSON.parse(sessionStorage.getItem(orderSessionKey()) || "{}") || {};
  } catch {
    return {};
  }
}

export function persistOrderSession() {
  if (state.orderStatus === "ORDER_CREATED" && state.orderResult?.order?.orderNumber) {
    const payload = {
      orderNumber: state.orderResult.order.orderNumber,
      orderStatus: "ORDER_CREATED"
    };
    sessionStorage.setItem(orderSessionKey(), JSON.stringify(payload));
    return;
  }
  
  const payload = {
    outletId: state.outletId,
    outletConfirmed: state.outletConfirmed,
    serviceType: state.serviceType,
    tableName: state.tableName,
    categoryId: state.categoryId,
    paymentMethodId: state.paymentMethodId,
    spread: state.spread,
    cartConfirmed: state.cartConfirmed,
    cart: state.cart
  };
  sessionStorage.setItem(orderSessionKey(), JSON.stringify(payload));
}

export async function requestJson(url, options = {}) {
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

export async function loadOrderData(outletId = "") {
  setBusy(true, "Memuat menu outlet...");
  try {
    const saved = readOrderSession();
    
    if (saved.orderStatus === "ORDER_CREATED" && saved.orderNumber) {
      const query = new URLSearchParams();
      if (companySlug()) query.set("company", companySlug());
      if (outletId) query.set("outlet_id", outletId);
      const data = await requestJson(`/api/page/order/bootstrap?${query.toString()}`);
      
      const statusQuery = new URLSearchParams({ q: saved.orderNumber });
      if (companySlug()) statusQuery.set("company", companySlug());
      if (data.activeOutletId) statusQuery.set("outlet_id", data.activeOutletId);
      
      const orderResult = await requestJson(`/api/page/order/status?${statusQuery.toString()}`);
      
      Object.assign(state, {
        company: data.company || {},
        outlets: data.outlets || [],
        settings: data.settings || {},
        categories: data.categories || [],
        products: data.products || [],
        modifiers: data.modifiers || [],
        ingredients: data.ingredients || [],
        outletId: orderResult?.order?.outletId || data.activeOutletId || "",
        outletConfirmed: true,
        serviceType: orderResult?.order?.serviceType || "Take Away",
        tableName: orderResult?.order?.tableName || "",
        categoryId: "all",
        paymentMethodId: orderResult?.order?.paymentMethodId || "",
        cartConfirmed: true,
        spread: "receipt",
        cart: [],
        orderResult: orderResult,
        orderStatus: "ORDER_CREATED"
      });
      
      normalizeSelections();
      const { render } = await import("./order-render.js");
      render();
      return;
    }

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
    
    Object.assign(state, {
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
      paymentMethodId: saved.paymentMethodId || state.paymentMethodId,
      cartConfirmed: outletChanged ? false : Boolean(saved.cartConfirmed),
      spread: saved.spread || state.spread,
      cart: outletChanged ? [] : (Array.isArray(saved.cart) ? saved.cart : state.cart),
      orderResult: outletChanged ? null : state.orderResult
    });
    
    normalizeSelections();
    const { render } = await import("./order-render.js");
    render();
  } catch (error) {
    showFeedback(error.message, true);
  } finally {
    setBusy(false);
  }
}

export function normalizeSelections() {
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

export function enabledServices() {
  const channels = state.settings.orderChannels || { takeAway: true };
  const active = serviceTypes.filter((item) => channels[item.key] === true || (item.key === "takeAway" && channels.takeAway !== false));
  return active.length ? active : serviceTypes.filter((item) => item.key === "takeAway");
}

export function activePaymentMethods() {
  return (state.settings.paymentMethods || []).filter((method) => isActiveStatus(method.status));
}

export function hasMultipleOutlets() {
  return state.outlets.length > 1;
}

export function hasSelectedOutlet() {
  return Boolean(state.outletId && state.outletConfirmed);
}

export function needsServiceChoice() {
  return enabledServices().length > 1;
}

export function shouldSkipServicePage() {
  return !needsServiceChoice();
}

export function calculateTotals() {
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

export function packagingFeeEstimate() {
  if (!["Take Away", "Delivery"].includes(state.serviceType)) return 0;
  const qty = state.cart.reduce((sum, line) => sum + line.qty, 0);
  const rule = (state.settings.packagingRules || []).find((item) => !isInactiveStatus(item.status) && qty >= item.minQty && qty <= item.maxQty);
  return rule ? (rule.items || []).reduce((sum, line) => sum + Number(line.price || 0) * Number(line.qty || 0), 0) : 0;
}

export function productById(id) {
  return state.products.find((product) => product.id === id);
}

export function paymentById(id) {
  return activePaymentMethods().find((method) => method.id === id);
}

export function activeOutletName() {
  return activeOutlet().name || "Outlet";
}

export function activeOutlet() {
  return state.outlets.find((outlet) => outlet.id === state.outletId) || {};
}

export function resolveOutletId() {
  if (state.outletId) return state.outletId;
  if (state.outlets.length === 1) {
    state.outletId = state.outlets[0].id;
    state.outletConfirmed = true;
    return state.outletId;
  }
  return "";
}

export function resolveOutletNumericId() {
  const outlet = activeOutlet();
  return Number(outlet.numericId || 0) || 0;
}

export function outletLabel(outlet = activeOutlet()) {
  const name = outlet.name || activeOutletName();
  return outlet.code ? `${name} (${outlet.code})` : name;
}

export function lineKey(productId, modifierIds = []) {
  return `${productId}:${[...modifierIds].sort().join(",")}`;
}

export function lineUnitPrice(product, line = {}) {
  return (Number(product?.price || 0) + modifierPrice(product || {}, line.modifierIds || [], state));
}

export function modifierNames(product, modifierIds = []) {
  return productModifierOptions(state, product || {})
    .filter((modifier) => modifierIds.includes(modifier.id))
    .map((modifier) => `${modifier.groupName}: ${modifier.name}`)
    .join(", ");
}

export function requiresModifierChoice(product) {
  return productModifierOptions(state, product || {}).length > 0;
}

export function showFeedback(message, error = false) {
  byId("order-feedback").textContent = message;
  byId("order-feedback").classList.toggle("error", error);
}

export function setBusy(active, message = "Memproses...") {
  document.body.classList.toggle("app-busy", active);
  setText("order-status", active ? message : `${activeOutletName()} · ${state.serviceType}`);
}
