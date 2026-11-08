#!/usr/bin/env node
// ============================================================================
//  DON MUSE — offline UI bundler (for the Android APK)
//  ---------------------------------------------------------------------------
//  The APK ships the *same* UI the website serves. The only thing it cannot
//  ship is the Node server, so this script bakes the server's answers into the
//  bundle instead of shipping the server:
//
//    1. build the Next app and start it locally
//    2. capture every route's HTML (real server render, real data)
//    3. walk those pages and snapshot every image / logo / manifest reference
//    4. capture a whitelist of read-only API responses (`/api/home`, radio, tv,
//       quran, stats, …) into `api-snapshot/`, so the UI has real content with
//       no network at all
//    5. rewrite the pages so they work from `file://`:
//         • every asset path is relative  (/_next -> ../_next)
//         • the snapshot runtime is injected
//
//  Nothing about the UI's markup, layout or design is changed — the pages are
//  byte-for-byte the server's own render, only their URLs are rewritten.
//
//  Usage: npm run build && node scripts/offline-bundle.mjs
// ============================================================================
import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, readdir, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "out-offline");
const nextDir = path.join(root, ".next");
const PORT = Number(process.env.OFFLINE_PORT || 4187);
const origin = `http://127.0.0.1:${PORT}`;

const ROUTES = [
  "",
  "search",
  "my-music",
  "library",
  "following",
  "radio",
  "tv",
  "quran",
  "reels",
  "ai",
  "downloads",
  "settings",
  "about",
  "diagnostics",
  "youtube-profile",
  "watch",
  "stats",
];

// Read-only endpoints whose real answers are baked in. Anything that writes, or
// that needs the visitor's own account, is deliberately NOT snapshotted: those
// screens keep their honest "needs the server" state.
const API_GETS = [
  "/api/health",
  "/api/providers",
  "/api/home",
  "/api/radio",
  "/api/tv",
  "/api/quran",
  "/api/search?q=quran&source=quran",
  "/api/reels?cursor=0&limit=10",
  "/api/follows",
  "/api/me",
  "/api/stats",
  "/api/playlists",
];

if (!existsSync(path.join(nextDir, "BUILD_ID"))) {
  console.error("✗ .next/BUILD_ID missing — run `npm run build` first.");
  process.exit(1);
}
const buildId = (await readFile(path.join(nextDir, "BUILD_ID"), "utf8")).trim();
const stamp = new Date().toISOString();

/* ------------------------- 1. start a temporary server -------------------- */
console.log(`→ starting next start on :${PORT}`);
const server = spawn(
  process.execPath,
  [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)],
  { cwd: root, env: { ...process.env, NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"] },
);
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d.toString()));
server.stderr.on("data", (d) => (serverLog += d.toString()));
const stopServer = () => {
  try {
    server.kill("SIGTERM");
  } catch {
    /* already gone */
  }
};
process.on("exit", stopServer);

async function waitForServer(timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(4000) });
      if (res.status) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
}

if (!(await waitForServer())) {
  console.error("✗ server did not start:\n" + serverLog.slice(-2000));
  stopServer();
  process.exit(1);
}

/* ------------------------------ 2. capture -------------------------------- */
const pages = new Map();
for (const route of ROUTES) {
  try {
    const res = await fetch(`${origin}/${route}`, { signal: AbortSignal.timeout(120_000) });
    const body = await res.text();
    pages.set(route, body);
    console.log(`  ✓ page /${route} (${res.status}, ${(body.length / 1024).toFixed(0)} kB)`);
  } catch (err) {
    console.warn(`  ! page /${route}: ${err instanceof Error ? err.message : err}`);
  }
}

const apis = new Map();
for (const url of API_GETS) {
  try {
    const res = await fetch(origin + url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) {
      console.warn(`  ! api ${url} → ${res.status} (skipped)`);
      continue;
    }
    const text = await res.text();
    apis.set(url, text);
    console.log(`  ✓ api ${url} (${(text.length / 1024).toFixed(1)} kB)`);
  } catch (err) {
    console.warn(`  ! api ${url}: ${err instanceof Error ? err.message : err}`);
  }
}

