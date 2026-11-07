"use client";

// Downloads Center — batch full tracks / clips / surahs with live status.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Play, Trash2, CheckCircle2, AlertCircle, Loader2, X, Inbox, Film } from "lucide-react";
import { useDownloadStore } from "@/stores/download-store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const PRESETS = [
  { id: "mp3-320", label: "MP3 320k" },
  { id: "mp3-256", label: "MP3 256k" },
  { id: "mp3-192", label: "MP3 192k" },
  { id: "mp3-128", label: "MP3 128k" },
  { id: "m4a-256", label: "AAC 256k" },
  { id: "opus-160", label: "Opus 160k" },
  { id: "flac", label: "FLAC" },
  { id: "alac", label: "ALAC" },
];

export default function DownloadsPage() {
  const t = useT();
  const { items, running, run, remove, clear, clearDone } = useDownloadStore();
  const [preset, setPreset] = useState("mp3-320");
  const queued = items.filter((i) => i.status === "queued").length;
  const done = items.filter((i) => i.status === "done").length;

  useEffect(() => {
    if (running) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight"><Download className="size-7 text-[#1DB954]" /> {t("downloadsTitle")}</h1>
          <p className="mt-1 text-sm text-white/45">{t("downloadsSub")}</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={preset} onChange={(e) => setPreset(e.target.value)} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/80 outline-none" aria-label="Default quality">
            {PRESETS.map((p) => <option key={p.id} value={p.id} className="bg-neutral-900">{p.label}</option>)}
          </select>
          <button onClick={() => void run()} disabled={queued === 0 || running} className="flex items-center gap-2 rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-bold text-black transition-transform hover:scale-105 disabled:opacity-40">
            {running ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} {t("downloadAll")} {queued ? `(${queued})` : ""}
          </button>
        </div>
      </div>

      {/* how to add */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs text-white/45">
        <Inbox className="size-4 text-white/40" />
        <span>{t("addBatch")}: </span>
        <Link href="/search" className="rounded-full border border-white/10 px-3 py-1 font-semibold text-white/70 hover:bg-white/8">Search</Link>
        <Link href="/library" className="rounded-full border border-white/10 px-3 py-1 font-semibold text-white/70 hover:bg-white/8">Library</Link>
        <span className="text-white/25">→</span>
        <span>open a song&apos;s menu (⋯) → <b className="text-[#1DB954]">{t("addBatch")}</b>, or tap “{t("downloadAll")}” on a playlist/artist page.</span>
      </div>

      {items.length === 0 ? (
        <div className="mt-10 grid place-items-center rounded-2xl border border-dashed border-white/10 py-16 text-center">
          <Inbox className="mb-3 size-10 text-white/20" />
          <p className="text-sm text-white/40">{t("batchEmpty")}</p>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-2">
          <div className="flex items-center justify-between px-1 text-xs text-white/40">
            <span>{items.length} items · {done} {t("quranComplete").toLowerCase()}</span>
            <div className="flex gap-2">
              <button onClick={clearDone} className="rounded-full border border-white/10 px-3 py-1 font-semibold text-white/60 hover:bg-white/8">Clear done</button>
              <button onClick={clear} className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 font-semibold text-white/60 hover:bg-white/8"><X className="size-3" /> Clear all</button>
            </div>
          </div>
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3" dir="ltr">
              {it.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.cover} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-white/5"><Film className="size-5 text-white/40" /></span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-bold">{it.title}</p>
                <p className="truncate text-[11px] text-white/45">{it.artist} · {PRESETS.find((p) => p.id === it.preset)?.label ?? it.preset} · {it.kind}</p>
                {it.status === "error" && <p className="truncate text-[10px] text-rose">{it.error}</p>}
              </div>
              {it.status === "queued" && <span className="rounded-full bg-white/8 px-2.5 py-1 text-[10px] font-bold text-white/60">QUEUED</span>}
              {it.status === "working" && <Loader2 className="size-5 animate-spin text-[#1DB954]" />}
              {it.status === "done" && (
                <span className="flex items-center gap-1 rounded-full bg-[#1DB954]/15 px-2.5 py-1 text-[10px] font-bold text-[#1DB954]"><CheckCircle2 className="size-3.5" />{it.size ? `${(it.size / 1e6).toFixed(1)} MB` : "OK"}</span>
              )}
              {it.status === "error" && <AlertCircle className="size-5 text-rose" />}
              <button onClick={() => remove(it.id)} className="grid size-9 shrink-0 place-items-center rounded-full text-white/40 hover:bg-white/10 hover:text-rose" aria-label="Remove"><Trash2 className="size-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
