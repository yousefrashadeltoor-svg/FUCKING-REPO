// ============================================================================
//  Playback policy — one place that decides HOW a source may be played.
//  ---------------------------------------------------------------------------
//  Each provider has different rights and limits, so DON MUSE never treats them
//  the same way:
//
//   • YouTube / YouTube Music  → OFFICIAL IFrame player only. Never extracted,
//                                never proxied, never downloaded, never played
//                                in the background. The embed is the playback.
//   • User's own files         → played in place (ExoPlayer / <audio>).
//   • Free-licensed / open APIs→ streamed directly, cached, downloadable.
//   • Live radio / TV          → relayed through our proxy (CORS + TLS).
//   • Quran                   → whole-surah streams from the reciter libraries.
//
//  The policy is data, not prose: the engine, the download routes and the UI all
//  read it, so a blocked combination cannot be reached by accident.
// ============================================================================

export type PlaybackMode =
  /** must be played by the provider's official embedded player */
  | "official-embed"
  /** a direct media URL can be streamed by the client */
  | "direct"
  /** nothing can be played; the UI must link out to the source */
  | "link-out";

export interface SourcePolicy {
  mode: PlaybackMode;
  /** may the audio keep playing when the app is in the background? */
  background: boolean;
  /** may the user save a file from this source? */
  download: boolean;
  /** may our server proxy the bytes (CORS/TLS/range handling)? */
  proxy: boolean;
  /** short reason shown in the UI and in diagnostics */
  note: string;
  /** where to send the user when playback/download is unavailable */
  externalUrl?: (id: string | null) => string | null;
}

const ytUrl = (id: string | null) => (id ? `https://www.youtube.com/watch?v=${id}` : null);

export const SOURCE_POLICY: Record<string, SourcePolicy> = {
  youtube: {
    mode: "official-embed",
    background: false,
    download: false,
    proxy: false,
    note: "YouTube content plays in the official IFrame player; background audio and downloads are not offered.",
    externalUrl: ytUrl,
  },
  spotify: {
    // Catalogue/preview data only. Full tracks are matched on YouTube Music and
    // played through the official player; the 30s preview is the only file.
    mode: "official-embed",
    background: false,
    download: false,
    proxy: false,
    note: "Spotify provides the chart data; playback uses the official YouTube Music player.",
    externalUrl: (id) => (id ? `https://open.spotify.com/track/${id}` : null),
  },
  applemusic: {
    mode: "official-embed",
    background: false,
    download: false,
    proxy: false,
    note: "Apple Music metadata only; playback goes through the official player.",
    externalUrl: () => "https://music.apple.com",
  },
  deezer: {
    mode: "official-embed",
    background: false,
    download: false,
    proxy: false,
    note: "Deezer chart metadata; 30-second previews stream directly.",
    externalUrl: (id) => (id ? `https://www.deezer.com/track/${id}` : null),
  },
  audius: {
    mode: "direct",
    background: true,
    download: true,
    proxy: true,
    note: "Audius is a free, open, decentralised network — full-length streaming and downloads are allowed.",
    externalUrl: (id) => (id ? `https://audius.co/tracks/${id}` : null),
  },
  soundcloud: {
    mode: "direct",
    background: true,
    // SoundCloud's terms only allow streaming the tracks its own API hands out.
    download: false,
    proxy: true,
    note: "Streamed from the SoundCloud API; downloads are not offered.",
    externalUrl: (id) => (id ? `https://soundcloud.com/${id}` : null),
  },
  archive: {
    mode: "direct",
    background: true,
    download: true,
    proxy: true,
    note: "Internet Archive items are freely licensed — streaming and downloads are allowed.",
    externalUrl: (id) => (id ? `https://archive.org/details/${id}` : null),
  },
  jamendo: {
    mode: "direct",
    background: true,
    download: true,
    proxy: true,
    note: "Creative-Commons catalogue — full files, downloads and tagging are allowed.",
    externalUrl: (id) => (id ? `https://www.jamendo.com/track/${id}` : null),
  },
  bandcamp: {
    mode: "link-out",
    background: false,
    download: false,
    proxy: false,
    note: "Bandcamp streams only inside Bandcamp; DON MUSE links to the release.",
    externalUrl: (id) => (id ? `https://bandcamp.com/${id}` : null),
  },
  dailymotion: {
    mode: "official-embed",
    background: false,
    download: false,
    proxy: false,
    note: "Dailymotion video plays in its official embed.",
    externalUrl: (id) => (id ? `https://www.dailymotion.com/video/${id}` : null),
  },
  odysee: {
    mode: "direct",
    background: true,
    download: false,
    proxy: true,
    note: "Odysee streams through its public API.",
    externalUrl: (id) => (id ? `https://odysee.com/${id}` : null),
  },
  quran: {
    mode: "direct",
    background: true,
    download: true,
    proxy: true,
    note: "Whole-surah recitations from the open reciter libraries.",
  },
  radio: {
    mode: "direct",
    background: true,
    download: false,
    proxy: true,
    note: "Live radio relayed through our proxy.",
  },
  tv: {
    mode: "direct",
    background: false,
    download: false,
    proxy: true,
    note: "Live TV relayed through our proxy.",
  },
  local: {
    mode: "direct",
    background: true,
    download: true,
    proxy: false,
    note: "Your own files, played in place — never copied.",
  },
  internal: {
    mode: "direct",
    background: true,
    download: true,
    proxy: true,
    note: "DON MUSE's own catalogue.",
  },
};

const FALLBACK: SourcePolicy = {
  mode: "link-out",
  background: false,
  download: false,
  proxy: false,
  note: "This source cannot be played inside DON MUSE.",
};

export function policyFor(source: string | null | undefined): SourcePolicy {
  if (!source) return FALLBACK;
  return SOURCE_POLICY[source] ?? FALLBACK;
}

/** Can the engine stream this track itself (vs. needing the official embed)? */
export function canStreamDirectly(source: string | null | undefined): boolean {
  return policyFor(source).mode === "direct";
}

/** Must the official embedded player handle it? */
export function needsOfficialEmbed(source: string | null | undefined): boolean {
  return policyFor(source).mode === "official-embed";
}

/** Download allowed by the source policy? */
export function canDownload(source: string | null | undefined): boolean {
  return policyFor(source).download;
}

/** Human-readable reason used by toasts and the diagnostics page. */
export function policyNote(source: string | null | undefined): string {
  return policyFor(source).note;
}

/** Where to send the user when an action is not available in-app. */
export function externalFallback(source: string | null | undefined, id: string | null): string | null {
  return policyFor(source).externalUrl?.(id) ?? null;
}
