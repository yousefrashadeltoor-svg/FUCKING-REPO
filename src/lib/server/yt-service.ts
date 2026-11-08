// ============================================================================
//  DON MUSE — YouTube service (official Data API v3 only)
//  ---------------------------------------------------------------------------
//  Two clearly separated halves:
//
//   PUBLIC  (API key, YOUTUBE_API_KEY)
//     search with all the official filters + paging, video/channel/playlist
//     details, channel uploads, comments. Works for every visitor.
//
//   PRIVATE (per-user OAuth access token, resolved server-side)
//     subscribe / unsubscribe, like / dislike / remove rating, add a video to a
//     personal playlist, post a comment, read the account's own channel.
//
//  Everything returns `{ ok, data|error }` and never fabricates a result: if a
//  key or scope is missing the caller gets a precise error string the UI shows.
// ============================================================================
import {
  bestThumb,
  isoDuration,
  ytFetch,
  type YtChannel,
  type YtPlaylistItem,
  type YtVideoItem,
} from "./google";

const API = "https://www.googleapis.com/youtube/v3";

export function publicKey(): string | null {
  return process.env.YOUTUBE_API_KEY?.trim() || null;
}

export function keyConfigured(): boolean {
  return publicKey() !== null;
}

/* -------------------------------- shapes -------------------------------- */

export interface VideoDTO {
  videoId: string;
  title: string;
  channelId: string;
  channel: string;
  publishedAt: string | null;
  thumb: string | null;
  durationSec: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  description: string | null;
  live: "none" | "live" | "upcoming";
  url: string;
}

export interface ChannelDTO {
  id: string;
  title: string;
  handle: string | null;
  description: string | null;
  avatar: string | null;
  banner: string | null;
  subscribers: number | null;
  views: number | null;
  videoCount: number | null;
  country: string | null;
  publishedAt: string | null;
  url: string;
}

export interface PlaylistDTO {
  id: string;
  title: string;
  description: string | null;
  channelId: string | null;
  channel: string | null;
  count: number;
  thumb: string | null;
  publishedAt: string | null;
  url: string;
}

export interface CommentDTO {
  id: string;
  author: string;
  authorAvatar: string | null;
  authorChannelId: string | null;
  text: string;
  likeCount: number;
  replyCount: number;
  publishedAt: string | null;
  isReply: boolean;
}

export interface Paged<T> {
  items: T[];
  nextPageToken: string | null;
  totalResults: number | null;
}

/* ------------------------------ mappers -------------------------------- */

function mapVideo(v: YtVideoItem): VideoDTO {
  const live = (v.snippet as { liveBroadcastContent?: "live" | "upcoming" | "none" }).liveBroadcastContent;
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
    comments: (v.statistics as { commentCount?: string } | undefined)?.commentCount
      ? Number((v.statistics as { commentCount?: string }).commentCount)
      : null,
    description: v.snippet.description ?? null,
    live: live === "live" || live === "upcoming" ? live : "none",
    url: `https://www.youtube.com/watch?v=${v.id}`,
  };
}

function mapChannel(c: YtChannel): ChannelDTO {
  return {
    id: c.id,
    title: c.snippet.title,
    handle: c.snippet.customUrl ?? null,
    description: c.snippet.description ?? null,
    avatar: bestThumb(c.snippet.thumbnails),
    banner: c.brandingSettings?.image?.bannerExternalUrl ?? null,
    subscribers: c.statistics?.hiddenSubscriberCount ? null : Number(c.statistics?.subscriberCount ?? 0),
    views: c.statistics?.viewCount ? Number(c.statistics.viewCount) : null,
    videoCount: c.statistics?.videoCount ? Number(c.statistics.videoCount) : null,
    country: c.snippet.country ?? null,
    publishedAt: c.snippet.publishedAt ?? null,
    url: `https://www.youtube.com/channel/${c.id}`,
  };
}

