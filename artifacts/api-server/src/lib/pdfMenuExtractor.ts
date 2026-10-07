// Polyfill DOM globals needed by pdf.js / pdf-parse in Node runtime
if (typeof (globalThis as any).DOMMatrix === "undefined") {
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
  };
}
if (typeof (globalThis as any).ImageData === "undefined") {
  (globalThis as any).ImageData = class ImageData {};
}
if (typeof (globalThis as any).Path2D === "undefined") {
  (globalThis as any).Path2D = class Path2D {};
}

import type { ExtractedMenuItemRaw, MenuExtractionResult } from "./ai";

interface ParsedLine {
  text: string;
  isCategory: boolean;
  dishName?: string;
  description?: string;
  price?: number;
  veg?: boolean | null;
  isVegan?: boolean;
  isJain?: boolean;
}

const COMMON_CATEGORY_KEYWORDS = [
  "starter",
  "appetizer",
  "soup",
  "salad",
  "main course",
  "main",
  "bread",
  "rice",
  "biryani",
  "curry",
  "dal",
  "pizza",
  "pasta",
  "burger",
  "sandwich",
  "side",
  "beverage",
  "drink",
  "cocktail",
  "mocktail",
  "coffee",
  "tea",
  "dessert",
  "sweet",
  "combo",
  "special",
  "snack",
  "tandoor",
  "chinese",
  "continental",
  "platter",
  "kids",
];

export async function extractTextFromPdfBuffer(pdfBuffer: Buffer): Promise<string> {
  let parser: any = null;
  try {
    const { PDFParse } = await import("pdf-parse");
    parser = new PDFParse({ data: pdfBuffer });
    await parser.load();
    const res = await parser.getText();
    const text = typeof res === "string" ? res : res?.text || "";
    return text.trim();
  } finally {
    if (parser && typeof parser.destroy === "function") {
      try {
        await parser.destroy();
      } catch {
        // ignore cleanup error
      }
    }
  }
}

export function parseMenuTextLines(rawText: string, existingCategories: string[] = []): MenuExtractionResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^-- \d+ of \d+ --$/.test(l)); // filter PDF page footers

  const detectedCategories: string[] = [];
  const extractedItems: ExtractedMenuItemRaw[] = [];
  let currentCategory = existingCategories[0] || "General";
  let warningCount = 0;

  // Regular expression to match price at end of line or after hyphen/dots:
  // e.g., "Paneer Tikka ... 240", "Chicken Biryani - ₹350", "Coffee Rs. 120"
  const priceRegex = /(?:₹|rs\.?|inr|\$)?\s*([0-9]+(?:[.,][0-9]{1,2})?)\s*(?:\/-\s*)?$/i;

  let pendingDish: Partial<ExtractedMenuItemRaw> | null = null;

  const flushPending = () => {
    if (!pendingDish || !pendingDish.name) return;
    const finalItem: ExtractedMenuItemRaw = {
      name: pendingDish.name,
      category: pendingDish.category || currentCategory,
      description: pendingDish.description || "",
      price: pendingDish.price ?? null,
      veg: pendingDish.veg ?? null,
      isVegan: Boolean(pendingDish.isVegan),
      isJain: Boolean(pendingDish.isJain),
      spicyLevel: pendingDish.spicyLevel || "NONE",
      allergens: [],
      requiresReview: pendingDish.requiresReview ?? false,
      reviewReason: pendingDish.reviewReason,
    };
    if (finalItem.price === null || finalItem.price === 0) {
      finalItem.requiresReview = true;
      finalItem.reviewReason = finalItem.reviewReason || "Price missing or unreadable";
      warningCount++;
    }
    extractedItems.push(finalItem);
    pendingDish = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if line looks like a Category Header:
    // 1. All uppercase or Title Case without numbers, and matches common keywords or exists in existingCategories
    const cleanLower = line.toLowerCase().replace(/[^a-z\s&]/g, "").trim();
    const hasCategoryKeyword = COMMON_CATEGORY_KEYWORDS.some(
      (kw) => cleanLower === kw || cleanLower.startsWith(`${kw} `) || cleanLower.endsWith(` ${kw}`)
    );
    const matchesExisting = existingCategories.some(
      (c) => c.toLowerCase() === cleanLower
    );
    const isHeaderLine =
      (hasCategoryKeyword || matchesExisting || (line.length < 35 && line === line.toUpperCase() && !/\d/.test(line))) &&
      !priceRegex.test(line);

    if (isHeaderLine && cleanLower.length > 2) {
      flushPending();
      // Capitalize nicely
      const categoryName = line
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
      currentCategory = categoryName;
      if (!detectedCategories.includes(currentCategory)) {
        detectedCategories.push(currentCategory);
      }
      continue;
    }

    // Check if this line contains a price
    const priceMatch = line.match(priceRegex);
    if (priceMatch) {
      flushPending();

      const rawPriceStr = priceMatch[1].replace(/,/g, "");
      const price = parseFloat(rawPriceStr);

      // Remaining part of line is dish name (+ possible description or dietary tag)
      let namePart = line.substring(0, priceMatch.index).trim();
      // Remove trailing dots, hyphens, colons
      namePart = namePart.replace(/[.\-_:—–]+$/, "").trim();

      // Check dietary tags in namePart
      let veg: boolean | null = null;
      let isVegan = false;
      let isJain = false;

      if (/\b(?:vegan|plant[- ]based)\b/i.test(namePart)) {
        isVegan = true;
        veg = true;
      }
      if (/\b(?:jain|no onion)\b/i.test(namePart)) {
        isJain = true;
        veg = true;
      }
      if (/\b(?:non[- ]?veg|chicken|mutton|fish|prawn|egg|pork|beef|meat)\b/i.test(namePart)) {
        veg = false;
      } else if (/\b(?:veg|vegetarian)\b/i.test(namePart)) {
        veg = true;
      }

      // Check if description is separated by hyphen or dash: e.g. "Dal Makhani - Rich black lentils"
      let dishName = namePart;
      let description = "";
      const dashSplit = namePart.split(/\s*[-—–]\s*/);
      if (dashSplit.length > 1 && dashSplit[1].length > 5) {
        dishName = dashSplit[0].trim();
        description = dashSplit.slice(1).join(" ").trim();
      }

      // Clean brackets like (Veg), [NV] from name
      dishName = dishName.replace(/\s*[\(\[](?:veg|non[- ]?veg|v|nv|jain|vegan)[\)\]]\s*/gi, " ").trim();

      if (dishName.length > 0) {
        pendingDish = {
          name: dishName,
          category: currentCategory,
          description,
          price: !isNaN(price) ? price : null,
          veg,
          isVegan,
          isJain,
        };
      }
    } else {
      // Line does not have price. It could be:
      // 1. Description for the pending dish
      if (pendingDish) {
        if (!pendingDish.description) {
          pendingDish.description = line;
        } else {
          pendingDish.description += " " + line;
        }
      }
    }
  }

  flushPending();

  if (detectedCategories.length === 0 && extractedItems.length > 0) {
    detectedCategories.push("General");
  }

  return {
    detectedCategories,
    extractedItems,
    warningCount,
  };
}
