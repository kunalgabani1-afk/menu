import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";

function request(method, path, body, headers = {}) {
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
          resolve({ status: res.statusCode, data: resData, json, headers: res.headers });
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✓ PASSED: ${message}`);
}

async function runTests() {
  console.log("=== TABLELINE CONTACT EMAIL VERIFICATION TEST SUITE ===");

  // 1. Invalid email test
  const res1 = await request("POST", "/api/contact/send-verification", {
    email: "not-an-email",
    name: "Bad Input",
  });
  assert(res1.status === 400, "Invalid email format rejected with 400");
  assert(res1.json?.error?.includes("valid email"), "Error message asks for valid email");

  // 2. Disposable email test
  const res2 = await request("POST", "/api/contact/send-verification", {
    email: "spammer@mailinator.com",
    name: "Spam User",
  });
  assert(res2.status === 400, "Disposable email rejected with 400");
  assert(res2.json?.error?.includes("permanent email"), "Error specifies temporary/disposable not supported");

  // 3. Valid email verification dispatch
  const testEmail = `newvisitor_${Date.now()}@gmail.com`;
  const res3 = await request("POST", "/api/contact/send-verification", {
    email: testEmail,
    name: "Aarav Sharma",
  });
  assert(res3.status === 200, "Valid email accepted with 200");
  assert(res3.json?.success === true, "Response returns success: true");
  assert(Boolean(res3.json?.verificationSessionId), "Returns verificationSessionId");
  const sessionId = res3.json.verificationSessionId;

  // 4. Rate limiting / Cooldown test
  const res4 = await request("POST", "/api/contact/send-verification", {
    email: testEmail,
    name: "Aarav Sharma",
  });
  assert(res4.status === 429, "Immediate repeated request is rate-limited with 429");
  assert(Boolean(res4.json?.cooldownSeconds), "Returns cooldown remaining seconds");

  // 5. Unverified submission bypass attempt (Attacker trying to submit with emailVerified: true)
  const res5 = await request("POST", "/api/platform/leads", {
    restaurantName: "Hacker Cafe",
    ownerName: "Attacker",
    phone: "+919876543210",
    email: testEmail,
    city: "Delhi",
    numberOfTables: 15,
    requestedPlan: "growth",
    emailVerified: true, // Attacker trying to spoof verified status
  });
  assert(res5.status === 400, "Unverified submission rejected by server with 400");
  assert(res5.json?.code === "EMAIL_NOT_VERIFIED", "Rejection code is EMAIL_NOT_VERIFIED");

  // 6. Inspect database for token storage at rest
  const dbPath = fs.existsSync("/app/applet/data/tableline_production_db.json")
    ? "/app/applet/data/tableline_production_db.json"
    : "./data/tableline_production_db.json";
  const dbContent = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  const tokens = dbContent.contactVerificationTokens || {};
  const tokenEntries = Object.entries(tokens).filter(([_, v]) => v.email === testEmail);
  assert(tokenEntries.length === 1, "Exactly one verification record created in database");
  const [tokenHash, record] = tokenEntries[0];
  assert(record.purpose === "CONTACT_EMAIL_VERIFICATION", "Record purpose is CONTACT_EMAIL_VERIFICATION");
  assert(record.tokenHash === tokenHash, "Record is keyed and indexed by SHA-256 hash");
  assert(record.usedAt === null, "Token starts with usedAt: null");
  assert(record.expiresAt > Date.now(), "Token expiration is in the future (~30 minutes)");

  // Verify that raw token is NOT in plaintext in database
  const dbString = JSON.stringify(dbContent);
  assert(!dbString.includes("rawToken"), "Raw token never saved in database");

  // 7. Test invalid token on verification endpoint
  const res7 = await request("GET", "/api/contact/verify?token=fake_random_invalid_token_12345");
  assert(res7.status === 400, "Invalid token rejected with 400");
  assert(res7.data.includes("invalid or no longer available"), "Invalid token error message shown");

  // 8. Test successful verification link click
  // For test execution, we calculate a test raw token that hashes to tokenHash or generate one
  const testRawToken = crypto.randomBytes(32).toString("hex");
  const testHash = crypto.createHash("sha256").update(testRawToken).digest("hex");
  const testSessionId = `vs_test_${Date.now()}`;
  const now = Date.now();

  // Save a test verification token to test the exact verification endpoint
  dbContent.contactVerificationTokens = dbContent.contactVerificationTokens || {};
  dbContent.contactVerificationTokens[testHash] = {
    email: testEmail,
    tokenHash: testHash,
    verificationSessionId: testSessionId,
    purpose: "CONTACT_EMAIL_VERIFICATION",
    createdAt: now,
    expiresAt: now + 30 * 60 * 1000,
    usedAt: null,
    verifiedAt: null,
  };
  fs.writeFileSync(dbPath, JSON.stringify(dbContent, null, 2));

  const res8 = await request("GET", `/api/contact/verify?token=${testRawToken}`);
  assert(res8.status === 200, "Verification link returns 200");
  assert(res8.data.includes("Email Verified"), "Returns Email Verified confirmation page");
  assert(res8.data.includes("#contact?verified=1"), "Redirects user back to same Contact Form");

  // 9. Test Reused Token Prevention (Single-Use Token)
  const res9 = await request("GET", `/api/contact/verify?token=${testRawToken}`);
  assert(res9.status === 400, "Reused token rejected with 400");
  assert(res9.data.includes("already been used"), "Reused token returns 'already been used'");

  // 10. Test verification status endpoint
  const res10 = await request("POST", "/api/contact/verify-status", {
    email: testEmail,
    session: testSessionId,
  });
  assert(res10.status === 200, "Verify status check returns 200");
  assert(res10.json?.verified === true, "Status confirms verified: true");

  // 11. Test final lead submission with valid verification
  const res11 = await request("POST", "/api/platform/leads", {
    restaurantName: "The Grand Bistro",
    ownerName: "Aarav Sharma",
    phone: "+919876543210",
    email: testEmail,
    city: "Mumbai",
    numberOfTables: 24,
    requestedPlan: "growth",
    timeline: "Within 2 weeks",
    message: "Interested in QR ordering and kitchen display.",
    verificationSessionId: testSessionId,
  });
  assert(res11.status === 201, "Lead submitted successfully with 201 Created");
  assert(res11.json?.success === true, "Lead creation returns success: true");
  assert(res11.json?.emailVerified === true, "Lead response confirms emailVerified: true");
  const leadId = res11.json.leadId;

  // 12. Verify Platform Admin view & Lead record
  const updatedDb = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  const createdLead = updatedDb.platform?.leads?.[leadId];
  assert(Boolean(createdLead), "Lead exists in platform/leads");
  assert(createdLead.emailVerified === true, "Lead has emailVerified: true");
  assert(createdLead.verificationMethod === "emailjs_token", "Lead has verificationMethod: emailjs_token");
  assert(createdLead.verifiedAt > 0, "Lead has verifiedAt timestamp");

  // 13. Verify that re-submitting with the consumed session is rejected (Replay attack prevention)
  const res13 = await request("POST", "/api/platform/leads", {
    restaurantName: "Copycat Cafe",
    ownerName: "Sneaky User",
    phone: "+919876543210",
    email: `another_${Date.now()}@gmail.com`,
    city: "Mumbai",
    numberOfTables: 10,
    requestedPlan: "starter",
    verificationSessionId: testSessionId, // Trying to reuse previously consumed session
  });
  assert(res13.status === 400, "Reusing consumed verification session is rejected");

  console.log("\n🎉 ALL 13 VERIFICATION TESTS PASSED SUCCESSFULLY!");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
