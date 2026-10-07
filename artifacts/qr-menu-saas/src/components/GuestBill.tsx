import React, { useState } from "react";
import { Receipt, CheckCircle2, Store, ArrowRight, Loader2, UtensilsCrossed } from "lucide-react";
import { motion } from "framer-motion";
import { triggerHaptic } from "@/lib/haptics";

export interface GuestBillItem {
  id?: string;
  name: string;
  quantity: number;
  price: number;
  modifiers?: string[];
  status?: string;
}

export interface GuestBillProps {
  tableNumber: string;
  currency?: string;
  items?: GuestBillItem[];
  onRequestFinalBill?: () => Promise<void> | void;
  onBrowseMenu?: () => void;
}

export function formatPrice(amount: number | string | undefined | null): string {
  const val = Number(amount) || 0;
  return Number.isInteger(val) ? val.toString() : val.toFixed(2);
}

export function GuestBill({
  tableNumber = "04",
  currency = "₹",
  items = [],
  onRequestFinalBill,
  onBrowseMenu,
}: GuestBillProps) {
  const [isRequested, setIsRequested] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestedTime, setRequestedTime] = useState<string | null>(null);

  const formattedTableNumber = String(tableNumber || "1")
    .replace(/^Table\s*/i, "")
    .padStart(2, "0");

  const hasItems = items && items.length > 0;
  const subtotal = Math.round(items.reduce((acc, it) => acc + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0) * 100) / 100;
  const cgst = Math.round(subtotal * 0.025 * 100) / 100;
  const sgst = Math.round(subtotal * 0.025 * 100) / 100;
  const totalGst = Math.round((cgst + sgst) * 100) / 100;
  const grandTotal = Math.round((subtotal + totalGst) * 100) / 100;

  const handleRequestBill = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(50);
      }
    } catch {
      // ignore
    }
    triggerHaptic("doubleTick");
    setIsSubmitting(true);
    try {
      if (onRequestFinalBill) {
        await onRequestFinalBill();
      }
      setIsRequested(true);
      setRequestedTime(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
      triggerHaptic("success");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 pt-1 animate-in fade-in duration-300 select-none pb-28">
      {/* High-End Country Club Receipt Ledger Card */}
      <div className="bg-white dark:bg-stone-900 shadow-sm ring-1 ring-stone-900/5 dark:ring-stone-800 rounded-xl p-6 sm:p-7 space-y-6">
        {/* Ledger Header */}
        <div className="text-center border-b border-dashed border-stone-300 dark:border-stone-800 pb-5 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#8a7d73] dark:text-stone-400 block">
            Tableline Hospitality Ledger
          </span>
          <h2 className="font-serif font-black text-2xl text-[#1c1917] dark:text-[#fafaf9] tracking-tight">
            Guest Dining Tab
          </h2>
          <div className="flex items-center justify-center gap-3 pt-1 text-xs text-[#8a7d73] dark:text-stone-400 font-medium">
            <span className="font-bold text-[#1c1917] dark:text-stone-200">Table {formattedTableNumber}</span>
            <span>•</span>
            <span>{new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
          </div>
        </div>

        {/* Empty State */}
        {!hasItems ? (
          <div className="py-10 text-center space-y-3">
            <div className="h-12 w-12 rounded-2xl bg-amber-500/10 text-amber-800 dark:text-amber-400 mx-auto flex items-center justify-center">
              <UtensilsCrossed className="h-6 w-6 stroke-[1.8]" />
            </div>
            <div className="space-y-1">
              <h3 className="font-serif font-bold text-base text-[#1c1917] dark:text-[#fafaf9]">
                Your table's tab is empty
              </h3>
              <p className="text-xs text-[#8a7d73] dark:text-stone-400 max-w-xs mx-auto leading-relaxed">
                Dishes fired to the kitchen will be itemized here on your running club ledger.
              </p>
            </div>
            {onBrowseMenu && (
              <button
                type="button"
                onClick={onBrowseMenu}
                className="mt-2 px-5 py-2 rounded-xl bg-[#1c1917] dark:bg-amber-400 text-white dark:text-stone-950 text-xs font-bold shadow-sm inline-flex items-center gap-1.5"
              >
                <span>Browse Menu</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Itemized Receipt Table with Dashed Dividers */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 pb-2">
                <span>Dish / Item</span>
                <span className="font-sans tabular-nums">Amount</span>
              </div>

              <div className="divide-y divide-dashed divide-stone-300 dark:divide-stone-800">
                {items.map((item, idx) => (
                  <div key={item.id || idx} className="py-3 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <span className="font-sans tabular-nums font-black text-xs text-amber-800 dark:text-amber-400 shrink-0 mt-0.5">
                        {item.quantity}×
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="font-serif font-bold text-sm text-[#1c1917] dark:text-[#fafaf9] block leading-snug">
                          {item.name}
                        </span>
                        {item.modifiers && item.modifiers.length > 0 && (
                          <div className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5 space-y-0.5 font-medium">
                            {item.modifiers.map((m, mi) => (
                              <div key={mi}>↳ {m.replace(/^↳\s*/, "")}</div>
                            ))}
                          </div>
                        )}
                        {item.status && (
                          <span className="inline-block mt-1 text-[9.5px] uppercase font-bold tracking-wider text-stone-400">
                            Status: {item.status}
                          </span>
                        )}
                      </div>
                    </div>

                    <span className="font-sans tabular-nums text-sm font-black text-[#1c1917] dark:text-[#fafaf9] shrink-0">
                      {currency}{formatPrice(item.price * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Summary Breakdown */}
            <div className="border-t border-dashed border-stone-300 dark:border-stone-800 pt-4 space-y-2 text-xs">
              <div className="flex items-center justify-between text-[#8a7d73] dark:text-stone-400">
                <span>Items Subtotal</span>
                <span className="font-sans tabular-nums font-semibold text-[#1c1917] dark:text-[#fafaf9]">
                  {currency}{formatPrice(subtotal)}
                </span>
              </div>

              <div className="flex items-center justify-between text-[#8a7d73] dark:text-stone-400">
                <span>Central GST (CGST 2.5%)</span>
                <span className="font-sans tabular-nums font-semibold text-[#1c1917] dark:text-[#fafaf9]">
                  {currency}{formatPrice(cgst)}
                </span>
              </div>

              <div className="flex items-center justify-between text-[#8a7d73] dark:text-stone-400">
                <span>State GST (SGST 2.5%)</span>
                <span className="font-sans tabular-nums font-semibold text-[#1c1917] dark:text-[#fafaf9]">
                  {currency}{formatPrice(sgst)}
                </span>
              </div>

              {/* Running Grand Total */}
              <div className="border-t-2 border-stone-900 dark:border-stone-100 pt-3 flex items-center justify-between font-serif font-black text-lg text-[#1c1917] dark:text-[#fafaf9]">
                <span>Total Due</span>
                <span className="font-sans tabular-nums text-xl text-amber-700 dark:text-amber-300 tracking-tight">
                  {currency}{formatPrice(grandTotal)}
                </span>
              </div>
            </div>

            {/* Cashier Counter Settlement Notice */}
            <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700/80 flex items-start gap-3">
              <Store className="h-5 w-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-[#776b62] dark:text-stone-300 leading-relaxed">
                <span className="font-bold text-[#1c1917] dark:text-[#fafaf9] block mb-0.5">
                  Counter Settlement (Cashier Desk)
                </span>
                Financial settlement is finalized directly at the cashier or with your floor captain. Choose between 100% Cash, 100% UPI, or Split Tender at checkout.
              </div>
            </div>

            {/* Call To Action: Massive Luxurious Button with Haptics */}
            <div className="pt-2">
              {isRequested ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-center space-y-2 shadow-xs"
                >
                  <div className="flex items-center justify-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <span>Bill Requested for Table {formattedTableNumber}</span>
                  </div>
                  <p className="text-xs text-[#776b62] dark:text-stone-300">
                    Floor dispatch received at {requestedTime}. Your captain is printing the official tax invoice.
                  </p>
                  <button
                    type="button"
                    onClick={handleRequestBill}
                    disabled={isSubmitting}
                    className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline pt-1 inline-block"
                  >
                    Tap to notify cashier again
                  </button>
                </motion.div>
              ) : (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleRequestBill}
                  className="w-full h-14 sm:h-16 rounded-2xl bg-[#1c1917] hover:bg-[#2a2421] active:scale-[0.98] text-[#fafaf9] text-sm sm:text-base font-serif font-black flex items-center justify-between px-6 shadow-2xl border border-amber-900/40 transition-all duration-200 group"
                  id="btn-request-final-bill-counter"
                  aria-label="Request Final Bill / Pay at Counter"
                >
                  <div className="flex items-center gap-3 text-left">
                    <div className="h-8.5 w-8.5 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center shrink-0">
                      <Receipt className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-sans font-bold tracking-wider block text-stone-400">
                        Dining Complete
                      </span>
                      <span className="text-sm font-bold text-white group-hover:text-amber-200 transition-colors">
                        Request Final Bill / Pay at Counter
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-amber-300">
                    {isSubmitting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <div className="h-8 w-8 rounded-xl bg-white/10 group-hover:bg-amber-500/20 flex items-center justify-center transition-colors">
                        <ArrowRight className="h-4 w-4 stroke-[2.5]" />
                      </div>
                    )}
                  </div>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default GuestBill;
