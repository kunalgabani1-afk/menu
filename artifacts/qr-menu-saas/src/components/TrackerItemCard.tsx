import React, { useState } from "react";
import { RotateCw, Check, HeartHandshake, ArrowRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { triggerHaptic } from "@/lib/haptics";
import type { TrackerItem } from "./KitchenTracker";

export interface TrackerItemCardProps {
  item: TrackerItem;
  currency?: string;
  onReorder?: (item: TrackerItem) => void;
  onBrowseAlternatives?: () => void;
}

export function TrackerItemCard({
  item,
  currency = "₹",
  onReorder,
  onBrowseAlternatives,
}: TrackerItemCardProps) {
  const [justReordered, setJustReordered] = useState(false);

  const handleReorder = () => {
    triggerHaptic("tick");
    setJustReordered(true);
    onReorder?.(item);
    setTimeout(() => {
      setJustReordered(false);
    }, 1800);
  };

  const isDeclined = item.status?.toUpperCase() === "DECLINED";
  const isServed = item.status?.toUpperCase() === "SERVED";

  // Graceful "Apology" Decline State (Module 3)
  if (isDeclined) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 rounded-3xl bg-[#fefaf6] dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/50 shadow-sm space-y-3"
      >
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-2xl bg-amber-500/20 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
            <HeartHandshake className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h4 className="font-serif font-bold text-sm text-[#1c1917] dark:text-[#fafaf9] line-through opacity-70">
                {item.name}
              </h4>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-200">
                Item Removed
              </span>
            </div>

            <p className="text-xs text-[#776b62] dark:text-stone-300 leading-relaxed mt-1">
              {item.declineReason ||
                "We sincerely apologize, but the chef just ran out of fresh ingredients. This item has been removed from your bill."}
            </p>
          </div>
        </div>

        {onBrowseAlternatives && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic("selection");
              onBrowseAlternatives();
            }}
            className="w-full h-10 rounded-2xl bg-[#1c1917] hover:bg-[#2a2421] text-[#fafaf9] text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-all"
          >
            <span>Browse Alternatives</span>
            <ArrowRight className="h-3.5 w-3.5 text-amber-400" />
          </button>
        )}
      </motion.div>
    );
  }

  // Active / Cooking / Plated / Served Item Card
  return (
    <div className={`p-4 rounded-3xl bg-white dark:bg-stone-900 border transition-all ${
      isServed
        ? "border-emerald-200/70 dark:border-emerald-900/40 shadow-xs"
        : "border-[#ede4d8] dark:border-stone-800 shadow-sm"
    }`}>
      <div className="flex items-start justify-between gap-3">
        {/* Left Column: Quantity + Name + Indented Modifiers */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className={`h-6 w-6 rounded-lg font-sans tabular-nums text-xs font-black flex items-center justify-center shrink-0 mt-0.5 ${
            isServed
              ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300"
              : "bg-stone-100 dark:bg-stone-800 text-[#1c1917] dark:text-[#fafaf9]"
          }`}>
            {item.quantity}×
          </span>

          <div className="flex-1 min-w-0">
            <h4 className="font-serif font-bold text-sm text-[#1c1917] dark:text-[#fafaf9] leading-snug">
              {item.name}
            </h4>

            {/* Modifiers indented in a smaller amber font */}
            {item.modifiers && item.modifiers.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {item.modifiers.map((mod, mi) => (
                  <div
                    key={mi}
                    className="text-[11px] font-medium text-amber-700 dark:text-amber-400 pl-1"
                  >
                    {mod.startsWith("↳") ? mod : `↳ ${mod}`}
                  </div>
                ))}
              </div>
            )}

            {/* Status indicator */}
            <div className="flex items-center gap-1.5 mt-2">
              {isServed ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                  <Sparkles className="h-3 w-3" />
                  Served at Table
                </span>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
                    {item.status || "In Kitchen"}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Price */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="font-sans tabular-nums text-sm font-black text-[#1c1917] dark:text-[#fafaf9]">
            {currency}
            {item.price * item.quantity}
          </span>

          {!isServed && (
            <button
              type="button"
              onClick={handleReorder}
              className={`h-7 px-2.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 ${
                justReordered
                  ? "bg-emerald-600 text-white"
                  : "bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 dark:text-amber-300 border border-amber-500/30"
              }`}
              title="Repeat item into active cart"
              aria-label={`Reorder ${item.name}`}
            >
              {justReordered ? (
                <>
                  <Check className="h-3 w-3 stroke-[3]" />
                  <span>Added</span>
                </>
              ) : (
                <>
                  <RotateCw className="h-3 w-3" />
                  <span>Reorder</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Module 3: Served Reorder Loop Button Directly Below Item */}
      {isServed && (
        <div className="mt-3 pt-2.5 border-t border-emerald-100 dark:border-stone-800/80">
          <button
            type="button"
            onClick={handleReorder}
            className={`w-full h-8 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
              justReordered
                ? "bg-emerald-600 text-white"
                : "bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 dark:text-amber-300 border border-amber-500/30 shadow-2xs"
            }`}
            id={`btn-reorder-another-${item.id}`}
            aria-label={`Reorder another round of ${item.name}`}
          >
            {justReordered ? (
              <>
                <Check className="h-3.5 w-3.5 stroke-[3]" />
                <span>Added another round to cart!</span>
              </>
            ) : (
              <>
                <RotateCw className="h-3.5 w-3.5" />
                <span>↺ Reorder Another Round</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default TrackerItemCard;
