# DON MUSE — native Android app (Kotlin)

A **real native Android application** (not a WebView wrapper). Everything below runs on-device.

## What's inside
| Feature | Implementation |
|---|---|
| Browse & play **device music offline** | `MediaStore` scan (`data/DeviceMusic.kt`) + Media3 ExoPlayer |
| Background playback + **real notification** with actions | `playback/PlaybackService.kt` (MediaSessionService, MediaStyle) |
| **Widgets** with full controls (prev / play-pause / next / stop) | `widget/NowPlayingWidget.kt` (4×2) + `widget/MiniPlayerWidget.kt` (4×1) + `res/layout/widget_*.xml` |
| **New-release / followed-artist notifications** | `notify/ReleaseCheckWorker.kt` (WorkManager, every 6h) + `BootReceiver` |
| **Real permissions** | `READ_MEDIA_AUDIO`, `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `WAKE_LOCK`, `RECEIVE_BOOT_COMPLETED` |
| Quran (complete surahs) + Egyptian radio | pulls `/api/quran`, `/api/radio` from the DON MUSE server |
| Deep links `donmuse://track/ID` and `https://donmuse.app/track/ID` | manifest intent filters |
| Offline-first UI | Compose UI is fully local; only streaming/search need network |

## Build the APK
```bash
# 1) prerequisites: JDK 17 + Android SDK (platform 34, build-tools 34.0.0)
export ANDROID_HOME=$HOME/Android/Sdk
cd android && ./build-apk.sh
#    → app/build/outputs/apk/debug/app-debug.apk
```
Or push to GitHub — `.github/workflows/android-apk.yml` builds the APK and uploads it as an artifact.

Point the app at your DON MUSE server (default `https://donmuse.app`) in
`DonMuseApp.kt → API_BASE`, then rebuild.

Developer: **Joseph M.R**
