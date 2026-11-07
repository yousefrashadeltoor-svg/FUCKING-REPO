// ============================================================================
//  DON MUSE — platform bridge
//  ---------------------------------------------------------------------------
//  The SAME web app runs in two hosts:
//    • a browser / PWA            → everything is done with web APIs
//    • the DON MUSE Android app   → the WebView is only the UI; real work is
//                                   delegated to native code through the
//                                   `DonMuseNative` javascript interface
//                                   (ExoPlayer + MediaSession, MediaStore scan,
//                                   app-private storage, widgets, download
//                                   manager, SQLite).
//
//  Nothing here ever *pretends* to work: if the native interface is missing,
//  `isNative` is false and the web implementation is used instead.
// ============================================================================

export interface DeviceSongDTO {
  id: string; // MediaStore id (string so it survives JSON)
  uri: string; // content://media/external/audio/media/123
  title: string;
  artist: string;
  artistId: string | null;
  album: string;
  albumId: string | null;
  albumArtUri: string | null;
  durationMs: number;
  mimeType: string;
  sizeBytes: number;
  dateAdded: number;
  trackNumber: number;
  year: number;
  isVideo: boolean;
}

export interface NativePlaybackState {
  playing: boolean;
  buffering: boolean;
  positionMs: number;
  durationMs: number;
  itemId: string | null;
  index: number;
  queueLength: number;
}

interface DonMuseNativeInterface {
  readonly isAndroid?: boolean;
  platformInfo(): string;
  requestPermissions(kinds: string): string;
  hasPermission(kind: string): string;
  scanMedia(kind: string): string;
  storeGet(key: string): string;
  storeSet(key: string, value: string): string;
  storeRemove(key: string): string;
  storeKeys(): string;
  playQueue(json: string): string;
  playPause(): string;
  next(): string;
  previous(): string;
  seekTo(ms: number): string;
  stopPlayback(): string;
  setVolume(volume: number): string;
  setRate(rate: number): string;
  playbackState(): string;
  updateMediaMetadata(uri: string, json: string): string;
  saveArtwork(uri: string, base64: string): string;
  downloadToMusic(url: string, filename: string, mime: string): string;
  downloadStatus(id: string): string;
  cancelDownload(id: string): string;
  refreshWidgets(): string;
  toast(message: string): string;
  vibrate(ms: number): string;
  openExternal(url: string): string;
  setSleepTimer(ms: number): string;
  diagnostics(): string;
  setPlaybackChangedCallback(name: string): string;
  setDownloadCallback(name: string): string;
}

declare global {
  interface Window {
    DonMuseNative?: DonMuseNativeInterface;
    donmuseNative?: Record<string, (...args: unknown[]) => void>;
  }
}