function mapPlaylist(p: YtPlaylistItem): PlaylistDTO {
  return {
    id: p.id,
    title: p.snippet.title,
    description: p.snippet.description ?? null,
    channelId: (p.snippet as { channelId?: string }).channelId ?? null,
    channel: p.snippet.channelTitle ?? null,
    count: p.contentDetails?.itemCount ?? 0,
    thumb: bestThumb(p.snippet.thumbnails),
    publishedAt: p.snippet.publishedAt ?? null,
    url: `https://www.youtube.com/playlist?list=${p.id}`,
  };
}

/* --------------------------- public (api key) --------------------------- */

interface ApiError {
  error?: string;
  status: number;
}
type Result<T> = { ok: true; data: T } | ({ ok: false } & ApiError);

async function kget<T>(
  path: string,
  params: Record<string, string | undefined>,
): Promise<{ data: T | null; error?: string; status: number }> {
  const key = publicKey();
  if (!key) return { data: null, status: 0, error: "YOUTUBE_API_KEY is not set on this deployment" };
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, v);
  url.searchParams.set("key", key);
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(9000) });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let message = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string; errors?: { reason?: string }[] } };
        if (parsed.error?.message) message = parsed.error.message;
        const reason = parsed.error?.errors?.[0]?.reason;
        // Quota exhaustion is the most common failure — say it plainly.
        if (reason === "quotaExceeded") message = "YouTube API daily quota exceeded for this key. Try again after midnight Pacific Time.";
        if (reason === "keyInvalid" || reason === "accessNotConfigured") message = "This YouTube API key is invalid or the Data API is not enabled for the project.";
      } catch {
        if (text) message = `${message}: ${text.slice(0, 160)}`;
      }
      return { data: null, status: res.status, error: message };
    }
    return { data: (await res.json()) as T, status: res.status };
  } catch (err) {
    return { data: null, status: 0, error: err instanceof Error ? err.message : "network error" };
  }
}

export interface SearchOptions {
  q?: string;
  type?: "video" | "channel" | "playlist";
  order?: "relevance" | "date" | "viewCount" | "rating" | "title";
  /** ISO-8601 duration, e.g. "short" (<4m) or "long" (>20m) */
  videoDuration?: "any" | "short" | "medium" | "long";
  publishedAfter?: string;
  publishedBefore?: string;
  regionCode?: string;
  relevanceLanguage?: string;
  channelId?: string;
  maxResults?: number;
  pageToken?: string;
  /** extra: licensed content only */
  licensed?: boolean;
  /** extra: HD only */
  hd?: boolean;
  /** extra: captions available */
  captions?: boolean;
}

/**
 * Real YouTube search with the official filters and pagination.
 * Costs 100 quota units per call — the UI debounces and the route caches.
 */
