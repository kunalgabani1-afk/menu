import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import {
  createId,
  getDatabase,
  timestamp,
  verifyPin,
} from "../lib/firebase";
import {
  errorResponse,
  getTenantAccess,
} from "../lib/http";
import { resolveTenant, canManage, canStaff } from "../lib/tenant";
import { createAuditLog } from "../lib/audit";
import { canUseFeature } from "../lib/plans";
import { getRestaurantSubscription } from "../lib/subscriptions.js";
import { resolveTableBySlugOrToken } from "../lib/tableResolver.js";

const router: IRouter = Router();

export function cleanForFirebase<T>(data: T): T {
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

export const orderEvents = new EventEmitter();
orderEvents.setMaxListeners(100);

// In-memory PIN brute force tracker: tableId -> { attempts: number, lockUntil: number }
const pinAttemptTracker = new Map<string, { attempts: number; lockUntil: number }>();

function checkPinRateLimit(tableId: string): boolean {
  const now = Date.now();
  const entry = pinAttemptTracker.get(tableId);
  if (!entry) return true;
  if (entry.lockUntil > now) return false;
  if (entry.lockUntil <= now && entry.attempts >= 5) {
    pinAttemptTracker.delete(tableId);
  }
  return true;
}

function recordPinFailure(tableId: string): void {
  const now = Date.now();
  const entry = pinAttemptTracker.get(tableId) ?? { attempts: 0, lockUntil: 0 };
  entry.attempts += 1;
  if (entry.attempts >= 5) {
    entry.lockUntil = now + 10 * 60 * 1000; // 10 minute cooldown
  }
  pinAttemptTracker.set(tableId, entry);
}

function recordPinSuccess(tableId: string): void {
  pinAttemptTracker.delete(tableId);
}

// In-memory submission rate limiter: tableId/ip -> { count: number, resetAt: number }
const submissionRateMap = new Map<string, { count: number; resetAt: number }>();

// In-flight concurrency lock for duplicate idempotency keys
const inFlightIdempotencyMap = new Map<string, { promise: Promise<any>; resolve: (val: any) => void; reject: (err: any) => void }>();

function checkSubmissionRate(key: string): boolean {
  const now = Date.now();
  const entry = submissionRateMap.get(key);
  if (!entry || entry.resetAt <= now) {
    submissionRateMap.set(key, { count: 1, resetAt: now + 60 * 1000 });
    return true;
  }
  if (entry.count >= 4) return false;
  entry.count += 1;
  return true;
}

// Distance helper (Haversine formula in km)
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Order status validation state machine
const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING_WAITER_APPROVAL: ["APPROVED", "ACCEPTED", "PREPARING", "DECLINED", "CANCELLED", "NEW"],
  NEEDS_APPROVAL: ["APPROVED", "ACCEPTED", "PREPARING", "DECLINED", "CANCELLED", "NEW"],
  NEW: ["APPROVED", "ACCEPTED", "PREPARING", "READY", "DECLINED", "CANCELLED", "NEEDS_VERIFICATION", "PENDING_WAITER_APPROVAL", "NEEDS_APPROVAL"],
  NEEDS_VERIFICATION: ["APPROVED", "ACCEPTED", "PREPARING", "DECLINED", "CANCELLED"],
  APPROVED: ["PREPARING", "READY", "COMPLETED", "DECLINED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "READY", "COMPLETED", "DECLINED", "CANCELLED"],
  PREPARING: ["READY", "COMPLETED", "DECLINED", "CANCELLED"],
  READY: ["PREPARING", "COMPLETED", "DECLINED", "CANCELLED"],
  COMPLETED: [],
  DECLINED: [],
  CANCELLED: [],
};

const SESSION_SECRET = process.env.TABLE_SESSION_SECRET || "tableline_session_secret_fallback_key_2026";

export function generateTableSessionToken(
  restaurantId: string,
  tableId: string,
  tableSlug: string,
  sessionId?: string,
): { token: string; expiresAt: string; sessionId?: string } {
  const issuedAt = Date.now();
  const expiresAt = new Date(issuedAt + 4 * 60 * 60 * 1000).toISOString(); // 4-hour active session
  const payload = JSON.stringify({
    restaurantId,
    tableId,
    tableSlug,
    sessionId: sessionId || null,
    issuedAt,
    expiresAt,
  });
  const encodedPayload = Buffer.from(payload, "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(encodedPayload)
    .digest("base64url");
  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt,
    sessionId,
  };
}

export function verifyTableSessionToken(
  token: string,
  expectedRestaurantId: string,
  expectedTableId: string,
  expectedSessionId?: string,
): { valid: boolean; error?: string; payload?: any } {
  try {
    const [encodedPayload, signature] = token.split(".");
    if (!encodedPayload || !signature) {
      return { valid: false, error: "Malformed table session token." };
    }
    const expectedSignature = crypto
      .createHmac("sha256", SESSION_SECRET)
      .update(encodedPayload)
      .digest("base64url");
    if (signature !== expectedSignature) {
      return { valid: false, error: "Invalid table session token signature." };
    }
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (new Date(payload.expiresAt).getTime() < Date.now()) {
      return { valid: false, error: "Table session expired. Please refresh the menu." };
    }
    if (payload.restaurantId !== expectedRestaurantId) {
      return { valid: false, error: "Session does not match this restaurant." };
    }
    if (payload.tableId !== expectedTableId) {
      return {
        valid: false,
        error: "Table session mismatch: this session was authorized for another table.",
      };
    }
    if (expectedSessionId && payload.sessionId && payload.sessionId !== expectedSessionId) {
      return {
        valid: false,
        error: "Dining session has ended. Please refresh your menu for a new session.",
      };
    }
    return { valid: true, payload };
  } catch {
    return { valid: false, error: "Invalid session token." };
  }
}

// Helper: Check scheduled availability
function checkItemScheduledAvailability(item: any): { allowed: boolean; reason?: string } {
  if (item.available === false || item.isAvailable === false || item.availabilityType === "OUT_OF_STOCK") {
    return { allowed: false, reason: `"${item.name}" is currently sold out and unavailable.` };
  }
  if (item.availabilityType === "HIDDEN") {
    return { allowed: false, reason: `"${item.name}" is not currently available.` };
  }
  if (!item.availabilityType || item.availabilityType === "ALWAYS") return { allowed: true };

  const now = new Date();
  if (item.availabilityType === "SCHEDULED" && item.availabilitySchedule) {
    const sched = item.availabilitySchedule;
    if (Array.isArray(sched.days) && sched.days.length > 0) {
      const currentDay = now.getDay();
      if (!sched.days.includes(currentDay)) {
        return { allowed: false, reason: `"${item.name}" is not available today.` };
      }
    }
    if (sched.startTime && sched.endTime) {
      const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
      const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      if (currentTime < sched.startTime || currentTime > sched.endTime) {
        return { allowed: false, reason: `"${item.name}" is only available between ${sched.startTime} and ${sched.endTime}.` };
      }
    }
  }

  if (item.availabilityType === "SEASONAL" && item.availabilitySchedule) {
    const sched = item.availabilitySchedule;
    const nowIso = now.toISOString().slice(0, 10);
    if (sched.startDate && nowIso < sched.startDate) {
      return { allowed: false, reason: `"${item.name}" seasonal availability starts on ${sched.startDate}.` };
    }
    if (sched.endDate && nowIso > sched.endDate) {
      return { allowed: false, reason: `"${item.name}" seasonal availability ended on ${sched.endDate}.` };
    }
  }

  return { allowed: true };
}

// In-memory cache for menu validation snapshots (30s TTL)
const menuCache = new Map<string, { menuItems: any; modifierGroups: any; categories: any; expiresAt: number }>();

// Helper: Calculate prices strictly from DB, including Variants, Modifiers, Add-ons & Combos
async function calculateOrderSnapshot(
  restaurantId: string,
  rawItems: Array<{
    menuItemId?: string;
    id?: string;
    itemId?: string;
    quantity: number;
    specialInstructions?: string;
    notes?: string;
    note?: string;
    selectedAddonIds?: string[];
    addons?: any[];
    selectedAddons?: any[];
    selectedVariantId?: string;
    variant?: any;
    selectedVariant?: any;
    selectedModifiers?: Array<{ groupId: string; optionId: string }>;
  }>,
  taxRate: number,
) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error("Order must contain at least one item.");
  }

  if (rawItems.length > 25) {
    throw new Error("Order exceeds maximum limit of 25 distinct items.");
  }

  const now = Date.now();
  let menuData = menuCache.get(restaurantId);
  if (!menuData || menuData.expiresAt < now) {
    const db = getDatabase();
    const [menuItemsSnap, itemsSnap, modGroupsSnap, categoriesSnap] = await Promise.all([
      db.ref(`restaurants/${restaurantId}/menuItems`).get(),
      db.ref(`restaurants/${restaurantId}/items`).get(),
      db.ref(`restaurants/${restaurantId}/modifierGroups`).get(),
      db.ref(`restaurants/${restaurantId}/categories`).get(),
    ]);

    const menuItems = {
      ...((itemsSnap.val() ?? {}) as Record<string, any>),
      ...((menuItemsSnap.val() ?? {}) as Record<string, any>),
    };
    const modifierGroups = (modGroupsSnap.val() ?? {}) as Record<string, any>;
    const categories = (categoriesSnap.val() ?? {}) as Record<string, any>;
    menuData = { menuItems, modifierGroups, categories, expiresAt: now + 30000 };
    menuCache.set(restaurantId, menuData);
  }

  const { menuItems, modifierGroups, categories } = menuData;

  const snapshots: Array<{
    itemId: string;
    menuItemId: string;
    name: string;
    price: number;
    quantity: number;
    subtotal: number;
    specialInstructions: string | null;
    selectedAddons: Array<{ id: string; name: string; price: number }>;
    selectedVariant?: { id: string; name: string; price: number };
    selectedModifiers: Array<{
      groupId: string;
      groupName: string;
      optionId: string;
      optionName: string;
      price: number;
    }>;
  }> = [];

  let subtotal = 0;

  for (const raw of rawItems as any[]) {
    const menuItemId = String(raw.menuItemId ?? raw.id ?? raw.itemId ?? "").trim();
    const qty = Math.floor(Number(raw.quantity ?? 1));

    if (isNaN(qty) || qty < 1 || qty > 10) {
      throw new Error(`Quantity for each item must be between 1 and 10. Received: ${raw.quantity}`);
    }

    let menuItem = menuItemId ? menuItems[menuItemId] : undefined;
    if (!menuItem && (menuItemId || raw.name)) {
      menuItem = Object.values(menuItems).find(
        (m: any) => m && (m.id === menuItemId || (raw.name && m.name?.toLowerCase() === raw.name?.toLowerCase()))
      ) as any;
    }
    if (!menuItem) {
      if (raw.name && typeof raw.price === "number" && !isNaN(raw.price)) {
        menuItem = {
          id: menuItemId || `item_${Date.now()}`,
          name: raw.name,
          price: Number(raw.price),
        };
      } else if (menuItemId) {
        throw new Error(`Item ${menuItemId} does not exist in this restaurant menu.`);
      } else {
        throw new Error("Invalid menu item specified.");
      }
    }

    // Availability verification
    const availCheck = checkItemScheduledAvailability(menuItem);
    if (!availCheck.allowed) {
      throw new Error(availCheck.reason || `"${menuItem.name}" is currently unavailable.`);
    }

    // Variant calculation
    let basePrice = Number(menuItem.price);
    let selectedVariant: { id: string; name: string; price: number } | undefined = undefined;

    const rawVariantId =
      raw.selectedVariantId ??
      (typeof raw.variant === "object" && raw.variant !== null ? raw.variant.id : raw.variant) ??
      (typeof raw.selectedVariant === "object" && raw.selectedVariant !== null ? raw.selectedVariant.id : raw.selectedVariant);

    if (Array.isArray(menuItem.variants) && menuItem.variants.length > 0) {
      if (rawVariantId) {
        const matchingVar = menuItem.variants.find((v: any) => String(v.id) === String(rawVariantId));
        if (matchingVar) {
          basePrice = Number(matchingVar.price ?? 0);
          selectedVariant = {
            id: matchingVar.id,
            name: matchingVar.name,
            price: basePrice,
          };
        } else {
          throw new Error(`Invalid variant selected for "${menuItem.name}".`);
        }
      } else {
        // Default to first variant
        const firstVar = menuItem.variants[0];
        basePrice = Number(firstVar.price ?? 0);
        selectedVariant = {
          id: firstVar.id,
          name: firstVar.name,
          price: basePrice,
        };
      }
    }

    if (isNaN(basePrice) || basePrice < 0) {
      throw new Error(`Invalid price configured for "${menuItem.name}".`);
    }

    // Category-level modifier inheritance & Item overrides
    const category = menuItem.categoryId ? categories[String(menuItem.categoryId)] : null;
    const catGroupIds: string[] = Array.isArray(category?.modifierGroupIds) ? category.modifierGroupIds : [];
    const itemDisabledIds: string[] = Array.isArray(menuItem.disabledModifierGroupIds) ? menuItem.disabledModifierGroupIds : [];
    const itemGroupIds: string[] = Array.isArray(menuItem.modifierGroupIds) ? menuItem.modifierGroupIds : [];

    // Filter out any inherited category groups disabled on the item, and merge with item-specific groups
    const attachedGroupIds: string[] = Array.from(
      new Set([
        ...catGroupIds.filter((id) => !itemDisabledIds.includes(id)),
        ...itemGroupIds,
      ])
    );

    // Modifiers calculation
    const selectedModifiers: Array<{
      groupId: string;
      groupName: string;
      optionId: string;
      optionName: string;
      price: number;
    }> = [];
    let modifiersUnitPrice = 0;

    const incomingModifiers = Array.isArray(raw.selectedModifiers)
      ? raw.selectedModifiers
      : (Array.isArray(raw.modifiers?.customizations) ? raw.modifiers.customizations : []);

    const groupSelectionCounts: Record<string, number> = {};

    if (Array.isArray(incomingModifiers)) {
      for (const sm of incomingModifiers) {
        if (!sm) continue;
        const targetGid = sm.groupId;
        let grp = targetGid ? modifierGroups[targetGid] : null;
        if (!grp && sm.groupName) {
          grp = Object.values(modifierGroups).find(
            (g: any) => g && g.name?.toLowerCase() === sm.groupName?.toLowerCase()
          ) as any;
        }

        let opt: any = null;
        if (grp && Array.isArray(grp.options)) {
          opt = grp.options.find(
            (o: any) => o && (o.id === sm.optionId || (sm.optionName && o.name?.toLowerCase() === sm.optionName?.toLowerCase()))
          );
        }

        if (opt && opt.available === false) {
          throw new Error(`Option "${opt.name}" in "${grp?.name || 'modifier'}" is currently out of stock.`);
        }

        const optPrice = opt
          ? Math.max(0, Number(opt.priceAdjustment !== undefined ? opt.priceAdjustment : (opt.price || 0)))
          : Math.max(0, Number(sm.price || 0));

        modifiersUnitPrice += optPrice;
        const gidKey = grp?.id || targetGid || "addons";
        groupSelectionCounts[gidKey] = (groupSelectionCounts[gidKey] || 0) + 1;

        selectedModifiers.push({
          groupId: grp?.id || targetGid || "modgrp_custom",
          groupName: String(grp?.name || sm.groupName || "Add-on"),
          optionId: opt?.id || sm.optionId || `opt_${Date.now()}`,
          optionName: String(opt?.name || sm.optionName || "Customization"),
          price: optPrice,
        });
      }
    }

    // Validate modifier group required constraints
    for (const gid of attachedGroupIds) {
      const grp = modifierGroups[gid];
      if (grp && (grp.required || Number(grp.minSelections) > 0)) {
        const min = Number(grp.minSelections) || (grp.required ? 1 : 0);
        const count = groupSelectionCounts[gid] || 0;
        if (count < min) {
          throw new Error(`Please select at least ${min} option(s) for "${grp.name}".`);
        }
      }
    }

    // Process Addons strictly against database menu item addons
    const selectedAddons: Array<{ id: string; name: string; price: number }> = [];
    let addonsUnitPrice = 0;

    const effectiveAddonIds =
      raw.selectedAddonIds ??
      (Array.isArray(raw.addons) ? raw.addons.map((a: any) => (typeof a === "object" && a !== null ? a.id : a)) : undefined) ??
      (Array.isArray(raw.selectedAddons) ? raw.selectedAddons.map((a: any) => (typeof a === "object" && a !== null ? a.id : a)) : undefined);

    if (Array.isArray(effectiveAddonIds) && Array.isArray(menuItem.addons)) {
      for (const addonId of effectiveAddonIds) {
        const matchingAddon = menuItem.addons.find((a: any) => String(a.id) === String(addonId));
        if (matchingAddon) {
          const addonPrice = Number(matchingAddon.price ?? 0);
          addonsUnitPrice += addonPrice;
          selectedAddons.push({
            id: matchingAddon.id,
            name: matchingAddon.name,
            price: addonPrice,
          });
        }
      }
    }

    let unitPrice = basePrice + modifiersUnitPrice + addonsUnitPrice;
    const clientPrice = Number(raw.price || 0);
    if (!isNaN(clientPrice) && clientPrice > unitPrice && clientPrice <= basePrice * 3) {
      unitPrice = clientPrice;
    }
    const itemSubtotal = Math.round(unitPrice * qty * 100) / 100;
    subtotal += itemSubtotal;

    const effectiveInstructions =
      raw.specialInstructions ?? raw.notes ?? raw.note ?? null;

    snapshots.push({
      itemId: createId("oi"),
      menuItemId,
      name: String(menuItem.name),
      price: unitPrice,
      quantity: qty,
      subtotal: itemSubtotal,
      specialInstructions: effectiveInstructions ? String(effectiveInstructions).slice(0, 200).trim() : null,
      selectedAddons: Array.isArray(selectedAddons) ? selectedAddons : [],
      selectedVariant: selectedVariant ?? null,
      selectedModifiers: Array.isArray(selectedModifiers) ? selectedModifiers : [],
      modifiers: (raw as any).modifiers || null,
      addedByDiner: (raw as any).addedByDiner ? String((raw as any).addedByDiner).slice(0, 50) : null,
    });
  }

  if (snapshots.length > 25) {
    throw new Error("Order exceeds maximum limit of 25 unique items.");
  }

  subtotal = Math.round(subtotal * 100) / 100;
  if (subtotal > 50000) {
    throw new Error("Order exceeds maximum single transaction limit of $500.00 (₹50,000 equivalent).");
  }

  // Normalize tax rate: Handles percentage values (e.g. 5 for 5%) or decimals (0.05 for 5%), or 0 for exempt
  const normalizedTaxRate =
    isNaN(taxRate) || taxRate < 0
      ? 0.05
      : taxRate > 1
      ? taxRate / 100
      : taxRate;
  const taxes = Math.round(subtotal * normalizedTaxRate * 100) / 100;
  const total = Math.round((subtotal + taxes) * 100) / 100;

  return {
    items: snapshots,
    subtotal,
    taxes,
    total,
  };
}

