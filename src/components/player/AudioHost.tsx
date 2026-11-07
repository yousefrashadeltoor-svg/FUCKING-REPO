"use client";

// Keeps the audio elements in the document (never unmounted, never detached).
// Some Android WebViews pause detached media, which caused the "music stops
// when I change page" bug. This host is mounted once by the app layout.
import { useEffect, useState } from "react";
import { getEngine } from "@/lib/audio/engine";

export function AudioHost() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    // Instantiate the single engine early so the graph exists before the first
    // tap; the AudioContext itself is only unlocked inside a gesture.
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const engine = getEngine();
    void engine;
  }, [mounted]);

  if (!mounted) return null;
  return (
    <div
      aria-hidden
      style={{ position: "fixed", width: 1, height: 1, left: -9999, top: -9999, opacity: 0, pointerEvents: "none" }}
      data-donmuse-audio-host
    >
      {/* The engine creates its <audio> elements lazily; they live here via the
          MediaElementSource graph. Nothing to render. */}
    </div>
  );
}