// Capture real detail screens referenced by the offline home catalogue so
// track, artist, album and playlist links still open their matching interface.
const detailCandidates = new Set();
const detailCounts = { track: 0, artist: 0, album: 0, playlist: 0 };
const detailLimits = { track: 12, artist: 8, album: 8, playlist: 6 };
function addDetail(kind, id) {
  if (id === null || id === undefined || !/^\d+$/.test(String(id))) return;
  if (detailCounts[kind] >= detailLimits[kind]) return;
  const route = kind === "track" ? `track/${id}` : `${kind}s/${id}`;
  if (detailCandidates.has(route)) return;
  detailCandidates.add(route);
  detailCounts[kind]++;
}
try {
  const home = JSON.parse(apis.get("/api/home") || "{}");
  for (const section of home.sections || []) {
    for (const item of section.items || []) {
      if (section.kind === "tracks") {
        addDetail("track", item.id);
        addDetail("artist", item.artistId);
        addDetail("album", item.albumId);
      } else if (section.kind === "artists") {
        addDetail("artist", item.id);
      } else if (section.kind === "playlists") {
        addDetail("playlist", item.id);
      }
    }
  }
} catch {
  /* A missing home snapshot must not break the rest of the offline package. */
}
const detailQueue = [...detailCandidates];
let detailIndex = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (detailIndex < detailQueue.length) {
    const route = detailQueue[detailIndex++];
    try {
      const response = await fetch(`${origin}/${route}`, { signal: AbortSignal.timeout(45_000) });
      if (!response.ok) continue;
      const html = await response.text();
      if (!html.includes("<html")) continue;
      pages.set(route, html);
      ROUTES.push(route);
      console.log(`  ✓ detail page /${route} (${(html.length / 1024).toFixed(0)} kB)`);
    } catch (err) {
      console.warn(`  ! detail page /${route}: ${err instanceof Error ? err.message : err}`);
    }
  }
}));

stopServer();

const shell = pages.get("");
if (!shell) {
  console.error("✗ could not capture the root page");
  process.exit(1);
}

/* ------------------------------ 3. assemble ------------------------------- */
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

async function copyDir(from, to) {
  if (!existsSync(from)) return;
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    // Follow linked build outputs too; silently skipping one omits client code.
    const info = await stat(src).catch(() => null);
    if (info?.isDirectory()) await copyDir(src, dst);
    else if (info?.isFile()) {
      await mkdir(path.dirname(dst), { recursive: true });
      await writeFile(dst, await readFile(src));
    }
  }
}

// Next.js JavaScript and CSS must exist in the offline bundle.
await copyDir(path.join(nextDir, "static"), path.join(out, "_next", "static"));
async function countFilesByExtension(dir, extension) {
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) count += await countFilesByExtension(child, extension);
    else if (entry.isFile() && entry.name.endsWith(extension)) count++;
  }
  return count;
}
const jsChunkCount = await countFilesByExtension(path.join(out, "_next", "static"), ".js");
const cssChunkCount = await countFilesByExtension(path.join(out, "_next", "static"), ".css");
if (!jsChunkCount || !cssChunkCount) {
  console.error(`✗ Next.js assets are incomplete: ${jsChunkCount} JS chunks, ${cssChunkCount} CSS files. Refusing to create a broken APK.`);
  process.exit(1);
}
console.log(`  ✓ local Next.js assets: ${jsChunkCount} JS chunks · ${cssChunkCount} CSS files`);
// public/ (logos, manifest, offline page)
await copyDir(path.join(root, "public"), out);

/* --------------------- 4. collect every asset URL used -------------------- */
/** Public assets referenced by the captured pages, e.g. /logo.svg, /favicon.svg */
const publicAssets = new Set();
for (const [, body] of pages) {
  for (const m of body.matchAll(/(?:href|src|srcset|poster|content)="([^"]+)"/g)) {
    const url = m[1].split(" ")[0];
    // Only real files: page links like `/radio` are routes, not assets.
    if (url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/api/") &&
        /\.(svg|png|jpe?g|webp|avif|gif|ico|css|m?js|json|webmanifest|woff2?|ttf)$/i.test(url.split("?")[0])) {
      publicAssets.add(url.split("?")[0]);
    }
  }
}
for (const extra of ["/logo.svg", "/logo-dark.svg", "/favicon.svg", "/manifest.webmanifest"]) {
  publicAssets.add(extra);
}

