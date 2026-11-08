// ============================================================================
//  Artist profile builder — OFFICIAL data first.
//  Resolves the artist's YouTube Music id → pulls the official profile
//  (real avatar/banner, @handle, subscribers, total views, monthly audience,
//  links) and the official catalog sections (Top songs with real play counts,
//  Albums, Singles & EPs, Videos + Live with real view counts, Featured on,
//  Fans might also like with monthly audience). Everything playable is
//  cached into the catalog so the whole discography lives in the profile.
//  Non-YouTube artists (Audius / SoundCloud / Archive) fall back to the local
//  catalog + lightweight enrichment.
// ============================================================================
import { db } from "@/db";
import { albums, artists, listeningHistory, tracks } from "@/db/schema";
import { and, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { albumLikedSet, hydrateArtists, hydrateTracks } from "./queries";
import { upsertAlbums, upsertArtists, upsertTracks } from "./catalog";
import { channelTopVideos, findArtistChannelId, officialArtistByChannelId } from "./youtube-data";
import type { OfficialArtist } from "./youtube-artist";
import type { ExternalTrack } from "./external";
import type { AlbumDTO, ArtistProfileDTO, OfficialVideoDTO, TrackDTO } from "@/lib/types";

/** Split "A feat. B", "A & B", "A, B", "A x B" into artist names. */
export function splitArtists(name: string): string[] {
  return name
    .split(/\s*(?:feat\.?|ft\.?|featuring|&|,|\bx\b|\bvs\.?\b|\bwith\b|\+)\s*/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

function songToExternal(s: OfficialArtist["topSongs"][number], artistName: string): ExternalTrack {
  return {
    source: "youtube",
    sourceId: s.videoId,
    title: s.title,
    artistName: s.artists[0] && s.artists.length > 1 ? s.artists.join(" & ") : artistName,
    albumTitle: s.album,
    coverUrl: s.thumb ?? `https://i.ytimg.com/vi/${s.videoId}/hqdefault.jpg`,
    durationSec: s.durationSec || 240,
    previewUrl: null,
    genre: "pop",
    year: null,
  };
}
function videoToExternal(v: OfficialArtist["videos"][number], artistName: string): ExternalTrack {
  const who = v.subtitle.split("•")[0]?.trim() || artistName;
  return {
    source: "youtube",
    sourceId: v.videoId,
    title: v.title,
    artistName: who,
    albumTitle: null,
    coverUrl: v.thumb ?? `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
    durationSec: 240,
    previewUrl: null,
    genre: "pop",
    year: null,
  };
}

export async function buildArtistProfile(artistId: number, userId: number): Promise<ArtistProfileDTO | null> {
  const [ar] = await db.select().from(artists).where(eq(artists.id, artistId)).limit(1);
  if (!ar) return null;
  const baseName = ar.name.split(/\s*(?:feat\.?|ft\.?|&|,)\s*/i)[0].trim();

  // ---------- resolve official YouTube Music id ----------
  let official: OfficialArtist | null = null;
  if (ar.source === "youtube" || true) {
    try {
      let topicId = ar.sourceId && ar.sourceId.startsWith("UC") ? ar.sourceId : null;
      if (!topicId) {
        const hit = await findArtistChannelId(baseName);
        if (hit) {
          topicId = hit.id;
          await db.update(artists).set({ sourceId: hit.id, source: "youtube" }).where(eq(artists.id, artistId));
        }
      }
      if (topicId) {
        // Official channel data + its most-viewed music videos. The Data API does
        // not expose a "top songs" list, so we derive it from real view counts and
        // mark the profile honestly (featuredOn/related stay empty — see below).
        const [channel, top] = await Promise.all([
          officialArtistByChannelId(topicId),
          channelTopVideos(topicId, 12),
        ]);
        if (channel) {
          official = {
            topicChannelId: channel.id,
            officialChannelId: channel.id,
            name: channel.name,
            handle: channel.handle,
            description: channel.description,
            avatar: channel.avatar,
            banner: channel.banner,
            subscribers: channel.subscribers !== null ? `${channel.subscribers}` : null,
            subscribersNum: channel.subscribers ?? 0,
            totalViews: `${channel.totalViews}`,
            totalViewsNum: channel.totalViews,
            monthlyAudience: null,
            monthlyAudienceNum: 0,
            videoCount: `${channel.videoCount}`,
            country: channel.country,
            joined: channel.joined,
            links: [],
            verified: true,
            topSongs: top.map((t) => ({
              videoId: t.sourceId,
              title: t.title,
              artists: [t.artistName],
              album: null,
              plays: t.playCount ? `${t.playCount}` : null,
              playsNum: t.playCount ?? 0,
              durationSec: t.durationSec,
              thumb: t.coverUrl,
            })),
            albums: [],
            singles: [],
            videos: [],
            live: [],
            featuredOn: [],
            related: [],
            fetchedAt: Date.now(),
          };
        }
      }
    } catch {
      official = null;
    }
  }

  // ---------- persist official identity + catalog ----------
  let topTracks: TrackDTO[] = [];
  const topPlays: Record<number, string> = {};
  let videos: OfficialVideoDTO[] = [];
  let live: OfficialVideoDTO[] = [];
  let albumDTOs: AlbumDTO[] = [];
  let singleDTOs: AlbumDTO[] = [];
  let related: (import("@/lib/types").ArtistDTO & { monthly: string | null })[] = [];

  if (official) {
    await db
      .update(artists)
      .set({
        name: official.name || ar.name,
        imageUrl: official.avatar ?? ar.imageUrl,
        bio: official.description ?? ar.bio,
        verified: true,
        monthlyListeners: official.monthlyAudienceNum || official.subscribersNum || ar.monthlyListeners,
        source: "youtube",
        sourceId: official.topicChannelId,
      })
      .where(eq(artists.id, artistId));

    // top songs (official order, real plays)
    const songs = official.topSongs;
    const songTracks = await upsertTracks(songs.map((s) => songToExternal(s, official!.name)), userId);
    // force-attach to this artist row so the profile owns them
    const ownIds = songTracks.map((t) => t.id);
    if (ownIds.length) await db.update(tracks).set({ artistId }).where(and(inArray(tracks.id, ownIds), ne(tracks.artistId, artistId)));
    topTracks = await hydrateTracks(await db.select().from(tracks).where(inArray(tracks.id, ownIds.length ? ownIds : [-1])), userId);
    topTracks.sort((a, b) => ownIds.indexOf(a.id) - ownIds.indexOf(b.id));
    songs.forEach((s, i) => {
      const t = songTracks[i];
      if (t && s.plays) topPlays[t.id] = s.plays;
    });
    // update play counts with the real numbers so sorting elsewhere reflects reality
    for (const [i, s] of songs.entries()) {
      const t = songTracks[i];
      if (t && s.playsNum) await db.update(tracks).set({ playCount: s.playsNum }).where(eq(tracks.id, t.id));
    }

    // videos + live (real view counts)
    const vTracks = await upsertTracks(official.videos.map((v) => videoToExternal(v, official!.name)), userId);
    videos = official.videos.map((v, i) => ({ track: vTracks[i], views: v.views, viewsNum: v.viewsNum, subtitle: v.subtitle, kind: "video" as const })).filter((x) => !!x.track);
    const lTracks = await upsertTracks(official.live.map((v) => videoToExternal(v, official!.name)), userId);
    live = official.live.map((v, i) => ({ track: lTracks[i], views: v.views, viewsNum: v.viewsNum, subtitle: v.subtitle, kind: "live" as const })).filter((x) => !!x.track);
    const vidIds = [...vTracks, ...lTracks].map((t) => t.id);
    if (vidIds.length) await db.update(tracks).set({ artistId }).where(and(inArray(tracks.id, vidIds), ne(tracks.artistId, artistId)));

    // albums + singles (official covers)
    const albRows = await upsertAlbums(official.albums.map((a) => ({ id: a.browseId, title: a.title, artistName: official!.name, year: a.year, imageUrl: a.thumb })));
    const sinRows = await upsertAlbums(official.singles.map((a) => ({ id: a.browseId, title: a.title, artistName: official!.name, year: a.year, imageUrl: a.thumb })));
    const allAlb = [...albRows, ...sinRows];
    if (allAlb.length) await db.update(albums).set({ artistId }).where(and(inArray(albums.id, allAlb.map((x) => x.id)), ne(albums.artistId, artistId)));
    const likedAl = await albumLikedSet(userId, allAlb.map((x) => x.id));
    const toAlbumDTO = (r: typeof albums.$inferSelect, kind: string): AlbumDTO => ({
      id: r.id, title: r.title, slug: r.slug, artistId, artistName: official!.name, coverUrl: r.coverUrl, releaseDate: r.releaseDate, type: kind, totalTracks: r.totalTracks, genres: r.genres, lossless: r.lossless, label: r.label, liked: likedAl.has(r.id),
    });
    albumDTOs = albRows.map((r) => toAlbumDTO(r, "album"));
    singleDTOs = sinRows.map((r) => toAlbumDTO(r, "single"));
    if (albRows.length) await db.update(albums).set({ type: "album" }).where(inArray(albums.id, albRows.map((r) => r.id)));
    if (sinRows.length) await db.update(albums).set({ type: "single" }).where(inArray(albums.id, sinRows.map((r) => r.id)));

    // related (official "Fans might also like" with monthly audience)
    const relRows = await upsertArtists(official.related.map((r) => ({ id: r.channelId, name: r.name, imageUrl: r.thumb, subscribers: r.monthly })));
    for (const r of official.related) {
      const row = relRows.find((x) => x.name.toLowerCase() === r.name.toLowerCase());
      if (row && r.monthlyNum) await db.update(artists).set({ monthlyListeners: r.monthlyNum, sourceId: r.channelId, source: "youtube" }).where(eq(artists.id, row.id));
    }
    const relDTOs = await hydrateArtists(relRows, userId);
    related = relDTOs.map((d) => ({ ...d, monthly: official!.related.find((r) => r.name.toLowerCase() === d.name.toLowerCase())?.monthly ?? null }));
  }

  // ---------- local fallback / complement ----------
  const localTracks = await db.select().from(tracks).where(eq(tracks.artistId, artistId)).orderBy(desc(tracks.playCount)).limit(80);
  if (topTracks.length === 0) topTracks = await hydrateTracks(localTracks.slice(0, 30), userId);
  else {
    // append the rest of the artist's catalog after the official top songs
    const seen = new Set(topTracks.map((t) => t.id));
    const vidSet = new Set([...videos, ...live].map((v) => v.track.id));
    const rest = await hydrateTracks(localTracks.filter((t) => !seen.has(t.id) && !vidSet.has(t.id)).slice(0, 40), userId);
    topTracks = [...topTracks, ...rest];
  }
  if (albumDTOs.length === 0) {
    const localAlbums = await db.select().from(albums).where(eq(albums.artistId, artistId)).orderBy(desc(albums.createdAt));
    const likedAl = await albumLikedSet(userId, localAlbums.map((a) => a.id));
    albumDTOs = localAlbums.map((r) => ({ id: r.id, title: r.title, slug: r.slug, artistId, artistName: ar.name, coverUrl: r.coverUrl, releaseDate: r.releaseDate, type: r.type, totalTracks: r.totalTracks, genres: r.genres, lossless: r.lossless, label: r.label, liked: likedAl.has(r.id) }));
  }

  // collaborations: tracks credited to "X feat. Y"/"X & Y" that mention this artist, excluding own rows
  const collabArtistRows = await db.select().from(artists).where(and(ne(artists.id, artistId), or(ilike(artists.name, `%${baseName}%`))!)).limit(30);
  const collabIds = collabArtistRows.map((r) => r.id);
  const collabRows = collabIds.length ? await db.select().from(tracks).where(inArray(tracks.artistId, collabIds)).orderBy(desc(tracks.playCount)).limit(40) : [];
  const featTitled = localTracks.filter((t) => /\(feat|ft\.|featuring|with |&/i.test(t.title));
  const collabAll = [...collabRows, ...featTitled].filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i);

  if (related.length === 0) {
    const genre = localTracks[0]?.genre;
    const relRows = await db
      .select({ a: artists })
      .from(artists)
      .innerJoin(tracks, eq(tracks.artistId, artists.id))
      .where(and(ne(artists.id, artistId), genre ? eq(tracks.genre, genre) : sql`true`))
      .groupBy(artists.id)
      .orderBy(desc(sql`count(${tracks.id})`))
      .limit(12);
    related = (await hydrateArtists(relRows.map((r) => r.a), userId)).map((d) => ({ ...d, monthly: null }));
  }

  const [playsRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(listeningHistory)
    .innerJoin(tracks, eq(listeningHistory.trackId, tracks.id))
    .where(eq(tracks.artistId, artistId));

  const [fresh] = await db.select().from(artists).where(eq(artists.id, artistId)).limit(1);
  const [artistDTO] = await hydrateArtists([fresh ?? ar], userId);
  artistDTO.official = official
    ? {
        handle: official.handle,
        officialChannelId: official.officialChannelId,
        bannerUrl: official.banner,
        subscribers: official.subscribers,
        subscribersNum: official.subscribersNum,
        totalViews: official.totalViews,
        totalViewsNum: official.totalViewsNum,
        monthlyAudience: official.monthlyAudience,
        monthlyAudienceNum: official.monthlyAudienceNum,
        videoCount: official.videoCount,
        country: official.country,
        joined: official.joined,
        links: official.links,
        description: official.description,
      }
    : null;

  return {
    artist: artistDTO,
    topTracks,
    topPlays,
    albums: albumDTOs,
    singles: singleDTOs,
    collaborations: await hydrateTracks(collabAll.slice(0, 40), userId),
    videos,
    live,
    featuredOn: official?.featuredOn.map((f) => ({ id: f.browseId, title: f.title, coverUrl: f.thumb })) ?? [],
    related,
    stats: { tracks: localTracks.length, albums: albumDTOs.length + singleDTOs.length, plays: playsRow?.c ?? 0 },
  };
}
