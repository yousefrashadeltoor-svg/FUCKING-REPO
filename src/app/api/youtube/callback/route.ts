import { cookies } from "next/headers";
import { encodeTokens, exchangeCode, STATE_COOKIE, TOKEN_COOKIE } from "@/lib/server/google";

export const dynamic = "force-dynamic";

// GET /api/youtube/callback — Google redirects here with ?code & ?state.
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

  const tokens = await exchangeCode(origin, code);
  if (!tokens) return Response.redirect(`${origin}/youtube-profile?status=failed`, 302);

  jar.delete(STATE_COOKIE);
  jar.set(TOKEN_COOKIE, encodeTokens(tokens), {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https"),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return Response.redirect(`${origin}/youtube-profile?status=connected`, 302);
}
