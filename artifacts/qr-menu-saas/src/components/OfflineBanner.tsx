import { useEffect, useState } from "react";
import { WifiOff, AlertTriangle } from "lucide-react";

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      data-testid="banner-offline-mode"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-600 px-4 py-2.5 text-center text-xs font-semibold text-white shadow-md transition-all animate-in slide-in-from-top duration-300"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>
        You are currently offline. Please reconnect your internet connection to place or track orders.
      </span>
    </aside>
  );
}
