"use client";

// Waveform scrubber: renders the track's stored peak data as bars; click/drag to seek.
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { usePlayerStore } from "@/stores/player-store";

interface Props {
  waveform: number[];
  durationSec: number;
  className?: string;
}

export function WaveformScrubber({ waveform, durationSec, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const positionSec = usePlayerStore((s) => s.positionSec);
  const seek = usePlayerStore((s) => s.seek);

  const ratio = durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0;
  const bars = waveform.length > 0 ? waveform : Array.from({ length: 120 }, (_, i) => Math.sin(i * 0.3) * 0.5);

  const seekFromEvent = (e: React.MouseEvent | MouseEvent) => {
    const el = ref.current;
    if (!el || durationSec <= 0) return;
    const rect = el.getBoundingClientRect();
    const r = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    seek(r * durationSec);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    seekFromEvent(e);
    const move = (ev: PointerEvent) => seekFromEvent(ev);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      className={cn("group relative flex h-9 w-full cursor-pointer items-center gap-[1.5px]", className)}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(durationSec)}
      aria-valuenow={Math.round(positionSec)}
    >
      {bars.map((v, i) => {
        const played = i / bars.length <= ratio;
        const h = Math.max(12, Math.abs(v) * 100);
        return (
          <span
            key={i}
            className={cn(
              "w-full rounded-full transition-colors duration-150",
              played ? "bg-white" : "bg-white/25 group-hover:bg-white/40",
            )}
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}
