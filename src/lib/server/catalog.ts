// ============================================================================
//  Catalog cache — upserts external tracks (YouTube Music / Deezer / iTunes)
//  into PostgreSQL so every real song gets a stable internal id that
//  playlists, likes, history and rooms can reference.
// ============================================================================
import { db } from "@/db";
import { albums, artists, tracks } from "@/db/schema";
import { and, eq, ilike, inArray, sql } from "drizzle-orm";
import { hydrateTracks } from "./queries";
import type { ExternalTrack } from "./external";
import type { TrackDTO } from "@/lib/types";

/** Deterministic waveform peaks derived from the external id (visual only). */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makeWaveform(seed: string, n = 160): number[] {
  let s = hashStr(seed) || 1;
  const out: number[] = [];
  let v = 0.5;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const r = s / 4294967296;
    v = Math.min(1, Math.max(0.06, v + (r - 0.5) * 0.4));
    out.push(Number((v * 2 - 1).toFixed(3)));
  }
  return out;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `x-${hashStr(name).toString(36)}`
  );
}

async function findOrCreateArtist(name: string, source: string = "youtube"): Promise<number> {
  const existing = await db
    .select({ id: artists.id })
    .from(artists)
    .where(ilike(artists.name, name))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [row] = await db
    .insert(artists)
    .values({
      name,
      slug: `${slugify(name)}-${hashStr(name).toString(36)}`,
      genres: [],
      source,
    })
    .returning({ id: artists.id });
  return row.id;
}

async function findOrCreateAlbum(
  title: string,
  artistId: number,
  coverUrl: string | null,
  year: number | null,
): Promise<number> {
  const existing = await db
    .select({ id: albums.id })
    .from(albums)
    .where(and(eq(albums.artistId, artistId), ilike(albums.title, title)))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [row] = await db
    .insert(albums)
    .values({
      title,
      slug: `${slugify(title)}-${hashStr(title + artistId).toString(36)}`,
      artistId,
      coverUrl,
      releaseDate: year ? `${year}-01-01` : null,
      type: "album",
      totalTracks: 0,
    })
    .returning({ id: albums.id });
  return row.id;
}

/**
 * Upsert a batch of external tracks and return their DTOs (in input order).
 * Safe to call repeatedly — the (source, sourceId) unique index dedupes.
 */
