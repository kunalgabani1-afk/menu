export type PlanId = "counter" | "starter" | "growth" | "pro";

export type FeatureKey =
  | "digital_menu"
  | "menu_cms"
  | "table_qr"
  | "basic_stats"
  | "table_ordering"
  | "kitchen_kds"
  | "live_orders_kot"
  | "audio_alerts"
  | "order_tracking"
  | "table_pin_security"
  | "service_calls"
  | "finance_basic"
  | "finance_growth"
  | "finance_pro"
  | "payments"
  | "diner_reviews"
  | "staff_rbac"
  | "audit_logs"
  | "ai_assistant"
  | "voice_ordering"
  | "bulk_menu_import"
  | "ai_menu_extraction"
  | "variants_modifiers"
  | "scheduled_availability"
  | "ai_menu_cleanup"
  | "ai_menu_descriptions"
  | "captain_ordering"
  | "shift_close"
  | "priority_support"
  | "custom_bill_receipt";

export interface PlanLimits {
  maxTables: number;
  maxMenuItems: number;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  setupFee: number;
  monthlyFee: number;
  priceMonthly: number;
  currency: string;
  features: string[];
  limits: PlanLimits;
  entitlements: Record<FeatureKey, boolean>;
}

export const PLAN_DEFINITIONS: Record<PlanId, PlanDefinition> & {
  free: PlanDefinition;
  scale: PlanDefinition;
} = {
  counter: {
    id: "counter",
    name: "Counter",
    tagline: "Pure Counter billing & Kitchen Display for quick service & takeaway",
    setupFee: 0,
    monthlyFee: 299,
    priceMonthly: 299,
    currency: "INR",
    limits: {
      maxTables: 5,
      maxMenuItems: 25,
    },
    features: [
      "Pure Counter Billing & POS",
      "Kitchen Display System (KDS)",
      "Up to 5 Tables / Counter Slots",
      "Up to 25 Menu Items",
      "Live Ticket Routing",
    ],
    entitlements: {
      digital_menu: true,
      menu_cms: true,
      table_qr: false,
      basic_stats: true,
      table_ordering: false,
      kitchen_kds: true,
      live_orders_kot: true,
      audio_alerts: true,
      order_tracking: true,
      table_pin_security: false,
      service_calls: false,
      finance_basic: false,
      finance_growth: false,
      finance_pro: false,
      payments: true,
      diner_reviews: false,
      staff_rbac: false,
      audit_logs: false,
      ai_assistant: false,
      voice_ordering: false,
      bulk_menu_import: false,
      ai_menu_extraction: false,
      variants_modifiers: true,
      scheduled_availability: true,
      ai_menu_cleanup: false,
      ai_menu_descriptions: false,
      captain_ordering: false,
      shift_close: false,
      priority_support: false,
      custom_bill_receipt: false,
    },
  },
  starter: {
    id: "starter",
    name: "Starter",
    tagline: "QR menu + table ordering & KDS for growing cafes",
    setupFee: 1999,
    monthlyFee: 499,
    priceMonthly: 499,
    currency: "INR",
    limits: {
      maxTables: 5,
      maxMenuItems: 50,
    },
    features: [
      "QR Digital Menu & Table Ordering",
      "Up to 5 Tables",
      "Up to 50 Menu Items",
      "Kitchen Display System (KDS)",
      "Live Orders & KOT Ticket Routing",
      "Audio Attention Chimes",
      "Daily Sales & Basic Expenses",
      "Payment Summary & Basic Excel Export",
    ],
    entitlements: {
      digital_menu: true,
      menu_cms: true,
      table_qr: true,
      basic_stats: true,
      table_ordering: true,
      kitchen_kds: true,
      live_orders_kot: true,
      audio_alerts: true,
      order_tracking: true,
      table_pin_security: true,
      service_calls: false,
      finance_basic: true,
      finance_growth: false,
      finance_pro: false,
      payments: true,
      diner_reviews: false,
      staff_rbac: false,
      audit_logs: false,
      ai_assistant: false,
      voice_ordering: false,
      bulk_menu_import: false,
      ai_menu_extraction: false,
      variants_modifiers: true,
      scheduled_availability: true,
      ai_menu_cleanup: false,
      ai_menu_descriptions: false,
      captain_ordering: false,
      shift_close: false,
      priority_support: false,
      custom_bill_receipt: false,
    },
  },
  growth: {
    id: "growth",
    name: "Growth",
    tagline: "Full QR ordering, KDS, waiter calls, staff roles & restaurant finance for busy dining rooms",
    setupFee: 4999,
    monthlyFee: 1299,
    priceMonthly: 1299,
    currency: "INR",
    limits: {
      maxTables: 15,
      maxMenuItems: 200,
    },
    features: [
      "Everything in Starter",
      "Full QR Ordering & Advanced KDS",
      "Up to 15 Tables",
      "Up to 200 Menu Items",
      "Spreadsheet & Document Menu Import",
      "Staff Role Permissions (RBAC)",
      "Waiter Call System & Diner Reviews",
      "Weekly/Monthly Sales & Income vs Expenses",
      "Estimated Net, Tax Summary & PDF Export",
      "Captain Mobile Web Ordering",
    ],
    entitlements: {
      digital_menu: true,
      menu_cms: true,
      table_qr: true,
      basic_stats: true,
      table_ordering: true,
      kitchen_kds: true,
      live_orders_kot: true,
      audio_alerts: true,
      order_tracking: true,
      table_pin_security: true,
      service_calls: true,
      finance_basic: true,
      finance_growth: true,
      finance_pro: false,
      payments: true,
      diner_reviews: true,
      staff_rbac: true,
      audit_logs: false,
      ai_assistant: true,
      voice_ordering: true,
      bulk_menu_import: true,
      ai_menu_extraction: true,
      variants_modifiers: true,
      scheduled_availability: true,
      ai_menu_cleanup: true,
      ai_menu_descriptions: true,
      captain_ordering: true,
      shift_close: false,
      priority_support: false,
      custom_bill_receipt: false,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "The complete hospitality floor operating system with unlimited capacity",
    setupFee: 7999,
    monthlyFee: 2499,
    priceMonthly: 2499,
    currency: "INR",
    limits: {
      maxTables: 999999,
      maxMenuItems: 999999,
    },
    features: [
      "Everything in Growth",
      "Unlimited Tables & Menu Items",
      "Day Close & Cash Reconciliation",
      "Expected vs Actual Cash & Day-End Settlement",
      "Complete Finance Excel & Professional PDF",
      "Financial Activity & Audit History",
      "Custom Bill & Receipt Branding",
      "Security Audit Trail & Activity Logs",
      "Priority Floor Support",
    ],
    entitlements: {
      digital_menu: true,
      menu_cms: true,
      table_qr: true,
      basic_stats: true,
      table_ordering: true,
      kitchen_kds: true,
      live_orders_kot: true,
      audio_alerts: true,
      order_tracking: true,
      table_pin_security: true,
      service_calls: true,
      finance_basic: true,
      finance_growth: true,
      finance_pro: true,
      payments: true,
      diner_reviews: true,
      staff_rbac: true,
      audit_logs: true,
      ai_assistant: true,
      voice_ordering: true,
      bulk_menu_import: true,
      ai_menu_extraction: true,
      variants_modifiers: true,
      scheduled_availability: true,
      ai_menu_cleanup: true,
      ai_menu_descriptions: true,
      captain_ordering: true,
      shift_close: true,
      priority_support: true,
      custom_bill_receipt: true,
    },
  },
  get free() {
    return this.counter;
  },
  get scale() {
    return this.pro;
  },
};

export const PUBLIC_PLANS: PlanDefinition[] = [
  PLAN_DEFINITIONS.starter,
  PLAN_DEFINITIONS.growth,
  PLAN_DEFINITIONS.pro,
];

export const ALL_PLANS: PlanDefinition[] = [
  PLAN_DEFINITIONS.counter,
  PLAN_DEFINITIONS.starter,
  PLAN_DEFINITIONS.growth,
  PLAN_DEFINITIONS.pro,
];

export function normalizePlanId(rawPlan: unknown): PlanId {
  if (typeof rawPlan !== "string" || !rawPlan.trim()) return "starter";
  const p = rawPlan.toLowerCase().trim();
  if (p === "counter" || p === "free") return "counter";
  if (p === "starter" || p === "basic") return "starter";
  if (p === "growth" || p === "smart" || p === "smart_ordering") return "growth";
  if (p === "pro" || p === "scale" || p === "enterprise" || p === "custom") return "pro";
  return "starter";
}

export function getPlanLimits(rawPlan: unknown): PlanLimits {
  const planId = normalizePlanId(rawPlan);
  return PLAN_DEFINITIONS[planId].limits;
}

export function getPlanEntitlements(rawPlan: unknown): Record<FeatureKey, boolean> {
  const planId = normalizePlanId(rawPlan);
  return { ...PLAN_DEFINITIONS[planId].entitlements };
}

export function normalizeFeatureKey(feature: string): FeatureKey {
  if (feature === "captainOrdering" || feature === "captain_ordering") return "captain_ordering";
  if (feature === "shiftClose" || feature === "shift_close") return "shift_close";
  if (feature === "customBillReceipt" || feature === "custom_bill_receipt") return "custom_bill_receipt";
  if (feature === "serviceCalls" || feature === "service_calls") return "service_calls";
  if (feature === "dinerReviews" || feature === "diner_reviews") return "diner_reviews";
  if (feature === "staffRbac" || feature === "staff_rbac") return "staff_rbac";
  if (feature === "auditLogs" || feature === "audit_logs") return "audit_logs";
  if (feature === "analytics" || feature === "finance" || feature === "finance_basic") return "finance_basic";
  if (feature === "revenue_intelligence" || feature === "finance_growth") return "finance_growth";
  if (feature === "finance_pro") return "finance_pro";
  return feature as FeatureKey;
}

export function canUseFeature(rawPlanOrRestaurant: unknown, rawFeature: FeatureKey | string): boolean {
  let planId: PlanId;
  if (rawPlanOrRestaurant && typeof rawPlanOrRestaurant === "object") {
    const obj = rawPlanOrRestaurant as Record<string, any>;
    const raw =
      obj.subscription?.plan ||
      obj.profile?.plan ||
      obj.restaurant?.plan ||
      obj.plan ||
      obj.settings?.plan;
    planId = normalizePlanId(raw);
  } else {
    planId = normalizePlanId(rawPlanOrRestaurant);
  }
  const feature = normalizeFeatureKey(String(rawFeature));
  return Boolean(PLAN_DEFINITIONS[planId]?.entitlements?.[feature]);
}

export const hasFeature = canUseFeature;

export interface AuthoritativePlanResolution {
  plan: PlanId;
  status: string;
  entitlements: Record<FeatureKey, boolean>;
  limits: PlanLimits;
  definition: PlanDefinition;
}

export function resolveRestaurantPlan(
  restaurantData?: Record<string, any> | null
): AuthoritativePlanResolution {
  const raw =
    restaurantData?.subscription?.plan ||
    restaurantData?.profile?.plan ||
    restaurantData?.plan ||
    restaurantData?.settings?.plan;
  const plan = normalizePlanId(raw);
  const status =
    restaurantData?.subscription?.status ||
    restaurantData?.profile?.accountStatus ||
    restaurantData?.settings?.restaurantStatus ||
    "ACTIVE";

  return {
    plan,
    status,
    entitlements: getPlanEntitlements(plan),
    limits: getPlanLimits(plan),
    definition: PLAN_DEFINITIONS[plan],
  };
}

export interface PlanUpgradeRequest {
  id: string;
  restaurantId: string;
  restaurantSlug: string;
  restaurantName: string;
  currentPlan: PlanId;
  requestedPlan: PlanId;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: number;
  requestedBy: string;
  requestedByUid: string;
  reviewedAt?: number;
  reviewedBy?: string;
  notes?: string;
}

export function getFeatureRequirement(feature: FeatureKey | string): {
  requiredPlan: PlanId;
  planName: string;
  title: string;
  description: string;
} {
  const normFeature = normalizeFeatureKey(feature);
  if (PLAN_DEFINITIONS.starter.entitlements[normFeature]) {
    return {
      requiredPlan: "starter",
      planName: "Starter",
      title: getFeatureTitle(normFeature),
      description: `Available on Starter, Growth, and Pro plans.`,
    };
  }
  if (PLAN_DEFINITIONS.growth.entitlements[normFeature]) {
    return {
      requiredPlan: "growth",
      planName: "Growth",
      title: getFeatureTitle(normFeature),
      description: `Upgrade to Growth or Pro to unlock ${getFeatureTitle(normFeature).toLowerCase()}.`,
    };
  }
  return {
    requiredPlan: "pro",
    planName: "Pro",
    title: getFeatureTitle(normFeature),
    description: `Upgrade to Tableline Pro to unlock ${getFeatureTitle(normFeature).toLowerCase()}.`,
  };
}

export function getFeatureTitle(feature: FeatureKey | string): string {
  const norm = normalizeFeatureKey(feature);
  const titles: Record<FeatureKey, string> = {
    digital_menu: "Digital Menu",
    menu_cms: "Menu CMS",
    table_qr: "Table QR Codes",
    basic_stats: "Order Statistics",
    table_ordering: "Direct Table Ordering",
    kitchen_kds: "Kitchen Display System (KDS)",
    live_orders_kot: "Live Orders & KOT Printing",
    audio_alerts: "Audio Attention Chimes",
    order_tracking: "Live Order Tracking",
    table_pin_security: "Table PIN Anti-Abuse",
    service_calls: "Waiter Call System",
    finance_basic: "Daily Sales, Payments & Basic Expenses",
    finance_growth: "Income vs Expenses & Financial Summary",
    finance_pro: "Day Close & Complete Finance",
    payments: "Counter & Online Payments",
    diner_reviews: "Diner Reviews & Ratings",
    staff_rbac: "Staff Role Permissions (RBAC)",
    audit_logs: "Security Audit Trail",
    ai_assistant: "AI Food Assistant",
    voice_ordering: "Tableline Voice Ordering",
    bulk_menu_import: "Bulk Menu Import",
    ai_menu_extraction: "AI Menu Extraction (PDF & Photos)",
    variants_modifiers: "Portions & Modifiers",
    scheduled_availability: "Day & Time Availability",
    ai_menu_cleanup: "AI Menu Cleanup",
    ai_menu_descriptions: "AI Dish Descriptions",
    captain_ordering: "Captain Mobile Web Ordering",
    shift_close: "Shift Close & Day-End Settlement",
    priority_support: "Priority Floor Support",
    custom_bill_receipt: "Custom Bill & Receipt",
  };
  return titles[norm] || String(feature);
}
