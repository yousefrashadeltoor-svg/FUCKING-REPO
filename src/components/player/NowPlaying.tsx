"use client";

// ============================================================================
//  NowPlaying — the expanded player.
//  ---------------------------------------------------------------------------
//  • Interactive drag-to-dismiss/shrink: the whole surface follows your finger
//    (1:1 pointer tracking), the sheet scales & rounds progressively and snaps
//    back when you release early — the gesture used by modern music players.
//  • Info sheet lives in its own layer ABOVE this one (it used to render
//    behind the page and could not be used).
//  • Every control is visible, colour-coded and wired to the engine.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Heart,
  Mic2,
  ListMusic,
  SlidersHorizontal,
  Info,
  Download,
  Share2,
  Music2,
  ChevronDown,
  Gauge,
  Loader2,
  Radio,
  BookOpen,
} from "lucide-react";
import { AnimatePresence, motion, useMotionValue, animate as fmAnimate } from "framer-motion";
import { toast } from "sonner";
import { cn, formatTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { usePlayerStore } from "@/stores/player-store";
import { useUIStore } from "@/stores/ui-store";
import { useSettingsStore } from "@/stores/settings-store";
import { nextNow, prevNow, seekNow, stopAllNow, toggleNow } from "@/lib/audio/controller";
import { shareTrack } from "@/lib/share";
import { downloadUrl } from "@/lib/server/quran";
import { enqueueTrack, useDownloadStore } from "@/stores/download-store";
import { ProgressSlider } from "./ProgressSlider";
import { EqualizerPanel } from "./EqualizerPanel";
import { DownloadMenu } from "./DownloadMenu";
import { BrandIcon } from "@/components/brand/BrandIcon";
import { QueuePanel } from "@/components/panel/QueuePanel";
import { exitPlayerMode, enterPlayerMode } from "@/lib/ui/anim";

/* -------------------------------------------------------------------------- */
/*  Control button — always full-contrast, coloured when active               */
/* -------------------------------------------------------------------------- */

function Ctrl({
  icon: Icon,
  label,
  onClick,
  active,
  activeClass = "text-[var(--app-accent)]",
  size = "md",
  fill,
  disabled,
}: {
  icon: typeof Play;
  label: string;
  onClick: () => void;
  active?: boolean;
  activeClass?: string;
  size?: "sm" | "md" | "lg";
  fill?: boolean;
  disabled?: boolean;
}) {
  const dims = size === "lg" ? "size-16" : size === "sm" ? "size-11" : "size-12";
  const iconSize = size === "lg" ? "size-7" : size === "sm" ? "size-[18px]" : "size-5";
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "relative grid place-items-center rounded-full transition-colors disabled:opacity-35",
        dims,
        size === "lg"
          ? "bg-[var(--app-text)] text-[var(--app-bg)] shadow-[0_10px_40px_-8px_rgba(255,255,255,0.45)]"
          : active
            ? cn("bg-white/[0.14]", activeClass)
            : "text-[color:var(--app-text)] hover:bg-white/10",
      )}
    >
      <Icon className={cn(iconSize, fill && "fill-current")} strokeWidth={2.1} />
    </motion.button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Drag handle wrapper                                                       */
/* -------------------------------------------------------------------------- */

