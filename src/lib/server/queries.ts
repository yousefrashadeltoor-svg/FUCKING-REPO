// Server-side data access layer for DON MUSE.
// All DB access for routes + server components flows through here.
import { db, ensureSchema } from "@/db";
import {
  albumLikes,
  albums,
  artistFollows,
  artists,
  listeningHistory,
  playlistTracks,
  playlists,
  reelEvents,
  tracks,
  userTrackLikes,
  users,
} from "@/db/schema";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { ensureSessionUser, getCurrentUser } from "@/lib/server/session";
import type {
  AlbumDTO,
  ArtistDTO,
  PlaylistDTO,
  StatsDTO,
  TrackDTO,
  UserDTO,
} from "@/lib/types";

/* ------------------------------ mappers ------------------------------ */

const streamUrl = (id: number) => `/api/tracks/${id}/stream`;

export function toArtistDTO(r: typeof artists.$inferSelect, following = false, followers = 0): ArtistDTO {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    bio: r.bio,
    imageUrl: r.imageUrl,
    verified: r.verified,
    monthlyListeners: r.monthlyListeners,
    genres: r.genres,
    source: (r.source as ArtistDTO["source"]) ?? "youtube",
    sourceId: r.sourceId,
    following,
    followers,
  };
}

/** Hydrate artist rows with follow state + follower counts. */
export async function hydrateArtists(rows: (typeof artists.$inferSelect)[], userId?: number): Promise<ArtistDTO[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [followRows, countRows] = await Promise.all([
    userId
      ? db.select({ artistId: artistFollows.artistId }).from(artistFollows).where(and(eq(artistFollows.userId, userId), inArray(artistFollows.artistId, ids)))
      : Promise.resolve([] as { artistId: number }[]),
    db.select({ artistId: artistFollows.artistId, c: sql<number>`count(*)::int` }).from(artistFollows).where(inArray(artistFollows.artistId, ids)).groupBy(artistFollows.artistId),
  ]);
  const following = new Set(followRows.map((f) => f.artistId));
  const counts = new Map(countRows.map((c) => [c.artistId, c.c]));
  return rows.map((r) => toArtistDTO(r, following.has(r.id), counts.get(r.id) ?? 0));
}

export async function toggleFollow(userId: number, artistId: number): Promise<boolean> {
  const existing = await db.select().from(artistFollows).where(and(eq(artistFollows.userId, userId), eq(artistFollows.artistId, artistId))).limit(1);
  if (existing.length > 0) {
    await db.delete(artistFollows).where(and(eq(artistFollows.userId, userId), eq(artistFollows.artistId, artistId)));
    return false;
  }
  await db.insert(artistFollows).values({ userId, artistId });
  return true;
}

export async function followedArtists(userId: number): Promise<ArtistDTO[]> {
  const rows = await db
    .select({ a: artists })
    .from(artistFollows)
    .innerJoin(artists, eq(artistFollows.artistId, artists.id))
    .where(eq(artistFollows.userId, userId))
    .orderBy(desc(artistFollows.createdAt));
  return hydrateArtists(rows.map((r) => r.a), userId);
}

export async function toggleAlbumLike(userId: number, albumId: number): Promise<boolean> {
  const existing = await db.select().from(albumLikes).where(and(eq(albumLikes.userId, userId), eq(albumLikes.albumId, albumId))).limit(1);
  if (existing.length > 0) {
    await db.delete(albumLikes).where(and(eq(albumLikes.userId, userId), eq(albumLikes.albumId, albumId)));
    return false;
  }
  await db.insert(albumLikes).values({ userId, albumId });
  return true;
}

export async function likedAlbums(userId: number): Promise<AlbumDTO[]> {
  const rows = await db
    .select({ al: albums })
    .from(albumLikes)
    .innerJoin(albums, eq(albumLikes.albumId, albums.id))
    .where(eq(albumLikes.userId, userId))
    .orderBy(desc(albumLikes.createdAt));
  const names = await artistNameMap(rows.map((r) => r.al.artistId));
  return rows.map((r) => ({ ...toAlbumDTO(r.al, names.get(r.al.artistId) ?? "Unknown Artist"), liked: true }));
}

export async function albumLikedSet(userId: number, albumIds: number[]): Promise<Set<number>> {
  if (albumIds.length === 0) return new Set();
  const rows = await db.select({ albumId: albumLikes.albumId }).from(albumLikes).where(and(eq(albumLikes.userId, userId), inArray(albumLikes.albumId, albumIds)));
  return new Set(rows.map((r) => r.albumId));
}

