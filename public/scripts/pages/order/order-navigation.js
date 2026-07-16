import { state, bookState, syncOrderStatus } from "./order-state.js";
import {
  byId,
  optionalById,
  showFeedback,
  shouldSkipServicePage,
  hasMultipleOutlets,
  hasSelectedOutlet,
  resolveOutletId,
  needsServiceChoice,
  persistOrderSession,
  optionalById as optById
} from "./order-utils.js";
import { renderSpread } from "./order-render.js";
import { renderProducts } from "./pages/page-3-book-menu.js";
import { syncSelectedMemberFields } from "./pages/page-5-customer-detail.js";

export function spreadOrder() {
  return ["cover", "menu", "checkout", "receipt"];
}

export function pageForSpread(spread) {
  return {
    cover: 3,
    menu: menuStartPage(),
    checkout: state.cartConfirmed ? customerPageNumber() : checkoutStartPage(),
    receipt: receiptStartPage()
  }[spread] || 1;
}

export function menuStartPage() {
  return shouldSkipServicePage() ? 4 : 5;
}

export function spreadForPage(page) {
  if (page >= receiptStartPage()) return "receipt";
  if (page >= checkoutStartPage()) return "checkout";
  if (page >= menuStartPage()) return "menu";
  return "cover";
}

export function generatedMenuPageCount() {
  return document.querySelectorAll(".public-generated-menu-page").length;
}

export function receiptSpacerPageCount() {
  const receiptPage = document.querySelector('[data-book-section="receipt"]:not(.public-back-cover-page)');
  if (!receiptPage) return 0;
  return [...document.querySelectorAll(".public-receipt-spacer-page")]
    .filter((page) => page.compareDocumentPosition(receiptPage) & Node.DOCUMENT_POSITION_FOLLOWING)
    .length;
}

export function checkoutStartPage() {
  return menuStartPage() + 1 + generatedMenuPageCount();
}

export function receiptStartPage() {
  return checkoutStartPage() + checkoutPageCount() + receiptSpacerPageCount();
}

export function isCheckoutPageNumber(page) {
  return page >= checkoutStartPage() && page < receiptStartPage();
}

export function checkoutPageCount() {
  return document.querySelectorAll('[data-book-section="checkout"]').length || 1;
}

export function customerPageNumber() {
  return pageNumberForElement(optionalById("order-customer-page")) || checkoutStartPage() + 1;
}

export function coverStartPage() {
  const coverPage = document.querySelector(".public-cover-page:not(.public-back-cover-page)");
  return pageNumberForElement(coverPage) || pageForSpread("cover");
}

export function shouldHideCustomerPageOnMobile() {
  return isMobileMenu() && !state.cartConfirmed;
}

export function currentBookPage() {
  const book = flipbook();
  return bookState.flipbookReady && book?.length ? book.turn("page") : pageForSpread(state.spread);
}

export function blocksForwardTurnFromPage(page) {
  return isCheckoutPageNumber(page);
}

export function canFreeTurnToPage(targetPage) {
  const currentPage = currentBookPage();
  return !(targetPage > currentPage && blocksForwardTurnFromPage(currentPage));
}

export function pageNumberForElement(element) {
  if (!element) return 0;
  return [...byId("order-flipbook").querySelectorAll(".public-book-page")].indexOf(element) + 1;
}

export function forceTurnToElement(selector, fallbackPage) {
  const element = document.querySelector(selector);
  const page = pageNumberForElement(element) || fallbackPage;
  turnToPage(page, true);
  requestAnimationFrame(() => {
    const nextElement = document.querySelector(selector);
    const nextPage = pageNumberForElement(nextElement) || page;
    if (nextPage) turnToPage(nextPage, true);
  });
}

export function flipbook() {
  return window.jQuery ? window.jQuery("#order-flipbook") : null;
}

export function flipbookSize() {
  const isMobile = window.matchMedia("(max-width: 760px)").matches;
  const width = Math.max(320, window.innerWidth);
  const height = Math.max(isMobile ? 520 : 560, window.innerHeight);
  return { width, height };
}

export function isMobileMenu() {
  return window.matchMedia("(max-width: 760px)").matches;
}

export function menuLayoutClass() {
  return isMobileMenu() ? "list-5" : "grid-3";
}

