// DON MUSE — user preferences (persisted, platform-aware).
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { platformStorage } from "@/lib/storage";

export type Quality = "auto" | "low" | "high" | "lossless";
export type Accent = "emerald" | "rose" | "violet" | "cyan" | "amber" | "gold";
export type Density = "compact" | "comfortable" | "spacious";
export type Theme =
  | "midnight"
  | "obsidian"
  | "royal"
  | "emerald"
  | "sand"
  | "daylight"
  | "rosegold"
  | "ocean";

export interface SettingsState {
  quality: Quality;
  autoplay: boolean;
  loudnessNormalization: boolean;
  accent: Accent;
  density: Density;
  theme: Theme;
  language: string;
  lyricsAutoScroll: boolean;
  /** subtle motion / heavy effects */
  reducedEffects: boolean;
  /** 120/240 target fps motion profile */
  highRefresh: boolean;
  hapticsOnTap: boolean;
  /** auto-open “موسيقاي” when the app starts offline */
  autoOfflineLibrary: boolean;
  /** show background-playing notifications on Android */
  backgroundPlayback: boolean;
  /** prefer the lowest bitrate / skip video on metered connections */
  dataSaver: boolean;
  wallpaper: "none" | "midnight-aurora" | "golden-dunes" | "ocean-vinyl" | "custom";
  wallpaperOpacity: number;
  customWallpaper: string;
  largeArtwork: boolean;
  aiEndpoint: string;
  aiModel: string;
  setWallpaper: (v: SettingsState["wallpaper"]) => void;
  setWallpaperOpacity: (v: number) => void;
  setCustomWallpaper: (v: string) => void;
  setLargeArtwork: (v: boolean) => void;
  setAiEndpoint: (v: string) => void;
  setAiModel: (v: string) => void;
  setQuality: (q: Quality) => void;
  setAutoplay: (v: boolean) => void;
  setLoudnessNormalization: (v: boolean) => void;
  setAccent: (a: Accent) => void;
  setDensity: (d: Density) => void;
  setTheme: (t: Theme) => void;
  setLanguage: (l: string) => void;
  setLyricsAutoScroll: (v: boolean) => void;
  setReducedEffects: (v: boolean) => void;
  setHighRefresh: (v: boolean) => void;
  setHapticsOnTap: (v: boolean) => void;
  setAutoOfflineLibrary: (v: boolean) => void;
  setBackgroundPlayback: (v: boolean) => void;
  setDataSaver: (v: boolean) => void;
}

export const ACCENT_HEX: Record<Accent, string> = {
  emerald: "#1DB954",
  rose: "#FA2D55",
  violet: "#8B5CF6",
  cyan: "#00D4FF",
  amber: "#FFB800",
  gold: "#D4AF37",
};

export const THEMES: Record<
  Theme,
  { label: string; labelAr: string; bg: string; panel: string; text: string; muted: string; border: string; dark: boolean }
> = {
  midnight: {
    label: "Midnight",
    labelAr: "منتصف الليل",
    bg: "#05060a",
    panel: "rgba(255,255,255,0.045)",
    text: "#f6f7fb",
    muted: "rgba(246,247,251,0.62)",
    border: "rgba(255,255,255,0.10)",
    dark: true,
  },
  obsidian: {
    label: "Obsidian",
    labelAr: "أوبسيديان",
    bg: "#000000",
    panel: "rgba(255,255,255,0.05)",
    text: "#ffffff",
    muted: "rgba(255,255,255,0.66)",
    border: "rgba(255,255,255,0.12)",
    dark: true,
  },
  royal: {
    label: "Royal Gold",
    labelAr: "ملكي ذهبي",
    bg: "#0a0714",
    panel: "rgba(212,175,55,0.07)",
    text: "#fbf6e6",
    muted: "rgba(251,246,230,0.66)",
    border: "rgba(212,175,55,0.24)",
    dark: true,
  },
  emerald: {
    label: "Emerald Night",
    labelAr: "زمردي",
    bg: "#05100c",
    panel: "rgba(29,185,84,0.07)",
    text: "#eafaf0",
    muted: "rgba(234,250,240,0.64)",
    border: "rgba(29,185,84,0.22)",
    dark: true,
  },
  sand: {
    label: "Desert Sand",
    labelAr: "رملي",
    bg: "#14100a",
    panel: "rgba(255,214,153,0.07)",
    text: "#fdf3e3",
    muted: "rgba(253,243,227,0.66)",
    border: "rgba(255,214,153,0.20)",
    dark: true,
  },
  rosegold: {
    label: "Rose Gold",
    labelAr: "ذهبي وردي",
    bg: "#120a0d",
    panel: "rgba(255,170,190,0.07)",
    text: "#fff2f5",
    muted: "rgba(255,242,245,0.66)",
    border: "rgba(255,170,190,0.22)",
    dark: true,
  },
  ocean: {
    label: "Deep Ocean",
    labelAr: "محيطي",
    bg: "#04101a",
    panel: "rgba(0,212,255,0.07)",
    text: "#eaf7ff",
    muted: "rgba(234,247,255,0.66)",
    border: "rgba(0,212,255,0.22)",
    dark: true,
  },
  daylight: {
    label: "Daylight",
    labelAr: "نهاري",
    bg: "#f4f5f8",
    panel: "rgba(12,14,20,0.05)",
    text: "#101218",
    muted: "rgba(16,18,24,0.62)",
    border: "rgba(12,14,20,0.10)",
    dark: false,
  },
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      quality: "auto",
      autoplay: true,
      loudnessNormalization: true,
      accent: "emerald",
      density: "comfortable",
      theme: "midnight",
      language: "ar",
      lyricsAutoScroll: true,
      reducedEffects: false,
      highRefresh: true,
      hapticsOnTap: true,
      autoOfflineLibrary: true,
      backgroundPlayback: true,
      dataSaver: false,
      wallpaper: "midnight-aurora",
      wallpaperOpacity: 0.38,
      customWallpaper: "",
      largeArtwork: true,
      aiEndpoint: "https://api.openai.com/v1/chat/completions",
      aiModel: "gpt-4o-mini",
      setWallpaper: (wallpaper) => set({ wallpaper }),
      setWallpaperOpacity: (v) => set({ wallpaperOpacity: Math.max(0.08, Math.min(0.7, v)) }),
      setCustomWallpaper: (customWallpaper) => set({ customWallpaper }),
      setLargeArtwork: (largeArtwork) => set({ largeArtwork }),
      setAiEndpoint: (aiEndpoint) => set({ aiEndpoint }),
      setAiModel: (aiModel) => set({ aiModel }),
      setQuality: (quality) => set({ quality }),
      setAutoplay: (autoplay) => set({ autoplay }),
      setLoudnessNormalization: (loudnessNormalization) => set({ loudnessNormalization }),
      setAccent: (accent) => set({ accent }),
      setDensity: (density) => set({ density }),
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setLyricsAutoScroll: (lyricsAutoScroll) => set({ lyricsAutoScroll }),
      setReducedEffects: (reducedEffects) => set({ reducedEffects }),
      setHighRefresh: (highRefresh) => set({ highRefresh }),
      setHapticsOnTap: (hapticsOnTap) => set({ hapticsOnTap }),
      setAutoOfflineLibrary: (autoOfflineLibrary) => set({ autoOfflineLibrary }),
      setBackgroundPlayback: (backgroundPlayback) => set({ backgroundPlayback }),
      setDataSaver: (dataSaver) => set({ dataSaver }),
    }),
    {
      name: "aura-settings",
      version: 2,
      storage: createJSONStorage(() => platformStorage),
    },
  ),
);
