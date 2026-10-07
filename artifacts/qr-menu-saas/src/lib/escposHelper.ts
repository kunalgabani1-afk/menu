/**
 * ESC/POS Binary Command Generator for Web Bluetooth Thermal KOT & Receipt Printing
 * Tailored for line cooks & kitchen order tickets (58mm / 80mm roll).
 * Compliant with Indian Food Safety (FSSAI) and GST Council requirements.
 */

export interface KOTPrintItem {
  name: string;
  quantity: number;
  dietary?: "JAIN" | "VEG" | "NON_VEG" | "EGG" | string;
  isVeg?: boolean;
  specialInstructions?: string | null;
  selectedModifiers?: Array<{
    name?: string;
    optionName?: string;
    price?: number;
  }>;
}

export interface KOTPrintPayload {
  cafeName?: string;
  tableNumber: string | number;
  dinerFirstName?: string;
  orderNumber?: string | number;
  timestamp?: string | number | Date;
  items: KOTPrintItem[];
  serverName?: string;
  ticketType?: "KOT" | "ADD_ON" | "REPRINT" | "FIRE_PLATES";
  note?: string;
}

export interface BillPrintItem {
  name: string;
  quantity: number;
  price: number; // Unit price
  total: number; // Total price
  modifiers?: Array<{
    name?: string;
    optionName?: string;
    price?: number;
  }>;
  specialInstructions?: string;
}

export interface BillPrintPayload {
  cafeName?: string;
  cafeAddress?: string; // Full registered physical address of the premises
  gstin?: string; // 15-digit GST Number
  fssai?: string; // 14-digit FSSAI License Number (CRITICAL Indian compliance)
  tableNumber: string | number;
  dinerFirstName?: string;
  billNumber?: string | number; // Sequential unique invoice number (e.g. INV-260929-001)
  timestamp?: string | number | Date; // Date & Time (e.g. 29-Sep-2026 | 19:44 PM)
  items: BillPrintItem[];
  subtotal: number;
  cgst?: number; // 2.5% CGST
  sgst?: number; // 2.5% SGST
  taxes?: number;
  serviceCharge?: number;
  discount?: number;
  grandTotal: number;
  currencySymbol?: string;
  paymentMode?: string; // e.g. PAID VIA UPI, PAID IN CASH, SPLIT: ₹200 Cash / ₹360 UPI
  serverName?: string;
}

