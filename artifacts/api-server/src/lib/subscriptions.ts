import { createId, getDatabase } from "./firebase.js";
import { createAuditLog } from "./audit.js";
import { PLAN_DEFINITIONS, normalizePlanId, resolveRestaurantPlan, type PlanId } from "./plans.js";

export type SubscriptionStatus = "ACTIVE" | "GRACE_PERIOD" | "PAST_DUE" | "DEACTIVATED";
export type SubscriptionPaymentStatus = "VERIFIED" | "SUBMITTED" | "DUE_SOON" | "PENDING";
export type ManualPaymentMethod = "UPI" | "BANK_TRANSFER" | "CASH";

export interface PendingPaymentSubmission {
  paymentMethod: ManualPaymentMethod;
  transactionReference: string;
  amount: number;
  notes?: string;
  submittedAt: number;
  submittedBy?: string;
}

export interface PaymentHistoryRecord {
  paymentId: string;
  restaurantId: string;
  restaurantSlug: string;
  restaurantName: string;
  plan: PlanId;
  amount: number;
  paymentMethod: ManualPaymentMethod;
  transactionReference: string;
  notes?: string;
  submittedAt: number;
  verifiedAt: number;
  verifiedBy: string;
  billingPeriodStart: number;
  billingPeriodEnd: number;
  status: "VERIFIED";
}

export interface SubscriptionData {
  plan: PlanId;
  status: SubscriptionStatus;
  paymentStatus: SubscriptionPaymentStatus;
  subscriptionStart: number;
  currentPeriodEnd: number;
  gracePeriodEnd: number;
  lastPaymentVerifiedAt?: number;
  pendingSubmission?: PendingPaymentSubmission | null;
  reminder?: {
    type: "7_DAYS_BEFORE" | "3_DAYS_BEFORE" | "DUE_TODAY" | "GRACE_PERIOD" | "PAST_DUE" | null;
    daysRemaining: number;
    renewalAmount: number;
    message: string;
  } | null;
}

export const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const BILLING_CYCLE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days monthly cycle

export const TABLELINE_PAYMENT_DETAILS = {
  upiId: "tableline.pay@icici",
  bankName: "HDFC Bank",
  accountName: "Tableline Technologies Pvt Ltd",
  accountNumber: "50200084729104",
  ifscCode: "HDFC0001234",
  branch: "Connaught Place, New Delhi",
};

/**
 * Computes authoritative subscription status and renewal reminders for a restaurant.
 */
