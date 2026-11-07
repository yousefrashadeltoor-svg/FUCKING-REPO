import {
  pgTable,
  serial,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/*  DON MUSE — relational core                                */
/* ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    tier: text("tier").notNull().default("free"), // free | plus | premium | ultimate
    locale: text("locale").notNull().default("en"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("users_email_idx").on(t.email)],
);

export const artists = pgTable(
  "artists",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    bio: text("bio"),
    imageUrl: text("image_url"),
    verified: boolean("verified").notNull().default(false),
    monthlyListeners: integer("monthly_listeners").notNull().default(0),
    genres: text("genres").array().notNull().default([]),
    /** Platform the artist was discovered on: youtube | audius | soundcloud | archive */
    source: text("source").notNull().default("youtube"),
    /** Platform id (YouTube channel id, Audius user id, …) */
    sourceId: text("source_id"),
  },
  (t) => [
    index("artists_name_idx").on(t.name),
    index("artists_slug_idx").on(t.slug),
  ],
);

export const albums = pgTable(
  "albums",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    artistId: integer("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    coverUrl: text("cover_url"),
    releaseDate: text("release_date"),
    type: text("type").notNull().default("album"), // album | single | ep | compilation
    totalTracks: integer("total_tracks").notNull().default(0),
    genres: text("genres").array().notNull().default([]),
    lossless: boolean("lossless").notNull().default(false),
    label: text("label"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("albums_title_idx").on(t.title),
    index("albums_artist_idx").on(t.artistId),
  ],
);

export type LyricLine = { start: number; text: string };

export const tracks = pgTable(
  "tracks",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    artistId: integer("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    albumId: integer("album_id").references(() => albums.id, {
      onDelete: "set null",
    }),
    durationSec: real("duration_sec").notNull().default(0),
    /** Playback source: 'youtube' (full-length via IFrame API) | 'deezer' | 'itunes' (30s previews) | 'internal' */
    source: text("source").notNull().default("internal"),
    /** External id: YouTube videoId, Deezer track id, or iTunes track id */
    sourceId: text("source_id"),
    /** Direct audio URL for preview sources (proxied via /api/tracks/[id]/stream) */
    sourceUrl: text("source_url"),
    /** 30s preview URL for deezer/itunes sources */
    previewUrl: text("preview_url"),
    /** Compressed waveform peaks (min/max normalized to [-1, 1]) for scrub rendering */
    waveform: jsonb("waveform").$type<number[]>().notNull().default([]),
    /** Integrated loudness (EBU R128 style LUFS) used for volume normalization */
    loudnessLufs: real("loudness_lufs").notNull().default(-14),
    bpm: real("bpm").notNull().default(120),
    key: text("key"),
    energy: real("energy").notNull().default(0.5), // 0..1
    valence: real("valence").notNull().default(0.5), // 0..1 (mood)
    danceability: real("danceability").notNull().default(0.5),
    acousticness: real("acousticness").notNull().default(0.5),
    explicit: boolean("explicit").notNull().default(false),
    genre: text("genre").notNull().default("electronic"),
    language: text("language").notNull().default("en"),
    year: integer("year").notNull().default(2024),
    isrc: text("isrc"),
    codec: text("codec").notNull().default("mp3"),
    bitrate: integer("bitrate").notNull().default(320),
    lossless: boolean("lossless").notNull().default(false),
    playCount: integer("play_count").notNull().default(0),
    /** Time-synced lyrics: [{ start: seconds, text }] */
    lyrics: jsonb("lyrics").$type<LyricLine[]>().notNull().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("tracks_title_idx").on(t.title),
    index("tracks_artist_idx").on(t.artistId),
    index("tracks_album_idx").on(t.albumId),
    index("tracks_genre_idx").on(t.genre),
    index("tracks_playcount_idx").on(t.playCount),
    uniqueIndex("tracks_source_unique_idx").on(t.source, t.sourceId),
  ],
);

export const playlists = pgTable(
  "playlists",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    coverUrl: text("cover_url"),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    collaborative: boolean("collaborative").notNull().default(false),
    /** Smart-playlist rules: { genre?, minBpm?, maxBpm?, minYear?, mood? } */
    smartRules: jsonb("smart_rules").$type<Record<string, unknown> | null>(),
    isPublic: boolean("is_public").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("playlists_owner_idx").on(t.ownerId)],
);

export const playlistTracks = pgTable(
  "playlist_tracks",
  {
    id: serial("id").primaryKey(),
    playlistId: integer("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    trackId: integer("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("playlist_tracks_unique_idx").on(t.playlistId, t.trackId),
    index("playlist_tracks_playlist_idx").on(t.playlistId, t.position),
  ],
);

export const userTrackLikes = pgTable(
  "user_track_likes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trackId: integer("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("user_track_likes_unique_idx").on(t.userId, t.trackId)],
);

export const artistFollows = pgTable(
  "artist_follows",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    artistId: integer("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("artist_follows_unique_idx").on(t.userId, t.artistId)],
);

export const albumLikes = pgTable(
  "album_likes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    albumId: integer("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("album_likes_unique_idx").on(t.userId, t.albumId)],
);

/** Reel interactions feed the recommendation algorithm. */
export const reelEvents = pgTable(
  "reel_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trackId: integer("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    /** view | like | skip | share | download | complete */
    kind: text("kind").notNull().default("view"),
    watchedSec: real("watched_sec").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("reel_events_user_idx").on(t.userId, t.createdAt), index("reel_events_track_idx").on(t.trackId)],
);

export const listeningHistory = pgTable(
  "listening_history",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trackId: integer("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    playedAt: timestamp("played_at").defaultNow().notNull(),
    durationListenedSec: real("duration_listened_sec").notNull().default(0),
    device: text("device").notNull().default("web"),
  },
  (t) => [
    index("history_user_idx").on(t.userId, t.playedAt),
    index("history_track_idx").on(t.trackId),
  ],
);

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("info"),
  title: text("title").notNull(),
  body: text("body"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/*  Type exports for the app layer                                     */
/* ------------------------------------------------------------------ */

export type UserRow = typeof users.$inferSelect;
export type ArtistRow = typeof artists.$inferSelect;
export type AlbumRow = typeof albums.$inferSelect;
export type TrackRow = typeof tracks.$inferSelect;
export type PlaylistRow = typeof playlists.$inferSelect;
export type PlaylistTrackRow = typeof playlistTracks.$inferSelect;
export type ListeningHistoryRow = typeof listeningHistory.$inferSelect;
export type ArtistFollowRow = typeof artistFollows.$inferSelect;
export type AlbumLikeRow = typeof albumLikes.$inferSelect;
