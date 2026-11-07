"use client";

// Applies the persisted accent color as --app-accent on the document root.
import { useEffect } from "react";
import { ACCENT_HEX, useSettingsStore } from "@/stores/settings-store";

export function AccentInit() {
  const accent = useSettingsStore((s) => s.accent);
  useEffect(() => {
    document.documentElement.style.setProperty("--app-accent", ACCENT_HEX[accent]);
  }, [accent]);
  return null;
}
