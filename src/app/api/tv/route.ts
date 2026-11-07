import { NextRequest } from "next/server";
import { FEATURED_IDS, loadTv, sectionOf, type TvChannelDTO } from "@/lib/server/tv";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ---------------------------------------------------------------------------
//  GET /api/tv?section=featured|egypt|arabic|news|kids|movies|series|quran|
//                   documentary|sports|music|culture|world&q=&limit=&offset=
//  Returns real live TV channels with logos and all their HLS streams.
// ---------------------------------------------------------------------------
export const SECTIONS = ["featured", "egypt", "arabic", "news", "kids", "movies", "series", "quran", "documentary", "sports", "music", "culture", "world"] as const;
export type TvSection = (typeof SECTIONS)[number];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const section = (sp.get("section") ?? "featured") as TvSection;
  const q = sp.get("q")?.trim().toLowerCase() ?? "";
  const limit = Math.min(400, Number(sp.get("limit") ?? 120));
  const offset = Number(sp.get("offset") ?? 0);

  try {
    const { channels, byId } = await loadTv();
    let list: TvChannelDTO[];

    if (q) {
      const norm = (s: string) => s.toLowerCase().replace(/[\s\-_.]/g, "");
      const nq = norm(q);
      list = channels.filter((c) => {
        const hay = `${c.name} ${c.altNames.join(" ")} ${c.id} ${c.network ?? ""} ${c.country}`.toLowerCase();
        return hay.includes(q) || norm(hay).includes(nq);
      });
      // featured matches first, then Arabic world, then by stream quality
      list.sort((a, b) => score(b) - score(a));
    } else if (section === "featured") {
      list = FEATURED_IDS.map((id) => byId.get(id)).filter((c): c is TvChannelDTO => !!c);
      // fill with popular arab/egypt channels with logos
      const extra = channels
        .filter((c) => !FEATURED_IDS.includes(c.id) && c.logo && (c.country === "EG" || c.country === "SA" || c.country === "AE" || c.country === "QA"))
        .sort((a, b) => score(b) - score(a))
        .slice(0, 60);
      list = [...list, ...extra];
    } else {
      list = channels.filter((c) => sectionOf(c).includes(section)).sort((a, b) => score(b) - score(a));
    }

    const total = list.length;
    const page = list.slice(offset, offset + limit);
    const counts: Record<string, number> = {};
    for (const s of SECTIONS) counts[s] = s === "featured" ? FEATURED_IDS.length : 0;
    for (const c of channels) for (const s of sectionOf(c)) counts[s] = (counts[s] ?? 0) + 1;

    return Response.json({ section, q, total, offset, limit, counts, channels: page });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "TV dataset unavailable", channels: [], total: 0 }, { status: 502 });
  }
}

function score(c: TvChannelDTO): number {
  let s = 0;
  if (FEATURED_IDS.includes(c.id)) s += 1000;
  if (c.logo) s += 100;
  if (c.country === "EG") s += 60;
  else if (["SA", "AE", "QA", "KW", "LB", "JO"].includes(c.country)) s += 40;
  const q = c.streams[0]?.quality?.match(/(\d{3,4})p/);
  if (q) s += Math.min(30, Number(q[1]) / 40);
  s += Math.min(10, c.streams.length);
  return s;
}