export async function search(opts: SearchOptions): Promise<Result<Paged<VideoDTO | ChannelDTO | PlaylistDTO>>> {
  const type = opts.type ?? "video";
  const { data, error, status } = await kget<{
    items: (YtVideoItem & { id: { videoId?: string; channelId?: string; playlistId?: string } })[];
    nextPageToken?: string;
    pageInfo?: { totalResults?: number };
  }>("search", {
    part: "snippet",
    q: opts.q,
    type,
    order: opts.order,
    videoDuration: type === "video" ? (opts.videoDuration ?? "any") : undefined,
    publishedAfter: opts.publishedAfter,
    publishedBefore: opts.publishedBefore,
    regionCode: opts.regionCode,
    relevanceLanguage: opts.relevanceLanguage,
    channelId: opts.channelId,
    maxResults: String(Math.min(50, opts.maxResults ?? 20)),
    pageToken: opts.pageToken,
    videoLicense: opts.licensed ? "creativeCommon" : undefined,
    videoDefinition: opts.hd ? "high" : undefined,
    videoCaption: opts.captions ? "closedCaption" : undefined,
  });
  if (!data) return { ok: false, status, error: error ?? "search failed" };

  const ids: { video: string[]; channel: string[]; playlist: string[] } = { video: [], channel: [], playlist: [] };
  for (const item of data.items) {
    if (item.id.videoId) ids.video.push(item.id.videoId);
    else if (item.id.channelId) ids.channel.push(item.id.channelId);
    else if (item.id.playlistId) ids.playlist.push(item.id.playlistId);
  }

  let items: (VideoDTO | ChannelDTO | PlaylistDTO)[] = [];
  if (type === "video" && ids.video.length) {
    const details = await videosByIds(ids.video);
    // Keep YouTube's relevance ordering.
    const byId = new Map(details.map((v) => [v.videoId, v]));
    items = ids.video.map((id) => byId.get(id)).filter((v): v is VideoDTO => !!v);
  } else if (type === "channel" && ids.channel.length) {
    items = (await channelsByIds(ids.channel)) ?? [];
  } else if (type === "playlist" && ids.playlist.length) {
    items = (await playlistsByIds(ids.playlist)) ?? [];
  }
  return {
    ok: true,
    data: {
      items,
      nextPageToken: data.nextPageToken ?? null,
      totalResults: data.pageInfo?.totalResults ?? null,
    },
  };
}

export async function videosByIds(ids: string[]): Promise<VideoDTO[]> {
  if (!ids.length) return [];
  const out: VideoDTO[] = [];
  // The API accepts at most 50 ids per call.
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const { data } = await kget<{ items: YtVideoItem[] }>("videos", {
      part: "snippet,contentDetails,statistics",
      id: chunk.join(","),
      maxResults: "50",
    });
    for (const v of data?.items ?? []) out.push(mapVideo(v));
  }
  return out;
}

export async function videoById(id: string): Promise<VideoDTO | null> {
  const [v] = await videosByIds([id]);
  return v ?? null;
}

export async function channelsByIds(ids: string[]): Promise<ChannelDTO[]> {
  if (!ids.length) return [];
  const { data } = await kget<{ items: YtChannel[] }>("channels", {
    part: "snippet,statistics,brandingSettings",
    id: ids.slice(0, 50).join(","),
  });
  return (data?.items ?? []).map(mapChannel);
}

export async function channelById(id: string): Promise<ChannelDTO | null> {
  const [c] = await channelsByIds([id]);
  return c ?? null;
}

/** Resolve a @handle or custom name to a real channel. */
export async function channelByHandle(handle: string): Promise<ChannelDTO | null> {
  const clean = handle.replace(/^@/, "");
  const { data } = await kget<{ items: { snippet: { channelId: string } }[] }>("search", {
    part: "snippet",
    q: clean,
    type: "channel",
    maxResults: "1",
  });
  const id = data?.items?.[0]?.snippet?.channelId;
  return id ? channelById(id) : null;
}

export async function playlistsByIds(ids: string[]): Promise<PlaylistDTO[]> {
  if (!ids.length) return [];
  const { data } = await kget<{ items: YtPlaylistItem[] }>("playlists", {
    part: "snippet,contentDetails",
    id: ids.slice(0, 50).join(","),
  });
  return (data?.items ?? []).map(mapPlaylist);
}

/** A channel's uploads (real, newest first, paged). */
export async function channelUploads(
  channelId: string,
  pageToken?: string,
  maxResults = 24,
): Promise<Result<Paged<VideoDTO>>> {
  // The uploads playlist is `UU` + channelId without the leading "UC".
  const uploads = channelId.startsWith("UC") ? `UU${channelId.slice(2)}` : channelId;
  const { data, error, status } = await kget<{ items: (YtVideoItem & { snippet: { resourceId?: { videoId?: string } } })[]; nextPageToken?: string; pageInfo?: { totalResults?: number } }>(
    "playlistItems",
    { part: "snippet,contentDetails", playlistId: uploads, maxResults: String(maxResults), pageToken },
  );
  if (!data) return { ok: false, status, error: error ?? "uploads failed" };
  const ids = data.items
    .map((i) => (i.contentDetails as { videoId?: string } | undefined)?.videoId ?? i.snippet?.resourceId?.videoId)
    .filter((v): v is string => !!v);
  const details = await videosByIds(ids);
  const byId = new Map(details.map((v) => [v.videoId, v]));
  return {
    ok: true,
    data: {
      items: ids.map((id) => byId.get(id)).filter((v): v is VideoDTO => !!v),
      nextPageToken: data.nextPageToken ?? null,
      totalResults: data.pageInfo?.totalResults ?? null,
    },
  };
}

