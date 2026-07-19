# 22. Refactoring Recommendations

Rencana aksi refaktorisasi arsitektur kode (*Refactoring Action Plan*) untuk meningkatkan modularitas, keamanan, dan kejelasan kode pada Aplikasi UMKM.

---

## 1. Refaktor Modularitas Frontend: Pemecahan God Object `pos.js`

### Struktur Baru yang Direkomendasikan (ES6 Modules)
Direkomendasikan memecah `pos.js` menjadi 4 modul terpisah:
1. `pos-state.js`: Mengelola data in-memory (katalog produk, antrean order, keranjang belanja) dan menangani request AJAX API (`apiGet`, `apiPost`).
2. `pos-cart.js`: Fokus merender item keranjang belanja ke DOM, menghitung subtotal, diskon member, dan PPN.
3. `pos-numpad.js`: Logika event listener untuk virtual numpad pembayaran cash.
4. `pos-printer.js`: Mengemas HTML/CSS template untuk cetak struk kasir ke printer thermal.

### Contoh Implementasi Refaktor (`pos-cart.js`)
```javascript
// public/scripts/pages/pos/pos-cart.js
import { money } from "../../format.js";

export class PosCart {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.items = [];
  }

  addItem(product, qty = 1, modifierIds = []) {
    const existing = this.items.find(item => item.productId === product.id && this.compareModifiers(item.modifierIds, modifierIds));
    if (existing) {
      existing.qty += qty;
    } else {
      this.items.push({ productId: product.id, name: product.name, price: product.price, qty, modifierIds });
    }
    this.render();
  }

  calculateTotals(taxRate = 10, serviceRate = 0) {
    const revenue = this.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const serviceCharge = revenue * (serviceRate / 100);
    const tax = (revenue + serviceCharge) * (taxRate / 100);
    return { revenue, serviceCharge, tax, total: revenue + serviceCharge + tax };
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = this.items.map(item => `
      <div class="cart-item">
        <span>${item.name} (x${item.qty})</span>
        <strong>${money(item.price * item.qty)}</strong>
      </div>
    `).join("");
  }

  compareModifiers(a, b) {
    return JSON.stringify(a.sort()) === JSON.stringify(b.sort());
  }
}
```

---

## 2. Refaktor Duplikasi: Unifikasi Verifikasi Pembayaran

### Masalah
Logika pengecekan nominal cash, pembuatan invoice QRIS dinamis, dan pooling status pembayaran terduplikasi di `paymentMetaForCheckout` dan `paymentMetaForBill`.

### Solusi
Buat fungsi utilitas tunggal `resolvePaymentMetadata` di `pos.js`:

```javascript
function resolvePaymentMetadata(total, orderNumber, context = "checkout") {
  const isCash = isCashPayment();
  const isThirdParty = isThirdPartyPayment();

  if (isCash) {
    const fieldId = context === "checkout" ? "cash-tendered" : "bill-cash-tendered";
    const tendered = Number(byId(fieldId)?.value || 0);
    if (tendered < total) throw new Error("Nominal bayar cash belum cukup.");
    return {
      paymentMethod,
      cashTendered: tendered,
      changeDue: tendered - total,
      provider: "cashier",
      reference: `CASH-${orderNumber}`,
    };
  }

  if (isThirdParty) {
    if (!pendingPayment) {
      createPaymentRequest(total, orderNumber);
      throw new Error(`${selectedPaymentType() === "qris" ? "QRIS" : "Request kartu"} dibuat. Konfirmasi setelah pembayaran sukses.`);
    }
    // ... logic polling dan konfirmasi gateway ...
    return {
      paymentMethod,
      provider: pendingPayment.provider,
      reference: pendingPayment.reference,
      transactionId: pendingPayment.id,
    };
  }

  return {
    paymentMethod,
    provider: "offline",
    reference: `${paymentMethod}-${orderNumber}`,
  };
}
```
Lalu ganti pemanggilan di `checkout()` dan `paymentMetaForBill()` agar merujuk ke fungsi terpadu di atas.
