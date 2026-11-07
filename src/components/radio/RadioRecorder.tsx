"use client";

// ============================================================================
//  Radio Recorder — record the live station into a rolling in-browser buffer,
//  visualize it as a loudness timeline, select a part (two handles or
//  "mark start / mark end"), then:
//    • Download clip  → the selected raw frames are uploaded to the server,
//      which transcodes them to a clean, playable MP3 (ffmpeg) and returns it.
//    • Save to My Clips → same MP3, also stored on-device (IndexedDB) so the
//      user can come back to it later.
//  The server transcode is what fixes the "recorded radio clip won't download"
//  bug (browser-only ID3 tagging of raw AAC/MP3 frames was unreliable).
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Square, Flag, FlagOff, Download, Radio, BookmarkPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getEngine } from "@/lib/audio/engine";
import { cn, formatTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { addClip, type SavedClip } from "@/lib/clipstore";
import type { RadioStationDTO } from "@/lib/types";

interface Chunk { t: number; bytes: Uint8Array; }
const MAX_SECONDS = 30 * 60;
const SAMPLE_MS = 250;

export function RadioRecorder({ station, streamUrl, onClipsChange }: { station: RadioStationDTO | null; streamUrl: string | null; onClipsChange?: () => void }) {
  const t = useT();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [sel, setSel] = useState<{ start: number; end: number } | null>(null);
  const [drag, setDrag] = useState<"start" | "end" | null>(null);
  const [busy, setBusy] = useState<"download" | "save" | null>(null);

  const chunksRef = useRef<Chunk[]>([]);
  const levelsRef = useRef<number[]>([]);
  const startAtRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRecording(false);
    const first = chunksRef.current[0]?.t ?? 0;
    const last = chunksRef.current[chunksRef.current.length - 1]?.t ?? 0;
    if (last - first > 1) setSel((prev) => prev ?? { start: first, end: last });
  }, []);

  useEffect(() => {
    stop();
    chunksRef.current = [];
    levelsRef.current = [];
    setElapsed(0);
    setBytes(0);
    setSel(null);
  }, [streamUrl, stop]);

  const start = useCallback(async () => {
    if (!streamUrl) return;
    stop();
    chunksRef.current = [];
    levelsRef.current = [];
    setSel(null);
    setElapsed(0);
    setBytes(0);
    startAtRef.current = performance.now();
    const ac = new AbortController();
    abortRef.current = ac;
    setRecording(true);
    try {
      const res = await fetch(streamUrl, { signal: ac.signal, cache: "no-store" });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      let total = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done || !value) break;
        const now = (performance.now() - startAtRef.current) / 1000;
        chunksRef.current.push({ t: now, bytes: value });
        total += value.byteLength;
        while (chunksRef.current.length > 0 && now - chunksRef.current[0].t > MAX_SECONDS) {
          total -= chunksRef.current[0].bytes.byteLength;
          chunksRef.current.shift();
        }
        setBytes(total);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") toast.error(`${t("dlFailed")}: ${(err as Error).message}`);
    } finally {
      setRecording(false);
      // Auto-select: if the user didn't pick a range, use the whole recording.
      const first = chunksRef.current[0]?.t ?? 0;
      const last = chunksRef.current[chunksRef.current.length - 1]?.t ?? 0;
      setSel((prev) => prev ?? (last - first > 1 ? { start: first, end: last } : prev));
    }
  }, [streamUrl, stop, t]);

  useEffect(() => {
    if (!recording) return;
    const engine = getEngine();
    const data = new Uint8Array(1024);
    const iv = setInterval(() => {
      let rms = 0;
      if (engine.getTimeDomainData(data)) {
        let sum = 0;
        for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
        rms = Math.sqrt(sum / data.length);
      }
      if (rms < 0.005) rms = 0.08 + Math.random() * 0.06;
      levelsRef.current.push(Math.min(1, rms * 2.2));
      const maxSamples = (MAX_SECONDS * 1000) / SAMPLE_MS;
      if (levelsRef.current.length > maxSamples) levelsRef.current.shift();
      setElapsed((performance.now() - startAtRef.current) / 1000);
    }, SAMPLE_MS);
    return () => clearInterval(iv);
  }, [recording]);

  const bufferStart = chunksRef.current[0]?.t ?? 0;
  const bufferEnd = elapsed;
  const span = Math.max(1, bufferEnd - bufferStart);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const levels = levelsRef.current;
    const total = Math.max(1, Math.floor((span * 1000) / SAMPLE_MS));
    const visible = levels.slice(-total);
    const barW = Math.max(1, w / Math.max(visible.length, 120));
    for (let i = 0; i < visible.length; i++) {
      const x = (i / Math.max(visible.length, 1)) * w;
      const tSec = bufferStart + (i / Math.max(visible.length, 1)) * span;
      const inSel = sel ? tSec >= sel.start && tSec <= sel.end : false;
      const bh = Math.max(2, visible[i] * (h - 6));
      ctx.fillStyle = inSel ? "#1DB954" : "rgba(255,255,255,0.28)";
      ctx.fillRect(x, (h - bh) / 2, barW * 0.8, bh);
    }
    if (sel) {
      const x1 = ((sel.start - bufferStart) / span) * w;
      const x2 = ((sel.end - bufferStart) / span) * w;
      ctx.fillStyle = "rgba(29,185,84,0.12)";
      ctx.fillRect(x1, 0, x2 - x1, h);
    }
  }, [elapsed, sel, span, bufferStart]);

  const timeFromClientX = (clientX: number): number => {
    const el = timelineRef.current;
    if (!el) return bufferStart;
    const r = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return bufferStart + ratio * span;
  };
  const onTimelinePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (elapsed < 2) return;
    const tt = timeFromClientX(e.clientX);
    if (!sel) { setSel({ start: tt, end: Math.min(bufferEnd, tt + Math.min(30, span / 3)) }); return; }
    const which = Math.abs(tt - sel.start) < Math.abs(tt - sel.end) ? "start" : "end";
    setDrag(which);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onTimelinePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || !sel) return;
    const tt = timeFromClientX(e.clientX);
    if (drag === "start") setSel({ start: Math.min(tt, sel.end - 1), end: sel.end });
    else setSel({ start: sel.start, end: Math.max(tt, sel.start + 1) });
  };
  const markStart = () => setSel((s) => ({ start: bufferEnd, end: s && s.end > bufferEnd ? s.end : bufferEnd + 1 }));
  const markEnd = () => setSel((s) => (s ? { start: Math.min(s.start, bufferEnd - 1), end: bufferEnd } : { start: Math.max(bufferStart, bufferEnd - 30), end: bufferEnd }));

  const selectionBytes = useMemo(() => {
    if (!sel) return 0;
    return chunksRef.current.filter((c) => c.t >= sel.start && c.t <= sel.end).reduce((a, c) => a + c.bytes.byteLength, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, bytes]);

  // Build the selection's raw frames → upload → MP3.
  const makeClip = async (): Promise<Blob> => {
    if (!station) throw new Error("empty");
    const first = chunksRef.current[0]?.t ?? 0;
    const last = chunksRef.current[chunksRef.current.length - 1]?.t ?? 0;
    const range = sel ?? { start: first, end: last };
    const parts = chunksRef.current.filter((c) => c.t >= range.start && c.t <= range.end).map((c) => c.bytes);
    if (parts.length === 0) throw new Error("empty");
    const blobIn = new Blob(parts as unknown as BlobPart[], { type: "application/octet-stream" });
    const qs = new URLSearchParams({
      name: station.name, country: station.country, from: formatTime(range.start), to: formatTime(range.end), cover: station.coverUrl ?? "",
    });
    const res = await fetch(`/api/radio/clip?${qs}`, { method: "POST", body: blobIn });
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(b.error ?? `HTTP ${res.status}`);
    }
    return res.blob();
  };

  const triggerDownload = (blob: Blob, name: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  const downloadClip = async () => {
    if (!station || chunksRef.current.length === 0) return;
    setBusy("download");
    toast(t("dlStarted"));
    try {
      const blob = await makeClip();
      const r0 = sel ?? { start: chunksRef.current[0]?.t ?? 0, end: chunksRef.current[chunksRef.current.length - 1]?.t ?? 0 };
      triggerDownload(blob, `${station.name.replace(/[\\/:*?"<>|]/g, "")} - clip ${formatTime(r0.start)}-${formatTime(r0.end)}.mp3`);
      toast.success(`${t("clipSaved")} · ${(blob.size / 1e6).toFixed(1)} MB`);
    } catch (err) {
      toast.error(`${t("dlFailed")}: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const saveToClips = async () => {
    if (!station || chunksRef.current.length === 0) return;
    setBusy("save");
    toast(t("dlStarted"));
    try {
      const blob = await makeClip();
      let cover: string | null = station.coverUrl;
      // store as data URL so the favorite renders offline
      try {
        const r = await fetch(station.coverUrl);
        const cb = await r.blob();
        cover = await new Promise<string>((res) => { const f = new FileReader(); f.onload = () => res(f.result as string); f.readAsDataURL(cb); });
      } catch { cover = station.coverUrl; }
      const clip: SavedClip = {
        id: `${Date.now()}`,
        name: `${station.name} clip`,
        stationName: station.name,
        country: station.country,
        cover,
        start: sel?.start ?? 0,
        end: sel?.end ?? 0,
        seconds: (sel?.end ?? 0) - (sel?.start ?? 0),
        savedAt: Date.now(),
        size: blob.size,
        blob,
      };
      await addClip(clip);
      const r1 = sel ?? { start: chunksRef.current[0]?.t ?? 0, end: chunksRef.current[chunksRef.current.length - 1]?.t ?? 0 };
      triggerDownload(blob, `${station.name.replace(/[\\/:*?"<>|]/g, "")} - clip ${formatTime(r1.start)}-${formatTime(r1.end)}.mp3`);
      onClipsChange?.();
      toast.success(`${t("saveToClips")} ✓ ${(blob.size / 1e6).toFixed(1)} MB`);
    } catch (err) {
      toast.error(`${t("dlFailed")}: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  if (!station || !streamUrl) {
    return (
      <div className="glass-panel rounded-2xl p-5 text-sm text-white/40">
        <p className="mb-1 flex items-center gap-2 text-sm font-bold text-white/80"><Radio className="size-4 text-[#1DB954]" /> {t("recorder")}</p>
        {t("playStationFirst")}
      </div>
    );
  }

  const pct = (v: number) => `${((v - bufferStart) / span) * 100}%`;

  return (
    <div className="glass-panel rounded-2xl p-4 sm:p-5" dir="ltr">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={station.coverUrl} alt="" className="size-10 rounded-lg bg-white/5 object-cover" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-bold">
            {t("recorder")}
            {recording && <span className="flex items-center gap-1 rounded bg-rose/20 px-1.5 py-px text-[9px] font-black text-rose"><span className="size-1.5 animate-pulse rounded-full bg-rose" /> REC</span>}
          </p>
          <p className="truncate text-xs text-white/45">{station.name} · {t("recorderSub")}</p>
        </div>
        {!recording ? (
          <button onClick={() => void start()} className="flex items-center gap-2 rounded-full bg-rose px-4 py-2 text-xs font-bold text-white transition-transform hover:scale-105">
            <Circle className="size-3.5 fill-white" /> {t("startRec")}
          </button>
        ) : (
          <button onClick={stop} className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15">
            <Square className="size-3.5 fill-white" /> {t("stopRec")}
          </button>
        )}
      </div>

      <div
        ref={timelineRef}
        onPointerDown={onTimelinePointerDown}
        onPointerMove={onTimelinePointerMove}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        className={cn("relative h-28 w-full touch-none select-none overflow-hidden rounded-xl bg-black/40", elapsed >= 2 ? "cursor-crosshair" : "cursor-default")}
      >
        <canvas ref={canvasRef} width={1200} height={112} className="absolute inset-0 h-full w-full" />
        {sel && (
          <>
            {(["start", "end"] as const).map((k) => (
              <div key={k} className="absolute top-0 h-full w-0.5 bg-[#1DB954]" style={{ left: pct(sel[k]) }}>
                <span className="absolute top-1 -translate-x-1/2 rounded-md bg-[#1DB954] px-1.5 py-0.5 font-mono text-[10px] font-bold text-black shadow">{formatTime(sel[k])}</span>
                <span className="absolute bottom-1 left-1/2 size-4 -translate-x-1/2 cursor-ew-resize rounded-full border-2 border-black bg-[#1DB954] shadow" />
              </div>
            ))}
          </>
        )}
        {recording && <div className="absolute right-0 top-0 h-full w-0.5 bg-rose" />}
        {elapsed < 2 && <p className="absolute inset-0 grid place-items-center px-6 text-center text-xs text-white/40">{t("recHint")}</p>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/60">
        <span className="font-mono">{t("buffered")}: <b className="text-white">{formatTime(span)}</b> · {(bytes / 1e6).toFixed(1)} MB</span>
        {sel && (
          <span className="font-mono">{t("selection")}: <b className="text-[#1DB954]">{formatTime(sel.start)} → {formatTime(sel.end)}</b> ({formatTime(sel.end - sel.start)} · {(selectionBytes / 1e6).toFixed(1)} MB)</span>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <button onClick={markStart} disabled={elapsed < 1} className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 font-semibold text-white/70 hover:bg-white/10 disabled:opacity-30">
            <Flag className="size-3.5" /> {t("markStart")}
          </button>
          <button onClick={markEnd} disabled={elapsed < 2} className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 font-semibold text-white/70 hover:bg-white/10 disabled:opacity-30">
            <FlagOff className="size-3.5" /> {t("markEnd")}
          </button>
          <button onClick={() => void downloadClip()} disabled={busy !== null || bytes === 0} className="flex items-center gap-1.5 rounded-full bg-[#1DB954] px-4 py-1.5 font-bold text-black transition-transform hover:scale-105 disabled:opacity-40">
            {busy === "download" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} {busy === "download" ? "…" : t("download")}
          </button>
          <button onClick={() => void saveToClips()} disabled={busy !== null || bytes === 0} className="flex items-center gap-1.5 rounded-full border border-[#1DB954]/50 bg-[#1DB954]/10 px-4 py-1.5 font-bold text-[#1DB954] hover:bg-[#1DB954]/20 disabled:opacity-40">
            {busy === "save" ? <Loader2 className="size-3.5 animate-spin" /> : <BookmarkPlus className="size-3.5" />} {busy === "save" ? "…" : t("saveToClips")}
          </button>
        </span>
      </div>
    </div>
  );
}
