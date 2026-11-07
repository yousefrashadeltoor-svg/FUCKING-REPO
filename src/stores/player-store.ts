// DON MUSE — global player state (Zustand + persist).
// Queue, current track, transport controls, likes, and preferences live here.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TrackDTO } from "@/lib/types";

export type RepeatMode = "off" | "all" | "one";

export interface PlayerState {
  // --- transport ---
  currentTrack: TrackDTO | null;
  queue: TrackDTO[];
  index: number; // index of currentTrack inside queue (-1 = none)
  isPlaying: boolean;
  positionSec: number;
  durationSec: number;
  volume: number; // 0..1
  muted: boolean;
  playbackRate: number;
  shuffle: boolean;
  repeat: RepeatMode;
  /** When > 0, the current track repeats this many more times, then advances. */
  repeatCount: number;
  // --- audio prefs ---
  crossfadeSec: number;
  eqBands: number[]; // 10 values, -12..+12 dB
  // --- sleep timer ---
  sleepTimerEndsAt: number | null; // epoch ms
  // --- library ---
  likedIds: number[];
  // --- actions ---
  playTrack: (track: TrackDTO, opts?: { queue?: TrackDTO[]; index?: number; autoplay?: boolean }) => void;
  playQueue: (queue: TrackDTO[], index: number) => void;
  togglePlay: () => void;
  setPlaying: (playing: boolean) => void;
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
  setEqBand: (i: number, db: number) => void;
  setSleepTimer: (msFromNow: number | null) => void;
  addToQueue: (track: TrackDTO) => void;
  playNext: (track: TrackDTO) => void;
  removeFromQueue: (i: number) => void;
  moveInQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  toggleLike: (trackId: number) => void;
  setLiked: (trackId: number, liked: boolean) => void;
  hydrateLikes: (ids: number[]) => void;
}

const EQ_DEFAULT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      currentTrack: null,
      queue: [],
      index: -1,
      isPlaying: false,
      positionSec: 0,
      durationSec: 0,
      volume: 0.8,
      muted: false,
      playbackRate: 1,
      shuffle: false,
      repeat: "off",
      repeatCount: 0,
      crossfadeSec: 4,
      eqBands: EQ_DEFAULT,
      sleepTimerEndsAt: null,
      likedIds: [],

      playTrack: (track, opts) => {
        const state = get();
        if (opts?.queue) {
          const index =
            opts.index ?? Math.max(0, opts.queue.findIndex((t) => t.id === track.id));
          set({
            queue: opts.queue,
            index,
            currentTrack: opts.queue[index] ?? track,
            isPlaying: opts.autoplay !== false,
            positionSec: 0,
          });
        } else {
          // If track already in queue, jump to it; otherwise replace queue with it.
          const existing = state.queue.findIndex((t) => t.id === track.id);
          if (existing >= 0) {
            set({ index: existing, currentTrack: state.queue[existing], isPlaying: true, positionSec: 0 });
          } else {
            set({ queue: [track], index: 0, currentTrack: track, isPlaying: true, positionSec: 0 });
          }
        }
      },

      playQueue: (queue, index) =>
        set({
          queue,
          index,
          currentTrack: queue[index] ?? null,
          isPlaying: true,
          positionSec: 0,
        }),

      togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
      setPlaying: (isPlaying) => set({ isPlaying }),

      next: () => {
        const { queue, index, repeat, shuffle, repeatCount } = get();
        if (queue.length === 0) return;
        // Repeat ×N: replay the same track while the counter lasts.
        if (repeatCount > 0) {
          set({ positionSec: 0, repeatCount: repeatCount - 1, isPlaying: true });
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
        const { queue, index, positionSec } = get();
        if (queue.length === 0) return;
        // If we're >3s in, restart the current track (standard music-app behavior).
        if (positionSec > 3) {
          set({ positionSec: 0 });
          return;
        }
        const prevIndex = index - 1 < 0 ? (get().repeat === "all" ? queue.length - 1 : 0) : index - 1;
        set({ index: prevIndex, currentTrack: queue[prevIndex], isPlaying: true, positionSec: 0 });
      },

      seek: (sec) => set({ positionSec: sec }),
      setPosition: (positionSec) => set({ positionSec }),
      setDuration: (durationSec) => set({ durationSec }),
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)), muted: false }),
      toggleMute: () => set((s) => ({ muted: !s.muted })),
      setPlaybackRate: (playbackRate) => set({ playbackRate }),
      setShuffle: (shuffle) => set({ shuffle }),
      setRepeat: (repeat) =>
        set({ repeat: repeat === "off" ? "all" : repeat === "all" ? "one" : "off", repeatCount: 0 }),
      setRepeatMode: (repeat) => set({ repeat, repeatCount: 0 }),
      setRepeatCount: (n) => set({ repeatCount: Math.max(0, Math.min(99, Math.round(n))), repeat: n > 0 ? "off" : get().repeat }),
      setCrossfade: (crossfadeSec) => set({ crossfadeSec: Math.min(15, Math.max(0, crossfadeSec)) }),
      setEqBands: (eqBands) => set({ eqBands }),
      setEqBand: (i, db) =>
        set((s) => {
          const eqBands = [...s.eqBands];
          eqBands[i] = Math.min(12, Math.max(-12, db));
          return { eqBands };
        }),
      setSleepTimer: (msFromNow) =>
        set({ sleepTimerEndsAt: msFromNow === null ? null : Date.now() + msFromNow }),

      addToQueue: (track) =>
        set((s) => (s.queue.some((t) => t.id === track.id) ? s : { queue: [...s.queue, track] })),
      playNext: (track) =>
        set((s) => {
          if (s.queue.some((t) => t.id === track.id)) return s;
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
          return {
            queue,
            index,
            currentTrack: queue[index] ?? null,
          };
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
      clearQueue: () => set({ queue: [], index: -1, currentTrack: null, isPlaying: false }),

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
      version: 1,
      partialize: (s) => ({
        queue: s.queue,
        index: s.index,
        volume: s.volume,
        muted: s.muted,
        playbackRate: s.playbackRate,
        shuffle: s.shuffle,
        repeat: s.repeat,
        repeatCount: s.repeatCount,
        crossfadeSec: s.crossfadeSec,
        eqBands: s.eqBands,
        likedIds: s.likedIds,
        // currentTrack intentionally not persisted as `isPlaying`; rehydrated paused.
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PlayerState>;
        return {
          ...current,
          ...p,
          currentTrack: null,
          isPlaying: false,
          positionSec: 0,
          durationSec: 0,
          sleepTimerEndsAt: null,
        };
      },
    },
  ),
);
