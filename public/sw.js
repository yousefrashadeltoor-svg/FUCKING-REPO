/* DON MUSE — service worker
 *
 * Strategy (optimised for instant starts and offline resilience):
 *   • Navigations  → network-first, fall back to the cached shell, then to
 *                    /offline.html. This is what makes the app open instantly
 *                    from the home screen and still work with no signal.
 *   • Static build artefacts (/_next/static, fonts, images, css, js, svg)
 *                    → cache-first, immutable (hashed filenames).
 *   • API GETs     → stale-while-revalidate with a short TTL: the UI paints
 *                    immediately from cache and refreshes in the background.
 *   • Media        → never cached. Streams must go straight to the network so
 *                    seeking/Range requests stay correct.
 *   • Writes (POST/PATCH/DELETE) → network only, queued notification on failure.
 */
const VERSION = "donmuse-v4";
const SHELL = `${VERSION}-shell`;
const DATA = `${VERSION}-data`;
const STATIC = `${VERSION}-static`;

const PRECACHE = [
  "/",
  "/search",
  "/library",
  "/my-music",
  "/following",
  "/radio",
  "/tv",
  "/quran",
  "/downloads",
  "/settings",
  "/offline.html",
  "/logo.svg",
  "/logo-dark.svg",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(new Request(u, { cache: "reload" })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isMedia = (url) =>
  /^\/api\/(quran\/(stream|download)|tracks\/[^/]+\/stream|radio\/(stream|proxy)|tv\/proxy)/.test(url.pathname) ||
  /^\/api\/tracks\/[^/]+\/(formats|download)/.test(url.pathname);

const isApi = (url) => url.pathname.startsWith("/api/");
const isStatic = (url) =>
  url.pathname.startsWith("/_next/static/") || /\.(png|jpg|jpeg|svg|webp|avif|ico|woff2?|ttf|css|webmanifest)$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // writes go straight to the network

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let cross-origin (CDNs, streams) pass
  if (isMedia(url)) return; // never intercept media

  /* ------------------------------ navigations ----------------------------- */
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(SHELL);
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          return (
            (await caches.match(req)) ||
            (await caches.match("/")) ||
            (await caches.match("/offline.html")) ||
            new Response("<h1>Offline</h1>", { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 200 })
          );
        }
      })(),
    );
    return;
  }

  /* --------------------------------- API ---------------------------------- */
  if (isApi(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(DATA);
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone()).catch(() => {});
            return res;
          })
          .catch(() => null);
        if (cached) {
          // stale-while-revalidate
          network.catch(() => {});
          return cached;
        }
        const res = await network;
        return (
          res ||
          new Response(JSON.stringify({ offline: true, error: "Network unavailable" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          })
        );
      })(),
    );
    return;
  }

  /* -------------------------------- static -------------------------------- */
  if (isStatic(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC);
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone()).catch(() => {});
          return res;
        } catch {
          return hit || Response.error();
        }
      })(),
    );
  }
});

/* --------------------------- background sync ---------------------------- */
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
  if (event.data === "clear-cache") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});
