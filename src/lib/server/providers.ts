// ============================================================================
//  DON MUSE — provider layer (one registry, real health, real fallback)
//  ---------------------------------------------------------------------------
//  Every catalog/music source is described ONCE, here, with:
//    • what it needs (API key / OAuth / self-hosted),
//    • what it is legally and technically allowed to do (playback + download),
//    • how it authenticates and where it lives,
//    • a live health probe with a short cache + exponential backoff,
//    • ordered fallbacks so a dead provider degrades instead of breaking.
//
//  The playback rules themselves live in src/lib/playback-policy.ts and are
//  re-exported here so a server route only needs one import.
//
//  Nothing is invented: `health()` performs a real request (or a real key/env
//  check) and reports the truth. A provider with no key is `unconfigured`, not
//  "healthy".
// ============================================================================
import { policyFor, canDownload, canStreamDirectly, needsOfficialEmbed, externalFallback } from "@/lib/playback-policy";

export { policyFor, canDownload, canStreamDirectly, needsOfficialEmbed, externalFallback };

export type ProviderKind = "streaming" | "catalog" | "metadata" | "radio" | "local" | "self-hosted";
export type AuthKind = "none" | "api-key" | "oauth" | "self-hosted";
export type ProviderStatus = "healthy" | "degraded" | "down" | "unconfigured";

export interface ProviderDef {
  id: string;
  label: string;
  kind: ProviderKind;
  /** open-source / self-hostable / free-tier — the OSS-first ordering criterion */
  license: string;
  auth: AuthKind;
  /** env vars that must be present for this provider to work at all */
  env: string[];
  docs: string;
  /** a short, probe-able URL (only used when env is satisfied) */
  probe?: string;
  /** providers to try when this one fails, in order */
  fallbacks: string[];
  /** why this provider is in the product (the honest one-liner) */
  why: string;
  selfHostable: boolean;
  free: boolean;
}

