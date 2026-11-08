// DON MUSE — real-content seeder (official YouTube Data API v3 + Audius).
// Pulls REAL songs from the documented YouTube Data API, caches them in
// PostgreSQL and builds the starter library from those tracks.
//
// SAFETY: this script DESTROYS data (TRUNCATE + CASCADE, including users). It now
// refuses to run unless you opt in explicitly:
//     DONMUSE_ALLOW_DESTRUCTIVE_SEED=1 DATABASE_URL=… YOUTUBE_API_KEY=… npm run seed
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

const hashStr = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const slugify = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `x-${hashStr(n).toString(36)}`;
const waveform = (seed, n = 160) => {
  let s = hashStr(seed) || 1;
  const out = [];
  let v = 0.5;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    v = Math.min(1, Math.max(0.06, v + (s / 4294967296 - 0.5) * 0.4));
    out.push(Number((v * 2 - 1).toFixed(3)));
  }
  return out;
};

async function findOrCreateArtist(name) {
  const r = await client.query("select id from artists where lower(name) = lower($1) limit 1", [name]);
  if (r.rows[0]) return r.rows[0].id;
  const ins = await client.query(
    "insert into artists (name, slug, genres) values ($1,$2,$3) returning id",
    [name, `${slugify(name)}-${hashStr(name).toString(36)}`, []],
  );
  return ins.rows[0].id;
}

async function findOrCreateAlbum(title, artistId, coverUrl, year) {
  const r = await client.query(
    "select id from albums where artist_id=$1 and lower(title)=lower($2) limit 1",
    [artistId, title],
  );
  if (r.rows[0]) return r.rows[0].id;
  const ins = await client.query(
    "insert into albums (title, slug, artist_id, cover_url, release_date, type, total_tracks) values ($1,$2,$3,$4,$5,'album',0) returning id",
    [title, `${slugify(title)}-${hashStr(title + artistId).toString(36)}`, artistId, coverUrl, year ? `${year}-01-01` : null],
  );
  return ins.rows[0].id;
}

async function upsertTrack(t) {
  const existing = await client.query(
    "select id from tracks where source=$1 and source_id=$2 limit 1",
    [t.source, t.sourceId],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const artistId = await findOrCreateArtist(t.artistName);
  const albumId = t.albumTitle ? await findOrCreateAlbum(t.albumTitle, artistId, t.coverUrl, t.year) : null;
  const ins = await client.query(
    `insert into tracks (title, artist_id, album_id, duration_sec, source, source_id, source_url, preview_url, waveform, loudness_lufs, bpm, energy, valence, danceability, acousticness, genre, year, codec, bitrate, lossless, play_count)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,-14,120,0.5,0.5,0.5,0.5,$10,$11,$12,$13,false,$14) returning id`,
    [
      t.title, artistId, albumId, t.durationSec, t.source, t.sourceId, t.previewUrl, t.previewUrl,
      JSON.stringify(waveform(t.source + t.sourceId)), t.genre || "pop", t.year || new Date().getFullYear(),
      t.source === "youtube" ? "youtube" : "aac", t.source === "youtube" ? 0 : 256, t.playCount || 0,
    ],
  );
  return ins.rows[0].id;
}

async function fetchAudiusTrending(limit = 12) {
  const hostRes = await fetch("https://api.audius.co");
  const host = (await hostRes.json()).data?.[0] ?? "https://discoveryprovider.audius.co";
  const res = await fetch(`${host}/v1/tracks/trending?app_name=DONMUSE`);
  const data = await res.json();
  return (data.data ?? []).slice(0, limit).map((t) => ({
    source: "audius",
    sourceId: t.id,
    title: t.title,
    artistName: t.user?.name || "Unknown Artist",
    albumTitle: null,
    coverUrl: t.artwork?.["1000x1000"] || t.artwork?.["480x480"] || null,
    durationSec: t.duration || 0,
    previewUrl: null,
    genre: (t.genre || "trending").toLowerCase(),
    year: t.release_date ? Number(t.release_date.slice(0, 4)) : null,
    playCount: t.play_count || 0,
  }));
}

const YT_API = "https://www.googleapis.com/youtube/v3";

function isoSeconds(iso) {
  if (!iso) return 0;
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

/** Official Data API v3 search → real songs (no InnerTube, no extraction). */
async function fetchYouTube(query, limit = 12) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    console.warn("YOUTUBE_API_KEY is not set — skipping YouTube seeding.");
    return [];
  }
  const searchUrl = new URL(`${YT_API}/search`);
  for (const [k, v] of Object.entries({
    part: "snippet",
    q: `${query} song`,
    type: "video",
    videoCategoryId: "10",
    maxResults: String(Math.min(25, limit)),
    key,
  })) searchUrl.searchParams.set(k, v);
  const sres = await fetch(searchUrl);
  if (!sres.ok) return [];
  const sjson = await sres.json();
  const ids = (sjson.items ?? []).map((i) => i.id?.videoId).filter(Boolean);
  if (ids.length === 0) return [];

  const vidUrl = new URL(`${YT_API}/videos`);
  vidUrl.searchParams.set("part", "snippet,contentDetails,statistics");
  vidUrl.searchParams.set("id", ids.join(","));
  vidUrl.searchParams.set("key", key);
  const vres = await fetch(vidUrl);
  if (!vres.ok) return [];
  const vjson = await vres.json();

  return (vjson.items ?? [])
    .map((v) => {
      const dur = isoSeconds(v.contentDetails?.duration);
      const channel = (v.snippet?.channelTitle ?? "").replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").trim();
      return {
        source: "youtube",
        sourceId: v.id,
        title: v.snippet?.title ?? "",
        artistName: channel || "Unknown Artist",
        albumTitle: null,
        coverUrl: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
        durationSec: dur,
        previewUrl: null,
        genre: query.toLowerCase(),
        year: v.snippet?.publishedAt ? Number(v.snippet.publishedAt.slice(0, 4)) : null,
        playCount: v.statistics?.viewCount ? Number(v.statistics.viewCount) : 0,
      };
    })
    .filter((t) => t.sourceId && t.title && t.durationSec > 0)
    .slice(0, limit);
}

