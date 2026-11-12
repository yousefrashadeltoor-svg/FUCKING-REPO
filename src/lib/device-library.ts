
// ============================================================================
//  DON MUSE — device library ("موسيقاي")
//  ---------------------------------------------------------------------------
//  Android app : reads the REAL MediaStore rows through the native bridge —
//                files are played from their own location (content:// URI).
//                Nothing is uploaded, copied or duplicated; the library's own
//                playlists / edits live in app-private storage.
//  Web / PWA   : the system file picker; blobs stay in the browser media cache.
// ============================================================================

import {
  type DeviceSongDTO,
  isNativeHost,
  scanDeviceMedia,
  updateDeviceMetadata,
  writeDeviceArtwork,
  pickNativeMedia,
} from "@/lib/platform/native";
import type { TrackDTO } from "@/lib/types";
import { remember } from "@/lib/local/state";
import { stableId } from "@/lib/local/model";

export type DeviceItem = DeviceSongDTO;

export interface LocalPlaylist {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** playable track ids (device ids or web file ids) */
  trackIds: string[];
  coverUri: string | null;
}

export interface LocalLibrary {
  /** app starts here when the device is offline */
  songs: DeviceItem[];
  videos: DeviceItem[];
  playlists: LocalPlaylist[];
  /** played counts, last position, favourites — all app-private */
  stats: Record<string, { plays: number; lastPlayed: number; positionMs: number; favourite?: boolean }>;
  lastScan: number;
  webFiles?: { id: string; name: string; size: number; type: string }[];
}

const EMPTY: LocalLibrary = { songs: [], videos: [], playlists: [], stats: {}, lastScan: 0 };

export const DEVICE_LIBRARY_KEY = "donmuse.device.library";

/* -------------------------------------------------------------------------- */
/*  Persistence (local browser storage / Android private files)              */
/* -------------------------------------------------------------------------- */

import { platformStorage } from "@/lib/storage";

