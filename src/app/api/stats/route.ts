import { getDemoUser, getStats } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

// GET /api/stats — listening analytics for the dashboard ("Wrapped" style)
export async function GET() {
  const user = await getDemoUser();
  return Response.json(await getStats(user.id));
}
