"use client";

// ============================================================================
//  DON MUSE — playback controller
//  ---------------------------------------------------------------------------
//  A single, idempotent bridge between the engine and the Zustand store.
//  Mounted once by <Providers>. All transport actions go through here so the
//  UI, the MediaSession (notification / lock screen) and the store can never
//  disagree — the previous cause of double playback and stuck timers.
// ============================================================================

import { getEngine } from "@/lib/audio/engine";
import { usePlayerStore, trackKey, type PlayerState } from "@/stores/player-store";
import { useSettingsStore } from "@/stores/settings-store";
import { nativePlayback, isNativeHost, refreshWidgets } from "@/lib/platform/native";
import type { TrackDTO } from "@/lib/types";

let installed = false;

function describeSource(track: TrackDTO): string {
  const map: Record<string, string> = {
    youtube: "YouTube Music",
    spotify: "Spotify",
    applemusic: "Apple Music",
    deezer: "Deezer",
    audius: "Audius",
    soundcloud: "SoundCloud",
    archive: "Internet Archive",
    jamendo: "Jamendo",
    bandcamp: "Bandcamp",
    dailymotion: "Dailymotion",
    odysee: "Odysee",
    quran: "القرآن الكريم",
    radio: "Live radio",
    local: "موسيقاي · device",
    internal: "DON MUSE",
  };
  return map[track.source] ?? track.source;
}

export { describeSource };

/** Load a track into the engine (idempotent) and mirror it in the store. */
export function startTrack(track: TrackDTO, opts: { autoplay?: boolean; startAt?: number } = {}): void {
  const engine = getEngine();
  engine.ensureContext();
  const autoplay = opts.autoplay !== false;
  void engine.load(track, { autoplay, startAt: opts.startAt ?? 0 });
  if (isNativeHost()) refreshWidgets();
}

export function pauseNow(): void {
  getEngine().pause();
  usePlayerStore.getState().setPlaying(false);
}

export function resumeNow(): void {
  const s = usePlayerStore.getState();
  if (!s.currentTrack) return;
  void getEngine().play();
  usePlayerStore.getState().setPlaying(true);
}

export function toggleNow(): void {
  const s = usePlayerStore.getState();
  if (!s.currentTrack) return;
  if (s.isPlaying && getEngine().isPlaying) pauseNow();
  else resumeNow();
}

export function seekNow(sec: number): void {
  const s = usePlayerStore.getState();
  const dur = s.durationSec || s.currentTrack?.durationSec || 0;
  const clamped = Math.max(0, dur > 0 ? Math.min(sec, dur) : sec);
  getEngine().seek(clamped);
  usePlayerStore.setState({ positionSec: clamped });
}

export function nextNow(): void {
  // The store subscriber performs the single engine transition.
  usePlayerStore.getState().next();
}

export function prevNow(): void {
  const s = usePlayerStore.getState();
  const restart = s.positionSec > 3;
  s.prev();
  if (restart) {
    seekNow(0);
    return;
  }
}

/** Full stop used by the playbar X button (music · Quran · radio · TV audio). */
export function stopAllNow(): void {
  const engine = getEngine();
  engine.stop();
  if (isNativeHost()) nativePlayback.stop();
  usePlayerStore.getState().stopAll();
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = "none";
  } catch {
    /* ignore */
  }
}

/**
 * Play a list of tracks from `index`. Called synchronously inside a gesture so
 * the first samples start immediately.
 */
export function playListNow(
  tracks: TrackDTO[],
  index: number,
  origin = "list",
): void {
  const list = tracks.filter(Boolean);
  if (list.length === 0) return;
  const i = Math.max(0, Math.min(index, list.length - 1));
  const store = usePlayerStore.getState();
  // The synchronous store subscription starts the engine once, in this tap. 
  store.playQueue(list, i, origin);
  if (useSettingsStore.getState().hapticsOnTap) {
    void import("@/lib/platform/native").then((m) => m.vibrate(8));
  }
}

