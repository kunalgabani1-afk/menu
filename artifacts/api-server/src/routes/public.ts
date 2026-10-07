import { Router, type IRouter } from "express";
import { resolveTenant } from "../lib/tenant";
import { createId, getDatabase } from "../lib/firebase";
import { errorResponse } from "../lib/http";
import { canUseFeature, getPlanEntitlements, normalizePlanId, PLAN_DEFINITIONS, PUBLIC_PLANS } from "../lib/plans";
import { generateTableSessionToken, orderEvents } from "./orders.js";
import { resolveTableBySlugOrToken } from "../lib/tableResolver.js";

const router: IRouter = Router();

router.get("/public/plans", async (req, res) => {
  try {
    const db = getDatabase();
    const snap = await db.ref("platform/plans").get();
    if (snap.exists() && Object.keys(snap.val()).length > 0) {
      const val = snap.val();
      const rawPlans: any[] = Array.isArray(val) ? val : Object.values(val);
      // Filter out duplicate or legacy entries like "scale" so only unique starter, growth, pro appear
      const seenIds = new Set<string>();
      const formatted: any[] = [];
      for (const p of rawPlans) {
        const normId = p.id === "scale" ? "pro" : p.id;
        if (normId && !seenIds.has(normId) && (normId === "starter" || normId === "growth" || normId === "pro")) {
          seenIds.add(normId);
          const fallback = PLAN_DEFINITIONS[normId as keyof typeof PLAN_DEFINITIONS] || PLAN_DEFINITIONS.starter;
          formatted.push({
            id: normId,
            name: fallback.name,
            tagline: p.tagline || fallback.tagline || "",
            setupFee: Number(fallback.setupFee),
            monthlyFee: Number(fallback.monthlyFee),
            currency: fallback.currency || "INR",
            highlight: normId === "growth",
            features: fallback.features,
            entitlements: fallback.entitlements,
          });
        }
      }
      if (formatted.length >= 3) {
        res.json(formatted);
        return;
      }
    }
    res.json(PUBLIC_PLANS);
  } catch {
    res.json(PUBLIC_PLANS);
  }
});

