import React, { useState } from "react";
import { Utensils } from "lucide-react";

interface LazyFoodImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  fallbackIconClassName?: string;
}

export const LazyFoodImage: React.FC<LazyFoodImageProps> = ({
  src,
  alt,
  className = "h-20 w-20 rounded-xl object-cover",
  fallbackIconClassName = "h-6 w-6 text-stone-300 dark:text-stone-600",
}) => {
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div
        className={`${className} flex items-center justify-center bg-stone-100 dark:bg-stone-800/80 border border-stone-200/50 dark:border-stone-800 shrink-0`}
        aria-label={alt}
      >
        <Utensils className={fallbackIconClassName} />
      </div>
    );
  }

  return (
    <div className={`relative shrink-0 overflow-hidden ${className}`}>
      {/* Placeholder skeleton while loading */}
      {!loaded && (
        <div className="absolute inset-0 bg-stone-200/70 dark:bg-stone-800 animate-pulse" />
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setHasError(true)}
        className={`h-full w-full object-cover transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
};
