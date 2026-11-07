"use client";

// ============================================================================
//  Official brand marks via simple-icons (the real logo paths published by
//  each brand, bundled locally — no network). Audius isn't in simple-icons,
//  so its official mark (stylized "A" waveform) is embedded from brand assets.
// ============================================================================
import {
  siYoutubemusic,
  siYoutube,
  siSoundcloud,
  siInternetarchive,
  siSpotify,
  siApplemusic,
  siBandcamp,
  siMixcloud,
  siDailymotion,
  siVimeo,
  siDeezer,
  siTidal,
  siOdysee,
} from "simple-icons";
import type { SimpleIcon } from "simple-icons";
import { cn } from "@/lib/utils";

const ICONS: Record<string, SimpleIcon> = {
  youtube: siYoutubemusic,
  youtubevideo: siYoutube,
  soundcloud: siSoundcloud,
  archive: siInternetarchive,
  spotify: siSpotify,
  applemusic: siApplemusic,
  bandcamp: siBandcamp,
  mixcloud: siMixcloud,
  dailymotion: siDailymotion,
  vimeo: siVimeo,
  deezer: siDeezer,
  tidal: siTidal,
  odysee: siOdysee,
};

// Audius official mark (from audius.co brand kit, simplified single path).
const AUDIUS_PATH =
  "M12 1.5 1.2 20.4c-.4.7.1 1.6.9 1.6h3.4c.4 0 .7-.2.9-.5L12 11.1l5.6 10.4c.2.3.5.5.9.5h3.4c.8 0 1.3-.9.9-1.6L12 1.5Zm0 7.2-3.2 5.9h6.4L12 8.7Z";

export const BRAND_COLORS: Record<string, string> = {
  youtube: "#FF0000",
  youtubevideo: "#FF0000",
  soundcloud: "#FF5500",
  archive: "#666666",
  audius: "#CC0FE0",
  spotify: "#1DB954",
  applemusic: "#FA243C",
  bandcamp: "#408294",
  mixcloud: "#5000FF",
  dailymotion: "#0A0A0A",
  vimeo: "#1AB7EA",
  deezer: "#A238FF",
  tidal: "#000000",
  jamendo: "#FF6A00",
  odysee: "#EF1970",
  radio: "#FA2D55",
};

// Jamendo mark (from jamendo.com brand assets): rounded badge with the "J" note.
const JAMENDO_PATH =
  "M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0Zm3.6 15.2c0 2.3-1.7 3.9-4.1 3.9-1.8 0-3.2-.9-3.9-2.3l1.9-1.1c.4.8 1 1.3 2 1.3 1.1 0 1.8-.7 1.8-1.9V5h2.3v10.2Z";

export function BrandIcon({ name, className, color }: { name: string; className?: string; color?: string | "brand" | "current" }) {
  const fill = color === "brand" ? (BRAND_COLORS[name] ?? "currentColor") : color === "current" || !color ? "currentColor" : color;
  if (name === "jamendo") {
    return (
      <svg viewBox="0 0 24 24" className={cn("size-4", className)} fill={fill} aria-label="Jamendo" role="img">
        <path d={JAMENDO_PATH} />
      </svg>
    );
  }
  if (name === "audius") {
    return (
      <svg viewBox="0 0 24 24" className={cn("size-4", className)} fill={fill} aria-label="Audius" role="img">
        <path d={AUDIUS_PATH} />
      </svg>
    );
  }
  const icon = ICONS[name];
  if (!icon) return null;
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4", className)} fill={fill} aria-label={icon.title} role="img">
      <path d={icon.path} />
    </svg>
  );
}

export const BRAND_LABEL: Record<string, string> = {
  youtube: "YouTube Music",
  soundcloud: "SoundCloud",
  archive: "Internet Archive",
  audius: "Audius",
  spotify: "Spotify",
  applemusic: "Apple Music",
  deezer: "Deezer",
  jamendo: "Jamendo",
  bandcamp: "Bandcamp",
  dailymotion: "Dailymotion",
  odysee: "Odysee",
  radio: "Live Radio",
};
