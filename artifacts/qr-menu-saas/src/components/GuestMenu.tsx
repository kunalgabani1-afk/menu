import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Search,
  X,
  Sparkles,
  ShoppingBag,
  ChevronDown,
  ChevronUp,
  Clock,
  Check,
  Plus,
  Minus,
  ArrowRight,
  Compass,
  Users,
  CheckCircle2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Fuse from "fuse.js";
import { triggerHaptic } from "@/lib/haptics";
import { useMenuNavigation } from "@/hooks/useMenuNavigation";
import { useMultiplayerCart, type MultiplayerCartItem } from "@/hooks/useMultiplayerCart";
import { ItemCard, type MenuItemCardData } from "./ItemCard";
import { BottomSheet } from "./ui/BottomSheet";
import { Button } from "@/components/ui/button";
import { GuestLayout } from "./GuestLayout";
import { type GuestTabKey } from "./BottomNav";
import { KitchenTracker } from "./KitchenTracker";
import { GuestBill } from "./GuestBill";
import { ServiceSheet } from "./ServiceSheet";
import { CartSheet } from "./CartSheet";

export interface GuestMenuCategory {
  id: string;
  name: string;
  description?: string;
  sortOrder?: number;
}

export interface GuestMenuItem extends MenuItemCardData {
  categoryId: string;
  ingredients?: string[];
  tags?: string[];
  modifierGroups?: Array<{
    id: string;
    name: string;
    options: Array<{ id: string; name: string; price: number }>;
  }>;
}

interface GuestMenuProps {
  restaurantSlug: string;
  restaurantName: string;
  tableNumber: string;
  currency?: string;
  categories: GuestMenuCategory[];
  items: GuestMenuItem[];
  isLoading?: boolean;
  dinerName?: string;
  onProceedToCheckout?: (cart: MultiplayerCartItem[]) => void;
  onConfirmOrder?: (cart: MultiplayerCartItem[]) => Promise<void> | void;
  videoHeroUrl?: string;
  onCallWaiter?: (serviceType: string) => void;
  activeOrder?: {
    id: string;
    orderNumber?: number | string;
    status?: string;
    total?: number;
    itemsCount?: number;
    items?: any[];
  } | null;
  onTrackOrder?: (orderId: string) => void;
  onToggleViewMode?: () => void;
  currentViewMode?: "rich" | "compact";
  lang?: string;
  onChangeLanguage?: (lang: string) => void;
}

