// Shared shape for tracks coming from real music platforms.
// All of these are full-length and downloadable through the ffmpeg pipeline:
//   youtube (YouTube Music) · audius · soundcloud · archive (Internet Archive)
//   jamendo (free licensed music, full MP3) · bandcamp · dailymotion · odysee

export type ExternalSource = "youtube" | "audius" | "soundcloud" | "archive" | "jamendo" | "bandcamp" | "dailymotion" | "odysee" | "spotify" | "applemusic" | "deezer";

export interface ExternalTrack {
  source: ExternalSource;
  sourceId: string;
  title: string;
  artistName: string;
  albumTitle: string | null;
  coverUrl: string | null;
  durationSec: number;
  previewUrl: string | null;
  genre: string;
  year: number | null;
  /** direct media URL when the platform gives one (jamendo/odysee) */
  directUrl?: string | null;
  /** artist image when the platform gives one */
  artistImageUrl?: string | null;
  /** platform popularity (Deezer rank, etc.) */
  playCount?: number;
}