// ---------------------------------------------------------------------------
// CUSTOMER ROUTES
// ---------------------------------------------------------------------------

// 0. Verify Table PIN and Create/Refresh Table Session
router.post("/public/menu/:restaurantSlug/table/:tableSlug/session", async (req, res) => {
  const { restaurantSlug, tableSlug } = req.params;
  const { tablePin } = req.body ?? {};

  const tenant = await resolveTenant(restaurantSlug);
  if (!tenant) {
    errorResponse(res, 404, "Restaurant not found.", "RESTAURANT_NOT_FOUND");
    return;
  }

  const tenantSettings = (tenant.settings ?? {}) as Record<string, any>;
  const isDeletionPending =
    tenant.status === "DELETION_PENDING" ||
    tenantSettings.restaurantStatus === "DELETION_PENDING" ||
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
    tenantSettings.restaurantStatus === "inactive" ||
    tenantSettings.restaurantStatus === "deactivated" ||
    tenantSettings.accountStatus === "DEACTIVATED" ||
    (tenant.profile as any)?.accountStatus === "DEACTIVATED" ||
    tenant.active === false;
  if (isDeactivated) {
    errorResponse(res, 403, "This restaurant is temporarily unavailable.", "RESTAURANT_UNAVAILABLE");
    return;
  }

  const db = getDatabase();
  const tablesSnap = await db.ref(`restaurants/${tenant.id}/tables`).get();
  const tables = (tablesSnap.val() ?? {}) as Record<string, any>;
  const rawSearch = String(tableSlug).trim().toLowerCase();
  const digitsSearch = rawSearch.replace(/[^0-9]/g, "").replace(/^0+/, "");
  const normSearch = rawSearch.replace(/[^a-z0-9]/g, "");

  const tableEntry = Object.entries(tables).find(([id, t]) => {
    const tSlug = String(t.slug || "").toLowerCase();
    const tNum = String(t.tableNumber || "").toLowerCase();
    const normTblNum = tNum.replace(/[^a-z0-9]/g, "");
    const normSlug = tSlug.replace(/[^a-z0-9]/g, "");
    const digitsTblNum = tNum.replace(/[^0-9]/g, "").replace(/^0+/, "");

    return (
      id.toLowerCase() === rawSearch ||
      tSlug === rawSearch ||
      tNum === rawSearch ||
      (normSearch && (normSearch === normTblNum || normSearch === normSlug)) ||
      (digitsSearch && digitsSearch === digitsTblNum)
    );
  });

  if (!tableEntry) {
    errorResponse(res, 404, "Invalid table.", "TABLE_NOT_FOUND");
    return;
  }

  const [tableId, tableData] = tableEntry;
  if (tableData.active === false) {
    errorResponse(res, 400, "This table is currently inactive or closed.", "TABLE_INACTIVE");
    return;
  }

  if (!checkPinRateLimit(tableId)) {
    errorResponse(res, 429, "Too many failed table PIN attempts. Please wait 10 minutes or ask staff.", "PIN_RATE_LIMITED");
    return;
  }

  const pinInput = String(tablePin ?? "").trim();
  const storedHash = String(tableData.pinHash ?? "");
  const pinValid = await verifyPin(pinInput, storedHash);

  if (!pinValid) {
    recordPinFailure(tableId);
    errorResponse(res, 401, "Invalid table PIN. Please enter the 4-digit PIN displayed on your table stand.", "INVALID_PIN");
    return;
  }

  recordPinSuccess(tableId);

  const session = generateTableSessionToken(tenant.id, tableId, tableSlug);
  res.json({
    success: true,
    tableSessionToken: session.token,
    expiresAt: session.expiresAt,
    tableId,
    tableNumber: String(tableData.tableNumber ?? tableId),
  });
});

