import { Router, type IRouter, type Request, type Response } from "express";
import { getDatabase, createId, cleanForFirebase } from "../lib/firebase";
import { getTenantAccess, errorResponse } from "../lib/http";
import { orderEvents } from "./orders";
import { createAuditLog } from "../lib/audit";

const router: IRouter = Router();

export interface ShiftRecord {
  id: string;
  shiftId: string;
  restaurantId: string;
  restaurantSlug: string;
  openedAt: string;
  closedAt: string;
  closedBy: {
    uid: string;
    name: string;
    email: string;
    role: string;
  };
  expectedCash: number;
  countedCash: number;
  difference: number;
  discrepancyType: "MATCHED" | "SHORT" | "OVER";
  status: "CLOSED";
  cashOrdersCount: number;
  currency: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Authoritatively calculates expected cash from real database orders for the open shift period.
 */
async function calculateAuthoritativeExpectedCash(
  restaurantId: string,
  openedAt: string,
): Promise<{
  expectedCash: number;
  cashOrdersCount: number;
  totalOrdersCount: number;
}> {
  const db = getDatabase();
  const ordersSnap = await db.ref(`restaurants/${restaurantId}/orders`).get();
  const rawOrders = (ordersSnap.val() ?? {}) as Record<string, any>;

  const openedAtTime = new Date(openedAt).getTime();
  let expectedCash = 0;
  let cashOrdersCount = 0;
  let totalOrdersCount = 0;

  for (const order of Object.values(rawOrders)) {
    if (!order || order.status === "CANCELLED" || order.status === "DECLINED") {
      continue;
    }

    const orderTime = new Date(order.createdAt || 0).getTime();
    if (orderTime < openedAtTime) {
      continue;
    }

    totalOrdersCount++;

    // Check if payment was collected as cash
    const isCashPaid =
      order.paymentStatus === "CASH_PAID" ||
      (order.paymentMethod === "CASH" && (order.paymentStatus === "PAID" || order.status === "COMPLETED" || order.status === "APPROVED" || order.status === "ACCEPTED")) ||
      (order.paymentMethod === "PAY_LATER" && order.paymentStatus === "CASH_PAID");

    if (isCashPaid) {
      const amount = Number(order.total ?? order.totalAmount ?? 0);
      if (!isNaN(amount) && amount > 0) {
        expectedCash += amount;
        cashOrdersCount++;
      }
    }
  }

  return {
    expectedCash: Math.round(expectedCash * 100) / 100,
    cashOrdersCount,
    totalOrdersCount,
  };
}

/**
 * Determine the open shift's start time based on past closed shifts or beginning of day
 */
async function getOpenShiftOpenedAt(
  restaurantId: string,
  timezone: string,
): Promise<{ openedAt: string; lastClosedShift: ShiftRecord | null }> {
  const db = getDatabase();
  const shiftsSnap = await db.ref(`restaurants/${restaurantId}/shifts`).get();
  const rawShifts = (shiftsSnap.val() ?? {}) as Record<string, any>;

  const closedShifts = Object.values(rawShifts)
    .filter((s: any) => s && s.status === "CLOSED" && s.closedAt)
    .sort(
      (a: any, b: any) =>
        new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime(),
    );

  if (closedShifts.length > 0) {
    const last = closedShifts[0] as ShiftRecord;
    return {
      openedAt: last.closedAt,
      lastClosedShift: last,
    };
  }

  // Fallback: Beginning of current day in restaurant timezone
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const dateStr = formatter.format(now); // YYYY-MM-DD
    const openedAt = new Date(`${dateStr}T00:00:00.000Z`).toISOString();
    return { openedAt, lastClosedShift: null };
  } catch {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return { openedAt: startOfToday.toISOString(), lastClosedShift: null };
  }
}

// 1. GET Current Open Shift Status & Expected Cash (PRO Plan Only)
router.get("/restaurants/:restaurantSlug/shifts/current", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff", "shift_close");
  if (!access) return;

  const timezone = (access.tenant.settings?.timezone as string) || "Asia/Kolkata";
  const currency = (access.tenant.settings?.currency as string) || "INR";

  const { openedAt, lastClosedShift } = await getOpenShiftOpenedAt(
    access.tenant.id,
    timezone,
  );

  const { expectedCash, cashOrdersCount, totalOrdersCount } =
    await calculateAuthoritativeExpectedCash(access.tenant.id, openedAt);

  let dateFormatted: string;
  try {
    dateFormatted = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: timezone,
    }).format(new Date());
  } catch {
    dateFormatted = new Date().toDateString();
  }

  res.json({
    status: "OPEN",
    restaurantId: access.tenant.id,
    restaurantName: (access.tenant.profile?.name as string) || "Tableline Restaurant",
    dateFormatted,
    timezone,
    currency,
    openedAt,
    expectedCash,
    cashOrdersCount,
    totalOrdersCount,
    lastClosedShift: lastClosedShift
      ? {
          shiftId: lastClosedShift.id || lastClosedShift.shiftId,
          closedAt: lastClosedShift.closedAt,
          closedBy: lastClosedShift.closedBy,
          expectedCash: lastClosedShift.expectedCash,
          countedCash: lastClosedShift.countedCash,
          difference: lastClosedShift.difference,
          discrepancyType: lastClosedShift.discrepancyType,
        }
      : null,
  });
});

