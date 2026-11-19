import { chromium } from "playwright";
import { spawn } from "node:child_process";

const baseUrl = "http://127.0.0.1:4173";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"], {
  detached: true, stdio: "ignore",
});
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { const response = await fetch(baseUrl); if (response.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error("vite_server_not_ready");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByText("Local workspace ready", { exact: true }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await page.getByRole("heading", { name: "Admin", exact: true }).waitFor();

  const sections = [
    { id: "business-setup", label: "Business setup", marker: "Business-wide settings are owned by Business Settings" },
    { id: "vehicle", label: "Vehicle", marker: "Vehicle owns canonical registration identity and lifecycle" },
    { id: "driver", label: "Driver", marker: "Configure one active Driver with the single active Vehicle" },
    { id: "compliance", label: "Compliance", marker: "Expiry warning is 15 calendar days" },
    { id: "finance", label: "Finance", marker: "Platform Fees" },
    { id: "maintenance", label: "Maintenance", marker: "Record actual service visits and itemised costs" },
  ];
  for (const section of sections) {
    const trigger = page.getByRole("button", { name: section.label, exact: true });
    await trigger.click();
    if (await trigger.getAttribute("aria-expanded") !== "true") throw new Error(section.label + "_section_did_not_expand");
    const panel = page.locator("#admin-section-panel-" + section.id);
    await panel.waitFor({ state: "visible" });
    await panel.getByText(section.marker, { exact: false }).waitFor({ state: "visible", timeout: 10000 });
    const expandedCount = await page.locator('[aria-expanded="true"]').count();
    if (expandedCount !== 1) throw new Error("admin_shell_single_expanded_section_contract_failed");
    console.log("Admin section rendered:", section.label);
  }

  const identity = page.getByRole("region", { name: "People and roles" });
  await identity.getByLabel("Person name").waitFor({ state: "visible" });
  console.log("Admin identity panel rendered outside section navigation.");
} finally {
  if (browser) await browser.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch {}
}
