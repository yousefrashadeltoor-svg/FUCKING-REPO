import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 3600;

// ---------------------------------------------------------------------------
//  GET /api/tv/proxy?u=<encoded url>&ua=&ref=
//  HLS proxy for live TV. Rewrites .m3u8 playlists so every segment / child
//  playlist / key URI is routed back through this proxy (fixes CORS + mixed
//  content + referrer-locked streams), and pipes .ts/.m4s/.aac segments.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u");
  const ua = req.nextUrl.searchParams.get("ua") ?? "";
  const ref = req.nextUrl.searchParams.get("ref") ?? "";
  if (!u || !/^https?:\/\//i.test(u)) return Response.json({ error: "Invalid url" }, { status: 400 });

  const headers: Record<string, string> = {
    "User-Agent": ua || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    Accept: "*/*",
  };
  if (ref) {
    headers["Referer"] = ref;
    try {
      headers["Origin"] = new URL(ref).origin;
    } catch {
      /* ignore */
    }
  }
  const range = req.headers.get("range");
  if (range) headers["Range"] = range;

  const ctrl = new AbortController();
  const connectTimer = setTimeout(() => ctrl.abort(), 20_000);
  let upstream: Response;
  try {
    upstream = await fetch(u, { headers, redirect: "follow", cache: "no-store", signal: ctrl.signal });
  } catch {
    clearTimeout(connectTimer);
    return Response.json({ error: "Stream is not responding" }, { status: 502 });
  }
  clearTimeout(connectTimer);
  if (!upstream.ok && upstream.status !== 206) {
    return Response.json({ error: `Stream returned ${upstream.status}` }, { status: 502 });
  }

  const finalUrl = upstream.url || u;
  const ct = (upstream.headers.get("content-type") ?? "").toLowerCase();
  const isPlaylist = /mpegurl|x-mpegurl|vnd\.apple/.test(ct) || /\.m3u8(\?|$)/i.test(finalUrl);

  const prox = (abs: string) =>
    `/api/tv/proxy?u=${encodeURIComponent(abs)}${ua ? `&ua=${encodeURIComponent(ua)}` : ""}${ref ? `&ref=${encodeURIComponent(ref)}` : ""}`;

  if (isPlaylist) {
    const text = await upstream.text();
    const base = new URL(finalUrl);
    const out = text
      .split("\n")
      .map((line) => {
        const l = line.trim();
        if (!l) return line;
        if (l.startsWith("#")) {
          // rewrite URI="..." attributes (keys, media playlists, init segments)
          return l.replace(/URI="([^"]+)"/g, (_m, p1: string) => {
            try {
              return `URI="${prox(new URL(p1, base).toString())}"`;
            } catch {
              return _m;
            }
          });
        }
        try {
          return prox(new URL(l, base).toString());
        } catch {
          return line;
        }
      })
      .join("\n");
    return new Response(out, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // segment / binary passthrough
  req.signal.addEventListener("abort", () => upstream.body?.cancel().catch(() => {}), { once: true });
  const h = new Headers();
  h.set("Content-Type", ct || "video/mp2t");
  const len = upstream.headers.get("content-length");
  if (len) h.set("Content-Length", len);
  const cr = upstream.headers.get("content-range");
  if (cr) h.set("Content-Range", cr);
  h.set("Cache-Control", "public, max-age=20");
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Accept-Ranges", "bytes");
  return new Response(upstream.body, { status: upstream.status, headers: h });
}
