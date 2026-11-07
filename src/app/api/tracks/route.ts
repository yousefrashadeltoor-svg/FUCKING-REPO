import { NextRequest } from "next/server";
import { getDemoUser, listTracks } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

// GET /api/tracks?q=&genre=&sort=trending|new|title|energy&limit=&offset=
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const user = await getDemoUser();
  const result = await listTracks({
    q: sp.get("q") ?? undefined,
    genre: sp.get("genre") ?? undefined,
    sort: (sp.get("sort") as "trending" | "new" | "title" | "energy") ?? "trending",
    limit: Math.min(200, Number(sp.get("limit") ?? 50)),
    offset: Number(sp.get("offset") ?? 0),
    userId: user.id,
  });
  return Response.json(result);
}
