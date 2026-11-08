// ============================================================================
//  DON MUSE — encrypted server-side OAuth storage (Google / YouTube)
//  ---------------------------------------------------------------------------
//  Rules enforced here:
//    • tokens live in Postgres, never in the browser, never in localStorage;
//    • the refresh token is AES-256-GCM encrypted with GOOGLE_TOKEN_KEY;
//    • the access token is cached in process memory with its expiry;
//    • without GOOGLE_TOKEN_KEY we refuse to persist instead of storing secrets
//      in plain text.
//
//  This replaces the previous httpOnly-cookie token blob, which was readable by
//  any XSS-capable script-less request but also lost on cookie clearing and
//  impossible to revoke server-side.
// ============================================================================
import crypto from "node:crypto";
import { db, ensureSchema } from "@/db";
import { oauthAccounts, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { refreshTokens, type TokenSet } from "./google";

const KEY_ENV = "GOOGLE_TOKEN_KEY";

function encryptionKey(): Buffer | null {
  const raw = process.env[KEY_ENV];
  if (!raw) return null;
  // Accept 64 hex chars or base64; derive 32 bytes deterministically otherwise.
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  const b64 = Buffer.from(raw, "base64");
  if (b64.length === 32) return b64;
  return crypto.createHash("sha256").update(raw).digest();
}

export function canPersistTokens(): boolean {
  return encryptionKey() !== null;
}

function encrypt(plain: string | null | undefined): string | null {
  if (!plain) return null;
  const key = encryptionKey();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}

function decrypt(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const key = encryptionKey();
  if (!key) return null;
  const [ivPart, tagPart, dataPart] = payload.split(".");
  if (!ivPart || !tagPart || !dataPart) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null; // key rotated / corrupted → user reconnects
  }
}

/* --------------------------- in-memory access cache ---------------------- */

const accessCache = new Map<number, { token: string; exp: number }>();

export interface StoredAccount {
  userId: number;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  scopes: string;
  channelId: string | null;
  channelTitle: string | null;
  refreshToken: string | null;
}

export async function getAccount(userId: number): Promise<StoredAccount | null> {
  await ensureSchema();
  const [row] = await db
    .select()
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, "google")))
    .limit(1);
  if (!row) return null;
  return {
    userId: row.userId,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatarUrl,
    scopes: row.scopes,
    channelId: row.channelId,
    channelTitle: row.channelTitle,
    refreshToken: decrypt(row.refreshTokenEnc),
  };
}

export async function saveAccount(
  userId: number,
  profile: { sub?: string; email?: string; name?: string; picture?: string },
  tokens: TokenSet,
): Promise<void> {
  if (!canPersistTokens()) {
    throw new Error(
      "GOOGLE_TOKEN_KEY is not set: refusing to store OAuth tokens unencrypted. Add a 32-byte key to the environment.",
    );
  }
  await ensureSchema();
  const values = {
    userId,
    provider: "google",
    externalId: profile.sub ?? null,
    email: profile.email ?? null,
    name: profile.name ?? null,
    avatarUrl: profile.picture ?? null,
    scopes: tokens.scope ?? "",
    refreshTokenEnc: encrypt(tokens.refresh_token ?? null),
    accessTokenEnc: encrypt(tokens.access_token),
    expiresAt: new Date(tokens.expires_at),
    updatedAt: new Date(),
  };
  await db
    .insert(oauthAccounts)
    .values(values)
    .onConflictDoUpdate({
      target: [oauthAccounts.userId, oauthAccounts.provider],
      set: {
        externalId: values.externalId,
        email: values.email,
        name: values.name,
        avatarUrl: values.avatarUrl,
        scopes: values.scopes,
        // keep the old refresh token if Google did not send a new one
        refreshTokenEnc: values.refreshTokenEnc ?? undefined,
        accessTokenEnc: values.accessTokenEnc,
        expiresAt: values.expiresAt,
        updatedAt: values.updatedAt,
      },
    });
  accessCache.set(userId, { token: tokens.access_token, exp: tokens.expires_at });
}

export async function disconnect(userId: number): Promise<void> {
  await ensureSchema();
  accessCache.delete(userId);
  await db
    .delete(oauthAccounts)
    .where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, "google")));
}

/**
 * A usable access token for this user, refreshing transparently.
 * Returns null when the user never connected or the grant was revoked.
 */
export async function getAccessToken(origin: string, userId: number): Promise<string | null> {
  const cached = accessCache.get(userId);
  if (cached && cached.exp > Date.now() + 45_000) return cached.token;

  const account = await getAccount(userId);
  if (!account?.refreshToken) return null;
  const renewed = await refreshTokens(origin, account.refreshToken);
  if (!renewed) return null;
  accessCache.set(userId, { token: renewed.access_token, exp: renewed.expires_at });

  if (canPersistTokens()) {
    await db
      .update(oauthAccounts)
      .set({
        accessTokenEnc: encrypt(renewed.access_token),
        expiresAt: new Date(renewed.expires_at),
        updatedAt: new Date(),
      })
      .where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, "google")))
      .catch(() => {});
  }
  return renewed.access_token;
}

/** Cache this account's channel id once we learn it (avoids an extra call). */
export async function rememberChannel(userId: number, channelId: string, channelTitle: string): Promise<void> {
  await db
    .update(oauthAccounts)
    .set({ channelId, channelTitle, updatedAt: new Date() })
    .where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, "google")))
    .catch(() => {});
}

/** Make sure the session user row exists (trusted identity source). */
export async function ensureUserRow(userId: number): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  return !!row;
}
