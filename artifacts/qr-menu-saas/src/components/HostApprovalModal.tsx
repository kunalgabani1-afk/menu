import React, { useState, useEffect } from "react";
import {
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  UtensilsCrossed,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PendingHostApprovalOrder } from "@/lib/groupTab";

interface HostApprovalModalProps {
  order: PendingHostApprovalOrder | null;
  isOpen: boolean;
  isDark?: boolean;
  loading?: boolean;
  onApprove: (pendingOrderId: string) => Promise<any>;
  onReject: (pendingOrderId: string, reason?: string) => Promise<any>;
  onClose: () => void;
}

export function HostApprovalModal({
  order,
  isOpen,
  isDark = false,
  loading = false,
  onApprove,
  onReject,
  onClose,
}: HostApprovalModalProps) {
  const [secondsLeft, setSecondsLeft] = useState<number>(60);
  const [submittingAction, setSubmittingAction] = useState<"approve" | "reject" | null>(null);

  useEffect(() => {
    if (!order || !isOpen) return;

    const calculateRemaining = () => {
      if (!order.expiresAt) return 60;
      const diff = Math.max(0, Math.ceil((order.expiresAt - Date.now()) / 1000));
      return diff;
    };

    setSecondsLeft(calculateRemaining());

    const timer = setInterval(() => {
      const remaining = calculateRemaining();
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        onClose();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [order, isOpen, onClose]);

  if (!isOpen || !order) return null;

  const guestName = order.guestName || "Someone";
  const itemsCount = order.items.reduce((s, i) => s + (i.quantity || 1), 0);
  const currency = order.currency || "₹";

  const handleApprove = async () => {
    setSubmittingAction("approve");
    try {
      await onApprove(order.id);
      onClose();
    } catch (err) {
      console.error("[HostApprovalModal] Error approving:", err);
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleReject = async () => {
    setSubmittingAction("reject");
    try {
      await onReject(order.id);
      onClose();
    } catch (err) {
      console.error("[HostApprovalModal] Error rejecting:", err);
    } finally {
      setSubmittingAction(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      id="host-approval-modal"
    >
      <div
        className={`w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden transition-all ${
          isDark
            ? "border-stone-800 bg-[#141211] text-[#FBF8F2]"
            : "border-[#E8DDD0] bg-[#FAF6F0] text-[#241B16]"
        }`}
      >
        {/* Header Alert Ribbon */}
        <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-white px-5 py-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 backdrop-blur-xs text-base">
              🔔
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-wider">Group Tab Request</p>
              <p className="text-[11px] opacity-90">Table {order.tableNumber} Host Verification</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-xs font-bold bg-black/20 px-2.5 py-1 rounded-full">
            <Clock className="h-3 w-3 animate-spin" />
            <span>{secondsLeft}s left</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          {/* Main Social Message */}
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 dark:bg-amber-500/5 p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1">
              Add-On Approval Needed
            </p>
            <h3 className="font-serif text-lg font-bold leading-snug text-foreground">
              {guestName} is trying to add {order.itemsSummary || `${itemsCount} item(s)`} to your table for {currency}{order.totalAmount}.
            </h3>
            <p className="text-xs text-muted-foreground mt-1.5">
              As the table host, approve this addition to fire it straight to the kitchen.
            </p>
          </div>

          {/* Itemized Checklist */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
              <span>Items to Add ({itemsCount})</span>
              <span>Subtotal</span>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
              {order.items.map((item, idx) => (
                <div
                  key={idx}
                  className={`flex items-start justify-between p-3 rounded-2xl border ${
                    isDark ? "border-stone-800 bg-stone-900/60" : "border-[#E8DDD0] bg-white"
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 font-mono">
                        {item.quantity}x
                      </span>
                      <span className="font-semibold text-xs text-foreground">{item.name}</span>
                    </div>
                    {item.specialInstructions && (
                      <p className="text-[11px] text-muted-foreground italic pl-6">
                        "{item.specialInstructions}"
                      </p>
                    )}
                  </div>
                  <span className="font-mono text-xs font-bold text-foreground">
                    {currency}{item.price * item.quantity}
                  </span>
                </div>
              ))}
            </div>

            {order.customerNote && (
              <div className="rounded-xl border border-border/80 bg-muted/40 p-2.5 text-xs text-muted-foreground">
                <span className="font-bold text-foreground">Note: </span>
                <span>{order.customerNote}</span>
              </div>
            )}
          </div>

          {/* Progress bar for 60s countdown */}
          <div className="space-y-1">
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-1000 ease-linear rounded-full"
                style={{ width: `${Math.max(0, Math.min(100, (secondsLeft / 60) * 100))}%` }}
              />
            </div>
            <p className="text-[10px] text-center text-muted-foreground">
              If unanswered, this order will automatically forward to staff verification.
            </p>
          </div>

          {/* Action Buttons: [Approve] or [Reject] */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              disabled={loading || submittingAction !== null}
              onClick={handleReject}
              className="h-12 rounded-2xl border-stone-300 dark:border-stone-700 hover:bg-red-50 hover:text-red-700 hover:border-red-300 dark:hover:bg-red-950/30 text-xs font-bold gap-1.5"
              id="button-host-reject"
            >
              <XCircle className="h-4 w-4" />
              <span>{submittingAction === "reject" ? "Rejecting..." : "Reject"}</span>
            </Button>

            <Button
              type="button"
              disabled={loading || submittingAction !== null}
              onClick={handleApprove}
              className="h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shadow-md shadow-emerald-600/20"
              id="button-host-approve"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{submittingAction === "approve" ? "Firing to Kitchen..." : "Approve Order"}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HostApprovalModal;
