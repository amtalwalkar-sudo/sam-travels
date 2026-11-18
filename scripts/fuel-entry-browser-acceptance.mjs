import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const baseUrl = "http://127.0.0.1:4175";
const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "4175"], {
  stdio: "ignore",
});
let browser;

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("fuel_entry_browser_server_did_not_start");
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  // Fuel Entry is available without starting a shift. The app is a fresh
  // browser profile, so no vehicle or active Work session is required to
  // prove that an incomplete draft is durably saved and visibly resumed.
  const toggle = page.locator(".fuel-entry-toggle");
  await toggle.waitFor({ state: "visible" });
  await toggle.click();

  const panel = page.locator(".fuel-entry-panel");
  await panel.getByRole("heading", { name: "Fuel Entry", exact: true }).waitFor({ state: "visible" });
  await panel.getByLabel("Price per kg (₹)").fill("82.50");
  await panel.getByLabel("Amount paid (₹)").fill("825");
  await panel.getByLabel("Partial refill").check();

  await page.waitForFunction(async () => {
    const request = indexedDB.open("sam-travels-browser");
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const read = db.transaction("records", "readonly").objectStore("records").getAll();
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
    });
    db.close();
    return rows.some((row) =>
      typeof row.id === "string" &&
      row.id.startsWith("__sam_travels_form_working_copy__:work.fuel-entry:") &&
      row.data?.values?.priceRupeesPerKg === 82.5 &&
      row.data?.values?.amountRupees === 825 &&
      row.data?.values?.partialRefill === true
    );
  });

  await toggle.click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".fuel-entry-toggle").waitFor({ state: "visible" });
  await page.locator(".fuel-entry-toggle").click();

  const resumed = page.locator(".fuel-entry-panel");
  await resumed.getByRole("heading", { name: "Fuel Entry", exact: true }).waitFor({ state: "visible" });
  assert.equal(await resumed.getByLabel("Price per kg (₹)").inputValue(), "82.5");
  assert.equal(await resumed.getByLabel("Amount paid (₹)").inputValue(), "825");
  assert.equal(await resumed.getByLabel("Partial refill").isChecked(), true);

  console.log("Fuel Entry draft acceptance passed: incomplete values were visibly restored after browser reload without an active shift.");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
