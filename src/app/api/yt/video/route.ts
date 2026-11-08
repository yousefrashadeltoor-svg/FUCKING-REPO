import { videoById } from "@/lib/server/yt-service";

export const dynamic = "force-dynamic";

/** GET /api/yt/video?id=… — full metadata for one video. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ ok: false, error: "id is required" }, { status: 400 });
  const video = await videoById(id);
  if (!video) return Response.json({ ok: false, error: "Video not found (or the API key is missing)" }, { status: 404 });
  return Response.json({ ok: true, video }, { headers: { "Cache-Control": "public, max-age=300" } });
}
