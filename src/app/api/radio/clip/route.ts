import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import ffmpegStatic from "ffmpeg-static";
import { CACHE_DIR } from "@/lib/server/ytdlp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const FFMPEG_PATH: string = (ffmpegStatic as unknown as string) || "ffmpeg";

// ---------------------------------------------------------------------------
//  POST /api/radio/clip?name=&country=&from=&to=
//  Body: the RAW recorded stream bytes (MP3/AAC frames captured in-browser).
//  The server writes them to a temp file, runs ffmpeg to produce a clean,
//  universally-playable MP3 (256k) with ID3 tags (+ station logo as cover),
//  and streams the MP3 back as an attachment. This is what fixes the
//  "recorded radio clip won't download" problem.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name") ?? "Radio";
  const country = req.nextUrl.searchParams.get("country") ?? "";
  const from = req.nextUrl.searchParams.get("from") ?? "0:00";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  const coverUrl = req.nextUrl.searchParams.get("cover") ?? "";

  const raw = await req.arrayBuffer();
  if (raw.byteLength < 400) return Response.json({ error: "Clip is empty" }, { status: 400 });

  const cache = CACHE_DIR;
  const safeKey = `${Date.now()}-${Math.floor(Math.random() * 1e5)}`;
  const tmpIn = path.join(cache, `radio-in-${safeKey}.bin`);
  const out = path.join(cache, `radio-clip-${safeKey}.mp3`);
  fs.writeFileSync(tmpIn, Buffer.from(raw));

  // Optional cover (station logo) fetched server-side.
  let cover: string | null = null;
  if (coverUrl) {
    try {
      const r = await fetch(coverUrl, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 200 && buf.length < 4_000_000) {
          cover = path.join(cache, `radio-cover-${safeKey}.bin`);
          fs.writeFileSync(cover, buf);
        }
      }
    } catch {
      cover = null;
    }
  }

  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", tmpIn];
  if (cover) args.push("-i", cover);
  args.push("-map", "0:a:0");
  if (cover) args.push("-map", "1:v:0", "-c:v", "mjpeg", "-disposition:v:0", "attached_pic");
  args.push(
    "-c:a", "libmp3lame", "-b:a", "256k", "-ar", "44100", "-id3v2_version", "3",
    "-metadata", `title=${name}`,
    "-metadata", `artist=${name}`,
    "-metadata", `album=DON MUSE Radio`,
    "-metadata", `comment=Recorded ${new Date().toISOString().slice(0, 16).replace("T", " ")}${country ? " · " + country : ""}${from && to ? ` · ${from}-${to}` : ""}`,
    "-f", "mp3", out,
  );

  const err = await new Promise<string>((resolve) => {
    const child = spawn(FFMPEG_PATH, args, { stdio: ["ignore", "ignore", "pipe"] });
    let e = "";
    child.stderr.on("data", (d: Buffer) => (e += d.toString()));
    child.on("close", (code) => resolve(code === 0 ? "" : e));
    child.on("error", (er) => resolve(String(er)));
  });
  if (err || !fs.existsSync(out)) {
    fs.rmSync(tmpIn, { force: true });
    if (cover) fs.rmSync(cover, { force: true });
    return Response.json({ error: err ? `Transcode failed: ${err.trim().split("\n").pop()}` : "Transcode failed" }, { status: 502 });
  }

  const stat = fs.statSync(out);
  const safeName = `${name.replace(/[\\/:*?"<>|]/g, "")} - clip ${from}-${to}`.replace(/\s+/g, " ").trim();
  const res = new Response(Readable.toWeb(fs.createReadStream(out)) as ReadableStream<Uint8Array>, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${encodeURIComponent("Radio Clip.mp3")}"; filename*=UTF-8''${encodeURIComponent(safeName + ".mp3")}`,
      "Cache-Control": "no-store",
    },
  });
  // Clean up temp files shortly after streaming.
  setTimeout(() => { fs.rmSync(tmpIn, { force: true }); fs.rmSync(out, { force: true }); if (cover) fs.rmSync(cover, { force: true }); }, 20_000);
  return res;
}
