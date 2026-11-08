// ============================================================================
//  API base resolution
//  ---------------------------------------------------------------------------
//  The normal deployment serves the UI and /api from the same origin, so every
//  URL stays relative. The static GitHub Pages build has no server, so it is
//  built with NEXT_PUBLIC_API_BASE pointing at the live deployment; that base is
//  injected as window.__DM_API_BASE__ and applied here (and to plain fetch() by
//  the export runtime). If no base is configured we return the relative URL and
//  the calling UI shows the honest "server required" state.
// ============================================================================

declare global {
  interface Window {
    __DM_API_BASE__?: string;
    __DM_STATIC__?: boolean;
    /** Set by the APK's offline runtime (scripts/offline-runtime.js). */
    __DM_OFFLINE__?: boolean;
    __DM_LAST_ROUTE__?: string;
  }
}

const fromEnv = process.env.NEXT_PUBLIC_API_BASE ?? "";

export function apiBase(): string {
  if (typeof window !== "undefined" && typeof window.__DM_API_BASE__ === "string" && window.__DM_API_BASE__) {
    return window.__DM_API_BASE__.replace(/\/+$/, "");
  }
  return fromEnv.replace(/\/+$/, "");
}

/** True when the UI is running as a static bundle without any API endpoint. */
export function isApiOnlyStatic(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.__DM_STATIC__ && !apiBase();
}

/** Resolve an app-relative URL (usually `/api/...`) against the API base. */
export function apiUrl(url: string): string {
  const base = apiBase();
  if (!base) return url;
  if (!url.startsWith("/")) return url;
  if (url.startsWith("//")) return url;
  return base + url;
}
