// ============================================================================
//  Official YouTube Music artist profile (youtubei.js InnerTube).
//  Returns the OFFICIAL account (not the auto "- Topic" channel): handle,
//  official avatar + banner, real subscriber count, total channel views,
//  monthly audience, video count, country, join date, official links, and the
//  full official catalog sections exactly as YouTube Music lists them:
//  Top songs (with real play counts) · Albums · Singles & EPs · Videos (with
//  real view counts) · Live performances · Featured on · Fans might also like.
// ============================================================================
import { Innertube } from "youtubei.js";

let innertubePromise: Promise<Innertube> | null = null;
function getInnertube(): Promise<Innertube> {
  if (!innertubePromise) {
    innertubePromise = Innertube.create().catch((e) => {
      innertubePromise = null;
      throw e;
    });
  }
  return innertubePromise;
}

export interface OfficialSong {
  videoId: string;
  title: string;
  artists: string[];
  album: string | null;
  plays: string | null; // "59M plays"
  playsNum: number;
  durationSec: number;
  thumb: string | null;
}
export interface OfficialVideo {
  videoId: string;
  title: string;
  subtitle: string; // "Orange & Amr Diab • 41M views"
  views: string | null;
  viewsNum: number;
  thumb: string | null;
}
export interface OfficialAlbum {
  browseId: string;
  title: string;
  year: string | null;
  kind: "album" | "single";
  thumb: string | null;
}
export interface OfficialRelated {
  channelId: string;
  name: string;
  monthly: string | null; // "32.9M monthly audience"
  monthlyNum: number;
  thumb: string | null;
}
export interface OfficialArtist {
  topicChannelId: string; // YouTube Music artist id (UC…)
  officialChannelId: string | null; // the artist's real channel (from subscribe button)
  name: string;
  handle: string | null; // "@AmrDiab"
  description: string | null;
  avatar: string | null;
  banner: string | null;
  subscribers: string | null; // "7.54M subscribers"
  subscribersNum: number;
  totalViews: string | null; // "4,049,297,636 views"
  totalViewsNum: number;
  monthlyAudience: string | null; // "53.5M monthly audience"
  monthlyAudienceNum: number;
  videoCount: string | null;
  country: string | null;
  joined: string | null;
  links: { title: string; url: string }[];
  verified: boolean;
  topSongs: OfficialSong[];
  albums: OfficialAlbum[];
  singles: OfficialAlbum[];
  videos: OfficialVideo[];
  live: OfficialVideo[];
  featuredOn: { browseId: string; title: string; thumb: string | null }[];
  related: OfficialRelated[];
  fetchedAt: number;
}

/* --------------------------------- utils --------------------------------- */

export function parseCount(s: string | null | undefined): number {
  if (!s) return 0;
  const m = s.replace(/,/g, "").match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return 0;
  const n = Number(m[1]);
  const u = (m[2] ?? "").toUpperCase();
  return Math.round(n * (u === "K" ? 1e3 : u === "M" ? 1e6 : u === "B" ? 1e9 : 1));
}

function txt(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  const o = v as { text?: unknown; toString?: () => string };
  if (typeof o.text === "string") return o.text;
  return typeof o.toString === "function" ? String(o.toString()) : "";
}

function bigThumb(url: string | undefined | null): string | null {
  if (!url) return null;
  let u = url.startsWith("//") ? `https:${url}` : url;
  u = u.replace(/=w\d+-h\d+(-[a-z0-9-]+)?$/, "=w1080-h1080-l90-rj").replace(/=s\d+(-[a-z0-9-]+)?$/, "=s1080");
  return u;
}

interface ThumbLike { url: string; width?: number }
function pickThumb(list: ThumbLike[] | undefined): string | null {
  if (!list || list.length === 0) return null;
  const best = [...list].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  return bigThumb(best.url);
}

function durToSec(d: string): number {
  const p = d.split(":").map(Number);
  if (p.some(Number.isNaN) || p.length === 0) return 0;
  return p.reduce((a, b) => a * 60 + b, 0);
}

/* ------------------------------ main fetch ------------------------------- */

const cache = new Map<string, OfficialArtist>();
const TTL = 60 * 60 * 1000;

