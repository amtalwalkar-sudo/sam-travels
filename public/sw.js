const CACHE_PREFIX = "sam-travels-shell-";
const CACHE = `${CACHE_PREFIX}2`;
const CORE = ["/", "/manifest.webmanifest", "/icon.svg"];

function isShellAsset(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== "GET") return false;
  if (request.mode === "navigate" || CORE.includes(url.pathname)) return true;
  return url.pathname.startsWith("/assets/") &&
    /\.(?:js|mjs|css|woff2?|ttf|svg|png|webp|ico)$/i.test(url.pathname);
}

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const versions = (await caches.keys())
      .filter(name => name.startsWith(CACHE_PREFIX))
      .map(name => ({ name, version: Number(name.slice(CACHE_PREFIX.length)) }))
      .filter(item => Number.isSafeInteger(item.version))
      .sort((a, b) => b.version - a.version);
    const retained = new Set(versions.slice(0, 2).map(item => item.name));
    await Promise.all(versions.filter(item => !retained.has(item.name)).map(item => caches.delete(item.name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  if (!isShellAsset(event.request)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response.ok && response.type === "basic") await cache.put(event.request, response.clone());
      return response;
    } catch (error) {
      const fallback = await cache.match(event.request) ||
        (event.request.mode === "navigate" ? await cache.match("/") : undefined);
      if (fallback) return fallback;
      throw error;
    }
  })());
});
