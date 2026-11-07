import { followedArtists, getDemoUser } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

// GET /api/follows — artists the user follows
export async function GET() {
  const user = await getDemoUser();
  return Response.json(await followedArtists(user.id));
}
