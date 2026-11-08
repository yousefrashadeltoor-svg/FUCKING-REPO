import { notConnected, viewer } from "@/lib/server/yt-auth";
import { startUpload, uploadStatus } from "@/lib/server/yt-service";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Real YouTube upload (Data API v3 resumable protocol).
 *
 *  1. POST /api/yt/upload   { title, description?, tags?, privacy, madeForKids?, size }
 *       → { uploadId, uploadUrlLength } and we remember Google's one-time URL
 *         server-side, so the OAuth token never reaches the browser.
 *  2. PUT  /api/yt/upload?uploadId=…   (raw video bytes as the body)
 *       → streams them straight to Google and returns { videoId, url }.
 *  3. GET  /api/yt/upload?uploadId=…&status=1
 *       → how many bytes Google already has (for resume).
 *
 * Nothing is buffered in memory: the request body is piped to Google.
 */
interface Session {
  uploadUrl: string;
  totalBytes: number;
  userId: number;
  createdAt: number;
}
const sessions = new Map<string, Session>();

function sweep() {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const [id, s] of sessions) if (s.createdAt < cutoff) sessions.delete(id);
}

export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  const { userId, accessToken } = await viewer(origin);
  if (!accessToken) return notConnected();
  let body: {
    title?: string;
    description?: string;
    tags?: string[];
    privacy?: "public" | "unlisted" | "private";
    madeForKids?: boolean;
    size?: number;
    categoryId?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const title = (body.title ?? "").trim();
  if (!title) return Response.json({ ok: false, error: "A title is required" }, { status: 400 });
  if (!Number.isFinite(body.size) || (body.size ?? 0) <= 0) {
    return Response.json({ ok: false, error: "File size is required for a resumable upload" }, { status: 400 });
  }

  const started = await startUpload(accessToken, {
    title: title.slice(0, 100),
    description: (body.description ?? "").slice(0, 5000),
    tags: (body.tags ?? []).slice(0, 30).map((t) => String(t).slice(0, 60)),
    privacyStatus: body.privacy ?? "private",
    categoryId: body.categoryId,
    madeForKids: body.madeForKids ?? false,
  });
  if (!started.ok) return Response.json({ ok: false, error: started.error }, { status: started.status || 502 });

  sweep();
  const uploadId = randomUUID();
  sessions.set(uploadId, {
    uploadUrl: started.uploadUrl,
    totalBytes: body.size ?? 0,
    userId,
    createdAt: Date.now(),
  });
  return Response.json({ ok: true, uploadId });
}

export async function PUT(req: Request) {
  const url = new URL(req.url);
  const uploadId = url.searchParams.get("uploadId");
  if (!uploadId) return Response.json({ ok: false, error: "uploadId is required" }, { status: 400 });
  const session = sessions.get(uploadId);
  if (!session) return Response.json({ ok: false, error: "Upload session expired — start again" }, { status: 410 });

  const { userId, accessToken } = await viewer(url.origin);
  if (userId !== session.userId) return Response.json({ ok: false, error: "Not your upload session" }, { status: 403 });
  if (!accessToken) return notConnected();

  if (!req.body) return Response.json({ ok: false, error: "Empty body" }, { status: 400 });

  try {
    const res = await fetch(session.uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": req.headers.get("content-type") ?? "video/*",
        "Content-Length": String(session.totalBytes),
      },
      body: req.body,
      // @ts-expect-error — required by Node's fetch for streaming request bodies
      duplex: "half",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return Response.json({ ok: false, error: `Upload failed (HTTP ${res.status})${text ? `: ${text.slice(0, 200)}` : ""}` }, { status: 502 });
    }
    const json = (await res.json()) as { id?: string };
    sessions.delete(uploadId);
    return Response.json({
      ok: true,
      videoId: json.id ?? null,
      url: json.id ? `https://www.youtube.com/watch?v=${json.id}` : null,
      note: "Uploaded through the official Data API v3. Your privacy setting is applied by YouTube; check it in YouTube Studio.",
      studioUrl: "https://studio.youtube.com",
    });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Upload failed" }, { status: 502 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const uploadId = url.searchParams.get("uploadId");
  if (!uploadId) return Response.json({ ok: false, error: "uploadId is required" }, { status: 400 });
  const session = sessions.get(uploadId);
  if (!session) return Response.json({ ok: false, error: "Upload session expired" }, { status: 410 });
  const { userId, accessToken } = await viewer(url.origin);
  if (userId !== session.userId) return Response.json({ ok: false, error: "Not your upload session" }, { status: 403 });
  if (!accessToken) return notConnected();
  const status = await uploadStatus(accessToken, session.uploadUrl, session.totalBytes);
  return Response.json({ ok: true, status });
}
