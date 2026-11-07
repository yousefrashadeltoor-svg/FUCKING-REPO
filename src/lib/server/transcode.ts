// ============================================================================
//  ffmpeg transcode pipeline (ffmpeg-static 7.x).
//  Produces the download catalog (many audio codecs × bitrates, each with an
//  estimated size) and renders a chosen preset from a source file with the
//  cover art embedded (ID3v2 APIC for MP3, covr for M4A/ALAC, PICTURE for FLAC).
// ============================================================================
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { CACHE_DIR } from "./ytdlp";

export const FFMPEG_PATH: string = (ffmpegStatic as unknown as string) || "ffmpeg";

export interface AudioPreset {
  id: string; // e.g. "mp3-320"
  label: string; // "MP3 · 320 kbps"
  ext: string;
  mime: string;
  codec: "libmp3lame" | "aac" | "libopus" | "libvorbis" | "flac" | "alac" | "pcm_s16le";
  bitrateKbps: number; // 0 = lossless (estimate)
  container: string; // ffmpeg -f
  lossless: boolean;
  coverSupported: boolean;
}

export const AUDIO_PRESETS: AudioPreset[] = [
  // --- lossless ---
  { id: "flac", label: "FLAC · Lossless 16-bit", ext: "flac", mime: "audio/flac", codec: "flac", bitrateKbps: 900, container: "flac", lossless: true, coverSupported: true },
  { id: "alac", label: "ALAC · Apple Lossless", ext: "m4a", mime: "audio/mp4", codec: "alac", bitrateKbps: 850, container: "ipod", lossless: true, coverSupported: true },
  { id: "wav", label: "WAV · PCM 16-bit", ext: "wav", mime: "audio/wav", codec: "pcm_s16le", bitrateKbps: 1411, container: "wav", lossless: true, coverSupported: false },
  // --- mp3 ---
  { id: "mp3-320", label: "MP3 · 320 kbps", ext: "mp3", mime: "audio/mpeg", codec: "libmp3lame", bitrateKbps: 320, container: "mp3", lossless: false, coverSupported: true },
  { id: "mp3-256", label: "MP3 · 256 kbps", ext: "mp3", mime: "audio/mpeg", codec: "libmp3lame", bitrateKbps: 256, container: "mp3", lossless: false, coverSupported: true },
  { id: "mp3-192", label: "MP3 · 192 kbps", ext: "mp3", mime: "audio/mpeg", codec: "libmp3lame", bitrateKbps: 192, container: "mp3", lossless: false, coverSupported: true },
  { id: "mp3-160", label: "MP3 · 160 kbps", ext: "mp3", mime: "audio/mpeg", codec: "libmp3lame", bitrateKbps: 160, container: "mp3", lossless: false, coverSupported: true },
  { id: "mp3-128", label: "MP3 · 128 kbps", ext: "mp3", mime: "audio/mpeg", codec: "libmp3lame", bitrateKbps: 128, container: "mp3", lossless: false, coverSupported: true },
  { id: "mp3-96", label: "MP3 · 96 kbps", ext: "mp3", mime: "audio/mpeg", codec: "libmp3lame", bitrateKbps: 96, container: "mp3", lossless: false, coverSupported: true },
  { id: "mp3-64", label: "MP3 · 64 kbps (data saver)", ext: "mp3", mime: "audio/mpeg", codec: "libmp3lame", bitrateKbps: 64, container: "mp3", lossless: false, coverSupported: true },
  // --- aac / m4a ---
  { id: "m4a-320", label: "AAC M4A · 320 kbps", ext: "m4a", mime: "audio/mp4", codec: "aac", bitrateKbps: 320, container: "ipod", lossless: false, coverSupported: true },
  { id: "m4a-256", label: "AAC M4A · 256 kbps", ext: "m4a", mime: "audio/mp4", codec: "aac", bitrateKbps: 256, container: "ipod", lossless: false, coverSupported: true },
  { id: "m4a-192", label: "AAC M4A · 192 kbps", ext: "m4a", mime: "audio/mp4", codec: "aac", bitrateKbps: 192, container: "ipod", lossless: false, coverSupported: true },
  { id: "m4a-128", label: "AAC M4A · 128 kbps", ext: "m4a", mime: "audio/mp4", codec: "aac", bitrateKbps: 128, container: "ipod", lossless: false, coverSupported: true },
  { id: "m4a-96", label: "AAC M4A · 96 kbps", ext: "m4a", mime: "audio/mp4", codec: "aac", bitrateKbps: 96, container: "ipod", lossless: false, coverSupported: true },
  // --- opus ---
  { id: "opus-256", label: "Opus · 256 kbps", ext: "opus", mime: "audio/ogg", codec: "libopus", bitrateKbps: 256, container: "opus", lossless: false, coverSupported: false },
  { id: "opus-160", label: "Opus · 160 kbps", ext: "opus", mime: "audio/ogg", codec: "libopus", bitrateKbps: 160, container: "opus", lossless: false, coverSupported: false },
  { id: "opus-128", label: "Opus · 128 kbps", ext: "opus", mime: "audio/ogg", codec: "libopus", bitrateKbps: 128, container: "opus", lossless: false, coverSupported: false },
  { id: "opus-96", label: "Opus · 96 kbps", ext: "opus", mime: "audio/ogg", codec: "libopus", bitrateKbps: 96, container: "opus", lossless: false, coverSupported: false },
  { id: "opus-64", label: "Opus · 64 kbps", ext: "opus", mime: "audio/ogg", codec: "libopus", bitrateKbps: 64, container: "opus", lossless: false, coverSupported: false },
  { id: "opus-48", label: "Opus · 48 kbps (voice)", ext: "opus", mime: "audio/ogg", codec: "libopus", bitrateKbps: 48, container: "opus", lossless: false, coverSupported: false },
  // --- ogg vorbis ---
  { id: "ogg-256", label: "OGG Vorbis · 256 kbps", ext: "ogg", mime: "audio/ogg", codec: "libvorbis", bitrateKbps: 256, container: "ogg", lossless: false, coverSupported: false },
  { id: "ogg-192", label: "OGG Vorbis · 192 kbps", ext: "ogg", mime: "audio/ogg", codec: "libvorbis", bitrateKbps: 192, container: "ogg", lossless: false, coverSupported: false },
  { id: "ogg-128", label: "OGG Vorbis · 128 kbps", ext: "ogg", mime: "audio/ogg", codec: "libvorbis", bitrateKbps: 128, container: "ogg", lossless: false, coverSupported: false },
];

