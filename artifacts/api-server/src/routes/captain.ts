import { Router, type IRouter } from "express";
import crypto from "crypto";
import { getAdminAuth, getDatabase } from "../lib/firebase";
import { getTenantAccess, errorResponse } from "../lib/http";
import { createAuditLog } from "../lib/audit";
import { orderEvents } from "./orders.js";

const router: IRouter = Router();

function hashStaffPin(pin: string, salt: string): string {
  return crypto.scryptSync(pin, salt, 32).toString("hex");
}

// 1. Dedicated Captain Bootstrap: lightweight, scoped specifically for mobile floor ordering
router.get("/restaurants/:restaurantSlug/captain/bootstrap", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff", "captain_ordering");
  if (!access) return;

  const db = getDatabase();
  const tenantId = access.tenant.id;

  const [
    tablesSnap,
    categoriesSnap,
    itemsSnap,
    menuItemsSnap,
    sessionsSnap,
    ordersSnap,
  ] = await Promise.all([
    db.ref(`restaurants/${tenantId}/tables`).get(),
    db.ref(`restaurants/${tenantId}/categories`).get(),
    db.ref(`restaurants/${tenantId}/items`).get(),
    db.ref(`restaurants/${tenantId}/menuItems`).get(),
    db.ref(`restaurants/${tenantId}/tableSessions`).get(),
    db.ref(`restaurants/${tenantId}/orders`).get(),
  ]);

  const rawTables = (tablesSnap.val() ?? {}) as Record<string, any>;
  const rawCategories = (categoriesSnap.val() ?? {}) as Record<string, any>;
  const rawItems = {
    ...((itemsSnap.val() ?? {}) as Record<string, any>),
    ...((menuItemsSnap.val() ?? {}) as Record<string, any>),
  };
  const rawSessions = (sessionsSnap.val() ?? {}) as Record<string, any>;
  const rawOrders = (ordersSnap.val() ?? {}) as Record<string, any>;

  // Build active sessions lookup
  const activeSessionsByTable: Record<string, any> = {};
  for (const [sId, sess] of Object.entries(rawSessions)) {
    if (sess && sess.status === "ACTIVE" && sess.tableId) {
      activeSessionsByTable[sess.tableId] = { id: sId, ...sess };
    }
  }

  // Count active orders per table
  const activeOrdersCountByTable: Record<string, number> = {};
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartTime = todayStart.getTime();

  let todayOrdersCount = 0;
  const recentStaffOrders: any[] = [];

  for (const [orderId, o] of Object.entries(rawOrders)) {
    if (!o) continue;
    const orderCreatedAt = new Date(o.createdAt || 0).getTime();
    if (orderCreatedAt >= todayStartTime) {
      todayOrdersCount += 1;
    }

    // Recent orders taken by staff/captain
    if (o.orderSource === "STAFF" || o.source === "STAFF" || o.createdByStaff?.uid === access.context.uid) {
      recentStaffOrders.push({
        id: orderId,
        orderNumber: o.orderNumber,
        tableId: o.tableId,
        tableNumber: o.tableNumber,
        status: o.status,
        total: o.total,
        itemCount: Array.isArray(o.items) ? o.items.length : 0,
        itemsSummary: Array.isArray(o.items)
          ? o.items.map((i: any) => `${i.quantity}x ${i.name}`).join(", ")
          : "",
        createdAt: o.createdAt,
        createdByStaff: o.createdByStaff || null,
      });
    }
  }

  // Format tables strictly based on authoritative active sessions
  const tables = Object.entries(rawTables)
    .map(([id, t]) => {
      const activeSession = activeSessionsByTable[id] || (t.activeSessionId ? rawSessions[t.activeSessionId] : null);
      const isSessionActive = activeSession && activeSession.status === "ACTIVE";
      const isDeactivated = t.active === false || t.status === "DEACTIVATED";
      const currentActiveSessionId = isSessionActive ? activeSession.id : null;

      // Active orders MUST belong to the current active session
      let activeOrdersCount = 0;
      if (currentActiveSessionId) {
        for (const o of Object.values(rawOrders)) {
          if (
            o &&
            o.sessionId === currentActiveSessionId &&
            !["COMPLETED", "CANCELLED", "DECLINED"].includes(o.status)
          ) {
            activeOrdersCount += 1;
          }
        }
      }

      return {
        id,
        tableNumber: String(t.tableNumber ?? id),
        slug: t.slug || id,
        qrToken: t.qrToken || null,
        location: t.location || null,
        capacity: t.capacity || 4,
        status: isDeactivated ? "DEACTIVATED" : isSessionActive ? "OCCUPIED" : "AVAILABLE",
        active: !isDeactivated,
        activeSessionId: currentActiveSessionId,
        activeOrdersCount,
      };
    })
    .sort((a, b) => {
      const numA = parseInt(a.tableNumber.replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(b.tableNumber.replace(/\D/g, ""), 10) || 0;
      return numA - numB;
    });

  // Active tables count
  const activeTablesCount = tables.filter((t) => t.status === "OCCUPIED").length;

  // Format categories
  const categories = Object.entries(rawCategories)
    .filter(([, c]) => c && c.active !== false)
    .map(([id, c]) => ({
      id,
      name: c.name || "Category",
      sortOrder: c.sortOrder ?? 0,
    }))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  // Format menu items
  const items = Object.entries(rawItems)
    .filter(([, item]) => item && item.active !== false)
    .map(([id, item]) => ({
      id,
      categoryId: item.categoryId || "uncategorized",
      name: item.name || "Unnamed Item",
      description: item.description || "",
      price: Number(item.price || 0),
      veg: Boolean(item.veg || item.isVeg),
      isAvailable: item.available !== false && item.isAvailable !== false,
      variants: Array.isArray(item.variants) ? item.variants : [],
      addons: Array.isArray(item.addons) ? item.addons : [],
      imageUrl: item.imageUrl || item.image || null,
    }));

  const profile = access.tenant.profile as Record<string, any>;
  const settings = (access.tenant.settings ?? {}) as Record<string, any>;

  res.json({
    restaurant: {
      id: tenantId,
      name: profile.name || "Restaurant",
      slug: req.params.restaurantSlug,
      currency: profile.currency || settings.currency || "₹",
      taxRate: Number(settings.taxRate ?? 5),
      plan: access.tenant.plan || profile.plan || "starter",
    },
    staff: {
      uid: access.context.uid,
      name: access.context.name || "Floor Captain",
      email: access.context.email || "",
      role: access.role,
    },
    tables,
    categories,
    items,
    stats: {
      todayOrdersCount,
      activeTablesCount,
      totalTablesCount: tables.length,
    },
    recentOrders: recentStaffOrders.slice(0, 50),
  });
});

