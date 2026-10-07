import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, Link, useParams } from "wouter";
import {
  LayoutDashboard,
  ClipboardList,
  UtensilsCrossed,
  QrCode,
  ChefHat,
  Bell,
  BarChart3,
  Star,
  Users,
  Shield,
  Settings,
  Sparkles,
  Receipt,
  Scale,
  LogOut,
  ExternalLink,
  Volume2,
  VolumeX,
  Wallet,
  Sun,
  Moon,
  Smartphone,
  ChevronDown,
  AlertTriangle,
  Clock,
  CreditCard,
  Search,
  Menu,
  X,
  Store,
  CheckCircle2,
  Lock,
  Leaf,
  Crown,
  MapPin,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  useGetRestaurantDashboard,
} from "@workspace/api-client-react";
import { getIdToken, signOutCurrentUser } from "@/lib/firebase";
import { orderAudioAlert } from "@/lib/orderAudioAlert";
import { canUseFeature, PLAN_DEFINITIONS, normalizePlanId, type PlanId } from "@/lib/plans";

// Sub-views
import { OwnerDashboardView } from "./OwnerDashboardView";
import { OrdersManagement } from "./OrdersManagement";
import { KdsView } from "./KdsView";
import { WaiterCallsView } from "./WaiterCallsView";
import { MenuManagement } from "./MenuManagement";
import { TablesManagement } from "./TablesManagement";
import { FinanceView } from "./FinanceView";
import { FeedbackView } from "./FeedbackView";
import { StaffManagementView } from "./StaffManagementView";
import { AuditLogsView } from "./AuditLogsView";
import { PlanEntitlementsView } from "./PlanEntitlementsModal";
import { RestaurantSettings } from "./RestaurantSettings";
import { ShiftCloseView } from "./ShiftCloseView";
import { CaptainOrderingView } from "./CaptainOrderingView";
import { CaptainDashboard } from "./CaptainDashboard";
import { BillsManagement } from "./BillsManagement";
import { AudioAlertBanner } from "./AudioAlertBanner";
import { OwnerWorkspaceLoader } from "./CafeLoaders";
import { PlanLockedCard } from "./PlanLockedCard";

export type TabKey =
  | "overview"
  | "orders"
  | "bills"
  | "kds"
  | "waiter-calls"
  | "menu"
  | "tables"
  | "finance"
  | "reviews"
  | "staff"
  | "audit-logs"
  | "plans"
  | "settings"
  | "shift-close"
  | "captain";

interface DashboardPortalProps {
  slug?: string;
  initialTab?: TabKey;
}

