"use client";

// ============================================================================
//  /watch — official YouTube playback (IFrame Player API) + real interactions
//  ---------------------------------------------------------------------------
//  Policy, enforced by the UI itself:
//    • the video plays inside the official YouTube player, visible on screen;
//    • there is no audio-only mode, no download and no background playback;
//    • like / subscribe / comment / playlist use the official Data API with the
//      signed-in user's own account (server-side token, never in the browser).
//  Everything on this page is a real API call — nothing is decorative.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  ListPlus,
  Share2,
  ExternalLink,
  Loader2,
  Play,
  ListVideo,
  Info,
  Lock,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { formatCount, formatTime } from "@/lib/utils";
import { getEngine } from "@/lib/audio/engine";

interface VideoMeta {
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

interface Comment {
  id: string;
  author: string;
  authorAvatar: string | null;
  authorChannelId: string | null;
  text: string;
  likeCount: number;
  replyCount: number;
  publishedAt: string | null;
}

interface Subscription {
  channelId: string;
  title: string;
  avatar: string | null;
}

interface Playlist {
  id: string;
  title: string;
  count: number;
}

type Rating = "like" | "dislike" | "none";

export default function WatchPage() {
  return (
    <div className="p-4 md:p-6">
      <WatchInner />
    </div>
  );
}

function WatchInner() {
  const t = useT();
  const params = useSearchParams();
  const videoId = params.get("v") ?? "";
  const apiBase = process.env.NEXT_PUBLIC_API_BASE || "";

  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [rating, setRating] = useState<Rating>("none");
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentPage, setCommentPage] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");

  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  const playerBox = useRef<HTMLDivElement>(null);

  /* ------------------------------ metadata ------------------------------ */
  useEffect(() => {
    if (!videoId) return;
    const ctrl = new AbortController();
    setMeta(null);
    setMetaError(null);
    fetch(`${apiBase}/api/yt/video?id=${encodeURIComponent(videoId)}`, { signal: ctrl.signal })
      .then(async (r) => (await r.json()) as { ok: boolean; video?: VideoMeta; error?: string })
      .then((body) => {
        if (body.ok && body.video) setMeta(body.video);
        else setMetaError(body.error ?? "Video unavailable");
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setMetaError(e.message);
      });
    return () => ctrl.abort();
  }, [videoId, apiBase]);

