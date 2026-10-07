import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import {
  CreateCategoryBody,
  CreateMenuItemBody,
  CreateTableBody,
  InviteMemberBody,
  UpdateCategoryBody,
  UpdateMenuItemBody,
  UpdateRestaurantSettingsBody,
  UpdateTableBody,
} from "@workspace/api-zod";
import { createId, getAdminAuth, getDatabase, hashPin, randomPin, syncRestaurantClaims, timestamp } from "../lib/firebase";
import { errorResponse, getTenantAccess, parsedBody, requestBaseUrl } from "../lib/http";
import { listSnapshot, resolveTenant } from "../lib/tenant";
import { createAuditLog } from "../lib/audit";
import { canUseFeature, getPlanEntitlements, getPlanLimits, normalizePlanId, PLAN_DEFINITIONS } from "../lib/plans";
import {
  extractMenuFromDocuments,
  cleanUpMenuWithAi,
  generateDishDescription,
} from "../lib/ai";
import { orderEvents } from "./orders.js";
import {
  getRestaurantSubscription,
  submitManualPayment,
  TABLELINE_PAYMENT_DETAILS,
  type ManualPaymentMethod,
} from "../lib/subscriptions.js";

const router: IRouter = Router();

function cleanForFirebase<T>(data: T): T {
  if (data === undefined) return null as any;
  if (data === null) return null as any;
  if (Array.isArray(data)) {
    return data.map((item) => cleanForFirebase(item)) as any;
  }
  if (typeof data === "object") {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(data as Record<string, any>)) {
      if (val !== undefined) {
        result[key] = cleanForFirebase(val);
      }
    }
    return result as any;
  }
  return data;
}

function categoryView(id: string, value: Record<string, unknown>) {
  return {
    id,
    name: String(value.name ?? ""),
    description: String(value.description ?? ""),
    imageUrl: typeof value.imageUrl === "string" ? value.imageUrl : null,
    displayOrder: Number(value.displayOrder ?? 0),
    active: value.active !== false,
    modifierGroupIds: Array.isArray(value.modifierGroupIds) ? value.modifierGroupIds.map((g: any) => String(g)) : [],
    translations: typeof value.translations === "object" && value.translations !== null ? value.translations : {},
  };
}

function modifierGroupView(id: string, value: Record<string, unknown>) {
  const minSelections = Number(value.minSelections ?? (value.required ? 1 : 0));
  const maxSelections = Math.max(1, Number(value.maxSelections ?? 1));
  const selectionType = String(value.selectionType || (maxSelections > 1 ? "multiple" : "single"));

  return {
    id,
    name: String(value.name ?? ""),
    description: String(value.description ?? ""),
    selectionType,
    required: value.required === true || minSelections > 0,
    minSelections,
    maxSelections,
    options: Array.isArray(value.options)
      ? value.options.map((opt: any, idx: number) => {
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
    createdAt: timestamp(value.createdAt),
    updatedAt: timestamp(value.updatedAt),
  };
}

function itemView(id: string, value: Record<string, unknown>) {
  const variants = Array.isArray(value.variants)
    ? value.variants.map((v: any, idx: number) => ({
        id: String(v.id || `var_${idx}`),
        name: String(v.name || ""),
        price: Number(v.price || 0),
      }))
    : [];

  const modifierGroupIds = Array.isArray(value.modifierGroupIds)
    ? value.modifierGroupIds.map((g: any) => String(g))
    : [];

  const disabledModifierGroupIds = Array.isArray(value.disabledModifierGroupIds)
    ? value.disabledModifierGroupIds.map((g: any) => String(g))
    : [];

  let availabilityType = typeof value.availabilityType === "string" ? value.availabilityType : undefined;
  if (!availabilityType) {
    availabilityType = value.available === false ? "OUT_OF_STOCK" : "ALWAYS";
  }

  const badge =
    typeof value.badge === "string" && value.badge
      ? value.badge
      : value.isBestseller
      ? "bestseller"
      : value.isChefsPick
      ? "chefs_pick"
      : null;

  return {
    id,
    categoryId: String(value.categoryId ?? ""),
    name: String(value.name ?? ""),
    description: String(value.description ?? ""),
    price: Number(value.price ?? 0),
    imageUrl: typeof value.imageUrl === "string" ? value.imageUrl : null,
    veg: value.veg === true,
    isVegan: value.isVegan === true,
    isJain: value.isJain === true,
    badge,
    isBestseller: badge === "bestseller" || value.isBestseller === true,
    isChefsPick: badge === "chefs_pick" || value.isChefsPick === true,
    translations: typeof value.translations === "object" && value.translations !== null ? value.translations : {},
    spicyLevel: typeof value.spicyLevel === "string" ? value.spicyLevel : undefined,
    ingredients: typeof value.ingredients === "string" ? value.ingredients : undefined,
    allergens: Array.isArray(value.allergens) ? value.allergens : typeof value.allergens === "string" ? [value.allergens] : [],
    exclusions: Array.isArray(value.exclusions) ? value.exclusions : typeof value.exclusions === "string" ? [value.exclusions] : [],
    nutrition: typeof value.nutrition === "object" && value.nutrition !== null ? value.nutrition : undefined,
    popular: value.popular === true,
    available: value.available !== false && availabilityType !== "OUT_OF_STOCK" && availabilityType !== "HIDDEN",
    availabilityType,
    availabilitySchedule:
      typeof value.availabilitySchedule === "object" && value.availabilitySchedule !== null
        ? value.availabilitySchedule
        : undefined,
    variants,
    modifierGroupIds,
    disabledModifierGroupIds,
    displayOrder: Number(value.displayOrder ?? 0),
    addons: Array.isArray(value.addons) ? value.addons : [],
    recommendedItemIds: Array.isArray(value.recommendedItemIds) ? value.recommendedItemIds : [],
    isCombo: value.isCombo === true,
    comboIncludes: Array.isArray(value.comboIncludes) ? value.comboIncludes : [],
    updatedAt: timestamp(value.updatedAt),
  };
}

function tableView(
  id: string,
  value: Record<string, unknown>,
  baseUrl: string,
  restaurantSlug: string,
) {
  const slug = String(value.slug ?? "");
  const qrToken = String(value.qrToken || slug || id);
  const isDeactivated = value.active === false;
  const status = isDeactivated ? "DEACTIVATED" : (value.activeSessionId ? "OCCUPIED" : "AVAILABLE");
  return {
    id,
    tableNumber: String(value.tableNumber ?? ""),
    location: value.location ? String(value.location) : null,
    slug,
    qrToken,
    active: !isDeactivated,
    status,
    activeSessionId: value.activeSessionId ? String(value.activeSessionId) : null,
    qrUrl: `${baseUrl}/menu/${restaurantSlug}/table/${slug || qrToken}`,
    createdAt: timestamp(value.createdAt),
    updatedAt: timestamp(value.updatedAt),
  };
}

function restaurantView(
  id: string,
  tenant: { profile?: Record<string, unknown>; settings?: Record<string, unknown> },
  tables: Record<string, unknown>,
  categories: Record<string, unknown>,
  items: Record<string, unknown>
) {
  const profile = tenant.profile ?? {};
  const settings = tenant.settings ?? {};
  return {
    id,
    name: String(profile.name ?? ""),
    slug: String(profile.slug ?? ""),
    ownerEmail: String(profile.email ?? ""),
    phone: String(profile.phone ?? ""),
    city: String(profile.city ?? ""),
    tableCount: Object.keys(tables).length,
    plan: normalizePlanId(tenant.plan || profile.plan),
    status: settings.restaurantStatus ?? "setup",
    createdAt: timestamp(profile.createdAt),
    menuItemCount: Object.keys(items).length,
    categoryCount: Object.keys(categories).length,
  };
}

router.get("/restaurants/:restaurantSlug/dashboard", async (req, res) => {
  try {
    const access = await getTenantAccess(req, res, "read");
    if (!access) return;
    const snapshot = await getDatabase().ref(`restaurants/${access.tenant.id}`).get();
    const data = (snapshot.val() ?? {}) as {
      tables?: Record<string, unknown>;
      categories?: Record<string, unknown>;
      menuItems?: Record<string, unknown>;
    };
    const tables = data.tables ?? {};
    const categories = data.categories ?? {};
    const items = data.menuItems ?? {};
    const tableCount = Object.keys(tables).length;
    const categoryCount = Object.keys(categories).length;
    const itemCount = Object.keys(items).length;

    const profile = access.tenant.profile ?? {};
    const settings = access.tenant.settings ?? {};

    const setupChecks = [
      Boolean(profile.name),
      categoryCount > 0,
      itemCount > 0,
      tableCount > 0,
      settings.restaurantStatus === "active",
    ];
    const currentPlanId = normalizePlanId(profile.plan);
    const activeTableCount = Object.values(tables).filter((value) => (value as Record<string, unknown>).active !== false).length;
    const activeItemCount = Object.values(items).filter((value) => (value as Record<string, unknown>).available !== false).length;

    const subscription = await getRestaurantSubscription(access.tenant.id);

    res.json({
      role: access.role,
      plan: currentPlanId,
      planEntitlements: getPlanEntitlements(currentPlanId),
      planLimits: getPlanLimits(currentPlanId),
      planDefinition: PLAN_DEFINITIONS[currentPlanId],
      subscription,
      activePlanRequest: data.planRequest || null,
      planRequest: data.planRequest || null,
      restaurant: restaurantView(access.tenant.id, access.tenant, tables, categories, items),
      usage: {
        tablesCount: activeTableCount,
        totalTablesCount: tableCount,
        menuItemsCount: activeItemCount,
        totalMenuItemsCount: itemCount,
        categoriesCount: categoryCount,
      },
      menuItemCount: activeItemCount,
      totalMenuItemCount: itemCount,
      categoryCount,
      tableCount: activeTableCount,
      totalTableCount: tableCount,
      activeItemCount,
      activeTableCount,
      setupProgress: Math.round((setupChecks.filter(Boolean).length / setupChecks.length) * 100),
    });
  } catch (err: any) {
    console.error("[DASHBOARD ROUTE ERROR]", err);
    errorResponse(res, 500, "Unable to load dashboard.", "INTERNAL_ERROR");
  }
});

// GET active/latest plan upgrade request for restaurant
router.get("/restaurants/:restaurantSlug/plan-request", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage");
  if (!access) return;

  const db = getDatabase();
  const snap = await db.ref(`restaurants/${access.tenant.id}/planRequest`).get();
  const request = snap.exists() ? snap.val() : null;

  res.json({
    request,
    currentPlan: normalizePlanId(access.tenant.profile.plan),
  });
});

// POST a new plan upgrade request (USER -> REQUEST UPGRADE -> PENDING)
// Note: This creates a PENDING request and does NOT directly alter the active plan.
router.post("/restaurants/:restaurantSlug/plan-request", async (req, res) => {
  const access = await getTenantAccess(req, res, "owner");
  if (!access) return;

  const requestedPlan = String(req.body?.requestedPlan || req.body?.plan || "").toLowerCase().trim();
  if (!PLAN_DEFINITIONS[requestedPlan as any] || requestedPlan === "scale") {
    errorResponse(res, 400, "Invalid plan requested. Allowed plans: starter, growth, pro", "INVALID_PLAN");
    return;
  }

  const currentPlan = normalizePlanId(access.tenant.profile.plan);
  if (requestedPlan === currentPlan) {
    errorResponse(res, 400, `Restaurant is already on the ${PLAN_DEFINITIONS[currentPlan].name} plan.`, "SAME_PLAN");
    return;
  }

  const db = getDatabase();
  const existingSnap = await db.ref(`restaurants/${access.tenant.id}/planRequest`).get();
  if (existingSnap.exists()) {
    const existing = existingSnap.val();
    if (existing && existing.status === "PENDING") {
      res.status(409).json({
        error: `A plan upgrade request for ${PLAN_DEFINITIONS[existing.requestedPlan as any]?.name || existing.requestedPlan} is already pending administrator approval.`,
        code: "UPGRADE_REQUEST_PENDING",
        request: existing,
        currentPlan,
      });
      return;
    }
  }

  const requestId = createId("preq");
  const now = Date.now();
  const requestObj = {
    id: requestId,
    restaurantId: access.tenant.id,
    restaurantSlug: access.tenant.profile.slug,
    restaurantName: access.tenant.profile.name || "Restaurant",
    currentPlan,
    requestedPlan,
    status: "PENDING",
    createdAt: now,
    requestedBy: access.context.email || access.context.uid || "owner",
    requestedByUid: access.context.uid || "",
  };

  // Atomic write to both platform registry and restaurant tenant node
  const updates: Record<string, unknown> = {
    [`platform/planRequests/${requestId}`]: requestObj,
    [`restaurants/${access.tenant.id}/planRequest`]: requestObj,
  };
  await db.ref().update(updates);

  createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email || "owner",
    actorRole: access.role,
    action: "PLAN_UPGRADE_REQUESTED",
    resourceId: requestId,
    details: {
      currentPlan,
      requestedPlan,
    },
  });

  orderEvents.emit(`plan_request_updated:${access.tenant.id}`, requestObj);
  orderEvents.emit(`plan_request_updated:${req.params.restaurantSlug}`, requestObj);

  res.status(201).json({
    success: true,
    message: `Upgrade request for ${PLAN_DEFINITIONS[requestedPlan as any].name} submitted successfully. Your current plan remains ${PLAN_DEFINITIONS[currentPlan].name} until approved.`,
    request: requestObj,
    currentPlan,
  });
});

// Update Restaurant Subscription Plan (DIRECT ADMIN OVERRIDE ONLY)
// Client owners MUST NOT directly modify their subscription plan without platform admin approval.
router.patch(["/restaurants/:restaurantSlug/plan", "/platform/restaurants/:restaurantSlug/plan"], async (req, res) => {
  const access = await getTenantAccess(req, res, "owner");
  if (!access) return;

  // Strict check: Only Platform Administrators can directly execute plan changes
  if (!access.context.platformAdmin) {
    errorResponse(
      res,
      403,
      "Direct subscription plan modification is restricted. Please submit a plan upgrade request for administrator review.",
      "UPGRADE_REQUEST_REQUIRED"
    );
    return;
  }

  const targetPlan = String(req.body?.plan || "").toLowerCase().trim();
  if (!PLAN_DEFINITIONS[targetPlan as any]) {
    errorResponse(res, 400, `Invalid plan requested. Allowed plans: ${Object.keys(PLAN_DEFINITIONS).join(", ")}`, "INVALID_PLAN");
    return;
  }

  const db = getDatabase();
  const previousPlan = access.tenant.profile.plan || "starter";
  const now = Date.now();

  await db.ref(`restaurants/${access.tenant.id}/profile`).update({
    plan: targetPlan,
    planUpdatedAt: now,
    updatedAt: now,
  });

  // Mark any active plan request as approved
  const existingReqSnap = await db.ref(`restaurants/${access.tenant.id}/planRequest`).get();
  if (existingReqSnap.exists() && existingReqSnap.val()?.status === "PENDING") {
    const reqData = existingReqSnap.val();
    await db.ref(`platform/planRequests/${reqData.id}`).update({
      status: "APPROVED",
      reviewedAt: now,
      reviewedBy: access.context.email || access.context.uid || "platform_admin",
    });
    await db.ref(`restaurants/${access.tenant.id}/planRequest`).update({
      status: "APPROVED",
      reviewedAt: now,
      reviewedBy: access.context.email || access.context.uid || "platform_admin",
    });
  }

  createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "admin",
    actorRole: "platform_admin",
    action: "PLAN_CHANGED",
    resourceId: access.tenant.id,
    details: {
      previousPlan,
      newPlan: targetPlan,
    },
  });

  orderEvents.emit(`plan_updated:${access.tenant.id}`, { plan: targetPlan });
  orderEvents.emit(`plan_updated:${req.params.restaurantSlug}`, { plan: targetPlan });

  const snapshot = await db.ref(`restaurants/${access.tenant.id}`).get();
  const data = (snapshot.val() ?? {}) as Record<string, any>;
  const tables = data.tables ?? {};
  const items = data.menuItems ?? {};
  const activeTableCount = Object.values(tables).filter((t: any) => t && t.active !== false && !t.deleted).length;
  const activeItemCount = Object.values(items).filter((i: any) => i && i.available !== false && !i.deleted).length;

  res.json({
    success: true,
    plan: targetPlan,
    planLimits: getPlanLimits(targetPlan as any),
    planEntitlements: getPlanEntitlements(targetPlan as any),
    planDefinition: PLAN_DEFINITIONS[targetPlan as any],
    usage: {
      tablesCount: activeTableCount,
      menuItemsCount: activeItemCount,
    },
  });
});

// GET /restaurants/:restaurantSlug/subscription
router.get("/restaurants/:restaurantSlug/subscription", async (req, res) => {
  const access = await getTenantAccess(req, res, "read");
  if (!access) return;

  const subscription = await getRestaurantSubscription(access.tenant.id);
  const db = getDatabase();
  const historySnap = await db.ref(`restaurants/${access.tenant.id}/paymentHistory`).get();
  const historyVal = (historySnap.val() ?? {}) as Record<string, any>;
  const paymentHistory = Object.values(historyVal).sort((a: any, b: any) => (b.verifiedAt || 0) - (a.verifiedAt || 0));

  res.json({
    subscription,
    paymentHistory,
    paymentDetails: TABLELINE_PAYMENT_DETAILS,
  });
});

// POST /restaurants/:restaurantSlug/subscription/submit-payment
router.post("/restaurants/:restaurantSlug/subscription/submit-payment", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage");
  if (!access) return;

  const { paymentMethod, transactionReference, notes } = req.body ?? {};
  if (!paymentMethod || !["UPI", "BANK_TRANSFER", "CASH"].includes(paymentMethod)) {
    errorResponse(res, 400, "Valid payment method (UPI, BANK_TRANSFER, or CASH) is required.", "INVALID_PAYMENT_METHOD");
    return;
  }

  if (paymentMethod !== "CASH" && (!transactionReference || !String(transactionReference).trim())) {
    errorResponse(res, 400, "Transaction/UTR reference number is required for UPI and Bank Transfer.", "MISSING_TRANSACTION_REF");
    return;
  }

  const updatedSubscription = await submitManualPayment(access.tenant.id, {
    paymentMethod,
    transactionReference: transactionReference ? String(transactionReference).trim() : "CASH_COLLECTION",
    notes,
    submittedBy: access.context.email || access.context.uid,
  });

  await createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "owner",
    actorRole: access.role,
    action: "PAYMENT_RECORDED",
    details: {
      action: "MANUAL_PAYMENT_SUBMITTED",
      paymentMethod,
      transactionReference,
      amount: updatedSubscription.reminder?.renewalAmount || 0,
    },
  });

  orderEvents.emit(`subscription_updated:${access.tenant.id}`, { subscription: updatedSubscription });
  orderEvents.emit(`subscription_updated:${req.params.restaurantSlug}`, { subscription: updatedSubscription });

  res.json({
    success: true,
    message: "Payment reference submitted successfully. Platform admin will review and verify shortly.",
    subscription: updatedSubscription,
  });
});

router.get("/restaurants/:restaurantSlug/categories", async (req, res) => {
  const access = await getTenantAccess(req, res, "read");
  if (!access) return;
  const snapshot = await getDatabase().ref(`restaurants/${access.tenant.id}/categories`).get();
  const data = (snapshot.val() ?? {}) as Record<string, Record<string, unknown>>;
  res.json(Object.entries(data).map(([id, value]) => categoryView(id, value)).sort((a, b) => a.displayOrder - b.displayOrder));
});

router.post("/restaurants/:restaurantSlug/categories", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage");
  if (!access) return;
  const body = parsedBody(CreateCategoryBody, req.body, res);
  if (!body) return;
  const id = createId("cat");
  const translations = typeof req.body.translations === "object" && req.body.translations !== null ? req.body.translations : {};
  const modifierGroupIds = Array.isArray(req.body.modifierGroupIds)
    ? req.body.modifierGroupIds.map((g: any) => String(g).trim()).filter(Boolean)
    : [];
  const value = { ...body, modifierGroupIds, translations, createdAt: Date.now(), updatedAt: Date.now() };
  await getDatabase().ref(`restaurants/${access.tenant.id}/categories/${id}`).set(value);
  res.status(201).json(categoryView(id, value));
});

