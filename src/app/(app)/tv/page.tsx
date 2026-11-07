"use client";

// ============================================================================
//  TV — thousands of real live channels (iptv-org), organized in sections:
//  Featured · Egypt · Arabic · News · Kids · Movies · Series · Quran ·
//  Documentary · Sports · Music · Culture · World — with search, logos and
//  the premium TvPlayer (quality control, PiP, fullscreen, record, …).
// ============================================================================
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { links, shareUrl } from "@/lib/share";
import { Search, Tv as TvIcon, Globe2, Star, Share2 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useT, type DictKey } from "@/lib/i18n";
import { TvPlayer } from "@/components/tv/TvPlayer";
import type { TvChannelDTO } from "@/lib/server/tv";

const SECTIONS: { id: string; key: DictKey; emoji: string }[] = [
  { id: "featured", key: "tvFeatured", emoji: "⭐" },
  { id: "egypt", key: "tvEgypt", emoji: "🇪🇬" },
  { id: "arabic", key: "tvArabic", emoji: "🕌" },
  { id: "news", key: "tvNews", emoji: "📰" },
  { id: "kids", key: "tvKids", emoji: "🧸" },
  { id: "movies", key: "tvMovies", emoji: "🎬" },
  { id: "series", key: "tvSeries", emoji: "📺" },
  { id: "quran", key: "tvQuran", emoji: "📿" },
  { id: "documentary", key: "tvDocs", emoji: "🌍" },
  { id: "sports", key: "tvSports", emoji: "⚽" },
  { id: "music", key: "tvMusic", emoji: "🎵" },
  { id: "culture", key: "tvCulture", emoji: "🎭" },
  { id: "world", key: "tvWorld", emoji: "🌐" },
];

const FLAG = (cc: string) => (cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : "🌐");

export default function TvPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-white/40">…</div>}>
      <TvPageInner />
    </Suspense>
  );
}