// 2. Server-Side QR Code Resolution: Matches physical table QR string to secure table
router.post("/restaurants/:restaurantSlug/captain/resolve-qr", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff", "captain_ordering");
  if (!access) return;

  const rawCode = String(req.body?.qrCode || "").trim();
  if (!rawCode) {
    errorResponse(res, 400, "Please provide a valid table QR code to scan.", "INVALID_QR");
    return;
  }

  const db = getDatabase();
  const tablesSnap = await db.ref(`restaurants/${access.tenant.id}/tables`).get();
  if (!tablesSnap.exists()) {
    errorResponse(res, 404, "No tables configured for this restaurant.", "NO_TABLES");
    return;
  }

  const rawTables = tablesSnap.val() as Record<string, any>;

  // Extract token or slug or digits from input
  // Could be full URL: https://tableline.app/menu/cafe-1/table/tok_xyz
  let extractedToken = rawCode;
  const tableUrlMatch = rawCode.match(/\/table\/([^/?#]+)/i);
  if (tableUrlMatch && tableUrlMatch[1]) {
    extractedToken = decodeURIComponent(tableUrlMatch[1]).trim();
  }

  const tokenLower = extractedToken.toLowerCase();
  const tokenDigits = tokenLower.replace(/[^0-9]/g, "").replace(/^0+/, "");
  const tokenNorm = tokenLower.replace(/[^a-z0-9]/g, "");

  let matchedTable: any = null;
  let matchedTableId = "";

  for (const [id, t] of Object.entries(rawTables)) {
    if (!t) continue;
    const tSlug = String(t.slug || "").toLowerCase();
    const tToken = String(t.qrToken || "").toLowerCase();
    const tNum = String(t.tableNumber || "").toLowerCase();
    const normTblNum = tNum.replace(/[^a-z0-9]/g, "");
    const normSlug = tSlug.replace(/[^a-z0-9]/g, "");
    const digitsTblNum = tNum.replace(/[^0-9]/g, "").replace(/^0+/, "");

    const isMatch =
      id.toLowerCase() === tokenLower ||
      tToken === tokenLower ||
      tSlug === tokenLower ||
      tNum === tokenLower ||
      (tokenNorm && (tokenNorm === normTblNum || tokenNorm === normSlug)) ||
      (tokenDigits && tokenDigits === digitsTblNum);

    if (isMatch) {
      matchedTable = t;
      matchedTableId = id;
      break;
    }
  }

  if (!matchedTable) {
    errorResponse(res, 404, "Table QR does not belong to this restaurant.", "TABLE_NOT_FOUND");
    return;
  }

  if (matchedTable.active === false || matchedTable.status === "DEACTIVATED") {
    errorResponse(res, 400, `Table ${matchedTable.tableNumber || matchedTableId} is currently deactivated.`, "TABLE_INACTIVE");
    return;
  }

  // Check active dining session
  let activeSession: any = null;
  if (matchedTable.activeSessionId) {
    const sSnap = await db.ref(`restaurants/${access.tenant.id}/tableSessions/${matchedTable.activeSessionId}`).get();
    if (sSnap.exists() && sSnap.val()?.status === "ACTIVE") {
      activeSession = sSnap.val();
    }
  }

  if (!activeSession) {
    const allSessionsSnap = await db.ref(`restaurants/${access.tenant.id}/tableSessions`).get();
    const sessions = (allSessionsSnap.val() ?? {}) as Record<string, any>;
    const found = Object.values(sessions).find(
      (s: any) => s && s.tableId === matchedTableId && s.status === "ACTIVE",
    );
    if (found) {
      activeSession = found;
    }
  }

  res.json({
    table: {
      id: matchedTableId,
      tableNumber: String(matchedTable.tableNumber ?? matchedTableId),
      slug: matchedTable.slug || matchedTableId,
      location: matchedTable.location || null,
      capacity: matchedTable.capacity || 4,
      status: activeSession ? "OCCUPIED" : "AVAILABLE",
      active: true,
      activeSessionId: activeSession ? activeSession.id : null,
    },
    session: activeSession,
  });
});

// 3. Table Session & Existing Orders: Allows viewing existing orders placed at this table
router.get("/restaurants/:restaurantSlug/captain/tables/:tableId/session", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff", "captain_ordering");
  if (!access) return;

  const { tableId } = req.params;
  const db = getDatabase();

  // Find table
  const tableSnap = await db.ref(`restaurants/${access.tenant.id}/tables/${tableId}`).get();
  let tableData = tableSnap.val();
  let actualTableId = tableId;

  if (!tableData) {
    const allTablesSnap = await db.ref(`restaurants/${access.tenant.id}/tables`).get();
    const allTables = (allTablesSnap.val() ?? {}) as Record<string, any>;
    for (const [id, t] of Object.entries(allTables)) {
      if (id === tableId || t.slug === tableId || String(t.tableNumber) === tableId) {
        tableData = t;
        actualTableId = id;
        break;
      }
    }
  }

  if (!tableData) {
    errorResponse(res, 404, "Table not found.", "TABLE_NOT_FOUND");
    return;
  }

  // Active Session Resolution: tableId + status === "ACTIVE"
  let activeSessionId = tableData.activeSessionId;
  let activeSession: any = null;

  if (activeSessionId) {
    const sessSnap = await db.ref(`restaurants/${access.tenant.id}/tableSessions/${activeSessionId}`).get();
    if (sessSnap.exists() && sessSnap.val()?.status === "ACTIVE") {
      activeSession = sessSnap.val();
    } else {
      activeSessionId = null;
    }
  }

  if (!activeSessionId) {
    const allSessionsSnap = await db.ref(`restaurants/${access.tenant.id}/tableSessions`).get();
    const sessions = (allSessionsSnap.val() ?? {}) as Record<string, any>;
    const found = Object.values(sessions).find(
      (s: any) => s && s.tableId === actualTableId && s.status === "ACTIVE",
    );
    if (found) {
      activeSessionId = found.id;
      activeSession = found;
    }
  }

  const isTableDeactivated = tableData.active === false || tableData.status === "DEACTIVATED";

  // If there is NO active session on this table, return AVAILABLE state with ₹0 and no orders
  if (!activeSessionId || !activeSession || activeSession.status !== "ACTIVE") {
    // Clean up stale table reference if it existed
    if (tableData.activeSessionId) {
      await db.ref(`restaurants/${access.tenant.id}/tables/${actualTableId}/activeSessionId`).set(null);
      if (!isTableDeactivated) {
        await db.ref(`restaurants/${access.tenant.id}/tables/${actualTableId}/status`).set("AVAILABLE");
      }
    }

    res.json({
      table: {
        id: actualTableId,
        tableNumber: String(tableData.tableNumber ?? actualTableId),
        location: tableData.location || null,
        status: isTableDeactivated ? "DEACTIVATED" : "AVAILABLE",
        active: !isTableDeactivated,
        activeSessionId: null,
      },
      session: null,
      existingOrders: [],
      sessionTotal: 0,
    });
    return;
  }

  // Active session exists: fetch orders belonging STRICTLY to this active session
  const ordersSnap = await db.ref(`restaurants/${access.tenant.id}/orders`).get();
  const allOrders = (ordersSnap.val() ?? {}) as Record<string, any>;

  const existingOrders: any[] = [];
  let sessionTotal = 0;

  for (const [ordId, ord] of Object.entries(allOrders)) {
    if (!ord) continue;
    // CRITICAL FIX: Only match orders belonging to the current active session
    if (ord.sessionId === activeSessionId && !["CANCELLED", "DECLINED"].includes(ord.status)) {
      existingOrders.push({
        id: ordId,
        orderNumber: ord.orderNumber,
        status: ord.status,
        total: ord.total || 0,
        subtotal: ord.subtotal || 0,
        itemsCount: Array.isArray(ord.items) ? ord.items.length : 0,
        items: ord.items || [],
        createdAt: ord.createdAt,
        source: ord.source || ord.orderSource || "QR",
      });
      sessionTotal += Number(ord.total || 0);
    }
  }

  existingOrders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  res.json({
    table: {
      id: actualTableId,
      tableNumber: String(tableData.tableNumber ?? actualTableId),
      location: tableData.location || null,
      status: "OCCUPIED",
      active: !isTableDeactivated,
      activeSessionId,
    },
    session: activeSession,
    existingOrders,
    sessionTotal: Math.round(sessionTotal * 100) / 100,
  });
});

// 4. Staff Roster for Shared Devices: returns active floor staff for this restaurant
router.get("/restaurants/:restaurantSlug/captain/staff-roster", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff", "captain_ordering");
  if (!access) return;

  const db = getDatabase();
  const membersSnap = await db.ref(`restaurants/${access.tenant.id}/members`).get();
  const members = (membersSnap.val() ?? {}) as Record<string, any>;
  const pinsSnap = await db.ref(`restaurants/${access.tenant.id}/staffPins`).get();
  const pins = (pinsSnap.val() ?? {}) as Record<string, any>;

  const auth = getAdminAuth();
  const roster: any[] = [];

  for (const [uid, member] of Object.entries(members)) {
    if (!member) continue;
    const role = member.role || "staff";
    const status = member.status || "active";
    const isExcluded = status === "suspended" || status === "deactivated" || member.active === false;
    if (isExcluded) continue;

    // Fetch name & email
    let name = member.name || null;
    let email = member.email || "";

    if (!name) {
      const uSnap = await db.ref(`users/${uid}`).get();
      const uVal = uSnap.val();
      name = uVal?.name || null;
      email = uVal?.email || email;
    }

    if (!name && !email) {
      try {
        const authUser = await auth.getUser(uid);
        name = authUser.displayName || null;
        email = authUser.email || "";
      } catch {}
    }

    roster.push({
      uid,
      name: name || email.split("@")[0] || "Staff Member",
      email,
      role,
      hasPin: Boolean(pins[uid]?.hash),
      isCurrent: uid === access.context.uid,
    });
  }

  // Include the restaurant owner if not already listed
  const ownerId = access.tenant.profile.ownerId || access.tenant.profile.userId;
  if (ownerId && !roster.some((r) => r.uid === ownerId)) {
    try {
      const ownerUser = await auth.getUser(String(ownerId));
      roster.unshift({
        uid: String(ownerId),
        name: ownerUser.displayName || "Owner",
        email: ownerUser.email || "",
        role: "owner",
        hasPin: Boolean(pins[String(ownerId)]?.hash),
        isCurrent: String(ownerId) === access.context.uid,
      });
    } catch {}
  }

  res.json({ roster });
});

