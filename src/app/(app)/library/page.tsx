import { followedArtists, getDemoUser, getStats, likedAlbums, likedTracks, listPlaylists, recentlyPlayed } from "@/lib/server/queries";
import { LibraryView } from "@/components/library/LibraryView";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const user = await getDemoUser();
  const [liked, playlistsData, recent, stats, follows, albumsLiked] = await Promise.all([
    likedTracks(user.id),
    listPlaylists(user.id),
    recentlyPlayed(user.id, 20),
    getStats(user.id),
    followedArtists(user.id),
    likedAlbums(user.id),
  ]);
  return <LibraryView liked={liked} playlists={playlistsData} recent={recent} stats={stats} follows={follows} albums={albumsLiked} />;
}
