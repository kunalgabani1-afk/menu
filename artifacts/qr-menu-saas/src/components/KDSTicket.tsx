import React, { useState } from "react";
import {
  Coffee,
  Flame,
  Clock,
  CheckCircle2,
  AlertTriangle,
  PauseCircle,
  PlayCircle,
  ChefHat,
  Sparkles,
  Printer,
  Bluetooth,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdvancedOrderTicket, OrderItemCourse, CourseStatus } from "@/types/advancedPos";
import { useThermalPrinter, type PrinterStatus } from "@/hooks/useThermalPrinter";
import { ThermalSlipSimulatorModal } from "./ThermalSlipSimulatorModal";

interface KDSTicketProps {
  order: AdvancedOrderTicket;
  currency?: string;
  isDark?: boolean;
  onFirePlates: (orderId: string, itemIndexes?: number[]) => Promise<void>;
  onMarkItemReady: (orderId: string, itemIdx: number) => Promise<void>;
  onCompleteTicket: (orderId: string) => Promise<void>;
  onPrintKOT?: (order: AdvancedOrderTicket) => Promise<void>;
}

export function KDSTicket({
  order,
  currency = "₹",
  isDark = false,
  onFirePlates,
  onMarkItemReady,
  onCompleteTicket,
  onPrintKOT,
}: KDSTicketProps) {
  const [isFiring, setIsFiring] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  // Thermal printer hook
  const {
    printerStatus,
    deviceName,
    printKOT,
    connectPrinter,
    isSimulatorOpen,
    simulatorSlip,
    closeSimulator,
  } = useThermalPrinter();

  // Calculate elapsed time from creation
  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000)
  );

  const urgencyColor =
    elapsedMinutes >= 20
      ? "border-red-500 bg-red-500/5 ring-1 ring-red-500/30"
      : elapsedMinutes >= 12
      ? "border-amber-500 bg-amber-500/5 ring-1 ring-amber-500/30"
      : "border-[#E8DDD0] dark:border-stone-800 bg-white dark:bg-stone-900";

  // Group items into "Bakes & Espresso" vs "Plates/Mains"
  const isBakesOrEspresso = (item: OrderItemCourse) => {
    const cat = (item.category || item.categoryType || "").toLowerCase();
    const name = (item.name || "").toLowerCase();
    return (
      cat.includes("coffee") ||
      cat.includes("espresso") ||
      cat.includes("beverage") ||
      cat.includes("bake") ||
      cat.includes("pastry") ||
      cat.includes("croissant") ||
      cat.includes("tea") ||
      name.includes("coffee") ||
      name.includes("latte") ||
      name.includes("cappuccino") ||
      name.includes("croissant") ||
      name.includes("muffin")
    );
  };

  const bakesAndEspressoItems: Array<{ item: OrderItemCourse; originalIndex: number }> = [];
  const platesMainsItems: Array<{ item: OrderItemCourse; originalIndex: number }> = [];

  (order.items || []).forEach((item, idx) => {
    if (isBakesOrEspresso(item)) {
      bakesAndEspressoItems.push({ item, originalIndex: idx });
    } else {
      platesMainsItems.push({ item, originalIndex: idx });
    }
  });

  // Check if plates are currently held
  const hasPlatesOnHold = platesMainsItems.some(
    ({ item }) => item.courseStatus === "HOLD" || !item.courseStatus || item.courseStatus === "NORMAL"
  );
  const arePlatesFired =
    platesMainsItems.length > 0 &&
    platesMainsItems.every(({ item }) => item.courseStatus === "FIRED");

  const handleFirePlatesAction = async () => {
    setIsFiring(true);
    try {
      const plateIndexes = platesMainsItems.map((p) => p.originalIndex);
      await onFirePlates(order.order_id, plateIndexes);
    } finally {
      setIsFiring(false);
    }
  };

  const toggleCheck = (idx: number) => {
    setCheckedItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
    onMarkItemReady(order.order_id, idx).catch(() => {});
  };

  // Dispatch KOT to thermal printer
  const handlePrintKOTAction = async () => {
    setIsPrinting(true);
    try {
      if (onPrintKOT) {
        await onPrintKOT(order);
        return;
      }

      await printKOT({
        cafeName: "TABLELINE CAFE",
        tableNumber: order.tableNumber,
        dinerFirstName: order.dinerFirstName,
        orderNumber: order.order_id,
        timestamp: order.createdAt,
        items: (order.items || []).map((it) => ({
          name: it.name,
          quantity: it.quantity,
          isVeg: (it as any).isVeg,
          dietary: (it as any).dietary,
          specialInstructions: it.specialInstructions,
          selectedModifiers: it.selectedModifiers?.map((m) => ({
            name: m.optionName,
          })),
        })),
        note: order.customerNote || undefined,
        ticketType: "KOT",
      });
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div
      className={`rounded-3xl border shadow-md overflow-hidden transition-all flex flex-col justify-between ${urgencyColor}`}
      id={`kds-ticket-${order.order_id}`}
    >
      {/* Top Header: Table & Diner Anchor (Serif + Tabular Numbers) */}
      <div className="border-b border-border/70 p-4 bg-[#FAF6F0] dark:bg-[#1A1816] flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-serif text-lg sm:text-xl font-bold text-[#241B16] dark:text-[#FBF8F2]">
              Table <span className="font-sans tabular-nums tracking-tight">{order.tableNumber}</span>
              {order.dinerFirstName ? ` (${order.dinerFirstName})` : ""}
            </span>
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-[#5A351F] text-white">
              #{order.order_id.replace(/^ord_/, "").slice(-4).toUpperCase()}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1 text-xs text-[#776B62] dark:text-stone-400">
            <span className="flex items-center gap-1 font-mono font-semibold">
              <Clock className="h-3 w-3" />
              <span className="font-sans tabular-nums">{elapsedMinutes}</span>m elapsed
            </span>
            <span>•</span>
            <span className="capitalize">{order.status.toLowerCase()}</span>
          </div>
        </div>

        {/* Printer Status Pill */}
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              printerStatus === "connected"
                ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                : "bg-stone-100 text-stone-600 border-stone-300 dark:bg-stone-800 dark:text-stone-400 dark:border-stone-700"
            }`}
            title={printerStatus === "connected" ? `Paired with ${deviceName}` : "Thermal slip preview mode"}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                printerStatus === "connected" ? "bg-emerald-500 animate-pulse" : "bg-stone-400"
              }`}
            />
            <span className="hidden sm:inline">
              {printerStatus === "connected" ? "BT Online" : "Slip Ready"}
            </span>
          </span>
        </div>
      </div>

      {/* Course Group 1: Bakes & Espresso (Renders Normally) */}
      <div className="p-4 space-y-4 flex-1">
        {bakesAndEspressoItems.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400 border-b border-amber-200 dark:border-amber-900/50 pb-1">
              <Coffee className="h-3.5 w-3.5" />
              <span>Bakes &amp; Espresso (Immediate Prep)</span>
            </div>

            <div className="space-y-2">
              {bakesAndEspressoItems.map(({ item, originalIndex }) => {
                const isChecked = Boolean(checkedItems[originalIndex]);
                return (
                  <div
                    key={originalIndex}
                    onClick={() => toggleCheck(originalIndex)}
                    className={`flex items-start justify-between p-2.5 rounded-2xl cursor-pointer transition-all border ${
                      isChecked
                        ? "bg-stone-100/80 dark:bg-stone-800/40 line-through opacity-50 border-transparent"
                        : "bg-[#FAF7F2] dark:bg-stone-900 border-[#EDE4D8] dark:border-stone-800 hover:border-amber-300"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="font-sans tabular-nums tracking-tight font-black text-sm bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 px-1.5 py-0.5 rounded">
                        {item.quantity}×
                      </span>
                      <div>
                        <p className="text-xs font-bold text-[#241B16] dark:text-[#FBF8F2]">
                          {item.name}
                        </p>
                        {item.specialInstructions && (
                          <p className="text-[11px] text-muted-foreground italic">
                            "{item.specialInstructions}"
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Course Group 2: Plates/Mains (Renders with [HOLD] status until Fired) */}
        {platesMainsItems.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#5A351F] dark:text-stone-300 border-b border-border/70 pb-1">
              <div className="flex items-center gap-1.5">
                <ChefHat className="h-3.5 w-3.5" />
                <span>Plates / Mains</span>
              </div>
              {arePlatesFired ? (
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500 text-white animate-pulse">
                  COOKING (FIRED)
                </span>
              ) : (
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                  ON HOLD
                </span>
              )}
            </div>

            <div className="space-y-2">
              {platesMainsItems.map(({ item, originalIndex }) => {
                const isHeld =
                  !arePlatesFired &&
                  (item.courseStatus === "HOLD" ||
                    !item.courseStatus ||
                    item.courseStatus === "NORMAL");
                const isChecked = Boolean(checkedItems[originalIndex]);

                return (
                  <div
                    key={originalIndex}
                    onClick={() => toggleCheck(originalIndex)}
                    className={`flex items-start justify-between p-2.5 rounded-2xl cursor-pointer transition-all border ${
                      isChecked
                        ? "bg-stone-100/80 dark:bg-stone-800/40 line-through opacity-50 border-transparent"
                        : isHeld
                        ? "bg-stone-100 dark:bg-stone-900/60 border-dashed border-stone-300 dark:border-stone-800 opacity-75"
                        : "bg-amber-500/10 border-amber-500/40 shadow-xs"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className={`font-sans tabular-nums tracking-tight font-black text-sm px-1.5 py-0.5 rounded ${
                          isHeld
                            ? "bg-stone-300 text-stone-700 dark:bg-stone-800 dark:text-stone-400"
                            : "bg-amber-500 text-stone-950"
                        }`}
                      >
                        {item.quantity}×
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold">{item.name}</p>
                          {isHeld && (
                            <span className="text-[9.5px] font-black uppercase px-1.5 py-0.2 rounded bg-stone-300/80 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                              [HOLD]
                            </span>
                          )}
                        </div>
                        {item.specialInstructions && (
                          <p className="text-[11px] text-muted-foreground italic">
                            "{item.specialInstructions}"
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Action Button: [FIRE PLATES] */}
            {hasPlatesOnHold && !arePlatesFired && (
              <div className="pt-2">
                <Button
                  type="button"
                  disabled={isFiring}
                  onClick={handleFirePlatesAction}
                  className="w-full h-11 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-amber-600/20 active:scale-98 transition-all"
                  id={`btn-fire-plates-${order.order_id}`}
                >
                  <Flame className="h-4 w-4 fill-current animate-bounce" />
                  <span>{isFiring ? "Firing Plates…" : "🔥 FIRE PLATES (Start Cook)"}</span>
                </Button>
                <p className="text-[10px] text-center text-[#776B62] mt-1">
                  Alerts hot line chef to drop hot food so espresso arrives first
                </p>
              </div>
            )}
          </div>
        )}

        {/* Customer Note */}
        {order.customerNote && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300 italic">
            Note: "{order.customerNote}"
          </div>
        )}
      </div>

      {/* Ticket Footer Action Bar: [Print KOT] & [Mark Served] */}
      <div className="p-3 border-t border-border/70 bg-[#FAF6F0]/80 dark:bg-stone-900/80 flex items-center justify-between gap-2">
        {/* Dedicated Print KOT button wired into action bar */}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPrinting}
          onClick={handlePrintKOTAction}
          className="h-8 rounded-xl border-[#EDE4D8] dark:border-stone-800 bg-white dark:bg-stone-900 font-bold text-xs gap-1.5 hover:bg-amber-50 hover:text-amber-900 dark:hover:bg-stone-800 text-[#5A351F] dark:text-stone-300"
          id={`btn-print-kot-${order.order_id}`}
          title="Print wireless ESC/POS KOT ticket for the line cook rail"
        >
          <Printer className="h-3.5 w-3.5 text-amber-600" />
          <span>{isPrinting ? "Printing…" : "Print KOT"}</span>
        </Button>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => onCompleteTicket(order.order_id)}
            className="h-8 rounded-xl bg-[#241B16] dark:bg-stone-100 text-white dark:text-stone-900 font-bold text-xs gap-1.5 hover:bg-[#3D261C]"
            id={`btn-complete-ticket-${order.order_id}`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Mark Served</span>
          </Button>
        </div>
      </div>

      {/* Thermal Slip Simulator Modal for this ticket */}
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

export default KDSTicket;
