import React from "react";
import { Plus, Sparkles, Flame, Star, Coffee } from "lucide-react";
import { getFoodImage } from "@/lib/foodImageFallbacks";
import type { AdvancedMenuItem } from "@/types/advancedPos";

interface HighlightReelCarouselProps {
  items: any[];
  currency?: string;
  isDark?: boolean;
  onSelectItem: (item: any) => void;
  onQuickAdd: (item: any) => void;
}

export function HighlightReelCarousel({
  items,
  currency = "₹",
  isDark = false,
  onSelectItem,
  onQuickAdd,
}: HighlightReelCarouselProps) {
  // Query items where is_highlighted == true (enforce frontend limit of exactly 4 items)
  const highlightedItems = React.useMemo(() => {
    const explicitHighlights = (items || []).filter(
      (item) => item.is_highlighted === true || item.isHighlighted === true
    );

    if (explicitHighlights.length >= 4) {
      return explicitHighlights.slice(0, 4);
    }

    // Fallback if cafe hasn't tagged 4 items yet: select highest margin/popular signatures
    const remainingCount = 4 - explicitHighlights.length;
    const fallbacks = (items || [])
      .filter((item) => !explicitHighlights.some((h) => h.id === item.id))
      .slice(0, remainingCount);

    return [...explicitHighlights, ...fallbacks].slice(0, 4);
  }, [items]);

  if (highlightedItems.length === 0) return null;

  return (
    <section className="py-4 space-y-3" id="todays-pours-and-plates-carousel">
      {/* Editorial Section Header */}
      <div className="flex items-end justify-between px-4 sm:px-6">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#6B4226] dark:text-[#C99A55]">
            <Sparkles className="h-3.5 w-3.5 text-[#C99A55]" />
            <span>Curated Signatures</span>
          </div>
          <h2 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-[#241B16] dark:text-[#FBF8F2]">
            Today's Pours &amp; Plates
          </h2>
        </div>

        <span className="text-[11px] font-medium text-[#776B62] dark:text-stone-400">
          Artisanal &amp; Fresh
        </span>
      </div>

      {/* Horizontal Scrolling Reel (Editorial borderless aesthetic) */}
      <div
        className="flex gap-4 overflow-x-auto px-4 sm:px-6 pb-2 pt-1 no-scrollbar snap-x snap-mandatory scroll-smooth"
        id="highlight-reel-container"
      >
        {highlightedItems.map((item, index) => {
          const imageUrl = item.imageUrl || getFoodImage(item.name, item.category);
          const highlightTag =
            item.highlight_tag || (index === 0 ? "Chef's Signature" : index === 1 ? "House Pour" : "Daily Feature");

          return (
            <div
              key={item.id || index}
              onClick={() => onSelectItem(item)}
              className="relative flex-none w-[260px] sm:w-[280px] h-[320px] rounded-3xl overflow-hidden cursor-pointer snap-start group shadow-md transition-all duration-300 hover:shadow-xl active:scale-98"
            >
              {/* Large Borderless Editorial Food Photo */}
              <img
                src={imageUrl}
                alt={item.name}
                className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
                loading="lazy"
              />

              {/* Clean Dark Vignette Overlay for Typographic Contrast */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/10" />

              {/* Top Pill: Highlight Tag */}
              <div className="absolute top-3.5 left-3.5 flex items-center gap-1 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/25 text-white text-[10.5px] font-bold uppercase tracking-wider">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span>{highlightTag}</span>
              </div>

              {/* Bottom Editorial Content */}
              <div className="absolute bottom-0 inset-x-0 p-4 text-white flex flex-col justify-end">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#C99A55] text-stone-950">
                    High Margin Special
                  </span>
                  {item.isVeg !== undefined && (
                    <span
                      className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded ${
                        item.isVeg ? "bg-emerald-500/80" : "bg-rose-500/80"
                      }`}
                    >
                      {item.isVeg ? "VEG" : "NON-VEG"}
                    </span>
                  )}
                </div>

                <h3 className="font-serif text-lg font-bold leading-snug line-clamp-1 drop-shadow-sm text-white">
                  {item.name}
                </h3>

                <p className="text-xs text-white/80 line-clamp-2 mt-0.5 font-normal leading-relaxed">
                  {item.description || "Freshly roasted single origin beans paired with house-baked pastry."}
                </p>

                {/* Price and Add Button Trio */}
                <div className="mt-3 flex items-center justify-between pt-2 border-t border-white/20">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-semibold text-white/70">Price</span>
                    <span className="font-sans tabular-nums tracking-tight text-xl font-black text-amber-300">
                      {currency}{Number(item.price || 0).toFixed(0)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickAdd(item);
                    }}
                    className="h-9 px-4 rounded-2xl bg-white text-[#241B16] font-bold text-xs flex items-center gap-1.5 shadow-md hover:bg-amber-100 active:scale-95 transition-all"
                    id={`btn-quick-add-${item.id}`}
                  >
                    <Plus className="h-3.5 w-3.5 text-[#5A351F]" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default HighlightReelCarousel;
