import { localFetch } from "@/lib/local/client";

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
  const s = usePlayerStore.getState();
  s.next();
  const t = usePlayerStore.getState().currentTrack;
  if (t) startTrack(t);
}

export function prevNow(): void {
  const s = usePlayerStore.getState();
  const restart = s.positionSec > 3;
  s.prev();
  if (restart) {
    seekNow(0);
    return;
  }
  const t = usePlayerStore.getState().currentTrack;
  if (t) startTrack(t);
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
  const track = list[i];
  const store = usePlayerStore.getState();
  store.playQueue(list, i, origin);
  startTrack(track);
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
      scrobble(track);
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
      store.setState({ index: idx, currentTrack: t, isPlaying: true, positionSec: 0 });
      if (t) startTrack(t);
      return;
    }
    if (nextIndex < s.queue.length) {
      const t = s.queue[nextIndex];
      store.setState({ index: nextIndex, currentTrack: t, isPlaying: true, positionSec: 0 });
      if (t) startTrack(t);
      return;
    }
    if (s.repeat === "all" && s.queue.length > 0) {
      const t = s.queue[0];
      store.setState({ index: 0, currentTrack: t, isPlaying: true, positionSec: 0 });
      if (t) startTrack(t);
      return;
    }
    store.setState({ isPlaying: false, positionSec: 0 });
  });

  // --- store → engine. Native pushes are observations, not new play commands.
  let lastKey = trackKey(store.getState().currentTrack);
  let lastPlaying = store.getState().isPlaying;
  let applyingNative = false;

  const unsub = store.subscribe((s) => {
    const key = trackKey(s.currentTrack);
    const changed = key !== lastKey;
    const playChanged = s.isPlaying !== lastPlaying;
    lastKey = key;
    lastPlaying = s.isPlaying;
    if (applyingNative) return;
    if (changed) {
      if (!s.currentTrack) engine.stop();
      else void engine.load(s.currentTrack, { autoplay: s.isPlaying, startAt: 0 });
    }
    if (playChanged) {
      if (s.isPlaying) void engine.play();
      else engine.pause();
    }
  });

  const unsubPrefs = store.subscribe((s, prev) => {
    engine.setVolume(s.volume);
    engine.setMuted(s.muted);
    engine.setPlaybackRate(s.playbackRate);
    engine.setEq(s.eqBands);
    if (isNativeHost()) {
      if (s.repeat !== prev.repeat) nativePlayback.setRepeat(s.repeat);
      if (s.shuffle !== prev.shuffle) nativePlayback.setShuffle(s.shuffle);
      if (s.eqBands !== prev.eqBands) nativePlayback.setEq(s.eqBands);
      if (s.queue !== prev.queue && trackKey(s.currentTrack) === trackKey(prev.currentTrack)) engine.syncNativeQueue();
    }
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
    if (isNativeHost()) nativePlayback.setSleepTimer(s.sleepTimerEndsAt ? Math.max(0, s.sleepTimerEndsAt - Date.now()) : 0);
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
    nativePlayback.refresh();
    offNative = nativePlayback.onState((st) => {
      const cur = store.getState();
      const patch: Partial<PlayerState> = {
        positionSec: st.positionMs / 1000,
        isPlaying: st.playing,
        buffering: st.buffering,
        error: st.error ?? null,
      };
      if (st.durationMs > 0) patch.durationSec = st.durationMs / 1000;
      if (st.itemId && st.itemId !== String(cur.currentTrack?.id) && st.track) {
        const index = cur.queue.findIndex(t => String(t.id) === st.itemId);
        patch.currentTrack = st.track;
        patch.index = index >= 0 ? index : 0;
        if (index < 0) patch.queue = [st.track];
      }
      if (!st.itemId && st.ended) patch.isPlaying = false;
      applyingNative = true;
      try { store.setState(patch); } finally { applyingNative = false; }
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

function scrobble(track: TrackDTO) {
  if (!track || track.id <= 0) return;
  if (track.source === "radio" || track.source === "quran" || track.source === "local") return;
  const key = `${track.id}:${Math.floor(Date.now() / 60_000)}`;
  if (scrobbled.has(key)) return;
  scrobbled.add(key);
  void localFetch("/api/history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trackId: track.id, durationListenedSec: 0 }),
  }).catch(() => {});
}

export type { PlayerState };
