import { getAlbumDetail, getDemoUser } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/albums/[id] — album + artist + full tracklist
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const albumId = Number(id);
  if (!Number.isInteger(albumId)) {
    return Response.json({ error: "Invalid album id" }, { status: 400 });
  }
  const user = await getDemoUser();
  const detail = await getAlbumDetail(albumId, user.id);
  if (!detail) return Response.json({ error: "Album not found" }, { status: 404 });
  return Response.json(detail);
}
