import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import { triggerHaptic } from "@/lib/haptics";

export interface MultiplayerCartItem {
  cartItemId: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string | null;
  veg?: boolean;
  isJain?: boolean;
  selectedModifiers?: Array<{
    groupName?: string;
    optionName?: string;
    price?: number;
  }>;
  specialInstructions?: string;
  addedBy: string; // The diner's name anchor (e.g. "Vivek", "Aakash")
  addedAt: number;
}

interface UseMultiplayerCartProps {
  restaurantSlug: string;
  tableNumber: string;
  currentDinerName?: string;
}

export function useMultiplayerCart({
  restaurantSlug,
  tableNumber,
  currentDinerName = "You",
}: UseMultiplayerCartProps) {
  const [cartItems, setCartItems] = useState<MultiplayerCartItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState(false);

  // Local storage fallback key
  const storageKey = `tableline_live_cart_${restaurantSlug}_${tableNumber}`;

  // Load initial from local storage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setCartItems(JSON.parse(saved));
      }
    } catch {}
  }, [storageKey]);

  // Firestore Document Ref: /restaurants/{restaurantSlug}/tables/{tableNumber}
  useEffect(() => {
    if (!restaurantSlug || !tableNumber) return;

    const db = getFirestoreDb();
    if (!db) {
      // Local fallback mode
      setIsLiveConnected(false);
      return;
    }

    const cleanTable = String(tableNumber).replace(/^Table\s*/i, "").padStart(2, "0");
    const cartDocRef = doc(db, "restaurants", restaurantSlug, "table_carts", cleanTable);

    const unsubscribe = onSnapshot(
      cartDocRef,
      (snapshot) => {
        setIsLiveConnected(true);
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (Array.isArray(data.items)) {
            setCartItems(data.items);
            try {
              localStorage.setItem(storageKey, JSON.stringify(data.items));
            } catch {}
          }
        }
      },
      (err) => {
        console.warn("[MultiplayerCart] Firestore sync fallback to local:", err.message);
        setIsLiveConnected(false);
      }
    );

    return () => unsubscribe();
  }, [restaurantSlug, tableNumber, storageKey]);

  // Sync to Firestore & Local Storage
  const persistCart = useCallback(
    async (nextItems: MultiplayerCartItem[]) => {
      setCartItems(nextItems);
      try {
        localStorage.setItem(storageKey, JSON.stringify(nextItems));
      } catch {}

      const db = getFirestoreDb();
      if (!db || !restaurantSlug || !tableNumber) return;

      setIsSyncing(true);
      try {
        const cleanTable = String(tableNumber).replace(/^Table\s*/i, "").padStart(2, "0");
        const cartDocRef = doc(db, "restaurants", restaurantSlug, "table_carts", cleanTable);

        await setDoc(
          cartDocRef,
          {
            items: nextItems,
            updatedAt: Date.now(),
            tableNumber: cleanTable,
            restaurantSlug,
            lastUpdatedBy: currentDinerName,
          },
          { merge: true }
        );
      } catch (err) {
        console.warn("[MultiplayerCart] Write failed, stored locally:", err);
      } finally {
        setIsSyncing(false);
      }
    },
    [restaurantSlug, tableNumber, storageKey, currentDinerName]
  );

  // Add Item to Shared Cart with Optimistic Haptic Tick
  const addItem = useCallback(
    async (item: {
      id: string;
      name: string;
      price: number;
      imageUrl?: string | null;
      veg?: boolean;
      isJain?: boolean;
      selectedModifiers?: Array<{ groupName?: string; optionName?: string; price?: number }>;
      specialInstructions?: string;
    }) => {
      // 50ms native haptic tick
      triggerHaptic("tick");

      const modKey = (item.selectedModifiers || [])
        .map((m) => `${m.groupName}:${m.optionName}`)
        .sort()
        .join("|");
      const cartItemId = `${item.id}_${modKey || "standard"}`;

      // Calculate unit price with modifiers
      const modifierSum = (item.selectedModifiers || []).reduce((acc, m) => acc + (m.price || 0), 0);
      const unitPrice = item.price + modifierSum;

      const existingIndex = cartItems.findIndex((c) => c.cartItemId === cartItemId);

      let next: MultiplayerCartItem[];
      if (existingIndex >= 0) {
        next = cartItems.map((c, idx) =>
          idx === existingIndex
            ? {
                ...c,
                quantity: c.quantity + 1,
                addedBy: currentDinerName,
              }
            : c
        );
      } else {
        const newItem: MultiplayerCartItem = {
          cartItemId,
          menuItemId: item.id,
          name: item.name,
          price: unitPrice,
          quantity: 1,
          imageUrl: item.imageUrl,
          veg: item.veg,
          isJain: item.isJain,
          selectedModifiers: item.selectedModifiers,
          specialInstructions: item.specialInstructions,
          addedBy: currentDinerName,
          addedAt: Date.now(),
        };
        next = [...cartItems, newItem];
      }

      await persistCart(next);
    },
    [cartItems, currentDinerName, persistCart]
  );

  // Update item quantity
  const updateQuantity = useCallback(
    async (cartItemId: string, delta: number) => {
      triggerHaptic("soft");

      const next = cartItems
        .map((item) => {
          if (item.cartItemId === cartItemId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as MultiplayerCartItem[];

      await persistCart(next);
    },
    [cartItems, persistCart]
  );

  // Remove Item
  const removeItem = useCallback(
    async (cartItemId: string) => {
      triggerHaptic("soft");
      const next = cartItems.filter((i) => i.cartItemId !== cartItemId);
      await persistCart(next);
    },
    [cartItems, persistCart]
  );

  // Clear Cart
  const clearCart = useCallback(async () => {
    triggerHaptic("doubleTick");
    await persistCart([]);
  }, [persistCart]);

  // Derived financials
  const subtotal = useMemo(() => {
    return cartItems.reduce((acc, i) => acc + i.price * i.quantity, 0);
  }, [cartItems]);

  const taxes = useMemo(() => {
    // 5% standard food GST
    return Math.round(subtotal * 0.05 * 100) / 100;
  }, [subtotal]);

  const grandTotal = useMemo(() => {
    return subtotal + taxes;
  }, [subtotal, taxes]);

  const totalItemsCount = useMemo(() => {
    return cartItems.reduce((acc, i) => acc + i.quantity, 0);
  }, [cartItems]);

  // List of active diners contributing to this shared table session
  const activeDiners = useMemo(() => {
    const set = new Set<string>();
    cartItems.forEach((i) => {
      if (i.addedBy) set.add(i.addedBy);
    });
    return Array.from(set);
  }, [cartItems]);

  // Quantity map by menuItemId for Instant Morphing Button state
  const quantityMap = useMemo(() => {
    const map = new Map<string, number>();
    cartItems.forEach((item) => {
      const current = map.get(item.menuItemId) || 0;
      map.set(item.menuItemId, current + item.quantity);
    });
    return map;
  }, [cartItems]);

  // Item creator map by menuItemId (e.g. "Vivek")
  const addedByMap = useMemo(() => {
    const map = new Map<string, string>();
    cartItems.forEach((item) => {
      if (item.addedBy && item.addedBy !== currentDinerName) {
        map.set(item.menuItemId, item.addedBy);
      }
    });
    return map;
  }, [cartItems, currentDinerName]);

  return {
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
    isSyncing,
    isLiveConnected,
  };
}
