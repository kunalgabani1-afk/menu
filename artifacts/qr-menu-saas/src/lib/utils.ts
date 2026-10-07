import { twMerge } from 'tailwind-merge';

import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Authoritative Indian currency formatting helper for Tableline.
 * Formats numbers into Indian numbering format with the ₹ symbol.
 *
 * Examples:
 * formatCurrency(120) => "₹120"
 * formatCurrency(1250) => "₹1,250"
 * formatCurrency(12500) => "₹12,500"
 * formatCurrency(125000) => "₹1,25,000"
 * formatCurrency(36.25) => "₹36.25"
 */
export function formatCurrency(
  amount: number | string | undefined | null,
  currency: string = "₹"
): string {
  const num = typeof amount === "number" ? amount : parseFloat(String(amount || 0));
  if (isNaN(num)) return `₹0`;

  // Always normalize symbol to ₹ if empty, $, USD, US$, or default
  const symbol =
    !currency || currency === "$" || currency === "USD" || currency === "US$"
      ? "₹"
      : currency;

  // Format with en-IN locale
  const hasDecimals = num % 1 !== 0;
  const formattedNumber = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(num);

  return `${symbol}${formattedNumber}`;
}

export const formatINR = formatCurrency;
