
// Content cards: Track / Album / Artist / Playlist / Station / Room.
// Hover reveals a play button; click plays into the global queue.
import Link from "next/link";
import { Play, Radio, BadgeCheck, Heart } from "lucide-react";
import { motion } from "framer-motion";
import { cn, formatCount, formatTime } from "@/lib/utils";
import { usePlayerStore } from "@/stores/player-store";
import { playTrackNow } from "@/lib/player-actions";
import { BrandIcon, BRAND_LABEL } from "@/components/brand/BrandIcon";
import { FollowButton } from "@/components/artists/FollowButton";
import { AlbumLikeButton } from "@/components/albums/AlbumLikeButton";
import type { AlbumDTO, ArtistDTO, PlaylistDTO, RadioStationDTO, TrackDTO } from "@/lib/types";

function PlayOverlay({ onPlay }: { onPlay: () => void }) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.7 }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.9 }}
      className="absolute bottom-2 right-2 grid size-12 place-items-center rounded-full bg-[#1DB954] text-black opacity-100 shadow-xl shadow-black/50 transition-opacity duration-200 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPlay();
      }}
      aria-label="Play"
    >
      <Play className="ml-0.5 size-5 fill-black" />
    </motion.button>
  );
}

/** Source badge with the platform's OFFICIAL mark (simple-icons). */
export function SourceBadge({ track }: { track: TrackDTO }) {
  const label = BRAND_LABEL[track.source];
  if (!label) return null;
  return (
    <span className="absolute start-2 top-2 flex items-center gap-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur">
      <BrandIcon name={track.source} color="brand" className="size-3" />
      {label.toUpperCase()}
    </span>
  );
}

