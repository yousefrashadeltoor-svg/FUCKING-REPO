import { notConnected, viewer } from "@/lib/server/yt-auth";
import {
  addToPlaylist,
  myRating,
  postComment,
  rate,
  removeFromPlaylist,
  subscribe,
  subscriptionFor,
  unsubscribe,
} from "@/lib/server/yt-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/yt/actions
 *   One endpoint for the real interactions, so the client cannot ask for
 *   anything the Data API does not support:
 *     { action: "subscribe",   channelId }
 *     { action: "unsubscribe", channelId }
 *     { action: "rate",        videoId, rating: "like"|"dislike"|"none" }
 *     { action: "playlist:add", playlistId, videoId }
 *     { action: "playlist:remove", itemId }
 *     { action: "comment",     videoId, text }
 *     { action: "rating",      videoId }            → read current rating
 */
export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  const { accessToken } = await viewer(origin);
  if (!accessToken) return notConnected();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const action = String(body.action ?? "");
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");

  switch (action) {
    case "subscribe": {
      const channelId = str("channelId");
      if (!channelId) return Response.json({ ok: false, error: "channelId required" }, { status: 400 });
      const r = await subscribe(accessToken, channelId);
      return Response.json(r, { status: r.ok ? 200 : r.status || 502 });
    }
    case "unsubscribe": {
      const channelId = str("channelId");
      if (!channelId) return Response.json({ ok: false, error: "channelId required" }, { status: 400 });
      const subId = await subscriptionFor(accessToken, channelId);
      if (!subId) return Response.json({ ok: false, error: "Not subscribed to this channel" }, { status: 404 });
      const r = await unsubscribe(accessToken, subId);
      return Response.json(r, { status: r.ok ? 200 : r.status || 502 });
    }
    case "rate": {
      const videoId = str("videoId");
      const rating = str("rating");
      if (!videoId || !["like", "dislike", "none"].includes(rating)) {
        return Response.json({ ok: false, error: "videoId and rating are required" }, { status: 400 });
      }
      const r = await rate(accessToken, videoId, rating as "like" | "dislike" | "none");
      return Response.json(r, { status: r.ok ? 200 : r.status || 502 });
    }
    case "rating": {
      const videoId = str("videoId");
      if (!videoId) return Response.json({ ok: false, error: "videoId required" }, { status: 400 });
      return Response.json({ ok: true, rating: await myRating(accessToken, videoId) });
    }
    case "playlist:add": {
      const playlistId = str("playlistId");
      const videoId = str("videoId");
      if (!playlistId || !videoId) return Response.json({ ok: false, error: "playlistId and videoId required" }, { status: 400 });
      const r = await addToPlaylist(accessToken, playlistId, videoId);
      return Response.json(r, { status: r.ok ? 200 : r.status || 502 });
    }
    case "playlist:remove": {
      const itemId = str("itemId");
      if (!itemId) return Response.json({ ok: false, error: "itemId required" }, { status: 400 });
      const r = await removeFromPlaylist(accessToken, itemId);
      return Response.json(r, { status: r.ok ? 200 : r.status || 502 });
    }
    case "comment": {
      const videoId = str("videoId");
      const text = str("text").trim();
      if (!videoId || !text) return Response.json({ ok: false, error: "videoId and text required" }, { status: 400 });
      if (text.length > 10_000) return Response.json({ ok: false, error: "Comment is too long" }, { status: 400 });
      const r = await postComment(accessToken, videoId, text);
      return Response.json(r, { status: r.ok ? 200 : r.status || 502 });
    }
    default:
      return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  }
}