router.patch("/restaurants/:restaurantSlug/categories/:categoryId", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage");
  if (!access) return;
  const body = parsedBody(UpdateCategoryBody, req.body, res);
  if (!body) return;
  const ref = getDatabase().ref(`restaurants/${access.tenant.id}/categories/${req.params.categoryId}`);
  const snapshot = await ref.get();
  const existing = snapshot.val() as Record<string, unknown> | null;
  if (!existing) {
    errorResponse(res, 404, "Category not found.", "CATEGORY_NOT_FOUND");
    return;
  }
  const translations = req.body.translations !== undefined ? (typeof req.body.translations === "object" && req.body.translations !== null ? req.body.translations : {}) : existing.translations;
  const modifierGroupIds = req.body.modifierGroupIds !== undefined
    ? (Array.isArray(req.body.modifierGroupIds) ? req.body.modifierGroupIds.map((g: any) => String(g).trim()).filter(Boolean) : [])
    : (Array.isArray(existing.modifierGroupIds) ? existing.modifierGroupIds : []);
  const value: Record<string, unknown> = { ...existing, ...body, modifierGroupIds, translations, updatedAt: Date.now() };
  await ref.set(value);
  res.json(categoryView(req.params.categoryId, value));
});

router.delete("/restaurants/:restaurantSlug/categories/:categoryId", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage");
  if (!access) return;
  const ref = getDatabase().ref(`restaurants/${access.tenant.id}/categories/${req.params.categoryId}`);
  if (!(await ref.get()).exists()) {
    errorResponse(res, 404, "Category not found.", "CATEGORY_NOT_FOUND");
    return;
  }
  await ref.update({ active: false, updatedAt: Date.now() });
  res.status(204).end();
});

router.get("/restaurants/:restaurantSlug/menu-items", async (req, res) => {
  const access = await getTenantAccess(req, res, "read");
  if (!access) return;
  const snapshot = await getDatabase().ref(`restaurants/${access.tenant.id}/menuItems`).get();
  const data = (snapshot.val() ?? {}) as Record<string, Record<string, unknown>>;
  res.json(Object.entries(data).map(([id, value]) => itemView(id, value)).sort((a, b) => a.displayOrder - b.displayOrder));
});

