import { localFetch } from "@/lib/local/client";

// Universal track table used by library / playlist / album / artist / search pages.
// Row click plays into the queue; heart toggles like; hover actions for queue.
import { Pause, Play, Heart, Plus, MoreHorizontal, Share2, Download } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { cn, formatTime } from "@/lib/utils";
import { usePlayerStore } from "@/stores/player-store";
import { playQueueNow, playTrackNow, togglePlayNow } from "@/lib/player-actions";
import type { TrackDTO } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { BrandIcon } from "@/components/brand/BrandIcon";
import { shareTrack } from "@/lib/share";
import { enqueueTrack } from "@/stores/download-store";

interface Props {
  tracks: TrackDTO[];
  /** When provided, clicking a row plays the whole list as the queue. */
  playAll?: boolean;
  showAlbum?: boolean;
  onRemove?: (trackId: number) => void;
  emptyText?: string;
}

export function TrackList({ tracks, playAll = true, showAlbum = true, onRemove, emptyText }: Props) {
  const t = useT();
  const currentId = usePlayerStore((s) => s.currentTrack?.id);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const likedIds = usePlayerStore((s) => s.likedIds);
  const toggleLike = usePlayerStore((s) => s.toggleLike);
  const addToQueue = usePlayerStore((s) => s.addToQueue);

  if (tracks.length === 0) {
    return (
      <p className="px-1 py-10 text-center text-sm text-white/35">
        {emptyText ?? t("dlNone")}
      </p>
    );
  }

  const t2 = t;
  const onLike = (t: TrackDTO) => {
    const liked = likedIds.includes(t.id);
    toggleLike(t.id);
    void localFetch("/api/likes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: t.id }),
    }).catch(() => {});
    toast(liked ? t2("removedFromLikes") : t2("addedToLikes"), {
      icon: <Heart className={cn("size-4", !liked && "fill-rose text-rose")} />,
    });
  };

  return (
    <div className="px-1">
      {/* header */}
      <div className="grid grid-cols-[2.5rem_1fr_180px_90px_70px_110px] items-center gap-2 border-b border-white/[0.06] px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/30 max-md:grid-cols-[2.5rem_1fr_90px_110px]">
        <span className="text-center">#</span>
        <span>{t("title")}</span>
        {showAlbum && <span className="max-md:hidden">{t("album")}</span>}
        <span className="max-md:hidden">{t("genre")}</span>
        <span className="text-end">{t("bpm")}</span>
        <span className="text-end">{t("time")}</span>
      </div>
      {tracks.map((t, i) => {
        const active = t.id === currentId;
        const liked = likedIds.includes(t.id);
        return (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.4) }}
            onClick={() => {
              if (active) togglePlayNow();
              else if (playAll) playQueueNow(tracks, i);
              else playTrackNow(t);
            }}
            className={cn(
              "group grid cursor-pointer grid-cols-[2.5rem_1fr_180px_90px_70px_110px] items-center gap-2 rounded-xl px-3 transition-colors hover:bg-white/[0.06] max-md:grid-cols-[2.5rem_1fr_90px_110px]",
              active && "bg-white/[0.08]",
            )}
            style={{ paddingTop: "var(--density-row-py)", paddingBottom: "var(--density-row-py)" }}
          >
            <span className="relative text-center font-mono text-xs text-white/40">
              {active && isPlaying ? (
                <span className="flex items-center justify-center gap-[2px]">
                  {[0, 1, 2].map((b) => (
                    <span
                      key={b}
                      className="w-[3px] animate-pulse rounded-full bg-[#1DB954]"
                      style={{ height: `${6 + b * 3}px`, animationDelay: `${b * 0.15}s` }}
                    />
                  ))}
                </span>
              ) : active ? (
                <Pause className="mx-auto size-3.5 fill-white text-white" />
              ) : (
                <span className="group-hover:hidden">{i + 1}</span>
              )}
              {!active && <Play className="absolute inset-0 mx-auto hidden size-3.5 fill-white/70 group-hover:block" />}
            </span>
            <span className="flex min-w-0 items-center gap-2.5">
              {t.coverUrl && (

                <img src={t.coverUrl} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
              )}
              <span className="min-w-0">
                <span className={cn("block truncate text-[13.5px] font-semibold", active ? "text-[#1DB954]" : "text-white/90")}>
                  {t.title}
                  {["youtube", "spotify", "applemusic", "deezer", "audius", "soundcloud", "archive", "jamendo", "bandcamp", "dailymotion", "odysee"].includes(t.source) && (
                    <span className="ms-1.5 inline-flex -translate-y-px align-middle"><BrandIcon name={t.source} color="brand" className="size-3" /></span>
                  )}
                  {t.explicit && <span className="ml-1.5 rounded border border-white/25 px-1 text-[8px] font-bold text-white/50">E</span>}
                </span>
                <span className="block truncate text-xs text-white/40">{t.artistName}</span>
              </span>
            </span>
            {showAlbum && (
              <span className="truncate text-xs text-white/45 max-md:hidden">
                {t.albumId ? (
                  <span
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-white hover:underline"
                  >
                    {t.albumTitle}
                  </span>
                ) : (
                  "—"
                )}
              </span>
            )}
            <span className="truncate text-xs text-white/40 max-md:hidden">{t.genre}</span>
            <span className="text-right font-mono text-[11px] text-white/40">{Math.round(t.bpm)}</span>
            <span className="flex items-center justify-end gap-1.5 text-right font-mono text-[11px] text-white/40">
              {formatTime(t.durationSec)}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onLike(t);
                }}
                className={cn("rounded-full p-1 transition-colors hover:bg-white/10", liked ? "text-rose" : "text-white/30 opacity-0 group-hover:opacity-100 hover:text-rose")}
                aria-label={liked ? "Unlike" : "Like"}
              >
                <Heart className={cn("size-3.5", liked && "fill-rose")} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void shareTrack(t, "list").then((r) => r === "copied" && toast.success(t2("copied")));
                }}
                className="rounded-full p-1 text-white/30 opacity-0 transition-colors hover:bg-white/10 hover:text-white group-hover:opacity-100"
                aria-label={t2("share")}
              >
                <Share2 className="size-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  enqueueTrack(t, "mp3-320");
                  toast(t2("addBatch"));
                }}
                className="rounded-full p-1 text-white/30 opacity-0 transition-colors hover:bg-white/10 hover:text-[#1DB954] group-hover:opacity-100"
                aria-label={t2("addBatch")}
                title={t2("addBatch")}
              >
                <Download className="size-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  addToQueue(t);
                  toast(t2("addedToQueue"));
                }}
                className="rounded-full p-1 text-white/30 opacity-0 transition-colors hover:bg-white/10 hover:text-white group-hover:opacity-100"
                aria-label="Add to queue"
              >
                <Plus className="size-3.5" />
              </button>
              {onRemove && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(t.id);
                  }}
                  className="rounded-full p-1 text-white/30 opacity-0 transition-colors hover:bg-white/10 hover:text-rose group-hover:opacity-100"
                  aria-label="Remove"
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              )}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