export async function recordReelEvent(userId: number, trackId: number, kind: string, watchedSec: number) {
  await db.insert(reelEvents).values({ userId, trackId, kind, watchedSec });
}

function toAlbumDTO(
  r: typeof albums.$inferSelect,
  artistName: string,
): AlbumDTO {
  return {
    id: r.id,
    title: r.title,
    slug: r.slug,
    artistId: r.artistId,
    artistName,
    coverUrl: r.coverUrl,
    releaseDate: r.releaseDate,
    type: r.type,
    totalTracks: r.totalTracks,
    genres: r.genres,
    lossless: r.lossless,
    label: r.label,
    liked: false,
  };
}

function toTrackDTO(
  r: typeof tracks.$inferSelect,
  artistName: string,
  album: { title: string; coverUrl: string | null } | null,
  liked: boolean,
): TrackDTO {
  return {
    id: r.id,
    title: r.title,
    artistId: r.artistId,
    artistName,
    albumId: r.albumId,
    albumTitle: album?.title ?? null,
    coverUrl: album?.coverUrl ?? null,
    durationSec: r.durationSec,
    source: (r.source as TrackDTO["source"]) ?? "internal",
    sourceId: r.sourceId,
    previewUrl: r.previewUrl,
    streamUrl: streamUrl(r.id),
    waveform: r.waveform,
    loudnessLufs: r.loudnessLufs,
    bpm: r.bpm,
    key: r.key,
    energy: r.energy,
    valence: r.valence,
    danceability: r.danceability,
    acousticness: r.acousticness,
    explicit: r.explicit,
    genre: r.genre,
    language: r.language,
    year: r.year,
    isrc: r.isrc,
    codec: r.codec,
    bitrate: r.bitrate,
    lossless: r.lossless,
    playCount: r.playCount,
    lyrics: r.lyrics,
    liked,
  };
}

/* ------------------------------ helpers ------------------------------ */

/** The demo user that owns the seeded library. */
/**
 * The current listener.
 *
 * Kept under the old name so every existing call site automatically becomes
 * per-user, but it is no longer a shared throw-away account: `ensureSessionUser`
 * resolves the signed session cookie to its own `users` row, so two visitors
 * never see each other's playlists, likes, follows or history.
 */
export async function getDemoUser(): Promise<UserDTO> {
  return ensureSessionUser();
}

/** Read-only variant for server components that must not set cookies. */
export async function getViewer(): Promise<UserDTO> {
  return getCurrentUser();
}

/** Guard for mutations: throws a 404 when the resource is not owned. */
export async function assertPlaylistOwner(playlistId: number, userId: number): Promise<boolean> {
  const [row] = await db
    .select({ ownerId: playlists.ownerId, isPublic: playlists.isPublic })
    .from(playlists)
    .where(eq(playlists.id, playlistId))
    .limit(1);
  if (!row) return false;
  return row.ownerId === userId || row.isPublic;
}

async function artistNameMap(ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ id: artists.id, name: artists.name })
    .from(artists)
    .where(inArray(artists.id, ids));
  for (const r of rows) map.set(r.id, r.name);
  return map;
}

async function albumMap(ids: (number | null)[]): Promise<Map<number, { title: string; coverUrl: string | null }>> {
  const map = new Map<number, { title: string; coverUrl: string | null }>();
  const clean = ids.filter((x): x is number => x !== null);
  if (clean.length === 0) return map;
  const rows = await db
    .select({ id: albums.id, title: albums.title, coverUrl: albums.coverUrl })
    .from(albums)
    .where(inArray(albums.id, clean));
  for (const r of rows) map.set(r.id, { title: r.title, coverUrl: r.coverUrl });
  return map;
}

async function likedSet(userId: number, trackIds: number[]): Promise<Set<number>> {
  const set = new Set<number>();
  if (trackIds.length === 0) return set;
  const rows = await db
    .select({ trackId: userTrackLikes.trackId })
    .from(userTrackLikes)
    .where(
      and(
        eq(userTrackLikes.userId, userId),
        inArray(userTrackLikes.trackId, trackIds),
      ),
    );
  for (const r of rows) set.add(r.trackId);
  return set;
}

