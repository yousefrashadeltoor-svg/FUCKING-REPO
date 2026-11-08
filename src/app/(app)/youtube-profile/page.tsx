"use client";

// ============================================================================
//  «ملفي الشخصي على YouTube» — the user's REAL YouTube Music account.
//  Official Google OAuth (server-side token exchange, httpOnly cookie) + the
//  YouTube Data API. If credentials are missing the page says so; it never
//  shows invented data or a fake login button that does nothing.
// ============================================================================
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  BadgeCheck,
  Bell,
  ExternalLink,
  History,
  Loader2,
  LogOut,
  Music2,
  Play,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatCount } from "@/lib/utils";
import { toast } from "sonner";

interface VideoDto {
  videoId: string;
  title: string;
  channel: string;
  publishedAt: string | null;
  thumb: string | null;
  durationSec: number;
  views: number | null;
  url: string;
}

interface MePayload {
  connected: boolean;
  configured: boolean;
  reason?: string;
  channel?: {
    id: string;
    title: string;
    handle: string | null;
    description: string | null;
    country: string | null;
    publishedAt: string | null;
    avatar: string | null;
    banner: string | null;
    subscribers: number | null;
    views: number;
    videos: number;
  };
  subscriptions?: { channelId: string; title: string; avatar: string | null; url: string }[];
  playlists?: { id: string; title: string; count: number; thumb: string | null; url: string }[];
  feed?: VideoDto[];
  liked?: VideoDto[];
  subscriptionsNextPage?: string | null;
  scopes?: string;
  manageUrl?: string;
  errors?: string[];
}

function Shell({ children }: { children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="p-4 md:p-6">
      <div className="mb-6">
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] text-red-400">
          <UserCheck className="size-3.5" /> YouTube Music
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">{t("ytProfile")}</h1>
        <p className="mt-1.5 text-[13px] text-[color:var(--app-muted)]">{t("ytProfileSub")}</p>
      </div>
      {children}
    </div>
  );
}

