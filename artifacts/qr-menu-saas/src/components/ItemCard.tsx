import React, { useState } from "react";
import { Plus, Minus, Sparkles, ChefHat, Flame, Leaf } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { triggerHaptic } from "@/lib/haptics";
import { LazyFoodImage } from "./LazyFoodImage";

export interface MenuItemCardData {
  id: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string | null;
  veg?: boolean;
  isJain?: boolean;
  isBestseller?: boolean;
  isChefsPick?: boolean;
  rating?: number | null;
  hasModifiers?: boolean;
  modifierGroupIds?: string[];
}

interface ItemCardProps {
  item: MenuItemCardData;
  quantity: number;
  currency?: string;
  addedByOther?: string | null; // e.g. "Vivek"
  onAdd: (item: MenuItemCardData) => void;
  onIncrement: (item: MenuItemCardData) => void;
  onDecrement: (item: MenuItemCardData) => void;
  onOpenCustomizer?: (item: MenuItemCardData) => void;
}

export function ItemCard({
  item,
  quantity,
  currency = "₹",
  addedByOther,
  onAdd,
  onIncrement,
  onDecrement,
  onOpenCustomizer,
}: ItemCardProps) {
  const isAdded = quantity > 0;
  const isVeg = item.veg !== false;

  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.hasModifiers && onOpenCustomizer && !isAdded) {
      triggerHaptic("tick");
      onOpenCustomizer(item);
      return;
    }
    triggerHaptic("tick");
    onAdd(item);
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic("soft");
    onIncrement(item);
  };

  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic("soft");
    onDecrement(item);
  };

  return (
    <div
      onClick={() => {
        if (item.hasModifiers && onOpenCustomizer) {
          triggerHaptic("tick");
          onOpenCustomizer(item);
        }
      }}
      className="group relative bg-[#FAF7F2] dark:bg-[#1A1816] rounded-3xl p-4 border border-[#EDE4D8] dark:border-stone-800 shadow-2xs hover:shadow-md transition-all duration-300 flex flex-col justify-between overflow-hidden cursor-pointer"
      id={`item-card-${item.id}`}
    >
      <div className="flex items-start justify-between gap-3.5">
        {/* Left Column: Dish Meta & Typography */}
        <div className="flex-1 min-w-0 pr-1">
          {/* Dietary & Highlight Badges */}
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            {/* Green Veg / Brown Non-Veg Indicator */}
            <div
              className={`h-4 w-4 rounded-md border flex items-center justify-center shrink-0 ${
                isVeg
                  ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40"
                  : "border-rose-700 bg-rose-50 dark:bg-rose-950/40"
              }`}
              title={isVeg ? "Vegetarian" : "Non-Vegetarian"}
            >
              <div
                className={`h-2 w-2 rounded-full ${
                  isVeg ? "bg-emerald-600" : "bg-rose-700 rounded-none transform rotate-45"
                }`}
              />
            </div>

            {item.isJain && (
              <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-200">
                JAIN
              </span>
            )}

            {item.isBestseller && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-[#3D2314] text-[#FAF7F2] flex items-center gap-1 shadow-2xs">
                <Sparkles className="h-2.5 w-2.5 text-amber-300" />
                Bestseller
              </span>
            )}

            {item.isChefsPick && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-amber-500 text-stone-950 flex items-center gap-1">
                <ChefHat className="h-2.5 w-2.5" />
                Chef's Pick
              </span>
            )}
          </div>

          {/* Dish Name: Classic Rich Serif Header */}
          <h3 className="font-serif text-base sm:text-lg font-bold text-[#241B16] dark:text-[#F7F4F0] leading-snug line-clamp-2 group-hover:text-amber-900 dark:group-hover:text-amber-300 transition-colors">
            {item.name}
          </h3>

          {/* Description */}
          {item.description && (
            <p className="text-xs text-[#776B62] dark:text-stone-400 mt-1 line-clamp-2 leading-relaxed">
              {item.description}
            </p>
          )}

          {/* Price: Strict tabular-nums tracking-tight */}
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <span className="text-xs font-bold text-[#8A7D73] dark:text-stone-400">
              {currency}
            </span>
            <span className="font-sans tabular-nums tracking-tight font-black text-lg text-[#241B16] dark:text-[#F7F4F0]">
              {item.price}
            </span>
            {item.hasModifiers && (
              <span className="text-[10.5px] font-medium text-amber-800 dark:text-amber-400">
                • Customizable
              </span>
            )}
          </div>

          {/* Multiplayer Attribution: Friend at Table Added this */}
          {addedByOther && (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded-full border border-amber-300/60 shadow-2xs">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                Added by {addedByOther}
              </span>
            </div>
          )}
        </div>

        {/* Right Column: Dish Photo with Overlay Pill */}
        <div className="relative shrink-0 flex flex-col items-center">
          <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl overflow-hidden shadow-sm border border-[#EDE4D8] dark:border-stone-800 bg-[#EFE7DC] dark:bg-stone-900">
            <LazyFoodImage
              src={item.imageUrl}
              alt={item.name}
              itemName={item.name}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </div>

          {/* Morphing Action Button (Module 1):
              Seamlessly morphs horizontally from [ + ADD ] into [ - | 1 | + ]
              without jumping or opening modals! */}
          <div className="absolute -bottom-3 z-10">
            <motion.div
              layout
              transition={{ type: "spring", stiffness: 500, damping: 35 }}
              className="flex items-center justify-center shadow-lg rounded-2xl overflow-hidden"
            >
              {!isAdded ? (
                // [+ ADD] State
                <motion.button
                  key="add-btn"
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={handleAddClick}
                  className="h-8 px-4 bg-[#FAF7F2] dark:bg-[#1A1816] text-[#241B16] dark:text-[#F7F4F0] border-2 border-[#3D2314] dark:border-stone-400 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 rounded-2xl hover:bg-[#3D2314] hover:text-[#FAF7F2] active:scale-95 transition-colors select-none"
                  id={`btn-add-${item.id}`}
                >
                  <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>ADD</span>
                </motion.button>
              ) : (
                // Morphing [ - | QTY | + ] State
                <motion.div
                  key="stepper-btn"
                  layout
                  initial={{ opacity: 0, width: 80 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="h-8 flex items-center bg-[#3D2314] text-[#FAF7F2] rounded-2xl border border-[#3D2314] px-1 shadow-md select-none"
                  id={`stepper-${item.id}`}
                >
                  <button
                    type="button"
                    onClick={handleDecrement}
                    className="h-7 w-7 rounded-xl flex items-center justify-center hover:bg-white/20 active:scale-90 transition-transform"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-3.5 w-3.5 stroke-[2.5]" />
                  </button>

                  <span className="font-sans tabular-nums tracking-tight font-black text-xs px-2.5 min-w-[20px] text-center">
                    {quantity}
                  </span>

                  <button
                    type="button"
                    onClick={handleIncrement}
                    className="h-7 w-7 rounded-xl flex items-center justify-center hover:bg-white/20 active:scale-90 transition-transform"
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                  </button>
                </motion.div>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ItemCard;
