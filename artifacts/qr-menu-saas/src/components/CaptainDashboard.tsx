import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Bell,
  Clock,
  Users,
  CheckCircle2,
  Sparkles,
  Droplets,
  Receipt,
  Hand,
  Brush,
  Printer,
  Bluetooth,
  Utensils,
  ChevronRight,
  X,
  AlertTriangle,
  RotateCcw,
  Plus,
  ArrowRight,
  Maximize2,
  Smartphone,
  Eye,
  Coffee,
} from "lucide-react";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
  getDocs,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useThermalPrinter } from "@/hooks/useThermalPrinter";
import { ThermalSlipSimulatorModal } from "./ThermalSlipSimulatorModal";

export type TableStatus =
  | "empty"
  | "browsing"
  | "dining"
  | "attention_needed"
  | "needs_cleaning";

export type PingType = "water" | "bill" | "waiter" | "clean";

export interface TableState {
  tableNumber: string; // e.g., "04"
  status: TableStatus;
  activeSessionId?: string | null;
  guestName?: string | null;
  guestCount?: number;
  seatedAt?: any; // Firestore Timestamp or number or ISO
  lastPing?: {
    type: PingType;
    timestamp: any;
    note?: string;
  } | null;
  activeOrderId?: string | null;
  orderTotal?: number;
  orderItems?: Array<{
    name: string;
    quantity: number;
    price: number;
    isVeg?: boolean;
    specialInstructions?: string;
  }>;
}

interface CaptainDashboardProps {
  restaurantId?: string;
  restaurantName?: string;
  currency?: string;
  onNavigateTab?: (tab: string) => void;
}

// Initial realistic fallback tables for local Indian cafes
const DEFAULT_TABLES: TableState[] = [
  {
    tableNumber: "01",
    status: "empty",
    guestCount: 2,
  },
  {
    tableNumber: "02",
    status: "dining",
    guestName: "Rohan",
    guestCount: 4,
    seatedAt: Date.now() - 32 * 60 * 1000,
    activeOrderId: "ord_102",
    orderTotal: 840,
    orderItems: [
      { name: "Flat White", quantity: 2, price: 210 },
      { name: "Almond Croissant", quantity: 2, price: 210 },
    ],
  },
  {
    tableNumber: "03",
    status: "browsing",
    guestName: "Pooja",
    guestCount: 2,
    seatedAt: Date.now() - 6 * 60 * 1000,
  },
  {
    tableNumber: "04",
    status: "attention_needed",
    guestName: "Vivek",
    guestCount: 3,
    seatedAt: Date.now() - 25 * 60 * 1000,
    activeOrderId: "ord_104",
    orderTotal: 1250,
    lastPing: {
      type: "water",
      timestamp: Date.now() - 2 * 60 * 1000,
      note: "Refill mineral water",
    },
    orderItems: [
      { name: "Cold Brew Tonic", quantity: 2, price: 240 },
      { name: "Truffle Fries", quantity: 1, price: 320 },
      { name: "Sourdough Toast with Avocado", quantity: 1, price: 450 },
    ],
  },
  {
    tableNumber: "05",
    status: "attention_needed",
    guestName: "Ananya",
    guestCount: 2,
    seatedAt: Date.now() - 48 * 60 * 1000,
    activeOrderId: "ord_105",
    orderTotal: 680,
    lastPing: {
      type: "bill",
      timestamp: Date.now() - 4 * 60 * 1000,
      note: "Wants bill split cash & UPI",
    },
    orderItems: [
      { name: "Cappuccino", quantity: 2, price: 190 },
      { name: "Pain au Chocolat", quantity: 1, price: 300 },
    ],
  },
  {
    tableNumber: "06",
    status: "needs_cleaning",
    guestCount: 4,
    orderTotal: 0,
  },
  {
    tableNumber: "07",
    status: "empty",
    guestCount: 2,
  },
  {
    tableNumber: "08",
    status: "dining",
    guestName: "Kabir",
    guestCount: 2,
    seatedAt: Date.now() - 18 * 60 * 1000,
    activeOrderId: "ord_108",
    orderTotal: 560,
    orderItems: [
      { name: "Iced Americano", quantity: 2, price: 180 },
      { name: "Blueberry Muffin", quantity: 1, price: 200 },
    ],
  },
  {
    tableNumber: "09",
    status: "browsing",
    guestName: "Meera",
    guestCount: 1,
    seatedAt: Date.now() - 4 * 60 * 1000,
  },
  {
    tableNumber: "10",
    status: "empty",
    guestCount: 6,
  },
  {
    tableNumber: "11",
    status: "dining",
    guestName: "Dev",
    guestCount: 2,
    seatedAt: Date.now() - 55 * 60 * 1000,
    activeOrderId: "ord_111",
    orderTotal: 920,
    orderItems: [
      { name: "Pour Over Geisha", quantity: 2, price: 310 },
      { name: "Basque Cheesecake", quantity: 1, price: 300 },
    ],
  },
  {
    tableNumber: "12",
    status: "needs_cleaning",
    guestCount: 2,
  },
];

