/* Flock Keeper app-shell service worker.
   Scope: static assets + visited pages only. It never touches API/auth/data
   requests, so the app's offline outbox (offline-queue.ts) stays in charge
   of data sync. */

const VERSION = "v1";
const SHELL_CACHE = `flockkeeper-shell-${VERSION}`;
const ASSET_CACHE = `flockkeeper-assets-${VERSION}`;
const KEEP = [SHELL_CACHE, ASSET_CACHE];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) =>
        c.addAll([
          "/manifest.webmanifest",
          "/icon-192.png",
          "/icon-512.png",
          "/icon-maskable-512.png",
        ]).catch(() => undefined),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isCacheableAsset(url) {
  return (
    url.origin === self.location.origin &&
    (/\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|ico|json|webmanifest)$/.test(url.pathname) ||
      url.pathname.startsWith("/_build/") ||
      url.pathname.startsWith("/assets/"))
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never intercept data / auth / server-function traffic — the app's own
  // offline queue handles those.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_serverFn")) return;

  // Navigations: network first, fall back to a cached copy of the page.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match("/")) || Response.error()),
    );
    return;
  }

  // Static assets: cache first.
  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(ASSET_CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
            return res;
          }),
      ),
    );
  }
});
