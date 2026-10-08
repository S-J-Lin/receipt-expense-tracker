// Shell-only service worker. Private pages, RSC payloads, exports, backups,
// Server Actions and Supabase/Auth responses are never cached.
const CACHE = "receipt-tracker-shell-v3";
const SHELL = ["/offline", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/icons/apple-touch-icon.png"];
const STATIC_LIMIT = 120;

self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));

async function trim(cache) {
  const keys = await cache.keys();
  const statics = keys.filter((request) => new URL(request.url).pathname.startsWith("/_next/static/"));
  // Oldest entries first; keep the cache bounded across deployments.
  await Promise.all(statics.slice(0, Math.max(0, statics.length - STATIC_LIMIT)).map((request) => cache.delete(request)));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/export/download") || url.pathname.startsWith("/import/backup")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline")));
    return;
  }
  // Immutable build assets and icons only. Only successful, same-origin, basic responses are stored.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy).then(() => trim(cache))));
      }
      return response;
    })));
  }
});