export function CaptainDashboard({
  restaurantId = "the-roast-room",
  restaurantName = "The Roast Room",
  currency = "₹",
  onNavigateTab,
}: CaptainDashboardProps) {
  const { toast } = useToast();
  const [tables, setTables] = useState<TableState[]>(DEFAULT_TABLES);
  const [selectedTable, setSelectedTable] = useState<TableState | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<
    "all" | "attention_needed" | "dining" | "browsing" | "needs_cleaning" | "empty"
  >("all");

  // Manual guest seating state
  const [walkInName, setWalkInName] = useState("");
  const [walkInGuests, setWalkInGuests] = useState("2");
  const [isSeatingModalOpen, setIsSeatingModalOpen] = useState(false);
  const [tableToSeat, setTableToSeat] = useState<TableState | null>(null);

  // Web Bluetooth Thermal Printer Hook
  const {
    isSupported: isBtSupported,
    printerStatus,
    deviceName,
    connectPrinter,
    disconnectPrinter,
    printKOT,
    printBill,
    testPrint,
    isSimulatorOpen,
    simulatorSlip,
    closeSimulator,
  } = useThermalPrinter();

  // Real-time Firestore sync
  useEffect(() => {
    const db = getFirestoreDb();
    if (!db) {
      // Use local storage / fallback memory state
      const saved = localStorage.getItem(`tableline_floor_${restaurantId}`);
      if (saved) {
        try {
          setTables(JSON.parse(saved));
        } catch {
          // ignore
        }
      }
      return;
    }

    const tablesCol = collection(db, "restaurants", restaurantId, "tables");
    const unsubscribe = onSnapshot(
      tablesCol,
      (snapshot) => {
        if (!snapshot.empty) {
          const loaded: TableState[] = [];
          snapshot.forEach((d) => {
            const data = d.data();
            loaded.push({
              tableNumber: d.id,
              status: data.status || "empty",
              activeSessionId: data.activeSessionId,
              guestName: data.guestName,
              guestCount: data.guestCount || 2,
              seatedAt: data.seatedAt,
              lastPing: data.lastPing,
              activeOrderId: data.activeOrderId,
              orderTotal: data.orderTotal,
              orderItems: data.orderItems,
            });
          });
          // Sort numerically by table number
          loaded.sort((a, b) => parseInt(a.tableNumber, 10) - parseInt(b.tableNumber, 10));
          setTables(loaded);
        } else {
          // Seed initial tables in Firestore
          DEFAULT_TABLES.forEach(async (t) => {
            await setDoc(doc(db, "restaurants", restaurantId, "tables", t.tableNumber), t, {
              merge: true,
            });
          });
        }
      },
      (err) => {
        console.warn("Firestore tables listener failed, keeping fallback:", err);
      }
    );

    return () => unsubscribe();
  }, [restaurantId]);

  // Persist local state copy
  const updateTableState = useCallback(
    async (tableNumber: string, updates: Partial<TableState>) => {
      // Optimistic update
      setTables((prev) => {
        const next = prev.map((t) => (t.tableNumber === tableNumber ? { ...t, ...updates } : t));
        try {
          localStorage.setItem(`tableline_floor_${restaurantId}`, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });

      if (selectedTable && selectedTable.tableNumber === tableNumber) {
        setSelectedTable((prev) => (prev ? { ...prev, ...updates } : null));
      }

      // Firestore update if connected
      const db = getFirestoreDb();
      if (db) {
        try {
          await updateDoc(doc(db, "restaurants", restaurantId, "tables", tableNumber), updates);
        } catch {
          // Try setDoc if document did not exist
          try {
            await setDoc(
              doc(db, "restaurants", restaurantId, "tables", tableNumber),
              updates,
              { merge: true }
            );
          } catch (e) {
            console.error("Failed to sync table update to Firestore:", e);
          }
        }
      }
    },
    [restaurantId, selectedTable]
  );

  // Actions
  const handleAcknowledgePing = async (table: TableState) => {
    // If table had an active order, revert to "dining", else "browsing"
    const nextStatus: TableStatus = table.activeOrderId || table.orderTotal ? "dining" : "browsing";
    await updateTableState(table.tableNumber, {
      lastPing: null,
      status: nextStatus,
    });
    toast({
      title: `Table ${table.tableNumber} Ping Acknowledged`,
      description: `Service call cleared. Table is now marked as ${nextStatus}.`,
    });
  };

  const handleMarkCleaned = async (tableNumber: string) => {
    await updateTableState(tableNumber, {
      status: "empty",
      guestName: null,
      activeSessionId: null,
      seatedAt: null,
      lastPing: null,
      activeOrderId: null,
      orderTotal: 0,
      orderItems: [],
    });
    toast({
      title: `Table ${tableNumber} Cleaned & Available`,
      description: "Table is sanitized and ready for the next walk-in party.",
    });
  };

  const handleSeatWalkIn = async () => {
    if (!tableToSeat) return;
    const count = parseInt(walkInGuests, 10) || 2;
    const name = walkInName.trim() || "Guest";

    await updateTableState(tableToSeat.tableNumber, {
      status: "browsing",
      guestName: name,
      guestCount: count,
      seatedAt: Date.now(),
      lastPing: null,
      activeOrderId: null,
      orderTotal: 0,
      orderItems: [],
    });

    toast({
      title: `Table ${tableToSeat.tableNumber} Seated`,
      description: `${name} (${count} pax) seated. QR code menu is live.`,
    });

    setIsSeatingModalOpen(false);
    setWalkInName("");
    setTableToSeat(null);
  };

  // Printing actions
  const handlePrintTableBill = async (table: TableState) => {
    const items = (table.orderItems || []).map((it) => ({
      name: it.name,
      quantity: it.quantity,
      price: it.price,
      total: it.price * it.quantity,
    }));

    const sub = items.reduce((acc, i) => acc + i.total, 0) || table.orderTotal || 450;
    const cgst = Math.round(sub * 0.025 * 100) / 100;
    const sgst = Math.round(sub * 0.025 * 100) / 100;
    const totalTax = cgst + sgst;
    const grand = sub + totalTax;

    const rawNum = String(table.tableNumber).replace(/\D/g, "").padStart(3, "0");
    const d = new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const invSeq = `INV-${yy}${mm}${dd}-${rawNum || "001"}`;

    await printBill({
      cafeName: restaurantName || "The Roasted Bean Cafe",
      cafeAddress: "Shop 4, Ground Floor, Heritage Hub, FC Road, Pune 411004",
      fssai: "11523001000452",
      gstin: "27AAPCA1234F1Z5",
      tableNumber: table.tableNumber,
      dinerFirstName: table.guestName || "Guest",
      billNumber: invSeq,
      timestamp: Date.now(),
      items:
        items.length > 0
          ? items
          : [
              {
                name: "Table Dine-in Items",
                quantity: 1,
                price: sub,
                total: sub,
              },
            ],
      subtotal: sub,
      cgst,
      sgst,
      taxes: totalTax,
      grandTotal: grand,
      currencySymbol: currency,
      paymentMode: "PAID VIA UPI",
      serverName: "Floor Captain",
    });

    toast({
      title: `Bill Dispatched for Table ${table.tableNumber}`,
      description: "Sent to thermal printer.",
    });
  };

  const handlePrintTableKOT = async (table: TableState) => {
    const items = (table.orderItems || []).map((it) => ({
      name: it.name,
      quantity: it.quantity,
      isVeg: it.isVeg ?? true,
      specialInstructions: it.specialInstructions,
    }));

    await printKOT({
      cafeName: restaurantName,
      tableNumber: table.tableNumber,
      dinerFirstName: table.guestName || "Guest",
      orderNumber: table.activeOrderId || `T${table.tableNumber}`,
      items:
        items.length > 0
          ? items
          : [
              {
                name: "Chef Special Tasting Set",
                quantity: 1,
                isVeg: true,
                specialInstructions: "Fresh prep",
              },
            ],
      ticketType: "KOT",
      serverName: "Floor Captain",
    });

    toast({
      title: `KOT Dispatched for Table ${table.tableNumber}`,
      description: "Kitchen order ticket printed for the line cook rail.",
    });
  };

  // Helper formatting
  const getElapsedMinutes = (timestamp: any) => {
    if (!timestamp) return 0;
    const time =
      typeof timestamp === "number"
        ? timestamp
        : timestamp?.toMillis
        ? timestamp.toMillis()
        : new Date(timestamp).getTime();
    if (isNaN(time)) return 0;
    return Math.max(0, Math.floor((Date.now() - time) / 60000));
  };

  // Stats calculation
  const stats = useMemo(() => {
    const counts = {
      total: tables.length,
      attention: 0,
      dining: 0,
      browsing: 0,
      cleaning: 0,
      empty: 0,
    };
    tables.forEach((t) => {
      if (t.status === "attention_needed") counts.attention++;
      else if (t.status === "dining") counts.dining++;
      else if (t.status === "browsing") counts.browsing++;
      else if (t.status === "needs_cleaning") counts.cleaning++;
      else if (t.status === "empty") counts.empty++;
    });
    return counts;
  }, [tables]);

  // Filtered tables
  const filteredTables = useMemo(() => {
    if (activeFilter === "all") return tables;
    return tables.filter((t) => t.status === activeFilter);
  }, [tables, activeFilter]);

  return (
    <div className="space-y-6">
      {/* Top Banner: Table Status, Live Stats & Thermal Printer Link */}
      <div className="bg-[#FAF7F2] dark:bg-[#1A1816] rounded-3xl p-5 sm:p-6 border border-[#EDE4D8] dark:border-stone-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#241B16] dark:text-[#F7F4F0]">
              Captain Dashboard
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Sync
            </span>
          </div>
          <p className="text-sm text-[#776B62] dark:text-stone-400 mt-1">
            Real-time table lifecycles, diner service pings, and direct ESC/POS wireless KOT printing.
          </p>
        </div>

        {/* Wireless Thermal Printer Connection Bar */}
        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          <div
            className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl border text-xs font-semibold shadow-2xs ${
              printerStatus === "connected"
                ? "bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300"
                : printerStatus === "connecting"
                ? "bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300"
                : "bg-white border-[#EDE4D8] text-[#5C5047] dark:bg-stone-900 dark:border-stone-800 dark:text-stone-300"
            }`}
          >
            <Bluetooth
              className={`h-4 w-4 ${
                printerStatus === "connected"
                  ? "text-emerald-600 dark:text-emerald-400 animate-pulse"
                  : "text-stone-400"
              }`}
            />
            <span>
              {printerStatus === "connected"
                ? deviceName || "BT Printer Paired"
                : printerStatus === "connecting"
                ? "Pairing BLE..."
                : "Bluetooth KOT"}
            </span>

            {printerStatus === "connected" ? (
              <button
                type="button"
                onClick={disconnectPrinter}
                className="ml-1 text-[11px] underline text-stone-500 hover:text-stone-700"
                title="Disconnect printer"
              >
                Disconnect
              </button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={connectPrinter}
                className="h-6 px-2 text-[11px] font-bold rounded-lg border-amber-600/40 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-stone-800 dark:text-stone-200"
              >
                Pair
              </Button>
            )}
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={testPrint}
            className="h-9 px-3 rounded-2xl border-[#EDE4D8] dark:border-stone-800 bg-white dark:bg-stone-900 text-xs font-bold gap-1.5 shadow-2xs"
            title="Preview ESC/POS printer slip"
          >
            <Printer className="h-3.5 w-3.5 text-stone-500" />
            <span className="hidden sm:inline">Print Slip</span>
          </Button>
        </div>
      </div>

      {/* Filter Tabs & Quick Stat Pills */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 bg-[#FAF7F2] dark:bg-[#1A1816] p-1.5 rounded-2xl border border-[#EDE4D8] dark:border-stone-800">
          <button
            type="button"
            onClick={() => setActiveFilter("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              activeFilter === "all"
                ? "bg-[#3D2314] text-white shadow-2xs"
                : "text-[#776B62] dark:text-stone-400 hover:text-[#241B16]"
            }`}
          >
            All Tables ({stats.total})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("attention_needed")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
              activeFilter === "attention_needed"
                ? "bg-red-600 text-white shadow-2xs"
                : "text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            Action Needed ({stats.attention})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("dining")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              activeFilter === "dining"
                ? "bg-sky-600 text-white shadow-2xs"
                : "text-sky-800 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/40"
            }`}
          >
            Dining ({stats.dining})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("browsing")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              activeFilter === "browsing"
                ? "bg-amber-600 text-white shadow-2xs"
                : "text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40"
            }`}
          >
            Browsing ({stats.browsing})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("needs_cleaning")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              activeFilter === "needs_cleaning"
                ? "bg-stone-700 text-white shadow-2xs"
                : "text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
            }`}
          >
            Needs Cleaning ({stats.cleaning})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("empty")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              activeFilter === "empty"
                ? "bg-stone-400 text-stone-900 shadow-2xs"
                : "text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
            }`}
          >
            Available ({stats.empty})
          </button>
        </div>

        {/* Legend Quick Reference */}
        <div className="hidden lg:flex items-center gap-3 text-xs text-[#776B62] dark:text-stone-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
            Ping
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
            Dining
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            Ordering
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
            Vacant
          </span>
        </div>
      </div>

      {/* Responsive Floorplan Grid (3 to 4 columns on tablets and mobile screens) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredTables.map((table) => {
          const isAttention = table.status === "attention_needed";
          const isDining = table.status === "dining";
          const isBrowsing = table.status === "browsing";
          const isCleaning = table.status === "needs_cleaning";
          const isEmpty = table.status === "empty";

          const diningMins = getElapsedMinutes(table.seatedAt);
          const pingMins = getElapsedMinutes(table.lastPing?.timestamp);

          // Visual Styling Rules
          let cardStyle = "bg-stone-50 border-stone-200 text-stone-600";
          if (isAttention) {
            cardStyle =
              "bg-red-50 border-red-500 text-red-950 animate-pulse ring-2 ring-red-400/50 shadow-lg shadow-red-500/10";
          } else if (isDining) {
            cardStyle =
              "bg-sky-50 border-sky-300 text-sky-900 shadow-sm hover:border-sky-400 hover:shadow-md";
          } else if (isBrowsing) {
            cardStyle =
              "bg-amber-50 border-amber-300 text-amber-900 shadow-sm hover:border-amber-400 hover:shadow-md";
          } else if (isCleaning) {
            cardStyle =
              "bg-stone-200 border-stone-400 text-stone-700 shadow-xs hover:border-stone-500";
          } else if (isEmpty) {
            cardStyle =
              "bg-stone-50 border-stone-200 text-stone-600 shadow-2xs hover:border-stone-300 hover:bg-stone-100/60";
          }

          return (
            <div
              key={table.tableNumber}
              onClick={() => {
                setSelectedTable(table);
                setIsDrawerOpen(true);
              }}
              className={`rounded-3xl border-2 p-5 transition-all cursor-pointer select-none flex flex-col justify-between relative min-h-[180px] ${cardStyle}`}
              id={`table-card-${table.tableNumber}`}
            >
              {/* Header: Table Number & Status Pill */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-serif text-2xl font-black">
                      Table <span className="font-sans tabular-nums tracking-tight">{table.tableNumber}</span>
                    </span>
                    {table.guestCount && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold opacity-75">
                        <Users className="h-3 w-3" />
                        <span className="tabular-nums">{table.guestCount}</span>
                      </span>
                    )}
                  </div>

                  {/* Subtitle strictly following visual rules */}
                  <div className="mt-1">
                    {isEmpty && (
                      <span className="text-xs font-semibold text-stone-500">Available</span>
                    )}
                    {isBrowsing && (
                      <span className="text-xs font-bold text-amber-800">
                        Viewing Menu / Ordering
                        {table.guestName ? ` • ${table.guestName}` : ""}
                      </span>
                    )}
                    {isDining && (
                      <span className="text-xs font-bold text-sky-800 flex items-center gap-1">
                        <span>Food Served</span>
                        {table.guestName ? ` • ${table.guestName}` : ""}
                        <span className="tabular-nums font-mono text-[11px] ml-1">
                          ({diningMins}m)
                        </span>
                      </span>
                    )}
                    {isAttention && (
                      <span className="text-xs font-black uppercase text-red-900 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 fill-red-500 text-white" />
                        <span>
                          {table.lastPing?.type || "Service"} Needed ({pingMins}m ago)
                        </span>
                      </span>
                    )}
                    {isCleaning && (
                      <span className="text-xs font-bold text-stone-700">Table Vacated</span>
                    )}
                  </div>
                </div>

                {/* Badge Indicator */}
                {isAttention && (
                  <span className="px-2 py-0.5 rounded-full bg-red-600 text-white font-black text-[10px] uppercase tracking-wider animate-bounce">
                    {table.lastPing?.type || "Ping"}
                  </span>
                )}
                {isDining && (
                  <span className="px-2 py-0.5 rounded-full bg-sky-200 text-sky-900 font-bold text-[10px] uppercase tracking-wider">
                    Dining
                  </span>
                )}
                {isBrowsing && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-bold text-[10px] uppercase tracking-wider">
                    Ordering
                  </span>
                )}
                {isCleaning && (
                  <span className="px-2 py-0.5 rounded-full bg-stone-300 text-stone-800 font-bold text-[10px] uppercase tracking-wider">
                    Vacated
                  </span>
                )}
              </div>

              {/* Middle Section: Active Order / Bill snapshot */}
              <div className="my-3 py-2 border-t border-b border-black/5 dark:border-white/10">
                {table.orderTotal && table.orderTotal > 0 ? (
                  <div className="flex items-center justify-between text-xs">
                    <span className="opacity-80">Bill Total:</span>
                    <span className="font-sans tabular-nums font-bold text-sm tracking-tight">
                      {currency}{table.orderTotal}
                    </span>
                  </div>
                ) : isEmpty ? (
                  <div className="text-[11px] text-stone-400 italic">No diners currently seated</div>
                ) : isCleaning ? (
                  <div className="text-[11px] text-stone-500">Awaiting busser &amp; sanitizer wipe</div>
                ) : (
                  <div className="text-[11px] opacity-75">QR scanned • browsing drinks</div>
                )}

                {/* Specific Ping Note */}
                {isAttention && table.lastPing?.note && (
                  <div className="mt-1 text-[11px] font-semibold text-red-900 bg-red-100/80 px-2 py-0.5 rounded-md">
                    "{table.lastPing.note}"
                  </div>
                )}
              </div>

              {/* Bottom Quick Action buttons on card */}
              <div className="flex items-center justify-between gap-2 pt-1">
                {isAttention ? (
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAcknowledgePing(table);
                    }}
                    className="w-full h-8 rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold text-xs gap-1.5 shadow-sm"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Acknowledge</span>
                  </Button>
                ) : isCleaning ? (
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMarkCleaned(table.tableNumber);
                    }}
                    className="w-full h-8 rounded-xl bg-stone-800 hover:bg-stone-900 text-white font-bold text-xs gap-1.5 shadow-sm"
                  >
                    <Brush className="h-3.5 w-3.5" />
                    <span>Mark as Cleaned</span>
                  </Button>
                ) : isEmpty ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTableToSeat(table);
                      setIsSeatingModalOpen(true);
                    }}
                    className="w-full h-8 rounded-xl border-stone-300 hover:border-stone-400 bg-white font-bold text-xs gap-1 text-stone-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Seat Walk-in</span>
                  </Button>
                ) : (
                  <div className="w-full flex items-center justify-between text-[11px] font-bold opacity-80">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {diningMins > 0 ? `${diningMins}m` : "Just seated"}
                    </span>
                    <span className="flex items-center text-xs text-stone-700 dark:text-stone-300">
                      Manage <ChevronRight className="h-3 w-3 ml-0.5" />
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Table Detail & Interaction Drawer / Sheet */}
      <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <SheetContent className="sm:max-w-md bg-[#FAF7F2] dark:bg-[#1A1816] text-[#241B16] dark:text-[#F7F4F0] border-l border-[#EDE4D8] dark:border-stone-800 p-0 flex flex-col justify-between overflow-y-auto">
          {selectedTable && (
            <div className="flex-1 flex flex-col justify-between">
              <div>
                {/* Header */}
                <div className="p-6 border-b border-[#EDE4D8] dark:border-stone-800 bg-[#FAF7F2] dark:bg-[#141211]">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs uppercase tracking-wider font-bold text-[#8A7D73]">
                        Captain Table Control
                      </span>
                      <h2 className="font-serif text-3xl font-bold text-[#241B16] dark:text-[#F7F4F0] mt-0.5">
                        Table{" "}
                        <span className="font-sans tabular-nums tracking-tight">
                          {selectedTable.tableNumber}
                        </span>
                      </h2>
                    </div>

                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        selectedTable.status === "attention_needed"
                          ? "bg-red-600 text-white animate-pulse"
                          : selectedTable.status === "dining"
                          ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
                          : selectedTable.status === "browsing"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          : selectedTable.status === "needs_cleaning"
                          ? "bg-stone-300 text-stone-800"
                          : "bg-stone-200 text-stone-700"
                      }`}
                    >
                      {selectedTable.status.replace("_", " ")}
                    </span>
                  </div>

                  {/* Diner & Seated Info */}
                  <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-[#EDE4D8] dark:border-stone-800 text-xs">
                    <div>
                      <span className="text-[#8A7D73] block">Host / Diner:</span>
                      <span className="font-bold text-sm">
                        {selectedTable.guestName || "Walk-in Guest"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#8A7D73] block">Party Size:</span>
                      <span className="font-bold text-sm tabular-nums">
                        {selectedTable.guestCount || 2} Pax
                      </span>
                    </div>
                  </div>
                </div>

                {/* Attention Alert Banner if Pinged */}
                {selectedTable.lastPing && (
                  <div className="m-4 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-red-900 dark:text-red-200 uppercase">
                        Service Call: {selectedTable.lastPing.type}
                      </p>
                      {selectedTable.lastPing.note && (
                        <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">
                          "{selectedTable.lastPing.note}"
                        </p>
                      )}
                      <p className="text-[11px] text-red-500 mt-1">
                        Requested {getElapsedMinutes(selectedTable.lastPing.timestamp)}m ago
                      </p>
                      <Button
                        size="sm"
                        onClick={() => handleAcknowledgePing(selectedTable)}
                        className="mt-3 h-8 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        Acknowledge &amp; Clear Call
                      </Button>
                    </div>
                  </div>
                )}

                {/* Active Order Items with Tabular Figures */}
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-serif text-base font-bold text-[#241B16] dark:text-[#F7F4F0] flex items-center gap-2">
                      <Utensils className="h-4 w-4 text-[#8A7D73]" />
                      Active Order Items
                    </h3>
                    {selectedTable.activeOrderId && (
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-stone-200 dark:bg-stone-800">
                        #{selectedTable.activeOrderId.replace(/^ord_/, "").slice(-4)}
                      </span>
                    )}
                  </div>

                  {selectedTable.orderItems && selectedTable.orderItems.length > 0 ? (
                    <div className="space-y-2 border rounded-2xl p-3 bg-white dark:bg-stone-900 border-[#EDE4D8] dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800">
                      {selectedTable.orderItems.map((item, idx) => (
                        <div key={idx} className="pt-2 first:pt-0 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 tabular-nums">
                              {item.quantity}x
                            </span>
                            <span className="font-semibold">{item.name}</span>
                          </div>
                          <span className="font-sans tabular-nums font-bold text-[#241B16] dark:text-[#F7F4F0]">
                            {currency}{item.price * item.quantity}
                          </span>
                        </div>
                      ))}

                      {/* Totals */}
                      <div className="pt-3 flex items-center justify-between font-bold text-sm">
                        <span>Total Due</span>
                        <span className="font-sans tabular-nums text-base text-[#3D2314] dark:text-amber-400">
                          {currency}{selectedTable.orderTotal || 0}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[#EDE4D8] dark:border-stone-800 p-6 text-center text-xs text-[#8A7D73]">
                      No items placed yet. Diners are browsing the digital menu.
                    </div>
                  )}

                  {/* Manual Status Override */}
                  <div className="pt-2">
                    <span className="text-xs font-bold text-[#8A7D73] block mb-2">
                      Change Table Lifecycle State:
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant={selectedTable.status === "dining" ? "default" : "outline"}
                        onClick={() =>
                          updateTableState(selectedTable.tableNumber, { status: "dining" })
                        }
                        className="h-8 text-xs font-bold rounded-xl"
                      >
                        Set Dining
                      </Button>
                      <Button
                        size="sm"
                        variant={selectedTable.status === "browsing" ? "default" : "outline"}
                        onClick={() =>
                          updateTableState(selectedTable.tableNumber, { status: "browsing" })
                        }
                        className="h-8 text-xs font-bold rounded-xl"
                      >
                        Set Browsing
                      </Button>
                      <Button
                        size="sm"
                        variant={selectedTable.status === "needs_cleaning" ? "default" : "outline"}
                        onClick={() =>
                          updateTableState(selectedTable.tableNumber, {
                            status: "needs_cleaning",
                          })
                        }
                        className="h-8 text-xs font-bold rounded-xl"
                      >
                        Vacate (Needs Clean)
                      </Button>
                      <Button
                        size="sm"
                        variant={selectedTable.status === "empty" ? "default" : "outline"}
                        onClick={() => handleMarkCleaned(selectedTable.tableNumber)}
                        className="h-8 text-xs font-bold rounded-xl text-emerald-700 dark:text-emerald-300"
                      >
                        Reset to Empty
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Actions Bar in Drawer: Print KOT, Print Bill, Mark Clean */}
              <div className="p-4 border-t border-[#EDE4D8] dark:border-stone-800 bg-[#FAF7F2] dark:bg-[#141211] space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => handlePrintTableKOT(selectedTable)}
                    className="h-10 rounded-2xl bg-[#3D2314] hover:bg-[#2A180E] text-white font-bold text-xs gap-1.5 shadow-sm"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>Print KOT Slip</span>
                  </Button>
                  <Button
                    onClick={() => handlePrintTableBill(selectedTable)}
                    className="h-10 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs gap-1.5 shadow-sm"
                  >
                    <Receipt className="h-3.5 w-3.5" />
                    <span>Print Bill</span>
                  </Button>
                </div>

                {selectedTable.status === "needs_cleaning" && (
                  <Button
                    onClick={() => {
                      handleMarkCleaned(selectedTable.tableNumber);
                      setIsDrawerOpen(false);
                    }}
                    className="w-full h-10 rounded-2xl bg-stone-800 hover:bg-stone-900 text-white font-bold text-xs gap-2"
                  >
                    <Brush className="h-4 w-4" />
                    <span>Table Sanitized &amp; Ready for Guests</span>
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Seat Walk-in Dialog */}
      <Dialog open={isSeatingModalOpen} onOpenChange={setIsSeatingModalOpen}>
        <DialogContent className="sm:max-w-md bg-[#FAF7F2] dark:bg-[#1A1816] text-[#241B16] dark:text-[#F7F4F0] border-[#EDE4D8] dark:border-stone-800">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl font-bold">
              Seat Walk-in Party at Table {tableToSeat?.tableNumber}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#776B62] dark:text-stone-400">
              Assign the table to a walk-in guest. They can immediately scan the QR code to order.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-bold text-[#8A7D73] block mb-1">
                Guest First Name:
              </label>
              <Input
                placeholder="e.g. Rahul, Sneha, Amit"
                value={walkInName}
                onChange={(e) => setWalkInName(e.target.value)}
                className="h-10 rounded-xl bg-white dark:bg-stone-900 border-[#EDE4D8] dark:border-stone-800"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#8A7D73] block mb-1">Number of Pax:</label>
              <Input
                type="number"
                min="1"
                max="20"
                value={walkInGuests}
                onChange={(e) => setWalkInGuests(e.target.value)}
                className="h-10 rounded-xl bg-white dark:bg-stone-900 border-[#EDE4D8] dark:border-stone-800 tabular-nums"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setIsSeatingModalOpen(false)}
              className="rounded-xl text-xs h-9"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSeatWalkIn}
              className="rounded-xl text-xs h-9 bg-[#3D2314] hover:bg-[#2A180E] text-white font-bold"
            >
              Confirm Seating
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Visual Thermal Slip Simulator Modal */}
      <ThermalSlipSimulatorModal
        isOpen={isSimulatorOpen}
        onClose={closeSimulator}
        slipText={simulatorSlip}
        printerStatus={printerStatus}
        deviceName={deviceName}
        onConnectPrinter={connectPrinter}
      />
    </div>
  );
}

export default CaptainDashboard;
