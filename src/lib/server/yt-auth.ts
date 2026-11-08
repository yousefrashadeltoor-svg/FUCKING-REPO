// ============================================================================
//  Server helper: the signed-in listener + their Google access token.
//  Routes never see a token from the browser; they call this.
// ============================================================================
import { getCurrentUser } from "./session";
import { getAccessToken, getAccount, canPersistTokens } from "./oauth-store";
import { isConfigured } from "./google";

export interface Viewer {
  userId: number;
  accessToken: string | null;
}

export async function viewer(origin: string): Promise<Viewer> {
  const user = await getCurrentUser();
  if (user.id < 0) return { userId: -1, accessToken: null };
  const accessToken = await getAccessToken(origin, user.id);
  return { userId: user.id, accessToken };
}

/** Standard "connect your account first" response. */
export function notConnected(extra: Record<string, unknown> = {}) {
  return Response.json(
    {
      ok: false,
      connected: false,
      needsAuth: true,
      error: "Connect your Google / YouTube account first.",
      ...extra,
    },
    { status: 401 },
  );
}

export async function connectionState(origin: string) {
  const user = await getCurrentUser();
  const configured = isConfigured(origin);
  if (user.id < 0) return { configured, connected: false, canPersist: canPersistTokens() };
  const account = await getAccount(user.id);
  return {
    configured,
    connected: !!account?.refreshToken,
    canPersist: canPersistTokens(),
    email: account?.email ?? null,
    name: account?.name ?? null,
    avatarUrl: account?.avatarUrl ?? null,
    scopes: account?.scopes ?? "",
    channelId: account?.channelId ?? null,
    channelTitle: account?.channelTitle ?? null,
  };
}
