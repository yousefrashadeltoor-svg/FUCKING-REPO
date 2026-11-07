import { listAlbums } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

// GET /api/albums
export async function GET() {
  return Response.json(await listAlbums(100));
}
