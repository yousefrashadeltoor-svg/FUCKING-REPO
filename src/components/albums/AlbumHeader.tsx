
import { Play, BadgeCheck, Share2 } from "lucide-react";
import { toast } from "sonner";
import { links, shareUrl } from "@/lib/share";
import { playQueueNow } from "@/lib/player-actions";
import type { AlbumDTO, ArtistDTO, TrackDTO } from "@/lib/types";
import { formatTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { AlbumLikeButton } from "./AlbumLikeButton";
import Link from "next/link";
import { BrandIcon } from "@/components/brand/BrandIcon";

export function AlbumHeader({
  album,
  artist,
  tracks,
}: {
  album: AlbumDTO;
  artist: ArtistDTO | null;
  tracks: TrackDTO[];
}) {
  const t = useT();
  const total = tracks.reduce((a, t) => a + t.durationSec, 0);
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/[0.07] to-transparent p-6 md:p-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-end">
        {album.coverUrl ? (

          <img src={album.coverUrl} alt={album.title} className="size-40 rounded-2xl object-cover shadow-2xl md:size-48" />
        ) : (
          <div className="size-40 rounded-2xl bg-white/10 md:size-48" />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white/40">
            {album.type}
            {album.lossless && (
              <span className="flex items-center gap-1 rounded bg-gold/15 px-1.5 py-0.5 text-gold">
                <BadgeCheck className="size-3" /> Lossless
              </span>
            )}
          </p>
          <h1 className="mt-1 truncate text-3xl font-black tracking-tight md:text-5xl">{album.title}</h1>
          <p className="mt-2 text-sm text-white/50">
            {artist?.name ?? "Unknown artist"} · {album.releaseDate ?? "—"} · {album.label ?? "Independent"}
          </p>
          <p className="mt-1 text-[13px] text-white/40">
            {tracks.length} {t("tracks")} · {formatTime(total)}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => tracks.length > 0 && playQueueNow(tracks, 0)}
              disabled={tracks.length === 0}
              className="flex items-center gap-2 rounded-full bg-[#1DB954] px-6 py-2.5 text-sm font-bold text-black transition-transform hover:scale-105 disabled:opacity-40"
            >
              <Play className="size-4 fill-black" /> {t("playAlbum")}
            </button>
            <AlbumLikeButton albumId={album.id} initial={album.liked} />
            <button onClick={() => void shareUrl(links.album(album.id), album.title).then((r) => r === "copied" && toast.success(t("copied")))} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/12"><Share2 className="size-4" /> {t("share")}</button>
            {artist && (
              <Link href={`/artists/${artist.id}`} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pe-3.5 ps-1.5 text-sm text-white/80 hover:bg-white/10">
                {artist.imageUrl ? (

                  <img src={artist.imageUrl} alt="" className="size-7 rounded-full object-cover" />
                ) : <span className="grid size-7 place-items-center rounded-full bg-white/10 text-xs font-bold">{artist.name[0]}</span>}
                {artist.name}
                <BrandIcon name={artist.source} color="brand" className="size-3.5" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
