// ============================================================================
//  Reels recommendation engine (TikTok-style feed over real music).
//  Score per track =
//      3.0 · followed-artist boost
//    + 2.0 · affinity to your top artists (listening history)
//    + 1.5 · affinity to your top genres
//    + 1.2 · liked-track / liked-album artist boost
//    + 1.0 · reel engagement (likes / completes you gave to the same artist)
//    + 0.6 · global popularity (log plays)
//    + 0.8 · freshness / exploration noise (so the feed never stalls)
//    − 2.5 · recently seen / skipped penalty
//  Candidates come from the catalog + live YouTube Music pulls for your
//  followed artists and top genres (so the feed keeps growing).
// ============================================================================
import { db } from "@/db";
import { albumLikes, albums, artistFollows, artists, listeningHistory, reelEvents, tracks, userTrackLikes } from "@/db/schema";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { hydrateArtists, hydrateTracks } from "./queries";
import { searchYouTubeMusic } from "./youtube";
import { jamendoPopular } from "./platforms";
import { upsertTracks } from "./catalog";
import { splitArtists } from "./artist-profile";
import type { ReelDTO, TrackDTO } from "@/lib/types";

export async function buildReels(userId: number, limit = 20, cursor = 0): Promise<ReelDTO[]> {
  // ---------- taste profile ----------
  const [follows, topArtistRows, topGenreRows, likedRows, likedAlbumRows, reelRows, recentSeen] = await Promise.all([
    db.select({ artistId: artistFollows.artistId }).from(artistFollows).where(eq(artistFollows.userId, userId)),
    db
      .select({ artistId: tracks.artistId, c: sql<number>`count(*)::int` })
      .from(listeningHistory)
      .innerJoin(tracks, eq(listeningHistory.trackId, tracks.id))
      .where(eq(listeningHistory.userId, userId))
      .groupBy(tracks.artistId)
      .orderBy(desc(sql`count(*)`))
      .limit(10),
    db
      .select({ genre: tracks.genre, c: sql<number>`count(*)::int` })
      .from(listeningHistory)
      .innerJoin(tracks, eq(listeningHistory.trackId, tracks.id))
      .where(eq(listeningHistory.userId, userId))
      .groupBy(tracks.genre)
      .orderBy(desc(sql`count(*)`))
      .limit(5),
    db.select({ trackId: userTrackLikes.trackId }).from(userTrackLikes).where(eq(userTrackLikes.userId, userId)),
    db.select({ albumId: albumLikes.albumId }).from(albumLikes).where(eq(albumLikes.userId, userId)),
    db
      .select({ trackId: reelEvents.trackId, kind: reelEvents.kind, watchedSec: reelEvents.watchedSec })
      .from(reelEvents)
      .where(eq(reelEvents.userId, userId))
      .orderBy(desc(reelEvents.createdAt))
      .limit(400),
    db
      .select({ trackId: reelEvents.trackId })
      .from(reelEvents)
      .where(and(eq(reelEvents.userId, userId), gt(reelEvents.createdAt, sql`now() - interval '6 hours'`)))
      .limit(300),
  ]);

  const followed = new Set(follows.map((f) => f.artistId));
  const topArtist = new Map(topArtistRows.map((r) => [r.artistId, r.c]));
  const maxArtistPlays = Math.max(1, ...topArtistRows.map((r) => r.c));
  const topGenre = new Map(topGenreRows.map((r) => [r.genre, r.c]));
  const maxGenre = Math.max(1, ...topGenreRows.map((r) => r.c));
  const likedTracks = new Set(likedRows.map((r) => r.trackId));
  const likedAlbums = new Set(likedAlbumRows.map((r) => r.albumId));
  const seenRecently = new Set(recentSeen.map((r) => r.trackId));

  // artists of liked tracks
  const likedArtistIds = new Set<number>();
  if (likedTracks.size) {
    const rows = await db.select({ artistId: tracks.artistId }).from(tracks).where(inArray(tracks.id, [...likedTracks]));
    for (const r of rows) likedArtistIds.add(r.artistId);
  }
  if (likedAlbums.size) {
    const rows = await db.select({ artistId: albums.artistId }).from(albums).where(inArray(albums.id, [...likedAlbums]));
    for (const r of rows) likedArtistIds.add(r.artistId);
  }
  // reel engagement per artist
  const engagedTrackIds = reelRows.filter((r) => r.kind === "like" || r.kind === "complete" || r.kind === "download").map((r) => r.trackId);
  const skippedTrackIds = new Set(reelRows.filter((r) => r.kind === "skip" && r.watchedSec < 3).map((r) => r.trackId));
  const engagedArtists = new Map<number, number>();
  if (engagedTrackIds.length) {
    const rows = await db.select({ artistId: tracks.artistId }).from(tracks).where(inArray(tracks.id, engagedTrackIds));
    for (const r of rows) engagedArtists.set(r.artistId, (engagedArtists.get(r.artistId) ?? 0) + 1);
  }

  // ---------- grow candidate pool (live, best effort) ----------
  if (cursor === 0) {
    const pulls: Promise<unknown>[] = [];
    const followedNames = followed.size
      ? (await db.select({ name: artists.name }).from(artists).where(inArray(artists.id, [...followed].slice(0, 4)))).map((r) => r.name)
      : [];
    for (const n of followedNames) pulls.push(searchYouTubeMusic(n, 8).then((r) => upsertTracks(r, userId)).catch(() => null));
    for (const g of [...topGenre.keys()].slice(0, 2)) if (g && g !== "chart") pulls.push(searchYouTubeMusic(`${g} music`, 8).then((r) => upsertTracks(r, userId)).catch(() => null));
    if (pulls.length === 0) pulls.push(searchYouTubeMusic("trending songs", 12).then((r) => upsertTracks(r, userId)).catch(() => null));
    pulls.push(jamendoPopular(10).then((r) => upsertTracks(r, userId)).catch(() => null));
    await Promise.allSettled(pulls);
  }

  // ---------- candidates ----------
  const candRows = await db
    .select()
    .from(tracks)
    .where(and(sql`${tracks.source} <> 'radio'`, sql`${tracks.durationSec} between 30 and 1200`))
    .orderBy(desc(tracks.createdAt))
    .limit(600);

  const popMax = Math.log10(Math.max(10, ...candRows.map((t) => t.playCount + 1)));
  const seed = Math.floor(Date.now() / (1000 * 60 * 10)); // changes every 10 min
  const noise = (id: number) => {
    const x = Math.sin(id * 9301 + seed * 49297) * 233280;
    return x - Math.floor(x);
  };

  const scored = candRows.map((t) => {
    let score = 0;
    const reasons: string[] = [];
    if (followed.has(t.artistId)) {
      score += 3;
      reasons.push("following");
    }
    const ap = topArtist.get(t.artistId);
    if (ap) {
      score += 2 * (ap / maxArtistPlays);
      reasons.push("you listen to this artist");
    }
    const gp = topGenre.get(t.genre);
    if (gp) {
      score += 1.5 * (gp / maxGenre);
      if (!reasons.length) reasons.push(`your genre · ${t.genre}`);
    }
    if (likedArtistIds.has(t.artistId)) {
      score += 1.2;
      if (!reasons.length) reasons.push("from your likes");
    }
    const eng = engagedArtists.get(t.artistId);
    if (eng) score += Math.min(1, eng * 0.25);
    score += 0.6 * (Math.log10(t.playCount + 1) / popMax);
    score += 0.8 * noise(t.id);
    if (seenRecently.has(t.id)) score -= 2.5;
    if (skippedTrackIds.has(t.id)) score -= 1.5;
    if (likedTracks.has(t.id)) score -= 0.8; // you already know it — show less
    if (t.source === "youtube") score += 0.3; // has video
    if (!reasons.length) reasons.push(t.source === "youtube" ? "trending on YouTube Music" : `discover · ${t.source}`);
    return { t, score, reason: reasons[0] };
  });
  scored.sort((a, b) => b.score - a.score);

  // diversity: max 2 per artist in a page
  const perArtist = new Map<number, number>();
  const page: typeof scored = [];
  for (const s of scored) {
    const n = perArtist.get(s.t.artistId) ?? 0;
    if (n >= 2) continue;
    perArtist.set(s.t.artistId, n + 1);
    page.push(s);
    if (page.length >= cursor + limit) break;
  }
  const slice = page.slice(cursor, cursor + limit);
  const trackDTOs = await hydrateTracks(slice.map((s) => s.t), userId);
  const artistIds = [...new Set(slice.map((s) => s.t.artistId))];
  const artistRows = artistIds.length ? await db.select().from(artists).where(inArray(artists.id, artistIds)) : [];
  const artistDTOs = await hydrateArtists(artistRows, userId);
  const byId = new Map(artistDTOs.map((a) => [a.id, a]));

  // featuring artist (second name in "A feat. B") if present in catalog
  const featNames = new Map<number, string>();
  for (const s of slice) {
    const a = byId.get(s.t.artistId);
    const parts = a ? splitArtists(a.name) : [];
    if (parts.length > 1) featNames.set(s.t.id, parts[1]);
  }
  const featRows = featNames.size
    ? await db.select().from(artists).where(inArray(artists.name, [...new Set(featNames.values())]))
    : [];
  const featDTOs = await hydrateArtists(featRows, userId);

  // stats per track
  const ids = slice.map((s) => s.t.id);
  const statRows = ids.length
    ? await db
        .select({ trackId: reelEvents.trackId, kind: reelEvents.kind, c: sql<number>`count(*)::int` })
        .from(reelEvents)
        .where(inArray(reelEvents.trackId, ids))
        .groupBy(reelEvents.trackId, reelEvents.kind)
    : [];
  const likes = new Map<number, number>();
  const views = new Map<number, number>();
  for (const r of statRows) {
    if (r.kind === "like") likes.set(r.trackId, r.c);
    if (r.kind === "view") views.set(r.trackId, r.c);
  }

  return slice.map((s, i): ReelDTO => {
    const track: TrackDTO = trackDTOs.find((t) => t.id === s.t.id) ?? trackDTOs[i];
    const featName = featNames.get(s.t.id);
    return {
      track,
      artist: byId.get(s.t.artistId) ?? null,
      featuring: featName ? featDTOs.find((f) => f.name.toLowerCase() === featName.toLowerCase()) ?? null : null,
      reason: s.reason,
      score: Number(s.score.toFixed(2)),
      likes: likes.get(s.t.id) ?? 0,
      views: (views.get(s.t.id) ?? 0) + Math.round(s.t.playCount / 10),
    };
  });
}
