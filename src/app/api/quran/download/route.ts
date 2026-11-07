import { NextRequest } from "next/server";
import { getSurah, reciterByCode, sourceUrl, QURAN_SOURCES } from "@/lib/server/quran";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type Quality = "low" | "medium" | "high";

/** GET /api/quran/download?surah=2&reciter=basit&q=high — full surah, never clipped. */
export async function GET(req: NextRequest) {
  const n = Number(req.nextUrl.searchParams.get("surah"));
  const code = req.nextUrl.searchParams.get("reciter") ?? "";
  const rawQ = req.nextUrl.searchParams.get("q");
  const quality: Quality = rawQ === "low" || rawQ === "medium" || rawQ === "high" ? rawQ : "high";
  const surah = getSurah(n);
  const reciter = reciterByCode(code);
  if (!surah || !reciter) return Response.json({ error: "Invalid surah or reciter" }, { status: 400 });

  const ordered = [...reciter.sources].sort((a, b) => {
    if (quality === "high") return b.bitrate - a.bitrate;
    if (quality === "low") return a.bitrate - b.bitrate;
    return Math.abs(a.bitrate - 128) - Math.abs(b.bitrate - 128);
  });

  const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").trim();
  const filename = `AlQuran - ${String(n).padStart(3, "0")} ${surah.en} (${safe(reciter.name)}).mp3`;

  for (const src of ordered) {
    const url = sourceUrl(n, reciter, src);
    if (!url) continue;
    let upstream: Response;
    try {
      upstream = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (DON MUSE Quran)" },
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      continue;
    }
    if (!upstream.ok || !upstream.body) continue;
    const h = new Headers({
      "Content-Type": "audio/mpeg",
      "Content-Disposition": `attachment; filename="AlQuran-${String(n).padStart(3, "0")}-${surah.en.replace(/\s+/g, "-")}-${reciter.code}.mp3"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
      "X-Quran-Source": QURAN_SOURCES[src.source].label,
    });
    const len = upstream.headers.get("Content-Length");
    if (len) h.set("Content-Length", len);
    return new Response(upstream.body, { status: 200, headers: h });
  }

  return Response.json({ error: "All Quran sources are unavailable" }, { status: 502 });
}
