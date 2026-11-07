// Resolve any catalog track to a playable/downloadable source.
// Returns either a yt-dlp page URL (YouTube / SoundCloud / Bandcamp / Dailymotion)
// or a direct media URL (Audius / Archive / Jamendo / Odysee / legacy).
import { archiveFileUrl, audiusStreamUrl, dailymotionUrl, jamendoStreamUrl, odyseeStreamUrl, soundcloudUrl } from "./platforms";
import { matchOnYouTube } from "./majors";
import { db } from "@/db";
import { tracks } from "@/db/schema";
import { eq } from "drizzle-orm";

export type Resolved = { kind: "ytdlp"; url: string; youtube: boolean } | { kind: "direct"; url: string } | null;

export async function resolveSource(source: string, sourceId: string | null, sourceUrl: string | null, meta?: { trackId?: number; title?: string; artist?: string; durationSec?: number }): Promise<Resolved> {
  if (!sourceId && !sourceUrl) return null;
  // Major catalogs (Spotify / Apple Music / Deezer): full-length via the matching
  // YouTube Music video; the official 30s preview is the fallback.
  if (source === "spotify" || source === "applemusic" || source === "deezer") {
    let vid: string | null = null;
    if (meta?.title && meta.artist) {
      vid = await matchOnYouTube(meta.title, meta.artist, meta.durationSec ?? 0);
      // persist the match so playback can use the YouTube player next time
      if (vid && meta.trackId) {
        await db.update(tracks).set({ previewUrl: sourceUrl }).where(eq(tracks.id, meta.trackId)).catch(() => {});
      }
    }
    if (vid) return { kind: "ytdlp", url: `https://www.youtube.com/watch?v=${vid}`, youtube: true };
    return sourceUrl ? { kind: "direct", url: sourceUrl } : null;
  }
  switch (source) {
    case "youtube":
      return sourceId ? { kind: "ytdlp", url: `https://www.youtube.com/watch?v=${sourceId}`, youtube: true } : null;
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
