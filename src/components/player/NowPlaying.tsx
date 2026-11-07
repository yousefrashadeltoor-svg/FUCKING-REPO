"use client";

// ============================================================================
//  Now Playing — a full-screen, immersive view of the current track.
//  Big rotating disc, waveform scrub, transport, volume, lyrics / EQ / info,
//  download (all formats + clip) and share. Opened from the playbar.
// ============================================================================
import { useState } from "react";
import {
  X, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Volume2, VolumeX,
  Heart, Mic2, SlidersHorizontal, Info, Download, Share2, ListPlus, Music2, ArrowLeft,
} from "lucide-react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "framer-motion";
import { toast } from "sonner";
import { cn, formatTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { usePlayerStore } from "@/stores/player-store";
import { togglePlayNow } from "@/lib/player-actions";
import { useUIStore } from "@/stores/ui-store";
import { shareTrack } from "@/lib/share";
import { downloadUrl, getSurah, reciterByCode } from "@/lib/server/quran";
import { enqueueTrack, useDownloadStore } from "@/stores/download-store";
import { ProgressSlider } from "./ProgressSlider";
import { EqualizerPanel } from "./EqualizerPanel";
import { DownloadMenu } from "./DownloadMenu";
import { BrandIcon } from "@/components/brand/BrandIcon";

export function NowPlaying() {
  const t = useT();
  const open = useUIStore((s) => s.nowPlayingOpen);
  const setOpen = useUIStore((s) => s.setNowPlaying);
  const setRightPanel = useUIStore((s) => s.setRightPanel);

  const track = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const positionSec = usePlayerStore((s) => s.positionSec);
  const durationSec = usePlayerStore((s) => s.durationSec);
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const likedIds = usePlayerStore((s) => s.likedIds);
  const next = usePlayerStore((s) => s.next);
  const prev = usePlayerStore((s) => s.prev);
  const seek = usePlayerStore((s) => s.seek);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const setShuffle = usePlayerStore((s) => s.setShuffle);
  const setRepeat = usePlayerStore((s) => s.setRepeat);
  const toggleLike = usePlayerStore((s) => s.toggleLike);

  const [eqOpen, setEqOpen] = useState(false);
  const [dlOpen, setDlOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const dragY = useMotionValue(0);
  const dragScale = useTransform(dragY, [0, 220], [1, 0.86]);
  const dragRadius = useTransform(dragY, [0, 180], [0, 30]);

  if (!open || !track) return null;
  const liked = likedIds.includes(track.id);
  const dur = durationSec || track.durationSec || 0;
  const isQuran = track.source === "quran";
  const quranParts = isQuran && track.sourceId ? track.sourceId.split(":") : null;
  const downloadQuran = () => {
    if (!quranParts) return;
    const [nStr, code] = quranParts;
    void fetch(downloadUrl(Number(nStr), code)).then((r) => r.blob()).then((blob) => {
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `AlQuran-${nStr}-${code}.mp3`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 6000);
      toast.success(`${t("quranDownloadFull")} · ${(blob.size / 1e6).toFixed(1)} MB`);
    }).catch((e) => toast.error(`${t("dlFailed")}: ${(e as Error).message}`));
  };
  const enqueue = () => {
    if (isQuran && quranParts) {
      const [nStr, code] = quranParts;
      useDownloadStore.getState().add({ title: track.title, artist: track.artistName, cover: null, kind: "quran", preset: "mp3", url: downloadUrl(Number(nStr), code), filename: `AlQuran-${nStr}-${code}.mp3` });
    } else {
      enqueueTrack(track, "mp3-320");
    }
    toast(t("addBatch"));
  };

  const onLike = () => {
    toggleLike(track.id);
    if (track.id > 0) void fetch("/api/likes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId: track.id }) }).catch(() => {});
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex flex-col overflow-hidden"
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.55 }}
      dragMomentum={false}
      onDragEnd={(_, info) => {
        if (info.offset.y > 145 || info.velocity.y > 850) {
          setOpen(false);
          dragY.set(0);
        } else {
          void animate(dragY, 0, { type: "spring", stiffness: 420, damping: 36 });
        }
      }}
      style={{
        y: dragY,
        scale: dragScale,
        borderRadius: dragRadius,
        transformOrigin: "top center",
        background: "radial-gradient(80% 60% at 50% 0%, var(--dynamic-glow, rgba(29,185,84,0.18)), #050507 70%)",
        touchAction: "pan-x",
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(60% 40% at 50% 20%, var(--dynamic-glow, transparent), transparent 70%)" }} />

      {/* top bar */}
      <div className="relative flex items-center justify-between p-4">
        <button onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-full bg-white/5 text-white/70 hover:bg-white/10" aria-label="Back">
          <ArrowLeft className="size-5 rtl:rotate-180" />
        </button>
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">{t("nowPlayingBig")}</p>
          {track.albumTitle && <p className="text-xs text-white/50">{track.albumTitle}</p>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setInfoOpen(true)} className="grid size-11 place-items-center rounded-full bg-white/5 text-white/60 hover:bg-white/10" aria-label={t("info")}><Info className="size-5" /></button>
        </div>
      </div>

      {/* disc */}
      <div className="relative flex flex-1 items-center justify-center px-6">
        <motion.div
          animate={isPlaying ? { rotate: 360 } : { rotate: 0 }}
          transition={isPlaying ? { repeat: Infinity, duration: 22, ease: "linear" } : { duration: 0.5 }}
          className="relative grid aspect-square w-full max-w-[360px] place-items-center rounded-full"
          style={{ background: "conic-gradient(from 0deg, #111, #1c1c1c, #111, #1c1c1c, #111)", boxShadow: "0 30px 80px rgba(0,0,0,0.7), inset 0 0 40px rgba(0,0,0,0.8)" }}
        >
          {track.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={track.coverUrl} alt="" className="size-[82%] rounded-full object-cover" />
          ) : (
            <Music2 className="size-16 text-white/30" />
          )}
          <span className="absolute size-6 rounded-full bg-black ring-4 ring-white/10" />
        </motion.div>
      </div>

      {/* meta + controls */}
      <div className="relative px-6 pb-6 md:px-10">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-xl font-black tracking-tight md:text-2xl">
              {track.title}
              {["youtube", "spotify", "applemusic", "deezer", "audius", "soundcloud", "archive", "jamendo", "bandcamp", "dailymotion", "odysee"].includes(track.source) && (
                <BrandIcon name={track.source} color="brand" className="size-4 shrink-0" />
              )}
            </p>
            <p className="truncate text-sm text-white/50">{track.artistName}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button onClick={onLike} className={cn("grid size-11 place-items-center rounded-full bg-white/5 hover:bg-white/10", liked ? "text-rose" : "text-white/60")} aria-label={t("like")}>
              <Heart className={cn("size-5", liked && "fill-rose")} />
            </button>
            <button onClick={enqueue} className="grid size-11 place-items-center rounded-full bg-white/5 text-white/60 hover:bg-white/10" aria-label={t("addBatch")}><ListPlus className="size-5" /></button>
            <button onClick={() => (isQuran ? downloadQuran() : setDlOpen((v) => !v))} className="grid size-11 place-items-center rounded-full bg-white/5 text-white/60 hover:bg-white/10" aria-label={t("download")}><Download className="size-5" /></button>
            <button onClick={() => void shareTrack(track).then((r) => r === "copied" && toast.success(t("copied")))} className="grid size-11 place-items-center rounded-full bg-white/5 text-white/60 hover:bg-white/10" aria-label={t("share")}><Share2 className="size-5" /></button>
          </div>
        </div>

        {/* scrub */}
        <div className="flex items-center gap-3">
          <span className="w-11 text-end font-mono text-[11px] text-white/40">{formatTime(positionSec)}</span>
          <ProgressSlider waveform={track.waveform} durationSec={dur} className="flex-1" />
          <span className="w-11 font-mono text-[11px] text-white/40">{formatTime(dur)}</span>
        </div>

        {/* transport + volume */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex w-28 items-center gap-2">
            <button onClick={toggleMute} className="text-white/55 hover:text-white" aria-label={t("mute")}>{muted || volume === 0 ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}</button>
            <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume} onChange={(e) => setVolume(Number(e.target.value))} className="aura-range flex-1" style={{ ["--fill" as string]: `${(muted ? 0 : volume) * 100}%` }} aria-label={t("volume")} />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShuffle(!shuffle)} className={cn("grid size-11 place-items-center rounded-full hover:bg-white/10", shuffle ? "text-[#1DB954]" : "text-white/55")} aria-label={t("shuffle")}><Shuffle className="size-5" /></button>
            <button onClick={prev} className="grid size-12 place-items-center rounded-full bg-white/5 text-white hover:bg-white/10" aria-label={t("previous")}><SkipBack className="size-6" style={{ fill: "white" }} /></button>
            <button onClick={togglePlayNow} className="grid size-16 place-items-center rounded-full bg-white text-black shadow-xl transition-transform hover:scale-105" aria-label={isPlaying ? t("pause") : t("play")}>
              <AnimatePresence mode="wait" initial={false}>
                {isPlaying ? <motion.span key="p" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}><Pause className="size-7" style={{ fill: "#000" }} /></motion.span>
                  : <motion.span key="p" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}><Play className="ms-1 size-7" style={{ fill: "#000" }} /></motion.span>}
              </AnimatePresence>
            </button>
            <button onClick={next} className="grid size-12 place-items-center rounded-full bg-white/5 text-white hover:bg-white/10" aria-label={t("next")}><SkipForward className="size-6" style={{ fill: "white" }} /></button>
            <button onClick={() => setRepeat(repeat)} className={cn("relative grid size-11 place-items-center rounded-full hover:bg-white/10", repeat !== "off" ? "text-[#1DB954]" : "text-white/55")} aria-label={t("repeat")}>
              {repeat === "one" ? <Repeat1 className="size-5" /> : <Repeat className="size-5" />}
            </button>
          </div>
          <div className="flex w-28 items-center justify-end gap-1.5">
            <button onClick={() => { setRightPanel(true, "lyrics"); }} className={cn("grid size-10 place-items-center rounded-full hover:bg-white/10", "text-white/55")} aria-label={t("lyrics")}><Mic2 className="size-5" /></button>
            <div className="relative">
              <button onClick={() => { setEqOpen((v) => !v); setDlOpen(false); }} className={cn("grid size-10 place-items-center rounded-full hover:bg-white/10", eqOpen ? "bg-white/10 text-white" : "text-white/55")} aria-label={t("equalizer")}><SlidersHorizontal className="size-5" /></button>
              {eqOpen && <div className="absolute bottom-12 end-0 z-10"><EqualizerPanel onClose={() => setEqOpen(false)} /></div>}
            </div>
          </div>
        </div>

        {/* popovers */}
        <AnimatePresence>
          {dlOpen && track && (
            <div className="fixed inset-0 z-10 grid place-items-center bg-black/60 p-3 backdrop-blur-sm" onClick={() => setDlOpen(false)}>
              <div onClick={(e) => e.stopPropagation()}><DownloadMenu track={track} onClose={() => setDlOpen(false)} /></div>
            </div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {infoOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4 backdrop-blur-xl"
            onClick={() => setInfoOpen(false)}
          >
            <motion.section
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 360, damping: 30 }}
              onClick={(event) => event.stopPropagation()}
              className="max-h-[82vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-[#101014]/95 p-5 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-label={t("info")}
            >
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">DON MUSE</p>
                  <h2 className="mt-1 text-xl font-bold text-white">{t("info")}</h2>
                </div>
                <button onClick={() => setInfoOpen(false)} className="grid size-10 place-items-center rounded-full bg-white/10 text-white/75 hover:bg-white/15" aria-label="Close">
                  <X className="size-5" />
                </button>
              </div>
              <div className="flex items-center gap-4 border-b border-white/10 pb-5">
                {track.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={track.coverUrl} alt="" className="size-16 rounded-xl object-cover" />
                ) : (
                  <div className="grid size-16 place-items-center rounded-xl bg-white/10"><Music2 className="size-7 text-white/50" /></div>
                )}
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">{track.title}</p>
                  <p className="truncate text-sm text-white/55">{track.artistName}</p>
                  {track.albumTitle && <p className="truncate text-xs text-white/35">{track.albumTitle}</p>}
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                {[
                  ["Source", track.source],
                  ["Duration", formatTime(track.durationSec || dur)],
                  ["Year", track.year ? String(track.year) : "—"],
                  ["Genre", track.genre || "—"],
                  ["Language", track.language || "—"],
                  ["Format", track.codec || (track.lossless ? "Lossless" : "—")],
                  ["Source ID", track.sourceId || "—"],
                  ["Track ID", String(track.id)],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 rounded-xl bg-white/[0.045] p-3">
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-white/35">{label}</dt>
                    <dd className="mt-1 break-words text-sm text-white/85">{value}</dd>
                  </div>
                ))}
              </dl>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
