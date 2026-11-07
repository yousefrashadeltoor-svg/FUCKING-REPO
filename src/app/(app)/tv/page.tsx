"use client";

// ============================================================================
//  Live TV — two-level taxonomy, professionally organised.
//      التلفزيون المصري   → دينية · كرتون · ترفيهية · إخبارية · رياضية · أفلام …
//      التلفزيون العربي   → same categories, every Arab country broadcast
//      قنوات عالمية       → international
//  Includes search, recents, quality tags and the full TvPlayer.
// ============================================================================
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { links, shareUrl } from "@/lib/share";
import { Search, Tv as TvIcon, Globe2, Star, Share2, ChevronLeft, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { TvPlayer } from "@/components/tv/TvPlayer";
import type { TvChannelDTO } from "@/lib/server/tv";

interface GroupDef {
  id: string;
  labelAr: string;
  emoji: string;
  descAr: string;
  gradient: string;
}

const GROUPS: GroupDef[] = [
  {
    id: "egyptian",
    labelAr: "التلفزيون المصري",
    emoji: "🇪🇬",
    descAr: "قنوات تُبث في مصر — دينية وترفيهية وإخبارية ورياضية وأفلام وكرتون وتعليمية",
    gradient: "from-red-500/25 via-amber-500/15 to-transparent",
  },
  {
    id: "arabic",
    labelAr: "التلفزيون العربي",
    emoji: "🕌",
    descAr: "قنوات من كل الدول العربية — السعودية والإمارات وقطر والكويت والشام والمغرب العربي",
    gradient: "from-emerald-500/25 via-teal-500/15 to-transparent",
  },
  {
    id: "world",
    labelAr: "قنوات عالمية",
    emoji: "🌐",
    descAr: "أخبار ووثائقيات وأفلام ورياضة من كل العالم",
    gradient: "from-sky-500/25 via-indigo-500/15 to-transparent",
  },
];

const CATS: { id: string; labelAr: string; emoji: string }[] = [
  { id: "", labelAr: "كل القنوات", emoji: "📺" },
  { id: "religious", labelAr: "قنوات دينية", emoji: "📿" },
  { id: "kids", labelAr: "أطفال وكرتون", emoji: "🧸" },
  { id: "entertainment", labelAr: "ترفيهية", emoji: "🎭" },
  { id: "news", labelAr: "إخبارية", emoji: "📰" },
  { id: "sports", labelAr: "رياضية", emoji: "⚽" },
  { id: "movies", labelAr: "أفلام", emoji: "🎬" },
  { id: "series", labelAr: "مسلسلات", emoji: "📺" },
  { id: "music", labelAr: "موسيقى وطرب", emoji: "🎵" },
  { id: "documentary", labelAr: "وثائقية", emoji: "🌍" },
  { id: "education", labelAr: "تعليمية", emoji: "🎓" },
  { id: "culture", labelAr: "ثقافية", emoji: "🏛️" },
];

const FLAG = (cc: string) =>
  cc && cc.length === 2
    ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : "🌐";

export default function TvPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-[color:var(--app-muted)]">…</div>}>
      <TvPageInner />
    </Suspense>
  );
}

