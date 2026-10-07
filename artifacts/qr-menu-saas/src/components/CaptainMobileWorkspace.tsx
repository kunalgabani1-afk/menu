import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import {
  Camera,
  QrCode,
  Search,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Clock,
  Users,
  LogOut,
  ChevronRight,
  X,
  ArrowLeft,
  RefreshCw,
  KeyRound,
  AlertCircle,
  ShoppingBag,
  Sparkles,
  ExternalLink,
  Lock,
  ChevronDown,
  ChefHat,
  BellRing,
  Home,
  UtensilsCrossed,
  Receipt,
  User,
  LayoutGrid,
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TablelineLoader, TablelineSymbol } from "./TablelineLoading";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getIdToken, signOutCurrentUser, signInWithCustomToken } from "@/lib/firebase";

// Interfaces
interface StaffUser {
  uid: string;
  name: string;
  email: string;
  role: string;
}

interface RestaurantProfile {
  id: string;
  name: string;
  slug: string;
  currency: string;
  taxRate: number;
  plan: string;
}

interface TableItem {
  id: string;
  tableNumber: string;
  slug: string;
  location: string | null;
  capacity: number;
  status: "AVAILABLE" | "OCCUPIED" | "DEACTIVATED";
  active: boolean;
  activeSessionId: string | null;
  activeOrdersCount: number;
}

interface CategoryItem {
  id: string;
  name: string;
  sortOrder: number;
}

interface MenuItemVariant {
  id: string;
  name: string;
  price: number;
}

interface MenuItemAddon {
  id: string;
  name: string;
  price: number;
}

interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  veg: boolean;
  isAvailable: boolean;
  variants: MenuItemVariant[];
  addons: MenuItemAddon[];
  imageUrl?: string | null;
}

interface CartItem {
  cartId: string;
  itemId: string;
  name: string;
  basePrice: number;
  selectedVariant?: MenuItemVariant | null;
  selectedAddons: MenuItemAddon[];
  quantity: number;
  notes?: string;
  itemPrice: number;
}

interface RecentOrder {
  id: string;
  orderNumber: string;
  tableId: string;
  tableNumber: string;
  status: string;
  total: number;
  itemCount: number;
  itemsSummary: string;
  createdAt: string;
  createdByStaff?: { uid: string; name: string } | null;
}

interface StaffRosterMember {
  uid: string;
  name: string;
  email: string;
  role: string;
  hasPin: boolean;
  isCurrent: boolean;
}

interface ExistingSessionOrder {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  subtotal: number;
  itemsCount: number;
  createdAt: string;
  items?: Array<{ name: string; quantity: number; price: number }>;
}

type CaptainTab = "home" | "tables" | "orders" | "me";

