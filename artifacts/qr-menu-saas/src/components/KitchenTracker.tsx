import React, { useMemo } from "react";
import {
  Clock,
  ChefHat,
  Utensils,
  CheckCircle2,
  Sparkles,
  Flame,
  ArrowRight,
  UtensilsCrossed,
} from "lucide-react";
import { motion } from "framer-motion";
import { TrackerItemCard } from "./TrackerItemCard";

export interface TrackerItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  modifiers?: string[];
  status?: "QUEUED" | "COOKING" | "PLATED" | "SERVED" | "DECLINED";
  declineReason?: string;
}

export interface KitchenTrackerProps {
  orderNumber?: number | string;
  tableNumber: string;
  currency?: string;
  orderStatus?: string;
  items?: TrackerItem[];
  estimatedWaitMinutes?: number | string;
  onReorderItem?: (item: TrackerItem) => void;
  onBrowseAlternatives?: () => void;
}

export function KitchenTracker({
  orderNumber,
  tableNumber = "01",
  currency = "₹",
  orderStatus = "COOKING",
  items,
  estimatedWaitMinutes = "12–15 mins",
  onReorderItem,
  onBrowseAlternatives,
}: KitchenTrackerProps) {
  // Real active ticket items only (no fake demo orders fallback)
  const ticketItems = useMemo<TrackerItem[]>(() => {
    if (items && Array.isArray(items) && items.length > 0) {
      return items;
    }
    return [];
  }, [items]);

  // Group items logically: In Kitchen vs Served vs Notices
  const inKitchenItems = useMemo(
    () => ticketItems.filter((i) => !i.status || ["QUEUED", "COOKING", "PLATED"].includes(i.status.toUpperCase())),
    [ticketItems]
  );

  const servedItems = useMemo(
    () => ticketItems.filter((i) => i.status?.toUpperCase() === "SERVED"),
    [ticketItems]
  );

  const declinedItems = useMemo(
    () => ticketItems.filter((i) => i.status?.toUpperCase() === "DECLINED"),
    [ticketItems]
  );

  const steps = [
    { id: "PLACED", label: "1. Placed", icon: CheckCircle2 },
    { id: "QUEUE", label: "2. Kitchen Queue", icon: Clock },
    { id: "COOKING", label: "3. Cooking", icon: ChefHat },
    { id: "PLATED", label: "4. Plated", icon: Utensils },
    { id: "SERVED", label: "5. Served", icon: Sparkles },
  ];

  // Dynamic step index mapping (0 to 4)
  const currentStepIndex = useMemo(() => {
    const s = String(orderStatus).toUpperCase();
    if (s.includes("SERVE") || s.includes("COMPLET")) return 4;
    if (s.includes("PLATE") || s.includes("READY")) return 3;
    if (s.includes("COOK") || s.includes("PREPAR") || s.includes("FIRE")) return 2;
    if (s.includes("QUEUE") || s.includes("ACCEPT") || s.includes("RECEIVED")) return 1;
    return 2;
  }, [orderStatus]);

  const formattedTableNumber = String(tableNumber || "1")
    .replace(/^Table\s*/i, "")
    .padStart(2, "0");

  // Empty state when table has no active kitchen orders (No fake demo orders)
  if (ticketItems.length === 0) {
    return (
      <div className="space-y-4 pt-1 animate-in fade-in duration-300 select-none pb-28">
        {/* Header Banner */}
        <div className="p-5 rounded-3xl bg-white dark:bg-stone-900 border border-[#ede4d8] dark:border-stone-800 shadow-md flex items-center justify-between">
          <div>
            <h2 className="font-serif font-black text-xl text-[#1c1917] dark:text-[#fafaf9]">
              Live Kitchen Tracker
            </h2>
            <p className="text-xs text-[#8a7d73] dark:text-stone-400 mt-0.5 font-medium">
              Table {formattedTableNumber}
            </p>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-stone-700">
            No Active Orders
          </span>
        </div>

        {/* Clean country club empty state */}
        <div className="py-14 px-6 text-center rounded-3xl bg-white dark:bg-stone-900 border border-[#ede4d8] dark:border-stone-800 shadow-sm space-y-3.5">
          <div className="h-14 w-14 rounded-2xl bg-amber-500/10 text-amber-800 dark:text-amber-400 mx-auto flex items-center justify-center">
            <UtensilsCrossed className="h-7 w-7 stroke-[1.8]" />
          </div>
          <div className="space-y-1.5">
            <h3 className="font-serif font-bold text-lg text-[#1c1917] dark:text-[#fafaf9]">
              No dishes in the kitchen yet
            </h3>
            <p className="text-xs text-[#8a7d73] dark:text-stone-400 max-w-sm mx-auto leading-relaxed">
              Table {formattedTableNumber} does not have any pending or cooking orders. Select dishes from the menu, tap "Confirm & Place Order", and your live ticket preparation will show here.
            </p>
          </div>
          {onBrowseAlternatives && (
            <div className="pt-2">
              <button
                type="button"
                onClick={onBrowseAlternatives}
                className="px-6 py-2.5 rounded-xl bg-[#1c1917] dark:bg-amber-400 text-white dark:text-stone-950 text-xs font-bold shadow-md hover:bg-stone-800 active:scale-95 transition-all inline-flex items-center gap-2"
                id="btn-tracker-browse-menu"
              >
                <span>Browse Menu</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-1 animate-in fade-in duration-300 select-none pb-28">
      {/* 1. Decluttered & Minimal Header */}
      <div className="p-5 rounded-3xl bg-white dark:bg-stone-900 border border-[#ede4d8] dark:border-stone-800 shadow-md space-y-4">
        <div className="flex items-center justify-between border-b border-[#ede4d8] dark:border-stone-800/80 pb-3">
          <div>
            <h2 className="font-serif font-black text-xl text-[#1c1917] dark:text-[#fafaf9]">
              Live Kitchen Order #{orderNumber || "1"}
            </h2>
            <p className="text-xs text-[#8a7d73] dark:text-stone-400 mt-0.5 font-medium">
              Table {formattedTableNumber}
            </p>
          </div>

          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            Live Kitchen
          </span>
        </div>

        {/* 2. 5-Step Progress Bar with Smooth Animated Transitions */}
        <div className="pt-2">
          {/* Progress Track */}
          <div className="relative mb-3">
            <div className="h-1.5 w-full bg-stone-200 dark:bg-stone-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: "20%" }}
                animate={{ width: `${((currentStepIndex + 0.5) / steps.length) * 100}%` }}
                transition={{ type: "spring", damping: 25, stiffness: 120 }}
                className="h-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400 rounded-full"
              />
            </div>
          </div>

          {/* Step Nodes */}
          <div className="grid grid-cols-5 gap-1 text-center">
            {steps.map((st, idx) => {
              const isPast = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              const StepIcon = st.icon;

              return (
                <div key={st.id} className="flex flex-col items-center gap-1">
                  <motion.div
                    animate={isCurrent ? { scale: [1, 1.1, 1] } : { scale: 1 }}
                    transition={isCurrent ? { repeat: Infinity, duration: 2.5 } : {}}
                    className={`h-7 w-7 rounded-full flex items-center justify-center text-xs transition-all ${
                      isCurrent
                        ? "bg-[#1c1917] text-amber-400 dark:bg-amber-400 dark:text-stone-950 font-bold scale-110 shadow-md ring-2 ring-amber-400/40"
                        : isPast
                        ? "bg-amber-500 text-stone-950 font-bold"
                        : "bg-stone-200 dark:bg-stone-800 text-stone-400"
                    }`}
                  >
                    <StepIcon className="h-3.5 w-3.5" />
                  </motion.div>
                  <span
                    className={`text-[9.5px] sm:text-[10px] leading-tight ${
                      isCurrent
                        ? "font-black text-[#1c1917] dark:text-[#fafaf9]"
                        : isPast
                        ? "font-bold text-amber-700 dark:text-amber-400"
                        : "text-stone-400"
                    }`}
                  >
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. Minimal Soft-Amber ETA Box */}
        <div className="p-3.5 rounded-2xl bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/25 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="h-8.5 w-8.5 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center shrink-0 shadow-xs">
              <Clock className="h-4 w-4 animate-spin" style={{ animationDuration: "6s" }} />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider block text-amber-800 dark:text-amber-400">
                Live Prep ETA
              </span>
              <span className="font-serif font-black text-sm sm:text-base text-[#1c1917] dark:text-amber-200">
                {estimatedWaitMinutes}
              </span>
            </div>
          </div>

          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
            <Flame className="h-3 w-3 text-amber-500" />
            Active
          </span>
        </div>
      </div>

      {/* 4. Logically Grouped Ticket Sections */}
      <div className="space-y-4">
        {/* Section A: In Kitchen (Queued, Cooking, Plated) */}
        {inKitchenItems.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5">
                <ChefHat className="h-4 w-4 text-amber-600" />
                <h3 className="font-serif font-bold text-sm text-[#1c1917] dark:text-[#fafaf9]">
                  In Preparation &amp; Cooking ({inKitchenItems.length})
                </h3>
              </div>
              <span className="text-[11px] text-amber-700 dark:text-amber-400 font-bold uppercase tracking-wider">
                Waiting
              </span>
            </div>

            <div className="space-y-2.5">
              {inKitchenItems.map((item) => (
                <TrackerItemCard
                  key={item.id}
                  item={item}
                  currency={currency}
                  onReorder={onReorderItem}
                  onBrowseAlternatives={onBrowseAlternatives}
                />
              ))}
            </div>
          </div>
        )}

        {/* Section B: Served Dishes (Ready for Reordering) */}
        {servedItems.length > 0 && (
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                <h3 className="font-serif font-bold text-sm text-[#1c1917] dark:text-[#fafaf9]">
                  Served at Table ({servedItems.length})
                </h3>
              </div>
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold uppercase tracking-wider">
                Delivered
              </span>
            </div>

            <div className="space-y-2.5">
              {servedItems.map((item) => (
                <TrackerItemCard
                  key={item.id}
                  item={item}
                  currency={currency}
                  onReorder={onReorderItem}
                  onBrowseAlternatives={onBrowseAlternatives}
                />
              ))}
            </div>
          </div>
        )}

        {/* Section C: Kitchen Notices & Out of Stock */}
        {declinedItems.length > 0 && (
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between px-1">
              <h3 className="font-serif font-bold text-sm text-amber-900 dark:text-amber-400">
                Kitchen Updates ({declinedItems.length})
              </h3>
            </div>

            <div className="space-y-2.5">
              {declinedItems.map((item) => (
                <TrackerItemCard
                  key={item.id}
                  item={item}
                  currency={currency}
                  onReorder={onReorderItem}
                  onBrowseAlternatives={onBrowseAlternatives}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default KitchenTracker;
