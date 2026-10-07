import React, { useState, useEffect, useRef } from "react";
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Users,
  Utensils,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  subscribeToGuestPendingOrder,
  bypassPendingHostOrder,
  type PendingHostApprovalOrder,
} from "@/lib/groupTab";

interface GuestSocialPromptModalProps {
  pendingOrder: PendingHostApprovalOrder;
  restaurantSlug: string;
  tableSlugOrId: string;
  isDark?: boolean;
  onOrderApproved: (orderId: string) => void;
  onOrderBypassed: (orderId: string) => void;
  onOrderRejected: () => void;
  onClose: () => void;
}

export function GuestSocialPromptModal({
  pendingOrder,
  restaurantSlug,
  tableSlugOrId,
  isDark = false,
  onOrderApproved,
  onOrderBypassed,
  onOrderRejected,
  onClose,
}: GuestSocialPromptModalProps) {
  const [secondsLeft, setSecondsLeft] = useState<number>(60);
  const [orderStatus, setOrderStatus] = useState<
    "WAITING_FOR_HOST" | "APPROVED" | "BYPASSED" | "REJECTED"
  >("WAITING_FOR_HOST");
  const [confirmedOrderId, setConfirmedOrderId] = useState<string>(pendingOrder.orderId || "");
  const bypassTriggeredRef = useRef<boolean>(false);

  const hostName = pendingOrder.hostName || "your table host";
  const guestName = pendingOrder.guestName || "You";
  const tableNumber = pendingOrder.tableNumber || "01";

  // 1. Listen for real-time Firestore updates on this pending order
  useEffect(() => {
    const unsub = subscribeToGuestPendingOrder(
      restaurantSlug,
      tableSlugOrId,
      pendingOrder.id,
      (updated) => {
        if (!updated) return;

        if (updated.status === "APPROVED") {
          setOrderStatus("APPROVED");
          if (updated.orderId) setConfirmedOrderId(updated.orderId);
          setTimeout(() => {
            onOrderApproved(updated.orderId || pendingOrder.id);
          }, 2400);
        } else if (updated.status === "REJECTED") {
          setOrderStatus("REJECTED");
          setTimeout(() => {
            onOrderRejected();
          }, 3500);
        } else if (updated.status === "BYPASSED_TIMEOUT") {
          setOrderStatus("BYPASSED");
          if (updated.orderId) setConfirmedOrderId(updated.orderId);
          setTimeout(() => {
            onOrderBypassed(updated.orderId || pendingOrder.id);
          }, 3000);
        }
      }
    );

    return () => unsub();
  }, [restaurantSlug, tableSlugOrId, pendingOrder.id, onOrderApproved, onOrderBypassed, onOrderRejected]);

  // 2. Strict 60-Second Countdown & Automatic Kitchen Bypass
  useEffect(() => {
    if (orderStatus !== "WAITING_FOR_HOST") return;

    const initialDiff = Math.max(0, Math.ceil((pendingOrder.expiresAt - Date.now()) / 1000));
    setSecondsLeft(initialDiff > 0 ? initialDiff : 60);

    const timer = setInterval(async () => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleTriggerBypass();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [orderStatus, pendingOrder.expiresAt]);

  const handleTriggerBypass = async () => {
    if (bypassTriggeredRef.current) return;
    bypassTriggeredRef.current = true;
    setOrderStatus("BYPASSED");

    try {
      const res = await bypassPendingHostOrder(restaurantSlug, tableSlugOrId, pendingOrder.id);
      if (res.orderId) setConfirmedOrderId(res.orderId);
      setTimeout(() => {
        onOrderBypassed(res.orderId || pendingOrder.id);
      }, 3500);
    } catch (err) {
      console.error("[GuestSocialPrompt] Failed to bypass:", err);
      setTimeout(() => {
        onOrderBypassed(pendingOrder.id);
      }, 3500);
    }
  };

  const progressPercent = Math.max(0, Math.min(100, (secondsLeft / 60) * 100));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      id="guest-social-prompt-modal"
    >
      <div
        className={`w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden text-center transition-all ${
          isDark
            ? "border-stone-800 bg-[#141211] text-[#FBF8F2]"
            : "border-[#E8DDD0] bg-[#FAF6F0] text-[#241B16]"
        }`}
      >
        {/* State 1: WAITING FOR HOST (The "Social Prompt" UX) */}
        {orderStatus === "WAITING_FOR_HOST" && (
          <div className="p-6 sm:p-8 space-y-6">
            {/* Animated Status Icon & Circular Timer */}
            <div className="relative mx-auto flex h-28 w-28 items-center justify-center">
              <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  className="stroke-muted"
                  strokeWidth="8"
                  fill="transparent"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  className="stroke-amber-500 transition-all duration-1000 ease-linear"
                  strokeWidth="8"
                  strokeDasharray="264"
                  strokeDashoffset={264 - (264 * progressPercent) / 100}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl animate-pulse">⏳</span>
                <span className="font-mono text-sm font-black tabular-nums text-foreground mt-0.5">
                  {secondsLeft}s
                </span>
              </div>
            </div>

            {/* Massive Clear Social Prompt Copy */}
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-400">
                <Users className="h-3.5 w-3.5" />
                <span>Group Tab · Table {tableNumber}</span>
              </div>

              <h2 className="font-serif text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                Waiting for {hostName}
              </h2>

              <p className="text-sm font-medium leading-relaxed text-muted-foreground px-2">
                "Your order is pending. Tell <strong className="text-foreground">{hostName}</strong> to tap 'Approve' on their phone so the kitchen can start cooking!"
              </p>
            </div>

            {/* Item Preview Tray */}
            <div
              className={`rounded-2xl border p-3.5 text-left text-xs ${
                isDark ? "border-stone-800 bg-stone-900/60" : "border-[#E8DDD0] bg-white"
              }`}
            >
              <div className="flex items-center justify-between font-bold text-muted-foreground mb-1.5 pb-1 border-b border-border/50">
                <span>Adding to Table Tab</span>
                <span className="font-mono text-foreground">{pendingOrder.currency}{pendingOrder.totalAmount}</span>
              </div>
              <p className="font-medium text-foreground truncate">
                {pendingOrder.itemsSummary}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Ordered by: <strong>{guestName}</strong>
              </p>
            </div>

            {/* Edge-Case Handling Info Note */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-[11.5px] text-amber-800 dark:text-amber-300 flex items-start gap-2 text-left">
              <Clock className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                If {hostName} is away, this order will automatically forward to staff verification in {secondsLeft} seconds.
              </span>
            </div>
          </div>
        )}

        {/* State 2: APPROVED BY HOST */}
        {orderStatus === "APPROVED" && (
          <div className="p-8 space-y-5 animate-in zoom-in-95 duration-300">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-12 w-12" />
            </div>

            <div className="space-y-1.5">
              <h2 className="font-serif text-2xl sm:text-3xl font-black text-emerald-700 dark:text-emerald-400">
                Order Approved! 🎉
              </h2>
              <p className="text-sm font-medium text-muted-foreground">
                {hostName} approved your order. Kitchen is firing your dishes right now!
              </p>
            </div>

            <Button
              type="button"
              onClick={() => onOrderApproved(confirmedOrderId || pendingOrder.id)}
              className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-2"
            >
              <span>Track Order Status</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* State 3: 60-SECOND KITCHEN BYPASS (Edge Case Handling) */}
        {orderStatus === "BYPASSED" && (
          <div className="p-8 space-y-5 animate-in zoom-in-95 duration-300">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-11 w-11" />
            </div>

            <div className="space-y-2">
              <h2 className="font-serif text-xl sm:text-2xl font-bold text-foreground">
                Host unavailable. Sending to staff for quick verification.
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                60 seconds elapsed without host response. Your order has been routed to the staff and kitchen queue.
              </p>
            </div>

            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/15 p-3.5 text-xs text-amber-800 dark:text-amber-300 font-semibold flex items-center justify-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>Waitstaff will confirm with Table {tableNumber} in person.</span>
            </div>

            <Button
              type="button"
              onClick={() => onOrderBypassed(confirmedOrderId || pendingOrder.id)}
              className="w-full h-12 rounded-2xl bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 font-bold text-xs gap-2"
            >
              <span>Continue to Table Tab</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* State 4: REJECTED BY HOST */}
        {orderStatus === "REJECTED" && (
          <div className="p-8 space-y-5 animate-in zoom-in-95 duration-300">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-500/20 text-red-600 dark:text-red-400">
              <XCircle className="h-12 w-12" />
            </div>

            <div className="space-y-1.5">
              <h2 className="font-serif text-2xl font-black text-red-700 dark:text-red-400">
                Order Declined
              </h2>
              <p className="text-sm font-medium text-muted-foreground">
                {hostName} declined to add this order to the group table tab.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="w-full h-12 rounded-2xl font-bold text-xs"
            >
              Close
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default GuestSocialPromptModal;
