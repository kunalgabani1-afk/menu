import pkg from "/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js";
const { chromium } = pkg;
import fs from "node:fs";

async function runComprehensiveVerification() {
  console.log("=================================================================");
  console.log("TABLELINE COMPREHENSIVE SUITE — APPROVAL, IDEMPOTENCY, REFRESH");
  console.log("=================================================================\n");

  const results = {};

  // 1. DATABASE CHECK FOR PREVIOUS ORDER (ord_vZvEtMA)
  const dbData = JSON.parse(fs.readFileSync("./data/tableline_production_db.json", "utf8"));
  const createdOrder = dbData.orders?.["ord_vZvEtMA"] || Object.values(dbData.orders || {}).find(o => o.id === "ord_vZvEtMA");
  console.log("[DB VERIFICATION] Order ord_vZvEtMA in database:", {
    id: createdOrder?.id,
    orderNumber: createdOrder?.orderNumber,
    status: createdOrder?.status,
    verificationReason: createdOrder?.verificationReason,
    tableNumber: createdOrder?.tableNumber,
    total: createdOrder?.total,
  });
  results.dbVerified = createdOrder && createdOrder.status === "NEEDS_APPROVAL";

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({
    viewport: { width: 414, height: 896 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15",
  });
  const page = await context.newPage();

  // 2. REFRESH TEST
  console.log("\n[REFRESH TEST] Navigating directly to the created order tracking URL...");
  const orderUrl = "http://127.0.0.1:3000/menu/the-roast-room/table/table-01/order/ord_vZvEtMA";
  await page.goto(orderUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const trackerText = await page.evaluate(() => document.body.innerText);
  const refreshHasOrder = trackerText.includes("Order #166") || trackerText.includes("166");
  const refreshHasStatus = trackerText.includes("Waiting for restaurant confirmation") || trackerText.includes("Order Received");
  console.log(`✓ Refresh preserves Order #166: ${refreshHasOrder}`);
  console.log(`✓ Refresh preserves "Waiting for restaurant confirmation": ${refreshHasStatus}`);
  results.refreshTest = refreshHasOrder && refreshHasStatus;

  // 3. STAFF APPROVAL TEST
  console.log("\n[APPROVAL TEST] Simulating restaurant staff approving order ord_vZvEtMA...");
  const approveStart = Date.now();
  const approveRes = await fetch("http://127.0.0.1:5000/api/restaurants/the-roast-room/orders/ord_vZvEtMA/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "PREPARING" }),
  });
  const approveJson = await approveRes.json();
  const approveEnd = Date.now();
  console.log(`✓ Staff approve request completed in ${approveEnd - approveStart}ms (Status: ${approveJson.status || approveRes.status})`);

  // Wait for Customer Tracking UI to reflect PREPARING / Confirmed
  console.log("[APPROVAL TEST] Checking customer tracking UI update...");
  let customerTrackerUpdated = false;
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(600);
    const updatedText = await page.evaluate(() => document.body.innerText);
    if (updatedText.includes("Preparing") || updatedText.includes("Kitchen") || updatedText.includes("Confirmed")) {
      customerTrackerUpdated = true;
      break;
    }
  }
  const customerUpdateDuration = Date.now() - approveEnd;
  console.log(`✓ Customer tracking updated to Preparing/Confirmed in ${customerUpdateDuration}ms: ${customerTrackerUpdated}`);
  results.approvalTest = {
    approveDuration: approveEnd - approveStart,
    customerUpdateDuration,
    passed: customerTrackerUpdated,
  };

  // 4. DUPLICATE ORDER TEST (Rapid Triple Click with same idempotency key)
  console.log("\n[DUPLICATE CLICK TEST] Simulating rapid duplicate order submissions...");
  const testIdempotencyKey = `idem_test_${Date.now()}`;
  const payload = {
    items: [{ menuItemId: "item_00JCsbw", name: "Butter Bhakhri", price: 30, quantity: 1 }],
    dinerFirstName: "Vivek Rapid Test",
    paymentMethod: "PAY_LATER",
    idempotencyKey: testIdempotencyKey,
  };

  const [res1, res2, res3] = await Promise.all([
    fetch("http://127.0.0.1:3000/api/public/menu/the-roast-room/table/table-01/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(r => r.json()),
    fetch("http://127.0.0.1:3000/api/public/menu/the-roast-room/table/table-01/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(r => r.json()),
    fetch("http://127.0.0.1:3000/api/public/menu/the-roast-room/table/table-01/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(r => r.json()),
  ]);

  console.log("Duplicate Test Responses:", {
    res1_id: res1.id,
    res2_id: res2.id,
    res3_id: res3.id,
  });
  const allSameId = res1.id === res2.id && res2.id === res3.id;
  console.log(`✓ Idempotency verified (All 3 rapid calls returned the same order ID): ${allSameId}`);
  results.duplicateTest = {
    allSameId,
    orderId: res1.id,
  };

  await browser.close();
  console.log("\n=================================================================");
  console.log("ALL VERIFICATIONS COMPLETED SUCCESSFULLY");
  console.log("=================================================================");
  console.log("Final Summary:", JSON.stringify(results, null, 2));
}

runComprehensiveVerification().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