/** Hydrate raw track rows into full DTOs (artist name, album info, liked flag). */
export async function hydrateTracks(
  rows: (typeof tracks.$inferSelect)[],
  userId?: number,
): Promise<TrackDTO[]> {
  if (rows.length === 0) return [];
  const [names, albumsMap, likes] = await Promise.all([
    artistNameMap(rows.map((r) => r.artistId)),
    albumMap(rows.map((r) => r.albumId)),
    userId ? likedSet(userId, rows.map((r) => r.id)) : Promise.resolve(new Set<number>()),
  ]);
  return rows.map((r) =>
    toTrackDTO(
      r,
      names.get(r.artistId) ?? "Unknown Artist",
      r.albumId ? (albumsMap.get(r.albumId) ?? null) : null,
      likes.has(r.id),
    ),
  );
}

export async function getTrackDTO(id: number, userId?: number): Promise<TrackDTO | null> {
  const rows = await db.select().from(tracks).where(eq(tracks.id, id)).limit(1);
  if (rows.length === 0) return null;
  const [dto] = await hydrateTracks(rows, userId);
  return dto ?? null;
}

/* ------------------------------ queries ------------------------------ */

export async function listTracks(opts: {
  q?: string;
  genre?: string;
  sort?: "trending" | "new" | "title" | "energy";
  limit?: number;
  offset?: number;
  userId?: number;
}): Promise<{ items: TrackDTO[]; total: number }> {
  const { q, genre, sort = "trending", limit = 50, offset = 0, userId } = opts;
  const conds = [];
  if (q) {
    conds.push(
      or(
        ilike(tracks.title, `%${q}%`),
        ilike(tracks.genre, `%${q}%`),
        ilike(tracks.isrc, `%${q}%`),
      )!,
    );
  }
  if (genre && genre !== "all") conds.push(eq(tracks.genre, genre));

  const orderBy =
    sort === "new"
      ? desc(tracks.createdAt)
      : sort === "title"
        ? tracks.title
        : sort === "energy"
          ? desc(tracks.energy)
          : desc(tracks.playCount);

  const where = conds.length ? and(...conds) : undefined;
  const [rows, countRows] = await Promise.all([
    db.select().from(tracks).where(where).orderBy(orderBy).limit(limit).offset(offset),
    db.select({ c: sql<number>`count(*)::int` }).from(tracks).where(where),
  ]);
  return { items: await hydrateTracks(rows, userId), total: countRows[0]?.c ?? 0 };
}

export async function searchAll(q: string, userId?: number) {
  const like = `%${q}%`;
  const [tRows, aRows, alRows, pRows] = await Promise.all([
    db
      .select()
      .from(tracks)
      .where(or(ilike(tracks.title, like), ilike(tracks.genre, like))!)
      .orderBy(desc(tracks.playCount))
      .limit(12),
    db
      .select()
      .from(artists)
      .where(ilike(artists.name, like))
      .orderBy(desc(artists.monthlyListeners))
      .limit(16),
    db
      .select()
      .from(albums)
      .where(ilike(albums.title, like))
      .orderBy(desc(albums.createdAt))
      .limit(16),
    db
      .select()
      .from(playlists)
      .where(or(ilike(playlists.title, like), ilike(playlists.description, like))!)
      .orderBy(desc(playlists.createdAt))
      .limit(8),
  ]);
  const albumArtistIds = alRows.map((r) => r.artistId);
  const names = await artistNameMap(albumArtistIds);
  const pOwnerIds = pRows.map((r) => r.ownerId);
  const owners = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, pOwnerIds.length ? pOwnerIds : [-1]));
  const ownerNames = new Map(owners.map((o) => [o.id, o.name]));

  const trackItems = await hydrateTracks(tRows, userId);
  const albumItems: AlbumDTO[] = alRows.map((r) =>
    toAlbumDTO(r, names.get(r.artistId) ?? "Unknown Artist"),
  );
  const playlistItems: PlaylistDTO[] = await Promise.all(
    pRows.map(async (r) => await toPlaylistDTO(r, ownerNames.get(r.ownerId) ?? "Unknown")),
  );
  return {
    tracks: trackItems,
    albums: albumItems,
    artists: await hydrateArtists(aRows, userId),
    playlists: playlistItems,
  };
}

