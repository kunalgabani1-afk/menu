import React, { useState } from "react";
import { Search, X, Mic } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { HeroHeader } from "./HeroHeader";
import { BottomNav, type GuestTabKey } from "./BottomNav";
import { FloatingCartPill } from "./FloatingCartPill";

interface GuestLayoutProps {
  restaurantName: string;
  tableNumber: string;
  videoHeroUrl?: string;
  daypartBadge?: string;
  daypartSubtitle?: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onVoiceSearchClick?: () => void;
  lang?: string;
  onChangeLanguage?: (lang: string) => void;
  onCallServiceClick?: () => void;
  activeTab: GuestTabKey;
  onSelectTab: (tab: GuestTabKey) => void;
  onTriggerJumpMenu?: () => void;
  totalCartItemsCount?: number;
  cartGrandTotal?: number;
  currency?: string;
  onOpenCartClick?: () => void;
  ordersBadgeCount?: number;
  billTotal?: number;
  hasActiveOrders?: boolean;
  children: React.ReactNode;
}

export function GuestLayout({
  restaurantName = "The Roasted Bean Cafe",
  tableNumber = "04",
  videoHeroUrl = "/assets/hero-coffee-pour.mp4",
  daypartBadge = "☕ All-Day Roast",
  daypartSubtitle = "Wood-fired sourdough pizzas, single-origin espresso & artisan plates",
  searchQuery,
  onSearchChange,
  onVoiceSearchClick,
  lang = "en",
  onChangeLanguage,
  onCallServiceClick,
  activeTab,
  onSelectTab,
  onTriggerJumpMenu,
  totalCartItemsCount = 0,
  cartGrandTotal = 0,
  currency = "₹",
  onOpenCartClick,
  ordersBadgeCount = 0,
  billTotal,
  hasActiveOrders = false,
  children,
}: GuestLayoutProps) {
  // Speech Recognition state
  const [isListening, setIsListening] = useState(false);

  const startVoiceSearch = () => {
    triggerHaptic("tick");
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      if (onVoiceSearchClick) {
        onVoiceSearchClick();
      }
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = lang === "hi" ? "hi-IN" : lang === "gu" ? "gu-IN" : "en-IN";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      setIsListening(true);

      recognition.onresult = (event: any) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript) {
          onSearchChange(transcript);
          triggerHaptic("success");
        }
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
        if (onVoiceSearchClick) onVoiceSearchClick();
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch {
      setIsListening(false);
      if (onVoiceSearchClick) onVoiceSearchClick();
    }
  };

  return (
    <div className="min-h-screen bg-[#fafaf9] dark:bg-[#141211] text-[#1c1917] dark:text-[#fafaf9] antialiased selection:bg-amber-200 selection:text-stone-950 pb-36">
      {/* Module 1: The Cinematic Hero & Massive Bold Serif Restaurant Branding */}
      <HeroHeader
        restaurantName={restaurantName}
        tableNumber={tableNumber}
        subtitle={daypartSubtitle}
        videoHeroUrl={videoHeroUrl}
        daypartBadge={daypartBadge}
        lang={lang}
        onChangeLanguage={onChangeLanguage}
        onCallServiceClick={onCallServiceClick}
      />

      {/* Main Content Workspace */}
      <main className="max-w-2xl mx-auto px-4 -mt-3 relative z-20 space-y-4">
        {/* Module 1: Typo-Tolerant Search Bar with Voice Mic on Far-Right Padding */}
        {activeTab === "menu" && (
          <div className="relative">
            <div className="relative flex items-center bg-white dark:bg-stone-900 rounded-2xl border border-[#ede4d8] dark:border-stone-800 shadow-md p-1.5 focus-within:ring-2 focus-within:ring-[#1c1917] dark:focus-within:ring-amber-500 transition-all">
              <Search className="h-5 w-5 text-[#8a7d73] ml-3 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search dishes (e.g. Mochha, Croissant, Pizza)…"
                className="w-full bg-transparent px-3 py-2 text-sm text-[#1c1917] dark:text-[#fafaf9] placeholder:text-[#8a7d73] focus:outline-none"
                id="guest-main-search-input"
              />

              {/* Clear search text */}
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange("")}
                  className="p-1.5 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 mr-1"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              {/* Voice Search Microphone Icon on far-right padding */}
              <button
                type="button"
                onClick={startVoiceSearch}
                className={`p-2 rounded-xl transition-all mr-1 flex items-center justify-center shrink-0 ${
                  isListening
                    ? "bg-rose-500 text-white animate-pulse"
                    : "bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-400 active:scale-95"
                }`}
                title={isListening ? "Listening... Speak now" : "Voice Search (Tap & Speak)"}
                id="btn-voice-search-mic"
                aria-label="Voice Search"
              >
                <Mic className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Tab Content Children */}
        {children}
      </main>

      {/* Module 3: Dynamic Floating Cart Pill (Floats cleanly directly above the bottom nav) */}
      {onOpenCartClick && (
        <FloatingCartPill
          totalItemsCount={totalCartItemsCount}
          grandTotal={cartGrandTotal}
          currency={currency}
          onClick={onOpenCartClick}
        />
      )}

      {/* Module 2: Native 3-Tab Fixed Bottom Navigation Bar */}
      <BottomNav
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        onTriggerJumpMenu={onTriggerJumpMenu}
        ordersBadgeCount={ordersBadgeCount}
        billTotal={billTotal}
        currency={currency}
        hasActiveOrders={hasActiveOrders}
      />
    </div>
  );
}

export default GuestLayout;
