import { NextRequest } from "next/server";
import { getDemoUser, listTracks, recordPlay, recentlyPlayed } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

// GET /api/history — recently played tracks
export async function GET() {
  const user = await getDemoUser();
  return Response.json(await recentlyPlayed(user.id, 50));
}

// POST /api/history  { trackId, durationListenedSec? } — scrobble a play
export async function POST(req: NextRequest) {
  const user = await getDemoUser();
  let body: { trackId?: number; durationListenedSec?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.trackId || !Number.isInteger(body.trackId) || body.trackId <= 0) {
    return Response.json({ error: "Invalid trackId" }, { status: 400 });
  }
  await recordPlay(user.id, body.trackId, Math.max(0, body.durationListenedSec ?? 0));
  // Return fresh trending so the UI reflects the new play immediately.
  const trending = await listTracks({ sort: "trending", limit: 12, userId: user.id });
  return Response.json({ ok: true, trending: trending.items });
}
