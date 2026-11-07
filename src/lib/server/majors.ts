// ============================================================================
//  Major catalogs: Spotify · Apple Music (iTunes) · Deezer.
//  These give the OFFICIAL catalog data (titles, artists, covers, albums,
//  real charts) without any API key:
//   • Deezer   — public JSON API (search, charts, artist fans)
//   • iTunes   — public Search API (search, artwork, genres)
//   • Spotify  — public embed pages (__NEXT_DATA__) for charts/playlists and
//                track pages (no login). Search goes through Deezer/iTunes.
//  Playback & download: every major-catalog track is auto-matched to the
//  same song on YouTube Music (full-length) via matchOnYouTube(); the major
//  platform stays visible as the source badge + official link, and the 30s
//  official preview is kept as a fallback.
// ============================================================================
import type { ExternalTrack } from "./external";
import { searchYouTubeMusic } from "./youtube";

/* ---------------------------------- Deezer --------------------------------- */
interface DzTrack {
  id: number;
  title: string;
  duration: number;
  preview: string;
  rank: number;
  artist: { id: number; name: string; picture_big?: string; picture_xl?: string };
  album: { id: number; title: string; cover_big?: string; cover_xl?: string };
}
export async function searchDeezer(query: string, limit = 12): Promise<ExternalTrack[]> {
  try {
    const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${limit}&order=RANKING`, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: DzTrack[] };
    return (data.data ?? []).map((t) => ({
      source: "deezer",
      sourceId: String(t.id),
      title: t.title,
      artistName: t.artist?.name ?? "Unknown Artist",
      albumTitle: t.album?.title ?? null,
      coverUrl: t.album?.cover_xl ?? t.album?.cover_big ?? null,
      durationSec: t.duration,
      previewUrl: t.preview || null,
      genre: query.toLowerCase(),
      year: null,
      artistImageUrl: t.artist?.picture_xl ?? t.artist?.picture_big ?? null,
      directUrl: t.preview || null,
      playCount: t.rank,
    }));
  } catch {
    return [];
  }
}
export async function deezerChart(limit = 20): Promise<ExternalTrack[]> {
  try {
    const res = await fetch(`https://api.deezer.com/chart/0/tracks?limit=${limit}`, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: DzTrack[] };
    return (data.data ?? []).map((t) => ({
      source: "deezer",
      sourceId: String(t.id),
      title: t.title,
      artistName: t.artist?.name ?? "Unknown Artist",
      albumTitle: t.album?.title ?? null,
      coverUrl: t.album?.cover_xl ?? t.album?.cover_big ?? null,
      durationSec: t.duration,
      previewUrl: t.preview || null,
      genre: "chart",
      year: null,
      artistImageUrl: t.artist?.picture_xl ?? t.artist?.picture_big ?? null,
      directUrl: t.preview || null,
      playCount: t.rank,
    }));
  } catch {
    return [];
  }
}

/* ------------------------------ Apple Music (iTunes) ----------------------- */
interface ItTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
  primaryGenreName?: string;
  releaseDate?: string;
  trackViewUrl?: string;
}
export async function searchITunes(query: string, limit = 12): Promise<ExternalTrack[]> {
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=${limit}`, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: ItTrack[] };
    return (data.results ?? []).filter((t) => t.trackId && t.trackName).map((t) => ({
      source: "applemusic",
      sourceId: String(t.trackId),
      title: t.trackName,
      artistName: t.artistName,
      albumTitle: t.collectionName ?? null,
      coverUrl: t.artworkUrl100?.replace("100x100bb", "1000x1000bb") ?? null,
      durationSec: Math.round((t.trackTimeMillis ?? 0) / 1000),
      previewUrl: t.previewUrl ?? null,
      genre: (t.primaryGenreName ?? query).toLowerCase(),
      year: t.releaseDate ? Number(t.releaseDate.slice(0, 4)) || null : null,
      directUrl: t.previewUrl ?? null,
    }));
  } catch {
    return [];
  }
}

/* ---------------------------------- Spotify -------------------------------- */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
interface SpEntity {
  title?: string;
  name?: string;
  subtitle?: string;
  uri?: string;
  duration?: number;
  isExplicit?: boolean;
  audioPreview?: { url?: string } | null;
  artists?: { name: string; uri?: string }[];
  visualIdentity?: { image?: { url: string; maxWidth?: number }[] };
  coverArt?: { sources?: { url: string; width?: number }[] };
  trackList?: SpEntity[];
}
async function spotifyEmbed(path: string): Promise<SpEntity | null> {
  try {
    const res = await fetch(`https://open.spotify.com/embed/${path}`, { headers: { "User-Agent": UA, "Accept-Language": "en" }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) return null;
    const json = JSON.parse(m[1]) as { props?: { pageProps?: { state?: { data?: { entity?: SpEntity } } } } };
    return json.props?.pageProps?.state?.data?.entity ?? null;
  } catch {
    return null;
  }
}
const spId = (uri?: string) => (uri ?? "").split(":").pop() ?? "";
const spCover = (e: SpEntity): string | null => {
  const imgs = e.visualIdentity?.image ?? [];
  if (imgs.length) return [...imgs].sort((a, b) => (b.maxWidth ?? 0) - (a.maxWidth ?? 0))[0].url;
  const srcs = e.coverArt?.sources ?? [];
  if (srcs.length) return [...srcs].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0].url;
  return null;
};