function bridge(): DonMuseNativeInterface | null {
  if (typeof window === "undefined") return null;
  const b = window.DonMuseNative;
  return b && typeof b.storeGet === "function" ? b : null;
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function parse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const isNativeHost = (): boolean => !!bridge();

/** Platform label used by the UI + diagnostics. */
export function platformName(): string {
  const b = bridge();
  if (b) {
    const info = parse<{ platform?: string }>(safe(() => b.platformInfo(), ""), {});
    return info.platform ?? "android";
  }
  if (typeof navigator === "undefined") return "server";
  return /android/i.test(navigator.userAgent) ? "android-web" : "web";
}

/* -------------------------------------------------------------------------- */
/*  Permissions + media library (Android only — the browser has no device DB)  */
/* -------------------------------------------------------------------------- */

export type MediaPerm = "audio" | "video" | "images" | "notifications";

export function requestMediaPermissions(kinds: MediaPerm[] = ["audio", "video", "notifications"]): boolean {
  const b = bridge();
  if (!b) return false;
  const res = parse<{ granted?: string[]; denied?: string[] }>(
    safe(() => b.requestPermissions(kinds.join(",")), '{"denied":[]}'),
    {},
  );
  return (res.denied?.length ?? 0) === 0;
}

export function hasMediaPermission(kind: MediaPerm): boolean {
  const b = bridge();
  if (!b) return false;
  return safe(() => b.hasPermission(kind), "false") === "true";
}

/** Real MediaStore scan — no upload, no copy, files stay where they are. */
export function scanDeviceMedia(kind: "audio" | "video"): DeviceSongDTO[] {
  const b = bridge();
  if (!b) return [];
  return parse<DeviceSongDTO[]>(safe(() => b.scanMedia(kind), "[]"), []);
}

/* -------------------------------------------------------------------------- */
/*  Native playback (ExoPlayer + MediaSession)                                */
/* -------------------------------------------------------------------------- */

export interface NativeQueueItem {
  id: string;
  uri: string;
  title: string;
  artist: string;
  album: string;
  artUri?: string | null;
  durationMs?: number;
  /** true for remote (http/https) streams: Quran, radio, cloud tracks */
  remote?: boolean;
}

export const nativePlayback = {
  get active(): boolean {
    const b = bridge();
    if (!b) return false;
    const s = parse<NativePlaybackState>(safe(() => b.playbackState(), "{}"), {} as NativePlaybackState);
    return !!s.itemId;
  },

  /** Can the native player take this track? Local files + remote http(s) audio. */
  canHandle(track: { streamUrl?: string; source?: string }): boolean {
    const b = bridge();
    if (!b) return false;
    const url = track.streamUrl ?? "";
    if (!url) return false;
    if (url.startsWith("content://") || url.startsWith("file://")) return true;
    if (url.startsWith("http://") || url.startsWith("https://")) return true;
    // Absolute app URLs (/api/...) become absolute against the app origin.
    if (url.startsWith("/")) return true;
    return false;
  },

  load(
    track: {
      id: number;
      title: string;
      artistName: string;
      albumTitle: string | null;
      coverUrl: string | null;
      durationSec: number;
      streamUrl: string;
      source: string;
    },
    opts: { autoplay?: boolean; startAt?: number } = {},
  ): void {
    const b = bridge();
    if (!b) return;
    const uri = track.streamUrl.startsWith("/")
      ? new URL(track.streamUrl, window.location.origin).toString()
      : track.streamUrl;
    const item: NativeQueueItem = {
      id: String(track.id),
      uri,
      title: track.title,
      artist: track.artistName,
      album: track.albumTitle ?? "",
      artUri: track.coverUrl && /^https?:/.test(track.coverUrl) ? track.coverUrl : null,
      durationMs: Math.max(0, Math.round(track.durationSec * 1000)),
      remote: /^https?:/.test(uri),
    };
    safe(
      () =>
        b.playQueue(
          JSON.stringify({
            items: [item],
            index: 0,
            autoplay: opts.autoplay !== false,
            startAtMs: Math.max(0, Math.round((opts.startAt ?? 0) * 1000)),
            volume: 1,
          }),
        ),
      "",
    );
  },

  play(): void {
    const b = bridge();
    if (b) safe(() => b.playPause(), "");
  },
  pause(): void {
    const b = bridge();
    if (b) safe(() => b.playPause(), "");
  },
  next(): void {
    const b = bridge();
    if (b) safe(() => b.next(), "");
  },
  previous(): void {
    const b = bridge();
    if (b) safe(() => b.previous(), "");
  },
  stop(): void {
    const b = bridge();
    if (b) safe(() => b.stopPlayback(), "");
  },
  seek(sec: number): void {
    const b = bridge();
    if (b) safe(() => b.seekTo(Math.max(0, Math.round(sec * 1000))), "");
  },
  setVolume(v: number): void {
    const b = bridge();
    if (b) safe(() => b.setVolume(Math.max(0, Math.min(1, v))), "");
  },
  setRate(r: number): void {
    const b = bridge();
    if (b) safe(() => b.setRate(r), "");
  },
  fadeOut(_seconds: number): void {
    // The native service handles fade + stop internally on the sleep timer.
    const b = bridge();
    if (b) safe(() => b.setVolume(0), "");
  },
  state(): NativePlaybackState {
    const b = bridge();
    if (!b) return { playing: false, buffering: false, positionMs: 0, durationMs: 0, itemId: null, index: -1, queueLength: 0 };
    return parse<NativePlaybackState>(safe(() => b.playbackState(), "{}"), {
      playing: false,
      buffering: false,
      positionMs: 0,
      durationMs: 0,
      itemId: null,
      index: -1,
      queueLength: 0,
    });
  },
  get position(): number {
    return nativePlayback.state().positionMs / 1000;
  },
  get duration(): number {
    return nativePlayback.state().durationMs / 1000;
  },
  get isPlaying(): boolean {
    return nativePlayback.state().playing;
  },
  setSleepTimer(ms: number): void {
    const b = bridge();
    if (b) safe(() => b.setSleepTimer(ms), "");
  },
  /** Subscribe to native state pushes (notification / lock-screen / widget). */
  onState(cb: (state: NativePlaybackState) => void): () => void {
    if (typeof window === "undefined") return () => {};
    const registry = (window.donmuseNative ??= {});
    const name = `__donmusePlayback_${Math.random().toString(36).slice(2)}`;
    registry[name] = (val) => cb(typeof val === "string" ? (JSON.parse(val) as NativePlaybackState) : (val as NativePlaybackState));
    const b = bridge();
    if (b) safe(() => b.setPlaybackChangedCallback(name), "");
    return () => {
      delete registry[name];
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  App-private persistent storage (SharedPreferences in the Android app)      */
/* -------------------------------------------------------------------------- */

export const nativeStore = {
  get available(): boolean {
    return !!bridge();
  },
  get(key: string): string | null {
    const b = bridge();
    if (!b) return null;
    const v = safe(() => b.storeGet(key), "");
    return v === "" ? null : v;
  },
  set(key: string, value: string): void {
    const b = bridge();
    if (b) safe(() => b.storeSet(key, value), "");
  },
  remove(key: string): void {
    const b = bridge();
    if (b) safe(() => b.storeRemove(key), "");
  },
  keys(): string[] {
    const b = bridge();
    if (!b) return [];
    return parse<string[]>(safe(() => b.storeKeys(), "[]"), []);
  },
};

/* -------------------------------------------------------------------------- */
/*  Library extras                                                            */
/* -------------------------------------------------------------------------- */

/** Apply metadata edits to the REAL file row (MediaStore) on Android. */
export function updateDeviceMetadata(
  uri: string,
  meta: { title?: string; artist?: string; album?: string; year?: number },
): { ok: boolean; message: string } {
  const b = bridge();
  if (!b) return { ok: false, message: "Editing the device library requires the Android app." };
  return parse<{ ok: boolean; message: string }>(
    safe(() => b.updateMediaMetadata(uri, JSON.stringify(meta)), '{"ok":false,"message":"failed"}'),
    { ok: false, message: "failed" },
  );
}

/** Replace embedded artwork of a device track (written into the real file). */
export function writeDeviceArtwork(uri: string, base64: string): { ok: boolean; message: string } {
  const b = bridge();
  if (!b) return { ok: false, message: "Artwork writing requires the Android app." };
  return parse<{ ok: boolean; message: string }>(
    safe(() => b.saveArtwork(uri, base64), '{"ok":false,"message":"failed"}'),
    { ok: false, message: "failed" },
  );
}

/** Save a remote audio file into the device Music collection (real download). */
export function downloadToDeviceLibrary(url: string, filename: string, mime = "audio/mpeg"): string {
  const b = bridge();
  if (!b) return "";
  return safe(() => b.downloadToMusic(url, filename, mime), "");
}

export function refreshWidgets(): void {
  const b = bridge();
  if (b) safe(() => b.refreshWidgets(), "");
}

export function vibrate(ms = 12): void {
  const b = bridge();
  if (b) {
    safe(() => b.vibrate(ms), "");
    return;
  }
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(ms);
    } catch {
      /* unsupported */
    }
  }
}

export function openExternal(url: string): void {
  const b = bridge();
  if (b) {
    safe(() => b.openExternal(url), "");
    return;
  }
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
}

export function nativeToast(message: string): void {
  const b = bridge();
  if (b) safe(() => b.toast(message), "");
}

/** Runtime diagnostics reported by the native host (or the browser). */
export function nativeDiagnostics(): Record<string, unknown> {
  const b = bridge();
  if (b) return parse<Record<string, unknown>>(safe(() => b.diagnostics(), "{}"), {});
  if (typeof navigator === "undefined") return {};
  const nav = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number };
  return {
    platform: platformName(),
    userAgent: nav.userAgent,
    language: nav.language,
    online: nav.onLine,
    cores: nav.hardwareConcurrency ?? null,
    deviceMemoryGb: nav.deviceMemory ?? null,
    screen: typeof window !== "undefined" ? `${window.screen.width}x${window.screen.height}@${window.devicePixelRatio}` : null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
