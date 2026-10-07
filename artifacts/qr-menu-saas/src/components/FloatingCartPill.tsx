import React from "react";
import { ArrowRight, ShoppingCart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { triggerHaptic } from "@/lib/haptics";

interface FloatingCartPillProps {
  totalItemsCount: number;
  grandTotal: number;
  currency?: string;
  onClick: () => void;
  activeDinersCount?: number;
}

export function FloatingCartPill({
  totalItemsCount,
  grandTotal,
  currency = "₹",
  onClick,
}: FloatingCartPillProps) {
  const handleClick = () => {
    triggerHaptic("tick");
    onClick();
  };

  return (
    <AnimatePresence>
      {totalItemsCount > 0 && (
        <motion.div
          key="floating-cart-pill"
          initial={{ y: 50, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 50, opacity: 0, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 450, damping: 30 }}
          className="fixed bottom-[74px] inset-x-0 z-35 pointer-events-none px-4 select-none"
        >
          <div className="max-w-md mx-auto">
            <button
              type="button"
              onClick={handleClick}
              className="pointer-events-auto w-full h-13 rounded-2xl bg-[#1c1917] hover:bg-[#2c2825] active:scale-[0.99] text-[#fafaf9] shadow-[0_8px_25px_rgba(28,25,23,0.35)] border border-stone-800 flex items-center justify-between px-5 transition-all duration-200 group"
              id="floating-active-cart-pill"
              aria-label={`View order, ${totalItemsCount} items, total ${currency}${grandTotal}`}
            >
              {/* Left: Cart Icon + Items & Total */}
              <div className="flex items-center gap-2.5">
                <ShoppingCart className="h-4.5 w-4.5 text-[#fafaf9] stroke-[2.2]" />
                <span className="font-sans text-sm font-semibold tracking-tight text-[#fafaf9]">
                  {totalItemsCount} {totalItemsCount === 1 ? "item" : "items"}
                  <span className="mx-1.5 opacity-40">·</span>
                  <span className="font-sans tabular-nums font-bold">
                    {currency}{grandTotal}
                  </span>
                </span>
              </div>

              {/* Subtle Vertical Divider */}
              <div className="h-5 w-px bg-stone-700/80" />

              {/* Right: View Order Action */}
              <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold tracking-tight text-[#fafaf9] group-hover:text-amber-200 transition-colors">
                <span>View Order</span>
                <ArrowRight className="h-4 w-4 stroke-[2.5]" />
              </div>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default FloatingCartPill;
