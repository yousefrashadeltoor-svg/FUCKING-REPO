// ============================================================================
//  DON MUSE — build the self-contained distribution folder (dist/donmuse).
//  Result runs on ANY plain host with Node.js ≥ 20 (+ python3 for yt-dlp):
//     cd dist/donmuse && node server.js        (or ./start.sh / start.bat)
//  Contains: compiled HTML/CSS/JS, the Node server, embedded Postgres
//  (PGlite, data in ./data), ffmpeg (static), yt-dlp, logos, service worker.
//  No external database, no env vars, no build step on the host.
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const out = path.join(root, "dist", "donmuse");
const sa = path.join(root, ".next", "standalone");

const cp = (src, dst) => {
  if (!fs.existsSync(src)) { console.warn("skip (missing):", path.relative(root, src)); return; }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true, dereference: true });
};

console.log("→ cleaning dist/");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

console.log("→ copying standalone server");
cp(sa, out);
fs.rmSync(path.join(out, "dist"), { recursive: true, force: true });
fs.rmSync(path.join(out, "data", "pglite"), { recursive: true, force: true });
console.log("→ copying static assets (HTML/CSS/JS chunks)");
cp(path.join(root, ".next", "static"), path.join(out, ".next", "static"));
console.log("→ copying public/ (logos, sw.js, manifest, images)");
cp(path.join(root, "public"), path.join(out, "public"));
console.log("→ copying tools: yt-dlp + ffmpeg + PGlite runtime");
cp(path.join(root, "bin"), path.join(out, "bin"));
cp(path.join(root, "node_modules", "ffmpeg-static"), path.join(out, "node_modules", "ffmpeg-static"));
cp(path.join(root, "node_modules", "@electric-sql", "pglite"), path.join(out, "node_modules", "@electric-sql", "pglite"));
fs.mkdirSync(path.join(out, "data", "pglite"), { recursive: true });
fs.mkdirSync(path.join(out, "cache"), { recursive: true });

// optional: seed data snapshot (tracks/artists/playlists) so first launch isn't empty
try {
  const dump = execSync(
    `pg_dump --data-only --no-owner --no-privileges --inserts --column-inserts -t users -t artists -t albums -t tracks -t playlists -t playlist_tracks -t user_track_likes -t listening_history -t artist_follows -t album_likes ${process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db"}`,
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const inserts = dump.split("\n").filter((l) => l.startsWith("INSERT INTO")).map((l) => l.replace(/^INSERT INTO public\./, "INSERT INTO ").replace(/;$/, " ON CONFLICT DO NOTHING;"));
  fs.writeFileSync(path.join(out, "data", "seed.sql"), inserts.join("\n"));
  console.log(`→ seed snapshot: ${inserts.length} rows`);
} catch {
  console.log("→ no live DB for seed snapshot (optional)");
}

// launcher scripts
fs.writeFileSync(path.join(out, "start.sh"), `#!/usr/bin/env bash
# DON MUSE — self-contained launcher (Linux / macOS)
cd "$(dirname "$0")"
export PORT="\${PORT:-3000}"
export HOSTNAME="\${HOSTNAME:-0.0.0.0}"
export DATABASE_URL="local"
export DONMUSE_DATA_DIR="$(pwd)/data/pglite"
export DONMUSE_CACHE_DIR="$(pwd)/cache"
chmod +x bin/yt-dlp node_modules/ffmpeg-static/ffmpeg 2>/dev/null
echo "DON MUSE → http://localhost:$PORT"
exec node server.js
`);
fs.writeFileSync(path.join(out, "start.bat"), `@echo off
REM DON MUSE — self-contained launcher (Windows)
cd /d %~dp0
set PORT=3000
set HOSTNAME=0.0.0.0
set DATABASE_URL=local
set DONMUSE_DATA_DIR=%cd%\\data\\pglite
set DONMUSE_CACHE_DIR=%cd%\\cache
echo DON MUSE - http://localhost:%PORT%
node server.js
`);
fs.chmodSync(path.join(out, "start.sh"), 0o755);

fs.writeFileSync(path.join(out, "README.md"), `# DON MUSE — self-contained build

Everything the app needs is inside this folder:

| Part | Where |
|---|---|
| Compiled UI (HTML / CSS / JS) | \`.next/static\`, \`.next/server\` |
| Node server | \`server.js\` |
| Embedded database (Postgres via PGlite) | \`data/pglite\` (created on first run) |
| Download/transcode tools | \`bin/yt-dlp\`, \`node_modules/ffmpeg-static/ffmpeg\` |
| Logos, service worker, manifest, images | \`public/\` |

## Run
\`\`\`bash
./start.sh            # Linux / macOS     (Windows: start.bat)
# → http://localhost:3000
\`\`\`
Requirements on the host: **Node.js 20+** and **python3** (used by yt-dlp for YouTube/SoundCloud downloads).
No database server, no environment variables, no build step.

- Change the port: \`PORT=8080 ./start.sh\`
- Use an external PostgreSQL instead of the embedded one: \`DATABASE_URL=postgres://… ./start.sh\`
- The UI is fully local (service worker + offline page). Internet is needed only for streaming, search and downloads.

## Android
Wrap this server URL (or a hosted copy) with Capacitor / TWA — \`public/manifest.webmanifest\` and icons are included.

Developer: **Joseph M.R**
`);

const size = execSync(`du -sh "${out}"`).toString().split("\t")[0];
console.log(`✓ dist/donmuse ready (${size})`);
