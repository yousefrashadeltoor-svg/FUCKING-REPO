"use client";

// ============================================================================
//  NativeBridgeInit — boots the Android host integration (no-op on the web).
//  • requests media + notification permissions on first launch
//  • pushes engine settings into the native player
//  • keeps widgets / notification metadata in sync with the current track
// ============================================================================
import { useEffect } from "react";
import {
  isNativeHost,
  nativePlayback,
  refreshWidgets,
  requestMediaPermissions,
} from "@/lib/platform/native";
import { usePlayerStore } from "@/stores/player-store";
import { useSettingsStore } from "@/stores/settings-store";

let booted = false;

export function NativeBridgeInit() {
  useEffect(() => {
    if (!isNativeHost() || booted) return;
    booted = true;

    // Permission prompts (Android 13+ media + notifications).
    requestMediaPermissions(["audio", "video", "notifications"]);

    const s = usePlayerStore.getState();
    nativePlayback.setVolume(s.muted ? 0 : s.volume);

    const unsub = usePlayerStore.subscribe((state, prev) => {
      if (state.currentTrack?.id !== prev.currentTrack?.id) refreshWidgets();
      if (state.volume !== prev.volume || state.muted !== prev.muted) {
        nativePlayback.setVolume(state.muted ? 0 : state.volume);
      }
      if (state.playbackRate !== prev.playbackRate) nativePlayback.setRate(state.playbackRate);
    });

    const unsubSettings = useSettingsStore.subscribe(() => {
      const st = useSettingsStore.getState();
      if (!st.backgroundPlayback) nativePlayback.stop();
    });

    return () => {
      unsub();
      unsubSettings();
    };
  }, []);

  return null;
}