function TvPageInner() {
  const t = useT();
  const params = useSearchParams();
  const deepChannel = params.get("channel");
  const deepHandled = useRef(false);
  const [section, setSection] = useState("featured");
  const [q, setQ] = useState("");
  const [channels, setChannels] = useState<TvChannelDTO[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<TvChannelDTO | null>(null);
  const [recent, setRecent] = useState<TvChannelDTO[]>([]);
  const [limit, setLimit] = useState(96);

  // restore recent channels (local)
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
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ section, limit: String(limit) });
      if (q.trim()) params.set("q", q.trim());
      void fetch(`/api/tv?${params}`)
        .then((r) => r.json())
        .then((d: { channels: TvChannelDTO[]; counts?: Record<string, number>; total?: number; error?: string }) => {
          setChannels(d.channels ?? []);
          if (d.counts) setCounts(d.counts);
          setTotal(d.total ?? 0);
          if (d.error) setError(d.error);
          setLoading(false);
        })
        .catch(() => {
          setError("TV directory unavailable");
          setLoading(false);
        });
    }, q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [section, q, limit]);

  const play = (c: TvChannelDTO) => {
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
  };

  const list = useMemo(() => channels, [channels]);

  // deep link: /tv?channel=<id>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepChannel]);

  const Card = ({ c, i }: { c: TvChannelDTO; i: number }) => {
    const active = current?.id === c.id;
    const best = c.streams[0]?.quality;
    return (
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(i * 0.015, 0.3) }}
        onClick={() => play(c)}
        className={cn(
          "group relative flex flex-col items-stretch rounded-2xl border p-3 text-start transition-all hover:bg-white/[0.07]",
          active ? "border-[#1DB954]/60 bg-[#1DB954]/10" : "border-white/[0.06] bg-white/[0.03]",
        )}
        title={c.name}
      >
        <div className="grid aspect-video w-full place-items-center overflow-hidden rounded-xl bg-white/[0.06]">
          {c.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.logo} alt="" loading="lazy" className="max-h-[70%] max-w-[80%] object-contain drop-shadow" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <TvIcon className="size-8 text-white/25" />
          )}
          {best && <span className="absolute end-4 top-4 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white/85">{best}</span>}
          {active && <span className="absolute start-4 top-4 flex items-center gap-1 rounded bg-rose px-1.5 py-0.5 text-[9px] font-black text-white"><span className="size-1.5 animate-pulse rounded-full bg-white" /> {t("live")}</span>}
        </div>
        <p className="mt-2 truncate text-[13px] font-bold">{c.name}</p>
        <p className="truncate text-[11px] text-white/45">
          {FLAG(c.country)} {c.country} · {c.categories.slice(0, 2).join(", ") || "live"}{c.streams.length > 1 ? ` · ${c.streams.length} src` : ""}
        </p>
      </motion.button>
    );
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 px-1 text-3xl font-black tracking-tight">
            <TvIcon className="size-7 text-[#1DB954]" /> {t("tvTitle")}
          </h1>
          <p className="mt-1 px-1 text-sm text-white/40">{t("tvSub")}</p>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-white/40" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("tvSearch")} className="w-full rounded-full border border-white/10 bg-white/[0.06] py-2.5 pe-4 ps-10 text-sm outline-none placeholder:text-white/35 focus:border-white/25" />
        </div>
      </div>

      {/* player */}
      <div className="mt-5">
        <TvPlayer channel={current} onClose={() => setCurrent(null)} />
        {current && (
          <div className="mt-2 flex items-center justify-end gap-2">
            <button onClick={() => void shareUrl(links.channel(current.id), current.name).then((r) => r === "copied" && toast.success(t("copied")))} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-semibold text-white/80 hover:bg-white/12"><Share2 className="size-3.5" /> {t("share")} · {current.name}</button>
          </div>
        )}
      </div>

      {/* recent */}
      {recent.length > 0 && !q && (
        <div className="mt-4">
          <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">{t("recentlyPlayed")}</p>
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {recent.map((c) => (
              <button key={c.id} onClick={() => play(c)} className={cn("flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold", current?.id === c.id ? "border-[#1DB954] text-[#1DB954]" : "border-white/10 text-white/70 hover:bg-white/8")}>
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

      {/* sections */}
      <div className="no-scrollbar mt-5 flex gap-1.5 overflow-x-auto pb-1">
        {SECTIONS.map((s) => (
          <button key={s.id} onClick={() => { setSection(s.id); setQ(""); setLimit(96); }} className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors", section === s.id && !q ? "border-[#1DB954] bg-[#1DB954]/15 text-[#1DB954]" : "border-white/10 text-white/55 hover:bg-white/8 hover:text-white")}>
            <span>{s.emoji}</span> {t(s.key)}
            {counts[s.id] !== undefined && <span className="font-mono text-[10px] opacity-60">{counts[s.id]}</span>}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 rounded-xl bg-amber/10 px-4 py-2 text-xs text-amber">{error}</p>}

      {loading ? (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => <div key={i} className="skeleton aspect-[4/3]" />)}
        </div>
      ) : (
        <>
          <p className="mt-5 flex items-center gap-2 px-1 text-xs text-white/40">
            {section === "featured" && !q ? <Star className="size-3.5 text-gold" /> : <Globe2 className="size-3.5" />}
            {q ? `${t("noResults").replace("No results for", "").trim()} “${q}” · ` : ""}{total} {t("tvChannels")}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {list.map((c, i) => <Card key={c.id} c={c} i={i} />)}
          </div>
          {list.length < total && (
            <div className="mt-5 flex justify-center">
              <button onClick={() => setLimit((l) => l + 96)} className="rounded-full border border-white/15 bg-white/[0.06] px-6 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/12">
                {t("tvLoadMore")} ({total - list.length})
              </button>
            </div>
          )}
          {list.length === 0 && <p className="mt-8 text-center text-sm text-white/40">{t("noResults")} “{q}”</p>}
        </>
      )}
    </div>
  );
}
