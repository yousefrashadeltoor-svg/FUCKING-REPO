import Link from "next/link";
import { notFound } from "next/navigation";
import { getAlbumDetail, getDemoUser } from "@/lib/server/queries";
import { searchYouTubeMusic } from "@/lib/server/youtube";
import { upsertTracks } from "@/lib/server/catalog";
import { TrackList } from "@/components/tracks/TrackList";
import { AlbumHeader } from "@/components/albums/AlbumHeader";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export default async function AlbumPage({ params }: Ctx) {
  const { id } = await params;
  const albumId = Number(id);
  if (!Number.isInteger(albumId)) notFound();
  const user = await getDemoUser();
  const detail = await getAlbumDetail(albumId, user.id);
  if (!detail) notFound();
  if (detail.tracks.length < 3) {
    try {
      const more = await upsertTracks(await searchYouTubeMusic(`${detail.album.title} ${detail.album.artistName}`, 14), user.id);
      const seen = new Set(detail.tracks.map((t) => t.id));
      detail.tracks = [...detail.tracks, ...more.filter((t) => !seen.has(t.id))];
    } catch {
      /* offline */
    }
  }

  return (
    <div className="p-4 md:p-6">
      <AlbumHeader album={detail.album} artist={detail.artist} tracks={detail.tracks} />
      <div className="mt-6">
        <TrackList tracks={detail.tracks} showAlbum={false} />
      </div>
      {detail.artist && (
        <p className="mt-6 px-1 text-xs text-white/30">
          <Link href={`/artists/${detail.artist.id}`} className="font-semibold text-white/60 hover:underline">{detail.artist.name} →</Link>
        </p>
      )}
    </div>
  );
}
