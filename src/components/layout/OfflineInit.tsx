"use client";

// Registers the service worker (local-first UI) and shows a slim offline
// banner. Streaming / downloads are the only online features.
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useT } from "@/lib/i18n";

export function OfflineInit() {
  const t = useT();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    setOffline(!navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-[90] flex justify-center px-3">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-amber/30 bg-black/80 px-4 py-1.5 text-xs font-semibold text-amber shadow-lg backdrop-blur">
        <WifiOff className="size-3.5" /> {t("offlineReady")}
      </div>
    </div>
  );
}
