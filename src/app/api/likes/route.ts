import { NextRequest } from "next/server";
import { getDemoUser, likedTracks, toggleLike } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

// GET /api/likes — all liked tracks of the demo user
export async function GET() {
  const user = await getDemoUser();
  return Response.json(await likedTracks(user.id));
}

// POST /api/likes  { trackId } — toggles like, returns { liked }
export async function POST(req: NextRequest) {
  const user = await getDemoUser();
  let body: { trackId?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.trackId || !Number.isInteger(body.trackId) || body.trackId <= 0) {
    return Response.json({ error: "Invalid trackId" }, { status: 400 });
  }
  const liked = await toggleLike(user.id, body.trackId);
  return Response.json({ liked });
}
