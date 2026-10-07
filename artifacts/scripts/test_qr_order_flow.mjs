import pkg from "/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js";
const { chromium } = pkg;

async function runQrForensicTest() {
  console.log("=================================================================");
  console.log("TABLELINE FORENSIC QR FLOW TEST — BROWSER AUTOMATION");
  console.log("=================================================================\n");

  const timeline = {};
  const networkLogs = [];
  const consoleLogs = [];

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({
    viewport: { width: 414, height: 896 }, // Mobile viewport (iPhone XR/11)
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1",
  });

  const page = await context.newPage();

  page.on("console", (msg) => {
    const text = msg.text();
    consoleLogs.push({ time: Date.now(), type: msg.type(), text });
    if (text.includes("[ORDER_FLOW]")) {
      console.log(`[BROWSER_CONSOLE] ${text}`);
    }
  });

  page.on("pageerror", (err) => {
    console.error(`[PAGE_ERROR] ${err.message}`);
  });

  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/api/")) {
      networkLogs.push({
        id: Math.random().toString(36).slice(2, 7),
        url,
        method: req.method(),
        postData: req.postData(),
        startTime: Date.now(),
      });
    }
  });

  page.on("response", async (res) => {
    const url = res.url();
    if (url.includes("/api/")) {
      const entry = networkLogs.slice().reverse().find((n) => n.url === url && !n.endTime);
      if (entry) {
        entry.endTime = Date.now();
        entry.status = res.status();
        entry.duration = entry.endTime - entry.startTime;
        try {
          entry.body = await res.json();
        } catch {
          // ignore non-json
        }
      }
    }
  });

  const targetQrUrl = "http://127.0.0.1:3000/menu/the-roast-room/table/table-01";
  console.log(`[PHASE 1] Navigating to Real Customer QR Menu: ${targetQrUrl}`);
  timeline.qrMenuLoadStart = Date.now();

  await page.goto(targetQrUrl, { waitUntil: "networkidle" });
  timeline.qrMenuLoaded = Date.now();
  console.log(`✓ QR Menu Loaded in ${timeline.qrMenuLoaded - timeline.qrMenuLoadStart}ms`);

  // Wait for menu items to appear
  await page.waitForSelector("button:has-text('Add'), button:has-text('+')", { timeout: 10000 });
  console.log("✓ Menu items rendered successfully");

  // Select an item to add
  console.log("\n[PHASE 2] Adding item to table cart...");
  timeline.addItemStart = Date.now();
  const addButtons = await page.$$("button:has-text('Add'), button:has-text('+')");
  if (addButtons.length === 0) {
    throw new Error("No Add buttons found on menu!");
  }
  await addButtons[0].click();

  // If item opened modifier modal, confirm it
  const modifierConfirmBtn = await page.$("#button-modifier-confirm-add");
  if (modifierConfirmBtn) {
    console.log("✓ Item has customizations, confirming in modifier sheet...");
    await modifierConfirmBtn.click();
    await page.waitForSelector("#item-modifier-sheet", { state: "hidden", timeout: 4000 }).catch(() => {});
  }

  timeline.addItemDone = Date.now();
  console.log(`✓ Item added in ${timeline.addItemDone - timeline.addItemStart}ms`);

  // Wait for floating cart button / bottom pill
  console.log("\n[PHASE 3] Opening Cart Sheet...");
  timeline.openCartStart = Date.now();
  const cartTrigger = await page.waitForSelector(
    "button:has-text('View Order'), button:has-text('Cart'), button:has-text('item'), #floating-cart-pill",
    { timeout: 8000 }
  );
  await cartTrigger.click();

  // Wait for Cart Modal to be visible
  await page.waitForSelector("#button-cart-confirm-order, button:has-text('Confirm Order')", { timeout: 8000 });
  timeline.openCartDone = Date.now();
  console.log(`✓ Cart opened in ${timeline.openCartDone - timeline.openCartStart}ms`);

  // Check diner first name input
  const nameInput = await page.$("#customer-first-name-input");
  if (nameInput) {
    const val = await nameInput.inputValue();
    if (!val || val.trim().length === 0) {
      await nameInput.fill("Vivek");
      console.log("✓ Entered diner name: Vivek");
    } else {
      console.log(`✓ Existing diner name found: "${val}"`);
    }
  }

  // -------------------------------------------------------------
  // FORENSIC TIMELINE: CONFIRM ORDER CLICK
  // -------------------------------------------------------------
  console.log("\n[PHASE 4] FORENSIC TIMELINE: Clicking Confirm Order...");
  const confirmButton = await page.waitForSelector("#button-cart-confirm-order, button:has-text('Confirm Order')");

  timeline.T0_click = Date.now();
  console.log(`[TIMELINE] T0 = Customer clicks Confirm Order at ${timeline.T0_click}`);

  await confirmButton.click();

  // Wait for button to change to "Confirming Order..."
  await page.waitForFunction(() => {
    const btn = document.querySelector("#button-cart-confirm-order");
    return btn && btn.textContent.includes("Confirming Order");
  }, { timeout: 2000 }).catch(() => {});
  timeline.T_confirming_visible = Date.now();
  console.log(`[TIMELINE] UI showing "Confirming Order..." in ${timeline.T_confirming_visible - timeline.T0_click}ms`);

  // Wait for customer to leave "Confirming Order..." state:
  // Either cart modal closes, OR URL changes to /order/ord_..., OR tracker shows "Waiting for restaurant confirmation"
  console.log("[TIMELINE] Waiting for customer to leave 'Confirming Order...' state...");

  await page.waitForFunction(() => {
    const path = window.location.pathname;
    const hasOrderInUrl = path.includes("/order/") || path.includes("/orders");
    const trackerText = document.body.innerText.includes("Waiting for restaurant confirmation") ||
                        document.body.innerText.includes("Order Received") ||
                        document.body.innerText.includes("Order #");
    const cartModalOpen = Boolean(document.querySelector("#customer-cart-modal") || document.querySelector("#button-cart-confirm-order"));
    return hasOrderInUrl || trackerText || !cartModalOpen;
  }, { timeout: 15000 });

  timeline.T_left_confirming = Date.now();
  console.log(`✓ Customer left "Confirming Order..." state at T = ${timeline.T_left_confirming}`);
  console.log(`REAL CUSTOMER CONFIRMATION LATENCY: ${timeline.T_left_confirming - timeline.T0_click}ms\n`);

  // Wait for order status tracker view
  await page.waitForTimeout(1000);
  const currentUrl = page.url();
  console.log(`Current page URL after confirmation: ${currentUrl}`);

  // Find Order Details on page
  const pageText = await page.evaluate(() => document.body.innerText);
  const orderNumMatch = pageText.match(/Order\s*#?(\d+)/i);
  const orderNumber = orderNumMatch ? orderNumMatch[1] : "detected";
  console.log(`✓ Customer sees: Order #${orderNumber}`);
  const hasConfirmationText = pageText.includes("Waiting for restaurant confirmation") || pageText.includes("Order Received");
  console.log(`✓ Status text visible: "Waiting for restaurant confirmation": ${hasConfirmationText}`);

  // Network audit
  console.log("\n[PHASE 5] BROWSER NETWORK AUDIT");
  const orderReq = networkLogs.find((n) => n.url.includes("/orders") && n.method === "POST");
  if (orderReq) {
    console.log(`Request URL: ${orderReq.url}`);
    console.log(`Method: ${orderReq.method}`);
    console.log(`HTTP Status: ${orderReq.status}`);
    console.log(`Request Duration: ${orderReq.duration}ms`);
    console.log(`Order ID created: ${orderReq.body?.id}`);
    console.log(`Order Status in response: ${orderReq.body?.status}`);
    console.log(`Verification Reason: ${orderReq.body?.verificationReason}`);
  } else {
    console.warn("⚠️ No POST /orders request captured in network logs!");
  }

  await browser.close();
  console.log("\n=================================================================");
  console.log("FORENSIC TEST COMPLETE");
  console.log("=================================================================");
  return { timeline, orderReq, orderNumber, hasConfirmationText };
}

runQrForensicTest()
  .then((res) => {
    console.log("Result summary:", JSON.stringify(res, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("Test failed with error:", err);
    process.exit(1);
  });