/** Items of any playlist (personal or public), newest first as YouTube returns. */
export async function playlistItems(
  playlistId: string,
  pageToken?: string,
  maxResults = 50,
): Promise<Result<Paged<VideoDTO>>> {
  const { data, error, status } = await kget<{
    items: { contentDetails?: { videoId?: string }; snippet: { resourceId?: { videoId?: string } } }[];
    nextPageToken?: string;
    pageInfo?: { totalResults?: number };
  }>("playlistItems", { part: "snippet,contentDetails", playlistId, maxResults: String(maxResults), pageToken });
  if (!data) return { ok: false, status, error: error ?? "playlist failed" };
  const ids = data.items.map((i) => i.contentDetails?.videoId ?? i.snippet?.resourceId?.videoId).filter((v): v is string => !!v);
  const details = await videosByIds(ids);
  const byId = new Map(details.map((v) => [v.videoId, v]));
  return {
    ok: true,
    data: {
      items: ids.map((id) => byId.get(id)).filter((v): v is VideoDTO => !!v),
      nextPageToken: data.nextPageToken ?? null,
      totalResults: data.pageInfo?.totalResults ?? null,
    },
  };
}

/** Most-popular videos for a region — honest "trending", no scraping. */
export async function trending(regionCode = "EG", maxResults = 24): Promise<VideoDTO[]> {
  const { data } = await kget<{ items: YtVideoItem[] }>("videos", {
    part: "snippet,contentDetails,statistics",
    chart: "mostPopular",
    regionCode,
    maxResults: String(Math.min(50, maxResults)),
  });
  return (data?.items ?? []).map(mapVideo);
}

/** Real comment threads for a video (public, needs the key only). */
export async function comments(
  videoId: string,
  pageToken?: string,
  maxResults = 20,
  order: "relevance" | "time" = "relevance",
): Promise<Result<Paged<CommentDTO>>> {
  const { data, error, status } = await kget<{
    items: {
      id: string;
      snippet: {
        topLevelComment: {
          id: string;
          snippet: {
            authorDisplayName: string;
            authorProfileImageUrl?: string;
            authorChannelId?: { value?: string };
            textDisplay: string;
            likeCount?: number;
            publishedAt?: string;
          };
        };
        totalReplyCount?: number;
      };
    }[];
    nextPageToken?: string;
    pageInfo?: { totalResults?: number };
  }>("commentThreads", {
    part: "snippet",
    videoId,
    maxResults: String(maxResults),
    pageToken,
    order,
    textFormat: "plainText",
  });
  if (!data) {
    return { ok: false, status, error: status === 403 ? "Comments are disabled for this video." : (error ?? "comments failed") };
  }
  return {
    ok: true,
    data: {
      items: data.items.map((t) => {
        const c = t.snippet.topLevelComment.snippet;
        return {
          id: t.snippet.topLevelComment.id,
          author: c.authorDisplayName,
          authorAvatar: c.authorProfileImageUrl ?? null,
          authorChannelId: c.authorChannelId?.value ?? null,
          text: c.textDisplay,
          likeCount: c.likeCount ?? 0,
          replyCount: t.snippet.totalReplyCount ?? 0,
          publishedAt: c.publishedAt ?? null,
          isReply: false,
        };
      }),
      nextPageToken: data.nextPageToken ?? null,
      totalResults: data.pageInfo?.totalResults ?? null,
    },
  };
}

