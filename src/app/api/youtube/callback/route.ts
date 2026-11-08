import { cookies } from "next/headers";
import { exchangeCode, STATE_COOKIE, type TokenSet } from "@/lib/server/google";
import { ensureSessionUser } from "@/lib/server/session";
import { canPersistTokens, saveAccount } from "@/lib/server/oauth-store";

export const dynamic = "force-dynamic";

interface UserInfo {
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
}

/** GET /api/youtube/callback — Google redirects here with ?code & ?state. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) return Response.redirect(`${origin}/youtube-profile?status=denied`, 302);

  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  if (!code || !state || !expected || state !== expected) {
    return Response.redirect(`${origin}/youtube-profile?status=invalid-state`, 302);
  }

  const tokens = (await exchangeCode(origin, code)) as TokenSet | null;
  if (!tokens) return Response.redirect(`${origin}/youtube-profile?status=failed`, 302);

  // Encrypted at rest; refuses to store anything if GOOGLE_TOKEN_KEY is absent.
  if (!canPersistTokens()) {
    return Response.redirect(`${origin}/youtube-profile?status=no-token-key`, 302);
  }

  // Real identity for the local account (also creates the session cookie).
  const user = await ensureSessionUser();
  if (user.id < 0) return Response.redirect(`${origin}/youtube-profile?status=no-session`, 302);

  let profile: UserInfo = {};
  try {
    const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      cache: "no-store",
    });
    if (res.ok) profile = (await res.json()) as UserInfo;
  } catch {
    profile = {}; // identity is a nicety; the tokens are what matter
  }

  try {
    await saveAccount(user.id, profile, tokens);
  } catch {
    return Response.redirect(`${origin}/youtube-profile?status=storage-failed`, 302);
  }

  jar.delete(STATE_COOKIE);
  return Response.redirect(`${origin}/youtube-profile?status=connected`, 302);
}
