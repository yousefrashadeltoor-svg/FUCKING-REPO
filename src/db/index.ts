// ============================================================================
//  Database client — dual mode, zero config:
//   • DATABASE_URL set            → PostgreSQL via node-postgres (hosting/dev)
//   • DATABASE_URL missing/"local" → PGlite (embedded Postgres, data stored in
//                                   ./data/pglite inside the app folder). This
//                                   is what the self-contained bundle uses, so
//                                   the app runs on any plain host with only
//                                   Node.js — no database server required.
//  Both expose the same Drizzle `db` API; the schema is created automatically
//  on first start (see ensureSchema).
// ============================================================================
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import path from "node:path";
import fs from "node:fs";
import { sql } from "drizzle-orm";
import { SCHEMA_SQL } from "./bootstrap-sql";

type AnyDb = ReturnType<typeof drizzlePg> | ReturnType<typeof drizzlePglite>;

const databaseUrl = process.env.DATABASE_URL;
const useLocal = !databaseUrl || databaseUrl === "local" || databaseUrl.startsWith("pglite:");

const globalForDb = globalThis as typeof globalThis & {
  __donmusePool?: Pool;
  __donmusePglite?: PGlite;
  __donmuseDb?: AnyDb;
  __donmuseReady?: Promise<void>;
};

function localDir(): string {
  const fromUrl = databaseUrl?.startsWith("pglite:") ? databaseUrl.slice("pglite:".length) : "";
  const dir = fromUrl || process.env.DONMUSE_DATA_DIR || path.join(process.cwd(), "data", "pglite");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export let pool: Pool | undefined;

if (!globalForDb.__donmuseDb) {
  if (useLocal) {
    const pg = globalForDb.__donmusePglite ?? new PGlite(localDir());
    globalForDb.__donmusePglite = pg;
    globalForDb.__donmuseDb = drizzlePglite(pg);
  } else {
    pool = globalForDb.__donmusePool ?? new Pool({ connectionString: databaseUrl });
    globalForDb.__donmusePool = pool;
    globalForDb.__donmuseDb = drizzlePg(pool);
  }
}

// The two drivers have identical query builders; we type `db` as the pg one.
export const db = globalForDb.__donmuseDb as ReturnType<typeof drizzlePg>;

/** Create tables + demo user when running embedded (idempotent, runs once per process). */
export function ensureSchema(): Promise<void> {
  if (!globalForDb.__donmuseReady) {
    globalForDb.__donmuseReady = (async () => {
      // Real PostgreSQL is managed by drizzle-kit (npm run db:push) — nothing to do.
      if (!useLocal) return;
      for (const stmt of SCHEMA_SQL) {
        try {
          await db.execute(sql.raw(stmt));
        } catch (err) {
          // "already exists" variants are fine on re-runs; anything else is logged.
          const msg = err instanceof Error ? err.message : String(err);
          if (!/already exists|duplicate|multiple primary keys/i.test(msg)) console.warn("[donmuse bootstrap]", msg.slice(0, 160));
        }
      }
      // Embedded mode: import the bundled seed snapshot once (data/seed.sql).
      if (useLocal) {
        const seedPath = path.join(process.cwd(), "data", "seed.sql");
        const marker = path.join(localDir(), ".seeded");
        if (fs.existsSync(seedPath) && !fs.existsSync(marker)) {
          const lines = fs.readFileSync(seedPath, "utf8").split("\n").filter((l) => l.trim());
          for (const line of lines) {
            try {
              await db.execute(sql.raw(line));
            } catch {
              /* skip bad row */
            }
          }
          // bump sequences past imported ids
          for (const tbl of ["users", "artists", "albums", "tracks", "playlists", "playlist_tracks", "user_track_likes", "listening_history", "artist_follows", "album_likes"]) {
            try {
              await db.execute(sql.raw(`SELECT setval(pg_get_serial_sequence('${tbl}','id'), COALESCE((SELECT MAX(id) FROM ${tbl}), 0) + 1, false)`));
            } catch {
              /* ignore */
            }
          }
          fs.writeFileSync(marker, new Date().toISOString());
        }
      }
    })().catch((err) => {
      globalForDb.__donmuseReady = undefined;
      throw err;
    });
  }
  return globalForDb.__donmuseReady;
}

export const isEmbeddedDb = useLocal;
