import type { TrackDTO } from "@/lib/types";

/** A queue/player identity must distinguish different providers and source items.
 * Numeric track IDs alone are not unique across Quran reciters and external sources.
 */
export function getTrackIdentity(
  track: Pick<TrackDTO, "id" | "source" | "sourceId"> | null | undefined,
): string | null {
  if (!track) return null;
  return `${track.source}:${track.sourceId ?? ""}:${track.id}`;
}
