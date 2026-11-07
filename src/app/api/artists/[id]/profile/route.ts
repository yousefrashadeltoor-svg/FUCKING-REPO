import { getDemoUser } from "@/lib/server/queries";
import { buildArtistProfile } from "@/lib/server/artist-profile";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
type Ctx = { params: Promise<{ id: string }> };

// GET /api/artists/[id]/profile — full profile: top · albums · collabs · videos · related
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const artistId = Number(id);
  if (!Number.isInteger(artistId)) return Response.json({ error: "Invalid artist id" }, { status: 400 });
  const user = await getDemoUser();
  const profile = await buildArtistProfile(artistId, user.id);
  if (!profile) return Response.json({ error: "Artist not found" }, { status: 404 });
  return Response.json(profile);
}
