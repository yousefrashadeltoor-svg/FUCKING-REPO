import { NextRequest } from "next/server";
import { db } from "@/db";
import { playlists } from "@/db/schema";
import { getDemoUser, listPlaylists } from "@/lib/server/queries";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

// GET /api/playlists
export async function GET() {
  return Response.json(await listPlaylists());
}

// POST /api/playlists  { title, description? }
export async function POST(req: NextRequest) {
  const user = await getDemoUser();
  let body: { title?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const title = body.title?.trim();
  if (!title) return Response.json({ error: "title is required" }, { status: 400 });
  const [row] = await db
    .insert(playlists)
    .values({
      title,
      slug: `${slugify(title)}-${Date.now().toString(36)}`,
      description: body.description ?? null,
      ownerId: user.id,
    })
    .returning();
  const all = await listPlaylists();
  return Response.json(all.find((p) => p.id === row.id) ?? row, { status: 201 });
}