// 1. Submit Customer Order from QR Menu
router.post("/public/menu/:restaurantSlug/table/:tableSlug/orders", async (req, res) => {
  const t0 = Date.now();
  console.log(`[ORDER_FLOW] Order request received at ${t0}`);
  console.log(`[ORDER_FLOW] Validation started`);

  const { restaurantSlug, tableSlug } = req.params;
  const {
    tablePin,
    tableSessionToken,
    items,
    customerNote,
    customerPhone,
    idempotencyKey,
    paymentMethod = "PAY_LATER",
    userLocation,
  } = req.body ?? {};

  const tenant = await resolveTenant(restaurantSlug);
  if (!tenant) {
    errorResponse(res, 404, "Restaurant not found.", "RESTAURANT_NOT_FOUND");
    return;
  }

  const settings = tenant.settings as Record<string, any>;
  const isDeletionPending =
    tenant.status === "DELETION_PENDING" ||
    settings.restaurantStatus === "DELETION_PENDING" ||
    settings.accountStatus === "DELETION_PENDING" ||
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
    settings.restaurantStatus === "inactive" ||
    settings.restaurantStatus === "deactivated" ||
    settings.accountStatus === "DEACTIVATED" ||
    (tenant.profile as any)?.accountStatus === "DEACTIVATED" ||
    tenant.active === false;
  if (isDeactivated) {
    errorResponse(res, 403, "This restaurant is temporarily unavailable.", "RESTAURANT_UNAVAILABLE");
    return;
  }
  if (settings.restaurantStatus !== "active" || settings.orderingEnabled === false) {
    errorResponse(res, 400, "Online table ordering is currently paused for this restaurant.", "ORDERING_DISABLED");
    return;
  }

  // Subscription status check: if PAST_DUE (beyond 7-day grace period), block new customer table orders
  const subscription = await getRestaurantSubscription(tenant.id);
  if (subscription.status === "PAST_DUE") {
    errorResponse(
      res,
      403,
      "Customer table ordering is temporarily paused due to pending subscription renewal. Please speak with restaurant staff.",
      "SUBSCRIPTION_PAST_DUE"
    );
    return;
  }

  // Plan entitlement check: table_ordering is disabled on Starter
  if (!canUseFeature(tenant.profile.plan, "table_ordering")) {
    errorResponse(
      res,
      403,
      "This restaurant is currently on the Digital Menu plan. Direct customer table ordering is not enabled.",
      "PLAN_LIMITATION",
    );
    return;
  }

  const db = getDatabase();

  // Authoritative table resolution
  const tablesSnap = await db.ref(`restaurants/${tenant.id}/tables`).get();
  const tables = (tablesSnap.val() ?? {}) as Record<string, any>;
  const resolved = resolveTableBySlugOrToken(tables, tableSlug);

  if (!resolved) {
    errorResponse(res, 404, "Invalid table or table unavailable. Please ask restaurant staff.", "TABLE_NOT_FOUND");
    return;
  }

  const tableId = resolved.id;
  const tableData = resolved.table;
  if (tableData.active === false) {
    errorResponse(res, 400, "This table is currently inactive or closed.", "TABLE_INACTIVE");
    return;
  }

  // Cross-table validation: ensure client cannot submit an order claiming a different table
  if (req.body.tableId && req.body.tableId !== tableId) {
    errorResponse(res, 403, "Cross-table order submission rejected. Order table must match scanned QR table.", "SESSION_TABLE_MISMATCH");
    return;
  }

  // Active Dining Session resolution (non-blocking for order placement)
  let activeSessionId = tableData.activeSessionId || null;
  let activeSession: any = null;
  let needsSessionCreate = false;

  if (activeSessionId) {
    try {
      const sessionSnap = await db.ref(`restaurants/${tenant.id}/tableSessions/${activeSessionId}`).get();
      if (sessionSnap.exists()) {
        const val = sessionSnap.val();
        if (val && val.status === "ACTIVE" && val.tableId === tableId) {
          activeSession = val;
        }
      }
    } catch {}
  }

  if (!activeSession || activeSession.status !== "ACTIVE") {
    activeSessionId = createId("sess");
    needsSessionCreate = true;
  }

  // Rate Limiting: max 4 orders per 60s per table
  if (!checkSubmissionRate(tableId)) {
    errorResponse(res, 429, "Too many orders submitted in a short period. Please wait a moment before sending more.", "RATE_LIMITED");
    return;
  }

  // Validate Table Session Token if supplied
  if (tableSessionToken && typeof tableSessionToken === "string") {
    const sessionCheck = verifyTableSessionToken(tableSessionToken, tenant.id, tableId, activeSessionId);
    if (!sessionCheck.valid) {
      if (sessionCheck.error?.includes("mismatch")) {
        errorResponse(res, 403, sessionCheck.error, "SESSION_TABLE_MISMATCH");
        return;
      }
      // If token is expired or from a previous session, gracefully allow order and refresh session token
    }
  }

  if (tablePin && tableData.pinHash) {
    // Check rate limit on PIN attempts
    if (!checkPinRateLimit(tableId)) {
      errorResponse(res, 429, "Too many failed table PIN attempts. Please wait 10 minutes or ask staff.", "PIN_RATE_LIMITED");
      return;
    }

    const pinInput = String(tablePin ?? "").trim();
    const storedHash = String(tableData.pinHash ?? "");
    if (storedHash && pinInput) {
      const pinValid = await verifyPin(pinInput, storedHash);
      if (!pinValid) {
        recordPinFailure(tableId);
        errorResponse(res, 401, "Invalid table PIN.", "INVALID_PIN");
        return;
      }
      recordPinSuccess(tableId);
    }
  }

  // Idempotency check: prevent duplicate submissions
  const idempotencyLockKey = idempotencyKey ? `${tenant.id}_${tableId}_${idempotencyKey}` : null;
  if (idempotencyLockKey && inFlightIdempotencyMap.has(idempotencyLockKey)) {
    try {
      const entry = inFlightIdempotencyMap.get(idempotencyLockKey);
      if (entry) {
        const inFlightResult = await Promise.race([
          entry.promise,
          new Promise((_, rej) => setTimeout(() => rej(new Error("Idempotency lock timeout")), 4000)),
        ]);
        if (inFlightResult) {
          res.status(200).json(inFlightResult);
          return;
        }
      }
    } catch {}
  }

  let lockResolver: ((val: any) => void) | null = null;
  let lockRejecter: ((err: any) => void) | null = null;
  if (idempotencyLockKey) {
    let resolveFn: any;
    let rejectFn: any;
    const p = new Promise<any>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });
    inFlightIdempotencyMap.set(idempotencyLockKey, { promise: p, resolve: resolveFn, reject: rejectFn });
    lockResolver = resolveFn;
    lockRejecter = rejectFn;
  }

  const existingOrdersSnap = await db.ref(`restaurants/${tenant.id}/orders`).get();
  const existingOrders = (existingOrdersSnap.val() ?? {}) as Record<string, any>;

  if (idempotencyKey) {
    const matching = Object.values(existingOrders).find(
      (o) => o.idempotencyKey === idempotencyKey && o.tableId === tableId,
    );
    if (matching) {
      if (lockResolver) {
        lockResolver(matching);
        setTimeout(() => inFlightIdempotencyMap.delete(idempotencyLockKey!), 10000);
      }
      res.status(200).json(matching);
      return;
    }
  }

  const allOrdersList = Object.values(existingOrders);
  const tableOrders = allOrdersList.filter((o) => o.tableId === tableId);
  const isPayLater = paymentMethod === "PAY_LATER" || paymentMethod === "CASH";

  // Suspicious order tracking: 5+ cancelled orders within 1 hour blocks cash ordering
  const clientIp = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "");
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const cancelledRecentCount = allOrdersList.filter(
    (o) =>
      (o.clientIp === clientIp || o.tableId === tableId) &&
      o.status === "CANCELLED" &&
      new Date(o.createdAt).getTime() > oneHourAgo,
  ).length;

  if (cancelledRecentCount >= 5 && isPayLater) {
    errorResponse(
      res,
      403,
      "Multiple unconfirmed or cancelled orders were detected. Please speak with your waitstaff or pay online.",
      "SUSPICIOUS_ACTIVITY_RESTRICTED",
    );
    return;
  }

  // Calculate prices securely from DB
  const taxRate = Number(settings.taxRate ?? 0.05);
  let calculation;
  try {
    calculation = await calculateOrderSnapshot(tenant.id, items, taxRate);
  } catch (err: any) {
    errorResponse(res, 400, err.message ?? "Failed to validate order items.", "CALCULATION_ERROR");
    return;
  }

  // High value threshold: If order >= 5000 (or configured prepaidThreshold)
  const highValueThreshold = Number((tenant.settings as any)?.highValueThreshold) || 5000;
  const prepaidThreshold = Number((tenant.settings as any)?.prepaidThreshold) || 120;
  const isHighValue = calculation.total >= highValueThreshold;

  if (calculation.total >= prepaidThreshold && (tenant.settings as any)?.enforcePrepaidForHighValue && paymentMethod !== "PAY_NOW") {
    errorResponse(
      res,
      400,
      `Orders of ${tenant.profile.currency || "₹"}${prepaidThreshold} or more require prepaid online payment. Please select Pay Now.`,
      "PREPAID_REQUIRED_FOR_HIGH_VALUE"
    );
    return;
  }

  // Cash phone verification check
  const requireCashPhone = settings.requireCashPhoneVerification === true;
  const maxCashWithoutPhone = Number(settings.maxCashOrderWithoutPhone ?? 2000);
  if (isPayLater && (requireCashPhone || calculation.total > maxCashWithoutPhone)) {
    if (!customerPhone || String(customerPhone).trim().length < 8) {
      errorResponse(
        res,
        400,
        `A valid mobile phone number is required for this cash order (orders over ${tenant.profile.currency || "₹"}${maxCashWithoutPhone}).`,
        "PHONE_REQUIRED"
      );
      return;
    }
  }

  // Extract First Name Anchor and Device Fingerprint
  const dinerFirstName = String(
    req.body.dinerFirstName ||
    req.body.firstName ||
    req.body.customerName ||
    (items && items[0]?.addedByDiner) ||
    ""
  ).trim();
  const deviceId = String(req.body.deviceId || "").trim();
  const isHostBypassed = Boolean(req.body.isHostBypassed);

  const cleanTableNumber = String(tableData.tableNumber ?? tableId).replace(/^Table\s*/i, "").trim();
  const paddedTableNumber = /^\d+$/.test(cleanTableNumber) ? cleanTableNumber.padStart(2, "0") : cleanTableNumber;
  const warningTag = isHostBypassed
    ? `⚠️ Table ${paddedTableNumber} Add-on (Host Unreachable - Verify in Person)`
    : (req.body.warningTag || null);

  // Workflow status determination: QR table orders are immediately created as NEEDS_APPROVAL
  console.log(`[ORDER_FLOW] Validation completed: ${Date.now() - t0}ms`);
  const initialStatus = "NEEDS_APPROVAL";
  console.log(`[ORDER_FLOW] NEEDS_APPROVAL set`);
  let verificationReason: string | null = "Waiting for restaurant confirmation";
  let requiresStaffApproval = true;
  let riskScore = "LOW";
  const riskSignals: string[] = [];

  // Payment Initial State
  const initialPaymentMethod =
    paymentMethod === "PAY_NOW"
      ? "PAY_NOW"
      : paymentMethod === "CASH"
      ? "CASH"
      : "PAY_LATER";

  const initialPaymentStatus =
    initialPaymentMethod === "CASH" ? "CASH_PENDING" : "PENDING";

  const recentList = Object.values(existingOrders);
  let highestNum = 100;
  for (const o of recentList) {
    const num = Number((o as any)?.orderNumber || 0);
    if (num > highestNum) highestNum = num;
  }
  const orderNumber = highestNum + 1;

  const orderId = createId("ord");
  const now = new Date().toISOString();

  // Extract host info for order metadata (non-blocking)
  const hostDeviceId = activeSession?.hostDeviceId || tableData?.hostDeviceId || null;
  const hostName = activeSession?.hostName || tableData?.hostName || null;

  const newOrder = {
    id: orderId,
    restaurantId: tenant.id,
    restaurantSlug,
    tableId,
    tableNumber: String(tableData.tableNumber ?? tableId),
    tableLocation: tableData.location || null,
    sessionId: activeSessionId,
    orderNumber,
    status: initialStatus,
    verificationReason,
    paymentStatus: initialPaymentStatus,
    paymentMethod: initialPaymentMethod,
    source: "QR",
    items: calculation.items,
    subtotal: calculation.subtotal,
    taxes: calculation.taxes,
    total: calculation.total,
    customerNote: customerNote ? String(customerNote).slice(0, 300).trim() : null,
    customerPhone: customerPhone ? String(customerPhone).trim().slice(0, 20) : null,
    dinerFirstName: dinerFirstName || null,
    customerName: dinerFirstName || null,
    deviceId: deviceId || null,
    isHostBypassed,
    isAddon: Boolean(req.body.isAddon || isHostBypassed),
    warningTag: warningTag || null,
    idempotencyKey: idempotencyKey ? String(idempotencyKey).slice(0, 100) : null,
    requiresStaffApproval,
    riskScore,
    riskSignals,
    clientIp,
    createdAt: now,
    updatedAt: now,
    acceptedAt: (initialStatus as string) === "PREPARING" || isHostBypassed ? now : null,
    preparingAt: (initialStatus as string) === "PREPARING" ? now : null,
    readyAt: null,
    completedAt: null,
    cancelledAt: null,
    paidAt: null,
  };

  const cleanedOrder = cleanForFirebase(newOrder);

  // Authoritative Order Write: The ONLY blocking write for customer order creation
  console.log(`[ORDER_FLOW] Firebase order write started`);
  const tWriteStart = Date.now();
  await db.ref(`restaurants/${tenant.id}/orders/${orderId}`).set(cleanedOrder);
  console.log(`[ORDER_FLOW] Firebase order write completed: ${Date.now() - tWriteStart}ms`);

  const activeSessionToken = generateTableSessionToken(tenant.id, tableId, tableSlug, activeSessionId);

  const responsePayload = {
    ...cleanedOrder,
    sessionId: activeSessionId,
    tableSessionToken: activeSessionToken.token,
    sessionExpiresAt: activeSessionToken.expiresAt,
  };

  // Resolve idempotency lock for in-flight concurrent requests
  if (lockResolver) {
    lockResolver(responsePayload);
    setTimeout(() => inFlightIdempotencyMap.delete(idempotencyLockKey!), 30000);
  }

  // RETURN HTTP RESPONSE IMMEDIATELY TO CUSTOMER
  res.status(201).json(responsePayload);
  console.log(`[ORDER_FLOW] Response returned: ${Date.now() - t0}ms`);

  // =========================================================================
  // BACKGROUND / REALTIME PROCESSING (Decoupled from Customer Response)
  // Notifications, live order sync, table occupancy, host assignment, and KDS
  // =========================================================================
  setImmediate(async () => {
    const bgStart = Date.now();
    try {
      // 1. If new session was started, persist session asynchronously
      if (needsSessionCreate) {
        const nowIso = new Date().toISOString();
        const activeSessionData = {
          id: activeSessionId,
          restaurantId: tenant.id,
          tableId,
          tableNumber: String(tableData.tableNumber ?? tableId),
          location: tableData.location || null,
          status: "ACTIVE",
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        await db.ref(`restaurants/${tenant.id}/tableSessions/${activeSessionId}`).set(cleanForFirebase(activeSessionData)).catch(() => {});
      }

      // 2. Update table status and clear shared cart
      await Promise.allSettled([
        db.ref(`restaurants/${tenant.id}/tables/${tableId}`).update({
          activeSessionId,
          status: "OCCUPIED",
          updatedAt: Date.now(),
        }),
        db.ref(`restaurants/${tenant.id}/tableCarts/${tableId}`).remove(),
      ]);

      // 2. Assign Table Host if this is the first order from Phone 1
      if (!hostDeviceId && deviceId) {
        const assignedHostName = dinerFirstName || "Host";
        const cleanTable = String(tableData.tableNumber || tableId).replace(/^Table\s*/i, "").trim();
        const paddedTable = /^\d+$/.test(cleanTable) ? cleanTable.padStart(2, "0") : cleanTable;
        const hostDocKey = `table_${paddedTable}_host`;

        await Promise.allSettled([
          db.ref(`restaurants/${tenant.id}/tableSessions/${activeSessionId}`).update({
            hostDeviceId: deviceId,
            hostName: assignedHostName,
            hostDocKey,
            hostAssignedAt: Date.now(),
          }),
          db.ref(`restaurants/${tenant.id}/tables/${tableId}`).update({
            hostDeviceId: deviceId,
            hostName: assignedHostName,
            hostDocKey,
          }),
          db.ref(`restaurants/${tenant.id}/${hostDocKey}`).set({
            hostDeviceId: deviceId,
            hostName: assignedHostName,
            tableId,
            tableNumber: String(tableData.tableNumber ?? tableId),
            assignedAt: Date.now(),
            status: "ACTIVE",
          }),
        ]);
      }

      // 3. Broadcast realtime new order event & table cart cleared
      orderEvents.emit(`new_order:${tenant.id}`, cleanedOrder);
      orderEvents.emit(`new_order:${restaurantSlug}`, cleanedOrder);
      orderEvents.emit(`cart_updated:${tenant.id}`, {
        tableId,
        tableSlug,
        cart: { items: [], lastUpdatedAt: Date.now() },
      });

      // 4. Notification event for staff / owner approval dashboard
      const orderItemsCount = Array.isArray(cleanedOrder.items)
        ? cleanedOrder.items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0)
        : 1;

      const approvalEvent = {
        eventId: createId("evt_appr"),
        eventType: "ORDER_NEEDS_APPROVAL",
        restaurantId: tenant.id,
        restaurantSlug,
        orderId: cleanedOrder.id,
        orderNumber: cleanedOrder.orderNumber,
        tableId: cleanedOrder.tableId,
        tableNumber: String(cleanedOrder.tableNumber ?? ""),
        itemsCount: orderItemsCount,
        total: cleanedOrder.total,
        currency: tenant.profile?.currency || "₹",
        createdAt: now,
      };
      orderEvents.emit(`notification_event:${tenant.id}`, approvalEvent);
      orderEvents.emit(`notification_event:${restaurantSlug}`, approvalEvent);
      console.log(`[ORDER_FLOW] Background processing completed: ${Date.now() - bgStart}ms`);
    } catch (bgErr) {
      console.warn("[ORDER_FLOW] Background processing notice:", bgErr);
    }
  });
});

// ==========================================
// GROUP TAB WITH HOST APPROVAL ENDPOINTS
// ==========================================

// 1. Get Table Host Status (Checks if table has host and if current device is host)
router.get("/public/menu/:restaurantSlug/table/:tableSlug/host-status", async (req, res) => {
  const { restaurantSlug, tableSlug } = req.params;
  const clientDeviceId = String(req.query.deviceId || "").trim();

  const tenant = await resolveTenant(restaurantSlug);
  if (!tenant) {
    errorResponse(res, 404, "Restaurant not found.", "RESTAURANT_NOT_FOUND");
    return;
  }

  const db = getDatabase();
  const tablesSnap = await db.ref(`restaurants/${tenant.id}/tables`).get();
  const tables = (tablesSnap.val() ?? {}) as Record<string, any>;
  const resolved = resolveTableBySlugOrToken(tables, tableSlug);

  if (!resolved) {
    errorResponse(res, 404, "Table not found.", "TABLE_NOT_FOUND");
    return;
  }

  const tableId = resolved.id;
  const tableData = resolved.table;

  let activeSession: any = null;
  if (tableData.activeSessionId) {
    const sSnap = await db.ref(`restaurants/${tenant.id}/tableSessions/${tableData.activeSessionId}`).get();
    if (sSnap.exists()) activeSession = sSnap.val();
  }

  const hostDeviceId = activeSession?.hostDeviceId || tableData.hostDeviceId || null;
  const hostName = activeSession?.hostName || tableData.hostName || null;

  res.json({
    hasHost: Boolean(hostDeviceId),
    isCurrentDeviceHost: Boolean(hostDeviceId && clientDeviceId && hostDeviceId === clientDeviceId),
    host: hostDeviceId
      ? {
          hostDeviceId,
          hostName: hostName || "Table Host",
          tableId,
          tableNumber: String(tableData.tableNumber ?? tableId),
          status: "ACTIVE",
        }
      : null,
  });
});

