import { notConnected, viewer } from "@/lib/server/yt-auth";
import { myPlaylists, playlistItems } from "@/lib/server/yt-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/yt/playlists                 → the account's own playlists
 * GET /api/yt/playlists?id=PL…&page=…   → the items of any playlist
 */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const { accessToken } = await viewer(origin);
  if (!accessToken) return notConnected();

  const p = new URL(req.url).searchParams;
  const id = p.get("id");
  if (id) {
    const result = await playlistItems(id, p.get("page") ?? undefined, Number(p.get("max") ?? 50));
    return Response.json(result, { status: result.ok ? 200 : result.status || 502 });
  }
  const data = await myPlaylists(accessToken, p.get("page") ?? undefined, Number(p.get("max") ?? 25));
  return Response.json({ ok: true, ...data }, { headers: { "Cache-Control": "no-store" } });
}
