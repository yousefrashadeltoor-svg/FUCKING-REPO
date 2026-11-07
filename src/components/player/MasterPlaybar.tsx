"use client";

// ============================================================================
//  MasterPlaybar — iOS-style floating player.
//  Top: full-width draggable progress slider (waveform + knob + tooltip).
//  Row: [art · title · like] [transport] [volume · download · more].
//  The "more" (•••) menu holds Lyrics / Equalizer / Queue / Info /
//  Sleep timer / Speed — keeping the bar clean and uncluttered.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  Volume2,
  VolumeX,
  MoonStar,
  BadgeCheck,
  AudioWaveform,
  Download,
  MoreHorizontal,
  Share2,
  Inbox,
  Maximize2,
  Square,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn, formatTime } from "@/lib/utils";
import { usePlayerStore } from "@/stores/player-store";
import { useDownloadStore } from "@/stores/download-store";
import { useUIStore } from "@/stores/ui-store";
import { clearNow, stopNow, togglePlayNow } from "@/lib/player-actions";
import { ProgressSlider } from "./ProgressSlider";
import { EqualizerPanel } from "./EqualizerPanel";
import { DownloadMenu } from "./DownloadMenu";
import { MoreMenu } from "./MoreMenu";
import { BrandIcon } from "@/components/brand/BrandIcon";
import { shareTrack } from "@/lib/share";
import { useT } from "@/lib/i18n";

