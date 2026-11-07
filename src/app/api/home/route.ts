import { followedArtists, getDemoUser, getStats, listPlaylists, recentlyPlayed } from "@/lib/server/queries";
import { searchYouTubeMusic, youtubeTrending } from "@/lib/server/youtube";
import { audiusTrending, jamendoPopular } from "@/lib/server/platforms";
import { deezerChart, spotifyPlaylist } from "@/lib/server/majors";
import { upsertTracks } from "@/lib/server/catalog";
import type { HomeSectionDTO, TrackDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
//  GET /api/home — personalized real-music sections.
//  "Because you listened to <artist>" rows are built from the user's own
//  listening history (top artists / top genre), searched live on YouTube Music.
// ---------------------------------------------------------------------------
export async function GET() {
  const user = await getDemoUser();
  const sections = await buildHomeSections(user.id);
  // Two consecutive loads must never look identical (the user asked for a home
  // page that changes on every refresh) — the sources are shuffled upstream,
  // and the response is explicitly uncacheable so no CDN/proxy freezes it.
  return Response.json(
    { sections, builtAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function buildHomeSections(userId: number): Promise<HomeSectionDTO[]> {
  const [stats, playlistsData, recent, follows] = await Promise.all([
    getStats(userId),
    listPlaylists(userId),
    recentlyPlayed(userId, 12),
    followedArtists(userId),
  ]);

  const topArtists = stats.topArtists.slice(0, 3);
  const topGenre = stats.genreDistribution[0]?.genre;

  const safeYT = async (q: string, n: number): Promise<TrackDTO[]> => {
    try {
      return await upsertTracks(await searchYouTubeMusic(q, n), userId);
    } catch {
      return [];
    }
  };

  const followRows = await Promise.all(follows.slice(0, 2).map((a) => safeYT(a.name, 10)));
  const [jamendo, spEgypt, spGlobal, dzChart] = await Promise.all([
    jamendoPopular(14).then((r) => upsertTracks(r, userId)).catch(() => [] as TrackDTO[]),
    spotifyPlaylist("37i9dQZEVXbLn7RQmT5Xv2", 20, "chart").then((r) => upsertTracks(r, userId)).catch(() => [] as TrackDTO[]),
    spotifyPlaylist("37i9dQZEVXbMDoHDwVN2tF", 20, "chart").then((r) => upsertTracks(r, userId)).catch(() => [] as TrackDTO[]),
    deezerChart(18).then((r) => upsertTracks(r, userId)).catch(() => [] as TrackDTO[]),
  ]);
  const [trending, audius, ...personal] = await Promise.all([
    youtubeTrending(18).then((r) => upsertTracks(r, userId)).catch(() => [] as TrackDTO[]),
    audiusTrending(14).then((r) => upsertTracks(r, userId)).catch(() => [] as TrackDTO[]),
    ...topArtists.map((a) => safeYT(a.name, 12)),
  ]);
  const genreRow = topGenre && topGenre !== "chart" ? await safeYT(`${topGenre} music`, 12) : [];

  const sections: HomeSectionDTO[] = [
    { id: "hero", title: "Trending Now", subtitle: "YouTube Music · right now", kind: "tracks", items: trending.slice(0, 6) },
  ];
  if (follows.length > 0) {
    sections.push({ id: "following", title: "From artists you follow", subtitle: `${follows.length} artists`, kind: "artists", items: follows });
    follows.slice(0, 2).forEach((a, i) => {
      if (followRows[i]?.length) sections.push({ id: `follow-${a.id}`, title: `New from ${a.name}`, subtitle: "Because you follow them", kind: "tracks", items: followRows[i] });
    });
  }
  topArtists.forEach((a, i) => {
    if (personal[i] && personal[i].length > 0) {
      sections.push({
        id: `because-${a.id}`,
        title: `Because you listened to ${a.name}`,
        subtitle: `${a.plays} plays · more from ${a.name} and similar artists`,
        kind: "tracks",
        items: personal[i],
      });
    }
  });
  if (genreRow.length > 0) {
    sections.push({
      id: "top-genre",
      title: `Your top genre: ${topGenre}`,
      subtitle: "Fresh picks matched to what you play most",
      kind: "tracks",
      items: genreRow,
    });
  }
  sections.push(
    { id: "trending", title: "Trending on YouTube Music", subtitle: "Full-length songs · real-time chart", kind: "tracks", items: trending },
    { id: "spotify-eg", title: "Spotify Top 50 — Egypt", subtitle: "Official Spotify chart · plays full-length via YouTube Music", kind: "tracks", items: spEgypt },
    { id: "spotify-global", title: "Spotify Top 50 — Global", subtitle: "Official Spotify chart", kind: "tracks", items: spGlobal },
    { id: "deezer", title: "Deezer Top Chart", subtitle: "Official Deezer chart", kind: "tracks", items: dzChart },
    { id: "audius", title: "Audius Trending", subtitle: "Independent artists · lossless-ready downloads", kind: "tracks", items: audius },
    { id: "jamendo", title: "Jamendo · Free music", subtitle: "Creative Commons · full MP3 downloads", kind: "tracks", items: jamendo },
    { id: "playlists", title: "Your Playlists", subtitle: "Created by you or DON MUSE AI", kind: "playlists", items: playlistsData },
    { id: "recent", title: "Recently Played", subtitle: "Pick up where you left off", kind: "tracks", items: recent },
  );
  return sections;
}
