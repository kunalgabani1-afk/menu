import type { Request } from "express";
import type { DataSnapshot } from "firebase-admin/database";
import { getAdminAuth, getDatabase } from "./firebase";
import { resolveRestaurantPlan, type PlanId } from "./plans.js";

export type Role = "platform_admin" | "owner" | "manager" | "captain" | "staff" | "kitchen";

export type AuthContext = {
  uid: string;
  email: string | null;
  name: string | null;
  role: Role;
  platformAdmin: boolean;
  memberships: Record<
    string,
    {
      role: Exclude<Role, "platform_admin">;
      active: boolean;
      status?: "invited" | "active" | "suspended" | "deactivated";
      permissions?: Record<string, boolean>;
    }
  >;
};

export type Tenant = {
  id: string;
  profile: Record<string, unknown> & { plan: PlanId };
  settings: Record<string, unknown>;
  subscription?: Record<string, unknown>;
  plan: PlanId;
  status?: string;
  active?: boolean;
  deletionRequestedAt?: number;
  deletionScheduledFor?: number;
  deletionRequestedBy?: string;
};

export async function resolveTenant(rawSlugOrId: string): Promise<Tenant | null> {
  if (!rawSlugOrId) return null;
  const clean = decodeURIComponent(String(rawSlugOrId)).trim();
  if (!clean) return null;

  const db = getDatabase();
  let restaurantId: string | null = null;

  // 1. Direct lookup in restaurantSlugs (case-insensitive fallback)
  const lower = clean.toLowerCase();
  let slugSnapshot = await db.ref(`restaurantSlugs/${lower}`).get();
  if (!slugSnapshot.exists() && lower !== clean) {
    slugSnapshot = await db.ref(`restaurantSlugs/${clean}`).get();
  }
  const slugData = slugSnapshot.val() as { restaurantId?: string; active?: boolean } | null;
  if (slugData?.restaurantId) {
    restaurantId = slugData.restaurantId;
  }

  // 2. Check if clean is directly a restaurantId in `restaurants/${clean}/profile`
  if (!restaurantId) {
    const directSnap = await db.ref(`restaurants/${clean}/profile`).get();
    if (directSnap.exists()) {
      restaurantId = clean;
    }
  }

  // 3. Fallback: Search all restaurants for matching slug or ID
  if (!restaurantId) {
    const allRestaurantsSnap = await db.ref("restaurants").get();
    const all = (allRestaurantsSnap.val() ?? {}) as Record<string, any>;
    for (const [id, r] of Object.entries(all)) {
      const pSlug = String(r?.profile?.slug || "").toLowerCase();
      if (id === clean || pSlug === lower || pSlug === clean.toLowerCase()) {
        restaurantId = id;
        break;
      }
    }
    if (!restaurantId && (lower === "the-juniper-room" || lower === "demo")) {
      const firstId = Object.keys(all)[0];
      if (firstId) restaurantId = firstId;
    }
  }

  if (!restaurantId) return null;

  const restaurantSnapshot = await db.ref(`restaurants/${restaurantId}`).get();
  const data = restaurantSnapshot.val() as {
    profile?: Record<string, unknown>;
    settings?: Record<string, unknown>;
    subscription?: Record<string, unknown>;
    plan?: string;
  } | null;
  if (!data?.profile) return null;

  const resolution = resolveRestaurantPlan(data);

  const status = String(
    (data as any).status ||
    (data.profile as any)?.status ||
    (data.profile as any)?.accountStatus ||
    (data.settings as any)?.restaurantStatus ||
    (data.settings as any)?.accountStatus ||
    "active"
  );
  const isDeletionPending =
    status === "DELETION_PENDING" ||
    Boolean((data as any).deletionScheduledFor) ||
    Boolean((data.settings as any)?.deletionScheduledFor);

  return {
    id: restaurantId,
    profile: {
      ...data.profile,
      plan: resolution.plan,
    },
    settings: data.settings ?? {},
    subscription: data.subscription ?? {},
    plan: resolution.plan,
    status: isDeletionPending ? "DELETION_PENDING" : status,
    active:
      !isDeletionPending &&
      (data as any).active !== false &&
      (data.settings as any)?.restaurantStatus !== "inactive" &&
      (data.settings as any)?.accountStatus !== "DEACTIVATED",
    deletionRequestedAt:
      (data as any).deletionRequestedAt ||
      (data.settings as any)?.deletionRequestedAt ||
      undefined,
    deletionScheduledFor:
      (data as any).deletionScheduledFor ||
      (data.settings as any)?.deletionScheduledFor ||
      undefined,
    deletionRequestedBy:
      (data as any).deletionRequestedBy ||
      (data.settings as any)?.deletionRequestedBy ||
      undefined,
  };
}