export function NowPlaying() {
  const t = useT();
  const open = useUIStore((s) => s.nowPlayingOpen);
  const setOpen = useUIStore((s) => s.setNowPlaying);
  const setInfoSheet = useUIStore((s) => s.setInfoSheet);

  const track = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const buffering = usePlayerStore((s) => s.buffering);
  const positionSec = usePlayerStore((s) => s.positionSec);
  const durationSec = usePlayerStore((s) => s.durationSec);
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const likedIds = usePlayerStore((s) => s.likedIds);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const setShuffle = usePlayerStore((s) => s.setShuffle);
  const setRepeat = usePlayerStore((s) => s.setRepeat);
  const toggleLike = usePlayerStore((s) => s.toggleLike);
  const haptics = useSettingsStore((s) => s.hapticsOnTap);

  const [eqOpen, setEqOpen] = useState(false);
  const [dlOpen, setDlOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);

  // ---- interactive drag state (follows the finger, no fixed animation) ----
  const dragY = useMotionValue(0);
  const dragScale = useMotionValue(1);
  const dragOpacity = useMotionValue(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (open) enterPlayerMode();
    else exitPlayerMode();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !eqOpen && !dlOpen && !queueOpen) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, eqOpen, dlOpen, queueOpen, setOpen]);

  const close = useCallback(() => setOpen(false), [setOpen]);
  closeRef.current = close;

  const applyDrag = useCallback(
    (dy: number, h: number) => {
      const d = Math.max(0, dy);
      const progress = Math.min(1, d / Math.max(120, h * 0.6));
      dragY.set(d);
      dragScale.set(1 - progress * 0.14);
      dragOpacity.set(1 - progress * 0.45);
    },
    [dragY, dragScale, dragOpacity],
  );

  const settle = useCallback(
    (dy: number, vy: number, h: number) => {
      const shouldClose = dy > h * 0.22 || vy > 900;
      if (shouldClose) {
        if (haptics) void import("@/lib/platform/native").then((m) => m.vibrate(10));
        fmAnimate(dragY, h, { duration: 0.22, ease: [0.4, 0, 1, 1] });
        fmAnimate(dragScale, 0.82, { duration: 0.22 });
        fmAnimate(dragOpacity, 0, { duration: 0.22 }).then(() => {
          dragY.set(0);
          dragScale.set(1);
          dragOpacity.set(1);
          closeRef.current();
        });
      } else {
        fmAnimate(dragY, 0, { type: "spring", stiffness: 420, damping: 38 });
        fmAnimate(dragScale, 1, { type: "spring", stiffness: 420, damping: 38 });
        fmAnimate(dragOpacity, 1, { type: "spring", stiffness: 420, damping: 38 });
      }
    },
    [dragY, dragScale, dragOpacity, haptics],
  );

  if (!open || !track) return null;

  const liked = likedIds.includes(track.id);
  const dur = durationSec || track.durationSec || 0;
  const isQuran = track.source === "quran";
  const quranParts = isQuran && track.sourceId ? track.sourceId.split(":") : null;

  const onLike = () => {
    toggleLike(track.id);
    if (track.id > 0) {
      void fetch("/api/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id }),
      }).catch(() => {});
    }
  };

  const enqueue = () => {
    if (isQuran && quranParts) {
      const [nStr, code] = quranParts;
      useDownloadStore.getState().add({
        title: track.title,
        artist: track.artistName,
        cover: null,
        kind: "quran",
        preset: "mp3",
        url: downloadUrl(Number(nStr), code),
        filename: `AlQuran-${nStr}-${code}.mp3`,
      });
    } else {
      enqueueTrack(track, "mp3-320");
    }
    toast(t("addBatch"));
  };

  return (
    <>
      <motion.div
        ref={containerRef}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 34 }}
        style={{ y: dragY, scale: dragScale, opacity: dragOpacity, originY: 0 }}
        className="fixed inset-0 z-[70] flex flex-col overflow-hidden will-change-transform"
      >
        {/* ambient background built from the cover colours */}
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(90% 55% at 50% -8%, var(--dynamic-glow, rgba(29,185,84,0.28)), transparent 62%), radial-gradient(70% 60% at 100% 105%, color-mix(in srgb, var(--dynamic-secondary,#4e54c8) 32%, transparent), transparent 70%), var(--app-bg, #05060a)",
          }}
        />
        {track.coverUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={track.coverUrl}
              alt=""
              aria-hidden
              className="absolute inset-0 -z-10 size-full scale-125 object-cover opacity-25 blur-3xl saturate-150"
            />
          </>
        )}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-black/25" />

        {/* ---------------- drag zone + top bar ---------------- */}
        <motion.div
          drag="y"
          dragDirectionLock
          dragElastic={{ top: 0, bottom: 0.9 }}
          dragMomentum={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          onDrag={(_, info) => {
            const h = containerRef.current?.clientHeight ?? window.innerHeight;
            applyDrag(info.offset.y, h);
          }}
          onDragEnd={(_, info) => {
            const h = containerRef.current?.clientHeight ?? window.innerHeight;
            settle(info.offset.y, info.velocity.y, h);
          }}
          className="relative z-10 cursor-grab touch-none active:cursor-grabbing"
        >
          <div className="mx-auto mt-2 h-1.5 w-11 rounded-full bg-white/35" />
          <div className="flex items-start justify-between px-4 pb-1 pt-2">
            <button
              onClick={close}
              aria-label={t("dragDownToClose")}
              className="grid size-11 place-items-center rounded-full bg-white/[0.08] text-white/85 backdrop-blur-md transition-colors hover:bg-white/15"
            >
              <ChevronDown className="size-6" />
            </button>
            <div className="min-w-0 flex-1 px-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/55">{t("nowPlayingBig")}</p>
              <p className="truncate text-[12px] font-medium text-white/80">
                {track.albumTitle ?? (isQuran ? t("quran") : t("nowPlaying"))}
              </p>
            </div>
            <button
              onClick={() => setInfoSheet(true)}
              aria-label={t("info")}
              title={t("info")}
              className="grid size-11 place-items-center rounded-full bg-white/[0.08] text-white/85 backdrop-blur-md transition-colors hover:bg-white/15"
            >
              <Info className="size-5" />
            </button>
          </div>
        </motion.div>

        {/* ---------------- artwork ---------------- */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center px-7">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 26 }}
            className="relative aspect-square w-full max-w-[min(78vw,360px)]"
          >
            <div
              className="absolute -inset-6 -z-10 rounded-[3rem] opacity-70 blur-3xl"
              style={{ background: "var(--dynamic-glow, rgba(29,185,84,0.4))" }}
            />
            <motion.div
              animate={isPlaying ? { rotate: 360 } : {}}
              transition={isPlaying ? { repeat: Infinity, duration: 26, ease: "linear" } : { duration: 0.4 }}
              className="size-full overflow-hidden rounded-[2rem] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)] ring-1 ring-white/15"
              style={{ borderRadius: isPlaying ? undefined : "2rem" }}
            >
              {track.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={track.coverUrl} alt={track.title} className="size-full object-cover" draggable={false} />
              ) : (
                <div className="grid size-full place-items-center bg-gradient-to-br from-white/15 to-white/5">
                  {isQuran ? <BookOpen className="size-24 text-[#e7c96b]" /> : <Music2 className="size-24 text-white/40" />}
                </div>
              )}
            </motion.div>
            {buffering && isPlaying && (
              <div className="absolute inset-0 grid place-items-center rounded-[2rem] bg-black/35 backdrop-blur-sm">
                <Loader2 className="size-9 animate-spin text-white" />
              </div>
            )}
          </motion.div>
        </div>

        {/* ---------------- meta ---------------- */}
        <div className="relative px-5 pb-1 pt-3 sm:px-8">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-[20px] font-black leading-tight tracking-tight text-white">
                <span className="truncate">{track.title}</span>
                {["youtube", "spotify", "applemusic", "deezer", "audius", "soundcloud", "archive"].includes(track.source) && (
                  <BrandIcon name={track.source} color="brand" className="size-4 shrink-0" />
                )}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13.5px] text-white/65">
                {isQuran && <BookOpen className="size-3.5 text-[#e7c96b]" />}
                {track.source === "radio" && <Radio className="size-3.5 text-rose" />}
                <span className="truncate">{track.artistName}</span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={onLike}
                aria-label={t("like")}
                className={cn(
                  "grid size-11 place-items-center rounded-full bg-white/[0.08] transition-colors hover:bg-white/15",
                  liked ? "text-rose" : "text-white/80",
                )}
              >
                <Heart className={cn("size-[20px]", liked && "fill-rose")} />
              </button>
              <button
                onClick={() => setQueueOpen(true)}
                aria-label={t("queue")}
                className="grid size-11 place-items-center rounded-full bg-white/[0.08] text-white/80 transition-colors hover:bg-white/15"
              >
                <ListMusic className="size-[20px]" />
              </button>
            </div>
          </div>

          {/* scrub */}
          <div className="mt-4 flex items-center gap-3" dir="ltr">
            <span className="w-10 shrink-0 text-right font-mono text-[11px] text-white/55">{formatTime(positionSec)}</span>
            <ProgressSlider waveform={track.waveform} durationSec={dur} className="flex-1" />
            <span className="w-10 shrink-0 font-mono text-[11px] text-white/55">{formatTime(dur)}</span>
          </div>

          {/* transport */}
          <div className="mt-3 flex items-center justify-between" dir="ltr">
            <Ctrl
              icon={Shuffle}
              label={t("shuffle")}
              onClick={() => setShuffle(!shuffle)}
              active={shuffle}
              activeClass="text-emerald-300"
              size="sm"
            />
            <Ctrl icon={SkipBack} label={t("previous")} onClick={prevNow} fill size="md" />
            <Ctrl
              icon={isPlaying ? Pause : Play}
              label={isPlaying ? t("pause") : t("play")}
              onClick={toggleNow}
              fill
              size="lg"
            />
            <Ctrl icon={SkipForward} label={t("next")} onClick={nextNow} fill size="md" />
            <Ctrl
              icon={repeat === "one" ? Repeat1 : Repeat}
              label={t("repeat")}
              onClick={() => setRepeat(repeat)}
              active={repeat !== "off"}
              activeClass="text-emerald-300"
              size="sm"
            />
          </div>

          {/* secondary row — volume · eq · speed · download · share · close */}
          <div className="mt-3 flex items-center gap-1.5 pb-5">
            <button
              onClick={toggleMute}
              aria-label={t("mute")}
              className="grid size-9 shrink-0 place-items-center rounded-full text-white/75 hover:bg-white/10 hover:text-white"
            >
              {muted || volume === 0 ? <VolumeX className="size-[18px]" /> : <Volume2 className="size-[18px]" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="aura-range min-w-0 flex-1"
              style={{ ["--fill" as string]: `${(muted ? 0 : volume) * 100}%` }}
              aria-label={t("volume")}
              dir="ltr"
            />
            <button
              onClick={() => setEqOpen(true)}
              aria-label={t("equalizer")}
              title={t("equalizer")}
              className="grid size-9 place-items-center rounded-full text-cyan-300 hover:bg-white/10"
            >
              <SlidersHorizontal className="size-[18px]" />
            </button>
            <button
              onClick={() => { setOpen(false); setInfoSheet(true); }}
              aria-label={t("info")}
              title={t("info")}
              className="grid size-9 place-items-center rounded-full text-violet-300 hover:bg-white/10"
            >
              <Gauge className="size-[18px]" />
            </button>
            <button
              onClick={() => setDlOpen((v) => !v)}
              aria-label={t("download")}
              title={t("download")}
              className="grid size-9 place-items-center rounded-full text-emerald-300 hover:bg-white/10"
            >
              <Download className="size-[18px]" />
            </button>
            <button
              onClick={() => void shareTrack(track).then((r) => r === "copied" && toast.success(t("copied")))}
              aria-label={t("share")}
              title={t("share")}
              className="grid size-9 place-items-center rounded-full text-amber-300 hover:bg-white/10"
            >
              <Share2 className="size-[18px]" />
            </button>
            <button
              onClick={() => setOpen(false)}
              aria-label={t("miniPlayer")}
              title={t("miniPlayer")}
              className="grid size-9 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
            >
              <X className="size-[18px]" />
            </button>
          </div>
        </div>

        {/* popovers */}
        <AnimatePresence>
          {eqOpen && (
            <div className="absolute inset-x-0 bottom-6 z-30 flex justify-center px-3" onClick={() => setEqOpen(false)}>
              <div onClick={(e) => e.stopPropagation()}>
                <EqualizerPanel onClose={() => setEqOpen(false)} />
              </div>
            </div>
          )}
          {dlOpen && (
            <div className="absolute inset-x-0 bottom-6 z-30 flex justify-center px-3" onClick={() => setDlOpen(false)}>
              <div onClick={(e) => e.stopPropagation()}>
                <DownloadMenu track={track} onClose={() => setDlOpen(false)} />
              </div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* queue sheet (above the player) */}
      <AnimatePresence>
        {queueOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[78] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
            onClick={() => setQueueOpen(false)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-modal h-[70vh] w-full max-w-lg overflow-hidden rounded-t-3xl sm:rounded-3xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <p className="text-sm font-bold">{t("queue")}</p>
                <button onClick={() => setQueueOpen(false)} className="text-white/60 hover:text-white" aria-label={t("closeAll")}>
                  <X className="size-5" />
                </button>
              </div>
              <div className="h-[calc(70vh-52px)]">
                <QueuePanel />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
