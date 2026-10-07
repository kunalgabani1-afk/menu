import Fuse from "fuse.js";

export interface SearchableMenuItem {
  id: string;
  categoryId: string;
  categoryName?: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string | null;
  veg: boolean;
  isJain?: boolean;
  available: boolean;
  badge?: string | null;
  isBestseller?: boolean;
  isChefsPick?: boolean;
  rating?: number | null;
  reviewCount?: number;
  ingredients?: string[];
  tags?: string[];
  translations?: Record<string, { name?: string; description?: string }>;
}

export interface SearchResult {
  matches: SearchableMenuItem[];
  related: SearchableMenuItem[];
  queryNormalized: string;
}

/**
 * Creates and configures a memoized Fuse instance for 500+ restaurant items.
 */
export function createMenuSearchIndex(
  items: SearchableMenuItem[],
  categoriesMap: Record<string, string>,
  lang: string = "en"
): Fuse<SearchableMenuItem> {
  const preparedData = items.map((item) => {
    const localName =
      lang !== "en" && item.translations?.[lang]?.name
        ? item.translations[lang]!.name!
        : item.name;
    const localDesc =
      lang !== "en" && item.translations?.[lang]?.description
        ? item.translations[lang]!.description!
        : item.description || "";
    const catName = categoriesMap[item.categoryId] || "";

    return {
      ...item,
      searchableName: localName,
      searchableDescription: localDesc,
      categoryName: catName,
      searchableTags: Array.isArray(item.tags) ? item.tags.join(" ") : "",
      searchableIngredients: Array.isArray(item.ingredients)
        ? item.ingredients.join(" ")
        : "",
    };
  });

  return new Fuse(preparedData, {
    keys: [
      { name: "searchableName", weight: 0.45 },
      { name: "categoryName", weight: 0.25 },
      { name: "searchableDescription", weight: 0.15 },
      { name: "searchableTags", weight: 0.1 },
      { name: "searchableIngredients", weight: 0.05 },
    ],
    threshold: 0.35, // Balanced typo tolerance (catches "frape", "mochha", "paner", "pizz")
    ignoreLocation: true,
    minMatchCharLength: 2,
    shouldSort: true,
  });
}

/**
 * Executes fast fuzzy search and returns direct matches plus related dishes.
 */
export function executeFuzzySearch(
  fuse: Fuse<SearchableMenuItem> | null,
  allItems: SearchableMenuItem[],
  query: string
): SearchResult {
  const clean = query.trim();
  if (!clean || !fuse) {
    return { matches: allItems, related: [], queryNormalized: clean };
  }

  const results = fuse.search(clean);
  const matchedItems = results.map((r) => r.item);

  // If we have matches, find related items in the same categories that weren't matched directly
  let relatedItems: SearchableMenuItem[] = [];
  if (matchedItems.length > 0 && matchedItems.length < 10) {
    const matchedIds = new Set(matchedItems.map((m) => m.id));
    const matchedCategoryIds = new Set(matchedItems.map((m) => m.categoryId));

    relatedItems = allItems
      .filter((i) => !matchedIds.has(i.id) && matchedCategoryIds.has(i.categoryId) && i.available !== false)
      .slice(0, 4);
  }

  return {
    matches: matchedItems,
    related: relatedItems,
    queryNormalized: clean,
  };
}
