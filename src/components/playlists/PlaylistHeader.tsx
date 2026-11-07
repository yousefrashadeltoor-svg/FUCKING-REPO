"use client";

// Playlist detail header: cover mosaic, title, meta, play-all + add-track UI.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Plus, Trash2, Share2, DownloadCloud } from "lucide-react";
import Link from "next/link";
import { enqueueTrack } from "@/stores/download-store";
import { links, shareUrl } from "@/lib/share";
import { toast } from "sonner";
import { formatTime } from "@/lib/utils";
import { usePlayerStore } from "@/stores/player-store";
import { playQueueNow } from "@/lib/player-actions";
import type { PlaylistDetailDTO } from "@/lib/types";
import { useT } from "@/lib/i18n";

export function PlaylistHeader({ playlist }: { playlist: PlaylistDetailDTO }) {
  const t = useT();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: number; title: string; artistName: string }[]>([]);

  const search = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
    const data = (await res.json()) as { tracks: { id: number; title: string; artistName: string }[] };
    setResults(data.tracks.slice(0, 6));
  };

  const addTrack = async (trackId: number) => {
    const res = await fetch(`/api/playlists/${playlist.id}/tracks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId }),
    });
    if (res.ok) {
      toast.success(t("trackAdded"));
      setAdding(false);
      setResults([]);
      setQuery("");
      router.refresh();
    } else {
      toast.error("Could not add track");
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete playlist “${playlist.title}”?`)) return;
    const res = await fetch(`/api/playlists/${playlist.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(t("playlistDeleted"));
      router.push("/library");
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/[0.07] to-transparent p-6 md:p-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-end">
        {playlist.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={playlist.coverUrl}
            alt={playlist.title}
            className="size-40 rounded-2xl object-cover shadow-2xl md:size-48"
          />
        ) : (
          <div className="grid size-40 rounded-2xl bg-gradient-to-br from-[#4E54C8] to-[#FA2D55] md:size-48" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/40">{t("playlist")}</p>
          <h1 className="mt-1 truncate text-3xl font-black tracking-tight md:text-5xl">{playlist.title}</h1>
          {playlist.description && <p className="mt-2 max-w-xl text-sm text-white/50">{playlist.description}</p>}
          <p className="mt-2 text-[13px] text-white/40">
            {playlist.ownerName} · {playlist.trackCount} {t("tracks")} · {formatTime(playlist.durationSec)}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => playlist.tracks.length > 0 && playQueueNow(playlist.tracks, 0)}
              disabled={playlist.tracks.length === 0}
              className="flex items-center gap-2 rounded-full bg-[#1DB954] px-6 py-2.5 text-sm font-bold text-black transition-transform hover:scale-105 disabled:opacity-40"
            >
              <Play className="size-4 fill-black" /> {t("play")}
            </button>
            <button
              onClick={() => setAdding((v) => !v)}
              className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/12"
            >
              <Plus className="size-4" /> {t("addTrack")}
            </button>
            <button
              onClick={remove}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/50 transition-colors hover:bg-rose/20 hover:text-rose"
            >
              <Trash2 className="size-4" /> {t("delete")}
            </button>
            <button onClick={() => void shareUrl(links.playlist(playlist.id), playlist.title).then((r) => r === "copied" && toast.success(t("copied")))} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/12"><Share2 className="size-4" /> {t("share")}</button>
            <Link href="/downloads" onClick={() => { playlist.tracks.forEach((tr) => enqueueTrack(tr, "mp3-320")); toast(t("addBatch"), { description: `${playlist.tracks.length} → ${t("downloads")}` }); }} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/12"><DownloadCloud className="size-4" /> {t("downloadAll")} ({playlist.tracks.length})</Link>
          </div>
          {adding && (
            <div className="relative mt-3 max-w-sm">
              <input
                value={query}
                onChange={(e) => void search(e.target.value)}
                placeholder={t("searchToAdd")}
                className="w-full rounded-xl border border-white/15 bg-black/50 px-4 py-2.5 text-sm outline-none placeholder:text-white/30 focus:border-white/30"
                autoFocus
              />
              {results.length > 0 && (
                <div className="glass-modal absolute z-20 mt-1 w-full rounded-xl p-1.5">
                  {results.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => void addTrack(r.id)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] hover:bg-white/10"
                    >
                      <span className="truncate font-medium">{r.title}</span>
                      <span className="ml-3 shrink-0 text-xs text-white/40">{r.artistName}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