  /* --------------------------- connection state -------------------------- */
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`${apiBase}/api/yt/me`, { signal: ctrl.signal })
      .then(async (r) => (await r.json()) as { connected?: boolean })
      .then((b) => setConnected(!!b.connected))
      .catch(() => setConnected(false));
    return () => ctrl.abort();
  }, [apiBase]);

  /* ------------------------------ comments ------------------------------ */
  const loadComments = useCallback(
    async (page?: string) => {
      if (!videoId) return;
      setCommentError(null);
      const res = await fetch(
        `${apiBase}/api/yt/comments?video=${encodeURIComponent(videoId)}&max=20${page ? `&page=${encodeURIComponent(page)}` : ""}`,
      ).catch(() => null);
      if (!res) {
        setCommentError("Network error");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: { items: Comment[]; nextPageToken: string | null };
        error?: string;
      };
      if (!body.ok || !body.data) {
        setCommentError(body.error ?? "Comments unavailable");
        return;
      }
      setComments((prev) => (page ? [...prev, ...body.data!.items] : body.data!.items));
      setCommentPage(body.data.nextPageToken);
    },
    [videoId, apiBase],
  );

  useEffect(() => {
    setComments([]);
    setCommentPage(null);
    void loadComments();
  }, [loadComments]);

  /* ------------------- signed-in state: rating, sub, lists --------------- */
  useEffect(() => {
    if (!connected || !videoId || !meta) return;
    void (async () => {
      const [ratingRes, subRes, listRes] = await Promise.all([
        fetch(`${apiBase}/api/yt/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "rating", videoId }),
        }).then((r) => r.json().catch(() => ({}))),
        fetch(`${apiBase}/api/yt/subscriptions?forChannel=${encodeURIComponent(meta.channelId)}`).then((r) => r.json().catch(() => ({}))),
        fetch(`${apiBase}/api/yt/playlists`).then((r) => r.json().catch(() => ({}))),
      ]);
      setRating((ratingRes as { rating?: Rating }).rating ?? "none");
      setSubscribed(!!(subRes as { subscribed?: boolean }).subscribed);
      const items = (listRes as { items?: Playlist[] }).items;
      if (Array.isArray(items)) setPlaylists(items);
    })();
  }, [connected, videoId, meta, apiBase]);

  /* ------------------------- official embed (policy) -------------------- */
  useEffect(() => {
    if (!videoId) return;
    // Route playback through the single engine so the global player bar follows
    // along (and so the IFrame bridge is the only YouTube player in the page).
    const engine = getEngine();
    engine.load(
      {
        id: -1,
        title: meta?.title ?? "",
        artistName: meta?.channel ?? "",
        albumTitle: null,
        coverUrl: meta?.thumb ?? null,
        durationSec: meta?.durationSec ?? 0,
        source: "youtube",
        sourceId: videoId,
        codec: "iframe",
        streamUrl: "",
      } as never,
      { autoplay: false },
    );
    return () => {
      /* the engine keeps ownership of the player across navigation */
    };
  }, [videoId, meta?.title, meta?.channel, meta?.thumb, meta?.durationSec]);

  /* ------------------------------ actions ------------------------------- */
  const act = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    try {
      const res = await fetch(`${apiBase}/api/yt/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? `HTTP ${res.status}`);
        return false;
      }
      return true;
    } catch (err) {
      toast.error((err as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const toggleRating = async (next: "like" | "dislike") => {
    if (!connected) return needConnection();
    const value: Rating = rating === next ? "none" : next;
    if (await act({ action: "rate", videoId, rating: value }, "rate")) {
      setRating(value);
      if (meta) {
        setMeta({
          ...meta,
          likes:
            meta.likes === null
              ? null
              : Math.max(0, meta.likes + (value === "like" ? 1 : 0) - (rating === "like" ? 1 : 0)),
        });
      }
      toast.success(value === "none" ? t("ratingCleared") : value === "like" ? t("liked") : t("disliked"));
    }
  };

  const toggleSubscribe = async () => {
    if (!connected || !meta) return needConnection();
    const action = subscribed ? "unsubscribe" : "subscribe";
    if (await act({ action, channelId: meta.channelId }, "sub")) {
      setSubscribed(!subscribed);
      toast.success(subscribed ? t("unsubscribed") : t("subscribed"));
    }
  };

  const needConnection = () => toast.error(t("connectYouTubeFirst"), { description: t("connectYouTubeHint") });

  const submitComment = async () => {
    if (!connected) return needConnection();
    const text = commentText.trim();
    if (!text) return;
    setBusy("comment");
    const res = await fetch(`${apiBase}/api/yt/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "comment", videoId, text }),
    }).catch(() => null);
    setBusy(null);
    const json = (await res?.json().catch(() => ({}))) as { ok?: boolean; data?: Comment; error?: string };
    if (!res || !json.ok || !json.data) {
      toast.error(json?.error ?? "Comment failed");
      return;
    }
    setComments((c) => [json.data as Comment, ...c]);
    setCommentText("");
    toast.success(t("commentPosted"));
  };

  const addToPlaylist = async (playlistId: string) => {
    if (!connected) return needConnection();
    if (await act({ action: "playlist:add", playlistId, videoId }, `pl-${playlistId}`)) {
      toast.success(t("addedToYouTubePlaylist"));
    }
  };

  const share = async () => {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    try {
      if (navigator.share) await navigator.share({ title: meta?.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success(t("copied"));
      }
    } catch {
      /* user cancelled */
    }
  };

  const publishedAt = meta?.publishedAt ?? null;
  const published = publishedAt ? new Date(publishedAt).toLocaleDateString() : null;

  if (!videoId) {
    return (
      <div className="grid place-items-center py-20 text-center">
        <Info className="mb-3 size-8 text-[var(--app-accent)]" />
        <p className="text-lg font-bold">{t("noVideoSelected")}</p>
        <Link href="/search?tab=video" className="mt-3 text-sm font-semibold text-[var(--app-accent)]">
          {t("search")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* ---------------- the official player (never hidden) ---------------- */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black">
        <div ref={playerBox} className="aspect-video w-full" data-dm-yt-container />
        {/* The IFrame bridge injects the official iframe into the engine host;
            this transparent overlay keeps the aspect ratio and shows a poster
            until the player is ready. */}
        {!meta && (
          <div className="absolute inset-0 grid place-items-center">
            <Loader2 className="size-6 animate-spin text-white/60" />
          </div>
        )}
      </div>

      <div className="mt-3 rounded-xl bg-white/[0.04] px-3 py-2 text-[11px] text-[color:var(--app-muted)]">
        <p className="flex items-center gap-1.5">
          <Lock className="size-3" />
          {t("officialPlayerNote")}
        </p>
      </div>

      {/* --------------------------- title + stats --------------------------- */}
      {metaError && (
        <div className="mt-4 rounded-2xl border border-rose/30 bg-rose/10 p-4 text-sm text-rose-200">{metaError}</div>
      )}

      {meta && (
        <div className="mt-4 flex flex-col gap-3">
          <h1 className="text-xl font-black leading-tight md:text-2xl">{meta.title}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--app-muted)]">
            {meta.views !== null && <span>{formatCount(meta.views)} {t("views")}</span>}
            {published && <span>· {published}</span>}
            {meta.live !== "none" && (
              <span className="rounded-full bg-rose/20 px-2 py-0.5 font-bold text-rose-300">
                {meta.live === "live" ? t("liveNow") : t("upcoming")}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/artists/yt:${meta.channelId}`}
              className="flex items-center gap-2 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-bold hover:bg-white/[0.1]"
            >
              <span className="grid size-6 place-items-center rounded-full bg-[var(--app-accent)]/20 text-[10px]">
                {meta.channel.slice(0, 1)}
              </span>
              {meta.channel}
            </Link>

            <button
              onClick={toggleSubscribe}
              disabled={busy === "sub"}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                subscribed
                  ? "bg-white/10 text-white hover:bg-white/15"
                  : "bg-[var(--app-accent)] text-black hover:brightness-110"
              } disabled:opacity-50`}
            >
              {busy === "sub" ? <Loader2 className="size-3.5 animate-spin" /> : subscribed ? t("subscribed") : t("subscribe")}
            </button>

            <div className="flex items-center overflow-hidden rounded-full bg-white/[0.06]">
              <button
                onClick={() => void toggleRating("like")}
                disabled={busy === "rate"}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold hover:bg-white/10 ${rating === "like" ? "text-[var(--app-accent)]" : ""}`}
              >
                <ThumbsUp className="size-4" />
                {meta.likes !== null && formatCount(meta.likes)}
              </button>
              <span className="h-5 w-px bg-white/15" />
              <button
                onClick={() => void toggleRating("dislike")}
                disabled={busy === "rate"}
                className={`px-3 py-1.5 hover:bg-white/10 ${rating === "dislike" ? "text-rose-400" : ""}`}
                aria-label={t("dislike")}
              >
                <ThumbsDown className="size-4" />
              </button>
            </div>

            <a
              href={meta.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-bold hover:bg-white/[0.1]"
            >
              <ExternalLink className="size-4" /> {t("openOnYouTube")}
            </a>
            <button onClick={() => void share()} className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-bold hover:bg-white/[0.1]">
              <Share2 className="size-4" /> {t("share")}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {playlists.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-white/[0.04] p-2">
                <span className="flex items-center gap-1 px-1 text-[11px] font-bold text-[color:var(--app-muted)]">
                  <ListPlus className="size-3.5" /> {t("saveToPlaylist")}
                </span>
                {playlists.slice(0, 6).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => void addToPlaylist(p.id)}
                    disabled={busy === `pl-${p.id}`}
                    className="max-w-[160px] truncate rounded-full bg-white/[0.07] px-2.5 py-1 text-[11px] font-semibold hover:bg-white/[0.12] disabled:opacity-50"
                    title={`${p.title} · ${p.count}`}
                  >
                    {busy === `pl-${p.id}` ? <Loader2 className="size-3 animate-spin" /> : p.title}
                  </button>
                ))}
              </div>
            ) : (
              <button
                onClick={() => (connected ? toast(t("noYouTubePlaylists")) : needConnection())}
                className="flex items-center gap-1.5 rounded-full bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--app-muted)]"
              >
                <ListVideo className="size-3.5" /> {t("saveToPlaylist")}
              </button>
            )}
          </div>

          {meta.description && (
            <details className="rounded-xl bg-white/[0.04] p-3 text-[13px] leading-relaxed">
              <summary className="cursor-pointer text-xs font-bold text-[color:var(--app-muted)]">
                {t("description")}
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-white/80">{meta.description}</p>
            </details>
          )}
        </div>
      )}

      {/* ----------------------------- comments ----------------------------- */}
      <section className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold">
          <MessageSquare className="size-4" /> {t("comments")}
          {meta?.comments !== null && meta?.comments !== undefined && (
            <span className="text-xs font-semibold text-[color:var(--app-muted)]">{formatCount(meta.comments)}</span>
          )}
        </h2>

        <div className="mb-4 flex items-end gap-2">
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onFocus={() => {
              if (!connected) needConnection();
            }}
            rows={2}
            placeholder={connected ? t("writeComment") : t("connectYouTubeFirst")}
            className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm outline-none focus:border-[var(--app-accent)]"
          />
          <button
            onClick={() => void submitComment()}
            disabled={busy === "comment" || !commentText.trim()}
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--app-accent)] text-black disabled:opacity-40"
            aria-label={t("postComment")}
          >
            {busy === "comment" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </div>

        {commentError && <p className="rounded-xl bg-amber/10 p-3 text-xs text-amber">{commentError}</p>}

        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-2.5 rounded-xl bg-white/[0.03] p-3">
              {c.authorAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.authorAvatar} alt="" className="size-8 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-bold">
                  {c.author.slice(0, 1)}
                </span>
              )}
              <div className="min-w-0">
                <p className="text-xs font-bold">
                  {c.authorChannelId ? (
                    <Link href={`/artists/yt:${c.authorChannelId}`} className="hover:underline">
                      {c.author}
                    </Link>
                  ) : (
                    c.author
                  )}
                  <span className="ms-2 font-normal text-[color:var(--app-muted)]">
                    {c.publishedAt ? new Date(c.publishedAt).toLocaleDateString() : ""}
                  </span>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-white/85">{c.text}</p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-[color:var(--app-muted)]">
                  <ThumbsUp className="size-3" /> {formatCount(c.likeCount)}
                  {c.replyCount > 0 && <span className="ms-2">{c.replyCount} {t("replies")}</span>}
                </p>
              </div>
            </li>
          ))}
        </ul>

        {commentPage && (
          <button
            onClick={() => void loadComments(commentPage)}
            className="mx-auto mt-4 block rounded-full bg-white/[0.06] px-4 py-2 text-xs font-bold hover:bg-white/[0.1]"
          >
            {t("loadMore")}
          </button>
        )}
        {!commentError && comments.length === 0 && (
          <p className="py-6 text-center text-xs text-[color:var(--app-muted)]">{t("noComments")}</p>
        )}
      </section>

      <p className="mt-8 text-center font-mono text-[10px] text-[color:var(--app-muted)]">
        Data API v3 · {videoId} · {formatTime(meta?.durationSec ?? 0)}
      </p>
      <p className="sr-only">
        <Play className="size-1" />
      </p>
    </div>
  );
}
