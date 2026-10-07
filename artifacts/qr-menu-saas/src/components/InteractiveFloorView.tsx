import React, { useState } from "react";
import { Check, Smartphone, Tablet, Laptop, Clock, TrendingUp, Sparkles, ChefHat } from "lucide-react";

/**
 * InteractiveFloorView
 * Exact 1:1 recreation of Image 1 "Interactive Floor View":
 * - Eyebrow: "INTERACTIVE FLOOR VIEW"
 * - Heading: "One system. Three synchronized perspectives."
 * - Subtitle: "See how the same order looks to the guest, the kitchen staff, and the manager in real-time."
 * - 3 Switcher Pills: "1 Guest Menu", "2 Kitchen Pass (KDS)", "3 Admin Dashboard"
 * - Left column: Content with 4 checkmarks
 * - Right column: Asymmetric composition with 3 synchronized devices (Phone, Tablet, Laptop) on warm hospitality wood surface with handwritten script labels ("Guest View ~", "Kitchen View ~", "Owner View ~")
 */
export function InteractiveFloorView() {
  const [activeTab, setActiveTab] = useState<"guest" | "kitchen" | "owner">("guest");

  const tabDetails = {
    guest: {
      title: "A Seamless Dining Experience",
      desc: "Guests can browse your menu, customise their items, and send orders to the kitchen — all from their phone.",
      bullets: [
        "No app required",
        "Fast and intuitive",
        "Beautiful food photos",
        "Works on any device",
      ],
    },
    kitchen: {
      title: "Clarity on the Cook Line",
      desc: "Instant acoustic chimes and visual color badges eliminate lost paper tickets and accelerate kitchen preparation.",
      bullets: [
        "Acoustic cook chime on arrival",
        "Live prep duration counters",
        "Direct pass firing controls",
        "Auto thermal printer integration",
      ],
    },
    owner: {
      title: "Total Floor Visibility",
      desc: "Monitor revenue in real time, adjust item availability instantly, and understand your peak hourly traffic patterns.",
      bullets: [
        "Live gross sales and ticket averages",
        "Table occupancy status overview",
        "One-click 86 item toggles",
        "Daily shift closeout reports",
      ],
    },
  };

  const current = tabDetails[activeTab];

  return (
    <section className="py-16 sm:py-24 border-b border-[#EAE2D7] bg-[#FAF7F2]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-[#9E4A28] font-bold">
            INTERACTIVE FLOOR VIEW
          </p>
          <h2 className="mt-2.5 font-display text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-[#1F1915] leading-tight">
            One system. Three synchronized perspectives.
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#6E6155] leading-relaxed">
            See how the same order looks to the guest, the kitchen staff, and the manager in real-time.
          </p>

          {/* Perspective Switcher Pills */}
          <div className="mt-7 inline-flex items-center gap-1.5 rounded-full border border-[#DDD3C2] bg-white p-1 shadow-xs">
            <button
              onClick={() => setActiveTab("guest")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                activeTab === "guest"
                  ? "bg-[#1F1915] text-white shadow-xs"
                  : "text-[#7A6E63] hover:text-[#1F1915]"
              }`}
            >
              1 Guest Menu
            </button>
            <button
              onClick={() => setActiveTab("kitchen")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                activeTab === "kitchen"
                  ? "bg-[#1F1915] text-white shadow-xs"
                  : "text-[#7A6E63] hover:text-[#1F1915]"
              }`}
            >
              2 Kitchen Pass (KDS)
            </button>
            <button
              onClick={() => setActiveTab("owner")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                activeTab === "owner"
                  ? "bg-[#1F1915] text-white shadow-xs"
                  : "text-[#7A6E63] hover:text-[#1F1915]"
              }`}
            >
              3 Admin Dashboard
            </button>
          </div>
        </div>

        {/* Two-Column Stage */}
        <div className="mt-12 lg:mt-16 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Context & Bullet Points */}
          <div className="lg:col-span-4 space-y-6">
            <div className="space-y-3">
              <h3 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#1F1915]">
                {current.title}
              </h3>
              <p className="text-sm sm:text-[15px] leading-relaxed text-[#6E6155]">
                {current.desc}
              </p>
            </div>

            {/* 4 Checkmark Bullets */}
            <div className="space-y-3 pt-2">
              {current.bullets.map((bullet, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2D5E46] text-white">
                    <Check className="h-3 w-3 stroke-[2.5]" />
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-[#241C17]">
                    {bullet}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: 3 Synchronized Devices Composition (Exact Image 1 layout) */}
          <div className="lg:col-span-8 relative">
            {/* Wooden Surface Board Background with Photographic Grain */}
            <div
              className="relative rounded-3xl p-5 sm:p-8 shadow-[0_24px_50px_-12px_rgba(20,12,6,0.5)] overflow-hidden border border-white/10 min-h-[440px] flex items-center justify-center"
              style={{
                background: "linear-gradient(rgba(26, 18, 13, 0.86), rgba(18, 12, 8, 0.93)), url('/table_scene_full.jpg') center/cover no-repeat",
              }}
            >
              {/* Table ambient lighting */}
              <div
                className="absolute -top-16 -left-16 h-80 w-80 rounded-full opacity-35 pointer-events-none blur-3xl"
                style={{
                  background: "radial-gradient(circle, rgba(232, 205, 150, 0.6) 0%, transparent 70%)",
                }}
              />

              {/* Decorative Fresh Leaf Sprig on top right matching reference */}
              <div className="absolute top-2 right-2 sm:right-6 pointer-events-none opacity-80 z-20">
                <svg viewBox="0 0 80 80" className="w-16 h-16 sm:w-20 sm:h-20 text-[#3FA874] fill-current">
                  <path d="M40 70 C 40 40, 20 20, 10 10 C 35 15, 60 30, 40 70 Z" opacity="0.85" />
                  <path d="M40 55 C 55 45, 68 30, 70 15 C 55 22, 45 35, 40 55 Z" opacity="0.75" />
                  <path d="M30 65 C 20 50, 15 35, 5 30 C 15 42, 25 55, 30 65 Z" opacity="0.65" />
                </svg>
              </div>

              {/* 3 Devices Positioned in Harmony */}
              <div className="relative w-full max-w-2xl py-6 flex flex-col md:flex-row items-center justify-center gap-6 md:gap-4">
                {/* DEVICE 1: PHONE (Guest View) */}
                <div
                  className={`relative w-44 sm:w-48 rounded-[2rem] border-[3px] border-[#3D2C22] bg-[#FAF7F2] p-2 shadow-2xl transition-all duration-300 ${
                    activeTab === "guest" ? "scale-105 ring-2 ring-[#b9532b] z-30" : "opacity-90 z-20"
                  }`}
                >
                  {/* Handwritten Script Label pointing to Phone */}
                  <div className="absolute -top-7 left-2 font-script text-xl sm:text-2xl text-[#E8CD96] -rotate-6 select-none flex items-center gap-1">
                    <span>Guest View ~</span>
                  </div>

                  {/* Phone Header */}
                  <div className="text-center pt-1 pb-1.5 border-b border-[#DDD3C2] bg-white rounded-t-2xl">
                    <span className="font-display text-[10px] font-bold text-[#1F1915]">Table 1</span>
                    <p className="font-mono text-[8px] text-[#7A6E63]">Specialty Cafe Menu</p>
                  </div>

                  {/* Mini Menu Items */}
                  <div className="py-2 space-y-1.5 font-sans">
                    <div className="flex items-center justify-between rounded-lg bg-white p-1.5 border border-[#EAE2D7] text-[9.5px]">
                      <div>
                        <p className="font-bold text-[#1F1915]">Paneer Tikka</p>
                        <span className="font-semibold text-[#793c21]">₹290</span>
                      </div>
                      <span className="rounded bg-[#FAF0EB] px-1.5 py-0.5 text-[8.5px] font-bold text-[#b9532b]">
                        ADD
                      </span>
                    </div>

                    <div className="flex items-center justify-between rounded-lg bg-white p-1.5 border border-[#EAE2D7] text-[9.5px]">
                      <div>
                        <p className="font-bold text-[#1F1915]">Cold Coffee</p>
                        <span className="font-semibold text-[#793c21]">₹180</span>
                      </div>
                      <span className="rounded bg-[#FAF0EB] px-1.5 py-0.5 text-[8.5px] font-bold text-[#b9532b]">
                        ADD
                      </span>
                    </div>
                  </div>

                  {/* Quick Order Button */}
                  <div className="mt-1 rounded-lg bg-[#1F1915] p-1.5 text-center text-[9px] font-bold text-white">
                    Place Order →
                  </div>
                </div>

                {/* DEVICE 2: TABLET (Kitchen Pass KDS) */}
                <div
                  className={`relative w-64 sm:w-72 rounded-2xl border-[3px] border-[#3D2C22] bg-[#FAF7F2] p-2.5 shadow-2xl transition-all duration-300 ${
                    activeTab === "kitchen" ? "scale-105 ring-2 ring-[#b9532b] z-30" : "opacity-90 z-10"
                  }`}
                >
                  {/* Handwritten Script Label pointing to Tablet */}
                  <div className="absolute -top-7 left-4 font-script text-xl sm:text-2xl text-[#E8CD96] -rotate-3 select-none flex items-center gap-1">
                    <span>Kitchen View ~</span>
                  </div>

                  {/* Tablet KDS Header */}
                  <div className="flex items-center justify-between border-b border-[#DDD3C2] pb-1.5">
                    <div className="flex items-center gap-1">
                      <ChefHat className="h-3 w-3 text-[#b9532b]" />
                      <span className="font-mono text-[10px] font-bold text-[#1F1915]">Kitchen Orders</span>
                    </div>
                    <span className="rounded-full bg-[#2D5E46]/10 px-1.5 py-0.5 font-mono text-[8.5px] font-bold text-[#2D5E46]">
                      3 Pending
                    </span>
                  </div>

                  {/* 3 Kitchen Tickets in Tablet */}
                  <div className="mt-2 space-y-1.5 font-mono text-[9px]">
                    {/* Ticket 1: Table 5 Fired */}
                    <div className="rounded-lg bg-white p-1.5 border border-[#DDD3C2] shadow-2xs">
                      <div className="flex items-center justify-between font-bold text-[#1F1915]">
                        <span>Table 5</span>
                        <span className="rounded bg-rose-100 px-1 py-0.2 text-[8px] text-rose-800 uppercase">
                          Fired
                        </span>
                      </div>
                      <p className="text-[#6E6155] mt-0.5">2x Paneer Tikka, 1x Cold Coffee</p>
                    </div>

                    {/* Ticket 2: Table 3 Preparing */}
                    <div className="rounded-lg bg-white p-1.5 border border-[#DDD3C2] shadow-2xs">
                      <div className="flex items-center justify-between font-bold text-[#1F1915]">
                        <span>Table 3</span>
                        <span className="rounded bg-amber-100 px-1 py-0.2 text-[8px] text-amber-800 uppercase">
                          Preparing
                        </span>
                      </div>
                      <p className="text-[#6E6155] mt-0.5">1x Margherita Pizza, 1x French Fries</p>
                    </div>

                    {/* Ticket 3: Table 1 New */}
                    <div className="rounded-lg bg-white p-1.5 border border-[#DDD3C2] shadow-2xs">
                      <div className="flex items-center justify-between font-bold text-[#1F1915]">
                        <span>Table 1</span>
                        <span className="rounded bg-emerald-100 px-1 py-0.2 text-[8px] text-emerald-800 uppercase">
                          New
                        </span>
                      </div>
                      <p className="text-[#6E6155] mt-0.5">1x Veg Burger</p>
                    </div>
                  </div>
                </div>

                {/* DEVICE 3: LAPTOP (Owner View) */}
                <div
                  className={`relative w-64 sm:w-80 rounded-xl border-[3px] border-[#3D2C22] bg-[#FAF7F2] p-2.5 shadow-2xl transition-all duration-300 ${
                    activeTab === "owner" ? "scale-105 ring-2 ring-[#b9532b] z-30" : "opacity-90 z-10"
                  }`}
                >
                  {/* Handwritten Script Label pointing to Laptop */}
                  <div className="absolute -top-7 right-4 font-script text-xl sm:text-2xl text-[#E8CD96] rotate-3 select-none flex items-center gap-1">
                    <span>Owner View ~</span>
                  </div>

                  {/* Laptop Header */}
                  <div className="flex items-center justify-between border-b border-[#DDD3C2] pb-1.5">
                    <span className="font-mono text-[10px] font-bold text-[#1F1915]">Restaurant Dashboard</span>
                    <span className="font-mono text-[8.5px] text-[#7A6E63]">Shift Active</span>
                  </div>

                  {/* Metric Tiles */}
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="rounded-lg bg-white p-2 border border-[#DDD3C2]">
                      <span className="font-mono text-[8px] uppercase text-[#7A6E63]">Today's Sales</span>
                      <p className="font-mono text-xs font-bold text-[#1F1915]">₹12,480</p>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-[#DDD3C2]">
                      <span className="font-mono text-[8px] uppercase text-[#7A6E63]">Total Orders</span>
                      <p className="font-mono text-xs font-bold text-[#1F1915]">48</p>
                    </div>
                  </div>

                  {/* Mini Bar Chart Mockup */}
                  <div className="mt-2 rounded-lg bg-white p-2 border border-[#DDD3C2]">
                    <span className="font-mono text-[8px] text-[#7A6E63] uppercase">Hourly Sales Rhythm</span>
                    <div className="flex items-end gap-1.5 h-10 mt-1 pt-2">
                      <div className="w-1/7 bg-[#DDD3C2] rounded-t-sm h-[30%]" />
                      <div className="w-1/7 bg-[#DDD3C2] rounded-t-sm h-[50%]" />
                      <div className="w-1/7 bg-[#9E4A28] rounded-t-sm h-[85%]" />
                      <div className="w-1/7 bg-[#9E4A28] rounded-t-sm h-[100%]" />
                      <div className="w-1/7 bg-[#DDD3C2] rounded-t-sm h-[70%]" />
                      <div className="w-1/7 bg-[#DDD3C2] rounded-t-sm h-[40%]" />
                      <div className="w-1/7 bg-[#DDD3C2] rounded-t-sm h-[20%]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