/** Resolve a YouTube Music artist (topic channel id) → full official profile. */
export async function getOfficialArtist(topicChannelId: string): Promise<OfficialArtist> {
  const hit = cache.get(topicChannelId);
  if (hit && Date.now() - hit.fetchedAt < TTL) return hit;
  const yt = await getInnertube();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a: any = await yt.music.getArtist(topicChannelId);
  const h = a.header ?? {};
  const name = txt(h.title) || "Unknown";
  const officialChannelId: string | null = h.subscription_button?.channel_id ?? null;
  const description: string | null = txt(h.description) || null;
  const avatarHdr = pickThumb(h.thumbnail?.contents ?? h.thumbnail);

  // sections
  const sec = (re: RegExp) => (a.sections ?? []).find((s: { header?: { title?: unknown }; title?: unknown }) => re.test(txt(s.header?.title ?? s.title)));
  const topSongs: OfficialSong[] = [];
  for (const it of sec(/top songs|songs/i)?.contents ?? []) {
    const cols: string[] = (it.flex_columns ?? []).map((c: { title?: unknown }) => txt(c.title));
    const playsCol = cols.find((c) => /plays|views/i.test(c)) ?? null;
    const artistsCol = cols[1] ?? "";
    if (!it.id) continue;
    topSongs.push({
      videoId: it.id,
      title: txt(it.title) || cols[0] || "",
      artists: artistsCol.split(/\s*(?:&|,|feat\.?)\s*/i).filter(Boolean),
      album: cols[3] ?? (typeof it.album === "string" ? it.album : it.album?.name ?? null),
      plays: playsCol,
      playsNum: parseCount(playsCol),
      durationSec: it.duration?.seconds ?? (it.duration?.text ? durToSec(it.duration.text) : 0),
      thumb: pickThumb(it.thumbnail?.contents ?? it.thumbnails) ?? `https://i.ytimg.com/vi/${it.id}/hqdefault.jpg`,
    });
  }
  const twoRow = (s: { contents?: unknown[] } | undefined) => (s?.contents ?? []) as Array<{ id?: string; title?: unknown; subtitle?: unknown; year?: string; thumbnail?: ThumbLike[]; endpoint?: { payload?: { browseId?: string; videoId?: string } } }>;
  const albums: OfficialAlbum[] = twoRow(sec(/^albums$/i)).filter((x) => x.id).map((x) => ({ browseId: x.id!, title: txt(x.title), year: x.year ?? (txt(x.subtitle).match(/\d{4}/)?.[0] ?? null), kind: "album" as const, thumb: pickThumb(x.thumbnail) }));
  const singles: OfficialAlbum[] = twoRow(sec(/singles/i)).filter((x) => x.id).map((x) => ({ browseId: x.id!, title: txt(x.title), year: x.year ?? (txt(x.subtitle).match(/\d{4}/)?.[0] ?? null), kind: "single" as const, thumb: pickThumb(x.thumbnail) }));
  const toVideo = (x: { id?: string; title?: unknown; subtitle?: unknown; thumbnail?: ThumbLike[] }): OfficialVideo | null => {
    if (!x.id) return null;
    const sub = txt(x.subtitle);
    const views = sub.match(/([\d.,]+\s*[KMB]?\s*views)/i)?.[1] ?? null;
    return { videoId: x.id, title: txt(x.title), subtitle: sub, views, viewsNum: parseCount(views), thumb: pickThumb(x.thumbnail) ?? `https://i.ytimg.com/vi/${x.id}/hqdefault.jpg` };
  };
  const videos = twoRow(sec(/^videos$/i)).map(toVideo).filter((v): v is OfficialVideo => !!v);
  const live = twoRow(sec(/live/i)).map(toVideo).filter((v): v is OfficialVideo => !!v);
  const featuredOn = twoRow(sec(/featured on/i)).filter((x) => x.id).map((x) => ({ browseId: x.id!, title: txt(x.title), thumb: pickThumb(x.thumbnail) }));
  const related: OfficialRelated[] = twoRow(sec(/fans|similar|also like/i)).filter((x) => x.id).map((x) => {
    const sub = txt(x.subtitle);
    const monthly = sub.match(/([\d.,]+\s*[KMB]?\s*monthly audience)/i)?.[1] ?? null;
    return { channelId: x.id!, name: txt(x.title), monthly, monthlyNum: parseCount(monthly), thumb: pickThumb(x.thumbnail) };
  });

  // monthly audience: from artist search subtitle ("Artist • 53.5M monthly audience")
  let monthlyAudience: string | null = null;
  try {
    const s = await yt.music.search(name, { type: "artist" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list: any[] = ((s.contents?.[0] as { contents?: unknown[] } | undefined)?.contents ?? []) as any[];
    const hitItem = list.find((it) => it?.id === topicChannelId) ?? list[0];
    const flex: string[] = (hitItem?.flex_columns ?? []).map((c: { title?: unknown }) => txt(c.title));
    monthlyAudience = flex.join(" ").match(/([\d.,]+\s*[KMB]?\s*monthly audience)/i)?.[1] ?? null;
  } catch {
    /* ignore */
  }

  // official channel stats (subscribers, total views, banner, links, country, joined)
  let handle: string | null = null;
  let subscribers: string | null = null;
  let totalViews: string | null = null;
  let videoCount: string | null = null;
  let country: string | null = null;
  let joined: string | null = null;
  let banner: string | null = null;
  let avatar: string | null = avatarHdr;
  let links: { title: string; url: string }[] = [];
  const chId = officialChannelId ?? topicChannelId;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch: any = await yt.getChannel(chId);
    const rows = ch.header?.content?.metadata?.metadata_rows ?? [];
    for (const r of rows) for (const p of r.metadata_parts ?? []) {
      const t = txt(p.text);
      if (t.startsWith("@")) handle = t;
      if (/subscribers?/i.test(t)) subscribers = t;
    }
    banner = pickThumb(ch.header?.content?.banner?.image) ?? pickThumb(ch.header?.banner?.image) ?? null;
    const av = pickThumb(ch.metadata?.avatar);
    if (av) avatar = av;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const about: any = await ch.getAbout();
      const m = about?.metadata ?? {};
      subscribers = txt(m.subscriber_count) || subscribers;
      totalViews = txt(m.view_count) || null;
      videoCount = txt(m.video_count) || null;
      country = txt(m.country) || null;
      joined = txt(m.joined_date) || null;
      links = (m.links ?? []).map((l: { title?: unknown; link?: unknown }) => ({ title: txt(l.title), url: txt(l.link) })).filter((l: { title: string; url: string }) => l.url);
      if (!description && txt(m.description)) (a.header ??= {}).description = m.description;
    } catch {
      /* about unavailable */
    }
  } catch {
    /* channel unavailable */
  }

  const out: OfficialArtist = {
    topicChannelId,
    officialChannelId,
    name,
    handle,
    description: description ?? null,
    avatar,
    banner,
    subscribers,
    subscribersNum: parseCount(subscribers),
    totalViews,
    totalViewsNum: parseCount(totalViews),
    monthlyAudience,
    monthlyAudienceNum: parseCount(monthlyAudience),
    videoCount,
    country,
    joined,
    links,
    verified: !!officialChannelId,
    topSongs,
    albums,
    singles,
    videos,
    live,
    featuredOn,
    related,
    fetchedAt: Date.now(),
  };
  cache.set(topicChannelId, out);
  return out;
}

/** Find the YouTube Music artist id for a name (best match). */
export async function findArtistChannelId(name: string): Promise<{ id: string; name: string; monthly: string | null; thumb: string | null } | null> {
  const yt = await getInnertube();
  const s = await yt.music.search(name, { type: "artist" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = (s.contents?.[0] as { contents?: unknown[] } | undefined)?.contents ?? [];
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, "");
  const exact = items.find((it) => norm(txt(it.name ?? it.title)) === norm(name)) ?? items[0];
  if (!exact?.id) return null;
  const flex: string[] = (exact.flex_columns ?? []).map((c: { title?: unknown }) => txt(c.title));
  return { id: exact.id, name: txt(exact.name ?? exact.title), monthly: flex.join(" ").match(/([\d.,]+\s*[KMB]?\s*monthly audience)/i)?.[1] ?? null, thumb: pickThumb(exact.thumbnail?.contents ?? exact.thumbnails) };
}
