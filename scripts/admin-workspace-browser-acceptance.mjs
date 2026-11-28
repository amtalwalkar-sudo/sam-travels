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
    { id: "driver", label: "Driver", marker: "Configure one active Driver with the single active Vehicle", extraMarker: "Correct submitted fare, toll and parking values" },
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
    if (section.extraMarker) await panel.getByText(section.extraMarker, { exact: false }).waitFor({ state: "visible", timeout: 10000 });
    const expandedCount = await page.locator('[aria-expanded="true"]').count();
    if (expandedCount !== 1) throw new Error("admin_shell_single_expanded_section_contract_failed");
    console.log("Admin section rendered:", section.label);
  }

  const identity = page.getByRole("region", { name: "People and roles" });
  await identity.getByLabel("Person name").waitFor({ state: "visible" });
  console.log("Admin identity panel rendered outside section navigation.");

  // Revisit every Admin section at a narrow Android-sized viewport and verify
  // page-level fit, label association and keyboard focusability of visible fields.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const section of sections) {
    await page.getByRole("button", { name: section.label, exact: true }).click();
    const panel = page.locator("#admin-section-panel-" + section.id);
    await panel.waitFor({ state: "visible" });
    const audit = await page.evaluate(() => {
      const controls = [...document.querySelectorAll("input:not([type=hidden]), select, textarea")]
        .filter(element => element.getClientRects().length > 0 && !element.disabled);
      const unlabelled = controls.filter(element =>
        !(element.labels?.length) && !element.getAttribute("aria-label") && !element.getAttribute("aria-labelledby")
      ).map(element => element.outerHTML.slice(0, 160));
      const first = controls[0];
      first?.focus();
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        unlabelled,
        firstControlFocusable: !first || document.activeElement === first,
      };
    });
    if (audit.documentWidth > audit.viewportWidth + 1) {
      throw new Error(section.label + "_mobile_horizontal_overflow: " + JSON.stringify(audit));
    }
    if (audit.unlabelled.length) {
      throw new Error(section.label + "_unlabelled_form_controls: " + JSON.stringify(audit.unlabelled));
    }
    if (!audit.firstControlFocusable) throw new Error(section.label + "_keyboard_focus_failed");
  }
  console.log("Admin form conformance passed at 390px: no page overflow, all visible controls labelled and keyboard-focusable.");
} finally {
  if (browser) await browser.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch {}
}
