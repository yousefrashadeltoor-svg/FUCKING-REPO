// Shared API/domain types for DON MUSE (strict, no `any`).

export type Tier = "free" | "plus" | "premium" | "ultimate";

export interface UserDTO {
  id: number;
  email: string;
  name: string;
  avatarUrl: string | null;
  tier: Tier;
  locale: string;
}

export interface ArtistDTO {
  id: number;
  name: string;
  slug: string;
  bio: string | null;
  imageUrl: string | null;
  verified: boolean;
  monthlyListeners: number;
  genres: string[];
  /** platform the artist lives on (drives the official logo badge) */
  source: TrackSource;
  sourceId: string | null;
  following: boolean;
  followers: number;
  /** official channel data (from the platform, not app-local) */
  official?: OfficialStats | null;
}

export interface OfficialStats {
  handle: string | null; // "@AmrDiab"
  officialChannelId: string | null;
  bannerUrl: string | null;
  subscribers: string | null; // "7.54M subscribers"
  subscribersNum: number;
  totalViews: string | null; // "4,049,297,636 views"
  totalViewsNum: number;
  monthlyAudience: string | null; // "53.5M monthly audience"
  monthlyAudienceNum: number;
  videoCount: string | null;
  country: string | null;
  joined: string | null;
  links: { title: string; url: string }[];
  description: string | null;
}

export interface OfficialVideoDTO {
  track: TrackDTO; // playable (YouTube) track for this video
  views: string | null; // "41M views" — real
  viewsNum: number;
  subtitle: string;
  kind: "video" | "live";
}

export interface ArtistProfileDTO {
  artist: ArtistDTO;
  /** official "Top songs" with real play counts */
  topTracks: TrackDTO[];
  topPlays: Record<number, string>; // trackId -> "59M plays"
  albums: AlbumDTO[];
  singles: AlbumDTO[];
  /** tracks where this artist appears with others (feat. / &) */
  collaborations: TrackDTO[];
  /** official music videos with real view counts */
  videos: OfficialVideoDTO[];
  live: OfficialVideoDTO[];
  featuredOn: { id: string; title: string; coverUrl: string | null }[];
  /** "Fans might also like" — with official monthly audience */
  related: (ArtistDTO & { monthly: string | null })[];
  stats: { tracks: number; albums: number; plays: number };
}

export interface ReelDTO {
  track: TrackDTO;
  artist: ArtistDTO | null;
  /** second collaborating artist (feat.) if detected */
  featuring: ArtistDTO | null;
  /** why it was recommended (shown as a subtle tag) */
  reason: string;
  score: number;
  likes: number;
  views: number;
}

export interface AlbumDTO {
  id: number;
  title: string;
  slug: string;
  artistId: number;
  artistName: string;
  coverUrl: string | null;
  releaseDate: string | null;
  type: string;
  totalTracks: number;
  genres: string[];
  lossless: boolean;
  label: string | null;
  liked: boolean;
}

export interface LyricLine {
  start: number;
  text: string;
}

export type TrackSource =
  | "youtube"
  | "audius"
  | "soundcloud"
  | "archive"
  | "jamendo"
  | "bandcamp"
  | "dailymotion"
  | "odysee"
  | "spotify"
  | "applemusic"
  | "deezer"
  | "quran"
  | "radio"
  /** on-device media (Android MediaStore / File System Access API) */
  | "local"
  | "internal";

export interface TrackDTO {
  id: number;
  title: string;
  artistId: number;
  artistName: string;
  albumId: number | null;
  albumTitle: string | null;
  coverUrl: string | null;
  durationSec: number;
  /** Playback source: youtube = full-length via IFrame API; audius/soundcloud/archive = full-length audio proxy; radio = live stream */
  source: TrackSource;
  /** YouTube videoId, Audius id, SoundCloud id, Archive "identifier/file", or radio station uuid */
  sourceId: string | null;
  /** Legacy preview URL (unused for full-length sources) */
  previewUrl: string | null;
  /** Served by /api/tracks/[id]/stream (Range-capable proxy) — non-YouTube sources */
  streamUrl: string;
  waveform: number[];
  loudnessLufs: number;
  bpm: number;
  key: string | null;
  energy: number;
  valence: number;
  danceability: number;
  acousticness: number;
  explicit: boolean;
  genre: string;
  language: string;
  year: number;
  isrc: string | null;
  codec: string;
  bitrate: number;
  lossless: boolean;
  playCount: number;
  lyrics: LyricLine[];
  liked: boolean;
  /** true when this is an on-device file (MediaStore / browser file) */
  isDeviceItem?: boolean;
  /** content:// or blob URL used by the native player */
  localUri?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface PlaylistDTO {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  coverUrl: string | null;
  ownerId: number;
  ownerName: string;
  collaborative: boolean;
  isPublic: boolean;
  trackCount: number;
  durationSec: number;
  createdAt: string;
}

export interface PlaylistDetailDTO extends PlaylistDTO {
  tracks: TrackDTO[];
}

export interface SearchResultsDTO {
  tracks: TrackDTO[];
  albums: AlbumDTO[];
  artists: ArtistDTO[];
  playlists: PlaylistDTO[];
  sources?: Record<string, number>;
}

export interface HomeSectionDTO {
  id: string;
  title: string;
  subtitle: string;
  kind: "tracks" | "albums" | "artists" | "playlists";
  items: TrackDTO[] | AlbumDTO[] | ArtistDTO[] | PlaylistDTO[];
}

/** Live radio station (Radio-Browser). */
export interface RadioStationDTO {
  id: string; // station uuid
  name: string;
  description: string;
  genre: string;
  mood: string;
  energy: number;
  coverUrl: string;
  trackCount: number; // = listeners (click count)
  streamUrl: string; // direct upstream stream URL
  country: string;
  countryCode: string;
  codec: string; // MP3 | AAC | …
  bitrate: number; // kbps (0 = unknown)
  listeners: number;
  votes: number;
  homepage: string;
  isLive: boolean;
}

/** Download format entry returned by /api/tracks/[id]/formats */
export interface DownloadFormatDTO {
  id: string; // preset id ("mp3-320") or "native:<format_id>"
  kind: "audio" | "video";
  label: string; // "MP3 · 320 kbps" / "1080p · MP4"
  ext: string;
  mime: string;
  quality: string; // "320 kbps" / "1080p60"
  bitrateKbps: number;
  sizeBytes: number; // exact for native, estimate for transcodes
  estimated: boolean;
  lossless: boolean;
  cover: boolean; // cover art embedded
  codec: string;
}

export interface StatsDTO {
  totalPlays: number;
  totalMinutes: number;
  topTracks: TrackDTO[];
  topArtists: (ArtistDTO & { plays: number })[];
  genreDistribution: { genre: string; plays: number }[];
}
