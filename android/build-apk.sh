#!/usr/bin/env bash
# Build the real bundled DON MUSE APK. No hosted UI fallback.
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v java >/dev/null; then
  echo "JDK 17 is required (java was not found)." >&2; exit 1
fi
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$SDK" ] || [ ! -d "$SDK" ]; then
  echo "Set ANDROID_HOME (or ANDROID_SDK_ROOT) to an SDK containing platforms;android-35." >&2; exit 1
fi
if [ "${SKIP_WEB_BUNDLE:-0}" != "1" ]; then
  (cd .. && npm run bundle)
fi
printf 'sdk.dir=%s\n' "$SDK" > local.properties
chmod +x gradlew
TASKS=(:app:assembleDebug :app:lintDebug)
if [ "${BUILD_RELEASE:-0}" = "1" ]; then TASKS+=(:app:assembleRelease); fi
./gradlew "${TASKS[@]}" --no-daemon --stacktrace
echo "Debug APK: $PWD/app/build/outputs/apk/debug/app-debug.apk"
if [ "${BUILD_RELEASE:-0}" = "1" ]; then
  echo "Release APK: $PWD/app/build/outputs/apk/release/app-release.apk"
  if [ -z "${DONMUSE_KEYSTORE:-}" ]; then echo "WARNING: release is DEV-SIGNED with the debug key, not a production signature." >&2; fi
fi
