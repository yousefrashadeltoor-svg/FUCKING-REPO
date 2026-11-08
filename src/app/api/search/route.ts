import { NextRequest } from "next/server";
import { getDemoUser, hydrateArtists, searchAll } from "@/lib/server/queries";
import { searchYouTubeAlbums, searchYouTubeArtists, searchYouTubeMusic } from "@/lib/server/youtube";
import { searchAudius, searchSoundCloud, searchArchive, searchJamendo, searchBandcamp, searchDailymotion, searchOdysee } from "@/lib/server/platforms";
import { searchDeezer, searchITunes, searchSpotify } from "@/lib/server/majors";
import { upsertAlbums, upsertArtists, upsertTracks } from "@/lib/server/catalog";
import type { ExternalTrack, ExternalSource } from "@/lib/server/external";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
//  GET /api/search?q=...&source=all|youtube|audius|soundcloud|archive
//  Live multi-platform search — every result is a REAL full-length track:
//  YouTube Music (primary) · Audius · SoundCloud · Internet Archive.
//  Results are upserted into the catalog cache for stable ids.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const source = (req.nextUrl.searchParams.get("source") ?? "all") as "all" | ExternalSource;
  if (q.length < 1) {
    return Response.json({ tracks: [], albums: [], artists: [], playlists: [] });
  }
  const user = await getDemoUser();

  const jobs: Promise<ExternalTrack[]>[] = [];
  const want = (s: ExternalSource) => source === "all" || source === s;
  if (want("youtube")) jobs.push(searchYouTubeMusic(q, source === "youtube" ? 30 : 20));
  if (want("audius")) jobs.push(searchAudius(q, source === "audius" ? 24 : 10));
  if (want("soundcloud")) jobs.push(searchSoundCloud(q, source === "soundcloud" ? 15 : 8));
  if (want("archive")) jobs.push(searchArchive(q, source === "archive" ? 12 : 5));
  if (want("jamendo")) jobs.push(searchJamendo(q, source === "jamendo" ? 24 : 8));
  if (want("bandcamp")) jobs.push(searchBandcamp(q, source === "bandcamp" ? 12 : 5));
  if (want("dailymotion")) jobs.push(searchDailymotion(q, source === "dailymotion" ? 16 : 6));
  if (want("odysee")) jobs.push(searchOdysee(q, source === "odysee" ? 12 : 5));
  if (want("spotify")) jobs.push(searchSpotify(q, source === "spotify" ? 20 : 6));
  if (want("applemusic")) jobs.push(searchITunes(q, source === "applemusic" ? 24 : 8));
  if (want("deezer")) jobs.push(searchDeezer(q, source === "deezer" ? 24 : 8));

  const settled = await Promise.allSettled(jobs);
  const external: ExternalTrack[] = [];
  const seen = new Set<string>();
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    for (const t of r.value) {
      const key = `${t.source}:${t.sourceId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      external.push(t);
    }
  }

  // YouTube Music first, then the other full-length platforms.
  const rank: Record<ExternalSource, number> = { youtube: 0, spotify: 1, applemusic: 2, deezer: 3, audius: 4, soundcloud: 5, jamendo: 6, bandcamp: 7, dailymotion: 8, archive: 9, odysee: 10 };
  external.sort((a, b) => rank[a.source] - rank[b.source]);
  const [tracks, ytArtists, ytAlbums] = await Promise.all([
    upsertTracks(external.slice(0, 50), user.id),
    source === "all" || source === "youtube" ? searchYouTubeArtists(q, 8).catch(() => []) : Promise.resolve([]),
    source === "all" || source === "youtube" ? searchYouTubeAlbums(q, 10).catch(() => []) : Promise.resolve([]),
  ]);
  // Real channel hits → catalog artists. The official API returns no release
  // year for playlists, so year stays null (never invented).
  const albumHits = (ytAlbums as { id: string; title: string; channel?: string; thumb: string | null }[]).map((a) => ({
    id: a.id,
    title: a.title,
    artistName: a.channel ?? "Unknown Artist",
    year: null as string | null,
    imageUrl: a.thumb,
  }));
  const [artistRowsYT, albumRowsYT] = await Promise.all([upsertArtists(ytArtists), upsertAlbums(albumHits)]);
  const local = await searchAll(q, user.id);
  // YouTube Music artists/albums first (real photos / covers), then local matches.
  const artistNames = new Map(albumRowsYT.map((a) => [a.artistId, ""]));
  if (artistNames.size > 0) {
    const { db } = await import("@/db");
    const { artists: artistsTbl } = await import("@/db/schema");
    const { inArray } = await import("drizzle-orm");
    const rows = await db.select({ id: artistsTbl.id, name: artistsTbl.name }).from(artistsTbl).where(inArray(artistsTbl.id, [...artistNames.keys()]));
    for (const r of rows) artistNames.set(r.id, r.name);
  }
  // Real follower / audience numbers + verification for every artist card.
  const hydratedYT = await hydrateArtists(artistRowsYT, user.id).catch(() => []);
  const artistsOrdered = [...hydratedYT, ...local.artists]
    .filter((a, i, arr) => arr.findIndex((b) => b.id === a.id) === i)
    .sort((a, b) => Number(!!b.verified) - Number(!!a.verified) || (b.followers ?? 0) - (a.followers ?? 0));
  const albumsOrdered = [
    ...albumRowsYT.map((r) => ({ id: r.id, title: r.title, slug: r.slug, artistId: r.artistId, artistName: artistNames.get(r.artistId) ?? "", coverUrl: r.coverUrl, releaseDate: r.releaseDate, type: r.type, totalTracks: r.totalTracks, genres: r.genres, lossless: r.lossless, label: r.label })),
    ...local.albums,
  ].filter((a, i, arr) => arr.findIndex((b) => b.id === a.id) === i);

  return Response.json({
    tracks,
    albums: albumsOrdered,
    artists: artistsOrdered,
    playlists: local.playlists,
    sources: Object.fromEntries((["youtube", "spotify", "applemusic", "deezer", "audius", "soundcloud", "archive", "jamendo", "bandcamp", "dailymotion", "odysee"] as const).map((k) => [k, external.filter((t) => t.source === k).length])),
  });
}
