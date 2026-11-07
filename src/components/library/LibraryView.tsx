"use client";

import { Heart, Clock3, Flame, Hourglass } from "lucide-react";
import { TrackList } from "@/components/tracks/TrackList";
import { AlbumCard, ArtistCard, PlaylistCard } from "@/components/cards/Cards";
import { SectionRow } from "@/components/sections/SectionRow";
import { formatCount } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { AlbumDTO, ArtistDTO, PlaylistDTO, StatsDTO, TrackDTO } from "@/lib/types";

export function LibraryView({ liked, playlists, recent, stats, follows, albums }: { liked: TrackDTO[]; playlists: PlaylistDTO[]; recent: TrackDTO[]; stats: StatsDTO; follows: ArtistDTO[]; albums: AlbumDTO[] }) {
  const t = useT();
  const statCards = [
    { icon: Flame, label: t("totalPlays"), value: formatCount(stats.totalPlays) },
    { icon: Hourglass, label: t("minutesListened"), value: formatCount(stats.totalMinutes) },
    { icon: Heart, label: t("likedCount"), value: String(liked.length) },
    { icon: Clock3, label: t("topGenre"), value: stats.genreDistribution[0]?.genre ?? "—" },
  ];
  return (
    <div className="p-4 md:p-6">
      <h1 className="px-1 text-3xl font-black tracking-tight">{t("libraryTitle")}</h1>
      <p className="mt-1 px-1 text-sm text-white/40">{t("librarySub")}</p>
      <div className="mt-5 grid grid-cols-2 gap-3 px-1 md:grid-cols-4">
        {statCards.map((s) => (
          <div key={s.label} className="glass-panel rounded-2xl p-4">
            <s.icon className="mb-2 size-5 text-[#1DB954]" />
            <p className="text-2xl font-extrabold tracking-tight">{s.value}</p>
            <p className="mt-0.5 text-xs text-white/40">{s.label}</p>
          </div>
        ))}
      </div>
      {stats.genreDistribution.length > 0 && (
        <div className="mt-6 px-1">
          <h2 className="mb-3 text-lg font-extrabold tracking-tight">{t("genreDNA")}</h2>
          <div className="flex flex-wrap items-end gap-3">
            {stats.genreDistribution.map((g) => {
              const max = stats.genreDistribution[0].plays || 1;
              const h = Math.round((g.plays / max) * 90) + 20;
              return (
                <div key={g.genre} className="flex flex-col items-center gap-1.5">
                  <div className="w-10 rounded-t-lg bg-gradient-to-t from-[#4E54C8] to-[#00D4FF]" style={{ height: `${h}px` }} title={`${g.plays}`} />
                  <span className="max-w-14 truncate text-[10px] font-medium uppercase tracking-wide text-white/40">{g.genre}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <section className="mt-8">
        <h2 className="mb-3 px-1 text-xl font-extrabold tracking-tight">{t("likedTracks")}</h2>
        <TrackList tracks={liked} emptyText={t("likedEmpty")} />
      </section>
      {follows.length > 0 && (
        <SectionRow title={t("followedArtists")} subtitle={`${follows.length}`}>
          {follows.map((a) => (
            <ArtistCard key={a.id} artist={a} />
          ))}
        </SectionRow>
      )}
      {albums.length > 0 && (
        <SectionRow title={t("likedAlbums")} subtitle={`${albums.length}`}>
          {albums.map((a) => (
            <AlbumCard key={a.id} album={a} />
          ))}
        </SectionRow>
      )}
      <SectionRow title={t("yourPlaylists")} subtitle={t("yourPlaylistsSub")}>
        {playlists.map((p) => (
          <PlaylistCard key={p.id} playlist={p} />
        ))}
      </SectionRow>
      <section className="mt-8">
        <h2 className="mb-3 px-1 text-xl font-extrabold tracking-tight">{t("recentlyPlayed")}</h2>
        <TrackList tracks={recent} />
      </section>
    </div>
  );
}
