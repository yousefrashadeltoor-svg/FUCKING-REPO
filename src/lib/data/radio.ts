// ============================================================================
//  Live radio via the Radio-Browser community API (free, no key).
//  Sections: Egypt (ranked by real listeners) · Arabic world · Quran & Islamic
//  · Culture / Classical / Jazz · World top. We prefer direct MP3/AAC streams
//  (low bandwidth) and skip HLS-only entries. Results are cached in memory
//  for 15 minutes so the UI stays fast and offline-tolerant.
// ============================================================================
import type { RadioStationDTO } from "@/lib/types";
import { onlineFetch } from "@/lib/local/online";

const MIRRORS = [
  "https://de1.api.radio-browser.info",
  "https://fi1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
];

interface RBStation {
  stationuuid: string;
  name: string;
  url_resolved: string;
  url: string;
  favicon: string;
  tags: string;
  country: string;
  countrycode: string;
  language: string;
  codec: string;
  bitrate: number;
  clickcount: number;
  votes: number;
  homepage: string;
  lastcheckok: number;
}

const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 15 * 60 * 1000;

async function rb<T>(pathname: string): Promise<T> {
  const hit = cache.get(pathname);
  if (hit && Date.now() - hit.at < TTL) return hit.data as T;
  let lastErr: unknown = null;
  for (const base of MIRRORS) {
    try {
      const res = await onlineFetch(`${base}${pathname}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok) {
        const data = (await res.json()) as T;
        cache.set(pathname, { at: Date.now(), data });
        return data;
      }
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  if (hit) return hit.data as T; // stale but better than nothing
  throw lastErr ?? new Error("radio-browser unavailable");
}

function toDTO(s: RBStation): RadioStationDTO {
  const url = s.url_resolved || s.url;
  const codec = (s.codec || "").toUpperCase();
  const tags = s.tags
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return {
    id: s.stationuuid,
    name: s.name.trim(),
    description: tags.length ? tags.slice(0, 4).join(" · ") : s.country,
    genre: tags[0] || "radio",
    mood: s.language || "",
    energy: 0.5,
    coverUrl:
      s.favicon && /^https?:\/\//.test(s.favicon)
        ? s.favicon
        : `https://picsum.photos/seed/${encodeURIComponent(s.stationuuid)}/400/400`,
    trackCount: s.clickcount,
    streamUrl: url,
    country: s.country,
    countryCode: s.countrycode,
    codec,
    bitrate: s.bitrate,
    listeners: s.clickcount,
    votes: s.votes,
    homepage: s.homepage,
    isLive: true,
  };
}

const PLAYABLE = (s: RBStation) => {
  const url = s.url_resolved || s.url;
  if (!url || !/^https?:/.test(url)) return false;
  if (s.lastcheckok !== 1) return false;
  if (/\.m3u8(\?|$)/i.test(url)) return false; // direct streams only (low data, recordable)
  const c = (s.codec || "").toUpperCase();
  return c === "MP3" || c === "AAC" || c === "AAC+" || c === "" || c === "UNKNOWN";
};

function dedupe(list: RBStation[]): RBStation[] {
  const seen = new Set<string>();
  const out: RBStation[] = [];
  for (const s of list) {
    const key = (s.url_resolved || s.url).split("?")[0];
    if (seen.has(key) || seen.has(s.name.trim().toLowerCase())) continue;
    seen.add(key);
    seen.add(s.name.trim().toLowerCase());
    out.push(s);
  }
  return out;
}

export async function egyptianStations(limit = 120): Promise<RadioStationDTO[]> {
  const [byCountry, byTag] = await Promise.all([
    rb<RBStation[]>(`/json/stations/bycountrycodeexact/EG?order=clickcount&reverse=true&limit=${limit * 2}&hidebroken=true`),
    rb<RBStation[]>(`/json/stations/search?tag=egypt&order=clickcount&reverse=true&limit=60&hidebroken=true`).catch(() => [] as RBStation[]),
  ]);
  const merged = dedupe([...byCountry, ...byTag.filter((s) => s.countrycode !== "EG")]).filter(PLAYABLE);
  return merged.sort((a, b) => b.clickcount - a.clickcount).slice(0, limit).map(toDTO);
}

const ARAB_CODES = ["SA", "AE", "QA", "KW", "BH", "OM", "JO", "LB", "SY", "IQ", "PS", "YE", "MA", "DZ", "TN", "LY", "SD", "MR"];

export async function arabicStations(limit = 120): Promise<RadioStationDTO[]> {
  const [byLang, ...byCountry] = await Promise.all([
    rb<RBStation[]>(`/json/stations/bylanguageexact/arabic?order=clickcount&reverse=true&limit=${limit * 2}&hidebroken=true`),
    ...["SA", "AE", "LB", "MA", "JO", "IQ"].map((cc) =>
      rb<RBStation[]>(`/json/stations/bycountrycodeexact/${cc}?order=clickcount&reverse=true&limit=30&hidebroken=true`).catch(() => [] as RBStation[]),
    ),
  ]);
  const merged = dedupe([...byLang, ...byCountry.flat()]).filter((s) => PLAYABLE(s) && s.countrycode !== "EG");
  return merged.sort((a, b) => b.clickcount - a.clickcount).slice(0, limit).map(toDTO);
}

export async function quranStations(limit = 80): Promise<RadioStationDTO[]> {
  const [a, b, c] = await Promise.all([
    rb<RBStation[]>(`/json/stations/search?tag=quran&order=clickcount&reverse=true&limit=${limit}&hidebroken=true`),
    rb<RBStation[]>(`/json/stations/search?name=quran&order=clickcount&reverse=true&limit=60&hidebroken=true`).catch(() => [] as RBStation[]),
    rb<RBStation[]>(`/json/stations/search?name=القرآن&order=clickcount&reverse=true&limit=60&hidebroken=true`).catch(() => [] as RBStation[]),
  ]);
  const merged = dedupe([...a, ...b, ...c]).filter(PLAYABLE);
  return merged.sort((x, y) => y.clickcount - x.clickcount).slice(0, limit).map(toDTO);
}

export async function cultureStations(limit = 80): Promise<RadioStationDTO[]> {
  const tags = ["classical", "jazz", "culture", "talk", "news", "opera", "oriental"];
  const lists = await Promise.all(
    tags.map((tg) =>
      rb<RBStation[]>(`/json/stations/bytagexact/${encodeURIComponent(tg)}?order=clickcount&reverse=true&limit=25&hidebroken=true`).catch(() => [] as RBStation[]),
    ),
  );
  const merged = dedupe(lists.flat()).filter(PLAYABLE);
  return merged.sort((a, b) => b.clickcount - a.clickcount).slice(0, limit).map(toDTO);
}

export async function worldStations(limit = 120): Promise<RadioStationDTO[]> {
  const rows = await rb<RBStation[]>(`/json/stations/topclick/${limit * 3}?hidebroken=true`);
  return dedupe(rows)
    .filter((s) => PLAYABLE(s) && s.countrycode !== "EG" && !ARAB_CODES.includes(s.countrycode))
    .slice(0, limit)
    .map(toDTO);
}

export async function searchStations(q: string, limit = 80): Promise<RadioStationDTO[]> {
  const [byName, byTag] = await Promise.all([
    rb<RBStation[]>(`/json/stations/search?name=${encodeURIComponent(q)}&order=clickcount&reverse=true&limit=${limit}&hidebroken=true`),
    rb<RBStation[]>(`/json/stations/search?tag=${encodeURIComponent(q)}&order=clickcount&reverse=true&limit=40&hidebroken=true`).catch(() => [] as RBStation[]),
  ]);
  return dedupe([...byName, ...byTag]).filter(PLAYABLE).slice(0, limit).map(toDTO);
}

export async function stationsByTag(tag: string, limit = 80): Promise<RadioStationDTO[]> {
  const rows = await rb<RBStation[]>(`/json/stations/bytagexact/${encodeURIComponent(tag)}?order=clickcount&reverse=true&limit=${limit * 2}&hidebroken=true`);
  return dedupe(rows).filter(PLAYABLE).slice(0, limit).map(toDTO);
}

/** Register a click (listener count) with radio-browser — keeps rankings honest. */
export async function registerClick(uuid: string) {
  try {
    await onlineFetch(`${MIRRORS[0]}/json/url/${uuid}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* best effort */
  }
}

export async function stationByUuid(uuid: string): Promise<RadioStationDTO | null> {
  const rows = await rb<RBStation[]>(`/json/stations/byuuid/${encodeURIComponent(uuid)}`);
  const s = rows[0];
  return s ? toDTO(s) : null;
}
