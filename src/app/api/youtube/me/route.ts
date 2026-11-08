import { bestThumb, isConfigured, isoDuration, type YtVideoItem } from "@/lib/server/google";
import { getCurrentUser } from "@/lib/server/session";
import { getAccount, getAccessToken } from "@/lib/server/oauth-store";
import { myChannel, myPlaylists, mySubscriptions } from "@/lib/server/yt-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/youtube/me
 *   The signed-in user's REAL YouTube account: channel, subscriptions,
 *   playlists and a feed built from their newest subscriptions.
 *   Token comes from the encrypted server-side store — never from a cookie the
 *   browser could read, and never from the URL.
 */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  if (!isConfigured(origin)) {
    return Response.json({
      connected: false,
      configured: false,
      reason: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set on this deployment",
    });
  }

  const user = await getCurrentUser();
  if (user.id < 0) return Response.json({ connected: false, configured: true });

  const account = await getAccount(user.id);
  if (!account?.refreshToken) return Response.json({ connected: false, configured: true });

  const token = await getAccessToken(origin, user.id);
  if (!token) {
    return Response.json({
      connected: false,
      configured: true,
      reason: "The Google grant expired or was revoked — reconnect your account.",
    });
  }

  const [channel, subs, playlists] = await Promise.all([
    myChannel(token),
    mySubscriptions(token, undefined, 50),
    myPlaylists(token, undefined, 25),
  ]);

  // Real "for you": newest uploads of the first few subscriptions.
  let feed: YtVideoItem[] = [];
  const firstChannel = subs.items[0]?.channelId;
  if (firstChannel) {
    const uploads = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${new URLSearchParams({
        part: "snippet",
        channelId: firstChannel,
        type: "video",
        order: "date",
        maxResults: "12",
      }).toString()}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    ).catch(() => null);
    if (uploads?.ok) {
      const json = (await uploads.json()) as { items?: YtVideoItem[] };
      feed = json.items ?? [];
    }
  }

  return Response.json(
    {
      connected: true,
      configured: true,
      channel: channel
        ? {
            id: channel.id,
            title: channel.title,
            handle: channel.handle,
            description: channel.description,
            country: channel.country,
            publishedAt: channel.publishedAt,
            avatar: channel.avatar,
            banner: channel.banner,
            subscribers: channel.subscribers,
            views: channel.views,
            videos: channel.videoCount,
            url: channel.url,
          }
        : null,
      subscriptions: subs.items.map((s) => ({
        channelId: s.channelId,
        title: s.title,
        description: s.description,
        avatar: s.avatar,
        url: `https://www.youtube.com/channel/${s.channelId}`,
      })),
      subscriptionsNextPage: subs.nextPageToken,
      playlists: playlists.items.map((p) => ({
        id: p.id,
        title: p.title,
        count: p.count,
        thumb: p.thumb,
        url: `https://www.youtube.com/playlist?list=${p.id}`,
      })),
      feed: feed.map((v) => ({
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
      })),
      scopes: account.scopes,
      // Honest note: YouTube keeps the authoritative copy of all of this.
      manageUrl: "https://studio.youtube.com",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