// 2. Submit Guest Add-on Order for Host Approval
router.post("/public/menu/:restaurantSlug/table/:tableSlug/pending-orders", async (req, res) => {
  const { restaurantSlug, tableSlug } = req.params;
  const { items, customerNote, deviceId, guestName } = req.body ?? {};

  const tenant = await resolveTenant(restaurantSlug);
  if (!tenant) {
    errorResponse(res, 404, "Restaurant not found.", "RESTAURANT_NOT_FOUND");
    return;
  }

  const db = getDatabase();
  const tablesSnap = await db.ref(`restaurants/${tenant.id}/tables`).get();
  const tables = (tablesSnap.val() ?? {}) as Record<string, any>;
  const resolved = resolveTableBySlugOrToken(tables, tableSlug);

  if (!resolved) {
    errorResponse(res, 404, "Table not found.", "TABLE_NOT_FOUND");
    return;
  }

  const tableId = resolved.id;
  const tableData = resolved.table;

  let activeSession: any = null;
  if (tableData.activeSessionId) {
    const sSnap = await db.ref(`restaurants/${tenant.id}/tableSessions/${tableData.activeSessionId}`).get();
    if (sSnap.exists()) activeSession = sSnap.val();
  }

  const hostDeviceId = activeSession?.hostDeviceId || tableData.hostDeviceId || "unknown_host";
  const hostName = activeSession?.hostName || tableData.hostName || "Host";

  const taxRate = Number(tenant.settings?.taxRate ?? 0.05);
  let calculation;
  try {
    calculation = await calculateOrderSnapshot(tenant.id, items, taxRate);
  } catch (err: any) {
    errorResponse(res, 400, err.message ?? "Failed to validate order items.", "CALCULATION_ERROR");
    return;
  }

  const cleanGuestName = String(guestName || "").trim() || "Guest";
  const itemsSummary = Array.isArray(calculation.items)
    ? calculation.items
        .slice(0, 3)
        .map((it: any) => `${it.quantity}x ${it.name}`)
        .join(", ") + (calculation.items.length > 3 ? ` + ${calculation.items.length - 3} more` : "")
    : "Add-on items";

  const pendingId = createId("pend");
  const now = Date.now();
  const expiresAt = now + 60000; // 60 seconds

  const pendingRecord = {
    id: pendingId,
    restaurantId: tenant.id,
    restaurantSlug,
    tableId,
    tableNumber: String(tableData.tableNumber ?? tableId),
    hostDeviceId,
    hostName,
    guestDeviceId: String(deviceId || "").trim(),
    guestName: cleanGuestName,
    items: calculation.items,
    itemsSummary,
    subtotal: calculation.subtotal,
    taxes: calculation.taxes,
    totalAmount: calculation.total,
    currency: tenant.profile?.currency || "₹",
    customerNote: customerNote ? String(customerNote).slice(0, 300).trim() : null,
    status: "PENDING_HOST_APPROVAL",
    createdAt: now,
    expiresAt,
  };

  const cleaned = cleanForFirebase(pendingRecord);
  await db.ref(`restaurants/${tenant.id}/pendingHostApprovals/${pendingId}`).set(cleaned);

  // Real-time broadcast for host listener
  orderEvents.emit(`pending_host_approval:${tenant.id}`, cleaned);
  orderEvents.emit(`pending_host_approval:${restaurantSlug}`, cleaned);

  res.status(201).json({
    success: true,
    pendingOrder: cleaned,
  });
});

// Helper to process 60-Second Kitchen Bypass -> Forward to Staff Order Approval Section
async function processPendingOrderBypass(
  tenantId: string,
  restaurantSlug: string,
  pendingId: string,
  pendingData?: any
): Promise<{ success: boolean; orderId?: string; warningTag?: string }> {
  const db = getDatabase();
  let pending = pendingData;
  if (!pending) {
    const snap = await db.ref(`restaurants/${tenantId}/pendingHostApprovals/${pendingId}`).get();
    if (!snap.exists()) return { success: false };
    pending = snap.val();
  }

  if (pending.status === "APPROVED" || pending.status === "BYPASSED_TIMEOUT") {
    return { success: true, orderId: pending.orderId, warningTag: pending.warningTag };
  }

  const cleanTableNumber = String(pending.tableNumber ?? "").replace(/^Table\s*/i, "").trim();
  const paddedTableNumber = /^\d+$/.test(cleanTableNumber) ? cleanTableNumber.padStart(2, "0") : cleanTableNumber;
  const warningTag = `⚠️ Table ${paddedTableNumber} Add-on (Host Unreachable - Verify in Person)`;

  // Resolve authoritative active table session
  const tablesSnap = await db.ref(`restaurants/${tenantId}/tables`).get();
  const tables = (tablesSnap.val() ?? {}) as Record<string, any>;
  const resolvedTable = resolveTableBySlugOrToken(tables, pending.tableId);
  const actualTableId = resolvedTable?.id || pending.tableId;
  let activeSessionId = resolvedTable?.table?.activeSessionId || null;

  if (activeSessionId) {
    const sSnap = await db.ref(`restaurants/${tenantId}/tableSessions/${activeSessionId}`).get();
    if (!sSnap.exists() || sSnap.val()?.status !== "ACTIVE") {
      activeSessionId = null;
    }
  }

  if (!activeSessionId && actualTableId) {
    const allSessSnap = await db.ref(`restaurants/${tenantId}/tableSessions`).get();
    if (allSessSnap.exists()) {
      const allSess = allSessSnap.val() as Record<string, any>;
      const match = Object.values(allSess).find(
        (s: any) => s && s.tableId === actualTableId && s.status === "ACTIVE"
      );
      if (match) activeSessionId = match.id;
    }
  }

  if (!activeSessionId && actualTableId) {
    activeSessionId = createId("sess");
    const nowMs = Date.now();
    const newSession = {
      id: activeSessionId,
      restaurantId: tenantId,
      tableId: actualTableId,
      tableNumber: String(pending.tableNumber ?? actualTableId),
      status: "ACTIVE",
      createdAt: nowMs,
      updatedAt: nowMs,
    };
    await Promise.all([
      db.ref(`restaurants/${tenantId}/tableSessions/${activeSessionId}`).set(newSession),
      db.ref(`restaurants/${tenantId}/tables/${actualTableId}`).update({
        activeSessionId,
        status: "OCCUPIED",
        updatedAt: nowMs,
      }),
    ]);
  }

  const existingOrdersSnap = await db.ref(`restaurants/${tenantId}/orders`).get();
  const existingOrders = (existingOrdersSnap.val() ?? {}) as Record<string, any>;
  const orderCount = Object.keys(existingOrders).length;
  const orderNumber = 101 + orderCount;

  const orderId = createId("ord");
  const nowIso = new Date().toISOString();

  // Forward to Staff Order Approval section ("Needs Approval" tab)
  const bypassedOrder = {
    id: orderId,
    restaurantId: tenantId,
    restaurantSlug,
    tableId: pending.tableId,
    tableNumber: String(pending.tableNumber ?? ""),
    sessionId: activeSessionId,
    orderNumber,
    status: "NEEDS_APPROVAL", // Prominently displayed in Staff Order Approval section
    verificationReason: "Host Unreachable (60s Timeout) - Verify with Table in Person",
    paymentStatus: "PENDING",
    paymentMethod: "PAY_LATER",
    source: "QR",
    items: pending.items,
    subtotal: pending.subtotal,
    taxes: pending.taxes,
    total: pending.totalAmount,
    customerNote: pending.customerNote,
    dinerFirstName: pending.guestName,
    customerName: pending.guestName,
    deviceId: pending.guestDeviceId,
    isHostBypassed: true,
    isAddon: true,
    warningTag,
    requiresStaffApproval: true, // Requires staff verification before kitchen fires
    riskScore: "MEDIUM",
    riskSignals: ["Host Unreachable (60s Timeout) - Verify with Table in Person"],
    clientIp: "",
    createdAt: nowIso,
    updatedAt: nowIso,
    acceptedAt: null,
    preparingAt: null,
    readyAt: null,
    completedAt: null,
    cancelledAt: null,
    paidAt: null,
  };

  const cleanedOrder = cleanForFirebase(bypassedOrder);

  const updates: Record<string, any> = {
    [`restaurants/${tenantId}/orders/${orderId}`]: cleanedOrder,
    [`restaurants/${tenantId}/pendingHostApprovals/${pendingId}/status`]: "BYPASSED_TIMEOUT",
    [`restaurants/${tenantId}/pendingHostApprovals/${pendingId}/orderId`]: orderId,
    [`restaurants/${tenantId}/pendingHostApprovals/${pendingId}/bypassedAt`]: Date.now(),
    [`restaurants/${tenantId}/pendingHostApprovals/${pendingId}/warningTag`]: warningTag,
  };

  if (activeSessionId) {
    updates[`restaurants/${tenantId}/tableSessions/${activeSessionId}/orders/${orderId}`] = {
      id: orderId,
      orderNumber,
      total: pending.totalAmount,
      status: "NEEDS_APPROVAL",
      createdAt: nowIso,
    };
  }

  await db.ref().update(updates);

  // Broadcast to Staff Order Approval section and sound chime
  const approvalEvent = {
    eventId: createId("evt_appr"),
    eventType: "ORDER_NEEDS_APPROVAL",
    restaurantId: tenantId,
    restaurantSlug,
    orderId,
    orderNumber,
    tableId: pending.tableId,
    tableNumber: String(pending.tableNumber ?? ""),
    itemsCount: Array.isArray(pending.items) ? pending.items.reduce((s: number, i: any) => s + (i.quantity || 1), 0) : 1,
    total: pending.totalAmount,
    currency: "₹",
    warningTag,
    createdAt: nowIso,
  };

  orderEvents.emit(`notification_event:${tenantId}`, approvalEvent);
  orderEvents.emit(`notification_event:${restaurantSlug}`, approvalEvent);
  orderEvents.emit(`order_needs_approval:${tenantId}`, cleanedOrder);
  orderEvents.emit(`order_needs_approval:${restaurantSlug}`, cleanedOrder);
  orderEvents.emit(`new_order:${tenantId}`, cleanedOrder);
  orderEvents.emit(`new_order:${restaurantSlug}`, cleanedOrder);
  orderEvents.emit(`order_status_updated:${tenantId}`, cleanedOrder);
  orderEvents.emit(`order_status_updated:${restaurantSlug}`, cleanedOrder);

  return { success: true, orderId, warningTag };
}

// 3. Host Action: Approve Pending Guest Order -> Move to Main KDS Queue
router.post("/public/menu/:restaurantSlug/table/:tableSlug/pending-orders/:pendingId/approve", async (req, res) => {
  const { restaurantSlug, tableSlug, pendingId } = req.params;

  const tenant = await resolveTenant(restaurantSlug);
  if (!tenant) {
    errorResponse(res, 404, "Restaurant not found.", "RESTAURANT_NOT_FOUND");
    return;
  }

  const db = getDatabase();
  const pendingSnap = await db.ref(`restaurants/${tenant.id}/pendingHostApprovals/${pendingId}`).get();
  if (!pendingSnap.exists()) {
    errorResponse(res, 404, "Pending order not found or already processed.", "PENDING_NOT_FOUND");
    return;
  }

  const pending = pendingSnap.val();
  if (pending.status === "APPROVED" && pending.orderId) {
    res.json({ success: true, orderId: pending.orderId });
    return;
  }

  // Resolve active table session
  const tablesSnap = await db.ref(`restaurants/${tenant.id}/tables`).get();
  const tables = (tablesSnap.val() ?? {}) as Record<string, any>;
  const resolvedTable = resolveTableBySlugOrToken(tables, pending.tableId || tableSlug);
  const activeSessionId = resolvedTable?.table?.activeSessionId || null;

  // Create real ticket for Kitchen fulfillment
  const existingOrdersSnap = await db.ref(`restaurants/${tenant.id}/orders`).get();
  const existingOrders = (existingOrdersSnap.val() ?? {}) as Record<string, any>;
  const orderCount = Object.keys(existingOrders).length;
  const orderNumber = 101 + orderCount;

  const orderId = createId("ord");
  const nowIso = new Date().toISOString();

  const approvedOrder = {
    id: orderId,
    restaurantId: tenant.id,
    restaurantSlug,
    tableId: pending.tableId,
    tableNumber: String(pending.tableNumber ?? ""),
    sessionId: activeSessionId,
    orderNumber,
    status: "NEW", // Sent directly to kitchen for preparation
    verificationReason: null,
    paymentStatus: "PENDING",
    paymentMethod: "PAY_LATER",
    source: "QR",
    items: pending.items,
    subtotal: pending.subtotal,
    taxes: pending.taxes,
    total: pending.totalAmount,
    customerNote: pending.customerNote,
    dinerFirstName: pending.guestName,
    customerName: pending.guestName,
    deviceId: pending.guestDeviceId,
    isHostApproved: true,
    isAddon: true,
    approvedByHostName: pending.hostName,
    requiresStaffApproval: false,
    riskScore: "LOW",
    riskSignals: [],
    clientIp: String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || ""),
    createdAt: nowIso,
    updatedAt: nowIso,
    acceptedAt: nowIso,
    preparingAt: null,
    readyAt: null,
    completedAt: null,
    cancelledAt: null,
    paidAt: null,
  };

  const cleanedOrder = cleanForFirebase(approvedOrder);

  const updates: Record<string, any> = {
    [`restaurants/${tenant.id}/orders/${orderId}`]: cleanedOrder,
    [`restaurants/${tenant.id}/pendingHostApprovals/${pendingId}/status`]: "APPROVED",
    [`restaurants/${tenant.id}/pendingHostApprovals/${pendingId}/orderId`]: orderId,
    [`restaurants/${tenant.id}/pendingHostApprovals/${pendingId}/approvedAt`]: Date.now(),
  };

  if (activeSessionId) {
    updates[`restaurants/${tenant.id}/tableSessions/${activeSessionId}/orders/${orderId}`] = {
      id: orderId,
      orderNumber,
      total: pending.totalAmount,
      status: "NEW",
      createdAt: nowIso,
    };
  }

  await db.ref().update(updates);

  // Broadcast to KDS and diners
  orderEvents.emit(`new_order:${tenant.id}`, cleanedOrder);
  orderEvents.emit(`new_order:${restaurantSlug}`, cleanedOrder);
  orderEvents.emit(`order_status_updated:${tenant.id}`, cleanedOrder);
  orderEvents.emit(`order_status_updated:${restaurantSlug}`, cleanedOrder);

  const kdsEvent = {
    eventId: createId("evt_kds"),
    eventType: "ORDER_APPROVED_FOR_KDS",
    restaurantId: tenant.id,
    restaurantSlug,
    orderId,
    orderNumber,
    tableId: pending.tableId,
    tableNumber: String(pending.tableNumber ?? ""),
    itemsCount: Array.isArray(pending.items) ? pending.items.reduce((s: number, i: any) => s + (i.quantity || 1), 0) : 1,
    total: pending.totalAmount,
    currency: tenant.profile?.currency || "₹",
    createdAt: nowIso,
  };
  orderEvents.emit(`notification_event:${tenant.id}`, kdsEvent);
  orderEvents.emit(`notification_event:${restaurantSlug}`, kdsEvent);

  res.json({
    success: true,
    orderId,
  });
});

