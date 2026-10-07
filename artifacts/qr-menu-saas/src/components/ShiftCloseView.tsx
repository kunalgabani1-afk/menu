import React, { useState, useEffect, useMemo } from "react";
import {
  Scale,
  Calendar,
  Clock,
  User,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Lock,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Coins,
  Receipt,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getIdToken } from "@/lib/firebase";
import { useGetRestaurantDashboard } from "@workspace/api-client-react";
import { canUseFeature, normalizePlanId } from "@/lib/plans";
import { TablelineLoader } from "./TablelineLoading";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface ShiftCloseViewProps {
  slug: string;
  onNavigateTab?: (tab: string) => void;
}

interface CurrentShiftData {
  status: "OPEN";
  restaurantId: string;
  restaurantName: string;
  dateFormatted: string;
  timezone: string;
  currency: string;
  openedAt: string;
  expectedCash: number;
  cashOrdersCount: number;
  totalOrdersCount: number;
  lastClosedShift?: {
    shiftId: string;
    closedAt: string;
    closedBy: { name: string; email: string; role: string };
    expectedCash: number;
    countedCash: number;
    difference: number;
    discrepancyType: "MATCHED" | "SHORT" | "OVER";
  } | null;
}

interface HistoricalShift {
  id: string;
  shiftId: string;
  restaurantId: string;
  openedAt: string;
  closedAt: string;
  closedBy: {
    uid: string;
    name: string;
    email: string;
    role: string;
  };
  expectedCash: number;
  countedCash: number;
  difference: number;
  discrepancyType: "MATCHED" | "SHORT" | "OVER";
  notes?: string | null;
  status: "CLOSED";
  cashOrdersCount: number;
  currency: string;
}

