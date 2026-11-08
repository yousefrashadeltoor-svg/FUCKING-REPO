import { NextRequest } from "next/server";
import { safeFetch } from "@/lib/server/ssrf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Hobby Fluid Compute caps Node.js functions at 300 seconds. HLS manifests and
// media segments are separate requests, so each segment can finish independently.
export const maxDuration = 300;

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
  if (!u || u.length > 4096 || !/^https?:\/\//i.test(u)) {
    return Response.json({ error: "Invalid url" }, { status: 400 });
  }
  if (/[\r\n]/.test(ua) || ua.length > 512 || /[\r\n]/.test(ref) || ref.length > 2048) {
    return Response.json({ error: "Invalid upstream headers" }, { status: 400 });
  }

  const headers: Record<string, string> = {
    "User-Agent": ua || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    Accept: "*/*",
  };
  if (ref) {
    let parsedRef: URL;
    try {
      parsedRef = new URL(ref);
      if (parsedRef.protocol !== "http:" && parsedRef.protocol !== "https:") {
        return Response.json({ error: "Invalid referrer" }, { status: 400 });
      }
    } catch {
      return Response.json({ error: "Invalid referrer" }, { status: 400 });
    }
    headers["Referer"] = parsedRef.toString();
    headers["Origin"] = parsedRef.origin;
  }
  const range = req.headers.get("range");
  if (range) headers["Range"] = range;

  const ctrl = new AbortController();
  const connectTimer = setTimeout(() => ctrl.abort(), 20_000);
  let upstream: Response;
  try {
    // Client-provided TV stream URLs are an SSRF boundary. Validate the
    // hostname/IP and every redirect hop before the server makes a request.
    upstream = await safeFetch(
      u,
      { headers, cache: "no-store", signal: ctrl.signal },
      { maxHops: 4 },
    );
  } catch (error) {
    clearTimeout(connectTimer);
    const message = error instanceof Error ? error.message : "Stream is not responding";
    const rejectedInput = /Invalid URL|Only http\(s\)|Credentials in URLs|not allowed|could not be resolved|Too many redirects/i.test(message);
    return Response.json(
      { error: rejectedInput ? message : "Stream is not responding" },
      { status: rejectedInput ? 400 : 502 },
    );
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
    // A malicious or broken upstream must not make the function buffer an
    // unbounded playlist response in memory.
    const maxPlaylistBytes = 1_500_000;
    const declaredLength = Number(upstream.headers.get("content-length") ?? 0);
    if (declaredLength > maxPlaylistBytes) {
      await upstream.body?.cancel().catch(() => {});
      return Response.json({ error: "Playlist is too large" }, { status: 413 });
    }
    let text: string;
    try {
      text = await readLimitedText(upstream, maxPlaylistBytes);
    } catch {
      return Response.json({ error: "Playlist is too large or unreadable" }, { status: 413 });
    }
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


async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Playlist is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
