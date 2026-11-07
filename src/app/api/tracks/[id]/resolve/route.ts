import { db } from "@/db";
import { artists, tracks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { matchOnYouTube } from "@/lib/server/majors";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
//  GET /api/tracks/[id]/resolve
//  For Spotify / Apple Music / Deezer tracks: find the same song on YouTube
//  Music so the player can play it FULL-LENGTH (the official 30s preview is
//  the fallback). Returns { youtubeId, previewUrl }.
// ---------------------------------------------------------------------------
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const trackId = Number(id);
  if (!Number.isInteger(trackId)) return Response.json({ error: "Invalid track id" }, { status: 400 });
  const [row] = await db
    .select({ source: tracks.source, sourceId: tracks.sourceId, sourceUrl: tracks.sourceUrl, title: tracks.title, durationSec: tracks.durationSec, artistId: tracks.artistId, isrc: tracks.isrc })
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1);
  if (!row) return Response.json({ error: "Track not found" }, { status: 404 });
  if (row.source === "youtube") return Response.json({ youtubeId: row.sourceId, previewUrl: null });
  // cached match lives in isrc column prefixed "yt:" (no schema change needed)
  if (row.isrc?.startsWith("yt:")) return Response.json({ youtubeId: row.isrc.slice(3), previewUrl: row.sourceUrl });
  const [artist] = await db.select({ name: artists.name }).from(artists).where(eq(artists.id, row.artistId)).limit(1);
  const vid = await matchOnYouTube(row.title, artist?.name ?? "", row.durationSec);
  if (vid) await db.update(tracks).set({ isrc: `yt:${vid}` }).where(eq(tracks.id, trackId));
  return Response.json({ youtubeId: vid, previewUrl: row.sourceUrl });
}
