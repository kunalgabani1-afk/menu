import React, { useEffect, useState, useMemo } from "react";
import {
  Receipt,
  Search,
  Printer,
  CreditCard,
  Banknote,
  Smartphone,
  CheckCircle2,
  Clock,
  RefreshCw,
  Eye,
  X,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  DollarSign,
  Building2,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getIdToken } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { printBillDocument, BillPrintSettings, DEFAULT_BILL_SETTINGS } from "@/lib/billPrinter";
import { TablelineLoader } from "./TablelineLoading";
import { closeTableSession } from "@/lib/tableSession";

interface BillsManagementProps {
  slug: string;
  restaurantName?: string;
  currency?: string;
}

interface BillItem {
  id?: string;
  name: string;
  quantity: number;
  price: number;
  subtotal?: number;
  specialInstructions?: string;
  orderId?: string;
  orderNumber?: string | number;
  orderTime?: string;
}

interface BillOrder {
  id: string;
  orderNumber?: string | number;
  items: any[];
  subtotal: number;
  taxes: number;
  total: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
}

interface TableBill {
  id: string;
  sessionId: string;
  billNumber: string;
  tableId: string;
  tableNumber: string;
  location?: string | null;
  status: "ACTIVE" | "CLOSED";
  paymentStatus: "PAID" | "UNPAID";
  paymentMethod?: string | null;
  paymentReference?: string | null;
  subtotal: number;
  taxes: number;
  total: number;
  ordersCount: number;
  itemsCount: number;
  items: BillItem[];
  orders: BillOrder[];
  createdAt: string;
  updatedAt?: string;
  closedAt?: string;
  closedBy?: string;
}