export default function YoutubeProfilePage() {
  return (
    // useSearchParams must sit inside a Suspense boundary or the build bails out.
    <Suspense fallback={<div className="grid place-items-center py-24"><Loader2 className="size-6 animate-spin" /></div>}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const t = useT();
  const params = useSearchParams();
  const status = params.get("status");
  const [data, setData] = useState<MePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/youtube/me", { cache: "no-store" });
      setData((await res.json()) as MePayload);
    } catch {
      setData({ connected: false, configured: true, reason: "network" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (status === "connected") toast.success(t("ytConnected"));
    if (status === "denied") toast.error("Google: access not granted");
    if (status === "failed" || status === "invalid-state") toast.error("Google sign-in failed");
    if (status === "not-configured") toast.error(t("ytNotConfigured"));
    if (status === "no-token-key") toast.error(t("tokenKeyMissing"));
    if (status === "storage-failed") toast.error(t("ytStorageFailed"));
    if (status === "no-session") toast.error(t("ytSessionFailed"));
  }, [status, t]);

  const disconnect = async () => {
    setBusy(true);
    try {
      await fetch("/api/youtube/disconnect", { method: "POST" });
      toast.success(t("ytDisconnect"));
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Shell>
        <div className="grid place-items-center py-24 text-[color:var(--app-muted)]">
          <Loader2 className="size-6 animate-spin" />
        </div>
      </Shell>
    );
  }

  /* ---------------------------- not configured ---------------------------- */
  if (data && !data.configured) {
    return (
      <Shell>
        <Notice
          tone="warn"
          icon={<AlertCircle className="size-5" />}
          title={t("ytNotConfigured")}
          body={
            <>
              <p className="mb-2">
                This deployment has no Google credentials, so a real sign-in is impossible — and we never fake one.
              </p>
              <p className="mb-2 font-semibold">Set these environment variables and reload:</p>
              <pre className="overflow-x-auto rounded-xl bg-black/40 p-3 text-[11.5px] leading-relaxed">
{`GOOGLE_CLIENT_ID=…
GOOGLE_CLIENT_SECRET=…
GOOGLE_REDIRECT_URI=https://your-domain/api/youtube/callback
# optional (unauthenticated search)
YOUTUBE_API_KEY=…
# required to store the account tokens (AES-256-GCM) — generate once, keep secret
GOOGLE_TOKEN_KEY=$(openssl rand -hex 32)`}
              </pre>
              <p className="mt-2">
                Authorised redirect URI in Google Cloud Console:{" "}
                <code className="rounded bg-black/40 px-1.5 py-0.5">{typeof window !== "undefined" ? `${window.location.origin}/api/youtube/callback` : "/api/youtube/callback"}</code>
              </p>
              {data.reason && <p className="mt-2 opacity-70">{data.reason}</p>}
            </>
          }
        />
      </Shell>
    );
  }

  /* ------------------------------ not signed in --------------------------- */
  if (!data?.connected || !data.channel) {
    return (
      <Shell>
        <div className="grid gap-5 rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-red-500/15">
            <Music2 className="size-7 text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-black">{t("ytConnect")}</h2>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] text-[color:var(--app-muted)]">{t("ytRealDataOnly")}</p>
          </div>
          <div className="mx-auto flex flex-col gap-2">
            <a
              href="/api/youtube/auth"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-6 py-3 text-[13px] font-bold text-white transition hover:bg-red-500"
            >
              <GoogleMark /> {t("ytConnect")}
            </a>
            <span className="text-[11px] text-[color:var(--app-muted)]">
              Scopes: youtube · youtube.force-ssl · youtube.upload · email · profile — revocable any time from {" "}
              <a className="underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
                your Google account
              </a>.
            </span>
          </div>
          {data?.reason && <p className="text-[11.5px] text-rose-300">{data.reason}</p>}
        </div>
      </Shell>
    );
  }

  const ch = data.channel;

  return (
    <Shell>
      {/* banner + identity */}
      <div className="overflow-hidden rounded-3xl border border-white/10">
        <div className="relative h-36 w-full bg-gradient-to-br from-red-900/60 via-black to-red-800/30">
          {ch.banner && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ch.banner} alt="" className="size-full object-cover opacity-80" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4 p-5">
          {ch.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ch.avatar} alt={ch.title} className="-mt-14 size-24 rounded-full border-4 border-[var(--app-bg)] object-cover" />
          ) : (
            <div className="-mt-14 grid size-24 place-items-center rounded-full border-4 border-[var(--app-bg)] bg-white/10">
              <Music2 className="size-8" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-1.5 text-xl font-black">
              <span className="truncate">{ch.title}</span>
              <BadgeCheck className="size-5 shrink-0 text-sky-400" />
            </h2>
            <p className="text-[12px] text-[color:var(--app-muted)]">
              {ch.handle ? `${ch.handle} · ` : ""}
              {ch.country ?? ""} {ch.publishedAt ? `· joined ${ch.publishedAt.slice(0, 10)}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-4 text-[12px]">
              <Stat label={t("ytSubscriptions")} value={ch.subscribers != null ? formatCount(ch.subscribers) : "hidden"} icon={<Users className="size-3.5" />} />
              <Stat label="Views" value={formatCount(ch.views)} icon={<Play className="size-3.5" />} />
              <Stat label="Videos" value={formatCount(ch.videos)} icon={<Music2 className="size-3.5" />} />
            </div>
          </div>
          <div className="flex gap-2">
            <a
              href={`https://www.youtube.com/channel/${ch.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-full border border-white/12 px-4 py-2 text-[12px] font-semibold"
            >
              <ExternalLink className="size-3.5" /> YouTube
            </a>
            <button
              onClick={() => void disconnect()}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-full border border-rose-400/25 bg-rose-400/10 px-4 py-2 text-[12px] font-semibold text-rose-200 disabled:opacity-50"
            >
              <LogOut className="size-3.5" /> {t("ytDisconnect")}
            </button>
          </div>
        </div>
      </div>

      {data.errors && data.errors.length > 0 && (
        <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11.5px] text-amber-200">
          {data.errors.join(" · ")}
        </p>
      )}

      {/* subscriptions */}
      <Section title={t("ytSubscriptions")} icon={<UserCheck className="size-4 text-red-400" />} count={data.subscriptions?.length ?? 0}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {(data.subscriptions ?? []).map((s) => (
            <a
              key={s.channelId}
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="group w-28 shrink-0 text-center"
            >
              {s.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.avatar} alt={s.title} className="mx-auto size-20 rounded-full object-cover ring-1 ring-white/10 transition group-hover:ring-red-400/60" />
              ) : (
                <div className="mx-auto grid size-20 place-items-center rounded-full bg-white/10">
                  <Users className="size-6" />
                </div>
              )}
              <p className="mt-1.5 truncate text-[11.5px] font-semibold">{s.title}</p>
            </a>
          ))}
          {(data.subscriptions?.length ?? 0) === 0 && <Empty text="No subscriptions on this account." />}
        </div>
      </Section>

      {/* newest from subscriptions */}
      <Section title={t("ytRecommendations")} icon={<Sparkles className="size-4 text-fuchsia-400" />} count={data.feed?.length ?? 0}>
        <VideoGrid items={data.feed ?? []} />
      </Section>

      {/* liked */}
      <Section title={t("ytHistory")} icon={<History className="size-4 text-amber-400" />} count={data.liked?.length ?? 0}>
        <VideoGrid items={data.liked ?? []} />
      </Section>

      {/* own YouTube watch history (separate from in-app listening history) */}
      <YouTubeHistorySection />

      {/* upload */}
      <YouTubeUploadSection connected={data.connected} />

      {/* playlists */}
      <Section title={t("ytPlaylists")} icon={<Bell className="size-4 text-sky-400" />} count={data.playlists?.length ?? 0}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(data.playlists ?? []).map((p) => (
            <a
              key={p.id}
              href={p.url}
              target="_blank"
              rel="noreferrer"
              className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-white/25"
            >
              <div className="aspect-square w-full overflow-hidden bg-white/5">
                {p.thumb && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.thumb} alt={p.title} className="size-full object-cover transition group-hover:scale-105" />
                )}
              </div>
              <div className="p-3">
                <p className="truncate text-[12.5px] font-bold">{p.title}</p>
                <p className="text-[11px] text-[color:var(--app-muted)]">{p.count} videos</p>
              </div>
            </a>
          ))}
          {(data.playlists?.length ?? 0) === 0 && <Empty text="No playlists yet." />}
        </div>
      </Section>

      <p className="mt-6 text-center text-[11px] text-[color:var(--app-muted)]">{t("ytRealDataOnly")}</p>
    </Shell>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[color:var(--app-muted)]">
      {icon}
      <b className="font-bold text-[var(--app-text)]">{value}</b> {label}
    </span>
  );
}

