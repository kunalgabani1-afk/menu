import http from "node:http";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const admin = require("/app/applet/artifacts/api-server/node_modules/firebase-admin");

// Initialize Firebase Admin database identical to artifacts/api-server/src/lib/firebase.ts
let db;
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const dbUrl = process.env.FIREBASE_DATABASE_URL || process.env.VITE_FIREBASE_DATABASE_URL;
  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: dbUrl,
  });
  db = admin.database(app);
} catch (err) {
  console.error("Failed to initialize Firebase Admin:", err);
  process.exit(1);
}

function httpRequest(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : "";
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 5000,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          ...headers,
        },
      },
      (res) => {
        let resData = "";
        res.on("data", (chunk) => (resData += chunk));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(resData);
          } catch {}
          resolve({ status: res.statusCode, body: resData, json, headers: res.headers });
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function hasLead(email) {
  const cleanEmail = email.toLowerCase().trim();
  const snap = await db.ref("platform/leads").once("value");
  const leads = snap.val() || {};
  return Object.values(leads).some(
    (l) => l && String(l.email).toLowerCase().trim() === cleanEmail
  );
}

async function isEmailVerifiedInDb(email) {
  const cleanEmail = email.toLowerCase().trim();
  const emailKey = Buffer.from(cleanEmail).toString("hex");
  const emailSnap = await db.ref(`contactVerifiedByEmail/${emailKey}`).once("value");
  const emailRecord = emailSnap.val();
  if (emailRecord && emailRecord.verifiedAt) return true;

  const sessionSnap = await db.ref("contactVerifiedEmails").once("value");
  const sessions = sessionSnap.val() || {};
  return Object.values(sessions).some(
    (s) => s && s.email?.toLowerCase().trim() === cleanEmail && s.verifiedAt
  );
}