/* ------------------------ private (user OAuth token) --------------------- */

type WriteResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string; status: number };

export async function subscribe(token: string, channelId: string): Promise<WriteResult> {
  const r = await ytFetch<{ id: string }>("subscriptions", { part: "snippet" }, token, {
    method: "POST",
    body: { snippet: { resourceId: { kind: "youtube#channel", channelId } } },
  });
  return r.data ? { ok: true, data: r.data } : { ok: false, error: r.error ?? "subscribe failed", status: r.status };
}

export async function unsubscribe(token: string, subscriptionId: string): Promise<WriteResult> {
  const r = await ytFetch<unknown>("subscriptions", { id: subscriptionId }, token, { method: "DELETE" });
  return r.error ? { ok: false, error: r.error, status: r.status } : { ok: true, data: null };
}

/** Find the subscription id for a channel (needed to unsubscribe). */
export async function subscriptionFor(token: string, channelId: string): Promise<string | null> {
  const r = await ytFetch<{ items: { id: string }[] }>("subscriptions", { part: "id", mine: "true", forChannelId: channelId }, token);
  return r.data?.items?.[0]?.id ?? null;
}

export async function rate(token: string, videoId: string, rating: "like" | "dislike" | "none"): Promise<WriteResult> {
  const r = await ytFetch<unknown>("videos/rate", { id: videoId, rating }, token, { method: "POST" });
  return r.error ? { ok: false, error: r.error, status: r.status } : { ok: true, data: null };
}

/** The account's existing rating for a video ("like" | "dislike" | "none"). */
export async function myRating(token: string, videoId: string): Promise<"like" | "dislike" | "none"> {
  const r = await ytFetch<{ items: { id: string }[]; nextPageToken?: string }>(
    "videos",
    { part: "id", myRating: "like", maxResults: "50" },
    token,
  );
  if (r.data?.items?.some((v) => v.id === videoId)) return "like";
  const d = await ytFetch<{ items: { id: string }[] }>("videos", { part: "id", myRating: "dislike", maxResults: "50" }, token);
  return d.data?.items?.some((v) => v.id === videoId) ? "dislike" : "none";
}

/** Append a video to one of the user's own playlists. */
export async function addToPlaylist(token: string, playlistId: string, videoId: string): Promise<WriteResult> {
  const r = await ytFetch<{ id: string }>("playlistItems", { part: "snippet" }, token, {
    method: "POST",
    body: { snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } },
  });
  return r.data ? { ok: true, data: r.data } : { ok: false, error: r.error ?? "failed", status: r.status };
}

export async function removeFromPlaylist(token: string, itemId: string): Promise<WriteResult> {
  const r = await ytFetch<unknown>("playlistItems", { id: itemId }, token, { method: "DELETE" });
  return r.error ? { ok: false, error: r.error, status: r.status } : { ok: true, data: null };
}

/** Post a top-level comment as the signed-in user. */
export async function postComment(token: string, videoId: string, text: string): Promise<WriteResult<CommentDTO>> {
  const r = await ytFetch<{
    id: string;
    snippet: {
      authorDisplayName: string;
      authorProfileImageUrl?: string;
      authorChannelId?: { value?: string };
      textDisplay: string;
      likeCount?: number;
      publishedAt?: string;
    };
  }>("commentThreads", { part: "snippet" }, token, {
    method: "POST",
    body: { snippet: { videoId, topLevelComment: { snippet: { textOriginal: text } } } },
  });
  if (!r.data) return { ok: false, error: r.error ?? "comment failed", status: r.status };
  const c = r.data.snippet;
  return {
    ok: true,
    data: {
      id: r.data.id,
      author: c.authorDisplayName,
      authorAvatar: c.authorProfileImageUrl ?? null,
      authorChannelId: c.authorChannelId?.value ?? null,
      text: c.textDisplay,
      likeCount: c.likeCount ?? 0,
      replyCount: 0,
      publishedAt: c.publishedAt ?? null,
      isReply: false,
    },
  };
}

