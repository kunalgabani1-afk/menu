import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import { Sparkles, Plus, Check } from "lucide-react";
import QRCode from "qrcode";

interface HeroTableSceneProps {
  className?: string;
}

/**
 * HeroTableScene
 * Exact 1:1 recreation of the Hero tabletop scene from Image 1:
 * - Acrylic/wood standing Table Plaque with Tableline leaf emblem, QR code, and "Scan to Order"
 * - Sleek modern smartphone mockup showing the live digital menu ("The Grand Feast", Table 04, Paneer Tikka, Cold Coffee, Pizza)
 * - Warm culinary food dish plate in the background
 * - Handwritten gold cursive annotation: "Scan / Order / Enjoy ♡" with delicate curved arrow
 */
export function HeroTableScene({ className = "" }: HeroTableSceneProps) {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");

  useEffect(() => {
    let isMounted = true;
    const targetUrl =
      typeof window !== "undefined" && window.location.origin.includes("run.app")
        ? `${window.location.origin}/menu/the-roast-room/table/04`
        : "https://tableline.app/menu/the-roast-room/table/04";

    QRCode.toDataURL(targetUrl, {
      width: 480,
      margin: 1,
      errorCorrectionLevel: "H",
      color: {
        dark: "#1F1915",
        light: "#FFFFFF",
      },
    })
      .then((url: string) => {
        if (isMounted) setQrCodeDataUrl(url);
      })
      .catch((err: unknown) => {
        console.warn("Could not generate QR data URL", err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className={`relative w-full max-w-[580px] mx-auto select-none ${className}`}>
      {/* Soft warm tabletop background glow */}
      <div
        className="absolute -inset-4 rounded-3xl opacity-40 blur-2xl pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(232, 205, 150, 0.45) 0%, rgba(201, 101, 61, 0.15) 50%, transparent 75%)",
        }}
      />

      {/* Main Tabletop Composition Stage */}
      <div className="relative rounded-3xl p-4 sm:p-6 overflow-visible">
        {/* Background Warm Restaurant Food Plate */}
        <div className="absolute top-2 right-2 sm:right-6 w-44 sm:w-56 h-44 sm:h-56 rounded-full overflow-hidden shadow-[0_16px_36px_rgba(36,28,23,0.18)] border-4 border-white/80 opacity-90 rotate-6 pointer-events-none">
          <img
            src="/pastry_croissant.jpg"
            alt="Warm culinary restaurant plate"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = "/latte_table.jpg";
            }}
          />
          <div className="absolute inset-0 bg-radial-gradient from-transparent to-black/20" />
        </div>

        {/* Handwritten Annotation in Warm Terracotta/Gold: "Scan / Order / Enjoy ♡" */}
        <div className="absolute -top-3 left-4 sm:left-10 z-30 flex items-center gap-2 text-[#9E4A28] font-script text-2xl sm:text-3xl -rotate-6 select-none drop-shadow-xs">
          <span>Scan / Order / Enjoy ♡</span>
          <svg
            className="w-8 h-8 sm:w-10 sm:h-10 text-[#9E4A28] stroke-current fill-none stroke-[2] -rotate-12"
            viewBox="0 0 40 40"
          >
            <path
              d="M6 10 C 14 18, 22 14, 28 26 M 28 26 L 22 24 M 28 26 L 27 19"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Foreground Content: Acrylic Table Plaque (Left) + Smartphone Mockup (Right) */}
        <div className="relative z-20 flex flex-col sm:flex-row items-center sm:items-end justify-center gap-5 sm:gap-6 pt-6">
          {/* 1. STANDING TABLE PLAQUE */}
          <div className="relative w-52 sm:w-56 rounded-2xl border border-[#DDD3C2] bg-linear-to-b from-[#FFFDF9] via-[#FAF6EE] to-[#F2EAE0] p-4 shadow-[0_18px_38px_-8px_rgba(40,28,20,0.22)] text-center shrink-0">
            {/* Plaque Header: Leaf Logo & Tableline */}
            <div className="flex flex-col items-center justify-center pb-2">
              <div className="h-8 w-8 rounded-full bg-[#793c21] text-white flex items-center justify-center shadow-xs">
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M12.2 3.5C8.8 4.2 6.2 6.8 5.5 10.2c-.6 2.8.2 5.6 2 7.7.3.3.8.2.9-.2.8-2.6 2.3-4.8 4.5-6.5 1.8-1.4 3.9-2.4 6.2-2.9.4-.1.6-.5.4-.8-1.5-2.4-4.2-4.1-7.3-4zm-1.8 11.2c-.3 1.3-.2 2.6.2 3.8.1.3.5.4.7.2 2.6-2.5 4.3-5.7 4.9-9.3.1-.4-.3-.7-.7-.6-1.8.4-3.5 1.2-5 2.4-1.2 1-2.1 2.2-2.7 3.5z" />
                </svg>
              </div>
              <h4 className="mt-1 font-display text-base font-bold text-[#1F1915]">Tableline</h4>
              <p className="font-serif italic text-[10px] text-[#7A6E63]">Good Food Brings People Together</p>
            </div>

            {/* Crisp QR Code with Tableline Center Stamp */}
            <div className="mx-auto my-2 p-2 bg-white rounded-xl border border-[#E8DEC8] shadow-xs w-36 h-36 flex items-center justify-center relative overflow-hidden">
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="Table 04 Real Dining Menu QR Code"
                  className="w-full h-full object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 43 43"
                  shapeRendering="crispEdges"
                  className="w-full h-full"
                >
                  <path
                    stroke="#1F1915"
                    d="M1 1.5h7m3 0h3m4 0h2m1 0h1m1 0h2m1 0h6m3 0h7M1 2.5h1m5 0h1m1 0h1m2 0h6m1 0h1m3 0h2m1 0h2m2 0h1m1 0h2m1 0h1m5 0h1M1 3.5h1m1 0h3m1 0h1m2 0h2m5 0h2m5 0h2m1 0h2m3 0h1m2 0h1m1 0h3m1 0h1M1 4.5h1m1 0h3m1 0h1m3 0h5m1 0h3m3 0h3m2 0h4m3 0h1m1 0h3m1 0h1M1 5.5h1m1 0h3m1 0h1m9 0h1m3 0h1m1 0h1m4 0h2m1 0h1m3 0h1m1 0h3m1 0h1M1 6.5h1m5 0h1m1 0h3m2 0h1m1 0h3m1 0h4m2 0h2m4 0h1m2 0h1m5 0h1M1 7.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M9 8.5h3m1 0h7m2 0h1m3 0h3m1 0h1m2 0h1M5 9.5h4m3 0h2m3 0h3m1 0h3m1 0h3m2 0h1m4 0h2m3 0h1M1 10.5h3m1 0h2m1 0h4m1 0h4m3 0h1m2 0h2m1 0h4m1 0h1m2 0h5m2 0h1M1 11.5h4m2 0h2m1 0h3m2 0h1m1 0h1m2 0h2m4 0h3m1 0h2m1 0h3m5 0h1M2 12.5h5m1 0h2m1 0h1m2 0h2m3 0h1m1 0h3m2 0h3m1 0h7m1 0h1m1 0h1M1 13.5h2m1 0h1m1 0h2m1 0h3m3 0h3m2 0h2m1 0h1m3 0h1m2 0h1m5 0h1M12 14.5h2m1 0h5m1 0h2m1 0h1m2 0h1m1 0h9m3 0h1M1 15.5h1m3 0h1m1 0h1m1 0h3m1 0h3m4 0h1m2 0h1m1 0h3m1 0h1m1 0h1m1 0h3m3 0h3M1 16.5h3m1 0h1m2 0h1m2 0h2m1 0h1m3 0h4m1 0h4m3 0h2m4 0h1m1 0h1m2 0h1M1 17.5h9m1 0h3m2 0h1m5 0h1m2 0h1m1 0h4m1 0h1m3 0h1m1 0h1m1 0h1M3 18.5h2m3 0h1m1 0h3m1 0h1m3 0h4m1 0h4m1 0h2m1 0h1m2 0h4m3 0h1M7 19.5h2m5 0h1m1 0h2m1 0h4m1 0h2m1 0h2m1 0h1m2 0h4m1 0h1m2 0h1M2 20.5h1m7 0h2m1 0h4m2 0h1m3 0h4m3 0h2m1 0h4m1 0h1m2 0h1M1 21.5h3m1 0h3m1 0h2m1 0h3m3 0h3m1 0h2m1 0h1m2 0h2m1 0h1m1 0h2m1 0h1m4 0h1M1 22.5h1m3 0h2m3 0h2m2 0h2m1 0h3m1 0h1m2 0h2m1 0h3m4 0h2m1 0h1m3 0h1M2 23.5h1m1 0h1m1 0h2m1 0h1m2 0h2m1 0h2m2 0h1m1 0h2m2 0h1m2 0h1m1 0h1m2 0h3m1 0h1m3 0h1M2 24.5h1m5 0h1m1 0h2m2 0h5m1 0h2m1 0h2m5 0h4m3 0h2m1 0h1M1 25.5h2m1 0h1m1 0h4m1 0h2m3 0h1m1 0h3m1 0h2m2 0h3m1 0h1m2 0h2m3 0h1M3 26.5h4m1 0h1m1 0h1m5 0h2m3 0h2m1 0h2m1 0h5m1 0h5m1 0h1m1 0h1M2 27.5h2m2 0h3m9 0h3m1 0h1m4 0h3m1 0h1m1 0h1m1 0h1m1 0h1m3 0h1M2 28.5h4m2 0h2m2 0h5m4 0h5m2 0h1m1 0h1m1 0h4m1 0h2m2 0h1M1 29.5h1m2 0h1m1 0h3m2 0h2m4 0h3m1 0h1m4 0h1m1 0h3m2 0h1M1 30.5h2m3 0h1m1 0h1m2 0h1m5 0h1m1 0h1m2 0h2m6 0h1m1 0h1m3 0h2m1 0h1m1 0h1M3 31.5h1m1 0h1m1 0h2m3 0h3m6 0h2m2 0h1m1 0h2m2 0h2m1 0h1m1 0h3m2 0h1M4 32.5h3m2 0h1m2 0h1m2 0h2m2 0h2m1 0h4m2 0h7m2 0h1m2 0h2M1 33.5h2m1 0h1m2 0h1m2 0h1m2 0h2m1 0h3m1 0h1m2 0h3m1 0h1m2 0h1m2 0h6m2 0h1M9 34.5h1m1 0h1m2 0h1m1 0h7m1 0h1m3 0h1m1 0h4m3 0h3m1 0h1M1 35.5h7m1 0h4m1 0h3m2 0h2m1 0h1m1 0h2m1 0h2m2 0h3m1 0h1m1 0h1m1 0h1m1 0h1M1 36.5h1m5 0h1m1 0h1m2 0h2m2 0h1m1 0h1m2 0h5m2 0h1m4 0h1m3 0h2m1 0h2M1 37.5h1m1 0h3m1 0h1m1 0h3m1 0h1m1 0h5m1 0h2m1 0h1m1 0h1m1 0h1m3 0h7m1 0h2M1 38.5h1m1 0h3m1 0h1m2 0h1m5 0h1m1 0h2m2 0h1m1 0h2m2 0h1m2 0h3m2 0h1m2 0h3M1 39.5h1m1 0h3m1 0h1m2 0h1m3 0h4m1 0h4m1 0h1m1 0h3m3 0h1m1 0h1m3 0h1m1 0h2M1 40.5h1m5 0h1m3 0h2m1 0h1m1 0h1m1 0h2m1 0h1m1 0h3m2 0h1m1 0h1m2 0h4m3 0h2M1 41.5h7m2 0h2m1 0h2m1 0h1m4 0h1m1 0h1m1 0h2m3 0h1m1 0h2m2 0h3m1 0h1"
                  />
                </svg>
              )}
            </div>

            {/* Plaque Footer */}
            <div className="pt-1.5">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#9E4A28]">
                Table 04 · Scan to Order
              </span>
              <p className="font-mono text-[8.5px] uppercase tracking-widest text-[#8A7D73] mt-0.5">
                DINE • ORDER • ENJOY
              </p>
            </div>

            {/* Plaque Wooden Base Trim */}
            <div className="absolute -bottom-2 inset-x-3 h-2 rounded-b-md bg-linear-to-r from-[#5A3825] via-[#855338] to-[#5A3825] shadow-xs" />
          </div>

          {/* 2. SLIM SMARTPHONE MOCKUP */}
          <div className="relative w-56 sm:w-64 rounded-[2.2rem] border-[4px] border-[#2A201A] bg-[#1F1915] p-2 shadow-[0_24px_50px_-8px_rgba(20,12,6,0.35)] overflow-hidden shrink-0">
            {/* Phone Screen Container */}
            <div className="relative rounded-[1.8rem] bg-[#FAF7F2] overflow-hidden text-[#1F1915]">
              {/* Status Bar */}
              <div className="flex items-center justify-between px-4 pt-2 pb-1 text-[10px] font-mono text-[#7A6E63]">
                <span>12:44</span>
                <div className="h-3 w-16 bg-[#1F1915] rounded-full mx-auto" />
                <span>5G 98%</span>
              </div>

              {/* Menu App Header */}
              <div className="px-3 pt-1.5 pb-2 border-b border-[#EAE2D7] bg-[#F7F2EB]/90">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="font-display text-xs font-bold text-[#1F1915]">The Grand Feast</h5>
                    <span className="font-mono text-[9px] text-[#7A6E63]">Dine-In • Table 04</span>
                  </div>
                  <span className="rounded-full bg-[#2D5E46]/10 px-2 py-0.5 font-mono text-[9px] font-bold text-[#2D5E46]">
                    Active
                  </span>
                </div>

                {/* Category Pills */}
                <div className="flex items-center gap-1 mt-2 text-[9.5px] font-medium overflow-x-hidden">
                  <span className="rounded-full bg-[#1F1915] text-white px-2 py-0.5">Starters</span>
                  <span className="rounded-full bg-white text-[#7A6E63] px-2 py-0.5 border border-[#DDD3C2]">Mains</span>
                  <span className="rounded-full bg-white text-[#7A6E63] px-2 py-0.5 border border-[#DDD3C2]">Drinks</span>
                </div>
              </div>

              {/* Menu Item Cards */}
              <div className="p-2 space-y-1.5 font-sans">
                {/* Item 1 */}
                <div className="flex items-center justify-between rounded-xl bg-white p-2 border border-[#EAE2D7] shadow-2xs">
                  <div>
                    <p className="text-[11px] font-bold text-[#1F1915]">Paneer Tikka</p>
                    <span className="text-[10px] font-semibold text-[#793c21]">₹290</span>
                  </div>
                  <button className="flex items-center gap-0.5 rounded-lg bg-[#FAF0EB] px-2 py-1 text-[9.5px] font-bold text-[#b9532b] hover:bg-[#b9532b] hover:text-white transition-colors">
                    <Plus className="h-2.5 w-2.5" /> ADD
                  </button>
                </div>

                {/* Item 2 */}
                <div className="flex items-center justify-between rounded-xl bg-white p-2 border border-[#EAE2D7] shadow-2xs">
                  <div>
                    <p className="text-[11px] font-bold text-[#1F1915]">Cold Coffee</p>
                    <span className="text-[10px] font-semibold text-[#793c21]">₹180</span>
                  </div>
                  <button className="flex items-center gap-0.5 rounded-lg bg-[#FAF0EB] px-2 py-1 text-[9.5px] font-bold text-[#b9532b] hover:bg-[#b9532b] hover:text-white transition-colors">
                    <Plus className="h-2.5 w-2.5" /> ADD
                  </button>
                </div>

                {/* Item 3 */}
                <div className="flex items-center justify-between rounded-xl bg-white p-2 border border-[#EAE2D7] shadow-2xs">
                  <div>
                    <p className="text-[11px] font-bold text-[#1F1915]">Margherita Pizza</p>
                    <span className="text-[10px] font-semibold text-[#793c21]">₹350</span>
                  </div>
                  <button className="flex items-center gap-0.5 rounded-lg bg-[#FAF0EB] px-2 py-1 text-[9.5px] font-bold text-[#b9532b] hover:bg-[#b9532b] hover:text-white transition-colors">
                    <Plus className="h-2.5 w-2.5" /> ADD
                  </button>
                </div>
              </div>

              {/* Bottom Quick Cart Bar in Phone */}
              <div className="p-2 border-t border-[#EAE2D7] bg-white">
                <div className="flex items-center justify-between rounded-xl bg-[#1F1915] text-white px-3 py-1.5 text-[10px] font-medium">
                  <span>View Order (2 items)</span>
                  <span className="font-bold">₹470 →</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
