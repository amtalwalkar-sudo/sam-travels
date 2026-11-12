import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const handlers = new Map();
const stores = new Map();
let networkCalls = 0;
let offline = false;
let claimed = false;

function makeCache(name) {
  if (!stores.has(name)) stores.set(name, new Map());
  const entries = stores.get(name);
  return {
    async addAll(paths) { for (const path of paths) entries.set(path, { path, source: "install" }); },
    async match(request) { return entries.get(typeof request === "string" ? request : new URL(request.url).pathname); },
    async put(request, response) { entries.set(new URL(request.url).pathname, response); },
  };
}
const caches = {
  async open(name) { return makeCache(name); },
  async keys() { return [...stores.keys()]; },
  async delete(name) { return stores.delete(name); },
};
const self = {
  location: { origin: "https://sam-travels.test" },
  clients: { async claim() { claimed = true; } },
  addEventListener(name, callback) { handlers.set(name, callback); },
};
const fetch = async request => {
  networkCalls += 1;
  if (offline) throw new Error("network_unavailable");
  return { ok: true, type: "basic", url: request.url, clone() { return this; } };
};
runInNewContext(source, { self, caches, fetch, URL, Promise, Set, Number, Math });

async function dispatch(name, event) {
  handlers.get(name)(event);
  if (event.pending) await event.pending;
}
await dispatch("install", { waitUntil(promise) { this.pending = promise; } });
assert.ok(stores.has("sam-travels-shell-2"), "install creates the versioned shell cache");
assert.ok(stores.get("sam-travels-shell-2").has("/"), "install precaches the app shell");

for (const name of ["sam-travels-shell-1", "sam-travels-shell-3"]) stores.set(name, new Map());
await dispatch("activate", { waitUntil(promise) { this.pending = promise; } });
assert.deepEqual([...stores.keys()].sort(), ["sam-travels-shell-2", "sam-travels-shell-3"]);
assert.equal(claimed, true, "activation claims clients after retaining a rollback cache");

let responded = false;
handlers.get("fetch")({
  request: { url: "https://sam-travels.test/api/business-records", method: "GET", mode: "cors" },
  respondWith() { responded = true; },
});
assert.equal(responded, false, "business/API responses are never intercepted or cached");

const assetRequest = { url: "https://sam-travels.test/assets/app-hash.js", method: "GET", mode: "no-cors" };
let assetResponse;
handlers.get("fetch")({ request: assetRequest, respondWith(promise) { assetResponse = promise; } });
await assetResponse;
assert.equal(networkCalls, 1, "approved versioned shell assets may be fetched");
assert.ok(stores.get("sam-travels-shell-2").has("/assets/app-hash.js"), "approved shell assets are cached");

handlers.get("fetch")({ request: assetRequest, respondWith(promise) { assetResponse = promise; } });
await assetResponse;
assert.equal(networkCalls, 1, "cached shell assets are served without another network request");

offline = true;
let offlineNavigation;
handlers.get("fetch")({
  request: { url: "https://sam-travels.test/maintenance/offline-check", method: "GET", mode: "navigate" },
  respondWith(promise) { offlineNavigation = promise; },
});
const fallback = await offlineNavigation;
assert.equal(fallback.path, "/", "offline deep-link navigation falls back to the cached app shell");
assert.equal(fallback.source, "install", "offline fallback is the precached shell, not business data");
console.log("PASS: PWA service worker caches only approved shell assets, excludes business/API data, retains rollback cache, and falls back to the app shell for offline navigation.");
