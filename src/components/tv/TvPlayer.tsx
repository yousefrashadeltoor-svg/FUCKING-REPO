
// ============================================================================
//  TvPlayer — premium live TV player (hls.js):
//  quality selector (auto + every rendition), stream-source switcher,
//  volume, mute, fullscreen, picture-in-picture, screenshot (PNG),
//  clip recorder (WebM via MediaRecorder), live-latency badge, stall
//  auto-recovery, audio-track + subtitle selectors when the stream has them,
//  cinema mode and a sleek auto-hiding control bar.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Hls, { type Level } from "hls.js";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize, PictureInPicture2, Camera, Circle, Square,
  Settings2, Radio, Loader2, AlertTriangle, Tv, RefreshCcw, Languages, Captions,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { TvChannelDTO } from "@/lib/data/tv";
import { usePlayerStore } from "@/stores/player-store";

interface Props {
  channel: TvChannelDTO | null;
  onClose?: () => void;
}

const proxied = (s: TvChannelDTO["streams"][number]) =>
  s.url;

export function TvPlayer({ channel, onClose }: Props) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const recChunks = useRef<Blob[]>([]);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [streamIdx, setStreamIdx] = useState(0);
  const [levels, setLevels] = useState<Level[]>([]);
  const [level, setLevel] = useState(-1); // -1 auto
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.9);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fs, setFs] = useState(false);
  const [controls, setControls] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [audioTracks, setAudioTracks] = useState<{ id: number; name: string }[]>([]);
  const [subTracks, setSubTracks] = useState<{ id: number; name: string }[]>([]);
  const [cinema, setCinema] = useState(false);
  const [stats, setStats] = useState<{ bw: number; dropped: number } | null>(null);

  const pauseMusic = usePlayerStore((s) => s.setPlaying);

  // reset stream index when channel changes
  useEffect(() => {
    setStreamIdx(0);
    setLevel(-1);
    setError(null);
  }, [channel?.id]);

  const src = useMemo(() => (channel ? proxied(channel.streams[Math.min(streamIdx, channel.streams.length - 1)]) : null), [channel, streamIdx]);

  // ---- attach hls.js ----
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    pauseMusic(false); // pause music when TV starts
    setError(null);
    setBuffering(true);
    setLevels([]);
    setAudioTracks([]);
    setSubTracks([]);
    hlsRef.current?.destroy();
    hlsRef.current = null;

    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        liveSyncDurationCount: 3,
        maxBufferLength: 30,
        backBufferLength: 30,
        enableWorker: true,
        fragLoadingMaxRetry: 6,
        manifestLoadingMaxRetry: 4,
        levelLoadingMaxRetry: 4,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        setLevels(data.levels);
        setBuffering(false);
        void video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => setCurrentLevel(data.level));
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_e, data) => setAudioTracks(data.audioTracks.map((a, i) => ({ id: i, name: a.name || a.lang || `Audio ${i + 1}` }))));
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_e, data) => setSubTracks(data.subtitleTracks.map((s, i) => ({ id: i, name: s.name || s.lang || `Sub ${i + 1}` }))));
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        setBuffering(false);
        setStats({ bw: Math.round((hls.bandwidthEstimate || 0) / 1000), dropped: video.getVideoPlaybackQuality?.().droppedVideoFrames ?? 0 });
        if (hls.latency) setLatency(hls.latency);
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          // try next source automatically
          if (channel && streamIdx < channel.streams.length - 1) {
            toast(`Switching to source ${streamIdx + 2}…`);
            setStreamIdx((i) => i + 1);
          } else {
            setError(`Stream unavailable (${data.details})`);
            setBuffering(false);
          }
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          setError(`Playback error (${data.details})`);
          setBuffering(false);
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      void video.play().then(() => { setPlaying(true); setBuffering(false); }).catch(() => setBuffering(false));
    } else {
      setError("HLS is not supported in this browser");
      setBuffering(false);
    }
    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // ---- quality selection ----
  useEffect(() => {
    if (hlsRef.current) hlsRef.current.currentLevel = level;
  }, [level]);

  // ---- video element events ----
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    v.volume = volume;
    v.muted = muted;
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
    };
  }, [volume, muted]);

  // ---- fullscreen state ----
  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // ---- auto-hide controls ----
  const poke = useCallback(() => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControls(false), 3200);
  }, []);
  useEffect(() => {
    poke();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [poke, channel?.id]);

  // ---- keyboard ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!channel) return;
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA")) return;
      if (e.key === "f") void toggleFs();
      if (e.key === "m") setMuted((m) => !m);
      if (e.key === "k" || e.key === " ") {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);

  }, [channel]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };
  const goLive = () => {
    const v = videoRef.current;
    if (!v) return;
    if (hlsRef.current && hlsRef.current.liveSyncPosition) v.currentTime = hlsRef.current.liveSyncPosition;
    else if (Number.isFinite(v.duration)) v.currentTime = v.duration;
    void v.play();
  };
  const toggleFs = async () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await el.requestFullscreen().catch(() => {});
  };
  const togglePip = async () => {
    const v = videoRef.current;
    if (!v || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch {
      toast.error("Picture-in-picture not available");
    }
  };
  const screenshot = () => {
    const v = videoRef.current;
    if (!v || !channel) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth || 1280;
    c.height = v.videoHeight || 720;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    try {
      ctx.drawImage(v, 0, 0, c.width, c.height);
      c.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${channel.name} ${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        toast.success("Screenshot saved");
      }, "image/png");
    } catch {
      toast.error("Screenshot blocked by the stream (CORS)");
    }
  };
  const toggleRecord = () => {
    const v = videoRef.current;
    if (!v || !channel) return;
    if (recording) {
      recRef.current?.stop();
      return;
    }
    try {
      const stream = (v as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
      if (!stream) throw new Error("captureStream unsupported");
      const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined);
      recChunks.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && recChunks.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(recChunks.current, { type: "video/webm" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${channel.name} clip ${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.webm`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        setRecording(false);
        toast.success(`Clip saved · ${(blob.size / 1e6).toFixed(1)} MB`);
      };
      rec.start(1000);
      recRef.current = rec;
      setRecording(true);
      toast("Recording… press ⏹ to save");
    } catch {
      toast.error("Recording is not supported here");
    }
  };

  if (!channel) {
    return (
      <div className="glass-panel grid aspect-video w-full place-items-center rounded-2xl bg-black/60 text-center">
        <div>
          <Tv className="mx-auto mb-3 size-10 text-white/20" />
          <p className="text-sm text-white/40">{t("tvPick")}</p>
        </div>
      </div>
    );
  }

  const activeLevel = currentLevel >= 0 ? levels[currentLevel] : null;

  return (
    <div
      ref={wrapRef}
      onMouseMove={poke}
      onTouchStart={poke}
      className={cn("group relative w-full overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/10", cinema && !fs && "fixed inset-3 z-[60] rounded-2xl", fs && "rounded-none")}
      dir="ltr"
    >
      <div className="relative aspect-video w-full bg-black"><video ref={videoRef} className="absolute inset-0 h-full w-full bg-black object-contain" playsInline crossOrigin="anonymous" onClick={togglePlay} onDoubleClick={() => void toggleFs()} /></div>

      {/* top bar */}
      <div className={cn("pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent p-4 transition-opacity", controls ? "opacity-100" : "opacity-0")}>
        {channel.logo && (

          <img src={channel.logo} alt="" className="h-9 max-w-24 rounded-md bg-white/90 object-contain p-1" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white drop-shadow">{channel.name}</p>
          <p className="truncate text-[11px] text-white/60">{channel.country} · {channel.categories.join(", ") || "live"}{channel.network ? ` · ${channel.network}` : ""}</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-rose/90 px-2 py-0.5 text-[10px] font-black tracking-widest text-white">
          <span className="size-1.5 animate-pulse rounded-full bg-white" /> {t("live")}
        </span>
        {activeLevel && <span className="rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white/80">{activeLevel.height}p</span>}
        {latency !== null && <span className="hidden rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white/60 sm:block">{latency.toFixed(1)}s</span>}
      </div>

      {/* center state */}
      {buffering && !error && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Loader2 className="size-10 animate-spin text-white/80 drop-shadow" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black/70 p-6 text-center">
          <div>
            <AlertTriangle className="mx-auto mb-2 size-8 text-amber" />
            <p className="text-sm text-white/80">{error}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button onClick={() => { setError(null); setStreamIdx((i) => (i + 1) % channel.streams.length); }} className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-black">
                <RefreshCcw className="size-3.5" /> {t("tvNextSource")} ({((streamIdx + 1) % channel.streams.length) + 1}/{channel.streams.length})
              </button>
              {onClose && <button onClick={onClose} className="rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white">{t("cancel")}</button>}
            </div>
          </div>
        </div>
      )}

      {/* bottom controls */}
      <div className={cn("absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 transition-opacity sm:p-4", controls ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button onClick={togglePlay} className="grid size-10 place-items-center rounded-full bg-white text-black transition-transform hover:scale-105" aria-label={playing ? t("pause") : t("play")}>
            {playing ? <Pause className="size-5 fill-black" /> : <Play className="ml-0.5 size-5 fill-black" />}
          </button>
          <button onClick={goLive} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-white/20" title={t("tvGoLive")}>
            <Radio className="size-3.5 text-rose" /> {t("live")}
          </button>
          <div className="ml-1 hidden items-center gap-2 sm:flex">
            <button onClick={() => setMuted((m) => !m)} className="text-white/80 hover:text-white" aria-label={t("mute")}>
              {muted || volume === 0 ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
            </button>
            <input type="range" min={0} max={1} step={0.02} value={muted ? 0 : volume} onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }} className="aura-range w-24" style={{ ["--fill" as string]: `${(muted ? 0 : volume) * 100}%` }} aria-label={t("volume")} />
          </div>
          {stats && <span className="ml-2 hidden font-mono text-[10px] text-white/40 md:block">{stats.bw} kbps · {stats.dropped} dropped</span>}

          <span className="flex-1" />

          <button onClick={toggleRecord} className={cn("grid size-9 place-items-center rounded-full hover:bg-white/15", recording ? "text-rose" : "text-white/80")} title={recording ? t("stopRec") : t("startRec")}>
            {recording ? <Square className="size-4 fill-rose" /> : <Circle className="size-4" />}
          </button>
          <button onClick={screenshot} className="grid size-9 place-items-center rounded-full text-white/80 hover:bg-white/15" title={t("tvScreenshot")}><Camera className="size-4" /></button>
          <button onClick={() => void togglePip()} className="hidden size-9 place-items-center rounded-full text-white/80 hover:bg-white/15 sm:grid" title="Picture in picture"><PictureInPicture2 className="size-4" /></button>
          <button onClick={() => setCinema((c) => !c)} className="hidden size-9 place-items-center rounded-full text-white/80 hover:bg-white/15 md:grid" title={t("tvCinema")}><Tv className="size-4" /></button>

          {/* settings */}
          <div className="relative">
            <button onClick={() => setSettingsOpen((o) => !o)} className={cn("grid size-9 place-items-center rounded-full hover:bg-white/15", settingsOpen ? "bg-white/15 text-white" : "text-white/80")} title={t("tvQuality")}>
              <Settings2 className="size-4" />
            </button>
            {settingsOpen && (
              <div className="glass-modal absolute bottom-11 right-0 z-10 w-60 rounded-2xl p-2 text-start" onMouseMove={(e) => e.stopPropagation()}>
                <p className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{t("tvQuality")}</p>
                <button onClick={() => setLevel(-1)} className={cn("flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[12.5px] hover:bg-white/10", level === -1 ? "text-[#1DB954]" : "text-white/75")}>
                  <span>{t("qAuto")}{level === -1 && activeLevel ? ` · ${activeLevel.height}p` : ""}</span>
                </button>
                {levels.map((l, i) => (
                  <button key={i} onClick={() => setLevel(i)} className={cn("flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[12.5px] hover:bg-white/10", level === i ? "text-[#1DB954]" : "text-white/75")}>
                    <span>{l.height ? `${l.height}p` : `Level ${i + 1}`}{l.frameRate ? ` · ${Math.round(l.frameRate)}fps` : ""}</span>
                    <span className="font-mono text-[10px] text-white/40">{Math.round(l.bitrate / 1000)} kbps</span>
                  </button>
                ))}
                {channel.streams.length > 1 && (
                  <>
                    <p className="px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{t("tvSource")}</p>
                    {channel.streams.map((s, i) => (
                      <button key={i} onClick={() => setStreamIdx(i)} className={cn("flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[12.5px] hover:bg-white/10", streamIdx === i ? "text-[#1DB954]" : "text-white/75")}>
                        <span>{t("tvSource")} {i + 1}{s.title ? ` · ${s.title}` : ""}</span>
                        <span className="font-mono text-[10px] text-white/40">{s.quality ?? "—"}</span>
                      </button>
                    ))}
                  </>
                )}
                {audioTracks.length > 1 && (
                  <>
                    <p className="flex items-center gap-1 px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35"><Languages className="size-3" /> Audio</p>
                    {audioTracks.map((a) => (
                      <button key={a.id} onClick={() => { if (hlsRef.current) hlsRef.current.audioTrack = a.id; }} className="w-full rounded-lg px-2 py-1.5 text-start text-[12.5px] text-white/75 hover:bg-white/10">{a.name}</button>
                    ))}
                  </>
                )}
                {subTracks.length > 0 && (
                  <>
                    <p className="flex items-center gap-1 px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35"><Captions className="size-3" /> Subtitles</p>
                    <button onClick={() => { if (hlsRef.current) hlsRef.current.subtitleTrack = -1; }} className="w-full rounded-lg px-2 py-1.5 text-start text-[12.5px] text-white/75 hover:bg-white/10">Off</button>
                    {subTracks.map((s) => (
                      <button key={s.id} onClick={() => { if (hlsRef.current) hlsRef.current.subtitleTrack = s.id; }} className="w-full rounded-lg px-2 py-1.5 text-start text-[12.5px] text-white/75 hover:bg-white/10">{s.name}</button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
          <button onClick={() => void toggleFs()} className="grid size-9 place-items-center rounded-full text-white/80 hover:bg-white/15" title="Fullscreen (F)">
            {fs ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
