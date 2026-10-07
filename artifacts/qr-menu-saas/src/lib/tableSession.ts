import {
  doc,
  runTransaction,
  collection,
  getDocs,
  query,
  where,
  writeBatch,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import { getFirestoreDb } from "./firebase";
import { getOrCreateDeviceId } from "./groupTab";
import type { TableFirestoreDoc } from "../types/tableSession";

export interface CloseTableSessionParams {
  restaurantSlug: string;
  tableId: string;
  tableNumber?: string | number;
  reason?: string;
}

export interface CloseTableSessionResult {
  success: boolean;
  tableId: string;
  closedSessionId: string | null;
  message: string;
}

/**
 * Generates a unique, collision-resistant temporary session ID.
 * Bound to one dining party only.
 */
export function generateSessionId(): string {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).slice(2, 9);
  return `sess_${timestamp}_${randomPart}`;
}

/**
 * THE KILL SWITCH: closeTableSession
 * 
 * Secure Firestore Transaction that resets the table session lifecycle.
 * 1. Takes tableId (and restaurantSlug).
 * 2. Marks all pending cart items and host approval orders for that session as 'expired' / 'cleared'.
 * 3. Strictly resets the Table document to { status: 'empty', currentSessionId: null, hostDeviceId: null }.
 * 4. Triggers the real-time listener kick-out on any connected guest devices.
 */
