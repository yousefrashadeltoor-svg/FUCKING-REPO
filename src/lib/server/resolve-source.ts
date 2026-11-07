// Resolve any catalog track to a playable/downloadable source.
// Returns either a yt-dlp page URL (SoundCloud / Bandcamp / Dailymotion — the
// providers whose terms allow it) or a direct media URL (Audius / Archive /
// Jamendo / Odysee / Deezer preview / legacy).
//
// YouTube and YouTube Music are intentionally NOT resolvable here: they play in
// the official IFrame player only (see src/lib/playback-policy.ts).
import { archiveFileUrl, audiusStreamUrl, dailymotionUrl, jamendoStreamUrl, odyseeStreamUrl, soundcloudUrl } from "./platforms";
import { db } from "@/db";
import { tracks } from "@/db/schema";
import { eq } from "drizzle-orm";

export type Resolved = { kind: "ytdlp"; url: string; youtube: boolean } | { kind: "direct"; url: string } | null;

export async function resolveSource(source: string, sourceId: string | null, sourceUrl: string | null, meta?: { trackId?: number; title?: string; artist?: string; durationSec?: number }): Promise<Resolved> {
  if (!sourceId && !sourceUrl) return null;
  // Major catalogs (Spotify / Apple Music / Deezer) expose an official preview
  // file; the full song is reached through the official YouTube Music player in
  // the UI (never by extracting YouTube audio).
  if (source === "spotify" || source === "applemusic" || source === "deezer") {
    if (meta?.trackId && sourceUrl) {
      await db.update(tracks).set({ previewUrl: sourceUrl }).where(eq(tracks.id, meta.trackId)).catch(() => {});
    }
    return sourceUrl ? { kind: "direct", url: sourceUrl } : null;
  }
  switch (source) {
    // Policy: YouTube content is official-embed only — no extractor, ever.
    case "youtube":
      return null;
    case "soundcloud":
      return sourceId ? { kind: "ytdlp", url: soundcloudUrl(sourceId), youtube: false } : null;
    case "bandcamp":
      return sourceId ? { kind: "ytdlp", url: sourceId, youtube: false } : null;
    case "dailymotion":
      return sourceId ? { kind: "ytdlp", url: dailymotionUrl(sourceId), youtube: false } : null;
    case "audius":
      return sourceId ? { kind: "direct", url: await audiusStreamUrl(sourceId) } : null;
    case "archive":
      return sourceId ? { kind: "direct", url: archiveFileUrl(sourceId) } : null;
    case "jamendo":
      return { kind: "direct", url: sourceUrl || (sourceId ? await jamendoStreamUrl(sourceId) : "") };
    case "odysee": {
      const u = sourceId ? await odyseeStreamUrl(sourceId) : null;
      return u ? { kind: "direct", url: u } : sourceUrl ? { kind: "direct", url: sourceUrl } : null;
    }
    default:
      return sourceUrl ? { kind: "direct", url: sourceUrl } : null;
  }
}
