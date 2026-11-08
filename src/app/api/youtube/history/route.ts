import { db, ensureSchema } from "@/db";
import { youtubeHistory } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * YouTube watch history — completely separate from `/api/history` (the in-app
 * listening history). Scoped to the signed-in session, never shared.
 *
 *  GET    /api/youtube/history            → the user's own YouTube watch history
 *  POST   /api/youtube/history            → upsert progress for one video
 *  DELETE /api/youtube/history?id=…|all   → remove one entry or clear everything
 */
export async function GET() {
  await ensureSchema();
  const user = await getCurrentUser();
  if (user.id < 0) return Response.json({ ok: true, items: [] });
  const rows = await db
    .select()
    .from(youtubeHistory)
    .where(eq(youtubeHistory.userId, user.id))
    .orderBy(desc(youtubeHistory.watchedAt))
    .limit(200);
  return Response.json(
    {
      ok: true,
      items: rows.map((r) => ({
        videoId: r.videoId,
        title: r.title,
        channelId: r.channelId,
        channel: r.channelTitle,
        thumb: r.thumbUrl,
        durationSec: r.durationSec,
        positionSec: r.positionSec,
        watchedSec: r.watchedSec,
        completed: r.completed,
        watchedAt: r.watchedAt,
        url: `https://www.youtube.com/watch?v=${r.videoId}`,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  await ensureSchema();
  const user = await getCurrentUser();
  if (user.id < 0) return Response.json({ ok: false, error: "No session" }, { status: 401 });

  let body: {
    videoId?: string;
    title?: string;
    channelId?: string;
    channelTitle?: string;
    thumb?: string;
    durationSec?: number;
    positionSec?: number;
    watchedSec?: number;
    completed?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const videoId = (body.videoId ?? "").trim();
  if (!/^[\w-]{6,20}$/.test(videoId)) return Response.json({ ok: false, error: "Invalid videoId" }, { status: 400 });
  if (!body.title) return Response.json({ ok: false, error: "title is required" }, { status: 400 });

  const values = {
    userId: user.id,
    videoId,
    title: String(body.title).slice(0, 300),
    channelId: body.channelId ?? null,
    channelTitle: body.channelTitle ? String(body.channelTitle).slice(0, 200) : null,
    thumbUrl: body.thumb ?? null,
    durationSec: Math.max(0, Math.round(body.durationSec ?? 0)),
    positionSec: Math.max(0, Math.round(body.positionSec ?? 0)),
    watchedSec: Math.max(0, Math.round(body.watchedSec ?? 0)),
    completed: !!body.completed,
    watchedAt: new Date(),
  };

  // One row per video for this user: re-watching updates it.
  const [existing] = await db
    .select({ id: youtubeHistory.id })
    .from(youtubeHistory)
    .where(and(eq(youtubeHistory.userId, user.id), eq(youtubeHistory.videoId, videoId)))
    .limit(1);
  if (existing) {
    await db.update(youtubeHistory).set(values).where(eq(youtubeHistory.id, existing.id));
  } else {
    await db.insert(youtubeHistory).values(values);
  }
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  await ensureSchema();
  const user = await getCurrentUser();
  if (user.id < 0) return Response.json({ ok: false, error: "No session" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id || id === "all") {
    await db.delete(youtubeHistory).where(eq(youtubeHistory.userId, user.id));
    return Response.json({ ok: true, cleared: true });
  }
  await db.delete(youtubeHistory).where(and(eq(youtubeHistory.userId, user.id), eq(youtubeHistory.videoId, id)));
  return Response.json({ ok: true, cleared: false });
}
