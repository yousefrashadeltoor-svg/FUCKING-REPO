"use client";

// ============================================================================
//  Gesture-safe playback actions.
//  IMPORTANT: these must be called synchronously inside a user gesture
//  (click / tap handler). The engine's AudioContext + media element play()
//  are only allowed by the browser's autoplay policy within a gesture —
//  calling them from a useEffect (after state updates) gets blocked, which
//  was the root cause of the "click does nothing / lyrics glitch" bug.
// ============================================================================
import { getEngine } from "@/lib/audio/engine";
import { usePlayerStore } from "@/stores/player-store";
import type { TrackDTO } from "@/lib/types";
import { getTrackIdentity } from "@/lib/track-identity";

const MAJORS = new Set(["spotify", "applemusic", "deezer"]);
const resolveCache = new Map<string, string | null>();

/** Spotify / Apple Music / Deezer → same song on YouTube Music (full-length). */
async function resolveMajor(track: TrackDTO): Promise<TrackDTO> {
  if (!MAJORS.has(track.source)) return track;
  if (track.isrc?.startsWith("yt:")) return { ...track, source: "youtube", sourceId: track.isrc.slice(3) };
  const cacheKey = getTrackIdentity(track) ?? `${track.source}:${track.id}`;
  let vid = resolveCache.get(cacheKey);
  if (vid === undefined) {
    try {
      const r = await fetch(`/api/tracks/${track.id}/resolve`);
      const d = (await r.json()) as { youtubeId?: string | null };
      vid = d.youtubeId ?? null;
    } catch {
      vid = null;
    }
    resolveCache.set(cacheKey, vid);
  }
  // keep the original platform badge via `codec` = original source; play via YouTube
  return vid ? { ...track, source: "youtube", sourceId: vid, codec: track.source, isrc: `yt:${vid}` } : track;
}

export function playTrackNow(
  track: TrackDTO,
  opts?: { queue?: TrackDTO[]; index?: number },
): void {
  const engine = getEngine();
  engine.ensureContext(); // unlock audio within the gesture
  if (MAJORS.has(track.source) && !track.isrc?.startsWith("yt:")) {
    // Start the preview immediately (gesture-safe), then swap to full-length when matched.
    const store0 = usePlayerStore.getState();
    const queue0 = opts?.queue ?? [track];
    const index0 = opts?.index ?? Math.max(0, queue0.findIndex((item) => getTrackIdentity(item) === getTrackIdentity(track)));
    const selectedTrack = queue0[index0] ?? track;
    store0.playQueue(queue0, index0);
    void engine.load(selectedTrack, { autoplay: true, crossfade: false });
    void resolveMajor(track).then((full) => {
      if (full.source !== "youtube") return;
      const s = usePlayerStore.getState();
      if (getTrackIdentity(s.currentTrack) !== getTrackIdentity(track)) return; // user moved on
      const queue = s.queue.map((item) => (getTrackIdentity(item) === getTrackIdentity(track) ? full : item));
      usePlayerStore.setState({ queue, currentTrack: full });
      void engine.load(full, { autoplay: true, crossfade: false });
    });
    return;
  }
  const store = usePlayerStore.getState();
  if (opts?.queue) {
    const index =
      opts.index ?? Math.max(0, opts.queue.findIndex((item) => getTrackIdentity(item) === getTrackIdentity(track)));
    store.playQueue(opts.queue, index);
    void engine.load(opts.queue[index] ?? track, { autoplay: true, crossfade: true });
  } else {
    store.playTrack(track);
    void engine.load(track, { autoplay: true, crossfade: true });
  }
}

export function playQueueNow(queue: TrackDTO[], index: number): void {
  const engine = getEngine();
  engine.ensureContext();
  usePlayerStore.getState().playQueue(queue, index);
  const track = queue[index];
  if (track) void engine.load(track, { autoplay: true, crossfade: true });
}

export function togglePlayNow(): void {
  const engine = getEngine();
  engine.ensureContext();
  const s = usePlayerStore.getState();
  if (!s.currentTrack) return;
  const shouldPlay = !s.isPlaying;
  s.setPlaying(shouldPlay);
  if (shouldPlay) void engine.play();
  else engine.pause();
}


/** Full stop (used by the playbar stop button for radio / TV / Quran). */
export function stopNow(): void {
  const engine = getEngine();
  engine.pause();
  engine.seek(0);
  const s = usePlayerStore.getState();
  s.setPlaying(false);
  s.seek(0);
}

/** Remove the current item and release its media resource completely. */
export function clearNow(): void {
  const engine = getEngine();
  engine.stop();
  usePlayerStore.getState().clearQueue();
}
