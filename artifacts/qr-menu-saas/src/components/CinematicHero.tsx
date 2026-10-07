import React, { useState } from "react";
import { formatTableName } from "@/lib/formatters";

interface CinematicHeroProps {
  videoUrl?: string | null;
  posterUrl?: string;
  restaurantName: string;
  tableNumber: string;
  daypartLabel?: string;
  daypartIcon?: string;
  daypartTime?: string;
  onOpenDaypartInfo?: () => void;
}

export const CinematicHero = React.memo(function CinematicHero({
  videoUrl,
  posterUrl = "/hero_cafe_editorial.jpg",
  restaurantName,
  tableNumber,
  daypartLabel,
  daypartIcon = "☀️",
  daypartTime,
  onOpenDaypartInfo,
}: CinematicHeroProps) {
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);

  // Fallback silent video clip of culinary artisan / coffee steam if no custom video is provided
  // Gracefully switches to poster if offline or playback restricted
  const activeVideo =
    !videoFailed && videoUrl
      ? videoUrl
      : !videoFailed
      ? "https://assets.mixkit.co/videos/preview/mixkit-barista-pouring-milk-into-coffee-cup-41132-large.mp4"
      : null;

  return (
    <div className="relative w-full h-36 sm:h-44 overflow-hidden bg-[#1c1917] select-none">
      {/* Background Visual: Video or Fallback Image */}
      {activeVideo ? (
        <video
          key={activeVideo}
          src={activeVideo}
          poster={posterUrl}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onLoadedData={() => setVideoLoaded(true)}
          onError={() => setVideoFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            videoLoaded ? "opacity-75" : "opacity-0"
          }`}
          aria-hidden="true"
        />
      ) : null}

      {/* Fallback image when video is loading or unsupported */}
      {(!videoLoaded || videoFailed || !activeVideo) && (
        <img
          src={posterUrl}
          alt={restaurantName}
          className="absolute inset-0 h-full w-full object-cover opacity-65"
          loading="eager"
        />
      )}

      {/* Deep Espresso Vignette Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#1c1917] via-[#1c1917]/40 to-black/30 pointer-events-none" />

      {/* Content Overlay */}
      <div className="absolute inset-x-0 bottom-0 px-4 pb-3 flex items-end justify-between gap-2 z-10">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-serif text-lg sm:text-xl font-bold tracking-tight text-[#fafaf9] drop-shadow-sm truncate uppercase">
              {restaurantName}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-[11px] font-sans font-bold text-amber-200 backdrop-blur-xs shrink-0">
              {formatTableName(tableNumber)}
            </span>
          </div>

          {/* Time-Aware Daypart Badge */}
          {daypartLabel && (
            <button
              type="button"
              onClick={onOpenDaypartInfo}
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/40 border border-white/15 text-[11px] font-medium text-stone-200 backdrop-blur-md hover:bg-black/60 transition-colors"
            >
              <span>{daypartIcon}</span>
              <span className="font-semibold text-amber-300">{daypartLabel} Menu</span>
              {daypartTime && (
                <span className="text-[10px] text-stone-300 font-sans tabular-nums opacity-80">
                  · {daypartTime}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Live Dining Session Status Dot */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/50 border border-white/10 backdrop-blur-md text-[10px] text-stone-300 shrink-0">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-medium tracking-wide">Live Table</span>
        </div>
      </div>
    </div>
  );
});
