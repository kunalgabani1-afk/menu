import React from "react";
import { Volume2, VolumeX, AlertCircle, Sparkles } from "lucide-react";
import { useAudioAlertStatus } from "@/lib/orderAudioAlert";
import { Button } from "@/components/ui/button";

export function AudioAlertBanner({ className = "" }: { className?: string }) {
  const { isSoundEnabled, isBlocked, unlock, testSound } = useAudioAlertStatus();

  // If sound is enabled but suspended by browser autoplay policy, show persistent one-tap unlock banner
  if (isSoundEnabled && isBlocked) {
    return (
      <div
        className={`flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-[#FFFDF5] border border-[#EDE4D8] text-[#2C1810] text-xs shadow-xs animate-in fade-in duration-200 ${className}`}
        id="banner-audio-autoplay-unlock"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-7 w-7 rounded-xl bg-[#C87D55]/15 text-[#C87D55] flex items-center justify-center shrink-0">
            <Volume2 className="h-4 w-4" />
          </div>
          <div>
            <span className="font-semibold text-xs block text-[#2C1810]">
              Audio Alerts Ready
            </span>
            <span className="text-[11px] text-[#8C7A6B]">
              Tap once to enable sound for orders, kitchen tickets, and waiter calls in this browser.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            onClick={async () => {
              await unlock();
              await testSound();
            }}
            className="h-8.5 px-3.5 rounded-xl text-xs font-semibold bg-[#2C1810] hover:bg-[#3D261C] text-white gap-1.5 shadow-xs transition-colors"
            id="button-unlock-audio-alerts"
          >
            <Volume2 className="h-3.5 w-3.5 text-[#C87D55]" />
            Enable Audio Alerts
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
