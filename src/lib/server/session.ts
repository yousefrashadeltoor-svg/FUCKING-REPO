// ============================================================================
//  Session & identity — real, per-user isolation (no shared "demo" account)
//  ---------------------------------------------------------------------------
//  Every request gets a stable identity derived from a signed, httpOnly cookie.
//  The cookie only holds a random opaque id + HMAC signature; no personal data
//  and no secrets are ever stored client-side. Identity maps to a row in
//  `users`, so playlists, likes, follows and history are always scoped to the
//  person who created them (no IDOR, no cross-account leakage).
//
//  Optional sign-in: when Google OAuth is connected (see /api/youtube/*) the
//  same session is upgraded with the account's email, so the local library and
//  the YouTube account stay distinct records but belong to one person.
// ============================================================================
import { cookies } from "next/headers";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db";
import { users } from "@/db/schema";
import type { UserDTO } from "@/lib/types";

export const SESSION_COOKIE = "dm_session";
const MAX_AGE = 60 * 60 * 24 * 365;

/** Secret comes from the environment; falls back to a per-process secret. */
function secret(): string {
  const fromEnv = process.env.AUTH_SECRET || process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  const g = globalThis as typeof globalThis & { __dmSessionSecret?: string };
  if (!g.__dmSessionSecret) g.__dmSessionSecret = randomUUID() + randomUUID();
  return g.__dmSessionSecret;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function verify(value: string, mac: string): boolean {
  const expected = sign(value);
  const a = Buffer.from(expected);
  const b = Buffer.from(mac);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** `id.signature` — opaque, tamper-evident. */
export function encodeSession(id: string): string {
  return `${id}.${sign(id)}`;
}

export function decodeSession(raw: string | undefined): string | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  if (!/^[0-9a-f-]{16,64}$/i.test(id)) return null;
  return verify(id, mac) ? id : null;
}

interface SessionRow {
  sid: string;
  userId: number;
}

const memory = new Map<string, number>();

/** Find (or create) the user row that owns this session id. */
async function userForSession(sid: string): Promise<number> {
  await ensureSchema();
  const cached = memory.get(sid);
  if (cached) return cached;

  const email = `session-${sid}@donmuse.local`;
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    memory.set(sid, existing.id);
    return existing.id;
  }
  const [created] = await db
    .insert(users)
    .values({ email, name: "DON MUSE Listener", avatarUrl: "/logo.svg", tier: "plus", locale: "ar" })
    .onConflictDoNothing()
    .returning({ id: users.id });
  if (created) {
    memory.set(sid, created.id);
    return created.id;
  }
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  memory.set(sid, row.id);
  return row.id;
}

function toDTO(u: typeof users.$inferSelect): UserDTO {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    tier: u.tier as UserDTO["tier"],
    locale: u.locale,
  };
}

/**
 * The signed-in listener for the current request.
 * Read-only contexts (server components) get an identity without setting a
 * cookie; mutating API routes call `ensureSessionUser()` to persist it.
 */
export async function getCurrentUser(): Promise<UserDTO> {
  const jar = await cookies();
  const sid = decodeSession(jar.get(SESSION_COOKIE)?.value);
  if (!sid) {
    // Ephemeral identity for this render only — never shared between visitors.
    return { id: -1, email: "", name: "DON MUSE Listener", avatarUrl: "/logo.svg", tier: "plus", locale: "ar" };
  }
  const userId = await userForSession(sid);
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row ? toDTO(row) : { id: userId, email: "", name: "DON MUSE Listener", avatarUrl: "/logo.svg", tier: "plus", locale: "ar" };
}

/** Same as above, but guarantees a real, persisted identity (sets the cookie). */
export async function ensureSessionUser(): Promise<UserDTO> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  let sid = decodeSession(raw);
  if (!sid) {
    sid = randomUUID();
    try {
      jar.set(SESSION_COOKIE, encodeSession(sid), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: MAX_AGE,
      });
    } catch {
      // Called from a context that cannot set cookies (e.g. a server component
      // render): the identity is still deterministic for this request.
    }
  }
  const userId = await userForSession(sid);
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row ? toDTO(row) : { id: userId, email: "", name: "DON MUSE Listener", avatarUrl: "/logo.svg", tier: "plus", locale: "ar" };
}

/** True when the request carries a real session cookie. */
export async function hasSession(): Promise<boolean> {
  const jar = await cookies();
  return decodeSession(jar.get(SESSION_COOKIE)?.value) !== null;
}
