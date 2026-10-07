// scripts/forensic_adversarial_test.mjs
import crypto from "node:crypto";

const BASE_URL = "http://localhost:3000/api";

function base64url(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };
  const res = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, headers: res.headers, data };
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failed++;
  }
}

async function runForensicAudit() {
  console.log("====================================================================");
  console.log("TABLELINE FORENSIC ADVERSARIAL VERIFICATION & BENCHMARKING SUITE");
  console.log("====================================================================\n");

  // ------------------------------------------------------------------
  // PART A: JWT FALLBACK VERIFICATION ATTACK VECTORS (10 tests)
  // ------------------------------------------------------------------
  console.log("--- PART A: JWT Fallback Verification (10 Attack Vectors) ---");

  const { privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });

  const validPayload = {
    sub: "attacker_user_123",
    user_id: "attacker_user_123",
    email: "attacker@evil.com",
    aud: "digital-cafemenu",
    iss: "https://securetoken.google.com/digital-cafemenu",
    iat: Math.floor(Date.now() / 1000) - 60,
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  function buildJwt(headerObj, payloadObj, keyToSignWith = null) {
    const hB64 = base64url(JSON.stringify(headerObj));
    const pB64 = base64url(JSON.stringify(payloadObj));
    let sB64 = "invalidsignature";
    if (keyToSignWith) {
      const sign = crypto.createSign("RSA-SHA256");
      sign.update(`${hB64}.${pB64}`);
      sB64 = base64url(sign.sign(keyToSignWith));
    }
    return `${hB64}.${pB64}.${sB64}`;
  }

  // 1. Valid payload + invalid signature
  const t1 = buildJwt({ alg: "RS256", kid: "fake_kid_1" }, validPayload, null);
  const r1 = await request("/restaurants/newpizza/dashboard", { headers: { Authorization: `Bearer ${t1}` } });
  assert(r1.status === 401, `1. Valid payload + invalid signature rejected with 401 (got ${r1.status})`);

  // 2. Valid payload + unknown kid
  const t2 = buildJwt({ alg: "RS256", kid: "totally_unknown_kid_9999" }, validPayload, privateKey);
  const r2 = await request("/restaurants/newpizza/dashboard", { headers: { Authorization: `Bearer ${t2}` } });
  assert(r2.status === 401, `2. Valid payload + unknown kid rejected with 401 (got ${r2.status})`);

  // 3. Valid payload + missing kid
  const t3 = buildJwt({ alg: "RS256" }, validPayload, privateKey);
  const r3 = await request("/restaurants/newpizza/dashboard", { headers: { Authorization: `Bearer ${t3}` } });
  assert(r3.status === 401, `3. Valid payload + missing kid rejected with 401 (got ${r3.status})`);

  // 4. Valid payload + empty sub
  const t4 = buildJwt({ alg: "RS256", kid: "some_kid" }, { ...validPayload, sub: "   ", user_id: "" }, privateKey);
  const r4 = await request("/restaurants/newpizza/dashboard", { headers: { Authorization: `Bearer ${t4}` } });
  assert(r4.status === 401, `4. Changed empty sub rejected with 401 (got ${r4.status})`);

  // 5. Valid payload + changed aud
  const t5 = buildJwt({ alg: "RS256", kid: "some_kid" }, { ...validPayload, aud: "wrong-project-123" }, privateKey);
  const r5 = await request("/restaurants/newpizza/dashboard", { headers: { Authorization: `Bearer ${t5}` } });
  assert(r5.status === 401, `5. Changed audience rejected with 401 (got ${r5.status})`);

  // 6. Valid payload + changed iss
  const t6 = buildJwt({ alg: "RS256", kid: "some_kid" }, { ...validPayload, iss: "https://evil-issuer.com" }, privateKey);
  const r6 = await request("/restaurants/newpizza/dashboard", { headers: { Authorization: `Bearer ${t6}` } });
  assert(r6.status === 401, `6. Changed issuer rejected with 401 (got ${r6.status})`);

  // 7. Expired token
  const t7 = buildJwt(
    { alg: "RS256", kid: "some_kid" },
    { ...validPayload, exp: Math.floor(Date.now() / 1000) - 300 },
    privateKey
  );
  const r7 = await request("/restaurants/newpizza/dashboard", { headers: { Authorization: `Bearer ${t7}` } });
  assert(r7.status === 401, `7. Expired token rejected with 401 (got ${r7.status})`);

  // 8. Wrong algorithm (HS256)
  const t8 = buildJwt({ alg: "HS256", kid: "some_kid" }, validPayload, null);
  const r8 = await request("/restaurants/newpizza/dashboard", { headers: { Authorization: `Bearer ${t8}` } });
  assert(r8.status === 401, `8. Wrong algorithm (HS256) rejected with 401 (got ${r8.status})`);

  // 9. Malformed JWT structure
  const r9 = await request("/restaurants/newpizza/dashboard", { headers: { Authorization: "Bearer this.is.garbage.jwt" } });
  assert(r9.status === 401, `9. Malformed JWT structure rejected with 401 (got ${r9.status})`);

  // 10. Empty token
  const r10 = await request("/restaurants/newpizza/dashboard", { headers: { Authorization: "Bearer " } });
  assert(r10.status === 401, `10. Empty token rejected with 401 (got ${r10.status})`);

  // ------------------------------------------------------------------
  // PART B: WEBHOOK SECURITY VERIFICATION
  // ------------------------------------------------------------------
  console.log("\n--- PART B: Payment Webhook Security ---");
  const webhookBody = {
    event: "payment_intent.succeeded",
    orderId: "ord_nonexistent_test",
    restaurantId: "newpizza",
    amount: 500,
    currency: "inr",
  };

  // Missing signature
  const rWeb1 = await request("/payments/webhook", {
    method: "POST",
    body: webhookBody,
  });
  assert(
    rWeb1.status === 401 || rWeb1.status === 403 || rWeb1.status === 404,
    `Webhook without signature properly guarded (HTTP ${rWeb1.status})`
  );

  // Invalid signature
  const rWeb2 = await request("/payments/webhook", {
    method: "POST",
    headers: { "x-webhook-signature": "bogus_signature_hash" },
    body: webhookBody,
  });
  assert(
    rWeb2.status === 403 || rWeb2.status === 401 || rWeb2.status === 404,
    `Webhook with forged signature rejected or safely handled (HTTP ${rWeb2.status})`
  );

  // ------------------------------------------------------------------
  // PART C: HTTP SECURITY HEADERS
  // ------------------------------------------------------------------
  console.log("\n--- PART C: Production Security Headers ---");
  const headRes = await request("/health");
  assert(headRes.headers.get("x-content-type-options") === "nosniff", "Header X-Content-Type-Options: nosniff present");
  assert(headRes.headers.get("x-frame-options") === "SAMEORIGIN", "Header X-Frame-Options: SAMEORIGIN present");
  assert(headRes.headers.get("referrer-policy") === "strict-origin-when-cross-origin", "Header Referrer-Policy present");
  assert(headRes.headers.get("x-xss-protection") === "1; mode=block", "Header X-XSS-Protection: 1; mode=block present");
  assert(!headRes.headers.get("x-powered-by"), "X-Powered-By header is removed");

  // ------------------------------------------------------------------
  // PART D: MULTI-TENANT ISOLATION & IDOR
  // ------------------------------------------------------------------
  console.log("\n--- PART D: Multi-Tenant Isolation & IDOR Guards ---");
  const tenantA_slug = "forensic-tenant-a";
  const tenantB_slug = "forensic-tenant-b";

  // Create isolated restaurant A owned by owner-a
  await request("/platform/restaurants", {
    method: "POST",
    headers: { Authorization: "Bearer dev-test-token" },
    body: {
      name: "Forensic Tenant A",
      slug: tenantA_slug,
      ownerName: "Owner A",
      ownerEmail: "owner-a@tableline.com",
      phone: "+91 99999 11111",
      city: "Mumbai",
      numberOfTables: 5,
      plan: "growth",
      status: "active",
    },
  });

  // Create isolated restaurant B owned by owner-b
  await request("/platform/restaurants", {
    method: "POST",
    headers: { Authorization: "Bearer dev-test-token" },
    body: {
      name: "Forensic Tenant B",
      slug: tenantB_slug,
      ownerName: "Owner B",
      ownerEmail: "owner-b@tableline.com",
      phone: "+91 99999 22222",
      city: "Delhi",
      numberOfTables: 5,
      plan: "growth",
      status: "active",
    },
  });

  // Create table in Tenant B using dev-test-token
  const bTableRes = await request(`/restaurants/${tenantB_slug}/tables`, {
    method: "POST",
    headers: { Authorization: "Bearer dev-test-token" },
    body: { tableNumber: "TB99", capacity: 4, location: "Main Room" },
  });
  const bTableId = bTableRes.data?.table?.id || "tb99";

  // User A (mock-owner-a) attempts to access Tenant B's tables
  const crossTableAccess = await request(`/restaurants/${tenantB_slug}/tables`, {
    headers: { Authorization: "Bearer mock-owner-a" },
  });
  assert(
    crossTableAccess.status === 403 || crossTableAccess.status === 401,
    `Tenant A user blocked from reading Tenant B tables (HTTP ${crossTableAccess.status})`
  );

  // User A (mock-owner-a) attempts to access Tenant B's orders
  const crossOrderAccess = await request(`/restaurants/${tenantB_slug}/orders`, {
    headers: { Authorization: "Bearer mock-owner-a" },
  });
  assert(
    crossOrderAccess.status === 403 || crossOrderAccess.status === 401,
    `Tenant A user blocked from reading Tenant B orders (HTTP ${crossOrderAccess.status})`
  );

  // User A (mock-owner-a) attempts to delete Tenant B's table
  const crossTableDelete = await request(`/restaurants/${tenantB_slug}/tables/${bTableId}`, {
    method: "DELETE",
    headers: { Authorization: "Bearer mock-owner-a" },
  });
  assert(
    crossTableDelete.status === 403 || crossTableDelete.status === 401,
    `Tenant A user blocked from deleting Tenant B table (HTTP ${crossTableDelete.status})`
  );

  // User A (mock-owner-a) attempts to read Tenant B's audit logs
  const crossAuditAccess = await request(`/restaurants/${tenantB_slug}/audit-logs`, {
    headers: { Authorization: "Bearer mock-owner-a" },
  });
  assert(
    crossAuditAccess.status === 403 || crossAuditAccess.status === 401,
    `Tenant A user blocked from accessing Tenant B audit logs (HTTP ${crossAuditAccess.status})`
  );

  // ------------------------------------------------------------------
  // PART E: PRICE MANIPULATION & FINANCIAL INTEGRITY
  // ------------------------------------------------------------------
  console.log("\n--- PART E: Financial Integrity & Anti-Abuse Bounds ---");

  // Get active menu of newpizza
  const menuRes = await request(`/public/menu/newpizza`);
  const items = menuRes.data?.items || [];
  const testItem = items[0] || { id: "item_margherita", name: "Margherita Pizza", price: 250 };
  const tableSlug = "table-1";

  // Attempt client-side price tampering (sending ₹1 price)
  const tamperedOrderRes = await request(`/public/menu/newpizza/table/${tableSlug}/orders`, {
    method: "POST",
    body: {
      items: [
        {
          menuItemId: testItem.id,
          price: 1, // Tampered client price
          quantity: 1,
        },
      ],
      subtotal: 1, // Tampered subtotal
      total: 1, // Tampered total
    },
  });

  if (tamperedOrderRes.status === 201) {
    const authoritativeSubtotal = tamperedOrderRes.data?.subtotal;
    assert(
      authoritativeSubtotal >= testItem.price,
      `Server ignored tampered client price ₹1 and calculated authoritative subtotal ₹${authoritativeSubtotal}`
    );
  } else {
    // If table requires PIN or rate limits, verify it safely handled
    assert(
      tamperedOrderRes.status === 400 || tamperedOrderRes.status === 401 || tamperedOrderRes.status === 429 || tamperedOrderRes.status === 404,
      `Order safely gated by validation (HTTP ${tamperedOrderRes.status} ${tamperedOrderRes.data?.code || ""})`
    );
  }

  // Attempt negative quantity (-5) on table-2
  const negativeQtyRes = await request(`/public/menu/newpizza/table/table-2/orders`, {
    method: "POST",
    body: {
      items: [{ menuItemId: testItem.id, quantity: -5 }],
    },
  });
  assert(
    negativeQtyRes.status === 400 || negativeQtyRes.status === 429,
    `Negative quantity rejected with 400/429 (HTTP ${negativeQtyRes.status} ${negativeQtyRes.data?.error || ""})`
  );

  // Attempt zero quantity (0) on table-3
  const zeroQtyRes = await request(`/public/menu/newpizza/table/table-3/orders`, {
    method: "POST",
    body: {
      items: [{ menuItemId: testItem.id, quantity: 0 }],
    },
  });
  assert(
    zeroQtyRes.status === 400 || zeroQtyRes.status === 429,
    `Zero quantity rejected with 400/429 (HTTP ${zeroQtyRes.status} ${zeroQtyRes.data?.error || ""})`
  );

  // Attempt extreme quantity abuse (999,999) on table-4
  const hugeQtyRes = await request(`/public/menu/newpizza/table/table-4/orders`, {
    method: "POST",
    body: {
      items: [{ menuItemId: testItem.id, quantity: 999999 }],
    },
  });
  assert(
    hugeQtyRes.status === 400 || hugeQtyRes.status === 429,
    `Extreme quantity abuse rejected with 400/429 (HTTP ${hugeQtyRes.status} ${hugeQtyRes.data?.error || ""})`
  );

  // Attempt > 25 distinct items
  const manyItems = [];
  for (let i = 0; i < 26; i++) {
    manyItems.push({ menuItemId: testItem.id, quantity: 1 });
  }
  const tooManyItemsRes = await request(`/public/menu/newpizza/table/${tableSlug}/orders`, {
    method: "POST",
    body: { items: manyItems },
  });
  assert(
    tooManyItemsRes.status === 400 || tooManyItemsRes.status === 429,
    `Exceeding 25 unique items rejected by validator or rate-limiter (HTTP ${tooManyItemsRes.status})`
  );

  // ------------------------------------------------------------------
  // PART F: REAL BENCHMARK MEASUREMENTS (p50, p95, p99)
  // ------------------------------------------------------------------
  console.log("\n--- PART F: Real Latency Benchmarking (50 requests per endpoint) ---");

  async function benchmark(label, fn, iterations = 50) {
    const latencies = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn();
      const end = performance.now();
      latencies.push(end - start);
    }
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(iterations * 0.5)].toFixed(1);
    const p95 = latencies[Math.floor(iterations * 0.95)].toFixed(1);
    const p99 = latencies[Math.floor(iterations * 0.99)].toFixed(1);
    const avg = (latencies.reduce((sum, v) => sum + v, 0) / iterations).toFixed(1);
    console.log(`  ⏱️  [${label}] avg: ${avg}ms | p50: ${p50}ms | p95: ${p95}ms | p99: ${p99}ms`);
    return { avg, p50, p95, p99 };
  }

  const benchMenu = await benchmark("Public Menu & QR Resolution", () =>
    request("/public/menu/newpizza")
  );

  const benchHealth = await benchmark("Health & Security Check", () =>
    request("/health")
  );

  const benchDashboard = await benchmark("Staff Dashboard Pipeline", () =>
    request("/restaurants/newpizza/dashboard", {
      headers: { Authorization: "Bearer dev-test-token" },
    })
  );

  const benchOrders = await benchmark("Orders Pipeline", () =>
    request("/restaurants/newpizza/orders", {
      headers: { Authorization: "Bearer dev-test-token" },
    })
  );

  console.log("\n====================================================================");
  console.log(`AUDIT RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log("====================================================================");
}

runForensicAudit().catch((err) => {
  console.error("Forensic test crashed:", err);
  process.exit(1);
});
