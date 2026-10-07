import { useState, useEffect, useCallback, useRef } from "react";
import { doc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import { getOrCreateDeviceId } from "@/lib/groupTab";
import {
  initializeOrClaimTableSession,
  closeTableSession,
} from "@/lib/tableSession";
import type { TableStatus, TableFirestoreDoc } from "@/types/tableSession";

export interface UseTableSessionProps {
  restaurantSlug: string;
  tableSlugOrId: string;
  tableNumber?: string | number;
  dinerName?: string;
  enabled?: boolean;
  onSessionClosed?: () => void;
}

export interface UseTableSessionReturn {
  tableId: string;
  tableNumber: string;
  status: TableStatus;
  currentSessionId: string | null;
  hostDeviceId: string | null;
  isHost: boolean;
  isSessionActive: boolean;
  isSessionClosed: boolean;
  sessionStartedAt: number | null;
  isLoading: boolean;
  error: string | null;
  closeSession: (reason?: string) => Promise<void>;
  resetSessionForNewParty: () => void;
}

/**
 * useTableSession: Manages the temporary table session lifecycle on QR scan.
 * 
 * 1. If table is 'empty' or currentSessionId is null:
 *    Atomically initializes a new temporary currentSessionId and claims hostDeviceId.
 * 2. If table is 'active':
 *    Joins the existing currentSessionId.
 * 3. Real-time Kick-Out:
 *    If closeTableSession fires while a guest is on the menu, instantly detects that
 *    currentSessionId is now null. Wipes local cart and sets isSessionClosed = true
 *    so the UI renders the polite "Thank you for dining with us" screen.
 */
export function useTableSession({
  restaurantSlug,
  tableSlugOrId,
  tableNumber,
  dinerName,
  enabled = true,
  onSessionClosed,
}: UseTableSessionProps): UseTableSessionReturn {
  const [status, setStatus] = useState<TableStatus>("empty");
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [hostDeviceId, setHostDeviceId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [isSessionClosed, setIsSessionClosed] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const deviceId = getOrCreateDeviceId();
  const joinedSessionIdRef = useRef<string | null>(null);
  const isInitializingRef = useRef<boolean>(false);
  const effectiveTableNumber = String(tableNumber || "01");

  // Helper to wipe local cart on session termination
  const wipeLocalCartData = useCallback(() => {
    try {
      if (effectiveTableNumber) {
        localStorage.removeItem(`tableline_live_cart_${restaurantSlug}_${effectiveTableNumber}`);
        const cleanTable = effectiveTableNumber.replace(/^Table\s*/i, "").padStart(2, "0");
        localStorage.removeItem(`tableline_live_cart_${restaurantSlug}_${cleanTable}`);
      }
      localStorage.removeItem(`tableline_host_${restaurantSlug}_${tableSlugOrId}`);
      sessionStorage.removeItem(`table_session_${restaurantSlug}_${tableSlugOrId}`);
      sessionStorage.removeItem(`table_session_${restaurantSlug}`);
    } catch (err) {
      console.warn("[useTableSession] Local storage cleanup notice:", err);
    }
  }, [restaurantSlug, tableSlugOrId, effectiveTableNumber]);

  // Main QR scan listener & session manager
  useEffect(() => {
    if (!enabled || !restaurantSlug || !tableSlugOrId) {
      setIsLoading(false);
      return;
    }

    const db = getFirestoreDb();
    if (!db) {
      // Local fallback mode when Firebase client config is absent
      const fallbackSession = `sess_${Date.now()}_local`;
      joinedSessionIdRef.current = fallbackSession;
      setCurrentSessionId(fallbackSession);
      setStatus("active");
      setIsHost(true);
      setIsLoading(false);
      return;
    }

    const tableDocRef = doc(db, "restaurants", restaurantSlug, "tables", tableSlugOrId);
    let isSubscribed = true;

    const unsubscribe: Unsubscribe = onSnapshot(
      tableDocRef,
      async (snapshot) => {
        if (!isSubscribed) return;

        try {
          if (!snapshot.exists()) {
            // Table document not yet initialized in Firestore: initialize now
            if (!isInitializingRef.current) {
              isInitializingRef.current = true;
              const result = await initializeOrClaimTableSession({
                restaurantSlug,
                tableId: tableSlugOrId,
                tableNumber,
                dinerName,
              });

              if (isSubscribed) {
                joinedSessionIdRef.current = result.currentSessionId;
                setCurrentSessionId(result.currentSessionId);
                setHostDeviceId(result.hostDeviceId);
                setIsHost(result.isHost);
                setStatus("active");
                setIsLoading(false);
              }
              isInitializingRef.current = false;
            }
            return;
          }

          const data = snapshot.data() as Partial<TableFirestoreDoc>;
          const serverStatus = data.status || "empty";
          const serverSessionId = data.currentSessionId || null;
          const serverHostDeviceId = data.hostDeviceId || null;

          // ----------------------------------------------------------------------
          // 4. GUEST UI KICK-OUT DETECTION
          // ----------------------------------------------------------------------
          // If this device was previously part of an active session, but now:
          // - serverSessionId is null, OR
          // - table status is 'empty', OR
          // - serverSessionId has changed to a new session (previous group settled)
          // => INSTANT KICK-OUT!
          if (
            joinedSessionIdRef.current &&
            (!serverSessionId || serverStatus === "empty" || serverSessionId !== joinedSessionIdRef.current)
          ) {
            console.log("[useTableSession] Active dining session terminated by closeTableSession.");
            joinedSessionIdRef.current = null;
            setCurrentSessionId(null);
            setHostDeviceId(null);
            setIsHost(false);
            setStatus("empty");
            setIsSessionClosed(true);
            setIsLoading(false);

            // Wipe local storage cart to prevent ghost orders
            wipeLocalCartData();
            onSessionClosed?.();
            return;
          }

          // ----------------------------------------------------------------------
          // 1. EMPTY TABLE FLOW: Initialize Session & Claim Host
          // ----------------------------------------------------------------------
          if (serverStatus === "empty" || !serverSessionId) {
            if (!isInitializingRef.current && !isSessionClosed) {
              isInitializingRef.current = true;
              const result = await initializeOrClaimTableSession({
                restaurantSlug,
                tableId: tableSlugOrId,
                tableNumber: data.tableNumber || tableNumber,
                dinerName,
              });

              if (isSubscribed) {
                joinedSessionIdRef.current = result.currentSessionId;
                setCurrentSessionId(result.currentSessionId);
                setHostDeviceId(result.hostDeviceId);
                setIsHost(result.isHost);
                setStatus("active");
                setSessionStartedAt(Date.now());
                setIsLoading(false);
              }
              isInitializingRef.current = false;
            }
            return;
          }

          // ----------------------------------------------------------------------
          // 2. ACTIVE TABLE FLOW: Join Existing currentSessionId
          // ----------------------------------------------------------------------
          if (serverStatus === "active" && serverSessionId) {
            joinedSessionIdRef.current = serverSessionId;
            setCurrentSessionId(serverSessionId);
            setHostDeviceId(serverHostDeviceId);
            setIsHost(serverHostDeviceId === deviceId);
            setStatus("active");
            setSessionStartedAt(data.sessionStartedAt || null);
            setIsLoading(false);
          }
        } catch (err: any) {
          console.error("[useTableSession] Snapshot processing error:", err);
          if (isSubscribed) {
            setError(err.message || "Failed to sync table session");
            setIsLoading(false);
          }
        }
      },
      (err) => {
        console.warn("[useTableSession] Firestore listener error, fallback active:", err);
        if (isSubscribed) {
          setIsLoading(false);
        }
      }
    );

    return () => {
      isSubscribed = false;
      unsubscribe();
    };
  }, [
    enabled,
    restaurantSlug,
    tableSlugOrId,
    tableNumber,
    dinerName,
    deviceId,
    isSessionClosed,
    wipeLocalCartData,
    onSessionClosed,
  ]);

  // Kill Switch action: Close the current dining session
  const closeSession = useCallback(
    async (reason = "BILL_SETTLED") => {
      try {
        await closeTableSession({
          restaurantSlug,
          tableId: tableSlugOrId,
          tableNumber: effectiveTableNumber,
          reason,
        });
        wipeLocalCartData();
        joinedSessionIdRef.current = null;
        setCurrentSessionId(null);
        setHostDeviceId(null);
        setIsHost(false);
        setStatus("empty");
        setIsSessionClosed(true);
      } catch (err: any) {
        console.error("[useTableSession] closeSession failed:", err);
        throw err;
      }
    },
    [restaurantSlug, tableSlugOrId, effectiveTableNumber, wipeLocalCartData]
  );

  // Allows a customer to re-scan or start a new dining session after kick-out
  const resetSessionForNewParty = useCallback(() => {
    wipeLocalCartData();
    joinedSessionIdRef.current = null;
    setCurrentSessionId(null);
    setHostDeviceId(null);
    setIsHost(false);
    setStatus("empty");
    setIsSessionClosed(false);
    setError(null);
    setIsLoading(true);
  }, [wipeLocalCartData]);

  return {
    tableId: tableSlugOrId,
    tableNumber: effectiveTableNumber,
    status,
    currentSessionId,
    hostDeviceId,
    isHost,
    isSessionActive: status === "active" && Boolean(currentSessionId) && !isSessionClosed,
    isSessionClosed,
    sessionStartedAt,
    isLoading,
    error,
    closeSession,
    resetSessionForNewParty,
  };
}
