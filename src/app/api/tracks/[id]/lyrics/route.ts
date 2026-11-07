import { db, ensureSchema } from "@/db";
import { tracks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchRealLyrics } from "@/lib/server/lyrics";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
//  GET /api/tracks/[id]/lyrics — real lyrics from lyrics.ovh, cached in DB.
//  Returns { lyrics: [{ start, text }] } with evenly-distributed timestamps.
// ---------------------------------------------------------------------------
export async function GET(_req: Request, ctx: Ctx) {
  await ensureSchema();
  const { id } = await ctx.params;
  const trackId = Number(id);
  if (!Number.isInteger(trackId)) {
    return Response.json({ error: "Invalid track id" }, { status: 400 });
  }
  const [row] = await db
    .select({
      lyrics: tracks.lyrics,
      durationSec: tracks.durationSec,
      title: tracks.title,
      artistId: tracks.artistId,
    })
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1);
  if (!row) return Response.json({ error: "Track not found" }, { status: 404 });

  if (row.lyrics && row.lyrics.length > 0) {
    return Response.json({ lyrics: row.lyrics, cached: true });
  }

  const { artists } = await import("@/db/schema");
  const [artist] = await db
    .select({ name: artists.name })
    .from(artists)
    .where(eq(artists.id, row.artistId))
    .limit(1);

  const lyrics = await fetchRealLyrics(
    artist?.name ?? "",
    row.title,
    row.durationSec,
  );
  if (!lyrics || lyrics.length === 0) {
    return Response.json({ lyrics: [], cached: false });
  }
  await db.update(tracks).set({ lyrics }).where(eq(tracks.id, trackId));
  return Response.json({ lyrics, cached: false });
}
