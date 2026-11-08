import { getCurrentUser } from "@/lib/server/session";
import { disconnect } from "@/lib/server/oauth-store";

export const dynamic = "force-dynamic";

/**
 * POST /api/youtube/disconnect — delete the stored tokens for THIS user.
 * Local playlists, likes and history are untouched (they are ours, not Google's).
 * Revoking the grant itself is done on the user's Google account page; we link to
 * it because the Data API cannot revoke on the user's behalf.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (user.id > 0) await disconnect(user.id);
  return Response.json({ ok: true, connected: false, revokeUrl: "https://myaccount.google.com/permissions" });
}
