import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useParams, useLocation, Link } from "wouter";
import {
  Search,
  Plus,
  Minus,
  X,
  Globe,
  Bell,
  Utensils,
  ChevronDown,
  ArrowRight,
  ChefHat,
  Coffee,
  Mic,
  Receipt,
  RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CustomerCart, type CartItem, type ItemModifiers } from "./CustomerCart";
import { I18N_STRINGS, type Language } from "@/lib/customerI18n";
import { ItemModifierModal, type CanonicalModifierGroup, type SelectedModifier } from "./ItemModifierModal";
import { VoiceOrderModal } from "./VoiceOrderModal";
import { getFoodImage } from "@/lib/foodImageFallbacks";
import { formatTableName } from "@/lib/formatters";
import { useTableSession } from "@/hooks/useTableSession";
import { triggerHaptic } from "@/lib/haptics";
import { getActiveDaypart, prioritizeCategoriesByDaypart } from "@/lib/dayparting";
import { createMenuSearchIndex, executeFuzzySearch, type SearchableMenuItem } from "@/lib/menuSearch";
import { MenuSkeleton } from "./MenuSkeleton";
import { MorphingAddButton } from "./MorphingAddButton";
import { HeroHeader } from "./HeroHeader";
import { BottomNav, type GuestTabKey } from "./BottomNav";
import { FloatingCartPill } from "./FloatingCartPill";

interface CategoryData {
  id: string;
  name: string;
  description?: string;
  sortOrder: number;
  imageUrl?: string | null;
  translations?: Record<string, { name?: string }>;
}

interface MenuItemData {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string | null;
  veg: boolean;
  isJain?: boolean;
  available: boolean;
  badge?: string | null;
  isBestseller?: boolean;
  isChefsPick?: boolean;
  rating?: number | null;
  reviewCount?: number;
  ingredients?: string[];
  tags?: string[];
  modifierGroupIds?: string[];
  translations?: Record<string, { name?: string; description?: string }>;
}

interface MenuData {
  restaurant: {
    name: string;
    slug: string;
    logoUrl?: string | null;
    city?: string;
    currency?: string;
    heroVideoUrl?: string | null;
  };
  features?: {
    waiterCalls?: boolean;
    ordering?: boolean;
    digitalMenu?: boolean;
    dinerReviews?: boolean;
  };
  entitlements?: Record<string, boolean>;
  table: {
    id: string;
    tableNumber: string;
    location?: string | null;
    slug: string;
    active: boolean;
    status?: "AVAILABLE" | "OCCUPIED" | "DEACTIVATED";
  };
  session?: {
    id: string;
    token: string;
    expiresAt: string;
    status: string;
    ordersCount?: number;
    sessionTotal?: number;
    paymentStatus?: string;
  } | null;
  categories: CategoryData[];
  items: MenuItemData[];
  modifierGroups?: CanonicalModifierGroup[];
}

interface ActiveOrderBannerData {
  id: string;
  orderNumber?: number | string;
  status?: string;
  total?: number;
  itemsCount?: number;
}

// Subtle Dayparting Greeting
function getDaypartGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return "Good morning · Breakfast";
  } else if (hour >= 12 && hour < 17) {
    return "Good afternoon · Lunch";
  } else if (hour >= 17 && hour < 23) {
    return "Good evening · Dinner";
  } else {
    return "Late night · Supper";
  }
}

