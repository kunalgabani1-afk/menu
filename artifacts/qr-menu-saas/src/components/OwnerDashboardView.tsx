import React, { useEffect, useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import {
  UtensilsCrossed,
  QrCode,
  Plus,
  Clock,
  Check,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  CheckCircle2,
  XCircle,
  CreditCard,
  Banknote,
  Smartphone,
  Sparkles,
  ChefHat,
  Bell,
  BarChart3,
  Star,
  Users,
  Shield,
  ArrowUpRight,
  ArrowRight,
  X,
  Lock,
  Search,
  Eye,
  Activity,
  Receipt,
  TrendingUp,
  AlertCircle,
  Crown,
  ShoppingCart,
  ShoppingBag,
  Armchair,
  LayoutGrid,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getIdToken } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { PlanEntitlementsView } from "./PlanEntitlementsModal";
import { OwnerWorkspaceLoader } from "./CafeLoaders";
import { PLAN_DEFINITIONS, normalizePlanId, canUseFeature, type PlanId } from "@/lib/plans";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import type { Table } from "@workspace/api-client-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface OwnerDashboardViewProps {
  slug: string;
  dashboard?: any;
  loading: boolean;
  error: boolean;
  queryError?: any;
  retry: () => void;
  onSelectTab?: (tab: string) => void;
}

function getGreeting(hour = new Date().getHours()): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getTimeAgo(dateStr?: string | number): string {
  if (!dateStr) return "";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins === 1) return "1m ago";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return "1h ago";
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

