import { NextRequest } from "next/server";
import { getDemoUser, likedAlbums, toggleAlbumLike } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

// GET /api/albums/like — liked albums
export async function GET() {
  const user = await getDemoUser();
  return Response.json(await likedAlbums(user.id));
}

// POST /api/albums/like { albumId } — toggle
export async function POST(req: NextRequest) {
  const user = await getDemoUser();
  let body: { albumId?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.albumId || !Number.isInteger(body.albumId)) return Response.json({ error: "albumId is required" }, { status: 400 });
  const liked = await toggleAlbumLike(user.id, body.albumId);
  return Response.json({ liked });
}
