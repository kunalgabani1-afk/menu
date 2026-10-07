/**
 * Indian Statutory & Legal Compliant Bill & Tax Invoice Printer
 * Fully adheres to FSSAI (Food Safety and Standards Authority of India)
 * and GST Council billing requirements for Indian Restaurants & Cafes.
 */

export interface BillSettings {
  restaurantName?: string;
  logoUrl?: string;
  tagline?: string;
  address?: string; // Registered physical premise address
  phone?: string;
  fssai?: string; // Mandatory 14-digit FSSAI License Number
  gstin?: string; // 15-digit GST Identification Number
  footerMessage: string;
  footerNote?: string;
  paperSize: "thermal_80mm" | "a4";
  showTableNumber: boolean;
  showOrderNumber: boolean;
  showDateTime: boolean;
  showStaff: boolean;
  showTax: boolean;
  showPaymentDetails: boolean;
  showContactInfo: boolean;
  currency?: string;
  updatedAt?: number | null;
}

export type BillPrintSettings = BillSettings;

export const DEFAULT_BILL_SETTINGS: BillSettings = {
  restaurantName: "The Roasted Bean Cafe",
  logoUrl: "",
  tagline: "Artisanal Roastery & Kitchen",
  address: "Shop 4, Ground Floor, Heritage Hub, FC Road, Pune, Maharashtra 411004",
  phone: "+91 98230 12345",
  fssai: "11523001000452", // Statutory 14-digit FSSAI License
  gstin: "27AAPCA1234F1Z5", // 15-digit GSTIN
  footerMessage: "Thank you for dining with us!",
  footerNote: "FSSAI Lic. No. 11523001000452 • Save Paper, Keep E-Bill",
  paperSize: "thermal_80mm",
  showTableNumber: true,
  showOrderNumber: true,
  showDateTime: true,
  showStaff: true,
  showTax: true,
  showPaymentDetails: true,
  showContactInfo: true,
  currency: "₹",
};

export function escapeHtml(str: string): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Format sequential, auditable invoice number: e.g. INV-260929-001
 */
export function formatSequentialInvoiceNumber(orderIdOrNumber: any, dateInput?: any): string {
  if (typeof orderIdOrNumber === "string" && orderIdOrNumber.startsWith("INV-")) {
    return orderIdOrNumber;
  }
  const d = dateInput ? new Date(dateInput) : new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  const rawNum = String(orderIdOrNumber || "1").replace(/\D/g, "");
  const seq = rawNum ? rawNum.slice(-3).padStart(3, "0") : "001";
  return `INV-${yy}${mm}${dd}-${seq}`;
}

/**
 * Format Date & Time strictly matching Indian standard: 29-Sep-2026 | 19:44 PM
 */
export function formatIndianDateTime(dateInput?: any): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[d.getMonth()] || "Sep";
  const year = d.getFullYear();

  const hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const hours24 = String(hours).padStart(2, "0");

  return `${day}-${month}-${year} | ${hours24}:${minutes} ${ampm}`;
}

/**
 * Formats the explicit settlement mode required by tax auditing:
 * e.g., PAID VIA UPI, PAID IN CASH, or SPLIT: ₹200 Cash / ₹360 UPI
 */
export function formatIndianPaymentMode(order: any): string {
  // Check for split tender breakdown first
  const pb = order.payment_breakdown || order.paymentBreakdown;
  if (pb) {
    if (pb.tenderType === "SPLIT" || (Number(pb.cash || 0) > 0 && Number(pb.upi || 0) > 0)) {
      return `SPLIT: ₹${Math.round(pb.cash)} Cash / ₹${Math.round(pb.upi)} UPI`;
    } else if (pb.tenderType === "FULL_UPI" || Number(pb.upi || 0) > 0) {
      return "PAID VIA UPI";
    } else if (pb.tenderType === "FULL_CASH" || Number(pb.cash || 0) > 0) {
      return "PAID IN CASH";
    } else if (Number(pb.card || 0) > 0) {
      return "PAID VIA CARD";
    }
  }

  // Check split amounts directly
  const cashAmt = Number(order.cashAmount || order.splitCash || 0);
  const upiAmt = Number(order.upiAmount || order.splitUpi || 0);
  if (cashAmt > 0 && upiAmt > 0) {
    return `SPLIT: ₹${cashAmt} Cash / ₹${upiAmt} UPI`;
  }

  const raw = String(order.paymentMethod || order.payment_method || order.tenderType || "").toUpperCase();
  const status = String(order.paymentStatus || order.status || "").toUpperCase();
  const isPaid = status === "PAID" || status === "SETTLED" || status === "COMPLETED";

  if (raw.includes("SPLIT")) {
    return "SPLIT: CASH / UPI";
  }
  if (raw.includes("UPI") || raw.includes("GPAY") || raw.includes("PHONEPE") || raw.includes("PAYTM")) {
    return isPaid ? "PAID VIA UPI" : "UPI (PENDING)";
  }
  if (raw.includes("CASH")) {
    return isPaid ? "PAID IN CASH" : "CASH (PENDING)";
  }
  if (raw.includes("CARD")) {
    return isPaid ? "PAID VIA CARD" : "CARD (PENDING)";
  }
  if (isPaid) {
    return "PAID VIA UPI / COUNTER";
  }
  return "PAYMENT PENDING";
}

