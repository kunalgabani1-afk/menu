/**
 * Safe, zero-crash formatting utilities for Tableline Hospitality.
 * Guarantees that undefined, null, or NaN values will never crash the UI.
 */

export function formatNumber(value: number | string | undefined | null): string {
  if (value === undefined || value === null || value === "") return "0";
  const num = typeof value === "number" ? value : Number(value);
  if (isNaN(num)) return "0";
  return num.toLocaleString();
}

export function formatCurrency(
  amount: number | string | undefined | null,
  currency = "₹",
): string {
  return `${currency}${formatNumber(amount)}`;
}

export function formatDateTime(
  dateVal: number | string | Date | undefined | null,
  formatStyle?: "time" | "date" | "full" | string,
): string {
  if (!dateVal) return "—";
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return "—";
    if (formatStyle === "time") {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (formatStyle === "date") {
      return d.toLocaleDateString();
    }
    return d.toLocaleString();
  } catch {
    return "—";
  }
}

export function formatPlanPrice(
  planDef?: { monthlyFee?: number; priceMonthly?: number; currency?: string } | null,
): string {
  if (!planDef) return "₹0";
  const fee = planDef.monthlyFee ?? planDef.priceMonthly ?? 0;
  return `₹${formatNumber(fee)}`;
}

/**
 * Normalizes table number/name display so that "Table Table1" never happens.
 * If user enters "Table 1", it displays "Table 1".
 * If user enters "1" or 1, it displays "Table 1".
 * If user enters "Patio 4", it displays "Patio 4".
 */
export function formatTableName(rawTable: string | number | undefined | null): string {
  if (rawTable === undefined || rawTable === null) return "Table";
  const clean = String(rawTable).trim();
  if (!clean) return "Table";
  
  // If it already starts with Table or table (e.g. "Table 1", "Table A", "table-2", "table1")
  const tablePrefixRegex = /^table[\s\-_]*/i;
  if (tablePrefixRegex.test(clean)) {
    const remainder = clean.replace(tablePrefixRegex, "").trim();
    return remainder ? `Table ${remainder}` : "Table";
  }

  // If it's a numeric string like "1", "02", return "Table 1"
  if (/^\d+$/.test(clean)) {
    return `Table ${clean}`;
  }

  // Otherwise return as is (e.g. "Bar Counter 2", "VIP Lounge")
  return clean;
}

