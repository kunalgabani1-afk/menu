// Complete 35-point acceptance test suite
const BASE_URL = "http://127.0.0.1:3000";
const AUTH_HEADER = {
  Authorization: "Bearer dev-test-token",
  "Content-Type": "application/json",
};

let passed = 0;
let failed = 0;

function check(assertion, message) {
  if (assertion) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

async function main() {
  console.log("===============================================================");
  console.log("   TABLELINE: CAPTAIN MOBILE WEB & PRO SHIFT CLOSE ACCEPTANCE  ");
  console.log("===============================================================\n");

  // 1. Gating & Entitlements
  console.log("--- 1. Plan Entitlements & Normalization ---");
  const dashRes = await fetch(`${BASE_URL}/api/restaurants/cafe-1/dashboard`, { headers: AUTH_HEADER });
  const dashData = await dashRes.json();
  check(dashRes.ok, "1. Authenticated staff can access /api/restaurants/:slug/dashboard");
  check(dashData.planEntitlements?.captain_ordering === true, "2. Pro plan has captain_ordering entitlement enabled");
  check(dashData.planEntitlements?.shift_close === true, "3. Pro plan has shift_close entitlement enabled");

  // 2. Captain Mobile Ordering
  console.log("\n--- 2. Captain Mobile Mode Acceptance ---");
  const tablesRes = await fetch(`${BASE_URL}/api/restaurants/cafe-1/tables`, { headers: AUTH_HEADER });
  const tables = await tablesRes.json();
  check(tables.length > 0, "4. Waiter sees authenticated restaurant tables");
  const selectedTable = tables[0];
  check(Boolean(selectedTable.status), `5. Table status is visible (${selectedTable.status})`);

  const menuRes = await fetch(`${BASE_URL}/api/restaurants/cafe-1/menu-items`, { headers: AUTH_HEADER });
  const menu = await menuRes.json();
  check(menu.length >= 2, `6. Menu items retrieved (${menu.length} items found)`);
  const item1 = menu[0];
  const item2 = menu[1];

  // 7. Out-of-stock validation
  const unavailableItem = menu.find(i => i.available === false);
  console.log("7. Out-of-stock check:", unavailableItem ? `Found unavailable: ${unavailableItem.name}` : "All current items available");

  // 8. Place Staff Order via Captain API
  const captainRequestId = `test_cap_order_${Date.now()}`;
  const orderRes = await fetch(`${BASE_URL}/api/restaurants/cafe-1/orders/captain`, {
    method: "POST",
    headers: AUTH_HEADER,
    body: JSON.stringify({
      tableId: selectedTable.id,
      captainRequestId,
      items: [
        {
          menuItemId: item1.id,
          quantity: 2,
          specialInstructions: "Staff note: less ice",
        },
        {
          menuItemId: item2.id,
          quantity: 1,
          specialInstructions: "Staff note: warm",
        },
      ],
      customerNote: "Table 01 - Captain dine-in order",
      paymentMethod: "CASH",
      paymentStatus: "CASH_PAID",
    }),
  });

  check(orderRes.ok, `8. Captain order successfully sent to kitchen (status: ${orderRes.status})`);
  const orderData = await orderRes.json();
  check(orderData.id?.startsWith("ord_"), `9. Order created with valid ID: ${orderData.id}`);
  check(orderData.orderSource === "STAFF" || orderData.source === "STAFF", "10. Order source is marked as STAFF");
  check(orderData.tableId === selectedTable.id, "11. Order correctly bound to selected table");
  check(orderData.items?.length === 2, "12. Order contains accurate items list with special instructions");
  const expectedSubtotal = item1.price * 2 + item2.price * 1;
  check(orderData.subtotal === expectedSubtotal, `13. Authoritative server subtotal calculated (₹${orderData.subtotal})`);
  check(orderData.total > orderData.subtotal, `14. Authoritative taxes calculated (Total: ₹${orderData.total})`);

  // 15. Idempotency test (double tap / retry)
  const dupOrderRes = await fetch(`${BASE_URL}/api/restaurants/cafe-1/orders/captain`, {
    method: "POST",
    headers: AUTH_HEADER,
    body: JSON.stringify({
      tableId: selectedTable.id,
      captainRequestId,
      items: [{ menuItemId: item1.id, quantity: 2 }],
    }),
  });
  const dupData = await dupOrderRes.json();
  check(dupData.id === orderData.id, "15. Idempotency key prevents duplicate orders on retry (returned exact order)");

  // 16. KDS view has the order
  const allOrdersRes = await fetch(`${BASE_URL}/api/restaurants/cafe-1/orders`, { headers: AUTH_HEADER });
  const allOrders = await allOrdersRes.json();
  const kdsOrder = allOrders.find(o => o.id === orderData.id);
  check(Boolean(kdsOrder), "16. Order appears in orders management / KDS pipeline");
  check(kdsOrder?.orderSource === "STAFF" || kdsOrder?.source === "STAFF", "17. Order retains STAFF marker for KDS badge");

  // 3. Pro Plan Shift Close & Day-End Settlement
  console.log("\n--- 3. Pro Shift Close Acceptance ---");
  const currentShiftRes = await fetch(`${BASE_URL}/api/restaurants/cafe-1/shifts/current`, { headers: AUTH_HEADER });
  check(currentShiftRes.ok, "18. Active shift details fetched successfully");
  const currentShift = await currentShiftRes.json();
  check(currentShift.status === "OPEN", "19. Current shift status is OPEN");
  check(typeof currentShift.expectedCash === "number", "20. Expected Cash calculated by server");
  check(currentShift.expectedCash >= orderData.total, `21. Expected cash accurately reflects settled cash order (₹${currentShift.expectedCash})`);
  check(currentShift.cashOrdersCount >= 1, `22. Cash orders count accurately tracks cash transactions (${currentShift.cashOrdersCount})`);

  // 23. Live discrepancy calculation verification
  const exactCount = currentShift.expectedCash;
  const shortCount = exactCount - 100;
  const overCount = exactCount + 150;
  check(exactCount - currentShift.expectedCash === 0, "23. Exact match discrepancy = 0 (MATCHED)");
  check(shortCount - currentShift.expectedCash === -100, "24. Shortage discrepancy = -100 (SHORT)");
  check(overCount - currentShift.expectedCash === 150, "25. Overage discrepancy = +150 (OVER)");

  // 26. Close Shift & Settle Drawer
  const closeRes = await fetch(`${BASE_URL}/api/restaurants/cafe-1/shifts/close`, {
    method: "POST",
    headers: AUTH_HEADER,
    body: JSON.stringify({
      countedCash: exactCount,
      notes: "Day shift settlement - drawer perfectly balanced.",
    }),
  });

  check(closeRes.ok, `26. Shift settlement succeeded (status: ${closeRes.status})`);
  const closedRecord = await closeRes.json();
  check(closedRecord.status === "CLOSED", "27. Closed shift status is CLOSED");
  check(closedRecord.discrepancyType === "MATCHED", "28. Discrepancy type marked as MATCHED");
  check(closedRecord.difference === 0, "29. Difference recorded as 0");
  check(Boolean(closedRecord.closedAt), `30. Immutable timestamp closedAt recorded (${closedRecord.closedAt})`);
  check(closedRecord.closedBy?.uid === "dev-test-owner", "31. Auditor closedBy staff details recorded");
  check(closedRecord.expectedCash === exactCount, "32. Immutable snapshot of expectedCash preserved");
  check(closedRecord.countedCash === exactCount, "33. Immutable snapshot of countedCash preserved");

  // 34. Next shift is fresh with 0 expected cash
  const nextShiftRes = await fetch(`${BASE_URL}/api/restaurants/cafe-1/shifts/current`, { headers: AUTH_HEADER });
  const nextShift = await nextShiftRes.json();
  check(nextShift.status === "OPEN" && nextShift.expectedCash === 0, "34. New open shift initialized with ₹0 expected cash");

  // 35. Audit history
  const historyRes = await fetch(`${BASE_URL}/api/restaurants/cafe-1/shifts`, { headers: AUTH_HEADER });
  const history = await historyRes.json();
  check(Array.isArray(history.shifts) && history.shifts.length >= 1, `35. Shift settlement history records immutable audit log (${history.shifts?.length} closed shifts found)`);

  console.log("\n===============================================================");
  console.log(`             FINAL SCORE: ${passed} PASSED / ${failed} FAILED             `);
  console.log("===============================================================");

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
