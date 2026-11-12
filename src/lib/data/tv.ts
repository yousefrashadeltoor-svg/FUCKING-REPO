// ============================================================================
//  Live TV via the iptv-org public dataset (18k+ real HLS streams, 31k
//  channels, 35k logos — community maintained, no key). We merge the three
//  JSON files, keep channels that have at least one stream, and organize them
//  into DON MUSE sections: Featured · Egypt · Arabic · News · Kids/Cartoon ·
//  Movies · Quran & Religious · Documentary · Sports · Music · Culture ·
//  World. Cached in memory for 6h (the dataset updates daily).
// ============================================================================

import { onlineFetch } from "@/lib/local/online";

export interface TvChannelDTO {
  id: string;
  name: string;
  altNames: string[];
  country: string;
  categories: string[];
  logo: string | null;
  website: string | null;
  network: string | null;
  isNsfw: boolean;
  /** all known streams, best quality first */
  streams: { url: string; quality: string | null; title: string | null; userAgent: string | null; referrer: string | null }[];
}

interface RawChannel {
  id: string;
  name: string;
  alt_names?: string[];
  network?: string | null;
  country?: string;
  categories?: string[];
  is_nsfw?: boolean;
  closed?: string | null;
  website?: string | null;
}
interface RawStream {
  channel?: string | null;
  feed?: string | null;
  title?: string | null;
  url: string;
  quality?: string | null;
  user_agent?: string | null;
  referrer?: string | null;
}
interface RawLogo {
  channel: string;
  feed?: string | null;
  width?: number;
  height?: number;
  format?: string;
  url: string;
}

const BASE = "https://iptv-org.github.io/api";
let cache: { at: number; channels: TvChannelDTO[]; byId: Map<string, TvChannelDTO> } | null = null;
const TTL = 6 * 60 * 60 * 1000;
let loading: Promise<void> | null = null;

