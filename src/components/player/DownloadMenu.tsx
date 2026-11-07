"use client";

// ============================================================================
//  Download menu — 3 tabs:
//   • Formats : Video / Audio — every real native stream (yt-dlp) + 25
//               transcode presets, each with size · duration · bitrate ·
//               cover flag. Click = immediate real download.
//   • Clip    : visual trim on the waveform (two handles + numeric fine-tune)
//               → download the exact segment, the full track, or 30s preview.
//   • Page    : the song's deep link (opens DON MUSE on this song), copy /
//               share buttons, open artist / album pages, source link.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, Film, Music4, Loader2, X, AlertTriangle, Image as ImageIcon, Gem, Check, Scissors, Link2, Share2, Copy, ExternalLink, Disc3, UserRound } from "lucide-react";
import { toast } from "sonner";
import { cn, formatTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { usePlayerStore } from "@/stores/player-store";
import { links, shareTrack, shareUrl } from "@/lib/share";
import { BrandIcon, BRAND_LABEL } from "@/components/brand/BrandIcon";
import type { DownloadFormatDTO, TrackDTO } from "@/lib/types";

interface FormatsResponse {
  source: string;
  title: string;
  durationSec: number;
  coverUrl: string | null;
  extractor: string;
  note: string | null;
  video: DownloadFormatDTO[];
  audio: DownloadFormatDTO[];
  error?: string;
  /** source policy: downloading not permitted for this provider */
  allowed?: boolean;
  external?: string | null;
}

type Tab = "formats" | "clip" | "page";

function fmtSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

// Audio qualities offered for a trimmed clip (same presets as full download).
const CLIP_FORMATS = [
  { id: "mp3-320", label: "MP3 320k" },
  { id: "mp3-256", label: "MP3 256k" },
  { id: "mp3-192", label: "MP3 192k" },
  { id: "mp3-128", label: "MP3 128k" },
  { id: "m4a-256", label: "AAC 256k" },
  { id: "m4a-192", label: "AAC 192k" },
  { id: "opus-160", label: "Opus 160k" },
  { id: "ogg-192", label: "OGG 192k" },
  { id: "flac", label: "FLAC" },
  { id: "alac", label: "ALAC" },
  { id: "wav", label: "WAV" },
];

async function downloadBlob(url: string, fallbackName: string): Promise<{ name: string; size: number }> {
  const res = await fetch(url);
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const m = cd.match(/filename\*=UTF-8''([^;]+)/) ?? cd.match(/filename="([^"]+)"/);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return { name, size: blob.size };
}