export function presetById(id: string): AudioPreset | undefined {
  return AUDIO_PRESETS.find((p) => p.id === id);
}

/** Estimated output size in bytes for a preset at a given duration. */
export function estimateSize(p: AudioPreset, durationSec: number): number {
  return Math.round((p.bitrateKbps * 1000 * durationSec) / 8);
}

function run(args: string[], timeoutMs = 300_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_PATH, ["-hide_banner", "-loglevel", "error", "-y", ...args], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(err.trim().split("\n").pop() ?? `ffmpeg exited ${code}`));
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

/** Download the cover to a temp jpg (returns null on failure). */
export async function fetchCover(url: string | null, key: string): Promise<string | null> {
  if (!url) return null;
  const out = path.join(CACHE_DIR, `${key.replace(/[^a-zA-Z0-9_-]/g, "_")}.cover.jpg`);
  if (fs.existsSync(out) && fs.statSync(out).size > 500) return out;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 500) return null;
    fs.writeFileSync(out, buf);
    return out;
  } catch {
    return null;
  }
}

export interface TranscodeMeta {
  title: string;
  artist: string;
  album?: string | null;
  year?: number | null;
  comment?: string;
}

/**
 * Render `preset` from `sourcePath` into a cached output file (with cover +
 * tags) and return the output path. Cached per (source, preset).
 */
