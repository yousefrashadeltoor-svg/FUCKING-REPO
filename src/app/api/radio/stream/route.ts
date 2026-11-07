import { NextRequest } from "next/server";
import { registerClick } from "@/lib/server/radio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 3600;

// ---------------------------------------------------------------------------
//  GET /api/radio/stream?u=<encoded upstream url>&id=<station uuid>
//  Live radio proxy. Infinite stream: the connect timeout applies ONLY to the
//  TCP/headers phase (the old AbortSignal.timeout killed the body after 15s —
//  that was the "radio stops after a few seconds" bug). ICY metadata is
//  disabled so the raw MP3/AAC frames are clean for playback + recording.
//  Also used to fetch small images (station logos) for the recorder cover.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u");
  const id = req.nextUrl.searchParams.get("id");
  if (!u || !/^https?:\/\//i.test(u)) return Response.json({ error: "Invalid stream url" }, { status: 400 });
  if (id) void registerClick(id);

  // Connect-phase timeout only: abort if headers don't arrive in 20s, then
  // detach so the body can stream forever.
  const ctrl = new AbortController();
  const connectTimer = setTimeout(() => ctrl.abort(), 20_000);
  let upstream: Response;
  try {
    upstream = await fetch(u, {
      headers: {
        "User-Agent": "DONMUSE/1.0 (radio player; like VLC/3.0)",
        "Icy-MetaData": "0",
        Accept: "*/*",
      },
      redirect: "follow",
      cache: "no-store",
      signal: ctrl.signal,
    });
  } catch {
    clearTimeout(connectTimer);
    return Response.json({ error: "Station is not responding" }, { status: 502 });
  }
  clearTimeout(connectTimer);
  if (!upstream.ok || !upstream.body) {
    return Response.json({ error: `Station returned ${upstream.status}` }, { status: 502 });
  }

  const ct = (upstream.headers.get("content-type") ?? "").toLowerCase();
  const isImage = ct.startsWith("image/");
  const audioCt =
    ct.startsWith("audio/") || ct.includes("mpeg") || ct.includes("aac") || ct.includes("ogg")
      ? ct
      : "audio/mpeg";

  // Abort upstream when the client disconnects (frees sockets).
  const abortUpstream = () => {
    try {
      upstream.body?.cancel().catch(() => {});
    } catch {
      /* noop */
    }
  };
  req.signal.addEventListener("abort", abortUpstream, { once: true });

  const headers = new Headers({
    "Content-Type": isImage ? ct : audioCt,
    "Cache-Control": isImage ? "public, max-age=86400" : "no-store, no-transform",
    "Access-Control-Allow-Origin": "*",
    "X-Accel-Buffering": "no",
    Connection: "keep-alive",
  });
  const icyName = upstream.headers.get("icy-name");
  if (icyName) headers.set("X-Station-Name", encodeURIComponent(icyName));
  const icyBr = upstream.headers.get("icy-br");
  if (icyBr) headers.set("X-Station-Bitrate", icyBr);
  return new Response(upstream.body, { status: 200, headers });
}
