import { db, ensureSchema } from "@/db";
import { tracks, artists, albums } from "@/db/schema";
import { eq } from "drizzle-orm";
import { extractInfo, type YtFormat } from "@/lib/server/ytdlp";
import { AUDIO_PRESETS, estimateSize } from "@/lib/server/transcode";
import { resolveSource } from "@/lib/server/resolve-source";
import type { DownloadFormatDTO } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
//  GET /api/tracks/[id]/formats
//  Real download catalog for a track:
//   • Video: every native stream yt-dlp can see (resolution/fps/codec/size)
//   • Audio: native audio streams + 25 transcode presets (FLAC/ALAC/WAV,
//     MP3 64–320, AAC 96–320, Opus 48–256, Vorbis) with estimated sizes.
//  Every audio download embeds the cover art + title/artist tags.
// ---------------------------------------------------------------------------
export async function GET(_req: Request, ctx: Ctx) {
  await ensureSchema();
  const { id } = await ctx.params;
  const trackId = Number(id);
  if (!Number.isInteger(trackId)) {
    return Response.json({ error: "Invalid track id" }, { status: 400 });
  }
  const [row] = await db
    .select({
      source: tracks.source,
      sourceId: tracks.sourceId,
      sourceUrl: tracks.sourceUrl,
      durationSec: tracks.durationSec,
      title: tracks.title,
      artistId: tracks.artistId,
      albumId: tracks.albumId,
    })
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1);
  if (!row) return Response.json({ error: "Track not found" }, { status: 404 });
  const [artist] = await db.select({ name: artists.name }).from(artists).where(eq(artists.id, row.artistId)).limit(1);
  const album = row.albumId
    ? (await db.select({ coverUrl: albums.coverUrl }).from(albums).where(eq(albums.id, row.albumId)).limit(1))[0]
    : null;

  let duration = row.durationSec;
  const video: DownloadFormatDTO[] = [];
  const audio: DownloadFormatDTO[] = [];
  let extractor = "direct";
  let note: string | null = null;

  // --- native formats via yt-dlp (YouTube / SoundCloud) ---
  const resolved = await resolveSource(row.source, row.sourceId, row.sourceUrl, { trackId, title: row.title, artist: artist?.name, durationSec: row.durationSec }).catch(() => null);
  if (resolved?.kind === "ytdlp") {
    try {
      const info = await extractInfo(resolved.url, { youtube: resolved.youtube });
      if (info.duration) duration = info.duration;
      extractor = `yt-dlp · ${info._client ?? "default"} client`;
      for (const f of info.formats) {
        const hasV = !!f.vcodec && f.vcodec !== "none";
        const hasA = !!f.acodec && f.acodec !== "none";
        const size = f.filesize ?? f.filesize_approx ?? 0;
        if (hasV) {
          video.push({
            id: `native:${f.format_id}`,
            kind: "video",
            label: `${labelRes(f)} · ${f.ext.toUpperCase()}${hasA ? "" : " (video only)"}`,
            ext: f.ext,
            mime: f.ext === "webm" ? "video/webm" : "video/mp4",
            quality: labelRes(f),
            bitrateKbps: Math.round(f.tbr ?? 0),
            sizeBytes: size || Math.round(((f.tbr ?? 0) * 1000 * duration) / 8),
            estimated: !size,
            lossless: false,
            cover: false,
            codec: `${shortCodec(f.vcodec)}${hasA ? " + " + shortCodec(f.acodec) : ""}`,
          });
        } else if (hasA) {
          audio.push({
            id: `native:${f.format_id}`,
            kind: "audio",
            label: `Original ${f.ext.toUpperCase()} · ${Math.round(f.abr ?? f.tbr ?? 0)} kbps`,
            ext: f.ext === "webm" ? "opus" : f.ext,
            mime: f.ext === "webm" ? "audio/webm" : "audio/mp4",
            quality: `${Math.round(f.abr ?? f.tbr ?? 0)} kbps`,
            bitrateKbps: Math.round(f.abr ?? f.tbr ?? 0),
            sizeBytes: size || Math.round(((f.abr ?? f.tbr ?? 0) * 1000 * duration) / 8),
            estimated: !size,
            lossless: false,
            cover: f.ext === "m4a" || f.ext === "mp4",
            codec: shortCodec(f.acodec),
          });
        }
      }
      video.sort((a, b) => b.bitrateKbps - a.bitrateKbps);
      audio.sort((a, b) => b.bitrateKbps - a.bitrateKbps);
    } catch (err) {
      note = `Native stream list unavailable (${err instanceof Error ? err.message.slice(0, 80) : "extractor error"}). Transcoded formats are still available.`;
    }
  }

  // --- transcode presets (always available for every full-length source) ---
  if (row.source !== "radio") {
    for (const p of AUDIO_PRESETS) {
      audio.push({
        id: p.id,
        kind: "audio",
        label: p.label,
        ext: p.ext,
        mime: p.mime,
        quality: p.lossless ? "Lossless" : `${p.bitrateKbps} kbps`,
        bitrateKbps: p.bitrateKbps,
        sizeBytes: estimateSize(p, duration),
        estimated: true,
        lossless: p.lossless,
        cover: p.coverSupported,
        codec: p.codec.replace("lib", "").replace("pcm_s16le", "PCM").toUpperCase(),
      });
    }
  }

  return Response.json({
    source: row.source,
    title: `${row.title} — ${artist?.name ?? "Unknown"}`,
    durationSec: duration,
    coverUrl: album?.coverUrl ?? null,
    extractor,
    note,
    video,
    audio,
  });
}

function labelRes(f: YtFormat): string {
  const h = f.height ?? 0;
  const fps = f.fps && f.fps > 30 ? `${Math.round(f.fps)}` : "";
  if (h >= 2160) return `2160p${fps} 4K`;
  if (h >= 1440) return `1440p${fps} 2K`;
  if (h > 0) return `${h}p${fps}`;
  return f.resolution ?? f.format_note ?? "video";
}

function shortCodec(c?: string): string {
  if (!c || c === "none") return "";
  if (c.startsWith("avc1")) return "H.264";
  if (c.startsWith("vp09") || c === "vp9") return "VP9";
  if (c.startsWith("av01")) return "AV1";
  if (c.startsWith("mp4a")) return "AAC";
  if (c === "opus") return "Opus";
  return c.split(".")[0].toUpperCase();
}