export function canOwner(ctx: AuthContext, restaurantId: string): boolean {
  if (ctx.platformAdmin) return true;
  const membership = ctx.memberships[restaurantId];
  return Boolean(
    membership?.active &&
      membership.role === "owner" &&
      membership.status !== "suspended" &&
      membership.status !== "deactivated" &&
      membership.status !== "DELETION_PENDING"
  );
}

export function canManage(ctx: AuthContext, restaurantId: string): boolean {
  if (ctx.platformAdmin) return true;
  const membership = ctx.memberships[restaurantId];
  return Boolean(
    membership?.active &&
      (membership.role === "owner" || membership.role === "manager") &&
      membership.status !== "suspended" &&
      membership.status !== "deactivated" &&
      membership.status !== "DELETION_PENDING"
  );
}

export function canStaff(ctx: AuthContext, restaurantId: string): boolean {
  if (ctx.platformAdmin) return true;
  const membership = ctx.memberships[restaurantId];
  return Boolean(
    membership?.active &&
      (membership.role === "owner" ||
        membership.role === "manager" ||
        membership.role === "captain" ||
        membership.role === "staff") &&
      membership.status !== "suspended" &&
      membership.status !== "deactivated" &&
      membership.status !== "disabled" &&
      membership.status !== "DELETION_PENDING"
  );
}

export function canKitchen(ctx: AuthContext, restaurantId: string): boolean {
  if (ctx.platformAdmin) return true;
  const membership = ctx.memberships[restaurantId];
  return Boolean(
    membership?.active &&
      (membership.role === "owner" ||
        membership.role === "manager" ||
        membership.role === "captain" ||
        membership.role === "staff" ||
        membership.role === "kitchen") &&
      membership.status !== "suspended" &&
      membership.status !== "deactivated" &&
      membership.status !== "disabled" &&
      membership.status !== "DELETION_PENDING"
  );
}

export function canRead(ctx: AuthContext, restaurantId: string): boolean {
  if (ctx.platformAdmin) return true;
  const membership = ctx.memberships[restaurantId];
  return Boolean(
    membership?.active &&
      membership.status !== "suspended" &&
      membership.status !== "deactivated" &&
      membership.status !== "disabled" &&
      membership.status !== "DELETION_PENDING"
  );
}

