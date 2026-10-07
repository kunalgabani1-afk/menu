import React, { useRef } from "react";
import { Sparkles, UtensilsCrossed, ChevronLeft, ChevronRight } from "lucide-react";

export interface CategoryBubbleItem {
  id: string;
  name: string;
  count?: number;
  icon?: string;
  imageUrl?: string;
}

interface CategoryStoryBubblesProps {
  categories: CategoryBubbleItem[];
  selectedCategoryId: string;
  onSelectCategory: (id: string) => void;
  isDark?: boolean;
  totalItemsCount?: number;
}

// Smart heuristic to pick appealing food icons based on category name
function getCategoryIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("starter") || lower.includes("appetizer") || lower.includes("snack") || lower.includes("dimsum")) {
    return "🥟";
  }
  if (lower.includes("main") || lower.includes("curry") || lower.includes("gravy") || lower.includes("dal")) {
    return "🍛";
  }
  if (lower.includes("rice") || lower.includes("biryani") || lower.includes("pulao")) {
    return "🍚";
  }
  if (lower.includes("bread") || lower.includes("roti") || lower.includes("naan") || lower.includes("paratha")) {
    return "🫓";
  }
  if (lower.includes("pizza") || lower.includes("pasta") || lower.includes("italian")) {
    return "🍕";
  }
  if (lower.includes("burger") || lower.includes("sandwich") || lower.includes("wrap")) {
    return "🍔";
  }
  if (lower.includes("dessert") || lower.includes("sweet") || lower.includes("cake") || lower.includes("ice cream")) {
    return "🍰";
  }
  if (lower.includes("drink") || lower.includes("beverage") || lower.includes("shake") || lower.includes("juice") || lower.includes("mocktail") || lower.includes("cocktail")) {
    return "🍹";
  }
  if (lower.includes("tea") || lower.includes("chai") || lower.includes("coffee") || lower.includes("hot")) {
    return "☕";
  }
  if (lower.includes("soup") || lower.includes("salad") || lower.includes("healthy") || lower.includes("green")) {
    return "🥗";
  }
  if (lower.includes("tandoor") || lower.includes("kebab") || lower.includes("sizzler") || lower.includes("grill")) {
    return "🔥";
  }
  if (lower.includes("breakfast") || lower.includes("morning") || lower.includes("brunch") || lower.includes("egg")) {
    return "🍳";
  }
  if (lower.includes("special") || lower.includes("chef") || lower.includes("signature") || lower.includes("popular")) {
    return "⭐";
  }
  if (lower.includes("seafood") || lower.includes("fish") || lower.includes("prawn")) {
    return "🦐";
  }
  return "🍽️";
}

export function CategoryStoryBubbles({
  categories,
  selectedCategoryId,
  onSelectCategory,
  isDark = false,
  totalItemsCount,
}: CategoryStoryBubblesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const offset = direction === "left" ? -220 : 220;
      scrollRef.current.scrollBy({ left: offset, behavior: "smooth" });
    }
  };

  return (
    <div className="relative py-2.5" id="category-story-bubbles">
      {/* Scroll Left Button */}
      <button
        type="button"
        onClick={() => handleScroll("left")}
        aria-label="Scroll left"
        className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 h-7 w-7 items-center justify-center rounded-full bg-card/90 border border-border shadow-md hover:bg-secondary text-foreground backdrop-blur-xs transition-opacity"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* Bubbles Row */}
      <div
        ref={scrollRef}
        className="flex items-center gap-3.5 overflow-x-auto no-scrollbar scroll-smooth px-1 py-1"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {/* "All Menu" Story Bubble */}
        <button
          type="button"
          onClick={() => onSelectCategory("ALL")}
          className="group shrink-0 flex flex-col items-center gap-1.5 focus:outline-none select-none transition-transform active:scale-95"
          id="story-bubble-all"
          style={{ scrollSnapAlign: "start" }}
        >
          <div
            className={`relative h-15 w-15 sm:h-16 sm:w-16 rounded-full p-[2.5px] transition-all ${
              selectedCategoryId === "ALL"
                ? "bg-gradient-to-tr from-amber-500 via-rose-500 to-amber-400 shadow-md ring-2 ring-amber-500/20"
                : "bg-stone-300 dark:bg-stone-700 hover:bg-stone-400 dark:hover:bg-stone-600"
            }`}
          >
            <div
              className={`h-full w-full rounded-full flex flex-col items-center justify-center transition-colors ${
                isDark ? "bg-stone-900 text-stone-100" : "bg-white text-stone-900"
              }`}
            >
              <span className="text-xl leading-none">✨</span>
              {totalItemsCount !== undefined && (
                <span className="text-[9px] font-mono font-bold opacity-75 mt-0.5">
                  {totalItemsCount}
                </span>
              )}
            </div>
          </div>
          <span
            className={`text-[11px] font-bold tracking-tight whitespace-nowrap px-1 max-w-[72px] truncate ${
              selectedCategoryId === "ALL"
                ? "text-foreground font-black"
                : "text-muted-foreground group-hover:text-foreground"
            }`}
          >
            All Items
          </span>
        </button>

        {/* Categories Story Bubbles */}
        {categories.map((cat) => {
          const isSelected = selectedCategoryId === cat.id;
          const icon = cat.icon || getCategoryIcon(cat.name);

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(cat.id)}
              className="group shrink-0 flex flex-col items-center gap-1.5 focus:outline-none select-none transition-transform active:scale-95"
              id={`story-bubble-${cat.id}`}
              style={{ scrollSnapAlign: "start" }}
            >
              <div
                className={`relative h-15 w-15 sm:h-16 sm:w-16 rounded-full p-[2.5px] transition-all ${
                  isSelected
                    ? "bg-gradient-to-tr from-emerald-500 via-teal-500 to-amber-400 shadow-md ring-2 ring-emerald-500/20"
                    : "bg-stone-200/90 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700"
                }`}
              >
                <div
                  className={`h-full w-full rounded-full flex flex-col items-center justify-center transition-colors overflow-hidden ${
                    isDark ? "bg-stone-900 text-stone-100" : "bg-white text-stone-900"
                  }`}
                >
                  {cat.imageUrl ? (
                    <img
                      src={cat.imageUrl}
                      alt={cat.name}
                      className="h-full w-full object-cover rounded-full"
                    />
                  ) : (
                    <>
                      <span className="text-xl leading-none">{icon}</span>
                      {cat.count !== undefined && (
                        <span className="text-[9px] font-mono font-bold opacity-70 mt-0.5">
                          {cat.count}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
              <span
                className={`text-[11px] font-medium tracking-tight whitespace-nowrap px-1 max-w-[76px] truncate text-center ${
                  isSelected
                    ? "text-foreground font-bold"
                    : "text-muted-foreground group-hover:text-foreground"
                }`}
                title={cat.name}
              >
                {cat.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Scroll Right Button */}
      <button
        type="button"
        onClick={() => handleScroll("right")}
        aria-label="Scroll right"
        className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 h-7 w-7 items-center justify-center rounded-full bg-card/90 border border-border shadow-md hover:bg-secondary text-foreground backdrop-blur-xs transition-opacity"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
