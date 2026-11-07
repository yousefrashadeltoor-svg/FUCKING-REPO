import { db, ensureSchema } from "@/db";
import { tracks, artists } from "@/db/schema";
import { eq } from "drizzle-orm";
import { bestAudioSource, extractInfo } from "@/lib/server/ytdlp";
import { resolveSource } from "@/lib/server/resolve-source";
import { runYtDlp } from "@/lib/server/ytdlp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/tracks/[id]/stream — Range-capable playback proxy for full-length
// sources (Audius / Internet Archive / SoundCloud). YouTube plays through the
// IFrame player, so it returns 409 here.
// ---------------------------------------------------------------------------
const HOP_BY_HOP = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "te", "trailer"]);
const ytAudioCache = new Map<number, { url: string; exp: number }>();

/**
 * `?resolve=1` returns JSON describing the playable stream instead of the audio
 * body. The Android host uses it so ExoPlayer can stream (and keep playing in
 * the background) instead of proxying the bytes through the WebView.
 */
export async function GET(req: Request, ctx: Ctx) {
  await ensureSchema();
  const { id } = await ctx.params;
  const asJson = new URL(req.url).searchParams.get("resolve") === "1";
  const trackId = Number(id);
  if (!Number.isInteger(trackId)) return Response.json({ error: "Invalid track id" }, { status: 400 });
  const [row] = await db
    .select({ source: tracks.source, sourceId: tracks.sourceId, sourceUrl: tracks.sourceUrl, title: tracks.title, durationSec: tracks.durationSec, artistId: tracks.artistId })
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1);
  if (!row) return Response.json({ error: "Track not found" }, { status: 404 });
  // YouTube: resolve a direct audio URL with yt-dlp (android client) and proxy
  // it with Range support — this routes playback through the WebAudio graph so
  // the 10-band equalizer, loudness normalisation and crossfade all work.
  let ytAudio: string | null = null;
  if (row.source === "youtube") {
    const cached = ytAudioCache.get(trackId);
    if (cached && cached.exp > Date.now()) ytAudio = cached.url;
    else {
      const { stdout, code } = await runYtDlp(["-q", "--no-warnings", "--extractor-args", "youtube:player_client=android", "-f", "140/251/140-drc/251-drc/bestaudio[acodec!=none]/18", "--get-url", `https://www.youtube.com/watch?v=${row.sourceId}`], 45_000);
      const first = stdout.split("\n").map((l) => l.trim()).find((l) => l.startsWith("http"));
      if (code === 0 && first) {
        ytAudio = first;
        ytAudioCache.set(trackId, { url: first, exp: Date.now() + 30 * 60 * 1000 });
      }
    }
    if (!ytAudio) {
      return asJson
        ? Response.json({ direct: false, url: null, embed: `https://www.youtube.com/embed/${row.sourceId}`, mime: null })
        : Response.json({ error: "YouTube audio unavailable" }, { status: 502 });
    }
  }

  const [artist] = await db.select({ name: artists.name }).from(artists).where(eq(artists.id, row.artistId)).limit(1);
  let upstreamUrl: string | null = ytAudio;
  if (["spotify", "applemusic", "deezer"].includes(row.source) && row.sourceUrl) {
    upstreamUrl = row.sourceUrl; // official 30s preview (full-length plays via the YouTube match on the client)
  }
  try {
    if (!upstreamUrl) {
    const r = await resolveSource(row.source, row.sourceId, row.sourceUrl, { trackId, title: row.title, artist: artist?.name, durationSec: row.durationSec });
    if (r?.kind === "direct") upstreamUrl = r.url;
    else if (r?.kind === "ytdlp") {
      // SoundCloud / Bandcamp / Dailymotion: pick a progressive stream when
      // available (else the best audio-bearing format) and proxy it.
      const info = await extractInfo(r.url, { youtube: r.youtube });
      const prog = info.formats.find((f) => (f.protocol === "https" || f.protocol === "http") && f.acodec && f.acodec !== "none");
      upstreamUrl = prog?.url ?? bestAudioSource(info)?.url ?? null;
    }
    }
  } catch {
    upstreamUrl = null;
  }
  if (asJson) {
    if (!upstreamUrl) {
      // YouTube without a direct URL: hand back the official embed so the app
      // can still play it instead of failing silently.
      return Response.json({
        direct: false,
        url: null,
        embed: row.source === "youtube" && row.sourceId ? `https://www.youtube.com/embed/${row.sourceId}` : null,
        mime: null,
      });
    }
    return Response.json({
      direct: true,
      url: upstreamUrl,
      mime: "audio/mpeg",
      // ExoPlayer needs a real URL; relative proxies go through our own host.
      proxy: `${new URL(req.url).origin}/api/tracks/${trackId}/stream`,
    });
  }
  if (!upstreamUrl) return Response.json({ error: "No playable stream for this track" }, { status: 404 });

  const range = req.headers.get("range");
  const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0 (DON MUSE)" };
  if (range) headers["Range"] = range;
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, { headers, redirect: "follow" });
  } catch {
    return Response.json({ error: "Upstream fetch failed" }, { status: 502 });
  }
  if (!upstream.ok && upstream.status !== 206) {
    return Response.json({ error: "Upstream unavailable" }, { status: 502 });
  }
  const out = new Headers();
  for (const [k, v] of upstream.headers) if (!HOP_BY_HOP.has(k.toLowerCase())) out.set(k, v);
  out.set("Accept-Ranges", "bytes");
  const ct = out.get("Content-Type") ?? "";
  if (!ct || ct === "application/octet-stream") out.set("Content-Type", "audio/mpeg");
  out.set("Cache-Control", "public, max-age=3600");
  out.set("Access-Control-Allow-Origin", "*");
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
