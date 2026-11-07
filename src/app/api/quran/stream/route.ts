import { NextRequest } from "next/server";
import { reciterByCode, surahUrl } from "@/lib/server/quran";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOP = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "te", "trailer"]);

export async function GET(req: NextRequest) {
  const n = Number(req.nextUrl.searchParams.get("surah"));
  const code = req.nextUrl.searchParams.get("reciter") ?? "";
  if (!Number.isInteger(n) || n < 1 || n > 114 || !reciterByCode(code)) {
    return Response.json({ error: "Invalid surah or reciter" }, { status: 400 });
  }
  const url = surahUrl(n, code);
  const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0 (DON MUSE Quran)" };
  const range = req.headers.get("range");
  if (range) headers["Range"] = range;
  let upstream: Response;
  try {
    upstream = await fetch(url, { headers, redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(30_000) });
  } catch {
    return Response.json({ error: "Quran source unreachable" }, { status: 502 });
  }
  if (!upstream.ok && upstream.status !== 206) {
    return Response.json({ error: `Quran source returned ${upstream.status}` }, { status: 502 });
  }
  const h = new Headers();
  for (const [k, v] of upstream.headers) if (!HOP.has(k.toLowerCase())) h.set(k, v);
  h.set("Content-Type", "audio/mpeg");
  h.set("Accept-Ranges", "bytes");
  h.set("Cache-Control", "public, max-age=86400, immutable");
  h.set("Access-Control-Allow-Origin", "*");
  req.signal.addEventListener("abort", () => upstream.body?.cancel().catch(() => {}), { once: true });
  return new Response(upstream.body, { status: upstream.status, headers: h });
}
