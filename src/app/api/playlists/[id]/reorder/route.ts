import { NextRequest } from "next/server";
import { db } from "@/db";
import { playlistTracks } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getDemoUser, getPlaylistDetail } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/playlists/[id]/reorder  { trackIds: number[] } — full new ordering
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const pid = Number(id);
  if (!Number.isInteger(pid)) {
    return Response.json({ error: "Invalid playlist id" }, { status: 400 });
  }
  let body: { trackIds?: number[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(body.trackIds) || body.trackIds.length === 0) {
    return Response.json({ error: "trackIds array is required" }, { status: 400 });
  }
  for (const [pos, trackId] of body.trackIds.entries()) {
    await db
      .update(playlistTracks)
      .set({ position: pos })
      .where(
        and(eq(playlistTracks.playlistId, pid), eq(playlistTracks.trackId, Number(trackId))),
      );
  }
  const user = await getDemoUser();
  return Response.json(await getPlaylistDetail(pid, user.id));
}