// 5. Secure Staff Switch with PIN verification & rate limiting
router.post("/restaurants/:restaurantSlug/captain/switch-staff", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff", "captain_ordering");
  if (!access) return;

  const { targetUid, pin } = req.body || {};
  if (!targetUid || typeof targetUid !== "string") {
    errorResponse(res, 400, "Please select a staff member to switch to.", "MISSING_TARGET_STAFF");
    return;
  }

  const cleanPin = String(pin || "").trim();
  const db = getDatabase();
  const tenantId = access.tenant.id;

  // Verify target is an active member in THIS restaurant
  const memberSnap = await db.ref(`restaurants/${tenantId}/members/${targetUid}`).get();
  let memberData = memberSnap.val();

  // If not in members, check if owner
  const isOwner = (access.tenant.profile.ownerId === targetUid || access.tenant.profile.userId === targetUid);
  if (!memberData && !isOwner) {
    errorResponse(res, 404, "Selected staff member is not part of this restaurant.", "STAFF_NOT_FOUND");
    return;
  }

  if (memberData && (memberData.status === "suspended" || memberData.status === "deactivated" || memberData.active === false)) {
    errorResponse(res, 403, "This staff account is currently suspended.", "ACCOUNT_SUSPENDED");
    return;
  }

  const targetRole = isOwner ? "owner" : (memberData?.role || "staff");

  // Rate Limiting on PIN verification (max 5 failed attempts in 15 minutes)
  const attemptRef = db.ref(`restaurants/${tenantId}/staffPinAttempts/${targetUid}`);
  const attemptSnap = await attemptRef.get();
  const attemptData = (attemptSnap.val() ?? {}) as { count?: number; lockedUntil?: number };

  const now = Date.now();
  if (attemptData.lockedUntil && attemptData.lockedUntil > now) {
    const remainingMins = Math.ceil((attemptData.lockedUntil - now) / 60000);
    errorResponse(
      res,
      429,
      `Too many failed PIN attempts. Account locked for ${remainingMins} minute(s).`,
      "PIN_LOCKED",
    );
    return;
  }

  // Check PIN
  const pinSnap = await db.ref(`restaurants/${tenantId}/staffPins/${targetUid}`).get();
  const pinRecord = pinSnap.val() as { hash?: string; salt?: string } | null;

  if (pinRecord?.hash && pinRecord?.salt) {
    if (!cleanPin) {
      errorResponse(res, 400, "PIN is required for this staff member.", "PIN_REQUIRED");
      return;
    }
    const computedHash = hashStaffPin(cleanPin, pinRecord.salt);
    if (computedHash !== pinRecord.hash) {
      const nextCount = (attemptData.count || 0) + 1;
      const willLock = nextCount >= 5;
      await attemptRef.set({
        count: nextCount,
        lockedUntil: willLock ? now + 15 * 60 * 1000 : null,
        lastAttempt: now,
      });

      if (willLock) {
        errorResponse(
          res,
          429,
          "Too many failed PIN attempts. Account locked for 15 minutes.",
          "PIN_LOCKED",
        );
        return;
      }

      errorResponse(
        res,
        401,
        `Incorrect PIN. ${5 - nextCount} attempt(s) remaining.`,
        "INVALID_PIN",
      );
      return;
    }
  } else {
    // If no PIN set yet, set the provided PIN (must be 4-6 digits)
    if (!/^\d{4,6}$/.test(cleanPin)) {
      errorResponse(res, 400, "Please set a 4 to 6 digit quick switch PIN to continue.", "INVALID_PIN_FORMAT");
      return;
    }
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = hashStaffPin(cleanPin, salt);
    await db.ref(`restaurants/${tenantId}/staffPins/${targetUid}`).set({
      hash,
      salt,
      setAt: now,
      setBy: access.context.uid,
    });
  }

  // Clear failed attempt counter on success
  await attemptRef.remove();

  // Mint Firebase Custom Token for authenticating target staff member
  const auth = getAdminAuth();
  let targetUser: any = null;
  try {
    targetUser = await auth.getUser(targetUid);
  } catch {
    targetUser = { uid: targetUid, displayName: memberData?.name || "Staff", email: memberData?.email };
  }

  const customToken = await auth.createCustomToken(targetUid, {
    restaurantId: tenantId,
    role: targetRole,
  });

  createAuditLog(tenantId, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "staff",
    actorRole: access.context.platformAdmin ? "platform_admin" : access.role,
    action: "STAFF_SWITCHED",
    resourceId: targetUid,
    details: {
      fromStaff: access.context.uid,
      toStaff: targetUid,
      toStaffName: targetUser.displayName || memberData?.name || "Staff",
    },
  });

  res.json({
    success: true,
    customToken,
    user: {
      uid: targetUid,
      name: targetUser.displayName || memberData?.name || "Staff Member",
      email: targetUser.email || memberData?.email || "",
      role: targetRole,
    },
  });
});

