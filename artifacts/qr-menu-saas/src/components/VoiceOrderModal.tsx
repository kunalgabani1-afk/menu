import React, { useState, useEffect, useRef } from "react";
import {
  Mic,
  Plus,
  Minus,
  Trash2,
  Check,
  X,
  Languages,
  RotateCw,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  parseVoiceOrder,
  type VoiceParsedItem,
  type VoiceParseResult,
  type VoiceCandidate,
} from "@/lib/voiceOrderParser";
import { triggerHaptic } from "@/lib/haptics";

export type VoiceState = "IDLE" | "LISTENING" | "PROCESSING" | "RESULT";

interface VoiceOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: "en" | "hi" | "gu";
  currency?: string;
  menuItems: Array<{
    id: string;
    name: string;
    price: number;
    veg: boolean;
    isJain?: boolean;
    available?: boolean;
    translations?: Record<string, { name?: string }>;
  }>;
  onAddToCart: (items: VoiceParsedItem[]) => void;
}

export function VoiceOrderModal({
  isOpen,
  onClose,
  lang: initialLang,
  currency = "₹",
  menuItems,
  onAddToCart,
}: VoiceOrderModalProps) {
  const [selectedLang, setSelectedLang] = useState<"en" | "hi" | "gu">(initialLang || "en");
  const [voiceState, setVoiceState] = useState<VoiceState>("IDLE");
  const [transcript, setTranscript] = useState("");
  const [parseResult, setParseResult] = useState<VoiceParseResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [addedNotice, setAddedNotice] = useState(false);
  const recognitionRef = useRef<any>(null);
  const processingTimerRef = useRef<any>(null);

  // Sync initial language
  useEffect(() => {
    setSelectedLang(initialLang || "en");
  }, [initialLang]);

  const speechLang =
    selectedLang === "gu" ? "gu-IN" : selectedLang === "hi" ? "hi-IN" : "en-IN";

  const stopRecognition = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }
  };

  const handleStartListening = () => {
    triggerHaptic("light");
    setErrorMessage(null);
    setTranscript("");
    setParseResult(null);
    setAddedNotice(false);

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMessage("Voice ordering is not supported in this browser. Please use the menu to order.");
      setVoiceState("IDLE");
      return;
    }

    stopRecognition();

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = speechLang;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      recognition.onstart = () => {
        setVoiceState("LISTENING");
        triggerHaptic("selection");
      };

      recognition.onresult = (event: any) => {
        let finalTrans = "";
        let interimTrans = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTrans += event.results[i][0].transcript;
          } else {
            interimTrans += event.results[i][0].transcript;
          }
        }
        const text = (finalTrans || interimTrans).trim();
        if (text) {
          setTranscript(text);
        }

        if (finalTrans) {
          // Transition immediately to processing state
          setVoiceState("PROCESSING");
          if (processingTimerRef.current) clearTimeout(processingTimerRef.current);
          processingTimerRef.current = setTimeout(() => {
            const parsed = parseVoiceOrder(finalTrans, menuItems);
            if (parsed.items.length > 0 || (parsed.possibleMatches && parsed.possibleMatches.length > 0)) {
              setParseResult(parsed);
              setVoiceState("RESULT");
              triggerHaptic("success");
            } else {
              setErrorMessage("Sorry, I didn't catch that.");
              setVoiceState("IDLE");
            }
          }, 350);
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === "no-speech") {
          setErrorMessage("Sorry, I didn't catch that.");
        } else if (event.error === "not-allowed" || event.error === "permission-denied") {
          setErrorMessage("Microphone permission was denied. Please allow mic access in your browser settings.");
        } else {
          setErrorMessage("Sorry, I didn't catch that.");
        }
        setVoiceState("IDLE");
      };

      recognition.onend = () => {
        if (recognitionRef.current) {
          // If we heard something but final didn't parse yet
          setTranscript((curr) => {
            if (curr && voiceState === "LISTENING") {
              setVoiceState("PROCESSING");
              setTimeout(() => {
                const parsed = parseVoiceOrder(curr, menuItems);
                if (parsed.items.length > 0 || (parsed.possibleMatches && parsed.possibleMatches.length > 0)) {
                  setParseResult(parsed);
                  setVoiceState("RESULT");
                  triggerHaptic("success");
                } else {
                  setErrorMessage("Sorry, I didn't catch that.");
                  setVoiceState("IDLE");
                }
              }, 300);
            } else if (!curr && voiceState === "LISTENING") {
              setVoiceState("IDLE");
              setErrorMessage("Sorry, I didn't catch that.");
            }
            return curr;
          });
        }
      };

      recognition.start();
    } catch {
      setErrorMessage("Could not start microphone. Please check browser permissions.");
      setVoiceState("IDLE");
    }
  };

  const handleStopListening = () => {
    triggerHaptic("light");
    stopRecognition();
    if (transcript.trim()) {
      setVoiceState("PROCESSING");
      setTimeout(() => {
        const parsed = parseVoiceOrder(transcript, menuItems);
        if (parsed.items.length > 0 || (parsed.possibleMatches && parsed.possibleMatches.length > 0)) {
          setParseResult(parsed);
          setVoiceState("RESULT");
          triggerHaptic("success");
        } else {
          setErrorMessage("Sorry, I didn't catch that.");
          setVoiceState("IDLE");
        }
      }, 300);
    } else {
      setVoiceState("IDLE");
    }
  };

  useEffect(() => {
    if (isOpen) {
      setAddedNotice(false);
      setErrorMessage(null);
      handleStartListening();
    } else {
      stopRecognition();
      setVoiceState("IDLE");
      setTranscript("");
      setParseResult(null);
      setErrorMessage(null);
      setAddedNotice(false);
    }
    return () => {
      stopRecognition();
      if (processingTimerRef.current) clearTimeout(processingTimerRef.current);
    };
  }, [isOpen, speechLang]);

  if (!isOpen) return null;

  const handleUpdateQuantity = (index: number, delta: number) => {
    if (!parseResult) return;
    triggerHaptic("light");
    const updated = [...parseResult.items];
    const newQty = updated[index].quantity + delta;
    if (newQty <= 0) {
      updated.splice(index, 1);
    } else {
      updated[index] = { ...updated[index], quantity: newQty };
    }
    setParseResult({ ...parseResult, items: updated });
  };

  const handleRemoveItem = (index: number) => {
    if (!parseResult) return;
    triggerHaptic("light");
    const updated = [...parseResult.items];
    updated.splice(index, 1);
    setParseResult({ ...parseResult, items: updated });
  };

  const handleConfirmAndAdd = () => {
    if (parseResult && parseResult.items.length > 0) {
      triggerHaptic("success");
      setAddedNotice(true);
      onAddToCart(parseResult.items);
      setTimeout(() => {
        onClose();
      }, 600);
    }
  };

  const handleSelectCandidate = (candidate: VoiceCandidate) => {
    triggerHaptic("light");
    const singleItem: VoiceParsedItem = {
      menuItemId: candidate.id,
      name: candidate.name,
      price: candidate.price,
      quantity: 1,
      veg: candidate.veg,
      confidence: 1.0,
    };

    setParseResult((prev) => {
      const existingItems = prev?.items ? [...prev.items] : [];
      const matchIdx = existingItems.findIndex((i) => i.menuItemId === candidate.id);
      if (matchIdx >= 0) {
        existingItems[matchIdx].quantity += 1;
      } else {
        existingItems.push(singleItem);
      }
      return {
        rawTranscript: prev?.rawTranscript || candidate.name,
        items: existingItems,
        unmatchedPhrases: [],
        possibleMatches: [],
      };
    });
    setVoiceState("RESULT");
  };

  const currentTotal =
    parseResult?.items.reduce((acc, item) => acc + item.price * item.quantity, 0) || 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(0.95); opacity: 0.7; }
          50% { transform: scale(1.35); opacity: 0.25; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        .voice-ring-1 { animation: pulse-ring 2.2s cubic-bezier(0.2, 0.8, 0.4, 1) infinite; }
        .voice-ring-2 { animation: pulse-ring 2.2s cubic-bezier(0.2, 0.8, 0.4, 1) infinite 0.55s; }
        .voice-ring-3 { animation: pulse-ring 2.2s cubic-bezier(0.2, 0.8, 0.4, 1) infinite 1.1s; }
      `}</style>

      <div
        className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl border border-[#EDE4D8] dark:border-stone-800 bg-[#FAF7F2] dark:bg-[#1A1816] text-[#241B16] dark:text-[#F7F4F0] shadow-2xl p-5 overflow-hidden transition-all duration-200 animate-in slide-in-from-bottom-4"
        onClick={(e) => e.stopPropagation()}
        id="modal-voice-order"
      >
        {/* Compact Header: Language Pills & Dismiss */}
        <div className="flex items-center justify-between pb-3 border-b border-[#EDE4D8] dark:border-stone-800">
          {/* Language Switcher */}
          <div className="inline-flex rounded-full bg-[#EFE7DC] dark:bg-stone-800 p-0.5 border border-[#EDE4D8] dark:border-stone-700 text-xs">
            {[
              { code: "en" as const, label: "EN" },
              { code: "hi" as const, label: "हिंदी" },
              { code: "gu" as const, label: "ગુજરાતી" },
            ].map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => {
                  triggerHaptic("light");
                  setSelectedLang(l.code);
                }}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all ${
                  selectedLang === l.code
                    ? "bg-[#5A351F] text-white shadow-2xs"
                    : "text-[#776B62] dark:text-stone-400 hover:text-[#241B16]"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-full bg-[#EFE7DC] dark:bg-stone-800 flex items-center justify-center text-[#776B62] dark:text-stone-300 hover:bg-[#E2D6C6] transition-colors"
            id="button-close-voice-order"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Central State Container */}
        <div className="py-6 text-center space-y-4">
          {/* Microphone Visual with 3 Concentric Expanding Rings */}
          <div className="relative flex items-center justify-center h-28 my-1">
            {voiceState === "LISTENING" && (
              <>
                <div className="absolute w-24 h-24 rounded-full border border-amber-600/30 voice-ring-1 pointer-events-none" />
                <div className="absolute w-24 h-24 rounded-full border border-[#5A351F]/25 voice-ring-2 pointer-events-none" />
                <div className="absolute w-24 h-24 rounded-full border border-amber-600/15 voice-ring-3 pointer-events-none" />
              </>
            )}

            {voiceState === "PROCESSING" && (
              <div className="absolute w-24 h-24 rounded-full border border-amber-600/40 animate-spin border-t-transparent pointer-events-none" />
            )}

            <button
              type="button"
              onClick={voiceState === "LISTENING" ? handleStopListening : handleStartListening}
              className={`relative z-10 flex h-20 w-20 items-center justify-center rounded-full shadow-lg transition-all duration-300 ${
                voiceState === "LISTENING"
                  ? "bg-[#5A351F] text-white scale-105 ring-4 ring-amber-600/30 shadow-amber-900/20"
                  : voiceState === "PROCESSING"
                  ? "bg-amber-800/80 text-white scale-98"
                  : "bg-white dark:bg-stone-800 border-2 border-[#EDE4D8] dark:border-stone-700 text-[#5A351F] dark:text-[#C99A55] hover:bg-[#FAF7F2] active:scale-95"
              }`}
              id="button-voice-mic-main"
              aria-label={voiceState === "LISTENING" ? "Listening" : "Start speaking"}
            >
              <Mic className="h-8 w-8 stroke-[2.2]" />
            </button>
          </div>

          {/* Status Label & Microcopy */}
          <div className="space-y-1">
            {voiceState === "LISTENING" ? (
              <>
                <h4 className="font-serif text-lg font-bold text-[#241B16] dark:text-[#F7F4F0]">
                  Listening...
                </h4>
                <p className="text-xs text-[#776B62] dark:text-stone-400 font-medium">
                  "Tell me what you'd like"
                </p>
                {/* 5 Subtle Wave Dots */}
                <div className="flex items-center justify-center gap-1.5 pt-2">
                  {[0, 150, 300, 450, 600].map((delay, idx) => (
                    <span
                      key={idx}
                      className="h-1.5 w-1.5 rounded-full bg-[#5A351F] dark:bg-[#C99A55] animate-bounce"
                      style={{ animationDelay: `${delay}ms`, animationDuration: "1s" }}
                    />
                  ))}
                </div>
              </>
            ) : voiceState === "PROCESSING" ? (
              <>
                <h4 className="font-serif text-lg font-bold text-[#241B16] dark:text-[#F7F4F0]">
                  Understanding...
                </h4>
                <p className="text-xs text-[#776B62] dark:text-stone-400">
                  Matching dishes with current menu
                </p>
              </>
            ) : voiceState === "RESULT" ? (
              <div className="text-left space-y-2.5">
                {transcript && (
                  <div className="rounded-xl bg-[#EFE7DC]/60 dark:bg-stone-800/60 p-2.5 text-xs text-[#776B62] dark:text-stone-300 italic border border-[#EDE4D8] dark:border-stone-700">
                    <span className="not-italic font-bold text-[10px] uppercase tracking-wider block text-[#5A351F] dark:text-[#C99A55] mb-0.5">
                      I heard:
                    </span>
                    "{transcript}"
                  </div>
                )}

                {/* Recognized Dishes Chips */}
                {parseResult && parseResult.items.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1 no-scrollbar">
                    {parseResult.items.map((it, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 rounded-2xl bg-white dark:bg-stone-850 border border-[#EDE4D8] dark:border-stone-800 shadow-2xs text-xs"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`h-2 w-2 rounded-full shrink-0 ${
                                it.veg ? "bg-emerald-600" : "bg-rose-700"
                              }`}
                            />
                            <p className="font-bold text-[#241B16] dark:text-[#F7F4F0] truncate">
                              {it.name}
                            </p>
                          </div>
                          <span className="font-mono text-[11px] text-[#776B62] dark:text-stone-400">
                            {currency}{it.price} each
                          </span>
                        </div>

                        {/* Interactive Quantity Control */}
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center rounded-xl border border-[#EDE4D8] dark:border-stone-700 bg-[#FAF7F2] dark:bg-stone-900">
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(idx, -1)}
                              className="p-1 hover:bg-[#EFE7DC] dark:hover:bg-stone-800 text-[#776B62] rounded-l-xl transition-colors"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="px-2 font-mono text-xs font-bold text-[#241B16] dark:text-[#F7F4F0]">
                              {it.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(idx, 1)}
                              className="p-1 hover:bg-[#EFE7DC] dark:hover:bg-stone-800 text-[#776B62] rounded-r-xl transition-colors"
                              aria-label="Increase quantity"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1 text-stone-400 hover:text-rose-600 transition-colors"
                            aria-label="Remove item"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Did You Mean Candidates (if any) */}
                {parseResult?.possibleMatches && parseResult.possibleMatches.length > 0 && (
                  <div className="rounded-xl border border-amber-300/70 bg-amber-50/50 dark:bg-amber-950/30 p-2.5 text-xs space-y-1.5">
                    <span className="text-[10px] font-bold text-amber-900 dark:text-amber-200 uppercase">
                      Did you mean?
                    </span>
                    {parseResult.possibleMatches.flatMap((m) => m.candidates).slice(0, 2).map((cand) => (
                      <div key={cand.id} className="flex items-center justify-between text-xs">
                        <span className="truncate pr-2 font-medium">{cand.name}</span>
                        <button
                          type="button"
                          onClick={() => handleSelectCandidate(cand)}
                          className="px-2 py-0.5 rounded-lg bg-amber-200/80 dark:bg-amber-900 text-[10px] font-bold text-amber-900 dark:text-amber-100"
                        >
                          + Add {currency}{cand.price}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* IDLE STATE */
              <>
                <h4 className="font-serif text-lg font-bold text-[#241B16] dark:text-[#F7F4F0]">
                  Tap to Speak
                </h4>
                <p className="text-xs text-[#776B62] dark:text-stone-400 max-w-xs mx-auto">
                  {selectedLang === "hi"
                    ? 'उदा. "दो कोल्ड कॉफी और एक समोसा"'
                    : selectedLang === "gu"
                    ? 'દા.ત. "બે કોલ્ડ કોફી અને એક સમોસા"'
                    : 'e.g. "Two Cold Coffees and one Butter Chicken"'}
                </p>
              </>
            )}

            {/* Error Message with Try Again */}
            {errorMessage && (
              <div className="mt-3 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-center space-y-2">
                <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                  {errorMessage}
                </p>
                <button
                  type="button"
                  onClick={handleStartListening}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#5A351F] text-white text-xs font-bold shadow-xs hover:bg-[#472917] active:scale-95 transition-all"
                >
                  <RotateCw className="h-3 w-3" />
                  <span>Try Again</span>
                </button>
              </div>
            )}

            {/* Success Confirmation Notice */}
            {addedNotice && (
              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-center text-xs font-bold text-emerald-800 dark:text-emerald-300 animate-in fade-in">
                ✓ Added to your order
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-2 border-t border-[#EDE4D8] dark:border-stone-800 flex flex-col gap-2">
          {voiceState === "RESULT" && parseResult && parseResult.items.length > 0 && !addedNotice ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleStartListening}
                className="flex-1 h-11 rounded-2xl border-[#EDE4D8] dark:border-stone-700 bg-white dark:bg-stone-800 text-xs font-bold"
              >
                <Mic className="h-3.5 w-3.5 mr-1" />
                <span>Speak More</span>
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={handleConfirmAndAdd}
                className="flex-2 h-11 rounded-2xl bg-[#5A351F] text-white hover:bg-[#472917] font-bold text-xs shadow-sm flex items-center justify-center gap-1.5"
                id="button-voice-add-to-order"
              >
                <Plus className="h-4 w-4" />
                <span>Add to Order · {currency}{currentTotal.toFixed(0)}</span>
              </Button>
            </div>
          ) : voiceState === "LISTENING" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleStopListening}
              className="w-full h-11 rounded-2xl border-[#EDE4D8] dark:border-stone-700 text-xs font-bold text-[#776B62]"
            >
              Cancel
            </Button>
          ) : (
            <div className="flex items-center justify-between text-[11px] text-[#776B62] px-1">
              <span>Natural hands-free voice ordering</span>
              <button
                type="button"
                onClick={onClose}
                className="font-bold underline hover:text-[#241B16]"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default VoiceOrderModal;
