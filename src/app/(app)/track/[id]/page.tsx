import { notFound } from "next/navigation";
import { getDemoUser, getTrackDTO } from "@/lib/server/queries";
import { TrackLanding } from "@/components/tracks/TrackLanding";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Ctx): Promise<Metadata> {
  const { id } = await params;
  const trackId = Number(id);
  if (!Number.isInteger(trackId)) return {};
  const user = await getDemoUser();
  const track = await getTrackDTO(trackId, user.id);
  if (!track) return {};
  return {
    title: `${track.title} — ${track.artistName}`,
    description: `Listen to ${track.title} by ${track.artistName} on DON MUSE`,
    openGraph: { title: `${track.title} — ${track.artistName}`, images: track.coverUrl ? [track.coverUrl] : [], type: "music.song" },
  };
}

// Deep link: /track/:id opens the app on this song and starts playback.
export default async function TrackPage({ params }: Ctx) {
  const { id } = await params;
  const trackId = Number(id);
  if (!Number.isInteger(trackId)) notFound();
  const user = await getDemoUser();
  const track = await getTrackDTO(trackId, user.id);
  if (!track) notFound();
  return <TrackLanding track={track} />;
}