export function TrackCard({ track, queue, index }: { track: TrackDTO; queue?: TrackDTO[]; index?: number }) {
  const likedIds = usePlayerStore((s) => s.likedIds);
  const liked = likedIds.includes(track.id);
  return (
    <div
      className="card-hover group relative shrink-0 cursor-pointer rounded-2xl bg-white/[0.03]" style={{ width: "var(--density-card-w)", padding: "var(--density-card-pad)" }}
      onClick={() => playTrackNow(track, queue ? { queue, index: index ?? 0 } : undefined)}
    >
      <div className="relative mb-3">
        {track.coverUrl ? (

          <img src={track.coverUrl} alt={track.albumTitle ?? track.title} className="aspect-square w-full rounded-xl object-cover" />
        ) : (
          <div className="aspect-square w-full rounded-xl bg-white/10" />
        )}
        <SourceBadge track={track} />
        <PlayOverlay onPlay={() => playTrackNow(track, queue ? { queue, index: index ?? 0 } : undefined)} />
      </div>
      <p className="truncate text-base font-semibold">{track.title}</p>
      <p className="flex items-center gap-1 truncate text-sm text-[color:var(--app-muted)]">
        {liked && <Heart className="size-3 shrink-0 fill-rose text-rose" />}
        {track.artistName}
      </p>
      <p className="mt-0.5 font-mono text-[10px] text-white/30">
        {[track.genre, track.bpm > 0 ? `${Math.round(track.bpm)} BPM` : null, track.durationSec > 0 ? formatTime(track.durationSec) : null].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}

export function AlbumCard({ album }: { album: AlbumDTO }) {
  return (
    <Link href={`/albums/${album.id}`} className="card-hover group relative block shrink-0 rounded-2xl bg-white/[0.03]" style={{ width: "var(--density-card-w)", padding: "var(--density-card-pad)" }}>
      <div className="relative mb-3">
        {album.coverUrl ? (

          <img src={album.coverUrl} alt={album.title} className="aspect-square w-full rounded-xl object-cover" />
        ) : (
          <div className="aspect-square w-full rounded-xl bg-white/10" />
        )}
        <span className="absolute start-2 top-2"><AlbumLikeButton albumId={album.id} initial={album.liked} compact /></span>
        <span className="absolute bottom-2 end-2 grid size-12 place-items-center rounded-full bg-[#1DB954] text-black opacity-100 shadow-xl transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100">
          <Play className="ms-0.5 size-5 fill-black" />
        </span>
      </div>
      <p className="truncate text-base font-semibold">{album.title}</p>
      <p className="truncate text-sm text-[color:var(--app-muted)]">
        {album.artistName}{album.releaseDate ? ` · ${album.releaseDate.slice(0, 4)}` : ""}
      </p>
    </Link>
  );
}

export function ArtistCard({ artist }: { artist: ArtistDTO }) {
  return (
    <Link href={`/artists/${artist.id}`} className="card-hover group relative block shrink-0 rounded-2xl bg-white/[0.03] text-center" style={{ width: "var(--density-card-w)", padding: "var(--density-card-pad)" }}>
      <span className="relative mx-auto mb-3 block aspect-square w-full">
        {artist.imageUrl ? (

          <img src={artist.imageUrl} alt={artist.name} className="h-full w-full rounded-full object-cover ring-2 ring-white/10" />
        ) : (
          <span className="grid h-full w-full place-items-center rounded-full bg-white/10 text-3xl font-black text-white/60">{artist.name[0]}</span>
        )}
        <span className="absolute bottom-1 end-1 grid size-7 place-items-center rounded-full bg-black shadow ring-2 ring-black" title={artist.source}>
          <BrandIcon name={artist.source} color="brand" className="size-3.5" />
        </span>
      </span>
      <p className="flex items-center justify-center gap-1 truncate text-base font-semibold">
        {artist.name}
        {artist.verified && <BadgeCheck className="size-3.5 shrink-0 text-cyan" />}
      </p>
      <p className="text-xs text-[color:var(--app-muted)]">{[artist.monthlyListeners > 0 ? formatCount(artist.monthlyListeners) : null, artist.followers > 0 ? `${formatCount(artist.followers)} متابع` : null].filter(Boolean).join(" · ") || artist.source}</p>
      <span className="mt-2 flex justify-center"><FollowButton artistId={artist.id} initial={artist.following} size="sm" /></span>
    </Link>
  );
}

export function PlaylistCard({ playlist }: { playlist: PlaylistDTO }) {
  return (
    <Link href={`/playlists/${playlist.id}`} className="card-hover group relative block shrink-0 rounded-2xl bg-white/[0.03]" style={{ width: "var(--density-card-w)", padding: "var(--density-card-pad)" }}>
      <div className="relative mb-3">
        {playlist.coverUrl ? (

          <img src={playlist.coverUrl} alt={playlist.title} className="aspect-square w-full rounded-xl object-cover" />
        ) : (
          <div className="aspect-square w-full rounded-xl bg-gradient-to-br from-[#4E54C8] to-[#FA2D55]" />
        )}
        <span className="absolute bottom-2 right-2 grid size-12 place-items-center rounded-full bg-[#1DB954] text-black opacity-100 shadow-xl transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100">
          <Play className="ml-0.5 size-5 fill-black" />
        </span>
      </div>
      <p className="truncate text-base font-semibold">{playlist.title}</p>
      <p className="truncate text-sm text-[color:var(--app-muted)]">
        {playlist.trackCount} مقاطع{playlist.durationSec > 0 ? ` · ${formatTime(playlist.durationSec)}` : ""}
      </p>
    </Link>
  );
}

export function StationCard({ station, onPlay }: { station: RadioStationDTO; onPlay: () => void }) {
  return (
    <div className="card-hover group relative shrink-0 cursor-pointer rounded-2xl bg-white/[0.03]" style={{ width: "calc(var(--density-card-w) + 4rem)", padding: "var(--density-card-pad)" }} onClick={onPlay}>
      <div className="relative mb-3">
        <img src={station.coverUrl} alt={station.name} className="aspect-video w-full rounded-xl object-cover" />
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-cyan backdrop-blur">
          <Radio className="size-3" /> LIVE
        </span>
        <PlayOverlay onPlay={onPlay} />
      </div>
      <p className="truncate text-base font-semibold">{station.name}</p>
      <p className="line-clamp-2 text-xs text-white/45">{station.description}</p>
      <p className="mt-1 font-mono text-[10px] text-white/30">
        {[station.genre, station.bitrate > 0 ? `${station.bitrate} kbps` : null, station.codec || null].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}

export const cardMotion = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-40px" },
  transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
};

export { cn };