async function main() {
  if (process.env.DONMUSE_ALLOW_DESTRUCTIVE_SEED !== "1") {
    console.error(
      "Refusing to run: this seeder TRUNCATES users, playlists, likes and history.\n" +
        "Set DONMUSE_ALLOW_DESTRUCTIVE_SEED=1 if that is really what you want.",
    );
    process.exit(1);
  }
  console.log("Truncating existing catalog…");
  await client.query(
    "TRUNCATE listening_history, user_track_likes, playlist_tracks, playlists, tracks, albums, artists, users RESTART IDENTITY CASCADE",
  );

  const user = await client.query(
    // No shared "demo" account: the seeder simply owns its catalog rows. Every
    // visitor gets their own signed session user at runtime.
    "insert into users (email, name, avatar_url, tier) values ('seed@donmuse.local','DON MUSE Seed','/logo.svg','ultimate') returning id",
  );
  const userId = user.rows[0].id;

  console.log("Fetching real tracks from YouTube Music + Audius…");
  const [audius, ytTrending, ytElectronic, ytLofi, ytArabic] = await Promise.all([
    fetchAudiusTrending(10).catch(() => []),
    fetchYouTube("top hits 2025", 12).catch(() => []),
    fetchYouTube("electronic music", 8).catch(() => []),
    fetchYouTube("lofi hip hop", 8).catch(() => []),
    fetchYouTube("arabic pop", 8).catch(() => []),
  ]);

  const all = [...ytTrending, ...audius, ...ytElectronic, ...ytLofi, ...ytArabic];
  const seen = new Set();
  const trackIds = [];
  for (const t of all) {
    const key = `${t.source}:${t.sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    trackIds.push(await upsertTrack(t));
  }
  console.log(`Cached ${trackIds.length} real tracks.`);

  // Playlists from real tracks
  const playlists = [
    { title: "Liked Tracks", desc: "Everything your heart tapped twice on.", picks: trackIds.slice(0, 8) },
    { title: "YouTube Music Trending", desc: "Full-length songs from YouTube Music right now.", picks: trackIds.slice(0, 10) },
    { title: "Audius Trending", desc: "Independent artists, full-length and downloadable.", picks: trackIds.slice(12, 20) },
    { title: "AI: Late Night Electronic", desc: "Generated by DON MUSE AI from real YouTube Music results.", picks: trackIds.slice(20, 28) },
  ];
  for (const [pi, p] of playlists.entries()) {
    const r = await client.query(
      "insert into playlists (title, slug, description, cover_url, owner_id, collaborative, is_public) values ($1,$2,$3,$4,$5,false,true) returning id",
      [p.title, slugify(p.title) + "-" + pi, p.desc, `https://picsum.photos/seed/pl-${pi}/600/600`, userId],
    );
    const pid = r.rows[0].id;
    for (const [pos, tid] of p.picks.entries()) {
      await client.query("insert into playlist_tracks (playlist_id, track_id, position) values ($1,$2,$3) on conflict do nothing", [pid, tid, pos]);
    }
    if (pi === 0) {
      for (const tid of p.picks) {
        await client.query("insert into user_track_likes (user_id, track_id) values ($1,$2) on conflict do nothing", [userId, tid]);
      }
    }
  }

  // Listening history (drives recently played + stats)
  let s = 42;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < 60; i++) {
    const tid = trackIds[Math.floor(rnd() * trackIds.length)];
    await client.query(
      "insert into listening_history (user_id, track_id, played_at, duration_listened_sec, device) values ($1,$2, now() - (interval '1 minute' * $3), $4, $5)",
      [userId, tid, Math.floor(rnd() * 20000), 30 + rnd() * 300, rnd() > 0.7 ? "mobile" : "web"],
    );
  }

  console.log("Seed complete — real catalog live.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { client.release(); await pool.end(); });
