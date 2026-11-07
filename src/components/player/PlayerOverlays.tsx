"use client";

// Global overlays: Now Playing full-screen + keyboard shortcuts, plus the
// "?" key handler and a global escape to close.
import { useEffect } from "react";
import { NowPlaying } from "./NowPlaying";
import { ShortcutsOverlay } from "@/components/shared/ShortcutsOverlay";
import { useUIStore } from "@/stores/ui-store";

export function PlayerOverlays() {
  const toggleShortcuts = useUIStore((s) => s.toggleShortcuts);
  const setNowPlaying = useUIStore((s) => s.setNowPlaying);
  const setShortcuts = useUIStore((s) => s.setShortcuts);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        toggleShortcuts();
      }
      if (e.key === "Escape") {
        setNowPlaying(false);
        setShortcuts(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleShortcuts, setNowPlaying, setShortcuts]);

  return (
    <>
      <NowPlaying />
      <ShortcutsOverlay />
    </>
  );
}
