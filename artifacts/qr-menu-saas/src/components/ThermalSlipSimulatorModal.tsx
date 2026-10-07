import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Bluetooth, Copy, Check, X, Sparkles, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { PrinterStatus } from "@/hooks/useThermalPrinter";

interface ThermalSlipSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  slipText: string;
  printerStatus: PrinterStatus;
  deviceName: string | null;
  onConnectPrinter?: () => void;
}

export function ThermalSlipSimulatorModal({
  isOpen,
  onClose,
  slipText,
  printerStatus,
  deviceName,
  onConnectPrinter,
}: ThermalSlipSimulatorModalProps) {
  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(slipText);
    setCopied(true);
    toast({
      title: "KOT Copied",
      description: "Thermal slip text copied to clipboard.",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBrowserPrint = () => {
    const printWindow = window.open("", "_blank", "width=380,height=600");
    if (!printWindow) {
      toast({
        title: "Print popup blocked",
        description: "Please allow popups to print using standard dialog.",
        variant: "destructive",
      });
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>KOT Print</title>
          <style>
            @page { margin: 0; size: 58mm auto; }
            body {
              font-family: monospace;
              font-size: 11px;
              line-height: 1.25;
              padding: 8px;
              color: #000;
              background: #fff;
              white-space: pre-wrap;
              word-break: break-all;
            }
          </style>
        </head>
        <body>${slipText}</body>
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          }
        </script>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-[#1E1C1A] text-stone-100 border-stone-800">
        <DialogHeader className="p-4 bg-[#2A2623] border-b border-stone-800 flex flex-row items-center justify-between">
          <div>
            <DialogTitle className="text-base font-serif font-bold text-stone-100 flex items-center gap-2">
              <Printer className="h-4 w-4 text-amber-400" />
              Thermal Slip Preview &amp; Simulator
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-400 mt-0.5">
              High-contrast 58mm / 80mm ESC/POS kitchen slip simulation
            </DialogDescription>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                printerStatus === "connected"
                  ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                  : "bg-stone-800 text-stone-400 border border-stone-700"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  printerStatus === "connected" ? "bg-emerald-400 animate-pulse" : "bg-stone-500"
                }`}
              />
              {printerStatus === "connected" ? deviceName || "BT Paired" : "Virtual KOT"}
            </span>
          </div>
        </DialogHeader>

        {/* Realistic Thermal Receipt Slip */}
        <div className="p-5 flex justify-center bg-[#141211] overflow-y-auto max-h-[60vh]">
          <div className="w-full max-w-[320px] bg-[#FAF8F5] text-stone-950 p-4 shadow-2xl rounded-xs font-mono text-xs select-text relative border-x border-[#E0D8CE]">
            {/* Top Zig-zag Tear Effect */}
            <div className="absolute -top-1.5 left-0 right-0 h-2 bg-radial from-transparent to-[#FAF8F5] opacity-80" />

            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed tracking-tight text-stone-900">
              {slipText || "No slip text available"}
            </pre>

            {/* Bottom Zig-zag Tear Effect */}
            <div className="mt-4 pt-2 border-t border-dashed border-stone-400 flex items-center justify-between text-[9px] text-stone-500 uppercase">
              <span>*** END OF TICKET ***</span>
              <span>TABLELINE POS</span>
            </div>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="p-3 bg-[#24201D] border-t border-stone-800 flex flex-wrap items-center justify-between gap-2">
          {onConnectPrinter && printerStatus !== "connected" && (
            <Button
              size="sm"
              variant="outline"
              onClick={onConnectPrinter}
              className="text-xs h-8 border-amber-600/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 gap-1.5"
            >
              <Bluetooth className="h-3.5 w-3.5 text-amber-400" />
              Pair BT Printer
            </Button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleCopy}
              className="text-xs h-8 bg-stone-800 hover:bg-stone-700 text-stone-200 gap-1.5"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              size="sm"
              onClick={handleBrowserPrint}
              className="text-xs h-8 bg-amber-600 hover:bg-amber-500 text-white font-bold gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Slip
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="text-xs h-8 text-stone-400 hover:text-white"
            >
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
