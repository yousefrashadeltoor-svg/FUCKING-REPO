// ============================================================================
//  Google / YouTube — REAL OAuth 2.0 + YouTube Data API v3.
//  ---------------------------------------------------------------------------
//  Nothing here invents data. If the deployment has no Google credentials the
//  API reports `configured: false` and the UI says exactly that instead of
//  faking a login. When configured, the flow is the official web-server flow:
//    /api/youtube/auth  →  accounts.google.com  →  /api/youtube/callback
//  and every subsequent call uses the user's own access token against
//  googleapis.com/youtube/v3 (scopes: youtube.readonly, userinfo.profile).
// ============================================================================

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/youtube/v3";

/**
 * Scopes we ask for, and why (no more than needed to make the UI real):
 *   youtube          → subscriptions, playlists, ratings, channel data
 *   youtube.force-ssl→ comments / comment threads (write)
 *   youtube.upload   → uploading a video the user owns
 *   openid/email/profile → identity shown in the profile header
 * Read-only is NOT enough for subscribe/like/comment/upload, which is why the
 * previous `youtube.readonly` build could not deliver those features at all.
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/youtube.upload",
  "openid",
  "email",
  "profile",
].join(" ");

/** Scopes the UI can honestly offer as "connected" features. */
export const CAPABILITIES = {
  read: "https://www.googleapis.com/auth/youtube.readonly",
  write: "https://www.googleapis.com/auth/youtube",
  comments: "https://www.googleapis.com/auth/youtube.force-ssl",
  upload: "https://www.googleapis.com/auth/youtube.upload",
};

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  apiKey: string | null;
}

export function googleConfig(origin: string): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/youtube/callback`;
  return { clientId, clientSecret, redirectUri, apiKey: process.env.YOUTUBE_API_KEY ?? null };
}

export function isConfigured(origin: string): boolean {
  return googleConfig(origin) !== null;
}

/** Build the consent URL. `state` protects against CSRF (checked on callback). */
export function consentUrl(origin: string, state: string): string | null {
  const cfg = googleConfig(origin);
  if (!cfg) return null;
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope?: string;
  token_type?: string;
}

export async function exchangeCode(origin: string, code: string): Promise<TokenSet | null> {
  const cfg = googleConfig(origin);
  if (!cfg) return null;
  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope?: string; token_type?: string };
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + (json.expires_in ?? 3600) * 1000,
    scope: json.scope,
    token_type: json.token_type,
  };
}

export async function refreshTokens(origin: string, refreshToken: string): Promise<TokenSet | null> {
  const cfg = googleConfig(origin);
  if (!cfg) return null;
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token: string; expires_in: number; scope?: string };
  return {
    access_token: json.access_token,
    refresh_token: refreshToken,
    expires_at: Date.now() + (json.expires_in ?? 3600) * 1000,
    scope: json.scope,
  };
}

/**
 * Token transport: an httpOnly, SameSite=Lax cookie holding the token set.
 * The access token never touches client JavaScript.
 */
export const TOKEN_COOKIE = "dm_google_tokens";
export const STATE_COOKIE = "dm_google_state";

export function encodeTokens(t: TokenSet): string {
  return Buffer.from(JSON.stringify(t), "utf8").toString("base64url");
}

export function decodeTokens(raw: string | undefined): TokenSet | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as TokenSet;
    return obj?.access_token ? obj : null;
  } catch {
    return null;
  }
}

/** Bearer-token call to the Data API (used by routes that already resolved a token). */
export async function ytFetch<T>(
  path: string,
  params: Record<string, string>,
  accessToken: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ data: T | null; error?: string; status: number }> {
  const url = `${API}/${path}?${new URLSearchParams(params).toString()}`;
  try {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let message = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string; errors?: { reason?: string }[] } };
        if (parsed.error?.message) message = parsed.error.message;
      } catch {
        if (text) message = `${message}: ${text.slice(0, 160)}`;
      }
      return { data: null, status: res.status, error: message };
    }
    if (res.status === 204) return { data: null, status: 204 };
    return { data: (await res.json()) as T, status: res.status };
  } catch (err) {
    return { data: null, status: 0, error: err instanceof Error ? err.message : "network error" };
  }
}

/** Authenticated YouTube Data API call (auto-refreshes on 401). */
export async function ytApi<T>(
  origin: string,
  tokens: TokenSet,
  path: string,
  params: Record<string, string>,
): Promise<{ data: T | null; tokens: TokenSet; error?: string; status: number }> {
  const run = async (t: TokenSet) => {
    const url = `${API}/${path}?${new URLSearchParams(params).toString()}`;
    return fetch(url, {
      headers: { Authorization: `Bearer ${t.access_token}`, Accept: "application/json" },
      cache: "no-store",
    });
  };

  let current = tokens;
  if (current.expires_at < Date.now() + 30_000 && current.refresh_token) {
    const renewed = await refreshTokens(origin, current.refresh_token);
    if (renewed) current = renewed;
  }
  let res = await run(current);
  if (res.status === 401 && current.refresh_token) {
    const renewed = await refreshTokens(origin, current.refresh_token);
    if (renewed) {
      current = renewed;
      res = await run(current);
    }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { data: null, tokens: current, status: res.status, error: `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}` };
  }
  return { data: (await res.json()) as T, tokens: current, status: res.status };
}

/* ------------------------------ API shapes ------------------------------ */

export interface YtChannel {
  id: string;
  snippet: {
    title: string;
    description?: string;
    customUrl?: string;
    publishedAt?: string;
    thumbnails?: Record<string, { url: string; width: number; height: number }>;
    country?: string;
  };
  statistics?: { viewCount?: string; subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string };
  brandingSettings?: { image?: { bannerExternalUrl?: string } };
}

export interface YtSubscriptionItem {
  snippet: { title: string; description?: string; resourceId: { channelId: string }; thumbnails?: Record<string, { url: string }> };
}

export interface YtPlaylistItem {
  id: string;
  snippet: { title: string; description?: string; publishedAt?: string; thumbnails?: Record<string, { url: string }>; channelTitle?: string };
  contentDetails?: { itemCount?: number };
}

export interface YtVideoItem {
  id: string;
  snippet: {
    title: string;
    channelTitle: string;
    channelId: string;
    publishedAt?: string;
    thumbnails?: Record<string, { url: string }>;
    description?: string;
  };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string; likeCount?: string };
}

/** "PT1H2M3S" → seconds */
export function isoDuration(iso: string | undefined): number {
  if (!iso) return 0;
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

export function bestThumb(thumbs?: Record<string, { url: string }>): string | null {
  if (!thumbs) return null;
  const order = ["maxres", "standard", "high", "medium", "default"];
  for (const k of order) if (thumbs[k]?.url) return thumbs[k].url;
  return Object.values(thumbs)[0]?.url ?? null;
}