export function computeSubscriptionStatus(
  sub: Partial<SubscriptionData> | null | undefined,
  plan: PlanId,
  createdAtMs: number,
  isManuallyDeactivated = false,
  now = Date.now()
): SubscriptionData {
  const normPlan = normalizePlanId(plan);
  const start = sub?.subscriptionStart || createdAtMs || now;
  // If currentPeriodEnd not set, default to 30 days from start
  const currentPeriodEnd = sub?.currentPeriodEnd || (start + BILLING_CYCLE_MS);
  // Grace period is strictly 7 days after currentPeriodEnd
  const gracePeriodEnd = sub?.gracePeriodEnd || (currentPeriodEnd + GRACE_PERIOD_MS);

  let status: SubscriptionStatus = "ACTIVE";
  if (isManuallyDeactivated || sub?.status === "DEACTIVATED") {
    status = "DEACTIVATED";
  } else if (now <= currentPeriodEnd) {
    status = "ACTIVE";
  } else if (now <= gracePeriodEnd) {
    status = "GRACE_PERIOD";
  } else {
    status = "PAST_DUE";
  }

  // Payment status
  let paymentStatus: SubscriptionPaymentStatus = "VERIFIED";
  if (sub?.pendingSubmission) {
    paymentStatus = "SUBMITTED";
  } else if (status === "PAST_DUE") {
    paymentStatus = "PENDING";
  } else if (status === "GRACE_PERIOD" || (currentPeriodEnd - now) <= 7 * 24 * 60 * 60 * 1000) {
    paymentStatus = "DUE_SOON";
  }

  // Canonical monthly price
  const planDef = PLAN_DEFINITIONS[normPlan] || PLAN_DEFINITIONS.starter;
  const renewalAmount = planDef.monthlyFee;

  // Reminder calculation
  let reminder = null;
  const msToExpiry = currentPeriodEnd - now;
  const msToGraceEnd = gracePeriodEnd - now;

  if (status === "PAST_DUE") {
    reminder = {
      type: "PAST_DUE" as const,
      daysRemaining: 0,
      renewalAmount,
      message: `Your ${planDef.name} plan subscription is past due. New customer ordering is temporarily paused. Please submit renewal payment reference to reactivate.`,
    };
  } else if (status === "GRACE_PERIOD") {
    const daysInGrace = Math.max(1, Math.ceil(msToGraceEnd / (24 * 60 * 60 * 1000)));
    const expiryDateStr = new Date(currentPeriodEnd).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    reminder = {
      type: "GRACE_PERIOD" as const,
      daysRemaining: daysInGrace,
      renewalAmount,
      message: `Renewal pending: Your ${planDef.name} plan expired on ${expiryDateStr}. You have ${daysInGrace} day${daysInGrace === 1 ? "" : "s"} remaining in your grace period.`,
    };
  } else if (msToExpiry <= 0) {
    reminder = {
      type: "DUE_TODAY" as const,
      daysRemaining: 0,
      renewalAmount,
      message: "Your subscription renewal is due today. Your account remains available during the grace period.",
    };
  } else if (msToExpiry <= 3 * 24 * 60 * 60 * 1000) {
    const days = Math.max(1, Math.ceil(msToExpiry / (24 * 60 * 60 * 1000)));
    reminder = {
      type: "3_DAYS_BEFORE" as const,
      daysRemaining: days,
      renewalAmount,
      message: `Your Tableline plan renews in ${days} day${days === 1 ? "" : "s"}. Please complete your renewal to keep your account active.`,
    };
  } else if (msToExpiry <= 7 * 24 * 60 * 60 * 1000) {
    const days = Math.max(1, Math.ceil(msToExpiry / (24 * 60 * 60 * 1000)));
    reminder = {
      type: "7_DAYS_BEFORE" as const,
      daysRemaining: days,
      renewalAmount,
      message: `Your ${planDef.name} plan renews in ${days} day${days === 1 ? "" : "s"}. Renewal amount: ₹${renewalAmount.toLocaleString("en-IN")}.`,
    };
  }

  return {
    plan: normPlan,
    status,
    paymentStatus,
    subscriptionStart: start,
    currentPeriodEnd,
    gracePeriodEnd,
    lastPaymentVerifiedAt: sub?.lastPaymentVerifiedAt,
    pendingSubmission: sub?.pendingSubmission || null,
    reminder,
  };
}

/**
 * Loads and dynamically synchronizes subscription info for a restaurant.
 */
export async function getRestaurantSubscription(restaurantId: string): Promise<SubscriptionData> {
  const db = getDatabase();
  const restSnap = await db.ref(`restaurants/${restaurantId}`).get();
  const restData = (restSnap.val() ?? {}) as Record<string, any>;
  const profile = restData.profile ?? {};
  const settings = restData.settings ?? {};
  const subRaw = restData.subscription as Partial<SubscriptionData> | undefined;

  const resolution = resolveRestaurantPlan(restData);
  const isDeactivated =
    settings.restaurantStatus === "inactive" ||
    settings.accountStatus === "DEACTIVATED" ||
    profile.accountStatus === "DEACTIVATED";

  const computed = computeSubscriptionStatus(
    subRaw,
    resolution.plan,
    profile.createdAt || Date.now(),
    isDeactivated
  );

  // If status or plan in database is outdated, persist computed status non-destructively
  if (!subRaw || subRaw.plan !== computed.plan || subRaw.status !== computed.status || !subRaw.currentPeriodEnd) {
    await db.ref(`restaurants/${restaurantId}/subscription`).update({
      plan: computed.plan,
      status: computed.status,
      subscriptionStart: computed.subscriptionStart,
      currentPeriodEnd: computed.currentPeriodEnd,
      gracePeriodEnd: computed.gracePeriodEnd,
    });
    if (profile.plan !== computed.plan) {
      await db.ref(`restaurants/${restaurantId}/profile/plan`).set(computed.plan);
    }
    await db.ref(`restaurants/${restaurantId}/plan`).set(computed.plan);
  }

  return computed;
}

/**
 * Submits manual payment reference by restaurant owner.
 * Does NOT auto-verify; sets paymentStatus to SUBMITTED for admin verification.
 */
