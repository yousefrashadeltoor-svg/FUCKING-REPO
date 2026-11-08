"use client";

// ============================================================================
//  Official YouTube channel page — every number comes from Data API v3.
//  Subscribing is a real write to the signed-in user's own Google account.
// ============================================================================
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Bell, BellOff, ExternalLink, Loader2, Play, Users, Eye, Film } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { formatCount, formatTime } from "@/lib/utils";

interface Channel {
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

interface Video {
  videoId: string;
  title: string;
  channel: string;
  thumb: string | null;
  durationSec: number;
  views: number | null;
  publishedAt: string | null;
  live: "none" | "live" | "upcoming";
}

const apiBase = process.env.NEXT_PUBLIC_API_BASE || "";

export function YouTubeChannelProfile({ channelId }: { channelId: string }) {
  const t = useT();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (page?: string) => {
      if (!page) setLoading(true);
      const res = await fetch(
        `${apiBase}/api/yt/channel?id=${encodeURIComponent(channelId)}&max=24${page ? `&page=${encodeURIComponent(page)}` : ""}`,
      ).catch(() => null);
      setLoading(false);
      if (!res) {
        setError("Network error");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        channel?: Channel;
        uploads?: { items: Video[]; nextPageToken: string | null };
        uploadsError?: string | null;
        error?: string;
      };
      if (!body.ok || !body.channel) {
        setError(body.error ?? "Channel unavailable");
        return;
      }
      setChannel(body.channel);
      setVideos((prev) => (page ? [...prev, ...(body.uploads?.items ?? [])] : (body.uploads?.items ?? [])));
      setNextPage(body.uploads?.nextPageToken ?? null);
      if (body.uploadsError) setError(body.uploadsError);
    },
    [channelId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      const me = await fetch(`${apiBase}/api/yt/me`).then((r) => r.json().catch(() => ({})));
      const isConnected = !!(me as { connected?: boolean }).connected;
      setConnected(isConnected);
      if (!isConnected) return;
      const sub = await fetch(`${apiBase}/api/yt/subscriptions?forChannel=${encodeURIComponent(channelId)}`)
        .then((r) => r.json().catch(() => ({})));
      setSubscribed(!!(sub as { subscribed?: boolean }).subscribed);
    })();
  }, [channelId]);

  const toggleSubscribe = async () => {
    if (!connected) {
      toast.error(t("connectYouTubeFirst"), { description: t("connectYouTubeHint") });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/yt/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: subscribed ? "unsubscribe" : "subscribe", channelId }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? t("subscribeFailed"));
        return;
      }
      setSubscribed(!subscribed);
      toast.success(subscribed ? t("unsubscribed") : t("subscribed"));
      // Subscriber counts are refreshed by YouTube on its own schedule — we do
      // not invent a +1 locally.
    } finally {
      setBusy(false);
    }
  };

  if (loading && !channel) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-6 animate-spin text-[color:var(--app-muted)]" />
      </div>
    );
  }

  if (error && !channel) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-rose/30 bg-rose/10 p-4 text-sm text-rose-200">{error}</div>
      </div>
    );
  }

  if (!channel) return null;

  return (
    <div>
      {/* banner */}
      <div className="relative h-32 overflow-hidden md:h-44">
        {channel.banner ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={channel.banner} alt="" className="size-full object-cover" />
        ) : (
          <div className="size-full bg-gradient-to-br from-[var(--app-accent)]/25 via-white/5 to-transparent" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
      </div>

      <div className="px-4 pb-10 md:px-6">
        <div className="-mt-12 flex flex-col gap-4 md:flex-row md:items-end">
          {channel.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={channel.avatar} alt={channel.title} className="size-24 rounded-full border-4 border-[var(--app-bg)] object-cover md:size-32" />
          ) : (
            <div className="grid size-24 place-items-center rounded-full border-4 border-[var(--app-bg)] bg-white/10 text-3xl font-black md:size-32">
              {channel.title.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight md:text-3xl">
              <span className="truncate">{channel.title}</span>
              <BadgeCheck className="size-5 shrink-0 text-sky-400" />
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-[color:var(--app-muted)]">
              {channel.handle && <span>{channel.handle}</span>}
              <span className="flex items-center gap-1">
                <Users className="size-3.5" />
                {channel.subscribers === null ? t("hidden") : `${formatCount(channel.subscribers)} ${t("subscribers")}`}
              </span>
              {channel.views !== null && (
                <span className="flex items-center gap-1">
                  <Eye className="size-3.5" /> {formatCount(channel.views)} {t("views")}
                </span>
              )}
              {channel.videoCount !== null && (
                <span className="flex items-center gap-1">
                  <Film className="size-3.5" /> {formatCount(channel.videoCount)} {t("video")}
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void toggleSubscribe()}
              disabled={busy}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
                subscribed ? "bg-white/10 text-white hover:bg-white/15" : "bg-[var(--app-accent)] text-black hover:brightness-110"
              }`}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : subscribed ? <BellOff className="size-4" /> : <Bell className="size-4" />}
              {subscribed ? t("subscribed") : t("subscribe")}
            </button>
            <a
              href={channel.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-2 text-xs font-bold hover:bg-white/[0.1]"
            >
              <ExternalLink className="size-4" /> {t("openOnYouTube")}
            </a>
          </div>
        </div>

        {channel.description && (
          <p className="mt-4 max-w-3xl whitespace-pre-wrap text-[13px] leading-relaxed text-white/75 line-clamp-4">
            {channel.description}
          </p>
        )}

        {error && <p className="mt-4 rounded-xl bg-amber/10 p-3 text-xs text-amber">{error}</p>}

        <h2 className="mb-3 mt-7 text-lg font-extrabold">{t("video")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {videos.map((v) => (
            <Link key={v.videoId} href={`/watch?v=${v.videoId}`} className="group">
              <div className="relative overflow-hidden rounded-xl bg-white/[0.04]">
                {v.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.thumb} alt={v.title} className="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                ) : (
                  <div className="aspect-video w-full bg-white/10" />
                )}
                <span className="absolute bottom-1.5 end-1.5 rounded bg-black/85 px-1 py-0.5 text-[10px] font-bold text-white">
                  {v.live === "live" ? t("liveNow") : v.live === "upcoming" ? t("upcoming") : formatTime(v.durationSec)}
                </span>
                <span className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                  <Play className="size-8 fill-white text-white" />
                </span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-[13px] font-bold leading-snug">{v.title}</p>
              <p className="mt-0.5 text-[11px] text-[color:var(--app-muted)]">
                {v.views !== null && `${formatCount(v.views)} ${t("views")} · `}
                {v.publishedAt ? new Date(v.publishedAt).toLocaleDateString() : ""}
              </p>
            </Link>
          ))}
        </div>

        {nextPage && (
          <button
            onClick={() => void load(nextPage)}
            className="mx-auto mt-5 block rounded-full bg-white/[0.06] px-4 py-2 text-xs font-bold hover:bg-white/[0.1]"
          >
            {t("loadMore")}
          </button>
        )}
      </div>
    </div>
  );
}
