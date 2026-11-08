import { cookies } from "next/headers";
import { consentUrl, STATE_COOKIE } from "@/lib/server/google";
import { canPersistTokens } from "@/lib/server/oauth-store";
import { ensureSessionUser } from "@/lib/server/session";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

// GET /api/youtube/auth — start the official Google OAuth consent flow.
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const state = randomUUID();
  const url = consentUrl(origin, state);

  if (!url) {
    // No credentials on this deployment: say so plainly, never fake a login.
    return Response.redirect(`${origin}/youtube-profile?status=not-configured`, 302);
  }
  if (!canPersistTokens()) {
    // Without an encryption key we would have to store tokens in clear text.
    return Response.redirect(`${origin}/youtube-profile?status=no-token-key`, 302);
  }
  // Establish the local identity BEFORE leaving for Google, so the callback
  // always has a user row to attach the account to.
  await ensureSessionUser();

  const jar = await cookies();
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https"),
    path: "/",
    maxAge: 600,
  });
  return Response.redirect(url, 302);
}
