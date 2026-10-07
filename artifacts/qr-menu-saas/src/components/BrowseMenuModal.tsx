import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, Sparkles } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

export interface CategorySummary {
  id: string;
  name: string;
  count: number;
  isDaypartActive?: boolean;
}

interface BrowseMenuModalProps {
  isOpen: boolean;
  categories: CategorySummary[];
  activeCategoryId?: string;
  onClose: () => void;
  onSelectCategory: (categoryId: string) => void;
  isDark?: boolean;
}

export function BrowseMenuModal({
  isOpen,
  categories,
  activeCategoryId,
  onClose,
  onSelectCategory,
  isDark = false,
}: BrowseMenuModalProps) {
  if (!isOpen) return null;

  const handleCategoryClick = (categoryId: string) => {
    triggerHaptic("selection");
    onSelectCategory(categoryId);
    onClose();
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in"
        onClick={onClose}
        id="browse-menu-backdrop"
      >
        <motion.div
          initial={{ y: "100%", opacity: 0.8 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 320 }}
          drag="y"
          dragConstraints={{ top: 0 }}
          dragElastic={0.2}
          onDragEnd={(_, info) => {
            if (info.offset.y > 90 || info.velocity.y > 350) {
              triggerHaptic("light");
              onClose();
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className={`w-full max-w-md max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-[#E8DDD0] dark:border-stone-800 shadow-2xl overflow-hidden ${
            isDark ? "bg-[#1c1917] text-[#fafaf9]" : "bg-[#FAF6F0] text-[#1c1917]"
          }`}
          id="browse-menu-drawer"
        >
          {/* Mobile Swipe-Down Pill Drag Handle */}
          <div className="w-full pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing">
            <div className="w-12 h-1.5 rounded-full bg-stone-300 dark:bg-stone-700" />
          </div>

          {/* Header */}
          <div className="px-5 py-3 border-b border-[#E8DDD0]/80 dark:border-stone-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base text-amber-700 dark:text-amber-400 font-mono">☷</span>
              <h2 className="font-serif text-lg font-bold tracking-tight">Browse Menu</h2>
              <span className="text-[11px] font-sans tabular-nums px-2 py-0.5 rounded-full bg-[#5A351F]/10 dark:bg-stone-800 font-semibold text-[#5A351F] dark:text-amber-300">
                {categories.length} Sections
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-full grid place-items-center text-[#776B62] hover:bg-stone-200/50 dark:hover:bg-stone-800 transition-colors"
              aria-label="Close menu navigator"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Category List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
            {/* View All Option */}
            <button
              type="button"
              onClick={() => handleCategoryClick("ALL")}
              className={`w-full p-3.5 rounded-2xl flex items-center justify-between text-left transition-all ${
                activeCategoryId === "ALL"
                  ? "bg-[#1c1917] dark:bg-stone-800 text-[#fafaf9] shadow-sm font-bold"
                  : "bg-white dark:bg-stone-900 border border-[#E8DDD0] dark:border-stone-800 hover:bg-[#F5EFE6]"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="font-serif text-sm font-semibold tracking-wide">Full Dining Menu</span>
              </div>
              <ChevronRight className="h-4 w-4 text-[#8A7D73]" />
            </button>

            {categories.map((cat) => {
              const isActive = activeCategoryId === cat.id;

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleCategoryClick(cat.id)}
                  className={`w-full p-3.5 rounded-2xl flex items-center justify-between text-left transition-all ${
                    isActive
                      ? "bg-[#5A351F] text-white shadow-sm font-bold"
                      : "bg-white dark:bg-stone-900 border border-[#E8DDD0] dark:border-stone-800 hover:bg-[#F5EFE6] dark:hover:bg-stone-800"
                  }`}
                  id={`browse-cat-${cat.id}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <span className="font-serif text-sm font-semibold tracking-wide truncate">
                      {cat.name}
                    </span>
                    {cat.isDaypartActive && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 shrink-0">
                        <Sparkles className="h-2.5 w-2.5" />
                        <span>Active Now</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      className={`text-xs font-sans tabular-nums ${
                        isActive ? "text-white/80" : "text-[#8A7D73]"
                      }`}
                    >
                      {cat.count} {cat.count === 1 ? "item" : "items"}
                    </span>
                    <ChevronRight className="h-4 w-4 opacity-50" />
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
