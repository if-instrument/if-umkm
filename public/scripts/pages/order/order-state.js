export const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export const serviceTypes = [
  { key: "dineIn", label: "Dine In" },
  { key: "takeAway", label: "Take Away" },
  { key: "delivery", label: "Delivery" }
];

export const state = {
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
  paymentMethodId: "",
  paymentProof: null,
  cartConfirmed: false,
  selectedMemberId: "",
  spread: "cover",
  outletConfirmed: false,
  orderResult: null,
  orderStatus: "NEW_ORDER"
};

export const bookState = {
  flipbookReady: false,
  syncingFlipbook: false,
  forcedBookTurn: false,
  pristineBookTemplate: ""
};

export function money(value) {
  return rupiah.format(Math.round(Number(value || 0)));
}

export function syncOrderStatus() {
  if (state.orderResult) {
    state.orderStatus = "ORDER_CREATED";
    return;
  }
  
  if (state.cart.length === 0) {
    state.orderStatus = "NEW_ORDER";
    state.cartConfirmed = false;
    return;
  }
  
  if (state.cartConfirmed) {
    const customerName = document.getElementById("order-customer-name")?.value?.trim() || "";
    const customerEmail = document.getElementById("order-customer-email")?.value?.trim() || "";
    const customerPhone = document.getElementById("order-customer-phone")?.value?.trim() || "";
    const isEmailValid = document.getElementById("order-customer-email")?.checkValidity() ?? false;
    const customerValid = Boolean(customerName && customerEmail && customerPhone && isEmailValid);

    if (customerValid) {
      if (state.paymentMethodId) {
        state.orderStatus = "PAYMENT_COMPLETED";
      } else {
        state.orderStatus = "CUSTOMER_COMPLETED";
      }
    } else {
      state.orderStatus = "CONFIRMED";
    }
  } else {
    state.orderStatus = "MENU_SELECTED";
  }
}
