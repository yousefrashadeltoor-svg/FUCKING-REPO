import { NextRequest } from "next/server";
import { getSurah, reciterByCode, surahUrl } from "@/lib/server/quran";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const n = Number(req.nextUrl.searchParams.get("surah"));
  const code = req.nextUrl.searchParams.get("reciter") ?? "";
  const surah = getSurah(n);
  const reciter = reciterByCode(code);
  if (!surah || !reciter) return Response.json({ error: "Invalid surah or reciter" }, { status: 400 });
  const url = surahUrl(n, code);
  let upstream: Response;
  try {
    upstream = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (DON MUSE Quran)" }, redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(120_000) });
  } catch {
    return Response.json({ error: "Quran source unreachable" }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) return Response.json({ error: `Source ${upstream.status}` }, { status: 502 });
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").trim();
  const name = `AlQuran - ${String(n).padStart(3, "0")} ${surah.en} (${safe(reciter.name)}).mp3`;
  const len = upstream.headers.get("Content-Length");
  const h = new Headers({
    "Content-Type": "audio/mpeg",
    "Content-Disposition": `attachment; filename="AlQuran-${String(n).padStart(3, "0")}-${surah.en.replace(/\s+/g, "-")}-${reciter.code}.mp3"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "Cache-Control": "no-store",
  });
  if (len) h.set("Content-Length", len);
  return new Response(upstream.body, { status: 200, headers: h });
}
