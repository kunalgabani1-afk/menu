import { GoogleGenAI } from "@google/genai";
import { extractTextFromPdfBuffer, parseMenuTextLines } from "./pdfMenuExtractor";

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    try {
      aiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    } catch {
      aiClient = null;
    }
  }
  return aiClient;
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-3.6-flash";
}

export interface MenuItemContext {
  id: string;
  name: string;
  description: string;
  price: number;
  veg?: boolean;
  isVegan?: boolean;
  isJain?: boolean;
  spicyLevel?: string;
  ingredients?: string;
  allergens?: string[];
  exclusions?: string[];
  nutrition?: {
    calories?: number;
    protein?: number;
    carbohydrates?: number;
    fats?: number;
  };
  popular?: boolean;
  isCombo?: boolean;
  categoryName?: string;
  addons?: Array<{ id: string; name: string; price: number }>;
}

export interface AiAssistantResult {
  reply: string;
  suggestedItemIds: string[];
  staffRequestIntent?: string | null;
  dietaryNote?: string | null;
}

export async function askAiMenuAssistant(params: {
  restaurantName: string;
  currency: string;
  items: MenuItemContext[];
  userPrompt: string;
}): Promise<AiAssistantResult> {
  const { restaurantName, currency, items, userPrompt } = params;

  // Detect immediate staff/waiter request intents
  const lowerPrompt = userPrompt.toLowerCase().trim();
  let staffRequestIntent: string | null = null;
  if (lowerPrompt.includes("water") || lowerPrompt.includes("glass of water")) {
    staffRequestIntent = "NEED_WATER";
  } else if (lowerPrompt.includes("bill") || lowerPrompt.includes("check please") || lowerPrompt.includes("get the check")) {
    staffRequestIntent = "REQUEST_BILL";
  } else if (lowerPrompt.includes("tissue") || lowerPrompt.includes("napkin")) {
    staffRequestIntent = "NEED_TISSUES";
  } else if (lowerPrompt.includes("plate") || lowerPrompt.includes("extra plate")) {
    staffRequestIntent = "EXTRA_PLATE";
  } else if (lowerPrompt.includes("cutlery") || lowerPrompt.includes("spoon") || lowerPrompt.includes("fork")) {
    staffRequestIntent = "NEED_CUTLERY";
  } else if (lowerPrompt.includes("clear") || lowerPrompt.includes("clean table") || lowerPrompt.includes("dirty table")) {
    staffRequestIntent = "CLEAR_TABLE";
  } else if (lowerPrompt.includes("call waiter") || lowerPrompt.includes("call server") || lowerPrompt.includes("need help") || lowerPrompt.includes("waiter please")) {
    staffRequestIntent = "CALL_WAITER";
  }

  // Filter relevant items for prompt context with structured attributes
  const menuCatalog = items.map((i) => ({
    id: i.id,
    name: i.name,
    price: `${currency} ${i.price}`,
    veg: i.veg ? "Vegetarian" : "Non-Vegetarian",
    vegan: i.isVegan ? "Vegan" : "Not certified vegan",
    jain: i.isJain ? "Jain Friendly (No onion, no garlic, no root veg)" : "Not Jain",
    spicyLevel: i.spicyLevel || "Normal",
    ingredients: i.ingredients || i.description || "Fresh chef preparation",
    allergens: Array.isArray(i.allergens) && i.allergens.length > 0 ? i.allergens.join(", ") : "None declared",
    popular: i.popular ? "House Favorite" : "Standard",
    category: i.categoryName ?? "Dishes",
    description: i.description || "",
    addons: (i.addons || []).map((a) => `${a.name} (+${currency} ${a.price})`).join(", "),
  }));

  const ai = getAiClient();
  if (ai) {
    try {
      const systemInstruction = `You are the polite, appetizing, and highly knowledgeable culinary concierge for "${restaurantName}".
CRITICAL INTEGRITY & ACCURACY RULES:
1. ONLY recommend dishes that exist in the provided official menu catalog below.
2. NEVER hallucinate or invent dishes, prices, ingredients, allergens, or health claims.
3. If the customer asks for a dish or ingredient NOT on this menu, state politely that it's not currently offered, and suggest the nearest verified dishes from the catalog.
4. Dietary safety: If asked for Vegan, Jain, Gluten-free, or specific allergens, check the item's verified tags. If uncertain, advise the customer to confirm with their server.
5. If the customer is asking for assistance like water, bill, cutlery, tissues, or a server, acknowledge their request warmly and assure them the team is notified.
6. Always quote exact prices in ${currency}.
7. End your response with a JSON block containing the IDs of recommended items:
RECOMMENDED_IDS: ["<id1>", "<id2>"]
Keep your response warm, concise (2-4 sentences max), and helpful.`;

      const contents = `Customer: "${userPrompt}"

OFFICIAL MENU CATALOG:
${JSON.stringify(menuCatalog, null, 2)}`;

      const response = await ai.models.generateContent({
        model: getGeminiModel(),
        contents,
        config: {
          systemInstruction,
          temperature: 0.3,
        },
      });

      const text = response.text || "";
      const match = text.match(/RECOMMENDED_IDS:\s*(\[[^\]]*\])/);
      let suggestedItemIds: string[] = [];
      let cleanReply = text;

      if (match) {
        try {
          suggestedItemIds = JSON.parse(match[1]);
          cleanReply = text.replace(/RECOMMENDED_IDS:\s*(\[[^\]]*\])/, "").trim();
        } catch {
          // ignore json parse error
        }
      }

      const validIds = new Set(items.map((i) => i.id));
      suggestedItemIds = suggestedItemIds.filter((id) => validIds.has(id));

      if (suggestedItemIds.length === 0) {
        for (const item of items) {
          if (cleanReply.toLowerCase().includes(item.name.toLowerCase())) {
            suggestedItemIds.push(item.id);
          }
        }
      }

      return {
        reply: cleanReply,
        suggestedItemIds: suggestedItemIds.slice(0, 4),
        staffRequestIntent,
      };
    } catch (err) {
      console.warn("Gemini API call failed, using intelligent fallback matcher:", err);
    }
  }

  // Fallback matcher when Gemini API is offline or key is unconfigured
  let matches = items.filter((i) => {
    const n = i.name.toLowerCase();
    const d = (i.description || "").toLowerCase();
    const c = (i.categoryName || "").toLowerCase();
    const ing = (i.ingredients || "").toLowerCase();
    return n.includes(lowerPrompt) || d.includes(lowerPrompt) || c.includes(lowerPrompt) || ing.includes(lowerPrompt);
  });

  // Dietary filters
  if (lowerPrompt.includes("jain")) {
    const jainMatches = items.filter((i) => i.isJain);
    if (jainMatches.length > 0) matches = jainMatches;
  } else if (lowerPrompt.includes("vegan")) {
    const veganMatches = items.filter((i) => i.isVegan);
    if (veganMatches.length > 0) matches = veganMatches;
  } else if (lowerPrompt.includes("veg") && !lowerPrompt.includes("non-veg")) {
    const vegMatches = items.filter((i) => i.veg);
    if (vegMatches.length > 0) matches = vegMatches;
  }

  // Price constraint detection
  const priceMatch = lowerPrompt.match(/(?:under|below|less than|within)\s*(?:₹|\$)?\s*(\d+(?:\.\d+)?)/i);
  if (priceMatch) {
    const maxPrice = parseFloat(priceMatch[1]);
    const priceMatches = items.filter((i) => i.price <= maxPrice);
    if (priceMatches.length > 0) matches = priceMatches;
  }

  if (matches.length === 0) {
    matches = items.filter((i) => i.popular).slice(0, 3);
  }

  const selected = matches.slice(0, 3);
  const itemsText = selected.map((i) => `• ${i.name} (${currency} ${i.price.toFixed(2)})`).join("\n");

  let replyText = `Here are our chef's recommendations matching your taste at ${restaurantName}:\n${itemsText}\nWould you like to add any of these to your order?`;
  if (staffRequestIntent) {
    replyText = `I've noted your service request. In addition, here are our highlighted dishes:\n${itemsText}`;
  }

  return {
    reply: replyText,
    suggestedItemIds: selected.map((i) => i.id),
    staffRequestIntent,
  };
}

