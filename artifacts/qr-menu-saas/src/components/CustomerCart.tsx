import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Plus,
  Minus,
  Trash2,
  Globe,
  ChevronDown,
  Send,
  AlertCircle,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { I18N_STRINGS, type Language } from "@/lib/customerI18n";
import { getFoodImage } from "@/lib/foodImageFallbacks";
import { TablelineSymbol } from "./TablelineLoading";
import { formatTableName } from "@/lib/formatters";
import { haptic, triggerHaptic } from "@/lib/haptics";
import {
  getOrCreateDeviceId,
  getStoredFirstName,
  setStoredFirstName,
  assignDeviceAsHost,
} from "@/lib/groupTab";

export interface ItemModifiers {
  spiceLevel?: "Mild" | "Medium" | "Spicy" | "Extra Spicy";
  prepStyle?: "Standard" | "Less Oil" | "Crispy" | "Extra Sauce";
  dietary?: "Standard" | "Jain (No Onion/Garlic)" | "Gluten Conscious" | "Vegan";
  addOns?: Array<{ name: string; price: number }>;
  specialInstructions?: string;
}

export interface CartItem {
  id: string; // menuItemId or composite key
  menuItemId?: string;
  name: string;
  basePrice?: number;
  price: number;
  quantity: number;
  imageUrl?: string | null;
  specialInstructions?: string;
  modifiers?: ItemModifiers;
  selectedModifiers?: Array<{
    groupId: string;
    groupName: string;
    optionId: string;
    optionName: string;
    price: number;
  }>;
  veg?: boolean;
  isJain?: boolean;
  addedByDiner?: string;
}

interface CustomerCartProps {
  restaurantSlug: string;
  restaurantName?: string;
  tableSlug: string;
  tableId?: string;
  tableNumber: string;
  currency?: string;
  cart: CartItem[];
  isOpen: boolean;
  isDark?: boolean;
  lang?: Language;
  dinerName?: string;
  onUpdateDinerName?: (name: string) => void;
  onClose: () => void;
  onUpdateQuantity: (id: string, delta: number) => void;
  onUpdateInstructions?: (id: string, instructions: string) => void;
  onClearCart: () => void;
  onOrderPlaced: (orderId: string, orderDetails?: any) => void;
  onChangeLanguage?: (lang: Language) => void;
}

export function formatPrice(amount: number | string | undefined | null): string {
  const val = Number(amount) || 0;
  return Number.isInteger(val) ? val.toString() : val.toFixed(2);
}

export function calculateItemUnitTotal(item: CartItem): number {
  if (typeof item.price === "number" && !isNaN(item.price) && item.price > 0) {
    return Math.round(item.price * 100) / 100;
  }
  const base = typeof item.basePrice === "number" && !isNaN(item.basePrice) ? item.basePrice : 0;
  const mods = (Array.isArray(item.selectedModifiers) && item.selectedModifiers.length > 0)
    ? item.selectedModifiers.reduce((acc, m) => acc + (Number(m.price) || 0), 0)
    : (Array.isArray(item.modifiers?.addOns)
      ? item.modifiers.addOns.reduce((acc, a) => acc + (Number(a.price) || 0), 0)
      : 0);
  return Math.round((base + mods) * 100) / 100;
}

