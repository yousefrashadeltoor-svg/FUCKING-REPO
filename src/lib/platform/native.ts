// Secure, local-first Android bridge. The random capability is injected only
// into the bundled app document; remote frames cannot invoke native methods.
import type { DownloadFormatDTO, TrackDTO } from "@/lib/types";

export interface DeviceSongDTO {
  id: string; uri: string; title: string; artist: string; artistId: string | null;
  album: string; albumId: string | null; albumArtUri: string | null;
  durationMs: number; mimeType: string; sizeBytes: number; dateAdded: number;
  trackNumber: number; year: number; isVideo: boolean;
}
export interface ResolvedStream { url: string; direct: boolean; mime: string | null; embed: string | null; headers?: Record<string,string>; expiry?: number }
export interface NativePlaybackState {
  playing: boolean; buffering: boolean; positionMs: number; durationMs: number;
  itemId: string | null; index: number; queueLength: number; error?: string | null;
  ended?: boolean; audioSessionId?: number; track?: TrackDTO | null;
}
export interface NativeQueueItem {
  id: string; uri: string; title: string; artist: string; album: string;
  artUri?: string | null; durationMs?: number; remote?: boolean;
  headers?: Record<string,string>; resolveUrl?: string; mime?: string; track?: TrackDTO;
}
export interface FormatsResult {
  source: string; sourceUrl: string; title: string; durationSec: number; coverUrl: string | null;
  extractor: string; note: string | null; video: DownloadFormatDTO[]; audio: DownloadFormatDTO[];
}
export interface DownloadJob {
  id: string; title: string; artist: string; cover: string | null; sourceUrl: string;
  kind?: "full" | "clip" | "quran";
  url: string; filename: string; mime: string; formatId: string; preset: string;
  status: "queued" | "working" | "paused" | "done" | "error"; progress: number;
  received: number; total: number; error: string | null; uri?: string; size?: number;
  startSec?: number; endSec?: number; headers?: Record<string,string>; addedAt: number;
}
export type MediaPerm = "audio" | "video" | "images" | "notifications" | "exactAlarm";
interface NativeRaw {
  [method: string]: ((token: string, ...args: (string | number)[]) => string) | undefined;
}
declare global {
  interface Window {
    __DM_NATIVE_TOKEN__?: string;
    DonMuseNative?: NativeRaw;
    donmuseNative?: Record<string, (payload: unknown) => void>;
    __donmuseNativeEvent?: (name: string, payload: string) => void;
    __donmuseNativeReply?: (id: string, ok: boolean, payload: string) => void;
  }
}
const emptyState = (): NativePlaybackState => ({ playing:false, buffering:false, positionMs:0, durationMs:0, itemId:null, index:-1, queueLength:0 });
let cachedState = emptyState();
const stateListeners = new Set<(s: NativePlaybackState) => void>();
const asyncJobs = new Map<string, { resolve: (s: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
let seq = 0;

export const isNativeHost = (): boolean => typeof window !== "undefined" && !!window.__DM_NATIVE_TOKEN__ && !!window.DonMuseNative;
function parse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}
function call<T>(method: string, args: (string | number)[], fallback: T): T {
  if (!isNativeHost()) return fallback;
  try {
    const fn = window.DonMuseNative?.[method];
    if (typeof fn !== "function") return fallback;
    return parse(fn(window.__DM_NATIVE_TOKEN__!, ...args), fallback);
  } catch { return fallback; }
}

if (typeof window !== "undefined") {
  window.donmuseNative ??= {};
  window.__donmuseNativeReply = (id, ok, payload) => {
    const job = asyncJobs.get(id);
    if (!job) return;
    clearTimeout(job.timer); asyncJobs.delete(id);
    if (ok) job.resolve(payload); else job.reject(new Error(payload || "تعذّر تنفيذ العملية على الجهاز"));
  };
  window.__donmuseNativeEvent = (name, payload) => {
    if (name === "playback") {
      cachedState = { ...emptyState(), ...parse<NativePlaybackState>(payload, emptyState()) };
      stateListeners.forEach(cb => cb(cachedState));
    }
    window.dispatchEvent(new CustomEvent(`donmuse:native:${name}`, { detail: parse<unknown>(payload, null) }));
    window.donmuseNative?.[name]?.(payload);
  };
}

export function nativeRequest<T>(method: string, args: Record<string, unknown> = {}, timeoutMs = 45_000): Promise<T> {
  if (!isNativeHost()) return Promise.reject(new Error("هذه الإمكانية متاحة في تطبيق أندرويد"));
  return new Promise<T>((resolve, reject) => {
    const id = `dm-${Date.now()}-${++seq}`;
    const timer = setTimeout(() => { asyncJobs.delete(id); reject(new Error("انتهت مهلة العملية؛ حاول مرة أخرى")); }, timeoutMs);
    asyncJobs.set(id, { resolve: raw => resolve(parse<T>(raw, null as T)), reject, timer });
    try {
      const fn = window.DonMuseNative?.requestAsync;
      if (typeof fn !== "function") throw new Error("جسر أندرويد غير متاح");
      const ack = parse<{ok:boolean;error?:string}>(fn(window.__DM_NATIVE_TOKEN__!, id, method, JSON.stringify(args)), {ok:false});
      if (!ack.ok) throw new Error(ack.error || "العملية غير مدعومة");
    } catch (e) { clearTimeout(timer); asyncJobs.delete(id); reject(e instanceof Error ? e : new Error(String(e))); }
  });
}

export function platformName(): string { return isNativeHost() ? "android" : typeof navigator !== "undefined" && /android/i.test(navigator.userAgent) ? "android-web" : "web"; }
export function platformInfo(): Record<string, unknown> { return call("platformInfo", [], {}); }
export async function requestMediaPermissions(kinds: MediaPerm[] = ["audio"]): Promise<boolean> {
  if (!isNativeHost()) return false;
  try { const r = await nativeRequest<{denied:string[]}>("permissions", {kinds}, 180_000); return r.denied.length === 0; } catch { return false; }
}
export function hasMediaPermission(kind: MediaPerm): boolean { return call("hasPermission", [kind], false); }
export function openPermissionSettings(kind: MediaPerm): void { call("openPermissionSettings", [kind], ""); }
export async function scanDeviceMedia(kind: "audio" | "video"): Promise<DeviceSongDTO[]> { return nativeRequest<DeviceSongDTO[]>("scanMedia", {kind}, 60_000); }
export async function pickNativeMedia(): Promise<DeviceSongDTO[]> { return nativeRequest<DeviceSongDTO[]>("pickMedia", {}, 180_000); }
export async function pickNativeImage(): Promise<string> { return nativeRequest<string>("pickImage", {}, 180_000); }

function absoluteMediaUrl(raw: string): string {
  if (/^(https?|content|file):/.test(raw)) return raw;
  if (raw.startsWith("/")) return new URL(raw, window.location.origin).toString();
  return raw;
}
function queueItem(t: TrackDTO, uri = t.streamUrl): NativeQueueItem {
  const sourceUrl = t.source === "youtube" && t.sourceId ? `https://www.youtube.com/watch?v=${encodeURIComponent(t.sourceId)}` : absoluteMediaUrl(uri);
  const needsResolver = /^(youtube|soundcloud|bandcamp|dailymotion|odysee)$/.test(t.source) && !/^content:/.test(uri);
  return { id:String(t.id), uri:needsResolver ? `donmuse-resolve:${sourceUrl}` : absoluteMediaUrl(uri), title:t.title, artist:t.artistName,
    album:t.albumTitle ?? "", artUri:t.coverUrl, durationMs:Math.round(t.durationSec*1000),
    remote:/^https?:/.test(uri), resolveUrl:needsResolver ? sourceUrl : undefined, mime:t.mimeType };
}

export const nativePlayback = {
  get active() { return !!cachedState.itemId; },
  canHandle(track: {streamUrl?:string; source?:string; codec?:string}) {
    return isNativeHost() && track.codec !== "iframe" && /^(https?|content|file|donmuse-resolve):/.test(track.streamUrl ?? "");
  },
  async resolve(track: TrackDTO): Promise<ResolvedStream | null> {
    if (!isNativeHost()) return null;
    if (/^(content|file):/.test(track.streamUrl)) return {url:track.streamUrl,direct:true,mime:track.mimeType ?? null,embed:null};
    const url = track.source === "youtube" && track.sourceId ? `https://www.youtube.com/watch?v=${encodeURIComponent(track.sourceId)}` : absoluteMediaUrl(track.streamUrl);
    try { return await nativeRequest<ResolvedStream>("resolveStream", {url, source:track.source}, 60_000); } catch { return null; }
  },
  load(track: TrackDTO, opts: {autoplay?:boolean; startAt?:number; uri?:string; queue?:NativeQueueItem[]; queueIndex?:number} = {}) {
    const item = queueItem(track, opts.uri);
    call("playQueue", [JSON.stringify({items:opts.queue?.length ? opts.queue : [item],index:opts.queueIndex ?? 0,autoplay:opts.autoplay !== false,startAtMs:Math.round((opts.startAt ?? 0)*1000),tracks:[track]})], "");
  },
  queue(tracks: TrackDTO[], index: number, autoplay = true) {
    const items = tracks.filter(t => t.codec !== "iframe" && /^(https?|content|file):/.test(t.streamUrl)).map(t => queueItem(t));
    call("playQueue", [JSON.stringify({items,index,autoplay,startAtMs:0})], "");
  },
  updateQueue(items: NativeQueueItem[], index: number) { call("updateQueue", [JSON.stringify({queue:{items,index}})], ""); },
  play() { call("play", [], ""); },
  pause() { call("pause", [], ""); },
  next() { call("next", [], ""); },
  previous() { call("previous", [], ""); },
  stop() { call("stopPlayback", [], ""); cachedState = emptyState(); },
  seek(sec: number) { call("seekTo", [Math.max(0,Math.round(sec*1000))], ""); },
  setVolume(v: number) { call("setVolume", [Math.max(0,Math.min(1,v))], ""); },
  setRate(r: number) { call("setRate", [r], ""); },
  setEq(bands: number[]) { call("setEq", [JSON.stringify(bands)], ""); },
  setRepeat(mode: "off"|"all"|"one") { call("setRepeat", [mode], ""); },
  setShuffle(value: boolean) { call("setShuffle", [value ? "1" : "0"], ""); },
  fadeOut(seconds: number) { call("fadeOut", [seconds], ""); },
  state() { return cachedState; },
  refresh() { cachedState = call<NativePlaybackState>("playbackState", [], emptyState()); stateListeners.forEach(cb => cb(cachedState)); return cachedState; },
  get position() { return cachedState.positionMs/1000; },
  get duration() { return cachedState.durationMs/1000; },
  get isPlaying() { return cachedState.playing; },
  setSleepTimer(ms: number) { call("setSleepTimer", [ms], ""); },
  onState(cb: (state: NativePlaybackState) => void) { stateListeners.add(cb); return () => { stateListeners.delete(cb); }; },
};

export const nativeStore = {
  get available() { return isNativeHost(); },
  get(key: string): string|null { const v = call("storeGet", [key], ""); return v === "" ? null : v; },
  set(key: string, value: string) { call("storeSet", [key,value], ""); },
  remove(key: string) { call("storeRemove", [key], ""); },
  keys(): string[] { return call("storeKeys", [], []); },
};
export async function updateDeviceMetadata(uri: string, meta: {title?:string;artist?:string;album?:string;year?:number}) {
  return nativeRequest<{ok:boolean;message:string}>("updateMediaMetadata", {uri,meta});
}
export async function writeDeviceArtwork(uri: string, base64: string) {
  return nativeRequest<{ok:boolean;message:string}>("saveArtwork", {uri,base64});
}
export function resolveTrackFormats(track: TrackDTO): Promise<FormatsResult> {
  const url = track.source === "youtube" && track.sourceId ? `https://www.youtube.com/watch?v=${encodeURIComponent(track.sourceId)}` : absoluteMediaUrl(track.streamUrl);
  return nativeRequest<FormatsResult>("resolveFormats", {url,title:track.title,cover:track.coverUrl}, 90_000);
}
export function resolveLinkFormats(url: string): Promise<FormatsResult> { return nativeRequest<FormatsResult>("resolveFormats", {url}, 90_000); }
export function enqueueNativeDownload(job: Partial<DownloadJob> & {sourceUrl:string;filename:string}): Promise<DownloadJob> {
  return nativeRequest<DownloadJob>("enqueueDownload", {job}, 30_000);
}
export function nativeDownloads(): DownloadJob[] { return call("downloadJobs", [], []); }
export function downloadAction(id: string, action: "cancel"|"pause"|"resume"|"retry"): Promise<DownloadJob | null> { return nativeRequest("downloadAction", {id,action}); }
export function downloadToDeviceLibrary(url: string, filename: string, mime = "audio/mpeg"): string {
  void enqueueNativeDownload({sourceUrl:url,url,filename,mime,title:filename,formatId:"original",preset:"original"}).catch(() => {});
  return "queued";
}
export function refreshWidgets(): void { call("refreshWidgets", [], ""); }
export function vibrate(ms = 12): void { if (isNativeHost()) call("vibrate", [ms], ""); else navigator.vibrate?.(ms); }
export function openExternal(url: string): void {
  if (!/^https?:\/\//i.test(url)) return;
  if (isNativeHost()) call("openExternal", [url], ""); else window.open(url,"_blank","noopener,noreferrer");
}
export function nativeToast(message: string): void { call("toast", [message], ""); }
export function nativeDiagnostics(): Record<string,unknown> {
  if (isNativeHost()) return call("diagnostics", [], {});
  return {platform:platformName(),online:navigator.onLine,cores:navigator.hardwareConcurrency,screen:`${screen.width}x${screen.height}`,storage:"device-local"};
}
export async function nativeSearch(query: string, source = "youtube"): Promise<TrackDTO[]> { return nativeRequest<TrackDTO[]>("searchMedia", {query,source}, 60_000); }
export async function onlineJson<T>(url: string): Promise<T> {
  if (isNativeHost()) return nativeRequest<T>("httpJson", {url}, 60_000);
  const r = await fetch(url,{signal:AbortSignal.timeout(20_000)});
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
}
export interface NativeAlarm { id:string; at:number; label:string; repeatDays:number[]; soundUri:string|null; enabled:boolean }
export function scheduleNativeAlarm(alarm: NativeAlarm): Promise<NativeAlarm> { return nativeRequest("scheduleAlarm", {alarm}); }
export function cancelNativeAlarm(id: string): Promise<boolean> { return nativeRequest("cancelAlarm", {id}); }
export function nativeAlarms(): NativeAlarm[] { return call("alarms", [], []); }
export function openExactAlarmSettings(): void { call("openPermissionSettings", ["exactAlarm"], ""); }
export function showNativeNotification(title: string, body: string): Promise<boolean> { return nativeRequest("notify", {title,body}); }
export function openBatterySettings(): void { call("openBatterySettings", [], ""); }
export function requestWidgetPin(): Promise<boolean> { return nativeRequest("pinWidget", {}); }

/** Lossless local edit of a captured radio buffer. Never uploads the recording. */
export function transcodeRadioClip(input: Blob, startSec: number, endSec: number): Promise<Blob> {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onerror=()=>reject(new Error("تعذّر قراءة التسجيل"));
    reader.onload=async()=>{try{const base64=String(reader.result).split(",")[1];const r=await nativeRequest<{base64:string;mime:string}>("transcodeClip",{base64,mime:input.type,startSec,endSec},180_000);const bytes=Uint8Array.from(atob(r.base64),c=>c.charCodeAt(0));resolve(new Blob([bytes],{type:r.mime}));}catch(e){reject(e);}};reader.readAsDataURL(input);
  });
}

/** Copy a saved browser clip into app-private storage so ExoPlayer can outlive
 * the WebView. Blob URLs are document-scoped and must never enter a restore queue. */
export async function nativeClipUri(id: string, blob: Blob): Promise<string> {
  const base64 = await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(",")[1] ?? "");r.onerror=()=>reject(new Error("تعذّر قراءة المقطع"));r.readAsDataURL(blob);});
  const result=await nativeRequest<{uri:string}>("openLocalClip",{id,base64,mime:blob.type},60_000);
  return result.uri;
}
export async function deleteNativeClip(id: string): Promise<void> { if(isNativeHost()) await nativeRequest("deleteLocalClip",{id}); }
