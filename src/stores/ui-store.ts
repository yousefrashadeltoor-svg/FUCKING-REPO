// DON MUSE — ephemeral UI state (not persisted).
import { create } from "zustand";

export type RightPanelTab = "lyrics" | "queue" | "viz" | "info";

export interface UIState {
  rightPanelOpen: boolean;
  rightPanelTab: RightPanelTab;
  sidebarCollapsed: boolean;
  searchOpen: boolean;
  nowPlayingOpen: boolean;
  shortcutsOpen: boolean;
  /** mobile navigation drawer */
  navOpen: boolean;
  /** track info sheet (rendered ABOVE the now-playing layer) */
  infoSheetOpen: boolean;
  setRightPanel: (open: boolean, tab?: RightPanelTab) => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  toggleRightPanel: (tab?: RightPanelTab) => void;
  setSidebarCollapsed: (v: boolean) => void;
  setSearchOpen: (v: boolean) => void;
  setNowPlaying: (v: boolean) => void;
  toggleNowPlaying: () => void;
  setShortcuts: (v: boolean) => void;
  toggleShortcuts: () => void;
  setNavOpen: (v: boolean) => void;
  setInfoSheet: (v: boolean) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  rightPanelOpen: false,
  rightPanelTab: "lyrics",
  sidebarCollapsed: false,
  searchOpen: false,
  nowPlayingOpen: false,
  shortcutsOpen: false,
  navOpen: false,
  infoSheetOpen: false,
  setRightPanel: (rightPanelOpen, tab) =>
    set((s) => ({ rightPanelOpen, rightPanelTab: tab ?? s.rightPanelTab })),
  setRightPanelTab: (rightPanelTab) => set({ rightPanelTab, rightPanelOpen: true }),
  toggleRightPanel: (tab) =>
    set((s) => ({
      rightPanelOpen: tab ? true : !s.rightPanelOpen,
      rightPanelTab: tab ?? s.rightPanelTab,
    })),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setNowPlaying: (nowPlayingOpen) => set({ nowPlayingOpen }),
  toggleNowPlaying: () => set((s) => ({ nowPlayingOpen: !s.nowPlayingOpen })),
  setShortcuts: (shortcutsOpen) => set({ shortcutsOpen }),
  toggleShortcuts: () => set((s) => ({ shortcutsOpen: !s.shortcutsOpen })),
  setNavOpen: (navOpen) => set({ navOpen }),
  setInfoSheet: (infoSheetOpen) => set({ infoSheetOpen }),
}));