/** Install all engine ↔ store bindings (once per document). */
export function installPlaybackController(): () => void {
  if (installed || typeof window === "undefined") return () => {};
  installed = true;

  const engine = getEngine();
  const store = usePlayerStore;

  const offPlay = engine.on("play", () => {
    store.setState({ isPlaying: true, buffering: false, error: null });
    updateMediaSession("playing");
  });
  const offPause = engine.on("pause", () => {
    // Only mirror a pause the store didn't ask for (e.g. media controls).
    if (store.getState().isPlaying) store.setState({ isPlaying: false });
    updateMediaSession("paused");
  });
  const offBuf = engine.on("buffering", (v) => store.setState({ buffering: !!v }));
  const offTime = engine.on("timeupdate", (t) => {
    const pos = Number(t);
    if (Number.isFinite(pos)) store.setState({ positionSec: pos });
  });
  const offDur = engine.on("durationchange", (d) => {
    const dur = Number(d);
    if (Number.isFinite(dur) && dur > 0) store.setState({ durationSec: dur });
  });
  const offError = engine.on("error", (msg) => {
    const text = typeof msg === "string" ? msg : "Playback error";
    store.setState({ error: text, isPlaying: false });
    void import("sonner").then(({ toast }) => toast.error(text));
  });
  const offTrack = engine.on("trackchange", (t) => {
    const track = t as TrackDTO | undefined;
    if (track) {
      updateMediaSession("playing");
      scrobble(track, true); // new track → reset the listener clock
    }
  });
  const offEnded = engine.on("ended", () => {
    const s = store.getState();
    const settings = useSettingsStore.getState();
    if (s.repeat === "one" || s.repeatCount > 0) {
      if (s.repeatCount > 0) store.setState({ repeatCount: s.repeatCount - 1 });
      seekNow(0);
      resumeNow();
      return;
    }
    if (!settings.autoplay && s.repeat !== "all") {
      store.setState({ isPlaying: false, positionSec: 0 });
      return;
    }
    const nextIndex = s.index + 1;
    if (s.shuffle && s.queue.length > 1) {
      const idx = Math.floor(Math.random() * s.queue.length);
      const t = s.queue[idx];
      store.setState({ index: idx, currentTrack: t, isPlaying: true, positionSec: 0, durationSec: 0 });
      return;
    }
    if (nextIndex < s.queue.length) {
      const t = s.queue[nextIndex];
      store.setState({ index: nextIndex, currentTrack: t, isPlaying: true, positionSec: 0, durationSec: 0 });
      return;
    }
    if (s.repeat === "all" && s.queue.length > 0) {
      const t = s.queue[0];
      store.setState({ index: 0, currentTrack: t, isPlaying: true, positionSec: 0, durationSec: 0 });
      return;
    }
    store.setState({ isPlaying: false, positionSec: 0 });
  });

  // --- store → engine (covers MediaSession, keyboard, notifications, widgets)
  let lastKey = trackKey(store.getState().currentTrack);
  let lastPlaying = store.getState().isPlaying;

  const unsub = store.subscribe((s) => {
    const key = trackKey(s.currentTrack);
    const changedTrack = key !== lastKey;
    if (changedTrack) {
      lastKey = key;
      if (!s.currentTrack) {
        engine.stop();
      } else {
        const sameSource = trackKey(engine.currentTrack) === key;
        void engine.load(s.currentTrack, {
          autoplay: s.isPlaying,
          startAt: sameSource ? s.positionSec : 0,
        });
      }
    } else if (s.isPlaying !== lastPlaying) {
      // A new track is already loaded with its autoplay intent above. Calling
      // play/pause again here raced async native stream resolution and could
      // revive the previous player.
      if (s.isPlaying) void engine.play();
      else engine.pause();
    }
    lastPlaying = s.isPlaying;
  });

  const unsubPrefs = store.subscribe((s) => {
    engine.setVolume(s.volume);
    engine.setMuted(s.muted);
    engine.setPlaybackRate(s.playbackRate);
    engine.setEq(s.eqBands);
    engine.setBassBoost(s.bassBoost);
    engine.setPreamp(s.preamp);
    engine.setBalance(s.balance);
  });

  const unsubSettings = useSettingsStore.subscribe(() => {
    const st = useSettingsStore.getState();
    engine.setLoudnessNormalization(st.loudnessNormalization);
    // Data saver overrides the chosen quality while the user is on a metered /
    // slow connection — it is a real preference, not a decorative toggle.
    const meter = typeof navigator !== "undefined"
      ? (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
      : undefined;
    const save = st.dataSaver && (meter?.saveData !== false);
    engine.setQuality(save ? "low" : st.quality);
  });
  // Apply the current settings once, immediately.
  {
    const st = useSettingsStore.getState();
    engine.setLoudnessNormalization(st.loudnessNormalization);
    engine.setQuality(st.dataSaver ? "low" : st.quality);
  }

  // --- sleep timer
  let sleepTimer: ReturnType<typeof setTimeout> | null = null;
  const unsubSleep = store.subscribe((s, prev) => {
    if (s.sleepTimerEndsAt === prev.sleepTimerEndsAt) return;
    if (sleepTimer) clearTimeout(sleepTimer);
    if (!s.sleepTimerEndsAt) return;
    const ms = s.sleepTimerEndsAt - Date.now();
    if (ms <= 0) {
      pauseNow();
      store.setState({ sleepTimerEndsAt: null });
      return;
    }
    sleepTimer = setTimeout(() => {
      const remaining = (store.getState().sleepTimerEndsAt ?? 0) - Date.now();
      if (remaining > 2000) {
        unsubSleep();
        return;
      }
      pauseNow();
      store.setState({ sleepTimerEndsAt: null });
    }, ms);
  });

  // --- pre-buffer the next track for instant gapless starts
  const unsubPreload = store.subscribe((s, prev) => {
    if (s.index === prev.index && s.currentTrack?.id === prev.currentTrack?.id) return;
    const upNext = s.queue[s.index + 1];
    if (upNext && (upNext.source === "local" || upNext.streamUrl)) engine.preloadNext(upNext.streamUrl);
  });

  // --- Android: native state pushes (notification / lock screen / widget)
  let offNative: (() => void) | null = null;
  if (isNativeHost()) {
    offNative = nativePlayback.onState((st) => {
      // Ignore a delayed native callback after the engine has switched to the
      // official YouTube iframe or the browser audio backend.
      if (engine.backend !== "native") return;
      const cur = store.getState();
      if (!cur.currentTrack || !st.itemId) return; // ignore delayed "stopped" callbacks
      const nativeIndex = cur.queue.findIndex(
        (t) => `${t.source}:${t.sourceId ?? ""}:${t.id}` === st.itemId,
      );
      if (nativeIndex < 0) return; // stale event from a previous queue
      const nextTrack = cur.queue[nativeIndex];
      if (!nextTrack) return;
      if (nativeIndex !== cur.index) {
        engine.adoptNativeTrack(nextTrack);
        store.setState({
          index: nativeIndex,
          currentTrack: nextTrack,
          positionSec: Math.max(0, st.positionMs / 1000),
          durationSec: Math.max(0, st.durationMs / 1000),
        });
      } else {
        store.setState({
          ...(st.durationMs > 0 ? { durationSec: st.durationMs / 1000 } : {}),
          positionSec: Math.max(0, st.positionMs / 1000),
        });
      }
      if (typeof st.playing === "boolean" && st.playing !== store.getState().isPlaying) {
        store.setState({ isPlaying: st.playing });
      }
    });
  }

  // Keep the OS/notification state in sync with the store.
  const unsubMedia = store.subscribe((s) => {
    if (s.isPlaying) updateMediaSession("playing");
    else updateMediaSession("paused");
  });

  return () => {
    installed = false;
    offPlay();
    offPause();
    offBuf();
    offTime();
    offDur();
    offError();
    offTrack();
    offEnded();
    unsub();
    unsubPrefs();
    unsubSettings();
    unsubSleep();
    unsubPreload();
    unsubMedia();
    offNative?.();
    if (sleepTimer) clearTimeout(sleepTimer);
  };
}

/* ------------------------- Media Session integration ---------------------- */

function updateMediaSession(state: MediaSessionPlaybackState) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  const track = usePlayerStore.getState().currentTrack;
  if (!track) {
    try {
      navigator.mediaSession.metadata = null;
    } catch {
      /* ignore */
    }
    return;
  }
  const artwork: MediaImage[] = [];
  const cover = track.coverUrl;
  if (cover) {
    const sizes = ["96x96", "192x192", "256x256", "384x384", "512x512"];
    for (const s of sizes) artwork.push({ src: cover, sizes: s, type: cover.endsWith(".png") ? "image/png" : "image/jpeg" });
  }
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artistName,
      album: track.albumTitle ?? "DON MUSE",
      artwork,
    });
    navigator.mediaSession.playbackState = state;
  } catch {
    /* ignore */
  }
}

