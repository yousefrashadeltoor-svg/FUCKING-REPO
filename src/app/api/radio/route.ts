import { NextRequest } from "next/server";
import {
  arabicStations,
  cultureStations,
  egyptianStations,
  quranStations,
  searchStations,
  stationsByTag,
  worldStations,
} from "@/lib/server/radio";
import type { RadioStationDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
//  GET /api/radio?q=&tag=
//  Real live stations (Radio-Browser), grouped:
//  egypt (by listeners) · arabic · quran · culture · world
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const tag = req.nextUrl.searchParams.get("tag")?.trim() ?? "";
  const uuid = req.nextUrl.searchParams.get("uuid")?.trim() ?? "";
  if (uuid) {
    const { stationByUuid } = await import("@/lib/server/radio");
    const st = await stationByUuid(uuid).catch(() => null);
    return Response.json({ egypt: st && st.countryCode === "EG" ? [st] : [], arabic: [], quran: [], culture: [], world: st && st.countryCode !== "EG" ? [st] : [] });
  }
  const split = (list: RadioStationDTO[]) => ({
    egypt: list.filter((s) => s.countryCode === "EG"),
    arabic: list.filter((s) => s.countryCode !== "EG" && /arab|عرب/i.test(s.mood + s.description)),
    quran: list.filter((s) => /quran|qur'an|قرآن|القران/i.test(s.name + s.description)),
    culture: [] as RadioStationDTO[],
    world: list.filter((s) => s.countryCode !== "EG"),
  });
  try {
    if (q) return Response.json({ ...split(await searchStations(q, 100)), query: q });
    if (tag) return Response.json({ ...split(await stationsByTag(tag, 100)), tag });
    const [egypt, arabic, quran, culture, world] = await Promise.all([
      egyptianStations(120),
      arabicStations(120).catch(() => []),
      quranStations(80).catch(() => []),
      cultureStations(80).catch(() => []),
      worldStations(120).catch(() => []),
    ]);
    return Response.json({ egypt, arabic, quran, culture, world });
  } catch (err) {
    return Response.json(
      { egypt: [], arabic: [], quran: [], culture: [], world: [], error: err instanceof Error ? err.message : "radio directory unavailable" },
      { status: 502 },
    );
  }
}
