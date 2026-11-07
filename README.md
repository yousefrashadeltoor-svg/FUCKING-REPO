# DON MUSE

DON MUSE is a cross-platform media application with a Next.js web client and a native Android client.

## Project structure

- `src/` — Next.js application, server APIs, shared browser player, pages and stores.
- `android/` — native Android app, Jetpack Compose UI, Media3 background playback service and widgets.
- `public/` — static web assets and service worker.

## Development

- Node.js 22+
- Java 17
- Android SDK / Gradle for Android builds

```bash
npm install
npm run typecheck
npm run lint
npm run build
```

Android debug APK:

```bash
cd android
./gradlew :app:assembleDebug
```

## CI

GitHub Actions runs the web checks and Android debug APK build for pushes to `main`.
The build workflow uploads the APK and any captured diagnostic logs as workflow artifacts.

## Deployment

The web app includes Next.js server routes and therefore needs a Node.js-capable host. A static-only GitHub Pages export is not a full deployment target for the current project.
