"use client";

// ============================================================================
//  Gesture-safe playback actions.
//  These must be called synchronously from a click/tap handler: the engine
//  starts buffering + playing inside that gesture, so the very first samples
//  arrive without waiting for React to re-render. Everything else (queue,
//  current track, metadata) is mirrored by the controller.
// ============================================================================
import { getEngine } from "@/lib/audio/engine";
import { externalFallback, policyFor } from "@/lib/playback-policy";
import { toast } from "sonner";
import { usePlayerStore, trackKey } from "@/stores/player-store";
import { playListNow, toggleNow, stopAllNow, prevNow, nextNow } from "@/lib/audio/controller";
import type { TrackDTO } from "@/lib/types";

const MAJORS = new Set(["spotify", "applemusic", "deezer"]);
const resolveCache = new Map<number, string | null>();

/** Spotify / Apple Music / Deezer → the same song on YouTube Music. */
async function resolveMajor(track: TrackDTO): Promise<TrackDTO> {
  if (!MAJORS.has(track.source)) return track;
  if (track.isrc?.startsWith("yt:")) return { ...track, source: "youtube", sourceId: track.isrc.slice(3) };
  let vid = resolveCache.get(track.id);
  if (vid === undefined) {
    try {
      const r = await fetch(`/api/tracks/${track.id}/resolve`);
      const d = (await r.json()) as { youtubeId?: string | null };
      vid = d.youtubeId ?? null;
    } catch {
      vid = null;
    }
    resolveCache.set(track.id, vid);
  }
  return vid
    ? { ...track, source: "youtube", sourceId: vid, codec: track.source, isrc: `yt:${vid}` }
    : track;
}

/** Reason a track could not be played, for an honest toast instead of silence. */
function linkOut(track: TrackDTO): void {
  const policy = policyFor(track.source);
  const url = externalFallback(track.source, track.sourceId) ?? null;
  if (url && typeof window !== "undefined") window.open(url, "_blank", "noopener");
  toast(policy.note);
}

export function playTrackNow(
  track: TrackDTO,
  opts?: { queue?: TrackDTO[]; index?: number; origin?: string },
): void {
  // Providers that only allow linking (Bandcamp and friends) must never look
  // like a broken player: we open their official page instead.
  if (policyFor(track.source).mode === "link-out") {
    linkOut(track);
    return;
  }
  const engine = getEngine();
  engine.ensureContext(); // unlock WebAudio inside the gesture

  const store = usePlayerStore.getState();
  const queue = opts?.queue && opts.queue.length > 0 ? opts.queue : null;
  const index = queue ? Math.max(0, opts?.index ?? queue.findIndex((t) => trackKey(t) === trackKey(track))) : -1;

  if (queue && index >= 0) {
    // Starting the same track that is already playing inside this queue → toggle.
    const playing = store.currentTrack && trackKey(store.currentTrack) === trackKey(queue[index]) && store.isPlaying;
    if (playing) {
      toggleNow();
      return;
    }
    store.playQueue(queue, index, opts?.origin);
    return;
  }

  const existing = store.queue.findIndex((t) => trackKey(t) === trackKey(track));
  if (existing >= 0) {
    if (trackKey(store.currentTrack) === trackKey(track) && store.isPlaying) {
      toggleNow();
      return;
    }
    if (trackKey(store.currentTrack) === trackKey(track)) {
      usePlayerStore.setState({ index: existing, isPlaying: true });
      return;
    }
    usePlayerStore.setState({ index: existing, currentTrack: store.queue[existing], isPlaying: true, positionSec: 0, durationSec: 0, error: null });
    return;
  }

  store.playTrack(track, { origin: opts?.origin });

  // Major platforms: start immediately (preview/proxy), then swap to the
  // full-length YouTube match when the resolver answers.
  if (MAJORS.has(track.source) && !track.isrc?.startsWith("yt:")) {
    void resolveMajor(track).then((full) => {
      if (full.source !== "youtube") return;
      const s = usePlayerStore.getState();
      if (trackKey(s.currentTrack) !== trackKey(track)) return; // user moved on
      const q = s.queue.map((x) => (trackKey(x) === trackKey(track) ? full : x));
      usePlayerStore.setState({ queue: q, currentTrack: full });
    });
    return;
  }

}

export function playQueueNow(queue: TrackDTO[], index: number, origin = "list"): void {
  playListNow(queue, index, origin);
}

export function togglePlayNow(): void {
  toggleNow();
}

export function stopNow(): void {
  stopAllNow();
}

export { prevNow, nextNow };
