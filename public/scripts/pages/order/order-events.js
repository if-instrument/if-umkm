import { state, bookState } from "./order-state.js";
import {
  byId,
  optionalById,
  showFeedback,
  loadOrderData,
  activePaymentMethods,
  paymentById,
  needsServiceChoice,
  setBusy,
  persistOrderSession
} from "./order-utils.js";
import {
  currentBookPage,
  canFreeTurnToPage,
  turnNextPage,
  turnPrevPage,
  canJumpTo
} from "./order-navigation.js";
import { renderSpread, renderBill } from "./order-render.js";

// Page modules
import {
  renderProducts,
  renderCategories,
  addProduct,
  closeMenuDetail,
  updateDetailQty,
  selectDetailConfig,
  handleModifierSubmit,
  syncDetailSelectionWithCart
} from "./pages/page-3-book-menu.js";
import {
  syncSelectedMemberFields,
  lookupMember,
  renderPaymentProofInput,
  readProofFile,
  submitOrder,
  paymentRequiresProof,
  renderPayments,
  renderCustomerGate
} from "./pages/page-5-customer-detail.js";
import {
  renderCart,
  changeQty,
  openCartLineEditor
} from "./pages/page-4-cart.js";
import { renderServiceTypes, renderTables } from "./pages/page-2-select-service.js";
import { lookupPreviousOrder } from "./pages/page-6-summary.js";
import { resetOrder } from "./pages/page-7-success.js";

export function bindDynamicFieldListeners() {
  optionalById("order-search")?.addEventListener("input", renderProducts);
  optionalById("order-category-select")?.addEventListener("change", (event) => {
    state.categoryId = event.target.value || "all";
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
  const lookupForm = optionalById("order-status-lookup-form");
  if (lookupForm) {
    const stopBubbling = (e) => e.stopPropagation();
    lookupForm.addEventListener("mousedown", stopBubbling);
    lookupForm.addEventListener("touchstart", stopBubbling);
    lookupForm.addEventListener("pointerdown", stopBubbling);
    lookupForm.addEventListener("click", stopBubbling);
    lookupForm.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      lookupPreviousOrder();
    });
  }
  const lookupInput = optionalById("order-status-lookup-input");
  if (lookupInput) {
    const handleClear = () => {
      const val = lookupInput.value.trim();
      if (!val) {
        state.lastOrderNumber = "";
        state.orderResult = null;
        state.orderStatus = "NEW_ORDER";
        persistOrderSession();
        import("./order-render.js").then(({ render }) => {
          render();
        });
      }
    };
    lookupInput.addEventListener("input", handleClear);
    lookupInput.addEventListener("search", handleClear);
  }
  optionalById("order-modifier-form")?.addEventListener("submit", handleModifierSubmit);
  optionalById("order-modifier-form")?.addEventListener("change", (event) => {
    if (event.target.matches(".public-modifier-option input")) {
      syncDetailSelectionWithCart();
      updateDetailQty(0);
    }
  });
  optionalById("order-book-hit-next")?.addEventListener("click", turnNextPage);
  optionalById("order-book-hit-prev")?.addEventListener("click", turnPrevPage);
}

