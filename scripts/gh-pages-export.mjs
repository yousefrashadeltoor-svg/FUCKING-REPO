#!/usr/bin/env node
// ============================================================================
//  DON MUSE — GitHub Pages exporter
//  ---------------------------------------------------------------------------
//  GitHub Pages can only serve static files, while DON MUSE is a full Next.js
//  app (streaming, search, Quran, TV, radio… all live in /api routes).
//
//  This exporter produces a static `out/` that:
//    • boots the real React app (same components, same design system)
//    • uses pre-rendered HTML per route (captured from a temporary local server
//      at build time, so the first paint is complete and SEO-friendly)
//    • forces a full document navigation for internal links, which is what
//      makes every route work on a static host (no RSC fetches, no 404s)
//    • talks to the live API through NEXT_PUBLIC_API_BASE when one is set
//      (see src/lib/api-base.ts). Without it the UI clearly states that the
//      server features need the hosted deployment — nothing is faked.
//
//  Usage:  npm run build && node scripts/gh-pages-export.mjs
// ============================================================================
import { cp, mkdir, readFile, writeFile, readdir, stat, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const nextDir = path.join(root, ".next");
const out = path.join(root, "out");

if (!existsSync(path.join(nextDir, "BUILD_ID"))) {
  console.error("✗ .next/BUILD_ID missing — run `npm run build` first.");
  process.exit(1);
}
const buildId = (await readFile(path.join(nextDir, "BUILD_ID"), "utf8")).trim();

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

/* ------------------------- 1. start a temporary server -------------------- */
const PORT = Number(process.env.EXPORT_PORT || 4123);
const origin = `http://127.0.0.1:${PORT}`;
console.log(`→ starting next start on :${PORT}`);

const server = spawn(
  process.execPath,
  [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)],
  { cwd: root, env: { ...process.env, NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"] },
);
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d.toString()));
server.stderr.on("data", (d) => (serverLog += d.toString()));

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

const up = await waitForServer();
if (!up) {
  console.error("✗ server did not start:\n" + serverLog.slice(-2000));
  server.kill("SIGTERM");
  process.exit(1);
}

/* --------------------------- 2. capture the routes ------------------------ */
const html = new Map();
for (const route of ROUTES) {
  const url = `${origin}/${route}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    const body = await res.text();
    html.set(route, body);
    console.log(`  ✓ /${route} (${res.status}, ${(body.length / 1024).toFixed(0)} kB)`);
  } catch (err) {
    console.warn(`  ! /${route} failed: ${err instanceof Error ? err.message : err}`);
  }
}
server.kill("SIGTERM");

const shell = html.get("");
if (!shell) {
  console.error("✗ could not capture the root page");
  process.exit(1);
}

/* ------------------------------ 3. assemble ------------------------------- */
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

// hashed client chunks + css
if (existsSync(path.join(nextDir, "static"))) {
  await cp(path.join(nextDir, "static"), path.join(out, "_next", "static"), { recursive: true });
}
// public/ (logos, manifest, sw.js, offline page)
if (existsSync(path.join(root, "public"))) {
  await cp(path.join(root, "public"), out, { recursive: true });
}

/**
 * Post-process a server-rendered page into a static one:
 *  • drop the RSC flight payload (it references server-only data)
 *  • keep the real DOM so the first paint is identical to production
 *  • add the Pages runtime: api base rewrite + full-navigation link handling
 */
const RUNTIME = `
<script>
(function(){
  window.__DM_STATIC__ = true;
  window.__DM_BUILD__ = ${JSON.stringify(buildId)};
  var base = ${JSON.stringify(process.env.NEXT_PUBLIC_API_BASE || "")};
  window.__DM_API_BASE__ = base;
  if (base && typeof window.fetch === "function") {
    var orig = window.fetch.bind(window);
    window.fetch = function(input, init){
      try {
        var url = typeof input === "string" ? input : (input && input.url);
        if (typeof url === "string" && url.charAt(0) === "/" && url.indexOf("/api/") === 0) {
          input = base.replace(/\\/$/, "") + url;
        }
      } catch (e) {}
      return orig(input, init);
    };
  }
  // Static hosting has no RSC router endpoint: navigate with real page loads.
  // Paths are relative to the site root so the bundle also works when it is
  // published under /<repo>/ on GitHub Pages.
  document.addEventListener("click", function(ev){
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
    if (!a) return;
    var href = a.getAttribute("href");
    if (!href || href.charAt(0) !== "/" || href.charAt(1) === "/") return;
    if (a.target === "_blank" || a.hasAttribute("download")) return;
    ev.preventDefault();
    var root = window.__DM_ROOT__ || "./";
    var clean = href.split("?")[0].split("#")[0].replace(/^\/+/, "").replace(/\/+$/, "");
    window.location.assign(clean ? root + clean + "/" : root);
  }, true);
})();
</script>`;

function transform(page, route) {
  const root = route === "" ? "./" : "../";
  let out = page
    // remove the flight/RSC payload scripts
    .replace(/<script>self\.__next_f[\s\S]*?<\/script>/g, "")
    .replace(/<script[^>]*src="[^"]*__next_f[^"]*"[^>]*><\/script>/g, "");
  // Absolute asset URLs → relative, so the bundle works at the domain root AND
  // under /<repo>/ on GitHub Pages.
  out = out.replace(/((?:href|src)=")\/(?!\/)/g, `$1${root}`);
  out = out.replace(
    "</head>",
    `${RUNTIME}\n<script>window.__DM_ROOT__=${JSON.stringify(root)};window.__DM_ROUTE__=${JSON.stringify("/" + route)};</script></head>`,
  );
  return out;
}

for (const route of ROUTES) {
  const page = html.get(route) ?? shell;
  const dir = path.join(out, route);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.html"), transform(page, route));
}
await writeFile(path.join(out, "404.html"), transform(shell, ""));
await writeFile(path.join(out, "index.html"), transform(shell, ""));
await writeFile(
  path.join(out, ".nojekyll"),
  "",
);

/* --------------------------------- report -------------------------------- */
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir)) {
    const p = path.join(dir, entry);
    const s = await stat(p);
    if (s.isDirectory()) await walk(p);
    else files.push(s.size);
  }
}
await walk(out);
const totalMb = (files.reduce((a, b) => a + b, 0) / 1048576).toFixed(1);
console.log(`\n✓ GitHub Pages bundle → out/`);
console.log(`  ${files.length} files · ${totalMb} MB · build ${buildId}`);
console.log(`  API base: ${process.env.NEXT_PUBLIC_API_BASE || "(none — server features disabled, UI says so)"}`);