export async function upsertTracks(
  items: ExternalTrack[],
  userId?: number,
): Promise<TrackDTO[]> {
  if (items.length === 0) return [];
  const ids: number[] = [];

  for (const item of items) {
    const artistId = await findOrCreateArtist(item.artistName, item.source);
    if (item.artistImageUrl) {
      await db.update(artists).set({ imageUrl: sql`coalesce(${artists.imageUrl}, ${item.artistImageUrl})` }).where(eq(artists.id, artistId));
    }
    // No album title but a real cover → keep the cover via a single-track "album" named after the song
    const albumId = item.albumTitle
      ? await findOrCreateAlbum(item.albumTitle, artistId, item.coverUrl, item.year)
      : item.coverUrl
        ? await findOrCreateAlbum(item.title, artistId, item.coverUrl, item.year)
        : null;

    const existing = await db
      .select({ id: tracks.id })
      .from(tracks)
      .where(and(eq(tracks.source, item.source), eq(tracks.sourceId, item.sourceId)))
      .limit(1);
    if (existing[0]) {
      // backfill missing cover / album / duration on re-seen tracks
      if (item.coverUrl && albumId) {
        await db.update(albums).set({ coverUrl: sql`coalesce(${albums.coverUrl}, ${item.coverUrl})` }).where(eq(albums.id, albumId));
      }
      await db
        .update(tracks)
        .set({
          albumId: sql`coalesce(${tracks.albumId}, ${albumId})`,
          durationSec: sql`case when ${tracks.durationSec} <= 0 then ${item.durationSec} else ${tracks.durationSec} end`,
        })
        .where(eq(tracks.id, existing[0].id));
      ids.push(existing[0].id);
      continue;
    }

    const [row] = await db
      .insert(tracks)
      .values({
        title: item.title,
        artistId,
        albumId,
        durationSec: item.durationSec,
        source: item.source,
        sourceId: item.sourceId,
        sourceUrl: item.directUrl ?? item.previewUrl ?? null, // direct media URL (jamendo/odysee) or legacy preview
        previewUrl: item.previewUrl,
        waveform: makeWaveform(item.source + item.sourceId),
        loudnessLufs: -14,
        bpm: 120,
        energy: 0.5,
        valence: 0.5,
        danceability: 0.5,
        acousticness: 0.5,
        genre: item.genre || "pop",
        year: item.year ?? new Date().getFullYear(),
        codec: item.source === "youtube" ? "youtube" : item.source === "dailymotion" || item.source === "odysee" ? "video" : "mp3",
        bitrate: item.source === "youtube" ? 0 : 320,
        lossless: false,
        playCount: item.playCount ?? 0,
      })
      .returning({ id: tracks.id });
    ids.push(row.id);
  }

  const rows = await db.select().from(tracks).where(inArray(tracks.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
  return hydrateTracks(ordered, userId);
}

/** Bump play count for a cached track (called on scrobble). */
export async function bumpPlayCount(trackId: number) {
  await db
    .update(tracks)
    .set({ playCount: sql`${tracks.playCount} + 1` })
    .where(eq(tracks.id, trackId));
}


/** Upsert real artists (with images) from YouTube Music search. */
export async function upsertArtists(hits: { id: string; name: string; imageUrl: string | null; subscribers: string | null }[]) {
  const out: number[] = [];
  for (const h of hits) {
    const existing = await db.select({ id: artists.id, imageUrl: artists.imageUrl }).from(artists).where(ilike(artists.name, h.name)).limit(1);
    if (existing[0]) {
      if (!existing[0].imageUrl && h.imageUrl) {
        await db.update(artists).set({ imageUrl: h.imageUrl, verified: true, sourceId: h.id }).where(eq(artists.id, existing[0].id));
      }
      out.push(existing[0].id);
      continue;
    }
    const subs = parseSubs(h.subscribers);
    const [row] = await db
      .insert(artists)
      .values({ name: h.name, slug: `${slugify(h.name)}-${hashStr(h.id).toString(36)}`, imageUrl: h.imageUrl, verified: true, monthlyListeners: subs, genres: [], source: "youtube", sourceId: h.id })
      .returning({ id: artists.id });
    out.push(row.id);
  }
  if (out.length === 0) return [];
  return db.select().from(artists).where(inArray(artists.id, out));
}

function parseSubs(s: string | null): number {
  if (!s) return 0;
  const m = s.replace(/,/g, "").match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return 0;
  const n = Number(m[1]);
  const mult = m[2]?.toUpperCase() === "K" ? 1e3 : m[2]?.toUpperCase() === "M" ? 1e6 : m[2]?.toUpperCase() === "B" ? 1e9 : 1;
  return Math.round(n * mult);
}

/** Upsert real albums (with covers) from YouTube Music search. */
export async function upsertAlbums(hits: { id: string; title: string; artistName: string; year: string | null; imageUrl: string | null }[]) {
  const out: number[] = [];
  for (const h of hits) {
    const artistId = await findOrCreateArtist(h.artistName);
    const existing = await db.select({ id: albums.id, coverUrl: albums.coverUrl }).from(albums).where(and(eq(albums.artistId, artistId), ilike(albums.title, h.title))).limit(1);
    if (existing[0]) {
      if (!existing[0].coverUrl && h.imageUrl) await db.update(albums).set({ coverUrl: h.imageUrl }).where(eq(albums.id, existing[0].id));
      out.push(existing[0].id);
      continue;
    }
    const [row] = await db
      .insert(albums)
      .values({ title: h.title, slug: `${slugify(h.title)}-${hashStr(h.id).toString(36)}`, artistId, coverUrl: h.imageUrl, releaseDate: h.year ? `${h.year}-01-01` : null, type: "album", totalTracks: 0 })
      .returning({ id: albums.id });
    out.push(row.id);
  }
  if (out.length === 0) return [];
  return db.select().from(albums).where(inArray(albums.id, out));
}
