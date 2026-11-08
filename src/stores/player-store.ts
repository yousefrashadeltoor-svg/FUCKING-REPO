// DON MUSE — global player state (Zustand + platform persistence).
// Queue, current track, transport, likes and audio preferences live here.
// The engine is the single source of truth for *audible* state; this store
// mirrors it (position / duration / playing) and holds user intent.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { platformStorage } from "@/lib/storage";
import type { TrackDTO } from "@/lib/types";

export type RepeatMode = "off" | "all" | "one";

export interface PlayerState {
  // --- transport ---
  currentTrack: TrackDTO | null;
  queue: TrackDTO[];
  index: number; // index of currentTrack inside queue (-1 = none)
  isPlaying: boolean;
  buffering: boolean;
  error: string | null;
  positionSec: number;
  durationSec: number;
  volume: number; // 0..1
  muted: boolean;
  playbackRate: number;
  shuffle: boolean;
  repeat: RepeatMode;
  repeatCount: number;
  /** where playback started, drives the badge in the playbar */
  origin: string | null;
  // --- audio prefs ---
  crossfadeSec: number;
  eqBands: number[];
  /** extra low-shelf boost in dB (-12…+12) on top of the 10 bands */
  bassBoost: number;
  /** master pre-amp gain in dB (-12…+12); lets a boosted EQ avoid clipping */
  preamp: number;
  /** stereo balance, -1 = hard left … +1 = hard right */
  balance: number;
  // --- sleep timer ---
  sleepTimerEndsAt: number | null;
  // --- library ---
  likedIds: number[];
  // --- actions ---
  playTrack: (track: TrackDTO, opts?: { queue?: TrackDTO[]; index?: number; autoplay?: boolean; origin?: string }) => void;
  playQueue: (queue: TrackDTO[], index: number, origin?: string) => void;
  togglePlay: () => void;
  setPlaying: (playing: boolean) => void;
  setBuffering: (buffering: boolean) => void;
  setError: (message: string | null) => void;
  next: () => void;
  prev: () => void;
  seek: (sec: number) => void;
  setPosition: (sec: number) => void;
  setDuration: (sec: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  setPlaybackRate: (r: number) => void;
  setShuffle: (s: boolean) => void;
  setRepeat: (r: RepeatMode) => void;
  setRepeatMode: (r: RepeatMode) => void;
  setRepeatCount: (n: number) => void;
  setCrossfade: (sec: number) => void;
  setEqBands: (bands: number[]) => void;
  setBassBoost: (db: number) => void;
  setPreamp: (db: number) => void;
  setBalance: (v: number) => void;
  setEqBand: (i: number, db: number) => void;
  setSleepTimer: (msFromNow: number | null) => void;
  addToQueue: (track: TrackDTO) => void;
  playNext: (track: TrackDTO) => void;
  removeFromQueue: (i: number) => void;
  moveInQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  /** X button / full stop — clears the player completely (music, Quran, radio). */
  stopAll: () => void;
  toggleLike: (trackId: number) => void;
  setLiked: (trackId: number, liked: boolean) => void;
  hydrateLikes: (ids: number[]) => void;
}

const EQ_DEFAULT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

/** Stable identity for a playable source (used to avoid restarting a track). */
export function trackKey(t: TrackDTO | null | undefined): string {
  if (!t) return "";
  return `${t.source}:${t.sourceId ?? ""}:${t.id}`;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      currentTrack: null,
      queue: [],
      index: -1,
      isPlaying: false,
      buffering: false,
      error: null,
      positionSec: 0,
      durationSec: 0,
      volume: 0.85,
      muted: false,
      playbackRate: 1,
      shuffle: false,
      repeat: "off",
      repeatCount: 0,
      origin: null,
      crossfadeSec: 0,
      eqBands: EQ_DEFAULT,
      bassBoost: 0,
      preamp: 0,
      balance: 0,
      sleepTimerEndsAt: null,
      likedIds: [],

      playTrack: (track, opts) => {
        const state = get();
        if (opts?.queue && opts.queue.length > 0) {
          const index = Math.max(
            0,
            opts.index ?? opts.queue.findIndex((t) => trackKey(t) === trackKey(track)),
          );
          set({
            queue: opts.queue,
            index,
            currentTrack: opts.queue[index] ?? track,
            isPlaying: opts.autoplay !== false,
            positionSec: 0,
            durationSec: 0,
            error: null,
            origin: opts.origin ?? state.origin,
          });
          return;
        }
        // Not in a queue context: start a fresh single-track queue unless the
        // current queue already contains it (then just jump to it).
        const existing = state.queue.findIndex((t) => trackKey(t) === trackKey(track));
        if (existing >= 0) {
          set({
            index: existing,
            currentTrack: state.queue[existing],
            isPlaying: opts?.autoplay !== false,
            positionSec: 0,
            error: null,
          });
        } else {
          set({
            queue: [track],
            index: 0,
            currentTrack: track,
            isPlaying: opts?.autoplay !== false,
            positionSec: 0,
            durationSec: 0,
            error: null,
            origin: opts?.origin ?? state.origin,
          });
        }
      },

      playQueue: (queue, index, origin) =>
        set({
          queue,
          index,
          currentTrack: queue[index] ?? null,
          isPlaying: true,
          positionSec: 0,
          durationSec: 0,
          error: null,
          ...(origin ? { origin } : {}),
        }),

      togglePlay: () => set((s) => ({ isPlaying: s.currentTrack ? !s.isPlaying : false })),
      setPlaying: (isPlaying) => set({ isPlaying }),
      setBuffering: (buffering) => set({ buffering }),
      setError: (error) => set({ error }),

      next: () => {
        const { queue, index, repeat, shuffle, repeatCount } = get();
        if (queue.length === 0) return;
        if (repeatCount > 0) {
          set({ positionSec: 0, repeatCount: repeatCount - 1 });
          return;
        }
        if (repeat === "one") {
          set({ positionSec: 0 });
          return;
        }
        let nextIndex: number;
        if (shuffle) {
          nextIndex = queue.length > 1 ? Math.floor(Math.random() * queue.length) : index + 1;
          if (nextIndex === index) nextIndex = (index + 1) % queue.length;
        } else {
          nextIndex = index + 1;
        }
        if (nextIndex >= queue.length) {
          if (repeat === "all") nextIndex = 0;
          else {
            set({ isPlaying: false, positionSec: 0 });
            return;
          }
        }
        set({ index: nextIndex, currentTrack: queue[nextIndex], isPlaying: true, positionSec: 0 });
      },

      prev: () => {
        const { queue, index, positionSec, repeat } = get();
        if (queue.length === 0) return;
        if (positionSec > 3) {
          set({ positionSec: 0 });
          return;
        }
        const prevIndex = index - 1 < 0 ? (repeat === "all" ? queue.length - 1 : 0) : index - 1;
        set({ index: prevIndex, currentTrack: queue[prevIndex], isPlaying: true, positionSec: 0 });
      },

      seek: (sec) => set({ positionSec: Math.max(0, sec) }),
      setPosition: (positionSec) => set({ positionSec: Math.max(0, positionSec) }),
      setDuration: (durationSec) => set({ durationSec: Math.max(0, durationSec) }),
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)), muted: false }),
      toggleMute: () => set((s) => ({ muted: !s.muted })),
      setPlaybackRate: (playbackRate) => set({ playbackRate }),
      setShuffle: (shuffle) => set({ shuffle }),
      setRepeat: (repeat) =>
        set({ repeat: repeat === "off" ? "all" : repeat === "all" ? "one" : "off", repeatCount: 0 }),
      setRepeatMode: (repeat) => set({ repeat, repeatCount: 0 }),
      setRepeatCount: (n) =>
        set({ repeatCount: Math.max(0, Math.min(99, Math.round(n))), repeat: n > 0 ? "off" : get().repeat }),
      setCrossfade: (crossfadeSec) => set({ crossfadeSec: Math.min(15, Math.max(0, crossfadeSec)) }),
      setEqBands: (eqBands) => set({ eqBands }),
      setEqBand: (i, db) =>
        set((s) => {
          const eqBands = [...s.eqBands];
          eqBands[i] = Math.min(12, Math.max(-12, db));
          return { eqBands };
        }),
      setBassBoost: (db) => set({ bassBoost: Math.min(12, Math.max(-12, db)) }),
      setPreamp: (db) => set({ preamp: Math.min(12, Math.max(-12, db)) }),
      setBalance: (v) => set({ balance: Math.min(1, Math.max(-1, v)) }),
      setSleepTimer: (msFromNow) =>
        set({ sleepTimerEndsAt: msFromNow === null ? null : Date.now() + msFromNow }),

      addToQueue: (track) =>
        set((s) => (s.queue.some((t) => trackKey(t) === trackKey(track)) ? s : { queue: [...s.queue, track] })),
      playNext: (track) =>
        set((s) => {
          if (s.queue.some((t) => trackKey(t) === trackKey(track))) return s;
          const queue = [...s.queue];
          queue.splice(s.index + 1, 0, track);
          return { queue };
        }),
      removeFromQueue: (i) =>
        set((s) => {
          const queue = s.queue.filter((_, idx) => idx !== i);
          let index = s.index;
          if (i < s.index) index -= 1;
          else if (i === s.index) index = Math.min(s.index, queue.length - 1);
          return { queue, index, currentTrack: queue[index] ?? null };
        }),
      moveInQueue: (from, to) =>
        set((s) => {
          const queue = [...s.queue];
          const [item] = queue.splice(from, 1);
          if (!item) return s;
          queue.splice(to, 0, item);
          let index = s.index;
          if (from === s.index) index = to;
          else if (from < s.index && to >= s.index) index -= 1;
          else if (from > s.index && to <= s.index) index += 1;
          return { queue, index };
        }),
      clearQueue: () =>
        set({ queue: [], index: -1, currentTrack: null, isPlaying: false, positionSec: 0, durationSec: 0 }),

      stopAll: () =>
        set({
          isPlaying: false,
          positionSec: 0,
          durationSec: 0,
          currentTrack: null,
          queue: [],
          index: -1,
          buffering: false,
          error: null,
          origin: null,
          sleepTimerEndsAt: null,
        }),

      toggleLike: (trackId) =>
        set((s) => ({
          likedIds: s.likedIds.includes(trackId)
            ? s.likedIds.filter((id) => id !== trackId)
            : [...s.likedIds, trackId],
        })),
      setLiked: (trackId, liked) =>
        set((s) => ({
          likedIds: liked
            ? s.likedIds.includes(trackId)
              ? s.likedIds
              : [...s.likedIds, trackId]
            : s.likedIds.filter((id) => id !== trackId),
        })),
      hydrateLikes: (ids) => set({ likedIds: ids }),
    }),
    {
      name: "aura-player",
      version: 2,
      storage: createJSONStorage(() => platformStorage),
      partialize: (s) => ({
        queue: s.queue,
        index: s.index,
        volume: s.volume,
        muted: s.muted,
        playbackRate: s.playbackRate,
        shuffle: s.shuffle,
        repeat: s.repeat,
        crossfadeSec: s.crossfadeSec,
        eqBands: s.eqBands,
        bassBoost: s.bassBoost,
        preamp: s.preamp,
        balance: s.balance,
        likedIds: s.likedIds,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PlayerState>;
        const queue = Array.isArray(p.queue) ? p.queue : [];
        const index = typeof p.index === "number" ? Math.min(Math.max(p.index, 0), Math.max(queue.length - 1, 0)) : -1;
        return {
          ...current,
          ...p,
          queue,
          index,
          // restore the selection but never auto-resume audio on cold start
          currentTrack: index >= 0 ? queue[index] ?? null : null,
          isPlaying: false,
          buffering: false,
          error: null,
          positionSec: 0,
          durationSec: 0,
          sleepTimerEndsAt: null,
        };
      },
    },
  ),
);
