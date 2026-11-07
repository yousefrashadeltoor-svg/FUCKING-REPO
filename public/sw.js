/* DON MUSE service worker — fully local UI.
 * Strategy:
 *  • App shell (HTML pages, JS/CSS chunks, fonts, icons, logo, developer image):
 *    cache-first, populated on install + at runtime.
 *  • API GET responses (/api/home, /api/radio, /api/tv, /api/search, /api/playlists…):
 *    network-first with cache fallback → the UI renders the last known data offline.
 *  • Media streams/downloads (/api/tracks/:id/stream, /api/radio/stream, /api/tv/proxy,
 *    /download): never cached (pass-through) — these are the only things that need
 *    the internet.
 */
const VERSION = "donmuse-v3";
const SHELL = `${VERSION}-shell`;
const DATA = `${VERSION}-data`;
const PRECACHE = [
  "/",
  "/search",
  "/library",
  "/radio",
  "/tv",
  "/ai",
  "/settings",
  "/about",
  "/logo.png",
  "/logo.svg",
  "/logo-dark.png",
  "/icon-192.png",
  "/favicon.png",
  "/developer.jpg",
  "/manifest.webmanifest",
  "/offline.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u)))).then(() => self.skipWaiting()),
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
  /\/api\/tracks\/\d+\/(stream|download)/.test(url.pathname) ||
  url.pathname.startsWith("/api/radio/stream") ||
  url.pathname.startsWith("/api/tv/proxy") ||
  /\/api\/tracks\/\d+\/formats/.test(url.pathname);

const isApi = (url) => url.pathname.startsWith("/api/");
const isShellAsset = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  /\.(png|jpg|jpeg|svg|webp|ico|woff2?|ttf|css|js|webmanifest)$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // third-party (YouTube iframe, logos) untouched
  if (isMedia(url)) return; // streaming/downloads: network only

  if (isShellAsset(url)) {
    event.respondWith(cacheFirst(req, SHELL));
    return;
  }
  if (isApi(url)) {
    event.respondWith(networkFirst(req, DATA));
    return;
  }
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(navigate(req));
  }
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return hit ?? Response.error();
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req);
    if (hit) return hit;
    return new Response(JSON.stringify({ offline: true, error: "offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function navigate(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const url = new URL(req.url);
    return (
      (await cache.match(req)) ||
      (await cache.match(url.pathname)) ||
      (await cache.match("/")) ||
      (await cache.match("/offline.html")) ||
      Response.error()
    );
  }
}

self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});
