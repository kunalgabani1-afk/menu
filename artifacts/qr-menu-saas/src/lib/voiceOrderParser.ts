/**
 * Tableline Deterministic Voice Order Parser
 * Zero external API - client-side pattern matching against actual menu items.
 * Supports en-IN, hi-IN, gu-IN natural phrasing, quantities, modifiers, and closest-match Did You Mean fallbacks.
 */

export interface VoiceParsedItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  veg: boolean;
  isJain?: boolean;
  confidence: number;
  detectedModifier?: string;
  isAddition?: boolean;
}

export interface VoiceRemovedItem {
  menuItemId: string;
  name: string;
  quantity: number;
}

export interface VoiceCandidate {
  id: string;
  name: string;
  price: number;
  veg: boolean;
  score: number;
}

export interface VoiceParseResult {
  rawTranscript: string;
  items: VoiceParsedItem[];
  removedItems?: VoiceRemovedItem[];
  unmatchedPhrases: string[];
  possibleMatches: Array<{
    phrase: string;
    candidates: VoiceCandidate[];
  }>;
}

const NUMBER_WORDS: Record<string, number> = {
  // English
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  // Hindi transliteration & Devanagari
  ek: 1,
  do: 2,
  teen: 3,
  char: 4,
  paanch: 5,
  panch: 5,
  chhe: 6,
  che: 6,
  saat: 7,
  aath: 8,
  nau: 9,
  das: 10,
  "एक": 1,
  "दो": 2,
  "तीन": 3,
  "चार": 4,
  "पांच": 5,
  "छह": 6,
  "सात": 7,
  "आठ": 8,
  "नौ": 9,
  "दस": 10,
  // Gujarati transliteration & script
  be: 2,
  tran: 3,
  "બે": 2,
  "ત્રણ": 3,
  "ચાર": 4,
  "પાંચ": 5,
  "છ": 6,
  "સાત": 7,
  "આઠ": 8,
  "નવ": 9,
  "દસ": 10,
};

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singularize(word: string): string {
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("es") && !word.endsWith("cheese")) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("fries")) return word.slice(0, -1);
  return word;
}

/**
 * Standard Levenshtein edit distance calculation
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * String similarity ratio between 0.0 and 1.0 based on edit distance
 */
function stringSimilarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  if (longer.length === 0) return 1.0;
  const dist = levenshteinDistance(s1, s2);
  return (longer.length - dist) / longer.length;
}

