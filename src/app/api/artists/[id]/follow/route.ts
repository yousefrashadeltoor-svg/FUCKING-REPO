import { getDemoUser, toggleFollow } from "@/lib/server/queries";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// POST /api/artists/[id]/follow — toggle follow, returns { following }
export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const artistId = Number(id);
  if (!Number.isInteger(artistId)) return Response.json({ error: "Invalid artist id" }, { status: 400 });
  const user = await getDemoUser();
  const following = await toggleFollow(user.id, artistId);
  return Response.json({ following });
}
