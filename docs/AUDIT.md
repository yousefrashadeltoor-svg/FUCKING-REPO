# DON MUSE — engineering audit & final status

Date: 2026-11-07 · Branch: `arena/e36ff409-fucking-repo` · PR: [#3](https://github.com/yousefrashadeltoor-svg/FUCKING-REPO/pull/3)
Baseline: `main` @ `25d2ce9` · Head: 16 commits, 86 files, ≈ +6,000 / −960 lines

This is the closing report: what the app actually does now, section by section, with
the evidence behind each claim. Anything that could not be verified in this
environment is marked **CI-only** or **unverified** instead of claimed as done.

---

## 1. Scope and method

- One codebase → website (Next.js App Router, static export to GitHub Pages) **and**
  a native Android app (Kotlin, Media3/ExoPlayer, WebView UI host).
- Rule applied throughout: *the UI may only claim what the code proves.* Where a
  provider or platform does not expose data, the field stays `null`/empty and the UI
  says so — no mock rows, no estimated numbers, no decorative toggles.
- Verification used: `tsc --noEmit`, `eslint .`, `next build`, the static export
  script, and `npm test` (SSRF suite). Android is compiled by CI only (no
  Gradle/JDK/SDK egress in this sandbox).

## 2. Repository shape

| Layer | Size |
| --- | --- |
| TypeScript/TSX sources | 174 files, ~26,500 lines |
| API route handlers | 53 `route.ts` files across 20 route groups |
| Kotlin sources | 15 files, ~1,750 lines |
| Pages (App Router, `(app)` group) | 21: home, search, artists, albums, track, playlists, library, my-music, radio, tv, quran, reels, watch, youtube-profile, following, downloads, ai, diagnostics, settings, about, **stats** |
| Docs | `docs/PROVIDERS.md`, `docs/PR_BODY.md`, this report |

## 3. Playback core

- **One engine per document** (`src/lib/audio/engine.ts`), three backends: `native`
  (ExoPlayer through the Android bridge), `youtube` (official IFrame player) and
  `audio` (Web Audio + dual media elements).
- A monotonic `loadToken` plus `killOthers()` guarantees exactly one source can
  sound. This is what fixed ghost playback, "the previous song comes back" and the
  frozen progress timer.
- The Zustand store holds *intent*; the engine holds *truth*. `controller.ts` is the
  only bridge, and every progress/duration/play-state value comes from real media
  events.
- Audio graph: `element → track gain → 10-band peaking EQ → master → lowshelf bass →
  pre-amp → stereo panner → compressor → analyser → destination`, with loudness
  normalisation and data-saver quality handled in the same place.
- **New this branch:** real low-shelf bass boost (<120 Hz, ±12 dB), master pre-amp
  (±12 dB, prevents clipping on boosted curves) and L/R balance. All three are
  genuine `AudioNode`s, persisted in the player store, and exposed in the EQ panel
  with EN + AR labels.

## 4. Playback policy (rights)

`src/lib/playback-policy.ts` is the single authority:

- YouTube → **embed only**. `ytdlp.ts` refuses YouTube hosts outright; the
  stream/download/format/clip routes answer with policy JSON.
- Audius, Jamendo, Internet Archive, Quran archives, the user's own files →
  direct streaming and, where the licence allows, downloads.
- Bandcamp/SoundCloud → link-out or streaming without download.

## 5. Providers

`src/lib/server/providers.ts` is a registry with live health checks surfaced in
`/diagnostics`. `docs/PROVIDERS.md` compares **13 providers** on licence, required
keys, self-hostability, quota, playback mode, background play, downloads, strengths,
weaknesses, why it was chosen and the result of a live probe — and derives five
binding rules (no extraction for YouTube, no InnerTube, embed-only for YouTube,
keyless-first fallbacks, link-out for artist-owned platforms).

## 6. YouTube — official Data API v3 only

- `youtubei.js` and `bgutils-js` were **removed**. All of search, trending, artist
  profiles and seeding go through `src/lib/server/youtube-data.ts`
  (`search.list`, `videos.list`, `channels.list`).
- Without `YOUTUBE_API_KEY`, routes return empty results with `configured:false`.
  Nothing is invented.
- Titles are cleaned of `(Official Video)`/`[Lyrics]`/`| …`; `"Artist - Title"` is
  split into artist/title; song results are filtered to 45 s–20 min.
- Trending combines the regional `mostPopular` Music chart (region `EG`) with three
  rotating queries from a 20-item pool, shuffled, so refreshes differ.
- Fields the API does not expose — monthly listeners, related/featured artists,
  album tracklists, "top songs" ordering — stay empty rather than guessed.
- Account actions (subscribe, like, comment, playlist, upload) go through the
  official OAuth path with an **encrypted server-side token store**; tokens never
  reach the browser.

## 7. Security & identity

- Per-visitor identity: HMAC-signed `httpOnly` session cookie mapped to a real
  `users` row; the old shared `demo@aura.fm` account is gone. `getDemoUser()` now
  delegates, so ~60 call sites became per-user without edits.
- Every playlist/reel/history write is ownership-guarded.
- **SSRF guard** (`src/lib/server/ssrf.ts`) on every client-supplied URL: scheme
  allow-list, DNS resolution to all addresses, private/loopback/link-local/CGNAT/
  IPv4-mapped-IPv6 rejection, per-hop revalidation on redirects. Covered by
  `tests/ssrf.test.mts` (14 cases) and run in CI via `npm test`.

## 8. Data layer & statistics

- Drizzle + PGlite (embedded) for local/dev, Postgres in production.
- `/api/stats` + `/stats` page return **real aggregates computed in SQL**: unique
  tracks, unique artists, current streak (walk-back), 24-hour histogram, last-30-day
  series, genre distribution. YouTube watch time is reported separately because it
  is not listening time.
- History records real listened seconds (the duplicate scrobbler was removed).

## 9. Android host

| Concern | Implementation |
| --- | --- |
| UI | The same web app in a WebView, with `data-host="android"` safe areas |
| Playback | ExoPlayer + `MediaSessionService` → background audio, media notification, lock screen, Bluetooth, audio focus, becoming-noisy |
| Library | `MediaStoreRepository` reads the device library **in place** through MediaStore URIs; no copies |
| Permissions | Per-type media permissions on 13+, `READ_EXTERNAL_STORAGE` below; "all files access" is opt-in from Settings only, never demanded |
| Downloads | Real HTTP transfer → `MediaStore` insert into public `Music/DON MUSE` (legacy public dir + media scanner below Q) with live progress pushed to JS |
| Storage | App-private `AppStorage` file (SharedPreferences-equivalent), not IndexedDB |
| Theme | `ThemeInjector` sets `window.__dmTheme` as a **document-start script** (WebKitX) with a page-finished fallback, and re-themes the live page when settings change — cold start no longer flashes the default theme |
| Widgets / notifications | `WorkManager` release notifications, home-screen widget refresh on every transport change |

**Fixed this branch:** `MediaStoreRepository.kt` was missing from the tree while
`NativeBridge` still imported it (the Android build could not compile). It has been
restored with scoped-permission reads and the real download pipeline.

## 10. Quran, radio, TV, reels, AI

- Quran: verified recitation archives with per-ayah timing, correct Refaat reciter
  label (with legacy alias for old links), quality choice, full-surah download where
  the archive permits.
- Radio: Radio Browser (30k+ stations) with genre chips, search, recents, share.
- TV: HLS via `hls.js` with a real player surface and channel data.
- Reels: vertical short-video feed with real sources.
- AI: assistant surface wired to the server route, no invented catalogue data.

## 11. UI / i18n / design system

- Arabic-first (RTL) with a full English dictionary; every new key this branch was
  added to **both** languages (`src/lib/i18n.ts` is typed to `DictKey`, so a missing
  key fails the type-check).
- Themes/accents/density/motion are applied by a pre-hydration bootstrap script (no
  flash), then kept live by React.
- Skeletons, empty states and "not configured" states are real states, not fake
  content.

## 12. Build & CI

| Workflow | What it does |
| --- | --- |
| `ci.yml` | `npm ci`, typecheck, lint **failing on errors**, build, `npm test` (SSRF) |
| `pages.yml` | Builds and publishes the static export to GitHub Pages |
| `android-apk.yml` | Builds a **verified web export first**, bundles it as assets, then assembles the APK |
| `import-and-build.yml` | Import/build pipeline (auto-commit patch loop removed) |

Static export: **69 files · 3.2 MB**, API base empty → the UI explicitly reports
"server features disabled" instead of failing silently.

## 13. Verification results (this sandbox)

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | 0 errors |
| `npx eslint .` | 0 errors, 4 pre-existing warnings |
| `npx next build` | success, all routes incl. `/stats` |
| `node scripts/gh-pages-export.mjs` | 69 files, 3.2 MB, `/stats` renders 200 |
| `npm test` | 14/14 SSRF cases pass |
| Android `assembleDebug` | **CI-only** — not run here |

## 14. Known limits (stated, not hidden)

1. No `YOUTUBE_API_KEY` in this environment → YouTube surfaces show the
   "not configured" state. The code paths type-check and build.
2. Monthly listeners, related artists and album tracklists are not available from the
   Data API; they remain empty by design.
3. Android APK is verified by CI compilation only; no device/emulator run was
   possible in the sandbox (no SDK/Gradle).
4. Deezer, SoundCloud and Bandcamp are metadata/link-out sources, not playback
   sources for us.
5. `MANAGE_EXTERNAL_STORAGE` remains declared for the optional full-metadata path;
   it is only ever requested by an explicit user action, and all reads work without
   it.

## 15. Deliberate non-goals

- No YouTube stream extraction, downloading or re-hosting.
- No unofficial YouTube clients (InnerTube removed and not reintroduced).
- No fabricated catalogue rows, stats or "listener counts".
- No auto-committing CI that rewrites the repository.

## 16. How to run it

```bash
npm install
npm run dev            # web app on :3000
npm run typecheck      # tsc --noEmit
npm run lint
npm test               # SSRF suite
npm run build          # next build
npm run export:pages   # static bundle → out/
npm run seed           # needs DONMUSE_ALLOW_DESTRUCTIVE_SEED=1 (destroys data)
cd android && ./gradlew assembleDebug   # needs the Android SDK
```

Environment: `YOUTUBE_API_KEY` (YouTube search/trending), optional provider keys,
`SESSION_SECRET` (per-visitor identity signing), `DATABASE_URL` (Postgres; PGlite is
used when absent).
