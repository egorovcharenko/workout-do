const CACHE_PREFIX = "personal-suite-workouts-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const PRECACHE = ["/offline.html", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || request.headers.has("authorization")) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/__/") || url.pathname.includes("auth")) return;
  if (request.mode === "navigate") return event.respondWith(networkFirst(request));
  if (url.pathname.startsWith("/_next/static/") || ["image", "style", "script", "font"].includes(request.destination)) event.respondWith(cacheFirst(request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    const cacheControl = response.headers.get("cache-control") || "";
    if (response.ok && response.type === "basic" && !cacheControl.includes("no-store")) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || (await caches.match("/offline.html"));
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}
