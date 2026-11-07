"use client";

// ============================================================================
//  DON MUSE — app providers
//  Wires the UniversalPlaybackEngine to the Zustand player store, scrobbles
//  plays to /api/history, drives the Media Session API (OS media controls),
//  global keyboard shortcuts, sleep timer, and like-hydration.
// ============================================================================
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";
import { getEngine } from "@/lib/audio/engine";
import { usePlayerStore } from "@/stores/player-store";
import { useSettingsStore } from "@/stores/settings-store";
import { applyDocumentLang } from "@/lib/i18n";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function Providers({ children }: { children: ReactNode }) {
  // ---- engine <-> store wiring (runs once) ----
  useEffect(() => {
    const engine = getEngine();
    const store = usePlayerStore.getState();

    // Rehydrate the current track from the persisted queue (paused).
    if (!store.currentTrack && store.queue.length > 0 && store.index >= 0) {
      const restored = store.queue[store.index];
      if (restored) {
        usePlayerStore.setState({ currentTrack: restored, isPlaying: false });
      }
    }

    const offTime = engine.on("timeupdate", (t) => {
      usePlayerStore.getState().setPosition(Number(t));
    });
    const offDur = engine.on("durationchange", (d) => {
      usePlayerStore.getState().setDuration(Number(d));
    });
    const offEnded = engine.on("ended", () => {
      const s = usePlayerStore.getState();
      if (s.repeatCount > 0 || s.repeat === "one") {
        // replay the same track from 0 (works for YouTube + audio path)
        s.next();
        engine.seek(0);
        void engine.play();
        return;
      }
      if (useSettingsStore.getState().autoplay) s.next();
      else s.setPlaying(false);
    });
    const offTrack = engine.on("trackchange", (t) => {
      // Scrobble the play.
      const track = t as { id: number; source?: string } | undefined;
      if (track && track.id > 0 && track.source !== "radio") {
        void fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trackId: track.id, durationListenedSec: 0 }),
        }).catch(() => {});
        // Fetch real lyrics (lyrics.ovh) and inject them into the store.
        void fetch(`/api/tracks/${track.id}/lyrics`)
          .then((r) => r.json())
          .then((data: { lyrics?: { start: number; text: string }[] }) => {
            const s = usePlayerStore.getState();
            if (data.lyrics && data.lyrics.length > 0 && s.currentTrack?.id === track.id) {
              usePlayerStore.setState({
                currentTrack: { ...s.currentTrack, lyrics: data.lyrics },
              });
            }
          })
          .catch(() => {});
      }
      // Pre-buffer next track for gapless playback (audio path only).
      const s = usePlayerStore.getState();
      const upcoming = s.queue[s.index + 1];
      if (upcoming && upcoming.source !== "youtube" && upcoming.source !== "radio" && upcoming.source !== "quran") engine.preload(upcoming.streamUrl);
    });
    const offErr = engine.on("error", (msg) => {
      console.warn("[DON MUSE engine]", msg);
    });

    // keep engine settings in sync
    const unsub = usePlayerStore.subscribe((s) => {
      engine.setVolume(s.volume);
      engine.setMuted(s.muted);
      engine.setPlaybackRate(s.playbackRate);
      engine.setCrossfade(s.crossfadeSec);
      engine.setEq(s.eqBands);
    });
    const unsubSettings = useSettingsStore.subscribe((s) => {
      engine.setLoudnessNormalization(s.loudnessNormalization);
      engine.setQuality(s.quality);
      engine.setEq(usePlayerStore.getState().eqBands);
    });

    // hydrate likes from the server once
    void fetch("/api/likes")
      .then((r) => r.json())
      .then((tracks: { id: number }[]) => {
        usePlayerStore.getState().hydrateLikes(tracks.map((t) => t.id));
      })
      .catch(() => {});

    void store; // store snapshot retained for clarity
    return () => {
      offTime();
      offDur();
      offEnded();
      offTrack();
      offErr();
      unsub();
      unsubSettings();
    };
  }, []);

  // ---- load current track into the engine whenever it changes ----
  const trackId = usePlayerStore((s) => s.currentTrack?.id);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  useEffect(() => {
    const track = usePlayerStore.getState().currentTrack;
    if (!track) return;
    const engine = getEngine();
    const playing = usePlayerStore.getState().isPlaying;
    void engine.load(track, { autoplay: playing, crossfade: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId]);

  // ---- play / pause ----
  useEffect(() => {
    const engine = getEngine();
    const track = usePlayerStore.getState().currentTrack;
    if (!track) return;
    if (isPlaying) void engine.play();
    else engine.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, trackId]);

  // ---- seek (user scrub) ----
  const positionSec = usePlayerStore((s) => s.positionSec);
  useEffect(() => {
    const engine = getEngine();
    if (Math.abs(engine.position - positionSec) > 1.5) {
      engine.seek(positionSec);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionSec]);

  // ---- sleep timer ----
  const sleepTimerEndsAt = usePlayerStore((s) => s.sleepTimerEndsAt);
  useEffect(() => {
    const engine = getEngine();
    if (sleepTimerEndsAt) engine.startSleepTimer(sleepTimerEndsAt, 30);
    else engine.cancelSleepTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleepTimerEndsAt]);

  // ---- periodic scrobble while playing (every 20s) ----
  useEffect(() => {
    const iv = setInterval(() => {
      const s = usePlayerStore.getState();
      if (s.isPlaying && s.currentTrack && s.currentTrack.id > 0 && s.currentTrack.source !== "radio") {
        void fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trackId: s.currentTrack.id, durationListenedSec: 20 }),
        }).catch(() => {});
      }
    }, 20_000);
    return () => clearInterval(iv);
  }, []);

  // ---- Media Session API (OS-level controls) ----
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const update = () => {
      const s = usePlayerStore.getState();
      const t = s.currentTrack;
      if (!t) return;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title,
        artist: t.artistName,
        album: t.albumTitle ?? "DON MUSE",
        artwork: t.coverUrl
          ? [{ src: t.coverUrl, sizes: "512x512", type: "image/jpeg" }]
          : [],
      });
      navigator.mediaSession.playbackState = s.isPlaying ? "playing" : "paused";
    };
    update();
    const unsub = usePlayerStore.subscribe(update);

    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => usePlayerStore.getState().setPlaying(true)],
      ["pause", () => usePlayerStore.getState().setPlaying(false)],
      ["previoustrack", () => usePlayerStore.getState().prev()],
      ["nexttrack", () => usePlayerStore.getState().next()],
      ["seekbackward", () => usePlayerStore.getState().seek(usePlayerStore.getState().positionSec - 10)],
      ["seekforward", () => usePlayerStore.getState().seek(usePlayerStore.getState().positionSec + 10)],
      ["seekto", (d) => { if (d?.seekTime) usePlayerStore.getState().seek(d.seekTime); }],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        /* unsupported action */
      }
    }
    return () => unsub();
  }, []);

  // ---- document language + direction (RTL for ar/ur) ----
  const language = useSettingsStore((s) => s.language);
  useEffect(() => {
    applyDocumentLang(language);
  }, [language]);

  // ---- global keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const s = usePlayerStore.getState();
      switch (e.code) {
        case "Space":
          e.preventDefault();
          s.togglePlay();
          break;
        case "ArrowRight":
          if (e.shiftKey) s.next();
          else s.seek(s.positionSec + 5);
          break;
        case "ArrowLeft":
          if (e.shiftKey) s.prev();
          else s.seek(s.positionSec - 5);
          break;
        case "ArrowUp":
          e.preventDefault();
          s.setVolume(Math.min(1, s.volume + 0.05));
          break;
        case "ArrowDown":
          e.preventDefault();
          s.setVolume(Math.max(0, s.volume - 0.05));
          break;
        case "KeyM":
          s.toggleMute();
          break;
        case "KeyL":
          if (s.currentTrack) s.toggleLike(s.currentTrack.id);
          break;
        case "KeyS":
          s.setShuffle(!s.shuffle);
          break;
        case "KeyR":
          s.setRepeat(s.repeat);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {children}
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: "rgba(12,12,14,0.92)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#fff",
            backdropFilter: "blur(20px)",
          },
        }}
      />
    </>
  );
}