router.get("/public/menu/:restaurantSlug/table/:tableSlug", async (req, res) => {
  const { restaurantSlug, tableSlug } = req.params;
  const tenant = await resolveTenant(restaurantSlug);
  if (!tenant) {
    errorResponse(res, 404, "Restaurant not found.", "RESTAURANT_NOT_FOUND");
    return;
  }

  const tenantSettings = (tenant.settings ?? {}) as Record<string, any>;
  const status = String(tenantSettings.restaurantStatus ?? tenant.status ?? "active");
  const isDeletionPending =
    status === "DELETION_PENDING" ||
    tenant.status === "DELETION_PENDING" ||
    tenantSettings.accountStatus === "DELETION_PENDING" ||
    (tenant.profile as any)?.accountStatus === "DELETION_PENDING" ||
    Boolean(tenant.deletionScheduledFor);
  if (isDeletionPending) {
    errorResponse(
      res,
      403,
      "Restaurant scheduled for permanent deletion. This restaurant has been locked and will be permanently removed after the 24-hour safety period.",
      "DELETION_PENDING",
    );
    return;
  }
  const isDeactivated =
    status === "inactive" ||
    status === "suspended" ||
    status === "deactivated" ||
    tenantSettings.accountStatus === "DEACTIVATED" ||
    (tenant.profile as any)?.accountStatus === "DEACTIVATED" ||
    tenant.active === false;
  if (isDeactivated) {
    errorResponse(res, 403, "This restaurant is temporarily unavailable.", "RESTAURANT_UNAVAILABLE");
    return;
  }

  const db = getDatabase();
  const [tablesSnap, categoriesSnap, itemsSnap, menuItemsSnap, modifierGroupsSnap] = await Promise.all([
    db.ref(`restaurants/${tenant.id}/tables`).get(),
    db.ref(`restaurants/${tenant.id}/categories`).get(),
    db.ref(`restaurants/${tenant.id}/items`).get(),
    db.ref(`restaurants/${tenant.id}/menuItems`).get(),
    db.ref(`restaurants/${tenant.id}/modifierGroups`).get(),
  ]);

  const rawTables = (tablesSnap.val() ?? {}) as Record<string, any>;
  const rawCategories = (categoriesSnap.val() ?? {}) as Record<string, any>;
  const rawModifierGroups = (modifierGroupsSnap.val() ?? {}) as Record<string, any>;
  const rawItems = {
    ...((itemsSnap.val() ?? {}) as Record<string, any>),
    ...((menuItemsSnap.val() ?? {}) as Record<string, any>),
  };

  const resolvedTable = resolveTableBySlugOrToken(rawTables, tableSlug);
  if (!resolvedTable) {
    errorResponse(res, 404, "Table not found.", "TABLE_NOT_FOUND");
    return;
  }

  const matchedTableId = resolvedTable.id;
  const matchedTable = resolvedTable.table;

  if (matchedTable.active === false) {
    errorResponse(res, 410, "This table is currently not accepting orders.", "TABLE_INACTIVE");
    return;
  }

  // Authoritative Active Dining Session resolution
  let activeSessionId = matchedTable.activeSessionId || null;
  let activeSession: any = null;
  if (activeSessionId) {
    const sessSnap = await db.ref(`restaurants/${tenant.id}/tableSessions/${activeSessionId}`).get();
    if (sessSnap.exists()) {
      const val = sessSnap.val();
      if (val && val.status === "ACTIVE" && val.tableId === matchedTableId) {
        activeSession = val;
      }
    }
  }
  if (!activeSession) {
    const allSessSnap = await db.ref(`restaurants/${tenant.id}/tableSessions`).get();
    if (allSessSnap.exists()) {
      const allSess = allSessSnap.val() as Record<string, any>;
      const found = Object.values(allSess).find(
        (s: any) => s && s.tableId === matchedTableId && s.status === "ACTIVE"
      );
      if (found) {
        activeSession = found;
        activeSessionId = found.id;
      }
    }
  }

  if (!activeSession) {
    const newSessionId = createId("sess");
    const now = Date.now();
    activeSession = {
      id: newSessionId,
      restaurantId: tenant.id,
      tableId: matchedTableId,
      tableNumber: String(matchedTable.tableNumber ?? matchedTableId),
      location: matchedTable.location || null,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };
    activeSessionId = newSessionId;
    await Promise.all([
      db.ref(`restaurants/${tenant.id}/tableSessions/${newSessionId}`).set(activeSession),
      db.ref(`restaurants/${tenant.id}/tables/${matchedTableId}`).update({
        activeSessionId: newSessionId,
        status: "OCCUPIED",
        updatedAt: now,
      }),
    ]);
  }

  const sessionToken = activeSession
    ? generateTableSessionToken(tenant.id, matchedTableId, matchedTable.slug || matchedTableId, activeSessionId)
    : null;

  const categories = Object.entries(rawCategories)
    .filter(([, cat]) => cat.active !== false)
    .map(([id, cat]) => ({
      id,
      name: cat.name || "",
      description: cat.description || "",
      sortOrder: cat.sortOrder ?? cat.displayOrder ?? 0,
      modifierGroupIds: Array.isArray(cat.modifierGroupIds) ? cat.modifierGroupIds : [],
      translations: typeof cat.translations === "object" && cat.translations !== null ? cat.translations : {},
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const profile = (tenant.profile ?? {}) as Record<string, any>;
  const settings = (tenant.settings ?? {}) as Record<string, any>;
  const currentPlan = normalizePlanId(profile.plan);
  const waiterCallsEnabled = canUseFeature(currentPlan, "service_calls");
  const orderingEnabled = canUseFeature(currentPlan, "table_ordering");
  const dinerReviewsEnabled = canUseFeature(currentPlan, "diner_reviews");

  // If diner_reviews is enabled, fetch dishReviews to compute ratings
  let reviewsMap: Record<string, any> = {};
  if (dinerReviewsEnabled) {
    try {
      const revSnap = await db.ref(`restaurants/${tenant.id}/dishReviews`).get();
      reviewsMap = (revSnap.val() ?? {}) as Record<string, any>;
    } catch {
      reviewsMap = {};
    }
  }

  // Precompute ratings per menuItemId
  const ratingAggregates: Record<string, { sum: number; count: number }> = {};
  for (const r of Object.values(reviewsMap)) {
    if (!r || r.hidden === true) continue;
    const mId = String(r.menuItemId || "");
    const ratingVal = Number(r.rating);
    if (!mId || isNaN(ratingVal) || ratingVal < 1 || ratingVal > 5) continue;
    if (!ratingAggregates[mId]) {
      ratingAggregates[mId] = { sum: 0, count: 0 };
    }
    ratingAggregates[mId].sum += ratingVal;
    ratingAggregates[mId].count += 1;
  }

  const items = Object.entries(rawItems)
    .filter(([, item]) => item.availabilityType !== "HIDDEN")
    .map(([id, item]) => {
      const isAvailable =
        item.available !== false &&
        item.isAvailable !== false &&
        item.availabilityType !== "OUT_OF_STOCK";

      const badge =
        typeof item.badge === "string" && item.badge
          ? item.badge
          : item.isBestseller
          ? "bestseller"
          : item.isChefsPick
          ? "chefs_pick"
          : null;

      const agg = dinerReviewsEnabled ? ratingAggregates[id] : null;
      const reviewCount = agg?.count || 0;
      const rating = reviewCount > 0 ? Math.round((agg!.sum / reviewCount) * 10) / 10 : null;

      return {
        id,
        categoryId: item.categoryId || "",
        name: item.name || "",
        description: item.description || "",
        price: Number(item.price) || 0,
        imageUrl: item.imageUrl || null,
        veg: item.veg !== false,
        isJain: item.isJain === true,
        available: isAvailable,
        badge,
        isBestseller: badge === "bestseller" || item.isBestseller === true,
        isChefsPick: badge === "chefs_pick" || item.isChefsPick === true,
        isCombo: item.isCombo === true,
        comboIncludes: item.comboIncludes || null,
        recommendedItemIds: Array.isArray(item.recommendedItemIds) ? item.recommendedItemIds : [],
        rating,
        reviewCount,
        variants: Array.isArray(item.variants) ? item.variants : [],
        modifierGroupIds: Array.isArray(item.modifierGroupIds) ? item.modifierGroupIds : [],
        disabledModifierGroupIds: Array.isArray(item.disabledModifierGroupIds) ? item.disabledModifierGroupIds : [],
        translations: typeof item.translations === "object" && item.translations !== null ? item.translations : {},
      };
    });

  let sessionOrdersCount = 0;
  let sessionTotal = 0;
  let sessionPaymentStatus = "UNPAID";
  if (activeSessionId) {
    try {
      const ordersSnap = await db.ref(`restaurants/${tenant.id}/orders`).get();
      if (ordersSnap.exists()) {
        const ordersVal = ordersSnap.val() as Record<string, any>;
        const sessionOrds = Object.values(ordersVal).filter(
          (o: any) => o && o.sessionId === activeSessionId && o.status !== "CANCELLED" && o.status !== "DECLINED"
        );
        sessionOrdersCount = sessionOrds.length;
        sessionTotal = Math.round(sessionOrds.reduce((sum: number, o: any) => sum + (Number(o.total) || 0), 0) * 100) / 100;
        if (sessionOrds.length > 0 && sessionOrds.every((o: any) => o.paymentStatus === "PAID" || o.paymentStatus === "CASH_PAID")) {
          sessionPaymentStatus = "PAID";
        }
      }
    } catch {}
  }

  const modifierGroups = Object.entries(rawModifierGroups).map(([id, mg]) => {
    const minSelections = Number(mg.minSelections ?? (mg.required ? 1 : 0));
    const maxSelections = Math.max(1, Number(mg.maxSelections ?? 1));
    const selectionType = String(mg.selectionType || (maxSelections > 1 ? "multiple" : "single"));

    return {
      id,
      name: String(mg.name || ""),
      description: String(mg.description || ""),
      selectionType,
      required: mg.required === true || minSelections > 0,
      minSelections,
      maxSelections,
      options: Array.isArray(mg.options)
        ? mg.options.map((opt: any, idx: number) => {
            const priceAdj = Math.max(0, Number(opt.priceAdjustment !== undefined ? opt.priceAdjustment : (opt.price || 0)));
            return {
              id: String(opt.id || `opt_${idx}`),
              name: String(opt.name || ""),
              priceAdjustment: priceAdj,
              price: priceAdj,
              available: opt.available !== false,
              isDefault: Boolean(opt.isDefault),
            };
          }).filter((opt: any) => opt.name)
        : [],
    };
  });

  res.json({
    restaurant: {
      name: profile.name || "Restaurant",
      slug: profile.slug || restaurantSlug,
      logoUrl: profile.logoUrl || null,
      city: profile.city || "",
      currency: settings.currency || profile.currency || "₹",
    },
    features: {
      waiterCalls: waiterCallsEnabled,
      ordering: orderingEnabled,
      digitalMenu: true,
      dinerReviews: dinerReviewsEnabled,
    },
    entitlements: getPlanEntitlements(currentPlan),
    settings: {
      requireCashPhoneVerification: settings.requireCashPhoneVerification === true,
      maxCashOrderWithoutPhone: Number(settings.maxCashOrderWithoutPhone ?? 2000),
    },
    table: {
      id: matchedTableId,
      tableNumber: String(matchedTable.tableNumber || ""),
      location: matchedTable.location ? String(matchedTable.location) : null,
      slug: matchedTable.slug || matchedTableId,
      active: matchedTable.active !== false,
      status: matchedTable.active === false ? "DEACTIVATED" : (activeSession ? "OCCUPIED" : "AVAILABLE"),
    },
    session: activeSession && sessionToken ? {
      id: activeSession.id,
      token: sessionToken.token,
      expiresAt: sessionToken.expiresAt,
      status: activeSession.status,
      ordersCount: sessionOrdersCount,
      sessionTotal,
      paymentStatus: sessionPaymentStatus,
    } : null,
    categories,
    items,
    modifierGroups,
  });
});

// Customer Public Dish Reviews
router.get("/public/menu/:restaurantSlug/items/:itemId/reviews", async (req, res) => {
  const { restaurantSlug, itemId } = req.params;
  const tenant = await resolveTenant(restaurantSlug);
  if (!tenant) {
    errorResponse(res, 404, "Restaurant not found.", "RESTAURANT_NOT_FOUND");
    return;
  }

  const currentPlan = normalizePlanId((tenant.profile as any)?.plan);
  const dinerReviewsEnabled = canUseFeature(currentPlan, "diner_reviews");
  if (!dinerReviewsEnabled) {
    errorResponse(res, 403, "Reviews are not available for this restaurant.", "FEATURE_LOCKED");
    return;
  }

  const db = getDatabase();
  try {
    const revSnap = await db.ref(`restaurants/${tenant.id}/dishReviews`).get();
    const reviewsMap = (revSnap.val() ?? {}) as Record<string, any>;

    const dishReviews = Object.values(reviewsMap)
      .filter((r) => r && r.menuItemId === itemId && r.hidden !== true)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .map((r) => ({
        id: r.id,
        rating: Number(r.rating) || 5,
        comment: r.comment ? String(r.comment).trim() : null,
        createdAt: r.createdAt,
        verified: true,
        author: "Verified Diner",
      }));

    const total = dishReviews.length;
    const sum = dishReviews.reduce((acc, r) => acc + r.rating, 0);
    const averageRating = total > 0 ? Math.round((sum / total) * 10) / 10 : null;

    res.json({
      menuItemId: itemId,
      rating: averageRating,
      reviewCount: total,
      reviews: dishReviews,
    });
  } catch (err: any) {
    res.json({
      menuItemId: itemId,
      rating: null,
      reviewCount: 0,
      reviews: [],
    });
  }
});

// 3. Customer Live Table Session & Full Bill Tracking
router.get("/public/menu/:restaurantSlug/table/:tableSlug/session", async (req, res) => {
  const { restaurantSlug, tableSlug } = req.params;
  const token = (req.query.token as string) || (req.headers["x-table-session-token"] as string) || "";
  const requestedSessionId = (req.query.sessionId as string) || "";

  const tenant = await resolveTenant(restaurantSlug);
  if (!tenant) {
    errorResponse(res, 404, "Restaurant not found.", "RESTAURANT_NOT_FOUND");
    return;
  }

  const db = getDatabase();
  const tablesSnap = await db.ref(`restaurants/${tenant.id}/tables`).get();
  const rawTables = (tablesSnap.val() ?? {}) as Record<string, any>;

  const resolved = resolveTableBySlugOrToken(rawTables, tableSlug);
  if (!resolved) {
    errorResponse(res, 404, "Table not found.", "TABLE_NOT_FOUND");
    return;
  }

  const matchedTableId = resolved.id;
  const matchedTable = resolved.table;

  // Find active session for this table (or a specific requested session ID for receipt views)
  let activeSessionId = matchedTable.activeSessionId || null;
  let sessionData: any = null;

  if (requestedSessionId) {
    const sessSnap = await db.ref(`restaurants/${tenant.id}/tableSessions/${requestedSessionId}`).get();
    if (sessSnap.exists()) {
      sessionData = sessSnap.val();
      activeSessionId = sessionData.id;
    }
  } else if (activeSessionId) {
    const sessSnap = await db.ref(`restaurants/${tenant.id}/tableSessions/${activeSessionId}`).get();
    if (sessSnap.exists() && sessSnap.val()?.status === "ACTIVE") {
      sessionData = sessSnap.val();
    } else {
      activeSessionId = null;
    }
  }

  // If still not resolved, query for an active session explicitly mapped to this table
  if (!sessionData || sessionData.status !== "ACTIVE") {
    if (!requestedSessionId) {
      const allSessSnap = await db.ref(`restaurants/${tenant.id}/tableSessions`).get();
      if (allSessSnap.exists()) {
        const allSess = allSessSnap.val() as Record<string, any>;
        const activeMatch = Object.values(allSess).find(
          (s: any) => s && s.tableId === matchedTableId && s.status === "ACTIVE"
        );
        if (activeMatch) {
          sessionData = activeMatch;
          activeSessionId = activeMatch.id;
        } else {
          // Table has no active session. Never resurrect closed sessions.
          sessionData = null;
          activeSessionId = null;
        }
      } else {
        sessionData = null;
        activeSessionId = null;
      }
    }
  }

  // Fetch orders for this restaurant
  const ordersSnap = await db.ref(`restaurants/${tenant.id}/orders`).get();
  const allOrders = (ordersSnap.val() ?? {}) as Record<string, any>;

  const sessionOrders: any[] = [];
  const combinedItemsMap = new Map<string, {
    name: string;
    quantity: number;
    price: number;
    total: number;
    specialInstructions: string[];
    orderNumbers: string[];
  }>();

  let subtotal = 0;
  let taxes = 0;
  let total = 0;
  let activeCount = 0;
  let completedCount = 0;

  for (const [ordId, ord] of Object.entries(allOrders)) {
    if (!ord) continue;
    // CRITICAL: Must strictly belong to the authoritative active session.
    // Never allow orders from past sessions to leak into an empty or new session.
    const isThisSession = activeSessionId ? ord.sessionId === activeSessionId : false;

    if (isThisSession) {
      const isCancelled = ord.status === "CANCELLED" || ord.status === "DECLINED";

      // Normalization for legacy orders
      const itemSum = Array.isArray(ord.items)
        ? ord.items.reduce((s: number, i: any) => s + (Number(i.subtotal || i.price * i.quantity) || 0), 0)
        : 0;
      const ordSubtotal = Number(ord.subtotal) || itemSum;
      let ordTotal = Number(ord.total) || ordSubtotal;
      let ordTaxes = Number(ord.taxes) || Math.max(0, ordTotal - ordSubtotal);

      if (ordSubtotal > 0 && ordTotal >= ordSubtotal * 3) {
        const rawTaxRate = Number(ord.taxRate ?? 0.05);
        const normalizedRate = rawTaxRate > 1 ? rawTaxRate / 100 : (rawTaxRate <= 0 ? 0.05 : rawTaxRate);
        ordTaxes = Math.round(ordSubtotal * normalizedRate * 100) / 100;
        ordTotal = Math.round((ordSubtotal + ordTaxes) * 100) / 100;
      }

      sessionOrders.push({
        id: ordId,
        orderNumber: ord.orderNumber || ordId.slice(-4).toUpperCase(),
        status: ord.status,
        paymentStatus: ord.paymentStatus || "UNPAID",
        paymentMethod: ord.paymentMethod || null,
        subtotal: ordSubtotal,
        taxes: ordTaxes,
        total: ordTotal,
        itemsCount: Array.isArray(ord.items) ? ord.items.length : 0,
        items: Array.isArray(ord.items) ? ord.items : [],
        createdAt: ord.createdAt,
        updatedAt: ord.updatedAt || ord.createdAt,
        orderSource: ord.orderSource || ord.source || "QR",
      });

      if (!isCancelled) {
        subtotal += ordSubtotal;
        taxes += ordTaxes;
        total += ordTotal;

        if (["NEEDS_APPROVAL", "PENDING_WAITER_APPROVAL", "NEW", "APPROVED", "ACCEPTED", "PREPARING", "READY"].includes(ord.status)) {
          activeCount++;
        } else if (ord.status === "COMPLETED") {
          completedCount++;
        }

        // Aggregate combined items for clear consolidated bill receipt
        if (Array.isArray(ord.items)) {
          for (const it of ord.items) {
            const key = String(it.name || "Item").trim().toLowerCase();
            const existing = combinedItemsMap.get(key);
            const qty = Number(it.quantity) || 1;
            const price = Number(it.price) || 0;
            const itTotal = Number(it.subtotal) || price * qty;
            const instructions = it.specialInstructions ? [it.specialInstructions] : [];
            const ordNum = ord.orderNumber || ordId.slice(-4).toUpperCase();

            if (existing) {
              existing.quantity += qty;
              existing.total = Math.round((existing.total + itTotal) * 100) / 100;
              if (instructions.length > 0) existing.specialInstructions.push(...instructions);
              if (!existing.orderNumbers.includes(ordNum)) existing.orderNumbers.push(ordNum);
            } else {
              combinedItemsMap.set(key, {
                name: it.name || "Item",
                quantity: qty,
                price: price,
                total: Math.round(itTotal * 100) / 100,
                specialInstructions: instructions,
                orderNumbers: [ordNum],
              });
            }
          }
        }
      }
    }
  }

  // Sort orders chronologically
  sessionOrders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  subtotal = Math.round(subtotal * 100) / 100;
  taxes = Math.round(taxes * 100) / 100;
  total = Math.round(total * 100) / 100;

  const validOrders = sessionOrders.filter((o) => o.status !== "CANCELLED" && o.status !== "DECLINED");
  const isSessionClosed = sessionData?.status === "CLOSED";
  // The bill is PAID if and only if staff recorded payment / settled the session
  const isPaid = Boolean(
    (isSessionClosed && sessionData?.paymentStatus === "PAID") ||
    sessionData?.paymentStatus === "PAID"
  );

  const profile = (tenant.profile ?? {}) as Record<string, any>;
  const settings = (tenant.settings ?? {}) as Record<string, any>;

  // Before any food is ordered, there is no active bill yet (billData is null)
  const hasBillableOrders = Boolean(sessionData && validOrders.length > 0);
  const billData = hasBillableOrders ? {
    ordersCount: validOrders.length,
    totalOrdersCount: sessionOrders.length,
    activeOrdersCount: activeCount,
    completedOrdersCount: completedCount,
    subtotal,
    taxes,
    total,
    currency: settings.currency || profile.currency || "₹",
    paymentStatus: isPaid ? "PAID" : "UNPAID",
    paymentMethod: sessionData?.paymentMethod || (isPaid ? "COUNTER" : "PAY_AT_COUNTER"),
    canOrderMore: sessionData?.status === "ACTIVE" && matchedTable.active !== false,
  } : null;

  res.json({
    restaurant: {
      name: profile.name || "Restaurant",
      slug: profile.slug || restaurantSlug,
      logoUrl: profile.logoUrl || null,
      city: profile.city || "",
      currency: settings.currency || profile.currency || "₹",
      taxRate: profile.taxRate ?? 0.05,
    },
    table: {
      id: matchedTableId,
      tableNumber: String(matchedTable.tableNumber || ""),
      location: matchedTable.location ? String(matchedTable.location) : null,
      slug: matchedTable.slug || matchedTableId,
      active: matchedTable.active !== false,
      status: matchedTable.active === false ? "DEACTIVATED" : (sessionData?.status === "ACTIVE" ? "OCCUPIED" : "AVAILABLE"),
    },
    session: sessionData ? {
      id: sessionData.id,
      status: sessionData.status,
      paymentStatus: isPaid ? "PAID" : "UNPAID",
      paymentMethod: sessionData.paymentMethod || (isPaid ? "COUNTER" : null),
      createdAt: sessionData.createdAt || sessionData.startedAt,
      closedAt: sessionData.closedAt || null,
      closedBy: sessionData.closedBy || null,
    } : null,
    bill: billData,
    orders: sessionOrders,
    combinedItems: Array.from(combinedItemsMap.values()),
  });
});

// 4. Realtime Server-Sent Events (SSE) stream for Customer Table Session & Live Bill
router.get("/public/menu/:restaurantSlug/table/:tableSlug/session/stream", async (req, res) => {
  const { restaurantSlug, tableSlug } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent("connected", {
    restaurantSlug,
    tableSlug,
    timestamp: new Date().toISOString(),
  });

  const tenant = await resolveTenant(restaurantSlug);
  if (!tenant) {
    sendEvent("error", { message: "Restaurant not found." });
    res.end();
    return;
  }

  const db = getDatabase();
  const tablesSnap = await db.ref(`restaurants/${tenant.id}/tables`).get();
  const rawTables = (tablesSnap.val() ?? {}) as Record<string, any>;
  const resolvedTable = resolveTableBySlugOrToken(rawTables, tableSlug);
  const targetTableId = resolvedTable?.id || null;
  const targetTableNumber = resolvedTable?.table?.tableNumber ? String(resolvedTable.table.tableNumber) : null;

  // Handlers for real-time updates
  const handleOrderStatus = (data: any) => {
    sendEvent("order_status_updated", data);
  };

  const handleNewOrder = (data: any) => {
    if (
      data?.tableSlug === tableSlug ||
      data?.tableNumber === tableSlug ||
      (targetTableId && data?.tableId === targetTableId) ||
      (targetTableNumber && String(data?.tableNumber) === targetTableNumber)
    ) {
      sendEvent("new_order_added", data);
    }
  };

  const handleSessionClosed = (data: any) => {
    if (
      !data?.tableId ||
      data.tableId === targetTableId ||
      data?.tableSlug === tableSlug ||
      data?.tableNumber === targetTableNumber
    ) {
      sendEvent("session_closed", data);
    }
  };

  const handleSessionUpdated = (data: any) => {
    if (
      !data?.tableId ||
      data.tableId === targetTableId ||
      data?.tableSlug === tableSlug ||
      data?.tableNumber === targetTableNumber
    ) {
      sendEvent("session_updated", data);
    }
  };

  const handleCartUpdated = (data: any) => {
    if (
      !data?.tableId ||
      data.tableId === targetTableId ||
      data?.tableSlug === tableSlug ||
      data?.tableNumber === targetTableNumber
    ) {
      sendEvent("cart_updated", data);
    }
  };

  const tenantId = tenant.id;
  orderEvents.on(`order_status:${tenantId}`, handleOrderStatus);
  orderEvents.on(`new_order:${tenantId}`, handleNewOrder);
  orderEvents.on(`session_closed:${tenantId}`, handleSessionClosed);
  orderEvents.on(`table_updated:${tenantId}`, handleSessionUpdated);
  orderEvents.on(`cart_updated:${tenantId}`, handleCartUpdated);

  // Keep-alive ping
  const interval = setInterval(() => {
    res.write(": ping\n\n");
  }, 25000);

  req.on("close", () => {
    clearInterval(interval);
    orderEvents.off(`order_status:${tenantId}`, handleOrderStatus);
    orderEvents.off(`new_order:${tenantId}`, handleNewOrder);
    orderEvents.off(`session_closed:${tenantId}`, handleSessionClosed);
    orderEvents.off(`table_updated:${tenantId}`, handleSessionUpdated);
    orderEvents.off(`cart_updated:${tenantId}`, handleCartUpdated);
  });
});

/**
 * Shared Table Cart Endpoints:
 * Enables real-time synchronization of shopping cart between multiple diners at the same table.
 */
router.get("/public/menu/:restaurantSlug/table/:tableSlug/cart", async (req, res) => {
  const { restaurantSlug, tableSlug } = req.params;
  const tenant = await resolveTenant(restaurantSlug);
  if (!tenant) {
    errorResponse(res, 404, "Restaurant not found.", "RESTAURANT_NOT_FOUND");
    return;
  }

  const db = getDatabase();
  const tablesSnap = await db.ref(`restaurants/${tenant.id}/tables`).get();
  const rawTables = (tablesSnap.val() ?? {}) as Record<string, any>;
  const resolvedTable = resolveTableBySlugOrToken(rawTables, tableSlug);
  if (!resolvedTable) {
    errorResponse(res, 404, "Table not found.", "TABLE_NOT_FOUND");
    return;
  }

  const tableId = resolvedTable.id;
  const cartSnap = await db.ref(`restaurants/${tenant.id}/tableCarts/${tableId}`).get();
  const cartData = cartSnap.val() || { items: [], lastUpdatedAt: Date.now(), activeDinersCount: 1 };

  res.json({
    tableId,
    tableNumber: resolvedTable.table.tableNumber,
    items: Array.isArray(cartData.items) ? cartData.items : [],
    lastUpdatedAt: cartData.lastUpdatedAt || Date.now(),
    lastUpdatedBy: cartData.lastUpdatedBy || "Guest",
    activeDinersCount: cartData.activeDinersCount || 1,
  });
});

router.post("/public/menu/:restaurantSlug/table/:tableSlug/cart", async (req, res) => {
  const { restaurantSlug, tableSlug } = req.params;
  const tenant = await resolveTenant(restaurantSlug);
  if (!tenant) {
    errorResponse(res, 404, "Restaurant not found.", "RESTAURANT_NOT_FOUND");
    return;
  }

  const db = getDatabase();
  const tablesSnap = await db.ref(`restaurants/${tenant.id}/tables`).get();
  const rawTables = (tablesSnap.val() ?? {}) as Record<string, any>;
  const resolvedTable = resolveTableBySlugOrToken(rawTables, tableSlug);
  if (!resolvedTable) {
    errorResponse(res, 404, "Table not found.", "TABLE_NOT_FOUND");
    return;
  }

  const tableId = resolvedTable.id;
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const dinerName = typeof req.body?.dinerName === "string" ? req.body.dinerName.slice(0, 50) : "Guest";
  const now = Date.now();

  const cartPayload = {
    items,
    lastUpdatedAt: now,
    lastUpdatedBy: dinerName,
    tableId,
    tableNumber: resolvedTable.table.tableNumber,
  };

  await db.ref(`restaurants/${tenant.id}/tableCarts/${tableId}`).set(cartPayload);

  // Broadcast to other diners via orderEvents
  orderEvents.emit(`cart_updated:${tenant.id}`, {
    tableId,
    tableNumber: resolvedTable.table.tableNumber,
    tableSlug,
    cart: cartPayload,
  });

  res.json({
    success: true,
    tableId,
    ...cartPayload,
  });
});

router.delete("/public/menu/:restaurantSlug/table/:tableSlug/cart", async (req, res) => {
  const { restaurantSlug, tableSlug } = req.params;
  const tenant = await resolveTenant(restaurantSlug);
  if (!tenant) {
    errorResponse(res, 404, "Restaurant not found.", "RESTAURANT_NOT_FOUND");
    return;
  }

  const db = getDatabase();
  const tablesSnap = await db.ref(`restaurants/${tenant.id}/tables`).get();
  const rawTables = (tablesSnap.val() ?? {}) as Record<string, any>;
  const resolvedTable = resolveTableBySlugOrToken(rawTables, tableSlug);
  if (!resolvedTable) {
    errorResponse(res, 404, "Table not found.", "TABLE_NOT_FOUND");
    return;
  }

  const tableId = resolvedTable.id;
  await db.ref(`restaurants/${tenant.id}/tableCarts/${tableId}`).remove();

  orderEvents.emit(`cart_updated:${tenant.id}`, {
    tableId,
    tableNumber: resolvedTable.table.tableNumber,
    tableSlug,
    cart: { items: [], lastUpdatedAt: Date.now() },
  });

  res.json({ success: true, message: "Cart cleared" });
});

export default router;
