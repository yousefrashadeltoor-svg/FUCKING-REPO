"use client";

// ============================================================================
//  MasterPlaybar — the single floating player bar (web + Android).
//  Every control is wired to the real engine through the controller, so the
//  bar, the full-screen player, the notification and the widgets can never
//  drift apart.
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
  AudioWaveform,
  Download,
  MoreHorizontal,
  Share2,
  Maximize2,
  X,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn, formatTime } from "@/lib/utils";
import { usePlayerStore } from "@/stores/player-store";
import { useUIStore } from "@/stores/ui-store";
import { useSettingsStore } from "@/stores/settings-store";
import { nextNow, prevNow, stopAllNow, toggleNow, describeSource } from "@/lib/audio/controller";
import { ProgressSlider } from "./ProgressSlider";
import { EqualizerPanel } from "./EqualizerPanel";
import { DownloadMenu } from "./DownloadMenu";
import { MoreMenu } from "./MoreMenu";
import { BrandIcon } from "@/components/brand/BrandIcon";
import { shareTrack } from "@/lib/share";
import { useT } from "@/lib/i18n";
import { vibrate } from "@/lib/platform/native";

const BRAND_SOURCES = [
  "youtube",
  "spotify",
  "applemusic",
  "deezer",
  "audius",
  "soundcloud",
  "archive",
  "jamendo",
  "bandcamp",
  "dailymotion",
  "odysee",
] as const;

