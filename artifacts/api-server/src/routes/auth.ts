import { Router, type IRouter } from "express";
import admin from "firebase-admin";
import { getDatabase, isDemoMode, isFirebaseConfigured, getFirebaseApp } from "../lib/firebase";
import { resolveAuth } from "../lib/tenant";

const router: IRouter = Router();

// Rate limiting maps for authentication endpoints
const checkEmailRateMap = new Map<string, number[]>();
const forgotPasswordRateMap = new Map<string, number[]>();

function isRateLimited(map: Map<string, number[]>, key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const times = (map.get(key) || []).filter((t) => now - t < windowMs);
  if (times.length >= limit) return true;
  times.push(now);
  map.set(key, times);
  return false;
}

/**
 * Checks whether an email address is registered to any account in the TableLine ecosystem.
 * Scans:
 * 1. Database `users` collection (owners, managers, staff, platform admins)
 * 2. Database `restaurants` profiles (owner email) and `restaurants.*.members`
 * 3. Database `platformAdmins`
 * 4. Firebase Authentication via Admin SDK
 */
export async function checkEmailExists(
  email: string
): Promise<{ exists: boolean; source?: string; user?: any }> {
  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return { exists: false };
  }

  const db = getDatabase();

  // 1. Check local / Firestore DB users collection
  try {
    const usersSnap = await db.ref("users").get();
    const users = (usersSnap.val() ?? {}) as Record<string, any>;
    for (const [uid, u] of Object.entries(users)) {
      if (typeof u?.email === "string" && u.email.toLowerCase().trim() === cleanEmail) {
        return { exists: true, source: "users", user: { uid, ...u } };
      }
    }

    // 2. Check restaurant profiles and members
    const restSnap = await db.ref("restaurants").get();
    const restaurants = (restSnap.val() ?? {}) as Record<string, any>;
    for (const [restId, r] of Object.entries(restaurants)) {
      if (
        (typeof r?.profile?.email === "string" && r.profile.email.toLowerCase().trim() === cleanEmail) ||
        (typeof r?.email === "string" && r.email.toLowerCase().trim() === cleanEmail)
      ) {
        return {
          exists: true,
          source: "restaurant_owner",
          user: { restaurantId: restId, email: cleanEmail, name: r?.profile?.name || r?.name },
        };
      }
      if (r?.members && typeof r.members === "object") {
        for (const [mUid, mData] of Object.entries(r.members as Record<string, any>)) {
          if (
            (typeof mData?.email === "string" && mData.email.toLowerCase().trim() === cleanEmail) ||
            users[mUid]?.email?.toLowerCase().trim() === cleanEmail
          ) {
            return {
              exists: true,
              source: "restaurant_member",
              user: { uid: mUid, restaurantId: restId, email: cleanEmail, name: mData?.name },
            };
          }
        }
      }
    }

    // 3. Check platformAdmins
    const adminSnap = await db.ref("platformAdmins").get();
    const admins = (adminSnap.val() ?? {}) as Record<string, any>;
    for (const [adminId, a] of Object.entries(admins)) {
      if (typeof a?.email === "string" && a.email.toLowerCase().trim() === cleanEmail) {
        return { exists: true, source: "platform_admin", user: { id: adminId, email: cleanEmail } };
      }
    }
  } catch (err) {
    console.warn("[checkEmailExists] Database lookup warning:", err);
  }

  // 4. Check Firebase Auth via Admin SDK
  const app = getFirebaseApp();
  if (app) {
    try {
      const authUser = await admin.auth(app).getUserByEmail(cleanEmail);
      if (authUser?.uid) {
        return {
          exists: true,
          source: "firebase_auth",
          user: { uid: authUser.uid, email: authUser.email, name: authUser.displayName },
        };
      }
    } catch (err: any) {
      if (err?.code !== "auth/user-not-found") {
        console.warn("[checkEmailExists] Firebase Admin getUserByEmail warning:", err?.message);
      }
    }
  }

  return { exists: false };
}

