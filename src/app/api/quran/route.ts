import { RECITERS, SURAHS } from "@/lib/server/quran";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
//  GET /api/quran — Quran hub data: 11 reciters (Egyptians first) + 114 surahs.
//  Everything is delivered as WHOLE surahs (never clipped).
// ---------------------------------------------------------------------------
export async function GET() {
  return Response.json({
    reciters: RECITERS,
    surahs: SURAHS,
    note: "Quran is streamed and downloaded as complete surahs — clipping is disabled to preserve meaning.",
  });
}
