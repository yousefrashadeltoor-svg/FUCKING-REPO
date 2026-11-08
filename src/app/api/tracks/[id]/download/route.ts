import { NextRequest } from "next/server";
import fs from "node:fs";
import { Readable } from "node:stream";
import { db, ensureSchema } from "@/db";
import { tracks, artists, albums } from "@/db/schema";
import { eq } from "drizzle-orm";
import { bestAudioSource, downloadSource, extractInfo, sweepCache } from "@/lib/server/ytdlp";
import { FFMPEG_PATH, fetchCover, presetById, remuxNative, transcode } from "@/lib/server/transcode";
import { resolveSource } from "@/lib/server/resolve-source";
import { CACHE_DIR } from "@/lib/server/ytdlp";
import { canDownload, externalFallback, policyFor } from "@/lib/playback-policy";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
//  GET /api/tracks/[id]/download?fmt=<preset|native:<format_id>>
//  Real file download with cover art + tags:
//   1. source file via yt-dlp (YouTube android client / SoundCloud HLS) or a
//      direct fetch (Audius / Internet Archive) — cached on disk
//   2. ffmpeg renders the requested preset (or remuxes the native stream)
//   3. the finished file is streamed with an exact Content-Length
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest, ctx: Ctx) {
  await ensureSchema();
  const { id } = await ctx.params;
  const trackId = Number(id);
  const fmt = req.nextUrl.searchParams.get("fmt") ?? "mp3-320";
  if (!Number.isInteger(trackId)) return Response.json({ error: "Invalid track id" }, { status: 400 });

  const [row] = await db
    .select({
      source: tracks.source,
      sourceId: tracks.sourceId,
      title: tracks.title,
      year: tracks.year,
      artistId: tracks.artistId,
      albumId: tracks.albumId,
      sourceUrl: tracks.sourceUrl,
      durationSec: tracks.durationSec,
    })
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1);
  if (!row || (!row.sourceId && !row.sourceUrl)) return Response.json({ error: "Track not found" }, { status: 404 });

  // Respect the source's policy before touching any extractor or file.
  if (!canDownload(row.source)) {
    const policy = policyFor(row.source);
    return Response.json(
      {
        error: policy.note,
        blocked: true,
        source: row.source,
        external: externalFallback(row.source, row.sourceId),
      },
      { status: 403 },
    );
  }
  const [artist] = await db.select({ name: artists.name }).from(artists).where(eq(artists.id, row.artistId)).limit(1);
  const album = row.albumId
    ? (await db.select({ title: albums.title, coverUrl: albums.coverUrl }).from(albums).where(eq(albums.id, row.albumId)).limit(1))[0]
    : null;

  const meta = {
    title: row.title,
    artist: artist?.name ?? "Unknown Artist",
    album: album?.title ?? null,
    year: row.year,
  };
  const safeName = `${meta.title} - ${meta.artist}`.replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 120);
  const cacheKey = `${row.source}_${row.sourceId ?? String(trackId)}`;
  sweepCache();

  try {
    // ---------- 1. obtain the source file ----------
    let sourcePath: string;
    let nativeExt = "m4a";
    const isNative = fmt.startsWith("native:");
    const nativeId = isNative ? fmt.slice(7) : null;

    const resolved = await resolveSource(row.source, row.sourceId, row.sourceUrl, { trackId, title: row.title, artist: artist?.name, durationSec: row.durationSec });
    if (!resolved) return Response.json({ error: "This source cannot be downloaded" }, { status: 400 });
    if (resolved.kind === "ytdlp") {
      const info = await extractInfo(resolved.url, { youtube: resolved.youtube });
      const chosen = nativeId
        ? info.formats.find((f) => f.format_id === nativeId)
        : bestAudioSource(info);
      if (!chosen) return Response.json({ error: "Requested format is not available" }, { status: 404 });
      nativeExt = chosen.ext;
      sourcePath = await downloadSource(resolved.url, chosen.format_id, cacheKey, {
        youtubeClient: info._client,
        ffmpegPath: FFMPEG_PATH,
      });
    } else {
      sourcePath = await fetchToCache(resolved.url, `${cacheKey}.src.bin`);
      nativeExt = "mp3";
    }

    // ---------- 2. render ----------
    const coverPath = await fetchCover(
      album?.coverUrl ?? (row.source === "youtube" ? `https://i.ytimg.com/vi/${row.sourceId}/hqdefault.jpg` : null),
      cacheKey,
    );
    let outPath: string;
    let ext: string;
    let mime: string;
    if (isNative) {
      ext = nativeExt === "webm" ? "webm" : nativeExt;
      outPath = await remuxNative(sourcePath, ext, meta, coverPath, `${cacheKey}_${nativeId}`);
      mime = ext === "mp4" ? "video/mp4" : ext === "webm" ? "video/webm" : ext === "m4a" ? "audio/mp4" : "application/octet-stream";
    } else {
      const preset = presetById(fmt);
      if (!preset) return Response.json({ error: "Unknown format preset" }, { status: 400 });
      outPath = await transcode(sourcePath, preset, meta, coverPath, cacheKey);
      ext = preset.ext;
      mime = preset.mime;
    }

    // ---------- 3. stream the finished file ----------
    const stat = fs.statSync(outPath);
    const nodeStream = fs.createReadStream(outPath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
    const headers = new Headers({
      "Content-Type": mime,
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(safeName)}.${ext}"; filename*=UTF-8''${encodeURIComponent(safeName)}.${ext}`,
      "Cache-Control": "no-store",
      "X-DONMUSE-Download": "1",
    });
    return new Response(webStream, { status: 200, headers });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Download failed" },
      { status: 502 },
    );
  }
}

async function fetchToCache(url: string, name: string): Promise<string> {
  const out = path.join(CACHE_DIR, name.replace(/[^a-zA-Z0-9_.-]/g, "_"));
  if (fs.existsSync(out) && fs.statSync(out).size > 1000) return out;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (DON MUSE)" }, redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Source fetch failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(out, buf);
  return out;
}