router.get("/auth/session", async (req, res) => {
  try {
    const context = await resolveAuth(req);
    const configured = isFirebaseConfigured();

    if (!context) {
      res.json({
        authenticated: false,
        user: null,
        firebaseConfigured: configured,
        isDemoMode: false,
      });
      return;
    }

    const memberships = Object.entries(context.memberships);
    const firstRestaurant = memberships.find(([, membership]) => membership.active);

    let restaurantSlug: string | null = null;
    let restaurantPlan: string | null = null;
    if (firstRestaurant) {
      const restSnapshot = await getDatabase().ref(`restaurants/${firstRestaurant[0]}/profile`).get();
      const prof = restSnapshot.val();
      restaurantSlug = prof?.slug ?? null;
      restaurantPlan = prof?.plan ?? "growth";
    }

    const isPlatformAdmin = Boolean(context.platformAdmin || context.role === "platform_admin");

    // Check if user's restaurant is pending deletion
    let isDeletionPending = false;
    if (!isPlatformAdmin && memberships.length > 0) {
      const db = getDatabase();
      for (const [rId] of memberships) {
        const rSnap = await db.ref(`restaurants/${rId}`).get();
        const rData = rSnap.val();
        if (
          rData?.status === "DELETION_PENDING" ||
          rData?.settings?.restaurantStatus === "DELETION_PENDING" ||
          rData?.settings?.accountStatus === "DELETION_PENDING" ||
          rData?.profile?.accountStatus === "DELETION_PENDING" ||
          rData?.profile?.status === "DELETION_PENDING" ||
          Boolean(rData?.deletionScheduledFor)
        ) {
          isDeletionPending = true;
          break;
        }
      }
    }

    if (isDeletionPending) {
      res.json({
        authenticated: true,
        user: {
          id: context.uid,
          email: context.email,
          name: context.name,
          role: "locked",
          accountStatus: "DELETION_PENDING",
          deletionLocked: true,
          platformAdmin: false,
          platformRole: null,
          memberships: context.memberships,
          restaurantId: null,
          restaurantSlug: null,
          deletionMessage:
            "Restaurant scheduled for permanent deletion. This restaurant has been locked and will be permanently removed after the 24-hour safety period.",
        },
        firebaseConfigured: configured,
        isDemoMode: false,
      });
      return;
    }

    const effectiveRole = isPlatformAdmin
      ? "platform_admin"
      : (firstRestaurant ? firstRestaurant[1].role : (context.role || "owner"));

    res.json({
      authenticated: true,
      user: {
        id: context.uid,
        email: context.email,
        name: context.name,
        role: effectiveRole,
        platformAdmin: isPlatformAdmin,
        platformRole: isPlatformAdmin ? "superadmin" : null,
        memberships: context.memberships,
        restaurantId: firstRestaurant ? firstRestaurant[0] : null,
        restaurantSlug,
        restaurantPlan,
      },
      firebaseConfigured: configured,
      isDemoMode: false,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to resolve session", details: err?.message });
  }
});

router.post("/auth/logout", (_req, res) => {
  res.status(204).end();
});

/**
 * Validates whether an email already exists in the system.
 * Returns { exists: true } if account exists, { exists: false } if not registered.
 */
router.post("/auth/check-email", async (req, res) => {
  try {
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "anon").split(",")[0].trim();
    if (isRateLimited(checkEmailRateMap, ip, 15, 60 * 1000)) {
      res.status(429).json({ error: "Too many email check requests. Please try again shortly.", exists: false });
      return;
    }

    const rawEmail = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const cleanEmail = rawEmail.toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      res.status(400).json({ error: "Please enter a valid email address.", exists: false });
      return;
    }
    const result = await checkEmailExists(cleanEmail);
    res.json({
      exists: result.exists,
      email: cleanEmail,
      message: result.exists
        ? "Account exists."
        : "No account found with this email address.",
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to check email existence", details: err?.message, exists: false });
  }
});

/**
 * Handles forgot password requests with strict existence verification.
 * IF EMAIL EXISTS:
 *   Ensures account sync and dispatches password reset email.
 * IF EMAIL DOES NOT EXIST:
 *   DOES NOT SEND ANY EMAIL.
 *   Returns HTTP 404 with auth/user-not-found code so UI displays immediate warning.
 */
router.post("/auth/forgot-password", async (req, res) => {
  try {
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "anon").split(",")[0].trim();
    if (isRateLimited(forgotPasswordRateMap, ip, 5, 15 * 60 * 1000)) {
      res.status(429).json({
        success: false,
        code: "auth/too-many-requests",
        error: "Too many password reset attempts. Please wait 15 minutes before trying again.",
      });
      return;
    }

    const rawEmail = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const cleanEmail = rawEmail.toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      res.status(400).json({
        success: false,
        code: "auth/invalid-email",
        error: "Please enter a valid email address.",
      });
      return;
    }

    if (isRateLimited(forgotPasswordRateMap, `email_${cleanEmail}`, 3, 30 * 60 * 1000)) {
      res.status(429).json({
        success: false,
        code: "auth/too-many-requests",
        error: "Password reset has been requested multiple times for this email. Please check your inbox or wait 30 minutes.",
      });
      return;
    }

    const { exists, user } = await checkEmailExists(cleanEmail);
    if (!exists) {
      // STRICT REQUIREMENT: If email does not exist, DO NOT send mail to any random email address!
      res.status(404).json({
        success: false,
        code: "auth/user-not-found",
        error: "We couldn’t find an account registered with this email address. Please check the email and try again.",
      });
      return;
    }

    // Account exists! Ensure user is synced in Firebase Auth if needed
    const app = getFirebaseApp();
    if (app) {
      try {
        await admin.auth(app).getUserByEmail(cleanEmail);
      } catch (authErr: any) {
        if (authErr?.code === "auth/user-not-found") {
          try {
            await admin.auth(app).createUser({
              email: cleanEmail,
              displayName: user?.name || cleanEmail.split("@")[0],
            });
          } catch (createErr) {
            console.warn("Could not sync user to Firebase Auth:", createErr);
          }
        }
      }
    }

    // Dispatch reset email via Firebase Identity Toolkit
    const apiKey = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "";
    let emailDispatched = false;
    if (apiKey) {
      try {
        const idRes = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestType: "PASSWORD_RESET",
              email: cleanEmail,
            }),
          }
        );
        const idData = (await idRes.json()) as any;
        if (idData?.email) {
          emailDispatched = true;
        }
      } catch (idErr) {
        console.warn("Identity Toolkit sendOobCode warning:", idErr);
      }
    }

    res.json({
      success: true,
      email: cleanEmail,
      emailDispatched,
      message: "Password reset link has been dispatched to your registered email.",
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: "Failed to process password reset request",
      details: err?.message,
    });
  }
});

