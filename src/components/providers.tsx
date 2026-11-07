"use client";

// ============================================================================
//  DON MUSE — Providers
//  Wires the engine (one audio pipeline), the store, the native Android
//  bridge, the Media Session (notification / lock screen / widgets), the
//  network state, and global keyboard shortcuts.
// ============================================================================
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";
import { installMediaSessionHandlers, installPlaybackController } from "@/lib/audio/controller";
import { getEngine } from "@/lib/audio/engine";
import { usePlayerStore } from "@/stores/player-store";
import { useSettingsStore } from "@/stores/settings-store";
import { applyDocumentLang } from "@/lib/i18n";
import { ACCENT_HEX, THEMES } from "@/stores/settings-store";
import { isNativeHost } from "@/lib/platform/native";
import { NetworkWatcher } from "@/components/layout/NetworkWatcher";
import { NativeBridgeInit } from "@/components/layout/NativeBridgeInit";
import { enterPlayerMode } from "@/lib/ui/anim";
import { useUIStore } from "@/stores/ui-store";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** Applies theme + accent + density + motion profile to <html>. */
function ThemeApplier() {
  const theme = useSettingsStore((s) => s.theme);
  const accent = useSettingsStore((s) => s.accent);
  const density = useSettingsStore((s) => s.density);
  const reduced = useSettingsStore((s) => s.reducedEffects);
  const highRefresh = useSettingsStore((s) => s.highRefresh);

  useEffect(() => {
    const root = document.documentElement;
    const t = THEMES[theme] ?? THEMES.midnight;
    root.dataset.theme = theme;
    root.style.setProperty("--app-bg", t.bg);
    root.style.setProperty("--app-panel", t.panel);
    root.style.setProperty("--app-text", t.text);
    root.style.setProperty("--app-muted", t.muted);
    root.style.setProperty("--app-border", t.border);
    root.style.colorScheme = t.dark ? "dark" : "light";
    root.dataset.density = density;
    root.dataset.motion = reduced ? "reduced" : highRefresh ? "fast" : "normal";
    const hex = ACCENT_HEX[accent];
    root.style.setProperty("--app-accent", hex);
    root.style.setProperty("--dynamic-primary", hex);
    root.style.setProperty("--dynamic-glow", `${hex}40`);
  }, [theme, accent, density, reduced, highRefresh]);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  /* ---------------- playback controller (engine ⇄ store) ---------------- */
  useEffect(() => {
    const teardown = installPlaybackController();
    const offMedia = installMediaSessionHandlers();
    document.documentElement.dataset.host = isNativeHost() ? "android" : "web";
    return () => {
      teardown();
      offMedia();
    };
  }, []);

  /* ---------------- document language / direction ---------------- */
  const language = useSettingsStore((s) => s.language);
  useEffect(() => {
    applyDocumentLang(language);
  }, [language]);

  /* ---------------- hydrate likes from the server once ---------------- */
  useEffect(() => {
    void fetch("/api/likes")
      .then((r) => (r.ok ? r.json() : []))
      .then((tracks: { id: number }[]) => {
        if (Array.isArray(tracks)) usePlayerStore.getState().hydrateLikes(tracks.map((t) => t.id));
      })
      .catch(() => {});
  }, []);

  /* ---------------- periodic scrobble while playing ---------------- */
  useEffect(() => {
    const iv = setInterval(() => {
      const s = usePlayerStore.getState();
      if (!s.isPlaying || !s.currentTrack) return;
      const t = s.currentTrack;
      if (t.id <= 0 || t.source === "radio" || t.source === "quran" || t.source === "local") return;
      void fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: t.id, durationListenedSec: 20 }),
      }).catch(() => {});
    }, 60_000);
    return () => clearInterval(iv);
  }, []);

  /* ---------------- global keyboard shortcuts ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
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

  /* ---------------- paint budget hint (progressive enhancement) ---------------- */
  useEffect(() => {
    enterPlayerMode();
  }, []);

  /* ---------------- Android hardware back button ---------------- */
  useEffect(() => {
    // The native shell calls this first: closing a sheet beats leaving the app.
    const w = window as Window & {
      __donmuseBack?: () => boolean;
      __donmuseResync?: () => void;
    };
    w.__donmuseBack = () => {
      const ui = useUIStore.getState();
      if (ui.infoSheetOpen) {
        ui.setInfoSheet(false);
        return true;
      }
      if (ui.nowPlayingOpen) {
        ui.setNowPlaying(false);
        return true;
      }
      if (ui.searchOpen) {
        ui.setSearchOpen(false);
        return true;
      }
      if (ui.navOpen) {
        ui.setNavOpen(false);
        return true;
      }
      return false;
    };
    w.__donmuseResync = () => {
      const s = usePlayerStore.getState();
      if (!s.currentTrack) return;
      // Ask the real player, never a cached guess.
      const engine = getEngine();
      s.setPlaying(engine.isPlaying);
      if (engine.duration > 0) s.setDuration(engine.duration);
      s.setPosition(engine.position);
    };
    return () => {
      delete w.__donmuseBack;
      delete w.__donmuseResync;
    };
  }, []);

  return (
    <>
      <ThemeApplier />
      <NativeBridgeInit />
      <NetworkWatcher />
      {children}
      <Toaster
        position="bottom-center"
        theme="dark"
        closeButton
        toastOptions={{
          style: {
            background: "var(--app-panel-solid, rgba(12,12,16,0.94))",
            border: "1px solid var(--app-border, rgba(255,255,255,0.10))",
            color: "var(--app-text, #fff)",
            backdropFilter: "blur(24px)",
            borderRadius: "14px",
          },
        }}
      />
    </>
  );
}