// 6. Set or update staff PIN
router.post("/restaurants/:restaurantSlug/captain/set-pin", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff", "captain_ordering");
  if (!access) return;

  const { pin, currentPin, targetUid } = req.body || {};
  const targetId = targetUid && (access.role === "owner" || access.role === "manager")
    ? targetUid
    : access.context.uid;

  const cleanPin = String(pin || "").trim();
  if (!/^\d{4,6}$/.test(cleanPin)) {
    errorResponse(res, 400, "PIN must be exactly 4 to 6 numeric digits.", "INVALID_PIN_FORMAT");
    return;
  }

  const db = getDatabase();
  const tenantId = access.tenant.id;
  const pinRef = db.ref(`restaurants/${tenantId}/staffPins/${targetId}`);
  const existingSnap = await pinRef.get();

  // If changing existing PIN for oneself, require current PIN
  if (existingSnap.exists() && targetId === access.context.uid && !access.context.platformAdmin) {
    const existing = existingSnap.val();
    if (existing.hash && existing.salt) {
      if (!currentPin) {
        errorResponse(res, 400, "Current PIN is required to set a new PIN.", "CURRENT_PIN_REQUIRED");
        return;
      }
      const testHash = hashStaffPin(String(currentPin).trim(), existing.salt);
      if (testHash !== existing.hash) {
        errorResponse(res, 401, "Current PIN is incorrect.", "INVALID_CURRENT_PIN");
        return;
      }
    }
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashStaffPin(cleanPin, salt);
  const now = Date.now();

  await pinRef.set({
    hash,
    salt,
    updatedAt: now,
    updatedBy: access.context.uid,
  });

  // Clear any lockouts
  await db.ref(`restaurants/${tenantId}/staffPinAttempts/${targetId}`).remove();

  createAuditLog(tenantId, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "staff",
    actorRole: access.context.platformAdmin ? "platform_admin" : access.role,
    action: "STAFF_PIN_UPDATED",
    resourceId: targetId,
    details: { targetStaff: targetId },
  });

  res.json({
    success: true,
    message: "4-digit quick switch PIN updated successfully.",
  });
});

