"use client";

// «موسيقاي» — device library store.
// Holds the real device scan plus app-private playlists/edits and exposes the
// work needed to turn a device item into a playable track for the ONE player.
import { create } from "zustand";
import {
  type DeviceItem,
  type LocalLibrary,
  type LocalPlaylist,
  loadLocalLibrary,
  saveLocalLibrary,
  scanNative,
  pickWebFiles,
  resolveWebFileUrl,
  deviceItemToTrack,
  hashId,
  applyMetadataEdit,
  applyArtworkEdit,
  type EditResult,
} from "@/lib/device-library";
import { isNativeHost, hasMediaPermission, requestMediaPermissions, type MediaPerm } from "@/lib/platform/native";
import type { TrackDTO } from "@/lib/types";
import { usePlayerStore } from "@/stores/player-store";
import { playListNow, startTrack } from "@/lib/audio/controller";

const uid = () => `pl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

interface DeviceLibraryState {
  loaded: boolean;
  scanning: boolean;
  error: string | null;
  songs: DeviceItem[];
  videos: DeviceItem[];
  playlists: LocalPlaylist[];
  stats: LocalLibrary["stats"];
  lastScan: number;
  /** real stream URL resolution (content:// on Android, object URL on web) */
  init: () => Promise<void>;
  scan: () => Promise<void>;
  grant: (kinds?: MediaPerm[]) => Promise<boolean>;
  hasPermission: () => boolean;
  addWebFiles: () => Promise<void>;
  createPlaylist: (name: string, trackIds?: string[]) => LocalPlaylist;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (playlistId: string, trackIds: string[]) => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;
  updateItem: (
    id: string,
    patch: { title?: string; artist?: string; album?: string; year?: number; coverDataUrl?: string },
  ) => Promise<EditResult>;
  toggleFavourite: (id: string) => void;
  markPlayed: (id: string) => void;
  /** Build a playable TrackDTO list and start playback. */
  playItems: (items: DeviceItem[], index: number, origin?: string) => Promise<void>;
  trackFor: (id: string) => Promise<TrackDTO | null>;
}

async function streamUrlFor(item: DeviceItem): Promise<string> {
  if (item.uri.startsWith("content://") || item.uri.startsWith("file://") || item.uri.startsWith("http")) {
    return item.uri;
  }
  if (item.uri.startsWith("webfile:")) {
    const url = await resolveWebFileUrl(item.id);
    return url ?? "";
  }
  return item.uri;
}

export const useDeviceLibrary = create<DeviceLibraryState>()((set, get) => ({
  loaded: false,
  scanning: false,
  error: null,
  songs: [],
  videos: [],
  playlists: [],
  stats: {},
  lastScan: 0,

  init: async () => {
    if (get().loaded) return;
    const lib = await loadLocalLibrary();
    set({
      loaded: true,
      songs: lib.songs,
      videos: lib.videos,
      playlists: lib.playlists,
      stats: lib.stats,
      lastScan: lib.lastScan,
    });
    // First launch inside the Android app: ask once, then scan automatically.
    if (isNativeHost() && lib.songs.length === 0) {
      const granted = get().hasPermission();
      if (granted) void get().scan();
    }
  },

  scan: async () => {
    set({ scanning: true, error: null });
    try {
      const result = scanNative();
      if (result.source === "mediastore") {
        const merged = { ...get().stats };
        set({
          songs: result.songs,
          videos: result.videos,
          scanning: false,
          lastScan: Date.now(),
          stats: merged,
        });
        await saveLocalLibrary({
          songs: result.songs,
          videos: result.videos,
          playlists: get().playlists,
          stats: merged,
          lastScan: Date.now(),
        });
      } else {
        set({ scanning: false, lastScan: Date.now() });
      }
    } catch (e) {
      set({ scanning: false, error: (e as Error).message });
    }
  },

  grant: async (kinds = ["audio", "video", "notifications"]) => {
    const ok = requestMediaPermissions(kinds);
    if (ok) await get().scan();
    return ok;
  },

  hasPermission: () => {
    if (!isNativeHost()) return true;
    return hasMediaPermission("audio");
  },

  addWebFiles: async () => {
    set({ scanning: true });
    try {
      const items = await pickWebFiles();
      if (items.length === 0) {
        set({ scanning: false });
        return;
      }
      const audio = items.filter((i) => !i.isVideo);
      const video = items.filter((i) => i.isVideo);
      const songs = [...get().songs.filter((s) => !audio.some((a) => a.id === s.id)), ...audio];
      const videos = [...get().videos.filter((s) => !video.some((a) => a.id === s.id)), ...video];
      set({ songs, videos, scanning: false, lastScan: Date.now() });
      await saveLocalLibrary({
        songs,
        videos,
        playlists: get().playlists,
        stats: get().stats,
        lastScan: Date.now(),
      });
    } catch (e) {
      set({ scanning: false, error: (e as Error).message });
    }
  },

  createPlaylist: (name, trackIds = []) => {
    const pl: LocalPlaylist = {
      id: uid(),
      name: name.trim() || "قائمة جديدة",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      trackIds: [...new Set(trackIds)],
      coverUri: null,
    };
    const playlists = [pl, ...get().playlists];
    set({ playlists });
    void saveLocalLibrary({ ...get(), playlists });
    return pl;
  },

  renamePlaylist: (id, name) => {
    const playlists = get().playlists.map((p) =>
      p.id === id ? { ...p, name: name.trim() || p.name, updatedAt: Date.now() } : p,
    );
    set({ playlists });
    void saveLocalLibrary({ ...get(), playlists });
  },

  deletePlaylist: (id) => {
    const playlists = get().playlists.filter((p) => p.id !== id);
    set({ playlists });
    void saveLocalLibrary({ ...get(), playlists });
  },

  addToPlaylist: (playlistId, trackIds) => {
    const playlists = get().playlists.map((p) =>
      p.id === playlistId
        ? { ...p, trackIds: [...new Set([...p.trackIds, ...trackIds])], updatedAt: Date.now() }
        : p,
    );
    set({ playlists });
    void saveLocalLibrary({ ...get(), playlists });
  },

  removeFromPlaylist: (playlistId, trackId) => {
    const playlists = get().playlists.map((p) =>
      p.id === playlistId
        ? { ...p, trackIds: p.trackIds.filter((t) => t !== trackId), updatedAt: Date.now() }
        : p,
    );
    set({ playlists });
    void saveLocalLibrary({ ...get(), playlists });
  },

  updateItem: async (id, patch) => {
    const item = [...get().songs, ...get().videos].find((i) => i.id === id);
    if (!item) return { ok: false, message: "not-found" };
    let result: EditResult = { ok: true, message: "saved" };

    if (isNativeHost()) {
      if (patch.coverDataUrl) {
        const base64 = patch.coverDataUrl.split(",")[1] ?? "";
        result = await applyArtworkEdit(item, base64);
      }
      const meta = await applyMetadataEdit(item, {
        title: patch.title,
        artist: patch.artist,
        album: patch.album,
        year: patch.year,
      });
      if (!meta.ok && !patch.coverDataUrl) result = meta;
    }

    // Mirror the edit locally so the UI reflects it even if the OS refused.
    const apply = (list: DeviceItem[]) =>
      list.map((i) =>
        i.id === id
          ? {
              ...i,
              title: patch.title ?? i.title,
              artist: patch.artist ?? i.artist,
              album: patch.album ?? i.album,
              year: patch.year ?? i.year,
              albumArtUri: patch.coverDataUrl ?? i.albumArtUri,
            }
          : i,
      );
    const songs = apply(get().songs);
    const videos = apply(get().videos);
    set({ songs, videos });
    await saveLocalLibrary({
      songs,
      videos,
      playlists: get().playlists,
      stats: get().stats,
      lastScan: get().lastScan,
    });
    return result;
  },

  toggleFavourite: (id) => {
    const stats = { ...get().stats };
    const cur = stats[id] ?? { plays: 0, lastPlayed: 0, positionMs: 0 };
    stats[id] = { ...cur, favourite: !cur.favourite };
    set({ stats });
    void saveLocalLibrary({ ...get(), stats });
  },

  markPlayed: (id) => {
    const stats = { ...get().stats };
    const cur = stats[id] ?? { plays: 0, lastPlayed: 0, positionMs: 0 };
    stats[id] = { ...cur, plays: cur.plays + 1, lastPlayed: Date.now() };
    set({ stats });
    void saveLocalLibrary({ ...get(), stats });
  },

  trackFor: async (id) => {
    const item = [...get().songs, ...get().videos].find((i) => i.id === id);
    if (!item) return null;
    const url = await streamUrlFor(item);
    if (!url) return null;
    const track = deviceItemToTrack(item, url);
    const liked = get().stats[id]?.favourite === true;
    return liked ? { ...track, liked: true } : track;
  },

  playItems: async (items, index, origin = "my-music") => {
    if (items.length === 0) return;
    const tracks: TrackDTO[] = [];
    for (const item of items) {
      const url = await streamUrlFor(item);
      if (!url) continue;
      tracks.push(deviceItemToTrack(item, url));
    }
    if (tracks.length === 0) return;
    const startIndex = Math.max(0, Math.min(index, tracks.length - 1));
    get().markPlayed(items[Math.min(startIndex, items.length - 1)].id);
    playListNow(tracks, startIndex, origin);
  },
}));

/** Convenience: number of playable items. */
export const deviceTrackId = hashId;

/** Direct play for a single resolved device track (used after async resolve). */
export function playDeviceTrack(track: TrackDTO): void {
  const store = usePlayerStore.getState();
  store.playTrack(track, { origin: "my-music" });
  startTrack(track);
}
