import React, { useState, useMemo } from "react";
import {
  X,
  CreditCard,
  Banknote,
  Smartphone,
  Split,
  CheckCircle2,
  AlertCircle,
  Receipt,
  ArrowRight,
  Calculator,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdvancedOrderTicket, PaymentBreakdown, GallaDailySummary } from "@/types/advancedPos";

interface SplitTenderModalProps {
  isOpen: boolean;
  order: {
    id: string;
    order_id?: string;
    orderNumber?: number | string;
    tableNumber: string | number;
    dinerFirstName?: string;
    total: number;
    total_bill?: number;
    items?: any[];
  } | null;
  currency?: string;
  isDark?: boolean;
  onClose: () => void;
  onSettleOrder: (settledPayload: {
    order_id: string;
    total_bill: number;
    status: "settled";
    payment_breakdown: {
      cash: number;
      upi: number;
      tenderType: "FULL_UPI" | "FULL_CASH" | "SPLIT";
      settledAt: string;
    };
  }) => Promise<void>;
}

type TenderMode = "FULL_UPI" | "FULL_CASH" | "SPLIT";

export function SplitTenderModal({
  isOpen,
  order,
  currency = "₹",
  isDark = false,
  onClose,
  onSettleOrder,
}: SplitTenderModalProps) {
  if (!isOpen || !order) return null;

  const totalBill = Number(order.total_bill ?? order.total ?? 0);
  const formattedOrderId = order.order_id || (order.orderNumber ? `T${String(order.tableNumber).padStart(2, "0")}_${order.orderNumber}` : order.id);

  const [tenderMode, setTenderMode] = useState<TenderMode>("FULL_UPI");
  const [cashInput, setCashInput] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Auto-Math Calculation
  const { cashAmount, upiRemaining, isExcessCash } = useMemo(() => {
    if (tenderMode === "FULL_UPI") {
      return { cashAmount: 0, upiRemaining: totalBill, isExcessCash: false };
    }
    if (tenderMode === "FULL_CASH") {
      return { cashAmount: totalBill, upiRemaining: 0, isExcessCash: false };
    }

    // Split Mode:
    const parsedCash = parseFloat(cashInput) || 0;
    const remaining = Math.max(0, Math.round((totalBill - parsedCash) * 100) / 100);
    const excess = parsedCash > totalBill;

    return {
      cashAmount: parsedCash,
      upiRemaining: remaining,
      isExcessCash: excess,
    };
  }, [tenderMode, cashInput, totalBill]);

  const handleCashInputChange = (val: string) => {
    // Only accept numeric input and at most one decimal point
    if (/^\d*\.?\d{0,2}$/.test(val) || val === "") {
      setCashInput(val);
      if (validationError) setValidationError(null);
    }
  };

  const handleConfirmSettlement = async () => {
    if (tenderMode === "SPLIT") {
      if (cashAmount <= 0) {
        setValidationError("Please enter cash received or choose 100% UPI.");
        return;
      }
      if (isExcessCash) {
        setValidationError(`Cash exceeds total bill of ${currency}${totalBill}. Return change or adjust cash received.`);
        return;
      }
      if (Math.abs(cashAmount + upiRemaining - totalBill) > 0.01) {
        setValidationError("Split tender amounts do not sum to total bill.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const settledPayload = {
        order_id: formattedOrderId,
        total_bill: totalBill,
        status: "settled" as const,
        payment_breakdown: {
          cash: tenderMode === "FULL_CASH" ? totalBill : tenderMode === "FULL_UPI" ? 0 : cashAmount,
          upi: tenderMode === "FULL_UPI" ? totalBill : tenderMode === "FULL_CASH" ? 0 : upiRemaining,
          tenderType: tenderMode,
          settledAt: new Date().toISOString(),
        },
      };

      await onSettleOrder(settledPayload);
      onClose();
    } catch (err: any) {
      setValidationError(err.message || "Failed to settle bill.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
      id="split-tender-modal"
    >
      <div
        className={`w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden text-left transition-all ${
          isDark
            ? "border-stone-800 bg-[#161412] text-[#FBF8F2]"
            : "border-[#E8DDD0] bg-[#FAF6F0] text-[#241B16]"
        }`}
      >
        {/* Top Header with Cafe Branding & Bill Anchor */}
        <div className="border-b border-[#E8DDD0] dark:border-stone-800 px-6 py-4 flex items-center justify-between bg-white dark:bg-[#1C1A18]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#6B4226]/10 text-[#6B4226] dark:bg-[#C99A55]/15 dark:text-[#C99A55]">
              <Calculator className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="font-serif text-base sm:text-lg font-bold tracking-tight text-[#241B16] dark:text-[#FBF8F2]">
                Bill Settlement &amp; Galla
              </h2>
              <p className="text-[11px] text-[#776B62] font-medium">
                Table {order.tableNumber} {order.dinerFirstName ? `(${order.dinerFirstName})` : ""} · {formattedOrderId}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-full border border-[#E8DDD0] dark:border-stone-800 flex items-center justify-center text-[#776B62] hover:bg-[#F5EFE6] dark:hover:bg-stone-800 transition-colors"
            id="close-split-tender-modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Total Bill Display Card (Zero-Jitter Tabular Nums) */}
        <div className="p-6 space-y-5">
          <div className="rounded-2xl border border-[#E8DDD0] dark:border-stone-800 bg-white dark:bg-stone-900 p-4 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-[#776B62] uppercase tracking-wider">
                Total Bill Payable
              </span>
              <p className="text-[11px] text-[#776B62] mt-0.5">Includes taxes &amp; active session charges</p>
            </div>
            <div className="text-right">
              <span className="font-sans tabular-nums tracking-tight text-3xl font-extrabold text-[#5A351F] dark:text-[#C99A55]">
                {currency}{totalBill.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Module 5: Three Tender Buttons */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#776B62] mb-2 block">
              Select Payment Tender
            </label>
            <div className="grid grid-cols-3 gap-2">
              {/* 100% UPI */}
              <button
                type="button"
                onClick={() => {
                  setTenderMode("FULL_UPI");
                  setCashInput("");
                  setValidationError(null);
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                  tenderMode === "FULL_UPI"
                    ? "border-emerald-600 bg-emerald-500/15 text-emerald-900 dark:text-emerald-300 font-bold shadow-xs ring-2 ring-emerald-500/40"
                    : "border-[#E8DDD0] dark:border-stone-800 bg-white dark:bg-stone-900 text-[#241B16] dark:text-stone-300 hover:bg-[#F5EFE6]"
                }`}
                id="btn-tender-100-upi"
              >
                <Smartphone className="h-4 w-4 mb-1 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs">100% UPI</span>
                <span className="text-[10px] opacity-75 font-sans tabular-nums mt-0.5">
                  {currency}{totalBill}
                </span>
              </button>

              {/* 100% CASH */}
              <button
                type="button"
                onClick={() => {
                  setTenderMode("FULL_CASH");
                  setCashInput("");
                  setValidationError(null);
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                  tenderMode === "FULL_CASH"
                    ? "border-amber-600 bg-amber-500/15 text-amber-900 dark:text-amber-300 font-bold shadow-xs ring-2 ring-amber-500/40"
                    : "border-[#E8DDD0] dark:border-stone-800 bg-white dark:bg-stone-900 text-[#241B16] dark:text-stone-300 hover:bg-[#F5EFE6]"
                }`}
                id="btn-tender-100-cash"
              >
                <Banknote className="h-4 w-4 mb-1 text-amber-600 dark:text-amber-400" />
                <span className="text-xs">100% CASH</span>
                <span className="text-[10px] opacity-75 font-sans tabular-nums mt-0.5">
                  {currency}{totalBill}
                </span>
              </button>

              {/* SPLIT PAYMENT */}
              <button
                type="button"
                onClick={() => {
                  setTenderMode("SPLIT");
                  setValidationError(null);
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                  tenderMode === "SPLIT"
                    ? "border-[#5A351F] bg-[#5A351F]/15 dark:bg-[#C99A55]/20 text-[#5A351F] dark:text-[#C99A55] font-bold shadow-xs ring-2 ring-[#5A351F]/40"
                    : "border-[#E8DDD0] dark:border-stone-800 bg-white dark:bg-stone-900 text-[#241B16] dark:text-stone-300 hover:bg-[#F5EFE6]"
                }`}
                id="btn-tender-split"
              >
                <Split className="h-4 w-4 mb-1 text-[#6B4226] dark:text-[#C99A55]" />
                <span className="text-xs">SPLIT</span>
                <span className="text-[10px] opacity-75 font-sans tabular-nums mt-0.5">
                  Auto-Math
                </span>
              </button>
            </div>
          </div>

          {/* Module 5: Auto-Math Dynamic Input Fields for Split Tender */}
          {tenderMode === "SPLIT" && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20 p-4 space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between text-xs font-bold text-[#5A351F] dark:text-amber-300">
                <span className="flex items-center gap-1.5">
                  <Calculator className="h-3.5 w-3.5" />
                  <span>Split Auto-Math Calculator</span>
                </span>
                <span className="text-[10px] font-semibold opacity-80">Instant Galla Sync</span>
              </div>

              {/* Input for Cash Received */}
              <div>
                <label
                  htmlFor="cash-received-input"
                  className="block text-xs font-semibold text-[#241B16] dark:text-stone-200 mb-1"
                >
                  Cash Received by Cashier ({currency})
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-sm font-bold text-muted-foreground">
                    {currency}
                  </span>
                  <input
                    id="cash-received-input"
                    type="text"
                    inputMode="decimal"
                    value={cashInput}
                    onChange={(e) => handleCashInputChange(e.target.value)}
                    placeholder="Enter cash (e.g. 200)"
                    autoFocus
                    className="w-full h-11 pl-8 pr-4 rounded-xl border border-[#E8DDD0] dark:border-stone-700 bg-white dark:bg-stone-800 text-sm font-bold text-[#241B16] dark:text-[#FBF8F2] outline-none focus:ring-2 focus:ring-amber-500 font-sans tabular-nums"
                  />
                </div>
              </div>

              {/* Locked "UPI Remaining" Dynamic Display */}
              <div className="rounded-xl border border-emerald-500/30 bg-white dark:bg-stone-900 p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                    <Lock className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                      Locked UPI Remaining
                    </p>
                    <p className="text-[10.5px] text-[#776B62]">Diner scans cafe dynamic QR for this exact amount</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-sans tabular-nums tracking-tight text-xl font-black text-emerald-700 dark:text-emerald-400">
                    {currency}{upiRemaining.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Validation Warning */}
          {validationError && (
            <div className="rounded-xl bg-red-500/15 border border-red-500/30 p-2.5 text-xs font-semibold text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Summary Breakdown Preview */}
          <div className="rounded-2xl border border-[#E8DDD0] dark:border-stone-800 bg-[#FAF6F0]/80 dark:bg-stone-900/60 p-3.5 text-xs space-y-1.5 font-medium">
            <div className="flex items-center justify-between text-[#776B62]">
              <span>Drawer Cash Addition:</span>
              <span className="font-sans tabular-nums font-bold text-[#241B16] dark:text-stone-200">
                {currency}{tenderMode === "FULL_CASH" ? totalBill.toFixed(2) : tenderMode === "FULL_UPI" ? "0.00" : cashAmount.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[#776B62]">
              <span>Bank UPI Addition:</span>
              <span className="font-sans tabular-nums font-bold text-[#241B16] dark:text-stone-200">
                {currency}{tenderMode === "FULL_UPI" ? totalBill.toFixed(2) : tenderMode === "FULL_CASH" ? "0.00" : upiRemaining.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Action Confirmation Button */}
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={handleConfirmSettlement}
            className="w-full h-12 rounded-2xl bg-[#5A351F] hover:bg-[#452715] text-white font-bold text-xs gap-2 shadow-md transition-all active:scale-98"
            id="btn-confirm-settlement"
          >
            {isSubmitting ? (
              <span>Settling Bill &amp; Syncing Galla…</span>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  Settle Bill ({currency}{totalBill.toFixed(2)})
                </span>
                <ArrowRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Module 5: Daily Galla Sync Javascript Reduce Function
 * Calculates end-of-day report by independently summing payment_breakdown.cash and payment_breakdown.upi.
 * Output: "Expected Cash in Drawer: ₹X | Total UPI in Bank: ₹Y"
 */
export function calculateDailyGallaReport(orders: AdvancedOrderTicket[]): {
  expectedCashInDrawer: number;
  totalUpiInBank: number;
  totalRevenue: number;
  settledOrdersCount: number;
  summaryText: string;
} {
  const result = (orders || []).reduce(
    (acc, order) => {
      // Only process settled orders
      if (order.status === "settled" || order.paymentStatus === "PAID" || order.paymentStatus === "settled") {
        const cashPortion = Number(order.payment_breakdown?.cash || 0);
        const upiPortion = Number(order.payment_breakdown?.upi || 0);

        // Fallback for orders settled prior to split tender support
        const fallbackCash =
          !order.payment_breakdown && (order as any).paymentMethod === "CASH" ? Number(order.total_bill || (order as any).total || 0) : 0;
        const fallbackUpi =
          !order.payment_breakdown && ((order as any).paymentMethod === "UPI" || (order as any).paymentMethod === "ONLINE")
            ? Number(order.total_bill || (order as any).total || 0)
            : 0;

        acc.expectedCashInDrawer += cashPortion || fallbackCash;
        acc.totalUpiInBank += upiPortion || fallbackUpi;
        acc.totalRevenue += (cashPortion || fallbackCash) + (upiPortion || fallbackUpi);
        acc.settledOrdersCount += 1;
      }
      return acc;
    },
    {
      expectedCashInDrawer: 0,
      totalUpiInBank: 0,
      totalRevenue: 0,
      settledOrdersCount: 0,
    }
  );

  const roundedCash = Math.round(result.expectedCashInDrawer * 100) / 100;
  const roundedUpi = Math.round(result.totalUpiInBank * 100) / 100;

  return {
    ...result,
    expectedCashInDrawer: roundedCash,
    totalUpiInBank: roundedUpi,
    summaryText: `Expected Cash in Drawer: ₹${roundedCash} | Total UPI in Bank: ₹${roundedUpi}`,
  };
}

export default SplitTenderModal;
