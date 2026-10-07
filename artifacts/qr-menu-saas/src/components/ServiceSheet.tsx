import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Droplets, Bell, Utensils, Receipt, X, CheckCircle2, Loader2 } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

export type ServiceRequestType = "WATER" | "BILL" | "WAITER" | "CLEAN";

export interface ServiceSheetProps {
  isOpen: boolean;
  onClose: () => void;
  tableNumber: string;
  onRequestService?: (type: ServiceRequestType) => Promise<void> | void;
}

export function ServiceSheet({
  isOpen,
  onClose,
  tableNumber = "04",
  onRequestService,
}: ServiceSheetProps) {
  const [activeRequest, setActiveRequest] = useState<ServiceRequestType | null>(null);
  const [successType, setSuccessType] = useState<ServiceRequestType | null>(null);

  const formattedTableNumber = String(tableNumber || "1")
    .replace(/^Table\s*/i, "")
    .padStart(2, "0");

  const handleSelectService = async (type: ServiceRequestType) => {
    triggerHaptic("tick");
    setActiveRequest(type);
    try {
      if (onRequestService) {
        await onRequestService(type);
      }
      setSuccessType(type);
      triggerHaptic("success");
      setTimeout(() => {
        setSuccessType(null);
        setActiveRequest(null);
        onClose();
      }, 1400);
    } catch {
      setActiveRequest(null);
    }
  };

  const serviceOptions = [
    {
      id: "WATER" as ServiceRequestType,
      title: "Water Refill",
      subtitle: "Chilled or regular water carafes",
      icon: Droplets,
      iconColor: "text-sky-500",
      bgColor: "bg-sky-500/10 dark:bg-sky-500/20",
      borderColor: "hover:border-sky-500/50",
    },
    {
      id: "WAITER" as ServiceRequestType,
      title: "Call Waiter",
      subtitle: "Captain assistance at your table",
      icon: Bell,
      iconColor: "text-amber-500",
      bgColor: "bg-amber-500/10 dark:bg-amber-500/20",
      borderColor: "hover:border-amber-500/50",
    },
    {
      id: "CLEAN" as ServiceRequestType,
      title: "Clean Table",
      subtitle: "Clear used plates or table wipe",
      icon: Utensils,
      iconColor: "text-stone-600 dark:text-stone-300",
      bgColor: "bg-stone-500/10 dark:bg-stone-500/20",
      borderColor: "hover:border-stone-500/50",
    },
    {
      id: "BILL" as ServiceRequestType,
      title: "Request Bill",
      subtitle: "Bring physical bill / pay at counter",
      icon: Receipt,
      iconColor: "text-emerald-500",
      bgColor: "bg-emerald-500/10 dark:bg-emerald-500/20",
      borderColor: "hover:border-emerald-500/50",
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center select-none">
          {/* Backdrop: strictly above BottomNav (z-50) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/65 backdrop-blur-sm"
          />

          {/* Swipe-to-Dismiss Slide-Up Assistance Grid: strictly overlays BottomNav */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 400) {
                triggerHaptic("selection");
                onClose();
              }
            }}
            className="relative z-50 w-full max-w-lg rounded-t-3xl border-t border-[#ede4d8] dark:border-stone-800 bg-[#fafaf9] dark:bg-[#1c1917] p-6 shadow-2xl pb-safe pb-10"
            id="table-service-assistance-sheet"
          >
            {/* Grab Handle */}
            <div className="mx-auto -mt-2 mb-4 h-1.5 w-12 rounded-full bg-stone-300 dark:bg-stone-700" />

            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#ede4d8] dark:border-stone-800/80">
              <div>
                <h3 className="font-serif text-lg sm:text-xl font-bold text-[#1c1917] dark:text-[#fafaf9]">
                  Table Service Assistance
                </h3>
                <p className="text-xs text-[#8a7d73] dark:text-stone-400 mt-0.5">
                  Direct floor dispatch for Table {formattedTableNumber}
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="h-8 w-8 rounded-full bg-stone-200/70 dark:bg-stone-800 flex items-center justify-center text-[#1c1917] dark:text-stone-300 hover:bg-stone-300 dark:hover:bg-stone-700 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 4-Action Service Grid */}
            <div className="grid grid-cols-2 gap-3 pt-4">
              {serviceOptions.map((opt) => {
                const Icon = opt.icon;
                const isPending = activeRequest === opt.id && !successType;
                const isSuccess = successType === opt.id;

                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={Boolean(activeRequest)}
                    onClick={() => handleSelectService(opt.id)}
                    className={`relative p-4 rounded-2xl border border-[#ede4d8] dark:border-stone-800 bg-white dark:bg-stone-900/90 text-left transition-all active:scale-[0.98] shadow-sm flex flex-col justify-between gap-3 group ${opt.borderColor} ${
                      isSuccess ? "ring-2 ring-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className={`h-10 w-10 rounded-xl ${opt.bgColor} ${opt.iconColor} flex items-center justify-center transition-transform group-hover:scale-105`}
                      >
                        {isPending ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : isSuccess ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        ) : (
                          <Icon className="h-5 w-5" />
                        )}
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                        {opt.id}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-serif font-bold text-sm text-[#1c1917] dark:text-[#fafaf9] leading-tight">
                        {opt.title}
                      </h4>
                      <p className="text-[11px] text-[#8a7d73] dark:text-stone-400 mt-0.5 line-clamp-1">
                        {opt.subtitle}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Feedback notification */}
            {successType && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-bold text-center flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>Request dispatched! Floor captain is on the way.</span>
              </motion.div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default ServiceSheet;
