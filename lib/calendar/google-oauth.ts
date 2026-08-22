import { createHash, randomBytes } from "node:crypto";

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.owned";
export const GOOGLE_CALENDAR_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_CALENDAR_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_CALENDAR_REVOCATION_ENDPOINT = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_CALENDAR_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const googleCalendarRedirectOutcomes = new Set([
  "cancelled", "connected", "error", "exchange_failed", "forbidden",
  "invalid_callback", "invalid_state", "reconsent_required", "unavailable"
]);

export function buildGoogleCalendarSettingsRedirectPath(outcome: string) {
  const safeOutcome = googleCalendarRedirectOutcomes.has(outcome) ? outcome : "error";
  return `/dashboard/settings/integrations?google=${safeOutcome}`;
}

export function createGoogleCalendarOAuthState() {
  const state = randomBytes(32).toString("base64url");
  return { state, stateHash: hashGoogleCalendarOAuthState(state) };
}

export function hashGoogleCalendarOAuthState(state: string) {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

export function hashGoogleCalendarSessionBinding(sessionId: string) {
  if (!sessionId || sessionId.length > 4096 || /[\u0000-\u001f\u007f]/.test(sessionId)) {
    throw new Error("Invalid authentication session binding.");
  }
  return createHash("sha256").update(sessionId, "utf8").digest("hex");
}

export function isValidGoogleCalendarOAuthState(value: string | null | undefined) {
  return Boolean(value && /^[A-Za-z0-9_-]{43}$/.test(value));
}

export function isValidGoogleAuthorizationCode(value: string | null | undefined) {
  return Boolean(value && value.length >= 8 && value.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(value));
}

export function buildGoogleCalendarAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const url = new URL(GOOGLE_CALENDAR_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", input.state);
  return url.toString();
}

export function parseGrantedGoogleCalendarScopes(value: unknown) {
  if (typeof value !== "string") return [];
  return [...new Set(value.split(/\s+/).filter(Boolean))].sort();
}

export function hasRequiredGoogleCalendarScope(scopes: readonly string[]) {
  return scopes.length === 1 && scopes[0] === GOOGLE_CALENDAR_SCOPE;
}

type GoogleTokenPayload = {
  access_token?: unknown;
  refresh_token?: unknown;
  scope?: unknown;
};

export function parseGoogleCalendarTokenExchange(input: {
  responseOk: boolean;
  body: unknown;
}) {
  const payload = input.body && typeof input.body === "object" ? input.body as GoogleTokenPayload : null;
  const accessToken = payload?.access_token;
  const rawRefreshToken = payload?.refresh_token;
  const scopes = parseGrantedGoogleCalendarScopes(payload?.scope);
  const refreshTokenAbsent = rawRefreshToken === undefined || rawRefreshToken === null;
  const validAccessToken = typeof accessToken === "string" && accessToken.length > 0 && accessToken.length <= 8192;
  const validRefreshToken = typeof rawRefreshToken === "string" && rawRefreshToken.length > 0 && rawRefreshToken.length <= 8192;

  if (!input.responseOk || !validAccessToken || (!refreshTokenAbsent && !validRefreshToken) || !hasRequiredGoogleCalendarScope(scopes)) {
    return {
      ok: false as const,
      code: input.responseOk ? "invalid_token_response" as const : "exchange_failed" as const,
      refreshTokenToRevoke: validRefreshToken ? rawRefreshToken : null
    };
  }

  return {
    ok: true as const,
    accessToken,
    refreshToken: validRefreshToken ? rawRefreshToken : null,
    scopes
  };
}