export async function transcode(
  sourcePath: string,
  preset: AudioPreset,
  meta: TranscodeMeta,
  coverPath: string | null,
  cacheKey: string,
): Promise<string> {
  const safe = cacheKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  const out = path.join(CACHE_DIR, `${safe}.${preset.id}.${preset.ext}`);
  if (fs.existsSync(out) && fs.statSync(out).size > 1000) return out;

  const args: string[] = ["-i", sourcePath];
  const withCover = coverPath && preset.coverSupported;
  if (withCover) args.push("-i", coverPath);
  args.push("-map", "0:a:0");
  if (withCover) args.push("-map", "1:v:0");

  // audio codec
  args.push("-c:a", preset.codec);
  if (!preset.lossless) args.push("-b:a", `${preset.bitrateKbps}k`);
  if (preset.codec === "libmp3lame") args.push("-id3v2_version", "3", "-write_id3v1", "1");
  if (preset.codec === "aac") args.push("-aac_coder", "twoloop");
  if (preset.codec === "libopus") args.push("-vbr", "on", "-application", "audio");
  if (preset.codec === "pcm_s16le") args.push("-ar", "44100", "-ac", "2");

  // cover art
  if (withCover) {
    args.push("-c:v", "mjpeg", "-disposition:v:0", "attached_pic");
    args.push("-metadata:s:v", "title=Album cover", "-metadata:s:v", "comment=Cover (front)");
  } else {
    args.push("-vn");
  }

  // tags
  args.push("-metadata", `title=${meta.title}`);
  args.push("-metadata", `artist=${meta.artist}`);
  if (meta.album) args.push("-metadata", `album=${meta.album}`);
  if (meta.year) args.push("-metadata", `date=${meta.year}`);
  args.push("-metadata", `comment=${meta.comment ?? "Downloaded with DON MUSE"}`);
  args.push("-metadata", "encoded_by=DON MUSE");

  if (preset.container === "ipod") args.push("-movflags", "+faststart");
  args.push("-f", preset.container, out);

  try {
    await run(args);
  } catch (err) {
    // Retry without cover if the cover stream caused the failure.
    if (withCover) {
      const retry = args.filter((_, i) => true);
      void retry;
      const noCoverArgs: string[] = ["-i", sourcePath, "-map", "0:a:0", "-vn", "-c:a", preset.codec];
      if (!preset.lossless) noCoverArgs.push("-b:a", `${preset.bitrateKbps}k`);
      noCoverArgs.push("-metadata", `title=${meta.title}`, "-metadata", `artist=${meta.artist}`, "-f", preset.container, out);
      await run(noCoverArgs);
    } else {
      throw err;
    }
  }
  return out;
}

/** Remux the original (native) format into its own container, adding cover + tags when possible. */
export async function remuxNative(
  sourcePath: string,
  ext: string,
  meta: TranscodeMeta,
  coverPath: string | null,
  cacheKey: string,
): Promise<string> {
  const safe = cacheKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  const out = path.join(CACHE_DIR, `${safe}.native.${ext}`);
  if (fs.existsSync(out) && fs.statSync(out).size > 1000) return out;
  const isMp4Family = ext === "mp4" || ext === "m4a";
  const args: string[] = ["-i", sourcePath];
  const withCover = coverPath && (isMp4Family || ext === "mp3");
  if (withCover) args.push("-i", coverPath);
  args.push("-map", "0");
  if (withCover) args.push("-map", "1:v:0", "-c", "copy", "-c:v:1", "mjpeg", "-disposition:v:1", "attached_pic");
  else args.push("-c", "copy");
  args.push("-metadata", `title=${meta.title}`, "-metadata", `artist=${meta.artist}`);
  if (isMp4Family) args.push("-movflags", "+faststart");
  args.push(out);
  try {
    await run(args);
    return out;
  } catch {
    return sourcePath; // fall back to the raw file
  }
}
