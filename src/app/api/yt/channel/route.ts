import { channelByHandle, channelUploads, channelById } from "@/lib/server/yt-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/yt/channel?id=UC… | ?handle=@name [&page=…&max=24]
 *   Channel header + its real uploads, one request.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const id = p.get("id");
  const handle = p.get("handle");
  if (!id && !handle) return Response.json({ ok: false, error: "id or handle is required" }, { status: 400 });

  const channel = id ? await channelById(id) : await channelByHandle(handle!);
  if (!channel) {
    return Response.json({ ok: false, error: "Channel not found (or the API key is missing)" }, { status: 404 });
  }
  const uploads = await channelUploads(channel.id, p.get("page") ?? undefined, Number(p.get("max") ?? 24));
  return Response.json(
    { ok: true, channel, uploads: uploads.ok ? uploads.data : { items: [], nextPageToken: null, totalResults: null }, uploadsError: uploads.ok ? null : uploads.error },
    { headers: { "Cache-Control": "public, max-age=120" } },
  );
}
