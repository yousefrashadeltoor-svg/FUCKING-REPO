# Architecture and data ownership

## One UI, two runtimes

The application is a Vite SPA. In a browser it uses web platform APIs. In the APK the exact compiled UI is packaged under `android/app/src/main/assets/www` and served by `WebViewAssetLoader` on a fixed local HTTPS origin. Kotlin owns capabilities that a WebView cannot reliably provide: background playback, MediaSession, MediaStore/SAF, downloads, FFmpeg, alarms and widgets.

There is no application backend, SQL database, OAuth server, analytics collector or hosted fallback. Legacy `/api/...` strings are dispatched in-process by `src/lib/local/client.ts` for compatibility with existing screens.

## Playback authority

- `engine.ts` selects exactly one backend and invalidates stale loads.
- `controller.ts` mirrors real engine events into the player store and sends user intent back once.
- On Android, `NativePlayer` owns ExoPlayer on the main looper. The UI receives snapshots; notification/widget actions do not create a second player.
- Queues carry stable IDs and track DTOs. Platform-page URLs use `donmuse-resolve:` and are resolved lazily by Kotlin, so next/previous can work without the WebView.
- Queue edits use `updateQueue` and preserve the current item's position when possible.
- Cold start restores selection/preferences but never starts audio automatically.

## Storage keys

| Key | Owner / content |
|---|---|
| `aura-settings` v2 | theme, density, wallpaper, playback/AI preferences |
| `aura-player` v2 | queue selection, likes, EQ, volume; no cold-start autoplay |
| `donmuse.local.v1` | remembered tracks/artists/playlists/history metadata |
| `donmuse.device.library` | device-library metadata and grants where serializable |
| `donmuse.downloads.v1` | UI download queue mirror |
| `donmuse.native.downloads.v1` | authoritative Kotlin download jobs |
| `donmuse.alarms.v1` | Kotlin alarm definitions |
| `donmuse.lastQueue` | explicit widget restore payload |
| `dm:donmuse.clips` + `donmuse-clips-v1` | clip metadata + audio blobs |

Android mirrors small KV values into `filesDir/donmuse-store.json` through one synchronized, atomic writer. Browser localStorage uses the `dm:` prefix. Audio files are not stuffed into KV: device files stay at their content/file URIs; browser clips/downloads use Cache Storage; native private clip playback copies to `filesDir/clips`.

## Network boundaries

Public upstream requests are explicit. Kotlin validates URL scheme and every resolved DNS address, including redirects, against loopback/private/link-local ranges. Cookie/authorization headers are not accepted from the UI bridge. JSON responses are capped; media downloads stream to disk. Remote pages cannot obtain the native capability token.

## Failure semantics

Unsupported DRM/login sources, unavailable CDNs, denied permissions, failed FFmpeg conversions and non-writable SAF files produce visible errors. Estimated sizes/bitrates are labelled estimates. Unknown play counts/BPM/energy are not fabricated. Lossless conversion changes the container/codec but cannot restore detail missing from a lossy source.