// 2. POST Close Shift (Reconcile Physical Cash vs Authoritative Server Expected Cash)
router.post("/restaurants/:restaurantSlug/shifts/close", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff", "shift_close");
  if (!access) return;

  const { countedCash: rawCounted, notes } = req.body ?? {};

  if (rawCounted === undefined || rawCounted === null || isNaN(Number(rawCounted))) {
    errorResponse(res, 400, "Please enter the physical cash counted in drawer.", "COUNTED_CASH_REQUIRED");
    return;
  }

  const countedCash = Math.round(Number(rawCounted) * 100) / 100;
  if (countedCash < 0) {
    errorResponse(res, 400, "Physical cash cannot be a negative amount.", "INVALID_COUNTED_CASH");
    return;
  }

  const timezone = (access.tenant.settings?.timezone as string) || "Asia/Kolkata";
  const currency = (access.tenant.settings?.currency as string) || "INR";

  const { openedAt } = await getOpenShiftOpenedAt(access.tenant.id, timezone);

  // SERVER-AUTHORITATIVE: Never trust client-provided expectedCash!
  const { expectedCash, cashOrdersCount } = await calculateAuthoritativeExpectedCash(
    access.tenant.id,
    openedAt,
  );

  const difference = Math.round((countedCash - expectedCash) * 100) / 100;
  let discrepancyType: "MATCHED" | "SHORT" | "OVER" = "MATCHED";
  if (difference < 0) {
    discrepancyType = "SHORT";
  } else if (difference > 0) {
    discrepancyType = "OVER";
  }

  const shiftId = createId("shift");
  const closedAt = new Date().toISOString();

  const shiftRecord: ShiftRecord = {
    id: shiftId,
    shiftId,
    restaurantId: access.tenant.id,
    restaurantSlug: (access.tenant.profile?.slug as string) || req.params.restaurantSlug,
    openedAt,
    closedAt,
    closedBy: {
      uid: access.context.uid,
      name: access.context.name || "Staff Member",
      email: access.context.email || "staff@tableline.com",
      role: access.role,
    },
    expectedCash,
    countedCash,
    difference,
    discrepancyType,
    status: "CLOSED",
    cashOrdersCount,
    currency,
    notes: notes ? String(notes).slice(0, 500).trim() : null,
    createdAt: closedAt,
    updatedAt: closedAt,
  };

  const db = getDatabase();
  const cleaned = cleanForFirebase(shiftRecord);
  await db.ref(`restaurants/${access.tenant.id}/shifts/${shiftId}`).set(cleaned);

  // Record immutable audit log
  await createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email || "staff",
    actorRole: access.role,
    action: "SHIFT_CLOSED",
    resourceId: shiftId,
    details: {
      expectedCash,
      countedCash,
      difference,
      discrepancyType,
      cashOrdersCount,
      closedAt,
    },
  });

  // Realtime notification to owner/KDS
  orderEvents.emit(`shift_closed:${access.tenant.id}`, cleaned);

  res.status(201).json(cleaned);
});

// 3. GET Historical Shifts for this Restaurant (Owner / Staff view)
router.get("/restaurants/:restaurantSlug/shifts", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff", "shift_close");
  if (!access) return;

  const db = getDatabase();
  const shiftsSnap = await db.ref(`restaurants/${access.tenant.id}/shifts`).get();
  const rawShifts = (shiftsSnap.val() ?? {}) as Record<string, any>;

  const shifts = Object.values(rawShifts)
    .filter((s: any) => s && s.status === "CLOSED")
    .sort(
      (a: any, b: any) =>
        new Date(b.closedAt || 0).getTime() - new Date(a.closedAt || 0).getTime(),
    );

  res.json({
    restaurantId: access.tenant.id,
    count: shifts.length,
    shifts,
  });
});

// 4. GET Single Shift Detail
router.get("/restaurants/:restaurantSlug/shifts/:shiftId", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff", "shift_close");
  if (!access) return;

  const { shiftId } = req.params;
  const db = getDatabase();
  const shiftSnap = await db
    .ref(`restaurants/${access.tenant.id}/shifts/${shiftId}`)
    .get();

  if (!shiftSnap.exists()) {
    errorResponse(res, 404, "Shift record not found.", "SHIFT_NOT_FOUND");
    return;
  }

  res.json(shiftSnap.val());
});

// 5. IMMUTABILITY ENFORCEMENT: Editing or deleting closed shifts is strictly forbidden
router.all("/restaurants/:restaurantSlug/shifts/:shiftId", (req, res, next) => {
  if (req.method === "PUT" || req.method === "PATCH" || req.method === "DELETE") {
    errorResponse(
      res,
      403,
      "Closed shift records are immutable for financial audit compliance.",
      "SHIFT_IMMUTABLE",
    );
    return;
  }
  next();
});

export default router;