export function menuPageCapacity() {
  return isMobileMenu() ? 5 : 9;
}

export function menuLayoutLabel() {
  return isMobileMenu() ? "list 5/halaman" : "grid 3x3";
}

export function guardNavigation(targetPage) {
  if (state.orderStatus === "ORDER_CREATED") {
    return { allowed: true };
  }

  const customerPage = customerPageNumber();
  const receiptPage = receiptStartPage();
  const cartPage = checkoutStartPage();

  if (targetPage >= receiptPage) {
    if (!state.orderResult) {
      return { allowed: false, redirect: customerPage, reason: "Selesaikan detail data customer dan pembayaran terlebih dahulu." };
    }
  }

  if (targetPage === customerPage) {
    if (!state.cart.length) {
      return { allowed: false, redirect: menuStartPage(), reason: "Pilih minimal satu menu terlebih dahulu." };
    }
    if (!state.cartConfirmed) {
      return { allowed: false, redirect: cartPage, reason: "Konfirmasi cart terlebih dahulu." };
    }
  }

  if (targetPage === cartPage) {
    if (!state.cart.length) {
      return { allowed: false, redirect: menuStartPage(), reason: "Pilih minimal satu menu terlebih dahulu." };
    }
  }

  return { allowed: true };
}

export function turnToPage(page, force = false) {
  syncOrderStatus();
  const book = flipbook();
  const requestedPage = Number(page);
  
  if (!force) {
    const guard = guardNavigation(requestedPage);
    if (!guard.allowed) {
      showFeedback(guard.reason, true);
      const redirectPage = guard.redirect || pageForSpread(state.spread);
      turnToPage(redirectPage, true);
      return;
    }
  }

  if (bookState.flipbookReady && book?.length) {
    bookState.syncingFlipbook = true;
    bookState.forcedBookTurn = Boolean(force);
    let safePage = 1;
    try {
      const totalPages = Number(book.turn("pages")) || 1;
      safePage = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, totalPages) : 1;
      book.turn("page", safePage);
    } finally {
      bookState.forcedBookTurn = false;
      bookState.syncingFlipbook = false;
    }
    state.spread = spreadForPage(safePage);
    renderSpread(false);
    return;
  }
  state.spread = spreadForPage(Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : pageForSpread(state.spread));
  renderSpread(false);
}

export function rebuildFlipbook(targetPage = null) {
  const nextPage = targetPage || pageForSpread(state.spread);
  initFlipbook();
  const book = flipbook();
  if (bookState.flipbookReady && book?.length) {
    bookState.forcedBookTurn = true;
    try {
      book.turn("page", Math.min(nextPage, book.turn("pages")));
    } finally {
      bookState.forcedBookTurn = false;
    }
  }
}

export function initFlipbook() {
  const book = flipbook();
  if (!book?.length || !window.jQuery?.fn?.turn || bookState.flipbookReady) return;
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
        syncOrderStatus();
        const currentPage = book.turn("page");
        if (page > currentPage && blocksForwardTurnFromPage(currentPage) && !bookState.forcedBookTurn) {
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
        const guard = guardNavigation(page);
        if (!guard.allowed && !bookState.forcedBookTurn) {
          event.preventDefault();
          showFeedback(guard.reason, true);
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
        if (bookState.syncingFlipbook) return;
        if (shouldSkipServicePage() && menuStartPage() !== 4 && page === 4) {
          bookState.syncingFlipbook = true;
          book.turn("page", menuStartPage());
          bookState.syncingFlipbook = false;
          return;
        }
        if (page < customerPageNumber()) {
          state.cartConfirmed = false;
        }
        state.spread = spreadForPage(page);
        showFeedback("");
        renderSpread(false);
      }
    }
  });
  bookState.flipbookReady = true;
}

export function destroyFlipbook() {
  const book = flipbook();
  if (!bookState.flipbookReady || !book?.length) return;
  try {
    book.turn("destroy");
  } catch {
    // turn.js may already be mid-destroy during rapid data refreshes.
  }
  bookState.flipbookReady = false;
  bookState.syncingFlipbook = false;
}

export function resizeFlipbook() {
  const book = flipbook();
  if (!bookState.flipbookReady || !book?.length) return;
  const size = flipbookSize();
  book.turn("size", size.width, size.height);
  book.turn("display", window.matchMedia("(max-width: 760px)").matches ? "single" : "double");
  renderProducts();
}