export interface VoiceOrderResult {
  matchedItems: Array<{
    menuItemId: string;
    name: string;
    price: number;
    quantity: number;
    specialInstructions?: string;
    selectedAddonIds?: string[];
  }>;
  unmatchedNotes: string[];
  staffRequestIntent?: string | null;
  summary: string;
}

export async function parseVoiceOrder(params: {
  transcript: string;
  items: MenuItemContext[];
  currency: string;
}): Promise<VoiceOrderResult> {
  const { transcript, items, currency } = params;
  const cleanTranscript = (transcript || "").trim();

  // Detect staff request intent if spoken
  const lower = cleanTranscript.toLowerCase();
  let staffRequestIntent: string | null = null;
  if (lower.includes("water") || lower.includes("glass of water")) staffRequestIntent = "NEED_WATER";
  else if (lower.includes("bill") || lower.includes("check please")) staffRequestIntent = "REQUEST_BILL";
  else if (lower.includes("tissue") || lower.includes("napkin")) staffRequestIntent = "NEED_TISSUES";
  else if (lower.includes("extra plate")) staffRequestIntent = "EXTRA_PLATE";
  else if (lower.includes("cutlery") || lower.includes("fork") || lower.includes("spoon")) staffRequestIntent = "NEED_CUTLERY";
  else if (lower.includes("call waiter") || lower.includes("waiter")) staffRequestIntent = "CALL_WAITER";

  const ai = getAiClient();
  if (ai) {
    try {
      const catalog = items.map((i) => ({
        id: i.id,
        name: i.name,
        price: i.price,
        addons: i.addons || [],
      }));

      const systemInstruction = `You are a precision Voice Ordering parser for restaurant table ordering.
Convert spoken English/Hindi-English transcripts into matched order items.
STRICT MATCHING RULES:
1. ONLY match items that exist in the menu catalog.
2. If an item is NOT in the catalog, DO NOT invent an ID. Put it in "unmatchedNotes".
3. Extract quantities (e.g. "two lattes" -> quantity 2; default 1).
4. Extract special instructions (e.g. "less sugar", "extra hot", "no ice").
5. Return JSON ONLY with the exact schema:
{
  "matchedItems": [
    {
      "menuItemId": "<id>",
      "name": "<name>",
      "price": <number>,
      "quantity": <number>,
      "specialInstructions": "<notes>"
    }
  ],
  "unmatchedNotes": ["<string>"],
  "summary": "<Friendly 1-line confirmation>"
}`;

      const response = await ai.models.generateContent({
        model: getGeminiModel(),
        contents: `Spoken Order Transcript: "${cleanTranscript}"

AVAILABLE MENU ITEMS:
${JSON.stringify(catalog, null, 2)}`,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const parsed = JSON.parse(response.text || "{}");
      const validMap = new Map(items.map((i) => [i.id, i]));
      const sanitizedMatches: VoiceOrderResult["matchedItems"] = [];

      if (Array.isArray(parsed.matchedItems)) {
        for (const m of parsed.matchedItems) {
          const item = validMap.get(String(m.menuItemId));
          if (item) {
            sanitizedMatches.push({
              menuItemId: item.id,
              name: item.name,
              price: item.price,
              quantity: Math.max(1, Math.min(10, Math.floor(Number(m.quantity) || 1))),
              specialInstructions: typeof m.specialInstructions === "string" ? m.specialInstructions.trim() : undefined,
            });
          }
        }
      }

      const unmatched: string[] = Array.isArray(parsed.unmatchedNotes)
        ? parsed.unmatchedNotes.map((u: unknown) => String(u))
        : [];

      let summary = typeof parsed.summary === "string" && parsed.summary.length > 0
        ? parsed.summary
        : sanitizedMatches.length > 0
        ? `Matched ${sanitizedMatches.reduce((acc, i) => acc + i.quantity, 0)} item(s) from your voice order.`
        : "No matching menu items found in your voice recording.";

      return {
        matchedItems: sanitizedMatches,
        unmatchedNotes: unmatched,
        staffRequestIntent,
        summary,
      };
    } catch (err) {
      console.warn("Gemini voice parser failed, falling back to heuristic word matching:", err);
    }
  }

  // Heuristic voice order matching
  const matchedItems: VoiceOrderResult["matchedItems"] = [];
  const words = lower.split(/\s+/);

  for (const item of items) {
    const itemNameLower = item.name.toLowerCase();
    if (lower.includes(itemNameLower)) {
      // Find quantity before the item name if any
      let qty = 1;
      const idx = lower.indexOf(itemNameLower);
      const beforeStr = lower.substring(Math.max(0, idx - 15), idx).trim();
      if (beforeStr.includes("two") || beforeStr.includes("2")) qty = 2;
      else if (beforeStr.includes("three") || beforeStr.includes("3")) qty = 3;
      else if (beforeStr.includes("four") || beforeStr.includes("4")) qty = 4;
      else if (beforeStr.includes("five") || beforeStr.includes("5")) qty = 5;

      matchedItems.push({
        menuItemId: item.id,
        name: item.name,
        price: item.price,
        quantity: qty,
      });
    }
  }

  return {
    matchedItems,
    unmatchedNotes: matchedItems.length === 0 && cleanTranscript.length > 0 ? [cleanTranscript] : [],
    staffRequestIntent,
    summary:
      matchedItems.length > 0
        ? `We found ${matchedItems.length} item(s) matching your voice request.`
        : `Could not identify menu dishes. Please try speaking dish names clearly or browse the menu directly.`,
  };
}

export async function formatKitchenInstructions(customerNote: string): Promise<{
  kitchenInstruction: string;
  tags: string[];
}> {
  const note = (customerNote || "").trim();
  if (!note) {
    return { kitchenInstruction: "", tags: [] };
  }

  const ai = getAiClient();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: getGeminiModel(),
        contents: `Format the following diner note into standard, concise uppercase kitchen tags:
Customer note: "${note}"

Rules:
- Output only a JSON object in format: {"kitchenInstruction": "NO ONION / LESS SPICY", "tags": ["NO ONION", "LESS SPICY"]}
- DO NOT invent extra instructions. Keep it faithful to the customer's exact words.
- Max 5 tags.`,
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const parsed = JSON.parse(response.text || "{}");
      if (parsed.kitchenInstruction && Array.isArray(parsed.tags)) {
        return {
          kitchenInstruction: String(parsed.kitchenInstruction).toUpperCase(),
          tags: parsed.tags.map((t: string) => String(t).toUpperCase()),
        };
      }
    } catch {
      // Fall through to heuristic formatter
    }
  }

  // Heuristic formatter
  const clean = note.toUpperCase().replace(/[.,!?;]+/g, " / ");
  const parts = clean
    .split(/\s*(?:\/|and|&)\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  return {
    kitchenInstruction: parts.join(" / "),
    tags: parts,
  };
}

export interface ExtractedMenuItemRaw {
  name: string;
  category: string;
  description?: string;
  price?: number | null;
  veg?: boolean | null;
  isVegan?: boolean;
  isJain?: boolean;
  spicyLevel?: "NONE" | "MILD" | "MEDIUM" | "HOT" | "EXTRA_HOT";
  ingredients?: string;
  allergens?: string[];
  nutrition?: {
    calories?: number;
    protein?: number;
    carbohydrates?: number;
    fats?: number;
  };
  requiresReview?: boolean;
  reviewReason?: string;
}

export interface MenuExtractionResult {
  detectedCategories: string[];
  extractedItems: ExtractedMenuItemRaw[];
  warningCount: number;
}

export async function extractMenuFromDocuments(params: {
  files: Array<{ data: string; mimeType: string; filename?: string }>;
  currency?: string;
  existingCategories?: string[];
}): Promise<MenuExtractionResult> {
  const { files, currency = "₹", existingCategories = [] } = params;

  if (!files || files.length === 0) {
    throw new Error("No files were provided for menu extraction.");
  }

  // 1. Try native PDF text extraction first if PDF is provided
  for (const file of files) {
    const isPdf =
      file.mimeType === "application/pdf" ||
      file.filename?.toLowerCase().endsWith(".pdf") ||
      file.data.startsWith("JVBERi0"); // %PDF-
    if (isPdf) {
      try {
        const rawBase64 = file.data.includes(",") ? file.data.split(",")[1] : file.data;
        const pdfBuf = Buffer.from(rawBase64, "base64");
        const extractedText = await extractTextFromPdfBuffer(pdfBuf);
        if (extractedText && extractedText.length > 20) {
          const parsedResult = parseMenuTextLines(extractedText, existingCategories);
          if (parsedResult.extractedItems.length > 0) {
            return parsedResult;
          }
        }
      } catch (pdfErr) {
        console.warn("PDF native text parsing fallback to OCR:", pdfErr);
      }
    }
  }

  // 2. Fall back to AI OCR if available
  const ai = getAiClient();
  if (!ai) {
    throw new Error(
      "IMAGE_EXTRACTION_UNAVAILABLE: Image extraction is not configured yet. You can upload CSV/XLSX or a text-based PDF."
    );
  }

  const systemInstruction = `You are an expert restaurant menu digitizer and culinary data parser.
Your task is to analyze the provided restaurant menu document (PDF or photos) and extract every single menu item into a structured JSON catalog.

CRITICAL ACCURACY & GROUNDING RULES:
1. ONLY extract dishes, drinks, descriptions, and prices that are ACTUALLY visible on the menu.
2. STRICTLY DO NOT invent, assume, or hallucinate missing information.
3. If an item does NOT have a clear price printed or is smudged/unclear, set "price": null, set "requiresReview": true, and set "reviewReason": "Missing or unreadable price".
4. If dietary attributes are NOT explicitly printed (e.g. green circle veg symbol, leaf icon, "Vegan" label, "Jain" label, or explicit meat mention):
   - "veg": set true ONLY if marked with a green veg symbol or explicitly labeled Veg/Vegetarian. Set false if meat/chicken/fish/pork/beef/non-veg is indicated. Leave null if not explicitly identifiable.
   - "isVegan": set true ONLY if explicitly marked Vegan or 100% Plant-Based.
   - "isJain": set true ONLY if explicitly marked Jain or No Onion / No Garlic.
5. If spicy level is indicated (e.g. chili icons or words like mild/medium/spicy/hot), map to: "NONE", "MILD", "MEDIUM", "HOT", or "EXTRA_HOT". Default to "NONE".
6. If ingredients or allergens are printed on the menu, extract them accurately. Do NOT guess allergens if not declared.
7. Group items into sensible categories as printed on the menu (e.g., "Starters", "Soups", "Woodfired Pizzas", "Main Course", "Beverages", "Desserts").
   ${existingCategories.length > 0 ? `The restaurant currently has these existing sections: ${existingCategories.join(", ")}. Use these names when they clearly match.` : ""}
8. If text is blurry, unclear, or a potential OCR typo is suspected, flag the item with "requiresReview": true and describe the issue in "reviewReason".

Return ONLY valid JSON matching this schema:
{
  "detectedCategories": ["string"],
  "extractedItems": [
    {
      "name": "string (dish title)",
      "category": "string (menu section)",
      "description": "string (dish description or empty string)",
      "price": number or null,
      "veg": boolean or null,
      "isVegan": boolean,
      "isJain": boolean,
      "spicyLevel": "NONE" | "MILD" | "MEDIUM" | "HOT" | "EXTRA_HOT",
      "ingredients": "string (or empty)",
      "allergens": ["string"],
      "nutrition": {
        "calories": number or null,
        "protein": number or null,
        "carbohydrates": number or null,
        "fats": number or null
      },
      "requiresReview": boolean,
      "reviewReason": "string"
    }
  ]
}`;

  const contents: any[] = [];
  for (const file of files) {
    const rawData = file.data.includes(",") ? file.data.split(",")[1] : file.data;
    let mime = file.mimeType || "image/jpeg";
    if (file.filename?.toLowerCase().endsWith(".pdf")) {
      mime = "application/pdf";
    }
    contents.push({
      inlineData: {
        data: rawData,
        mimeType: mime,
      },
    });
  }

  contents.push({
    text: `Please digitize this restaurant menu. Currency context: ${currency}. Extract all items, prices, dietary markings, and categories accurately.`,
  });

  let parsed: any = {};
  try {
    const response = await ai.models.generateContent({
      model: getGeminiModel(),
      contents,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const rawText = (response.text || "").trim();
    if (rawText) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      }
    }
  } catch (apiErr: any) {
    console.error("Gemini menu extraction failed:", apiErr);
    const msg = apiErr?.message || "Unknown error";
    if (msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("AI service quota reached for today. You can still import menus directly via CSV / Excel spreadsheet.");
    }
    throw new Error(`AI Menu Extraction error: ${msg}`);
  }
  const detectedCategories: string[] = Array.isArray(parsed.detectedCategories)
    ? parsed.detectedCategories.map((c: unknown) => String(c).trim()).filter(Boolean)
    : [];

  const rawItems: any[] = Array.isArray(parsed.extractedItems) ? parsed.extractedItems : [];
  const extractedItems: ExtractedMenuItemRaw[] = [];
  let warningCount = 0;

  for (const item of rawItems) {
    const name = String(item.name || "").trim();
    if (!name) continue;

    const category = String(item.category || "General").trim();
    let price: number | null = null;
    if (typeof item.price === "number" && !isNaN(item.price) && item.price >= 0) {
      price = item.price;
    } else if (typeof item.price === "string") {
      const cleaned = item.price.replace(/[^0-9.]/g, "");
      const num = parseFloat(cleaned);
      if (!isNaN(num) && num >= 0) {
        price = num;
      }
    }

    let requiresReview = Boolean(item.requiresReview);
    const reviewReasons: string[] = [];
    if (item.reviewReason && typeof item.reviewReason === "string" && item.reviewReason.trim()) {
      reviewReasons.push(item.reviewReason.trim());
    }

    if (price === null || price === 0) {
      requiresReview = true;
      reviewReasons.push("Price missing or unreadable");
    }

    if (!category || category.toLowerCase() === "general") {
      requiresReview = true;
      reviewReasons.push("Category needs confirmation");
    }

    if (requiresReview) {
      warningCount++;
    }

    if (!detectedCategories.includes(category) && category) {
      detectedCategories.push(category);
    }

    let spicyLevel: ExtractedMenuItemRaw["spicyLevel"] = "NONE";
    if (["MILD", "MEDIUM", "HOT", "EXTRA_HOT"].includes(String(item.spicyLevel).toUpperCase())) {
      spicyLevel = String(item.spicyLevel).toUpperCase() as any;
    }

    extractedItems.push({
      name,
      category,
      description: typeof item.description === "string" ? item.description.trim() : "",
      price,
      veg: typeof item.veg === "boolean" ? item.veg : null,
      isVegan: Boolean(item.isVegan),
      isJain: Boolean(item.isJain),
      spicyLevel,
      ingredients: typeof item.ingredients === "string" ? item.ingredients.trim() : undefined,
      allergens: Array.isArray(item.allergens)
        ? item.allergens.map((a: unknown) => String(a).trim()).filter(Boolean)
        : [],
      nutrition:
        item.nutrition && typeof item.nutrition === "object"
          ? {
              calories: typeof item.nutrition.calories === "number" ? item.nutrition.calories : undefined,
              protein: typeof item.nutrition.protein === "number" ? item.nutrition.protein : undefined,
              carbohydrates: typeof item.nutrition.carbohydrates === "number" ? item.nutrition.carbohydrates : undefined,
              fats: typeof item.nutrition.fats === "number" ? item.nutrition.fats : undefined,
            }
          : undefined,
      requiresReview,
      reviewReason: reviewReasons.join("; ") || undefined,
    });
  }

  return {
    detectedCategories,
    extractedItems,
    warningCount,
  };
}

export interface AiMenuCleanupSuggestion {
  id: string;
  itemId?: string;
  type:
    | "TYPO_OR_SPELLING"
    | "DUPLICATE_ITEM"
    | "CATEGORY_INCONSISTENCY"
    | "MISSING_DESCRIPTION"
    | "SUSPICIOUS_PRICE"
    | "INCOMPLETE_DATA";
  targetName: string;
  currentValue: string;
  suggestedValue: string;
  reason: string;
  confidence: "HIGH" | "MEDIUM";
}

export interface AiMenuCleanupResult {
  totalSuggestions: number;
  suggestions: AiMenuCleanupSuggestion[];
}

export async function cleanUpMenuWithAi(params: {
  restaurantName: string;
  currency: string;
  items: Array<{
    id: string;
    name: string;
    description: string;
    price: number;
    categoryName: string;
    veg?: boolean;
    ingredients?: string;
  }>;
  categories: Array<{ id: string; name: string }>;
}): Promise<AiMenuCleanupResult> {
  const { restaurantName, currency, items, categories } = params;
  const ai = getAiClient();

  if (!ai || items.length === 0) {
    // Return heuristic suggestions if AI client is not available
    const suggestions: AiMenuCleanupSuggestion[] = [];
    const nameMap = new Map<string, string>();

    for (const item of items) {
      const norm = item.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (nameMap.has(norm)) {
        suggestions.push({
          id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          itemId: item.id,
          type: "DUPLICATE_ITEM",
          targetName: item.name,
          currentValue: item.name,
          suggestedValue: `Merge with ${nameMap.get(norm)}`,
          reason: `Possible duplicate dish detected with matching name variation.`,
          confidence: "HIGH",
        });
      } else {
        nameMap.set(norm, item.name);
      }

      if (!item.description || item.description.trim().length < 5) {
        suggestions.push({
          id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          itemId: item.id,
          type: "MISSING_DESCRIPTION",
          targetName: item.name,
          currentValue: "No description",
          suggestedValue: `Add an appetizing description outlining culinary highlights.`,
          reason: "Items with descriptions have 35% higher ordering conversion.",
          confidence: "HIGH",
        });
      }

      if (item.price <= 0) {
        suggestions.push({
          id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          itemId: item.id,
          type: "SUSPICIOUS_PRICE",
          targetName: item.name,
          currentValue: `${currency} ${item.price}`,
          suggestedValue: "Set appropriate price",
          reason: "Dish price is ₹0 or unpriced.",
          confidence: "HIGH",
        });
      }
    }

    return { totalSuggestions: suggestions.length, suggestions };
  }

  try {
    const systemInstruction = `You are an expert restaurant menu editor and catalog quality auditor for "${restaurantName}".
Analyze this restaurant catalog and find quality issues:
1. TYPO_OR_SPELLING: Inconsistent or misspelled culinary dish names (e.g. "Capuccino", "Panner Tikka", "Chilli Paneer" vs "Chilli Panner").
2. DUPLICATE_ITEM: Duplicate or near-identical items (e.g. "Margherita Pizza" vs "Pizza Margherita", "Virgin Mojito" vs "Mojito Virgin").
3. CATEGORY_INCONSISTENCY: Inconsistent category naming or misclassified items (e.g. cold drink in "Hot Soups", "Bevrages" instead of "Beverages").
4. MISSING_DESCRIPTION: Items with blank or empty descriptions.
5. SUSPICIOUS_PRICE: Outlier or zero/unrealistic prices for dishes.
6. INCOMPLETE_DATA: Incomplete names or formatting issues (e.g. ALL CAPS like "CRISPY CORN").

CRITICAL MANDATES:
- NEVER hallucinate ingredients, allergens, or fake facts.
- For each suggestion, provide a clear, constructive suggestedValue and reason.
- Return ONLY valid JSON in the format:
{
  "suggestions": [
    {
      "itemId": "string ID of item",
      "type": "TYPO_OR_SPELLING" | "DUPLICATE_ITEM" | "CATEGORY_INCONSISTENCY" | "MISSING_DESCRIPTION" | "SUSPICIOUS_PRICE" | "INCOMPLETE_DATA",
      "targetName": "string",
      "currentValue": "string",
      "suggestedValue": "string",
      "reason": "string",
      "confidence": "HIGH" | "MEDIUM"
    }
  ]
}`;

    const prompt = JSON.stringify({
      categories: categories.map((c) => c.name),
      items: items.slice(0, 150).map((i) => ({
        id: i.id,
        name: i.name,
        category: i.categoryName,
        price: `${currency} ${i.price}`,
        description: i.description || "",
      })),
    });

    const response = await ai.models.generateContent({
      model: getGeminiModel(),
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    const rawSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    const suggestions: AiMenuCleanupSuggestion[] = rawSuggestions.map((s: any, idx: number) => ({
      id: `sug_${Date.now()}_${idx}`,
      itemId: s.itemId ? String(s.itemId) : undefined,
      type: [
        "TYPO_OR_SPELLING",
        "DUPLICATE_ITEM",
        "CATEGORY_INCONSISTENCY",
        "MISSING_DESCRIPTION",
        "SUSPICIOUS_PRICE",
        "INCOMPLETE_DATA",
      ].includes(s.type)
        ? s.type
        : "INCOMPLETE_DATA",
      targetName: String(s.targetName || "Menu Item"),
      currentValue: String(s.currentValue || ""),
      suggestedValue: String(s.suggestedValue || ""),
      reason: String(s.reason || "Improvement suggested for catalog consistency."),
      confidence: s.confidence === "HIGH" ? "HIGH" : "MEDIUM",
    }));

    return {
      totalSuggestions: suggestions.length,
      suggestions,
    };
  } catch (err) {
    console.error("cleanUpMenuWithAi error:", err);
    return { totalSuggestions: 0, suggestions: [] };
  }
}

export async function generateDishDescription(params: {
  dishName: string;
  categoryName?: string;
  ingredients?: string;
  veg?: boolean;
  spicyLevel?: string;
}): Promise<string> {
  const { dishName, categoryName, ingredients, veg, spicyLevel } = params;
  const ai = getAiClient();

  if (!ai) {
    const vegText = veg ? "Fresh vegetarian preparation" : "Chef's signature preparation";
    const ingText = ingredients ? ` crafted with ${ingredients}` : "";
    return `${vegText}${ingText}, freshly made to order.`;
  }

  try {
    const prompt = `Write a concise, appetizing 1-2 sentence menu description for:
Dish Name: ${dishName}
Category: ${categoryName || "Specialties"}
Explicit Ingredients Provided: ${ingredients || "Not specified"}
Dietary Type: ${veg ? "Vegetarian" : "Non-Vegetarian"}
Spicy Level: ${spicyLevel || "Standard"}

CRITICAL RULES:
1. ONLY reference ingredients or attributes that are EXPLICITLY provided above or natural to the dish name itself.
2. DO NOT invent unprovided ingredients, allergens, nutrition, calories, protein, carbs, Jain status, vegan status, or spice levels.
3. Keep it appetizing, professional, and within 20-35 words.
4. Output ONLY the description string. No quotes, no markdown.`;

    const response = await ai.models.generateContent({
      model: getGeminiModel(),
      contents: prompt,
      config: {
        temperature: 0.3,
      },
    });

    const text = (response.text || "").trim().replace(/^["']|["']$/g, "");
    return text || "Freshly prepared chef specialty made to order.";
  } catch {
    return "Freshly prepared chef specialty made to order.";
  }
}

