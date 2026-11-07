import { getDemoUser } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

// GET /api/me — current demo user profile
export async function GET() {
  return Response.json(await getDemoUser());
}
