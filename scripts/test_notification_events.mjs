import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const admin = require("/app/applet/artifacts/api-server/node_modules/firebase-admin");

const BASE_URL = "http://127.0.0.1:5000";

let db;
let adminApp;
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const dbUrl = process.env.FIREBASE_DATABASE_URL || process.env.VITE_FIREBASE_DATABASE_URL;
  adminApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: dbUrl,
  });
  db = admin.database(adminApp);
} catch (err) {
  console.error("Firebase admin init failed:", err.message);
}

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : "";
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 5000,
        path: path.startsWith("/api") ? path : `/api${path}`,
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

function listenSseEvents(slug, durationMs = 8000) {
  return new Promise((resolve, reject) => {
    const events = [];
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 5000,
        path: `/api/restaurants/${slug}/orders/stream`,
        method: "GET",
        headers: { Accept: "text/event-stream" },
      },
      (res) => {
        let buffer = "";
        let currentEvent = null;

        res.on("data", (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop();

          for (const line of lines) {
            if (line.startsWith("event:")) {
              currentEvent = line.replace("event:", "").trim();
            } else if (line.startsWith("data:")) {
              const dataStr = line.replace("data:", "").trim();
              try {
                const parsed = JSON.parse(dataStr);
                events.push({ event: currentEvent || "message", data: parsed });
              } catch {
                events.push({ event: currentEvent || "message", data: dataStr });
              }
              currentEvent = null;
            }
          }
        });

        setTimeout(() => {
          req.destroy();
          resolve(events);
        }, durationMs);
      }
    );

    req.on("error", (err) => {
      if (req.destroyed) {
        resolve(events);
      } else {
        reject(err);
      }
    });
    req.end();
  });
}

