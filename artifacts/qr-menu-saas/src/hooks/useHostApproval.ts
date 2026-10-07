import { useState, useEffect, useCallback, useRef } from "react";
import {
  subscribeToPendingHostApprovals,
  approvePendingHostOrder,
  rejectPendingHostOrder,
  getOrCreateDeviceId,
  getTableHostStatus,
  type PendingHostApprovalOrder,
  type GroupTabHost,
} from "@/lib/groupTab";

interface UseHostApprovalOptions {
  restaurantSlug: string;
  tableSlugOrId: string;
  tableId?: string;
  currentSessionId?: string | null;
  enabled?: boolean;
}

export function useHostApproval({
  restaurantSlug,
  tableSlugOrId,
  tableId: propTableId,
  currentSessionId,
  enabled = true,
}: UseHostApprovalOptions) {
  const [isHost, setIsHost] = useState<boolean>(false);
  const [hostInfo, setHostInfo] = useState<GroupTabHost | null>(null);
  const [pendingOrders, setPendingOrders] = useState<PendingHostApprovalOrder[]>([]);
  const [activePromptOrder, setActivePromptOrder] = useState<PendingHostApprovalOrder | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const deviceId = getOrCreateDeviceId();
  const knownPendingIdsRef = useRef<Set<string>>(new Set());

  const effectiveTableId = propTableId || tableSlugOrId;

  // 1. Check if current device is the host for this table and session
  const checkHostStatus = useCallback(async () => {
    // If no active session or disabled, immediately revoke host status
    if (!restaurantSlug || !effectiveTableId || !enabled || currentSessionId === null) {
      setIsHost(false);
      setHostInfo(null);
      return;
    }

    try {
      const status = await getTableHostStatus(restaurantSlug, effectiveTableId);
      setIsHost(status.isCurrentDeviceHost);
      setHostInfo(status.host);
    } catch (err) {
      console.warn("[useHostApproval] Error checking host status:", err);
    }
  }, [restaurantSlug, effectiveTableId, enabled, currentSessionId]);

  useEffect(() => {
    checkHostStatus();
    const interval = setInterval(checkHostStatus, 5000);
    return () => clearInterval(interval);
  }, [checkHostStatus]);

  // 2. Real-time Firestore subscription to pending_host_approval bound to currentSessionId
  useEffect(() => {
    if (!enabled || !isHost || !restaurantSlug || !effectiveTableId || !currentSessionId) {
      setPendingOrders([]);
      setActivePromptOrder(null);
      return;
    }

    const unsubscribe = subscribeToPendingHostApprovals(
      restaurantSlug,
      effectiveTableId,
      deviceId,
      (orders) => {
        // Filter strictly to current session to guarantee zero ghost routing
        const sessionOrders = orders.filter(
          (o) => !o.sessionId || o.sessionId === currentSessionId
        );
        setPendingOrders(sessionOrders);

        // Find the first unhandled pending order that hasn't expired yet
        const now = Date.now();
        const validOrders = sessionOrders.filter(
          (o) => o.status === "PENDING_HOST_APPROVAL" && (!o.expiresAt || o.expiresAt > now)
        );

        if (validOrders.length > 0) {
          const nextOrder = validOrders[0];
          setActivePromptOrder(nextOrder);

          // Audio chime if this is a newly discovered pending order
          if (!knownPendingIdsRef.current.has(nextOrder.id)) {
            knownPendingIdsRef.current.add(nextOrder.id);
            try {
              const audio = new Audio("/assets/error-chime.mp3");
              audio.volume = 0.8;
              audio.play().catch(() => {});
            } catch {
              // Ignore audio play block
            }
          }
        } else {
          setActivePromptOrder(null);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [enabled, isHost, restaurantSlug, effectiveTableId, deviceId]);

  // 3. Approval action
  const approveOrder = useCallback(
    async (pendingOrderId: string) => {
      setActionLoading(true);
      try {
        const result = await approvePendingHostOrder(restaurantSlug, effectiveTableId, pendingOrderId);
        if (result.success) {
          setPendingOrders((prev) => prev.filter((o) => o.id !== pendingOrderId));
          if (activePromptOrder?.id === pendingOrderId) {
            setActivePromptOrder(null);
          }
        }
        return result;
      } finally {
        setActionLoading(false);
      }
    },
    [restaurantSlug, effectiveTableId, activePromptOrder]
  );

  // 4. Rejection action
  const rejectOrder = useCallback(
    async (pendingOrderId: string, reason?: string) => {
      setActionLoading(true);
      try {
        const result = await rejectPendingHostOrder(restaurantSlug, effectiveTableId, pendingOrderId, reason);
        if (result.success) {
          setPendingOrders((prev) => prev.filter((o) => o.id !== pendingOrderId));
          if (activePromptOrder?.id === pendingOrderId) {
            setActivePromptOrder(null);
          }
        }
        return result;
      } finally {
        setActionLoading(false);
      }
    },
    [restaurantSlug, effectiveTableId, activePromptOrder]
  );

  const dismissCurrentPrompt = useCallback(() => {
    setActivePromptOrder(null);
  }, []);

  return {
    isHost,
    hostInfo,
    pendingOrders,
    activePromptOrder,
    actionLoading,
    approveOrder,
    rejectOrder,
    dismissCurrentPrompt,
    refreshHostStatus: checkHostStatus,
  };
}