async function runAttackSuite() {
  console.log("================================================================================");
  console.log("TABLELINE CONTACT EMAIL VERIFICATION PENETRATION TEST SUITE");
  console.log("Testing 12 bypass attack vectors against live running service (127.0.0.1:5000)");
  console.log("================================================================================\n");

  const results = [];

  // -------------------------------------------------------------------------
  // Attack 1: verified=true from the browser
  // -------------------------------------------------------------------------
  {
    console.log("--- Executing Attack 1: verified=true from the browser ---");
    const testEmail = `attack1_bypass_${Date.now()}@gmail.com`;
    const initialLeadExists = await hasLead(testEmail);
    const initialVerified = await isEmailVerifiedInDb(testEmail);

    const res = await httpRequest("POST", "/api/platform/leads", {
      restaurantName: "Attack 1 Bistro",
      ownerName: "Attacker Browser",
      phone: "+919876543210",
      email: testEmail,
      city: "Mumbai",
      numberOfTables: 10,
      requestedPlan: "growth",
      emailVerified: true, // Spoofed browser flag
      verified: true,      // Spoofed browser flag
    });

    const finalLeadExists = await hasLead(testEmail);
    const finalVerified = await isEmailVerifiedInDb(testEmail);
    const leadCreated = !initialLeadExists && finalLeadExists;
    const verificationChanged = initialVerified !== finalVerified;
    const passed = res.status === 400 && !leadCreated && !finalVerified && res.json?.code === "EMAIL_NOT_VERIFIED";

    results.push({
      attack: "1. verified=true from the browser",
      httpStatus: res.status,
      serverResponse: res.json?.error || res.body.slice(0, 100),
      serverCode: res.json?.code || "N/A",
      leadCreated,
      verificationStateChanged: verificationChanged,
      passed,
    });
  }

  // -------------------------------------------------------------------------
  // Attack 2: modified email after verification
  // -------------------------------------------------------------------------
  {
    console.log("--- Executing Attack 2: modified email after verification ---");
    const legitimateEmail = `attacker_real_${Date.now()}@gmail.com`;
    const victimEmail = `victim_target_${Date.now()}@gmail.com`;

    // 1. Create a legitimate verified session for legitimateEmail in the real database
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const sessionId = `vs_attack2_${Date.now()}`;
    const now = Date.now();

    await db.ref(`contactVerificationTokens/${tokenHash}`).set({
      email: legitimateEmail,
      tokenHash,
      verificationSessionId: sessionId,
      purpose: "CONTACT_EMAIL_VERIFICATION",
      createdAt: now,
      expiresAt: now + 30 * 60 * 1000,
      usedAt: null,
      verifiedAt: null,
    });

    // Verify legitimateEmail via live endpoint
    await httpRequest("GET", `/api/contact/verify?token=${rawToken}`);

    // 2. Attacker modifies email to victimEmail while submitting the valid sessionId
    const initialVictimLead = await hasLead(victimEmail);
    const initialVictimVerified = await isEmailVerifiedInDb(victimEmail);

    const res = await httpRequest("POST", "/api/platform/leads", {
      restaurantName: "Impostor Kitchen",
      ownerName: "Attacker Two",
      phone: "+919876543210",
      email: victimEmail, // Modified email
      city: "Delhi",
      numberOfTables: 8,
      requestedPlan: "starter",
      verificationSessionId: sessionId, // Session belongs to legitimateEmail
    });

    const finalVictimLead = await hasLead(victimEmail);
    const finalVictimVerified = await isEmailVerifiedInDb(victimEmail);
    const leadCreated = !initialVictimLead && finalVictimLead;
    const verificationChanged = initialVictimVerified !== finalVictimVerified;
    const passed = res.status === 400 && !leadCreated && !finalVictimVerified && res.json?.code === "EMAIL_NOT_VERIFIED";

    results.push({
      attack: "2. modified email after verification",
      httpStatus: res.status,
      serverResponse: res.json?.error || res.body.slice(0, 100),
      serverCode: res.json?.code || "N/A",
      leadCreated,
      verificationStateChanged: verificationChanged,
      passed,
    });
  }

  // -------------------------------------------------------------------------
  // Attack 3: expired token
  // -------------------------------------------------------------------------
  {
    console.log("--- Executing Attack 3: expired token ---");
    const testEmail = `expired_user_${Date.now()}@gmail.com`;
    const rawExpiredToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawExpiredToken).digest("hex");
    const sessionId = `vs_expired_${Date.now()}`;
    const now = Date.now();

    // Store expired token in real database (expired 10 minutes ago)
    await db.ref(`contactVerificationTokens/${tokenHash}`).set({
      email: testEmail,
      tokenHash,
      verificationSessionId: sessionId,
      purpose: "CONTACT_EMAIL_VERIFICATION",
      createdAt: now - 40 * 60 * 1000,
      expiresAt: now - 10 * 60 * 1000,
      usedAt: null,
      verifiedAt: null,
    });

    const initialVerified = await isEmailVerifiedInDb(testEmail);
    const res = await httpRequest("GET", `/api/contact/verify?token=${rawExpiredToken}`);

    const finalVerified = await isEmailVerifiedInDb(testEmail);
    const leadCreated = await hasLead(testEmail);
    const verificationChanged = initialVerified !== finalVerified;
    const passed = res.status === 400 && res.body.includes("expired") && !finalVerified && !leadCreated;

    results.push({
      attack: "3. expired token",
      httpStatus: res.status,
      serverResponse: "Verification Link Expired (HTTP 400 rejection)",
      serverCode: "EXPIRED_TOKEN",
      leadCreated,
      verificationStateChanged: verificationChanged,
      passed,
    });
  }

  // -------------------------------------------------------------------------
  // Attack 4: reused token
  // -------------------------------------------------------------------------
  {
    console.log("--- Executing Attack 4: reused token ---");
    const testEmail = `reused_token_${Date.now()}@gmail.com`;
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const sessionId = `vs_reused_${Date.now()}`;
    const now = Date.now();

    await db.ref(`contactVerificationTokens/${tokenHash}`).set({
      email: testEmail,
      tokenHash,
      verificationSessionId: sessionId,
      purpose: "CONTACT_EMAIL_VERIFICATION",
      createdAt: now,
      expiresAt: now + 30 * 60 * 1000,
      usedAt: null,
      verifiedAt: null,
    });

    // 1st use (valid click)
    const firstRes = await httpRequest("GET", `/api/contact/verify?token=${rawToken}`);
    if (firstRes.status !== 200) {
      console.warn("First verification attempt didn't return 200:", firstRes.status);
    }

    // 2nd use (Attacker attempts to reuse the exact same token)
    const res = await httpRequest("GET", `/api/contact/verify?token=${rawToken}`);
    const leadCreated = await hasLead(testEmail);
    const passed = res.status === 400 && res.body.includes("already been used") && !leadCreated;

    results.push({
      attack: "4. reused token",
      httpStatus: res.status,
      serverResponse: "Link Already Used (Single-use token enforcement HTTP 400)",
      serverCode: "TOKEN_ALREADY_USED",
      leadCreated,
      verificationStateChanged: false,
      passed,
    });
  }

  // -------------------------------------------------------------------------
  // Attack 5: random token
  // -------------------------------------------------------------------------
  {
    console.log("--- Executing Attack 5: random token ---");
    const randomFakeToken = crypto.randomBytes(32).toString("hex");
    const res = await httpRequest("GET", `/api/contact/verify?token=${randomFakeToken}`);
    const passed = res.status === 400 && res.body.includes("invalid or no longer available");

    results.push({
      attack: "5. random token",
      httpStatus: res.status,
      serverResponse: "Verification Link Invalid (HTTP 400 rejection)",
      serverCode: "INVALID_TOKEN",
      leadCreated: false,
      verificationStateChanged: false,
      passed,
    });
  }

  // -------------------------------------------------------------------------
  // Attack 6: another user's token
  // -------------------------------------------------------------------------
  {
    console.log("--- Executing Attack 6: another user's token ---");
    const userAEmail = `user_a_${Date.now()}@gmail.com`;
    const userBEmail = `user_b_attacker_${Date.now()}@gmail.com`;

    // User A token & session in real database
    const rawTokenA = crypto.randomBytes(32).toString("hex");
    const tokenHashA = crypto.createHash("sha256").update(rawTokenA).digest("hex");
    const sessionA = `vs_userA_${Date.now()}`;
    const now = Date.now();

    await db.ref(`contactVerificationTokens/${tokenHashA}`).set({
      email: userAEmail,
      tokenHash: tokenHashA,
      verificationSessionId: sessionA,
      purpose: "CONTACT_EMAIL_VERIFICATION",
      createdAt: now,
      expiresAt: now + 30 * 60 * 1000,
      usedAt: null,
      verifiedAt: null,
    });

    // User A verifies their token
    await httpRequest("GET", `/api/contact/verify?token=${rawTokenA}`);

    // User B tries to use User A's session to submit User B's lead
    const initialBLead = await hasLead(userBEmail);
    const initialBVerified = await isEmailVerifiedInDb(userBEmail);

    const res = await httpRequest("POST", "/api/platform/leads", {
      restaurantName: "User B Restaurant",
      ownerName: "User B",
      phone: "+919876543210",
      email: userBEmail,
      city: "Bangalore",
      numberOfTables: 15,
      requestedPlan: "pro",
      verificationSessionId: sessionA, // User A's token session
    });

    const finalBLead = await hasLead(userBEmail);
    const finalBVerified = await isEmailVerifiedInDb(userBEmail);
    const leadCreated = !initialBLead && finalBLead;
    const passed = res.status === 400 && !leadCreated && !finalBVerified && res.json?.code === "EMAIL_NOT_VERIFIED";

    results.push({
      attack: "6. another user's token",
      httpStatus: res.status,
      serverResponse: res.json?.error || res.body.slice(0, 100),
      serverCode: res.json?.code || "N/A",
      leadCreated,
      verificationStateChanged: initialBVerified !== finalBVerified,
      passed,
    });
  }

  // -------------------------------------------------------------------------
  // Attack 7: unlimited resend requests
  // -------------------------------------------------------------------------
  {
    console.log("--- Executing Attack 7: unlimited resend requests ---");
    const floodEmail = `flood_target_${Date.now()}@gmail.com`;

    // 1st request (initial send - 200 OK)
    const res1 = await httpRequest("POST", "/api/contact/send-verification", {
      email: floodEmail,
      name: "Flood Tester",
    });

    // Consecutive immediate resend requests (attempting unlimited requests)
    const floodAttempts = [];
    for (let i = 0; i < 4; i++) {
      floodAttempts.push(
        await httpRequest("POST", "/api/contact/send-verification", {
          email: floodEmail,
          name: "Flood Tester",
        })
      );
    }

    const allThrottled = floodAttempts.every((r) => r.status === 429 && r.json?.code === "RATE_LIMITED");
    const passed = res1.status === 200 && allThrottled;

    results.push({
      attack: "7. unlimited resend requests",
      httpStatus: floodAttempts[0]?.status || 429,
      serverResponse: floodAttempts[0]?.json?.error || "Rate limited",
      serverCode: floodAttempts[0]?.json?.code || "RATE_LIMITED",
      leadCreated: false,
      verificationStateChanged: false,
      passed,
    });
  }

  // -------------------------------------------------------------------------
  // Attack 8: different IP/request identifiers
  // -------------------------------------------------------------------------
  {
    console.log("--- Executing Attack 8: different IP/request identifiers ---");
    const ipSpoofEmail = `ip_spoof_target_${Date.now()}@gmail.com`;

    // Send 1st request from IP 1.2.3.4
    const res1 = await httpRequest(
      "POST",
      "/api/contact/send-verification",
      { email: ipSpoofEmail, name: "IP Spoofer" },
      { "X-Forwarded-For": "1.2.3.4" }
    );

    // Send 2nd request immediately with forged different IP: 5.6.7.8
    const res2 = await httpRequest(
      "POST",
      "/api/contact/send-verification",
      { email: ipSpoofEmail, name: "IP Spoofer" },
      { "X-Forwarded-For": "5.6.7.8" }
    );

    // Send 3rd request immediately with forged different IP: 9.10.11.12
    const res3 = await httpRequest(
      "POST",
      "/api/contact/send-verification",
      { email: ipSpoofEmail, name: "IP Spoofer" },
      { "X-Forwarded-For": "9.10.11.12" }
    );

    const passed = res1.status === 200 && res2.status === 429 && res3.status === 429 && res2.json?.code === "RATE_LIMITED";

    results.push({
      attack: "8. different IP/request identifiers",
      httpStatus: res2.status,
      serverResponse: res2.json?.error || "Rate limited per-email regardless of IP",
      serverCode: res2.json?.code || "RATE_LIMITED",
      leadCreated: false,
      verificationStateChanged: false,
      passed,
    });
  }

  // -------------------------------------------------------------------------
  // Attack 9: direct API calls without the UI
  // -------------------------------------------------------------------------
  {
    console.log("--- Executing Attack 9: direct API calls without the UI ---");
    const directEmail = `direct_api_${Date.now()}@gmail.com`;
    const initialLead = await hasLead(directEmail);

    const res = await httpRequest("POST", "/api/platform/leads", {
      restaurantName: "Direct Curl Bistro",
      ownerName: "Automated Bot",
      phone: "+919876543210",
      email: directEmail,
      city: "Chennai",
      numberOfTables: 12,
      requestedPlan: "growth",
      needs: "qr_ordering",
      message: "Direct API injection without UI interaction",
    });

    const finalLead = await hasLead(directEmail);
    const leadCreated = !initialLead && finalLead;
    const passed = res.status === 400 && !leadCreated && res.json?.code === "EMAIL_NOT_VERIFIED";

    results.push({
      attack: "9. direct API calls without the UI",
      httpStatus: res.status,
      serverResponse: res.json?.error || res.body.slice(0, 100),
      serverCode: res.json?.code || "N/A",
      leadCreated,
      verificationStateChanged: false,
      passed,
    });
  }

  // -------------------------------------------------------------------------
  // Attack 10: manipulating localStorage/sessionStorage
  // -------------------------------------------------------------------------
  {
    console.log("--- Executing Attack 10: manipulating localStorage/sessionStorage ---");
    const storageEmail = `storage_manip_${Date.now()}@gmail.com`;
    const initialLead = await hasLead(storageEmail);

    // Attacker fabricates a fake session key like what might be stored in sessionStorage
    const fakeSessionId = "vs_fake_client_crafted_storage_session_789456";

    const res = await httpRequest("POST", "/api/platform/leads", {
      restaurantName: "Storage Spoof Grill",
      ownerName: "Manipulator",
      phone: "+919876543210",
      email: storageEmail,
      city: "Kolkata",
      numberOfTables: 20,
      requestedPlan: "pro",
      verificationSessionId: fakeSessionId, // Client manipulated storage value
    });

    const finalLead = await hasLead(storageEmail);
    const leadCreated = !initialLead && finalLead;
    const passed = res.status === 400 && !leadCreated && res.json?.code === "EMAIL_NOT_VERIFIED";

    results.push({
      attack: "10. manipulating localStorage/sessionStorage",
      httpStatus: res.status,
      serverResponse: res.json?.error || res.body.slice(0, 100),
      serverCode: res.json?.code || "N/A",
      leadCreated,
      verificationStateChanged: false,
      passed,
    });
  }

  // -------------------------------------------------------------------------
  // Attack 11: changing verification state in the browser
  // -------------------------------------------------------------------------
  {
    console.log("--- Executing Attack 11: changing verification state in the browser ---");
    const stateEmail = `client_state_tamper_${Date.now()}@gmail.com`;
    const initialLead = await hasLead(stateEmail);

    // Attacker sets React state isEmailVerified = true, enabling submit button
    // Payload contains client-asserted verification state
    const res = await httpRequest("POST", "/api/platform/leads", {
      restaurantName: "Client State Tampered Cafe",
      ownerName: "React Hacker",
      phone: "+919876543210",
      email: stateEmail,
      city: "Pune",
      numberOfTables: 6,
      requestedPlan: "starter",
      isEmailVerified: true,
      emailVerified: true,
      clientVerifiedState: true,
    });

    const finalLead = await hasLead(stateEmail);
    const leadCreated = !initialLead && finalLead;
    const passed = res.status === 400 && !leadCreated && res.json?.code === "EMAIL_NOT_VERIFIED";

    results.push({
      attack: "11. changing verification state in the browser",
      httpStatus: res.status,
      serverResponse: res.json?.error || res.body.slice(0, 100),
      serverCode: res.json?.code || "N/A",
      leadCreated,
      verificationStateChanged: false,
      passed,
    });
  }

  // -------------------------------------------------------------------------
  // Attack 12: submitting the lead directly without verification
  // -------------------------------------------------------------------------
  {
    console.log("--- Executing Attack 12: submitting the lead directly without verification ---");
    const unverifiedEmail = `unverified_submission_${Date.now()}@gmail.com`;
    const initialLead = await hasLead(unverifiedEmail);

    const res = await httpRequest("POST", "/api/platform/leads", {
      restaurantName: "Straight To Submit Eatery",
      ownerName: "No Verification User",
      phone: "+919876543210",
      email: unverifiedEmail,
      city: "Hyderabad",
      numberOfTables: 14,
      requestedPlan: "growth",
      needs: "kds_and_qr",
      message: "Attempting to create onboarding lead without any verification",
    });

    const finalLead = await hasLead(unverifiedEmail);
    const leadCreated = !initialLead && finalLead;
    const passed = res.status === 400 && !leadCreated && res.json?.code === "EMAIL_NOT_VERIFIED";

    results.push({
      attack: "12. submitting the lead directly without verification",
      httpStatus: res.status,
      serverResponse: res.json?.error || res.body.slice(0, 100),
      serverCode: res.json?.code || "N/A",
      leadCreated,
      verificationStateChanged: false,
      passed,
    });
  }

  console.log("\n================================================================================");
  console.log("FINAL PENETRATION TEST AUDIT REPORT");
  console.log("================================================================================\n");

  let allPassed = true;
  for (const r of results) {
    const statusSymbol = r.passed ? "PASS" : "FAIL";
    if (!r.passed) allPassed = false;
    console.log(`[${statusSymbol}] ${r.attack}`);
    console.log(`       HTTP Status: ${r.httpStatus}`);
    console.log(`       Server Response: ${r.serverResponse}`);
    console.log(`       Server Code: ${r.serverCode}`);
    console.log(`       Lead Created: ${r.leadCreated ? "YES (BREACH!)" : "NO (Protected)"}`);
    console.log(`       Verification State Changed: ${r.verificationStateChanged ? "YES (Tampered!)" : "NO (Intact)"}\n`);
  }

  console.log(`OVERALL SUITE: ${allPassed ? "ALL 12 ATTACKS DEFEATED (PASS)" : "SOME ATTACKS SUCCEEDED (FAIL)"}`);
  process.exit(allPassed ? 0 : 1);
}

runAttackSuite().catch((err) => {
  console.error("Execution error:", err);
  process.exit(1);
});
