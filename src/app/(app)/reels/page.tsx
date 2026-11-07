"use client";

// ============================================================================
//  Reels — TikTok-style feed of real music, rebuilt for reliability:
//  • NO scroll container: exactly one reel is rendered at a time and
//    wheel / swipe / arrow keys / buttons move by ±1 with a spring transition
//    (this removes the "jumps 3-4 reels" and the collapsed-height bugs).
//  • Fixed-height stage (absolute inset-0 inside <main>) — always visible.
//  • Autoplay is gesture-gated: the first reel shows a big "Tap to start"
//    (browsers block audio before a user gesture); after that every reel
//    change autoplays.
//  • Each reel: cover / spinning disc, artist (+ feat.) avatars with
//    platform logo + follow, like · share (deep link) · download/clip,
//    reason tag, progress, prev/next buttons. Engagement is reported back
//    to /api/reels to train the recommendation engine.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Heart, Share2, Scissors, Play, Pause, Volume2, VolumeX, Sparkles, ChevronDown, ChevronUp, Loader2, Music2, BadgeCheck, Film } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { cn, formatCount, formatTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { usePlayerStore } from "@/stores/player-store";
import { playTrackNow, togglePlayNow } from "@/lib/player-actions";
import { getEngine } from "@/lib/audio/engine";
import { BrandIcon } from "@/components/brand/BrandIcon";
import { FollowButton } from "@/components/artists/FollowButton";
import { DownloadMenu } from "@/components/player/DownloadMenu";
import { shareTrack } from "@/lib/share";
import type { ReelDTO } from "@/lib/types";

