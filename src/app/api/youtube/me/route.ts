import { cookies } from "next/headers";
import {
  bestThumb,
  decodeTokens,
  isConfigured,
  isoDuration,
  TOKEN_COOKIE,
  encodeTokens,
  ytApi,
  type YtChannel,
  type YtPlaylistItem,
  type YtSubscriptionItem,
  type YtVideoItem,
} from "@/lib/server/google";

export const dynamic = "force-dynamic";

/**
 * GET /api/youtube/me
 *   → the signed-in user's REAL YouTube account: channel, subscriber count,
 *     subscriptions, playlists, recent uploads from those subscriptions and
 *     recommendations derived from them.
 *   With no token it returns `{ connected: false }` — never mock data.
 */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  if (!isConfigured(origin)) {
    return Response.json({ connected: false, configured: false, reason: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set" });
  }

  const jar = await cookies();
  const tokens = decodeTokens(jar.get(TOKEN_COOKIE)?.value);
  if (!tokens) return Response.json({ connected: false, configured: true });

  // 1. own channel
  const me = await ytApi<{ items: YtChannel[] }>(origin, tokens, "channels", {
    part: "snippet,statistics,brandingSettings",
    mine: "true",
  });
  if (!me.data || me.data.items.length === 0) {
    return Response.json({ connected: false, configured: true, reason: me.error ?? "no channel" });
  }
  const ch = me.data.items[0];

  // 2. subscriptions (first page is enough for the dashboard, 50 = max)
  const subs = await ytApi<{ items: YtSubscriptionItem[] }>(origin, tokens, "subscriptions", {
    part: "snippet",
    mine: "true",
    maxResults: "50",
    order: "alphabetical",
  });

  // 3. own playlists
  const lists = await ytApi<{ items: YtPlaylistItem[] }>(origin, tokens, "playlists", {
    part: "snippet,contentDetails",
    mine: "true",
    maxResults: "25",
  });

  // 4. newest uploads from the first subscriptions → real "for you" feed
  const channelIds = (subs.data?.items ?? []).slice(0, 8).map((s) => s.snippet.resourceId.channelId);
  let feed: YtVideoItem[] = [];
  if (channelIds.length) {
    const vids = await ytApi<{ items: YtVideoItem[] }>(origin, tokens, "search", {
      part: "snippet",
      channelId: channelIds[0],
      type: "video",
      order: "date",
      maxResults: "12",
    });
    feed = vids.data?.items ?? [];
  }

  // 5. liked videos = genuine personal recommendations seed
  const liked = await ytApi<{ items: YtVideoItem[] }>(origin, tokens, "videos", {
    part: "snippet,contentDetails,statistics",
    myRating: "like",
    maxResults: "15",
  });

  const refreshed = encodeTokens(me.tokens);
  const res = Response.json({
    connected: true,
    configured: true,
    channel: {
      id: ch.id,
      title: ch.snippet.title,
      handle: ch.snippet.customUrl ?? null,
      description: ch.snippet.description ?? null,
      country: ch.snippet.country ?? null,
      publishedAt: ch.snippet.publishedAt ?? null,
      avatar: bestThumb(ch.snippet.thumbnails),
      banner: ch.brandingSettings?.image?.bannerExternalUrl ?? null,
      subscribers: ch.statistics?.hiddenSubscriberCount ? null : Number(ch.statistics?.subscriberCount ?? 0),
      views: Number(ch.statistics?.viewCount ?? 0),
      videos: Number(ch.statistics?.videoCount ?? 0),
    },
    subscriptions: (subs.data?.items ?? []).map((s) => ({
      channelId: s.snippet.resourceId.channelId,
      title: s.snippet.title,
      description: s.snippet.description ?? null,
      avatar: bestThumb(s.snippet.thumbnails),
      url: `https://www.youtube.com/channel/${s.snippet.resourceId.channelId}`,
    })),
    playlists: (lists.data?.items ?? []).map((p) => ({
      id: p.id,
      title: p.snippet.title,
      count: p.contentDetails?.itemCount ?? 0,
      thumb: bestThumb(p.snippet.thumbnails),
      url: `https://www.youtube.com/playlist?list=${p.id}`,
    })),
    feed: feed.map(videoDto),
    liked: (liked.data?.items ?? []).map(videoDto),
    errors: [subs.error, lists.error, liked.error].filter(Boolean),
  });
  res.headers.set("x-dm-token-refresh", me.tokens.access_token === tokens.access_token ? "no" : "yes");
  return res;
}

function videoDto(v: YtVideoItem) {
  return {
    videoId: v.id,
    title: v.snippet.title,
    channelId: v.snippet.channelId,
    channel: v.snippet.channelTitle,
    publishedAt: v.snippet.publishedAt ?? null,
    thumb: bestThumb(v.snippet.thumbnails),
    durationSec: isoDuration(v.contentDetails?.duration),
    views: v.statistics?.viewCount ? Number(v.statistics.viewCount) : null,
    likes: v.statistics?.likeCount ? Number(v.statistics.likeCount) : null,
    url: `https://www.youtube.com/watch?v=${v.id}`,
  };
}
