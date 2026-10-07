import { useState, useEffect, useRef, useMemo, useCallback } from "react";

export interface DaypartInfo {
  period: "BREAKFAST" | "LUNCH" | "EVENING_TEA" | "DINNER" | "LATE_NIGHT";
  title: string;
  subtitle: string;
  badge: string;
  recommendedKeywords: string[];
}

export function getCurrentDaypart(date: Date = new Date()): DaypartInfo {
  const hour = date.getHours();

  // 7 AM – 11 AM: Breakfast / Morning Coffee
  if (hour >= 7 && hour < 11) {
    return {
      period: "BREAKFAST",
      title: "Morning Brew & Bakes",
      subtitle: "Freshly roasted espresso, warm croissants & sourdough toast",
      badge: "☕ 7 AM–11 AM Priority",
      recommendedKeywords: ["coffee", "espresso", "pastry", "bake", "croissant", "toast", "breakfast", "tea", "latte"],
    };
  }

  // 12 PM – 4 PM: Lunch / Afternoon
  if (hour >= 12 && hour < 16) {
    return {
      period: "LUNCH",
      title: "Afternoon Mains & Combos",
      subtitle: "Hearty bowls, artisan sourdough melts & refreshing coolers",
      badge: "🥪 12 PM–4 PM Priority",
      recommendedKeywords: ["combo", "bowl", "plate", "sandwich", "melt", "lunch", "meal", "pasta", "wrap"],
    };
  }

  // 4 PM – 7 PM: High Tea & Nibbles
  if (hour >= 16 && hour < 19) {
    return {
      period: "EVENING_TEA",
      title: "Sun-downer Tea & Small Plates",
      subtitle: "Truffle fries, cold brew tonic & dessert pairings",
      badge: "🍰 4 PM–7 PM Priority",
      recommendedKeywords: ["snack", "dessert", "cold brew", "shake", "fries", "cake", "cheesecake"],
    };
  }

  // 7 PM – 11 PM: Dinner / Evening Rush
  if (hour >= 19 && hour <= 23) {
    return {
      period: "DINNER",
      title: "Evening Dinner & Hearth Plates",
      subtitle: "Wood-fired sourdough pizzas, artisanal pasta & shareable platters",
      badge: "🍕 7 PM–11 PM Priority",
      recommendedKeywords: ["pizza", "main", "pasta", "dinner", "burger", "platter", "grill"],
    };
  }

  // Late Night / Early Morning (11 PM - 7 AM)
  return {
    period: "LATE_NIGHT",
    title: "Signature Cafe Specials",
    subtitle: "Chef specials, curated desserts & soothing infusions",
    badge: "✨ All-Day Favorites",
    recommendedKeywords: ["signature", "dessert", "coffee", "bestseller"],
  };
}

interface UseMenuNavigationOptions {
  categories: Array<{ id: string; name: string }>;
  isSearchActive?: boolean;
}

export function useMenuNavigation({ categories, isSearchActive = false }: UseMenuNavigationOptions) {
  // Dayparting metadata
  const daypartInfo = useMemo(() => getCurrentDaypart(), []);

  // Sort categories by daypart relevance
  const sortedCategories = useMemo(() => {
    if (!categories || categories.length === 0) return [];

    const copy = [...categories];
    const keywords = daypartInfo.recommendedKeywords;

    return copy.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();

      // Check keyword match
      const aMatches = keywords.some((kw) => aName.includes(kw));
      const bMatches = keywords.some((kw) => bName.includes(kw));

      // Always keep "Signature" near the top if present
      const aSig = aName.includes("signature") || aName.includes("chef");
      const bSig = bName.includes("signature") || bName.includes("chef");

      if (aMatches && !bMatches) return -1;
      if (!aMatches && bMatches) return 1;
      if (aSig && !bSig) return -1;
      if (!aSig && bSig) return 1;
      return 0;
    });
  }, [categories, daypartInfo]);

  // Active Category currently intersecting the viewport
  const [activeCategoryId, setActiveCategoryId] = useState<string>(() => {
    return sortedCategories[0]?.id || "";
  });

  // Smart Auto-Collapsing Accordions State:
  // Default to expanding only the top/signature category to save DOM nodes and scroll length!
  const [openCategoryIds, setOpenCategoryIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (sortedCategories[0]?.id) {
      initial.add(sortedCategories[0].id);
    }
    return initial;
  });

  // When categories change or initial load, ensure at least one is open
  useEffect(() => {
    if (sortedCategories.length > 0 && openCategoryIds.size === 0) {
      setOpenCategoryIds(new Set([sortedCategories[0].id]));
      setActiveCategoryId(sortedCategories[0].id);
    }
  }, [sortedCategories]);

  // If search is active, expand all categories automatically so matching items are visible
  useEffect(() => {
    if (isSearchActive) {
      setOpenCategoryIds(new Set(categories.map((c) => c.id)));
    }
  }, [isSearchActive, categories]);

  // Auto-collapsing accordion toggle: opening category X collapses others smoothly
  const toggleCategory = useCallback((categoryId: string) => {
    setOpenCategoryIds((prev) => {
      const next = new Set<string>();
      if (!prev.has(categoryId)) {
        // Smoothly collapse previously opened and expand this one
        next.add(categoryId);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setOpenCategoryIds(new Set(categories.map((c) => c.id)));
  }, [categories]);

  const collapseAll = useCallback(() => {
    setOpenCategoryIds(new Set());
  }, []);

  // Horizontal scroll container reference for sticky category bar
  const pillBarRef = useRef<HTMLDivElement | null>(null);

  // Auto-center the active pill in the horizontal sticky bar
  useEffect(() => {
    if (!pillBarRef.current || !activeCategoryId) return;
    const pill = pillBarRef.current.querySelector<HTMLElement>(`[data-pill-id="${activeCategoryId}"]`);
    if (pill) {
      const container = pillBarRef.current;
      const scrollLeft = pill.offsetLeft - container.offsetWidth / 2 + pill.offsetWidth / 2;
      container.scrollTo({ left: scrollLeft, behavior: "smooth" });
    }
  }, [activeCategoryId]);

  // Smoothly scroll to target category section and expand it
  const scrollToCategory = useCallback(
    (categoryId: string) => {
      // Ensure the accordion is expanded
      setOpenCategoryIds((prev) => {
        const next = new Set(prev);
        next.add(categoryId);
        return next;
      });

      setActiveCategoryId(categoryId);

      // Brief delay to allow accordion expansion layout calculation before scrolling
      setTimeout(() => {
        const el = document.getElementById(`category-section-${categoryId}`);
        if (el) {
          const yOffset = -110; // offset for sticky category bar & hero scrim
          const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
          window.scrollTo({ top: y, behavior: "smooth" });
        }
      }, 50);
    },
    []
  );

  // IntersectionObserver to spy on category headers
  useEffect(() => {
    if (typeof window === "undefined" || sortedCategories.length === 0 || isSearchActive) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const catId = entry.target.getAttribute("data-category-id");
            if (catId) {
              setActiveCategoryId(catId);
            }
          }
        });
      },
      {
        root: null,
        rootMargin: "-90px 0px -65% 0px", // focus top third of screen
        threshold: 0.1,
      }
    );

    sortedCategories.forEach((cat) => {
      const el = document.getElementById(`category-section-${cat.id}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [sortedCategories, isSearchActive]);

  return {
    daypartInfo,
    sortedCategories,
    activeCategoryId,
    setActiveCategoryId,
    openCategoryIds,
    toggleCategory,
    expandAll,
    collapseAll,
    scrollToCategory,
    pillBarRef,
  };
}
