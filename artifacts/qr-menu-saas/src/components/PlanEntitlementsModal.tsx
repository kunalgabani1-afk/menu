import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Check,
  X,
  Shield,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Lock,
  Info,
  BellRing,
  Monitor,
  Building2,
  RefreshCw,
  Copy,
  CreditCard,
  Receipt,
  Calendar,
  BadgeCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  PLAN_DEFINITIONS,
  PUBLIC_PLANS,
  normalizePlanId,
  type PlanId,
  type PlanUpgradeRequest,
} from "@/lib/plans";
import { getIdToken } from "@/lib/firebase";
import { formatCurrency } from "@/lib/formatters";

function formatFeatureBullet(text: string): React.ReactNode {
  const parts = text.split(/(₹?[\d,]+(?:\.\d+)?)/g);
  if (parts.length === 1) return text;
  return parts.map((part, index) => {
    if (/^₹?[\d,]+(?:\.\d+)?$/.test(part)) {
      return (
        <span key={index} className="font-sans font-semibold tracking-tight">
          {part}
        </span>
      );
    }
    return part;
  });
}

interface PlanEntitlementsProps {
  currentPlanId?: string;
  activePlanRequest?: PlanUpgradeRequest | null;
  usage?: {
    menuItemsCount?: number;
    tablesCount?: number;
  };
  slug: string;
  onPlanUpdated?: () => void;
  onClose?: () => void;
}