function qualityRank(q: string | null | undefined): number {
  if (!q) return 0;
  const m = q.match(/(\d{3,4})p/);
  return m ? Number(m[1]) : 0;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await onlineFetch(`${BASE}/${path}`, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`iptv-org ${path} HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function loadTv(): Promise<{ channels: TvChannelDTO[]; byId: Map<string, TvChannelDTO> }> {
  if (cache && Date.now() - cache.at < TTL) return cache;
  if (!loading) {
    loading = (async () => {
      const [channels, streams, logos] = await Promise.all([
        fetchJson<RawChannel[]>("channels.json"),
        fetchJson<RawStream[]>("streams.json"),
        fetchJson<RawLogo[]>("logos.json").catch(() => [] as RawLogo[]),
      ]);
      const logoById = new Map<string, string>();
      for (const l of logos) {
        if (!l.channel || !l.url) continue;
        const prev = logoById.get(l.channel);
        // prefer png/svg and larger
        if (!prev || (l.format === "PNG" || l.format === "SVG") ) logoById.set(l.channel, l.url);
      }
      const streamsBy = new Map<string, RawStream[]>();
      for (const s of streams) {
        if (!s.channel || !s.url || !/^https?:\/\//.test(s.url)) continue;
        const arr = streamsBy.get(s.channel) ?? [];
        arr.push(s);
        streamsBy.set(s.channel, arr);
      }
      const out: TvChannelDTO[] = [];
      for (const c of channels) {
        if (c.closed) continue;
        const st = streamsBy.get(c.id);
        if (!st || st.length === 0) continue;
        if (c.is_nsfw) continue;
        st.sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));
        out.push({
          id: c.id,
          name: c.name,
          altNames: c.alt_names ?? [],
          country: c.country ?? "",
          categories: c.categories ?? [],
          logo: logoById.get(c.id) ?? null,
          website: c.website ?? null,
          network: c.network ?? null,
          isNsfw: !!c.is_nsfw,
          streams: st.map((s) => ({
            url: s.url,
            quality: s.quality ?? null,
            title: s.title ?? null,
            userAgent: s.user_agent ?? null,
            referrer: s.referrer ?? null,
          })),
        });
      }
      cache = { at: Date.now(), channels: out, byId: new Map(out.map((c) => [c.id, c])) };
    })().finally(() => {
      loading = null;
    });
  }
  await loading;
  if (!cache) throw new Error("TV dataset unavailable");
  return cache;
}

export const ARAB_COUNTRIES = ["EG", "SA", "AE", "QA", "KW", "BH", "OM", "JO", "LB", "SY", "IQ", "PS", "YE", "MA", "DZ", "TN", "LY", "SD", "MR"];

/** Hand-picked famous channels (matched by id prefix / name) shown first in "Featured". */
export const FEATURED_IDS = [
  "AlJazeera.qa", "AlJazeeraMubasher.qa", "AlJazeeraEnglish.qa", "AlJazeeraDocumentary.qa",
  "MBC1.ae", "MBC2.ae", "MBC3.ae", "MBC4.ae", "MBCAction.ae", "MBCMax.ae", "MBCDrama.ae", "MBCMasr.eg", "MBCMasr2.eg", "MBCBollywood.ae", "MBCIraq.iq",
  "MixbyMBC.ae", "WanasahTV.ae",
  "Spacetoon.ae", "SpacetoonEnglish.ae", "CartoonNetworkArabic.ae", "CartoonNetwork.us", "Nickelodeon.us", "NickelodeonArabia.ae", "BaraemTV.qa", "JeemTV.qa", "ToyorAlJanah.jo", "MajidKidsTV.ae",
  "NationalGeographicAbuDhabi.ae", "NationalGeographic.us", "NatGeoWild.us", "DiscoveryChannel.us", "AnimalPlanet.us",
  "ONTV.eg", "ONTVLive.eg", "CBC.eg", "CBCDrama.eg", "CBCSofra.eg", "DMC.eg", "DMCDrama.eg", "AlNaharTV.eg", "AlHayatTV.eg", "NileTV.eg", "NileDrama.eg", "NileCinema.eg", "NileComedy.eg", "AlKaheraWalNas.eg", "SadaElBalad.eg", "ExtraNews.eg", "TeNTV.eg", "RotanaCinemaMasr.sa", "RotanaMasriya.sa",
  "RotanaCinema.sa", "RotanaClassic.sa", "RotanaKhalijiah.sa", "RotanaMusic.sa", "RotanaDrama.sa",
  "AlArabiya.ae", "SkyNewsArabia.ae", "BBCNewsArabic.uk", "FranceTVArabic.fr", "DWArabia.de", "RTArabic.ru", "CNNInternational.us", "BBCNews.uk", "Euronews.fr", "France24English.fr", "TRTWorld.tr", "TRTArabi.tr",
  "AlQuranAlKareemTV.sa", "AlSunnahAlNabawiyahTV.sa", "Makkah.sa", "AlMajdQuran.sa", "IqraaTV.sa", "AlResalah.sa", "Alnas.eg", "AlRahmaTV.eg",
  "CimaTV.eg", "MBCMasrDrama.eg", "ZeeAflam.ae", "ZeeAlwan.ae", "FoxMoviesMiddleEast.ae", "OSNMovies.ae",
  "BeINSports1.qa", "AlKassOne.qa", "SSC1.sa", "OnTimeSports.eg", "OnTimeSports2.eg", "AbuDhabiSports1.ae",
  "Bloomberg.us", "CNBC.us", "RedBullTV.at", "NASATV.us", "ArteDeutsch.de", "Mezzo.fr",
];

/** Fine-grained categories used by the TV taxonomy (main → sub). */
export const TV_CATEGORIES = [
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
export type TvCategory = (typeof TV_CATEGORIES)[number];

/** Country groups for the main sections. */
export const TV_GROUPS = ["egyptian", "arabic", "world"] as const;
export type TvGroup = (typeof TV_GROUPS)[number];

export function groupOf(c: TvChannelDTO): TvGroup {
  if (c.country === "EG") return "egyptian";
  if (ARAB_COUNTRIES.includes(c.country)) return "arabic";
  return "world";
}

/** Which fine-grained categories does this channel belong to? */
export function categoryOf(c: TvChannelDTO): TvCategory[] {
  const out = new Set<TvCategory>();
  const cats = c.categories;
  const n = (c.name + " " + c.altNames.join(" ") + " " + c.id).toLowerCase();
  if (cats.includes("religious") || /quran|qur'an|sunnah|makkah|madinah|iqraa|resalah|قرآن|القرآن|سنة|مكة|islam/.test(n)) out.add("religious");
  if (cats.includes("news") || /news|akhbar|أخبار/.test(n)) out.add("news");
  if (cats.includes("kids") || cats.includes("animation") || /cartoon|spacetoon|nick|baraem|jeem|toyor|majid|disney|kids|أطفال/.test(n)) out.add("kids");
  if (cats.includes("movies") || /cinema|movie|aflam|film|سينما|أفلام/.test(n)) out.add("movies");
  if (cats.includes("series") || /drama|series|مسلسل|دراما/.test(n)) out.add("series");
  if (cats.includes("sports")) out.add("sports");
  if (cats.includes("music") || /rotana|mazzika|music|موسيقى|طرب/.test(n)) out.add("music");
  if (cats.includes("documentary") || cats.includes("science") || /geographic|discovery|nat ?geo|history|documentary|وثائقي/.test(n)) out.add("documentary");
  if (cats.includes("education") || /edu|school|ta3lim|تعليم/.test(n)) out.add("education");
  if (cats.includes("culture") || cats.includes("classic") || cats.includes("legislative") || /arte|mezzo|culture|ثقاف/.test(n)) out.add("culture");
  if (cats.includes("entertainment") || cats.includes("general") || cats.includes("comedy") || /entertain|comedy|ترفيه/.test(n)) out.add("entertainment");
  return [...out];
}

export function sectionOf(c: TvChannelDTO): string[] {
  const out: string[] = [];
  const cats = c.categories;
  const n = (c.name + " " + c.altNames.join(" ") + " " + c.id).toLowerCase();
  if (c.country === "EG") out.push("egypt");
  else if (ARAB_COUNTRIES.includes(c.country)) out.push("arabic");
  if (cats.includes("news") || /news|akhbar|أخبار/.test(n)) out.push("news");
  if (cats.includes("kids") || cats.includes("animation") || /cartoon|spacetoon|nick|baraem|jeem|toyor|majid|disney|kids|أطفال/.test(n)) out.push("kids");
  if (cats.includes("movies") || /cinema|movie|aflam|film|سينما|أفلام/.test(n)) out.push("movies");
  if (cats.includes("series")) out.push("series");
  if (cats.includes("religious") || /quran|qur'an|sunnah|makkah|madinah|iqraa|resalah|قرآن|القرآن|سنة|مكة/.test(n)) out.push("quran");
  if (cats.includes("documentary") || cats.includes("science") || cats.includes("education") || /geographic|discovery|nat ?geo|history|documentary/.test(n)) out.push("documentary");
  if (cats.includes("sports")) out.push("sports");
  if (cats.includes("music")) out.push("music");
  if (cats.includes("culture") || cats.includes("classic") || cats.includes("legislative") || /arte|mezzo|culture/.test(n)) out.push("culture");
  if (!c.country || (!ARAB_COUNTRIES.includes(c.country) && out.filter((s) => s !== "news" && s !== "kids" && s !== "movies").length === 0)) out.push("world");
  return out.length ? out : ["world"];
}
