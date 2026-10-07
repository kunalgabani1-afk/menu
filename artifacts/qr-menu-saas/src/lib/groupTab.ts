import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirestoreDb } from "./firebase";

export interface GroupTabHost {
  hostDeviceId: string;
  hostName: string;
  tableId: string;
  tableNumber: string;
  assignedAt: number;
  status: "ACTIVE" | "CLOSED";
}

export interface GroupTabCartItem {
  id?: string;
  menuItemId?: string;
  name: string;
  price: number;
  quantity: number;
  specialInstructions?: string | null;
  modifiers?: any;
  selectedModifiers?: Array<{
    groupId: string;
    groupName: string;
    optionId: string;
    optionName: string;
    price: number;
  }>;
  addedByDiner?: string;
}

export interface PendingHostApprovalOrder {
  id: string;
  restaurantSlug: string;
  tableId: string;
  tableNumber: string;
  hostDeviceId: string;
  hostName: string;
  guestDeviceId: string;
  guestName: string; // The "First Name Only" Anchor
  items: GroupTabCartItem[];
  itemsSummary: string;
  totalAmount: number;
  currency: string;
  customerNote?: string | null;
  status: "PENDING_HOST_APPROVAL" | "APPROVED" | "REJECTED" | "BYPASSED_TIMEOUT";
  createdAt: number; // Unix ms
  expiresAt: number; // Unix ms (createdAt + 60000)
  approvedAt?: number;
  rejectedAt?: number;
  bypassedAt?: number;
  orderId?: string;
  warningTag?: string;
  sessionId?: string | null;
}

const DEVICE_ID_KEY = "tableline_device_id";
const FIRST_NAME_KEY = "tableline_diner_first_name";

/**
 * Secretly manages a persistent device ID in localStorage.
 * Used to identify whether the current phone is Phone 1 (Host) or Phone 2 (Guest).
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "server_dev";
  try {
    let deviceId = window.localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      const rand = Math.random().toString(36).slice(2, 10);
      const time = Date.now().toString(36);
      deviceId = `dev_${rand}_${time}`;
      window.localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch {
    return `dev_fallback_${Date.now()}`;
  }
}

/**
 * Manages the mandatory "First Name Only" Anchor in localStorage.
 * Used for zero-OTP frictionless customer identity.
 */
export function getStoredFirstName(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(FIRST_NAME_KEY) || "";
  } catch {
    return "";
  }
}

