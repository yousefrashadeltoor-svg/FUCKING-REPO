"use client";

// ============================================================================
//  NetworkWatcher — resilient connection handling
//  • starts offline → the app jumps straight to “موسيقاي” (device library)
//  • connection returns → elegant “back online” pill + instant refetch of the
//    home feed / search so nothing has to be reloaded by hand
//  • connection drops → the UI keeps running from cache, no freeze
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Wifi, WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useSettingsStore } from "@/stores/settings-store";
import { useNetworkStore } from "@/stores/network-store";

export function NetworkWatcher() {
  const router = useRouter();
  const pathname = usePathname();
  const autoOfflineLibrary = useSettingsStore((s) => s.autoOfflineLibrary);
  const setOnline = useNetworkStore((s) => s.setOnline);
  const [online, setLocalOnline] = useState(true);
  const [banner, setBanner] = useState<"offline" | "online" | null>(null);
  const firstRun = useRef(true);
  const wasOffline = useRef(false);

  /* Register the service worker once — it makes the shell open instantly and
     keeps working with no connection. The Android host serves its own assets. */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (document.documentElement.dataset.host === "android") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const apply = (isOnline: boolean) => {
      setLocalOnline(isOnline);
      setOnline(isOnline);
      if (!isOnline) {
        wasOffline.current = true;
        setBanner("offline");
      } else if (wasOffline.current) {
        setBanner("online");
        window.setTimeout(() => setBanner(null), 2600);
      }
    };

    apply(navigator.onLine);

    // Cold start without internet → land on the device library.
    if (!navigator.onLine && autoOfflineLibrary && firstRun.current) {
      firstRun.current = false;
      const localFirst = pathname.startsWith("/my-music") || pathname.startsWith("/library") || pathname.startsWith("/downloads");
      if (!localFirst) router.replace("/my-music?offline=1");
    }

    const on = () => {
      apply(true);
      // Refresh server data that may have failed while offline.
      router.refresh();
    };
    const off = () => apply(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AnimatePresence>
      {banner && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          className="pointer-events-none fixed inset-x-0 top-3 z-[95] flex justify-center px-3"
        >
          <div
            className={[
              "pointer-events-auto flex items-center gap-2.5 rounded-full border px-4 py-2 text-[12.5px] font-semibold shadow-2xl backdrop-blur-xl",
              online
                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                : "border-amber-400/40 bg-amber-500/15 text-amber-200",
            ].join(" ")}
          >
            {online ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
            {online ? "عاد الاتصال بالإنترنت · Back online" : "لا يوجد اتصال · Offline — موسيقاي تعمل"}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