/** The signed-in account's own channel (also gives us its channelId). */
export async function myChannel(token: string): Promise<ChannelDTO | null> {
  const r = await ytFetch<{ items: YtChannel[] }>("channels", { part: "snippet,statistics,brandingSettings", mine: "true" }, token);
  const ch = r.data?.items?.[0];
  return ch ? mapChannel(ch) : null;
}

export async function mySubscriptions(token: string, pageToken?: string, maxResults = 50): Promise<{
  items: { subscriptionId: string; channelId: string; title: string; avatar: string | null; description: string | null }[];
  nextPageToken: string | null;
}> {
  const r = await ytFetch<{
    items: {
      id: string;
      snippet: { title: string; description?: string; resourceId: { channelId: string }; thumbnails?: Record<string, { url: string }> };
    }[];
    nextPageToken?: string;
  }>("subscriptions", { part: "snippet", mine: "true", maxResults: String(maxResults), pageToken: pageToken ?? "" }, token);
  return {
    items: (r.data?.items ?? []).map((s) => ({
      subscriptionId: s.id,
      channelId: s.snippet.resourceId.channelId,
      title: s.snippet.title,
      avatar: bestThumb(s.snippet.thumbnails),
      description: s.snippet.description ?? null,
    })),
    nextPageToken: r.data?.nextPageToken ?? null,
  };
}

export async function myPlaylists(token: string, pageToken?: string, maxResults = 25): Promise<{
  items: PlaylistDTO[];
  nextPageToken: string | null;
}> {
  const r = await ytFetch<{ items: YtPlaylistItem[]; nextPageToken?: string }>(
    "playlists",
    { part: "snippet,contentDetails", mine: "true", maxResults: String(maxResults), pageToken: pageToken ?? "" },
    token,
  );
  return { items: (r.data?.items ?? []).map(mapPlaylist), nextPageToken: r.data?.nextPageToken ?? null };
}

/**
 * Resumable upload of a video the user owns.
 * Data API v3 only supports the resumable protocol; we open the session and then
 * PUT the bytes. `size` must be known up front.
 */
export async function startUpload(
  token: string,
  meta: { title: string; description?: string; tags?: string[]; privacyStatus: "public" | "unlisted" | "private"; categoryId?: string; madeForKids?: boolean },
): Promise<{ ok: true; uploadUrl: string } | { ok: false; error: string; status: number }> {
  try {
    const res = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": "video/*",
        },
        body: JSON.stringify({
          snippet: { title: meta.title, description: meta.description ?? "", tags: meta.tags ?? [], categoryId: meta.categoryId ?? "10" },
          status: { privacyStatus: meta.privacyStatus, selfDeclaredMadeForKids: meta.madeForKids ?? false },
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}` };
    }
    const uploadUrl = res.headers.get("location");
    return uploadUrl ? { ok: true, uploadUrl } : { ok: false, status: 0, error: "No upload URL returned" };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : "upload failed" };
  }
}

/** Upload session status for a resumable session (bytes already received). */
export async function uploadStatus(token: string, uploadUrl: string, totalBytes: number): Promise<{ received: number; done: boolean; videoId?: string } | null> {
  try {
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Range": `bytes */${totalBytes}`, "Content-Length": "0" },
    });
    if (res.status === 308) {
      const range = res.headers.get("range");
      return { received: range ? Number(range.split("-")[1] ?? 0) + 1 : 0, done: false };
    }
    if (res.ok) {
      const json = (await res.json()) as { id?: string };
      return { received: totalBytes, done: true, videoId: json.id };
    }
    return null;
  } catch {
    return null;
  }
}
