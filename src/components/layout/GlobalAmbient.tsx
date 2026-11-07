"use client";

// Dynamic ambient glow behind the whole app, tinted by the current album art.
import { usePlayerStore } from "@/stores/player-store";
import { useColorExtract } from "@/hooks/useColorExtract";

export function GlobalAmbient() {
  const coverUrl = usePlayerStore((s) => s.currentTrack?.coverUrl);
  useColorExtract(coverUrl);
  return <div className="ambient-bg" aria-hidden="true" />;
}
