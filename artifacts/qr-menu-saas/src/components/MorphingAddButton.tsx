import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Minus } from "lucide-react";
import { haptic } from "@/lib/haptics";

interface MorphingAddButtonProps {
  quantity: number;
  available?: boolean;
  customizable?: boolean;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  itemId: string;
  variant?: "pill" | "circle";
  className?: string;
}

export const MorphingAddButton = React.memo(function MorphingAddButton({
  quantity,
  available = true,
  customizable = false,
  onAdd,
  onIncrement,
  onDecrement,
  itemId,
  variant = "pill",
  className = "",
}: MorphingAddButtonProps) {
  if (!available) {
    return (
      <span className="text-[10px] font-semibold text-stone-400 py-1 block text-center">
        Sold Out
      </span>
    );
  }

  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic("light");
    onAdd();
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic("selection");
    onIncrement();
  };

  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic("selection");
    onDecrement();
  };

  if (variant === "circle") {
    return (
      <div className={`relative flex items-center justify-end ${className}`}>
        <AnimatePresence mode="wait" initial={false}>
          {quantity > 0 ? (
            <motion.div
              key="stepper"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
              className="h-7 rounded-full bg-[#1c1917] text-white flex items-center px-1.5 shadow-xs border border-stone-800"
              id={`stepper-container-${itemId}`}
            >
              <button
                type="button"
                onClick={handleDecrement}
                aria-label="Decrease quantity"
                className="h-5 w-5 grid place-items-center rounded-full hover:bg-white/20 active:scale-85 transition-transform"
                id={`button-dec-${itemId}`}
              >
                <Minus className="h-3 w-3 stroke-[2.5]" />
              </button>

              <span
                className="font-sans tabular-nums tracking-tight text-xs font-bold px-1.5 min-w-[16px] text-center select-none"
                id={`qty-display-${itemId}`}
              >
                {quantity}
              </span>

              <button
                type="button"
                onClick={handleIncrement}
                aria-label="Increase quantity"
                className="h-5 w-5 grid place-items-center rounded-full hover:bg-white/20 active:scale-85 transition-transform"
                id={`button-inc-${itemId}`}
              >
                <Plus className="h-3 w-3 stroke-[2.5]" />
              </button>
            </motion.div>
          ) : (
            <motion.button
              key="add-button"
              type="button"
              onClick={handleAddClick}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
              className="h-7 w-7 rounded-full bg-[#F5EDE4] dark:bg-stone-800 text-[#1c1917] dark:text-[#fafaf9] border border-[#E8DDD0] dark:border-stone-700 hover:bg-[#1c1917] hover:text-white dark:hover:bg-stone-700 active:scale-90 transition-all flex items-center justify-center shadow-2xs select-none"
              id={`button-add-${itemId}`}
              aria-label={`Add item to order`}
            >
              <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className={`relative w-full h-8 overflow-hidden rounded-xl ${className}`}>
      <AnimatePresence mode="wait" initial={false}>
        {quantity > 0 ? (
          <motion.div
            key="stepper"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="h-8 w-full rounded-xl border border-stone-800 bg-[#1c1917] text-white flex items-center justify-between px-1.5 shadow-2xs"
            id={`stepper-container-${itemId}`}
          >
            <button
              type="button"
              onClick={handleDecrement}
              aria-label="Decrease quantity"
              className="h-6 w-6 grid place-items-center rounded-lg text-white hover:bg-white/20 active:scale-85 transition-transform"
              id={`button-dec-${itemId}`}
            >
              <Minus className="h-3 w-3 stroke-[2.5]" />
            </button>

            <span
              className="font-sans tabular-nums tracking-tight text-xs font-bold text-white px-1 select-none"
              id={`qty-display-${itemId}`}
            >
              {quantity}
            </span>

            <button
              type="button"
              onClick={handleIncrement}
              aria-label="Increase quantity"
              className="h-6 w-6 grid place-items-center rounded-lg text-white hover:bg-white/20 active:scale-85 transition-transform"
              id={`button-inc-${itemId}`}
            >
              <Plus className="h-3 w-3 stroke-[2.5]" />
            </button>
          </motion.div>
        ) : (
          <motion.button
            key="add-button"
            type="button"
            onClick={handleAddClick}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="h-8 w-full rounded-xl font-bold text-xs bg-[#1c1917] text-white hover:bg-stone-800 shadow-2xs active:scale-95 transition-all flex items-center justify-center gap-1 select-none"
            id={`button-add-${itemId}`}
            aria-label={`Add item to order`}
          >
            <Plus className="h-3 w-3 stroke-[2.5]" />
            <span>ADD</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
});

export default MorphingAddButton;
