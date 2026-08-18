import { state } from "./pos-state.js";
import { isPaymentPaid, escapeHtml, activeCompanyLogo, activeOutletLabel, activeOutletAddress } from "./pos-helpers.js";
import { money } from "../../format.js";
import { showAlert } from "../../dom.js";

export function receiptRows(order) {
  return (order.items || []).map((item) => `
    <tr>
      <td><strong>${escapeHtml(item.name || "Item")}</strong>${item.modifiers?.length ? `<small>${escapeHtml(item.modifiers.join(", "))}</small>` : ""}</td>
      <td class="num">${Number(item.qty || 0).toLocaleString("id-ID")}</td>
      <td class="num">${money((Number(item.price || 0) * Number(item.qty || 0)))}</td>
    </tr>
  `).join("");
}

export function autoPrintPaidOrder(order) {
  if (!order || !isPaymentPaid(order.paymentStatus) || !state.settings?.printerName) return;
  const printWindow = window.open("", "_blank", "width=420,height=720");
  if (!printWindow) {
    showAlert("Order paid, tetapi popup print diblokir browser. Izinkan popup untuk auto print struk.", "error");
    return;
  }
  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Struk ${escapeHtml(order.orderNumber || "")}</title>
        <style>
          body { margin: 0; padding: 14px; font-family: Arial, sans-serif; color: #25170f; background: #fff; }
          .receipt { width: 280px; margin: 0 auto; font-family: Consolas, Menlo, monospace; font-size: 12px; line-height: 1.35; }
          .receipt-logo { display: block; width: 58px; height: 58px; object-fit: contain; margin: 0 auto 7px; filter: grayscale(1) contrast(1.2); }
          h1 { font-size: 18px; margin: 0; text-align: center; }
          .muted { color: #5f5348; font-size: 11px; text-align: center; margin: 3px 0; }
          .head { border-bottom: 1px dashed #9c8c7e; padding-bottom: 10px; margin-bottom: 8px; text-align: center; }
          .meta, .totals { border-top: 1px dashed #b9aaa0; border-bottom: 1px dashed #b9aaa0; padding: 8px 0; margin: 8px 0; font-size: 12px; }
          .line { display: flex; justify-content: space-between; gap: 12px; margin: 4px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          td { padding: 5px 0; vertical-align: top; border-bottom: 1px solid #eee7e1; }
          td small { display: block; color: #6f6259; margin-top: 2px; }
          .num { text-align: right; white-space: nowrap; }
          .total { font-size: 15px; font-weight: 700; }
          .footer { text-align: center; font-size: 11px; margin-top: 14px; color: #6f6259; }
          @media print { body { padding: 0; } .receipt { width: 100%; } }
        </style>
      </head>
      <body>
        <section class="receipt">
          <div class="head">
            ${activeCompanyLogo() ? `<img class="receipt-logo" src="${escapeHtml(activeCompanyLogo())}" alt="Logo" />` : ""}
            <h1>${escapeHtml(state.settings?.companyName || "IF Instrument")}</h1>
            <p class="muted">${escapeHtml(activeOutletLabel())}</p>
            ${activeOutletAddress() ? `<p class="muted">${escapeHtml(activeOutletAddress())}</p>` : ""}
            <p class="muted">Printer: ${escapeHtml(state.settings.printerName)}</p>
          </div>
          <div class="meta">
            <div class="line"><span>No Order</span><strong>#${escapeHtml(order.orderNumber || "-")}</strong></div>
            <div class="line"><span>Waktu</span><span>${new Date(order.createdAt || Date.now()).toLocaleString("id-ID")}</span></div>
            <div class="line"><span>Layanan</span><span>${escapeHtml(order.serviceType || "-")}</span></div>
            <div class="line"><span>Customer/Meja</span><span>${escapeHtml(order.customerName || order.tableName || "-")}</span></div>
            <div class="line"><span>Bayar</span><span>${escapeHtml(order.paymentMethod || "-")}</span></div>
          </div>
          <table><tbody>${receiptRows(order)}</tbody></table>
          <div class="totals">
            <div class="line"><span>Subtotal</span><span>${money(order.productRevenue || 0)}</span></div>
            ${(order.packagingFee || 0) > 0 ? `<div class="line"><span>Kemasan</span><span>${money(order.packagingFee || 0)}</span></div>` : ""}
            ${(order.serviceCharge || 0) > 0 ? `<div class="line"><span>Service</span><span>${money(order.serviceCharge || 0)}</span></div>` : ""}
            ${(order.tax || 0) > 0 ? `<div class="line"><span>Pajak</span><span>${money(order.tax || 0)}</span></div>` : ""}
            <div class="line total"><span>Total</span><span>${money(order.total || 0)}</span></div>
            ${(order.cashTendered || 0) > 0 ? `<div class="line"><span>Bayar Cash</span><span>${money(order.cashTendered || 0)}</span></div><div class="line"><span>Kembali</span><span>${money(order.changeDue || 0)}</span></div>` : ""}
          </div>
          <div class="footer">Terima kasih</div>
        </section>
        <script>
          window.addEventListener("load", function () {
            setTimeout(function () {
              window.print();
              setTimeout(function () { window.close(); }, 500);
            }, 250);
          });
        <\/script>
      </body>
    </html>
  `);
  printWindow.document.close();
}
