import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  Banknote,
  Smartphone,
  CreditCard,
  Users,
  Clock,
  ChevronRight,
  Flame,
  ArrowUpRight,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  Store,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { calculateDailyGallaReport } from "./SplitTenderModal";
import type { AdvancedOrderTicket } from "@/types/advancedPos";

interface OwnerDashboardCredProps {
  slug: string;
  restaurantName?: string;
  currency?: string;
  isDark?: boolean;
  onNavigateTab?: (tab: string) => void;
}

export function OwnerDashboardCred({
  slug,
  restaurantName = "The Juniper Room",
  currency = "₹",
  isDark = false,
  onNavigateTab,
}: OwnerDashboardCredProps) {
  const [orders, setOrders] = useState<AdvancedOrderTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTablesCount, setActiveTablesCount] = useState<number>(0);
  const [totalTablesCount, setTotalTablesCount] = useState<number>(12);

  const fetchDashboardData = async () => {
    try {
      const res = await fetch(`/api/restaurants/${slug}/orders?limit=100`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.orders || [];
        setOrders(list);
      }

      const tablesRes = await fetch(`/api/restaurants/${slug}/tables`);
      if (tablesRes.ok) {
        const tData = await tablesRes.json();
        const tList = Array.isArray(tData) ? tData : tData.tables || [];
        setTotalTablesCount(tList.length || 12);
        setActiveTablesCount(tList.filter((t: any) => t.status === "OCCUPIED").length);
      }
    } catch (err) {
      console.warn("[OwnerDashboardCred] Notice:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 6000);
    return () => clearInterval(interval);
  }, [slug]);

  // Module 5 Galla Report Calculation
  const gallaReport = React.useMemo(() => {
    return calculateDailyGallaReport(orders);
  }, [orders]);

  // Additional live metrics
  const activeKitchenTickets = orders.filter((o) =>
    ["NEW", "APPROVED", "ACCEPTED", "PREPARING"].includes(o.status)
  ).length;

  const averageOrderValue =
    gallaReport.settledOrdersCount > 0
      ? Math.round(gallaReport.totalRevenue / gallaReport.settledOrdersCount)
      : 0;

  return (
    <div
      className={`min-h-[100dvh] w-full p-4 sm:p-6 space-y-5 pb-24 ${
        isDark ? "bg-[#0E0D0C] text-[#FBF8F2]" : "bg-[#FAF6F0] text-[#241B16]"
      }`}
      id="cred-owner-dashboard-pwa"
    >
      {/* Top CRED-Style App Bar */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-[#241B16] to-[#5A351F] text-[#FBF8F2] flex items-center justify-center font-serif text-lg font-bold shadow-md">
            {restaurantName.slice(0, 1)}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#C99A55]">
                Cafe Executive
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <h1 className="font-serif text-lg sm:text-xl font-black tracking-tight leading-none text-[#241B16] dark:text-[#FBF8F2]">
              {restaurantName}
            </h1>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setRefreshing(true);
            fetchDashboardData();
          }}
          className={`h-9 w-9 rounded-2xl border flex items-center justify-center transition-all ${
            isDark
              ? "border-stone-800 bg-[#1C1A18] text-stone-300 hover:text-white"
              : "border-[#E8DDD0] bg-white text-[#5A351F] hover:bg-[#F5EFE6]"
          }`}
          title="Refresh live metrics"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Hero CRED Banking Card: Live Today's Revenue */}
      <div className="relative rounded-3xl p-6 overflow-hidden bg-gradient-to-br from-[#1C1816] via-[#2A221E] to-[#120F0D] text-[#FBF8F2] shadow-2xl border border-stone-800/80">
        {/* Subtle Luxury Pattern Overlay */}
        <div className="absolute -right-8 -top-8 w-44 h-44 rounded-full bg-[#C99A55]/10 blur-2xl pointer-events-none" />

        <div className="flex items-center justify-between text-xs text-stone-400 mb-2">
          <span className="uppercase tracking-widest font-semibold flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-[#C99A55]" />
            <span>Today's Total Settled Revenue</span>
          </span>
          <span className="text-[10px] font-mono bg-white/10 px-2 py-0.5 rounded-full text-stone-300">
            Live Stream
          </span>
        </div>

        {/* Live Revenue Counter with strictly enforced zero-jitter typography */}
        <div className="my-2 flex items-baseline gap-1">
          <span className="font-serif text-2xl font-normal text-[#C99A55]">{currency}</span>
          <span className="font-sans tabular-nums tracking-tight text-4xl sm:text-5xl font-black text-white">
            {gallaReport.totalRevenue.toLocaleString("en-IN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>

        <p className="text-xs text-stone-400 mt-1">
          Across{" "}
          <span className="font-sans tabular-nums tracking-tight font-bold text-white">
            {gallaReport.settledOrdersCount}
          </span>{" "}
          settled table tabs today.
        </p>

        {/* Module 5: Split Daily Galla Dual Breakdown */}
        <div className="mt-5 grid grid-cols-2 gap-3 pt-4 border-t border-white/10">
          {/* Drawer Cash */}
          <div className="rounded-2xl bg-white/5 p-3.5 border border-white/5 backdrop-blur-xs">
            <div className="flex items-center gap-1.5 text-xs text-amber-300 font-semibold mb-1">
              <Banknote className="h-3.5 w-3.5" />
              <span>Cash in Drawer (Galla)</span>
            </div>
            <div className="font-sans tabular-nums tracking-tight text-xl font-extrabold text-white">
              {currency}{gallaReport.expectedCashInDrawer.toFixed(2)}
            </div>
            <p className="text-[10px] text-stone-400 mt-0.5">Physical note count</p>
          </div>

          {/* UPI In Bank */}
          <div className="rounded-2xl bg-white/5 p-3.5 border border-white/5 backdrop-blur-xs">
            <div className="flex items-center gap-1.5 text-xs text-emerald-300 font-semibold mb-1">
              <Smartphone className="h-3.5 w-3.5" />
              <span>UPI in Current A/C</span>
            </div>
            <div className="font-sans tabular-nums tracking-tight text-xl font-extrabold text-white">
              {currency}{gallaReport.totalUpiInBank.toFixed(2)}
            </div>
            <p className="text-[10px] text-stone-400 mt-0.5">Direct bank credit</p>
          </div>
        </div>
      </div>

      {/* Tactile Operational Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {/* Active Floor Occupancy */}
        <div
          onClick={() => onNavigateTab && onNavigateTab("tables")}
          className={`rounded-3xl p-4.5 border shadow-md cursor-pointer transition-all active:scale-98 ${
            isDark ? "bg-[#181614] border-stone-800" : "bg-white border-[#E8DDD0]"
          }`}
        >
          <div className="flex items-center justify-between text-[#776B62] text-xs font-semibold">
            <span>Floor Tables</span>
            <Users className="h-4 w-4 text-[#5A351F] dark:text-[#C99A55]" />
          </div>
          <div className="mt-2 text-2xl font-black text-[#241B16] dark:text-[#FBF8F2]">
            <span className="font-sans tabular-nums tracking-tight">{activeTablesCount}</span>
            <span className="text-sm font-normal text-[#776B62] ml-1">
              / <span className="font-sans tabular-nums tracking-tight">{totalTablesCount}</span>
            </span>
          </div>
          <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold mt-1">
            {Math.round((activeTablesCount / Math.max(1, totalTablesCount)) * 100)}% occupied
          </p>
        </div>

        {/* Live KDS Queue Pressure */}
        <div
          onClick={() => onNavigateTab && onNavigateTab("kds")}
          className={`rounded-3xl p-4.5 border shadow-md cursor-pointer transition-all active:scale-98 ${
            isDark ? "bg-[#181614] border-stone-800" : "bg-white border-[#E8DDD0]"
          }`}
        >
          <div className="flex items-center justify-between text-[#776B62] text-xs font-semibold">
            <span>KDS Queue</span>
            <Flame className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-[#241B16] dark:text-[#FBF8F2]">
            <span className="font-sans tabular-nums tracking-tight">{activeKitchenTickets}</span>
            <span className="text-xs font-medium text-[#776B62] ml-1">active</span>
          </div>
          <p className="text-[11px] text-[#776B62] mt-1">
            {activeKitchenTickets > 8 ? "🔥 Rush Throttling Active" : "Steady kitchen flow"}
          </p>
        </div>

        {/* Average Order Value (AOV) */}
        <div
          onClick={() => onNavigateTab && onNavigateTab("orders")}
          className={`rounded-3xl p-4.5 border shadow-md col-span-2 sm:col-span-1 cursor-pointer transition-all active:scale-98 ${
            isDark ? "bg-[#181614] border-stone-800" : "bg-white border-[#E8DDD0]"
          }`}
        >
          <div className="flex items-center justify-between text-[#776B62] text-xs font-semibold">
            <span>Avg Spend / Tab</span>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-[#241B16] dark:text-[#FBF8F2]">
            {currency}
            <span className="font-sans tabular-nums tracking-tight">{averageOrderValue}</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Based on {gallaReport.settledOrdersCount} orders
          </p>
        </div>
      </div>

      {/* Quick Navigation Action Grid (ZERODHA/CRED Minimalist Style) */}
      <div className="space-y-2 pt-2">
        <span className="text-xs font-bold uppercase tracking-wider text-[#776B62] block px-1">
          Owner Actions
        </span>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => onNavigateTab && onNavigateTab("orders")}
            className={`p-4 rounded-2xl border text-left flex items-center justify-between shadow-2xs hover:bg-[#F5EFE6] transition-all ${
              isDark ? "bg-[#1C1A18] border-stone-800" : "bg-white border-[#E8DDD0]"
            }`}
          >
            <div>
              <p className="text-xs font-bold text-[#241B16] dark:text-[#FBF8F2]">Live Orders &amp; Pass</p>
              <p className="text-[10px] text-[#776B62]">Approve &amp; track floor tickets</p>
            </div>
            <ChevronRight className="h-4 w-4 text-[#776B62]" />
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab && onNavigateTab("shift-close")}
            className={`p-4 rounded-2xl border text-left flex items-center justify-between shadow-2xs hover:bg-[#F5EFE6] transition-all ${
              isDark ? "bg-[#1C1A18] border-stone-800" : "bg-white border-[#E8DDD0]"
            }`}
          >
            <div>
              <p className="text-xs font-bold text-[#241B16] dark:text-[#FBF8F2]">EOD Galla Close</p>
              <p className="text-[10px] text-[#776B62]">Reconcile drawer &amp; UPI</p>
            </div>
            <ChevronRight className="h-4 w-4 text-[#776B62]" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default OwnerDashboardCred;
