import React, { useEffect } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { X } from "lucide-react";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxHeight?: string;
  className?: string;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxHeight = "max-h-[85vh]",
  className = "",
}: BottomSheetProps) {
  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Handle swipe-down gesture physics
  const handleDragEnd = (_: any, info: PanInfo) => {
    // If pulled down more than 100px or fast downward velocity
    if (info.offset.y > 100 || info.velocity.y > 500) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pointer-events-auto select-none">
          {/* Backdrop Scrim */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-0"
          />

          {/* Motion Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            style={{ willChange: "transform" }}
            className={`relative z-10 w-full max-w-lg bg-[#FAF7F2] dark:bg-[#1A1816] text-[#241B16] dark:text-[#F7F4F0] rounded-t-[32px] border-t border-[#EDE4D8] dark:border-stone-800 shadow-2xl flex flex-col ${maxHeight} ${className}`}
          >
            {/* Grabber Handle Bar */}
            <div
              onClick={onClose}
              className="pt-3 pb-2 cursor-pointer flex flex-col items-center justify-center shrink-0"
            >
              <div className="w-12 h-1.5 bg-[#D5C7B7] dark:bg-stone-700 rounded-full" />
            </div>

            {/* Header */}
            {(title || subtitle) && (
              <div className="px-6 pb-4 pt-1 flex items-start justify-between border-b border-[#EDE4D8] dark:border-stone-800 shrink-0">
                <div>
                  {title && (
                    <div className="font-serif text-xl font-bold tracking-tight">
                      {title}
                    </div>
                  )}
                  {subtitle && (
                    <div className="text-xs text-[#776B62] dark:text-stone-400 mt-0.5">
                      {subtitle}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full p-2 text-[#776B62] hover:bg-[#EFE7DC] dark:hover:bg-stone-800 transition-colors -mr-2 -mt-1"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            )}

            {/* Scrollable Content Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 overscroll-contain">
              {children}
            </div>

            {/* Footer Pin */}
            {footer && (
              <div className="p-4 px-6 border-t border-[#EDE4D8] dark:border-stone-800 bg-[#FAF7F2] dark:bg-[#1A1816] shrink-0 pb-safe">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default BottomSheet;