// Fetch anything that is not already shipped by static/ or public/ (e.g. a
// logo referenced from a component). Failure is fine — the page simply keeps
// the URL and will fall back to the inline icon.
const extraServer = spawn(
  process.execPath,
  [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)],
  { cwd: root, env: { ...process.env, NODE_ENV: "production" }, stdio: "ignore" },
);
const missing = [...publicAssets].filter((u) => !existsSync(path.join(out, u.replace(/^\//, ""))));
if (missing.length && (await waitForServer())) {
  for (const url of missing) {
    try {
      const res = await fetch(origin + url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const dst = path.join(out, url.replace(/^\//, ""));
      await mkdir(path.dirname(dst), { recursive: true });
      await writeFile(dst, buf);
      console.log(`  + asset ${url} (${buf.length} B)`);
    } catch {
      /* keep going */
    }
  }
}
extraServer.kill("SIGTERM");

/* ----------------------- 4b. cache visible artwork ----------------------- */
const remoteImages = new Set();
const imageField = /(?:image|cover|artwork|avatar|thumbnail|thumb|poster|banner|logo|icon)/i;
const imageFile = /\.(?:avif|gif|jpe?g|png|webp|svg)(?:$|[?#])/i;
function addRemoteImage(value) {
  if (typeof value !== "string" || !/^https:\/\//i.test(value)) return;
  try {
    const u = new URL(value);
    if (u.protocol === "https:" && (imageField.test(u.pathname) || imageFile.test(u.pathname))) remoteImages.add(value);
  } catch { /* ignore invalid URLs */ }
}
for (const body of pages.values()) {
  for (const tag of body.matchAll(/<(?:img|source|meta)\b[^>]*>/gi)) {
    for (const attr of tag[0].matchAll(/\b(?:src|data-src|poster|srcset|content)\s*=\s*["']([^"']+)["']/gi)) {
      for (const candidate of attr[1].split(",").map((part) => part.trim().split(/\s+/)[0])) addRemoteImage(candidate);
    }
  }
}
function collectRemoteImages(value, key = "", inherited = false) {
  const inImageField = inherited || imageField.test(key);
  if (typeof value === "string") {
    if (inImageField || imageFile.test(value)) addRemoteImage(value);
  } else if (Array.isArray(value)) {
    for (const child of value) collectRemoteImages(child, key, inImageField);
  } else if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) collectRemoteImages(child, childKey, inImageField);
  }
}
for (const body of apis.values()) {
  try { collectRemoteImages(JSON.parse(body)); } catch { /* not JSON */ }
}
const artworkMap = new Map();
const artworkDir = path.join(out, "media-cache");
await mkdir(artworkDir, { recursive: true });
const artworkQueue = [...remoteImages].slice(0, 80);
const artworkMaxFile = 1024 * 1024;
const artworkMaxTotal = 12 * 1024 * 1024;
const artworkExt = {
  "image/avif": ".avif", "image/gif": ".gif", "image/jpeg": ".jpg",
  "image/png": ".png", "image/svg+xml": ".svg", "image/webp": ".webp",
};
let artworkIndex = 0;
let artworkBytes = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (artworkIndex < artworkQueue.length && artworkBytes < artworkMaxTotal) {
    const remote = artworkQueue[artworkIndex++];
    try {
      const response = await fetch(remote, { headers: { Accept: "image/avif,image/webp,image/*" }, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) continue;
      const mime = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!mime.startsWith("image/") || Number(response.headers.get("content-length") || 0) > artworkMaxFile) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > artworkMaxFile || artworkBytes + bytes.length > artworkMaxTotal) continue;
      const ext = artworkExt[mime] || path.extname(new URL(remote).pathname).toLowerCase() || ".img";
      const filename = createHash("sha256").update(remote).digest("hex").slice(0, 24) + ext;
      await writeFile(path.join(artworkDir, filename), bytes);
      artworkMap.set(remote, "/media-cache/" + filename);
      artworkBytes += bytes.length;
    } catch { /* artwork host is optional; all app chrome stays local */ }
  }
}));
function rewriteArtwork(source) {
  let result = source;
  for (const [remote, local] of artworkMap) result = result.split(remote).join(local);
  return result;
}
for (const [route, html] of pages) pages.set(route, rewriteArtwork(html));
for (const [url, body] of apis) apis.set(url, rewriteArtwork(body));
console.log(`  ✓ offline artwork: ${artworkMap.size} cached images · ${(artworkBytes / 1048576).toFixed(1)} MB`);

/* --------------------------- 5. API snapshots ----------------------------- */
const apiDir = path.join(out, "api-snapshot");
await mkdir(apiDir, { recursive: true });
const apiIndex = {};
for (const [url, text] of apis) {
  // stable, filesystem-safe name: /api/radio?uuid=x -> api_radio__uuid_x.json
  const name = url
    .replace(/^\//, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const file = `${name}.json`;
  await writeFile(path.join(apiDir, file), text);
  apiIndex[url] = file;
  // also index the bare path, so `/api/radio?anything` can fall back to the
  // snapshot taken for the bare path.
  const bare = url.split("?")[0];
  if (!apiIndex[bare]) apiIndex[bare] = file;
}
await writeFile(
  path.join(apiDir, "index.json"),
  JSON.stringify({ builtAt: stamp, buildId, routes: apiIndex }, null, 2),
);

/* ------------------------------ 6. runtime -------------------------------- */
/**
 * The snapshot runtime. Runs before the app boots and keeps the UI identical:
 *   • `fetch('/api/…')` → reads `api-snapshot/<file>.json` instead of the network
 *   • `<a href="/x">` behaves like a normal link, but under `file://` it is
 *     turned into `../x/index.html` so a tap never lands on a blank page
 *   • if a URL cannot be served offline, the caller gets a normal rejected
 *     promise that says so — nothing is faked, nothing pops a broken page.
 */
const runtimeTemplate = await readFile(path.join(root, "scripts", "offline-runtime.js"), "utf8");
// Guard: the rendered runtime must be real JavaScript. A syntax error here would
// silently break every page in the APK, so fail the build instead.
{
  const probe = runtimeTemplate
    .replace(/@@DM_(ROOT|PAGE|BUILD_ID|BUILT_AT|ROUTES|SNAPSHOT)@@/g, '"x"')
    .replace(/@@DM_ROUTES@@/g, "[]")
    .replace(/@@DM_SNAPSHOT@@/g, "{}");
  try {
    new Function(probe);
  } catch (err) {
    console.error("✗ scripts/offline-runtime.js is not valid JS:", err.message);
    process.exit(1);
  }
}
const RUNTIME = `<script>\n${runtimeTemplate}\n</script>`;

function runtimeFor(route, snapshotJson) {
  const depth = route.split("/").filter(Boolean).length;
  const rel = depth === 0 ? "./" : "../".repeat(depth);
  const values = {
    "@@DM_ROOT@@": rel,
    "@@DM_PAGE@@": route,
    "@@DM_BUILD_ID@@": buildId,
    "@@DM_BUILT_AT@@": stamp,
    "@@DM_ROUTES@@": ROUTES,
    "@@DM_SNAPSHOT@@": snapshotJson,
  };
  // Single pass over @@…@@ markers (the tokens never appear in the app's own
  // identifiers, unlike the earlier __DM_…__ form which collided with
  // `window.__DM_BUILD__`), values JSON-encoded so quotes/newlines stay valid.
  return RUNTIME.replace(/@@DM_(ROOT|PAGE|BUILD_ID|BUILT_AT|ROUTES|SNAPSHOT)@@/g, (token) =>
    JSON.stringify(values[token]),
  );
}

function transform(page, route, snapshotJson) {
  const depth = route.split("/").filter(Boolean).length;
  const rel = depth === 0 ? "./" : "../".repeat(depth);
  // Keep Next.js Flight/RSC bootstrap scripts intact so React can hydrate
  // client components and wire up the original controls; only asset URLs move.
  let html = page;
  // every absolute asset URL becomes relative to this page
  html = html.replace(/((?:href|src|srcset|poster)=")\/(?!\/)/g, `$1${rel}`);
  html = html.replace("</head>", `${runtimeFor(route, snapshotJson)}\n</head>`);
  return html;
}

const snapshotJson = apiIndex;
for (const route of ROUTES) {
  const page = pages.get(route) ?? shell;
  const dir = path.join(out, route);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.html"), transform(page, route, snapshotJson));
}
await writeFile(path.join(out, "index.html"), transform(shell, "", snapshotJson));
await writeFile(path.join(out, "404.html"), transform(shell, "", snapshotJson));
await writeFile(path.join(out, ".nojekyll"), "");

/* --------------------------------- report -------------------------------- */
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(p);
    else files.push(p);
  }
}
await walk(out);
let bytes = 0;
for (const f of files) bytes += (await stat(f)).size;
console.log(`\n✓ Offline bundle → out-offline/`);
console.log(`  ${files.length} files · ${(bytes / 1048576).toFixed(1)} MB · build ${buildId}`);
console.log(`  pages: ${ROUTES.length} · api snapshots: ${Object.keys(snapshotJson).length}`);
