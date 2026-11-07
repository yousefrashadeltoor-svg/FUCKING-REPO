import { listArtists } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

// GET /api/artists
export async function GET() {
  return Response.json(await listArtists(100));
}