export async function toPlaylistDTO(
  r: typeof playlists.$inferSelect,
  ownerName: string,
): Promise<PlaylistDTO> {
  const [agg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      dur: sql<number>`coalesce(sum(${tracks.durationSec}), 0)::float`,
    })
    .from(playlistTracks)
    .leftJoin(tracks, eq(playlistTracks.trackId, tracks.id))
    .where(eq(playlistTracks.playlistId, r.id));
  return {
    id: r.id,
    title: r.title,
    slug: r.slug,
    description: r.description,
    coverUrl: r.coverUrl,
    ownerId: r.ownerId,
    ownerName,
    collaborative: r.collaborative,
    isPublic: r.isPublic,
    trackCount: agg?.count ?? 0,
    durationSec: agg?.dur ?? 0,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listPlaylists(userId?: number): Promise<PlaylistDTO[]> {
  const rows = await db
    .select()
    .from(playlists)
    .orderBy(desc(playlists.createdAt));
  const owners = await db.select({ id: users.id, name: users.name }).from(users);
  const names = new Map(owners.map((o) => [o.id, o.name]));
  return Promise.all(rows.map((r) => toPlaylistDTO(r, names.get(r.ownerId) ?? "Unknown")));
}

export async function getPlaylistDetail(id: number, userId?: number) {
  const [pl] = await db.select().from(playlists).where(eq(playlists.id, id)).limit(1);
  if (!pl) return null;
  const [owner] = await db.select().from(users).where(eq(users.id, pl.ownerId)).limit(1);
  const rows = await db
    .select({ t: tracks })
    .from(playlistTracks)
    .innerJoin(tracks, eq(playlistTracks.trackId, tracks.id))
    .where(eq(playlistTracks.playlistId, id))
    .orderBy(playlistTracks.position);
  const trackDTOs = await hydrateTracks(rows.map((r) => r.t), userId);
  const dto = await toPlaylistDTO(pl, owner?.name ?? "Unknown");
  return { ...dto, tracks: trackDTOs };
}

export async function listAlbums(limit = 24, userId?: number): Promise<AlbumDTO[]> {
  const rows = await db.select().from(albums).orderBy(desc(albums.createdAt)).limit(limit);
  const names = await artistNameMap(rows.map((r) => r.artistId));
  const likedAl = userId ? await albumLikedSet(userId, rows.map((r) => r.id)) : new Set<number>();
  return rows.map((r) => ({ ...toAlbumDTO(r, names.get(r.artistId) ?? "Unknown Artist"), liked: likedAl.has(r.id) }));
}

export async function getAlbumDetail(id: number, userId?: number) {
  const [al] = await db.select().from(albums).where(eq(albums.id, id)).limit(1);
  if (!al) return null;
  const [ar] = await db.select().from(artists).where(eq(artists.id, al.artistId)).limit(1);
  const tRows = await db
    .select()
    .from(tracks)
    .where(eq(tracks.albumId, id))
    .orderBy(tracks.title);
  const likedAl = userId ? await albumLikedSet(userId, [al.id]) : new Set<number>();
  return {
    album: { ...toAlbumDTO(al, ar?.name ?? "Unknown Artist"), liked: likedAl.has(al.id) },
    artist: ar ? (await hydrateArtists([ar], userId))[0] : null,
    tracks: await hydrateTracks(tRows, userId),
  };
}

export async function listArtists(limit = 24, userId?: number): Promise<ArtistDTO[]> {
  const rows = await db
    .select()
    .from(artists)
    .orderBy(desc(artists.monthlyListeners))
    .limit(limit);
  return hydrateArtists(rows, userId);
}

export async function getArtistDetail(id: number, userId?: number) {
  const [ar] = await db.select().from(artists).where(eq(artists.id, id)).limit(1);
  if (!ar) return null;
  const tRows = await db
    .select()
    .from(tracks)
    .where(eq(tracks.artistId, id))
    .orderBy(desc(tracks.playCount))
    .limit(50);
  const alRows = await db
    .select()
    .from(albums)
    .where(eq(albums.artistId, id))
    .orderBy(desc(albums.createdAt));
  const [artistDTO] = await hydrateArtists([ar], userId);
  const likedAl = userId ? await albumLikedSet(userId, alRows.map((r) => r.id)) : new Set<number>();
  return {
    artist: artistDTO,
    topTracks: await hydrateTracks(tRows, userId),
    albums: alRows.map((r) => ({ ...toAlbumDTO(r, ar.name), liked: likedAl.has(r.id) })),
  };
}

export async function recordPlay(userId: number, trackId: number, durationListenedSec: number) {
  await db.insert(listeningHistory).values({
    userId,
    trackId,
    durationListenedSec,
    device: "web",
  });
  await db
    .update(tracks)
    .set({ playCount: sql`${tracks.playCount} + 1` })
    .where(eq(tracks.id, trackId));
}

export async function toggleLike(userId: number, trackId: number): Promise<boolean> {
  const existing = await db
    .select()
    .from(userTrackLikes)
    .where(and(eq(userTrackLikes.userId, userId), eq(userTrackLikes.trackId, trackId)))
    .limit(1);
  if (existing.length > 0) {
    await db
      .delete(userTrackLikes)
      .where(and(eq(userTrackLikes.userId, userId), eq(userTrackLikes.trackId, trackId)));
    return false;
  }
  await db.insert(userTrackLikes).values({ userId, trackId });
  return true;
}

export async function likedTracks(userId: number): Promise<TrackDTO[]> {
  const rows = await db
    .select({ t: tracks })
    .from(userTrackLikes)
    .innerJoin(tracks, eq(userTrackLikes.trackId, tracks.id))
    .where(eq(userTrackLikes.userId, userId))
    .orderBy(desc(userTrackLikes.createdAt));
  return hydrateTracks(rows.map((r) => r.t), userId);
}

export async function recentlyPlayed(userId: number, limit = 24): Promise<TrackDTO[]> {
  const rows = await db
    .select({ t: tracks })
    .from(listeningHistory)
    .innerJoin(tracks, eq(listeningHistory.trackId, tracks.id))
    .where(eq(listeningHistory.userId, userId))
    .orderBy(desc(listeningHistory.playedAt))
    .limit(limit);
  return hydrateTracks(rows.map((r) => r.t), userId);
}

export async function getStats(userId: number): Promise<StatsDTO> {
  const [totals] = await db
    .select({
      plays: sql<number>`count(*)::int`,
      minutes: sql<number>`coalesce(sum(${listeningHistory.durationListenedSec}),0)/60::float`,
    })
    .from(listeningHistory)
    .where(eq(listeningHistory.userId, userId));

  const topT = await db
    .select({ t: tracks, plays: sql<number>`count(*)::int` })
    .from(listeningHistory)
    .innerJoin(tracks, eq(listeningHistory.trackId, tracks.id))
    .where(eq(listeningHistory.userId, userId))
    .groupBy(tracks.id)
    .orderBy(desc(sql`count(*)`))
    .limit(8);

  const genreRows = await db
    .select({ genre: tracks.genre, plays: sql<number>`count(*)::int` })
    .from(listeningHistory)
    .innerJoin(tracks, eq(listeningHistory.trackId, tracks.id))
    .where(eq(listeningHistory.userId, userId))
    .groupBy(tracks.genre)
    .orderBy(desc(sql`count(*)`))
    .limit(8);

  const artistRows = await db
    .select({ artistId: tracks.artistId, plays: sql<number>`count(*)::int` })
    .from(listeningHistory)
    .innerJoin(tracks, eq(listeningHistory.trackId, tracks.id))
    .where(eq(listeningHistory.userId, userId))
    .groupBy(tracks.artistId)
    .orderBy(desc(sql`count(*)`))
    .limit(6);

  const artistNames = await artistNameMap(artistRows.map((r) => r.artistId));
  const artistIds = artistRows.map((r) => r.artistId);
  const fullArtists = await db.select().from(artists).where(inArray(artists.id, artistIds.length ? artistIds : [-1]));

  return {
    totalPlays: totals?.plays ?? 0,
    totalMinutes: Math.round(totals?.minutes ?? 0),
    topTracks: await hydrateTracks(topT.map((r) => r.t), userId),
    topArtists: artistRows.map((r) => {
      const full = fullArtists.find((a) => a.id === r.artistId);
      return { ...toArtistDTO(full ?? ({ id: r.artistId, name: artistNames.get(r.artistId) ?? "Unknown", slug: "", bio: null, imageUrl: null, verified: false, monthlyListeners: 0, genres: [], source: "youtube", sourceId: null } as typeof artists.$inferSelect)), plays: r.plays };
    }),
    genreDistribution: genreRows.map((g) => ({ genre: g.genre, plays: g.plays })),
  };
}

export async function distinctGenres(): Promise<string[]> {
  const rows = await db.selectDistinct({ g: tracks.genre }).from(tracks);
  return rows.map((r) => r.g).sort();
}