export function DownloadMenu({ track, onClose, initialTab = "formats", onEvent }: { track: TrackDTO; onClose: () => void; initialTab?: Tab; onEvent?: (kind: string) => void }) {
  const t = useT();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [data, setData] = useState<FormatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"audio" | "video">("audio");
  const [family, setFamily] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    void fetch(`/api/tracks/${track.id}/formats`, { signal: ctrl.signal })
      .then(async (r) => {
        const body = (await r.json()) as FormatsResponse;
        if (ctrl.signal.aborted) return;
        if (!r.ok || body.allowed === false) {
          // Source policy (or a real failure): explain it and offer the official
          // page instead of showing an empty, broken list.
          setError(body.error ?? body.note ?? "Download failed");
          if (body.note || body.external) setData(body);
        } else {
          setData(body);
          if (body.audio.length === 0 && body.video.length > 0) setKind("video");
        }
        setLoading(false);
      })
      .catch((e: unknown) => {
        if ((e as Error).name === "AbortError") return;
        setError("Download failed");
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [track.id]);

  const families = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const f of data.audio) set.add(f.id.startsWith("native:") ? "original" : f.lossless ? "lossless" : f.ext);
    return ["all", ...Array.from(set)];
  }, [data]);

  const list = useMemo(() => {
    if (!data) return [];
    const src = kind === "audio" ? data.audio : data.video;
    if (kind === "video" || family === "all") return src;
    return src.filter((f) => (family === "original" ? f.id.startsWith("native:") : family === "lossless" ? f.lossless : f.ext === family && !f.lossless));
  }, [data, kind, family]);

  const run = async (id: string, url: string, label: string, event = "download") => {
    setBusy(id);
    toast(t("dlStarted"), { description: label });
    try {
      const { name, size } = await downloadBlob(url, `${track.title} - ${track.artistName}`);
      setDone((d) => new Set(d).add(id));
      onEvent?.(event);
      toast.success(`${t("download")} ✓ ${name} · ${fmtSize(size)}`);
    } catch (err) {
      toast.error(`${t("dlFailed")}: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const Row = ({ f }: { f: DownloadFormatDTO }) => (
    <button onClick={() => void run(f.id, `/api/tracks/${track.id}/download?fmt=${encodeURIComponent(f.id)}`, `${f.label} · ${fmtSize(f.sizeBytes)}`)} disabled={busy !== null} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start transition-colors hover:bg-white/8 disabled:opacity-50">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", f.kind === "video" ? "bg-rose/15 text-rose" : f.lossless ? "bg-gold/15 text-gold" : "bg-[#1DB954]/15 text-[#1DB954]")}>
        {f.kind === "video" ? <Film className="size-4" /> : f.lossless ? <Gem className="size-4" /> : <Music4 className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] font-bold">{f.label}</span>
          <span className="rounded bg-white/10 px-1.5 py-px font-mono text-[9.5px] uppercase text-white/70">{f.ext}</span>
          {f.codec && <span className="rounded bg-white/5 px-1.5 py-px font-mono text-[9.5px] text-white/45">{f.codec}</span>}
          {f.cover && <span title={t("dlCover")} className="flex items-center gap-0.5 rounded bg-white/5 px-1 py-px text-[9.5px] text-white/50"><ImageIcon className="size-3" /></span>}
        </span>
        <span className="mt-0.5 block font-mono text-[10.5px] text-white/40">{f.estimated ? "~" : ""}{fmtSize(f.sizeBytes)} · {formatTime(data?.durationSec ?? track.durationSec)} · {f.lossless ? t("dlLossless") : `${f.bitrateKbps} kbps`}</span>
      </span>
      <span className="flex shrink-0 items-center text-white/60">
        {busy === f.id ? <Loader2 className="size-4 animate-spin text-[#1DB954]" /> : done.has(f.id) ? <Check className="size-4 text-[#1DB954]" /> : <Download className="size-4" />}
      </span>
    </button>
  );

  return (
    <div className="glass-modal w-[440px] max-w-[94vw] rounded-2xl p-3" dir="auto" onClick={(e) => e.stopPropagation()}>
      <div className="mb-2 flex items-start justify-between gap-3 px-2 pt-1">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-bold"><Download className="size-4 text-[#1DB954]" /> {t("dlTitle")}</h3>
          <p className="mt-0.5 truncate text-xs text-white/45">{track.title} — {track.artistName}</p>
        </div>
        <button onClick={onClose} className="shrink-0 text-white/40 hover:text-white" aria-label="Close"><X className="size-4" /></button>
      </div>

      {/* main tabs */}
      <div className="mb-2 flex gap-1 rounded-xl bg-black/40 p-1">
        {([["formats", Download, t("dlTabFormats")], ["clip", Scissors, t("dlTabClip")], ["page", Link2, t("dlTabPage")]] as const).map(([id, Icon, label]) => (
          <button key={id} onClick={() => setTab(id)} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors", tab === id ? "bg-white text-black" : "text-white/55 hover:text-white")}>
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* ---------------- FORMATS ---------------- */}
      {tab === "formats" && (
        <>
          {data && (
            <div className="mb-2 flex gap-1 px-1">
              {(["audio", "video"] as const).map((k) => {
                const n = k === "audio" ? data.audio.length : data.video.length;
                return (
                  <button key={k} onClick={() => setKind(k)} disabled={n === 0} className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold disabled:opacity-30", kind === k ? "border-[#1DB954] text-[#1DB954]" : "border-white/10 text-white/50 hover:text-white")}>
                    {k === "audio" ? <Music4 className="size-3.5" /> : <Film className="size-3.5" />} {k === "audio" ? t("dlAudio") : t("dlVideo")} · {n}
                  </button>
                );
              })}
            </div>
          )}
          {data && kind === "audio" && families.length > 2 && (
            <div className="no-scrollbar mb-2 flex gap-1 overflow-x-auto px-1">
              {families.map((fam) => (
                <button key={fam} onClick={() => setFamily(fam)} className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold uppercase", family === fam ? "border-[#1DB954] text-[#1DB954]" : "border-white/10 text-white/45 hover:text-white")}>
                  {fam === "all" ? t("allSources") : fam === "lossless" ? t("dlLossless") : fam}
                </button>
              ))}
            </div>
          )}
          {loading && <div className="flex items-center gap-2 px-3 py-8 text-sm text-white/50"><Loader2 className="size-4 animate-spin" /> {t("dlFetching")}</div>}
          {error && !loading && (
            <div className="mx-1 mb-2 flex items-start gap-2 rounded-xl bg-amber/10 px-3 py-2.5 text-xs text-amber">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span className="flex-1">{error}</span>
              {data?.external && (
                <a
                  href={data.external}
                  target="_blank"
                  rel="noreferrer"
                  className="flex shrink-0 items-center gap-1 rounded-full bg-black/30 px-2.5 py-1 font-bold"
                >
                  <ExternalLink className="size-3" /> {t("source")}
                </a>
              )}
            </div>
          )}
          {data?.note && !loading && <div className="mx-1 mb-2 flex items-start gap-2 rounded-xl bg-white/5 px-3 py-2 text-[11px] text-white/55"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /><span>{data.note}</span></div>}
          {data && !loading && (
            <div className="aura-scroll max-h-[380px] overflow-y-auto">
              {list.map((f) => <Row key={f.id} f={f} />)}
              {list.length === 0 && <p className="px-3 py-6 text-center text-xs text-white/40">{t("dlNone")}</p>}
            </div>
          )}
          <p className="mt-2 border-t border-white/[0.06] px-3 pb-1 pt-2 font-mono text-[9.5px] text-white/30">{data?.extractor ? `${data.extractor} · ` : ""}{t("dlNote")}</p>
        </>
      )}

      {/* ---------------- CLIP ---------------- */}
      {tab === "clip" && <ClipTab track={track} duration={data?.durationSec || track.durationSec} busy={busy} run={run} />}

      {/* ---------------- PAGE / LINK ---------------- */}
      {tab === "page" && <PageTab track={track} />}
    </div>
  );
}

/* ------------------------------ Clip tab ------------------------------ */
function ClipTab({ track, duration, busy, run }: { track: TrackDTO; duration: number; busy: string | null; run: (id: string, url: string, label: string, event?: string) => Promise<void> }) {
  const t = useT();
  const dur = Math.max(1, duration);
  const [sel, setSel] = useState({ start: Math.min(dur * 0.25, Math.max(0, dur - 30)), end: Math.min(dur, dur * 0.25 + 30) });
  const [drag, setDrag] = useState<"start" | "end" | null>(null);
  const [fmtId, setFmtId] = useState("mp3-320");
  const ref = useRef<HTMLDivElement>(null);
  const seek = usePlayerStore((s) => s.seek);
  const positionSec = usePlayerStore((s) => s.positionSec);
  const current = usePlayerStore((s) => s.currentTrack);
  const bars = track.waveform.length ? track.waveform : Array.from({ length: 120 }, (_, i) => Math.sin(i * 0.3) * 0.5);

  const tFromX = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return 0;
    return Math.min(dur, Math.max(0, ((clientX - r.left) / r.width) * dur));
  };
  const update = (which: "start" | "end", x: number) => {
    setSel((s) => (which === "start" ? { start: Math.min(x, s.end - 1), end: s.end } : { start: s.start, end: Math.max(x, s.start + 1) }));
    if (current?.id === track.id) seek(which === "start" ? x : Math.max(0, x - 3));
  };
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const x = tFromX(e.clientX);
    const which = Math.abs(x - sel.start) < Math.abs(x - sel.end) ? "start" : "end";
    setDrag(which);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    update(which, x);
  };
  const pct = (v: number) => `${(v / dur) * 100}%`;
  const playhead = current?.id === track.id ? positionSec / dur : null;
  const clipUrl = `/api/tracks/${track.id}/clip?start=${sel.start.toFixed(2)}&end=${sel.end.toFixed(2)}&fmt=${fmtId}`;
  const setA = () => setSel((s) => ({ ...s, start: positionSec }));
  const setB = () => setSel((s) => ({ ...s, end: positionSec }));

  return (
    <div dir="ltr">
      <div ref={ref} onPointerDown={onDown} onPointerMove={(e) => drag && update(drag, tFromX(e.clientX))} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)} className="relative h-24 w-full cursor-ew-resize touch-none select-none overflow-hidden rounded-xl bg-black/40 px-1">
        <div className="flex h-full w-full items-center gap-[1.5px]">
          {bars.map((v, i) => {
            const tt = (i / bars.length) * dur;
            const inSel = tt >= sel.start && tt <= sel.end;
            return <span key={i} className={cn("w-full rounded-full", inSel ? "bg-[#1DB954]" : "bg-white/20")} style={{ height: `${Math.max(10, Math.abs(v) * 100)}%` }} />;
          })}
        </div>
        <div className="pointer-events-none absolute inset-y-0 bg-[#1DB954]/10" style={{ left: pct(sel.start), width: `calc(${pct(sel.end)} - ${pct(sel.start)})` }} />
        {(["start", "end"] as const).map((k) => (
          <div key={k} className="pointer-events-none absolute top-0 h-full w-0.5 bg-[#1DB954]" style={{ left: pct(sel[k]) }}>
            <span className="absolute top-1 -translate-x-1/2 rounded-md bg-[#1DB954] px-1.5 py-0.5 font-mono text-[10px] font-bold text-black">{formatTime(sel[k])}</span>
            <span className="absolute bottom-1 left-1/2 size-4 -translate-x-1/2 rounded-full border-2 border-black bg-[#1DB954]" />
          </div>
        ))}
        {playhead !== null && <div className="pointer-events-none absolute top-0 h-full w-px bg-white/80" style={{ left: `${playhead * 100}%` }} />}
      </div>
      <p className="mt-2 text-center text-[11px] text-white/40">{t("clipHint")}</p>
      {/* A/B points + numeric */}
      <div className="mt-2 flex items-center gap-2">
        <button onClick={setA} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] py-1.5 text-xs font-bold text-white/80 hover:bg-white/10" title="Set A to playhead">A</button>
        <label className="flex items-center gap-1.5 rounded-xl bg-white/[0.04] px-2.5 py-1.5 text-xs text-white/60">{t("clipFrom")}<input type="number" min={0} max={Math.floor(dur)} step={0.5} value={Number(sel.start.toFixed(1))} onChange={(e) => update("start", Number(e.target.value))} className="w-14 bg-transparent text-end font-mono text-sm text-white outline-none" /></label>
        <button onClick={setB} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] py-1.5 text-xs font-bold text-white/80 hover:bg-white/10" title="Set B to playhead">B</button>
        <label className="flex items-center gap-1.5 rounded-xl bg-white/[0.04] px-2.5 py-1.5 text-xs text-white/60">{t("clipTo")}<input type="number" min={0} max={Math.floor(dur)} step={0.5} value={Number(sel.end.toFixed(1))} onChange={(e) => update("end", Number(e.target.value))} className="w-14 bg-transparent text-end font-mono text-sm text-white outline-none" /></label>
      </div>
      <p className="mt-1 text-center font-mono text-[11px] text-[#1DB954]">{formatTime(sel.end - sel.start)} · ~{(((sel.end - sel.start) * 32) / 1000).toFixed(1)} MB</p>

      {/* clip format (same qualities as full download) */}
      <p className="mt-3 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{t("clipFormat")}</p>
      <div className="no-scrollbar mt-1 flex gap-1.5 overflow-x-auto px-1">
        {CLIP_FORMATS.map((f) => (
          <button key={f.id} onClick={() => setFmtId(f.id)} className={cn("shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold", fmtId === f.id ? "border-[#1DB954] text-[#1DB954]" : "border-white/10 text-white/50 hover:text-white")}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <button onClick={() => void run("clip", clipUrl, `${t("clipSave")} ${CLIP_FORMATS.find((f) => f.id === fmtId)?.label} · ${formatTime(sel.start)}–${formatTime(sel.end)}`)} disabled={busy !== null} className="flex items-center justify-center gap-2 rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-bold text-black transition-transform hover:scale-[1.02] disabled:opacity-40">
          {busy === "clip" ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" />} {t("clipSave")}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => void run("full", `/api/tracks/${track.id}/download?fmt=mp3-320`, t("downloadFull"))} disabled={busy !== null} className="flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-xs font-semibold text-white/85 hover:bg-white/12 disabled:opacity-40">
            {busy === "full" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} {t("downloadFull")}
          </button>
          <button onClick={() => void run("preview", `/api/tracks/${track.id}/clip?start=0&end=${Math.min(30, dur).toFixed(0)}&fmt=mp3`, t("downloadPreview"))} disabled={busy !== null} className="flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-xs font-semibold text-white/85 hover:bg-white/12 disabled:opacity-40">
            {busy === "preview" ? <Loader2 className="size-4 animate-spin" /> : <Music4 className="size-4" />} {t("downloadPreview")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Page tab ------------------------------ */
function PageTab({ track }: { track: TrackDTO }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const url = links.track(track.id);
  const sourceUrl =
    track.source === "youtube" && track.sourceId ? `https://music.youtube.com/watch?v=${track.sourceId}`
    : track.source === "soundcloud" && track.sourceId ? (/^\d+$/.test(track.sourceId) ? `https://api.soundcloud.com/tracks/${track.sourceId}` : track.sourceId)
    : track.source === "dailymotion" && track.sourceId ? `https://www.dailymotion.com/video/${track.sourceId}`
    : track.source === "bandcamp" && track.sourceId ? track.sourceId
    : track.source === "odysee" && track.sourceId ? `https://odysee.com/${track.sourceId.replace("lbry://", "")}`
    : track.source === "jamendo" && track.sourceId ? `https://www.jamendo.com/track/${track.sourceId}`
    : track.source === "audius" && track.sourceId ? `https://audius.co/tracks/${track.sourceId}`
    : track.source === "archive" && track.sourceId ? `https://archive.org/details/${track.sourceId.split("/")[0]}`
    : null;
  const copy = async () => {
    const r = await shareUrl(url, track.title);
    setCopied(true);
    if (r === "copied") toast.success(t("copied"));
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="px-1">
      <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3">
        {track.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.coverUrl} alt="" className="size-16 rounded-xl object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{track.title}</p>
          <p className="truncate text-xs text-white/50">{track.artistName}{track.albumTitle ? ` · ${track.albumTitle}` : ""}</p>
          <p className="mt-1 flex items-center gap-1 text-[10px] text-white/40"><BrandIcon name={track.source} color="brand" className="size-3" /> {BRAND_LABEL[track.source] ?? track.source} · {formatTime(track.durationSec)}</p>
        </div>
      </div>
      <p className="mt-3 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{t("linkTitle")}</p>
      <div className="mt-1 flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2">
        <Link2 className="size-4 shrink-0 text-[#1DB954]" />
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-white/80 outline-none" dir="ltr" />
        <button onClick={() => void copy()} className="grid size-8 place-items-center rounded-lg bg-white/10 hover:bg-white/15" title={t("copyLink")}>{copied ? <Check className="size-4 text-[#1DB954]" /> : <Copy className="size-4" />}</button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={() => void shareTrack(track).then((r) => r === "copied" && toast.success(t("copied")))} className="flex items-center justify-center gap-2 rounded-full bg-[#1DB954] px-4 py-2.5 text-sm font-bold text-black hover:scale-[1.02]"><Share2 className="size-4" /> {t("share")}</button>
        <Link href={`/track/${track.id}`} className="flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white/85 hover:bg-white/12"><ExternalLink className="size-4" /> {t("openPage")}</Link>
        <Link href={`/artists/${track.artistId}`} className="flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-white/75 hover:bg-white/10"><UserRound className="size-4" /> {t("artist")}</Link>
        {track.albumId ? (
          <Link href={`/albums/${track.albumId}`} className="flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-white/75 hover:bg-white/10"><Disc3 className="size-4" /> {t("album")}</Link>
        ) : <span />}
        <Link href={`/reels?track=${track.id}`} className="flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-white/75 hover:bg-white/10"><Film className="size-4" /> {t("reels")}</Link>
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-white/75 hover:bg-white/10"><BrandIcon name={track.source} color="brand" className="size-4" /> {BRAND_LABEL[track.source] ?? track.source}</a>
        )}
      </div>
    </div>
  );
}
