import React from "react";
import { Utensils, ClipboardList, Receipt } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

export type GuestTabKey = "menu" | "orders" | "bill";

interface BottomNavProps {
  activeTab: GuestTabKey;
  onSelectTab: (tab: GuestTabKey) => void;
  onTriggerJumpMenu?: () => void;
  ordersBadgeCount?: number;
  billTotal?: number;
  currency?: string;
  hasActiveOrders?: boolean;
}

export function BottomNav({
  activeTab,
  onSelectTab,
  onTriggerJumpMenu,
  ordersBadgeCount = 0,
  billTotal,
  currency = "₹",
  hasActiveOrders = false,
}: BottomNavProps) {
  const handleTabClick = (tab: GuestTabKey) => {
    triggerHaptic("selection");
    if (tab === "menu" && activeTab === "menu" && onTriggerJumpMenu) {
      onTriggerJumpMenu();
      return;
    }
    onSelectTab(tab);
  };

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-[#fafaf9] dark:bg-[#1c1917] border-t border-[#ede4d8] dark:border-stone-800 shadow-[0_-4px_20px_rgba(0,0,0,0.04)] pb-safe select-none"
      id="guest-bottom-navigation"
      aria-label="Guest Menu Navigation"
    >
      <div className="max-w-md mx-auto grid grid-cols-3 h-16 px-4 items-center">
        {/* 1. Menu Tab */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => handleTabClick("menu")}
            className={`flex flex-col items-center justify-center transition-all ${
              activeTab === "menu"
                ? "bg-[#F5EDE4] dark:bg-stone-800 text-[#1c1917] dark:text-[#fafaf9] px-5 py-1.5 rounded-2xl font-bold"
                : "text-[#8a7d73] dark:text-stone-400 hover:text-[#1c1917] dark:hover:text-stone-200 py-1.5"
            }`}
            id="tab-btn-menu"
          >
            <Utensils
              className={`h-4.5 w-4.5 transition-transform duration-200 ${
                activeTab === "menu" ? "scale-105 stroke-[2.4]" : "stroke-[1.8]"
              }`}
            />
            <span className="text-[11px] font-sans font-semibold tracking-tight mt-0.5">
              Menu
            </span>
          </button>
        </div>

        {/* 2. Kitchen Orders Tracker Tab */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => handleTabClick("orders")}
            className={`flex flex-col items-center justify-center transition-all ${
              activeTab === "orders"
                ? "bg-[#F5EDE4] dark:bg-stone-800 text-[#1c1917] dark:text-[#fafaf9] px-5 py-1.5 rounded-2xl font-bold"
                : "text-[#8a7d73] dark:text-stone-400 hover:text-[#1c1917] dark:hover:text-stone-200 py-1.5"
            }`}
            id="tab-btn-orders"
          >
            <div className="relative">
              <ClipboardList
                className={`h-4.5 w-4.5 transition-transform duration-200 ${
                  activeTab === "orders" ? "scale-105 stroke-[2.4]" : "stroke-[1.8]"
                }`}
              />
              {ordersBadgeCount > 0 ? (
                <span className="absolute -top-1 -right-2.5 h-3.5 min-w-[14px] px-1 rounded-full bg-[#1c1917] text-white font-sans tabular-nums text-[9px] font-bold flex items-center justify-center shadow-xs">
                  {ordersBadgeCount}
                </span>
              ) : hasActiveOrders ? (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              ) : null}
            </div>
            <span className="text-[11px] font-sans font-semibold tracking-tight mt-0.5">
              Orders
            </span>
          </button>
        </div>

        {/* 3. Running Bill Tab */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => handleTabClick("bill")}
            className={`flex flex-col items-center justify-center transition-all ${
              activeTab === "bill"
                ? "bg-[#F5EDE4] dark:bg-stone-800 text-[#1c1917] dark:text-[#fafaf9] px-5 py-1.5 rounded-2xl font-bold"
                : "text-[#8a7d73] dark:text-stone-400 hover:text-[#1c1917] dark:hover:text-stone-200 py-1.5"
            }`}
            id="tab-btn-bill"
          >
            <div className="relative">
              <Receipt
                className={`h-4.5 w-4.5 transition-transform duration-200 ${
                  activeTab === "bill" ? "scale-105 stroke-[2.4]" : "stroke-[1.8]"
                }`}
              />
              {billTotal !== undefined && billTotal > 0 && (
                <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
              )}
            </div>
            <span className="text-[11px] font-sans font-semibold tracking-tight mt-0.5">
              {billTotal !== undefined && billTotal > 0 ? `${currency}${Math.round(billTotal)}` : "Bill"}
            </span>
          </button>
        </div>
      </div>
    </nav>
  );
}

export default BottomNav;
