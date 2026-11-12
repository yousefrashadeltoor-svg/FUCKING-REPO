import { localFetch } from "@/lib/local/client";

// ============================================================================
//  Live Radio — real stations from Radio-Browser. Egyptian stations first,
//  ranked by listeners; then the world's most-listened. Low-data MP3/AAC.
//  Includes the Radio Recorder (visual clip selection + tagged download).
// ============================================================================
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { links, shareUrl } from "@/lib/share";
import { Search, Radio as RadioIcon, Users, Play, Pause, Signal, Share2 } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { cn, formatCount } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { usePlayerStore } from "@/stores/player-store";
import { playTrackNow, togglePlayNow } from "@/lib/player-actions";
import { RadioRecorder } from "@/components/radio/RadioRecorder";
import type { RadioStationDTO } from "@/lib/types";
import { stationToTrack } from "@/lib/radio-track";
import { MyClips } from "@/components/radio/MyClips";
import { BookmarkCheck } from "lucide-react";

const TAGS = ["quran", "arabic", "pop", "news", "jazz", "classical", "oriental", "talk", "rock", "electronic", "sports", "chillout", "80s", "lounge"];



export default function RadioPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-white/40">…</div>}>
      <RadioPageInner />
    </Suspense>
  );
}

function RadioPageInner() {
  const t = useT();
  const params = useSearchParams();
  const deepStation = params.get("station");
  const deepHandled = useRef(false);
  const playRef = useRef<(station: RadioStationDTO) => void>(() => {});
  const [clipsTick, setClipsTick] = useState(0);
  const [egypt, setEgypt] = useState<RadioStationDTO[]>([]);
  const [arabic, setArabic] = useState<RadioStationDTO[]>([]);
  const [quran, setQuran] = useState<RadioStationDTO[]>([]);
  const [culture, setCulture] = useState<RadioStationDTO[]>([]);
  const [world, setWorld] = useState<RadioStationDTO[]>([]);
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [error, setError] = useState<string | null>(null);
  const current = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : tag ? `?tag=${encodeURIComponent(tag)}` : "";
    const timer = setTimeout(() => {
      void localFetch(`/api/radio${params}`)
        .then((r) => r.json())
        .then((d: { egypt: RadioStationDTO[]; arabic?: RadioStationDTO[]; quran?: RadioStationDTO[]; culture?: RadioStationDTO[]; world: RadioStationDTO[]; error?: string }) => {
          setEgypt(d.egypt ?? []);
          setArabic(d.arabic ?? []);
          setQuran(d.quran ?? []);
          setCulture(d.culture ?? []);
          setWorld(d.world ?? []);
          if (d.error) setError(d.error);
          setLoading(false);
          if (deepStation && !deepHandled.current) {
            deepHandled.current = true;
            const all = [...(d.egypt ?? []), ...(d.arabic ?? []), ...(d.quran ?? []), ...(d.culture ?? []), ...(d.world ?? [])];
            const st = all.find((x) => x.id === deepStation);
            if (st) {
              setTimeout(() => {
                document.getElementById(`station-${st.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
              }, 150);
              toast(`${st.name}`, { description: t("listenLive"), action: { label: "▶", onClick: () => playRef.current(st) } });
            } else {
              // not in the lists → fetch by uuid
              void localFetch(`/api/radio?uuid=${encodeURIComponent(deepStation)}`).then((r) => r.json()).then((dd: { egypt: RadioStationDTO[]; world: RadioStationDTO[] }) => {
                const found = [...(dd.egypt ?? []), ...(dd.world ?? [])][0];
                if (found) toast(found.name, { description: t("listenLive"), action: { label: "▶", onClick: () => playRef.current(found) } });
              }).catch(() => {});
            }
          }
        })
        .catch(() => {
          setError("Radio directory unavailable");
          setLoading(false);
        });
    }, q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [q, tag, deepStation, t]);

  const currentStation = useMemo(() => {
    if (!current || current.source !== "radio") return null;
    return [...egypt, ...arabic, ...quran, ...culture, ...world].find((s) => s.id === current.sourceId) ?? null;
  }, [current, egypt, arabic, quran, culture, world]);

  const playStation = (s: RadioStationDTO) => {
    const track = stationToTrack(s);
    if (current?.id === track.id) {
      togglePlayNow();
      return;
    }
    playTrackNow(track);
    toast(`${t("listenLive")}: ${s.name}`, { description: `${s.country} · ${s.codec} ${s.bitrate ? s.bitrate + " kbps" : ""}` });
  };
  playRef.current = playStation;

  const Card = ({ s, rank }: { s: RadioStationDTO; rank: number }) => {
    const active = current?.source === "radio" && current.sourceId === s.id;
    return (
      <motion.button
        id={`station-${s.id}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(rank * 0.02, 0.3) }}
        onClick={() => playStation(s)}
        className={cn(
          "group relative flex items-center gap-3 rounded-2xl border p-3 text-start transition-all hover:bg-white/[0.07]",
          active ? "border-[#1DB954]/60 bg-[#1DB954]/10" : "border-white/[0.06] bg-white/[0.03]",
        )}
      >
        <span className="relative shrink-0">
          <img
            src={s.coverUrl}
            alt=""
            loading="lazy"
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = `https://picsum.photos/seed/${encodeURIComponent(s.id)}/200/200`; }}
            className="size-14 rounded-xl bg-white/5 object-cover"
          />
          <span className={cn("absolute -bottom-1 -end-1 grid size-6 place-items-center rounded-full text-black shadow", active ? "bg-[#1DB954]" : "bg-white opacity-0 transition-opacity group-hover:opacity-100")}>
            {active && isPlaying ? <Pause className="size-3 fill-black" /> : <Play className="ms-0.5 size-3 fill-black" />}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13.5px] font-bold">{s.name}</span>
            {rank < 3 && <span className="shrink-0 rounded bg-gold/20 px-1 text-[9px] font-black text-gold">#{rank + 1}</span>}
          </span>
          <span className="block truncate text-[11px] text-white/45">{s.description || s.country}</span>
          <span className="mt-1 flex items-center gap-2 font-mono text-[10px] text-white/40">
            <span className="flex items-center gap-1"><Users className="size-3" />{formatCount(s.listeners)}</span>
            <span className="flex items-center gap-1"><Signal className="size-3" />{s.codec || "MP3"}{s.bitrate ? ` ${s.bitrate}k` : ""}</span>
            <span className="truncate">{s.countryCode}</span>
          </span>
        </span>
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); void shareUrl(links.station(s.id), s.name).then((r) => r === "copied" && toast.success(t("copied"))); }}
          className="grid size-8 shrink-0 place-items-center rounded-full text-white/30 opacity-0 transition-opacity hover:bg-white/10 hover:text-white group-hover:opacity-100"
          title={t("share")}
        >
          <Share2 className="size-3.5" />
        </span>
        {active && (
          <span className="flex shrink-0 items-end gap-[2px]">
            {[0, 1, 2].map((b) => (
              <span key={b} className="w-[3px] animate-pulse rounded-full bg-[#1DB954]" style={{ height: `${8 + b * 4}px`, animationDelay: `${b * 0.15}s` }} />
            ))}
          </span>
        )}
      </motion.button>
    );
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 px-1 text-3xl font-black tracking-tight">
            <RadioIcon className="size-7 text-[#1DB954]" /> {t("radioTitle")}
          </h1>
          <p className="mt-1 px-1 text-sm text-white/40">{t("radioSub")}</p>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-white/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchStations")}
            className="w-full rounded-full border border-white/10 bg-white/[0.06] py-2.5 pe-4 ps-10 text-sm outline-none placeholder:text-white/35 focus:border-white/25"
          />
        </div>
      </div>

      {/* tags */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        <button onClick={() => { setTag(""); setQ(""); }} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", !tag && !q ? "border-[#1DB954] bg-[#1DB954]/15 text-[#1DB954]" : "border-white/10 text-white/50 hover:bg-white/8")}>
          {t("allSources")}
        </button>
        {TAGS.map((tg) => (
          <button key={tg} onClick={() => { setTag(tg); setQ(""); }} className={cn("rounded-full border px-3 py-1 text-xs font-semibold capitalize", tag === tg ? "border-[#1DB954] bg-[#1DB954]/15 text-[#1DB954]" : "border-white/10 text-white/50 hover:bg-white/8")}>
            {tg}
          </button>
        ))}
      </div>

      {/* now on air + recorder */}
      <div className="mt-5 grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="glass-panel rounded-2xl p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">{t("nowOnAir")}</p>
          {currentStation ? (
            <div className="flex items-center gap-3">
              <img src={currentStation.coverUrl} alt="" className="size-16 rounded-xl bg-white/5 object-cover" />
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate text-sm font-bold">
                  <span className="size-2 animate-pulse rounded-full bg-rose" /> {currentStation.name}
                </p>
                <p className="truncate text-xs text-white/45">{currentStation.country} · {currentStation.codec} {currentStation.bitrate ? `${currentStation.bitrate} kbps` : ""}</p>
                <p className="font-mono text-[10px] text-white/35">{formatCount(currentStation.listeners)} {t("listeners")}</p>
              </div>
              <button onClick={() => void shareUrl(links.station(currentStation.id), currentStation.name).then((r) => r === "copied" && toast.success(t("copied")))} className="ms-auto grid size-9 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/15" title={t("share")}><Share2 className="size-4" /></button>
            </div>
          ) : (
            <p className="text-sm text-white/40">{t("playStationFirst")}</p>
          )}
        </div>
        <RadioRecorder station={currentStation} streamUrl={currentStation ? `/api/radio/stream?u=${encodeURIComponent(currentStation.streamUrl)}` : null} onClipsChange={() => setClipsTick((x) => x + 1)} />
      </div>

      {/* My Clips — saved radio clips (come back later) */}
      <div className="mt-6">
        <div className="mb-3 flex items-center gap-2 px-1">
          <BookmarkCheck className="size-4 text-[#1DB954]" />
          <h2 className="text-lg font-bold text-white/85">{t("myClips")}</h2>
          <span className="text-xs text-white/35">· {t("myClipsSub")}</span>
        </div>
        <MyClips key={clipsTick} />
      </div>

      {error && <p className="mt-4 rounded-xl bg-amber/10 px-4 py-2 text-xs text-amber">{error}</p>}

      {loading ? (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => <div key={i} className="skeleton h-20" />)}
        </div>
      ) : (
        <>
          {(
            [
              { id: "egypt", title: `🇪🇬 ${t("egyptStations")}`, list: egypt },
              { id: "arabic", title: `🕌 ${t("arabicStations")}`, list: arabic },
              { id: "quran", title: `📿 ${t("quranStations")}`, list: quran },
              { id: "culture", title: `🎭 ${t("cultureStations")}`, list: culture },
              { id: "world", title: `🌍 ${t("worldStations")}`, list: world },
            ] as { id: string; title: string; list: RadioStationDTO[] }[]
          ).map((sec) =>
            sec.list.length === 0 ? null : (
              <section key={sec.id} className="mt-7">
                <div className="mb-3 flex items-end justify-between px-1">
                  <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
                    {sec.title} <span className="text-sm font-medium text-white/35">· {sec.list.length}</span>
                  </h2>
                  {sec.list.length > 12 && (
                    <button onClick={() => setShowAll((s) => ({ ...s, [sec.id]: !s[sec.id] }))} className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-white/60 hover:bg-white/8 hover:text-white">
                      {showAll[sec.id] ? "−" : `+${sec.list.length - 12}`}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {(showAll[sec.id] ? sec.list : sec.list.slice(0, 12)).map((s, i) => <Card key={s.id} s={s} rank={sec.id === "egypt" ? i : i + 100} />)}
                </div>
              </section>
            ),
          )}
          {egypt.length + arabic.length + quran.length + culture.length + world.length === 0 && (
            <p className="mt-8 text-center text-sm text-white/40">{t("noResults")} “{q || tag}”.</p>
          )}
        </>
      )}
    </div>
  );
}
