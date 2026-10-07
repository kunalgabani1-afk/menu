import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Heart, Plus, Minus, AlertCircle, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFoodImage } from "@/lib/foodImageFallbacks";
import { haptic } from "@/lib/haptics";

export interface CanonicalModifierOption {
  id: string;
  name: string;
  priceAdjustment?: number;
  price?: number;
  available?: boolean;
  isDefault?: boolean;
}

export interface CanonicalModifierGroup {
  id: string;
  name: string;
  description?: string;
  selectionType?: "single" | "multiple" | string;
  required?: boolean;
  minSelections?: number;
  maxSelections?: number;
  options: CanonicalModifierOption[];
}

export interface SelectedModifier {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  price: number;
}

export interface ItemModifiers {
  spiceLevel?: "Mild" | "Medium" | "Spicy" | "Extra Spicy";
  prepStyle?: "Standard" | "Less Oil" | "Crispy" | "Extra Sauce";
  dietary?: "Standard" | "Jain (No Onion/Garlic)" | "Gluten Conscious" | "Vegan";
  addOns?: Array<{ name: string; price: number }>;
  specialInstructions?: string;
  customizations?: SelectedModifier[];
}

interface ItemModifierModalProps {
  isOpen: boolean;
  item: {
    id: string;
    name: string;
    price: number;
    description?: string;
    imageUrl?: string | null;
    veg?: boolean;
    isJain?: boolean;
    badge?: string | null;
    isBestseller?: boolean;
    rating?: number | null;
    reviewCount?: number;
    modifierGroupIds?: string[];
    disabledModifierGroupIds?: string[];
    categoryId?: string;
  } | null;
  category?: {
    id: string;
    name: string;
    modifierGroupIds?: string[];
  } | null;
  modifierGroups?: CanonicalModifierGroup[];
  currency?: string;
  isDark?: boolean;
  onClose: () => void;
  onAddToCart: (
    item: any,
    modifiers: ItemModifiers,
    quantity: number,
    calculatedUnitPrice: number,
    selectedModifiers?: SelectedModifier[]
  ) => void;
}

function getInitialItemSelections(item?: MenuItemData | null, groups: CanonicalModifierGroup[] = []): Record<string, string[]> {
  if (!item) return {};
  const initial: Record<string, string[]> = {};
  for (const group of groups) {
    const isSingle = group.selectionType === "single" || group.maxSelections === 1;
    const defaultOptions = group.options.filter((o) => o.isDefault && o.available !== false);

    if (defaultOptions.length > 0) {
      initial[group.id] = isSingle ? [defaultOptions[0].id] : defaultOptions.map((o) => o.id);
    } else if (group.required || (group.minSelections && group.minSelections > 0)) {
      const firstAvail = group.options.find((o) => o.available !== false);
      if (firstAvail && isSingle) {
        initial[group.id] = [firstAvail.id];
      } else {
        initial[group.id] = [];
      }
    } else {
      initial[group.id] = [];
    }
  }

  if (item.isJain && initial["default_dietary"]) {
    initial["default_dietary"] = ["dt_jain"];
  }
  return initial;
}

