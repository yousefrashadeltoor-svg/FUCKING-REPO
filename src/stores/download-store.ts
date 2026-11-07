"use client";

// ============================================================================
//  Downloads Center — batch download manager. Enqueue full tracks / clips /
//  surahs, then "Download all" streams each through our endpoints and saves
//  them to the device, with live status.
// ============================================================================
import { create } from "zustand";

export type DlKind = "full" | "clip" | "quran";
export type DlStatus = "queued" | "working" | "done" | "error";

export interface DlItem {
  id: string;
  title: string;
  artist: string;
  cover: string | null;
  kind: DlKind;
  preset: string;
  url: string;
  filename: string;
  status: DlStatus;
  size: number | null;
  error: string | null;
  addedAt: number;
}

interface DlState {
  items: DlItem[];
  running: boolean;
  add: (item: Omit<DlItem, "id" | "status" | "size" | "error" | "addedAt">) => void;
  remove: (id: string) => void;
  clear: () => void;
  clearDone: () => void;
  run: () => Promise<void>;
}

const uid = () => `${Date.now()}-${Math.floor(Math.random() * 1e5)}`;

function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 6000);
}

export const useDownloadStore = create<DlState>()((set, get) => ({
  items: [],
  running: false,
  add: (item) =>
    set((s) => {
      const exists = s.items.some((x) => x.url === item.url && x.kind === item.kind);
      if (exists) return s;
      return { items: [{ ...item, id: uid(), status: "queued", size: null, error: null, addedAt: Date.now() }, ...s.items] };
    }),
  remove: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
  clear: () => set({ items: [] }),
  clearDone: () => set((s) => ({ items: s.items.filter((x) => x.status !== "done" && x.status !== "error") })),
  run: async () => {
    if (get().running) return;
    set({ running: true });
    const process = async (id: string) => {
      set((s) => ({ items: s.items.map((x) => (x.id === id ? { ...x, status: "working", error: null } : x)) }));
      try {
        const res = await fetch(get().items.find((x) => x.id === id)!.url);
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(b.error ?? `HTTP ${res.status}`);
        }
        const blob = await res.blob();
        const it = get().items.find((x) => x.id === id)!;
        saveBlob(blob, it.filename);
        set((s) => ({ items: s.items.map((x) => (x.id === id ? { ...x, status: "done", size: blob.size } : x)) }));
      } catch (e) {
        set((s) => ({ items: s.items.map((x) => (x.id === id ? { ...x, status: "error", error: (e as Error).message } : x)) }));
      }
    };
    for (const it of [...get().items]) {
      if (it.status === "queued") await process(it.id);
    }
    set({ running: false });
  },
}));

/** Convenience: enqueue a full track with a preset. */
export function enqueueTrack(track: { id: number; title: string; artistName: string; coverUrl: string | null }, preset = "mp3-320") {
  useDownloadStore.getState().add({
    title: track.title,
    artist: track.artistName,
    cover: track.coverUrl,
    kind: "full",
    preset,
    url: `/api/tracks/${track.id}/download?fmt=${preset}`,
    filename: `${track.title} - ${track.artistName}.mp3`,
  });
}