export function BillsManagement({
  slug,
  restaurantName = "Restaurant",
  currency = "₹",
}: BillsManagementProps) {
  const { toast } = useToast();
  const [activeBills, setActiveBills] = useState<TableBill[]>([]);
  const [settledBills, setSettledBills] = useState<TableBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  type BillFilterTab = "ALL" | "UNPAID" | "PAID_TODAY";
  const [billFilter, setBillFilter] = useState<BillFilterTab>("UNPAID");
  const [billSettings, setBillSettings] = useState<BillPrintSettings | null>(null);

  // Payment Modal State
  const [payingBill, setPayingBill] = useState<TableBill | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"CASH" | "UPI" | "BANK_TRANSFER" | "COUNTER">("CASH");
  const [referenceNote, setReferenceNote] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // View Details Modal State
  const [viewingBill, setViewingBill] = useState<TableBill | null>(null);

  const fetchBills = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const [billsRes, settingsRes] = await Promise.all([
        fetch(`/api/restaurants/${slug}/bills`, { headers }),
        fetch(`/api/restaurants/${slug}/bill-settings`, { headers }).catch(() => null),
      ]);

      if (billsRes.ok) {
        const data = await billsRes.json();
        // Exclude phantom ₹0 bills that are closed/inactive
        const validActive = (data.activeBills || []).filter((b: TableBill) => b.total > 0 || b.itemsCount > 0);
        const validSettled = (data.settledBills || []).filter((b: TableBill) => b.total > 0);
        setActiveBills(validActive);
        setSettledBills(validSettled);
      }

      if (settingsRes && settingsRes.ok) {
        const sData = await settingsRes.json();
        setBillSettings(sData);
      }
    } catch (err) {
      console.error("Failed to fetch bills:", err);
      if (!silent) {
        toast({
          title: "Could not load bills",
          description: "Please check your network connection and retry.",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBills();
    const interval = setInterval(() => {
      fetchBills(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [slug]);

  const handleOpenPaymentModal = (bill: TableBill) => {
    setPayingBill(bill);
    setSelectedPaymentMethod("CASH");
    setReferenceNote("");
  };

  const handleExecutePayment = async () => {
    if (!payingBill) return;
    setSubmittingPayment(true);

    try {
      const token = await getIdToken();
      const res = await fetch(`/api/restaurants/${slug}/bills/${payingBill.id}/pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          paymentMethod: selectedPaymentMethod,
          referenceNote: referenceNote.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || "Failed to settle payment");
      }

      toast({
        title: `Payment Recorded (${selectedPaymentMethod})`,
        description: `Table ${payingBill.tableNumber} bill settled. Session closed and table is now available.`,
      });

      // Atomically close and reset table session in Firestore (Kill Switch)
      try {
        await closeTableSession({
          restaurantSlug: slug,
          tableId: payingBill.tableId || payingBill.tableNumber,
          tableNumber: payingBill.tableNumber,
          reason: "BILL_PAID",
        });
      } catch (sessionErr) {
        console.warn("[BillsManagement] closeTableSession notice:", sessionErr);
      }

      const settledBillCopy = {
        ...payingBill,
        paymentStatus: "PAID" as const,
        paymentMethod: selectedPaymentMethod,
        status: "CLOSED" as const,
      };

      setPayingBill(null);
      await fetchBills(true);

      // Offer receipt printing
      setTimeout(() => {
        handlePrintBill(settledBillCopy);
      }, 300);
    } catch (err: any) {
      toast({
        title: "Payment settlement failed",
        description: err.message || "Please check with system administrator.",
        variant: "destructive",
      });
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handlePrintBill = (bill: TableBill) => {
    const rawNum = String(bill.tableNumber || "01").replace(/\D/g, "").padStart(3, "0");
    const d = bill.createdAt ? new Date(bill.createdAt) : new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const invSeq = bill.billNumber?.startsWith("INV-") ? bill.billNumber : `INV-${yy}${mm}${dd}-${rawNum || "001"}`;

    const formattedOrder = {
      invoiceNumber: invSeq,
      orderNumber: invSeq,
      tableNumber: bill.tableNumber,
      createdAt: bill.createdAt || new Date().toISOString(),
      serverName: bill.closedBy || "Staff / Cashier",
      items: bill.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        subtotal: i.subtotal || i.price * i.quantity,
        specialInstructions: i.specialInstructions,
      })),
      subtotal: bill.subtotal,
      taxes: bill.taxes,
      serviceCharge: 0,
      total: bill.total,
      paymentMethod: bill.paymentMethod || (bill.paymentStatus === "PAID" ? "PAID VIA UPI" : "UNPAID"),
      paymentStatus: bill.paymentStatus,
    };

    printBillDocument(
      formattedOrder,
      restaurantName,
      billSettings || DEFAULT_BILL_SETTINGS,
      currency
    );
  };

  // Filter bills
  const todayStr = new Date().toDateString();

  const allBills = useMemo(() => {
    const map = new Map<string, TableBill>();
    activeBills.forEach((b) => {
      if (b.total > 0 || b.itemsCount > 0) map.set(b.id, b);
    });
    settledBills.forEach((b) => {
      if (b.total > 0) map.set(b.id, b);
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.paymentStatus !== "PAID" && b.paymentStatus === "PAID") return -1;
      if (a.paymentStatus === "PAID" && b.paymentStatus !== "PAID") return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [activeBills, settledBills]);

  const unpaidBills = useMemo(() => {
    return allBills.filter((b) => b.paymentStatus !== "PAID" && b.status === "ACTIVE");
  }, [allBills]);

  const paidTodayBills = useMemo(() => {
    return allBills.filter((b) => {
      if (b.paymentStatus !== "PAID") return false;
      const d = new Date(b.closedAt || b.createdAt).toDateString();
      return d === todayStr;
    });
  }, [allBills, todayStr]);

  const displayedBills = useMemo(() => {
    let list: TableBill[] = [];
    if (billFilter === "UNPAID") list = unpaidBills;
    else if (billFilter === "PAID_TODAY") list = paidTodayBills;
    else list = allBills;

    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((b) => {
      return (
        b.tableNumber.toLowerCase().includes(q) ||
        b.billNumber.toLowerCase().includes(q) ||
        (b.paymentMethod && b.paymentMethod.toLowerCase().includes(q)) ||
        b.items.some((i) => i.name.toLowerCase().includes(q))
      );
    });
  }, [billFilter, unpaidBills, paidTodayBills, allBills, search]);

  const totalActiveOutstanding = activeBills.reduce((acc, b) => acc + (b.total || 0), 0);
  const totalSettledToday = paidTodayBills.reduce((acc, b) => acc + (b.total || 0), 0);

  return (
    <div className="space-y-6" id="bills-management-container">
      {/* Header & Metrics */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Receipt className="h-6 w-6 text-amber-600 dark:text-amber-500" />
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Table Bills & Settlements
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage table bills, take payments (Cash, UPI, Card, Bank Transfer), and settle active dining sessions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchBills(true)}
            disabled={refreshing}
            className="gap-1.5"
            id="button-refresh-bills"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Metric Cards - Responsive 3-cols */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Unpaid / Active Bills
            </span>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Receipt className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground font-sans tabular-nums">
              {unpaidBills.length}
            </span>
            <span className="text-xs text-muted-foreground">
              {unpaidBills.length === 1 ? "bill pending" : "bills pending"}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Pending Amount
            </span>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
              <DollarSign className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground truncate font-sans tabular-nums">
              {formatCurrency(totalActiveOutstanding, currency)}
            </span>
            <span className="text-xs text-muted-foreground">
              across active tables
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Paid Today Revenue
            </span>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground truncate font-sans tabular-nums">
              {formatCurrency(totalSettledToday, currency)}
            </span>
            <span className="text-xs text-muted-foreground">
              (<span className="font-sans tabular-nums">{paidTodayBills.length}</span> paid today)
            </span>
          </div>
        </div>
      </div>

      {/* Quick Filter & Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 rounded-xl bg-muted p-1">
          <button
            type="button"
            onClick={() => setBillFilter("ALL")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              billFilter === "ALL"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
            id="tab-filter-all"
          >
            <span>All Bills</span>
            <span className="rounded-full bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground font-sans tabular-nums">
              {allBills.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setBillFilter("UNPAID")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              billFilter === "UNPAID"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
            id="tab-filter-unpaid"
          >
            <span>Unpaid / Pending</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold font-sans tabular-nums ${
                unpaidBills.length > 0
                  ? "bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300"
                  : "bg-muted-foreground/15 text-muted-foreground"
              }`}
            >
              {unpaidBills.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setBillFilter("PAID_TODAY")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              billFilter === "PAID_TODAY"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
            id="tab-filter-paid-today"
          >
            <span>Paid Today</span>
            <span className="rounded-full bg-emerald-100 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-300 px-1.5 py-0.5 text-[10px] font-bold font-sans tabular-nums">
              {paidTodayBills.length}
            </span>
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search table, bill, or item…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-xs rounded-xl"
            id="input-search-bills"
          />
        </div>
      </div>

      {/* Main Bills List Content */}
      {loading ? (
        <TablelineLoader
          variant="card"
          message="Loading bills…"
          subtext="Fetching settlement records and active table tabs…"
          onRetry={fetchBills}
        />
      ) : displayedBills.length === 0 ? (
        <div className="flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-card/60 p-6 text-center" id="empty-bills-state">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Receipt className="h-5 w-5" />
          </div>
          <h3 className="mt-3 font-display text-sm font-bold text-foreground">
            {search ? "No matching bills found" : billFilter === "UNPAID" ? "No unpaid bills" : billFilter === "PAID_TODAY" ? "No bills paid today" : "No bills on record"}
          </h3>
          <p className="mt-0.5 max-w-sm text-xs text-muted-foreground leading-relaxed">
            {search
              ? "Try searching with a different table number or bill ID."
              : billFilter === "UNPAID"
              ? "All active table orders have been settled."
              : "Bills will automatically appear here when guests order or bills are settled."}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop & Tablet Table View */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xs" id="bills-table-container">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border/70 bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Table #</th>
                    <th className="px-4 py-3">Bill #</th>
                    <th className="px-4 py-3">Items</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Payment Method</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {displayedBills.map((bill) => {
                    const isPaid = bill.paymentStatus === "PAID";
                    return (
                      <tr key={bill.id} className="hover:bg-muted/20 transition-colors" id={`bill-row-${bill.id}`}>
                        {/* 1. Table # */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 font-bold text-amber-800 dark:text-amber-300 font-sans tabular-nums">
                              {bill.tableNumber}
                            </span>
                            <div>
                              <div className="font-semibold text-foreground">Table <span className="font-sans tabular-nums">{bill.tableNumber}</span></div>
                              {bill.location && <div className="text-[10px] text-muted-foreground">{bill.location}</div>}
                            </div>
                          </div>
                        </td>

                        {/* 2. Bill # */}
                        <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                          <span className="font-sans tabular-nums">{bill.billNumber}</span>
                        </td>

                        {/* 3. Items count */}
                        <td className="px-4 py-3">
                          <span className="text-foreground font-medium">
                            <span className="font-sans tabular-nums">{bill.itemsCount}</span> {bill.itemsCount === 1 ? "item" : "items"}
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-1">
                            (<span className="font-sans tabular-nums">{bill.ordersCount}</span> {bill.ordersCount === 1 ? "order" : "rounds"})
                          </span>
                        </td>

                        {/* 4. Total */}
                        <td className="px-4 py-3 font-sans tabular-nums font-bold text-foreground text-sm">
                          {formatCurrency(bill.total, currency)}
                        </td>

                        {/* 5. Payment Method */}
                        <td className="px-4 py-3">
                          {isPaid ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                              {bill.paymentMethod === "UPI" && <Smartphone className="h-3 w-3 text-purple-600" />}
                              {bill.paymentMethod === "CASH" && <Banknote className="h-3 w-3 text-emerald-600" />}
                              {bill.paymentMethod === "BANK_TRANSFER" && <Building2 className="h-3 w-3 text-blue-600" />}
                              {bill.paymentMethod === "COUNTER" && <CreditCard className="h-3 w-3 text-amber-600" />}
                              {bill.paymentMethod || "PAID"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">—</span>
                          )}
                        </td>

                        {/* 6. Status */}
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              isPaid
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
                                : "bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300 animate-pulse"
                            }`}
                          >
                            {isPaid ? (
                              <>
                                <CheckCircle2 className="h-3 w-3" />
                                PAID
                              </>
                            ) : (
                              <>
                                <Clock className="h-3 w-3" />
                                PENDING
                              </>
                            )}
                          </span>
                        </td>

                        {/* 7. Timestamp */}
                        <td className="px-4 py-3 text-muted-foreground text-[11px] font-sans tabular-nums">
                          {bill.closedAt ? formatDateTime(bill.closedAt) : formatDateTime(bill.createdAt)}
                        </td>

                        {/* 8. Actions */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {!isPaid && (
                              <Button
                                size="sm"
                                onClick={() => handleOpenPaymentModal(bill)}
                                className="h-8 bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600 text-xs font-semibold gap-1.5 shadow-2xs"
                                id={`button-settle-bill-${bill.id}`}
                              >
                                <Banknote className="h-3.5 w-3.5" />
                                Settle Bill
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setViewingBill(bill)}
                              className="h-8 text-xs gap-1"
                              id={`button-view-bill-${bill.id}`}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Details
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handlePrintBill(bill)}
                              className="h-8 text-xs gap-1"
                              id={`button-print-bill-${bill.id}`}
                              title="Print Bill"
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="grid grid-cols-1 gap-3 md:hidden" id="bills-mobile-cards">
            {displayedBills.map((bill) => {
              const isPaid = bill.paymentStatus === "PAID";
              return (
                <div
                  key={bill.id}
                  className="flex flex-col justify-between rounded-2xl border border-border/70 bg-card p-4 shadow-2xs space-y-3"
                  id={`bill-card-mobile-${bill.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 font-bold text-amber-800 dark:text-amber-300 font-sans tabular-nums">
                        {bill.tableNumber}
                      </span>
                      <div>
                        <div className="font-semibold text-sm text-foreground">Table <span className="font-sans tabular-nums">{bill.tableNumber}</span></div>
                        <div className="font-mono text-[10px] text-muted-foreground"><span className="font-sans tabular-nums">{bill.billNumber}</span></div>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        isPaid
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300"
                      }`}
                    >
                      {isPaid ? "PAID" : "PENDING"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs border-t border-border/50 pt-2">
                    <span className="text-muted-foreground"><span className="font-sans tabular-nums">{bill.itemsCount}</span> items • <span className="font-sans tabular-nums">{bill.ordersCount}</span> rounds</span>
                    <span className="font-sans tabular-nums font-bold text-base text-foreground">{formatCurrency(bill.total, currency)}</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Method: {bill.paymentMethod || "—"}</span>
                    <span className="font-sans tabular-nums">{bill.closedAt ? formatDateTime(bill.closedAt) : formatDateTime(bill.createdAt)}</span>
                  </div>

                  <div className="flex items-center gap-2 border-t border-border/50 pt-2">
                    {!isPaid && (
                      <Button
                        size="sm"
                        onClick={() => handleOpenPaymentModal(bill)}
                        className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold gap-1"
                        id={`button-settle-mobile-${bill.id}`}
                      >
                        <Banknote className="h-3.5 w-3.5" />
                        Settle Bill
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setViewingBill(bill)}
                      className="flex-1 text-xs gap-1"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Details
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handlePrintBill(bill)}
                      className="text-xs px-2.5"
                    >
                      <Printer className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* TAKE PAYMENT MODAL */}
      {payingBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in" id="modal-take-payment">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl transition-all">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Banknote className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-foreground">
                    Settle Table {payingBill.tableNumber} Bill
                  </h3>
                  <p className="font-mono text-xs text-muted-foreground">
                    {payingBill.billNumber}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPayingBill(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Bill Amount Highlight */}
            <div className="my-4 rounded-xl bg-muted/50 p-4 text-center">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Total Settlement Amount
              </span>
              <div className="mt-1 font-sans tabular-nums text-3xl font-extrabold text-foreground">
                {formatCurrency(payingBill.total, currency)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Subtotal: <span className="font-sans tabular-nums">{formatCurrency(payingBill.subtotal, currency)}</span> • Taxes: <span className="font-sans tabular-nums">{formatCurrency(payingBill.taxes, currency)}</span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Select Payment Method
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedPaymentMethod("CASH")}
                  className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all ${
                    selectedPaymentMethod === "CASH"
                      ? "border-emerald-600 bg-emerald-500/10 text-emerald-950 dark:text-emerald-300 font-semibold"
                      : "border-border bg-card text-muted-foreground hover:border-border/80"
                  }`}
                  id="pay-method-cash"
                >
                  <Banknote className="h-5 w-5 text-emerald-600" />
                  <div>
                    <div className="text-xs">Cash</div>
                    <div className="text-[10px] text-muted-foreground">Physical currency</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedPaymentMethod("UPI")}
                  className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all ${
                    selectedPaymentMethod === "UPI"
                      ? "border-purple-600 bg-purple-500/10 text-purple-950 dark:text-purple-300 font-semibold"
                      : "border-border bg-card text-muted-foreground hover:border-border/80"
                  }`}
                  id="pay-method-upi"
                >
                  <Smartphone className="h-5 w-5 text-purple-600" />
                  <div>
                    <div className="text-xs">UPI / QR</div>
                    <div className="text-[10px] text-muted-foreground">GPay, PhonePe, Paytm</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedPaymentMethod("BANK_TRANSFER")}
                  className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all ${
                    selectedPaymentMethod === "BANK_TRANSFER"
                      ? "border-blue-600 bg-blue-500/10 text-blue-950 dark:text-blue-300 font-semibold"
                      : "border-border bg-card text-muted-foreground hover:border-border/80"
                  }`}
                  id="pay-method-bank"
                >
                  <Building2 className="h-5 w-5 text-blue-600" />
                  <div>
                    <div className="text-xs">Bank Transfer</div>
                    <div className="text-[10px] text-muted-foreground">NEFT, IMPS, RTGS</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedPaymentMethod("COUNTER")}
                  className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all ${
                    selectedPaymentMethod === "COUNTER"
                      ? "border-amber-600 bg-amber-500/10 text-amber-950 dark:text-amber-300 font-semibold"
                      : "border-border bg-card text-muted-foreground hover:border-border/80"
                  }`}
                  id="pay-method-counter"
                >
                  <CreditCard className="h-5 w-5 text-amber-600" />
                  <div>
                    <div className="text-xs">Counter POS / Card</div>
                    <div className="text-[10px] text-muted-foreground">Card swipe / Terminal</div>
                  </div>
                </button>
              </div>

              {/* Reference Note Input */}
              <div className="pt-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Transaction Reference Note (Optional)
                </label>
                <Input
                  placeholder="e.g. UTR #, last 4 digits of card, or receipt note"
                  value={referenceNote}
                  onChange={(e) => setReferenceNote(e.target.value)}
                  className="mt-1 text-xs"
                  id="input-payment-ref"
                />
              </div>

              <div className="rounded-lg bg-amber-500/10 p-3 text-[11px] text-amber-800 dark:text-amber-300">
                <strong>Atomic Closure:</strong> Recording payment will automatically mark this bill as Paid, close the active dining session, and make Table {payingBill.tableNumber} Available for new guests.
              </div>
            </div>

            {/* Modal Actions */}
            <div className="mt-5 flex items-center justify-end gap-2 border-t border-border/60 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPayingBill(null)}
                disabled={submittingPayment}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleExecutePayment}
                disabled={submittingPayment}
                className="bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-500 dark:hover:bg-emerald-600 font-semibold gap-1.5"
                id="button-confirm-payment"
              >
                {submittingPayment ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Recording Payment…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Confirm Payment & Free Table
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW BILL DETAILS MODAL */}
      {viewingBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in" id="modal-bill-details">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl transition-all max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-foreground">
                  Table <span className="font-sans tabular-nums">{viewingBill.tableNumber}</span> • Bill Breakdown
                </h3>
                <p className="font-mono text-xs text-muted-foreground">
                  <span className="font-sans tabular-nums">{viewingBill.billNumber}</span> • Started <span className="font-sans tabular-nums">{formatDateTime(viewingBill.createdAt)}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingBill(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Items list */}
            <div className="my-4 flex-1 overflow-y-auto space-y-3 pr-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Itemized Orders (<span className="font-sans tabular-nums">{viewingBill.items.length}</span> items)
              </div>
              <div className="divide-y divide-border/60 rounded-xl border border-border/70 bg-muted/20">
                {viewingBill.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 text-xs">
                    <div>
                      <div className="font-semibold text-foreground">
                        <span className="font-sans tabular-nums">{item.quantity}</span>× {item.name}
                      </div>
                      {item.specialInstructions && (
                        <div className="text-[11px] italic text-muted-foreground">
                          Note: {item.specialInstructions}
                        </div>
                      )}
                      {item.orderNumber && (
                        <div className="text-[10px] text-muted-foreground font-mono">
                          Order #<span className="font-sans tabular-nums">{item.orderNumber}</span>
                        </div>
                      )}
                    </div>
                    <div className="font-sans tabular-nums font-bold text-foreground">
                      {formatCurrency(item.subtotal || item.price * item.quantity, currency)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Financial summary */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-sans tabular-nums">{formatCurrency(viewingBill.subtotal, currency)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Taxes</span>
                  <span className="font-sans tabular-nums">{formatCurrency(viewingBill.taxes, currency)}</span>
                </div>
                <div className="border-t border-border/60 pt-2 flex justify-between font-bold text-sm text-foreground">
                  <span>Total Bill</span>
                  <span className="font-sans tabular-nums text-base">{formatCurrency(viewingBill.total, currency)}</span>
                </div>
                <div className="flex justify-between text-xs pt-1 text-muted-foreground">
                  <span>Payment Status</span>
                  <span className="font-semibold text-foreground">{viewingBill.paymentStatus}</span>
                </div>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-between border-t border-border/60 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePrintBill(viewingBill)}
                className="text-xs gap-1.5"
              >
                <Printer className="h-4 w-4" />
                Print Bill
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewingBill(null)}
                >
                  Close
                </Button>
                {viewingBill.status === "ACTIVE" && (
                  <Button
                    size="sm"
                    onClick={() => {
                      const b = viewingBill;
                      setViewingBill(null);
                      handleOpenPaymentModal(b);
                    }}
                    className="bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600 font-semibold gap-1.5"
                  >
                    <Banknote className="h-4 w-4" />
                    Take Payment
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
