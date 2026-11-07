import { NextRequest } from "next/server";
import { FEATURED_IDS, categoryOf, groupOf, loadTv, type TvChannelDTO } from "@/lib/server/tv";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ---------------------------------------------------------------------------
//  GET /api/tv?group=egyptian|arabic|world&category=religious|news|…&q=&limit=
//  A real two-level taxonomy:
//      main group (التلفزيون المصري · العربي · عالمي)
//        └── category (دينية · ترفيهية · إخبارية · رياضية · أفلام · أطفال …)
//  Counts are returned for every combination so the UI can build the tree
//  without extra round-trips.
// ---------------------------------------------------------------------------
const GROUPS = ["egyptian", "arabic", "world"] as const;
const CATEGORIES = [
  "religious",
  "entertainment",
  "news",
  "sports",
  "kids",
  "movies",
  "series",
  "education",
  "documentary",
  "music",
  "culture",
] as const;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const group = sp.get("group") ?? "";
  const category = sp.get("category") ?? "";
  const q = sp.get("q")?.trim().toLowerCase() ?? "";
  const limit = Math.min(400, Number(sp.get("limit") ?? 120));
  const offset = Number(sp.get("offset") ?? 0);

  try {
    const { channels } = await loadTv();

    // counts[group][category]
    const counts: Record<string, Record<string, number>> = {};
    for (const g of GROUPS) {
      counts[g] = { all: 0 };
      for (const c of CATEGORIES) counts[g][c] = 0;
    }
    for (const ch of channels) {
      const g = groupOf(ch);
      counts[g].all++;
      for (const c of categoryOf(ch)) counts[g][c]++;
    }

    let list: TvChannelDTO[];
    if (q) {
      const norm = (s: string) => s.toLowerCase().replace(/[\s\-_.]/g, "");
      const nq = norm(q);
      list = channels.filter((c) => {
        const hay = `${c.name} ${c.altNames.join(" ")} ${c.id} ${c.network ?? ""} ${c.country}`.toLowerCase();
        return hay.includes(q) || norm(hay).includes(nq);
      });
      list.sort((a, b) => score(b) - score(a));
    } else if (!group && !category) {
      // featured rail
      const byId = new Map(channels.map((c) => [c.id, c]));
      const featured = FEATURED_IDS.map((id) => byId.get(id)).filter((c): c is TvChannelDTO => !!c);
      const extra = channels
        .filter(
          (c) =>
            !FEATURED_IDS.includes(c.id) &&
            c.logo &&
            ["EG", "SA", "AE", "QA", "KW", "MA", "JO", "LB"].includes(c.country),
        )
        .sort((a, b) => score(b) - score(a))
        .slice(0, 80);
      list = [...featured, ...extra];
    } else {
      list = channels.filter((c) => {
        if (group && groupOf(c) !== group) return false;
        if (category && !categoryOf(c).includes(category as (typeof CATEGORIES)[number])) return false;
        return true;
      });
      list.sort((a, b) => score(b) - score(a));
    }

    const total = list.length;
    const page = list.slice(offset, offset + limit);
    return Response.json({ group, category, q, total, offset, limit, counts, channels: page });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "TV dataset unavailable", channels: [], total: 0, counts: {} },
      { status: 502 },
    );
  }
}

function score(c: TvChannelDTO): number {
  let s = 0;
  if (FEATURED_IDS.includes(c.id)) s += 1000;
  if (c.logo) s += 100;
  if (c.country === "EG") s += 60;
  else if (["SA", "AE", "QA", "KW", "LB", "JO"].includes(c.country)) s += 40;
  const m = c.streams[0]?.quality?.match(/(\d{3,4})p/);
  if (m) s += Math.min(30, Number(m[1]) / 40);
  s += Math.min(10, c.streams.length);
  return s;
}
