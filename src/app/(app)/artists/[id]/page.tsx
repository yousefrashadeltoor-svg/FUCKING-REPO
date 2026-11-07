import { notFound } from "next/navigation";
import { getDemoUser } from "@/lib/server/queries";
import { buildArtistProfile } from "@/lib/server/artist-profile";
import { ArtistProfile } from "@/components/artists/ArtistProfile";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export default async function ArtistPage({ params }: Ctx) {
  const { id } = await params;
  const artistId = Number(id);
  if (!Number.isInteger(artistId)) notFound();
  const user = await getDemoUser();
  const profile = await buildArtistProfile(artistId, user.id);
  if (!profile) notFound();
  return <ArtistProfile artistId={artistId} initial={profile} />;
}