router.post("/restaurants/:restaurantSlug/menu-items", async (req, res) => {
  try {
    const access = await getTenantAccess(req, res, "manage");
    if (!access) return;
    const body = parsedBody(CreateMenuItemBody, req.body, res);
    if (!body) return;

    const db = getDatabase();

    // Enforce plan menu items limit
    const limits = getPlanLimits(access.tenant.profile.plan);
    const itemsSnap = await db.ref(`restaurants/${access.tenant.id}/menuItems`).get();
    const currentCount = itemsSnap.exists() ? Object.keys(itemsSnap.val() ?? {}).length : 0;
    if (currentCount >= limits.maxMenuItems) {
      errorResponse(
        res,
        403,
        `Your current plan allows up to ${limits.maxMenuItems} menu items. Please upgrade your subscription.`,
        "PLAN_LIMITATION"
      );
      return;
    }

    let resolvedCategoryId = body.categoryId ? String(body.categoryId).trim() : "";
    let categoryValid = false;
    if (resolvedCategoryId) {
      const catSnap = await db.ref(`restaurants/${access.tenant.id}/categories/${resolvedCategoryId}`).get();
      if (catSnap.exists()) {
        categoryValid = true;
      }
    }

    if (!categoryValid) {
      const allCatsSnap = await db.ref(`restaurants/${access.tenant.id}/categories`).get();
      const allCats = (allCatsSnap.val() ?? {}) as Record<string, any>;
      const activeCats = Object.entries(allCats).filter(([_, c]) => c && c.active !== false);

      if (activeCats.length > 0) {
        resolvedCategoryId = activeCats[0][0];
      } else {
        // Auto-create default section "General" if restaurant has zero categories
        resolvedCategoryId = createId("cat");
        const now = Date.now();
        await db.ref(`restaurants/${access.tenant.id}/categories/${resolvedCategoryId}`).set({
          name: "General",
          description: "Main course dishes and specialties",
          displayOrder: 0,
          active: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const id = createId("item");
    const addons = Array.isArray(req.body.addons) ? req.body.addons : [];
    const recommendedItemIds = Array.isArray(req.body.recommendedItemIds) ? req.body.recommendedItemIds : [];
    const isCombo = req.body.isCombo === true;
    const comboIncludes = Array.isArray(req.body.comboIncludes) ? req.body.comboIncludes : [];
    const isVegan = req.body.isVegan === true;
    const isJain = req.body.isJain === true;
    const spicyLevel = typeof req.body.spicyLevel === "string" ? req.body.spicyLevel : null;
    const ingredients = typeof req.body.ingredients === "string" ? req.body.ingredients.slice(0, 500) : null;
    const allergens = Array.isArray(req.body.allergens) ? req.body.allergens : typeof req.body.allergens === "string" ? [req.body.allergens] : [];
    const exclusions = Array.isArray(req.body.exclusions) ? req.body.exclusions : typeof req.body.exclusions === "string" ? [req.body.exclusions] : [];
    const nutrition = typeof req.body.nutrition === "object" && req.body.nutrition !== null ? req.body.nutrition : null;
    const variants = Array.isArray(req.body.variants)
      ? req.body.variants
          .map((v: any) => ({
            id: String(v.id || createId("var")),
            name: String(v.name || "").trim(),
            price: Number(v.price || 0),
          }))
          .filter((v: any) => v.name)
      : [];
    const modifierGroupIds = Array.isArray(req.body.modifierGroupIds)
      ? req.body.modifierGroupIds.map((g: any) => String(g).trim()).filter(Boolean)
      : [];
    const disabledModifierGroupIds = Array.isArray(req.body.disabledModifierGroupIds)
      ? req.body.disabledModifierGroupIds.map((g: any) => String(g).trim()).filter(Boolean)
      : [];
    const availabilityType = ["ALWAYS", "OUT_OF_STOCK", "HIDDEN", "SCHEDULED", "SEASONAL"].includes(String(req.body.availabilityType))
      ? String(req.body.availabilityType)
      : "ALWAYS";
    const availabilitySchedule =
      typeof req.body.availabilitySchedule === "object" && req.body.availabilitySchedule !== null
        ? req.body.availabilitySchedule
        : null;

    const badge =
      typeof req.body.badge === "string" && req.body.badge
        ? req.body.badge
        : req.body.isBestseller
        ? "bestseller"
        : req.body.isChefsPick
        ? "chefs_pick"
        : null;
    const isBestseller = badge === "bestseller" || req.body.isBestseller === true;
    const isChefsPick = badge === "chefs_pick" || req.body.isChefsPick === true;
    const translations =
      typeof req.body.translations === "object" && req.body.translations !== null
        ? req.body.translations
        : {};

    const value = {
      ...body,
      categoryId: resolvedCategoryId,
      addons,
      recommendedItemIds,
      isCombo,
      comboIncludes,
      isVegan,
      isJain,
      badge,
      isBestseller,
      isChefsPick,
      translations,
      spicyLevel,
      ingredients,
      allergens,
      exclusions,
      nutrition,
      variants,
      modifierGroupIds,
      disabledModifierGroupIds,
      availabilityType,
      availabilitySchedule,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const cleaned = cleanForFirebase(value);
    await getDatabase().ref(`restaurants/${access.tenant.id}/menuItems/${id}`).set(cleaned);
    await getDatabase().ref(`restaurants/${access.tenant.id}/items/${id}`).set(cleaned);
    res.status(201).json(itemView(id, cleaned));
  } catch (err: any) {
    console.error("Error creating menu item:", err);
    errorResponse(res, 500, err?.message || "Failed to create menu item", "INTERNAL_ERROR");
  }
});

router.patch("/restaurants/:restaurantSlug/menu-items/:itemId", async (req, res) => {
  try {
    const access = await getTenantAccess(req, res, "manage");
    if (!access) return;
    const body = parsedBody(UpdateMenuItemBody, req.body, res);
    if (!body) return;
    const ref = getDatabase().ref(`restaurants/${access.tenant.id}/menuItems/${req.params.itemId}`);
    const snapshot = await ref.get();
    const existing = snapshot.val() as Record<string, unknown> | null;
    if (!existing) {
      errorResponse(res, 404, "Menu item not found.", "ITEM_NOT_FOUND");
      return;
    }

    if (body.categoryId) {
      const catSnap = await getDatabase().ref(`restaurants/${access.tenant.id}/categories/${body.categoryId}`).get();
      if (!catSnap.exists()) {
        const allCatsSnap = await getDatabase().ref(`restaurants/${access.tenant.id}/categories`).get();
        const allCats = (allCatsSnap.val() ?? {}) as Record<string, any>;
        const activeCats = Object.keys(allCats).filter((k) => allCats[k]?.active !== false);
        if (activeCats.length > 0) {
          body.categoryId = activeCats[0];
        } else {
          delete (body as any).categoryId;
        }
      }
    }

    if (body.price !== undefined && Number(body.price) !== Number(existing.price)) {
      createAuditLog(access.tenant.id, {
        actorId: access.context.uid,
        actorEmail: access.context.email ?? "staff",
        actorRole: access.context.platformAdmin
          ? "platform_admin"
          : (access.context.memberships[access.tenant.id]?.role ?? "manager"),
        action: "MENU_PRICE_CHANGED",
        resourceId: req.params.itemId,
        details: { itemName: existing.name, previousPrice: existing.price, newPrice: body.price },
      });
    }

    if (body.available !== undefined && body.available !== existing.available) {
      createAuditLog(access.tenant.id, {
        actorId: access.context.uid,
        actorEmail: access.context.email ?? "staff",
        actorRole: access.context.platformAdmin
          ? "platform_admin"
          : (access.context.memberships[access.tenant.id]?.role ?? "manager"),
        action: "ITEM_AVAILABILITY_CHANGED" as any,
        resourceId: req.params.itemId,
        details: { itemName: existing.name, available: body.available },
      });
    }

    const addons = req.body.addons !== undefined ? (Array.isArray(req.body.addons) ? req.body.addons : []) : existing.addons;
    const recommendedItemIds = req.body.recommendedItemIds !== undefined ? (Array.isArray(req.body.recommendedItemIds) ? req.body.recommendedItemIds : []) : existing.recommendedItemIds;
    const isCombo = req.body.isCombo !== undefined ? req.body.isCombo === true : existing.isCombo;
    const comboIncludes = req.body.comboIncludes !== undefined ? (Array.isArray(req.body.comboIncludes) ? req.body.comboIncludes : []) : existing.comboIncludes;
    const isVegan = req.body.isVegan !== undefined ? req.body.isVegan === true : existing.isVegan;
    const isJain = req.body.isJain !== undefined ? req.body.isJain === true : existing.isJain;
    const badge =
      req.body.badge !== undefined
        ? (typeof req.body.badge === "string" && req.body.badge ? req.body.badge : null)
        : existing.badge;
    const isBestseller =
      req.body.isBestseller !== undefined
        ? req.body.isBestseller === true
        : (badge === "bestseller" || existing.isBestseller === true);
    const isChefsPick =
      req.body.isChefsPick !== undefined
        ? req.body.isChefsPick === true
        : (badge === "chefs_pick" || existing.isChefsPick === true);
    const translations =
      req.body.translations !== undefined
        ? (typeof req.body.translations === "object" && req.body.translations !== null ? req.body.translations : {})
        : (existing.translations || {});
    const spicyLevel = req.body.spicyLevel !== undefined ? String(req.body.spicyLevel) : (existing.spicyLevel ?? null);
    const ingredients = req.body.ingredients !== undefined ? String(req.body.ingredients) : (existing.ingredients ?? null);
    const allergens = req.body.allergens !== undefined ? (Array.isArray(req.body.allergens) ? req.body.allergens : [String(req.body.allergens)]) : (existing.allergens ?? []);
    const exclusions = req.body.exclusions !== undefined ? (Array.isArray(req.body.exclusions) ? req.body.exclusions : [String(req.body.exclusions)]) : (existing.exclusions ?? []);
    const nutrition = req.body.nutrition !== undefined ? req.body.nutrition : (existing.nutrition ?? null);
    const variants = req.body.variants !== undefined
      ? (Array.isArray(req.body.variants)
          ? req.body.variants
              .map((v: any) => ({
                id: String(v.id || createId("var")),
                name: String(v.name || "").trim(),
                price: Number(v.price || 0),
              }))
              .filter((v: any) => v.name)
          : [])
      : (existing.variants ?? []);
    const modifierGroupIds = req.body.modifierGroupIds !== undefined
      ? (Array.isArray(req.body.modifierGroupIds) ? req.body.modifierGroupIds.map((g: any) => String(g).trim()).filter(Boolean) : [])
      : (existing.modifierGroupIds ?? []);
    const disabledModifierGroupIds = req.body.disabledModifierGroupIds !== undefined
      ? (Array.isArray(req.body.disabledModifierGroupIds) ? req.body.disabledModifierGroupIds.map((g: any) => String(g).trim()).filter(Boolean) : [])
      : (existing.disabledModifierGroupIds ?? []);
    const availabilityType = req.body.availabilityType !== undefined
      ? (["ALWAYS", "OUT_OF_STOCK", "HIDDEN", "SCHEDULED", "SEASONAL"].includes(String(req.body.availabilityType))
          ? String(req.body.availabilityType)
          : "ALWAYS")
      : (existing.availabilityType ?? "ALWAYS");
    const availabilitySchedule = req.body.availabilitySchedule !== undefined
      ? (typeof req.body.availabilitySchedule === "object" && req.body.availabilitySchedule !== null ? req.body.availabilitySchedule : null)
      : (existing.availabilitySchedule ?? null);

    const value: Record<string, unknown> = {
      ...existing,
      ...body,
      addons,
      recommendedItemIds,
      isCombo,
      comboIncludes,
      isVegan,
      isJain,
      badge,
      isBestseller,
      isChefsPick,
      translations,
      spicyLevel,
      ingredients,
      allergens,
      exclusions,
      nutrition,
      variants,
      modifierGroupIds,
      disabledModifierGroupIds,
      availabilityType,
      availabilitySchedule,
      updatedAt: Date.now(),
    };
    const cleaned = cleanForFirebase(value);
    await ref.set(cleaned);
    await getDatabase().ref(`restaurants/${access.tenant.id}/items/${req.params.itemId}`).set(cleaned);
    res.json(itemView(req.params.itemId, cleaned));
  } catch (err: any) {
    console.error("Error updating menu item:", err);
    errorResponse(res, 500, err?.message || "Failed to update menu item", "INTERNAL_ERROR");
  }
});

router.delete("/restaurants/:restaurantSlug/menu-items/:itemId", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage");
  if (!access) return;
  const db = getDatabase();
  const rawItemId = req.params.itemId;

  const menuItemsRef = db.ref(`restaurants/${access.tenant.id}/menuItems/${rawItemId}`);
  const itemsRef = db.ref(`restaurants/${access.tenant.id}/items/${rawItemId}`);
  const [menuSnap, itemSnap] = await Promise.all([menuItemsRef.get(), itemsRef.get()]);

  let existing = (menuSnap.val() || itemSnap.val()) as Record<string, unknown> | null;
  let targetItemId = rawItemId;

  if (!existing) {
    // Check if itemId matches a slug in menuItems or items
    const allItemsSnap = await db.ref(`restaurants/${access.tenant.id}/menuItems`).get();
    const allItems = (allItemsSnap.val() ?? {}) as Record<string, any>;
    const match = Object.entries(allItems).find(
      ([id, val]) => id === rawItemId || val?.slug === rawItemId
    );
    if (match) {
      targetItemId = match[0];
      existing = match[1];
    }
  }

  if (!existing) {
    errorResponse(res, 404, "Menu item not found.", "ITEM_NOT_FOUND");
    return;
  }

  await Promise.all([
    db.ref(`restaurants/${access.tenant.id}/menuItems/${targetItemId}`).remove(),
    db.ref(`restaurants/${access.tenant.id}/items/${targetItemId}`).remove(),
  ]);

  createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "staff",
    actorRole: access.context.platformAdmin
      ? "platform_admin"
      : (access.context.memberships[access.tenant.id]?.role ?? "manager"),
    action: "MENU_ITEM_DELETED",
    resourceId: targetItemId,
    details: { itemName: existing.name },
  });

  res.status(200).json({ success: true });
});

// AI Menu Scan Usage & Plan Entitlement Status
router.get("/restaurants/:restaurantSlug/menu/ai-usage", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage");
  if (!access) return;

  const currentPlan = access.tenant.profile.plan || "starter";
  const hasEntitlement = canUseFeature(currentPlan, "ai_menu_extraction");

  if (!hasEntitlement) {
    res.json({
      success: true,
      allowed: false,
      requiresUpgrade: true,
      plan: currentPlan,
      dailyLimit: 3,
      usedToday: 0,
      remainingToday: 0,
      message: "Starter plan allows manual dish entry. Upgrade to Growth or Pro to use Snap to Menu AI scanning.",
    });
    return;
  }

  // Server-authoritative date calculation based on restaurant timezone
  const now = new Date();
  const timeZone = (access.tenant.profile as any)?.timezone || "Asia/Kolkata";
  let dateStr = "";
  try {
    dateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    dateStr = now.toISOString().slice(0, 10);
  }

  const db = getDatabase();
  const usageSnap = await db.ref(`restaurants/${access.tenant.id}/aiUsage/menuScans/${dateStr}/count`).get();
  const usedToday = Math.max(0, Number(usageSnap.val() || 0));
  const dailyLimit = 3;
  const remainingToday = Math.max(0, dailyLimit - usedToday);

  res.json({
    success: true,
    allowed: remainingToday > 0,
    requiresUpgrade: false,
    plan: currentPlan,
    dailyLimit,
    usedToday,
    remainingToday,
    date: dateStr,
  });
});

// AI Menu Extraction (Snap to Menu OCR & Document Extraction)
router.post("/restaurants/:restaurantSlug/menu/ai-extract", async (req, res) => {
  // 1. Plan Entitlement Verification (Server Authoritative)
  const access = await getTenantAccess(req, res, "manage", "ai_menu_extraction");
  if (!access) return;

  const currentPlan = access.tenant.profile.plan || "starter";
  const dailyLimit = 3;

  // 2. Server-Authoritative Effective Date
  const now = new Date();
  const timeZone = (access.tenant.profile as any)?.timezone || "Asia/Kolkata";
  let dateStr = "";
  try {
    dateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    dateStr = now.toISOString().slice(0, 10);
  }

  // 3. Pre-flight Daily Rate Limit Check (Do not call AI if limit reached)
  const db = getDatabase();
  const usageCountRef = db.ref(`restaurants/${access.tenant.id}/aiUsage/menuScans/${dateStr}/count`);
  const usageSnap = await usageCountRef.get();
  const currentCount = Math.max(0, Number(usageSnap.val() || 0));

  if (currentCount >= dailyLimit) {
    errorResponse(
      res,
      429,
      "Daily AI menu scan limit reached (3/3). Please try again tomorrow or enter items manually.",
      "DAILY_AI_LIMIT_REACHED",
      {
        dailyLimit,
        usedToday: currentCount,
        remainingToday: 0,
        resetDate: dateStr,
      }
    );
    return;
  }

  // 4. File Payload Validation
  const rawFiles = req.body.files;
  if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
    errorResponse(res, 400, "Please provide at least one menu photo or document file for extraction.", "MISSING_FILES");
    return;
  }

  if (rawFiles.length > 5) {
    errorResponse(res, 400, "Maximum 5 images allowed per menu scan session.", "TOO_MANY_FILES");
    return;
  }

  // Validate files format and size
  const sanitizedFiles: Array<{ data: string; mimeType: string; filename?: string }> = [];
  let totalBytes = 0;

  for (const f of rawFiles) {
    if (typeof f?.data === "string" && f.data.trim()) {
      const dataStr = f.data.trim();
      const rawData = dataStr.includes(",") ? dataStr.split(",")[1] : dataStr;
      const byteLength = Math.ceil((rawData.length * 3) / 4);
      totalBytes += byteLength;

      if (byteLength > 15 * 1024 * 1024) {
        errorResponse(res, 400, "One of the uploaded images exceeds the 15MB size limit. Please upload a smaller photo.", "FILE_TOO_LARGE");
        return;
      }

      sanitizedFiles.push({
        data: dataStr,
        mimeType: typeof f.mimeType === "string" ? f.mimeType : "image/jpeg",
        filename: typeof f.filename === "string" ? f.filename : undefined,
      });
    }
  }

  if (sanitizedFiles.length === 0) {
    errorResponse(res, 400, "No valid image data was received. Please select a photo of your menu.", "INVALID_FILES");
    return;
  }

  if (totalBytes > 25 * 1024 * 1024) {
    errorResponse(res, 400, "Total upload size exceeds 25MB. Please upload fewer images at once.", "PAYLOAD_TOO_LARGE");
    return;
  }

  try {
    // Fetch existing category names to guide AI catalog categorization
    const catSnap = await db.ref(`restaurants/${access.tenant.id}/categories`).get();
    const catData = (catSnap.val() ?? {}) as Record<string, { name?: string }>;
    const existingCategories = Object.values(catData)
      .map((c) => String(c.name || "").trim())
      .filter(Boolean);

    // 5. Execute Gemini AI Extraction Server-Side
    const result = await extractMenuFromDocuments({
      files: sanitizedFiles,
      currency: (access.tenant.profile as any)?.currency || "₹",
      existingCategories,
    });

    if (!result.extractedItems || result.extractedItems.length === 0) {
      errorResponse(
        res,
        400,
        "No readable menu dishes could be identified in this photo. Please ensure the menu text is sharp, in focus, and free of glare.",
        "NO_ITEMS_FOUND"
      );
      return;
    }

    // 6. Atomic Usage Consumption (Only consume when extraction legitimately succeeded)
    const txResult = await usageCountRef.transaction((current) => {
      const val = Number(current || 0);
      if (val >= dailyLimit) {
        // Abort if another request consumed the last slot concurrently
        return undefined;
      }
      return val + 1;
    });

    if (!txResult.committed) {
      errorResponse(
        res,
        429,
        "Daily AI menu scan limit reached (3/3). Please try again tomorrow or enter items manually.",
        "DAILY_AI_LIMIT_REACHED"
      );
      return;
    }

    const newCount = Number(txResult.snapshot.val() || currentCount + 1);
    const remainingScansToday = Math.max(0, dailyLimit - newCount);
    const scanId = `scan_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

    // Record scan audit and event log asynchronously
    db.ref(`restaurants/${access.tenant.id}/aiUsage/menuScans/${dateStr}/scans/${scanId}`).set({
      scanId,
      timestamp: Date.now(),
      itemCount: result.extractedItems.length,
      categoryCount: result.detectedCategories.length,
      fileCount: sanitizedFiles.length,
      actorUid: access.context.uid,
      actorEmail: access.context.email ?? "owner",
    }).catch((err) => console.warn("Could not save scan log:", err));

    createAuditLog(access.tenant.id, {
      actorId: access.context.uid,
      actorEmail: access.context.email ?? "staff",
      actorRole: access.context.platformAdmin
        ? "platform_admin"
        : (access.context.memberships[access.tenant.id]?.role ?? "manager"),
      action: "SNAP_TO_MENU_SCAN",
      resourceId: scanId,
      details: {
        itemCount: result.extractedItems.length,
        categoryCount: result.detectedCategories.length,
        remainingToday: remainingScansToday,
      },
    });

    res.json({
      success: true,
      scanId,
      remainingScansToday,
      dailyLimit,
      detectedCategories: result.detectedCategories,
      extractedItems: result.extractedItems,
      warningCount: result.warningCount,
    });
  } catch (err: any) {
    const rawMsg = String(err?.message || "");
    if (rawMsg.includes("IMAGE_EXTRACTION_UNAVAILABLE")) {
      errorResponse(
        res,
        400,
        "Image extraction is not configured yet. You can upload CSV/XLSX or a text-based PDF.",
        "IMAGE_EXTRACTION_UNAVAILABLE"
      );
      return;
    }
    errorResponse(
      res,
      500,
      err.message || "Failed to extract menu from document.",
      "EXTRACTION_FAILED"
    );
  }
});

// Bulk Menu Import
router.post("/restaurants/:restaurantSlug/menu/bulk-import", async (req, res) => {
  try {
    const access = await getTenantAccess(req, res, "manage", "bulk_menu_import");
    if (!access) return;

    const rawItems = req.body.items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      errorResponse(res, 400, "No menu items were provided to import.", "EMPTY_ITEMS");
      return;
    }

    const options = req.body.options || {};
    const autoCreateCategories = options.autoCreateCategories !== false;
    const globalDuplicateHandling = options.duplicateHandling || "skip"; // "skip" | "overwrite" | "create_anyway"
    const isReplaceMode = options.mode === "replace";

    const db = getDatabase();
    const [existingItemsSnap, existingCatsSnap] = await Promise.all([
      db.ref(`restaurants/${access.tenant.id}/menuItems`).get(),
      db.ref(`restaurants/${access.tenant.id}/categories`).get(),
    ]);

    const existingItemsData = (existingItemsSnap.val() ?? {}) as Record<string, any>;
    const existingCatsData = (existingCatsSnap.val() ?? {}) as Record<string, any>;

    // Build lookup maps
    const existingByName = new Map<string, { id: string; data: any }>();
    for (const [id, val] of Object.entries(existingItemsData)) {
      if (val?.name) {
        existingByName.set(String(val.name).trim().toLowerCase(), { id, data: val });
      }
    }

    const catMapByName = new Map<string, string>();
    for (const [id, val] of Object.entries(existingCatsData)) {
      if (val?.name && val.active !== false) {
        catMapByName.set(String(val.name).trim().toLowerCase(), id);
      }
    }

    const skippedItems: Array<{ name: string; reason: string; item: any }> = [];
    const itemsToSave: Array<{ id: string; value: any }> = [];
    const seenInBatch = new Set<string>();
    let categoriesCreatedCount = 0;
    let currentDisplayOrder = Object.keys(existingItemsData).length;

    // Plan menu items limit enforcement
    const limits = getPlanLimits(access.tenant.profile.plan);
    const initialCount = isReplaceMode ? 0 : Object.keys(existingItemsData).length;

    for (const raw of rawItems) {
      const name = String(raw.name || "").trim();
      if (!name) {
        skippedItems.push({ name: "Unnamed item", reason: "Missing item name", item: raw });
        continue;
      }

      // Check against maximum allowed menu items for current plan
      if (initialCount + itemsToSave.length >= limits.maxMenuItems) {
        skippedItems.push({
          name,
          reason: `Reached maximum menu item limit (${limits.maxMenuItems}) for ${access.tenant.profile.plan || "current"} plan. Upgrade to Pro for unlimited items.`,
          item: raw,
        });
        continue;
      }

      // Price validation: must be a valid non-negative number
      let price: number | null = null;
      if (typeof raw.price === "number" && !isNaN(raw.price) && raw.price >= 0) {
        price = raw.price;
      } else if (typeof raw.price === "string") {
        const parsed = parseFloat(raw.price.replace(/[^0-9.]/g, ""));
        if (!isNaN(parsed) && parsed >= 0) {
          price = parsed;
        }
      }

      if (price === null) {
        skippedItems.push({ name, reason: "Invalid or missing price", item: raw });
        continue;
      }

      const normName = name.toLowerCase();
      const duplicateHandling = raw.duplicateHandling || globalDuplicateHandling;

      // Check duplicate within the current import batch
      if (seenInBatch.has(normName) && !isReplaceMode) {
        if (duplicateHandling === "skip") {
          skippedItems.push({ name, reason: "Duplicate item in current import batch", item: raw });
          continue;
        }
      }
      seenInBatch.add(normName);

      // Check duplicate against existing database items
      const existingMatch = existingByName.get(normName);
      let targetItemId: string = createId("item");
      if (existingMatch && !isReplaceMode) {
        if (duplicateHandling === "skip") {
          skippedItems.push({ name, reason: "Dish already exists in restaurant menu", item: raw });
          continue;
        } else if (duplicateHandling === "overwrite") {
          targetItemId = existingMatch.id;
        }
      }

      // Category resolution
      const categoryName = String(raw.categoryName || raw.category || raw.section || "General").trim() || "General";
      const normCat = categoryName.toLowerCase();
      let categoryId = catMapByName.get(normCat);

      if (!categoryId) {
        if (autoCreateCategories) {
          categoryId = createId("cat");
          const newCatVal = cleanForFirebase({
            id: categoryId,
            name: categoryName,
            description: "Imported menu section",
            displayOrder: Object.keys(existingCatsData).length + categoriesCreatedCount,
            active: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          await db.ref(`restaurants/${access.tenant.id}/categories/${categoryId}`).set(newCatVal);
          catMapByName.set(normCat, categoryId);
          categoriesCreatedCount++;
        } else {
          skippedItems.push({ name, reason: `Category "${categoryName}" does not exist`, item: raw });
          continue;
        }
      }

      const allergens = Array.isArray(raw.allergens)
        ? raw.allergens.map((a: unknown) => String(a).trim()).filter(Boolean)
        : typeof raw.allergens === "string" && raw.allergens.trim()
        ? raw.allergens.split(",").map((a: string) => a.trim()).filter(Boolean)
        : [];

      let spicyLevel = undefined;
      if (raw.spicyLevel && ["NONE", "MILD", "MEDIUM", "HOT", "EXTRA_HOT"].includes(String(raw.spicyLevel).toUpperCase())) {
        spicyLevel = String(raw.spicyLevel).toUpperCase();
      }

      const nutrition =
        raw.nutrition && typeof raw.nutrition === "object"
          ? cleanForFirebase({
              calories: typeof raw.nutrition.calories === "number" ? raw.nutrition.calories : null,
              protein: typeof raw.nutrition.protein === "number" ? raw.nutrition.protein : null,
              carbohydrates: typeof raw.nutrition.carbohydrates === "number" ? raw.nutrition.carbohydrates : null,
              fats: typeof raw.nutrition.fats === "number" ? raw.nutrition.fats : null,
            })
          : null;

      // Dietary parsing
      let isVeg = true;
      if (typeof raw.veg === "boolean") {
        isVeg = raw.veg;
      } else if (typeof raw.veg === "string") {
        const v = raw.veg.toLowerCase();
        if (v.includes("non") || v.includes("meat") || v.includes("chicken") || v === "n" || v === "egg") {
          isVeg = false;
        }
      }

      const menuItemValue = cleanForFirebase({
        id: targetItemId,
        name,
        categoryId,
        price,
        description: typeof raw.description === "string" ? raw.description.trim() : "",
        imageUrl: typeof raw.imageUrl === "string" && raw.imageUrl ? raw.imageUrl : null,
        available: raw.available !== false,
        displayOrder: currentDisplayOrder++,
        veg: isVeg,
        isVegan: Boolean(raw.isVegan),
        isJain: Boolean(raw.isJain),
        spicyLevel: spicyLevel || null,
        ingredients: typeof raw.ingredients === "string" && raw.ingredients.trim() ? raw.ingredients.trim() : null,
        allergens,
        nutrition: nutrition || null,
        addons: Array.isArray(raw.addons) ? raw.addons : [],
        recommendedItemIds: Array.isArray(raw.recommendedItemIds) ? raw.recommendedItemIds : [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      itemsToSave.push({ id: targetItemId, value: menuItemValue });
    }

    // If replace mode, clear existing menuItems first
    if (isReplaceMode && itemsToSave.length > 0) {
      await db.ref(`restaurants/${access.tenant.id}/menuItems`).set(null);
      await db.ref(`restaurants/${access.tenant.id}/items`).set(null);
    }

    // Persist all approved items into Realtime Database
    const updates: Record<string, any> = {};
    for (const item of itemsToSave) {
      updates[`restaurants/${access.tenant.id}/menuItems/${item.id}`] = item.value;
      updates[`restaurants/${access.tenant.id}/items/${item.id}`] = item.value;
    }

    if (Object.keys(updates).length > 0) {
      const cleanedUpdates = cleanForFirebase(updates);
      await db.ref().update(cleanedUpdates);
    }

    // Audit Log Entry
    createAuditLog(access.tenant.id, {
      actorId: access.context.uid,
      actorEmail: access.context.email ?? "staff",
      actorRole: access.context.platformAdmin
        ? "platform_admin"
        : (access.context.memberships[access.tenant.id]?.role ?? "manager"),
      action: "BULK_MENU_IMPORT",
      resourceId: access.tenant.id,
      details: {
        importedCount: itemsToSave.length,
        categoriesCreated: categoriesCreatedCount,
        skippedCount: skippedItems.length,
      },
    });

    // Save to import history
    const importHistoryId = createId("imp");
    await db.ref(`restaurants/${access.tenant.id}/importHistory/${importHistoryId}`).set(cleanForFirebase({
      id: importHistoryId,
      timestamp: Date.now(),
      importedCount: itemsToSave.length,
      categoriesCreated: categoriesCreatedCount,
      skippedCount: skippedItems.length,
      fileName: typeof options.fileName === "string" ? options.fileName : "Manual Import",
      sourceType: typeof options.sourceType === "string" ? options.sourceType : "bulk",
    }));

    res.json({
      success: true,
      importedCount: itemsToSave.length,
      categoriesCreated: categoriesCreatedCount,
      skippedCount: skippedItems.length,
      skippedItems,
    });
  } catch (err: any) {
    console.error("Bulk menu import error:", err);
    errorResponse(
      res,
      500,
      `Failed to commit import into database: ${err?.message || String(err)}`,
      "BULK_IMPORT_COMMIT_FAILED"
    );
  }
});

// ==========================================
// MODIFIER GROUPS (Reusable Modifiers)
// ==========================================

router.get("/restaurants/:restaurantSlug/modifier-groups", async (req, res) => {
  const access = await getTenantAccess(req, res, "read");
  if (!access) return;
  const snapshot = await getDatabase().ref(`restaurants/${access.tenant.id}/modifierGroups`).get();
  const data = (snapshot.val() ?? {}) as Record<string, Record<string, unknown>>;
  res.json(Object.entries(data).map(([id, value]) => modifierGroupView(id, value)));
});

router.post("/restaurants/:restaurantSlug/modifier-groups", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage", "variants_modifiers");
  if (!access) return;
  const name = String(req.body.name ?? "").trim();
  if (!name) {
    errorResponse(res, 400, "Modifier group name is required.", "MISSING_NAME");
    return;
  }

  const id = createId("modgrp");
  const options = Array.isArray(req.body.options)
    ? req.body.options.map((opt: any, idx: number) => {
        const priceAdj = Math.max(0, Number(opt.priceAdjustment !== undefined ? opt.priceAdjustment : (opt.price || 0)));
        return {
          id: String(opt.id || createId("opt")),
          name: String(opt.name || "").trim(),
          priceAdjustment: priceAdj,
          price: priceAdj,
          available: opt.available !== false,
          isDefault: Boolean(opt.isDefault),
        };
      }).filter((opt: any) => opt.name)
    : [];

  const minSelections = Number(req.body.minSelections ?? (req.body.required ? 1 : 0));
  const maxSelections = Math.max(1, Number(req.body.maxSelections ?? (req.body.selectionType === "single" ? 1 : 1)));
  const selectionType = String(req.body.selectionType || (maxSelections > 1 ? "multiple" : "single"));

  const value = {
    name,
    description: String(req.body.description ?? "").trim(),
    selectionType,
    required: req.body.required === true || minSelections > 0,
    minSelections,
    maxSelections,
    options,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await getDatabase().ref(`restaurants/${access.tenant.id}/modifierGroups/${id}`).set(value);
  res.status(201).json(modifierGroupView(id, value));
});

router.patch("/restaurants/:restaurantSlug/modifier-groups/:groupId", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage", "variants_modifiers");
  if (!access) return;
  const ref = getDatabase().ref(`restaurants/${access.tenant.id}/modifierGroups/${req.params.groupId}`);
  const snap = await ref.get();
  if (!snap.exists()) {
    errorResponse(res, 404, "Modifier group not found.", "NOT_FOUND");
    return;
  }
  const existing = snap.val() as Record<string, any>;

  const options = req.body.options !== undefined
    ? (Array.isArray(req.body.options)
        ? req.body.options.map((opt: any, idx: number) => {
            const priceAdj = Math.max(0, Number(opt.priceAdjustment !== undefined ? opt.priceAdjustment : (opt.price || 0)));
            return {
              id: String(opt.id || createId("opt")),
              name: String(opt.name || "").trim(),
              priceAdjustment: priceAdj,
              price: priceAdj,
              available: opt.available !== false,
              isDefault: Boolean(opt.isDefault),
            };
          }).filter((opt: any) => opt.name)
        : [])
    : existing.options;

  const minSelections = req.body.minSelections !== undefined ? Number(req.body.minSelections) : existing.minSelections;
  const maxSelections = req.body.maxSelections !== undefined ? Number(req.body.maxSelections) : existing.maxSelections;
  const selectionType = req.body.selectionType !== undefined
    ? String(req.body.selectionType)
    : (existing.selectionType || (maxSelections > 1 ? "multiple" : "single"));

  const value = {
    ...existing,
    name: req.body.name !== undefined ? String(req.body.name).trim() : existing.name,
    description: req.body.description !== undefined ? String(req.body.description).trim() : existing.description,
    selectionType,
    required: req.body.required !== undefined ? Boolean(req.body.required) : existing.required,
    minSelections,
    maxSelections,
    options,
    updatedAt: Date.now(),
  };

  await ref.set(value);
  res.json(modifierGroupView(req.params.groupId, value));
});

router.delete("/restaurants/:restaurantSlug/modifier-groups/:groupId", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage", "variants_modifiers");
  if (!access) return;
  await getDatabase().ref(`restaurants/${access.tenant.id}/modifierGroups/${req.params.groupId}`).remove();
  res.status(204).end();
});

// ==========================================
// BULK EDIT MENU ITEMS
// ==========================================

router.post("/restaurants/:restaurantSlug/menu/bulk-edit", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage");
  if (!access) return;

  const { itemIds, action, payload } = req.body ?? {};
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    errorResponse(res, 400, "Please select at least one menu item to edit.", "EMPTY_SELECTION");
    return;
  }

  const db = getDatabase();
  const itemsSnap = await db.ref(`restaurants/${access.tenant.id}/menuItems`).get();
  const allItems = (itemsSnap.val() ?? {}) as Record<string, any>;

  const updates: Record<string, any> = {};
  const changedSummary: Array<{ id: string; name: string; change: string }> = [];

  for (const id of itemIds) {
    const item = allItems[id];
    if (!item) continue;

    if (action === "CHANGE_CATEGORY") {
      const targetCatId = String(payload?.categoryId ?? "");
      if (!targetCatId) continue;
      updates[`restaurants/${access.tenant.id}/menuItems/${id}/categoryId`] = targetCatId;
      updates[`restaurants/${access.tenant.id}/menuItems/${id}/updatedAt`] = Date.now();
      changedSummary.push({ id, name: item.name, change: `Category -> ${targetCatId}` });
    } else if (action === "CHANGE_PRICE") {
      const mode = String(payload?.mode ?? "SET");
      const val = Number(payload?.value ?? 0);
      const currentPrice = Number(item.price || 0);
      let newPrice = currentPrice;

      if (mode === "SET") {
        newPrice = Math.max(0, val);
      } else if (mode === "INCREASE_PERCENT") {
        newPrice = Math.max(0, Math.round(currentPrice * (1 + val / 100)));
      } else if (mode === "DECREASE_PERCENT") {
        newPrice = Math.max(0, Math.round(currentPrice * (1 - val / 100)));
      } else if (mode === "INCREASE_FIXED") {
        newPrice = Math.max(0, currentPrice + val);
      } else if (mode === "DECREASE_FIXED") {
        newPrice = Math.max(0, currentPrice - val);
      }

      // Also adjust variants proportionally if present
      if (Array.isArray(item.variants) && item.variants.length > 0) {
        const updatedVariants = item.variants.map((v: any) => {
          const vp = Number(v.price || 0);
          let newVp = vp;
          if (mode === "SET") newVp = Math.max(0, val);
          else if (mode === "INCREASE_PERCENT") newVp = Math.max(0, Math.round(vp * (1 + val / 100)));
          else if (mode === "DECREASE_PERCENT") newVp = Math.max(0, Math.round(vp * (1 - val / 100)));
          else if (mode === "INCREASE_FIXED") newVp = Math.max(0, vp + val);
          else if (mode === "DECREASE_FIXED") newVp = Math.max(0, vp - val);
          return { ...v, price: newVp };
        });
        updates[`restaurants/${access.tenant.id}/menuItems/${id}/variants`] = updatedVariants;
      }

      updates[`restaurants/${access.tenant.id}/menuItems/${id}/price`] = newPrice;
      updates[`restaurants/${access.tenant.id}/menuItems/${id}/updatedAt`] = Date.now();
      changedSummary.push({ id, name: item.name, change: `Price: ${currentPrice} -> ${newPrice}` });
    } else if (action === "SET_AVAILABILITY") {
      const availType = String(payload?.availabilityType ?? "ALWAYS");
      const isAvailable = payload?.available !== undefined ? Boolean(payload.available) : availType !== "OUT_OF_STOCK" && availType !== "HIDDEN";
      updates[`restaurants/${access.tenant.id}/menuItems/${id}/availabilityType`] = availType;
      updates[`restaurants/${access.tenant.id}/menuItems/${id}/available`] = isAvailable;
      if (payload?.schedule) {
        updates[`restaurants/${access.tenant.id}/menuItems/${id}/availabilitySchedule`] = payload.schedule;
      }
      updates[`restaurants/${access.tenant.id}/menuItems/${id}/updatedAt`] = Date.now();
      changedSummary.push({ id, name: item.name, change: `Availability: ${availType}` });
    } else if (action === "SET_DIETARY") {
      if (payload?.veg !== undefined) updates[`restaurants/${access.tenant.id}/menuItems/${id}/veg`] = Boolean(payload.veg);
      if (payload?.isVegan !== undefined) updates[`restaurants/${access.tenant.id}/menuItems/${id}/isVegan`] = Boolean(payload.isVegan);
      if (payload?.isJain !== undefined) updates[`restaurants/${access.tenant.id}/menuItems/${id}/isJain`] = Boolean(payload.isJain);
      updates[`restaurants/${access.tenant.id}/menuItems/${id}/updatedAt`] = Date.now();
      changedSummary.push({ id, name: item.name, change: `Dietary flags updated` });
    } else if (action === "DELETE") {
      updates[`restaurants/${access.tenant.id}/menuItems/${id}/available`] = false;
      updates[`restaurants/${access.tenant.id}/menuItems/${id}/availabilityType`] = "OUT_OF_STOCK";
      updates[`restaurants/${access.tenant.id}/menuItems/${id}/updatedAt`] = Date.now();
      changedSummary.push({ id, name: item.name, change: `Marked deleted/out of stock` });
    }
  }

  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates);
  }

  createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "staff",
    actorRole: access.context.platformAdmin ? "platform_admin" : (access.context.memberships[access.tenant.id]?.role ?? "manager"),
    action: "BULK_MENU_EDIT" as any,
    resourceId: access.tenant.id,
    details: {
      action,
      itemCount: changedSummary.length,
      items: changedSummary.slice(0, 10),
    },
  });

  res.json({
    success: true,
    affectedCount: changedSummary.length,
    changes: changedSummary,
  });
});

// ==========================================
// BULK IMAGE UPLOAD
// ==========================================

router.post("/restaurants/:restaurantSlug/menu/bulk-upload-images", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage");
  if (!access) return;

  const rawImages = req.body?.images;
  if (!Array.isArray(rawImages) || rawImages.length === 0) {
    errorResponse(res, 400, "Please provide image files to upload.", "NO_IMAGES");
    return;
  }

  if (rawImages.length > 50) {
    errorResponse(res, 400, "Maximum 50 images permitted per bulk upload batch.", "TOO_MANY_IMAGES");
    return;
  }

  const db = getDatabase();
  const itemsSnap = await db.ref(`restaurants/${access.tenant.id}/menuItems`).get();
  const allItems = (itemsSnap.val() ?? {}) as Record<string, any>;

  // Build name index
  const itemByName = new Map<string, { id: string; name: string }>();
  for (const [id, val] of Object.entries(allItems)) {
    if (val?.name) {
      itemByName.set(String(val.name).trim().toLowerCase(), { id, name: String(val.name) });
    }
  }

  const updates: Record<string, any> = {};
  const matched: Array<{ filename: string; itemId: string; itemName: string }> = [];
  const unmatched: Array<{ filename: string; reason?: string }> = [];

  const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);
  const DATA_URI_REGEX = /^data:image\/(jpeg|png|webp|gif|avif);base64,/i;
  const MAX_BASE64_BYTES = 7 * 1024 * 1024; // ~5MB decoded

  for (const img of rawImages) {
    let filename = String(img.filename || "").trim();
    // Path traversal and control character sanitization
    filename = filename.replace(/[\/\\]/g, "_").replace(/\0/g, "").replace(/\.\.+/g, ".");
    const data = String(img.data || "").trim();
    if (!data) continue;

    // Validate file extension
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    if (filename && !ALLOWED_EXTENSIONS.has(ext)) {
      unmatched.push({ filename, reason: "Unsupported file extension. Allowed: jpg, jpeg, png, webp, gif, avif" });
      continue;
    }

    // Validate image data format
    const isDataUri = data.startsWith("data:");
    const isHttpUrl = data.startsWith("https://") || data.startsWith("http://");

    if (isDataUri) {
      if (!DATA_URI_REGEX.test(data)) {
        unmatched.push({ filename, reason: "Invalid image MIME type. Only JPEG, PNG, WEBP, GIF, and AVIF are allowed." });
        continue;
      }
      if (data.length > MAX_BASE64_BYTES) {
        unmatched.push({ filename, reason: "Image exceeds 5MB maximum file size." });
        continue;
      }
    } else if (!isHttpUrl) {
      unmatched.push({ filename, reason: "Invalid image source. Must be a valid image data URI or web URL." });
      continue;
    }

    let targetItemId = typeof img.targetItemId === "string" ? img.targetItemId : undefined;

    if (!targetItemId && filename) {
      // Clean filename into search term (e.g., "paneer_butter_masala_1.jpg" -> "paneer butter masala")
      const cleanName = filename
        .replace(/\.[a-zA-Z0-9]+$/, "")
        .replace(/[_-]+/g, " ")
        .replace(/\d+$/, "")
        .trim()
        .toLowerCase();

      // Look for exact or contains match
      let match = itemByName.get(cleanName);
      if (!match) {
        for (const [nameKey, val] of itemByName.entries()) {
          if (nameKey.includes(cleanName) || cleanName.includes(nameKey)) {
            match = val;
            break;
          }
        }
      }
      if (match) {
        targetItemId = match.id;
      }
    }

    if (targetItemId && allItems[targetItemId]) {
      updates[`restaurants/${access.tenant.id}/menuItems/${targetItemId}/imageUrl`] = data;
      updates[`restaurants/${access.tenant.id}/menuItems/${targetItemId}/updatedAt`] = Date.now();
      matched.push({
        filename,
        itemId: targetItemId,
        itemName: allItems[targetItemId].name,
      });
    } else {
      unmatched.push({ filename, reason: "No matching menu item found" });
    }
  }

  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates);
  }

  res.json({
    success: true,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    matched,
    unmatched,
  });
});

// ==========================================
// AI MENU CLEANUP AUDIT
// ==========================================

router.post("/restaurants/:restaurantSlug/menu/ai-cleanup", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage", "ai_menu_cleanup");
  if (!access) return;

  try {
    const db = getDatabase();
    const [itemsSnap, catsSnap] = await Promise.all([
      db.ref(`restaurants/${access.tenant.id}/menuItems`).get(),
      db.ref(`restaurants/${access.tenant.id}/categories`).get(),
    ]);

    const itemsData = (itemsSnap.val() ?? {}) as Record<string, any>;
    const catsData = (catsSnap.val() ?? {}) as Record<string, any>;

    const catNameMap = new Map<string, string>();
    for (const [id, c] of Object.entries(catsData)) {
      if (c?.name) catNameMap.set(id, String(c.name));
    }

    const items = Object.entries(itemsData).map(([id, val]) => ({
      id,
      name: String(val.name || ""),
      categoryName: catNameMap.get(val.categoryId) || "General",
      description: String(val.description || ""),
      price: Number(val.price || 0),
      veg: val.veg === true,
      ingredients: val.ingredients ? String(val.ingredients) : undefined,
    }));

    const categories = Object.entries(catsData).map(([id, c]: [string, any]) => ({
      id,
      name: String(c?.name || ""),
    }));

    const result = await cleanUpMenuWithAi({
      restaurantName: (access.tenant.profile as any)?.name || "Restaurant",
      currency: (access.tenant.profile as any)?.currency || "₹",
      items,
      categories,
    });

    res.json(result);
  } catch (err: any) {
    errorResponse(res, 500, err.message || "Failed to run AI menu cleanup.", "CLEANUP_FAILED");
  }
});

// ==========================================
// AI DISH DESCRIPTION GENERATION
// ==========================================

router.post("/restaurants/:restaurantSlug/menu/ai-generate-description", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage", "ai_menu_descriptions");
  if (!access) return;

  const itemName = req.body?.itemName || req.body?.dishName;
  const categoryName = req.body?.categoryName || req.body?.category;
  const ingredients = req.body?.ingredients;
  const veg = req.body?.veg;
  const spicyLevel = req.body?.spicyLevel;
  if (!itemName) {
    errorResponse(res, 400, "Item name is required to generate description.", "MISSING_NAME");
    return;
  }

  try {
    const description = await generateDishDescription({
      dishName: String(itemName),
      categoryName: String(categoryName || "Specialties"),
      ingredients: typeof ingredients === "string" ? ingredients : undefined,
      veg: Boolean(veg),
      spicyLevel: typeof spicyLevel === "string" ? spicyLevel : undefined,
    });

    res.json({ description });
  } catch (err: any) {
    errorResponse(res, 500, err.message || "Failed to generate description.", "GENERATION_FAILED");
  }
});

// ==========================================
// MENU DRAFTS WORKFLOW
// ==========================================

router.get("/restaurants/:restaurantSlug/menu/drafts", async (req, res) => {
  const access = await getTenantAccess(req, res, "read");
  if (!access) return;
  const snapshot = await getDatabase().ref(`restaurants/${access.tenant.id}/menuDrafts`).get();
  const data = (snapshot.val() ?? {}) as Record<string, any>;
  res.json(Object.entries(data).map(([id, val]) => ({ id, ...val })));
});

router.post("/restaurants/:restaurantSlug/menu/drafts", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage");
  if (!access) return;

  const rawDrafts = req.body?.drafts;
  if (!Array.isArray(rawDrafts) || rawDrafts.length === 0) {
    errorResponse(res, 400, "No draft items provided.", "EMPTY_DRAFTS");
    return;
  }

  const db = getDatabase();
  const updates: Record<string, any> = {};
  for (const draft of rawDrafts) {
    const draftId = draft.id || createId("draft");
    updates[`restaurants/${access.tenant.id}/menuDrafts/${draftId}`] = {
      ...draft,
      id: draftId,
      updatedAt: Date.now(),
    };
  }

  await db.ref().update(updates);
  res.json({ success: true, count: rawDrafts.length });
});

router.post("/restaurants/:restaurantSlug/menu/drafts/publish", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage");
  if (!access) return;

  const db = getDatabase();
  const draftsSnap = await db.ref(`restaurants/${access.tenant.id}/menuDrafts`).get();
  const drafts = (draftsSnap.val() ?? {}) as Record<string, any>;

  if (Object.keys(drafts).length === 0) {
    errorResponse(res, 400, "No pending drafts to publish.", "NO_DRAFTS");
    return;
  }

  const updates: Record<string, any> = {};
  let publishedCount = 0;

  for (const [draftId, draft] of Object.entries(drafts)) {
    const itemId = draft.targetItemId || draftId;
    const itemValue = {
      ...draft,
      id: undefined,
      targetItemId: undefined,
      updatedAt: Date.now(),
    };
    updates[`restaurants/${access.tenant.id}/menuItems/${itemId}`] = itemValue;
    updates[`restaurants/${access.tenant.id}/menuDrafts/${draftId}`] = null; // remove draft
    publishedCount++;
  }

  await db.ref().update(updates);

  createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "staff",
    actorRole: access.context.platformAdmin ? "platform_admin" : (access.context.memberships[access.tenant.id]?.role ?? "manager"),
    action: "MENU_DRAFTS_PUBLISHED" as any,
    resourceId: access.tenant.id,
    details: { publishedCount },
  });

  res.json({ success: true, publishedCount });
});

router.post("/restaurants/:restaurantSlug/menu/drafts/discard", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage");
  if (!access) return;

  await getDatabase().ref(`restaurants/${access.tenant.id}/menuDrafts`).remove();
  res.json({ success: true });
});

// ==========================================
// MENU CHANGE HISTORY & IMPORT HISTORY
// ==========================================

router.get("/restaurants/:restaurantSlug/menu/history", async (req, res) => {
  const access = await getTenantAccess(req, res, "read");
  if (!access) return;

  const db = getDatabase();
  const [logsSnap, importsSnap] = await Promise.all([
    db.ref(`restaurants/${access.tenant.id}/auditLogs`).limitToLast(50).get(),
    db.ref(`restaurants/${access.tenant.id}/importHistory`).limitToLast(20).get(),
  ]);

  const rawLogs = (logsSnap.val() ?? {}) as Record<string, any>;
  const rawImports = (importsSnap.val() ?? {}) as Record<string, any>;

  const menuActions = [
    "MENU_PRICE_CHANGED",
    "ITEM_AVAILABILITY_CHANGED",
    "MENU_ITEM_DELETED",
    "BULK_MENU_IMPORT",
    "BULK_MENU_EDIT",
    "MENU_DRAFTS_PUBLISHED",
  ];

  const auditHistory = Object.entries(rawLogs)
    .map(([id, val]) => ({ id, ...val }))
    .filter((entry) => menuActions.includes(entry.action))
    .sort((a, b) => b.timestamp - a.timestamp);

  const importHistory = Object.entries(rawImports)
    .map(([id, val]) => ({ id, ...val }))
    .sort((a, b) => b.timestamp - a.timestamp);

  res.json({
    auditHistory,
    importHistory,
  });
});

// ==========================================
// ITEM PERFORMANCE & ANALYTICS
// ==========================================

router.get("/restaurants/:restaurantSlug/menu/item-performance", async (req, res) => {
  const access = await getTenantAccess(req, res, "read");
  if (!access) return;

  const db = getDatabase();
  const [ordersSnap, itemsSnap] = await Promise.all([
    db.ref(`restaurants/${access.tenant.id}/orders`).limitToLast(300).get(),
    db.ref(`restaurants/${access.tenant.id}/menuItems`).get(),
  ]);

  const orders = Object.values((ordersSnap.val() ?? {}) as Record<string, any>);
  const items = (itemsSnap.val() ?? {}) as Record<string, any>;

  const performanceMap: Record<string, {
    totalQuantity: number;
    totalRevenue: number;
    orderCount: number;
    lastOrderedAt: number | null;
  }> = {};

  for (const id of Object.keys(items)) {
    performanceMap[id] = {
      totalQuantity: 0,
      totalRevenue: 0,
      orderCount: 0,
      lastOrderedAt: null,
    };
  }

  for (const order of orders) {
    if (order.status === "CANCELLED") continue;
    const orderTime = new Date(order.createdAt).getTime();
    if (Array.isArray(order.items)) {
      for (const it of order.items) {
        const menuItemId = it.menuItemId;
        if (menuItemId && performanceMap[menuItemId]) {
          performanceMap[menuItemId].totalQuantity += Number(it.quantity || 1);
          performanceMap[menuItemId].totalRevenue += Number(it.subtotal || 0);
          performanceMap[menuItemId].orderCount += 1;
          if (!performanceMap[menuItemId].lastOrderedAt || orderTime > (performanceMap[menuItemId].lastOrderedAt || 0)) {
            performanceMap[menuItemId].lastOrderedAt = orderTime;
          }
        }
      }
    }
  }

  res.json({ performance: performanceMap });
});

router.get("/restaurants/:restaurantSlug/tables", async (req, res) => {
  const access = await getTenantAccess(req, res, "read");
  if (!access) return;
  const db = getDatabase();
  const [tablesSnap, sessionsSnap, ordersSnap] = await Promise.all([
    db.ref(`restaurants/${access.tenant.id}/tables`).get(),
    db.ref(`restaurants/${access.tenant.id}/tableSessions`).get(),
    db.ref(`restaurants/${access.tenant.id}/orders`).limitToLast(150).get(),
  ]);

  const rawTables = (tablesSnap.val() ?? {}) as Record<string, Record<string, unknown>>;
  const rawSessions = (sessionsSnap.val() ?? {}) as Record<string, any>;
  const rawOrders = (ordersSnap.val() ?? {}) as Record<string, any>;

  const response = Object.entries(rawTables)
    .filter(([, val]) => !(val as any)?.deleted)
    .map(([id, value]) => {
      const view = tableView(id, value, requestBaseUrl(req), req.params.restaurantSlug);

      // Find active session for this table
      let activeSession: any = null;
      if (value.activeSessionId && rawSessions[String(value.activeSessionId)]?.status === "ACTIVE") {
        activeSession = rawSessions[String(value.activeSessionId)];
      } else {
        const found = Object.values(rawSessions).find(
          (s: any) => s && s.tableId === id && s.status === "ACTIVE"
        );
        if (found) {
          activeSession = found;
        }
      }

      let activeOrderCount = 0;
      let totalSessionAmount = 0;
      let sessionDurationMinutes = 0;
      if (activeSession) {
        const sessionOrders = Object.values(rawOrders).filter(
          (o: any) => o && o.sessionId === activeSession.id && o.status !== "CANCELLED" && o.status !== "DECLINED"
        );
        activeOrderCount = sessionOrders.length;
        totalSessionAmount = sessionOrders.reduce((sum: number, o: any) => sum + Number(o.total || o.totalAmount || 0), 0);

        if (activeSession.createdAt) {
          const start = typeof activeSession.createdAt === "number" ? activeSession.createdAt : new Date(activeSession.createdAt).getTime();
          sessionDurationMinutes = Math.max(0, Math.floor((Date.now() - start) / 60000));
        }
      }

      const tableStatus = value.active === false
        ? "DEACTIVATED"
        : activeSession
        ? "OCCUPIED"
        : "AVAILABLE";

      return {
        ...view,
        location: value.location ? String(value.location) : null,
        status: tableStatus,
        activeOrdersCount: activeOrderCount,
        sessionDurationMinutes: activeSession ? sessionDurationMinutes : undefined,
        activeSession: activeSession ? {
          id: activeSession.id,
          createdAt: activeSession.createdAt,
          orderCount: activeOrderCount,
          totalAmount: Math.round(totalSessionAmount * 100) / 100,
          sessionDurationMinutes,
        } : null,
      };
    });

  res.json(response);
});

router.post("/restaurants/:restaurantSlug/tables", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage");
  if (!access) return;

  // Enforce plan tables limit
  const limits = getPlanLimits(access.tenant.profile.plan);
  const tablesSnap = await getDatabase().ref(`restaurants/${access.tenant.id}/tables`).get();
  const rawTables = tablesSnap.exists() ? (tablesSnap.val() ?? {}) : {};
  const currentActiveTables = Object.values(rawTables).filter((t: any) => t && t.active !== false && !t.deleted).length;
  if (currentActiveTables >= limits.maxTables) {
    errorResponse(
      res,
      403,
      `Your current plan (${access.tenant.profile.plan || "starter"}) allows up to ${limits.maxTables} active tables. Please upgrade your subscription to add more tables.`,
      "PLAN_LIMITATION"
    );
    return;
  }

  const body = parsedBody(CreateTableBody, req.body, res);
  if (!body) return;

  const trimmedTableNumber = body.tableNumber.trim();
  const rawLocation = typeof req.body.location === "string" ? req.body.location.trim() : null;

  // Check unique table number within the same restaurant
  const duplicate = Object.entries(rawTables).find(([, t]: [string, any]) => {
    return t && !t.deleted && String(t.tableNumber || "").trim().toLowerCase() === trimmedTableNumber.toLowerCase();
  });
  if (duplicate) {
    errorResponse(
      res,
      400,
      `Table number "${trimmedTableNumber}" already exists in your restaurant. Each table must have a unique number or name.`,
      "DUPLICATE_TABLE_NUMBER"
    );
    return;
  }

  const id = createId("table");
  const tableSlug = `table-${trimmedTableNumber.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}-${id.slice(-4).toLowerCase()}`;
  const qrToken = crypto.randomBytes(16).toString("hex");
  const pin = randomPin();
  const now = Date.now();
  const value = {
    id,
    tableNumber: trimmedTableNumber,
    location: rawLocation || null,
    slug: tableSlug,
    qrToken,
    active: body.active !== false,
    status: "AVAILABLE",
    activeSessionId: null,
    pinHash: await hashPin(pin),
    createdAt: now,
    updatedAt: now,
  };
  await getDatabase().ref(`restaurants/${access.tenant.id}/tables/${id}`).set(value);
  res.status(201).json({ ...tableView(id, value, requestBaseUrl(req), req.params.restaurantSlug), pin });
});

router.patch("/restaurants/:restaurantSlug/tables/:tableId", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage");
  if (!access) return;
  const body = parsedBody(UpdateTableBody, req.body, res);
  if (!body) return;
  const db = getDatabase();
  const ref = db.ref(`restaurants/${access.tenant.id}/tables/${req.params.tableId}`);
  const snapshot = await ref.get();
  const existing = snapshot.val() as Record<string, unknown> | null;
  if (!existing) {
    errorResponse(res, 404, "Table not found.", "TABLE_NOT_FOUND");
    return;
  }

  const tablesSnap = await db.ref(`restaurants/${access.tenant.id}/tables`).get();
  const rawTables = tablesSnap.exists() ? (tablesSnap.val() ?? {}) : {};

  // Check unique table number if renaming
  if (body.tableNumber) {
    const trimmedNum = body.tableNumber.trim();
    const duplicate = Object.entries(rawTables).find(([tId, t]: [string, any]) => {
      return tId !== req.params.tableId && t && !t.deleted && String(t.tableNumber || "").trim().toLowerCase() === trimmedNum.toLowerCase();
    });
    if (duplicate) {
      errorResponse(
        res,
        400,
        `Table number "${trimmedNum}" is already used by another table.`,
        "DUPLICATE_TABLE_NUMBER"
      );
      return;
    }
  }

  // If reactivating an inactive table, enforce plan active table limit
  if (body.active === true && existing.active === false) {
    const limits = getPlanLimits(access.tenant.profile.plan);
    const currentActiveTables = Object.values(rawTables).filter(
      (t: any) => t && t.active !== false && !t.deleted && t.id !== req.params.tableId
    ).length;
    if (currentActiveTables >= limits.maxTables) {
      errorResponse(
        res,
        403,
        `Cannot activate table. Your current plan (${access.tenant.profile.plan || "starter"}) allows up to ${limits.maxTables} active tables. Please deactivate another table or upgrade your subscription.`,
        "PLAN_LIMITATION"
      );
      return;
    }
  }

  const value: Record<string, unknown> = { ...existing, ...body, updatedAt: Date.now() };

  if (body.tableNumber) {
    value.tableNumber = body.tableNumber.trim();
    const idSuffix = req.params.tableId.slice(-4).toLowerCase();
    value.slug = `table-${body.tableNumber.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}-${idSuffix}`;
  }

  if (req.body.location !== undefined) {
    value.location = typeof req.body.location === "string" && req.body.location.trim() ? req.body.location.trim() : null;
  }

  if (!value.qrToken) {
    value.qrToken = crypto.randomBytes(16).toString("hex");
  }

  await ref.set(value);
  res.json(tableView(req.params.tableId, value, requestBaseUrl(req), req.params.restaurantSlug));
});

router.post("/restaurants/:restaurantSlug/tables/:tableId/regenerate-qr", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage");
  if (!access) return;
  const db = getDatabase();
  const ref = db.ref(`restaurants/${access.tenant.id}/tables/${req.params.tableId}`);
  const snap = await ref.get();
  if (!snap.exists()) {
    errorResponse(res, 404, "Table not found.", "TABLE_NOT_FOUND");
    return;
  }
  const existing = snap.val() as Record<string, any>;
  const newQrToken = crypto.randomBytes(16).toString("hex");
  const now = Date.now();
  await ref.update({
    qrToken: newQrToken,
    updatedAt: now,
  });

  createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "staff",
    actorRole: access.context.platformAdmin
      ? "platform_admin"
      : (access.context.memberships[access.tenant.id]?.role ?? "manager"),
    action: "TABLE_QR_REGENERATED",
    resourceId: req.params.tableId,
    details: { tableNumber: existing.tableNumber, oldQrToken: existing.qrToken, newQrToken },
  });

  const updatedSnap = await ref.get();
  res.json({
    success: true,
    ...tableView(req.params.tableId, updatedSnap.val(), requestBaseUrl(req), req.params.restaurantSlug),
  });
});

router.post("/restaurants/:restaurantSlug/tables/:tableId/close-session", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff");
  if (!access) return;
  const db = getDatabase();
  const tableRef = db.ref(`restaurants/${access.tenant.id}/tables/${req.params.tableId}`);
  const tableSnap = await tableRef.get();
  if (!tableSnap.exists()) {
    errorResponse(res, 404, "Table not found.", "TABLE_NOT_FOUND");
    return;
  }
  const tableData = tableSnap.val() as Record<string, any>;
  const now = Date.now();
  let activeSessionId = tableData.activeSessionId;

  // Fallback: check if any session is active for this table
  if (!activeSessionId) {
    const allSessionsSnap = await db.ref(`restaurants/${access.tenant.id}/tableSessions`).get();
    if (allSessionsSnap.exists()) {
      const allSessions = allSessionsSnap.val() as Record<string, any>;
      const match = Object.values(allSessions).find((s: any) => s && s.tableId === req.params.tableId && s.status === "ACTIVE");
      if (match) activeSessionId = match.id;
    }
  }

  if (!activeSessionId) {
    errorResponse(res, 400, "No active dining session found for this table. The session may already be closed.", "NO_ACTIVE_SESSION");
    return;
  }

  const paymentMethod = String(req.body?.paymentMethod || "COUNTER").toUpperCase();
  const updates: Record<string, any> = {};

  // Find all orders for this session to mark as PAID and calculate final total
  const ordersSnap = await db.ref(`restaurants/${access.tenant.id}/orders`).get();
  const allOrders = (ordersSnap.val() ?? {}) as Record<string, any>;

  let sessionTotal = 0;
  const updatedOrderIds: string[] = [];
  const sessionOrders: any[] = [];

  for (const [ordId, ord] of Object.entries(allOrders)) {
    if (!ord) continue;
    const matchSession = activeSessionId ? ord.sessionId === activeSessionId : false;
    const matchTable = !activeSessionId && ord.tableId === req.params.tableId;

    if (matchSession || matchTable) {
      sessionOrders.push(ord);
      if (ord.status !== "CANCELLED" && ord.status !== "DECLINED") {
        const ordSub = Number(ord.subtotal) || 0;
        const ordTot = Number(ord.total) || ordSub;
        sessionTotal += ordTot;
        updatedOrderIds.push(ordId);

        // Mark order as PAID
        updates[`restaurants/${access.tenant.id}/orders/${ordId}/paymentStatus`] = "PAID";
        updates[`restaurants/${access.tenant.id}/orders/${ordId}/paymentMethod`] = paymentMethod;
        updates[`restaurants/${access.tenant.id}/orders/${ordId}/paidAt`] = now;
        updates[`restaurants/${access.tenant.id}/orders/${ordId}/updatedAt`] = now;
      }
    }
  }

  sessionTotal = Math.round(sessionTotal * 100) / 100;

  if (activeSessionId) {
    updates[`restaurants/${access.tenant.id}/tableSessions/${activeSessionId}/status`] = "CLOSED";
    updates[`restaurants/${access.tenant.id}/tableSessions/${activeSessionId}/paymentStatus`] = "PAID";
    updates[`restaurants/${access.tenant.id}/tableSessions/${activeSessionId}/paymentMethod`] = paymentMethod;
    updates[`restaurants/${access.tenant.id}/tableSessions/${activeSessionId}/totalAmount`] = sessionTotal;
    updates[`restaurants/${access.tenant.id}/tableSessions/${activeSessionId}/ordersCount`] = sessionOrders.length;
    updates[`restaurants/${access.tenant.id}/tableSessions/${activeSessionId}/closedAt`] = now;
    updates[`restaurants/${access.tenant.id}/tableSessions/${activeSessionId}/closedBy`] = access.context.email || "staff";
    updates[`restaurants/${access.tenant.id}/tableSessions/${activeSessionId}/updatedAt`] = now;
  }

  // Also close any other sessions for this table that may still be ACTIVE
  const allSessionsSnap = await db.ref(`restaurants/${access.tenant.id}/tableSessions`).get();
  if (allSessionsSnap.exists()) {
    const allSessions = allSessionsSnap.val() as Record<string, any>;
    for (const [sId, sess] of Object.entries(allSessions)) {
      if (sess && sess.tableId === req.params.tableId && sess.status === "ACTIVE") {
        updates[`restaurants/${access.tenant.id}/tableSessions/${sId}/status`] = "CLOSED";
        updates[`restaurants/${access.tenant.id}/tableSessions/${sId}/paymentStatus`] = "PAID";
        updates[`restaurants/${access.tenant.id}/tableSessions/${sId}/paymentMethod`] = paymentMethod;
        updates[`restaurants/${access.tenant.id}/tableSessions/${sId}/closedAt`] = now;
        updates[`restaurants/${access.tenant.id}/tableSessions/${sId}/closedBy`] = access.context.email || "staff";
        updates[`restaurants/${access.tenant.id}/tableSessions/${sId}/updatedAt`] = now;
      }
    }
  }

  updates[`restaurants/${access.tenant.id}/tables/${req.params.tableId}/activeSessionId`] = null;
  updates[`restaurants/${access.tenant.id}/tables/${req.params.tableId}/status`] = tableData.active === false ? "DEACTIVATED" : "AVAILABLE";
  updates[`restaurants/${access.tenant.id}/tables/${req.params.tableId}/updatedAt`] = now;

  // Execute atomic multi-path update
  await db.ref().update(updates);

  // Broadcast real-time SSE events
  orderEvents.emit(`session_closed:${access.tenant.id}`, {
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
  orderEvents.emit(`table_updated:${access.tenant.id}`, {
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

  createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "staff",
    actorRole: access.context.platformAdmin
      ? "platform_admin"
      : (access.context.memberships[access.tenant.id]?.role ?? "staff"),
    action: "TABLE_SESSION_CLOSED",
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
    message: `Table ${tableData.tableNumber} bill settled (${paymentMethod}) and dining session closed. Table is now available.`,
    tableId: req.params.tableId,
    status: "AVAILABLE",
    settledAmount: sessionTotal,
    ordersSettledCount: updatedOrderIds.length,
    table: {
      id: req.params.tableId,
      status: "AVAILABLE",
      activeSessionId: null,
    },
  });
});

// Settle Bill Endpoint (Synonym for close-session with explicit payment method)
router.post("/restaurants/:restaurantSlug/tables/:tableId/settle-bill", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff");
  if (!access) return;
  const db = getDatabase();
  const tableRef = db.ref(`restaurants/${access.tenant.id}/tables/${req.params.tableId}`);
  const tableSnap = await tableRef.get();
  if (!tableSnap.exists()) {
    errorResponse(res, 404, "Table not found.", "TABLE_NOT_FOUND");
    return;
  }
  const tableData = tableSnap.val() as Record<string, any>;
  const now = Date.now();
  let activeSessionId = tableData.activeSessionId;

  if (!activeSessionId) {
    const allSessionsSnap = await db.ref(`restaurants/${access.tenant.id}/tableSessions`).get();
    if (allSessionsSnap.exists()) {
      const allSessions = allSessionsSnap.val() as Record<string, any>;
      const match = Object.values(allSessions).find((s: any) => s && s.tableId === req.params.tableId && s.status === "ACTIVE");
      if (match) activeSessionId = match.id;
    }
  }

  if (!activeSessionId) {
    errorResponse(res, 400, "No active dining session found for this table. The session may already be settled or closed.", "NO_ACTIVE_SESSION");
    return;
  }

  const paymentMethod = String(req.body?.paymentMethod || "COUNTER").toUpperCase();
  const updates: Record<string, any> = {};

  const ordersSnap = await db.ref(`restaurants/${access.tenant.id}/orders`).get();
  const allOrders = (ordersSnap.val() ?? {}) as Record<string, any>;

  let sessionTotal = 0;
  const updatedOrderIds: string[] = [];
  const sessionOrders: any[] = [];

  for (const [ordId, ord] of Object.entries(allOrders)) {
    if (!ord) continue;
    const matchSession = activeSessionId ? ord.sessionId === activeSessionId : false;
    const matchTable = !activeSessionId && ord.tableId === req.params.tableId;

    if (matchSession || matchTable) {
      sessionOrders.push(ord);
      if (ord.status !== "CANCELLED" && ord.status !== "DECLINED") {
        const ordSub = Number(ord.subtotal) || 0;
        const ordTot = Number(ord.total) || ordSub;
        sessionTotal += ordTot;
        updatedOrderIds.push(ordId);

        updates[`restaurants/${access.tenant.id}/orders/${ordId}/paymentStatus`] = "PAID";
        updates[`restaurants/${access.tenant.id}/orders/${ordId}/paymentMethod`] = paymentMethod;
        updates[`restaurants/${access.tenant.id}/orders/${ordId}/paidAt`] = now;
        updates[`restaurants/${access.tenant.id}/orders/${ordId}/updatedAt`] = now;
      }
    }
  }

  sessionTotal = Math.round(sessionTotal * 100) / 100;

  if (activeSessionId) {
    updates[`restaurants/${access.tenant.id}/tableSessions/${activeSessionId}/status`] = "CLOSED";
    updates[`restaurants/${access.tenant.id}/tableSessions/${activeSessionId}/paymentStatus`] = "PAID";
    updates[`restaurants/${access.tenant.id}/tableSessions/${activeSessionId}/paymentMethod`] = paymentMethod;
    updates[`restaurants/${access.tenant.id}/tableSessions/${activeSessionId}/totalAmount`] = sessionTotal;
    updates[`restaurants/${access.tenant.id}/tableSessions/${activeSessionId}/ordersCount`] = sessionOrders.length;
    updates[`restaurants/${access.tenant.id}/tableSessions/${activeSessionId}/closedAt`] = now;
    updates[`restaurants/${access.tenant.id}/tableSessions/${activeSessionId}/closedBy`] = access.context.email || "staff";
    updates[`restaurants/${access.tenant.id}/tableSessions/${activeSessionId}/updatedAt`] = now;
  }

  updates[`restaurants/${access.tenant.id}/tables/${req.params.tableId}/activeSessionId`] = null;
  updates[`restaurants/${access.tenant.id}/tables/${req.params.tableId}/status`] = tableData.active === false ? "DEACTIVATED" : "AVAILABLE";
  updates[`restaurants/${access.tenant.id}/tables/${req.params.tableId}/updatedAt`] = now;

  // Automatically resolve all pending waiter requests (including bill calls) for this table
  const wreqSnap = await db.ref(`restaurants/${access.tenant.id}/waiterRequests`).get();
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
        updates[`restaurants/${access.tenant.id}/waiterRequests/${wId}/status`] = "RESOLVED";
        updates[`restaurants/${access.tenant.id}/waiterRequests/${wId}/resolvedAt`] = now;
        updates[`restaurants/${access.tenant.id}/waiterRequests/${wId}/resolvedBy`] = access.context.email || "settlement";
      }
    }
  }

  await db.ref().update(updates);

  orderEvents.emit(`session_closed:${access.tenant.id}`, {
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
  orderEvents.emit(`table_updated:${access.tenant.id}`, {
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

  createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "staff",
    actorRole: access.context.platformAdmin
      ? "platform_admin"
      : (access.context.memberships[access.tenant.id]?.role ?? "staff"),
    action: "TABLE_BILL_SETTLED_AND_CLOSED",
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
    message: `Table ${tableData.tableNumber} bill of ${sessionTotal} settled (${paymentMethod}) successfully. Table is now available.`,
    tableId: req.params.tableId,
    status: "AVAILABLE",
    settledAmount: sessionTotal,
    ordersSettledCount: updatedOrderIds.length,
    paymentMethod,
  });
});

// ─── Bills Management Endpoints ──────────────────────────────────────────────

router.get("/restaurants/:restaurantSlug/bills", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff");
  if (!access) return;

  const db = getDatabase();
  const [tablesSnap, sessionsSnap, ordersSnap] = await Promise.all([
    db.ref(`restaurants/${access.tenant.id}/tables`).get(),
    db.ref(`restaurants/${access.tenant.id}/tableSessions`).get(),
    db.ref(`restaurants/${access.tenant.id}/orders`).get(),
  ]);

  const rawTables = (tablesSnap.val() ?? {}) as Record<string, any>;
  const rawSessions = (sessionsSnap.val() ?? {}) as Record<string, any>;
  const rawOrders = (ordersSnap.val() ?? {}) as Record<string, any>;

  // Build active bills (all tables with active sessions, or sessions marked ACTIVE)
  const activeBills: any[] = [];
  const processedSessionIds = new Set<string>();

  for (const [tableId, table] of Object.entries(rawTables)) {
    if (!table || table.active === false || table.deleted) continue;

    let activeSession: any = null;
    if (table.activeSessionId && rawSessions[table.activeSessionId]?.status === "ACTIVE") {
      activeSession = rawSessions[table.activeSessionId];
    } else {
      const found = Object.values(rawSessions).find(
        (s: any) => s && s.tableId === tableId && s.status === "ACTIVE"
      );
      if (found) activeSession = found;
    }

    if (activeSession) {
      processedSessionIds.add(activeSession.id);
      const sessionOrders = Object.values(rawOrders).filter(
        (o: any) => o && (o.sessionId === activeSession.id || (Boolean(tableId) && o.tableId === tableId && !o.sessionId))
      );
      const validOrders = sessionOrders.filter(
        (o: any) => o.status !== "CANCELLED" && o.status !== "DECLINED"
      );

      const subtotal = validOrders.reduce((sum: number, o: any) => sum + Number(o.subtotal || 0), 0);
      const taxes = validOrders.reduce((sum: number, o: any) => sum + Number(o.taxes || 0), 0);
      const total = validOrders.reduce((sum: number, o: any) => sum + Number(o.total || (Number(o.subtotal || 0) + Number(o.taxes || 0))), 0);

      const allItems: any[] = [];
      validOrders.forEach((o: any) => {
        if (Array.isArray(o.items)) {
          o.items.forEach((item: any) => {
            allItems.push({
              ...item,
              orderId: o.id,
              orderNumber: o.orderNumber,
              orderTime: o.createdAt,
            });
          });
        }
      });

      const isPaid = validOrders.length > 0 && validOrders.every((o: any) => o.paymentStatus === "PAID" || o.paymentStatus === "CASH_PAID");

      activeBills.push({
        id: activeSession.id,
        sessionId: activeSession.id,
        billNumber: `BILL-${activeSession.id.slice(-6).toUpperCase()}`,
        tableId,
        tableNumber: String(table.tableNumber ?? tableId),
        location: table.location || null,
        status: "ACTIVE",
        paymentStatus: isPaid ? "PAID" : "UNPAID",
        paymentMethod: activeSession.paymentMethod || null,
        subtotal: Math.round(subtotal * 100) / 100,
        taxes: Math.round(taxes * 100) / 100,
        total: Math.round(total * 100) / 100,
        ordersCount: validOrders.length,
        itemsCount: allItems.length,
        items: allItems,
        orders: validOrders.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
        createdAt: activeSession.createdAt,
        updatedAt: activeSession.updatedAt,
      });
    }
  }

  // Build settled bills (sessions with status === "CLOSED" && paymentStatus === "PAID")
  const settledBills: any[] = [];
  const closedSessions = Object.values(rawSessions).filter(
    (s: any) => s && (s.status === "CLOSED" || s.paymentStatus === "PAID")
  );

  closedSessions.sort((a: any, b: any) => {
    const tA = new Date(a.closedAt || a.paidAt || a.updatedAt || a.createdAt || 0).getTime();
    const tB = new Date(b.closedAt || b.paidAt || b.updatedAt || b.createdAt || 0).getTime();
    return tB - tA;
  });

  for (const session of closedSessions.slice(0, 50)) {
    const sessionOrders = Object.values(rawOrders).filter((o: any) => o && o.sessionId === session.id);
    const validOrders = sessionOrders.filter((o: any) => o.status !== "CANCELLED" && o.status !== "DECLINED");

    const itemsSubtotal = validOrders.reduce((sum: number, o: any) => sum + Number(o.subtotal || 0), 0);
    const itemsTaxes = validOrders.reduce((sum: number, o: any) => sum + Number(o.taxes || 0), 0);
    const itemsTotal = validOrders.reduce((sum: number, o: any) => sum + Number(o.total || (Number(o.subtotal || 0) + Number(o.taxes || 0))), 0);

    const total = Number(session.totalAmount || session.paidAmount) || Math.round(itemsTotal * 100) / 100;
    const subtotal = itemsSubtotal > 0 ? Math.round(itemsSubtotal * 100) / 100 : Math.round((total / 1.05) * 100) / 100;
    const taxes = itemsTaxes > 0 ? Math.round(itemsTaxes * 100) / 100 : Math.round((total - subtotal) * 100) / 100;

    const allItems: any[] = [];
    validOrders.forEach((o: any) => {
      if (Array.isArray(o.items)) {
        o.items.forEach((item: any) => {
          allItems.push({
            ...item,
            orderId: o.id,
            orderNumber: o.orderNumber,
            orderTime: o.createdAt,
          });
        });
      }
    });

    settledBills.push({
      id: session.id,
      sessionId: session.id,
      billNumber: `BILL-${session.id.slice(-6).toUpperCase()}`,
      tableId: session.tableId,
      tableNumber: String(session.tableNumber || session.tableId),
      location: session.location || null,
      status: "CLOSED",
      paymentStatus: "PAID",
      paymentMethod: session.paymentMethod || "CASH",
      paymentReference: session.paymentReference || null,
      subtotal: Math.round(subtotal * 100) / 100,
      taxes: Math.round(taxes * 100) / 100,
      total: Math.round(total * 100) / 100,
      ordersCount: validOrders.length,
      itemsCount: allItems.length,
      items: allItems,
      orders: validOrders.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
      createdAt: session.createdAt,
      closedAt: session.closedAt || session.paidAt || session.updatedAt,
      closedBy: session.closedBy || session.settledBy || null,
    });
  }

  res.json({
    activeBills,
    settledBills,
    summary: {
      activeBillsCount: activeBills.length,
      activeBillsTotal: Math.round(activeBills.reduce((sum, b) => sum + b.total, 0) * 100) / 100,
      settledBillsCount: settledBills.length,
    },
  });
});

router.post("/restaurants/:restaurantSlug/bills/:identifier/pay", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff");
  if (!access) return;

  const db = getDatabase();
  const identifier = req.params.identifier;
  const paymentMethod = String(req.body?.paymentMethod || "CASH").toUpperCase();
  const referenceNote = req.body?.referenceNote ? String(req.body.referenceNote).trim() : null;

  // Validate allowed payment methods: CASH, UPI, BANK_TRANSFER, COUNTER
  const validMethods = ["CASH", "UPI", "BANK_TRANSFER", "COUNTER"];
  const finalMethod = validMethods.includes(paymentMethod) ? paymentMethod : "CASH";

  // Identify table and session
  const [tablesSnap, sessionsSnap] = await Promise.all([
    db.ref(`restaurants/${access.tenant.id}/tables`).get(),
    db.ref(`restaurants/${access.tenant.id}/tableSessions`).get(),
  ]);

  const rawTables = (tablesSnap.val() ?? {}) as Record<string, any>;
  const rawSessions = (sessionsSnap.val() ?? {}) as Record<string, any>;

  let targetSession: any = null;
  let targetSessionId = "";
  let targetTableId = "";
  let targetTable: any = null;

  // Check if identifier is sessionId
  if (rawSessions[identifier]) {
    targetSessionId = identifier;
    targetSession = rawSessions[identifier];
    targetTableId = targetSession.tableId;
    targetTable = rawTables[targetTableId] || null;
  } else if (rawTables[identifier]) {
    // Identifier is tableId
    targetTableId = identifier;
    targetTable = rawTables[identifier];
    if (targetTable.activeSessionId && rawSessions[targetTable.activeSessionId]) {
      targetSessionId = targetTable.activeSessionId;
      targetSession = rawSessions[targetSessionId];
    } else {
      const match = Object.values(rawSessions).find(
        (s: any) => s && s.tableId === targetTableId && s.status === "ACTIVE"
      );
      if (match) {
        targetSession = match;
        targetSessionId = match.id;
      }
    }
  }

  if (!targetSession && !targetTable) {
    errorResponse(res, 404, "Bill or active dining session not found.", "BILL_NOT_FOUND");
    return;
  }

  // Prevent double payment
  if (targetSession && targetSession.status === "CLOSED" && targetSession.paymentStatus === "PAID") {
    errorResponse(res, 400, "This bill has already been paid and settled.", "BILL_ALREADY_PAID");
    return;
  }

  const now = Date.now();
  const nowIso = new Date().toISOString();
  const ordersSnap = await db.ref(`restaurants/${access.tenant.id}/orders`).get();
  const allOrders = (ordersSnap.val() ?? {}) as Record<string, any>;

  let sessionTotal = 0;
  let sessionSubtotal = 0;
  let sessionTaxes = 0;
  const updatedOrderIds: string[] = [];
  const updates: Record<string, any> = {};

  for (const [ordId, ord] of Object.entries(allOrders)) {
    if (!ord) continue;
    const matchSession = targetSessionId ? ord.sessionId === targetSessionId : false;
    const matchTable = !targetSessionId && ord.tableId === targetTableId;

    if (matchSession || matchTable) {
      if (ord.status !== "CANCELLED" && ord.status !== "DECLINED") {
        const ordSub = Number(ord.subtotal) || 0;
        const ordTax = Number(ord.taxes) || 0;
        const ordTot = Number(ord.total) || (ordSub + ordTax);
        sessionSubtotal += ordSub;
        sessionTaxes += ordTax;
        sessionTotal += ordTot;
        updatedOrderIds.push(ordId);

        updates[`restaurants/${access.tenant.id}/orders/${ordId}/paymentStatus`] = "PAID";
        updates[`restaurants/${access.tenant.id}/orders/${ordId}/paymentMethod`] = finalMethod;
        updates[`restaurants/${access.tenant.id}/orders/${ordId}/paidAt`] = nowIso;
        updates[`restaurants/${access.tenant.id}/orders/${ordId}/updatedAt`] = nowIso;
      }
    }
  }

  sessionTotal = Math.round(sessionTotal * 100) / 100;
  sessionSubtotal = Math.round(sessionSubtotal * 100) / 100;
  sessionTaxes = Math.round(sessionTaxes * 100) / 100;

  if (targetSessionId) {
    updates[`restaurants/${access.tenant.id}/tableSessions/${targetSessionId}/status`] = "CLOSED";
    updates[`restaurants/${access.tenant.id}/tableSessions/${targetSessionId}/paymentStatus`] = "PAID";
    updates[`restaurants/${access.tenant.id}/tableSessions/${targetSessionId}/paymentMethod`] = finalMethod;
    updates[`restaurants/${access.tenant.id}/tableSessions/${targetSessionId}/paymentReference`] = referenceNote;
    updates[`restaurants/${access.tenant.id}/tableSessions/${targetSessionId}/paidAmount`] = sessionTotal;
    updates[`restaurants/${access.tenant.id}/tableSessions/${targetSessionId}/totalAmount`] = sessionTotal;
    updates[`restaurants/${access.tenant.id}/tableSessions/${targetSessionId}/ordersCount`] = updatedOrderIds.length;
    updates[`restaurants/${access.tenant.id}/tableSessions/${targetSessionId}/closedAt`] = nowIso;
    updates[`restaurants/${access.tenant.id}/tableSessions/${targetSessionId}/paidAt`] = nowIso;
    updates[`restaurants/${access.tenant.id}/tableSessions/${targetSessionId}/settledBy`] = access.context.email || "staff";
    updates[`restaurants/${access.tenant.id}/tableSessions/${targetSessionId}/updatedAt`] = nowIso;
  }

  if (targetTableId) {
    const tblActive = targetTable?.active !== false;
    updates[`restaurants/${access.tenant.id}/tables/${targetTableId}/activeSessionId`] = null;
    updates[`restaurants/${access.tenant.id}/tables/${targetTableId}/status`] = tblActive ? "AVAILABLE" : "DEACTIVATED";
    updates[`restaurants/${access.tenant.id}/tables/${targetTableId}/updatedAt`] = now;
  }

  // Automatically resolve all pending waiter requests (including bill calls) for this table
  const wreqSnap = await db.ref(`restaurants/${access.tenant.id}/waiterRequests`).get();
  if (wreqSnap.exists()) {
    const wreqs = (wreqSnap.val() ?? {}) as Record<string, any>;
    for (const [wId, w] of Object.entries(wreqs)) {
      if (
        w &&
        w.status === "PENDING" &&
        ((targetTableId && w.tableId === targetTableId) ||
          (targetTable?.tableNumber && String(w.tableNumber) === String(targetTable.tableNumber)) ||
          (targetSessionId && w.sessionId === targetSessionId))
      ) {
        updates[`restaurants/${access.tenant.id}/waiterRequests/${wId}/status`] = "RESOLVED";
        updates[`restaurants/${access.tenant.id}/waiterRequests/${wId}/resolvedAt`] = now;
        updates[`restaurants/${access.tenant.id}/waiterRequests/${wId}/resolvedBy`] = access.context.email || "settlement";
      }
    }
  }

  await db.ref().update(updates);

  // Broadcast realtime events
  orderEvents.emit(`session_closed:${access.tenant.id}`, {
    tableId: targetTableId,
    sessionId: targetSessionId,
    tableNumber: targetTable?.tableNumber || targetSession?.tableNumber,
    totalAmount: sessionTotal,
    paymentMethod: finalMethod,
  });
  if (targetSessionId) {
    orderEvents.emit(`session_closed:${targetSessionId}`, {
      status: "CLOSED",
      paymentStatus: "PAID",
      tableId: targetTableId,
      tableNumber: targetTable?.tableNumber || targetSession?.tableNumber,
      totalAmount: sessionTotal,
      paymentMethod: finalMethod,
    });
    orderEvents.emit(`session_updated:${targetSessionId}`, {
      status: "CLOSED",
      paymentStatus: "PAID",
      tableId: targetTableId,
      tableNumber: targetTable?.tableNumber || targetSession?.tableNumber,
      totalAmount: sessionTotal,
      paymentMethod: finalMethod,
    });
  }
  if (targetTableId) {
    orderEvents.emit(`table_updated:${access.tenant.id}`, {
      tableId: targetTableId,
      status: "AVAILABLE",
      activeSessionId: null,
    });
  }
  for (const ordId of updatedOrderIds) {
    orderEvents.emit(`order_status:${ordId}`, {
      id: ordId,
      paymentStatus: "PAID",
      paymentMethod: finalMethod,
      updatedAt: nowIso,
    });
  }

  createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "staff",
    actorRole: access.context.platformAdmin ? "platform_admin" : (access.context.memberships[access.tenant.id]?.role ?? "staff"),
    action: "BILL_PAID_AND_SESSION_CLOSED",
    resourceId: targetSessionId || targetTableId,
    details: {
      tableNumber: targetTable?.tableNumber || targetSession?.tableNumber,
      sessionId: targetSessionId,
      totalAmount: sessionTotal,
      paymentMethod: finalMethod,
      referenceNote,
      ordersSettled: updatedOrderIds.length,
    },
  });

  res.json({
    success: true,
    message: `Bill for Table ${targetTable?.tableNumber || targetSession?.tableNumber} settled (${finalMethod}) successfully. Table is now available.`,
    sessionId: targetSessionId,
    tableId: targetTableId,
    tableNumber: targetTable?.tableNumber || targetSession?.tableNumber,
    subtotal: sessionSubtotal,
    taxes: sessionTaxes,
    total: sessionTotal,
    paymentStatus: "PAID",
    paymentMethod: finalMethod,
    ordersSettledCount: updatedOrderIds.length,
    paidAt: nowIso,
  });
});

router.delete("/restaurants/:restaurantSlug/tables/:tableId", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage");
  if (!access) return;
  const db = getDatabase();
  const directRef = db.ref(`restaurants/${access.tenant.id}/tables/${req.params.tableId}`);
  const snapshot = await directRef.get();

  let targetRef = directRef;
  let tableData: any = null;
  let targetId = req.params.tableId;

  if (snapshot.exists()) {
    tableData = snapshot.val();
  } else {
    // Check if tableId matches a table slug or identifier
    const tablesSnap = await db.ref(`restaurants/${access.tenant.id}/tables`).get();
    const tablesVal = (tablesSnap.val() ?? {}) as Record<string, any>;
    const match = Object.entries(tablesVal).find(
      ([id, val]) => id === req.params.tableId || val?.slug === req.params.tableId
    );
    if (match) {
      targetId = match[0];
      targetRef = db.ref(`restaurants/${access.tenant.id}/tables/${match[0]}`);
      tableData = match[1];
    } else {
      errorResponse(res, 404, "Table not found.", "TABLE_NOT_FOUND");
      return;
    }
  }

  await targetRef.remove();

  createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "staff",
    actorRole: access.context.platformAdmin
      ? "platform_admin"
      : (access.context.memberships[access.tenant.id]?.role ?? "manager"),
    action: "TABLE_DELETED",
    resourceId: targetId,
    details: { tableNumber: tableData?.tableNumber },
  });

  res.json({ success: true, tableId: targetId });
});

router.post("/restaurants/:restaurantSlug/tables/:tableId/pin", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff");
  if (!access) return;
  const ref = getDatabase().ref(`restaurants/${access.tenant.id}/tables/${req.params.tableId}`);
  const snap = await ref.get();
  if (!snap.exists()) {
    errorResponse(res, 404, "Table not found.", "TABLE_NOT_FOUND");
    return;
  }
  const tableData = snap.val() as Record<string, unknown>;
  const pin = randomPin();
  await ref.update({ pinHash: await hashPin(pin), updatedAt: Date.now() });

  createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "staff",
    actorRole: access.context.platformAdmin
      ? "platform_admin"
      : (access.context.memberships[access.tenant.id]?.role ?? "manager"),
    action: "TABLE_PIN_REGENERATED",
    resourceId: req.params.tableId,
    details: { tableNumber: tableData.tableNumber },
  });

  res.json({ pin, tableId: req.params.tableId, tableNumber: tableData.tableNumber });
});

const DEFAULT_PERMISSIONS: Record<string, Record<string, boolean>> = {
  kitchen: { dashboard: false, orders: true, kitchen: true, menu: false, tables: false, staff: false, settings: false },
  captain: { dashboard: false, orders: true, kitchen: false, menu: false, tables: true, staff: false, settings: false },
  staff: { dashboard: false, orders: true, kitchen: false, menu: false, tables: true, staff: false, settings: false },
  manager: { dashboard: true, orders: true, kitchen: true, menu: true, tables: true, staff: true, settings: false },
  owner: { dashboard: true, orders: true, kitchen: true, menu: true, tables: true, staff: true, settings: true },
};

router.get("/restaurants/:restaurantSlug/members", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage", "staff_rbac");
  if (!access) return;
  const snapshot = await getDatabase().ref(`restaurants/${access.tenant.id}/members`).get();
  const members = (snapshot.val() ?? {}) as Record<string, Record<string, any>>;
  const auth = getAdminAuth();

  const output = await Promise.all(
    Object.entries(members).map(async ([uid, member]) => {
      const userSnap = await getDatabase().ref(`users/${uid}`).get();
      const user = userSnap.val() as Record<string, unknown> | null;
      let authUser = null;
      try {
        authUser = await auth.getUser(uid);
      } catch {
        // user might only exist in db
      }

      const role = String(member.role ?? "staff");
      const fallbackPerms = DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.staff;
      const permissions = typeof member.permissions === "object" && member.permissions !== null
        ? { ...fallbackPerms, ...member.permissions }
        : fallbackPerms;

      // Determine true lifecycle status: invited, active, suspended, deactivated, disabled
      let status: "invited" | "active" | "suspended" | "deactivated" = "invited";
      if (member.status === "suspended" || member.status === "disabled" || member.active === false) {
        status = "suspended";
      } else if (member.status === "deactivated") {
        status = "deactivated";
      } else if (authUser?.metadata?.lastSignInTime) {
        status = "active";
      } else if (member.status === "active") {
        status = "active";
      } else {
        status = "invited";
      }

      return {
        uid,
        name: typeof user?.name === "string" ? user.name : (authUser?.displayName || null),
        email: typeof user?.email === "string" ? user.email : (authUser?.email || ""),
        role,
        status,
        permissions,
        active: status === "active" || status === "invited",
        inviteLink: member.inviteLink || null,
        lastSignIn: authUser?.metadata?.lastSignInTime || null,
        createdAt: timestamp(member.createdAt),
      };
    })
  );
  res.json(output);
});

router.post("/restaurants/:restaurantSlug/members", async (req, res) => {
  const access = await getTenantAccess(req, res, "owner", "staff_rbac");
  if (!access) return;

  const rawName = String(req.body?.name || "").trim();
  const rawEmail = String(req.body?.email || "").toLowerCase().trim();
  const rawRole = String(req.body?.role || "staff").toLowerCase().trim();

  if (!rawName || !rawEmail || !rawEmail.includes("@")) {
    errorResponse(res, 400, "Please provide a valid staff name and email address.", "INVALID_INPUT");
    return;
  }

  const role = ["owner", "manager", "captain", "kitchen", "staff"].includes(rawRole) ? rawRole : "staff";
  const fallbackPerms = DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.staff;
  const permissions = typeof req.body?.permissions === "object" && req.body.permissions !== null
    ? { ...fallbackPerms, ...req.body.permissions }
    : fallbackPerms;

  const auth = getAdminAuth();
  let user = await auth.getUserByEmail(rawEmail).catch(() => null);
  let inviteLink: string | null = null;
  const isNew = !user;

  if (!user) {
    user = await auth.createUser({
      email: rawEmail,
      displayName: rawName,
      emailVerified: false,
    });
  }

  try {
    inviteLink = await auth.generatePasswordResetLink(rawEmail);
  } catch (err: any) {
    console.warn("Could not generate password reset link:", err?.message);
  }

  const now = Date.now();
  const initialStatus = isNew || !user.metadata?.lastSignInTime ? "invited" : "active";

  const memberPayload = {
    role,
    status: initialStatus,
    active: initialStatus !== "suspended",
    permissions,
    inviteLink,
    invitedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  await getDatabase().ref(`restaurants/${access.tenant.id}/members/${user.uid}`).set(memberPayload);
  await getDatabase().ref(`users/${user.uid}`).update({
    name: rawName,
    email: rawEmail,
    [`restaurants/${access.tenant.id}`]: {
      role,
      active: true,
      permissions,
      createdAt: now,
    },
  });

  await syncRestaurantClaims(user.uid, access.tenant.id, role, true);

  createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "owner",
    actorRole: "owner",
    action: "STAFF_CREATED",
    resourceId: user.uid,
    details: { name: rawName, email: rawEmail, role, status: initialStatus, permissions },
  });

  res.status(201).json({
    uid: user.uid,
    name: rawName,
    email: rawEmail,
    role,
    status: initialStatus,
    permissions,
    active: true,
    inviteLink,
    createdAt: new Date(now).toISOString(),
  });
});

router.patch("/restaurants/:restaurantSlug/members/:uid", async (req, res) => {
  const access = await getTenantAccess(req, res, "owner", "staff_rbac");
  if (!access) return;
  const { uid } = req.params;
  const db = getDatabase();
  const memberRef = db.ref(`restaurants/${access.tenant.id}/members/${uid}`);
  const snap = await memberRef.get();
  if (!snap.exists()) {
    errorResponse(res, 404, "Staff member not found.", "MEMBER_NOT_FOUND");
    return;
  }

  const existing = snap.val() as Record<string, any>;
  const updates: Record<string, any> = { updatedAt: Date.now() };

  let roleChanged = false;
  let statusChanged = false;

  if (req.body?.role && ["owner", "manager", "captain", "kitchen", "staff"].includes(req.body.role)) {
    if (existing.role !== req.body.role) roleChanged = true;
    updates.role = req.body.role;
  }

  if (req.body?.status && ["invited", "active", "suspended", "deactivated", "disabled"].includes(req.body.status)) {
    const rawStatus = req.body.status === "disabled" ? "suspended" : req.body.status;
    if (existing.status !== rawStatus) statusChanged = true;
    updates.status = rawStatus;
    updates.active = rawStatus === "active" || rawStatus === "invited";
  }

  if (typeof req.body?.permissions === "object" && req.body.permissions !== null) {
    updates.permissions = { ...(existing.permissions || {}), ...req.body.permissions };
  }

  await memberRef.update(updates);

  // Sync user claims
  const finalRole = updates.role || existing.role;
  const finalActive = updates.active !== undefined ? updates.active : existing.active !== false;
  await syncRestaurantClaims(uid, access.tenant.id, finalRole, finalActive);

  if (roleChanged) {
    createAuditLog(access.tenant.id, {
      actorId: access.context.uid,
      actorEmail: access.context.email ?? "owner",
      actorRole: "owner",
      action: "STAFF_ROLE_CHANGED",
      resourceId: uid,
      details: { previousRole: existing.role, newRole: updates.role },
    });
  }

  if (statusChanged) {
    createAuditLog(access.tenant.id, {
      actorId: access.context.uid,
      actorEmail: access.context.email ?? "owner",
      actorRole: "owner",
      action: updates.active ? "STAFF_ENABLED" : "STAFF_DISABLED",
      resourceId: uid,
      details: { previousStatus: existing.status, newStatus: updates.status },
    });
  }

  createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "owner",
    actorRole: "owner",
    action: "STAFF_UPDATED",
    resourceId: uid,
    details: updates,
  });

  res.json({ uid, ...existing, ...updates });
});

router.post("/restaurants/:restaurantSlug/members/:uid/resend-invite", async (req, res) => {
  const access = await getTenantAccess(req, res, "owner", "staff_rbac");
  if (!access) return;
  const { uid } = req.params;
  const auth = getAdminAuth();
  const user = await auth.getUser(uid).catch(() => null);
  if (!user || !user.email) {
    errorResponse(res, 404, "User account not found.", "USER_NOT_FOUND");
    return;
  }

  let inviteLink: string | null = null;
  try {
    inviteLink = await auth.generatePasswordResetLink(user.email);
    await getDatabase().ref(`restaurants/${access.tenant.id}/members/${uid}`).update({
      inviteLink,
      status: "invited",
      invitedAt: Date.now(),
    });
  } catch (err: any) {
    console.warn("Error generating reset link:", err);
  }

  createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "owner",
    actorRole: "owner",
    action: "STAFF_INVITE_RESENT",
    resourceId: uid,
    details: { email: user.email },
  });

  res.json({ success: true, inviteLink });
});

router.delete("/restaurants/:restaurantSlug/members/:uid", async (req, res) => {
  const access = await getTenantAccess(req, res, "owner", "staff_rbac");
  if (!access) return;
  const { uid } = req.params;
  const db = getDatabase();
  const memberSnap = await db.ref(`restaurants/${access.tenant.id}/members/${uid}`).get();
  if (!memberSnap.exists()) {
    errorResponse(res, 404, "Member not found.", "MEMBER_NOT_FOUND");
    return;
  }
  const memberData = memberSnap.val() as Record<string, unknown>;
  await db.ref(`restaurants/${access.tenant.id}/members/${uid}`).remove();
  await db.ref(`users/${uid}/restaurants/${access.tenant.id}`).remove();

  createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "owner",
    actorRole: "owner",
    action: "STAFF_REMOVED",
    resourceId: uid,
    details: { role: memberData.role },
  });

  res.status(204).end();
});

router.get("/restaurants/:restaurantSlug/settings", async (req, res) => {
  const access = await getTenantAccess(req, res, "read");
  if (!access) return;
  const profile = (access.tenant.profile ?? {}) as Record<string, any>;
  const settings = (access.tenant.settings ?? {}) as Record<string, any>;
  res.json({
    orderingEnabled: settings.orderingEnabled === true,
    menuEnabled: settings.menuEnabled !== false,
    restaurantStatus: settings.restaurantStatus ?? "setup",
    orderVerification: settings.orderVerification ?? "SMART_VERIFICATION",
    requireCashPhoneVerification: settings.requireCashPhoneVerification === true,
    maxCashOrderWithoutPhone: Number(settings.maxCashOrderWithoutPhone ?? 2000),
    restaurantName: profile.name ?? "",
    phone: profile.phone ?? "",
    currency: settings.currency ?? profile.currency ?? "₹",
    taxRate: settings.taxRate ?? 5,
    serviceCharge: settings.serviceCharge ?? 0,
    billSettings: (access.tenant as any).billSettings ?? null,
  });
});

function sanitizeBillText(str: unknown, maxLen: number): string {
  if (typeof str !== "string") return "";
  const clean = str.replace(/<[^>]*>?/gm, "").trim();
  return clean.slice(0, maxLen);
}

router.get("/restaurants/:restaurantSlug/bill-settings", async (req, res) => {
  const access = await getTenantAccess(req, res, "read");
  if (!access) return;

  const db = getDatabase();
  const snap = await db.ref(`restaurants/${access.tenant.id}/billSettings`).get();
  const saved = (snap.val() ?? {}) as Record<string, any>;
  const profile = (access.tenant.profile ?? {}) as Record<string, any>;
  const settings = (access.tenant.settings ?? {}) as Record<string, any>;
  const plan = normalizePlanId(profile.plan);
  const canCustomize = canUseFeature(plan, "custom_bill_receipt");

  const billSettings = {
    restaurantName: profile.name || "",
    logoUrl: saved.logoUrl || profile.logoUrl || profile.logo || "",
    tagline: saved.tagline ?? profile.tagline ?? "",
    address: saved.address ?? profile.address ?? "",
    phone: saved.phone ?? profile.phone ?? "",
    gstin: saved.gstin ?? settings.gstin ?? "",
    footerMessage: saved.footerMessage ?? "Thank you for dining with us!",
    footerNote: saved.footerNote ?? "Please visit again soon",
    paperSize: saved.paperSize === "a4" ? "a4" : "thermal_80mm",
    showTableNumber: saved.showTableNumber !== false,
    showOrderNumber: saved.showOrderNumber !== false,
    showDateTime: saved.showDateTime !== false,
    showStaff: saved.showStaff !== false,
    showTax: saved.showTax !== false,
    showPaymentDetails: saved.showPaymentDetails !== false,
    showContactInfo: saved.showContactInfo !== false,
    currency: settings.currency ?? profile.currency ?? "₹",
    updatedAt: saved.updatedAt || null,
  };

  res.json({
    billSettings,
    canCustomize,
    plan,
  });
});

router.put("/restaurants/:restaurantSlug/bill-settings", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage");
  if (!access) return;

  const plan = normalizePlanId(access.tenant.profile?.plan);
  if (!canUseFeature(plan, "custom_bill_receipt")) {
    errorResponse(
      res,
      403,
      "Custom Bill & Receipt formatting is an exclusive Pro plan feature. Please upgrade your subscription to Pro.",
      "PLAN_LIMITATION"
    );
    return;
  }

  const b = req.body || {};
  const paperSize = b.paperSize === "a4" ? "a4" : "thermal_80mm";

  const updated = {
    logoUrl: typeof b.logoUrl === "string" ? b.logoUrl.slice(0, 100000) : "",
    tagline: sanitizeBillText(b.tagline, 120),
    address: sanitizeBillText(b.address, 250),
    gstin: sanitizeBillText(b.gstin, 30),
    footerMessage: sanitizeBillText(b.footerMessage, 200) || "Thank you for dining with us!",
    footerNote: sanitizeBillText(b.footerNote, 200),
    paperSize,
    showTableNumber: b.showTableNumber !== false,
    showOrderNumber: b.showOrderNumber !== false,
    showDateTime: b.showDateTime !== false,
    showStaff: b.showStaff !== false,
    showTax: b.showTax !== false,
    showPaymentDetails: b.showPaymentDetails !== false,
    showContactInfo: b.showContactInfo !== false,
    updatedAt: Date.now(),
  };

  await getDatabase().ref(`restaurants/${access.tenant.id}/billSettings`).set(cleanForFirebase(updated));

  // If address or tagline or logo was provided, also sync into profile if empty
  const profileUpdates: Record<string, any> = {};
  if (updated.tagline && !access.tenant.profile?.tagline) profileUpdates.tagline = updated.tagline;
  if (updated.address && !access.tenant.profile?.address) profileUpdates.address = updated.address;
  if (Object.keys(profileUpdates).length > 0) {
    await getDatabase().ref(`restaurants/${access.tenant.id}/profile`).update(profileUpdates);
  }

  createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "staff",
    actorRole: access.context.platformAdmin
      ? "platform_admin"
      : (access.context.memberships[access.tenant.id]?.role ?? "manager"),
    action: "BILL_SETTINGS_UPDATED",
    resourceId: access.tenant.id,
    details: { paperSize, footerMessage: updated.footerMessage },
  });

  res.json({
    success: true,
    billSettings: updated,
  });
});

router.patch("/restaurants/:restaurantSlug/settings", async (req, res) => {
  const access = await getTenantAccess(req, res, "owner");
  if (!access) return;
  const body = parsedBody(UpdateRestaurantSettingsBody, req.body, res);
  if (!body) return;
  const extraFields: Record<string, any> = {};
  if (req.body?.orderVerification && ["SMART_VERIFICATION", "REQUIRE_APPROVAL", "AUTO_APPROVE"].includes(req.body.orderVerification)) {
    extraFields.orderVerification = req.body.orderVerification;
  }
  if (typeof req.body?.requireCashPhoneVerification === "boolean") {
    extraFields.requireCashPhoneVerification = req.body.requireCashPhoneVerification;
  }
  if (typeof req.body?.maxCashOrderWithoutPhone === "number") {
    extraFields.maxCashOrderWithoutPhone = req.body.maxCashOrderWithoutPhone;
  }
  if (req.body?.currency) {
    extraFields.currency = req.body.currency;
  }
  if (typeof req.body?.taxRate === "number") {
    extraFields.taxRate = req.body.taxRate;
  }
  if (typeof req.body?.serviceCharge === "number") {
    extraFields.serviceCharge = req.body.serviceCharge;
  }

  const value = { ...access.tenant.settings, ...body, ...extraFields, updatedAt: Date.now() };
  await getDatabase().ref(`restaurants/${access.tenant.id}/settings`).set(value);
  if (body.restaurantStatus) {
    await getDatabase().ref(`restaurantSlugs/${req.params.restaurantSlug}/active`).set(body.restaurantStatus === "active");
  }

  // Update profile if restaurantName or phone passed
  const profileUpdates: Record<string, any> = {};
  if (req.body?.restaurantName) profileUpdates.name = String(req.body.restaurantName).trim();
  if (req.body?.phone) profileUpdates.phone = String(req.body.phone).trim();
  if (req.body?.currency) profileUpdates.currency = String(req.body.currency).trim();
  if (Object.keys(profileUpdates).length > 0) {
    const currentProfile = (access.tenant.profile ?? {}) as Record<string, any>;
    await getDatabase().ref(`restaurants/${access.tenant.id}/profile`).set({ ...currentProfile, ...profileUpdates, updatedAt: Date.now() });
  }

  createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "owner",
    actorRole: "owner",
    action: "SETTINGS_CHANGED",
    details: { ...body, ...extraFields },
  });

  res.json({
    orderingEnabled: value.orderingEnabled === true,
    menuEnabled: value.menuEnabled !== false,
    restaurantStatus: value.restaurantStatus ?? "setup",
    orderVerification: (value as any).orderVerification ?? "SMART_VERIFICATION",
    requireCashPhoneVerification: (value as any).requireCashPhoneVerification === true,
    maxCashOrderWithoutPhone: (value as any).maxCashOrderWithoutPhone ?? 2000,
  });
});

router.get("/restaurants/:restaurantSlug/audit-logs", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage", "audit_logs");
  if (!access) return;

  const db = getDatabase();
  const snap = await db.ref(`restaurants/${access.tenant.id}/auditLogs`).get();
  const raw = (snap.val() ?? {}) as Record<string, any>;
  const logs = Object.values(raw).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  res.json(logs);
});

// ==========================================
// RESTAURANT FINANCE SYSTEM (TALLY-STYLE)
// Simple, Fast, Restaurant-Specific Finance
// ==========================================

const VALID_EXPENSE_CATEGORIES = [
  "Ingredients",
  "Staff",
  "Electricity",
  "Rent",
  "Cleaning",
  "Packaging",
  "Transport",
  "Other",
] as const;

router.get("/restaurants/:restaurantSlug/finance", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff", "finance_basic");
  if (!access) return;

  const planId = normalizePlanId(access.tenant.subscription?.plan || access.tenant.profile?.plan || "starter");
  const rawRange = String(req.query.range || "today").toLowerCase();
  // Starter is locked to "today" only; Growth & Pro support "today", "week", "month"
  const range = planId === "starter" ? "today" : (rawRange === "week" || rawRange === "month" ? rawRange : "today");

  const db = getDatabase();
  const [ordersSnap, expensesSnap, dayClosesSnap] = await Promise.all([
    db.ref(`restaurants/${access.tenant.id}/orders`).get(),
    db.ref(`restaurants/${access.tenant.id}/expenses`).get(),
    db.ref(`restaurants/${access.tenant.id}/dayCloses`).get(),
  ]);

  const rawOrders = (ordersSnap.val() ?? {}) as Record<string, any>;
  const rawExpenses = (expensesSnap.val() ?? {}) as Record<string, any>;
  const rawDayCloses = (dayClosesSnap.val() ?? {}) as Record<string, any>;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Determine period start
  let periodStart = new Date();
  if (range === "today") {
    periodStart.setHours(0, 0, 0, 0);
  } else if (range === "week") {
    // Current week (last 7 days or start of week)
    periodStart.setDate(now.getDate() - 6);
    periodStart.setHours(0, 0, 0, 0);
  } else if (range === "month") {
    // Current month
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }
  const periodStartMs = periodStart.getTime();

  let periodSales = 0;
  let todaySales = 0;
  let todayCashSales = 0;
  let todayUpiSales = 0;
  let todayOtherSales = 0;
  let todayOrdersCount = 0;
  let taxesCollected = 0;
  let ordersCount = 0;
  let cashSales = 0;
  let upiSales = 0;
  let otherSales = 0;
  let unpaidCount = 0;
  let unpaidTotal = 0;

  // Daily trend buckets
  const trendMap: Record<string, { date: string; sales: number; expenses: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    const dStr = d.toISOString().slice(0, 10);
    trendMap[dStr] = { date: dStr, sales: 0, expenses: 0 };
  }

  // Day of week sales tracker (for Pro monthly highlights)
  const dayOfWeekSales: Record<string, number> = {
    Sunday: 0,
    Monday: 0,
    Tuesday: 0,
    Wednesday: 0,
    Thursday: 0,
    Friday: 0,
    Saturday: 0,
  };
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  for (const order of Object.values(rawOrders)) {
    if (!order) continue;
    const isCancelled = order.status === "CANCELLED" || order.status === "DECLINED";
    if (isCancelled) continue;

    const orderDate = new Date(order.createdAt || 0);
    const orderTime = orderDate.getTime();
    const orderDateStr = order.createdAt ? String(order.createdAt).slice(0, 10) : "";
    const orderTotal = Number(order.total ?? order.totalAmount ?? 0);
    const isToday = orderDateStr === todayStr;

    const method = String(order.paymentMethod || "").toUpperCase();
    const pStatus = String(order.paymentStatus || "").toUpperCase();
    const isCash = method === "CASH" || pStatus === "CASH_PAID" || pStatus === "CASH_PENDING";
    const isUpi =
      method === "UPI" ||
      method === "PAY_NOW" ||
      method === "ONLINE" ||
      method.includes("UPI") ||
      method.includes("QR");

    if (isToday) {
      todaySales += orderTotal;
      todayOrdersCount += 1;
      if (isCash) {
        todayCashSales += orderTotal;
      } else if (isUpi) {
        todayUpiSales += orderTotal;
      } else {
        todayOtherSales += orderTotal;
      }
    }

    // Check unpaid bills - an order is unpaid until paymentStatus is PAID, regardless of completion
    const isPaid = order.paymentStatus === "PAID" || order.paymentStatus === "CASH_PAID";
    if (!isPaid && order.status !== "CANCELLED" && order.status !== "DECLINED") {
      unpaidCount += 1;
      unpaidTotal += orderTotal;
    }

    // Filter by selected range
    if (orderTime >= periodStartMs) {
      periodSales += orderTotal;
      ordersCount += 1;
      taxesCollected += Number(order.taxes ?? 0);

      const dayName = DAY_NAMES[orderDate.getDay()] || "Unknown";
      dayOfWeekSales[dayName] = (dayOfWeekSales[dayName] || 0) + orderTotal;

      // Payment categorization: Cash, UPI, Other
      if (isCash) {
        cashSales += orderTotal;
      } else if (isUpi) {
        upiSales += orderTotal;
      } else {
        otherSales += orderTotal;
      }

      if (trendMap[orderDateStr]) {
        trendMap[orderDateStr].sales += orderTotal;
      }
    }
  }

  // Parse expenses
  let totalExpenses = 0;
  let todayExpenses = 0;
  const expenseList: any[] = [];
  const categoryTotals: Record<string, number> = {};
  VALID_EXPENSE_CATEGORIES.forEach((cat) => {
    categoryTotals[cat] = 0;
  });

  for (const [expId, exp] of Object.entries(rawExpenses)) {
    if (!exp) continue;
    const expDateStr = exp.date || (exp.createdAt ? String(exp.createdAt).slice(0, 10) : todayStr);
    const expTime = new Date(expDateStr).getTime();
    const amount = Number(exp.amount ?? 0);

    const expenseItem = {
      id: expId,
      amount,
      category: exp.category || "Other",
      description: exp.description || "",
      date: expDateStr,
      createdAt: exp.createdAt || expDateStr,
      createdBy: exp.createdBy || null,
    };

    if (expDateStr === todayStr) {
      todayExpenses += amount;
    }

    if (expTime >= periodStartMs) {
      totalExpenses += amount;
      expenseList.push(expenseItem);

      const cat = exp.category || "Other";
      categoryTotals[cat] = (categoryTotals[cat] || 0) + amount;

      if (trendMap[expDateStr]) {
        trendMap[expDateStr].expenses += amount;
      }
    }
  }

  expenseList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Day Close data
  const dayCloses = Object.values(rawDayCloses).sort(
    (a: any, b: any) => new Date(b.closedAt || 0).getTime() - new Date(a.closedAt || 0).getTime()
  );
  const lastDayClose = dayCloses.length > 0 ? dayCloses[0] : null;
  const isTodayClosed = Boolean(
    lastDayClose &&
      (lastDayClose.date === todayStr ||
        lastDayClose.dateFormatted?.includes(todayStr) ||
        String(lastDayClose.closedAt || "").startsWith(todayStr))
  );

  const net = Math.round((periodSales - totalExpenses) * 100) / 100;
  const avgOrderValue = ordersCount > 0 ? Math.round((periodSales / ordersCount) * 100) / 100 : 0;

  // Monthly Pro Highlights: Top Expense Category & Best Sales Day
  let topCategoryName = "Ingredients";
  let topCategoryAmount = 0;
  for (const [cat, amt] of Object.entries(categoryTotals)) {
    if (amt > topCategoryAmount) {
      topCategoryName = cat;
      topCategoryAmount = amt;
    }
  }

  let bestDayName = "Saturday";
  let bestDayAmount = 0;
  for (const [day, amt] of Object.entries(dayOfWeekSales)) {
    if (amt > bestDayAmount) {
      bestDayName = day;
      bestDayAmount = amt;
    }
  }

  res.json({
    range,
    planId,
    sales: Math.round(periodSales * 100) / 100,
    todaySales: Math.round(todaySales * 100) / 100,
    todayExpenses: Math.round(todayExpenses * 100) / 100,
    todayCashSales: Math.round(todayCashSales * 100) / 100,
    todayUpiSales: Math.round(todayUpiSales * 100) / 100,
    todayOtherSales: Math.round(todayOtherSales * 100) / 100,
    todayOrdersCount,
    expenses: {
      total: Math.round(totalExpenses * 100) / 100,
      list: expenseList.slice(0, 50),
      byCategory: categoryTotals,
    },
    net,
    moneyReceived: {
      cash: Math.round(cashSales * 100) / 100,
      upi: Math.round(upiSales * 100) / 100,
      other: Math.round(otherSales * 100) / 100,
    },
    unpaidBills: {
      count: unpaidCount,
      total: Math.round(unpaidTotal * 100) / 100,
    },
    taxes: Math.round(taxesCollected * 100) / 100,
    ordersCount,
    avgOrderValue,
    trend: Object.values(trendMap),
    dayClose: {
      isClosed: isTodayClosed,
      lastClose: lastDayClose,
    },
    monthlyHighlights: {
      topExpenseCategory: {
        category: topCategoryName,
        amount: Math.round(topCategoryAmount * 100) / 100,
      },
      bestSalesDay: {
        day: bestDayName,
        amount: Math.round(bestDayAmount * 100) / 100,
      },
    },
  });
});

// Add New Expense
router.post("/restaurants/:restaurantSlug/finance/expenses", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage", "finance_basic");
  if (!access) return;

  const { amount: rawAmount, category, description, date } = req.body ?? {};
  const amount = Number(rawAmount);

  if (isNaN(amount) || amount <= 0) {
    errorResponse(res, 400, "Please enter a valid expense amount.", "INVALID_AMOUNT");
    return;
  }

  const validCategory = VALID_EXPENSE_CATEGORIES.includes(category) ? category : "Other";
  const expenseId = createId("exp");
  const now = new Date();
  const expenseDate = date && !isNaN(new Date(date).getTime()) ? String(date).slice(0, 10) : now.toISOString().slice(0, 10);

  const expenseRecord = {
    id: expenseId,
    amount: Math.round(amount * 100) / 100,
    category: validCategory,
    description: typeof description === "string" ? description.trim().slice(0, 200) : "",
    date: expenseDate,
    createdAt: now.toISOString(),
    createdBy: {
      uid: access.context.uid,
      name: access.context.email || "Admin",
      role: access.context.platformAdmin ? "admin" : (access.context.memberships[access.tenant.id]?.role || "owner"),
    },
  };

  const db = getDatabase();
  await db.ref(`restaurants/${access.tenant.id}/expenses/${expenseId}`).set(expenseRecord);

  await createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "admin",
    actorRole: access.context.platformAdmin ? "admin" : "owner",
    action: "EXPENSE_CREATED",
    resourceId: expenseId,
    details: {
      amount,
      category: validCategory,
      description: expenseRecord.description,
      date: expenseDate,
    },
  });

  res.status(201).json(expenseRecord);
});

// Delete Expense
router.delete("/restaurants/:restaurantSlug/finance/expenses/:expenseId", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage", "finance_basic");
  if (!access) return;

  const { expenseId } = req.params;
  const db = getDatabase();
  const expRef = db.ref(`restaurants/${access.tenant.id}/expenses/${expenseId}`);
  const snap = await expRef.get();

  if (!snap.exists()) {
    errorResponse(res, 404, "Expense record not found.", "NOT_FOUND");
    return;
  }

  const old = snap.val();
  await expRef.remove();

  await createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "admin",
    actorRole: access.context.platformAdmin ? "admin" : "owner",
    action: "EXPENSE_DELETED",
    resourceId: expenseId,
    details: {
      amount: old.amount,
      category: old.category,
      description: old.description,
    },
  });

  res.json({ success: true, message: "Expense record removed." });
});

// Pro Plan: Day Close Endpoint
router.post("/restaurants/:restaurantSlug/finance/day-close", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage", "shift_close");
  if (!access) return;

  const { openingCash: rawOpening, countedCash: rawCounted, notes, overrideDuplicate } = req.body ?? {};
  const openingCash = Math.max(0, Number(rawOpening || 0));
  const countedCash = Math.max(0, Number(rawCounted || 0));

  const db = getDatabase();
  const [ordersSnap, expensesSnap, lastCloseSnap] = await Promise.all([
    db.ref(`restaurants/${access.tenant.id}/orders`).get(),
    db.ref(`restaurants/${access.tenant.id}/expenses`).get(),
    db.ref(`restaurants/${access.tenant.id}/lastDayClose`).get(),
  ]);

  const rawOrders = (ordersSnap.val() ?? {}) as Record<string, any>;
  const rawExpenses = (expensesSnap.val() ?? {}) as Record<string, any>;
  const lastClose = lastCloseSnap.val();

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Prevent accidental duplicate closing unless explicitly overridden
  if (lastClose && (lastClose.date === todayStr || String(lastClose.closedAt || "").startsWith(todayStr)) && !overrideDuplicate) {
    const closedTime = new Date(lastClose.closedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
    const closedByName = lastClose.closedBy?.name || "Staff";
    errorResponse(res, 409, `Day has already been closed for today at ${closedTime} by ${closedByName}.`, "ALREADY_CLOSED");
    return;
  }

  let todaySales = 0;
  let cashSales = 0;
  let upiSales = 0;
  let otherSales = 0;
  let todayOrdersCount = 0;

  for (const order of Object.values(rawOrders)) {
    if (!order || order.status === "CANCELLED" || order.status === "DECLINED") continue;
    const orderDateStr = order.createdAt ? String(order.createdAt).slice(0, 10) : "";
    if (orderDateStr !== todayStr) continue;

    const orderTotal = Number(order.total ?? order.totalAmount ?? 0);
    todaySales += orderTotal;
    todayOrdersCount += 1;

    const method = String(order.paymentMethod || "").toUpperCase();
    const pStatus = String(order.paymentStatus || "").toUpperCase();

    if (method === "CASH" || pStatus === "CASH_PAID" || pStatus === "CASH_PENDING") {
      cashSales += orderTotal;
    } else if (method === "UPI" || method === "PAY_NOW" || method === "ONLINE" || method.includes("UPI")) {
      upiSales += orderTotal;
    } else {
      otherSales += orderTotal;
    }
  }

  let todayExpenses = 0;
  for (const exp of Object.values(rawExpenses)) {
    if (!exp) continue;
    const expDateStr = exp.date || (exp.createdAt ? String(exp.createdAt).slice(0, 10) : todayStr);
    if (expDateStr === todayStr) {
      todayExpenses += Number(exp.amount ?? 0);
    }
  }

  const expectedCash = Math.max(0, Math.round((openingCash + cashSales - todayExpenses) * 100) / 100);
  const difference = Math.round((countedCash - expectedCash) * 100) / 100;
  const averageOrderValue = todayOrdersCount > 0 ? Math.round((todaySales / todayOrdersCount) * 100) / 100 : 0;

  const closeId = createId("dayclose");
  const dayCloseRecord = {
    id: closeId,
    date: todayStr,
    closedAt: now.toISOString(),
    closedBy: {
      uid: access.context.uid,
      name: access.context.email || "Admin",
      email: access.context.email || "",
      role: access.context.platformAdmin ? "admin" : (access.context.memberships[access.tenant.id]?.role || "owner"),
    },
    openingCash,
    cashSales: Math.round(cashSales * 100) / 100,
    upiSales: Math.round(upiSales * 100) / 100,
    otherSales: Math.round(otherSales * 100) / 100,
    todaySales: Math.round(todaySales * 100) / 100,
    todayExpenses: Math.round(todayExpenses * 100) / 100,
    expectedCash,
    actualCash: countedCash,
    difference,
    totalOrders: todayOrdersCount,
    totalBills: todayOrdersCount,
    averageOrderValue,
    notes: typeof notes === "string" ? notes.trim().slice(0, 500) : null,
  };

  await db.ref(`restaurants/${access.tenant.id}/dayCloses/${closeId}`).set(dayCloseRecord);
  await db.ref(`restaurants/${access.tenant.id}/lastDayClose`).set(dayCloseRecord);

  await createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "admin",
    actorRole: access.context.platformAdmin ? "admin" : "owner",
    action: "DAY_CLOSED",
    resourceId: closeId,
    details: {
      todaySales,
      expectedCash,
      actualCash: countedCash,
      difference,
      date: todayStr,
    },
  });

  await createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "admin",
    actorRole: access.context.platformAdmin ? "admin" : "owner",
    action: "CASH_RECONCILIATION_RECORDED",
    resourceId: closeId,
    details: {
      openingCash,
      expectedCash,
      actualCash: countedCash,
      difference,
      date: todayStr,
    },
  });

  res.status(201).json(dayCloseRecord);
});

// Pro Plan: Day Close History
router.get("/restaurants/:restaurantSlug/finance/day-close/history", async (req, res) => {
  const access = await getTenantAccess(req, res, "manage", "shift_close");
  if (!access) return;

  const db = getDatabase();
  const snap = await db.ref(`restaurants/${access.tenant.id}/dayCloses`).get();
  const raw = (snap.val() ?? {}) as Record<string, any>;
  const list = Object.values(raw).sort(
    (a: any, b: any) => new Date(b.closedAt || 0).getTime() - new Date(a.closedAt || 0).getTime()
  );

  res.json({ history: list });
});

// 14. CUSTOMER FEEDBACK DASHBOARD & DISH REVIEWS
router.get("/restaurants/:restaurantSlug/feedback", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff", "diner_reviews");
  if (!access) return;

  const db = getDatabase();
  const [snap, dishReviewsSnap] = await Promise.all([
    db.ref(`restaurants/${access.tenant.id}/feedback`).get(),
    db.ref(`restaurants/${access.tenant.id}/dishReviews`).get(),
  ]);

  const feedbackMap = (snap.val() ?? {}) as Record<string, Record<string, unknown>>;
  const dishReviewsMap = (dishReviewsSnap.val() ?? {}) as Record<string, Record<string, unknown>>;

  const combinedList: any[] = [];
  const seenReviewIds = new Set<string>();

  for (const dr of Object.values(dishReviewsMap)) {
    if (!dr) continue;
    seenReviewIds.add(String(dr.id));
    combinedList.push({
      ...dr,
      isDishReview: true,
    });
  }

  for (const fb of Object.values(feedbackMap)) {
    if (!fb) continue;
    if (fb.reviewId && seenReviewIds.has(String(fb.reviewId))) {
      continue;
    }
    combinedList.push(fb);
  }

  combinedList.sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
  );

  const nonHiddenList = combinedList.filter((item) => item.hidden !== true);
  const total = nonHiddenList.length;
  const sum = nonHiddenList.reduce((acc, f) => acc + Number(f.rating ?? 5), 0);
  const averageRating = total > 0 ? Math.round((sum / total) * 10) / 10 : 5;

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const f of nonHiddenList) {
    const r = Math.min(5, Math.max(1, Number(f.rating ?? 5)));
    distribution[r] = (distribution[r] ?? 0) + 1;
  }

  res.json({
    total,
    averageRating,
    distribution,
    items: combinedList,
  });
});

// Moderation: Toggle Hidden status on a review
router.patch("/restaurants/:restaurantSlug/reviews/:reviewId/toggle-hidden", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff", "diner_reviews");
  if (!access) return;

  const { reviewId } = req.params;
  const db = getDatabase();

  const dishRevRef = db.ref(`restaurants/${access.tenant.id}/dishReviews/${reviewId}`);
  const dishSnap = await dishRevRef.get();
  if (dishSnap.exists()) {
    const current = dishSnap.val();
    const nextHidden = !current.hidden;
    await dishRevRef.update({ hidden: nextHidden });

    // Also update matching feedback entry if present
    const fbRef = db.ref(`restaurants/${access.tenant.id}/feedback/fb_${reviewId}`);
    const fbSnap = await fbRef.get();
    if (fbSnap.exists()) {
      await fbRef.update({ hidden: nextHidden });
    }

    res.json({ success: true, hidden: nextHidden });
    return;
  }

  const fbRef = db.ref(`restaurants/${access.tenant.id}/feedback/${reviewId}`);
  const fbSnap = await fbRef.get();
  if (fbSnap.exists()) {
    const current = fbSnap.val();
    const nextHidden = !current.hidden;
    await fbRef.update({ hidden: nextHidden });
    res.json({ success: true, hidden: nextHidden });
    return;
  }

  errorResponse(res, 404, "Review not found.", "REVIEW_NOT_FOUND");
});

// Moderation: Delete an inappropriate review
router.delete("/restaurants/:restaurantSlug/reviews/:reviewId", async (req, res) => {
  const access = await getTenantAccess(req, res, "manager", "diner_reviews");
  if (!access) return;

  const { reviewId } = req.params;
  const db = getDatabase();

  await Promise.all([
    db.ref(`restaurants/${access.tenant.id}/dishReviews/${reviewId}`).remove(),
    db.ref(`restaurants/${access.tenant.id}/feedback/${reviewId}`).remove(),
    db.ref(`restaurants/${access.tenant.id}/feedback/fb_${reviewId}`).remove(),
  ]);

  res.json({ success: true, message: "Review removed successfully." });
});

// 15. WAITER CALLS & SERVICE REQUESTS
router.post("/restaurants/:restaurantSlug/waiter-requests", async (req, res) => {
  const tenant = await resolveTenant(req.params.restaurantSlug);
  if (!tenant) {
    errorResponse(res, 404, "Restaurant not found.", "TENANT_NOT_FOUND");
    return;
  }

  // Enforce server-side entitlement: Waiter calls must be enabled on the active plan
  if (!canUseFeature(tenant.profile.plan, "service_calls")) {
    errorResponse(
      res,
      403,
      "The Waiter Call System is not enabled for this restaurant's current subscription plan.",
      "FEATURE_LOCKED"
    );
    return;
  }

  const db = getDatabase();
  const rawTableId = req.body?.tableId ? String(req.body.tableId) : null;
  const tableNumber = String(req.body?.tableNumber || req.body?.tableId || "1");
  const serviceType = String(req.body?.serviceType || "CALL_WAITER").toUpperCase();
  const notes = String(req.body?.notes || "");

  // Resolve table
  const tablesSnap = await db.ref(`restaurants/${tenant.id}/tables`).get();
  const allTables = (tablesSnap.val() ?? {}) as Record<string, any>;

  let matchedTableId: string | null = null;
  let matchedTable: any = null;

  if (rawTableId && allTables[rawTableId]) {
    matchedTableId = rawTableId;
    matchedTable = allTables[rawTableId];
  } else {
    for (const [tId, t] of Object.entries(allTables)) {
      if (
        t &&
        (tId === tableNumber ||
          String(t.tableNumber).toLowerCase() === tableNumber.toLowerCase() ||
          t.slug === tableNumber)
      ) {
        matchedTableId = tId;
        matchedTable = t;
        break;
      }
    }
  }

  // Resolve active session
  let activeSessionId = matchedTable?.activeSessionId || null;
  let activeSession: any = null;

  if (activeSessionId) {
    const sessSnap = await db.ref(`restaurants/${tenant.id}/tableSessions/${activeSessionId}`).get();
    if (sessSnap.exists() && sessSnap.val()?.status === "ACTIVE") {
      activeSession = sessSnap.val();
    } else {
      activeSessionId = null;
    }
  }

  if (!activeSessionId && matchedTableId) {
    const sessionsSnap = await db.ref(`restaurants/${tenant.id}/tableSessions`).get();
    if (sessionsSnap.exists()) {
      const allSess = sessionsSnap.val() as Record<string, any>;
      const match = Object.values(allSess).find(
        (s: any) => s && s.tableId === matchedTableId && s.status === "ACTIVE"
      );
      if (match) {
        activeSession = match;
        activeSessionId = match.id;
      }
    }
  }

  // CRITICAL VALIDATION: Empty bill requests must be rejected
  const isBillCall =
    serviceType === "BILL" ||
    serviceType === "BILL_REQUESTED" ||
    serviceType === "REQUEST_BILL";

  if (isBillCall) {
    if (!activeSessionId || !activeSession || activeSession.status !== "ACTIVE") {
      errorResponse(
        res,
        400,
        "Cannot request bill. There is no active dining session on this table.",
        "NO_ACTIVE_SESSION"
      );
      return;
    }

    // Check valid orders and balance
    const ordersSnap = await db.ref(`restaurants/${tenant.id}/orders`).get();
    const allOrders = (ordersSnap.val() ?? {}) as Record<string, any>;
    const sessionOrders = Object.values(allOrders).filter(
      (o: any) => o && o.sessionId === activeSessionId && !["CANCELLED", "DECLINED"].includes(o.status)
    );

    if (sessionOrders.length === 0) {
      errorResponse(
        res,
        400,
        "Cannot request bill. No active orders have been placed for this table session.",
        "EMPTY_BILL_NO_ORDERS"
      );
      return;
    }

    const sessionTotal = sessionOrders.reduce(
      (sum: number, o: any) => sum + (Number(o.total) || Number(o.subtotal) || 0),
      0
    );

    if (sessionTotal <= 0) {
      errorResponse(
        res,
        400,
        "Cannot request bill. The current bill balance is ₹0.",
        "ZERO_BILL_REQUEST"
      );
      return;
    }
  }

  const requestId = createId("wreq");

  const requestObj = {
    id: requestId,
    restaurantId: tenant.id,
    tableId: matchedTableId,
    tableNumber: matchedTable?.tableNumber ? String(matchedTable.tableNumber) : tableNumber,
    sessionId: activeSessionId || null,
    serviceType,
    notes,
    status: "PENDING",
    createdAt: Date.now(),
  };

  await db.ref(`restaurants/${tenant.id}/waiterRequests/${requestId}`).set(requestObj);

  const waiterEvent = {
    eventId: createId("evt_wcall"),
    eventType: "WAITER_CALL",
    restaurantId: tenant.id,
    restaurantSlug: req.params.restaurantSlug,
    requestId: requestObj.id,
    tableId: requestObj.tableId,
    tableNumber: requestObj.tableNumber,
    serviceType: requestObj.serviceType,
    notes: requestObj.notes,
    createdAt: new Date(requestObj.createdAt).toISOString(),
  };

  // Broadcast realtime waiter request & central notification event
  orderEvents.emit(`notification_event:${tenant.id}`, waiterEvent);
  orderEvents.emit(`notification_event:${req.params.restaurantSlug}`, waiterEvent);
  orderEvents.emit(`waiter_request:${tenant.id}`, requestObj);
  orderEvents.emit(`waiter_request:${req.params.restaurantSlug}`, requestObj);

  res.status(201).json(requestObj);
});

router.get("/restaurants/:restaurantSlug/waiter-requests", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff", "service_calls");
  if (!access) return;

  const snap = await getDatabase().ref(`restaurants/${access.tenant.id}/waiterRequests`).get();
  const requestsMap = (snap.val() ?? {}) as Record<string, Record<string, unknown>>;
  const list = Object.values(requestsMap).sort(
    (a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0)
  );

  res.json({ items: list });
});

router.patch("/restaurants/:restaurantSlug/waiter-requests/:requestId", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff", "service_calls");
  if (!access) return;

  const status = String(req.body?.status ?? "COMPLETED");
  const ref = getDatabase().ref(`restaurants/${access.tenant.id}/waiterRequests/${req.params.requestId}`);
  const snap = await ref.get();
  if (!snap.exists()) {
    errorResponse(res, 404, "Service request not found.", "NOT_FOUND");
    return;
  }

  await ref.update({
    status,
    updatedAt: Date.now(),
    resolvedBy: access.context.email ?? "staff",
  });

  const updatedReq = { ...snap.val(), status, updatedAt: Date.now() };
  orderEvents.emit(`waiter_request_updated:${access.tenant.id}`, updatedReq);
  orderEvents.emit(`waiter_request_updated:${req.params.restaurantSlug}`, updatedReq);

  res.json({ success: true, status });
});

export default router;