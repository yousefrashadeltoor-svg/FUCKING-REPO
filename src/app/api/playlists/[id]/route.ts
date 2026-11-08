import { NextRequest } from "next/server";
import { db } from "@/db";
import { playlists, playlistTracks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getDemoUser, getPlaylistDetail } from "@/lib/server/queries";
import { ensureSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const parseId = (id: string) => {
  const n = Number(id);
  return Number.isInteger(n) ? n : null;
};

// GET /api/playlists/[id]
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const pid = parseId(id);
  if (pid === null) return Response.json({ error: "Invalid playlist id" }, { status: 400 });
  const user = await getDemoUser();
  const detail = await getPlaylistDetail(pid, user.id);
  if (!detail) return Response.json({ error: "Playlist not found" }, { status: 404 });
  return Response.json(detail);
}

// PATCH /api/playlists/[id]  { title?, description?, isPublic? }
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const pid = parseId(id);
  if (pid === null) return Response.json({ error: "Invalid playlist id" }, { status: 400 });
  const owner = await ensureSessionUser();
  const [target] = await db.select({ ownerId: playlists.ownerId }).from(playlists).where(eq(playlists.id, pid)).limit(1);
  if (!target) return Response.json({ error: "Playlist not found" }, { status: 404 });
  if (target.ownerId !== owner.id) return Response.json({ error: "Not your playlist" }, { status: 403 });
  let body: { title?: string; description?: string; isPublic?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const [row] = await db
    .update(playlists)
    .set({
      ...(body.title?.trim() ? { title: body.title.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.isPublic !== undefined ? { isPublic: body.isPublic } : {}),
      updatedAt: new Date(),
    })
    .where(eq(playlists.id, pid))
    .returning();
  if (!row) return Response.json({ error: "Playlist not found" }, { status: 404 });
  const user = await getDemoUser();
  return Response.json(await getPlaylistDetail(pid, user.id));
}

// DELETE /api/playlists/[id]
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const pid = parseId(id);
  if (pid === null) return Response.json({ error: "Invalid playlist id" }, { status: 400 });
  const owner = await ensureSessionUser();
  const [target] = await db.select({ ownerId: playlists.ownerId }).from(playlists).where(eq(playlists.id, pid)).limit(1);
  if (!target) return Response.json({ error: "Playlist not found" }, { status: 404 });
  if (target.ownerId !== owner.id) return Response.json({ error: "Not your playlist" }, { status: 403 });
  await db.delete(playlistTracks).where(eq(playlistTracks.playlistId, pid));
  const [row] = await db.delete(playlists).where(eq(playlists.id, pid)).returning();
  if (!row) return Response.json({ error: "Playlist not found" }, { status: 404 });
  return Response.json({ ok: true, id: pid });
}