export function PlanEntitlementsView({
  currentPlanId = "starter",
  activePlanRequest: initialPlanRequest = null,
  usage = { menuItemsCount: 0, tablesCount: 0 },
  slug,
  onPlanUpdated,
  onClose,
}: PlanEntitlementsProps) {
  const { toast } = useToast();
  const [activePlanRequest, setActivePlanRequest] = useState<PlanUpgradeRequest | null>(initialPlanRequest);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [confirmTargetPlan, setConfirmTargetPlan] = useState<PlanId | null>(null);

  // Subscription & Manual Payment State
  const [subscription, setSubscription] = useState<any>(null);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [paymentDetails, setPaymentDetails] = useState<any>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"UPI" | "BANK_TRANSFER" | "CASH">("UPI");
  const [transactionReference, setTransactionReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const normalizedCurrent = normalizePlanId(currentPlanId);
  const activePlanDef = PLAN_DEFINITIONS[normalizedCurrent] || PLAN_DEFINITIONS.starter;

  const maxTables = activePlanDef.limits.maxTables;
  const maxItems = activePlanDef.limits.maxMenuItems;
  const currentTables = usage?.tablesCount || 0;
  const currentItems = usage?.menuItemsCount || 0;

  const isTablesOverLimit = currentTables > maxTables && maxTables < 999999;
  const isItemsOverLimit = currentItems > maxItems && maxItems < 999999;

  const tablePercent = maxTables >= 999999 ? 12 : Math.min(100, Math.round((currentTables / maxTables) * 100));
  const itemsPercent = maxItems >= 999999 ? 12 : Math.min(100, Math.round((currentItems / maxItems) * 100));

  // Sync prop changes or fetch fresh plan request on mount
  useEffect(() => {
    if (initialPlanRequest) {
      setActivePlanRequest(initialPlanRequest);
    } else {
      fetchLatestPlanRequest();
    }
    fetchSubscription();
  }, [initialPlanRequest, slug]);

  const fetchSubscription = async () => {
    setLoadingSubscription(true);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/subscription`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSubscription(data.subscription || null);
        setPaymentHistory(data.paymentHistory || []);
        setPaymentDetails(data.paymentDetails || null);
      }
    } catch {
      // Soft ignore
    } finally {
      setLoadingSubscription(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    toast({
      title: "Copied to Clipboard",
      description: text,
    });
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentMethod !== "CASH" && !transactionReference.trim()) {
      toast({
        title: "Reference Required",
        description: "Please enter the UTR or transaction reference number.",
        variant: "destructive",
      });
      return;
    }

    setSubmittingPayment(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/restaurants/${slug}/subscription/submit-payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          paymentMethod,
          transactionReference: transactionReference.trim(),
          notes: paymentNotes.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to submit payment reference.");
      }

      toast({
        title: "Payment Reference Submitted",
        description: "Your reference has been received. Platform Admin will verify it shortly.",
      });

      setTransactionReference("");
      setPaymentNotes("");
      await fetchSubscription();
      if (onPlanUpdated) onPlanUpdated();
    } catch (err: any) {
      toast({
        title: "Submission Failed",
        description: err.message || "Failed to submit payment reference.",
        variant: "destructive",
      });
    } finally {
      setSubmittingPayment(false);
    }
  };

  const fetchLatestPlanRequest = async () => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/plan-request`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data?.request) {
          setActivePlanRequest(data.request);
        }
      }
    } catch {
      // Soft ignore
    }
  };

  const handleOpenConfirm = (targetPlanId: PlanId) => {
    if (targetPlanId === normalizedCurrent) {
      toast({
        title: "Current Active Tier",
        description: `Your restaurant is already subscribed to the ${activePlanDef.name} plan.`,
      });
      return;
    }
    if (activePlanRequest?.status === "PENDING") {
      toast({
        title: "Request Already Pending",
        description: `An upgrade request for ${PLAN_DEFINITIONS[activePlanRequest.requestedPlan]?.name || activePlanRequest.requestedPlan} is awaiting administrator review.`,
      });
      return;
    }
    setConfirmTargetPlan(targetPlanId);
  };

  const handleConfirmSubmit = async () => {
    if (!confirmTargetPlan) return;
    setSubmittingRequest(true);

    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/plan-request`, {
        method: "POST",
        headers,
        body: JSON.stringify({ requestedPlan: confirmTargetPlan }),
      });

      const data = await res.json();

      if (res.ok) {
        toast({
          title: "Upgrade Request Submitted",
          description: `Your request for ${PLAN_DEFINITIONS[confirmTargetPlan]?.name} has been sent to the platform administrator. Your active plan remains ${activePlanDef.name} until review.`,
        });
        setActivePlanRequest(data.request);
        setConfirmTargetPlan(null);
        onPlanUpdated?.();
      } else if (res.status === 409) {
        toast({
          title: "Request Pending",
          description: data.error || "A plan upgrade request is already awaiting administrator review.",
        });
        if (data.request) {
          setActivePlanRequest(data.request);
        }
        setConfirmTargetPlan(null);
      } else {
        toast({
          title: "Submission Error",
          description: data.error || "Unable to submit upgrade request. Please try again.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Network Error",
        description: err.message || "Failed to reach server. Please check your connection.",
        variant: "destructive",
      });
    } finally {
      setSubmittingRequest(false);
    }
  };

  const isPendingApproval = activePlanRequest?.status === "PENDING";
  const pendingPlanDef = isPendingApproval && activePlanRequest?.requestedPlan
    ? PLAN_DEFINITIONS[activePlanRequest.requestedPlan]
    : null;

  return (
    <div className="w-full space-y-6 text-foreground" id="plan-entitlements-container">
      {/* 1. Pending Request Banner (if applicable) */}
      {isPendingApproval && pendingPlanDef && (
        <div
          className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 sm:p-5 shadow-xs"
          id="banner-plan-request-pending"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
                <Clock className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-base font-bold text-foreground">
                    Upgrade Request Sent — Pending Admin Approval
                  </h3>
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                    In Review
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Current Plan: <span className="font-semibold text-foreground">{activePlanDef.name}</span> • Requested Plan:{" "}
                  <span className="font-semibold text-amber-600 dark:text-amber-400">{pendingPlanDef.name}</span>
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Your current {activePlanDef.name} plan and live tables remain completely active. You will not be billed until the platform administrator approves the tier upgrade.
                </p>
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2 self-start sm:self-center">
              <span className="text-[11px] text-muted-foreground">
                Submitted: {activePlanRequest?.createdAt ? new Date(activePlanRequest.createdAt).toLocaleDateString() : "Recently"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 2. Over-Limit Alert Banner (if tables or items exceed plan) */}
      {(isTablesOverLimit || isItemsOverLimit) && (
        <div
          className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 sm:p-5 shadow-xs"
          id="banner-plan-limit-exceeded"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/20 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-foreground">
                Capacity Limit Exceeded
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {isTablesOverLimit && (
                  <span>
                    Your restaurant has <span className="font-bold text-red-600 dark:text-red-400">{currentTables}</span> tables, which exceeds the {activePlanDef.name} limit of <span className="font-bold">{maxTables}</span>.{" "}
                  </span>
                )}
                {isItemsOverLimit && (
                  <span>
                    Your menu has <span className="font-bold text-red-600 dark:text-red-400">{currentItems}</span> items, which exceeds the {activePlanDef.name} limit of <span className="font-bold">{maxItems}</span>.{" "}
                  </span>
                )}
                Upgrade to Growth (up to 25 tables, 150 items) or Pro (unlimited) to support your operation seamlessly.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 3. Current Tier & Live Resource Consumption Card */}
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs" id="card-current-tier-overview">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 dark:bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-300">
                <Sparkles className="h-3.5 w-3.5" />
                Current Active Tier: {activePlanDef.name}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                Active Subscription
              </span>
            </div>
            <h2 className="mt-2.5 font-display text-2xl font-bold tracking-tight text-foreground">
              {activePlanDef.name} Hospitality Tier
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {activePlanDef.tagline}
            </p>
          </div>

          <div className="text-left sm:text-right sm:border-l sm:border-border/60 sm:pl-6">
            <p className="font-mono text-2xl font-bold text-foreground">
              {formatCurrency(activePlanDef.monthlyFee ?? activePlanDef.priceMonthly ?? 0)}
              <span className="text-xs font-normal text-muted-foreground">/mo</span>
            </p>
            <p className="text-[11px] text-muted-foreground">Billed monthly • Platform SLA</p>
          </div>
        </div>

        {/* Real-time Resource Usage Progress Bars */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 border-t border-border/60 pt-4">
          {/* Tables Meter */}
          <div className={`rounded-xl border p-4 transition-colors ${
            isTablesOverLimit
              ? "border-red-500/50 bg-red-500/5"
              : "border-border bg-background/50"
          }`}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">Active Dining Tables</span>
              <span className={`font-mono font-semibold ${isTablesOverLimit ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>
                {currentTables} / {maxTables >= 999999 ? "Unlimited" : maxTables}
                {isTablesOverLimit && " (Over Limit)"}
              </span>
            </div>
            <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full transition-all duration-300 ${
                  isTablesOverLimit
                    ? "bg-red-500"
                    : tablePercent > 80
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
                style={{ width: `${maxTables >= 999999 ? 12 : Math.min(100, tablePercent)}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {maxTables >= 999999
                ? "Unlimited table QR codes enabled"
                : isTablesOverLimit
                ? `Exceeds current tier by ${currentTables - maxTables} tables`
                : `${Math.max(0, maxTables - currentTables)} tables remaining on this tier`}
            </p>
          </div>

          {/* Menu Items Meter */}
          <div className={`rounded-xl border p-4 transition-colors ${
            isItemsOverLimit
              ? "border-red-500/50 bg-red-500/5"
              : "border-border bg-background/50"
          }`}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">Menu Items & Dishes</span>
              <span className={`font-mono font-semibold ${isItemsOverLimit ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>
                {currentItems} / {maxItems >= 999999 ? "Unlimited" : maxItems}
                {isItemsOverLimit && " (Over Limit)"}
              </span>
            </div>
            <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full transition-all duration-300 ${
                  isItemsOverLimit
                    ? "bg-red-500"
                    : itemsPercent > 80
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
                style={{ width: `${maxItems >= 999999 ? 12 : Math.min(100, itemsPercent)}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {maxItems >= 999999
                ? "Unlimited food items and categories enabled"
                : isItemsOverLimit
                ? `Exceeds current tier by ${currentItems - maxItems} items`
                : `${Math.max(0, maxItems - currentItems)} item slots available`}
            </p>
          </div>
        </div>

        {/* Feature Entitlements Breakdown for Current Plan */}
        <div className="mt-5 border-t border-border/60 pt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            What's Included in Your {activePlanDef.name} Plan
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
            <div className="flex items-center gap-2 rounded-lg bg-background/60 px-3 py-2 border border-border/60">
              <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Digital QR Menu</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-background/60 px-3 py-2 border border-border/60">
              <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Table Self-Ordering</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-background/60 px-3 py-2 border border-border/60">
              <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Cash & Card Settlement</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-background/60 px-3 py-2 border border-border/60">
              <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>1 Staff Account</span>
            </div>
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${
              activePlanDef.entitlements.service_calls
                ? "bg-background/60 border-border/60"
                : "bg-secondary/30 border-border/40 text-muted-foreground"
            }`}>
              {activePlanDef.entitlements.service_calls ? (
                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span>Waiter Call System</span>
            </div>
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${
              activePlanDef.entitlements.live_orders_kot
                ? "bg-background/60 border-border/60"
                : "bg-secondary/30 border-border/40 text-muted-foreground"
            }`}>
              {activePlanDef.entitlements.live_orders_kot ? (
                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span>Kitchen Display (KDS)</span>
            </div>
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${
              activePlanDef.entitlements.finance_pro
                ? "bg-background/60 border-border/60"
                : "bg-secondary/30 border-border/40 text-muted-foreground"
            }`}>
              {activePlanDef.entitlements.finance_pro ? (
                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span>Revenue Intelligence</span>
            </div>
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${
              activePlanDef.entitlements.captain_ordering
                ? "bg-background/60 border-border/60"
                : "bg-secondary/30 border-border/40 text-muted-foreground"
            }`}>
              {activePlanDef.entitlements.captain_ordering ? (
                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span>Captain Mobile Mode</span>
            </div>
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${
              activePlanDef.entitlements.shift_close
                ? "bg-background/60 border-border/60"
                : "bg-secondary/30 border-border/40 text-muted-foreground"
            }`}>
              {activePlanDef.entitlements.shift_close ? (
                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span>Shift Close & Settlement</span>
            </div>
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${
              activePlanDef.entitlements.priority_support
                ? "bg-background/60 border-border/60"
                : "bg-secondary/30 border-border/40 text-muted-foreground"
            }`}>
              {activePlanDef.entitlements.priority_support ? (
                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span>Priority Floor Support</span>
            </div>
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${
              activePlanDef.entitlements.custom_bill_receipt
                ? "bg-background/60 border-border/60"
                : "bg-secondary/30 border-border/40 text-muted-foreground"
            }`}>
              {activePlanDef.entitlements.custom_bill_receipt ? (
                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span>Custom Bill & Receipt</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Manual Subscription Renewal & Payment Card */}
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs" id="card-subscription-billing">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-lg font-bold text-foreground">
                  Subscription & Billing
                </h3>
                {subscription && (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                      subscription.status === "ACTIVE"
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : subscription.status === "GRACE_PERIOD"
                        ? "bg-amber-500/20 text-amber-800 dark:text-amber-300 animate-pulse"
                        : "bg-red-500/20 text-red-700 dark:text-red-400 font-extrabold"
                    }`}
                  >
                    {subscription.status === "ACTIVE"
                      ? "Active"
                      : subscription.status === "GRACE_PERIOD"
                      ? "Grace Period"
                      : "Past Due"}
                  </span>
                )}
                {subscription?.pendingSubmission && (
                  <span className="rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 px-2.5 py-0.5 text-[11px] font-semibold">
                    Payment Verification Pending
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Tableline operates on transparent manual subscription billing. No automatic credit card deductions.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchSubscription}
              disabled={loadingSubscription}
              className="h-8 gap-1.5 text-xs rounded-xl"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingSubscription ? "animate-spin" : ""}`} />
              Refresh Status
            </Button>
          </div>
        </div>

        {/* Subscription Cycle Details */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border/60 bg-background/50 p-4">
            <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              Current Period End
            </span>
            <p className="mt-1.5 font-mono text-sm font-bold text-foreground">
              {subscription?.currentPeriodEnd
                ? new Date(subscription.currentPeriodEnd).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "30 Days from Activation"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {subscription?.status === "ACTIVE"
                ? `${Math.max(0, Math.ceil(((subscription?.currentPeriodEnd || Date.now()) - Date.now()) / (1000 * 60 * 60 * 24)))} days remaining`
                : "Period has concluded"}
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/50 p-4">
            <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              7-Day Grace Window
            </span>
            <p className="mt-1.5 font-mono text-sm font-bold text-foreground">
              {subscription?.gracePeriodEnd
                ? new Date(subscription.gracePeriodEnd).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "7 days post-expiry"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Full restaurant operations preserved
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/50 p-4">
            <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5 text-emerald-600" />
              Monthly Renewal Fee
            </span>
            <p className="mt-1.5 font-mono text-sm font-bold text-foreground">
              {formatCurrency(activePlanDef.monthlyFee ?? activePlanDef.priceMonthly ?? 0)}
              <span className="text-xs font-normal text-muted-foreground">/mo</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              For {activePlanDef.name} tier
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/50 p-4">
            <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
              <BadgeCheck className="h-3.5 w-3.5 text-blue-600" />
              Payment Status
            </span>
            <p className="mt-1.5 font-mono text-sm font-bold text-foreground">
              {subscription?.pendingSubmission
                ? "Verification Pending"
                : subscription?.status === "ACTIVE"
                ? "Paid & Active"
                : subscription?.status === "GRACE_PERIOD"
                ? "Payment Due"
                : "Past Due"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {subscription?.pendingSubmission
                ? `Submitted via ${subscription.pendingSubmission.paymentMethod}`
                : "Manual bank/UPI verification"}
            </p>
          </div>
        </div>

        {/* Grace Period / Past Due Warning Callout */}
        {subscription?.status === "PAST_DUE" && (
          <div className="mt-5 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-xs">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-red-700 dark:text-red-400">
                  Customer Table Ordering is Paused
                </p>
                <p className="mt-1 text-muted-foreground">
                  Your 7-day grace period has elapsed. New customer table orders are paused. Your menu catalog, tables, KDS, and historical data remain safe. Submit your payment reference below to instantly enable admin verification and resume service.
                </p>
              </div>
            </div>
          </div>
        )}

        {subscription?.status === "GRACE_PERIOD" && (
          <div className="mt-5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs">
            <div className="flex items-start gap-2.5">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-800 dark:text-amber-300">
                  7-Day Grace Period in Effect
                </p>
                <p className="mt-1 text-muted-foreground">
                  {subscription?.reminder?.message || "Your billing period has ended. Tableline keeps your restaurant fully functional during grace days. Please submit renewal payment to avoid interruption."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Pending Payment Submission Banner */}
        {subscription?.pendingSubmission && (
          <div className="mt-5 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5 animate-pulse" />
                <div>
                  <p className="font-bold text-blue-800 dark:text-blue-300">
                    Payment Reference Submitted — Under Review
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Method: <span className="font-semibold text-foreground">{subscription.pendingSubmission.paymentMethod}</span> • Reference:{" "}
                    <span className="font-mono font-semibold text-foreground">{subscription.pendingSubmission.transactionReference}</span> • Amount: ₹{subscription.pendingSubmission.amount?.toLocaleString("en-IN")}
                  </p>
                  {subscription.pendingSubmission.notes && (
                    <p className="text-[11px] text-muted-foreground italic mt-0.5">
                      Notes: {subscription.pendingSubmission.notes}
                    </p>
                  )}
                </div>
              </div>
              <span className="rounded-full bg-blue-500/20 text-blue-700 dark:text-blue-300 px-3 py-1 text-[11px] font-bold shrink-0 self-start sm:self-center">
                Awaiting Verification
              </span>
            </div>
          </div>
        )}

        {/* Official Tableline Payment Details & Submission Grid */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Official Bank & UPI Details */}
          <div className="rounded-xl border border-border/80 bg-background/60 p-5">
            <h4 className="font-display text-sm font-bold text-foreground flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Official Tableline Payment Accounts
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Direct transfer to Tableline. Keep your transaction/UTR number handy to submit below.
            </p>

            <div className="mt-4 space-y-3">
              {/* UPI Card */}
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-card p-3">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                    Instant UPI Payment
                  </span>
                  <p className="font-mono text-xs font-semibold text-foreground mt-0.5">
                    tableline.pay@icici
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy("tableline.pay@icici", "upi")}
                  className="h-7 text-xs gap-1 rounded-lg"
                >
                  <Copy className="h-3 w-3" />
                  {copiedKey === "upi" ? "Copied!" : "Copy UPI"}
                </Button>
              </div>

              {/* Bank Transfer Card */}
              <div className="rounded-lg border border-border/60 bg-card p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                    NEFT / RTGS / IMPS Bank Account
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleCopy("50200084729104", "account")}
                    className="h-6 text-xs gap-1 p-0 hover:bg-transparent text-primary"
                  >
                    <Copy className="h-3 w-3" />
                    {copiedKey === "account" ? "Copied!" : "Copy A/C"}
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-muted-foreground">Bank:</span>
                    <p className="font-medium text-foreground">HDFC Bank</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">A/C Name:</span>
                    <p className="font-medium text-foreground truncate">Tableline Technologies</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">Account Number:</span>
                    <p className="font-mono font-medium text-foreground">50200084729104</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">IFSC Code:</span>
                    <p className="font-mono font-medium text-foreground">HDFC0001234</p>
                  </div>
                </div>
              </div>

              {/* Cash Collection Notice */}
              <div className="rounded-lg border border-border/40 bg-secondary/30 p-3 text-xs">
                <p className="font-medium text-foreground">Cash Collection Available</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Select "Cash" in the form below if your Tableline representative collects monthly cash invoices in person.
                </p>
              </div>
            </div>
          </div>

          {/* Submit Renewal Reference Form */}
          <div className="rounded-xl border border-border/80 bg-background/60 p-5">
            <h4 className="font-display text-sm font-bold text-foreground flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Submit Renewal Payment Reference
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Once you have transferred the monthly renewal fee, submit your reference below.
            </p>

            <form onSubmit={handleSubmitPayment} className="mt-4 space-y-4">
              {/* Payment Method Selector */}
              <div>
                <label className="text-xs font-semibold text-foreground">
                  Payment Method
                </label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {(["UPI", "BANK_TRANSFER", "CASH"] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                        paymentMethod === method
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {method === "UPI" ? "UPI / QR" : method === "BANK_TRANSFER" ? "Bank / IMPS" : "Cash"}
                    </button>
                  ))}
                </div>
              </div>

              {/* UTR / Ref Number */}
              <div>
                <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>{paymentMethod === "CASH" ? "Collection Reference (Optional)" : "Transaction / UTR Reference"}</span>
                  {paymentMethod !== "CASH" && <span className="text-[11px] text-primary font-normal">Required</span>}
                </label>
                <input
                  type="text"
                  value={transactionReference}
                  onChange={(e) => setTransactionReference(e.target.value)}
                  placeholder={
                    paymentMethod === "UPI"
                      ? "e.g. 423984712093 (12-digit UPI ref)"
                      : paymentMethod === "BANK_TRANSFER"
                      ? "e.g. HDFC2910394821"
                      : "e.g. Handed to representative"
                  }
                  required={paymentMethod !== "CASH"}
                  className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs font-mono text-foreground focus:border-primary focus:outline-hidden"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-foreground">
                  Additional Notes (Optional)
                </label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="e.g. Sent from GPay / Tableline invoice #302"
                  className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-hidden"
                />
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={submittingPayment}
                className="w-full rounded-xl text-xs font-bold gap-2"
              >
                {submittingPayment ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Submitting Reference...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Submit Payment for Admin Verification
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>

        {/* Verified Payment History */}
        {paymentHistory && paymentHistory.length > 0 && (
          <div className="mt-6 border-t border-border/60 pt-5">
            <h4 className="font-display text-sm font-bold text-foreground mb-3">
              Payment & Renewal History
            </h4>
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 text-[11px] font-semibold text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Date Verified</th>
                    <th className="px-4 py-2.5">Plan</th>
                    <th className="px-4 py-2.5">Amount</th>
                    <th className="px-4 py-2.5">Method</th>
                    <th className="px-4 py-2.5">Reference / UTR</th>
                    <th className="px-4 py-2.5">Verified By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-mono text-[11px]">
                  {paymentHistory.map((item: any, index: number) => (
                    <tr key={index} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-foreground font-sans">
                        {item.verifiedAt ? new Date(item.verifiedAt).toLocaleDateString("en-IN") : "—"}
                      </td>
                      <td className="px-4 py-2.5 uppercase font-sans font-semibold">
                        {item.plan || activePlanDef.name}
                      </td>
                      <td className="px-4 py-2.5 font-bold text-emerald-600 dark:text-emerald-400">
                        ₹{(item.amount || 0).toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-2.5 font-sans">
                        {item.paymentMethod}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {item.transactionReference || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground font-sans text-[10px]">
                        {item.verifiedBy || "Admin"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 5. Plan Comparison Cards */}
      <div>
        <div className="mb-4">
          <h3 className="font-display text-lg font-bold text-foreground">Available Hospitality Tiers</h3>
          <p className="text-xs text-muted-foreground">
            Request an upgrade to unlock floor management tools, kitchen screens, and expanded dining capacities.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full" id="grid-plan-comparison">
          {PUBLIC_PLANS.map((plan) => {
            const isCurrent = plan.id === normalizedCurrent;
            const isTargetPending = isPendingApproval && activePlanRequest?.requestedPlan === plan.id;
            const isHigher = (plan.monthlyFee ?? 0) > (activePlanDef.monthlyFee ?? 0);

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col justify-between rounded-2xl border p-5 transition-all ${
                  isCurrent
                    ? "border-amber-500 bg-card shadow-sm ring-2 ring-amber-500/20"
                    : isTargetPending
                    ? "border-amber-500/60 bg-amber-500/5 shadow-xs"
                    : "border-border bg-card/70 hover:border-border/90 hover:bg-card shadow-2xs"
                }`}
                id={`plan-card-${plan.id}`}
              >
                {isCurrent && (
                  <span className="absolute -top-2.5 right-4 rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider shadow-xs">
                    Current Active Plan
                  </span>
                )}
                {isTargetPending && (
                  <span className="absolute -top-2.5 right-4 rounded-full bg-amber-600 px-2.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider shadow-xs animate-pulse">
                    Upgrade Requested
                  </span>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="font-display text-lg font-bold text-foreground">{plan.name}</h4>
                    {plan.id === "growth" && !isCurrent && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        Most Popular
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{plan.tagline}</p>

                  <div className="my-4">
                    <span className="text-2xl font-bold text-foreground">
                      <span className="font-sans font-semibold tracking-tight">
                        {formatCurrency(plan.monthlyFee ?? plan.priceMonthly ?? 0)}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground font-sans"> / month</span>
                  </div>

                  {/* Limits */}
                  <div className="space-y-2 border-t border-border/60 pt-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Tables Limit:</span>
                      <span className="font-semibold text-foreground">
                        {plan.limits.maxTables >= 999999 ? "Unlimited Tables" : (
                          <>Up to <span className="font-sans font-semibold tracking-tight">{plan.limits.maxTables}</span> Tables</>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Menu Items:</span>
                      <span className="font-semibold text-foreground">
                        {plan.limits.maxMenuItems >= 999999 ? "Unlimited Items" : (
                          <>Up to <span className="font-sans font-semibold tracking-tight">{plan.limits.maxMenuItems}</span> Items</>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Staff Logins:</span>
                      <span className="font-semibold text-foreground">
                        {(plan.limits.maxStaffUsers ?? 10) >= 999999 ? "Unlimited" : (
                          <>Up to <span className="font-sans font-semibold tracking-tight">{plan.limits.maxStaffUsers ?? 10}</span> Staff</>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Core Features */}
                  <ul className="mt-4 space-y-2 border-t border-border/60 pt-3 text-xs">
                    {plan.features.map((featureText, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span className="text-foreground font-medium leading-tight">
                          {formatFeatureBullet(featureText)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Plan Action CTA */}
                <div className="mt-6 pt-4 border-t border-border/60">
                  {isCurrent ? (
                    <Button
                      disabled
                      variant="outline"
                      size="sm"
                      className="w-full rounded-xl text-xs font-semibold cursor-default"
                      id={`button-plan-current-${plan.id}`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mr-1.5" />
                      Current Plan
                    </Button>
                  ) : isTargetPending ? (
                    <Button
                      disabled
                      variant="secondary"
                      size="sm"
                      className="w-full rounded-xl text-xs font-semibold gap-1.5"
                      id={`button-plan-pending-${plan.id}`}
                    >
                      <Clock className="h-3.5 w-3.5 text-amber-600 animate-pulse" />
                      Request Pending Approval
                    </Button>
                  ) : isPendingApproval ? (
                    <Button
                      disabled
                      variant="outline"
                      size="sm"
                      className="w-full rounded-xl text-xs text-muted-foreground"
                    >
                      Upgrade In Review
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleOpenConfirm(plan.id)}
                      className={`w-full rounded-xl text-xs font-semibold gap-1.5 shadow-xs transition-all ${
                        isHigher
                          ? "bg-amber-600 hover:bg-amber-700 text-white"
                          : "variant-outline"
                      }`}
                      id={`button-request-upgrade-${plan.id}`}
                    >
                      Request {plan.name}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Request Confirmation Dialog Modal */}
      {confirmTargetPlan && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
          id="modal-confirm-upgrade-request"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-foreground">
                    Request {PLAN_DEFINITIONS[confirmTargetPlan]?.name} Upgrade
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Tableline Enterprise Subscription
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmTargetPlan(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
              <div className="rounded-xl bg-secondary/50 p-3 border border-border/60 space-y-1.5">
                <div className="flex justify-between font-medium text-foreground">
                  <span>Target Plan:</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">
                    {PLAN_DEFINITIONS[confirmTargetPlan]?.name} ({formatCurrency(PLAN_DEFINITIONS[confirmTargetPlan]?.monthlyFee ?? 0)}/mo)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Current Plan:</span>
                  <span className="font-semibold text-foreground">{activePlanDef.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Table Capacity:</span>
                  <span className="font-semibold text-foreground">
                    {activePlanDef.limits.maxTables} → {PLAN_DEFINITIONS[confirmTargetPlan]?.limits.maxTables >= 999999 ? "Unlimited" : PLAN_DEFINITIONS[confirmTargetPlan]?.limits.maxTables}
                  </span>
                </div>
              </div>

              <p className="text-foreground font-medium">
                Important details about your upgrade request:
              </p>
              <ul className="space-y-1.5 pl-4 list-disc text-muted-foreground">
                <li>Your request will be submitted for platform administrator approval.</li>
                <li>
                  <strong className="text-foreground">Your active plan will remain {activePlanDef.name}</strong> until the request is reviewed.
                </li>
                <li>Your QR menus and current tables will remain fully online without downtime.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmTargetPlan(null)}
                disabled={submittingRequest}
                className="rounded-xl text-xs"
                id="button-cancel-upgrade-request"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmSubmit}
                disabled={submittingRequest}
                className="rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                id="button-confirm-upgrade-request"
              >
                {submittingRequest ? "Submitting…" : "Confirm Upgrade Request"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
