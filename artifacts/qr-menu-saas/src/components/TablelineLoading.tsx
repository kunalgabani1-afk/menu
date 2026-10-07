import React, { useState, useEffect } from "react";
import { RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export type LoaderSize = "xs" | "sm" | "md" | "lg";
export type LoaderVariant = "page" | "inline" | "card" | "overlay";

interface TablelineSymbolProps {
  size?: LoaderSize;
  className?: string;
  isAnimated?: boolean;
}

/**
 * TABLELINE SIGNATURE RESTAURANT TABLE SYMBOL
 * Concept: TABLE → ORDER → SERVICE
 * 
 * - Grounded rounded table outline (remains steady, never spins)
 * - Four subtle seat/place markers (breathing quietly)
 * - Central plate & order element (gently settling in service)
 * - Restrained service aura (expanding gently, GPU accelerated)
 * - Uses pure CSS transforms & opacity; <1KB; zero external animation libraries.
 */
export function TablelineSymbol({
  size = "md",
  className = "",
  isAnimated = true,
}: TablelineSymbolProps) {
  const pixelMap: Record<LoaderSize, number> = {
    xs: 18,
    sm: 28,
    md: 48,
    lg: 68,
  };

  const px = pixelMap[size];

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none text-[#3D2314] dark:text-[#F7F4F0] ${className}`}
      style={{ width: px, height: px }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full overflow-visible"
      >
        {/* 1. Grounded Table Surface Outline (rx=9, rounded table) */}
        <rect
          x="12"
          y="13"
          width="40"
          height="38"
          rx="9"
          stroke="currentColor"
          strokeWidth="2.4"
          className={`fill-[#FAF6F0]/70 dark:fill-stone-900/70 ${
            isAnimated ? "motion-safe:animate-[tableline-table-presence_2.2s_ease-in-out_infinite]" : ""
          }`}
        />

        {/* 2. Four Subtle Seat / Place Setting Markers */}
        <g
          className={`text-[#C85A17] dark:text-amber-400 ${
            isAnimated ? "motion-safe:animate-[tableline-seat-breathe_1.8s_ease-in-out_infinite]" : "opacity-40"
          }`}
        >
          {/* Top Seat */}
          <rect x="27" y="7" width="10" height="2.2" rx="1.1" fill="currentColor" />
          {/* Bottom Seat */}
          <rect x="27" y="54.8" width="10" height="2.2" rx="1.1" fill="currentColor" />
          {/* Left Seat */}
          <rect x="6" y="27" width="2.2" height="10" rx="1.1" fill="currentColor" />
          {/* Right Seat */}
          <rect x="55.8" y="27" width="2.2" height="10" rx="1.1" fill="currentColor" />
        </g>

        {/* 3. Subtle Service Wave / Order Aura */}
        {isAnimated && (
          <circle
            cx="32"
            cy="32"
            r="11"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeDasharray="2.5 2.5"
            className="text-[#C85A17] dark:text-amber-400 opacity-60 origin-[32px_32px] motion-safe:animate-[tableline-service-aura_1.3s_cubic-bezier(0.2,0.8,0.2,1)_infinite] motion-reduce:hidden"
          />
        )}

        {/* 4. Central Plate (Outer Ceramic Rim) */}
        <circle
          cx="32"
          cy="32"
          r="7.5"
          stroke="currentColor"
          strokeWidth="1.75"
          className="fill-white dark:fill-stone-950"
        />

        {/* 5. Center Order / Service Dish Marker */}
        <circle
          cx="32"
          cy="32"
          r="3.2"
          fill="currentColor"
          className={`text-[#C85A17] dark:text-amber-400 origin-[32px_32px] ${
            isAnimated
              ? "motion-safe:animate-[tableline-plate-settle_1.3s_cubic-bezier(0.4,0,0.2,1)_infinite] motion-reduce:scale-100"
              : ""
          }`}
        />
      </svg>
    </div>
  );
}

export interface TablelineLoaderProps {
  variant?: LoaderVariant;
  size?: LoaderSize;
  message?: string;
  subtext?: string;
  restaurantName?: string;
  tableNumber?: string | number;
  className?: string;
  delayMs?: number;
  timeoutMs?: number;
  onRetry?: () => void;
  ariaLabel?: string;
}

/**
 * UNIFIED TABLELINE GLOBAL LOADER COMPONENT
 *
 * Implements:
 * - Anti-flashing delay threshold (skips rendering for operations < delayMs)
 * - Intelligent progressive messaging ("Still connecting..." -> Retry state)
 * - Hospitality metadata integration (Restaurant name, Table number)
 * - Low-stress calm failure recovery (Never infinite loader)
 */
export function TablelineLoader({
  variant = "card",
  size = "md",
  message = "Setting the table…",
  subtext,
  restaurantName,
  tableNumber,
  className = "",
  delayMs = 80,
  timeoutMs = 15000,
  onRetry,
  ariaLabel,
}: TablelineLoaderProps) {
  // Prevent flash: wait delayMs before rendering visible elements
  const [shouldRender, setShouldRender] = useState(delayMs <= 0);
  const [isSlow, setIsSlow] = useState(false);
  const [isTimedOut, setIsTimedOut] = useState(false);

  useEffect(() => {
    let delayTimer: any;
    if (delayMs > 0) {
      delayTimer = setTimeout(() => setShouldRender(true), delayMs);
    }

    const slowTimer = setTimeout(() => setIsSlow(true), 6500);
    const timeoutTimer = setTimeout(() => setIsTimedOut(true), timeoutMs);

    return () => {
      clearTimeout(delayTimer);
      clearTimeout(slowTimer);
      clearTimeout(timeoutTimer);
    };
  }, [delayMs, timeoutMs]);

  if (!shouldRender) {
    return null;
  }

  // Failure / Timeout State
  if (isTimedOut) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-6 text-center ${
          variant === "page" ? "min-h-[70vh]" : "min-h-[220px]"
        } ${className}`}
        role="alert"
        aria-live="assertive"
      >
        <div className="h-12 w-12 rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-300 grid place-items-center mb-3">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h3 className="font-serif text-base font-bold text-[#241B16] dark:text-[#FBF8F2]">
          Connection is taking longer than expected
        </h3>
        <p className="mt-1 text-xs text-[#776B62] dark:text-stone-400 max-w-xs">
          Please check your network connection or try refreshing the workspace.
        </p>
        <div className="mt-4 flex items-center gap-2">
          {onRetry ? (
            <Button
              onClick={onRetry}
              size="sm"
              className="rounded-xl bg-[#5A351F] hover:bg-[#4A2C1A] text-white text-xs font-bold px-4 h-9"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Try Again
            </Button>
          ) : (
            <Button
              onClick={() => window.location.reload()}
              size="sm"
              className="rounded-xl bg-[#5A351F] hover:bg-[#4A2C1A] text-white text-xs font-bold px-4 h-9"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Reload Page
            </Button>
          )}
        </div>
      </div>
    );
  }

  // 1. INLINE VARIANT (For small list sections, headers, cards)
  if (variant === "inline") {
    return (
      <div
        className={`inline-flex items-center gap-2 text-xs font-medium text-[#776B62] dark:text-stone-400 select-none ${className}`}
        role="status"
        aria-label={ariaLabel || message}
      >
        <TablelineSymbol size={size === "lg" ? "sm" : size} />
        <span>{isSlow ? "Still connecting…" : message}</span>
      </div>
    );
  }

  // 2. PAGE OR CARD VARIANT
  const isPage = variant === "page";

  return (
    <div
      className={`flex flex-col items-center justify-center text-center select-none ${
        isPage
          ? "min-h-[75vh] w-full px-4 py-12"
          : "min-h-[240px] w-full p-6"
      } ${className}`}
      role="status"
      aria-label={ariaLabel || message}
    >
      {/* Tableline Table-Order Symbol */}
      <div className="relative mb-4">
        {/* Warm ambient under-glow */}
        <div className="absolute inset-0 rounded-full bg-[#C85A17]/10 dark:bg-amber-400/10 blur-xl scale-125" />
        <TablelineSymbol size={isPage ? "lg" : size} />
      </div>

      {/* Brand Wordmark (Shown on page loads or large cards) */}
      {isPage && (
        <span className="font-serif text-xs font-bold uppercase tracking-widest text-[#8A7D73] dark:text-stone-400 mb-1">
          Tableline
        </span>
      )}

      {/* Primary Message */}
      <h3 className="font-serif text-sm sm:text-base font-bold text-[#241B16] dark:text-[#FBF8F2] tracking-tight">
        {isSlow ? "Still connecting to service…" : message}
      </h3>

      {/* Restaurant / Table Context */}
      {(restaurantName || tableNumber) && (
        <p className="mt-1 text-xs font-medium text-[#776B62] dark:text-stone-400">
          {restaurantName}
          {restaurantName && tableNumber ? " · " : ""}
          {tableNumber ? (String(tableNumber).toLowerCase().includes("table") ? tableNumber : `Table ${tableNumber}`) : ""}
        </p>
      )}

      {/* Subtext */}
      {subtext && !isSlow && (
        <p className="mt-1 text-[11px] text-[#8A7D73] dark:text-stone-500 max-w-xs leading-relaxed">
          {subtext}
        </p>
      )}

      {isSlow && (
        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300 animate-pulse">
          Taking a moment longer than usual…
        </p>
      )}
    </div>
  );
}

/**
 * Top Route Transition Progress Bar
 * Thin Tableline copper stripe at the very top of the viewport for rapid page transitions.
 */
export function TablelineTopProgress({ isVisible = true }: { isVisible?: boolean }) {
  if (!isVisible) return null;
  return (
    <div
      className="fixed top-0 inset-x-0 z-50 h-[2.5px] bg-transparent overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      <div className="h-full w-full bg-[#C85A17] dark:bg-amber-400 origin-left animate-[tableline-top-bar_1.2s_ease-in-out_infinite]" />
    </div>
  );
}

/**
 * Contextual Page Loader for Root / Full App Views
 */
export function TablelinePageLoader({
  message = "Loading your restaurant…",
  subtext,
  restaurantName,
  tableNumber,
  onRetry,
}: {
  message?: string;
  subtext?: string;
  restaurantName?: string;
  tableNumber?: string | number;
  onRetry?: () => void;
}) {
  return (
    <div className="min-h-screen w-full grid place-items-center bg-[#FAF6F0] dark:bg-[#141211] text-[#241B16] dark:text-[#FBF8F2]">
      <TablelineLoader
        variant="page"
        size="lg"
        message={message}
        subtext={subtext}
        restaurantName={restaurantName}
        tableNumber={tableNumber}
        onRetry={onRetry}
      />
    </div>
  );
}

/**
 * Compact Inline Loader
 */
export function TablelineInlineLoader({
  message = "Loading…",
  className = "",
  size = "sm",
}: {
  message?: string;
  className?: string;
  size?: LoaderSize;
}) {
  return (
    <TablelineLoader
      variant="inline"
      size={size}
      message={message}
      className={className}
      delayMs={40}
    />
  );
}

/**
 * Intelligent Hospitality Skeletons
 * Follows Tableline's warm ivory/stone palette rather than generic grey boxes.
 */
export function TablelineSkeleton({
  variant = "card",
  count = 1,
}: {
  variant?: "dish" | "card" | "kds" | "table" | "line";
  count?: number;
}) {
  const items = Array.from({ length: count });

  if (variant === "dish") {
    return (
      <div className="space-y-3" aria-hidden="true">
        {items.map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-[#E8DDD0] dark:border-stone-800 bg-white/70 dark:bg-stone-900/70 p-3 flex items-stretch justify-between gap-3 animate-pulse"
          >
            <div className="flex-1 space-y-2 py-1">
              <div className="h-3 w-8 rounded-full bg-[#EDE4D8] dark:bg-stone-800" />
              <div className="h-4 w-3/5 rounded-md bg-[#EDE4D8] dark:bg-stone-800" />
              <div className="h-3 w-1/4 rounded-md bg-[#EDE4D8] dark:bg-stone-800" />
              <div className="h-3 w-4/5 rounded-md bg-[#EDE4D8]/60 dark:bg-stone-800/60" />
            </div>
            <div className="h-18 w-22 rounded-xl bg-[#EDE4D8] dark:bg-stone-800 shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "kds") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" aria-hidden="true">
        {items.map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-border bg-card p-4 space-y-3 animate-pulse"
          >
            <div className="flex justify-between items-center pb-2 border-b border-border/60">
              <div className="h-5 w-20 rounded bg-muted" />
              <div className="h-4 w-14 rounded-full bg-muted" />
            </div>
            <div className="space-y-2 py-2">
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-4 w-2/3 rounded bg-muted" />
              <div className="h-4 w-1/2 rounded bg-muted" />
            </div>
            <div className="h-9 w-full rounded-xl bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3" aria-hidden="true">
        {items.map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-border bg-card p-4 h-28 flex flex-col justify-between animate-pulse"
          >
            <div className="h-4 w-16 rounded bg-muted" />
            <div className="h-3 w-10 rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  // Default card
  return (
    <div className="space-y-3" aria-hidden="true">
      {items.map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-border bg-card p-5 space-y-3 animate-pulse"
        >
          <div className="h-4 w-1/3 rounded bg-muted" />
          <div className="h-3 w-2/3 rounded bg-muted/70" />
          <div className="h-3 w-1/2 rounded bg-muted/60" />
        </div>
      ))}
    </div>
  );
}

/**
 * Button Content with Micro Tableline Loading State
 * Prevents button layout shift and replaces generic spinning wheel.
 */
export function TablelineButtonContent({
  isLoading,
  loadingText,
  children,
}: {
  isLoading: boolean;
  loadingText?: string;
  children: React.ReactNode;
}) {
  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1.5 select-none font-medium">
        <TablelineSymbol size="xs" className="shrink-0" />
        <span>{loadingText || "Processing…"}</span>
      </span>
    );
  }

  return <>{children}</>;
}
