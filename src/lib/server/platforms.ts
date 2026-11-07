// ============================================================================
//  Additional real music platforms (all full-length, all downloadable):
//   • Audius      — decentralized streaming, free API, full MP3 streams
//   • SoundCloud  — via yt-dlp (scsearch), HLS AAC → downloadable through ffmpeg
//   • Internet Archive — public-domain / live concert audio, direct MP3 files
// ============================================================================
import type { ExternalTrack } from "./external";
import { runYtDlp } from "./ytdlp";

/* ------------------------------- Audius -------------------------------- */

let audiusHost: string | null = null;
async function getAudiusHost(): Promise<string> {
  if (audiusHost) return audiusHost;
  try {
    const res = await fetch("https://api.audius.co", { next: { revalidate: 3600 } });
    const data = (await res.json()) as { data?: string[] };
    audiusHost = data.data?.[0] ?? "https://discoveryprovider.audius.co";
  } catch {
    audiusHost = "https://discoveryprovider.audius.co";
  }
  return audiusHost;
}

interface AudiusTrack {
  id: string;
  title: string;
  duration: number;
  genre?: string;
  release_date?: string;
  artwork?: { "480x480"?: string; "1000x1000"?: string; "150x150"?: string };
  user?: { name?: string; handle?: string };
  play_count?: number;
}

const APP = "app_name=DONMUSE";

