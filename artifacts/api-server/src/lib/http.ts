import type { Request, Response } from "express";
import { isFirebaseConfigured } from "./firebase";
import {
  canKitchen,
  canManage,
  canOwner,
  canRead,
  canStaff,
  resolveAuth,
  resolveTenant,
  type AuthContext,
  type Tenant,
} from "./tenant";
import { canUseFeature, getFeatureRequirement, type FeatureKey } from "./plans";

export function errorResponse(
  res: Response,
  status: number,
  error: string,
  code?: string,
) {
  if (res.headersSent) {
    return res;
  }
  return res.status(status).json({ error, ...(code ? { code } : {}) });
}

export async function getAuthContext(req: Request, res: Response) {
  try {
    const context = await resolveAuth(req);
    if (!context) {
      errorResponse(res, 401, "Authentication required.", "UNAUTHORIZED");
      return null;
    }
    return context;
  } catch {
    errorResponse(res, 401, "Authentication required.", "UNAUTHORIZED");
    return null;
  }
}

export function requireVerifiedFirebaseUser(context: AuthContext | null, res: Response): boolean {
  if (!context || !context.uid) {
    errorResponse(res, 401, "Authentication required.", "UNAUTHORIZED");
    return false;
  }
  return true;
}

export async function getTenantAccess(
  req: Request,
  res: Response,
  mode: "read" | "kitchen" | "staff" | "manage" | "owner" = "read",
  requiredFeature?: FeatureKey,
): Promise<{ context: AuthContext; tenant: Tenant; role: string } | null> {
  const context = await getAuthContext(req, res);
  if (!context) return null;
  const rawSlug =
    req.params.restaurantSlug ||
    req.params.slug ||
    req.params.restaurantId ||
    (req.query?.restaurantSlug as string) ||
    (req.query?.slug as string);
  const tenant = await resolveTenant(String(rawSlug || ""));
  if (!tenant) {
    errorResponse(res, 404, "Restaurant not found.", "RESTAURANT_NOT_FOUND");
    return null;
  }

  // Enforce 24-hour DELETION_PENDING lock on all restaurant requests
  const isDeletionPending =
    tenant.status === "DELETION_PENDING" ||
    tenant.settings?.restaurantStatus === "DELETION_PENDING" ||
    tenant.settings?.accountStatus === "DELETION_PENDING" ||
    (tenant.profile as any)?.status === "DELETION_PENDING" ||
    (tenant.profile as any)?.accountStatus === "DELETION_PENDING" ||
    Boolean(tenant.deletionScheduledFor);

  if (isDeletionPending) {
    errorResponse(
      res,
      403,
      "Restaurant scheduled for permanent deletion. This restaurant has been locked and will be permanently removed after the 24-hour safety period.",
      "DELETION_PENDING",
    );
    return null;
  }

  // Enforce restaurant deactivation (platform admin can still manage/investigate)
  if (!context.platformAdmin) {
    const isDeactivated =
      tenant.settings?.restaurantStatus === "inactive" ||
      tenant.settings?.accountStatus === "DEACTIVATED" ||
      tenant.profile?.accountStatus === "DEACTIVATED";
    if (isDeactivated) {
      errorResponse(
        res,
        403,
        "This restaurant account has been deactivated by platform administration.",
        "ACCOUNT_DEACTIVATED",
      );
      return null;
    }
  }

  // Enforce Subscription Plan Entitlement if a feature is required
  if (requiredFeature) {
    const hasFeature = canUseFeature(tenant.profile.plan, requiredFeature);
    if (!hasFeature) {
      const reqInfo = getFeatureRequirement(requiredFeature);
      errorResponse(
        res,
        403,
        `This feature requires the ${reqInfo.planName} plan. Please upgrade your subscription.`,
        "PLAN_LIMITATION",
      );
      return null;
    }
  }

  const role = context.platformAdmin
    ? "platform_admin"
    : (context.memberships[tenant.id]?.role ?? "none");

  let allowed = false;
  if (mode === "owner") {
    allowed = canOwner(context, tenant.id);
  } else if (mode === "manage") {
    allowed = canManage(context, tenant.id);
  } else if (mode === "staff") {
    allowed = canStaff(context, tenant.id);
  } else if (mode === "kitchen") {
    allowed = canKitchen(context, tenant.id);
  } else {
    allowed = canRead(context, tenant.id);
  }

  if (!allowed) {
    console.warn(`[AUTH FORBIDDEN] uid=${context.uid} email=${context.email} restaurantId=${tenant.id} role=${role} mode=${mode}`);
    errorResponse(res, 403, "You are not authorized for this operation.", "FORBIDDEN");
    return null;
  }
  return { context, tenant, role };
}

export function requestBaseUrl(req: Request) {
  const configured = process.env.PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const protocol = req.headers["x-forwarded-proto"] ?? req.protocol;
  const host = req.headers["x-forwarded-host"] ?? req.get("host");
  return `${protocol}://${host}`;
}

export function parsedBody<T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T; error?: any } },
  body: unknown,
  res: Response,
) {
  const result = (schema as any).safeParse(body);
  if (!result.success) {
    const issues = result.error?.issues;
    const firstIssue = issues?.[0];
    const field = firstIssue?.path && firstIssue.path.length > 0 ? firstIssue.path.join(".") : "";
    const msg = firstIssue?.message || "Please check the submitted fields.";
    const fullMsg = field ? `${field}: ${msg}` : msg;
    errorResponse(res, 400, fullMsg, "INVALID_INPUT", issues);
    return null;
  }
  return result.data ?? null;
}