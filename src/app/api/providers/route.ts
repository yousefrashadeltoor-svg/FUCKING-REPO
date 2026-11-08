import { providerSummary } from "@/lib/server/providers";

export const dynamic = "force-dynamic";

/**
 * GET /api/providers
 *   Real, live health of every catalog/streaming provider plus the playback
 *   policy that governs it. Used by the Diagnostics page and by the settings'
 *   "Sources" panel. No secrets are ever returned.
 */
export async function GET() {
  const providers = await providerSummary();
  return Response.json(
    { providers, checkedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
