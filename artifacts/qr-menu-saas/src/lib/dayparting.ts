/**
 * Tableline Dayparting Engine
 * Time-aware menu prioritization that reads the room based on the clock.
 * Reorders categories to prioritize relevant content without hiding other options.
 */

export interface DaypartSlot {
  id: string;
  name: string;
  icon: string;
  startHour: number; // 0 - 23
  startMinute?: number;
  endHour: number; // 0 - 23
  endMinute?: number;
  displayTime: string;
  keywords: string[];
}

export const DEFAULT_DAYPARTS: DaypartSlot[] = [
  {
    id: "breakfast",
    name: "Breakfast",
    icon: "☀️",
    startHour: 7,
    endHour: 11,
    displayTime: "7:00 AM – 11:00 AM",
    keywords: [
      "breakfast",
      "coffee",
      "pastry",
      "pastries",
      "bakery",
      "tea",
      "beverage",
      "beverages",
      "hot drinks",
      "cold brew",
      "espresso",
      "toast",
      "pancake",
      "waffle",
      "egg",
      "juice",
      "smoothie",
      "croissant",
    ],
  },
  {
    id: "lunch",
    name: "Lunch",
    icon: "🍽️",
    startHour: 11,
    endHour: 16,
    displayTime: "11:00 AM – 4:00 PM",
    keywords: [
      "lunch",
      "bowl",
      "bowls",
      "thali",
      "salad",
      "sandwich",
      "sandwiches",
      "burger",
      "burgers",
      "wrap",
      "wraps",
      "rice",
      "curry",
      "curries",
      "meal",
      "combo",
      "combos",
      "mains",
      "main course",
      "breads",
    ],
  },
  {
    id: "evening",
    name: "Afternoon & Bites",
    icon: "☕",
    startHour: 16,
    endHour: 19,
    displayTime: "4:00 PM – 7:00 PM",
    keywords: [
      "snacks",
      "coffee",
      "tea",
      "chai",
      "shakes",
      "coolers",
      "quick bites",
      "appetizers",
      "starters",
      "chaat",
      "fries",
      "beverages",
    ],
  },
  {
    id: "dinner",
    name: "Dinner",
    icon: "🌙",
    startHour: 19,
    endHour: 23,
    displayTime: "7:00 PM – 11:00 PM",
    keywords: [
      "dinner",
      "pizza",
      "pizzas",
      "pasta",
      "mains",
      "main course",
      "starters",
      "sizzlers",
      "grill",
      "tandoor",
      "drinks",
      "mocktail",
      "mocktails",
      "cocktails",
      "dessert",
      "desserts",
      "breads",
      "curries",
    ],
  },
  {
    id: "late_night",
    name: "Late Night",
    icon: "✨",
    startHour: 23,
    endHour: 7, // wraps overnight
    displayTime: "11:00 PM – 7:00 AM",
    keywords: [
      "dessert",
      "desserts",
      "shakes",
      "beverages",
      "pizza",
      "bites",
      "quick",
      "coffee",
    ],
  },
];

/**
 * Determine the current active daypart based on restaurant local time or user clock.
 */
export function getActiveDaypart(
  customDayparts?: DaypartSlot[],
  testHour?: number
): DaypartSlot {
  const dayparts = customDayparts && customDayparts.length > 0 ? customDayparts : DEFAULT_DAYPARTS;
  const now = new Date();
  const currentHour = testHour !== undefined ? testHour : now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeVal = currentHour + currentMinute / 60;

  for (const dp of dayparts) {
    if (dp.startHour < dp.endHour) {
      if (currentTimeVal >= dp.startHour && currentTimeVal < dp.endHour) {
        return dp;
      }
    } else {
      // Overnight wrap (e.g. 23:00 to 07:00)
      if (currentTimeVal >= dp.startHour || currentTimeVal < dp.endHour) {
        return dp;
      }
    }
  }

  return dayparts[0];
}

/**
 * Calculate keyword affinity score of a category to an active daypart.
 */
export function getCategoryDaypartScore(categoryName: string, activeDaypart: DaypartSlot): number {
  const norm = categoryName.toLowerCase();
  let score = 0;

  for (const kw of activeDaypart.keywords) {
    if (norm === kw) {
      score += 10;
    } else if (norm.includes(kw)) {
      score += 5;
    }
  }

  return score;
}

/**
 * Prioritize categories based on active daypart.
 * Daypart-relevant categories appear first, followed by remaining categories in their original order.
 */
export function prioritizeCategoriesByDaypart<T extends { id: string; name: string; sortOrder?: number }>(
  categories: T[],
  activeDaypart: DaypartSlot
): { prioritized: T[]; daypartCategoryIds: Set<string> } {
  const scored = categories.map((cat, originalIndex) => {
    const score = getCategoryDaypartScore(cat.name, activeDaypart);
    return {
      cat,
      score,
      originalIndex,
    };
  });

  const daypartCategoryIds = new Set<string>();
  scored.forEach((s) => {
    if (s.score > 0) {
      daypartCategoryIds.add(s.cat.id);
    }
  });

  // Sort with highest daypart score first, keeping original order when scores tie
  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.originalIndex - b.originalIndex;
  });

  return {
    prioritized: scored.map((s) => s.cat),
    daypartCategoryIds,
  };
}
