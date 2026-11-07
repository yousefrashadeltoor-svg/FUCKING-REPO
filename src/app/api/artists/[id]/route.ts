import { getArtistDetail, getDemoUser } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/artists/[id] — artist + top tracks + discography
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const artistId = Number(id);
  if (!Number.isInteger(artistId)) {
    return Response.json({ error: "Invalid artist id" }, { status: 400 });
  }
  const user = await getDemoUser();
  const detail = await getArtistDetail(artistId, user.id);
  if (!detail) return Response.json({ error: "Artist not found" }, { status: 404 });
  return Response.json(detail);
}