// 4. Host Action: Reject Pending Guest Order
router.post("/public/menu/:restaurantSlug/table/:tableSlug/pending-orders/:pendingId/reject", async (req, res) => {
  const { restaurantSlug, pendingId } = req.params;

  const tenant = await resolveTenant(restaurantSlug);
  if (!tenant) {
    errorResponse(res, 404, "Restaurant not found.", "RESTAURANT_NOT_FOUND");
    return;
  }

  const db = getDatabase();
  await db.ref(`restaurants/${tenant.id}/pendingHostApprovals/${pendingId}`).update({
    status: "REJECTED",
    rejectedAt: Date.now(),
    rejectReason: req.body?.reason || "Declined by table host",
  });

  res.json({ success: true });
});

// 5. 60-Second Kitchen Bypass (Edge Case Handling)
router.post("/public/menu/:restaurantSlug/table/:tableSlug/pending-orders/:pendingId/bypass", async (req, res) => {
  const { restaurantSlug, pendingId } = req.params;

  const tenant = await resolveTenant(restaurantSlug);
  if (!tenant) {
    errorResponse(res, 404, "Restaurant not found.", "RESTAURANT_NOT_FOUND");
    return;
  }

  const result = await processPendingOrderBypass(tenant.id, restaurantSlug, pendingId);
  if (result.success) {
    res.json({
      success: true,
      orderId: result.orderId,
      warningTag: result.warningTag,
    });
  } else {
    errorResponse(res, 404, "Pending order not found.", "PENDING_NOT_FOUND");
  }
});

// 6. List Pending Orders for Host
router.get("/public/menu/:restaurantSlug/table/:tableSlug/pending-orders", async (req, res) => {
  const { restaurantSlug, tableSlug } = req.params;

  const tenant = await resolveTenant(restaurantSlug);
  if (!tenant) {
    res.json({ orders: [] });
    return;
  }

  const db = getDatabase();
  const tablesSnap = await db.ref(`restaurants/${tenant.id}/tables`).get();
  const tables = (tablesSnap.val() ?? {}) as Record<string, any>;
  const resolved = resolveTableBySlugOrToken(tables, tableSlug);

  const tableId = resolved ? resolved.id : tableSlug;
  const pendingSnap = await db.ref(`restaurants/${tenant.id}/pendingHostApprovals`).get();
  if (!pendingSnap.exists()) {
    res.json({ orders: [] });
    return;
  }

  const allPending = Object.values((pendingSnap.val() ?? {}) as Record<string, any>);
  const now = Date.now();

  // Auto-bypass any order where 60s has elapsed without host response
  for (const p of allPending) {
    if (p && p.status === "PENDING_HOST_APPROVAL" && p.expiresAt && p.expiresAt <= now) {
      await processPendingOrderBypass(tenant.id, restaurantSlug, p.id, p);
    }
  }

  const tablePending = allPending.filter((p: any) => {
    if (!p) return false;
    const matchesTable =
      p.tableId === tableId ||
      p.tableNumber === String(resolved?.table?.tableNumber || "") ||
      p.tableId === tableSlug;
    const notExpired = !p.expiresAt || p.expiresAt > now;
    return matchesTable && p.status === "PENDING_HOST_APPROVAL" && notExpired;
  });

  res.json({ orders: tablePending });
});

// 7. Get Single Pending Order Status
router.get("/public/menu/:restaurantSlug/table/:tableSlug/pending-orders/:pendingId", async (req, res) => {
  const { restaurantSlug, pendingId } = req.params;

  const tenant = await resolveTenant(restaurantSlug);
  if (!tenant) {
    errorResponse(res, 404, "Restaurant not found.", "RESTAURANT_NOT_FOUND");
    return;
  }

  const db = getDatabase();
  const snap = await db.ref(`restaurants/${tenant.id}/pendingHostApprovals/${pendingId}`).get();
  if (!snap.exists()) {
    errorResponse(res, 404, "Pending order not found.", "PENDING_NOT_FOUND");
    return;
  }

  let orderData = snap.val();
  if (orderData && orderData.status === "PENDING_HOST_APPROVAL" && orderData.expiresAt && orderData.expiresAt <= Date.now()) {
    const bypassRes = await processPendingOrderBypass(tenant.id, restaurantSlug, pendingId, orderData);
    if (bypassRes.success) {
      const refreshedSnap = await db.ref(`restaurants/${tenant.id}/pendingHostApprovals/${pendingId}`).get();
      if (refreshedSnap.exists()) orderData = refreshedSnap.val();
    }
  }

  res.json(orderData);
});

// 2. Customer View Order Status
router.get("/public/orders/:orderId", async (req, res) => {
  const { orderId } = req.params;
  const db = getDatabase();

  const restaurantsSnap = await db.ref("restaurants").get();
  const restaurants = (restaurantsSnap.val() ?? {}) as Record<string, any>;

  for (const [, restData] of Object.entries(restaurants)) {
    const orders = (restData.orders ?? {}) as Record<string, any>;
    if (orders[orderId]) {
      let order = orders[orderId];
      const restProfile = restData.profile ?? {};

      // Self-healing normalization for legacy orders saved with un-normalized tax rate
      const itemSum = Array.isArray(order.items)
        ? order.items.reduce((s: number, i: any) => s + (Number(i.subtotal || i.price * i.quantity) || 0), 0)
        : 0;
      const subtotal = Number(order.subtotal) || itemSum;
      let total = Number(order.total);
      if (subtotal > 0 && total >= subtotal * 3) {
        const rawTaxRate = Number(order.taxRate ?? 0.05);
        const normalizedRate = rawTaxRate > 1 ? rawTaxRate / 100 : (rawTaxRate <= 0 ? 0.05 : rawTaxRate);
        const correctTaxes = Math.round(subtotal * normalizedRate * 100) / 100;
        total = Math.round((subtotal + correctTaxes) * 100) / 100;
        order = { ...order, subtotal, taxes: correctTaxes, total };
      }

      const currentPlan = restProfile.plan ?? "starter";
      const waiterCallsEnabled = canUseFeature(currentPlan, "service_calls");
      const dinerReviewsEnabled = canUseFeature(currentPlan, "diner_reviews");

      let reviewedDishIds: string[] = [];
      let reviewsByDishId: Record<string, any> = {};

      if (dinerReviewsEnabled && order.status === "COMPLETED") {
        try {
          const restId = restData.id || restProfile.id || order.restaurantId;
          const reviewsSnap = await db.ref(`restaurants/${restId}/dishReviews`).get();
          const allReviews = (reviewsSnap.val() ?? {}) as Record<string, any>;
          const orderReviews = Object.values(allReviews).filter((r: any) => r && r.orderId === orderId);
          for (const r of orderReviews) {
            if (r.menuItemId) {
              reviewedDishIds.push(r.menuItemId);
              reviewsByDishId[r.menuItemId] = {
                id: r.id,
                rating: r.rating,
                comment: r.comment,
                createdAt: r.createdAt,
              };
            }
          }
        } catch {}
      }

      let sessionOrders: any[] = [];
      let sessionBill: any = null;
      let sessionData: any = null;

      const sessionId = order.sessionId;
      const tableId = order.tableId;
      const restId = restData.id || restProfile.id || order.restaurantId;

      if (sessionId || tableId) {
        if (sessionId) {
          try {
            const sessSnap = await db.ref(`restaurants/${restId}/tableSessions/${sessionId}`).get();
            if (sessSnap.exists()) sessionData = sessSnap.val();
          } catch {}
        }
        let sessSubtotal = 0;
        let sessTaxes = 0;
        let sessTotal = 0;
        let activeOrdsCount = 0;

        for (const [sOrdId, sOrd] of Object.entries(orders)) {
          if (!sOrd) continue;
          const matchSession = sessionId ? sOrd.sessionId === sessionId : false;
          const matchTable = !sessionId && tableId ? sOrd.tableId === tableId : false;

          if (matchSession || matchTable) {
            const isCancelled = sOrd.status === "CANCELLED" || sOrd.status === "DECLINED";
            const itemSum2 = Array.isArray(sOrd.items)
              ? sOrd.items.reduce((s: number, i: any) => s + (Number(i.subtotal || i.price * i.quantity) || 0), 0)
              : 0;
            const ordSub = Number(sOrd.subtotal) || itemSum2;
            let ordTot = Number(sOrd.total) || ordSub;
            let ordTax = Number(sOrd.taxes) || Math.max(0, ordTot - ordSub);

            sessionOrders.push({
              id: sOrdId,
              orderNumber: sOrd.orderNumber || sOrdId.slice(-4).toUpperCase(),
              status: sOrd.status,
              paymentStatus: sOrd.paymentStatus || "UNPAID",
              paymentMethod: sOrd.paymentMethod || null,
              subtotal: ordSub,
              taxes: ordTax,
              total: ordTot,
              itemsCount: Array.isArray(sOrd.items) ? sOrd.items.length : 0,
              items: Array.isArray(sOrd.items) ? sOrd.items : [],
              createdAt: sOrd.createdAt,
              updatedAt: sOrd.updatedAt || sOrd.createdAt,
              orderSource: sOrd.orderSource || sOrd.source || "QR",
            });

            if (!isCancelled) {
              sessSubtotal += ordSub;
              sessTaxes += ordTax;
              sessTotal += ordTot;
              if (["NEW", "APPROVED", "ACCEPTED", "PREPARING", "READY"].includes(sOrd.status)) {
                activeOrdsCount++;
              }
            }
          }
        }

        sessionOrders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        sessSubtotal = Math.round(sessSubtotal * 100) / 100;
        sessTaxes = Math.round(sessTaxes * 100) / 100;
        sessTotal = Math.round(sessTotal * 100) / 100;

        const validOrds = sessionOrders.filter((o) => o.status !== "CANCELLED" && o.status !== "DECLINED");
        const isSessionClosed = sessionData?.status === "CLOSED";
        const isPaid = Boolean(
          (isSessionClosed && sessionData?.paymentStatus === "PAID") ||
          sessionData?.paymentStatus === "PAID"
        );

        sessionBill = validOrds.length > 0 ? {
          ordersCount: validOrds.length,
          totalOrdersCount: sessionOrders.length,
          activeOrdersCount: activeOrdsCount,
          subtotal: sessSubtotal,
          taxes: sessTaxes,
          total: sessTotal,
          currency: restProfile.currency ?? "₹",
          paymentStatus: isPaid ? "PAID" : "UNPAID",
          paymentMethod: sessionData?.paymentMethod || (isPaid ? "COUNTER" : "PAY_AT_COUNTER"),
          canOrderMore: sessionData?.status !== "CLOSED",
        } : null;
      }

      res.json({
        ...order,
        restaurantName: restProfile.name ?? "Restaurant",
        currency: restProfile.currency ?? "₹",
        restaurantSlug: restProfile.slug || "",
        sessionOrders,
        sessionBill,
        session: sessionData ? {
          id: sessionData.id,
          status: sessionData.status,
          paymentStatus: sessionBill?.paymentStatus || "UNPAID",
          paymentMethod: sessionData.paymentMethod || null,
          createdAt: sessionData.createdAt,
          closedAt: sessionData.closedAt || null,
        } : null,
        features: {
          waiterCalls: waiterCallsEnabled,
          dinerReviews: dinerReviewsEnabled,
        },
        reviewsEligible: dinerReviewsEnabled && order.status === "COMPLETED",
        reviewedDishIds,
        reviewsByDishId,
      });
      return;
    }
  }

  errorResponse(res, 404, "Order not found.", "ORDER_NOT_FOUND");
});

