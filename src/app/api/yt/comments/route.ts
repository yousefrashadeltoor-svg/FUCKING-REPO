import { comments } from "@/lib/server/yt-service";

export const dynamic = "force-dynamic";

/** GET /api/yt/comments?video=…&page=…&order=relevance|time */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const video = p.get("video");
  if (!video) return Response.json({ ok: false, error: "video is required" }, { status: 400 });
  const result = await comments(
    video,
    p.get("page") ?? undefined,
    Number(p.get("max") ?? 20),
    p.get("order") === "time" ? "time" : "relevance",
  );
  return Response.json(result, { status: result.ok ? 200 : result.status || 502, headers: { "Cache-Control": "public, max-age=60" } });
}
