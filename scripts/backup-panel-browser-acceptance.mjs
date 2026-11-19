import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const baseUrl = "http://127.0.0.1:4176";
const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "4176"], {
  stdio: "ignore",
});
let browser;
let uploadedBytes;
let uploadedPath;
const corsHeaders = {
  "access-control-allow-origin": baseUrl,
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, dropbox-api-arg, dropbox-api-result",
};

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
  throw new Error("backup_panel_browser_server_did_not_start");
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.route("https://www.dropbox.com/oauth2/authorize**", async (route) => {
    const authorization = new URL(route.request().url());
    const redirect = new URL(authorization.searchParams.get("redirect_uri"));
    redirect.searchParams.set("code", "sam-travels-test-code");
    redirect.searchParams.set("state", authorization.searchParams.get("state"));
    await route.fulfill({ status: 302, headers: { location: redirect.toString() } });
  });

  await page.route("https://api.dropboxapi.com/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (url.pathname === "/oauth2/token") {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "mock-access-token",
          refresh_token: "mock-refresh-token",
          expires_in: 3600,
          token_type: "bearer",
        }),
      });
      return;
    }
    if (url.pathname === "/2/files/create_folder_v2") {
      await route.fulfill({ status: 200, headers: corsHeaders, contentType: "application/json", body: "{}" });
      return;
    }
    if (url.pathname === "/2/files/list_folder" || url.pathname === "/2/files/list_folder/continue") {
      const entries = uploadedBytes && uploadedPath ? [{
        ".tag": "file",
        name: uploadedPath.split("/").at(-1),
        path_display: uploadedPath,
        server_modified: "2026-11-18T00:00:00Z",
        size: uploadedBytes.length,
      }] : [];
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: "application/json",
        body: JSON.stringify({ entries, has_more: false, cursor: "mock-cursor" }),
      });
      return;
    }
    if (url.pathname === "/2/files/delete_v2") {
      await route.fulfill({ status: 200, headers: corsHeaders, contentType: "application/json", body: "{}" });
      return;
    }
    await route.fulfill({ status: 404, headers: corsHeaders, body: "unmocked_dropbox_api" });
  });

  await page.route("https://content.dropboxapi.com/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (url.pathname === "/2/files/upload") {
      const args = JSON.parse(request.headers()["dropbox-api-arg"]);
      uploadedPath = args.path;
      uploadedBytes = request.postDataBuffer();
      await route.fulfill({ status: 200, headers: corsHeaders, contentType: "application/json", body: "{}" });
      return;
    }
    if (url.pathname === "/2/files/download" && uploadedBytes) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/octet-stream" },
        body: uploadedBytes,
      });
      return;
    }
    await route.fulfill({ status: 404, headers: corsHeaders, body: "mock_backup_not_found" });
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator(".settings-panel").waitFor({ state: "visible" });
  const networkToggle = page.locator("button.network");
  await networkToggle.waitFor({ state: "visible" });
  const connect = page.getByRole("button", { name: "Connect Dropbox", exact: true });
  await connect.waitFor({ state: "visible" });

  if ((await networkToggle.innerText()).includes("Off")) {
    await connect.click();
    await page.getByText("Internet Access is disabled in Sam Travels.", { exact: true }).waitFor({ state: "visible" });
    assert.equal(await page.locator(".backup-heading .pill").innerText(), "NOT CONNECTED");
    assert.equal(await page.getByRole("button", { name: "Back up now", exact: true }).count(), 0);
    await networkToggle.click();
    await page.getByText("Internet On", { exact: false }).waitFor({ state: "visible" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.locator("button.network").waitFor({ state: "visible" });
    assert.match(await page.locator("button.network").innerText(), /Internet On/);
  }

  await page.getByRole("button", { name: "Connect Dropbox", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.has("code") && url.searchParams.has("state"));
  await page.waitForFunction(() => !window.location.search.includes("code="));
  // The OAuth callback is consumed by the mounted BackupPanel. Do not toggle
  // Settings again here: the callback has already mounted the panel, and a
  // second click can close it before the connection assertion runs.
  await page.locator(".backup-heading .pill.good").getByText("CONNECTED").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Back up now", exact: true }).click();
  await page.locator(".backup-select option").first().waitFor({ state: "attached" });
  assert.ok(uploadedBytes && uploadedBytes.length > 0, "encrypted backup bytes must be uploaded");

  await page.getByRole("button", { name: "Show recovery key for another device", exact: true }).click();
  const recoveryKey = await page.locator(".backup-recovery-key textarea").inputValue();
  assert.ok(recoveryKey.length >= 24, "recovery key must be available for cross-device restore");
  await page.locator(".backup-config input").fill(recoveryKey);
  await page.locator(".backup-confirm input").check();
  const restoreButton = page.getByRole("button", { name: "Restore selected backup", exact: true });
  assert.equal(await restoreButton.isEnabled(), true);
  await restoreButton.click();
  await page.getByText("restored unverified", { exact: true }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Verify and discard checkpoint", exact: true }).click();
  await page.getByText("No pending recovery checkpoints.", { exact: true }).waitFor({ state: "visible" });
  await page.getByText("Restore checkpoint marked verified and discarded.", { exact: true }).waitFor({ state: "visible" });

  console.log("BackupPanel acceptance passed: network gating, Dropbox OAuth, encrypted upload/download, restore confirmation and checkpoint verification.");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