export function turnNextPage() {
  syncOrderStatus();
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
  if (bookState.flipbookReady && book?.length) {
    if (shouldSkipServicePage() && book.turn("page") <= pageForSpread("cover")) {
      const targetPage = menuStartPage();
      const guard = guardNavigation(targetPage);
      if (!guard.allowed) {
        showFeedback(guard.reason, true);
        return;
      }
      book.turn("page", targetPage);
      return;
    }
    const targetPage = book.turn("page") + (book.turn("display") === "double" ? 2 : 1);
    const guard = guardNavigation(targetPage);
    if (!guard.allowed) {
      showFeedback(guard.reason, true);
      return;
    }
    book.turn("next");
    return;
  }
  showFeedback("");
  const spreads = spreadOrder();
  const nextIndex = Math.min(spreads.indexOf(state.spread) + 1, spreads.length - 1);
  const nextSpread = shouldSkipServicePage() && state.spread === "cover" ? "menu" : spreads[nextIndex];
  const targetPage = pageForSpread(nextSpread);
  const guard = guardNavigation(targetPage);
  if (!guard.allowed) {
    showFeedback(guard.reason, true);
    return;
  }
  state.spread = nextSpread;
  renderSpread();
}

export function turnPrevPage() {
  const book = flipbook();
  if (bookState.flipbookReady && book?.length) {
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

export function goNext() {
  turnNextPage();
}

export function goBack() {
  turnPrevPage();
}

export function canContinue(spread) {
  if (spread === "cover") return Boolean(hasSelectedOutlet() && state.serviceType && (!needsTableSelection() || state.tableName));
  if (spread === "menu") return state.cart.length > 0;
  if (spread === "checkout") {
    const customerName = optionalById("order-customer-name")?.value?.trim() || "";
    const customerEmail = optionalById("order-customer-email")?.value?.trim() || "";
    const customerPhone = optionalById("order-customer-phone")?.value?.trim() || "";
    const isEmailValid = optionalById("order-customer-email")?.checkValidity() ?? false;
    const formValid = Boolean(customerName && customerEmail && customerPhone && isEmailValid);
    return Boolean(resolveOutletId()) && state.cartConfirmed && state.cart.length > 0 && Boolean(state.paymentMethodId) && formValid;
  }
  return true;
}

export function needsTableSelection() {
  return state.serviceType === "Dine In" && state.settings.tableServiceMode !== "free_seating_pay_first";
}

export function canJumpTo(spread) {
  return spreadOrder().includes(spread);
}

export function validationMessage() {
  if (!resolveOutletId()) return "Pilih outlet terlebih dahulu.";
  if (state.spread === "cover") return hasMultipleOutlets() && !hasSelectedOutlet() ? "Pilih outlet terlebih dahulu." : "Lengkapi pilihan pemesanan terlebih dahulu.";
  if (state.spread === "menu") return "Pilih minimal satu menu terlebih dahulu.";
  if (state.spread === "checkout") return state.cartConfirmed ? "Lengkapi data customer dan pilih metode pembayaran." : "Konfirmasi cart terlebih dahulu.";
  return "Lengkapi pilihan sebelum lanjut.";
}

export function snapshotBookInputs() {
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

export function restoreBookInputs(snapshot) {
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

export function syncOptionalBookPages() {
  if (shouldSkipServicePage()) {
    optionalById("order-service-page")?.remove();
  }
  const customerPage = optionalById("order-customer-page");

  if (customerPage) {
      customerPage.hidden = shouldHideCustomerPageOnMobile();
  }
}

export function syncReceiptBookPages() {
  const book = byId("order-flipbook");
  book.querySelectorAll(".public-receipt-spacer-page").forEach((page) => page.remove());
  const backCover = book.querySelector(".public-back-cover-page");
  if (!backCover) return;

  const backCoverNumber = pageNumberForElement(backCover);
  if (backCoverNumber % 2 === 0) {
    backCover.insertAdjacentHTML("afterend", `<article class="public-book-page public-blank-page public-receipt-spacer-page" data-book-section="receipt" aria-hidden="true"></article>`);
  }
}