export async function loadLocalLibrary(): Promise<LocalLibrary> {
  try {
    const raw = await platformStorage.getItem(DEVICE_LIBRARY_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as LocalLibrary;
    return {
      songs: Array.isArray(parsed.songs) ? parsed.songs : [],
      videos: Array.isArray(parsed.videos) ? parsed.videos : [],
      playlists: Array.isArray(parsed.playlists) ? parsed.playlists : [],
      stats: parsed.stats && typeof parsed.stats === "object" ? parsed.stats : {},
      lastScan: typeof parsed.lastScan === "number" ? parsed.lastScan : 0,
      webFiles: parsed.webFiles ?? [],
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function saveLocalLibrary(lib: LocalLibrary): Promise<void> {
  await platformStorage.setItem(DEVICE_LIBRARY_KEY, JSON.stringify(lib));
}

/* -------------------------------------------------------------------------- */
/*  Scanning                                                                  */
/* -------------------------------------------------------------------------- */

export interface ScanResult {
  songs: DeviceItem[];
  videos: DeviceItem[];
  source: "mediastore" | "file-system" | "none";
  message: string;
}

/** Native MediaStore scan (Android). Returns empty list on the web. */
export async function scanNative(): Promise<ScanResult> {
  if (!isNativeHost()) {
    return { songs: [], videos: [], source: "none", message: "native-unavailable" };
  }
  const [songs, videos] = await Promise.all([scanDeviceMedia("audio"), scanDeviceMedia("video")]);
  return {
    songs,
    videos,
    source: "mediastore",
    message: `${songs.length} songs · ${videos.length} videos`,
  };
}

/* ----------------------------- web file picker ---------------------------- */

const FILE_CACHE = "donmuse-media-files-v1";
const fileKey = (id: string) => `/__donmuse_file__/${encodeURIComponent(id)}`;
export function supportsFileSystemAccess(): boolean { return isNativeHost() || typeof caches !== "undefined"; }

/** SAF on Android; a local media cache in the browser. No IndexedDB server. */
export async function pickWebFiles(): Promise<DeviceItem[]> {
  if (isNativeHost()) return pickNativeMedia();
  const files = await new Promise<File[]>(resolve => {
    const input=document.createElement("input");input.type="file";input.multiple=true;input.accept="audio/*,video/*";
    input.onchange=()=>resolve(Array.from(input.files??[]));input.oncancel=()=>resolve([]);input.click();
  });
  const cache=await caches.open(FILE_CACHE);
  const items:DeviceItem[]=[];
  for(const file of files){
    const id=`web:${file.name}:${file.size}:${file.lastModified}`;
    await cache.put(fileKey(id),new Response(file,{headers:{"Content-Type":file.type||"audio/mpeg"}}));
    const tags=await readTags(file).catch(()=>null);
    items.push({id,uri:`webfile:${id}`,title:tags?.title||file.name.replace(/\.[^.]+$/,""),artist:tags?.artist||"فنان غير معروف",artistId:null,album:tags?.album||"ملفاتي",albumId:null,albumArtUri:tags?.cover??null,durationMs:0,mimeType:file.type||"audio/mpeg",sizeBytes:file.size,dateAdded:file.lastModified,trackNumber:0,year:tags?.year??0,isVideo:file.type.startsWith("video/")});
  }
  return items;
}
const urlCache=new Map<string,string>();
export async function resolveWebFileUrl(id:string):Promise<string|null>{
  if(urlCache.has(id))return urlCache.get(id)!;
  const cache=await caches.open(FILE_CACHE);const response=await cache.match(fileKey(id));if(!response)return null;
  const url=URL.createObjectURL(await response.blob());urlCache.set(id,url);return url;
}
export async function removeWebFile(id:string):Promise<void>{await (await caches.open(FILE_CACHE)).delete(fileKey(id));const u=urlCache.get(id);if(u)URL.revokeObjectURL(u);urlCache.delete(id);}

/* -------------------------------------------------------------------------- */
/*  Minimal ID3v2 + MP4 tag reader (title / artist / album / year / cover)     */
/* -------------------------------------------------------------------------- */

export interface ParsedTags {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  cover?: string;
}

/* eslint-disable no-control-regex -- ID3 text is NUL padded. */
function decodeText(bytes: Uint8Array, encoding: number): string {
  if (encoding === 1 || encoding === 2) {
    const decoder = new TextDecoder(encoding === 1 ? "utf-16" : "utf-16be");
    return decoder.decode(bytes).replace(/\u0000+$/, "").trim();
  }
  if (encoding === 3) return new TextDecoder("utf-8").decode(bytes).replace(/\u0000+$/, "").trim();
  return new TextDecoder("latin1").decode(bytes).replace(/\u0000+$/, "").trim();
}

/* eslint-enable no-control-regex */

export async function readTags(file: Blob): Promise<ParsedTags> {
  const head = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
  const out: ParsedTags = {};
  if (head.length > 10 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
    const size = (head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9];
    let offset = 10;
    const end = Math.min(head.length, 10 + size);
    while (offset + 10 < end) {
      const id = String.fromCharCode(head[offset], head[offset + 1], head[offset + 2], head[offset + 3]);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const frameSize = (head[offset + 4] << 24) | (head[offset + 5] << 16) | (head[offset + 6] << 8) | head[offset + 7];
      if (frameSize <= 0 || offset + 10 + frameSize > end) break;
      const payload = head.subarray(offset + 10, offset + 10 + frameSize);
      const enc = payload[0];
      if (id === "TIT2") out.title = decodeText(payload.subarray(1), enc);
      else if (id === "TPE1") out.artist = decodeText(payload.subarray(1), enc);
      else if (id === "TALB") out.album = decodeText(payload.subarray(1), enc);
      else if (id === "TYER" || id === "TDRC") out.year = Number(decodeText(payload.subarray(1), enc).slice(0, 4)) || undefined;
      else if (id === "APIC") {
        let i = 1;
        while (i < payload.length && payload[i] !== 0) i++;
        const mime = decodeText(payload.subarray(1, i), 0);
        i += 2; // skip mime terminator + picture type
        while (i < payload.length && payload[i] !== 0) i++;
        i += 1;
        const data = payload.subarray(i);
        if (data.length > 64) {
          out.cover = URL.createObjectURL(new Blob([data as unknown as BlobPart], { type: mime || "image/jpeg" }));
        }
      }
      offset += 10 + frameSize;
    }
    return out;
  }
  // MP4 / M4A: look for the ©nam / ©ART / ©alb atoms in the header window.
  const text = new TextDecoder("latin1").decode(head);
  const grab = (atom: string): string | undefined => {
    const idx = text.indexOf(atom);
    if (idx < 0) return undefined;
    const start = idx + 4 + 4;
    const chunk = text.slice(start, start + 200).replace(/[^\x20-\x7E\u0600-\u06FF]/g, "").trim();
    return chunk || undefined;
  };
  out.title = grab("©nam");
  out.artist = grab("©ART");
  out.album = grab("©alb");
  return out;
}

/* -------------------------------------------------------------------------- */
/*  DeviceItem → TrackDTO (so the ONE player can play device media)           */
/* -------------------------------------------------------------------------- */

export function deviceItemToTrack(item: DeviceItem, streamUrl: string): TrackDTO {
  const track: TrackDTO = {
    id: hashId(item.id),
    title: item.title,
    artistId: stableId(`artist:${item.artist}`),
    artistName: item.artist || "Unknown artist",
    albumId: stableId(`album:${item.artist}:${item.album}`),
    albumTitle: item.album || null,
    coverUrl: item.albumArtUri,
    durationSec: Math.round((item.durationMs || 0) / 1000),
    source: "local",
    sourceId: item.id,
    previewUrl: null,
    streamUrl,
    waveform: [],
    loudnessLufs: -14,
    bpm: 0,
    key: null,
    energy: 0.5,
    valence: 0.5,
    danceability: 0.5,
    acousticness: 0.5,
    explicit: false,
    genre: item.isVideo ? "video" : "device",
    language: "",
    year: item.year || 0,
    isrc: null,
    codec: item.mimeType.split("/")[1] ?? "mp3",
    bitrate: 0,
    lossless: /flac|wav|alac/i.test(item.mimeType),
    playCount: 0,
    lyrics: [],
    liked: false,
    isDeviceItem: true,
    localUri: item.uri,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
  };
  remember([track]);
  return track;
}

/** Negative-safe stable numeric id for device items (never clashes with DB ids). */
export function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return -Math.abs(h || 1) - 1_000_000;
}

/* -------------------------------------------------------------------------- */
/*  Editing the real files                                                    */
/* -------------------------------------------------------------------------- */

export interface EditResult {
  ok: boolean;
  message: string;
}

export async function applyMetadataEdit(
  item: DeviceItem,
  patch: { title?: string; artist?: string; album?: string; year?: number },
): Promise<EditResult> {
  if (isNativeHost()) {
    const res = await updateDeviceMetadata(item.uri, patch);
    return { ok: res.ok, message: res.message || (res.ok ? "saved" : "failed") };
  }
  return {
    ok: false,
    message: "تعديل الأصل متاح في تطبيق أندرويد · Editing the original file needs the Android app.",
  };
}

export async function applyArtworkEdit(item: DeviceItem, base64: string): Promise<EditResult> {
  if (isNativeHost()) {
    const res = await writeDeviceArtwork(item.uri, base64);
    return { ok: res.ok, message: res.message || (res.ok ? "saved" : "failed") };
  }
  return { ok: false, message: "تغيير الغلاف متاح في تطبيق أندرويد." };
}

/* -------------------------------------------------------------------------- */
/*  Grouping helpers                                                          */
/* -------------------------------------------------------------------------- */

export interface Group {
  key: string;
  name: string;
  items: DeviceItem[];
  cover: string | null;
  durationMs: number;
}

export function groupByArtist(items: DeviceItem[]): Group[] {
  const map = new Map<string, Group>();
  for (const it of items) {
    const key = (it.artist || "Unknown artist").toLowerCase();
    const g = map.get(key) ?? { key, name: it.artist || "Unknown artist", items: [], cover: null, durationMs: 0 };
    g.items.push(it);
    g.durationMs += it.durationMs || 0;
    g.cover ||= it.albumArtUri;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

export function groupByAlbum(items: DeviceItem[]): Group[] {
  const map = new Map<string, Group>();
  for (const it of items) {
    const key = `${(it.album || "Unknown album").toLowerCase()}::${(it.artist || "").toLowerCase()}`;
    const g = map.get(key) ?? { key, name: it.album || "Unknown album", items: [], cover: null, durationMs: 0 };
    g.items.push(it);
    g.durationMs += it.durationMs || 0;
    g.cover ||= it.albumArtUri;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ar"));
}