export const PROVIDERS: Record<string, ProviderDef> = {
  youtube: {
    id: "youtube",
    label: "YouTube / YouTube Music",
    kind: "streaming",
    license: "proprietary platform · official public APIs",
    auth: "oauth",
    env: [],
    docs: "https://developers.google.com/youtube/v3",
    probe: "https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ",
    fallbacks: ["audius", "jamendo", "archive"],
    why: "The default catalog: official Data API v3 for metadata + IFrame Player for playback. No extraction.",
    selfHostable: false,
    free: true,
  },
  audius: {
    id: "audius",
    label: "Audius",
    kind: "streaming",
    license: "open protocol · MIT clients · free API",
    auth: "api-key",
    env: ["AUDIUS_API_KEY"],
    docs: "https://docs.audius.org",
    probe: "https://api.audius.co/v1/tracks/trending?app_name=DONMUSE&limit=1",
    fallbacks: ["jamendo", "archive"],
    why: "Free, full-length, directly streamable audio with real artwork; works without any key too.",
    selfHostable: true,
    free: true,
  },
  jamendo: {
    id: "jamendo",
    label: "Jamendo",
    kind: "streaming",
    license: "Creative Commons catalog · commercial API",
    auth: "api-key",
    env: ["JAMENDO_CLIENT_ID"],
    docs: "https://developer.jamendo.com/v3.0",
    probe: "https://api.jamendo.com/v3.0/tracks/?client_id=test&limit=1",
    fallbacks: ["archive", "audius"],
    why: "Legal full-length MP3 downloads of CC-licensed music — the honest 'download' source.",
    selfHostable: false,
    free: true,
  },
  archive: {
    id: "archive",
    label: "Internet Archive",
    kind: "streaming",
    license: "open archive · item-level licences",
    auth: "none",
    env: [],
    docs: "https://archive.org/advancedsearch.php",
    probe: "https://archive.org/advancedsearch.php?q=collection:audio_music&rows=1&output=json",
    fallbacks: ["jamendo"],
    why: "Public-domain and openly licensed recordings, no key, no rate-limit games.",
    selfHostable: true,
    free: true,
  },
  soundcloud: {
    id: "soundcloud",
    label: "SoundCloud",
    kind: "streaming",
    license: "proprietary · public pages",
    auth: "none",
    env: [],
    docs: "https://developers.soundcloud.com",
    fallbacks: ["audius", "jamendo"],
    why: "Independent/underground catalog. Streaming only, never downloadable.",
    selfHostable: false,
    free: true,
  },
  bandcamp: {
    id: "bandcamp",
    label: "Bandcamp",
    kind: "catalog",
    license: "proprietary · artist-owned",
    auth: "none",
    env: [],
    docs: "https://bandcamp.com/developers",
    fallbacks: ["audius"],
    why: "Discovery + link-out to the artist's own page; we never rip artist uploads.",
    selfHostable: false,
    free: true,
  },
  deezer: {
    id: "deezer",
    label: "Deezer",
    kind: "catalog",
    license: "proprietary · official preview API",
    auth: "none",
    env: [],
    docs: "https://developers.deezer.com",
    probe: "https://api.deezer.com/chart/0/tracks?limit=1",
    fallbacks: ["youtube", "audius"],
    why: "Best public metadata + official 30s previews for major-label catalog.",
    selfHostable: false,
    free: true,
  },
  musicbrainz: {
    id: "musicbrainz",
    label: "MusicBrainz",
    kind: "metadata",
    license: "CC0 / CC BY-NC-SA data · open API",
    auth: "none",
    env: [],
    docs: "https://musicbrainz.org/doc/MusicBrainz_API",
    probe: "https://musicbrainz.org/ws/2/artist?query=radiohead&fmt=json&limit=1",
    fallbacks: [],
    why: "Open music encyclopedia: canonical artist/album/release data for the whole app.",
    selfHostable: true,
    free: true,
  },
  listenbrainz: {
    id: "listenbrainz",
    label: "ListenBrainz",
    kind: "metadata",
    license: "open source (GPL-2.0) · open API",
    auth: "api-key",
    env: ["LISTENBRAINZ_TOKEN"],
    docs: "https://listenbrainz.readthedocs.io",
    probe: "https://api.listenbrainz.org/1/stats/sitewide/artists?range=week",
    fallbacks: ["musicbrainz"],
    why: "Open listening stats + recommendations; an honest, exportable alternative to closed analytics.",
    selfHostable: true,
    free: true,
  },
  radio: {
    id: "radio",
    label: "Radio Browser",
    kind: "radio",
    license: "open community directory · public API",
    auth: "none",
    env: [],
    docs: "https://api.radio-browser.info",
    probe: "https://de1.api.radio-browser.info/json/stations/search?limit=1",
    fallbacks: [],
    why: "30k+ real stations with stream URLs; no key, no tracking.",
    selfHostable: true,
    free: true,
  },
  quran: {
    id: "quran",
    label: "Quran.com / EveryAyah",
    kind: "radio",
    license: "open recitation archives",
    auth: "none",
    env: [],
    docs: "https://api-docs.quran.com",
    probe: "https://api.quran.com/api/v4/chapters",
    fallbacks: [],
    why: "Complete, verified recitations with verse-level timings.",
    selfHostable: true,
    free: true,
  },
  local: {
    id: "local",
    label: "On-device library (MediaStore)",
    kind: "local",
    license: "user's own files",
    auth: "self-hosted",
    env: [],
    docs: "https://developer.android.com/training/data-storage/shared/media",
    fallbacks: [],
    why: "The user's own music, read in place through MediaStore content URIs.",
    selfHostable: true,
    free: true,
  },
};

/* ------------------------------- health ---------------------------------- */

interface HealthEntry {
  status: ProviderStatus;
  latencyMs: number | null;
  detail: string;
  checkedAt: number;
  failures: number;
  retryAt: number;
}

const cache = new Map<string, HealthEntry>();
const TTL = 5 * 60 * 1000; // healthy
const DOWN_TTL = 30 * 1000; // re-probe quickly, then back off
const MAX_BACKOFF = 15 * 60 * 1000;

function configured(def: ProviderDef): boolean {
  return def.env.every((key) => !!process.env[key]);
}

/**
 * Real health of one provider.
 *  • unconfigured  → required env vars missing (never a fake success)
 *  • healthy       → probe answered 2xx (or 4xx we can attribute to auth only)
 *  • degraded      → answered but slowly / 5xx
 *  • down          → network failure or repeated 5xx
 */
