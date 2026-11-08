// ============================================================================
//  DEPRECATED PATH — kept only so older imports keep working.
//  All YouTube Music data now comes from the OFFICIAL Data API v3
//  (src/lib/server/youtube-data.ts). InnerTube/youtubei.js was removed: it is an
//  undocumented private API and using it is not permitted.
// ============================================================================
export {
  searchYouTubeMusic,
  youtubeTrending,
  searchYouTubeArtists,
  searchYouTubeAlbums,
  ytThumbnail,
  ytDataAvailable,
} from "./youtube-data";

export type { YTArtistHit } from "./youtube-data";
