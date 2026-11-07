import { cookies } from "next/headers";
import { TOKEN_COOKIE } from "@/lib/server/google";

export const dynamic = "force-dynamic";

// POST /api/youtube/disconnect — forget the tokens (real sign-out).
export async function POST() {
  const jar = await cookies();
  jar.delete(TOKEN_COOKIE);
  return Response.json({ ok: true, connected: false });
}
