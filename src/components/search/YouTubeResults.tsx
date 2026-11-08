"use client";

// ============================================================================
//  Real YouTube search results — Data API v3, official filters and paging.
//  Each result opens /watch (the official IFrame player); nothing is extracted
//  or proxied here.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Filter, Loader2, Play, SlidersHorizontal, Video, Users, ListVideo, ExternalLink } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatCount, formatTime } from "@/lib/utils";

interface Video {
  videoId: string;
  title: string;
  channelId: string;
  channel: string;
  thumb: string | null;
  durationSec: number;
  views: number | null;
  publishedAt: string | null;
  live: "none" | "live" | "upcoming";
}
interface Channel {
  id: string;
  title: string;
  handle: string | null;
  avatar: string | null;
  subscribers: number | null;
  videoCount: number | null;
  description: string | null;
}
interface Playlist {
  id: string;
  title: string;
  channel: string | null;
  count: number;
  thumb: string | null;
}

type Kind = "video" | "channel" | "playlist";

const apiBase = process.env.NEXT_PUBLIC_API_BASE || "";

export function YouTubeResults({ query }: { query: string }) {
  const t = useT();
  const [kind, setKind] = useState<Kind>("video");
  const [order, setOrder] = useState<"relevance" | "date" | "viewCount" | "rating">("relevance");
  const [duration, setDuration] = useState<"any" | "short" | "medium" | "long">("any");
  const [hd, setHd] = useState(false);
  const [licensed, setLicensed] = useState(false);
  const [captions, setCaptions] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [items, setItems] = useState<(Video | Channel | Playlist)[]>([]);
  const [page, setPage] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);

  const reqId = useRef(0);

  const run = useCallback(
    async (pageToken?: string) => {
      const q = query.trim();
      if (!q) return;
      const my = ++reqId.current;
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ q, type: kind, order, max: "20" });
      if (kind === "video") {
        params.set("duration", duration);
        if (hd) params.set("hd", "1");
        if (licensed) params.set("licensed", "1");
        if (captions) params.set("captions", "1");
      }
      if (pageToken) params.set("page", pageToken);

      const res = await fetch(`${apiBase}/api/yt/search?${params.toString()}`).catch(() => null);
      if (my !== reqId.current) return; // a newer query won
      setLoading(false);
      if (!res) {
        setError("Network error");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        configured?: boolean;
        data?: { items: (Video | Channel | Playlist)[]; nextPageToken: string | null; totalResults: number | null };
        error?: string;
      };
      if (body.configured === false) {
        setConfigured(false);
        return;
      }
      if (!body.ok || !body.data) {
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setItems((prev) => (pageToken ? [...prev, ...body.data!.items] : body.data!.items));
      setPage(body.data.nextPageToken);
      setTotal(body.data.totalResults);
    },
    [query, kind, order, duration, hd, licensed, captions],
  );

  useEffect(() => {
    setItems([]);
    setPage(null);
    setTotal(null);
    void run();
  }, [run]);

  if (!configured) {
    return (
      <div className="rounded-2xl border border-amber/30 bg-amber/10 p-4 text-[13px] text-amber">
        <p className="font-bold">{t("ytNotConfigured")}</p>
        <p className="mt-1 text-[11px] opacity-80">
          Set <code className="font-mono">YOUTUBE_API_KEY</code> (and the OAuth client for account actions) to enable real YouTube search.
        </p>
      </div>
    );
  }

  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
      active
        ? "border-[var(--app-accent)] bg-[var(--app-accent)]/15 text-[var(--app-accent)]"
        : "border-white/10 text-[color:var(--app-muted)] hover:bg-white/[0.06]"
    }`;

  return (
    <div>
      {/* kinds + filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-full bg-white/[0.05] p-0.5">
          {(
            [
              ["video", Video, t("video")],
              ["channel", Users, t("channels")],
              ["playlist", ListVideo, t("playlists")],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              onClick={() => setKind(id)}
              className={`flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                kind === id ? "bg-[var(--app-accent)] text-black" : "text-[color:var(--app-muted)] hover:text-white"
              }`}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>

        <select
          value={order}
          onChange={(e) => setOrder(e.target.value as typeof order)}
          className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold outline-none"
        >
          <option value="relevance">{t("sortRelevance")}</option>
          <option value="date">{t("sortDate")}</option>
          <option value="viewCount">{t("sortViews")}</option>
          <option value="rating">{t("sortRating")}</option>
        </select>

        {kind === "video" && (
          <button onClick={() => setShowFilters((v) => !v)} className={chip(showFilters || duration !== "any" || hd || licensed || captions)}>
            <span className="flex items-center gap-1">
              <SlidersHorizontal className="size-3" /> {t("filters")}
            </span>
          </button>
        )}

        {total !== null && (
          <span className="ms-auto text-[11px] text-[color:var(--app-muted)]">
            {formatCount(total)} {t("results")}
          </span>
        )}
      </div>

      {kind === "video" && showFilters && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-white/[0.04] p-2.5">
          <Filter className="size-3.5 text-[color:var(--app-muted)]" />
          {(
            [
              ["any", t("anyDuration")],
              ["short", t("durShort")],
              ["medium", t("durMedium")],
              ["long", t("durLong")],
            ] as const
          ).map(([id, label]) => (
            <button key={id} onClick={() => setDuration(id)} className={chip(duration === id)}>
              {label}
            </button>
          ))}
          <button onClick={() => setHd((v) => !v)} className={chip(hd)}>
            {t("hdOnly")}
          </button>
          <button onClick={() => setLicensed((v) => !v)} className={chip(licensed)}>
            {t("licensedOnly")}
          </button>
          <button onClick={() => setCaptions((v) => !v)} className={chip(captions)}>
            {t("withCaptions")}
          </button>
        </div>
      )}

      {error && <div className="mb-3 rounded-xl border border-rose/30 bg-rose/10 p-3 text-xs text-rose-200">{error}</div>}

      {loading && items.length === 0 && (
        <div className="grid place-items-center py-14">
          <Loader2 className="size-5 animate-spin text-[color:var(--app-muted)]" />
        </div>
      )}

      {!loading && items.length === 0 && !error && (
        <p className="py-10 text-center text-sm text-[color:var(--app-muted)]">
          {t("noResults")} “{query}”.
        </p>
      )}

      {/* videos */}
      {kind === "video" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(items as Video[]).map((v) => (
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
              <p className="mt-0.5 truncate text-[11px] text-[color:var(--app-muted)]">
                {v.channel}
                {v.views !== null && ` · ${formatCount(v.views)} ${t("views")}`}
              </p>
            </Link>
          ))}
        </div>
      )}

      {/* channels */}
      {kind === "channel" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(items as Channel[]).map((c) => (
            <Link
              key={c.id}
              href={`/artists/yt:${c.id}`}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.06]"
            >
              {c.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.avatar} alt={c.title} className="size-14 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="grid size-14 shrink-0 place-items-center rounded-full bg-white/10 text-lg font-black">
                  {c.title.slice(0, 1)}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{c.title}</p>
                <p className="text-[11px] text-[color:var(--app-muted)]">
                  {c.handle ?? ""}
                  {c.subscribers !== null && ` · ${formatCount(c.subscribers)} ${t("subscribers")}`}
                  {c.videoCount !== null && ` · ${formatCount(c.videoCount)} ${t("video")}`}
                </p>
                {c.description && <p className="mt-0.5 line-clamp-2 text-[11px] text-white/60">{c.description}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* playlists */}
      {kind === "playlist" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(items as Playlist[]).map((p) => (
            <a
              key={p.id}
              href={`https://www.youtube.com/playlist?list=${p.id}`}
              target="_blank"
              rel="noreferrer"
              className="group"
            >
              <div className="relative overflow-hidden rounded-xl bg-white/[0.04]">
                {p.thumb && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.thumb} alt={p.title} className="aspect-video w-full object-cover" />
                )}
                <span className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                  <ExternalLink className="size-6 text-white" />
                </span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-[13px] font-bold leading-snug">{p.title}</p>
              <p className="text-[11px] text-[color:var(--app-muted)]">
                {p.channel ?? ""} · {p.count} {t("tracks")}
              </p>
            </a>
          ))}
        </div>
      )}

      {page && (
        <button
          onClick={() => void run(page)}
          disabled={loading}
          className="mx-auto mt-5 flex items-center gap-2 rounded-full bg-white/[0.06] px-4 py-2 text-xs font-bold hover:bg-white/[0.1] disabled:opacity-50"
        >
          {loading && <Loader2 className="size-3.5 animate-spin" />} {t("loadMore")}
        </button>
      )}
    </div>
  );
}
