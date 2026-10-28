const CACHE = "redlady-shell-v1";

function shouldCache(url, method) {
  if (method !== "GET") return false;
  const path = new URL(url).pathname;
  if (path.startsWith("/api/")) return false;
  if (path.startsWith("/photos") || path.includes("/photos/")) return false;
  return path.startsWith("/_next/static/") || path === "/offline" || path === "/sw.js" || path.startsWith("/icons/");
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["/offline", "/sw.js"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline")));
    return;
  }
  if (!shouldCache(request.url, request.method)) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const fetched = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || fetched;
    }),
  );
});
