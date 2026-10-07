import React from "react";
import { Link } from "wouter";

interface BrandAtelierMarkProps {
  small?: boolean;
  light?: boolean;
  asDiv?: boolean;
  withTagline?: boolean;
  withAtelier?: boolean;
  className?: string;
}

/**
 * Tableline Brand Logo & Mark
 * Matches the organic twin-leaf emblem from the official Tableline brand identity.
 */
export function BrandAtelierMark({
  small = false,
  light = false,
  asDiv = false,
  withTagline = false,
  withAtelier = false,
  className = "",
}: BrandAtelierMarkProps) {
  const content = (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Tableline Twin Leaf Circular Emblem */}
      <div
        className={`relative flex items-center justify-center shrink-0 rounded-full transition-transform duration-200 group-hover:scale-105 ${
          small ? "h-7 w-7" : "h-8 w-8 sm:h-9 sm:w-9"
        } ${
          light
            ? "bg-white text-[#2D1E18] shadow-xs"
            : "bg-[#2D1E18] text-[#FBF8F4] shadow-xs shadow-stone-900/20"
        }`}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={small ? "h-4 w-4" : "h-4.5 w-4.5 sm:h-5 sm:w-5"}
        >
          {/* Main Leaf */}
          <path
            d="M6 18C6 11 11 6 18 5C18 12 13 17 6 18Z"
            fill="currentColor"
          />
          {/* Accent Secondary Leaf */}
          <path
            d="M10 18C10 14 13.5 10.5 18 10C18 14.5 14.5 18 10 18Z"
            fill="currentColor"
            fillOpacity="0.75"
          />
          {/* Leaf stem curve */}
          <path
            d="M5 19C8 18 12 15 15 11"
            stroke={light ? "#2D1E18" : "#FBF8F4"}
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Brand Typographic Identity */}
      <div className="flex flex-col leading-tight">
        <div className="flex items-baseline gap-1.5">
          <span
            className={`font-serif font-bold tracking-tight ${
              small ? "text-base" : "text-lg sm:text-[20px]"
            } ${light ? "text-white" : "text-[#2D1E18]"}`}
          >
            Tableline
          </span>
          {withAtelier && (
            <span
              className={`font-mono text-[10px] tracking-widest ${
                light ? "text-stone-300" : "text-stone-500"
              }`}
            >
              atelier
            </span>
          )}
        </div>
        {withTagline && (
          <span
            className={`text-[9.5px] font-sans ${
              light ? "text-stone-400" : "text-stone-500"
            }`}
          >
            Smart Dining. Happier Guests.
          </span>
        )}
      </div>
    </div>
  );

  if (asDiv) {
    return (
      <div data-testid="link-brand-atelier" className="group inline-flex">
        {content}
      </div>
    );
  }

  return (
    <Link
      href="/"
      className="group inline-flex transition-opacity hover:opacity-95 focus:outline-hidden"
      data-testid="link-brand-atelier"
      aria-label="Tableline Home"
    >
      {content}
    </Link>
  );
}