export function DashboardPortal({ slug: propSlug, initialTab = "overview" }: DashboardPortalProps) {
  const params = useParams<{ slug?: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const rawSlug =
    propSlug ||
    params?.slug ||
    (typeof window !== "undefined" ? localStorage.getItem("tableline_last_restaurant_slug") : null) ||
    "the-roast-room";
  const slug = (typeof rawSlug === "string" && rawSlug.trim().length > 0 ? rawSlug.trim() : "the-roast-room");

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [captainMode, setCaptainMode] = useState<"floorplan" | "ordering">("floorplan");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [ownerDropdownOpen, setOwnerDropdownOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");

  const {
    data: dashboard,
    isLoading: loading,
    error,
    refetch: retry,
    error: queryError,
  } = useGetRestaurantDashboard(slug);

  const dAny = dashboard as any;
  const canonicalPlanId: PlanId = normalizePlanId(dAny?.plan || dAny?.restaurant?.plan);
  const [userRole, setUserRole] = useState<string>("owner");

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return orderAudioAlert?.isSoundEnabled ? orderAudioAlert.isSoundEnabled() : true;
    } catch {
      return true;
    }
  });
  const [isDark, setIsDark] = useState(() => {
    return (
      localStorage.getItem("tableline_theme") === "dark" ||
      document.documentElement.classList.contains("dark")
    );
  });

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("tableline_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("tableline_theme", "light");
    }
  };

  const toggleGlobalSound = () => {
    const next = !soundEnabled;
    try {
      if (orderAudioAlert?.setSoundEnabled) {
        orderAudioAlert.setSoundEnabled(next);
      }
    } catch {}
    setSoundEnabled(next);
    if (next) {
      try {
        if (orderAudioAlert?.testSound) {
          orderAudioAlert.testSound();
        }
      } catch {}
      toast({
        title: "🔔 Audio Alerts On",
        description: "Order arrival chime is now active.",
      });
    } else {
      toast({
        title: "🔕 Audio Alerts Muted",
        description: "Order chimes paused.",
      });
    }
  };

  // Sync tab with URL if needed
  useEffect(() => {
    if (initialTab && initialTab !== activeTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Live badge counts
  const [liveOrdersCount, setLiveOrdersCount] = useState<number>(0);
  const [needsApprovalCount, setNeedsApprovalCount] = useState<number>(0);
  const [waiterCallsCount, setWaiterCallsCount] = useState<number>(0);
  const [moreToolsOpen, setMoreToolsOpen] = useState<boolean>(() => {
    return initialTab === "shift-close" || initialTab === "audit-logs" || initialTab === "captain";
  });

  const fetchBadgeCounts = useCallback(async () => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const [ordersRes, waiterRes] = await Promise.all([
        fetch(`/api/restaurants/${slug}/orders?status=ACTIVE`, { headers }).catch(() => null),
        fetch(`/api/restaurants/${slug}/waiter-requests`, { headers }).catch(() => null),
      ]);

      if (ordersRes && ordersRes.ok) {
        const data = await ordersRes.json();
        const items = data.items || data.orders || (Array.isArray(data) ? data : []);
        setLiveOrdersCount(items.length);
        const pending = items.filter(
          (o: any) => o.status === "PENDING_WAITER_APPROVAL" || o.status === "NEEDS_APPROVAL"
        ).length;
        setNeedsApprovalCount(pending);
      }

      if (waiterRes && waiterRes.ok) {
        const data = await waiterRes.json();
        const items = data.items || (Array.isArray(data) ? data : []);
        const pending = items.filter((w: any) => w.status === "PENDING" || !w.status).length;
        setWaiterCallsCount(pending);
      }
    } catch {}
  }, [slug]);

  useEffect(() => {
    fetchBadgeCounts();
    const timer = setInterval(fetchBadgeCounts, 5000);
    return () => clearInterval(timer);
  }, [fetchBadgeCounts]);

  // If staff/waiter, redirect to Captain workspace
  useEffect(() => {
    async function checkStaffRole() {
      try {
        const token = await getIdToken();
        if (token) {
          const res = await fetch("/api/auth/session", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.authenticated && data.user?.role) {
              setUserRole(data.user.role);
              if (data.user.role === "staff") {
                setLocation(`/captain/${slug}`);
              }
            }
          }
        }
      } catch {}
    }
    checkStaffRole();
  }, [slug, setLocation]);

  // Synchronize active workspace with central notification engine
  useEffect(() => {
    orderAudioAlert.setActiveWorkspace(
      activeTab === "orders"
        ? "orders"
        : activeTab === "kds"
        ? "kds"
        : activeTab === "waiter-calls"
        ? "waiter-calls"
        : "all"
    );
  }, [activeTab]);

  // Connect Central Notification Stream & subscribe to live badge updates
  useEffect(() => {
    orderAudioAlert.connect(slug);
    fetchBadgeCounts();

    const unsubRefresh = orderAudioAlert.onDataRefresh(() => {
      fetchBadgeCounts();
      retry();
    });

    return () => {
      unsubRefresh();
    };
  }, [slug, fetchBadgeCounts, retry]);

  const restaurantName =
    dashboard?.restaurant?.name ||
    (typeof slug === "string" && slug
      ? slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
      : "Restaurant Dashboard");
  const currency = dAny?.restaurant?.currency || "₹";
  const restaurantCity = dAny?.restaurant?.city || dAny?.restaurant?.address || "Gujarat, India";

  const handleSignOut = async () => {
    try {
      await signOutCurrentUser();
      setLocation("/login");
    } catch {
      setLocation("/login");
    }
  };

  // Core Operating Navigation (Immediate floor operations)
  const operateNavItems = [
    { key: "orders" as TabKey, label: "Live Orders", icon: ClipboardList, badge: liveOrdersCount, pulse: needsApprovalCount > 0 },
    { key: "kds" as TabKey, label: "Kitchen (KDS)", icon: ChefHat, badge: liveOrdersCount },
    { key: "tables" as TabKey, label: "Tables & Floor", icon: QrCode },
    { key: "waiter-calls" as TabKey, label: "Waiter Calls", icon: Bell, badge: waiterCallsCount, pulse: waiterCallsCount > 0 },
  ];

  // Business Management Navigation (Catalog, billing, staff, feedback)
  const manageNavItems = [
    { key: "menu" as TabKey, label: "Menu", icon: UtensilsCrossed },
    { key: "bills" as TabKey, label: "Bills & Payments", icon: Receipt },
    { key: "finance" as TabKey, label: "Finance", icon: Wallet },
    { key: "staff" as TabKey, label: "Staff & Roles", icon: Users },
    { key: "reviews" as TabKey, label: "Customer Reviews", icon: Star },
  ];

  // System Administration Navigation
  const systemNavItems = [
    { key: "settings" as TabKey, label: "Settings", icon: Settings },
    { key: "plans" as TabKey, label: "Plan & Billing", icon: Sparkles },
  ];

  // More Operations (Specialized tools)
  const moreNavItems = [
    {
      key: "shift-close" as TabKey,
      label: "Shift Close",
      icon: Scale,
      locked: !canUseFeature(canonicalPlanId, "shift_close"),
      requiredPlan: "Pro",
    },
    {
      key: "audit-logs" as TabKey,
      label: "Security & Audit",
      icon: Shield,
      locked: !canUseFeature(canonicalPlanId, "audit_logs"),
      requiredPlan: "Pro",
    },
  ];

  const moreNavKeys = ["shift-close", "audit-logs"];
  const isMoreActive = moreNavKeys.includes(activeTab);
  const showMoreTools = moreToolsOpen || isMoreActive;

  if (loading && !dashboard && !error) {
    return <OwnerWorkspaceLoader message="Loading Tableline restaurant workspace…" />;
  }

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col justify-between select-none overflow-hidden" id="portal-sidebar-container">
      {/* Scrollable Navigation Area (compact, scannable in 2 seconds) */}
      <div className="px-3 pt-3 pb-2 space-y-3 overflow-y-auto hide-scrollbar flex-1 min-h-0">
        {/* Brand Header */}
        <div className="px-1.5 pt-0.5 pb-1">
          <Link href={`/${slug}/admin`} className="flex items-center gap-2 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3D2314] text-[#FAF7F2] shadow-xs shrink-0">
              <Leaf className="h-4 w-4 fill-[#FAF7F2]" />
            </div>
            <div className="min-w-0">
              <div className="font-serif text-base font-bold text-[#241B16] dark:text-[#F7F4F0] leading-none tracking-tight">
                Tableline
              </div>
              <p className="text-[10px] text-[#8A7D73] dark:text-stone-400 truncate mt-0.5 font-medium">
                {restaurantName}
              </p>
            </div>
          </Link>
        </div>

        {/* TOP LEVEL OVERVIEW */}
        <div>
          <button
            type="button"
            onClick={() => {
              setActiveTab("overview");
              setMobileSidebarOpen(false);
            }}
            id="sidebar-nav-overview"
            className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-all ${
              activeTab === "overview"
                ? "bg-[#EDE4D8] dark:bg-stone-800 text-[#3D2314] dark:text-amber-200 font-bold shadow-2xs"
                : "text-[#5C5047] dark:text-stone-300 hover:bg-[#F2ECE3]/80 dark:hover:bg-stone-800/60 font-medium"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <LayoutDashboard className={`h-3.5 w-3.5 shrink-0 ${activeTab === "overview" ? "text-[#3D2314] dark:text-amber-300" : "text-[#8A7D73]"}`} />
              <span className="truncate">Overview</span>
            </div>
          </button>
        </div>

        {/* 1. OPERATE SECTION */}
        <div>
          <div className="px-2 mb-1 text-[9.5px] font-bold uppercase tracking-wider text-[#8A7D73] dark:text-stone-500">
            Operate
          </div>
          <nav className="space-y-0.5">
            {operateNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.key);
                    setMobileSidebarOpen(false);
                  }}
                  id={`sidebar-nav-${item.key}`}
                  className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-all ${
                    isActive
                      ? "bg-[#EDE4D8] dark:bg-stone-800 text-[#3D2314] dark:text-amber-200 font-bold shadow-2xs"
                      : "text-[#5C5047] dark:text-stone-300 hover:bg-[#F2ECE3]/80 dark:hover:bg-stone-800/60 font-medium"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-[#3D2314] dark:text-amber-300" : "text-[#8A7D73]"}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.2 text-[10px] font-bold font-sans tabular-nums ${
                        item.pulse
                          ? "bg-[#FFEDE2] text-[#C85A17] border border-[#FCD4BC] animate-pulse"
                          : "bg-[#FDECE2] dark:bg-amber-950/80 text-[#D96528] dark:text-amber-300"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* 2. MANAGE SECTION */}
        <div>
          <div className="px-2 mb-1 text-[9.5px] font-bold uppercase tracking-wider text-[#8A7D73] dark:text-stone-500">
            Manage
          </div>
          <nav className="space-y-0.5">
            {manageNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.key);
                    setMobileSidebarOpen(false);
                  }}
                  id={`sidebar-nav-${item.key}`}
                  className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-all ${
                    isActive
                      ? "bg-[#EDE4D8] dark:bg-stone-800 text-[#3D2314] dark:text-amber-200 font-bold shadow-2xs"
                      : "text-[#5C5047] dark:text-stone-300 hover:bg-[#F2ECE3]/80 dark:hover:bg-stone-800/60 font-medium"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-[#3D2314] dark:text-amber-300" : "text-[#8A7D73]"}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* 3. SYSTEM SECTION */}
        <div>
          <div className="px-2 mb-1 text-[9.5px] font-bold uppercase tracking-wider text-[#8A7D73] dark:text-stone-500">
            System
          </div>
          <nav className="space-y-0.5">
            {systemNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.key);
                    setMobileSidebarOpen(false);
                  }}
                  id={`sidebar-nav-${item.key}`}
                  className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-all ${
                    isActive
                      ? "bg-[#EDE4D8] dark:bg-stone-800 text-[#3D2314] dark:text-amber-200 font-bold shadow-2xs"
                      : "text-[#5C5047] dark:text-stone-300 hover:bg-[#F2ECE3]/80 dark:hover:bg-stone-800/60 font-medium"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-[#3D2314] dark:text-amber-300" : "text-[#8A7D73]"}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* 4. MORE TOOLS (Collapsible group) */}
        <div>
          <button
            type="button"
            onClick={() => setMoreToolsOpen((prev) => !prev)}
            id="button-toggle-more-tools"
            className={`w-full flex items-center justify-between rounded-lg px-2 py-1 text-[11px] font-semibold transition-all ${
              isMoreActive
                ? "text-[#3D2314] dark:text-amber-300 bg-[#F2ECE3]/60 dark:bg-stone-800/40"
                : "text-[#8A7D73] dark:text-stone-400 hover:text-[#241B16] dark:hover:text-stone-200 hover:bg-[#F2ECE3]/40"
            }`}
            aria-expanded={showMoreTools}
          >
            <div className="flex items-center gap-1.5">
              <MoreHorizontal className="h-3.5 w-3.5 text-[#8A7D73]" />
              <span>More Tools</span>
            </div>
            <div className="flex items-center gap-1">
              {isMoreActive && (
                <span className="h-1.5 w-1.5 rounded-full bg-[#C85A17]" />
              )}
              <ChevronDown
                className={`h-3 w-3 transition-transform duration-200 ${
                  showMoreTools ? "rotate-180" : ""
                }`}
              />
            </div>
          </button>

          {showMoreTools && (
            <nav className="mt-1 space-y-0.5 pl-2 border-l border-[#EDE4D8] dark:border-stone-800 ml-2 animate-in fade-in duration-150">
              {moreNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.key);
                      setMobileSidebarOpen(false);
                    }}
                    id={`sidebar-nav-${item.key}`}
                    className={`w-full flex items-center justify-between rounded-md px-2 py-1.5 text-xs transition-all ${
                      isActive
                        ? "bg-[#EDE4D8] dark:bg-stone-800 text-[#3D2314] dark:text-amber-200 font-bold shadow-2xs"
                        : "text-[#5C5047] dark:text-stone-300 hover:bg-[#F2ECE3]/80 dark:hover:bg-stone-800/60 font-medium"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-[#3D2314] dark:text-amber-300" : "text-[#8A7D73]"}`} />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.locked && (
                      <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-stone-200/80 dark:bg-stone-800 text-stone-600 dark:text-stone-400 flex items-center gap-0.5 shrink-0">
                        <Lock className="h-2.5 w-2.5" />
                        {item.requiredPlan}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      </div>

      {/* Sidebar Footer — Compact Plan Card & Account area with proper breathing room */}
      <div className="shrink-0 pt-2 pb-5 sm:pb-6 px-3 space-y-2 border-t border-[#EDE4D8]/80 dark:border-stone-800 bg-[#FAF7F2] dark:bg-[#1A1816]">
        {/* Compact Plan Card matching Image 2 & guideline specification */}
        <div className="rounded-xl border border-[#EDE4D8] dark:border-stone-800 bg-white/70 dark:bg-stone-900/70 p-2.5 space-y-1 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <Crown className="h-3.5 w-3.5 text-[#D96528] dark:text-amber-400 shrink-0" />
              <span className="font-serif text-xs font-bold text-[#241B16] dark:text-[#F7F4F0] truncate">
                {PLAN_DEFINITIONS[canonicalPlanId]?.name || "Starter"} Plan
              </span>
            </div>
            <span className="rounded bg-[#E8F7EE] text-[#1E7E45] border border-[#C4EBCF] dark:bg-emerald-950/60 dark:text-emerald-300 px-1.5 py-0.2 text-[9.5px] font-bold shrink-0">
              Active
            </span>
          </div>
          <div className="flex items-center justify-between text-[10.5px] text-[#8A7D73] dark:text-stone-400 pt-0.5">
            <span>
              {PLAN_DEFINITIONS[canonicalPlanId]?.priceMonthly > 0 ? (
                <>
                  {currency}<span className="font-sans tabular-nums">{PLAN_DEFINITIONS[canonicalPlanId].priceMonthly}</span>/mo
                </>
              ) : (
                "Free Forever"
              )}
            </span>
            <button
              type="button"
              onClick={() => setActiveTab("plans")}
              className="font-bold text-[#3D2314] dark:text-amber-300 hover:underline inline-flex items-center"
            >
              Manage →
            </button>
          </div>
        </div>

        {/* Customer Menu Link & Sign Out Button with comfortable bottom breathing room */}
        <div className="flex items-center justify-between px-0.5 text-xs">
          <Link
            href={`/menu/${slug}/table/1`}
            target="_blank"
            className="flex items-center gap-1 text-[11px] text-[#8A7D73] hover:text-[#241B16] dark:hover:text-stone-200 font-medium transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            <span>Customer Menu</span>
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-1 text-[11px] text-[#8A7D73] hover:text-red-600 dark:hover:text-red-400 font-semibold transition-colors"
            id="button-sidebar-sign-out"
          >
            <LogOut className="h-3 w-3" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={`h-screen w-screen overflow-hidden flex transition-colors duration-200 ${
        isDark ? "dark bg-[#141211] text-[#F7F4F0]" : "bg-[#FAF7F2] text-[#241B16]"
      }`}
      id="dashboard-portal-root"
    >
      {/* Mobile Drawer Backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs lg:hidden animate-in fade-in"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-[#EDE4D8] dark:border-stone-800 bg-[#FAF7F2] dark:bg-[#1A1816] shadow-xl transition-transform duration-200 lg:hidden overflow-y-auto hide-scrollbar ${
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {renderSidebarContent()}
      </aside>

      {/* Desktop Left Sidebar (Stationary, fixed height with internal fit/scroll) */}
      <aside className="hidden lg:flex w-60 xl:w-64 h-screen shrink-0 flex-col border-r border-[#EDE4D8] dark:border-stone-800 bg-[#FAF7F2] dark:bg-[#1A1816] overflow-hidden select-none z-30">
        {renderSidebarContent()}
      </aside>

      {/* Main Content Area (Stationary Header + Scrollable Workspace) */}
      <div className="flex-1 flex flex-col h-screen min-w-0 overflow-hidden bg-[#FAF7F2] dark:bg-[#141211]">
        {/* Top Header (Image 2) */}
        <header
          className={`shrink-0 border-b backdrop-blur-md px-4 sm:px-6 py-2.5 sm:py-3 transition-colors duration-200 z-20 ${
            isDark
              ? "border-stone-800 bg-[#141211]/95 text-[#F7F4F0]"
              : "border-[#EDE4D8] bg-[#FAF7F2]/95 text-[#241B16]"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            {/* Left: Mobile Toggle & Restaurant Identity */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="lg:hidden rounded-xl border border-[#EDE4D8] dark:border-stone-800 p-2 text-[#8A7D73]"
              >
                <Menu className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <img
                    src="/cafe_photo_1.jpg"
                    alt={restaurantName}
                    className="h-10 w-10 rounded-full object-cover border border-[#EDE4D8] dark:border-stone-700 shadow-2xs"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = "none";
                    }}
                  />
                  <div className="hidden flex h-10 w-10 items-center justify-center rounded-full bg-[#3D2314] text-white shadow-2xs font-serif font-bold text-sm">
                    {restaurantName.charAt(0)}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-serif text-base font-bold leading-none text-[#241B16] dark:text-[#F7F4F0]">
                      {restaurantName}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-[#8A7D73]" />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="flex items-center gap-1 text-[11px] text-[#8A7D73] dark:text-stone-400">
                      <MapPin className="h-3 w-3" />
                      {restaurantCity}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#E8F7EE] text-[#1E7E45] border border-[#C4EBCF] dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Open
                      <ChevronDown className="h-2.5 w-2.5 opacity-60 ml-0.5" />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Actions: Notifications, Chime, Dark Mode, Profile */}
            <div className="flex items-center gap-2.5">

              {/* Notification Bell with alert dot */}
              <button
                type="button"
                onClick={() => setActiveTab("orders")}
                className="relative rounded-full border border-[#EDE4D8] dark:border-stone-800 bg-white/80 dark:bg-stone-900 p-2 text-[#5C5047] hover:bg-white transition-colors shadow-2xs"
                title="Orders notification"
              >
                <Bell className="h-4 w-4" />
                {liveOrdersCount > 0 && (
                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-stone-900" />
                )}
              </button>

              {/* Global Chime Audio Toggle */}
              <button
                type="button"
                onClick={toggleGlobalSound}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors shadow-2xs ${
                  soundEnabled
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "border-[#EDE4D8] bg-white/80 text-[#8A7D73] dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400"
                }`}
                title="Toggle order arrival chime"
                id="button-dashboard-sound-toggle"
              >
                {soundEnabled ? (
                  <>
                    <Volume2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="hidden sm:inline font-semibold text-[11px]">Chime On</span>
                  </>
                ) : (
                  <>
                    <VolumeX className="h-3.5 w-3.5 opacity-60" />
                    <span className="hidden sm:inline text-[11px]">Muted</span>
                  </>
                )}
              </button>

              {/* Dark Mode Toggle */}
              <button
                type="button"
                onClick={toggleTheme}
                className={`inline-flex items-center justify-center rounded-full border border-[#EDE4D8] dark:border-stone-800 bg-white/80 dark:bg-stone-900 p-2 text-[#5C5047] hover:bg-white transition-colors shadow-2xs ${
                  isDark ? "text-amber-300" : ""
                }`}
                title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
                id="button-admin-toggle-dark"
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>

              {/* Owner Profile Avatar Capsule */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOwnerDropdownOpen((prev) => !prev)}
                  className="flex items-center gap-2 rounded-full border border-[#EDE4D8] dark:border-stone-800 bg-white/80 dark:bg-stone-900 pl-1.5 pr-2.5 py-1 text-xs font-semibold shadow-2xs hover:bg-white transition-colors"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#3D2314] text-white dark:bg-amber-400 dark:text-stone-900 font-bold text-[11px]">
                    {dAny?.operatorName?.charAt(0) || "O"}
                  </div>
                  <span className="hidden md:inline font-serif text-xs text-[#241B16] dark:text-[#F7F4F0]">
                    {dAny?.operatorName || "Owner"}
                  </span>
                  <ChevronDown className="h-3 w-3 text-[#8A7D73]" />
                </button>

                {ownerDropdownOpen && (
                  <div
                    className="absolute right-0 top-full mt-1.5 w-48 rounded-2xl border border-[#EDE4D8] dark:border-stone-800 bg-white dark:bg-stone-900 p-1.5 shadow-xl z-50 text-xs"
                    onClick={() => setOwnerDropdownOpen(false)}
                  >
                    <div className="px-3 py-2 border-b border-[#EDE4D8] dark:border-stone-800">
                      <p className="font-serif font-bold text-[#241B16] dark:text-[#F7F4F0]">
                        {dAny?.operatorName || "Restaurant Owner"}
                      </p>
                      <p className="text-[10px] text-[#8A7D73] dark:text-stone-400">
                        {dAny?.userEmail || "Signed in"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("settings")}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#FAF7F2] dark:hover:bg-stone-800 rounded-xl text-[#241B16] dark:text-stone-200 transition-colors"
                    >
                      <Settings className="h-3.5 w-3.5" />
                      Restaurant Settings
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("plans")}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#FAF7F2] dark:hover:bg-stone-800 rounded-xl text-[#241B16] dark:text-stone-200 transition-colors"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                      Plan &amp; Billing
                    </button>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl text-red-600 dark:text-red-400 border-t border-[#EDE4D8] dark:border-stone-800 mt-1 transition-colors"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Main Workspace (Stationary sidebar, internal scrolling, hide scrollbar) */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden hide-scrollbar flex flex-col justify-between" id="portal-main-scrollable">
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto w-full">
            <AudioAlertBanner className="mb-6" />

            {activeTab === "overview" && (
              <OwnerDashboardView
                slug={slug}
                dashboard={dashboard}
                loading={loading}
                error={Boolean(error)}
                queryError={queryError}
                retry={retry}
                onSelectTab={(tab) => setActiveTab(tab as TabKey)}
              />
            )}

            {activeTab === "captain" && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-[#FAF7F2] dark:bg-[#1A1816] p-2 rounded-2xl border border-[#EDE4D8] dark:border-stone-800">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCaptainMode("floorplan")}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        captainMode === "floorplan"
                          ? "bg-[#3D2314] text-white shadow-2xs"
                          : "text-[#776B62] dark:text-stone-400 hover:text-[#241B16]"
                      }`}
                    >
                      Live Tables &amp; Service Pings
                    </button>
                    <button
                      type="button"
                      onClick={() => setCaptainMode("ordering")}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        captainMode === "ordering"
                          ? "bg-[#3D2314] text-white shadow-2xs"
                          : "text-[#776B62] dark:text-stone-400 hover:text-[#241B16]"
                      }`}
                    >
                      Staff Mobile Order Taking
                    </button>
                  </div>

                  <Link
                    href={`/captain/${slug}`}
                    target="_blank"
                    className="text-xs font-bold text-amber-800 dark:text-amber-400 hover:underline flex items-center gap-1 px-2"
                  >
                    <span>Launch Dedicated Captain PWA</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>

                {captainMode === "floorplan" ? (
                  <CaptainDashboard
                    restaurantId={slug}
                    restaurantName={restaurantName}
                    currency={currency}
                    onNavigateTab={(t) => setActiveTab(t as TabKey)}
                  />
                ) : canUseFeature(canonicalPlanId, "captain_ordering") ? (
                  <CaptainOrderingView slug={slug} onNavigateTab={(t) => setActiveTab(t as TabKey)} />
                ) : (
                  <PlanLockedCard
                    title="Captain Mobile Web Ordering"
                    description="Enable staff to take dine-in orders directly from their phones and send them to the kitchen display."
                    requiredPlan="Growth"
                    onUpgrade={() => setActiveTab("plans")}
                  />
                )}
              </div>
            )}

            {activeTab === "bills" && (
              <BillsManagement
                slug={slug}
                restaurantName={restaurantName}
                currency={currency}
              />
            )}

            {activeTab === "orders" && (
              <OrdersManagement
                slug={slug}
                restaurantName={restaurantName}
                currency={currency}
              />
            )}

            {activeTab === "shift-close" && (
              canUseFeature(canonicalPlanId, "shift_close") ? (
                <ShiftCloseView slug={slug} onNavigateTab={(t) => setActiveTab(t as TabKey)} />
              ) : (
                <PlanLockedCard
                  title="Shift Close & Day-End Settlement"
                  description="Reconcile physical cash counted in drawer against server-calculated expected cash, record immutable shift settlements, and audit drawer discrepancies."
                  requiredPlan="Pro"
                  onUpgrade={() => setActiveTab("plans")}
                />
              )
            )}

            {activeTab === "kds" && (
              <KdsView
                slug={slug}
                restaurantName={restaurantName}
                currency={currency}
              />
            )}

            {activeTab === "waiter-calls" && (
              canUseFeature(canonicalPlanId, "service_calls") ? (
                <WaiterCallsView slug={slug} />
              ) : (
                <PlanLockedCard
                  title="Waiter Call System"
                  description="Real-time diner service requests (water, captain, bill) from QR digital menus."
                  requiredPlan="Growth"
                  onUpgrade={() => setActiveTab("plans")}
                />
              )
            )}

            {activeTab === "menu" && (
              <MenuManagement
                slug={slug}
                currency={currency}
                planId={canonicalPlanId}
                onUpgrade={() => setActiveTab("plans")}
              />
            )}

            {activeTab === "tables" && (
              <TablesManagement
                slug={slug}
                restaurantName={restaurantName}
                tagline={dAny?.restaurant?.tagline}
                logoUrl={dAny?.restaurant?.logoUrl || dAny?.restaurant?.logo}
              />
            )}

            {activeTab === "finance" && (
              <FinanceView
                restaurantSlug={slug}
                restaurantPlan={canonicalPlanId}
                userRole={userRole}
                onOpenUpgrade={() => setActiveTab("plans")}
              />
            )}

            {activeTab === "reviews" && (
              canUseFeature(canonicalPlanId, "diner_reviews") ? (
                <FeedbackView slug={slug} />
              ) : (
                <PlanLockedCard
                  title="Customer Reviews & Ratings"
                  description="Collect diner feedback and star ratings directly from digital table menus."
                  requiredPlan="Growth"
                  onUpgrade={() => setActiveTab("plans")}
                />
              )
            )}

            {activeTab === "staff" && (
              canUseFeature(canonicalPlanId, "staff_rbac") ? (
                <StaffManagementView slug={slug} />
              ) : (
                <PlanLockedCard
                  title="Staff Role Management (RBAC)"
                  description="Invite staff members with role-based access control and kitchen routing."
                  requiredPlan="Growth"
                  onUpgrade={() => setActiveTab("plans")}
                />
              )
            )}

            {activeTab === "audit-logs" && (
              canUseFeature(canonicalPlanId, "audit_logs") ? (
                <AuditLogsView slug={slug} />
              ) : (
                <PlanLockedCard
                  title="Security & Audit Logs"
                  description="Activity timeline and security audits for restaurant operations."
                  requiredPlan="Pro"
                  onUpgrade={() => setActiveTab("plans")}
                />
              )
            )}

            {activeTab === "plans" && (
              <PlanEntitlementsView
                currentPlanId={canonicalPlanId}
                activePlanRequest={dAny?.activePlanRequest || dAny?.planRequest}
                usage={dAny?.usage}
                slug={slug}
                onPlanUpdated={retry}
              />
            )}

            {activeTab === "settings" && (
              <RestaurantSettings
                slug={slug}
                currentPlan={canonicalPlanId}
                onNavigateToPlans={() => setActiveTab("plans")}
              />
            )}
          </main>

          {/* Footer (Image 2) */}
          <footer className="max-w-[1400px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#8A7D73] dark:text-stone-500 border-t border-[#EDE4D8]/70 dark:border-stone-800/70 mt-auto">
            <div>
              <span className="font-semibold text-[#241B16] dark:text-stone-300">Tableline</span> © {new Date().getFullYear()} · Smart Dining, Happier Guests.
            </div>
            <div className="flex items-center gap-1.5">
              <Leaf className="h-3.5 w-3.5 text-[#3D2314] fill-[#3D2314] dark:text-amber-400 dark:fill-amber-400" />
              <span>Made for great food experiences.</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
