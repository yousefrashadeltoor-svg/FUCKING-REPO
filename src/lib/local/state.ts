import { platformStorage } from "@/lib/storage";
import { usePlayerStore } from "@/stores/player-store";
import { emptySnapshot, rememberTracks, type LocalSnapshot } from "./model";
import type { TrackDTO } from "@/lib/types";

const KEY = "donmuse.local.v1";
let snapshot: LocalSnapshot = emptySnapshot();
let ready: Promise<void> | null = null;
let saveChain: Promise<void> = Promise.resolve();
let timer: ReturnType<typeof setTimeout> | null = null;

export function hydrateLocal(): Promise<void> {
  if (!ready) ready = (async () => {
    try {
      const raw = await platformStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<LocalSnapshot>;
        if (parsed.schema === 1) snapshot = { ...emptySnapshot(), ...parsed };
      }
    } catch { /* A corrupt/old cache never prevents the local library opening. */ }
  })();
  return ready;
}

export function localSnapshot(): LocalSnapshot { return snapshot; }
export function localTrack(id: number): TrackDTO | null { return snapshot.tracks[String(id)] ?? null; }
export function remember(tracks: TrackDTO[]): void {
  rememberTracks(snapshot, tracks);
  scheduleSave();
}
export function recordHistory(trackId: number, seconds: number): void {
  if (!localTrack(trackId)) return;
  const last = snapshot.history[0];
  if (last?.trackId === trackId && Date.now() - last.at < 30_000) last.seconds += seconds;
  else snapshot.history.unshift({ trackId, at: Date.now(), seconds });
  // Bound metadata growth; actual audio is stored separately in the media cache.
  snapshot.history = snapshot.history.slice(0, 2000);
  scheduleSave();
}
export function mutateLocal(fn: (state: LocalSnapshot) => void): void {
  fn(snapshot);
  scheduleSave();
  window.dispatchEvent(new Event("donmuse:refresh"));
}
export function scheduleSave(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const raw = JSON.stringify(snapshot);
    saveChain = saveChain.then(() => platformStorage.setItem(KEY, raw)).catch(() => {
      window.dispatchEvent(new CustomEvent("donmuse:storage-error"));
    });
  }, 250);
}
export function flushLocal(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  const raw = JSON.stringify(snapshot);
  saveChain = saveChain.then(() => platformStorage.setItem(KEY, raw));
  return saveChain;
}
export function likedLocalTracks(): TrackDTO[] {
  const ids = usePlayerStore.getState().likedIds;
  return ids.map(localTrack).filter((t): t is TrackDTO => !!t);
}
export async function exportLocalBackup(): Promise<Blob> {
  await flushLocal();
  const keys = ["aura-settings", "aura-player", "aura-ui", "donmuse.device.library", "donmuse.downloads.v1"];
  const preferences: Record<string, string | null> = {};
  for (const key of keys) preferences[key] = await platformStorage.getItem(key);
  return new Blob([JSON.stringify({ app: "DON MUSE", schema: 1, exportedAt: new Date().toISOString(), snapshot, preferences }, null, 2)], { type: "application/json" });
}