/**
 * Handles passwordless sign-in email link requests with strict registry & approval check.
 * ONLY users registered and approved in the database (or designated admin) can receive sign-in links.
 * Anyone not in the database / not registered will NOT receive an email link.
 */
router.post("/auth/send-signin-link", async (req, res) => {
  try {
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "anon").split(",")[0].trim();
    if (isRateLimited(forgotPasswordRateMap, `magic_${ip}`, 5, 15 * 60 * 1000)) {
      res.status(429).json({
        success: false,
        code: "auth/too-many-requests",
        error: "Too many sign-in link requests. Please wait a few minutes before trying again.",
      });
      return;
    }

    const rawEmail = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const cleanEmail = rawEmail.toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      res.status(400).json({
        success: false,
        code: "auth/invalid-email",
        error: "Please enter a valid email address.",
      });
      return;
    }

    const continueUrl = typeof req.body?.continueUrl === "string" ? req.body.continueUrl : "";

    // 1. Strict check in database / admin registry
    const { exists, user } = await checkEmailExists(cleanEmail);
    if (!exists) {
      res.status(404).json({
        success: false,
        code: "auth/user-not-found",
        error: "We couldn’t find an approved operator account registered with this email address. Please contact your restaurant administrator or sign up first.",
      });
      return;
    }

    // 2. Ensure account is not suspended or deactivated
    if (user?.status === "suspended" || user?.status === "deactivated" || user?.active === false) {
      res.status(403).json({
        success: false,
        code: "auth/user-disabled",
        error: "This account has been deactivated. Please contact platform administration.",
      });
      return;
    }

    // 3. Ensure user exists in Firebase Auth
    const app = getFirebaseApp();
    if (app) {
      try {
        await admin.auth(app).getUserByEmail(cleanEmail);
      } catch (authErr: any) {
        if (authErr?.code === "auth/user-not-found") {
          try {
            await admin.auth(app).createUser({
              email: cleanEmail,
              displayName: user?.name || cleanEmail.split("@")[0],
            });
          } catch (createErr) {
            console.warn("Could not sync user to Firebase Auth:", createErr);
          }
        }
      }
    }

    // 4. Dispatch Email Link via Identity Toolkit
    const apiKey = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "";
    let emailDispatched = false;
    if (apiKey) {
      try {
        const idRes = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestType: "EMAIL_SIGNIN",
              email: cleanEmail,
              continueUrl: continueUrl || undefined,
              canHandleCodeInApp: true,
            }),
          }
        );
        const idData = (await idRes.json()) as any;
        if (idData?.email) {
          emailDispatched = true;
        }
      } catch (idErr) {
        console.warn("Identity Toolkit sendOobCode magic link warning:", idErr);
      }
    }

    res.json({
      success: true,
      email: cleanEmail,
      emailDispatched,
      message: "Sign-in link has been dispatched to your approved email address.",
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: "Failed to dispatch sign-in link",
      details: err?.message,
    });
  }
});

export default router;
