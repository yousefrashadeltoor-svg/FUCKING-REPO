
// Queue panel: current + upcoming tracks with reorder (up/down) and remove.
import { X, ArrowUp, ArrowDown, ListMusic } from "lucide-react";
import { cn, formatTime } from "@/lib/utils";
import { usePlayerStore } from "@/stores/player-store";
import type { TrackDTO } from "@/lib/types";
import { useT } from "@/lib/i18n";

export function QueuePanel() {
  const t = useT();
  const queue = usePlayerStore((s) => s.queue);
  const index = usePlayerStore((s) => s.index);
  const playQueue = usePlayerStore((s) => s.playQueue);
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue);
  const moveInQueue = usePlayerStore((s) => s.moveInQueue);

  if (queue.length === 0) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div>
          <ListMusic className="mx-auto mb-3 size-8 text-white/20" />
          <p className="text-sm text-white/35">{t("queueEmpty")}</p>
        </div>
      </div>
    );
  }

  const Row = ({ t, i }: { t: TrackDTO; i: number }) => {
    const active = i === index;
    return (
      <div
        className={cn(
          "group flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors",
          active ? "bg-white/10" : "hover:bg-white/5",
        )}
      >
        <button
          onClick={() => playQueue(queue, i)}
          className="w-6 shrink-0 text-right font-mono text-[11px] text-white/35 hover:text-white"
          title="Play this track"
        >
          {active ? "▶" : i + 1}
        </button>
        {t.coverUrl && (

          <img src={t.coverUrl} alt="" className="size-8 shrink-0 rounded-md object-cover" />
        )}
        <button
          onClick={() => playQueue(queue, i)}
          className="min-w-0 flex-1 text-left"
          title={t.title}
        >
          <span className={cn("block truncate text-[13px] font-medium", active ? "text-white" : "text-white/80")}>
            {t.title}
          </span>
          <span className="block truncate text-[11px] text-white/40">{t.artistName}</span>
        </button>
        <span className="shrink-0 font-mono text-[10px] text-white/30">{formatTime(t.durationSec)}</span>
        <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
          <button
            onClick={() => moveInQueue(i, Math.max(0, i - 1))}
            disabled={i === 0}
            className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-20"
            aria-label="Move up"
          >
            <ArrowUp className="size-3.5" />
          </button>
          <button
            onClick={() => moveInQueue(i, Math.min(queue.length - 1, i + 1))}
            disabled={i === queue.length - 1}
            className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-20"
            aria-label="Move down"
          >
            <ArrowDown className="size-3.5" />
          </button>
          <button
            onClick={() => removeFromQueue(i)}
            className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-rose"
            aria-label="Remove from queue"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    );
  };

  const nowPlaying = queue.slice(0, index + 1);
  const upNext = queue.slice(index + 1);

  return (
    <div className="aura-scroll h-full overflow-y-auto px-3 py-4">
      {nowPlaying.length > 0 && (
        <>
          <p className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
            {t("nowPlaying")}
          </p>
          {nowPlaying.map((t, i) => (
            <Row key={`${t.id}-${i}`} t={t} i={i} />
          ))}
        </>
      )}
      {upNext.length > 0 && (
        <>
          <p className="px-2 pb-1 pt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
            {t("upNext")} · {upNext.length}
          </p>
          {upNext.map((t, i) => (
            <Row key={`${t.id}-${index + 1 + i}`} t={t} i={index + 1 + i} />
          ))}
        </>
      )}
    </div>
  );
}
