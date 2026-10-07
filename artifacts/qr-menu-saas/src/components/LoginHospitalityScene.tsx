import React from "react";
import { Receipt, Check, Printer } from "lucide-react";

interface LoginHospitalitySceneProps {
  className?: string;
}

/**
 * LoginHospitalityScene
 *
 * Floating KDS ticket UI with rich hospitality photography (artisan coffee cup with latte art),
 * live order status, and ESC/POS print indicators.
 */
export function LoginHospitalityScene({ className = "" }: LoginHospitalitySceneProps) {
  return (
    <div className={`relative w-full select-none ${className}`}>
      {/* Outer Floating KDS Stage Container */}
      <div className="relative mx-auto w-full max-w-[500px] rounded-2xl bg-stone-900/70 backdrop-blur-md border border-white/15 p-4 sm:p-5 shadow-2xl shadow-black/40">
        {/* Top Status Bar */}
        <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-white/10 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-stone-300 font-medium tracking-wider text-[11px]">
              FLOOR LINE ACTIVE • PASS 01
            </span>
          </div>
          <span className="text-stone-400 text-[11px]">Synced • 16 Tables</span>
        </div>

        {/* Interior Two-Column Display: Coffee Photo & Floating White KDS Ticket */}
        <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-4 items-center">
          {/* Artisan Coffee Cup Photography */}
          <div className="relative h-32 sm:h-36 w-full rounded-xl overflow-hidden border border-white/15 shadow-md">
            <img
              src="/latte_table.jpg"
              alt="Steaming artisan cappuccino with latte art on dark wood"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-stone-950/60 via-transparent to-transparent" />
            <div className="absolute bottom-2 left-2 text-[10px] font-mono text-stone-300 bg-stone-950/70 px-2 py-0.5 rounded backdrop-blur-xs">
              Barista Pass
            </div>
          </div>

          {/* Floating White KDS Ticket Card */}
          <div className="relative rounded-xl bg-white p-3.5 sm:p-4 text-stone-900 shadow-xl border border-stone-200">
            {/* Ticket Header */}
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-100 text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                  #K1042
                </span>
                <span className="text-stone-500 text-[11px]">12:44</span>
              </div>
              <span className="font-bold text-stone-800 text-[11px]">Table 04</span>
            </div>

            {/* Ticket Order Items */}
            <div className="space-y-2 text-xs font-sans">
              <div className="flex items-center justify-between">
                <span className="font-medium text-stone-800">1x Cascara Cold Brew</span>
                <span className="text-[10.5px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                  Fired
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-medium text-stone-800">1x Wild Truffle Tartine</span>
                <span className="text-[10.5px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                  Kitchen prep
                </span>
              </div>
            </div>

            {/* Dashed Tear-Off Divider */}
            <div className="my-2.5 border-t border-dashed border-stone-300" />

            {/* Ticket Footer (PIN & ESC/POS Status) */}
            <div className="flex items-center justify-between text-[10.5px] font-mono text-stone-600">
              <div>
                <span>PIN: </span>
                <span className="font-bold text-stone-900">4182</span>
                <span className="ml-1 text-stone-400">Dine-In</span>
              </div>

              <div className="flex items-center gap-1 text-emerald-700 font-semibold">
                <Printer className="w-3 h-3" />
                <span>ESC/POS Printed</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