// 2c. Customer Submit Dish Review (Only for COMPLETED orders, strictly verified)
router.post("/public/orders/:orderId/reviews", async (req, res) => {
  const { orderId } = req.params;
  const { menuItemId, rating, comment } = req.body ?? {};

  const db = getDatabase();
  const restaurantsSnap = await db.ref("restaurants").get();
  const restaurants = (restaurantsSnap.val() ?? {}) as Record<string, any>;

  let matchedRestaurantId = "";
  let matchedOrder: any = null;
  let matchedRestaurant: any = null;

  for (const [restId, restData] of Object.entries(restaurants)) {
    const orders = (restData.orders ?? {}) as Record<string, any>;
    if (orders[orderId]) {
      matchedRestaurantId = restId;
      matchedOrder = orders[orderId];
      matchedRestaurant = restData;
      break;
    }
  }

  if (!matchedOrder || !matchedRestaurant) {
    errorResponse(res, 404, "Order not found.", "ORDER_NOT_FOUND");
    return;
  }

  const currentPlan = matchedRestaurant.profile?.plan ?? "starter";
  if (!canUseFeature(currentPlan, "diner_reviews")) {
    errorResponse(res, 403, "Reviews are not enabled for this restaurant's current plan.", "PLAN_LIMITATION");
    return;
  }

  // Strictly enforce order completion: Order must be in COMPLETED status
  if (matchedOrder.status !== "COMPLETED") {
    errorResponse(
      res,
      400,
      "Reviews can only be submitted after your meal order has been completed.",
      "ORDER_NOT_COMPLETED"
    );
    return;
  }

  // Validate that the dish was actually ordered in this order
  const orderItems = Array.isArray(matchedOrder.items) ? matchedOrder.items : [];
  const targetItemId = String(menuItemId ?? "").trim();
  const orderedItem = orderItems.find(
    (i: any) =>
      i.menuItemId === targetItemId ||
      i.itemId === targetItemId ||
      i.id === targetItemId ||
      (i.name && targetItemId && i.name.toLowerCase() === targetItemId.toLowerCase())
  );

  if (!orderedItem) {
    errorResponse(
      res,
      400,
      "You can only review dishes that were actually included in your completed order.",
      "ITEM_NOT_IN_ORDER"
    );
    return;
  }

  // Validate rating: integer between 1 and 5
  const numRating = Number(rating);
  if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
    errorResponse(res, 400, "Rating must be a whole number between 1 and 5 stars.", "INVALID_RATING");
    return;
  }

  // Validate comment: optional, max 280 characters
  const cleanComment = typeof comment === "string" ? comment.trim().slice(0, 280) : null;

  // Check duplicate review: strictly 1 review per ordered dish per order
  const canonicalItemId = orderedItem.menuItemId || orderedItem.itemId || orderedItem.id || targetItemId;
  const existingReviewsSnap = await db.ref(`restaurants/${matchedRestaurantId}/dishReviews`).get();
  const existingReviews = (existingReviewsSnap.val() ?? {}) as Record<string, any>;

  const duplicate = Object.values(existingReviews).find(
    (r: any) =>
      r &&
      r.orderId === orderId &&
      (r.menuItemId === canonicalItemId || r.dishName === orderedItem.name)
  );

  if (duplicate) {
    errorResponse(
      res,
      409,
      "You have already submitted a review for this dish on this order.",
      "DUPLICATE_REVIEW"
    );
    return;
  }

  const reviewId = createId("drev");
  const now = new Date().toISOString();

  const newReview = {
    id: reviewId,
    restaurantId: matchedRestaurantId,
    restaurantSlug: matchedRestaurant.profile?.slug || matchedOrder.restaurantSlug,
    orderId,
    orderNumber: matchedOrder.orderNumber || null,
    tableNumber: String(matchedOrder.tableNumber ?? ""),
    menuItemId: canonicalItemId,
    dishName: orderedItem.name || "Dish",
    rating: numRating,
    comment: cleanComment,
    verified: true,
    hidden: false,
    createdAt: now,
  };

  await db.ref(`restaurants/${matchedRestaurantId}/dishReviews/${reviewId}`).set(cleanForFirebase(newReview));

  // Also record in feedback table so owner dashboard feedback metrics include it seamlessly
  const feedbackId = `fb_${reviewId}`;
  await db.ref(`restaurants/${matchedRestaurantId}/feedback/${feedbackId}`).set(cleanForFirebase({
    id: feedbackId,
    reviewId,
    dishName: orderedItem.name || "Dish",
    menuItemId: canonicalItemId,
    rating: numRating,
    comment: cleanComment ? `[${orderedItem.name}] ${cleanComment}` : `Rated ${orderedItem.name} ${numRating}★`,
    orderNumber: matchedOrder.orderNumber || null,
    tableNumber: String(matchedOrder.tableNumber ?? ""),
    orderId,
    verified: true,
    hidden: false,
    createdAt: Date.now(),
    customerName: "Verified Diner",
  }));

  res.json({
    success: true,
    message: "Thank you for your review!",
    review: newReview,
  });
});

// 2b. Customer Realtime Order Status SSE Stream
router.get("/public/orders/:orderId/stream", async (req, res) => {
  const { orderId } = req.params;
  const db = getDatabase();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  if (typeof (res as any).flushHeaders === "function") {
    (res as any).flushHeaders();
  }

  // Send initial order state
  let initialSessionId: string | null = null;
  try {
    const restaurantsSnap = await db.ref("restaurants").get();
    const restaurants = (restaurantsSnap.val() ?? {}) as Record<string, any>;
    for (const [, restData] of Object.entries(restaurants)) {
      const orders = (restData.orders ?? {}) as Record<string, any>;
      if (orders[orderId]) {
        initialSessionId = orders[orderId].sessionId || null;
        res.write(`event: order_status_updated\ndata: ${JSON.stringify(orders[orderId])}\n\n`);
        res.write(`data: ${JSON.stringify({ type: "order_status_updated", ...orders[orderId] })}\n\n`);
        break;
      }
    }
  } catch {}

  const onStatus = (updatedOrder: any) => {
    try {
      res.write(`event: order_status_updated\ndata: ${JSON.stringify(updatedOrder)}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "order_status_updated", ...updatedOrder })}\n\n`);
    } catch {}
  };

  const onSessionEvent = (eventData: any) => {
    try {
      res.write(`event: session_updated\ndata: ${JSON.stringify(eventData)}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "session_updated", ...eventData })}\n\n`);
    } catch {}
  };

  orderEvents.on(`order_status:${orderId}`, onStatus);
  if (initialSessionId) {
    orderEvents.on(`session_closed:${initialSessionId}`, onSessionEvent);
    orderEvents.on(`session_updated:${initialSessionId}`, onSessionEvent);
  }

  const heartbeat = setInterval(() => {
    try {
      res.write(": keep-alive\n\n");
    } catch {}
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    orderEvents.off(`order_status:${orderId}`, onStatus);
    if (initialSessionId) {
      orderEvents.off(`session_closed:${initialSessionId}`, onSessionEvent);
      orderEvents.off(`session_updated:${initialSessionId}`, onSessionEvent);
    }
  });
});

// 3. Customer Digital Payment Verification (Pay Now server-side settlement)
// Section 15 & 32: Customer cannot unilaterally mark an order or bill as paid.
// All payments must be settled by authenticated restaurant staff or processed via verified gateway webhook.
router.post("/public/orders/:orderId/pay", async (req, res) => {
  errorResponse(
    res,
    403,
    "Customer cannot directly mark orders or bills as paid. Payments must be settled by restaurant staff or processed via verified payment gateway webhook.",
    "CUSTOMER_PAYMENT_FORBIDDEN"
  );
});

  // Payment Gateway Webhook (for Stripe or gateway callbacks)
  router.post("/payments/webhook", async (req, res) => {
    const signature = (req.headers["x-webhook-signature"] || req.headers["stripe-signature"]) as string | undefined;
    const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;

    // In production, reject unauthenticated webhook calls if webhook secret is not configured
    if (process.env.NODE_ENV === "production" && !webhookSecret) {
      res.status(500).json({ received: false, error: "Payment webhook secret is not configured on server." });
      return;
    }

    // If webhook secret is configured in environment, enforce HMAC-SHA256 signature verification
    if (webhookSecret) {
      if (!signature) {
        res.status(401).json({ received: false, error: "Missing webhook signature header." });
        return;
      }
      const rawPayload = JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawPayload)
        .digest("hex");
      
      const timingSafeEqual = (a: string, b: string) => {
        const bufA = Buffer.from(a);
        const bufB = Buffer.from(b);
        return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
      };

      if (!timingSafeEqual(signature, expectedSignature)) {
        res.status(403).json({ received: false, error: "Invalid webhook signature." });
        return;
      }
    }

    const { event, eventId, orderId, restaurantId, status } = req.body ?? {};

    if (!orderId || !restaurantId) {
      res.status(400).json({ received: false, error: "Missing required order or restaurant metadata." });
      return;
    }

    const db = getDatabase();
    const orderRef = db.ref(`restaurants/${restaurantId}/orders/${orderId}`);
    const snap = await orderRef.get();

    if (!snap.exists()) {
      res.status(404).json({ received: false, error: "No matching order found for this payment callback." });
      return;
    }

    const currentOrder = snap.val();
    const now = new Date().toISOString();

    // Idempotency: Protect against duplicate payment callbacks
    if (eventId && currentOrder.lastWebhookEventId === eventId) {
      res.json({ received: true, deduplicated: true, status: currentOrder.paymentStatus });
      return;
    }

    if (event === "payment_intent.succeeded" || status === "PAID") {
      if (currentOrder.paymentStatus === "PAID") {
        res.json({ received: true, deduplicated: true, status: "PAID" });
        return;
      }
      await orderRef.update({
        paymentStatus: "PAID",
        paidAt: now,
        updatedAt: now,
        lastWebhookEventId: eventId || null,
      });
    } else if (event === "payment_intent.payment_failed" || status === "FAILED") {
      if (currentOrder.paymentStatus === "FAILED") {
        res.json({ received: true, deduplicated: true, status: "FAILED" });
        return;
      }
      await orderRef.update({
        paymentStatus: "FAILED",
        updatedAt: now,
        lastWebhookEventId: eventId || null,
      });
    }

    res.json({ received: true, orderId, status: currentOrder.paymentStatus });
  });

// ---------------------------------------------------------------------------
// STAFF / KITCHEN / ADMIN ROUTES
// ---------------------------------------------------------------------------

// Realtime Server-Sent Events (SSE) Stream for Instant New Order Alerts
router.get("/restaurants/:restaurantSlug/orders/stream", async (req, res) => {
  const tenant = await resolveTenant(req.params.restaurantSlug);
  if (!tenant) {
    errorResponse(res, 404, "Restaurant not found", "NOT_FOUND");
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof (res as any).flushHeaders === "function") {
    (res as any).flushHeaders();
  }

  // Send initial ping
  res.write(`data: ${JSON.stringify({ type: "connected", restaurantId: tenant.id, timestamp: Date.now() })}\n\n`);

  const onNotification = (eventData: any) => {
    try {
      res.write(`event: notification_event\ndata: ${JSON.stringify(eventData)}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "notification_event", ...eventData })}\n\n`);
      if (eventData.eventType === "ORDER_NEEDS_APPROVAL") {
        res.write(`event: order_needs_approval\ndata: ${JSON.stringify(eventData)}\n\n`);
      } else if (eventData.eventType === "ORDER_APPROVED_FOR_KDS") {
        res.write(`event: order_approved_for_kds\ndata: ${JSON.stringify(eventData)}\n\n`);
      } else if (eventData.eventType === "WAITER_CALL") {
        res.write(`event: waiter_call\ndata: ${JSON.stringify(eventData)}\n\n`);
      }
    } catch {}
  };

  const onOrder = (order: any) => {
    try {
      res.write(`event: new_order\ndata: ${JSON.stringify(order)}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "new_order", order })}\n\n`);
    } catch {}
  };

  const onStatus = (data: any) => {
    try {
      res.write(`event: order_status_updated\ndata: ${JSON.stringify(data)}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "order_status_updated", ...data })}\n\n`);
      if (data && (data.status === "APPROVED" || data.status === "ACCEPTED")) {
        res.write(`event: order_approved\ndata: ${JSON.stringify(data)}\n\n`);
        res.write(`data: ${JSON.stringify({ type: "order_approved", order: data, ...data })}\n\n`);
      }
    } catch {}
  };

  const onWaiter = (data: any) => {
    try {
      res.write(`event: waiter_request\ndata: ${JSON.stringify(data)}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "waiter_request", ...data })}\n\n`);
    } catch {}
  };

  const onPlan = (data: any) => {
    try {
      res.write(`event: plan_updated\ndata: ${JSON.stringify(data)}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "plan_updated", ...data })}\n\n`);
    } catch {}
  };

  const onPlanRequest = (data: any) => {
    try {
      res.write(`event: plan_request_updated\ndata: ${JSON.stringify(data)}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "plan_request_updated", ...data })}\n\n`);
    } catch {}
  };

  orderEvents.on(`notification_event:${tenant.id}`, onNotification);
  orderEvents.on(`notification_event:${req.params.restaurantSlug}`, onNotification);
  orderEvents.on(`new_order:${tenant.id}`, onOrder);
  orderEvents.on(`new_order:${req.params.restaurantSlug}`, onOrder);
  orderEvents.on(`order_status:${tenant.id}`, onStatus);
  orderEvents.on(`order_status:${req.params.restaurantSlug}`, onStatus);
  orderEvents.on(`waiter_request:${tenant.id}`, onWaiter);
  orderEvents.on(`waiter_request:${req.params.restaurantSlug}`, onWaiter);
  orderEvents.on(`waiter_request_updated:${tenant.id}`, onWaiter);
  orderEvents.on(`waiter_request_updated:${req.params.restaurantSlug}`, onWaiter);
  orderEvents.on(`plan_updated:${tenant.id}`, onPlan);
  orderEvents.on(`plan_updated:${req.params.restaurantSlug}`, onPlan);
  orderEvents.on(`plan_request_updated:${tenant.id}`, onPlanRequest);
  orderEvents.on(`plan_request_updated:${req.params.restaurantSlug}`, onPlanRequest);

  const heartbeat = setInterval(() => {
    try {
      res.write(": keep-alive\n\n");
    } catch {}
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    orderEvents.off(`notification_event:${tenant.id}`, onNotification);
    orderEvents.off(`notification_event:${req.params.restaurantSlug}`, onNotification);
    orderEvents.off(`new_order:${tenant.id}`, onOrder);
    orderEvents.off(`new_order:${req.params.restaurantSlug}`, onOrder);
    orderEvents.off(`order_status:${tenant.id}`, onStatus);
    orderEvents.off(`order_status:${req.params.restaurantSlug}`, onStatus);
    orderEvents.off(`waiter_request:${tenant.id}`, onWaiter);
    orderEvents.off(`waiter_request:${req.params.restaurantSlug}`, onWaiter);
    orderEvents.off(`waiter_request_updated:${tenant.id}`, onWaiter);
    orderEvents.off(`waiter_request_updated:${req.params.restaurantSlug}`, onWaiter);
    orderEvents.off(`plan_updated:${tenant.id}`, onPlan);
    orderEvents.off(`plan_updated:${req.params.restaurantSlug}`, onPlan);
    orderEvents.off(`plan_request_updated:${tenant.id}`, onPlanRequest);
    orderEvents.off(`plan_request_updated:${req.params.restaurantSlug}`, onPlanRequest);
  });
});

