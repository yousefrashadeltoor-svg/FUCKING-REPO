"use client";

// Auto-rotating hero carousel for the home page top section.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Pause, BadgeCheck } from "lucide-react";
import type { TrackDTO } from "@/lib/types";
import { usePlayerStore } from "@/stores/player-store";
import { playQueueNow, togglePlayNow } from "@/lib/player-actions";
import { formatCount } from "@/lib/utils";

export function HeroCarousel({ tracks }: { tracks: TrackDTO[] }) {
  const [i, setI] = useState(0);
  const currentId = usePlayerStore((s) => s.currentTrack?.id);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  useEffect(() => {
    if (tracks.length < 2) return;
    const iv = setInterval(() => setI((v) => (v + 1) % tracks.length), 6000);
    return () => clearInterval(iv);
  }, [tracks.length]);

  if (tracks.length === 0) return null;
  const t = tracks[i % tracks.length];
  const active = t.id === currentId;

  return (
    <div className="relative h-[300px] overflow-hidden rounded-2xl md:h-[340px]">
      <AnimatePresence mode="wait">
        <motion.div
          key={t.id}
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="absolute inset-0"
        >
          {t.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/10" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />
        </motion.div>
      </AnimatePresence>

      <div className="absolute bottom-0 left-0 max-w-xl p-6 md:p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white/70">
              <span className="rounded bg-[#1DB954] px-1.5 py-0.5 text-black">Trending #{(i % tracks.length) + 1}</span>
              {t.genre}
              {t.lossless && (
                <span className="flex items-center gap-1 text-gold">
                  <BadgeCheck className="size-3.5" /> Lossless
                </span>
              )}
            </p>
            <h1 className="text-3xl font-black leading-[1.02] tracking-tight text-white md:text-5xl">{t.title}</h1>
            <p className="mt-2 text-sm font-medium text-white/75 md:text-base">
              {t.artistName} · {t.albumTitle ?? "Single"} · {formatCount(t.playCount)} plays
            </p>
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => (active ? togglePlayNow() : playQueueNow(tracks, i % tracks.length))}
                className="flex items-center gap-2 rounded-full bg-[#1DB954] px-6 py-3 text-sm font-bold text-black shadow-xl shadow-[#1DB954]/25 transition-transform hover:scale-105 active:scale-95"
              >
                {active && isPlaying ? <Pause className="size-4 fill-black" /> : <Play className="size-4 fill-black" />}
                {active && isPlaying ? "Pause" : "Play"}
              </button>
              <span className="font-mono text-xs text-white/60">
                {Math.round(t.bpm)} BPM · {t.key ?? "—"} · {Math.round(t.energy * 100)}% energy
              </span>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* dots */}
      <div className="absolute bottom-5 right-6 flex gap-1.5">
        {tracks.map((tr, idx) => (
          <button
            key={tr.id}
            onClick={() => setI(idx)}
            aria-label={`Slide ${idx + 1}`}
            className={`h-1.5 rounded-full transition-all ${idx === i % tracks.length ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70"}`}
          />
        ))}
      </div>
    </div>
  );
}
