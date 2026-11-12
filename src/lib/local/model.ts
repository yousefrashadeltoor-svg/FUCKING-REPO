import type { AlbumDTO, ArtistDTO, PlaylistDetailDTO, TrackDTO, TrackSource } from "@/lib/types";

export function stableId(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return (h >>> 0) || 1;
}

/** Unknown metrics stay unknown/zero; never invent plays, BPM or audience sizes. */
export function makeTrack(input: Partial<TrackDTO> & Pick<TrackDTO, "title" | "artistName" | "source" | "sourceId" | "streamUrl">): TrackDTO {
  return {
    id: input.id ?? stableId(`${input.source}:${input.sourceId}`),
    artistId: input.artistId ?? stableId(`artist:${input.artistName}`),
    albumId: input.albumId ?? null, albumTitle: input.albumTitle ?? null,
    coverUrl: input.coverUrl ?? null, durationSec: input.durationSec ?? 0,
    previewUrl: input.previewUrl ?? null, waveform: input.waveform ?? [],
    loudnessLufs: input.loudnessLufs ?? -14, bpm: input.bpm ?? 0, key: input.key ?? null,
    energy: input.energy ?? 0, valence: input.valence ?? 0, danceability: input.danceability ?? 0,
    acousticness: input.acousticness ?? 0, explicit: input.explicit ?? false,
    genre: input.genre ?? "", language: input.language ?? "", year: input.year ?? 0,
    isrc: input.isrc ?? null, codec: input.codec ?? "", bitrate: input.bitrate ?? 0,
    lossless: input.lossless ?? false, playCount: input.playCount ?? 0,
    lyrics: input.lyrics ?? [], liked: input.liked ?? false,
    ...input,
  };
}

export interface HistoryEntry { trackId: number; at: number; seconds: number }
export interface LocalSnapshot {
  schema: 1;
  tracks: Record<string, TrackDTO>;
  playlists: PlaylistDetailDTO[];
  artists: Record<string, ArtistDTO>;
  followedIds: number[];
  likedAlbumIds: number[];
  history: HistoryEntry[];
}
export const emptySnapshot = (): LocalSnapshot => ({ schema: 1, tracks: {}, playlists: [], artists: {}, followedIds: [], likedAlbumIds: [], history: [] });

export function rememberTracks(snapshot: LocalSnapshot, tracks: TrackDTO[]): void {
  for (const t of tracks) {
    if (!t || !Number.isFinite(t.id)) continue;
    snapshot.tracks[String(t.id)] = t;
    if (!snapshot.artists[String(t.artistId)] && t.artistName) {
      snapshot.artists[String(t.artistId)] = {
        id: t.artistId, name: t.artistName, slug: encodeURIComponent(t.artistName), bio: null,
        imageUrl: t.coverUrl, verified: false, monthlyListeners: 0, genres: t.genre ? [t.genre] : [],
        source: t.source, sourceId: null, following: snapshot.followedIds.includes(t.artistId), followers: 0,
      };
    }
  }
}

export function playlistMeta(p: PlaylistDetailDTO): Omit<PlaylistDetailDTO, "tracks"> {
  const { tracks: _tracks, ...meta } = p;
  return { ...meta, trackCount: p.tracks.length, durationSec: p.tracks.reduce((n, t) => n + (t.durationSec || 0), 0) };
}

export function albumsFromTracks(tracks: TrackDTO[], likedIds: number[] = []): AlbumDTO[] {
  const groups = new Map<number, TrackDTO[]>();
  for (const t of tracks) {
    if (!t.albumTitle) continue;
    const id = t.albumId ?? stableId(`album:${t.artistName}:${t.albumTitle}`);
    groups.set(id, [...(groups.get(id) ?? []), t]);
  }
  return [...groups].map(([id, list]) => ({
    id, title: list[0].albumTitle!, slug: String(id), artistId: list[0].artistId,
    artistName: list[0].artistName, coverUrl: list.find(t => t.coverUrl)?.coverUrl ?? null,
    releaseDate: list[0].year ? String(list[0].year) : null, type: "album", totalTracks: list.length,
    genres: [...new Set(list.map(t => t.genre).filter(Boolean))], lossless: list.some(t => t.lossless),
    label: null, liked: likedIds.includes(id),
  }));
}

export function searchLocal(snapshot: LocalSnapshot, query: string, likedIds: number[] = []): TrackDTO[] {
  const q = query.trim().toLocaleLowerCase();
  return Object.values(snapshot.tracks).filter(t => !q || `${t.title} ${t.artistName} ${t.albumTitle ?? ""} ${t.genre}`.toLocaleLowerCase().includes(q))
    .map(t => ({ ...t, liked: likedIds.includes(t.id) }));
}

export function sourceFromUrl(raw: string): TrackSource | null {
  try {
    const u = new URL(raw);
    if (!["https:", "http:"].includes(u.protocol) || u.username || u.password) return null;
    const h = u.hostname.toLowerCase();
    if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(h)) return "youtube";
    if (/(^|\.)soundcloud\.com$/.test(h)) return "soundcloud";
    if (/(^|\.)bandcamp\.com$/.test(h)) return "bandcamp";
    if (/(^|\.)spotify\.com$|(^|\.)music\.apple\.com$|(^|\.)deezer\.com$/.test(h)) return null;
    return "internal";
  } catch { return null; }
}

export function sanitizeFilename(name: string, ext: string): string {
  // eslint-disable-next-line no-control-regex -- strip control bytes from filenames
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 140) || "DON MUSE";
  return `${clean.replace(/\.[a-z0-9]{2,5}$/i, "")}.${ext.replace(/^\./, "")}`;
}
