## What this is

`arena/e36ff409-fucking-repo` is a long-running hardening + feature branch for DON MUSE (Next.js web app + Android WebView/ExoPlayer host). It closes the gap between what the UI claims and what the code actually does: no mock data, no unofficial APIs, no decorative toggles.

**14 commits, 81 files, +5,896 / −960** vs `main`.

## Highlights

### Data & providers — official APIs only
- **YouTube: InnerTube removed.** `youtubei.js` and `bgutils-js` are gone; everything (music search, trending, artist profiles, seeding) now uses the **official Data API v3** via the new `src/lib/server/youtube-data.ts` (`search.list` / `videos.list` / `channels.list`). Without `YOUTUBE_API_KEY` the routes return real empty results with `configured:false` — never fabricated rows. Fields the API does not expose (monthly listeners, related artists, "top songs" order) stay `null`/empty rather than guessed.
- Provider registry with live health checks + `docs/PROVIDERS.md`: 13 providers compared (licence, keys, self-host, quota, mode, background play, download, strengths/weaknesses, live test result) and 5 policy rules derived from it.
- Per-visitor signed identity, playlist ownership guards, and an official-only YouTube playback path (`ytdlp` still refuses YouTube hosts; downloads only for Audius/Jamendo/Archive/Quran/own files).

### Security
- SSRF guard for every client-supplied proxy URL (`src/lib/server/ssrf.ts`) with a runnable test suite (`tests/ssrf.test.mts`, 14 cases) wired into CI.
- Server-side OAuth token store, encrypted; no tokens reach the client.

### Real analytics
- `/stats` page + SQL aggregates: unique tracks/artists, current streak, 24-hour histogram, last-30-days series, genre split — all computed from listening history, nothing estimated. YouTube watch time is reported separately.

### Audio
- Equalizer gains a **real low-shelf bass boost (<120 Hz)**, a **master pre-amp** (so boosted curves don't clip) and a **stereo balance panner**, all in the Web Audio graph (`master → lowshelf → preamp → panner → compressor → analyser → destination`), persisted and exposed in the EQ panel with EN/AR copy.

### Android host
- Restored `MediaStoreRepository` (in-place library reads, scoped permissions only — no blanket storage access, real downloads into public Music/Movies via MediaStore with live progress events).
- `window.__dmTheme` is now actually injected by the host as a **document-start script** (WebViewX), with a page-finished fallback, and the page is re-themed live when settings change — this is what removes the wrong-theme flash on cold start.

### Correctness fixes
- Quran: correct Refaat reciter label with legacy alias.
- Diagnostics: live provider health panel.
- History: duplicate scrobbler removed; reported listened seconds are real.
- YouTube profile: real upload with progress, in-app watch links, separate per-user watch-history API.

### CI
- Lint/build now **fail** on errors; the APK job bundles a verified web export; the auto-commit patch pipeline is gone.
- The APK pipeline is repaired: deprecated actions bumped, Android SDK + Gradle 8.7 installed explicitly, and Gradle failures surface as check annotations instead of being swallowed by a `| tee` pipe. `AndroidManifest.xml` was invalid XML (`--` inside comments) and several Kotlin/Media3 errors were fixed, so `assembleDebug` **and** `assembleRelease` now succeed.

## Verification

| Check | Result |
| --- | --- |
| `tsc --noEmit` | 0 errors |
| `eslint .` | 0 errors, 4 pre-existing warnings |
| `next build` | success (all routes, incl. `/stats`) |
| `node scripts/gh-pages-export.mjs` | 69 files, 3.2 MB |
| `npm test` (SSRF) | 14/14 passing |
| Android APK | green: debug + release APKs built and uploaded (`don-muse-apk`, 12 MB) |

## Known limits (deliberately not faked)
- No `YOUTUBE_API_KEY` → YouTube surfaces show a "not configured" state instead of data.
- Monthly listeners / related artists: not available from the Data API, so left empty.
- The APK is CI-built and downloadable, but no device/emulator run was possible here.
