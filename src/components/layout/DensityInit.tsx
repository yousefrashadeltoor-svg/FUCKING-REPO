
// Applies the persisted layout density as data-density on <html>.
import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settings-store";

export function DensityInit() {
  const density = useSettingsStore((s) => s.density);
  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);
  return null;
}
