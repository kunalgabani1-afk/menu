import { useState, useEffect } from "react";

export interface NetworkStatus {
  isOffline: boolean;
  isOnline: boolean;
}

/**
 * Custom React hook that utilizes the browser's navigator.onLine API
 * alongside window event listeners for 'online' and 'offline'.
 * Tracks real-time connection status and exposes an isOffline boolean state.
 */
export function useNetworkStatus(): NetworkStatus {
  const [isOffline, setIsOffline] = useState<boolean>(() => {
    if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
      return !navigator.onLine;
    }
    return false;
  });

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Sync with navigator.onLine on mount
    if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
      setIsOffline(!navigator.onLine);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return {
    isOffline,
    isOnline: !isOffline,
  };
}