export function OwnerDashboardView({
  slug,
  dashboard,
  loading,
  error,
  queryError,
  retry,
  onSelectTab,
}: OwnerDashboardViewProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [showPlanModal, setShowPlanModal] = useState(false);

  const currency = dashboard?.restaurant?.currency || "₹";
  const currentPlanId: PlanId = normalizePlanId(dashboard?.plan || dashboard?.restaurant?.plan);
  const planLimits =
    dashboard?.planLimits ||
    PLAN_DEFINITIONS[currentPlanId]?.limits ||
    PLAN_DEFINITIONS.starter.limits;
  const planDef = PLAN_DEFINITIONS[currentPlanId] || PLAN_DEFINITIONS.starter;

  const activeTablesFromList = tables.filter(
    (t: any) => t.status !== "DELETED" && t.status !== "ARCHIVED" && t.deleted !== true
  ).length;
  const tablesCount =
    typeof dashboard?.usage?.tablesCount === "number"
      ? dashboard.usage.tablesCount
      : activeTablesFromList;
  const menuCount =
    typeof dashboard?.usage?.menuItemsCount === "number"
      ? dashboard.usage.menuItemsCount
      : 0;

  const [orderToCancel, setOrderToCancel] = useState<string | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowWelcomeBanner(false);
    }, 15000);
    return () => clearTimeout(timer);
  }, []);

  const loadData = async () => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const [ordersRes, tablesRes] = await Promise.all([
        fetch(`/api/restaurants/${slug}/orders?limit=50`, { headers }).catch(() => null),
        fetch(`/api/restaurants/${slug}/tables`, { headers }).catch(() => null),
      ]);

      if (ordersRes && ordersRes.ok) {
        const data = await ordersRes.json();
        setOrders(Array.isArray(data) ? data : data.orders || []);
      }

      if (tablesRes && tablesRes.ok) {
        const data = await tablesRes.json();
        setTables(Array.isArray(data) ? data : data.tables || []);
      }
    } catch {}
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [slug]);

  const handleUpdateStatus = async (orderId: string, nextStatus: string) => {
    setUpdatingOrderId(orderId);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/orders/${orderId}/status`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: nextStatus }),
      });

      if (res.ok) {
        toast({
          title: "Order updated",
          description: `Order moved to ${nextStatus.toLowerCase()}.`,
        });
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
        );
      } else {
        const err = await res.json().catch(() => ({}));
        toast({
          variant: "destructive",
          title: "Could not update order",
          description: err.message || "Please try again.",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Network error",
        description: "Please check your connection.",
      });
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleApproveOrder = async (orderId: string) => {
    setUpdatingOrderId(orderId);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/orders/${orderId}/approve`, {
        method: "POST",
        headers,
      });

      if (res.ok) {
        toast({
          title: "Order approved",
          description: "Order accepted and sent to kitchen.",
        });
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: "APPROVED" } : o))
        );
      } else {
        const err = await res.json().catch(() => ({}));
        toast({
          variant: "destructive",
          title: "Could not approve order",
          description: err.message || "Please try again.",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Network error",
        description: "Please check your connection.",
      });
    } finally {
      setUpdatingOrderId(null);
    }
  };

  if (loading || (!dashboard && !error)) {
    return <OwnerWorkspaceLoader message="Preparing your restaurant workspace and kitchen tickets…" />;
  }

  if (error || !dashboard) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="h-10 w-10 text-stone-400 mb-3" />
        <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">Unable to load workspace</h2>
        <p className="text-xs text-stone-500 max-w-sm mt-1">Please check your network connection or sign in again.</p>
        <Button onClick={retry} className="mt-4 text-xs font-semibold" size="sm">Retry</Button>
      </div>
    );
  }

  const restaurant = dashboard.restaurant || {};
  const ownerName = dashboard.operatorName || restaurant.ownerName || "Owner";
  const isOpen = restaurant.restaurantStatus !== "inactive";

  // Calculations from real order data
  const today = new Date().toDateString();
  const todayOrders = orders.filter((o) => {
    if (!o.createdAt) return false;
    return new Date(o.createdAt).toDateString() === today;
  });

  const todaySales = todayOrders
    .filter((o) => o.status !== "CANCELLED" && o.status !== "DECLINED")
    .reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  const activeOrders = orders.filter(
    (o) => o.status !== "COMPLETED" && o.status !== "CANCELLED" && o.status !== "DECLINED"
  );

  // Table occupancy
  const activeTableNumbers = new Set(
    activeOrders.map((o) => String(o.tableNumber || o.tableId))
  );
  const occupiedCount = tables.filter((t) =>
    activeTableNumbers.has(String(t.tableNumber)) || activeTableNumbers.has(String(t.id))
  ).length;
  const totalTables = tables.length;
  const availableCount = Math.max(0, totalTables - occupiedCount);
  const occupancyRate = totalTables > 0 ? Math.round((occupiedCount / totalTables) * 100) : 0;

  // Real order status counts
  const pendingApprovalOrders = activeOrders.filter(
    (o) => o.status === "PENDING_WAITER_APPROVAL" || o.status === "NEEDS_APPROVAL"
  ).length;
  const inKitchenOrders = activeOrders.filter(
    (o) => o.status === "APPROVED" || o.status === "PREPARING"
  ).length;
  const settledOrdersCount = todayOrders.filter(
    (o) => o.status === "COMPLETED" || o.status === "PAID"
  ).length;

  // Real hourly sales distribution calculated from today's orders (16 hourly intervals: 8 AM to 11 PM)
  const hourlySlots = useMemo(() => {
    const slots: { hour: number; label: string; sales: number; count: number; pct?: number }[] = [];
    for (let h = 8; h <= 23; h++) {
      const ampm = h >= 12 ? "PM" : "AM";
      const displayHour = h % 12 === 0 ? 12 : h % 12;
      slots.push({ hour: h, label: `${displayHour} ${ampm}`, sales: 0, count: 0 });
    }

    todayOrders.forEach((o) => {
      if (!o.createdAt || o.status === "CANCELLED" || o.status === "DECLINED") return;
      const d = new Date(o.createdAt);
      const h = d.getHours();
      const slot = slots.find((s) => s.hour === h);
      if (slot) {
        slot.sales += Number(o.total || o.totalAmount || 0);
        slot.count += 1;
      }
    });

    const maxSales = Math.max(...slots.map((s) => s.sales), 1);
    return slots.map((s) => ({
      ...s,
      pct: s.sales > 0 ? Math.max(8, Math.round((s.sales / maxSales) * 100)) : 4,
    }));
  }, [todayOrders]);

  // Breakdown by payment method
  const upiSales = todayOrders
    .filter((o) => o.paymentMethod === "UPI" && o.status !== "CANCELLED")
    .reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const cashSales = todayOrders
    .filter((o) => o.paymentMethod === "CASH" && o.status !== "CANCELLED")
    .reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const cardSales = todayOrders
    .filter((o) => (o.paymentMethod === "CARD" || o.paymentMethod === "CREDIT_CARD") && o.status !== "CANCELLED")
    .reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const otherSales = Math.max(0, todaySales - upiSales - cashSales - cardSales);

  return (
    <div className="space-y-4 sm:space-y-5 select-none" id="owner-dashboard-view">
      {/* 1. HERO SECTION (Shows for 15s after login, then auto-hides) */}
      {showWelcomeBanner && (
        <div className="rounded-2xl border border-[#EDE4D8] dark:border-stone-800 bg-gradient-to-r from-[#FAF7F2] via-[#FAF6F0] to-[#F5EFE6] dark:from-stone-900/80 dark:to-stone-900/40 p-4 sm:p-5 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs transition-all duration-500 animate-in fade-in slide-in-from-top-2">
          <div className="space-y-1 z-10">
            <div className="text-xs text-[#8A7D73] dark:text-stone-400 font-medium">
              {getGreeting()},
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-extrabold tracking-tight text-[#241B16] dark:text-[#F7F4F0] flex items-center gap-2">
              Welcome Back! <span className="text-2xl">☕</span>
            </h1>
            <p className="text-xs text-[#73665C] dark:text-stone-300 max-w-md leading-relaxed">
              Great food brings people together. Let's make today amazing!
            </p>
          </div>

          {/* Right Side Visual Banner */}
          <div className="flex items-center gap-3 bg-white/70 dark:bg-stone-800/70 border border-[#EDE4D8] dark:border-stone-700 rounded-xl p-2 sm:p-2.5 pr-3 shadow-xs shrink-0 self-stretch md:self-auto justify-between md:justify-start">
            <div className="pl-1.5">
              <p className="font-serif text-xs sm:text-sm font-bold text-[#241B16] dark:text-[#F7F4F0] leading-snug">
                “Good food<br />Good mood”
              </p>
              <p className="text-[10px] text-[#8A7D73] dark:text-stone-400 mt-0.5">
                — Tableline
              </p>
            </div>
            <div className="h-16 sm:h-18 w-24 sm:w-28 rounded-lg overflow-hidden shadow-2xs border border-[#EDE4D8] dark:border-stone-700 shrink-0 bg-[#3D2314] relative">
              <img
                src="/latte_table.jpg"
                alt="Tableline Cafe"
                className="h-full w-full object-cover object-center transform hover:scale-105 transition-transform duration-500"
                onError={(e) => {
                  e.currentTarget.src = "/cafe_photo_1.jpg";
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 2. METRIC CARDS (4 Equal Width Compact Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-3.5" id="owner-metrics-grid">
        {/* Card 1: Today's Sales */}
        <div className="rounded-xl border border-[#EDE4D8] dark:border-stone-800 bg-[#FAF7F2] dark:bg-stone-900/80 p-3.5 sm:p-4 shadow-2xs flex items-center gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F2ECE3] dark:bg-stone-800 text-[#3D2314] dark:text-amber-300">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-medium text-[#8A7D73] dark:text-stone-400 block">
              Today's Sales
            </span>
            <div className="font-serif text-xl sm:text-2xl font-extrabold text-[#241B16] dark:text-[#F7F4F0] tracking-tight mt-0.5 leading-none">
              <span className="font-sans tabular-nums">{formatCurrency(todaySales, currency)}</span>
            </div>
            <div className="flex items-center gap-1 mt-1 text-[11px]">
              {todayOrders.length > 0 ? (
                <>
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                    <span className="font-sans tabular-nums">{todayOrders.length}</span> order{todayOrders.length > 1 ? "s" : ""}
                  </span>
                  <span className="text-[#8A7D73] dark:text-stone-400">placed today</span>
                </>
              ) : (
                <span className="text-[#8A7D73] dark:text-stone-400"><span className="font-sans tabular-nums">0</span> orders recorded today</span>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: Active Orders */}
        <div className="rounded-xl border border-[#EDE4D8] dark:border-stone-800 bg-[#FAF7F2] dark:bg-stone-900/80 p-3.5 sm:p-4 shadow-2xs flex items-center gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F2ECE3] dark:bg-stone-800 text-[#3D2314] dark:text-amber-300">
            <ShoppingCart className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-medium text-[#8A7D73] dark:text-stone-400 block">
              Active Orders
            </span>
            <div className="flex items-center gap-1.5 mt-0.5 leading-none">
              <span className="font-serif text-xl sm:text-2xl font-extrabold text-[#241B16] dark:text-[#F7F4F0] tracking-tight">
                <span className="font-sans tabular-nums">{activeOrders.length}</span>
              </span>
              {pendingApprovalOrders > 0 ? (
                <span className="rounded-md bg-[#FFEDE2] text-[#C85A17] border border-[#FCD4BC] dark:bg-amber-950/50 dark:text-amber-300 px-1.5 py-0.2 text-[10px] font-bold animate-pulse">
                  <span className="font-sans tabular-nums">{pendingApprovalOrders}</span> new
                </span>
              ) : inKitchenOrders > 0 ? (
                <span className="rounded-md bg-[#E8F0FE] text-[#1967D2] border border-[#C3D9FF] dark:bg-blue-950/50 dark:text-blue-300 px-1.5 py-0.2 text-[10px] font-bold">
                  <span className="font-sans tabular-nums">{inKitchenOrders}</span> cooking
                </span>
              ) : null}
            </div>
            <div className="text-[11px] text-[#8A7D73] dark:text-stone-400 mt-1">
              {activeOrders.length > 0 ? "In preparation & service" : "All caught up"}
            </div>
          </div>
        </div>

        {/* Card 3: Occupied Tables */}
        <div className="rounded-xl border border-[#EDE4D8] dark:border-stone-800 bg-[#FAF7F2] dark:bg-stone-900/80 p-3.5 sm:p-4 shadow-2xs flex items-center gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F2ECE3] dark:bg-stone-800 text-[#3D2314] dark:text-amber-300">
            <Armchair className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-medium text-[#8A7D73] dark:text-stone-400 block">
              Occupied Tables
            </span>
            <div className="font-serif text-xl sm:text-2xl font-extrabold text-[#241B16] dark:text-[#F7F4F0] tracking-tight mt-0.5 leading-none">
              <span className="font-sans tabular-nums">{occupiedCount}</span> <span className="text-lg font-normal text-[#8A7D73]">/ <span className="font-sans tabular-nums">{totalTables}</span></span>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <div className="h-1.5 flex-1 bg-[#E8DDD0] dark:bg-stone-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#3D2314] dark:bg-amber-400 rounded-full transition-all duration-500"
                  style={{ width: `${occupancyRate}%` }}
                />
              </div>
              <span className="text-[11px] font-semibold text-[#8A7D73] dark:text-stone-400 font-sans tabular-nums">
                {occupancyRate}%
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Total Tickets */}
        <div className="rounded-xl border border-[#EDE4D8] dark:border-stone-800 bg-[#FAF7F2] dark:bg-stone-900/80 p-3.5 sm:p-4 shadow-2xs flex items-center gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F2ECE3] dark:bg-stone-800 text-[#3D2314] dark:text-amber-300">
            <Receipt className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-medium text-[#8A7D73] dark:text-stone-400 block">
              Total Tickets
            </span>
            <div className="font-serif text-xl sm:text-2xl font-extrabold text-[#241B16] dark:text-[#F7F4F0] tracking-tight mt-0.5 leading-none">
              <span className="font-sans tabular-nums">{todayOrders.length}</span>
            </div>
            <div className="flex items-center gap-1 mt-1 text-[11px]">
              {todayOrders.length > 0 ? (
                <>
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                    <span className="font-sans tabular-nums">{settledOrdersCount}</span> settled
                  </span>
                  <span className="text-[#8A7D73] dark:text-stone-400">today</span>
                </>
              ) : (
                <span className="text-[#8A7D73] dark:text-stone-400">No tickets generated yet</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. SUBSCRIPTION BANNER (Compact & Elegant) */}
      <div className="rounded-xl border border-[#EDE4D8] dark:border-stone-800 bg-[#FAF7F2] dark:bg-stone-900 px-4 py-3 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3" id="owner-subscription-banner">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F5E2D0] dark:bg-amber-950/60 text-[#8C4A19] dark:text-amber-300">
            <Crown className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-sm font-bold text-[#241B16] dark:text-[#F7F4F0]">
                {planDef.name} Subscription
              </h3>
              <span className="rounded bg-[#E8F7EE] text-[#1E7E45] border border-[#C4EBCF] dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 px-1.5 py-0.2 text-[9.5px] font-bold">
                Active
              </span>
            </div>
            <p className="text-[11px] text-[#8A7D73] dark:text-stone-400 mt-0.5">
              {planDef.tagline} • {planDef.priceMonthly > 0 ? <><span className="font-sans tabular-nums">{currency}{planDef.priceMonthly}</span>/mo</> : "Free"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowPlanModal(true)}
          className="rounded-lg bg-[#3D2314] hover:bg-[#2B180D] text-white text-xs font-semibold px-4 py-2 shadow-xs transition-colors shrink-0"
          id="button-manage-plan-limits"
        >
          Manage Plan &amp; Limits →
        </button>
      </div>

      {/* 4. QUICK ACTIONS (Optimized Compact Cards) */}
      <div className="space-y-2.5" id="owner-quick-actions">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-sm sm:text-base font-bold text-[#241B16] dark:text-[#F7F4F0]">
              Quick Actions
            </h2>
            <p className="text-[11px] text-[#8A7D73] dark:text-stone-400">
              Everything you need, right here.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelectTab?.("settings")}
            className="text-xs font-bold text-[#241B16] dark:text-stone-300 hover:underline flex items-center gap-1"
          >
            More Tools →
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
          {/* 1. Kitchen (KDS) */}
          <button
            type="button"
            onClick={() => onSelectTab?.("kds")}
            className="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-xl border border-[#EDE4D8] dark:border-stone-800 bg-[#FAF7F2] dark:bg-stone-900 hover:bg-[#F5EFE6] dark:hover:bg-stone-800 transition-all text-center group shadow-2xs"
          >
            <ChefHat className="h-5 w-5 text-[#C85A17] dark:text-amber-400 mb-1.5 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-[#241B16] dark:text-[#F7F4F0]">Kitchen (KDS)</span>
            <span className="text-[10.5px] text-[#8A7D73] dark:text-stone-400 mt-0.5">Live tickets</span>
          </button>

          {/* 2. Waiter Calls */}
          <button
            type="button"
            onClick={() => onSelectTab?.("waiter-calls")}
            className="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-xl border border-[#EDE4D8] dark:border-stone-800 bg-[#FAF7F2] dark:bg-stone-900 hover:bg-[#F5EFE6] dark:hover:bg-stone-800 transition-all text-center group shadow-2xs"
          >
            <Bell className="h-5 w-5 text-[#241B16] dark:text-stone-200 mb-1.5 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-[#241B16] dark:text-[#F7F4F0]">Waiter Calls</span>
            <span className="text-[10.5px] text-[#8A7D73] dark:text-stone-400 mt-0.5">Guest assistance</span>
          </button>

          {/* 3. Finance */}
          <button
            type="button"
            onClick={() => onSelectTab?.("finance")}
            className="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-xl border border-[#EDE4D8] dark:border-stone-800 bg-[#FAF7F2] dark:bg-stone-900 hover:bg-[#F5EFE6] dark:hover:bg-stone-800 transition-all text-center group shadow-2xs"
          >
            <Wallet className="h-5 w-5 text-emerald-700 dark:text-emerald-400 mb-1.5 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-[#241B16] dark:text-[#F7F4F0]">Finance</span>
            <span className="text-[10.5px] text-[#8A7D73] dark:text-stone-400 mt-0.5">Sales &amp; day close</span>
          </button>

          {/* 4. Diner Reviews */}
          <button
            type="button"
            onClick={() => onSelectTab?.("reviews")}
            className="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-xl border border-[#EDE4D8] dark:border-stone-800 bg-[#FAF7F2] dark:bg-stone-900 hover:bg-[#F5EFE6] dark:hover:bg-stone-800 transition-all text-center group shadow-2xs"
          >
            <Star className="h-5 w-5 text-amber-500 fill-amber-500 mb-1.5 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-[#241B16] dark:text-[#F7F4F0]">Diner Reviews</span>
            <span className="text-[10.5px] text-[#8A7D73] dark:text-stone-400 mt-0.5">Feedback</span>
          </button>

          {/* 5. Staff & RBAC */}
          <button
            type="button"
            onClick={() => onSelectTab?.("staff")}
            className="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-xl border border-[#EDE4D8] dark:border-stone-800 bg-[#FAF7F2] dark:bg-stone-900 hover:bg-[#F5EFE6] dark:hover:bg-stone-800 transition-all text-center group shadow-2xs"
          >
            <Users className="h-5 w-5 text-purple-600 dark:text-purple-400 mb-1.5 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-[#241B16] dark:text-[#F7F4F0]">Staff &amp; RBAC</span>
            <span className="text-[10.5px] text-[#8A7D73] dark:text-stone-400 mt-0.5">Roles &amp; cooks</span>
          </button>

          {/* 6. Audit Trail */}
          <button
            type="button"
            onClick={() => onSelectTab?.("audit-logs")}
            className="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-xl border border-[#EDE4D8] dark:border-stone-800 bg-[#FAF7F2] dark:bg-stone-900 hover:bg-[#F5EFE6] dark:hover:bg-stone-800 transition-all text-center group shadow-2xs"
          >
            <Shield className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mb-1.5 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-[#241B16] dark:text-[#F7F4F0]">Audit Trail</span>
            <span className="text-[10.5px] text-[#8A7D73] dark:text-stone-400 mt-0.5">Security log</span>
          </button>
        </div>
      </div>

      {/* 5. LOWER SECTION (Optimized Three-Column Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 sm:gap-4" id="owner-lower-dashboard">
        {/* COLUMN 1: LIVE ORDERS */}
        <div className="rounded-xl border border-[#EDE4D8] dark:border-stone-800 bg-[#FAF7F2] dark:bg-stone-900 p-3.5 sm:p-4 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#EDE4D8]/60 dark:border-stone-800 pb-2.5 mb-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                <h3 className="font-serif text-sm font-bold text-[#241B16] dark:text-[#F7F4F0]">
                  Live Orders
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onSelectTab?.("orders")}
                className="text-xs font-bold text-[#241B16] dark:text-stone-300 hover:underline flex items-center gap-1"
              >
                View All →
              </button>
            </div>

            <div className="space-y-2">
              {activeOrders.length > 0 ? (
                activeOrders.slice(0, 4).map((order) => {
                  const itemCount = Array.isArray(order.items) ? order.items.length : (order.itemCount || 1);
                  const orderTotal = Number(order.total || order.totalAmount || 0);
                  const tableName = order.tableNumber ? `Table ${order.tableNumber}` : (order.tableName || "Quick Order");
                  const isNeedsApproval = order.status === "PENDING_WAITER_APPROVAL" || order.status === "NEEDS_APPROVAL";
                  const isPreparing = order.status === "APPROVED" || order.status === "PREPARING";
                  const isReady = order.status === "READY";
                  const isCompleted = order.status === "COMPLETED" || order.status === "PAID";

                  let statusLabel = "New";
                  let statusClass = "bg-[#FFEDE2] text-[#C85A17] border border-[#FCD4BC]";
                  if (isNeedsApproval) {
                    statusLabel = "Needs Approval";
                    statusClass = "bg-amber-100 text-amber-800 border border-amber-300 animate-pulse";
                  } else if (isPreparing) {
                    statusLabel = "Cooking";
                    statusClass = "bg-[#E8F0FE] text-[#1967D2] border border-[#C3D9FF]";
                  } else if (isReady) {
                    statusLabel = "Ready";
                    statusClass = "bg-[#E8F7EE] text-[#1E7E45] border border-[#C4EBCF]";
                  } else if (isCompleted) {
                    statusLabel = "Completed";
                    statusClass = "bg-stone-100 text-stone-700 border border-stone-200";
                  }

                  const timeAgo = getTimeAgo(order.createdAt);

                  return (
                    <div
                      key={order.id}
                      onClick={() => onSelectTab?.("orders")}
                      className="flex items-center justify-between p-2 rounded-lg border border-[#EDE4D8] dark:border-stone-800 bg-white/80 dark:bg-stone-800/50 hover:bg-white dark:hover:bg-stone-800 cursor-pointer transition-colors shadow-2xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#F5EFE6] dark:bg-stone-700 text-[#3D2314] dark:text-stone-300 shrink-0">
                          <ShoppingBag className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-xs text-[#241B16] dark:text-[#F7F4F0] truncate flex items-center gap-1.5">
                            <span>{order.tableNumber ? <>Table <span className="font-sans tabular-nums">{order.tableNumber}</span></> : (order.tableName || "Quick Order")}</span>
                            {order.customerName && (
                              <span className="text-[10px] font-normal text-[#8A7D73] truncate">
                                · {order.customerName}
                              </span>
                            )}
                          </div>
                          <div className="text-[10.5px] text-[#8A7D73] dark:text-stone-400 truncate">
                            <span className="font-sans tabular-nums">{itemCount}</span> item{itemCount > 1 ? "s" : ""} • <span className="font-sans tabular-nums">{formatCurrency(orderTotal, currency)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 pl-1.5">
                        {timeAgo && (
                          <span className="text-[10px] text-[#8A7D73] dark:text-stone-400 hidden sm:inline font-sans tabular-nums">
                            {timeAgo}
                          </span>
                        )}
                        <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold ${statusClass}`}>
                          {statusLabel}
                        </span>
                        <ChevronRight className="h-3 w-3 text-[#8A7D73]" />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-5 px-3 rounded-lg border border-dashed border-[#EDE4D8] dark:border-stone-800 text-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F5EFE6] dark:bg-stone-800 text-[#8A7D73] mb-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-xs font-bold text-[#241B16] dark:text-[#F7F4F0]">
                    No active orders
                  </p>
                  <p className="text-[10.5px] text-[#8A7D73] dark:text-stone-400 mt-0.5 max-w-xs">
                    New orders placed from table QR menus will stream here.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* COLUMN 2: TODAY'S SALES & HOURLY CHART */}
        <div className="rounded-xl border border-[#EDE4D8] dark:border-stone-800 bg-[#FAF7F2] dark:bg-stone-900 p-3.5 sm:p-4 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#EDE4D8]/60 dark:border-stone-800 pb-2.5 mb-2.5">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-[#3D2314] dark:text-amber-400" />
                <h3 className="font-serif text-sm font-bold text-[#241B16] dark:text-[#F7F4F0]">
                  Today's Sales
                </h3>
              </div>
              <div className="flex items-center gap-1 rounded-md border border-[#EDE4D8] dark:border-stone-700 bg-white/80 dark:bg-stone-800 px-2 py-0.5 text-xs font-semibold text-[#241B16] dark:text-stone-200">
                Today <ChevronDown className="h-3 w-3 text-[#8A7D73]" />
              </div>
            </div>

            <div className="flex items-baseline gap-2 mb-3">
              <span className="font-serif text-xl sm:text-2xl font-extrabold text-[#241B16] dark:text-[#F7F4F0] tracking-tight">
                <span className="font-sans tabular-nums">{formatCurrency(todaySales, currency)}</span>
              </span>
              {todayOrders.length > 0 && (
                <span className="text-[11px] font-semibold text-[#8A7D73] dark:text-stone-400">
                  (<span className="font-sans tabular-nums">{todayOrders.length}</span> order{todayOrders.length > 1 ? "s" : ""})
                </span>
              )}
            </div>

            {/* Real Hourly Bar Chart calculated from today's orders */}
            <div className="space-y-1 pt-0.5">
              <div className="flex items-end justify-between h-24 gap-1 px-1 border-b border-[#EDE4D8] dark:border-stone-800 pb-1">
                {hourlySlots.map((slot) => (
                  <div
                    key={slot.hour}
                    className={`flex-1 rounded-t-xs transition-all ${
                      slot.sales > 0
                        ? "bg-[#B68D64] hover:bg-[#8C5A35] dark:bg-amber-600/70 dark:hover:bg-amber-500 cursor-pointer"
                        : "bg-[#EDE4D8]/60 dark:bg-stone-800/60"
                    }`}
                    style={{ height: `${slot.pct}%` }}
                    title={`${slot.label}: ${formatCurrency(slot.sales, currency)} (${slot.count} order${slot.count === 1 ? "" : "s"})`}
                  />
                ))}
              </div>
              <div className="flex justify-between text-[9.5px] text-[#8A7D73] dark:text-stone-400 pt-1 font-sans tabular-nums">
                <span>8 AM</span>
                <span>12 PM</span>
                <span>4 PM</span>
                <span>8 PM</span>
                <span>11 PM</span>
              </div>
            </div>
          </div>
        </div>

        {/* COLUMN 3: TABLE STATUS */}
        <div className="rounded-xl border border-[#EDE4D8] dark:border-stone-800 bg-[#FAF7F2] dark:bg-stone-900 p-3.5 sm:p-4 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#EDE4D8]/60 dark:border-stone-800 pb-2.5 mb-2.5">
              <div className="flex items-center gap-2">
                <Armchair className="h-4 w-4 text-[#3D2314] dark:text-amber-400" />
                <h3 className="font-serif text-sm font-bold text-[#241B16] dark:text-[#F7F4F0]">
                  Table Status
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onSelectTab?.("tables")}
                className="text-xs font-bold text-[#241B16] dark:text-stone-300 hover:underline flex items-center gap-1"
              >
                View All →
              </button>
            </div>

            {/* Real Table Grid rendered from restaurant tables */}
            {tables.length > 0 ? (
              <div className="grid grid-cols-4 gap-2">
                {tables.slice(0, 8).map((tbl, index) => {
                  const tAny = tbl as any;
                  const tableNumStr = String(tbl.tableNumber || index + 1);
                  const isOccupied =
                    activeTableNumbers.has(tableNumStr) ||
                    activeTableNumbers.has(String(tbl.id)) ||
                    tAny.status === "OCCUPIED";
                  const isRequest = tAny.status === "ASSISTANCE" || tAny.status === "WAITER_CALLED";

                  let bgClass = "bg-[#F5F1EA] text-[#8A7D73] border-[#EDE4D8]";
                  let statusTitle = "Available";
                  if (isRequest) {
                    bgClass = "bg-[#FFEDE2] text-[#C85A17] border-[#FCD4BC]";
                    statusTitle = "Service requested";
                  } else if (isOccupied) {
                    bgClass = "bg-[#E8F7EE] text-[#1E7E45] border-[#C4EBCF]";
                    statusTitle = "Occupied";
                  }

                  return (
                    <button
                      key={tbl.id || index}
                      type="button"
                      onClick={() => onSelectTab?.("tables")}
                      title={`Table ${tableNumStr}: ${statusTitle}`}
                      className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-lg border ${bgClass} transition-transform hover:scale-102`}
                    >
                      <span className="font-sans tabular-nums text-xs font-bold">
                        T{tbl.tableNumber || index + 1}
                      </span>
                      <span className="text-[9.5px] opacity-80 mt-0.2 font-sans tabular-nums">
                        {tAny.capacity ? `${tAny.capacity}p` : "-"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-5 px-3 rounded-lg border border-dashed border-[#EDE4D8] dark:border-stone-800 text-center">
                <Armchair className="h-6 w-6 text-[#8A7D73] mb-1 opacity-60" />
                <p className="text-xs font-bold text-[#241B16] dark:text-[#F7F4F0]">
                  No tables configured
                </p>
                <p className="text-[10.5px] text-[#8A7D73] dark:text-stone-400 mt-0.5 max-w-xs mb-1.5">
                  Create tables to enable QR ordering.
                </p>
                <button
                  type="button"
                  onClick={() => onSelectTab?.("tables")}
                  className="text-xs font-semibold text-[#3D2314] dark:text-amber-300 hover:underline"
                >
                  Configure Tables →
                </button>
              </div>
            )}

            {/* Legend */}
            <div className="flex items-center justify-between text-[10.5px] text-[#8A7D73] dark:text-stone-400 mt-3 pt-2 border-t border-[#EDE4D8]/60 dark:border-stone-800">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>Occupied</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-stone-400" />
                <span>Available</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#C85A17]" />
                <span>Request</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Plan Entitlements Modal */}
      {showPlanModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs overflow-hidden animate-in fade-in duration-200"
          id="modal-plan-entitlements-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPlanModal(false);
          }}
        >
          <div
            className="relative w-full max-w-5xl h-[90vh] max-h-[90vh] rounded-3xl border border-[#E8DDD0] dark:border-stone-800 bg-[#FAF6F0] dark:bg-stone-900 shadow-2xl flex flex-col overflow-hidden"
            id="modal-plan-entitlements-dialog"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8DDD0] dark:border-stone-800 shrink-0 bg-white/95 dark:bg-stone-900/95 backdrop-blur-xs">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#5A351F]/10 text-[#5A351F] dark:text-amber-400">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-serif text-lg font-bold text-[#241B16] dark:text-[#F7F4F0]">
                    Subscription Plans &amp; Resource Limits
                  </h2>
                  <p className="text-xs text-[#776B62] dark:text-stone-400">
                    View active tier entitlements or request tier upgrades
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPlanModal(false)}
                className="rounded-full p-2 text-[#776B62] hover:bg-stone-200 dark:hover:bg-stone-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden p-5 sm:p-6">
              <PlanEntitlementsView
                currentPlanId={currentPlanId}
                activePlanRequest={dashboard?.activePlanRequest || dashboard?.planRequest}
                usage={{ menuItemsCount: menuCount, tablesCount }}
                slug={slug}
                onPlanUpdated={() => {
                  retry();
                }}
                onClose={() => setShowPlanModal(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
