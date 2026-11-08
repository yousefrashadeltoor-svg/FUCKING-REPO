# DON MUSE — provider comparison & selection record

Every content source the app can show, judged on the same axes. The registry in
`src/lib/server/providers.ts` is the source of truth; this table is its human
readable twin. Playback rights live in `src/lib/playback-policy.ts`.

Legend — **Mode**: `embed` = must be played by the provider's own player,
`direct` = we stream the media file, `link` = we only link out.
**BG** = background playback allowed. **DL** = downloading allowed.

| Provider | Licence / terms | Needs | Self-host | Limit / quota | Mode | BG | DL | Strengths | Weaknesses | Why chosen | Test result (this sandbox) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **YouTube / YouTube Music** | proprietary platform; official public APIs | `YOUTUBE_API_KEY` (search) + OAuth client (account actions) | no | Data API 10 000 units/day; search = 100 units | embed | no | no | Full catalogue, official metadata, real comments/subscriptions/likes/uploads | No background audio, no downloads, embed only, quota-bound | Default catalogue; the only compliant way to play YouTube | `YOUTUBE_API_KEY` unset here → API returns `configured:false`; route logic type-checks and builds |
| **Audius** | open protocol, MIT clients, free API | optional `AUDIUS_API_KEY` | yes | public API, no hard quota | direct | yes | yes | Full-length CC audio, artwork, works keyless | Smaller catalogue, electronic-heavy | Best keyless full-length source, our main non-YouTube fallback | reachable (`api.audius.co` → 200 in earlier runs) |
| **Jamendo** | Creative Commons catalogue, commercial API terms | `JAMENDO_CLIENT_ID` | no | hourly client quota | direct | yes | yes | Legal full-length MP3 downloads | Needs a key; indie catalogue only | The honest "download" source | unconfigured (no key in this sandbox) |
| **Internet Archive** | item-level licences, open archive | none | yes | polite use | direct | yes | yes | No key, public-domain audio, stable URLs | Metadata quality varies | Reliable keyless fallback | reachable |
| **SoundCloud** | proprietary; public pages | none | no | rate-limited | direct | yes | **no** | Underground/indie catalogue | No official public API for streaming; ToS restrict downloads | Included for discovery, download disabled by policy | not probed (no key path) |
| **Bandcamp** | proprietary, artist-owned | none | no | – | link | n/a | no | Direct artist support | No playback rights for us | Link-out only: we never rip artist uploads | n/a (link-out) |
| **Deezer** | proprietary, official public API | none | no | 50 req / 5 s | embed (30 s preview) | no | no | Best public metadata + official previews | 30 s preview only | Chart/metadata enrichment | reachable (`api.deezer.com`) |
| **MusicBrainz** | CC0 / CC BY-NC-SA data | none (User-Agent required) | yes | 1 req/s | – | – | – | Canonical artist/album identifiers | No audio | Planned metadata authority | reachable |
| **ListenBrainz** | GPL-2.0 server, open API | `LISTENBRAINZ_TOKEN` | yes | 30 req/min | – | – | – | Open, exportable listening stats | Needs user token | OSS alternative to closed analytics | unconfigured (no token) |
| **Radio Browser** | community directory, public API | none | yes | polite use | direct | yes | no | 30k+ real stations, no tracking | Streams die often; ICY quirks | Only sane free radio directory | reachable (`de1.api.radio-browser.info`) |
| **Quran.com / EveryAyah** | open recitation archives | none | yes | polite use | direct | yes | yes | Complete verified recitations, verse timings | Fixed reciter list | Religious content source | reachable (`api.quran.com`) |
| **On-device library (MediaStore)** | the user's own files | Android runtime media permission | n/a | device-bound | direct | yes | n/a | Works offline, zero copies, no blanket storage access | Android only | The only compliant device-library source | Kotlin path is CI-verified only (no Gradle here) |

## Rules that fell out of this comparison

1. **No extraction, ever, for YouTube.** `ytdlp.ts` refuses YouTube hosts; the
   stream/download/format/clip routes answer with policy JSON instead.
2. **No InnerTube.** The undocumented `youtubei.js` client was removed
   (`src/lib/server/youtube-data.ts` replaces it with Data API v3).
3. **Downloads only where the licence allows** (Audius, Jamendo, Archive, Quran,
   the user's own files) — enforced in the UI *and* in the routes.
4. **Background playback never applies to embedded providers**; ExoPlayer refuses
   YouTube content by policy.
5. **Every provider is health-probed** (`/api/providers`) with a cached result,
   exponential backoff, and an ordered fallback chain.

## Local verification

```
npx tsc --noEmit         → 0 errors
npx eslint .             → 0 errors (4 warnings)
npx next build           → success
npm test                 → SSRF guard: 14/14 checks
node scripts/gh-pages-export.mjs → 69 files, 3.2 MB static bundle
```

Network egress from this sandbox is limited, so provider probes were only
partially exercised here; `/api/providers` reports their real state at runtime.