export function bindBookSwipe() {
  const frame = byId("order-book-frame");
  if (!frame || frame.dataset.swipeBound === "true") return;
  frame.dataset.swipeBound = "true";

  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let tracking = false;

  const start = (clientX, clientY, target) => {
    if (interactiveSwipeTarget(target)) return;
    startX = clientX;
    startY = clientY;
    currentX = clientX;
    currentY = clientY;
    tracking = true;
  };

  const move = (clientX, clientY, event) => {
    if (!tracking) return;
    currentX = clientX;
    currentY = clientY;
    const deltaX = currentX - startX;
    const deltaY = currentY - startY;
    if (Math.abs(deltaX) > Math.abs(deltaY) * 1.1 && Math.abs(deltaX) > 10) {
      if (event && event.cancelable) {
        event.preventDefault();
      }
    }
  };

  const finish = (clientX, clientY) => {
    if (!tracking) return;
    tracking = false;
    const deltaX = (clientX || currentX) - startX;
    const deltaY = (clientY || currentY) - startY;
    if (Math.abs(deltaX) < 32 || Math.abs(deltaX) < Math.abs(deltaY) * 1.1) return;
    const isForwardSwipe = deltaX < 0;
    if (isForwardSwipe && !canFreeTurnToPage(currentBookPage() + 1)) {
      showFeedback("Gunakan tombol di halaman ini untuk melanjutkan.", true);
      return;
    }
    if (isForwardSwipe) turnNextPage();
    else turnPrevPage();
  };

  frame.addEventListener("touchstart", (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    start(touch.clientX, touch.clientY, event.target);
  }, { passive: true });

  frame.addEventListener("touchmove", (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    move(touch.clientX, touch.clientY, event);
  }, { passive: false });

  frame.addEventListener("touchend", (event) => {
    const touch = event.changedTouches?.[0];
    finish(touch ? touch.clientX : currentX, touch ? touch.clientY : currentY);
  }, { passive: true });

  frame.addEventListener("touchcancel", () => {
    tracking = false;
  }, { passive: true });

  frame.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") return; // Touch handled by touchstart
    start(event.clientX, event.clientY, event.target);
  });

  frame.addEventListener("pointerup", (event) => {
    if (event.pointerType === "touch") return;
    finish(event.clientX, event.clientY);
  });

  frame.addEventListener("pointercancel", () => {
    tracking = false;
  });
}

export function interactiveSwipeTarget(target) {
  if (!target) return false;
  return Boolean(target.closest("button, input:not([type='hidden']), textarea, select, a, [role='button']"));
}

export function registerGlobalClickDispatcher() {
  document.addEventListener("click", (event) => {
    if (event.target.closest("#order-status-lookup-form")) {
      event.stopPropagation();
    }

    const isMutation = event.target.closest("[data-add-product]") ||
                       event.target.closest("[data-detail-qty-plus]") ||
                       event.target.closest("[data-detail-qty-minus]") ||
                       event.target.closest("[data-repeat-config]") ||
                       event.target.closest("[data-cart-plus]") ||
                       event.target.closest("[data-cart-minus]") ||
                       event.target.closest("[data-edit-cart-line]") ||
                       event.target.closest("#order-confirm-cart") ||
                       event.target.closest("[data-service-type]") ||
                       event.target.closest("[data-table-name]") ||
                       event.target.closest("[data-payment-id]") ||
                       event.target.closest("[data-member-fill]") ||
                       event.target.closest("[data-clear-selected-member]") ||
                       event.target.closest("#order-submit");

    if (state.orderStatus === "ORDER_CREATED" && isMutation) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

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
      (async () => {
        setBusy(true, "Memeriksa ketersediaan stok...");
        try {
          const { refreshMenuStock } = await import("./order-render.js");
          await Promise.all([
            refreshMenuStock(),
            new Promise((resolve) => setTimeout(resolve, 500))
          ]);
          const { validateCartStock } = await import("./pages/page-3-book-menu.js");
          const validation = validateCartStock();
          if (!validation.valid) {
            showFeedback(validation.reason, true);
            return;
          }
          state.lastOrderNumber = "";
          state.cartConfirmed = true;
          state.spread = "checkout";
          persistOrderSession();
          const { render } = await import("./order-render.js");
          render();
        } catch (err) {
          console.error(err);
        } finally {
          setBusy(false);
        }
      })();
      return;
    }

    const serviceButton = event.target.closest("[data-service-type]");
    if (serviceButton) {
      state.serviceType = serviceButton.dataset.serviceType;
      if (!needsServiceChoice()) state.tableName = "";
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

  document.addEventListener("submit", (event) => {
    if (event.target.closest("#order-status-lookup-form")) {
      event.preventDefault();
      event.stopPropagation();
      lookupPreviousOrder();
    }
  });
}