export function parseVoiceOrder(
  transcript: string,
  menuItems: Array<{
    id: string;
    name: string;
    price: number;
    veg: boolean;
    isJain?: boolean;
    available?: boolean;
    translations?: Record<string, { name?: string }>;
    modifierGroups?: any[];
  }>
): VoiceParseResult {
  const normalized = normalizeString(transcript);
  const result: VoiceParseResult = {
    rawTranscript: transcript,
    items: [],
    removedItems: [],
    unmatchedPhrases: [],
    possibleMatches: [],
  };

  if (!normalized) return result;

  // Filter available items only
  const availableItems = menuItems.filter((i) => i.available !== false);

  // Split transcript on natural conjunctions
  // e.g. "two cold coffee and one samosa plus one coke" -> ["two cold coffee", "one samosa", "one coke"]
  const rawSegments = normalized
    .split(/\b(?:and|aur|ane|also|plus|\+|&|then|,)\b/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const segment of rawSegments) {
    // 1. Check for removal commands
    const isRemoval = /\b(?:remove|cancel|delete|hatao|nikalo|minus|no)\b/.test(segment);

    // 2. Remove conversational politeness and filler words
    let cleanSegment = segment
      .replace(
        /\b(?:can i get|can i have|could i get|could you bring|i would like|i d like|i want|please give me|give me|get me|bhaiya|bhai|lao|kar do|kar dena|chahiye|aap|actually|make that)\b/g,
        " "
      )
      .replace(/\b(?:remove|cancel|delete|hatao|nikalo)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanSegment) continue;

    // 3. Detect "Add More" / "Another" quantity markers
    let isAddition = false;
    if (/\b(?:add more|another one|another|one more|two more|more)\b/.test(cleanSegment)) {
      isAddition = true;
    }

    cleanSegment = cleanSegment
      .replace(/\b(?:add more|another one|another|one more|more|add|please add)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // 4. Quantity Parsing
    let quantity = 1;
    let textWithoutQty = cleanSegment;

    // Leading number like "2 cold coffee"
    const leadingDigitMatch = cleanSegment.match(/^(\d+)\s*(.*)$/);
    if (leadingDigitMatch) {
      quantity = Math.max(1, Math.min(20, parseInt(leadingDigitMatch[1], 10)));
      textWithoutQty = leadingDigitMatch[2].trim();
    } else {
      // Leading word like "two cold coffee" or "do cold coffee"
      const words = cleanSegment.split(" ");
      const firstWord = words[0];
      if (NUMBER_WORDS[firstWord]) {
        quantity = NUMBER_WORDS[firstWord];
        textWithoutQty = words.slice(1).join(" ").trim();
      }
    }

    // 5. Modifier detection (e.g. less ice, extra cheese, medium spicy)
    let detectedModifier: string | undefined;
    if (/\b(?:less ice|without ice|no ice|kam baraf)\b/.test(textWithoutQty)) {
      detectedModifier = "Less Ice";
      textWithoutQty = textWithoutQty.replace(/\b(?:less ice|without ice|no ice|kam baraf)\b/g, "").trim();
    } else if (/\b(?:extra cheese|with cheese|cheese)\b/.test(textWithoutQty)) {
      detectedModifier = "Extra Cheese";
      textWithoutQty = textWithoutQty.replace(/\b(?:extra cheese|with cheese|cheese)\b/g, "").trim();
    } else if (/\b(?:medium spicy|mild spicy|medium tikha)\b/.test(textWithoutQty)) {
      detectedModifier = "Medium Spicy";
      textWithoutQty = textWithoutQty.replace(/\b(?:medium spicy|mild spicy|medium tikha)\b/g, "").trim();
    } else if (/\b(?:spicy|extra spicy|hot|jyada tikha)\b/.test(textWithoutQty)) {
      detectedModifier = "Spicy";
      textWithoutQty = textWithoutQty.replace(/\b(?:spicy|extra spicy|hot|jyada tikha)\b/g, "").trim();
    } else if (/\b(?:jain|jain style|no onion no garlic)\b/.test(textWithoutQty)) {
      detectedModifier = "Jain Preparation";
      textWithoutQty = textWithoutQty.replace(/\b(?:jain|jain style|no onion no garlic)\b/g, "").trim();
    }

    if (!textWithoutQty) {
      result.unmatchedPhrases.push(cleanSegment);
      continue;
    }

    const queryNorm = normalizeString(textWithoutQty);
    const singularQuery = queryNorm.split(" ").map(singularize).join(" ");

    // 6. Match against available menu items with multi-tier scoring
    let bestMatch: (typeof availableItems)[0] | null = null;
    let highestScore = 0;
    const candidates: VoiceCandidate[] = [];

    for (const item of availableItems) {
      const itemNorm = normalizeString(item.name);
      const itemSingular = itemNorm.split(" ").map(singularize).join(" ");

      // A. Exact Match (Score 1.0)
      if (itemNorm === queryNorm || itemSingular === singularQuery) {
        bestMatch = item;
        highestScore = 1.0;
        break;
      }

      // Check translations
      if (item.translations) {
        let matchedTr = false;
        for (const tr of Object.values(item.translations)) {
          if (tr.name && normalizeString(tr.name) === queryNorm) {
            bestMatch = item;
            highestScore = 1.0;
            matchedTr = true;
            break;
          }
        }
        if (matchedTr) break;
      }

      // B. Substring match (Score 0.88)
      if (itemSingular.includes(singularQuery) || singularQuery.includes(itemSingular)) {
        const score = 0.88;
        if (score > highestScore) {
          highestScore = score;
          bestMatch = item;
        }
        candidates.push({
          id: item.id,
          name: item.name,
          price: item.price,
          veg: item.veg,
          score,
        });
        continue;
      }

      // C. Token Overlap & Fuzzy Similarity (e.g. "fun fries" vs "french fries")
      const itemTokens = new Set(itemSingular.split(" "));
      const queryTokens = singularQuery.split(" ");
      let commonTokens = 0;
      for (const qt of queryTokens) {
        if (itemTokens.has(qt)) commonTokens++;
      }

      const tokenScore = commonTokens > 0
        ? (commonTokens / Math.max(itemTokens.size, queryTokens.length)) * 0.82
        : 0;

      // Character-level Levenshtein similarity for mispronunciations/typos
      const fuzzyScore = stringSimilarity(singularQuery, itemSingular) * 0.85;

      const combinedScore = Math.max(tokenScore, fuzzyScore);

      if (combinedScore >= 0.52) {
        candidates.push({
          id: item.id,
          name: item.name,
          price: item.price,
          veg: item.veg,
          score: combinedScore,
        });

        if (combinedScore > highestScore) {
          highestScore = combinedScore;
          bestMatch = item;
        }
      }
    }

    // Sort candidates by highest match score
    candidates.sort((a, b) => b.score - a.score);

    // If removal command
    if (isRemoval && bestMatch && highestScore >= 0.6) {
      result.removedItems?.push({
        menuItemId: bestMatch.id,
        name: bestMatch.name,
        quantity,
      });
      continue;
    }

    // HIGH Confidence (>= 0.78): Directly recognize & add
    if (bestMatch && highestScore >= 0.78) {
      const existing = result.items.find(
        (i) => i.menuItemId === bestMatch!.id && i.detectedModifier === detectedModifier
      );
      if (existing) {
        existing.quantity += quantity;
      } else {
        result.items.push({
          menuItemId: bestMatch.id,
          name: bestMatch.name,
          price: bestMatch.price,
          quantity,
          veg: bestMatch.veg,
          isJain: bestMatch.isJain,
          confidence: highestScore,
          detectedModifier,
          isAddition,
        });
      }
    }
    // MEDIUM Confidence (0.52 - 0.77): Surface as "Did You Mean?" candidates
    else if (candidates.length > 0) {
      result.possibleMatches.push({
        phrase: cleanSegment,
        candidates: candidates.slice(0, 3),
      });
    }
    // LOW Confidence: Unmatched
    else {
      result.unmatchedPhrases.push(cleanSegment);
    }
  }

  return result;
}