export async function searchAudius(query: string, limit = 16): Promise<ExternalTrack[]> {
  try {
    const host = await getAudiusHost();
    const res = await fetch(`${host}/v1/tracks/search?query=${encodeURIComponent(query)}&${APP}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: AudiusTrack[] };
    return (data.data ?? []).slice(0, limit).map((t) => ({
      source: "audius",
      sourceId: t.id,
      title: t.title,
      artistName: t.user?.name?.trim() || t.user?.handle || "Unknown Artist",
      albumTitle: null,
      coverUrl: t.artwork?.["1000x1000"] ?? t.artwork?.["480x480"] ?? t.artwork?.["150x150"] ?? null,
      durationSec: t.duration ?? 0,
      previewUrl: null,
      genre: (t.genre ?? query).toLowerCase(),
      year: t.release_date ? Number(t.release_date.slice(0, 4)) || null : null,
    }));
  } catch {
    return [];
  }
}

export async function audiusTrending(limit = 16): Promise<ExternalTrack[]> {
  try {
    const host = await getAudiusHost();
    const res = await fetch(`${host}/v1/tracks/trending?${APP}`, { next: { revalidate: 600 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: AudiusTrack[] };
    return (data.data ?? []).slice(0, limit).map((t) => ({
      source: "audius",
      sourceId: t.id,
      title: t.title,
      artistName: t.user?.name?.trim() || "Unknown Artist",
      albumTitle: null,
      coverUrl: t.artwork?.["1000x1000"] ?? t.artwork?.["480x480"] ?? null,
      durationSec: t.duration ?? 0,
      previewUrl: null,
      genre: (t.genre ?? "trending").toLowerCase(),
      year: t.release_date ? Number(t.release_date.slice(0, 4)) || null : null,
    }));
  } catch {
    return [];
  }
}

/** Full-length MP3 stream URL (redirects to a content node). */
export async function audiusStreamUrl(trackId: string): Promise<string> {
  const host = await getAudiusHost();
  return `${host}/v1/tracks/${trackId}/stream?${APP}`;
}

/* ------------------------------ SoundCloud ------------------------------ */

interface ScFlat {
  id?: string;
  url?: string;
  title?: string;
  duration?: number;
  uploader?: string;
  thumbnails?: { url: string; width?: number }[];
  thumbnail?: string;
}

export async function searchSoundCloud(query: string, limit = 10): Promise<ExternalTrack[]> {
  const { stdout, code } = await runYtDlp(
    ["-J", "--flat-playlist", "--no-warnings", `scsearch${limit}:${query}`],
    60_000,
  );
  if (code !== 0 || !stdout.trim()) return [];
  try {
    const data = JSON.parse(stdout) as { entries?: ScFlat[] };
    return (data.entries ?? [])
      .filter((e) => e.url && e.title)
      .map((e) => {
        const idMatch = (e.url ?? "").match(/tracks(?:%3A|:)(\d+)|tracks\/(\d+)/);
        const scId = idMatch?.[1] ?? idMatch?.[2] ?? e.id ?? e.url!;
        const thumb =
          e.thumbnails?.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? e.thumbnail ?? null;
        return {
          source: "soundcloud" as const,
          sourceId: scId,
          title: e.title!,
          artistName: e.uploader?.trim() || "SoundCloud artist",
          albumTitle: null,
          coverUrl: thumb ? thumb.replace("-large.", "-t500x500.") : null,
          durationSec: Math.round(e.duration ?? 0),
          previewUrl: null,
          genre: query.toLowerCase(),
          year: null,
        };
      });
  } catch {
    return [];
  }
}

export function soundcloudUrl(sourceId: string): string {
  return /^\d+$/.test(sourceId)
    ? `https://api.soundcloud.com/tracks/${sourceId}`
    : sourceId;
}

/* ---------------------------- Internet Archive --------------------------- */

interface IaDoc {
  identifier: string;
  title?: string;
  creator?: string | string[];
  year?: string;
  downloads?: number;
}
interface IaFile {
  name: string;
  format?: string;
  length?: string;
  size?: string;
}

export async function searchArchive(query: string, limit = 8): Promise<ExternalTrack[]> {
  try {
    const q = encodeURIComponent(`(${query}) AND mediatype:audio AND format:"VBR MP3"`);
    const res = await fetch(
      `https://archive.org/advancedsearch.php?q=${q}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=year&fl[]=downloads&sort[]=downloads+desc&rows=${limit}&output=json`,
      { next: { revalidate: 600 } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { response?: { docs?: IaDoc[] } };
    const docs = data.response?.docs ?? [];
    const out: ExternalTrack[] = [];
    await Promise.all(
      docs.map(async (d) => {
        const file = await archiveFirstMp3(d.identifier);
        if (!file) return;
        out.push({
          source: "archive",
          sourceId: `${d.identifier}/${file.name}`,
          title: file.title || d.title || d.identifier,
          artistName: Array.isArray(d.creator) ? d.creator[0] : d.creator || "Internet Archive",
          albumTitle: d.title ?? null,
          coverUrl: `https://archive.org/services/img/${d.identifier}`,
          durationSec: file.lengthSec,
          previewUrl: null,
          genre: query.toLowerCase(),
          year: d.year ? Number(d.year) || null : null,
        });
      }),
    );
    return out;
  } catch {
    return [];
  }
}

async function archiveFirstMp3(identifier: string): Promise<{ name: string; title: string; lengthSec: number } | null> {
  try {
    const res = await fetch(`https://archive.org/metadata/${identifier}/files`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: (IaFile & { title?: string })[] };
    const mp3 = (data.result ?? []).find((f) => /mp3$/i.test(f.name) && (f.format ?? "").includes("MP3"));
    if (!mp3) return null;
    const len = mp3.length ? parseLength(mp3.length) : 0;
    return { name: mp3.name, title: mp3.title ?? "", lengthSec: len };
  } catch {
    return null;
  }
}

function parseLength(s: string): number {
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
  const parts = s.split(":").map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return Math.round(parts.reduce((a, b) => a * 60 + b, 0));
}

export function archiveFileUrl(sourceId: string): string {
  const [id, ...rest] = sourceId.split("/");
  return `https://archive.org/download/${id}/${rest.map(encodeURIComponent).join("/")}`;
}

/* -------------------------------- Jamendo -------------------------------- */
// Free, licensed music (Creative Commons) — full MP3 downloads with covers.
const JAMENDO_IDS = ["2c9a11b9", "b6747d04", "9d9f42e3"];
interface JamendoTrack {
  id: string;
  name: string;
  duration: number;
  artist_name: string;
  artist_id: string;
  album_name: string;
  album_image: string;
  image: string;
  audio: string;
  audiodownload: string;
  releasedate: string;
  musicinfo?: { tags?: { genres?: string[] } };
}
async function jamendo(path: string, params: Record<string, string>): Promise<JamendoTrack[]> {
  for (const cid of JAMENDO_IDS) {
    try {
      const qs = new URLSearchParams({ client_id: cid, format: "json", imagesize: "600", ...params });
      const res = await fetch(`https://api.jamendo.com/v3.0/${path}/?${qs}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (!res.ok) continue;
      const data = (await res.json()) as { headers?: { status?: string }; results?: JamendoTrack[] };
      if (data.headers?.status === "success") return data.results ?? [];
    } catch {
      /* try next client id */
    }
  }
  return [];
}
function mapJamendo(t: JamendoTrack, genreHint: string): ExternalTrack {
  return {
    source: "jamendo",
    sourceId: t.id,
    title: t.name,
    artistName: t.artist_name || "Jamendo artist",
    albumTitle: t.album_name || null,
    coverUrl: t.album_image || t.image || null,
    durationSec: t.duration || 0,
    previewUrl: null,
    genre: (t.musicinfo?.tags?.genres?.[0] ?? genreHint).toLowerCase(),
    year: t.releasedate ? Number(t.releasedate.slice(0, 4)) || null : null,
    directUrl: t.audio || t.audiodownload || null,
  };
}
export async function searchJamendo(query: string, limit = 12): Promise<ExternalTrack[]> {
  const rows = await jamendo("tracks", { limit: String(limit), search: query, audioformat: "mp32", include: "musicinfo" });
  return rows.map((t) => mapJamendo(t, query));
}
export async function jamendoPopular(limit = 12): Promise<ExternalTrack[]> {
  const rows = await jamendo("tracks", { limit: String(limit), order: "popularity_week", audioformat: "mp32", include: "musicinfo" });
  return rows.map((t) => mapJamendo(t, "popular"));
}
export async function jamendoStreamUrl(id: string): Promise<string> {
  const rows = await jamendo("tracks", { id, audioformat: "mp32" });
  return rows[0]?.audio || rows[0]?.audiodownload || `https://prod-1.storage.jamendo.com/?trackid=${id}&format=mp32`;
}

/* -------------------------------- Bandcamp ------------------------------- */
// Bandcamp's search endpoints are bot-protected from servers, so discovery
// goes through yt-dlp on public artist / album pages (works everywhere):
// we map a query to likely artist subdomains + the public "discover" tag
// pages, and extract real tracks with artwork, duration and MP3 streams.
import { runYtDlp as _runYtDlp } from "./ytdlp";
interface BcEntry {
  url?: string;
  webpage_url?: string;
  title?: string;
  track?: string;
  artist?: string;
  uploader?: string;
  album?: string;
  duration?: number;
  thumbnail?: string;
  release_year?: number;
}
async function bcList(url: string, limit: number): Promise<BcEntry[]> {
  const { stdout, code } = await _runYtDlp(["-J", "--no-warnings", "--playlist-end", String(limit), url], 90_000);
  if (code !== 0 || !stdout.trim()) return [];
  try {
    const data = JSON.parse(stdout) as { entries?: BcEntry[]; _type?: string } & BcEntry;
    if (data.entries) return data.entries.flatMap((e) => (e as { entries?: BcEntry[] }).entries ?? [e]);
    return [data];
  } catch {
    return [];
  }
}
export async function searchBandcamp(query: string, limit = 8): Promise<ExternalTrack[]> {
  const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 40);
  const tag = query.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const candidates = [`https://${slug}.bandcamp.com/music`, `https://bandcamp.com/tag/${tag}`];
  const out: ExternalTrack[] = [];
  for (const url of candidates) {
    const entries = await bcList(url, limit).catch(() => [] as BcEntry[]);
    for (const e of entries) {
      const page = e.webpage_url ?? e.url;
      if (!page || !/bandcamp\.com\/(track|album)\//.test(page)) continue;
      out.push({
        source: "bandcamp",
        sourceId: page,
        title: e.track ?? e.title ?? "Untitled",
        artistName: e.artist ?? e.uploader ?? slug,
        albumTitle: e.album ?? null,
        coverUrl: e.thumbnail ?? null,
        durationSec: Math.round(e.duration ?? 0),
        previewUrl: null,
        genre: query.toLowerCase(),
        year: e.release_year ?? null,
      });
      if (out.length >= limit) return out;
    }
    if (out.length) break;
  }
  return out;
}

/* ------------------------------- Dailymotion ----------------------------- */
interface DmVideo {
  id: string;
  title: string;
  duration: number;
  thumbnail_720_url?: string;
  thumbnail_480_url?: string;
  "owner.screenname"?: string;
  "owner.avatar_120_url"?: string;
  views_total?: number;
  created_time?: number;
}
export async function searchDailymotion(query: string, limit = 8): Promise<ExternalTrack[]> {
  try {
    const res = await fetch(
      `https://api.dailymotion.com/videos?search=${encodeURIComponent(query)}&channel=music&fields=id,title,duration,thumbnail_720_url,thumbnail_480_url,owner.screenname,owner.avatar_120_url,views_total,created_time&sort=relevance&limit=${limit}`,
      { next: { revalidate: 600 } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { list?: DmVideo[] };
    return (data.list ?? []).filter((v) => v.duration >= 45).map((v) => ({
      source: "dailymotion" as const,
      sourceId: v.id,
      title: v.title,
      artistName: v["owner.screenname"] || "Dailymotion",
      albumTitle: null,
      coverUrl: v.thumbnail_720_url ?? v.thumbnail_480_url ?? null,
      durationSec: v.duration,
      previewUrl: null,
      genre: query.toLowerCase(),
      year: v.created_time ? new Date(v.created_time * 1000).getFullYear() : null,
      artistImageUrl: v["owner.avatar_120_url"] ?? null,
    }));
  } catch {
    return [];
  }
}
export const dailymotionUrl = (id: string) => `https://www.dailymotion.com/video/${id}`;

/* --------------------------------- Odysee -------------------------------- */
interface OdyseeItem {
  canonical_url?: string;
  value?: { title?: string; thumbnail?: { url?: string }; stream_type?: string; video?: { duration?: number }; audio?: { duration?: number }; release_time?: string };
  signing_channel?: { name?: string; value?: { thumbnail?: { url?: string } } };
}
export async function searchOdysee(query: string, limit = 8): Promise<ExternalTrack[]> {
  try {
    const res = await fetch("https://api.na-backend.odysee.com/api/v1/proxy?m=claim_search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "claim_search", params: { text: query, any_tags: ["music"], claim_type: ["stream"], stream_types: ["audio", "video"], page_size: limit, order_by: ["trending_group"] } }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { result?: { items?: OdyseeItem[] } };
    return (data.result?.items ?? [])
      .filter((i) => i.canonical_url && i.value?.title)
      .map((i) => ({
        source: "odysee" as const,
        sourceId: i.canonical_url!,
        title: i.value!.title!,
        artistName: (i.signing_channel?.name ?? "Odysee").replace(/^@/, ""),
        albumTitle: null,
        coverUrl: i.value?.thumbnail?.url ?? null,
        durationSec: i.value?.video?.duration ?? i.value?.audio?.duration ?? 0,
        previewUrl: null,
        genre: query.toLowerCase(),
        year: i.value?.release_time ? new Date(Number(i.value.release_time) * 1000).getFullYear() : null,
        artistImageUrl: i.signing_channel?.value?.thumbnail?.url ?? null,
      }));
  } catch {
    return [];
  }
}
export async function odyseeStreamUrl(uri: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.na-backend.odysee.com/api/v1/proxy?m=get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "get", params: { uri, save_file: false } }),
      cache: "no-store",
    });
    const data = (await res.json()) as { result?: { streaming_url?: string } };
    return data.result?.streaming_url ?? null;
  } catch {
    return null;
  }
}