export async function closeTableSession({
  restaurantSlug,
  tableId,
  tableNumber,
  reason = "BILL_SETTLED",
}: CloseTableSessionParams): Promise<CloseTableSessionResult> {
  const db: Firestore | null = getFirestoreDb();
  if (!db) {
    // Local / fallback mode
    try {
      localStorage.removeItem(`tableline_host_${restaurantSlug}_${tableId}`);
      localStorage.removeItem(`tableline_session_${restaurantSlug}_${tableId}`);
      if (tableNumber) {
        localStorage.removeItem(`tableline_live_cart_${restaurantSlug}_${tableNumber}`);
      }
    } catch {}
    return {
      success: true,
      tableId,
      closedSessionId: null,
      message: "Session closed locally (Firebase unconfigured).",
    };
  }

  const tableDocRef = doc(db, "restaurants", restaurantSlug, "tables", tableId);
  const now = Date.now();

  try {
    let closedSessionId: string | null = null;
    let effectiveTableNumber = tableNumber ? String(tableNumber) : "";

    // 1. Execute Atomic Transaction on the Table Document
    await runTransaction(db, async (transaction) => {
      const tableSnapshot = await transaction.get(tableDocRef);

      if (tableSnapshot.exists()) {
        const data = tableSnapshot.data() as Partial<TableFirestoreDoc>;
        closedSessionId = data.currentSessionId || null;
        if (!effectiveTableNumber && data.tableNumber) {
          effectiveTableNumber = String(data.tableNumber);
        }
      }

      // Strictly reset the table document
      transaction.set(
        tableDocRef,
        {
          status: "empty",
          currentSessionId: null,
          hostDeviceId: null,
          hostName: null,
          sessionEndedAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    });

    // 2. Mark all pending cart items & host approval requests for this session as 'expired' / 'cleared'
    const batch = writeBatch(db);
    let batchOperationsCount = 0;

    // A. Pending host approval sub-collection
    try {
      const pendingColl = collection(db, "restaurants", restaurantSlug, "tables", tableId, "pending_host_approval");
      const pendingQuery = query(pendingColl, where("status", "==", "PENDING_HOST_APPROVAL"));
      const pendingSnaps = await getDocs(pendingQuery);

      pendingSnaps.forEach((docSnap) => {
        batch.update(docSnap.ref, {
          status: "EXPIRED",
          expiredReason: reason,
          expiredAt: now,
          sessionId: closedSessionId,
        });
        batchOperationsCount++;
      });
    } catch (err) {
      console.warn("[closeTableSession] Pending approval cleanup notice:", err);
    }

    // B. Table shared multiplayer cart
    if (effectiveTableNumber) {
      const cleanTable = effectiveTableNumber.replace(/^Table\s*/i, "").padStart(2, "0");
      const cartDocRef = doc(db, "restaurants", restaurantSlug, "table_carts", cleanTable);
      batch.set(
        cartDocRef,
        {
          items: [],
          status: "cleared",
          clearedReason: reason,
          clearedAt: now,
          previousSessionId: closedSessionId,
        },
        { merge: true }
      );
      batchOperationsCount++;

      // Also reset table host document if exists
      const hostDocRef = doc(db, "restaurants", restaurantSlug, "table_hosts", `table_${cleanTable}_host`);
      batch.set(
        hostDocRef,
        {
          status: "CLOSED",
          hostDeviceId: null,
          closedAt: now,
          sessionId: closedSessionId,
        },
        { merge: true }
      );
      batchOperationsCount++;
    }

    if (batchOperationsCount > 0) {
      await batch.commit();
    }

    // 3. Clear local storage records on caller device
    try {
      localStorage.removeItem(`tableline_host_${restaurantSlug}_${tableId}`);
      localStorage.removeItem(`tableline_session_${restaurantSlug}_${tableId}`);
      if (effectiveTableNumber) {
        localStorage.removeItem(`tableline_live_cart_${restaurantSlug}_${effectiveTableNumber}`);
      }
    } catch {}

    return {
      success: true,
      tableId,
      closedSessionId,
      message: `Table session ${closedSessionId || ""} successfully closed and reset to empty.`,
    };
  } catch (error: any) {
    console.error("[closeTableSession] Failed to reset table session:", error);
    throw new Error(`Failed to close table session: ${error.message || error}`);
  }
}

/**
 * Initializes a new temporary session and claims hostDeviceId if table is empty.
 * Runs atomically within a Firestore Transaction to prevent race conditions when
 * two guests scan simultaneously.
 */
export async function initializeOrClaimTableSession({
  restaurantSlug,
  tableId,
  tableNumber,
  dinerName,
}: {
  restaurantSlug: string;
  tableId: string;
  tableNumber?: string | number;
  dinerName?: string;
}): Promise<{
  currentSessionId: string;
  hostDeviceId: string;
  isHost: boolean;
  status: "active";
}> {
  const db = getFirestoreDb();
  const deviceId = getOrCreateDeviceId();
  const hostName = dinerName?.trim() || "Host";
  const now = Date.now();

  if (!db) {
    const fallbackSessionId = generateSessionId();
    return {
      currentSessionId: fallbackSessionId,
      hostDeviceId: deviceId,
      isHost: true,
      status: "active",
    };
  }

  const tableDocRef = doc(db, "restaurants", restaurantSlug, "tables", tableId);

  return await runTransaction(db, async (transaction) => {
    const tableSnap = await transaction.get(tableDocRef);
    const existing = tableSnap.exists() ? (tableSnap.data() as Partial<TableFirestoreDoc>) : null;

    // Check if table is empty or missing a valid session
    const isTableEmpty = !existing || existing.status === "empty" || !existing.currentSessionId;

    if (isTableEmpty) {
      // Initialize fresh session and claim host
      const newSessionId = generateSessionId();

      transaction.set(
        tableDocRef,
        {
          id: tableId,
          tableNumber: tableNumber ?? existing?.tableNumber ?? "01",
          status: "active",
          currentSessionId: newSessionId,
          hostDeviceId: deviceId,
          hostName,
          sessionStartedAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      return {
        currentSessionId: newSessionId,
        hostDeviceId: deviceId,
        isHost: true,
        status: "active" as const,
      };
    } else {
      // Table is active, join existing session
      const activeSessionId = existing.currentSessionId!;
      const isCurrentDeviceHost = existing.hostDeviceId === deviceId;

      return {
        currentSessionId: activeSessionId,
        hostDeviceId: existing.hostDeviceId || "",
        isHost: isCurrentDeviceHost,
        status: "active" as const,
      };
    }
  });
}

/**
 * Firebase Cloud Functions Implementation (TypeScript)
 * Ready to deploy in Firebase Functions (e.g. functions/src/index.ts).
 * 
 * Usage:
 *   const { closeTableSessionFunction } = require("./tableSession");
 *   exports.closeTableSession = closeTableSessionFunction;
 */
export const cloudFunctionCodeSnippet = `
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

export const closeTableSession = functions.https.onCall(async (data, context) => {
  const { restaurantSlug, tableId, tableNumber, reason = "BILL_SETTLED" } = data;

  if (!restaurantSlug || !tableId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Both restaurantSlug and tableId are required."
    );
  }

  const db = admin.firestore();
  const tableRef = db.doc(\`restaurants/\${restaurantSlug}/tables/\${tableId}\`);
  const now = Date.now();

  try {
    let closedSessionId = null;

    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(tableRef);
      if (snap.exists) {
        closedSessionId = snap.data()?.currentSessionId || null;
      }

      // Strictly reset the table document to empty
      transaction.update(tableRef, {
        status: "empty",
        currentSessionId: null,
        hostDeviceId: null,
        hostName: null,
        sessionEndedAt: now,
        updatedAt: now,
      });
    });

    // Mark pending cart items & orders as expired
    const pendingColl = db.collection(\`restaurants/\${restaurantSlug}/tables/\${tableId}/pending_host_approval\`);
    const pendingSnaps = await pendingColl.where("status", "==", "PENDING_HOST_APPROVAL").get();
    
    const batch = db.batch();
    pendingSnaps.forEach((docSnap) => {
      batch.update(docSnap.ref, {
        status: "EXPIRED",
        expiredReason: reason,
        expiredAt: now,
        sessionId: closedSessionId,
      });
    });

    if (tableNumber) {
      const cleanTable = String(tableNumber).replace(/^Table\\\\s*/i, "").padStart(2, "0");
      const cartRef = db.doc(\`restaurants/\${restaurantSlug}/table_carts/\${cleanTable}\`);
      batch.set(cartRef, {
        items: [],
        status: "cleared",
        clearedReason: reason,
        clearedAt: now,
      }, { merge: true });
    }

    await batch.commit();

    return {
      success: true,
      tableId,
      closedSessionId,
      message: "Table session closed successfully.",
    };
  } catch (error) {
    throw new functions.https.HttpsError("internal", error.message);
  }
});
`;