export function generateBillHtml(
  order: any,
  restaurantName: string,
  settings: Partial<BillSettings> = {},
  currency: string = "₹"
): string {
  const merged: BillSettings = {
    ...DEFAULT_BILL_SETTINGS,
    ...settings,
  };

  // 1. The Business Header
  const name = escapeHtml(merged.restaurantName || restaurantName || "The Roasted Bean Cafe");
  const tagline = escapeHtml(merged.tagline || "");
  const address = escapeHtml(merged.address || DEFAULT_BILL_SETTINGS.address || "");
  const phone = escapeHtml(merged.phone || "");
  // FSSAI is legally mandatory across India for all food businesses
  const fssai = escapeHtml(merged.fssai || DEFAULT_BILL_SETTINGS.fssai || "11523001000452");
  const gstin = escapeHtml(merged.gstin || DEFAULT_BILL_SETTINGS.gstin || "27AAPCA1234F1Z5");
  const footerMessage = escapeHtml(merged.footerMessage || "Thank you for dining with us!");
  const footerNote = escapeHtml(merged.footerNote || "");
  const logoUrl = merged.logoUrl?.trim();
  const isA4 = merged.paperSize === "a4";

  // 2. The Transaction Metadata
  const invoiceNumber = formatSequentialInvoiceNumber(
    order.invoiceNumber || order.orderNumber || order.id || "001",
    order.createdAt
  );
  const rawTable = String(order.tableNumber || "01").replace(/^Table\s*/i, "").padStart(2, "0");
  const tableDisplay = `Table ${rawTable}${order.dinerFirstName ? ` (${escapeHtml(order.dinerFirstName)})` : ""}`;
  const dateTimeDisplay = formatIndianDateTime(order.createdAt);
  const staffName = escapeHtml(order.serverName || order.staffName || (order.source === "QR" ? "Guest Self-Order" : "Captain Staff"));

  // 3. The Order Breakdown
  const items = Array.isArray(order.items) ? order.items : [];
  const subtotal = Number(order.subtotal || 0);

  // 4. The Strict Financial Ledger (5% GST split into 2.5% CGST and 2.5% SGST)
  let totalTaxes = Number(order.taxes || 0);
  if (totalTaxes <= 0 && subtotal > 0) {
    totalTaxes = Math.round(subtotal * 0.05 * 100) / 100;
  }
  const cgst = Math.round((totalTaxes / 2) * 100) / 100;
  const sgst = Math.round((totalTaxes / 2) * 100) / 100;
  const serviceCharge = Number(order.serviceCharge || 0);
  const discount = Number(order.discount || 0);
  const grandTotal = Number(order.total || order.total_bill || (subtotal + totalTaxes + serviceCharge - discount));
  const paymentModeText = formatIndianPaymentMode(order);

  // A4 Tax Invoice Format
  if (isA4) {
    const itemsRowsA4 = items
      .map((item: any) => {
        const q = Number(item.quantity || 1);
        const p = Number(item.price || 0);
        const itemSubtotal = Number(item.subtotal || q * p);

        // Modifiers indented under item
        const customModifiers = Array.isArray(item.selectedModifiers) && item.selectedModifiers.length > 0
          ? item.selectedModifiers
          : Array.isArray(item.modifiers?.customizations) && item.modifiers.customizations.length > 0
          ? item.modifiers.customizations
          : [];
        const modLines = customModifiers.length > 0
          ? `<div style="font-size: 11px; color: #666; padding-left: 12px; margin-top: 2px;">${customModifiers
              .map((m: any) => `↳ + ${escapeHtml(m.name || m.optionName || "")}${m.price ? ` (+${currency}${m.price})` : ""}`)
              .join("<br/>")}</div>`
          : "";
        const noteLine = item.specialInstructions
          ? `<div style="font-size: 11px; color: #888; font-style: italic; padding-left: 12px; margin-top: 1px;">* Note: ${escapeHtml(item.specialInstructions)}</div>`
          : "";

        return `
          <tr>
            <td style="text-align: center; font-variant-numeric: tabular-nums;">${q}</td>
            <td style="font-weight: 600;">
              ${escapeHtml(item.name || "Item")}
              ${modLines}
              ${noteLine}
            </td>
            <td style="text-align: right; font-variant-numeric: tabular-nums;">${currency}${p.toFixed(2)}</td>
            <td style="text-align: right; font-weight: 600; font-variant-numeric: tabular-nums;">${currency}${itemSubtotal.toFixed(2)}</td>
          </tr>
        `;
      })
      .join("");

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Tax Invoice - ${invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #ffffff;
      color: #1c1917;
      padding: 40px;
      font-size: 13px;
      line-height: 1.45;
    }
    .invoice-card {
      max-width: 760px;
      margin: 0 auto;
      border: 1px solid #e7e5e4;
      border-radius: 12px;
      padding: 36px;
      background: #ffffff;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #1c1917;
      padding-bottom: 18px;
      margin-bottom: 20px;
    }
    .brand h1 {
      font-size: 22px;
      font-weight: 800;
      color: #1c1917;
      text-transform: uppercase;
      letter-spacing: -0.01em;
      margin-bottom: 4px;
    }
    .tagline {
      font-size: 11px;
      color: #78716c;
      font-style: italic;
      margin-bottom: 6px;
    }
    .contact-meta {
      font-size: 11px;
      color: #44403c;
      line-height: 1.5;
    }
    .fssai-pill {
      display: inline-block;
      margin-top: 4px;
      padding: 2px 8px;
      background: #fef3c7;
      border: 1px solid #fde68a;
      border-radius: 4px;
      color: #92400e;
      font-weight: 700;
      font-size: 11px;
    }
    .gstin-pill {
      font-weight: 700;
      color: #1c1917;
    }
    .invoice-meta {
      text-align: right;
    }
    .invoice-badge {
      font-size: 18px;
      font-weight: 800;
      color: #1c1917;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .meta-line {
      font-size: 12px;
      color: #57534e;
      margin-bottom: 3px;
    }
    .meta-line strong {
      color: #1c1917;
      font-family: monospace;
      font-size: 13px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      background: #fafaf9;
      border: 1px solid #f5f5f4;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 20px;
    }
    .meta-block-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #78716c;
      font-weight: 700;
      margin-bottom: 2px;
    }
    .meta-block-val {
      font-size: 13px;
      font-weight: 700;
      color: #1c1917;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th {
      background: #f5f5f4;
      text-align: left;
      padding: 10px 12px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #44403c;
      border-bottom: 2px solid #e7e5e4;
    }
    th.col-qty, th.col-rate, th.col-amount {
      text-align: right;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #f5f5f4;
      vertical-align: top;
    }
    .summary-section {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 24px;
    }
    .summary-table {
      width: 320px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      font-size: 12px;
      color: #57534e;
    }
    .summary-row.total-row {
      border-top: 2px solid #1c1917;
      border-bottom: 2px solid #1c1917;
      padding: 8px 0;
      margin-top: 6px;
      font-size: 16px;
      font-weight: 800;
      color: #1c1917;
    }
    .payment-badge {
      display: block;
      margin-top: 8px;
      padding: 6px 10px;
      background: #e0f2fe;
      border: 1px solid #bae6fd;
      border-radius: 6px;
      text-align: right;
      color: #0369a1;
      font-weight: 800;
      font-size: 12px;
    }
    .footer {
      border-top: 1px dashed #d6d3d1;
      padding-top: 16px;
      text-align: center;
    }
    .footer-msg {
      font-size: 12px;
      font-weight: 700;
      color: #1c1917;
      margin-bottom: 4px;
    }
    .footer-note {
      font-size: 11px;
      color: #78716c;
    }
    @media print {
      body { padding: 0; }
      .invoice-card { border: none; padding: 20px 0; }
    }
  </style>
</head>
<body>
  <div class="invoice-card">
    <!-- 1. The Business Header -->
    <div class="header">
      <div class="brand">
        ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="max-height: 48px; max-width: 140px; margin-bottom: 6px; object-fit: contain;" />` : ""}
        <h1>${name}</h1>
        ${tagline ? `<div class="tagline">${tagline}</div>` : ""}
        <div class="contact-meta">
          <div><strong>Address:</strong> ${address}</div>
          ${phone ? `<div><strong>Phone:</strong> ${phone}</div>` : ""}
          <div class="gstin-pill"><strong>GSTIN:</strong> ${gstin}</div>
          <div class="fssai-pill"><strong>FSSAI Lic. No.:</strong> ${fssai}</div>
        </div>
      </div>
      <div class="invoice-meta">
        <div class="invoice-badge">TAX INVOICE</div>
        <div class="meta-line">Invoice #: <strong>${invoiceNumber}</strong></div>
        <div class="meta-line">Date &amp; Time: <strong>${dateTimeDisplay}</strong></div>
        <div class="meta-line">Dining: <strong>${tableDisplay}</strong></div>
      </div>
    </div>

    <!-- 2. The Transaction Metadata -->
    <div class="meta-grid">
      <div>
        <div class="meta-block-label">Table Number</div>
        <div class="meta-block-val">${tableDisplay}</div>
      </div>
      <div>
        <div class="meta-block-label">Date &amp; Time</div>
        <div class="meta-block-val" style="font-size: 11.5px;">${dateTimeDisplay}</div>
      </div>
      <div>
        <div class="meta-block-label">Service Attendant</div>
        <div class="meta-block-val">${staffName}</div>
      </div>
    </div>

    <!-- 3. The Order Breakdown -->
    <table>
      <thead>
        <tr>
          <th style="width: 10%; text-align: center;">Qty</th>
          <th style="width: 55%;">Item Name &amp; Modifiers</th>
          <th class="col-rate" style="width: 17%;">Unit Price</th>
          <th class="col-amount" style="width: 18%;">Total Price</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRowsA4}
      </tbody>
    </table>

    <!-- 4. The Strict Financial Ledger -->
    <div class="summary-section">
      <div class="summary-table">
        <div class="summary-row">
          <span>Subtotal (before taxes)</span>
          <span style="font-weight: 600;">${currency}${subtotal.toFixed(2)}</span>
        </div>
        <div class="summary-row" style="color: #44403c;">
          <span>CGST (2.5%)</span>
          <span>${currency}${cgst.toFixed(2)}</span>
        </div>
        <div class="summary-row" style="color: #44403c;">
          <span>SGST (2.5%)</span>
          <span>${currency}${sgst.toFixed(2)}</span>
        </div>
        ${serviceCharge > 0 ? `
          <div class="summary-row">
            <span>Service Charge</span>
            <span>${currency}${serviceCharge.toFixed(2)}</span>
          </div>
        ` : ""}
        ${discount > 0 ? `
          <div class="summary-row" style="color: #15803d;">
            <span>Discount</span>
            <span>-${currency}${discount.toFixed(2)}</span>
          </div>
        ` : ""}
        <div class="summary-row total-row">
          <span>GRAND TOTAL</span>
          <span>${currency}${grandTotal.toFixed(2)}</span>
        </div>
        <div class="payment-badge">
          ${paymentModeText}
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <div class="footer-msg">${footerMessage}</div>
      <div class="footer-note">FSSAI License No: ${fssai} • Registered Under Indian Food Safety Standards</div>
    </div>
  </div>
</body>
</html>`;
  }

  // Thermal 80mm / 58mm Statutory Indian Food Bill
  const thermalItemRows = items
    .map((item: any) => {
      const q = Number(item.quantity || 1);
      const p = Number(item.price || 0);
      const amt = Number(item.subtotal || q * p);

      const customModifiers = Array.isArray(item.selectedModifiers) && item.selectedModifiers.length > 0
        ? item.selectedModifiers
        : Array.isArray(item.modifiers?.customizations) && item.modifiers.customizations.length > 0
        ? item.modifiers.customizations
        : [];
      const modLines = customModifiers.length > 0
        ? `<div class="mod-indented">${customModifiers.map((m: any) => `↳ + ${escapeHtml(m.name || m.optionName || "")}`).join("<br/>")}</div>`
        : "";
      const noteLine = item.specialInstructions
        ? `<div class="note-indented">* ${escapeHtml(item.specialInstructions)}</div>`
        : "";

      return `
        <tr>
          <td class="col-qty">${q}x</td>
          <td class="col-desc">
            <span class="item-title">${escapeHtml(item.name || "Item")}</span>
            ${modLines}
            ${noteLine}
          </td>
          <td class="col-rate">${p.toFixed(0)}</td>
          <td class="col-amt">${amt.toFixed(0)}</td>
        </tr>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt ${invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Courier New', Courier, monospace, -apple-system;
      background: #f5f5f4;
      display: flex;
      justify-content: center;
      padding: 16px;
      color: #000000;
      font-size: 12px;
      line-height: 1.35;
    }
    .thermal-receipt {
      width: 320px;
      background: #ffffff;
      padding: 20px 14px;
      border: 1px solid #e7e5e4;
      box-shadow: 0 4px 12px rgba(0,0,0,0.06);
    }
    .center { text-align: center; }
    .brand-title {
      font-size: 17px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .address-line {
      font-size: 10px;
      color: #111;
      line-height: 1.3;
      margin-top: 2px;
    }
    .statutory-fssai {
      font-size: 11px;
      font-weight: 800;
      margin-top: 4px;
      padding: 2px 0;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .statutory-gstin {
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .dashed {
      border-bottom: 1px dashed #000;
      margin: 7px 0;
    }
    .double-line {
      border-bottom: 2px solid #000;
      margin: 8px 0;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      margin-bottom: 2px;
    }
    .meta-bold {
      font-weight: 800;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 4px 0;
      font-size: 11px;
    }
    th {
      text-align: left;
      padding: 3px 0;
      border-bottom: 1px dashed #000;
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 800;
    }
    th.col-qty, td.col-qty { width: 28px; text-align: left; }
    th.col-desc, td.col-desc { width: 54%; text-align: left; }
    th.col-rate, td.col-rate { width: 18%; text-align: right; }
    th.col-amt, td.col-amt { width: 20%; text-align: right; }
    td {
      padding: 3.5px 0;
      vertical-align: top;
    }
    .item-title {
      font-weight: 700;
      font-size: 11.5px;
    }
    .mod-indented {
      font-size: 9.5px;
      padding-left: 8px;
      color: #333;
      margin-top: 1px;
    }
    .note-indented {
      font-size: 9px;
      font-style: italic;
      padding-left: 8px;
      color: #555;
    }
    .ledger-row {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
      font-size: 11.5px;
    }
    .grand-total-row {
      display: flex;
      justify-content: space-between;
      border-top: 2px solid #000;
      border-bottom: 2px solid #000;
      padding: 6px 0;
      margin: 6px 0;
      font-size: 15px;
      font-weight: 900;
    }
    .payment-status-box {
      border: 1px solid #000;
      text-align: center;
      padding: 4px;
      margin: 8px 0;
      font-weight: 900;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .footer {
      text-align: center;
      margin-top: 8px;
      font-size: 10px;
      color: #222;
    }
    @media print {
      body { background: transparent; padding: 0; }
      .thermal-receipt {
        width: 100%;
        max-width: 80mm;
        border: none;
        box-shadow: none;
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="thermal-receipt">
    <!-- 1. The Business Header -->
    <div class="center">
      ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="max-height: 40px; max-width: 120px; margin-bottom: 6px; object-fit: contain;" />` : ""}
      <div class="brand-title">${name}</div>
      ${tagline ? `<div style="font-size: 10px; font-style: italic; margin-bottom: 2px;">${tagline}</div>` : ""}
      <div class="address-line">${address}</div>
      ${phone ? `<div class="address-line">Tel: ${phone}</div>` : ""}
      <div class="statutory-gstin">GSTIN: ${gstin}</div>
      <div class="statutory-fssai">*** FSSAI Lic. No: ${fssai} ***</div>
    </div>

    <div class="double-line"></div>

    <!-- 2. The Transaction Metadata -->
    <div class="meta-row">
      <span class="meta-bold">INVOICE:</span>
      <span class="meta-bold">${invoiceNumber}</span>
    </div>
    <div class="meta-row">
      <span>DATE &amp; TIME:</span>
      <span>${dateTimeDisplay}</span>
    </div>
    <div class="meta-row">
      <span class="meta-bold">TABLE:</span>
      <span class="meta-bold">${tableDisplay}</span>
    </div>
    ${staffName ? `
      <div class="meta-row">
        <span>ATTENDANT:</span>
        <span>${staffName}</span>
      </div>
    ` : ""}

    <div class="dashed"></div>

    <!-- 3. The Order Breakdown -->
    <table>
      <thead>
        <tr>
          <th class="col-qty">QTY</th>
          <th class="col-desc">ITEM</th>
          <th class="col-rate">RATE</th>
          <th class="col-amt">AMT</th>
        </tr>
      </thead>
      <tbody>
        ${thermalItemRows}
      </tbody>
    </table>

    <div class="dashed"></div>

    <!-- 4. The Strict Financial Ledger -->
    <div class="ledger-row">
      <span>Subtotal (Before Tax)</span>
      <span>${currency}${subtotal.toFixed(2)}</span>
    </div>
    <div class="ledger-row">
      <span>CGST (2.5%)</span>
      <span>${currency}${cgst.toFixed(2)}</span>
    </div>
    <div class="ledger-row">
      <span>SGST (2.5%)</span>
      <span>${currency}${sgst.toFixed(2)}</span>
    </div>
    ${serviceCharge > 0 ? `
      <div class="ledger-row">
        <span>Service Charge</span>
        <span>${currency}${serviceCharge.toFixed(2)}</span>
      </div>
    ` : ""}
    ${discount > 0 ? `
      <div class="ledger-row">
        <span>Discount</span>
        <span>-${currency}${discount.toFixed(2)}</span>
      </div>
    ` : ""}

    <div class="grand-total-row">
      <span>GRAND TOTAL</span>
      <span>${currency}${grandTotal.toFixed(2)}</span>
    </div>

    <!-- Explicit Payment Mode -->
    <div class="payment-status-box">
      ${paymentModeText}
    </div>

    <!-- Footer -->
    <div class="footer">
      <div style="font-weight: 700; margin-bottom: 2px;">${footerMessage}</div>
      <div style="font-size: 9px; margin-top: 3px;">FSSAI Lic. No: ${fssai}</div>
      <div style="font-size: 8px; color: #555; margin-top: 6px; text-transform: uppercase;">
        Tableline Hospitality POS • India
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function printBillDocument(
  order: any,
  restaurantNameOrSettings: string | Partial<BillSettings>,
  settingsOrPaperSize?: Partial<BillSettings> | string,
  currency: string = "₹"
): void {
  const rName =
    typeof restaurantNameOrSettings === "string"
      ? restaurantNameOrSettings
      : restaurantNameOrSettings?.restaurantName || "The Roasted Bean Cafe";
  const sObj: Partial<BillSettings> =
    typeof restaurantNameOrSettings === "object"
      ? { ...restaurantNameOrSettings }
      : typeof settingsOrPaperSize === "object"
      ? { ...settingsOrPaperSize }
      : {};
  if (typeof settingsOrPaperSize === "string") {
    sObj.paperSize = settingsOrPaperSize as any;
  }
  const curr = sObj.currency || currency || "₹";
  const html = generateBillHtml(order, rName, sObj, curr);

  // Use hidden iframe to print reliably inside iframes without popup blockers
  let printFrame = document.getElementById("tableline-print-frame") as HTMLIFrameElement;
  if (!printFrame) {
    printFrame = document.createElement("iframe");
    printFrame.id = "tableline-print-frame";
    printFrame.style.position = "fixed";
    printFrame.style.right = "0";
    printFrame.style.bottom = "0";
    printFrame.style.width = "0";
    printFrame.style.height = "0";
    printFrame.style.border = "0";
    document.body.appendChild(printFrame);
  }

  try {
    const frameDoc = printFrame.contentWindow?.document || printFrame.contentDocument;
    if (frameDoc) {
      frameDoc.open();
      frameDoc.write(html);
      frameDoc.close();
      setTimeout(() => {
        try {
          printFrame.contentWindow?.focus();
          printFrame.contentWindow?.print();
        } catch {}
      }, 300);
      return;
    }
  } catch {}

  // Fallback to window.open if iframe is blocked
  try {
    const isA4 = sObj.paperSize === "a4";
    const popup = window.open("", "_blank", `width=${isA4 ? 800 : 440},height=${isA4 ? 900 : 660}`);
    if (popup) {
      popup.document.write(html);
      popup.document.close();
      popup.focus();
      setTimeout(() => {
        popup.print();
      }, 300);
    }
  } catch {}
}
