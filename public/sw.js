/* Offline application shell only. Never cache remote streams, API responses,
 * credentials or private media. Download/device caches have separate owners. */
const VERSION = "donmuse-local-v5";
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const BASE = new URL("./", self.location.href);
const asset = (path) => new URL(path, BASE).href;
const OWNED = [SHELL, STATIC, "donmuse-downloads-v1", "donmuse-media-files-v1", "donmuse-clips-v1"];
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await cache.addAll([asset(""), asset("index.html"), asset("logo.svg"), asset("favicon.svg"), asset("manifest.webmanifest"), asset("offline.html")]);
    const html = await (await cache.match(asset("index.html"))).text();
    const urls = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m => m[1]).filter(p => /\/assets\/.*\.(js|css)$/.test(p));
    await Promise.allSettled(urls.map(p => cache.add(new URL(p, BASE))));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => { const keys = await caches.keys(); await Promise.all(keys.filter(k => (k.startsWith("donmuse-") && !OWNED.includes(k))).map(k => caches.delete(k))); await self.clients.claim(); })());
});
self.addEventListener("fetch", (event) => {
  const req = event.request; const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== BASE.origin || url.pathname.includes("/__donmuse_") || url.pathname.endsWith("/native-bootstrap.js")) return;
  if (req.headers.has("range") || /\.(mp3|m4a|opus|ogg|flac|wav|mp4|webm|m3u8|ts)(?:$|\?)/i.test(url.href)) return;
  if (req.mode === "navigate") {
    event.respondWith((async () => { try { const res = await fetch(req); if (res.ok) await (await caches.open(SHELL)).put(asset("index.html"), res.clone()); return res; } catch { return await caches.match(asset("index.html")) || await caches.match(asset("offline.html")) || Response.error(); } })());
  } else if (url.pathname.includes("/assets/") || /\.(svg|png|jpe?g|webp|css|js|woff2?|webmanifest)$/.test(url.pathname)) {
    event.respondWith((async () => { const cache = await caches.open(STATIC); const hit = await cache.match(req); if (hit) return hit; const res = await fetch(req); if (res.ok) await cache.put(req,res.clone()); return res; })());
  }
});