export async function submitManualPayment(
  restaurantId: string,
  submission: {
    paymentMethod: ManualPaymentMethod;
    transactionReference: string;
    notes?: string;
    submittedBy: string;
  }
): Promise<SubscriptionData> {
  const db = getDatabase();
  const restSnap = await db.ref(`restaurants/${restaurantId}`).get();
  const restData = (restSnap.val() ?? {}) as Record<string, any>;
  const profile = restData.profile ?? {};
  const plan = normalizePlanId(profile.plan || "starter");
  const planDef = PLAN_DEFINITIONS[plan] || PLAN_DEFINITIONS.starter;

  const pending: PendingPaymentSubmission = {
    paymentMethod: submission.paymentMethod,
    transactionReference: String(submission.transactionReference || "").trim(),
    amount: planDef.monthlyFee, // Canonical monthly plan fee - no tampering
    notes: submission.notes ? String(submission.notes).slice(0, 500) : "",
    submittedAt: Date.now(),
    submittedBy: submission.submittedBy,
  };

  await db.ref(`restaurants/${restaurantId}/subscription`).update({
    pendingSubmission: pending,
    paymentStatus: "SUBMITTED",
  });

  return getRestaurantSubscription(restaurantId);
}

/**
 * Platform Admin verifies payment, extending the subscription period and logging immutable history.
 */
export async function verifyRestaurantPayment(
  restaurantId: string,
  verifiedBy: string
): Promise<{ subscription: SubscriptionData; paymentRecord: PaymentHistoryRecord }> {
  const db = getDatabase();
  const restSnap = await db.ref(`restaurants/${restaurantId}`).get();
  const restData = (restSnap.val() ?? {}) as Record<string, any>;
  const profile = restData.profile ?? {};
  const plan = normalizePlanId(profile.plan || "starter");
  const planDef = PLAN_DEFINITIONS[plan] || PLAN_DEFINITIONS.starter;
  const currentSub = restData.subscription as Partial<SubscriptionData> | undefined;

  const now = Date.now();
  // If currentPeriodEnd is in the future, extend by 30 days from that date; otherwise extend by 30 days from now
  const baseDate = (currentSub?.currentPeriodEnd && currentSub.currentPeriodEnd > now)
    ? currentSub.currentPeriodEnd
    : now;

  const newPeriodEnd = baseDate + BILLING_CYCLE_MS;
  const newGraceEnd = newPeriodEnd + GRACE_PERIOD_MS;

  const pending = currentSub?.pendingSubmission;
  const paymentId = createId("pay");

  const paymentRecord: PaymentHistoryRecord = {
    paymentId,
    restaurantId,
    restaurantSlug: String(profile.slug || ""),
    restaurantName: String(profile.name || "Restaurant"),
    plan,
    amount: pending?.amount || planDef.monthlyFee,
    paymentMethod: pending?.paymentMethod || "UPI",
    transactionReference: pending?.transactionReference || "ADMIN_VERIFIED",
    notes: pending?.notes || "",
    submittedAt: pending?.submittedAt || now,
    verifiedAt: now,
    verifiedBy,
    billingPeriodStart: now,
    billingPeriodEnd: newPeriodEnd,
    status: "VERIFIED",
  };

  // Write immutable payment record to restaurant history and platform log
  const updates: Record<string, any> = {
    [`restaurants/${restaurantId}/paymentHistory/${paymentId}`]: paymentRecord,
    [`platformPaymentHistory/${paymentId}`]: paymentRecord,
    [`restaurants/${restaurantId}/subscription`]: {
      plan,
      status: "ACTIVE",
      paymentStatus: "VERIFIED",
      subscriptionStart: currentSub?.subscriptionStart || now,
      currentPeriodEnd: newPeriodEnd,
      gracePeriodEnd: newGraceEnd,
      lastPaymentVerifiedAt: now,
      pendingSubmission: null,
    },
  };

  await db.ref().update(updates);

  await createAuditLog(restaurantId, {
    actorId: verifiedBy,
    actorEmail: verifiedBy,
    actorRole: "platform_admin",
    action: "PAYMENT_RECORDED",
    resourceId: paymentId,
    details: {
      amount: paymentRecord.amount,
      plan,
      billingPeriodEnd: new Date(newPeriodEnd).toISOString(),
      transactionReference: paymentRecord.transactionReference,
    },
  });

  const updatedSubscription = await getRestaurantSubscription(restaurantId);
  return { subscription: updatedSubscription, paymentRecord };
}
