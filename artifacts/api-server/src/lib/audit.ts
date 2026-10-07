import { createId, getDatabase } from "./firebase";

export type AuditAction =
  | "MENU_PRICE_CHANGED"
  | "MENU_ITEM_DELETED"
  | "TABLE_PIN_REGENERATED"
  | "STAFF_ADDED"
  | "STAFF_REMOVED"
  | "SETTINGS_CHANGED"
  | "ORDER_CANCELLED"
  | "PAYMENT_RECORDED"
  | "PAYMENT_REFUNDED"
  | "PLAN_CHANGED"
  | "OWNER_EMAIL_CHANGED"
  | "OWNER_STATUS_CHANGED"
  | "OWNER_CREATED"
  | "ONBOARDING_COMPLETED"
  | "BULK_MENU_IMPORT"
  | "SUPPORT_MODE_STARTED"
  | "SHIFT_CLOSED"
  | "RESTAURANT_DELETION_SCHEDULED"
  | "RESTAURANT_DELETION_CANCELLED"
  | "RESTAURANT_PERMANENTLY_DELETED"
  | (string & {});

export interface AuditLogEntry {
  id: string;
  restaurantId: string;
  actorId: string;
  actorEmail: string;
  actorRole: string;
  action: AuditAction;
  resourceId?: string | null;
  details?: string | Record<string, unknown> | null;
  timestamp: string;
}

function sanitizeForFirebase<T>(val: T): T {
  if (val === undefined) {
    return null as any;
  }
  if (val === null || typeof val !== "object") {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map((item) => (item === undefined ? null : sanitizeForFirebase(item))) as any;
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(val)) {
    if (value === undefined) {
      clean[key] = null;
    } else {
      clean[key] = sanitizeForFirebase(value);
    }
  }
  return clean as any;
}

export async function createAuditLog(
  restaurantId: string,
  entry: {
    actorId: string;
    actorEmail: string;
    actorRole: string;
    action: AuditAction;
    resourceId?: string | null;
    details?: string | Record<string, unknown> | null;
  },
): Promise<AuditLogEntry> {
  const db = getDatabase();
  const id = createId("audit");
  const timestamp = new Date().toISOString();

  const rawRecord = {
    id,
    restaurantId,
    actorId: entry.actorId,
    actorEmail: entry.actorEmail,
    actorRole: entry.actorRole,
    action: entry.action,
    resourceId: entry.resourceId ?? null,
    details: entry.details ?? null,
    timestamp,
  };

  const record = sanitizeForFirebase(rawRecord);

  try {
    await db.ref(`restaurants/${restaurantId}/auditLogs/${id}`).set(record);
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }

  return record;
}

export async function createPlatformAuditLog(entry: {
  actorId: string;
  actorEmail: string;
  actorRole: string;
  action: AuditAction;
  restaurantId?: string | null;
  resourceId?: string | null;
  details?: string | Record<string, unknown> | null;
}): Promise<AuditLogEntry> {
  const db = getDatabase();
  const id = createId("plt_audit");
  const timestamp = new Date().toISOString();

  const rawRecord = {
    id,
    restaurantId: entry.restaurantId || "platform",
    actorId: entry.actorId,
    actorEmail: entry.actorEmail,
    actorRole: entry.actorRole,
    action: entry.action,
    resourceId: entry.resourceId ?? null,
    details: entry.details ?? null,
    timestamp,
  };

  const record = sanitizeForFirebase(rawRecord);

  try {
    await db.ref(`platform/auditLogs/${id}`).set(record);
  } catch (err) {
    console.error("Failed to write platform audit log:", err);
  }

  return record;
}

