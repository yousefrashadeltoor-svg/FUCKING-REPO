import { keyConfigured, search } from "@/lib/server/yt-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/yt/search
 *   Real YouTube Data API v3 search with the official filters.
 *   Params: q, type=video|channel|playlist, order, duration=short|medium|long,
 *           after, before, region, lang, channelId, max, page, licensed, hd, captions
 */
export async function GET(req: Request) {
  if (!keyConfigured()) {
    return Response.json(
      { ok: false, error: "YOUTUBE_API_KEY is not configured", configured: false },
      { status: 503 },
    );
  }
  const p = new URL(req.url).searchParams;
  const q = (p.get("q") ?? "").trim();
  if (!q && !p.get("channelId")) {
    return Response.json({ ok: false, error: "q is required" }, { status: 400 });
  }
  const result = await search({
    q,
    type: (p.get("type") as "video" | "channel" | "playlist") ?? "video",
    order: (p.get("order") as "relevance" | "date" | "viewCount" | "rating" | "title") ?? "relevance",
    videoDuration: (p.get("duration") as "any" | "short" | "medium" | "long") ?? "any",
    publishedAfter: p.get("after") ?? undefined,
    publishedBefore: p.get("before") ?? undefined,
    regionCode: p.get("region") ?? undefined,
    relevanceLanguage: p.get("lang") ?? undefined,
    channelId: p.get("channelId") ?? undefined,
    maxResults: Number(p.get("max") ?? 20),
    pageToken: p.get("page") ?? undefined,
    licensed: p.get("licensed") === "1",
    hd: p.get("hd") === "1",
    captions: p.get("captions") === "1",
  });
  if (!result.ok) return Response.json(result, { status: result.status || 502 });
  return Response.json(result, { headers: { "Cache-Control": "public, max-age=60" } });
}
