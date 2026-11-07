"use client";

// Landing view for a deep-linked song: big cover, play (gesture), share,
// download, open artist/album/reels. Auto-plays if the engine was already
// unlocked in this session.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Play, Pause, Share2, Download, Heart, Disc3, UserRound, Film, ListPlus } from "lucide-react";
import { toast } from "sonner";
import { cn, formatTime, formatCount } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { usePlayerStore } from "@/stores/player-store";
import { playTrackNow, togglePlayNow } from "@/lib/player-actions";
import { shareTrack } from "@/lib/share";
import { BrandIcon, BRAND_LABEL } from "@/components/brand/BrandIcon";
import { DownloadMenu } from "@/components/player/DownloadMenu";
import type { TrackDTO } from "@/lib/types";

export function TrackLanding({ track }: { track: TrackDTO }) {
  const t = useT();
  const current = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const likedIds = usePlayerStore((s) => s.likedIds);
  const toggleLike = usePlayerStore((s) => s.toggleLike);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const [dl, setDl] = useState(false);
  const active = current?.id === track.id;
  const liked = likedIds.includes(track.id);

  // Auto-start when the audio engine is already unlocked (navigated within the app).
  useEffect(() => {
    const s = usePlayerStore.getState();
    if (s.currentTrack && s.currentTrack.id !== track.id) {
      try { playTrackNow(track); } catch { /* needs gesture */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id]);

  const onLike = () => {
    toggleLike(track.id);
    void fetch("/api/likes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId: track.id }) }).catch(() => {});
  };

  return (
    <div className="p-4 md:p-6">
      <div className="relative overflow-hidden rounded-3xl ring-1 ring-white/10">
        {track.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.coverUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-3xl" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0e] via-[#0b0b0e]/70 to-transparent" />
        <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-end md:p-10">
          {track.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={track.coverUrl} alt={track.title} className="size-56 shrink-0 rounded-2xl object-cover shadow-2xl md:size-72" />
          ) : <div className="size-56 rounded-2xl bg-white/10 md:size-72" />}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white/50">
              <BrandIcon name={track.source} color="brand" className="size-4" /> {BRAND_LABEL[track.source] ?? track.source} · {t("tracks")}
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight md:text-5xl">{track.title}</h1>
            <p className="mt-2 text-base text-white/70">
              <Link href={`/artists/${track.artistId}`} className="font-semibold hover:underline">{track.artistName}</Link>
              {track.albumTitle && track.albumId && <> · <Link href={`/albums/${track.albumId}`} className="hover:underline">{track.albumTitle}</Link></>}
            </p>
            <p className="mt-1 font-mono text-xs text-white/45">{formatTime(track.durationSec)} · {track.genre} · {track.year} · {formatCount(track.playCount)} {t("playsLabel")}</p>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <button onClick={() => (active ? togglePlayNow() : playTrackNow(track))} className="flex items-center gap-2 rounded-full bg-[#1DB954] px-7 py-3 text-sm font-bold text-black transition-transform hover:scale-105">
                {active && isPlaying ? <Pause className="size-4 fill-black" /> : <Play className="size-4 fill-black" />} {active && isPlaying ? t("pause") : t("play")}
              </button>
              <button onClick={() => void shareTrack(track).then((r) => r === "copied" && toast.success(t("copied")))} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-3 text-sm font-semibold text-white/85 hover:bg-white/12"><Share2 className="size-4" /> {t("share")}</button>
              <button onClick={() => setDl(true)} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-3 text-sm font-semibold text-white/85 hover:bg-white/12"><Download className="size-4" /> {t("download")}</button>
              <button onClick={onLike} className={cn("grid size-11 place-items-center rounded-full border border-white/15 bg-white/[0.06] hover:bg-white/12", liked && "text-rose")} aria-label={t("like")}><Heart className={cn("size-5", liked && "fill-rose")} /></button>
              <button onClick={() => { addToQueue(track); toast(t("addedToQueue")); }} className="grid size-11 place-items-center rounded-full border border-white/15 bg-white/[0.06] hover:bg-white/12" aria-label={t("queue")}><ListPlus className="size-5" /></button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Link href={`/artists/${track.artistId}`} className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-white/60 hover:bg-white/8"><UserRound className="size-3.5" /> {t("artist")}</Link>
              {track.albumId && <Link href={`/albums/${track.albumId}`} className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-white/60 hover:bg-white/8"><Disc3 className="size-3.5" /> {t("album")}</Link>}
              <Link href={`/reels?track=${track.id}`} className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-white/60 hover:bg-white/8"><Film className="size-3.5" /> {t("reels")}</Link>
            </div>
          </div>
        </div>
      </div>
      {dl && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-3 backdrop-blur-sm" onClick={() => setDl(false)}>
          <div onClick={(e) => e.stopPropagation()}><DownloadMenu track={track} onClose={() => setDl(false)} /></div>
        </div>
      )}
    </div>
  );
}