// 7. Captain Settle Bill & Free Table
router.post("/restaurants/:restaurantSlug/captain/tables/:tableId/settle-bill", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff", "captain_ordering");
  if (!access) return;

  const db = getDatabase();
  const tenantId = access.tenant.id;
  const tableRef = db.ref(`restaurants/${tenantId}/tables/${req.params.tableId}`);
  const tableSnap = await tableRef.get();
  if (!tableSnap.exists()) {
    errorResponse(res, 404, "Table not found.", "TABLE_NOT_FOUND");
    return;
  }
  const tableData = tableSnap.val() as Record<string, any>;
  const now = Date.now();
  let activeSessionId = tableData.activeSessionId;

  if (!activeSessionId) {
    const allSessionsSnap = await db.ref(`restaurants/${tenantId}/tableSessions`).get();
    if (allSessionsSnap.exists()) {
      const allSessions = allSessionsSnap.val() as Record<string, any>;
      const match = Object.values(allSessions).find((s: any) => s && s.tableId === req.params.tableId && s.status === "ACTIVE");
      if (match) activeSessionId = match.id;
    }
  }

  const paymentMethod = String(req.body?.paymentMethod || "CASH").toUpperCase();
  const updates: Record<string, any> = {};

  const ordersSnap = await db.ref(`restaurants/${tenantId}/orders`).get();
  const allOrders = (ordersSnap.val() ?? {}) as Record<string, any>;

  let sessionTotal = 0;
  const updatedOrderIds: string[] = [];
  const sessionOrders: any[] = [];

  for (const [ordId, ord] of Object.entries(allOrders)) {
    if (!ord) continue;
    const matchSession = activeSessionId ? ord.sessionId === activeSessionId : false;

    if (matchSession) {
      sessionOrders.push(ord);
      if (ord.status !== "CANCELLED" && ord.status !== "DECLINED") {
        const ordSub = Number(ord.subtotal) || 0;
        const ordTot = Number(ord.total) || ordSub;
        sessionTotal += ordTot;
        updatedOrderIds.push(ordId);

        updates[`restaurants/${tenantId}/orders/${ordId}/paymentStatus`] = "PAID";
        updates[`restaurants/${tenantId}/orders/${ordId}/paymentMethod`] = paymentMethod;
        updates[`restaurants/${tenantId}/orders/${ordId}/paidAt`] = now;
        updates[`restaurants/${tenantId}/orders/${ordId}/updatedAt`] = now;
      }
    }
  }

  sessionTotal = Math.round(sessionTotal * 100) / 100;

  if (activeSessionId) {
    updates[`restaurants/${tenantId}/tableSessions/${activeSessionId}/status`] = "CLOSED";
    updates[`restaurants/${tenantId}/tableSessions/${activeSessionId}/paymentStatus`] = "PAID";
    updates[`restaurants/${tenantId}/tableSessions/${activeSessionId}/paymentMethod`] = paymentMethod;
    updates[`restaurants/${tenantId}/tableSessions/${activeSessionId}/totalAmount`] = sessionTotal;
    updates[`restaurants/${tenantId}/tableSessions/${activeSessionId}/ordersCount`] = sessionOrders.length;
    updates[`restaurants/${tenantId}/tableSessions/${activeSessionId}/closedAt`] = now;
    updates[`restaurants/${tenantId}/tableSessions/${activeSessionId}/closedBy`] = access.context.email || "captain";
    updates[`restaurants/${tenantId}/tableSessions/${activeSessionId}/updatedAt`] = now;
  }

  updates[`restaurants/${tenantId}/tables/${req.params.tableId}/activeSessionId`] = null;
  updates[`restaurants/${tenantId}/tables/${req.params.tableId}/status`] = tableData.active === false ? "DEACTIVATED" : "AVAILABLE";
  updates[`restaurants/${tenantId}/tables/${req.params.tableId}/updatedAt`] = now;

  // Automatically resolve all pending waiter requests (including bill calls) for this table
  const wreqSnap = await db.ref(`restaurants/${tenantId}/waiterRequests`).get();
  if (wreqSnap.exists()) {
    const wreqs = (wreqSnap.val() ?? {}) as Record<string, any>;
    for (const [wId, w] of Object.entries(wreqs)) {
      if (
        w &&
        w.status === "PENDING" &&
        (w.tableId === req.params.tableId ||
          String(w.tableNumber) === String(tableData.tableNumber) ||
          (activeSessionId && w.sessionId === activeSessionId))
      ) {
        updates[`restaurants/${tenantId}/waiterRequests/${wId}/status`] = "RESOLVED";
        updates[`restaurants/${tenantId}/waiterRequests/${wId}/resolvedAt`] = now;
        updates[`restaurants/${tenantId}/waiterRequests/${wId}/resolvedBy`] = access.context.email || "captain";
      }
    }
  }

  await db.ref().update(updates);

  orderEvents.emit(`session_closed:${tenantId}`, {
    tableId: req.params.tableId,
    sessionId: activeSessionId,
    tableNumber: tableData.tableNumber,
    totalAmount: sessionTotal,
    paymentMethod,
  });
  if (activeSessionId) {
    orderEvents.emit(`session_closed:${activeSessionId}`, {
      status: "CLOSED",
      paymentStatus: "PAID",
      tableId: req.params.tableId,
      tableNumber: tableData.tableNumber,
      totalAmount: sessionTotal,
      paymentMethod,
    });
    orderEvents.emit(`session_updated:${activeSessionId}`, {
      status: "CLOSED",
      paymentStatus: "PAID",
      tableId: req.params.tableId,
      tableNumber: tableData.tableNumber,
      totalAmount: sessionTotal,
      paymentMethod,
    });
  }
  orderEvents.emit(`table_updated:${tenantId}`, {
    tableId: req.params.tableId,
    status: "AVAILABLE",
    activeSessionId: null,
  });
  for (const ordId of updatedOrderIds) {
    orderEvents.emit(`order_status:${ordId}`, {
      id: ordId,
      paymentStatus: "PAID",
      paymentMethod,
      updatedAt: now,
    });
  }

  createAuditLog(tenantId, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "staff",
    actorRole: access.context.platformAdmin ? "platform_admin" : access.role,
    action: "CAPTAIN_TABLE_BILL_SETTLED",
    resourceId: req.params.tableId,
    details: {
      tableNumber: tableData.tableNumber,
      closedSessionId: activeSessionId || null,
      totalAmount: sessionTotal,
      ordersSettled: updatedOrderIds.length,
      paymentMethod,
    },
  });

  res.json({
    success: true,
    message: `Table ${tableData.tableNumber} bill settled (${paymentMethod}) successfully. Table is now available.`,
    tableId: req.params.tableId,
    status: "AVAILABLE",
    settledAmount: sessionTotal,
    ordersSettledCount: updatedOrderIds.length,
    paymentMethod,
  });
});

export default router;
