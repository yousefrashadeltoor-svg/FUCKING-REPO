# DON MUSE for Android

Kotlin native capabilities around a **bundled** React UI. This is a hybrid app, not a hosted-site wrapper and not a Compose UI.

## Build from the repository root

```bash
npm ci --ignore-scripts
npm run bundle
cd android
./build-apk.sh
```

Requirements: JDK 17, Android SDK 35, Gradle wrapper 8.7 (included). The Gradle `requireBundledUi` task fails if `app/src/main/assets/www/index.html` or `native-bootstrap.js` is missing. There is no remote fallback.

- Package: `fm.donmuse.app`
- Version: `3.0.0` (30)
- minSdk 26; compile/targetSdk 35
- ABIs: arm64-v8a, x86_64
- UI origin: `https://appassets.androidplatform.net/assets/www/` via `WebViewAssetLoader`
- Router basename in APK: `/assets/www`; Vite assets are relative (`--mode android`)

## Native modules

- `playback/`: Media3 1.4.1 ExoPlayer, MediaSessionService, MediaStyle notification, lazy source resolution, audio focus, 10-band PCM EQ, repeat/shuffle/sleep/fade.
- `download/`: two streaming workers, FFmpeg conversion/clipping, scoped MediaStore publication (legacy permission only on API 26–28), persistent job state.
- `alarms/`: exact AlarmClock scheduling, full-screen alarm UI, system ringtone, snooze and weekly recurrence.
- `widget/`: 4×2 and 4×1 RemoteViews providers. Controls use broadcasts; only an explicit play/restore starts the foreground service.
- `bridge/`: per-document random capability, async replies/events, atomic app-private JSON storage.
- `data/`: OkHttp with private-address DNS guard, NewPipeExtractor, MediaStore/SAF scanning, local FFmpeg helpers.

## Signing

Release uses `DONMUSE_KEYSTORE`, `DONMUSE_STORE_PASSWORD`, `DONMUSE_KEY_ALIAS`, `DONMUSE_KEY_PASSWORD` when provided. Otherwise it is explicitly a **debug-signed development build**. CI decodes `DONMUSE_KEYSTORE_B64` before invoking Gradle and labels unsigned-production artifacts `DEV-SIGNED`.

See `../docs/ANDROID.md` for the bridge contract and device QA checklist. Do not commit `local.properties`, keystores, or generated `assets/www`.
