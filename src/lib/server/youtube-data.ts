// ============================================================================
//  YouTube Music search/trending/artists — OFFICIAL Data API v3 only.
//  ---------------------------------------------------------------------------
//  This replaces the previous InnerTube client (youtubei.js). InnerTube is
//  YouTube's private, undocumented API: using it is not permitted, it breaks
//  without notice, and the endpoints it calls are the same ones extraction tools
//  abuse. Everything here uses the documented public API:
//
//    search.list · videos.list · channels.list · playlistItems.list
//
//  Playback of every result happens in the official IFrame player, never by
//  extracting audio (see src/lib/playback-policy.ts).
//
//  Without YOUTUBE_API_KEY each function returns an empty list (never mock
//  data); routes surface `configured: false` so the UI can say so.
// ============================================================================
import { isoDuration, type YtVideoItem } from "./google";
import { publicKey } from "./yt-service";
import type { ExternalTrack } from "./external";

interface SearchItem {
  id: { videoId?: string; channelId?: string; playlistId?: string };
  snippet: {
    title: string;
    channelTitle: string;
    channelId: string;
    publishedAt?: string;
    thumbnails?: Record<string, { url: string }>;
  };
}

const API = "https://www.googleapis.com/youtube/v3";

export function ytDataAvailable(): boolean {
  return publicKey() !== null;
}