export function CaptainMobileWorkspace() {
  const params = useParams<{ slug?: string }>();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  // Extract query parameters like ?table=07
  const searchParams = new URLSearchParams(window.location.search);
  const initialTableParam = searchParams.get("table");

  // App state
  const [activeTab, setActiveTab] = useState<CaptainTab>("home");
  const [loading, setLoading] = useState(true);
  const [planGated, setPlanGated] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  // Data
  const [restaurant, setRestaurant] = useState<RestaurantProfile | null>(null);
  const [currentStaff, setCurrentStaff] = useState<StaffUser | null>(null);
  const [tables, setTables] = useState<TableItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [stats, setStats] = useState({ todayOrdersCount: 0, activeTablesCount: 0, totalTablesCount: 0 });

  // Selected Table & Active Ordering Screen
  const [selectedTable, setSelectedTable] = useState<TableItem | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [existingOrders, setExistingOrders] = useState<ExistingSessionOrder[]>([]);
  const [existingSessionTotal, setExistingSessionTotal] = useState(0);
  const [showExistingOrders, setShowExistingOrders] = useState(false);

  // Cart State for the selected table (never leaked across staff)
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cookingNotes, setCookingNotes] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState<{ id: string; orderNumber: string; tableNumber: string } | null>(null);

  // Customization modal (variants / addons)
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<MenuItemVariant | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<MenuItemAddon[]>([]);

  // Menu Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [vegOnly, setVegOnly] = useState(false);

  // QR Scanner Modal State
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [manualTableInput, setManualTableInput] = useState("");
  const [isResolvingQr, setIsResolvingQr] = useState(false);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  // Staff Switch Modal State
  const [isSwitchModalOpen, setIsSwitchModalOpen] = useState(false);
  const [staffRoster, setStaffRoster] = useState<StaffRosterMember[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [selectedStaffForSwitch, setSelectedStaffForSwitch] = useState<StaffRosterMember | null>(null);
  const [switchPin, setSwitchPin] = useState("");
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  // Set/Change PIN State
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState("");
  const [newPinInput, setNewPinInput] = useState("");
  const [confirmPinInput, setConfirmPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [isSavingPin, setIsSavingPin] = useState(false);

  // Recent Tables history (stored per staff)
  const [recentTables, setRecentTables] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("tableline_recent_tables");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Settle Bill & Free Table Modal State
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleMethod, setSettleMethod] = useState<"COUNTER" | "CASH" | "CARD" | "UPI">("CASH");
  const [settlingBill, setSettlingBill] = useState(false);

  const resolvedSlug = params.slug || restaurant?.slug || "cafe-1";

  // Bootstrap captain data
  const fetchBootstrap = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getIdToken();
      if (!token) {
        setUnauthorized(true);
        setLocation(`/login?redirect=/captain/${params.slug || "cafe-1"}`);
        return;
      }

      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      const targetSlug = params.slug || "cafe-1";
      const res = await fetch(`/api/restaurants/${targetSlug}/captain/bootstrap`, { headers });

      if (res.status === 401) {
        setUnauthorized(true);
        setLocation(`/login?redirect=/captain/${targetSlug}`);
        return;
      }

      if (res.status === 403) {
        const errData = await res.json().catch(() => ({}));
        if (errData.code === "PLAN_LIMITATION") {
          setPlanGated(true);
          return;
        }
        setUnauthorized(true);
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setRestaurant(data.restaurant);
        setCurrentStaff(data.staff);
        setTables(data.tables || []);
        setCategories(data.categories || []);
        setItems(data.items || []);
        setRecentOrders(data.recentOrders || []);
        setStats(data.stats || { todayOrdersCount: 0, activeTablesCount: 0, totalTablesCount: 0 });
        setPlanGated(false);
        setUnauthorized(false);
      }
    } catch {
      // network or fetch error
    } finally {
      setLoading(false);
    }
  }, [params.slug, setLocation]);

  useEffect(() => {
    fetchBootstrap();
  }, [fetchBootstrap]);

  // Realtime Live EventSource connection to kitchen & live orders stream
  useEffect(() => {
    if (!resolvedSlug || planGated || unauthorized) return;
    let es: EventSource | null = null;
    try {
      es = new EventSource(`/api/restaurants/${resolvedSlug}/orders/stream`);
      es.addEventListener("new_order", () => {
        fetchBootstrap();
      });
      es.addEventListener("order_status_updated", () => {
        fetchBootstrap();
      });
    } catch {}

    const interval = setInterval(fetchBootstrap, 10000);
    return () => {
      clearInterval(interval);
      es?.close();
    };
  }, [resolvedSlug, planGated, unauthorized, fetchBootstrap]);

  // Load Table session & existing orders when a table is opened
  const handleSelectTable = useCallback(
    async (table: TableItem) => {
      if (!table.active || table.status === "DEACTIVATED") {
        toast({
          variant: "destructive",
          title: "Table Unavailable",
          description: `Table ${table.tableNumber} is deactivated.`,
        });
        return;
      }

      setSelectedTable(table);
      setTableLoading(true);
      setExistingOrders([]);
      setExistingSessionTotal(0);
      setShowExistingOrders(false);
      setSubmittedOrder(null);
      setCookingNotes("");

      // Update recent tables history
      setRecentTables((prev) => {
        const filtered = prev.filter((num) => num !== table.tableNumber);
        const updated = [table.tableNumber, ...filtered].slice(0, 6);
        localStorage.setItem("tableline_recent_tables", JSON.stringify(updated));
        return updated;
      });

      try {
        const token = await getIdToken();
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch(
          `/api/restaurants/${resolvedSlug}/captain/tables/${table.id}/session`,
          { headers },
        );
        if (res.ok) {
          const sessionData = await res.json();
          setExistingOrders(sessionData.existingOrders || []);
          setExistingSessionTotal(sessionData.sessionTotal || 0);
          if (sessionData.existingOrders?.length > 0) {
            setShowExistingOrders(true);
          }
        }
      } catch {
        // error loading session
      } finally {
        setTableLoading(false);
      }
    },
    [resolvedSlug, toast],
  );

  // Settle Bill for Selected Table
  const handleSettleBill = async () => {
    if (!selectedTable) return;
    setSettlingBill(true);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(
        `/api/restaurants/${resolvedSlug}/captain/tables/${selectedTable.id}/settle-bill`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ paymentMethod: settleMethod }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to settle bill");
      }

      const data = await res.json();
      toast({
        title: `Table ${selectedTable.tableNumber} Bill Settled!`,
        description: `Settled ${restaurant?.currency || "₹"}${data.settledAmount || existingSessionTotal} via ${settleMethod}. Table is now available.`,
      });

      setShowSettleModal(false);
      setExistingOrders([]);
      setExistingSessionTotal(0);
      setShowExistingOrders(false);
      setSelectedTable((prev) =>
        prev ? { ...prev, status: "AVAILABLE", activeSessionId: null } : null
      );
      fetchBootstrap();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Settlement failed",
        description: err.message || "Could not settle table bill.",
      });
    } finally {
      setSettlingBill(false);
    }
  };

  // If initial URL contains ?table=..., auto-select that table
  useEffect(() => {
    if (initialTableParam && tables.length > 0 && !selectedTable) {
      const match = tables.find(
        (t) =>
          t.tableNumber.toLowerCase() === initialTableParam.toLowerCase() ||
          t.slug.toLowerCase() === initialTableParam.toLowerCase() ||
          t.id === initialTableParam,
      );
      if (match) {
        handleSelectTable(match);
      }
    }
  }, [initialTableParam, tables, selectedTable, handleSelectTable]);

  // QR Scanner logic
  const startScanner = async () => {
    setIsScannerOpen(true);
    setScannerError(null);
    setManualTableInput("");

    setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode("captain-qr-reader");
        html5QrCodeRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 220, height: 220 },
          },
          async (decodedText) => {
            await handleResolveQrCode(decodedText);
          },
          () => {
            // scan failure callback (frame by frame, ignore)
          },
        );
      } catch (err: any) {
        setScannerError(err?.message || "Could not access camera. Please enter table number manually.");
      }
    }, 300);
  };

  const stopScanner = async () => {
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        await html5QrCodeRef.current.stop();
      }
    } catch {}
    setIsScannerOpen(false);
  };

  const handleResolveQrCode = async (codeText: string) => {
    setIsResolvingQr(true);
    setScannerError(null);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${resolvedSlug}/captain/resolve-qr`, {
        method: "POST",
        headers,
        body: JSON.stringify({ qrCode: codeText }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setScannerError(errData.error || "Invalid table QR code for this restaurant.");
        return;
      }

      const data = await res.json();
      await stopScanner();

      // Find matched table in local state
      const matched = tables.find((t) => t.id === data.table.id) || data.table;
      handleSelectTable(matched);
      toast({
        title: `Table ${data.table.tableNumber} Identified`,
        description: "Ready to take order.",
      });
    } catch {
      setScannerError("Network error validating QR code.");
    } finally {
      setIsResolvingQr(false);
    }
  };

  // Cart operations
  const handleAddToCart = (item: MenuItem) => {
    if (!item.isAvailable) {
      toast({ variant: "destructive", title: "Item Unavailable", description: `${item.name} is currently out of stock.` });
      return;
    }

    if (item.variants.length > 0 || item.addons.length > 0) {
      setCustomizingItem(item);
      setSelectedVariant(item.variants.length > 0 ? item.variants[0] : null);
      setSelectedAddons([]);
      return;
    }

    // Direct add
    setCart((prev) => {
      const existingIdx = prev.findIndex(
        (ci) => ci.itemId === item.id && !ci.selectedVariant && ci.selectedAddons.length === 0,
      );
      if (existingIdx > -1) {
        const copy = [...prev];
        copy[existingIdx].quantity += 1;
        return copy;
      }
      return [
        ...prev,
        {
          cartId: `${item.id}-${Date.now()}`,
          itemId: item.id,
          name: item.name,
          basePrice: item.price,
          selectedVariant: null,
          selectedAddons: [],
          quantity: 1,
          itemPrice: item.price,
        },
      ];
    });
  };

  const handleConfirmCustomization = () => {
    if (!customizingItem) return;

    const basePrice = selectedVariant ? selectedVariant.price : customizingItem.price;
    const addonsTotal = selectedAddons.reduce((acc, a) => acc + a.price, 0);
    const itemPrice = basePrice + addonsTotal;

    const customCartId = `${customizingItem.id}-${selectedVariant?.id || "def"}-${selectedAddons
      .map((a) => a.id)
      .sort()
      .join("_")}`;

    setCart((prev) => {
      const existingIdx = prev.findIndex((ci) => ci.cartId === customCartId);
      if (existingIdx > -1) {
        const copy = [...prev];
        copy[existingIdx].quantity += 1;
        return copy;
      }
      return [
        ...prev,
        {
          cartId: customCartId,
          itemId: customizingItem.id,
          name: customizingItem.name,
          basePrice: customizingItem.price,
          selectedVariant,
          selectedAddons,
          quantity: 1,
          itemPrice,
        },
      ];
    });

    setCustomizingItem(null);
  };

  const handleUpdateQuantity = (cartId: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((ci) => {
          if (ci.cartId === cartId) {
            const nextQty = ci.quantity + delta;
            return nextQty > 0 ? { ...ci, quantity: nextQty } : null;
          }
          return ci;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  // Cart Calculations
  const cartSubtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.itemPrice * item.quantity, 0);
  }, [cart]);

  const rawTaxRate = Number(restaurant?.taxRate ?? 5);
  const taxRate = rawTaxRate > 1 ? rawTaxRate / 100 : rawTaxRate < 0 ? 0.05 : rawTaxRate;
  const taxPercentageDisplay = rawTaxRate > 1 ? rawTaxRate : Number((rawTaxRate * 100).toFixed(2));
  const cartTax = Math.round(cartSubtotal * taxRate * 100) / 100;
  const cartTotal = Math.round((cartSubtotal + cartTax) * 100) / 100;
  const totalCartItemsCount = cart.reduce((acc, i) => acc + i.quantity, 0);

  // Send Order to Kitchen (idempotent, safe)
  const handleSendToKitchen = async () => {
    if (!selectedTable) return;
    if (cart.length === 0) {
      toast({ variant: "destructive", title: "Cart is empty" });
      return;
    }

    setIsSubmittingOrder(true);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      // Unique idempotent key preventing duplicate orders
      const idempotencyKey = `captain-${selectedTable.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const orderPayload = {
        tableId: selectedTable.id,
        tableNumber: selectedTable.tableNumber,
        sessionId: selectedTable.activeSessionId || undefined,
        idempotencyKey,
        captainRequestId: idempotencyKey,
        notes: cookingNotes.trim() || undefined,
        customerNote: cookingNotes.trim() || undefined,
        items: cart.map((ci) => ({
          menuItemId: ci.itemId,
          id: ci.itemId,
          name: ci.name,
          price: ci.itemPrice,
          quantity: ci.quantity,
          selectedVariantId: ci.selectedVariant?.id || undefined,
          variant: ci.selectedVariant ? { id: ci.selectedVariant.id, name: ci.selectedVariant.name } : undefined,
          selectedAddonIds: ci.selectedAddons.map((a) => a.id),
          addons: ci.selectedAddons.map((a) => ({ id: a.id, name: a.name, price: a.price })),
          specialInstructions: ci.notes || undefined,
        })),
      };

      const res = await fetch(`/api/restaurants/${resolvedSlug}/orders/captain`, {
        method: "POST",
        headers,
        body: JSON.stringify(orderPayload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to send order to kitchen.");
      }

      const created = await res.json();

      // Clear current cart immediately to prevent duplicate submissions
      setCart([]);
      setCookingNotes("");
      setIsCartOpen(false);

      setSubmittedOrder({
        id: created.id,
        orderNumber: created.orderNumber || String(created.id).slice(-4).toUpperCase(),
        tableNumber: selectedTable.tableNumber,
      });

      // Refresh table state and stats
      fetchBootstrap();
      if (selectedTable) {
        handleSelectTable(selectedTable);
      }

      toast({
        title: "Order Sent to Kitchen! 👨‍🍳",
        description: `Table ${selectedTable.tableNumber} • Order #${created.orderNumber || "New"}`,
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not send order",
        description: err.message || "Please check connection and try again.",
      });
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // Staff Switch Modal Handling
  const openStaffSwitchModal = async () => {
    setIsSwitchModalOpen(true);
    setSelectedStaffForSwitch(null);
    setSwitchPin("");
    setSwitchError(null);
    setLoadingRoster(true);

    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${resolvedSlug}/captain/staff-roster`, { headers });
      if (res.ok) {
        const data = await res.json();
        setStaffRoster(data.roster || []);
      }
    } catch {
      setSwitchError("Failed to load staff roster.");
    } finally {
      setLoadingRoster(false);
    }
  };

  const handleExecuteStaffSwitch = async () => {
    if (!selectedStaffForSwitch) return;
    if (!switchPin || switchPin.length < 4) {
      setSwitchError("Please enter a 4 to 6 digit numeric PIN.");
      return;
    }

    setIsSwitching(true);
    setSwitchError(null);

    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${resolvedSlug}/captain/switch-staff`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          targetUid: selectedStaffForSwitch.uid,
          pin: switchPin,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setSwitchError(errData.error || "Incorrect PIN or switch failed.");
        return;
      }

      const switchResult = await res.json();

      // Clear any in-progress cart from previous staff to guarantee safety
      setCart([]);
      setSelectedTable(null);
      setCookingNotes("");

      // Authenticate with Firebase custom token
      await signInWithCustomToken(switchResult.customToken);

      setIsSwitchModalOpen(false);
      setSelectedStaffForSwitch(null);
      setSwitchPin("");

      toast({
        title: "Staff Switched! 👤",
        description: `Now logged in as ${switchResult.user.name}.`,
      });

      // Refresh data with new user context
      fetchBootstrap();
    } catch (err: any) {
      setSwitchError(err.message || "Failed to switch staff member.");
    } finally {
      setIsSwitching(false);
    }
  };

  // Save / Update Quick Switch PIN
  const handleSavePin = async () => {
    setPinError(null);
    if (!/^\d{4,6}$/.test(newPinInput)) {
      setPinError("New PIN must be exactly 4 to 6 numeric digits.");
      return;
    }
    if (newPinInput !== confirmPinInput) {
      setPinError("New PIN and confirmation PIN do not match.");
      return;
    }

    setIsSavingPin(true);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${resolvedSlug}/captain/set-pin`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          pin: newPinInput,
          currentPin: currentPinInput || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setPinError(errData.error || "Failed to update PIN.");
        return;
      }

      setIsPinModalOpen(false);
      setCurrentPinInput("");
      setNewPinInput("");
      setConfirmPinInput("");
      toast({
        title: "PIN Updated",
        description: "Your 4-digit quick switch PIN is active.",
      });
    } catch {
      setPinError("Network error updating PIN.");
    } finally {
      setIsSavingPin(false);
    }
  };

  const handleSignOut = async () => {
    // Clear cart and sensitive state
    setCart([]);
    setSelectedTable(null);
    await signOutCurrentUser();
    setLocation("/login");
  };

  // Filtered menu items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (selectedCategory !== "all" && item.categoryId !== selectedCategory) {
        return false;
      }
      if (vegOnly && !item.veg) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [items, selectedCategory, vegOnly, searchQuery]);

  // Greeting by time of day
  const greeting = useMemo(() => {
    const hr = new Date().getHours();
    if (hr < 12) return "Good morning";
    if (hr < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  // 1. Plan Gated Screen (Starter Plan)
  if (planGated) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] text-[#2C1810] flex flex-col items-center justify-center p-6 text-center" id="captain-plan-gated">
        <div className="h-16 w-16 rounded-3xl bg-[#F5EDE4] text-[#C87D55] flex items-center justify-center mb-4 shadow-2xs border border-[#EDE4D8]">
          <Sparkles className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold font-serif text-[#2C1810]">Growth Plan Required</h1>
        <p className="mt-2 max-w-sm text-sm text-[#8C6D53] leading-relaxed">
          Captain Mobile Web Ordering allows floor waiters to scan tables, take orders, and dispatch tickets directly to the kitchen display.
        </p>
        <div className="mt-6 flex flex-col gap-2 w-full max-w-xs">
          <Button
            onClick={() => setLocation(`/dashboard/${resolvedSlug}/plans`)}
            className="w-full bg-[#2C1810] hover:bg-[#3D2314] text-[#FAF8F5] font-bold rounded-2xl h-12 shadow-sm"
            id="button-upgrade-captain-plan"
          >
            View Subscription Plans
          </Button>
          <Button
            variant="ghost"
            onClick={() => setLocation(`/dashboard/${resolvedSlug}`)}
            className="w-full text-[#8C6D53] hover:text-[#2C1810] rounded-2xl h-12"
            id="button-back-to-dashboard"
          >
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // 2. Loading Screen
  if (loading && !restaurant) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#141211] text-[#2C1810] dark:text-[#FBF8F2] flex flex-col items-center justify-center p-6" id="captain-loading-state">
        <TablelineLoader
          variant="page"
          message="Loading Captain Workspace…"
          subtext="Connecting tables, floor layout & orders…"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#2C1810] flex flex-col justify-between font-sans selection:bg-[#F5EDE4] selection:text-[#2C1810]" id="captain-mobile-workspace">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 bg-[#FAF8F5]/90 backdrop-blur-md border-b border-[#EDE4D8] px-4 py-3 flex items-center justify-between" id="captain-header">
        <div className="flex items-center gap-2.5">
          {/* Circular Brown TL Logo */}
          <div className="h-9 w-9 rounded-full bg-[#2C1810] flex items-center justify-center font-bold text-[#FAF8F5] text-xs tracking-wider shadow-2xs">
            TL
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-xs tracking-wider uppercase text-[#2C1810]">
                CAPTAIN
              </span>
              <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
            </div>
            <p className="text-[11px] text-[#8C6D53] font-medium leading-none truncate max-w-[130px] sm:max-w-[180px] mt-0.5">
              {restaurant?.name || "Restaurant"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Staff Switch Pill (Rounded Cream Profile Button) */}
          <button
            type="button"
            onClick={openStaffSwitchModal}
            className="flex items-center gap-1.5 bg-[#F3ECE4] hover:bg-[#EAE0D5] text-[#2C1810] border border-[#E5DACD] px-3 py-1.5 rounded-full text-xs font-medium transition-colors shadow-2xs"
            id="button-quick-switch-staff"
            title="Switch Staff"
          >
            <User className="h-3.5 w-3.5 text-[#C87D55]" />
            <span className="truncate max-w-[85px]">{currentStaff?.name ? currentStaff.name.split(" ")[0] : "Staff"}</span>
            <ChevronDown className="h-3 w-3 text-[#8C6D53]" />
          </button>

          {/* Admin Exit if user is owner/manager */}
          {(currentStaff?.role === "owner" || currentStaff?.role === "manager" || currentStaff?.role === "platform_admin") && (
            <button
              type="button"
              onClick={() => setLocation(`/dashboard/${resolvedSlug}`)}
              className="p-2 text-[#8C6D53] hover:text-[#2C1810] rounded-full bg-[#F3ECE4] border border-[#E5DACD] transition-colors"
              title="Return to Owner Dashboard"
              id="button-return-to-admin"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 pb-24" id="captain-main-viewport">
        {/* =========================================================================
            VIEW 1: ACTIVE TABLE ORDERING VIEW (WHEN A TABLE IS SELECTED)
        ========================================================================== */}
        {selectedTable ? (
          <div className="flex flex-col min-h-full" id="captain-table-ordering-screen">
            {/* Table Header */}
            <div className="sticky top-12 z-20 bg-[#FAF8F5]/95 backdrop-blur-md border-b border-[#EDE4D8] px-4 py-3 shadow-xs">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setSelectedTable(null)}
                  className="flex items-center gap-1 text-xs font-semibold text-[#8C6D53] hover:text-[#2C1810] py-1 pr-2 transition-colors"
                  id="button-back-to-home"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Exit Table</span>
                </button>

                <div className="flex items-center gap-2">
                  <div className="bg-[#F5EDE4] border border-[#E5DACD] text-[#2C1810] px-3 py-1 rounded-full text-xs font-bold">
                    TABLE {selectedTable.tableNumber}
                  </div>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      selectedTable.status === "OCCUPIED" ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                    title={selectedTable.status}
                  />
                </div>
              </div>

              {/* Existing Active Dining Session Info */}
              {existingOrders.length > 0 && (
                <div className="mt-2.5 bg-white border border-[#EDE4D8] rounded-2xl p-3 text-xs shadow-2xs" id="table-active-session-summary">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-[#2C1810]">Active Dining Session</span>
                      <p className="text-[11px] text-[#8C6D53]">
                        {existingOrders.length} order(s) already in kitchen
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-[#2C1810]">
                        {restaurant?.currency}
                        {existingSessionTotal.toLocaleString("en-IN")}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowExistingOrders(!showExistingOrders)}
                        className="block text-[10px] text-[#8C6D53] underline hover:text-[#2C1810]"
                        id="button-toggle-existing-orders"
                      >
                        {showExistingOrders ? "Hide orders" : "View orders"}
                      </button>
                    </div>
                  </div>

                  {showExistingOrders && (
                    <div className="mt-2 pt-2 border-t border-[#EDE4D8] space-y-1.5" id="existing-orders-list">
                      {existingOrders.map((eo) => (
                        <div key={eo.id} className="flex items-center justify-between text-[11px] text-[#2C1810]">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[#C87D55]">
                              #{eo.orderNumber || eo.id.slice(-4).toUpperCase()}
                            </span>
                            <span className="text-[#8C6D53]">({eo.itemsCount} items)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold">
                              {restaurant?.currency}
                              {eo.total}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                eo.status === "READY"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : eo.status === "PREPARING"
                                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                                  : "bg-[#F5EDE4] text-[#5C3B24]"
                              }`}
                            >
                              {eo.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-2.5 pt-2 border-t border-[#EDE4D8] flex items-center justify-between">
                    <span className="text-[11px] text-[#8C6D53]">Total Due: <strong className="text-[#2C1810] font-bold">{restaurant?.currency}{existingSessionTotal}</strong></span>
                    <button
                      type="button"
                      onClick={() => setShowSettleModal(true)}
                      className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition-colors shadow-2xs"
                      id="button-captain-settle-bill"
                    >
                      Settle Bill & Free Table
                    </button>
                  </div>
                </div>
              )}

              {/* Order Submitted Banner */}
              {submittedOrder && (
                <div className="mt-2.5 bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-xs flex items-center justify-between text-emerald-900 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                    <div>
                      <span className="font-bold">Order #{submittedOrder.orderNumber} Sent!</span>
                      <p className="text-[11px] text-emerald-700">Kitchen received this ticket.</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-emerald-800 hover:text-emerald-950 hover:bg-emerald-100/50"
                    onClick={() => setSubmittedOrder(null)}
                  >
                    Dismiss
                  </Button>
                </div>
              )}

              {/* Search and Filter Row */}
              <div className="mt-3 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#8C6D53]" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search menu items…"
                    className="bg-white border-[#EDE4D8] pl-9 h-9 text-xs text-[#2C1810] rounded-xl placeholder:text-[#A8927E] focus:border-[#C87D55]"
                    id="input-search-menu-captain"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-2.5 text-[#8C6D53] hover:text-[#2C1810]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setVegOnly(!vegOnly)}
                  className={`h-9 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs ${
                    vegOnly
                      ? "bg-emerald-600 text-white"
                      : "bg-white text-[#8C6D53] border border-[#EDE4D8] hover:text-[#2C1810]"
                  }`}
                  id="button-toggle-veg-only"
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Veg
                </button>
              </div>

              {/* Category Pills (horizontal scroll) */}
              <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedCategory("all")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    selectedCategory === "all"
                      ? "bg-[#2C1810] text-[#FAF8F5] font-bold shadow-2xs"
                      : "bg-[#F5EDE4] text-[#8C6D53] hover:text-[#2C1810]"
                  }`}
                  id="cat-pill-all"
                >
                  All ({items.length})
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                      selectedCategory === cat.id
                        ? "bg-[#2C1810] text-[#FAF8F5] font-bold shadow-2xs"
                        : "bg-[#F5EDE4] text-[#8C6D53] hover:text-[#2C1810]"
                    }`}
                    id={`cat-pill-${cat.id}`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Menu Items List */}
            <div className="p-4 space-y-2.5">
              {tableLoading ? (
                <div className="py-12 text-center text-[#8C6D53] text-xs font-mono">
                  Loading table session…
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="py-12 text-center text-[#8C6D53] text-xs">
                  No menu items found.
                </div>
              ) : (
                filteredItems.map((item) => {
                  const cartEntry = cart.find((ci) => ci.itemId === item.id);
                  const inCartQty = cart
                    .filter((ci) => ci.itemId === item.id)
                    .reduce((acc, ci) => acc + ci.quantity, 0);
                  const isCustomizable = item.variants.length > 0 || item.addons.length > 0;

                  return (
                    <div
                      key={item.id}
                      className="bg-white border border-[#EDE4D8] rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-2xs hover:border-[#D8C7B5] transition-colors"
                      id={`menu-item-row-${item.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`h-3 w-3 rounded-xs shrink-0 flex items-center justify-center border ${
                              item.veg
                                ? "border-emerald-500 text-emerald-500"
                                : "border-red-500 text-red-500"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                item.veg ? "bg-emerald-500" : "bg-red-500"
                              }`}
                            />
                          </span>
                          <h4 className="text-sm font-bold text-[#2C1810] truncate">
                            {item.name}
                          </h4>
                        </div>

                        <div className="mt-1 flex items-center gap-2">
                          <span className="font-bold text-[#2C1810] text-sm">
                            {restaurant?.currency}
                            {item.price}
                          </span>
                          {isCustomizable && (
                            <span className="text-[10px] bg-[#F5EDE4] text-[#8C6D53] px-2 py-0.5 rounded font-medium">
                              Customizable
                            </span>
                          )}
                        </div>

                        {item.description && (
                          <p className="mt-1 text-[11px] text-[#8C6D53] line-clamp-1">
                            {item.description}
                          </p>
                        )}
                      </div>

                      {/* Add Button or Stepper */}
                      <div className="shrink-0">
                        {inCartQty > 0 && !isCustomizable && cartEntry ? (
                          <div className="flex items-center gap-1.5 bg-[#F5EDE4] border border-[#E5DACD] rounded-xl px-1.5 py-1 shadow-2xs">
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(cartEntry.cartId, -1)}
                              className="h-7 w-7 rounded-lg bg-white text-[#2C1810] border border-[#EDE4D8] flex items-center justify-center active:scale-95 transition-transform"
                              id={`btn-dec-${item.id}`}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-5 text-center font-bold text-xs text-[#2C1810]">
                              {inCartQty}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(cartEntry.cartId, 1)}
                              className="h-7 w-7 rounded-lg bg-[#2C1810] text-white flex items-center justify-center active:scale-95 transition-transform font-bold"
                              id={`btn-inc-${item.id}`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleAddToCart(item)}
                            className="h-9 px-3.5 bg-[#F5EDE4] hover:bg-[#2C1810] hover:text-white text-[#2C1810] border border-[#E5DACD] rounded-xl font-bold text-xs active:scale-95 transition-all shadow-2xs"
                            id={`btn-add-${item.id}`}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            {inCartQty > 0 ? `Add (${inCartQty})` : "ADD"}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Sticky Bottom Cart Dock for the active table */}
            {cart.length > 0 && (
              <div className="fixed bottom-0 left-0 right-0 z-30 p-3 bg-gradient-to-t from-[#FAF8F5] via-[#FAF8F5]/90 to-transparent">
                <div className="max-w-md mx-auto">
                  <button
                    type="button"
                    onClick={() => setIsCartOpen(true)}
                    className="w-full h-14 bg-[#2C1810] hover:bg-[#3D2314] text-white rounded-2xl px-4 flex items-center justify-between shadow-xl active:scale-[0.98] transition-transform font-bold"
                    id="button-view-captain-cart"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-xl bg-white text-[#2C1810] flex items-center justify-center font-bold text-xs shadow-2xs">
                        {totalCartItemsCount}
                      </div>
                      <div className="text-left">
                        <div className="text-[10px] uppercase tracking-wider text-[#E3D1C2] leading-none">
                          TABLE {selectedTable.tableNumber} CART
                        </div>
                        <div className="text-sm font-bold mt-0.5">
                          {restaurant?.currency}
                          {cartTotal.toLocaleString("en-IN")}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-xs uppercase tracking-wider font-bold text-[#FAF8F5]">
                      <span>Review & Send</span>
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* =========================================================================
              VIEW 2: CAPTAIN TABS (HOME, TABLES, ORDERS, ME)
          ========================================================================== */
          <div className="p-4" id="captain-tab-views">
            {/* TAB: HOME */}
            {activeTab === "home" && (
              <div className="space-y-4" id="tab-home">
                {/* Floor Station Hero Card */}
                <div className="bg-[#F7EFE6] border border-[#E8DCCF] rounded-3xl p-5 relative overflow-hidden shadow-2xs">
                  {/* Decorative Botanical & Coffee Hospitality SVG Illustration */}
                  <div className="absolute right-0 bottom-0 pointer-events-none opacity-20 translate-x-2 translate-y-2 select-none">
                    <svg width="150" height="150" viewBox="0 0 150 150" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M75 105C90 105 102 95 102 82H48C48 95 60 105 75 105Z" fill="#C87D55" />
                      <path d="M102 86H110C114 86 117 89 117 93C117 97 114 100 110 100H100" stroke="#C87D55" strokeWidth="3" strokeLinecap="round" />
                      <path d="M42 108H108" stroke="#8C6D53" strokeWidth="3.5" strokeLinecap="round" />
                      <path d="M65 72C63 67 67 62 65 57" stroke="#C87D55" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 1" />
                      <path d="M75 70C73 63 77 58 75 51" stroke="#8C6D53" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 1" />
                      <path d="M85 72C83 67 87 62 85 57" stroke="#C87D55" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 1" />
                      <path d="M115 45C105 50 100 65 102 78C115 76 130 71 135 61C137 57 125 45 115 45Z" fill="#8C6D53" fillOpacity="0.4" />
                      <path d="M110 52C118 60 124 66 128 68" stroke="#8C6D53" strokeWidth="1.5" strokeLinecap="round" />
                      <path d="M125 35C118 40 115 52 118 62C128 60 138 55 142 47C143 43 133 35 125 35Z" fill="#C87D55" fillOpacity="0.3" />
                      <path d="M90 35C80 40 76 52 80 64C90 62 102 56 106 48C108 43 98 35 90 35Z" fill="#8C6D53" fillOpacity="0.35" />
                    </svg>
                  </div>

                  <div className="flex items-start justify-between relative z-10">
                    <div>
                      <p className="text-[10px] tracking-widest font-bold uppercase text-[#9C7A5E]">
                        CAPTAIN STATION
                      </p>
                      <h2 className="font-serif text-2xl sm:text-[26px] font-bold text-[#2C1810] tracking-tight mt-0.5">
                        {greeting}, {currentStaff?.name ? currentStaff.name.split(" ")[0] : "Rahul"}
                      </h2>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#8C6D53] block">
                        SHIFT ORDERS
                      </span>
                      <span className="text-2xl sm:text-[26px] font-bold font-sans text-[#2C1810] text-right leading-none mt-1 block">
                        {stats.todayOrdersCount}
                      </span>
                    </div>
                  </div>

                  {/* Shift Stats: Two Side-by-Side White Rounded Cards */}
                  <div className="mt-4 grid grid-cols-2 gap-3 relative z-10">
                    <button
                      type="button"
                      onClick={() => setActiveTab("tables")}
                      className="rounded-2xl bg-white border border-[#EDE4D8] p-3 flex items-center justify-between shadow-2xs hover:border-[#D8C7B5] cursor-pointer transition-all active:scale-[0.98] text-left"
                      id="card-hero-active-tables"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-[#F5EDE4] text-[#2C1810] flex items-center justify-center shrink-0">
                          <UtensilsCrossed className="h-4 w-4 text-[#C87D55]" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-[9px] uppercase tracking-wider font-bold text-[#9C7A5E] block leading-none">
                            ACTIVE TABLES
                          </span>
                          <span className="text-sm font-bold text-[#2C1810] mt-1 block leading-tight truncate">
                            {stats.activeTablesCount} / {stats.totalTablesCount}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-[#A88B74] shrink-0 ml-1" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab("orders")}
                      className="rounded-2xl bg-white border border-[#EDE4D8] p-3 flex items-center justify-between shadow-2xs hover:border-[#D8C7B5] cursor-pointer transition-all active:scale-[0.98] text-left"
                      id="card-hero-kitchen-status"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-[#F5EDE4] text-[#2C1810] flex items-center justify-center shrink-0">
                          <ChefHat className="h-4 w-4 text-[#C87D55]" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-[9px] uppercase tracking-wider font-bold text-[#9C7A5E] block leading-none">
                            KITCHEN STATUS
                          </span>
                          <div className="flex items-center gap-1.5 text-xs font-bold text-[#2C1810] mt-1 leading-tight truncate">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                            <span className="truncate">Pass Operational</span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-[#A88B74] shrink-0 ml-1" />
                    </button>
                  </div>
                </div>

                {/* Primary Action: SCAN TABLE QR (Large Espresso-Brown Card) */}
                <button
                  type="button"
                  onClick={startScanner}
                  className="w-full bg-gradient-to-r from-[#2C1810] via-[#381F15] to-[#45281B] text-white rounded-3xl p-4.5 sm:p-5 flex items-center justify-between shadow-[0_4px_20px_rgba(44,24,16,0.16)] relative overflow-hidden cursor-pointer hover:opacity-98 active:scale-[0.99] transition-all group"
                  id="button-scan-table-hero"
                >
                  {/* Subtle botanical line art in the background */}
                  <div className="absolute -right-3 -bottom-3 pointer-events-none opacity-10 select-none">
                    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M90 20C75 35 70 65 80 90C105 80 115 50 110 30C105 20 95 18 90 20Z" fill="white" />
                      <path d="M60 40C48 55 45 80 55 100C75 90 85 65 80 48C75 40 65 38 60 40Z" fill="white" />
                      <path d="M40 70C30 80 28 95 35 110C50 105 58 90 52 78C48 72 42 70 40 70Z" fill="white" />
                    </svg>
                  </div>

                  <div className="flex items-center gap-3.5 relative z-10">
                    <div className="w-13 h-13 rounded-2xl bg-white text-[#2C1810] flex items-center justify-center shadow-sm shrink-0">
                      <Camera className="h-6 w-6 text-[#2C1810]" />
                    </div>
                    <div className="text-left">
                      <div className="font-serif font-bold text-lg sm:text-xl tracking-wide text-white leading-tight">
                        SCAN TABLE QR
                      </div>
                      <p className="text-xs text-[#E3D1C2] mt-0.5 font-normal">
                        Instant table detection with camera
                      </p>
                    </div>
                  </div>

                  <div className="w-10 h-10 rounded-full bg-[#C87D55] group-hover:bg-[#B86B42] text-white flex items-center justify-center shadow-sm shrink-0 transition-transform group-hover:scale-105 relative z-10">
                    <ChevronRight className="h-5 w-5" />
                  </div>
                </button>

                {/* Secondary Action: Select from Table Grid */}
                <button
                  type="button"
                  onClick={() => setActiveTab("tables")}
                  className="w-full bg-white hover:bg-[#FAF6F0] border border-[#EDE4D8] rounded-2xl p-3.5 sm:p-4 flex items-center justify-between shadow-2xs hover:border-[#D8C7B5] active:scale-[0.99] transition-all text-left cursor-pointer"
                  id="button-select-table-manual"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-[#F5EDE4] text-[#2C1810] flex items-center justify-center shrink-0">
                      <LayoutGrid className="h-5 w-5 text-[#C87D55]" />
                    </div>
                    <div className="text-left">
                      <div className="font-serif font-bold text-sm text-[#2C1810] tracking-wide">
                        SELECT FROM TABLE GRID
                      </div>
                      <p className="text-xs text-[#8C6D53] mt-0.5">
                        View all tables and occupancy
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-[#A88B74]" />
                </button>

                {/* Recent Tables (Horizontal Pill Cards) */}
                {recentTables.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold tracking-widest uppercase text-[#8C6D53] font-sans">
                        RECENT TABLES
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveTab("tables")}
                        className="text-xs font-semibold text-[#734A2F] hover:text-[#52331E] flex items-center gap-0.5"
                      >
                        View All →
                      </button>
                    </div>

                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                      {recentTables.map((tNum) => {
                        const matched = tables.find((t) => t.tableNumber === tNum);
                        const isOccupied = matched?.status === "OCCUPIED";
                        return (
                          <button
                            key={tNum}
                            type="button"
                            onClick={() => {
                              if (matched) handleSelectTable(matched);
                            }}
                            className="bg-white hover:bg-[#FAF6F0] border border-[#EDE4D8] px-3.5 py-2 rounded-xl text-xs font-medium text-[#2C1810] flex items-center gap-2 shadow-2xs transition-all active:scale-95 shrink-0 cursor-pointer"
                            id={`recent-table-chip-${tNum}`}
                          >
                            <span className="w-5 h-5 rounded-full bg-[#F5EDE4] text-[#5C3B24] flex items-center justify-center text-[10px] font-bold">
                              T
                            </span>
                            <span className="font-semibold text-xs text-[#2C1810]">
                              Table {tNum}
                            </span>
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                isOccupied ? "bg-amber-500" : "bg-emerald-500"
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Recent Captain Dispatches */}
                <div className="pt-1">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-bold tracking-widest uppercase text-[#8C6D53] font-sans">
                      RECENT CAPTAIN DISPATCHES
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab("orders")}
                      className="text-xs font-semibold text-[#734A2F] hover:text-[#52331E]"
                    >
                      View All ({recentOrders.length})
                    </button>
                  </div>

                  {recentOrders.length === 0 ? (
                    <div className="bg-white border border-[#EDE4D8] rounded-2xl p-6 text-center shadow-2xs">
                      <div className="w-10 h-10 rounded-full bg-[#F5EDE4] text-[#C87D55] flex items-center justify-center mx-auto mb-2">
                        <ChefHat className="h-5 w-5" />
                      </div>
                      <h4 className="font-serif font-bold text-sm text-[#2C1810]">
                        No dispatches yet this shift
                      </h4>
                      <p className="text-xs text-[#8C6D53] mt-1">
                        Scan a table QR to take orders and send live tickets to the kitchen.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {recentOrders.slice(0, 3).map((ord) => (
                        <div
                          key={ord.id}
                          onClick={() => setActiveTab("orders")}
                          className="bg-white border border-[#EDE4D8] rounded-2xl p-3.5 shadow-2xs flex items-center justify-between gap-3 hover:border-[#D8C7B5] cursor-pointer transition-colors active:scale-[0.99]"
                          id={`home-recent-order-${ord.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-[#2C1810]">
                                #{ord.orderNumber}
                              </span>
                              <span className="bg-[#F5EDE4] text-[#5C3B24] px-2 py-0.5 rounded-md text-[10px] font-bold">
                                T{ord.tableNumber}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-[#8C6D53] truncate max-w-[170px] sm:max-w-[220px]">
                              {ord.itemsSummary || `${ord.itemCount} items`}
                            </p>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            <div className="text-right">
                              <span className="font-bold text-sm text-[#2C1810] block leading-tight">
                                {restaurant?.currency}
                                {ord.total}
                              </span>
                              <span
                                className={`inline-block text-[9px] font-bold uppercase mt-0.5 px-2 py-0.5 rounded-full ${
                                  ord.status === "READY"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : ord.status === "PREPARING"
                                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                                    : "bg-stone-100 text-stone-700 border border-stone-200"
                                }`}
                              >
                                {ord.status}
                              </span>
                            </div>
                            <ChevronRight className="h-4 w-4 text-[#A88B74]" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: TABLES (LIVE GRID) */}
            {activeTab === "tables" && (
              <div className="space-y-3" id="tab-tables">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-lg font-bold text-[#2C1810]">Restaurant Tables</h3>
                  <span className="text-xs text-[#8C6D53] font-medium bg-[#F5EDE4] px-2.5 py-1 rounded-full border border-[#EDE4D8]">
                    {tables.length} Total
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {tables.map((table) => {
                    const isOccupied = table.status === "OCCUPIED";
                    const isDeactivated = table.status === "DEACTIVATED" || !table.active;

                    return (
                      <button
                        key={table.id}
                        type="button"
                        disabled={isDeactivated}
                        onClick={() => handleSelectTable(table)}
                        className={`rounded-2xl p-3.5 text-left border flex flex-col justify-between transition-all active:scale-[0.98] min-h-[110px] shadow-2xs ${
                          isDeactivated
                            ? "bg-[#F5F2ED] border-[#E5DACD] opacity-50 cursor-not-allowed text-[#8C6D53]"
                            : isOccupied
                            ? "bg-[#FFF9F3] border-[#E8C5A8] text-[#2C1810]"
                            : "bg-white border-[#EDE4D8] text-[#2C1810] hover:border-[#D8C7B5]"
                        }`}
                        id={`table-grid-card-${table.tableNumber}`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-xl font-bold font-sans block text-[#2C1810]">
                              {table.tableNumber}
                            </span>
                            <span className="text-[10px] text-[#8C6D53] block font-medium">
                              {table.location || `Cap ${table.capacity}`}
                            </span>
                          </div>

                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                              isDeactivated
                                ? "bg-stone-200 text-stone-600"
                                : isOccupied
                                ? "bg-[#C87D55] text-white"
                                : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            }`}
                          >
                            {isDeactivated ? "Disabled" : isOccupied ? "Occupied" : "Free"}
                          </span>
                        </div>

                        <div className="mt-2 pt-2 border-t border-[#EDE4D8] flex items-center justify-between text-[10px]">
                          {isOccupied ? (
                            <span className="text-[#A05C33] font-semibold">
                              {table.activeOrdersCount > 0
                                ? `${table.activeOrdersCount} order(s)`
                                : "Active Session"}
                            </span>
                          ) : (
                            <span className="text-[#8C6D53]">Tap to order</span>
                          )}
                          <ChevronRight className="h-3.5 w-3.5 text-[#A88B74]" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB: ORDERS (CAPTAIN DISPATCHES) */}
            {activeTab === "orders" && (
              <div className="space-y-3" id="tab-orders">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-lg font-bold text-[#2C1810]">Live Kitchen Orders</h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={fetchBootstrap}
                    className="h-8 text-xs text-[#8C6D53] hover:text-[#2C1810] hover:bg-[#F5EDE4] rounded-xl"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    Refresh
                  </Button>
                </div>

                {recentOrders.length === 0 ? (
                  <div className="bg-white border border-[#EDE4D8] rounded-3xl p-8 text-center text-xs text-[#8C6D53] shadow-2xs">
                    No orders taken yet today. Tap Scan Table to take an order.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {recentOrders.map((ord) => {
                      const isReady = ord.status === "READY";
                      const isPrep = ord.status === "PREPARING";

                      return (
                        <div
                          key={ord.id}
                          className={`rounded-2xl border p-3.5 transition-colors shadow-2xs ${
                            isReady
                              ? "bg-emerald-50/60 border-emerald-300"
                              : isPrep
                              ? "bg-[#FFF9F3] border-[#E8C5A8]"
                              : "bg-white border-[#EDE4D8]"
                          }`}
                          id={`order-card-${ord.id}`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-[#2C1810]">
                                  #{ord.orderNumber}
                                </span>
                                <span className="bg-[#F5EDE4] text-[#5C3B24] px-2 py-0.5 rounded-md text-xs font-bold">
                                  Table {ord.tableNumber}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-[#8C6D53] line-clamp-2">
                                {ord.itemsSummary}
                              </p>
                            </div>

                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                isReady
                                  ? "bg-emerald-600 text-white animate-pulse"
                                  : isPrep
                                  ? "bg-[#C87D55] text-white"
                                  : "bg-[#EDE4D8] text-[#5C3B24]"
                              }`}
                            >
                              {ord.status}
                            </span>
                          </div>

                          <div className="mt-2.5 pt-2 border-t border-[#EDE4D8] flex items-center justify-between text-[11px] text-[#8C6D53]">
                            <span>
                              {ord.createdAt
                                ? new Date(ord.createdAt).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "Today"}
                            </span>
                            <span className="font-bold text-[#2C1810]">
                              {restaurant?.currency}
                              {ord.total}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB: ME (STAFF PROFILE & QUICK SWITCH PIN) */}
            {activeTab === "me" && (
              <div className="space-y-4" id="tab-me">
                {/* Profile Card */}
                <div className="bg-white border border-[#EDE4D8] rounded-3xl p-4 shadow-2xs">
                  <div className="flex items-center gap-3.5">
                    <div className="h-12 w-12 rounded-2xl bg-[#2C1810] text-[#FAF8F5] font-bold text-lg flex items-center justify-center">
                      {currentStaff?.name ? currentStaff.name.charAt(0).toUpperCase() : "C"}
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-[#2C1810]">
                        {currentStaff?.name || "Floor Captain"}
                      </h3>
                      <p className="text-xs text-[#8C6D53]">{currentStaff?.email}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-full bg-[#F5EDE4] text-[#5C3B24] text-[10px] font-bold uppercase">
                          {currentStaff?.role || "Staff"}
                        </span>
                        <span className="text-[10px] text-[#8C6D53]">
                          {restaurant?.name}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Security / PIN Setup */}
                <div className="bg-white border border-[#EDE4D8] rounded-2xl p-4 space-y-3 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-[#C87D55]" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#2C1810]">
                      Quick Switch PIN
                    </h4>
                  </div>
                  <p className="text-xs text-[#8C6D53] leading-relaxed">
                    Set a 4-digit PIN for instant switching between floor staff on shared Android phones without entering passwords.
                  </p>
                  <Button
                    onClick={() => {
                      setIsPinModalOpen(true);
                      setPinError(null);
                      setCurrentPinInput("");
                      setNewPinInput("");
                      setConfirmPinInput("");
                    }}
                    className="w-full bg-[#F5EDE4] hover:bg-[#EAE0D5] text-[#2C1810] border border-[#E5DACD] rounded-xl h-10 text-xs font-semibold"
                    id="button-configure-pin"
                  >
                    Change / Set 4-Digit PIN
                  </Button>
                </div>

                {/* Actions */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={openStaffSwitchModal}
                    className="w-full bg-white hover:bg-[#FAF6F0] border border-[#EDE4D8] rounded-2xl p-4 flex items-center justify-between text-left active:scale-[0.98] transition-transform shadow-2xs"
                    id="button-switch-staff-tab"
                  >
                    <div className="flex items-center gap-3">
                      <Users className="h-5 w-5 text-[#C87D55]" />
                      <div>
                        <div className="font-bold text-sm text-[#2C1810]">Switch Staff Member</div>
                        <p className="text-[11px] text-[#8C6D53]">
                          Switch user for shared handheld device
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[#A88B74]" />
                  </button>

                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full bg-red-50/50 hover:bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between text-left text-red-700 active:scale-[0.98] transition-transform shadow-2xs"
                    id="button-sign-out-captain"
                  >
                    <div className="flex items-center gap-3">
                      <LogOut className="h-5 w-5 text-red-600" />
                      <div>
                        <div className="font-bold text-sm text-red-700">Sign Out Device</div>
                        <p className="text-[11px] text-red-500">
                          Completely end this phone's session
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-red-400" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* =========================================================================
          BOTTOM NAVIGATION BAR (4 TABS) - Hidden when taking table order
      ========================================================================== */}
      {!selectedTable && (
        <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#EDE4D8] py-2 px-3 shadow-[0_-4px_20px_rgba(44,24,16,0.06)]" id="captain-bottom-nav">
          <div className="max-w-md mx-auto grid grid-cols-4 gap-1">
            {/* 1. Home */}
            <button
              type="button"
              onClick={() => setActiveTab("home")}
              className={`flex items-center justify-center py-2 px-2 rounded-full transition-all ${
                activeTab === "home"
                  ? "bg-[#F5EDE4] text-[#2C1810] font-bold shadow-2xs"
                  : "text-[#8C6D53] hover:text-[#2C1810]"
              }`}
              id="nav-tab-home"
            >
              <div className="flex items-center gap-1.5">
                <Home className={`h-4 w-4 ${activeTab === "home" ? "text-[#C87D55]" : "text-[#8C6D53]"}`} />
                {activeTab === "home" && (
                  <span className="text-xs text-[#2C1810] font-bold">Home</span>
                )}
              </div>
            </button>

            {/* 2. Tables */}
            <button
              type="button"
              onClick={() => setActiveTab("tables")}
              className={`flex items-center justify-center py-2 px-2 rounded-full transition-all ${
                activeTab === "tables"
                  ? "bg-[#F5EDE4] text-[#2C1810] font-bold shadow-2xs"
                  : "text-[#8C6D53] hover:text-[#2C1810]"
              }`}
              id="nav-tab-tables"
            >
              <div className="flex items-center gap-1.5">
                <UtensilsCrossed className={`h-4 w-4 ${activeTab === "tables" ? "text-[#C87D55]" : "text-[#8C6D53]"}`} />
                {activeTab === "tables" && (
                  <span className="text-xs text-[#2C1810] font-bold">Tables</span>
                )}
              </div>
            </button>

            {/* 3. Orders */}
            <button
              type="button"
              onClick={() => setActiveTab("orders")}
              className={`flex items-center justify-center py-2 px-2 rounded-full transition-all relative ${
                activeTab === "orders"
                  ? "bg-[#F5EDE4] text-[#2C1810] font-bold shadow-2xs"
                  : "text-[#8C6D53] hover:text-[#2C1810]"
              }`}
              id="nav-tab-orders"
            >
              <div className="flex items-center gap-1.5 relative">
                <Receipt className={`h-4 w-4 ${activeTab === "orders" ? "text-[#C87D55]" : "text-[#8C6D53]"}`} />
                {activeTab === "orders" && (
                  <span className="text-xs text-[#2C1810] font-bold">Orders</span>
                )}
                {recentOrders.some((o) => o.status === "READY" || o.status === "SUBMITTED") && (
                  <span className="absolute -top-1 -right-1.5 h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                )}
              </div>
            </button>

            {/* 4. Me */}
            <button
              type="button"
              onClick={() => setActiveTab("me")}
              className={`flex items-center justify-center py-2 px-2 rounded-full transition-all ${
                activeTab === "me"
                  ? "bg-[#F5EDE4] text-[#2C1810] font-bold shadow-2xs"
                  : "text-[#8C6D53] hover:text-[#2C1810]"
              }`}
              id="nav-tab-me"
            >
              <div className="flex items-center gap-1.5">
                <User className={`h-4 w-4 ${activeTab === "me" ? "text-[#C87D55]" : "text-[#8C6D53]"}`} />
                {activeTab === "me" && (
                  <span className="text-xs text-[#2C1810] font-bold">Me</span>
                )}
              </div>
            </button>
          </div>
        </nav>
      )}

      {/* =========================================================================
          MODAL 1: CAMERA QR SCANNER
      ========================================================================== */}
      {isScannerOpen && (
        <div className="fixed inset-0 z-50 bg-[#1A0E0A]/80 backdrop-blur-sm flex flex-col justify-end sm:justify-center p-3 sm:p-6 animate-in fade-in" id="modal-qr-scanner">
          <div className="bg-[#FAF8F5] border border-[#EDE4D8] rounded-3xl max-w-md mx-auto w-full p-5 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#EDE4D8]">
              <div>
                <span className="text-[10px] text-[#C87D55] font-semibold tracking-wider uppercase block">Instant Table Detection</span>
                <h3 className="font-serif font-bold text-[#2C1810] text-base">Scan Table QR</h3>
              </div>
              <button
                type="button"
                onClick={stopScanner}
                className="h-8 w-8 rounded-full bg-white border border-[#EDE4D8] text-[#5C4D44] hover:text-[#2C1810] flex items-center justify-center transition-colors shadow-xs"
                id="button-close-scanner"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="py-4 flex flex-col items-center justify-center">
              {/* Viewfinder Frame */}
              <div className="relative w-full max-w-[260px] aspect-square rounded-2xl overflow-hidden border-2 border-[#C87D55] shadow-lg bg-[#2C1810]">
                <div id="captain-qr-reader" className="w-full h-full" />
                {isResolvingQr && (
                  <div className="absolute inset-0 bg-[#2C1810]/85 flex flex-col items-center justify-center text-xs text-white">
                    <TablelineSymbol size="sm" className="mb-2" />
                    Identifying table…
                  </div>
                )}
              </div>

              {scannerError && (
                <p className="mt-3 text-xs text-red-600 text-center max-w-xs">{scannerError}</p>
              )}

              {/* Manual Table Fallback */}
              <div className="mt-5 w-full bg-white border border-[#EDE4D8] rounded-2xl p-3.5 shadow-xs text-center">
                <span className="text-[10px] text-[#8C7A6B] font-semibold block mb-2 uppercase tracking-wider">
                  Or Enter Table Number
                </span>
                <div className="flex gap-2">
                  <Input
                    value={manualTableInput}
                    onChange={(e) => setManualTableInput(e.target.value)}
                    placeholder="e.g. 07"
                    className="bg-[#FAF8F5] border-[#EDE4D8] text-center font-bold text-sm h-10 text-[#2C1810] rounded-xl focus-visible:ring-[#C87D55]"
                    id="input-manual-table-captain"
                  />
                  <Button
                    disabled={!manualTableInput.trim() || isResolvingQr}
                    onClick={() => handleResolveQrCode(manualTableInput.trim())}
                    className="bg-[#2C1810] hover:bg-[#3D261C] text-white font-medium rounded-xl h-10 px-5 shadow-xs"
                    id="button-submit-manual-table"
                  >
                    Open
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: CART REVIEW & SUBMIT SHEET
      ========================================================================== */}
      {isCartOpen && selectedTable && (
        <div className="fixed inset-0 z-50 bg-[#1A0E0A]/70 backdrop-blur-xs flex flex-col justify-end animate-in fade-in" id="modal-cart-sheet">
          <div className="bg-[#FAF8F5] border-t border-[#EDE4D8] rounded-t-3xl max-w-lg mx-auto w-full max-h-[88vh] flex flex-col shadow-2xl">
            {/* Cart Header */}
            <div className="p-4 border-b border-[#EDE4D8] bg-white rounded-t-3xl flex items-center justify-between">
              <div>
                <span className="text-[10px] text-[#C87D55] font-semibold uppercase tracking-wider block">
                  Captain Dispatch Review
                </span>
                <h3 className="font-serif font-bold text-base text-[#2C1810]">
                  Table {selectedTable.tableNumber} Order Cart
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                className="h-8 w-8 rounded-full bg-[#FAF8F5] border border-[#EDE4D8] text-[#5C4D44] hover:text-[#2C1810] flex items-center justify-center shadow-xs"
                id="button-close-cart"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Cart Items List */}
            <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
              {cart.map((ci) => (
                <div
                  key={ci.cartId}
                  className="bg-white border border-[#EDE4D8] rounded-2xl p-3 flex items-center justify-between shadow-xs"
                  id={`cart-item-${ci.cartId}`}
                >
                  <div className="flex-1 min-w-0 pr-3">
                    <h5 className="font-medium text-xs text-[#2C1810] truncate">{ci.name}</h5>
                    {ci.selectedVariant && (
                      <span className="text-[10px] text-[#8C7A6B] block">
                        Size: {ci.selectedVariant.name}
                      </span>
                    )}
                    {ci.selectedAddons.length > 0 && (
                      <span className="text-[10px] text-[#8C7A6B] block">
                        + {ci.selectedAddons.map((a) => a.name).join(", ")}
                      </span>
                    )}
                    <span className="font-bold text-[#C87D55] text-xs mt-0.5 block">
                      {restaurant?.currency}
                      {(ci.itemPrice * ci.quantity).toLocaleString("en-IN")}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-[#FAF8F5] border border-[#EDE4D8] rounded-xl px-1.5 py-1 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(ci.cartId, -1)}
                        className="h-6 w-6 rounded-md bg-white border border-[#EDE4D8] text-[#2C1810] flex items-center justify-center shadow-2xs hover:bg-[#F2ECE4]"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-5 text-center font-bold text-xs text-[#2C1810]">
                        {ci.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(ci.cartId, 1)}
                        className="h-6 w-6 rounded-md bg-[#2C1810] text-white font-bold flex items-center justify-center shadow-2xs hover:bg-[#3D261C]"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleUpdateQuantity(ci.cartId, -ci.quantity)}
                      className="text-[#8C7A6B] hover:text-red-600 p-1.5 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Special Cooking Instructions */}
              <div className="pt-2">
                <span className="text-[11px] text-[#5C4D44] font-medium block mb-1">
                  Kitchen Notes / Special Requests
                </span>
                <Textarea
                  value={cookingNotes}
                  onChange={(e) => setCookingNotes(e.target.value)}
                  placeholder="e.g. Less oil, extra spicy, sauce on the side…"
                  className="bg-white border-[#EDE4D8] text-xs text-[#2C1810] rounded-xl resize-none h-16 focus-visible:ring-[#C87D55] shadow-xs"
                  id="input-cooking-notes"
                />
              </div>

              {/* Bill Breakdown */}
              <div className="bg-white border border-[#EDE4D8] rounded-2xl p-3.5 text-xs space-y-1.5 shadow-xs">
                <div className="flex justify-between text-[#8C7A6B]">
                  <span>Subtotal</span>
                  <span className="font-semibold text-[#2C1810]">
                    {restaurant?.currency}
                    {cartSubtotal.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-[#8C7A6B]">
                  <span>Taxes ({taxPercentageDisplay}%)</span>
                  <span className="font-semibold text-[#2C1810]">
                    {restaurant?.currency}
                    {cartTax.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-sm text-[#2C1810] pt-2 border-t border-[#EDE4D8]">
                  <span>Final Total</span>
                  <span className="text-[#C87D55]">
                    {restaurant?.currency}
                    {cartTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Submit Button */}
            <div className="p-4 border-t border-[#EDE4D8] bg-white">
              <Button
                disabled={isSubmittingOrder || cart.length === 0}
                onClick={handleSendToKitchen}
                className="w-full h-12 bg-[#2C1810] hover:bg-[#3D261C] text-white rounded-2xl font-semibold text-sm shadow-md flex items-center justify-center gap-2 transition-all"
                id="button-submit-order-kitchen"
              >
                {isSubmittingOrder ? (
                  <>
                    <TablelineSymbol size="xs" className="text-white" />
                    Sending to Kitchen…
                  </>
                ) : (
                  <>
                    <ChefHat className="h-4 w-4 text-[#C87D55]" />
                    Send Order to Kitchen • {restaurant?.currency}
                    {cartTotal.toFixed(2)}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: ITEM CUSTOMIZATION SHEET (VARIANTS / ADDONS)
      ========================================================================== */}
      {customizingItem && (
        <div className="fixed inset-0 z-50 bg-[#1A0E0A]/70 backdrop-blur-xs flex flex-col justify-end animate-in fade-in" id="modal-customize-sheet">
          <div className="bg-[#FAF8F5] border-t border-[#EDE4D8] rounded-t-3xl max-w-md mx-auto w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-[#EDE4D8] bg-white rounded-t-3xl flex items-center justify-between">
              <div>
                <h3 className="font-serif font-bold text-base text-[#2C1810]">{customizingItem.name}</h3>
                <span className="text-[#C87D55] text-xs font-bold">
                  {restaurant?.currency}
                  {customizingItem.price} base
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCustomizingItem(null)}
                className="h-8 w-8 rounded-full bg-[#FAF8F5] border border-[#EDE4D8] text-[#5C4D44] hover:text-[#2C1810] flex items-center justify-center shadow-xs"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {/* Variants */}
              {customizingItem.variants.length > 0 && (
                <div>
                  <span className="text-[10px] font-semibold text-[#8C7A6B] uppercase tracking-wider block mb-2">
                    Select Size / Variant
                  </span>
                  <div className="space-y-1.5">
                    {customizingItem.variants.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setSelectedVariant(v)}
                        className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between text-xs transition-colors shadow-xs ${
                          selectedVariant?.id === v.id
                            ? "bg-[#C87D55]/10 border-[#C87D55] text-[#2C1810] font-bold"
                            : "bg-white border-[#EDE4D8] text-[#5C4D44] hover:border-[#D9CCC0]"
                        }`}
                      >
                        <span>{v.name}</span>
                        <span className="font-bold text-[#C87D55]">
                          {restaurant?.currency}
                          {v.price}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Addons */}
              {customizingItem.addons.length > 0 && (
                <div>
                  <span className="text-[10px] font-semibold text-[#8C7A6B] uppercase tracking-wider block mb-2">
                    Add-ons (Optional)
                  </span>
                  <div className="space-y-1.5">
                    {customizingItem.addons.map((a) => {
                      const isChecked = selectedAddons.some((sa) => sa.id === a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            if (isChecked) {
                              setSelectedAddons(selectedAddons.filter((sa) => sa.id !== a.id));
                            } else {
                              setSelectedAddons([...selectedAddons, a]);
                            }
                          }}
                          className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between text-xs transition-colors shadow-xs ${
                            isChecked
                              ? "bg-[#C87D55]/10 border-[#C87D55] text-[#2C1810] font-bold"
                              : "bg-white border-[#EDE4D8] text-[#5C4D44] hover:border-[#D9CCC0]"
                          }`}
                        >
                          <span>{a.name}</span>
                          <span className="font-bold text-[#C87D55]">
                            +{restaurant?.currency}
                            {a.price}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[#EDE4D8] bg-white">
              <Button
                onClick={handleConfirmCustomization}
                className="w-full h-11 bg-[#2C1810] hover:bg-[#3D261C] text-white font-semibold rounded-2xl text-xs shadow-xs"
              >
                Add Customized Item
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 4: SECURE STAFF SWITCH (SHARED DEVICE ROSTER + PIN)
      ========================================================================== */}
      {isSwitchModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#1A0E0A]/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in" id="modal-staff-switch">
          <div className="bg-[#FAF8F5] border border-[#EDE4D8] rounded-3xl max-w-sm w-full p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#EDE4D8]">
              <div>
                <h3 className="font-serif font-bold text-base text-[#2C1810]">Switch Staff Member</h3>
                <p className="text-[11px] text-[#8C7A6B]">Who is using this station?</p>
              </div>
              <button
                type="button"
                onClick={() => setIsSwitchModalOpen(false)}
                className="h-8 w-8 rounded-full bg-white border border-[#EDE4D8] text-[#5C4D44] hover:text-[#2C1810] flex items-center justify-center shadow-xs"
                id="button-close-switch-modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {loadingRoster ? (
                <div className="py-8 text-center text-xs text-[#8C7A6B]">
                  Loading staff roster…
                </div>
              ) : !selectedStaffForSwitch ? (
                /* Step 1: Pick Staff Member */
                <div className="space-y-2 max-h-[300px] overflow-y-auto" id="staff-roster-list">
                  {staffRoster.map((member) => (
                    <button
                      key={member.uid}
                      type="button"
                      onClick={() => {
                        setSelectedStaffForSwitch(member);
                        setSwitchPin("");
                        setSwitchError(null);
                      }}
                      className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-colors shadow-xs ${
                        member.isCurrent
                          ? "bg-[#C87D55]/10 border-[#C87D55] text-[#2C1810]"
                          : "bg-white border-[#EDE4D8] hover:border-[#D9CCC0] text-[#2C1810]"
                      }`}
                      id={`roster-staff-${member.uid}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-xl bg-[#FAF8F5] border border-[#EDE4D8] text-[#C87D55] font-serif font-bold flex items-center justify-center text-xs shadow-2xs">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-xs text-[#2C1810]">{member.name}</div>
                          <span className="text-[10px] text-[#8C7A6B] uppercase font-medium">
                            {member.role} {member.isCurrent && "• Current"}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-[#8C7A6B]" />
                    </button>
                  ))}
                </div>
              ) : (
                /* Step 2: Enter PIN */
                <div className="space-y-4" id="staff-switch-pin-step">
                  <div className="bg-white rounded-2xl p-3 border border-[#EDE4D8] text-center shadow-xs">
                    <span className="text-[10px] text-[#8C7A6B] block uppercase tracking-wider font-semibold">Switching To</span>
                    <span className="font-serif font-bold text-sm text-[#2C1810]">
                      {selectedStaffForSwitch.name}
                    </span>
                    <span className="text-[10px] text-[#C87D55] block uppercase font-semibold">
                      {selectedStaffForSwitch.role}
                    </span>
                  </div>

                  <div>
                    <label className="text-xs text-[#5C4D44] block mb-1.5 text-center font-medium">
                      Enter 4 to 6 Digit Staff PIN
                    </label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={switchPin}
                      onChange={(e) => setSwitchPin(e.target.value.replace(/\D/g, ""))}
                      placeholder="••••"
                      className="bg-white border-[#EDE4D8] text-center text-xl tracking-widest font-mono font-bold h-12 text-[#2C1810] rounded-2xl focus-visible:ring-[#C87D55] shadow-xs"
                      id="input-staff-switch-pin"
                      autoFocus
                    />
                  </div>

                  {switchError && (
                    <p className="text-xs text-red-600 text-center font-medium">{switchError}</p>
                  )}

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setSelectedStaffForSwitch(null)}
                      className="flex-1 text-[#5C4D44] hover:bg-[#EDE4D8]/50 rounded-xl h-11 text-xs"
                    >
                      Back
                    </Button>
                    <Button
                      disabled={isSwitching || switchPin.length < 4}
                      onClick={handleExecuteStaffSwitch}
                      className="flex-1 bg-[#2C1810] hover:bg-[#3D261C] text-white font-semibold rounded-xl h-11 text-xs shadow-xs"
                      id="button-confirm-staff-switch"
                    >
                      {isSwitching ? "Switching…" : "Verify & Switch"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 5: SET / CHANGE PIN
      ========================================================================== */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#1A0E0A]/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in" id="modal-set-pin">
          <div className="bg-[#FAF8F5] border border-[#EDE4D8] rounded-3xl max-w-sm w-full p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#EDE4D8]">
              <h3 className="font-serif font-bold text-base text-[#2C1810]">Set Quick Switch PIN</h3>
              <button
                type="button"
                onClick={() => setIsPinModalOpen(false)}
                className="h-8 w-8 rounded-full bg-white border border-[#EDE4D8] text-[#5C4D44] hover:text-[#2C1810] flex items-center justify-center shadow-xs"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] text-[#5C4D44] block mb-1 font-medium">
                  Current PIN (leave blank if first time)
                </label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={currentPinInput}
                  onChange={(e) => setCurrentPinInput(e.target.value.replace(/\D/g, ""))}
                  placeholder="Current PIN"
                  className="bg-white border-[#EDE4D8] font-mono text-center h-10 text-[#2C1810] rounded-xl focus-visible:ring-[#C87D55] shadow-xs"
                  id="input-current-pin"
                />
              </div>

              <div>
                <label className="text-[11px] text-[#5C4D44] block mb-1 font-medium">
                  New 4 to 6 Digit PIN
                </label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={newPinInput}
                  onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, ""))}
                  placeholder="New PIN"
                  className="bg-white border-[#EDE4D8] font-mono text-center h-10 text-[#2C1810] rounded-xl focus-visible:ring-[#C87D55] shadow-xs"
                  id="input-new-pin"
                />
              </div>

              <div>
                <label className="text-[11px] text-[#5C4D44] block mb-1 font-medium">
                  Confirm New PIN
                </label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={confirmPinInput}
                  onChange={(e) => setConfirmPinInput(e.target.value.replace(/\D/g, ""))}
                  placeholder="Confirm New PIN"
                  className="bg-white border-[#EDE4D8] font-mono text-center h-10 text-[#2C1810] rounded-xl focus-visible:ring-[#C87D55] shadow-xs"
                  id="input-confirm-pin"
                />
              </div>

              {pinError && (
                <p className="text-xs text-red-600 text-center font-medium">{pinError}</p>
              )}

              <Button
                disabled={isSavingPin || !newPinInput || !confirmPinInput}
                onClick={handleSavePin}
                className="w-full bg-[#2C1810] hover:bg-[#3D261C] text-white font-semibold rounded-xl h-11 text-xs mt-2 shadow-xs"
                id="button-save-staff-pin"
              >
                {isSavingPin ? "Saving PIN…" : "Save Quick Switch PIN"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 6: SETTLE TABLE BILL & FREE TABLE
      ========================================================================== */}
      {showSettleModal && selectedTable && (
        <div className="fixed inset-0 z-50 bg-[#1A0E0A]/80 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in" id="modal-captain-settle-bill">
          <div className="w-full max-w-sm rounded-3xl border border-[#EDE4D8] bg-[#FAF8F5] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#EDE4D8]">
              <div>
                <h3 className="font-serif font-bold text-[#2C1810] text-base">Settle Bill & Free Table</h3>
                <p className="text-xs text-[#8C7A6B]">Table {selectedTable.tableNumber} • {existingOrders.length} order(s)</p>
              </div>
              <button
                type="button"
                onClick={() => setShowSettleModal(false)}
                className="h-8 w-8 rounded-full bg-white border border-[#EDE4D8] text-[#5C4D44] flex items-center justify-center hover:text-[#2C1810] shadow-xs"
                id="button-close-settle-modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-[#EDE4D8] text-center shadow-xs">
              <span className="text-[10px] uppercase tracking-wider text-[#8C7A6B] block font-semibold">Total Amount Due</span>
              <span className="font-bold text-2xl text-[#C87D55]">
                {restaurant?.currency}{existingSessionTotal.toLocaleString("en-IN")}
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#5C4D44] block mb-2">Payment Received Via:</label>
              <div className="grid grid-cols-4 gap-2">
                {(["CASH", "UPI", "CARD", "COUNTER"] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setSettleMethod(method)}
                    className={`py-2 px-1 text-xs font-semibold rounded-xl border transition-all shadow-2xs ${
                      settleMethod === method
                        ? "bg-[#2C1810] text-white border-[#2C1810]"
                        : "bg-white text-[#5C4D44] border-[#EDE4D8] hover:border-[#D9CCC0]"
                    }`}
                    id={`button-captain-method-${method.toLowerCase()}`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-[#8C7A6B] leading-relaxed">
              Settling marks all session orders as Paid, closes this dining session, and resets Table {selectedTable.tableNumber} to Available.
            </p>

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                disabled={settlingBill}
                onClick={() => setShowSettleModal(false)}
                className="flex-1 rounded-xl h-11 border-[#EDE4D8] bg-white text-[#5C4D44] hover:bg-[#EDE4D8]/50 text-xs"
              >
                Cancel
              </Button>
              <Button
                disabled={settlingBill}
                onClick={handleSettleBill}
                className="flex-1 rounded-xl h-11 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs gap-1.5 shadow-xs"
                id="button-confirm-captain-settle"
              >
                {settlingBill ? "Settling…" : `Settle (${settleMethod})`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