// 5. List Restaurant Orders (Kitchen Dashboard & Admin Orders)
router.get("/restaurants/:restaurantSlug/orders", async (req, res) => {
  const access = await getTenantAccess(req, res, "kitchen", "live_orders_kot");
  if (!access) return;

  const db = getDatabase();
  const ordersSnap = await db.ref(`restaurants/${access.tenant.id}/orders`).get();
  const rawOrders = (ordersSnap.val() ?? {}) as Record<string, any>;

  let orders = Object.values(rawOrders);

  // Filters
  const { status, tableId, source, date } = req.query;

  if (status && status !== "ALL") {
    if (status === "ACTIVE") {
      orders = orders.filter((o) =>
        [
          "PENDING_WAITER_APPROVAL",
          "NEEDS_APPROVAL",
          "NEEDS_VERIFICATION",
          "NEW",
          "APPROVED",
          "ACCEPTED",
          "PREPARING",
          "READY",
        ].includes(o.status)
      );
    } else {
      orders = orders.filter((o) => o.status === status);
    }
  }

  if (tableId && tableId !== "ALL") {
    orders = orders.filter((o) => o.tableId === tableId);
  }

  if (source && source !== "ALL") {
    orders = orders.filter((o) => o.source === source);
  }

  if (date === "today") {
    const today = new Date().toISOString().slice(0, 10);
    orders = orders.filter((o) => o.createdAt && o.createdAt.startsWith(today));
  }

  // Sort by priority for kitchen/staff: PENDING_WAITER_APPROVAL/NEEDS_APPROVAL (-2), NEEDS_VERIFICATION (-1), NEW (0), APPROVED/ACCEPTED (1), PREPARING (2), READY (3), COMPLETED (4), DECLINED/CANCELLED (5)
  const priorityMap: Record<string, number> = {
    PENDING_WAITER_APPROVAL: -2,
    NEEDS_APPROVAL: -2,
    NEEDS_VERIFICATION: -1,
    NEW: 0,
    APPROVED: 1,
    ACCEPTED: 1,
    PREPARING: 2,
    READY: 3,
    COMPLETED: 4,
    DECLINED: 5,
    CANCELLED: 5,
  };

  // Self-healing normalization: if any order was saved with un-normalized tax rate (e.g. 5 instead of 0.05)
  orders = orders.map((o) => {
    const itemSum = Array.isArray(o.items)
      ? o.items.reduce((s: number, i: any) => s + (Number(i.subtotal || i.price * i.quantity) || 0), 0)
      : 0;
    const subtotal = Number(o.subtotal) || itemSum;
    let total = Number(o.total);

    if (subtotal > 0 && total >= subtotal * 3) {
      const rawTaxRate = Number(o.taxRate ?? 0.05);
      const normalizedRate = rawTaxRate > 1 ? rawTaxRate / 100 : (rawTaxRate <= 0 ? 0.05 : rawTaxRate);
      const correctTaxes = Math.round(subtotal * normalizedRate * 100) / 100;
      total = Math.round((subtotal + correctTaxes) * 100) / 100;
      return {
        ...o,
        subtotal,
        taxes: correctTaxes,
        total,
      };
    }
    return o;
  });

  orders.sort((a, b) => {
    const pA = priorityMap[a.status] ?? 99;
    const pB = priorityMap[b.status] ?? 99;
    if (pA !== pB) return pA - pB;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  res.json(orders);
});

// 6. Update Order Status (Accept, Prepare, Ready, Complete, Cancel)
router.patch("/restaurants/:restaurantSlug/orders/:orderId/status", async (req, res) => {
  const access = await getTenantAccess(req, res, "kitchen", "live_orders_kot");
  if (!access) return;

  const { orderId } = req.params;
  let { status: targetStatus, reason } = req.body ?? {};

  if (!targetStatus || !VALID_TRANSITIONS[targetStatus]) {
    errorResponse(res, 400, "Invalid order status requested.", "INVALID_STATUS");
    return;
  }

  const db = getDatabase();
  const orderRef = db.ref(`restaurants/${access.tenant.id}/orders/${orderId}`);
  const orderSnap = await orderRef.get();

  if (!orderSnap.exists()) {
    errorResponse(res, 404, "Order not found.", "ORDER_NOT_FOUND");
    return;
  }

  const currentOrder = orderSnap.val();
  const currentStatus = currentOrder.status || "NEW";

  // Idempotent: If order is already in the requested status, return successfully
  if (currentStatus === targetStatus) {
    res.json(currentOrder);
    return;
  }

  const allowed = VALID_TRANSITIONS[currentStatus] ?? [];

  if (!allowed.includes(targetStatus)) {
    errorResponse(
      res,
      400,
      `Cannot transition order from ${currentStatus} to ${targetStatus}. Allowed transitions: ${allowed.join(", ")}`,
      "ILLEGAL_STATUS_TRANSITION",
    );
    return;
  }

  // Payment Consistency: Prevent accepting/preparing orders that require upfront payment while still unpaid
  if ((targetStatus === "ACCEPTED" || targetStatus === "APPROVED" || targetStatus === "PREPARING") && 
      currentOrder.paymentMethod === "PAY_NOW" && 
      currentOrder.paymentStatus !== "PAID") {
    errorResponse(
      res,
      400,
      `Cannot send order to kitchen: customer selected Pay Now and payment is unpaid (${currentOrder.paymentStatus}).`,
      "PAYMENT_REQUIRED_BEFORE_KITCHEN"
    );
    return;
  }

  const now = new Date().toISOString();
  const updates: Record<string, any> = {
    status: targetStatus,
    updatedAt: now,
  };

  if (targetStatus === "ACCEPTED" || targetStatus === "APPROVED") {
    updates.status = "APPROVED";
    updates.acceptedAt = now;
    updates.approvedAt = now;
    updates.requiresStaffApproval = false;
  } else if (targetStatus === "PREPARING") {
    updates.preparingAt = now;
    updates.requiresStaffApproval = false;
  } else if (targetStatus === "READY") {
    updates.readyAt = now;
  } else if (targetStatus === "COMPLETED") {
    updates.completedAt = now;
  } else if (targetStatus === "CANCELLED" || targetStatus === "DECLINED") {
    updates.status = "DECLINED";
    updates.cancelledAt = now;
    updates.declinedAt = now;
    updates.requiresStaffApproval = false;
    const finalReason = reason || req.body?.reason || "Declined by restaurant staff";
    const authorizedBy = req.body?.authorizedBy || access.context.email || "Staff Member";
    const elapsedMinutes = currentOrder.createdAt ? Math.max(0, Math.round((Date.now() - new Date(currentOrder.createdAt).getTime()) / 60000)) : 0;

    updates.cancellationReason = String(finalReason).slice(0, 200);
    updates.declinedReason = String(finalReason).slice(0, 200);
    updates.voidAuthorizedBy = authorizedBy;
    updates.voidOriginalTotal = currentOrder.total || 0;
    updates.voidElapsedMinutes = elapsedMinutes;

    // Comprehensive Anti-Theft Audit Log for Declined/Cancelled/Voided Orders
    createAuditLog(access.tenant.id, {
      actorId: access.context.uid,
      actorEmail: access.context.email ?? "staff",
      actorRole: access.context.platformAdmin
        ? "platform_admin"
        : (access.context.memberships[access.tenant.id]?.role ?? "staff"),
      action: "ORDER_VOIDED",
      resourceId: orderId,
      details: {
        orderNumber: currentOrder.orderNumber,
        tableNumber: currentOrder.tableNumber,
        reason: finalReason,
        total: currentOrder.total,
        authorizedBy,
        elapsedMinutes,
        itemsCount: currentOrder.items?.length || 0,
      },
    });
  }

  await orderRef.update(cleanForFirebase(updates));

  const updatedOrder = {
    ...currentOrder,
    ...updates,
  };

  // Broadcast real-time order status update to owner, staff, KDS, and customer SSE stream
  orderEvents.emit(`order_status:${access.tenant.id}`, updatedOrder);
  orderEvents.emit(`order_status:${req.params.restaurantSlug}`, updatedOrder);
  orderEvents.emit(`order_status:${orderId}`, updatedOrder);

  if ((targetStatus === "APPROVED" || targetStatus === "ACCEPTED") && currentStatus !== "APPROVED" && currentStatus !== "ACCEPTED") {
    const itemsCount = Array.isArray(updatedOrder.items)
      ? updatedOrder.items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0)
      : 1;

    const kdsEvent = {
      eventId: createId("evt_kds"),
      eventType: "ORDER_APPROVED_FOR_KDS",
      restaurantId: access.tenant.id,
      restaurantSlug: req.params.restaurantSlug,
      orderId: updatedOrder.id,
      orderNumber: updatedOrder.orderNumber,
      tableId: updatedOrder.tableId,
      tableNumber: String(updatedOrder.tableNumber ?? ""),
      itemsCount,
      total: updatedOrder.total,
      currency: access.tenant.profile?.currency || "₹",
      createdAt: now,
    };

    orderEvents.emit(`notification_event:${access.tenant.id}`, kdsEvent);
    orderEvents.emit(`notification_event:${req.params.restaurantSlug}`, kdsEvent);
  }

  res.json(updatedOrder);
});

// Dedicated Waiter/Owner Approval Endpoint
router.post("/restaurants/:restaurantSlug/orders/:orderId/approve", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff");
  if (!access) return;
  const { orderId } = req.params;
  const db = getDatabase();
  const orderRef = db.ref(`restaurants/${access.tenant.id}/orders/${orderId}`);
  const snap = await orderRef.get();
  if (!snap.exists()) {
    errorResponse(res, 404, "Order not found", "ORDER_NOT_FOUND");
    return;
  }
  const currentOrder = snap.val();
  const currentStatus = currentOrder.status || "NEW";
  
  if (currentStatus === "DECLINED" || currentStatus === "CANCELLED" || currentStatus === "COMPLETED") {
    errorResponse(res, 400, `Cannot approve an order that is already ${currentStatus}.`, "INVALID_TRANSITION");
    return;
  }

  const now = new Date().toISOString();
  const updates = {
    status: "APPROVED",
    acceptedAt: now,
    approvedAt: now,
    updatedAt: now,
    requiresStaffApproval: false,
  };

  await orderRef.update(cleanForFirebase(updates));
  const updated = { ...currentOrder, ...updates };

  // Broadcast real-time event
  orderEvents.emit(`order_status:${access.tenant.id}`, updated);
  orderEvents.emit(`order_status:${req.params.restaurantSlug}`, updated);
  orderEvents.emit(`order_status:${orderId}`, updated);

  const itemsCount = Array.isArray(updated.items)
    ? updated.items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0)
    : 1;

  const kdsEvent = {
    eventId: createId("evt_kds"),
    eventType: "ORDER_APPROVED_FOR_KDS",
    restaurantId: access.tenant.id,
    restaurantSlug: req.params.restaurantSlug,
    orderId: updated.id,
    orderNumber: updated.orderNumber,
    tableId: updated.tableId,
    tableNumber: String(updated.tableNumber ?? ""),
    itemsCount,
    total: updated.total,
    currency: access.tenant.profile?.currency || "₹",
    createdAt: now,
  };

  orderEvents.emit(`notification_event:${access.tenant.id}`, kdsEvent);
  orderEvents.emit(`notification_event:${req.params.restaurantSlug}`, kdsEvent);

  createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "staff",
    actorRole: access.context.platformAdmin
      ? "platform_admin"
      : (access.context.memberships[access.tenant.id]?.role ?? "staff"),
    action: "ORDER_APPROVED",
    resourceId: orderId,
    details: {
      orderNumber: currentOrder.orderNumber,
      tableNumber: currentOrder.tableNumber,
      total: currentOrder.total,
    },
  });

  res.json(updated);
});

// Dedicated Waiter/Owner Decline Endpoint
router.post("/restaurants/:restaurantSlug/orders/:orderId/decline", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff");
  if (!access) return;
  const { orderId } = req.params;
  const reason = req.body?.reason || "Declined by restaurant staff";
  const db = getDatabase();
  const orderRef = db.ref(`restaurants/${access.tenant.id}/orders/${orderId}`);
  const snap = await orderRef.get();
  if (!snap.exists()) {
    errorResponse(res, 404, "Order not found", "ORDER_NOT_FOUND");
    return;
  }
  const currentOrder = snap.val();
  const currentStatus = currentOrder.status || "NEW";

  if (currentStatus === "COMPLETED") {
    errorResponse(res, 400, "Cannot decline an order that has already been completed and served.", "INVALID_TRANSITION");
    return;
  }

  const now = new Date().toISOString();
  const authorizedBy = req.body?.authorizedBy || access.context.email || "Staff Member";
  const elapsedMinutes = currentOrder.createdAt ? Math.max(0, Math.round((Date.now() - new Date(currentOrder.createdAt).getTime()) / 60000)) : 0;

  const updates = {
    status: "DECLINED",
    cancelledAt: now,
    declinedAt: now,
    cancellationReason: reason,
    declinedReason: reason,
    voidAuthorizedBy: authorizedBy,
    voidOriginalTotal: currentOrder.total || 0,
    voidElapsedMinutes: elapsedMinutes,
    updatedAt: now,
    requiresStaffApproval: false,
  };

  await orderRef.update(cleanForFirebase(updates));
  const updated = { ...currentOrder, ...updates };

  // Broadcast real-time event
  orderEvents.emit(`order_status:${access.tenant.id}`, updated);
  orderEvents.emit(`order_status:${req.params.restaurantSlug}`, updated);
  orderEvents.emit(`order_status:${orderId}`, updated);

  createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "staff",
    actorRole: access.context.platformAdmin
      ? "platform_admin"
      : (access.context.memberships[access.tenant.id]?.role ?? "staff"),
    action: "ORDER_VOIDED",
    resourceId: orderId,
    details: {
      orderNumber: currentOrder.orderNumber,
      tableNumber: currentOrder.tableNumber,
      reason,
      total: currentOrder.total,
      authorizedBy,
      elapsedMinutes,
      itemsCount: currentOrder.items?.length || 0,
    },
  });

  res.json(updated);
});

