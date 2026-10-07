import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { Clock, Flame, Sparkles, AlertCircle, ChefHat } from "lucide-react";
import { getFirestoreDb } from "@/lib/firebase";

interface WaitTimeBannerProps {
  restaurantSlug: string;
  isDark?: boolean;
  activeTicketsCountOverride?: number;
}

export function WaitTimeBanner({
  restaurantSlug,
  isDark = false,
  activeTicketsCountOverride,
}: WaitTimeBannerProps) {
  const [activeOrdersCount, setActiveOrdersCount] = useState<number>(() => {
    return activeTicketsCountOverride !== undefined ? activeTicketsCountOverride : 0;
  });

  // Real-time Firestore listener for active_tickets
  useEffect(() => {
    if (activeTicketsCountOverride !== undefined) {
      setActiveOrdersCount(activeTicketsCountOverride);
      return;
    }

    let isSubscribed = true;
    let firestoreUnsub: Unsubscribe | null = null;

    const db = getFirestoreDb();
    if (db && restaurantSlug) {
      try {
        // Query active_tickets collection or orders where status is in kitchen queue
        const ordersColl = collection(db, "restaurants", restaurantSlug, "orders");
        const q = query(ordersColl, where("status", "in", ["NEW", "APPROVED", "ACCEPTED", "PREPARING"]));

        firestoreUnsub = onSnapshot(
          q,
          (snapshot) => {
            if (!isSubscribed) return;
            setActiveOrdersCount(snapshot.size);
          },
          (err) => {
            console.warn("[WaitTimeBanner] Firestore listener notice:", err);
          }
        );
      } catch (err) {
        console.warn("[WaitTimeBanner] Setup notice:", err);
      }
    }

    // Polling fallback to API server for resilience
    const pollInterval = setInterval(async () => {
      if (!isSubscribed) return;
      try {
        const res = await fetch(`/api/public/menu/${restaurantSlug}/active-queue-count`);
        if (res.ok) {
          const data = await res.json();
          if (typeof data.activeCount === "number") {
            setActiveOrdersCount(data.activeCount);
          }
        }
      } catch {
        // Ignore fallback polling errors
      }
    }, 5000);

    return () => {
      isSubscribed = false;
      clearInterval(pollInterval);
      if (firestoreUnsub) firestoreUnsub();
    };
  }, [restaurantSlug, activeTicketsCountOverride]);

  // Logic: If pending_orders > 8, dynamically render busy rush banner (~30 mins)
  const isBusy = activeOrdersCount > 8;

  if (isBusy) {
    return (
      <div
        className="w-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-white px-4 py-2.5 shadow-md flex items-center justify-between text-xs animate-in slide-in-from-top duration-300"
        id="wait-time-banner-rush"
      >
        <div className="flex items-center gap-2 max-w-[85%]">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/20 text-white">
            <Flame className="h-3.5 w-3.5 animate-pulse" />
          </span>
          <p className="font-semibold leading-tight">
            <span className="font-bold">Kitchen is busy!</span> Current prep time:{" "}
            <span className="font-sans tabular-nums tracking-tight font-extrabold underline decoration-white/60">
              ~30 mins
            </span>
            . <span className="opacity-90 hidden sm:inline">Fresh pours &amp; plates made with artisanal care.</span>
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 pl-2">
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-black/20 font-mono font-sans tabular-nums tracking-tight">
            {activeOrdersCount} live tickets
          </span>
        </div>
      </div>
    );
  }

  // Standard Prep Time Banner (~12-15 mins)
  return (
    <div
      className={`w-full px-4 py-2 border-b flex items-center justify-between text-xs transition-colors ${
        isDark
          ? "border-stone-800 bg-[#1C1A18]/80 text-[#FBF8F2]"
          : "border-[#E8DDD0] bg-[#FAF6F0] text-[#241B16]"
      }`}
      id="wait-time-banner-standard"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5A351F]/10 text-[#5A351F] dark:bg-[#C99A55]/20 dark:text-[#C99A55]">
          <Clock className="h-3 w-3" />
        </span>
        <p className="text-[11.5px] font-medium text-[#776B62] dark:text-stone-300">
          Standard Kitchen Pace:{" "}
          <span className="font-sans tabular-nums tracking-tight font-bold text-[#241B16] dark:text-[#FBF8F2]">
            ~12–15 mins
          </span>{" "}
          prep time
        </p>
      </div>

      <div className="inline-flex items-center gap-1 text-[10.5px] font-medium text-emerald-700 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
        <span>Live Kitchen Flow</span>
      </div>
    </div>
  );
}

export default WaitTimeBanner;