export function setStoredFirstName(firstName: string): void {
  if (typeof window === "undefined") return;
  try {
    const clean = firstName.trim();
    if (clean) {
      window.localStorage.setItem(FIRST_NAME_KEY, clean);
      window.localStorage.setItem("tableline_diner_name", clean);
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Summarizes cart items for the host popup (e.g. "1x Pizza, 2x Cold Coffee")
 */
export function formatItemsSummary(items: GroupTabCartItem[]): string {
  if (!items || items.length === 0) return "Order items";
  return items
    .slice(0, 3)
    .map((item) => `${item.quantity}x ${item.name}`)
    .join(", ") + (items.length > 3 ? ` + ${items.length - 3} more` : "");
}

/**
 * Formats table title and guest name for tickets and KDS
 * e.g., "Table 04 (Vivek)" or "Table 04 (Deepkumar)"
 */
export function formatTableWithDiner(tableNumber: string | number, dinerName?: string): string {
  const cleanTable = String(tableNumber || "01").replace(/^Table\s*/i, "").trim();
  const paddedTable = /^\d+$/.test(cleanTable) ? cleanTable.padStart(2, "0") : cleanTable;
  const name = dinerName ? dinerName.trim() : "";
  if (!name) return `Table ${paddedTable}`;
  return `Table ${paddedTable} (${name})`;
}

/**
 * Check whether the current device is designated as the active host of this table.
 */
export async function getTableHostStatus(
  restaurantSlug: string,
  tableSlugOrId: string
): Promise<{ hasHost: boolean; isCurrentDeviceHost: boolean; host: GroupTabHost | null }> {
  const currentDeviceId = getOrCreateDeviceId();
  try {
    const res = await fetch(`/api/public/menu/${restaurantSlug}/table/${tableSlugOrId}/host-status?deviceId=${encodeURIComponent(currentDeviceId)}`);
    if (res.ok) {
      const data = await res.json();
      return {
        hasHost: Boolean(data.hasHost),
        isCurrentDeviceHost: Boolean(data.isCurrentDeviceHost),
        host: data.host || null,
      };
    }
  } catch (err) {
    console.warn("[GroupTab] Failed to fetch host status from API, checking local session:", err);
  }

  // Local storage fallback for network resilience
  const localHostJson = localStorage.getItem(`tableline_host_${restaurantSlug}_${tableSlugOrId}`);
  if (localHostJson) {
    try {
      const parsed: GroupTabHost = JSON.parse(localHostJson);
      return {
        hasHost: true,
        isCurrentDeviceHost: parsed.hostDeviceId === currentDeviceId,
        host: parsed,
      };
    } catch {
      // Ignore parse error
    }
  }

  return { hasHost: false, isCurrentDeviceHost: false, host: null };
}

/**
 * Assigns current device as table host in localStorage and Firestore (e.g. table_04_host).
 * Called when Phone 1 places the first order on a table.
 */
export async function assignDeviceAsHost(
  restaurantSlug: string,
  tableSlugOrId: string,
  tableNumber: string | number,
  hostName: string
): Promise<GroupTabHost> {
  const hostDeviceId = getOrCreateDeviceId();
  const cleanTable = String(tableNumber || "01").replace(/^Table\s*/i, "").trim();
  const paddedTable = /^\d+$/.test(cleanTable) ? cleanTable.padStart(2, "0") : cleanTable;
  const hostDocKey = `table_${paddedTable}_host`;

  const hostRecord: GroupTabHost = {
    hostDeviceId,
    hostName: hostName.trim() || "Host",
    tableId: tableSlugOrId,
    tableNumber: String(tableNumber),
    assignedAt: Date.now(),
    status: "ACTIVE",
  };

  try {
    localStorage.setItem(`tableline_host_${restaurantSlug}_${tableSlugOrId}`, JSON.stringify(hostRecord));
    localStorage.setItem(`tableline_is_host_${restaurantSlug}_${tableSlugOrId}`, "true");
    localStorage.setItem(hostDocKey, hostDeviceId);
  } catch {
    // Ignore storage errors
  }

  return hostRecord;
}

/**
 * Real-time Firestore listener for Phone 1 (The Host)
 * Listens on the pending_host_approval sub-collection for Table XX.
 * Also uses backend polling fallback for seamless execution in all environments.
 */
export function subscribeToPendingHostApprovals(
  restaurantSlug: string,
  tableId: string,
  hostDeviceId: string,
  onOrdersChange: (orders: PendingHostApprovalOrder[]) => void
): Unsubscribe {
  let isUnsubscribed = false;
  let firestoreUnsub: Unsubscribe | null = null;

  const db = getFirestoreDb();
  if (db) {
    try {
      // Sub-collection path: restaurants/{restaurantSlug}/tables/{tableId}/pending_host_approval
      const pendingColl = collection(db, "restaurants", restaurantSlug, "tables", tableId, "pending_host_approval");
      const q = query(pendingColl, where("status", "==", "PENDING_HOST_APPROVAL"));

      firestoreUnsub = onSnapshot(
        q,
        (snapshot) => {
          if (isUnsubscribed) return;
          const list: PendingHostApprovalOrder[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as PendingHostApprovalOrder;
            if (data && data.status === "PENDING_HOST_APPROVAL") {
              list.push({ ...data, id: docSnap.id });
            }
          });
          onOrdersChange(list);
        },
        (error) => {
          console.warn("[GroupTab Firestore] onSnapshot notice:", error.message);
        }
      );
    } catch (err) {
      console.warn("[GroupTab Firestore] Initialization notice:", err);
    }
  }

  // Background sync with API server
  const pollInterval = setInterval(async () => {
    if (isUnsubscribed) return;
    try {
      const res = await fetch(
        `/api/public/menu/${restaurantSlug}/table/${tableId}/pending-orders?hostDeviceId=${encodeURIComponent(hostDeviceId)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.orders)) {
          onOrdersChange(data.orders);
        }
      }
    } catch {
      // Ignore background sync errors
    }
  }, 3500);

  return () => {
    isUnsubscribed = true;
    clearInterval(pollInterval);
    if (firestoreUnsub) firestoreUnsub();
  };
}

/**
 * Real-time Firestore listener for Phone 2 (The Guest)
 * Listens to their specific pending order document until APPROVED, REJECTED, or BYPASSED.
 */
export function subscribeToGuestPendingOrder(
  restaurantSlug: string,
  tableId: string,
  pendingOrderId: string,
  onOrderUpdate: (order: PendingHostApprovalOrder | null) => void
): Unsubscribe {
  let isUnsubscribed = false;
  let firestoreUnsub: Unsubscribe | null = null;

  const db = getFirestoreDb();
  if (db) {
    try {
      const orderDocRef = doc(db, "restaurants", restaurantSlug, "tables", tableId, "pending_host_approval", pendingOrderId);
      firestoreUnsub = onSnapshot(
        orderDocRef,
        (snap) => {
          if (isUnsubscribed) return;
          if (snap.exists()) {
            onOrderUpdate({ ...(snap.data() as PendingHostApprovalOrder), id: snap.id });
          }
        },
        (err) => {
          console.warn("[GroupTab Guest Listener] Firestore notice:", err);
        }
      );
    } catch (err) {
      console.warn("[GroupTab Guest Listener] Setup notice:", err);
    }
  }

  // Poll backend for real-time order state transition
  const interval = setInterval(async () => {
    if (isUnsubscribed) return;
    try {
      const res = await fetch(`/api/public/menu/${restaurantSlug}/table/${tableId}/pending-orders/${pendingOrderId}`);
      if (res.ok) {
        const order = await res.json();
        onOrderUpdate(order);
      }
    } catch {
      // Ignore
    }
  }, 2000);

  return () => {
    isUnsubscribed = true;
    clearInterval(interval);
    if (firestoreUnsub) firestoreUnsub();
  };
}

/**
 * Host Action: Approve a pending guest order.
 * Moves the order to the main KDS queue for kitchen fulfillment.
 */
export async function approvePendingHostOrder(
  restaurantSlug: string,
  tableId: string,
  pendingOrderId: string
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  const hostDeviceId = getOrCreateDeviceId();

  // 1. Non-blocking Firestore sync
  const db = getFirestoreDb();
  if (db) {
    try {
      const docRef = doc(db, "restaurants", restaurantSlug, "tables", tableId, "pending_host_approval", pendingOrderId);
      setDoc(
        docRef,
        {
          status: "APPROVED",
          approvedAt: Date.now(),
        },
        { merge: true }
      ).catch(() => {});
    } catch {
      // Ignore
    }
  }

  // 2. Call backend to inject directly into main KDS queue
  try {
    const res = await fetch(`/api/public/menu/${restaurantSlug}/table/${tableId}/pending-orders/${pendingOrderId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostDeviceId }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, orderId: data.orderId };
    }
    return { success: false, error: data.error || "Failed to approve order." };
  } catch (err: any) {
    return { success: false, error: err.message || "Network error while approving." };
  }
}

/**
 * Host Action: Reject a pending guest order.
 */
export async function rejectPendingHostOrder(
  restaurantSlug: string,
  tableId: string,
  pendingOrderId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const hostDeviceId = getOrCreateDeviceId();

  const db = getFirestoreDb();
  if (db) {
    try {
      const docRef = doc(db, "restaurants", restaurantSlug, "tables", tableId, "pending_host_approval", pendingOrderId);
      setDoc(
        docRef,
        {
          status: "REJECTED",
          rejectedAt: Date.now(),
        },
        { merge: true }
      ).catch(() => {});
    } catch {
      // Ignore
    }
  }

  try {
    const res = await fetch(`/api/public/menu/${restaurantSlug}/table/${tableId}/pending-orders/${pendingOrderId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostDeviceId, reason }),
    });
    const data = await res.json();
    return { success: res.ok && data.success, error: data.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * 60-Second Kitchen Bypass (Edge Case Handling)
 * When 60 seconds expire without the host tapping Approve/Reject:
 * Automatically bypasses the host and moves the order to the main KDS queue
 * flagged with: "⚠️ Table 04 Add-on (Host Unreachable - Verify in Person)".
 */
export async function bypassPendingHostOrder(
  restaurantSlug: string,
  tableId: string,
  pendingOrderId: string
): Promise<{ success: boolean; orderId?: string; warningTag?: string; error?: string }> {
  const db = getFirestoreDb();
  if (db) {
    try {
      const docRef = doc(db, "restaurants", restaurantSlug, "tables", tableId, "pending_host_approval", pendingOrderId);
      setDoc(
        docRef,
        {
          status: "BYPASSED_TIMEOUT",
          bypassedAt: Date.now(),
        },
        { merge: true }
      ).catch(() => {});
    } catch {
      // Ignore
    }
  }

  try {
    const res = await fetch(`/api/public/menu/${restaurantSlug}/table/${tableId}/pending-orders/${pendingOrderId}/bypass`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bypassedAt: Date.now() }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return {
        success: true,
        orderId: data.orderId,
        warningTag: data.warningTag,
      };
    }
    return { success: false, error: data.error || "Failed to bypass order." };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