export default function ReelsPage() {
  const t = useT();
  const params = useSearchParams();
  const startTrackId = Number(params.get("track") ?? 0) || null;

  const [reels, setReels] = useState<ReelDTO[]>([]);
  const [cursor, setCursor] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [started, setStarted] = useState(false); // gesture gate
  const [downloadFor, setDownloadFor] = useState<ReelDTO | null>(null);
  const lockRef = useRef(false);
  const startedAt = useRef<number>(Date.now());
  const stageRef = useRef<HTMLDivElement>(null);

  const current = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const positionSec = usePlayerStore((s) => s.positionSec);
  const likedIds = usePlayerStore((s) => s.likedIds);
  const toggleLike = usePlayerStore((s) => s.toggleLike);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const storeMuted = usePlayerStore((s) => s.muted);

  const report = useCallback((trackId: number, kind: string, watchedSec = 0) => {
    void fetch("/api/reels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId, kind, watchedSec }) }).catch(() => {});
  }, []);

  const load = useCallback(async (c: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reels?cursor=${c}&limit=10${startTrackId && c === 0 ? `&track=${startTrackId}` : ""}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as { reels: ReelDTO[]; nextCursor: number; hasMore: boolean };
      setReels((r) => (c === 0 ? d.reels : [...r, ...d.reels.filter((x) => !r.some((y) => y.track.id === x.track.id))]));
      setCursor(d.nextCursor);
      setHasMore(d.hasMore);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [startTrackId]);

  useEffect(() => {
    void load(0);
  }, [load]);

  // ---- navigation: ±1 only, locked during the transition ----
  const goTo = useCallback((i: number) => {
    if (lockRef.current) return;
    const idx = Math.max(0, Math.min(reels.length - 1, i));
    if (idx === active) return;
    lockRef.current = true;
    setDir(idx > active ? 1 : -1);
    setActive(idx);
    window.setTimeout(() => { lockRef.current = false; }, 450);
  }, [active, reels.length]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let touchY = 0;
    let wheelAcc = 0;
    let wheelTimer: ReturnType<typeof setTimeout> | null = null;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      wheelAcc += e.deltaY;
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => { wheelAcc = 0; }, 180);
      if (Math.abs(wheelAcc) >= 60) {
        goTo(active + (wheelAcc > 0 ? 1 : -1));
        wheelAcc = 0;
      }
    };
    const onTouchStart = (e: TouchEvent) => { touchY = e.touches[0].clientY; };
    const onTouchEnd = (e: TouchEvent) => {
      const dy = touchY - e.changedTouches[0].clientY;
      if (Math.abs(dy) >= 50) goTo(active + (dy > 0 ? 1 : -1));
    };
    const onKey = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === "INPUT" || tg.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === "j") { e.preventDefault(); goTo(active + 1); }
      if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "k") { e.preventDefault(); goTo(active - 1); }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
      if (wheelTimer) clearTimeout(wheelTimer);
    };
  }, [active, goTo]);

  // ---- autoplay + reporting on reel change (only after the gesture gate) ----
  const prevActive = useRef(-1);
  useEffect(() => {
    const r = reels[active];
    if (!r || !started) return;
    if (prevActive.current !== -1 && prevActive.current !== active) {
      const prev = reels[prevActive.current];
      if (prev) {
        const watched = (Date.now() - startedAt.current) / 1000;
        report(prev.track.id, watched < 3 ? "skip" : watched > prev.track.durationSec * 0.9 ? "complete" : "view", watched);
      }
    }
    if (prevActive.current !== active) {
      prevActive.current = active;
      startedAt.current = Date.now();
      if (current?.id !== r.track.id) {
        playTrackNow(r.track, { queue: reels.map((x) => x.track), index: active });
        report(r.track.id, "view", 0);
      }
    }
    if (active >= reels.length - 3 && hasMore && !loading) void load(cursor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reels.length, started]);

  // when the current track ends, the store advances the queue → follow it
  useEffect(() => {
    if (!started || !current) return;
    const idx = reels.findIndex((r) => r.track.id === current.id);
    if (idx >= 0 && idx !== active && !lockRef.current) {
      setDir(idx > active ? 1 : -1);
      setActive(idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const start = () => {
    getEngine().ensureContext();
    setStarted(true);
    const r = reels[active];
    if (r) {
      prevActive.current = active;
      startedAt.current = Date.now();
      playTrackNow(r.track, { queue: reels.map((x) => x.track), index: active });
      report(r.track.id, "view", 0);
    }
  };

  const onLike = (r: ReelDTO) => {
    const was = likedIds.includes(r.track.id);
    toggleLike(r.track.id);
    void fetch("/api/likes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId: r.track.id }) }).catch(() => {});
    if (!was) report(r.track.id, "like");
  };
  const onShare = async (r: ReelDTO) => {
    const ok = await shareTrack(r.track, "reels");
    if (ok === "copied") toast.success(t("copied"));
    report(r.track.id, "share");
  };

  // ---------------- render ----------------
  if (error && reels.length === 0) {
    return (
      <div className="grid min-h-[60vh] place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-bold">{t("reelsTitle")}</p>
          <p className="mt-1 text-sm text-amber">{error}</p>
          <button onClick={() => void load(0)} className="mt-4 rounded-full bg-white px-5 py-2 text-sm font-bold text-black">{t("loading")}</button>
        </div>
      </div>
    );
  }
  if (loading && reels.length === 0) {
    return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-8 animate-spin text-white/50" /></div>;
  }
  if (reels.length === 0) {
    return (
      <div className="grid min-h-[60vh] place-items-center p-6 text-center">
        <div>
          <Sparkles className="mx-auto mb-3 size-10 text-white/20" />
          <p className="text-lg font-bold">{t("reelsTitle")}</p>
          <p className="mt-1 text-sm text-white/40">{t("reelsEmpty")}</p>
        </div>
      </div>
    );
  }

  const r = reels[active];
  const playingThis = current?.id === r.track.id && isPlaying;
  const isLiked = likedIds.includes(r.track.id);
  const cover = r.track.coverUrl ?? (r.track.sourceId && r.track.source === "youtube" ? `https://i.ytimg.com/vi/${r.track.sourceId}/hqdefault.jpg` : null);
  const progress = current?.id === r.track.id && r.track.durationSec ? Math.min(1, positionSec / r.track.durationSec) : 0;

  return (
    <div ref={stageRef} className="absolute inset-0 overflow-hidden overscroll-contain" dir="ltr">
      <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-4">
        <div className="relative h-full w-full max-w-[460px] overflow-hidden rounded-3xl bg-black shadow-2xl ring-1 ring-white/10">
          <AnimatePresence initial={false} custom={dir} mode="popLayout">
            <motion.div
              key={r.track.id}
              custom={dir}
              initial={{ y: dir > 0 ? "100%" : "-100%", opacity: 0.6 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: dir > 0 ? "-100%" : "100%", opacity: 0.6 }}
              transition={{ type: "spring", stiffness: 320, damping: 34, mass: 0.9 }}
              className="absolute inset-0"
            >
              {/* background */}
              {cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt="" className={cn("absolute inset-0 h-full w-full object-cover transition-transform duration-[8000ms]", playingThis ? "scale-110" : "scale-100")} />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-black/45" />

              {/* tap area: play / pause */}
              <button
                onClick={() => (started ? (current?.id === r.track.id ? togglePlayNow() : playTrackNow(r.track, { queue: reels.map((x) => x.track), index: active })) : start())}
                className="absolute inset-0"
                aria-label={playingThis ? t("pause") : t("play")}
              />

              {/* spinning disc */}
              <div className={cn("pointer-events-none absolute left-1/2 top-[22%] -translate-x-1/2", playingThis && "animate-spin-slow")}>
                <div className="grid size-40 place-items-center rounded-full bg-black/70 shadow-2xl ring-4 ring-white/10 sm:size-52">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" className="size-32 rounded-full object-cover sm:size-44" />
                  ) : <Music2 className="size-14 text-white/40" />}
                  <span className="absolute size-5 rounded-full bg-black ring-2 ring-white/30" />
                </div>
              </div>

              {/* center play indicator */}
              <AnimatePresence>
                {!playingThis && (
                  <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.3, opacity: 0 }} className="pointer-events-none absolute left-1/2 top-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black shadow-2xl">
                    <Play className="ml-1 size-9 fill-black" />
                  </motion.span>
                )}
              </AnimatePresence>

              {/* top: reason + platform */}
              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-4">
                <span className="flex min-w-0 items-center gap-1.5 rounded-full bg-black/50 px-3 py-1 text-[11px] font-semibold text-white/80 backdrop-blur"><Sparkles className="size-3 shrink-0 text-[#1DB954]" /> <span className="truncate">{t("because")}: {r.reason}</span></span>
                <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-bold text-white/80 backdrop-blur"><BrandIcon name={r.track.source} color="brand" className="size-3.5" /> {r.track.source === "youtube" ? "YouTube Music" : r.track.source}</span>
              </div>

              {/* right rail */}
              <div className="absolute bottom-28 right-3 flex flex-col items-center gap-4">
                {r.artist && (
                  <Link href={`/artists/${r.artist.id}`} className="relative" title={r.artist.name}>
                    {r.artist.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.artist.imageUrl} alt="" className="size-12 rounded-full object-cover ring-2 ring-white" />
                    ) : <span className="grid size-12 place-items-center rounded-full bg-white/20 text-lg font-black ring-2 ring-white">{r.artist.name[0]}</span>}
                    <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-black ring-2 ring-black"><BrandIcon name={r.artist.source} color="brand" className="size-3" /></span>
                  </Link>
                )}
                {r.featuring && (
                  <Link href={`/artists/${r.featuring.id}`} className="relative -mt-2" title={r.featuring.name}>
                    {r.featuring.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.featuring.imageUrl} alt="" className="size-10 rounded-full object-cover ring-2 ring-white/70" />
                    ) : <span className="grid size-10 place-items-center rounded-full bg-white/20 text-sm font-black ring-2 ring-white/70">{r.featuring.name[0]}</span>}
                  </Link>
                )}
                <button onClick={() => onLike(r)} className="flex flex-col items-center gap-1 text-white">
                  <span className={cn("grid size-11 place-items-center rounded-full bg-black/50 backdrop-blur transition-transform active:scale-90", isLiked && "text-rose")}><Heart className={cn("size-6", isLiked && "fill-rose")} /></span>
                  <span className="font-mono text-[10px]">{formatCount(r.likes + (isLiked ? 1 : 0))}</span>
                </button>
                <button onClick={() => setDownloadFor(r)} className="flex flex-col items-center gap-1 text-white">
                  <span className="grid size-11 place-items-center rounded-full bg-black/50 backdrop-blur transition-transform active:scale-90"><Scissors className="size-5" /></span>
                  <span className="font-mono text-[10px]">{t("download")}</span>
                </button>
                <button onClick={() => void onShare(r)} className="flex flex-col items-center gap-1 text-white">
                  <span className="grid size-11 place-items-center rounded-full bg-black/50 backdrop-blur transition-transform active:scale-90"><Share2 className="size-5" /></span>
                  <span className="font-mono text-[10px]">{t("share")}</span>
                </button>
                <button onClick={toggleMute} className="grid size-11 place-items-center rounded-full bg-black/50 text-white backdrop-blur">
                  {storeMuted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
                </button>
              </div>

              {/* bottom meta */}
              <div className="absolute inset-x-0 bottom-0 p-4 pr-20">
                <div className="flex items-center gap-2">
                  {r.artist && (
                    <Link href={`/artists/${r.artist.id}`} className="flex items-center gap-1 truncate text-[15px] font-black drop-shadow">
                      @{r.artist.name}
                      {r.artist.verified && <BadgeCheck className="size-4 shrink-0 text-cyan" />}
                    </Link>
                  )}
                  {r.artist && <FollowButton artistId={r.artist.id} initial={r.artist.following} size="sm" />}
                </div>
                {r.featuring && <p className="mt-0.5 text-[12px] text-white/70">feat. {r.featuring.name}</p>}
                <p className="mt-1 line-clamp-2 text-[13.5px] font-semibold text-white/95 drop-shadow">{r.track.title}</p>
                <p className="mt-1 flex items-center gap-2 text-[11px] text-white/60">
                  <Music2 className="size-3.5" /> {r.track.albumTitle ?? r.track.genre} · {formatTime(r.track.durationSec)} · {formatCount(r.views)} {t("playsLabel")}
                  {r.track.source === "youtube" && <span className="flex items-center gap-1"><Film className="size-3" /> video</span>}
                </p>
                <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-[#1DB954] transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
                </div>
                <div className="mt-1 flex justify-between font-mono text-[10px] text-white/40">
                  <span>{current?.id === r.track.id ? formatTime(positionSec) : "0:00"}</span>
                  <span>{formatTime(r.track.durationSec)}</span>
                </div>
              </div>

              {playingThis && (
                <span className="pointer-events-none absolute left-4 top-14 flex items-end gap-[2px]">
                  {[0, 1, 2, 3].map((b) => <span key={b} className="w-[3px] animate-pulse rounded-full bg-[#1DB954]" style={{ height: `${8 + b * 4}px`, animationDelay: `${b * 0.15}s` }} />)}
                </span>
              )}
              {!playingThis && current?.id === r.track.id && started && <span className="pointer-events-none absolute left-4 top-14 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/70"><Pause className="inline size-3" /></span>}
            </motion.div>
          </AnimatePresence>

          {/* gesture gate */}
          {!started && (
            <button onClick={start} className="absolute inset-0 z-10 grid place-items-center bg-black/40 backdrop-blur-[2px]">
              <span className="flex flex-col items-center gap-3">
                <span className="grid size-24 place-items-center rounded-full bg-white text-black shadow-2xl"><Play className="ml-1 size-11 fill-black" /></span>
                <span className="rounded-full bg-black/60 px-4 py-1.5 text-sm font-bold">{t("tapToStart")}</span>
              </span>
            </button>
          )}

          {/* prev / next */}
          <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2">
            <button onClick={() => goTo(active - 1)} disabled={active === 0} className="grid size-9 place-items-center rounded-full bg-black/50 text-white backdrop-blur disabled:opacity-30" aria-label="Previous"><ChevronUp className="size-5" /></button>
            <button onClick={() => goTo(active + 1)} disabled={active >= reels.length - 1 && !hasMore} className="grid size-9 place-items-center rounded-full bg-black/50 text-white backdrop-blur disabled:opacity-30" aria-label="Next"><ChevronDown className="size-5" /></button>
          </div>
          <span className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 font-mono text-[10px] text-white/60 backdrop-blur">{active + 1} / {reels.length}{hasMore ? "+" : ""} · {t("swipeHint")}</span>
          {loading && <Loader2 className="absolute right-4 top-14 z-10 size-4 animate-spin text-white/60" />}
        </div>
      </div>

      {downloadFor && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-3 backdrop-blur-sm" onClick={() => setDownloadFor(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <DownloadMenu track={downloadFor.track} onClose={() => setDownloadFor(null)} initialTab="clip" onEvent={(k) => report(downloadFor.track.id, k)} />
          </div>
        </div>
      )}
    </div>
  );
}