// ESC/POS Command Constants
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export class EscPosBuilder {
  private buffer: number[] = [];

  // Reset printer to default configuration
  init(): this {
    this.buffer.push(ESC, 0x40);
    return this;
  }

  // Alignment: 0 = Left, 1 = Center, 2 = Right
  align(alignMode: 0 | 1 | 2): this {
    this.buffer.push(ESC, 0x61, alignMode);
    return this;
  }

  // Text Emphasis (Bold)
  bold(enable: boolean): this {
    this.buffer.push(ESC, 0x45, enable ? 0x01 : 0x00);
    return this;
  }

  // Text Underline
  underline(enable: boolean): this {
    this.buffer.push(ESC, 0x2d, enable ? 0x01 : 0x00);
    return this;
  }

  // Text Size scaling: widthMult (0-7), heightMult (0-7)
  textSize(widthMult: number, heightMult: number): this {
    const n = ((widthMult & 0x07) << 4) | (heightMult & 0x07);
    this.buffer.push(GS, 0x21, n);
    return this;
  }

  // Inverted Black/White print
  invert(enable: boolean): this {
    this.buffer.push(GS, 0x42, enable ? 0x01 : 0x00);
    return this;
  }

  // Append ASCII / UTF-8 string bytes
  text(str: string): this {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    for (let i = 0; i < bytes.length; i++) {
      this.buffer.push(bytes[i]);
    }
    return this;
  }

  // Append Line Feed
  lineFeed(count = 1): this {
    for (let i = 0; i < count; i++) {
      this.buffer.push(LF);
    }
    return this;
  }

  // Horizontal divider rule
  divider(char = "-", length = 32): this {
    this.align(0);
    this.text(char.repeat(length));
    this.lineFeed(1);
    return this;
  }

  // Feed lines and cut paper
  cut(): this {
    this.lineFeed(3);
    // GS V 66 0 (Feed and partial/full cut)
    this.buffer.push(GS, 0x56, 0x42, 0x00);
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Format Date & Time strictly matching Indian standard: 29-Sep-2026 | 19:44 PM
 */
export function formatIndianEscposDateTime(dateInput?: any): string {
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
 * Builds the KOT binary byte array specifically formatted for kitchen rails.
 */
export function buildKOTBytes(ticket: KOTPrintPayload): Uint8Array {
  const builder = new EscPosBuilder();

  const cafeName = (ticket.cafeName || "THE ROASTED BEAN CAFE").toUpperCase();
  const rawTable = String(ticket.tableNumber || "01").replace(/^Table\s*/i, "");
  const tableDisplay = `TABLE ${rawTable.padStart(2, "0")}`;
  const hostDisplay = ticket.dinerFirstName ? `Host: ${ticket.dinerFirstName}` : "Walk-in";
  const dateTimeStr = formatIndianEscposDateTime(ticket.timestamp);

  builder.init();

  // 1. Header (Centered)
  builder.align(1);
  builder.bold(true);
  builder.textSize(0, 0);
  builder.text(`*** ${ticket.ticketType || "KITCHEN ORDER TICKET"} ***\n`);
  builder.text(`${cafeName}\n`);
  builder.bold(false);

  // 2. JUMBO TABLE NUMBER (Readable from 2 meters away)
  builder.lineFeed(1);
  builder.bold(true);
  builder.textSize(2, 2); // Jumbo Double Height & Width
  builder.text(`${tableDisplay}\n`);
  builder.textSize(0, 0); // Reset to standard size
  builder.lineFeed(1);

  // Meta: Time, Ticket #, Host
  const orderIdStr = String(ticket.orderNumber || "").replace(/^ord_/, "").slice(-4).toUpperCase();
  builder.text(`${dateTimeStr}\n`);
  builder.text(`#${orderIdStr || "1001"}  |  ${hostDisplay}\n`);
  builder.divider("=", 32);

  // 3. Item Breakdown
  builder.align(0);
  (ticket.items || []).forEach((item, index) => {
    const qtyStr = `[${item.quantity}x]`.padEnd(5, " ");
    const dietRaw = String(item.dietary || "").toUpperCase();
    const isJain = dietRaw.includes("JAIN");
    const isVeg = item.isVeg || dietRaw.includes("VEG");

    builder.bold(true);
    builder.textSize(1, 1);

    if (isJain) {
      builder.text(`*** JAIN ***\n`);
      builder.text(`${qtyStr} ${item.name}\n`);
    } else if (isVeg) {
      builder.text(`${qtyStr} (V) ${item.name}\n`);
    } else {
      builder.text(`${qtyStr} ${item.name}\n`);
    }

    builder.textSize(0, 0);
    builder.bold(false);

    // Modifiers list
    if (item.selectedModifiers && item.selectedModifiers.length > 0) {
      const modNames = item.selectedModifiers
        .map((m) => m.name || m.optionName)
        .filter(Boolean)
        .join(", ");
      if (modNames) {
        builder.text(`     ↳ + ${modNames}\n`);
      }
    }

    // Special instructions
    if (item.specialInstructions && item.specialInstructions.trim()) {
      builder.bold(true);
      builder.underline(true);
      builder.text(`     >> NOTE: ${item.specialInstructions.trim()}\n`);
      builder.underline(false);
      builder.bold(false);
    }

    if (index < ticket.items.length - 1) {
      builder.divider("-", 32);
    }
  });

  if (ticket.note) {
    builder.lineFeed(1);
    builder.bold(true);
    builder.text(`ORDER NOTE: ${ticket.note}\n`);
    builder.bold(false);
  }

  // 4. Footer & Cut
  builder.divider("=", 32);
  builder.align(1);
  builder.text(`Server: ${ticket.serverName || "Floor Captain"}\n`);
  builder.text(`Tableline KDS: ${new Date().toLocaleTimeString()}\n`);
  builder.cut();

  return builder.build();
}

/**
 * Builds the customer bill/receipt binary ESC/POS payload strictly compliant with Indian law:
 * 1. The Business Header (Cafe Name, Physical Address, 14-digit FSSAI, 15-digit GSTIN)
 * 2. The Transaction Metadata (Invoice # e.g. INV-260929-001, Date & Time, Table Number)
 * 3. The Order Breakdown (QTY | Item Name | Unit Price | Total Price, Indented Modifiers)
 * 4. The Strict Financial Ledger (Subtotal, CGST 2.5%, SGST 2.5%, Grand Total, Explicit Payment Mode)
 */
export function buildBillBytes(bill: BillPrintPayload): Uint8Array {
  const builder = new EscPosBuilder();
  const currency = bill.currencySymbol || "Rs.";
  const cafeName = (bill.cafeName || "THE ROASTED BEAN CAFE").toUpperCase();
  const cafeAddress = bill.cafeAddress || "Shop 4, Ground Floor, Heritage Hub, FC Road, Pune 411004";
  const fssai = bill.fssai || "11523001000452";
  const gstin = bill.gstin || "27AAPCA1234F1Z5";
  const rawTable = String(bill.tableNumber || "01").replace(/^Table\s*/i, "").padStart(2, "0");
  const invoiceNum = String(bill.billNumber || "INV-260929-001");
  const dateTimeStr = formatIndianEscposDateTime(bill.timestamp);

  // Tax breakdown: standard Indian 5% food GST split into 2.5% CGST and 2.5% SGST
  const subtotal = Number(bill.subtotal || 0);
  let totalTaxes = Number(bill.taxes || (bill.cgst && bill.sgst ? (bill.cgst + bill.sgst) : 0));
  if (totalTaxes <= 0 && subtotal > 0) {
    totalTaxes = Math.round(subtotal * 0.05 * 100) / 100;
  }
  const cgst = bill.cgst ?? Math.round((totalTaxes / 2) * 100) / 100;
  const sgst = bill.sgst ?? Math.round((totalTaxes / 2) * 100) / 100;
  const grandTotal = Number(bill.grandTotal || (subtotal + totalTaxes - (bill.discount || 0)));
  const paymentMode = (bill.paymentMode || "PAID VIA UPI").toUpperCase();

  builder.init();

  // 1. The Business Header (Centered)
  builder.align(1);
  builder.bold(true);
  builder.textSize(1, 1);
  builder.text(`${cafeName}\n`);
  builder.textSize(0, 0);
  builder.bold(false);

  // Full registered physical address
  builder.text(`${cafeAddress}\n`);

  // GSTIN & Mandatory 14-digit FSSAI License Number
  builder.bold(true);
  builder.text(`GSTIN: ${gstin}\n`);
  builder.text(`FSSAI Lic. No.: ${fssai}\n`);
  builder.bold(false);

  builder.divider("=", 32);

  // 2. The Transaction Metadata
  builder.align(0);
  builder.bold(true);
  builder.text(`INVOICE: ${invoiceNum}\n`);
  builder.bold(false);
  builder.text(`DATE   : ${dateTimeStr}\n`);
  builder.bold(true);
  builder.text(`TABLE  : Table ${rawTable}${bill.dinerFirstName ? ` (${bill.dinerFirstName})` : ""}\n`);
  builder.bold(false);
  if (bill.serverName) {
    builder.text(`SERVER : ${bill.serverName}\n`);
  }

  builder.divider("-", 32);

  // 3. The Order Breakdown
  // Column Header: QTY | ITEM NAME | RATE | AMOUNT
  builder.bold(true);
  builder.text("QTY ITEM             RATE   AMT\n");
  builder.bold(false);
  builder.divider("-", 32);

  // Items
  bill.items.forEach((item) => {
    const qStr = `${item.quantity}x`.padEnd(4, " ");
    const nameStr = item.name.length > 13 ? item.name.slice(0, 12) + "." : item.name.padEnd(13, " ");
    const rateStr = String(Math.round(item.price)).padStart(6, " ");
    const amtStr = String(Math.round(item.total)).padStart(6, " ");

    builder.bold(true);
    builder.text(`${qStr}${nameStr}${rateStr} ${amtStr}\n`);
    builder.bold(false);

    // Indented Modifiers (e.g. Extra Cheese)
    if (item.modifiers && item.modifiers.length > 0) {
      item.modifiers.forEach((mod) => {
        const modTitle = mod.name || mod.optionName || "";
        if (modTitle) {
          builder.text(`    ↳ + ${modTitle}\n`);
        }
      });
    }

    if (item.specialInstructions) {
      builder.text(`    * ${item.specialInstructions}\n`);
    }
  });

  builder.divider("-", 32);

  // 4. The Strict Financial Ledger
  const padLedger = (lbl: string, val: string) => {
    const totalSpaces = 32 - lbl.length - val.length;
    return `${lbl}${" ".repeat(Math.max(1, totalSpaces))}${val}\n`;
  };

  builder.text(padLedger("Subtotal (Pre-tax):", `${currency}${subtotal.toFixed(2)}`));
  builder.text(padLedger("CGST (2.5%):", `${currency}${cgst.toFixed(2)}`));
  builder.text(padLedger("SGST (2.5%):", `${currency}${sgst.toFixed(2)}`));

  if (bill.serviceCharge && bill.serviceCharge > 0) {
    builder.text(padLedger("Service Charge:", `${currency}${bill.serviceCharge.toFixed(2)}`));
  }
  if (bill.discount && bill.discount > 0) {
    builder.text(padLedger("Discount:", `-${currency}${bill.discount.toFixed(2)}`));
  }

  builder.divider("=", 32);
  builder.bold(true);
  builder.textSize(1, 1);
  builder.text(padLedger("GRAND TOTAL:", `${currency}${grandTotal.toFixed(2)}`));
  builder.textSize(0, 0);
  builder.bold(false);
  builder.divider("=", 32);

  // Payment Mode
  builder.align(1);
  builder.bold(true);
  builder.text(`*** ${paymentMode} ***\n`);
  builder.bold(false);

  // Legal footer
  builder.lineFeed(1);
  builder.text("Thank you for visiting!\n");
  builder.text(`FSSAI Lic. No.: ${fssai}\n`);
  builder.text("TABLELINE POS • INDIA\n");
  builder.cut();

  return builder.build();
}

/**
 * Text formatting for the High-Fidelity Monospaced Thermal Slip Simulator
 */
export function formatBillPlainText(bill: BillPrintPayload): string {
  const currency = bill.currencySymbol || "Rs.";
  const cafeName = (bill.cafeName || "THE ROASTED BEAN CAFE").toUpperCase();
  const cafeAddress = bill.cafeAddress || "Shop 4, Ground Floor, Heritage Hub, FC Road, Pune 411004";
  const fssai = bill.fssai || "11523001000452";
  const gstin = bill.gstin || "27AAPCA1234F1Z5";
  const rawTable = String(bill.tableNumber || "01").replace(/^Table\s*/i, "").padStart(2, "0");
  const invoiceNum = String(bill.billNumber || "INV-260929-001");
  const dateTimeStr = formatIndianEscposDateTime(bill.timestamp);

  const subtotal = Number(bill.subtotal || 0);
  let totalTaxes = Number(bill.taxes || (bill.cgst && bill.sgst ? (bill.cgst + bill.sgst) : 0));
  if (totalTaxes <= 0 && subtotal > 0) {
    totalTaxes = Math.round(subtotal * 0.05 * 100) / 100;
  }
  const cgst = bill.cgst ?? Math.round((totalTaxes / 2) * 100) / 100;
  const sgst = bill.sgst ?? Math.round((totalTaxes / 2) * 100) / 100;
  const grandTotal = Number(bill.grandTotal || (subtotal + totalTaxes - (bill.discount || 0)));
  const paymentMode = (bill.paymentMode || "PAID VIA UPI").toUpperCase();

  const lines: string[] = [];
  lines.push("================================");
  lines.push(cafeName.padStart(Math.floor((32 + cafeName.length) / 2), " "));
  lines.push(cafeAddress.slice(0, 32));
  if (cafeAddress.length > 32) lines.push(cafeAddress.slice(32, 64));
  lines.push(`GSTIN: ${gstin}`);
  lines.push(`*** FSSAI Lic: ${fssai} ***`.padStart(29, " "));
  lines.push("================================");
  lines.push(`INVOICE: ${invoiceNum}`);
  lines.push(`DATE   : ${dateTimeStr}`);
  lines.push(`TABLE  : Table ${rawTable}${bill.dinerFirstName ? ` (${bill.dinerFirstName})` : ""}`);
  lines.push("--------------------------------");
  lines.push("QTY ITEM             RATE   AMT ");
  lines.push("--------------------------------");

  bill.items.forEach((item) => {
    const qStr = `${item.quantity}x`.padEnd(4, " ");
    const nameStr = item.name.length > 13 ? item.name.slice(0, 12) + "." : item.name.padEnd(13, " ");
    const rateStr = String(Math.round(item.price)).padStart(6, " ");
    const amtStr = String(Math.round(item.total)).padStart(6, " ");
    lines.push(`${qStr}${nameStr}${rateStr} ${amtStr}`);

    if (item.modifiers && item.modifiers.length > 0) {
      item.modifiers.forEach((m) => {
        const title = m.name || m.optionName || "";
        if (title) lines.push(`    ↳ + ${title}`);
      });
    }
  });

  lines.push("--------------------------------");
  lines.push(`Subtotal:         ${currency}${subtotal.toFixed(2)}`);
  lines.push(`CGST (2.5%):      ${currency}${cgst.toFixed(2)}`);
  lines.push(`SGST (2.5%):      ${currency}${sgst.toFixed(2)}`);
  lines.push("================================");
  lines.push(`GRAND TOTAL:      ${currency}${grandTotal.toFixed(2)}`);
  lines.push("================================");
  lines.push(`*** ${paymentMode} ***`.padStart(Math.floor((32 + paymentMode.length + 8) / 2), " "));
  lines.push("");
  lines.push("     THANK YOU FOR VISITING     ");
  lines.push(`  FSSAI Lic. No.: ${fssai}  `);
  lines.push("================================");

  return lines.join("\n");
}

/**
 * Text formatting for KOT Slip Simulator
 */
export function formatKOTPlainText(ticket: KOTPrintPayload): string {
  const cafeName = (ticket.cafeName || "THE ROASTED BEAN CAFE").toUpperCase();
  const rawTable = String(ticket.tableNumber || "01").replace(/^Table\s*/i, "").padStart(2, "0");
  const host = ticket.dinerFirstName ? `Host: ${ticket.dinerFirstName}` : "Walk-in";
  const orderId = String(ticket.orderNumber || "").replace(/^ord_/, "").slice(-4).toUpperCase();
  const dateTimeStr = formatIndianEscposDateTime(ticket.timestamp);

  const lines: string[] = [];
  lines.push("================================");
  lines.push(`*** ${ticket.ticketType || "KITCHEN ORDER TICKET"} ***`.padStart(26, " "));
  lines.push(cafeName.padStart(Math.floor((32 + cafeName.length) / 2), " "));
  lines.push("================================");
  lines.push("");
  lines.push(`         TABLE ${rawTable}      `);
  lines.push(` ${orderId ? `#${orderId}` : "#1001"} | ${host} `);
  lines.push(` ${dateTimeStr} `);
  lines.push("--------------------------------");

  ticket.items.forEach((item) => {
    const isJain = String(item.dietary || "").toUpperCase().includes("JAIN");
    const isVeg = item.isVeg || String(item.dietary || "").toUpperCase().includes("VEG");
    const badge = isJain ? "[JAIN] " : isVeg ? "(V) " : "";
    lines.push(`[${item.quantity}x] ${badge}${item.name.toUpperCase()}`);

    if (item.selectedModifiers && item.selectedModifiers.length > 0) {
      const mods = item.selectedModifiers.map((m) => m.name || m.optionName).filter(Boolean).join(", ");
      if (mods) lines.push(`     ↳ + ${mods}`);
    }

    if (item.specialInstructions) {
      lines.push(`     >> NOTE: ${item.specialInstructions.trim()}`);
    }
    lines.push("--------------------------------");
  });

  if (ticket.note) {
    lines.push(`NOTE: ${ticket.note}`);
    lines.push("--------------------------------");
  }

  lines.push(`Server: ${ticket.serverName || "Floor Captain"}`);
  lines.push(`Printed: ${new Date().toLocaleTimeString()}`);
  lines.push("================================");

  return lines.join("\n");
}

/**
 * Generates a test print payload for checking thermal printer alignment & connection.
 */
export function buildTestPrintBytes(cafeName = "The Roasted Bean Cafe"): Uint8Array {
  const builder = new EscPosBuilder();
  builder.init();
  builder.align(1);
  builder.bold(true);
  builder.textSize(1, 1);
  builder.text("THERMAL PRINTER READY\n");
  builder.textSize(0, 0);
  builder.text(`${cafeName.toUpperCase()}\n`);
  builder.bold(false);
  builder.text("FSSAI Lic. No: 11523001000452\n");
  builder.divider("=", 32);

  builder.text(" ( (    Bluetooth Web Link\n");
  builder.text("  ) )   Status: CONNECTED\n");
  builder.text("........\n");
  builder.text("|      |] Ready to print KOT & Bills\n");
  builder.text("\\______/\n");
  builder.divider("-", 32);
  builder.text(`Test: ${new Date().toLocaleTimeString()}\n`);
  builder.text("ESC/POS 58mm/80mm OK\n");
  builder.cut();

  return builder.build();
}