// Self-contained Real-time clock & date to avoid re-rendering entire menu
function RestaurantTimeHeader({
  daypartGreeting,
  isOverlay = true,
}: {
  daypartGreeting: string;
  isOverlay?: boolean;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const timeString = now.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-1.5 text-[11px] font-sans tracking-tight mt-1 ${
        isOverlay
          ? "text-white/85 drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]"
          : "text-stone-500"
      }`}
    >
      <span className={isOverlay ? "font-medium text-white/90" : "font-serif italic text-stone-600"}>
        {daypartGreeting}
      </span>
      <span className="opacity-40">·</span>
      <span className={`font-sans tabular-nums font-medium ${isOverlay ? "text-white/95" : "text-stone-600"}`}>
        {timeString}
      </span>
    </div>
  );
}

export function CustomerMenuView() {
  const { restaurantSlug = "", tableSlug = "" } = useParams<{
    restaurantSlug: string;
    tableSlug: string;
  }>();
  const [, setLocation] = useLocation();

  const [menuData, setMenuData] = useState<MenuData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Localization & Theme Preferences
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem("tableline_customer_lang");
    return saved === "gu" || saved === "hi" ? (saved as Language) : "en";
  });

  const [langDropdownOpen, setLangDropdownOpen] = useState(false);

  // Filters & State
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [showWaiterModal, setShowWaiterModal] = useState(false);
  const [, setWaiterModalType] = useState<string>("CALL_WAITER");
  const [callingWaiter, setCallingWaiter] = useState(false);
  const [callSuccessType, setCallSuccessType] = useState<string | null>(null);

  // Active persistent order banner state
  const [activeOrder, setActiveOrder] = useState<ActiveOrderBannerData | null>(null);

  // Live Multi-Phone Shared Cart & Modifiers State
  const [dinerName] = useState<string>(() => {
    return localStorage.getItem("tableline_diner_name") || `Diner ${Math.floor(10 + Math.random() * 90)}`;
  });
  const [sharedCartNotice, setSharedCartNotice] = useState<string | null>(null);
  const [itemToCustomize, setItemToCustomize] = useState<MenuItemData | null>(null);

  // Dayparting & Prioritization State
  const activeDaypart = useMemo(() => getActiveDaypart(), []);
  const daypartGreeting = useMemo(() => getDaypartGreeting(), []);

  // Scroll-Spy Refs & State
  const categorySectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const categoryPillRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const isProgrammaticScrollRef = useRef(false);
  const [activeCategoryInView, setActiveCategoryInView] = useState<string>("ALL");
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Dish Detail Modal State
  const [selectedDishForDetail, setSelectedDishForDetail] = useState<MenuItemData | null>(null);
  const [dishReviewsData, setDishReviewsData] = useState<{ rating: number | null; reviewCount: number; reviews: any[] } | null>(null);
  const [, setLoadingReviews] = useState(false);

  // Table Session Lifecycle Management (Strictly binds guests to temporary sessionId)
  const {
    currentSessionId,
    isHost,
    isSessionClosed,
    resetSessionForNewParty,
  } = useTableSession({
    restaurantSlug,
    tableSlugOrId: tableSlug,
    tableNumber: menuData?.table?.tableNumber,
    dinerName,
    enabled: Boolean(menuData?.table),
    onSessionClosed: () => {
      // Instantly clear local cart and dismiss any active modals
      setCart([]);
      setIsCartOpen(false);
      setItemToCustomize(null);
      setSelectedDishForDetail(null);
      setShowVoiceModal(false);
      setShowWaiterModal(false);
      toast({
        title: "Session Closed",
        description: "Your table bill was settled. Thank you for dining with us!",
      });
    },
  });

  const searchInputRef = useRef<HTMLInputElement>(null);
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const t = I18N_STRINGS[lang] || I18N_STRINGS.en;

  const handleOpenDishDetail = async (item: MenuItemData) => {
    setSelectedDishForDetail(item);
    if (menuData?.features?.dinerReviews) {
      setLoadingReviews(true);
      try {
        const res = await fetch(`/api/public/menu/${restaurantSlug}/items/${item.id}/reviews`);
        if (res.ok) {
          const json = await res.json();
          setDishReviewsData(json);
        } else {
          setDishReviewsData(null);
        }
      } catch {
        setDishReviewsData(null);
      } finally {
        setLoadingReviews(false);
      }
    } else {
      setDishReviewsData(null);
    }
  };

  const handleCallWaiter = async (serviceType: string, notes = "") => {
    if (!menuData?.table) return;

    if (serviceType === "BILL" || serviceType === "BILL_REQUESTED") {
      if (!menuData?.session || (menuData.session.ordersCount ?? 0) === 0 || (menuData.session.sessionTotal ?? 0) <= 0) {
        toast({
          variant: "destructive",
          title: "No Orders Placed",
          description: "There are no active orders on this table yet.",
        });
        setShowWaiterModal(false);
        return;
      }
    }

    setCallingWaiter(true);
    try {
      const storedToken =
        sessionStorage.getItem(`table_session_${restaurantSlug}_${menuData.table.id || tableSlug}`) ||
        sessionStorage.getItem(`table_session_${restaurantSlug}`);

      const res = await fetch(
        `/api/public/menu/${restaurantSlug}/table/${tableSlug}/waiter-calls`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serviceType,
            notes,
            tableSessionToken: storedToken || undefined,
          }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        setCallSuccessType(serviceType);
        toast({
          title: "Staff Alerted 🔔",
          description: `Our team has been notified for ${formatTableName(menuData.table.tableNumber)}.`,
        });
        setTimeout(() => {
          setShowWaiterModal(false);
          setCallSuccessType(null);
        }, 1200);
      } else {
        toast({
          variant: "destructive",
          title: "Could not alert staff",
          description: data.error || "Please speak to a staff member nearby.",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Connection issue",
        description: "Please speak directly to a staff member.",
      });
    } finally {
      setCallingWaiter(false);
    }
  };

  const handleSelectLang = (newLang: Language) => {
    setLang(newLang);
    localStorage.setItem("tableline_customer_lang", newLang);
  };

  // Load Menu Data
  useEffect(() => {
    let cancelled = false;

    async function loadMenu() {
      try {
        setLoading(true);
        setError(null);

        const storedToken =
          sessionStorage.getItem(`table_session_${restaurantSlug}_${tableSlug}`) ||
          sessionStorage.getItem(`table_session_${restaurantSlug}`);

        const url = new URL(
          `/api/public/menu/${restaurantSlug}/table/${tableSlug}`,
          window.location.origin
        );
        if (storedToken) {
          url.searchParams.set("token", storedToken);
        }

        const res = await fetch(url.toString());
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("This menu or table QR code is no longer active. Please scan again.");
          }
          throw new Error("Could not load the menu. Please check your connection.");
        }

        const data: MenuData = await res.json();
        if (cancelled) return;

        setMenuData(data);

        if (data.session?.token) {
          sessionStorage.setItem(
            `table_session_${restaurantSlug}_${data.table.id || tableSlug}`,
            data.session.token
          );
          sessionStorage.setItem(
            `table_session_${restaurantSlug}`,
            data.session.token
          );
        }

        checkActiveSessionOrders(storedToken || data.session?.token);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to load restaurant menu.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (restaurantSlug && tableSlug) {
      loadMenu();
    }

    return () => {
      cancelled = true;
    };
  }, [restaurantSlug, tableSlug]);

  const checkActiveSessionOrders = async (token?: string) => {
    if (!restaurantSlug || !tableSlug) return;
    try {
      const url = new URL(
        `/api/public/menu/${restaurantSlug}/table/${tableSlug}/session`,
        window.location.origin
      );
      if (token) url.searchParams.set("token", token);
      const res = await fetch(url.toString());
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json?.orders) ? json.orders : Array.isArray(json) ? json : [];
        const activeOne = list.find(
          (o: any) =>
            o.status !== "COMPLETED" &&
            o.status !== "CANCELLED" &&
            o.status !== "DECLINED"
        );
        if (activeOne) {
          setActiveOrder({
            id: activeOne.id,
            orderNumber: activeOne.orderNumber,
            status: activeOne.status,
            total: activeOne.total,
            itemsCount: Array.isArray(activeOne.items) ? activeOne.items.length : 1,
          });
        }
      }
    } catch {}
  };

  // Real-time Shared Cart Sync over SSE
  useEffect(() => {
    if (!restaurantSlug || !tableSlug) return;

    let eventSource: EventSource | null = null;
    let cancelled = false;

    fetch(`/api/public/menu/${restaurantSlug}/table/${tableSlug}/cart`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && Array.isArray(data.items) && data.items.length > 0) {
          setCart(data.items);
        }
      })
      .catch(() => {});

    const setupCartSSE = () => {
      try {
        eventSource = new EventSource(
          `/api/public/menu/${restaurantSlug}/table/${tableSlug}/session/stream`
        );

        const handleCartEvent = (dataRaw: any) => {
          if (cancelled) return;
          try {
            const parsed = typeof dataRaw === "string" ? JSON.parse(dataRaw) : dataRaw;
            const cartPayload = parsed.cart || parsed;
            if (cartPayload && Array.isArray(cartPayload.items)) {
              setCart(cartPayload.items);
              if (cartPayload.lastUpdatedBy && cartPayload.lastUpdatedBy !== dinerName) {
                setSharedCartNotice(`🛒 ${cartPayload.lastUpdatedBy} updated the table cart`);
                setTimeout(() => setSharedCartNotice(null), 4000);
              }
            }
          } catch {}
        };

        eventSource.addEventListener("cart_updated", (e: MessageEvent) => {
          handleCartEvent(e.data);
        });

        eventSource.onmessage = (e) => {
          handleCartEvent(e.data);
        };
      } catch {}
    };

    setupCartSSE();

    return () => {
      cancelled = true;
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [restaurantSlug, tableSlug, dinerName]);

  const syncCartToServer = (newCart: CartItem[]) => {
    if (!restaurantSlug || !tableSlug) return;
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/public/menu/${restaurantSlug}/table/${tableSlug}/cart`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: newCart,
            dinerName,
          }),
        });
      } catch {}
    }, 200);
  };

  const handleUpdateQuantity = (itemId: string, delta: number) => {
    triggerHaptic(delta > 0 ? "light" : "selection");
    setCart((prev) => {
      const existing = prev.find((i) => i.id === itemId || i.menuItemId === itemId);
      let nextCart: CartItem[];
      if (!existing) {
        if (delta <= 0) return prev;
        const itemInfo = menuData?.items.find((i) => i.id === itemId);
        if (!itemInfo || itemInfo.available === false) return prev;

        const localName =
          lang !== "en" && itemInfo.translations?.[lang]?.name
            ? itemInfo.translations[lang]!.name!
            : itemInfo.name;

        nextCart = [
          ...prev,
          {
            id: itemId,
            menuItemId: itemId,
            name: localName,
            basePrice: itemInfo.price,
            price: itemInfo.price,
            quantity: 1,
            veg: itemInfo.veg,
            isJain: itemInfo.isJain,
            imageUrl: itemInfo.imageUrl,
            addedByDiner: dinerName,
          },
        ];
      } else {
        const newQty = existing.quantity + delta;
        if (newQty <= 0) {
          nextCart = prev.filter((i) => i.id !== existing.id);
        } else {
          nextCart = prev.map((i) =>
            i.id === existing.id ? { ...i, quantity: newQty } : i
          );
        }
      }
      syncCartToServer(nextCart);
      return nextCart;
    });
  };

  const getItemEffectiveModifierGroups = useCallback((item: MenuItemData) => {
    if (!menuData) return [];
    const cat = menuData.categories.find((c) => c.id === item.categoryId);
    const catGroupIds = Array.isArray((cat as any)?.modifierGroupIds) ? (cat as any).modifierGroupIds : [];
    const disabledIds = Array.isArray((item as any).disabledModifierGroupIds) ? (item as any).disabledModifierGroupIds : [];
    const itemGroupIds = Array.isArray(item.modifierGroupIds) ? item.modifierGroupIds : [];
    const effectiveIds = Array.from(
      new Set([
        ...catGroupIds.filter((id: string) => !disabledIds.includes(id)),
        ...itemGroupIds,
      ])
    );
    return (menuData.modifierGroups || []).filter((g) => effectiveIds.includes(g.id));
  }, [menuData]);

  const itemEffectiveModifierGroups = useMemo(() => {
    if (!itemToCustomize || !menuData) return [];
    return getItemEffectiveModifierGroups(itemToCustomize);
  }, [itemToCustomize?.id, menuData, getItemEffectiveModifierGroups]);

  const isItemCustomizable = useCallback((item: MenuItemData) => {
    return getItemEffectiveModifierGroups(item).length > 0;
  }, [getItemEffectiveModifierGroups]);

  const handleAddCustomizedItem = (
    item: any,
    modifiers: ItemModifiers,
    quantity: number,
    calculatedUnitPrice: number,
    selectedModifiers: SelectedModifier[] = []
  ) => {
    const compositeId = `${item.id}___${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const localName =
      lang !== "en" && item.translations?.[lang]?.name
        ? item.translations[lang]!.name!
        : item.name;

    const basePrice = Number(item.price || 0);
    const newItem: CartItem = {
      id: compositeId,
      menuItemId: item.id,
      name: localName,
      basePrice,
      price: calculatedUnitPrice,
      quantity,
      veg: item.veg,
      imageUrl: item.imageUrl,
      isJain: modifiers.dietary === "Jain (No Onion/Garlic)" || item.isJain,
      modifiers,
      selectedModifiers,
      specialInstructions: modifiers.specialInstructions,
      addedByDiner: dinerName,
    };

    setCart((prev) => {
      const nextCart = [...prev, newItem];
      syncCartToServer(nextCart);
      return nextCart;
    });

    const summaryParts =
      selectedModifiers.length > 0
        ? selectedModifiers.map((m) => m.optionName).slice(0, 3).join(", ")
        : `Customized with ${modifiers.spiceLevel || "Medium"} spice`;

    toast({
      title: `${localName} added to table cart`,
      description: summaryParts,
    });
  };

  const handleClearCart = () => {
    setCart([]);
    syncCartToServer([]);
  };

  const handleOrderPlaced = (orderId: string, orderDetails?: any) => {
    const orderNum = orderDetails?.orderNumber ? `Order #${orderDetails.orderNumber}` : "Order";
    setActiveOrder({
      id: orderId,
      orderNumber: orderDetails?.orderNumber || "Just placed",
      status: "NEEDS_APPROVAL",
      total: orderDetails?.total,
      itemsCount: orderDetails?.itemsCount || 1,
    });
    setIsCartOpen(false);
    toast({
      title: "✓ Order Received",
      description: `${orderNum} has been sent to the restaurant and is waiting for confirmation.`,
    });
    // Direct navigation to order tracker:
    setLocation(`/menu/${restaurantSlug}/table/${tableSlug}/order/${orderId}`);
  };

  // Categories map for Fuse search and lookup
  const categoriesMap = useMemo(() => {
    const map: Record<string, string> = {};
    menuData?.categories.forEach((c) => {
      map[c.id] = c.name;
    });
    return map;
  }, [menuData]);

  // Daypart-prioritized categories
  const { prioritized: prioritizedCategories } = useMemo(() => {
    if (!menuData) return { prioritized: [], daypartCategoryIds: new Set<string>() };
    return prioritizeCategoriesByDaypart(menuData.categories, activeDaypart);
  }, [menuData, activeDaypart]);

  // Scroll-Spy Category Navigation using IntersectionObserver
  useEffect(() => {
    if (selectedCategory !== "ALL" || search.trim() || prioritizedCategories.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (isProgrammaticScrollRef.current) return;
        const visibleEntry = entries.find((e) => e.isIntersecting);
        if (visibleEntry && visibleEntry.target) {
          const catId = visibleEntry.target.getAttribute("data-category-id");
          if (catId) {
            setActiveCategoryInView(catId);
            const pillEl = categoryPillRefs.current[catId];
            if (pillEl) {
              pillEl.scrollIntoView({
                behavior: "smooth",
                inline: "center",
                block: "nearest",
              });
            }
          }
        }
      },
      {
        root: null,
        rootMargin: "-20% 0px -70% 0px",
        threshold: 0.1,
      }
    );

    prioritizedCategories.forEach((cat) => {
      const el = categorySectionRefs.current[cat.id];
      if (el) observer.observe(el);
    });

    return () => {
      observer.disconnect();
    };
  }, [prioritizedCategories, selectedCategory, search]);

  const handleSelectCategoryPill = (catId: string) => {
    triggerHaptic("selection");
    if (catId === "ALL") {
      setSelectedCategory("ALL");
      setActiveCategoryInView("ALL");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (selectedCategory === "ALL") {
      setActiveCategoryInView(catId);
      isProgrammaticScrollRef.current = true;
      const secEl = categorySectionRefs.current[catId];
      if (secEl) {
        const navOffset = 130;
        const elementPosition = secEl.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - navOffset;
        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth",
        });
      }
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 600);
    } else {
      setSelectedCategory(catId);
    }
  };

  // Popular items shelf for continuous menu view
  const popularItems = useMemo(() => {
    if (!menuData?.items) return [];
    const bestsellers = menuData.items.filter((i) => i.isBestseller && i.available !== false);
    if (bestsellers.length >= 3) return bestsellers.slice(0, 8);
    return menuData.items.filter((i) => i.available !== false).slice(0, 6);
  }, [menuData]);

  // Memoized Fuse Search Index for fast typo-tolerant searching across 600+ items
  const fuseSearchIndex = useMemo(() => {
    if (!menuData) return null;
    return createMenuSearchIndex(menuData.items as SearchableMenuItem[], categoriesMap, lang);
  }, [menuData, categoriesMap, lang]);

  // Fuzzy search execution
  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    return executeFuzzySearch(fuseSearchIndex, (menuData?.items || []) as SearchableMenuItem[], search);
  }, [fuseSearchIndex, menuData, search]);

  // Filtered Items (Combining Category and Fuzzy Search)
  const filteredItems = useMemo(() => {
    if (!menuData) return [];

    let pool: MenuItemData[];
    if (searchResults) {
      pool = searchResults.matches as MenuItemData[];
    } else {
      pool = menuData.items;
    }

    return pool.filter((item) => {
      if (selectedCategory !== "ALL" && item.categoryId !== selectedCategory) {
        return false;
      }
      return true;
    });
  }, [menuData, selectedCategory, searchResults]);

  // Related items for search results
  const relatedSearchItems = useMemo(() => {
    if (!searchResults || searchResults.related.length === 0) return [];
    return searchResults.related as MenuItemData[];
  }, [searchResults]);

  // Group filtered items by category for "ALL" view
  const groupedItemsByCategory = useMemo(() => {
    if (!menuData) return [];
    if (selectedCategory !== "ALL" || search.trim()) {
      return null;
    }

    const groups: Array<{ category: CategoryData; items: MenuItemData[] }> = [];

    prioritizedCategories.forEach((cat) => {
      const itemsInCat = filteredItems.filter((i) => i.categoryId === cat.id);
      if (itemsInCat.length > 0) {
        groups.push({ category: cat, items: itemsInCat });
      }
    });

    return groups;
  }, [menuData, selectedCategory, search, filteredItems, prioritizedCategories]);

  // Render an elegant vertical food item row (Section 11 & 13)
  const renderFoodItem = useCallback((item: MenuItemData) => {
    const inCart = cart.find((c) => c.id === item.id || c.menuItemId === item.id);
    const isAvailable = item.available !== false;
    const foodImg = getFoodImage(item.name, undefined, item.imageUrl);
    const customizable = isItemCustomizable(item);
    const currency = menuData?.restaurant.currency || "₹";

    return (
      <div
        key={item.id}
        className={`py-4.5 border-b border-stone-200/70 last:border-b-0 flex items-start justify-between gap-4 transition-colors group ${
          !isAvailable ? "opacity-50" : ""
        }`}
        id={`dish-item-${item.id}`}
      >
        {/* Left Column: Veg Mark + Name + Price + Description */}
        <div className="flex-1 min-w-0 pr-1">
          {/* Veg / Non-Veg mark + Bestseller + Customizable */}
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className={`h-4 w-4 rounded-[3px] border ${
                item.veg ? "border-emerald-600" : "border-rose-700"
              } p-0.5 flex items-center justify-center bg-white shadow-2xs shrink-0`}
              title={item.veg ? "Vegetarian" : "Non-Vegetarian"}
            >
              <span
                className={`h-2 w-2 ${
                  item.veg ? "rounded-full bg-emerald-600" : "rounded-sm bg-rose-700"
                }`}
              />
            </span>
            {item.isBestseller && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 bg-amber-100/90 px-1.5 py-0.5 rounded-md">
                Bestseller
              </span>
            )}
            {customizable && (
              <span className="text-[10px] font-medium text-stone-500">
                Customisable
              </span>
            )}
          </div>

          {/* Dish Name */}
          <h3
            onClick={() => handleOpenDishDetail(item)}
            className="font-serif text-[16px] sm:text-[18px] font-bold text-[#1c1917] leading-snug tracking-tight cursor-pointer hover:text-stone-700 transition-colors"
          >
            {item.name}
          </h3>

          {/* Price */}
          <div className="mt-1 font-sans tabular-nums tracking-tight font-bold text-sm sm:text-base text-[#1c1917]">
            {currency}{item.price}
          </div>

          {/* Description (1-2 lines, readable) */}
          {item.description && (
            <p
              onClick={() => handleOpenDishDetail(item)}
              className="mt-1.5 line-clamp-2 text-xs text-stone-500 leading-relaxed font-sans cursor-pointer"
            >
              {item.description}
            </p>
          )}

          {/* Multiplayer Attribution */}
          {inCart?.addedByDiner && (
            <div className="mt-2 flex items-center gap-1">
              <span className="text-[10px] font-sans font-medium text-amber-900 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                Added by {inCart.addedByDiner}
              </span>
            </div>
          )}
        </div>

        {/* Right Column: Generous Food Image with Add Button on it */}
        <div className="relative shrink-0 flex flex-col items-center">
          <div
            onClick={() => handleOpenDishDetail(item)}
            className="h-28 w-28 sm:h-32 sm:w-32 rounded-2xl overflow-hidden bg-stone-100 border border-stone-200/80 shadow-2xs cursor-pointer group-hover:shadow-md transition-shadow"
          >
            <img
              src={foodImg}
              alt={item.name}
              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          </div>

          {/* Morphing Add Button */}
          <div className="absolute -bottom-3 inset-x-2 z-10 flex justify-center">
            <MorphingAddButton
              quantity={inCart?.quantity || 0}
              available={isAvailable}
              customizable={customizable}
              itemId={item.id}
              variant="pill"
              className="shadow-md"
              onAdd={() => {
                if (customizable) {
                  setItemToCustomize(item);
                } else {
                  handleUpdateQuantity(item.id, 1);
                }
              }}
              onIncrement={() => handleUpdateQuantity(item.id, 1)}
              onDecrement={() => handleUpdateQuantity(item.id, -1)}
            />
          </div>
        </div>
      </div>
    );
  }, [cart, menuData, dinerName]);

  if (isSessionClosed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#fafaf9] p-6 text-center text-[#1c1917]">
        <div className="rounded-3xl border border-stone-200/90 bg-white p-8 sm:p-10 shadow-xl max-w-sm w-full space-y-5 animate-in fade-in zoom-in-95">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1c1917] text-amber-100 shadow-md">
            <Receipt className="h-8 w-8 stroke-[1.8]" />
          </div>

          <div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-amber-900 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
              Session Settled &amp; Closed
            </span>
            <h2 className="font-serif text-2xl font-bold tracking-tight text-[#1c1917] mt-3">
              Thank You for Dining With Us
            </h2>
            <p className="text-xs text-stone-500 leading-relaxed mt-2 font-sans">
              Your table bill has been settled and this digital dining session is now completed. We look forward to serving you again soon!
            </p>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-[#fafaf9] p-4 text-left space-y-2 text-xs text-stone-600">
            <div className="flex justify-between items-center">
              <span className="text-stone-400">Restaurant</span>
              <span className="font-bold text-[#1c1917]">{menuData?.restaurant?.name || "The Roast Room"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-stone-400">Table</span>
              <span className="font-bold text-[#1c1917]">Table {menuData?.table?.tableNumber || "01"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-stone-400">Status</span>
              <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">Paid &amp; Cleared</span>
            </div>
          </div>

          <div className="pt-2 space-y-2">
            <Button
              onClick={() => {
                resetSessionForNewParty();
                window.location.reload();
              }}
              className="w-full rounded-2xl bg-[#1c1917] text-white font-bold text-xs h-12 hover:bg-stone-800 shadow-md flex items-center justify-center gap-2"
            >
              <RotateCw className="h-3.5 w-3.5" />
              <span>Start New Dining Session</span>
            </Button>

            <p className="text-[11px] text-stone-400">
              Or re-scan the table QR code if you are starting a new order.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return <MenuSkeleton />;
  }

  if (error || !menuData) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#fafaf9] p-6 text-center text-[#1c1917]">
        <div className="rounded-3xl border border-stone-200 bg-white p-8 shadow-xl max-w-sm w-full space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100 text-[#1c1917]">
            <Coffee className="h-7 w-7 stroke-[1.8]" />
          </div>
          <h2 className="font-serif text-xl font-bold">Unable to Open Menu</h2>
          <p className="text-xs text-stone-500 leading-relaxed">
            {error || "Could not retrieve the dining menu. Please check with your server or rescan the table QR code."}
          </p>
          <Button
            onClick={() => window.location.reload()}
            className="w-full rounded-2xl bg-[#1c1917] text-white font-bold text-xs h-11 hover:bg-stone-800"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const { restaurant, table } = menuData;
  const currency = restaurant.currency || "₹";
  const totalCartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const totalCartPrice = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const displayName = restaurant.name || "THE ROAST ROOM";
  const tableLocation = table.location || "Main Floor";
  const formattedTableNum = String(table.tableNumber).padStart(2, "0");

  return (
    <div className="min-h-screen bg-[#fafaf9] text-[#1c1917] font-sans antialiased relative pb-36 selection:bg-[#1c1917] selection:text-white">
      {/* 1. CLASSIC RICH LUXURY HERO HEADER */}
      <HeroHeader
        restaurantName={displayName}
        tableNumber={formattedTableNum}
        subtitle="Café & Roastery"
        daypartBadge={daypartGreeting}
        lang={lang}
        onChangeLanguage={(newLang) => handleSelectLang(newLang as Language)}
        onCallServiceClick={() => {
          triggerHaptic("selection");
          setWaiterModalType("CALL_WAITER");
          setShowWaiterModal(true);
        }}
      />

      {/* 3. STICKY SEARCH & CATEGORY NAVIGATION BAR (Section 6 & 8) */}
      <div className="sticky top-0 z-30 bg-[#fafaf9]/95 backdrop-blur-md border-b border-stone-200/70 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
        <div className="max-w-md mx-auto px-4 pt-2.5 pb-2">
          {/* Large Elegant Search Field with Voice Ordering */}
          <div className="relative flex items-center h-12 rounded-2xl border border-stone-200/90 bg-white px-3.5 shadow-2xs focus-within:ring-2 focus-within:ring-stone-900/10 focus-within:border-stone-900 transition-all">
            <Search className="h-4.5 w-4.5 text-stone-400 shrink-0 mr-2.5" />
            <Input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dishes, drinks, ingredients..."
              className="border-0 shadow-none focus-visible:ring-0 text-xs sm:text-sm text-[#1c1917] placeholder:text-stone-400 bg-transparent p-0 h-full flex-1"
              id="input-customer-menu-search"
            />
            {search ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  searchInputRef.current?.focus();
                }}
                className="h-6 w-6 grid place-items-center rounded-full bg-stone-100 text-stone-600 hover:text-stone-950 transition-colors mr-1"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}

            {/* Voice Ordering Trigger */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                setShowVoiceModal(true);
              }}
              className="h-8 w-8 -mr-1 rounded-xl flex items-center justify-center text-stone-500 hover:text-[#1c1917] hover:bg-stone-100 active:scale-95 transition-all"
              title="Order with Voice"
              aria-label="Order with Voice"
              id="button-menu-voice-search"
            >
              <Mic className="h-4.5 w-4.5" />
            </button>
          </div>

          {/* ONE Horizontal Category Navigation Only (Section 8) */}
          <div
            ref={categoryScrollRef}
            className="no-scrollbar scrollbar-none -mx-4 flex items-center gap-2 overflow-x-auto px-4 pt-3 pb-0.5"
          >
            <button
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                setSelectedCategory("ALL");
              }}
              className={`shrink-0 h-8.5 px-4 rounded-full text-xs font-semibold transition-all ${
                selectedCategory === "ALL" && !search
                  ? "bg-[#1c1917] text-white shadow-2xs font-bold"
                  : "bg-white border border-stone-200 text-stone-700 hover:bg-stone-50"
              }`}
              id="category-pill-all"
            >
              All
            </button>

            {prioritizedCategories.map((cat) => {
              const catName =
                lang !== "en" && cat.translations?.[lang]?.name
                  ? cat.translations[lang]!.name!
                  : cat.name;
              const isSelected =
                selectedCategory === cat.id ||
                (selectedCategory === "ALL" && !search && activeCategoryInView === cat.id);
              const count = menuData.items.filter((i) => i.categoryId === cat.id).length;

              return (
                <button
                  key={cat.id}
                  ref={(el) => {
                    categoryPillRefs.current[cat.id] = el;
                  }}
                  type="button"
                  onClick={() => handleSelectCategoryPill(cat.id)}
                  className={`shrink-0 h-8.5 px-3.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-[#1c1917] text-white shadow-2xs font-bold"
                      : "bg-white border border-stone-200 text-stone-700 hover:bg-stone-50"
                  }`}
                  id={`category-pill-${cat.id}`}
                >
                  <span>{catName}</span>
                  {count > 0 && (
                    <span
                      className={`text-[10px] font-sans tabular-nums opacity-60 ${
                        isSelected ? "text-white" : "text-stone-500"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. MAIN CONTENT CONTAINER (Section 10, 11, 12) */}
      <main className="w-full max-w-md mx-auto px-4 pt-3">
        {/* Persistent Active Order Banner */}
        {activeOrder && (
          <div
            className="mb-4 rounded-2xl border border-stone-800 bg-[#1c1917] text-white p-3 flex items-center justify-between shadow-xs animate-in fade-in"
            id="banner-active-customer-order"
          >
            <div className="flex items-center gap-2.5 min-w-0 pr-2">
              <div className="h-8 w-8 rounded-full bg-white/10 text-white grid place-items-center shrink-0">
                <ChefHat className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white">
                    Order #{activeOrder.orderNumber}
                  </span>
                  <span className="text-[10px] font-semibold text-amber-300 uppercase bg-amber-400/20 px-1.5 py-0.2 rounded-md">
                    {activeOrder.status === "NEEDS_APPROVAL" || activeOrder.status === "NEW" || activeOrder.status === "PENDING_WAITER_APPROVAL"
                      ? "Waiting for confirmation"
                      : activeOrder.status === "APPROVED" || activeOrder.status === "ACCEPTED"
                      ? "Confirmed"
                      : activeOrder.status === "PREPARING"
                      ? "Preparing"
                      : activeOrder.status === "READY"
                      ? "Ready"
                      : "Active"}
                  </span>
                </div>
                <p className="text-[11px] text-stone-300 truncate mt-0.5">
                  {activeOrder.itemsCount} items · Table {formattedTableNum}
                </p>
              </div>
            </div>

            <Link
              href={`/menu/${restaurantSlug}/table/${tableSlug}/orders`}
              className="h-8 px-3 rounded-xl bg-white text-[#1c1917] text-xs font-bold flex items-center gap-1 shrink-0 hover:bg-stone-200 transition-all"
            >
              <span>Track</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}

        {/* Live Shared Cart Alert Notice */}
        {sharedCartNotice && (
          <div className="mb-3 flex items-center justify-between rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-800 shadow-2xs animate-in fade-in">
            <span>{sharedCartNotice}</span>
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="text-xs underline font-bold ml-2 text-[#1c1917]"
            >
              View Cart
            </button>
          </div>
        )}

        {/* CLEAN SEARCH RESULTS VIEW (Section 7) */}
        {search.trim() ? (
          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between pb-1 text-xs">
              <span className="font-semibold text-stone-600">
                {filteredItems.length} {filteredItems.length === 1 ? "dish found" : "dishes found"} for "{search}"
              </span>
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-stone-500 underline font-medium hover:text-[#1c1917]"
              >
                Clear Search
              </button>
            </div>

            {filteredItems.length > 0 ? (
              <div className="divide-y divide-stone-200/70">
                {filteredItems.map((item) => renderFoodItem(item))}
              </div>
            ) : (
              <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center space-y-4 shadow-2xs">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-700">
                  <Search className="h-6 w-6 stroke-[1.8]" />
                </div>
                <div>
                  <h3 className="font-serif text-base font-bold text-[#1c1917]">
                    No exact match for "{search}"
                  </h3>
                  {searchResults?.correctedQuery && (
                    <div className="mt-2">
                      <p className="text-xs text-stone-500 mb-1">Did you mean:</p>
                      <button
                        type="button"
                        onClick={() => setSearch(searchResults.correctedQuery!)}
                        className="px-3.5 py-1.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200 text-xs font-bold hover:bg-amber-100 transition-colors"
                      >
                        {searchResults.correctedQuery}
                      </button>
                    </div>
                  )}
                </div>

                {relatedSearchItems.length > 0 && (
                  <div className="pt-3 border-t border-stone-100 text-left">
                    <p className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">
                      Related Dishes
                    </p>
                    <div className="divide-y divide-stone-200/70">
                      {relatedSearchItems.slice(0, 3).map((it) => renderFoodItem(it))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : selectedCategory !== "ALL" ? (
          /* SINGLE CATEGORY VIEW (Pizza · 32 items, followed by vertical list) */
          <div className="space-y-2">
            <div className="pt-2 pb-2 flex items-baseline justify-between border-b border-stone-200">
              <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#1c1917] tracking-tight">
                {prioritizedCategories.find((c) => c.id === selectedCategory)?.name || "Category Items"}
              </h2>
              <span className="text-xs font-sans tabular-nums text-stone-400 font-semibold">
                {filteredItems.length} {filteredItems.length === 1 ? "dish" : "dishes"}
              </span>
            </div>

            <div className="divide-y divide-stone-200/70">
              {filteredItems.map((item) => renderFoodItem(item))}
            </div>
          </div>
        ) : (
          /* "ALL" VIEW: Natural Continuous Category Flow (Smooth 600+ Item Scrolling) */
          <div className="space-y-6">
            {/* Popular Items Showcase */}
            {popularItems.length > 0 && (
              <section className="pt-1 pb-1">
                <div className="flex items-baseline justify-between mb-3 px-0.5">
                  <h3 className="font-serif text-lg sm:text-xl font-bold text-[#1c1917] tracking-tight">
                    Popular Items
                  </h3>
                  <span className="text-xs font-sans tabular-nums text-stone-400 font-semibold">
                    {popularItems.length} {popularItems.length === 1 ? "dish" : "dishes"}
                  </span>
                </div>

                <div className="no-scrollbar scrollbar-none -mx-4 flex items-stretch gap-3.5 overflow-x-auto px-4 pb-2.5 snap-x snap-mandatory">
                  {popularItems.map((item) => {
                    const inCart = cart.find((c) => c.id === item.id || c.menuItemId === item.id);
                    const customizable = isItemCustomizable(item);
                    const foodImg = getFoodImage(item.name, undefined, item.imageUrl);

                    return (
                      <div
                        key={`pop-${item.id}`}
                        className="shrink-0 w-44 snap-start rounded-2xl bg-white border border-stone-200/80 p-2.5 shadow-2xs flex flex-col justify-between group hover:shadow-xs transition-shadow"
                      >
                        <div>
                          <div
                            onClick={() => handleOpenDishDetail(item)}
                            className="relative h-28 w-full rounded-xl overflow-hidden bg-stone-100 cursor-pointer"
                          >
                            <img
                              src={foodImg}
                              alt={item.name}
                              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                            />
                            <div className="absolute top-2 left-2">
                              <span
                                className={`h-4 w-4 rounded-[3px] border ${
                                  item.veg ? "border-emerald-600" : "border-rose-700"
                                } p-0.5 flex items-center justify-center bg-white/95 shadow-2xs`}
                              >
                                <span
                                  className={`h-2 w-2 ${
                                    item.veg
                                      ? "bg-emerald-600 rounded-full"
                                      : "bg-rose-700 rounded-sm"
                                  }`}
                                />
                              </span>
                            </div>
                          </div>

                          <div className="mt-2.5">
                            <h4
                              onClick={() => handleOpenDishDetail(item)}
                              className="font-serif text-sm font-bold text-[#1c1917] line-clamp-1 cursor-pointer hover:text-stone-700"
                            >
                              {item.name}
                            </h4>
                            <div className="mt-1 font-sans tabular-nums tracking-tight font-bold text-xs sm:text-sm text-[#1c1917]">
                              {currency}{item.price}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex justify-end">
                          <MorphingAddButton
                            quantity={inCart?.quantity || 0}
                            available={item.available !== false}
                            customizable={customizable}
                            itemId={item.id}
                            variant="pill"
                            onAdd={() => {
                              if (customizable) {
                                setItemToCustomize(item);
                              } else {
                                handleUpdateQuantity(item.id, 1);
                              }
                            }}
                            onIncrement={() => handleUpdateQuantity(item.id, 1)}
                            onDecrement={() => handleUpdateQuantity(item.id, -1)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {groupedItemsByCategory && groupedItemsByCategory.map(({ category, items }) => (
              <section
                key={category.id}
                ref={(el) => {
                  categorySectionRefs.current[category.id] = el;
                }}
                data-category-id={category.id}
                className="space-y-2"
              >
                {/* Category Header */}
                <div className="pt-3 pb-2 flex items-baseline justify-between border-b border-stone-200">
                  <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#1c1917] tracking-tight">
                    {category.name}
                  </h2>
                  <span className="text-xs font-sans tabular-nums text-stone-400 font-semibold">
                    {items.length} {items.length === 1 ? "dish" : "dishes"}
                  </span>
                </div>

                {/* Vertical Food List */}
                <div className="divide-y divide-stone-200/70">
                  {items.map((item) => renderFoodItem(item))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* 5. FLOATING COMPACT ACTION CART BAR (Section 18, 19, 20) */}
      <FloatingCartPill
        totalItemsCount={totalCartCount}
        grandTotal={totalCartPrice}
        currency={currency}
        onClick={() => {
          triggerHaptic("medium");
          setIsCartOpen(true);
        }}
      />

      {/* 6. BOTTOM NAVIGATION (Section 21: Exactly 3 Tabs: Menu / Orders / Bill) */}
      <BottomNav
        activeTab="menu"
        ordersBadgeCount={activeOrder ? 1 : 0}
        billTotal={menuData.session?.sessionTotal || 0}
        currency={currency}
        hasActiveOrders={Boolean(activeOrder)}
        onSelectTab={(tab) => {
          if (tab === "orders") {
            setLocation(`/menu/${restaurantSlug}/table/${tableSlug}/orders`);
          } else if (tab === "bill") {
            setLocation(`/menu/${restaurantSlug}/table/${tableSlug}/bill`);
          } else if (tab === "menu") {
            setSelectedCategory("ALL");
            setSearch("");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        }}
      />

      {/* CUSTOMER CART SHEET */}
      <CustomerCart
        restaurantSlug={restaurantSlug}
        tableSlug={tableSlug}
        tableNumber={table.tableNumber}
        currency={currency}
        cart={cart}
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onUpdateQuantity={handleUpdateQuantity}
        onClearCart={handleClearCart}
        onOrderPlaced={handleOrderPlaced}
        dinerName={dinerName}
      />

      {/* ITEM MODIFIER / CUSTOMIZATION MODAL */}
      {itemToCustomize && (
        <ItemModifierModal
          isOpen={Boolean(itemToCustomize)}
          item={itemToCustomize}
          currency={currency}
          modifierGroups={itemEffectiveModifierGroups}
          onClose={() => setItemToCustomize(null)}
          onAddToCart={handleAddCustomizedItem}
        />
      )}

      {/* CALL WAITER DIALOG */}
      {showWaiterModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setShowWaiterModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-white p-5 shadow-2xl border border-stone-200 space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-[#1c1917]" />
                <h3 className="font-serif text-lg font-bold text-[#1c1917]">
                  Call Server
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowWaiterModal(false)}
                className="h-8 w-8 rounded-full bg-stone-100 grid place-items-center text-stone-500 hover:text-[#1c1917]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-stone-500 leading-relaxed">
              How can we assist Table {formattedTableNum}? A floor captain will be notified immediately.
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              {[
                { type: "WATER", label: "Water Refill", icon: "💧" },
                { type: "CLEAN", label: "Clear Plates", icon: "🧹" },
                { type: "CALL_WAITER", label: "Server Assistance", icon: "🙋" },
                { type: "BILL", label: "Bring Bill", icon: "🧾" },
              ].map((btn) => (
                <button
                  key={btn.type}
                  type="button"
                  disabled={callingWaiter}
                  onClick={() => handleCallWaiter(btn.type)}
                  className={`h-16 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all ${
                    callSuccessType === btn.type
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-[#fafaf9] border-stone-200 text-[#1c1917] hover:bg-stone-100 active:scale-95"
                  }`}
                >
                  <span className="text-lg">{btn.icon}</span>
                  <span>{btn.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* DISH DETAIL MODAL */}
      {selectedDishForDetail && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 animate-in fade-in duration-150"
          onClick={() => setSelectedDishForDetail(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[85vh] rounded-t-3xl sm:rounded-3xl bg-white overflow-hidden shadow-2xl border border-stone-200 flex flex-col"
          >
            <div className="relative aspect-[16/10] w-full bg-stone-100">
              <img
                src={getFoodImage(selectedDishForDetail.name, undefined, selectedDishForDetail.imageUrl)}
                alt={selectedDishForDetail.name}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => setSelectedDishForDetail(null)}
                className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black/50 text-white grid place-items-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="h-4 w-4 rounded-md bg-stone-50 p-0.5 border border-stone-200 flex items-center justify-center">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          selectedDishForDetail.veg ? "bg-emerald-600" : "bg-rose-600"
                        }`}
                      />
                    </span>
                    {selectedDishForDetail.isBestseller && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1c1917] text-white">
                        Bestseller
                      </span>
                    )}
                  </div>
                  <h3 className="font-serif text-xl font-bold text-[#1c1917]">
                    {selectedDishForDetail.name}
                  </h3>
                </div>

                <div className="font-sans tabular-nums font-bold text-xl text-[#1c1917]">
                  {currency}{selectedDishForDetail.price}
                </div>
              </div>

              <p className="text-xs text-stone-600 leading-relaxed font-sans">
                {selectedDishForDetail.description || "Prepared fresh to order with house seasonings and authentic ingredients."}
              </p>

              {dishReviewsData && dishReviewsData.reviews && dishReviewsData.reviews.length > 0 && (
                <div className="pt-3 border-t border-stone-100 space-y-2">
                  <h4 className="font-serif font-bold text-xs uppercase tracking-wider text-stone-500">
                    Guest Reviews
                  </h4>
                  <div className="space-y-2">
                    {dishReviewsData.reviews.slice(0, 2).map((rev: any, idx: number) => (
                      <div key={idx} className="p-2.5 rounded-xl bg-stone-50 text-xs">
                        <div className="font-semibold text-stone-800">{rev.reviewerName || "Diner"}</div>
                        <p className="text-stone-600 mt-0.5">{rev.comment}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-3">
                <Button
                  onClick={() => {
                    if (isItemCustomizable(selectedDishForDetail)) {
                      setItemToCustomize(selectedDishForDetail);
                      setSelectedDishForDetail(null);
                    } else {
                      handleUpdateQuantity(selectedDishForDetail.id, 1);
                      setSelectedDishForDetail(null);
                    }
                  }}
                  className="w-full h-12 rounded-2xl bg-[#1c1917] hover:bg-stone-800 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  <span>
                    {isItemCustomizable(selectedDishForDetail) ? "Customise & Add" : `Add to Order · ${currency}${selectedDishForDetail.price}`}
                  </span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VOICE ORDER MODAL */}
      {showVoiceModal && menuData && (
        <VoiceOrderModal
          isOpen={showVoiceModal}
          onClose={() => setShowVoiceModal(false)}
          lang={lang}
          currency={currency}
          menuItems={menuData.items}
          onAddToCart={(items) => {
            items.forEach((it) => {
              handleUpdateQuantity(it.menuItemId, it.quantity);
            });
            setShowVoiceModal(false);
            setIsCartOpen(true);
          }}
        />
      )}
    </div>
  );
}

export default CustomerMenuView;
