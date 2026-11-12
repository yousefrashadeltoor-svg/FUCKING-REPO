// Saved radio clips use the same engine as every other source: no second audio
// pipeline, no overlap with music, and native clips survive WebView destruction.
import { useCallback, useEffect, useState } from "react";
import { Play, Pause, Download, Trash2, Radio as RadioIcon, BookmarkCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { listClips, deleteClip, type SavedClip } from "@/lib/clipstore";
import { isNativeHost, nativeClipUri, deleteNativeClip } from "@/lib/platform/native";
import { makeTrack } from "@/lib/local/model";
import { playListNow, toggleNow, stopAllNow } from "@/lib/audio/controller";
import { usePlayerStore } from "@/stores/player-store";
import { useDownloadStore } from "@/stores/download-store";

let webClipUrl: string | null = null;
const sourceId = (id: string) => `clip:${id}`;
function releaseWebClip() { if (webClipUrl) URL.revokeObjectURL(webClipUrl); webClipUrl = null; }

export function MyClips({ onChanged }: { onChanged?: () => void }) {
  const t = useT();
  const [clips, setClips] = useState<SavedClip[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const current = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const load = useCallback(() => { void listClips().then(setClips).catch(e => toast.error((e as Error).message)); }, []);
  useEffect(() => { load(); }, [load]);

  const play = async (c: SavedClip) => {
    if (current?.sourceId === sourceId(c.id)) { toggleNow(); return; }
    setBusy(c.id);
    try {
      const uri = isNativeHost() ? await nativeClipUri(c.id, c.blob) : (releaseWebClip(), webClipUrl = URL.createObjectURL(c.blob), webClipUrl);
      const track = makeTrack({ title: c.name, artistName: c.stationName, source: "internal", sourceId: sourceId(c.id), streamUrl: uri, localUri: isNativeHost() ? uri : undefined, coverUrl: c.cover, durationSec: c.seconds || c.blob.size / 16000, mimeType: c.blob.type, codec: "audio", genre: "Radio clip" });
      playListNow([track], 0, "clips");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const download = async (c: SavedClip) => {
    const ext = c.blob.type.includes("aac") ? "aac" : "mp3";
    if (isNativeHost()) {
      try {
        const url = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error("تعذّر قراءة المقطع")); r.readAsDataURL(c.blob); });
        await useDownloadStore.getState().init();
        useDownloadStore.getState().add({ title: c.name, artist: c.stationName, cover: c.cover, kind: "clip", preset: "original", formatId: "local-clip", url, sourceUrl: `donmuse://clips/${c.id}`, filename: `DON-MUSE-radio-${c.id}.${ext}`, mime: c.blob.type });
        toast.success("أُضيف المقطع إلى التنزيل للحفظ في ملفات الجهاز");
      } catch (e) { toast.error((e as Error).message); }
      return;
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(c.blob); a.download = `${c.name}.${ext}`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const remove = async (c: SavedClip) => {
    if (current?.sourceId === sourceId(c.id)) { stopAllNow(); releaseWebClip(); }
    try { await deleteClip(c.id); await deleteNativeClip(c.id); setClips(l => l.filter(x => x.id !== c.id)); onChanged?.(); } catch (e) { toast.error((e as Error).message); }
  };

  if (!clips.length) return <div className="glass-panel rounded-2xl p-6 text-center text-sm text-[color:var(--app-muted)]"><BookmarkCheck className="mx-auto mb-2 size-8 opacity-50" />{t("noClipsYet")}</div>;
  return <div className="flex flex-col gap-2">{clips.map(c => {
    const active = current?.sourceId === sourceId(c.id); const playing = active && isPlaying;
    return <div key={c.id} className="glass-panel flex items-center gap-3 rounded-2xl p-3" dir="ltr">
      <button onClick={() => void play(c)} disabled={busy !== null} className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--app-accent)] text-black transition-transform hover:scale-105 disabled:opacity-50" aria-label={playing ? "Pause clip" : "Play clip"}>{busy === c.id ? <Loader2 className="size-5 animate-spin" /> : playing ? <Pause className="size-5 fill-black" /> : <Play className="ms-0.5 size-5 fill-black" />}</button>
      {c.cover ? <img src={c.cover} alt="" className="size-14 shrink-0 rounded-xl object-cover" /> : <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-white/5"><RadioIcon className="size-6 text-[color:var(--app-muted)]" /></span>}
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{c.stationName}</p><p className="truncate text-xs text-[color:var(--app-muted)]">{formatTime(c.start)}–{formatTime(c.end)} · {formatTime(c.seconds)} · {(c.size / 1e6).toFixed(1)} MB · {c.country}</p><p className="truncate font-mono text-[10px] text-[color:var(--app-muted)]">{new Date(c.savedAt).toLocaleString()}</p></div>
      <div className="flex shrink-0 items-center gap-1"><button onClick={() => void download(c)} className="grid size-11 place-items-center rounded-full text-[color:var(--app-muted)] hover:bg-white/10" title={t("download")} aria-label={t("download")}><Download className="size-4" /></button><button onClick={() => void remove(c)} className="grid size-11 place-items-center rounded-full text-[color:var(--app-muted)] hover:bg-rose-500/10 hover:text-rose-400" title={t("delete")} aria-label={t("delete")}><Trash2 className="size-4" /></button></div>
    </div>;
  })}</div>;
}
