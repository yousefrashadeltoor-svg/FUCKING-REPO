"use client";

// ============================================================================
//  iOS-style progress slider: waveform bars as the track, accent fill for
//  the played portion, a knob that appears on hover/drag, and a live time
//  tooltip while scrubbing. Fully draggable (pointer events).
// ============================================================================
import { useRef, useState } from "react";
import { cn, formatTime } from "@/lib/utils";
import { usePlayerStore } from "@/stores/player-store";

interface Props {
  waveform: number[];
  durationSec: number;
  className?: string;
}

export function ProgressSlider({ waveform, durationSec, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const positionSec = usePlayerStore((s) => s.positionSec);
  const seek = usePlayerStore((s) => s.seek);
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);

  const ratio = durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0;
  const shownRatio = dragRatio ?? hoverRatio ?? ratio;
  const bars =
    waveform.length > 0
      ? waveform
      : Array.from({ length: 120 }, (_, i) => Math.sin(i * 0.3) * 0.5);

  const ratioFromEvent = (clientX: number): number => {
    const el = ref.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const r = ratioFromEvent(e.clientX);
    setDragRatio(r);
    if (durationSec > 0) seek(r * durationSec);
    const move = (ev: PointerEvent) => {
      const rr = ratioFromEvent(ev.clientX);
      setDragRatio(rr);
      if (durationSec > 0) seek(rr * durationSec);
    };
    const up = () => {
      setDragRatio(null);
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
      onPointerMove={(e) => setHoverRatio(ratioFromEvent(e.clientX))}
      onPointerLeave={() => setHoverRatio(null)}
      dir="ltr"
      className={cn("group relative flex h-8 w-full cursor-pointer touch-none items-center", className)}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(durationSec)}
      aria-valuenow={Math.round(positionSec)}
    >
      {/* waveform track */}
      <div className="flex h-full w-full items-center gap-[1.5px]">
        {bars.map((v, i) => {
          const played = i / bars.length <= shownRatio;
          const h = Math.max(14, Math.abs(v) * 100);
          return (
            <span
              key={i}
              className={cn(
                "w-full rounded-full transition-colors duration-75",
                played ? "bg-white" : "bg-white/25",
              )}
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>

      {/* knob */}
      <span
        className={cn(
          "pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md shadow-black/50 transition-opacity",
          dragRatio !== null || hoverRatio !== null ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
        style={{ left: `${shownRatio * 100}%` }}
      />

      {/* time tooltip while scrubbing */}
      {dragRatio !== null && durationSec > 0 && (
        <span
          className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-black shadow-lg"
          style={{ left: `${shownRatio * 100}%` }}
        >
          {formatTime(shownRatio * durationSec)}
        </span>
      )}
    </div>
  );
}
