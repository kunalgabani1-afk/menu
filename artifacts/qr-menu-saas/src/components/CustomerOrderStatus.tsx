import React, { useEffect, useState, useMemo } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  CheckCircle2,
  Clock,
  UtensilsCrossed,
  ArrowLeft,
  Store,
  Check,
  RotateCw,
  Sun,
  Moon,
  AlertCircle,
  XCircle,
  BellRing,
  Star,
  ShieldCheck,
  Receipt,
  ListOrdered,
  Activity,
  Printer,
  ChevronRight,
  PlusCircle,
  Coffee,
} from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { TablelineLoader } from "./TablelineLoading";
import { formatTableName } from "@/lib/formatters";
import { I18N_STRINGS, type Language } from "@/lib/customerI18n";

export interface OrderLifecycleStep {
  key: string;
  label: string;
  state: "done" | "current" | "pending";
}

export function getOrderLifecycleSteps(status: string): OrderLifecycleStep[] {
  const normStatus = (status || "NEEDS_APPROVAL").toUpperCase();
  const isNeedsApproval =
    normStatus === "NEEDS_APPROVAL" ||
    normStatus === "PENDING_WAITER_APPROVAL" ||
    normStatus === "NEW";
  const isApproved = normStatus === "APPROVED" || normStatus === "ACCEPTED";
  const isPreparing = normStatus === "PREPARING";
  const isReady = normStatus === "READY";
  const isCompleted = normStatus === "COMPLETED";

  return [
    {
      key: "placed",
      label: "Order placed",
      state: "done",
    },
    {
      key: "confirmation",
      label: isNeedsApproval
        ? "Waiting for restaurant confirmation"
        : "Restaurant confirmed",
      state: isNeedsApproval ? "current" : "done",
    },
    {
      key: "preparing",
      label: "Preparing",
      state: isNeedsApproval
        ? "pending"
        : isApproved || isPreparing
        ? "current"
        : "done",
    },
    {
      key: "ready",
      label: "Ready",
      state:
        isNeedsApproval || isApproved || isPreparing
          ? "pending"
          : isReady
          ? "current"
          : "done",
    },
    {
      key: "completed",
      label: "Completed",
      state: isCompleted ? "done" : "pending",
    },
  ];
}

const STATUS_STEPS = [
  { key: "NEEDS_APPROVAL", label: "Received" },
  { key: "APPROVED", label: "Confirmed" },
  { key: "PREPARING", label: "Preparing" },
  { key: "READY", label: "Ready" },
  { key: "COMPLETED", label: "Served" },
];

export function formatPrice(amount: number | string | undefined | null): string {
  const val = Number(amount) || 0;
  return Number.isInteger(val) ? val.toString() : val.toFixed(2);
}

