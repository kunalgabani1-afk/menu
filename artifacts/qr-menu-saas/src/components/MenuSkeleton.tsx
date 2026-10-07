import React from "react";

export function MenuSkeleton() {
  return (
    <div
      className="min-h-screen bg-[#fafaf9] dark:bg-[#1c1917] text-[#1c1917] font-sans antialiased animate-pulse motion-reduce:animate-none"
      aria-label="Loading dining menu..."
    >
      {/* 1. Header Atmosphere Skeleton */}
      <div className="relative w-full h-36 sm:h-44 bg-stone-200 dark:bg-stone-800">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#fafaf9] dark:to-[#1c1917]" />
      </div>

      {/* 2. Restaurant Identity Skeleton */}
      <div className="px-5 pt-2 pb-4 text-center max-w-md mx-auto space-y-2">
        <div className="h-7 w-48 bg-stone-200 dark:bg-stone-800 rounded-lg mx-auto" />
        <div className="h-3.5 w-32 bg-stone-200 dark:bg-stone-800 rounded-md mx-auto" />
        <div className="h-3.5 w-40 bg-stone-200 dark:bg-stone-800 rounded-md mx-auto mt-1" />
      </div>

      {/* 3. Search & Category Bar Skeleton */}
      <div className="w-full max-w-md mx-auto px-4 pt-1 pb-2 space-y-3">
        {/* Search bar placeholder */}
        <div className="h-12 w-full rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex items-center px-3.5 gap-2.5">
          <div className="h-4.5 w-4.5 rounded-full bg-stone-200 dark:bg-stone-800" />
          <div className="h-3.5 w-52 rounded bg-stone-200 dark:bg-stone-800" />
        </div>

        {/* Category Pills horizontal row skeleton */}
        <div className="flex items-center gap-2 overflow-x-hidden pt-1 pb-1">
          <div className="h-8.5 w-16 rounded-full bg-stone-800 text-white shrink-0" />
          <div className="h-8.5 w-24 rounded-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shrink-0" />
          <div className="h-8.5 w-24 rounded-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shrink-0" />
          <div className="h-8.5 w-20 rounded-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shrink-0" />
        </div>
      </div>

      {/* 4. Food List Items Skeleton */}
      <main className="w-full max-w-md mx-auto px-4 pt-2 space-y-4 pb-28">
        {[1, 2, 3, 4].map((idx) => (
          <div
            key={idx}
            className="py-4 border-b border-stone-200/70 flex items-start justify-between gap-4"
          >
            {/* Left text column */}
            <div className="flex-1 space-y-2.5">
              <div className="h-3.5 w-3.5 rounded-xs bg-stone-200 dark:bg-stone-800" />
              <div className="h-5 w-3/4 rounded bg-stone-200 dark:bg-stone-800" />
              <div className="h-4 w-16 rounded bg-stone-200 dark:bg-stone-800" />
              <div className="h-3 w-full rounded bg-stone-200/80 dark:bg-stone-800/80" />
              <div className="h-3 w-4/5 rounded bg-stone-200/80 dark:bg-stone-800/80" />
            </div>

            {/* Right photo placeholder */}
            <div className="shrink-0 h-28 w-28 sm:h-32 sm:w-32 rounded-2xl bg-stone-200 dark:bg-stone-800" />
          </div>
        ))}
      </main>

      {/* Bottom Nav Skeleton */}
      <div className="fixed bottom-0 inset-x-0 h-16 border-t border-stone-200 dark:border-stone-800 bg-[#fafaf9]/95 dark:bg-[#1c1917]/95" />
    </div>
  );
}

export default MenuSkeleton;
