import React, { useEffect, useRef } from "react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

interface KdsOfflineFailSafeProps {
  /**
   * Optional manual override / simulation flag for testing
   */
  simulatedOffline?: boolean;
}

/**
 * Kitchen Display System (KDS) Critical Offline Fail-Safe Component.
 * - Tracks network status in real-time via useNetworkStatus()
 * - Triggers an HTML5 Audio alarm (/assets/error-chime.mp3) on transition from online to offline
 * - Displays a high-visibility "Code Red" fixed top banner when offline
 */
export function KdsOfflineFailSafe({ simulatedOffline }: KdsOfflineFailSafeProps) {
  const { isOffline: realIsOffline } = useNetworkStatus();
  const isOffline = simulatedOffline ?? realIsOffline;

  // Track the previous offline state to detect the exact moment network transitions from online to offline
  const prevOfflineRef = useRef<boolean>(isOffline);

  useEffect(() => {
    // Exact moment network transitions from online (false) to offline (true)
    if (!prevOfflineRef.current && isOffline) {
      try {
        const alertAudio = new Audio("/assets/error-chime.mp3");
        alertAudio.volume = 1.0;
        const playPromise = alertAudio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn("[KDS Audio Alert] HTML5 audio playback prevented by browser policy:", err);
          });
        }
      } catch (audioErr) {
        console.error("[KDS Audio Alert] Failed to trigger error chime:", audioErr);
      }
    }
    prevOfflineRef.current = isOffline;
  }, [isOffline]);

  if (!isOffline) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-0 left-0 w-full z-50 bg-red-600 text-white font-sans font-bold uppercase tracking-wider py-4 text-center shadow-lg"
      id="kds-code-red-banner"
    >
      ⚠️ WIFI LOST - KITCHEN IS OFFLINE - SWITCH TO PAPER CHITS.
    </div>
  );
}

export default KdsOfflineFailSafe;
