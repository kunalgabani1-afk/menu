import React, { useState, useEffect, useMemo } from "react";
import {
  Smartphone,
  Search,
  Plus,
  Minus,
  Trash2,
  ChefHat,
  CheckCircle2,
  WifiOff,
  Sparkles,
  ShoppingBag,
  ArrowLeft,
  X,
  Clock,
  Check,
  AlertCircle,
  Table as TableIcon,
  ChevronRight,
  Flame,
  Leaf,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getIdToken } from "@/lib/firebase";
import {
  useListCategories,
  useListMenuItems,
  useListTables,
  useGetRestaurantDashboard,
} from "@workspace/api-client-react";
import type { MenuItem } from "@workspace/api-client-react";
import { canUseFeature, normalizePlanId } from "@/lib/plans";
import { TablelineLoader, TablelineSymbol } from "./TablelineLoading";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface CaptainOrderingViewProps {
  slug: string;
  onNavigateTab?: (tab: string) => void;
}

interface CartItem {
  cartItemId: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  specialInstructions?: string;
  selectedVariant?: { id: string; name: string; price: number };
  selectedAddons?: Array<{ id: string; name: string; price: number }>;
}

export function CaptainOrderingView({ slug, onNavigateTab }: CaptainOrderingViewProps) {
  const { toast } = useToast();

  const { data: dashboard, refetch: refetchDashboard } = useGetRestaurantDashboard(slug);
  const { data: categories = [], isLoading: loadingCats } = useListCategories(slug);
  const { data: menuItems = [], isLoading: loadingItems } = useListMenuItems(slug);
  const { data: tables = [], isLoading: loadingTables, refetch: refetchTables } = useListTables(slug);

  const restaurantPlan = normalizePlanId((dashboard as any)?.plan || (dashboard as any)?.restaurant?.plan);
  const isCaptainAllowed = canUseFeature(restaurantPlan, "captain_ordering");

  // Network offline tolerance
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
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

  // Floor Selection
  const [selectedTableId, setSelectedTableId] = useState<string>("");
  const [isTableSelectorOpen, setIsTableSelectorOpen] = useState<boolean>(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [dietaryFilter, setDietaryFilter] = useState<"ALL" | "VEG" | "NON_VEG">("ALL");

  // Cart State (Preserved in memory across network drops)
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(`tableline_captain_cart_${slug}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(`tableline_captain_cart_${slug}`, JSON.stringify(cart));
    } catch {}
  }, [cart, slug]);

  const [orderNote, setOrderNote] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Variant/Addon Customization Modal
  const [customizingItem, setCustomizingItem] = useState<any | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [customizationNote, setCustomizationNote] = useState("");

  // Submitting state & Success Dialog
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<any | null>(null);

  // Resolve selected table object
  const activeTable = useMemo(() => {
    return tables.find((t: any) => String(t.id) === String(selectedTableId)) as any;
  }, [tables, selectedTableId]);

  // If no table selected, default or open selector
  useEffect(() => {
    if (!selectedTableId && tables.length > 0) {
      const firstAvailable = tables.find(
        (t: any) => t.status !== "DEACTIVATED" && t.active !== false,
      );
      if (firstAvailable) {
        setSelectedTableId(String(firstAvailable.id));
      }
    }
  }, [tables, selectedTableId]);

  // Available and active tables
  const availableTables = useMemo(() => {
    return tables.filter((t: any) => t.active !== false && t.status !== "DEACTIVATED");
  }, [tables]);

  // Filtered Menu Items
  const filteredItems = useMemo(() => {
    return menuItems.filter((item: any) => {
      if (selectedCategory !== "ALL" && item.categoryId !== selectedCategory) {
        return false;
      }
      if (dietaryFilter === "VEG" && !(item.veg || item.isVeg)) {
        return false;
      }
      if (dietaryFilter === "NON_VEG" && (item.veg || item.isVeg)) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (item.name || "").toLowerCase().includes(q);
        const descMatch = (item.description || "").toLowerCase().includes(q);
        if (!nameMatch && !descMatch) return false;
      }
      return true;
    });
  }, [menuItems, selectedCategory, dietaryFilter, searchQuery]);

  // Cart Totals calculation
  const cartTotals = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const rawTaxRate = Number((dashboard?.restaurant as any)?.settings?.taxRate ?? (dashboard?.restaurant as any)?.taxRate ?? 5);
    const taxRate = rawTaxRate > 1 ? rawTaxRate / 100 : rawTaxRate < 0 ? 0.05 : rawTaxRate;
    const taxPercentage = rawTaxRate > 1 ? rawTaxRate : Number((rawTaxRate * 100).toFixed(2));
    const taxes = Math.round(subtotal * taxRate * 100) / 100;
    const total = Math.round((subtotal + taxes) * 100) / 100;
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

    return { subtotal, taxes, total, totalItems, taxPercentage };
  }, [cart, dashboard]);

  const currency = (dashboard?.restaurant as any)?.currency || "₹";

  // Handle Quick Add or open customizer
  const handleQuickAdd = (item: any) => {
    const hasVariants = Array.isArray(item.variants) && item.variants.length > 0;
    const hasAddons = Array.isArray(item.addons) && item.addons.length > 0;

    if (hasVariants || hasAddons) {
      setCustomizingItem(item);
      setSelectedVariantId(hasVariants ? String(item.variants[0].id) : "");
      setSelectedAddonIds([]);
      setCustomizationNote("");
      return;
    }

    // Direct add 1
    const cartItemId = `${item.id}-default`;
    setCart((prev) => {
      const existing = prev.find((i) => i.cartItemId === cartItemId);
      if (existing) {
        return prev.map((i) =>
          i.cartItemId === cartItemId ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          cartItemId,
          menuItemId: item.id,
          name: item.name,
          price: Number(item.price || 0),
          quantity: 1,
        },
      ];
    });

    toast({
      title: `Added 1× ${item.name}`,
      duration: 1500,
    });
  };

  const handleAddCustomizedItem = () => {
    if (!customizingItem) return;

    let finalPrice = Number(customizingItem.price || 0);
    let selectedVariantObj: { id: string; name: string; price: number } | undefined;

    if (Array.isArray(customizingItem.variants) && selectedVariantId) {
      const v = (customizingItem.variants as any[]).find(
        (v) => String(v.id) === String(selectedVariantId),
      );
      if (v) {
        finalPrice = Number(v.price ?? finalPrice);
        selectedVariantObj = { id: v.id, name: v.name, price: Number(v.price) };
      }
    }

    const selectedAddonsList: Array<{ id: string; name: string; price: number }> = [];
    if (Array.isArray(customizingItem.addons) && selectedAddonIds.length > 0) {
      for (const addonId of selectedAddonIds) {
        const a = (customizingItem.addons as any[]).find((a) => String(a.id) === String(addonId));
        if (a) {
          finalPrice += Number(a.price || 0);
          selectedAddonsList.push({ id: a.id, name: a.name, price: Number(a.price || 0) });
        }
      }
    }

    const cartItemId = `${customizingItem.id}-${selectedVariantId}-${selectedAddonIds.sort().join("_")}-${customizationNote.trim()}`;

    setCart((prev) => {
      const existing = prev.find((i) => i.cartItemId === cartItemId);
      if (existing) {
        return prev.map((i) =>
          i.cartItemId === cartItemId ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          cartItemId,
          menuItemId: customizingItem.id,
          name: customizingItem.name,
          price: finalPrice,
          quantity: 1,
          selectedVariant: selectedVariantObj,
          selectedAddons: selectedAddonsList.length > 0 ? selectedAddonsList : undefined,
          specialInstructions: customizationNote.trim() || undefined,
        },
      ];
    });

    setCustomizingItem(null);
    toast({
      title: `Added ${customizingItem.name} to order`,
      duration: 1500,
    });
  };

  const handleUpdateQuantity = (cartItemId: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.cartItemId === cartItemId) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const handleRemoveItem = (cartItemId: string) => {
    setCart((prev) => prev.filter((i) => i.cartItemId !== cartItemId));
  };

  // SEND TO KITCHEN with Idempotency Protection
  const handleSendToKitchen = async () => {
    if (!selectedTableId) {
      toast({
        variant: "destructive",
        title: "Please select a table",
        description: "Choose a table before sending the order to the kitchen.",
      });
      setIsTableSelectorOpen(true);
      return;
    }

    if (cart.length === 0) {
      toast({
        variant: "destructive",
        title: "Cart is empty",
        description: "Add items from the menu before sending to the kitchen.",
      });
      return;
    }

    if (!isOnline) {
      toast({
        variant: "destructive",
        title: "Floor Network Offline",
        description: "Your phone is currently disconnected. Reconnecting…",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      // Idempotency token to prevent duplicate orders on double tap
      const captainRequestId = `cap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      headers["Idempotency-Key"] = captainRequestId;

      const payload = {
        tableId: selectedTableId,
        captainRequestId,
        items: cart.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          specialInstructions: item.specialInstructions || undefined,
          selectedVariantId: item.selectedVariant?.id || undefined,
          selectedAddonIds: item.selectedAddons?.map((a) => a.id) || undefined,
        })),
        customerNote: orderNote.trim() || undefined,
        initialStatus: "APPROVED",
        paymentMethod: "PAY_LATER",
        paymentStatus: "PENDING",
      };

      // Call dedicated captain route
      let res = await fetch(`/api/restaurants/${slug}/orders/captain`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      // Fallback to manual route if necessary
      if (res.status === 404) {
        res = await fetch(`/api/restaurants/${slug}/orders/manual`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || "Failed to submit order to kitchen");
      }

      const createdOrder = await res.json();

      // Clear cart
      setCart([]);
      setOrderNote("");
      setIsCartOpen(false);
      try {
        localStorage.removeItem(`tableline_captain_cart_${slug}`);
      } catch {}

      // Refresh tables & dashboard state
      refetchTables();
      refetchDashboard();

      setCompletedOrder(createdOrder);

      toast({
        title: `Order #${createdOrder.orderNumber || "New"} Sent to Kitchen!`,
        description: `Table ${activeTable?.tableNumber || "Selected"} ticket routed to KDS.`,
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Order submission failed",
        description: err.message || "Could not dispatch order to kitchen.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Plan Entitlement Guard
  if (!isCaptainAllowed) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto min-h-[420px]">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 mb-4 ring-8 ring-amber-500/5">
          <Smartphone className="h-8 w-8" />
        </div>
        <span className="rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 font-mono text-[11px] font-bold px-3 py-1 uppercase tracking-wider mb-2">
          Growth Plan Feature
        </span>
        <h2 className="font-display text-2xl font-bold text-foreground">
          Captain Mobile Web Mode
        </h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Enable waiters to take customer orders directly from their mobile phones on the floor and route tickets straight to the Kitchen Display System (KDS)—eliminating paper pads and delays.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 w-full max-w-xs">
          <Button
            onClick={() => onNavigateTab?.("plans")}
            className="w-full rounded-xl bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 font-bold gap-2 h-11"
            id="button-upgrade-captain"
          >
            <Sparkles className="h-4 w-4" />
            Upgrade to Growth
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-28 select-none" id="captain-ordering-view">
      {/* Offline Alert Banner */}
      {!isOnline && (
        <div
          id="captain-offline-banner"
          className="sticky top-0 z-40 flex items-center justify-between rounded-xl bg-red-600 text-white px-4 py-2.5 text-xs font-bold shadow-md animate-pulse"
        >
          <div className="flex items-center gap-2">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>Floor Wi-Fi Offline — Orders saved locally. Reconnecting…</span>
          </div>
          <span className="text-[10px] bg-red-700 px-2 py-0.5 rounded uppercase">Offline</span>
        </div>
      )}

      {/* Top Mobile Bar: Table Selector & Fast Stats */}
      <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Dining Table
              </span>
              {activeTable?.status === "OCCUPIED" && (
                <span className="inline-flex items-center rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                  Occupied (Active Session)
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsTableSelectorOpen(true)}
              id="captain-table-selector-btn"
              className="mt-1 flex items-center gap-2 text-left group"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 font-black text-sm">
                {activeTable?.tableNumber || "?"}
              </div>
              <div className="truncate">
                <span className="text-base font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                  Table {activeTable?.tableNumber || "Select Table"}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </span>
                <p className="text-[11px] text-muted-foreground truncate">
                  {activeTable?.location ? `${activeTable.location} • ` : ""}
                  Tap to switch table
                </p>
              </div>
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsTableSelectorOpen(true)}
            className="rounded-xl h-9 text-xs font-semibold shrink-0 gap-1.5"
            id="button-change-table"
          >
            <TableIcon className="h-3.5 w-3.5 text-muted-foreground" />
            Switch
          </Button>
        </div>
      </div>

      {/* Fast Search & Dietary Chips */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Fast search dishes (e.g. Pizza, Coffee, Biryani)…"
            className="h-11 rounded-xl pl-9 pr-8 text-sm bg-card border-border shadow-2xs"
            id="captain-menu-search"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Dietary Filters */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <button
            type="button"
            onClick={() => setDietaryFilter("ALL")}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
              dietaryFilter === "ALL"
                ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 shadow-xs"
                : "border border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            All Items
          </button>
          <button
            type="button"
            onClick={() => setDietaryFilter(dietaryFilter === "VEG" ? "ALL" : "VEG")}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
              dietaryFilter === "VEG"
                ? "bg-emerald-600 text-white shadow-xs"
                : "border border-emerald-200 dark:border-emerald-900 bg-card text-emerald-700 dark:text-emerald-400"
            }`}
          >
            <Leaf className="h-3 w-3" />
            Veg Only
          </button>
          <button
            type="button"
            onClick={() => setDietaryFilter(dietaryFilter === "NON_VEG" ? "ALL" : "NON_VEG")}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
              dietaryFilter === "NON_VEG"
                ? "bg-red-600 text-white shadow-xs"
                : "border border-red-200 dark:border-red-900 bg-card text-red-700 dark:text-red-400"
            }`}
          >
            <Flame className="h-3 w-3" />
            Non-Veg
          </button>
        </div>

        {/* Sticky Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          <button
            type="button"
            onClick={() => setSelectedCategory("ALL")}
            className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
              selectedCategory === "ALL"
                ? "bg-amber-500 text-stone-950 font-black shadow-xs"
                : "border border-border bg-card text-foreground hover:bg-secondary/60"
            }`}
          >
            All ({menuItems.length})
          </button>
          {categories.map((cat: any) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                selectedCategory === cat.id
                  ? "bg-amber-500 text-stone-950 font-black shadow-xs"
                  : "border border-border bg-card text-foreground hover:bg-secondary/60"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Menu Dishes List */}
      {loadingItems || loadingCats ? (
        <TablelineLoader
          variant="card"
          message="Loading restaurant menu…"
          subtext="Fetching dish catalog, modifier groups & specials…"
        />
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-10 text-center">
          <ChefHat className="h-10 w-10 text-muted-foreground opacity-50" />
          <h4 className="mt-3 text-base font-bold">No dishes found</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {searchQuery
              ? `No items matching "${searchQuery}"`
              : "No dishes available under this category."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {filteredItems.map((item: any) => {
            const isOutOfStock =
              item.isAvailable === false ||
              item.available === false ||
              item.stockStatus === "OUT_OF_STOCK";

            // Count how many of this item is in the cart
            const inCartQty = cart
              .filter((c) => c.menuItemId === item.id)
              .reduce((sum, c) => sum + c.quantity, 0);

            const hasVariants =
              Array.isArray(item.variants) && item.variants.length > 0;
            const hasAddons = Array.isArray(item.addons) && item.addons.length > 0;

            return (
              <div
                key={item.id}
                id={`captain-item-${item.id}`}
                className={`flex items-start justify-between gap-3 rounded-2xl border p-3.5 transition-all bg-card ${
                  isOutOfStock
                    ? "opacity-60 border-dashed border-border"
                    : inCartQty > 0
                    ? "border-amber-400 dark:border-amber-500/50 shadow-xs"
                    : "border-border hover:border-border/80 shadow-2xs"
                }`}
              >
                <div className="flex-1 min-w-0 pr-1">
                  <div className="flex items-center gap-1.5">
                    {item.veg || item.isVeg ? (
                      <span
                        className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 ring-2 ring-emerald-500/20"
                        title="Pure Vegetarian"
                      />
                    ) : (
                      <span
                        className="h-2 w-2 rounded-full bg-red-500 shrink-0 ring-2 ring-red-500/20"
                        title="Non-Vegetarian"
                      />
                    )}
                    <h4 className="font-bold text-sm text-foreground truncate">
                      {item.name}
                    </h4>
                  </div>

                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-bold text-sm font-mono text-foreground">
                      {currency}
                      {item.price}
                    </span>
                    {(hasVariants || hasAddons) && (
                      <span className="text-[10px] text-muted-foreground font-medium">
                        (Customizable)
                      </span>
                    )}
                  </div>

                  {item.description && (
                    <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                      {item.description}
                    </p>
                  )}
                </div>

                {/* Quick Add Button with Min 44px Touch Target */}
                <div className="shrink-0 flex items-center">
                  {isOutOfStock ? (
                    <span className="rounded-lg bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase">
                      Sold Out
                    </span>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleQuickAdd(item)}
                      id={`btn-add-item-${item.id}`}
                      className={`min-h-[44px] min-w-[44px] rounded-xl font-bold gap-1 text-xs transition-all ${
                        inCartQty > 0
                          ? "bg-amber-500 text-stone-950 hover:bg-amber-400 shadow-xs"
                          : "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                      }`}
                    >
                      <Plus className="h-4 w-4" />
                      {inCartQty > 0 ? (
                        <span className="font-mono font-black">{inCartQty}</span>
                      ) : (
                        <span>Add</span>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Persistent Docked Bottom Bar: Cart Summary & Prominent [SEND TO KITCHEN] */}
      {cart.length > 0 && (
        <div
          id="captain-cart-dock"
          className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card/95 backdrop-blur-md p-3 shadow-lg"
        >
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              id="captain-cart-dock-btn"
              className="flex items-center gap-3 text-left flex-1 min-w-0"
            >
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-stone-950 font-black shadow-xs">
                <ShoppingBag className="h-5 w-5" />
                <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-stone-900 text-[11px] font-bold text-white dark:bg-stone-100 dark:text-stone-900">
                  {cartTotals.totalItems}
                </span>
              </div>
              <div className="truncate">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-foreground">
                    Table {activeTable?.tableNumber || "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    • {cartTotals.totalItems} {cartTotals.totalItems === 1 ? "item" : "items"}
                  </span>
                </div>
                <div className="font-mono font-bold text-sm text-foreground">
                  {currency}
                  {cartTotals.total}
                  <span className="text-[10px] font-normal text-muted-foreground ml-1">
                    (incl. taxes)
                  </span>
                </div>
              </div>
            </button>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCartOpen(true)}
                className="h-11 rounded-xl text-xs font-semibold px-3 hidden sm:inline-flex"
              >
                Review Order
              </Button>

              <Button
                type="button"
                onClick={handleSendToKitchen}
                disabled={isSubmitting || !isOnline}
                id="captain-send-to-kitchen-dock-btn"
                className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black px-5 gap-2 shadow-md min-w-[150px]"
              >
                {isSubmitting ? (
                  <>
                    <TablelineSymbol size="xs" className="text-white" />
                    <span>Routing…</span>
                  </>
                ) : (
                  <>
                    <ChefHat className="h-4 w-4" />
                    <span>SEND TO KITCHEN</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Cart Drawer / Review Modal */}
      <Dialog open={isCartOpen} onOpenChange={setIsCartOpen}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 rounded-2xl">
          <DialogHeader className="p-4 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-base font-bold">
                  Order for Table {activeTable?.tableNumber || "Selected"}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Review items before sending to the kitchen display system.
                </DialogDescription>
              </div>
              <button
                onClick={() => setIsTableSelectorOpen(true)}
                className="text-xs font-semibold text-primary underline"
              >
                Change Table
              </button>
            </div>
          </DialogHeader>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cart.map((item) => (
              <div
                key={item.cartItemId}
                className="flex items-start justify-between gap-3 p-3 rounded-xl border border-border bg-card/60"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-foreground truncate">
                    {item.name}
                  </div>
                  {item.selectedVariant && (
                    <div className="text-[11px] text-muted-foreground">
                      Size: {item.selectedVariant.name}
                    </div>
                  )}
                  {item.selectedAddons && item.selectedAddons.length > 0 && (
                    <div className="text-[11px] text-muted-foreground">
                      Add-ons: {item.selectedAddons.map((a) => a.name).join(", ")}
                    </div>
                  )}
                  {item.specialInstructions && (
                    <div className="text-[11px] text-amber-700 dark:text-amber-400 font-medium italic mt-0.5">
                      "{item.specialInstructions}"
                    </div>
                  )}
                  <div className="mt-1 font-mono font-bold text-xs text-foreground">
                    {currency}
                    {item.price * item.quantity}
                  </div>
                </div>

                {/* Quantity Stepper with Large Tap Targets */}
                <div className="flex items-center gap-1.5 shrink-0 bg-muted/70 rounded-xl p-1">
                  <button
                    type="button"
                    onClick={() => handleUpdateQuantity(item.cartItemId, -1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-background text-foreground hover:bg-secondary font-bold text-sm shadow-2xs"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-6 text-center font-mono font-bold text-xs">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUpdateQuantity(item.cartItemId, 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-background text-foreground hover:bg-secondary font-bold text-sm shadow-2xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.cartItemId)}
                    className="ml-1 flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {/* Special Instructions Note for Kitchen */}
            <div className="pt-2">
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Order Kitchen Note (Optional)
              </label>
              <Textarea
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                placeholder="e.g. Guest allergic to nuts, serve soup first, extra spicy…"
                className="text-xs min-h-[60px] rounded-xl"
              />
            </div>

            {/* Price Snapshot */}
            <div className="rounded-xl bg-muted/40 p-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-mono">
                  {currency}
                  {cartTotals.subtotal}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Estimated Taxes</span>
                <span className="font-mono">
                  {currency}
                  {cartTotals.taxes}
                </span>
              </div>
              <div className="border-t border-border pt-1.5 flex justify-between font-bold text-sm text-foreground">
                <span>Total Amount</span>
                <span className="font-mono">
                  {currency}
                  {cartTotals.total}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="p-4 border-t border-border bg-card">
            <Button
              type="button"
              onClick={handleSendToKitchen}
              disabled={isSubmitting || !isOnline}
              className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm gap-2 shadow-md"
              id="captain-modal-send-btn"
            >
              {isSubmitting ? (
                <>
                  <TablelineSymbol size="xs" className="text-white" />
                  <span>Sending to Kitchen…</span>
                </>
              ) : (
                <>
                  <ChefHat className="h-4 w-4" />
                  <span>SEND TO KITCHEN ({currency}{cartTotals.total})</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item Customization Modal */}
      <Dialog
        open={Boolean(customizingItem)}
        onOpenChange={(open) => !open && setCustomizingItem(null)}
      >
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              Customize {customizingItem?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Select portion size, add-ons, and cooking preferences.
            </DialogDescription>
          </DialogHeader>

          {customizingItem && (
            <div className="space-y-4 py-2 text-xs">
              {/* Variants / Portions */}
              {Array.isArray(customizingItem.variants) &&
                customizingItem.variants.length > 0 && (
                  <div>
                    <label className="font-bold text-foreground block mb-2">
                      Portion / Size
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {customizingItem.variants.map((variant: any) => (
                        <button
                          key={variant.id}
                          type="button"
                          onClick={() => setSelectedVariantId(String(variant.id))}
                          className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                            String(selectedVariantId) === String(variant.id)
                              ? "border-primary bg-primary/10 font-bold"
                              : "border-border bg-card hover:bg-secondary/50"
                          }`}
                        >
                          <span>{variant.name}</span>
                          <span className="font-mono">
                            {currency}
                            {variant.price}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              {/* Addons */}
              {Array.isArray(customizingItem.addons) &&
                customizingItem.addons.length > 0 && (
                  <div>
                    <label className="font-bold text-foreground block mb-2">
                      Optional Add-ons
                    </label>
                    <div className="space-y-1.5">
                      {customizingItem.addons.map((addon: any) => {
                        const isSelected = selectedAddonIds.includes(String(addon.id));
                        return (
                          <button
                            key={addon.id}
                            type="button"
                            onClick={() => {
                              setSelectedAddonIds((prev) =>
                                isSelected
                                  ? prev.filter((id) => id !== String(addon.id))
                                  : [...prev, String(addon.id)],
                              );
                            }}
                            className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                              isSelected
                                ? "border-primary bg-primary/10 font-semibold"
                                : "border-border bg-card hover:bg-secondary/50"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className={`h-4 w-4 rounded flex items-center justify-center border ${
                                  isSelected
                                    ? "bg-primary border-primary text-primary-foreground"
                                    : "border-muted-foreground"
                                }`}
                              >
                                {isSelected && <Check className="h-3 w-3" />}
                              </div>
                              <span>{addon.name}</span>
                            </div>
                            <span className="font-mono text-muted-foreground">
                              +{currency}
                              {addon.price}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

              {/* Special instructions */}
              <div>
                <label className="font-bold text-foreground block mb-1">
                  Preparation Instructions
                </label>
                <Input
                  value={customizationNote}
                  onChange={(e) => setCustomizationNote(e.target.value)}
                  placeholder="e.g. Less spicy, no onion, dressing on side"
                  className="rounded-xl h-10 text-xs"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              onClick={handleAddCustomizedItem}
              className="w-full h-11 rounded-xl font-bold"
            >
              Add to Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Table Selector Modal */}
      <Dialog open={isTableSelectorOpen} onOpenChange={setIsTableSelectorOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0 rounded-2xl">
          <DialogHeader className="p-4 border-b border-border">
            <DialogTitle className="text-base font-bold">Select Dining Table</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Select which table to place this order for.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4">
            {availableTables.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">
                No active tables found in this restaurant.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {availableTables.map((t: any) => {
                  const isSelected = String(t.id) === String(selectedTableId);
                  const isOccupied = t.status === "OCCUPIED" || Boolean(t.activeSession);

                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setSelectedTableId(String(t.id));
                        setIsTableSelectorOpen(false);
                      }}
                      id={`table-select-${t.id}`}
                      className={`flex flex-col items-start p-3 rounded-2xl border text-left transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                          : "border-border bg-card hover:bg-secondary/60"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-black text-lg font-mono text-foreground">
                          T-{t.tableNumber}
                        </span>
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            isOccupied ? "bg-amber-500" : "bg-emerald-500"
                          }`}
                          title={isOccupied ? "Occupied" : "Available"}
                        />
                      </div>
                      <span className="text-[11px] text-muted-foreground mt-1 truncate w-full">
                        {t.location || "Dining Floor"}
                      </span>
                      <span
                        className={`text-[10px] font-bold mt-2 uppercase ${
                          isOccupied ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {isOccupied ? "Occupied" : "Available"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Order Sent Confirmation Dialog */}
      <Dialog
        open={Boolean(completedOrder)}
        onOpenChange={(open) => !open && setCompletedOrder(null)}
      >
        <DialogContent className="max-w-sm text-center p-6 rounded-2xl" id="order-success-dialog">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 mb-2">
            <CheckCircle2 className="h-8 w-8" />
          </div>

          <DialogTitle className="text-xl font-bold font-display text-foreground">
            Order Sent to Kitchen!
          </DialogTitle>

          <DialogDescription className="text-xs text-muted-foreground mt-1">
            Ticket routed to kitchen pass for Table {completedOrder?.tableNumber || activeTable?.tableNumber}.
          </DialogDescription>

          <div className="my-4 rounded-xl bg-muted/40 p-3 text-xs space-y-1 font-mono">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order Number:</span>
              <span className="font-bold">#{completedOrder?.orderNumber || completedOrder?.id?.slice(-4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Source:</span>
              <span className="font-bold uppercase">Staff Captain</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-bold">
                {currency}
                {completedOrder?.total || cartTotals.total}
              </span>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <Button
              type="button"
              onClick={() => setCompletedOrder(null)}
              className="w-full h-11 rounded-xl bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 font-bold text-xs"
              id="button-order-more-same-table"
            >
              Take Another Order for Table {activeTable?.tableNumber}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCompletedOrder(null);
                setIsTableSelectorOpen(true);
              }}
              className="w-full h-11 rounded-xl text-xs font-semibold"
              id="button-switch-table-after-order"
            >
              Switch Table
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setCompletedOrder(null);
                onNavigateTab?.("kds");
              }}
              className="w-full text-xs text-muted-foreground"
            >
              View Kitchen Display (KDS)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
