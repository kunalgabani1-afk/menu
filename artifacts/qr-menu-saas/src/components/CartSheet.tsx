import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Minus, ArrowRight, ShoppingBag, Users, Loader2 } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import type { MultiplayerCartItem } from "@/hooks/useMultiplayerCart";

export interface CartSheetProps {
  isOpen: boolean;
  onClose: () => void;
  tableNumber: string;
  currency?: string;
  items: MultiplayerCartItem[];
  subtotal: number;
  taxes: number;
  grandTotal: number;
  totalItemsCount: number;
  activeDinersCount?: number;
  onUpdateQuantity: (cartItemId: string, delta: number) => void;
  onProceedToCheckout?: () => void;
  onConfirmOrder?: () => Promise<void> | void;
  isSubmitting?: boolean;
}

export function formatPrice(amount: number | string | undefined | null): string {
  const val = Number(amount) || 0;
  return Number.isInteger(val) ? val.toString() : val.toFixed(2);
}

export function CartSheet({
  isOpen,
  onClose,
  tableNumber = "04",
  currency = "₹",
  items = [],
  subtotal = 0,
  taxes = 0,
  grandTotal = 0,
  totalItemsCount = 0,
  activeDinersCount = 1,
  onUpdateQuantity,
  onProceedToCheckout,
  onConfirmOrder,
  isSubmitting = false,
}: CartSheetProps) {
  const formattedTableNumber = String(tableNumber || "1")
    .replace(/^Table\s*/i, "")
    .padStart(2, "0");

  const handleCheckout = async () => {
    triggerHaptic("doubleTick");
    if (onConfirmOrder) {
      await onConfirmOrder();
    } else if (onProceedToCheckout) {
      onProceedToCheckout();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center select-none">
          {/* 1. Backdrop: strictly above BottomNav (z-50) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/65 backdrop-blur-sm"
          />

          {/* 2. Slide-up Sheet: flex-col with structurally pinned footer */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 400) {
                triggerHaptic("selection");
                onClose();
              }
            }}
            className="relative z-50 w-full max-w-lg max-h-[85vh] h-auto flex flex-col rounded-t-3xl border-t border-[#ede4d8] dark:border-stone-800 bg-[#fafaf9] dark:bg-[#1c1917] shadow-2xl overflow-hidden"
            id="guest-cart-bottom-sheet"
          >
            {/* Grab Handle */}
            <div className="mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-stone-300 dark:bg-stone-700 shrink-0" />

            {/* Header (Pinned Top) */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-[#ede4d8] dark:border-stone-800/80 shrink-0">
              <div>
                <h3 className="font-serif text-lg sm:text-xl font-bold text-[#1c1917] dark:text-[#fafaf9]">
                  Table {formattedTableNumber} Cart
                </h3>
                <div className="flex items-center gap-2 text-xs text-[#8a7d73] dark:text-stone-400 mt-0.5">
                  <span>{totalItemsCount} {totalItemsCount === 1 ? "item" : "items"}</span>
                  {activeDinersCount > 1 && (
                    <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400 font-semibold">
                      <Users className="h-3 w-3" />
                      <span>{activeDinersCount} diners sharing</span>
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="h-8 w-8 rounded-full bg-stone-200/70 dark:bg-stone-800 flex items-center justify-center text-[#1c1917] dark:text-stone-300 hover:bg-stone-300 dark:hover:bg-stone-700 transition-colors active:scale-95"
                aria-label="Close cart"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable Body: Item list + Ledger breakdown with pb-32 fix */}
            <div className="flex-1 overflow-y-auto px-6 py-4 pb-32 space-y-4 no-scrollbar">
              {items.length === 0 ? (
                <div className="py-12 text-center text-[#8a7d73] dark:text-stone-400 space-y-2">
                  <ShoppingBag className="h-8 w-8 mx-auto opacity-40 text-amber-600" />
                  <p className="font-serif font-bold text-base text-[#1c1917] dark:text-[#fafaf9]">
                    Your table cart is empty
                  </p>
                  <p className="text-xs">
                    Explore dishes on the menu and tap [+ ADD] to start ordering.
                  </p>
                </div>
              ) : (
                <>
                  {/* Itemized List */}
                  <div className="space-y-3">
                    {items.map((item) => (
                      <div
                        key={item.cartItemId}
                        className="p-3.5 bg-white dark:bg-stone-900 rounded-2xl border border-[#ede4d8] dark:border-stone-800 flex items-start justify-between gap-3 shadow-xs"
                      >
                        <div className="flex-1 min-w-0">
                          <h4 className="font-serif font-bold text-sm text-[#1c1917] dark:text-[#fafaf9] leading-tight">
                            {item.name}
                          </h4>
                          <div className="text-xs font-semibold text-[#8a7d73] dark:text-stone-400 mt-0.5">
                            {currency}{item.price} each
                            {item.addedBy && (
                              <span className="ml-2 font-normal text-[11px] text-amber-800 dark:text-amber-400/90">
                                • {item.addedBy}
                              </span>
                            )}
                          </div>
                          {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                            <div className="text-[11px] text-amber-700 dark:text-amber-400 mt-1 space-y-0.5">
                              {item.selectedModifiers.map((mod, idx) => (
                                <div key={idx}>↳ {mod.optionName}</div>
                              ))}
                            </div>
                          )}
                          {item.specialInstructions && (
                            <div className="text-[10.5px] italic text-stone-500 mt-0.5">
                              Note: "{item.specialInstructions}"
                            </div>
                          )}
                        </div>

                        {/* Stepper Counter */}
                        <div className="flex items-center gap-1.5 bg-stone-100 dark:bg-stone-800 p-1 rounded-xl shrink-0 mt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic("tick");
                              onUpdateQuantity(item.cartItemId, -1);
                            }}
                            className="h-6 w-6 rounded-lg flex items-center justify-center hover:bg-white dark:hover:bg-stone-700 active:scale-90 text-[#1c1917] dark:text-[#fafaf9] transition-all"
                            aria-label={`Decrease ${item.name}`}
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="font-sans tabular-nums font-black text-xs px-1.5 text-[#1c1917] dark:text-[#fafaf9]">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic("tick");
                              onUpdateQuantity(item.cartItemId, 1);
                            }}
                            className="h-6 w-6 rounded-lg flex items-center justify-center hover:bg-white dark:hover:bg-stone-700 active:scale-90 text-[#1c1917] dark:text-[#fafaf9] transition-all"
                            aria-label={`Increase ${item.name}`}
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Financial Ledger (Subtotal & GST Breakdown) */}
                  <div className="p-4 rounded-2xl bg-stone-100/70 dark:bg-stone-900/60 border border-[#ede4d8] dark:border-stone-800 space-y-1.5 text-xs text-[#8a7d73] dark:text-stone-400">
                    <div className="flex items-center justify-between">
                      <span>Items Subtotal</span>
                      <span className="font-sans tabular-nums font-semibold text-[#1c1917] dark:text-[#fafaf9]">
                        {currency}{formatPrice(subtotal)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Taxes &amp; Statutory GST (5%)</span>
                      <span className="font-sans tabular-nums font-semibold text-[#1c1917] dark:text-[#fafaf9]">
                        {currency}{formatPrice(taxes)}
                      </span>
                    </div>
                    <div className="border-t border-[#ede4d8] dark:border-stone-800 pt-2 flex items-center justify-between font-serif font-black text-sm text-[#1c1917] dark:text-[#fafaf9]">
                      <span>Table Estimated Total</span>
                      <span className="font-sans tabular-nums text-base text-amber-700 dark:text-amber-300">
                        {currency}{formatPrice(grandTotal)}
                      </span>
                    </div>
                  </div>

                  {/* Spacer Div so the user can scroll well above the footer */}
                  <div className="h-6 shrink-0" />
                </>
              )}
            </div>

            {/* Structurally Pinned Fixed Footer (Module 1 Fix) */}
            {items.length > 0 && (
              <div className="shrink-0 border-t border-[#ede4d8] dark:border-stone-800 bg-[#fafaf9] dark:bg-[#1c1917] p-4 sm:p-5 pb-safe z-10 shadow-[0_-8px_20px_rgba(0,0,0,0.06)]">
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={isSubmitting}
                  className="w-full h-13 sm:h-14 rounded-2xl bg-[#1c1917] hover:bg-[#2a2421] active:scale-[0.98] text-[#fafaf9] shadow-xl border border-amber-900/40 flex items-center justify-between px-5 transition-all duration-200 group disabled:opacity-85"
                  id="btn-cart-sheet-pinned-checkout"
                  aria-label={`Confirm and place order of ${totalItemsCount} items for ${currency}${formatPrice(grandTotal)}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center font-sans tabular-nums text-xs font-black shadow-xs shrink-0">
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin text-stone-950" />
                      ) : (
                        totalItemsCount
                      )}
                    </div>
                    <div className="text-left leading-tight">
                      <span className="text-[10px] font-bold uppercase tracking-wider block text-amber-400">
                        {isSubmitting ? "Processing" : "Table & Kitchen Approval"}
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-white group-hover:text-amber-200 transition-colors">
                        {isSubmitting ? "Submitting for Approval…" : "Confirm & Place Order"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-sans tabular-nums tracking-tight font-black text-sm sm:text-base text-amber-300">
                      {currency}{formatPrice(grandTotal)}
                    </span>
                    <div className="h-7 w-7 rounded-xl bg-white/10 group-hover:bg-amber-500/20 text-white group-hover:text-amber-300 flex items-center justify-center transition-colors">
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin text-amber-300" />
                      ) : (
                        <ArrowRight className="h-4 w-4 stroke-[2.5]" />
                      )}
                    </div>
                  </div>
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default CartSheet;
