# DON MUSE

موسيقى · راديو · تلفزيون · قرآن · مكتبتك · **مشروع واحد** يعمل كموقع كامل وتطبيق أندرويد حقيقي.

One codebase → a full website **and** a real native Android app (Kotlin + Media3),
built by GitHub Actions, publishable to GitHub Pages and as an APK.

---

## ما الذي يعمل فعليًا / What actually works

| Area | Implementation |
|---|---|
| **Playback core** | One audio engine per document (`src/lib/audio/engine.ts`) with three backends — `native` (ExoPlayer via the Android bridge), `youtube` (IFrame player) and `audio` (Web Audio + dual elements). A single monotonic `loadToken` + `killOthers()` guarantees exactly one source can ever sound, which fixes ghost playback, "previous song returns" and the frozen timer. |
| **Store ⇄ engine** | The store holds intent, the engine holds truth. `installPlaybackController()` (`src/lib/audio/controller.ts`) is the only bridge; progress, duration and play state are read from real media events, never guessed. |
| **Background playback** | Android: `PlaybackService` is a `MediaSessionService` (foreground, `mediaPlayback` type) with a real MediaStyle notification (play/pause/prev/next + seek bar), lock-screen and Bluetooth controls, audio focus and becoming-noisy handling. Web: Media Session API + service worker. |
| **Home-screen widgets** | `widget/NowPlayingWidget` (4×2) and `widget/MiniPlayerWidget` (4×1) drive the same `NativePlayer` singleton as the notification, so state never diverges. |
| **موسيقاي (My Music)** | Real device files read **in place**: MediaStore on Android (`content://` URIs, no copies, no uploads), File System Access handles on the web. Playlist CRUD, add-to-playlist, metadata + artwork editing that writes back to the original file where the OS allows. |
| **Quran** | Every surah × every reciter, multiple libraries (mp3quran, EveryAyah, QuranicAudio, …), quality tiers (low/medium/high) with real bitrate sorting, Range-capable streaming proxy and full-surah downloads with UTF-8 filenames (`/api/quran/stream`, `/api/quran/download`). |
| **TV** | Two-level taxonomy: Egyptian TV, Arab TV (including Arab channels broadcast in Egypt) and more, split into news, sports, religious, kids/cartoon, movies & series, education, entertainment… with per-group counts. |
| **Search** | Artists first, real follower counts and verification on each card, multi-platform artist profiles with platform logos, and the artist's full catalogue. No invented numbers anywhere. |
| **Following** | «المتابعات» reads real follow rows (`/api/follows`, `/api/artists/[id]/follow`). |
| **YouTube profile** | Official Google OAuth 2.0 (server-side code exchange, httpOnly cookie, refresh tokens) + YouTube Data API v3 → real channel, subscribers, subscriptions, playlists, liked videos and recommendations (`/api/youtube/*`). Without credentials the page says so — it never fakes a login. |
| **Offline** | Service worker (shell + stale-while-revalidate API cache, media never cached), cold-start redirect to «موسيقاي», one-shot "connection restored" toast, graceful recovery. |
| **Diagnostics** | `/diagnostics` measures frame rate, long tasks, heap, storage, audio-engine truth vs. store, and `/api/health` probes the database plus every upstream source. |
| **Design system** | `src/app/globals.css`: 7 themes, 3 densities, premium glass surfaces, gold accents, aurora/ambient backdrops, single-direction page transitions, reduced-motion and high-refresh profiles, `data-host="android"` safe areas. |

---

## التشغيل محليًا / Run locally

```bash
npm install --ignore-scripts     # ffmpeg-static's postinstall is not needed
npm run dev                      # http://localhost:3000
```

Production:

```bash
npm run build
npm start                        # or: npm run bundle  → dist/donmuse (self-contained)
```

Environment (all optional — the app degrades honestly without them):

```bash
DATABASE_URL=local               # unset/"local" → embedded PGlite in ./data
GOOGLE_CLIENT_ID=…               # real YouTube sign-in
GOOGLE_CLIENT_SECRET=…
GOOGLE_REDIRECT_URI=https://your-domain/api/youtube/callback
YOUTUBE_API_KEY=…                # optional, unauthenticated search
NEXT_PUBLIC_API_BASE=            # only for the static Pages build
```

## GitHub Pages

`.github/workflows/pages.yml` builds the app and runs `scripts/gh-pages-export.mjs`,
which captures pre-rendered HTML for every route, rewrites asset URLs to relative
paths, adds a click interceptor so navigation is a real document load, and writes
`out/`. Publish `out/` from **Settings → Pages → GitHub Actions**.

Because Pages is static, set the repository variable `NEXT_PUBLIC_API_BASE` to the
hosted DON MUSE server (for example `https://donmuse.example.com`). The UI then calls
that server for streams, search, Quran, TV and radio. If the variable is empty the
interface clearly reports that server features need the hosted deployment instead of
showing fake results.

## Android APK

`.github/workflows/android-apk.yml` builds `debug` **and** `release` APKs and attaches
them to the rolling `apk-latest` release. Signing uses the debug keystore unless you
add `DONMUSE_KEYSTORE_B64`, `DONMUSE_STORE_PASSWORD`, `DONMUSE_KEY_ALIAS` and
`DONMUSE_KEY_PASSWORD` secrets.

Locally: `cd android && ./build-apk.sh` (JDK 17 + Android SDK 35).

The app loads the DON MUSE UI — bundled from `app/src/main/assets/www` when present,
otherwise the hosted build — and hands every platform capability to native code
through `window.DonMuseNative` (`bridge/NativeBridge.kt`): MediaStore scan, ExoPlayer
transport, app-private storage, MediaStore metadata/artwork writes, DownloadManager,
widgets, diagnostics. It is not a thin WebView wrapper: playback, notifications,
widgets, permissions and the device library are all Kotlin.

---

Developer: **Joseph M.R**