export function CustomerOrderStatus() {
  const params = useParams<{
    restaurantSlug?: string;
    tableSlug?: string;
    orderId?: string;
  }>();

  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  const restaurantSlug = params.restaurantSlug || "";
  const tableSlug = params.tableSlug || "";
  const initialOrderId = params.orderId || "";

  // View tabs: "live" | "orders" | "bill"
  const [activeTab, setActiveTab] = useState<"live" | "orders" | "bill">(() => {
    if (typeof window !== "undefined") {
      if (window.location.pathname.endsWith("/bill")) return "bill";
      if (window.location.pathname.endsWith("/orders")) return "orders";
    }
    return "live";
  });

  // Active focused order ID (can switch between multiple session orders)
  const [selectedOrderId, setSelectedOrderId] = useState<string>(initialOrderId);

  // Single order state (for the active order in Live Tracker)
  const [order, setOrder] = useState<any | null>(null);

  // Aggregated session state
  const [sessionData, setSessionData] = useState<any | null>(null);

  const [loading, setLoading] = useState(true);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [reorderingItemKey, setReorderingItemKey] = useState<string | null>(null);
  const [callingWaiter, setCallingWaiter] = useState(false);
  const [waiterCalled, setWaiterCalled] = useState(false);
  const [requestingBill, setRequestingBill] = useState(false);
  const [billRequested, setBillRequested] = useState(false);
  const [waiterCallsEnabled, setWaiterCallsEnabled] = useState<boolean>(true);

  // Dish Review States (Active for COMPLETED orders)
  const [pendingRatings, setPendingRatings] = useState<Record<string, number>>({});
  const [pendingComments, setPendingComments] = useState<Record<string, string>>({});
  const [submittingReviewItem, setSubmittingReviewItem] = useState<string | null>(null);
  const [submittedReviews, setSubmittedReviews] = useState<Record<string, { rating: number; comment?: string }>>({});

  // Preferences
  const [lang] = useState<Language>(() => {
    const saved = localStorage.getItem("tableline_customer_lang");
    return saved === "gu" || saved === "hi" ? (saved as Language) : "en";
  });

  const [isDark, setIsDark] = useState<boolean>(() => {
    return localStorage.getItem("tableline_customer_theme") === "dark";
  });

  const t = I18N_STRINGS[lang] || I18N_STRINGS.en;

  const handleToggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      localStorage.setItem("tableline_customer_theme", next ? "dark" : "light");
      return next;
    });
  };

  // Synchronize route changes if URL has /bill or /orders
  useEffect(() => {
    if (location.endsWith("/bill")) {
      setActiveTab("bill");
    } else if (location.endsWith("/orders")) {
      setActiveTab("orders");
    }
  }, [location]);

  // If initialOrderId changes from route
  useEffect(() => {
    if (initialOrderId) {
      setSelectedOrderId(initialOrderId);
    }
  }, [initialOrderId]);

  // Derived effective identifiers
  const effectiveRestSlug = order?.restaurantSlug || sessionData?.restaurant?.slug || restaurantSlug || "the-juniper-room";
  const effectiveTableSlug = order?.tableSlug || sessionData?.table?.slug || order?.tableNumber || sessionData?.table?.tableNumber || tableSlug || "1";
  const effectiveTableNumber = order?.tableNumber || sessionData?.table?.tableNumber || effectiveTableSlug;
  const effectiveTableId = sessionData?.table?.id || order?.tableId || undefined;

  // Session-level orders list
  const sessionOrders: any[] = useMemo(() => {
    if (sessionData?.orders && Array.isArray(sessionData.orders)) {
      return sessionData.orders;
    }
    if (order?.sessionOrders && Array.isArray(order.sessionOrders)) {
      return order.sessionOrders;
    }
    if (order) {
      return [order];
    }
    return [];
  }, [sessionData, order]);

  // Live session bill
  const sessionBill = useMemo(() => {
    if (sessionData?.bill !== undefined && sessionData?.bill !== null) {
      return sessionData.bill;
    }
    if (order?.sessionBill !== undefined && order?.sessionBill !== null) {
      return order.sessionBill;
    }
    if (sessionOrders.length === 0) {
      return null;
    }
    let subtotal = 0;
    let taxes = 0;
    let total = 0;
    const validOrders = sessionOrders.filter((o) => o.status !== "CANCELLED" && o.status !== "DECLINED");
    if (validOrders.length === 0) {
      return null;
    }
    for (const ord of validOrders) {
      const itemSum = Array.isArray(ord.items)
        ? ord.items.reduce((s: number, i: any) => s + (Number(i.subtotal || i.price * i.quantity) || 0), 0)
        : 0;
      const ordSub = Number(ord.subtotal) || itemSum || (Number(ord.total) ? Math.round((Number(ord.total) / 1.05) * 100) / 100 : 0);
      const ordTax = Number(ord.taxes) || Math.max(0, Math.round(ordSub * 0.05 * 100) / 100);
      const ordTot = Number(ord.total) || Math.round((ordSub + ordTax) * 100) / 100;
      subtotal += ordSub;
      taxes += ordTax;
      total += ordTot;
    }
    subtotal = Math.round(subtotal * 100) / 100;
    taxes = Math.round(taxes * 100) / 100;
    total = Math.round(total * 100) / 100;
    const isPaid = Boolean(
      sessionData?.session?.paymentStatus === "PAID" ||
      (validOrders.length > 0 && validOrders.every((o) => o.paymentStatus === "PAID" || o.paymentStatus === "CASH_PAID"))
    );
    return {
      subtotal,
      taxes,
      total,
      ordersCount: validOrders.length,
      paymentStatus: isPaid ? "PAID" : "UNPAID",
      paymentMethod: sessionData?.session?.paymentMethod || order?.paymentMethod || "COUNTER",
    };
  }, [sessionData, order, sessionOrders]);

  // Current table session object
  const activeSession = sessionData?.session || order?.session || null;
  const isBillSettled = Boolean(
    sessionBill &&
    sessionBill.paymentStatus === "PAID" &&
    sessionOrders.length > 0
  );
  const isSessionClosed = Boolean(
    activeSession?.status === "CLOSED" ||
    (isBillSettled && sessionData?.table?.status === "AVAILABLE")
  );

  // Primary Fetch for Session & Orders
  const fetchSessionAndOrders = async () => {
    const targetRestSlug = effectiveRestSlug;
    const targetTblSlug = effectiveTableSlug;

    if (targetRestSlug && targetTblSlug) {
      try {
        const sessRes = await fetch(`/api/public/menu/${targetRestSlug}/table/${targetTblSlug}/session`);
        if (sessRes.ok) {
          const sJson = await sessRes.json();
          setSessionData(sJson);
          if (!sJson.session || sJson.session.status === "CLOSED" || sJson.table?.status === "AVAILABLE") {
            try {
              sessionStorage.removeItem(`table_session_${targetRestSlug}_${sJson.table?.id || targetTblSlug}`);
              sessionStorage.removeItem(`table_session_${targetRestSlug}`);
            } catch {}
          }
          if (sJson.features?.waiterCalls !== undefined) {
            setWaiterCallsEnabled(Boolean(sJson.features.waiterCalls));
          }
          if (Array.isArray(sJson.orders) && sJson.orders.length > 0) {
            const activeOrderFromSession =
              sJson.orders.slice().reverse().find((o: any) =>
                ["NEEDS_APPROVAL", "PENDING_WAITER_APPROVAL", "NEW", "APPROVED", "ACCEPTED", "PREPARING", "READY"].includes(o.status)
              ) || sJson.orders[sJson.orders.length - 1];

            if (!order) {
              const defaultOrd = selectedOrderId
                ? sJson.orders.find((o: any) => o.id === selectedOrderId || o.orderNumber === selectedOrderId) || activeOrderFromSession
                : activeOrderFromSession;
              setOrder(defaultOrd);
              if (defaultOrd?.id && !selectedOrderId) {
                setSelectedOrderId(defaultOrd.id);
              }
            } else if (order?.id) {
              const refreshed = sJson.orders.find((o: any) => o.id === order.id);
              if (refreshed) {
                setOrder((prev: any) => ({ ...prev, ...refreshed }));
              }
            }
          }
        }
      } catch {}
    }

    const currentOrdId = selectedOrderId || initialOrderId;
    if (currentOrdId) {
      try {
        const ordRes = await fetch(`/api/public/orders/${currentOrdId}`);
        if (ordRes.ok) {
          const ordJson = await ordRes.json();
          setOrder(ordJson);
          if (ordJson.features?.waiterCalls !== undefined) {
            setWaiterCallsEnabled(Boolean(ordJson.features.waiterCalls));
          }
          if (ordJson.reviewsByDishId) {
            setSubmittedReviews((prev) => ({ ...ordJson.reviewsByDishId, ...prev }));
          }
          if (ordJson.sessionOrders && !sessionData) {
            setSessionData({
              session: ordJson.session,
              bill: ordJson.sessionBill,
              orders: ordJson.sessionOrders,
              table: { tableNumber: ordJson.tableNumber, slug: ordJson.tableSlug },
              restaurant: { slug: ordJson.restaurantSlug },
            });
          }
        }
      } catch {}
    }

    setLoading(false);
  };

  const fetchOrder = fetchSessionAndOrders;

  useEffect(() => {
    fetchSessionAndOrders();
    const pollInterval = setInterval(fetchSessionAndOrders, 4000);

    let es: EventSource | null = null;
    const currentOrdId = selectedOrderId || initialOrderId;

    if (currentOrdId) {
      try {
        es = new EventSource(`/api/public/orders/${currentOrdId}/stream`);
        es.addEventListener("order_status_updated", (e) => {
          try {
            const updated = JSON.parse(e.data);
            if (updated) {
              setOrder((prev: any) => ({ ...prev, ...updated }));
              fetchSessionAndOrders();
            }
          } catch {}
        });
        es.addEventListener("session_updated", () => {
          fetchSessionAndOrders();
        });
        es.addEventListener("session_closed", () => {
          fetchSessionAndOrders();
        });
        es.onmessage = (e) => {
          try {
            const parsed = JSON.parse(e.data);
            if (parsed?.order) {
              setOrder((prev: any) => ({ ...prev, ...parsed.order }));
            }
          } catch {}
        };
      } catch {}
    } else if (effectiveRestSlug && effectiveTableSlug) {
      try {
        es = new EventSource(`/api/public/menu/${effectiveRestSlug}/table/${effectiveTableSlug}/session/stream`);
        es.addEventListener("session_updated", () => {
          fetchSessionAndOrders();
        });
        es.addEventListener("session_closed", () => {
          fetchSessionAndOrders();
        });
        es.addEventListener("order_status_updated", (e) => {
          try {
            const updated = JSON.parse(e.data);
            if (updated) {
              setOrder((prev: any) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
              fetchSessionAndOrders();
            }
          } catch {}
        });
      } catch {}
    }

    return () => {
      clearInterval(pollInterval);
      es?.close();
    };
  }, [selectedOrderId, initialOrderId, effectiveRestSlug, effectiveTableSlug]);

  // Load menu for item details
  useEffect(() => {
    async function loadCurrentMenu() {
      if (!effectiveRestSlug || !effectiveTableSlug) return;
      try {
        const res = await fetch(`/api/public/menu/${effectiveRestSlug}/table/${effectiveTableSlug}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.items)) {
            setMenuItems(data.items);
          }
          if (data.features?.waiterCalls !== undefined) {
            setWaiterCallsEnabled(Boolean(data.features.waiterCalls));
          }
        }
      } catch {}
    }

    loadCurrentMenu();
  }, [effectiveRestSlug, effectiveTableSlug]);

  const handleSelectOrder = (newOrd: any) => {
    setOrder(newOrd);
    setSelectedOrderId(newOrd.id);
    setActiveTab("live");
  };

  const handleReorderItem = async (item: any, matchedDish: any) => {
    const targetItemId = matchedDish?.id || item.menuItemId || item.id;
    const itemKey = `${targetItemId}_${item.name}`;

    if (matchedDish && matchedDish.available === false) {
      toast({
        variant: "destructive",
        title: t.soldOutCannotReorder,
        description: `"${item.name}" is sold out and unavailable.`,
      });
      return;
    }

    setReorderingItemKey(itemKey);
    try {
      const res = await fetch(`/api/public/menu/${effectiveRestSlug}/table/${effectiveTableSlug}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              menuItemId: targetItemId,
              quantity: item.quantity || 1,
              specialInstructions: item.specialInstructions || undefined,
            },
          ],
          paymentMethod: "PAY_LATER",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to place reorder. Please check table status.");
      }

      toast({
        title: t.reorderSuccess,
        description: `${item.quantity || 1} × ${item.name}`,
      });

      const newOrderId = data.id || data.orderId;
      if (newOrderId) {
        setSelectedOrderId(newOrderId);
        fetchSessionAndOrders();
        setActiveTab("live");
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not place reorder",
        description: err.message || "Please call staff or try again in a moment.",
      });
    } finally {
      setReorderingItemKey(null);
    }
  };

  const handleCallWaiter = async () => {
    setCallingWaiter(true);
    try {
      const res = await fetch(`/api/restaurants/${effectiveRestSlug}/waiter-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableNumber: effectiveTableNumber,
          serviceType: "ASSISTANCE_REQUESTED",
          notes: `Customer requested assistance at Table ${effectiveTableNumber}`,
        }),
      });
      if (res.ok) {
        setWaiterCalled(true);
        toast({
          title: "Staff Notified ✓",
          description: `A server is on their way to Table ${effectiveTableNumber}.`,
        });
      } else {
        throw new Error();
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Could not notify staff",
        description: "Please speak directly with your floor server.",
      });
    } finally {
      setCallingWaiter(false);
    }
  };

  const handleRequestBill = async () => {
    if (!sessionBill || sessionBill.ordersCount === 0 || (sessionBill.total ?? 0) <= 0) {
      toast({
        variant: "destructive",
        title: "No Orders Placed",
        description: "Your table bill is currently empty. Order dishes first to request a bill.",
      });
      return;
    }

    setRequestingBill(true);
    try {
      const res = await fetch(`/api/restaurants/${effectiveRestSlug}/waiter-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableNumber: effectiveTableNumber,
          tableId: effectiveTableId,
          serviceType: "BILL_REQUESTED",
          notes: `Customer requested bill for Table ${effectiveTableNumber} (Total: ₹${sessionBill.total})`,
        }),
      });
      if (res.ok) {
        setBillRequested(true);
        toast({
          title: "Bill Requested ✓",
          description: `Your server has been notified. They will bring the bill to Table ${effectiveTableNumber} or you may pay at the counter.`,
        });
      } else {
        const errJson = await res.json().catch(() => ({}));
        toast({
          variant: "destructive",
          title: "Could not request bill",
          description: errJson.message || "Please speak to your server directly.",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Could not request bill",
        description: "Please pay directly at the billing counter.",
      });
    } finally {
      setRequestingBill(false);
    }
  };

  const handleSubmitReview = async (item: any, targetItemId: string) => {
    const rating = pendingRatings[targetItemId];
    if (!rating || rating < 1 || rating > 5) {
      toast({
        variant: "destructive",
        title: "Please choose a rating",
        description: "Tap a star rating from 1 to 5 to review this dish.",
      });
      return;
    }

    const currentOrdId = order?.id || selectedOrderId;
    if (!currentOrdId) return;

    setSubmittingReviewItem(targetItemId);
    try {
      const res = await fetch(`/api/public/orders/${currentOrdId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menuItemId: targetItemId,
          rating,
          comment: pendingComments[targetItemId] || "",
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setSubmittedReviews((prev) => ({
          ...prev,
          [targetItemId]: { rating, comment: pendingComments[targetItemId] },
        }));
        toast({
          title: "Thank you for your rating! ⭐",
          description: `Your review for ${item.name} has been recorded.`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Could not submit review",
          description: json.message || "Please try again later.",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Network error",
        description: "Could not connect to server. Please try again.",
      });
    } finally {
      setSubmittingReviewItem(null);
    }
  };

  // Currency is strictly ₹
  const currency = "₹";

  // Loading State
  if (loading && !order && !sessionData) {
    return (
      <div
        className={`flex min-h-[100dvh] flex-col items-center justify-center p-6 text-center ${
          isDark ? "dark bg-[#1C1A18] text-[#FBF8F2]" : "bg-[#FAF6F0] text-[#241B16]"
        }`}
        id="order-status-loading"
      >
        <TablelineLoader
          variant="page"
          size="lg"
          message="Checking your order…"
          subtext="Fetching live preparation status and kitchen pass updates…"
          onRetry={fetchOrder}
        />
      </div>
    );
  }

  // Active order details
  const status = order?.status || "NEEDS_APPROVAL";
  const items = Array.isArray(order?.items) ? order.items : [];
  const isDeclined = status === "DECLINED" || status === "CANCELLED";
  const isCompleted = status === "COMPLETED";
  const isNeedsApproval =
    status === "NEEDS_APPROVAL" ||
    status === "PENDING_WAITER_APPROVAL" ||
    status === "NEW";
  const isApproved = status === "APPROVED" || status === "ACCEPTED";
  const isPreparing = status === "PREPARING";
  const isReady = status === "READY";
  const orderSteps = getOrderLifecycleSteps(status);
  const hasOrders = Boolean(order || sessionOrders.length > 0);

  return (
    <div
      className={`min-h-screen pb-32 px-4 pt-4 sm:pt-6 transition-colors duration-200 ${
        isDark ? "dark bg-[#1C1A18] text-[#FBF8F2]" : "bg-[#FAF6F0] text-[#241B16]"
      }`}
      id="customer-order-status-screen"
    >
      <div className="mx-auto max-w-md space-y-4">
        {/* HEADER: Back to Menu & Table Indicator */}
        <div className="flex items-center justify-between py-1">
          <Link
            href={`/menu/${effectiveRestSlug}/table/${effectiveTableSlug}`}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5A351F] dark:text-[#C99A55] hover:opacity-80 transition-opacity"
            id="link-back-to-menu"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{t.backToMenu}</span>
          </Link>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white dark:bg-stone-900 border border-[#E8DDD0] dark:border-stone-800 shadow-2xs text-xs font-bold text-[#241B16] dark:text-[#FBF8F2]">
              <span>🍽</span>
              <span>{formatTableName(effectiveTableNumber)}</span>
            </div>

            <button
              type="button"
              onClick={handleToggleTheme}
              className="h-8 w-8 rounded-full border border-[#E8DDD0] dark:border-stone-800 bg-white dark:bg-stone-900 text-[#241B16] dark:text-[#FBF8F2] flex items-center justify-center shadow-2xs hover:bg-[#F5EFE6]"
              aria-label="Toggle theme"
              id="button-toggle-status-theme"
            >
              {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5 text-[#5A351F]" />}
            </button>
          </div>
        </div>

        {/* CAFÉ RESTAURANT BRANDING BANNER */}
        <div className="text-center pt-1 pb-1">
          <div className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-[#6B4226]/10 text-[#6B4226] mb-1">
            <Coffee className="w-4 h-4" />
          </div>
          <h1 className="font-serif text-base sm:text-lg font-bold tracking-widest text-[#241B16] dark:text-[#FBF8F2] uppercase">
            {sessionData?.restaurant?.name || "Tableline Dining"}
          </h1>
          <p className="text-[10px] uppercase tracking-wider text-[#776B62] font-semibold mt-0.5">
            CAFÉ & ROASTERY • TABLE {formatTableName(effectiveTableNumber)}
          </p>
        </div>

        {!hasOrders ? (
          /* EMPTY STATE WHEN NO ORDERS EXIST (Requirement 6) */
          <div
            className="rounded-3xl border border-[#E8DDD0] dark:border-stone-800 bg-white dark:bg-stone-900 p-8 text-center shadow-2xs space-y-4"
            id="order-status-empty"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FAF6F0] dark:bg-stone-800 text-[#5A351F] dark:text-[#C99A55]">
              <UtensilsCrossed className="h-7 w-7" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-[#241B16] dark:text-[#FBF8F2]">
                No active order yet
              </h2>
              <p className="text-xs text-[#776B62] mt-1 max-w-xs mx-auto">
                Choose something from the menu to get started.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href={`/menu/${effectiveRestSlug}/table/${effectiveTableSlug}`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#5A351F] hover:bg-[#4A2C1A] text-white py-3 text-xs font-bold shadow-xs transition-all"
                id="button-empty-status-order"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Browse Menu & Order</span>
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* ORDER TABS: Live Order | Orders (X) | Bill */}
            <div
              className="flex items-center justify-center p-1 rounded-2xl bg-[#EDE4D8] dark:bg-stone-900 border border-[#E8DDD0] dark:border-stone-800 gap-1 text-xs font-bold"
              id="status-view-segments"
            >
          <button
            type="button"
            onClick={() => setActiveTab("live")}
            className={`flex-1 py-2 rounded-xl text-center transition-all ${
              activeTab === "live"
                ? "bg-[#5A351F] text-white shadow-xs"
                : "text-[#776B62] hover:text-[#241B16] dark:hover:text-white"
            }`}
            id="tab-live-tracker"
          >
            Live Order
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("orders")}
            className={`flex-1 py-2 rounded-xl text-center transition-all ${
              activeTab === "orders"
                ? "bg-[#5A351F] text-white shadow-xs"
                : "text-[#776B62] hover:text-[#241B16] dark:hover:text-white"
            }`}
            id="tab-session-orders"
          >
            Orders ({sessionOrders.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("bill")}
            className={`flex-1 py-2 rounded-xl text-center transition-all ${
              activeTab === "bill"
                ? "bg-[#5A351F] text-white shadow-xs"
                : "text-[#776B62] hover:text-[#241B16] dark:hover:text-white"
            }`}
            id="tab-live-bill"
          >
            Bill
          </button>
        </div>

        {/* MULTI-ROUND SELECTOR CHIPS (If session has multiple rounds) */}
        {activeTab === "live" && sessionOrders.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scrollbar-none py-1 px-0.5" id="order-selector-pills">
            <span className="text-[11px] font-semibold text-[#776B62] uppercase tracking-wider shrink-0 mr-1">
              Rounds:
            </span>
            {sessionOrders.map((ord: any, idx: number) => {
              const isSelected = (ord.id || ord.orderNumber) === (order?.id || selectedOrderId);
              return (
                <button
                  key={ord.id || idx}
                  type="button"
                  onClick={() => handleSelectOrder(ord)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    isSelected
                      ? "bg-[#5A351F] text-white shadow-xs"
                      : "bg-white dark:bg-stone-900 border border-[#E8DDD0] dark:border-stone-800 text-[#776B62] hover:text-[#241B16]"
                  }`}
                  id={`pill-select-order-${idx}`}
                >
                  <span>Round {idx + 1}</span>
                  <span className="opacity-75 font-mono text-[10px]">#{ord.orderNumber || ord.id?.slice(-4)}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* TAB 1: LIVE ORDER TRACKER */}
        {activeTab === "live" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* REFINED ORDER STATUS CARD */}
            {isDeclined ? (
              <div
                className="rounded-3xl border border-red-200 dark:border-red-950/70 bg-red-50/60 dark:bg-red-950/20 p-5 text-center shadow-2xs"
                id="status-hero-card-declined"
              >
                <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">
                  <XCircle className="h-6 w-6" />
                </div>
                <h2 className="font-serif text-lg font-bold text-red-900 dark:text-red-200">
                  Order Declined
                </h2>
                <p className="mt-1 text-xs text-red-800/80 dark:text-red-300/80 max-w-xs mx-auto">
                  The kitchen was unable to prepare this round. No charges have been added to your bill.
                </p>
                {order.declinedReason && (
                  <div className="mt-3 rounded-xl border border-red-200 dark:border-red-900/40 bg-white dark:bg-stone-900 p-3 text-left text-xs">
                    <span className="font-bold text-[10px] text-red-600 uppercase">Reason</span>
                    <p className="mt-0.5 text-stone-800 dark:text-stone-200">{order.declinedReason}</p>
                  </div>
                )}
                <div className="mt-4 pt-3 border-t border-red-200/60">
                  <Link
                    href={`/menu/${effectiveRestSlug}/table/${effectiveTableSlug}`}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-[#5A351F] text-white py-2.5 text-xs font-bold shadow-xs"
                    id="button-declined-return"
                  >
                    Return to Menu
                  </Link>
                </div>
              </div>
            ) : (
              <div
                className="rounded-3xl border border-[#E8DDD0] dark:border-stone-800 bg-white dark:bg-stone-900 p-5 text-center shadow-2xs space-y-4"
                id="status-hero-card"
              >
                {/* Header Badge & Order Number */}
                <div className="flex items-center justify-between text-xs pb-2 border-b border-[#E8DDD0]/60 dark:border-stone-800">
                  <span className="font-serif font-bold text-[#5A351F] dark:text-[#C99A55]">
                    ORDER #{order?.orderNumber || order?.id?.slice(-5) || "—"}
                  </span>
                  <span className="font-bold text-[#776B62]">
                    Table {formatTableName(effectiveTableNumber)}
                  </span>
                </div>

                {/* State Icon & Title */}
                <div className="py-1">
                  {isNeedsApproval ? (
                    <>
                      <div className="mx-auto mb-2.5 grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400">
                        <Clock className="h-6 w-6 animate-pulse" />
                      </div>
                      <h2 className="font-serif text-lg font-bold tracking-tight text-[#241B16] dark:text-[#FBF8F2]">
                        ORDER RECEIVED
                      </h2>
                      <p className="mt-1 text-xs font-semibold text-[#5A351F] dark:text-[#C99A55]">
                        Waiting for restaurant confirmation
                      </p>
                      <p className="mt-1.5 text-xs text-[#776B62] max-w-xs mx-auto">
                        Your order has been sent to the restaurant and is waiting for confirmation.
                      </p>
                    </>
                  ) : isApproved ? (
                    <>
                      <div className="mx-auto mb-2.5 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400">
                        <Check className="h-6 w-6 text-emerald-600" />
                      </div>
                      <h2 className="font-serif text-lg font-bold tracking-tight text-[#241B16] dark:text-[#FBF8F2]">
                        Order Confirmed
                      </h2>
                      <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        Restaurant confirmed
                      </p>
                      <p className="mt-1.5 text-xs text-[#776B62] max-w-xs mx-auto">
                        Your order has been approved and sent to the kitchen.
                      </p>
                    </>
                  ) : isPreparing ? (
                    <>
                      <div className="mx-auto mb-2.5 grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600">
                        <Clock className="h-6 w-6 animate-spin" />
                      </div>
                      <h2 className="font-serif text-lg font-bold tracking-tight text-[#241B16] dark:text-[#FBF8F2]">
                        Preparing in Kitchen
                      </h2>
                      <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                        Cooking in progress
                      </p>
                      <p className="mt-1.5 text-xs text-[#776B62] max-w-xs mx-auto">
                        Our chefs are actively preparing your dishes.
                      </p>
                    </>
                  ) : isReady ? (
                    <>
                      <div className="mx-auto mb-2.5 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600">
                        <UtensilsCrossed className="h-6 w-6 animate-bounce" />
                      </div>
                      <h2 className="font-serif text-lg font-bold tracking-tight text-[#241B16] dark:text-[#FBF8F2]">
                        Fresh Food is Ready!
                      </h2>
                      <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        Ready to serve
                      </p>
                      <p className="mt-1.5 text-xs text-[#776B62] max-w-xs mx-auto">
                        Your dishes are on their way to Table {formatTableName(effectiveTableNumber)}.
                      </p>
                    </>
                  ) : isCompleted ? (
                    <>
                      <div className="mx-auto mb-2.5 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600">
                        <Check className="h-6 w-6 text-emerald-600" />
                      </div>
                      <h2 className="font-serif text-lg font-bold tracking-tight text-[#241B16] dark:text-[#FBF8F2]">
                        Order Completed
                      </h2>
                      <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        Dishes served at table
                      </p>
                      <p className="mt-1.5 text-xs text-[#776B62] max-w-xs mx-auto">
                        Enjoy your meal! Your dining session is active. You can order more dishes anytime.
                      </p>
                    </>
                  ) : null}
                </div>

                {/* ORDERED FOOD ITEMS (Requirement 7) */}
                {items.length > 0 && (
                  <div className="pt-3 pb-2 border-t border-[#E8DDD0]/60 dark:border-stone-800 text-left">
                    <div className="space-y-1.5 text-xs">
                      {items.map((it: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between">
                          <span className="text-[#241B16] dark:text-[#FBF8F2] font-medium">
                            {it.name} <span className="text-[#776B62] font-semibold">×{it.quantity}</span>
                          </span>
                          <span className="font-mono font-semibold text-[#241B16] dark:text-[#FBF8F2]">
                            {currency}{formatPrice(it.subtotal || it.price * it.quantity)}
                          </span>
                        </div>
                      ))}
                      <div className="pt-2 border-t border-dashed border-[#E8DDD0] dark:border-stone-800 flex justify-between items-center font-bold text-xs">
                        <span className="text-[#776B62]">Total</span>
                        <span className="font-mono text-sm text-[#5A351F] dark:text-[#C99A55]">
                          {currency}{formatPrice(order?.total)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Realtime 5-Step Order Lifecycle List (Requirements 7, 8, 9) */}
                <div className="pt-3 pb-1 border-t border-[#E8DDD0]/60 dark:border-stone-800 space-y-2.5 text-left px-2">
                  {orderSteps.map((s) => (
                    <div key={s.key} className="flex items-center gap-3 text-xs">
                      {s.state === "done" ? (
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white font-bold text-[10px]">
                          ✓
                        </span>
                      ) : s.state === "current" ? (
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5A351F] dark:bg-[#C99A55] text-white font-bold text-[10px]">
                          ●
                        </span>
                      ) : (
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-400 font-bold text-[10px]">
                          ○
                        </span>
                      )}
                      <span
                        className={`${
                          s.state === "current"
                            ? "font-bold text-[#5A351F] dark:text-[#C99A55]"
                            : s.state === "done"
                            ? "font-semibold text-[#241B16] dark:text-[#FBF8F2]"
                            : "text-[#776B62] opacity-70"
                        }`}
                      >
                        {s.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ORDER ITEMS CARD (Same styling as Cart & Menu) */}
            <div
              className="rounded-3xl border border-[#E8DDD0] dark:border-stone-800 bg-white dark:bg-stone-900 p-5 shadow-2xs space-y-3"
              id="status-order-summary"
            >
              <div className="flex items-center justify-between pb-1 border-b border-[#E8DDD0]/60 dark:border-stone-800">
                <span className="font-serif text-xs font-bold uppercase tracking-wider text-[#776B62]">
                  Round Items ({items.length})
                </span>
                {isCompleted && (
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                    1-Tap Reorder Ready
                  </span>
                )}
              </div>

              <div className="divide-y divide-[#E8DDD0]/60 dark:divide-stone-800">
                {items.map((item: any, idx: number) => {
                  const matchedDish = menuItems.find(
                    (m) =>
                      m.id === (item.menuItemId || item.id) ||
                      m.name?.toLowerCase() === (item.name || "").toLowerCase()
                  );
                  const isSoldOut = matchedDish && matchedDish.available === false;
                  const targetItemId = matchedDish?.id || item.menuItemId || item.id;
                  const itemKey = `${targetItemId}_${item.name}`;
                  const isThisReordering = reorderingItemKey === itemKey;

                  return (
                    <div
                      key={idx}
                      className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <strong className="font-bold text-[#241B16] dark:text-[#FBF8F2]">
                            {item.quantity} ×
                          </strong>
                          <span className="font-semibold text-[#241B16] dark:text-[#FBF8F2]">
                            {item.name}
                          </span>
                          {isSoldOut && (
                            <span className="rounded-md bg-red-100 text-red-800 px-1.5 py-0.2 text-[10px] font-bold uppercase">
                              Sold Out
                            </span>
                          )}
                        </div>

                        {/* Modifiers / Customization Badges */}
                        {Array.isArray(item.selectedModifiers) && item.selectedModifiers.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.selectedModifiers.map((mod: any, mIdx: number) => (
                              <span
                                key={mIdx}
                                className="text-[10px] rounded-md px-1.5 py-0.5 bg-[#FAF6F0] dark:bg-stone-800 text-[#5A351F] dark:text-[#C99A55] font-medium border border-[#E8DDD0] dark:border-stone-700"
                              >
                                {mod.optionName} {mod.price > 0 && `(+${currency}${mod.price})`}
                              </span>
                            ))}
                          </div>
                        ) : item.modifiers && (
                          <div className="flex flex-wrap gap-1 mt-1 text-[10px] text-[#776B62]">
                            {item.modifiers.spiceLevel && <span>🌶️ {item.modifiers.spiceLevel}</span>}
                            {item.modifiers.prepStyle && item.modifiers.prepStyle !== "Standard" && (
                              <span>• 🍳 {item.modifiers.prepStyle}</span>
                            )}
                            {item.modifiers.dietary && item.modifiers.dietary !== "Standard" && (
                              <span>• 🌱 {item.modifiers.dietary}</span>
                            )}
                          </div>
                        )}

                        {item.specialInstructions && (
                          <p className="text-[11px] text-[#776B62] italic mt-0.5">
                            &ldquo;{item.specialInstructions}&rdquo;
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="font-mono text-xs font-bold text-[#241B16] dark:text-[#FBF8F2]">
                          {currency}{formatPrice(item.subtotal || item.price * item.quantity)}
                        </span>

                        {isCompleted && (
                          <button
                            type="button"
                            disabled={isThisReordering || isSoldOut}
                            onClick={() => handleReorderItem(item, matchedDish)}
                            className="h-7 rounded-xl px-2.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 flex items-center gap-1 transition-all"
                            id={`button-reorder-${idx}`}
                          >
                            {isThisReordering ? (
                              <RotateCw className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <span>🔁</span>
                                <span>{t.orderAgain}</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between border-t border-[#E8DDD0] dark:border-stone-800 pt-3 text-xs font-bold">
                <span className="text-[#776B62]">Round Total</span>
                <span className="font-mono text-sm text-[#241B16] dark:text-[#FBF8F2]">
                  {currency}{formatPrice(order?.total)}
                </span>
              </div>
            </div>

            {/* LIVE BILL SUMMARY CARD */}
            <div
              className="rounded-3xl border border-[#E8DDD0] dark:border-stone-800 bg-white dark:bg-stone-900 p-5 shadow-2xs space-y-3"
              id="live-bill-summary-card"
            >
              <div className="flex items-center justify-between pb-1 border-b border-[#E8DDD0]/60 dark:border-stone-800">
                <span className="font-serif text-xs font-bold uppercase tracking-wider text-[#776B62]">
                  Current Table Bill
                </span>
                <span className="text-[11px] font-semibold text-[#776B62]">
                  Table {effectiveTableNumber} • {sessionOrders.length} Order(s)
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-[#776B62]">
                  <span>Subtotal</span>
                  <span className="font-mono">
                    {currency}{sessionBill ? formatPrice(sessionBill.subtotal) : formatPrice(order?.subtotal || Math.round((Number(order?.total || 0) / 1.05) * 100) / 100)}
                  </span>
                </div>
                <div className="flex justify-between text-[#776B62]">
                  <span>Taxes & Charges (5% GST)</span>
                  <span className="font-mono">
                    {currency}{sessionBill ? formatPrice(sessionBill.taxes) : formatPrice(order?.taxes || Math.round((Number(order?.total || 0) - (Number(order?.subtotal || 0) || Math.round((Number(order?.total || 0) / 1.05) * 100) / 100)) * 100) / 100)}
                  </span>
                </div>
                <div className="pt-2 border-t border-[#E8DDD0] dark:border-stone-800 flex justify-between items-center font-bold text-sm text-[#241B16] dark:text-[#FBF8F2]">
                  <span>Total</span>
                  <span className="font-mono text-base text-[#5A351F] dark:text-[#C99A55]">
                    {currency}{sessionBill ? formatPrice(sessionBill.total) : formatPrice(order?.total)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab("bill")}
                className="w-full h-11 rounded-2xl border border-[#E8DDD0] dark:border-stone-800 bg-[#FAF6F0] dark:bg-stone-800 hover:bg-[#EDE4D8] text-xs font-bold text-[#5A351F] dark:text-[#C99A55] flex items-center justify-center gap-1.5 transition-all shadow-2xs"
                id="button-view-bill-card"
              >
                <Receipt className="h-4 w-4" />
                <span>View Full Itemized Bill</span>
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </button>
            </div>

            {/* DISH REVIEWS FOR SERVED ITEMS */}
            {isCompleted && items.length > 0 && (
              <div
                className="rounded-3xl border border-[#E8DDD0] dark:border-stone-800 bg-white dark:bg-stone-900 p-5 shadow-2xs space-y-3"
                id="completed-order-dish-reviews"
              >
                <div className="flex items-center justify-between pb-1 border-b border-[#E8DDD0]/60">
                  <div>
                    <h3 className="font-serif text-sm font-bold text-[#241B16] dark:text-[#FBF8F2]">
                      How was your food?
                    </h3>
                    <p className="text-[11px] text-[#776B62]">
                      Rate the dishes served to your table
                    </p>
                  </div>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <ShieldCheck className="h-3 w-3" />
                    Verified
                  </span>
                </div>

                <div className="space-y-3 divide-y divide-[#E8DDD0]/60">
                  {items.map((item: any, idx: number) => {
                    const targetItemId = item.menuItemId || item.itemId || item.id || item.name;
                    const existingReview = submittedReviews[targetItemId] || order.reviewsByDishId?.[targetItemId];
                    const selectedStars = pendingRatings[targetItemId] || 0;
                    const isSubmitting = submittingReviewItem === targetItemId;

                    return (
                      <div key={idx} className="pt-3 first:pt-0 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs text-[#241B16] dark:text-[#FBF8F2]">
                            {item.name}
                          </span>
                          {existingReview && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600">
                              <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                              <span>{existingReview.rating}★ Reviewed</span>
                            </span>
                          )}
                        </div>

                        {!existingReview && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((starNum) => (
                                <button
                                  key={starNum}
                                  type="button"
                                  onClick={() =>
                                    setPendingRatings((prev) => ({
                                      ...prev,
                                      [targetItemId]: starNum,
                                    }))
                                  }
                                  className="p-1 rounded-md hover:scale-110 transition-transform"
                                  id={`rate-${idx}-star-${starNum}`}
                                >
                                  <Star
                                    className={`h-4.5 w-4.5 ${
                                      starNum <= selectedStars
                                        ? "fill-amber-400 text-amber-400"
                                        : "text-[#D5C7B8]"
                                    }`}
                                  />
                                </button>
                              ))}
                            </div>

                            {selectedStars > 0 && (
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  placeholder="Add notes (optional)..."
                                  value={pendingComments[targetItemId] || ""}
                                  onChange={(e) =>
                                    setPendingComments((prev) => ({
                                      ...prev,
                                      [targetItemId]: e.target.value,
                                    }))
                                  }
                                  className="flex-1 rounded-xl border border-[#E8DDD0] px-3 py-1.5 text-xs bg-[#FAF6F0] text-[#241B16] focus:outline-none"
                                />
                                <button
                                  type="button"
                                  disabled={isSubmitting}
                                  onClick={() => handleSubmitReview(item, targetItemId)}
                                  className="h-8 rounded-xl px-3 bg-[#5A351F] text-white text-xs font-bold shadow-2xs"
                                >
                                  {isSubmitting ? "Saving…" : "Submit"}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* CALL WAITER OR ASSISTANCE */}
            {waiterCallsEnabled && (
              <button
                type="button"
                disabled={callingWaiter || waiterCalled}
                onClick={handleCallWaiter}
                className="w-full h-11 rounded-2xl border border-[#E8DDD0] dark:border-stone-800 bg-white dark:bg-stone-900 text-xs font-bold text-[#241B16] dark:text-[#FBF8F2] shadow-2xs hover:bg-[#FAF6F0] flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                id="button-call-waiter"
              >
                <BellRing className="h-4 w-4 text-[#C99A55]" />
                <span>
                  {waiterCalled ? "Staff Notified ✓" : callingWaiter ? "Notifying Staff…" : "Call Waiter to Table"}
                </span>
              </button>
            )}
          </div>
        )}

        {/* TAB 2: SESSION ORDERS LIST (All Rounds) */}
        {activeTab === "orders" && (
          <div className="space-y-4 animate-in fade-in duration-200" id="session-orders-view">
            <div className="flex items-center justify-between px-1">
              <div>
                <h3 className="font-serif text-base font-bold text-[#241B16] dark:text-[#FBF8F2]">
                  Dining Session Rounds
                </h3>
                <p className="text-xs text-[#776B62]">
                  All orders placed at Table {effectiveTableNumber}
                </p>
              </div>
              <span className="font-mono text-xs font-bold px-3 py-1 rounded-full bg-white dark:bg-stone-900 border border-[#E8DDD0] dark:border-stone-800 shadow-2xs">
                {sessionOrders.length} Round(s)
              </span>
            </div>

            {sessionOrders.length === 0 ? (
              <div className="rounded-3xl border border-[#E8DDD0] dark:border-stone-800 bg-white dark:bg-stone-900 p-8 text-center shadow-2xs space-y-3">
                <p className="text-sm font-semibold text-[#776B62]">No orders placed in this session yet.</p>
                <Link
                  href={`/menu/${effectiveRestSlug}/table/${effectiveTableSlug}`}
                  className="inline-flex items-center gap-1.5 rounded-2xl bg-[#5A351F] px-4 py-2.5 text-xs font-bold text-white shadow-xs"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>Browse Menu & Order</span>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {sessionOrders.map((ord: any, idx: number) => {
                  const ordStatus = ord.status || "NEW";
                  const ordItems = Array.isArray(ord.items) ? ord.items : [];
                  const isThisActive = (ord.id || ord.orderNumber) === (order?.id || selectedOrderId);

                  return (
                    <div
                      key={ord.id || idx}
                      className={`rounded-3xl border p-4 transition-all shadow-2xs ${
                        isThisActive
                          ? "border-[#5A351F] bg-[#F7F1E8] dark:bg-stone-900"
                          : "border-[#E8DDD0] dark:border-stone-800 bg-white dark:bg-stone-900"
                      }`}
                      id={`session-order-card-${idx}`}
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-[#E8DDD0]/60 dark:border-stone-800">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#241B16] dark:text-[#FBF8F2]">
                            Round {idx + 1}
                          </span>
                          <span className="font-mono text-[11px] text-[#776B62]">
                            #{ord.orderNumber || ord.id?.slice(-5)}
                          </span>
                          {ord.source === "CAPTAIN" && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 uppercase">
                              Captain
                            </span>
                          )}
                        </div>

                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            ordStatus === "COMPLETED"
                              ? "bg-emerald-100 text-emerald-800"
                              : ordStatus === "READY"
                              ? "bg-emerald-100 text-emerald-800 animate-pulse"
                              : ordStatus === "PREPARING"
                              ? "bg-amber-100 text-amber-800"
                              : ordStatus === "DECLINED" || ordStatus === "CANCELLED"
                              ? "bg-red-100 text-red-800"
                              : "bg-[#FAF6F0] text-[#5A351F]"
                          }`}
                        >
                          {ordStatus === "COMPLETED" ? "Served" : ordStatus}
                        </span>
                      </div>

                      {/* Items Preview */}
                      <div className="py-2.5 text-xs space-y-1">
                        {ordItems.map((it: any, iIdx: number) => (
                          <div key={iIdx} className="flex justify-between text-[#776B62]">
                            <span>
                              {it.quantity} × {it.name}
                            </span>
                            <span className="font-mono font-medium text-[#241B16] dark:text-[#FBF8F2]">
                              {currency}{formatPrice(it.subtotal || it.price * it.quantity)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-[#E8DDD0]/60 dark:border-stone-800">
                        <div>
                          <span className="text-[11px] text-[#776B62]">Total: </span>
                          <span className="font-mono text-xs font-bold text-[#241B16] dark:text-[#FBF8F2]">
                            {currency}{formatPrice(ord.total)}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSelectOrder(ord)}
                          className="text-xs font-bold text-[#5A351F] dark:text-[#C99A55] flex items-center gap-1 hover:underline"
                          id={`button-track-round-${idx}`}
                        >
                          <span>Track Status</span>
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quick Actions */}
            <div className="pt-2 flex gap-2">
              <Link
                href={`/menu/${effectiveRestSlug}/table/${effectiveTableSlug}`}
                className="flex-1 h-12 inline-flex items-center justify-center rounded-2xl bg-white dark:bg-stone-900 border border-[#E8DDD0] dark:border-stone-800 text-xs font-bold text-[#241B16] dark:text-[#FBF8F2] shadow-2xs gap-1.5 hover:bg-[#FAF6F0]"
                id="button-orders-add-food"
              >
                <PlusCircle className="h-4 w-4 text-[#5A351F] dark:text-[#C99A55]" />
                <span>+ Order More Food</span>
              </Link>

              <button
                type="button"
                onClick={() => setActiveTab("bill")}
                className="flex-1 h-12 rounded-2xl bg-[#5A351F] hover:bg-[#4A2C1A] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs"
                id="button-orders-view-bill"
              >
                <Receipt className="h-4 w-4" />
                <span>View Live Bill</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: LIVE TABLE BILL (Receipt & Pay at Counter) */}
        {activeTab === "bill" && (
          <div className="space-y-4 animate-in fade-in duration-200" id="live-table-bill-view">
            {isBillSettled ? (
              /* SETTLED BILL VIEW WITH RESTRAINED ANIMATION (Requirement 15, 16) */
              <motion.div
                initial={{ opacity: 0.85, scale: 0.98, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="rounded-3xl border border-[#E8DDD0] dark:border-stone-800 bg-white dark:bg-stone-900 p-6 text-center space-y-4 shadow-2xs"
                id="view-bill-closed-session"
              >
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 border border-emerald-200 dark:border-emerald-800">
                  <motion.svg
                    className="h-7 w-7 text-emerald-600"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <motion.path
                      d="M20 6L9 17l-5-5"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.45, ease: "easeOut" }}
                    />
                  </motion.svg>
                </div>
                <div>
                  <h2 className="font-serif text-xl font-bold text-[#241B16] dark:text-[#FBF8F2]">
                    ✓ Bill Settled
                  </h2>
                  <div className="mt-1 font-mono text-2xl font-extrabold text-[#5A351F] dark:text-[#C99A55]">
                    {currency}{formatPrice(sessionBill?.total)}
                  </div>
                  <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    Paid at Counter
                  </p>
                  <p className="text-xs text-[#776B62] mt-1 max-w-xs mx-auto">
                    Thank you for dining with us! This table session has been settled.
                  </p>
                </div>

                <div className="pt-2 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="w-full h-11 rounded-2xl border border-[#E8DDD0] dark:border-stone-800 bg-white dark:bg-stone-900 text-xs font-bold text-[#241B16] dark:text-[#FBF8F2] flex items-center justify-center gap-2 shadow-2xs"
                    id="button-print-receipt"
                  >
                    <Printer className="h-4 w-4" />
                    <span>Print / Save Receipt</span>
                  </button>

                  <Link
                    href={`/menu/${effectiveRestSlug}/table/${effectiveTableSlug}`}
                    className="w-full h-11 inline-flex items-center justify-center rounded-2xl bg-[#5A351F] text-white text-xs font-bold shadow-xs hover:bg-[#4A2C1A]"
                    id="button-bill-browse-menu"
                  >
                    Browse Menu / Order Again
                  </Link>
                </div>
              </motion.div>
            ) : !sessionBill || sessionBill.ordersCount === 0 || sessionOrders.length === 0 ? (
              /* EMPTY BILL VIEW (Requirement 12) */
              <div
                className="rounded-3xl border border-[#E8DDD0] dark:border-stone-800 bg-white dark:bg-stone-900 p-8 text-center space-y-4 shadow-2xs"
                id="view-bill-empty"
              >
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FAF6F0] dark:bg-stone-800 text-[#5A351F] dark:text-[#C99A55]">
                  <Receipt className="h-7 w-7" />
                </div>
                <div>
                  <span className="font-serif text-xs font-bold uppercase tracking-wider text-[#776B62] block mb-1">
                    CURRENT BILL
                  </span>
                  <h2 className="font-serif text-lg font-bold text-[#241B16] dark:text-[#FBF8F2]">
                    No items yet
                  </h2>
                  <p className="text-xs text-[#776B62] mt-1 max-w-xs mx-auto">
                    Your bill will appear here after you place an order.
                  </p>
                </div>
                <div className="pt-2">
                  <Link
                    href={`/menu/${effectiveRestSlug}/table/${effectiveTableSlug}`}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#5A351F] hover:bg-[#4A2C1A] text-white py-3 text-xs font-bold shadow-xs transition-all"
                    id="button-empty-bill-order"
                  >
                    <PlusCircle className="h-4 w-4" />
                    <span>Browse Menu & Order</span>
                  </Link>
                </div>
              </div>
            ) : (
              /* ACTIVE TABLE BILL (Requirement 13, 14, 15, 17, 18, 19, 21) */
              <div className="space-y-4">
                {/* Café Itemized Receipt */}
                <div
                  className="rounded-3xl border border-[#E8DDD0] dark:border-stone-800 bg-white dark:bg-stone-900 p-6 space-y-4 shadow-2xs"
                  id="printable-bill-receipt"
                >
                  {/* Restaurant & Table Header */}
                  <div className="text-center pb-4 border-b border-dashed border-[#E8DDD0] dark:border-stone-700">
                    <span className="font-serif text-xs font-bold uppercase tracking-wider text-[#776B62] block mb-1">
                      CURRENT BILL
                    </span>
                    <h2 className="font-serif text-lg font-bold tracking-tight text-[#241B16] dark:text-[#FBF8F2]">
                      Table {formatTableName(effectiveTableNumber)}
                    </h2>
                    <div className="mt-1.5 inline-flex items-center gap-2 rounded-full px-3 py-0.5 text-[11px] font-mono bg-[#FAF6F0] dark:bg-stone-800 text-[#776B62]">
                      <span>Active Session</span>
                      <span>•</span>
                      <span>{sessionOrders.length} Order(s)</span>
                    </div>
                  </div>

                  {/* Itemized Dishes List */}
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#776B62]">
                      Itemized Orders
                    </p>

                    <div className="divide-y divide-[#E8DDD0]/60 dark:divide-stone-800 text-xs">
                      {sessionOrders.map((ord: any, oIdx: number) => {
                        const ordItems = Array.isArray(ord.items) ? ord.items : [];
                        return (
                          <div key={ord.id || oIdx} className="py-2.5 first:pt-0">
                            <div className="flex items-center justify-between text-[11px] font-bold text-[#776B62] mb-1">
                              <span>Order #{ord.orderNumber || ord.id?.slice(-4)}</span>
                              <span className="uppercase text-[10px] text-[#5A351F] dark:text-[#C99A55]">{ord.status}</span>
                            </div>

                            {ordItems.map((it: any, iIdx: number) => (
                              <div key={iIdx} className="flex items-center justify-between py-1">
                                <span className="text-[#241B16] dark:text-[#FBF8F2]">
                                  {it.name} <strong className="font-semibold text-[#776B62]">×{it.quantity}</strong>
                                </span>
                                <span className="font-mono text-[#241B16] dark:text-[#FBF8F2]">
                                  {currency}{formatPrice(it.subtotal || it.price * it.quantity)}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Financial Breakdown */}
                  <div className="pt-3 border-t border-dashed border-[#E8DDD0] dark:border-stone-700 space-y-2 text-xs">
                    <div className="flex justify-between text-[#776B62]">
                      <span>Subtotal</span>
                      <span className="font-mono font-medium text-[#241B16] dark:text-[#FBF8F2]">
                        {currency}{formatPrice(sessionBill.subtotal)}
                      </span>
                    </div>

                    {sessionBill.taxes > 0 && (
                      <div className="flex justify-between text-[#776B62]">
                        <span>Taxes & Charges (5% GST)</span>
                        <span className="font-mono font-medium text-[#241B16] dark:text-[#FBF8F2]">
                          {currency}{formatPrice(sessionBill.taxes)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-2 border-t border-[#E8DDD0] dark:border-stone-800 font-bold text-base text-[#241B16] dark:text-[#FBF8F2]">
                      <span>Current Total</span>
                      <span className="font-mono text-xl text-[#5A351F] dark:text-[#C99A55]">
                        {currency}{formatPrice(sessionBill.total)}
                      </span>
                    </div>
                  </div>

                  {/* Pay at Counter Policy Notice */}
                  <div
                    className="rounded-2xl p-3.5 text-xs bg-[#FAF6F0] dark:bg-stone-800 border border-[#E8DDD0] dark:border-stone-700 text-[#241B16] dark:text-[#FBF8F2]"
                    id="bill-payment-status-card"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 font-bold text-[#5A351F] dark:text-[#C99A55]">
                        <Store className="h-4 w-4" />
                        <span>Payment</span>
                      </div>
                      <span className="font-mono font-bold text-[10px] uppercase px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                        UNPAID
                      </span>
                    </div>
                    <p className="text-[11px] font-semibold text-[#241B16] dark:text-[#FBF8F2] mt-0.5">
                      Pay at Counter
                    </p>
                    <p className="text-[11px] text-[#776B62] leading-relaxed mt-1">
                      Your dining session is open. When ready, settle your bill at the counter or request staff to collect payment.
                    </p>
                  </div>
                </div>

                {/* Actions for Active Bill View */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={requestingBill || billRequested}
                      onClick={handleRequestBill}
                      className="flex-1 h-12 rounded-2xl border border-[#E8DDD0] dark:border-stone-800 bg-white dark:bg-stone-900 text-xs font-bold text-[#241B16] dark:text-[#FBF8F2] flex items-center justify-center gap-2 shadow-2xs hover:bg-[#FAF6F0] disabled:opacity-60"
                      id="button-request-bill"
                    >
                      <Receipt className="h-4 w-4 text-[#C99A55]" />
                      <span>{billRequested ? "Bill Requested ✓" : requestingBill ? "Requesting…" : "Request Bill to Table"}</span>
                    </button>

                    <Link
                      href={`/menu/${effectiveRestSlug}/table/${effectiveTableSlug}`}
                      className="flex-1 h-12 inline-flex items-center justify-center rounded-2xl bg-[#5A351F] hover:bg-[#4A2C1A] text-white text-xs font-bold shadow-xs gap-1.5"
                      id="button-add-more-dishes"
                    >
                      <PlusCircle className="h-4 w-4" />
                      <span>+ Order More Food</span>
                    </Link>
                  </div>

                  {billRequested && (
                    <p className="text-center text-[11px] font-semibold text-emerald-700">
                      ✓ Server notified. They will bring your bill to Table {formatTableName(effectiveTableNumber)}.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </>
    )}
  </div>

      {/* STICKY BOTTOM ACTION BAR (Menu style espresso button) */}
      {activeTab !== "bill" && !isSessionClosed && sessionBill && sessionBill.total > 0 && (
        <div
          className="fixed bottom-0 inset-x-0 p-3 bg-[#FAF6F0]/95 dark:bg-[#1C1A18]/95 backdrop-blur-md border-t border-[#E8DDD0] dark:border-stone-800 shadow-lg z-40"
          id="sticky-session-bottom-bar"
        >
          <div className="mx-auto max-w-md flex items-center gap-3">
            <Link
              href={`/menu/${effectiveRestSlug}/table/${effectiveTableSlug}`}
              className="flex-1 h-12 rounded-2xl border border-[#E8DDD0] dark:border-stone-800 bg-white dark:bg-stone-900 text-xs font-bold text-[#241B16] dark:text-[#FBF8F2] flex items-center justify-center gap-1.5 shadow-2xs hover:bg-[#FAF6F0] transition-all"
              id="bottom-bar-add-food"
            >
              <PlusCircle className="h-4 w-4 text-[#5A351F] dark:text-[#C99A55]" />
              <span>+ Add Food</span>
            </Link>

            <button
              type="button"
              onClick={() => setActiveTab("bill")}
              className="flex-1 h-12 rounded-2xl bg-[#5A351F] hover:bg-[#4A2C1A] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition-all"
              id="bottom-bar-view-bill"
            >
              <Receipt className="h-4 w-4" />
              <span>View Bill ({currency}{formatPrice(sessionBill.total)})</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CustomerOrderStatus;
