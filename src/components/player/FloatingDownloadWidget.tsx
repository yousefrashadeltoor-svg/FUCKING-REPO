"use client";

import { useRef, useState } from "react";
import { Download, Grip } from "lucide-react";
import { DownloadMenu } from "./DownloadMenu";
import { usePlayerStore } from "@/stores/player-store";
import { canDownload } from "@/lib/playback-policy";

type DragOrigin = { pointerX: number; pointerY: number; left: number; top: number };

/**
 * Draggable quick-download launcher for sources that the provider policy
 * explicitly permits. YouTube and local files are handled by their own native
 * or official flows and are intentionally not shown here.
 */
export function FloatingDownloadWidget() {
  const track = usePlayerStore((s) => s.currentTrack);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [open, setOpen] = useState(false);
  const dragOrigin = useRef<DragOrigin | null>(null);
  const moved = useRef(false);
  const canOffer = !!track &&
    track.id > 0 &&
    canDownload(track.source) &&
    !["local", "quran", "radio", "tv"].includes(track.source);

  if (!canOffer || !track) return null;

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    dragOrigin.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      left: rect.left,
      top: rect.top,
    };
    moved.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const origin = dragOrigin.current;
    if (!origin) return;
    const dx = event.clientX - origin.pointerX;
    const dy = event.clientY - origin.pointerY;
    if (!moved.current && Math.abs(dx) + Math.abs(dy) < 7) return;
    moved.current = true;
    const maxLeft = Math.max(8, window.innerWidth - 60);
    const maxTop = Math.max(8, window.innerHeight - 60);
    setPosition({
      left: Math.max(8, Math.min(maxLeft, origin.left + dx)),
      top: Math.max(8, Math.min(maxTop, origin.top + dy)),
    });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    dragOrigin.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const style: React.CSSProperties = position
    ? { left: position.left, top: position.top, right: "auto", bottom: "auto" }
    : { right: 16, bottom: "calc(env(safe-area-inset-bottom, 0px) + 7.2rem)" };

  return (
    <>
      {open && (
        <div className="fixed inset-x-3 bottom-24 z-[111] flex max-h-[72dvh] justify-end overflow-y-auto">
          <DownloadMenu track={track} onClose={() => setOpen(false)} />
        </div>
      )}
      <button
        type="button"
        style={style}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => {
          if (moved.current) {
            moved.current = false;
            return;
          }
          setOpen((value) => !value);
        }}
        onContextMenu={(event) => event.preventDefault()}
        aria-label="Open supported download formats"
        title="Drag anywhere · Download formats"
        className="fixed z-[110] grid size-13 touch-none select-none place-items-center rounded-full border border-white/15 bg-[#15191f]/95 text-white shadow-[0_12px_38px_rgba(0,0,0,.42)] backdrop-blur-2xl transition-transform active:scale-95"
      >
        <span className="pointer-events-none absolute inset-1 rounded-full border border-white/10" />
        <Download className="size-5" strokeWidth={2.2} />
        <Grip className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-black/85 p-0.5 text-white/65" />
      </button>
    </>
  );
}
