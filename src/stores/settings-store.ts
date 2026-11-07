// DON MUSE — user preferences (persisted).
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Quality = "auto" | "low" | "high" | "lossless";
export type Accent = "emerald" | "rose" | "violet" | "cyan" | "amber" | "gold";
export type Density = "compact" | "comfortable" | "spacious";

export interface SettingsState {
  quality: Quality;
  autoplay: boolean;
  loudnessNormalization: boolean;
  accent: Accent;
  density: Density;
  language: string;
  lyricsAutoScroll: boolean;
  setQuality: (q: Quality) => void;
  setAutoplay: (v: boolean) => void;
  setLoudnessNormalization: (v: boolean) => void;
  setAccent: (a: Accent) => void;
  setDensity: (d: Density) => void;
  setLanguage: (l: string) => void;
  setLyricsAutoScroll: (v: boolean) => void;
}

export const ACCENT_HEX: Record<Accent, string> = {
  emerald: "#1DB954",
  rose: "#FA2D55",
  violet: "#8B5CF6",
  cyan: "#00D4FF",
  amber: "#FFB800",
  gold: "#FFD700",
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      quality: "auto",
      autoplay: true,
      loudnessNormalization: true,
      accent: "emerald",
      density: "comfortable",
      language: "en",
      lyricsAutoScroll: true,
      setQuality: (quality) => set({ quality }),
      setAutoplay: (autoplay) => set({ autoplay }),
      setLoudnessNormalization: (loudnessNormalization) => set({ loudnessNormalization }),
      setAccent: (accent) => set({ accent }),
      setDensity: (density) => set({ density }),
      setLanguage: (language) => set({ language }),
      setLyricsAutoScroll: (lyricsAutoScroll) => set({ lyricsAutoScroll }),
    }),
    { name: "aura-settings", version: 1 },
  ),
);