export async function resolveAuth(req: Request): Promise<AuthContext | null> {
  const header = req.headers.authorization;
  let token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token && typeof req.query?.token === "string") {
    token = req.query.token;
  }
  if (!token) return null;

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const db = getDatabase();
    const [userSnapshot, adminSnapshot] = await Promise.all([
      db.ref(`users/${decoded.uid}`).get(),
      db.ref(`platformAdmins/${decoded.uid}`).get(),
    ]);

    let user = userSnapshot.val() as {
      name?: string;
      email?: string;
      restaurants?: Record<
        string,
        { role?: Exclude<Role, "platform_admin">; active?: boolean }
      >;
    } | null;

    const emailLower = (decoded.email ?? user?.email ?? "").toLowerCase().trim();
    const designatedAdminEmails = [
      "vivekdhola695@gmail.com",
      ...(process.env.PLATFORM_ADMIN_EMAIL
        ? [process.env.PLATFORM_ADMIN_EMAIL.toLowerCase().trim()]
        : []),
    ];

    const claims = (decoded as Record<string, any>) || {};
    const isPlatformAdmin =
      adminSnapshot.val() === true ||
      claims.platformAdmin === true ||
      claims.role === "platform_admin" ||
      (emailLower !== "" && designatedAdminEmails.includes(emailLower) && decoded.email_verified === true);

    // Ensure database platformAdmins entry is in sync for verified platform admin
    if (isPlatformAdmin && adminSnapshot.val() !== true) {
      await db.ref(`platformAdmins/${decoded.uid}`).set(true);
    }

    const memberships: AuthContext["memberships"] = {};

    // 1. Populate valid active memberships from user's record
    if (user?.restaurants) {
      for (const [restaurantId, membership] of Object.entries(user.restaurants)) {
        if (
          membership.role &&
          ["owner", "manager", "captain", "staff", "kitchen"].includes(membership.role)
        ) {
          const memberSnap = await db.ref(`restaurants/${restaurantId}/members/${decoded.uid}`).get();
          const memberData = memberSnap.val() as Record<string, any> | null;
          const status = memberData?.status || (membership.active === false ? "suspended" : "active");
          const active = status !== "suspended" && status !== "deactivated" && status !== "disabled" && membership.active !== false;

          memberships[restaurantId] = {
            role: (memberData?.role || membership.role) as any,
            active,
            status,
            permissions: memberData?.permissions || (membership as any).permissions,
          };
        }
      }
    }

    // 2. Check direct single user.restaurantId
    if ((user as any)?.restaurantId) {
      const singleRestId = String((user as any).restaurantId);
      if (!memberships[singleRestId]) {
        memberships[singleRestId] = {
          role: ((user as any).role as any) || "owner",
          active: true,
          status: "active",
        };
      }
    }

    // 3. Scan all restaurants for direct ownership (profile.ownerId/createdBy/email) or membership
    const allRestaurantsSnap = await db.ref("restaurants").get();
    const allRestaurants = (allRestaurantsSnap.val() ?? {}) as Record<string, any>;

    for (const [restId, restData] of Object.entries(allRestaurants)) {
      const isRestDeactivated =
        restData?.settings?.restaurantStatus === "inactive" ||
        restData?.settings?.accountStatus === "DEACTIVATED" ||
        restData?.profile?.accountStatus === "DEACTIVATED";

      // If restaurant is deactivated, force any existing membership for this tenant to inactive
      if (isRestDeactivated && memberships[restId]) {
        memberships[restId].active = false;
        memberships[restId].status = "deactivated";
      }

      // Direct member in restaurants/${restId}/members/${decoded.uid}
      const directMember = restData?.members?.[decoded.uid];
      if (directMember && directMember.role) {
        const isSuspended =
          isRestDeactivated ||
          directMember.status === "suspended" ||
          directMember.status === "deactivated" ||
          directMember.active === false;

        memberships[restId] = {
          role: directMember.role,
          active: !isSuspended,
          status: isRestDeactivated ? "deactivated" : (directMember.status || (!isSuspended ? "active" : "suspended")),
          permissions: directMember.permissions,
        };
        continue;
      }

      // Check owner by ID or createdBy
      const ownerId = restData?.profile?.ownerId || restData?.profile?.userId || restData?.profile?.createdBy;
      if (ownerId && ownerId === decoded.uid) {
        memberships[restId] = {
          role: "owner",
          active: !isRestDeactivated,
          status: isRestDeactivated ? "deactivated" : "active",
        };
        continue;
      }

      // Check owner by email match
      const ownerEmail = String(restData?.profile?.email ?? "").toLowerCase().trim();
      if (emailLower && ownerEmail && ownerEmail === emailLower) {
        const currentMemberActive = restData?.members?.[decoded.uid]?.active;
        const currentUserActive = user?.restaurants?.[restId]?.active;
        const isDeactivated = isRestDeactivated || currentMemberActive === false || currentUserActive === false;

        if (isDeactivated) {
          memberships[restId] = {
            role: "owner",
            active: false,
            status: "deactivated",
          };
          continue;
        }

        memberships[restId] = {
          role: "owner",
          active: true,
          status: "active",
        };
        // Persist membership link for this owner
        await db.ref(`restaurants/${restId}/members/${decoded.uid}`).update({
          role: "owner",
          active: true,
        });
        await db.ref(`users/${decoded.uid}/restaurants/${restId}`).update({
          role: "owner",
          active: true,
          createdAt: Date.now(),
        });
      }
    }

    // 4. Check restaurant_members table if present
    const rMembersSnap = await db.ref("restaurant_members").get();
    if (rMembersSnap.exists()) {
      const rMembers = (rMembersSnap.val() ?? {}) as Record<string, any>;
      for (const [restId, members] of Object.entries(rMembers)) {
        if (members && members[decoded.uid]) {
          const m = members[decoded.uid];
          if (!memberships[restId]) {
            memberships[restId] = {
              role: m.role || "staff",
              active: m.active !== false && m.status !== "suspended",
              status: m.status || "active",
              permissions: m.permissions,
            };
          }
        }
      }
    }

    const firstRole = Object.values(memberships)[0]?.role;
    const computedRole: Role = isPlatformAdmin
      ? "platform_admin"
      : (firstRole || (user as any)?.role || "owner");

    return {
      uid: decoded.uid,
      email: decoded.email ?? user?.email ?? null,
      name: decoded.name ?? user?.name ?? null,
      role: computedRole,
      platformAdmin: isPlatformAdmin,
      memberships,
    };
  } catch (err) {
    console.error("resolveAuth failed with error:", err);
    return null;
  }
}

export function listSnapshot<T>(snapshot: DataSnapshot) {
  const value = snapshot.val() as Record<string, T> | null;
  return Object.entries(value ?? {}).map(([id, item]) => ({ id, ...item }));
}