#!/usr/bin/env bash
# DON MUSE — build a real Android APK.
# Requirements: JDK 17 + Android SDK (platform 34, build-tools 34.0.0).
#   export ANDROID_HOME=$HOME/Android/Sdk
#   ./build-apk.sh            → app/build/outputs/apk/debug/app-debug.apk
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v java >/dev/null; then
  echo "✗ JDK 17 is required. Install it (e.g. sudo apt install openjdk-17-jdk) and retry."; exit 1
fi
if [ -z "${ANDROID_HOME:-}" ]; then
  echo "✗ ANDROID_HOME is not set (Android SDK with platform 34 + build-tools 34.0.0)."; exit 1
fi
echo "sdk.dir=$ANDROID_HOME" > local.properties
chmod +x gradlew 2>/dev/null || true
if [ ! -x gradlew ]; then
  if command -v gradle >/dev/null; then gradle wrapper --gradle-version 8.7; else
    echo "✗ Gradle not found. Install Gradle 8.7 or add the Gradle wrapper (gradle wrapper)."; exit 1
  fi
fi
./gradlew :app:assembleDebug --no-daemon
echo "✓ APK: $(pwd)/app/build/outputs/apk/debug/app-debug.apk"
