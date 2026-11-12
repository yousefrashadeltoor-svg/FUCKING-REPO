
// Large, readable local-library hero. No invented trend ranks or play counts.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Pause, BadgeCheck } from "lucide-react";
import type { TrackDTO } from "@/lib/types";
import { usePlayerStore } from "@/stores/player-store";
import { useSettingsStore } from "@/stores/settings-store";
import { playQueueNow, togglePlayNow } from "@/lib/player-actions";
import { formatTime } from "@/lib/utils";

export function HeroCarousel({ tracks }: { tracks: TrackDTO[] }) {
  const [i, setI] = useState(0);
  const currentId = usePlayerStore(s => s.currentTrack?.id);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const reduced = useSettingsStore(s => s.reducedEffects);
  useEffect(() => {
    if (tracks.length < 2 || reduced) return;
    const iv = setInterval(() => setI(v => (v + 1) % tracks.length), 7000);
    return () => clearInterval(iv);
  }, [tracks.length, reduced]);
  if (!tracks.length) return null;
  const index = i % tracks.length; const t = tracks[index]; const active = t.id === currentId;
  return <div className="relative h-[360px] overflow-hidden rounded-3xl md:h-[440px]">
    <AnimatePresence mode="wait"><motion.div key={t.id} initial={{ opacity:0, scale:reduced?1:1.04 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0 }} transition={{ duration:reduced?0:.65 }} className="absolute inset-0">
      {t.coverUrl && <img src={t.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/10" /><div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />
    </motion.div></AnimatePresence>
    <div className="absolute inset-x-0 bottom-0 max-w-3xl p-6 pb-14 md:p-10 md:pb-14">
      <p className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold text-white/75"><span className="rounded-md bg-[var(--app-accent)] px-2 py-1 text-black">من مكتبتك</span>{t.genre}{t.lossless && <span className="flex items-center gap-1 text-amber-300"><BadgeCheck className="size-4" />Lossless</span>}</p>
      <h1 className="line-clamp-2 text-4xl font-black leading-tight tracking-tight text-white md:text-6xl">{t.title}</h1>
      <p className="mt-3 truncate text-base font-medium text-white/80 md:text-lg">{t.artistName}{t.albumTitle ? ` · ${t.albumTitle}` : ""}</p>
      <div className="mt-6 flex flex-wrap items-center gap-4"><button onClick={() => active ? togglePlayNow() : playQueueNow(tracks,index)} className="flex min-h-12 items-center gap-2 rounded-full bg-[var(--app-accent)] px-7 py-3.5 text-base font-bold text-black shadow-xl transition-transform hover:scale-105 active:scale-95">{active && isPlaying ? <Pause className="size-5 fill-black" /> : <Play className="size-5 fill-black" />}{active && isPlaying ? "إيقاف مؤقت" : "تشغيل"}</button>{t.durationSec > 0 && <span className="font-mono text-sm text-white/70">{formatTime(t.durationSec)}{t.year > 0 ? ` · ${t.year}` : ""}</span>}</div>
    </div>
    <div className="absolute bottom-3 end-5 flex gap-1">{tracks.map((tr,idx)=><button key={tr.id} onClick={()=>setI(idx)} aria-label={`المقطع ${idx+1}`} aria-current={idx===index?"true":undefined} className="grid size-8 place-items-center"><span className={`h-2 rounded-full transition-all ${idx===index?"w-7 bg-white":"w-2 bg-white/45 hover:bg-white/75"}`}/></button>)}</div>
  </div>;
}
