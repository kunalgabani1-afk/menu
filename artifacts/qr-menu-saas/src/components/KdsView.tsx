import React, { useEffect, useState, useMemo } from "react";
import {
  ChefHat,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Volume2,
  VolumeX,
  Bell,
  Check,
  Flame,
  Maximize2,
  Minimize2,
  AlertTriangle,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getIdToken } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { orderAudioAlert } from "@/lib/orderAudioAlert";
import { AudioAlertBanner } from "./AudioAlertBanner";
import { TablelineLoader, TablelineButtonContent } from "./TablelineLoading";
import { formatTableWithDiner } from "@/lib/groupTab";

interface KdsViewProps {
  slug: string;
  restaurantName?: string;
  currency?: string;
}

export type KdsFilter = "ALL" | "URGENT" | "NEW" | "PREPARING" | "READY";
export type UrgencyLevel = "NORMAL" | "ATTENTION" | "URGENT";

export function KdsView({ slug, restaurantName = "Kitchen Pass", currency = "₹" }: KdsViewProps) {
  const { toast } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [activeFilter, setActiveFilter] = useState<KdsFilter>("ALL");
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => orderAudioAlert.isSoundEnabled());
  const [isLoudMode, setIsLoudMode] = useState<boolean>(() => {
    return localStorage.getItem("tableline_kds_loud_mode") === "true";
  });
  const [newOrderAlertBanner, setNewOrderAlertBanner] = useState<{ id: string; tableNumber: string; itemsCount: number } | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const knownOrderIdsRef = React.useRef<Set<string>>(new Set());

  // 1. Network Listener (Logic)
  const { isOffline } = useNetworkStatus();
  const prevOfflineRef = React.useRef<boolean>(isOffline);

  // 3. Audio Alert Trigger (UX)
  // Monitor the transition from online to offline.
  // The exact moment the network drops, trigger an HTML5 Audio object to play a loud alert sound.
  useEffect(() => {
    if (!prevOfflineRef.current && isOffline) {
      try {
        const audio = new Audio("/assets/error-chime.mp3");
        audio.volume = 1.0;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn("[KDS Fail-Safe] Audio playback blocked by browser:", err);
          });
        }
      } catch (err) {
        console.error("[KDS Fail-Safe] Failed to play error-chime.mp3:", err);
      }
    }
    prevOfflineRef.current = isOffline;
  }, [isOffline]);

  // Clock tick every 10 seconds for prep timers
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const isInitialKdsFetchRef = React.useRef(true);

  const toggleSound = () => {
    const next = !soundEnabled;
    orderAudioAlert.setSoundEnabled(next);
    setSoundEnabled(next);
    if (next) orderAudioAlert.testKitchenSound();
  };

  const toggleLoudMode = () => {
    const next = !isLoudMode;
    setIsLoudMode(next);
    localStorage.setItem("tableline_kds_loud_mode", String(next));
    if (next) {
      orderAudioAlert.testLoudSound();
      toast({
        title: "🔊 Loud Kitchen Alert Mode Enabled",
        description: "Higher acoustic volume and dual burst alert activated for noisy kitchens.",
      });
    } else {
      toast({
        title: "Standard Chime Mode",
        description: "Normal service bell volume restored.",
      });
    }
  };

  const fetchOrders = async () => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/orders?limit=60`, { headers });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.orders || [];
        // Kitchen only prepares active kitchen orders: APPROVED, ACCEPTED, NEW (if approved), PREPARING, READY
        // Orders that are DECLINED, CANCELLED, or COMPLETED must never show in KDS
        const active = list.filter((o: any) => {
          const st = o.status || "NEW";
          if (st === "DECLINED" || st === "CANCELLED" || st === "COMPLETED") return false;
          return ["APPROVED", "ACCEPTED", "NEW", "PREPARING", "READY", "NEEDS_APPROVAL", "PENDING_WAITER_APPROVAL"].includes(st);
        });

        // Mark existing records on initial load so NO historical sound can play on refresh
        if (isInitialKdsFetchRef.current) {
          orderAudioAlert.markInitialOrdersSeen(active);
          isInitialKdsFetchRef.current = false;
        }

        knownOrderIdsRef.current = new Set(active.map((o: any) => o.id));
        setOrders(active);
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    orderAudioAlert.setActiveWorkspace("kds");
    orderAudioAlert.connect(slug);
    fetchOrders();

    const unsubRefresh = orderAudioAlert.onDataRefresh(() => {
      fetchOrders();
    });

    const unsubNewOrder = orderAudioAlert.onNewOrder((newOrder) => {
      const st = newOrder.status || "NEW";
      if (st === "DECLINED" || st === "CANCELLED" || st === "COMPLETED") return;

      const rawTable = String(newOrder.tableNumber || "—");
      const formattedTable = /^\d+$/.test(rawTable) ? `Table ${rawTable.padStart(2, "0")}` : `Table ${rawTable}`;
      const itemsCount = Array.isArray(newOrder.items)
        ? newOrder.items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0)
        : 1;

      setNewOrderAlertBanner({
        id: newOrder.id || String(newOrder.orderNumber) || "",
        tableNumber: formattedTable,
        itemsCount,
      });
      setTimeout(() => setNewOrderAlertBanner(null), 8000);

      // Instantaneous 0.001ms ticket display
      setOrders((prev) => {
        if (prev.some((o) => o.id === newOrder.id)) return prev;
        return [newOrder, ...prev];
      });

      if (orderAudioAlert.isKitchenAlertsEnabled()) {
        orderAudioAlert.playKitchenAlertSound();
      }
    });

    const unsubApproved = orderAudioAlert.onOrderApprovedForKds((event) => {
      const rawTable = String(event.tableNumber || "—");
      const formattedTable = /^\d+$/.test(rawTable) ? `Table ${rawTable.padStart(2, "0")}` : `Table ${rawTable}`;
      setNewOrderAlertBanner({
        id: event.orderId || String(event.orderNumber) || "",
        tableNumber: formattedTable,
        itemsCount: event.itemsCount || 1,
      });
      setTimeout(() => setNewOrderAlertBanner(null), 8000);
      fetchOrders();
    });

    const interval = setInterval(fetchOrders, 4000);
    return () => {
      clearInterval(interval);
      unsubRefresh();
      unsubNewOrder();
      unsubApproved();
      orderAudioAlert.setActiveWorkspace("all");
    };
  }, [slug]);

  // Status transitions
  const handleUpdateStatus = async (orderId: string, nextStatus: string) => {
    setUpdatingId(orderId);
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
          title: `Ticket moved to ${nextStatus.toLowerCase()}`,
        });
        if (nextStatus === "COMPLETED") {
          setOrders((prev) => prev.filter((o) => o.id !== orderId));
        } else {
          // IMPORTANT: Changing status to PREPARING or READY DOES NOT change createdAt!
          // Elapsed time and urgency are preserved!
          setOrders((prev) =>
            prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
          );
        }
      }
    } catch {
      toast({ variant: "destructive", title: "Could not update status" });
    } finally {
      setUpdatingId(null);
    }
  };

  const toggleCheckItem = (orderId: string, itemIdx: number) => {
    const key = `${orderId}-${itemIdx}`;
    setCheckedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Elapsed minutes from order creation
  const getMinutesElapsed = (createdAt?: number | string) => {
    if (!createdAt) return 0;
    const orderTime = typeof createdAt === "string" ? new Date(createdAt).getTime() : createdAt;
    return Math.max(0, Math.floor((currentTime - orderTime) / 60000));
  };

  // Explicit Urgency Calculation based purely on elapsed time (Sections 23, 24, 25, 26)
  // < 5 min: NORMAL
  // 5–10 min: ATTENTION
  // > 10 min: URGENT
  const getUrgencyLevel = (mins: number): UrgencyLevel => {
    if (mins >= 10) return "URGENT";
    if (mins >= 5) return "ATTENTION";
    return "NORMAL";
  };

  // Operational Urgency Sorting (Section 30)
  // URGENT -> ATTENTION -> NORMAL, and within same urgency: oldest order first!
  const sortedAndFilteredOrders = useMemo(() => {
    const ordersWithMeta = orders.map((o) => {
      const mins = getMinutesElapsed(o.createdAt);
      const urgency = getUrgencyLevel(mins);
      const orderTime = typeof o.createdAt === "string" ? new Date(o.createdAt).getTime() : (o.createdAt || 0);
      return {
        ...o,
        _mins: mins,
        _urgency: urgency,
        _orderTime: orderTime,
      };
    });

    // 1. Filter
    const filtered = ordersWithMeta.filter((o) => {
      const st = o.status || "NEW";
      if (activeFilter === "ALL") return true;
      if (activeFilter === "URGENT") return o._urgency === "URGENT";
      if (activeFilter === "NEW") return st === "NEW" || st === "APPROVED" || st === "ACCEPTED";
      if (activeFilter === "PREPARING") return st === "PREPARING";
      if (activeFilter === "READY") return st === "READY";
      return true;
    });

    // 2. Sort: URGENT first (weight 3), ATTENTION (weight 2), NORMAL (weight 1)
    // Within tier: oldest order first (lowest _orderTime)
    filtered.sort((a, b) => {
      const urgencyWeight: Record<UrgencyLevel, number> = {
        URGENT: 3,
        ATTENTION: 2,
        NORMAL: 1,
      };

      const diffWeight = urgencyWeight[b._urgency] - urgencyWeight[a._urgency];
      if (diffWeight !== 0) return diffWeight;

      // Oldest order first
      return a._orderTime - b._orderTime;
    });

    return filtered;
  }, [orders, currentTime, activeFilter]);

  // Counts for filter badges
  const urgentCount = useMemo(() => {
    return orders.filter((o) => getMinutesElapsed(o.createdAt) >= 10).length;
  }, [orders, currentTime]);

  const newCount = useMemo(() => {
    return orders.filter((o) => {
      const st = o.status || "NEW";
      return st === "NEW" || st === "APPROVED" || st === "ACCEPTED";
    }).length;
  }, [orders]);

  const prepCount = useMemo(() => {
    return orders.filter((o) => o.status === "PREPARING").length;
  }, [orders]);

  const readyCount = useMemo(() => {
    return orders.filter((o) => o.status === "READY").length;
  }, [orders]);

  return (
    <div
      className={`space-y-4 ${
        isFocusMode
          ? "fixed inset-0 z-50 bg-[#161413] text-[#F7F4F0] p-4 sm:p-6 overflow-y-auto"
          : ""
      }`}
      id="kds-view"
    >
      {/* 2. The "Code Red" Banner (UI) */}
      {isOffline && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed top-0 left-0 w-full z-50 bg-red-600 text-white font-sans font-bold uppercase tracking-wider py-4 text-center shadow-lg"
          id="kds-code-red-banner"
        >
          ⚠️ WIFI LOST - KITCHEN IS OFFLINE - SWITCH TO PAPER CHITS.
        </div>
      )}

      {/* KDS Header & Operational Controls (Section 21) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/70 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 grid place-items-center">
            <ChefHat className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Kitchen Display System (KDS)
              </h1>
              <span className="rounded-full bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 px-2 py-0.5 text-[11px] font-bold font-sans tabular-nums">
                {orders.length}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Urgency prioritized by elapsed waiting time · Oldest orders bump first
            </p>
          </div>
        </div>

        {/* Top Control Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Sound toggle */}
          <button
            type="button"
            onClick={toggleSound}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
              soundEnabled
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-border bg-card text-muted-foreground"
            }`}
            title="Toggle kitchen chime alert"
            id="button-kds-toggle-sound"
          >
            {soundEnabled ? (
              <>
                <Volume2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Chime On</span>
              </>
            ) : (
              <>
                <VolumeX className="h-3.5 w-3.5 opacity-60" />
                <span>Muted</span>
              </>
            )}
          </button>

          {/* Loud Kitchen Mode */}
          <button
            type="button"
            onClick={toggleLoudMode}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
              isLoudMode
                ? "border-rose-400 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 font-bold"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
            title="High volume alert for busy, noisy kitchens"
            id="button-kds-toggle-loud"
          >
            <Bell className={`h-3.5 w-3.5 ${isLoudMode ? "text-rose-600 animate-bounce" : "text-muted-foreground"}`} />
            <span>{isLoudMode ? "Loud Bell (ON)" : "Standard Vol"}</span>
          </button>

          {/* Refresh */}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchOrders}
            className="rounded-xl h-8 text-xs gap-1"
            title="Refresh kitchen orders"
            id="button-kds-refresh"
          >
            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Refresh</span>
          </Button>

          {/* Dedicated KDS Focus / Full-Screen Mode (Section 32) */}
          <Button
            variant={isFocusMode ? "default" : "outline"}
            size="sm"
            onClick={() => setIsFocusMode((prev) => !prev)}
            className="rounded-xl h-8 text-xs gap-1 font-bold"
            title="Toggle focus mode for kitchen tablets & line stations"
            id="button-kds-focus-mode"
          >
            {isFocusMode ? (
              <>
                <Minimize2 className="h-3.5 w-3.5" />
                <span>Exit Focus</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5" />
                <span>Focus KDS</span>
              </>
            )}
          </Button>
        </div>
      </div>

      <AudioAlertBanner />

      {/* Flashing Urgent New Ticket Banner */}
      {newOrderAlertBanner && (
        <div className="rounded-2xl border-2 border-rose-500 bg-rose-500 text-white p-3.5 flex items-center justify-between shadow-lg animate-pulse" id="kds-new-ticket-banner">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-white text-rose-600 flex items-center justify-center font-black text-lg shadow-xs">
              🔔
            </div>
            <div>
              <p className="font-display font-black text-base sm:text-lg tracking-tight leading-tight">
                NEW TICKET: TABLE <span className="font-sans tabular-nums">{newOrderAlertBanner.tableNumber.replace(/^Table\s*/i, "")}</span>
              </p>
              <p className="text-xs font-semibold opacity-90">
                <span className="font-sans tabular-nums">{newOrderAlertBanner.itemsCount}</span> item{newOrderAlertBanner.itemsCount !== 1 ? "s" : ""} sent straight to kitchen pass
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setNewOrderAlertBanner(null)}
            className="rounded-xl font-bold text-xs bg-white text-rose-700 hover:bg-white/90"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* KDS FILTER BAR (Section 31 - Simple, focused, operational) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {[
          { key: "ALL" as KdsFilter, label: "All Tickets", count: orders.length },
          { key: "URGENT" as KdsFilter, label: "Urgent (>10m)", count: urgentCount, isUrgent: true },
          { key: "NEW" as KdsFilter, label: "New / Approved", count: newCount },
          { key: "PREPARING" as KdsFilter, label: "Cooking", count: prepCount },
          { key: "READY" as KdsFilter, label: "Ready to Serve", count: readyCount },
        ].map((f) => {
          const isActive = activeFilter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setActiveFilter(f.key)}
              className={`h-8 px-3 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 ${
                isActive
                  ? "bg-[#3D2314] text-white dark:bg-stone-100 dark:text-stone-900 font-bold shadow-xs"
                  : f.isUrgent && f.count > 0
                  ? "border border-red-400 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 font-bold"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>{f.label}</span>
              {f.count !== undefined && (
                <span
                  className={`text-[10px] font-sans tabular-nums px-1.5 py-0.2 rounded-full ${
                    isActive
                      ? "bg-white/20 text-white dark:bg-stone-900/20 dark:text-stone-900"
                      : f.isUrgent && f.count > 0
                      ? "bg-red-600 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {f.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* KDS ORDERS GRID */}
      {loading ? (
        <TablelineLoader
          variant="card"
          message="Connecting to kitchen…"
          subtext="Syncing live tickets with kitchen pass…"
          onRetry={fetchOrders}
        />
      ) : sortedAndFilteredOrders.length === 0 ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 opacity-80" />
          <h3 className="mt-3 font-display text-lg font-bold">Kitchen Pass is Clear</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {activeFilter !== "ALL"
              ? `No tickets match the "${activeFilter.toLowerCase()}" filter.`
              : "No orders awaiting prep right now. Great job!"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sortedAndFilteredOrders.map((order) => {
            const items = Array.isArray(order.items) ? order.items : [];
            const status = order.status || "NEW";
            const mins = order._mins;
            const urgency = order._urgency as UrgencyLevel;

            // URGENCY COLORS (Time-based ONLY):
            // Red: Urgent (>10m)
            // Amber: Attention (5-10m)
            // Green/Neutral: Normal (<5m)
            const urgencyBorderClass =
              urgency === "URGENT"
                ? "border-l-4 border-l-red-600 border-red-500/30 bg-red-50/10 dark:bg-red-950/10"
                : urgency === "ATTENTION"
                ? "border-l-4 border-l-amber-500 border-amber-500/30 bg-amber-50/10 dark:bg-amber-950/10"
                : "border-l-4 border-l-emerald-600 border-border bg-card";

            const urgencyBadge =
              urgency === "URGENT" ? (
                <span className="inline-flex items-center gap-1 font-bold text-red-600 dark:text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full text-[11px] animate-pulse">
                  <span className="h-2 w-2 rounded-full bg-red-600" />
                  <span>URGENT</span>
                </span>
              ) : urgency === "ATTENTION" ? (
                <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full text-[11px]">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span>ATTENTION</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full text-[11px]">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span>NORMAL</span>
                </span>
              );

            return (
              <div
                key={order.id}
                className={`flex flex-col justify-between rounded-2xl border transition-all shadow-sm ${urgencyBorderClass}`}
                id={`kds-card-${order.id}`}
              >
                <div>
                  {/* TOP HEADER: Order Number, Table, Urgency Timer & Status Badge (Section 22 & 28) */}
                  <div className="p-3.5 border-b border-border/60 bg-muted/20 rounded-t-2xl">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-black text-base text-foreground font-mono">
                          #{order.orderNumber || order.id.slice(-4).toUpperCase()}
                        </span>
                        <span className="font-bold text-xs px-2 py-0.5 rounded-md bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900">
                          {formatTableWithDiner(
                            order.tableNumber,
                            order.dinerFirstName || order.customerName || (order.items && order.items[0]?.addedByDiner)
                          )}
                        </span>
                      </div>

                      {/* Explicit Status Badge (Separated from Urgency!) */}
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          status === "READY"
                            ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40"
                            : status === "PREPARING"
                            ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40"
                            : "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/40"
                        }`}
                      >
                        {status === "READY" ? "READY" : status === "PREPARING" ? "PREPARING" : "NEW"}
                      </span>
                    </div>

                    {/* Second Row: Elapsed Time & Urgency Level Indicator */}
                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-foreground">
                        <Clock className="h-3.5 w-3.5 opacity-70" />
                        <span><span className="font-sans tabular-nums">{mins}</span> min elapsed</span>
                      </div>
                      {urgencyBadge}
                    </div>

                    {(order.orderSource === "STAFF" || order.source === "STAFF" || order.source === "MANUAL") && (
                      <div className="mt-1.5">
                        <span className="rounded bg-amber-400 text-stone-950 px-1.5 py-0.5 text-[9.5px] font-black uppercase tracking-wider">
                          CAPTAIN: {order.createdByStaff?.name?.split(" ")[0] || "STAFF"}
                        </span>
                      </div>
                    )}

                    {/* Yellow Warning Tag for Host Bypassed Add-on (Requirement 4) */}
                    {(order.isHostBypassed || order.warningTag) && (
                      <div className="mt-2 rounded-lg bg-amber-400 text-stone-950 px-2.5 py-1 text-[10.5px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs border border-amber-500/40">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {order.warningTag || `⚠️ Table ${String(order.tableNumber || "").padStart(2, "0")} Add-on (Host Unreachable - Verify in Person)`}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Customer Special Note */}
                  {order.customerNote && (
                    <div className="bg-amber-500/15 border-b border-amber-500/30 px-3.5 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>Note: "{order.customerNote}"</span>
                    </div>
                  )}

                  {/* Items List with Interactive Plating Checklist */}
                  <div className="p-3.5 space-y-2.5">
                    {items.map((item: any, idx: number) => {
                      const itemKey = `${order.id}-${idx}`;
                      const isChecked = Boolean(checkedItems[itemKey]);

                      return (
                        <div
                          key={idx}
                          onClick={() => toggleCheckItem(order.id, idx)}
                          className={`flex items-start gap-2.5 p-2 rounded-xl cursor-pointer select-none transition-all ${
                            isChecked
                              ? "bg-muted/60 opacity-50 line-through"
                              : "hover:bg-secondary/70"
                          }`}
                        >
                          <div
                            className={`h-5 w-5 mt-0.5 shrink-0 rounded-md border flex items-center justify-center ${
                              isChecked
                                ? "bg-emerald-600 border-emerald-600 text-white"
                                : "border-stone-400 dark:border-stone-600"
                            }`}
                          >
                            {isChecked && <Check className="h-3.5 w-3.5" />}
                          </div>

                          <div className="flex-1 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-sm text-foreground">
                                <span className="font-sans tabular-nums">{item.quantity}</span> × {item.name}
                              </span>
                            </div>
                            {item.selectedVariants && item.selectedVariants.length > 0 && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {item.selectedVariants.map((v: any) => v.name).join(", ")}
                              </p>
                            )}

                            {/* Structured Modifiers Display for Kitchen Pass */}
                            {Array.isArray(item.selectedModifiers || (item.modifiers as any)?.customizations) &&
                            (item.selectedModifiers || (item.modifiers as any)?.customizations).length > 0 ? (
                              <div className="space-y-0.5 mt-1 text-xs">
                                {(item.selectedModifiers || (item.modifiers as any)?.customizations).map((mod: any, mIdx: number) => {
                                  const isDietOrPrep =
                                    /spice|prep|diet|style|jain|sugar|milk|temp|crust|option/i.test(mod.groupName || "") ||
                                    Number(mod.price || 0) === 0;
                                  if (isDietOrPrep) {
                                    return (
                                      <div key={mIdx} className="font-bold text-amber-600 dark:text-amber-400">
                                        ↳ [{String(mod.optionName).toUpperCase()}]
                                      </div>
                                    );
                                  }
                                  return (
                                    <div key={mIdx} className="font-medium text-foreground/90">
                                      ↳ + {mod.optionName}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : item.modifiers && typeof item.modifiers === "object" ? (
                              <div className="space-y-0.5 mt-1 text-xs">
                                {item.modifiers.dietary && item.modifiers.dietary !== "Standard" && (
                                  <div className="font-bold text-emerald-600 dark:text-emerald-400">
                                    ↳ [{String(item.modifiers.dietary).toUpperCase()}]
                                  </div>
                                )}
                                {item.modifiers.spiceLevel && (
                                  <div className="font-bold text-rose-600 dark:text-rose-400">
                                    ↳ [{String(item.modifiers.spiceLevel).toUpperCase()} SPICE]
                                  </div>
                                )}
                              </div>
                            ) : null}

                            {(item.instructions || item.specialInstructions || item.modifiers?.instructions) && (
                              <p className="text-[11px] italic text-amber-600 dark:text-amber-400 mt-1 bg-amber-500/10 rounded px-1.5 py-0.5 border border-amber-500/20">
                                Prep note: {item.instructions || item.specialInstructions || item.modifiers?.instructions}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* BUMP BAR ACTION BUTTONS (Section 29 - Streamlined, Next Action Only) */}
                <div className="p-3 border-t border-border/70 bg-secondary/20 rounded-b-2xl">
                  {(status === "NEW" || status === "APPROVED" || status === "ACCEPTED") && (
                    <Button
                      onClick={() => handleUpdateStatus(order.id, "PREPARING")}
                      disabled={updatingId === order.id}
                      className="w-full rounded-xl font-bold bg-[#C85A17] hover:bg-[#A94A12] text-white h-10 shadow-xs"
                      size="sm"
                      id={`kds-btn-start-${order.id}`}
                    >
                      <TablelineButtonContent
                        isLoading={updatingId === order.id}
                        loadingText="Updating…"
                      >
                        <Flame className="h-4 w-4 mr-1.5" />
                        START COOKING
                      </TablelineButtonContent>
                    </Button>
                  )}

                  {status === "PREPARING" && (
                    <Button
                      onClick={() => handleUpdateStatus(order.id, "READY")}
                      disabled={updatingId === order.id}
                      className="w-full rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white h-10 shadow-xs"
                      size="sm"
                      id={`kds-btn-ready-${order.id}`}
                    >
                      <TablelineButtonContent
                        isLoading={updatingId === order.id}
                        loadingText="Updating…"
                      >
                        <Bell className="h-4 w-4 mr-1.5" />
                        MARK READY
                      </TablelineButtonContent>
                    </Button>
                  )}

                  {status === "READY" && (
                    <Button
                      onClick={() => handleUpdateStatus(order.id, "COMPLETED")}
                      disabled={updatingId === order.id}
                      className="w-full rounded-xl font-bold bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900 h-10 shadow-xs"
                      size="sm"
                      id={`kds-btn-complete-${order.id}`}
                    >
                      <TablelineButtonContent
                        isLoading={updatingId === order.id}
                        loadingText="Updating…"
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1.5" />
                        COMPLETE / BUMP
                      </TablelineButtonContent>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
