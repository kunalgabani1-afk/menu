import React, { useEffect, useState, useRef } from "react";
import {
  ClipboardList,
  Search,
  Plus,
  MoreVertical,
  CheckCircle2,
  XCircle,
  Printer,
  CreditCard,
  Banknote,
  Smartphone,
  Check,
  RefreshCw,
  Volume2,
  VolumeX,
  Volume1,
  Bell,
  ChevronDown,
  Sliders,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getIdToken } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import {
  orderAudioAlert,
  useAudioAlertStatus,
  SoundVolumeLevel,
  VOLUME_LEVELS,
} from "@/lib/orderAudioAlert";
import { AudioAlertBanner } from "./AudioAlertBanner";
import { TablelineLoader, TablelineButtonContent } from "./TablelineLoading";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import type { Table, MenuItem } from "@workspace/api-client-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { printBillDocument, BillPrintSettings, DEFAULT_BILL_SETTINGS } from "@/lib/billPrinter";

interface OrdersManagementProps {
  slug: string;
  restaurantName?: string;
  currency?: string;
}

type OrderStatus =
  | "NEW"
  | "PREPARING"
  | "READY"
  | "COMPLETED"
  | "CANCELLED"
  | "PENDING_WAITER_APPROVAL"
  | "NEEDS_APPROVAL"
  | "APPROVED"
  | "DECLINED"
  | string;

