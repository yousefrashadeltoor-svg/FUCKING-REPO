import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** 4:22 -> "4:22", 65 -> "1:05" */
export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor(totalSeconds / 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `item-${Date.now()}`
  );
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export const EQ_BAND_FREQUENCIES = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];

export const EQ_PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "Bass Boost": [8, 7, 5, 2, 0, 0, 0, 0, 0, 0],
  "Treble Boost": [0, 0, 0, 0, 0, 2, 4, 6, 7, 8],
  Vocal: [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1],
  Rock: [5, 4, 3, 1, -1, -1, 2, 4, 5, 5],
  Pop: [-1, 2, 4, 4, 3, 1, 0, -1, -1, -2],
  Electronic: [6, 5, 3, 0, 0, 1, 3, 4, 5, 6],
  Acoustic: [4, 3, 2, 1, 2, 3, 3, 2, 1, 0],
  "Night Mode": [3, 2, 1, 0, 0, 0, -1, -1, 0, 1],
  Jazz: [3, 2, 1, 0, -1, 0, 1, 2, 3, 4],
  Classical: [4, 3, 2, 0, 0, 0, 1, 2, 3, 4],
};
