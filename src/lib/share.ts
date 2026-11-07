"use client";

// ============================================================================
//  Deep links + sharing. Every entity in DON MUSE has a canonical URL that
//  opens the app directly on it:
//    /track/:id          → opens the player on that song (and starts it)
//    /artists/:id        → artist profile
//    /albums/:id         → album
//    /playlists/:id      → playlist
//    /reels?track=:id    → reels feed starting at that song
//    /radio?station=:id  → radio tuned to that station
//    /tv?channel=:id     → TV on that channel
//  shareX() uses the Web Share API when available, otherwise copies the link.
// ============================================================================
import type { TrackDTO } from "@/lib/types";

export function appOrigin(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

export const links = {
  track: (id: number) => `${appOrigin()}/track/${id}`,
  artist: (id: number) => `${appOrigin()}/artists/${id}`,
  album: (id: number) => `${appOrigin()}/albums/${id}`,
  playlist: (id: number) => `${appOrigin()}/playlists/${id}`,
  reel: (trackId: number) => `${appOrigin()}/reels?track=${trackId}`,
  station: (uuid: string) => `${appOrigin()}/radio?station=${encodeURIComponent(uuid)}`,
  channel: (id: string) => `${appOrigin()}/tv?channel=${encodeURIComponent(id)}`,
};

export type ShareResult = "shared" | "copied" | "failed";

export async function shareUrl(url: string, title: string, text?: string): Promise<ShareResult> {
  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title, text, url });
      return "shared";
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return "failed";
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    // last resort: prompt
    if (typeof window !== "undefined") window.prompt("Copy link", url);
    return "copied";
  }
}

export function shareTrack(track: TrackDTO, context: "player" | "reels" | "list" = "player"): Promise<ShareResult> {
  const url = context === "reels" ? links.reel(track.id) : links.track(track.id);
  return shareUrl(url, `${track.title} — ${track.artistName}`, `${track.title} · ${track.artistName} · DON MUSE`);
}
