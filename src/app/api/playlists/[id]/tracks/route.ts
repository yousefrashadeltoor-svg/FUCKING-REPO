import { NextRequest } from "next/server";
import { db } from "@/db";
import { playlistTracks, tracks } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getDemoUser, getPlaylistDetail } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const parseId = (id: string) => {
  const n = Number(id);
  return Number.isInteger(n) ? n : null;
};

// POST /api/playlists/[id]/tracks  { trackId, position? }
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const pid = parseId(id);
  if (pid === null) return Response.json({ error: "Invalid playlist id" }, { status: 400 });
  let body: { trackId?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.trackId || !Number.isInteger(body.trackId)) {
    return Response.json({ error: "trackId is required" }, { status: 400 });
  }
  const [exists] = await db.select({ id: tracks.id }).from(tracks).where(eq(tracks.id, body.trackId)).limit(1);
  if (!exists) return Response.json({ error: "Track not found" }, { status: 404 });

  const [maxPos] = await db
    .select({ p: sql<number>`coalesce(max(${playlistTracks.position}), -1)::int` })
    .from(playlistTracks)
    .where(eq(playlistTracks.playlistId, pid));
  await db
    .insert(playlistTracks)
    .values({ playlistId: pid, trackId: body.trackId, position: (maxPos?.p ?? -1) + 1 })
    .onConflictDoNothing();
  const user = await getDemoUser();
  return Response.json(await getPlaylistDetail(pid, user.id), { status: 201 });
}

// DELETE /api/playlists/[id]/tracks?trackId=...
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const pid = parseId(id);
  const trackId = Number(req.nextUrl.searchParams.get("trackId"));
  if (pid === null || !Number.isInteger(trackId)) {
    return Response.json({ error: "Invalid ids" }, { status: 400 });
  }
  await db
    .delete(playlistTracks)
    .where(and(eq(playlistTracks.playlistId, pid), eq(playlistTracks.trackId, trackId)));
  const user = await getDemoUser();
  return Response.json(await getPlaylistDetail(pid, user.id));
}
