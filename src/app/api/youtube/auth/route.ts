import { cookies } from "next/headers";
import { consentUrl, STATE_COOKIE } from "@/lib/server/google";
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
