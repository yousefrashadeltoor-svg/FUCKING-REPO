"use client";

// ============================================================================
//  Listening statistics — every number is computed from this user's own rows
//  (listening_history / youtube_history). Nothing is estimated, nothing is
//  shared between visitors, and YouTube watch time is reported separately.
// ============================================================================
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, CalendarCheck, Clock, Disc3, Loader2, Music2, Sparkles, Users } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatCount } from "@/lib/utils";
import type { StatsDTO } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_BASE || "";

export default function StatsPage() {
  const t = useT();
  const [stats, setStats] = useState<StatsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`${apiBase}/api/stats`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: StatsDTO) => setStats(d))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => ctrl.abort();
  }, []);

  const peakHour = useMemo(() => {
    const hours = stats?.byHour ?? [];
    if (hours.length !== 24) return null;
    const max = Math.max(...hours);
    if (max === 0) return null;
    return hours.indexOf(max);
  }, [stats?.byHour]);

  const maxDay = useMemo(() => Math.max(1, ...(stats?.last30Days ?? []).map((d) => d.plays)), [stats?.last30Days]);

  if (error) {
    return <div className="p-6"><div className="rounded-2xl border border-rose/30 bg-rose/10 p-4 text-sm text-rose-200">{error}</div></div>;
  }

  if (!stats) {
    return (
      <div className="grid place-items-center py-24 text-[color:var(--app-muted)]">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  const empty = stats.totalPlays === 0;

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-black tracking-tight">
        <BarChart3 className="size-6 text-[var(--app-accent)]" /> {t("statsTitle")}
      </h1>
      <p className="mb-5 text-[13px] text-[color:var(--app-muted)]">{t("statsSub")}</p>

      {empty ? (
        <div className="grid place-items-center rounded-3xl border border-white/10 bg-white/[0.03] py-16 text-center">
          <Music2 className="mb-3 size-8 text-[var(--app-accent)]" />
          <p className="text-sm font-bold">{t("statsEmpty")}</p>
          <Link href="/" className="mt-3 text-xs font-semibold text-[var(--app-accent)]">{t("home")}</Link>
        </div>
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card icon={<Music2 className="size-4" />} label={t("totalPlays")} value={formatCount(stats.totalPlays)} />
            <Card icon={<Clock className="size-4" />} label={t("minutesListened")} value={formatCount(stats.totalMinutes)} />
            <Card icon={<Disc3 className="size-4" />} label={t("uniqueTracks")} value={formatCount(stats.uniqueTracks ?? 0)} />
            <Card icon={<Users className="size-4" />} label={t("uniqueArtists")} value={formatCount(stats.uniqueArtists ?? 0)} />
          </div>

          <div className="mb-5 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--app-muted)]">
                <CalendarCheck className="size-3.5" /> {t("last30Days")}
              </p>
              {(stats.last30Days ?? []).length === 0 ? (
                <p className="py-6 text-center text-xs text-[color:var(--app-muted)]">{t("statsEmpty")}</p>
              ) : (
                <div className="flex h-28 items-end gap-1">
                  {(stats.last30Days ?? []).map((d) => (
                    <div key={d.date} className="group relative flex-1" title={`${d.date} · ${d.plays}`}>
                      <div
                        className="w-full rounded-t bg-[var(--app-accent)]/80 transition-colors group-hover:bg-[var(--app-accent)]"
                        style={{ height: `${Math.max(3, (d.plays / maxDay) * 100)}%` }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--app-muted)]">
                <Sparkles className="size-3.5" /> {t("byHour")}
                {peakHour !== null && <span className="normal-case tracking-normal text-white">· {String(peakHour).padStart(2, "0")}:00</span>}
              </p>
              <div className="flex h-28 items-end gap-[2px]">
                {(stats.byHour ?? []).map((n, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t bg-white/25 hover:bg-[var(--app-accent)]"
                    style={{ height: `${Math.max(2, (n / Math.max(1, Math.max(...(stats.byHour ?? [1])))) * 100)}%` }}
                    title={`${String(i).padStart(2, "0")}:00 · ${n}`}
                  />
                ))}
              </div>
              <p className="mt-3 flex items-center justify-between text-[11px] text-[color:var(--app-muted)]">
                <span>{t("streak")}</span>
                <span className="font-bold text-white">{stats.streakDays ?? 0} {t("days")}</span>
              </p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title={t("artists")}>
              {stats.topArtists.slice(0, 6).map((a) => (
                <Link key={a.id} href={`/artists/${a.id}`} className="flex items-center gap-2.5 rounded-xl p-1.5 hover:bg-white/[0.06]">
                  {a.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.imageUrl} alt={a.name} className="size-9 rounded-full object-cover" />
                  ) : (
                    <span className="grid size-9 place-items-center rounded-full bg-white/10 text-xs font-bold">{a.name.slice(0, 1)}</span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{a.name}</span>
                  <span className="text-[11px] text-[color:var(--app-muted)]">{a.plays} {t("plays")}</span>
                </Link>
              ))}
            </Panel>
            <Panel title={t("genreDistribution")}>
              {stats.genreDistribution.slice(0, 6).map((g) => (
                <div key={g.genre} className="flex items-center gap-2 p-1.5">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold capitalize">{g.genre}</span>
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-[var(--app-accent)]"
                      style={{ width: `${(g.plays / Math.max(1, stats.genreDistribution[0]?.plays ?? 1)) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-end text-[11px] text-[color:var(--app-muted)]">{g.plays}</span>
                </div>
              ))}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function Card({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.18em] text-[color:var(--app-muted)]">
        {icon} {label}
      </p>
      <p className="mt-1.5 text-xl font-black">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--app-muted)]">{title}</p>
      {children}
    </div>
  );
}