export function MasterPlaybar() {
  const t = useT();
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
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const sleepTimerEndsAt = usePlayerStore((s) => s.sleepTimerEndsAt);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const setShuffle = usePlayerStore((s) => s.setShuffle);
  const setRepeat = usePlayerStore((s) => s.setRepeat);
  const toggleLike = usePlayerStore((s) => s.toggleLike);
  const setSleepTimer = usePlayerStore((s) => s.setSleepTimer);
  const toggleNowPlaying = useUIStore((s) => s.toggleNowPlaying);
  const haptics = useSettingsStore((s) => s.hapticsOnTap);

  const [moreOpen, setMoreOpen] = useState(false);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [eqOpen, setEqOpen] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  const liked = track ? likedIds.includes(track.id) : false;
  const isLive = track?.source === "radio";
  const dur = durationSec || track?.durationSec || 0;

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

  const tap = (fn: () => void) => () => {
    if (haptics) vibrate(8);
    fn();
  };

  const onLike = () => {
    if (!track) return;
    toggleLike(track.id);
    if (track.id > 0) {
      void fetch("/api/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id }),
      }).catch(() => {});
    }
    toast(liked ? t("removedFromLikes") : t("addedToLikes"));
  };

  return (
    <footer className="glass-player relative z-30 shrink-0 rounded-2xl px-2.5 pb-2 pt-1.5 sm:px-4">
      {/* progress — time flows left→right in every language */}
      <div className="flex items-center gap-2" dir="ltr">
        <span className="w-9 shrink-0 text-right font-mono text-[10.5px] text-[color:var(--app-muted)]">
          {isLive ? "" : formatTime(positionSec)}
        </span>
        {isLive ? (
          <div className="flex h-7 flex-1 items-center gap-2 px-1">
            <span className="flex items-center gap-1.5 rounded-full bg-rose/20 px-2 py-0.5 text-[10px] font-black tracking-widest text-rose">
              <span className="size-1.5 animate-pulse rounded-full bg-rose" /> {t("live")}
            </span>
            <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/10">
              <span className="absolute inset-y-0 w-1/3 animate-marquee rounded-full bg-gradient-to-r from-transparent via-rose to-transparent" />
            </span>
          </div>
        ) : (
          <ProgressSlider waveform={track?.waveform ?? []} durationSec={dur} className="flex-1" />
        )}
        <span className="w-9 shrink-0 font-mono text-[10.5px] text-[color:var(--app-muted)]">
          {isLive ? "" : formatTime(dur)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* ---------------- now playing (left) ---------------- */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <AnimatePresence mode="popLayout" initial={false}>
            {track ? (
              <motion.button
                key={track.id + (track.sourceId ?? "")}
                initial={{ opacity: 0, scale: 0.82, rotate: -6 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.82 }}
                transition={{ type: "spring", stiffness: 320, damping: 24 }}
                onClick={tap(toggleNowPlaying)}
                className="relative shrink-0"
                aria-label={t("expand")}
              >
                {track.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={track.coverUrl} alt="" className="size-11 rounded-xl object-cover shadow-lg sm:size-12" />
                ) : (
                  <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-white/15 to-white/5 sm:size-12">
                    <AudioWaveform className="size-5 text-white/70" />
                  </span>
                )}
                {isPlaying && (
                  <span className="absolute inset-0 rounded-xl ring-2 ring-[var(--app-accent)]/40" />
                )}
              </motion.button>
            ) : (
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/[0.06] sm:size-12">
                <AudioWaveform className="size-5 text-white/30" />
              </span>
            )}
          </AnimatePresence>

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-[color:var(--app-text)]">
              {track ? (
                track.albumId && track.source !== "local" ? (
                  <Link href={`/albums/${track.albumId}`} className="truncate hover:underline">
                    {track.title}
                  </Link>
                ) : (
                  <span className="truncate">{track.title}</span>
                )
              ) : (
                <span className="text-[color:var(--app-muted)]">{t("nothingPlaying")}</span>
              )}
              {track && (BRAND_SOURCES as readonly string[]).includes(track.source) && (
                <BrandIcon
                  name={(["spotify", "applemusic", "deezer"].includes(track.codec) ? track.codec : track.source) as string}
                  color="brand"
                  className="size-3.5 shrink-0"
                />
              )}
              {track?.source === "local" && (
                <span className="shrink-0 rounded bg-emerald-500/20 px-1 py-px text-[8px] font-black text-emerald-300">DEVICE</span>
              )}
              {track?.source === "quran" && (
                <span className="shrink-0 rounded bg-[#d4af37]/20 px-1 py-px text-[8px] font-black text-[#e7c96b]">قرآن</span>
              )}
            </p>
            <p className="truncate text-[11px] text-[color:var(--app-muted)]">
              {track ? (
                track.source === "local" ? (
                  <span>{track.artistName}</span>
                ) : (
                  <Link href={`/artists/${track.artistId}`} className="hover:text-white hover:underline">
                    {track.artistName}
                  </Link>
                )
              ) : (
                t("pickTrack")
              )}
              {track && (
                <span className="opacity-60"> · {describeSource(track)}</span>
              )}
            </p>
          </div>

          {track && track.id > 0 && (
            <motion.button whileTap={{ scale: 0.8 }} onClick={onLike} aria-label={t("like")} className="shrink-0">
              <Heart
                className={cn(
                  "size-[17px] transition-all",
                  liked
                    ? "fill-rose text-rose drop-shadow-[0_0_8px_rgba(250,45,85,0.7)]"
                    : "text-[color:var(--app-muted)] hover:text-[color:var(--app-text)]",
                )}
              />
            </motion.button>
          )}

          {track && (
            <button
              onClick={tap(toggleNowPlaying)}
              title={t("expand")}
              aria-label={t("expand")}
              className="hidden size-8 shrink-0 place-items-center rounded-lg text-[color:var(--app-muted)] hover:bg-white/10 hover:text-[color:var(--app-text)] sm:grid"
            >
              <Maximize2 className="size-4" />
            </button>
          )}
        </div>

        {/* ---------------- transport ---------------- */}
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5" dir="ltr">
          <button
            onClick={tap(() => setShuffle(!shuffle))}
            title={t("shuffle")}
            aria-label={t("shuffle")}
            className={cn(
              "hidden size-9 place-items-center rounded-full transition-all md:grid",
              shuffle ? "text-[var(--app-accent)]" : "text-[color:var(--app-muted)] hover:bg-white/10 hover:text-[color:var(--app-text)]",
            )}
          >
            <Shuffle className="size-[18px]" />
          </button>
          <button
            onClick={tap(prevNow)}
            title={t("previous")}
            aria-label={t("previous")}
            className="grid size-9 place-items-center rounded-full text-[color:var(--app-text)] transition-all hover:bg-white/10"
          >
            <SkipBack className="size-[19px] fill-current" />
          </button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={tap(toggleNow)}
            disabled={!track}
            aria-label={isPlaying ? t("pause") : t("play")}
            className="relative grid size-11 shrink-0 place-items-center rounded-full bg-[var(--app-text)] text-[var(--app-bg)] shadow-lg transition-transform hover:scale-105 disabled:opacity-40"
          >
            {buffering && isPlaying ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                {isPlaying ? (
                  <motion.span key="pause" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.13 }}>
                    <Pause className="size-5 fill-current" />
                  </motion.span>
                ) : (
                  <motion.span key="play" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.13 }}>
                    <Play className="ms-0.5 size-5 fill-current" />
                  </motion.span>
                )}
              </AnimatePresence>
            )}
          </motion.button>
          <button
            onClick={tap(nextNow)}
            title={t("next")}
            aria-label={t("next")}
            className="grid size-9 place-items-center rounded-full text-[color:var(--app-text)] transition-all hover:bg-white/10"
          >
            <SkipForward className="size-[19px] fill-current" />
          </button>
          <button
            onClick={tap(() => setRepeat(repeat))}
            title={t("repeat")}
            aria-label={t("repeat")}
            className={cn(
              "relative hidden size-9 place-items-center rounded-full transition-all md:grid",
              repeat !== "off" ? "text-[var(--app-accent)]" : "text-[color:var(--app-muted)] hover:bg-white/10 hover:text-[color:var(--app-text)]",
            )}
          >
            {repeat === "one" ? <Repeat1 className="size-[18px]" /> : <Repeat className="size-[18px]" />}
            {repeat !== "off" && <span className="absolute -bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-current" />}
          </button>
        </div>

        {/* ---------------- right cluster ---------------- */}
        <div className="flex shrink-0 items-center gap-0.5">
          {remaining !== null && (
            <span className="mr-1 hidden items-center gap-1 rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-amber sm:flex">
              <MoonStar className="size-3" />
              {formatTime(remaining / 1000)}
            </span>
          )}
          {playbackRate !== 1 && (
            <span className="mr-1 hidden rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-cyan sm:block">
              {playbackRate.toFixed(2)}×
            </span>
          )}

          <div className="hidden w-24 items-center gap-2 lg:flex" dir="ltr">
            <button
              onClick={toggleMute}
              title={muted ? t("unmute") : t("mute")}
              aria-label={t("mute")}
              className="text-[color:var(--app-muted)] hover:text-[color:var(--app-text)]"
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
              aria-label={t("volume")}
            />
          </div>

          <div className="relative">
            <button
              onClick={() => {
                setDownloadOpen((v) => !v);
                setMoreOpen(false);
                setEqOpen(false);
              }}
              disabled={!track || isLive}
              title={t("download")}
              aria-label={t("download")}
              className={cn(
                "grid size-9 place-items-center rounded-full transition-colors disabled:opacity-30",
                downloadOpen ? "bg-white/15 text-white" : "text-[color:var(--app-muted)] hover:bg-white/10 hover:text-[color:var(--app-text)]",
              )}
            >
              <Download className="size-[18px]" />
            </button>
            {downloadOpen && track && (
              <div className="fixed inset-x-2 bottom-28 z-[70] mx-auto w-fit max-w-[calc(100vw-16px)] sm:absolute sm:inset-x-auto sm:bottom-12 sm:end-0 sm:mx-0">
                <DownloadMenu key={track.id} track={track} onClose={() => setDownloadOpen(false)} />
              </div>
            )}
          </div>

          <button
            onClick={() => track && void shareTrack(track).then((r) => r === "copied" && toast.success(t("copied")))}
            disabled={!track || isLive}
            title={t("share")}
            aria-label={t("share")}
            className="hidden size-9 place-items-center rounded-full text-[color:var(--app-muted)] transition-colors hover:bg-white/10 hover:text-[color:var(--app-text)] disabled:opacity-30 sm:grid"
          >
            <Share2 className="size-[18px]" />
          </button>

          {/* X — hard stop + clear: kills music, Quran, radio, anything */}
          {track && (
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={tap(() => {
                stopAllNow();
                setDownloadOpen(false);
                setMoreOpen(false);
                setEqOpen(false);
                toast(t("clearPlayer"));
              })}
              title={t("clearPlayer")}
              aria-label={t("clearPlayer")}
              className="group grid size-9 place-items-center rounded-full text-[color:var(--app-muted)] transition-colors hover:bg-rose/15 hover:text-rose"
            >
              <span className="grid size-5 place-items-center rounded-full border border-current/40 transition-colors group-hover:border-rose group-hover:bg-rose/20">
                <X className="size-3" strokeWidth={3} />
              </span>
            </motion.button>
          )}

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
              moreOpen ? "bg-white/15 text-white" : "text-[color:var(--app-muted)] hover:bg-white/10 hover:text-[color:var(--app-text)]",
            )}
          >
            <MoreHorizontal className="size-[18px]" />
          </button>
          <MoreMenu anchor={moreBtnRef.current} open={moreOpen} onClose={() => setMoreOpen(false)} onOpenEq={() => setEqOpen(true)} />

          {eqOpen && (
            <div className="fixed inset-x-2 bottom-28 z-[70] mx-auto w-fit max-w-[calc(100vw-16px)] sm:absolute sm:inset-x-auto sm:bottom-12 sm:end-0 sm:mx-0">
              <EqualizerPanel onClose={() => setEqOpen(false)} />
            </div>
          )}
        </div>
      </div>

      {/* seek helper for keyboard / programmatic use */}
      <span className="sr-only" aria-live="polite">
        {track ? `${track.title} — ${track.artistName}` : ""}
      </span>
    </footer>
  );
}
