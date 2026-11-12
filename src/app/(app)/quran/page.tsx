
// ============================================================================
//  Al-Qur'an Al-Kareem — a sacred, elevated section, distinct from the rest
//  of the app. Deep charcoal-green + gold, geometric ornament, reciters
//  (Egypt first), and every surah is streamed / downloaded COMPLETE —
//  clipping is intentionally disabled with a clear, reverent notice.
// ============================================================================
import { useMemo, useRef, useState } from "react";
import { Play, Pause, Download, ChevronRight, Search, ShieldCheck, BookOpen, Landmark, Loader2, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { usePlayerStore } from "@/stores/player-store";
import { playTrackNow, togglePlayNow } from "@/lib/player-actions";
import { RECITERS, SURAHS, streamProxy, reciterByCode, getSurah, QURAN_SOURCES, type Reciter, type Surah } from "@/lib/data/quran";
import type { TrackDTO } from "@/lib/types";
import { useDownloadStore } from "@/stores/download-store";
import { remember } from "@/lib/local/state";

const PATTERN =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='72' height='72' viewBox='0 0 72 72'><g fill='none' stroke='%23c9a24a' stroke-opacity='0.10'><path d='M36 4 L44 28 L68 36 L44 44 L36 68 L28 44 L4 36 L28 28 Z'/><circle cx='36' cy='36' r='6'/><path d='M0 36 H72 M36 0 V72'/></g></svg>`,
  );

type QQuality = "low" | "medium" | "high";

function quranTrack(reciter: Reciter, surah: Surah, quality: QQuality = "high"): TrackDTO {
  return {
    id: -900000 - surah.n,
    title: `سورة ${surah.ar} — ${surah.en}`,
    artistId: 0,
    artistName: reciter.name,
    albumId: null,
    albumTitle: "القرآن الكريم",
    coverUrl: null,
    durationSec: 0,
    source: "quran",
    sourceId: `${surah.n}:${reciter.code}`,
    previewUrl: null,
    streamUrl: streamProxy(surah.n, reciter.code, quality),
    waveform: [],
    loudnessLufs: -16,
    bpm: 0, key: null, energy: 0.1, valence: 0.7, danceability: 0.1, acousticness: 1,
    explicit: false, genre: "quran", language: "ar", year: 0, isrc: null,
    codec: "mp3", bitrate: reciter.bestBitrate || 128, lossless: false, playCount: 0, lyrics: [], liked: false,
  };
}

function Medallion({ reciter, size = 116 }: { reciter: Reciter; size?: number }) {
  const initials = reciter.name.trim().split(/\s+/)[0];
  return (
    <div
      className="relative mx-auto grid shrink-0 place-items-center rounded-full"
      style={{
        width: size, height: size,
        background: "radial-gradient(circle at 50% 38%, #14382a 0%, #0b1f17 55%, #07130d 100%)",
        boxShadow: "0 0 0 2px rgba(201,162,74,0.55), 0 0 0 6px rgba(201,162,74,0.14), 0 18px 40px rgba(0,0,0,0.6), inset 0 0 30px rgba(0,0,0,0.6)",
      }}
    >
      {/* 8-point ornament */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full opacity-40" style={{ padding: 6 }}>
        <g fill="none" stroke="#c9a24a" strokeWidth="1">
          <path d="M50 6 L58 34 L86 42 L58 50 L50 78 L42 50 L14 42 L42 34 Z" />
          <circle cx="50" cy="42" r="17" />
        </g>
      </svg>
      <div className="relative z-10 flex flex-col items-center px-2 text-center" style={{ fontFamily: "'Amiri','Scheherazade New','Traditional Arabic','Geeza Pro',serif" }}>
        <span className="text-[11px] tracking-wide" style={{ color: "#c9a24a" }}>&#65000;&#65001;&#65002;</span>
        <span className="mt-0.5 leading-none font-bold" style={{ color: "#f3e6c4", fontSize: size * 0.2 }}>
          {initials}
        </span>
        <span className="mt-1 leading-none font-semibold" style={{ color: "#c9a24a", fontSize: 10 }}>{reciter.style}</span>
      </div>
    </div>
  );
}

const Divider = () => (
  <div className="flex items-center justify-center gap-3 py-1" style={{ color: "#c9a24a" }}>
    <span className="h-px w-16 bg-gradient-to-r from-transparent to-[#c9a24a]/60" />
    <BookOpen className="size-4" />
    <span className="h-px w-16 bg-gradient-to-l from-transparent to-[#c9a24a]/60" />
  </div>
);

export default function QuranPage() {
  const t = useT();
  const [reciter, setReciter] = useState<Reciter | null>(null);
  const [q, setQ] = useState("");
  const [rq, setRq] = useState("");
  const [quality, setQuality] = useState<QQuality>("high");
  const [downloading, setDownloading] = useState<number | null>(null);
  // Stream errors are reported by the shared player.
  const current = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isQuran = current?.source === "quran";
  const listRef = useRef<HTMLDivElement>(null);

  const surahs = useMemo(() => {
    const s = q.trim() ? SURAHS.filter((x) => x.ar.includes(q.trim()) || x.en.toLowerCase().includes(q.trim().toLowerCase()) || String(x.n) === q.trim()) : SURAHS;
    return s;
  }, [q]);

  const now = useMemo(() => {
    if (!isQuran || !current?.sourceId) return null;
    const [nStr, code] = current.sourceId.split(":");
    const n = Number(nStr);
    const r = reciterByCode(code);
    const s = getSurah(n);
    return r && s ? { reciter: r, surah: s } : null;
  }, [isQuran, current]);

  const play = (r: Reciter, s: Surah) => {
    const isThis = current?.sourceId === `${s.n}:${r.code}`;
    if (isThis) { togglePlayNow(); return; }
    playTrackNow(quranTrack(r, s, quality));
    toast(t("quranNowReciting"), { description: `${s.ar} · ${r.name}` });
  };
  const dl = (r: Reciter, s: Surah) => {
    setDownloading(s.n);
    const track=quranTrack(r,s,quality); remember([track]);
    useDownloadStore.getState().add({title:`${s.ar} — ${r.name}`,artist:r.name,cover:null,kind:"quran",preset:"original",formatId:"original",url:track.streamUrl,sourceUrl:track.streamUrl,filename:`AlQuran-${String(s.n).padStart(3,"0")}-${s.en.replace(/\s+/g,"-")}-${r.code}.mp3`,mime:"audio/mpeg",track});
    toast.success("أُضيفت السورة كاملة إلى مركز التحميل");setDownloading(null);
  };

  return (
    <div
      className="relative min-h-full"
      style={{
        background: "linear-gradient(180deg, #07130d 0%, #0a1a12 30%, #05100b 100%)",
      }}
    >
      <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: `url("${PATTERN}")`, opacity: 0.6 }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64" style={{ background: "radial-gradient(60% 100% at 50% 0%, rgba(201,162,74,0.14), transparent 70%)" }} />

      <div className="relative mx-auto max-w-4xl px-4 py-8 md:py-10">
        {/* header */}
        <div className="text-center" style={{ fontFamily: "'Amiri','Scheherazade New','Traditional Arabic','Geeza Pro',serif" }}>
          <p className="text-lg" style={{ color: "#c9a24a" }}>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight md:text-5xl" style={{ color: "#f3e6c4", textShadow: "0 2px 30px rgba(201,162,74,0.25)" }}>
            القرآن الكريم
          </h1>
          <p className="mt-2 text-sm text-white/55">{t("quranSub")}</p>
        </div>
        <div className="mx-auto mt-4 max-w-md"><Divider /></div>

        {/* now reciting */}
        <AnimatePresence>
          {now && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-6 flex items-center gap-4 rounded-2xl border p-4"
              style={{ borderColor: "rgba(201,162,74,0.4)", background: "linear-gradient(120deg, rgba(201,162,74,0.12), rgba(201,162,74,0.03))", backdropFilter: "blur(8px)" }}
              dir="rtl"
            >
              <button onClick={() => play(now.reciter, now.surah)} className="grid size-12 shrink-0 place-items-center rounded-full transition-transform hover:scale-105" style={{ background: "#c9a24a", color: "#0a1a12" }}>
                {isPlaying ? <Pause className="size-6" style={{ fill: "#0a1a12" }} /> : <Play className="ms-0.5 size-6" style={{ fill: "#0a1a12" }} />}
              </button>
              <div className="min-w-0 flex-1" style={{ fontFamily: "'Amiri','Scheherazade New','Traditional Arabic',serif" }}>
                <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#c9a24a", fontFamily: "inherit" }}>{t("quranNowReciting")}</p>
                <p className="truncate text-lg font-bold" style={{ color: "#f3e6c4" }}>سورة {now.surah.ar}</p>
                <p className="truncate text-xs text-white/50">{now.reciter.name} · {now.surah.a} {t("quranAyahs")} · {now.reciter.sources.map((x) => QURAN_SOURCES[x.source].label).join(" · ")}</p>
              </div>
              <button onClick={() => void dl(now.reciter, now.surah)} className="grid size-11 shrink-0 place-items-center rounded-full border transition-colors hover:bg-white/5" style={{ borderColor: "rgba(201,162,74,0.4)", color: "#c9a24a" }} title={t("quranDownloadFull")}>
                {downloading === now.surah.n ? <Loader2 className="size-5 animate-spin" /> : <Download className="size-5" />}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* reciters OR surah list */}
        {!reciter ? (
          <div className="mt-8">
            <div className="mb-4 flex items-center gap-3 px-1">
              <Landmark className="size-4" style={{ color: "#c9a24a" }} />
              <h2 className="text-lg font-bold text-white/85">{t("quranReciters")}</h2>
              <span className="text-xs text-white/35">· {RECITERS.length}</span>
            </div>
            <p className="mb-5 px-1 text-xs text-white/40">{t("quranTapReciter")}</p>
            <div className="relative mb-4" dir="rtl">
              <Search className="absolute end-3.5 top-1/2 size-4 -translate-y-1/2 text-white/35" />
              <input
                value={rq}
                onChange={(e) => setRq(e.target.value)}
                placeholder="ابحث عن قارئ…"
                className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pe-10 ps-4 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#c9a24a]/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {RECITERS.filter((r) => !rq.trim() || r.name.includes(rq.trim()) || r.latin.toLowerCase().includes(rq.trim().toLowerCase())).map((r, i) => (
                <motion.button
                  key={r.code}
                  initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.4) }}
                  whileHover={{ y: -4 }}
                  onClick={() => { setReciter(r); setQ(""); }}
                  className="group flex flex-col items-center rounded-2xl border p-5 text-center transition-colors"
                  style={{ borderColor: r.isEgyptian ? "rgba(201,162,74,0.4)" : "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}
                >
                  <Medallion reciter={r} />
                  <p className="mt-4 text-[15px] font-bold leading-tight text-white/90" style={{ fontFamily: "'Amiri','Scheherazade New','Traditional Arabic',serif" }}>{r.name}</p>
                  <p className="mt-0.5 text-[11px] text-white/40">{r.latin}</p>
                  <span
                    className="mt-2 rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                    style={r.isEgyptian ? { background: "rgba(201,162,74,0.18)", color: "#e6c877" } : { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}
                  >
                    {r.isEgyptian ? "🇪🇬 " : ""}{r.countryAr}
                  </span>
                  <div className="mt-2 flex flex-wrap justify-center gap-1">
                    {r.sources.map((src) => (
                      <span key={src.source + src.bitrate} className="rounded-full px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide" style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.55)" }}>
                        {QURAN_SOURCES[src.source].label} · {src.bitrate}k
                      </span>
                    ))}
                  </div>
                  <span className="mt-3 flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#c9a24a" }}>
                    {t("quranSelectReciter")} <ChevronRight className="size-3.5 rtl:rotate-180" />
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8">
            {/* selected reciter header */}
            <div className="flex items-center gap-4 rounded-2xl border p-4" style={{ borderColor: "rgba(201,162,74,0.3)", background: "rgba(255,255,255,0.02)" }} dir="rtl">
              <button onClick={() => { setReciter(null); }} className="grid size-10 shrink-0 place-items-center rounded-full border border-white/15 text-white/70 transition-colors hover:bg-white/10" title="Back">
                <ArrowLeft className="size-5 rtl:rotate-180" />
              </button>
              <Medallion reciter={reciter} size={72} />
              <div className="min-w-0 flex-1 text-right" style={{ fontFamily: "'Amiri','Scheherazade New','Traditional Arabic',serif" }}>
                <p className="truncate text-xl font-bold" style={{ color: "#f3e6c4" }}>{reciter.name}</p>
                <p className="truncate text-xs text-white/45">{reciter.latin} · {reciter.countryAr} · {reciter.style}</p>
              </div>
            </div>

            {/* quality + source control */}
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-2" style={{ borderColor: "rgba(201,162,74,0.25)", background: "rgba(255,255,255,0.02)" }} dir="rtl">
              <span className="text-[11px] font-bold" style={{ color: "#c9a24a" }}>جودة التحميل</span>
              {(["low", "medium", "high"] as const).map((qq) => (
                <button
                  key={qq}
                  onClick={() => setQuality(qq)}
                  className="rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors"
                  style={quality === qq ? { background: "#c9a24a", color: "#0a1a12" } : { background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.65)" }}
                >
                  {qq === "low" ? "64 kbps" : qq === "medium" ? "128 kbps" : "أعلى جودة"}
                </button>
              ))}
              <span className="ms-auto text-[10px] text-white/40">المصادر: {reciter.sources.map((x) => QURAN_SOURCES[x.source].label).join(" · ")}</span>
            </div>

            {/* sacred notice */}
            <div className="mt-4 flex items-start gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: "rgba(201,162,74,0.35)", background: "rgba(201,162,74,0.07)" }} dir="rtl">
              <ShieldCheck className="mt-0.5 size-5 shrink-0" style={{ color: "#c9a24a" }} />
              <div className="text-right">
                <p className="text-sm font-bold" style={{ color: "#e6c877" }}>{t("quranClipBlockedTitle")}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-white/55">{t("quranClipBlocked")}</p>
              </div>
            </div>

            {/* search */}
            <div className="relative mt-5" dir="rtl">
              <Search className="absolute end-3.5 top-1/2 size-4 -translate-y-1/2 text-white/35" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("quranSearchSurah")}
                className="w-full rounded-xl border border-white/10 bg-black/30 py-3 pe-11 ps-4 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#c9a24a]/50"
              />
            </div>

            {/* surah list */}
            <div ref={listRef} className="mt-4 flex flex-col gap-2">
              {surahs.map((s) => {
                const isNow = now?.surah.n === s.n && now?.reciter.code === reciter.code;
                return (
                  <div
                    key={s.n}
                    className={cn("flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors", isNow ? "border-[#c9a24a]/50" : "border-white/[0.06]")}
                    style={{ background: isNow ? "rgba(201,162,74,0.08)" : "rgba(255,255,255,0.02)" }}
                  >
                    <button onClick={() => play(reciter, s)} className="grid size-11 shrink-0 place-items-center rounded-full transition-transform hover:scale-105" style={{ background: isNow ? "#c9a24a" : "rgba(201,162,74,0.16)", color: isNow ? "#0a1a12" : "#c9a24a" }} aria-label={t("quranListen")}>
                      {isNow && isPlaying ? <Pause className="size-5" style={{ fill: "#0a1a12" }} /> : <Play className="ms-0.5 size-5" style={{ fill: isNow ? "#0a1a12" : "#c9a24a" }} />}
                    </button>
                    <div className="min-w-0 flex-1 text-right" dir="rtl" style={{ fontFamily: "'Amiri','Scheherazade New','Traditional Arabic',serif" }}>
                      <p className="truncate text-lg font-bold leading-tight" style={{ color: isNow ? "#f3e6c4" : "#e9e2cf" }}>سورة {s.ar}</p>
                      <p className="truncate text-[11px] text-white/45" style={{ fontFamily: "inherit" }}>{s.en} · {s.a} {t("quranAyahs")} · <span style={{ color: "#c9a24a" }}>{s.r === "Meccan" ? t("quranMeccan") : t("quranMedinan")}</span></p>
                    </div>
                    <span className="hidden shrink-0 font-mono text-sm text-white/30 sm:block">{String(s.n).padStart(3, "0")}</span>
                    <button onClick={() => void dl(reciter, s)} className="grid size-10 shrink-0 place-items-center rounded-full border border-white/12 text-white/60 transition-colors hover:bg-white/5 hover:text-[#c9a24a]" title={t("quranDownloadFull")} aria-label={t("quranDownloadFull")}>
                      {downloading === s.n ? <Loader2 className="size-[18px] animate-spin" /> : <Download className="size-[18px]" />}
                    </button>
                  </div>
                );
              })}
              {surahs.length === 0 && <p className="py-8 text-center text-sm text-white/40">—</p>}
            </div>
          </motion.div>
        )}

        <p className="mt-10 text-center text-[11px] text-white/25">
          {RECITERS.filter((r) => r.isEgyptian).length} {t("quranEgypt")} · {RECITERS.length - RECITERS.filter((r) => r.isEgyptian).length} {t("quranSaudi")}+ · {SURAHS.length} {t("quranSurahs")}
        </p>
      </div>
    </div>
  );
}