export function MasterPlaybar() {
  const t = useT();
  const track = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const positionSec = usePlayerStore((s) => s.positionSec);
  const durationSec = usePlayerStore((s) => s.durationSec);
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const likedIds = usePlayerStore((s) => s.likedIds);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const sleepTimerEndsAt = usePlayerStore((s) => s.sleepTimerEndsAt);

  const next = usePlayerStore((s) => s.next);
  const prev = usePlayerStore((s) => s.prev);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const dlItems = useDownloadStore((s) => s.items);
  const dlActive = dlItems.filter((i) => i.status === "queued" || i.status === "working").length;
  const dlDone = dlItems.filter((i) => i.status === "done").length;
  const toggleNowPlaying = useUIStore((s) => s.toggleNowPlaying);
  const setShuffle = usePlayerStore((s) => s.setShuffle);
  const setRepeat = usePlayerStore((s) => s.setRepeat);
  const toggleLike = usePlayerStore((s) => s.toggleLike);
  const setSleepTimer = usePlayerStore((s) => s.setSleepTimer);


  const [moreOpen, setMoreOpen] = useState(false);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [eqOpen, setEqOpen] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  const liked = track ? likedIds.includes(track.id) : false;

  useEffect(() => {
    if (!sleepTimerEndsAt) {
      setRemaining(null);
      return;
    }
    const iv = setInterval(() => {
      const ms = sleepTimerEndsAt - Date.now();
      setRemaining(ms > 0 ? ms : null);
      if (ms <= 0) setSleepTimer(null);
    }, 1000);
    return () => clearInterval(iv);
  }, [sleepTimerEndsAt, setSleepTimer]);

  const onLike = () => {
    if (!track) return;
    toggleLike(track.id);
    void fetch("/api/likes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: track.id }),
    }).catch(() => {});
    toast(liked ? "Removed from Liked Tracks" : "Added to Liked Tracks", {
      icon: <Heart className={cn("size-4", !liked && "fill-rose text-rose")} />,
    });
  };

  const iconBtn = (
    onClick: () => void,
    Icon: typeof Shuffle,
    label: string,
    active = false,
    extra?: React.ReactNode,
  ) => (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "relative grid size-9 shrink-0 place-items-center rounded-full transition-all hover:bg-white/10",
        active ? "text-white" : "text-white/55 hover:text-white",
      )}
    >
      <Icon className="size-[18px]" />
      {extra}
    </button>
  );

  return (
    <footer className="glass-player relative z-30 shrink-0 rounded-2xl px-3 pb-2 pt-1 sm:px-4">
      {/* progress slider — full width, draggable (always LTR: time flows left→right) */}
      <div className="flex items-center gap-2" dir="ltr">
        <span className="w-10 shrink-0 text-right font-mono text-[10.5px] text-white/40">
          {track?.source === "radio" ? "" : formatTime(positionSec)}
        </span>
        {track?.source === "radio" ? (
          <div className="flex h-8 flex-1 items-center gap-2 px-1">
            <span className="flex items-center gap-1.5 rounded-full bg-rose/20 px-2 py-0.5 text-[10px] font-black tracking-widest text-rose">
              <span className="size-1.5 animate-pulse rounded-full bg-rose" /> {t("live")}
            </span>
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
              <span className="block h-full w-1/3 animate-marquee rounded-full bg-gradient-to-r from-transparent via-rose to-transparent" />
            </span>
            <span className="font-mono text-[10px] text-white/40">{formatTime(positionSec)}</span>
          </div>
        ) : (
          <ProgressSlider
            waveform={track?.waveform ?? []}
            durationSec={durationSec || track?.durationSec || 0}
            className="flex-1"
          />
        )}
        <span className="w-10 shrink-0 font-mono text-[10.5px] text-white/40">
          {track?.source === "radio" ? "" : formatTime(durationSec || track?.durationSec || 0)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* left: now playing */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <AnimatePresence mode="popLayout">
            {track && (
              <motion.div
                key={track.id}
                initial={{ opacity: 0, scale: 0.8, rotate: -8 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
                onDoubleClick={toggleNowPlaying}
                className="relative shrink-0 cursor-pointer"
              >
                {track.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={track.coverUrl}
                    alt={track.albumTitle ?? track.title}
                    className={cn("size-11 rounded-lg object-cover shadow-lg sm:size-12", isPlaying && "animate-pulse-glow")}
                  />
                ) : (
                  <div className="grid size-11 place-items-center rounded-lg bg-white/10 sm:size-12">
                    <AudioWaveform className="size-5 text-white/60" />
                  </div>
                )}
                {track.lossless && (
                  <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-gold text-black shadow">
                    <BadgeCheck className="size-3" />
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          {track && (
            <button onClick={toggleNowPlaying} className="hidden size-8 shrink-0 place-items-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white sm:grid" title={t("expand")} aria-label={t("expand")}>
              <Maximize2 className="size-4" />
            </button>
          )}
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-white">
              {track ? (
                track.albumId ? (
                  <Link href={`/albums/${track.albumId}`} className="truncate hover:underline">
                    {track.title}
                  </Link>
                ) : (
                  <span className="truncate">{track.title}</span>
                )
              ) : (
                <span className="text-white/35">{t("nothingPlaying")}</span>
              )}
              {track && ["youtube", "spotify", "applemusic", "deezer", "audius", "soundcloud", "archive", "jamendo", "bandcamp", "dailymotion", "odysee"].includes(track.source) && (
                <BrandIcon name={["spotify", "applemusic", "deezer"].includes(track.codec) ? track.codec : track.source} color="brand" className="size-3.5 shrink-0" />
              )}
              {track?.source === "radio" && (
                <span className="shrink-0 rounded bg-rose/90 px-1 py-px text-[8px] font-black text-white">{t("live")}</span>
              )}

            </p>
            <p className="truncate text-[11px] text-white/45">
              {track ? (
                <Link href={`/artists/${track.artistId}`} className="hover:text-white/80 hover:underline">
                  {track.artistName}
                </Link>
              ) : (
                t("pickTrack")
              )}
            </p>
          </div>
          {track && (
            <button
              onClick={clearNow}
              title="Clear current track"
              aria-label="Clear current track"
              className="grid size-7 shrink-0 place-items-center rounded-full text-white/35 transition-colors hover:bg-rose/15 hover:text-rose"
            >
              <X className="size-3.5" />
            </button>
          )}
          {track && (
            <motion.button
              whileTap={{ scale: 0.75 }}
              onClick={onLike}
              title={liked ? "Unlike" : "Like (L)"}
              aria-label="Like"
              className="ml-0.5 shrink-0"
            >
              <Heart
                className={cn(
                  "size-[17px] transition-all",
                  liked ? "fill-rose text-rose drop-shadow-[0_0_8px_rgba(250,45,85,0.7)]" : "text-white/45 hover:text-white",
                )}
              />
            </motion.button>
          )}
        </div>

        {/* center: transport (LTR so ⏮ ▶ ⏭ keep their conventional order) */}
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1" dir="ltr">
          <span className="hidden md:block">
            {iconBtn(() => setShuffle(!shuffle), Shuffle, "Shuffle (S)", shuffle)}
          </span>
          {iconBtn(prev, SkipBack, "Previous (Shift+←)")}
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={togglePlayNow}
            disabled={!track}
            aria-label={isPlaying ? "Pause (Space)" : "Play (Space)"}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-black shadow-lg shadow-white/10 transition-transform hover:scale-105 disabled:opacity-40 sm:size-11"
          >
            <AnimatePresence mode="wait" initial={false}>
              {isPlaying ? (
                <motion.span key="pause" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.15 }}>
                  <Pause className="size-5 fill-black" />
                </motion.span>
              ) : (
                <motion.span key="play" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.15 }}>
                  <Play className="ml-0.5 size-5 fill-black" />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
          {iconBtn(next, SkipForward, "Next (Shift+→)")}
          {(track?.source === "radio" || track?.source === "quran") && (
            <button onClick={() => { stopNow(); }} title={t("stopRec")} aria-label="Stop" className="grid size-9 place-items-center rounded-full bg-rose/15 text-rose transition-colors hover:bg-rose/25">
              <Square className="size-4 fill-rose" />
            </button>
          )}
          <span className="hidden md:block">
            {iconBtn(
              () => setRepeat(repeat),
              repeat === "one" ? Repeat1 : Repeat,
              "Repeat (R)",
              repeat !== "off",
              repeat === "one" && <span className="absolute -bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-white" />,
            )}
          </span>
        </div>

        {/* right: volume + download + more */}
        <div className="flex shrink-0 items-center gap-0.5">
          {usePlayerStore.getState().repeatCount > 0 && (
            <span className="mr-1 hidden rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-[#1DB954] sm:block">×{usePlayerStore.getState().repeatCount + 1}</span>
          )}
          {playbackRate !== 1 && (
            <span className="mr-1 hidden rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-cyan sm:block">
              {playbackRate.toFixed(2)}×
            </span>
          )}
          {remaining !== null && (
            <span className="mr-1 hidden items-center gap-1 rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-amber sm:flex">
              <MoonStar className="size-3" />
              {formatTime(remaining / 1000)}
            </span>
          )}
          <div className="hidden w-24 items-center gap-2 md:flex" dir="ltr">
            <button
              onClick={toggleMute}
              title={muted ? "Unmute (M)" : "Mute (M)"}
              aria-label="Mute"
              className="text-white/50 hover:text-white"
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
              className="aura-range w-full"
              style={{ ["--fill" as string]: `${(muted ? 0 : volume) * 100}%` }}
              aria-label="Volume"
            />
          </div>

          {/* downloads center */}
          <Link href="/downloads" title={t("downloads")} aria-label={t("downloads")} className="relative grid size-9 place-items-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white">
            <Inbox className="size-[18px]" />
            {dlActive > 0 && <span className="absolute -end-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-[#1DB954] px-1 font-mono text-[9px] font-bold text-black">{dlActive}</span>}
            {dlActive === 0 && dlDone > 0 && <span className="absolute -end-0.5 -top-0.5 size-2 rounded-full bg-white/50" />}
          </Link>

          {/* share */}
          <button
            onClick={() => track && void shareTrack(track).then((r) => r === "copied" && toast.success(t("copied")))}
            disabled={!track || track.source === "radio"}
            title={t("share")}
            aria-label={t("share")}
            className="grid size-9 place-items-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <Share2 className="size-[18px]" />
          </button>

          {/* download */}
          <div className="relative">
            <button
              onClick={() => {
                setDownloadOpen((v) => !v);
                setMoreOpen(false);
                setEqOpen(false);
              }}
              disabled={!track || track.source === "radio"}
              title={t("download")}
              aria-label={t("download")}
              className={cn(
                "grid size-9 place-items-center rounded-full transition-colors disabled:opacity-40",
                downloadOpen ? "bg-white/15 text-white" : "text-white/55 hover:bg-white/10 hover:text-white",
              )}
            >
              <Download className="size-[18px]" />
            </button>
            {downloadOpen && track && (
              <div
                className="fixed inset-x-2 bottom-24 z-[70] mx-auto w-fit max-w-[calc(100vw-16px)] sm:absolute sm:inset-x-auto sm:bottom-12 sm:end-0 sm:mx-0"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <DownloadMenu key={track.id} track={track} onClose={() => setDownloadOpen(false)} />
              </div>
            )}
          </div>

          {/* more menu (portal, viewport-clamped — never clipped in RTL) */}
          <button
            ref={moreBtnRef}
            onClick={() => {
              setMoreOpen((v) => !v);
              setDownloadOpen(false);
              setEqOpen(false);
            }}
            title={t("more")}
            aria-label={t("more")}
            className={cn(
              "grid size-9 place-items-center rounded-full transition-colors",
              moreOpen ? "bg-white/15 text-white" : "text-white/55 hover:bg-white/10 hover:text-white",
            )}
          >
            <MoreHorizontal className="size-[18px]" />
          </button>
          <MoreMenu anchor={moreBtnRef.current} open={moreOpen} onClose={() => setMoreOpen(false)} onOpenEq={() => setEqOpen(true)} />

          {/* EQ panel */}
          {eqOpen && (
            <div className="fixed inset-x-2 bottom-24 z-[70] mx-auto w-fit max-w-[calc(100vw-16px)] sm:absolute sm:inset-x-auto sm:bottom-12 sm:end-0 sm:mx-0" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
              <EqualizerPanel onClose={() => setEqOpen(false)} />
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
