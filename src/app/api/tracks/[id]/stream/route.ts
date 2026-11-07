import { db, ensureSchema } from "@/db";
import { tracks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveSource } from "@/lib/server/resolve-source";
import { bestAudioSource, extractInfo } from "@/lib/server/ytdlp";
import { canStreamDirectly, externalFallback, policyFor } from "@/lib/playback-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
//  GET /api/tracks/[id]/stream
//
//  Range-capable playback proxy for the sources that allow it (Audius, Internet
//  Archive, SoundCloud, Odysee, Deezer previews). Streaming is what makes the
//  EQ, loudness normalisation and crossfade possible for those files.
//
//  YouTube / YouTube Music are never proxied and never extracted: policy sends
//  them to the official IFrame player instead. `?resolve=1` answers with JSON so
//  the Android host knows whether to hand the URL to ExoPlayer or to fall back
//  to the official embed.
// ---------------------------------------------------------------------------
const HOP_BY_HOP = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "te", "trailer"]);

/** Short-lived cache of resolved direct URLs (they expire upstream). */
const urlCache = new Map<string, { url: string; exp: number }>();

export async function GET(req: Request, ctx: Ctx) {
  await ensureSchema();
  const { id } = await ctx.params;
  const trackId = Number(id);
  const asJson = new URL(req.url).searchParams.get("resolve") === "1";
  if (!Number.isInteger(trackId)) {
    return Response.json({ error: "Invalid track id" }, { status: 400 });
  }

  const [row] = await db
    .select({
      source: tracks.source,
      sourceId: tracks.sourceId,
      sourceUrl: tracks.sourceUrl,
      title: tracks.title,
      durationSec: tracks.durationSec,
      artistId: tracks.artistId,
    })
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1);
  if (!row) return Response.json({ error: "Track not found" }, { status: 404 });

  const policy = policyFor(row.source);

  // ---- official-embed sources: never extracted, never proxied -------------
  if (!canStreamDirectly(row.source)) {
    const embed =
      row.source === "youtube" && row.sourceId ? `https://www.youtube.com/embed/${row.sourceId}` : null;
    if (asJson) {
      return Response.json({
        mode: policy.mode,
        direct: false,
        url: null,
        embed,
        mime: null,
        note: policy.note,
        external: externalFallback(row.source, row.sourceId),
      });
    }
    return Response.json(
      {
        error: policy.note,
        mode: policy.mode,
        embed,
        external: externalFallback(row.source, row.sourceId),
      },
      { status: 409 },
    );
  }

  // ---- direct sources ------------------------------------------------------
  const cached = urlCache.get(String(trackId));
  let upstreamUrl: string | null = cached && cached.exp > Date.now() ? cached.url : null;

  if (!upstreamUrl) {
    if (["spotify", "applemusic", "deezer"].includes(row.source) && row.sourceUrl) {
      upstreamUrl = row.sourceUrl; // official preview file
    } else {
      try {
        const r = await resolveSource(row.source, row.sourceId, row.sourceUrl, {
          trackId,
          title: row.title,
          durationSec: row.durationSec,
        });
        if (r?.kind === "direct") {
          upstreamUrl = r.url;
        } else if (r?.kind === "ytdlp") {
          const info = await extractInfo(r.url, { youtube: false });
          const progressive = info.formats.find(
            (f) => (f.protocol === "https" || f.protocol === "http") && f.acodec && f.acodec !== "none",
          );
          upstreamUrl = progressive?.url ?? bestAudioSource(info)?.url ?? null;
        }
      } catch {
        upstreamUrl = null;
      }
      if (upstreamUrl) {
        // upstream links are usually valid for 30–60 min; be conservative
        urlCache.set(String(trackId), { url: upstreamUrl, exp: Date.now() + 20 * 60 * 1000 });
      }
    }
  }

  if (!upstreamUrl) {
    if (asJson) {
      return Response.json({ mode: "direct", direct: false, url: null, embed: null, mime: null, note: "No playable stream right now." });
    }
    return Response.json({ error: "No playable stream for this track" }, { status: 404 });
  }

  if (asJson) {
    return Response.json({ mode: "direct", direct: true, url: upstreamUrl, mime: "audio/mpeg", embed: null, note: policy.note });
  }

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
    urlCache.delete(String(trackId)); // force a re-resolve next time
    return Response.json({ error: "Upstream unavailable" }, { status: 502 });
  }

  const out = new Headers();
  for (const [k, v] of upstream.headers) if (!HOP_BY_HOP.has(k.toLowerCase())) out.set(k, v);
  out.set("Accept-Ranges", "bytes");
  const ct = out.get("Content-Type") ?? "";
  if (!ct || ct === "application/octet-stream") out.set("Content-Type", "audio/mpeg");
  out.set("Cache-Control", "public, max-age=3600");
  // Deliberately no wildcard CORS: the media is fetched by our own origin only.
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
