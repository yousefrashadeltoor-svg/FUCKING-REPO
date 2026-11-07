"use client";

// "My Clips" — saved radio clips (IndexedDB) with play / download / delete.
import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Download, Trash2, Radio as RadioIcon, Loader2, BookmarkCheck } from "lucide-react";
import { toast } from "sonner";
import { cn, formatTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { listClips, deleteClip, type SavedClip } from "@/lib/clipstore";

export function MyClips({ onChanged }: { onChanged?: () => void }) {
  const t = useT();
  const [clips, setClips] = useState<SavedClip[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(() => {
    void listClips().then(setClips).catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const play = (c: SavedClip) => {
    if (playing === c.id && audioRef.current) {
      audioRef.current.pause();
      setPlaying(null);
      return;
    }
    if (!audioRef.current) {
      const a = new Audio();
      a.onended = () => setPlaying(null);
      audioRef.current = a;
    }
    audioRef.current.pause();
    audioRef.current.src = URL.createObjectURL(c.blob);
    void audioRef.current.play().catch(() => {});
    setPlaying(c.id);
  };

  const download = (c: SavedClip) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(c.blob);
    a.download = `${c.name}.mp3`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const remove = async (c: SavedClip) => {
    if (playing === c.id) {
      audioRef.current?.pause();
      setPlaying(null);
    }
    await deleteClip(c.id);
    setClips((l) => l.filter((x) => x.id !== c.id));
    onChanged?.();
  };

  if (clips.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-6 text-center text-sm text-white/40">
        <BookmarkCheck className="mx-auto mb-2 size-8 text-white/20" />
        {t("noClipsYet")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {clips.map((c) => (
        <div key={c.id} className="glass-panel flex items-center gap-3 rounded-2xl p-3" dir="ltr">
          <button onClick={() => play(c)} className="grid size-11 shrink-0 place-items-center rounded-full bg-[#1DB954] text-black transition-transform hover:scale-105" aria-label="Play clip">
            {playing === c.id ? <Pause className="size-5 fill-black" /> : <Play className="ms-0.5 size-5 fill-black" />}
          </button>
          {c.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.cover} alt="" className="size-11 shrink-0 rounded-lg object-cover" />
          ) : (
            <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-white/5"><RadioIcon className="size-5 text-white/50" /></span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-bold">{c.stationName}</p>
            <p className="truncate text-[11px] text-white/45">
              {formatTime(c.start)}–{formatTime(c.end)} · {formatTime(c.seconds)} · {(c.size / 1e6).toFixed(1)} MB · {c.country}
            </p>
            <p className="truncate font-mono text-[10px] text-white/30">{new Date(c.savedAt).toLocaleString()}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={() => download(c)} className="grid size-9 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white" title="Download"><Download className="size-4" /></button>
            <button onClick={() => void remove(c)} className="grid size-9 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-rose" title="Delete"><Trash2 className="size-4" /></button>
          </div>
        </div>
      ))}
    </div>
  );
}