async function api<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const key = publicKey();
  if (!key) return null;
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", key);
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(9000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Real thumbnail for a video id (no API call — deterministic URL). */
export function ytThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function pickThumb(thumbs?: Record<string, { url: string }>): string | null {
  if (!thumbs) return null;
  for (const k of ["maxres", "standard", "high", "medium", "default"]) {
    if (thumbs[k]?.url) return thumbs[k].url;
  }
  return Object.values(thumbs)[0]?.url ?? null;
}

/**
 * "Artist - Title" cleanup: YouTube titles are noisy ("(Official Video)",
 * "[Lyric Video]", "| 4K"). We strip only decorations, never the real name.
 */
function cleanTitle(raw: string): string {
  return raw
    .replace(/[([][^)\]]*(official|lyrics?|audio|video|clip|remaster(ed)?|hd|4k|visualizer|performance|live)[^)\]]*[)\]]/gi, "")
    .replace(/\s*[|·]\s*(official.*|lyrics.*|audio.*|video.*)$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function splitArtistChannel(channelTitle: string, title: string): { artist: string; songTitle: string } {
  // "Amr Diab - Tamally Maak" → artist/song split when both sides look real.
  const dash = title.split(/\s+[-–—]\s+/);
  const channel = channelTitle.replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").trim();
  if (dash.length >= 2 && dash[0].length > 1 && dash[0].length < 60) {
    return { artist: cleanTitle(dash[0]), songTitle: cleanTitle(dash.slice(1).join(" - ")) };
  }
  return { artist: channel || "Unknown Artist", songTitle: cleanTitle(title) };
}

async function hydrate(ids: string[]): Promise<YtVideoItem[]> {
  if (ids.length === 0) return [];
  const out: YtVideoItem[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const data = await api<{ items: YtVideoItem[] }>("videos", {
      part: "snippet,contentDetails,statistics",
      id: chunk.join(","),
      maxResults: "50",
    });
    out.push(...(data?.items ?? []));
  }
  return out;
}

/** Song search on the official API, ordered by relevance, songs only. */
export async function searchYouTubeMusic(query: string, limit = 24): Promise<ExternalTrack[]> {
  const search = await api<{ items: SearchItem[] }>("search", {
    part: "snippet",
    q: `${query} song`,
    type: "video",
    videoCategoryId: "10", // Music
    maxResults: String(Math.min(50, limit)),
    order: "relevance",
  });
  const ids = (search?.items ?? []).map((i) => i.id.videoId).filter((v): v is string => !!v);
  const details = await hydrate(ids);

  const tracks: ExternalTrack[] = [];
  const seen = new Set<string>();
  for (const v of details) {
    if (!v.id || seen.has(v.id)) continue;
    const durationSec = isoDuration(v.contentDetails?.duration);
    if (durationSec <= 0) continue; // live / unknown length
    seen.add(v.id);
    const { artist, songTitle } = splitArtistChannel(v.snippet.channelTitle, v.snippet.title);
    tracks.push({
      source: "youtube",
      sourceId: v.id,
      title: songTitle || v.snippet.title,
      artistName: artist,
      albumTitle: null,
      coverUrl: pickThumb(v.snippet.thumbnails) ?? ytThumbnail(v.id),
      durationSec,
      previewUrl: null,
      genre: query.toLowerCase(),
      year: v.snippet.publishedAt ? Number(v.snippet.publishedAt.slice(0, 4)) : null,
      playCount: v.statistics?.viewCount ? Number(v.statistics.viewCount) : 0,
    });
  }

  // Prefer song-length results; keep longer mixes as filler only.
  const songs = tracks.filter((t) => t.durationSec >= 45 && t.durationSec <= 1200);
  const rest = tracks.filter((t) => !(t.durationSec >= 45 && t.durationSec <= 1200));
  return [...songs, ...rest].slice(0, limit);
}

/**
 * Trending. The official API has no music-specific chart, so we use the real
 * `mostPopular` chart (region-aware) and filter to Music-category videos —
 * documented data, no scraping.
 */
export async function youtubeTrending(limit = 24, regionCode = "EG"): Promise<ExternalTrack[]> {
  // Rotate the query pool so two refreshes are never identical.
  const pool = [
    "top hits", "trending songs", "viral hits", "popular music",
    "أغاني 2025", "طرب مصري", "عمرو دياب", "شيرين عبد الوهاب",
    "new arabic songs", "كايروكي", "تامر حسني", "hip hop hits",
    "afrobeats", "amapiano", "k-pop hits", "indie pop",
    "classic rock", "lo-fi beats", "romantic songs", "workout music",
  ];
  const queries = pool.sort(() => Math.random() - 0.5).slice(0, 3);

  // 1. The official chart for the region.
  const chartIds: string[] = [];
  const chart = await api<{ items: { id: string }[] }>("videos", {
    part: "id",
    chart: "mostPopular",
    regionCode,
    videoCategoryId: "10",
    maxResults: "25",
  });
  for (const v of chart?.items ?? []) if (v.id) chartIds.push(v.id);

  // 2. Real searches for the rotating queries.
  const searched = await Promise.all(queries.map((q) => searchYouTubeMusic(q, 8).catch(() => [] as ExternalTrack[])));
  const hydrated = await hydrate(chartIds);

  const merged: ExternalTrack[] = [];
  for (const v of hydrated) {
    const durationSec = isoDuration(v.contentDetails?.duration);
    if (!v.id || durationSec <= 0) continue;
    const { artist, songTitle } = splitArtistChannel(v.snippet.channelTitle, v.snippet.title);
    merged.push({
      source: "youtube",
      sourceId: v.id,
      title: songTitle || v.snippet.title,
      artistName: artist,
      albumTitle: null,
      coverUrl: pickThumb(v.snippet.thumbnails) ?? ytThumbnail(v.id),
      durationSec,
      previewUrl: null,
      genre: "chart",
      year: v.snippet.publishedAt ? Number(v.snippet.publishedAt.slice(0, 4)) : null,
      playCount: v.statistics?.viewCount ? Number(v.statistics.viewCount) : 0,
    });
  }
  for (const list of searched) merged.push(...list);

  // de-duplicate by video id, then shuffle so the row changes each refresh
  const seen = new Set<string>();
  const unique = merged.filter((t) => (seen.has(t.sourceId) ? false : (seen.add(t.sourceId), true)));
  return unique.sort(() => Math.random() - 0.5).slice(0, limit);
}

export interface YTArtistHit {
  id: string; // channel id
  name: string;
  handle: string | null;
  imageUrl: string | null;
  subscribers: number | null;
  description: string | null;
}

/** Real channel search for artists (official `search` + `channels`). */
export async function searchYouTubeArtists(query: string, limit = 8): Promise<YTArtistHit[]> {
  const search = await api<{ items: SearchItem[] }>("search", {
    part: "snippet",
    q: query,
    type: "channel",
    maxResults: String(Math.min(20, limit)),
  });
  const ids = (search?.items ?? []).map((i) => i.id.channelId).filter((v): v is string => !!v);
  if (ids.length === 0) return [];
  const data = await api<{
    items: {
      id: string;
      snippet: { title: string; customUrl?: string; description?: string; thumbnails?: Record<string, { url: string }> };
      statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
    }[];
  }>("channels", { part: "snippet,statistics", id: ids.slice(0, 50).join(",") });
  return (data?.items ?? []).map((c) => ({
    id: c.id,
    name: c.snippet.title,
    handle: c.snippet.customUrl ?? null,
    imageUrl: pickThumb(c.snippet.thumbnails),
    subscribers: c.statistics?.hiddenSubscriberCount ? null : Number(c.statistics?.subscriberCount ?? 0),
    description: c.snippet.description ?? null,
  }));
}

export interface YTAlbumHit {
  id: string;
  title: string;
  channel: string;
  thumb: string | null;
}

/** Playlists that look like albums (official search, type=playlist). */
export async function searchYouTubeAlbums(query: string, limit = 8): Promise<YTAlbumHit[]> {
  const search = await api<{ items: SearchItem[] }>("search", {
    part: "snippet",
    q: `${query} album`,
    type: "playlist",
    maxResults: String(Math.min(20, limit)),
  });
  return (search?.items ?? [])
    .filter((i) => !!i.id.playlistId)
    .map((i) => ({
      id: i.id.playlistId!,
      title: cleanTitle(i.snippet.title),
      channel: i.snippet.channelTitle,
      thumb: pickThumb(i.snippet.thumbnails),
    }));
}

/** Official artist identity from a channel id. */
export async function officialArtistByChannelId(channelId: string) {
  const data = await api<{
    items: {
      id: string;
      snippet: {
        title: string;
        customUrl?: string;
        description?: string;
        country?: string;
        publishedAt?: string;
        thumbnails?: Record<string, { url: string }>;
      };
      statistics?: { viewCount?: string; subscriberCount?: string; videoCount?: string; hiddenSubscriberCount?: boolean };
      brandingSettings?: { image?: { bannerExternalUrl?: string } };
    }[];
  }>("channels", { part: "snippet,statistics,brandingSettings", id: channelId });
  const c = data?.items?.[0];
  if (!c) return null;
  return {
    id: c.id,
    name: c.snippet.title,
    handle: c.snippet.customUrl ?? null,
    description: c.snippet.description ?? null,
    avatar: pickThumb(c.snippet.thumbnails),
    banner: c.brandingSettings?.image?.bannerExternalUrl ?? null,
    subscribers: c.statistics?.hiddenSubscriberCount ? null : Number(c.statistics?.subscriberCount ?? 0),
    totalViews: Number(c.statistics?.viewCount ?? 0),
    videoCount: Number(c.statistics?.videoCount ?? 0),
    country: c.snippet.country ?? null,
    joined: c.snippet.publishedAt ?? null,
    // The Data API does not expose "monthly audience" — we never invent it.
    monthlyAudience: null as number | null,
  };
}

/** A channel's most popular videos = the real "top songs" we can prove. */
export async function channelTopVideos(channelId: string, limit = 12): Promise<ExternalTrack[]> {
  const search = await api<{ items: SearchItem[] }>("search", {
    part: "snippet",
    channelId,
    type: "video",
    videoCategoryId: "10",
    order: "viewCount",
    maxResults: String(Math.min(25, limit)),
  });
  const ids = (search?.items ?? []).map((i) => i.id.videoId).filter((v): v is string => !!v);
  const details = await hydrate(ids);
  return details
    .filter((v) => v.id)
    .map((v) => {
      const durationSec = isoDuration(v.contentDetails?.duration);
      const { artist, songTitle } = splitArtistChannel(v.snippet.channelTitle, v.snippet.title);
      return {
        source: "youtube" as const,
        sourceId: v.id,
        title: songTitle || v.snippet.title,
        artistName: artist,
        albumTitle: null,
        coverUrl: pickThumb(v.snippet.thumbnails) ?? ytThumbnail(v.id),
        durationSec,
        previewUrl: null,
        genre: "artist",
        year: v.snippet.publishedAt ? Number(v.snippet.publishedAt.slice(0, 4)) : null,
        playCount: v.statistics?.viewCount ? Number(v.statistics.viewCount) : 0,
      };
    })
    .filter((t) => t.durationSec > 0);
}

/** Find the artist's channel id by name (official channel search). */
export async function findArtistChannelId(name: string): Promise<{ id: string; name: string } | null> {
  const hits = await searchYouTubeArtists(name, 5);
  if (hits.length === 0) return null;
  const clean = name.toLowerCase();
  const exact =
    hits.find((h) => h.name.toLowerCase() === clean) ??
    hits.find((h) => h.name.toLowerCase().replace(/\s*-\s*topic$/, "") === clean) ??
    hits[0];
  return { id: exact.id, name: exact.name };
}
