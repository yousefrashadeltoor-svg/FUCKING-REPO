#!/usr/bin/env node
// Fail-closed structural checks. This is not a substitute for Gradle compilation;
// CI additionally runs assembleDebug/assembleRelease and Android lint.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const android = path.join(root, "android");
const javaRoot = path.join(android, "app/src/main/java");
const res = path.join(android, "app/src/main/res");
const errors = [];
const check = (ok, message) => { if (!ok) errors.push(message); };
const read = (p) => fs.readFileSync(p, "utf8");
const exists = (p) => fs.existsSync(p);
const walk = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]) : [];
const kt = walk(javaRoot).filter(p => p.endsWith(".kt"));
const sources = kt.map(read).join("\n");
const manifestPath = path.join(android, "app/src/main/AndroidManifest.xml");
check(exists(manifestPath), "AndroidManifest.xml is missing");
const manifest = exists(manifestPath) ? read(manifestPath) : "";
check(!manifest.includes('android:name="android.permission.MANAGE_EXTERNAL_STORAGE"'), "Blanket storage permission is forbidden");
check(!sources.includes("ReleaseCheckWorker") && !sources.includes("API_BASE"), "Removed server/release-worker dependency is still referenced");
check(!exists(path.join(android, "settings.gradle")) && !exists(path.join(android, "build.gradle")), "Old Groovy Gradle files shadow the Kotlin configuration");
for (const name of ["settings.gradle.kts", "build.gradle.kts", "app/build.gradle.kts", "gradlew", "gradlew.bat", "gradle/wrapper/gradle-wrapper.jar"]) check(exists(path.join(android, name)), `Missing android/${name}`);
const jar = path.join(android, "gradle/wrapper/gradle-wrapper.jar");
if (exists(jar)) check(crypto.createHash("sha256").update(fs.readFileSync(jar)).digest("hex") === "cb0da6751c2b753a16ac168bb354870ebb1e162e9083f116729cec9c781156b8", "Gradle 8.7 wrapper JAR checksum mismatch");
const wrapper = path.join(android, "gradle/wrapper/gradle-wrapper.properties");
if (exists(wrapper)) check(read(wrapper).includes("distributionSha256Sum=544c35d6bd849ae8a5ed0bcea39ba677dc40f49df7d1835561582da2009b961d"), "Gradle distribution checksum is not pinned");
// Every declared native component must have an implementation.
for (const m of manifest.matchAll(/android:name="(\.[A-Za-z0-9_.]+)"/g)) {
  const cls = m[1];
  if (cls === ".DonMuseApp" || cls.includes("Activity") || cls.includes("Service") || cls.includes("Receiver") || cls.includes("Widget")) check(exists(path.join(javaRoot, "fm/donmuse/app", `${cls.slice(1).replaceAll(".", "/")}.kt`)), `Manifest component has no Kotlin file: ${cls}`);
}
// Local imports resolve to declarations, not necessarily matching filenames.
const symbols = new Set(["fm.donmuse.app.R", "fm.donmuse.app.BuildConfig"]);
for (const file of kt) { const text = read(file); const pkg = text.match(/^package ([A-Za-z0-9_.]+)/m)?.[1]; for (const m of text.matchAll(/\b(?:class|object|interface) ([A-Za-z0-9_]+)/g)) if (pkg) symbols.add(`${pkg}.${m[1]}`); }
for (const file of kt) for (const m of read(file).matchAll(/^import (fm\.donmuse\.app\.[A-Za-z0-9_.]+)$/gm)) check(symbols.has(m[1]), `${path.basename(file)} imports missing ${m[1]}`);
// Bridge parity: TypeScript call/request names vs Kotlin interfaces/dispatcher.
const bridge = read(path.join(javaRoot, "fm/donmuse/app/bridge/NativeBridge.kt"));
const exposed = new Set([...bridge.matchAll(/@JavascriptInterface fun ([A-Za-z0-9_]+)/g)].map(m => m[1]));
for (const m of bridge.matchAll(/^\s*"([A-Za-z0-9_]+)"\s*->/gm)) exposed.add(m[1]);
const ts = read(path.join(root, "src/lib/platform/native.ts"));
const requested = new Set([...ts.matchAll(/\bcall(?:<[^>\n]+>)?\("([A-Za-z0-9_]+)"/g)].map(m => m[1]));
for (const m of ts.matchAll(/nativeRequest(?:<[^\n]+?>)?\("([A-Za-z0-9_]+)"/g)) requested.add(m[1]);
for (const method of requested) check(exposed.has(method), `UI bridge method is not implemented: ${method}`);
check(requested.has("transcodeClip") && exposed.has("transcodeClip"), "Local radio transcoding contract is missing");
// Resource references (including all widget RemoteViews IDs).
const values = walk(path.join(res, "values")).filter(p => p.endsWith(".xml")).map(read).join("\n");
const layouts = walk(path.join(res, "layout")).map(read).join("\n");
for (const m of sources.matchAll(/(?<!android\.)\bR\.(layout|drawable|string|xml|id)\.([A-Za-z0-9_]+)/g)) {
  const [, type, name] = m;
  const ok = type === "id" ? layouts.includes(`@+id/${name}"`) : type === "string" ? values.includes(`name="${name}"`) : exists(path.join(res, type, `${name}.xml`)) || exists(path.join(res, `${type}-anydpi-v26`, `${name}.xml`));
  check(ok, `Missing Android resource R.${type}.${name}`);
}
check(exists(path.join(res, "xml/now_playing_widget_info.xml")) && exists(path.join(res, "xml/mini_player_widget_info.xml")), "Both widget providers are required");
if (process.argv.includes("--bundle")) {
  const www = path.join(android, "app/src/main/assets/www");
  const index = path.join(www, "index.html"); check(exists(index), "Bundled index.html is missing; run npm run build:android");
  if (exists(index)) {
    const html = read(index);
    check(!html.includes('/src/main.tsx'), "Development entry leaked into the APK bundle");
    check(/src="\.\/native-bootstrap\.js"/.test(html), "Native bootstrap must be a relative, classic script");
    check(html.indexOf("native-bootstrap.js") < html.indexOf('type="module"'), "Native bootstrap must precede the module entry");
    for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      const url = m[1]; if (/^(https?:|data:|\/\/)/.test(url)) continue;
      check(exists(path.resolve(www, url)), `Bundled HTML references a missing asset: ${url}`);
    }
    check(walk(path.join(www, "assets")).some(p => p.endsWith(".js")) && walk(path.join(www, "assets")).some(p => p.endsWith(".css")), "Compiled JS/CSS assets are missing");
  }
  for (const file of ["native-bootstrap.js", "offline.html", "manifest.webmanifest", "backgrounds/midnight-aurora.jpg", "backgrounds/golden-dunes.jpg", "backgrounds/ocean-vinyl.jpg"]) check(exists(path.join(www, file)), `Missing bundled public asset: ${file}`);
}
if (errors.length) { console.error(`Android check failed:\n- ${errors.join("\n- ")}`); process.exit(1); }
console.log(`Android structure OK: ${kt.length} Kotlin files, ${requested.size} bridge methods${process.argv.includes("--bundle") ? ", bundled UI verified" : " (run npm run bundle to verify assets)"}.`);