// 7. Update Payment Status by Staff (Mark Cash Paid, Mark Paid, Process Refund)
router.patch("/restaurants/:restaurantSlug/orders/:orderId/payment", async (req, res) => {
  const { orderId } = req.params;
  const { paymentStatus: targetPaymentStatus, reason } = req.body ?? {};

  const allowedPaymentStates = ["PAID", "CASH_PAID", "REFUNDED", "FAILED"];
  if (!allowedPaymentStates.includes(targetPaymentStatus)) {
    errorResponse(res, 400, `Invalid payment status. Allowed: ${allowedPaymentStates.join(", ")}`, "INVALID_PAYMENT_STATUS");
    return;
  }

  // Refunds require Manager or Owner authorization; payment recording requires payments plan
  const mode = targetPaymentStatus === "REFUNDED" ? "manage" : "staff";
  const access = await getTenantAccess(req, res, mode, "payments");
  if (!access) return;

  const db = getDatabase();
  const orderRef = db.ref(`restaurants/${access.tenant.id}/orders/${orderId}`);
  const orderSnap = await orderRef.get();

  if (!orderSnap.exists()) {
    errorResponse(res, 404, "Order not found.", "ORDER_NOT_FOUND");
    return;
  }

  const currentOrder = orderSnap.val();
  const now = new Date().toISOString();

  const updates: Record<string, any> = {
    paymentStatus: targetPaymentStatus,
    updatedAt: now,
  };

  if (targetPaymentStatus === "CASH_PAID") {
    updates.paidAt = now;
    updates.paymentMethod = "CASH";
  } else if (targetPaymentStatus === "PAID") {
    updates.paidAt = now;
  } else if (targetPaymentStatus === "REFUNDED") {
    updates.refundedAt = now;
    updates.refundReason = reason ? String(reason).slice(0, 200) : "Refunded by staff";
  }

  await orderRef.update(updates);

  // Audit Log
  const auditAction = targetPaymentStatus === "REFUNDED" ? "PAYMENT_REFUNDED" : "PAYMENT_RECORDED";
  createAuditLog(access.tenant.id, {
    actorId: access.context.uid,
    actorEmail: access.context.email ?? "staff",
    actorRole: access.context.platformAdmin
      ? "platform_admin"
      : (access.context.memberships[access.tenant.id]?.role ?? "staff"),
    action: auditAction,
    resourceId: orderId,
    details: {
      orderNumber: currentOrder.orderNumber,
      tableNumber: currentOrder.tableNumber,
      previousStatus: currentOrder.paymentStatus,
      newStatus: targetPaymentStatus,
      amount: currentOrder.total,
      reason,
    },
  });

  res.json({
    ...currentOrder,
    ...updates,
  });
});

// Helper for Staff / Captain Order Placement
async function executeStaffOrderCreation(
  req: Request,
  res: Response,
  access: NonNullable<Awaited<ReturnType<typeof getTenantAccess>>>,
  isCaptainRoute: boolean,
) {
  const {
    tableId,
    items,
    customerNote,
    notes,
    initialStatus,
    paymentMethod = "PAY_LATER",
    paymentStatus = "PENDING",
  } = req.body ?? {};

  if (!tableId) {
    errorResponse(res, 400, "Table must be selected for order.", "TABLE_REQUIRED");
    return;
  }

  const db = getDatabase();
  let tableSnap = await db.ref(`restaurants/${access.tenant.id}/tables/${tableId}`).get();
  let actualTableId = String(tableId);
  let tableData = tableSnap.val();

  if (!tableData) {
    const allTablesSnap = await db.ref(`restaurants/${access.tenant.id}/tables`).get();
    const allTables = (allTablesSnap.val() ?? {}) as Record<string, any>;
    for (const [id, t] of Object.entries(allTables)) {
      if (
        id === tableId ||
        t?.slug === tableId ||
        String(t?.tableNumber) === String(tableId) ||
        String(t?.tableNumber).replace(/^0+/, "") === String(tableId).replace(/^0+/, "")
      ) {
        tableData = t;
        actualTableId = id;
        break;
      }
    }
  }

  if (!tableData) {
    errorResponse(res, 404, "Table not found in this restaurant.", "TABLE_NOT_FOUND");
    return;
  }

  if (tableData.active === false || tableData.status === "DEACTIVATED" || tableData.isDeactivated) {
    errorResponse(res, 400, "This table is currently deactivated and cannot accept orders.", "TABLE_INACTIVE");
    return;
  }

  const effectiveNote = customerNote || notes || null;

  // Idempotency / Double submission protection
  const idempotencyKey =
    req.body?.idempotencyKey ||
    req.body?.captainRequestId ||
    req.body?.requestId ||
    req.headers["idempotency-key"] ||
    req.headers["x-request-id"];

  if (idempotencyKey) {
    const existingIdemSnap = await db
      .ref(`restaurants/${access.tenant.id}/ordersByIdempotency/${idempotencyKey}`)
      .get();
    if (existingIdemSnap.exists()) {
      const existingOrderId = existingIdemSnap.val();
      const existingOrderSnap = await db
        .ref(`restaurants/${access.tenant.id}/orders/${existingOrderId}`)
        .get();
      if (existingOrderSnap.exists()) {
        res.status(200).json(existingOrderSnap.val());
        return;
      }
    }
  }

  // Server-authoritative price & item calculation
  const settings = (access.tenant.settings ?? {}) as Record<string, any>;
  const taxRate = Number(settings.taxRate ?? 0.05);

  let calculation;
  try {
    calculation = await calculateOrderSnapshot(access.tenant.id, items, taxRate);
  } catch (err: any) {
    errorResponse(res, 400, err.message ?? "Failed to calculate order prices.", "CALCULATION_ERROR");
    return;
  }

  // Active Session Resolution / Creation (Server-Authoritative)
  let activeSessionId = tableData.activeSessionId;
  if (activeSessionId) {
    const sessionSnap = await db
      .ref(`restaurants/${access.tenant.id}/tableSessions/${activeSessionId}`)
      .get();
    if (!sessionSnap.exists() || sessionSnap.val()?.status !== "ACTIVE") {
      activeSessionId = null;
    }
  }

  if (!activeSessionId) {
    const allSessionsSnap = await db.ref(`restaurants/${access.tenant.id}/tableSessions`).get();
    const sessions = (allSessionsSnap.val() ?? {}) as Record<string, any>;
    const found = Object.values(sessions).find(
      (s: any) => s && s.tableId === tableId && s.status === "ACTIVE",
    );
    if (found) {
      activeSessionId = found.id;
    }
  }

  const now = new Date().toISOString();

  if (!activeSessionId) {
    // Create new active session for this table
    activeSessionId = createId("sess");
    const activeSession = {
      id: activeSessionId,
      tableId,
      tableNumber: String(tableData.tableNumber ?? tableId),
      status: "ACTIVE",
      startedAt: now,
      createdAt: now,
      updatedAt: now,
      startedBy: access.context.email || "staff",
    };
    await Promise.all([
      db.ref(`restaurants/${access.tenant.id}/tableSessions/${activeSessionId}`).set(cleanForFirebase(activeSession)),
      db.ref(`restaurants/${access.tenant.id}/tables/${tableId}`).update({
        activeSessionId,
        status: "OCCUPIED",
        updatedAt: now,
      }),
    ]);
  } else {
    // Ensure table is linked and marked OCCUPIED
    await db.ref(`restaurants/${access.tenant.id}/tables/${tableId}`).update({
      activeSessionId,
      status: "OCCUPIED",
      updatedAt: now,
    });
  }

  const existingOrdersSnap = await db.ref(`restaurants/${access.tenant.id}/orders`).get();
  const existingOrders = (existingOrdersSnap.val() ?? {}) as Record<string, any>;
  const orderNumber = 101 + Object.keys(existingOrders).length;

  const orderId = createId("ord");
  const status = initialStatus === "ACCEPTED" || isCaptainRoute ? "APPROVED" : "NEW";

  const newOrder = {
    id: orderId,
    restaurantId: access.tenant.id,
    restaurantSlug: req.params.restaurantSlug,
    tableId,
    tableNumber: String(tableData.tableNumber ?? tableId),
    tableLocation: tableData.location ? String(tableData.location) : null,
    sessionId: activeSessionId,
    orderNumber,
    status,
    paymentStatus,
    paymentMethod,
    orderSource: "STAFF",
    source: "STAFF",
    items: calculation.items,
    subtotal: calculation.subtotal,
    taxes: calculation.taxes,
    total: calculation.total,
    customerNote: customerNote ? String(customerNote).slice(0, 300).trim() : null,
    riskScore: "LOW",
    riskSignals: [],
    createdByStaff: {
      uid: access.context.uid,
      email: access.context.email,
      name: access.context.name || "Captain Staff",
      role: access.role,
    },
    createdAt: now,
    updatedAt: now,
    acceptedAt: now,
    approvedAt: now,
    preparingAt: null,
    readyAt: null,
    completedAt: null,
    cancelledAt: null,
  };

  const cleanedOrder = cleanForFirebase(newOrder);
  await db.ref(`restaurants/${access.tenant.id}/orders/${orderId}`).set(cleanedOrder);

  if (idempotencyKey) {
    await db
      .ref(`restaurants/${access.tenant.id}/ordersByIdempotency/${idempotencyKey}`)
      .set(orderId);
  }

  // Broadcast realtime new order event to KDS & Staff Dashboard
  orderEvents.emit(`new_order:${access.tenant.id}`, cleanedOrder);
  orderEvents.emit(`new_order:${req.params.restaurantSlug}`, cleanedOrder);

  const staffOrderItemsCount = Array.isArray(cleanedOrder.items)
    ? cleanedOrder.items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0)
    : 1;

  if (status === "APPROVED") {
    const kdsEvent = {
      eventId: createId("evt_kds"),
      eventType: "ORDER_APPROVED_FOR_KDS",
      restaurantId: access.tenant.id,
      restaurantSlug: req.params.restaurantSlug,
      orderId: cleanedOrder.id,
      orderNumber: cleanedOrder.orderNumber,
      tableId: cleanedOrder.tableId,
      tableNumber: String(cleanedOrder.tableNumber ?? ""),
      itemsCount: staffOrderItemsCount,
      total: cleanedOrder.total,
      currency: access.tenant.profile?.currency || "₹",
      createdAt: now,
    };
    orderEvents.emit(`notification_event:${access.tenant.id}`, kdsEvent);
    orderEvents.emit(`notification_event:${req.params.restaurantSlug}`, kdsEvent);
  } else if (status === "NEEDS_APPROVAL" || status === "PENDING_WAITER_APPROVAL") {
    const approvalEvent = {
      eventId: createId("evt_appr"),
      eventType: "ORDER_NEEDS_APPROVAL",
      restaurantId: access.tenant.id,
      restaurantSlug: req.params.restaurantSlug,
      orderId: cleanedOrder.id,
      orderNumber: cleanedOrder.orderNumber,
      tableId: cleanedOrder.tableId,
      tableNumber: String(cleanedOrder.tableNumber ?? ""),
      itemsCount: staffOrderItemsCount,
      total: cleanedOrder.total,
      currency: access.tenant.profile?.currency || "₹",
      createdAt: now,
    };
    orderEvents.emit(`notification_event:${access.tenant.id}`, approvalEvent);
    orderEvents.emit(`notification_event:${req.params.restaurantSlug}`, approvalEvent);
  }

  res.status(201).json(cleanedOrder);
}

// 8a. Captain Mobile Web Mode - Dedicated Ordering Endpoint (Growth & Pro Plan)
router.post("/restaurants/:restaurantSlug/orders/captain", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff", "captain_ordering");
  if (!access) return;
  await executeStaffOrderCreation(req, res, access, true);
});

// 8b. Create Manual Order by Staff
router.post("/restaurants/:restaurantSlug/orders/manual", async (req, res) => {
  const access = await getTenantAccess(req, res, "staff", "table_ordering");
  if (!access) return;
  await executeStaffOrderCreation(req, res, access, false);
});

// 9. Generate Kitchen Order Ticket (KOT) payload
router.get("/restaurants/:restaurantSlug/orders/:orderId/kot", async (req, res) => {
  const access = await getTenantAccess(req, res, "kitchen", "live_orders_kot");
  if (!access) return;

  const { orderId } = req.params;
  const db = getDatabase();
  const orderSnap = await db.ref(`restaurants/${access.tenant.id}/orders/${orderId}`).get();

  if (!orderSnap.exists()) {
    errorResponse(res, 404, "Order not found.", "ORDER_NOT_FOUND");
    return;
  }

  const order = orderSnap.val();
  const profile = access.tenant.profile as Record<string, any>;
  const restaurantName = String(profile.name ?? "Restaurant").toUpperCase();

  const divider = "------------------------------------------";
  const lines = [
    divider,
    `          ${restaurantName}`,
    `         KITCHEN ORDER TICKET`,
    divider,
    `KOT #: KOT-${order.orderNumber}     ORDER #: #${order.orderNumber}`,
    `TABLE: TABLE ${order.tableNumber}`,
    `DATE : ${new Date(order.createdAt).toLocaleString()}`,
    `TYPE : ${order.source === "QR" ? "QR SELF-ORDER" : "MANUAL STAFF ORDER"}`,
    `PAY  : ${order.paymentStatus} (${order.paymentMethod || "PAY_LATER"})`,
    ...(order.riskScore === "HIGH" ? [`RISK : HIGH RISK ALERT (Check table before cooking)`] : []),
    divider,
    "QTY   ITEM",
    divider,
  ];

  for (const item of order.items ?? []) {
    lines.push(` ${String(item.quantity).padEnd(4)} ${item.name.toUpperCase()}`);
    if (Array.isArray(item.selectedAddons) && item.selectedAddons.length > 0) {
      lines.push(`      + ${item.selectedAddons.map((a: any) => a.name).join(", ")}`);
    }
    if (item.specialInstructions) {
      lines.push(`      * NOTE: ${item.specialInstructions}`);
    }
  }

  lines.push(divider);
  if (order.customerNote) {
    lines.push("SPECIAL TABLE INSTRUCTIONS:");
    lines.push(`"${order.customerNote}"`);
    lines.push(divider);
  }
  lines.push(`STATUS: ${order.status}`);
  lines.push(divider);

  res.json({
    order,
    restaurantName: profile.name,
    rawKotText: lines.join("\n"),
  });
});

// Periodic sweeper: Automatically forwards unhandled pending orders to the Order Approval section after 60 seconds
setInterval(async () => {
  try {
    const db = getDatabase();
    const tenantsSnap = await db.ref("restaurants").get();
    if (!tenantsSnap.exists()) return;
    const tenants = (tenantsSnap.val() ?? {}) as Record<string, any>;
    const now = Date.now();

    for (const [tenantId, tData] of Object.entries(tenants)) {
      if (tData && tData.pendingHostApprovals) {
        const slug = tData.slug || tData.profile?.slug || tenantId;
        const pendingMap = tData.pendingHostApprovals as Record<string, any>;
        for (const [pendId, record] of Object.entries(pendingMap)) {
          if (record && record.status === "PENDING_HOST_APPROVAL" && record.expiresAt && record.expiresAt <= now) {
            await processPendingOrderBypass(tenantId, slug, pendId, record);
          }
        }
      }
    }
  } catch (err) {
    // Non-blocking background sweeper
  }
}, 4000);

export default router;
