import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { db, ensureSchema } from "@/db";
import { tracks, artists, albums } from "@/db/schema";
import { eq } from "drizzle-orm";
import { bestAudioSource, downloadSource, extractInfo, CACHE_DIR } from "@/lib/server/ytdlp";
import { FFMPEG_PATH, fetchCover } from "@/lib/server/transcode";
import { clipFormat } from "@/lib/server/preset-args";
import { resolveSource } from "@/lib/server/resolve-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
//  GET /api/tracks/[id]/clip?start=12.5&end=42&fmt=mp3|m4a
//  Cuts [start, end] from the real full-length source with ffmpeg (sample-
//  accurate re-encode, cover + tags embedded) and streams the clip. Also
//  used for "download 30s preview" (start=0,end=30) in Reels.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest, ctx: Ctx) {
  await ensureSchema();
  const { id } = await ctx.params;
  const trackId = Number(id);
  const start = Math.max(0, Number(req.nextUrl.searchParams.get("start") ?? 0));
  const end = Number(req.nextUrl.searchParams.get("end") ?? start + 30);
  const fmtId = req.nextUrl.searchParams.get("fmt") ?? "mp3-256";
  const cf = clipFormat(fmtId);
  if (!Number.isInteger(trackId) || !(end > start) || end - start > 600) {
    return Response.json({ error: "Invalid range (max 10 minutes)" }, { status: 400 });
  }
  const [row] = await db
    .select({ source: tracks.source, sourceId: tracks.sourceId, sourceUrl: tracks.sourceUrl, title: tracks.title, artistId: tracks.artistId, albumId: tracks.albumId, durationSec: tracks.durationSec })
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1);
  if (!row || (!row.sourceId && !row.sourceUrl)) return Response.json({ error: "Track not found" }, { status: 404 });
  const [artist] = await db.select({ name: artists.name }).from(artists).where(eq(artists.id, row.artistId)).limit(1);
  const album = row.albumId ? (await db.select({ coverUrl: albums.coverUrl }).from(albums).where(eq(albums.id, row.albumId)).limit(1))[0] : null;
  const cacheKey = `${row.source}_${row.sourceId ?? String(trackId)}`;

  try {
    let sourcePath: string;
    const resolved = await resolveSource(row.source, row.sourceId, row.sourceUrl, { trackId, title: row.title, artist: artist?.name, durationSec: row.durationSec });
    if (!resolved) return Response.json({ error: "This source cannot be clipped" }, { status: 400 });
    if (resolved.kind === "ytdlp") {
      const info = await extractInfo(resolved.url, { youtube: resolved.youtube });
      const chosen = bestAudioSource(info);
      if (!chosen) return Response.json({ error: "No audio source" }, { status: 404 });
      sourcePath = await downloadSource(resolved.url, chosen.format_id, cacheKey, { youtubeClient: info._client, ffmpegPath: FFMPEG_PATH });
    } else {
      sourcePath = path.join(CACHE_DIR, `${cacheKey}.src.bin`.replace(/[^a-zA-Z0-9_.-]/g, "_"));
      if (!fs.existsSync(sourcePath) || fs.statSync(sourcePath).size < 1000) {
        const res = await fetch(resolved.url, { redirect: "follow" });
        if (!res.ok) throw new Error(`Source fetch failed (${res.status})`);
        fs.writeFileSync(sourcePath, Buffer.from(await res.arrayBuffer()));
      }
    }

    const cover = await fetchCover(album?.coverUrl ?? (row.source === "youtube" ? `https://i.ytimg.com/vi/${row.sourceId}/hqdefault.jpg` : null), cacheKey);
    const outName = `${cacheKey}.clip.${Math.round(start * 10)}-${Math.round(end * 10)}.${fmtId}`.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const out = path.join(CACHE_DIR, outName);
    if (!fs.existsSync(out) || fs.statSync(out).size < 500) {
      const args = ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(start), "-to", String(end), "-i", sourcePath];
      const coverOk = !!cover && cf.container !== "opus" && cf.container !== "ogg" && cf.container !== "flac" && cf.container !== "wav";
      if (coverOk) args.push("-i", cover);
      args.push("-map", "0:a:0");
      if (coverOk) args.push("-map", "1:v:0", "-c:v", "mjpeg", "-disposition:v:0", "attached_pic");
      else args.push("-vn");
      args.push(...cf.codecArgs);
      args.push("-metadata", `title=${row.title} (clip ${fmtT(start)}-${fmtT(end)})`, "-metadata", `artist=${artist?.name ?? ""}`, "-metadata", "comment=Clipped with DON MUSE", "-f", cf.container, out);
      await new Promise<void>((resolve, reject) => {
        const child = spawn(FFMPEG_PATH, args, { stdio: ["ignore", "ignore", "pipe"] });
        let err = "";
        child.stderr.on("data", (d: Buffer) => (err += d.toString()));
        child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.trim().split("\n").pop() ?? `ffmpeg ${code}`))));
        child.on("error", reject);
      });
    }
    const stat = fs.statSync(out);
    const safeName = `${row.title} - ${artist?.name ?? ""} [${fmtT(start)}-${fmtT(end)}]`.replace(/[\\/:*?"<>|]/g, "").trim();
    return new Response(Readable.toWeb(fs.createReadStream(out)) as ReadableStream<Uint8Array>, {
      status: 200,
      headers: {
        "Content-Type": cf.mime,
        "Content-Length": String(stat.size),
        "Content-Disposition": `attachment; filename="${encodeURIComponent(safeName)}.${cf.ext}"; filename*=UTF-8''${encodeURIComponent(safeName)}.${cf.ext}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Clip failed" }, { status: 502 });
  }
}

function fmtT(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}.${String(sec).padStart(2, "0")}`;
}
