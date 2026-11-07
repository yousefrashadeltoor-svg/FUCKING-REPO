import Link from "next/link";
import { notFound } from "next/navigation";
import { getDemoUser, getPlaylistDetail } from "@/lib/server/queries";
import { TrackList } from "@/components/tracks/TrackList";
import { PlaylistHeader } from "@/components/playlists/PlaylistHeader";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export default async function PlaylistPage({ params }: Ctx) {
  const { id } = await params;
  const pid = Number(id);
  if (!Number.isInteger(pid)) notFound();
  const user = await getDemoUser();
  const detail = await getPlaylistDetail(pid, user.id);
  if (!detail) notFound();

  return (
    <div className="p-4 md:p-6">
      <PlaylistHeader playlist={detail} />
      <div className="mt-6">
        <TrackList
          tracks={detail.tracks}
          onRemove={undefined}
        />
      </div>
      <p className="mt-6 px-1 text-xs text-white/30">
        <Link href="/library" className="hover:text-white/60 hover:underline">{detail.ownerName}</Link>
        {detail.collaborative && " · collaborative"}
      </p>
    </div>
  );
}
