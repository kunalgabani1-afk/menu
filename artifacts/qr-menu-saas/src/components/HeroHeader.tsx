import React, { useState, useEffect, useMemo } from "react";
import { Globe, Bell, Check, ChevronDown } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { triggerHaptic } from "@/lib/haptics";

export interface HeroHeaderProps {
  restaurantName?: string;
  tableNumber?: string;
  subtitle?: string;
  videoHeroUrl?: string;
  daypartBadge?: string;
  lang?: string;
  isLoading?: boolean;
  onChangeLanguage?: (lang: string) => void;
  onCallServiceClick?: () => void;
}

function toTitleCase(str: string): string {
  if (!str) return "The Roast Room";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getDaypart(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Breakfast";
  if (hour >= 12 && hour < 17) return "Lunch";
  if (hour >= 17 && hour < 22) return "Dinner";
  return "Late Night";
}

export function HeroHeader({
  restaurantName = "The Roasted Bean Cafe",
  tableNumber = "01",
  subtitle = "Café & Roastery",
  videoHeroUrl,
  daypartBadge,
  lang = "en",
  isLoading = false,
  onChangeLanguage,
  onCallServiceClick,
}: HeroHeaderProps) {
  const reducedMotion = useReducedMotion();
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => {
    return new Date().toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  });

  // Accurate, lightweight clock updater (checks every 10s without heavy overhead)
  useEffect(() => {
    const timer = setInterval(() => {
      const formatted = new Date().toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      setCurrentTime((prev) => (prev !== formatted ? formatted : prev));
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const formattedTableNumber = String(tableNumber || "1")
    .replace(/^Table\s*/i, "")
    .padStart(2, "0");

  const formattedTitle = useMemo(() => {
    return toTitleCase(restaurantName);
  }, [restaurantName]);

  const resolvedMeal = useMemo(() => {
    if (daypartBadge) {
      const cleaned = daypartBadge.replace(/[^\w\s]/gi, "").trim();
      if (cleaned.length > 0) {
        return cleaned.split(" ")[0];
      }
    }
    return getDaypart();
  }, [daypartBadge]);

  const languages = [
    { code: "en", label: "English", tag: "EN" },
    { code: "hi", label: "हिंदी", tag: "HI" },
    { code: "gu", label: "ગુજરાતી", tag: "GU" },
  ];

  // Elegant Luxury Loading Skeleton
  if (isLoading) {
    return (
      <header className="relative w-full overflow-hidden select-none bg-gradient-to-b from-stone-900 to-[#12100E] border-b border-stone-800/60 shadow-lg px-4 pt-4 pb-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="h-6 w-24 rounded-full bg-stone-800/70 animate-pulse" />
          <div className="flex gap-2">
            <div className="h-8 w-16 rounded-full bg-stone-800/70 animate-pulse" />
            <div className="h-8 w-20 rounded-full bg-stone-800/70 animate-pulse" />
          </div>
        </div>
        <div className="max-w-md mx-auto pt-3 pb-2 text-center flex flex-col items-center">
          <div className="h-3 w-28 rounded-full bg-stone-800/50 mb-2 animate-pulse" />
          <div className="h-7 w-48 rounded-xl bg-stone-800/80 mb-2 animate-pulse" />
          <div className="h-3.5 w-32 rounded-full bg-stone-800/40 mb-3 animate-pulse" />
          <div className="h-4 w-44 rounded-full bg-stone-800/60 animate-pulse" />
        </div>
      </header>
    );
  }

  return (
    <header className="relative w-full overflow-hidden select-none bg-gradient-to-b from-stone-900 to-[#12100E] border-b border-stone-800/60 shadow-lg">
      {/* Subtle Ambient Breathing Radial Amber Glow at top center */}
      <motion.div
        animate={
          reducedMotion
            ? { opacity: 0.18 }
            : {
                opacity: [0.15, 0.22, 0.15],
              }
        }
        transition={
          reducedMotion
            ? undefined
            : {
                duration: 7,
                repeat: Infinity,
                ease: "easeInOut",
              }
        }
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/30 via-stone-950/20 to-transparent pointer-events-none"
      />

      {/* Atmospheric Micro Point Light for warm luxury hotel ceiling fixture feel */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-10 bg-amber-500/10 blur-2xl pointer-events-none rounded-full" />

      {/* Top Header Controls: Frosted Glass */}
      <div className="relative z-20 flex items-center justify-between w-full max-w-2xl mx-auto px-4 pt-3 sm:pt-3.5">
        {/* Editorial Eyebrow Badge */}
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/5 backdrop-blur-md border border-white/10 text-amber-200/70 text-[10px] font-medium tracking-[0.22em] uppercase"
        >
          <span>Tableline · Dining</span>
        </motion.div>

        {/* Top-Right Frosted Glass Controls */}
        <div className="flex items-center gap-2">
          {/* Language Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                setLangDropdownOpen(!langDropdownOpen);
              }}
              className="h-7.5 sm:h-8 px-2.5 rounded-full bg-white/10 hover:bg-white/15 active:scale-95 backdrop-blur-md border border-white/10 text-stone-100 flex items-center gap-1.5 text-xs font-semibold shadow-xs transition-all"
              title="Change language"
              id="btn-hero-language-globe"
              aria-label="Change language"
            >
              <Globe className="h-3.5 w-3.5 text-stone-200" />
              <span className="text-[11px] font-bold uppercase tracking-wider">{lang}</span>
              <ChevronDown className="h-3 w-3 text-stone-300" />
            </button>

            {langDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setLangDropdownOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-36 rounded-2xl border border-white/10 bg-[#1c1917]/95 backdrop-blur-md p-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95">
                  {languages.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        onChangeLanguage?.(item.code);
                        setLangDropdownOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                        lang === item.code
                          ? "bg-amber-500/20 text-amber-200 font-bold border border-amber-500/30"
                          : "hover:bg-white/10 text-stone-200"
                      }`}
                    >
                      <span>{item.label}</span>
                      {lang === item.code && <Check className="h-3.5 w-3.5 text-amber-300 stroke-[2.5]" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Service Bell Button */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic("tick");
              onCallServiceClick?.();
            }}
            className="h-7.5 sm:h-8 px-3 rounded-full bg-white/10 hover:bg-white/15 active:scale-95 backdrop-blur-md border border-white/10 text-stone-100 text-xs font-medium tracking-wide flex items-center gap-1.5 shadow-xs transition-all"
            title="Request Service (Waiter, Water, Bill, Clean)"
            id="btn-hero-service-bell"
          >
            <Bell className="h-3.5 w-3.5 text-amber-300" />
            <span>Service</span>
          </button>
        </div>
      </div>

      {/* Main Identity: Compressed Vertical Footprint (Connects naturally to Search Bar below) */}
      <div className="relative z-10 w-full max-w-2xl mx-auto px-4 pt-2 pb-3.5 sm:pt-2.5 sm:pb-4 text-center">
        {/* 1. The Restaurant Name (Cinematic Blur Reveal with High-Contrast Serif) */}
        <motion.h1
          initial={
            reducedMotion
              ? false
              : {
                  opacity: 0,
                  filter: "blur(6px)",
                  y: 12,
                }
          }
          animate={{
            opacity: 1,
            filter: "blur(0px)",
            y: 0,
          }}
          transition={
            reducedMotion
              ? undefined
              : {
                  duration: 0.9,
                  delay: 0.15,
                  ease: [0.22, 1, 0.36, 1],
                }
          }
          className="font-serif text-2xl sm:text-3xl md:text-4xl font-normal tracking-tight text-stone-100 drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)] [text-shadow:_0_1px_12px_rgba(251,191,36,0.12)] line-clamp-1"
        >
          {formattedTitle}
        </motion.h1>

        {/* 2. Restaurant Subtitle / Cuisine (Staggered Soft Reveal) */}
        {subtitle && (
          <motion.p
            initial={reducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              reducedMotion
                ? undefined
                : {
                    duration: 0.7,
                    delay: 0.3,
                    ease: "easeOut",
                  }
            }
            className="text-xs sm:text-[13px] text-stone-400 font-sans tracking-wide mt-0.5 line-clamp-1"
          >
            {subtitle}
          </motion.p>
        )}

        {/* 3. The Clock & Table (Consolidated Luxury Watch Aesthetic Metadata Line) */}
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            reducedMotion
              ? undefined
              : {
                  duration: 0.7,
                  delay: 0.45,
                  ease: "easeOut",
                }
          }
          className="mt-2 flex items-center justify-center gap-2 sm:gap-2.5 text-xs text-stone-300 font-medium"
        >
          {/* Table */}
          <span className="text-stone-200 font-semibold tracking-wide">
            Table {formattedTableNumber}
          </span>

          <span className="text-white/20 select-none font-light">·</span>

          {/* Meal / Daypart */}
          <span className="text-stone-300 tracking-wide">
            {resolvedMeal}
          </span>

          <span className="text-white/20 select-none font-light">·</span>

          {/* Living Luxury Watch Face Clock with Micro-transition */}
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={currentTime}
              initial={reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -3 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="inline-block font-sans tabular-nums tracking-widest text-amber-200/80 font-medium"
            >
              {currentTime}
            </motion.span>
          </AnimatePresence>
        </motion.div>
      </div>
    </header>
  );
}

export default HeroHeader;