function Section({
  title,
  icon,
  count,
  children,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <h3 className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.2em] text-[color:var(--app-muted)]">
        {icon} {title}
        {count !== undefined && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black">{count}</span>}
        {action && <span className="ms-auto normal-case tracking-normal">{action}</span>}
      </h3>
      {children}
    </section>
  );
}

function VideoGrid({ items }: { items: VideoDto[] }) {
  if (items.length === 0) return <Empty text="Nothing here yet." />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((v) => (
        <Link
          key={v.videoId}
          href={`/watch?v=${v.videoId}`}
          className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-white/25"
        >
          <div className="relative aspect-video w-full overflow-hidden bg-white/5">
            {v.thumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.thumb} alt={v.title} className="size-full object-cover transition group-hover:scale-105" />
            )}
            <span className="absolute bottom-1.5 end-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {fmtDur(v.durationSec)}
            </span>
          </div>
          <div className="p-3">
            <p className="line-clamp-2 text-[12.5px] font-bold leading-snug">{v.title}</p>
            <p className="mt-1 truncate text-[11px] text-[color:var(--app-muted)]">{v.channel}</p>
            {v.views != null && (
              <p className="text-[10.5px] text-[color:var(--app-muted)]">
                {formatCount(v.views)} views · {v.publishedAt?.slice(0, 10)}
              </p>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-white/12 px-4 py-8 text-center text-[12px] text-[color:var(--app-muted)]">{text}</p>;
}

function Notice({ tone, icon, title, body }: { tone: "warn"; icon: React.ReactNode; title: string; body: React.ReactNode }) {
  return (
    <div className={`rounded-3xl border p-6 ${tone === "warn" ? "border-amber-400/30 bg-amber-400/[0.07]" : "border-white/10 bg-white/[0.03]"}`}>
      <h2 className="mb-3 flex items-center gap-2 text-[15px] font-black text-amber-200">
        {icon} {title}
      </h2>
      <div className="text-[12.5px] leading-relaxed text-[color:var(--app-muted)]">{body}</div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#fff" d="M21.35 11.1H12v2.9h5.35c-.23 1.5-1.7 4.4-5.35 4.4A5.9 5.9 0 0 1 12 6.2c1.68 0 2.8.72 3.44 1.34l2.35-2.27A9.2 9.2 0 0 0 12 2.8a9.2 9.2 0 1 0 0 18.4c5.3 0 8.83-3.73 8.83-8.98 0-.6-.06-1.06-.13-1.52Z" />
    </svg>
  );
}

function fmtDur(sec: number): string {
  if (!sec) return "--:--";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}


/* -------------------------------------------------------------------------- */
/*  YouTube watch history — our own records, kept apart from in-app history.   */
/* -------------------------------------------------------------------------- */

interface WatchEntry {
  videoId: string;
  title: string;
  channel: string | null;
  thumb: string | null;
  durationSec: number;
  positionSec: number;
  completed: boolean;
  watchedAt: string;
}

function YouTubeHistorySection() {
  const t = useT();
  const [items, setItems] = useState<WatchEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/youtube/history", { cache: "no-store" }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { items?: WatchEntry[] };
    setItems(body.items ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const clear = async () => {
    setBusy(true);
    try {
      await fetch("/api/youtube/history?id=all", { method: "DELETE" });
      setItems([]);
      toast.success(t("ytHistoryCleared"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (videoId: string) => {
    await fetch(`/api/youtube/history?id=${encodeURIComponent(videoId)}`, { method: "DELETE" });
    setItems((prev) => prev.filter((v) => v.videoId !== videoId));
  };

  return (
    <Section
      title={t("ytWatchHistory")}
      icon={<History className="size-4 text-emerald-400" />}
      count={items.length}
      action={
        items.length > 0 ? (
          <button
            onClick={() => void clear()}
            disabled={busy}
            className="rounded-full border border-white/12 px-3 py-1 text-[11px] font-semibold text-[color:var(--app-muted)] hover:text-white disabled:opacity-50"
          >
            {t("clearHistory")}
          </button>
        ) : null
      }
    >
      {items.length === 0 ? (
        <Empty text={t("ytWatchHistoryEmpty")} />
      ) : (
        <div className="grid gap-2">
          {items.slice(0, 24).map((v) => {
            const pct = v.durationSec > 0 ? Math.min(100, Math.round((v.positionSec / v.durationSec) * 100)) : 0;
            return (
              <div key={v.videoId} className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-2">
                <Link href={`/watch?v=${v.videoId}`} className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-white/10">
                  {v.thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.thumb} alt="" className="size-full object-cover" />
                  )}
                  {pct > 0 && <span className="absolute inset-x-0 bottom-0 h-1 bg-red-500" style={{ width: `${pct}%` }} />}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/watch?v=${v.videoId}`} className="line-clamp-1 text-[12.5px] font-bold hover:underline">
                    {v.title}
                  </Link>
                  <p className="truncate text-[11px] text-[color:var(--app-muted)]">
                    {v.channel ?? ""} · {new Date(v.watchedAt).toLocaleDateString()}
                    {v.completed ? ` · ${t("watched")}` : pct > 0 ? ` · ${pct}%` : ""}
                  </p>
                </div>
                <button
                  onClick={() => void remove(v.videoId)}
                  className="rounded-full px-2 py-1 text-[11px] text-[color:var(--app-muted)] hover:bg-white/10 hover:text-white"
                  aria-label={t("clearHistory")}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Upload a video the user owns — official resumable upload, real progress.   */
/* -------------------------------------------------------------------------- */

function YouTubeUploadSection({ connected }: { connected: boolean }) {
  const t = useT();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">("private");
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async () => {
    if (!file) return;
    setError(null);
    setResult(null);
    setProgress(0);
    try {
      // 1. open the resumable session server-side (token never leaves the server)
      const startRes = await fetch("/api/yt/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || file.name.replace(/\.[^.]+$/, ""),
          privacy,
          size: file.size,
        }),
      });
      const start = (await startRes.json().catch(() => ({}))) as { ok?: boolean; uploadId?: string; error?: string };
      if (!startRes.ok || !start.ok || !start.uploadId) {
        setError(start.error ?? `HTTP ${startRes.status}`);
        setProgress(null);
        return;
      }

      // 2. stream the bytes through our own route with real progress events
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", `/api/yt/upload?uploadId=${encodeURIComponent(start.uploadId!)}`);
        xhr.setRequestHeader("Content-Type", file.type || "video/*");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const body = JSON.parse(xhr.responseText) as { ok?: boolean; url?: string; error?: string; note?: string };
              if (body.ok) {
                setResult(body.url ?? null);
                toast.success(t("uploadDone"), { description: body.note });
              } else {
                setError(body.error ?? "Upload failed");
              }
              resolve();
            } catch {
              reject(new Error("Bad response"));
            }
          } else {
            try {
              const body = JSON.parse(xhr.responseText) as { error?: string };
              setError(body.error ?? `HTTP ${xhr.status}`);
            } catch {
              setError(`HTTP ${xhr.status}`);
            }
            resolve();
          }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(file);
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProgress((p) => (p === 100 ? 100 : null));
    }
  };

  return (
    <Section title={t("uploadVideo")} icon={<ExternalLink className="size-4 text-sky-400" />} count={0}>
      {!connected ? (
        <Empty text={t("connectYouTubeFirst")} />
      ) : (
        <div className="grid gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <input
            type="file"
            accept="video/*"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
            }}
            className="text-[12px] file:me-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-[11px] file:font-semibold file:text-white"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("uploadTitle")}
            className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[13px] outline-none focus:border-white/25"
          />
          <div className="flex items-center gap-2">
            <select
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value as typeof privacy)}
              className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[12px] outline-none"
            >
              <option value="private">{t("uploadPrivate")}</option>
              <option value="unlisted">{t("uploadUnlisted")}</option>
              <option value="public">{t("uploadPublic")}</option>
            </select>
            <button
              onClick={() => void upload()}
              disabled={!file || progress !== null}
              className="rounded-full bg-[var(--app-accent)] px-4 py-2 text-[12px] font-bold text-black disabled:opacity-40"
            >
              {progress === null ? t("uploadStart") : `${t("uploadProgress")} ${progress}%`}
            </button>
          </div>
          {progress !== null && (
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-[var(--app-accent)] transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          )}
          <p className="text-[10.5px] text-[color:var(--app-muted)]">{t("uploadNote")}</p>
          {result && (
            <a href={result} target="_blank" rel="noreferrer" className="text-[12px] font-semibold underline">
              {result}
            </a>
          )}
          {error && <p className="text-[11.5px] text-rose-300">{error}</p>}
        </div>
      )}
    </Section>
  );
}
