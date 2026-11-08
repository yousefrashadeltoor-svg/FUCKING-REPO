"use client";

// Global overlays, in strict z-order:
//   NowPlaying (70) → InfoSheet (92) → Shortcuts (95)
import { useEffect } from "react";
import { NowPlaying } from "./NowPlaying";
import { FloatingDownloadWidget } from "./FloatingDownloadWidget";
import { InfoSheet } from "./InfoSheet";
import { ShortcutsOverlay } from "@/components/shared/ShortcutsOverlay";
import { useUIStore } from "@/stores/ui-store";

export function PlayerOverlays() {
  const toggleShortcuts = useUIStore((s) => s.toggleShortcuts);
  const setNowPlaying = useUIStore((s) => s.setNowPlaying);
  const setShortcuts = useUIStore((s) => s.setShortcuts);
  const setInfoSheet = useUIStore((s) => s.setInfoSheet);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        toggleShortcuts();
      }
      if (e.key === "Escape") {
        setInfoSheet(false);
        setNowPlaying(false);
        setShortcuts(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleShortcuts, setNowPlaying, setShortcuts, setInfoSheet]);

  return (
    <>
      <FloatingDownloadWidget />
      <NowPlaying />
      <InfoSheet />
      <ShortcutsOverlay />
    </>
  );
}