export function CustomerCart({
  restaurantSlug,
  restaurantName,
  tableSlug,
  tableId,
  tableNumber,
  currency = "₹",
  cart,
  isOpen,
  isDark = false,
  lang = "en",
  dinerName = "Guest",
  onClose,
  onUpdateQuantity,
  onClearCart,
  onOrderPlaced,
  onChangeLanguage,
}: CustomerCartProps) {
  const t = I18N_STRINGS[lang] || I18N_STRINGS.en;

  const [customerNote, setCustomerNote] = useState("");
  const [editingItemNoteId, setEditingItemNoteId] = useState<string | null>(null);
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [firstName, setFirstName] = useState(() => getStoredFirstName() || (dinerName !== "Guest" ? dinerName : ""));
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const activeIdempotencyKeyRef = useRef<string>("");

  useEffect(() => {
    // Reset idempotency key when cart contents change
    activeIdempotencyKeyRef.current = "";
  }, [cart]);

  // Clean body scroll lock on open/close
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isOpen]);

  const cartItems = cart || [];
  const subtotal = Math.round(
    cartItems.reduce((acc, item) => acc + calculateItemUnitTotal(item) * item.quantity, 0) * 100
  ) / 100;

  // Authoritative tax calculation: 5% GST matching server
  const taxes = Math.round(subtotal * 0.05 * 100) / 100;
  const grandTotal = Math.round((subtotal + taxes) * 100) / 100;
  const totalItems = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  const displayName = restaurantName || "THE ROAST ROOM";
  const formattedTable = formatTableName(tableNumber);

  const handlePlaceOrder = async () => {
    if (cart.length === 0 || submitting) return;

    const t0 = Date.now();
    console.log(`[ORDER_FLOW] Confirm clicked at ${t0}`);

    setSubmitting(true);
    setError(null);
    setNameError(null);

    try {
      try {
        haptic("medium");
      } catch {}

      // Use entered name, dinerName prop, or fallback to Table Guest (never block!)
      const cleanFirstName = firstName.trim() || dinerName.trim() || getStoredFirstName() || "Table Guest";
      setStoredFirstName(cleanFirstName);

      const storedToken =
        sessionStorage.getItem(`table_session_${restaurantSlug}_${tableId || tableSlug}`) ||
        sessionStorage.getItem(`table_session_${restaurantSlug}`);

      const clientDeviceId = getOrCreateDeviceId();

      if (!activeIdempotencyKeyRef.current) {
        activeIdempotencyKeyRef.current = `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      }

      // Direct Order Placement for all diners & table guests (no host approval blocker)
      const orderPayload = {
        items: cart.map((item) => {
          const unitPrice = calculateItemUnitTotal(item);
          return {
            menuItemId: item.menuItemId || item.id.split("___")[0],
            name: item.name,
            price: unitPrice,
            quantity: item.quantity,
            specialInstructions: itemNotes[item.id]?.trim() || item.specialInstructions?.trim() || item.modifiers?.specialInstructions?.trim() || null,
            modifiers: item.modifiers || null,
            selectedModifiers: item.selectedModifiers || [],
            addedByDiner: cleanFirstName,
          };
        }),
        customerNote: customerNote.trim() || undefined,
        paymentMethod: "PAY_LATER",
        tableSessionToken: storedToken || undefined,
        dinerFirstName: cleanFirstName,
        deviceId: clientDeviceId,
        idempotencyKey: activeIdempotencyKeyRef.current,
      };

      console.log(`[ORDER_FLOW] Submitting order payload for table ${tableSlug}...`);

      const abortController = new AbortController();
      const abortTimeout = setTimeout(() => {
        abortController.abort();
      }, 15000);

      let res: Response;
      try {
        res = await fetch(
          `/api/public/menu/${restaurantSlug}/table/${tableSlug}/orders`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(orderPayload),
            signal: abortController.signal,
          }
        );
      } finally {
        clearTimeout(abortTimeout);
      }

      console.log(`[ORDER_FLOW] Response received: ${Date.now() - t0}ms (status: ${res.status})`);

      const data = await res.json();
      if (res.ok && data.id) {
        if (data.tableSessionToken) {
          sessionStorage.setItem(`table_session_${restaurantSlug}_${tableId || tableSlug}`, data.tableSessionToken);
          sessionStorage.setItem(`table_session_${restaurantSlug}`, data.tableSessionToken);
        }

        // Instant local host marker (non-blocking)
        try {
          assignDeviceAsHost(restaurantSlug, tableId || tableSlug, tableNumber, cleanFirstName);
        } catch {
          // Ignore
        }

        activeIdempotencyKeyRef.current = "";
        try {
          haptic("success");
        } catch {}
        onClearCart();
        onClose();
        onOrderPlaced(data.id, data);
      } else {
        try {
          haptic("error");
        } catch {}
        activeIdempotencyKeyRef.current = "";
        const errorMsg =
          data.error ||
          data.message ||
          "Could not place order. Please check with your server.";
        setError(errorMsg);
      }
    } catch (err: any) {
      try {
        haptic("error");
      } catch {}
      activeIdempotencyKeyRef.current = "";
      if (err.name === "AbortError") {
        setError("Order request timed out. Please check your connection and tap Confirm Order again.");
      } else {
        setError(err.message || "Network connection issue. Please check your connection and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 bg-black/60 backdrop-blur-xs select-none"
          id="customer-cart-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              onClose();
            }
          }}
        >
          <motion.div
            key="customer-cart-motion-sheet"
            initial={{ y: "100%", opacity: 0.95 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 350 }}
            drag="y"
            dragDirectionLock
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 300) {
                triggerHaptic("light");
                onClose();
              }
            }}
            className={`w-full max-w-md max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-stone-200/90 dark:border-stone-800 shadow-2xl overflow-hidden transition-colors relative ${
              isDark ? "bg-[#1c1917] text-[#fafaf9]" : "bg-[#fafaf9] text-[#1c1917]"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Drag Handle */}
            <div
              className="w-full pt-3 pb-2 flex justify-center cursor-grab active:cursor-grabbing touch-none select-none"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              title="Tap or drag down to close"
            >
              <div className="w-12 h-1.5 rounded-full bg-stone-300 dark:bg-stone-700 hover:bg-stone-400 transition-colors" />
            </div>

        {/* ELEGANT CART HEADER (Section 20) */}
        <div className="px-6 pt-2 pb-3.5 border-b border-stone-200/70 dark:border-stone-800 flex items-start justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400 block font-sans">
              {displayName}
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <h2 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-[#1c1917] dark:text-white">
                Your Order
              </h2>
              <span className="text-xs text-stone-500 font-sans tabular-nums font-semibold">
                · {formattedTable}
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-0.5 font-sans tabular-nums">
              {totalItems} {totalItems === 1 ? "item" : "items"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Language Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setLangDropdownOpen((prev) => !prev)}
                className="h-8 px-2.5 rounded-full border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs font-semibold text-[#1c1917] dark:text-stone-200 flex items-center gap-1 shadow-2xs hover:bg-stone-50"
                id="button-cart-lang"
              >
                <Globe className="h-3.5 w-3.5 text-stone-500" />
                <span className="text-[11px] font-bold uppercase">{lang}</span>
                <ChevronDown className="h-3 w-3 text-stone-400" />
              </button>

              {langDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLangDropdownOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 w-32 rounded-2xl border border-stone-200 bg-white dark:bg-stone-900 p-1.5 shadow-xl z-50">
                    {[
                      { code: "en", label: "English" },
                      { code: "hi", label: "हिंदी" },
                      { code: "gu", label: "ગુજરાતી" },
                    ].map((item) => (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => {
                          if (onChangeLanguage) onChangeLanguage(item.code as Language);
                          setLangDropdownOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-xs font-medium ${
                          lang === item.code ? "bg-[#1c1917] text-white font-bold" : "hover:bg-stone-100"
                        }`}
                      >
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-full border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-600 hover:text-[#1c1917] flex items-center justify-center shadow-2xs"
              id="button-close-cart"
              aria-label="Close cart"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* CART ITEMS BODY (Receipt-Style with Subtle Dividers - Section 17 & 19) */}
        <div className="flex-1 overflow-y-auto no-scrollbar scrollbar-none px-6 py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {cart.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <p className="font-serif text-lg font-bold text-stone-600">
                Your order is empty
              </p>
              <p className="text-xs text-stone-400">
                Explore our dishes to start dining.
              </p>
              <Button
                type="button"
                onClick={onClose}
                className="rounded-full bg-[#1c1917] text-white text-xs font-bold px-6 h-10 hover:bg-stone-800"
              >
                Browse Menu
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-stone-200/70">
              {cart.map((item) => {
                const itemTotal = calculateItemUnitTotal(item) * item.quantity;
                const unitPrice = calculateItemUnitTotal(item);
                const customNote = itemNotes[item.id] || item.specialInstructions || item.modifiers?.specialInstructions;
                const isEditingNote = editingItemNoteId === item.id;

                const modifierSummary =
                  item.selectedModifiers && item.selectedModifiers.length > 0
                    ? item.selectedModifiers.map((m) => m.optionName).join(", ")
                    : item.modifiers?.spiceLevel
                    ? `${item.modifiers.spiceLevel} spice`
                    : null;

                return (
                  <div key={item.id} className="py-3.5 space-y-1.5 first:pt-0" id={`cart-item-${item.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      {/* Left: Dish Name & Unit Price */}
                      <div className="flex-1 min-w-0 pr-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`h-3 w-3 rounded-[3px] border border-stone-300 p-0.5 shrink-0 flex items-center justify-center bg-white ${
                              item.veg ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            <span
                              className={`block h-1.5 w-1.5 rounded-full ${
                                item.veg ? "bg-emerald-600" : "bg-rose-600"
                              }`}
                            />
                          </span>
                          <h4 className="font-serif font-bold text-sm text-[#1c1917] truncate">
                            {item.name}
                          </h4>
                        </div>

                        <div className="text-xs font-sans tabular-nums text-stone-500 mt-0.5">
                          {item.quantity} × {currency}{formatPrice(unitPrice)}
                        </div>

                        {modifierSummary && (
                          <div className="text-[11px] text-stone-500 mt-0.5">
                            {modifierSummary}
                          </div>
                        )}

                        {/* SPECIAL REQUEST INLINE (Section 18) */}
                        {customNote && !isEditingNote && (
                          <div className="mt-1 text-[11px] text-amber-900 bg-amber-50/80 px-2 py-0.5 rounded-md inline-flex items-center gap-1 border border-amber-200/60">
                            <span className="font-semibold">Special request:</span>
                            <span>{customNote}</span>
                          </div>
                        )}

                        {/* Inline special request input */}
                        {isEditingNote && (
                          <div className="mt-2 flex items-center gap-2">
                            <input
                              type="text"
                              autoFocus
                              value={itemNotes[item.id] || ""}
                              onChange={(e) => setItemNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                              placeholder="e.g. Less spicy, no ice"
                              className="text-xs h-7 px-2 rounded-lg border border-stone-300 bg-white flex-1 outline-none focus:border-[#1c1917]"
                            />
                            <button
                              type="button"
                              onClick={() => setEditingItemNoteId(null)}
                              className="text-xs font-bold text-[#1c1917] px-2 py-1 rounded bg-stone-100 hover:bg-stone-200"
                            >
                              Done
                            </button>
                          </div>
                        )}

                        {!customNote && !isEditingNote && (
                          <button
                            type="button"
                            onClick={() => setEditingItemNoteId(item.id)}
                            className="mt-1 text-[10.5px] text-stone-400 hover:text-stone-700 flex items-center gap-1 font-medium"
                          >
                            <MessageSquare className="h-3 w-3" />
                            <span>Add special request</span>
                          </button>
                        )}
                      </div>

                      {/* Right: Item Total & Stepper */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="font-sans tabular-nums tracking-tight text-sm font-bold text-[#1c1917]">
                          {currency}{formatPrice(itemTotal)}
                        </span>

                        {/* Stepper [ − 1 + ] */}
                        <div className="flex items-center rounded-xl border border-stone-200 bg-white px-1 py-0.5 shadow-2xs">
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic("light");
                              onUpdateQuantity(item.id, -1);
                            }}
                            className="h-6 w-6 flex items-center justify-center text-stone-600 hover:text-black active:scale-85"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-3 w-3 stroke-[2.5]" />
                          </button>
                          <span className="w-5 text-center font-bold text-xs font-sans tabular-nums text-[#1c1917]">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic("light");
                              onUpdateQuantity(item.id, 1);
                            }}
                            className="h-6 w-6 flex items-center justify-center text-stone-600 hover:text-black active:scale-85"
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-3 w-3 stroke-[2.5]" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {cart.length > 0 && (
            <>
              {/* + Add More Items Link */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="text-xs font-bold text-stone-600 hover:text-[#1c1917] flex items-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add more dishes</span>
                </button>
              </div>

              {/* First Name Field */}
              <div className="pt-3 border-t border-stone-200/80 space-y-1.5">
                <label
                  htmlFor="customer-first-name-input"
                  className="text-xs font-bold text-[#1c1917] flex items-center justify-between"
                >
                  <span>Diner First Name</span>
                  <span className="text-[10px] text-stone-400 font-normal">Identifies your table ticket</span>
                </label>
                <input
                  id="customer-first-name-input"
                  type="text"
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  placeholder="e.g. Vivek"
                  maxLength={30}
                  className={`w-full h-10 px-3.5 rounded-xl border text-xs font-semibold outline-none transition-all ${
                    nameError
                      ? "border-rose-400 bg-rose-50/50 text-rose-900"
                      : "border-stone-200 bg-white text-[#1c1917] focus:border-[#1c1917]"
                  }`}
                />
                {nameError && (
                  <p className="text-[11px] font-medium text-rose-600">
                    {nameError}
                  </p>
                )}
              </div>

              {/* CART TOTALS (Section 21) */}
              <div className="pt-4 border-t border-stone-200/80 space-y-2 font-sans">
                <div className="flex items-center justify-between text-xs text-stone-500">
                  <span>Subtotal</span>
                  <span className="tabular-nums font-semibold text-[#1c1917]">
                    {currency}{formatPrice(subtotal)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-stone-500">
                  <span>Taxes &amp; Charges (5%)</span>
                  <span className="tabular-nums font-semibold text-[#1c1917]">
                    {currency}{formatPrice(taxes)}
                  </span>
                </div>

                <div className="h-px bg-stone-200/80 my-1" />

                <div className="flex items-center justify-between text-sm font-bold text-[#1c1917]">
                  <span className="font-serif">Total</span>
                  <span className="tabular-nums text-base font-extrabold text-[#1c1917]">
                    {currency}{formatPrice(grandTotal)}
                  </span>
                </div>
              </div>

              {/* DOMINANT PRIMARY CTA: [ Send to Kitchen · ₹1,008 → ] (Section 22) */}
              <div className="pt-3 pb-2 space-y-2">
                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium animate-in fade-in">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                    <span>{error}</span>
                  </div>
                )}
                <Button
                  type="button"
                  disabled={submitting || cart.length === 0}
                  onClick={handlePlaceOrder}
                  className="w-full h-13 rounded-2xl font-bold text-sm bg-[#1c1917] hover:bg-stone-800 text-white shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50"
                  id="button-cart-confirm-order"
                >
                  {submitting ? (
                    <span className="inline-flex items-center gap-2">
                      <TablelineSymbol size="xs" className="text-white" />
                      <span>Confirming Order...</span>
                    </span>
                  ) : (
                    <>
                      <span>Confirm Order</span>
                      <span className="font-sans tabular-nums font-bold">· {currency}{formatPrice(grandTotal)}</span>
                      <span>→</span>
                    </>
                  )}
                </Button>
                <p className="text-[11px] text-center text-stone-400 font-sans">
                  Your order will be sent to the restaurant for confirmation.
                </p>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
      )}
    </AnimatePresence>
  );
}

export default CustomerCart;
