import { getDemoUser, getTrackDTO } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/tracks/[id]
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const trackId = Number(id);
  if (!Number.isInteger(trackId)) {
    return Response.json({ error: "Invalid track id" }, { status: 400 });
  }
  const user = await getDemoUser();
  const track = await getTrackDTO(trackId, user.id);
  if (!track) return Response.json({ error: "Track not found" }, { status: 404 });
  return Response.json(track);
}