/** MediaSession action handlers (wired once). */
export function installMediaSessionHandlers(): () => void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return () => {};
  const map: [MediaSessionAction, MediaSessionActionHandler][] = [
    ["play", () => resumeNow()],
    ["pause", () => pauseNow()],
    ["stop", () => stopAllNow()],
    ["previoustrack", () => prevNow()],
    ["nexttrack", () => nextNow()],
    ["seekbackward", (d) => seekNow(usePlayerStore.getState().positionSec - (d?.seekOffset ?? 10))],
    ["seekforward", (d) => seekNow(usePlayerStore.getState().positionSec + (d?.seekOffset ?? 10))],
    ["seekto", (d) => {
      if (typeof d?.seekTime === "number") seekNow(d.seekTime);
    }],
  ];
  for (const [action, handler] of map) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      /* unsupported on this platform */
    }
  }
  return () => {
    for (const [action] of map) {
      try {
        navigator.mediaSession.setActionHandler(action, null);
      } catch {
        /* ignore */
      }
    }
  };
}

/* ----------------------------- scrobbling -------------------------------- */

const scrobbled = new Set<string>();

/**
 * Playback history, recorded with REAL listened time.
 *
 * The previous build had a second, duplicate scrobbler in Providers that posted
 * every 60 s forever (even while paused), and this one always reported 0 s — so
 * "minutes listened" statistics were fiction. Now there is exactly one writer and
 * it reports the seconds actually played since the last report.
 */
let lastReportAt = 0;

function scrobble(track: TrackDTO, reset = false) {
  if (!track || track.id <= 0) return;
  if (track.source === "radio" || track.source === "quran" || track.source === "local") return;
  if (reset) lastReportAt = Date.now();
  const now = Date.now();
  if (lastReportAt === 0) lastReportAt = now;
  const elapsed = Math.round((now - lastReportAt) / 1000);
  if (elapsed < 5) return;
  const seconds = Math.min(elapsed, 3600);
  lastReportAt = now;
  const key = `${track.id}:${Math.floor(now / 60_000)}`;
  if (scrobbled.has(key)) return;
  scrobbled.add(key);
  void fetch("/api/history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trackId: track.id, durationListenedSec: seconds }),
  }).catch(() => {});
}

export type { PlayerState };
