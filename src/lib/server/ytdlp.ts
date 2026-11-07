// ============================================================================
//  yt-dlp bridge — the real extractor (bundled as bin/yt-dlp zipapp, runs on
//  python3). Tries several InnerTube player clients in order; the `android`
//  client reliably bypasses the "sign in to confirm you're not a bot" wall
//  that web clients hit from datacenter IPs. Results are cached in memory
//  (URLs expire after ~6h; we keep them 40min).
// ============================================================================
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

export const YTDLP_PATH = process.env.YTDLP_PATH || path.join(process.cwd(), "bin", "yt-dlp");
export const CACHE_DIR = process.env.DONMUSE_CACHE_DIR || path.join(process.env.TMPDIR || "/tmp", "donmuse-cache");
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

export interface YtFormat {
  format_id: string;
  ext: string;
  url: string;
  protocol?: string;
  vcodec?: string;
  acodec?: string;
  abr?: number | null;
  vbr?: number | null;
  tbr?: number | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  filesize?: number | null;
  filesize_approx?: number | null;
  format_note?: string;
  resolution?: string;
  audio_channels?: number | null;
}

export interface YtInfo {
  id: string;
  title: string;
  uploader?: string;
  artist?: string;
  duration?: number;
  thumbnail?: string;
  webpage_url?: string;
  formats: YtFormat[];
  /** which player client produced this result */
  _client?: string;
}

const CLIENTS = ["android", "ios", "mweb", "tv", "web_safari", "default"];
const memCache = new Map<string, { at: number; info: YtInfo }>();
const TTL_MS = 40 * 60 * 1000;

export function runYtDlp(args: string[], timeoutMs = 90_000): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn("python3", [YTDLP_PATH, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + "\nspawn failed", code: 1 });
    });
  });
}

function usable(f: YtFormat): boolean {
  if (!f.url) return false;
  if (f.protocol === "mhtml" || f.ext === "mhtml") return false;
  if (f.vcodec === "none" && f.acodec === "none") return false;
  return true;
}

/** Extract real info + formats for any yt-dlp-supported URL (YouTube, SoundCloud, …). */
export async function extractInfo(url: string, opts: { youtube?: boolean } = {}): Promise<YtInfo> {
  const key = url;
  const cached = memCache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.info;

  const clients = opts.youtube ? CLIENTS : ["default"];
  let lastErr = "";
  for (const client of clients) {
    const args = ["-J", "--no-warnings", "--no-playlist", "--socket-timeout", "20"];
    if (opts.youtube && client !== "default") {
      args.push("--extractor-args", `youtube:player_client=${client}`);
    }
    args.push(url);
    const { stdout, stderr, code } = await runYtDlp(args);
    if (code !== 0 || !stdout.trim()) {
      lastErr = stderr.split("\n").find((l) => l.includes("ERROR")) ?? stderr.slice(-200);
      continue;
    }
    try {
      const info = JSON.parse(stdout) as YtInfo;
      info.formats = (info.formats ?? []).filter(usable);
      if (info.formats.length === 0) {
        lastErr = `client ${client}: no usable formats`;
        continue;
      }
      info._client = client;
      memCache.set(key, { at: Date.now(), info });
      return info;
    } catch {
      lastErr = "invalid JSON from yt-dlp";
    }
  }
  throw new Error(lastErr || "extraction failed");
}

/** Pick the best audio-bearing format (for transcodes). */
export function bestAudioSource(info: YtInfo): YtFormat | null {
  const withAudio = info.formats.filter((f) => f.acodec && f.acodec !== "none");
  if (withAudio.length === 0) return null;
  // Prefer audio-only (highest abr), else combined (highest tbr).
  const audioOnly = withAudio.filter((f) => !f.vcodec || f.vcodec === "none");
  const pool = audioOnly.length > 0 ? audioOnly : withAudio;
  return pool.sort((a, b) => (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0))[0] ?? null;
}

/**
 * Download a source file (via yt-dlp so HLS/DASH are handled) into the cache
 * dir and return its path. Cached per (url, format_id) for 1h.
 */
export async function downloadSource(
  url: string,
  formatId: string,
  cacheKey: string,
  opts: { youtubeClient?: string; ffmpegPath?: string } = {},
): Promise<string> {
  const safe = cacheKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  const existing = fs.readdirSync(CACHE_DIR).find((f) => f.startsWith(`${safe}.${formatId}.`));
  if (existing) {
    const full = path.join(CACHE_DIR, existing);
    const st = fs.statSync(full);
    if (Date.now() - st.mtimeMs < 60 * 60 * 1000 && st.size > 1000) return full;
    fs.rmSync(full, { force: true });
  }
  const outTpl = path.join(CACHE_DIR, `${safe}.${formatId}.%(ext)s`);
  const args = ["-q", "--no-warnings", "--no-playlist", "-f", formatId, "-o", outTpl, "--socket-timeout", "20"];
  if (opts.youtubeClient && opts.youtubeClient !== "default") {
    args.push("--extractor-args", `youtube:player_client=${opts.youtubeClient}`);
  }
  if (opts.ffmpegPath) args.push("--ffmpeg-location", opts.ffmpegPath);
  args.push(url);
  const { stderr, code } = await runYtDlp(args, 240_000);
  const produced = fs.readdirSync(CACHE_DIR).find((f) => f.startsWith(`${safe}.${formatId}.`));
  if (code !== 0 || !produced) {
    throw new Error(stderr.split("\n").find((l) => l.includes("ERROR")) ?? "download failed");
  }
  return path.join(CACHE_DIR, produced);
}

/** Housekeeping: drop cache files older than 2h (called opportunistically). */
export function sweepCache() {
  try {
    for (const f of fs.readdirSync(CACHE_DIR)) {
      const full = path.join(CACHE_DIR, f);
      if (Date.now() - fs.statSync(full).mtimeMs > 2 * 60 * 60 * 1000) fs.rmSync(full, { force: true });
    }
  } catch {
    /* ignore */
  }
}