export function ItemModifierModal({
  isOpen,
  item,
  category,
  modifierGroups = [],
  currency = "₹",
  isDark = false,
  onClose,
  onAddToCart,
}: ItemModifierModalProps) {
  // Determine active modifier groups for this item (Category inherited + Item direct, minus disabled)
  const activeGroups = useMemo<CanonicalModifierGroup[]>(() => {
    if (!item) return [];

    const itemGroupIds = Array.isArray(item.modifierGroupIds) ? item.modifierGroupIds : [];
    const disabledIds = Array.isArray((item as any).disabledModifierGroupIds) ? (item as any).disabledModifierGroupIds : [];
    const catGroupIds = Array.isArray(category?.modifierGroupIds) ? category.modifierGroupIds : [];

    const effectiveIds = Array.from(
      new Set([
        ...catGroupIds.filter((id: string) => !disabledIds.includes(id)),
        ...itemGroupIds,
      ])
    );

    return modifierGroups.filter((g) => effectiveIds.includes(g.id));
  }, [item?.id, category?.id, modifierGroups]);

  const [selectedMap, setSelectedMap] = useState<Record<string, string[]>>(() =>
    getInitialItemSelections(item, activeGroups)
  );
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [isLiked, setIsLiked] = useState(false);
  const prevItemIdRef = React.useRef(item?.id);

  // Synchronously reset state if item changes without secondary useEffect layout shifts
  if (prevItemIdRef.current !== item?.id) {
    prevItemIdRef.current = item?.id;
    if (item) {
      setSelectedMap(getInitialItemSelections(item, activeGroups));
      setSpecialInstructions("");
      setQuantity(1);
      setIsLiked(false);
    }
  }

  // Lock body scroll while customization modal is open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !item) return null;

  const handleSelectSingle = (groupId: string, optionId: string) => {
    haptic("selection");
    setSelectedMap((prev) => ({
      ...prev,
      [groupId]: [optionId],
    }));
  };

  const handleToggleMultiple = (groupId: string, optionId: string, maxAllowed: number = 999) => {
    haptic("selection");
    setSelectedMap((prev) => {
      const current = prev[groupId] || [];
      if (current.includes(optionId)) {
        return {
          ...prev,
          [groupId]: current.filter((id) => id !== optionId),
        };
      } else {
        if (current.length >= maxAllowed) {
          if (maxAllowed === 1) {
            return { ...prev, [groupId]: [optionId] };
          }
          return prev;
        }
        return {
          ...prev,
          [groupId]: [...current, optionId],
        };
      }
    });
  };

  let modifiersUnitPrice = 0;
  const canonicalSelectedModifiers: SelectedModifier[] = [];

  for (const group of activeGroups) {
    const selectedIds = selectedMap[group.id] || [];
    for (const optId of selectedIds) {
      const opt = group.options.find((o) => o.id === optId);
      if (opt) {
        const priceAdj = Number(opt.priceAdjustment !== undefined ? opt.priceAdjustment : (opt.price || 0));
        modifiersUnitPrice += Math.max(0, priceAdj);
        canonicalSelectedModifiers.push({
          groupId: group.id,
          groupName: group.name,
          optionId: opt.id,
          optionName: opt.name,
          price: priceAdj,
        });
      }
    }
  }

  const basePrice = Number(item.price || 0);
  const unitPrice = Math.round((basePrice + modifiersUnitPrice) * 100) / 100;
  const totalPrice = Math.round(unitPrice * quantity * 100) / 100;

  const validationErrors: string[] = [];
  for (const group of activeGroups) {
    const isRequired = group.required || (group.minSelections && group.minSelections > 0);
    const minNeeded = group.minSelections || (group.required ? 1 : 0);
    const selectedCount = (selectedMap[group.id] || []).length;

    if (isRequired && selectedCount < minNeeded) {
      validationErrors.push(`Please choose an option for "${group.name}".`);
    }
  }

  const isValid = validationErrors.length === 0;

  const handleConfirm = () => {
    if (!isValid) return;

    const spiceMod = canonicalSelectedModifiers.find((m) =>
      m.groupName.toLowerCase().includes("spice")
    );
    let mappedSpice: ItemModifiers["spiceLevel"] = "Medium";
    if (spiceMod) {
      if (spiceMod.optionName.toLowerCase().includes("mild")) mappedSpice = "Mild";
      else if (spiceMod.optionName.toLowerCase().includes("extra")) mappedSpice = "Extra Spicy";
      else if (spiceMod.optionName.toLowerCase().includes("spicy")) mappedSpice = "Spicy";
      else mappedSpice = "Medium";
    }

    const prepMod = canonicalSelectedModifiers.find((m) =>
      m.groupName.toLowerCase().includes("prep") || m.groupName.toLowerCase().includes("style")
    );
    let mappedPrep: ItemModifiers["prepStyle"] = "Standard";
    if (prepMod) {
      if (prepMod.optionName.toLowerCase().includes("oil")) mappedPrep = "Less Oil";
      else if (prepMod.optionName.toLowerCase().includes("crisp")) mappedPrep = "Crispy";
      else if (prepMod.optionName.toLowerCase().includes("sauce") || prepMod.optionName.toLowerCase().includes("gravy")) mappedPrep = "Extra Sauce";
    }

    const dietMod = canonicalSelectedModifiers.find((m) =>
      m.groupName.toLowerCase().includes("diet")
    );
    let mappedDiet: ItemModifiers["dietary"] = "Standard";
    if (dietMod) {
      if (dietMod.optionName.toLowerCase().includes("jain")) mappedDiet = "Jain (No Onion/Garlic)";
      else if (dietMod.optionName.toLowerCase().includes("vegan")) mappedDiet = "Vegan";
      else if (dietMod.optionName.toLowerCase().includes("gluten")) mappedDiet = "Gluten Conscious";
    }

    const legacyAddons = canonicalSelectedModifiers
      .filter((m) => m.price > 0 && !m.groupName.toLowerCase().includes("size"))
      .map((m) => ({ name: m.optionName, price: m.price }));

    const modifiers: ItemModifiers = {
      spiceLevel: mappedSpice,
      prepStyle: mappedPrep,
      dietary: mappedDiet,
      addOns: legacyAddons,
      specialInstructions: specialInstructions.trim() || undefined,
      customizations: canonicalSelectedModifiers,
    };

    onAddToCart(item, modifiers, quantity, unitPrice, canonicalSelectedModifiers);
    onClose();
  };

  const foodImageUrl = getFoodImage(item.name, undefined, item.imageUrl);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 bg-black/60 animate-in fade-in duration-150"
      id="item-modifier-sheet"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0.95 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        style={{ willChange: "transform, opacity", transform: "translate3d(0, 0, 0)" }}
        className={`w-full max-w-md h-[92vh] sm:h-[86vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-[#E8DDD0] dark:border-stone-800 shadow-2xl overflow-hidden relative transform-gpu ${
          isDark ? "bg-[#1C1A18] text-[#FBF8F2]" : "bg-[#FAF6F0] text-[#241B16]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Swipe Drag Handle */}
        <div className="absolute top-2 inset-x-0 z-30 flex justify-center pointer-events-none">
          <div className="w-12 h-1.5 rounded-full bg-white/80 shadow-md" />
        </div>

        {/* Top Dish Hero Image (~32-35% of detail view height) */}
        <div className="relative h-48 sm:h-56 w-full shrink-0 overflow-hidden bg-[#FAF6F0] dark:bg-stone-900">
          <img
            src={foodImageUrl}
            alt={item.name}
            className="h-full w-full object-cover"
          />
          {/* Subtle gradient overlay at top for button contrast */}
          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/50 to-transparent pointer-events-none" />

          {/* Floating Back Button (Left) */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 left-4 h-10 w-10 rounded-full bg-white/95 text-[#241B16] shadow-md flex items-center justify-center hover:bg-white active:scale-95 transition-all"
            id="button-modifier-back"
            aria-label="Back to menu"
          >
            <ChevronLeft className="h-5 w-5 stroke-[2.5]" />
          </button>

          {/* Floating Heart Favorite Button (Right) */}
          <button
            type="button"
            onClick={() => setIsLiked(!isLiked)}
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/95 text-[#241B16] shadow-md flex items-center justify-center hover:bg-white active:scale-95 transition-all"
            id="button-modifier-like"
            aria-label="Favorite item"
          >
            <Heart className={`h-5 w-5 ${isLiked ? "fill-rose-500 text-rose-500" : "text-[#5A351F]"}`} />
          </button>
        </div>

        {/* Scrollable Customization Content (No visible scrollbar) */}
        <div className="flex-1 overflow-y-auto no-scrollbar scrollbar-none px-5 py-4 space-y-5 bg-white dark:bg-[#1E1C1A] rounded-t-3xl -mt-5 relative z-10 shadow-lg">
          {/* Dish Title, Veg Tag, Price */}
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`h-4 w-4 rounded-xs border p-0.5 shrink-0 flex items-center justify-center ${
                    item.veg ? "border-emerald-600 text-emerald-600" : "border-red-700 text-red-700"
                  }`}
                >
                  <span
                    className={`block h-full w-full rounded-full ${
                      item.veg ? "bg-emerald-600" : "bg-red-700"
                    }`}
                  />
                </span>
                <h2 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-[#241B16] dark:text-[#FBF8F2]">
                  {item.name}
                </h2>
              </div>

              <div className="font-mono text-xl font-bold text-[#241B16] dark:text-[#FBF8F2] shrink-0">
                {currency}{unitPrice}
              </div>
            </div>

            {/* Description */}
            <p className="mt-1.5 text-xs text-[#776B62] leading-relaxed">
              {item.description || "Freshly handcrafted with authentic ingredients and aromatic spices, prepared to order."}
            </p>

            {/* Rating & Bestseller Badges */}
            <div className="flex items-center gap-2 mt-2.5">
              <div className="flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-900/60">
                <span>★</span>
                <span>4.8</span>
                <span className="text-[#776B62] text-[10px] font-normal">(124)</span>
              </div>

              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#C99A55]/15 text-[#6B4226] dark:text-[#C99A55] border border-[#C99A55]/30">
                👑 Bestseller
              </span>
            </div>
          </div>

          <div className="h-px bg-[#E8DDD0] dark:bg-stone-800" />

          {/* Modifier Groups (Spice Level, Prep Style, Dietary, etc.) */}
          {activeGroups.map((group) => {
            const isSingle = group.selectionType === "single" || group.maxSelections === 1;
            const isRequired = group.required || (group.minSelections && group.minSelections > 0);
            const selectedIds = selectedMap[group.id] || [];
            const maxAllowed = group.maxSelections || (isSingle ? 1 : 999);

            return (
              <div key={group.id} className="space-y-3" id={`modifier-group-${group.id}`}>
                {/* Group Title & Rules */}
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-[#241B16] dark:text-[#FBF8F2]">
                      {group.name}
                    </h3>
                    <span
                      className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md ${
                        isRequired
                          ? "bg-[#EDE4D8] text-[#5A351F] dark:bg-stone-800 dark:text-amber-300"
                          : "bg-[#F5EFE6] text-[#776B62] dark:bg-stone-800 dark:text-stone-400"
                      }`}
                    >
                      {isRequired ? "REQUIRED" : "OPTIONAL"}
                    </span>
                  </div>
                  {group.description && (
                    <p className="text-xs text-[#776B62] mt-0.5">{group.description}</p>
                  )}
                </div>

                {/* Options List */}
                <div className="space-y-2">
                  {group.options.map((opt) => {
                    const isSelected = selectedIds.includes(opt.id);
                    const isSoldOut = opt.available === false;
                    const priceAdj = Number(opt.priceAdjustment !== undefined ? opt.priceAdjustment : (opt.price || 0));

                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={isSoldOut}
                        onClick={() => {
                          if (isSoldOut) return;
                          if (isSingle) {
                            handleSelectSingle(group.id, opt.id);
                          } else {
                            handleToggleMultiple(group.id, opt.id, maxAllowed);
                          }
                        }}
                        id={`option-${group.id}-${opt.id}`}
                        className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl border text-left transition-all ${
                          isSoldOut
                            ? "opacity-50 cursor-not-allowed bg-stone-100 dark:bg-stone-900 border-stone-200"
                            : isSelected
                            ? "border-[#6B4226] bg-[#F7F1E8] dark:bg-[#2C241E] text-[#241B16] dark:text-white"
                            : "border-[#E8DDD0] dark:border-stone-800 bg-white dark:bg-[#1E1C1A] hover:bg-[#FAF6F0] text-[#241B16] dark:text-stone-300"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 pr-2">
                          {/* Circular Radio Indicator */}
                          <div
                            className={`h-5 w-5 shrink-0 rounded-full border flex items-center justify-center transition-all ${
                              isSelected
                                ? "border-[#5A351F] dark:border-[#C99A55]"
                                : "border-[#D5C7B8] dark:border-stone-700"
                            }`}
                          >
                            {isSelected && (
                              <div className="h-2.5 w-2.5 rounded-full bg-[#5A351F] dark:bg-[#C99A55]" />
                            )}
                          </div>

                          <span className={`text-xs ${isSelected ? "font-bold text-[#241B16] dark:text-white" : "font-medium text-[#241B16] dark:text-stone-300"}`}>
                            {opt.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 font-mono text-xs">
                          {isSoldOut ? (
                            <span className="text-[10px] text-stone-400 font-semibold uppercase">
                              Sold Out
                            </span>
                          ) : (
                            <span className={`${isSelected ? "font-bold text-[#5A351F] dark:text-[#C99A55]" : "text-[#776B62]"}`}>
                              {priceAdj > 0 ? `+${currency}${priceAdj}` : "Free"}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Add a Note (Optional) */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-[#241B16] dark:text-[#FBF8F2] flex items-center gap-1.5">
                <span>📝 Add a Note</span>
              </label>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-[#F5EFE6] text-[#776B62] dark:bg-stone-800 dark:text-stone-400">
                OPTIONAL
              </span>
            </div>
            <input
              type="text"
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value.slice(0, 150))}
              placeholder="E.g. No onions, extra spicy..."
              maxLength={150}
              id="input-modifier-special-note"
              className="w-full h-11 px-3.5 text-xs rounded-2xl border border-[#E8DDD0] dark:border-stone-800 bg-white dark:bg-stone-900 text-[#241B16] dark:text-[#FBF8F2] focus:outline-none focus:ring-1 focus:ring-[#5A351F] placeholder:text-[#8C7D73]"
            />
          </div>
        </div>

        {/* Sticky Bottom Bar: Stepper & Add to Order Button */}
        <div className="p-4 border-t border-[#E8DDD0] dark:border-stone-800 bg-[#FAF6F0] dark:bg-[#1C1A18] shrink-0 space-y-2.5">
          {validationErrors.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-red-700 dark:text-red-400 font-medium">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{validationErrors[0]}</span>
            </div>
          )}

          <div className="flex items-center gap-3">
            {/* Stepper [ − ] 1 [ + ] */}
            <div className="flex items-center rounded-2xl border border-[#E8DDD0] dark:border-stone-800 bg-white dark:bg-stone-900 h-12 px-2 shadow-2xs shrink-0">
              <button
                type="button"
                onClick={() => {
                  haptic("selection");
                  setQuantity((q) => Math.max(1, q - 1));
                }}
                className="h-8 w-8 flex items-center justify-center rounded-xl text-[#241B16] dark:text-[#FBF8F2] hover:bg-[#FAF6F0] active:scale-95 transition-all"
                id="button-modifier-qty-dec"
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center font-bold text-sm font-mono text-[#241B16] dark:text-[#FBF8F2]">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => {
                  haptic("selection");
                  setQuantity((q) => Math.min(10, q + 1));
                }}
                className="h-8 w-8 flex items-center justify-center rounded-xl text-[#241B16] dark:text-[#FBF8F2] hover:bg-[#FAF6F0] active:scale-95 transition-all"
                id="button-modifier-qty-inc"
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {/* Add to Order Button */}
            <Button
              type="button"
              disabled={!isValid}
              onClick={() => {
                haptic("light");
                handleConfirm();
              }}
              className="flex-1 h-12 rounded-2xl font-bold text-sm bg-[#1c1917] hover:bg-stone-800 text-white shadow-md disabled:opacity-50 transition-all flex items-center justify-between px-5"
              id="button-modifier-confirm-add"
            >
              <span>{isValid ? "Add to Order" : "Select required"}</span>
              <span className="font-mono text-sm font-bold">
                {currency}{totalPrice}
              </span>
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