export function GuestMenu({
  restaurantSlug,
  restaurantName = "The Roasted Bean Cafe",
  tableNumber = "04",
  currency = "₹",
  categories = [],
  items = [],
  isLoading = false,
  dinerName = "Guest",
  onProceedToCheckout,
  onConfirmOrder,
  videoHeroUrl = "/assets/hero-coffee-pour.mp4",
  onCallWaiter,
  activeOrder,
  onTrackOrder,
  onToggleViewMode,
  currentViewMode = "rich",
  lang = "en",
  onChangeLanguage,
}: GuestMenuProps) {
  // Navigation: Active Tab (Menu | Orders | Bill)
  const [activeTab, setActiveTab] = useState<GuestTabKey>("menu");
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  // Search query & dietary filter
  const [searchQuery, setSearchQuery] = useState("");
  const [dietaryFilter, setDietaryFilter] = useState<"ALL" | "VEG" | "NON_VEG" | "JAIN">("ALL");

  // Table Service Assistance Sheet State (Layered with Z-Index higher than BottomNav)
  const [isWaiterCallSheetOpen, setIsWaiterCallSheetOpen] = useState(false);
  const [reorderNotice, setReorderNotice] = useState<string | null>(null);

  // Jump to Section Category Overlay (Triggered by bottom nav "Menu" tab)
  const [isJumpPillOpen, setIsJumpPillOpen] = useState(false);

  // Customizer Bottom Sheet State
  const [customizingItem, setCustomizingItem] = useState<GuestMenuItem | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<
    Array<{ groupName: string; optionName: string; price: number }>
  >([]);
  const [specialInstructions, setSpecialInstructions] = useState("");

  // Shared Cart State (Multiplayer Firestore Layer)
  const {
    cartItems,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    subtotal,
    taxes,
    grandTotal,
    totalItemsCount,
    activeDiners,
    quantityMap,
    addedByMap,
    isLiveConnected,
  } = useMultiplayerCart({
    restaurantSlug,
    tableNumber,
    currentDinerName: dinerName,
  });

  // Cart Review Bottom Sheet State
  const [isCartSheetOpen, setIsCartSheetOpen] = useState(false);

  // Navigation: Dayparting, Scroll-Spy & Smart Auto-Collapsing Accordions
  const {
    daypartInfo,
    sortedCategories,
    activeCategoryId,
    openCategoryIds,
    toggleCategory,
    scrollToCategory,
    pillBarRef,
  } = useMenuNavigation({
    categories,
    isSearchActive: searchQuery.trim().length > 0,
  });

  // Typo-Tolerant Fuzzy Search Engine (fuse.js)
  const fuse = useMemo(() => {
    return new Fuse(items, {
      keys: [
        { name: "name", weight: 0.7 },
        { name: "description", weight: 0.3 },
        { name: "tags", weight: 0.4 },
        { name: "ingredients", weight: 0.2 },
      ],
      threshold: 0.35, // High typo tolerance (matches "Mochha" -> "Mocha")
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
  }, [items]);

  // Filtered items based on search and dietary preferences
  const searchedItems = useMemo(() => {
    let result = items;

    if (searchQuery.trim().length >= 2) {
      result = fuse.search(searchQuery.trim()).map((res) => res.item);
    }

    if (dietaryFilter === "VEG") {
      result = result.filter((i) => i.veg !== false);
    } else if (dietaryFilter === "NON_VEG") {
      result = result.filter((i) => i.veg === false);
    } else if (dietaryFilter === "JAIN") {
      result = result.filter((i) => i.isJain === true);
    }

    return result;
  }, [items, searchQuery, dietaryFilter, fuse]);

  // Group items by category
  const itemsByCategory = useMemo(() => {
    const map = new Map<string, GuestMenuItem[]>();
    searchedItems.forEach((item) => {
      const list = map.get(item.categoryId) || [];
      list.push(item);
      map.set(item.categoryId, list);
    });
    return map;
  }, [searchedItems]);

  // Running Bill Calculations (from real active order or session items)
  const billItems = useMemo(() => {
    if (activeOrder?.items && Array.isArray(activeOrder.items) && activeOrder.items.length > 0) {
      return activeOrder.items.map((it: any, idx: number) => ({
        id: it.id || `bill-it-${idx}`,
        name: it.name,
        quantity: Number(it.quantity) || 1,
        price: Number(it.price) || 0,
        modifiers: it.modifiers || it.selectedModifiers?.map((m: any) => m.optionName || m),
        status: it.status,
      }));
    }
    return [];
  }, [activeOrder]);

  const billSubtotal = useMemo(() => {
    if (activeOrder?.total) {
      return Math.round((activeOrder.total / 1.05) * 100) / 100;
    }
    return billItems.reduce((acc: number, item: any) => acc + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0);
  }, [activeOrder, billItems]);

  const billCgst = useMemo(() => Math.round(billSubtotal * 0.025 * 100) / 100, [billSubtotal]);
  const billSgst = useMemo(() => Math.round(billSubtotal * 0.025 * 100) / 100, [billSubtotal]);
  const billGrandTotal = useMemo(() => {
    if (activeOrder?.total) return Math.round(activeOrder.total);
    return Math.round(billSubtotal + billCgst + billSgst);
  }, [activeOrder, billSubtotal, billCgst, billSgst]);

  // Handle Tab Switch (Strictly closes all open sheets & modals before route changes)
  const handleTabChange = (tab: GuestTabKey) => {
    setIsCartSheetOpen(false);
    setIsWaiterCallSheetOpen(false);
    setIsJumpPillOpen(false);
    setCustomizingItem(null);
    setActiveTab(tab);
  };

  // Handlers for Customizer Bottom Sheet
  const handleOpenCustomizer = (item: MenuItemCardData) => {
    const fullItem = items.find((i) => i.id === item.id) || (item as GuestMenuItem);
    setCustomizingItem(fullItem);
    setSelectedModifiers([]);
    setSpecialInstructions("");
  };

  const handleConfirmCustomization = () => {
    if (!customizingItem) return;
    addItem({
      id: customizingItem.id,
      name: customizingItem.name,
      price: customizingItem.price,
      imageUrl: customizingItem.imageUrl,
      veg: customizingItem.veg,
      isJain: customizingItem.isJain,
      selectedModifiers,
      specialInstructions: specialInstructions.trim() || undefined,
    });
    setCustomizingItem(null);
  };

  const handleCheckoutClick = () => {
    triggerHaptic("doubleTick");
    setIsCartSheetOpen(true);
  };

  const handleConfirmAndPlaceOrder = async () => {
    if (cartItems.length === 0) return;
    setIsSubmittingOrder(true);
    try {
      if (onConfirmOrder) {
        await onConfirmOrder(cartItems);
      } else if (onProceedToCheckout) {
        onProceedToCheckout(cartItems);
      }
      clearCart();
      setIsCartSheetOpen(false);
      setActiveTab("orders");
      triggerHaptic("success");
    } catch {
      // Handled by parent
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // SKELETON LOADING STATE (Module 4)
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#fafaf9] dark:bg-[#141211] text-[#1c1917] dark:text-[#fafaf9] pb-24">
        {/* Shimmering Hero Skeleton */}
        <div className="w-full h-64 bg-stone-300 dark:bg-stone-800 animate-pulse relative" />
        <div className="max-w-2xl mx-auto px-4 -mt-6 space-y-4">
          <div className="h-12 bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 animate-pulse shadow-sm" />
          <div className="flex gap-2 overflow-hidden py-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-8 w-24 rounded-full bg-stone-200 dark:bg-stone-800 animate-pulse shrink-0" />
            ))}
          </div>
          <div className="space-y-3 pt-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-4 flex gap-4 animate-pulse">
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 bg-stone-200 dark:bg-stone-800 rounded" />
                  <div className="h-3 w-1/2 bg-stone-200 dark:bg-stone-800 rounded" />
                  <div className="h-4 w-16 bg-stone-300 dark:bg-stone-700 rounded mt-4" />
                </div>
                <div className="h-20 w-20 bg-stone-200 dark:bg-stone-800 rounded-2xl shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <GuestLayout
      restaurantName={restaurantName}
      tableNumber={tableNumber}
      videoHeroUrl={videoHeroUrl}
      daypartBadge={daypartInfo.badge}
      daypartSubtitle={daypartInfo.subtitle}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      lang={lang}
      onChangeLanguage={onChangeLanguage}
      onCallServiceClick={() => setIsWaiterCallSheetOpen(true)}
      activeTab={activeTab}
      onSelectTab={handleTabChange}
      onTriggerJumpMenu={() => setIsJumpPillOpen(true)}
      totalCartItemsCount={totalItemsCount}
      cartGrandTotal={grandTotal}
      currency={currency}
      onOpenCartClick={() => setIsCartSheetOpen(true)}
      ordersBadgeCount={activeOrder ? 1 : 0}
      billTotal={billGrandTotal}
      hasActiveOrders={Boolean(activeOrder)}
    >
      {/* ======================================================== */}
      {/* TAB 1: MENU VIEW                                         */}
      {/* ======================================================== */}
      {activeTab === "menu" && (
        <div className="space-y-4">
          {/* Dietary Filter Pills */}
          <div className="flex items-center gap-2 px-1 overflow-x-auto no-scrollbar pb-0.5 select-none">
            <button
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                setDietaryFilter("ALL");
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 ${
                dietaryFilter === "ALL"
                  ? "bg-[#1c1917] text-[#fafaf9] shadow-sm"
                  : "bg-white/90 dark:bg-stone-900 border border-[#ede4d8] dark:border-stone-800 text-[#776b62]"
              }`}
            >
              All Items
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                setDietaryFilter("VEG");
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                dietaryFilter === "VEG"
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "bg-white/90 dark:bg-stone-900 border border-[#ede4d8] dark:border-stone-800 text-emerald-800 dark:text-emerald-400"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Veg Only
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                setDietaryFilter("NON_VEG");
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                dietaryFilter === "NON_VEG"
                  ? "bg-rose-700 text-white shadow-sm"
                  : "bg-white/90 dark:bg-stone-900 border border-[#ede4d8] dark:border-stone-800 text-rose-800 dark:text-rose-400"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-rose-600" />
              Non-Veg
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                setDietaryFilter("JAIN");
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                dietaryFilter === "JAIN"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "bg-white/90 dark:bg-stone-900 border border-[#ede4d8] dark:border-stone-800 text-amber-800 dark:text-amber-400"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Jain
            </button>

            {/* Multiplayer Party Status Pill */}
            {isLiveConnected && (
              <span className="ml-auto shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-800">
                <Users className="h-3 w-3" />
                Live Table
              </span>
            )}
          </div>

          {/* Sticky Scroll-Spy Category Bar */}
          {!searchQuery && (
            <div className="sticky top-0 z-30 bg-[#fafaf9]/95 dark:bg-[#141211]/95 backdrop-blur-md pt-2 pb-2 -mx-4 px-4 border-b border-[#ede4d8]/80 dark:border-stone-800/80">
              <div
                ref={pillBarRef}
                className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth"
              >
                {sortedCategories.map((cat) => {
                  const isActive = activeCategoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      data-pill-id={cat.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        scrollToCategory(cat.id);
                      }}
                      className={`h-9 px-4 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 ${
                        isActive
                          ? "bg-[#1c1917] text-white shadow-xs ring-2 ring-[#1c1917]/20 dark:bg-amber-500 dark:text-stone-950 dark:ring-amber-500/20"
                          : "bg-white dark:bg-stone-900 border border-[#ede4d8] dark:border-stone-800 text-[#776b62] dark:text-stone-400 hover:text-[#1c1917]"
                      }`}
                    >
                      <span>{cat.name}</span>
                      <span
                        className={`text-[10px] font-sans tabular-nums px-1.5 py-0.2 rounded-full ${
                          isActive ? "bg-white/20 dark:bg-black/20" : "bg-stone-100 dark:bg-stone-800"
                        }`}
                      >
                        {itemsByCategory.get(cat.id)?.length || 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Smart Auto-Collapsing Accordions */}
          <div className="space-y-4 pt-1">
            {sortedCategories.map((cat) => {
              const catItems = itemsByCategory.get(cat.id) || [];
              if (catItems.length === 0 && searchQuery) return null;

              const isOpen = openCategoryIds.has(cat.id) || searchQuery.trim().length > 0;

              return (
                <section
                  key={cat.id}
                  id={`category-section-${cat.id}`}
                  data-category-id={cat.id}
                  className="scroll-mt-28"
                >
                  {/* Accordion Header */}
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic("selection");
                      toggleCategory(cat.id);
                    }}
                    className="w-full flex items-center justify-between py-2 px-1 text-left select-none group"
                  >
                    <div className="flex items-center gap-2">
                      <h2 className="font-serif text-lg sm:text-xl font-bold text-[#1c1917] dark:text-[#fafaf9] group-hover:text-amber-900 dark:group-hover:text-amber-300 transition-colors">
                        {cat.name}
                      </h2>
                      <span className="font-sans tabular-nums text-xs font-bold px-2 py-0.5 rounded-full bg-stone-200/80 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                        {catItems.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[#8a7d73] text-xs">
                      <span className="hidden sm:inline">
                        {isOpen ? "Collapse" : "Expand"}
                      </span>
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </button>

                  {/* Accordion Items List */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-3 pt-2 pb-3">
                          {catItems.map((item) => (
                            <ItemCard
                              key={item.id}
                              item={item}
                              currency={currency}
                              quantity={quantityMap.get(item.id) || 0}
                              addedByOther={addedByMap.get(item.id)}
                              onAdd={(it) => addItem(it)}
                              onIncrement={(it) => {
                                const cartItem = cartItems.find((c) => c.menuItemId === it.id);
                                if (cartItem) {
                                  updateQuantity(cartItem.cartItemId, 1);
                                } else {
                                  addItem(it);
                                }
                              }}
                              onDecrement={(it) => {
                                const cartItem = cartItems.find((c) => c.menuItemId === it.id);
                                if (cartItem) {
                                  updateQuantity(cartItem.cartItemId, -1);
                                }
                              }}
                              onOpenCustomizer={handleOpenCustomizer}
                            />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
              );
            })}

            {searchedItems.length === 0 && (
              <div className="py-16 text-center text-[#776b62] space-y-2">
                <Search className="h-8 w-8 mx-auto opacity-50" />
                <p className="font-serif font-bold text-base text-[#1c1917] dark:text-[#fafaf9]">
                  No dishes found
                </p>
                <p className="text-xs">
                  Try searching for mocha, sourdough, pizza, or reset dietary filters.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: LIVE 5-STEP KITCHEN ORDER TRACKER (Module 3)      */}
      {/* ======================================================== */}
      {activeTab === "orders" && (
        <KitchenTracker
          orderNumber={activeOrder?.orderNumber}
          tableNumber={tableNumber}
          currency={currency}
          orderStatus={activeOrder?.status || "COOKING"}
          items={
            billItems.length > 0
              ? billItems.map((b) => ({
                  id: b.id || `track-${b.name}`,
                  name: b.name,
                  quantity: b.quantity,
                  price: b.price,
                  modifiers: b.modifiers,
                  status: (b.status as any) || (activeOrder?.status as any) || "COOKING",
                }))
              : undefined
          }
          onBrowseAlternatives={() => handleTabChange("menu")}
          onReorderItem={(it) => {
            addItem({
              id: it.id || `reorder-${Date.now()}`,
              name: it.name,
              price: it.price,
              selectedModifiers: it.modifiers?.map((m) => ({
                groupName: "Add-on",
                optionName: m.replace(/^↳\s*/, ""),
                price: 0,
              })),
            });
            // Immediately pop open the Cart Sheet as requested
            setIsCartSheetOpen(true);
            setReorderNotice(`Added "${it.name}" to your current tab.`);
            setTimeout(() => setReorderNotice(null), 2500);
          }}
        />
      )}

      {/* ======================================================== */}
      {/* TAB 3: RUNNING BILL & PAY AT COUNTER (Module 4)          */}
      {/* ======================================================== */}
      {activeTab === "bill" && (
        <GuestBill
          tableNumber={tableNumber}
          currency={currency}
          items={billItems}
          onRequestFinalBill={() => {
            onCallWaiter?.("BILL");
          }}
          onBrowseMenu={() => handleTabChange("menu")}
        />
      )}

      {/* ======================================================== */}
      {/* JUMP TO SECTION MODAL OVERLAY (Triggered via Menu Tab)   */}
      {/* ======================================================== */}
      <AnimatePresence>
        {isJumpPillOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsJumpPillOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-md"
            />

            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative z-10 w-full max-w-sm bg-[#fafaf9] dark:bg-[#1a1816] rounded-3xl p-5 border border-[#ede4d8] dark:border-stone-800 shadow-2xl space-y-4 max-h-[75vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-[#ede4d8] dark:border-stone-800 pb-3">
                <div className="flex items-center gap-2">
                  <Compass className="h-5 w-5 text-amber-600" />
                  <span className="font-serif font-bold text-lg">Menu Navigation</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsJumpPillOpen(false)}
                  className="p-1 rounded-full text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="overflow-y-auto space-y-1.5 flex-1 pr-1">
                {sortedCategories.map((cat) => {
                  const count = itemsByCategory.get(cat.id)?.length || 0;
                  const isActive = activeCategoryId === cat.id;

                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        setIsJumpPillOpen(false);
                        setActiveTab("menu");
                        scrollToCategory(cat.id);
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-2xl text-left text-xs font-bold transition-colors ${
                        isActive
                          ? "bg-[#1c1917] text-white"
                          : "hover:bg-stone-100 dark:hover:bg-stone-800 text-[#1c1917] dark:text-[#fafaf9]"
                      }`}
                    >
                      <span className="text-sm">{cat.name}</span>
                      <span className="font-sans tabular-nums text-xs opacity-75">
                        {count} items
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ======================================================== */}
      {/* SWIPE-TO-DISMISS CUSTOMIZER BOTTOM SHEET                 */}
      {/* ======================================================== */}
      <BottomSheet
        isOpen={Boolean(customizingItem)}
        onClose={() => setCustomizingItem(null)}
        title={customizingItem?.name}
        subtitle={`${currency}${customizingItem?.price || 0} • Select customizations`}
        footer={
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setCustomizingItem(null)}
              className="flex-1 h-12 rounded-2xl text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmCustomization}
              className="flex-1 h-12 rounded-2xl bg-[#1c1917] hover:bg-[#2a2421] text-white text-xs font-bold"
            >
              Add to Cart
            </Button>
          </div>
        }
      >
        {customizingItem && (
          <div className="space-y-4">
            <p className="text-xs text-[#776b62] dark:text-stone-400">
              {customizingItem.description}
            </p>

            {/* Modifiers List */}
            <div className="space-y-3">
              <h4 className="font-serif font-bold text-sm">Popular Add-ons</h4>
              {[
                { name: "Extra Shot Espresso", price: 60 },
                { name: "Oat Milk Upgrade", price: 40 },
                { name: "Almond Milk", price: 40 },
                { name: "Caramel Drizzle", price: 30 },
                { name: "Vanilla Syrup", price: 30 },
              ].map((addon) => {
                const isSelected = selectedModifiers.some((m) => m.optionName === addon.name);
                return (
                  <button
                    key={addon.name}
                    type="button"
                    onClick={() => {
                      triggerHaptic("selection");
                      setSelectedModifiers((prev) => {
                        if (isSelected) {
                          return prev.filter((m) => m.optionName !== addon.name);
                        } else {
                          return [...prev, { groupName: "Add-ons", optionName: addon.name, price: addon.price }];
                        }
                      });
                    }}
                    className={`w-full flex items-center justify-between p-3.5 rounded-2xl border text-xs font-bold transition-all ${
                      isSelected
                        ? "border-[#1c1917] bg-[#1c1917]/5 dark:border-amber-400 dark:bg-amber-400/10 text-[#1c1917] dark:text-amber-300"
                        : "border-[#ede4d8] dark:border-stone-800 bg-white dark:bg-stone-900 text-[#1c1917] dark:text-[#fafaf9]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-4 w-4 rounded-md border flex items-center justify-center ${
                          isSelected ? "bg-[#1c1917] dark:bg-amber-400 text-white dark:text-stone-950" : "border-stone-400"
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                      </div>
                      <span>{addon.name}</span>
                    </div>
                    <span className="font-sans tabular-nums text-stone-500">
                      +{currency}{addon.price}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Special prep notes */}
            <div>
              <label className="text-xs font-bold text-[#8a7d73] block mb-1">
                Special Instructions (Optional)
              </label>
              <input
                type="text"
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                placeholder="e.g. Less sugar, extra hot"
                className="w-full bg-white dark:bg-stone-900 border border-[#ede4d8] dark:border-stone-800 rounded-xl px-3 py-2 text-xs text-[#1c1917] dark:text-[#fafaf9]"
              />
            </div>
          </div>
        )}
      </BottomSheet>

      {/* ======================================================== */}
      {/* MODULE 1: REFACTORED CART BOTTOM SHEET (Pinned Footer)   */}
      {/* ======================================================== */}
      <CartSheet
        isOpen={isCartSheetOpen}
        onClose={() => setIsCartSheetOpen(false)}
        tableNumber={tableNumber}
        currency={currency}
        items={cartItems}
        subtotal={subtotal}
        taxes={taxes}
        grandTotal={grandTotal}
        totalItemsCount={totalItemsCount}
        activeDinersCount={activeDiners.length}
        onUpdateQuantity={updateQuantity}
        onConfirmOrder={handleConfirmAndPlaceOrder}
        isSubmitting={isSubmittingOrder}
      />

      {/* Module 2: Table Service Assistance Sheet with Z-Index strictly higher than BottomNav */}
      <ServiceSheet
        isOpen={isWaiterCallSheetOpen}
        onClose={() => setIsWaiterCallSheetOpen(false)}
        tableNumber={tableNumber}
        onRequestService={async (type) => {
          onCallWaiter?.(type);
        }}
      />

      {/* Module 3: Repeat Order Feedback Toast Notification */}
      <AnimatePresence>
        {reorderNotice && (
          <motion.div
            initial={{ opacity: 0, y: -24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 450, damping: 30 }}
            className="fixed top-6 inset-x-0 z-50 pointer-events-none px-4 flex justify-center"
          >
            <div className="bg-[#1c1917] text-[#fafaf9] border border-amber-900/60 shadow-[0_10px_35px_rgba(0,0,0,0.4)] px-5 py-3 rounded-2xl flex items-center gap-2.5 text-xs font-bold select-none">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{reorderNotice}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GuestLayout>
  );
}

export default GuestMenu;