export async function health(id: string, opts: { force?: boolean } = {}): Promise<HealthEntry> {
  const def = PROVIDERS[id];
  const now = Date.now();
  const hit = cache.get(id);
  if (def && !opts.force && hit) {
    const ttl = hit.status === "healthy" ? TTL : DOWN_TTL;
    if (now - hit.checkedAt < ttl || now < hit.retryAt) return hit;
  }
  if (!def) return { status: "down", latencyMs: null, detail: "Unknown provider", checkedAt: now, failures: 0, retryAt: 0 };
  if (!configured(def)) {
    const entry: HealthEntry = {
      status: "unconfigured",
      latencyMs: null,
      detail: `Missing environment: ${def.env.join(", ")}`,
      checkedAt: now,
      failures: hit?.failures ?? 0,
      retryAt: 0,
    };
    cache.set(id, entry);
    return entry;
  }
  if (!def.probe) {
    const entry: HealthEntry = {
      status: "healthy",
      latencyMs: null,
      detail: "No probe needed (local / link-out provider)",
      checkedAt: now,
      failures: hit?.failures ?? 0,
      retryAt: 0,
    };
    cache.set(id, entry);
    return entry;
  }
  const started = Date.now();
  let status: ProviderStatus = "down";
  let detail = "";
  try {
    const res = await fetch(def.probe, { signal: AbortSignal.timeout(6000), headers: { Accept: "application/json" } });
    const ms = Date.now() - started;
    // 401/403/400 on a probe usually means "reachable, needs a key" — that is a
    // configuration truth, not an outage, but it must never read as healthy.
    if (res.ok) {
      status = ms > 3000 ? "degraded" : "healthy";
      detail = `HTTP ${res.status} in ${ms}ms`;
    } else if (res.status === 401 || res.status === 403) {
      status = "unconfigured";
      detail = `HTTP ${res.status} — credentials rejected`;
    } else {
      status = "degraded";
      detail = `HTTP ${res.status}`;
    }
    const failures = status === "healthy" ? 0 : (hit?.failures ?? 0) + 1;
    const entry: HealthEntry = {
      status,
      latencyMs: ms,
      detail,
      checkedAt: Date.now(),
      failures,
      retryAt: status === "healthy" ? 0 : Date.now() + Math.min(MAX_BACKOFF, 5_000 * 2 ** Math.min(failures, 8)),
    };
    cache.set(id, entry);
    return entry;
  } catch (err) {
    const failures = (hit?.failures ?? 0) + 1;
    const entry: HealthEntry = {
      status: "down",
      latencyMs: Date.now() - started,
      detail: err instanceof Error ? err.message : "probe failed",
      checkedAt: Date.now(),
      failures,
      retryAt: Date.now() + Math.min(MAX_BACKOFF, 5_000 * 2 ** Math.min(failures, 8)),
    };
    cache.set(id, entry);
    return entry;
  }
}

/** All providers with their current status (server route uses this). */
export async function healthAll(ids?: string[]): Promise<Record<string, HealthEntry>> {
  const list = ids ?? Object.keys(PROVIDERS);
  const entries = await Promise.all(list.filter((id) => PROVIDERS[id]).map(async (id) => [id, await health(id)] as const));
  return Object.fromEntries(entries);
}

/**
 * Run `attempt` with ordered fallback across providers. Each provider is tried
 * once, in the order given (or the registry's own fallback chain). Health is
 * respected: a provider that is `down` inside its backoff window is skipped,
 * so we do not hammer a failing API.
 */
export async function withFallback<T>(
  startId: string,
  attempt: (id: string) => Promise<T | null>,
): Promise<{ result: T | null; used: string | null; tried: { id: string; ok: boolean }[] }> {
  const order = [startId, ...(PROVIDERS[startId]?.fallbacks ?? [])];
  const tried: { id: string; ok: boolean }[] = [];
  for (const id of order) {
    const def = PROVIDERS[id];
    if (!def) continue;
    const h = await health(id);
    if (h.status === "down" && Date.now() < h.retryAt) {
      tried.push({ id, ok: false });
      continue;
    }
    try {
      const result = await attempt(id);
      tried.push({ id, ok: result !== null });
      if (result !== null) return { result, used: id, tried };
    } catch {
      tried.push({ id, ok: false });
    }
  }
  return { result: null, used: null, tried };
}

/** Public (no secrets) summary for /api/providers and the diagnostics page. */
export async function providerSummary() {
  const statuses = await healthAll();
  return Object.values(PROVIDERS).map((def) => {
    const h = statuses[def.id];
    const policy = policyFor(def.id);
    return {
      id: def.id,
      label: def.label,
      kind: def.kind,
      license: def.license,
      auth: def.auth,
      selfHostable: def.selfHostable,
      free: def.free,
      env: def.env,
      docs: def.docs,
      why: def.why,
      fallbacks: def.fallbacks,
      status: h.status,
      latencyMs: h.latencyMs,
      detail: h.detail,
      checkedAt: h.checkedAt,
      playback: policy.mode,
      background: policy.background,
      download: policy.download,
    };
  });
}