export function ShiftCloseView({ slug, onNavigateTab }: ShiftCloseViewProps) {
  const { toast } = useToast();

  const { data: dashboard, refetch: refetchDashboard } = useGetRestaurantDashboard(slug);
  const restaurantPlan = normalizePlanId((dashboard as any)?.plan || (dashboard as any)?.restaurant?.plan);
  const isShiftCloseAllowed = canUseFeature(restaurantPlan, "shift_close");

  const [currentShift, setCurrentShift] = useState<CurrentShiftData | null>(null);
  const [shiftsHistory, setShiftsHistory] = useState<HistoricalShift[]>([]);
  const [loadingCurrent, setLoadingCurrent] = useState<boolean>(true);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(true);

  // Form input: Physical Cash Counted & Notes
  const [countedCashInput, setCountedCashInput] = useState<string>("");
  const [shiftNotes, setShiftNotes] = useState<string>("");

  // Confirmation Modal
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Detail Modal for historical shift
  const [viewingShift, setViewingShift] = useState<HistoricalShift | null>(null);

  const currency = (dashboard?.restaurant as any)?.currency || currentShift?.currency || "₹";

  const fetchCurrentShift = async () => {
    setLoadingCurrent(true);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/shifts/current`, { headers });
      if (res.ok) {
        const data = await res.json();
        setCurrentShift(data);
      } else if (res.status === 403) {
        // Plan restriction handled by isShiftCloseAllowed
      }
    } catch {
      // ignore
    } finally {
      setLoadingCurrent(false);
    }
  };

  const fetchShiftsHistory = async () => {
    setLoadingHistory(true);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/shifts`, { headers });
      if (res.ok) {
        const data = await res.json();
        setShiftsHistory(Array.isArray(data.shifts) ? data.shifts : []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (isShiftCloseAllowed) {
      fetchCurrentShift();
      fetchShiftsHistory();
    }
  }, [slug, isShiftCloseAllowed]);

  // Live Discrepancy Calculation
  const countedCash = parseFloat(countedCashInput);
  const expectedCash = currentShift?.expectedCash ?? 0;

  const liveDifference = useMemo(() => {
    if (isNaN(countedCash)) return null;
    return Math.round((countedCash - expectedCash) * 100) / 100;
  }, [countedCash, expectedCash]);

  const discrepancyStatus = useMemo(() => {
    if (liveDifference === null) return null;
    if (liveDifference === 0) return "MATCHED";
    if (liveDifference < 0) return "SHORT";
    return "OVER";
  }, [liveDifference]);

  // Execute Shift Close
  const handleCloseShift = async () => {
    if (isNaN(countedCash) || countedCash < 0) {
      toast({
        variant: "destructive",
        title: "Please enter physical cash",
        description: "Count the actual bills and coins in your drawer before closing.",
      });
      return;
    }

    setIsClosing(true);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/shifts/close`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          countedCash,
          notes: shiftNotes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to close shift");
      }

      const closedRecord = await res.json();

      setIsConfirmModalOpen(false);
      setCountedCashInput("");
      setShiftNotes("");

      toast({
        title: "🎉 Shift Successfully Closed",
        description: `Settlement record created with ${closedRecord.discrepancyType} status.`,
      });

      // Refresh current open shift and history
      await fetchCurrentShift();
      await fetchShiftsHistory();
      refetchDashboard();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Shift close failed",
        description: err.message || "Could not complete day-end settlement.",
      });
    } finally {
      setIsClosing(false);
    }
  };

  // Plan Entitlement Guard: Pro Plan Locked Card
  if (!isShiftCloseAllowed) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto min-h-[420px]" id="shift-close-plan-gate">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 mb-4 ring-8 ring-amber-500/5">
          <Scale className="h-8 w-8" />
        </div>
        <span className="rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 font-mono text-[11px] font-bold px-3 py-1 uppercase tracking-wider mb-2">
          Pro Plan Feature
        </span>
        <h2 className="font-display text-2xl font-bold text-foreground">
          Shift Close & Day-End Settlement
        </h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Reconcile physical cash counted in your till against system-recorded cash sales, detect shortages or overages, and maintain tamper-proof shift audit logs.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 w-full max-w-xs">
          <Button
            onClick={() => onNavigateTab?.("plans")}
            className="w-full rounded-xl bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 font-bold gap-2 h-11"
            id="button-upgrade-shift-close"
          >
            <Sparkles className="h-4 w-4" />
            Upgrade to Pro
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 select-none" id="shift-close-view">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground">
              Shift Close & Settlement
            </h1>
            <span className="rounded-md bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 text-[10px] font-mono font-bold px-2 py-0.5 uppercase">
              PRO
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Authoritative physical cash drawer reconciliation and day-end settlement.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchCurrentShift();
              fetchShiftsHistory();
            }}
            className="rounded-xl h-8 text-xs gap-1.5"
            id="button-refresh-shift"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh Data
          </Button>
        </div>
      </div>

      {/* 1. Active Shift Reconciliation Panel */}
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                Shift In Progress
              </span>
            </div>
            <h3 className="font-display text-lg font-bold text-foreground mt-1">
              {currentShift?.dateFormatted || "Today's Drawer Reconciliation"}
            </h3>
            <p className="text-xs text-muted-foreground">
              Opened: {currentShift?.openedAt ? new Date(currentShift.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Day Start"}
              &nbsp;• Timezone: {currentShift?.timezone || "Local"}
            </p>
          </div>

          <div className="rounded-xl bg-muted/40 p-3 sm:text-right">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Expected Cash in Drawer
            </span>
            <span className="font-mono font-black text-2xl text-foreground block mt-0.5" id="expected-cash-display">
              {currency}
              {expectedCash.toLocaleString()}
            </span>
            <span className="text-[11px] text-muted-foreground block">
              From {currentShift?.cashOrdersCount ?? 0} cash orders (System Authoritative)
            </span>
          </div>
        </div>

        {/* Form: Counted Cash Input & Live Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
          <div className="space-y-3">
            <div>
              <label className="font-bold text-xs text-foreground flex items-center justify-between">
                <span>Physical Cash Counted in Till</span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  (Enter actual bills & coins)
                </span>
              </label>
              <div className="relative mt-1.5">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono font-bold text-base text-muted-foreground">
                  {currency}
                </span>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={countedCashInput}
                  onChange={(e) => setCountedCashInput(e.target.value)}
                  placeholder="0.00"
                  className="pl-8 h-12 text-lg font-mono font-bold rounded-xl"
                  id="input-counted-cash"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-xs text-foreground block">
                Settlement Notes (Optional)
              </label>
              <Textarea
                value={shiftNotes}
                onChange={(e) => setShiftNotes(e.target.value)}
                placeholder="e.g. ₹50 short due to incorrect change given on Table 4, or drawer float explanation…"
                className="mt-1.5 rounded-xl text-xs min-h-[75px]"
                id="input-shift-notes"
              />
            </div>
          </div>

          {/* Live Comparison Card */}
          <div className="flex flex-col justify-between rounded-2xl border p-4 bg-muted/20">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Reconciliation Difference
              </span>

              {liveDifference === null ? (
                <div className="my-6 text-center py-4">
                  <Coins className="h-8 w-8 text-muted-foreground opacity-40 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Enter the counted cash amount to see live discrepancy status.
                  </p>
                </div>
              ) : (
                <div className="my-3 space-y-3">
                  <div
                    className={`rounded-xl p-4 border flex items-center justify-between ${
                      discrepancyStatus === "MATCHED"
                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200"
                        : discrepancyStatus === "SHORT"
                        ? "border-red-500/50 bg-red-500/10 text-red-950 dark:text-red-200"
                        : "border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-200"
                    }`}
                    id="discrepancy-status-banner"
                  >
                    <div className="flex items-center gap-2.5">
                      {discrepancyStatus === "MATCHED" ? (
                        <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                      )}
                      <div>
                        <div className="font-black font-display text-base">
                          {discrepancyStatus === "MATCHED"
                            ? "PERFECT MATCH"
                            : discrepancyStatus === "SHORT"
                            ? `SHORT BY ${currency}${Math.abs(liveDifference)}`
                            : `OVER BY ${currency}${Math.abs(liveDifference)}`}
                        </div>
                        <p className="text-xs opacity-80">
                          {discrepancyStatus === "MATCHED"
                            ? "Drawer matches system cash exactly."
                            : discrepancyStatus === "SHORT"
                            ? "Cash in drawer is less than recorded sales."
                            : "Cash in drawer exceeds recorded sales."}
                        </p>
                      </div>
                    </div>

                    <span className="font-mono font-black text-xl">
                      {liveDifference > 0 ? `+${liveDifference}` : liveDifference}
                    </span>
                  </div>

                  <div className="text-[11px] text-muted-foreground space-y-1 font-mono">
                    <div className="flex justify-between">
                      <span>Authoritative Expected:</span>
                      <span>{currency}{expectedCash}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Staff Counted Cash:</span>
                      <span>{currency}{countedCash || 0}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Button
              type="button"
              onClick={() => setIsConfirmModalOpen(true)}
              disabled={isNaN(countedCash) || countedCash < 0 || isClosing}
              className="w-full h-11 rounded-xl bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 font-bold text-xs gap-1.5 shadow-md"
              id="button-open-close-shift-dialog"
            >
              <Scale className="h-4 w-4" />
              Close Shift & Settle Drawer
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Immutable Historical Closed Shifts */}
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-display text-base font-bold text-foreground">
              Immutable Shift Settlement History
            </h3>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {shiftsHistory.length} Settled {shiftsHistory.length === 1 ? "Shift" : "Shifts"}
          </span>
        </div>

        <p className="text-xs text-muted-foreground">
          All closed shifts are cryptographically recorded in the restaurant audit trail and cannot be modified or deleted.
        </p>

        {loadingHistory ? (
          <TablelineLoader
            variant="card"
            size="sm"
            message="Loading shift settlement records…"
            subtext="Verifying daily registers and audit seals…"
          />
        ) : shiftsHistory.length === 0 ? (
          <div className="py-10 text-center rounded-xl border border-dashed border-border p-6">
            <Receipt className="h-8 w-8 text-muted-foreground opacity-40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              No historical shifts closed yet. Closing a shift creates your first settlement record.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" id="table-shift-history">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="py-3 px-3">Closed Date & Time</th>
                  <th className="py-3 px-3">Closed By</th>
                  <th className="py-3 px-3 text-right">Expected</th>
                  <th className="py-3 px-3 text-right">Counted</th>
                  <th className="py-3 px-3 text-center">Status / Diff</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {shiftsHistory.map((shift) => {
                  const isShort = shift.discrepancyType === "SHORT";
                  const isOver = shift.discrepancyType === "OVER";
                  const isMatched = shift.discrepancyType === "MATCHED";

                  return (
                    <tr
                      key={shift.id}
                      className="hover:bg-muted/30 transition-colors"
                      id={`shift-row-${shift.id}`}
                    >
                      <td className="py-3 px-3 font-mono">
                        <div className="font-bold text-foreground">
                          {new Date(shift.closedAt).toLocaleDateString()}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(shift.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-semibold text-foreground">
                          {shift.closedBy?.name || "Staff"}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate max-w-[140px]">
                          {shift.closedBy?.email || "—"}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-semibold">
                        {currency}{shift.expectedCash}
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold text-foreground">
                        {currency}{shift.countedCash}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold font-mono ${
                            isMatched
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : isShort
                              ? "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                          }`}
                        >
                          {isMatched
                            ? "MATCHED"
                            : isShort
                            ? `SHORT ${currency}${Math.abs(shift.difference)}`
                            : `OVER ${currency}${Math.abs(shift.difference)}`}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setViewingShift(shift)}
                          className="h-8 rounded-lg text-xs font-medium"
                          id={`button-view-shift-${shift.id}`}
                        >
                          Audit Details
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Dialog before closing shift */}
      <Dialog open={isConfirmModalOpen} onOpenChange={setIsConfirmModalOpen}>
        <DialogContent className="max-w-md rounded-2xl" id="shift-close-confirm-dialog">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Confirm Shift Settlement</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Please verify cash figures before finalizing. Once closed, this shift settlement is immutable.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl bg-muted/40 p-4 space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expected System Cash:</span>
              <span className="font-bold">{currency}{expectedCash}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Physical Cash Counted:</span>
              <span className="font-bold">{currency}{countedCash || 0}</span>
            </div>
            <div className="border-t border-border pt-2 flex justify-between font-bold text-sm">
              <span>Discrepancy:</span>
              <span
                className={
                  discrepancyStatus === "MATCHED"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }
              >
                {discrepancyStatus} ({currency}{liveDifference})
              </span>
            </div>
            {shiftNotes && (
              <div className="pt-2 text-muted-foreground font-sans italic">
                Note: "{shiftNotes}"
              </div>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            <strong>Note:</strong> Closing the shift will advance the shift boundary to the current timestamp. It will <strong>NOT</strong> delete any orders, bills, or dining sessions.
          </p>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsConfirmModalOpen(false)}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCloseShift}
              disabled={isClosing}
              className="rounded-xl bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 font-bold text-xs"
              id="confirm-close-shift-btn"
            >
              {isClosing ? "Closing Shift…" : "Confirm & Settle Shift"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Historical Shift Detail Modal */}
      <Dialog open={Boolean(viewingShift)} onOpenChange={(open) => !open && setViewingShift(null)}>
        <DialogContent className="max-w-md rounded-2xl" id="shift-detail-dialog">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-emerald-600" />
              <DialogTitle className="text-base font-bold">Immutable Shift Settlement</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Shift ID: <span className="font-mono">{viewingShift?.shiftId || viewingShift?.id}</span>
            </DialogDescription>
          </DialogHeader>

          {viewingShift && (
            <div className="space-y-4 py-2 text-xs">
              <div className="rounded-xl bg-muted/40 p-4 space-y-2 font-mono">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Closed At:</span>
                  <span className="font-bold">{new Date(viewingShift.closedAt).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Closed By:</span>
                  <span className="font-bold">{viewingShift.closedBy?.name} ({viewingShift.closedBy?.role})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">System Expected:</span>
                  <span className="font-bold">{currency}{viewingShift.expectedCash}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Staff Counted:</span>
                  <span className="font-bold">{currency}{viewingShift.countedCash}</span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between font-bold text-sm">
                  <span>Settlement Status:</span>
                  <span
                    className={
                      viewingShift.discrepancyType === "MATCHED"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }
                  >
                    {viewingShift.discrepancyType} ({currency}{viewingShift.difference})
                  </span>
                </div>
              </div>

              {viewingShift.notes && (
                <div className="rounded-xl border p-3">
                  <span className="text-muted-foreground font-semibold block mb-1">
                    Staff Notes:
                  </span>
                  <p className="text-foreground leading-relaxed italic">
                    "{viewingShift.notes}"
                  </p>
                </div>
              )}

              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-emerald-800 dark:text-emerald-300 text-[11px] flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  This record is permanently recorded in the restaurant's security ledger. It cannot be edited or recalculated.
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setViewingShift(null)}
              className="w-full rounded-xl text-xs font-semibold"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