function TvPageInner() {
  const t = useT();
  const params = useSearchParams();
  const deepChannel = params.get("channel");
  const deepHandled = useRef(false);

  const [group, setGroup] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [channels, setChannels] = useState<TvChannelDTO[]>([]);
  const [counts, setCounts] = useState<Record<string, Record<string, number>>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<TvChannelDTO | null>(null);
  const [recent, setRecent] = useState<TvChannelDTO[]>([]);
  const [limit, setLimit] = useState(96);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("donmuse-tv-recent");
      if (raw) setRecent(JSON.parse(raw) as TvChannelDTO[]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      const sp = new URLSearchParams({ limit: String(limit) });
      if (group) sp.set("group", group);
      if (category) sp.set("category", category);
      if (q.trim()) sp.set("q", q.trim());
      fetch(`/api/tv?${sp}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: { channels?: TvChannelDTO[]; counts?: Record<string, Record<string, number>>; total?: number; error?: string }) => {
          setChannels(d.channels ?? []);
          if (d.counts) setCounts(d.counts);
          setTotal(d.total ?? 0);
          if (d.error) setError(d.error);
          setLoading(false);
        })
        .catch((e: Error) => {
          if (e.name === "AbortError") return;
          setError("TV directory unavailable");
          setLoading(false);
        });
    }, q ? 240 : 0);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [group, category, q, limit]);

  const play = useCallback((c: TvChannelDTO) => {
    setCurrent(c);
    setRecent((r) => {
      const next = [c, ...r.filter((x) => x.id !== c.id)].slice(0, 12);
      try {
        localStorage.setItem("donmuse-tv-recent", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!deepChannel || deepHandled.current) return;
    deepHandled.current = true;
    void fetch(`/api/tv?q=${encodeURIComponent(deepChannel)}&limit=5`)
      .then((r) => r.json())
      .then((d: { channels: TvChannelDTO[] }) => {
        const c = d.channels.find((x) => x.id === deepChannel) ?? d.channels[0];
        if (c) play(c);
      })
      .catch(() => {});
  }, [deepChannel, play]);

  const groupCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const g of GROUPS) out[g.id] = counts[g.id]?.all ?? 0;
    return out;
  }, [counts]);

  const Card = ({ c, i }: { c: TvChannelDTO; i: number }) => {
    const active = current?.id === c.id;
    const best = c.streams[0]?.quality;
    return (
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(i * 0.012, 0.25) }}
        onClick={() => play(c)}
        className={cn(
          "group relative flex flex-col items-stretch rounded-2xl border p-3 text-start transition-all hover:-translate-y-0.5 hover:bg-white/[0.07]",
          active ? "border-[var(--app-accent)]/70 bg-[var(--app-accent)]/10" : "border-white/[0.06] bg-white/[0.03]",
        )}
        title={c.name}
      >
        <div className="relative grid aspect-video w-full place-items-center overflow-hidden rounded-xl bg-white/[0.06]">
          {c.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.logo}
              alt=""
              loading="lazy"
              className="max-h-[70%] max-w-[80%] object-contain drop-shadow"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <TvIcon className="size-8 text-white/25" />
          )}
          {best && (
            <span className="absolute end-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white/85">
              {best}
            </span>
          )}
          {active && (
            <span className="absolute start-1.5 top-1.5 flex items-center gap-1 rounded bg-rose px-1.5 py-0.5 text-[9px] font-black text-white">
              <span className="size-1.5 animate-pulse rounded-full bg-white" /> {t("live")}
            </span>
          )}
        </div>
        <p className="mt-2 truncate text-[13px] font-bold">{c.name}</p>
        <p className="truncate text-[11px] text-[color:var(--app-muted)]">
          {FLAG(c.country)} {c.country}
          {c.streams.length > 1 ? ` · ${c.streams.length} ${t("dlFormats")}` : ""}
        </p>
      </motion.button>
    );
  };

  return (
    <div className="p-4 md:p-6">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 px-1 text-3xl font-black tracking-tight">
            <TvIcon className="size-7 text-[var(--app-accent)]" /> {t("tvTitle")}
          </h1>
          <p className="mt-1 px-1 text-sm text-[color:var(--app-muted)]">{t("tvSub")}</p>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-[color:var(--app-muted)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("tvSearch")}
            className="w-full rounded-full border border-white/10 bg-white/[0.06] py-2.5 pe-4 ps-10 text-sm outline-none placeholder:text-[color:var(--app-muted)] focus:border-white/25"
          />
        </div>
      </div>

      {/* player */}
      <div className="mt-5">
        <TvPlayer channel={current} onClose={() => setCurrent(null)} />
        {current && (
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              onClick={() =>
                void shareUrl(links.channel(current.id), current.name).then((r) => r === "copied" && toast.success(t("copied")))
              }
              className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-semibold hover:bg-white/[0.12]"
            >
              <Share2 className="size-3.5" /> {t("share")} · {current.name}
            </button>
          </div>
        )}
      </div>

      {/* recents */}
      {recent.length > 0 && !q && (
        <div className="mt-4">
          <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--app-muted)]">
            {t("recentlyPlayed")}
          </p>
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {recent.map((c) => (
              <button
                key={c.id}
                onClick={() => play(c)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
                  current?.id === c.id
                    ? "border-[var(--app-accent)] text-[var(--app-accent)]"
                    : "border-white/10 text-[color:var(--app-muted)] hover:bg-white/[0.06]",
                )}
              >
                {c.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.logo} alt="" className="h-4 w-6 rounded-sm bg-white/90 object-contain" />
                )}
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---- level 1: main sections ---- */}
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-lg font-extrabold tracking-tight">{t("tvSubcategories")}</h2>
          {group && (
            <button onClick={() => { setGroup(null); setCategory(""); }} className="flex items-center gap-1 text-[12px] font-semibold text-[color:var(--app-muted)] hover:text-white">
              <ChevronLeft className="size-3.5 rtl:rotate-180" /> {t("tvBackToMain")}
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(group ? GROUPS.filter((g) => g.id === group) : GROUPS).map((g) => {
            const active = group === g.id;
            return (
              <motion.button
                key={g.id}
                whileHover={{ y: -3 }}
                onClick={() => {
                  setGroup(active ? null : g.id);
                  setCategory("");
                  setLimit(96);
                }}
                className={cn(
                  "relative overflow-hidden rounded-2xl border p-4 text-start transition-colors",
                  active ? "border-[var(--app-accent)]/60" : "border-white/[0.08] hover:border-white/20",
                )}
              >
                <div className={cn("absolute inset-0 -z-10 bg-gradient-to-br", g.gradient)} />
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{g.emoji}</span>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-black">{g.labelAr}</p>
                    <p className="text-[11px] font-semibold text-[color:var(--app-muted)]">
                      {groupCounts[g.id] ?? 0} {t("tvChannels")}
                    </p>
                  </div>
                  <ChevronLeft className={cn("ms-auto size-4 shrink-0 transition-transform", active ? "rotate-90 text-[var(--app-accent)]" : "text-[color:var(--app-muted)] rtl:rotate-180")} />
                </div>
                {!active && <p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-[color:var(--app-muted)]">{g.descAr}</p>}
                {active && (
                  <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {CATS.map((c) => {
                      const n = counts[g.id]?.[c.id || "all"] ?? 0;
                      if (c.id && n === 0) return null;
                      const on = category === c.id;
                      return (
                        <span
                          key={c.id || "all"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setCategory(c.id);
                            setLimit(96);
                          }}
                          className={cn(
                            "cursor-pointer rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors",
                            on ? "bg-[var(--app-text)] text-[var(--app-bg)]" : "bg-white/[0.07] text-white/80 hover:bg-white/[0.14]",
                          )}
                        >
                          {c.emoji} {c.labelAr} <span className="opacity-60">{n}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ---- level 2 chips (when a main section is open) ---- */}
      <AnimatePresence>
        {group && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-4 overflow-hidden">
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
              {CATS.map((c) => {
                const n = counts[group]?.[c.id || "all"] ?? 0;
                if (c.id && n === 0) return null;
                return (
                  <button
                    key={c.id || "all"}
                    onClick={() => { setCategory(c.id); setLimit(96); }}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors",
                      category === c.id && !q
                        ? "border-[var(--app-accent)] bg-[var(--app-accent)]/15 text-[var(--app-accent)]"
                        : "border-white/10 text-[color:var(--app-muted)] hover:bg-white/[0.06] hover:text-white",
                    )}
                  >
                    <span>{c.emoji}</span> {c.labelAr}
                    <span className="font-mono text-[10px] opacity-60">{n}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!group && !q && (
        <div className="mt-6">
          <p className="mb-2 flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--app-muted)]">
            <Star className="size-3.5 text-gold" /> {t("tvFeatured")}
          </p>
        </div>
      )}

      {error && <p className="mt-4 rounded-xl bg-amber/10 px-4 py-2 text-xs text-amber">{error}</p>}

      {loading ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[4/3]" />
          ))}
        </div>
      ) : (
        <>
          <p className="mt-4 flex items-center gap-2 px-1 text-xs text-[color:var(--app-muted)]">
            <Globe2 className="size-3.5" />
            {q ? `“${q}” · ` : ""}
            {total} {t("tvChannels")}
            {group ? ` · ${GROUPS.find((g) => g.id === group)?.labelAr}` : ""}
            {category ? ` · ${CATS.find((c) => c.id === category)?.labelAr}` : ""}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {channels.map((c, i) => (
              <Card key={c.id} c={c} i={i} />
            ))}
          </div>
          {channels.length < total && (
            <div className="mt-5 flex justify-center">
              <button
                onClick={() => setLimit((l) => l + 96)}
                className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-6 py-2.5 text-sm font-semibold hover:bg-white/[0.12]"
              >
                {limit < total + 1 && <Loader2 className="size-4 opacity-0" />}
                {t("tvLoadMore")} ({total - channels.length})
              </button>
            </div>
          )}
          {channels.length === 0 && (
            <p className="mt-8 text-center text-sm text-[color:var(--app-muted)]">
              {t("noResults")} “{q}”
            </p>
          )}
        </>
      )}
    </div>
  );
}
