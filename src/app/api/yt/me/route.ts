import { connectionState, notConnected, viewer } from "@/lib/server/yt-auth";
import { myChannel } from "@/lib/server/yt-service";
import { rememberChannel } from "@/lib/server/oauth-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/yt/me
 *   Connection state + the signed-in account's real channel.
 *   Never invents a channel: without a token it reports `connected: false`.
 */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const state = await connectionState(origin);
  if (!state.connected) {
    return Response.json({ ok: true, ...state, channel: null }, { headers: { "Cache-Control": "no-store" } });
  }
  const { userId, accessToken } = await viewer(origin);
  if (!accessToken) return notConnected({ ...state });
  const channel = await myChannel(accessToken);
  if (channel && userId > 0) void rememberChannel(userId, channel.id, channel.title);
  return Response.json({ ok: true, ...state, channel }, { headers: { "Cache-Control": "no-store" } });
}
