
// Renders home sections with translated titles (client-side i18n).
import { SectionRow } from "@/components/sections/SectionRow";
import { ArtistCard, PlaylistCard, TrackCard } from "@/components/cards/Cards";
import { useT } from "@/lib/i18n";
import type { ArtistDTO, HomeSectionDTO, PlaylistDTO, TrackDTO } from "@/lib/types";

export function HomeSections({ sections }: { sections: HomeSectionDTO[] }) {
  const t = useT();

  const titleFor = (s: HomeSectionDTO): { title: string; subtitle: string } => {
    if (s.id.startsWith("because-")) {
      const artist = s.title.replace("Because you listened to ", "");
      return { title: `${t("becauseYouListened")} ${artist}`, subtitle: `${t("moreFrom")} ${artist}` };
    }
    if (s.id.startsWith("follow-")) return { title: `${s.title.replace("New from ", "")} · ${t("following")}`, subtitle: t("followedArtists") };
    switch (s.id) {
      case "following":
        return { title: t("followedArtists"), subtitle: s.subtitle };
      case "top-genre":
        return { title: `${t("yourTopGenre")}: ${s.title.split(": ")[1] ?? ""}`, subtitle: t("freshPicks") };
      case "trending":
        return { title: t("trendingYT"), subtitle: t("trendingYTSub") };
      case "audius":
        return { title: t("audiusTrending"), subtitle: t("audiusSub") };
      case "playlists":
        return { title: t("yourPlaylists"), subtitle: t("yourPlaylistsSub") };
      case "recent":
        return { title: t("recentlyPlayed"), subtitle: t("recentlySub") };
      default:
        return { title: s.title, subtitle: s.subtitle };
    }
  };

  return (
    <>
      {sections.map((s) => {
        if (s.items.length === 0) return null;
        const { title, subtitle } = titleFor(s);
        if (s.kind === "playlists") {
          return (
            <SectionRow key={s.id} title={title} subtitle={subtitle}>
              {(s.items as PlaylistDTO[]).map((p) => (
                <PlaylistCard key={p.id} playlist={p} />
              ))}
            </SectionRow>
          );
        }
        if (s.kind === "artists") {
          return (
            <SectionRow key={s.id} title={title} subtitle={subtitle}>
              {(s.items as ArtistDTO[]).map((a) => (
                <ArtistCard key={a.id} artist={a} />
              ))}
            </SectionRow>
          );
        }
        if (s.kind === "tracks") {
          const items = s.items as TrackDTO[];
          return (
            <SectionRow key={s.id} title={title} subtitle={subtitle}>
              {items.map((tr, i) => (
                <TrackCard key={tr.id} track={tr} queue={items} index={i} />
              ))}
            </SectionRow>
          );
        }
        return null;
      })}
    </>
  );
}
