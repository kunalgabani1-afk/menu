export interface RestaurantQrInfo {
  name: string;
  tagline?: string;
  logoUrl?: string;
}

export interface TableQrItem {
  id: string;
  tableNumber: string;
  location?: string;
  qrDataUrl: string;
  destinationUrl?: string;
}

export type QrCardFormat = "acrylic_stand" | "tabletop_card" | "table_sticker";

export function escapeHtml(str: string): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatTableTitle(num: string): string {
  const clean = String(num || "").trim();
  if (!clean) return "TABLE";
  const tablePrefixRegex = /^table[\s\-_]*/i;
  if (tablePrefixRegex.test(clean)) {
    const remainder = clean.replace(tablePrefixRegex, "").trim();
    if (/^\d+$/.test(remainder)) {
      const n = parseInt(remainder, 10);
      return `TABLE ${n < 10 ? `0${n}` : n}`;
    }
    return remainder ? `TABLE ${remainder.toUpperCase()}` : "TABLE";
  }
  if (/^\d+$/.test(clean)) {
    const n = parseInt(clean, 10);
    return `TABLE ${n < 10 ? `0${n}` : n}`;
  }
  return clean.toUpperCase();
}

export function generateSingleTableQrCardHtml(
  table: TableQrItem,
  restaurant: RestaurantQrInfo,
  format: QrCardFormat = "acrylic_stand"
): string {
  const name = escapeHtml(restaurant.name || "Restaurant");
  const tagline = escapeHtml(restaurant.tagline || "");
  const logo = restaurant.logoUrl?.trim();
  const tableTitle = formatTableTitle(table.tableNumber);
  const location = escapeHtml(table.location || "");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${tableTitle} - ${name} QR Stand</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #f7f4ed;
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
      color: #1a120b;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .qr-stand-frame {
      width: 380px;
      background: #faf8f5;
      border: 2px solid #e6decb;
      border-radius: 28px;
      padding: 36px 28px 28px;
      text-align: center;
      position: relative;
      box-shadow: 0 16px 40px -10px rgba(44, 24, 16, 0.08), 0 2px 6px rgba(44, 24, 16, 0.03);
    }

    .corner-accent {
      position: absolute;
      width: 14px;
      height: 14px;
      border-color: #c86d51;
      opacity: 0.45;
    }
    .top-left { top: 18px; left: 18px; border-top: 2px solid #c86d51; border-left: 2px solid #c86d51; border-top-left-radius: 6px; }
    .top-right { top: 18px; right: 18px; border-top: 2px solid #c86d51; border-right: 2px solid #c86d51; border-top-right-radius: 6px; }
    .bottom-left { bottom: 18px; left: 18px; border-bottom: 2px solid #c86d51; border-left: 2px solid #c86d51; border-bottom-left-radius: 6px; }
    .bottom-right { bottom: 18px; right: 18px; border-bottom: 2px solid #c86d51; border-right: 2px solid #c86d51; border-bottom-right-radius: 6px; }

    .brand-logo {
      max-height: 48px;
      max-width: 120px;
      margin: 0 auto 10px;
      display: block;
      object-fit: contain;
    }

    .restaurant-title {
      font-family: 'Cinzel', 'Georgia', serif;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: #1a120b;
      text-transform: uppercase;
      line-height: 1.25;
      margin-bottom: 4px;
    }

    .restaurant-tagline {
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.04em;
      color: #785942;
      text-transform: uppercase;
      margin-bottom: 18px;
    }

    .divider {
      height: 1px;
      background: linear-gradient(90deg, transparent, #d5c8b2, transparent);
      margin: 0 auto 20px;
      width: 80%;
    }

    .table-badge-container {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: #2c1810;
      color: #faf8f5;
      padding: 7px 22px;
      border-radius: 9999px;
      margin-bottom: 22px;
      box-shadow: 0 4px 12px rgba(44, 24, 16, 0.15);
    }

    .table-badge-text {
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.12em;
    }

    .qr-canvas-holder {
      background: #ffffff;
      padding: 16px;
      border-radius: 20px;
      border: 1.5px solid #ded4bf;
      display: inline-block;
      margin: 0 auto 20px;
      box-shadow: 0 4px 16px -2px rgba(44, 24, 16, 0.05);
    }

    .qr-img {
      display: block;
      width: 200px;
      height: 200px;
      border-radius: 8px;
      image-rendering: -webkit-optimize-contrast;
      image-rendering: crisp-edges;
    }

    .action-header {
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 0.12em;
      color: #2c1810;
      text-transform: uppercase;
      margin-bottom: 6px;
    }

    .action-subtext {
      font-size: 12px;
      font-weight: 500;
      color: #57463a;
      margin-bottom: 4px;
    }

    .location-label {
      display: inline-block;
      margin-top: 8px;
      font-size: 11px;
      font-weight: 600;
      color: #8b5e3c;
      background: #f1e9da;
      padding: 3px 12px;
      border-radius: 6px;
      letter-spacing: 0.03em;
    }

    .footer-brand {
      margin-top: 22px;
      border-top: 1px solid #e9e1d2;
      padding-top: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #9c8471;
    }

    .footer-dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: #c86d51;
    }

    @media print {
      body {
        background: transparent !important;
        padding: 0 !important;
      }
      .qr-stand-frame {
        box-shadow: none !important;
        border: 1.5px solid #1a120b !important;
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="qr-stand-frame">
    <div class="corner-accent top-left"></div>
    <div class="corner-accent top-right"></div>
    <div class="corner-accent bottom-left"></div>
    <div class="corner-accent bottom-right"></div>

    ${logo ? `<img class="brand-logo" src="${logo}" alt="${name} logo" />` : ""}
    <h1 class="restaurant-title">${name}</h1>
    ${tagline ? `<div class="restaurant-tagline">${tagline}</div>` : ""}

    <div class="divider"></div>

    <div class="table-badge-container">
      <span class="table-badge-text">${tableTitle}</span>
    </div>

    <div>
      <div class="qr-canvas-holder">
        <img class="qr-img" src="${table.qrDataUrl}" alt="Ordering QR Code for ${tableTitle}" />
      </div>
    </div>

    <div class="action-header">Scan to View Menu & Order</div>
    <div class="action-subtext">Point phone camera to scan • No app required</div>
    ${location ? `<div class="location-label">${location}</div>` : ""}

    <div class="footer-brand">
      <span>Powered by Tableline</span>
      <span class="footer-dot"></span>
      <span>Instant Digital Dining</span>
    </div>
  </div>
</body>
</html>`;
}

export function generateBulkTablesQrHtml(
  tables: TableQrItem[],
  restaurant: RestaurantQrInfo
): string {
  const name = escapeHtml(restaurant.name || "Restaurant");
  const tagline = escapeHtml(restaurant.tagline || "");
  const logo = restaurant.logoUrl?.trim();

  const cardsHtml = tables
    .filter((t) => Boolean(t.qrDataUrl))
    .map((table) => {
      const tableTitle = formatTableTitle(table.tableNumber);
      const location = escapeHtml(table.location || "");
      return `
        <div class="qr-card">
          <div class="corner-accent top-left"></div>
          <div class="corner-accent top-right"></div>
          <div class="corner-accent bottom-left"></div>
          <div class="corner-accent bottom-right"></div>

          ${logo ? `<img class="brand-logo" src="${logo}" alt="${name}" />` : ""}
          <h2 class="restaurant-title">${name}</h2>
          ${tagline ? `<div class="restaurant-tagline">${tagline}</div>` : ""}
          <div class="divider"></div>

          <div class="table-badge">
            <span class="table-badge-text">${tableTitle}</span>
          </div>

          <div class="qr-canvas-holder">
            <img class="qr-img" src="${table.qrDataUrl}" alt="QR code for ${tableTitle}" />
          </div>

          <div class="action-header">Scan to Order</div>
          <div class="action-subtext">Point phone camera to view menu</div>
          ${location ? `<div class="location-label">${location}</div>` : ""}

          <div class="footer-brand">
            <span>Powered by Tableline</span>
          </div>
        </div>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${name} - All Table QR Stands</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #f7f4ed;
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      padding: 32px;
      color: #1a120b;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page-header {
      text-align: center;
      margin-bottom: 32px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e6decb;
    }
    .page-title {
      font-family: 'Cinzel', serif;
      font-size: 24px;
      font-weight: 700;
      color: #1a120b;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .page-subtitle {
      font-size: 13px;
      color: #785942;
      margin-top: 4px;
    }

    .grid-container {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 32px;
      max-width: 860px;
      margin: 0 auto;
    }

    .qr-card {
      background: #faf8f5;
      border: 1.5px solid #ded4bf;
      border-radius: 24px;
      padding: 28px 20px 20px;
      text-align: center;
      position: relative;
      box-shadow: 0 8px 24px -6px rgba(44, 24, 16, 0.06);
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .corner-accent {
      position: absolute;
      width: 12px;
      height: 12px;
      border-color: #c86d51;
      opacity: 0.4;
    }
    .top-left { top: 14px; left: 14px; border-top: 2px solid #c86d51; border-left: 2px solid #c86d51; border-top-left-radius: 4px; }
    .top-right { top: 14px; right: 14px; border-top: 2px solid #c86d51; border-right: 2px solid #c86d51; border-top-right-radius: 4px; }
    .bottom-left { bottom: 14px; left: 14px; border-bottom: 2px solid #c86d51; border-left: 2px solid #c86d51; border-bottom-left-radius: 4px; }
    .bottom-right { bottom: 14px; right: 14px; border-bottom: 2px solid #c86d51; border-right: 2px solid #c86d51; border-bottom-right-radius: 4px; }

    .brand-logo {
      max-height: 36px;
      max-width: 100px;
      margin: 0 auto 6px;
      display: block;
      object-fit: contain;
    }

    .restaurant-title {
      font-family: 'Cinzel', serif;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: #1a120b;
      text-transform: uppercase;
      line-height: 1.2;
    }

    .restaurant-tagline {
      font-size: 10px;
      font-weight: 500;
      color: #785942;
      text-transform: uppercase;
      margin-top: 2px;
      letter-spacing: 0.03em;
    }

    .divider {
      height: 1px;
      background: #e6decb;
      margin: 12px auto 16px;
      width: 75%;
    }

    .table-badge {
      display: inline-flex;
      background: #2c1810;
      color: #faf8f5;
      padding: 5px 18px;
      border-radius: 9999px;
      margin-bottom: 16px;
    }

    .table-badge-text {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.1em;
    }

    .qr-canvas-holder {
      background: #ffffff;
      padding: 12px;
      border-radius: 16px;
      border: 1px solid #ded4bf;
      display: inline-block;
      margin: 0 auto 14px;
    }

    .qr-img {
      display: block;
      width: 160px;
      height: 160px;
      border-radius: 6px;
    }

    .action-header {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: #2c1810;
      text-transform: uppercase;
      margin-bottom: 3px;
    }

    .action-subtext {
      font-size: 11px;
      color: #57463a;
    }

    .location-label {
      display: inline-block;
      margin-top: 6px;
      font-size: 10px;
      font-weight: 600;
      color: #8b5e3c;
      background: #f1e9da;
      padding: 2px 10px;
      border-radius: 4px;
    }

    .footer-brand {
      margin-top: 16px;
      border-top: 1px solid #ece4d7;
      padding-top: 8px;
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #9c8471;
    }

    @media print {
      body {
        background: transparent !important;
        padding: 0 !important;
      }
      .page-header {
        display: none !important;
      }
      .grid-container {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
      }
      .qr-card {
        box-shadow: none !important;
        border: 1.5px solid #1a120b !important;
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="page-header">
    <h1 class="page-title">${name}</h1>
    <p class="page-subtitle">Printable Dining Room QR Stands — ${tables.length} Active Tables</p>
  </div>
  <div class="grid-container">
    ${cardsHtml}
  </div>
</body>
</html>`;
}

export function printTableQr(
  table: TableQrItem,
  restaurant: RestaurantQrInfo,
  format: QrCardFormat = "acrylic_stand"
): void {
  const popup = window.open("", "_blank", "width=520,height=750,scrollbars=yes");
  if (!popup) return;

  const html = generateSingleTableQrCardHtml(table, restaurant, format);
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  setTimeout(() => {
    popup.print();
  }, 350);
}

export function printAllTablesQr(
  tables: TableQrItem[],
  restaurant: RestaurantQrInfo
): void {
  const popup = window.open("", "_blank", "width=880,height=900,scrollbars=yes");
  if (!popup) return;

  const html = generateBulkTablesQrHtml(tables, restaurant);
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  setTimeout(() => {
    popup.print();
  }, 400);
}
