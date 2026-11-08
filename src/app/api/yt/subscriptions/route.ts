import { notConnected, viewer } from "@/lib/server/yt-auth";
import { mySubscriptions, subscriptionFor } from "@/lib/server/yt-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/yt/subscriptions?page=…[&forChannel=UC…]
 *   The account's real subscriptions (paged), or just whether one channel is
 *   subscribed — the latter powers the subscribe button's initial state.
 */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const { accessToken } = await viewer(origin);
  if (!accessToken) return notConnected();

  const p = new URL(req.url).searchParams;
  const forChannel = p.get("forChannel");
  if (forChannel) {
    const id = await subscriptionFor(accessToken, forChannel);
    return Response.json({ ok: true, subscribed: !!id, subscriptionId: id }, { headers: { "Cache-Control": "no-store" } });
  }
  const data = await mySubscriptions(accessToken, p.get("page") ?? undefined, Number(p.get("max") ?? 50));
  return Response.json({ ok: true, ...data }, { headers: { "Cache-Control": "no-store" } });
}
