import { NextRequest } from "next/server";
import { getDemoUser, recordReelEvent } from "@/lib/server/queries";
import { buildReels } from "@/lib/server/reels";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET /api/reels?cursor=0&limit=12 — personalized reels feed
export async function GET(req: NextRequest) {
  const user = await getDemoUser();
  const cursor = Math.max(0, Number(req.nextUrl.searchParams.get("cursor") ?? 0));
  const limit = Math.min(30, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 12)));
  let reels = await buildReels(user.id, limit, cursor);
  const pin = Number(req.nextUrl.searchParams.get("track") ?? 0);
  if (pin && cursor === 0) {
    const { getTrackDTO } = await import("@/lib/server/queries");
    const { db } = await import("@/db");
    const { artists } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { hydrateArtists } = await import("@/lib/server/queries");
    const track = await getTrackDTO(pin, user.id);
    if (track) {
      const [ar] = await db.select().from(artists).where(eq(artists.id, track.artistId)).limit(1);
      const [artistDTO] = ar ? await hydrateArtists([ar], user.id) : [null];
      reels = [{ track, artist: artistDTO ?? null, featuring: null, reason: "shared with you", score: 99, likes: 0, views: Math.round(track.playCount / 10) }, ...reels.filter((r) => r.track.id !== pin)];
    }
  }
  return Response.json({ reels, nextCursor: cursor + reels.length, hasMore: reels.length >= limit });
}

// POST /api/reels { trackId, kind: view|like|skip|share|download|complete, watchedSec }
export async function POST(req: NextRequest) {
  const user = await getDemoUser();
  let body: { trackId?: number; kind?: string; watchedSec?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.trackId || !Number.isInteger(body.trackId)) return Response.json({ error: "trackId is required" }, { status: 400 });
  const kind = ["view", "like", "skip", "share", "download", "complete"].includes(body.kind ?? "") ? body.kind! : "view";
  await recordReelEvent(user.id, body.trackId, kind, Math.max(0, body.watchedSec ?? 0));
  return Response.json({ ok: true });
}
