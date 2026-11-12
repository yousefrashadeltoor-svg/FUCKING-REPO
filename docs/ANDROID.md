# Android contract and device QA

## Bridge security

`MainActivity` injects a fresh random token only into the bundled main document. Every `@JavascriptInterface` call checks it against the current trusted document. Async work returns through `__donmuseNativeReply(id, ok, payload)`; state changes use `__donmuseNativeEvent(name, json)`. The UI signals `nativeReady` after installing receivers and `uiReady` after the router exists, so cold-start events/deep links are not dropped.

Main method groups:

- Platform/permissions: `platformInfo`, `diagnostics`, `hasPermission`, `permissions`, `openPermissionSettings`, `openBatterySettings`.
- Library: `scanMedia`, `pickMedia`, `pickImage`, `updateMediaMetadata`, `saveArtwork`.
- Playback: `playQueue`, `updateQueue`, `play`, `pause`, `next`, `previous`, `stopPlayback`, `seekTo`, `setVolume`, `setRate`, `setEq`, `setRepeat`, `setShuffle`, `fadeOut`, `setSleepTimer`, `playbackState`.
- Sources/downloads: `resolveStream`, `resolveFormats`, `searchMedia`, `httpJson`, `enqueueDownload`, `downloadJobs`, `downloadAction`.
- Clips: `transcodeClip`, `openLocalClip`, `deleteLocalClip`; public-device saving uses download format `local-clip`.
- Alarms/widgets/notifications: `scheduleAlarm`, `cancelAlarm`, `alarms`, `notify`, `refreshWidgets`, `pinWidget`.
- Storage/misc: `storeGet`, `storeSet`, `storeRemove`, `storeKeys`, `vibrate`, `openExternal`, `toast`.

`scripts/check-android.mjs` checks TypeScript/Kotlin method parity, manifest implementations, resources, wrapper checksums and (with `--bundle`) the actual packaged HTML/assets. It is structural; Gradle compilation and device testing remain mandatory.

## Deep links

- `donmuse://downloads`, `donmuse://alarms`, `donmuse://track/<local-id>`, `donmuse://radio?station=<id>`.
- `content://` / `file://` audio/video VIEW opens My Music with `?open=<uri>`.
- Shared links from the APK use `donmuse://`, never the private `appassets.androidplatform.net` origin.

## Manual checklist before distributing an APK

1. Install on arm64 Android 8/9, 13, 14 and 15 (or representative devices/emulators). Verify no unsupported-ABI install is offered.
2. Cold start offline: bundled UI opens, no hosted request, no automatic audio. Grant/deny audio permission and scan; pick a SAF file, restart, confirm persisted grant.
3. Play device music, Quran, radio and a supported platform track. Switch between them; only one source sounds. Lock screen, Bluetooth and notification controls match the UI.
4. Start a multi-track queue mid-list; next/previous, shuffle, repeat-one/all and queue edits behave correctly with the Activity swiped away.
5. Exercise all ten EQ bands, speed, mute/volume, sleep timer and fade. Test PCM16 and float output devices/codecs.
6. Add both widgets. Play/pause/next/previous/stop; force-stop the process and explicitly press widget play to restore the last queue.
7. Download original audio/video, an MP3/M4A/FLAC transcode and a timed clip. Confirm files appear in Music/Movies/DON MUSE and play in another app. Pause/cancel/retry; deny permission and verify a clear error.
8. Record radio, save a clip, play it through the global player, save to device, delete it, restart and verify cache/private-file cleanup.
9. Schedule an alarm one minute ahead; test lock-screen display, dismiss, snooze, weekly recurrence, reboot and timezone change. Deny exact-alarm permission and verify settings guidance.
10. Edit MediaStore metadata and embed MP3/M4 artwork with granted/denied write access. Unsupported containers must not claim success.
11. Run `:app:lintDebug`, review merged manifest/permissions, and verify release signing with the intended keystore. Never ship a DEV-SIGNED artifact as production.

OEM battery policies, DND, external CDN availability and platform anti-bot changes cannot be guaranteed by unit tests.
