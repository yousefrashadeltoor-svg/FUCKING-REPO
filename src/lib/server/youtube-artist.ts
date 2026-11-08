// ============================================================================
//  Types for the official YouTube artist profile.
//  ---------------------------------------------------------------------------
//  The InnerTube (youtubei.js) implementation that used to live here has been
//  REMOVED: it called YouTube's undocumented private API. Data now comes from the
//  official Data API v3 (src/lib/server/youtube-data.ts), which does not expose
//  "monthly audience", "featured on" or "fans also like" — those fields stay
//  empty/null rather than being fabricated.
// ============================================================================

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
