// ============================================================================
//  YouTube Music client (youtubei.js / InnerTube)
//  Real YouTube Music search — returns real songs with real videoIds,
//  real durations and real thumbnails. Playback is full-length through the
//  YouTube IFrame Player API on the client.
// ============================================================================
import { Innertube } from "youtubei.js";
import type { ExternalTrack } from "./external";

let innertubePromise: Promise<Innertube> | null = null;

function getInnertube(): Promise<Innertube> {
  if (!innertubePromise) {
    innertubePromise = Innertube.create().catch((err) => {
      innertubePromise = null; // allow retry on next call
      throw err;
    });
  }
  return innertubePromise;
}

interface YTArtist {
  name?: string;
}
interface YTItem {
  id?: string;
  title?: string;
  artists?: YTArtist[];
  album?: { name?: string } | string;
  duration?: { seconds?: number; text?: string };
}
interface YTShelf {
  contents?: YTItem[];
}

/** Real video thumbnail (album-art grade) for a YouTube videoId. */
export function ytThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function parseDuration(d: YTItem["duration"]): number {
  if (d?.seconds) return d.seconds;
  if (!d?.text) return 0;
  const parts = d.text.split(":").map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return parts.reduce((a, b) => a * 60 + b, 0);
}

/**
 * Search YouTube Music for songs. Prefers actual song lengths (45s–20min)
 * over DJ mixes / live streams, but falls back to longer results when the
 * catalog is thin.
 */
export async function searchYouTubeMusic(query: string, limit = 24): Promise<ExternalTrack[]> {
  const innertube = await getInnertube();
  const search = await innertube.music.search(query, { type: "song" });
  const raw: YTItem[] = [];
  for (const shelf of (search.contents ?? []) as YTShelf[]) {
    for (const item of shelf.contents ?? []) raw.push(item);
  }

  const mapped: ExternalTrack[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const videoId = item.id;
    const title = item.title?.trim();
    if (!videoId || !title || seen.has(videoId)) continue;
    const durationSec = parseDuration(item.duration);
    if (durationSec <= 0) continue; // live / unknown
    seen.add(videoId);
    const artistName = item.artists?.[0]?.name?.trim() || "Unknown Artist";
    const albumTitle =
      typeof item.album === "string" ? item.album : item.album?.name?.trim() || null;
    mapped.push({
      source: "youtube",
      sourceId: videoId,
      title,
      artistName,
      albumTitle,
      coverUrl: ytThumbnail(videoId),
      durationSec,
      previewUrl: null,
      genre: query.toLowerCase(),
      year: null,
    });
  }

  // Prefer song-length results; keep mixes only as filler.
  const songs = mapped.filter((t) => t.durationSec >= 45 && t.durationSec <= 1200);
  const rest = mapped.filter((t) => !(t.durationSec >= 45 && t.durationSec <= 1200));
  return [...songs, ...rest].slice(0, limit);
}

/** Trending on YouTube Music — search a few evergreen queries and merge. */
export async function youtubeTrending(limit = 24): Promise<ExternalTrack[]> {
  const queries = ["top hits 2025", "trending songs", "viral hits", "popular music"];
  const results = await Promise.allSettled(
    queries.map((q) => searchYouTubeMusic(q, 10)),
  );
  const merged: ExternalTrack[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const t of r.value) {
      if (seen.has(t.sourceId)) continue;
      seen.add(t.sourceId);
      merged.push(t);
      if (merged.length >= limit) return merged;
    }
  }
  return merged;
}


/* ------------------------ artists & albums (real images) ------------------------ */

export interface YTArtistHit {
  id: string; // channel id
  name: string;
  imageUrl: string | null;
  subscribers: string | null;
}
export interface YTAlbumHit {
  id: string; // browse id
  title: string;
  artistName: string;
  year: string | null;
  imageUrl: string | null;
}

interface YTEntityItem {
  id?: string;
  name?: string;
  title?: string;
  subscribers?: string;
  year?: string;
  artists?: { name?: string }[];
  author?: { name?: string };
  thumbnail?: { contents?: { url: string; width?: number }[] };
  thumbnails?: { url: string; width?: number }[];
}

function bestThumb(item: YTEntityItem): string | null {
  const list = item.thumbnail?.contents ?? item.thumbnails ?? [];
  if (list.length === 0) return null;
  const best = [...list].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  // upscale googleusercontent thumbs to 544px
  return best.url.replace(/=w\d+-h\d+/, "=w544-h544").replace(/-l90-rj$/, "-l90-rj");
}

export async function searchYouTubeArtists(query: string, limit = 8): Promise<YTArtistHit[]> {
  const innertube = await getInnertube();
  const search = await innertube.music.search(query, { type: "artist" });
  const out: YTArtistHit[] = [];
  for (const shelf of (search.contents ?? []) as { contents?: YTEntityItem[] }[]) {
    for (const item of shelf.contents ?? []) {
      const name = item.name ?? item.title;
      if (!item.id || !name) continue;
      out.push({ id: item.id, name: String(name), imageUrl: bestThumb(item), subscribers: item.subscribers ?? null });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export async function searchYouTubeAlbums(query: string, limit = 8): Promise<YTAlbumHit[]> {
  const innertube = await getInnertube();
  const search = await innertube.music.search(query, { type: "album" });
  const out: YTAlbumHit[] = [];
  for (const shelf of (search.contents ?? []) as { contents?: YTEntityItem[] }[]) {
    for (const item of shelf.contents ?? []) {
      const title = item.name ?? item.title;
      if (!item.id || !title) continue;
      out.push({
        id: item.id,
        title: String(title),
        artistName: item.artists?.[0]?.name ?? item.author?.name ?? "Various Artists",
        year: item.year ?? null,
        imageUrl: bestThumb(item),
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
