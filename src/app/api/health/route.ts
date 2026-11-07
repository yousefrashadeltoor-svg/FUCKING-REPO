import { db, ensureSchema, isEmbeddedDb } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — real system self-check.
 * Each entry is measured, never assumed: DB round-trip latency, upstream
 * source reachability, catalog counters and process stats.
 */
export async function GET() {
  const started = Date.now();
  const checks: Record<string, { ok: boolean; latencyMs?: number; detail?: string }> = {};

  // 1. database round-trip
  try {
    const t = Date.now();
    await ensureSchema();
    await db.execute(sql`select 1`);
    checks.database = { ok: true, latencyMs: Date.now() - t, detail: isEmbeddedDb ? "pglite-embedded" : "postgres" };
  } catch (err) {
    checks.database = { ok: false, detail: err instanceof Error ? err.message : "db error" };
  }

  // 2. catalog counters (real rows)
  try {
    const t = Date.now();
    const rows = await db.execute<{ tracks: number; artists: number }>(
      sql`select (select count(*) from tracks) as tracks, (select count(*) from artists) as artists`,
    );
    const r = (rows as unknown as { rows: { tracks: number | string; artists: number | string }[] }).rows?.[0];
    checks.catalog = {
      ok: true,
      latencyMs: Date.now() - t,
      detail: `tracks=${Number(r?.tracks ?? 0)} artists=${Number(r?.artists ?? 0)}`,
    };
  } catch (err) {
    checks.catalog = { ok: false, detail: err instanceof Error ? err.message : "catalog error" };
  }

  // 3. upstream sources (HEAD, 2.5 s budget each)
  const upstreams: [string, string][] = [
    ["youtube", "https://music.youtube.com/"],
    ["audius", "https://api.audius.co/v1/tracks/trending?limit=1"],
    ["archive", "https://archive.org/advancedsearch.php?q=collection%3Aaudio&rows=1&output=json"],
    ["quran", "https://api.alquran.cloud/v1/meta"],
    ["radio", "https://de1.api.radio-browser.info/json/stations/bycountry/EG?limit=1"],
  ];
  await Promise.all(
    upstreams.map(async ([name, url]) => {
      const t = Date.now();
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 2500);
        const res = await fetch(url, { method: "GET", signal: ctl.signal, cache: "no-store" });
        clearTimeout(timer);
        checks[`source:${name}`] = { ok: res.ok, latencyMs: Date.now() - t, detail: `HTTP ${res.status}` };
      } catch (err) {
        checks[`source:${name}`] = { ok: false, detail: err instanceof Error ? err.message : "unreachable" };
      }
    }),
  );

  const mem = process.memoryUsage();
  const allOk = Object.values(checks).every((c) => c.ok);

  return Response.json(
    {
      ok: allOk,
      checkedAt: new Date().toISOString(),
      totalMs: Date.now() - started,
      runtime: {
        node: process.version,
        uptimeSec: Math.round(process.uptime()),
        heapUsedMb: Math.round(mem.heapUsed / 1048576),
        rssMb: Math.round(mem.rss / 1048576),
        platform: process.platform,
      },
      checks,
    },
    { status: allOk ? 200 : 503 },
  );
}
