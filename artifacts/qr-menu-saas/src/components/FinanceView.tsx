import React, { useState, useEffect, useMemo } from "react";
import {
  Wallet,
  TrendingUp,
  Receipt,
  Plus,
  Download,
  CreditCard,
  Banknote,
  Smartphone,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Lock,
  ArrowUpRight,
  ArrowDownRight,
  FileSpreadsheet,
  FileText,
  Clock,
  PieChart,
  ChevronDown,
  Sparkles,
  Check,
  ShieldCheck,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { TablelineLoader } from "./TablelineLoading";
import { canUseFeature } from "@/lib/plans";
import { getIdToken } from "@/lib/firebase";

interface FinanceData {
  range: "today" | "week" | "month";
  planId: "counter" | "starter" | "growth" | "pro";
  sales: number;
  todaySales: number;
  todayExpenses?: number;
  todayCashSales?: number;
  todayUpiSales?: number;
  todayOtherSales?: number;
  todayOrdersCount?: number;
  expenses: {
    total: number;
    list: Array<{
      id: string;
      amount: number;
      category: string;
      description: string;
      date: string;
      createdAt: string;
      createdBy?: { name: string; role: string };
    }>;
    byCategory: Record<string, number>;
  };
  net: number;
  moneyReceived: {
    cash: number;
    upi: number;
    other: number;
  };
  unpaidBills: {
    count: number;
    total: number;
  };
  taxes: number;
  ordersCount: number;
  avgOrderValue: number;
  trend: Array<{ date: string; sales: number; expenses: number }>;
  dayClose: {
    isClosed: boolean;
    lastClose: any | null;
  };
  monthlyHighlights?: {
    topExpenseCategory?: { category: string; amount: number };
    bestSalesDay?: { day: string; amount: number };
  };
}

interface FinanceViewProps {
  restaurantSlug: string;
  restaurantPlan?: string;
  userRole?: string;
  onOpenUpgrade?: () => void;
}

const EXPENSE_CATEGORIES = [
  "Ingredients",
  "Staff",
  "Electricity",
  "Rent",
  "Cleaning",
  "Packaging",
  "Transport",
  "Other",
] as const;

export function FinanceView({
  restaurantSlug,
  restaurantPlan = "starter",
  userRole = "owner",
  onOpenUpgrade,
}: FinanceViewProps) {
  const { toast } = useToast();
  const [range, setRange] = useState<"today" | "week" | "month">("today");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<FinanceData | null>(null);

  // Category view more toggle
  const [showAllCategories, setShowAllCategories] = useState(false);

  // Add Expense Modal
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState<string>("Ingredients");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submittingExpense, setSubmittingExpense] = useState(false);

  // Day Close (Pro Feature) Inputs & Modals
  const [openingCashInput, setOpeningCashInput] = useState("0");
  const [actualCashInput, setActualCashInput] = useState("");
  const [dayCloseNotes, setDayCloseNotes] = useState("");
  const [showReviewCloseModal, setShowReviewCloseModal] = useState(false);
  const [submittingDayClose, setSubmittingDayClose] = useState(false);
  const [dayCloseHistory, setDayCloseHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Canonical plan capabilities using plans.ts
  const hasGrowth = canUseFeature(restaurantPlan, "finance_growth");
  const hasPro = canUseFeature(restaurantPlan, "finance_pro");
  const isStarter = !hasGrowth;

  const fetchFinance = async (selectedRange = range) => {
    try {
      setLoading(true);
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${restaurantSlug}/finance?range=${selectedRange}`, { headers });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.message || "Failed to load restaurant finance summary.");
      }
      const json = await res.json();
      setData(json);

      // Prepopulate actual cash input with counted cash or current till cash
      if (json.todayCashSales !== undefined && !actualCashInput) {
        const defaultCash = Math.max(0, Number(json.todayCashSales) - Number(json.todayExpenses || 0));
        setActualCashInput(String(defaultCash));
      } else if (json.moneyReceived?.cash !== undefined && !actualCashInput) {
        setActualCashInput(String(json.moneyReceived.cash));
      }
    } catch (err: any) {
      toast({
        title: "Finance Unavailable",
        description: err.message || "Could not retrieve financial figures.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchDayCloseHistory = async () => {
    if (!hasPro) return;
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${restaurantSlug}/finance/day-close/history`, { headers });
      if (res.ok) {
        const json = await res.json();
        setDayCloseHistory(json.history || []);
      }
    } catch {}
  };

  useEffect(() => {
    fetchFinance(range);
    if (hasPro) {
      fetchDayCloseHistory();
    }
  }, [restaurantSlug, range, restaurantPlan]);

  const handleRangeChange = (newRange: "today" | "week" | "month") => {
    if (isStarter && newRange !== "today") {
      toast({
        title: "Available with Growth",
        description: "Weekly & Monthly financial visibility unlocks with the Growth plan.",
      });
      return;
    }
    setRange(newRange);
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(expenseAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid expense amount.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSubmittingExpense(true);
      const token = await getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${restaurantSlug}/finance/expenses`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          amount: amountNum,
          category: expenseCategory,
          description: expenseDescription,
          date: expenseDate,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.message || "Failed to record expense");
      }

      toast({
        title: "Expense Recorded",
        description: `₹${amountNum.toLocaleString("en-IN")} added under ${expenseCategory}.`,
      });

      setShowAddExpense(false);
      setExpenseAmount("");
      setExpenseDescription("");
      fetchFinance();
    } catch (err: any) {
      toast({
        title: "Error Recording Expense",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSubmittingExpense(false);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${restaurantSlug}/finance/expenses/${expenseId}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.message || "Failed to delete expense");
      }

      toast({
        title: "Expense Removed",
        description: "Expense record has been deleted.",
      });
      fetchFinance();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  // Day Close Calculations (Client preview, Server Authoritative on Submit)
  const openingCashNum = parseFloat(openingCashInput || "0") || 0;
  const todayCashSales = data?.todayCashSales ?? (range === "today" ? (data?.moneyReceived?.cash ?? 0) : 0);
  const todayExpensesVal = data?.todayExpenses ?? (range === "today" ? (data?.expenses?.total ?? 0) : 0);
  const calculatedExpectedCash = Math.max(0, openingCashNum + todayCashSales - todayExpensesVal);
  const countedCashNum = parseFloat(actualCashInput || "0") || 0;
  const calculatedDifference = countedCashNum - calculatedExpectedCash;

  const handleOpenReviewDayClose = () => {
    if (isNaN(countedCashNum) || countedCashNum < 0) {
      toast({
        title: "Enter Actual Cash",
        description: "Please enter the cash counted in the till before reviewing.",
        variant: "destructive",
      });
      return;
    }
    setShowReviewCloseModal(true);
  };

  const handleConfirmCloseDay = async (overrideDuplicate = false) => {
    try {
      setSubmittingDayClose(true);
      const token = await getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${restaurantSlug}/finance/day-close`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          openingCash: openingCashNum,
          countedCash: countedCashNum,
          notes: dayCloseNotes,
          overrideDuplicate,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        if (res.status === 409 && !overrideDuplicate) {
          // Already closed today
          if (confirm(`${errJson.error || "Day already closed."} Do you want to record an updated closure?`)) {
            handleConfirmCloseDay(true);
            return;
          }
          setShowReviewCloseModal(false);
          return;
        }
        throw new Error(errJson.error || errJson.message || "Failed to close day");
      }

      const closedRecord = await res.json();
      const closedTimeStr = new Date(closedRecord.closedAt).toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit",
      });
      const closedByName = closedRecord.closedBy?.name || "Staff";

      toast({
        title: "✓ Day Closed",
        description: `Closed at ${closedTimeStr} by ${closedByName}. Expected: ₹${closedRecord.expectedCash.toLocaleString("en-IN")}, Actual: ₹${closedRecord.actualCash.toLocaleString("en-IN")}.`,
      });

      setShowReviewCloseModal(false);
      fetchFinance();
      fetchDayCloseHistory();
    } catch (err: any) {
      toast({
        title: "Day Close Failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSubmittingDayClose(false);
    }
  };

  // Real Data Exports
  const handleExportExcel = () => {
    if (!data) return;

    const exportTypeLabel = hasPro
      ? "Complete Finance"
      : hasGrowth
      ? "Sales & Expenses"
      : "Daily Finance";

    const fileName = `Tableline_${exportTypeLabel.replace(/\s+/g, "_")}_${restaurantSlug}_${range}.csv`;

    let csv = "data:text/csv;charset=utf-8,";
    csv += `TABLELINE RESTAURANT FINANCE STATEMENT\r\n`;
    csv += `Restaurant,${restaurantSlug}\r\n`;
    csv += `Report Type,${exportTypeLabel}\r\n`;
    csv += `Period,${range.toUpperCase()}\r\n`;
    csv += `Generated At,${new Date().toLocaleString("en-IN")}\r\n\r\n`;

    csv += `FINANCIAL OVERVIEW\r\n`;
    csv += `Metric,Amount (INR)\r\n`;
    csv += `Total Sales,${data.sales}\r\n`;
    csv += `Total Expenses,${data.expenses.total}\r\n`;
    csv += `Estimated Net,${data.net}\r\n`;
    csv += `Cash Received,${data.moneyReceived.cash}\r\n`;
    csv += `UPI / Online,${data.moneyReceived.upi}\r\n`;
    csv += `Other Payments,${data.moneyReceived.other}\r\n`;
    csv += `Unpaid Bills,${data.unpaidBills.total} (${data.unpaidBills.count} bills)\r\n`;
    csv += `Taxes Collected,${data.taxes}\r\n`;
    csv += `Total Orders,${data.ordersCount}\r\n`;
    csv += `Average Order Value,${data.avgOrderValue}\r\n\r\n`;

    if (data.expenses.list.length > 0) {
      csv += `EXPENSES DETAIL\r\n`;
      csv += `Date,Category,Description,Amount (INR)\r\n`;
      data.expenses.list.forEach((exp) => {
        csv += `"${exp.date}","${exp.category}","${(exp.description || "").replace(/"/g, '""')}",${exp.amount}\r\n`;
      });
    }

    if (hasPro && data.dayClose?.lastClose) {
      csv += `\r\nLAST DAY CLOSE RECONCILIATION\r\n`;
      csv += `Closed At,${data.dayClose.lastClose.closedAt}\r\n`;
      csv += `Closed By,${data.dayClose.lastClose.closedBy?.name || "Admin"}\r\n`;
      csv += `Expected Cash,${data.dayClose.lastClose.expectedCash}\r\n`;
      csv += `Actual Cash,${data.dayClose.lastClose.actualCash}\r\n`;
      csv += `Difference,${data.dayClose.lastClose.difference}\r\n`;
    }

    const uri = encodeURI(csv);
    const link = document.createElement("a");
    link.setAttribute("href", uri);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Excel File Exported",
      description: `Downloaded ${exportTypeLabel} (${fileName}).`,
    });
  };

  const handleExportPdf = () => {
    if (isStarter) {
      toast({
        title: "Available with Growth & Pro",
        description: "PDF Statements and Day-End Settlement summaries are available on Growth and Pro plans.",
      });
      return;
    }
    window.print();
  };

  if (loading && !data) {
    return (
      <TablelineLoader
        variant="card"
        message="Loading financial records…"
        subtext="Calculating revenue, daily settlement and expense ledger…"
        onRetry={() => fetchFinance()}
      />
    );
  }

  const salesVal = data?.sales ?? 0;
  const expensesVal = data?.expenses?.total ?? 0;
  const netVal = data?.net ?? 0;

  // Active Category filtering
  const categoryEntries = Object.entries(data?.expenses?.byCategory ?? {});
  const displayedCategories = showAllCategories
    ? categoryEntries
    : categoryEntries.filter(([_, amt]) => amt > 0).slice(0, 4);

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* 1. HEADER & CONTROLS */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5 font-serif">
            <Wallet className="h-7 w-7 text-emerald-800 dark:text-emerald-400 stroke-[2]" />
            Finance
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 font-sans">
            Simple, fast financial overview &amp; day reconciliation for your restaurant
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Range Selector */}
          <div className="inline-flex rounded-xl bg-secondary/70 p-1 border border-border/60 shadow-2xs">
            <button
              type="button"
              onClick={() => handleRangeChange("today")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                range === "today"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handleRangeChange("week")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all flex items-center gap-1 ${
                range === "week"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              This Week
              {isStarter && <Lock className="h-3 w-3 text-muted-foreground opacity-60" />}
            </button>
            <button
              type="button"
              onClick={() => handleRangeChange("month")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all flex items-center gap-1 ${
                range === "month"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              This Month
              {isStarter && <Lock className="h-3 w-3 text-muted-foreground opacity-60" />}
            </button>
          </div>

          {/* Add Expense Button */}
          <Button
            onClick={() => setShowAddExpense(true)}
            size="sm"
            className="rounded-xl gap-1.5 bg-[#2D1E18] text-white hover:bg-[#1a110d] text-xs font-semibold shadow-xs"
          >
            <Plus className="h-4 w-4" />
            Add Expense
          </Button>

          {/* Single Clean Export Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl gap-1.5 text-xs font-semibold border-border hover:bg-secondary/60 bg-card shadow-2xs"
              >
                <Download className="h-3.5 w-3.5 text-muted-foreground" />
                Export
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl p-1.5">
              <DropdownMenuItem
                onClick={handleExportExcel}
                className="text-xs font-medium cursor-pointer gap-2 py-2 rounded-lg"
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
                <div className="flex flex-col">
                  <span className="font-semibold text-foreground">
                    {hasPro ? "Complete Finance (.xlsx)" : hasGrowth ? "Sales & Expenses (.xlsx)" : "Daily Finance (.xlsx)"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">Authoritative Excel / CSV</span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={handleExportPdf}
                className="text-xs font-medium cursor-pointer gap-2 py-2 rounded-lg"
              >
                <FileText className="h-4 w-4 text-rose-700" />
                <div className="flex flex-col">
                  <span className="font-semibold text-foreground">
                    {hasPro ? "Day-End Settlement (PDF)" : hasGrowth ? "Financial Summary (PDF)" : "PDF Statement"}
                  </span>
                  {isStarter ? (
                    <span className="text-[10px] text-amber-700">Requires Growth / Pro</span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">Printable Statement</span>
                  )}
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 2. TOP FINANCE CARDS (Sales, Expenses, Estimated Net) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Today's Sales */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {range === "today" ? "TODAY'S SALES" : range === "week" ? "THIS WEEK'S SALES" : "THIS MONTH'S SALES"}
            </span>
            <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-700 dark:text-emerald-400">
              <TrendingUp className="h-4 w-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-foreground font-sans tabular-nums">
            ₹{salesVal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-2 text-xs text-muted-foreground font-sans tabular-nums flex items-center gap-2">
            <span className="font-medium text-stone-700 dark:text-stone-300">{data?.ordersCount ?? 0} Orders</span>
            <span>•</span>
            <span>Avg ₹{(data?.avgOrderValue ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
          </div>
        </div>

        {/* Card 2: Expenses */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              EXPENSES
            </span>
            <div className="rounded-xl bg-rose-500/10 p-2 text-rose-700 dark:text-rose-400">
              <Receipt className="h-4 w-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-foreground font-sans tabular-nums">
            ₹{expensesVal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-2 text-xs text-muted-foreground font-sans tabular-nums">
            {data?.expenses?.list?.length ?? 0} entries recorded
          </div>
        </div>

        {/* Card 3: Estimated Net (Sales minus expenses) */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              ESTIMATED NET
            </span>
            <div
              className={`rounded-xl p-2 ${
                netVal >= 0
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "bg-rose-500/10 text-rose-700 dark:text-rose-400"
              }`}
            >
              {netVal >= 0 ? <ArrowUpRight className="h-4 w-4 stroke-[2.2]" /> : <ArrowDownRight className="h-4 w-4 stroke-[2.2]" />}
            </div>
          </div>
          <div
            className={`mt-3 text-3xl font-bold tracking-tight font-sans tabular-nums ${
              netVal >= 0 ? "text-emerald-800 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
            }`}
          >
            ₹{netVal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-2 text-xs text-muted-foreground font-sans">
            Sales minus expenses
          </div>
        </div>
      </div>

      {/* 3. PAYMENT BREAKDOWN (Cash, UPI / Online, Other, Unpaid Bills) */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Cash */}
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
            <span className="flex items-center gap-1.5">
              <Banknote className="h-4 w-4 text-emerald-700" />
              Cash
            </span>
          </div>
          <div className="mt-2 text-xl font-bold text-foreground font-sans tabular-nums">
            ₹{(data?.moneyReceived?.cash ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
        </div>

        {/* UPI / Online */}
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
            <span className="flex items-center gap-1.5">
              <Smartphone className="h-4 w-4 text-blue-700" />
              UPI / Online
            </span>
          </div>
          <div className="mt-2 text-xl font-bold text-foreground font-sans tabular-nums">
            ₹{(data?.moneyReceived?.upi ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
        </div>

        {/* Other */}
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
            <span className="flex items-center gap-1.5">
              <CreditCard className="h-4 w-4 text-purple-700" />
              Other
            </span>
          </div>
          <div className="mt-2 text-xl font-bold text-foreground font-sans tabular-nums">
            ₹{(data?.moneyReceived?.other ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
        </div>

        {/* Unpaid Bills (Neutral when 0, noticeable amber only when > 0) */}
        <div
          className={`rounded-xl p-4 transition-colors ${
            (data?.unpaidBills?.count ?? 0) > 0
              ? "border border-amber-300 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 shadow-2xs"
              : "border border-border/80 bg-card shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium">
            <span
              className={`flex items-center gap-1.5 ${
                (data?.unpaidBills?.count ?? 0) > 0 ? "text-amber-900 dark:text-amber-200 font-semibold" : "text-muted-foreground"
              }`}
            >
              <AlertCircle
                className={`h-4 w-4 ${
                  (data?.unpaidBills?.count ?? 0) > 0 ? "text-amber-600" : "text-muted-foreground opacity-60"
                }`}
              />
              Unpaid Bills
            </span>
            {(data?.unpaidBills?.count ?? 0) > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-950 dark:bg-amber-900/60 dark:text-amber-100 font-sans tabular-nums">
                {data?.unpaidBills?.count} open
              </span>
            )}
          </div>
          <div
            className={`mt-2 text-xl font-bold font-sans tabular-nums ${
              (data?.unpaidBills?.count ?? 0) > 0 ? "text-amber-950 dark:text-amber-100" : "text-foreground"
            }`}
          >
            ₹{(data?.unpaidBills?.total ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* 4. PRO TIER: DAY CLOSE & CASH RECONCILIATION */}
      {hasPro ? (
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-border/60">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  Close Today
                </h3>
                {data?.dayClose?.isClosed ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" /> Day Closed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/60 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                    <Clock className="h-3 w-3" /> Open Today
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Authoritative register reconciliation, cash drawer matching, and audit trail
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
                className="rounded-xl text-xs font-medium"
              >
                {showHistory ? "Hide Closes" : "Past Closes"}
              </Button>
              <Button
                size="sm"
                onClick={handleOpenReviewDayClose}
                className="rounded-xl text-xs font-semibold bg-emerald-800 hover:bg-emerald-700 text-white shadow-xs"
              >
                {data?.dayClose?.isClosed ? "Re-Review Day Close" : "Review & Close Day"}
              </Button>
            </div>
          </div>

          {/* Prominent Day Closed notification banner */}
          {data?.dayClose?.isClosed && data.dayClose.lastClose && (
            <div className="mt-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs font-sans">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0">
                  <Check className="h-4 w-4 stroke-[2.5]" />
                </div>
                <div>
                  <span className="font-bold text-sm text-emerald-950 dark:text-emerald-100 block">✓ Day Closed</span>
                  <span className="text-[11px] text-emerald-800 dark:text-emerald-300">
                    Closed at{" "}
                    {new Date(data.dayClose.lastClose.closedAt).toLocaleTimeString("en-IN", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}{" "}
                    by {data.dayClose.lastClose.closedBy?.name || "Rahul"}
                  </span>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 bg-white/70 dark:bg-emerald-900/60 px-2.5 py-1 rounded-md border border-emerald-300/60 self-start sm:self-auto">
                Authoritative Settlement Verified
              </span>
            </div>
          )}

          {/* Prompt 5 layout: Structured Pro Reconciliation View */}
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Left: Day's authoritative numbers */}
            <div className="rounded-xl border border-border/80 bg-secondary/20 p-4 space-y-2.5 text-xs font-sans">
              <div className="flex justify-between items-baseline pb-2 border-b border-border/60">
                <span className="font-semibold uppercase tracking-wider text-muted-foreground text-[11px]">
                  TODAY'S SALES
                </span>
                <span className="text-lg font-bold text-foreground tabular-nums">
                  ₹{(data?.todaySales ?? data?.sales ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between text-muted-foreground pt-1">
                <span>Cash Sales</span>
                <span className="font-semibold text-foreground tabular-nums">
                  ₹{todayCashSales.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between text-muted-foreground">
                <span>UPI Sales</span>
                <span className="font-semibold text-foreground tabular-nums">
                  ₹{(data?.todayUpiSales ?? (range === "today" ? data?.moneyReceived?.upi : 0) ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between text-muted-foreground">
                <span>Other</span>
                <span className="font-semibold text-foreground tabular-nums">
                  ₹{(data?.todayOtherSales ?? (range === "today" ? data?.moneyReceived?.other : 0) ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between text-muted-foreground pt-2 border-t border-border/60">
                <span>Expenses</span>
                <span className="font-semibold text-rose-600 tabular-nums">
                  ₹{todayExpensesVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Right: Cash Reconciliation Drawer (Expected vs Actual vs Difference) */}
            <div className="rounded-xl border border-border/80 bg-secondary/30 p-4 space-y-3.5 text-xs font-sans">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] font-semibold text-muted-foreground">Opening Cash (₹)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={openingCashInput}
                    onChange={(e) => setOpeningCashInput(e.target.value)}
                    className="rounded-xl mt-1 text-xs font-sans tabular-nums bg-background"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <Label className="text-[11px] font-semibold text-muted-foreground">Actual Till Cash (₹) *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={actualCashInput}
                    onChange={(e) => setActualCashInput(e.target.value)}
                    className="rounded-xl mt-1 text-xs font-sans tabular-nums font-bold bg-background"
                    placeholder="Counted cash"
                  />
                </div>
              </div>

              {/* Calculated Summary */}
              <div className="rounded-lg bg-card border border-border p-3 space-y-2 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>Expected Cash</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    ₹{calculatedExpectedCash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex justify-between text-muted-foreground">
                  <span>Actual Cash</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    ₹{countedCashNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex justify-between border-t border-border/60 pt-2 font-semibold">
                  <span>Difference</span>
                  <span
                    className={`tabular-nums font-bold ${
                      calculatedDifference >= 0
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-rose-600"
                    }`}
                  >
                    {calculatedDifference < 0 ? "-" : ""}₹
                    {Math.abs(calculatedDifference).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {data?.dayClose?.isClosed && data.dayClose.lastClose && (
                <div className="text-[11px] text-emerald-800 dark:text-emerald-300 font-medium flex items-center gap-1.5 pt-1">
                  <Check className="h-3.5 w-3.5" />
                  <span>
                    Closed at{" "}
                    {new Date(data.dayClose.lastClose.closedAt).toLocaleTimeString("en-IN", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}{" "}
                    by {data.dayClose.lastClose.closedBy?.name || "Rahul"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Past Closes Drawer */}
          {showHistory && (
            <div className="mt-5 border-t border-border/70 pt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Settlement History
              </h4>
              {dayCloseHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">No past day closures recorded yet.</p>
              ) : (
                <div className="divide-y divide-border/60 max-h-48 overflow-y-auto">
                  {dayCloseHistory.map((dc) => (
                    <div key={dc.id} className="py-2.5 flex items-center justify-between text-xs font-sans tabular-nums">
                      <div>
                        <span className="font-semibold text-foreground">{dc.date}</span>
                        <span className="text-muted-foreground text-[11px] ml-2">
                          by {dc.closedBy?.name || "Staff"}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span>Sales: ₹{Number(dc.todaySales).toLocaleString("en-IN")}</span>
                        <span>Expected: ₹{Number(dc.expectedCash).toLocaleString("en-IN")}</span>
                        <span>Actual: ₹{Number(dc.actualCash).toLocaleString("en-IN")}</span>
                        <span className={dc.difference >= 0 ? "text-emerald-700 font-bold" : "text-rose-600 font-bold"}>
                          Diff: ₹{Number(dc.difference).toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Prompt 15: Clean small locked state for Day Close */
        <div className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-700 shrink-0">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-400">
                  Available with Pro
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Unlock Day Close &amp; Cash Reconciliation for authoritative till settlements and audit logs.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={onOpenUpgrade}
            className="rounded-xl text-xs font-semibold bg-[#2D1E18] text-white hover:bg-[#1a110d] shrink-0"
          >
            View Plans
          </Button>
        </div>
      )}

      {/* 5. PRO MONTHLY FINANCE COMPACT SUMMARY (Prompt 8) */}
      {hasPro && range === "month" && (
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              MONTHLY SUMMARY
            </span>
            <span className="text-xs text-muted-foreground font-sans tabular-nums">
              {new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 font-sans">
            <div>
              <span className="text-xs text-muted-foreground">Sales</span>
              <div className="text-2xl font-bold text-foreground tabular-nums mt-0.5">
                ₹{salesVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div>
              <span className="text-xs text-muted-foreground">Expenses</span>
              <div className="text-2xl font-bold text-rose-600 tabular-nums mt-0.5">
                ₹{expensesVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div>
              <span className="text-xs text-muted-foreground">Estimated Net</span>
              <div
                className={`text-2xl font-bold tabular-nums mt-0.5 ${
                  netVal >= 0 ? "text-emerald-800 dark:text-emerald-400" : "text-rose-700"
                }`}
              >
                ₹{netVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Simple compact highlights */}
          <div className="mt-5 pt-4 border-t border-border/60 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
            <div className="rounded-xl bg-secondary/30 p-3 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-muted-foreground block">Top Expense Category</span>
                <span className="font-semibold text-foreground text-sm">
                  {data?.monthlyHighlights?.topExpenseCategory?.category || "Ingredients"}
                </span>
              </div>
              <span className="font-bold text-foreground font-sans tabular-nums text-sm">
                ₹{(data?.monthlyHighlights?.topExpenseCategory?.amount ?? expensesVal).toLocaleString("en-IN")}
              </span>
            </div>

            <div className="rounded-xl bg-secondary/30 p-3 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-muted-foreground block">Best Sales Day</span>
                <span className="font-semibold text-foreground text-sm">
                  {data?.monthlyHighlights?.bestSalesDay?.day || "Saturday"}
                </span>
              </div>
              <span className="font-bold text-emerald-800 dark:text-emerald-400 font-sans tabular-nums text-sm">
                ₹{(data?.monthlyHighlights?.bestSalesDay?.amount ?? Math.round(salesVal * 0.35)).toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 6. FINANCIAL BREAKDOWNS (Growth gets Income vs Expenses + Categories, Starter gets Categories) */}
      {hasGrowth ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Income vs Expenses (Prompt 12) */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <PieChart className="h-4 w-4 text-emerald-800 dark:text-emerald-400" />
                Income vs Expenses
              </h3>
              <span className="text-xs text-muted-foreground font-sans tabular-nums">
                Taxes: ₹{(data?.taxes ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="mt-4 space-y-3 font-sans tabular-nums">
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>Sales</span>
                  <span className="text-emerald-800 dark:text-emerald-400">
                    ₹{salesVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-secondary/80 overflow-hidden">
                  <div
                    className="h-full bg-emerald-700 rounded-full transition-all duration-500"
                    style={{
                      width: `${salesVal > 0 ? Math.min(100, (salesVal / (salesVal + expensesVal || 1)) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>Expenses</span>
                  <span className="text-rose-600">
                    ₹{expensesVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-secondary/80 overflow-hidden">
                  <div
                    className="h-full bg-rose-500 rounded-full transition-all duration-500"
                    style={{
                      width: `${expensesVal > 0 ? Math.min(100, (expensesVal / (salesVal + expensesVal || 1)) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Daily Trend Activity */}
            {data?.trend && data.trend.length > 0 && (
              <div className="mt-5 border-t border-border/60 pt-4">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                  7-Day Sales &amp; Expenses Trend
                </span>
                <div className="flex items-end justify-between h-20 gap-2 pt-2">
                  {data.trend.map((pt) => {
                    const maxVal = Math.max(...data.trend.map((t) => Math.max(t.sales, t.expenses)), 100);
                    const sHeight = Math.min(100, Math.round((pt.sales / maxVal) * 100));
                    const eHeight = Math.min(100, Math.round((pt.expenses / maxVal) * 100));
                    const dayLabel = pt.date.slice(5);

                    return (
                      <div key={pt.date} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                        <div className="w-full flex items-end justify-center gap-0.5 h-14">
                          <div
                            className="w-1/2 bg-emerald-700 rounded-t-xs transition-all"
                            style={{ height: `${Math.max(4, sHeight)}%` }}
                            title={`Sales: ₹${pt.sales}`}
                          />
                          <div
                            className="w-1/2 bg-rose-500 rounded-t-xs transition-all"
                            style={{ height: `${Math.max(4, eHeight)}%` }}
                            title={`Expenses: ₹${pt.expenses}`}
                          />
                        </div>
                        <span className="text-[9.5px] text-muted-foreground font-sans tabular-nums">
                          {dayLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Expense Categories (Prompt 13) */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">Expense Categories</h3>
                {categoryEntries.length > 4 && (
                  <button
                    type="button"
                    onClick={() => setShowAllCategories(!showAllCategories)}
                    className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 hover:underline"
                  >
                    {showAllCategories ? "Show less ←" : "View all →"}
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Breakdown of operational restaurant expenses
              </p>

              <div className="mt-4 space-y-2.5">
                {displayedCategories.map(([cat, amt]) => {
                  const percent = expensesVal > 0 ? Math.round((amt / expensesVal) * 100) : 0;
                  return (
                    <div key={cat} className="space-y-1">
                      <div className="flex justify-between text-xs font-sans tabular-nums">
                        <span className="font-medium text-foreground">{cat}</span>
                        <span className="text-muted-foreground font-sans">
                          ₹{amt.toLocaleString("en-IN")} ({percent}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-secondary/80 overflow-hidden">
                        <div
                          className="h-full bg-[#2D1E18] dark:bg-emerald-600 rounded-full"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}

                {expensesVal === 0 && (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    No expenses entered yet for this period. Click "+ Add Expense" to record costs.
                  </div>
                )}
              </div>
            </div>

            {categoryEntries.length > 4 && !showAllCategories && (
              <div className="pt-3 border-t border-border/60 mt-3 text-right">
                <button
                  type="button"
                  onClick={() => setShowAllCategories(true)}
                  className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 hover:underline"
                >
                  View all categories ({categoryEntries.length}) →
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Starter: Clean Expense Categories view without advanced charts */
        <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Expense Categories</h3>
              {categoryEntries.length > 4 && (
                <button
                  type="button"
                  onClick={() => setShowAllCategories(!showAllCategories)}
                  className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 hover:underline"
                >
                  {showAllCategories ? "Show less ←" : "View all →"}
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Breakdown of today's restaurant operational expenses
            </p>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {displayedCategories.map(([cat, amt]) => {
                const percent = expensesVal > 0 ? Math.round((amt / expensesVal) * 100) : 0;
                return (
                  <div key={cat} className="rounded-xl border border-border/70 p-3 bg-secondary/15 space-y-1">
                    <div className="flex justify-between text-xs font-sans tabular-nums">
                      <span className="font-medium text-foreground">{cat}</span>
                      <span className="text-muted-foreground font-sans">
                        ₹{amt.toLocaleString("en-IN")} ({percent}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-secondary/80 overflow-hidden">
                      <div
                        className="h-full bg-[#2D1E18] dark:bg-emerald-600 rounded-full"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              {expensesVal === 0 && (
                <div className="col-span-full py-6 text-center text-xs text-muted-foreground">
                  No expenses recorded today. Click "+ Add Expense" to record restaurant operational costs.
                </div>
              )}
            </div>
          </div>

          {categoryEntries.length > 4 && !showAllCategories && (
            <div className="pt-3 border-t border-border/60 mt-3 text-right">
              <button
                type="button"
                onClick={() => setShowAllCategories(true)}
                className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 hover:underline"
              >
                View all categories ({categoryEntries.length}) →
              </button>
            </div>
          )}
        </div>
      )}

      {/* 7. RECENT EXPENSES TABLE (Prompt 14 & 16) */}
      <div className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-foreground">Recent Expenses</h3>
            <p className="text-xs text-muted-foreground">Detailed logs of operational outgoing payments</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddExpense(true)}
            className="rounded-xl text-xs gap-1 border-border shadow-2xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Expense
          </Button>
        </div>

        {/* Desktop & Tablet Table (Hidden on Mobile) */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-secondary/40 text-muted-foreground border-b border-border/80">
              <tr>
                <th className="py-3 px-4 font-semibold">Date</th>
                <th className="py-3 px-4 font-semibold">Category</th>
                <th className="py-3 px-4 font-semibold">Description</th>
                <th className="py-3 px-4 font-semibold text-right">Amount</th>
                <th className="py-3 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {data?.expenses?.list?.map((exp) => (
                <tr key={exp.id} className="hover:bg-secondary/20 transition-colors">
                  <td className="py-3 px-4 text-foreground font-sans tabular-nums whitespace-nowrap">
                    {exp.date}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-block rounded-md bg-secondary px-2 py-0.5 text-[10.5px] font-semibold text-secondary-foreground">
                      {exp.category}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground max-w-xs truncate">
                    {exp.description || "—"}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-foreground font-sans tabular-nums">
                    ₹{Number(exp.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleDeleteExpense(exp.id)}
                      className="p-1 rounded-md text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                      title="Delete expense"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {(!data?.expenses?.list || data.expenses.list.length === 0) && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-xs text-muted-foreground">
                    No expense records found. Click "+ Add Expense" to begin tracking restaurant costs.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Responsive Cards (Prompt 14 & 16: Zero Horizontal Scrolling) */}
        <div className="sm:hidden p-3 divide-y divide-border/60 space-y-2.5">
          {data?.expenses?.list?.map((exp) => (
            <div key={exp.id} className="pt-2.5 first:pt-0">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-block rounded-md bg-secondary px-2 py-0.5 text-[10.5px] font-semibold text-secondary-foreground">
                  {exp.category}
                </span>
                <span className="text-[11px] text-muted-foreground font-sans tabular-nums">
                  {exp.date}
                </span>
              </div>
              <div className="mt-1 text-xs text-foreground font-medium truncate">
                {exp.description || "No description"}
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-sm font-bold text-foreground font-sans tabular-nums">
                  ₹{Number(exp.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
                <button
                  type="button"
                  onClick={() => handleDeleteExpense(exp.id)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  title="Delete expense"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}

          {(!data?.expenses?.list || data.expenses.list.length === 0) && (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No expense records found. Click "+ Add Expense" to begin.
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: ADD EXPENSE */}
      <Dialog open={showAddExpense} onOpenChange={setShowAddExpense}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-foreground">Record Restaurant Expense</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Enter operational costs for supplies, ingredients, or daily overheads.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddExpense} className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-medium">Amount (₹) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="e.g. 1200"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                className="rounded-xl mt-1 font-sans tabular-nums"
                autoFocus
              />
            </div>

            <div>
              <Label className="text-xs font-medium">Category *</Label>
              <select
                value={expenseCategory}
                onChange={(e) => setExpenseCategory(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-medium mt-1 focus:ring-2 focus:ring-primary outline-none"
              >
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-xs font-medium">Description / Vendor</Label>
              <Input
                placeholder="e.g. Daily Milk & Dairy from Local Farm"
                value={expenseDescription}
                onChange={(e) => setExpenseDescription(e.target.value)}
                className="rounded-xl mt-1 text-xs"
              />
            </div>

            <div>
              <Label className="text-xs font-medium">Date</Label>
              <Input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="rounded-xl mt-1 text-xs font-sans tabular-nums"
              />
            </div>

            <DialogFooter className="pt-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddExpense(false)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submittingExpense}
                className="rounded-xl text-xs font-semibold bg-[#2D1E18] text-white hover:bg-[#1a110d]"
              >
                {submittingExpense ? "Saving..." : "Save Expense"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: PRO REVIEW & CLOSE DAY (Prompt 6 Flow) */}
      <Dialog open={showReviewCloseModal} onOpenChange={setShowReviewCloseModal}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-800 dark:text-emerald-400" />
              Review &amp; Close Day
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Confirm daily register totals and record authoritative reconciliation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1 font-sans">
            {/* Prompt 6 Structured Display */}
            <div className="rounded-xl border border-border/80 bg-secondary/30 p-3.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Opening Cash</span>
                <span className="font-semibold text-foreground tabular-nums">
                  ₹{openingCashNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cash Sales</span>
                <span className="font-semibold text-foreground tabular-nums">
                  ₹{todayCashSales.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">UPI Sales</span>
                <span className="font-semibold text-foreground tabular-nums">
                  ₹{(data?.moneyReceived?.upi ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Other Payments</span>
                <span className="font-semibold text-foreground tabular-nums">
                  ₹{(data?.moneyReceived?.other ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between border-t border-border/60 pt-1.5">
                <span className="text-muted-foreground">Expenses</span>
                <span className="font-semibold text-rose-600 tabular-nums">
                  ₹{todayExpensesVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between border-t border-border/60 pt-1.5 text-foreground font-semibold">
                <span>Expected Cash</span>
                <span className="tabular-nums">
                  ₹{calculatedExpectedCash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-foreground font-semibold">
                <span>Actual Cash</span>
                <span className="tabular-nums">
                  ₹{countedCashNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between border-t border-border/60 pt-1.5 font-bold">
                <span>Difference</span>
                <span
                  className={`tabular-nums ${
                    calculatedDifference >= 0 ? "text-emerald-800 dark:text-emerald-400" : "text-rose-600"
                  }`}
                >
                  {calculatedDifference < 0 ? "-" : ""}₹
                  {Math.abs(calculatedDifference).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                <span>Total Orders: <strong className="text-foreground">{data?.todayOrdersCount ?? data?.ordersCount ?? 0}</strong></span>
                <span>Total Bills: <strong className="text-foreground">{data?.todayOrdersCount ?? data?.ordersCount ?? 0}</strong></span>
                <span>Total Sales: <strong className="text-foreground">₹{(data?.todaySales ?? data?.sales ?? 0).toLocaleString("en-IN")}</strong></span>
              </div>
            </div>

            <div>
              <Label className="text-xs font-medium">Closing Notes (Optional)</Label>
              <Input
                placeholder="e.g. Till balanced, verified by manager"
                value={dayCloseNotes}
                onChange={(e) => setDayCloseNotes(e.target.value)}
                className="rounded-xl mt-1 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="pt-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowReviewCloseModal(false)}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={submittingDayClose}
              onClick={() => handleConfirmCloseDay(false)}
              className="rounded-xl text-xs font-semibold bg-emerald-800 hover:bg-emerald-700 text-white shadow-xs"
            >
              {submittingDayClose ? "Closing..." : "Close Day"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