export function OrdersManagement({
  slug,
  restaurantName = "Restaurant",
  currency = "₹",
}: OrdersManagementProps) {
  const { toast } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("NEEDS_APPROVAL");
  const [search, setSearch] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [billSettings, setBillSettings] = useState<BillPrintSettings | null>(null);

  // Manual Order Dialog
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualTableId, setManualTableId] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [manualCart, setManualCart] = useState<Array<{ id: string; name: string; price: number; quantity: number }>>([]);
  const [submittingManual, setSubmittingManual] = useState(false);

  // Sound & Volume Settings
  const {
    isSoundEnabled,
    isBlocked,
    volume,
    volumeLevel,
    setVolume,
    setVolumeLevel,
    unlock,
    testSound,
  } = useAudioAlertStatus();
  const [isSoundPopoverOpen, setIsSoundPopoverOpen] = useState(false);
  const soundPopoverRef = useRef<HTMLDivElement>(null);
  const isInitialFetchRef = useRef(true);

  // Cancel Confirmation State
  const [orderToCancel, setOrderToCancel] = useState<{ id: string; orderNumber: string } | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState(false);

  const fetchOrders = async () => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const [ordersRes, tablesRes, menuRes, billRes] = await Promise.all([
        fetch(`/api/restaurants/${slug}/orders?limit=100`, { headers }).catch(() => null),
        fetch(`/api/restaurants/${slug}/tables`, { headers }).catch(() => null),
        fetch(`/api/restaurants/${slug}/menu/items`, { headers }).catch(() => null),
        fetch(`/api/restaurants/${slug}/bill-settings`, { headers }).catch(() => null),
      ]);

      if (ordersRes && ordersRes.ok) {
        const data = await ordersRes.json();
        const loadedOrders = Array.isArray(data) ? data : data.orders || [];
        setOrders(loadedOrders);

        // Mark all existing orders as seen on initial load so NO sound plays on page refresh
        if (isInitialFetchRef.current) {
          orderAudioAlert.markInitialOrdersSeen(loadedOrders);
          isInitialFetchRef.current = false;
        }
      }

      if (tablesRes && tablesRes.ok) {
        const data = await tablesRes.json();
        setTables(Array.isArray(data) ? data : data.tables || []);
      }

      if (menuRes && menuRes.ok) {
        const data = await menuRes.json();
        setMenuItems(Array.isArray(data) ? data : data.items || []);
      }

      if (billRes && billRes.ok) {
        const data = await billRes.json();
        if (data?.billSettings) {
          setBillSettings(data.billSettings);
        }
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    orderAudioAlert.setActiveWorkspace("orders");
    orderAudioAlert.connect(slug);
    fetchOrders();

    const unsubRefresh = orderAudioAlert.onDataRefresh(() => {
      fetchOrders();
    });

    const unsubNewOrder = orderAudioAlert.onNewOrder((newOrder) => {
      setOrders((prev) => {
        if (prev.some((o) => o.id === newOrder.id)) return prev;
        return [newOrder, ...prev];
      });
    });

    const timer = setInterval(fetchOrders, 4000);
    return () => {
      clearInterval(timer);
      unsubRefresh();
      unsubNewOrder();
      orderAudioAlert.setActiveWorkspace("all");
    };
  }, [slug]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      setOpenMenuId(null);
      if (soundPopoverRef.current && !soundPopoverRef.current.contains(e.target as Node)) {
        setIsSoundPopoverOpen(false);
      }
    };
    window.addEventListener("click", handleOutside);
    return () => window.removeEventListener("click", handleOutside);
  }, []);

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
          title: "Status updated",
          description: `Order is now ${nextStatus.toLowerCase()}.`,
        });
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
        );
      } else {
        const err = await res.json().catch(() => ({}));
        toast({
          variant: "destructive",
          title: "Update failed",
          description: err.message || "Please try again.",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Network error",
      });
    } finally {
      setUpdatingOrderId(null);
      setOpenMenuId(null);
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
        const updated = await res.json();
        toast({
          title: "Order Approved",
          description: "Order has been approved and moved to kitchen queue.",
        });
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: "APPROVED", ...updated } : o))
        );
      } else {
        const err = await res.json().catch(() => ({}));
        toast({
          variant: "destructive",
          title: "Approval failed",
          description: err.message || "Please try again.",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Network error",
      });
    } finally {
      setUpdatingOrderId(null);
      setOpenMenuId(null);
    }
  };

  const handleDeclineOrder = async (orderId: string, reason = "Declined by restaurant staff") => {
    setUpdatingOrderId(orderId);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/orders/${orderId}/decline`, {
        method: "POST",
        headers,
        body: JSON.stringify({ reason }),
      });

      if (res.ok) {
        toast({
          title: "Order Declined",
          description: "Customer has been notified.",
        });
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: "DECLINED", cancellationReason: reason } : o))
        );
      } else {
        const err = await res.json().catch(() => ({}));
        toast({
          variant: "destructive",
          title: "Decline failed",
          description: err.message || "Please try again.",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Network error",
      });
    } finally {
      setUpdatingOrderId(null);
      setOpenMenuId(null);
    }
  };

  const handleMarkPayment = async (orderId: string, status: "PAID" | "UNPAID", method: string = "CASH") => {
    setUpdatingOrderId(orderId);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/orders/${orderId}/payment`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ paymentStatus: status, paymentMethod: method }),
      });

      if (res.ok) {
        toast({
          title: status === "PAID" ? `Marked as paid (${method})` : "Marked as unpaid",
        });
        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId ? { ...o, paymentStatus: status, paymentMethod: method } : o
          )
        );
      }
    } catch {}
    setUpdatingOrderId(null);
    setOpenMenuId(null);
  };

  const handlePrintTicket = (order: any, paperSizeOverride?: "thermal_80mm" | "a4") => {
    const effectiveSettings: BillPrintSettings = {
      restaurantName,
      currency,
      paperSize: "thermal_80mm",
      showTableNumber: true,
      showOrderNumber: true,
      showDateTime: true,
      showStaff: true,
      showTax: true,
      showPaymentDetails: true,
      showContactInfo: true,
      footerMessage: "Thank you for dining with us!",
      ...billSettings,
    };
    printBillDocument(
      order,
      effectiveSettings,
      paperSizeOverride || effectiveSettings.paperSize || "thermal_80mm"
    );
    setOpenMenuId(null);
  };

  // Submit manual counter order
  const handleCreateManualOrder = async () => {
    if (!manualTableId) {
      toast({ variant: "destructive", title: "Please select a table" });
      return;
    }
    if (manualCart.length === 0) {
      toast({ variant: "destructive", title: "Add at least one item" });
      return;
    }

    setSubmittingManual(true);
    try {
      const selectedTable = tables.find((t) => t.id === manualTableId);
      const token = await getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/orders/manual`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          tableId: manualTableId,
          tableNumber: selectedTable?.tableNumber || "1",
          items: manualCart.map((i) => ({
            menuItemId: i.id,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
          })),
          customerNote: manualNote,
          paymentMethod: "CASH",
        }),
      });

      if (res.ok) {
        toast({ title: "Order created successfully" });
        setShowManualModal(false);
        setManualCart([]);
        setManualNote("");
        fetchOrders();
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: err.message || "Failed to create order" });
      }
    } catch {
      toast({ variant: "destructive", title: "Network error" });
    } finally {
      setSubmittingManual(false);
    }
  };

  // Filter and priority sorting calculations
  const getOrderPriority = (status: string = "NEW"): number => {
    const s = String(status || "NEW").toUpperCase();
    if (["NEEDS_ATTENTION", "NEEDS_APPROVAL", "PENDING_WAITER_APPROVAL", "PENDING_VERIFICATION"].includes(s)) {
      return 1; // Attention first
    }
    if (["NEW", "APPROVED", "ACCEPTED"].includes(s)) {
      return 2; // Active new
    }
    if (s === "PREPARING") {
      return 3; // Active preparing
    }
    if (s === "READY") {
      return 4; // Active ready
    }
    if (s === "COMPLETED") {
      return 5; // Completed
    }
    if (["DECLINED", "CANCELLED"].includes(s)) {
      return 6; // Cancelled / declined last
    }
    return 3;
  };

  const countForStatus = (tabId: string) => {
    if (tabId === "NEEDS_APPROVAL") {
      return orders.filter((o) => {
        const s = String(o.status || "").toUpperCase();
        if (["PREPARING", "READY", "COMPLETED", "DECLINED", "CANCELLED"].includes(s)) return false;
        return (
          ["NEW", "PENDING_WAITER_APPROVAL", "NEEDS_APPROVAL", "NEEDS_ATTENTION", "PENDING_VERIFICATION", "NEEDS_VERIFICATION"].includes(s) ||
          Boolean(o.requiresStaffApproval) ||
          Boolean(o.isHostBypassed)
        );
      }).length;
    }
    if (tabId === "COMPLETED") {
      return orders.filter((o) => String(o.status || "").toUpperCase() === "COMPLETED").length;
    }
    if (tabId === "DECLINED") {
      return orders.filter((o) => String(o.status || "").toUpperCase() === "DECLINED").length;
    }
    if (tabId === "CANCELLED") {
      return orders.filter((o) => String(o.status || "").toUpperCase() === "CANCELLED").length;
    }
    return 0;
  };

  const filteredOrders = orders.filter((order) => {
    const status = String(order.status || "NEW").toUpperCase();
    if (statusFilter === "NEEDS_APPROVAL") {
      if (["PREPARING", "READY", "COMPLETED", "DECLINED", "CANCELLED"].includes(status)) return false;
      const isApproval =
        ["NEW", "PENDING_WAITER_APPROVAL", "NEEDS_APPROVAL", "NEEDS_ATTENTION", "PENDING_VERIFICATION", "NEEDS_VERIFICATION"].includes(status) ||
        Boolean(order.requiresStaffApproval) ||
        Boolean(order.isHostBypassed);
      if (!isApproval) return false;
    } else if (statusFilter === "COMPLETED") {
      if (status !== "COMPLETED") return false;
    } else if (statusFilter === "DECLINED") {
      if (status !== "DECLINED") return false;
    } else if (statusFilter === "CANCELLED") {
      if (status !== "CANCELLED") return false;
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      const tableNum = String(order.tableNumber || "");
      const orderNum = String(order.orderNumber || order.id || "");
      const itemsMatch = (order.items || []).some((i: any) =>
        String(i.name || "").toLowerCase().includes(q)
      );
      if (!tableNum.includes(q) && !orderNum.toLowerCase().includes(q) && !itemsMatch) {
        return false;
      }
    }
    return true;
  });

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    const pA = getOrderPriority(a.status);
    const pB = getOrderPriority(b.status);
    if (pA !== pB) return pA - pB;
    const tA = new Date(a.createdAt || 0).getTime();
    const tB = new Date(b.createdAt || 0).getTime();
    return tB - tA; // Within same priority group: newest first
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6" id="orders-management">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/70 pb-5" id="orders-header">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Orders
          </h1>
          <p className="text-xs text-muted-foreground">
            Live restaurant tickets. Move tickets as they are prepared.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Order Alerts Sound Control */}
          <div className="relative" ref={soundPopoverRef}>
            <button
              type="button"
              onClick={() => setIsSoundPopoverOpen(!isSoundPopoverOpen)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all shadow-xs ${
                volumeLevel === "muted"
                  ? "border-[#EDE4D8] bg-white text-[#8C7A6B] hover:text-[#2C1810]"
                  : "border-[#C87D55]/30 bg-[#FAF8F5] text-[#2C1810] hover:border-[#C87D55]"
              }`}
              title="Configure Tableline Order Alerts volume"
              id="button-order-alerts-control"
            >
              {volumeLevel === "muted" ? (
                <VolumeX className="h-3.5 w-3.5 text-[#8C7A6B]" />
              ) : volumeLevel === "low" ? (
                <Volume1 className="h-3.5 w-3.5 text-[#C87D55]" />
              ) : (
                <Volume2 className="h-3.5 w-3.5 text-[#C87D55]" />
              )}
              <span className="font-medium text-xs">
                {volumeLevel === "muted"
                  ? "Alerts Muted"
                  : volumeLevel === "low"
                  ? "Low Volume"
                  : volumeLevel === "high"
                  ? "High Volume"
                  : "Standard Volume"}
              </span>
              <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
            </button>

            {/* Sound Settings Dropdown Popover */}
            {isSoundPopoverOpen && (
              <div
                className="absolute right-0 top-full mt-2 z-50 w-72 rounded-2xl border border-[#EDE4D8] bg-[#FAF8F5] p-4 shadow-xl animate-in fade-in zoom-in-95 duration-150 text-[#2C1810]"
                id="popover-order-alerts-menu"
              >
                <div className="flex items-center justify-between pb-2.5 border-b border-[#EDE4D8]">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-[#C87D55]" />
                    <h4 className="font-serif font-bold text-xs text-[#2C1810]">Order Alerts</h4>
                  </div>
                  <span className="text-[10px] text-[#8C7A6B] font-mono font-bold uppercase">
                    {VOLUME_LEVELS[volumeLevel].label}
                  </span>
                </div>

                {/* Preset Buttons */}
                <div className="grid grid-cols-4 gap-1.5 py-3">
                  {(["muted", "low", "standard", "high"] as SoundVolumeLevel[]).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => {
                        setVolumeLevel(lvl);
                        if (lvl !== "muted") {
                          orderAudioAlert.playNewOrderAlert(undefined, "test");
                        }
                      }}
                      className={`py-1.5 px-1 rounded-xl text-[11px] font-semibold border transition-all text-center capitalize ${
                        volumeLevel === lvl
                          ? "bg-[#2C1810] text-white border-[#2C1810] shadow-xs"
                          : "bg-white text-[#5C4D44] border-[#EDE4D8] hover:border-[#D9CCC0]"
                      }`}
                      id={`button-volume-preset-${lvl}`}
                    >
                      {lvl === "standard" ? "Std" : lvl}
                    </button>
                  ))}
                </div>

                {/* Volume Slider */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] text-[#8C7A6B]">
                    <span>Volume Level</span>
                    <span className="font-mono font-bold text-[#2C1810]">{Math.round(volume * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <VolumeX className="h-3.5 w-3.5 text-[#8C7A6B] shrink-0" />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-[#EDE4D8] rounded-lg appearance-none cursor-pointer accent-[#C87D55]"
                      id="input-volume-slider"
                    />
                    <Volume2 className="h-3.5 w-3.5 text-[#C87D55] shrink-0" />
                  </div>
                </div>

                {/* Test Sound CTA */}
                <div className="pt-3.5 mt-3 border-t border-[#EDE4D8] flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await unlock();
                      await testSound();
                      toast({
                        title: "🔔 Previewing Alert Chime",
                        description: `Volume set to ${VOLUME_LEVELS[volumeLevel].label}.`,
                      });
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-white border border-[#EDE4D8] text-xs font-semibold text-[#2C1810] hover:bg-[#FAF8F5] transition-colors shadow-2xs"
                    id="button-test-order-sound"
                  >
                    <Volume2 className="h-3.5 w-3.5 text-[#C87D55]" />
                    Preview Chime
                  </button>
                </div>
              </div>
            )}
          </div>

          <Button
            onClick={() => setShowManualModal(true)}
            size="sm"
            className="rounded-xl font-semibold gap-1.5 bg-[#2C1810] hover:bg-[#3D261C] text-white shadow-xs"
            id="button-new-order-ticket"
          >
            <Plus className="h-4 w-4 text-[#C87D55]" />
            New Ticket
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchOrders}
            className="rounded-xl border-[#EDE4D8] hover:bg-[#FAF8F5]"
            title="Refresh orders"
            id="button-refresh-orders"
          >
            <RefreshCw className="h-3.5 w-3.5 text-[#5C4D44]" />
          </Button>
        </div>
      </div>

      <AudioAlertBanner className="mb-4" />

      {/* Tabs & Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" id="orders-filters-bar">
        {/* Status Tabs: Needs Approval, Completed, Declined, Cancelled */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-secondary/70 p-1" id="orders-tabs-bar">
          {[
            { id: "NEEDS_APPROVAL", label: "Needs Approval" },
            { id: "COMPLETED", label: "Completed" },
            { id: "DECLINED", label: "Declined" },
            { id: "CANCELLED", label: "Cancelled" },
          ].map((tab) => {
            const active = statusFilter === tab.id;
            const count = countForStatus(tab.id);
            return (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
                  active
                    ? "bg-card text-foreground shadow-2xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                id={`tab-status-${tab.id.toLowerCase()}`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 font-sans tabular-nums text-[10px] ${
                    active ? "bg-primary/10 text-primary font-bold" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search table or dish..."
            className="h-9 rounded-xl pl-8 text-xs bg-card"
            id="input-search-orders"
          />
        </div>
      </div>

      {/* Orders List */}
      {loading ? (
        <TablelineLoader
          variant="card"
          message="Loading live orders…"
          subtext="Fetching floor and kitchen order stream…"
          onRetry={fetchOrders}
        />
      ) : sortedOrders.length === 0 ? (
        <div
          className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/90 bg-card/60 p-8 text-center"
          id="orders-empty-state"
        >
          <ClipboardList className="h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 font-display text-base font-semibold text-foreground">
            {statusFilter === "NEEDS_APPROVAL"
              ? "No orders awaiting approval"
              : statusFilter === "COMPLETED"
              ? "No completed orders"
              : statusFilter === "DECLINED"
              ? "No declined orders"
              : "No cancelled orders"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {statusFilter === "NEEDS_APPROVAL"
              ? "All caught up! Orders placed by guests requiring staff confirmation will appear here."
              : statusFilter === "COMPLETED"
              ? "Orders completed during service will appear here."
              : statusFilter === "DECLINED"
              ? "Orders declined by restaurant staff will appear here."
              : "Orders cancelled by guests or session close will appear here."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2" id="orders-grid">
          {sortedOrders.map((order) => {
            const items = Array.isArray(order.items) ? order.items : [];
            const status = (order.status || "NEW") as OrderStatus;
            const isUpdating = updatingOrderId === order.id;
            const isPaid = order.paymentStatus === "PAID";

            return (
              <div
                key={order.id}
                className="relative flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-xs"
                id={`order-manage-card-${order.id}`}
              >
                <div>
                  {/* Top Row: Ticket # + Table + Time + Status */}
                  <div className="flex items-start justify-between border-b border-border/60 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-sans tabular-nums text-sm font-bold text-foreground">
                          #{order.orderNumber || order.id.slice(-4).toUpperCase()}
                        </span>
                        <span className="rounded-md bg-secondary px-2 py-0.5 font-semibold text-xs text-foreground">
                          Table <span className="font-sans tabular-nums">{order.tableNumber || "—"}</span>
                          {order.dinerFirstName ? ` (${order.dinerFirstName})` : ""}
                        </span>
                        {(order.orderSource === "STAFF" || order.source === "STAFF") && (
                          <span className="rounded bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800 px-1.5 py-0.5 text-[10px] font-bold">
                            Captain: {order.createdByStaff?.name?.split(" ")[0] || "Staff"}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="font-sans tabular-nums">{formatDateTime(order.createdAt)}</span>
                        {order.customerPhone && (
                          <span className="font-sans tabular-nums font-medium text-foreground bg-secondary/80 px-1.5 py-0.5 rounded text-[10px]">
                            📱 {order.customerPhone}
                          </span>
                        )}
                      </p>

                      {/* Yellow Warning Tag for Host Bypassed Add-on */}
                      {(order.isHostBypassed || order.warningTag) && (
                        <div className="mt-2 rounded-lg bg-amber-400 text-stone-950 px-2.5 py-1 text-[10.5px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs border border-amber-500/40">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            {order.warningTag || `⚠️ Table ${String(order.tableNumber || "").padStart(2, "0")} Add-on (Host Unreachable - Verify in Person)`}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                          status === "PENDING_WAITER_APPROVAL" || status === "NEEDS_APPROVAL"
                            ? "bg-purple-100 text-purple-900 ring-1 ring-purple-400/50 animate-pulse"
                            : status === "NEW"
                            ? "bg-amber-100 text-amber-900"
                            : status === "APPROVED"
                            ? "bg-emerald-100 text-emerald-900 font-semibold"
                            : status === "PREPARING"
                            ? "bg-blue-100 text-blue-900"
                            : status === "READY"
                            ? "bg-emerald-100 text-emerald-900"
                            : status === "COMPLETED"
                            ? "bg-secondary text-foreground"
                            : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {status === "PENDING_WAITER_APPROVAL" || status === "NEEDS_APPROVAL"
                          ? "Needs Approval"
                          : status === "APPROVED"
                          ? "Approved"
                          : status}
                      </span>

                      {/* Dropdown ••• */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === order.id ? null : order.id);
                          }}
                          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                          id={`button-menu-${order.id}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>

                        {openMenuId === order.id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-9 z-20 w-48 rounded-xl border border-border bg-popover p-1.5 shadow-lg"
                            id={`menu-actions-${order.id}`}
                          >
                            <button
                              type="button"
                              onClick={() => handlePrintTicket(order, "thermal_80mm")}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
                              title="Print 80mm POS thermal receipt"
                            >
                              <Printer className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>Print Thermal (80mm)</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handlePrintTicket(order, "a4")}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
                              title="Print A4 tax invoice document"
                            >
                              <Printer className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>Print A4 Invoice</span>
                            </button>

                            <div className="my-1 border-t border-border/60" />

                            <button
                              type="button"
                              onClick={() => handleMarkPayment(order.id, isPaid ? "UNPAID" : "PAID", "CASH")}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
                            >
                              <Banknote className="h-3.5 w-3.5 text-muted-foreground" />
                              {isPaid ? "Mark Unpaid" : "Paid with Cash"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMarkPayment(order.id, isPaid ? "UNPAID" : "PAID", "UPI")}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
                            >
                              <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
                              {isPaid ? "Mark Unpaid" : "Paid with UPI"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMarkPayment(order.id, isPaid ? "UNPAID" : "PAID", "CARD")}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
                            >
                              <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                              {isPaid ? "Mark Unpaid" : "Paid with Card"}
                            </button>

                            <div className="my-1 border-t border-border/60" />

                            <button
                              type="button"
                              onClick={() => {
                                setOrderToCancel({
                                  id: order.id,
                                  orderNumber: order.orderNumber ? `#${order.orderNumber}` : `#${order.id.slice(-4)}`,
                                });
                                setOpenMenuId(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Cancel Order
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="mt-3 space-y-2">
                    {items.map((item: any, idx: number) => {
                      const customList = Array.isArray(item.selectedModifiers) && item.selectedModifiers.length > 0
                        ? item.selectedModifiers
                        : Array.isArray(item.modifiers?.customizations) && item.modifiers.customizations.length > 0
                        ? item.modifiers.customizations
                        : [];

                      return (
                        <div key={idx} className="text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-foreground">
                              <strong className="font-semibold"><span className="font-sans tabular-nums">{item.quantity}</span> ×</strong> {item.name}
                            </span>
                            <span className="font-sans tabular-nums text-muted-foreground">
                              {currency}
                              {Number(item.subtotal || item.price * item.quantity || 0).toFixed(0)}
                            </span>
                          </div>

                          {customList.length > 0 ? (
                            <div className="flex flex-wrap gap-1 mt-1 pl-4">
                              {customList.map((c: any, cIdx: number) => (
                                <span
                                  key={cIdx}
                                  className="rounded bg-amber-500/10 text-amber-900 dark:text-amber-200 border border-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium"
                                >
                                  {c.groupName}: {c.optionName} {c.price > 0 && <>(+<span className="font-sans tabular-nums">{currency}{c.price}</span>)</>}
                                </span>
                              ))}
                            </div>
                          ) : item.modifiers && (
                            <div className="flex flex-wrap gap-1 mt-1 pl-4">
                              {item.modifiers.spiceLevel && (
                                <span className="rounded bg-rose-500/10 text-rose-700 dark:text-rose-300 px-1 py-0.5 text-[10px]">
                                  🌶️ {item.modifiers.spiceLevel}
                                </span>
                              )}
                              {item.modifiers.prepStyle && item.modifiers.prepStyle !== "Standard" && (
                                <span className="rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 px-1 py-0.5 text-[10px]">
                                  🍳 {item.modifiers.prepStyle}
                                </span>
                              )}
                              {item.modifiers.dietary && item.modifiers.dietary !== "Standard" && (
                                <span className="rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-1 py-0.5 text-[10px]">
                                  🌱 {item.modifiers.dietary}
                                </span>
                              )}
                            </div>
                          )}

                          {item.specialInstructions && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 italic pl-4 mt-0.5">
                              Note: {item.specialInstructions}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {order.customerNote && (
                      <p className="mt-2 rounded-lg bg-secondary/70 px-2.5 py-1.5 text-[11px] italic text-muted-foreground">
                        Note: "{order.customerNote}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Bottom Row: Total, Payment Status & Next Primary Action */}
                <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-sans tabular-nums text-base font-bold text-foreground">
                        {formatCurrency(order.total, currency)}
                      </span>
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                          isPaid
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {isPaid ? "Paid" : "Pay at Counter"}
                      </span>
                    </div>
                    {Number(order.taxes) > 0 && (
                      <p className="text-[10px] text-muted-foreground font-sans tabular-nums mt-0.5">
                        Subtotal {currency}{Number(order.subtotal || 0).toFixed(0)} + Tax {currency}{Number(order.taxes || 0).toFixed(0)}
                      </p>
                    )}
                  </div>

                  <div>
                    {(status === "PENDING_WAITER_APPROVAL" || status === "NEEDS_APPROVAL" || status === "NEW" || order.requiresStaffApproval || (order.isHostBypassed && status !== "PREPARING" && status !== "READY" && status !== "COMPLETED")) && (
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isUpdating}
                          onClick={() => handleDeclineOrder(order.id)}
                          className="rounded-xl h-8 px-2.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                          id={`order-action-decline-${order.id}`}
                        >
                          Decline
                        </Button>
                        <Button
                          size="sm"
                          disabled={isUpdating}
                          onClick={() => handleApproveOrder(order.id)}
                          className="rounded-xl h-8 px-3 text-xs bg-[#1c1917] text-[#fdfbf7] hover:bg-[#292524] font-semibold"
                          id={`order-action-approve-${order.id}`}
                        >
                          Approve Order
                        </Button>
                      </div>
                    )}
                    {status === "APPROVED" && (
                      <Button
                        size="sm"
                        disabled={isUpdating}
                        onClick={() => handleUpdateStatus(order.id, "PREPARING")}
                        className="rounded-xl font-semibold"
                        id={`order-action-prepare-${order.id}`}
                      >
                        Start Preparing
                      </Button>
                    )}
                    {status === "PREPARING" && (
                      <Button
                        size="sm"
                        disabled={isUpdating}
                        onClick={() => handleUpdateStatus(order.id, "READY")}
                        className="rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
                        id={`order-action-ready-${order.id}`}
                      >
                        Mark Ready
                      </Button>
                    )}
                    {status === "READY" && (
                      <Button
                        size="sm"
                        disabled={isUpdating}
                        onClick={() => handleUpdateStatus(order.id, "COMPLETED")}
                        className="rounded-xl font-semibold"
                        id={`order-action-complete-${order.id}`}
                      >
                        Complete
                      </Button>
                    )}
                    {status === "COMPLETED" && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-medium">
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        Done
                      </span>
                    )}
                    {status === "DECLINED" && (
                      <span className="text-xs text-destructive font-medium">
                        Declined
                      </span>
                    )}
                    {status === "CANCELLED" && (
                      <span className="text-xs text-destructive font-medium">
                        Cancelled
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Manual Counter Ticket Dialog */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <h2 className="font-display text-lg font-bold">New Ticket</h2>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-secondary"
              >
                ✕
              </button>
            </div>

            {/* Table Selection */}
            <div>
              <label className="text-xs font-semibold text-foreground">Select Table</label>
              <select
                value={manualTableId}
                onChange={(e) => setManualTableId(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none"
              >
                <option value="">Choose table…</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    Table {t.tableNumber}
                  </option>
                ))}
              </select>
            </div>

            {/* Item Quick Selection */}
            <div>
              <label className="text-xs font-semibold text-foreground">Add Food Items</label>
              <div className="mt-1.5 max-h-40 overflow-y-auto space-y-1.5 rounded-xl border border-border p-2 bg-background">
                {menuItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-xs py-1 px-1.5 hover:bg-secondary rounded-lg">
                    <div>
                      <p className="font-medium text-foreground">{item.name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{currency}{item.price}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs rounded-lg"
                      onClick={() => {
                        setManualCart((prev) => {
                          const exist = prev.find((i) => i.id === item.id);
                          if (exist) {
                            return prev.map((i) => (i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
                          }
                          return [...prev, { id: item.id, name: item.name, price: Number(item.price), quantity: 1 }];
                        });
                      }}
                    >
                      + Add
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Selected Items */}
            {manualCart.length > 0 && (
              <div className="rounded-xl bg-secondary/50 p-3 space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Ticket Items</p>
                {manualCart.map((i) => (
                  <div key={i.id} className="flex items-center justify-between text-xs">
                    <span>{i.quantity} × {i.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{currency}{(i.price * i.quantity).toFixed(0)}</span>
                      <button
                        type="button"
                        onClick={() => setManualCart((prev) => prev.filter((item) => item.id !== i.id))}
                        className="text-destructive hover:underline text-[10px]"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Customer Note */}
            <div>
              <label className="text-xs font-semibold text-foreground">Special Note (Optional)</label>
              <Input
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                placeholder="e.g. Extra napkins, less spicy"
                className="mt-1 text-xs rounded-xl"
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowManualModal(false)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={submittingManual}
                onClick={handleCreateManualOrder}
                className="rounded-xl text-xs font-semibold"
              >
                {submittingManual ? "Creating…" : "Create Ticket"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Order Cancellation Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(orderToCancel)}
        onOpenChange={(open) => {
          if (!open && !cancellingOrder) setOrderToCancel(null);
        }}
        title={`Cancel order ${orderToCancel?.orderNumber || "ticket"}?`}
        description="This will mark the order as cancelled and remove it from active kitchen work. This action cannot be undone."
        confirmLabel="Cancel Order"
        isDestructive={true}
        isLoading={cancellingOrder}
        onConfirm={async () => {
          if (!orderToCancel) return;
          setCancellingOrder(true);
          try {
            await handleUpdateStatus(orderToCancel.id, "CANCELLED");
            setOrderToCancel(null);
          } finally {
            setCancellingOrder(false);
          }
        }}
      />
    </div>
  );
}