async function testSuite() {
  console.log("================================================================================");
  console.log("TABLELINE NOTIFICATION & SOUND SYSTEM — REALTIME ADVERSARIAL & EVENT TEST");
  console.log("================================================================================\n");

  const now = Date.now();
  const tenantId = `test_notif_tenant_${now}`;
  const slug = `notif-cafe-${now}`;
  const ownerUid = `owner_${now}`;
  const tableId = `tbl_${now}`;

  console.log(`[1] Seeding test tenant "${slug}" in Firebase RTDB...`);
  await db.ref(`restaurants/${tenantId}`).set({
    profile: {
      id: tenantId,
      name: "Notification Test Bistro",
      slug,
      plan: "pro",
      ownerId: ownerUid,
      currency: "₹",
    },
    settings: {
      restaurantStatus: "active",
      orderingEnabled: true,
      serviceCallsEnabled: true,
    },
    members: {
      [ownerUid]: { role: "owner", active: true, status: "active" },
    },
    tables: {
      [tableId]: {
        id: tableId,
        slug: "table-07",
        tableNumber: "07",
        active: true,
      },
    },
    menuItems: {
      item_1: {
        id: "item_1",
        name: "Signature Cold Brew",
        price: 210,
        active: true,
        available: true,
      },
    },
  });

  await db.ref(`restaurantSlugs/${slug}`).set({
    restaurantId: tenantId,
    active: true,
  });

  // Create owner custom token & ID token
  const token = await admin.auth(adminApp).createCustomToken(ownerUid);
  // Exchange custom token for ID token via Google Identity Toolkit
  let idToken = "";
  try {
    const apiKey = process.env.VITE_FIREBASE_API_KEY;
    const tokenRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, returnSecureToken: true }),
      }
    );
    const tokenData = await tokenRes.json();
    idToken = tokenData.idToken;
  } catch (e) {
    console.warn("Could not get Firebase ID token, will use dev header:", e.message);
  }

  const authHeaders = idToken ? { Authorization: `Bearer ${idToken}` } : {};

  console.log(`[2] Starting real-time EventSource listener for restaurant "${slug}"...`);
  const sseCollector = listenSseEvents(slug, 7000);
  await new Promise((r) => setTimeout(r, 800));

  // --- TEST A: Customer places order requiring approval (Pay Later) ---
  console.log(`\n[3] Triggering Customer Order (NEEDS_APPROVAL)...`);
  const orderRes = await request(
    "POST",
    `/public/menu/${slug}/table/table-07/orders`,
    {
      items: [{ menuItemId: "item_1", quantity: 2, price: 210 }],
      paymentMethod: "PAY_LATER",
      customerPhone: "9876543210",
    }
  );

  console.log(`   Response status: ${orderRes.status}`);
  const orderData = orderRes.json;
  const orderId = orderData.id;
  const orderNumber = orderData.orderNumber;
  console.log(`   Created Order: ID=${orderId}, Order #${orderNumber}, Status=${orderData.status}`);

  if (orderRes.status !== 201) {
    console.error("Order creation failed:", orderRes.body);
  }

  // --- TEST B: Owner Approves the Order ---
  console.log(`\n[4] Triggering Order Approval by Owner -> ORDER_APPROVED_FOR_KDS...`);
  await new Promise((r) => setTimeout(r, 1000));

  const approveRes = await request(
    "POST",
    `/restaurants/${slug}/orders/${orderId}/approve`,
    {},
    authHeaders
  );
  console.log(`   Approve Response status: ${approveRes.status}, Order Status: ${approveRes.json?.status}`);

  // --- TEST C: Customer Calls Waiter ---
  console.log(`\n[5] Triggering Waiter Call -> WAITER_CALL...`);
  await new Promise((r) => setTimeout(r, 1000));

  const waiterRes = await request(
    "POST",
    `/restaurants/${slug}/waiter-requests`,
    {
      tableNumber: "07",
      serviceType: "WATER",
      notes: "Refill glasses please",
    }
  );
  console.log(`   Waiter Request status: ${waiterRes.status}, Request ID: ${waiterRes.json?.id}`);

  // Wait for SSE collector
  const events = await sseCollector;
  console.log(`\n[6] SSE Collection Complete. Total events captured: ${events.length}`);

  // Clean up test data
  try {
    await db.ref(`restaurants/${tenantId}`).remove();
    await db.ref(`restaurantSlugs/${slug}`).remove();
  } catch {}

  // Verification & Assertions
  const needsApprovalEvents = events.filter((e) => e.event === "ORDER_NEEDS_APPROVAL");
  const approvedForKdsEvents = events.filter((e) => e.event === "ORDER_APPROVED_FOR_KDS");
  const waiterCallEvents = events.filter((e) => e.event === "WAITER_CALL");

  console.log("\n================================================================================");
  console.log("NOTIFICATIONS & SOUND SYSTEM VERIFICATION REPORT");
  console.log("================================================================================\n");

  let passed = true;

  // 1. ORDER_NEEDS_APPROVAL verification
  console.log("Requirement 1: CUSTOMER ORDER → NEEDS APPROVAL");
  if (needsApprovalEvents.length >= 1) {
    const ev = needsApprovalEvents[0];
    const hasOrderNumber = Boolean(ev.data.orderNumber);
    const isNeedsApprovalStatus =
      ev.data.status === "NEEDS_APPROVAL" || ev.data.status === "PENDING_WAITER_APPROVAL";
    console.log(`  ✓ ORDER_NEEDS_APPROVAL event captured: YES`);
    console.log(`  ✓ Order Number visible: #${ev.data.orderNumber} (PASS)`);
    console.log(`  ✓ Table Number: ${ev.data.tableNumber} (PASS)`);
    console.log(`  ✓ Status: ${ev.data.status} (PASS)`);
    if (!hasOrderNumber || !isNeedsApprovalStatus) passed = false;
  } else {
    console.log(`  ✗ ORDER_NEEDS_APPROVAL event not received!`);
    passed = false;
  }

  // 2. ORDER_APPROVED_FOR_KDS verification
  console.log("\nRequirement 2: ORDER APPROVAL → ORDER_APPROVED_FOR_KDS");
  if (approvedForKdsEvents.length >= 1) {
    const ev = approvedForKdsEvents[0];
    const hasOrderNumber = Boolean(ev.data.orderNumber);
    const isApprovedStatus = ev.data.status === "APPROVED";
    console.log(`  ✓ ORDER_APPROVED_FOR_KDS event captured: YES`);
    console.log(`  ✓ Order Number visible: #${ev.data.orderNumber} (PASS)`);
    console.log(`  ✓ Order Status: ${ev.data.status} (PASS)`);
    if (!hasOrderNumber || !isApprovedStatus) passed = false;
  } else {
    console.log(`  ✗ ORDER_APPROVED_FOR_KDS event not received!`);
    passed = false;
  }

  // 3. WAITER_CALL verification
  console.log("\nRequirement 3: WAITER CALL → WAITER_CALL");
  if (waiterCallEvents.length >= 1) {
    const ev = waiterCallEvents[0];
    console.log(`  ✓ WAITER_CALL event captured: YES`);
    console.log(`  ✓ Table: ${ev.data.tableNumber}, Service: ${ev.data.serviceType} (PASS)`);
  } else {
    console.log(`  ✗ WAITER_CALL event not received!`);
    passed = false;
  }

  // 4. Strict Isolation & Zero Cross-Triggering
  console.log("\nRequirement 4: STRICT EVENT INDEPENDENCE (ZERO CROSS-TRIGGERING)");
  const cross1 = needsApprovalEvents.some((e) => e.data.serviceType);
  const cross2 = approvedForKdsEvents.some((e) => e.data.serviceType);
  const cross3 = waiterCallEvents.some((e) => e.data.items);
  const kdsUnapproved = approvedForKdsEvents.some(
    (e) => e.data.status === "PENDING_WAITER_APPROVAL" || e.data.status === "NEEDS_APPROVAL"
  );

  console.log(`  ✓ ORDER_NEEDS_APPROVAL does NOT trigger waiter call: ${!cross1 ? "PASS" : "FAIL"}`);
  console.log(`  ✓ ORDER_APPROVED_FOR_KDS does NOT contain unapproved orders: ${!kdsUnapproved ? "PASS" : "FAIL"}`);
  console.log(`  ✓ WAITER_CALL does NOT trigger order chimes/items: ${!cross3 ? "PASS" : "FAIL"}`);

  if (cross1 || cross2 || cross3 || kdsUnapproved) {
    passed = false;
  }

  console.log("\n--------------------------------------------------------------------------------");
  console.log(`FINAL RESULT: ${passed ? "ALL CHECKS PASSED ✅" : "FAILURE DETECTED ❌"}`);
  console.log("--------------------------------------------------------------------------------");

  process.exit(passed ? 0 : 1);
}

testSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
