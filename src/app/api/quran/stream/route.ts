import { NextRequest } from "next/server";
import { pickSource, reciterByCode, sourceUrl, QURAN_SOURCES } from "@/lib/server/quran";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOP = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "te", "trailer"]);

type Quality = "low" | "medium" | "high";

function qualityOf(raw: string | null): Quality {
  return raw === "low" || raw === "medium" || raw === "high" ? raw : "high";
}

/**
 * GET /api/quran/stream?surah=2&reciter=basit&q=high
 * Range-capable proxy that tries every trusted source for the reciter until
 * one answers — so every reciter always reaches all 114 surahs.
 */
export async function GET(req: NextRequest) {
  const n = Number(req.nextUrl.searchParams.get("surah"));
  const code = req.nextUrl.searchParams.get("reciter") ?? "";
  const quality = qualityOf(req.nextUrl.searchParams.get("q"));
  const reciter = reciterByCode(code);
  if (!Number.isInteger(n) || n < 1 || n > 114 || !reciter) {
    return Response.json({ error: "Invalid surah or reciter" }, { status: 400 });
  }

  const range = req.headers.get("range");
  const ordered = [...reciter.sources].sort((a, b) => {
    if (quality === "high") return b.bitrate - a.bitrate;
    if (quality === "low") return a.bitrate - b.bitrate;
    return Math.abs(a.bitrate - 128) - Math.abs(b.bitrate - 128);
  });

  let lastStatus = 0;
  for (const src of ordered) {
    const url = sourceUrl(n, reciter, src);
    if (!url) continue;
    const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0 (DON MUSE Quran)" };
    if (range) headers.Range = range;
    let upstream: Response;
    try {
      upstream = await fetch(url, {
        headers,
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      });
    } catch {
      continue;
    }
    if (!upstream.ok && upstream.status !== 206) {
      lastStatus = upstream.status;
      continue;
    }
    const h = new Headers();
    for (const [k, v] of upstream.headers) if (!HOP.has(k.toLowerCase())) h.set(k, v);
    h.set("Content-Type", "audio/mpeg");
    h.set("Accept-Ranges", "bytes");
    h.set("Cache-Control", "public, max-age=86400, immutable");
    h.set("Access-Control-Allow-Origin", "*");
    h.set("X-Quran-Source", QURAN_SOURCES[src.source].label);
    h.set("X-Quran-Bitrate", String(src.bitrate));
    req.signal.addEventListener("abort", () => upstream.body?.cancel().catch(() => {}), { once: true });
    return new Response(upstream.body, { status: upstream.status, headers: h });
  }

  return Response.json(
    { error: `All Quran sources are unavailable right now${lastStatus ? ` (last: ${lastStatus})` : ""}` },
    { status: 502 },
  );
}
