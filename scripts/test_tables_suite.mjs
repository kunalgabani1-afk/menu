// scripts/test_tables_suite.mjs
import http from "node:http";

const BASE_URL = "http://localhost:3000/api";

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer dev-test-token",
    ...options.headers,
  };
  const res = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function runSuite() {
  console.log("=== Starting Tableline Tables & QR System Verification Suite ===\n");
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Get or setup a test restaurant
  console.log("1. Finding or seeding test restaurant...");
  const platRes = await request("/platform/restaurants");
  const activeRest = (Array.isArray(platRes.data) ? platRes.data : []).find(r => r.accountStatus === "ACTIVE" && r.status === "active");
  const slug = activeRest ? activeRest.slug : "newpizza";

  // Ensure restaurant exists with tables
  console.log(`Using restaurant slug: "${slug}"`);

  // Clean up any existing test table
  const existingTables = await request(`/restaurants/${slug}/tables`);
  let tablesList = Array.isArray(existingTables.data) ? existingTables.data : [];
  for (const t of tablesList) {
    if (t.tableNumber === "T99" || t.tableNumber === "T98") {
      await request(`/restaurants/${slug}/tables/${t.id}`, { method: "DELETE" });
    }
  }

  // TEST 1: Create Table with Number & Location
  console.log("\n--- TEST 1: Simple Table Creation ---");
  const createRes = await request(`/restaurants/${slug}/tables`, {
    method: "POST",
    body: { tableNumber: "T99", location: "Garden Terrace", active: true },
  });
  assert(createRes.status === 201, `Table created with 201 status (got ${createRes.status})`);
  assert(createRes.data.tableNumber === "T99", `Table number is T99`);
  assert(createRes.data.location === "Garden Terrace", `Location stored as "Garden Terrace"`);
  assert(Boolean(createRes.data.qrToken), `Secure qrToken generated: ${createRes.data.qrToken}`);
  assert(createRes.data.status === "AVAILABLE", `Initial table status is AVAILABLE`);
  const tableId = createRes.data.id;
  const initialQrToken = createRes.data.qrToken;

  // TEST 2: Duplicate Table Number Validation
  console.log("\n--- TEST 2: Duplicate Table Number Validation ---");
  const dupRes = await request(`/restaurants/${slug}/tables`, {
    method: "POST",
    body: { tableNumber: "T99", location: "Main Hall", active: true },
  });
  assert(dupRes.status === 400, `Duplicate table number rejected with 400 (got ${dupRes.status})`);
  assert(
    dupRes.data.code === "DUPLICATE_TABLE_NUMBER" || dupRes.data.code === "TABLE_NUMBER_EXISTS",
    `Error code is duplicate table code: ${dupRes.data.code}`
  );

  // TEST 3: Public Table Lookup & Auto-Session Creation
  console.log("\n--- TEST 3: Public Table Menu Lookup & Session Initiation ---");
  const menuRes = await request(`/public/menu/${slug}/table/table-t99`);
  assert(menuRes.status === 200, `Public menu returns 200 for table-t99`);
  assert(menuRes.data.table?.tableNumber === "T99", `Menu identifies Table T99`);
  assert(menuRes.data.table?.location === "Garden Terrace", `Menu displays location`);
  assert(Boolean(menuRes.data.session?.id), `Auto-created active session: ${menuRes.data.session?.id}`);
  assert(Boolean(menuRes.data.session?.token), `Server issued signed session token`);
  const activeSessionId = menuRes.data.session?.id;
  const sessionToken = menuRes.data.session?.token;

  // Verify Table state in dashboard is now OCCUPIED
  const tablesOccupiedCheck = await request(`/restaurants/${slug}/tables`);
  const t99InList = tablesOccupiedCheck.data.find(t => t.id === tableId);
  assert(t99InList?.status === "OCCUPIED", `Table status in restaurant view is OCCUPIED`);
  assert(t99InList?.activeSession?.id === activeSessionId, `Table linked to active session`);

  // TEST 4: QR Token Lookup
  console.log("\n--- TEST 4: Public Lookup by QR Token ---");
  const qrLookupRes = await request(`/public/menu/${slug}/table/${initialQrToken}`);
  assert(qrLookupRes.status === 200, `Public menu accessible via qrToken`);
  assert(qrLookupRes.data.table?.id === tableId, `Resolves to correct table ID`);
  assert(qrLookupRes.data.session?.id === activeSessionId, `Reuses current active dining session`);

  // TEST 5: Place Order bound to Table Session
  console.log("\n--- TEST 5: Order Placement Bound to Session ---");
  // Get an item from the menu or create one
  let testItem = (Array.isArray(menuRes.data.items) && menuRes.data.items.length > 0) ? menuRes.data.items[0] : null;
  if (!testItem) {
    const catRes = await request(`/restaurants/${slug}/categories`, {
      method: "POST",
      body: { name: "Pizzas", active: true },
    });
    const itemRes = await request(`/restaurants/${slug}/menu-items`, {
      method: "POST",
      body: {
        name: "Farmhouse Pizza",
        categoryId: catRes.data?.id || "default",
        price: 250,
        veg: true,
        available: true,
      },
    });
    testItem = itemRes.data;
  }
  const orderRes = await request(`/public/menu/${slug}/table/table-t99/orders`, {
    method: "POST",
    body: {
      items: [{ menuItemId: testItem.id, name: testItem.name, price: testItem.price, quantity: 2 }],
      paymentMethod: "PAY_LATER",
      tableSessionToken: sessionToken,
      idempotencyKey: `idem_${Date.now()}`,
    },
  });
  assert(orderRes.status === 201, `Order placed with 201 (got ${orderRes.status})`);
  assert(orderRes.data.sessionId === activeSessionId, `Order bound to active table session`);
  assert(orderRes.data.tableNumber === "T99", `Order has tableNumber T99`);
  assert(orderRes.data.tableLocation === "Garden Terrace", `Order has tableLocation`);
  const orderId = orderRes.data.id;

  // Staff approves initial order so subsequent orders are permitted
  if (orderRes.status === 201) {
    await request(`/restaurants/${slug}/orders/${orderId}/status`, {
      method: "PATCH",
      body: { status: "APPROVED" },
    });
  }

  // TEST 6: Idempotent Submission (Duplicate Protection)
  console.log("\n--- TEST 6: Idempotent Submission Protection ---");
  const idemKey = `idem_dup_${Date.now()}`;
  const firstOrder = await request(`/public/menu/${slug}/table/table-t99/orders`, {
    method: "POST",
    body: {
      items: [{ menuItemId: testItem.id, name: testItem.name, price: testItem.price, quantity: 1 }],
      paymentMethod: "PAY_LATER",
      tableSessionToken: sessionToken,
      idempotencyKey: idemKey,
    },
  });
  if (firstOrder.status !== 201) {
    console.log("firstOrder response:", firstOrder.status, firstOrder.data);
  }
  const dupOrder = await request(`/public/menu/${slug}/table/table-t99/orders`, {
    method: "POST",
    body: {
      items: [{ menuItemId: testItem.id, name: testItem.name, price: testItem.price, quantity: 1 }],
      paymentMethod: "PAY_LATER",
      tableSessionToken: sessionToken,
      idempotencyKey: idemKey,
    },
  });
  if (dupOrder.status !== 200) {
    console.log("dupOrder response:", dupOrder.status, dupOrder.data);
  }
  assert(firstOrder.status === 201, `First submission accepted (got ${firstOrder.status})`);
  assert(dupOrder.status === 200, `Duplicate submission recognized (200 status, got ${dupOrder.status})`);
  assert(dupOrder.data.id === firstOrder.data.id, `Returned identical order ID without creating duplicate`);

  // TEST 7: Cross-Table Session Tampering Protection
  console.log("\n--- TEST 7: Cross-Table Session Token Mismatch Security ---");
  // Create another table T98
  const t98Res = await request(`/restaurants/${slug}/tables`, {
    method: "POST",
    body: { tableNumber: "T98", active: true },
  });
  const t98Id = t98Res.data.id;
  // Attempt to use T99's session token on Table T98
  const tamperRes = await request(`/public/menu/${slug}/table/table-t98/orders`, {
    method: "POST",
    body: {
      items: [{ menuItemId: testItem.id, name: testItem.name, price: testItem.price, quantity: 1 }],
      paymentMethod: "PAY_LATER",
      tableSessionToken: sessionToken, // Token for T99!
    },
  });
  assert(tamperRes.status === 403, `Cross-table session rejected with 403 (got ${tamperRes.status})`);
  assert(tamperRes.data.code === "SESSION_TABLE_MISMATCH", `Error code is SESSION_TABLE_MISMATCH`);

  // TEST 8: QR Code Rotation & Revocation
  console.log("\n--- TEST 8: QR Code Rotation & Revocation of Old QR ---");
  const regenRes = await request(`/restaurants/${slug}/tables/${tableId}/regenerate-qr`, {
    method: "POST",
  });
  assert(regenRes.status === 200, `Regenerate QR returns 200`);
  assert(Boolean(regenRes.data.qrToken), `New QR token generated: ${regenRes.data.qrToken}`);
  assert(regenRes.data.qrToken !== initialQrToken, `New QR token is different from old token`);
  const newQrToken = regenRes.data.qrToken;

  // Try to access with OLD revoked qrToken
  const oldQrLookup = await request(`/public/menu/${slug}/table/${initialQrToken}`);
  assert(oldQrLookup.status === 404, `Old revoked QR token rejected with 404 TABLE_NOT_FOUND (got ${oldQrLookup.status})`);

  // Access with NEW qrToken
  const newQrLookup = await request(`/public/menu/${slug}/table/${newQrToken}`);
  assert(newQrLookup.status === 200, `New QR token resolves successfully`);

  // TEST 9: Staff End / Close Table Session
  console.log("\n--- TEST 9: Staff End Table Session & Availability Reset ---");
  const closeRes = await request(`/restaurants/${slug}/tables/${tableId}/close-session`, {
    method: "POST",
  });
  assert(closeRes.status === 200, `Close session returns 200`);
  assert(closeRes.data.table?.status === "AVAILABLE", `Table status reset to AVAILABLE`);
  assert(closeRes.data.table?.activeSessionId === null, `activeSessionId cleared`);

  // Verify historical order still exists!
  const orderCheck = await request(`/public/orders/${orderId}`);
  assert(orderCheck.status === 200, `Historical order ${orderId} is intact after session closed`);
  assert(orderCheck.data.sessionId === activeSessionId, `Historical order preserves sessionId`);

  // TEST 10: Inactive Table Protection
  console.log("\n--- TEST 10: Inactive Table Protection ---");
  await request(`/restaurants/${slug}/tables/${tableId}`, {
    method: "PATCH",
    body: { active: false },
  });
  const inactiveMenu = await request(`/public/menu/${slug}/table/table-t99`);
  assert(inactiveMenu.status === 410, `Inactive table menu returns 410 TABLE_INACTIVE (got ${inactiveMenu.status})`);

  const inactiveOrder = await request(`/public/menu/${slug}/table/table-t99/orders`, {
    method: "POST",
    body: {
      items: [{ menuItemId: testItem.id, name: testItem.name, price: testItem.price, quantity: 1 }],
      paymentMethod: "PAY_LATER",
    },
  });
  assert(inactiveOrder.status === 400, `Order on inactive table rejected with 400 TABLE_INACTIVE`);

  // Clean up
  await request(`/restaurants/${slug}/tables/${tableId}`, { method: "DELETE" });
  await request(`/restaurants/${slug}/tables/${t98Id}`, { method: "DELETE" });

  console.log(`\n=== Verification Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runSuite().catch(err => {
  console.error("Test Suite crashed:", err);
  process.exit(1);
});
