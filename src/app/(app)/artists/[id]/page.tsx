import { notFound } from "next/navigation";
import { getDemoUser } from "@/lib/server/queries";
import { buildArtistProfile } from "@/lib/server/artist-profile";
import { ArtistProfile } from "@/components/artists/ArtistProfile";
import { YouTubeChannelProfile } from "@/components/artists/YouTubeChannelProfile";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export default async function ArtistPage({ params }: Ctx) {
  const { id } = await params;

  // A real YouTube channel can be opened by its channel id: `/artists/yt:UC…`.
  // That route shows the official channel (Data API) plus subscribe, instead of
  // pretending the channel is a catalog artist row.
  if (id.startsWith("yt:")) {
    const channelId = id.slice(3);
    if (!/^UC[\w-]{20,}$/.test(channelId)) notFound();
    return <YouTubeChannelProfile channelId={channelId} />;
  }

  const artistId = Number(id);
  if (!Number.isInteger(artistId)) notFound();
  const user = await getDemoUser();
  const profile = await buildArtistProfile(artistId, user.id);
  if (!profile) notFound();
  return <ArtistProfile artistId={artistId} initial={profile} />;
}