/** Official Spotify charts (editorial playlists) — Top 50 Global / Egypt / Arab / Viral. */
export const SPOTIFY_CHARTS: { id: string; name: string }[] = [
  { id: "37i9dQZEVXbMDoHDwVN2tF", name: "Top 50 — Global" },
  { id: "37i9dQZEVXbLn7RQmT5Xv2", name: "Top 50 — Egypt" },
  { id: "37i9dQZEVXbLiRSasKsNU9", name: "Viral 50 — Global" },
  { id: "37i9dQZF1DX5cO1uP1XC1g", name: "Arab Hits" },
  { id: "37i9dQZEVXbLRQDuF5jeBp", name: "Top 50 — USA" },
  { id: "37i9dQZEVXbIPWwFssbupI", name: "Top 50 — Saudi Arabia" },
  { id: "37i9dQZEVXbM4UZuIrvHvA", name: "Top 50 — UAE" },
  { id: "37i9dQZEVXbJqdarpmTJDL", name: "Top 50 — Morocco" },
  { id: "37i9dQZF1DXcBWIGoYBM5M", name: "Today's Top Hits" },
  { id: "37i9dQZF1DX0XUsuxWHRQd", name: "RapCaviar" },
  { id: "37i9dQZF1DX4dyzvuaRJ0n", name: "mint" },
  { id: "37i9dQZF1DWXRqgorJj26U", name: "Rock Classics" },
  { id: "37i9dQZF1DXcF6B6QPhFDv", name: "Rock Classics 2" },
  { id: "37i9dQZF1DX4o1oenSJRJd", name: "All Out 2010s" },
  { id: "37i9dQZF1DX4UtSsGT1Sbe", name: "All Out 80s" },
  { id: "37i9dQZF1DXbTxeAdrVG2l", name: "All Out 90s" },
  { id: "37i9dQZF1DXdPec7aLTmlC", name: "Happy Hits" },
  { id: "37i9dQZF1DWZeKCadgRdKQ", name: "Deep Focus" },
  { id: "37i9dQZF1DX8Uebhn9wzrS", name: "Chill Hits" },
  { id: "37i9dQZF1DWUa8ZRTfalHk", name: "Pop Rising" },
  { id: "37i9dQZF1DX10zKzsJ2jva", name: "Viva Latino" },
  { id: "37i9dQZF1DX76Wlfdnj7AP", name: "Beast Mode" },
  { id: "37i9dQZF1DQ1xGROBKnhH6", name: "Hot Hits Egypt" },
  { id: "37i9dQZF1DX6ziVCJnEm59", name: "Your Favorite Coffeehouse" },
  { id: "37i9dQZF1DX1tyCD9QhIWF", name: "Hot Hits Saudi Arabia" },
  { id: "37i9dQZF1DX0HRj9P7NxeE", name: "Hot Hits UAE" },
];
const coverCache = new Map<string, { cover: string | null; album: string | null }>();
/** Official cover + album for a song via Deezer (same catalog metadata), cached. */
async function lookupCover(title: string, artist: string): Promise<{ cover: string | null; album: string | null }> {
  const key = `${title}|${artist}`.toLowerCase();
  const hit = coverCache.get(key);
  if (hit) return hit;
  let out: { cover: string | null; album: string | null } = { cover: null, album: null };
  try {
    const q = `${title} ${artist.split(",")[0]}`.replace(/\(.*?\)/g, "").trim();
    const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=1`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    const d = (await res.json()) as { data?: DzTrack[] };
    const t = d.data?.[0];
    if (t) out = { cover: t.album?.cover_xl ?? t.album?.cover_big ?? null, album: t.album?.title ?? null };
  } catch {
    /* keep null */
  }
  coverCache.set(key, out);
  return out;
}

export async function spotifyPlaylist(playlistId: string, limit = 50, genreHint = "chart"): Promise<ExternalTrack[]> {
  const e = await spotifyEmbed(`playlist/${playlistId}`);
  if (!e?.trackList) return [];
  const playlistCover = spCover(e);
  const items = e.trackList.slice(0, limit);
  const covers = await Promise.all(items.map((t) => (spCover(t) ? Promise.resolve({ cover: spCover(t), album: null }) : lookupCover(t.title ?? "", t.subtitle ?? ""))));
  return items.map((t, i) => ({
    source: "spotify" as const,
    sourceId: spId(t.uri),
    title: t.title ?? "Untitled",
    artistName: (t.subtitle ?? t.artists?.map((a) => a.name).join(", ") ?? "Unknown Artist").replace(/\u00a0/g, " "),
    albumTitle: covers[i].album,
    coverUrl: covers[i].cover ?? playlistCover,
    durationSec: Math.round((t.duration ?? 0) / 1000),
    previewUrl: t.audioPreview?.url ?? null,
    genre: genreHint,
    year: null,
    directUrl: t.audioPreview?.url ?? null,
  }));
}
export async function spotifyTrack(trackId: string): Promise<ExternalTrack | null> {
  const e = await spotifyEmbed(`track/${trackId}`);
  if (!e?.title) return null;
  return {
    source: "spotify",
    sourceId: trackId,
    title: e.title,
    artistName: e.artists?.map((a) => a.name).join(", ") ?? e.subtitle ?? "Unknown Artist",
    albumTitle: null,
    coverUrl: spCover(e),
    durationSec: Math.round((e.duration ?? 0) / 1000),
    previewUrl: e.audioPreview?.url ?? null,
    genre: "spotify",
    year: null,
    directUrl: e.audioPreview?.url ?? null,
  };
}
/** "Search" Spotify: find the song via Deezer/iTunes catalog, then resolve the Spotify track page by name is not possible without API —
 *  so Spotify search returns chart tracks matching the query (title/artist contains). */
const plCache = new Map<string, { at: number; items: ExternalTrack[] }>();
async function cachedPlaylist(id: string, name: string): Promise<ExternalTrack[]> {
  const hit = plCache.get(id);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.items;
  const items = await spotifyPlaylist(id, 50, name);
  if (items.length) plCache.set(id, { at: Date.now(), items });
  return items;
}
export async function searchSpotify(query: string, limit = 12): Promise<ExternalTrack[]> {
  const q = query.toLowerCase().trim();
  const tokens = q.split(/\s+/).filter((x) => x.length > 1);
  const lists = await Promise.all(SPOTIFY_CHARTS.map((c) => cachedPlaylist(c.id, c.name)));
  const scored: { t: ExternalTrack; score: number }[] = [];
  const seen = new Set<string>();
  for (const t of lists.flat()) {
    if (!t.sourceId || seen.has(t.sourceId)) continue;
    const hay = `${t.title} ${t.artistName}`.toLowerCase();
    let score = 0;
    if (hay.includes(q)) score += 5;
    for (const tok of tokens) {
      if (hay.includes(tok)) score += 2;
      if (t.artistName.toLowerCase().startsWith(tok)) score += 2;
    }
    if (score > 0) {
      seen.add(t.sourceId);
      scored.push({ t, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.t);
}

/* ------------------------- full-length match on YouTube -------------------- */
const matchCache = new Map<string, string | null>();
/** Find the same song on YouTube Music (videoId) for full-length playback/download. */
export async function matchOnYouTube(title: string, artist: string, durationSec: number): Promise<string | null> {
  const key = `${title}|${artist}`.toLowerCase();
  if (matchCache.has(key)) return matchCache.get(key) ?? null;
  try {
    const clean = title.replace(/\(.*?\)|\[.*?\]|feat\..*$/gi, "").trim();
    const hits = await searchYouTubeMusic(`${clean} ${artist.split(",")[0]}`, 8);
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, "");
    let best: { id: string; score: number } | null = null;
    for (const h of hits) {
      let score = 0;
      if (norm(h.title).includes(norm(clean)) || norm(clean).includes(norm(h.title))) score += 3;
      if (norm(h.artistName).includes(norm(artist.split(",")[0]))) score += 2;
      if (durationSec && Math.abs(h.durationSec - durationSec) <= 8) score += 2;
      else if (durationSec && Math.abs(h.durationSec - durationSec) <= 25) score += 1;
      if (!best || score > best.score) best = { id: h.sourceId, score };
    }
    const id = best && best.score >= 3 ? best.id : hits[0]?.sourceId ?? null;
    matchCache.set(key, id);
    return id;
  } catch {
    return null;
  }
}
