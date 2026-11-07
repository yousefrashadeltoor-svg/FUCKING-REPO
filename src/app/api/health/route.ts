import { db, ensureSchema, isEmbeddedDb } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSchema();
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: isEmbeddedDb ? "pglite-embedded" : "postgres" });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "db error" }, { status: 500 });
  }
}
