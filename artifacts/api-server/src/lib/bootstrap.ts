import { getAdminAuth, getDatabase } from "./firebase";
import { logger } from "./logger";

/**
 * Server-side bootstrap procedure for Platform Admin authorization.
 * Ensures verified platform admin accounts have:
 * 1. An authorized entry in the database under `platformAdmins/${uid} = true`.
 * 2. Firebase Custom Claims `{ role: "platform_admin", platformAdmin: true }`.
 * 3. Preserves all existing users, restaurants, and memberships.
 * 
 * Never hardcodes or stores any passwords. Passwords are owned exclusively by Firebase Authentication.
 */
export async function bootstrapPlatformAdmins(): Promise<void> {
  try {
    const auth = getAdminAuth();
    const db = getDatabase();

    const bootstrapEmails = [
      "vivekdhola695@gmail.com",
      "admin@gmail.com",
      ...(process.env.PLATFORM_ADMIN_EMAIL ? [process.env.PLATFORM_ADMIN_EMAIL.toLowerCase().trim()] : []),
    ];

    for (const rawEmail of bootstrapEmails) {
      const email = rawEmail.toLowerCase().trim();
      try {
        const user = await auth.getUserByEmail(email);
        if (user && user.uid) {
          // 1. Authorize in database platformAdmins
          await db.ref(`platformAdmins/${user.uid}`).set(true);

          // 2. Set Firebase Auth custom claims
          const existingClaims = user.customClaims || {};
          if (existingClaims.role !== "platform_admin" || existingClaims.platformAdmin !== true) {
            await auth.setCustomUserClaims(user.uid, {
              ...existingClaims,
              role: "platform_admin",
              platformAdmin: true,
            });
          }

          // 3. Ensure profile in users table without overwriting any existing restaurant memberships
          const userSnap = await db.ref(`users/${user.uid}`).get();
          if (!userSnap.exists()) {
            await db.ref(`users/${user.uid}`).set({
              name: user.displayName || "Platform Admin",
              email: user.email,
              role: "platform_admin",
              restaurants: {},
            });
          } else {
            await db.ref(`users/${user.uid}`).update({
              role: "platform_admin",
            });
          }

          logger.info({ email: user.email, uid: user.uid }, "Platform Admin authorization verified");
        }
      } catch (err: any) {
        // If user does not exist in Firebase Auth yet, log notice
        if (err?.code === "auth/user-not-found" || err?.message?.includes("user-not-found")) {
          logger.info({ email }, "Bootstrap admin account not yet registered in Firebase Auth");
        } else {
          logger.warn({ err, email }, "Bootstrap admin check warning");
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, "Platform admin bootstrap failed to run");
  }
}
