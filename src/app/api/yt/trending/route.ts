import { keyConfigured, trending } from "@/lib/server/yt-service";

export const dynamic = "force-dynamic";

/** GET /api/yt/trending?region=EG — official "most popular" chart. */
export async function GET(req: Request) {
  if (!keyConfigured()) {
    return Response.json({ ok: false, configured: false, error: "YOUTUBE_API_KEY is not configured" }, { status: 503 });
  }
  const p = new URL(req.url).searchParams;
  const items = await trending(p.get("region") ?? "EG", Number(p.get("max") ?? 24));
  return Response.json({ ok: true, items }, { headers: { "Cache-Control": "public, max-age=300" } });
}
